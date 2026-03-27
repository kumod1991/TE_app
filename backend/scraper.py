"""
Company IR Document Scraper
============================
Reads website URLs from company_financials table,
crawls each company's investor relations pages,
extracts links to annual reports, concall transcripts,
investor presentations, press releases and quarterly results,
then saves them to company_documents table.

Crawl strategy (3 levels):
  Level 0 — company homepage
  Level 1 — IR index pages discovered from homepage nav / known hint paths
  Level 2 — document listing pages found on IR index pages
             (e.g. /investor-relations/quarterly-results → individual PDF links)

Requirements:
    pip install playwright supabase
    playwright install chromium
"""

import re
import time
import logging
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from urllib.parse import urljoin, urlparse

from supabase import create_client, Client
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SUPABASE_URL = "https://munqjcjvzgqyxzlmuyjj.supabase.co"
SUPABASE_KEY = "sb_publishable_zpf4KVLsjBTmAPAxre2zYA_NxqWXT4V"

DELAY_BETWEEN_COMPANIES = 1   # seconds — be polite
PAGE_TIMEOUT            = 20  # seconds — increased for SPA/AEM sites that need JS hydration
MAX_IR_SUBPAGES         = 10  # max Level-1 IR index pages to visit per company
MAX_LISTING_SUBPAGES    = 8   # max Level-2 document listing pages per IR index page

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
import sys

# Force UTF-8 output on Windows (cp1252 can't encode box-drawing / arrow chars).
# Guard with try/except: spawned child processes may not have a real stdout fileno.
try:
    _utf8_stream = (
        open(sys.stdout.fileno(), mode="w", encoding="utf-8", buffering=1, closefd=False)
        if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8"
        else sys.stdout
    )
except Exception:
    _utf8_stream = sys.stdout
_stream_handler = logging.StreamHandler(stream=_utf8_stream)
_stream_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))

_file_handler = logging.FileHandler("scraper.log", encoding="utf-8")
_file_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))

logging.basicConfig(level=logging.INFO, handlers=[_stream_handler, _file_handler])
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Keyword patterns for document classification
# ---------------------------------------------------------------------------
# Only these doc_types are considered worth saving to the DB.
ACCEPTED_DOC_TYPES = {
    "annual_report",
    "concall",
    "investor_presentation",
    "press_release",
    "quarterly_results",
    "corporate_announcement",
}

DOC_PATTERNS = {
    "annual_report": [
        # Strict: only the main annual report document — not AGM notices, annexures, returns
        r"annual.?report.?(for.?)?(fy|financial.?year|20\d{2}|\d{4})",
        r"\bintegrated.?annual.?report\b",
        r"ar[\-_]?20\d{2}\b",
        r"10-?k\b",
    ],
    "concall": [
        r"concall", r"earnings.?call", r"con.?call",
        r"investor.?call", r"results.?call", r"q[1-4].?call",
        r"transcript", r"audio.?transcript", r"earnings.?conference",
        r"conference.?call",
        r"audio.?recording", r"recording.*call", r"call.*recording",
        r"audio.*concall|concall.*audio",
    ],
    "investor_presentation": [
        r"investor.?presentation", r"investor.?day",
        r"analyst.?day", r"capital.?markets.?day",
        r"result.?presentation", r"corporate.?presentation",
    ],
    "press_release": [
        r"press.?release", r"media.?release", r"news.?release",
    ],
    "quarterly_results": [
        r"q[1-4].?(fy)?20\d{2}", r"quarterly.?result",
        r"financial.?result", r"result.?q[1-4]",
        r"result.?sheet", r"result sheet",
    ],
    "corporate_announcement": [
        r"corporate.?announcement", r"bse.?filing", r"nse.?filing",
        r"board.?meeting", r"notice.?of.?board",
        r"agm", r"egm", r"annual.?general", r"extra.?ordinary.?general",
        r"voting.?result", r"scrutinizer",
        r"dividend", r"bonus.?share", r"stock.?split", r"rights.?issue",
        r"merger", r"acquisition", r"demerger",
        r"regulatory.?filing", r"lodr", r"sebi",
        # Investor/analyst meet intimation letters to exchanges (not actual presentations)
        r"letter.*bse|letter.*nse",           # LettertoBSE..., LettertoBSEandNSE...
        r"intimat.*investor|investor.*intimat",
        r"intimat.*analyst|analyst.*intimat",
        r"investor.?meet", r"analyst.?meet",  # intimation of investors call / meet
    ],
}

# Regex patterns for IR index/listing pages — these pages CONTAIN links to docs
# but are not documents themselves.
# Deliberately strict to avoid pulling in product/blog pages.
IR_LISTING_PATTERNS = re.compile(
    r"(investor.?relation|annual.?report|quarterly.?report|quarterly.?result|financial.?result"
    r"|financial.?statement|concall|transcript|press.?release|investor.?presentation"
    r"|announcements?.and|announcements?.update|financial.?report"
    r"|concall.?transcript|/ir/|/ir$"
    r"|statutory.?comm|board.?meeting|outcome.?board|postal.?ballot"
    r"|sebi.?regulation|disclosure|notice.*board|newspaper.?pub"
    r"|corporate.?governance|/reports/?$|/reports/|/financials$|/financials/)",
    re.I,
)

# Path segments that indicate a page is NOT an IR doc listing
# (even if it superficially matches IR_LISTING_PATTERNS)
NON_IR_PATH_SEGMENTS = re.compile(
    r"/(loans?|insurance|payment|product|blog|abc.of.money|calculator"
    r"|tools?|faq|contact|career|about|login|register|apply|download.app"
    r"|personal.?finance|mutual.?fund|tax)/",
    re.I,
)

# Sub-page path hints — tried against the actual website base URL
# (preserving www subdomain from company_financials.website)
IR_SUBPAGE_HINTS = [

    # core investor pages
    "/investor-relations",
    "/investors",
    "/investor",
    "/ir",
    "/investor-information",
    "/investors-information",
    "/investor-centre",
    "/investor-center",
    "/investor-portal",
    "/investor-desk",
    "/investor-corner",

    # financial information
    "/financial-information",
    "/financials",
    "/financial-results",
    "/financial-reports",
    "/financial-statements",
    "/results",
    "/quarterly-results",
    "/quarterly-result",
    "/quarterly-reports",
    "/earnings",
    "/earnings-results",

    # annual reports
    "/annual-report",
    "/annual-reports",
    "/annual-return",
    "/annual-returns",
    "/annual-report-and-accounts",
    "/reports-and-presentation",
    "/integrated-report",
    "/integrated-reports",
    "/sustainability-report",
    "/sustainability-reports",
    "/business-responsibility-report",
    "/brsr",

    # investor presentations
    "/presentations",
    "/investor-presentations",
    "/investor-presentation",
    "/investor-deck",
    "/corporate-presentation",
    "/analyst-reports",
    "/other-reports",

    # concalls / earnings calls
    "/conference-call",
    "/conference-calls",
    "/earnings-call",
    "/earnings-calls",
    "/concall",
    "/concall-transcripts",
    "/earnings-call-transcripts",
    "/investor-call",

    # announcements
    "/announcements",
    "/corporate-announcements",
    "/company-announcements",
    "/stock-exchange-announcements",
    "/regulatory-filings",
    "/disclosures",
    "/sebi-disclosures",
    "/exchange-filings",

    # shareholding
    "/shareholding-pattern",
    "/shareholding",
    "/shareholding-information",
    "/stock-information",
    "/shareholder-information",
    "/shareholder-services",

    # governance
    "/corporate-governance",
    "/governance",
    "/board-of-directors",
    "/management",
    "/company-policies",
    "/policies",

    # statutory communication
    "/statutory-communication",
    "/statutory-disclosures",
    "/regulatory-disclosures",
    "/sebi-filings",

    # documents / downloads
    "/downloads",
    "/documents",
    "/investor-downloads",
    "/reports",
    "/filings",
    "/investor-documents",

    # media / PR
    "/press-release",
    "/press-releases",
    "/news",
    "/newsroom",
    "/media",

    # contact
    "/investor-contact",
    "/investor-contact-details",
    "/contact-investor-relations",

    # corporate section variations
    "/corporate/investors",
    "/corporate/investor-relations",
    "/corporate-governance/reports",

    # wordpress / CMS patterns
    "/category/investor-relations",
    "/category/investors",
    "/category/announcements",
    "/category/results",
    "/category/financial-results",

    # deeper IR folder patterns
    "/investor-relations/reports",
    "/investor-relations/results",
    "/investor-relations/disclosures",
    "/investor-relations/financial-results",
    "/investor-relations/annual-reports",
    "/investor-relations/presentations",
    "/investor-relations/shareholding-pattern",
    "/investor-relations/financials",
    "/investor-relations/financial-results",
    "/investor-relations/quarterly-results",
    "/investor-relations/company-announcements",
    "/investor-relations/annual-report",

    # /investors/ sub-path variants (AU Bank, Kotak, HDFC style)
    "/investors/annual-reports",
    "/investors/quarterly-reports",
    "/investors/financial-results",
    "/investors/investor-presentations",
    "/investors/press-releases",
    "/investors/concall-transcripts",
    "/investors/corporate-governance",
    "/investors/shareholding-pattern",
    "/investors/reports",

    # AU Bank / SFB style top-level paths
    "/stock-exchange-disclosures",
    "/reports/disclosures",
    "/reports/regulatory-disclosures",
    "/reports/annual-reports",
    "/reports/quarterly-reports",
    "/reports/investor-presentations",
    "/reports/financial-results",

]

