import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";

import { ensureAllowedTickerSet, getAllowedTickerSetSync, isAllowedTicker } from "./marketUniverse";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
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
const SS_PREFIX = "sbd:";
const LS_PREFIX = "sbd-persist:";
const NAME_MAP_LS_KEY = "sbd-persist:name-map"; // flat { ticker: name } object – survives sessions
const _memCache = new Map();   // key → { data, ts, ttl }
const _pending = new Map();   // key → Promise  (dedup concurrent requests)
let _stockDashboardWarmPromise = null;

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

function _lsKey(key) { return LS_PREFIX + key; }

function _lsGet(key) {
    if (typeof localStorage === "undefined") return null;
    try {
        const raw = localStorage.getItem(_lsKey(key));
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function _lsSet(key, entry) {
    if (typeof localStorage === "undefined") return;
    try { localStorage.setItem(_lsKey(key), JSON.stringify(entry)); } catch { }
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

    // 3. Check persistent storage so a browser restart can still paint instantly.
    const ls = _lsGet(key);
    if (ls && ls.data !== undefined) {
        const effectiveTtl = ttl ?? ls.ttl ?? 0;
        const stale = Date.now() - (ls.ts || 0) > effectiveTtl;
        const entry = { data: ls.data, ts: ls.ts || 0, ttl: ls.ttl ?? effectiveTtl };
        _memCache.set(key, entry);
        _ssSet(key, entry);
        return { data: ls.data, stale };
    }

    // 4. Memory stale but sessionStorage/localStorage empty – surface the stale memory value
    if (mem) return { data: mem.data, stale: true };

    return null;  // cache miss
}

function cacheSet(key, data, ttl = 5 * 60 * 1000) {
    const entry = { data, ts: Date.now(), ttl };
    _memCache.set(key, entry);
    _ssSet(key, entry);
    _lsSet(key, entry);

    // Trim memory cache ceiling
    if (_memCache.size > 150) {
        const keys = [..._memCache.keys()];
        keys.slice(0, Math.floor(keys.length * 0.2)).forEach(k => _memCache.delete(k));
    }
}

function persistentCacheGet(key, ttl) {
    const now = Date.now();
    const mem = _memCache.get(key);
    if (mem && now - mem.ts <= ttl) return { data: mem.data, stale: false };
    const ls = _lsGet(key);
    if (ls?.data !== undefined) {
        _memCache.set(key, { data: ls.data, ts: ls.ts || 0, ttl });
        return { data: ls.data, stale: now - (ls.ts || 0) > ttl };
    }
    return mem ? { data: mem.data, stale: true } : null;
}

function persistentCacheSet(key, data, ttl) {
    const entry = { data, ts: Date.now(), ttl };
    _memCache.set(key, entry);
    _lsSet(key, entry);
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
    let data = await _doFetch(path, token, ttl, noCache);
    
    // If network failed (data is null), check localStorage as a last resort.
    if (!data && !noCache) {
        const ls = _lsGet(key);
        if (ls?.data) {
            console.warn("[sbFetch] network failed, falling back to localStorage", key);
            data = ls.data;
        }
    }
    
    return data;
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
        if (!res.ok) { console.error("[sbFetch]", res.status, raw); return null; }
        let data;
        try { data = JSON.parse(raw); } catch { console.error("[sbFetch] Invalid JSON"); return null; }
        if (data && !Array.isArray(data) && data.code) {
            console.error("[sbFetch] error body:", data);
            return null;
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
        if (onStale) _pending.get(path).then(onStale).catch(() => { });
        return;
    }
    _doFetch(path, token, ttl, false)
        .then(fresh => { if (onStale) onStale(fresh); })
        .catch(err => console.warn("[sbFetch SWR bg]", path.split("?")[0], err.message));
}

async function sbFetchAll(path, token, { ttl = 5 * 60 * 1000, pageSize = 1000, onStale } = {}) {
    const rows = [];
    const refreshedPages = new Map();
    const expectedOffsets = new Set();
    let initialPagingComplete = false;
    const emitStaleAll = () => {
        if (!onStale || !initialPagingComplete || refreshedPages.size !== expectedOffsets.size) return;
        const merged = [];
        [...expectedOffsets].sort((a, b) => a - b).forEach(key => merged.push(...(refreshedPages.get(key) || [])));
        onStale(merged);
    };
    let offset = 0;

    while (true) {
        const separator = path.includes("?") ? "&" : "?";
        const pageOffset = offset;
        expectedOffsets.add(pageOffset);
        const page = await sbFetch(
            `${path}${separator}limit=${pageSize}&offset=${offset}`,
            token,
            {
                ttl,
                onStale: freshPage => {
                    if (!Array.isArray(freshPage)) return;
                    refreshedPages.set(pageOffset, freshPage);
                    emitStaleAll();
                },
            }
        );

        if (!Array.isArray(page) || !page.length) break;
        rows.push(...page);
        if (page.length < pageSize) break;
        offset += pageSize;
    }

    initialPagingComplete = true;
    emitStaleAll();
    return rows;
}

function cacheGetAllPages(path, ttl, pageSize = 1000, maxPages = 20) {
    const rows = [];
    for (let offset = 0, pageIndex = 0; pageIndex < maxPages; offset += pageSize, pageIndex += 1) {
        const separator = path.includes("?") ? "&" : "?";
        const hit = cacheGet(`${path}${separator}limit=${pageSize}&offset=${offset}`, ttl);
        if (!hit || !Array.isArray(hit.data) || hit.data.length === 0) break;
        rows.push(...hit.data);
        if (hit.data.length < pageSize) break;
    }
    return rows.length ? rows : null;
}

// ─── GLOBAL NAME MAP  (ticker → company name) ────────────────────────────────
//
//  Built synchronously at module load by scanning all bhav_copy entries already
//  in sessionStorage / localStorage.  On any revisit – or hard refresh when
//  localStorage is warm – names are available before the first render, so the
//  movers table paints ticker+name together with zero flicker.
//  Updated eagerly whenever batchFetchBhavNames resolves new rows.
// ─────────────────────────────────────────────────────────────────────────────
const _nameMap = new Map(); // ticker → name

function _seedNameMapFromCache() {
    // ── Layer 1: dedicated flat name-map (single localStorage read, always fresh) ──
    // Written by _persistNameMap() after every batchFetchBhavNames call.
    // This is the fast path: O(1) read regardless of how many tickers are known.
    try {
        const raw = localStorage.getItem(NAME_MAP_LS_KEY);
        if (raw) {
            const obj = JSON.parse(raw); // { ticker: name, … }
            for (const [ticker, name] of Object.entries(obj)) {
                if (ticker && name) _nameMap.set(ticker, name);
            }
        }
    } catch { /* storage unavailable or malformed – fall through */ }

    // ── Layer 2: legacy scan of bhav_copy chunk cache entries ─────────────────
    // Picks up any tickers that were cached before the flat map existed, or in
    // another tab that hasn't yet called _persistNameMap.
    const scanEntries = (storage) => {
        try {
            for (let i = 0; i < storage.length; i++) {
                const k = storage.key(i);
                if (!k || !k.includes("bhav_copy")) continue;
                try {
                    const entry = JSON.parse(storage.getItem(k) || "{}");
                    if (Array.isArray(entry.data)) {
                        for (const row of entry.data) {
                            if (row.ticker && row.name && !_nameMap.has(row.ticker))
                                _nameMap.set(row.ticker, row.name);
                        }
                    }
                } catch { /* malformed – skip */ }
            }
        } catch { /* storage unavailable */ }
    };
    try { scanEntries(sessionStorage); } catch { }
    try { scanEntries(localStorage); } catch { }
}
_seedNameMapFromCache();

/** Persist the entire _nameMap to a single localStorage key so future sessions
 *  can load all known names in one read instead of scanning bhav_copy chunks. */
function _persistNameMap() {
    try {
        const obj = Object.fromEntries(_nameMap);
        localStorage.setItem(NAME_MAP_LS_KEY, JSON.stringify(obj));
    } catch {
        // QuotaExceededError – evict half of the known names (oldest by insertion order)
        // and retry once; the map will self-heal on the next successful fetch.
        try {
            const entries = [..._nameMap.entries()];
            const keep = entries.slice(Math.floor(entries.length / 2));
            localStorage.setItem(NAME_MAP_LS_KEY, JSON.stringify(Object.fromEntries(keep)));
        } catch { /* give up silently */ }
    }
}

function _updateNameMap(nameRows) {
    let changed = false;
    for (const row of nameRows) {
        if (row.ticker && row.name && !_nameMap.has(row.ticker)) {
            _nameMap.set(row.ticker, row.name);
            changed = true;
        }
    }
    // Persist the enriched map so the next session (or hard-refresh) sees names instantly.
    if (changed) _persistNameMap();
}

// ─── GLOBAL NAME MAP PREFETCH  ───────────────────────────────────────────────
//
//  On a cold start (new device / cleared storage), names arrive *after* the
//  first render because each table only fetches names for the tickers it sees.
//  This function eagerly bulk-fetches ALL company names from company_financials
//  in one shot and writes them to _nameMap + localStorage so that:
//    • The current session has instant names after the prefetch resolves.
//    • Every future session on this device (and the rest of the current session)
//      reads names from localStorage at module load – zero network cost.
//
//  A session-level flag (sessionStorage key "sbd:names-prefetched") prevents
//  the bulk fetch from running more than once per browser session.
// ─────────────────────────────────────────────────────────────────────────────
const _NAME_PREFETCH_SS_KEY = "sbd:names-prefetched";

async function prefetchGlobalNameMap(userToken) {
    // Skip if already done this session or if map is already large (warm cache)
    try {
        if (sessionStorage.getItem(_NAME_PREFETCH_SS_KEY)) return;
    } catch { /* private mode – ignore */ }

    // If localStorage already has a reasonably populated name map, mark as done
    // and skip the network call for this session.
    if (_nameMap.size >= 100) {
        try { sessionStorage.setItem(_NAME_PREFETCH_SS_KEY, "1"); } catch { }
        return;
    }

    try {
        // Paginate through all company_financials rows (ticker + name only).
        // Each page is 1000 rows; typical NSE universe is ~2000–5000 rows so
        // this is usually 2–5 fast requests, run in parallel after the first page.
        const PAGE = 1000;
        const firstPage = await sbFetch(
            `company_financials?select=ticker,name&order=ticker.asc&limit=${PAGE}&offset=0`,
            userToken,
            { ttl: 24 * 60 * 60 * 1000 }   // names are stable – cache 24 h
        );
        if (!Array.isArray(firstPage) || firstPage.length === 0) return;

        _updateNameMap(firstPage);

        // If the first page was full, fetch remaining pages in parallel
        if (firstPage.length === PAGE) {
            // Optimistically fetch up to 9 more pages (covers 10 000 tickers)
            const remainingPages = await Promise.all(
                Array.from({ length: 9 }, (_, i) => {
                    const offset = (i + 1) * PAGE;
                    return sbFetch(
                        `company_financials?select=ticker,name&order=ticker.asc&limit=${PAGE}&offset=${offset}`,
                        userToken,
                        { ttl: 24 * 60 * 60 * 1000 }
                    ).catch(() => []);
                })
            );
            for (const page of remainingPages) {
                if (Array.isArray(page) && page.length) _updateNameMap(page);
            }
        }

        console.log("[prefetchGlobalNameMap] name map size:", _nameMap.size);
        try { sessionStorage.setItem(_NAME_PREFETCH_SS_KEY, "1"); } catch { }
    } catch (err) {
        console.warn("[prefetchGlobalNameMap] failed:", err.message);
    }
}

/** Enrich rows with names from the global map – instant when map is warm. */
function applyNamesFromMap(rows) {
    return rows.map(r => ({ ...r, name: _nameMap.get(r.ticker) || r.name || null }));
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

async function batchFetchBhavNames(tickers, userToken) {
    if (!tickers.length) return [];
    const chunks = [];
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
        chunks.push(tickers.slice(i, i + BATCH_SIZE));
    }
    // Fetch all chunks in parallel — cache dedup in sbFetch prevents write races
    const results = await Promise.all(
        chunks.map(chunk => {
            const tickersIn = toSupabaseInList(chunk);
            return sbFetch(
                `bhav_copy?select=ticker,name&ticker=in.${tickersIn}&order=ticker.asc,date.desc`,
                userToken,
                { ttl: 60 * 60 * 1000 }
            ).catch(e => { console.warn("[batchFetchBhavNames] chunk failed:", e.message); return []; });
        })
    );
    const allRows = results.flat();
    // Deduplicate: keep only the first (= latest-date) row per ticker
    const seen = new Set();
    const deduped = [];
    for (const row of allRows) {
        if (!row || !row.ticker || seen.has(row.ticker)) continue;
        seen.add(row.ticker);
        if (row.name) deduped.push({ ticker: row.ticker, name: row.name });
    }
    console.log("[batchFetchBhavNames] resolved", deduped.length, "names for", tickers.length, "tickers");
    // Keep global name map up-to-date so subsequent renders are instant
    _updateNameMap(deduped);
    return deduped;
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
const MOVERS_INITIAL_ROWS = 20;
const MOVERS_LOAD_MORE_ROWS = 20;

const fmt = (n, d = 2) => n == null ? EMPTY_VALUE : Number(n).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPct = (n) => n == null ? EMPTY_VALUE : `${Number(n) > 0 ? "+" : ""}${fmt(n)}%`;
const fmtVol = (n) => {
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
                background: T.isDark
                    ? `linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(15,23,42,0.6) 100%)`
                    : `linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.92) 100%)`,
                border: `1px solid ${T.panelBorder}`,
                boxShadow: T.shadowMd,
                borderRadius: 22,
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
                borderRadius: 21,
                border: `1px solid ${T.insetBorder}`,
                pointerEvents: "none",
            }} />
            <div style={{ position: "relative", zIndex: 1 }}>
                {children}
            </div>
        </div>
    );
}

function DashboardLensIcon({ type, size = 16 }) {
    const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
    if (type === "flow") return <svg {...common}><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></svg>;
    if (type === "ownership") return <svg {...common}><path d="M12 3l8 4v6c0 4.5-3.1 7.4-8 8-4.9-.6-8-3.5-8-8V7l8-4z" /><path d="M9 12l2 2 4-5" /></svg>;
    if (type === "watchlist") return <svg {...common}><path d="M4 5h16" /><path d="M4 12h10" /><path d="M4 19h7" /><path d="M18 14v6" /><path d="M15 17h6" /></svg>;
    if (type === "journal") return <svg {...common}><path d="M7 3h8l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M14 3v5h5" /><path d="M9 14h6" /></svg>;
    if (type === "screens") return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9h10" /><path d="M7 14h6" /></svg>;
    return <svg {...common}><path d="M4 19V5" /><path d="M9 19v-7" /><path d="M14 19V8" /><path d="M19 19v-4" /></svg>;
}

