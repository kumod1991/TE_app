"""
fetch_financials.py  —  Pull financials from IndianAPI → Supabase  [v5 — full named fields]
================================================================================================
Usage:
    python fetch_financials.py RELIANCE TCS INFY
    python fetch_financials.py --all          # all tickers in company_financials
    python fetch_financials.py --recent       # tickers with earnings result >5 days ago, not yet fetched
    python fetch_financials.py --recent --days 3   # custom days threshold (default: 5)

Ticker resolution order (per row in DB):
    1. bse_code   (preferred — most reliable on IndianAPI)
    2. nse_code
    3. ticker     (fallback)

Updates ALL columns EXCEPT sector and industry.

Setup:
    1. pip install python-dotenv yfinance requests
    2. Create a .env file in the same folder:
           SUPABASE_URL=https://xxxx.supabase.co
           SUPABASE_KEY=your_service_role_key
           INDIANAPI_KEY=sk-live-xxxx
"""

import sys, json, urllib.request, urllib.error, ssl, os, argparse, time, random
from datetime import datetime, timezone, date, timedelta

try:
    import requests as _requests
    _REQUESTS_AVAILABLE = True
except ImportError:
    _REQUESTS_AVAILABLE = False

# ── Load .env ──────────────────────────────────────────────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

INDIANAPI_KEY  = os.getenv("INDIANAPI_KEY",  "sk-live-zoCOeV2yzUvY8puqGHbyNJcG7mBP4aGlFGJAEaWa")
INDIANAPI_BASE = "https://stock.indianapi.in"

SUPABASE_URL   = os.getenv("SUPABASE_URL",   "https://munqjcjvzgqyxzlmuyjj.supabase.co")
SUPABASE_KEY   = os.getenv("SUPABASE_KEY",   "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bnFqY2p2emdxeXh6bG11eWpqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTcwNzk3MSwiZXhwIjoyMDg3MjgzOTcxfQ.-3HzssD7ydHRixYUxL_DMgkOJI2RnTBi_QW-W0mQXOk")

missing = [k for k, v in {
    "SUPABASE_URL": SUPABASE_URL,
    "SUPABASE_KEY": SUPABASE_KEY,
    "INDIANAPI_KEY": INDIANAPI_KEY,
}.items() if not v]

if missing:
    print(f"❌  Missing env vars: {', '.join(missing)}")
    print("    Add them to a .env file:")
    print("        SUPABASE_URL=https://xxxx.supabase.co")
    print("        SUPABASE_KEY=your_service_role_key")
    print("        INDIANAPI_KEY=sk-live-xxxx")
    sys.exit(1)

ctx = ssl.create_default_context()

# ── IndianAPI helpers ──────────────────────────────────────────────────────────

# Browser-like headers to bypass Cloudflare 1010 bot detection
_CF_HEADERS = {
    "User-Agent":       "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/124.0.0.0 Safari/537.36",
    "Accept":           "application/json, text/plain, */*",
    "Accept-Language":  "en-US,en;q=0.9",
    # NOTE: Do NOT set Accept-Encoding here.
    # requests handles gzip/br decompression automatically when this header is absent.
    "Connection":       "keep-alive",
    "Sec-Fetch-Dest":   "empty",
    "Sec-Fetch-Mode":   "cors",
    "Sec-Fetch-Site":   "same-origin",
    "Sec-Ch-Ua":        '"Chromium";v="124", "Google Chrome";v="124"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
}

# Shared requests.Session — reuses TCP connection, carries cookies across calls
_ia_session = None

def _get_ia_session():
    global _ia_session
    if _ia_session is None:
        if not _REQUESTS_AVAILABLE:
            return None
        _ia_session = _requests.Session()
        _ia_session.headers.update(_CF_HEADERS)
        _ia_session.headers["X-Api-Key"] = INDIANAPI_KEY
    return _ia_session