# Downloadable document extensions saved to the database.
# PDFs are the primary format; MP3s capture concall audio recordings.
DOC_EXTENSIONS      = (".pdf", ".mp3", ".mp4", ".wav")
AUDIO_EXTENSIONS    = (".mp3", ".mp4", ".wav")
PDF_EXTENSIONS      = (".pdf",)   # kept for backward compat

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


# Pre-compiled DOC_PATTERNS — each type collapsed into one OR-regex.
# Avoids re-compiling on every classify_link() call (called thousands of times per run).
_DOC_PATTERNS_COMPILED: list[tuple[str, re.Pattern]] = [
    (doc_type, re.compile("|".join(f"(?:{p})" for p in patterns), re.I))
    for doc_type, patterns in DOC_PATTERNS.items()
]
_CONCALL_RE = re.compile(r"transcript|concall|earnings.?call|earnings.?conference", re.I)
_LETTER_RE  = re.compile(r"letter.?(to.?)?(bse|nse|exchange)", re.I)
_INTIMAT_RE = re.compile(r"(intimat|letter).*(investor|analyst)|(investor|analyst).*(intimat|letter)", re.I)


def classify_link(url: str, text: str) -> str | None:
    """
    Classify a URL+text pair into a doc_type.

    Special pre-check: "Letter to BSE/NSE" URLs and investor meet intimations
    are corporate announcements even if they contain "investor" or "presentation"
    keywords — checked before the generic DOC_PATTERNS loop.
    """
    combined = (url + " " + text).lower()

    if not _CONCALL_RE.search(combined):
        if _LETTER_RE.search(combined) or _INTIMAT_RE.search(combined):
            return "corporate_announcement"

    for doc_type, pattern in _DOC_PATTERNS_COMPILED:
        if pattern.search(combined):
            return doc_type
    return None


def extract_year(url: str, text: str) -> int | None:
    # Try FY-style years first (FY26 → 2026, FY2026 → 2026)
    m = re.search(r"fy\s*(\d{2,4})", (url + " " + text).lower())
    if m:
        y = int(m.group(1))
        return y if y > 2000 else 2000 + y
    m = re.search(r"20(\d{2})", url + " " + text)
    if m:
        return int("20" + m.group(1))
    return None


# Month name -> number map for date parsing
_MONTHS = {
    "jan":1,"feb":2,"mar":3,"apr":4,"may":5,"jun":6,
    "jul":7,"aug":8,"sep":9,"oct":10,"nov":11,"dec":12,
}


def extract_date(text: str) -> str | None:
    """
    Extract a publication/announcement date from surrounding link text.
    Handles formats seen on Indian IR pages:
      "09th Feb 2026"  ->  "2026-02-09"
      "03rd Feb 2026"  ->  "2026-02-03"
      "22nd Jul 2025"  ->  "2025-07-22"
      "2026-02-09"     ->  "2026-02-09"   (already ISO)
      "09/02/2026"     ->  "2026-02-09"   (DD/MM/YYYY)
    Returns ISO date string "YYYY-MM-DD" or None.
    """
    if not text:
        return None
    t = text.strip()
    # "09th Feb 2026" / "3rd Feb 2026"
    m = re.search(r"(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})\s+(20\d{2})", t)
    if m:
        day, mon, yr = int(m.group(1)), m.group(2).lower()[:3], int(m.group(3))
        if mon in _MONTHS:
            return f"{yr:04d}-{_MONTHS[mon]:02d}-{day:02d}"
    # ISO "2026-02-09"
    m = re.search(r"(20\d{2})-(\d{2})-(\d{2})", t)
    if m:
        return m.group(0)
    # DD/MM/YYYY
    m = re.search(r"(\d{1,2})/(\d{1,2})/(20\d{2})", t)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return f"{y:04d}-{mo:02d}-{d:02d}"
    return None


def is_document_file(url: str) -> bool:
    """
    True if URL points to a saveable IR document: PDF, or concall audio (mp3/mp4/wav).

    Handles:
      1. Plain extension:  /path/file.pdf  /path/audio.mp3
      2. CDN query param:  ?extension=pdf  (Azure CDN, Sitecore, etc.)
      3. CDN /pdf/ path:   azureedge.net/-/media/.../pdf/filename.webp
    """
    url_lower = url.lower()
    path      = url_lower.split("?")[0]

    # Case 1: plain known extension
    if any(path.endswith(ext) for ext in DOC_EXTENSIONS):
        return True

    # Case 2: CDN query string declares extension=pdf
    if re.search(r"[?&]extension=pdf", url_lower):
        return True

    # Case 3: CDN /pdf/ path segment
    cdn_hosts = ("azureedge.net", "akamaized.net", "cloudfront.net",
                 "fastly.net", "blob.core.windows.net", "s3.amazonaws.com")
    if any(h in url_lower for h in cdn_hosts) and "/pdf/" in path:
        return True

    return False


def is_pdf_file(url: str) -> bool:
    """Backward-compat alias — use is_document_file() for new code."""
    url_lower = url.lower()
    path = url_lower.split("?")[0]
    if path.endswith(".pdf"):
        return True
    if re.search(r"[?&]extension=pdf", url_lower):
        return True
    cdn_hosts = ("azureedge.net", "akamaized.net", "cloudfront.net",
                 "fastly.net", "blob.core.windows.net", "s3.amazonaws.com")
    if any(h in url_lower for h in cdn_hosts) and "/pdf/" in path:
        return True
    return False


def is_worth_saving(url: str, doc_type: str | None) -> bool:
    """
    A document is only saved to the DB if:
      1. The URL resolves to a known IR document (PDF or concall audio)
      2. The doc_type is one of the accepted IR categories (not None / "other")
    Audio files (mp3/mp4/wav) are only saved when classified as concall.
    """
    if not is_document_file(url):
        return False
    if doc_type not in ACCEPTED_DOC_TYPES:
        return False
    # Audio files must be concall — don't save random mp3s from unrelated pages
    url_lower = url.lower()
    if any(url_lower.split("?")[0].endswith(ext) for ext in AUDIO_EXTENSIONS):
        return doc_type == "concall"
    return True


def is_ir_listing_page(url: str, text: str) -> bool:
    """True if this link looks like an IR index/listing page (not a direct doc).
    Excludes product/blog/loan pages that superficially match IR keywords."""
    if NON_IR_PATH_SEGMENTS.search(url):
        return False
    return bool(IR_LISTING_PATTERNS.search(url) or IR_LISTING_PATTERNS.search(text))


def normalise_url(base: str, href: str) -> str | None:
    if not href or href.startswith(("mailto:", "tel:", "javascript:", "#")):
        return None
    full = urljoin(base, href.strip())
    # Strip fragment
    full = full.split("#")[0].rstrip("/") or full
    return full if full.startswith("http") else None


def clean_url(url: str) -> str:
    """
    Strip CDN media-format suffixes so we store clean document URLs.
    Azureedge/Sitecore appends .webp?extension=webp&revision=... to doc links.
    """
    if not url:
        return url
    url = re.sub(r'\.webp\?extension=webp[^"\']*$', '', url, flags=re.IGNORECASE)
    url = re.sub(r'\?extension=webp[^"\']*$', '', url, flags=re.IGNORECASE)
    return url.strip()


def same_domain(url1: str, url2: str) -> bool:
    """True if url1 and url2 share the same registered domain.
    Strips www. prefix and ignores http/https difference so that
    http://www.aubank.in and https://au.bank.in are NOT same-domain
    but http://www.site.com and https://site.com ARE.
    """
    def _norm(u):
        n = urlparse(u).netloc.lower()
        return n[4:] if n.startswith("www.") else n
    return _norm(url1) == _norm(url2)


# CSS selectors indicating page content has been JS-hydrated.
# Tried in order — first match means page is ready. 3s timeout each.
_CONTENT_READY_SELECTORS = [
    ".report-row", ".reports-list", ".annualReport", ".report-link",
    "table.ir-table", ".ir-documents", ".document-list",
    ".listing-item", ".doc-item", ".file-list",
    "a[href$='.pdf']", "a[href*='/pdf/']",
]

