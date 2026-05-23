import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";

const SUPABASE_URL      = "https://munqjcjvzgqyxzlmuyjj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bnFqY2p2emdxeXh6bG11eWpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3MDc5NzEsImV4cCI6MjA4NzI4Mzk3MX0.9nHH5bTsL-RRwMMPoxTBFz3896BlhBBhUPGh0xP3U4Q";

// ─── TWO-LEVEL CACHE  (memory + sessionStorage)  ────────────────────────────────
//
//  Layer 1 – in-memory Map  : sub-millisecond reads, survives re-renders.
//  Layer 2 – sessionStorage : survives hard-refresh / new tab in same browser session.
//
//  Stale-While-Revalidate (SWR):
//    • If cached data is stale (older than TTL), it is returned immediately so
//      the UI never shows a loading spinner for known data.  A background fetch
//      then silently updates both layers; callers may pass onStale(freshData) to
//      react to the refresh without blocking the render.
//    • On a truly cold first load (nothing in either layer) the fetch is awaited
//      normally – this is the only case where the user sees a skeleton.
//
//  sessionStorage keys are namespaced under "sbd:" to avoid collisions.
// ─────────────────────────────────────────────────────────────────────────────────
const SS_PREFIX  = "sbd:";
const _memCache  = new Map();   // key → { data, ts, ttl }
const _pending   = new Map();   // key → Promise  (dedup concurrent requests)

// ── sessionStorage helpers ────────────────────────────────────────────────────
function _ssKey(key) { return SS_PREFIX + key; }

function _ssGet(key) {
    try {
        const raw = sessionStorage.getItem(_ssKey(key));
        if (!raw) return null;
        return JSON.parse(raw);   // { data, ts, ttl }
    } catch { return null; }
}

function _ssSet(key, entry) {
    try {
        sessionStorage.setItem(_ssKey(key), JSON.stringify(entry));
    } catch {
        // QuotaExceededError – evict oldest 30 % of our entries then retry
        try {
            const toRemove = [];
            for (let i = 0; i < sessionStorage.length; i++) {
                const k = sessionStorage.key(i);
                if (k && k.startsWith(SS_PREFIX)) toRemove.push(k);
            }
            toRemove
                .map(k => { try { return { k, ts: JSON.parse(sessionStorage.getItem(k) || "{}").ts || 0 }; } catch { return { k, ts: 0 }; } })
                .sort((a, b) => a.ts - b.ts)
                .slice(0, Math.ceil(toRemove.length * 0.3))
                .forEach(({ k }) => sessionStorage.removeItem(k));
            try { sessionStorage.setItem(_ssKey(key), JSON.stringify(entry)); } catch { /* give up */ }
        } catch { /* private/incognito – ignore silently */ }
    }
}

// ── Two-level read: returns { data, stale } or null ──────────────────────────
function cacheGet(key, ttl) {
    // 1. Check memory layer first (fastest)
    const mem = _memCache.get(key);
    if (mem) {
        const stale = Date.now() - mem.ts > mem.ttl;
        if (!stale) return { data: mem.data, stale: false };
        // Memory entry is stale – fall through to check sessionStorage for a
        // potentially fresher copy (could have been written by another tab).
    }

    // 2. Check sessionStorage layer
    const ss = _ssGet(key);
    if (ss && ss.data !== undefined) {
        const effectiveTtl = ttl ?? ss.ttl ?? 0;
        const stale = Date.now() - ss.ts > effectiveTtl;
        // Promote into memory so subsequent reads are instant
        _memCache.set(key, { data: ss.data, ts: ss.ts, ttl: ss.ttl ?? effectiveTtl });
        return { data: ss.data, stale };
    }

    // 3. Memory stale but sessionStorage empty – surface the stale memory value
    if (mem) return { data: mem.data, stale: true };

    return null;  // cache miss
}

function cacheSet(key, data, ttl = 5 * 60 * 1000) {
    const entry = { data, ts: Date.now(), ttl };
    _memCache.set(key, entry);
    _ssSet(key, entry);

    // Trim memory cache ceiling
    if (_memCache.size > 150) {
        const keys = [..._memCache.keys()];
        keys.slice(0, Math.floor(keys.length * 0.2)).forEach(k => _memCache.delete(k));
    }
}

// ─── SUPABASE FETCH  (SWR-aware) ─────────────────────────────────────────────
//
//  Options:
//    ttl     – cache lifetime ms (default 5 min)
//    noCache – bypass read+write entirely
//    onStale – callback(freshData) invoked when a background SWR refresh
//              completes; use this to silently push updated state to the UI.
//
async function sbFetch(path, token, { ttl = 5 * 60 * 1000, noCache = false, onStale } = {}) {
    const key = path;

    if (!noCache) {
        const hit = cacheGet(key, ttl);
        if (hit) {
            if (!hit.stale) {
                // Fresh hit – return instantly, zero network cost.
                return hit.data;
            }
            // Stale hit – return cached data NOW (no spinner for the user)
            // and silently re-fetch in the background.
            _backgroundFetch(path, token, ttl, onStale);
            return hit.data;
        }
    }

    // True cache miss (first-ever load or noCache) – await the network call.
    return _doFetch(path, token, ttl, noCache);
}

// Internal: deduplicated network fetch; writes to both cache layers on success.
function _doFetch(path, token, ttl, noCache) {
    const key = path;
    if (_pending.has(key)) return _pending.get(key);

    const promise = (async () => {
        const url = `${SUPABASE_URL}/rest/v1/${path}`;
        console.log("[sbFetch]", url);
        const res = await fetch(url, {
            headers: {
                "Content-Type": "application/json",
                apikey: SUPABASE_ANON_KEY,
                Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
            },
        });
        const raw = await res.text();
        if (!res.ok) { console.error("[sbFetch]", res.status, raw); throw new Error(`Supabase ${res.status}: ${raw}`); }
        let data;
        try { data = JSON.parse(raw); } catch { throw new Error("Invalid JSON from Supabase"); }
        if (data && !Array.isArray(data) && data.code) {
            console.error("[sbFetch] error body:", data);
            throw new Error(data.message || data.hint || JSON.stringify(data));
        }
        console.log("[sbFetch]", path.split("?")[0], "->", Array.isArray(data) ? `${data.length} rows` : data);
        if (!noCache) cacheSet(key, data, ttl);
        return data;
    })().finally(() => _pending.delete(key));

    _pending.set(key, promise);
    return promise;
}

// Internal: fire-and-forget background SWR refresh.
function _backgroundFetch(path, token, ttl, onStale) {
    if (_pending.has(path)) {
        // Piggyback on the already in-flight request
        if (onStale) _pending.get(path).then(onStale).catch(() => {});
        return;
    }
    _doFetch(path, token, ttl, false)
        .then(fresh => { if (onStale) onStale(fresh); })
        .catch(err => console.warn("[sbFetch SWR bg]", path.split("?")[0], err.message));
}

async function sbFetchAll(path, token, { ttl = 5 * 60 * 1000, pageSize = 1000 } = {}) {
    const rows = [];
    let offset = 0;

    while (true) {
        const separator = path.includes("?") ? "&" : "?";
        const page = await sbFetch(
            `${path}${separator}limit=${pageSize}&offset=${offset}`,
            token,
            { ttl }
        );

        if (!Array.isArray(page) || !page.length) break;
        rows.push(...page);
        if (page.length < pageSize) break;
        offset += pageSize;
    }

    return rows;
}

// â”€â”€â”€ BATCH FETCH (splits large ticker lists to avoid query timeouts) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const BATCH_SIZE = 50;

function toSupabaseInList(values) {
    return `(${values
        .map(v => `"${String(v).trim()}"`)   // â† wrap each ticker in double-quotes
        .filter(Boolean)
        .join(",")})`;
}

async function batchFetchIndicators(tickers, userToken, extraFilter = "") {
    if (!tickers.length) return [];
    const chunks = [];
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
        chunks.push(tickers.slice(i, i + BATCH_SIZE));
    }
    const results = await Promise.all(
        chunks.map(chunk => {
            const tickersIn = toSupabaseInList(chunk);
            return sbFetch(
                `indicators?select=ticker,rs_rating,rs_score,sma20,sma50,sma200,w52_high,w52_low&ticker=in.${tickersIn}${extraFilter}`,
                userToken,
                { ttl: 5 * 60 * 1000 }
            );
        })
    );
    return results.flat();
}

async function batchFetchCompanies(tickers, userToken) {
    if (!tickers.length) return [];
    const chunks = [];
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
        chunks.push(tickers.slice(i, i + BATCH_SIZE));
    }
    const results = await Promise.all(
        chunks.map(chunk => {
            const tickersIn = toSupabaseInList(chunk);
            return sbFetch(
                `company_financials?select=ticker,name&ticker=in.${tickersIn}`,
                userToken,
                { ttl: 10 * 60 * 1000 }
            );
        })
    );
    return results.flat();
}

async function batchFetchTickerIndustryRs(tickers, userToken) {
    if (!tickers.length) return [];
    const chunks = [];
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
        chunks.push(tickers.slice(i, i + BATCH_SIZE));
    }
    const results = await Promise.all(
        chunks.map(chunk => {
            const tickersIn = toSupabaseInList(chunk);
            return sbFetch(
                `ticker_industry_rs?select=ticker,industry,rs_rating,updated_at&ticker=in.${tickersIn}`,
                userToken,
                { ttl: 60 * 60 * 1000 }
            );
        })
    );
    return results.flat();
}

async function batchFetchStockReturns(tickers, userToken) {
    if (!tickers.length) return [];
    const chunks = [];
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
        chunks.push(tickers.slice(i, i + BATCH_SIZE));
    }
    const results = await Promise.all(
        chunks.map(chunk => {
            const tickersIn = toSupabaseInList(chunk);
            return sbFetch(
                `stock_returns?select=ticker,latest_date,ret_3m,ret_6m,ret_12m&ticker=in.${tickersIn}`,
                userToken,
                { ttl: 10 * 60 * 1000 }
            );
        })
    );
    const rows = results.flat();
    // stock_returns has one row per ticker per exchange (BSE/NSE).
    // Keep the row with the most recent latest_date for each ticker.
    const best = new Map();
    for (const r of rows) {
        if (!r.ticker) continue;
        const prev = best.get(r.ticker);
        if (!prev || (r.latest_date || "") > (prev.latest_date || "")) {
            best.set(r.ticker, r);
        }
    }
    return [...best.values()];
}

async function fetchAllStock52wVolume(userToken) {
    // Fetch full stock_52w table (ticker + volume_ma20 only) paginated.
    // Avoids long IN(...) filter URLs that exceed PostgREST limits.
    return sbFetchAll(
        "stock_52w?select=ticker,volume_ma20",
        userToken,
        { ttl: 10 * 60 * 1000 }
    );
}

// â”€â”€â”€ FORMATTERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const EMPTY_VALUE = "-";
const DEFAULT_VISIBLE_ITEMS = 6;
const DEFAULT_TABLE_MAX_HEIGHT = 44 + DEFAULT_VISIBLE_ITEMS * 49;

