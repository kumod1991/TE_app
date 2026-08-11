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
const MOVERS_BATCH_SIZE = 20;
const VOLUME_SHOCKERS_BATCH_SIZE = 20;
const MOVERS_TTL = 5 * 60 * 1000;
const VOLUME_SHOCKERS_TTL = 5 * 60 * 1000;
const MOVERS_SELECT = "symbol,name,ltp,pchange,volume,high_52w,low_52w,pct_from_high,pct_from_low,near_high,near_low,rank_gainer,rank_loser,created_at";
// Each Market Movers tab is backed by its own correctly-ordered, independently
// paginated query — no more fetching one shared batch and slicing it four ways.
//   Gainers:   ORDER BY rank_gainer
//   Losers:    ORDER BY rank_loser
//   Near High: ORDER BY pct_from_high DESC
//   Near Low:  ORDER BY pct_from_low
//
// Near High / Near Low used to filter on the DB's `near_high`/`near_low`
// boolean flags, which use a fixed (and apparently quite tight) cutoff —
// on days when few stocks cross that cutoff the tab could come back with
// just 1-2 rows. We now rank ALL stocks by proximity to their 52W high/low
// and simply take the top MOVERS_BATCH_SIZE, so the tab is always full
// (as long as the underlying table has that many rows) instead of being
// gated by a hard threshold.
const MOVERS_TAB_PATHS = {
    gainers: `market_movers?select=${MOVERS_SELECT}&rank_gainer=not.is.null&order=rank_gainer.asc.nullslast`,
    losers: `market_movers?select=${MOVERS_SELECT}&rank_loser=not.is.null&order=rank_loser.asc.nullslast`,
    near_high: `market_movers?select=${MOVERS_SELECT}&pct_from_high=not.is.null&order=pct_from_high.desc.nullslast`,
    near_low: `market_movers?select=${MOVERS_SELECT}&pct_from_low=not.is.null&order=pct_from_low.asc.nullslast`,
};
const VOLUME_SHOCKERS_BASE_PATH = "volume_shocker?select=ticker,exchange,date,open,high,low,close,today_volume,avg_volume_20d,volume_ratio&order=volume_ratio.desc.nullslast";