def ia_get(path, _retry=0):
    url = f"{INDIANAPI_BASE}{path}"

    # ── Try requests (Cloudflare-friendly) ──────────────────────────────────
    session = _get_ia_session()
    if session:
        try:
            if _retry > 0:
                time.sleep(2 ** _retry + random.uniform(0.5, 1.5))
            r = session.get(url, timeout=20)
            if r.status_code == 200:
                try:
                    return 200, r.json()
                except Exception:
                    for enc in ("utf-8", "latin-1"):
                        try:
                            return 200, json.loads(r.content.decode(enc))
                        except Exception:
                            continue
                    print(f"    ⚠️  Could not decode JSON from IndianAPI response for {path!r}")
                    return 0, None
            if r.status_code == 429 and _retry < 3:
                wait = int(r.headers.get("Retry-After", 10))
                print(f"    ⏳ Rate-limited — waiting {wait}s before retry {_retry+1}/3...")
                time.sleep(wait)
                return ia_get(path, _retry=_retry + 1)
            print(f"    ⚠️  IndianAPI HTTP {r.status_code} for {path!r}: {r.text[:300]}")
            return r.status_code, None
        except Exception as e:
            print(f"    ⚠️  IndianAPI requests error for {path!r}: {e}")

    # ── urllib fallback ──────────────────────────────────────────────────────
    req = urllib.request.Request(url, headers={**_CF_HEADERS, "X-Api-Key": INDIANAPI_KEY})
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=20) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode()[:300]
        except Exception:
            pass
        print(f"    ⚠️  IndianAPI HTTP {e.code} for {path!r}: {body}")
        return e.code, None
    except Exception as e:
        print(f"    ⚠️  IndianAPI connection error for {path!r}: {e}")
        return 0, None


# ── IndianAPI field extractor ─────────────────────────────────────────────────
def ia_fval(period_map, key):
    """Extract float value from IndianAPI stockFinancialMap list by key."""
    if not period_map:
        return None
    for item in period_map:
        if item.get("key") == key:
            v = item.get("value")
            try:    return float(v)
            except: return None
    return None


# ── Mappers ───────────────────────────────────────────────────────────────────
def map_pl(period):
    """Map one IndianAPI period → P&L schema (values already in ₹ Cr)."""
    m   = (period.get("stockFinancialMap") or {}).get("INC") or []
    f   = lambda k: ia_fval(m, k)
    rev = f("Revenue") or f("TotalRevenue")
    cogs= f("CostofRevenueTotal")
    dep = f("Depreciation/Amortization")
    opinc = f("OperatingIncome")
    pbt = f("NetIncomeBeforeTaxes")
    tax = f("ProvisionforIncomeTaxes")
    ni  = f("NetIncome")
    ebitda = (opinc + dep) if (opinc is not None and dep is not None) else None
    gp  = f("GrossProfit") or ((rev - cogs) if (rev and cogs) else None)
    return {
        "_period":          period.get("EndDate", ""),
        "_type":            period.get("Type", "Annual"),
        "Revenue":          rev,
        "COGS":             cogs,
        "GrossProfit":      gp,
        "EmployeeExpenses": None,
        "OtherExpenses":    f("OtherOperatingExpensesTotal"),
        "TotalExpenses":    f("TotalOperatingExpense"),
        "SGA":              f("Selling/General/AdminExpensesTotal"),
        "Depreciation":     dep,
        "EBIT":             opinc,
        "EBITDA":           ebitda,
        "InterestExpense":  f("InterestInc(Exp)Net-Non-OpTotal"),
        "OtherIncome":      f("OtherNet"),
        "PBT":              pbt,
        "Tax":              tax,
        "NetIncome":        ni,
        "EPS":              f("DilutedEPSExcludingExtraOrdItems") or f("DilutedNormalizedEPS"),
        "DilutedShares":    f("DilutedWeightedAverageShares"),
        "DPS":              f("DPS-CommonStockPrimaryIssue"),
    }


