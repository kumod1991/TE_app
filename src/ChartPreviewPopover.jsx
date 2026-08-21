import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// ─────────────────────────────────────────────────────────────────────────
// Shared weekly-OHLC chart preview: powers the "hover a row → see a mini
// candlestick chart" popover on every stock table across the app (TechLens
// Screens, Market Movers, Volume Shockers, RS Leaders, Trend Template).
//
// This file is the single source of truth for:
//   - fetchWeeklyOHLCFromDB(ticker)   fetch + in-memory cache of weekly candles
//   - MiniCandleChart                 the compact SVG candlestick renderer
//   - ChartPreviewPopover             the floating card (portal to <body>)
//   - useChartRowPreview()            hook that wires hover (desktop) /
//                                      tap-to-toggle (touch) onto table rows
// ─────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Theme objects differ in shape between callers: StockDashboard's
// buildDashboardTheme() sets an explicit `T.isDark` boolean, while App.jsx's
// theme objects don't — they only carry `T.bg` and compare it against a
// known light-mode background. This resolver supports both without either
// caller needing to be reshaped, and without importing from either caller
// (which would create a circular import).
function _resolveIsDark(T) {
    if (typeof T?.isDark === "boolean") return T.isDark;
    const rgb = _hexToRgb(T?.bg);
    if (!rgb) return false;
    const channel = c => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const luminance = 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
    return luminance < 0.32;
}