function FiiDiiFlowBars({ D, data, isCompact }) {
    // data: array of fii_dii_activity rows, sorted desc by date
    const rows = (data || []).slice(0, 7).reverse(); // show last 7 days, oldest→newest
    if (!rows.length) {
        return <div style={{ color: D.muted, fontSize: 11 }}>waiting for data</div>;
    }

    const allValues = rows.flatMap(r => [r.fii_net, r.dii_net]).filter(v => v != null);
    const absMax = Math.max(...allValues.map(Math.abs), 1);

    const fmtCr = v => {
        if (v == null) return "-";
        // raw values from DB are already in Crores
        const sign = v >= 0 ? "+" : "";
        const abs = Math.abs(v);
        if (abs >= 1e5) return `${sign}${(v / 1e5).toFixed(1)}L`;
        return `${sign}${Math.round(v).toLocaleString("en-IN")}`;
    };

    const barMaxH = 44;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, width: "100%" }}>
            {/* bars + date labels: one column per day, fills available width */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, width: "100%", minWidth: 0 }}>
                {rows.map((r, i) => {
                    const fiiH = Math.max(2, Math.round(Math.abs(r.fii_net || 0) / absMax * barMaxH));
                    const diiH = Math.max(2, Math.round(Math.abs(r.dii_net || 0) / absMax * barMaxH));
                    const fiiPos = (r.fii_net || 0) >= 0;
                    const diiPos = (r.dii_net || 0) >= 0;
                    const d = r.date ? String(r.date).slice(5) : "";
                    return (
                        <div key={i} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                            {/* bar pair */}
                            <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: barMaxH, width: "100%", justifyContent: "center" }}>
                                <div title={`FII: ${fmtCr(r.fii_net)}Cr`} style={{
                                    flex: 1,
                                    maxWidth: 14,
                                    height: fiiH,
                                    borderRadius: "2px 2px 0 0",
                                    background: fiiPos ? withAlpha(D.pos || "#10b981", 0.85) : withAlpha(D.neg || "#ef4444", 0.82),
                                }} />
                                <div title={`DII: ${fmtCr(r.dii_net)}Cr`} style={{
                                    flex: 1,
                                    maxWidth: 14,
                                    height: diiH,
                                    borderRadius: "2px 2px 0 0",
                                    background: diiPos ? withAlpha(D.accent || "#2563eb", 0.78) : withAlpha("#f59e0b", 0.78),
                                }} />
                            </div>
                            {/* date */}
                            <div style={{
                                fontSize: 8,
                                color: D.muted,
                                fontFamily: "'IBM Plex Mono', monospace",
                                letterSpacing: "-0.02em",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "clip",
                                width: "100%",
                                textAlign: "center",
                            }}>{d}</div>
                        </div>
                    );
                })}
            </div>
            {/* latest day net values */}
            {rows.length > 0 && (() => {
                const latest = rows[rows.length - 1];
                // raw DB values are already in Crores – no conversion needed
                const fiiNet = latest.fii_net || 0;
                const diiNet = latest.dii_net || 0;
                return (
                    <div style={{ display: "flex", gap: 10, marginTop: 2 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{
                                width: 6, height: 6, borderRadius: 1, flexShrink: 0,
                                background: fiiNet >= 0 ? withAlpha(D.pos || "#10b981", 0.85) : withAlpha(D.neg || "#ef4444", 0.82),
                            }} />
                            <span style={{ fontSize: 9, color: D.muted, fontFamily: "'IBM Plex Sans', sans-serif" }}>FII</span>
                            <span style={{
                                fontSize: 11,
                                fontWeight: 800,
                                fontFamily: "'IBM Plex Mono', monospace",
                                color: fiiNet >= 0 ? (D.pos || "#10b981") : (D.neg || "#ef4444"),
                            }}>{fmtCr(fiiNet)}Cr</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{
                                width: 6, height: 6, borderRadius: 1, flexShrink: 0,
                                background: diiNet >= 0 ? withAlpha(D.accent || "#2563eb", 0.78) : withAlpha("#f59e0b", 0.78),
                            }} />
                            <span style={{ fontSize: 9, color: D.muted, fontFamily: "'IBM Plex Sans', sans-serif" }}>DII</span>
                            <span style={{
                                fontSize: 11,
                                fontWeight: 800,
                                fontFamily: "'IBM Plex Mono', monospace",
                                color: diiNet >= 0 ? (D.pos || "#10b981") : (D.neg || "#ef4444"),
                            }}>{fmtCr(diiNet)}Cr</span>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}

function PremiumDashboardHero({ D, isCompact, breadthSnapshot, gainers, losers, allHighRsStocks, rsIndustrySummary, fiiDiiData, onNavigate }) {
    const topRsSectors = [...(rsIndustrySummary || [])]
        .sort((a, b) => (b.count || 0) - (a.count || 0) || (a.industry || "").localeCompare(b.industry || ""))
        .slice(0, 5);
    const leadershipCount = allHighRsStocks?.length || 0;
    const gainerCount = gainers?.length || 0;
    const loserCount = losers?.length || 0;
    const highPct = Number(breadthSnapshot?.near_52w_high);
    const lowPct = Number(breadthSnapshot?.near_52w_low);
    const sma50Pct = Number(breadthSnapshot?.above_sma50);
    const sma200Pct = Number(breadthSnapshot?.above_sma200);
    const netBreadth = gainerCount - loserCount;
    const tone = leadershipCount >= 250 || (netBreadth > 0 && highPct >= lowPct)
        ? "Constructive"
        : leadershipCount < 120 && lowPct > highPct
            ? "Defensive"
            : "Selective";
    const toneColor = tone === "Constructive" ? D.pos : tone === "Defensive" ? D.neg : D.accent;
    const toneBg = tone === "Constructive" ? D.posSoft : tone === "Defensive" ? D.negSoft : withAlpha(D.accent, D.isDark ? 0.16 : 0.09);
    const heroMetrics = [
        {
            label: "Breadth",
            breadth: [
                { label: "Near 52W High", value: Number.isFinite(highPct) ? `${highPct.toFixed(1)}%` : EMPTY_VALUE, color: highPct >= lowPct ? D.pos : D.text },
                { label: "Near 52W Low", value: Number.isFinite(lowPct) ? `${lowPct.toFixed(1)}%` : EMPTY_VALUE, color: lowPct > highPct ? D.neg : D.text },
                { label: "Above 50 SMA", value: Number.isFinite(sma50Pct) ? `${sma50Pct.toFixed(1)}%` : EMPTY_VALUE, color: sma50Pct >= 50 ? D.pos : D.neg },
                { label: "Above 200 SMA", value: Number.isFinite(sma200Pct) ? `${sma200Pct.toFixed(1)}%` : EMPTY_VALUE, color: sma200Pct >= 50 ? D.pos : D.neg },
            ],
        },
        { label: "Top RS Sectors", sectors: topRsSectors, color: D.accent },
        { label: "FII / DII Daily Flow", fiiDii: true },
    ];
    const lenses = [
        { type: "screens", title: "Breadth", meta: `${gainerCount} gainers`, action: "Market Breadth", onClick: () => onNavigate?.("technical", "breadth") },
        { type: "momentum", title: "Momentum", meta: `${leadershipCount || 0} leaders`, action: "RS Screens", onClick: () => onNavigate?.("technical", "screens") },
        { type: "flow", title: "Institutions", meta: "FII / DII", action: "Flow Desk", onClick: () => onNavigate?.("financial", "fiidii") },
        { type: "ownership", title: "Ownership", meta: "Promoter / funds", action: "Scans", onClick: () => onNavigate?.("financial", "ownership") },
        { type: "watchlist", title: "Watchlist", meta: "Saved setups", action: "Open", onClick: () => onNavigate?.("watchlist") },
        { type: "journal", title: "Journal", meta: "P&L / execution", action: "Review", onClick: () => onNavigate?.("tradevault", "dashboard") },
    ];

    return (
        <section style={{
            marginBottom: isCompact ? 14 : 18,
            borderRadius: 22,
            border: `1px solid ${D.panelBorder}`,
            background: D.isDark
                ? `linear-gradient(135deg, ${withAlpha("#020617", 0.96)} 0%, ${withAlpha("#0f172a", 0.94)} 52%, ${withAlpha(D.accent, 0.16)} 100%)`
                : `linear-gradient(135deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.96) 58%, ${withAlpha(D.accent, 0.10)} 100%)`,
            boxShadow: D.shadowLg,
            overflow: "hidden",
            position: "relative",
        }}>
            <div style={{
                position: "absolute",
                inset: 0,
                background: `linear-gradient(90deg, transparent, ${withAlpha(D.accent, D.isDark ? 0.08 : 0.05)}, transparent)`,
                pointerEvents: "none",
            }} />
            <div style={{ position: "relative", padding: isCompact ? "18px 16px" : "24px 26px" }}>
                <div style={{
                    display: "grid",
                    gridTemplateColumns: isCompact ? "1fr" : "minmax(0, 1fr) minmax(580px, 1.1fr)",
                    gap: isCompact ? 18 : 24,
                    alignItems: "stretch",
                }}>
                    <div style={{ minWidth: 0 }}>
                        <div style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "6px 10px",
                            borderRadius: 999,
                            background: toneBg,
                            border: `1px solid ${withAlpha(toneColor, 0.22)}`,
                            color: toneColor,
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
                            marginBottom: 14,
                        }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: toneColor }} />
                            {tone}
                        </div>
                        <h1 style={{
                            margin: 0,
                            color: D.text,
                            fontSize: isCompact ? 24 : 36,
                            lineHeight: 1.05,
                            fontWeight: 800,
                            letterSpacing: "-0.03em",
                            maxWidth: 760,
                            fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
                        }}>
                            Dashboard
                        </h1>
                        <p style={{
                            margin: "10px 0 0",
                            color: D.subtext,
                            fontSize: 13,
                            lineHeight: 1.6,
                            maxWidth: 720,
                            fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
                        }}>

                        </p>
                    </div>

                    <div style={{
                        display: "grid",
                        gridTemplateColumns: isCompact ? "repeat(2, minmax(0, 1fr))" : "repeat(3, minmax(140px, 1fr))",
                        gap: 10,
                    }}>
                        {heroMetrics.map(metric => (
                            <div key={metric.label} style={{
                                minWidth: 0,
                                borderRadius: 10,
                                padding: isCompact ? "12px 12px" : "14px 14px",
                                background: D.isDark ? "rgba(255,255,255,0.045)" : "rgba(255,255,255,0.72)",
                                border: `1px solid ${D.panelBorder}`,
                                ...(metric.fiiDii && isCompact ? { gridColumn: "span 2" } : {}),
                            }}>
                                <div style={{ fontSize: 10, color: D.muted, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 7, fontFamily: "'IBM Plex Sans', -apple-system, sans-serif" }}>{metric.label}</div>
                                {metric.fiiDii ? (
                                    <FiiDiiFlowBars D={D} data={fiiDiiData} isCompact={isCompact} />
                                ) : metric.breadth ? (
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                                        {metric.breadth.map(item => (
                                            <div key={item.label} style={{ minWidth: 0 }}>
                                                <div style={{
                                                    color: D.subtext,
                                                    fontSize: isCompact ? 9 : 10,
                                                    lineHeight: 1.2,
                                                    whiteSpace: "nowrap",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
                                                    fontWeight: 600,
                                                }}>{item.label}</div>
                                                <div style={{
                                                    color: item.color,
                                                    fontFamily: "'IBM Plex Mono', monospace",
                                                    fontSize: isCompact ? 13 : 15,
                                                    fontWeight: 800,
                                                    marginTop: 3,
                                                }}>{item.value}</div>
                                            </div>
                                        ))}
                                    </div>
                                ) : metric.sectors ? (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                                        {metric.sectors.length ? metric.sectors.map((sector, idx) => (
                                            <div key={sector.industry || idx} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                                <span style={{
                                                    width: 18,
                                                    height: 18,
                                                    borderRadius: 6,
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    flexShrink: 0,
                                                    background: withAlpha(D.accent, D.isDark ? 0.18 : 0.10),
                                                    color: D.accent,
                                                    fontFamily: "'IBM Plex Mono', monospace",
                                                    fontSize: 10,
                                                    fontWeight: 800,
                                                }}>{idx + 1}</span>
                                                <span style={{
                                                    flex: 1,
                                                    minWidth: 0,
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                    color: D.text,
                                                    fontSize: isCompact ? 11 : 12,
                                                    fontWeight: 700,
                                                }}>{sector.industry}</span>
                                                <span style={{
                                                    flexShrink: 0,
                                                    color: D.accent,
                                                    fontFamily: "'IBM Plex Mono', monospace",
                                                    fontSize: isCompact ? 12 : 13,
                                                    fontWeight: 800,
                                                }}>{sector.count}</span>
                                            </div>
                                        )) : (
                                            <div style={{ color: D.subtext, fontSize: 11 }}>waiting for RS data</div>
                                        )}
                                    </div>
                                ) : (
                                    <>
                                        <div style={{
                                            color: metric.color,
                                            fontFamily: "'IBM Plex Mono', monospace",
                                            fontSize: isCompact ? 15 : 18,
                                            fontWeight: 800,
                                            lineHeight: 1.2,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}>{metric.value}</div>
                                        <div style={{ color: D.subtext, fontSize: 11, marginTop: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{metric.sub}</div>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div style={{
                    display: "grid",
                    gridTemplateColumns: isCompact ? "repeat(2, minmax(0, 1fr))" : "repeat(6, minmax(0, 1fr))",
                    gap: 8,
                    marginTop: isCompact ? 18 : 22,
                }}>
                    {lenses.map(lens => (
                        <button key={lens.title} onClick={lens.onClick} type="button" style={{
                            minWidth: 0,
                            minHeight: isCompact ? 86 : 94,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                            gap: 10,
                            textAlign: "left",
                            borderRadius: 12,
                            border: `1px solid ${D.panelBorder}`,
                            background: D.isDark ? "rgba(15,23,42,0.54)" : "rgba(255,255,255,0.70)",
                            color: D.text,
                            cursor: "pointer",
                            padding: "12px",
                            fontFamily: "inherit",
                            transition: "transform .14s ease, border-color .14s ease, background .14s ease",
                        }}
                            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.borderColor = withAlpha(D.accent, 0.42); }}
                            onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.borderColor = D.panelBorder; }}
                        >
                            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, background: withAlpha(D.accent, D.isDark ? 0.18 : 0.10), color: D.accent }}>
                                <DashboardLensIcon type={lens.type} />
                            </span>
                            <span style={{ minWidth: 0, width: "100%" }}>
                                <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "-0.01em", fontFamily: "'IBM Plex Sans', -apple-system, sans-serif" }}>{lens.title}</span>
                                <span style={{ display: "block", fontSize: 11, color: D.subtext, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: "'IBM Plex Sans', -apple-system, sans-serif" }}>{lens.meta}</span>
                            </span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: D.accent, letterSpacing: "0.06em", textTransform: "uppercase", fontFamily: "'IBM Plex Sans', -apple-system, sans-serif" }}>{lens.action}</span>
                        </button>
                    ))}
                </div>
            </div>
        </section>
    );
}

function exportCSV(data, filename) {
    if (!data.length) return;
    const headers = Object.keys(data[0]);
    const rows = data.map(r => headers.map(h => JSON.stringify(r[h] ?? "")).join(","));
    const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
}