def map_bs(period):
    """Map one IndianAPI period → Balance Sheet schema (values already in ₹ Cr)."""
    m   = (period.get("stockFinancialMap") or {}).get("BAL") or []
    f   = lambda k: ia_fval(m, k)
    std   = f("NotesPayable/ShortTermDebt") or 0
    cpltd = f("CurrentPortofLTDebt/CapitalLeases") or 0
    ltd   = f("TotalLongTermDebt") or 0
    total_debt = std + cpltd + ltd
    return {
        "_period":              period.get("EndDate", ""),
        "_type":                period.get("Type", "Annual"),
        # Assets
        "TotalAssets":          f("TotalAssets"),
        "TotalCurrentAssets":   f("TotalCurrentAssets"),
        "Cash":                 f("Cash"),
        "CashEquivalents":      f("CashEquivalents"),
        "CashAndShortTerm":     f("CashandShortTermInvestments"),
        "ShortTermInvestments": f("ShortTermInvestments"),
        "Inventories":          f("TotalInventory"),
        "TradeReceivables":     f("AccountsReceivable-TradeNet") or f("TotalReceivablesNet"),
        "OtherCurrentAssets":   f("OtherCurrentAssetsTotal"),
        "PrepaidExpenses":      f("PrepaidExpenses"),
        "FixedAssets":          f("Property/Plant/EquipmentTotal-Net"),
        "FixedAssetsGross":     f("Property/Plant/EquipmentTotal-Gross"),
        "AccumDepreciation":    f("AccumulatedDepreciationTotal"),
        "Goodwill":             f("GoodwillNet"),
        "OtherIntangibles":     f("IntangiblesNet"),
        "LongTermInvestments":  f("LongTermInvestments"),
        "OtherLongTermAssets":  f("OtherLongTermAssetsTotal"),
        "NoteReceivableLT":     f("NoteReceivable-LongTerm"),
        # Liabilities
        "TotalLiabilities":     f("TotalLiabilities"),
        "TotalCurrentLiab":     f("TotalCurrentLiabilities"),
        "TradePayables":        f("AccountsPayable"),
        "AccruedExpenses":      f("AccruedExpenses"),
        "BorrowingsCurrent":    round(std + cpltd, 2),
        "OtherCurrentLiab":     f("OtherCurrentliabilitiesTotal"),
        "LongTermDebt":         f("TotalLongTermDebt"),
        "TotalDebt":            round(total_debt, 2) if total_debt else None,
        "DeferredTaxLiab":      f("DeferredIncomeTax"),
        "OtherLiabilities":     f("OtherLiabilitiesTotal"),
        # Equity
        "TotalEquity":          f("TotalEquity"),
        "StockholderEquity":    f("TotalEquity"),
        "EquityCapital":        f("CommonStockTotal"),
        "RetainedEarnings":     f("RetainedEarnings(AccumulatedDeficit)"),
        "OtherEquity":          f("OtherEquityTotal"),
        "NonControllingInterest": f("MinorityInterest"),
        "UnrealizedGainLoss":   f("UnrealizedGain(Loss)"),
        "SharesOutstanding":    f("TotalCommonSharesOutstanding"),
        "TangibleBVPS":         f("TangibleBookValueperShareCommonEq"),
    }


def map_cf(period):
    """Map one IndianAPI period → Cash Flow schema (values already in ₹ Cr)."""
    m    = (period.get("stockFinancialMap") or {}).get("CAS") or []
    f    = lambda k: ia_fval(m, k)
    ocf  = f("CashfromOperatingActivities")
    capex = f("CapitalExpenditures")
    fcf  = (ocf + capex) if (ocf is not None and capex is not None) else None
    return {
        "_period":              period.get("EndDate", ""),
        "_type":                period.get("Type", "Annual"),
        "OperatingCF":          ocf,
        "InvestingCF":          f("CashfromInvestingActivities"),
        "FinancingCF":          f("CashfromFinancingActivities"),
        "Capex":                capex,
        "FreeCF":               round(fcf, 2) if fcf is not None else None,
        "Depreciation":         f("Depreciation/Depletion"),
        "NetCF":                f("NetChangeinCash"),
        "InterestPaid":         f("CashInterestPaid"),
        "TaxPaid":              f("CashTaxesPaid"),
        "DividendsPaid":        f("TotalCashDividendsPaid"),
        "WorkingCapitalChange": f("ChangesinWorkingCapital"),
        "NonCashItems":         f("Non-CashItems"),
    }