const fmt    = (n, d = 2) => n == null ? EMPTY_VALUE : Number(n).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPct = (n)        => n == null ? EMPTY_VALUE : `${Number(n) > 0 ? "+" : ""}${fmt(n)}%`;
const fmtVol = (n)        => {
    if (n == null) return EMPTY_VALUE;
    if (n >= 1e7) return `${(n / 1e7).toFixed(2)}Cr`;
    if (n >= 1e5) return `${(n / 1e5).toFixed(2)}L`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return String(n);
};

function normalizeIndustryName(value) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeIndustryKey(value) {
    return normalizeIndustryName(value).toUpperCase();
}

function hexToRgb(hex) {
    if (!hex || typeof hex !== "string") return null;
    const value = hex.trim().replace("#", "");
    const normalized = value.length === 3
        ? value.split("").map(ch => ch + ch).join("")
        : value;
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
    const num = parseInt(normalized, 16);
    return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255,
    };
}

function withAlpha(color, alpha) {
    if (!color || typeof color !== "string") return `rgba(15, 23, 42, ${alpha})`;
    if (color.startsWith("rgba")) {
        return color.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, `rgba($1,$2,$3,${alpha})`);
    }
    if (color.startsWith("rgb(")) {
        return color.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
    }
    const rgb = hexToRgb(color);
    if (rgb) return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
    return color;
}

function luminance(color) {
    const rgb = hexToRgb(color);
    if (!rgb) return 1;
    const channel = c => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

function buildDashboardTheme(T = {}) {
    const bg = T.bg || "#f4f7fb";
    const isDark = luminance(bg) < 0.35;
    const accent = T.accent || (isDark ? "#7dd3fc" : "#2563eb");
    const accentAlt = T.pos || "#10b981";
    const surface = T.surface || (isDark ? "#111827" : "#ffffff");
    const card = T.card || surface;
    const text = T.text || (isDark ? "#f8fafc" : "#0f172a");
    const muted = T.muted || (isDark ? "#94a3b8" : "#64748b");
    const subtext = T.subtext || muted;
    const border = T.border || (isDark ? "rgba(148,163,184,0.18)" : "rgba(15,23,42,0.09)");

    return {
        ...T,
        bg,
        card,
        surface,
        text,
        muted,
        subtext,
        border,
        accent,
        isDark,
        panelBg: isDark
            ? `linear-gradient(180deg, ${withAlpha(card, 0.98)} 0%, ${withAlpha("#020617", 0.9)} 100%)`
            : `linear-gradient(180deg, ${withAlpha(card, 0.98)} 0%, ${withAlpha("#f8fafc", 0.98)} 100%)`,
        shellBg: isDark
            ? `radial-gradient(circle at top left, ${withAlpha(accent, 0.18)} 0%, transparent 34%), radial-gradient(circle at top right, ${withAlpha(accentAlt, 0.14)} 0%, transparent 28%), ${bg}`
            : `radial-gradient(circle at top left, ${withAlpha(accent, 0.12)} 0%, transparent 34%), radial-gradient(circle at top right, ${withAlpha(accentAlt, 0.1)} 0%, transparent 30%), linear-gradient(180deg, #f8fbff 0%, ${bg} 100%)`,
        panelBorder: isDark ? withAlpha("#cbd5e1", 0.14) : withAlpha("#0f172a", 0.08),
        insetBorder: isDark ? withAlpha("#ffffff", 0.08) : withAlpha("#ffffff", 0.8),
        softFill: isDark ? withAlpha("#94a3b8", 0.1) : withAlpha("#e2e8f0", 0.7),
        hoverBg: isDark ? withAlpha(accent, 0.09) : withAlpha(accent, 0.06),
        tableHeadBg: isDark ? withAlpha("#0f172a", 0.76) : withAlpha("#f8fafc", 0.92),
        shadowLg: isDark ? "0 24px 60px rgba(2, 6, 23, 0.45)" : "0 24px 60px rgba(15, 23, 42, 0.10)",
        shadowMd: isDark ? "0 14px 34px rgba(2, 6, 23, 0.34)" : "0 14px 34px rgba(15, 23, 42, 0.08)",
        ring: withAlpha(accent, isDark ? 0.32 : 0.18),
        pillBg: isDark ? withAlpha("#0f172a", 0.72) : withAlpha("#ffffff", 0.8),
        pillBorder: isDark ? withAlpha("#cbd5e1", 0.12) : withAlpha("#0f172a", 0.08),
        posSoft: withAlpha(T.pos || "#10b981", isDark ? 0.14 : 0.1),
        negSoft: withAlpha(T.neg || "#ef4444", isDark ? 0.14 : 0.08),
    };
}

function useViewportFlags() {
    const getWidth = () => (typeof window === "undefined" ? 1440 : window.innerWidth);
    const [width, setWidth] = useState(getWidth);

    useEffect(() => {
        if (typeof window === "undefined") return undefined;
        const onResize = () => setWidth(window.innerWidth);
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    return {
        width,
        isCompact: width < 768,
        isTablet: width >= 768 && width < 1180,
    };
}

function SectionCard({ T, children, style = {}, className = "" }) {
    return (
        <div
            className={className}
            style={{
                background: T.panelBg,
                border: `1px solid ${T.panelBorder}`,
                boxShadow: T.shadowMd,
                borderRadius: 24,
                padding: 20,
                marginBottom: 18,
                backdropFilter: "blur(18px)",
                WebkitBackdropFilter: "blur(18px)",
                position: "relative",
                overflow: "hidden",
                ...style,
            }}
        >
            <div style={{
                position: "absolute",
                inset: 1,
                borderRadius: 23,
                border: `1px solid ${T.insetBorder}`,
                pointerEvents: "none",
            }} />
            <div style={{ position: "relative", zIndex: 1 }}>
                {children}
            </div>
        </div>
    );
}

function exportCSV(data, filename) {
    if (!data.length) return;
    const headers = Object.keys(data[0]);
    const rows    = data.map(r => headers.map(h => JSON.stringify(r[h] ?? "")).join(","));
    const blob    = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv" });
    const a       = document.createElement("a");
    a.href        = URL.createObjectURL(blob);
    a.download    = filename;
    a.click();
    URL.revokeObjectURL(a.href);
}

// â”€â”€â”€ MARKET OVERVIEW (Index Cards with Sparklines) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Exact columns from index_prices table schema, in preferred display order.
// The component will auto-skip any column whose latest value is null/missing.
const INDEX_META = [
    { key: "nifty_50",                          label: "Nifty 50"                    },
    { key: "nifty_500",                         label: "Nifty 500"                   },
    { key: "nifty_bank",                        label: "Nifty Bank"                  },
    { key: "nifty_auto",                        label: "Nifty Auto"                  },
    { key: "nifty_it",                          label: "Nifty IT"                    },
    { key: "nifty_fmcg",                        label: "Nifty FMCG"                  },
    { key: "nifty_energy",                      label: "Nifty Energy"                },
    { key: "nifty_financial_services",          label: "Nifty Financial Services"    },
    { key: "nifty_pharma",                      label: "Nifty Pharma"                },
    { key: "nifty_healthcare",                  label: "Nifty Healthcare"            },
    { key: "nifty_midcap_100",                  label: "Nifty Midcap 100"            },
    { key: "nifty_midcap_150",                  label: "Nifty Midcap 150"            },
    { key: "nifty_smallcap_100",                label: "Nifty Smallcap 100"          },
    { key: "nifty_smallcap_250",                label: "Nifty Smallcap 250"          },
    { key: "nifty_midsmallcap_400",             label: "Nifty MidSmallcap 400"       },
    { key: "nifty_private_bank",                label: "Nifty Private Bank"          },
    { key: "nifty_psu_bank",                    label: "Nifty PSU Bank"              },
    { key: "nifty_realty",                      label: "Nifty Realty"                },
    { key: "nifty_metal",                       label: "Nifty Metal"                 },
    { key: "nifty_media",                       label: "Nifty Media"                 },
    { key: "nifty_mnc",                         label: "Nifty MNC"                   },
    { key: "nifty_infrastructure",              label: "Nifty Infrastructure"        },
    { key: "nifty_commodities",                 label: "Nifty Commodities"           },
    { key: "nifty_pse",                         label: "Nifty PSE"                   },
    { key: "nifty_cpse",                        label: "Nifty CPSE"                  },
    { key: "nifty_services_sector",             label: "Nifty Services Sector"       },
    { key: "nifty_india_consumption",           label: "Nifty India Consumption"     },
    { key: "nifty_oil_gas",                     label: "Nifty Oil & Gas"             },
    { key: "nifty_capital_markets",             label: "Nifty Capital Markets"       },
    { key: "nifty_housing",                     label: "Nifty Housing"               },
    { key: "nifty_consumer_durables",           label: "Nifty Consumer Durables"     },
    { key: "nifty_mobility",                    label: "Nifty Mobility"              },
    { key: "nifty_india_defence",               label: "Nifty India Defence"         },
    { key: "nifty_transportation_logistics",    label: "Nifty Transportation & Logistics" },
    { key: "nifty_india_railways_psu",          label: "Nifty India Railways PSU"    },
    { key: "nifty_india_tourism",               label: "Nifty India Tourism"         },
    { key: "nifty_chemicals",                   label: "Nifty Chemicals"             },
    { key: "nifty_cement",                      label: "Nifty Cement"                },
    { key: "nifty_financial_services_ex_bank",  label: "Nifty Fin Services Ex-Bank"  },
];

const CORE_INDEX_KEYS = [
    "nifty_50",
    "nifty_500",
    "nifty_midcap_100",
    "nifty_midsmallcap_400",
    "nifty_smallcap_100",
    "nifty_smallcap_250",
];

function MiniSparkline({ values, positive, width = 120, height = 48 }) {
    if (!values || values.length < 2) return <div style={{ width, height }} />;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const pad = 4;
    const W = width, H = height;
    const pts = values.map((v, i) => {
        const x = pad + (i / (values.length - 1)) * (W - pad * 2);
        const y = pad + (1 - (v - min) / range) * (H - pad * 2);
        return `${x},${y}`;
    });
    const polyline = pts.join(" ");
    // build fill area path
    const firstX = pad;
    const lastX  = pad + (W - pad * 2);
    const fillPath = `M${firstX},${H} L${pts[0]} L${polyline.split(" ").slice(1).join(" L")} L${lastX},${H} Z`;
    const color = positive ? "#0ea67a" : "#ef4444";
    const fillColor = positive ? "rgba(14,166,122,0.12)" : "rgba(239,68,68,0.10)";
    return (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", flexShrink: 0 }}>
            <defs>
                <linearGradient id={`sg-${positive ? "p" : "n"}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={color} stopOpacity="0.02" />
                </linearGradient>
            </defs>
            <path d={fillPath} fill={`url(#sg-${positive ? "p" : "n"})`} />
            <polyline
                points={polyline}
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
            />
        </svg>
    );
}

function IndexCard({ T, label, value, changePct, sparkData, compact = false }) {
    const isPos = changePct >= 0;
    const color = isPos ? (T.pos || "#0ea67a") : (T.neg || "#ef4444");
    return (
        <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: compact ? "14px 0" : "16px 0",
            gap: compact ? 12 : 16,
        }}>
            <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{
                    fontSize: compact ? 11 : 12,
                    color: T.subtext || T.muted,
                    marginBottom: 5,
                    whiteSpace: "nowrap",
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    fontWeight: 700,
                }}>
                    {label}
                </div>
                <div style={{
                    fontSize: compact ? 15 : 17,
                    fontWeight: 700,
                    color: T.text,
                    fontFamily: "IBM Plex Mono, monospace",
                    letterSpacing: "-0.03em",
                }}>
                    {value != null ? Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : EMPTY_VALUE}
                </div>
                <div style={{
                    fontSize: compact ? 11 : 12,
                    fontWeight: 700,
                    color,
                    marginTop: 8,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "5px 9px",
                    borderRadius: 999,
                    background: isPos ? T.posSoft : T.negSoft,
                    border: `1px solid ${withAlpha(color, 0.16)}`,
                }}>
                    <span>{isPos ? "+" : "-"}</span>
                    <span>{changePct != null ? `${Math.abs(changePct).toFixed(2)}%` : EMPTY_VALUE}</span>
                </div>
            </div>
            <div style={{
                minWidth: compact ? 108 : 128,
                padding: compact ? "8px 8px 6px" : "10px 10px 8px",
                borderRadius: 18,
                background: T.softFill,
                border: `1px solid ${T.panelBorder}`,
            }}>
                <MiniSparkline values={sparkData} positive={isPos} width={compact ? 100 : 120} height={compact ? 42 : 48} />
            </div>
        </div>
    );
}

function MarketOverview({ T, userToken, isCompact, isTablet }) {
    const IDX_PATH = "index_prices?select=*&order=date.desc&limit=20";
    const IDX_TTL  = 5 * 60 * 1000;

    // Seed state from cache immediately so there's no blank frame on re-visit.
    const [rows, setRows]       = useState(() => {
        const hit = cacheGet(IDX_PATH, IDX_TTL);
        return hit ? hit.data || [] : [];
    });
    // Only show skeleton when there is truly no cached data at all.
    const [loading, setLoading] = useState(() => {
        const hit = cacheGet(IDX_PATH, IDX_TTL);
        return !hit;
    });
    const [activeIndexTab, setActiveIndexTab] = useState("core");

    useEffect(() => {
        (async () => {
            try {
                // sbFetch returns cached data (fresh or stale) instantly.
                // If stale it also kicks a background re-fetch via onStale.
                const data = await sbFetch(IDX_PATH, userToken, {
                    ttl: IDX_TTL,
                    onStale: fresh => setRows(fresh || []),
                });
                setRows(data || []);
            } catch (e) {
                console.warn("MarketOverview fetch failed:", e);
            } finally {
                setLoading(false);
            }
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userToken]);

    // rows[0] = latest (most recent date), rows[1] = previous trading day
    const latest = rows[0];
    const prev   = rows[1];

    // Chronological order for sparklines (oldest to newest)
    const chrono = useMemo(() => [...rows].reverse().slice(-15), [rows]);

    // Only show indices that exist in the latest row with a non-null numeric value
    const visibleMeta = useMemo(() => {
        if (!latest) return [];
        return INDEX_META.filter(idx => {
            const v = latest[idx.key];
            return v != null && !isNaN(Number(v)) && Number(v) > 0;
        });
    }, [latest]);

    function changePct(key) {
        if (!latest || !prev) return null;
        const cur = Number(latest[key]);
        const old = Number(prev[key]);
        if (!old || isNaN(cur) || isNaN(old)) return null;
        return ((cur - old) / old) * 100;
    }

    function sparkFor(key) {
        return chrono.map(r => Number(r[key])).filter(v => !isNaN(v) && v > 0);
    }

    const coreIndices = useMemo(
        () => visibleMeta.filter(idx => CORE_INDEX_KEYS.includes(idx.key)),
        [visibleMeta]
    );

    const sectoralIndices = useMemo(
        () => visibleMeta.filter(idx => !CORE_INDEX_KEYS.includes(idx.key)),
        [visibleMeta]
    );

    const activeIndices = activeIndexTab === "core" ? coreIndices : sectoralIndices;
    const columnCount = isCompact ? 1 : 2;
    const rowHeight = isCompact ? 112 : 104;
    const visibleRows = Math.ceil(Math.min(activeIndices.length, DEFAULT_VISIBLE_ITEMS) / columnCount) || 1;
    const gridMaxHeight = visibleRows * rowHeight + Math.max(visibleRows - 1, 0) * 14;

    return (
        <SectionCard T={T} style={{ padding: isCompact ? 18 : 22 }}>
            <div style={{
                display: "flex",
                alignItems: isCompact ? "flex-start" : "center",
                justifyContent: "space-between",
                marginBottom: 10,
                gap: 12,
                flexWrap: "wrap",
            }}>
                <div>
                    <div style={{
                        fontSize: 15,
                        fontWeight: 700,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        color: T.subtext,
                        fontFamily: "IBM Plex Mono, monospace",
                    }}>Market Pulse</div>
                    <div style={{
                        fontSize: isCompact ? 18 : 22,
                        fontWeight: 700,
                        color: T.text,
                        marginTop: 6,
                        letterSpacing: "-0.04em",
                    }}>
                    </div>
                </div>
                <span style={{
                    fontSize: 13,
                    color: T.muted,
                    padding: "8px 12px",
                    borderRadius: 999,
                    background: T.pillBg,
                    border: `1px solid ${T.pillBorder}`,
                    fontFamily: "IBM Plex Mono, monospace",
                }}>1D returns with 15-session trend</span>
            </div>

            <div style={{
                display: "flex",
                gap: 8,
                marginBottom: 16,
                padding: "6px",
                background: T.softFill,
                borderRadius: 999,
                flexWrap: "wrap",
                border: `1px solid ${T.panelBorder}`,
            }}>
                <TabButton T={T} active={activeIndexTab === "core"} label="Core Indices" count={coreIndices.length} onClick={() => setActiveIndexTab("core")} />
                <TabButton T={T} active={activeIndexTab === "sectoral"} label="Sectoral Indices" count={sectoralIndices.length} onClick={() => setActiveIndexTab("sectoral")} />
            </div>

            {loading ? (
                <div style={{ display: "grid", gridTemplateColumns: isCompact ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 14, marginTop: 8 }}>
                    {[...Array(isCompact ? 4 : 6)].map((_, i) => (
                        <Skeleton key={i} T={T} h={88} style={{ borderRadius: 18 }} />
                    ))}
                </div>
            ) : visibleMeta.length === 0 ? (
                <div style={{ padding: "24px 0", textAlign: "center", color: T.muted, fontSize: 15 }}>
                    No index data available
                </div>
            ) : (
                <div style={{
                    border: `1px solid ${T.panelBorder}`,
                    borderRadius: 22,
                    background: T.pillBg,
                    padding: 16,
                }}>
                    <div style={{
                        display: "grid",
                        gridTemplateColumns: isCompact ? "1fr" : "repeat(2, minmax(0, 1fr))",
                        gap: 14,
                        maxHeight: activeIndices.length > DEFAULT_VISIBLE_ITEMS ? gridMaxHeight : "none",
                        overflowY: activeIndices.length > DEFAULT_VISIBLE_ITEMS ? "auto" : "visible",
                        paddingRight: activeIndices.length > DEFAULT_VISIBLE_ITEMS ? 4 : 0,
                    }}>
                        {activeIndices.map(idx => (
                            <div key={idx.key} style={{
                                border: `1px solid ${T.panelBorder}`,
                                borderRadius: 18,
                                background: withAlpha(T.surface, T.isDark ? 0.72 : 0.82),
                                padding: "0 16px",
                                minWidth: 0,
                            }}>
                                <IndexCard
                                    T={T}
                                    label={idx.label}
                                    value={latest[idx.key]}
                                    changePct={changePct(idx.key)}
                                    sparkData={sparkFor(idx.key)}
                                    compact={isCompact}
                                />
                            </div>
                        ))}
                    </div>
                    {activeIndices.length > DEFAULT_VISIBLE_ITEMS && (
                        <div style={{
                            marginTop: 12,
                            fontSize: 12,
                            color: T.muted,
                            fontFamily: "IBM Plex Mono, monospace",
                        }}>
                            Showing 6 at a time. Scroll to view the remaining indices.
                        </div>
                    )}
                    {!activeIndices.length && (
                        <div style={{ padding: "20px 4px 4px", textAlign: "center", color: T.muted, fontSize: 13 }}>
                            No indices available in this group
                        </div>
                    )}
                </div>
            )}
        </SectionCard>
    );
}
function Skeleton({ T, h = 16, w = "100%", style = {} }) {
    return (
        <div style={{
            height: h, width: w, borderRadius: 14,
            background: T.skeletonBase || T.softFill || T.mutedFill || "#eef2f7",
            animation: "sdPulse 1.5s ease-in-out infinite",
            ...style,
        }} />
    );
}

function SortIcon({ dir }) {
    return (
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none"
            style={{ marginLeft: 3, opacity: dir ? 1 : 0.25, flexShrink: 0 }}>
            <path d="M5 1L9 6H1L5 1Z"
                fill={dir === "asc"  ? "currentColor" : "none"}
                stroke="currentColor" strokeWidth="1.2" />
            <path d="M5 9L1 4H9L5 9Z"
                fill={dir === "desc" ? "currentColor" : "none"}
                stroke="currentColor" strokeWidth="1.2" />
        </svg>
    );
}

function CardHeader({ T, title, count, right, style = {} }) {
    return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 10, flexWrap: "wrap", ...style }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0, flex: 1 }}>
                <span style={{
                    fontSize: 14, fontWeight: 700, letterSpacing: "0.14em",
                    textTransform: "uppercase", color: T.subtext, fontFamily: "IBM Plex Mono, monospace",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%",
                }}>{title}</span>
                {typeof count === "number" && (
                    <span style={{
                        fontSize: 10, fontWeight: 700, color: T.muted,
                        padding: "5px 8px", borderRadius: 999,
                        background: T.pillBg,
                        border: `1px solid ${T.pillBorder}`,
                        fontFamily: "IBM Plex Mono, monospace",
                    }}>{count}</span>
                )}
            </div>
            {right}
        </div>
    );
}