// â”€â”€â”€ MARKET OVERVIEW (Index Cards with Sparklines) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Exact columns from index_prices table schema, in preferred display order.
// The component will auto-skip any column whose latest value is null/missing.
const INDEX_META = [
    { key: "nifty_50", label: "Nifty 50" },
    { key: "nifty_500", label: "Nifty 500" },
    { key: "nifty_bank", label: "Nifty Bank" },
    { key: "nifty_auto", label: "Nifty Auto" },
    { key: "nifty_it", label: "Nifty IT" },
    { key: "nifty_fmcg", label: "Nifty FMCG" },
    { key: "nifty_energy", label: "Nifty Energy" },
    { key: "nifty_financial_services", label: "Nifty Financial Services" },
    { key: "nifty_pharma", label: "Nifty Pharma" },
    { key: "nifty_healthcare", label: "Nifty Healthcare" },
    { key: "nifty_midcap_100", label: "Nifty Midcap 100" },
    { key: "nifty_midcap_150", label: "Nifty Midcap 150" },
    { key: "nifty_smallcap_100", label: "Nifty Smallcap 100" },
    { key: "nifty_smallcap_250", label: "Nifty Smallcap 250" },
    { key: "nifty_midsmallcap_400", label: "Nifty MidSmallcap 400" },
    { key: "nifty_private_bank", label: "Nifty Private Bank" },
    { key: "nifty_psu_bank", label: "Nifty PSU Bank" },
    { key: "nifty_realty", label: "Nifty Realty" },
    { key: "nifty_metal", label: "Nifty Metal" },
    { key: "nifty_media", label: "Nifty Media" },
    { key: "nifty_mnc", label: "Nifty MNC" },
    { key: "nifty_infrastructure", label: "Nifty Infrastructure" },
    { key: "nifty_commodities", label: "Nifty Commodities" },
    { key: "nifty_pse", label: "Nifty PSE" },
    { key: "nifty_cpse", label: "Nifty CPSE" },
    { key: "nifty_services_sector", label: "Nifty Services Sector" },
    { key: "nifty_india_consumption", label: "Nifty India Consumption" },
    { key: "nifty_oil_gas", label: "Nifty Oil & Gas" },
    { key: "nifty_capital_markets", label: "Nifty Capital Markets" },
    { key: "nifty_housing", label: "Nifty Housing" },
    { key: "nifty_consumer_durables", label: "Nifty Consumer Durables" },
    { key: "nifty_mobility", label: "Nifty Mobility" },
    { key: "nifty_india_defence", label: "Nifty India Defence" },
    { key: "nifty_transportation_logistics", label: "Nifty Transportation & Logistics" },
    { key: "nifty_india_railways_psu", label: "Nifty India Railways PSU" },
    { key: "nifty_india_tourism", label: "Nifty India Tourism" },
    { key: "nifty_chemicals", label: "Nifty Chemicals" },
    { key: "nifty_cement", label: "Nifty Cement" },
    { key: "nifty_financial_services_ex_bank", label: "Nifty Fin Services Ex-Bank" },
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
    const lastX = pad + (W - pad * 2);
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
                    fontSize: 10,
                    color: T.muted,
                    marginBottom: 5,
                    whiteSpace: "nowrap",
                    textTransform: "uppercase",
                    letterSpacing: "0.10em",
                    fontWeight: 800,
                    fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
                }}>
                    {label}
                </div>
                <div style={{
                    fontSize: compact ? 15 : 18,
                    fontWeight: 700,
                    color: T.text,
                    fontFamily: "'IBM Plex Mono', monospace",
                    letterSpacing: "-0.03em",
                    fontVariantNumeric: "tabular-nums",
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

function MarketOverview({ T, userToken, isCompact, isTablet, isSideBySide = false, style = {} }) {
    const IDX_PATH = "index_prices?select=*&order=date.desc&limit=20";
    const IDX_TTL = 5 * 60 * 1000;

    // Seed state from cache immediately so there's no blank frame on re-visit.
    const [rows, setRows] = useState(() => {
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
    const prev = rows[1];

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
    const columnCount = (isCompact || isSideBySide) ? 1 : 2;
    const rowHeight = isCompact ? 112 : 104;
    const visibleRows = Math.ceil(Math.min(activeIndices.length, DEFAULT_VISIBLE_ITEMS) / columnCount) || 1;
    const gridMaxHeight = visibleRows * rowHeight + Math.max(visibleRows - 1, 0) * 14;

    return (
        <SectionCard T={T} style={{ padding: isCompact ? 18 : 22, marginBottom: isSideBySide ? 0 : undefined, ...style }}>
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
                        fontSize: 14,
                        fontWeight: 700,
                        letterSpacing: "-0.01em",
                        color: T.text,
                        fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
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
                {/*<span style={{*/}
                {/*    fontSize: 13,*/}
                {/*    color: T.muted,*/}
                {/*    padding: "8px 12px",*/}
                {/*    borderRadius: 999,*/}
                {/*    background: T.pillBg,*/}
                {/*    border: `1px solid ${T.pillBorder}`,*/}
                {/*    fontFamily: "'IBM Plex Mono', monospace",*/}
                {/*}}>1D returns with 15-session trend</span>*/}
            </div>

            <TabBar T={T} style={{ marginBottom: 16, flexWrap: "wrap" }}>
                <TabButton T={T} active={activeIndexTab === "core"} label="Core Indices" count={coreIndices.length} onClick={() => setActiveIndexTab("core")} />
                <TabButton T={T} active={activeIndexTab === "sectoral"} label="Sectoral Indices" count={sectoralIndices.length} onClick={() => setActiveIndexTab("sectoral")} />
            </TabBar>

            {loading ? (
                <div style={{ display: "grid", gridTemplateColumns: (isCompact || isSideBySide) ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 14, marginTop: 8 }}>
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
                        gridTemplateColumns: (isCompact || isSideBySide) ? "1fr" : "repeat(2, minmax(0, 1fr))",
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
                            fontFamily: "'IBM Plex Mono', monospace",
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
        <span style={{ display: "inline-flex", flexDirection: "column", gap: 1.5, marginLeft: 5, flexShrink: 0, opacity: dir ? 1 : 0 }}>
            <svg width="7" height="4" viewBox="0 0 7 4" fill="none" style={{ display: "block" }}>
                <path d="M3.5 0L7 4H0L3.5 0Z" fill={dir === "asc" ? "currentColor" : "rgba(100,116,139,0.35)"} />
            </svg>
            <svg width="7" height="4" viewBox="0 0 7 4" fill="none" style={{ display: "block" }}>
                <path d="M3.5 4L0 0H7L3.5 4Z" fill={dir === "desc" ? "currentColor" : "rgba(100,116,139,0.35)"} />
            </svg>
        </span>
    );
}

// ─── SHARED PREMIUM TABLE SHELL ───────────────────────────────────────────────
function PremiumTableShell({ T, children, minWidth, maxHeight, isScrollable }) {
    return (
        <div style={{
            overflowX: "auto",
            overflowY: isScrollable ? "auto" : "visible",
            maxHeight: isScrollable ? maxHeight : "none",
            borderRadius: 14,
            border: `1px solid ${T.panelBorder}`,
            background: T.isDark
                ? "linear-gradient(180deg, rgba(15,23,42,0.7) 0%, rgba(15,23,42,0.5) 100%)"
                : "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.92) 100%)",
            boxShadow: T.isDark
                ? "inset 0 1px 0 rgba(255,255,255,0.06)"
                : "inset 0 1px 0 rgba(255,255,255,0.9)",
        }}>
            <table style={{
                width: "100%",
                borderCollapse: "separate",
                borderSpacing: 0,
                minWidth,
                tableLayout: "auto",
                fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
                fontSize: 13,
            }}>
                {children}
            </table>
        </div>
    );
}

function CardHeader({ T, title, count, right, style = {} }) {
    const accentGrn = T.pos || "#10b981";
    return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 10, flexWrap: "wrap", ...style }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0, flex: 1 }}>
                <span style={{
                    fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em",
                    color: T.text, fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%",
                }}>{title}</span>
                {typeof count === "number" && (
                    <span style={{
                        fontSize: 10, fontWeight: 700, color: accentGrn,
                        padding: "2px 8px", borderRadius: 20,
                        background: withAlpha(accentGrn, T.isDark ? 0.18 : 0.10),
                        border: `1px solid ${withAlpha(accentGrn, 0.30)}`,
                        fontFamily: "'IBM Plex Mono', monospace",
                    }}>{count}</span>
                )}
            </div>
            {right}
        </div>
    );
}

function TabButton({ T, active, label, count, onClick, hideCount }) {
    const accentGrn = T.pos || "#10b981";
    return (
        <button
            onClick={onClick}
            style={{
                position: "relative",
                flex: "0 0 auto",
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                letterSpacing: active ? "0.005em" : "0.01em",
                color: active ? accentGrn : T.muted,
                background: active
                    ? T.isDark
                        ? `linear-gradient(135deg, ${withAlpha(accentGrn, 0.18)} 0%, ${withAlpha(accentGrn, 0.08)} 100%)`
                        : `linear-gradient(135deg, ${withAlpha(accentGrn, 0.12)} 0%, ${withAlpha(accentGrn, 0.05)} 100%)`
                    : "transparent",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                transition: "color 0.18s ease, background 0.18s ease",
                fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
                whiteSpace: "nowrap",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                outline: "none",
            }}
        >
            {label}
            {!hideCount && typeof count === "number" && (
                <span style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 20,
                    height: 18,
                    padding: "0 5px",
                    borderRadius: 5,
                    fontSize: 10,
                    fontWeight: 700,
                    fontFamily: "'IBM Plex Mono', monospace",
                    letterSpacing: "0.02em",
                    color: active ? accentGrn : T.muted,
                    background: active
                        ? withAlpha(accentGrn, T.isDark ? 0.22 : 0.13)
                        : withAlpha(T.muted, T.isDark ? 0.14 : 0.10),
                    transition: "background 0.18s, color 0.18s",
                }}>{count}</span>
            )}
            {/* Active indicator bar */}
            {active && (
                <span style={{
                    position: "absolute",
                    bottom: 0,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: "40%",
                    height: 2,
                    borderRadius: "2px 2px 0 0",
                    background: `linear-gradient(90deg, ${withAlpha(accentGrn, 0)}, ${accentGrn}, ${withAlpha(accentGrn, 0)})`,
                    pointerEvents: "none",
                }} />
            )}
        </button>
    );
}