def load_page(page, url: str, label: str = "", wait_networkidle: bool = False) -> bool:
    """Navigate to URL. Returns True on success.
    For SPA/AEM pages (wait_networkidle=True): waits for known content selectors
    to appear in DOM rather than networkidle (which never fires on analytics-heavy
    sites). Falls back to a 3s fixed delay if no selector matches.
    Detects and rejects Cloudflare challenge pages.
    """
    if is_document_file(url):
        log.debug(f"    Skipping direct document URL: {label or url}")
        return False
    try:
        page.goto(url, timeout=PAGE_TIMEOUT * 1000, wait_until="domcontentloaded")
    except PWTimeout:
        log.warning(f"    Timeout (goto): {label or url}")
        return False
    except Exception as e:
        log.warning(f"    Error loading {label or url}: {e}")
        return False
    if wait_networkidle:
        # Try content-ready selectors — much more reliable than networkidle for SPAs
        content_found = False
        for sel in _CONTENT_READY_SELECTORS:
            try:
                page.wait_for_selector(sel, timeout=3000, state="attached")
                content_found = True
                break
            except Exception:
                continue
        if not content_found:
            page.wait_for_timeout(3000)  # last resort fixed wait
        try:
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            page.wait_for_timeout(500)
        except Exception:
            pass
    # Detect Cloudflare challenge pages (≤3 links, cloudflare in body text)
    try:
        link_count = page.evaluate("() => document.querySelectorAll('a').length")
        if link_count <= 3:
            body = page.evaluate("() => (document.body?.innerText || '').toLowerCase()")
            if "cloudflare" in body or "checking your browser" in body or "just a moment" in body:
                log.warning(f"    Cloudflare block: {label or url} — skipping")
                return False
    except Exception:
        pass
    return True


_JUNK_TEXTS = {
    "download", "click here to view", "click here", "view", "open",
    "pdf", "here", "link", "view pdf", "view document", "read more",
    "read more...", "file -1", "file -2", "file -3", "file -4",
    "file -5", "file -6", "file -7", "na", "option", "",
}

def _is_junk(t: str) -> bool:
    return not t or t.lower().strip() in _JUNK_TEXTS or len(t.strip()) <= 2


def _rich_title_for_anchor(anchor, own_text: str) -> str:
    """
    Given a Playwright element handle, extract the best human-readable title.

    Priority:
      1. Sibling <td> in same <tr> with non-junk text  (title/view table pattern)
      2. Constructed "Section · FY · ColHeader"         (grid table pattern)
      3. own_text if not junk
      4. "" (caller will fall back to URL filename)
    """
    try:
        result = anchor.evaluate("""el => {
            const JUNK = new Set([
                'download','click here to view','click here','view','open',
                'pdf','here','link','view pdf','file -1','file -2','file -3',
                'file -4','file -5','file -6','file -7','na','option',''
            ]);
            const isJunk = t => !t || JUNK.has(t.toLowerCase().trim()) || t.trim().length <= 2;

            const tr = el.closest('tr');
            if (!tr) return '';

            const cells = Array.from(tr.querySelectorAll('td,th')).map(c => c.innerText.trim());

            // Strategy 1: find a sibling cell with meaningful text
            for (const c of cells) {
                if (!isJunk(c)) return c;
            }

            // Strategy 2: grid table — combine section + row label + col header
            const myTd  = el.closest('td,th');
            const allTd = Array.from(tr.querySelectorAll('td,th'));
            const myIdx = myTd ? allTd.indexOf(myTd) : -1;

            const rowLabel = (cells[0] || '').trim();

            let colHeader = '';
            if (myIdx >= 0) {
                const table = tr.closest('table');
                if (table) {
                    const hrows = table.querySelectorAll('thead tr, tr:first-child');
                    for (const hr of hrows) {
                        const hcells = Array.from(hr.querySelectorAll('th,td'));
                        if (hcells[myIdx]) {
                            const ht = hcells[myIdx].innerText.trim();
                            if (!isJunk(ht) && ht.toLowerCase() !== 'option') {
                                colHeader = ht; break;
                            }
                        }
                    }
                }
            }

            // Section heading: look backwards from the table for h1-h4 or big th
            let section = '';
            const table = tr.closest('table');
            if (table) {
                // Check for a first-row caption cell
                const firstTr = table.querySelector('tr:first-child');
                if (firstTr) {
                    const fc = firstTr.querySelectorAll('td[colspan],th[colspan]');
                    if (fc.length > 0) section = fc[0].innerText.trim();
                }
                if (!section) {
                    const cap = table.querySelector('caption');
                    if (cap) section = cap.innerText.trim();
                }
                if (!section) {
                    let prev = table.previousElementSibling;
                    while (prev) {
                        const tag = prev.tagName.toLowerCase();
                        if (['h1','h2','h3','h4'].includes(tag)) {
                            section = prev.innerText.trim(); break;
                        }
                        if (['table','section'].includes(tag)) break;
                        prev = prev.previousElementSibling;
                    }
                }
            }

            if (!rowLabel && !colHeader) return '';

            // Shorten section: strip company name boilerplate
            let sec = section
                .replace(/of\\s+privi.{0,60}(limited|ltd\\.?)/gi, '')
                .replace(/pscl\\s*&?\\s*subsidiaries?/gi, '')
                .replace(/privi\\s+speciality\\s+chemicals\\s+limited/gi, '')
                .replace(/\\s{2,}/g, ' ').trim().replace(/^[-–·\\s]+|[-–·\\s]+$/g,'');

            const colNorm = colHeader
                .replace(/QTR\\s*-\\s*/gi, 'Q')
                .replace(/FILE\\s*-\\s*/gi, 'File ')
                .replace(/\\s+/g,' ').trim();

            const parts = [];
            if (sec && !isJunk(sec)) parts.push(sec);
            if (rowLabel) parts.push(rowLabel);
            if (colNorm && !isJunk(colNorm) && !['option','title','year','financial year'].includes(colNorm.toLowerCase()))
                parts.push(colNorm);

            return parts.join(' · ');
        }""")
        if result and not _is_junk(result):
            return result.strip()
    except Exception:
        pass
    return own_text if not _is_junk(own_text) else ""


def extract_all_links(page, base_url: str) -> list[tuple[str, str, str | None]]:
    """
    Return list of (full_url, rich_title, announcement_date) for every <a href>.

    All anchor data is collected in a SINGLE page.evaluate() call, eliminating
    one CDP round-trip per anchor (was the dominant cost on pages with 200+ links).
    rich_title uses the same table-context strategy as before but executed in-browser.
    """
    try:
        raw_links: list[dict] = page.evaluate(r"""(baseUrl) => {
            const JUNK = new Set([
                'download','click here to view','click here','view','open',
                'pdf','here','link','view pdf','view document','read more',
                'read more...','file -1','file -2','file -3','file -4',
                'file -5','file -6','file -7','na','option',''
            ]);
            const isJunk = t => !t || JUNK.has(t.toLowerCase().trim()) || t.trim().length <= 2;

            const MONTH = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,
                           jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
            function extractDate(txt) {
                if (!txt) return null;
                let m = txt.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})\s+(20\d{2})/);
                if (m) {
                    const mo = MONTH[m[2].toLowerCase().slice(0,3)];
                    if (mo) return `${m[3]}-${String(mo).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
                }
                m = txt.match(/(20\d{2})-(\d{2})-(\d{2})/);
                if (m) return m[0];
                m = txt.match(/(\d{1,2})\/(\d{1,2})\/(20\d{2})/);
                if (m) return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
                return null;
            }

            function richTitle(el, ownText) {
                try {
                    const tr = el.closest('tr');
                    if (!tr) return ownText;
                    const cells = Array.from(tr.querySelectorAll('td,th')).map(c => c.innerText.trim());
                    for (const c of cells) { if (!isJunk(c)) return c; }

                    const myTd  = el.closest('td,th');
                    const allTd = Array.from(tr.querySelectorAll('td,th'));
                    const myIdx = myTd ? allTd.indexOf(myTd) : -1;
                    const rowLabel = (cells[0] || '').trim();
                    let colHeader = '';
                    if (myIdx >= 0) {
                        const table = tr.closest('table');
                        if (table) {
                            for (const hr of table.querySelectorAll('thead tr, tr:first-child')) {
                                const hcells = Array.from(hr.querySelectorAll('th,td'));
                                if (hcells[myIdx]) {
                                    const ht = hcells[myIdx].innerText.trim();
                                    if (!isJunk(ht) && ht.toLowerCase() !== 'option') { colHeader = ht; break; }
                                }
                            }
                        }
                    }
                    let section = '';
                    const table2 = tr.closest('table');
                    if (table2) {
                        const fc = table2.querySelectorAll('tr:first-child td[colspan],tr:first-child th[colspan]');
                        if (fc.length) section = fc[0].innerText.trim();
                        if (!section) { const cap = table2.querySelector('caption'); if (cap) section = cap.innerText.trim(); }
                        if (!section) {
                            let prev = table2.previousElementSibling;
                            while (prev) {
                                if (['H1','H2','H3','H4'].includes(prev.tagName)) { section = prev.innerText.trim(); break; }
                                if (['TABLE','SECTION'].includes(prev.tagName)) break;
                                prev = prev.previousElementSibling;
                            }
                        }
                    }
                    if (!rowLabel && !colHeader) return ownText;
                    const sec = section.replace(/\s{2,}/g,' ').trim().replace(/^[-\u2013\u00b7\s]+|[-\u2013\u00b7\s]+$/g,'');
                    const colNorm = colHeader.replace(/QTR\s*-\s*/gi,'Q').replace(/FILE\s*-\s*/gi,'File ').replace(/\s+/g,' ').trim();
                    const parts = [];
                    if (sec && !isJunk(sec)) parts.push(sec);
                    if (rowLabel) parts.push(rowLabel);
                    if (colNorm && !isJunk(colNorm) && !['option','title','year','financial year'].includes(colNorm.toLowerCase())) parts.push(colNorm);
                    return parts.join(' · ') || ownText;
                } catch(e) { return ownText; }
            }

            const results = [];
            for (const a of document.querySelectorAll('a[href]')) {
                try {
                    const href = a.getAttribute('href') || '';
                    if (!href || /^(mailto:|tel:|javascript:|#)/.test(href)) continue;
                    const ownText = (a.innerText || '').trim();
                    const title   = richTitle(a, ownText);
                    const ctx     = (() => { try { const p = a.closest('tr,li,div,p,section,article'); return p ? p.innerText : ''; } catch(e) { return ''; } })();
                    results.push({ href, title, date: extractDate(ctx) });
                } catch(e) { continue; }
            }
            return results;
        }""", base_url)
    except Exception:
        return []

    results = []
    for item in (raw_links or []):
        try:
            full = normalise_url(base_url, item["href"])
            if not full:
                continue
            results.append((clean_url(full), item.get("title") or "", item.get("date")))
        except Exception:
            continue
    return results


