"""
fetch_shareholding.py  —  Pull shareholding data from screener.in → Supabase  [v2 — async fix]
===============================================================================================
Source:  openscreener (scrapes screener.in via Playwright async API)

The previous version used PlaywrightScraper (sync API) which fails with:
  "It looks like you are using Playwright Sync API inside the asyncio loop."
This version uses async_playwright directly and passes the fetched HTML to
Stock(page_html=...) to avoid the sync/async conflict entirely.

Usage:
    python fetch_shareholding.py RELIANCE
    python fetch_shareholding.py RELIANCE TCS INFY HDFCBANK
    python fetch_shareholding.py --all          # all tickers in company_financials

Output table: company_shareholding
    ticker      TEXT  (PK)
    name        TEXT
    quarterly   JSONB
    yearly      JSONB
    fetched_at  TIMESTAMPTZ

Requirements:
    pip install openscreener playwright
    playwright install chromium
"""

import sys, json, asyncio, urllib.request, urllib.error, ssl
from datetime import datetime, timezone

# ── Config ─────────────────────────────────────────────────────────────────────
SUPABASE_URL = "https://munqjcjvzgqyxzlmuyjj.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bnFqY2p2emdxeXh6bG11eWpqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTcwNzk3MSwiZXhwIjoyMDg3MjgzOTcxfQ.-3HzssD7ydHRixYUxL_DMgkOJI2RnTBi_QW-W0mQXOk"

ctx = ssl.create_default_context()

# ── Supabase helpers (sync, stdlib only) ───────────────────────────────────────
def sb_upsert(table, data):
    body = json.dumps(data).encode()
    req  = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{table}",
        data=body,
        headers={
            "Content-Type": "application/json",
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Prefer":        "resolution=merge-duplicates",
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=20) as r:
            return r.status
    except urllib.error.HTTPError as e:
        print(f"    ❌ Supabase {e.code}: {e.read().decode()[:200]}")
        return e.code
    except Exception as e:
        print(f"    ❌ Supabase error: {e}")
        return 0

def sb_get_tickers():
    """Fetch all tickers from company_financials, paginating past the 1000-row default limit."""
    tickers = []
    offset  = 0
    page_size = 1000

    while True:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/company_financials?select=ticker&limit={page_size}&offset={offset}",
            headers={
                "apikey":        SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Range-Unit":    "items",
            }
        )
        with urllib.request.urlopen(req, context=ctx, timeout=20) as r:
            page = json.loads(r.read().decode())

        tickers.extend(row["ticker"] for row in page)

        if len(page) < page_size:
            break   # last page — we're done
        offset += page_size

    return tickers

# ── Async fetch via Playwright + openscreener parser ──────────────────────────
async def fetch_shareholding_async(symbol: str):
    """
    1. Launch Playwright (async) and grab the raw HTML from screener.in
    2. Pass that HTML to Stock(page_html=...) — no sync Playwright call needed
    Returns (success: bool, result: dict)
    """
    try:
        from openscreener import Stock
        from playwright.async_api import async_playwright
    except ImportError:
        print("    ❌ Missing dependencies.")
        print("       Run: pip install openscreener playwright && playwright install chromium")
        sys.exit(1)

    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            page    = await browser.new_page()
            url     = f"https://www.screener.in/company/{symbol}/"
            await page.goto(url, timeout=30000, wait_until="networkidle")
            html    = await page.content()
            await browser.close()

        # Stock accepts pre-fetched HTML — no Playwright sync calls inside
        stock     = Stock(symbol, page_html=html)
        quarterly = stock.shareholding_quarterly()
        yearly    = stock.shareholding_yearly()

        try:
            name = (stock.summary() or {}).get("name") or symbol
        except Exception:
            name = symbol

        if not quarterly and not yearly:
            return False, {}

        return True, {"name": name, "quarterly": quarterly, "yearly": yearly}

    except Exception as e:
        print(f"    ⚠️  openscreener error: {e}")
        return False, {}

# ── Per-ticker orchestration ───────────────────────────────────────────────────
async def process_ticker(symbol: str) -> bool:
    symbol = symbol.strip().upper()
    print(f"\n{'─'*50}")
    print(f"  Fetching shareholding: {symbol}")
    print(f"{'─'*50}")

    print("  → screener.in via openscreener...", end=" ", flush=True)
    ok, result = await fetch_shareholding_async(symbol)

    if not ok:
        print("❌ no data returned")
        print(f"  ⛔ Skipping {symbol}")
        return False

    q = len(result.get("quarterly") or [])
    y = len(result.get("yearly") or [])
    print(f"✅  ({q} quarterly, {y} yearly snapshots)")

    row = {
        "ticker":     symbol,
        "name":       result["name"],
        "quarterly":  result["quarterly"],
        "yearly":     result["yearly"],
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }

    print(f"  → Upserting to Supabase (company_shareholding)...", end=" ", flush=True)
    status = sb_upsert("company_shareholding", row)
    if status in (200, 201):
        print("✅  Done")
        return True
    else:
        print(f"❌  HTTP {status}")
        return False

async def main(tickers: list):
    success = 0
    for t in tickers:
        if await process_ticker(t):
            success += 1
    print(f"\n✅ Completed {success}/{len(tickers)} ticker(s) successfully.")

# ── Entry point ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        print("Usage: python fetch_shareholding.py TICKER [TICKER2 ...] [--all]")
        sys.exit(1)

    if "--all" in args:
        print("Fetching all tickers from company_financials...")
        tickers = sb_get_tickers()
        print(f"Found {len(tickers)} tickers")
    else:
        tickers = [a for a in args if not a.startswith("--")]

    asyncio.run(main(tickers))