# ── IndianAPI fetch ────────────────────────────────────────────────────────────
def fetch_indianapi_by_query(query: str):
    code, data = ia_get(f"/stock?name={query}")
    if code != 200 or not data:
        return False, {}

    try:
        name     = data.get("companyName") or query
        industry = data.get("industry") or ""
        profile  = data.get("companyProfile") or {}
        sector   = profile.get("mgIndustry") or industry

        # ── Current price ──
        price_info = data.get("currentPrice", {})
        if isinstance(price_info, dict):
            current_price = price_info.get("NSE") or price_info.get("BSE")
        else:
            current_price = price_info
        try:    current_price = float(current_price)
        except: current_price = None

        # ── Key metrics ──
        km = data.get("keyMetrics") or {}
        def km_val(section, key):
            section_data = km.get(section) if isinstance(km, dict) else None
            if not section_data:
                return None
            for item in section_data:
                if isinstance(item, dict) and item.get("key") == key:
                    try:    return float(item.get("value"))
                    except: return None
            return None

        pe     = km_val("valuation", "pPerEExcludingExtraordinaryItemsMostRecentFiscalYear")
        pb     = km_val("valuation", "priceToBookMostRecentFiscalYear")
        roe    = km_val("mgmtEffectiveness", "returnOnAverageEquityMostRecentFiscalYear") or \
                 km_val("mgmtEffectiveness", "returnOnAverageEquity5YearAverage")
        npm    = km_val("margins", "netProfitMarginTrailing12Month") or \
                 km_val("margins", "netProfitMarginMostRecentFiscalYear")
        opm    = km_val("margins", "operatingMarginTrailing12Month")
        mktcap = km_val("priceandVolume", "marketCap")

        # ── Financial statements ──
        periods = data.get("stockFinancialData") or []
        annual  = sorted(
            [p for p in periods if p.get("Type") == "Annual"],
            key=lambda x: x.get("EndDate", "")
        )
        interim = sorted(
            [p for p in periods if p.get("Type") == "Interim"],
            key=lambda x: x.get("EndDate", ""),
            reverse=True
        )

        inc_annual    = [map_pl(p) for p in annual][-5:]
        inc_quarterly = [map_pl(p) for p in interim][:8]
        bs_annual     = [map_bs(p) for p in annual][-5:]
        bs_quarterly  = [map_bs(p) for p in interim][:8]
        cf_annual     = [map_cf(p) for p in annual][-5:]
        cf_quarterly  = [map_cf(p) for p in interim][:8]

        # ── Derived ratios from latest annual BS ──
        current_ratio = None
        debt_eq       = None
        if bs_annual:
            latest_bs = bs_annual[-1]
            ca  = latest_bs.get("TotalCurrentAssets")
            cl  = latest_bs.get("TotalCurrentLiab")
            td  = latest_bs.get("TotalDebt")
            eq  = latest_bs.get("TotalEquity")
            if ca and cl and cl != 0:
                current_ratio = round(ca / cl, 2)
            if td is not None and eq and eq != 0:
                debt_eq = round(td / eq, 2)

        eps = inc_annual[-1].get("EPS") if inc_annual else None

        latest_quarter_period = interim[0].get("EndDate") if interim else None

        return True, {
            "name":                  name,
            "sector":                sector,
            "industry":              industry,
            "current_price":         current_price,
            "market_cap_cr":         mktcap,
            "pe":                    pe,
            "pb":                    pb,
            "roe":                   roe,
            "profit_margin":         npm,
            "op_margin":             opm,
            "current_ratio":         current_ratio,
            "debt_eq":               debt_eq,
            "eps":                   eps,
            "inc_annual":            inc_annual,
            "inc_quarterly":         inc_quarterly,
            "bs_annual":             bs_annual,
            "bs_quarterly":          bs_quarterly,
            "cf_annual":             cf_annual,
            "cf_quarterly":          cf_quarterly,
            "data_source":           "indianapi",
            "latest_quarter_period": latest_quarter_period,
        }
    except Exception as e:
        print(f"    ⚠️  Parse error: {e}")
        return False, {}


def fetch_indianapi(ticker_row: dict):
    bse_code = (ticker_row.get("bse_code") or "").strip()
    nse_code = (ticker_row.get("nse_code") or "").strip()
    ticker   = (ticker_row.get("ticker")   or "").strip().upper()

    candidates = []
    if bse_code: candidates.append(("bse_code", bse_code))
    if nse_code: candidates.append(("nse_code", nse_code))
    if ticker:   candidates.append(("ticker",   ticker))

    for source, query in candidates:
        print(f"  → IndianAPI [{source}={query}]...", end=" ", flush=True)
        ok, result = fetch_indianapi_by_query(query)
        if ok:
            print("✅")
            return True, result
        print("❌")

    return False, {}


