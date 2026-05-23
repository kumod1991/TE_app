import sys
import json
import ssl
import asyncio
import random
import http.client
import urllib.parse
from datetime import datetime, timezone

from openscreener import Stock
from playwright.async_api import async_playwright

SUPABASE_URL = "https://munqjcjvzgqyxzlmuyjj.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bnFqY2p2emdxeXh6bG11eWpqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTcwNzk3MSwiZXhwIjoyMDg3MjgzOTcxfQ.-3HzssD7ydHRixYUxL_DMgkOJI2RnTBi_QW-W0mQXOk"

SUPABASE_HOST = urllib.parse.urlparse(SUPABASE_URL).netloc

# ── SSL (Windows-safe) ───────────────────────────────────────
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode    = ssl.CERT_NONE

# ── CONFIG ───────────────────────────────────────────────────

# ⚡ PERFORMANCE CONFIG (optimized)
CONCURRENCY     = 5
FAST_TIMEOUT    = 10000
MAX_RETRIES     = 3

DELAY_BETWEEN   = (0.5,1.5)
DELAY_RETRY     = (1, 2)
DELAY_RATELIMIT = (15, 30)

BATCH_SIZE      = 60
BATCH_BREAK     = (5, 10)

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
]

SUPABASE_HEADERS = {
    "Content-Type": "application/json",
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
}

# ── Screener session cookie (eliminates rate limiting) ────────
# How to get it:
#   1. Log in to screener.in in Chrome
#   2. F12 → Application → Cookies → https://www.screener.in
#   3. Copy the value of the `sessionid` cookie here
SCREENER_SESSION_ID = "vm7pozgsakibchmw1m3a1mczazmpuc65"   # ← paste your sessionid here
 
# ── Supabase (http.client — Windows SSL safe) ────────────────
 
def _sb_request(method, path, body=None, extra_headers=None):
    headers = {**SUPABASE_HEADERS, **(extra_headers or {})}
    encoded = body.encode() if isinstance(body, str) else body
 
    for attempt in range(3):
        try:
            conn = http.client.HTTPSConnection(SUPABASE_HOST, context=ctx, timeout=25)
            conn.request(method, path, body=encoded, headers=headers)
            resp = conn.getresponse()
            data = resp.read().decode()
            conn.close()
            return resp.status, data
        except ssl.SSLError:
            if attempt < 2:
                import time; time.sleep(1)
        except Exception as e:
            print(f"⚠️  Supabase error (attempt {attempt+1}): {e}")
            if attempt < 2:
                import time; time.sleep(2)
    return 0, ""
 
 
def sb_upsert(table, data):
    status, _ = _sb_request(
        "POST", f"/rest/v1/{table}",
        body=json.dumps(data),
        extra_headers={"Prefer": "resolution=merge-duplicates"},
    )
    return status
 
 
def _sb_get_all(table, select, extra_params=""):
    rows, offset, page_size = [], 0, 1000
    while True:
        path = f"/rest/v1/{table}?select={select}&limit={page_size}&offset={offset}{extra_params}"
        status, data = _sb_request("GET", path)
        if status not in (200, 206) or not data:
            break
        page = json.loads(data)
        rows.extend(page)
        if len(page) < page_size:
            break
        offset += page_size
    return rows
 
 
def sb_get_tickers():
    rows = _sb_get_all("company_financials", "ticker")
    seen = set()
    tickers = []
    for r in rows:
        t = r["ticker"]
        if t not in seen:
            seen.add(t)
            tickers.append(t)
    return tickers
 
 
def sb_get_done_tickers():
    return set(r["ticker"] for r in _sb_get_all("company_shareholding", "ticker"))
 
 
# ── Rate limit detection ──────────────────────────────────────
 
def is_rate_limited(content: str) -> bool:
    lower = content.lower()
    return any(s in lower for s in [
        "too many requests", "rate limit", "access denied",
        "cloudflare", "captcha", "unusual traffic",
        "please wait before", "you have been blocked",
    ])
 
 