def intercept_pdf_clicks(page, base_url: str) -> list[tuple[str, str]]:
    """
    Last-resort fallback: click JS-only download elements that have no <a href>
    and intercept the resulting network request to get the PDF URL.

    Only called when the static <a href> pass found zero PDF links.
    Capped at 20 elements with a 150ms wait each to keep it fast.
    """
    captured = []

    def handle_route(route):
        url = route.request.url
        if is_pdf_file(url) and url not in captured:
            captured.append(url)
        route.continue_()

    page.route("**/*", handle_route)

    # Only target truly JS-driven elements — no href, or href="#"/void
    selectors = [
        "a:not([href])",
        "a[href='#']",
        "a[href='javascript:void(0)']",
        "[class*='download'][role='button']",
        "[aria-label*='download' i]",
    ]
    elements = []
    seen_els = set()
    for sel in selectors:
        try:
            for el in page.query_selector_all(sel):
                eid = el.evaluate("el => el.outerHTML.slice(0,80)")
                if eid not in seen_els:
                    seen_els.add(eid)
                    elements.append(el)
        except Exception:
            continue

    if elements:
        log.info(f"      Clicking {len(elements)} JS-only elements (fallback)...")

    label_map = {}
    consecutive_misses = 0
    for el in elements[:20]:  # hard cap — 20 × 80ms = 1.6s max
        try:
            txt = ""
            try:
                txt = (el.inner_text() or "").strip() or el.evaluate(
                    "el => el.closest('li,tr,div,p') ? "
                    "el.closest('li,tr,div,p').innerText.slice(0,200) : ''"
                ) or ""
            except Exception:
                pass
            before = len(captured)
            el.click(timeout=2000)
            page.wait_for_timeout(80)   # 80ms is enough for XHR; was 150ms
            new_urls = captured[before:]
            for url in new_urls:
                if url not in label_map:
                    label_map[url] = txt[:300]
            # Stop early if 5 consecutive clicks yield nothing — rest are likely decorative
            if new_urls:
                consecutive_misses = 0
            else:
                consecutive_misses += 1
                if consecutive_misses >= 5:
                    break
        except Exception:
            consecutive_misses += 1
            continue

    try:
        page.unroute("**/*", handle_route)
    except Exception:
        pass

    results = [(url, label_map.get(url, "")) for url in dict.fromkeys(captured)]
    if results:
        log.info(f"      Intercepted {len(results)} PDF URLs via click")
    return results

# ---------------------------------------------------------------------------
# Supabase DB helpers
# ---------------------------------------------------------------------------