# ── yfinance fallback ──────────────────────────────────────────────────────────
def fetch_yfinance(ticker_row: dict):
    try:
        import yfinance as yf
    except ImportError:
        return False, {}

    nse_code = (ticker_row.get("nse_code") or "").strip()
    ticker   = (ticker_row.get("ticker")   or "").strip().upper()
    symbol   = nse_code or ticker

    print(f"  → yfinance [{symbol}.NS]...", end=" ", flush=True)

    def to_cr(v):
        try:   return round(float(v) / 1e7, 2)
        except: return None

    def safe(v):
        try:    return float(v) if v is not None else None
        except: return None

    try:
        t    = yf.Ticker(f"{symbol}.NS")
        info = t.info or {}
        inc  = t.income_stmt
        bs   = t.balance_sheet
        cf   = t.cashflow
        inc_q = t.quarterly_income_stmt
        bs_q  = t.quarterly_balance_sheet
        cf_q  = t.quarterly_cashflow
    except Exception:
        print("❌")
        return False, {}

    def pl_mapper(col, period_type="Annual"):
        return {
            "_type":           period_type,
            "Revenue":         to_cr(col.get("Total Revenue")),
            "COGS":            to_cr(col.get("Cost Of Revenue")),
            "GrossProfit":     to_cr(col.get("Gross Profit")),
            "SGA":             to_cr(col.get("Selling General Administrative")),
            "Depreciation":    to_cr(col.get("Reconciled Depreciation")),
            "EBIT":            to_cr(col.get("EBIT")),
            "EBITDA":          to_cr(col.get("EBITDA")),
            "InterestExpense": to_cr(col.get("Interest Expense")),
            "PBT":             to_cr(col.get("Pretax Income")),
            "Tax":             to_cr(col.get("Tax Provision")),
            "NetIncome":       to_cr(col.get("Net Income")),
            "EPS":             safe(col.get("Basic EPS")),
            "DilutedShares":   to_cr(col.get("Diluted Average Shares")),
        }

    def bs_mapper(col, period_type="Annual"):
        std = safe(col.get("Current Debt")) or 0
        ltd = safe(col.get("Long Term Debt")) or 0
        return {
            "_type":              period_type,
            "TotalAssets":        to_cr(col.get("Total Assets")),
            "TotalCurrentAssets": to_cr(col.get("Current Assets")),
            "Cash":               to_cr(col.get("Cash And Cash Equivalents")),
            "ShortTermInvestments": to_cr(col.get("Other Short Term Investments")),
            "Inventories":        to_cr(col.get("Inventory")),
            "TradeReceivables":   to_cr(col.get("Accounts Receivable")),
            "OtherCurrentAssets": to_cr(col.get("Other Current Assets")),
            "FixedAssets":        to_cr(col.get("Net PPE")),
            "Goodwill":           to_cr(col.get("Goodwill")),
            "OtherIntangibles":   to_cr(col.get("Other Intangible Assets")),
            "TotalLiabilities":   to_cr(col.get("Total Liabilities Net Minority Interest")),
            "TotalCurrentLiab":   to_cr(col.get("Current Liabilities")),
            "TradePayables":      to_cr(col.get("Accounts Payable")),
            "BorrowingsCurrent":  to_cr(std),
            "LongTermDebt":       to_cr(ltd),
            "TotalDebt":          to_cr(std + ltd) if (std or ltd) else None,
            "TotalEquity":        to_cr(col.get("Stockholders Equity")),
            "StockholderEquity":  to_cr(col.get("Stockholders Equity")),
            "RetainedEarnings":   to_cr(col.get("Retained Earnings")),
            "EquityCapital":      to_cr(col.get("Common Stock")),
        }

    def cf_mapper(col, period_type="Annual"):
        ocf   = safe(col.get("Operating Cash Flow"))
        capex = safe(col.get("Capital Expenditure"))
        fcf   = (ocf + capex) if (ocf is not None and capex is not None) else None
        return {
            "_type":        period_type,
            "OperatingCF":  to_cr(ocf),
            "InvestingCF":  to_cr(col.get("Investing Cash Flow")),
            "FinancingCF":  to_cr(col.get("Financing Cash Flow")),
            "Capex":        to_cr(capex),
            "FreeCF":       to_cr(fcf),
            "Depreciation": to_cr(col.get("Depreciation And Amortization")),
            "NetCF":        to_cr(col.get("Changes In Cash")),
            "DividendsPaid": to_cr(col.get("Common Stock Dividend Paid")),
        }

    def df_map_full(df, mapper, period_type="Annual"):
        if df is None or df.empty:
            return []
        out = []
        for col in df.columns:
            row = {"_period": str(col)[:10]}
            row.update(mapper(df[col], period_type))
            out.append(row)
        return list(reversed(out))

    try:
        inc_annual    = df_map_full(inc,   pl_mapper, "Annual")[-5:]
        inc_quarterly = df_map_full(inc_q, pl_mapper, "Interim")[:8]
        bs_annual     = df_map_full(bs,    bs_mapper, "Annual")[-5:]
        bs_quarterly  = df_map_full(bs_q,  bs_mapper, "Interim")[:8]
        cf_annual     = df_map_full(cf,    cf_mapper, "Annual")[-5:]
        cf_quarterly  = df_map_full(cf_q,  cf_mapper, "Interim")[:8]
    except Exception as e:
        print(f"    ⚠️  yfinance statement error: {e}")
        print("❌")
        return False, {}

    if not inc_annual:
        print("❌")
        return False, {}

    latest_bs = bs_annual[-1] if bs_annual else {}
    ca  = latest_bs.get("TotalCurrentAssets")
    cl  = latest_bs.get("TotalCurrentLiab")
    td  = latest_bs.get("TotalDebt")
    eq  = latest_bs.get("TotalEquity")
    current_ratio = round(ca / cl, 2) if ca and cl and cl != 0 else None
    debt_eq       = round(td / eq, 2) if td is not None and eq and eq != 0 else None

    latest_q = None
    if inc_q is not None and not inc_q.empty:
        try:
            latest_q = str(sorted(inc_q.columns, reverse=True)[0])[:10]
        except Exception:
            pass

    print("✅")
    return True, {
        "name":                  info.get("longName", symbol),
        "sector":                info.get("sector", ""),
        "industry":              info.get("industry", ""),
        "current_price":         safe(info.get("currentPrice") or info.get("regularMarketPrice")),
        "market_cap_cr":         to_cr(info.get("marketCap")),
        "pe":                    safe(info.get("trailingPE")),
        "pb":                    safe(info.get("priceToBook")),
        "roe":                   round(info["returnOnEquity"] * 100, 2) if info.get("returnOnEquity") else None,
        "profit_margin":         round(info["profitMargins"] * 100, 2) if info.get("profitMargins") else None,
        "op_margin":             round(info["operatingMargins"] * 100, 2) if info.get("operatingMargins") else None,
        "current_ratio":         current_ratio,
        "debt_eq":               debt_eq,
        "eps":                   inc_annual[-1].get("EPS") if inc_annual else None,
        "inc_annual":            inc_annual,
        "inc_quarterly":         inc_quarterly,
        "bs_annual":             bs_annual,
        "bs_quarterly":          bs_quarterly,
        "cf_annual":             cf_annual,
        "cf_quarterly":          cf_quarterly,
        "data_source":           "yfinance",
        "latest_quarter_period": latest_q,
    }