# ── Human-like mouse movement ─────────────────────────────────
 
async def human_scroll(page):
    """Simulate a human scrolling down the page in steps."""
    total_height = await page.evaluate("document.body.scrollHeight")
    current = 0
    while current < total_height * 0.6:
        step = random.randint(200, 500)
        current += step
        await page.evaluate(f"window.scrollTo(0, {current})")
        await asyncio.sleep(random.uniform(0, 1.5))   # ↓ tightened from (0.3, 0.8)
 
 
# ── CONTEXT POOL ─────────────────────────────────────────────
 
async def make_context(browser):
    """Pre-warmed browser context with cookie + route blocking already set."""
    context = await browser.new_context(
        user_agent=random.choice(USER_AGENTS),
        viewport={"width": 1366, "height": 768},
        locale="en-IN",
        timezone_id="Asia/Kolkata",
        java_script_enabled=True,
        extra_http_headers={
            "Accept-Language": "en-IN,en;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "DNT": "1",
        },
    )
 
    # Inject session cookie on all domain variants before any navigation
    if SCREENER_SESSION_ID:
        cookies = []
        for domain in [".screener.in", "www.screener.in", "screener.in"]:
            cookies.append({
                "name":     "sessionid",
                "value":    SCREENER_SESSION_ID,
                "domain":   domain,
                "path":     "/",
                "secure":   True,
                "httpOnly": True,
                "sameSite": "Lax",
            })
        await context.add_cookies(cookies)
 
    # Block heavy media — keep CSS/JS so page renders normally
    await context.route(
        "**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf,mp4,webp,ico}",
        lambda r: r.abort()
    )
 
    return context
 
 
# ── FETCH ────────────────────────────────────────────────────
 
async def fetch_shareholding(context, symbol):
    """Accepts a pre-built, reused context instead of creating one per ticker."""
    url = f"https://www.screener.in/company/{symbol}/"
 
    for attempt in range(MAX_RETRIES):
        page = await context.new_page()
        try:
            try:
                await page.goto(url, timeout=FAST_TIMEOUT, wait_until="domcontentloaded")
            except Exception as e:
                print(f"  ⚠️  [{symbol}] Page load failed (attempt {attempt+1}): {e}")
                await page.close()
                if attempt < MAX_RETRIES - 1:
                    await asyncio.sleep(random.uniform(*DELAY_RETRY))
                continue
 
            content = await page.content()
 
            if is_rate_limited(content):
                await page.close()
                wait = random.uniform(*DELAY_RATELIMIT)
                print(f"  🚫 [{symbol}] Rate limited — cooling {wait:.0f}s (attempt {attempt+1})")
                await asyncio.sleep(wait)
                continue
 
            if "Shareholding Pattern" not in content:
                print(f"  ⚠️  [{symbol}] No shareholding section (attempt {attempt+1})")
                await page.close()
                if attempt < MAX_RETRIES - 1:
                    await asyncio.sleep(random.uniform(*DELAY_RETRY))
                continue
 
            await human_scroll(page)
            await asyncio.sleep(random.uniform(0.5, 1.0))   # ↓ from (1.0, 2.0)
 
            html = await page.content()
            await page.close()
 
            stock = Stock(symbol, page_html=html)
            quarterly = stock.shareholding_quarterly()
            yearly    = stock.shareholding_yearly()
 
            if not quarterly and not yearly:
                print(f"  ⚠️  [{symbol}] Parsed OK but no data (attempt {attempt+1})")
                if attempt < MAX_RETRIES - 1:
                    await asyncio.sleep(random.uniform(*DELAY_RETRY))
                continue
 
            return True, {
                "name":      (stock.summary() or {}).get("name") or symbol,
                "quarterly": quarterly,
                "yearly":    yearly,
            }
 
        except Exception as e:
            print(f"  ⚠️  [{symbol}] Unexpected error (attempt {attempt+1}): {e}")
            try: await page.close()
            except: pass
            if attempt < MAX_RETRIES - 1:
                await asyncio.sleep(random.uniform(*DELAY_RETRY))
 
    return False, {}
 
 