// ─── TAB BAR WRAPPER (replaces bare flex div) ────────────────────────────────
// Wraps TabButtons in a consistent premium container. Use instead of the
// inline `display:flex + background + border` pattern at each call-site.
function TabBar({ T, children, style = {} }) {
    return (
        <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 2,
            padding: "4px",
            background: T.isDark
                ? "rgba(15,23,42,0.55)"
                : "rgba(248,250,252,0.90)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            borderRadius: 12,
            border: `1px solid ${T.panelBorder}`,
            boxShadow: T.isDark
                ? "inset 0 1px 0 rgba(255,255,255,0.06), 0 1px 4px rgba(0,0,0,0.18)"
                : "inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 4px rgba(15,23,42,0.06)",
            ...style,
        }}>
            {children}
        </div>
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
                padding: "48px 20px",
                textAlign: "center",
                color: T.muted,
                fontSize: 13,
                fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
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
                                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, color }}>{pct.toFixed(1)}%</div>
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
                            <div style={{ color: T.muted, fontSize: 14, fontFamily: "'IBM Plex Mono', monospace" }}>
                                {row.count}/{row.total} stocks above RS 85
                            </div>
                        </button>
                    );
                })}
            </div>
        );
    }

    const thStyle = {
        padding: "11px 16px",
        textAlign: "left",
        fontWeight: 800,
        fontSize: 10,
        color: T.muted,
        textTransform: "uppercase",
        letterSpacing: "0.10em",
        fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
        background: T.isDark ? "rgba(15,23,42,0.7)" : "rgba(248,250,252,0.95)",
        borderBottom: `1px solid ${T.panelBorder}`,
        whiteSpace: "nowrap",
        position: "sticky",
        top: 0,
        zIndex: 1,
    };

    return (
        <PremiumTableShell T={T} minWidth={520} isScrollable={data.length > DEFAULT_VISIBLE_ITEMS} maxHeight={DEFAULT_TABLE_MAX_HEIGHT}>
            <thead>
                <tr>
                    <th style={{ ...thStyle }}>Industry</th>
                    <th style={{ ...thStyle, textAlign: "right", width: 260 }}>Coverage</th>
                </tr>
            </thead>
            <tbody>
                {data.map((row, i) => {
                    const pct = row.pct || 0;
                    const color = pct >= 60 ? "#22c55e" : pct >= 35 ? "#f59e0b" : "#ef4444";
                    const isLast = i === data.length - 1;
                    return (
                        <tr
                            key={row.industry}
                            onClick={() => onIndustryClick(row.industry)}
                            style={{
                                borderBottom: isLast ? "none" : `1px solid ${T.isDark ? "rgba(51,65,85,0.5)" : "rgba(226,232,240,0.7)"}`,
                                cursor: "pointer",
                                transition: "background 0.12s ease",
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.background = T.isDark ? "rgba(255,255,255,0.04)" : "rgba(248,250,252,0.9)";
                            }}
                            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                        >
                            <td style={{ padding: "13px 16px", color: T.text, fontWeight: 500, fontSize: 13, fontFamily: "'IBM Plex Sans', -apple-system, sans-serif" }}>
                                {row.industry}
                            </td>
                            <td style={{ padding: "13px 16px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end" }}>
                                    <div style={{
                                        width: 90, height: 4, borderRadius: 999,
                                        background: T.isDark ? "rgba(71,85,105,0.4)" : "rgba(203,213,225,0.6)",
                                        overflow: "hidden", flexShrink: 0,
                                    }}>
                                        <div style={{
                                            width: `${Math.min(pct, 100)}%`,
                                            height: "100%",
                                            borderRadius: 999,
                                            background: color,
                                            transition: "width 0.5s ease",
                                        }} />
                                    </div>
                                    <span style={{
                                        fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700,
                                        fontSize: 13, color, minWidth: 40, textAlign: "right",
                                    }}>{pct.toFixed(1)}%</span>
                                    <span style={{
                                        fontFamily: "'IBM Plex Mono', monospace", fontSize: 12,
                                        color: T.muted, minWidth: 50, textAlign: "right",
                                    }}>{row.count}/{row.total}</span>
                                </div>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </PremiumTableShell>
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
                padding: "48px 20px",
                textAlign: "center",
                color: T.muted,
                fontSize: 13,
                fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
            }}>
                No stocks with RS &gt; 85 in this industry
            </div>
        );
    }

    const thBaseRT = {
        fontWeight: 800,
        fontSize: 10,
        color: T.muted,
        textTransform: "uppercase",
        letterSpacing: "0.10em",
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
        fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
        background: T.isDark ? "rgba(15,23,42,0.7)" : "rgba(248,250,252,0.95)",
        borderBottom: `1px solid ${T.panelBorder}`,
        position: "sticky",
        top: 0,
        zIndex: 1,
    };

    const RTTh = ({ k, label }) => {
        const a = k === "ticker" ? "left" : "right";
        return (
            <th onClick={() => handleSort(k)} style={{ ...thBaseRT, padding: "11px 16px", textAlign: a }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: a === "left" ? "flex-start" : "flex-end", gap: 2 }}>
                    <span style={{ color: sortKey === k ? T.text : T.muted, transition: "color 0.15s" }}>{label}</span>
                    <SortIcon dir={sortKey === k ? sortDir : null} />
                </div>
            </th>
        );
    };

    return (
        <PremiumTableShell T={T} minWidth={580} isScrollable={sorted.length > DEFAULT_VISIBLE_ITEMS} maxHeight={DEFAULT_TABLE_MAX_HEIGHT}>
            <thead>
                <tr>
                    <RTTh k="ticker" label="Ticker" />
                    <RTTh k="rs_rating" label="RS" />
                    <RTTh k="ret_3m" label="3M" />
                    <RTTh k="ret_6m" label="6M" />
                    <RTTh k="ret_12m" label="12M" />
                </tr>
            </thead>
            <tbody>
                {sorted.map((row, i) => (
                    <tr
                        key={row.ticker}
                        onClick={() => onTickerClick?.(row.ticker)}
                        style={{
                            borderBottom: i < sorted.length - 1
                                ? `1px solid ${T.isDark ? "rgba(51,65,85,0.5)" : "rgba(226,232,240,0.7)"}`
                                : "none",
                            cursor: onTickerClick ? "pointer" : "default",
                            transition: "background 0.12s ease",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = T.isDark ? "rgba(255,255,255,0.04)" : "rgba(248,250,252,0.9)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                    >
                        {/* Name + ticker cell – mirrors MoversTable layout */}
                        <td style={{ padding: "12px 16px", maxWidth: 240, minWidth: 160 }}>
                            <div style={{
                                fontWeight: 600,
                                fontSize: 13,
                                color: T.text,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                lineHeight: 1.3,
                                fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
                            }}>{row.name || row.ticker}</div>
                            {row.name && (
                                <div style={{
                                    fontFamily: "'IBM Plex Mono', monospace",
                                    fontSize: 11,
                                    color: T.muted,
                                    marginTop: 2,
                                    letterSpacing: "0.03em",
                                }}>{row.ticker}</div>
                            )}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right" }}>
                            <span style={{
                                display: "inline-block",
                                padding: "3px 9px",
                                borderRadius: 6,
                                background: withAlpha(T.pos || "#0ea67a", T.isDark ? 0.18 : 0.10),
                                border: `1px solid ${withAlpha(T.pos || "#0ea67a", 0.28)}`,
                                color: T.pos || "#0ea67a",
                                fontFamily: "'IBM Plex Mono', monospace",
                                fontWeight: 700,
                                fontSize: 13,
                                fontVariantNumeric: "tabular-nums",
                            }}>{row.rs_rating != null ? row.rs_rating : EMPTY_VALUE}</span>
                        </td>
                        {[["ret_3m", row.ret_3m], ["ret_6m", row.ret_6m], ["ret_12m", row.ret_12m]].map(([key, val]) => (
                            <td key={key} style={{
                                padding: "12px 16px",
                                textAlign: "right",
                                color: val != null ? (val >= 0 ? (T.pos || "#0ea67a") : (T.neg || "#ef4444")) : T.muted,
                                fontWeight: 600,
                                fontFamily: "'IBM Plex Mono', monospace",
                                fontSize: 13,
                            }}>{val != null ? fmtPct(val) : EMPTY_VALUE}</td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </PremiumTableShell>
    );
}


// --- ALL RS TABLE (Top 50 stocks by RS Rating from indicators) ---
function AllRsTable({ T, data, loading, onTickerClick, isCompact }) {
    const [visibleCount, setVisibleCount] = useState(MOVERS_INITIAL_ROWS);
    const [sortKey, setSortKey] = useState("rs_rating");
    const [sortDir, setSortDir] = useState("desc");

    useEffect(() => {
        setVisibleCount(MOVERS_INITIAL_ROWS);
    }, [data]);

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
    const visibleRows = useMemo(() => sorted.slice(0, visibleCount), [sorted, visibleCount]);
    const loadMoreRows = () => setVisibleCount(prev => Math.min(prev + MOVERS_LOAD_MORE_ROWS, sorted.length));

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
        if (c === "mid") return "#f59e0b";
        if (c === "small") return T.pos || "#10b981";
        return T.muted;
    };


    const thBaseAR = {
        fontWeight: 800,
        fontSize: 10,
        color: T.muted,
        textTransform: "uppercase",
        letterSpacing: "0.10em",
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
        fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
        fontVariantNumeric: "tabular-nums",
        background: T.isDark ? "rgba(15,23,42,0.7)" : "rgba(248,250,252,0.95)",
        borderBottom: `1px solid ${T.panelBorder}`,
        position: "sticky",
        top: 0,
        zIndex: 1,
    };

    const ARTh = ({ k, label, align = "right" }) => (
        <th onClick={() => handleSort(k)} style={{ ...thBaseAR, padding: "11px 16px", textAlign: align }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: align === "left" ? "flex-start" : "flex-end", gap: 2 }}>
                <span style={{ color: sortKey === k ? T.text : T.muted, transition: "color 0.15s" }}>{label}</span>
                <SortIcon dir={sortKey === k ? sortDir : null} />
            </div>
        </th>
    );

    return (
        <>
        <PremiumTableShell T={T} minWidth={660} isScrollable={visibleRows.length > DEFAULT_VISIBLE_ITEMS} maxHeight={DEFAULT_TABLE_MAX_HEIGHT}>
            <thead>
                <tr>
                    <th style={{ ...thBaseAR, padding: "11px 16px", textAlign: "left", width: 36 }}>#</th>
                    <ARTh k="name" label="Name" align="left" />
                    <ARTh k="rs_rating" label="RS" />
                    <ARTh k="ret_3m" label="3M" />
                    <ARTh k="ret_6m" label="6M" />
                    <ARTh k="ret_12m" label="12M" />
                </tr>
            </thead>
            <tbody>
                {visibleRows.map((row, i) => (
                    <tr
                        key={row.ticker}
                        onClick={() => onTickerClick?.(row.ticker)}
                        style={{
                            borderBottom: i < visibleRows.length - 1
                                ? `1px solid ${T.isDark ? "rgba(51,65,85,0.5)" : "rgba(226,232,240,0.7)"}`
                                : "none",
                            cursor: onTickerClick ? "pointer" : "default",
                            transition: "background 0.12s ease",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = T.isDark ? "rgba(255,255,255,0.035)" : "rgba(248,250,252,0.85)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                    >
                        <td style={{ padding: "12px 16px", color: T.muted, fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", textAlign: "left", width: 36, fontVariantNumeric: "tabular-nums" }}>{i + 1}</td>
                        {/* Name + ticker cell – mirrors MoversTable layout */}
                        <td style={{ padding: "12px 16px", maxWidth: 240, minWidth: 160 }}>
                            <div style={{
                                fontWeight: 600,
                                fontSize: 13,
                                color: T.text,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                lineHeight: 1.3,
                                fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
                            }}>{row.name || row.ticker}</div>
                            {row.name && (
                                <div style={{
                                    fontFamily: "'IBM Plex Mono', monospace",
                                    fontSize: 11,
                                    color: T.muted,
                                    marginTop: 2,
                                    letterSpacing: "0.03em",
                                }}>{row.ticker}</div>
                            )}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right" }}>
                            <span style={{
                                display: "inline-block",
                                padding: "3px 9px",
                                borderRadius: 6,
                                background: withAlpha(T.pos || "#0ea67a", T.isDark ? 0.18 : 0.10),
                                border: `1px solid ${withAlpha(T.pos || "#0ea67a", 0.28)}`,
                                color: T.pos || "#0ea67a",
                                fontFamily: "'IBM Plex Mono', monospace",
                                fontWeight: 700,
                                fontSize: 13,
                                fontVariantNumeric: "tabular-nums",
                            }}>{row.rs_rating != null ? row.rs_rating : EMPTY_VALUE}</span>
                        </td>
                        {[["ret_3m", row.ret_3m], ["ret_6m", row.ret_6m], ["ret_12m", row.ret_12m]].map(([key, val]) => (
                            <td key={key} style={{
                                padding: "12px 16px",
                                textAlign: "right",
                                color: val != null ? (val >= 0 ? (T.pos || "#0ea67a") : (T.neg || "#ef4444")) : T.muted,
                                fontWeight: 600,
                                fontFamily: "'IBM Plex Mono', monospace",
                                fontSize: 13,
                            }}>{val != null ? fmtPct(val) : EMPTY_VALUE}</td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </PremiumTableShell>
        <LoadMoreRowsButton T={T} visibleCount={visibleRows.length} totalCount={sorted.length} onLoadMore={loadMoreRows} />
        </>
    );
}

// â”€â”€â”€ MOVERS TABLE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function MoversTable({ T, data, loading, type, isCompact }) {
    const [visibleCount, setVisibleCount] = useState(MOVERS_INITIAL_ROWS);
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
        setVisibleCount(MOVERS_INITIAL_ROWS);
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
    const visibleRows = useMemo(() => sorted.slice(0, visibleCount), [sorted, visibleCount]);
    const loadMoreRows = () => setVisibleCount(prev => Math.min(prev + MOVERS_LOAD_MORE_ROWS, sorted.length));

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
                padding: "48px 20px",
                textAlign: "center",
                color: T.muted,
                fontSize: 13,
                fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
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
                fontWeight: 800,
                fontSize: 10,
                color: T.muted,
                textTransform: "uppercase",
                letterSpacing: "0.10em",
                cursor: "pointer",
                userSelect: "none",
                fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
                background: T.isDark ? "rgba(15,23,42,0.7)" : "rgba(248,250,252,0.95)",
                borderBottom: `1px solid ${T.panelBorder}`,
                position: "sticky",
                top: 0,
                zIndex: 1,
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
            <>
                <div style={{
                    display: "grid",
                    gap: 12,
                }}>
                    {visibleRows.map(row => {
                        const chg = row.change_pct;
                        const isPos = chg != null && chg > 0;
                        const isNeg = chg != null && chg < 0;
                        const tone = isPos ? (T.pos || "#10b981") : isNeg ? (T.neg || "#ef4444") : T.text;
                        const toneBg = isPos ? T.posSoft : isNeg ? T.negSoft : T.softFill;
                        return (
                            <div
                                key={`${type}:${row.ticker}`}
                                style={{
                                    padding: 16,
                                    borderRadius: 18,
                                    border: `1px solid ${T.panelBorder}`,
                                    background: T.pillBg,
                                }}
                            >
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        <div style={{ fontWeight: 700, fontSize: 15, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.name || row.ticker}</div>
                                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.muted, marginTop: 2 }}>{row.ticker}</div>
                                    </div>
                                    <div style={{
                                        padding: "7px 10px",
                                        borderRadius: 999,
                                        background: toneBg,
                                        color: tone,
                                        fontFamily: "'IBM Plex Mono', monospace",
                                        fontWeight: 700,
                                        fontSize: 14,
                                        flexShrink: 0,
                                    }}>
                                        {fmtPct(chg)}
                                    </div>
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginTop: 14 }}>
                                    <div>
                                        <div style={{ color: T.muted, fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", fontWeight: 800, fontFamily: "'IBM Plex Sans', -apple-system, sans-serif" }}>LTP</div>
                                        <div style={{ marginTop: 4, color: T.text, fontFamily: "'IBM Plex Mono', monospace", fontVariantNumeric: "tabular-nums" }}>{fmt(row.ltp)}</div>
                                    </div>
                                    {showDist && (
                                        <div>
                                            <div style={{ color: T.muted, fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", fontWeight: 800, fontFamily: "'IBM Plex Sans', -apple-system, sans-serif" }}>
                                                {type === "near_high" ? "From 52W High" : "From 52W Low"}
                                            </div>
                                            <div style={{ marginTop: 4, color: T.text, fontFamily: "'IBM Plex Mono', monospace" }}>
                                                {row.dist_pct != null ? `${fmt(row.dist_pct, 1)}%` : EMPTY_VALUE}
                                            </div>
                                        </div>
                                    )}
                                    <div>
                                        <div style={{ color: T.muted, fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", fontWeight: 800, fontFamily: "'IBM Plex Sans', -apple-system, sans-serif" }}>Volume</div>
                                        <div style={{ marginTop: 4, color: T.text, fontFamily: "'IBM Plex Mono', monospace", fontVariantNumeric: "tabular-nums" }}>{fmtVol(row.volume)}</div>
                                    </div>
                                    <div>
                                        <div style={{ color: T.muted, fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", fontWeight: 800, fontFamily: "'IBM Plex Sans', -apple-system, sans-serif" }}>Rel Vol</div>
                                        <div style={{
                                            marginTop: 4,
                                            fontFamily: "'IBM Plex Mono', monospace",
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
                <LoadMoreRowsButton T={T} visibleCount={visibleRows.length} totalCount={sorted.length} onLoadMore={loadMoreRows} />
            </>
        );
    }

    const thBase = {
        fontWeight: 800,
        fontSize: 10,
        color: T.muted,
        textTransform: "uppercase",
        letterSpacing: "0.10em",
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
        fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
        background: T.isDark ? "rgba(15,23,42,0.7)" : "rgba(248,250,252,0.95)",
        borderBottom: `1px solid ${T.panelBorder}`,
        position: "sticky",
        top: 0,
        zIndex: 1,
    };

    const MTh = ({ k, label, align }) => {
        const a = align || (k === "ticker" || k === "name" ? "left" : "right");
        return (
            <th onClick={() => handleSort(k)} style={{ ...thBase, padding: "11px 16px", textAlign: a }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: a === "left" ? "flex-start" : "flex-end", gap: 2 }}>
                    <span style={{ color: sortKey === k ? T.text : T.muted, transition: "color 0.15s" }}>{label}</span>
                    <SortIcon dir={sortKey === k ? sortDir : null} />
                </div>
            </th>
        );
    };

    return (
        <>
        <PremiumTableShell T={T} minWidth={showDist ? 820 : 680} isScrollable={visibleRows.length > DEFAULT_VISIBLE_ITEMS} maxHeight={DEFAULT_TABLE_MAX_HEIGHT}>
            <thead>
                <tr>
                    <MTh k="name" label="Name" />
                    <MTh k="ltp" label="LTP" />
                    <MTh k="change_pct" label="Chg %" />
                    {showDist && <MTh k="dist_pct" label={type === "near_high" ? "From High" : "From Low"} />}
                    <MTh k="volume" label="Volume" />
                    <MTh k="rel_volume" label="Rel Vol" />
                </tr>
            </thead>
            <tbody>
                {visibleRows.map((row, i) => {
                    const chg = row.change_pct;
                    const isPos = chg != null && chg > 0;
                    const isNeg = chg != null && chg < 0;
                    const chgColor = isPos ? (T.pos || "#0ea67a") : isNeg ? (T.neg || "#ef4444") : T.muted;
                    const relVol = row.rel_volume;
                    const relVolColor = relVol == null ? T.muted
                        : relVol >= 2 ? (T.pos || "#10b981")
                            : relVol >= 1.5 ? "#f59e0b"
                                : T.text;

                    return (
                        <tr
                            key={`${type}:${row.ticker}`}
                            style={{
                                borderBottom: i < visibleRows.length - 1
                                    ? `1px solid ${T.isDark ? "rgba(51,65,85,0.5)" : "rgba(226,232,240,0.7)"}`
                                    : "none",
                                transition: "background 0.12s ease",
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = T.isDark ? "rgba(255,255,255,0.04)" : "rgba(248,250,252,0.9)"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                        >
                            {/* Name cell */}
                            <td style={{ padding: "12px 16px", maxWidth: 240, minWidth: 160 }}>
                                <div style={{
                                    fontWeight: 600,
                                    fontSize: 13,
                                    color: T.text,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    lineHeight: 1.3,
                                    fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
                                }}>{row.name || row.ticker}</div>
                                {row.name && (
                                    <div style={{
                                        fontFamily: "'IBM Plex Mono', monospace",
                                        fontSize: 11,
                                        color: T.muted,
                                        marginTop: 2,
                                        letterSpacing: "0.03em",
                                    }}>{row.ticker}</div>
                                )}
                            </td>
                            {/* LTP */}
                            <td style={{
                                padding: "12px 16px",
                                textAlign: "right",
                                color: T.text,
                                fontFamily: "'IBM Plex Mono', monospace",
                                fontSize: 13,
                                fontWeight: 500,
                                whiteSpace: "nowrap",
                                fontVariantNumeric: "tabular-nums",
                            }}>{fmt(row.ltp)}</td>
                            {/* Chg % — pill badge */}
                            <td style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                                <span style={{
                                    display: "inline-block",
                                    padding: "3px 8px",
                                    borderRadius: 6,
                                    background: isPos
                                        ? withAlpha(T.pos || "#0ea67a", T.isDark ? 0.18 : 0.10)
                                        : isNeg
                                            ? withAlpha(T.neg || "#ef4444", T.isDark ? 0.18 : 0.10)
                                            : withAlpha(T.muted, 0.10),
                                    color: chgColor,
                                    fontFamily: "'IBM Plex Mono', monospace",
                                    fontWeight: 700,
                                    fontSize: 13,
                                    minWidth: 64,
                                    textAlign: "right",
                                }}>{fmtPct(chg)}</span>
                            </td>
                            {/* From high/low */}
                            {showDist && (
                                <td style={{
                                    padding: "12px 16px",
                                    textAlign: "right",
                                    color: T.text,
                                    fontFamily: "'IBM Plex Mono', monospace",
                                    fontSize: 13,
                                }}>{row.dist_pct != null ? `${fmt(row.dist_pct, 1)}%` : EMPTY_VALUE}</td>
                            )}
                            {/* Volume */}
                            <td style={{
                                padding: "12px 16px",
                                textAlign: "right",
                                color: T.subtext,
                                fontFamily: "'IBM Plex Mono', monospace",
                                fontSize: 13,
                            }}>{fmtVol(row.volume)}</td>
                            {/* Rel Vol */}
                            <td style={{
                                padding: "12px 16px",
                                textAlign: "right",
                                fontFamily: "'IBM Plex Mono', monospace",
                                fontWeight: 600,
                                fontSize: 13,
                                color: relVolColor,
                            }}>
                                {relVol != null ? `${relVol.toFixed(2)}x` : EMPTY_VALUE}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </PremiumTableShell>
        <LoadMoreRowsButton T={T} visibleCount={visibleRows.length} totalCount={sorted.length} onLoadMore={loadMoreRows} />
        </>
    );
}


// ─── VOLUME SHOCKERS TABLE ───────────────────────────────────────────────────
function VolumeShockersTable({ T, data, loading, isCompact }) {
    const [visibleCount, setVisibleCount] = useState(MOVERS_INITIAL_ROWS);
    const [sortKey, setSortKey] = useState("volume_ratio");
    const [sortDir, setSortDir] = useState("desc");

    const handleSort = key => {
        if (sortKey === key) {
            setSortDir(prev => prev === "asc" ? "desc" : "asc");
        } else {
            setSortKey(key);
            setSortDir("desc");
        }
        setVisibleCount(MOVERS_INITIAL_ROWS);
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
    const visibleRows = useMemo(() => sorted.slice(0, visibleCount), [sorted, visibleCount]);
    const loadMoreRows = () => setVisibleCount(prev => Math.min(prev + MOVERS_LOAD_MORE_ROWS, sorted.length));

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
                No volume shockers available
            </div>
        );
    }

    const Th = ({ k, label }) => (
        <th
            onClick={() => handleSort(k)}
            style={{
                padding: "12px 14px",
                textAlign: k === "ticker" || k === "name" ? "left" : "right",
                fontWeight: 800,
                fontSize: 10,
                color: T.muted,
                textTransform: "uppercase",
                letterSpacing: "0.10em",
                cursor: "pointer",
                userSelect: "none",
                fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
                background: T.isDark ? "rgba(15,23,42,0.7)" : "rgba(248,250,252,0.95)",
                borderBottom: `1px solid ${T.panelBorder}`,
                position: "sticky",
                top: 0,
                zIndex: 1,
            }}
        >
            <div style={{ display: "flex", alignItems: "center", justifyContent: k === "ticker" || k === "name" ? "flex-start" : "flex-end" }}>
                {label}
                <SortIcon dir={sortKey === k ? sortDir : null} />
            </div>
        </th>
    );

    if (isCompact) {
        return (
            <>
                <div style={{
                    display: "grid",
                    gap: 12,
                }}>
                    {visibleRows.map(row => {
                        const chg = row.change_pct;
                        const isPos = chg != null && chg > 0;
                        const isNeg = chg != null && chg < 0;
                        const tone = isPos ? (T.pos || "#10b981") : isNeg ? (T.neg || "#ef4444") : T.text;
                        const toneBg = isPos ? T.posSoft : isNeg ? T.negSoft : T.softFill;
                        return (
                            <div key={`volume_shockers:${row.ticker}`} style={{
                                padding: 16,
                                borderRadius: 18,
                                border: `1px solid ${T.panelBorder}`,
                                background: T.pillBg,
                            }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        <div style={{ fontWeight: 700, fontSize: 15, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.name || row.ticker}</div>
                                        {row.name && <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.muted, marginTop: 2 }}>{row.ticker}</div>}
                                    </div>
                                    <div style={{ padding: "7px 10px", borderRadius: 999, background: toneBg, color: tone, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                                        {fmtPct(chg)}
                                    </div>
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginTop: 14 }}>
                                    <div>
                                        <div style={{ color: T.muted, fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", fontWeight: 800, fontFamily: "'IBM Plex Sans', -apple-system, sans-serif" }}>LTP</div>
                                        <div style={{ marginTop: 4, color: T.text, fontFamily: "'IBM Plex Mono', monospace", fontVariantNumeric: "tabular-nums" }}>{fmt(row.close)}</div>
                                    </div>
                                    <div>
                                        <div style={{ color: T.muted, fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", fontWeight: 800, fontFamily: "'IBM Plex Sans', -apple-system, sans-serif" }}>Volume</div>
                                        <div style={{ marginTop: 4, color: T.text, fontFamily: "'IBM Plex Mono', monospace", fontVariantNumeric: "tabular-nums" }}>{fmtVol(row.today_volume)}</div>
                                    </div>
                                    <div>
                                        <div style={{ color: T.muted, fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", fontWeight: 800, fontFamily: "'IBM Plex Sans', -apple-system, sans-serif" }}>Rel Vol</div>
                                        <div style={{
                                            marginTop: 4,
                                            fontFamily: "'IBM Plex Mono', monospace",
                                            fontWeight: 600,
                                            color: row.volume_ratio == null ? T.muted
                                                : row.volume_ratio >= 10 ? (T.pos || "#10b981")
                                                    : row.volume_ratio >= 5 ? "#f59e0b"
                                                        : T.text,
                                        }}>
                                            {row.volume_ratio != null ? `${Number(row.volume_ratio).toFixed(2)}x` : EMPTY_VALUE}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <LoadMoreRowsButton T={T} visibleCount={visibleRows.length} totalCount={sorted.length} onLoadMore={loadMoreRows} />
            </>
        );
    }

    const thBase = {
        fontWeight: 800,
        fontSize: 10,
        color: T.muted,
        textTransform: "uppercase",
        letterSpacing: "0.10em",
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
        fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
        background: T.isDark ? "rgba(15,23,42,0.7)" : "rgba(248,250,252,0.95)",
        borderBottom: `1px solid ${T.panelBorder}`,
        position: "sticky",
        top: 0,
        zIndex: 1,
    };

    const VTh = ({ k, label }) => {
        const a = (k === "ticker" || k === "name") ? "left" : "right";
        return (
            <th onClick={() => handleSort(k)} style={{ ...thBase, padding: "11px 16px", textAlign: a }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: a === "left" ? "flex-start" : "flex-end", gap: 2 }}>
                    <span style={{ color: sortKey === k ? T.text : T.muted, transition: "color 0.15s" }}>{label}</span>
                    <SortIcon dir={sortKey === k ? sortDir : null} />
                </div>
            </th>
        );
    };

    return (
        <>
        <PremiumTableShell T={T} minWidth={680} isScrollable={visibleRows.length > DEFAULT_VISIBLE_ITEMS} maxHeight={DEFAULT_TABLE_MAX_HEIGHT}>
            <thead>
                <tr>
                    <VTh k="name" label="Name" />
                    <VTh k="close" label="LTP" />
                    <VTh k="change_pct" label="Chg %" />
                    <VTh k="today_volume" label="Volume" />
                    <VTh k="volume_ratio" label="Rel Vol" />
                </tr>
            </thead>
            <tbody>
                {visibleRows.map((row, i) => {
                    const chg = row.change_pct;
                    const isPos = chg != null && chg > 0;
                    const isNeg = chg != null && chg < 0;
                    const chgColor = isPos ? (T.pos || "#0ea67a") : isNeg ? (T.neg || "#ef4444") : T.muted;
                    const vr = row.volume_ratio;
                    const vrColor = vr == null ? T.muted
                        : vr >= 10 ? (T.pos || "#10b981")
                            : vr >= 5 ? "#f59e0b"
                                : T.text;

                    return (
                        <tr
                            key={`volume_shockers:${row.ticker}`}
                            style={{
                                borderBottom: i < visibleRows.length - 1
                                    ? `1px solid ${T.isDark ? "rgba(51,65,85,0.5)" : "rgba(226,232,240,0.7)"}`
                                    : "none",
                                transition: "background 0.12s ease",
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = T.isDark ? "rgba(255,255,255,0.04)" : "rgba(248,250,252,0.9)"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                        >
                            <td style={{ padding: "12px 16px", maxWidth: 240, minWidth: 160 }}>
                                <div style={{ fontWeight: 600, fontSize: 13, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.3, fontFamily: "'IBM Plex Sans', -apple-system, sans-serif" }}>{row.name || row.ticker}</div>
                                {row.name && <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: T.muted, marginTop: 2, letterSpacing: "0.03em" }}>{row.ticker}</div>}
                            </td>
                            <td style={{ padding: "12px 16px", textAlign: "right", color: T.text, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{fmt(row.close)}</td>
                            <td style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                                <span style={{
                                    display: "inline-block",
                                    padding: "3px 8px",
                                    borderRadius: 6,
                                    background: isPos
                                        ? withAlpha(T.pos || "#0ea67a", T.isDark ? 0.18 : 0.10)
                                        : isNeg
                                            ? withAlpha(T.neg || "#ef4444", T.isDark ? 0.18 : 0.10)
                                            : withAlpha(T.muted, 0.10),
                                    color: chgColor,
                                    fontFamily: "'IBM Plex Mono', monospace",
                                    fontWeight: 700,
                                    fontSize: 13,
                                    minWidth: 64,
                                    textAlign: "right",
                                }}>{fmtPct(chg)}</span>
                            </td>
                            <td style={{ padding: "12px 16px", textAlign: "right", color: T.subtext, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}>{fmtVol(row.today_volume)}</td>
                            <td style={{ padding: "12px 16px", textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 13, color: vrColor }}>
                                {vr != null ? `${Number(vr).toFixed(2)}x` : EMPTY_VALUE}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </PremiumTableShell>
        <LoadMoreRowsButton T={T} visibleCount={visibleRows.length} totalCount={sorted.length} onLoadMore={loadMoreRows} />
        </>
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

/** Returns true if a row should be excluded because it is an ETF. */
function isETF(r) {
    const etfRe = /etf/i;
    return etfRe.test(r.ticker || "") || etfRe.test(r.name || "");
}

/** Build the four mover lists from raw market_movers + stock_52w rows. */
function deriveMovers(moversData, stock52wRows, allowedSet = getAllowedTickerSetSync()) {
    const volMa20Map = new Map((stock52wRows || []).map(r => [r.ticker, Number(r.volume_ma20) || null]));
    const enriched = (moversData || []).map(p => {
        const vol = p.volume != null ? Number(p.volume) : null;
        const ma20 = volMa20Map.get(p.symbol) || null;
        const rel_volume = vol != null && ma20 != null && ma20 > 0 ? vol / ma20 : null;
        return {
            ticker: p.symbol,
            name: _nameMap.get(p.symbol) || null,
            ltp: Number(p.ltp) || 0,
            volume: p.volume,
            rel_volume,
            change_pct: Number(p.pchange) ?? null,
            dist_high: Number(p.pct_from_high) ?? null,
            dist_low: Number(p.pct_from_low) ?? null,
            dist_pct: Number(p.pct_from_high) ?? null,
            rank_gainer: p.rank_gainer,
            rank_loser: p.rank_loser,
            near_high: p.near_high,
            near_low: p.near_low,
        };
    });
    // Filter out stocks with gain > 50% (outliers) or loss > 20% (circuit filters)
    const validGainer = r => r.change_pct == null || r.change_pct <= 50;
    const validLoser = r => r.change_pct == null || r.change_pct >= -20;
    const validBoth = r => validGainer(r) && validLoser(r);
    const canKeep = r => isAllowedTicker(r.ticker, allowedSet);
    return {
        gainers: enriched.filter(r => r.rank_gainer != null && validGainer(r) && !isETF(r) && canKeep(r)).sort((a, b) => (a.rank_gainer || 9999) - (b.rank_gainer || 9999)).slice(0, 100),
        losers: enriched.filter(r => r.rank_loser != null && validLoser(r) && !isETF(r) && canKeep(r)).sort((a, b) => (a.rank_loser || 9999) - (b.rank_loser || 9999)).slice(0, 100),
        nearHigh: enriched.filter(r => r.near_high === true && validBoth(r) && !isETF(r) && canKeep(r)).map(r => ({ ...r, dist_pct: r.dist_high })).sort((a, b) => (b.dist_high || -999) - (a.dist_high || -999)).slice(0, 100),
        nearLow: enriched.filter(r => r.near_low === true && validBoth(r) && !isETF(r) && canKeep(r)).map(r => ({ ...r, dist_pct: r.dist_low })).sort((a, b) => (a.dist_low || 999) - (b.dist_low || 999)).slice(0, 100),
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
function enrichRsStocks(tirsData, returnsMap, allowedSet = getAllowedTickerSetSync()) {
    return (tirsData || []).filter(row => isAllowedTicker(row.ticker, allowedSet)).map(row => {
        const ret = returnsMap.get(row.ticker);
        return {
            ticker: row.ticker,
            industry: normalizeIndustryName(row.industry),
            rs_rating: row.rs_rating,
            name: null,
            ret_3m: ret?.ret_3m ?? null,
            ret_6m: ret?.ret_6m ?? null,
            ret_12m: ret?.ret_12m ?? null,
        };
    });
}

async function warmStockDashboardCaches(userToken) {
    if (_stockDashboardWarmPromise) return _stockDashboardWarmPromise;

    // Fetch only ranked rows at the DB level — avoids pulling 10k rows client-side.
    // Gainers+losers: rank_gainer/rank_loser not null; near_high/near_low: boolean flag.
    // Three small queries (~200 rows each) replace one massive limit=10000 query.
    const MOVERS_GAINERS_PATH = "market_movers?select=symbol,ltp,pchange,volume,high_52w,low_52w,pct_from_high,pct_from_low,near_high,near_low,rank_gainer,rank_loser,created_at&rank_gainer=not.is.null&order=rank_gainer.asc&limit=200";
    const MOVERS_LOSERS_PATH  = "market_movers?select=symbol,ltp,pchange,volume,high_52w,low_52w,pct_from_high,pct_from_low,near_high,near_low,rank_gainer,rank_loser,created_at&rank_loser=not.is.null&order=rank_loser.asc&limit=200";
    const MOVERS_BREADTH_PATH = "market_movers?select=symbol,ltp,pchange,volume,high_52w,low_52w,pct_from_high,pct_from_low,near_high,near_low,rank_gainer,rank_loser,created_at&or=(near_high.eq.true,near_low.eq.true)&limit=500";
    // Legacy single-path key kept for cache compatibility — points to gainers query (primary).
    const MOVERS_PATH = MOVERS_GAINERS_PATH;
    const STOCK52W_PATH = "stock_52w?select=ticker,volume_ma20";
    const MOVERS_TTL = 5 * 60 * 1000;

    const TIRS_RS85_PATH = "ticker_industry_rs?select=ticker,industry,rs_rating&rs_rating=gte.85&order=rs_rating.desc.nullslast,ticker.asc";
    const TIRS_ALL_PATH = "ticker_industry_rs?select=industry&order=industry.asc";
    const RETURNS_PATH = "stock_returns?select=ticker,latest_date,ret_3m,ret_6m,ret_12m&order=ticker.asc,latest_date.desc";
    const RS_SUMMARY_CACHE_KEY = "dashboard-rs-industry-summary-v1";
    const ALL_RS_STOCKS_CACHE_KEY = "dashboard-all-rs-stocks-v1";
    const RS_TTL = 60 * 60 * 1000;
    const RETURNS_TTL = 10 * 60 * 1000;
    const ALL_RS_LATEST_DATE_PATH = "indicators?select=date&order=date.desc&limit=1";
    const ALL_RS_TTL = 10 * 60 * 1000;

    const headers = userToken ? userToken : null;

    _stockDashboardWarmPromise = (async () => {
        try {
            const allowedSetPromise = ensureAllowedTickerSet();
            // Three targeted fetches replace one 10k-row query — run fully in parallel
            const moversPromise = Promise.all([
                sbFetch(MOVERS_GAINERS_PATH, headers, { ttl: MOVERS_TTL }).catch(() => []),
                sbFetch(MOVERS_LOSERS_PATH,  headers, { ttl: MOVERS_TTL }).catch(() => []),
                sbFetch(MOVERS_BREADTH_PATH, headers, { ttl: MOVERS_TTL }).catch(() => []),
            ]).then(([g, l, b]) => {
                // Merge and deduplicate by symbol — each row is identical across queries
                const seen = new Set();
                const merged = [];
                for (const row of [...(g||[]), ...(l||[]), ...(b||[])]) {
                    if (row?.symbol && !seen.has(row.symbol)) { seen.add(row.symbol); merged.push(row); }
                }
                return merged;
            });
            const stock52wPromise = sbFetchAll(STOCK52W_PATH, headers, { ttl: RETURNS_TTL }).catch(() => []);
            const tirsRsPromise = sbFetchAll(TIRS_RS85_PATH, headers, { ttl: RS_TTL }).catch(() => []);
            const tirsAllPromise = sbFetchAll(TIRS_ALL_PATH, headers, { ttl: RS_TTL }).catch(() => []);
            const returnsPromise = sbFetchAll(RETURNS_PATH, headers, { ttl: RETURNS_TTL }).catch(() => []);
            const latestDatePromise = sbFetch(ALL_RS_LATEST_DATE_PATH, headers, { ttl: ALL_RS_TTL }).catch(() => []);

            const [moversData, stock52wRows, tirsRsRows, tirsAllRows, returnsRows, latestDateRows] = await Promise.all([
                moversPromise,
                stock52wPromise,
                tirsRsPromise,
                tirsAllPromise,
                returnsPromise,
                latestDatePromise,
            ]);
            const allowedSet = await allowedSetPromise;

            if (Array.isArray(moversData) && moversData.length > 0 && Array.isArray(stock52wRows) && stock52wRows.length > 0) {
                const derived = deriveMovers(moversData, stock52wRows, allowedSet);
                cacheSet(MOVERS_PATH, moversData, MOVERS_TTL);
                cacheSet(STOCK52W_PATH, stock52wRows, RETURNS_TTL);
                void derived;
            }

            if (Array.isArray(tirsRsRows) && tirsRsRows.length > 0 && Array.isArray(tirsAllRows) && tirsAllRows.length > 0 && Array.isArray(returnsRows) && returnsRows.length > 0) {
                const retMap = buildReturnsMap(returnsRows);
                const rsStocks = enrichRsStocks(tirsRsRows, retMap, allowedSet).filter(r => !isETF(r));
                const industryTotals = new Map();
                const uniqueIndustries = new Set();
                (tirsAllRows || []).forEach(r => {
                    const key = normalizeIndustryKey(r.industry);
                    if (key) industryTotals.set(key, (industryTotals.get(key) || 0) + 1);
                });
                (tirsRsRows || []).forEach(r => {
                    const name = normalizeIndustryName(r.industry);
                    if (name) uniqueIndustries.add(name);
                });
                const rsSummary = [...uniqueIndustries].sort().map(industry => {
                    const key = normalizeIndustryKey(industry);
                    const count = (tirsRsRows || []).filter(r => normalizeIndustryKey(r.industry) === key).length;
                    const total = industryTotals.get(key) || count;
                    return { industry, count, total, pct: total > 0 ? (count / total) * 100 : 0 };
                }).sort((a, b) => (b.count || 0) - (a.count || 0) || a.industry.localeCompare(b.industry));
                persistentCacheSet(RS_SUMMARY_CACHE_KEY, rsSummary, RS_TTL);
                cacheSet(TIRS_RS85_PATH, tirsRsRows, RS_TTL);
                cacheSet(TIRS_ALL_PATH, tirsAllRows, RS_TTL);
                cacheSet(RETURNS_PATH, returnsRows, RETURNS_TTL);
                void rsStocks;
            }

            const latestDate = latestDateRows?.[0]?.date;
                if (latestDate) {
                    const allRsPath = `indicators?select=ticker,rs_rating,rs_score,cap_category&date=eq.${latestDate}&exchange=eq.NSE&rs_rating=gte.85&order=rs_rating.desc.nullslast`;
                    const [indicatorsHighRS, allReturnsRows] = await Promise.all([
                        sbFetch(allRsPath, headers, { ttl: ALL_RS_TTL }).catch(() => []),
                        returnsPromise,
                    ]);
                    if (Array.isArray(indicatorsHighRS) && indicatorsHighRS.length > 0 && Array.isArray(allReturnsRows) && allReturnsRows.length > 0) {
                        const returnsMap = buildReturnsMap(allReturnsRows);
                        const enriched = (indicatorsHighRS || []).filter(r => isAllowedTicker(r.ticker, allowedSet)).map((r, idx) => {
                            const ret = returnsMap.get(r.ticker);
                            return {
                                ticker: r.ticker,
                            name: null,
                            rs_rating: r.rs_rating,
                            rs_score: r.rs_score,
                            cap_category: r.cap_category,
                            rank: idx + 1,
                            ret_3m: ret?.ret_3m ?? null,
                            ret_6m: ret?.ret_6m ?? null,
                            ret_12m: ret?.ret_12m ?? null,
                        };
                    });
                    persistentCacheSet(ALL_RS_STOCKS_CACHE_KEY, enriched, ALL_RS_TTL);
                    cacheSet(allRsPath, indicatorsHighRS, ALL_RS_TTL);
                }
            }
        } catch (err) {
            console.warn("[StockDashboard warmup] failed:", err);
        } finally {
            _stockDashboardWarmPromise = null;
        }
    })();

    return _stockDashboardWarmPromise;
}

export default function StockDashboard({ T, userToken, onTickerClick, onLogin, onNavigate }) {
    const D = useMemo(() => buildDashboardTheme(T), [T]);
    const { isCompact, isTablet } = useViewportFlags();
    // â”€â”€â”€ STATE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);

    // ── Cache-key constants (same paths used in sbFetch calls below) ──────────
    // Three targeted queries replace the old limit=10000 single fetch:
    //   • GAINERS_PATH  – rows with rank_gainer set (top gainers)
    //   • LOSERS_PATH   – rows with rank_loser set (top losers)
    //   • BREADTH_PATH  – rows flagged near_high or near_low
    // Each query returns at most ~200–500 rows vs 10 000, cutting payload ~10x.
    const MOVERS_GAINERS_PATH = "market_movers?select=symbol,ltp,pchange,volume,high_52w,low_52w,pct_from_high,pct_from_low,near_high,near_low,rank_gainer,rank_loser,created_at&rank_gainer=not.is.null&order=rank_gainer.asc&limit=200";
    const MOVERS_LOSERS_PATH  = "market_movers?select=symbol,ltp,pchange,volume,high_52w,low_52w,pct_from_high,pct_from_low,near_high,near_low,rank_gainer,rank_loser,created_at&rank_loser=not.is.null&order=rank_loser.asc&limit=200";
    const MOVERS_BREADTH_PATH = "market_movers?select=symbol,ltp,pchange,volume,high_52w,low_52w,pct_from_high,pct_from_low,near_high,near_low,rank_gainer,rank_loser,created_at&or=(near_high.eq.true,near_low.eq.true)&limit=500";
    // Alias used for cache seeding / backward compat (points to primary gainers key)
    const MOVERS_PATH = MOVERS_GAINERS_PATH;
    const STOCK52W_PATH = "stock_52w?select=ticker,volume_ma20";
    const MOVERS_TTL = 5 * 60 * 1000;

    const TIRS_RS85_PATH = "ticker_industry_rs?select=ticker,industry,rs_rating&rs_rating=gte.85&order=rs_rating.desc.nullslast,ticker.asc";
    const TIRS_ALL_PATH = "ticker_industry_rs?select=industry&order=industry.asc";
    const RETURNS_PATH = "stock_returns?select=ticker,latest_date,ret_3m,ret_6m,ret_12m&order=ticker.asc,latest_date.desc";
    const BREADTH_LATEST_PATH = "market_breadth?exchange=eq.NSE&select=date,above_sma50,above_sma200,near_52w_high,near_52w_low&order=date.desc&limit=1";
    const RS_SUMMARY_CACHE_KEY = "dashboard-rs-industry-summary-v1";
    const ALL_RS_STOCKS_CACHE_KEY = "dashboard-all-rs-stocks-v1";
    const RS_TTL = 60 * 60 * 1000;
    const RETURNS_TTL = 10 * 60 * 1000;
    // Fetch top 100 directly from indicators table (matches DB query: ORDER BY rs_rating DESC)
    // We first get the latest date, then query that date + NSE only to avoid BSE duplicates
    const ALL_RS_LATEST_DATE_PATH = "indicators?select=date&order=date.desc&limit=1";
    const ALL_RS_TTL = 10 * 60 * 1000;

    // ── Market Movers – seed from cache so first paint is instant ────────────
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const _cachedMovers = useMemo(() => {
        const hit = cacheGet(MOVERS_PATH, MOVERS_TTL);
        return hit ? hit.data || [] : null;
    }, []); // run once at mount

    const _derivedMovers = useMemo(() => {
        if (!_cachedMovers) return null;
        const s52Hit = cacheGet(STOCK52W_PATH, RETURNS_TTL);
        const s52Rows = s52Hit ? s52Hit.data || [] : (cacheGetAllPages(STOCK52W_PATH, RETURNS_TTL) || []);
        return deriveMovers(_cachedMovers, s52Rows);
    }, [_cachedMovers]); // eslint-disable-line react-hooks/exhaustive-deps

    // Apply names from the global map at init – if map is warm (revisit), names appear instantly.
    const [gainers, setGainers] = useState(() => applyNamesFromMap(_derivedMovers?.gainers || []));
    const [losers, setLosers] = useState(() => applyNamesFromMap(_derivedMovers?.losers || []));
    const [nearHigh, setNearHigh] = useState(() => applyNamesFromMap(_derivedMovers?.nearHigh || []));
    const [nearLow, setNearLow] = useState(() => applyNamesFromMap(_derivedMovers?.nearLow || []));
    const [volumeShockers, setVolumeShockers] = useState(() => {
        // Seed from cache so the Volume Shockers tab renders instantly on revisit
        const VS_PATH = "volume_shocker?select=ticker,exchange,date,open,high,low,close,today_volume,avg_volume_20d,volume_ratio&order=volume_ratio.desc.nullslast&limit=100";
        const hit = cacheGet(VS_PATH, 5 * 60 * 1000);
        if (!hit || !Array.isArray(hit.data)) return [];
        const allowedSet = getAllowedTickerSetSync();
        return applyNamesFromMap(hit.data.map(r => ({
            ...r,
            name: _nameMap.get(r.ticker) || null,
            change_pct: r.open > 0 ? ((r.close - r.open) / r.open) * 100 : null,
        })).filter(r => !isETF(r) && isAllowedTicker(r.ticker, allowedSet)));
    });
    const [loadingVolumeShockers, setLoadingVolumeShockers] = useState(() => {
        const VS_PATH = "volume_shocker?select=ticker,exchange,date,open,high,low,close,today_volume,avg_volume_20d,volume_ratio&order=volume_ratio.desc.nullslast&limit=100";
        const hit = cacheGet(VS_PATH, 5 * 60 * 1000);
        return !(hit && Array.isArray(hit.data) && hit.data.length > 0);
    });

    const [breadthSnapshot, setBreadthSnapshot] = useState(() => {
        const hit = cacheGet(BREADTH_LATEST_PATH, MOVERS_TTL);
        return hit?.data?.[0] || null;
    });

    // ── FII / DII daily flow ─────────────────────────────────────────────────
    const FII_DII_PATH = "fii_dii_activity?select=date,fii_buy,fii_sell,fii_net,dii_buy,dii_sell,dii_net&order=date.desc&limit=10";
    const FII_DII_TTL = 30 * 60 * 1000;
    const [fiiDiiData, setFiiDiiData] = useState(() => {
        const hit = cacheGet(FII_DII_PATH, FII_DII_TTL);
        return hit?.data || [];
    });
    // Only show skeleton if there's truly nothing cached
    const [loadingMovers, setLoadingMovers] = useState(() => !_derivedMovers);
    const [activeMoversTab, setActiveMoversTab] = useState("gainers");
    const [activeMobilePanel, setActiveMobilePanel] = useState("pulse");

    // ── RS stocks – seed from cache ──────────────────────────────────────────
    const _cachedRs = useMemo(() => {
        const hit = cacheGet(TIRS_RS85_PATH, RS_TTL);
        return hit ? hit.data || [] : cacheGetAllPages(TIRS_RS85_PATH, RS_TTL);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const [rsStocks, setRsStocks] = useState(() => {
        if (!_cachedRs) return [];
        const retHit = cacheGet(RETURNS_PATH, RETURNS_TTL);
        const retRows = retHit ? retHit.data || [] : (cacheGetAllPages(RETURNS_PATH, RETURNS_TTL) || []);
        const retMap = buildReturnsMap(retRows);
        return enrichRsStocks(_cachedRs, retMap, getAllowedTickerSetSync()).filter(r => !isETF(r));
    });
    const [loadingRs, setLoadingRs] = useState(() => !_cachedRs);
    const [industry, setIndustry] = useState("");
    const [searchTerm, setSearchTerm] = useState("");

    // ── Top 100 RS stocks directly from indicators table ──────────────────────
    const [allRsStocks, setAllRsStocks] = useState(() => {
        const hit = persistentCacheGet(ALL_RS_STOCKS_CACHE_KEY, ALL_RS_TTL);
        if (!hit?.data?.length) return [];
        // Apply names from global map – instant on any revisit where bhav cache is warm
        return applyNamesFromMap(hit.data).filter(r => !isETF(r) && isAllowedTicker(r.ticker, getAllowedTickerSetSync()));
    });
    const [loadingAllRs, setLoadingAllRs] = useState(() => {
        const hit = persistentCacheGet(ALL_RS_STOCKS_CACHE_KEY, ALL_RS_TTL);
        return !hit?.data?.length;
    });
    const [industries, setIndustries] = useState(() => {
        const hit = cacheGet(TIRS_ALL_PATH, RS_TTL);
        const rows = hit ? hit.data || [] : (cacheGetAllPages(TIRS_ALL_PATH, RS_TTL) || []);
        if (!rows.length) return [];
        return [...new Set(rows.map(r => normalizeIndustryName(r.industry)).filter(Boolean))].sort();
    });
    const [loadingIndustries, setLoadingIndustries] = useState(() => {
        const hit = cacheGet(TIRS_ALL_PATH, RS_TTL);
        return !(hit || cacheGetAllPages(TIRS_ALL_PATH, RS_TTL));
    });
    const [industryTotals, setIndustryTotals] = useState(() => {
        const hit = cacheGet(TIRS_ALL_PATH, RS_TTL);
        const rows = hit ? hit.data || [] : (cacheGetAllPages(TIRS_ALL_PATH, RS_TTL) || []);
        if (!rows.length) return new Map();
        const m = new Map();
        rows.forEach(r => {
            const key = normalizeIndustryKey(r.industry);
            if (key) m.set(key, (m.get(key) || 0) + 1);
        });
        return m;
    }); // total stocks per industry (all ratings)
    const [cachedRsIndustrySummary, setCachedRsIndustrySummary] = useState(() => {
        const hit = persistentCacheGet(RS_SUMMARY_CACHE_KEY, RS_TTL);
        return hit?.data || [];
    });

    // RS Tab: "sector" | "all"
    const [activeRsTab, setActiveRsTab] = useState("sector");

    const prefetchRef = useRef(null);
    const stockReturnsMapRef = useRef(new Map()); // ticker -> {ret_3m, ret_6m, ret_12m}

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // FETCH MARKET MOVERS
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    useEffect(() => {
        // applyMovers: takes raw API rows and updates all mover state slices.
        function applyMovers(moversData, stock52wRows, allowedSet) {
            const derived = deriveMovers(moversData, stock52wRows, allowedSet);
            // applyNamesFromMap fills names for tickers already in the global map (instant on revisit)
            setGainers(applyNamesFromMap(derived.gainers));
            setLosers(applyNamesFromMap(derived.losers));
            setNearHigh(applyNamesFromMap(derived.nearHigh));
            setNearLow(applyNamesFromMap(derived.nearLow));
            if (moversData && moversData.length > 0 && moversData[0]?.created_at) {
                setLastUpdated(new Date(moversData[0].created_at).toLocaleString("en-IN", {
                    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
                }));
            }
        }

        // Merge rows from three split queries, deduplicating by symbol.
        function mergeMoversRows(g, l, b) {
            const seen = new Set();
            const merged = [];
            for (const row of [...(g || []), ...(l || []), ...(b || [])]) {
                if (row?.symbol && !seen.has(row.symbol)) { seen.add(row.symbol); merged.push(row); }
            }
            return merged;
        }

        (async () => {
            setError(null);
            try {
                const allowedSet = await ensureAllowedTickerSet();
                let latestMovers = _cachedMovers || null;
                let latestS52 = cacheGetAllPages(STOCK52W_PATH, RETURNS_TTL) || [];

                // ── Three small parallel queries replace the old limit=10000 single fetch ──
                // gainers (~200 rows) + losers (~200 rows) + breadth (~500 rows) = ~900 rows max
                // vs the previous 10 000 rows — roughly 10x less data on the wire.
                const [gainersRows, losersRows, breadthRows] = await Promise.all([
                    sbFetch(MOVERS_GAINERS_PATH, userToken, {
                        ttl: MOVERS_TTL,
                        onStale: fresh => {
                            latestMovers = mergeMoversRows(fresh, losersRows, breadthRows);
                            applyMovers(latestMovers, latestS52, allowedSet);
                        },
                    }),
                    sbFetch(MOVERS_LOSERS_PATH, userToken, {
                        ttl: MOVERS_TTL,
                        onStale: fresh => {
                            latestMovers = mergeMoversRows(gainersRows, fresh, breadthRows);
                            applyMovers(latestMovers, latestS52, allowedSet);
                        },
                    }),
                    sbFetch(MOVERS_BREADTH_PATH, userToken, {
                        ttl: MOVERS_TTL,
                        onStale: fresh => {
                            latestMovers = mergeMoversRows(gainersRows, losersRows, fresh);
                            applyMovers(latestMovers, latestS52, allowedSet);
                        },
                    }),
                ]);

                const moversData = mergeMoversRows(gainersRows, losersRows, breadthRows);
                latestMovers = moversData;

                // ── Fetch stock_52w only for the tickers we actually have ──────────────
                // Replaces sbFetchAll (5+ sequential pages for ~5000 tickers) with a
                // targeted parallel batch for the ~400-600 mover tickers — much faster.
                const moverTickers = [...new Set(moversData.map(r => r.symbol).filter(Boolean))];
                let stock52wData = latestS52;

                if (moverTickers.length) {
                    const cachedS52 = cacheGetAllPages(STOCK52W_PATH, RETURNS_TTL) || [];
                    const cachedTickerSet = new Set(cachedS52.map(r => r.ticker));
                    const missingS52 = moverTickers.filter(t => !cachedTickerSet.has(t));

                    if (cachedS52.length && !missingS52.length) {
                        stock52wData = cachedS52; // full cache hit — zero network cost
                    } else {
                        const chunks = [];
                        for (let i = 0; i < moverTickers.length; i += BATCH_SIZE)
                            chunks.push(moverTickers.slice(i, i + BATCH_SIZE));
                        const pages = await Promise.all(
                            chunks.map(chunk => {
                                const tickersIn = toSupabaseInList(chunk);
                                return sbFetch(
                                    `stock_52w?select=ticker,volume_ma20&ticker=in.${tickersIn}`,
                                    userToken,
                                    { ttl: RETURNS_TTL }
                                ).catch(() => []);
                            })
                        );
                        const freshS52 = pages.flat();
                        // Merge with any existing cached rows so other parts of the app
                        // that read the full table don't lose data they already had.
                        const mergedMap = new Map(cachedS52.map(r => [r.ticker, r]));
                        (freshS52 || []).forEach(r => { if (r?.ticker) mergedMap.set(r.ticker, r); });
                        stock52wData = [...mergedMap.values()];
                    }
                }

                latestS52 = stock52wData;
                applyMovers(moversData, stock52wData, allowedSet);

                // ── Enrich mover rows with names (background, non-blocking) ────────
                // Names already in _nameMap for cached tickers; this fills missing ones.
                try {
                    const allTickers = [...new Set(moversData.map(r => r.symbol).filter(Boolean))];
                    const missingTickers = allTickers.filter(t => !_nameMap.has(t));
                    if (missingTickers.length) {
                        const nameRows = await batchFetchBhavNames(missingTickers, userToken);
                        if (nameRows.length) {
                            setGainers(prev => applyNamesFromMap(prev).filter(r => isAllowedTicker(r.ticker, allowedSet)));
                            setLosers(prev => applyNamesFromMap(prev).filter(r => isAllowedTicker(r.ticker, allowedSet)));
                            setNearHigh(prev => applyNamesFromMap(prev).filter(r => isAllowedTicker(r.ticker, allowedSet)));
                            setNearLow(prev => applyNamesFromMap(prev).filter(r => isAllowedTicker(r.ticker, allowedSet)));
                        }
                    }
                } catch (nameErr) {
                    console.warn("Could not enrich mover names from bhav_copy:", nameErr.message);
                }
            } catch (err) {
                console.error("Error fetching movers:", err);
                setError(`Failed to load market movers: ${err.message}`);
            } finally {
                setLoadingMovers(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userToken]);

    // ─────────────────────────────────────────────────────────────────────────
    // FETCH VOLUME SHOCKERS
    // ─────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        const VOLUME_SHOCKERS_PATH = "volume_shocker?select=ticker,exchange,date,open,high,low,close,today_volume,avg_volume_20d,volume_ratio&order=volume_ratio.desc.nullslast&limit=100";
        const VOLUME_SHOCKERS_TTL = 5 * 60 * 1000;
        (async () => {
            try {
                // mapRow enriches each row with change_pct and applies cached names instantly
                const mapRow = r => ({
                    ...r,
                    name: _nameMap.get(r.ticker) || r.name || null,
                    change_pct: r.open > 0 ? ((r.close - r.open) / r.open) * 100 : null,
                });
                const allowedSet = await ensureAllowedTickerSet();
                const cached = cacheGet(VOLUME_SHOCKERS_PATH, VOLUME_SHOCKERS_TTL);
                let vsData = null;
                if (cached && Array.isArray(cached.data) && cached.data.length > 0) {
                    // Paint stale or fresh data immediately — no spinner
                    vsData = cached.data;
                    setVolumeShockers(vsData.map(mapRow).filter(r => !isETF(r) && isAllowedTicker(r.ticker, allowedSet)));
                    setLoadingVolumeShockers(false);
                    if (!cached.stale) {
                        // Fresh — background name enrichment only
                    } else {
                        // Stale — background refresh, don't block UI
                        sbFetch(VOLUME_SHOCKERS_PATH, userToken, {
                            ttl: VOLUME_SHOCKERS_TTL,
                            noCache: false,
                            onStale: fresh => {
                                if (Array.isArray(fresh)) setVolumeShockers(fresh.map(mapRow).filter(r => !isETF(r) && isAllowedTicker(r.ticker, allowedSet)));
                            },
                        }).then(fresh => {
                            if (Array.isArray(fresh)) {
                                vsData = fresh;
                                setVolumeShockers(fresh.map(mapRow).filter(r => !isETF(r) && isAllowedTicker(r.ticker, allowedSet)));
                            }
                        }).catch(() => { });
                    }
                } else {
                    vsData = await sbFetch(VOLUME_SHOCKERS_PATH, userToken, {
                        ttl: VOLUME_SHOCKERS_TTL,
                        onStale: fresh => {
                            if (Array.isArray(fresh)) setVolumeShockers(fresh.map(mapRow).filter(r => !isETF(r) && isAllowedTicker(r.ticker, allowedSet)));
                        },
                    });
                    setVolumeShockers((vsData || []).map(mapRow).filter(r => !isETF(r) && isAllowedTicker(r.ticker, allowedSet)));
                }

                // ── Enrich volume shocker rows with names (missing tickers only) ──
                try {
                    const allTickers = [...new Set((vsData || []).map(r => r.ticker).filter(Boolean))];
                    const missingTickers = allTickers.filter(t => !_nameMap.has(t));
                    if (missingTickers.length) {
                        const nameRows = await batchFetchBhavNames(missingTickers, userToken);
                        if (nameRows.length) {
                            setVolumeShockers(prev => applyNamesFromMap(prev).filter(r => !isETF(r) && isAllowedTicker(r.ticker, allowedSet)));
                        }
                    }
                } catch (nameErr) {
                    console.warn("Could not enrich volume shocker names from bhav_copy:", nameErr.message);
                }
            } catch (err) {
                console.error("Error fetching volume shockers:", err);
            } finally {
                setLoadingVolumeShockers(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userToken]);


    // â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
    useEffect(() => {
        (async () => {
            try {
                const rows = await sbFetch(BREADTH_LATEST_PATH, userToken, {
                    ttl: MOVERS_TTL,
                    onStale: fresh => setBreadthSnapshot(fresh?.[0] || null),
                });
                setBreadthSnapshot(rows?.[0] || null);
            } catch (err) {
                console.warn("Latest breadth snapshot fetch failed:", err);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userToken]);


    // ── FII / DII fetch ──────────────────────────────────────────────────────
    useEffect(() => {
        (async () => {
            try {
                const rows = await sbFetch(FII_DII_PATH, userToken, {
                    ttl: FII_DII_TTL,
                    onStale: fresh => setFiiDiiData(Array.isArray(fresh) ? fresh : []),
                });
                if (Array.isArray(rows)) setFiiDiiData(rows);
            } catch (err) {
                console.warn("FII/DII fetch failed:", err);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userToken]);
    useEffect(() => {
        let allowedSet = getAllowedTickerSetSync();
        function buildRsSummary(tirsData, allIndustryData) {
            const totalsMap = new Map();
            (allIndustryData || []).forEach(r => {
                const key = normalizeIndustryKey(r.industry);
                if (key) totalsMap.set(key, (totalsMap.get(key) || 0) + 1);
            });
            const counts = new Map();
            const labels = new Map();
            (tirsData || []).forEach(row => {
                const key = normalizeIndustryKey(row.industry);
                if (!key) return;
                labels.set(key, normalizeIndustryName(row.industry));
                counts.set(key, (counts.get(key) || 0) + 1);
            });
            return [...counts.entries()]
                .map(([industryKey, count]) => {
                    const total = totalsMap.get(industryKey) || count;
                    return {
                        industry: labels.get(industryKey) || industryKey,
                        count,
                        total,
                        pct: total > 0 ? (count / total) * 100 : 0,
                    };
                })
                .sort((a, b) => (b.count || 0) - (a.count || 0) || a.industry.localeCompare(b.industry));
        }

        function applyRsData(tirsData, allIndustryData, allReturnsData = []) {
            const returnsMap = buildReturnsMap(allReturnsData);
            stockReturnsMapRef.current = returnsMap;
            const filteredTirsData = (tirsData || []).filter(r => isAllowedTicker(r.ticker, allowedSet));

            const totalsMap = new Map();
            allIndustryData.forEach(r => {
                const key = normalizeIndustryKey(r.industry);
                if (key) totalsMap.set(key, (totalsMap.get(key) || 0) + 1);
            });
            setIndustryTotals(totalsMap);

            const uniqueInds = [...new Set(
                filteredTirsData.map(r => normalizeIndustryName(r.industry)).filter(Boolean)
            )].sort();
            setIndustries(uniqueInds);
            setLoadingIndustries(false);

            setRsStocks(enrichRsStocks(filteredTirsData, returnsMap, allowedSet).filter(r => !isETF(r)));

            const summary = buildRsSummary(filteredTirsData, allIndustryData);
            setCachedRsIndustrySummary(summary);
            persistentCacheSet(RS_SUMMARY_CACHE_KEY, summary, RS_TTL);
        }

        (async () => {
            // loadingRs / loadingIndustries are false when cache was available at mount.
            setError(null);
            try {
                allowedSet = await ensureAllowedTickerSet();
                let latestTirsData = _cachedRs || [];
                let latestAllIndustryData = cacheGetAllPages(TIRS_ALL_PATH, RS_TTL) || [];
                let latestReturnsData = cacheGetAllPages(RETURNS_PATH, RETURNS_TTL) || [];
                const applyLatestRsData = () => {
                    if (latestTirsData.length && latestAllIndustryData.length) {
                        applyRsData(latestTirsData, latestAllIndustryData, latestReturnsData);
                        setLoadingRs(false);
                    }
                };

                const [tirsData, allIndustryData] = await Promise.all([
                    sbFetchAll(TIRS_RS85_PATH, userToken, {
                        ttl: RS_TTL,
                        onStale: fresh => {
                            latestTirsData = fresh || [];
                            applyLatestRsData();
                        },
                    }),
                    sbFetchAll(TIRS_ALL_PATH, userToken, {
                        ttl: RS_TTL,
                        onStale: fresh => {
                            latestAllIndustryData = fresh || [];
                            applyLatestRsData();
                        },
                    }),
                ]);
                latestTirsData = tirsData || [];
                latestAllIndustryData = allIndustryData || [];
                applyRsData(tirsData, allIndustryData);
                setLoadingRs(false);

                const [allReturnsData, latestDateRows] = await Promise.all([
                    sbFetchAll(RETURNS_PATH, userToken, {
                        ttl: RETURNS_TTL,
                        onStale: fresh => {
                            latestReturnsData = fresh || [];
                            applyLatestRsData();
                        },
                    }),
                    // Step 1: get the latest date in indicators
                    sbFetch(ALL_RS_LATEST_DATE_PATH, userToken, { ttl: ALL_RS_TTL }),
                ]);
                latestReturnsData = allReturnsData || [];
                applyRsData(tirsData, allIndustryData, allReturnsData);

                // Step 2: fetch all stocks with RS >= 85 for latest date, NSE only (avoids BSE duplicates)
                const latestDate = latestDateRows?.[0]?.date;
                const ALL_RS_PATH = latestDate
                    ? `indicators?select=ticker,rs_rating,rs_score,cap_category&date=eq.${latestDate}&exchange=eq.NSE&rs_rating=gte.85&order=rs_rating.desc.nullslast`
                    : `indicators?select=ticker,rs_rating,rs_score,cap_category&exchange=eq.NSE&rs_rating=gte.85&order=rs_rating.desc.nullslast`;
                const buildAllRsStocks = (indicatorsRows, returnsRows) => {
                    const returnsMap = buildReturnsMap(returnsRows);
                    return (indicatorsRows || []).map((r, idx) => {
                        const ret = returnsMap.get(r.ticker);
                        return {
                            ticker: r.ticker,
                            name: _nameMap.get(r.ticker) || null,
                            rs_rating: r.rs_rating,
                            rs_score: r.rs_score,
                            cap_category: r.cap_category,
                            rank: idx + 1,
                            ret_3m: ret?.ret_3m ?? null,
                            ret_6m: ret?.ret_6m ?? null,
                            ret_12m: ret?.ret_12m ?? null,
                        };
                    });
                };
                const indicatorsHighRS = await sbFetch(ALL_RS_PATH, userToken, {
                    ttl: ALL_RS_TTL,
                    onStale: fresh => {
                        const enriched = buildAllRsStocks(fresh, latestReturnsData).filter(r => isAllowedTicker(r.ticker, allowedSet));
                        setAllRsStocks(enriched.filter(r => !isETF(r)));
                        persistentCacheSet(ALL_RS_STOCKS_CACHE_KEY, enriched, ALL_RS_TTL);
                    },
                });

                // Build allRsStocks: join indicators with returns
                const enriched = buildAllRsStocks(indicatorsHighRS, allReturnsData).filter(r => isAllowedTicker(r.ticker, allowedSet));
                setAllRsStocks(enriched.filter(r => !isETF(r)));
                persistentCacheSet(ALL_RS_STOCKS_CACHE_KEY, enriched, ALL_RS_TTL);

                // ── Enrich allRsStocks with names (only missing tickers) ──────
                try {
                    const allTickers = (indicatorsHighRS || []).map(r => r.ticker).filter(Boolean);
                    const missingTickers = [...new Set(allTickers)].filter(t => !_nameMap.has(t));
                    if (missingTickers.length) {
                        const nameRows = await batchFetchBhavNames(missingTickers, userToken);
                        if (nameRows.length) {
                            // _updateNameMap already called inside batchFetchBhavNames
                            setAllRsStocks(prev => applyNamesFromMap(prev).filter(r => !isETF(r) && isAllowedTicker(r.ticker, allowedSet)));
                        }
                    }
                } catch (nameErr) {
                    console.warn("Could not enrich allRsStocks names:", nameErr.message);
                }
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
                sbFetch(`company_financials?select=ticker,name&industry=eq.${encodeURIComponent(ind)}`, userToken, { ttl: 10 * 60 * 1000 }).catch(() => { });
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
        volume_shockers: volumeShockers,
    }[activeMoversTab] || [];

    const rsIndustrySummary = useMemo(() => {
        if (!rsStocks.length && !searchTerm.trim() && cachedRsIndustrySummary.length) {
            return cachedRsIndustrySummary;
        }
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
            .sort((a, b) => (b.count || 0) - (a.count || 0) || a.industry.localeCompare(b.industry));
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
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <span style={{ flex: 1 }}>{String(error || "")}</span>
                        <button onClick={() => setError(null)} style={{
                            background: "none", border: "none", cursor: "pointer",
                            color: "inherit", fontSize: 16, lineHeight: 1, padding: 0,
                        }}>x</button>
                    </div>
                )}

                <PremiumDashboardHero
                    D={D}
                    isCompact={isCompact}
                    breadthSnapshot={breadthSnapshot}
                    gainers={gainers}
                    losers={losers}
                    allHighRsStocks={allHighRsStocks}
                    rsIndustrySummary={rsIndustrySummary}
                    fiiDiiData={fiiDiiData}
                    onNavigate={onNavigate}
                />

                {isCompact && (
                    <div style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                        gap: 4,
                        marginBottom: 12,
                        padding: 4,
                        borderRadius: 13,
                        background: D.isDark ? "rgba(15,23,42,0.72)" : "rgba(248,250,252,0.92)",
                        border: `1px solid ${D.panelBorder}`,
                        position: "sticky",
                        top: 0,
                        zIndex: 20,
                        backdropFilter: "blur(16px)",
                        WebkitBackdropFilter: "blur(16px)",
                        boxShadow: D.isDark
                            ? "0 4px 20px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.06)"
                            : "0 4px 16px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.9)",
                    }}>
                        {[
                            { id: "pulse", label: "Market Pulse" },
                            { id: "movers", label: "Movers" },
                            { id: "leaders", label: "RS Leaders" },
                        ].map(tab => {
                            const active = activeMobilePanel === tab.id;
                            const accentGrn = D.pos || "#10b981";
                            return (
                                <button key={tab.id} onClick={() => setActiveMobilePanel(tab.id)} style={{
                                    position: "relative",
                                    minHeight: 38,
                                    border: "none",
                                    borderRadius: 9,
                                    background: active
                                        ? D.isDark
                                            ? `linear-gradient(135deg, ${withAlpha(accentGrn, 0.20)} 0%, ${withAlpha(accentGrn, 0.09)} 100%)`
                                            : `linear-gradient(135deg, ${withAlpha(accentGrn, 0.13)} 0%, ${withAlpha(accentGrn, 0.05)} 100%)`
                                        : "transparent",
                                    color: active ? accentGrn : D.muted,
                                    cursor: "pointer",
                                    fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
                                    fontSize: 11,
                                    fontWeight: active ? 700 : 500,
                                    letterSpacing: active ? "0.005em" : "0.01em",
                                    padding: "8px 6px",
                                    whiteSpace: "normal",
                                    lineHeight: 1.2,
                                    transition: "color 0.18s ease, background 0.18s ease",
                                    outline: "none",
                                }}>
                                    {tab.label}
                                    {active && (
                                        <span style={{
                                            position: "absolute",
                                            bottom: 2,
                                            left: "50%",
                                            transform: "translateX(-50%)",
                                            width: "35%",
                                            height: 2,
                                            borderRadius: "2px 2px 0 0",
                                            background: `linear-gradient(90deg, ${withAlpha(accentGrn, 0)}, ${accentGrn}, ${withAlpha(accentGrn, 0)})`,
                                            pointerEvents: "none",
                                        }} />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* â”€â”€ MARKET OVERVIEW (Index Cards) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                {/* ── MARKET PULSE + MOVERS side-by-side on desktop ─── */}
                <div style={{
                    display: isCompact ? "block" : "grid",
                    gridTemplateColumns: isTablet ? "1fr 1fr" : "420px 1fr",
                    gap: 18,
                    alignItems: "stretch",
                    marginBottom: 18,
                }}>
                    {/* Market Pulse */}
                    {(!isCompact || activeMobilePanel === "pulse") && (
                        <div style={{ display: "flex", flexDirection: "column" }}>
                            <MarketOverview T={D} userToken={userToken} isCompact={isCompact} isTablet={isTablet} isSideBySide={!isCompact} style={{ flex: 1 }} />
                        </div>
                    )}

                    {/* Right column: Market Movers + RS Rating stacked */}
                    {(!isCompact || activeMobilePanel === "movers" || activeMobilePanel === "leaders") && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 18, minHeight: 0 }}>

                            {/* Market Movers */}
                            {(!isCompact || activeMobilePanel === "movers") && (
                                <SectionCard T={D} style={{ marginBottom: 0 }}>
                                    <CardHeader
                                        T={D}
                                        title="Market Movers"
                                        count={currentMoversData.length}
                                    />
                                    <TabBar T={D} style={{ marginBottom: 16, flexWrap: "wrap" }}>
                                        <TabButton T={D} active={activeMoversTab === "gainers"} label={isCompact ? "Gainers" : "Top Gainers"} count={gainers.length} onClick={() => setActiveMoversTab("gainers")} hideCount={isCompact} />
                                        <TabButton T={D} active={activeMoversTab === "losers"} label={isCompact ? "Losers" : "Top Losers"} count={losers.length} onClick={() => setActiveMoversTab("losers")} hideCount={isCompact} />
                                        <TabButton T={D} active={activeMoversTab === "near_high"} label={isCompact ? "52W High" : "Near 52W High"} count={nearHigh.length} onClick={() => setActiveMoversTab("near_high")} hideCount={isCompact} />
                                        <TabButton T={D} active={activeMoversTab === "near_low"} label={isCompact ? "52W Low" : "Near 52W Low"} count={nearLow.length} onClick={() => setActiveMoversTab("near_low")} hideCount={isCompact} />
                                        <TabButton T={D} active={activeMoversTab === "volume_shockers"} label={isCompact ? "Vol Shockers" : "Volume Shockers"} count={volumeShockers.length} onClick={() => setActiveMoversTab("volume_shockers")} hideCount={isCompact} />
                                    </TabBar>
                                    {activeMoversTab === "volume_shockers"
                                        ? <VolumeShockersTable key="volume_shockers" T={D} data={volumeShockers} loading={loadingVolumeShockers} isCompact={isCompact} />
                                        : <MoversTable key={activeMoversTab} T={D} data={currentMoversData} loading={loadingMovers} type={activeMoversTab} isCompact={isCompact} />
                                    }
                                </SectionCard>
                            )}

                            {/* -- RS RATING CARD -- */}
                            <SectionCard T={D} style={{ marginBottom: 0, flex: 1 }}>
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
                                                padding: "8px 12px 8px 32px",
                                                borderRadius: 8,
                                                border: `1px solid ${D.panelBorder}`,
                                                background: D.isDark ? "rgba(255,255,255,0.06)" : "#fff",
                                                color: D.text,
                                                fontSize: 12.5,
                                                fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
                                                outline: "none",
                                                transition: "border-color 0.15s",
                                            }}
                                            onFocus={e => e.target.style.borderColor = `${D.pos || "#10b981"}60`}
                                            onBlur={e => e.target.style.borderColor = D.panelBorder}
                                        />
                                        <svg
                                            width="14" height="14" viewBox="0 0 24 24" fill="none"
                                            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                            style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: D.muted }}
                                        >
                                            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
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
                                                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
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
                                <TabBar T={D} style={{ marginBottom: 16 }}>
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
                                </TabBar>
                                <RsLoginGate T={D} isLocked={false} onLogin={onLogin}>
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
                    )}
                </div>
                <style>{`
                .stock-dashboard-shell * {
                    box-sizing: border-box;
                }
                .stock-dashboard-shell {
                    font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
                    font-size: 13px;
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
        </div>
    );
}

StockDashboard.warmStockDashboardCaches = warmStockDashboardCaches;
StockDashboard.prefetchGlobalNameMap = prefetchGlobalNameMap;

function LoadMoreRowsButton({ T, visibleCount, totalCount, onLoadMore }) {
    if (visibleCount >= totalCount) return null;
    const remaining = totalCount - visibleCount;
    return (
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 12 }}>
            <button
                type="button"
                onClick={onLoadMore}
                style={{
                    padding: "8px 14px",
                    borderRadius: 999,
                    border: `1px solid ${T.panelBorder}`,
                    background: T.pillBg,
                    color: T.text,
                    fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: T.isDark ? "none" : "0 4px 12px rgba(15,23,42,0.06)",
                }}
            >
                Load {Math.min(MOVERS_LOAD_MORE_ROWS, remaining)} more
            </button>
        </div>
    );
}