function _hexToRgb(hex) {
    if (!hex || typeof hex !== "string") return null;
    const m = hex.replace("#", "").match(/^([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m) return null;
    let h = m[1];
    if (h.length === 3) h = h.split("").map(c => c + c).join("");
    const num = parseInt(h, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

// Simple in-memory cache: ticker → candles[] or null (failed/not found)
const _weeklyChartCache = new Map();
// In-flight promise registry so concurrent callers await the same fetch
const _weeklyChartInFlight = new Map();

// Aggregate daily rows → weekly OHLC candles (week starts Monday)
function _aggregateToWeekly(dailyRows) {
    const sorted = [...dailyRows].sort((a, b) => (a.date < b.date ? -1 : 1));
    const weeks = {};
    for (const r of sorted) {
        const d = new Date(r.date);
        const day = d.getDay(); // 0=Sun … 6=Sat
        const diff = day === 0 ? -6 : 1 - day;
        const mon = new Date(d); mon.setDate(d.getDate() + diff);
        const key = mon.toISOString().slice(0, 10);
        if (!weeks[key]) {
            weeks[key] = { date: key, o: r.open, h: r.high, l: r.low, c: r.close, v: r.volume ?? 0 };
        } else {
            const w = weeks[key];
            if (r.high > w.h) w.h = r.high;
            if (r.low < w.l) w.l = r.low;
            w.c = r.close;
            w.v += r.volume ?? 0;
        }
    }
    return Object.values(weeks).sort((a, b) => (a.date < b.date ? -1 : 1));
}

// Fetch ~1 year of daily rows from stock_prices_daily, aggregate to weekly.
// Cached + de-duped across every table that uses it.
export async function fetchWeeklyOHLCFromDB(ticker) {
    // Return cached result immediately (null = failed, array = ok)
    const cached = _weeklyChartCache.get(ticker);
    if (cached !== undefined && cached !== "loading") return cached; // null or array

    // If already in flight, share the same promise
    if (_weeklyChartInFlight.has(ticker)) return _weeklyChartInFlight.get(ticker);

    const promise = (async () => {
        try {
            const cutoff = new Date();
            cutoff.setFullYear(cutoff.getFullYear() - 1);
            const cutoffStr = cutoff.toISOString().slice(0, 10);

            const fetchFor = async (exchange) => {
                const url = `${SUPABASE_URL}/rest/v1/stock_prices_daily`
                    + `?ticker=eq.${encodeURIComponent(ticker)}`
                    + `&exchange=eq.${exchange}`
                    + `&date=gte.${cutoffStr}`
                    + `&select=date,open,high,low,close,volume`
                    + `&order=date.asc`
                    + `&limit=400`;
                const r = await fetch(url, {
                    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
                    signal: AbortSignal.timeout(8000),
                });
                if (!r.ok) return null;
                const rows = await r.json();
                return Array.isArray(rows) && rows.length >= 5 ? rows : null;
            };

            // Most tickers trade on NSE, so try that first (cheaper — usually
            // the winning path). Fall back to BSE for BSE-only small/micro
            // caps (e.g. OOONE) that never got an NSE listing.
            const rows = (await fetchFor("NSE")) || (await fetchFor("BSE"));
            if (!rows) { _weeklyChartCache.set(ticker, null); return null; }
            const candles = _aggregateToWeekly(rows);
            _weeklyChartCache.set(ticker, candles);
            return candles;
        } catch {
            _weeklyChartCache.set(ticker, null);
            return null;
        } finally {
            _weeklyChartInFlight.delete(ticker);
        }
    })();

    _weeklyChartInFlight.set(ticker, promise);
    return promise;
}

// True if this ticker's weekly candles are already cached or currently
// being fetched (used to skip redundant prefetch calls).
export function isWeeklyChartWarm(ticker) {
    return _weeklyChartCache.get(ticker) !== undefined || _weeklyChartInFlight.has(ticker);
}

// ── Global prefetch queue ───────────────────────────────────────────────
// Every caller (TechLens/Screens tables, Market Movers, Volume Shockers, RS
// Leaders, Trend Template) routes through ONE shared queue instead of each
// firing its own independent staggered burst of requests. This matters most
// on the Dashboard page, where several of these tables mount at the same
// time (Movers + RS Leaders + Trend Template all render together on
// desktop) — without a shared queue, each table's prefetch effect would
// fire its own 80ms-staggered burst in parallel, multiplying total
// concurrent requests by however many tables happen to be mounted. Routing
// everything through one queue means the total number of in-flight
// prefetch requests stays bounded no matter how many tables ask at once.
const _prefetchQueue = [];
const _prefetchQueued = new Set(); // tickers already queued (or in-flight), so repeat calls across tables don't double-enqueue
let _prefetchPumpTimer = null;
const PREFETCH_STAGGER_MS = 90;

function _pumpPrefetchQueue() {
    if (_prefetchQueue.length === 0) { _prefetchPumpTimer = null; return; }
    const ticker = _prefetchQueue.shift();
    _prefetchQueued.delete(ticker);
    if (!isWeeklyChartWarm(ticker)) fetchWeeklyOHLCFromDB(ticker);
    _prefetchPumpTimer = setTimeout(_pumpPrefetchQueue, PREFETCH_STAGGER_MS);
}

// Queue weekly candles to be pre-fetched for a list of tickers so the hover
// popover feels instant. Call from a useEffect keyed on the visible rows.
//
// - Deduped and rate-limited through one shared, cross-table queue (see
//   above) rather than firing an independent burst per caller.
// - Skipped entirely on touch devices by default: touch has no hover, so
//   the popover there only opens on tap — pre-warming buys nothing and just
//   spends the person's mobile data. Pass `skipOnTouch: false` to override.
export function prefetchWeeklyCharts(tickers, { limit = 10, skipOnTouch = true } = {}) {
    if (skipOnTouch && typeof window !== "undefined" && window.matchMedia?.("(hover: none)").matches) {
        return;
    }
    (tickers || []).slice(0, limit).filter(Boolean).forEach(ticker => {
        if (isWeeklyChartWarm(ticker) || _prefetchQueued.has(ticker)) return;
        _prefetchQueued.add(ticker);
        _prefetchQueue.push(ticker);
    });
    if (!_prefetchPumpTimer && _prefetchQueue.length > 0) {
        _prefetchPumpTimer = setTimeout(_pumpPrefetchQueue, PREFETCH_STAGGER_MS);
    }
}

// Compact weekly candlestick SVG — no external deps
export function MiniCandleChart({ candles, T, accentColor, width = 250, height = 112 }) {
    if (!candles || candles.length < 4) return null;
    const isDark = _resolveIsDark(T);

    // ── layout constants ──
    const volH = 28;                          // height of the volume sub-panel
    const gap = 4;                           // gap between price and volume panels
    const pad = { l: 4, r: 34, t: 6, b: 14 };
    const totalH = height + volH + gap;         // overall SVG height
    const W = width - pad.l - pad.r;
    const H = height - pad.t - pad.b;     // price panel inner height

    // ── price helpers ──
    const valid = candles.filter(c => c.h != null && c.l != null);
    const pMin = Math.min(...valid.map(c => c.l));
    const pMax = Math.max(...valid.map(c => c.h));
    const pRange = pMax - pMin || 1;

    const py = (v) => pad.t + H - ((v - pMin) / pRange) * H;
    const n = candles.length;
    const slotW = W / n;
    const bodyW = Math.max(1.2, slotW * 0.58);

    const posClr = isDark ? "#4ade80" : "#16a34a";
    const negClr = isDark ? "#fb7185" : "#e11d48";

    // ── volume helpers ──
    const volTop = pad.t + H + pad.b + gap;   // top-y of volume sub-panel
    const volInnerH = volH - 2;                   // leave 2px bottom breathing room
    const vols = candles.map(c => c.v || 0);
    const vMax = Math.max(...vols, 1);
    const vy = (v) => volTop + volInnerH - (v / vMax) * volInnerH;
    // 20-week average volume line
    const volMaPoints = candles.map((c, i) => {
        if (i < 19) return null;
        const avg = candles.slice(i - 19, i + 1).reduce((s, x) => s + (x.v || 0), 0) / 20;
        return `${pad.l + (i + 0.5) * slotW},${vy(avg)}`;
    }).filter(Boolean).join(" ");
    // Volume axis label (max volume, human-readable)
    const volFmt = (v) => v >= 1e7 ? `${(v / 1e7).toFixed(1)}Cr` : v >= 1e5 ? `${(v / 1e5).toFixed(0)}L` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v);

    // ── 10-week price MA ──
    const maPoints = candles.map((c, i) => {
        if (i < 9) return null;
        const avg = candles.slice(i - 9, i + 1).reduce((s, x) => s + x.c, 0) / 10;
        return `${pad.l + (i + 0.5) * slotW},${py(avg)}`;
    }).filter(Boolean).join(" ");

    const priceFmt = (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v).toString();
    const axisVals = [pMin, pMin + pRange * 0.5, pMax];

    return (
        <svg width={width} height={totalH} style={{ display: "block", overflow: "visible" }}>
            {/* ── Price panel ── */}
            {/* Grid lines */}
            {axisVals.map((v, i) => (
                <line key={i} x1={pad.l} x2={pad.l + W} y1={py(v)} y2={py(v)}
                    stroke={T.border} strokeWidth="0.5" strokeDasharray="3,3" opacity="0.5" />
            ))}
            {/* Candles */}
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
                        <line x1={cx} x2={cx} y1={py(c.h)} y2={py(c.l)}
                            stroke={clr} strokeWidth="0.7" opacity="0.7" />
                        <rect x={cx - bodyW / 2} y={bodyT} width={bodyW} height={bH}
                            fill={clr} opacity={bull ? 0.82 : 0.88} rx="0.4" />
                    </g>
                );
            })}
            {/* 10-week MA */}
            {maPoints && (
                <polyline points={maPoints} fill="none"
                    stroke={isDark ? "#f59e0b" : "#d97706"}
                    strokeWidth="1.1" opacity="0.85"
                    strokeLinejoin="round" strokeLinecap="round" />
            )}
            {/* Price axis */}
            {axisVals.map((v, i) => (
                <text key={i} x={pad.l + W + 3} y={py(v) + 3.5}
                    fontSize="7.5" fill={T.muted}
                    fontFamily="'IBM Plex Mono',monospace"
                    textAnchor="start" opacity="0.75">
                    {priceFmt(v)}
                </text>
            ))}
            {/* WEEKLY badge */}
            <text x={pad.l + 3} y={pad.t + H + 11}
                fontSize="7" fill={T.muted}
                fontFamily="'IBM Plex Mono',monospace"
                textAnchor="start" opacity="0.55">
                {candles.length}W • 10WMA
            </text>

            {/* ── Divider between price and volume panels ── */}
            <line x1={pad.l} x2={pad.l + W} y1={volTop - 2} y2={volTop - 2}
                stroke={T.border} strokeWidth="0.5" opacity="0.4" />

            {/* ── Volume sub-panel ── */}
            {/* Volume bars */}
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
            {/* 20-week average volume line */}
            {volMaPoints && (
                <polyline points={volMaPoints} fill="none"
                    stroke={isDark ? "#94a3b8" : "#64748b"}
                    strokeWidth="0.9" opacity="0.75"
                    strokeLinejoin="round" strokeLinecap="round"
                    strokeDasharray="2,2" />
            )}
            {/* Volume axis label — max value at top-right */}
            <text x={pad.l + W + 3} y={volTop + 5}
                fontSize="7" fill={T.muted}
                fontFamily="'IBM Plex Mono',monospace"
                textAnchor="start" opacity="0.65">
                {volFmt(vMax)}
            </text>
            {/* VOL label */}
            <text x={pad.l + 3} y={volTop + volInnerH - 1}
                fontSize="7" fill={T.muted}
                fontFamily="'IBM Plex Mono',monospace"
                textAnchor="start" opacity="0.5">
                VOL • 20W avg
            </text>
        </svg>
    );
}