# ── Supabase helpers ───────────────────────────────────────────────────────────
def sb_upsert(row: dict) -> int:
    body = json.dumps(row).encode()
    req  = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/company_financials",
        data=body,
        headers={
            "Content-Type": "application/json",
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Prefer":        "resolution=merge-duplicates,return=minimal",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=20) as r:
            return r.status
    except urllib.error.HTTPError as e:
        print(f"    ❌ Supabase {e.code}: {e.read().decode()[:300]}")
        return e.code
    except Exception as e:
        print(f"    ❌ Supabase error: {e}")
        return 0


def sb_get_ticker_rows() -> list:
    rows      = []
    offset    = 0
    page_size = 1000

    while True:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/company_financials"
            f"?select=ticker,nse_code,bse_code&limit={page_size}&offset={offset}",
            headers={
                "apikey":        SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
            },
        )
        try:
            with urllib.request.urlopen(req, context=ctx, timeout=20) as r:
                page = json.loads(r.read().decode())
        except Exception as e:
            print(f"❌ Failed to fetch tickers: {e}")
            sys.exit(1)

        rows.extend(page)
        if len(page) < page_size:
            break
        offset += page_size

    return rows


def sb_get_row_for_ticker(ticker: str) -> dict:
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/company_financials"
        f"?select=ticker,nse_code,bse_code&ticker=eq.{ticker}&limit=1",
        headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        },
    )
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=20) as r:
            rows = json.loads(r.read().decode())
            if rows:
                return rows[0]
    except Exception as e:
        print(f"    ⚠️  Could not fetch row for {ticker}: {e}")

    return {"ticker": ticker, "nse_code": "", "bse_code": ""}


