// ============================================================
//  WatchlistDashboard.jsx  — v7  (Institutional Redesign)
//
//  ⚡ DESIGN SYSTEM: strict T.* token-only usage
//  📐 LAYOUT: Sidebar 220px | Table flex | Detail 320px
//  🏗 COMPONENTS:
//     WatchlistSidebar · WatchlistTable · StockRow · DetailPanel
//
//  ✅ RETAINED (unchanged):
//     - All data fetching (loadWatchlistRows, fetchPrices, etc.)
//     - Cache layer (watchlistCache, dedupedFetch)
//     - All REST helpers (GET/POST/PATCH/DELETE/RPC)
//     - All state management and callbacks
//     - Keyboard navigation, event system, sparklines
//  ✅ REDESIGNED:
//     - StockRow → multi-line card layout
//     - Status pills → minimal [S2] [BO] [VOL] style
//     - Sidebar → thin left-border active state
//     - Detail panel → clean, borderLeft only
//     - Removed duplicate metrics, bright colors, thick borders
// ============================================================

import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const PAGE_SIZE = 100;
const MAX_WATCHLISTS = 25;

// ─── Event Intelligence ────────────────────────────────────────
const EVENTS_CACHE_KEY = "events_cache";
const EVENTS_CACHE_TTL = 5 * 60 * 1000;
const seenSeqIds = new Set();

const EVENT_BADGE_MAP = {
    EARNINGS: { abbr: "E", color: "#dc2626", bg: "rgba(220,38,38,0.12)", border: "rgba(220,38,38,0.3)" },
    RESULTS: { abbr: "E", color: "#dc2626", bg: "rgba(220,38,38,0.12)", border: "rgba(220,38,38,0.3)" },
    MERGER: { abbr: "M", color: "#9333ea", bg: "rgba(147,51,234,0.12)", border: "rgba(147,51,234,0.3)" },
    ACQUISITION: { abbr: "M", color: "#9333ea", bg: "rgba(147,51,234,0.12)", border: "rgba(147,51,234,0.3)" },
    ORDER: { abbr: "O", color: "#16a34a", bg: "rgba(22,163,74,0.12)", border: "rgba(22,163,74,0.3)" },
    CONTRACT: { abbr: "O", color: "#16a34a", bg: "rgba(22,163,74,0.12)", border: "rgba(22,163,74,0.3)" },
    CAPEX: { abbr: "C", color: "#2563eb", bg: "rgba(37,99,235,0.12)", border: "rgba(37,99,235,0.3)" },
    EXPANSION: { abbr: "C", color: "#2563eb", bg: "rgba(37,99,235,0.12)", border: "rgba(37,99,235,0.3)" },
    INVESTOR_MEET: { abbr: "I", color: "#d97706", bg: "rgba(217,119,6,0.10)", border: "rgba(217,119,6,0.25)" },
    ANALYST: { abbr: "I", color: "#d97706", bg: "rgba(217,119,6,0.10)", border: "rgba(217,119,6,0.25)" },
    BOARD: { abbr: "B", color: "#64748b", bg: "rgba(100,116,139,0.10)", border: "rgba(100,116,139,0.25)" },
    DEFAULT: { abbr: "•", color: "#475569", bg: "rgba(71,85,105,0.08)", border: "rgba(71,85,105,0.2)" },
};

function getEventBadge(category = "") {
    const cat = category.toUpperCase().replace(/[\s_-]+/g, "_");
    for (const [key, val] of Object.entries(EVENT_BADGE_MAP)) {
        if (cat.includes(key)) return val;
    }
    return EVENT_BADGE_MAP.DEFAULT;
}
function slope(arr) {
    return arr[arr.length - 1] - arr[0];
}

// ─── Weekly Candlestick Chart Helpers ─────────────────────────
const _wlWeeklyChartCache = new Map(); // ticker → candles[] | null
const _wlWeeklyChartInFlight = new Map(); // ticker → Promise

function _wlAggregateToWeekly(rows) {
    const weeks = {};
    for (const r of rows) {
        const d = new Date(r.date);
        const diff = (d.getDay() === 0 ? -6 : 1) - d.getDay();
        const mon = new Date(d); mon.setDate(d.getDate() + diff);
        const key = mon.toISOString().slice(0, 10);
        // Adjustment factor: ratio of adj_close to raw close (handles splits/dividends).
        // Fall back to 1 if adj_close is missing or close is 0.
        const factor = (r.adj_close != null && r.close) ? r.adj_close / r.close : 1;
        const adjO = r.open * factor;
        const adjH = r.high * factor;
        const adjL = r.low * factor;
        const adjC = r.adj_close ?? r.close;
        if (!weeks[key]) {
            weeks[key] = { date: key, o: adjO, h: adjH, l: adjL, c: adjC, v: r.volume ?? 0 };
        } else {
            const w = weeks[key];
            if (adjH > w.h) w.h = adjH;
            if (adjL < w.l) w.l = adjL;
            w.c = adjC;
            w.v += r.volume ?? 0;
        }
    }
    return Object.values(weeks).sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function fetchWlWeeklyOHLC(ticker) {
    const cached = _wlWeeklyChartCache.get(ticker);
    if (cached !== undefined && cached !== "loading") return cached;
    if (_wlWeeklyChartInFlight.has(ticker)) return _wlWeeklyChartInFlight.get(ticker);

    const promise = (async () => {
        try {
            const cutoff = new Date();
            cutoff.setFullYear(cutoff.getFullYear() - 1);
            const cutoffStr = cutoff.toISOString().slice(0, 10);
            const url = `${SUPABASE_URL}/rest/v1/stock_prices_daily`
                + `?ticker=eq.${encodeURIComponent(ticker)}`
                + `&exchange=eq.NSE`
                + `&date=gte.${cutoffStr}`
                + `&select=date,open,high,low,close,adj_close,volume`
                + `&order=date.asc`
                + `&limit=400`;
            const r = await fetch(url, {
                headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
                signal: AbortSignal.timeout(8000),
            });
            if (!r.ok) { _wlWeeklyChartCache.set(ticker, null); return null; }
            const rows = await r.json();
            if (!Array.isArray(rows) || rows.length < 5) { _wlWeeklyChartCache.set(ticker, null); return null; }
            const candles = _wlAggregateToWeekly(rows);
            _wlWeeklyChartCache.set(ticker, candles);
            return candles;
        } catch {
            _wlWeeklyChartCache.set(ticker, null);
            return null;
        } finally {
            _wlWeeklyChartInFlight.delete(ticker);
        }
    })();

    _wlWeeklyChartInFlight.set(ticker, promise);
    return promise;
}

// ─── Mini Candlestick Chart (weekly, SVG) ─────────────────────
function WlMiniCandleChart({ candles, T, width = 280, height = 120 }) {
    if (!candles || candles.length < 4) return null;
    const isDark = T.surface !== "#ffffff" && T.surface !== "#f8fafc";

    const volH = 30;
    const gap = 4;
    const pad = { l: 4, r: 36, t: 6, b: 14 };
    const totalH = height + volH + gap;
    const W = width - pad.l - pad.r;
    const H = height - pad.t - pad.b;

    const valid = candles.filter(c => c.h != null && c.l != null && c.l > 0);
    const pMin = Math.min(...valid.map(c => c.l));
    const pMax = Math.max(...valid.map(c => c.h));

    // Logarithmic price scale
    const logMin = Math.log(pMin);
    const logMax = Math.log(pMax);
    const logRange = logMax - logMin || 1;

    const py = v => pad.t + H - ((Math.log(Math.max(v, 0.0001)) - logMin) / logRange) * H;
    const n = candles.length;
    const slotW = W / n;
    const bodyW = Math.max(1.5, slotW * 0.58);

    const posClr = isDark ? "#4ade80" : "#16a34a";
    const negClr = isDark ? "#fb7185" : "#e11d48";

    const volTop = pad.t + H + pad.b + gap;
    const volInnerH = volH - 2;
    const vols = candles.map(c => c.v || 0);
    const vMax = Math.max(...vols, 1);
    const vy = v => volTop + volInnerH - (v / vMax) * volInnerH;

    const volMaPoints = candles.map((c, i) => {
        if (i < 19) return null;
        const avg = candles.slice(i - 19, i + 1).reduce((s, x) => s + (x.v || 0), 0) / 20;
        return `${pad.l + (i + 0.5) * slotW},${vy(avg)}`;
    }).filter(Boolean).join(" ");

    // 10WMA in log space for correct placement on the log scale
    const maPoints = candles.map((c, i) => {
        if (i < 9 || !c.c) return null;
        const logAvg = candles.slice(i - 9, i + 1).reduce((s, x) => s + Math.log(Math.max(x.c, 0.0001)), 0) / 10;
        return `${pad.l + (i + 0.5) * slotW},${pad.t + H - ((logAvg - logMin) / logRange) * H}`;
    }).filter(Boolean).join(" ");

    const priceFmt = v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v).toString();
    const volFmt = v => v >= 1e7 ? `${(v / 1e7).toFixed(1)}Cr` : v >= 1e5 ? `${(v / 1e5).toFixed(0)}L` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v);
    // Axis ticks: min, geometric mean, max — evenly spaced on the log scale
    const axisVals = [pMin, Math.exp((logMin + logMax) / 2), pMax];

    return (
        <svg width={width} height={totalH} style={{ display: "block", overflow: "visible" }}>
            {axisVals.map((v, i) => (
                <line key={i} x1={pad.l} x2={pad.l + W} y1={py(v)} y2={py(v)}
                    stroke={T.border} strokeWidth="0.5" strokeDasharray="3,3" opacity="0.5" />
            ))}
            {candles.map((c, i) => {
                if (!c.o || !c.h || !c.l || !c.c) return null;
                const bull = c.c >= c.o;
                const clr = bull ? posClr : negClr;
                const cx = pad.l + (i + 0.5) * slotW;
                const bodyT = py(Math.max(c.o, c.c));
                const bodyB = py(Math.min(c.o, c.c));
                const bH = Math.max(1, bodyB - bodyT);
                return (
                    <g key={i}>
                        <line x1={cx} x2={cx} y1={py(c.h)} y2={py(c.l)} stroke={clr} strokeWidth="0.7" opacity="0.7" />
                        <rect x={cx - bodyW / 2} y={bodyT} width={bodyW} height={bH}
                            fill={clr} opacity={bull ? 0.82 : 0.88} rx="0.4" />
                    </g>
                );
            })}
            {maPoints && (
                <polyline points={maPoints} fill="none"
                    stroke={isDark ? "#f59e0b" : "#d97706"}
                    strokeWidth="1.1" opacity="0.85"
                    strokeLinejoin="round" strokeLinecap="round" />
            )}
            {axisVals.map((v, i) => (
                <text key={i} x={pad.l + W + 3} y={py(v) + 3.5}
                    fontSize="7.5" fill={T.subtext}
                    fontFamily="'IBM Plex Mono',monospace"
                    textAnchor="start" opacity="0.75">
                    {priceFmt(v)}
                </text>
            ))}
            <text x={pad.l + 3} y={pad.t + H + 11}
                fontSize="7" fill={T.subtext}
                fontFamily="'IBM Plex Mono',monospace"
                textAnchor="start" opacity="0.55">
                {candles.length}W · 10WMA
            </text>
            <line x1={pad.l} x2={pad.l + W} y1={volTop - 2} y2={volTop - 2}
                stroke={T.border} strokeWidth="0.5" opacity="0.4" />
            {candles.map((c, i) => {
                const bull = (c.c ?? 0) >= (c.o ?? 0);
                const clr = bull ? posClr : negClr;
                const cx = pad.l + (i + 0.5) * slotW;
                const barH = Math.max(1, (c.v || 0) / vMax * volInnerH);
                return (
                    <rect key={i}
                        x={cx - bodyW / 2} y={volTop + volInnerH - barH}
                        width={bodyW} height={barH}
                        fill={clr} opacity={0.45} rx="0.4" />
                );
            })}
            {volMaPoints && (
                <polyline points={volMaPoints} fill="none"
                    stroke={isDark ? "#94a3b8" : "#64748b"}
                    strokeWidth="0.9" opacity="0.75"
                    strokeLinejoin="round" strokeLinecap="round"
                    strokeDasharray="2,2" />
            )}
            <text x={pad.l + W + 3} y={volTop + 5}
                fontSize="7" fill={T.subtext}
                fontFamily="'IBM Plex Mono',monospace"
                textAnchor="start" opacity="0.65">
                {volFmt(vMax)}
            </text>
            <text x={pad.l + 3} y={volTop + volInnerH - 1}
                fontSize="7" fill={T.subtext}
                fontFamily="'IBM Plex Mono',monospace"
                textAnchor="start" opacity="0.5">
                VOL · 20W avg
            </text>
        </svg>
    );
}

// ─── Candlestick section (used in both desktop panel and mobile sheet) ────
function WlCandleSection({ ticker, T, width }) {
    const [candles, setCandles] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!ticker) return;
        let cancelled = false;
        setLoading(true);
        setCandles(null);
        fetchWlWeeklyOHLC(ticker).then(data => {
            if (!cancelled) { setCandles(data); setLoading(false); }
        });
        return () => { cancelled = true; };
    }, [ticker]);

    const chartW = width || 260;

    return (
        <div style={{ background: T.card, borderRadius: 8, padding: "10px 10px 8px", overflow: "hidden" }}>
            <div style={{
                fontSize: 9, color: T.subtext, fontWeight: 500, textTransform: "uppercase",
                letterSpacing: "0.1em", marginBottom: 8, opacity: 0.55, fontFamily: "'DM Sans',sans-serif"
            }}>
                Weekly Chart · 52W
            </div>
            {loading ? (
                <div style={{
                    height: 80, display: "flex", flexDirection: "column", alignItems: "center",
                    justifyContent: "center", gap: 6, opacity: 0.45
                }}>
                    <div style={{
                        width: 14, height: 14, border: `1.5px solid ${T.border}`,
                        borderTopColor: T.green, borderRadius: "50%",
                        animation: "wlChartSpin 0.7s linear infinite"
                    }} />
                    <span style={{ fontSize: 10, color: T.subtext }}>Loading chart</span>
                </div>
            ) : candles ? (
                <WlMiniCandleChart candles={candles} T={T} width={chartW} height={110} />
            ) : (
                <div style={{
                    height: 70, display: "flex", alignItems: "center", justifyContent: "center",
                    color: T.subtext, fontSize: 11, opacity: 0.4
                }}>
                    Chart data unavailable
                </div>
            )}
        </div>
    );
}

async function fetchAnnouncements(symbols, token) {
    if (!symbols || symbols.length === 0) return {};
    try {
        const raw = localStorage.getItem(EVENTS_CACHE_KEY);
        if (raw) {
            const cached = JSON.parse(raw);
            if (Date.now() - cached.ts < EVENTS_CACHE_TTL) {
                const allCovered = symbols.every(s => s in cached.data);
                if (allCovered) return cached.data;
            }
        }
    } catch { }
    try {
        const symIn = `(${symbols.map(s => `"${encodeURIComponent(s)}"`).join(",")})`;
        const r = await fetch(
            `${SUPABASE_URL}/rest/v1/corporate_announcements?symbol=in.${symIn}&select=symbol,announcement_datetime,category,announcement_text,tags,priority,seq_id,attachment_url&order=announcement_datetime.desc`,
            { headers: { ...hdrs(token), "Range-Unit": "items", Range: "0-9999" } }
        );
        if (!r.ok) return {};
        const data = await r.json();
        // map[symbol] = LATEST single row (for eventsMap badges/toasts)
        // also return full list keyed by symbol for display
        const map = {};
        for (const row of (data || [])) {
            if (!row?.symbol) continue;
            if (!map[row.symbol]) {
                map[row.symbol] = {
                    symbol: row.symbol,
                    tags: row.tags || [],
                    priority: row.priority ?? 0,
                    announcement_text: row.announcement_text || "",
                    category: row.category || "",
                    datetime: row.announcement_datetime,
                    announcement_datetime: row.announcement_datetime,
                    seq_id: row.seq_id,
                    attachment_url: row.attachment_url || null,
                };
            }
        }
        try { localStorage.setItem(EVENTS_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: map })); } catch { }
        return map;
    } catch { return {}; }
}



// ─── Cache Layer ───────────────────────────────────────────────
const watchlistCache = new Map();
const inFlightRequests = new Map();
const CACHE_TTL = 60 * 1000;

// ─── Persistent SWR Helpers (localStorage) ────────────────────
// Rows cache: key = `wl_rows_<watchlistId>`, TTL = 24h (stale-but-usable)
// Fresh threshold = 90s — if data is newer than this, skip background refetch
const LS_ROWS_TTL = 24 * 60 * 60 * 1000; // 24h — stale but usable
const LS_ROWS_FRESH_TTL = 90 * 1000;       // 90s — skip background fetch
const LS_FEED_TTL = 24 * 60 * 60 * 1000;
const LS_FEED_FRESH_TTL = 120 * 1000;

function lsGet(key) {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch { return null; }
}
function lsSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { }
}

function getRowsCacheKey(watchlistId) { return `wl_rows_v2_${watchlistId}`; }
function getFeedCacheKey(userId) { return `wl_feed_v2_${userId}`; }

function getPersistedRows(watchlistId) {
    const c = lsGet(getRowsCacheKey(watchlistId));
    if (!c || !c.rows || Date.now() - c.ts > LS_ROWS_TTL) return null;
    // Strip any optimistic/phantom rows that may have been persisted from a
    // previous session. Optimistic rows have loading:true or _optimistic:true
    // and no real data — they must never survive a cache read.
    const cleaned = c.rows.filter(r => !r._optimistic && !r.loading);
    return { ...c, rows: cleaned };
}
function setPersistedRows(watchlistId, rows, total) {
    // Never persist optimistic placeholder rows
    const clean = rows.filter(r => !r._optimistic && !r.loading);
    lsSet(getRowsCacheKey(watchlistId), { rows: clean, total, ts: Date.now() });
}

function getPersistedFeed(userId, watchlistId) {
    // Strictly watchlist-scoped — never fall back to a cross-watchlist key.
    // The old wl_feed_v2_<userId> fallback was the root cause of showing
    // a different watchlist's announcements when the per-WL key was cold.
    if (!userId || !watchlistId) return null;
    const c = lsGet(`wl_feed_v3_${userId}_${watchlistId}`);
    if (!c || !c.data || Date.now() - c.ts > LS_FEED_TTL) return null;
    return c; // { data, ts }
}
function setPersistedFeed(userId, watchlistId, data) {
    // Only write to the watchlist-scoped key — never pollute a shared userId key.
    if (!userId || !watchlistId) return;
    lsSet(`wl_feed_v3_${userId}_${watchlistId}`, { data, ts: Date.now() });
}
function getCacheKey(params) { return JSON.stringify(params); }
function getCached(params) {
    const key = getCacheKey(params);
    const cached = watchlistCache.get(key);
    if (!cached || Date.now() - cached.ts > CACHE_TTL) return null;
    return cached;
}
function setCache(params, data) {
    watchlistCache.set(getCacheKey(params), { ...data, ts: Date.now() });
}
async function dedupedFetch(params, fn) {
    const key = getCacheKey(params);
    if (inFlightRequests.has(key)) return inFlightRequests.get(key);
    const p = fn().finally(() => inFlightRequests.delete(key));
    inFlightRequests.set(key, p);
    return p;
}