// Hover popover card — renders via portal, shows chart + key metrics.
// `row` only needs a `ticker`; any of ret_3m/ret_6m/ret_12m/rs_rating/
// rel_volume/pct_from_52w_high/close/ltp it has will be shown, everything
// else renders blank — so this works unmodified across differently-shaped
// row objects (Screens rows, Movers rows, RS rows, Trend Template rows…).
export function ChartPreviewPopover({ ticker, row, T, accentColor, anchorRect, nameMap, industryMap }) {
    const [candles, setCandles] = useState(null);
    const [loading, setLoading] = useState(true);
    const isDark = _resolveIsDark(T);
    const mono = "'IBM Plex Mono', monospace";
    const sans = "'IBM Plex Sans', system-ui, sans-serif";
    const acOrFall = accentColor || (isDark ? "#818cf8" : "#4f46e5");

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setCandles(null);
        // If already fully resolved in cache (not the "loading" sentinel), use it immediately
        const cached = _weeklyChartCache.get(ticker);
        if (Array.isArray(cached)) {
            setCandles(cached); setLoading(false); return;
        }
        // Either not cached yet or in-flight — call fetch (it will resolve from cache if in-flight)
        fetchWeeklyOHLCFromDB(ticker).then(c => {
            if (!cancelled) {
                // Guard: only accept a real array, never the sentinel string
                setCandles(Array.isArray(c) ? c : null);
                setLoading(false);
            }
        }).catch(() => {
            if (!cancelled) { setCandles(null); setLoading(false); }
        });
        return () => { cancelled = true; };
    }, [ticker]);

    // Position popover to the right of the anchor cell, vertically centred.
    // Fully clamped so it never escapes the viewport on any edge.
    const popW = 272, popH = 242;
    const GAP = 10;   // gap between anchor and popover
    const EDGE = 8;    // min distance from viewport edge

    // Prefer right side; fall back to left if it would clip
    const spaceRight = window.innerWidth - anchorRect.right - GAP;
    const spaceLeft = anchorRect.left - GAP;
    let left;
    if (spaceRight >= popW || spaceRight >= spaceLeft) {
        // place to the right, then clamp
        left = anchorRect.right + GAP;
    } else {
        // place to the left
        left = anchorRect.left - GAP - popW;
    }
    // Clamp horizontally so popover never goes off-screen
    left = Math.max(EDGE, Math.min(left, window.innerWidth - popW - EDGE));

    // Centre vertically on the anchor row, then clamp
    let top = (anchorRect.top + anchorRect.bottom) / 2 - popH / 2;
    top = Math.max(EDGE, Math.min(top, window.innerHeight - popH - EDGE));

    const lastC = candles ? candles[candles.length - 1] : null;
    const prevC = candles && candles.length > 1 ? candles[candles.length - 2] : null;
    const chgPct = lastC && prevC?.c ? ((lastC.c - prevC.c) / prevC.c) * 100 : null;
    const isUp = chgPct == null ? null : chgPct >= 0;
    const posClr = isDark ? "#4ade80" : "#16a34a";
    const negClr = isDark ? "#fb7185" : "#e11d48";
    const rowPrice = row.close ?? row.ltp;

    return createPortal(
        <div style={{
            position: "fixed", top, left, width: popW, zIndex: 99999,
            background: T.card,
            border: `1px solid ${T.border}`,
            borderRadius: 10,
            boxShadow: isDark
                ? "0 8px 32px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.04)"
                : "0 8px 28px rgba(0,0,0,0.14), 0 1px 0 rgba(255,255,255,0.9)",
            pointerEvents: "none",
            fontFamily: sans,
            overflow: "hidden",
        }}>
            {/* ── Header: ticker + name + live price ── */}
            <div style={{
                padding: "9px 12px 7px",
                borderBottom: `1px solid ${T.border}`,
                display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8,
            }}>
                <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        {(() => {
                            const hue = ticker.split("").reduce((h, c) => h + c.charCodeAt(0) * 37, 0) % 360;
                            const bg = isDark ? `hsl(${hue},18%,18%)` : `hsl(${hue},28%,90%)`;
                            const fg = isDark ? `hsl(${hue},40%,62%)` : `hsl(${hue},35%,32%)`;
                            return (
                                <span style={{
                                    fontSize: 8, fontWeight: 700, letterSpacing: ".05em",
                                    background: bg, color: fg, fontFamily: mono, textTransform: "uppercase",
                                    padding: "1px 6px", borderRadius: 3
                                }}>
                                    {ticker.slice(0, 6)}
                                </span>
                            );
                        })()}
                        <span style={{
                            fontSize: 12, fontWeight: 700, color: T.text, fontFamily: mono,
                            letterSpacing: ".02em"
                        }}>
                            {ticker}
                        </span>
                    </div>
                    {(nameMap?.[ticker] || row.name) && (
                        <div style={{
                            fontSize: 10, color: T.subtext, lineHeight: 1.3,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 158
                        }}>
                            {nameMap?.[ticker] || row.name}
                        </div>
                    )}
                    {industryMap?.[ticker] && (
                        <div style={{ fontSize: 9.5, color: T.muted, marginTop: 1 }}>
                            {industryMap[ticker]}
                        </div>
                    )}
                </div>
                {/* Price + week-on-week change */}
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{
                        fontSize: 13, fontWeight: 700, color: T.text, fontFamily: mono,
                        fontVariantNumeric: "tabular-nums", lineHeight: 1.1
                    }}>
                        {lastC
                            ? `${Number(lastC.c).toLocaleString("en-IN", { maximumFractionDigits: 1 })}`
                            : (rowPrice ? `${Number(rowPrice).toLocaleString("en-IN", { maximumFractionDigits: 1 })}` : "")}
                    </div>
                    {chgPct != null && (
                        <div style={{
                            fontSize: 10, fontWeight: 600, fontFamily: mono,
                            color: isUp ? posClr : negClr, marginTop: 2
                        }}>
                            {isUp ? "▲" : "▼"} {Math.abs(chgPct).toFixed(2)}%
                        </div>
                    )}
                </div>
            </div>

            {/* ── Chart area ── */}
            <div style={{
                padding: "6px 6px 2px", minHeight: 158,
                display: "flex", alignItems: "center", justifyContent: "center"
            }}>
                {loading ? (
                    <div style={{
                        display: "flex", flexDirection: "column", alignItems: "center",
                        gap: 6, opacity: 0.5, padding: "16px 0"
                    }}>
                        <div style={{
                            width: 16, height: 16, border: `1.5px solid ${T.border}`,
                            borderTopColor: acOrFall, borderRadius: "50%",
                            animation: "finspin .7s linear infinite"
                        }} />
                        <span style={{ fontSize: 10, color: T.muted }}>Loading chart</span>
                    </div>
                ) : candles ? (
                    <MiniCandleChart candles={candles} T={T} accentColor={acOrFall} width={258} height={116} />
                ) : (
                    <div style={{ fontSize: 10, color: T.muted, opacity: 0.55, padding: "20px 0" }}>
                        Chart data unavailable
                    </div>
                )}
            </div>

            {/* ── Footer: 6 key metrics ── */}
            <div style={{
                padding: "6px 12px 8px",
                borderTop: `1px solid ${T.border}`,
                display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px 6px",
            }}>
                {[
                    { label: "3M Ret", val: row.ret_3m != null ? `${row.ret_3m >= 0 ? "+" : ""}${Number(row.ret_3m).toFixed(1)}%` : "", color: row.ret_3m == null ? T.muted : row.ret_3m >= 0 ? posClr : negClr },
                    { label: "6M Ret", val: row.ret_6m != null ? `${row.ret_6m >= 0 ? "+" : ""}${Number(row.ret_6m).toFixed(1)}%` : "", color: row.ret_6m == null ? T.muted : row.ret_6m >= 0 ? posClr : negClr },
                    { label: "12M Ret", val: row.ret_12m != null ? `${row.ret_12m >= 0 ? "+" : ""}${Number(row.ret_12m).toFixed(1)}%` : "", color: row.ret_12m == null ? T.muted : row.ret_12m >= 0 ? posClr : negClr },
                    { label: "RS Rating", val: row.rs_rating != null ? Math.round(row.rs_rating) : "", color: row.rs_rating >= 90 ? posClr : row.rs_rating >= 75 ? (isDark ? "#f97316" : "#ea580c") : T.subtext },
                    { label: "Rel Vol", val: row.rel_volume != null ? `${Number(row.rel_volume).toFixed(2)}x` : "", color: row.rel_volume >= 2 ? posClr : row.rel_volume >= 1 ? T.text : T.muted },
                    { label: "From High", val: row.pct_from_52w_high != null ? `-${Number(row.pct_from_52w_high).toFixed(1)}%` : "", color: T.subtext },
                ].map(({ label, val, color }) => (
                    <div key={label} style={{ textAlign: "center" }}>
                        <div style={{
                            fontSize: 8.5, color: T.muted, textTransform: "uppercase",
                            letterSpacing: ".05em", marginBottom: 1
                        }}>{label}</div>
                        <div style={{
                            fontSize: 11, fontWeight: 700, color, fontFamily: mono,
                            fontVariantNumeric: "tabular-nums"
                        }}>{val}</div>
                    </div>
                ))}
            </div>
        </div>,
        document.body
    );
}