def sb_get_existing_quarter(ticker: str) -> str | None:
    """Get the latest_quarter_period already stored in DB for this ticker."""
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/company_financials"
        f"?select=latest_quarter_period,fetched_at&ticker=eq.{ticker}&limit=1",
        headers={
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        },
    )
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=20) as r:
            rows = json.loads(r.read().decode())
            if rows:
                return rows[0].get("latest_quarter_period")
    except Exception:
        pass
    return None


def sb_get_pending_tickers(days: int = 5) -> list:
    """
    Fetch tickers from earnings_calendar where:
    - result_date <= today - {days} days
    - financials_fetched = false
    """
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    url    = (
        f"{SUPABASE_URL}/rest/v1/earnings_calendar"
        f"?result_date=lte.{cutoff}"
        f"&financials_fetched=eq.false"
        f"&select=ticker,result_date"
    )
    req = urllib.request.Request(url, headers={
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    })
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=20) as r:
            rows = json.loads(r.read().decode())
            print(f"📋 Found {len(rows)} pending tickers in earnings_calendar (cutoff: {cutoff})")
            return rows
    except Exception as e:
        print(f"❌ Failed to fetch pending tickers: {e}")
        return []


def sb_mark_fetched(ticker: str) -> None:
    """Mark financials_fetched = true in earnings_calendar for this ticker."""
    body = json.dumps({
        "financials_fetched":    True,
        "financials_fetched_at": datetime.now(timezone.utc).isoformat(),
    }).encode()

    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/earnings_calendar?ticker=eq.{ticker}",
        data=body,
        headers={
            "Content-Type":  "application/json",
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Prefer":        "return=minimal",
        },
        method="PATCH",
    )
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=20) as r:
            pass
    except Exception as e:
        print(f"    ⚠️  mark_fetched error for {ticker}: {e}")


# ── Per-ticker orchestration ───────────────────────────────────────────────────
def fetch_ticker(ticker_row: dict, result_date: str | None = None) -> bool:
    """
    Fetch and upsert financials for a single ticker.
    If result_date is provided (--recent mode), skips fetch if we already
    have data for a quarter period >= result_date.
    Returns True on success, "skipped" on skip, False on failure.
    """
    ticker = (ticker_row.get("ticker") or "").strip().upper()

    print(f"\n{'─'*52}")
    print(f"  Processing: {ticker}")
    bse = ticker_row.get("bse_code") or ""
    nse = ticker_row.get("nse_code") or ""
    print(f"  bse_code={bse or '—'}  nse_code={nse or '—'}")
    if result_date:
        print(f"  result_date={result_date}")
    print(f"{'─'*52}")

    # ── Skip check (only in --recent mode) ────────────────────────────────────
    if result_date:
        existing_quarter = sb_get_existing_quarter(ticker)
        if existing_quarter and existing_quarter >= result_date:
            print(f"  ⏭️  Already have quarter {existing_quarter} (>= result_date {result_date}), skipping fetch")
            return "skipped"

    # ── Fetch from IndianAPI ───────────────────────────────────────────────────
    ok, result = fetch_indianapi(ticker_row)

    if not ok:
        print("  IndianAPI exhausted all candidates → trying yfinance...")
        ok, result = fetch_yfinance(ticker_row)

    if not ok:
        print(f"  ⛔ No data found for {ticker} — skipping")
        return False

    # ── Second skip check: new data same quarter as already stored ─────────────
    if result_date:
        new_quarter      = result.get("latest_quarter_period")
        existing_quarter = sb_get_existing_quarter(ticker)
        if new_quarter and existing_quarter and new_quarter == existing_quarter:
            print(f"  ⏭️  IndianAPI still on same quarter {new_quarter} as DB — skipping upsert")
            return "skipped"

    # ── Build upsert row ───────────────────────────────────────────────────────
    # sector and industry are excluded intentionally (managed separately)
    row = {
        "ticker":                ticker,
        "exchange":              "NSE",
        "fetched_at":            datetime.now(timezone.utc).isoformat(),
        "stmt_type":             "c",
        "name":                  result.get("name"),
        "current_price":         result.get("current_price"),
        "market_cap_cr":         result.get("market_cap_cr"),
        "pe":                    result.get("pe"),
        "pb":                    result.get("pb"),
        "roe":                   result.get("roe"),
        "profit_margin":         result.get("profit_margin"),
        "op_margin":             result.get("op_margin"),
        "current_ratio":         result.get("current_ratio"),
        "debt_eq":               result.get("debt_eq"),
        "eps":                   result.get("eps"),
        "inc_annual":            result.get("inc_annual",    []),
        "inc_quarterly":         result.get("inc_quarterly", []),
        "bs_annual":             result.get("bs_annual",     []),
        "bs_quarterly":          result.get("bs_quarterly",  []),
        "cf_annual":             result.get("cf_annual",     []),
        "cf_quarterly":          result.get("cf_quarterly",  []),
        "data_source":           result.get("data_source"),
        "latest_quarter_period": result.get("latest_quarter_period"),
    }

    print(f"  → Upserting to Supabase...", end=" ", flush=True)
    status = sb_upsert(row)
    if status in (200, 201):
        print(f"✅  Done (HTTP {status})")
        return True
    else:
        print(f"❌  HTTP {status}")
        return False