function TabButton({ T, active, label, count, onClick, hideCount }) {
    return (
        <button onClick={onClick} style={{
            flex: "1 1 auto",
            padding: "8px 10px",
            fontSize: 14,
            fontWeight: active ? 700 : 600,
            color: active ? T.text : T.muted,
            background: active ? T.pillBg : "transparent",
            border: `1px solid ${active ? T.ring : "transparent"}`,
            borderRadius: 999,
            cursor: "pointer",
            transition: "all 0.18s ease",
            fontFamily: "inherit",
            whiteSpace: "nowrap",
            boxShadow: active ? T.shadowMd : "none",
        }}>
            {label}{!hideCount && <span style={{ color: active ? T.text : T.muted, opacity: 0.75, marginLeft: 4 }}>({count})</span>}
        </button>
    );
}

// â”€â”€â”€ INDUSTRY SUMMARY TABLE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function RsIndustrySummaryTable({ T, data, loading, onIndustryClick, isCompact }) {
    if (loading) {
        return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[...Array(6)].map((_, i) => <Skeleton key={i} T={T} h={56} />)}
            </div>
        );
    }

    if (!data.length) {
        return (
            <div style={{
                padding: "40px 20px",
                textAlign: "center",
                color: T.muted,
                fontSize: 15,
            }}>
                No industries with RS &gt; 85 stocks
            </div>
        );
    }

    if (isCompact) {
        return (
            <div style={{
                display: "grid",
                gap: 12,
                maxHeight: data.length > DEFAULT_VISIBLE_ITEMS ? DEFAULT_VISIBLE_ITEMS * 108 : "none",
                overflowY: data.length > DEFAULT_VISIBLE_ITEMS ? "auto" : "visible",
                paddingRight: data.length > DEFAULT_VISIBLE_ITEMS ? 4 : 0,
            }}>
                {data.map(row => {
                    const pct = row.pct || 0;
                    const color = pct >= 60 ? "#22c55e" : pct >= 35 ? "#f59e0b" : "#ef4444";
                    return (
                        <button
                            key={row.industry}
                            onClick={() => onIndustryClick(row.industry)}
                            style={{
                                textAlign: "left",
                                padding: 16,
                                borderRadius: 18,
                                border: `1px solid ${T.panelBorder}`,
                                background: T.pillBg,
                                color: T.text,
                                cursor: "pointer",
                            }}
                        >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                                <div style={{ fontWeight: 700, lineHeight: 1.4 }}>{row.industry}</div>
                                <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 14, color }}>{pct.toFixed(1)}%</div>
                            </div>
                            <div style={{
                                height: 8,
                                borderRadius: 999,
                                background: T.softFill,
                                overflow: "hidden",
                                marginBottom: 8,
                            }}>
                                <div style={{
                                    width: `${Math.min(pct, 100)}%`,
                                    height: "100%",
                                    borderRadius: 999,
                                    background: color,
                                }} />
                            </div>
                            <div style={{ color: T.muted, fontSize: 14, fontFamily: "IBM Plex Mono, monospace" }}>
                                {row.count}/{row.total} stocks above RS 85
                            </div>
                        </button>
                    );
                })}
            </div>
        );
    }

    return (
        <div style={{ 
            overflowX: "auto",
            overflowY: data.length > DEFAULT_VISIBLE_ITEMS ? "auto" : "visible",
            maxHeight: data.length > DEFAULT_VISIBLE_ITEMS ? DEFAULT_TABLE_MAX_HEIGHT : "none",
            borderRadius: 20,
            border: `1px solid ${T.panelBorder}`,
            background: T.pillBg,
        }}>
            <table style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: isCompact ? 12 : 13,
            minWidth: 620,
            }}>
            <thead>
            <tr style={{ 
            background: T.tableHeadBg,
            borderBottom: `1px solid ${T.panelBorder}`,
            }}>
            <th style={{
            padding: "12px 14px",
            textAlign: "left",
            fontWeight: 600,
            fontSize: isCompact ? 11 : 12,
            color: T.subtext,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            }}>Industry</th>
            <th style={{
            padding: "12px 14px",
            textAlign: "right",
            fontWeight: 600,
            fontSize: isCompact ? 11 : 12,
            color: T.subtext,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            width: 220,
            }}>% Above RS 85</th>
            </tr>
            </thead>                <tbody>
                    {data.map((row, i) => {
                        const pct   = row.pct   || 0;
                        const color = pct >= 60 ? "#22c55e" : pct >= 35 ? "#f59e0b" : "#ef4444";
                        return (
                        <tr
                            key={row.industry}
                            onClick={() => onIndustryClick(row.industry)}
                            style={{
                                borderBottom: i < data.length - 1 ? `1px solid ${T.border}` : "none",
                                cursor: "pointer",
                                transition: "background 0.1s ease",
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = T.hoverBg || "rgba(241, 245, 249, 0.4)"}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        >
                            <td style={{
                                padding: "12px 14px",
                                color: T.text,
                                fontWeight: 500,
                            }}>{row.industry}</td>
                            <td style={{ padding: "12px 14px", textAlign: "right" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end" }}>
                                    {/* progress bar */}
                                    <div style={{
                                        width: 100, height: 6, borderRadius: 3,
                                        background: T.mutedFill || "rgba(100,116,139,0.12)",
                                        overflow: "hidden", flexShrink: 0,
                                    }}>
                                        <div style={{
                                            width: `${Math.min(pct, 100)}%`,
                                            height: "100%",
                                            borderRadius: 3,
                                            background: color,
                                            transition: "width 0.4s ease",
                                        }} />
                                    </div>
                                    {/* pct label */}
                                    <span style={{
                                        fontFamily: "monospace", fontWeight: 700,
                                        fontSize: 14, color, minWidth: 42, textAlign: "right",
                                    }}>{pct.toFixed(1)}%</span>
                                    {/* count / total */}
                                    <span style={{
                                        fontFamily: "monospace", fontSize: 13,
                                        color: T.muted, minWidth: 52, textAlign: "right",
                                    }}>({row.count}/{row.total})</span>
                                </div>
                            </td>
                        </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function RsTable({ T, data, loading, onTickerClick, isCompact }) {
    const [sortKey, setSortKey] = useState("rs_rating");
    const [sortDir, setSortDir] = useState("desc");

    const handleSort = key => {
        if (sortKey === key) {
            setSortDir(prev => prev === "asc" ? "desc" : "asc");
        } else {
            setSortKey(key);
            setSortDir(key === "rs_rating" ? "desc" : "asc");
        }
    };

    const sorted = useMemo(() => {
        if (!data.length) return [];
        return [...data].sort((a, b) => {
            const aVal = a[sortKey];
            const bVal = b[sortKey];
            const cmp = typeof aVal === "number" && typeof bVal === "number"
                ? aVal - bVal
                : String(aVal || "").localeCompare(String(bVal || ""));
            return sortDir === "asc" ? cmp : -cmp;
        });
    }, [data, sortKey, sortDir]);

    if (loading) {
        return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[...Array(8)].map((_, i) => <Skeleton key={i} T={T} h={56} />)}
            </div>
        );
    }

    if (!data.length) {
        return (
            <div style={{
                padding: "40px 20px",
                textAlign: "center",
                color: T.muted,
                fontSize: 15,
            }}>
                No stocks with RS &gt; 85 in this industry
            </div>
        );
    }

    const Th = ({ k, label }) => (
        <th
            onClick={() => handleSort(k)}
            style={{
                padding: "12px 14px",
                textAlign: k === "ticker" ? "left" : "right",
                fontWeight: 600,
                fontSize: isCompact ? 11 : 12,
                color: T.subtext,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                cursor: "pointer",
                userSelect: "none",
                position: "relative",
            }}
        >
            <div style={{ display: "flex", alignItems: "center", justifyContent: k === "ticker" ? "flex-start" : "flex-end" }}>
                {label}
                <SortIcon dir={sortKey === k ? sortDir : null} />
            </div>
        </th>
    );

    if (isCompact) {
        return (
            <div style={{
                display: "grid",
                gap: 12,
                maxHeight: sorted.length > DEFAULT_VISIBLE_ITEMS ? DEFAULT_VISIBLE_ITEMS * 88 : "none",
                overflowY: sorted.length > DEFAULT_VISIBLE_ITEMS ? "auto" : "visible",
                paddingRight: sorted.length > DEFAULT_VISIBLE_ITEMS ? 4 : 0,
            }}>
                {sorted.map(row => (
                    <button
                        key={row.ticker}
                        onClick={() => onTickerClick?.(row.ticker)}
                        style={{
                            textAlign: "left",
                            padding: 16,
                            borderRadius: 18,
                            border: `1px solid ${T.panelBorder}`,
                            background: T.pillBg,
                            color: T.text,
                            cursor: onTickerClick ? "pointer" : "default",
                        }}
                    >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                            <div>
                                <div style={{ fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, fontSize: 15 }}>{row.ticker}</div>
                                <div style={{ display: "flex", gap: 8, marginTop: 6, fontSize: 11, fontFamily: "monospace" }}>
                                    <span style={{ color: row.ret_3m != null ? (row.ret_3m >= 0 ? T.pos : T.neg) : T.muted }}>
                                        3M: {row.ret_3m != null ? fmtPct(row.ret_3m) : EMPTY_VALUE}
                                    </span>
                                    <span style={{ color: row.ret_6m != null ? (row.ret_6m >= 0 ? T.pos : T.neg) : T.muted }}>
                                        6M: {row.ret_6m != null ? fmtPct(row.ret_6m) : EMPTY_VALUE}
                                    </span>
                                    <span style={{ color: row.ret_12m != null ? (row.ret_12m >= 0 ? T.pos : T.neg) : T.muted }}>
                                        12M: {row.ret_12m != null ? fmtPct(row.ret_12m) : EMPTY_VALUE}
                                    </span>
                                </div>
                            </div>
                            <div style={{
                                padding: "7px 10px",
                                borderRadius: 999,
                                background: T.posSoft,
                                color: T.text,
                                fontFamily: "IBM Plex Mono, monospace",
                                fontWeight: 700,
                                fontSize: 14,
                            }}>
                                RS {row.rs_rating != null ? row.rs_rating : EMPTY_VALUE}
                            </div>
                        </div>
                    </button>
                ))}
            </div>
        );
    }

    return (
        <div style={{ 
            overflowX: "auto",
            overflowY: sorted.length > DEFAULT_VISIBLE_ITEMS ? "auto" : "visible",
            maxHeight: sorted.length > DEFAULT_VISIBLE_ITEMS ? DEFAULT_TABLE_MAX_HEIGHT : "none",
            borderRadius: 20,
            border: `1px solid ${T.panelBorder}`,
            background: T.pillBg,
        }}>
            <table style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: isCompact ? 12 : 13,
                minWidth: 620,
            }}>
                <thead>
                    <tr style={{ 
                        background: T.tableHeadBg,
                        borderBottom: `1px solid ${T.panelBorder}`,
                    }}>
                        <Th k="ticker" label="Ticker" />
                        <Th k="rs_rating" label="RS Rating" />
                        <Th k="ret_3m" label="3M Returns" />
                        <Th k="ret_6m" label="6M Returns" />
                        <Th k="ret_12m" label="12M Returns" />
                    </tr>
                </thead>
                <tbody>
                    {sorted.map((row, i) => (
                        <tr
                            key={row.ticker}
                            onClick={() => onTickerClick?.(row.ticker)}
                            style={{
                                borderBottom: i < sorted.length - 1 ? `1px solid ${T.border}` : "none",
                                cursor: onTickerClick ? "pointer" : "default",
                                transition: "background 0.1s ease",
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = T.hoverBg || "rgba(241, 245, 249, 0.4)"}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        >
                            <td style={{
                                padding: "12px 14px",
                                color: T.text,
                                fontWeight: 600,
                                fontFamily: "monospace",
                            }}>{row.ticker}</td>
                            <td style={{
                                padding: "12px 14px",
                                textAlign: "right",
                                color: T.text,
                                fontWeight: 600,
                                fontFamily: "monospace",
                            }}>{row.rs_rating != null ? row.rs_rating : EMPTY_VALUE}</td>
                            <td style={{
                                padding: "12px 14px",
                                textAlign: "right",
                                color: row.ret_3m != null ? (row.ret_3m >= 0 ? T.pos : T.neg) : T.text,
                                fontWeight: 600,
                                fontFamily: "monospace",
                            }}>{row.ret_3m != null ? fmtPct(row.ret_3m) : EMPTY_VALUE}</td>
                            <td style={{
                                padding: "12px 14px",
                                textAlign: "right",
                                color: row.ret_6m != null ? (row.ret_6m >= 0 ? T.pos : T.neg) : T.text,
                                fontWeight: 600,
                                fontFamily: "monospace",
                            }}>{row.ret_6m != null ? fmtPct(row.ret_6m) : EMPTY_VALUE}</td>
                            <td style={{
                                padding: "12px 14px",
                                textAlign: "right",
                                color: row.ret_12m != null ? (row.ret_12m >= 0 ? T.pos : T.neg) : T.text,
                                fontWeight: 600,
                                fontFamily: "monospace",
                            }}>{row.ret_12m != null ? fmtPct(row.ret_12m) : EMPTY_VALUE}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}


// --- ALL RS TABLE (Top 50 stocks by RS Rating from indicators) ---
function AllRsTable({ T, data, loading, onTickerClick, isCompact }) {
    const [sortKey, setSortKey] = useState("rs_rating");
    const [sortDir, setSortDir] = useState("desc");

    const handleSort = key => {
        if (sortKey === key) {
            setSortDir(prev => prev === "asc" ? "desc" : "asc");
        } else {
            setSortKey(key);
            setSortDir(key === "rs_rating" ? "desc" : "asc");
        }
    };

    const sorted = useMemo(() => {
        if (!data.length) return [];
        return [...data].sort((a, b) => {
            const aVal = a[sortKey];
            const bVal = b[sortKey];
            const cmp = typeof aVal === "number" && typeof bVal === "number"
                ? aVal - bVal
                : String(aVal || "").localeCompare(String(bVal || ""));
            return sortDir === "asc" ? cmp : -cmp;
        });
    }, [data, sortKey, sortDir]);

    if (loading) {
        return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[...Array(8)].map((_, i) => <Skeleton key={i} T={T} h={56} />)}
            </div>
        );
    }

    if (!data.length) {
        return (
            <div style={{ padding: "40px 20px", textAlign: "center", color: T.muted, fontSize: 15 }}>
                No data available
            </div>
        );
    }

    const capColor = (cap) => {
        if (!cap) return T.muted;
        const c = String(cap).toLowerCase();
        if (c === "large") return T.accent || "#2563eb";
        if (c === "mid")   return "#f59e0b";
        if (c === "small") return T.pos || "#10b981";
        return T.muted;
    };

    const Th = ({ k, label }) => (
        <th
            onClick={() => handleSort(k)}
            style={{
                padding: "12px 14px",
                textAlign: k === "ticker" || k === "cap_category" ? "left" : "right",
                fontWeight: 600, fontSize: isCompact ? 11 : 12, color: T.subtext,
                textTransform: "uppercase", letterSpacing: "0.05em",
                cursor: "pointer", userSelect: "none",
            }}
        >
            <div style={{ display: "flex", alignItems: "center", justifyContent: (k === "ticker" || k === "cap_category") ? "flex-start" : "flex-end" }}>
                {label}
                <SortIcon dir={sortKey === k ? sortDir : null} />
            </div>
        </th>
    );

    if (isCompact) {
        return (
            <div style={{
                display: "grid", gap: 12,
                maxHeight: sorted.length > DEFAULT_VISIBLE_ITEMS ? DEFAULT_VISIBLE_ITEMS * 88 : "none",
                overflowY: sorted.length > DEFAULT_VISIBLE_ITEMS ? "auto" : "visible",
                paddingRight: sorted.length > DEFAULT_VISIBLE_ITEMS ? 4 : 0,
            }}>
                {sorted.map((row, i) => (
                    <button
                        key={row.ticker}
                        onClick={() => onTickerClick?.(row.ticker)}
                        style={{
                            textAlign: "left", padding: 16, borderRadius: 18,
                            border: `1px solid ${T.panelBorder}`, background: T.pillBg,
                            color: T.text, cursor: onTickerClick ? "pointer" : "default",
                        }}
                    >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                            <div>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ color: T.muted, fontSize: 13, fontFamily: "monospace" }}>#{i + 1}</span>
                                    <span style={{ fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, fontSize: 14 }}>{row.ticker}</span>
                                    {row.cap_category && (
                                        <span style={{
                                            fontSize: 12, fontWeight: 600, padding: "2px 7px", borderRadius: 999,
                                            background: withAlpha(capColor(row.cap_category), 0.12),
                                            color: capColor(row.cap_category), textTransform: "capitalize",
                                        }}>{row.cap_category}</span>
                                    )}
                                </div>
                                <div style={{ display: "flex", gap: 8, marginTop: 6, fontSize: 13, fontFamily: "monospace" }}>
                                    <span style={{ color: row.ret_3m != null ? (row.ret_3m >= 0 ? T.pos : T.neg) : T.muted }}>3M: {row.ret_3m != null ? fmtPct(row.ret_3m) : EMPTY_VALUE}</span>
                                    <span style={{ color: row.ret_6m != null ? (row.ret_6m >= 0 ? T.pos : T.neg) : T.muted }}>6M: {row.ret_6m != null ? fmtPct(row.ret_6m) : EMPTY_VALUE}</span>
                                    <span style={{ color: row.ret_12m != null ? (row.ret_12m >= 0 ? T.pos : T.neg) : T.muted }}>12M: {row.ret_12m != null ? fmtPct(row.ret_12m) : EMPTY_VALUE}</span>
                                </div>
                            </div>
                            <div style={{ padding: "7px 10px", borderRadius: 999, background: T.posSoft, color: T.text, fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, fontSize: 14 }}>
                                RS {row.rs_rating != null ? row.rs_rating : EMPTY_VALUE}
                            </div>
                        </div>
                    </button>
                ))}
            </div>
        );
    }

    return (
        <div style={{
            overflowX: "auto",
            overflowY: sorted.length > DEFAULT_VISIBLE_ITEMS ? "auto" : "visible",
            maxHeight: sorted.length > DEFAULT_VISIBLE_ITEMS ? DEFAULT_TABLE_MAX_HEIGHT : "none",
            borderRadius: 20, border: `1px solid ${T.panelBorder}`, background: T.pillBg,
        }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: isCompact ? 12 : 13, minWidth: 680 }}>
                <thead>
                    <tr style={{ background: T.tableHeadBg, borderBottom: `1px solid ${T.panelBorder}` }}>
                        <th style={{ padding: "12px 14px", textAlign: "left", fontWeight: 600, fontSize: isCompact ? 11 : 12, color: T.subtext, textTransform: "uppercase", letterSpacing: "0.05em", width: 42 }}>#</th>
                        <Th k="ticker"       label="Ticker" />
                        <Th k="rs_rating"    label="RS Rating" />
                        <Th k="ret_3m"       label="3M Returns" />
                        <Th k="ret_6m"       label="6M Returns" />
                        <Th k="ret_12m"      label="12M Returns" />
                    </tr>
                </thead>
                <tbody>
                    {sorted.map((row, i) => (
                        <tr
                            key={row.ticker}
                            onClick={() => onTickerClick?.(row.ticker)}
                            style={{ borderBottom: i < sorted.length - 1 ? `1px solid ${T.border}` : "none", cursor: onTickerClick ? "pointer" : "default", transition: "background 0.1s ease" }}
                            onMouseEnter={e => e.currentTarget.style.background = T.hoverBg || "rgba(241,245,249,0.4)"}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        >
                            <td style={{ padding: "12px 14px", color: T.muted, fontFamily: "monospace", fontSize: 13 }}>{i + 1}</td>
                            <td style={{ padding: "12px 14px", color: T.text, fontWeight: 600, fontFamily: "monospace" }}>{row.ticker}</td>
                            {/*<td style={{ padding: "12px 14px" }}>*/}
                            {/*    {row.cap_category ? (*/}
                            {/*        <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 999, background: withAlpha(capColor(row.cap_category), 0.12), color: capColor(row.cap_category), textTransform: "capitalize" }}>{row.cap_category}</span>*/}
                            {/*    ) : <span style={{ color: T.muted }}>-</span>}*/}
                            {/*</td>*/}
                            <td style={{ padding: "12px 14px", textAlign: "right", color: T.text, fontWeight: 700, fontFamily: "monospace" }}>{row.rs_rating != null ? row.rs_rating : EMPTY_VALUE}</td>
                            <td style={{ padding: "12px 14px", textAlign: "right", color: row.ret_3m != null ? (row.ret_3m >= 0 ? T.pos : T.neg) : T.text, fontWeight: 600, fontFamily: "monospace" }}>{row.ret_3m != null ? fmtPct(row.ret_3m) : EMPTY_VALUE}</td>
                            <td style={{ padding: "12px 14px", textAlign: "right", color: row.ret_6m != null ? (row.ret_6m >= 0 ? T.pos : T.neg) : T.text, fontWeight: 600, fontFamily: "monospace" }}>{row.ret_6m != null ? fmtPct(row.ret_6m) : EMPTY_VALUE}</td>
                            <td style={{ padding: "12px 14px", textAlign: "right", color: row.ret_12m != null ? (row.ret_12m >= 0 ? T.pos : T.neg) : T.text, fontWeight: 600, fontFamily: "monospace" }}>{row.ret_12m != null ? fmtPct(row.ret_12m) : EMPTY_VALUE}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// â”€â”€â”€ MOVERS TABLE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function MoversTable({ T, data, loading, type, isCompact }) {
    const [sortKey, setSortKey] = useState(() => {
        if (type === "gainers" || type === "losers") return "change_pct";
        if (type === "near_high" || type === "near_low") return "dist_pct";
        return "change_pct";
    });
    const [sortDir, setSortDir] = useState(() => {
        if (type === "losers") return "asc";
        return "desc";
    });

    useEffect(() => {
        if (type === "gainers" || type === "losers") {
            setSortKey("change_pct");
            setSortDir(type === "losers" ? "asc" : "desc");
        } else {
            setSortKey("dist_pct");
            setSortDir(type === "near_low" ? "asc" : "desc");
        }
    }, [type]);

    const handleSort = key => {
        if (sortKey === key) {
            setSortDir(prev => prev === "asc" ? "desc" : "asc");
        } else {
            setSortKey(key);
            setSortDir("desc");
        }
    };

    const sorted = useMemo(() => {
        if (!data.length) return [];
        return [...data].sort((a, b) => {
            const aVal = a[sortKey];
            const bVal = b[sortKey];
            const cmp = typeof aVal === "number" && typeof bVal === "number"
                ? aVal - bVal
                : String(aVal || "").localeCompare(String(bVal || ""));
            return sortDir === "asc" ? cmp : -cmp;
        });
    }, [data, sortKey, sortDir]);

    if (loading) {
        return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[...Array(8)].map((_, i) => <Skeleton key={i} T={T} h={56} />)}
            </div>
        );
    }

    if (!data.length) {
        return (
            <div style={{
                padding: "40px 20px",
                textAlign: "center",
                color: T.muted,
                fontSize: 15,
            }}>
                No data available
            </div>
        );
    }

    const Th = ({ k, label }) => (
        <th
            onClick={() => handleSort(k)}
            style={{
                padding: "12px 14px",
                textAlign: k === "ticker" || k === "name" ? "left" : "right",
                fontWeight: 600,
                fontSize: isCompact ? 11 : 12,
                color: T.subtext,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                cursor: "pointer",
                userSelect: "none",
            }}
        >
            <div style={{ display: "flex", alignItems: "center", justifyContent: k === "ticker" || k === "name" ? "flex-start" : "flex-end" }}>
                {label}
                <SortIcon dir={sortKey === k ? sortDir : null} />
            </div>
        </th>
    );

    const showDist = type === "near_high" || type === "near_low";

    if (isCompact) {
        return (
            <div style={{
                display: "grid",
                gap: 12,
                maxHeight: sorted.length > DEFAULT_VISIBLE_ITEMS ? DEFAULT_VISIBLE_ITEMS * 120 : "none",
                overflowY: sorted.length > DEFAULT_VISIBLE_ITEMS ? "auto" : "visible",
                paddingRight: sorted.length > DEFAULT_VISIBLE_ITEMS ? 4 : 0,
            }}>
                {sorted.map(row => {
                    const chg = row.change_pct;
                    const isPos = chg != null && chg > 0;
                    const isNeg = chg != null && chg < 0;
                    const tone = isPos ? (T.pos || "#10b981") : isNeg ? (T.neg || "#ef4444") : T.text;
                    const toneBg = isPos ? T.posSoft : isNeg ? T.negSoft : T.softFill;
                    return (
                        <div
                            key={row.ticker}
                            style={{
                                padding: 16,
                                borderRadius: 18,
                                border: `1px solid ${T.panelBorder}`,
                                background: T.pillBg,
                            }}
                        >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                                <div style={{ fontFamily: "IBM Plex Mono, monospace", fontWeight: 700, fontSize: 15, color: T.text }}>{row.ticker}</div>
                                <div style={{
                                    padding: "7px 10px",
                                    borderRadius: 999,
                                    background: toneBg,
                                    color: tone,
                                    fontFamily: "IBM Plex Mono, monospace",
                                    fontWeight: 700,
                                    fontSize: 14,
                                }}>
                                    {fmtPct(chg)}
                                </div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginTop: 14 }}>
                                <div>
                                    <div style={{ color: T.muted, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}>LTP</div>
                                    <div style={{ marginTop: 4, color: T.text, fontFamily: "IBM Plex Mono, monospace" }}>{fmt(row.ltp)}</div>
                                </div>
                                {showDist && (
                                    <div>
                                        <div style={{ color: T.muted, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                                            {type === "near_high" ? "From 52W High" : "From 52W Low"}
                                        </div>
                                        <div style={{ marginTop: 4, color: T.text, fontFamily: "IBM Plex Mono, monospace" }}>
                                            {row.dist_pct != null ? `${fmt(row.dist_pct, 1)}%` : EMPTY_VALUE}
                                        </div>
                                    </div>
                                )}
                                <div>
                                    <div style={{ color: T.muted, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}>Volume</div>
                                    <div style={{ marginTop: 4, color: T.text, fontFamily: "IBM Plex Mono, monospace" }}>{fmtVol(row.volume)}</div>
                                </div>
                                <div>
                                    <div style={{ color: T.muted, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}>Rel Vol</div>
                                    <div style={{
                                        marginTop: 4,
                                        fontFamily: "IBM Plex Mono, monospace",
                                        fontWeight: 600,
                                        color: row.rel_volume == null ? T.muted
                                            : row.rel_volume >= 2 ? (T.pos || "#10b981")
                                            : row.rel_volume >= 1.5 ? "#f59e0b"
                                            : T.text,
                                    }}>
                                        {row.rel_volume != null ? `${row.rel_volume.toFixed(2)}x` : EMPTY_VALUE}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    }

    return (
        <div style={{ 
            overflowX: "auto",
            overflowY: sorted.length > DEFAULT_VISIBLE_ITEMS ? "auto" : "visible",
            maxHeight: sorted.length > DEFAULT_VISIBLE_ITEMS ? DEFAULT_TABLE_MAX_HEIGHT : "none",
            borderRadius: 20,
            border: `1px solid ${T.panelBorder}`,
            background: T.pillBg,
        }}>
            <table style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: isCompact ? 12 : 13,
                minWidth: showDist ? 860 : 720,
            }}>
                <thead>
                    <tr style={{ 
                        background: T.tableHeadBg,
                        borderBottom: `1px solid ${T.panelBorder}`,
                    }}>
                        <Th k="ticker" label="Ticker" />
                        <Th k="ltp" label="LTP" />
                        <Th k="change_pct" label="Chg %" />
                        {showDist && <Th k="dist_pct" label={type === "near_high" ? "% from 52W High" : "% from 52W Low"} />}
                        <Th k="volume" label="Volume" />
                        <Th k="rel_volume" label="Rel Vol" />
                    </tr>
                </thead>
                <tbody>
                    {sorted.map((row, i) => {
                        const chg = row.change_pct;
                        const isPos = chg != null && chg > 0;
                        const isNeg = chg != null && chg < 0;

                        return (
                            <tr
                                key={row.ticker}
                                style={{
                                    borderBottom: i < sorted.length - 1 ? `1px solid ${T.border}` : "none",
                                }}
                            >
                                <td style={{
                                    padding: "12px 14px",
                                    color: T.text,
                                    fontWeight: 600,
                                    fontFamily: "monospace",
                                }}>{row.ticker}</td>
                                <td style={{
                                    padding: "12px 14px",
                                    textAlign: "right",
                                    color: T.text,
                                    fontFamily: "monospace",
                                }}>{fmt(row.ltp)}</td>
                                <td style={{
                                    padding: "12px 14px",
                                    textAlign: "right",
                                    color: isPos ? T.pos : isNeg ? T.neg : T.text,
                                    fontWeight: 600,
                                    fontFamily: "monospace",
                                }}>{fmtPct(chg)}</td>
                                {showDist && (
                                    <td style={{
                                        padding: "12px 14px",
                                        textAlign: "right",
                                        color: T.text,
                                        fontFamily: "monospace",
                                    }}>{row.dist_pct != null ? `${fmt(row.dist_pct, 1)}%` : EMPTY_VALUE}</td>
                                )}
                                <td style={{
                                    padding: "12px 14px",
                                    textAlign: "right",
                                    color: T.muted,
                                    fontFamily: "monospace",
                                }}>{fmtVol(row.volume)}</td>
                                <td style={{
                                    padding: "12px 14px",
                                    textAlign: "right",
                                    fontFamily: "monospace",
                                    fontWeight: 600,
                                    color: row.rel_volume == null ? T.muted
                                        : row.rel_volume >= 2 ? (T.pos || "#10b981")
                                        : row.rel_volume >= 1.5 ? "#f59e0b"
                                        : T.text,
                                }}>
                                    {row.rel_volume != null ? `${row.rel_volume.toFixed(2)}x` : EMPTY_VALUE}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}


// ─── RS LOGIN GATE ────────────────────────────────────────────────────────────
function RsLoginGate({ T, isLocked, onLogin, children }) {
    if (isLocked) {
        return (
            <div style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "48px 24px 40px",
                    gap: 16,
                    minHeight: 280,
                }}>
                    <div style={{
                        width: 96,
                        height: 96,
                        borderRadius: "50%",
                        background: withAlpha(T.accent || "#2563eb", 0.10),
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: 4,
                    }}>
                        <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
                            <rect x="3" y="3" width="18" height="18" rx="3" stroke={T.accent || "#2563eb"} strokeWidth="1.8" fill={withAlpha(T.accent || "#2563eb", 0.12)} />
                            <line x1="3" y1="9" x2="21" y2="9" stroke={T.accent || "#2563eb"} strokeWidth="1.6" />
                            <line x1="9" y1="9" x2="9" y2="21" stroke={T.accent || "#2563eb"} strokeWidth="1.6" />
                            <circle cx="17" cy="17" r="4" fill={T.accent || "#2563eb"} />
                            <line x1="15.6" y1="17" x2="18.4" y2="17" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
                            <line x1="17" y1="15.6" x2="17" y2="18.4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                    </div>
                    <div style={{ textAlign: "center", maxWidth: 280 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 8 }}>
                            Login to access RS Table
                        </div>
                        <div style={{ fontSize: 14, color: T.muted, lineHeight: 1.6 }}>
                            Login to view, filter, and analyse RS ratings across all sectors and industries.
                        </div>
                    </div>
                    <button
                        onClick={() => onLogin && onLogin()}
                        style={{
                            marginTop: 4,
                            padding: "11px 32px",
                            borderRadius: 999,
                            background: T.accent || "#2563eb",
                            color: "#fff",
                            border: "none",
                            fontSize: 15,
                            fontWeight: 700,
                            cursor: "pointer",
                            fontFamily: "inherit",
                            letterSpacing: "0.02em",
                            boxShadow: `0 4px 16px ${withAlpha(T.accent || "#2563eb", 0.28)}`,
                            transition: "opacity 0.15s ease",
                        }}
                        onMouseEnter={e => e.currentTarget.style.opacity = "0.88"}
                        onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                    >
                        Login
                    </button>
                </div>
        );
    }
    return children;
}


// ─── PURE DATA HELPERS  (used both in useState initialisers and useEffect) ────
// Kept outside the component so they're stable references and can be called
// synchronously during the lazy-init phase of useState.

/** Build the four mover lists from raw market_movers + stock_52w rows. */
function deriveMovers(moversData, stock52wRows) {
    const volMa20Map = new Map((stock52wRows || []).map(r => [r.ticker, Number(r.volume_ma20) || null]));
    const enriched = (moversData || []).map(p => {
        const vol = p.volume != null ? Number(p.volume) : null;
        const ma20 = volMa20Map.get(p.symbol) || null;
        const rel_volume = vol != null && ma20 != null && ma20 > 0 ? vol / ma20 : null;
        return {
            ticker:      p.symbol,
            name:        null,
            ltp:         Number(p.ltp)     || 0,
            volume:      p.volume,
            rel_volume,
            change_pct:  Number(p.pchange) ?? null,
            dist_high:   Number(p.pct_from_high) ?? null,
            dist_low:    Number(p.pct_from_low)  ?? null,
            dist_pct:    Number(p.pct_from_high) ?? null,
            rank_gainer: p.rank_gainer,
            rank_loser:  p.rank_loser,
            near_high:   p.near_high,
            near_low:    p.near_low,
        };
    });
    return {
        gainers: enriched.filter(r => r.rank_gainer != null).sort((a, b) => (a.rank_gainer || 9999) - (b.rank_gainer || 9999)).slice(0, 20),
        losers:  enriched.filter(r => r.rank_loser  != null).sort((a, b) => (a.rank_loser  || 9999) - (b.rank_loser  || 9999)).slice(0, 20),
        nearHigh: enriched.filter(r => r.near_high === true).map(r => ({ ...r, dist_pct: r.dist_high })).sort((a, b) => (b.dist_high || -999) - (a.dist_high || -999)).slice(0, 20),
        nearLow:  enriched.filter(r => r.near_low  === true).map(r => ({ ...r, dist_pct: r.dist_low  })).sort((a, b) => (a.dist_low  ||  999) - (b.dist_low  ||  999)).slice(0, 20),
    };
}

/** Deduplicate stock_returns rows → Map<ticker, row> keeping freshest date. */
function buildReturnsMap(rows) {
    const map = new Map();
    for (const r of (rows || [])) {
        if (!r.ticker) continue;
        const prev = map.get(r.ticker);
        if (!prev || (r.latest_date || "") > (prev.latest_date || "")) map.set(r.ticker, r);
    }
    return map;
}

/** Merge ticker_industry_rs rows with a returns map into the rsStocks shape. */
function enrichRsStocks(tirsData, returnsMap) {
    return (tirsData || []).map(row => {
        const ret = returnsMap.get(row.ticker);
        return {
            ticker:    row.ticker,
            industry:  normalizeIndustryName(row.industry),
            rs_rating: row.rs_rating,
            name:      null,
            ret_3m:    ret?.ret_3m  ?? null,
            ret_6m:    ret?.ret_6m  ?? null,
            ret_12m:   ret?.ret_12m ?? null,
        };
    });
}

export default function StockDashboard({ T, userToken, onTickerClick, onLogin }) {
    const D = useMemo(() => buildDashboardTheme(T), [T]);
    const { isCompact, isTablet } = useViewportFlags();
    // â”€â”€â”€ STATE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);

    // ── Cache-key constants (same paths used in sbFetch calls below) ──────────
    const MOVERS_PATH = "market_movers?select=symbol,ltp,pchange,volume,high_52w,low_52w,pct_from_high,pct_from_low,near_high,near_low,rank_gainer,rank_loser,created_at&order=rank_gainer.asc.nullslast";
    const STOCK52W_PATH = "stock_52w?select=ticker,volume_ma20";
    const MOVERS_TTL = 5 * 60 * 1000;

    const TIRS_RS85_PATH   = "ticker_industry_rs?select=ticker,industry,rs_rating&rs_rating=gte.85&order=rs_rating.desc.nullslast,ticker.asc";
    const TIRS_ALL_PATH    = "ticker_industry_rs?select=industry&order=industry.asc";
    const RETURNS_PATH     = "stock_returns?select=ticker,latest_date,ret_3m,ret_6m,ret_12m&order=ticker.asc,latest_date.desc";
    const RS_TTL           = 60 * 60 * 1000;
    const RETURNS_TTL      = 10 * 60 * 1000;
    // Fetch top 100 directly from indicators table (matches DB query: ORDER BY rs_rating DESC)
    // We first get the latest date, then query that date + NSE only to avoid BSE duplicates
    const ALL_RS_LATEST_DATE_PATH = "indicators?select=date&order=date.desc&limit=1";
    const ALL_RS_TTL       = 10 * 60 * 1000;

    // ── Market Movers – seed from cache so first paint is instant ────────────
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const _cachedMovers = useMemo(() => {
        const hit = cacheGet(MOVERS_PATH, MOVERS_TTL);
        return hit ? hit.data || [] : null;
    }, []); // run once at mount

    const _derivedMovers = useMemo(() => {
        if (!_cachedMovers) return null;
        const s52Hit = cacheGet(STOCK52W_PATH, RETURNS_TTL);
        const s52Rows = s52Hit ? s52Hit.data || [] : [];
        return deriveMovers(_cachedMovers, s52Rows);
    }, [_cachedMovers]); // eslint-disable-line react-hooks/exhaustive-deps

    const [gainers, setGainers] = useState(() => _derivedMovers?.gainers || []);
    const [losers, setLosers] = useState(() => _derivedMovers?.losers || []);
    const [nearHigh, setNearHigh] = useState(() => _derivedMovers?.nearHigh || []);
    const [nearLow, setNearLow] = useState(() => _derivedMovers?.nearLow || []);
    // Only show skeleton if there's truly nothing cached
    const [loadingMovers, setLoadingMovers] = useState(() => !_derivedMovers);
    const [activeMoversTab, setActiveMoversTab] = useState("gainers");

    // ── RS stocks – seed from cache ──────────────────────────────────────────
    const _cachedRs = useMemo(() => {
        const hit = cacheGet(TIRS_RS85_PATH, RS_TTL);
        return hit ? hit.data || [] : null;
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const [rsStocks, setRsStocks] = useState(() => {
        if (!_cachedRs) return [];
        const retHit = cacheGet(RETURNS_PATH, RETURNS_TTL);
        const retRows = retHit ? retHit.data || [] : [];
        const retMap = buildReturnsMap(retRows);
        return enrichRsStocks(_cachedRs, retMap);
    });
    const [loadingRs, setLoadingRs] = useState(() => !_cachedRs);
    const [industry, setIndustry] = useState("");
    const [searchTerm, setSearchTerm] = useState("");

    // ── Top 100 RS stocks directly from indicators table ──────────────────────
    const [allRsStocks, setAllRsStocks] = useState([]);
    const [loadingAllRs, setLoadingAllRs] = useState(true);
    const [industries, setIndustries] = useState(() => {
        const hit = cacheGet(TIRS_ALL_PATH, RS_TTL);
        if (!hit) return [];
        return [...new Set((hit.data || []).map(r => normalizeIndustryName(r.industry)).filter(Boolean))].sort();
    });
    const [loadingIndustries, setLoadingIndustries] = useState(() => {
        const hit = cacheGet(TIRS_ALL_PATH, RS_TTL);
        return !hit;
    });
    const [industryTotals, setIndustryTotals] = useState(() => {
        const hit = cacheGet(TIRS_ALL_PATH, RS_TTL);
        if (!hit) return new Map();
        const m = new Map();
        (hit.data || []).forEach(r => {
            const key = normalizeIndustryKey(r.industry);
            if (key) m.set(key, (m.get(key) || 0) + 1);
        });
        return m;
    }); // total stocks per industry (all ratings)

    // RS Tab: "sector" | "all"
    const [activeRsTab, setActiveRsTab] = useState("sector");

    const prefetchRef = useRef(null);
    const stockReturnsMapRef = useRef(new Map()); // ticker -> {ret_3m, ret_6m, ret_12m}

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // FETCH MARKET MOVERS
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    useEffect(() => {
        // applyMovers: takes raw API rows and updates all mover state slices.
        function applyMovers(moversData, stock52wRows) {
            const derived = deriveMovers(moversData, stock52wRows);
            setGainers(derived.gainers);
            setLosers(derived.losers);
            setNearHigh(derived.nearHigh);
            setNearLow(derived.nearLow);
            if (moversData[0]?.created_at) {
                setLastUpdated(new Date(moversData[0].created_at).toLocaleString("en-IN", {
                    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
                }));
            }
        }

        (async () => {
            // If we already seeded from cache, don't show a spinner.
            // loadingMovers is only true when there was no cache at mount.
            setError(null);
            try {
                // Both calls respect SWR: they return stale cache immediately
                // and call onStale when a background refresh completes.
                let freshMovers = null;
                let freshS52    = null;

                const [moversData, stock52wData] = await Promise.all([
                    sbFetch(MOVERS_PATH, userToken, {
                        ttl: MOVERS_TTL,
                        onStale: fresh => { freshMovers = fresh; if (freshS52 !== null) applyMovers(freshMovers, freshS52); },
                    }),
                    fetchAllStock52wVolume(userToken),
                ]);

                // If we got a stale SWR hit, the onStale cb fires later.
                // The synchronous return here is used for the initial render.
                applyMovers(moversData, stock52wData);
            } catch (err) {
                console.error("Error fetching movers:", err);
                setError(`Failed to load market movers: ${err.message}`);
            } finally {
                setLoadingMovers(false);
            }
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userToken]);

    // â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    // FETCH RS > 85 STOCKS + ALL STOCK RETURNS
    // â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    useEffect(() => {
        function applyRsData(tirsData, allIndustryData, allReturnsData) {
            const returnsMap = buildReturnsMap(allReturnsData);
            stockReturnsMapRef.current = returnsMap;

            const totalsMap = new Map();
            allIndustryData.forEach(r => {
                const key = normalizeIndustryKey(r.industry);
                if (key) totalsMap.set(key, (totalsMap.get(key) || 0) + 1);
            });
            setIndustryTotals(totalsMap);

            const uniqueInds = [...new Set(
                tirsData.map(r => normalizeIndustryName(r.industry)).filter(Boolean)
            )].sort();
            setIndustries(uniqueInds);
            setLoadingIndustries(false);

            setRsStocks(enrichRsStocks(tirsData, returnsMap));
        }

        (async () => {
            // loadingRs / loadingIndustries are false when cache was available at mount.
            setError(null);
            try {
                const [tirsData, allIndustryData, allReturnsData, latestDateRows] = await Promise.all([
                    sbFetchAll(TIRS_RS85_PATH, userToken, { ttl: RS_TTL }),
                    sbFetchAll(TIRS_ALL_PATH,  userToken, { ttl: RS_TTL }),
                    sbFetchAll(RETURNS_PATH,   userToken, { ttl: RETURNS_TTL }),
                    // Step 1: get the latest date in indicators
                    sbFetch(ALL_RS_LATEST_DATE_PATH, userToken, { ttl: ALL_RS_TTL }),
                ]);
                applyRsData(tirsData, allIndustryData, allReturnsData);

                // Step 2: fetch all stocks with RS >= 85 for latest date, NSE only (avoids BSE duplicates)
                const latestDate = latestDateRows?.[0]?.date;
                const ALL_RS_PATH = latestDate
                    ? `indicators?select=ticker,rs_rating,rs_score,cap_category&date=eq.${latestDate}&exchange=eq.NSE&rs_rating=gte.85&order=rs_rating.desc.nullslast`
                    : `indicators?select=ticker,rs_rating,rs_score,cap_category&exchange=eq.NSE&rs_rating=gte.85&order=rs_rating.desc.nullslast`;
                const indicatorsHighRS = await sbFetch(ALL_RS_PATH, userToken, { ttl: ALL_RS_TTL });

                // Build allRsStocks: join indicators with returns
                const returnsMap = buildReturnsMap(allReturnsData);
                const enriched = (indicatorsHighRS || []).map((r, idx) => {
                    const ret = returnsMap.get(r.ticker);
                    return {
                        ticker:       r.ticker,
                        rs_rating:    r.rs_rating,
                        rs_score:     r.rs_score,
                        cap_category: r.cap_category,
                        rank:         idx + 1,
                        ret_3m:       ret?.ret_3m  ?? null,
                        ret_6m:       ret?.ret_6m  ?? null,
                        ret_12m:      ret?.ret_12m ?? null,
                    };
                });
                setAllRsStocks(enriched);
            } catch (err) {
                console.error("Error fetching RS stocks:", err);
                setError(`Failed to load RS stocks: ${err.message}`);
            } finally {
                setLoadingRs(false);
                setLoadingAllRs(false);
            }
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userToken]);




    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // PREFETCH adjacent industries
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    useEffect(() => {
        if (!industry || !industries.length) return;
        if (prefetchRef.current) clearTimeout(prefetchRef.current);
        prefetchRef.current = setTimeout(() => {
            const idx = industries.indexOf(industry);
            [industries[idx - 1], industries[idx + 1]].filter(Boolean).forEach(ind => {
                sbFetch(`company_financials?select=ticker,name&industry=eq.${encodeURIComponent(ind)}`, userToken, { ttl: 10 * 60 * 1000 }).catch(() => {});
            });
        }, 800);
        return () => clearTimeout(prefetchRef.current);
    }, [industry, industries, userToken]);


    // ────────────────────────────────────────────────────────────────────────────
    // LAZY LOAD company names when user drills into an industry
    // (returns are already populated at startup from the full stock_returns fetch)
    // ────────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!industry) return;
        (async () => {
            try {
                const compData = await sbFetch(
                    `company_financials?select=ticker,name&industry=eq.${encodeURIComponent(industry)}`,
                    userToken, { ttl: 10 * 60 * 1000 }
                );
                const nameMap = new Map(compData.map(c => [c.ticker, c.name]));
                setRsStocks(prev => prev.map(row => {
                    if (normalizeIndustryKey(row.industry) !== normalizeIndustryKey(industry)) return row;
                    return { ...row, name: nameMap.get(row.ticker) || row.name };
                }));
            } catch (e) {
                console.error("Error fetching industry names:", e);
            }
        })();
    }, [industry, userToken]);
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // RENDER
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const currentMoversData = {
        gainers: gainers,
        losers: losers,
        near_high: nearHigh,
        near_low: nearLow,
    }[activeMoversTab] || [];

    const rsIndustrySummary = useMemo(() => {
        const counts = new Map();
        const labels = new Map();
        const matchingIndustries = new Set();
        const term = searchTerm.trim().toUpperCase();

        rsStocks.forEach(row => {
            const key = normalizeIndustryKey(row.industry);
            if (!key) return;
            
            labels.set(key, normalizeIndustryName(row.industry));
            counts.set(key, (counts.get(key) || 0) + 1);
            
            if (term && (row.ticker || "").toUpperCase().includes(term)) {
                matchingIndustries.add(key);
            }
        });

        return [...counts.entries()]
            .filter(([industryKey]) => {
                if (!term) return true;
                return matchingIndustries.has(industryKey);
            })
            .map(([industryKey, count]) => {
                const total = industryTotals.get(industryKey) || 0;
                const safeTotal = total > 0 ? total : count;
                const pct = safeTotal > 0 ? (count / safeTotal) * 100 : 0;
                return {
                    industry: labels.get(industryKey) || industryKey,
                    count,
                    total: safeTotal,
                    pct,
                };
            })
            .sort((a, b) => b.pct - a.pct || a.industry.localeCompare(b.industry));
    }, [rsStocks, industryTotals, searchTerm]);

    // Reset industry selection when starting a new search to show matching sectors in summary
    useEffect(() => {
        if (searchTerm.trim()) {
            setIndustry("");
        }
    }, [searchTerm]);

    const rsIndustryStocks = useMemo(() => {
        let stocks = industry
            ? rsStocks
                .filter(row => normalizeIndustryKey(row.industry) === normalizeIndustryKey(industry))
                .sort((a, b) => (Number(b.rs_rating) || 0) - (Number(a.rs_rating) || 0) || (a.ticker || "").localeCompare(b.ticker || ""))
            : [];
        
        if (searchTerm.trim()) {
            const term = searchTerm.trim().toUpperCase();
            stocks = stocks.filter(s => (s.ticker || "").toUpperCase().includes(term));
        }
        return stocks;
    }, [industry, rsStocks, searchTerm]);

    // Top 100 stocks by rs_rating — fetched directly from indicators table (same as DB query)
    // allRsStocks is populated via ALL_RS_PATH fetch, NOT derived from rsStocks (which is RS>85 only)
    const allHighRsStocks = useMemo(() => {
        if (!searchTerm.trim()) return allRsStocks;
        const term = searchTerm.trim().toUpperCase();
        return allRsStocks.filter(s => (s.ticker || "").toUpperCase().includes(term));
    }, [allRsStocks, searchTerm]);

    return (
        <div className={`stock-dashboard-shell ${D.isDark ? "is-dark" : "is-light"} ${isCompact ? "is-compact" : ""}`} style={{
            flex: 1, overflow: "auto", minHeight: 0,
            background: D.shellBg, padding: isCompact ? "12px 10px 24px" : "24px 24px 40px",
            fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif",
            animation: "sdFadeIn 0.3s ease",
        }}>

            {/* â”€â”€ ERROR BANNER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <div style={{ width: "100%", maxWidth: 1400, margin: "0 auto" }}>
            {error && (
                <div style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    padding: "12px 16px", marginBottom: 16, borderRadius: 18,
                    background: D.negSoft,
                    border: `1px solid ${withAlpha(D.neg || "#ef4444", 0.22)}`,
                    fontSize: 14, color: D.negText || D.neg,
                    boxShadow: D.shadowMd,
                }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        style={{ flexShrink: 0, marginTop: 1 }}>
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="12"/>
                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <span style={{ flex: 1 }}>{String(error || "")}</span>
                    <button onClick={() => setError(null)} style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: "inherit", fontSize: 16, lineHeight: 1, padding: 0,
                    }}>x</button>
                </div>
            )}

            {/* â”€â”€ MARKET OVERVIEW (Index Cards) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <MarketOverview T={D} userToken={userToken} isCompact={isCompact} isTablet={isTablet} />

            {/* -- MARKET MOVERS CARD -- */}
            <SectionCard T={D}>
                <CardHeader
                    T={D}
                    title="Market Movers"
                    count={currentMoversData.length}
                />
                <div style={{
                    display: "flex",
                    gap: isCompact ? 6 : 8,
                    marginBottom: 16,
                    padding: "6px",
                    background: D.softFill,
                    borderRadius: 999,
                    flexWrap: "wrap",
                    border: `1px solid ${D.panelBorder}`,
                }}>
                    <TabButton T={D} active={activeMoversTab === "gainers"} label={isCompact ? "Gainers" : "Top Gainers"} count={gainers.length} onClick={() => setActiveMoversTab("gainers")} hideCount={isCompact} />
                    <TabButton T={D} active={activeMoversTab === "losers"} label={isCompact ? "Losers" : "Top Losers"} count={losers.length} onClick={() => setActiveMoversTab("losers")} hideCount={isCompact} />
                    <TabButton T={D} active={activeMoversTab === "near_high"} label={isCompact ? "52W High" : "Near 52W High"} count={nearHigh.length} onClick={() => setActiveMoversTab("near_high")} hideCount={isCompact} />
                    <TabButton T={D} active={activeMoversTab === "near_low"} label={isCompact ? "52W Low" : "Near 52W Low"} count={nearLow.length} onClick={() => setActiveMoversTab("near_low")} hideCount={isCompact} />
                </div>
                <MoversTable T={D} data={currentMoversData} loading={loadingMovers} type={activeMoversTab} isCompact={isCompact} />
            </SectionCard>

            {/* -- RS RATING CARD -- */}
            <SectionCard T={D}>
                <div style={{
                    display: "flex",
                    flexDirection: isCompact ? "column" : "row",
                    justifyContent: "space-between",
                    alignItems: isCompact ? "flex-start" : "center",
                    marginBottom: 16,
                    gap: 12
                }}>
                    <CardHeader
                        T={D}
                        title={
                            activeRsTab === "all"
                                ? "All Stocks with RS Rating > 85"
                                : industry
                                    ? `RS Rating > 85 - ${industry}`
                                    : "RS Rating > 85 - All Industries"
                        }
                        count={
                            activeRsTab === "all"
                                ? allHighRsStocks.length
                                : industry
                                    ? rsIndustryStocks.length
                                    : searchTerm.trim()
                                        ? rsIndustrySummary.reduce((sum, row) => sum + row.count, 0)
                                        : rsIndustrySummary.length
                        }
                        style={{ marginBottom: 0 }}
                    />
                    
                    <div style={{ position: "relative", width: isCompact ? "100%" : 240 }}>
                        <input
                            type="text"
                            placeholder="Search ticker..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{
                                width: "100%",
                                padding: "10px 14px 10px 38px",
                                borderRadius: 12,
                                border: `1px solid ${D.pillBorder}`,
                                background: D.pillBg,
                                color: D.text,
                                fontSize: 15,
                                fontWeight: 500,
                                fontFamily: "inherit",
                                outline: "none",
                                transition: "all 0.2s ease",
                            }}
                            onFocus={e => e.target.style.borderColor = D.accent}
                            onBlur={e => e.target.style.borderColor = D.pillBorder}
                        />
                        <svg 
                            width="14" height="14" viewBox="0 0 24 24" fill="none" 
                            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                            style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: D.muted }}
                        >
                            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        </svg>
                        {searchTerm && (
                            <button 
                                onClick={() => setSearchTerm("")}
                                style={{
                                    position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                                    background: "none", border: "none", cursor: "pointer", color: D.muted, padding: 4
                                }}
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                            </button>
                        )}
                    </div>

                    {activeRsTab === "sector" && industry && (
                        <button
                            onClick={() => setIndustry("")}
                            style={{
                                padding: isCompact ? "8px 12px" : "10px 14px",
                                fontSize: 14,
                                fontWeight: 600,
                                color: D.text,
                                background: D.pillBg,
                                border: `1px solid ${D.pillBorder}`,
                                borderRadius: 999,
                                cursor: "pointer",
                                fontFamily: "inherit",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {"← Back"}
                        </button>
                    )}
                </div>
                {/* RS sub-tabs */}
                <div style={{
                    display: "flex",
                    gap: isCompact ? 6 : 8,
                    marginBottom: 16,
                    padding: "6px",
                    background: D.softFill,
                    borderRadius: 999,
                    border: `1px solid ${D.panelBorder}`,
                    width: "fit-content",
                }}>
                    <TabButton
                        T={D}
                        active={activeRsTab === "sector"}
                        label="Sector Wise"
                        onClick={() => { setActiveRsTab("sector"); setIndustry(""); }}
                        hideCount
                    />
                    <TabButton
                        T={D}
                        active={activeRsTab === "all"}
                        label="All"
                        count={allHighRsStocks.length}
                        onClick={() => setActiveRsTab("all")}
                        hideCount={isCompact}
                    />
                </div>
                <RsLoginGate T={D} isLocked={!userToken} onLogin={onLogin}>
                    {activeRsTab === "all" ? (
                        <AllRsTable T={D} data={allHighRsStocks} loading={loadingAllRs} onTickerClick={onTickerClick} isCompact={isCompact} />
                    ) : industry ? (
                        <RsTable T={D} data={rsIndustryStocks} loading={loadingRs} onTickerClick={onTickerClick} isCompact={isCompact} />
                    ) : (
                        <RsIndustrySummaryTable T={D} data={rsIndustrySummary} loading={loadingRs} onIndustryClick={setIndustry} isCompact={isCompact} />
                    )}
                </RsLoginGate>
            </SectionCard>
            </div>
            <style>{`
                .stock-dashboard-shell * {
                    box-sizing: border-box;
                }
                .stock-dashboard-shell button {
                    outline: none;
                }
                .stock-dashboard-shell button:focus-visible {
                    box-shadow: 0 0 0 3px ${withAlpha(D.accent, 0.18)};
                }
                .stock-dashboard-shell ::-webkit-scrollbar {
                    height: 10px;
                    width: 10px;
                }
                .stock-dashboard-shell ::-webkit-scrollbar-thumb {
                    background: ${withAlpha(D.muted, 0.34)};
                    border-radius: 999px;
                }
                .stock-dashboard-shell ::-webkit-scrollbar-track {
                    background: transparent;
                }
                @keyframes sdFadeIn {
                    from { opacity: 0; transform: translateY(6px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes sdPulse {
                    0%, 100% { opacity: 0.42; }
                    50% { opacity: 0.16; }
                }
            `}</style>
        </div>
    );
}