// ─────────────────────────────────────────────────────────────────────────
// useChartRowPreview — drop-in hook that gives any table hover-to-preview
// (desktop) + tap-to-toggle-preview (touch) behaviour identical to the
// TechLens/Screens tables, without every table re-implementing the state,
// the outside-tap dismiss listener, or the anchor-rect math.
//
// Usage in a table component:
//
//   const { hoveredRow, wrapRef, rowPreviewHandlers, PreviewPopover } =
//       useChartRowPreview({ T, accentColor });
//
//   return (
//     <div ref={wrapRef} style={{ position: "relative" }}>
//       <table>
//         <tr {...rowPreviewHandlers(row.ticker, row)}>
//           <td data-preview-anchor="1">...name cell...</td>
//           ...
//         </tr>
//       </table>
//       {PreviewPopover}
//     </div>
//   );
//
// If the row already has its own onClick (e.g. navigate to the full ticker
// page), just spread only the hover handlers instead:
//   onMouseEnter={rowPreviewHandlers(row.ticker, row).onMouseEnter}
//   onMouseLeave={rowPreviewHandlers(row.ticker, row).onMouseLeave}
// and keep the existing onClick — touch devices will keep navigating on tap
// (as they already do today) while desktop gets the hover preview.
// ─────────────────────────────────────────────────────────────────────────
export function useChartRowPreview({ T, accentColor, nameMap, industryMap, anchorSelector = "[data-preview-anchor]" } = {}) {
    const [hoveredRow, setHoveredRow] = useState(null); // { ticker, row, anchorRect }
    const wrapRef = useRef(null);

    // Dismiss chart preview when tapping outside the table (touch devices)
    useEffect(() => {
        if (!hoveredRow) return;
        const h = e => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) {
                setHoveredRow(null);
            }
        };
        document.addEventListener("touchstart", h, { passive: true });
        return () => document.removeEventListener("touchstart", h);
    }, [hoveredRow]);

    const anchorRectFor = (e) => {
        const el = e.currentTarget.querySelector(anchorSelector) || e.currentTarget;
        return el.getBoundingClientRect();
    };

    // Full set of handlers: hover shows/hides on desktop, tap toggles on touch.
    // Spread directly onto a <tr> that has no existing onClick.
    const rowPreviewHandlers = (ticker, row) => ({
        onMouseEnter: e => {
            if (window.matchMedia("(hover: none)").matches) return;
            setHoveredRow({ ticker, row, anchorRect: anchorRectFor(e) });
        },
        onMouseLeave: () => {
            if (window.matchMedia("(hover: none)").matches) return;
            setHoveredRow(null);
        },
        onClick: e => {
            // Touch devices only: tap to toggle preview; tap same row again to dismiss
            if (!window.matchMedia("(hover: none)").matches) return;
            if (hoveredRow?.ticker === ticker) {
                setHoveredRow(null);
            } else {
                setHoveredRow({ ticker, row, anchorRect: anchorRectFor(e) });
            }
        },
    });

    // Hover-only handlers, for rows that already have their own onClick
    // (e.g. navigate-to-ticker) that should keep working unchanged.
    const hoverOnlyHandlers = (ticker, row) => ({
        onMouseEnter: e => {
            if (window.matchMedia("(hover: none)").matches) return;
            setHoveredRow({ ticker, row, anchorRect: anchorRectFor(e) });
        },
        onMouseLeave: () => {
            if (window.matchMedia("(hover: none)").matches) return;
            setHoveredRow(null);
        },
    });

    const clearPreview = () => setHoveredRow(null);

    const PreviewPopover = hoveredRow ? (
        <ChartPreviewPopover
            ticker={hoveredRow.ticker}
            row={hoveredRow.row}
            T={T}
            accentColor={accentColor}
            anchorRect={hoveredRow.anchorRect}
            nameMap={nameMap}
            industryMap={industryMap}
        />
    ) : null;

    return { hoveredRow, wrapRef, rowPreviewHandlers, hoverOnlyHandlers, clearPreview, PreviewPopover };
}