def get_companies(sb: Client, tickers: list[str] | None = None, all_tickers: bool = False) -> list[dict]:
    """
    Fetch companies to scrape.
      all_tickers=True  -> every row in company_financials (no website filter)
      tickers=[...]     -> match each input against nse_code first, then ticker
                           (bse_code numeric fallback handled separately)
      default           -> all rows that have a website set

    Returned dicts always include nse_code, bse_code, name, website.
    resolve_ticker() picks the right identifier for company_documents.ticker.
    """
    base_select = "nse_code, bse_code, name, website"

    if not tickers:
        # --all or default mode: single query
        query = sb.table("company_financials").select(base_select)
        if not all_tickers:
            query = query.neq("website", "")
        res = query.execute()
        return res.data or []

    # ── Specific ticker lookup ────────────────────────────────────────────────
    # Try matching input values against nse_code OR ticker (primary key).
    # Use PostgREST OR filter so a single round-trip covers both columns.
    upper = [t.upper() for t in tickers]
    headers = {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    import urllib.parse, urllib.request, json as _json

    # Build OR filter: nse_code=in.(A,B) OR ticker=in.(A,B)
    encoded = ",".join(urllib.parse.quote(t) for t in upper)
    url = (
        f"{SUPABASE_URL}/rest/v1/company_financials"
        f"?select={urllib.parse.quote(base_select)}"
        f"&or=(nse_code.in.({encoded}),ticker.in.({encoded}))"
    )
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as resp:
        found = _json.loads(resp.read())

    # Deduplicate: the OR query returns the same company twice when both
    # nse_code and ticker columns match (e.g. AUBANK). Key by website URL.
    seen_keys: set[str] = set()
    unique: list[dict] = []
    for r in found:
        key = (r.get("website") or "").strip().lower() or (r.get("nse_code") or "").upper()
        if key and key not in seen_keys:
            seen_keys.add(key)
            unique.append(r)
    found = unique

    # Warn about inputs not matched
    matched = set()
    for r in found:
        if r.get("nse_code"): matched.add(r["nse_code"].upper())
    for t in upper:
        if t not in matched:
            log.warning(f"  Not found in DB (tried nse_code & ticker): {t}")

    return found or []


_PROBE_SESSION = requests.Session()
_PROBE_SESSION.headers.update({
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
})
# Raise connection pool size to match ThreadPoolExecutor(max_workers=20)
# — avoids "Connection pool is full, discarding connection" warnings.
_adapter = requests.adapters.HTTPAdapter(pool_connections=20, pool_maxsize=20)
_PROBE_SESSION.mount("http://", _adapter)
_PROBE_SESSION.mount("https://", _adapter)

def probe_hints(website_base: str, hints: list[str], skip_urls: set | None = None) -> list[str]:
    """Return only hint URLs that genuinely exist as distinct IR pages.

    skip_urls: set of URLs already discovered from homepage nav — probing is
    skipped for these since we already know they exist, saving N round-trips.
    Wall-clock cap of 20s prevents any slow server hanging the whole run.
    Tuple timeouts (connect, read) prevent slow TCP accepts from hanging threads.
    """
    from concurrent.futures import TimeoutError as FuturesTimeout

    skip = skip_urls or set()
    hints_to_probe = [h for h in hints if (website_base + h) not in skip]

    def _final_url_is_homepage(resp_url: str) -> bool:
        ru = resp_url.rstrip("/")
        hb = website_base.rstrip("/")
        return ru == hb or ru == hb.replace("http://", "https://")

    _IR_HTML_RE = re.compile(
        r"investor|annual.report|quarterly|concall|transcript"
        r"|presentation|disclosure|shareholding|governance|financial.result",
        re.I,
    )

    def check(hint):
        url = website_base + hint
        try:
            # (connect_timeout, read_timeout) tuple — prevents slow-server thread hangs
            r = _PROBE_SESSION.head(url, timeout=(3, 4), allow_redirects=True)
            if r.status_code >= 400 and r.status_code != 405:
                return None

            r2 = _PROBE_SESSION.get(url, timeout=(3, 4), allow_redirects=True,
                                    stream=True, headers={"Range": "bytes=0-32767"})
            chunk = b""
            for part in r2.iter_content(chunk_size=32768):
                chunk += part
                break
            r2.close()

            if r2.status_code >= 400:
                return None
            if _final_url_is_homepage(r2.url):
                return None

            html_sample = chunk.decode("utf-8", errors="ignore")
            # Accept if HTML has IR keywords OR if the hint path itself is clearly IR.
            # Handles SPAs that serve a minimal HTML shell (keywords load via JS).
            path_looks_ir = bool(re.search(
                r"investor|annual.report|quarterly|concall|transcript"
                r"|presentation|disclosure|shareholding|governance|financial",
                hint, re.I
            ))
            if not _IR_HTML_RE.search(html_sample) and not path_looks_ir:
                return None
            return url
        except Exception:
            return None

    live = []
    with ThreadPoolExecutor(max_workers=20) as pool:
        futures = {pool.submit(check, h): h for h in hints_to_probe}
        try:
            for fut in as_completed(futures, timeout=60):
                result = fut.result()
                if result:
                    live.append(result)
        except FuturesTimeout:
            log.warning("  probe_hints wall-clock timeout — using partial results")

    skipped = len(hints) - len(hints_to_probe)
    log.info(f"  Probed {len(hints_to_probe)} hint paths ({skipped} skipped from nav) → {len(live)} live")

    hint_urls = {website_base + h for h in hints}
    live.sort(key=lambda u: hints.index(u.replace(website_base, "")) if u in hint_urls else 999)
    return live


def resolve_ticker(company: dict) -> str | None:
    """Return the identifier to use for company_documents.ticker.
    Prefers nse_code; falls back to bse_code (as string)."""
    nse = (company.get("nse_code") or "").strip()
    bse = str(company.get("bse_code") or "").strip()
    return nse if nse else (bse if bse else None)


def save_documents(sb: Client, docs: list[dict]):
    if not docs:
        return
    rows = [
        {
            "ticker":     d["ticker"],
            "doc_type":   d["doc_type"],
            "url":        d["url"],
            "title":      d.get("title"),
            "year":              d.get("year"),
            "announcement_date": d.get("announcement_date"),
            "scraped_at":        datetime.now().isoformat(),
        }
        for d in docs
    ]
    # Use ignore_duplicates=True so existing rows (including manually corrected
    # Upsert: insert new rows, UPDATE existing rows (so titles/dates are refreshed)
    sb.table("company_documents").upsert(
        rows,
        on_conflict="ticker,url",
        ignore_duplicates=False,
    ).execute()
    # Log a per-type breakdown for visibility
    from collections import Counter
    breakdown = Counter(r["doc_type"] for r in rows)
    breakdown_str = "  ".join(f"{k}:{v}" for k, v in sorted(breakdown.items()))
    log.info(f"  Saved {len(rows)} PDF documents to DB  [{breakdown_str}]")


# How many days old a scrape can be before we re-scrape
RESCRAPE_AFTER_DAYS = 7

def is_recently_scraped(sb: Client, ticker: str) -> bool:
    """Single-ticker check — used as a fallback. Prefer bulk_recently_scraped() for batches."""
    try:
        res = (
            sb.table("company_documents")
            .select("scraped_at")
            .eq("ticker", ticker)
            .order("scraped_at", desc=True)
            .limit(1)
            .execute()
        )
        if not res.data:
            return False
        scraped_dt = datetime.fromisoformat(res.data[0]["scraped_at"][:19])
        age_days = (datetime.now() - scraped_dt).days
        if age_days < RESCRAPE_AFTER_DAYS:
            log.info(f"  Skipping [{ticker}] — scraped {age_days}d ago (< {RESCRAPE_AFTER_DAYS}d)")
            return True
        return False
    except Exception as e:
        log.warning(f"  Could not check scrape age for {ticker}: {e}")
        return False


def bulk_recently_scraped(sb: Client, tickers: list[str]) -> set[str]:
    """
    One DB query to find all tickers scraped within RESCRAPE_AFTER_DAYS.
    Returns a set of ticker strings to skip.
    Much faster than N individual is_recently_scraped() calls in run().
    """
    if not tickers:
        return set()
    try:
        res = (
            sb.table("company_documents")
            .select("ticker, scraped_at")
            .in_("ticker", tickers)
            .order("scraped_at", desc=True)
            .execute()
        )
        cutoff = datetime.now()
        latest: dict[str, datetime] = {}
        for row in (res.data or []):
            t = row["ticker"]
            dt = datetime.fromisoformat(row["scraped_at"][:19])
            if t not in latest or dt > latest[t]:
                latest[t] = dt
        skip = {t for t, dt in latest.items() if (cutoff - dt).days < RESCRAPE_AFTER_DAYS}
        if skip:
            log.info(f"  Skipping {len(skip)} tickers scraped within last {RESCRAPE_AFTER_DAYS}d")
        return skip
    except Exception as e:
        log.warning(f"  Could not bulk-check scrape age: {e} — will scrape all")
        return set()



def log_failure(sb: Client, ticker: str, website: str, reason: str):
    try:
        sb.table("scraper_failures").insert({
            "ticker":    ticker,
            "website":   website,
            "reason":    reason,
            "failed_at": datetime.now().isoformat(),
        }).execute()
    except Exception as e:
        log.warning(f"  Could not log failure: {e}")

# ---------------------------------------------------------------------------
# Core scraping — 3 levels
# ---------------------------------------------------------------------------

def extract_docs_from_page(links: list[tuple[str, str]], base_url: str) -> tuple[list[dict], list[str]]:
    """
    Given all links on a page, return:
      - docs:        list of document dicts (direct file or classified link)
      - listing_urls: URLs of sub-pages that look like IR listing pages
                      (to crawl one level deeper)
    """
    docs = []
    listing_urls = []
    seen_urls = set()

    for full_url, text, date_str in links:
        if full_url in seen_urls:
            continue
        seen_urls.add(full_url)

        doc_type = classify_link(full_url, text)

        if not same_domain(base_url, full_url):
            # External CDN/cloud link — save only if it's a relevant PDF
            if is_worth_saving(full_url, doc_type):
                docs.append({
                    "url":               full_url,
                    "title":             text[:300] if text else None,
                    "doc_type":          doc_type,
                    "year":              extract_year(full_url, text),
                    "announcement_date": date_str,
                })
            continue

        # Same-domain link
        if is_document_file(full_url):
            # Direct document (PDF or concall audio) — save if accepted category
            if is_worth_saving(full_url, doc_type):
                docs.append({
                    "url":               full_url,
                    "title":             text[:300] if text else None,
                    "doc_type":          doc_type,
                    "year":              extract_year(full_url, text),
                    "announcement_date": date_str,
                })
        elif doc_type or is_ir_listing_page(full_url, text):
            # Non-PDF classified/IR link → may be a listing page with PDFs inside
            listing_urls.append(full_url)

    return docs, listing_urls



def scrape_spa_listing_page(page, url: str, base_url: str, page_doc_type: str | None,
                             visited: set) -> list[dict]:
    """
    Specialist scraper for JS-heavy IR listing pages (tab switchers, FY dropdowns, SPAs).

    Two-pronged approach:
      A) In-page interactions — click tabs/buttons that REVEAL hidden content on the
         SAME page (accordion, pill nav, year-filter buttons). Safe because these
         don't navigate away.
      B) Sub-page traversal — collect all same-domain IR hrefs from the page and
         load each one with page.goto() to harvest its PDF links. This handles the
         AU Bank pattern where each "Annual Report >" chevron is a real href to a
         sub-page, and quarterly reports need a separate URL per FY.

    Crucially: never call el.click() on elements with real hrefs to HTML pages —
    that navigates the browser away and loses the listing-page context.
    """
    docs = []
    seen = set()
    sub_urls: list[str] = []   # HTML sub-pages to visit

    def add_doc(full_url, text, date_str=None):
        if full_url in seen:
            return
        seen.add(full_url)
        doc_type = classify_link(full_url, text) or page_doc_type
        if is_worth_saving(full_url, doc_type):
            docs.append({
                "url":               full_url,
                "title":             text[:300] if text else None,
                "doc_type":          doc_type,
                "year":              extract_year(full_url, text),
                "announcement_date": date_str,
            })

    # Path prefix of the current IR listing page — used to restrict sub-page candidates
    # to genuine children (e.g. /investors/annual-reports/2024-25 is a child of
    # /investors/annual-reports, but /about-us is not).
    _url_path = urlparse(url).path.rstrip("/")

    def harvest(current_url):
        """Collect PDF/audio hrefs and IR sub-page hrefs visible in DOM right now."""
        for full_url, text, date_str in extract_all_links(page, current_url):
            if is_document_file(full_url) or not same_domain(base_url, full_url):
                add_doc(full_url, text, date_str)
            elif same_domain(base_url, full_url) and full_url not in visited and full_url not in sub_urls and full_url != current_url:
                cand_path = urlparse(full_url).path.rstrip("/")
                # Accept as sub-page if:
                # (a) it's a child path of the current IR URL  (e.g. /investors/annual-reports/2024-25)
                # (b) OR it matches IR listing patterns and isn't a junk section
                is_child = cand_path.startswith(_url_path + "/") or cand_path.startswith(_url_path + "?")
                is_ir    = is_ir_listing_page(full_url, text) and not NON_IR_PATH_SEGMENTS.search(full_url)
                if (is_child or is_ir):
                    sub_urls.append(full_url)

    # ── Step 1: wait for initial JS render ───────────────────────────────────
    try:
        page.wait_for_load_state("networkidle", timeout=5000)
    except Exception:
        pass
    harvest(url)

    # ── Step 2: in-page interactions (tabs, pills, FY filter buttons) ────────
    # ONLY click elements that are purely interactive controls (no real href)
    # so we don't accidentally navigate away.
    CLICK_ONLY_SELECTORS = [
        "[role='tab']",
        "[data-cmp-hook-tabs]",           # Adobe AEM/CMS tab buttons
        "li[class*='cmp-tabs']",
        "button[class*='year']", "button[class*='quarter']", "button[class*='fy']",
        "button[class*='filter']", "button[class*='tab']", "button[class*='pill']",
        ".accordion-header", "[class*='accordion'] button",
        "li[class*='tab']", "li[class*='pill']",
        "div[class*='fy']", "div[class*='year']", "span[class*='fy']",
    ]
    clicked = set()
    for sel in CLICK_ONLY_SELECTORS:
        try:
            for el in page.query_selector_all(sel)[:20]:
                try:
                    href = el.get_attribute("href") or ""
                    if href and not href.startswith(("javascript:", "#", "")):
                        continue  # has real href → sub-page traversal handles it
                    eid = el.evaluate("el => el.innerText.slice(0,80) + el.className.slice(0,40)")
                    if eid in clicked:
                        continue
                    clicked.add(eid)
                    el.click(timeout=1500)
                    page.wait_for_timeout(800)  # AEM CMS tabs need longer to re-render
                    harvest(url)
                except Exception:
                    continue
        except Exception:
            continue

    # ── Step 3: FY/year dropdowns — both native <select> and custom div dropdowns ─
    # Intercept all PDF/audio network requests during this phase.
    intercepted: list[str] = []
    def _intercept_route(route):
        req_url = route.request.url
        if is_document_file(req_url) and req_url not in intercepted:
            intercepted.append(req_url)
        route.continue_()
    try:
        page.route("**/*", _intercept_route)
    except Exception:
        pass

    def _click_all_doc_links():
        """After each dropdown change, harvest static links and click icon-only links."""
        harvest(url)
        for dl_el in page.query_selector_all(
            "a[href*='.pdf'], a[href*='.mp3'], "
            "[class*='download']:not(script), [aria-label*='download' i]"
        )[:80]:
            try:
                href = dl_el.get_attribute("href") or ""
                if href and not href.startswith(("javascript:", "#")):
                    full = normalise_url(url, href)
                    if full and is_document_file(full):
                        add_doc(clean_url(full), (dl_el.inner_text() or "").strip())
            except Exception:
                continue

    # 3a: Native <select> dropdowns
    try:
        for sel_el in page.query_selector_all("select")[:5]:
            try:
                options = sel_el.evaluate(
                    "el => Array.from(el.options).map(o => ({v:o.value,t:o.text})).filter(x=>x.v)"
                ) or []
                for opt in options[:20]:
                    try:
                        sel_el.select_option(opt["v"])
                        page.wait_for_timeout(800)
                        _click_all_doc_links()
                    except Exception:
                        continue
            except Exception:
                continue
    except Exception:
        pass

    # 3b: Custom dropdowns (div/li/button-based year selectors — Angel One, HDFC style)
    # These show a visible label like "FY2026" and expand on click to show options.
    try:
        custom_dd_selectors = [
            "[class*='dropdown'] [class*='option']",
            "[class*='dropdown'] li",
            "[class*='select'] li",
            "[class*='filter'] li",
            "[class*='year'] li", "[class*='fy'] li",
            "ul[class*='option'] li", "ul[class*='dropdown'] li",
            # Angel One specific: year options in custom select
            ".custom-select li", ".custom-dropdown li",
            "[role='option']", "[role='listbox'] [role='option']",
        ]
        for sel in custom_dd_selectors:
            try:
                opts = page.query_selector_all(sel)
                if not opts:
                    continue
                log.info(f"      [SPA] custom dropdown '{sel}' → {len(opts)} options")
                for opt_el in opts[:20]:
                    try:
                        opt_el.click(timeout=1500)
                        page.wait_for_timeout(800)
                        _click_all_doc_links()
                    except Exception:
                        continue
            except Exception:
                continue
    except Exception:
        pass

    # 3c: Click the custom dropdown trigger first (to open it), then pick options
    try:
        triggers = page.query_selector_all(
            "[class*='dropdown-toggle'], [class*='select-trigger'], "
            "[class*='dropdown-btn'], [aria-haspopup='listbox'], "
            "[aria-expanded]"
        )
        for trigger in triggers[:3]:
            try:
                trigger.click(timeout=1500)
                page.wait_for_timeout(300)
                # Now pick all visible options
                for opt_el in page.query_selector_all("[role='option'], [class*='option']:visible")[:20]:
                    try:
                        opt_el.click(timeout=1500)
                        page.wait_for_timeout(800)
                        _click_all_doc_links()
                    except Exception:
                        continue
            except Exception:
                continue
    except Exception:
        pass

    try:
        page.unroute("**/*", _intercept_route)
    except Exception:
        pass
    for req_url in intercepted:
        add_doc(req_url, "")

    # ── Step 4: visit sub-pages discovered from hrefs on this page ───────────
    # This is the key step for AU Bank: each "Annual Report >" and "Q1 >" link
    # points to a distinct sub-URL; navigate there and harvest PDFs directly.
    for sub_url in sub_urls[:MAX_LISTING_SUBPAGES * 4]:  # larger cap for SPA sub-pages
        if sub_url in visited:
            continue
        visited.add(sub_url)
        log.info(f"      [SPA-sub] {sub_url}")
        if not load_page(page, sub_url, label=sub_url, wait_networkidle=True):
            continue
        sub_doc_type = classify_link(sub_url, "") or _infer_page_context(page, sub_url) or page_doc_type
        for full_url, text, date_str in extract_all_links(page, sub_url):
            if is_document_file(full_url) or not same_domain(base_url, full_url):
                if full_url not in seen:
                    seen.add(full_url)
                    doc_type = classify_link(full_url, text) or sub_doc_type
                    if is_worth_saving(full_url, doc_type):
                        docs.append({
                            "url":               full_url,
                            "title":             text[:300] if text else None,
                            "doc_type":          doc_type,
                            "year":              extract_year(full_url, text),
                            "announcement_date": date_str,
                        })

    log.info(f"      [SPA] {url} → {len(docs)} docs  ({len(sub_urls)} sub-pages visited)")
    return docs

def scrape_listing_page(page, url: str, base_url: str, visited: set) -> list[dict]:
    """
    Level 2: Load a specific IR listing page and extract all PDF document links.

    Two-pass approach:
      Pass 1 — extract plain <a href> PDF links (static)
      Pass 2 — click JS download buttons and intercept network requests (dynamic)

    Uses infer_doc_type_from_page_context: if a PDF link has no classifiable
    doc_type from its own URL/text, inherit the type from the page heading
    (e.g. a PDF on the quarterly-results page is quarterly_results).
    """
    if url in visited:
        return []
    visited.add(url)
    log.info(f"    [L2] {url}")
    if not load_page(page, url, label=url, wait_networkidle=True):
        return []

    # Infer a fallback doc_type from the page URL/title for unclassified PDFs
    page_doc_type = classify_link(url, "") or _infer_page_context(page, url)

    docs = []
    seen = set()

    def add_doc(full_url, text, date_str=None):
        if full_url in seen:
            return
        seen.add(full_url)
        doc_type = classify_link(full_url, text) or page_doc_type
        if is_worth_saving(full_url, doc_type):
            docs.append({
                "url":               full_url,
                "title":             text[:300] if text else None,
                "doc_type":          doc_type,
                "year":              extract_year(full_url, text),
                "announcement_date": date_str,
            })

    child_listing_urls = []

    # Pass 1: static <a href> links (covers most sites including CDN hrefs)
    for full_url, text, date_str in extract_all_links(page, url):
        if is_document_file(full_url) or not same_domain(base_url, full_url):
            add_doc(full_url, text, date_str)
        elif (
            same_domain(base_url, full_url)
            and is_ir_listing_page(full_url, text)
            and not NON_IR_PATH_SEGMENTS.search(full_url)
            and full_url != url
        ):
            # Queue as an L3 sub-page (e.g. /investor-relations/annual-reports
            # discovered from /investor-relations/reports)
            child_listing_urls.append(full_url)

    # Pass 2: JS-click fallback (href="#" / no-href buttons) — only if static found nothing
    if not docs:
        for full_url, text in intercept_pdf_clicks(page, url):
            add_doc(full_url, text)

    # Pass 3: SPA/tab/dropdown handler — for pages where tabs or year dropdowns
    # gate the PDF links behind JS interactions (e.g. AU Bank annual/quarterly reports).
    # Only invoked when both previous passes yielded zero documents.
    if not docs:
        spa_docs = scrape_spa_listing_page(page, url, base_url, page_doc_type, visited)
        docs.extend(spa_docs)

    # L3: recurse into child listing pages found on this page (one level deep)
    for child_url in list(dict.fromkeys(child_listing_urls))[:MAX_LISTING_SUBPAGES]:
        if child_url in visited:
            continue
        visited.add(child_url)
        log.info(f"      [L3] {child_url}")
        if not load_page(page, child_url, label=child_url):
            continue
        child_page_doc_type = classify_link(child_url, "") or _infer_page_context(page, child_url)
        for full_url, text, date_str in extract_all_links(page, child_url):
            if is_document_file(full_url) or not same_domain(base_url, full_url):
                doc_type = classify_link(full_url, text) or child_page_doc_type
                if full_url not in seen and is_worth_saving(full_url, doc_type):
                    seen.add(full_url)
                    docs.append({
                        "url":               full_url,
                        "title":             text[:300] if text else None,
                        "doc_type":          doc_type,
                        "year":              extract_year(full_url, text),
                        "announcement_date": date_str,
                    })

    log.info(f"      -> {len(docs)} docs found")
    return docs


# Pre-compiled context inference rules: (regex, doc_type) pairs checked in order.
# Applied to both the page URL and the page heading text.
_INFER_URL_RULES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"quarterly.?result|financial.?result|financial.?statement", re.I), "quarterly_results"),
    (re.compile(r"annual.?report|ar.?20\d{2}", re.I),                               "annual_report"),
    (re.compile(r"annual.?return", re.I),                                            "corporate_announcement"),
    (re.compile(r"concall|transcript|earnings.?call", re.I),                        "concall"),
    (re.compile(r"investor.?presentation", re.I),                                   "investor_presentation"),
    (re.compile(r"investor.?meet|analyst.?meet", re.I),                             "corporate_announcement"),
    (re.compile(r"board.?meeting|outcome.?board|board.?outcome|notice", re.I),      "corporate_announcement"),
    (re.compile(r"sebi|lodr|disclosure|statutory|postal.?ballot", re.I),            "corporate_announcement"),
    (re.compile(r"press.?release|media", re.I),                                     "press_release"),
    (re.compile(r"announcement|update", re.I),                                      "corporate_announcement"),
]
_INFER_HEADING_RULES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"annual.?report", re.I),                                           "annual_report"),
    (re.compile(r"financial.?result|quarterly.?result|financial.?statement", re.I), "quarterly_results"),
    (re.compile(r"board.?meeting|outcome.?board|board.?outcome", re.I),             "corporate_announcement"),
    (re.compile(r"notice|postal.?ballot|agm|egm|general.?meeting", re.I),          "corporate_announcement"),
    (re.compile(r"sebi|lodr|disclosure|statutory.?comm", re.I),                    "corporate_announcement"),
    (re.compile(r"concall|transcript|earnings.?call|investor.?call", re.I),        "concall"),
    (re.compile(r"investor.?presentation", re.I),                                  "investor_presentation"),
    (re.compile(r"investor.?meet|analyst.?meet", re.I),                            "corporate_announcement"),
    (re.compile(r"press.?release", re.I),                                          "press_release"),
    (re.compile(r"announcement|disclosure|communication|report", re.I),            "corporate_announcement"),
]