// ─── Auth / REST ───────────────────────────────────────────────
function hdrs(token) {
    return { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token || SUPABASE_ANON_KEY}` };
}
async function GET(path, token) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: hdrs(token) });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
}
async function POST(path, body, token) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method: "POST", headers: { ...hdrs(token), Prefer: "return=representation" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
}
async function PATCH(path, body, token) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method: "PATCH", headers: { ...hdrs(token), Prefer: "return=representation" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
}
async function DELETE(path, token) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method: "DELETE", headers: hdrs(token) });
    if (!r.ok) throw new Error(await r.text());
}
async function RPC(fn, params, token) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: hdrs(token), body: JSON.stringify(params) });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
}

// ─── Data Loader ──────────────────────────────────────────────
// Trend staging, breakout/pullback/vol-spike signals, relative volume,
// filtering, sorting and pagination are all precomputed/executed in
// Postgres now (see stock_analytics + get_watchlist_rows RPC). This is a
// single round trip instead of 3 whole-table fetches + client-side joins.
async function loadWatchlistRows({ watchlistId, token, page, pageSize, sortCol, sortAsc, filters }) {
    const f = filters || {};
    const data = await RPC("get_watchlist_rows", {
        p_watchlist_id: watchlistId,
        p_page: page,
        p_page_size: pageSize,
        p_sort_col: sortCol || "rs_rating",
        p_sort_asc: !!sortAsc,
        p_rs_min: f.rs_min ?? null,
        p_pct_high_min: f.pct_high_min ?? null,
        p_ret3m_min: f.ret3m_min ?? null,
        p_ret6m_min: f.ret6m_min ?? null,
        p_ret12m_min: f.ret12m_min ?? null,
        p_relvol_min: f.relvol_min ?? null,
        p_price_gt_sma50: !!f.price_gt_sma50,
        p_sma50_gt_sma150: !!f.sma50_gt_sma150,
        p_sma50_gt_sma200: !!f.sma50_gt_sma200,
        p_sma150_gt_sma200: !!f.sma150_gt_sma200,
        p_quick: f.quick || null,
    }, token);

    if (!data || data.length === 0) return { rows: [], total: 0 };

    const total = Number(data[0].total_count) || 0;
    const rows = data.map(r => ({
        ticker: r.ticker,
        ret_3m: r.ret_3m,
        ret_6m: r.ret_6m,
        ret_12m: r.ret_12m,
        rs_rating: r.rs_rating,
        pct_from_high: r.pct_from_high,
        pct_from_low: r.pct_from_low,
        pivot_20w: r.pivot_high_20w,
        high_52w: r.high_52w,
        low_52w: r.low_52w,
        close: r.close,
        rel_vol: r.rel_vol,
        trend: r.trend,
        signals: r.signals || [],
        sma50: r.sma50,
        sma150: r.sma150,
        sma200: r.sma200,
    }));
    return { rows, total };
}

// ─── Screen Membership ────────────────────────────────────────
// Screens (RS Leader, Vol Breakout, Pullback 50DMA, etc.) are precomputed
// once/day in Postgres (stock_analytics.screens). We only ask for the
// tickers currently on screen instead of pulling every NSE ticker's
// indicators + stock_52w rows to the browser and recomputing 13 "top 50"
// rankings client-side on every load.
async function fetchScreenMembership(tickers, token) {
    if (!tickers || tickers.length === 0) return {};
    try {
        const tickerIn = `(${tickers.map(t => `"${encodeURIComponent(t)}"`).join(",")})`;
        const data = await GET(`stock_analytics?ticker=in.${tickerIn}&select=ticker,screens`, token);
        const membership = {};
        for (const row of (data || [])) {
            if (row.ticker) membership[row.ticker] = row.screens || [];
        }
        return membership;
    } catch {
        return {};
    }
}

// ─── Default-Watchlist Seeding ────────────────────────────────
// When a brand-new user has zero watchlists we clone kumodiit@gmail.com's
// watchlists (names + tickers) into their account as a starting point.
// The seed runs exactly once, guarded by a localStorage flag.
//
// ⚠️  SETUP: replace the placeholder below with the real UUID of
//     kumodiit@gmail.com from your Supabase Auth → Users dashboard.
// ─── Default Watchlist Seeding ───────────────────────────────────────────────
// Copies the template user's watchlists+tickers to a brand-new user via a
// SECURITY DEFINER Postgres RPC that bypasses RLS entirely — the only reliable
// way to read another user's rows from the client.
//
// ⚠️  ONE-TIME SETUP: Run this SQL in Supabase → SQL Editor before deploying:
//
//   CREATE OR REPLACE FUNCTION clone_template_watchlists(
//     p_template_user_id uuid,
//     p_new_user_id      uuid
//   )
//   RETURNS void
//   LANGUAGE plpgsql
//   SECURITY DEFINER          -- runs as postgres superuser, bypasses RLS
//   SET search_path = public
//   AS $$
//   DECLARE
//     src  RECORD;
//     new_wl_id uuid;
//   BEGIN
//     FOR src IN
//       SELECT id, name FROM watchlists WHERE user_id = p_template_user_id ORDER BY created_at
//     LOOP
//       INSERT INTO watchlists (user_id, name)
//         VALUES (p_new_user_id, src.name)
//         RETURNING id INTO new_wl_id;
//
//       INSERT INTO watchlist_items (watchlist_id, ticker)
//         SELECT new_wl_id, ticker
//         FROM   watchlist_items
//         WHERE  watchlist_id = src.id
//         ORDER  BY added_at;
//     END LOOP;
//   END;
//   $$;
//
//   -- Allow any logged-in user to call it (safe — they can only seed themselves)
//   GRANT EXECUTE ON FUNCTION clone_template_watchlists(uuid, uuid) TO authenticated;

// UUID of kumodiit@gmail.com — copy from Supabase Auth → Users dashboard
const TEMPLATE_USER_ID = "d185de46-d490-422d-9b74-cd715d236771";
const SEED_FLAG_KEY = (uid) => `wl_seeded_v3_${uid}`;

// Module-level in-memory guard — blocks duplicate concurrent calls within the
// same page session (e.g. React StrictMode double-invoke, token refresh re-run).
const _seedBusy = new Set();

async function seedDefaultWatchlists(newUserId, token) {
    // Already done this session
    if (_seedBusy.has(newUserId)) return;

    // Already done in a previous session (localStorage flag)
    try { if (localStorage.getItem(SEED_FLAG_KEY(newUserId))) return; } catch { }

    _seedBusy.add(newUserId);
    try {
        // Call the SECURITY DEFINER RPC — it runs as postgres and bypasses all RLS.
        // This is the only reliable way to read another user's rows from the browser.
        const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/clone_template_watchlists`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: SUPABASE_ANON_KEY,
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                p_template_user_id: TEMPLATE_USER_ID,
                p_new_user_id: newUserId,
            }),
        });

        if (!r.ok) {
            const err = await r.text();
            console.warn("[TradeEdge] clone_template_watchlists RPC failed:", err);
            return;
        }

        // Persist flag so we never seed this user again
        try { localStorage.setItem(SEED_FLAG_KEY(newUserId), "1"); } catch { }
        console.log("[TradeEdge] Default watchlists seeded successfully for", newUserId);
    } catch (err) {
        console.warn("[TradeEdge] Seed failed:", err?.message);
    } finally {
        _seedBusy.delete(newUserId);
    }
}

// ─── Price Cache ───────────────────────────────────────────────
const priceCache = {};
async function fetchPrices(tickers, token) {
    const missing = tickers.filter(t => !priceCache[t]);
    if (missing.length) {
        try {
            const tickerIn = `(${missing.map(t => `"${encodeURIComponent(t)}"`).join(",")})`;
            const r = await fetch(`${SUPABASE_URL}/rest/v1/stock_52w?ticker=in.${tickerIn}&select=ticker,close,pct_from_high`, { headers: { ...hdrs(token), "Range-Unit": "items", Range: "0-9999" } });
            for (const row of (r.ok ? await r.json() : [])) { priceCache[row.ticker] = { price: row.close ?? null, change: row.pct_from_high ?? null }; }
        } catch { }
        missing.forEach(t => { if (!priceCache[t]) priceCache[t] = { price: null, change: null }; });
    }
    return { ...priceCache };
}

// ─── Earnings Date Fetcher ────────────────────────────────────
// Returns a map: { [ticker]: "YYYY-MM-DD" } for the next upcoming earnings date
async function fetchEarningsDates(tickers, token) {
    if (!tickers || tickers.length === 0) return {};
    try {
        const today = new Date().toISOString().slice(0, 10);
        const tickerIn = `(${tickers.map(t => `"${encodeURIComponent(t)}"`).join(",")})`;
        const r = await fetch(
            `${SUPABASE_URL}/rest/v1/earnings_calendar?ticker=in.${tickerIn}&result_date=gte.${today}&select=ticker,result_date&order=result_date.asc`,
            { headers: { ...hdrs(token), "Range-Unit": "items", Range: "0-999" } }
        );
        if (!r.ok) return {};
        const data = await r.json();
        // Keep only the nearest upcoming date per ticker
        const map = {};
        for (const row of (data || [])) {
            if (!row?.ticker || !row?.result_date) continue;
            if (!map[row.ticker]) map[row.ticker] = row.result_date;
        }
        return map;
    } catch { return {}; }
}