function withPageParams(path, limit, offset = 0) {
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}limit=${limit}&offset=${offset}`;
}

function dedupeByTicker(rows) {
    const seen = new Set();
    const out = [];
    for (const row of rows || []) {
        const ticker = row?.ticker || row?.symbol;
        const key = String(ticker || "").trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(row);
    }
    return out;
}

function mergeUniqueByTicker(prevRows, nextRows) {
    return dedupeByTicker([...(prevRows || []), ...(nextRows || [])]);
}

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
        const PAGE = 500;
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
    if (!Array.isArray(values)) return "()";
    const encoded = values
        .map(v => {
            const s = String(v || "").trim();
            if (!s) return null;
            return `"${encodeURIComponent(s)}"`;
        })
        .filter(Boolean)
        .join(",");
    return `(${encoded})`;
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
    const allRows = [];
    // Fetch sequentially per chunk to avoid racing cache writes
    for (const chunk of chunks) {
        const tickersIn = toSupabaseInList(chunk);
        try {
            // order=ticker.asc,date.desc → for each ticker, latest date row first
            const path = `bhav_copy?select=ticker,name&ticker=in.${tickersIn}&order=ticker.asc,date.desc`;
            const rows = await sbFetch(
                path,
                userToken,
                { ttl: 60 * 60 * 1000 }
            );
            if (Array.isArray(rows)) allRows.push(...rows);
        } catch (e) {
            console.warn("[batchFetchBhavNames] chunk failed:", e.message);
        }
    }
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

export function withAlpha(color, alpha) {
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

export function buildDashboardTheme(T = {}) {
    const bg = T.bg || "#f6f7f5";
    const isDark = luminance(bg) < 0.32;
    // Deep navy/indigo accent for buttons, active states, links.
    // Gain/loss colors (pos/neg) stay green/red regardless of accent.
    const accent = T.accent || (isDark ? "#7fa8db" : "#1e3a5f");
    const accentAlt = T.pos || "#0e7a53";
    const surface = T.surface || (isDark ? "#12161d" : "#ffffff");
    const card = T.card || surface;
    const text = T.text || (isDark ? "#f4f5f3" : "#14181f");
    const muted = T.muted || (isDark ? "#9aa1ab" : "#6b7280");
    const subtext = T.subtext || muted;
    const border = T.border || (isDark ? "rgba(226,232,240,0.10)" : "rgba(15,23,42,0.08)");

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
        // Flat surfaces only — no layered gradients. A card is just its
        // background color; depth comes from a single soft shadow.
        panelBg: card,
        shellBg: bg,
        panelBorder: isDark ? withAlpha("#e2e8f0", 0.12) : withAlpha("#0f172a", 0.08),
        insetBorder: "transparent",
        softFill: isDark ? withAlpha("#94a3b8", 0.08) : withAlpha("#e2e8f0", 0.45),
        hoverBg: isDark ? withAlpha(accent, 0.1) : withAlpha(accent, 0.05),
        tableHeadBg: isDark ? withAlpha("#0b0e13", 0.9) : "#fafaf8",
        shadowLg: isDark ? "0 12px 32px rgba(0,0,0,0.34)" : "0 1px 2px rgba(15,23,42,0.04), 0 12px 28px rgba(15,23,42,0.05)",
        shadowMd: isDark ? "0 8px 20px rgba(0,0,0,0.28)" : "0 1px 2px rgba(15,23,42,0.03), 0 8px 20px rgba(15,23,42,0.04)",
        ring: withAlpha(accent, isDark ? 0.32 : 0.18),
        pillBg: isDark ? "#181d26" : "#f1f2ef",
        pillBorder: isDark ? withAlpha("#e2e8f0", 0.1) : withAlpha("#0f172a", 0.07),
        posSoft: withAlpha(T.pos || "#0e7a53", isDark ? 0.15 : 0.08),
        negSoft: withAlpha(T.neg || "#c23b3b", isDark ? 0.15 : 0.07),
    };
}

// ─── STOCK AVATARS & INDUSTRY ICONS ──────────────────────────────────────────
// Deterministic per-ticker color so the same stock always gets the same
// avatar color across sessions/tables (no server data needed).
const AVATAR_PALETTE = [
    "#7c3aed", "#059669", "#2563eb", "#ea580c", "#dc2626",
    "#0891b2", "#c026d3", "#65a30d", "#4f46e5", "#0d9488",
];

function hashString(str) {
    let hash = 0;
    const s = String(str || "");
    for (let i = 0; i < s.length; i++) {
        hash = (hash << 5) - hash + s.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function avatarColorFor(seed) {
    return AVATAR_PALETTE[hashString(seed) % AVATAR_PALETTE.length];
}

function StockAvatar({ T, name, ticker, size = 32 }) {
    const label = (name || ticker || "?").trim();
    const letter = label.charAt(0).toUpperCase() || "?";
    const color = avatarColorFor(ticker || name || "?");
    return (
        <div style={{
            width: size,
            height: size,
            minWidth: size,
            borderRadius: Math.round(size * 0.32),
            background: withAlpha(color, T?.isDark ? 0.24 : 0.14),
            color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            fontSize: Math.round(size * 0.42),
            fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
            flexShrink: 0,
            lineHeight: 1,
        }}>
            {letter}
        </div>
    );
}

// Shared "avatar + name + ticker" cell used by every stock table (Movers,
// Volume Shockers, Trend Template, RS tables) so the layout is identical
// everywhere instead of each table hand-rolling its own name column.
function NameCell({ T, name, ticker, size = 32, nameFontSize = 15.5, tickerFontSize = 13.5 }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <StockAvatar T={T} name={name} ticker={ticker} size={size} />
            <div style={{ minWidth: 0 }}>
                <div style={{
                    fontWeight: 600,
                    fontSize: nameFontSize,
                    color: T.text,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    lineHeight: 1.3,
                    fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
                }}>{name || ticker}</div>
                {name && (
                    <div style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: tickerFontSize,
                        color: T.muted,
                        marginTop: 2,
                        letterSpacing: "0.03em",
                    }}>{ticker}</div>
                )}
            </div>
        </div>
    );
}

// Keyword → icon/color map for the RS Rating industry list. Falls back to a
// neutral generic icon for industries that don't match a known keyword.
function industryIconSpec(industry) {
    const name = String(industry || "").toLowerCase();
    if (name.includes("chemical")) return {
        color: "#7c3aed",
        path: <path d="M9 3h6M10 3v5l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" />,
    };
    if (name.includes("pharma") || name.includes("biotech") || name.includes("health")) return {
        color: "#059669",
        path: <><rect x="3" y="3" width="18" height="18" rx="6" /><path d="M9 12h6M12 9v6" /></>,
    };
    if (name.includes("auto")) return {
        color: "#ea580c",
        path: <><path d="M3 17V11l2-5h10l4 5v6" /><path d="M5 17h14" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /></>,
    };
    if (name.includes("electronic") || name.includes("tech") || name.includes("software") || name.includes(" it")) return {
        color: "#2563eb",
        path: <><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" /></>,
    };
    if (name.includes("capital goods") || name.includes("industrial") || name.includes("engineering") || name.includes("machinery")) return {
        color: "#4f46e5",
        path: <><path d="M3 21h18" /><path d="M5 21V9l7-5 7 5v12" /><path d="M9 21v-6h6v6" /></>,
    };
    if (name.includes("bank") || name.includes("financ") || name.includes("insurance") || name.includes("nbfc")) return {
        color: "#0891b2",
        path: <><path d="M3 10l9-6 9 6" /><path d="M4 10v9M20 10v9M9 10v9M15 10v9" /><path d="M2 21h20" /></>,
    };
    if (name.includes("metal") || name.includes("mining") || name.includes("steel") || name.includes("cement")) return {
        color: "#b45309",
        path: <><path d="M4 20h16" /><path d="M6 20V10l6-6 6 6v10" /></>,
    };
    if (name.includes("fmcg") || name.includes("consumer") || name.includes("food") || name.includes("beverage")) return {
        color: "#db2777",
        path: <><path d="M6 2h12l-1 5H7L6 2z" /><path d="M5 7h14l-1.5 13a2 2 0 0 1-2 1.8H8.5a2 2 0 0 1-2-1.8L5 7z" /></>,
    };
    if (name.includes("energy") || name.includes("oil") || name.includes("power") || name.includes("gas") || name.includes("utilit")) return {
        color: "#d97706",
        path: <path d="M13 2 3 14h7l-1 8 11-14h-8l1-6z" />,
    };
    if (name.includes("realt") || name.includes("construction") || name.includes("infra") || name.includes("cement")) return {
        color: "#0d9488",
        path: <><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 9h.01M9 13h.01M15 9h.01M15 13h.01" /></>,
    };
    if (name.includes("textile") || name.includes("apparel")) return {
        color: "#c026d3",
        path: <path d="M6 3l3 2 3-2 3 2 3-2v6l-3 2v10H9V11L6 9V3z" />,
    };
    return {
        color: "#64748b",
        path: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 12h8M12 8v8" /></>,
    };
}

function IndustryIcon({ industry, size = 32 }) {
    const { color, path } = industryIconSpec(industry);
    return (
        <span style={{
            width: size,
            height: size,
            minWidth: size,
            borderRadius: 9,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: withAlpha(color, 0.12),
            color,
            flexShrink: 0,
        }}>
            <svg width={Math.round(size * 0.52)} height={Math.round(size * 0.52)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {path}
            </svg>
        </span>
    );
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
                borderRadius: 14,
                padding: 22,
                marginBottom: 18,
                position: "relative",
                ...style,
            }}
        >
            {children}
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
        return <div style={{ color: D.muted, fontSize: 13.5 }}>waiting for data</div>;
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

    const barMaxH = isCompact ? 44 : 72;
    const barGap = isCompact ? 2 : 4;
    const barMaxW = isCompact ? 14 : 22;
    const dateFontSize = isCompact ? 11 : 12.5;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, width: "100%" }}>
            {/* bars + date labels: one column per day, fills available width */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: isCompact ? 3 : 8, width: "100%", minWidth: 0 }}>
                {rows.map((r, i) => {
                    const fiiH = Math.max(2, Math.round(Math.abs(r.fii_net || 0) / absMax * barMaxH));
                    const diiH = Math.max(2, Math.round(Math.abs(r.dii_net || 0) / absMax * barMaxH));
                    const fiiPos = (r.fii_net || 0) >= 0;
                    const diiPos = (r.dii_net || 0) >= 0;
                    const d = r.date ? String(r.date).slice(5) : "";
                    return (
                        <div key={i} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                            {/* bar pair */}
                            <div style={{ display: "flex", alignItems: "flex-end", gap: barGap, height: barMaxH, width: "100%", justifyContent: "center" }}>
                                <div title={`FII: ${fmtCr(r.fii_net)}Cr`} style={{
                                    flex: 1,
                                    maxWidth: barMaxW,
                                    height: fiiH,
                                    borderRadius: "2px 2px 0 0",
                                    background: fiiPos ? withAlpha(D.pos || "#10b981", 0.85) : withAlpha(D.neg || "#ef4444", 0.82),
                                }} />
                                <div title={`DII: ${fmtCr(r.dii_net)}Cr`} style={{
                                    flex: 1,
                                    maxWidth: barMaxW,
                                    height: diiH,
                                    borderRadius: "2px 2px 0 0",
                                    background: diiPos ? withAlpha(D.accent || "#2563eb", 0.78) : withAlpha("#f59e0b", 0.78),
                                }} />
                            </div>
                            {/* date */}
                            <div style={{
                                fontSize: dateFontSize,
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
                    <div style={{ display: "flex", gap: isCompact ? 10 : 16, marginTop: isCompact ? 2 : 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{
                                width: 6, height: 6, borderRadius: 1, flexShrink: 0,
                                background: fiiNet >= 0 ? withAlpha(D.pos || "#10b981", 0.85) : withAlpha(D.neg || "#ef4444", 0.82),
                            }} />
                            <span style={{ fontSize: isCompact ? 11.5 : 13.5, color: D.muted, fontFamily: "'IBM Plex Sans', sans-serif" }}>FII</span>
                            <span style={{
                                fontSize: isCompact ? 13.5 : 16.5,
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
                            <span style={{ fontSize: isCompact ? 11.5 : 13.5, color: D.muted, fontFamily: "'IBM Plex Sans', sans-serif" }}>DII</span>
                            <span style={{
                                fontSize: isCompact ? 13.5 : 16.5,
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
                { label: "52W High", value: Number.isFinite(highPct) ? `${highPct.toFixed(1)}%` : EMPTY_VALUE, color: highPct >= lowPct ? D.pos : D.text },
                { label: "52W Low", value: Number.isFinite(lowPct) ? `${lowPct.toFixed(1)}%` : EMPTY_VALUE, color: lowPct > highPct ? D.neg : D.text },
                { label: "Above 50D", value: Number.isFinite(sma50Pct) ? `${sma50Pct.toFixed(1)}%` : EMPTY_VALUE, color: sma50Pct >= 50 ? D.pos : D.neg },
                { label: "Above 200D", value: Number.isFinite(sma200Pct) ? `${sma200Pct.toFixed(1)}%` : EMPTY_VALUE, color: sma200Pct >= 50 ? D.pos : D.neg },
            ],
        },
        { label: "Strong Sectors", sectors: topRsSectors, color: D.accent },
        { label: "FII / DII Daily Flow", fiiDii: true },
    ];
    const lenses = [
        { type: "screens", title: "Breadth", meta: `Market Participation`, action: "Market Breadth", onClick: () => onNavigate?.("technical", "breadth") },
        { type: "momentum", title: "Momentum", meta: `Identify leaders`, action: "RS Screens", onClick: () => onNavigate?.("technical", "screens") },
        { type: "flow", title: "Institutions", meta: "FII / DII", action: "Flow Desk", onClick: () => onNavigate?.("financial", "fiidii") },
        { type: "ownership", title: "Ownership", meta: "Promoter / funds", action: "Scans", onClick: () => onNavigate?.("financial", "ownership") },
        { type: "watchlist", title: "Watchlist", meta: "Saved setups", action: "Open", onClick: () => onNavigate?.("watchlist") },
        { type: "journal", title: "Journal", meta: "P&L / execution", action: "Review", onClick: () => onNavigate?.("tradevault", "dashboard") },
    ];

    return (
        <section style={{
            marginBottom: isCompact ? 14 : 18,
            borderRadius: 16,
            border: `1px solid ${D.panelBorder}`,
            background: D.panelBg,
            boxShadow: D.shadowLg,
            position: "relative",
        }}>
            <div style={{ padding: isCompact ? "18px 16px" : "24px 26px" }}>
                <div style={{
                    display: "grid",
                    gridTemplateColumns: isCompact
                        ? "1fr"
                        : "minmax(0, 0.72fr) minmax(0, 1.5fr)",
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
                            fontSize: 12,
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
                            fontSize: isCompact ? 25 : 31,
                            lineHeight: 1.05,
                            fontWeight: 800,
                            letterSpacing: "-0.04em",
                            maxWidth: 760,
                            fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
                        }}>
                            Dashboard
                        </h1>
                        <p style={{
                            margin: "10px 0 0",
                            color: D.subtext,
                            fontSize: 15,
                            lineHeight: 1.6,
                            maxWidth: 720,
                            fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
                        }}>

                        </p>
                    </div>

                    <div style={{
                        display: "grid",
                        gridTemplateColumns: isCompact
                            ? "repeat(2, minmax(0, 1fr))"
                            : "minmax(0, 1.15fr) minmax(0, 1.15fr) minmax(0, 1.7fr)",
                        gap: 10,
                    }}>
                        {heroMetrics.map(metric => (
                            <div key={metric.label} style={{
                                minWidth: 0,
                                width: "100%",
                                maxWidth: "100%",
                                boxSizing: "border-box",
                                overflow: "hidden",
                                borderRadius: 10,
                                padding: isCompact ? "12px 12px" : "14px 14px",
                                background: D.softFill,
                                border: `1px solid ${D.panelBorder}`,
                                ...(metric.fiiDii && isCompact ? { gridColumn: "span 2" } : {}),
                            }}>
                                <div style={{ fontSize: 12, color: D.muted, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.11em", marginBottom: 7, fontFamily: "'IBM Plex Sans', -apple-system, sans-serif" }}>{metric.label}</div>
                                {metric.fiiDii ? (
                                    <FiiDiiFlowBars D={D} data={fiiDiiData} isCompact={isCompact} />
                                ) : metric.breadth ? (
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                                        {metric.breadth.map(item => (
                                            <div key={item.label} style={{ minWidth: 0 }}>
                                                <div style={{
                                                    color: D.subtext,
                                                    fontSize: isCompact ? 11 : 12,
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
                                                    fontSize: isCompact ? 15 : 16.5,
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
                                                    fontSize: 12,
                                                    fontWeight: 800,
                                                }}>{idx + 1}</span>
                                                <span style={{
                                                    flex: 1,
                                                    minWidth: 0,
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                    color: D.text,
                                                    fontSize: isCompact ? 13 : 14,
                                                    fontWeight: 700,
                                                }}>{sector.industry}</span>
                                                <span style={{
                                                    flexShrink: 0,
                                                    color: D.accent,
                                                    fontFamily: "'IBM Plex Mono', monospace",
                                                    fontSize: isCompact ? 14 : 15,
                                                    fontWeight: 800,
                                                }}>{sector.count}</span>
                                            </div>
                                        )) : (
                                            <div style={{ color: D.subtext, fontSize: 13 }}>waiting for RS data</div>
                                        )}
                                    </div>
                                ) : (
                                    <>
                                        <div style={{
                                            color: metric.color,
                                            fontFamily: "'IBM Plex Mono', monospace",
                                            fontSize: isCompact ? 16.5 : 18,
                                            fontWeight: 800,
                                            lineHeight: 1.2,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}>{metric.value}</div>
                                        <div style={{ color: D.subtext, fontSize: 13, marginTop: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{metric.sub}</div>
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
                            minHeight: isCompact ? 82 : 88,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                            gap: 10,
                            textAlign: "left",
                            borderRadius: 14,
                            border: `1px solid ${D.panelBorder}`,
                            background: D.card,
                            color: D.text,
                            cursor: "pointer",
                            padding: "11px",
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
                                <span style={{ display: "block", fontSize: 14.5, fontWeight: 700, marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "-0.01em", fontFamily: "'IBM Plex Sans', -apple-system, sans-serif" }}>{lens.title}</span>
                                <span style={{ display: "block", fontSize: 13, color: D.subtext, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: "'IBM Plex Sans', -apple-system, sans-serif" }}>{lens.meta}</span>
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: D.accent, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "'IBM Plex Sans', -apple-system, sans-serif" }}>{lens.action}</span>
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
            padding: compact ? "12px 0" : "14px 0",
            gap: compact ? 12 : 16,
        }}>
            <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{
                    fontSize: 12.5,
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
                    fontSize: compact ? 18 : 20,
                    fontWeight: 700,
                    color: T.text,
                    fontFamily: "'IBM Plex Mono', monospace",
                    letterSpacing: "-0.03em",
                    fontVariantNumeric: "tabular-nums",
                }}>
                    {value != null ? Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : EMPTY_VALUE}
                </div>
                <div style={{
                    fontSize: compact ? 13 : 13.5,
                    fontWeight: 700,
                    color,
                    marginTop: 7,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "4px 8px",
                    borderRadius: 999,
                    background: isPos ? T.posSoft : T.negSoft,
                    border: `1px solid ${withAlpha(color, 0.16)}`,
                }}>
                    <span>{isPos ? "+" : "-"}</span>
                    <span>{changePct != null ? `${Math.abs(changePct).toFixed(2)}%` : EMPTY_VALUE}</span>
                </div>
            </div>
            <div style={{
                minWidth: compact ? 104 : 122,
                padding: compact ? "7px 7px 5px" : "8px 8px 6px",
                borderRadius: 16,
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
                        fontSize: 16.5,
                        fontWeight: 700,
                        letterSpacing: "-0.01em",
                        color: T.text,
                        fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
                    }}>Market Pulse</div>
                    <div style={{
                        fontSize: isCompact ? 19 : 23,
                        fontWeight: 700,
                        color: T.text,
                        marginTop: 6,
                        letterSpacing: "-0.04em",
                    }}>
                    </div>
                </div>
                {/*<span style={{*/}
                {/*    fontSize: 15.5,*/}
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
                <div style={{ padding: "24px 0", textAlign: "center", color: T.muted, fontSize: 17 }}>
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
                                borderRadius: 14,
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
                            fontSize: 14.5,
                            color: T.muted,
                            fontFamily: "'IBM Plex Mono', monospace",
                        }}>
                            Showing 6 at a time. Scroll to view the remaining indices.
                        </div>
                    )}
                    {!activeIndices.length && (
                        <div style={{ padding: "20px 4px 4px", textAlign: "center", color: T.muted, fontSize: 15.5 }}>
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
            background: T.panelBg,
            // Without this, dragging past the horizontal (or vertical, when
            // isScrollable) edge on mobile lets the elastic bounce chain up to
            // the page itself — the table visually detaches/floats past its
            // own rounded border. `contain` keeps the rubber-band effect
            // local to this box instead of propagating to the parent scroll.
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
        }}>
            <table style={{
                width: "100%",
                borderCollapse: "separate",
                borderSpacing: 0,
                minWidth,
                tableLayout: "auto",
                fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
                fontSize: 14,
            }}>
                {children}
            </table>
        </div>
    );
}

function CardHeader({ T, title, count, right, style = {} }) {
    const accent = T.accent;
    return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 10, flexWrap: "wrap", ...style }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0, flex: 1 }}>
                <span style={{
                    fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em",
                    color: T.text, fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%",
                }}>{title}</span>
                {typeof count === "number" && (
                    <span style={{
                        fontSize: 12.5, fontWeight: 700, color: accent,
                        padding: "2px 8px", borderRadius: 999,
                        background: withAlpha(accent, T.isDark ? 0.16 : 0.08),
                        border: `1px solid ${withAlpha(accent, 0.22)}`,
                        fontFamily: "'IBM Plex Mono', monospace",
                    }}>{count}</span>
                )}
            </div>
            {right}
        </div>
    );
}

function TabButton({ T, active, label, count, onClick, hideCount }) {
    const accent = T.accent;
    return (
        <button
            onClick={onClick}
            style={{
                position: "relative",
                flex: "0 0 auto",
                padding: "8px 16px",
                fontSize: 13.5,
                fontWeight: active ? 700 : 600,
                letterSpacing: "-0.005em",
                color: active ? T.text : T.muted,
                background: active ? T.card : "transparent",
                border: "none",
                borderRadius: 9,
                cursor: "pointer",
                transition: "color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease",
                fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
                whiteSpace: "nowrap",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                outline: "none",
                boxShadow: active ? T.shadowMd.split(",")[0] : "none",
            }}
        >
            {label}
            {!hideCount && typeof count === "number" && (
                <span style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 19,
                    height: 17,
                    padding: "0 5px",
                    borderRadius: 999,
                    fontSize: 11.5,
                    fontWeight: 700,
                    fontFamily: "'IBM Plex Mono', monospace",
                    letterSpacing: "0.02em",
                    color: active ? accent : T.muted,
                    background: active
                        ? withAlpha(accent, T.isDark ? 0.18 : 0.1)
                        : withAlpha(T.muted, T.isDark ? 0.12 : 0.08),
                    transition: "background 0.18s, color 0.18s",
                }}>{count}</span>
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
            background: T.pillBg,
            borderRadius: 12,
            border: `1px solid ${T.panelBorder}`,
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
                {[...Array(6)].map((_, i) => <Skeleton key={i} T={T} h={52} />)}
            </div>
        );
    }

    if (!data.length) {
        return (
            <div style={{
                padding: "48px 20px",
                textAlign: "center",
                color: T.muted,
                fontSize: 15.5,
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
                                borderRadius: 14,
                                border: `1px solid ${T.panelBorder}`,
                                background: T.pillBg,
                                color: T.text,
                                cursor: "pointer",
                            }}
                        >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                                    <IndustryIcon industry={row.industry} size={30} />
                                    <div style={{ fontWeight: 700, lineHeight: 1.4, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.industry}</div>
                                </div>
                                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 16.5, color, flexShrink: 0 }}>{pct.toFixed(1)}%</div>
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
                            <div style={{ color: T.muted, fontSize: 16.5, fontFamily: "'IBM Plex Mono', monospace" }}>
                                {row.count}/{row.total} stocks above RS 85
                            </div>
                        </button>
                    );
                })}
            </div>
        );
    }

    const thStyle = {
        padding: "10px 14px",
        textAlign: "left",
        fontWeight: 800,
        fontSize: 12,
        color: T.muted,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
        background: T.tableHeadBg,
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
                                e.currentTarget.style.background = T.isDark ? "rgba(255,255,255,0.03)" : "rgba(248,250,252,0.84)";
                            }}
                            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                        >
                            <td style={{ padding: "11px 14px", color: T.text, fontWeight: 600, fontSize: 15, fontFamily: "'IBM Plex Sans', -apple-system, sans-serif" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                                    <IndustryIcon industry={row.industry} size={30} />
                                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.industry}</span>
                                </div>
                            </td>
                            <td style={{ padding: "11px 14px" }}>
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
                                        fontSize: 15.5, color, minWidth: 40, textAlign: "right",
                                    }}>{pct.toFixed(1)}%</span>
                                    <span style={{
                                        fontFamily: "'IBM Plex Mono', monospace", fontSize: 14.5,
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
                {[...Array(8)].map((_, i) => <Skeleton key={i} T={T} h={52} />)}
            </div>
        );
    }

    if (!data.length) {
        return (
            <div style={{
                padding: "48px 20px",
                textAlign: "center",
                color: T.muted,
                fontSize: 15.5,
                fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
            }}>
                No stocks with RS &gt; 85 in this industry
            </div>
        );
    }

    const thBaseRT = {
        fontWeight: 800,
        fontSize: 12,
        color: T.muted,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
        fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
        background: T.tableHeadBg,
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
                        onMouseEnter={e => { e.currentTarget.style.background = T.isDark ? "rgba(255,255,255,0.03)" : "rgba(248,250,252,0.84)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                    >
                        {/* Name + ticker cell – mirrors MoversTable layout */}
                        <td style={{ padding: "11px 14px", maxWidth: 260, minWidth: 180 }}>
                            <NameCell T={T} name={row.name} ticker={row.ticker} size={30} nameFontSize={15} tickerFontSize={13} />
                        </td>
                        <td style={{ padding: "11px 14px", textAlign: "right" }}>
                            <span style={{
                                display: "inline-block",
                                padding: "3px 8px",
                                borderRadius: 999,
                                background: withAlpha(T.pos || "#0ea67a", T.isDark ? 0.18 : 0.10),
                                border: `1px solid ${withAlpha(T.pos || "#0ea67a", 0.28)}`,
                                color: T.pos || "#0ea67a",
                                fontFamily: "'IBM Plex Mono', monospace",
                                fontWeight: 700,
                                fontSize: 15,
                                fontVariantNumeric: "tabular-nums",
                            }}>{row.rs_rating != null ? row.rs_rating : EMPTY_VALUE}</span>
                        </td>
                        {[["ret_3m", row.ret_3m], ["ret_6m", row.ret_6m], ["ret_12m", row.ret_12m]].map(([key, val]) => (
                            <td key={key} style={{
                                padding: "11px 14px",
                                textAlign: "right",
                                color: val != null ? (val >= 0 ? (T.pos || "#0ea67a") : (T.neg || "#ef4444")) : T.muted,
                                fontWeight: 600,
                                fontFamily: "'IBM Plex Mono', monospace",
                                fontSize: 15,
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
                {[...Array(8)].map((_, i) => <Skeleton key={i} T={T} h={52} />)}
            </div>
        );
    }

    if (!data.length) {
        return (
            <div style={{ padding: "40px 20px", textAlign: "center", color: T.muted, fontSize: 17 }}>
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
        fontSize: 12,
        color: T.muted,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
        fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
        fontVariantNumeric: "tabular-nums",
        background: T.tableHeadBg,
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
                        onMouseEnter={e => { e.currentTarget.style.background = T.isDark ? "rgba(255,255,255,0.03)" : "rgba(248,250,252,0.84)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                    >
                        <td style={{ padding: "11px 14px", color: T.muted, fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", textAlign: "left", width: 36, fontVariantNumeric: "tabular-nums" }}>{i + 1}</td>
                        {/* Name + ticker cell – mirrors MoversTable layout */}
                        <td style={{ padding: "11px 14px", maxWidth: 260, minWidth: 180 }}>
                            <NameCell T={T} name={row.name} ticker={row.ticker} size={30} nameFontSize={15} tickerFontSize={13} />
                        </td>
                        <td style={{ padding: "11px 14px", textAlign: "right" }}>
                            <span style={{
                                display: "inline-block",
                                padding: "3px 8px",
                                borderRadius: 999,
                                background: withAlpha(T.pos || "#0ea67a", T.isDark ? 0.18 : 0.10),
                                border: `1px solid ${withAlpha(T.pos || "#0ea67a", 0.28)}`,
                                color: T.pos || "#0ea67a",
                                fontFamily: "'IBM Plex Mono', monospace",
                                fontWeight: 700,
                                fontSize: 15,
                                fontVariantNumeric: "tabular-nums",
                            }}>{row.rs_rating != null ? row.rs_rating : EMPTY_VALUE}</span>
                        </td>
                        {[["ret_3m", row.ret_3m], ["ret_6m", row.ret_6m], ["ret_12m", row.ret_12m]].map(([key, val]) => (
                            <td key={key} style={{
                                padding: "11px 14px",
                                textAlign: "right",
                                color: val != null ? (val >= 0 ? (T.pos || "#0ea67a") : (T.neg || "#ef4444")) : T.muted,
                                fontWeight: 600,
                                fontFamily: "'IBM Plex Mono', monospace",
                                fontSize: 15,
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

// ─── TREND TEMPLATE (MINERVINI) CARD ──────────────────────────────────────────
// Self-contained: fetches minervini_screen directly (passes_all=true, RS-sorted)
// rather than threading through the page's shared Market Movers / RS state.
// Explicit column list instead of select=* — if a column (e.g. stock_name) was
// added to minervini_screen after Supabase's PostgREST last reloaded its schema
// cache, select=* can silently omit it even though the data exists in Postgres.
// Naming columns explicitly matches how it's queried in the SQL editor and is
// more resilient to that stale-cache class of bug.
const MINERVINI_SELECT_COLS = "ticker,stock_name,rs_rating,rel_vol,ret_3m,ret_6m,ret_12m,adj_close,w52_high,w52_low,sma50,sma150,sma200,passes_all";
const MINERVINI_PATH = `minervini_screen?select=${MINERVINI_SELECT_COLS}&passes_all=eq.true&order=rs_rating.desc&limit=500`;
const MINERVINI_TTL = 60 * 60 * 1000; // table is refreshed once daily by the sync pipeline

function normalizeMinerviniRow(r) {
    const close = Number(r.adj_close);
    const high = Number(r.w52_high);
    const low = Number(r.w52_low);
    return {
        ...r,
        close,
        // minervini_screen stores the company name as stock_name, but every other
        // table/column in the dashboard reads name — normalize the key.
        name: r.stock_name || r.name || null,
        pct_from_52w_high: high > 0 ? ((close - high) / high) * 100 : null,
        pct_from_52w_low: low > 0 ? ((close - low) / low) * 100 : null,
        // minervini_screen stores this as rel_vol; normalize to rel_volume so it
        // matches every other table/column key in the dashboard.
        rel_volume: r.rel_vol != null ? Number(r.rel_vol) : null,
    };
}

function TrendTemplateCard({ T, userToken, onTickerClick, isCompact }) {
    const _cached = useMemo(() => {
        const hit = cacheGet(MINERVINI_PATH, MINERVINI_TTL);
        return hit ? hit.data || [] : null;
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const [rawRows, setRawRows] = useState(() => _cached || []);
    const [loading, setLoading] = useState(() => !_cached);
    const [searchTerm, setSearchTerm] = useState("");
    const [sortKey, setSortKey] = useState("rs_rating");
    const [sortDir, setSortDir] = useState("desc");
    const [visibleCount, setVisibleCount] = useState(MOVERS_INITIAL_ROWS);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (!_cached) setLoading(true);
                const rows = await sbFetch(MINERVINI_PATH, userToken, {
                    ttl: MINERVINI_TTL,
                    onStale: fresh => { if (!cancelled && Array.isArray(fresh)) setRawRows(fresh); },
                });
                if (Array.isArray(rows) && rows.length && !("stock_name" in rows[0])) {
                    // If this fires, the API genuinely isn't returning stock_name for this
                    // request (even with an explicit column select) — that points to a
                    // Postgres-side grant/permission issue on the column for the anon/
                    // authenticated role, not a frontend bug. Reload the PostgREST schema
                    // cache (Supabase dashboard → Settings → API → "Reload schema") or run
                    // NOTIFY pgrst, 'reload schema'; and re-check GRANT SELECT on the column.
                    console.warn("[TrendTemplateCard] API response is missing stock_name — check Supabase PostgREST schema cache / column grants", rows[0]);
                }
                if (!cancelled && Array.isArray(rows)) setRawRows(rows);
            } catch (e) {
                if (!cancelled) console.error("[TrendTemplateCard] fetch failed:", e);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userToken]);

    const rows = useMemo(() => {
        const allowedSet = getAllowedTickerSetSync();
        return (rawRows || [])
            .filter(r => isAllowedTicker(r.ticker, allowedSet))
            .map(normalizeMinerviniRow);
    }, [rawRows]);

    const filtered = useMemo(() => {
        const q = searchTerm.trim().toUpperCase();
        if (!q) return rows;
        return rows.filter(r => (r.ticker || "").toUpperCase().includes(q) || (r.name || "").toUpperCase().includes(q));
    }, [rows, searchTerm]);

    const sorted = useMemo(() => {
        if (!filtered.length) return [];
        return [...filtered].sort((a, b) => {
            const aVal = a[sortKey], bVal = b[sortKey];
            const cmp = typeof aVal === "number" && typeof bVal === "number"
                ? aVal - bVal
                : String(aVal || "").localeCompare(String(bVal || ""));
            return sortDir === "asc" ? cmp : -cmp;
        });
    }, [filtered, sortKey, sortDir]);

    useEffect(() => { setVisibleCount(MOVERS_INITIAL_ROWS); }, [searchTerm, rawRows]);

    const visibleRows = useMemo(() => sorted.slice(0, visibleCount), [sorted, visibleCount]);
    const loadMoreRows = () => setVisibleCount(prev => Math.min(prev + MOVERS_LOAD_MORE_ROWS, sorted.length));

    const handleSort = key => {
        if (sortKey === key) {
            setSortDir(prev => prev === "asc" ? "desc" : "asc");
        } else {
            setSortKey(key);
            setSortDir(key === "name" ? "asc" : "desc");
        }
    };

    const thBase = {
        fontWeight: 800,
        fontSize: 12,
        color: T.muted,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
        fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
        fontVariantNumeric: "tabular-nums",
        background: T.tableHeadBg,
        borderBottom: `1px solid ${T.panelBorder}`,
        position: "sticky",
        top: 0,
        zIndex: 1,
    };

    const Th = ({ k, label, align = "right" }) => (
        <th onClick={() => handleSort(k)} style={{ ...thBase, padding: "10px 14px", textAlign: align }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: align === "left" ? "flex-start" : "flex-end", gap: 2 }}>
                <span style={{ color: sortKey === k ? T.text : T.muted, transition: "color 0.15s" }}>{label}</span>
                <SortIcon dir={sortKey === k ? sortDir : null} />
            </div>
        </th>
    );

    return (
        <SectionCard T={T} style={{ marginBottom: 0 }}>
            <div style={{
                display: "flex",
                flexDirection: isCompact ? "column" : "row",
                justifyContent: "space-between",
                alignItems: isCompact ? "flex-start" : "center",
                marginBottom: 4,
                gap: 12,
            }}>
                <CardHeader
                    T={T}
                    title="Trend Template Filter"
                    count={sorted.length}
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
                            border: `1px solid ${T.panelBorder}`,
                            background: T.isDark ? "rgba(255,255,255,0.06)" : "#fff",
                            color: T.text,
                            fontSize: 15,
                            fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
                            outline: "none",
                            transition: "border-color 0.15s",
                        }}
                        onFocus={e => e.target.style.borderColor = `${T.pos || "#10b981"}60`}
                        onBlur={e => e.target.style.borderColor = T.panelBorder}
                    />
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.muted }}>
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    {searchTerm && (
                        <button onClick={() => setSearchTerm("")} style={{
                            position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                            background: "none", border: "none", cursor: "pointer", color: T.muted, padding: 4,
                        }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>
            <div style={{ fontSize: 14, color: T.muted, marginBottom: 14, lineHeight: 1.5 }}>
                Stocks passing all 8 criteria of Mark Minervini's Trend Template
            </div>

            {loading ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {[...Array(6)].map((_, i) => <Skeleton key={i} T={T} h={48} />)}
                </div>
            ) : !sorted.length ? (
                <div style={{ padding: "40px 20px", textAlign: "center", color: T.muted, fontSize: 17 }}>
                    {searchTerm ? "No matching stocks" : "No stocks currently pass all 8 criteria"}
                </div>
            ) : (
                <>
                    <PremiumTableShell T={T} minWidth={1110} isScrollable={visibleRows.length > DEFAULT_VISIBLE_ITEMS} maxHeight={DEFAULT_TABLE_MAX_HEIGHT}>
                        <thead>
                            <tr>
                                <th style={{ ...thBase, padding: "11px 16px", textAlign: "left", width: 36 }}>#</th>
                                <Th k="name" label="Name" align="left" />
                                <Th k="close" label="Price" />
                                <Th k="rs_rating" label="RS" />
                                <Th k="ret_3m" label="3M" />
                                <Th k="ret_6m" label="6M" />
                                <Th k="ret_12m" label="12M" />
                                <Th k="rel_volume" label="Rel Vol" />
                                <Th k="pct_from_52w_high" label="From High" />
                                <Th k="sma50" label="50 SMA" />
                                <Th k="sma150" label="150 SMA" />
                                <Th k="sma200" label="200 SMA" />
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
                                    <td style={{ padding: "12px 16px", color: T.muted, fontSize: 13.5, fontFamily: "'IBM Plex Mono', monospace", textAlign: "left", width: 36, fontVariantNumeric: "tabular-nums" }}>{i + 1}</td>
                                    <td style={{ padding: "12px 16px", maxWidth: 260, minWidth: 180 }}>
                                        <NameCell T={T} name={row.name} ticker={row.ticker} />
                                    </td>
                                    <td style={{
                                        padding: "12px 16px", textAlign: "right",
                                        color: T.text, fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace", fontSize: 15.5,
                                    }}>{row.close != null ? `₹${fmt(row.close)}` : EMPTY_VALUE}</td>
                                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                                        <span style={{
                                            display: "inline-block", padding: "3px 9px", borderRadius: 6,
                                            background: withAlpha(T.pos || "#0ea67a", T.isDark ? 0.18 : 0.10),
                                            border: `1px solid ${withAlpha(T.pos || "#0ea67a", 0.28)}`,
                                            color: T.pos || "#0ea67a", fontFamily: "'IBM Plex Mono', monospace",
                                            fontWeight: 700, fontSize: 15.5, fontVariantNumeric: "tabular-nums",
                                        }}>{row.rs_rating != null ? Math.round(row.rs_rating) : EMPTY_VALUE}</span>
                                    </td>
                                    {[["ret_3m", row.ret_3m], ["ret_6m", row.ret_6m], ["ret_12m", row.ret_12m]].map(([key, val]) => (
                                        <td key={key} style={{
                                            padding: "12px 16px", textAlign: "right",
                                            color: val != null ? (val >= 0 ? (T.pos || "#0ea67a") : (T.neg || "#ef4444")) : T.muted,
                                            fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace", fontSize: 15.5,
                                        }}>{val != null ? fmtPct(val) : EMPTY_VALUE}</td>
                                    ))}
                                    <td style={{
                                        padding: "12px 16px", textAlign: "right",
                                        color: row.rel_volume == null ? T.muted : row.rel_volume >= 2 ? (T.pos || "#0ea67a") : T.text,
                                        fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace", fontSize: 15.5,
                                    }}>{row.rel_volume != null ? `${Number(row.rel_volume).toFixed(2)}x` : EMPTY_VALUE}</td>
                                    <td style={{
                                        padding: "12px 16px", textAlign: "right",
                                        color: T.subtext || T.muted, fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace", fontSize: 15.5,
                                    }}>{row.pct_from_52w_high != null ? `${Number(row.pct_from_52w_high).toFixed(1)}%` : EMPTY_VALUE}</td>
                                    {[["sma50", row.sma50], ["sma150", row.sma150], ["sma200", row.sma200]].map(([key, val]) => (
                                        <td key={key} style={{
                                            padding: "12px 16px", textAlign: "right",
                                            color: T.subtext || T.muted, fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace", fontSize: 15.5,
                                        }}>{fmt(val)}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </PremiumTableShell>
                    <LoadMoreRowsButton T={T} visibleCount={visibleRows.length} totalCount={sorted.length} onLoadMore={loadMoreRows} />
                </>
            )}
        </SectionCard>
    );
}

// â”€â”€â”€ MOVERS TABLE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function MoversTable({ T, data, loading, type, isCompact, hasMore = false, loadingMore = false, onLoadMore }) {
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
    const loadMoreRows = async () => {
        if (visibleCount < sorted.length) {
            setVisibleCount(prev => Math.min(prev + MOVERS_LOAD_MORE_ROWS, sorted.length));
            return;
        }
        if (!hasMore || loadingMore || !onLoadMore) return;
        await onLoadMore();
        setVisibleCount(prev => prev + MOVERS_LOAD_MORE_ROWS);
    };

    if (loading) {
        return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[...Array(8)].map((_, i) => <Skeleton key={i} T={T} h={52} />)}
            </div>
        );
    }

    if (!data.length) {
        return (
            <div style={{
                padding: "48px 20px",
                textAlign: "center",
                color: T.muted,
                fontSize: 15.5,
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
                padding: "10px 14px",
                textAlign: k === "ticker" || k === "name" ? "left" : "right",
                fontWeight: 800,
                fontSize: 12,
                color: T.muted,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                cursor: "pointer",
                userSelect: "none",
                fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
                background: T.tableHeadBg,
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

    // Mobile and desktop now share the exact same table (matches Trend Template's
    // approach) — PremiumTableShell handles horizontal scroll on narrow viewports,
    // so there's no separate card layout to keep in sync anymore.
    const thBase = {
        fontWeight: 800,
        fontSize: 12,
        color: T.muted,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
        fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
        background: T.tableHeadBg,
        borderBottom: `1px solid ${T.panelBorder}`,
        position: "sticky",
        top: 0,
        zIndex: 1,
    };

    const MTh = ({ k, label, align }) => {
        const a = align || (k === "ticker" || k === "name" ? "left" : "right");
        return (
            <th onClick={() => handleSort(k)} style={{ ...thBase, padding: "10px 14px", textAlign: a }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: a === "left" ? "flex-start" : "flex-end", gap: 2 }}>
                    <span style={{ color: sortKey === k ? T.text : T.muted, transition: "color 0.15s" }}>{label}</span>
                    <SortIcon dir={sortKey === k ? sortDir : null} />
                </div>
            </th>
        );
    };

    return (
        <>
        <PremiumTableShell T={T} minWidth={showDist ? 1010 : 870} isScrollable={visibleRows.length > DEFAULT_VISIBLE_ITEMS} maxHeight={DEFAULT_TABLE_MAX_HEIGHT}>
            <thead>
                <tr>
                    <th style={{ ...thBase, padding: "11px 16px", textAlign: "left", width: 36, cursor: "default" }}>#</th>
                    <MTh k="name" label="Name" />
                    <MTh k="ltp" label="LTP" />
                    <MTh k="change_pct" label="Chg %" />
                    {showDist && <MTh k="dist_pct" label={type === "near_high" ? "From High" : "From Low"} />}
                    <MTh k="high_52w" label="52W High" />
                    <MTh k="low_52w" label="52W Low" />
                </tr>
            </thead>
            <tbody>
                {visibleRows.map((row, i) => {
                    const chg = row.change_pct;
                    const isPos = chg != null && chg > 0;
                    const isNeg = chg != null && chg < 0;
                    const chgColor = isPos ? (T.pos || "#0ea67a") : isNeg ? (T.neg || "#ef4444") : T.muted;

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
                            {/* Row index */}
                            <td style={{ padding: "12px 16px", color: T.muted, fontSize: 13.5, fontFamily: "'IBM Plex Mono', monospace", textAlign: "left", width: 36, fontVariantNumeric: "tabular-nums" }}>{i + 1}</td>
                            {/* Name cell */}
                            <td style={{ padding: "12px 16px", maxWidth: 260, minWidth: 180 }}>
                                <NameCell T={T} name={row.name} ticker={row.ticker} />
                            </td>
                            {/* LTP */}
                            <td style={{
                                padding: "12px 16px",
                                textAlign: "right",
                                color: T.text,
                                fontFamily: "'IBM Plex Mono', monospace",
                                fontSize: 15.5,
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
                                    fontSize: 15.5,
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
                                    fontSize: 15.5,
                                }}>{row.dist_pct != null ? `${fmt(row.dist_pct, 1)}%` : EMPTY_VALUE}</td>
                            )}
                            {/* 52W High */}
                            <td style={{
                                padding: "12px 16px",
                                textAlign: "right",
                                color: T.text,
                                fontFamily: "'IBM Plex Mono', monospace",
                                fontSize: 15.5,
                                fontVariantNumeric: "tabular-nums",
                            }}>{row.high_52w != null ? fmt(row.high_52w) : EMPTY_VALUE}</td>
                            {/* 52W Low */}
                            <td style={{
                                padding: "12px 16px",
                                textAlign: "right",
                                fontFamily: "'IBM Plex Mono', monospace",
                                fontSize: 15.5,
                                color: T.text,
                                fontVariantNumeric: "tabular-nums",
                            }}>{row.low_52w != null ? fmt(row.low_52w) : EMPTY_VALUE}</td>
                        </tr>
                    );
                })}
            </tbody>
        </PremiumTableShell>
        <LoadMoreRowsButton T={T} visibleCount={visibleRows.length} totalCount={sorted.length} hasMore={hasMore} loading={loadingMore} onLoadMore={loadMoreRows} />
        </>
    );
}


// ─── VOLUME SHOCKERS TABLE ───────────────────────────────────────────────────
function VolumeShockersTable({ T, data, loading, isCompact, hasMore = false, loadingMore = false, onLoadMore }) {
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
    const loadMoreRows = async () => {
        if (visibleCount < sorted.length) {
            setVisibleCount(prev => Math.min(prev + MOVERS_LOAD_MORE_ROWS, sorted.length));
            return;
        }
        if (!hasMore || loadingMore || !onLoadMore) return;
        await onLoadMore();
        setVisibleCount(prev => prev + MOVERS_LOAD_MORE_ROWS);
    };

    if (loading) {
        return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[...Array(8)].map((_, i) => <Skeleton key={i} T={T} h={52} />)}
            </div>
        );
    }

    if (!data.length) {
        return (
            <div style={{ padding: "40px 20px", textAlign: "center", color: T.muted, fontSize: 17 }}>
                No volume shockers available
            </div>
        );
    }

    const Th = ({ k, label }) => (
        <th
            onClick={() => handleSort(k)}
            style={{
                padding: "10px 14px",
                textAlign: k === "ticker" || k === "name" ? "left" : "right",
                fontWeight: 800,
                fontSize: 12,
                color: T.muted,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                cursor: "pointer",
                userSelect: "none",
                fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
                background: T.tableHeadBg,
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

    // Mobile and desktop now share the exact same table (matches Trend Template's
    // approach) — PremiumTableShell handles horizontal scroll on narrow viewports,
    // so there's no separate card layout to keep in sync anymore.
    const thBase = {
        fontWeight: 800,
        fontSize: 12,
        color: T.muted,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
        fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
        background: T.tableHeadBg,
        borderBottom: `1px solid ${T.panelBorder}`,
        position: "sticky",
        top: 0,
        zIndex: 1,
    };

    const VTh = ({ k, label }) => {
        const a = (k === "ticker" || k === "name") ? "left" : "right";
        return (
        <th onClick={() => handleSort(k)} style={{ ...thBase, padding: "10px 14px", textAlign: a }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: a === "left" ? "flex-start" : "flex-end", gap: 2 }}>
                    <span style={{ color: sortKey === k ? T.text : T.muted, transition: "color 0.15s" }}>{label}</span>
                    <SortIcon dir={sortKey === k ? sortDir : null} />
                </div>
            </th>
        );
    };

    return (
        <>
        <PremiumTableShell T={T} minWidth={720} isScrollable={visibleRows.length > DEFAULT_VISIBLE_ITEMS} maxHeight={DEFAULT_TABLE_MAX_HEIGHT}>
            <thead>
                <tr>
                    <th style={{ ...thBase, padding: "11px 16px", textAlign: "left", width: 36, cursor: "default" }}>#</th>
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
                            <td style={{ padding: "12px 16px", color: T.muted, fontSize: 13.5, fontFamily: "'IBM Plex Mono', monospace", textAlign: "left", width: 36, fontVariantNumeric: "tabular-nums" }}>{i + 1}</td>
                            <td style={{ padding: "12px 16px", maxWidth: 260, minWidth: 180 }}>
                                <NameCell T={T} name={row.name} ticker={row.ticker} />
                            </td>
                            <td style={{ padding: "12px 16px", textAlign: "right", color: T.text, fontFamily: "'IBM Plex Mono', monospace", fontSize: 15.5, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{fmt(row.close)}</td>
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
                                    fontSize: 15.5,
                                    minWidth: 64,
                                    textAlign: "right",
                                }}>{fmtPct(chg)}</span>
                            </td>
                            <td style={{ padding: "12px 16px", textAlign: "right", color: T.subtext || T.muted, fontFamily: "'IBM Plex Mono', monospace", fontSize: 15.5 }}>{fmtVol(row.today_volume)}</td>
                            <td style={{ padding: "12px 16px", textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 15.5, color: vrColor }}>
                                {vr != null ? `${Number(vr).toFixed(2)}x` : EMPTY_VALUE}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </PremiumTableShell>
        <LoadMoreRowsButton T={T} visibleCount={visibleRows.length} totalCount={sorted.length} hasMore={hasMore} loading={loadingMore} onLoadMore={loadMoreRows} />
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
                    <div style={{ fontSize: 17, fontWeight: 700, color: T.text, marginBottom: 8 }}>
                        Login to access RS Table
                    </div>
                    <div style={{ fontSize: 16.5, color: T.muted, lineHeight: 1.6 }}>
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
                        fontSize: 17,
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

/** Returns true if a row should be excluded because its ticker looks like a liquid fund (e.g. LIQUIDBEES, LIQID). */
function isLiquidFund(r) {
    const liquidRe = /liqu?id/i;
    return liquidRe.test(r.ticker || "");
}

// Number(x) ?? null is a no-op guard: Number(null) is 0 and Number(undefined)
// is NaN, and neither is nullish, so ?? never fires. That silently turned real
// DB nulls (e.g. no 52w high on record yet, unknown day-change) into a false
// 0 / 0.00 in the movers tables instead of the "—" empty state.
function numOrNull(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

/** Map a raw market_movers row into the shape the movers tables render. */
function mapMoverRow(p) {
    return {
        ticker: p.symbol,
        name: p.name || _nameMap.get(p.symbol) || null,
        ltp: Number(p.ltp) || 0,
        change_pct: numOrNull(p.pchange),
        high_52w: numOrNull(p.high_52w),
        low_52w: numOrNull(p.low_52w),
        dist_high: numOrNull(p.pct_from_high),
        dist_low: numOrNull(p.pct_from_low),
        dist_pct: numOrNull(p.pct_from_high),
        rank_gainer: p.rank_gainer,
        rank_loser: p.rank_loser,
        near_high: p.near_high,
        near_low: p.near_low,
    };
}

// Outlier / circuit-filter rules kept client-side per tab (gain > 50% or loss > 20%
// are excluded as data artifacts, not genuine moves). The row ordering itself now
// comes straight from the per-tab SQL query, not from client-side sorting.
const MOVERS_TAB_ROW_FILTERS = {
    gainers: r => r.change_pct == null || r.change_pct <= 50,
    losers: r => r.change_pct == null || r.change_pct >= -20,
    near_high: r => r.change_pct == null || (r.change_pct <= 50 && r.change_pct >= -20),
    near_low: r => r.change_pct == null || (r.change_pct <= 50 && r.change_pct >= -20),
};

/** Turn a page of raw rows from one movers tab's query into display-ready rows. */
function processMoversRows(tabKey, rawRows, allowedSet = getAllowedTickerSetSync()) {
    const rowFilter = MOVERS_TAB_ROW_FILTERS[tabKey] || (() => true);
    return (rawRows || [])
        .map(mapMoverRow)
        .filter(r => rowFilter(r) && !isETF(r) && !isLiquidFund(r) && isAllowedTicker(r.ticker, allowedSet))
        .map(r => {
            if (tabKey === "near_high") return { ...r, dist_pct: r.dist_high };
            if (tabKey === "near_low") return { ...r, dist_pct: r.dist_low };
            return r;
        });
}

/** Read a movers tab's first page straight from cache (for instant seed on mount). */
function seedMoversTabFromCache(tabKey) {
    const path = withPageParams(MOVERS_TAB_PATHS[tabKey], MOVERS_BATCH_SIZE, 0);
    const hit = cacheGet(path, MOVERS_TTL);
    const rawRows = hit ? hit.data || [] : null;
    return {
        rawRows,
        data: rawRows ? processMoversRows(tabKey, rawRows) : [],
        hasMore: (rawRows?.length || 0) >= MOVERS_BATCH_SIZE,
    };
}

// buildReturnsMap() (dedupe stock_returns by ticker) and enrichRsStocks()
// (join ticker_industry_rs + returns) used to live here. Both are now done in
// Postgres by the get_rs_stocks_enriched() RPC — see migration.sql. Removed
// rather than kept as dead code; restore from git history if you ever need
// to fall back to the client-side join.

// Call a Postgres function through PostgREST (Supabase's RPC endpoint), using
// the same sbFetch cache/SWR plumbing as regular table reads. Replaces the
// three raw-table fetches + client-side joins that used to live here — see
// migration.sql (get_rs_industry_summary / get_rs_stocks_by_industry /
// get_top_rs_stocks) for the backend side of this.
function rpcPath(fnName, params = {}) {
    const qs = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join("&");
    return qs ? `rpc/${fnName}?${qs}` : `rpc/${fnName}`;
}

export async function warmStockDashboardCaches(userToken) {
    if (_stockDashboardWarmPromise) return _stockDashboardWarmPromise;

    const RS_SUMMARY_CACHE_KEY = "dashboard-rs-industry-summary-v1";
    const ALL_RS_STOCKS_CACHE_KEY = "dashboard-all-rs-stocks-v1";
    const RS_TTL = 60 * 60 * 1000;
    const ALL_RS_TTL = 10 * 60 * 1000;

    const headers = userToken ? userToken : null;

    _stockDashboardWarmPromise = (async () => {
        try {
            const allowedSetPromise = ensureAllowedTickerSet();
            // Warm the first page of each movers tab independently — each tab has its
            // own ordering (rank_gainer / rank_loser / pct_from_high / pct_from_low),
            // so there's no single shared batch to slice anymore.
            const moversTabEntries = Object.entries(MOVERS_TAB_PATHS);
            const moversTabPromises = moversTabEntries.map(([tabKey, path]) =>
                sbFetch(withPageParams(path, MOVERS_BATCH_SIZE, 0), headers, { ttl: MOVERS_TTL }).catch(() => null)
            );

            // These two RPCs replace ticker_industry_rs (x2) + stock_returns raw
            // fetches and all of buildReturnsMap/enrichRsStocks/industry-count math —
            // the join, dedup, and aggregation now happen in Postgres.
            const rsSummaryPromise = sbFetch(rpcPath("get_rs_industry_summary"), headers, { ttl: RS_TTL }).catch(() => []);
            const topRsPromise = sbFetch(rpcPath("get_top_rs_stocks"), headers, { ttl: ALL_RS_TTL }).catch(() => []);

            const [moversResults, rsSummary, topRsStocks] = await Promise.all([
                Promise.all(moversTabPromises),
                rsSummaryPromise,
                topRsPromise,
            ]);
            const allowedSet = await allowedSetPromise;

            moversTabEntries.forEach(([tabKey, path], idx) => {
                const rawRows = moversResults[idx];
                if (Array.isArray(rawRows) && rawRows.length > 0) {
                    cacheSet(withPageParams(path, MOVERS_BATCH_SIZE, 0), rawRows, MOVERS_TTL);
                }
            });

            if (Array.isArray(rsSummary) && rsSummary.length > 0) {
                persistentCacheSet(RS_SUMMARY_CACHE_KEY, rsSummary, RS_TTL);
            }

            if (Array.isArray(topRsStocks) && topRsStocks.length > 0) {
                // Allowed-ticker exclusion stays client-side until allowed_tickers is a
                // real table the RPC can filter on server-side (see migration.sql TODO).
                const enriched = topRsStocks
                    .filter(r => isAllowedTicker(r.ticker, allowedSet))
                    .map(r => ({ ...r, name: null }));
                persistentCacheSet(ALL_RS_STOCKS_CACHE_KEY, enriched, ALL_RS_TTL);
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
    const MOVERS_TTL = 5 * 60 * 1000;

    // The RS>=85 dataset (industry-tagged, returns-joined) and the top-100
    // ranked list now come from Postgres RPCs (get_rs_stocks_enriched,
    // get_rs_industry_summary, get_top_rs_stocks — see migration.sql) instead
    // of three raw-table fetches joined client-side. RPC_RS_PATH etc. below
    // are just the PostgREST /rpc/<fn> cache keys for those calls.
    const RPC_RS_ENRICHED_PATH = "rpc/get_rs_stocks_enriched";
    const RPC_RS_SUMMARY_PATH = "rpc/get_rs_industry_summary";
    const RPC_TOP_RS_PATH = "rpc/get_top_rs_stocks";
    const BREADTH_LATEST_PATH = "market_breadth?exchange=eq.NSE&select=date,above_sma50,above_sma200,near_52w_high,near_52w_low&order=date.desc&limit=1";
    const RS_SUMMARY_CACHE_KEY = "dashboard-rs-industry-summary-v1";
    const ALL_RS_STOCKS_CACHE_KEY = "dashboard-all-rs-stocks-v1";
    const RS_TTL = 60 * 60 * 1000;
    const ALL_RS_TTL = 10 * 60 * 1000;

    // ── Market Movers – seed from cache so first paint is instant ────────────
    // Each tab (gainers / losers / near_high / near_low) has its own query, its own
    // cache entry, and — below — its own offset/hasMore/loading state, so tabs no
    // longer share one fetch and one pagination cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const _seedGainers = useMemo(() => seedMoversTabFromCache("gainers"), []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const _seedLosers = useMemo(() => seedMoversTabFromCache("losers"), []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const _seedNearHigh = useMemo(() => seedMoversTabFromCache("near_high"), []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const _seedNearLow = useMemo(() => seedMoversTabFromCache("near_low"), []);

    // Apply names from the global map at init – if map is warm (revisit), names appear instantly.
    const [gainers, setGainers] = useState(() => _seedGainers.data);
    const [losers, setLosers] = useState(() => _seedLosers.data);
    const [nearHigh, setNearHigh] = useState(() => _seedNearHigh.data);
    const [nearLow, setNearLow] = useState(() => _seedNearLow.data);

    const [gainersHasMore, setGainersHasMore] = useState(() => _seedGainers.hasMore);
    const [losersHasMore, setLosersHasMore] = useState(() => _seedLosers.hasMore);
    const [nearHighHasMore, setNearHighHasMore] = useState(() => _seedNearHigh.hasMore);
    const [nearLowHasMore, setNearLowHasMore] = useState(() => _seedNearLow.hasMore);

    const [loadingGainers, setLoadingGainers] = useState(() => !_seedGainers.rawRows);
    const [loadingLosers, setLoadingLosers] = useState(() => !_seedLosers.rawRows);
    const [loadingNearHigh, setLoadingNearHigh] = useState(() => !_seedNearHigh.rawRows);
    const [loadingNearLow, setLoadingNearLow] = useState(() => !_seedNearLow.rawRows);

    const [loadingMoreGainers, setLoadingMoreGainers] = useState(false);
    const [loadingMoreLosers, setLoadingMoreLosers] = useState(false);
    const [loadingMoreNearHigh, setLoadingMoreNearHigh] = useState(false);
    const [loadingMoreNearLow, setLoadingMoreNearLow] = useState(false);

    const gainersOffsetRef = useRef(_seedGainers.rawRows?.length || 0);
    const losersOffsetRef = useRef(_seedLosers.rawRows?.length || 0);
    const nearHighOffsetRef = useRef(_seedNearHigh.rawRows?.length || 0);
    const nearLowOffsetRef = useRef(_seedNearLow.rawRows?.length || 0);

    // Tracks whether each tab's first page has been fetched at least once this session.
    const gainersLoadedRef = useRef(!!_seedGainers.rawRows);
    const losersLoadedRef = useRef(!!_seedLosers.rawRows);
    const nearHighLoadedRef = useRef(!!_seedNearHigh.rawRows);
    const nearLowLoadedRef = useRef(!!_seedNearLow.rawRows);
    const [volumeShockers, setVolumeShockers] = useState(() => {
        // Seed from cache so the Volume Shockers tab renders instantly on revisit
        const VS_PATH = withPageParams(VOLUME_SHOCKERS_BASE_PATH, VOLUME_SHOCKERS_BATCH_SIZE, 0);
        const hit = cacheGet(VS_PATH, VOLUME_SHOCKERS_TTL);
        if (!hit || !Array.isArray(hit.data)) return [];
        const allowedSet = getAllowedTickerSetSync();
        return applyNamesFromMap(hit.data.map(r => ({
            ...r,
            name: _nameMap.get(r.ticker) || null,
            change_pct: r.open > 0 ? ((r.close - r.open) / r.open) * 100 : null,
        })).filter(r => !isETF(r) && isAllowedTicker(r.ticker, allowedSet)));
    });
    const [loadingVolumeShockers, setLoadingVolumeShockers] = useState(() => {
        const VS_PATH = withPageParams(VOLUME_SHOCKERS_BASE_PATH, VOLUME_SHOCKERS_BATCH_SIZE, 0);
        const hit = cacheGet(VS_PATH, VOLUME_SHOCKERS_TTL);
        return !(hit && Array.isArray(hit.data) && hit.data.length > 0);
    });
    const [volumeShockersHasMore, setVolumeShockersHasMore] = useState(() => {
        const VS_PATH = withPageParams(VOLUME_SHOCKERS_BASE_PATH, VOLUME_SHOCKERS_BATCH_SIZE, 0);
        const hit = cacheGet(VS_PATH, VOLUME_SHOCKERS_TTL);
        return !!(hit && Array.isArray(hit.data) && hit.data.length >= VOLUME_SHOCKERS_BATCH_SIZE);
    });
    const [loadingMoreVolumeShockers, setLoadingMoreVolumeShockers] = useState(false);

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
    const [activeMoversTab, setActiveMoversTab] = useState("gainers");
    const [activeMobilePanel, setActiveMobilePanel] = useState("pulse");
    const volumeShockersOffsetRef = useRef(0);

    // ── RS stocks – seed from cache ──────────────────────────────────────────
    // get_rs_stocks_enriched() already returns an industry-tagged, returns-joined,
    // ETF-excluded RS>=85 list, so there's no client-side join/dedup left to do here.
    const _cachedRs = useMemo(() => {
        const hit = cacheGet(RPC_RS_ENRICHED_PATH, RS_TTL);
        return hit ? hit.data || [] : null;
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const [rsStocks, setRsStocks] = useState(() => {
        if (!_cachedRs) return [];
        const allowedSet = getAllowedTickerSetSync();
        return _cachedRs.filter(r => isAllowedTicker(r.ticker, allowedSet));
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
    // industries / industryTotals now derive from the already-aggregated
    // get_rs_industry_summary() result (industry, count, total, pct) instead of
    // a separate full-table TIRS_ALL_PATH fetch + client-side group-by.
    const _cachedRsSummary = (() => {
        const hit = persistentCacheGet(RS_SUMMARY_CACHE_KEY, RS_TTL);
        return hit?.data || [];
    })();
    const [industries, setIndustries] = useState(() =>
        [...new Set(_cachedRsSummary.map(r => r.industry).filter(Boolean))].sort()
    );
    const [loadingIndustries, setLoadingIndustries] = useState(() => !_cachedRsSummary.length);
    const [industryTotals, setIndustryTotals] = useState(() => {
        const m = new Map();
        _cachedRsSummary.forEach(r => {
            const key = normalizeIndustryKey(r.industry);
            if (key) m.set(key, r.total || r.count || 0);
        });
        return m;
    }); // total stocks per industry (all ratings) — comes straight from the RPC now
    const [cachedRsIndustrySummary, setCachedRsIndustrySummary] = useState(_cachedRsSummary);

    // RS Tab: "sector" | "all"
    const [activeRsTab, setActiveRsTab] = useState("sector");

    const prefetchRef = useRef(null);
    const stockReturnsMapRef = useRef(new Map()); // ticker -> {ret_3m, ret_6m, ret_12m}

    // ── Per-tab config: each Market Movers tab owns its query, its cache, its
    // offset, its hasMore flag, and its loading flags. Nothing here is shared
    // across tabs anymore, so paginating one tab can never affect another's data.
    const MOVERS_TAB_CONFIG = {
        gainers: {
            path: MOVERS_TAB_PATHS.gainers,
            setData: setGainers, offsetRef: gainersOffsetRef, loadedRef: gainersLoadedRef,
            hasMore: gainersHasMore, setHasMore: setGainersHasMore,
            loading: loadingGainers, setLoading: setLoadingGainers,
            loadingMore: loadingMoreGainers, setLoadingMore: setLoadingMoreGainers,
        },
        losers: {
            path: MOVERS_TAB_PATHS.losers,
            setData: setLosers, offsetRef: losersOffsetRef, loadedRef: losersLoadedRef,
            hasMore: losersHasMore, setHasMore: setLosersHasMore,
            loading: loadingLosers, setLoading: setLoadingLosers,
            loadingMore: loadingMoreLosers, setLoadingMore: setLoadingMoreLosers,
        },
        near_high: {
            path: MOVERS_TAB_PATHS.near_high,
            setData: setNearHigh, offsetRef: nearHighOffsetRef, loadedRef: nearHighLoadedRef,
            hasMore: nearHighHasMore, setHasMore: setNearHighHasMore,
            loading: loadingNearHigh, setLoading: setLoadingNearHigh,
            loadingMore: loadingMoreNearHigh, setLoadingMore: setLoadingMoreNearHigh,
        },
        near_low: {
            path: MOVERS_TAB_PATHS.near_low,
            setData: setNearLow, offsetRef: nearLowOffsetRef, loadedRef: nearLowLoadedRef,
            hasMore: nearLowHasMore, setHasMore: setNearLowHasMore,
            loading: loadingNearLow, setLoading: setLoadingNearLow,
            loadingMore: loadingMoreNearLow, setLoadingMore: setLoadingMoreNearLow,
        },
    };

    // Fetches page(s) for one movers tab. isLoadMore=false always starts at
    // offset 0 (used for the initial load and for cache revalidation);
    // isLoadMore=true continues from that tab's own offset.
    //
    // A single MOVERS_BATCH_SIZE page of raw rows can shrink well below that
    // once ETFs, liquid funds, and disallowed tickers are filtered out client-
    // side (processMoversRows) — e.g. a "gainers" page stuffed with ETFs could
    // leave only a handful of real stocks. Rather than surface that half-empty
    // page, keep pulling subsequent pages until we've collected at least
    // MOVERS_INITIAL_ROWS (initial load) / MOVERS_LOAD_MORE_ROWS (load more)
    // *filtered* rows, or the table genuinely runs out. Capped at 6 pages
    // (~120 raw rows) so a tab that's almost entirely filtered can't loop
    // forever on every load.
    const fetchMoversTabPage = async (tabKey, { isLoadMore = false, isCancelled = () => false } = {}) => {
        const cfg = MOVERS_TAB_CONFIG[tabKey];
        if (!cfg) return;
        if (isLoadMore) {
            if (cfg.loadingMore || !cfg.hasMore) return;
            cfg.setLoadingMore(true);
        } else {
            cfg.setLoading(true);
        }
        try {
            const allowedSet = await ensureAllowedTickerSet();
            let offset = isLoadMore ? cfg.offsetRef.current : 0;
            const target = isLoadMore ? MOVERS_LOAD_MORE_ROWS : MOVERS_INITIAL_ROWS;

            const applyFreshPage = fresh => {
                if (isCancelled() || !Array.isArray(fresh)) return;
                const processed = processMoversRows(tabKey, fresh, allowedSet);
                cfg.setData(processed);
                cfg.offsetRef.current = fresh.length;
                cfg.setHasMore(fresh.length >= MOVERS_BATCH_SIZE);
                cfg.loadedRef.current = true;
                if (fresh[0]?.created_at) {
                    setLastUpdated(new Date(fresh[0].created_at).toLocaleString("en-IN", {
                        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
                    }));
                }
            };

            let accumulated = [];
            let hasMoreRaw = true;
            let firstRawRows = null;
            let page = 0;
            while (accumulated.length < target && hasMoreRaw && page < 6) {
                const pagePath = withPageParams(cfg.path, MOVERS_BATCH_SIZE, offset);
                // Only the very first page participates in SWR background
                // revalidation (onStale) — matches the previous single-page
                // behavior for cache freshness without complicating the
                // backfill loop's later pages.
                const rawRows = page === 0
                    ? await sbFetch(pagePath, userToken, {
                        ttl: MOVERS_TTL,
                        onStale: isLoadMore ? undefined : applyFreshPage,
                    })
                    : await sbFetch(pagePath, userToken, { ttl: MOVERS_TTL });

                if (isCancelled() || !Array.isArray(rawRows)) break;
                if (page === 0) firstRawRows = rawRows;
                offset += rawRows.length;
                hasMoreRaw = rawRows.length >= MOVERS_BATCH_SIZE;
                accumulated = accumulated.concat(processMoversRows(tabKey, rawRows, allowedSet));
                page++;
            }

            if (isCancelled()) return;

            if (isLoadMore) {
                cfg.setData(prev => mergeUniqueByTicker(prev, accumulated));
            } else {
                cfg.setData(accumulated);
            }
            cfg.offsetRef.current = offset;
            cfg.setHasMore(hasMoreRaw);
            cfg.loadedRef.current = true;
            if (!isLoadMore && firstRawRows?.[0]?.created_at) {
                setLastUpdated(new Date(firstRawRows[0].created_at).toLocaleString("en-IN", {
                    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
                }));
            }
        } catch (err) {
            if (!isCancelled()) {
                console.error(`Error fetching movers (${tabKey}):`, err);
                if (!isLoadMore) setError(`Failed to load market movers: ${err.message}`);
            }
        } finally {
            if (!isCancelled()) {
                if (isLoadMore) cfg.setLoadingMore(false);
                else cfg.setLoading(false);
            }
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // FETCH MARKET MOVERS — first page of all four tabs, in parallel, each via
    // its own query. Cheap (MOVERS_BATCH_SIZE rows each) and keeps hero-level
    // gainer/loser counts accurate without loading the whole market_movers table.
    // ─────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        setError(null);
        const fetchAllTabs = () => Promise.all(
            Object.keys(MOVERS_TAB_CONFIG).map(tabKey =>
                fetchMoversTabPage(tabKey, { isLoadMore: false, isCancelled: () => cancelled })
            )
        );
        fetchAllTabs();

        // Long-lived tabs never remount, so without this the effect above only
        // ever runs once and the UI is frozen on whatever was fetched at mount
        // — sbFetch's TTL is only checked when sbFetch is actually called again.
        // Re-invoke on the same cadence as MOVERS_TTL so a stale tab self-heals
        // once the DB's market_movers snapshot is recomputed, and also
        // revalidate whenever the tab regains focus/visibility (covers the
        // common case of a laptop sleeping/backgrounding past the interval).
        const intervalId = setInterval(fetchAllTabs, MOVERS_TTL);
        const onVisible = () => { if (document.visibilityState === "visible") fetchAllTabs(); };
        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener("focus", onVisible);

        return () => {
            cancelled = true;
            clearInterval(intervalId);
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener("focus", onVisible);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userToken]);

    // ─────────────────────────────────────────────────────────────────────────
    // FETCH VOLUME SHOCKERS
    // ─────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const mapRow = r => ({
                    ...r,
                    name: _nameMap.get(r.ticker) || r.name || null,
                    change_pct: r.open > 0 ? ((r.close - r.open) / r.open) * 100 : null,
                });
                const allowedSet = await ensureAllowedTickerSet();
                const applyFilter = rows => (rows || []).map(mapRow).filter(r => !isETF(r) && isAllowedTicker(r.ticker, allowedSet));

                const enrichNames = async rows => {
                    try {
                        const allTickers = [...new Set((rows || []).map(r => r.ticker).filter(Boolean))];
                        const missingTickers = allTickers.filter(t => !_nameMap.has(t));
                        if (missingTickers.length) {
                            const nameRows = await batchFetchBhavNames(missingTickers, userToken);
                            if (nameRows.length && !cancelled) {
                                setVolumeShockers(prev => applyNamesFromMap(prev).filter(r => !isETF(r) && isAllowedTicker(r.ticker, allowedSet)));
                            }
                        }
                    } catch (nameErr) {
                        console.warn("Could not enrich volume shocker names from bhav_copy:", nameErr.message);
                    }
                };

                // A single VOLUME_SHOCKERS_BATCH_SIZE page can shrink well below
                // that once ETFs / disallowed tickers are filtered out — keep
                // pulling subsequent pages until we've collected at least
                // MOVERS_INITIAL_ROWS filtered rows, or the table runs out
                // (capped at 6 pages, matching the movers tabs' backfill).
                let offset = 0;
                let accumulatedRaw = [];
                let accumulatedFiltered = [];
                let hasMoreRaw = true;
                let page = 0;
                while (accumulatedFiltered.length < MOVERS_INITIAL_ROWS && hasMoreRaw && page < 6) {
                    const pagePath = withPageParams(VOLUME_SHOCKERS_BASE_PATH, VOLUME_SHOCKERS_BATCH_SIZE, offset);
                    // Only the very first page participates in SWR background
                    // revalidation (onStale), matching the previous single-page
                    // behavior for cache freshness.
                    const vsData = page === 0
                        ? await sbFetch(pagePath, userToken, {
                            ttl: VOLUME_SHOCKERS_TTL,
                            // Stale cache is returned instantly above, but this fires a
                            // background refetch and pushes the fresh DB rows into state
                            // once they land — otherwise a stale localStorage snapshot
                            // could be shown indefinitely even after the DB updates.
                            onStale: fresh => {
                                if (cancelled) return;
                                setVolumeShockers(applyFilter(fresh));
                                setVolumeShockersHasMore((fresh || []).length >= VOLUME_SHOCKERS_BATCH_SIZE);
                                volumeShockersOffsetRef.current = (fresh || []).length;
                                enrichNames(fresh);
                            },
                        })
                        : await sbFetch(pagePath, userToken, { ttl: VOLUME_SHOCKERS_TTL });

                    if (cancelled || !Array.isArray(vsData)) break;
                    accumulatedRaw = accumulatedRaw.concat(vsData);
                    accumulatedFiltered = accumulatedFiltered.concat(applyFilter(vsData));
                    offset += vsData.length;
                    hasMoreRaw = vsData.length >= VOLUME_SHOCKERS_BATCH_SIZE;
                    page++;
                }

                if (cancelled) return;
                setVolumeShockers(accumulatedFiltered);
                setVolumeShockersHasMore(hasMoreRaw);
                volumeShockersOffsetRef.current = offset;
                await enrichNames(accumulatedRaw);
            } catch (err) {
                if (!cancelled) console.error("Error fetching volume shockers:", err);
            } finally {
                if (!cancelled) setLoadingVolumeShockers(false);
            }
        })();
        return () => { cancelled = true; };
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
    // ── RS data — now backed by Postgres RPCs (see migration.sql) ─────────────
    // get_rs_stocks_enriched() and get_rs_industry_summary() replace the old
    // TIRS_RS85_PATH + TIRS_ALL_PATH + RETURNS_PATH raw fetches and all of
    // buildReturnsMap/enrichRsStocks/the per-industry count-inside-map logic.
    // get_top_rs_stocks() replaces the indicators+returns join+rank assignment
    // that used to happen here for allRsStocks.
    useEffect(() => {
        let allowedSet = getAllowedTickerSetSync();

        function applyRsData(enrichedRows, summaryRows) {
            const filtered = (enrichedRows || []).filter(r => isAllowedTicker(r.ticker, allowedSet));
            setRsStocks(filtered);

            const returnsMap = new Map();
            filtered.forEach(r => returnsMap.set(r.ticker, { ret_3m: r.ret_3m, ret_6m: r.ret_6m, ret_12m: r.ret_12m }));
            stockReturnsMapRef.current = returnsMap;

            const uniqueInds = [...new Set(filtered.map(r => r.industry).filter(Boolean))].sort();
            setIndustries(uniqueInds);
            setLoadingIndustries(false);

            if (Array.isArray(summaryRows) && summaryRows.length) {
                setCachedRsIndustrySummary(summaryRows);
                persistentCacheSet(RS_SUMMARY_CACHE_KEY, summaryRows, RS_TTL);

                const totalsMap = new Map();
                summaryRows.forEach(r => {
                    const key = normalizeIndustryKey(r.industry);
                    if (key) totalsMap.set(key, r.total || r.count || 0);
                });
                setIndustryTotals(totalsMap);
            }
        }

        (async () => {
            // loadingRs / loadingIndustries are false when cache was available at mount.
            setError(null);
            try {
                allowedSet = await ensureAllowedTickerSet();

                const [enrichedRows, summaryRows] = await Promise.all([
                    sbFetch(RPC_RS_ENRICHED_PATH, userToken, {
                        ttl: RS_TTL,
                        onStale: fresh => applyRsData(fresh, cachedRsIndustrySummary),
                    }),
                    sbFetch(RPC_RS_SUMMARY_PATH, userToken, {
                        ttl: RS_TTL,
                        onStale: fresh => applyRsData(_cachedRs, fresh),
                    }),
                ]);
                applyRsData(enrichedRows, summaryRows);
                setLoadingRs(false);

                // ── Top 100 RS stocks — now one RPC call, joined+ranked server-side ──
                const buildAllRsStocks = topRows =>
                    (topRows || []).map(r => ({ ...r, name: _nameMap.get(r.ticker) || null }));

                const topRsRows = await sbFetch(RPC_TOP_RS_PATH, userToken, {
                    ttl: ALL_RS_TTL,
                    onStale: fresh => {
                        const enriched = buildAllRsStocks(fresh).filter(r => isAllowedTicker(r.ticker, allowedSet));
                        setAllRsStocks(enriched);
                        persistentCacheSet(ALL_RS_STOCKS_CACHE_KEY, enriched, ALL_RS_TTL);
                    },
                });

                const enriched = buildAllRsStocks(topRsRows).filter(r => isAllowedTicker(r.ticker, allowedSet));
                setAllRsStocks(enriched);
                persistentCacheSet(ALL_RS_STOCKS_CACHE_KEY, enriched, ALL_RS_TTL);

                // ── Enrich allRsStocks with names (only missing tickers) ──────
                try {
                    const allTickers = (topRsRows || []).map(r => r.ticker).filter(Boolean);
                    const missingTickers = [...new Set(allTickers)].filter(t => !_nameMap.has(t));
                    if (missingTickers.length) {
                        const nameRows = await batchFetchBhavNames(missingTickers, userToken);
                        if (nameRows.length) {
                            // _updateNameMap already called inside batchFetchBhavNames
                            setAllRsStocks(prev => applyNamesFromMap(prev).filter(r => isAllowedTicker(r.ticker, allowedSet)));
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
        if (isCompact && activeMobilePanel !== "leaders" && activeMobilePanel !== "movers") return;
        if (!industry || !industries.length) return;
        if (prefetchRef.current) clearTimeout(prefetchRef.current);
        prefetchRef.current = setTimeout(() => {
            const idx = industries.indexOf(industry);
            [industries[idx - 1], industries[idx + 1]].filter(Boolean).forEach(ind => {
                sbFetch(`company_financials?select=ticker,name&industry=eq.${encodeURIComponent(ind)}`, userToken, { ttl: 10 * 60 * 1000 }).catch(() => { });
            });
        }, 800);
        return () => clearTimeout(prefetchRef.current);
    }, [industry, industries, userToken, isCompact, activeMobilePanel]);


    // ────────────────────────────────────────────────────────────────────────────
    // LAZY LOAD company names when user drills into an industry
    // (returns are already populated at startup from the full stock_returns fetch)
    // ────────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (isCompact && activeMobilePanel !== "leaders") return;
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
    }, [industry, userToken, isCompact, activeMobilePanel]);
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

    // These reflect whichever movers tab is currently active, sourced from that
    // tab's own independent state (see MOVERS_TAB_CONFIG above).
    const activeMoversTabCfg = MOVERS_TAB_CONFIG[activeMoversTab];
    const loadingMovers = activeMoversTabCfg?.loading ?? false;
    const moversHasMore = activeMoversTabCfg?.hasMore ?? false;
    const loadingMoreMovers = activeMoversTabCfg?.loadingMore ?? false;

    // A tab that hasn't fetched its first page yet (e.g. lazily revisited after
    // an error) gets one; otherwise this just pages that tab forward.
    const loadMoreMovers = async () => {
        if (!activeMoversTabCfg) return;
        if (!activeMoversTabCfg.loadedRef.current) {
            await fetchMoversTabPage(activeMoversTab, { isLoadMore: false });
        } else {
            await fetchMoversTabPage(activeMoversTab, { isLoadMore: true });
        }
    };

    const loadMoreVolumeShockers = async () => {
        if (loadingMoreVolumeShockers || !volumeShockersHasMore) return;
        setLoadingMoreVolumeShockers(true);
        try {
            const allowedSet = await ensureAllowedTickerSet();
            const applyFilter = rows => (rows || []).map(r => ({
                ...r,
                name: _nameMap.get(r.ticker) || r.name || null,
                change_pct: r.open > 0 ? ((r.close - r.open) / r.open) * 100 : null,
            })).filter(r => !isETF(r) && isAllowedTicker(r.ticker, allowedSet));

            // Same backfill logic as the initial load: an ETF/disallowed-heavy
            // raw page can leave far fewer than MOVERS_LOAD_MORE_ROWS filtered
            // rows, so keep paging until we've added a full batch or the table
            // runs out (capped at 6 pages).
            let offset = volumeShockersOffsetRef.current;
            let accumulatedRaw = [];
            let accumulatedFiltered = [];
            let hasMoreRaw = true;
            let page = 0;
            while (accumulatedFiltered.length < MOVERS_LOAD_MORE_ROWS && hasMoreRaw && page < 6) {
                const pagePath = withPageParams(VOLUME_SHOCKERS_BASE_PATH, VOLUME_SHOCKERS_BATCH_SIZE, offset);
                const batch = await sbFetch(pagePath, userToken, { ttl: VOLUME_SHOCKERS_TTL });
                if (!Array.isArray(batch) || batch.length === 0) { hasMoreRaw = false; break; }
                accumulatedRaw = accumulatedRaw.concat(batch);
                accumulatedFiltered = accumulatedFiltered.concat(applyFilter(batch));
                offset += batch.length;
                hasMoreRaw = batch.length >= VOLUME_SHOCKERS_BATCH_SIZE;
                page++;
            }

            if (accumulatedRaw.length === 0) {
                setVolumeShockersHasMore(false);
                return;
            }

            setVolumeShockers(prev => mergeUniqueByTicker(prev, accumulatedFiltered));
            volumeShockersOffsetRef.current = offset;
            setVolumeShockersHasMore(hasMoreRaw);

            try {
                const allTickers = [...new Set(accumulatedRaw.map(r => r.ticker).filter(Boolean))];
                const missingTickers = allTickers.filter(t => !_nameMap.has(t));
                if (missingTickers.length) {
                    await batchFetchBhavNames(missingTickers, userToken);
                    setVolumeShockers(prev => applyNamesFromMap(prev).filter(r => !isETF(r) && isAllowedTicker(r.ticker, allowedSet)));
                }
            } catch (nameErr) {
                console.warn("Could not enrich additional volume shocker names from bhav_copy:", nameErr.message);
            }
        } catch (err) {
            console.error("Error loading more volume shockers:", err);
        } finally {
            setLoadingMoreVolumeShockers(false);
        }
    };

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
            background: D.shellBg, padding: isCompact ? "12px 10px 24px" : "20px 20px 32px",
            fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif",
            animation: "sdFadeIn 0.3s ease",
        }}>

            {/* â”€â”€ ERROR BANNER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <div style={{ width: "100%", maxWidth: 1400, margin: "0 auto" }}>
                {error && (
                    <div style={{
                        display: "flex", alignItems: "flex-start", gap: 10,
                        padding: "12px 16px", marginBottom: 16, borderRadius: 14,
                        background: D.negSoft,
                        border: `1px solid ${withAlpha(D.neg || "#ef4444", 0.22)}`,
                        fontSize: 16.5, color: D.negText || D.neg,
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
                            color: "inherit", fontSize: 18, lineHeight: 1, padding: 0,
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
                        borderRadius: 12,
                        background: D.isDark ? "#12161d" : "#f1f2ef",
                        border: `1px solid ${D.panelBorder}`,
                        position: "sticky",
                        top: 0,
                        zIndex: 20,
                        boxShadow: D.shadowMd,
                    }}>
                        {[
                            { id: "pulse", label: "Market Pulse" },
                            { id: "movers", label: "Movers" },
                            { id: "leaders", label: "RS Leaders" },
                        ].map(tab => {
                            const active = activeMobilePanel === tab.id;
                            return (
                                <button key={tab.id} onClick={() => setActiveMobilePanel(tab.id)} style={{
                                    position: "relative",
                                    minHeight: 40,
                                    border: "none",
                                    borderRadius: 9,
                                    background: active ? D.card : "transparent",
                                    boxShadow: active ? D.shadowMd.split(",")[0] : "none",
                                    color: active ? D.text : D.muted,
                                    cursor: "pointer",
                                    fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
                                    fontSize: 13.5,
                                    fontWeight: active ? 700 : 600,
                                    letterSpacing: "-0.005em",
                                    padding: "8px 6px",
                                    whiteSpace: "normal",
                                    lineHeight: 1.2,
                                    transition: "color 0.18s ease, background 0.18s ease",
                                    outline: "none",
                                }}>
                                    {tab.label}
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
                                        {/*<TabButton T={D} active={activeMoversTab === "near_high"} label={isCompact ? "52W High" : "Near 52W High"} count={nearHigh.length} onClick={() => setActiveMoversTab("near_high")} hideCount={isCompact} />*/}
                                        {/*<TabButton T={D} active={activeMoversTab === "near_low"} label={isCompact ? "52W Low" : "Near 52W Low"} count={nearLow.length} onClick={() => setActiveMoversTab("near_low")} hideCount={isCompact} />*/}
                                        <TabButton T={D} active={activeMoversTab === "volume_shockers"} label={isCompact ? "Vol Shockers" : "Volume Shockers"} count={volumeShockers.length} onClick={() => setActiveMoversTab("volume_shockers")} hideCount={isCompact} />
                                    </TabBar>
                {activeMoversTab === "volume_shockers"
                    ? <VolumeShockersTable key="volume_shockers" T={D} data={volumeShockers} loading={loadingVolumeShockers} isCompact={isCompact} hasMore={volumeShockersHasMore} loadingMore={loadingMoreVolumeShockers} onLoadMore={loadMoreVolumeShockers} />
                    : <MoversTable key={activeMoversTab} T={D} data={currentMoversData} loading={loadingMovers} type={activeMoversTab} isCompact={isCompact} hasMore={moversHasMore} loadingMore={loadingMoreMovers} onLoadMore={loadMoreMovers} />
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
                                                fontSize: 15,
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
                                                fontSize: 16.5,
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

                {/* â”€â”€ TREND TEMPLATE (MINERVINI) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                {/* Own standalone card — shown regardless of which mobile tab (pulse/movers/
                    leaders) is active, since it isn't one of the tabbed panels above. */}
                <TrendTemplateCard T={D} userToken={userToken} onTickerClick={onTickerClick} isCompact={isCompact} />

                <style>{`
                .stock-dashboard-shell * {
                    box-sizing: border-box;
                }
                .stock-dashboard-shell {
                    font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
                    font-size: 14px;
                    line-height: 1.5;
                    color: ${D.text};
                    -webkit-font-smoothing: antialiased;
                    -moz-osx-font-smoothing: grayscale;
                }
                .stock-dashboard-shell button {
                    outline: none;
                }
                .stock-dashboard-shell button:focus-visible {
                    box-shadow: 0 0 0 3px ${withAlpha(D.accent, 0.18)};
                }
                .stock-dashboard-shell ::-webkit-scrollbar {
                    height: 9px;
                    width: 9px;
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

function LoadMoreRowsButton({ T, visibleCount, totalCount, hasMore = false, loading = false, onLoadMore }) {
    if (visibleCount >= totalCount && !hasMore) return null;
    const remaining = Math.max(totalCount - visibleCount, 0);
    const step = Math.min(MOVERS_LOAD_MORE_ROWS, remaining || MOVERS_LOAD_MORE_ROWS);
    return (
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 12 }}>
            <button
                type="button"
                onClick={onLoadMore}
                disabled={loading}
                style={{
                    padding: "8px 14px",
                    borderRadius: 999,
                    border: `1px solid ${T.panelBorder}`,
                    background: T.pillBg,
                    color: T.text,
                    fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
                    fontSize: 14.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: T.isDark ? "none" : "0 4px 12px rgba(15,23,42,0.06)",
                    opacity: loading ? 0.65 : 1,
                }}
            >
                {loading ? "Loading..." : "Show more"}
            </button>
        </div>
    );
}