def _infer_page_context(page, url: str) -> str | None:
    """
    Guess the doc_type category for PDFs found on a listing page.
    First checks the URL path (pre-compiled rules), then reads the visible heading.
    """
    for pattern, doc_type in _INFER_URL_RULES:
        if pattern.search(url):
            return doc_type

    # ── Read visible heading from the page ───────────────────────────────────
    heading_text = ""
    try:
        # Single JS call to grab the first non-trivial heading — much faster
        # than N separate query_selector + inner_text round-trips.
        heading_text = page.evaluate("""() => {
            const sels = ['h1','h2','h3','.page-title','.section-title',
                          'table th:first-child','td.heading','.entry-title',
                          '[class*="title"]'];
            for (const s of sels) {
                const el = document.querySelector(s);
                if (el) {
                    const t = (el.innerText || '').trim();
                    if (t.length > 4) return t.toLowerCase();
                }
            }
            return '';
        }""") or ""
    except Exception:
        pass

    if heading_text:
        for pattern, doc_type in _INFER_HEADING_RULES:
            if pattern.search(heading_text):
                return doc_type

    return None


def scrape_ir_page(page, url: str, base_url: str, visited: set) -> list[dict]:
    """
    Level 1: Load an IR index page, collect direct docs AND discover
    listing sub-pages to crawl one level deeper (Level 2).

    Two-pass on L1 as well:
      Pass 1 — static <a href> links + discover child listing pages
      Pass 2 — click-intercept for JS-driven PDF downloads on this same page
               (many IR pages load PDFs via XHR/fetch rather than plain hrefs)

    Child listing pages (L2) must be strict sub-paths of the current IR URL
    to avoid drifting into unrelated sections (e.g. /loans/press-releases when
    we are on /investor-relations/quarterly-results).
    """
    if url in visited:
        return []
    visited.add(url)
    log.info(f"  [L1] {url}")

    if not load_page(page, url, label=url, wait_networkidle=True):
        return []

    # Parsed path of this IR page — used to restrict child candidates
    ir_path = urlparse(url).path.rstrip("/")

    # Infer fallback doc_type from the page URL/heading (e.g. /investors/annual-reports
    # → annual_report). Used when link text is empty (icon-only chevron links).
    page_doc_type = classify_link(url, "") or _infer_page_context(page, url)

    def add_doc(docs_list, seen_set, full_url, text, date_str=None):
        if full_url in seen_set:
            return
        seen_set.add(full_url)
        doc_type = classify_link(full_url, text) or page_doc_type
        if is_worth_saving(full_url, doc_type):
            docs_list.append({
                "url":               full_url,
                "title":             text[:300] if text else None,
                "doc_type":          doc_type,
                "year":              extract_year(full_url, text),
                "announcement_date": date_str,
            })

    docs = []
    seen = set()
    listing_urls = []

    # Pass 1: static links
    links = extract_all_links(page, url)
    for full_url, text, date_str in links:
        if full_url in seen:
            continue
        doc_type = classify_link(full_url, text)
        if not same_domain(base_url, full_url):
            # External CDN — capture if relevant PDF
            add_doc(docs, seen, full_url, text, date_str)
        elif is_document_file(full_url):
            add_doc(docs, seen, full_url, text, date_str)
        else:
            if full_url in visited or not same_domain(base_url, full_url):
                continue
            cand_path  = urlparse(full_url).path.rstrip("/")
            is_sub     = cand_path.startswith(ir_path + "/")
            is_ir      = bool(doc_type or is_ir_listing_page(full_url, text))
            blocked    = bool(NON_IR_PATH_SEGMENTS.search(full_url))
            # Accept as L2 candidate if same-domain IR page reachable from here.
            # No longer requires strict sub-path — catches flat structures like
            # /reports linking to /annual-reports, /investor-presentations etc.
            if is_ir and not blocked:
                listing_urls.append(full_url)

    # Pass 2: JS-click fallback — only if static pass found zero PDFs
    if not docs:
        for full_url, text in intercept_pdf_clicks(page, url):
            add_doc(docs, seen, full_url, text)

    # Pass 3: SPA tab/dropdown handler — for JS-gated L1 pages
    if not docs:
        l1_doc_type = classify_link(url, "") or _infer_page_context(page, url)
        spa_docs = scrape_spa_listing_page(page, url, base_url, l1_doc_type, visited)
        for d in spa_docs:
            if d["url"] not in seen:
                seen.add(d["url"])
                docs.append(d)

    # Level 2: crawl strict child listing pages
    child_listings = [u for u in dict.fromkeys(listing_urls)
                      if u not in visited][:MAX_LISTING_SUBPAGES]

    log.info(f"    Queued {len(child_listings)} L2 listing pages")
    for listing_url in child_listings:
        level2_docs = scrape_listing_page(page, listing_url, base_url, visited)
        docs.extend(level2_docs)

    return docs