# ── WORKER ───────────────────────────────────────────────────
 
async def process_ticker(context, semaphore, symbol, counter, total):
    async with semaphore:
        symbol = symbol.strip().upper()
        # No startup stagger needed — contexts are pre-warmed
 
        ok, result = await fetch_shareholding(context, symbol)
 
        async with counter["lock"]:
            counter["done"] += 1
            done = counter["done"]
            if ok:
                counter["saved"] += 1
 
        pct = done * 100 // total
 
        if not ok:
            print(f"  ❌ {symbol} | {done}/{total} ({pct}%)")
            return False
 
        q = len(result["quarterly"])
        y = len(result["yearly"])
 
        row = {
            "ticker":     symbol,
            "name":       result["name"],
            "quarterly":  result["quarterly"],
            "yearly":     result["yearly"],
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }
 
        status = sb_upsert("company_shareholding", row)
 
        if status in (200, 201):
            print(f"  💾 {symbol} ({q}Q/{y}Y) | {done}/{total} ({pct}%) ✅ {counter['saved']} saved")
            await asyncio.sleep(random.uniform(*DELAY_BETWEEN))
            return True
 
        print(f"  ❌ {symbol} DB write failed (status {status}) | {done}/{total}")
        return False
 
 
# ── MAIN ─────────────────────────────────────────────────────
 
async def main(tickers, skip_done=False):
 
    if skip_done:
        print("🔍 Checking already-done tickers...")
        done = sb_get_done_tickers()
        before = len(tickers)
        tickers = [t for t in tickers if t.strip().upper() not in done]
        print(f"⏭️  Skipping {before - len(tickers)} | {len(tickers)} remaining\n")
 
    total = len(tickers)
    if total == 0:
        print("✅ Nothing to do.")
        return
 
    semaphore = asyncio.Semaphore(CONCURRENCY)
    counter   = {"done": 0, "saved": 0, "lock": asyncio.Lock()}
 
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage",
                "--disable-infobars",
                "--window-size=1366,768",
            ],
        )
 
        # Pre-create one context per concurrency slot — reused across ALL batches
        print(f"🚀 Spinning up {CONCURRENCY} browser contexts...")
        contexts = [await make_context(browser) for _ in range(CONCURRENCY)]
        print(f"✅ Contexts ready. Processing {total} tickers...\n")
 
        for batch_start in range(0, total, BATCH_SIZE):
            batch = tickers[batch_start: batch_start + BATCH_SIZE]
 
            if batch_start > 0:
                wait = random.uniform(*BATCH_BREAK)
                print(f"\n☕ Batch break — resting {wait:.0f}s ({batch_start}/{total} done)...\n")
                await asyncio.sleep(wait)
 
            # Round-robin assign contexts to tasks
            tasks = [
                process_ticker(contexts[i % CONCURRENCY], semaphore, t, counter, total)
                for i, t in enumerate(batch)
            ]
            await asyncio.gather(*tasks)
 
        # Clean up
        for ctx in contexts:
            await ctx.close()
        await browser.close()
 
    print(f"\n✅ Done: {counter['saved']}/{total} saved")
 
 
# ── ENTRY ────────────────────────────────────────────────────
 
if __name__ == "__main__":
    args = sys.argv[1:]
 
    if not args:
        print("Usage:")
        print("  python fetch_shareholding.py RELIANCE TCS INFY")
        print("  python fetch_shareholding.py --all")
        print("  python fetch_shareholding.py --all --skip-done")
        sys.exit(1)
 
    skip_done = "--skip-done" in args
    args      = [a for a in args if a != "--skip-done"]
 
    if "--all" in args:
        print("📋 Fetching tickers from DB...")
        tickers = sb_get_tickers()
        print(f"   {len(tickers)} tickers found\n")
    else:
        tickers = args
 
    asyncio.run(main(tickers, skip_done=skip_done))