# ── CLI ────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Fetch company financials from IndianAPI and upsert to Supabase."
    )
    parser.add_argument(
        "tickers", nargs="*",
        help="One or more ticker symbols (as stored in the ticker column)"
    )
    parser.add_argument(
        "--all", action="store_true",
        help="Process all tickers in company_financials"
    )
    parser.add_argument(
        "--recent", action="store_true",
        help="Process tickers from earnings_calendar where result_date passed and financials not yet fetched"
    )
    parser.add_argument(
        "--days", type=int, default=5,
        help="Days after result_date before fetching (default: 5, used with --recent)"
    )
    args = parser.parse_args()

    if not args.tickers and not args.all and not args.recent:
        parser.print_help()
        sys.exit(1)

    # ── --recent mode ──────────────────────────────────────────────────────────
    if args.recent:
        pending = sb_get_pending_tickers(days=args.days)

        if not pending:
            print("✅ No pending tickers — nothing to do.")
            sys.exit(0)

        success = 0
        skipped = 0
        failed  = 0

        for entry in pending:
            ticker      = entry["ticker"].upper()
            result_date = entry["result_date"]

            ticker_row = sb_get_row_for_ticker(ticker)
            outcome    = fetch_ticker(ticker_row, result_date=result_date)

            if outcome is True:
                sb_mark_fetched(ticker)
                success += 1
            elif outcome == "skipped":
                sb_mark_fetched(ticker)
                skipped += 1
            else:
                failed += 1

        print(f"\n{'='*52}")
        print(f"✅  Recent earnings run complete.")
        print(f"    Fetched : {success}")
        print(f"    Skipped : {skipped}  (already up to date)")
        print(f"    Failed  : {failed}")
        print(f"{'='*52}")
        sys.exit(0)

    # ── --all mode ─────────────────────────────────────────────────────────────
    if args.all:
        print("📋 Fetching all ticker rows from company_financials...")
        ticker_rows = sb_get_ticker_rows()
        print(f"   Found {len(ticker_rows)} tickers\n")
    else:
        ticker_rows = []
        for t in args.tickers:
            row = sb_get_row_for_ticker(t.upper())
            ticker_rows.append(row)

    success        = 0
    failed_tickers = []

    for row in ticker_rows:
        ok = fetch_ticker(row)
        if ok is True:
            success += 1
        else:
            failed_tickers.append(row.get("ticker", "?"))

    print(f"\n{'='*52}")
    print(f"✅  Completed {success}/{len(ticker_rows)} ticker(s) successfully.")
    if failed_tickers:
        print(f"❌  Failed: {', '.join(failed_tickers)}")
    print(f"{'='*52}")


def run_for_ticker(symbol):
    fetch_ticker({"ticker": symbol, "nse_code": "", "bse_code": ""})