def scrape_company(page, company: dict) -> list[dict]:
    """Main entry: crawl homepage → IR pages → listing pages for one company."""
    ticker  = resolve_ticker(company)
    name    = company.get("name", ticker)
    website = company["website"].strip()
    if not website.startswith("http"):
        website = "https://" + website

    log.info(f"Scraping [{ticker}] {name} -> {website}")
    all_docs   = []
    visited    = set()

    # ── Level 0: homepage ────────────────────────────────────────────────────
    if not load_page(page, website, label="homepage"):
        return []

    # Use the post-redirect URL as base — handles http→https and
    # www.aubank.in→au.bank.in style redirects so same_domain works correctly.
    actual_base = page.url.rstrip("/") or website.rstrip("/")
    if actual_base != website.rstrip("/"):
        log.info(f"  Redirected to {actual_base} (was {website})")
    website      = actual_base   # update for all downstream use
    website_base = actual_base

    homepage_links = extract_all_links(page, website)

    # Discover Level-1 IR pages:
    # (a) known hint paths appended to base domain
    # (b) links found on homepage that look like IR sections
    ir_urls = []
    # website_base already set above from post-redirect URL

    # (b) First collect IR URLs already visible in the homepage nav — these are
    # known-good so probe_hints can skip them, saving ~N HEAD round-trips.
    nav_ir_urls: set[str] = set()
    for full_url, text, _date in homepage_links:
        if not same_domain(website, full_url):
            continue
        if is_document_file(full_url):
            continue   # PDF/audio — not a listing page, skip to avoid "Download is starting"
        if is_ir_listing_page(full_url, text):
            nav_ir_urls.add(full_url)
            if full_url not in ir_urls:
                ir_urls.append(full_url)

    # (a) Probe hint paths — skip any already discovered from homepage nav
    probed = probe_hints(website_base, IR_SUBPAGE_HINTS, skip_urls=nav_ir_urls)
    ir_urls.extend(u for u in probed if u not in set(ir_urls))

    # Fallback: if probe found nothing (e.g. DNS/firewall blocked the requests session
    # but Playwright can reach the site), use the browser to visit the top-level
    # investor hub and discover IR sub-pages from its nav links.
    if not probed:
        log.info("  probe_hints returned 0 — using browser for IR discovery")
        ir_set = set(ir_urls)
        for hub in ["/investors", "/investor-relations", "/ir", "/reports"]:
            hub_url = website_base + hub
            if hub_url in visited:
                continue
            if load_page(page, hub_url, label=hub, wait_networkidle=True):
                visited.add(hub_url)
                for full_url, text, date_str in extract_all_links(page, hub_url):
                    if not same_domain(website, full_url):
                        continue
                    if is_document_file(full_url):
                        doc_type = classify_link(full_url, text)
                        if is_worth_saving(full_url, doc_type):
                            all_docs.append({
                                "url": full_url, "title": text[:300] if text else None,
                                "doc_type": doc_type, "year": extract_year(full_url, text),
                                "announcement_date": date_str, "ticker": ticker,
                            })
                        continue
                    if full_url in ir_set:
                        continue
                    path_is_ir = bool(re.search(
                        r"/(investor|annual.report|quarterly.report|concall|transcript"
                        r"|presentation|disclosure|shareholding|financial|reports.and)",
                        full_url.lower()
                    ))
                    if (is_ir_listing_page(full_url, text) or path_is_ir) and not NON_IR_PATH_SEGMENTS.search(full_url):
                        ir_urls.append(full_url)
                        ir_set.add(full_url)

    # Also grab any direct doc links from the homepage itself
    homepage_docs, _ = extract_docs_from_page(homepage_links, website)
    for d in homepage_docs:
        d["ticker"] = ticker
    all_docs.extend(homepage_docs)

    # ── Levels 1 & 2: IR index pages → listing pages ─────────────────────────
    for ir_url in ir_urls[:MAX_IR_SUBPAGES]:
        docs = scrape_ir_page(page, ir_url, website, visited)
        for d in docs:
            d["ticker"] = ticker
        all_docs.extend(docs)

    # ── Deduplicate by URL ────────────────────────────────────────────────────
    seen_urls = set()
    unique_docs = []
    for d in all_docs:
        if d["url"] not in seen_urls:
            seen_urls.add(d["url"])
            unique_docs.append(d)

    log.info(f"  ✓ {len(unique_docs)} total unique documents for {ticker}")
    return unique_docs

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Parallel scraping via multiprocessing
# ---------------------------------------------------------------------------
# Playwright's sync API is greenlet/thread-affine: you cannot call any
# Playwright object (browser, context, page) from a thread other than the
# one that created it.  ThreadPoolExecutor therefore causes the
# "cannot switch to a different thread" greenlet crash seen with --all.
#
# Fix: each worker is a separate OS process with its own Playwright instance.
# PARALLEL_WORKERS controls how many companies are scraped simultaneously.
# Set to 1 to disable parallelism (useful for debugging single tickers).
PARALLEL_WORKERS = 3


