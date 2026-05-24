# What is TradeEdge?
TradeEdge is a full-stack research and portfolio analytics platform built specifically for Indian retail traders and investors. It unifies fundamental screening, technical analysis, institutional flow data, and personal trade journaling into a single, clean interface — designed to feel like a professional trading terminal without the institutional price tag.
Whether you're scanning for breakout setups, tracking FII/DII flows, analyzing promoter ownership trends, or reviewing your own trading performance — TradeEdge brings it all into one workspace.

Try it instantly — no sign-up required. Hit the Demo Mode button on the login screen to explore all features with sample data.


# Feature Modules
# 📊 Dashboard
A market-wide overview with live index quotes, breadth indicators, and quick-access panels. Your command centre before the opening bell.

# 👁 Watchlist
Track up to 25 personal watchlists with live NSE/BSE prices, intraday performance, RS ratings, and one-click deep-dive into any stock. Features include:

Live price polling with tick-up / tick-down animations
Status pills — Stage 2 uptrend [S2], Breakout [BO], Volume spike [VOL]
Detail panel with sparklines, volume bars, and quick-add to journal
Event intelligence — upcoming earnings, results, dividends surfaced inline
Keyboard navigation for power users


# 📈 Fundamentals
# Screener
Filter 4,000+ NSE/BSE stocks by quality, valuation, and growth factors. Rules-based, no-code filter builder supporting multi-condition logic across revenue, margins, ROCE, P/E, debt, and more.
FII / DII Flow
Track institutional participation — Foreign Institutional Investors and Domestic Institutional Investors — across cash and derivatives segments. Identify accumulation/distribution phases before they show up in price.
Ownership Scans
Surface stocks with meaningful shifts in promoter holding, mutual fund entry/exit, and retail ownership changes. 7-day cached dataset for near-instant load times.

# 📉 Technicals
# Market Breadth
Gauge internal market health with 52-week high counts, RS ratings, trend-aligned stock ratios, and RS acceleration signals — all updated daily.
# Screens
Pre-built and custom technical screens to surface:

Stage 2 breakouts & base formations
Volume-confirmed momentum moves
Pullbacks to key moving averages
RS leaders vs. laggards

# Heatmap
Visual sector and stock concentration map. Instantly see where money is flowing — and where it isn't.
Sector Rotation (RRG)
Relative Rotation Graph showing sector leadership cycles. Identify which sectors are leading, lagging, improving, or weakening relative to the benchmark.

# 📓 Journal (TradeVault)
A full-featured personal trade accounting suite. Login required; data synced to your account via Supabase.
Sub-ModuleDescriptionDashboardPortfolio summary — open P&L, realized gains, drawdown, equity curveTrade JournalLog every entry and exit with ticker, quantity, price, and notesAnalyticsWin rate, expectancy, avg gain/loss, R:R ratio, holding period analysisCapital GainsRealized P&L broken down by Indian financial year (FY)PortfolioOpen positions with live P&L, allocation %, and sector exposureFunds & XIRRCapital deployment tracker with XIRR return calculationDividendsDividend receipt log with FY-wise income summary
CSV Import — drag-and-drop your broker export. Auto-detects column mapping with smart header matching. Supports Zerodha, Groww, Angel, and custom formats.

# 🔍 Ticker Deep-Dive
Type any NSE symbol in the top search bar to open a full-screen stock dashboard with:

Price chart, volume profile, and key technical levels
Fundamental snapshot (P/E, ROCE, revenue trend, debt)
Ownership breakdown
Related screens and RS comparisons


Tech Stack
LayerTechnologyFrontendReact 18 (hooks-only, no class components)BuildViteBackend / Auth / DBSupabase (PostgreSQL + Row Level Security)AuthEmail/password + Google OAuth via Supabase AuthStylingVanilla CSS-in-JS with a full dual-theme design token systemTypographyIBM Plex Sans · IBM Plex Mono · InterChartsCustom SVG (sparklines, donut, bar, area charts) — zero chart library dependenciesDataNSE/BSE via Supabase-hosted data tables