// ─── Formatters ───────────────────────────────────────────────
const fmt = {
    pct: v => v == null ? "—" : (isNaN(+v) ? "—" : ((+v >= 0 ? "+" : "") + ((+v).toFixed(1)) + "%")),
    pctRound: v => v == null ? "—" : (isNaN(+v) ? "—" : ((+v >= 0 ? "+" : "") + Math.round(+v) + "%")),
    price: v => v == null ? "—" : isNaN(+v) ? "—" : "₹" + (+v).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
    priceFull: v => v == null ? "—" : isNaN(+v) ? "—" : "₹" + (+v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
};

// ─── Sparkline (mini) ─────────────────────────────────────────
const Sparkline = memo(({ data, positive, width = 60, height = 24 }) => {
    if (!data || data.length < 2) return <svg width={width} height={height} />;
    const vals = data.map(d => +d.close);
    const mn = Math.min(...vals), mx = Math.max(...vals), rng = mx - mn || 1;
    const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * width},${height - ((v - mn) / rng) * (height - 3) - 2}`).join(" ");
    const color = positive ? "#22c55e" : "#f87171";
    return (
        <svg width={width} height={height} style={{ overflow: "visible", opacity: 0.6 }}>
            <polyline points={pts} fill="none" stroke={color} strokeWidth={1.2} strokeLinejoin="round" strokeLinecap="round" />
        </svg>
    );
});

// ─── Minimal Status Pills ─────────────────────────────────────
// Replaces colorful badges with dim bordered pills: [S2] [BO] [VOL]
const StatusPills = memo(({ row, screenMembership, T }) => {
    const pills = [];
    if (row.trend === "stage2") pills.push({ label: "Stage 2", title: "Stage 2 — Above 50 & 200 DMA" });
    else if (row.trend === "stage1") pills.push({ label: "Stage 1", title: "Stage 1 — Above 200 DMA" });
    if (row.signals?.includes("breakout")) pills.push({ label: "Near 52w High", title: "Near 52W High Breakout" });
    if (row.signals?.includes("vol_spike")) pills.push({ label: "Volume Spike", title: "Volume Spike ≥1.5×" });
    if (row.signals?.includes("pullback")) pills.push({ label: "Pullback to 50DMA", title: "Pullback to 50 DMA" });
    const screens = screenMembership[row.ticker] || [];
    if (screens.includes("RS Leader") || screens.includes("RS Accel")) pills.push({ label: "RS Accelerating", title: "RS Leader or Accelerating" });
    const pillStyle = {
        fontSize: "10px", padding: "2px 5px", borderRadius: "3px",
        border: `1px solid ${T.border}`, color: T.subtext,
        background: "transparent", cursor: "default", whiteSpace: "nowrap",
        letterSpacing: "0.03em", fontWeight: 500,
    };
    return (
        <div style={{ display: "flex", gap: 3, alignItems: "center", flexWrap: "nowrap", overflow: "hidden" }}>
            {pills.slice(0, 4).map(p => (
                <span key={p.label} title={p.title} style={pillStyle}>{p.label}</span>
            ))}
        </div>
    );
});

// ─── Return Color (uses T tokens) ─────────────────────────────
const retColor = (v, T) => v == null ? T.subtext : +v >= 0 ? T.pos : T.neg;

// ─── Skeleton Row ─────────────────────────────────────────────
const SkeletonRow = ({ T }) => (
    <div style={{ padding: "12px 14px", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ width: 90, height: 13, borderRadius: 3, background: T.border, opacity: 0.5 }} />
            <div style={{ width: 70, height: 13, borderRadius: 3, background: T.border, opacity: 0.5 }} />
        </div>
        <div style={{ display: "flex", gap: 12, marginBottom: 5 }}>
            <div style={{ width: 45, height: 11, borderRadius: 2, background: T.border, opacity: 0.35 }} />
            <div style={{ width: 45, height: 11, borderRadius: 2, background: T.border, opacity: 0.35 }} />
            <div style={{ width: 45, height: 11, borderRadius: 2, background: T.border, opacity: 0.35 }} />
        </div>
        <div style={{ width: 120, height: 10, borderRadius: 2, background: T.border, opacity: 0.3 }} />
    </div>
);

// ─── Sort Icon ────────────────────────────────────────────────
const SortIco = ({ active, asc }) => (
    <span style={{ marginLeft: 3, fontSize: 9, opacity: active ? 1 : 0.35, color: "inherit" }}>
        {active ? (asc ? "▲" : "▼") : "⬍"}
    </span>
);

// ─── Filter Panel ─────────────────────────────────────────────
function FilterPanel({ filters, onChange, onApply, onClear, visible, T, isMobile }) {
    if (!visible) return null;
    const NumField = (label, key, ph) => (
        <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 6 : 7, minWidth: 0 }}>
            <label style={{ fontSize: isMobile ? 11 : 10, fontWeight: 500, color: T.subtext, textTransform: "uppercase", letterSpacing: isMobile ? "0.08em" : "0.1em" }}>{label}</label>
            <input type="number" value={filters[key] ?? ""} placeholder={ph}
                onChange={e => onChange(key, e.target.value === "" ? null : +e.target.value)}
                style={{
                    padding: isMobile ? "12px 12px" : "10px 12px",
                    background: T.card, border: `1px solid ${T.border}`,
                    borderRadius: isMobile ? 12 : 10, color: T.text, fontSize: isMobile ? 15 : 13,
                    minHeight: isMobile ? 46 : 40,
                    fontFamily: "'IBM Plex Mono',monospace", outline: "none", width: "100%", boxSizing: "border-box"
                }}
            />
        </div>
    );
    const SMA_FILTERS = [
        { key: "price_gt_sma50", label: "Price > 50 SMA" },
        { key: "sma50_gt_sma150", label: "50 > 150 SMA" },
        { key: "sma50_gt_sma200", label: "50 > 200 SMA" },
        { key: "sma150_gt_sma200", label: "150 > 200 SMA" },
    ];

    const content = (
        <>
            {isMobile && (
                <div style={{ display: "flex", justifyContent: "center", paddingTop: 10, paddingBottom: 8, flexShrink: 0 }}>
                    <div style={{ width: 42, height: 5, borderRadius: 99, background: T.border, opacity: 0.8 }} />
                </div>
            )}
            <div style={{ padding: isMobile ? "0 16px 0" : 18, overflowY: isMobile ? "auto" : "visible", flex: isMobile ? 1 : "none" }}>
                {isMobile && (
                    <div style={{ marginBottom: 18 }}>
                        <div style={{ fontSize: 18, fontWeight: 500, color: T.text, marginBottom: 4, letterSpacing: "-0.03em", fontFamily: "'DM Sans', sans-serif" }}>Filters</div>
                        <div style={{ fontSize: 12, color: T.subtext, lineHeight: 1.45, fontFamily: "'DM Sans', sans-serif" }}>Refine quality, momentum, and trend structure for this watchlist.</div>
                    </div>
                )}
                {!isMobile && (
                    <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 10, fontWeight: 500, color: T.subtext, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>Filters</div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: T.text, fontFamily: "'DM Sans', sans-serif" }}>Screen for leaders with cleaner structure</div>
                    </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: isMobile ? 12 : 12, marginBottom: isMobile ? 18 : 14 }}>
                    {NumField("RS ≥", "rs_min", "80")}
                    {NumField("Rel Vol ≥", "relvol_min", "1.5")}
                    {NumField("Ret 3M ≥", "ret3m_min", "0")}
                    {NumField("Ret 6M ≥", "ret6m_min", "20")}
                    {NumField("Ret 12M ≥", "ret12m_min", "50")}
                    {NumField("52W High ≥%", "pct_high_min", "-10")}
                </div>
                <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: isMobile ? 16 : 14, marginBottom: isMobile ? 18 : 12 }}>
                    <div style={{ fontSize: isMobile ? 11 : 10, fontWeight: 700, color: T.subtext, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: isMobile ? 12 : 8 }}>SMA Conditions</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: isMobile ? 10 : 8 }}>
                        {SMA_FILTERS.map(({ key, label }) => {
                            const active = !!filters[key];
                            return (
                                <button key={key} onClick={() => onChange(key, active ? null : true)}
                                    style={{
                                        padding: isMobile ? "12px 10px" : "10px 10px", fontSize: isMobile ? 12 : 11, fontWeight: 600,
                                        background: active ? `${T.green}15` : "transparent",
                                        color: active ? T.green : T.subtext,
                                        border: `1px solid ${active ? T.green : T.border}`,
                                        borderRadius: isMobile ? 12 : 10, cursor: "pointer", textAlign: "left", fontFamily: "'DM Sans', sans-serif",
                                        minHeight: isMobile ? 52 : 44, lineHeight: 1.3
                                    }}>
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "nowrap", position: isMobile ? "sticky" : "static", bottom: 0, background: isMobile ? T.surface : "transparent", padding: isMobile ? "14px 0 calc(14px + env(safe-area-inset-bottom, 0px))" : 0, marginTop: isMobile ? 0 : 6, borderTop: isMobile ? `1px solid ${T.border}` : "none" }}>
                    <button onClick={onApply} style={{
                        flex: 1, padding: isMobile ? "12px 0" : "10px 0",
                        background: T.text, color: T.surface,
                        border: `1px solid ${T.text}`, borderRadius: isMobile ? 12 : 10,
                        minHeight: isMobile ? 48 : 40,
                        fontSize: isMobile ? 14 : 12, fontWeight: 700, cursor: "pointer",
                        boxShadow: "0 10px 24px rgba(15,23,42,0.16)",
                        fontFamily: "'DM Sans', sans-serif"
                    }}>Apply</button>
                    <button onClick={onClear} style={{
                        flex: 1, padding: isMobile ? "12px 0" : "10px 0",
                        background: "transparent", color: T.subtext,
                        border: `1px solid ${T.border}`, borderRadius: isMobile ? 12 : 10,
                        minHeight: isMobile ? 48 : 40,
                        fontSize: isMobile ? 14 : 12, cursor: "pointer",
                        fontFamily: "'DM Sans', sans-serif"
                    }}>Clear</button>
                </div>
            </div>
        </>
    );

    if (isMobile) {
        return (
            <>
                <div onClick={onClear}
                    style={{ position: "fixed", inset: 0, zIndex: 290, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)" }} />
                <div style={{
                    position: "fixed", left: 0, right: 0, bottom: "calc(58px + env(safe-area-inset-bottom, 0px))", zIndex: 300,
                    background: T.surface, borderTop: `1px solid ${T.border}`,
                    borderRadius: "20px 20px 0 0",
                    display: "flex", flexDirection: "column",
                    maxHeight: "calc(86vh - 58px)",
                    animation: "slideInBottom 0.22s cubic-bezier(0.4,0,0.2,1)",
                    boxShadow: "0 -18px 50px rgba(0,0,0,0.35)",
                }}>
                    {content}
                </div>
            </>
        );
    }

    return (
        <div style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 300,
            width: 356,
            background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16,
            boxShadow: "0 20px 50px rgba(0,0,0,0.22)", animation: "slideUp 0.15s ease",
            overflow: "hidden",
        }}>
            {content}
        </div>
    );
}

// ─── Ticker Autocomplete ──────────────────────────────────────
function TickerSearch({ value, onChange, onSelect, onSubmit, addError, T, compact, isMobile = false }) {
    const [sugg, setSugg] = useState([]);
    const [open, setOpen] = useState(false);
    const [hi, setHi] = useState(-1);
    const [busy, setBusy] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
    }, []);
    const search = useCallback(async q => {
        if (!q || q.length < 1) { setSugg([]); setOpen(false); return; }
        setBusy(true);
        try {
            const r = await fetch(`${SUPABASE_URL}/rest/v1/stock_52w?ticker=ilike.${encodeURIComponent(q)}*&select=ticker,close&limit=10&order=ticker.asc`, { headers: hdrs(null) });
            const data = r.ok ? await r.json() : [];
            setSugg(data || []); setOpen((data || []).length > 0);
        } catch { setSugg([]); }
        setBusy(false);
    }, []);
    const pick = s => { onChange(s.ticker); onSelect(s.ticker); setSugg([]); setOpen(false); setHi(-1); };
    const onKD = e => {
        if (e.key === "ArrowDown") { e.preventDefault(); setHi(h => Math.min(h + 1, sugg.length - 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
        else if (e.key === "Enter") { if (hi >= 0 && sugg[hi]) { pick(sugg[hi]); } else { setOpen(false); onSubmit(); } }
        else if (e.key === "Escape") { setOpen(false); }
    };
    return (
        <div ref={ref} style={{ position: "relative" }}>
            <div style={{ display: "flex", gap: isMobile ? 8 : 6, alignItems: "center" }}>
                <div style={{ flex: 1, position: "relative" }}>
                    <input
                        value={value}
                        onChange={e => { onChange(e.target.value); search(e.target.value); }}
                        onKeyDown={onKD}
                        onFocus={() => sugg.length > 0 && setOpen(true)}
                        placeholder="Add ticker…"
                        style={{
                            width: "100%", padding: isMobile ? "12px 38px 12px 13px" : "8px 32px 8px 10px",
                            background: T.card, border: `1px solid ${addError ? "#dc2626" : T.border}`,
                            borderRadius: isMobile ? 12 : 8, color: T.text, fontSize: isMobile ? 16 : 12, outline: "none",
                            fontFamily: "'IBM Plex Mono',monospace", textTransform: "uppercase",
                            letterSpacing: "0.04em",
                            boxShadow: addError ? "none" : "inset 0 1px 0 rgba(255,255,255,0.04)",
                            transition: "border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease",
                        }}
                        onFocusCapture={e => {
                            e.currentTarget.style.borderColor = addError ? "#dc2626" : `${T.green}90`;
                            e.currentTarget.style.boxShadow = `0 0 0 3px ${T.green}18`;
                            if (sugg.length > 0) setOpen(true);
                        }}
                        onBlur={e => {
                            e.currentTarget.style.borderColor = addError ? "#dc2626" : T.border;
                            e.currentTarget.style.boxShadow = addError ? "none" : "inset 0 1px 0 rgba(255,255,255,0.04)";
                        }}
                    />
                    <span style={{ position: "absolute", right: isMobile ? 12 : 9, top: "50%", transform: "translateY(-50%)", fontSize: busy ? 10 : 12, color: T.subtext, animation: busy ? "spin 0.8s linear infinite" : "none", display: "inline-block", pointerEvents: "none", opacity: 0.7 }}>{busy ? "..." : "+"}</span>
                </div>
                {compact && (
                    <button onClick={onSubmit} disabled={!value.trim()}
                        style={{
                            width: isMobile ? 42 : 32,
                            height: isMobile ? 42 : 32,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: value.trim() ? T.green : "transparent",
                            color: value.trim() ? "#06120c" : T.subtext,
                            border: `1px solid ${value.trim() ? T.green : T.border}`,
                            borderRadius: isMobile ? 12 : 8,
                            fontSize: 16,
                            fontWeight: 700,
                            cursor: !value.trim() ? "not-allowed" : "pointer",
                            opacity: !value.trim() ? 0.45 : 1,
                            flexShrink: 0,
                            transition: "transform 0.14s ease, opacity 0.14s ease, background 0.14s ease",
                        }}>+</button>
                )}
            </div>
            {open && sugg.length > 0 && (
                <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 400, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, minWidth: "100%", maxHeight: 240, overflowY: "auto", boxShadow: "0 18px 44px rgba(0,0,0,0.22)", overflow: "hidden" }}>
                    {sugg.map((s, i) => (
                        <div key={s.ticker} onMouseDown={() => pick(s)} onMouseEnter={() => setHi(i)}
                            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: isMobile ? "10px 12px" : "8px 10px", cursor: "pointer", background: i === hi ? T.hover : "transparent", borderBottom: `1px solid ${T.border}` }}>
                            <span style={{ fontWeight: 600, fontSize: 12, color: T.text, fontFamily: "'IBM Plex Mono',monospace" }}>{s.ticker}</span>
                            {s.close != null && <span style={{ fontSize: 11, color: T.subtext, fontFamily: "'IBM Plex Mono',monospace" }}>₹{(+s.close).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
//  STOCK ROW — Multi-line institutional card
//  Layout:
//    [NAME]         [PRICE]      [RS##]
//    3M   6M  12M
//    VOL x.x  [S2] [BO] [VOL]
// ═══════════════════════════════════════════════════════════════
// ONLY KEY UPDATED PARTS (StockRow + improvements)
// Drop-in replacement for StockRow component

const StockRow = memo(({ row, price, sparkData, onRemove, onExpand, isExpanded, isKeySelected, T, screenMembership, onNavigateToScreen, bestPriceFn, isPricePendingFn, isMarketLiveFn, livePriceTick, isMobile, earningsDate }) => {
    const [hov, setHov] = useState(false);
    const [showAllSignals, setShowAllSignals] = useState(false);

    // Resolve the best available price: Yahoo live (green) > bhav_copy > row.close
    const _bp = bestPriceFn ? bestPriceFn(row.ticker, price?.price ?? row.close) : null;
    const p = _bp?.price ?? price?.price ?? row.close;
    const isLivePrice = _bp?.source === "yahoo";
    const isPending = isMarketLiveFn?.() && isPricePendingFn?.(row.ticker) && (price?.price ?? row.close) != null;
    const rsVal = row.rs_rating != null ? Math.round(+row.rs_rating) : null;

    const isLeader = rsVal >= 90;
    const isStage2 = row.trend === "stage2";

    const bg = isExpanded
        ? `${T.green}12`
        : isKeySelected || hov
            ? T.hover
            : "transparent";

    const borderLeft = isLeader
        ? `3px solid ${T.green}`
        : "3px solid transparent";

    const rc = v => v == null ? T.subtext : +v >= 0 ? T.pos : T.neg;

    // ── Stage label (all 3 stages) ─────────────────────────────
    const stageLabel = row.trend === "stage2" ? "Stage 2"
        : row.trend === "stage1" ? "Stage 1"
            : row.trend === "stage4" ? "Stage 4"
                : null;

    // ── Screen pills derived directly from row data ────────────
    // (No dependency on async screenMembership universe fetch)
    const SCREEN_PILL_CFG = {
        // Market Leaders — blue/violet
        "RS Leader": { color: "#a78bfa", bg: "rgba(167,139,250,0.12)", border: "rgba(167,139,250,0.3)" },
        "Near 52W High": { color: "#60a5fa", bg: "rgba(96,165,250,0.12)", border: "rgba(96,165,250,0.3)" },
        "Multi-TF RS": { color: "#818cf8", bg: "rgba(129,140,248,0.12)", border: "rgba(129,140,248,0.3)" },
        "RS Accel": { color: "#c084fc", bg: "rgba(192,132,252,0.12)", border: "rgba(192,132,252,0.3)" },
        // Breakouts — green
        "Vol Breakout": { color: "#34d399", bg: "rgba(52,211,153,0.10)", border: "rgba(52,211,153,0.28)" },
        "52W High BO": { color: "#4ade80", bg: "rgba(74,222,128,0.10)", border: "rgba(74,222,128,0.28)" },
        "Pivot BO": { color: "#22c55e", bg: "rgba(34,197,94,0.10)", border: "rgba(34,197,94,0.28)" },
        // Pullbacks — amber/orange
        "Pullback 50DMA": { color: "#fbbf24", bg: "rgba(251,191,36,0.10)", border: "rgba(251,191,36,0.28)" },
        "Shallow PB": { color: "#fb923c", bg: "rgba(251,146,60,0.10)", border: "rgba(251,146,60,0.28)" },
        "Weekly PB": { color: "#f59e0b", bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.28)" },
        "Vol Dry-up": { color: "#d97706", bg: "rgba(217,119,6,0.08)", border: "rgba(217,119,6,0.22)" },
    };

    // Derive screens from row fields directly — always works, no async dependency
    const rs = row.rs_rating ?? 0;
    const cl = row.close ?? 0;
    const s50 = row.sma50 ?? 0;
    const s200 = row.sma200 ?? 0;
    const pctH = row.pct_from_high ?? 0;
    const rv = row.rel_vol ?? 0;
    const p20w = row.pivot_20w ?? 0;

    const rowScreens = [];
    // Market Leaders
    if (rs >= 85) rowScreens.push("RS Leader");
    if (pctH >= -5 && cl > s50 && cl > s200) rowScreens.push("Near 52W High");
    if (rs >= 70 && rv >= 2.0 && cl > s50 && cl > s200) rowScreens.push("Vol Breakout");
    if (pctH >= -7 && cl > s50 && cl > s200 && rs >= 80) rowScreens.push("52W High BO");
    if (p20w > 0 && cl >= p20w * 0.97 && cl > s50 && s200 > 0) rowScreens.push("Pivot BO");
    if (s50 > 0 && Math.abs(cl - s50) / s50 < 0.03 && cl > s200 && rs >= 70) rowScreens.push("Pullback 50DMA");
    if (p20w > 0 && cl < p20w && cl >= p20w * 0.95 && cl > s50 && rs >= 80) rowScreens.push("Shallow PB");
    if (p20w > 0 && cl >= p20w * 0.95 && cl > s50 && rs >= 75) rowScreens.push("Weekly PB");
    if (rv > 0 && rv < 0.7 && cl > s50 && cl > s200 && rs >= 60) rowScreens.push("Vol Dry-up");
    // Multi-TF RS — needs rs_3m/rs_6m/rs_12m from screenMembership if available, else skip
    const smScreens = screenMembership?.[row.ticker] ?? [];
    if (smScreens.includes("Multi-TF RS") || smScreens.includes("RS Accel")) {
        if (!rowScreens.includes("Multi-TF RS") && smScreens.includes("Multi-TF RS")) rowScreens.push("Multi-TF RS");
        if (!rowScreens.includes("RS Accel") && smScreens.includes("RS Accel")) rowScreens.push("RS Accel");
    }
    // ── PRIORITY ORDER (most actionable first) ─────────────
    const PRIORITY = [
        "RS Leader",
        "52W High BO",
        "Pivot BO",
        "Vol Breakout",
        "Pullback 50DMA",
        "Shallow PB",
        "Weekly PB",
        "Vol Dry-up"
    ];

    // ── Sort screens by priority ───────────────────────────
    const tickerScreens = [...rowScreens].sort((a, b) => {
        const ai = PRIORITY.indexOf(a);
        const bi = PRIORITY.indexOf(b);

        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    return (
        <div
            className="wl-stock-row"
            onClick={() => onExpand(row.ticker)}
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            style={{
                background: isExpanded
                    ? (T.green ? `${T.green}14` : T.hover)
                    : hov || isKeySelected
                        ? (T.hover || "transparent")
                        : (T.card || "transparent"),
                border: `1px solid ${isExpanded ? `${T.green}40` : hov || isKeySelected ? T.border : `${T.border}80`}`,
                borderBottom: `1px solid ${isExpanded ? `${T.green}40` : `${T.border}80`}`,
                borderLeft: isLeader
                    ? `4px solid ${T.green}`
                    : "4px solid transparent",
                padding: isMobile ? "12px 14px 12px 10px" : "10px 16px 10px 14px",
                boxShadow: isLeader
                    ? `inset 3px 0 0 ${T.green}, 0 10px 24px ${T.shadow || "rgba(15,23,42,0.08)"}`
                    : hov || isKeySelected || isExpanded
                        ? `0 10px 24px ${T.shadow || "rgba(15,23,42,0.08)"}`
                        : "none",
                marginLeft: isMobile ? 2 : 0,
                marginBottom: 10,
                borderRadius: isMobile ? 16 : 18,
                cursor: "pointer",
                transition: "all 0.15s ease",
            }}
        >
            {/* ROW 1 — ticker + price + RS + sparkline */}
            <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 4,
            }}>
                <span style={{
                    fontSize: isMobile ? 13 : 15,
                    fontWeight: 500,
                    letterSpacing: "0.06em",
                    color: T.text,
                    fontFamily: "'DM Mono', monospace",
                }}>
                    {row.ticker}
                </span>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {rsVal != null && (
                        <span style={{
                            fontSize: isMobile ? 11 : 12,
                            fontWeight: 500,
                            color: rsVal >= 90 ? T.green : T.subtext,
                            fontFamily: "'DM Mono', monospace",
                            letterSpacing: "0.04em",
                        }}>
                            RS {rsVal}
                        </span>
                    )}
                    {/* Price */}
                    <span style={{
                        fontSize: isMobile ? 14 : 16,
                        fontWeight: 500,
                        color: T.text,
                        fontFamily: "'DM Mono', monospace",
                        letterSpacing: "0.01em",
                        transition: "color 0.25s",
                    }}>
                        {p != null ? `₹${p.toLocaleString("en-IN")}` : "—"}
                        {isPending && (
                            <span title="Fetching live price…" style={{
                                display: "inline-block",
                                width: 4, height: 4,
                                borderRadius: "50%",
                                background: "#34d399",
                                opacity: 0.6,
                                marginLeft: 3,
                                verticalAlign: "middle",
                                animation: "wlPricePulse 1.2s ease-in-out infinite",
                            }} />
                        )}
                    </span>

                    <div style={{ opacity: hov ? 1 : 0.5, transition: "opacity 0.15s" }}>
                        <Sparkline
                            data={sparkData}
                            positive={(row.ret_3m ?? 0) >= 0}
                            width={48}
                            height={18}
                        />
                    </div>
                </div>
            </div>

            {/* ROW 2 — returns + vol/stage info */}
            <div style={{
                display: "flex",
                alignItems: "center",
                fontSize: isMobile ? 12 : 13,
                fontWeight: 500,
                fontFamily: "'DM Mono', monospace",
                gap: 0,
            }}>
                <span style={{ color: rc(row.ret_3m), letterSpacing: "0.02em" }}>
                    {row.ret_3m != null ? `${Math.round(row.ret_3m) > 0 ? "+" : ""}${Math.round(row.ret_3m)}%` : "—"}
                </span>
                <span style={{ margin: "0 5px", color: T.subtext }}>·</span>
                <span style={{ color: rc(row.ret_6m) }}>
                    {row.ret_6m != null ? `${Math.round(row.ret_6m) > 0 ? "+" : ""}${Math.round(row.ret_6m)}%` : "—"}
                </span>
                <span style={{ margin: "0 5px", color: T.subtext }}>·</span>
                <span style={{ color: rc(row.ret_12m) }}>
                    {row.ret_12m != null ? `${Math.round(row.ret_12m) > 0 ? "+" : ""}${Math.round(row.ret_12m)}%` : "—"}
                </span>

                {(row.rel_vol != null || stageLabel) && (
                    <>
                        <span style={{ margin: "0 8px", color: T.border, fontSize: isMobile ? 11 : 12 }}>|</span>
                        <span style={{ color: T.subtext, fontSize: isMobile ? 11 : 12, letterSpacing: "0.03em" }}>
                            {row.rel_vol != null ? `${row.rel_vol.toFixed(1)}×` : ""}
                            {stageLabel ? ` · ${stageLabel}` : ""}
                        </span>
                    </>
                )}

                <div style={{ flex: 1 }} />

                <button
                    className="wl-remove-btn"
                    onClick={e => { e.stopPropagation(); onRemove(row.ticker); }}
                    style={{
                        opacity: isMobile ? 0.3 : 0,
                        transition: "opacity 0.15s",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: isMobile ? 10 : 12,
                        color: T.subtext,
                        padding: isMobile ? "4px 6px" : "0 2px",
                        minWidth: isMobile ? 28 : undefined,
                        minHeight: isMobile ? 28 : undefined,
                        display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                >
                    ✕
                </button>
            </div>

            {/* ROW 3 — Screen membership pills */}
            {tickerScreens.length > 0 && (() => {
                const PRIORITY = ["52W High BO", "Pivot BO", "Vol Breakout", "RS Leader", "Pullback 50DMA", "Shallow PB", "Weekly PB", "Vol Dry-up"];
                const sortedScreens = [...tickerScreens].sort((a, b) => {
                    const ai = PRIORITY.indexOf(a); const bi = PRIORITY.indexOf(b);
                    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
                });
                const MAX_VISIBLE = 2;
                const visibleScreens = showAllSignals ? sortedScreens : sortedScreens.slice(0, MAX_VISIBLE);
                const hiddenCount = sortedScreens.length - MAX_VISIBLE;
                return (
                    <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 6, flexWrap: "nowrap", overflow: "hidden" }}>
                        {visibleScreens.map(screenName => {
                            const cfg = SCREEN_PILL_CFG[screenName] || { color: T.subtext, bg: "transparent", border: T.border };
                            const canNav = !!onNavigateToScreen;
                            return (
                                <span key={screenName}
                                    title={canNav ? `View screen: ${screenName}` : screenName}
                                    onClick={canNav ? e => { e.stopPropagation(); onNavigateToScreen(screenName); } : undefined}
                                    style={{
                                        fontSize: isMobile ? 9 : 10, fontWeight: 500, padding: "2px 6px", borderRadius: 3,
                                        background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color,
                                        whiteSpace: "nowrap", letterSpacing: "0.05em", textTransform: "uppercase",
                                        flexShrink: 0, cursor: canNav ? "pointer" : "default", transition: "opacity 0.12s",
                                        fontFamily: "'DM Sans', sans-serif",
                                    }}
                                    onMouseEnter={canNav ? e => { e.currentTarget.style.opacity = "0.65"; } : undefined}
                                    onMouseLeave={canNav ? e => { e.currentTarget.style.opacity = "1"; } : undefined}
                                >{screenName}</span>
                            );
                        })}
                        {!showAllSignals && hiddenCount > 0 && (
                            <span onClick={e => { e.stopPropagation(); setShowAllSignals(true); }}
                                style={{
                                    fontSize: isMobile ? 9 : 10, color: T.green, flexShrink: 0, cursor: "pointer", fontWeight: 500,
                                    fontFamily: "'DM Mono',monospace", opacity: 0.7
                                }}>+{hiddenCount}</span>
                        )}
                        {showAllSignals && sortedScreens.length > MAX_VISIBLE && (
                            <span onClick={e => { e.stopPropagation(); setShowAllSignals(false); }}
                                style={{
                                    fontSize: isMobile ? 9 : 10, color: T.subtext, flexShrink: 0, cursor: "pointer",
                                    fontFamily: "'DM Mono',monospace", opacity: 0.5
                                }}>less</span>
                        )}
                    </div>
                );
            })()}

            {/* ROW 4 — Upcoming earnings date */}
            {earningsDate && (() => {
                const today = new Date(); today.setHours(0, 0, 0, 0);
                const d = new Date(earningsDate + "T00:00:00");
                const daysLeft = Math.round((d - today) / 86400000);
                const label = daysLeft === 0 ? "Today" : daysLeft === 1 ? "Tomorrow" : `in ${daysLeft}d`;
                const urgColor = daysLeft === 0 ? "#f59e0b"
                    : daysLeft <= 3 ? "#f87171"
                        : daysLeft <= 7 ? "#fb923c"
                            : daysLeft <= 14 ? T.green
                                : T.subtext;
                const dateStr = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
                return (
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: tickerScreens.length > 0 ? 5 : 6 }}>
                        <span style={{
                            fontSize: isMobile ? 9 : 10, fontWeight: 500, padding: "2px 6px", borderRadius: 3,
                            background: `${urgColor}15`, border: `1px solid ${urgColor}40`,
                            color: urgColor, whiteSpace: "nowrap", letterSpacing: "0.04em",
                            fontFamily: "'DM Sans', sans-serif", flexShrink: 0,
                        }}>
                            📅 Results {dateStr}
                        </span>
                        <span style={{
                            fontSize: isMobile ? 9 : 10, color: urgColor, fontFamily: "'DM Mono', monospace",
                            letterSpacing: "0.04em", opacity: 0.75, flexShrink: 0,
                        }}>
                            {label}
                        </span>
                    </div>
                );
            })()}
        </div>
    );
});

// ─── Compare Panel ────────────────────────────────────────────
function ComparePanel({ watchlists, token, onClose, T }) {
    const [sel, setSel] = useState([]);
    const [data, setData] = useState([]);
    const [busy, setBusy] = useState(false);
    const toggle = id => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
    const run = useCallback(async () => {
        if (sel.length < 2) return;
        setBusy(true);
        try { setData(await RPC("compare_watchlists", { p_watchlist_ids: sel }, token) || []); }
        catch { setData([]); }
        setBusy(false);
    }, [sel, token]);
    const wlMap = useMemo(() => { const m = {}; watchlists.forEach(w => { m[w.id] = w.name; }); return m; }, [watchlists]);
    return (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={e => e.target === e.currentTarget && onClose()}>
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 22, width: 580, maxHeight: "80vh", overflow: "auto" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <h3 style={{ fontSize: 13, fontWeight: 500, color: T.text, margin: 0 }}>Compare Watchlists</h3>
                    <button onClick={onClose} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 5, color: T.subtext, cursor: "pointer", fontSize: 12, padding: "4px 8px" }}>✕</button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12 }}>
                    {watchlists.map(w => (
                        <button key={w.id} onClick={() => toggle(w.id)}
                            style={{
                                padding: "3px 11px", borderRadius: 14, fontSize: 11, cursor: "pointer",
                                background: sel.includes(w.id) ? `${T.green}18` : "transparent",
                                color: sel.includes(w.id) ? T.green : T.subtext,
                                border: `1px solid ${sel.includes(w.id) ? T.green : T.border}`
                            }}>{w.name}</button>
                    ))}
                </div>
                <button onClick={run} disabled={sel.length < 2 || busy}
                    style={{ padding: "5px 16px", background: T.green, color: "#fff", border: "none", borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: sel.length < 2 ? "not-allowed" : "pointer", opacity: sel.length < 2 ? 0.5 : 1, marginBottom: 16 }}>
                    {busy ? "Comparing…" : "Compare"}</button>
                {data.length > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(data.length, 3)},1fr)`, gap: 8 }}>
                        {data.map(d => (
                            <div key={d.watchlist_id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 7, padding: 10 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: T.text, marginBottom: 8, borderBottom: `1px solid ${T.border}`, paddingBottom: 6 }}>{wlMap[d.watchlist_id] || "—"}</div>
                                {[["Stocks", d.stock_count, T.text], ["Avg RS", d.avg_rs, T.green], ["Avg 3M", fmt.pct(d.avg_ret_3m), retColor(d.avg_ret_3m, T)], ["Avg 6M", fmt.pct(d.avg_ret_6m), retColor(d.avg_ret_6m, T)], ["Avg 12M", fmt.pct(d.avg_ret_12m), retColor(d.avg_ret_12m, T)]].map(([l, v, c]) => (
                                    <div key={l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                        <span style={{ fontSize: 10, color: T.subtext }}>{l}</span>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: c, fontFamily: "'IBM Plex Mono',monospace" }}>{v}</span>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
//  DETAIL PANEL — Right panel (320px)
//  Structure: Header · Chart · Performance · Levels
// ═══════════════════════════════════════════════════════════════
function DetailPanel({ row, sparkData, onClose, T }) {
    if (!row) return null;
    const rc = v => retColor(v, T);
    const isUp = (row.ret_3m ?? 0) >= 0;
    const SparkChart = () => {
        if (!sparkData || sparkData.length < 2)
            return <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: T.subtext, fontSize: 11 }}>No chart data</div>;
        const vals = sparkData.map(d => +d.close);
        const mn = Math.min(...vals), mx = Math.max(...vals), rng = mx - mn || 1;
        const W = 290, H = 120;
        const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * W},${H - ((v - mn) / rng) * (H - 6) - 3}`).join(" ");
        const color = isUp ? T.pos : T.neg;
        return (
            <svg width="100%" viewBox={`0 0 ${W} ${H + 6}`} preserveAspectRatio="none">
                <defs><linearGradient id="dp-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.15" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient></defs>
                <polygon points={`0,${H + 6} ${pts} ${W},${H + 6}`} fill="url(#dp-grad)" />
                <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
            </svg>
        );
    };
    const MetricRow = ({ label, value, color }) => (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 11, color: T.subtext }}>{label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: color || T.text, fontFamily: "'IBM Plex Mono',monospace" }}>{value}</span>
        </div>
    );
    return (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, display: "flex", justifyContent: "flex-end" }}
            onClick={e => e.target === e.currentTarget && onClose()}>
            <div style={{
                background: T.surface,
                borderLeft: `1px solid ${T.border}`,
                width: 320, height: "100%", overflow: "auto",
                padding: "18px 16px", display: "flex", flexDirection: "column", gap: 16,
                animation: "slideInRight 0.18s ease",
            }}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: T.text, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: "0.01em" }}>{row.ticker}</div>
                        <div style={{ fontSize: 21, fontWeight: 700, color: T.text, fontFamily: "'IBM Plex Mono',monospace", marginTop: 2 }}>{fmt.priceFull(row.close)}</div>
                        <div style={{ display: "flex", gap: 8, marginTop: 5, alignItems: "center" }}>
                            {row.rs_rating != null && (
                                <span style={{ fontSize: 11, fontWeight: 700, color: T.green, fontFamily: "'IBM Plex Mono',monospace" }}>RS {Math.round(row.rs_rating)}</span>
                            )}
                            {row.trend && (
                                <span style={{
                                    fontSize: 10, padding: "2px 6px", borderRadius: 3,
                                    border: `1px solid ${T.border}`, color: T.subtext,
                                }}>
                                    {row.trend === "stage2" ? "Stage 2 ↑" : row.trend === "stage1" ? "Stage 1 →" : "Stage 4 ↓"}
                                </span>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: "transparent", border: `1px solid ${T.border}`, borderRadius: 5, padding: "4px 8px", cursor: "pointer", color: T.subtext, fontSize: 12 }}>✕</button>
                </div>

                {/* Chart */}
                <div style={{ background: T.card, borderRadius: 6, padding: "10px 10px 6px", overflow: "hidden" }}>
                    <div style={{ fontSize: 9, color: T.subtext, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>90-Day Chart</div>
                    <SparkChart />
                </div>

                {/* Performance */}
                <div>
                    <div style={{ fontSize: 9, color: T.subtext, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Performance</div>
                    <MetricRow label="3 Month" value={fmt.pct(row.ret_3m)} color={rc(row.ret_3m)} />
                    <MetricRow label="6 Month" value={fmt.pct(row.ret_6m)} color={rc(row.ret_6m)} />
                    <MetricRow label="12 Month" value={fmt.pct(row.ret_12m)} color={rc(row.ret_12m)} />
                </div>

                {/* Levels */}
                <div>
                    <div style={{ fontSize: 9, color: T.subtext, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Levels</div>
                    <MetricRow label="52W High" value={fmt.priceFull(row.high_52w)} />
                    <MetricRow label="52W Low" value={fmt.priceFull(row.low_52w)} />
                    <MetricRow label="50 DMA" value={fmt.priceFull(row.sma50)} />
                    <MetricRow label="200 DMA" value={fmt.priceFull(row.sma200)} />
                    {row.pivot_20w != null && <MetricRow label="20W Pivot" value={fmt.priceFull(row.pivot_20w)} />}
                </div>

                {/* Quality */}
                <div>
                    <div style={{ fontSize: 9, color: T.subtext, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Quality</div>
                    <MetricRow label="RS Rating" value={row.rs_rating != null ? Math.round(row.rs_rating) : "—"} color={T.green} />
                    <MetricRow label="Rel Volume" value={row.rel_vol != null ? `${row.rel_vol.toFixed(1)}×` : "—"} color={row.rel_vol >= 2 ? T.pos : undefined} />
                    {row.pct_from_high != null && <MetricRow label="From 52W High" value={fmt.pct(row.pct_from_high)} color={rc(row.pct_from_high)} />}
                    {row.pct_from_low != null && <MetricRow label="From 52W Low" value={`+${Math.round(row.pct_from_low)}%`} color={T.pos} />}
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function WatchlistDashboard({ T, session, getToken, darkMode: darkModeProp, onToggleDark, onNavigateToScreen, onTechnoFunda,
    fetchAndCachePrice, bestPrice, isPricePending, isMarketLive }) {
    // ── Fallback stubs so the component works standalone (e.g. storybook / tests) ──
    const _isMarketLive = isMarketLive ?? (() => false);
    const _bestPrice = bestPrice ?? ((_, bhav) => bhav != null ? { price: bhav, source: "bhav" } : null);
    const _isPricePending = isPricePending ?? (() => false);
    const _fetchAndCache = fetchAndCachePrice ?? (() => Promise.resolve());
    const token = session?.access_token || null;
    const userId = session?.user?.id || null;

    // Add near top of WatchlistDashboard component body:
    const getFreshToken = useCallback(async () => {
        if (getToken) return getToken();
        return session?.access_token || null;
    }, [getToken, session]);

    // ── Mobile detection ─────────────────────────────────────────
    const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
    useEffect(() => {
        const handler = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener("resize", handler);
        return () => window.removeEventListener("resize", handler);
    }, []);

    // State
    const [watchlists, setWatchlists] = useState([]);
    const [activeWl, setActiveWl] = useState(null);
    const [wlLoading, setWlLoading] = useState(false);
    const [newWlName, setNewWlName] = useState("");
    const [creatingWl, setCreatingWl] = useState(false);
    const [wlError, setWlError] = useState("");
    const [renamingId, setRenamingId] = useState(null);
    const [renameVal, setRenameVal] = useState("");
    const [rows, setRows] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [tableLoading, setTableLoading] = useState(false);
    const [page, setPage] = useState(0);
    const [sortCol, setSortCol] = useState("rs_rating");
    const [sortAsc, setSortAsc] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [addTicker, setAddTicker] = useState("");
    const [addError, setAddError] = useState("");
    const [addLoading, setAddLoading] = useState(false);
    const [prices, setPrices] = useState({});
    const [priceLoading, setPriceLoading] = useState(false);
    const [sparklines, setSparklines] = useState({});
    const [filterDraft, setFilterDraft] = useState({});
    const [filtersApplied, setFiltersApplied] = useState({});
    const [filterOpen, setFilterOpen] = useState(false);
    const [quickFilter, setQuickFilter] = useState(null);
    const [expandedTicker, setExpandedTicker] = useState(null);
    const [keySelectedIdx, setKeySelectedIdx] = useState(-1);
    const [compareOpen, setCompareOpen] = useState(false);
    const [screenMembership, setScreenMembership] = useState({});
    const [eventsMap, setEventsMap] = useState({});
    const [earningsMap, setEarningsMap] = useState({});
    const [eventFilter, setEventFilter] = useState("all");
    const [sidebarOpen, setSidebarOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 768);
    const [feedOpen, setFeedOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 768);
    const [earningsOpen, setEarningsOpen] = useState(false);
    const [feedAnnouncements, setFeedAnnouncements] = useState([]);
    const [feedLoading, setFeedLoading] = useState(true); // true until first cache/network resolves
    // Incremented each time a batch of live prices lands — forces StockRow re-renders
    const [livePriceTick, setLivePriceTick] = useState(0);

    // ── Watchlist drag-to-reorder ────────────────────────────────
    // Custom order is a client-side preference (no backend column for it),
    // persisted per-user in localStorage and reconciled against the live list.
    const [wlOrderIds, setWlOrderIds] = useState([]);
    const [dragWlId, setDragWlId] = useState(null);   // id currently being dragged
    const [dragLiveOrder, setDragLiveOrder] = useState(null);   // live-reordered ids while dragging
    const dragMeta = useRef({ id: null, startY: 0, startIndex: 0, itemHeight: 56, moved: false });
    const wlItemRefs = useRef({});
    const justDraggedRef = useRef(false);

    const dark = darkModeProp ?? true;
    const filterRef = useRef(null);
    const prevActiveWlRef = useRef(null);

    // ── Scroll refs for keyboard navigation per panel ────────────
    const sidebarScrollRef = useRef(null);
    const stocksScrollRef = useRef(null);
    const announcScrollRef = useRef(null);
    const earningsScrollRef = useRef(null);
    const hoveredPanelRef = useRef("stocks"); // "sidebar"|"stocks"|"announcements"|"earnings"

    // ── Effects ─────────────────────────────────────────────────
    useEffect(() => {
        const h = e => { if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, []);

    useEffect(() => {
        const SCROLL_STEP = 80; // px per arrow key press
        const h = e => {
            if (e.key !== "ArrowDown" && e.key !== "ArrowUp" &&
                e.key !== "Enter" && e.key !== "Escape") return;

            const panel = hoveredPanelRef.current;

            // Arrow keys on the stocks panel: scroll the list OR navigate selected row
            if (panel === "stocks") {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    if (!rows.length) return;
                    e.preventDefault();
                    if (e.key === "ArrowDown") setKeySelectedIdx(i => Math.min(i + 1, rows.length - 1));
                    else setKeySelectedIdx(i => Math.max(i - 1, 0));
                    // Also scroll the container to keep selected row visible
                    if (stocksScrollRef.current) {
                        const dir = e.key === "ArrowDown" ? 1 : -1;
                        stocksScrollRef.current.scrollBy({ top: dir * SCROLL_STEP, behavior: "smooth" });
                    }
                    return;
                }
                if (e.key === "Enter" && keySelectedIdx >= 0) {
                    setExpandedTicker(rows[keySelectedIdx]?.ticker || null);
                    return;
                }
                if (e.key === "Escape") { setExpandedTicker(null); setKeySelectedIdx(-1); return; }
            }

            // Arrow keys on sidebar, announcements, earnings — just scroll the container
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                const refMap = {
                    sidebar: sidebarScrollRef,
                    announcements: announcScrollRef,
                    earnings: earningsScrollRef,
                };
                const ref = refMap[panel];
                if (ref?.current) {
                    e.preventDefault();
                    const dir = e.key === "ArrowDown" ? 1 : -1;
                    ref.current.scrollBy({ top: dir * SCROLL_STEP, behavior: "smooth" });
                }
            }
        };
        document.addEventListener("keydown", h);
        return () => document.removeEventListener("keydown", h);
    }, [rows, keySelectedIdx]);

    // Cache-first watchlist load
    useEffect(() => {
        if (!userId) return;
        let hasCached = false;
        try {
            const raw = localStorage.getItem(`wl_list_${userId}`);
            if (raw) {
                const cached = JSON.parse(raw);
                if (cached && Array.isArray(cached.data) && Date.now() - cached.ts < 30 * 60 * 1000) {
                    setWatchlists(cached.data);
                    setActiveWl(prev => prev ?? (cached.data?.[0]?.id || null));
                    hasCached = true;
                }
            }
        } catch { }
        if (!hasCached) setWlLoading(true);
        GET(`watchlists?user_id=eq.${userId}&order=created_at.asc&select=*`, token)
            .then(async data => {
                // Only seed brand-new users — those with zero watchlists AND no seed flag.
                // Never touch existing users' data.
                const alreadySeeded = (() => { try { return !!localStorage.getItem(SEED_FLAG_KEY(userId)); } catch { return false; } })();
                const isNewUser = Array.isArray(data) && data.length === 0 && !alreadySeeded;
                if (isNewUser) {
                    await seedDefaultWatchlists(userId, token);
                    // Re-fetch after seeding so the UI sees the freshly populated watchlists
                    data = await GET(`watchlists?user_id=eq.${userId}&order=created_at.asc&select=*`, token).catch(() => []);
                }
                setWatchlists(data || []);
                setActiveWl(prev => prev ?? (data?.[0]?.id || null));
                try { localStorage.setItem(`wl_list_${userId}`, JSON.stringify({ ts: Date.now(), data: data || [] })); } catch { }
            }).catch(() => { }).finally(() => setWlLoading(false));
    }, [userId, token]);

    // Load the user's saved custom drag order for the watchlist sidebar
    useEffect(() => {
        if (!userId) return;
        try {
            const raw = localStorage.getItem(`wl_order_${userId}`);
            if (raw) {
                const ids = JSON.parse(raw);
                if (Array.isArray(ids)) setWlOrderIds(ids);
            }
        } catch { }
    }, [userId]);

    const persistWlOrder = useCallback((idsArr) => {
        setWlOrderIds(idsArr);
        if (userId) {
            try { localStorage.setItem(`wl_order_${userId}`, JSON.stringify(idsArr)); } catch { }
        }
    }, [userId]);

    // Reconcile saved order against the live watchlist list: known ids keep their
    // saved position, brand-new watchlists (not yet in the saved order) are appended.
    const orderedWatchlists = useMemo(() => {
        if (!wlOrderIds.length) return watchlists;
        const byId = new Map(watchlists.map(w => [w.id, w]));
        const ordered = [];
        for (const id of wlOrderIds) {
            const w = byId.get(id);
            if (w) { ordered.push(w); byId.delete(id); }
        }
        for (const w of watchlists) {
            if (byId.has(w.id)) ordered.push(w);
        }
        return ordered;
    }, [watchlists, wlOrderIds]);

    // Live-reordered list while a drag is in progress; falls back to the saved order otherwise.
    const displayWatchlists = useMemo(() => {
        if (!dragLiveOrder) return orderedWatchlists;
        const byId = new Map(orderedWatchlists.map(w => [w.id, w]));
        return dragLiveOrder.map(id => byId.get(id)).filter(Boolean);
    }, [orderedWatchlists, dragLiveOrder]);

    // ── Drag-to-reorder handlers (Pointer Events — works for mouse, touch, pen) ──
    const handleWlDragMove = useCallback((e) => {
        const meta = dragMeta.current;
        if (!meta.id) return;
        const deltaY = e.clientY - meta.startY;
        if (Math.abs(deltaY) > 4) meta.moved = true;
        const moveBy = Math.round(deltaY / meta.itemHeight);
        setDragLiveOrder(prev => {
            if (!prev) return prev;
            const curIndex = prev.indexOf(meta.id);
            let newIndex = meta.startIndex + moveBy;
            newIndex = Math.max(0, Math.min(prev.length - 1, newIndex));
            if (newIndex === curIndex) return prev;
            const next = [...prev];
            next.splice(curIndex, 1);
            next.splice(newIndex, 0, meta.id);
            return next;
        });
    }, []);

    const handleWlDragEnd = useCallback(() => {
        window.removeEventListener("pointermove", handleWlDragMove);
        window.removeEventListener("pointerup", handleWlDragEnd);
        window.removeEventListener("pointercancel", handleWlDragEnd);
        const moved = dragMeta.current.moved;
        setDragLiveOrder(prev => {
            if (prev && moved) persistWlOrder(prev);
            return null;
        });
        setDragWlId(null);
        dragMeta.current = { id: null, startY: 0, startIndex: 0, itemHeight: 56, moved: false };
        if (moved) {
            justDraggedRef.current = true;
            setTimeout(() => { justDraggedRef.current = false; }, 200);
        }
    }, [handleWlDragMove, persistWlOrder]);

    const handleWlDragStart = useCallback((e, id) => {
        e.stopPropagation();
        e.preventDefault();
        const idsNow = orderedWatchlists.map(w => w.id);
        const startIndex = idsNow.indexOf(id);
        const itemEl = wlItemRefs.current[id];
        const itemHeight = itemEl?.offsetHeight ? itemEl.offsetHeight + 6 : 56;
        dragMeta.current = { id, startY: e.clientY, startIndex, itemHeight, moved: false };
        setDragWlId(id);
        setDragLiveOrder(idsNow);
        window.addEventListener("pointermove", handleWlDragMove);
        window.addEventListener("pointerup", handleWlDragEnd);
        window.addEventListener("pointercancel", handleWlDragEnd);
    }, [orderedWatchlists, handleWlDragMove, handleWlDragEnd]);

    useEffect(() => () => {
        window.removeEventListener("pointermove", handleWlDragMove);
        window.removeEventListener("pointerup", handleWlDragEnd);
        window.removeEventListener("pointercancel", handleWlDragEnd);
    }, [handleWlDragMove, handleWlDragEnd]);

    // ── Lock background scroll while a mobile bottom-sheet is open ──
    // Prevents the page behind fixed-position sheets (filters, announcements,
    // earnings, stock detail) from scrolling, which was pushing sheet content
    // (e.g. the "Show more" button) out of the visible viewport on mobile.
    useEffect(() => {
        if (!isMobile) return;
        const anySheetOpen = filterOpen || feedOpen || earningsOpen || compareOpen || !!expandedTicker || sidebarOpen;
        if (!anySheetOpen) return;
        const prevOverflow = document.body.style.overflow;
        const prevPosition = document.body.style.position;
        const prevWidth = document.body.style.width;
        const scrollY = window.scrollY;
        document.body.style.overflow = "hidden";
        document.body.style.position = "fixed";
        document.body.style.top = `-${scrollY}px`;
        document.body.style.width = "100%";
        return () => {
            document.body.style.overflow = prevOverflow;
            document.body.style.position = prevPosition;
            document.body.style.top = "";
            document.body.style.width = prevWidth;
            window.scrollTo(0, scrollY);
        };
    }, [isMobile, filterOpen, feedOpen, earningsOpen, compareOpen, expandedTicker, sidebarOpen]);

    // Cache-first row load (persistent SWR)
    useEffect(() => {
        if (!activeWl) return;
        let cancelled = false;

        const isSameWl = prevActiveWlRef.current === activeWl;
        prevActiveWlRef.current = activeWl;

        const params = {
            watchlistId: activeWl, token, page, pageSize: PAGE_SIZE, sortCol, sortAsc,
            filters: quickFilter ? { ...filtersApplied, quick: quickFilter } : filtersApplied
        };

        // 1. Serve from in-memory cache (fastest)
        const memCached = getCached(params);
        if (memCached) { setRows(memCached.rows); setTotalCount(memCached.total); }

        // 2. Serve from localStorage (instant on first page load, even if in-memory is cold)
        if (!memCached) {
            const persisted = getPersistedRows(activeWl);
            if (persisted) { setRows(persisted.rows); setTotalCount(persisted.total); }
            else if (!isSameWl) {
                // Only blank the list when switching to a genuinely different (empty) watchlist.
                // When refreshKey bumps after add/remove on the SAME watchlist, keep current
                // rows visible — this is what causes the blink if we call setRows([]) here.
                setRows([]);
            }
            // isSameWl + no cache = add/remove just busted the cache; rows already set optimistically
        }
        // 3. Show loading spinner only when switching to a watchlist with no stale data
        const hasStale = memCached || getPersistedRows(activeWl);
        setTableLoading(!hasStale && !isSameWl);

        // 4. Skip network fetch if data is very fresh (in-memory < 90s or persisted < 90s)
        const persisted = getPersistedRows(activeWl);
        const isFresh = (memCached && Date.now() - memCached.ts < LS_ROWS_FRESH_TTL)
            || (persisted && Date.now() - persisted.ts < LS_ROWS_FRESH_TTL);
        if (isFresh && memCached) { return () => { cancelled = true; }; }

        dedupedFetch(params, () => loadWatchlistRows(params))
            .then(({ rows, total }) => {
                if (cancelled) return;
                setRows(rows); setTotalCount(total);
                setCache(params, { rows, total });
                // Persist to localStorage for instant load on next visit (page=0 only to keep storage lean)
                if (page === 0) setPersistedRows(activeWl, rows, total);
            }).catch(console.error).finally(() => { if (!cancelled) setTableLoading(false); });
        return () => { cancelled = true; };
    }, [activeWl, page, sortCol, sortAsc, filtersApplied, quickFilter, token, refreshKey]);

    // Prefetch next page
    useEffect(() => {
        if (!activeWl) return;
        const nextParams = {
            watchlistId: activeWl, token, page: page + 1, pageSize: PAGE_SIZE, sortCol, sortAsc,
            filters: quickFilter ? { ...filtersApplied, quick: quickFilter } : filtersApplied
        };
        if (getCached(nextParams)) return;
        dedupedFetch(nextParams, () => loadWatchlistRows(nextParams)).then(res => setCache(nextParams, res)).catch(() => { });
    }, [page, activeWl, sortCol, sortAsc, filtersApplied, quickFilter]);

    useEffect(() => { setPage(0); }, [activeWl, filtersApplied, quickFilter]);

    useEffect(() => {
        if (!rows.length) return;
        const missing = rows.map(r => r.ticker).filter(t => !sparklines[t]);
        if (!missing.length) return;
        RPC("get_sparklines", { p_tickers: missing }, token)
            .then(data => {
                const g = {};
                for (const d of (data || [])) { if (!g[d.ticker]) g[d.ticker] = []; g[d.ticker].push(d); }
                setSparklines(prev => ({ ...prev, ...g }));
            }).catch(() => { });
    }, [rows, token]);

    // ── Live price overlay — identical pattern to Screener / Peer Analysis ──────
    // During market hours (9:15 AM – 7:00 PM IST) we batch-fetch Yahoo quotes for
    // every ticker currently visible.  Prices are stored in the shared module-level
    // _sessionPriceCache (via the `fetchAndCachePrice` prop from App.jsx) so tickers
    // already fetched by the Screener are NOT re-fetched here — instant display.
    // Outside market hours we fall back to the bhav_copy close from `rows` unchanged.
    // `livePriceTick` is bumped after every batch to force StockRow re-renders.
    // Prices clear on page refresh (session cache), so users always get a fresh
    // Yahoo hit on next load — exactly the behaviour requested.
    useEffect(() => {
        if (!rows.length) return;
        // Always sync the legacy priceCache with bhav prices so the DetailPanel / fallback
        // paths still have a value for tickers not reached by Yahoo.
        fetchPrices(rows.map(r => r.ticker), token).then(p => setPrices({ ...p })).catch(() => { });

        // Live-price overlay: only fires during market hours and when helper is wired up.
        if (!_isMarketLive()) return;
        let cancelled = false;
        const bhavMap = Object.fromEntries(rows.map(r => [r.ticker?.toUpperCase(), r.close ?? null]));
        // Skip tickers already resolved to a Yahoo price in the session cache
        // (_bestPrice returns source:"yahoo" once the fetch has landed).
        const newOnes = rows.map(r => r.ticker).filter(Boolean)
            .filter(t => _bestPrice(t, bhavMap[t.toUpperCase()])?.source !== "yahoo");
        if (!newOnes.length) return;
        const BATCH = 5;
        let batchIdx = 0;
        const runBatch = async () => {
            if (cancelled) return;
            const batch = newOnes.slice(batchIdx, batchIdx + BATCH);
            if (!batch.length) return;
            batchIdx += BATCH;
            await Promise.allSettled(batch.map(t => _fetchAndCache(t, bhavMap[t.toUpperCase()])));
            if (!cancelled) {
                setLivePriceTick(n => n + 1); // trigger re-render with freshly cached Yahoo prices
                setTimeout(runBatch, 600);    // 600 ms stagger — mirrors Screener pattern
            }
        };
        runBatch();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, token]);

    useEffect(() => {
        const tickers = rows.map(r => r.ticker).filter(Boolean);
        if (!tickers.length) return;
        fetchScreenMembership(tickers, token)
            .then(m => setScreenMembership(prev => ({ ...prev, ...m })))
            .catch(() => { });
    }, [rows, token]);

    // ── Background pre-warm: on first login, silently populate feed caches for ALL watchlists ──
    // This ensures the announcements panel feels instant on every watchlist switch.
    useEffect(() => {
        if (!userId || !token || !watchlists.length) return;
        // Only pre-warm watchlists whose cache is absent or stale
        const stale = watchlists.filter(w => {
            const c = getPersistedFeed(userId, w.id);
            return !c || Date.now() - c.ts > LS_FEED_TTL / 2;
        });
        if (!stale.length) return;
        // Stagger requests to avoid thundering herd
        stale.forEach((w, i) => {
            setTimeout(async () => {
                try {
                    const items = await fetch(
                        `${SUPABASE_URL}/rest/v1/watchlist_items?watchlist_id=eq.${w.id}&select=ticker`,
                        { headers: { ...hdrs(token), "Range-Unit": "items", Range: "0-999" } }
                    ).then(r => r.ok ? r.json() : []);
                    const syms = (items || []).map(x => x.ticker);
                    if (!syms.length) return;
                    const symIn = `(${syms.map(s => `"${encodeURIComponent(s)}"`).join(",")})`;
                    const data = await fetch(
                        `${SUPABASE_URL}/rest/v1/corporate_announcements?symbol=in.${symIn}&select=symbol,announcement_datetime,category,announcement_text,attachment_url,seq_id,priority&order=announcement_datetime.desc`,
                        { headers: { ...hdrs(token), "Range-Unit": "items", Range: "0-999" } }
                    ).then(r => r.ok ? r.json() : []);
                    setPersistedFeed(userId, w.id, data || []);
                } catch { }
            }, i * 400); // 400ms stagger between watchlists
        });
    }, [userId, token, watchlists.length]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!rows.length) return;
        const symbols = rows.map(r => r.ticker);
        try {
            const raw = localStorage.getItem(EVENTS_CACHE_KEY);
            if (raw) {
                const cached = JSON.parse(raw);
                if (Date.now() - cached.ts < EVENTS_CACHE_TTL && cached.data) {
                    const partial = {};
                    symbols.forEach(s => { if (cached.data[s]) partial[s] = cached.data[s]; });
                    if (Object.keys(partial).length > 0) setEventsMap(prev => ({ ...prev, ...partial }));
                }
            }
        } catch { }
        fetchAnnouncements(symbols, token).then(map => {
            if (!map || Object.keys(map).length === 0) return;
            setEventsMap(prev => ({ ...prev, ...map }));
            for (const [sym, ev] of Object.entries(map)) {
                if (ev.seq_id != null && !seenSeqIds.has(ev.seq_id)) {
                    seenSeqIds.add(ev.seq_id);
                }
            }
        }).catch(() => { });
    }, [rows, token]);

    // ── Fetch upcoming earnings dates for all watchlist rows ────
    useEffect(() => {
        if (!rows.length) return;
        const tickers = rows.map(r => r.ticker).filter(Boolean);
        fetchEarningsDates(tickers, token).then(map => {
            if (!map || Object.keys(map).length === 0) return;
            setEarningsMap(prev => ({ ...prev, ...map }));
        }).catch(() => { });
    }, [rows, token]);

    // Full feed: fetch ALL announcements for current watchlist tickers — decoupled from rows.
    // Fires on activeWl change. Always clears stale data first so we never show
    // a previous watchlist's announcements while the new one loads.
    useEffect(() => {
        if (!activeWl) return;
        let cancelled = false;

        // ── PHASE 1: Clear previous watchlist's data immediately, then serve cache if available ──
        // Always reset first to prevent cross-watchlist bleed.
        setFeedAnnouncements([]);
        setFeedLoading(true);

        const persistedFeed = userId ? getPersistedFeed(userId, activeWl) : null;
        if (persistedFeed && persistedFeed.data && persistedFeed.data.length > 0) {
            if (!cancelled) setFeedAnnouncements(persistedFeed.data);
            // If fresh enough, skip network fetch entirely
            if (Date.now() - persistedFeed.ts < LS_FEED_FRESH_TTL) {
                if (!cancelled) setFeedLoading(false);
                return () => { cancelled = true; };
            }
            // else: show stale instantly, refresh quietly in background (no full-screen spinner)
            if (!cancelled) setFeedLoading(false);
        }

        // ── PHASE 2: Always fetch ALL tickers for this watchlist from watchlist_items.
        // NEVER use `rows` here — rows is a paginated slice (e.g. 20 of 50 stocks).
        // Using rows would silently drop announcements for stocks on other pages.
        const getSymbols = async () => {
            try {
                const items = await fetch(
                    `${SUPABASE_URL}/rest/v1/watchlist_items?watchlist_id=eq.${activeWl}&select=ticker&order=added_at.asc`,
                    { headers: { ...hdrs(token), "Range-Unit": "items", Range: "0-9999" } }
                ).then(r => r.ok ? r.json() : []);
                return (items || []).map(i => i.ticker);
            } catch { return []; }
        };

        getSymbols().then(symbols => {
            if (cancelled || !symbols.length) {
                if (!cancelled) { setFeedAnnouncements([]); setFeedLoading(false); }
                return;
            }
            const symIn = `(${symbols.map(s => `"${encodeURIComponent(s)}"`).join(",")})`;
            fetch(
                `${SUPABASE_URL}/rest/v1/corporate_announcements?symbol=in.${symIn}&select=symbol,announcement_datetime,category,announcement_text,attachment_url,seq_id,priority&order=announcement_datetime.desc`,
                { headers: { ...hdrs(token), "Range-Unit": "items", Range: "0-999" } }
            ).then(r => r.ok ? r.json() : [])
                .then(data => {
                    if (cancelled) return;
                    const list = data || [];
                    setFeedAnnouncements(list);
                    if (userId) setPersistedFeed(userId, activeWl, list);
                    setFeedLoading(false);
                }).catch(() => { if (!cancelled) setFeedLoading(false); });
        });

        return () => { cancelled = true; };
    }, [activeWl, token, userId]); // NOTE: intentionally NOT in rows dep — rows used opportunistically inside

    // ── Callbacks (memoized) ─────────────────────────────────────
    const refreshPrices = useCallback(async () => {
        if (!rows.length) return;
        setPriceLoading(true);
        const tickers = rows.map(r => r.ticker);
        tickers.forEach(t => delete priceCache[t]);
        setPrices({ ...(await fetchPrices(tickers, token)) });
        setPriceLoading(false);
    }, [rows, token]);

    const createWatchlist = useCallback(async () => {
        const name = newWlName.trim();
        if (!name || !userId) return;
        if (watchlists.length >= MAX_WATCHLISTS) { setWlError(`Max ${MAX_WATCHLISTS} watchlists.`); return; }
        setWlError(""); setCreatingWl(true);
        try {
            const res = await POST("watchlists", { user_id: userId, name }, token);
            const created = Array.isArray(res) ? res[0] : res;
            const updated = [...watchlists, created];
            setWatchlists(updated); setActiveWl(created.id); setNewWlName("");
            try { localStorage.setItem(`wl_list_${userId}`, JSON.stringify({ ts: Date.now(), data: updated })); } catch { };
        } catch (e) { setWlError(e.message?.includes("Maximum") ? e.message : "Failed to create."); }
        setCreatingWl(false);
    }, [newWlName, userId, token, watchlists]);

    const deleteWatchlist = useCallback(async id => {
        if (!window.confirm("Delete this watchlist?")) return;
        await DELETE(`watchlists?id=eq.${id}`, token);
        const rem = watchlists.filter(w => w.id !== id);
        setWatchlists(rem); setWlError("");
        if (activeWl === id) setActiveWl(rem[0]?.id || null);
        try { if (userId) localStorage.setItem(`wl_list_${userId}`, JSON.stringify({ ts: Date.now(), data: rem })); } catch { };
    }, [token, activeWl, watchlists]);

    const renameWatchlist = useCallback(async id => {
        const name = renameVal.trim();
        if (!name) { setRenamingId(null); return; }
        await PATCH(`watchlists?id=eq.${id}`, { name }, token);
        const updated = watchlists.map(w => w.id === id ? { ...w, name } : w);
        setWatchlists(updated); setRenamingId(null);
        try { if (userId) localStorage.setItem(`wl_list_${userId}`, JSON.stringify({ ts: Date.now(), data: updated })); } catch { };
    }, [renameVal, token, userId, watchlists]);

    const addStock = useCallback(async () => {
        const ticker = addTicker.trim().toUpperCase();
        if (!ticker || !activeWl) return;
        setAddError(""); setAddLoading(true);

        // Capture the watchlist we're adding to at call-time so a mid-flight
        // watchlist switch can't corrupt a different list's rows.
        const targetWl = activeWl;

        // Optimistic update — scoped to the target watchlist only.
        // We tag the row with targetWl so it can be safely removed on error.
        setRows(prev => {
            // Only inject if we're still viewing the same watchlist
            if (targetWl !== activeWl) return prev;
            // Prevent duplicate phantom rows
            if (prev.some(r => r.ticker === ticker)) return prev;
            return [{ ticker, loading: true, ret_3m: null, ret_6m: null, ret_12m: null, _optimistic: true }, ...prev];
        });

        try {
            await POST("watchlist_items", { watchlist_id: targetWl, ticker }, token);

            // Bust ONLY the target watchlist's caches — never clear other watchlists.
            // Clearing all caches was the root cause of phantom rows appearing elsewhere.
            for (const [key] of watchlistCache) {
                try {
                    const parsed = JSON.parse(key);
                    if (parsed?.watchlistId === targetWl) watchlistCache.delete(key);
                } catch { watchlistCache.delete(key); } // malformed key — safe to evict
            }
            try { localStorage.removeItem(getRowsCacheKey(targetWl)); } catch { }

            setAddTicker("");
            setTimeout(() => { setRefreshKey(k => k + 1); }, 50);
        } catch (e) {
            setAddError("Failed to add — ticker may not exist or is already in this list");
            // Roll back the optimistic row for the target watchlist only
            setRows(prev => prev.filter(r => !(r.ticker === ticker && r._optimistic)));
        }
        setAddLoading(false);
    }, [addTicker, activeWl, token]);

    const removeStock = useCallback(async (ticker) => {
        if (!activeWl) return;
        // Optimistic remove from UI immediately
        setRows(prev => prev.filter(r => r.ticker !== ticker));
        try {
            await DELETE(`watchlist_items?watchlist_id=eq.${activeWl}&ticker=eq.${ticker}`, token);
            // Bust caches for this watchlist so the removed ticker doesn't reappear
            // from stale localStorage on the next load.
            for (const [key] of watchlistCache) {
                try { const p = JSON.parse(key); if (p?.watchlistId === activeWl) watchlistCache.delete(key); }
                catch { watchlistCache.delete(key); }
            }
            try { localStorage.removeItem(getRowsCacheKey(activeWl)); } catch { }
            setTimeout(() => { setRefreshKey(k => k + 1); }, 50);
        }
        catch { setRefreshKey(k => k + 1); }
    }, [activeWl, token]);

    const toggleSort = useCallback(col => {
        const colToField = { from_high: "pct_from_high", from_low: "pct_from_low" };
        const field = colToField[col] || col;
        if (sortCol === field) setSortAsc(a => !a);
        else { setSortCol(field); setSortAsc(false); }
        setPage(0);
    }, [sortCol]);

    const exportCSV = useCallback(() => {
        const h = ["Ticker", "Price", "3M%", "6M%", "12M%", "RS", "Trend", "52W High%", "Rel Vol"];
        const r = rows.map(r => [r.ticker, prices[r.ticker]?.price ?? "", r.ret_3m ?? "", r.ret_6m ?? "", r.ret_12m ?? "", r.rs_rating ?? "", r.trend ?? "", r.pct_from_high ?? "", r.rel_vol ?? ""]);
        const blob = new Blob([[h, ...r].map(x => x.join(",")).join("\n")], { type: "text/csv" });
        const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${activeWlName || "watchlist"}.csv` });
        a.click(); URL.revokeObjectURL(a.href);
    }, [rows, prices]);

    // ── Derived ──────────────────────────────────────────────────
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);
    const activeFiltersCount = Object.values(filtersApplied).filter(v => v != null).length;
    const activeWlName = watchlists.find(w => w.id === activeWl)?.name || "";
    const atWatchlistLimit = watchlists.length >= MAX_WATCHLISTS;
    const expandedRow = rows.find(r => r.ticker === expandedTicker) || null;
    const avgRS = useMemo(() => rows.length ? Math.round(rows.reduce((a, r) => a + (r.rs_rating ?? 0), 0) / rows.length) : null, [rows]);
    const leaders = useMemo(() => rows.filter(r => (r.rs_rating ?? 0) >= 90).length, [rows]);
    const stage2Count = useMemo(() => rows.filter(r => r.trend === "stage2").length, [rows]);
    const avgRet3m = useMemo(() => {
        const vals = rows.map(r => r.ret_3m).filter(v => v != null && !Number.isNaN(Number(v)));
        return vals.length ? vals.reduce((a, v) => a + Number(v), 0) / vals.length : null;
    }, [rows]);
    const avgRelVol = useMemo(() => {
        const vals = rows.map(r => r.rel_vol).filter(v => v != null && !Number.isNaN(Number(v)));
        return vals.length ? vals.reduce((a, v) => a + Number(v), 0) / vals.length : null;
    }, [rows]);
    const topLeaders = useMemo(() => {
        return [...rows]
            .sort((a, b) => (b.rs_rating ?? -1) - (a.rs_rating ?? -1))
            .slice(0, 5)
            .map(r => r.ticker)
            .filter(Boolean);
    }, [rows]);
    const today = new Date().toDateString();
    const highImpactToday = useMemo(() => rows.filter(r => {
        const ev = eventsMap[r.ticker];
        if (!ev || ev.priority < 4) return false;
        return ev.datetime && new Date(ev.datetime).toDateString() === today;
    }).length, [rows, eventsMap, today]);

    const displayRows = useMemo(() => eventFilter === "high"
        ? rows.filter(r => (eventsMap[r.ticker]?.priority ?? 0) >= 4)
        : rows, [rows, eventFilter, eventsMap]);

    const QUICK_FILTERS = [
        { key: "stage2", label: "Stage 2" },
        { key: "pullback", label: "Pullback" },
        { key: "leaders", label: "Leaders" },
    ];
    const insightCards = activeWl ? [
        { label: "Average RS", value: avgRS != null ? `${avgRS}` : "—", tone: T.green, hint: `${leaders} leaders above 90` },
        { label: "Average 3M", value: avgRet3m != null ? `${avgRet3m >= 0 ? "+" : ""}${avgRet3m.toFixed(1)}%` : "—", tone: avgRet3m != null ? retColor(avgRet3m, T) : T.subtext, hint: `${stage2Count}/${rows.length || 0} in Stage 2` },
        { label: "Liquidity", value: avgRelVol != null ? `${avgRelVol.toFixed(2)}×` : "—", tone: avgRelVol != null && avgRelVol >= 1.5 ? T.pos : T.text, hint: highImpactToday > 0 ? `${highImpactToday} key event${highImpactToday > 1 ? "s" : ""} today` : "No critical events today" },
        { label: "Top 5 Leaders", value: topLeaders.length ? topLeaders.join(", ") : "—", tone: T.text, hint: totalCount > 0 ? `${totalCount} stocks tracked` : "Build this watchlist", compactList: true },
    ] : [];

    // No-auth state
    if (!session) return (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: T.bg, flexDirection: "column", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: T.subtext, opacity: 0.3 }}>◈</div>
            <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: T.text, marginBottom: 4, opacity: 0.7, fontFamily: "'DM Sans',sans-serif" }}>Sign in to use Watchlists</div>
                <div style={{ fontSize: 12, color: T.subtext, opacity: 0.4, fontFamily: "'DM Sans',sans-serif" }}>Track and analyse your favourite stocks.</div>
            </div>
        </div>
    );

    return (
        <>
            <style>{`
        @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideInRight{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:translateX(0)}}
        @keyframes slideInBottom{from{opacity:0;transform:translateY(100%)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes wlPricePulse{0%,100%{opacity:0.35}50%{opacity:1}}
        @keyframes wlChartSpin{to{transform:rotate(360deg)}}
        @keyframes rowEnter{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:6px;height:6px}
        ::-webkit-scrollbar-track{background:${T.card};border-radius:3px}
        ::-webkit-scrollbar-thumb{background:${T.border};border-radius:3px}
        ::-webkit-scrollbar-thumb:hover{background:${T.subtext}}
        .wl-stock-row:hover .wl-remove-btn{opacity:0.4!important}
        .wl-remove-btn:hover{opacity:1!important;color:#ef4444!important}
        .wl-sidebar-item:hover{background:${T.hover}!important}
        .wl-sidebar-item:hover .wl-item-actions{opacity:1!important}
        .wl-drag-handle{opacity:0;transition:opacity 0.15s;touch-action:none}
        .wl-sidebar-item:hover .wl-drag-handle{opacity:0.5}
        .wl-drag-handle:hover{opacity:1!important}
        .wl-sidebar-item.wl-dragging{opacity:0.55;cursor:grabbing!important}
        .wl-toolbar-btn:hover{background:${T.hover}!important;color:${T.text}!important}
        input::placeholder{color:${T.subtext};opacity:0.5}
        /* iOS: prevent zoom on input focus */
        @media (max-width: 767px) { input, select, textarea { font-size: 16px !important; } }
        .wl-pill-btn:hover{opacity:0.7}
        .wl-sort-btn{transition:all 0.15s ease}
        .wl-sort-btn:hover{color:${T.text}!important;border-color:${T.subtext}!important}
        .wl-announce-row:hover{background:${T.hover}!important}
        .wl-premium-shell{position:relative;isolation:isolate}
        .wl-premium-shell::before{
          content:"";
          position:absolute;
          inset:0;
          pointer-events:none;
          background:
            radial-gradient(circle at top left, ${dark ? "rgba(16,185,129,0.12)" : "rgba(5,150,105,0.10)"} 0, transparent 28%),
            radial-gradient(circle at top right, ${dark ? "rgba(99,102,241,0.14)" : "rgba(37,99,235,0.10)"} 0, transparent 34%);
          z-index:-1;
        }
        .wl-glass-panel{
          background:${dark ? "linear-gradient(180deg, rgba(15,23,42,0.88), rgba(15,23,42,0.76))" : "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.92))"};
          border:1px solid ${dark ? "rgba(148,163,184,0.14)" : "rgba(148,163,184,0.20)"};
          box-shadow:${dark ? "0 18px 40px rgba(2,6,23,0.34)" : "0 18px 40px rgba(15,23,42,0.08)"};
          backdrop-filter:blur(18px);
        }
        .wl-insight-card{position:relative;overflow:hidden}
        .wl-insight-card::after{
          content:"";
          position:absolute;
          inset:auto -24px -36px auto;
          width:88px;
          height:88px;
          border-radius:999px;
          background:${dark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.72)"};
          filter:blur(2px);
          pointer-events:none;
        }
        /* Mobile touch improvements */
        @media (max-width: 767px) {
          .wl-stock-row { padding: 12px 12px 12px 10px !important; }
          .wl-remove-btn { opacity: 0.35 !important; }
          .wl-mobile-bottom-bar { position: fixed; bottom: 0; left: 0; right: 0; z-index: 200; }
          .wl-mobile-sidebar-shell { will-change: transform; }
          .wl-toolbar-btn { min-width: 36px; min-height: 36px; }
          .wl-premium-shell::before{
            background:
              radial-gradient(circle at top center, ${dark ? "rgba(16,185,129,0.12)" : "rgba(5,150,105,0.10)"} 0, transparent 34%),
              radial-gradient(circle at bottom right, ${dark ? "rgba(99,102,241,0.14)" : "rgba(37,99,235,0.10)"} 0, transparent 36%);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .wl-mobile-sidebar-shell,
          .wl-mobile-backdrop,
          .wl-toolbar-btn { transition: none !important; }
        }
      `}</style>

            {/* ROOT: Sidebar + Main */}
            <div className="wl-premium-shell" style={{
                flex: 1,
                display: "flex",
                overflow: "hidden",
                background: dark ? "linear-gradient(180deg, #08111f 0%, #0b1423 100%)" : "linear-gradient(180deg, #eef4f8 0%, #f7fafc 100%)",
                height: "100%",
                minHeight: 0,
                fontSize: 14,
                position: "relative",
                padding: isMobile ? 0 : 12,
                gap: isMobile ? 0 : 12,
            }}>

                {/* ── MOBILE OVERLAY BACKDROP ───────────────────────── */}
                {isMobile && (
                    <div
                        onClick={() => setSidebarOpen(false)}
                        className="wl-mobile-backdrop"
                        style={{
                            position: "fixed", inset: 0, zIndex: 150,
                            background: dark ? "rgba(2,6,23,0.58)" : "rgba(15,23,42,0.30)",
                            backdropFilter: sidebarOpen ? "blur(4px)" : "blur(0px)",
                            opacity: sidebarOpen ? 1 : 0,
                            pointerEvents: sidebarOpen ? "auto" : "none",
                            transition: "opacity 0.24s ease, backdrop-filter 0.24s ease",
                        }}
                    />
                )}

                {/* ══ SIDEBAR ═══════════════════════════════════════════ */}
                <div className={isMobile ? "wl-mobile-sidebar-shell" : undefined} style={{
                    width: isMobile ? "min(86vw, 340px)" : (sidebarOpen ? 240 : 0),
                    maxWidth: isMobile ? 340 : 240,
                    flexShrink: 0,
                    background: isMobile
                        ? (dark ? "linear-gradient(180deg, #0a1422 0%, #0d1829 100%)" : "linear-gradient(180deg, #fdfefe 0%, #f4f8fb 100%)")
                        : T.surface,
                    borderRight: `1px solid ${T.border}`,
                    borderRadius: isMobile ? 0 : 24,
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    transition: isMobile
                        ? "transform 0.28s cubic-bezier(0.22,1,0.36,1), box-shadow 0.28s ease"
                        : "width 0.22s cubic-bezier(0.4,0,0.2,1)",
                    boxShadow: isMobile ? "none" : (dark ? "0 16px 34px rgba(2,6,23,0.28)" : "0 12px 28px rgba(15,23,42,0.08)"),

                    ...(isMobile ? {
                        position: "fixed",
                        top: 0,
                        left: 0,

                        // 🔥 KEY FIX: stop above the bottom action bar (~60px) so
                        //    the "New Watchlist" footer is never hidden behind it.
                        //    Falls back gracefully on older Safari via the -webkit-fill-available chain.
                        height: "calc(100dvh - 60px - env(safe-area-inset-bottom, 0px))",
                        bottom: "auto",

                        zIndex: 200,
                        width: "min(86vw, 340px)",
                        maxWidth: 340,
                        transform: sidebarOpen ? "translate3d(0,0,0)" : "translate3d(-104%,0,0)",
                        pointerEvents: sidebarOpen ? "auto" : "none",
                        boxShadow: sidebarOpen
                            ? (dark ? "18px 0 46px rgba(2,6,23,0.50)" : "18px 0 42px rgba(15,23,42,0.18)")
                            : "none"
                    } : {}),

                }}>

                    {/* HEADER */}
                    <div style={{
                        flexShrink: 0,
                        padding: isMobile ? "14px 14px 13px" : "16px 14px 12px",
                        borderBottom: `1px solid ${T.border}`,
                        background: isMobile
                            ? (dark ? "rgba(8,15,28,0.78)" : "rgba(255,255,255,0.78)")
                            : "transparent"
                    }}>
                        <div style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: 12
                        }}>
                            <span style={{
                                fontSize: 10,
                                fontWeight: 600,
                                color: T.subtext,
                                textTransform: "uppercase",
                                letterSpacing: "0.16em"
                            }}>
                                Watchlists
                            </span>

                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{
                                    fontSize: 11,
                                    color: atWatchlistLimit ? "#ef4444" : T.subtext,
                                    opacity: 0.85,
                                    padding: isMobile ? "4px 8px" : 0,
                                    borderRadius: isMobile ? 999 : 0,
                                    border: isMobile ? `1px solid ${T.border}` : "none",
                                    background: isMobile ? (dark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.7)") : "transparent"
                                }}>
                                    {watchlists.length}/{MAX_WATCHLISTS}
                                </span>

                                {isMobile && (
                                    <button onClick={() => setSidebarOpen(false)}
                                        style={{
                                            background: dark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.8)",
                                            border: `1px solid ${T.border}`,
                                            borderRadius: 10,
                                            width: 34,
                                            height: 34,
                                            color: T.subtext
                                        }}>
                                        ✕
                                    </button>
                                )}
                            </div>
                        </div>

                        <TickerSearch
                            value={addTicker}
                            onChange={v => { setAddTicker(v); setAddError(""); }}
                            onSelect={v => { setAddTicker(v); setAddError(""); }}
                            onSubmit={addStock}
                            addError={addError}
                            T={T}
                            compact
                            isMobile={isMobile}
                        />
                    </div>

                    {/* LIST */}
                    <div
                        ref={sidebarScrollRef}
                        style={{
                            flex: 1,
                            minHeight: 0,
                            overflowY: "auto",
                            overflowX: "hidden",

                            // 🔥 IMPORTANT FIX
                            padding: isMobile ? "10px 0 92px" : "6px 0 10px",

                            WebkitOverflowScrolling: "touch"
                        }}
                    >
                        {displayWatchlists.map((w) => {
                            const isActive = w.id === activeWl;
                            const isRenaming = renamingId === w.id;
                            const isDragging = dragWlId === w.id;

                            return (
                                <div key={w.id}
                                    ref={el => { wlItemRefs.current[w.id] = el; }}
                                    className={`wl-sidebar-item${isDragging ? " wl-dragging" : ""}`}
                                    onClick={() => {
                                        if (justDraggedRef.current) return;
                                        if (isRenaming) return;
                                        setActiveWl(w.id);
                                        if (isMobile) setSidebarOpen(false);
                                    }}
                                    style={{
                                        margin: isMobile ? "0 10px 6px" : "2px 10px",
                                        padding: isMobile ? "13px 12px" : "9px 10px",
                                        borderRadius: isMobile ? 12 : 8,
                                        cursor: isDragging ? "grabbing" : "pointer",
                                        position: "relative",
                                        zIndex: isDragging ? 5 : "auto",

                                        background: isActive
                                            ? (dark ? "rgba(16,185,129,0.13)" : "rgba(5,150,105,0.10)")
                                            : (isMobile ? (dark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.75)") : "transparent"),

                                        borderLeft: isActive
                                            ? `2px solid ${T.green}`
                                            : "2px solid transparent",

                                        border: `1px solid ${isActive ? `${T.green}40` : (isMobile ? `${T.border}b0` : "transparent")}`,
                                        boxShadow: isDragging
                                            ? (dark ? "0 14px 28px rgba(2,6,23,0.4)" : "0 14px 28px rgba(15,23,42,0.18)")
                                            : isMobile
                                                ? (isActive
                                                    ? (dark ? "0 10px 22px rgba(2,6,23,0.16)" : "0 8px 20px rgba(15,23,42,0.07)")
                                                    : "none")
                                                : "none",
                                        transition: isDragging ? "none" : "all 0.15s ease"
                                    }}
                                >
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                                        {/* Drag handle — press and drag to reorder */}
                                        <span
                                            className="wl-drag-handle"
                                            title="Drag to reorder"
                                            onPointerDown={e => handleWlDragStart(e, w.id)}
                                            onClick={e => e.stopPropagation()}
                                            style={{
                                                flexShrink: 0,
                                                cursor: "grab",
                                                color: T.subtext,
                                                fontSize: isMobile ? 15 : 13,
                                                lineHeight: 1,
                                                padding: isMobile ? "6px 4px" : "2px 3px",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                userSelect: "none",
                                            }}
                                        >
                                            ⠿
                                        </span>

                                        {isRenaming ? (
                                            <input
                                                autoFocus
                                                value={renameVal}
                                                onChange={e => setRenameVal(e.target.value)}
                                                onClick={e => e.stopPropagation()}
                                                onKeyDown={e => {
                                                    if (e.key === "Enter") renameWatchlist(w.id);
                                                    if (e.key === "Escape") setRenamingId(null);
                                                }}
                                                onBlur={() => renameWatchlist(w.id)}
                                                style={{
                                                    flex: 1,
                                                    minWidth: 0,
                                                    fontSize: isMobile ? 14 : 13,
                                                    fontWeight: 600,
                                                    color: T.text,
                                                    background: dark ? "rgba(255,255,255,0.06)" : "#fff",
                                                    border: `1px solid ${T.green}80`,
                                                    borderRadius: 5,
                                                    padding: isMobile ? "5px 7px" : "2px 6px",
                                                    outline: "none",
                                                    fontFamily: "'DM Sans', sans-serif",
                                                }}
                                            />
                                        ) : (
                                            <span
                                                onDoubleClick={e => {
                                                    if (isMobile) return;
                                                    e.stopPropagation();
                                                    setRenamingId(w.id); setRenameVal(w.name);
                                                }}
                                                style={{
                                                    fontSize: isMobile ? 14 : 13,
                                                    letterSpacing: "0.01em",
                                                    color: isActive ? T.text : T.subtext,
                                                    fontWeight: isActive ? 700 : 500,
                                                    flex: 1,
                                                    minWidth: 0,
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                }}>
                                                {w.name}
                                            </span>
                                        )}

                                        {!isRenaming && (
                                            <>
                                                {/* Rename button — hover-reveal on desktop, always visible on mobile */}
                                                <button
                                                    className="wl-item-actions"
                                                    title="Rename watchlist"
                                                    onClick={e => { e.stopPropagation(); setRenamingId(w.id); setRenameVal(w.name); }}
                                                    style={{
                                                        opacity: isMobile ? 0.45 : 0,
                                                        transition: "opacity 0.15s",
                                                        flexShrink: 0,
                                                        background: "none",
                                                        border: "none",
                                                        cursor: "pointer",
                                                        color: T.subtext,
                                                        fontSize: isMobile ? 13 : 11,
                                                        padding: isMobile ? "4px 6px" : "2px 4px",
                                                        borderRadius: 4,
                                                        lineHeight: 1,
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "center",
                                                    }}
                                                    onMouseEnter={e => { e.currentTarget.style.color = T.green; e.currentTarget.style.opacity = "1"; }}
                                                    onMouseLeave={e => { e.currentTarget.style.color = T.subtext; e.currentTarget.style.opacity = isMobile ? "0.45" : "0"; }}
                                                >
                                                    ✎
                                                </button>

                                                {/* Delete button — hover-reveal on desktop, always visible on mobile */}
                                                <button
                                                    className="wl-item-actions"
                                                    title="Delete watchlist"
                                                    onClick={e => { e.stopPropagation(); deleteWatchlist(w.id); }}
                                                    style={{
                                                        opacity: isMobile ? 0.45 : 0,
                                                        transition: "opacity 0.15s",
                                                        flexShrink: 0,
                                                        background: "none",
                                                        border: "none",
                                                        cursor: "pointer",
                                                        color: T.subtext,
                                                        fontSize: isMobile ? 14 : 12,
                                                        padding: isMobile ? "4px 6px" : "2px 4px",
                                                        borderRadius: 4,
                                                        lineHeight: 1,
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "center",
                                                    }}
                                                    onMouseEnter={e => { e.currentTarget.style.color = "#f87171"; e.currentTarget.style.opacity = "1"; }}
                                                    onMouseLeave={e => { e.currentTarget.style.color = T.subtext; e.currentTarget.style.opacity = isMobile ? "0.45" : "0"; }}
                                                >
                                                    ✕
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* FOOTER (FIXED ISSUE AREA) */}
                    <div style={{
                        flexShrink: 0,
                        position: "sticky",
                        bottom: 0,
                        zIndex: 20,
                        background: isMobile
                            ? (dark ? "rgba(10,20,34,0.96)" : "rgba(248,250,252,0.96)")
                            : T.surface,
                        borderTop: `1px solid ${T.border}`,

                        // 🔥 CRITICAL SAFE AREA FIX
                        padding: isMobile
                            ? "12px 12px calc(16px + env(safe-area-inset-bottom))"
                            : "10px",

                        boxShadow: isMobile
                            ? (dark ? "0 -10px 28px rgba(2,6,23,0.28)" : "0 -8px 24px rgba(15,23,42,0.10)")
                            : "none"
                    }}>
                        {isMobile && (
                            <div style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: T.subtext,
                                textTransform: "uppercase",
                                letterSpacing: "0.16em",
                                marginBottom: 8,
                                opacity: 0.75,
                            }}>
                                Create Collection
                            </div>
                        )}
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <input
                                value={newWlName}
                                onChange={e => { setNewWlName(e.target.value); setWlError(""); }}
                                placeholder={atWatchlistLimit ? "Limit reached" : "New watchlist"}
                                disabled={atWatchlistLimit}
                                style={{
                                    flex: 1,
                                    padding: isMobile ? "12px 13px" : "8px 10px",
                                    borderRadius: isMobile ? 12 : 8,
                                    border: `1px solid ${wlError ? "#ef4444" : T.border}`,
                                    background: dark ? "rgba(255,255,255,0.04)" : T.card,
                                    color: atWatchlistLimit ? T.subtext : T.text,
                                    opacity: atWatchlistLimit ? 0.45 : 1,
                                    outline: "none",
                                    fontFamily: "'DM Sans', sans-serif",
                                    fontSize: isMobile ? 15 : 12,
                                    transition: "border-color 0.16s ease, box-shadow 0.16s ease",
                                }}
                                onFocus={e => {
                                    e.currentTarget.style.borderColor = wlError ? "#ef4444" : `${T.green}90`;
                                    e.currentTarget.style.boxShadow = `0 0 0 3px ${T.green}16`;
                                }}
                                onBlur={e => {
                                    e.currentTarget.style.borderColor = wlError ? "#ef4444" : T.border;
                                    e.currentTarget.style.boxShadow = "none";
                                }}
                            />

                            <button onClick={createWatchlist}
                                disabled={!newWlName.trim() || creatingWl || atWatchlistLimit}
                                style={{
                                    width: isMobile ? 44 : 34,
                                    height: isMobile ? 44 : 34,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    background: newWlName.trim() && !creatingWl && !atWatchlistLimit ? T.green : "transparent",
                                    color: newWlName.trim() && !creatingWl && !atWatchlistLimit ? "#06120c" : T.subtext,
                                    border: `1px solid ${newWlName.trim() && !creatingWl && !atWatchlistLimit ? T.green : T.border}`,
                                    borderRadius: isMobile ? 12 : 8,
                                    fontWeight: 700,
                                    cursor: !newWlName.trim() || creatingWl || atWatchlistLimit ? "not-allowed" : "pointer",
                                    opacity: !newWlName.trim() || creatingWl || atWatchlistLimit ? 0.45 : 1,
                                    transition: "background 0.16s ease, opacity 0.16s ease, border-color 0.16s ease",
                                }}>
                                +
                            </button>
                        </div>
                        {wlError && (
                            <div style={{ marginTop: 7, fontSize: 11, color: "#ef4444", fontFamily: "'DM Sans', sans-serif" }}>
                                {wlError}
                            </div>
                        )}
                    </div>
                </div>


                {/* ══ MAIN AREA ═════════════════════════════════════════ */}
                <div style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",

                    minWidth: 0,
                    minHeight: 0,
                    overflow: "hidden",
                    borderRadius: isMobile ? 0 : 30,
                    border: isMobile ? "none" : `1px solid ${dark ? "rgba(148,163,184,0.10)" : "rgba(148,163,184,0.16)"}`,
                    background: isMobile ? "transparent" : (dark ? "rgba(8,15,28,0.58)" : "rgba(255,255,255,0.52)"),
                    backdropFilter: isMobile ? "none" : "blur(18px)"
                }}>
                    {/* ── TOOLBAR ─────────────────────────────────────────── */}
                    <div style={{
                        flexShrink: 0,
                        minHeight: isMobile ? 58 : 72,
                        background: isMobile ? T.surface : "transparent",
                        borderBottom: `1px solid ${isMobile ? T.border : (dark ? "rgba(148,163,184,0.10)" : "rgba(148,163,184,0.14)")}`,
                        display: "flex",
                        alignItems: "center",
                        gap: isMobile ? 8 : 10,
                        padding: isMobile ? "8px 10px" : "12px 18px",
                    }}>

                        {/* Sidebar toggle */}
                        <button className="wl-toolbar-btn" onClick={() => setSidebarOpen(o => !o)}
                            style={{
                                width: isMobile ? 38 : 34,
                                height: isMobile ? 38 : 34,
                                padding: 0,
                                background: sidebarOpen && isMobile ? `${T.green}12` : T.card,
                                border: `1px solid ${sidebarOpen && isMobile ? `${T.green}55` : T.border}`,
                                borderRadius: 10,
                                cursor: "pointer",
                                color: sidebarOpen && isMobile ? T.green : T.subtext,
                                fontSize: 15,
                                opacity: 1,
                                flexShrink: 0,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                transition: "background 0.16s ease, border-color 0.16s ease, color 0.16s ease, transform 0.16s ease",
                            }}
                            title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}>
                            {sidebarOpen ? "◀" : "▶"}
                        </button>

                        {/* Watchlist name + count */}
                        {activeWl && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: isMobile ? 1 : "none" }}>
                                <div style={{ minWidth: 0 }}>
                                    {!isMobile && (
                                        <div style={{
                                            fontSize: 10,
                                            fontWeight: 700,
                                            color: T.subtext,
                                            textTransform: "uppercase",
                                            letterSpacing: "0.14em",
                                            marginBottom: 3,
                                            opacity: 0.7,
                                            fontFamily: "'DM Sans', sans-serif",
                                        }}>
                                            Active Watchlist
                                        </div>
                                    )}
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                                        <span style={{
                                            fontSize: isMobile ? 13 : 18,
                                            fontWeight: isMobile ? 600 : 700,
                                            color: T.text,
                                            fontFamily: "'DM Sans', sans-serif",
                                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                                            maxWidth: isMobile ? "45vw" : undefined,
                                            letterSpacing: "-0.02em",
                                        }}>
                                            {activeWlName}
                                        </span>
                                        {totalCount > 0 && (
                                            <span style={{
                                                fontSize: 11,
                                                color: T.subtext,
                                                fontFamily: "'DM Mono', monospace",
                                                opacity: 0.75,
                                                flexShrink: 0,
                                                padding: "3px 8px",
                                                borderRadius: 999,
                                                border: `1px solid ${T.border}`,
                                                background: dark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.72)",
                                            }}>
                                                {totalCount} names
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Divider — desktop only */}
                        {activeWl && !isMobile && <div style={{ width: 1, height: 14, background: T.border }} />}

                        {/* Summary pills — desktop only */}
                        {activeWl && rows.length > 0 && !isMobile && (
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                {avgRS != null && (
                                    <span style={{
                                        fontSize: 11,
                                        color: T.subtext,
                                        fontFamily: "'DM Mono', monospace",
                                        padding: "4px 8px",
                                        borderRadius: 999,
                                        border: `1px solid ${T.border}`,
                                        background: dark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.7)"
                                    }}>
                                        RS <span style={{ color: T.green, fontWeight: 500 }}>{avgRS}</span>
                                    </span>
                                )}
                                <span style={{
                                    fontSize: 11,
                                    color: T.subtext,
                                    fontFamily: "'DM Mono', monospace",
                                    padding: "4px 8px",
                                    borderRadius: 999,
                                    border: `1px solid ${T.border}`,
                                    background: dark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.7)"
                                }}>
                                    S2 <span style={{ color: T.text, fontWeight: 500 }}>{stage2Count}</span>
                                </span>
                            </div>
                        )}

                        <div style={{ flex: 1 }} />

                        {/* Actions */}
                        {activeWl && (
                            <>
                                {/* Filter */}
                                <div style={{ position: "relative" }} ref={filterRef}>
                                    <button onClick={() => setFilterOpen(o => !o)}
                                        style={{
                                            padding: isMobile ? "5px 9px" : "4px 9px",
                                            background: activeFiltersCount > 0 ? `${T.green}10` : "transparent",
                                            border: `1px solid ${activeFiltersCount > 0 ? `${T.green}50` : T.border}`,
                                            borderRadius: 5,
                                            color: activeFiltersCount > 0 ? T.green : T.subtext,
                                            fontSize: 11,
                                            cursor: "pointer"
                                        }}>
                                        {isMobile ? (activeFiltersCount > 0 ? `Filter·${activeFiltersCount}` : "Filter") : "Filter"}
                                    </button>

                                    <FilterPanel
                                        filters={filterDraft}
                                        T={T}
                                        onChange={(k, v) => setFilterDraft(p => ({ ...p, [k]: v }))}
                                        onApply={() => { setFiltersApplied({ ...filterDraft }); setFilterOpen(false); }}
                                        onClear={() => { setFilterDraft({}); setFiltersApplied({}); setFilterOpen(false); }}
                                        visible={filterOpen}
                                        isMobile={isMobile}
                                    />
                                </div>

                                {/* Refresh */}
                                <button onClick={refreshPrices}
                                    disabled={priceLoading || !rows.length}
                                    style={{
                                        padding: isMobile ? "5px 9px" : "4px 8px",
                                        background: "transparent",
                                        border: `1px solid ${T.border}`,
                                        borderRadius: 5,
                                        color: T.subtext,
                                        fontSize: 12,
                                        cursor: "pointer"
                                    }}>
                                    ↺
                                </button>

                                {/* Export — desktop only */}
                                {!isMobile && (
                                    <button onClick={exportCSV}
                                        disabled={!rows.length}
                                        style={{
                                            padding: "4px 8px",
                                            background: "transparent",
                                            border: `1px solid ${T.border}`,
                                            borderRadius: 5,
                                            color: T.subtext,
                                            fontSize: 12,
                                            cursor: "pointer"
                                        }}>
                                        ↓
                                    </button>
                                )}

                                {/* Feed + Earnings toggles — DESKTOP ONLY (moved to bottom bar on mobile) */}
                                {!isMobile && (
                                    <>
                                        <button onClick={() => setFeedOpen(o => !o)}
                                            style={{
                                                padding: "4px 9px",
                                                background: feedOpen ? `${T.green}15` : "transparent",
                                                border: `1px solid ${feedOpen ? T.green : T.border}`,
                                                borderRadius: 5,
                                                color: feedOpen ? T.green : T.subtext,
                                                fontSize: 11,
                                                cursor: "pointer"
                                            }}>
                                            Announcements
                                        </button>

                                        <button onClick={() => setEarningsOpen(o => !o)}
                                            style={{
                                                padding: "4px 9px",
                                                background: earningsOpen ? `rgba(251,191,36,0.12)` : "transparent",
                                                border: `1px solid ${earningsOpen ? "rgba(251,191,36,0.6)" : T.border}`,
                                                borderRadius: 5,
                                                color: earningsOpen ? "#f59e0b" : T.subtext,
                                                fontSize: 11,
                                                cursor: "pointer"
                                            }}>
                                            Earnings
                                        </button>
                                    </>
                                )}
                            </>
                        )}
                    </div>

                    {/* ── CONTENT ──────────────────────────────────────────── */}
                    {!activeWl ? (
                        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
                            <div style={{
                                width: 40, height: 40, borderRadius: 10, border: `1px solid ${T.border}`,
                                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: T.subtext, opacity: 0.3
                            }}>◈</div>
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 14, fontWeight: 500, color: T.text, marginBottom: 4, opacity: 0.7, fontFamily: "'DM Sans',sans-serif" }}>No watchlist selected</div>
                                <div style={{ fontSize: 12, color: T.subtext, opacity: 0.4, fontFamily: "'DM Sans',sans-serif" }}>Create or select a watchlist to get started.</div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ flex: 1, display: "flex", overflow: "hidden", flexDirection: isMobile ? "column" : "row" }}>
                            {/* ── TABLE (flex) ───────────────────────────── */}
                            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0, paddingBottom: isMobile ? 8 : 0 }}>
                                {/* Rows */}
                                <div
                                    ref={stocksScrollRef}
                                    onMouseEnter={() => { hoveredPanelRef.current = "stocks"; }}
                                    style={{ flex: 1, overflowY: "auto", padding: isMobile ? "8px 10px 8px" : "14px 18px 18px" }}
                                    onTouchStart={e => { if (!isMobile) return; const t = e.touches[0]; stocksScrollRef._swipeStartX = t.clientX; stocksScrollRef._swipeStartY = t.clientY; }}
                                    onTouchEnd={e => {
                                        if (!isMobile || stocksScrollRef._swipeStartX == null) return;
                                        const dx = e.changedTouches[0].clientX - stocksScrollRef._swipeStartX;
                                        const dy = e.changedTouches[0].clientY - stocksScrollRef._swipeStartY;
                                        stocksScrollRef._swipeStartX = null;
                                        if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
                                        if (dx < 0 && page < totalPages - 1) { setPage(p => p + 1); if (stocksScrollRef.current) stocksScrollRef.current.scrollTop = 0; }
                                        else if (dx > 0 && page > 0) { setPage(p => p - 1); if (stocksScrollRef.current) stocksScrollRef.current.scrollTop = 0; }
                                    }}
                                >
                                    {tableLoading ? (
                                        Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} T={T} />)
                                    ) : displayRows.length === 0 ? (
                                        <div style={{ padding: 40, textAlign: "center", color: T.subtext, fontSize: 14 }}>
                                            {eventFilter === "high" ? "No high-impact events in current view."
                                                : activeFiltersCount > 0 || quickFilter ? "No stocks match the current filters."
                                                    : "No stocks yet — add tickers using the search bar above."}
                                        </div>
                                    ) : displayRows.map((row, i) => (
                                        <StockRow
                                            key={row.ticker}
                                            row={row}
                                            price={prices[row.ticker]}
                                            sparkData={sparklines[row.ticker]}
                                            onRemove={removeStock}
                                            onExpand={ticker => { setExpandedTicker(t => t === ticker ? null : ticker); setKeySelectedIdx(i); }}
                                            isExpanded={expandedTicker === row.ticker}
                                            isKeySelected={keySelectedIdx === i}
                                            T={T}
                                            screenMembership={screenMembership}
                                            rowIndex={i}
                                            latestEvent={eventsMap[row.ticker]}
                                            earningsDate={earningsMap[row.ticker]}
                                            onNavigateToScreen={onNavigateToScreen}
                                            bestPriceFn={_bestPrice}
                                            isPricePendingFn={_isPricePending}
                                            isMarketLiveFn={_isMarketLive}
                                            livePriceTick={livePriceTick}
                                            isMobile={isMobile}
                                        />
                                    ))}
                                </div>

                                {/* Pagination — desktop only; mobile uses swipe left/right */}
                                {totalPages > 1 && !isMobile && (
                                    <div style={{
                                        flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                                        gap: 8, padding: "10px 14px", borderTop: `1px solid ${T.border}`, background: T.surface
                                    }}>
                                        <button onClick={() => setPage(p => Math.max(p - 1, 0))} disabled={page === 0}
                                            style={{
                                                padding: "4px 12px", background: "transparent", border: `1px solid ${T.border}`,
                                                borderRadius: 4, color: T.subtext, fontSize: 14, cursor: page === 0 ? "not-allowed" : "pointer",
                                                opacity: page === 0 ? 0.25 : 0.6, transition: "opacity 0.15s", fontFamily: "'DM Mono',monospace"
                                            }}>‹</button>
                                        <span style={{ fontSize: 11, color: T.subtext, fontFamily: "'DM Mono',monospace", opacity: 0.9, letterSpacing: "0.04em" }}>
                                            {page + 1} / {totalPages}
                                        </span>
                                        <button onClick={() => setPage(p => Math.min(p + 1, totalPages - 1))} disabled={page === totalPages - 1}
                                            style={{
                                                padding: "4px 12px", background: "transparent", border: `1px solid ${T.border}`,
                                                borderRadius: 4, color: T.subtext, fontSize: 14, cursor: page === totalPages - 1 ? "not-allowed" : "pointer",
                                                opacity: page === totalPages - 1 ? 0.25 : 0.6, transition: "opacity 0.15s", fontFamily: "'DM Mono',monospace"
                                            }}>›</button>
                                    </div>
                                )}
                            </div>

                            {/* ── DETAIL PANEL — inline on desktop, bottom sheet on mobile ───────────── */}
                            {expandedTicker && expandedRow && (
                                isMobile ? (
                                    // Mobile bottom sheet
                                    <>
                                        <div onClick={() => setExpandedTicker(null)}
                                            style={{ position: "fixed", inset: 0, zIndex: 210, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(3px)" }} />
                                        <div style={{
                                            position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 220,
                                            background: T.surface, borderTop: `1px solid ${T.border}`,
                                            borderRadius: "20px 20px 0 0",
                                            maxHeight: "80vh", overflowY: "auto",
                                            animation: "slideInBottom 0.25s cubic-bezier(0.32,0.72,0,1)",
                                            paddingBottom: "env(safe-area-inset-bottom, 20px)",
                                            boxShadow: "0 -8px 40px rgba(0,0,0,0.4)",
                                        }}>
                                            {/* Drag handle */}
                                            <div style={{ display: "flex", justifyContent: "center", paddingTop: 12, paddingBottom: 6 }}>
                                                <div style={{ width: 40, height: 4, borderRadius: 99, background: T.border, opacity: 0.6 }} />
                                            </div>
                                            <div style={{ padding: "12px 18px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
                                                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                                                    <div>
                                                        <div style={{ fontSize: 11, color: T.subtext, fontFamily: "'DM Mono',monospace", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4, opacity: 0.5 }}>Detail</div>
                                                        <div style={{ fontSize: 18, fontWeight: 700, color: T.text, fontFamily: "'DM Mono',monospace", letterSpacing: "0.04em" }}>{expandedRow.ticker}</div>
                                                        <div style={{ fontSize: 24, fontWeight: 400, color: T.text, fontFamily: "'DM Mono',monospace", marginTop: 2, letterSpacing: "-0.01em" }}>
                                                            {fmt.priceFull(prices[expandedRow.ticker]?.price ?? expandedRow.close)}
                                                        </div>
                                                        <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                                                            {expandedRow.rs_rating != null && (
                                                                <span style={{ fontSize: 12, fontWeight: 600, color: T.green, fontFamily: "'DM Mono',monospace", letterSpacing: "0.04em" }}>RS {Math.round(expandedRow.rs_rating)}</span>
                                                            )}
                                                            {expandedRow.trend && (
                                                                <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 5, border: `1px solid ${T.border}`, color: T.subtext, fontFamily: "'DM Sans',sans-serif", letterSpacing: "0.04em" }}>
                                                                    {expandedRow.trend === "stage2" ? "Stage 2 ↑" : expandedRow.trend === "stage1" ? "Stage 1 →" : "Stage 4 ↓"}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <button onClick={() => setExpandedTicker(null)}
                                                        style={{ background: "transparent", border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px", cursor: "pointer", color: T.subtext, fontSize: 13 }}>✕</button>
                                                </div>
                                                {/* Candlestick Chart — mobile */}
                                                <WlCandleSection ticker={expandedRow.ticker} T={T} width={Math.min(window.innerWidth - 36, 480)} />
                                                {[
                                                    {
                                                        label: "Performance", rows: [
                                                            ["3M", fmt.pct(expandedRow.ret_3m), retColor(expandedRow.ret_3m, T)],
                                                            ["6M", fmt.pct(expandedRow.ret_6m), retColor(expandedRow.ret_6m, T)],
                                                            ["12M", fmt.pct(expandedRow.ret_12m), retColor(expandedRow.ret_12m, T)],
                                                        ]
                                                    },
                                                    {
                                                        label: "Levels", rows: [
                                                            ["52W High", fmt.priceFull(expandedRow.high_52w), T.text],
                                                            ["52W Low", fmt.priceFull(expandedRow.low_52w), T.text],
                                                            ["50 DMA", fmt.priceFull(expandedRow.sma50), T.text],
                                                            ["200 DMA", fmt.priceFull(expandedRow.sma200), T.text],
                                                        ]
                                                    },
                                                    {
                                                        label: "Quality", rows: [
                                                            ["RS Rating", expandedRow.rs_rating != null ? Math.round(expandedRow.rs_rating) : "—", T.green],
                                                            ["Rel Volume", expandedRow.rel_vol != null ? `${expandedRow.rel_vol.toFixed(1)}×` : "—", expandedRow.rel_vol >= 2 ? T.pos : T.text],
                                                            ...(expandedRow.pct_from_high != null ? [["From High", fmt.pct(expandedRow.pct_from_high), retColor(expandedRow.pct_from_high, T)]] : []),
                                                        ]
                                                    },
                                                ].map(section => (
                                                    <div key={section.label}>
                                                        <div style={{ fontSize: 10, color: T.subtext, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8, opacity: 0.4, fontFamily: "'DM Sans',sans-serif" }}>{section.label}</div>
                                                        {section.rows.map(([l, v, c]) => (
                                                            <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
                                                                <span style={{ fontSize: 14, color: T.subtext, fontFamily: "'DM Sans',sans-serif", opacity: 0.7 }}>{l}</span>
                                                                <span style={{ fontSize: 14, fontWeight: 500, color: c, fontFamily: "'DM Mono',monospace" }}>{v}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    // Desktop inline panel
                                    <div style={{
                                        width: 300, flexShrink: 0,
                                        background: T.surface,
                                        borderLeft: `1px solid ${T.border}`,
                                        display: "flex", flexDirection: "column",
                                        overflow: "auto",
                                        animation: "slideInRight 0.18s ease",
                                    }}>
                                        <div style={{ padding: "20px 16px", display: "flex", flexDirection: "column", gap: 16, minHeight: "100%" }}>
                                            {/* Header */}
                                            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                                                <div>
                                                    <div style={{ fontSize: 11, color: T.subtext, fontFamily: "'DM Mono',monospace", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4, opacity: 0.5 }}>Detail</div>
                                                    <div style={{ fontSize: 17, fontWeight: 600, color: T.text, fontFamily: "'DM Mono',monospace", letterSpacing: "0.04em" }}>{expandedRow.ticker}</div>
                                                    <div style={{ fontSize: 22, fontWeight: 400, color: T.text, fontFamily: "'DM Mono',monospace", marginTop: 2, letterSpacing: "-0.01em" }}>
                                                        {fmt.priceFull(prices[expandedRow.ticker]?.price ?? expandedRow.close)}
                                                    </div>
                                                    <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
                                                        {expandedRow.rs_rating != null && (
                                                            <span style={{ fontSize: 11, fontWeight: 500, color: T.green, fontFamily: "'DM Mono',monospace", letterSpacing: "0.04em" }}>RS {Math.round(expandedRow.rs_rating)}</span>
                                                        )}
                                                        {expandedRow.trend && (
                                                            <span style={{
                                                                fontSize: 10, padding: "2px 6px", borderRadius: 3,
                                                                border: `1px solid ${T.border}`, color: T.subtext,
                                                                fontFamily: "'DM Sans',sans-serif", letterSpacing: "0.04em"
                                                            }}>
                                                                {expandedRow.trend === "stage2" ? "S2 ↑" : expandedRow.trend === "stage1" ? "S1 →" : "S4 ↓"}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <button onClick={() => setExpandedTicker(null)}
                                                    style={{ background: "transparent", border: `1px solid ${T.border}`, borderRadius: 5, padding: "4px 8px", cursor: "pointer", color: T.subtext, fontSize: 11, opacity: 0.6, transition: "opacity 0.15s" }}
                                                    onMouseEnter={e => e.currentTarget.style.opacity = "1"}
                                                    onMouseLeave={e => e.currentTarget.style.opacity = "0.6"}
                                                >✕</button>
                                            </div>

                                            {/* Candlestick Chart */}
                                            <WlCandleSection ticker={expandedRow.ticker} T={T} width={260} />

                                            {[
                                                {
                                                    label: "Performance", rows: [
                                                        ["3M", fmt.pct(expandedRow.ret_3m), retColor(expandedRow.ret_3m, T)],
                                                        ["6M", fmt.pct(expandedRow.ret_6m), retColor(expandedRow.ret_6m, T)],
                                                        ["12M", fmt.pct(expandedRow.ret_12m), retColor(expandedRow.ret_12m, T)],
                                                    ]
                                                },
                                                {
                                                    label: "Levels", rows: [
                                                        ["52W High", fmt.priceFull(expandedRow.high_52w), T.text],
                                                        ["52W Low", fmt.priceFull(expandedRow.low_52w), T.text],
                                                        ["50 DMA", fmt.priceFull(expandedRow.sma50), T.text],
                                                        ["200 DMA", fmt.priceFull(expandedRow.sma200), T.text],
                                                        ...(expandedRow.pivot_20w ? [["20W Pivot", fmt.priceFull(expandedRow.pivot_20w), T.text]] : []),
                                                    ]
                                                },
                                                {
                                                    label: "Quality", rows: [
                                                        ["RS Rating", expandedRow.rs_rating != null ? Math.round(expandedRow.rs_rating) : "—", T.green],
                                                        ["Rel Volume", expandedRow.rel_vol != null ? `${expandedRow.rel_vol.toFixed(1)}×` : "—", expandedRow.rel_vol >= 2 ? T.pos : T.text],
                                                        ...(expandedRow.pct_from_high != null ? [["From High", fmt.pct(expandedRow.pct_from_high), retColor(expandedRow.pct_from_high, T)]] : []),
                                                        ...(earningsMap[expandedRow.ticker] ? (() => {
                                                            const eDate = earningsMap[expandedRow.ticker];
                                                            const today = new Date(); today.setHours(0, 0, 0, 0);
                                                            const d = new Date(eDate + "T00:00:00");
                                                            const daysLeft = Math.round((d - today) / 86400000);
                                                            const suffix = daysLeft === 0 ? " (Today)" : daysLeft === 1 ? " (Tomorrow)" : ` (in ${daysLeft}d)`;
                                                            const urgColor = daysLeft <= 0 ? "#f59e0b" : daysLeft <= 3 ? "#f87171" : daysLeft <= 7 ? "#fb923c" : daysLeft <= 14 ? T.green : T.subtext;
                                                            const label = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) + suffix;
                                                            return [["Results Date", label, urgColor]];
                                                        })() : []),
                                                    ]
                                                },
                                            ].map(section => (
                                                <div key={section.label}>
                                                    <div style={{ fontSize: 9, color: T.subtext, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6, opacity: 0.4, fontFamily: "'DM Sans',sans-serif" }}>{section.label}</div>
                                                    {section.rows.map(([l, v, c]) => (
                                                        <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>
                                                            <span style={{ fontSize: 11, color: T.subtext, fontFamily: "'DM Sans',sans-serif", opacity: 0.6 }}>{l}</span>
                                                            <span style={{ fontSize: 11, fontWeight: 500, color: c, fontFamily: "'DM Mono',monospace" }}>{v}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ))}

                                            {/* Screen pills */}
                                            {screenMembership[expandedRow.ticker]?.length > 0 && (
                                                <div>
                                                    <div style={{ fontSize: 9, color: T.subtext, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6, opacity: 0.4, fontFamily: "'DM Sans',sans-serif" }}>Screens</div>
                                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                                        {screenMembership[expandedRow.ticker].map(s => (
                                                            <span key={s}
                                                                onClick={onNavigateToScreen ? () => onNavigateToScreen(s) : undefined}
                                                                style={{
                                                                    fontSize: 9, padding: "2px 6px", borderRadius: 3, border: `1px solid ${T.border}`, color: T.subtext,
                                                                    cursor: onNavigateToScreen ? "pointer" : "default", transition: "all 0.12s",
                                                                    textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "'DM Sans',sans-serif", fontWeight: 600
                                                                }}
                                                                onMouseEnter={onNavigateToScreen ? e => { e.currentTarget.style.color = T.green; e.currentTarget.style.borderColor = `${T.green}50`; } : undefined}
                                                                onMouseLeave={onNavigateToScreen ? e => { e.currentTarget.style.color = T.subtext; e.currentTarget.style.borderColor = T.border; } : undefined}
                                                            >{s}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            )}

                            {/* ── ANNOUNCEMENTS FEED — right panel on desktop, bottom sheet on mobile ─── */}
                            {feedOpen && activeWl && (
                                isMobile ? (
                                    <>
                                        <div onClick={() => setFeedOpen(false)}
                                            style={{ position: "fixed", inset: 0, zIndex: 210, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(3px)" }} />
                                        <div style={{
                                            position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 220,
                                            background: T.surface, borderTop: `1px solid ${T.border}`,
                                            borderRadius: "20px 20px 0 0", height: "90dvh", maxHeight: "90dvh",
                                            display: "flex", flexDirection: "column", overflow: "hidden",
                                            animation: "slideInBottom 0.25s cubic-bezier(0.32,0.72,0,1)",
                                            paddingBottom: "env(safe-area-inset-bottom, 2px)",
                                            boxShadow: "0 -8px 40px rgba(0,0,0,0.4)",
                                        }}>
                                            <div style={{ display: "flex", justifyContent: "center", paddingTop: 12, paddingBottom: 6, flexShrink: 0 }}>
                                                <div style={{ width: 40, height: 4, borderRadius: 99, background: T.border, opacity: 0.6 }} />
                                            </div>
                                            <AnnouncementsFeed
                                                announcements={feedAnnouncements}
                                                loading={feedLoading && feedAnnouncements.length === 0}
                                                refreshing={feedLoading && feedAnnouncements.length > 0}
                                                T={T}
                                                onClose={() => setFeedOpen(false)}
                                                scrollRef={announcScrollRef}
                                                onPanelEnter={() => { hoveredPanelRef.current = "announcements"; }}
                                                isMobile={true}
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <AnnouncementsFeed
                                        announcements={feedAnnouncements}
                                        loading={feedLoading && feedAnnouncements.length === 0}
                                        refreshing={feedLoading && feedAnnouncements.length > 0}
                                        T={T}
                                        onClose={() => setFeedOpen(false)}
                                        scrollRef={announcScrollRef}
                                        onPanelEnter={() => { hoveredPanelRef.current = "announcements"; }}
                                    />
                                )
                            )}

                            {/* ── EARNINGS CALENDAR — right panel on desktop, bottom sheet on mobile ─── */}
                            {earningsOpen && activeWl && (
                                isMobile ? (
                                    <>
                                        <div onClick={() => setEarningsOpen(false)}
                                            style={{ position: "fixed", inset: 0, zIndex: 210, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(3px)" }} />
                                        <div style={{
                                            position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 220,
                                            background: T.surface, borderTop: `1px solid ${T.border}`,
                                            borderRadius: "20px 20px 0 0", height: "82dvh", maxHeight: "82dvh",
                                            display: "flex", flexDirection: "column", overflow: "hidden",
                                            animation: "slideInBottom 0.25s cubic-bezier(0.32,0.72,0,1)",
                                            paddingBottom: "env(safe-area-inset-bottom, 0px)",
                                            boxShadow: "0 -8px 40px rgba(0,0,0,0.4)",
                                        }}>
                                            <div style={{ display: "flex", justifyContent: "center", paddingTop: 12, paddingBottom: 6, flexShrink: 0 }}>
                                                <div style={{ width: 40, height: 4, borderRadius: 99, background: T.border, opacity: 0.6 }} />
                                            </div>
                                            <EarningsCalendar
                                                T={T}
                                                token={token}
                                                watchlistTickers={rows.map(r => r.ticker)}
                                                onClose={() => setEarningsOpen(false)}
                                                scrollRef={earningsScrollRef}
                                                onPanelEnter={() => { hoveredPanelRef.current = "earnings"; }}
                                                isMobile={true}
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <EarningsCalendar
                                        T={T}
                                        token={token}
                                        watchlistTickers={rows.map(r => r.ticker)}
                                        onClose={() => setEarningsOpen(false)}
                                        scrollRef={earningsScrollRef}
                                        onPanelEnter={() => { hoveredPanelRef.current = "earnings"; }}
                                    />
                                )
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ── MOBILE BOTTOM ACTION BAR ──────────────────────────────── */}
            {isMobile && activeWl && (
                <div className="wl-mobile-bottom-bar" style={{
                    background: T.surface,
                    borderTop: `1px solid ${T.border}`,
                    display: "flex",
                    alignItems: "center",
                    padding: "6px 12px",
                    gap: 6,
                    paddingBottom: "calc(6px + env(safe-area-inset-bottom, 0px))",
                    boxShadow: "0 -1px 0 rgba(255,255,255,0.04)",
                }}>
                    <button onClick={() => { setFeedOpen(o => !o); setEarningsOpen(false); }}
                        style={{
                            flex: 1, padding: "9px 8px",
                            background: feedOpen ? `${T.green}12` : "transparent",
                            border: `1px solid ${feedOpen ? `${T.green}50` : T.border}`,
                            borderRadius: 8,
                            color: feedOpen ? T.green : T.subtext,
                            fontSize: 11, fontWeight: 600, cursor: "pointer",
                            fontFamily: "'DM Sans', sans-serif",
                            letterSpacing: "0.03em",
                            transition: "all 0.15s",
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                        }}>
                        <span style={{ fontSize: 13 }}>⚡</span> Announcements
                    </button>
                    <button onClick={() => { setEarningsOpen(o => !o); setFeedOpen(false); }}
                        style={{
                            flex: 1, padding: "9px 8px",
                            background: earningsOpen ? "rgba(251,191,36,0.1)" : "transparent",
                            border: `1px solid ${earningsOpen ? "rgba(251,191,36,0.5)" : T.border}`,
                            borderRadius: 8,
                            color: earningsOpen ? "#f59e0b" : T.subtext,
                            fontSize: 11, fontWeight: 600, cursor: "pointer",
                            fontFamily: "'DM Sans', sans-serif",
                            letterSpacing: "0.03em",
                            transition: "all 0.15s",
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                        }}>
                        <span style={{ fontSize: 13 }}>◷</span> Earnings
                    </button>
                </div>
            )}

            {/* Compare Panel */}
            {compareOpen && (
                <ComparePanel watchlists={watchlists} token={token} onClose={() => setCompareOpen(false)} T={T} />
            )}
        </>
    );
}


// ═══════════════════════════════════════════════════════════════
//  ANNOUNCEMENTS FEED — Screener-style right panel
// ═══════════════════════════════════════════════════════════════
const FEED_PAGE_SIZE = 8; // announcements revealed per "Show more" click

function AnnouncementsFeed({ announcements, loading, refreshing, T, onClose, scrollRef, onPanelEnter, isMobile }) {
    const [filter, setFilter] = useState("all");
    const [visibleCount, setVisibleCount] = useState(FEED_PAGE_SIZE);

    // Reset pagination whenever the filter or announcement list changes
    useEffect(() => { setVisibleCount(FEED_PAGE_SIZE); }, [filter, announcements]);

    // Group by date — only the currently visible slice
    const grouped = useMemo(() => {
        const allFiltered = filter === "all" ? announcements
            : announcements.filter(a => {
                const cat = (a.category || "").toLowerCase();
                if (filter === "results") return cat.includes("result") || cat.includes("earning") || cat.includes("financial");
                if (filter === "orders") return cat.includes("order") || cat.includes("contract") || cat.includes("bagging");
                if (filter === "investor") return cat.includes("investor") || cat.includes("analyst") || cat.includes("meet");
                return true;
            });

        const totalFiltered = allFiltered.length;
        const filtered = allFiltered.slice(0, visibleCount);
        const hasMore = visibleCount < totalFiltered;
        const remaining = totalFiltered - visibleCount;

        const groups = {};
        for (const a of filtered) {
            const dt = a.announcement_datetime ? new Date(a.announcement_datetime) : null;
            const today = new Date();
            const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
            let label = "Older";
            if (dt) {
                if (dt.toDateString() === today.toDateString()) label = "Today";
                else if (dt.toDateString() === yesterday.toDateString()) label = "Yesterday";
                else label = dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
            }
            if (!groups[label]) groups[label] = [];
            groups[label].push(a);
        }
        // Sort group keys: Today first, then Yesterday, then rest by date desc
        const order = k => k === "Today" ? 0 : k === "Yesterday" ? 1 : 2;
        const entries = Object.entries(groups).sort((a, b) => order(a[0]) - order(b[0]));
        return { entries, hasMore, remaining };
    }, [announcements, filter, visibleCount]);

    const FILTERS = [
        { key: "all", label: "All" },
        { key: "results", label: "Results" },
        { key: "orders", label: "Orders" },
        { key: "investor", label: "Investor" },
    ];

    const fmtTime = dt => {
        if (!dt) return "";
        try {
            return new Date(dt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
        } catch { return ""; }
    };

    const truncate = (text, n = 110) => {
        if (!text || text.length <= n) return text || "";
        return text.slice(0, n).trimEnd() + "…";
    };

    // Derive badge color from category
    const catColor = cat => {
        const c = (cat || "").toUpperCase();
        if (c.includes("RESULT") || c.includes("EARNING") || c.includes("FINANCIAL")) return { color: "#f87171", bg: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.3)" };
        if (c.includes("ORDER") || c.includes("CONTRACT") || c.includes("BAGGING")) return { color: "#34d399", bg: "rgba(52,211,153,0.1)", border: "rgba(52,211,153,0.3)" };
        if (c.includes("MERGER") || c.includes("ACQUI")) return { color: "#c084fc", bg: "rgba(192,132,252,0.1)", border: "rgba(192,132,252,0.3)" };
        if (c.includes("INVESTOR") || c.includes("ANALYST") || c.includes("MEET")) return { color: "#fbbf24", bg: "rgba(251,191,36,0.1)", border: "rgba(251,191,36,0.25)" };
        if (c.includes("BOARD")) return { color: "#60a5fa", bg: "rgba(96,165,250,0.1)", border: "rgba(96,165,250,0.3)" };
        if (c.includes("PRESS") || c.includes("MEDIA")) return { color: "#a78bfa", bg: "rgba(167,139,250,0.1)", border: "rgba(167,139,250,0.3)" };
        return { color: "#64748b", bg: "rgba(100,116,139,0.08)", border: "rgba(100,116,139,0.2)" };
    };

    const shortCat = cat => {
        const c = (cat || "").replace(/\(.*?\)/g, "").trim();
        if (c.length <= 22) return c;
        return c.slice(0, 21) + "…";
    };

    return (
        <div
            onMouseEnter={onPanelEnter}
            style={{
                width: isMobile ? "100%" : 480,
                flexShrink: 0,
                flex: isMobile ? 1 : "none",
                minHeight: 0,
                background: T.surface,
                borderLeft: isMobile ? "none" : `1px solid ${T.border}`,
                display: "flex", flexDirection: "column",
                overflow: "hidden",
                animation: isMobile ? "none" : "slideInRight 0.18s ease",
            }}>
            {/* Feed Header */}
            <div style={{ flexShrink: 0, padding: isMobile ? "10px 18px 12px" : "14px 16px 10px", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isMobile ? 12 : 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: isMobile ? 16 : 15, fontWeight: 600, color: T.text, fontFamily: "'DM Sans', sans-serif" }}>
                            Announcements
                        </span>
                        {announcements.length > 0 && (
                            <span style={{ fontSize: isMobile ? 13 : 14, fontWeight: 500, color: T.subtext, fontFamily: "'DM Mono', monospace" }}>{announcements.length}</span>
                        )}
                        {refreshing && !loading && (
                            <span style={{ fontSize: 14, color: T.subtext, fontWeight: 400, animation: "spin 1s linear infinite", display: "inline-block" }}>↻</span>
                        )}
                    </div>
                    <button onClick={onClose}
                        style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: isMobile ? 8 : 4, cursor: "pointer", color: T.subtext, fontSize: 14, lineHeight: 1, padding: isMobile ? "6px 10px" : "3px 7px", transition: "all 0.15s" }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = T.text; e.currentTarget.style.color = T.text; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.subtext; }}
                    >✕</button>
                </div>
                {/* Category filters */}
                <div style={{ display: "flex", gap: isMobile ? 6 : 3 }}>
                    {FILTERS.map(f => (
                        <button key={f.key} onClick={() => setFilter(f.key)}
                            style={{
                                padding: isMobile ? "6px 14px" : "3px 10px", fontSize: isMobile ? 13 : 13,
                                fontWeight: 500, borderRadius: 20, cursor: "pointer",
                                background: filter === f.key ? `${T.green}12` : "transparent",
                                color: filter === f.key ? T.green : T.subtext,
                                border: `1px solid ${filter === f.key ? `${T.green}40` : T.border}`,
                                transition: "all 0.15s", fontFamily: "'DM Sans', sans-serif",
                                letterSpacing: "0.04em",
                            }}>
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Feed Body */}
            <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>
                {loading ? (
                    <div style={{ padding: "28px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
                        {[80, 60, 90, 70, 50].map((w, i) => (
                            <div key={i}>
                                <div style={{ width: 50, height: 10, borderRadius: 2, background: T.border, opacity: 0.4, marginBottom: 6 }} />
                                <div style={{ width: "100%", height: 11, borderRadius: 2, background: T.border, opacity: 0.3, marginBottom: 4 }} />
                                <div style={{ width: `${w}%`, height: 10, borderRadius: 2, background: T.border, opacity: 0.22 }} />
                            </div>
                        ))}
                    </div>
                ) : grouped.entries.length === 0 ? (
                    <div style={{ padding: "40px 16px", textAlign: "center", color: T.subtext, fontSize: 15 }}>
                        {announcements.length === 0 ? "No announcements found for watchlist stocks." : "No announcements match this filter."}
                    </div>
                ) : (
                    <>
                        {grouped.entries.map(([dateLabel, items]) => (
                            <div key={dateLabel}>
                                {/* Date separator */}
                                <div style={{
                                    padding: "8px 16px 4px", position: "sticky", top: 0, zIndex: 2,
                                    background: T.surface, borderBottom: `1px solid ${T.border}`
                                }}>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: T.subtext, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "'DM Sans', sans-serif" }}>
                                        {dateLabel}
                                    </span>
                                </div>

                                {/* Items */}
                                {items.map((ann, idx) => {
                                    const badge = catColor(ann.category);
                                    return (
                                        <div key={ann.seq_id ?? idx}
                                            className="wl-announce-row"
                                            style={{
                                                padding: "10px 16px",
                                                borderBottom: `1px solid ${T.border}`,
                                                transition: "background 0.1s",
                                                cursor: ann.attachment_url ? "pointer" : "default",
                                                borderLeft: `2px solid ${badge.border}`,
                                            }}
                                            onClick={ann.attachment_url ? () => window.open(ann.attachment_url, "_blank") : undefined}
                                            onMouseEnter={e => { e.currentTarget.style.background = T.hover; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                                        >
                                            {/* Symbol + time */}
                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                                                <span style={{ fontSize: 14, fontWeight: 600, color: T.text, fontFamily: "'DM Mono',monospace", letterSpacing: "0.05em" }}>
                                                    {ann.symbol}
                                                </span>
                                                <span style={{ fontSize: 13, color: T.subtext, fontFamily: "'DM Mono',monospace" }}>
                                                    {fmtTime(ann.announcement_datetime)}
                                                    {ann.attachment_url && <span style={{ marginLeft: 5, opacity: 0.6 }}>↗</span>}
                                                </span>
                                            </div>

                                            {/* Category badge */}
                                            <div style={{ marginBottom: 4 }}>
                                                <span style={{
                                                    fontSize: 12, fontWeight: 600, padding: "2px 7px", borderRadius: 3,
                                                    background: badge.bg, border: `1px solid ${badge.border}`, color: badge.color,
                                                    letterSpacing: "0.04em", textTransform: "uppercase", fontFamily: "'DM Sans',sans-serif"
                                                }}>
                                                    {shortCat(ann.category)}
                                                </span>
                                            </div>

                                            {/* Text */}
                                            <div style={{ fontSize: 14, color: T.subtext, lineHeight: 1.55, fontFamily: "'DM Sans',sans-serif" }}>
                                                {truncate(ann.announcement_text)}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}

                        {/* Show More button */}
                        {grouped.hasMore && (
                            <div style={{ padding: isMobile ? "12px 16px calc(20px + env(safe-area-inset-bottom, 0px))" : "12px 16px 16px", borderTop: `1px solid ${T.border}` }}>
                                <button
                                    onClick={() => setVisibleCount(c => c + FEED_PAGE_SIZE)}
                                    style={{
                                        width: "100%", padding: "7px 0",
                                        background: "transparent",
                                        border: `1px solid ${T.border}`,
                                        borderRadius: 6, color: T.subtext,
                                        fontSize: 14, fontWeight: 500,
                                        cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                                        letterSpacing: "0.03em", transition: "color 0.15s, border-color 0.15s",
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.color = T.green; e.currentTarget.style.borderColor = `${T.green}50`; e.currentTarget.style.opacity = "1"; }}
                                    onMouseLeave={e => { e.currentTarget.style.color = T.subtext; e.currentTarget.style.borderColor = T.border; e.currentTarget.style.opacity = "0.6"; }}
                                >
                                    Show {grouped.remaining} more
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
//  EARNINGS CALENDAR — Right panel, toggled via toolbar
//  Fetches from earnings_calendar table in Supabase
//  Shows upcoming results for all companies or watchlist stocks
//  Includes company name search filter
// ═══════════════════════════════════════════════════════════════
function EarningsCalendar({ T, token, watchlistTickers = [], onClose, scrollRef, onPanelEnter, isMobile }) {
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState("");
    const [mode, setMode] = useState("all"); // "all" | "watchlist"
    const [visibleCount, setVisibleCount] = useState(30);
    const searchRef = useRef(null);

    // Fetch earnings calendar on mount
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        const today = new Date().toISOString().slice(0, 10);
        // Fetch next 90 days of earnings, ordered by result_date ascending
        const url = `${SUPABASE_URL}/rest/v1/earnings_calendar?result_date=gte.${today}&select=*&order=result_date.asc`;

        fetch(url, {
            headers: {
                "Content-Type": "application/json",
                apikey: SUPABASE_ANON_KEY,
                Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
                "Range-Unit": "items",
                Range: "0-499",
            },
        })
            .then(r => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json();
            })
            .then(data => {
                if (!cancelled) {
                    setEntries(Array.isArray(data) ? data : []);
                    setLoading(false);
                }
            })
            .catch(err => {
                if (!cancelled) {
                    setError("Could not load earnings calendar.");
                    setLoading(false);
                }
            });

        return () => { cancelled = true; };
    }, [token]);

    // Filtered + searched list
    const filtered = useMemo(() => {
        let list = entries;

        // Mode filter — watchlist only
        if (mode === "watchlist" && watchlistTickers.length > 0) {
            const tickerSet = new Set(watchlistTickers.map(t => t.toUpperCase()));
            list = list.filter(e => tickerSet.has((e.ticker || "").toUpperCase()));
        }

        // Search filter
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            list = list.filter(e =>
                (e.ticker || "").toLowerCase().includes(q) ||
                (e.company_name || "").toLowerCase().includes(q)
            );
        }

        return list;
    }, [entries, mode, search, watchlistTickers]);

    // Group by date
    const grouped = useMemo(() => {
        const slice = filtered.slice(0, visibleCount);
        const hasMore = visibleCount < filtered.length;
        const remaining = filtered.length - visibleCount;

        const groups = {};
        for (const e of slice) {
            const raw = e.result_date;
            if (!groups[raw]) groups[raw] = [];
            groups[raw].push(e);
        }

        const entries_sorted = Object.entries(groups).sort((a, b) =>
            a[0] > b[0] ? 1 : -1
        );

        return { entries: entries_sorted, hasMore, remaining };
    }, [filtered, visibleCount]);

    // Format date for group header
    const fmtDate = raw => {
        if (!raw) return "—";
        try {
            const d = new Date(raw + "T00:00:00");
            const today = new Date();
            const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
            if (d.toDateString() === today.toDateString()) return "Today";
            if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
            return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
        } catch { return raw; }
    };

    // Days from today
    const daysUntil = raw => {
        if (!raw) return null;
        try {
            const d = new Date(raw + "T00:00:00");
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const diff = Math.round((d - today) / 86400000);
            return diff;
        } catch { return null; }
    };

    // Color coding for urgency
    const urgencyColor = days => {
        if (days === null) return T.subtext;
        if (days === 0) return "#f59e0b";
        if (days <= 3) return "#f87171";
        if (days <= 7) return "#fb923c";
        if (days <= 14) return T.green;
        return T.subtext;
    };

    const isInWatchlist = ticker =>
        watchlistTickers.some(t => t.toUpperCase() === (ticker || "").toUpperCase());

    return (
        <div
            onMouseEnter={onPanelEnter}
            style={{
                width: isMobile ? "100%" : 400,
                flexShrink: 0,
                flex: isMobile ? 1 : "none",
                minHeight: 0,
                background: T.surface,
                borderLeft: isMobile ? "none" : `1px solid ${T.border}`,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                animation: isMobile ? "none" : "slideInRight 0.18s ease",
            }}>
            {/* Header */}
            <div style={{ flexShrink: 0, padding: isMobile ? "10px 18px 12px" : "14px 16px 10px", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isMobile ? 12 : 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: isMobile ? 16 : 15, fontWeight: 600, color: T.text, fontFamily: "'DM Sans', sans-serif" }}>
                            Earnings Calendar
                        </span>
                        {!loading && (
                            <span style={{ fontSize: 13, color: T.subtext, fontFamily: "'DM Mono', monospace" }}>
                                {filtered.length}
                            </span>
                        )}
                    </div>
                    <button onClick={onClose}
                        style={{
                            background: "none", border: `1px solid ${T.border}`, borderRadius: isMobile ? 8 : 4, cursor: "pointer",
                            color: T.subtext, fontSize: 14, lineHeight: 1, padding: isMobile ? "6px 10px" : "3px 7px", transition: "all 0.15s"
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = T.text; e.currentTarget.style.color = T.text; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.subtext; }}
                    >✕</button>
                </div>

                {/* Mode toggle + Search */}
                <div style={{ display: "flex", gap: isMobile ? 6 : 4, marginBottom: isMobile ? 12 : 8 }}>
                    {[["all", "All Companies"], ["watchlist", "My Watchlist"]].map(([k, l]) => (
                        <button key={k} onClick={() => setMode(k)}
                            style={{
                                padding: isMobile ? "6px 14px" : "3px 10px", fontSize: 13, fontWeight: 500, borderRadius: 20, cursor: "pointer",
                                background: mode === k ? `${T.green}15` : "transparent",
                                color: mode === k ? T.green : T.subtext,
                                border: `1px solid ${mode === k ? T.green : T.border}`,
                                transition: "all 0.15s", fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.02em",
                                opacity: mode === k ? 1 : (k === "watchlist" && watchlistTickers.length === 0 ? 0.35 : 1)
                            }}>
                            {l}
                        </button>
                    ))}
                </div>

                {/* Search box */}
                <div style={{ position: "relative" }}>
                    <input
                        ref={searchRef}
                        value={search}
                        onChange={e => { setSearch(e.target.value); setVisibleCount(30); }}
                        placeholder="Search company or ticker…"
                        style={{
                            width: "100%", padding: isMobile ? "10px 32px 10px 12px" : "6px 28px 6px 10px",
                            background: T.card, border: `1px solid ${T.border}`,
                            borderRadius: isMobile ? 8 : 6, color: T.text,
                            fontSize: isMobile ? 15 : 14,
                            outline: "none", fontFamily: "'DM Sans', sans-serif", transition: "border-color 0.15s",
                            boxSizing: "border-box"
                        }}
                        onFocus={e => e.currentTarget.style.borderColor = T.green}
                        onBlur={e => e.currentTarget.style.borderColor = T.border}
                    />
                    {search && (
                        <button onClick={() => setSearch("")}
                            style={{
                                position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                                background: "none", border: "none", cursor: "pointer", color: T.subtext,
                                fontSize: 13, padding: 0, lineHeight: 1
                            }}>✕</button>
                    )}
                </div>
            </div>

            {/* Body */}
            <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>
                {loading ? (
                    <div style={{ padding: "24px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                        {[70, 90, 60, 80, 75, 55].map((w, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <div style={{ width: 44, height: 14, borderRadius: 3, background: T.border, opacity: 0.5 }} />
                                <div style={{ flex: 1, height: 12, borderRadius: 3, background: T.border, opacity: 0.3 }} />
                                <div style={{ width: `${w * 0.3}px`, height: 10, borderRadius: 3, background: T.border, opacity: 0.2 }} />
                            </div>
                        ))}
                    </div>
                ) : error ? (
                    <div style={{ padding: "32px 16px", textAlign: "center", color: "#f87171", fontSize: 15, fontFamily: "'DM Sans', sans-serif" }}>
                        {error}
                    </div>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: "32px 16px", textAlign: "center", color: T.subtext, fontSize: 15, fontFamily: "'DM Sans', sans-serif" }}>
                        {mode === "watchlist" ? "No upcoming earnings for your watchlist stocks." : search ? "No results match your search." : "No upcoming earnings found."}
                    </div>
                ) : (
                    <>
                        {grouped.entries.map(([dateKey, items]) => {
                            const days = daysUntil(dateKey);
                            const urgColor = urgencyColor(days);
                            return (
                                <div key={dateKey}>
                                    {/* Date group header */}
                                    <div style={{
                                        padding: "8px 16px 5px", position: "sticky", top: 0, zIndex: 2,
                                        background: T.surface, borderBottom: `1px solid ${T.border}`,
                                        display: "flex", alignItems: "center", justifyContent: "space-between"
                                    }}>
                                        <span style={{
                                            fontSize: 12, fontWeight: 600, color: T.subtext,
                                            textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "'DM Sans', sans-serif"
                                        }}>
                                            {fmtDate(dateKey)}
                                        </span>
                                        {days !== null && (
                                            <span style={{
                                                fontSize: 12, fontWeight: 600, color: urgColor,
                                                fontFamily: "'DM Mono', monospace", letterSpacing: "0.04em"
                                            }}>
                                                {days === 0 ? "Today" : days === 1 ? "Tomorrow" : `in ${days}d`}
                                            </span>
                                        )}
                                    </div>

                                    {/* Earnings rows */}
                                    {items.map((item, idx) => {
                                        const inWl = isInWatchlist(item.ticker);
                                        const days_i = daysUntil(item.result_date);
                                        return (
                                            <div key={item.id ?? `${dateKey}-${idx}`}
                                                className="wl-announce-row"
                                                style={{
                                                    padding: "9px 16px", borderBottom: `1px solid ${T.border}`,
                                                    transition: "background 0.1s", cursor: "default",
                                                    borderLeft: `2px solid ${inWl ? T.green : "transparent"}`
                                                }}
                                                onMouseEnter={e => { e.currentTarget.style.background = T.hover; }}
                                                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                                            >
                                                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                                                    {/* Left: ticker + company */}
                                                    <div style={{ minWidth: 0, flex: 1 }}>
                                                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                                                            <span style={{
                                                                fontSize: 14, fontWeight: 700, color: T.text,
                                                                fontFamily: "'DM Mono', monospace", letterSpacing: "0.05em", flexShrink: 0
                                                            }}>
                                                                {item.ticker || "—"}
                                                            </span>
                                                            {inWl && (
                                                                <span style={{
                                                                    fontSize: 11, fontWeight: 600, padding: "1px 5px", borderRadius: 3,
                                                                    background: `${T.green}15`, border: `1px solid ${T.green}50`,
                                                                    color: T.green, textTransform: "uppercase", letterSpacing: "0.06em",
                                                                    fontFamily: "'DM Sans', sans-serif", flexShrink: 0
                                                                }}>
                                                                    WL
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div style={{
                                                            fontSize: 14, color: T.subtext, fontFamily: "'DM Sans', sans-serif",
                                                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
                                                        }}>
                                                            {item.company_name || "—"}
                                                        </div>
                                                    </div>

                                                    {/* Right: date + meta */}
                                                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                                                        {item.meeting_type && (
                                                            <div style={{
                                                                fontSize: 12, fontWeight: 600, color: "#f59e0b",
                                                                fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.04em",
                                                                textTransform: "uppercase", marginBottom: 2
                                                            }}>
                                                                {item.meeting_type}
                                                            </div>
                                                        )}
                                                        {item.result_type && (
                                                            <div style={{ fontSize: 12, color: T.subtext, fontFamily: "'DM Sans', sans-serif" }}>
                                                                {item.result_type}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Exchange + market cap row if available */}
                                                {(item.exchange || item.market_cap_category) && (
                                                    <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                                                        {item.exchange && (
                                                            <span style={{
                                                                fontSize: 11, fontWeight: 500, padding: "1px 5px", borderRadius: 3,
                                                                background: T.card, border: `1px solid ${T.border}`, color: T.subtext,
                                                                fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", letterSpacing: "0.05em"
                                                            }}>
                                                                {item.exchange}
                                                            </span>
                                                        )}
                                                        {item.market_cap_category && (
                                                            <span style={{
                                                                fontSize: 11, fontWeight: 500, padding: "1px 5px", borderRadius: 3,
                                                                background: T.card, border: `1px solid ${T.border}`, color: T.subtext,
                                                                fontFamily: "'DM Sans', sans-serif"
                                                            }}>
                                                                {item.market_cap_category}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}

                        {grouped.hasMore && (
                            <div style={{ padding: isMobile ? "12px 16px calc(20px + env(safe-area-inset-bottom, 0px))" : "12px 16px 16px", borderTop: `1px solid ${T.border}` }}>
                                <button
                                    onClick={() => setVisibleCount(c => c + 30)}
                                    style={{
                                        width: "100%", padding: "7px 0", background: "transparent",
                                        border: `1px solid ${T.border}`, borderRadius: 6, color: T.subtext,
                                        fontSize: 14, fontWeight: 500, cursor: "pointer",
                                        fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.03em",
                                        transition: "color 0.15s, border-color 0.15s"
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.color = "#f59e0b"; e.currentTarget.style.borderColor = "rgba(245,158,11,0.5)"; }}
                                    onMouseLeave={e => { e.currentTarget.style.color = T.subtext; e.currentTarget.style.borderColor = T.border; }}
                                >
                                    Show {grouped.remaining} more
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}