def _make_page(context):
    """Create a new page with junk-resource blocking applied."""
    _BLOCKED_TYPES = {"image", "media", "font", "stylesheet"}
    _BLOCKED_HOSTS_RE = re.compile(
        r"(google-analytics|googletagmanager|doubleclick|facebook\.net"
        r"|hotjar|clarity\.ms|cdn\.jsdelivr\.net/npm/bootstrap"
        r"|cdn\.jsdelivr\.net/npm/jquery)",
        re.I,
    )
    page = context.new_page()

    def _block_junk(route):
        if route.request.resource_type in _BLOCKED_TYPES:
            route.abort()
        elif _BLOCKED_HOSTS_RE.search(route.request.url):
            route.abort()
        else:
            route.continue_()

    page.route("**/*", _block_junk)
    return page


def _worker_process(companies_chunk: list[dict], force: bool, worker_id: int, total: int):
    """
    Run in a child process: owns its own Playwright browser + Supabase client.
    Playwright sync API is safe here because it is always called from the
    single thread that owns the event loop in this process.
    """
    # Re-create the Supabase client in the child (clients aren't picklable)
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage",
                "--no-sandbox",
                "--disable-features=IsolateOrigins,site-per-process",
            ]
        )
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1366, "height": 768},
            locale="en-IN",
            timezone_id="Asia/Kolkata",
            extra_http_headers={
                "Accept-Language": "en-IN,en;q=0.9",
                "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": '"Windows"',
            },
        )
        context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4,5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-IN', 'en'] });
            window.chrome = { runtime: {} };
        """)
        page = _make_page(context)

        for i, company in enumerate(companies_chunk, 1):
            ticker = resolve_ticker(company)
            log.info(f"\n[worker-{worker_id}  {i}/{len(companies_chunk)}  total~{total}] ---")
            try:
                docs = scrape_company(page, company)
                if docs:
                    save_documents(sb, docs)
                else:
                    log_failure(sb, ticker, company["website"], "no_documents_found")
            except Exception as e:
                log.error(f"  Unexpected error for {ticker}: {e}")
                log_failure(sb, ticker, company["website"], str(e))
            time.sleep(DELAY_BETWEEN_COMPANIES)

        browser.close()


def run(companies: list[dict], sb: Client, force: bool = False):
    """Scrape companies — parallel via multiprocessing when PARALLEL_WORKERS > 1."""
    import multiprocessing

    # Filter companies before spawning any processes (one bulk DB query)
    valid = [(resolve_ticker(c), c) for c in companies]
    for t, c in valid:
        if not c.get("website"):
            log.warning(f"  [{t}] No website set — skipping")

    has_website = [(t, c) for t, c in valid if c.get("website")]
    skip_tickers = bulk_recently_scraped(sb, [t for t, _ in has_website]) if not force else set()
    to_scrape = [c for t, c in has_website if t not in skip_tickers]

    if not to_scrape:
        log.info("  Nothing to scrape (all recently scraped or no websites).")
        return

    total   = len(to_scrape)
    workers = min(PARALLEL_WORKERS, total)

    if workers == 1:
        # Fast path: no process overhead for single-ticker runs
        _worker_process(to_scrape, force, worker_id=1, total=total)
        return

    log.info(f"  Splitting {total} companies across {workers} processes")

    # Distribute companies round-robin across workers for even load
    chunks = [to_scrape[i::workers] for i in range(workers)]

    processes = []
    for i, chunk in enumerate(chunks, 1):
        p = multiprocessing.Process(
            target=_worker_process,
            args=(chunk, force, i, total),
            daemon=True,
        )
        p.start()
        processes.append(p)

    for p in processes:
        p.join()

    log.info(f"  All {workers} worker processes finished")


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Scrape IR documents for Indian listed companies.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Scrape a single ticker
  python scraper.py ABCAPITAL

  # Scrape multiple tickers
  python scraper.py ABCAPITAL RELIANCE HDFCBANK

  # Scrape all companies that have a website
  python scraper.py --all
""",
    )
    parser.add_argument(
        "tickers",
        nargs="*",
        metavar="TICKER",
        help="One or more NSE tickers to scrape (e.g. ABCAPITAL RELIANCE).",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Scrape all companies in company_financials that have a website.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help=f"Force re-scrape even if scraped within last {RESCRAPE_AFTER_DAYS} days.",
    )
    args = parser.parse_args()

    if not args.all and not args.tickers:
        parser.error("Provide at least one TICKER or pass --all.  Use -h for help.")

    log.info("Connecting to Supabase...")
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    log.info("Connected!")

    if args.all:
        companies = get_companies(sb, all_tickers=True)
    else:
        companies = get_companies(sb, tickers=args.tickers)

    if not companies:
        log.error("No companies found — nothing to scrape.")
        return

    log.info(f"Scraping {len(companies)} company/companies...")
    run(companies, sb, force=args.force)
    log.info("\nDone!")


if __name__ == "__main__":
    main()
