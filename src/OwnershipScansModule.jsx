import { useState, useEffect, useMemo, useDeferredValue, startTransition } from "react";

// ─── SUPABASE ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
function sbH() {
  return { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
}

// Fetch with a 20-second timeout — prevents infinite hang if office network
// silently drops requests to the Supabase server.
async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } catch (e) {
    if (e?.name === "AbortError") throw new Error("Request timed out. Your network may be blocking access to the data server.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ─── CACHE (7-day localStorage TTL) ──────────────────────────────────────────
const CACHE_KEY    = "ownership_processed_v10";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// This used to be a fixed floor of 500 rows, sized for the old RPC path
// which pulled from the full raw shareholding universe. Now that data comes
// straight from ownership_metrics (see fetchOwnershipMetricsTable), the real
// row count can legitimately be smaller — and a fixed 500-row floor meant
// cacheRead/cacheWrite silently rejected every fetch below that number,
// so the cache could never populate and *every* page open paid the full
// network + normalization cost. Replaced with a low sanity floor (rejects
// only genuinely empty/broken responses) plus a self-calibrating check
// against the last known-good fetch size (rejects a response that's
// suspiciously smaller than history, e.g. a network hiccup mid-pagination).
const MIN_SANITY_FLOOR = 20;
const LAST_GOOD_COUNT_KEY = "ownership_last_good_count";

function getLastGoodCount() {
  try { return Number(localStorage.getItem(LAST_GOOD_COUNT_KEY)) || 0; } catch { return 0; }
}
function setLastGoodCount(n) {
  try { localStorage.setItem(LAST_GOOD_COUNT_KEY, String(n)); } catch {}
}
function looksCompleteCount(count) {
  if (!Number.isFinite(count) || count < MIN_SANITY_FLOOR) return false;
  const lastGood = getLastGoodCount();
  if (lastGood > 0 && count < lastGood * 0.5) return false;
  return true;
}

function cacheRead() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, processed } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    if (!Array.isArray(processed) || !looksCompleteCount(processed.length)) return null;
    return { processed, ts };
  } catch { return null; }
}

function cacheWrite(processed) {
  if (!Array.isArray(processed) || !looksCompleteCount(processed.length)) return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), processed }));
    setLastGoodCount(processed.length);
  } catch {}
}

function assertCompleteUniverse(processed, sourceCount) {
  if (Array.isArray(processed) && looksCompleteCount(processed.length)) return;
  if (Number.isFinite(sourceCount) && sourceCount > 0 && processed.length / sourceCount >= 0.12) return;
  const scanned = Array.isArray(processed) ? processed.length : 0;
  const fetched = Number.isFinite(sourceCount) ? ` from ${sourceCount} fetched rows` : "";
  throw new Error(`Ownership scan loaded only ${scanned}${fetched}. Please retry; the data server returned an incomplete response.`);
}

function cacheInvalidate() {
  try { localStorage.removeItem(CACHE_KEY); } catch {}
  if (window.__ownershipInit) {
    window.__ownershipInit.refreshing = true;
    window.__ownershipInit.fetchedAt  = 0;
  }
  _prefetchPromise = null;
}

function initFromCacheIfPossible() {
  if (window.__ownershipInit) return window.__ownershipInit;
  const cached = cacheRead();
  if (!cached) return null;
  const age = Date.now() - cached.ts;
  window.__ownershipInit = {
    processed: cached.processed,
    loading: false,
    refreshing: age > FRESH_MS,
    cacheAge: age,
    fetchedAt: cached.ts,
  };
  return window.__ownershipInit;
}

function isTimeoutLikeError(e) {
  const msg = String(e?.message || "");
  return e?.code === "57014" || /timeout|statement timeout|cancelling statement/i.test(msg);
}

// ─── BACKGROUND PREFETCH ─────────────────────────────────────────────────────
let _prefetchPromise = null;
// Resolves with a small, fast slice of stocks on a genuinely cold start (no
// cache at all). Anything awaiting `_prefetchPromise` can race this instead
// so the tab can paint real data long before the full universe fetch lands.
// Always cleared once the full fetch resolves — it never outlives its use.
let _previewPromise = null;
const FRESH_MS = 5 * 60 * 1000;

export function prefetchOwnershipData() {
  if (window.__ownershipInit && !window.__ownershipInit.loading && !window.__ownershipInit.refreshing) {
    return Promise.resolve();
  }

  initFromCacheIfPossible();

  if (window.__ownershipInit && !window.__ownershipInit.loading && !window.__ownershipInit.refreshing) {
    return Promise.resolve();
  }

  if (_prefetchPromise) return _prefetchPromise;

  const isColdStart = !window.__ownershipInit;
  if (!window.__ownershipInit) {
    window.__ownershipInit = { processed: [], loading: true, refreshing: false, cacheAge: null, fetchedAt: null };
  }

  if (isColdStart) {
    _previewPromise = fetchOwnershipPreview()
      .then((previewRows) => {
        // Only apply if the full fetch hasn't already won the race.
        if (previewRows.length && window.__ownershipInit?.loading) {
          window.__ownershipInit = { ...window.__ownershipInit, processed: previewRows, partial: true };
        }
        return previewRows;
      })
      .catch(() => []);
  }

  _prefetchPromise = fetchOwnershipUniverse().then((processed) => {
    assertCompleteUniverse(processed, processed.length);
    cacheWrite(processed);
    window.__ownershipInit = {
      processed,
      loading: false, refreshing: false, cacheAge: 0,
      fetchedAt: Date.now(),
    };
    _previewPromise = null;
  }).catch(() => {
    initFromCacheIfPossible();
    _prefetchPromise = null;
    _previewPromise = null;
  });
  return _prefetchPromise;
}

// Kick off loading the moment this module is evaluated — e.g. as soon as a
// lazily-loaded chunk finishes downloading — instead of waiting for the
// Ownership component to actually mount. On a cold tab visit this overlaps
// the network fetch with whatever render work the app is still doing, so by
// the time the component mounts there's a decent chance data (or at least
// the in-flight promise) is already there to grab.
if (typeof window !== "undefined") {
  prefetchOwnershipData();
}

// ─── PAGINATED FETCH (parallel) ───────────────────────────────────────────────
async function fetchAllPages(path) {
  const PAGE = 250;
  let offset = 0, all = [];
  while (true) {
    const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { ...sbH(), Range: `${offset}-${offset + PAGE - 1}`, "Range-Unit": "items" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} on ${path}`);
    const page = await res.json();
    if (!Array.isArray(page) || page.length === 0) break;
    all = all.concat(page);
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

// ─── SHAREHOLDING FETCH WITH FALLBACK ─────────────────────────────────────────
// BUG FIX: The `name` column may not exist on company_shareholding in some
// environments, causing HTTP 500. We try with name first, then fall back to
// ticker+quarterly only. Names are then enriched from company_financials.
async function fetchShareholding() {
  const variants = [
    "company_shareholding?select=ticker,name,quarterly",
    "company_shareholding?select=ticker,quarterly",
  ];

  let lastError = null;
  for (const path of variants) {
    try {
      return await fetchAllPages(path);
    } catch (err) {
      lastError = err;
      console.warn(`[Ownership] fetchShareholding: ${path} failed (${err?.message}), trying next variant`);
    }
  }

  throw lastError || new Error("Failed to fetch company_shareholding");
}

// The ownership_metrics table is precomputed in Postgres — every column the
// UI needs (latest %, deltas, trends, score, signal) is already sitting
// there, so reading it directly is a single paginated SELECT with zero
// client-side computation. This replaces the old RPC call, which was doing
// (or re-doing) that computation server-side on every request.
const OWNERSHIP_METRICS_TABLE = "ownership_metrics";

// Small, fast slice used only to paint something real on a genuinely cold
// start (empty cache, nothing pre-warmed). Kept low enough that Postgres can
// return it quickly, and short-timeout so a slow response just gets ignored
// rather than delaying anything — the full fetch below is always the source
// of truth and this is purely a "look instant" optimization.
const OWNERSHIP_PREVIEW_LIMIT = 150;
const OWNERSHIP_PREVIEW_TIMEOUT_MS = 6000;

async function fetchOwnershipMetricsTable() {
  const rows = await fetchAllPages(`${OWNERSHIP_METRICS_TABLE}?select=*`);
  const normalized = normalizeOwnershipRows(Array.isArray(rows) ? rows : []);
  return enrichOwnershipNames(normalized);
}

async function fetchOwnershipPreview() {
  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/${OWNERSHIP_METRICS_TABLE}?select=*&limit=${OWNERSHIP_PREVIEW_LIMIT}`,
    { headers: sbH() },
    OWNERSHIP_PREVIEW_TIMEOUT_MS
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ownership preview`);
  const rows = await res.json();
  const normalized = normalizeOwnershipRows(Array.isArray(rows) ? rows : []);
  return enrichOwnershipNames(normalized);
}

// ─── QUARTERLY DETAIL CACHE (per-ticker; memory + localStorage) ─────────────
// Quarterly shareholding only updates once a quarter, so there's no reason
// to hit the network every time a user opens (or reopens) a stock's
// drilldown. Two tiers: an in-memory Map for instant repeat-opens within the
// same tab session, backed by a localStorage store (24h TTL, capped entry
// count) so it also survives a page reload.
const QUARTERLY_CACHE_KEY = "ownership_quarterly_cache_v1";
const QUARTERLY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const QUARTERLY_CACHE_MAX_ENTRIES = 400; // caps localStorage growth as users browse more stocks

const _quarterlyMemCache = new Map();

function readQuarterlyCacheStore() {
  try {
    const raw = localStorage.getItem(QUARTERLY_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function writeQuarterlyCacheStore(store) {
  try { localStorage.setItem(QUARTERLY_CACHE_KEY, JSON.stringify(store)); } catch {}
}

function getCachedQuarterlyDetail(ticker) {
  const mem = _quarterlyMemCache.get(ticker);
  if (mem && Date.now() - mem.ts <= QUARTERLY_CACHE_TTL_MS) return mem.data;

  const entry = readQuarterlyCacheStore()[ticker];
  if (entry && Date.now() - entry.ts <= QUARTERLY_CACHE_TTL_MS) {
    _quarterlyMemCache.set(ticker, entry); // promote to memory for next time
    return entry.data;
  }
  return null;
}

function setCachedQuarterlyDetail(ticker, data) {
  const entry = { data, ts: Date.now() };
  _quarterlyMemCache.set(ticker, entry);

  const store = readQuarterlyCacheStore();
  store[ticker] = entry;
  const keys = Object.keys(store);
  if (keys.length > QUARTERLY_CACHE_MAX_ENTRIES) {
    // Evict oldest entries first so this can't grow without bound.
    keys.sort((a, b) => (store[a]?.ts || 0) - (store[b]?.ts || 0));
    for (let i = 0; i < keys.length - QUARTERLY_CACHE_MAX_ENTRIES; i++) delete store[keys[i]];
  }
  writeQuarterlyCacheStore(store);
}

// ─── ON-DEMAND PER-STOCK DETAIL (drilldown modal only) ───────────────────────
// The bulk universe fetch intentionally excludes full quarterly history (see
// normalizeOwnershipRow / processStock) to keep the list light. When a user
// opens a single stock's drilldown, fetch just that one row's history here —
// a single-row query, so it's fast regardless of how big the universe is.
async function fetchStockQuarterlyDetail(ticker) {
  if (!ticker) return [];
  const cached = getCachedQuarterlyDetail(ticker);
  if (cached) return cached;

  const res = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/company_shareholding?select=quarterly&ticker=eq.${encodeURIComponent(ticker)}&limit=1`,
    { headers: sbH() },
    10000
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching detail for ${ticker}`);
  const rows = await res.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return [];
  let q = [];
  try { q = typeof row.quarterly === "string" ? JSON.parse(row.quarterly) : row.quarterly || []; }
  catch { q = []; }
  q = [...q].sort((a, b) => dateKey(a.date).localeCompare(dateKey(b.date)));
  const result = q.map(normalizeOwnershipSeriesEntry).filter(Boolean);
  if (result.length) setCachedQuarterlyDetail(ticker, result);
  return result;
}

async function fetchLegacyOwnershipProcessed() {
  const [sh, mp] = await Promise.all([
    fetchShareholding(),
    fetchCompanyFinancialsMapping(),
  ]);
  const sectorMap = buildSectorMap(mp);
  const cfNames = buildCfNameMap(mp);
  const rawData = buildRawData(sh, mp, cfNames);
  const processed = await buildProcessedAsync(rawData, sectorMap);
  assertCompleteUniverse(processed, sh.length);
  return enrichOwnershipNames(processed);
}

async function fetchOwnershipUniverse() {
  try {
    const rows = await fetchOwnershipMetricsTable();
    if (Array.isArray(rows) && rows.length > 0) return rows;
  } catch (err) {
    console.warn("[Ownership] ownership_metrics fetch failed, falling back to legacy computation:", err?.message || err);
  }
  return fetchLegacyOwnershipProcessed();
}

async function fetchCompanyFinancialsMapping() {
  const variants = [
    "company_financials?select=nse_code,bse_code,sector,ticker,name",
    "company_financials?select=nse_code,sector,ticker,name",
    "company_financials?select=sector,ticker,name",
  ];

  let lastError = null;
  for (const path of variants) {
    try {
      return await fetchAllPages(path);
    } catch (err) {
      lastError = err;
    }
  }

  console.warn("[Ownership] company_financials mapping unavailable; continuing without sector enrichment.", lastError?.message || lastError);
  return [];
}

// ─── NAME CACHE (ticker → company name; localStorage, 30-day TTL) ───────────
// Company names essentially never change, but ownership_metrics' `name`
// column is frequently just the ticker echoed back (see looksLikeMissingName
// below), which means *every* row needs a bhav_copy lookup on a cold fetch.
// Caching resolved names for a month means that lookup only ever happens
// once per ticker, not once per cold load.
const NAME_CACHE_KEY = "ownership_name_cache_v1";
const NAME_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function readNameCache() {
  try {
    const raw = localStorage.getItem(NAME_CACHE_KEY);
    if (!raw) return {};
    const { ts, map } = JSON.parse(raw);
    if (!map || Date.now() - ts > NAME_CACHE_TTL_MS) return {};
    return map;
  } catch { return {}; }
}

function writeNameCache(map) {
  try { localStorage.setItem(NAME_CACHE_KEY, JSON.stringify({ ts: Date.now(), map })); } catch {}
}

// ─── NAME ENRICHMENT (bhav_copy) ─────────────────────────────────────────────
// The ownership RPC's `name` column is unreliable (often null or just the
// ticker echoed back). bhav_copy always has real company names, so for any
// row whose name still looks like a bare ticker after normalization, look it
// up there. Scoped to just the tickers we need (in.() filter) rather than
// pulling the whole bhav_copy table, which has a row per ticker per day.
async function fetchBhavCopyNameMap(tickers) {
  const unique = [...new Set((tickers || []).map((t) => String(t || "").trim()).filter(Boolean))];
  if (unique.length === 0) return {};

  const map = {};
  const CHUNK = 150; // keep the in.() query string well under URL length limits
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const inList = chunk.map((t) => encodeURIComponent(t)).join(",");
    try {
      const rows = await fetchAllPages(
        `bhav_copy?select=ticker,name&ticker=in.(${inList})&order=date.desc`
      );
      for (const r of rows) {
        const t = String(r.ticker || "").trim();
        if (t && !map[t] && r.name) map[t] = r.name;
      }
    } catch (err) {
      console.warn("[Ownership] bhav_copy name enrichment failed for a chunk, skipping:", err?.message || err);
    }
  }
  return map;
}

// A name is "missing" if it's empty or if normalizeOwnershipRow's fallback
// left it equal to the ticker (see `name: row.name ?? row.ticker` above).
function looksLikeMissingName(row) {
  if (!row) return false;
  const name = String(row.name || "").trim();
  const ticker = String(row.ticker || "").trim();
  return !name || name.toUpperCase() === ticker.toUpperCase();
}

async function enrichOwnershipNames(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  const missing = rows.filter(looksLikeMissingName);
  if (missing.length === 0) return rows;

  // Serve as many names as possible from the cache first — only tickers
  // we've genuinely never resolved before hit the network.
  const nameCache = readNameCache();
  const stillMissing = missing.filter((r) => !nameCache[String(r.ticker || "").trim()]);

  let fetchedMap = {};
  if (stillMissing.length > 0) {
    fetchedMap = await fetchBhavCopyNameMap(stillMissing.map((r) => r.ticker)).catch(() => ({}));
    if (fetchedMap && Object.keys(fetchedMap).length > 0) {
      writeNameCache({ ...nameCache, ...fetchedMap });
    }
  }

  const combinedMap = { ...nameCache, ...fetchedMap };
  if (Object.keys(combinedMap).length === 0) return rows;

  return rows.map((r) => {
    const better = combinedMap[String(r.ticker || "").trim()];
    return better ? { ...r, name: better } : r;
  });
}


// ─── HELPERS ──────────────────────────────────────────────────────────────────
const safeNum = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const fmt     = (v, d = 2) => (v >= 0 ? "+" : "") + Number(v).toFixed(d);
const mono    = { fontFamily: "'IBM Plex Mono', monospace" };

function normalizeOwnershipSeriesEntry(entry) {
  if (!entry) return null;
  const period = entry.period ?? entry.period_date ?? entry.date ?? entry.latest_period_date ?? null;
  const label = entry.period_label ?? entry.fy_label ?? entry.label ?? (period ? String(period).slice(0, 10) : "");
  return {
    period: period ? String(period).slice(0, 10) : null,
    period_label: label,
    date: period ? String(period).slice(0, 10) : null,
    promoters: entry.promoters ?? entry.promoter ?? null,
    fiis: entry.fiis ?? entry.fii ?? null,
    diis: entry.diis ?? entry.dii ?? null,
    public: entry.public ?? entry.public_retail ?? null,
  };
}

function normalizeOwnershipRow(row) {
  if (!row) return null;
  const last4Source = Array.isArray(row.last4) ? row.last4 : [];
  // Deliberately NOT keeping full history (`allQuarterly`/`all_quarterly`) on
  // the bulk list objects — for a universe of hundreds/thousands of stocks
  // that's a lot of memory and CPU spent normalizing data that's only ever
  // looked at for the single stock a user opens in the drilldown. The modal
  // fetches its own full history on demand instead (see DrilldownModal).
  const { allQuarterly: _dropAQ, all_quarterly: _dropAQSnake, ...rowRest } = row;
  // ownership_metrics uses "_latest" column names (promoter_latest, fii_latest,
  // dii_latest, public_latest) — checked after the older aliases above so any
  // other source shape (RPC/legacy) still takes precedence where present.
  const fiiTrend = safeNum(row.fiiTrend ?? row.fii_trend);
  const diiTrend = safeNum(row.diiTrend ?? row.dii_trend);
  // ownership_metrics has no combined_flow column — derive it from the two
  // trend columns it does have, rather than silently defaulting to 0.
  const hasCombinedCol = row.combinedFlow != null || row.combined_flow != null;
  return {
    ...rowRest,
    ownPromoter: safeNum(row.ownPromoter ?? row.own_promoter ?? row.promoter_pct ?? row.promoter_latest ?? row.promoter),
    ownFii: safeNum(row.ownFii ?? row.own_fii ?? row.fii_pct ?? row.fii_latest ?? row.fii),
    ownDii: safeNum(row.ownDii ?? row.own_dii ?? row.dii_pct ?? row.dii_latest ?? row.dii),
    ownPublic: safeNum(row.ownPublic ?? row.own_public ?? row.public_pct ?? row.public_latest ?? row.public_retail ?? row.public),
    deltaFii: safeNum(row.deltaFii ?? row.delta_fii),
    deltaDii: safeNum(row.deltaDii ?? row.delta_dii),
    deltaPromoter: safeNum(row.deltaPromoter ?? row.delta_promoter),
    deltaPublic: safeNum(row.deltaPublic ?? row.delta_public),
    fiiTrend,
    diiTrend,
    promoterTrend: safeNum(row.promoterTrend ?? row.promoter_trend),
    publicTrend: safeNum(row.publicTrend ?? row.public_trend),
    combinedFlow: hasCombinedCol ? safeNum(row.combinedFlow ?? row.combined_flow) : fiiTrend + diiTrend,
    score: safeNum(row.score),
    accel: row.accel && typeof row.accel === "object"
      ? { fii: safeNum(row.accel.fii), dii: safeNum(row.accel.dii) }
      : { fii: 0, dii: 0 },
    anomalies: Array.isArray(row.anomalies) ? row.anomalies : [],
    last4: last4Source.map(normalizeOwnershipSeriesEntry).filter(Boolean),
    latestDate: row.latestDate ?? row.latest_date ?? row.latest_period_date ?? row.latest_period ?? null,
    inflect: row.inflect ?? null,
    sector: row.sector ?? "",
    name: row.name ?? row.ticker ?? "",
    ticker: row.ticker ?? "",
    signal: row.signal ?? "Noise",
    conviction: row.conviction ?? "Low",
    phase: row.phase ?? "Insufficient Data",
    timing: row.timing ?? "Early",
    dominance: row.dominance ?? "Balanced",
    insight: row.insight ?? row.story ?? null,
  };
}

function normalizeOwnershipRows(rows) {
  return (rows || []).map(normalizeOwnershipRow).filter(Boolean);
}

function dateKey(d) {
  if (!d) return "";
  if (/^\d{4}-\d{2}/.test(d)) return d.slice(0, 7);
  try {
    const mon = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
    const parts = d.trim().split(/\s+/);
    if (parts.length === 2) {
      const mi = mon.indexOf(parts[0].toLowerCase().slice(0, 3));
      if (mi >= 0) return `${parts[1]}-${String(mi + 1).padStart(2, "0")}`;
    }
  } catch {}
  return d;
}

function parseQuarterStamp(d) {
  const key = dateKey(d);
  const m = key.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!year || !month) return null;
  return year * 12 + (month - 1);
}

function getLatestContinuousQuarterly(qs, maxPoints = 4) {
  if (!Array.isArray(qs) || qs.length === 0) return [];
  const streak = [qs[qs.length - 1]];
  let prevStamp = parseQuarterStamp(qs[qs.length - 1]?.date);
  for (let i = qs.length - 2; i >= 0 && streak.length < maxPoints; i--) {
    const current = qs[i];
    const currentStamp = parseQuarterStamp(current?.date);
    if (prevStamp == null || currentStamp == null) break;
    if (prevStamp - currentStamp !== 3) break;
    streak.unshift(current);
    prevStamp = currentStamp;
  }
  return streak;
}

// ─── SCORING & SIGNALS ────────────────────────────────────────────────────────
function classifySignal(tFii, tDii, tProm) {
  if (tFii > 5 && tDii > 5)                             return "Aggressive Accumulation";
  if (tFii > 2 && tDii > 2)                             return "Strong Accumulation";
  if ((tFii > 1 && tDii >= 0) || (tDii > 1 && tFii >= 0)) return "Selective Accumulation";
  if (tProm > 1 && tFii <= 0.5 && tDii <= 0.5)         return "Promoter Led";
  if (tFii < -1 && tDii < -1)                           return "Distribution";
  return "Noise";
}
function detectPhase(qs) {
  if (qs.length < 3) return "Insufficient Data";
  const f = qs.slice(-3).map(q => safeNum(q.fiis));
  const d = qs.slice(-3).map(q => safeNum(q.diis));
  if (f[2] > f[1] && f[1] > f[0] && d[2] > d[1] && d[1] > d[0]) return "Accumulation Phase";
  if (f[2] < f[1] && f[1] < f[0] && d[2] < d[1] && d[1] < d[0]) return "Distribution Phase";
  if (f[2] > f[1] || d[2] > d[1]) return "Early Entry";
  return "Consolidation";
}
function findInflection(qs) {
  for (let i = qs.length - 1; i > 1; i--) {
    if (safeNum(qs[i].fiis) > safeNum(qs[i-1].fiis) && safeNum(qs[i-1].fiis) <= safeNum(qs[i-2]?.fiis || qs[i-1].fiis))
      return qs[i].date;
  }
  return null;
}
function classifyTiming(qs) {
  if (qs.length < 3) return "Early";
  const last2 = qs.slice(-2).map(q => safeNum(q.fiis));
  const prev2 = qs.slice(-4, -2).map(q => safeNum(q.fiis));
  const recentAvg = (last2[0] + last2[1]) / 2;
  const prevAvg   = prev2.length === 2 ? (prev2[0] + prev2[1]) / 2 : prev2[0] || 0;
  const flatThreshold = 0.2;
  if (recentAvg > prevAvg + flatThreshold) return "Recent";
  if (Math.abs(recentAvg - prevAvg) <= flatThreshold) return "Mature";
  return "Early";
}
function calcAcceleration(qs) {
  if (qs.length < 3) return { fii: 0, dii: 0 };
  const n = qs.length;
  const fiiLatestQoQ = safeNum(qs[n-1].fiis) - safeNum(qs[n-2].fiis);
  const fiiPrevQoQ   = safeNum(qs[n-2].fiis) - safeNum(qs[n-3].fiis);
  const diiLatestQoQ = safeNum(qs[n-1].diis) - safeNum(qs[n-2].diis);
  const diiPrevQoQ   = safeNum(qs[n-2].diis) - safeNum(qs[n-3].diis);
  return { fii: fiiLatestQoQ - fiiPrevQoQ, dii: diiLatestQoQ - diiPrevQoQ };
}
function detectAnomalies(qs, dFii, dDii, dProm) {
  const flags = [];
  if (Math.abs(dFii)  > 5) flags.push(dFii  > 0 ? "FII spike +" : "FII dump");
  if (Math.abs(dDii)  > 5) flags.push(dDii  > 0 ? "DII spike +" : "DII dump");
  if (dProm < -3)           flags.push("Promoter exit");
  return flags;
}
function buildOwnershipStory(qs, ownPromoter, ownFii, ownDii, tProm, tFii, tDii) {
  if (qs.length < 2) return null;
  const startDate = qs[0].date;
  const oldFii  = safeNum(qs[0].fiis);
  const oldDii  = safeNum(qs[0].diis);
  const fiiDominant = Math.abs(tFii) > Math.abs(tDii) * 1.4;
  const diiDominant = Math.abs(tDii) > Math.abs(tFii) * 1.4;
  if (tFii > 2 && tDii > 2) return `FII and DII have both accumulated significantly since ${startDate} — FII from ${oldFii.toFixed(1)}% to ${ownFii.toFixed(1)}%, DII from ${oldDii.toFixed(1)}% to ${ownDii.toFixed(1)}%. Dual institutional conviction.`;
  if (fiiDominant && tFii > 1) return `FII stake expanded from ${oldFii.toFixed(1)}% → ${ownFii.toFixed(1)}% since ${startDate} with DII relatively flat — foreign capital driving the ownership shift.`;
  if (diiDominant && tDii > 1) return `DII stake expanded from ${oldDii.toFixed(1)}% → ${ownDii.toFixed(1)}% since ${startDate} with FII relatively flat — domestic conviction trade.`;
  if (tFii < -1 && tDii < -1) return `FII reduced from ${oldFii.toFixed(1)}% → ${ownFii.toFixed(1)}% and DII from ${oldDii.toFixed(1)}% → ${ownDii.toFixed(1)}% since ${startDate} — coordinated institutional exit.`;
  return null;
}

// ─── PROCESS STOCK ────────────────────────────────────────────────────────────
function processStock(row, sectorMap) {
  let q = [];
  try { q = typeof row.quarterly === "string" ? JSON.parse(row.quarterly) : row.quarterly || []; }
  catch { q = []; }
  q = [...q].sort((a, b) => dateKey(a.date).localeCompare(dateKey(b.date)));
  if (q.length < 2) return null;

  const recentQ = getLatestContinuousQuarterly(q, 4);
  if (recentQ.length < 2) return null;

  const last   = recentQ[recentQ.length - 1];
  const prev   = recentQ[recentQ.length - 2];
  const fourth = recentQ[0];

  const ownPromoter = safeNum(last.promoters);
  const ownFii      = safeNum(last.fiis);
  const ownDii      = safeNum(last.diis);
  const ownPublic   = safeNum(last.public);

  const dFii  = ownFii      - safeNum(prev.fiis);
  const dDii  = ownDii      - safeNum(prev.diis);
  const dProm = ownPromoter - safeNum(prev.promoters);
  const dPub  = ownPublic   - safeNum(prev.public);

  const tFii  = ownFii      - safeNum(fourth.fiis);
  const tDii  = ownDii      - safeNum(fourth.diis);
  const tProm = ownPromoter - safeNum(fourth.promoters);
  const tPub  = ownPublic   - safeNum(fourth.public);

  const dataFactor = Math.min(recentQ.length / 4, 1);
  const rawScore   = tFii * 0.4 + tDii * 0.3 + tProm * 0.2 - (tPub > 3 ? 0.1 * tPub : 0);
  const score      = Math.tanh(rawScore) * 10 * dataFactor;
  const signal     = classifySignal(tFii, tDii, tProm);
  const phase      = detectPhase(recentQ);
  const inflect    = findInflection(recentQ);
  const conviction = score > 5 ? "High" : score >= 2 ? "Medium" : "Low";
  const timing     = classifyTiming(recentQ);
  const accel      = calcAcceleration(recentQ);
  const anomalies  = detectAnomalies(recentQ, dFii, dDii, dProm);
  const fiiAbs     = Math.abs(tFii), diiAbs = Math.abs(tDii);
  const dominance  = fiiAbs > diiAbs * 1.4 ? "FII Led" : diiAbs > fiiAbs * 1.4 ? "DII Led" : "Balanced";
  const story      = buildOwnershipStory(recentQ, ownPromoter, ownFii, ownDii, tProm, tFii, tDii);
  const sector     = sectorMap ? (sectorMap[row.ticker] || "") : "";

  let insight = "No meaningful institutional trend in the last 4 quarters";
  if (signal === "Aggressive Accumulation") insight = `FII added ${fmt(tFii)}% and DII added ${fmt(tDii)}% over 4Q — rare dual high-conviction entry`;
  else if (signal === "Strong Accumulation") insight = `FII ${fmt(tFii)}% and DII ${fmt(tDii)}% over 4Q — strong dual institutional conviction`;
  else if (signal === "Selective Accumulation") insight = tFii > tDii ? `FII ${fmt(tFii)}% over 4Q while DII neutral — selective foreign interest` : `DII ${fmt(tDii)}% over 4Q while FII neutral — domestic funds accumulating`;
  else if (signal === "Promoter Led") insight = `Promoter stake ${fmt(tProm)}% over 4Q with institutions flat — insider-driven move`;
  else if (signal === "Distribution") insight = `FII ${fmt(tFii)}% and DII ${fmt(tDii)}% over 4Q — coordinated institutional exit`;

  return {
    ticker: row.ticker, name: row.name,
    ownPromoter, ownFii, ownDii, ownPublic,
    deltaFii: dFii, deltaDii: dDii, deltaPromoter: dProm, deltaPublic: dPub,
    fiiTrend: tFii, diiTrend: tDii, promoterTrend: tProm, publicTrend: tPub,
    combinedFlow: tFii + tDii,
    score, signal, conviction, phase, inflect, insight,
    timing, accel, dominance, anomalies, story, sector,
    last4: recentQ, latestDate: last.date,
  };
}

// ─── SIGNAL CONFIG ────────────────────────────────────────────────────────────
const SIG = {
  "Aggressive Accumulation": { color: "#059669", bg: "rgba(5,150,105,0.08)",   border: "rgba(5,150,105,0.18)",   label: "Heavy Buying" },
  "Strong Accumulation":     { color: "#059669", bg: "rgba(5,150,105,0.06)",   border: "rgba(5,150,105,0.15)",   label: "Buying" },
  "Selective Accumulation":  { color: "#6b7280", bg: "rgba(107,114,128,0.06)", border: "rgba(107,114,128,0.15)", label: "Mild Buying" },
  "Promoter Led":            { color: "#2563eb", bg: "rgba(37,99,235,0.07)",   border: "rgba(37,99,235,0.18)",   label: "Promoter Buying" },
  "Distribution":            { color: "#dc2626", bg: "rgba(220,38,38,0.06)",   border: "rgba(220,38,38,0.18)",   label: "Selling" },
  "Noise":                   { color: "#94a3b8", bg: "transparent",            border: "rgba(148,163,184,0.14)", label: "No Clear Trend" },
};
const PHASE_CFG = {
  "Accumulation Phase": { color: "#10b981", icon: "↗" },
  "Early Entry":        { color: "#d97706", icon: "→" },
  "Distribution Phase": { color: "#dc2626", icon: "↘" },
  "Consolidation":      { color: "#6b7280", icon: "—" },
  "Insufficient Data":  { color: "#6b7280", icon: "?" },
};

// ─── SIGNAL BADGE ─────────────────────────────────────────────────────────────
function SignalBadge({ signal }) {
  const cfg = SIG[signal] || SIG["Noise"];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "3px 10px", borderRadius: 99,
      fontSize: 11, fontWeight: 600,
      background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.border}`,
      whiteSpace: "nowrap", letterSpacing: "0.02em",
    }}>
      {cfg.label}
    </span>
  );
}


// ─── DRILLDOWN MODAL ──────────────────────────────────────────────────────────
function DrilldownModal({ stock, T, onClose }) {
  const isDark = (T?.bg || "").toLowerCase() === "#060d1a";

  // Full history isn't carried on the bulk list anymore (see
  // normalizeOwnershipRow/processStock) — fetch it just for this one stock.
  // `stock.last4` (already in memory, no request needed) covers the chart
  // right away so the modal never shows a blank/empty state while it loads.
  const [detailQuarterly, setDetailQuarterly] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetchStockQuarterlyDetail(stock.ticker)
      .then((q) => { if (!cancelled && q.length) setDetailQuarterly(q); })
      .catch(() => {}); // best-effort — last4 fallback below still renders a useful chart
    return () => { cancelled = true; };
  }, [stock.ticker]);

  const qs = (detailQuarterly && detailQuarterly.length ? detailQuarterly : (stock.last4 || [])).filter(Boolean);
  const W = 520, H = 160;
  const series = [
    { key: "fiis",      label: "FII",      color: "#3b82f6" },
    { key: "diis",      label: "DII",      color: "#8b5cf6" },
    { key: "promoters", label: "Promoter", color: "#059669" },
    { key: "public",    label: "Public",   color: "#d97706" },
  ];
  const allVals = qs.flatMap(q => series.map(s => safeNum(q[s.key])));
  const mn = Math.min(...allVals), mx = Math.max(...allVals), r = mx - mn || 1;
  const gY = v => H - ((safeNum(v) - mn) / r) * (H - 20) - 10;
  const gX = i => (i / (qs.length - 1 || 1)) * (W - 40) + 20;
  const cfg = SIG[stock.signal] || SIG["Noise"];
  const pCfg = PHASE_CFG[stock.phase] || PHASE_CFG["Consolidation"];
  const quarterLabel = (q) => q?.period_label || q?.fy_label || q?.period || q?.date || "";
  const quarterKey = (q) => String(q?.period || q?.date || q?.period_label || "");
  const inflectIdx = stock.inflect ? qs.findIndex(q => quarterKey(q) === quarterKey({ period: stock.inflect })) : -1;
  const latestQuarterLabel = quarterLabel(qs[qs.length - 1]);
  const firstQuarterLabel = quarterLabel(qs[0]);

  const [isMobileModal, setIsMobileModal] = useState(
    typeof window !== "undefined" ? window.innerWidth <= 768 : false
  );
  useEffect(() => {
    const onResize = () => setIsMobileModal(window.innerWidth <= 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const chipPalette = ["#6366f1","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#14b8a6","#f97316"];
  const chipColor = chipPalette[stock.ticker.charCodeAt(0) % chipPalette.length];

  const borderStyle = isDark ? "rgba(148,163,184,0.10)" : "rgba(15,23,42,0.07)";
  const panelBg = isDark ? "rgba(255,255,255,0.02)" : "rgba(248,250,252,0.9)";

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: isDark ? "rgba(2,6,23,0.72)" : "rgba(15,23,42,0.48)",
      backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
      display: "flex",
      alignItems: isMobileModal ? "flex-end" : "center",
      justifyContent: "center",
      padding: isMobileModal ? 0 : 20,
    }} onClick={e => e.target === e.currentTarget && onClose()}>

      <style>{`
        @keyframes slideUp { from { transform: translateY(40px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @keyframes modalIn { from { transform: scale(0.96) translateY(8px); opacity: 0 } to { transform: scale(1) translateY(0); opacity: 1 } }
      `}</style>

      <div style={{
        background: isDark ? "rgba(11,18,33,0.98)" : "rgba(255,255,255,0.99)",
        border: `1px solid ${borderStyle}`,
        borderRadius: isMobileModal ? "20px 20px 0 0" : 20,
        width: isMobileModal ? "100vw" : "min(96vw, 760px)",
        height: isMobileModal ? "calc(92dvh - env(safe-area-inset-top, 0px))" : "auto",
        maxHeight: isMobileModal ? "calc(92dvh - env(safe-area-inset-top, 0px))" : "88vh",
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: isDark
          ? "0 -4px 0 rgba(255,255,255,0.04), 0 40px 100px rgba(0,0,0,0.5)"
          : "0 -1px 0 rgba(15,23,42,0.05), 0 40px 100px rgba(15,23,42,0.22)",
        animation: isMobileModal ? "slideUp .26s cubic-bezier(.16,1,.3,1)" : "modalIn .2s cubic-bezier(.16,1,.3,1)",
      }}>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: isMobileModal ? "14px 16px 12px" : "22px 28px 16px",
          flexShrink: 0,
          borderBottom: `1px solid ${borderStyle}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
            <div style={{
              width: 46, height: 46, borderRadius: 12, flexShrink: 0,
              background: `linear-gradient(180deg, ${chipColor}18 0%, ${chipColor}08 100%)`,
              border: `1px solid ${chipColor}28`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: chipColor, ...mono }}>{stock.ticker.slice(0,4)}</span>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: isMobileModal ? 17 : 20, fontWeight: 700, color: T.text, letterSpacing: "-0.025em", marginBottom: 3 }}>
                {stock.name || stock.ticker}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: T.subtext, ...mono }}>{stock.ticker}</span>
                {stock.sector && <span style={{ fontSize: 12, color: T.muted }}>· {stock.sector}</span>}
                <SignalBadge signal={stock.signal} />
                <span style={{ fontSize: 12, fontWeight: 600, color: pCfg.color }}>{pCfg.icon} {stock.phase}</span>
              </div>
              <div style={{ marginTop: 7, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{
                  fontSize: 10, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase",
                  color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 999, padding: "4px 10px"
                }}>
                  {qs.length ? `${qs.length} quarters` : "No quarterly data"}
                </span>
                {latestQuarterLabel && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: T.subtext,
                    background: isDark ? "rgba(255,255,255,0.03)" : "rgba(15,23,42,0.04)",
                    border: `1px solid ${borderStyle}`, borderRadius: 999, padding: "4px 10px"
                  }}>
                    Latest: {latestQuarterLabel}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            background: isDark ? "rgba(148,163,184,0.08)" : "rgba(15,23,42,0.05)",
            border: "none", cursor: "pointer", color: T.subtext,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, lineHeight: 1,
          }}>×</button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflow: "auto", padding: isMobileModal ? "14px 16px 24px" : "20px 28px 28px" }}>

          {/* Flow Summary */}
          <div style={{ border: `1px solid ${borderStyle}`, borderRadius: 16, padding: "14px 16px", marginBottom: 12, background: panelBg, boxShadow: isDark ? "0 10px 28px rgba(0,0,0,0.12)" : "0 10px 28px rgba(15,23,42,0.05)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: cfg.color, letterSpacing: ".1em", textTransform: "uppercase" }}>
                Summary · {latestQuarterLabel || stock.latestDate}
              </span>
              {stock.anomalies.length > 0 && (
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {stock.anomalies.map(a => (
                    <span key={a} style={{ fontSize: 9.5, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: "rgba(220,38,38,0.07)", color: "#dc2626", border: "1px solid rgba(220,38,38,0.18)", letterSpacing: ".02em" }}>⚠ {a}</span>
                  ))}
                </div>
              )}
            </div>
            <div style={{ fontSize: 13, color: T.text, lineHeight: 1.65, marginBottom: 12 }}>{stock.insight}</div>
            {stock.inflect && (
              <div style={{ fontSize: 11.5, color: T.subtext, marginBottom: 12 }}>
                Trend shift noted in: <strong style={{ color: T.text, ...mono }}>{stock.inflect}</strong>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: isMobileModal ? "repeat(3, 1fr)" : "repeat(6, 1fr)", gap: 0, borderRadius: 12, overflow: "hidden", border: `1px solid ${borderStyle}` }}>
              {[
                { label: "Score",    val: fmt(stock.score),              color: stock.score > 3 ? "#059669" : stock.score < -3 ? "#dc2626" : T.text },
                { label: "Confidence", val: stock.conviction,            color: stock.conviction === "High" ? "#059669" : T.subtext },
                { label: "Net Flow (4Q)", val: fmt(stock.combinedFlow) + "%", color: stock.combinedFlow > 0 ? "#059669" : "#dc2626" },
                { label: "How Fresh", val: stock.timing,                  color: stock.timing === "Recent" ? "#10b981" : T.subtext },
                { label: "Led By", val: stock.dominance,              color: stock.dominance === "Balanced" ? "#8b5cf6" : "#3b82f6" },
                { label: "Speeding Up?", val: fmt(stock.accel.fii) + "%", color: stock.accel.fii > 0 ? "#059669" : "#dc2626" },
              ].map((c, idx, arr) => (
                <div key={c.label} style={{
                  padding: "11px 12px",
                  background: isDark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.7)",
                  borderRight: idx < arr.length - 1 ? `1px solid ${borderStyle}` : "none",
                  borderBottom: isMobileModal && idx < 3 ? `1px solid ${borderStyle}` : "none",
                }}>
                  <div style={{ fontSize: 8.5, color: T.muted, letterSpacing: ".07em", textTransform: "uppercase", marginBottom: 4 }}>{c.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: c.color, ...mono }}>{c.val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Story */}
          {stock.story && (
            <div style={{ border: `1px solid ${borderStyle}`, borderRadius: 16, padding: "14px 16px", marginBottom: 12, background: panelBg }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: T.muted, letterSpacing: ".09em", textTransform: "uppercase", marginBottom: 8 }}>Ownership Story</div>
              <div style={{ fontSize: 13, color: T.text, lineHeight: 1.7 }}>{stock.story}</div>
            </div>
          )}

          {/* Position + Flow */}
          <div style={{ display: "grid", gridTemplateColumns: isMobileModal ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 12 }}>
            {[
              { title: "Who Owns What (Today)", items: [
                { label: "Promoter", val: stock.ownPromoter.toFixed(1) + "%", color: "#059669" },
                { label: "Foreign (FII)",      val: stock.ownFii.toFixed(1) + "%",      color: "#3b82f6" },
                { label: "Domestic (DII)",      val: stock.ownDii.toFixed(1) + "%",      color: "#8b5cf6" },
                { label: "Public",   val: stock.ownPublic.toFixed(1) + "%",   color: T.subtext },
              ]},
              { title: "What Changed (Last 4 Quarters)", items: [
                { label: "Foreign 4Q",    val: fmt(stock.fiiTrend) + "%",      color: stock.fiiTrend  > 0 ? "#059669" : "#dc2626" },
                { label: "Domestic 4Q",    val: fmt(stock.diiTrend) + "%",      color: stock.diiTrend  > 0 ? "#059669" : "#dc2626" },
                { label: "Foreign, Latest Qtr",   val: fmt(stock.deltaFii) + "%",      color: stock.deltaFii  > 0 ? "#059669" : "#dc2626" },
                { label: "Promoter 4Q", val: fmt(stock.promoterTrend) + "%", color: stock.promoterTrend > 0 ? "#059669" : "#dc2626" },
              ]},
            ].map(panel => (
              <div key={panel.title} style={{ border: `1px solid ${borderStyle}`, borderRadius: 16, overflow: "hidden", background: panelBg, boxShadow: isDark ? "0 10px 28px rgba(0,0,0,0.10)" : "0 10px 28px rgba(15,23,42,0.04)" }}>
                <div style={{ padding: "10px 14px 9px", borderBottom: `1px solid ${borderStyle}`, background: isDark ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.78)", fontSize: 9, fontWeight: 700, color: T.muted, letterSpacing: ".09em", textTransform: "uppercase" }}>{panel.title}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
                  {panel.items.map((c, idx, arr) => (
                    <div key={c.label} style={{ padding: "12px 10px 10px", borderRight: idx < arr.length - 1 ? `1px solid ${borderStyle}` : "none", background: isDark ? "transparent" : "rgba(255,255,255,0.62)" }}>
                      <div style={{ fontSize: 8.5, color: T.muted, marginBottom: 5, textTransform: "uppercase", letterSpacing: ".05em" }}>{c.label}</div>
                      <div style={{ fontSize: isMobileModal ? 14 : 17, fontWeight: 700, color: c.color, ...mono }}>{c.val}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div style={{ border: `1px solid ${borderStyle}`, borderRadius: 16, overflow: "hidden", marginBottom: 12, background: panelBg, boxShadow: isDark ? "0 10px 28px rgba(0,0,0,0.10)" : "0 10px 28px rgba(15,23,42,0.04)" }}>
            <div style={{ padding: "10px 14px 9px", borderBottom: `1px solid ${borderStyle}`, background: isDark ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.78)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: T.muted, letterSpacing: ".09em", textTransform: "uppercase" }}>
                Ownership Trend Over Time
              </div>
              <div style={{ fontSize: 11, color: T.subtext, ...mono }}>
                {firstQuarterLabel && latestQuarterLabel ? `${firstQuarterLabel} → ${latestQuarterLabel}` : latestQuarterLabel || firstQuarterLabel || ""}
              </div>
            </div>
            <div style={{ padding: "14px 12px 10px", background: isDark ? "transparent" : "rgba(255,255,255,0.7)" }}>
              <svg width="100%" viewBox={`0 0 ${W} ${H + 22}`} style={{ display: "block" }}>
                {[0, 0.33, 0.66, 1].map(f => {
                  const y = gY(mn + f * r);
                  return <line key={f} x1={20} x2={W - 20} y1={y} y2={y} stroke={T.border} strokeWidth="0.5" strokeDasharray="3,3" />;
                })}
                {series.map(s => (
                  <polyline key={s.key}
                    points={qs.map((q, i) => `${gX(i)},${gY(q[s.key])}`).join(" ")}
                    fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                ))}
                {inflectIdx > 0 && (
                  <g>
                    <line x1={gX(inflectIdx)} x2={gX(inflectIdx)} y1={8} y2={H - 5} stroke="#d97706" strokeWidth="1" strokeDasharray="4,3" />
                    <text x={gX(inflectIdx)} y={7} textAnchor="middle" fontSize="8" fill="#d97706">FII↑</text>
                  </g>
                )}
                {qs.map((q, i) => i % Math.max(1, Math.floor(qs.length / 5)) === 0 && (
                  <text key={i} x={gX(i)} y={H + 18} textAnchor="middle" fontSize="8" fill={T.muted}>
                    {quarterLabel(q)}
                  </text>
                ))}
              </svg>
              <div style={{ display: "flex", gap: 14, marginTop: 6, flexWrap: "wrap" }}>
                {series.map(s => (
                  <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 16, height: 2, background: s.color, borderRadius: 1 }} />
                    <span style={{ fontSize: 11, color: T.subtext }}>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quarterly table */}
          <div style={{ border: `1px solid ${borderStyle}`, borderRadius: 16, overflow: "hidden", background: panelBg, boxShadow: isDark ? "0 10px 28px rgba(0,0,0,0.10)" : "0 10px 28px rgba(15,23,42,0.04)" }}>
            <div style={{ padding: "10px 14px 9px", borderBottom: `1px solid ${borderStyle}`, background: isDark ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.78)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: T.muted, letterSpacing: ".09em", textTransform: "uppercase" }}>Quarterly Breakdown</div>
              <div style={{ fontSize: 11, color: T.subtext, ...mono }}>Latest first</div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                <thead>
                  <tr>
                    {["Quarter","Promoter","FII","DII","Public"].map(h => (
                      <th key={h} style={{ padding: "8px 14px", textAlign: h === "Quarter" ? "left" : "right", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".07em", color: T.muted, background: panelBg, borderBottom: `1px solid ${borderStyle}`, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...qs].reverse().slice(0, 8).map((q, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : (isDark ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.45)") }}>
                      <td style={{ padding: "10px 14px", fontSize: 12, borderTop: `1px solid ${borderStyle}`, color: T.text }}>
                        <div style={{ fontWeight: 700, ...mono }}>{quarterLabel(q)}</div>
                        <div style={{ fontSize: 10, color: T.muted, marginTop: 2, ...mono }}>{q.date || q.period || ""}</div>
                      </td>
                      {["promoters","fiis","diis","public"].map(k => (
                        <td key={k} style={{ padding: "10px 14px", fontSize: 12, borderTop: `1px solid ${borderStyle}`, textAlign: "right", ...mono, color: T.text }}>{safeNum(q[k]).toFixed(1)}%</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── DATA BUILDERS ────────────────────────────────────────────────────────────
function buildSectorMap(mapping) {
  const sMap = {};
  mapping.forEach(({ nse_code, sector, ticker }) => {
    if (ticker && sector) sMap[String(ticker).trim()] = sector;
    if (nse_code && sector) sMap[String(nse_code).trim()] = sector;
  });
  return sMap;
}
function buildCfNameMap(mapping) {
  const nMap = {};
  mapping.forEach(({ ticker, nse_code, name }) => {
    if (name) {
      if (ticker)   nMap[String(ticker).trim()]   = name;
      if (nse_code) nMap[String(nse_code).trim()] = name;
    }
  });
  return nMap;
}
function buildRawData(shareholding, mapping, cfNames = {}) {
  const bseDups = new Set();
  mapping.forEach(({ nse_code, bse_code }) => {
    if (nse_code && bse_code) bseDups.add(String(bse_code).trim());
  });
  return shareholding
    .filter(r => !bseDups.has(String(r.ticker).trim()))
    .map(r => ({
      ...r,
      name: cfNames[String(r.ticker).trim()] || r.name || r.ticker,
    }));
}
function buildProcessed(rawData, sectorMap) {
  return rawData.map(r => processStock(r, sectorMap)).filter(Boolean);
}
async function buildProcessedAsync(rawData, sectorMap) {
  const CHUNK = 200;
  const results = [];
  for (let i = 0; i < rawData.length; i += CHUNK) {
    const chunk = rawData.slice(i, i + CHUNK).map(r => processStock(r, sectorMap)).filter(Boolean);
    results.push(...chunk);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  // Deduplicate by normalised company name — safety net for when bse_code is
  // missing from company_financials (fallback fetch path) and BSE/NSE twins
  // both survive buildRawData's bseDups filter.
  const seenNames = new Set();
  return results.filter(s => {
    const key = (s.name || s.ticker).toLowerCase().trim();
    if (seenNames.has(key)) return false;
    seenNames.add(key);
    return true;
  });
}

function getInit() {
  if (window.__ownershipInit) return window.__ownershipInit;
  const cached = cacheRead();
  if (!cached) {
    window.__ownershipInit = { processed: [], loading: true, refreshing: false, cacheAge: null, fetchedAt: null };
    return window.__ownershipInit;
  }
  const age = Date.now() - cached.ts;
  window.__ownershipInit = {
    processed: cached.processed,
    loading:   false,
    refreshing: age > FRESH_MS,
    cacheAge:  age,
    fetchedAt: cached.ts,
  };
  return window.__ownershipInit;
}


// ─── METRIC DEFINITIONS (the 3 cards) ────────────────────────────────────────
const METRICS = {
  dii: {
    id: "dii",
    key: "diiTrend",
    cardTitle: "Domestic funds",
    cardSub: "Indian mutual funds & insurers",
    tableTitle: "Change in domestic fund holding",
    colHeader: "DII change",
    description: "Stocks ranked by how much Indian mutual funds and insurance companies have changed their stake over the last 4 quarters.",
    color: "#8b5cf6",
    icon: (c) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 21v-6h6v6" /><path d="M9 11h.01" /><path d="M15 11h.01" />
      </svg>
    ),
  },
  fii: {
    id: "fii",
    key: "fiiTrend",
    cardTitle: "Foreign funds",
    cardSub: "Overseas institutional investors",
    tableTitle: "Change in foreign fund holding",
    colHeader: "FII change",
    description: "Stocks ranked by how much foreign institutional investors have changed their stake over the last 4 quarters.",
    color: "#3b82f6",
    icon: (c) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.5 2.5 3.8 5.7 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.7-3.8-9s1.3-6.5 3.8-9z" />
      </svg>
    ),
  },
  both: {
    id: "both",
    key: "combinedFlow",
    cardTitle: "Foreign + domestic funds",
    cardSub: "Combined institutional buying",
    tableTitle: "Change in combined institutional holding",
    colHeader: "Combined change",
    description: "Stocks ranked by the combined change in stake from both foreign and domestic funds together over the last 4 quarters.",
    color: "#059669",
    icon: (c) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="9" r="3.2" /><circle cx="15.5" cy="9" r="3.2" /><path d="M2.5 20c0-3.3 2.5-5.8 5.5-5.8s5.5 2.5 5.5 5.8" /><path d="M11 20c0-3.3 2-5.8 4.5-5.8S20 16.7 20 20" />
      </svg>
    ),
  },
};

// ─── HOME CARD ────────────────────────────────────────────────────────────────
function MetricCard({ metric, count, risingCount, fallingCount, T, isDark, isMobile, onSelect }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={() => onSelect(metric.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        textAlign: "left", cursor: "pointer", width: "100%", fontFamily: "inherit",
        position: "relative", overflow: "hidden",
        background: isDark
          ? `linear-gradient(160deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.012) 100%)`
          : `linear-gradient(160deg, #ffffff 0%, #fbfbfd 100%)`,
        border: `1px solid ${hover ? `${metric.color}55` : T.border}`,
        borderRadius: 20,
        padding: isMobile ? "22px 20px" : "28px 26px",
        display: "flex", flexDirection: "column", gap: isMobile ? 16 : 22,
        boxShadow: hover
          ? (isDark ? `0 16px 40px rgba(0,0,0,0.35)` : `0 16px 40px rgba(15,23,42,0.10)`)
          : (isDark ? "0 1px 0 rgba(255,255,255,0.03)" : "0 1px 2px rgba(15,23,42,0.03)"),
        transform: hover ? "translateY(-3px)" : "translateY(0)",
        transition: "transform .22s cubic-bezier(.16,1,.3,1), box-shadow .22s, border-color .22s",
      }}
    >
      {/* ambient glow */}
      <div style={{
        position: "absolute", top: -60, right: -60, width: 160, height: 160, borderRadius: "50%",
        background: `radial-gradient(circle, ${metric.color}${isDark ? "26" : "18"} 0%, transparent 70%)`,
        pointerEvents: "none", opacity: hover ? 1 : 0.7, transition: "opacity .22s",
      }} />

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", position: "relative" }}>
        <div style={{
          width: 46, height: 46, borderRadius: 13, flexShrink: 0,
          background: `${metric.color}${isDark ? "1c" : "12"}`,
          border: `1px solid ${metric.color}30`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {metric.icon(metric.color)}
        </div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.subtext} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ opacity: hover ? 1 : 0.45, transform: hover ? "translateX(2px)" : "translateX(0)", transition: "all .2s", flexShrink: 0, marginTop: 4 }}>
          <path d="M5 12h14" /><path d="M13 6l6 6-6 6" />
        </svg>
      </div>

      <div style={{ position: "relative" }}>
        <div style={{ fontSize: isMobile ? 18 : 19, fontWeight: 700, color: T.text, letterSpacing: "-0.015em", marginBottom: 4 }}>
          {metric.cardTitle}
        </div>
        <div style={{ fontSize: 13, color: T.subtext, lineHeight: 1.5 }}>
          {metric.cardSub}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, position: "relative", paddingTop: 2, borderTop: `1px solid ${T.border}` }}>
        <div style={{ paddingTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#059669", ...mono }}>{risingCount.toLocaleString()} rising</div>
        </div>
        <div style={{ width: 3, height: 3, borderRadius: "50%", background: T.subtext, opacity: 0.5, marginTop: 14 }} />
        <div style={{ paddingTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", ...mono }}>{fallingCount.toLocaleString()} falling</div>
        </div>
        <div style={{ marginLeft: "auto", paddingTop: 14, fontSize: 11, color: T.subtext, ...mono }}>{count.toLocaleString()} tracked</div>
      </div>
    </button>
  );
}

// ─── TABLE ROW ────────────────────────────────────────────────────────────────
function MetricTableRow({ stock, metric, rank, T, isDark, onSelect, isMobile }) {
  const chipPalette = ["#6366f1","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#14b8a6","#f97316"];
  const chipColor = chipPalette[stock.ticker.charCodeAt(0) % chipPalette.length];
  const val = stock[metric.key] ?? 0;
  const valColor = val > 0 ? "#059669" : val < 0 ? "#dc2626" : T.subtext;

  if (isMobile) {
    return (
      <button onClick={() => onSelect(stock)} style={{
        width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit",
        display: "flex", alignItems: "center", gap: 12, padding: "14px 4px",
        background: "transparent", border: "none", borderBottom: `1px solid ${T.border}`,
      }}>
        <span style={{ width: 20, fontSize: 11, color: T.subtext, ...mono, flexShrink: 0 }}>{rank}</span>
        <div style={{ width: 36, height: 36, borderRadius: 9, flexShrink: 0, background: `${chipColor}15`, border: `1px solid ${chipColor}28`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 8, fontWeight: 800, color: chipColor, ...mono }}>{stock.ticker.slice(0, 4)}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{stock.name || stock.ticker}</div>
          <div style={{ fontSize: 11, color: T.subtext, marginTop: 1 }}>{stock.sector || stock.ticker}</div>
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: valColor, ...mono, flexShrink: 0 }}>{fmt(val)}%</span>
      </button>
    );
  }

  return (
    <button onClick={() => onSelect(stock)} style={{
      width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit",
      display: "flex", alignItems: "center", gap: 16, padding: "13px 18px",
      background: "transparent", border: "none", borderBottom: `1px solid ${T.border}`,
      transition: "background .12s",
    }}
      onMouseEnter={e => e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.025)" : "rgba(15,23,42,0.02)"}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
    >
      <span style={{ width: 26, fontSize: 12, color: T.subtext, ...mono, flexShrink: 0 }}>{rank}</span>
      <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: `${chipColor}15`, border: `1px solid ${chipColor}28`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 8.5, fontWeight: 800, color: chipColor, ...mono }}>{stock.ticker.slice(0, 4)}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14.5, fontWeight: 600, color: T.text }}>{stock.name || stock.ticker}</span>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: "#6366f1", background: isDark ? "rgba(99,102,241,0.15)" : "#eef2ff", padding: "1px 7px", borderRadius: 5, ...mono }}>{stock.ticker}</span>
        </div>
        {stock.sector && <div style={{ fontSize: 12, color: T.subtext, marginTop: 2 }}>{stock.sector}</div>}
      </div>
      {metric.id === "both" && (
        <div style={{ display: "flex", gap: 18, flexShrink: 0 }}>
          <div style={{ textAlign: "right", minWidth: 64 }}>
            <div style={{ fontSize: 9.5, color: T.subtext, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Foreign</div>
            <div style={{ fontSize: 13, fontWeight: 700, ...mono, color: stock.fiiTrend > 0 ? "#059669" : stock.fiiTrend < 0 ? "#dc2626" : T.subtext }}>{fmt(stock.fiiTrend)}%</div>
          </div>
          <div style={{ textAlign: "right", minWidth: 64 }}>
            <div style={{ fontSize: 9.5, color: T.subtext, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Domestic</div>
            <div style={{ fontSize: 13, fontWeight: 700, ...mono, color: stock.diiTrend > 0 ? "#059669" : stock.diiTrend < 0 ? "#dc2626" : T.subtext }}>{fmt(stock.diiTrend)}%</div>
          </div>
        </div>
      )}
      <div style={{ textAlign: "right", minWidth: 84, flexShrink: 0 }}>
        <div style={{ fontSize: 9.5, color: T.subtext, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{metric.id === "both" ? "Combined" : metric.colHeader}</div>
        <div style={{ fontSize: 15, fontWeight: 700, ...mono, color: valColor }}>{fmt(val)}%</div>
      </div>
    </button>
  );
}

// ─── LOADING SKELETON (home) ─────────────────────────────────────────────────
function HomeLoadingSkeleton({ T, isMobile }) {
  const pulse = {
    background: `linear-gradient(90deg, ${T.surface} 25%, ${T.tableHead} 50%, ${T.surface} 75%)`,
    backgroundSize: "200% 100%",
    animation: "shimmer 1.4s ease-in-out infinite",
    borderRadius: 8,
  };
  return (
    <div style={{ padding: isMobile ? "20px 16px" : "28px 32px", maxWidth: 1100, margin: "0 auto" }}>
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>
      <div style={{ ...pulse, width: 220, height: 26, marginBottom: 10 }} />
      <div style={{ ...pulse, width: 360, height: 14, marginBottom: 34 }} />
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: 16 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ border: `1px solid ${T.border}`, borderRadius: 20, padding: 26, display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ ...pulse, width: 46, height: 46, borderRadius: 13 }} />
            <div>
              <div style={{ ...pulse, width: "70%", height: 18, marginBottom: 8 }} />
              <div style={{ ...pulse, width: "90%", height: 13 }} />
            </div>
            <div style={{ ...pulse, width: "50%", height: 12 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function OwnershipScansModule({ T }) {
  const getIsMobile = () => (typeof window !== "undefined" ? window.innerWidth <= 768 : false);
  const isDark = (T?.bg || "").toLowerCase() === "#060d1a";
  const init = getInit();

  const [processed,  setProcessed]  = useState(() => init.processed);
  const [loading,    setLoading]    = useState(() => init.loading);
  const [refreshing, setRefreshing] = useState(() => init.refreshing);
  const [error,      setError]      = useState(null);
  const [selected,   setSelected]   = useState(null);
  const [isMobile,   setIsMobile]   = useState(getIsMobile);

  const [view, setView] = useState("home");        // 'home' | 'table'
  const [activeMetricId, setActiveMetricId] = useState(null);
  const [searchQ, setSearchQ] = useState("");
  const deferredSearchQ = useDeferredValue(searchQ);
  const [sortDir, setSortDir] = useState("desc");   // 'desc' = rising first, 'asc' = falling first
  const [visibleCount, setVisibleCount] = useState(20);
  const SHOW_MORE_STEP = 20;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setIsMobile(getIsMobile());
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    async function load() {
      setError(null);
      const w = initFromCacheIfPossible() || window.__ownershipInit;

      if (w && !w.loading && !w.refreshing) {
        setProcessed(w.processed);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (w && !w.loading && w.refreshing) {
        setProcessed(w.processed || []);
        setLoading(false);
        setRefreshing(true);
        // A previous background refresh may have already finished and
        // cleared _prefetchPromise, in which case there's nothing in
        // flight — without this, stale data would just sit there until the
        // 7-day cache TTL expires or a manual refresh, instead of quietly
        // updating in the background like it's supposed to.
        await (_prefetchPromise || prefetchOwnershipData());
        const fresh = window.__ownershipInit;
        if (fresh) setProcessed(fresh.processed);
        setRefreshing(false);
        return;
      }

      setLoading(true);
      let previewApplied = false;
      try {
        if (_prefetchPromise) {
          if (_previewPromise) {
            _previewPromise.then((previewRows) => {
              if (previewRows?.length && window.__ownershipInit?.partial) {
                previewApplied = true;
                setProcessed(previewRows);
                setLoading(false);
                setRefreshing(true);
              }
            }).catch(() => {});
          }
          await _prefetchPromise;
          const fresh = window.__ownershipInit || initFromCacheIfPossible();
          if (fresh?.processed) setProcessed(fresh.processed);
          setRefreshing(false);
        } else {
          const processed = await fetchOwnershipUniverse();
          assertCompleteUniverse(processed, processed.length);
          cacheWrite(processed);
          window.__ownershipInit = {
            processed,
            loading: false,
            refreshing: false,
            cacheAge: 0,
            fetchedAt: Date.now(),
          };
          setProcessed(processed);
        }
      } catch (e) {
        const cached = initFromCacheIfPossible();
        if (cached?.processed?.length) {
          setProcessed(cached.processed);
          setRefreshing(true);
          setError(null);
        } else if (previewApplied) {
          setRefreshing(false);
          setError(null);
        } else {
          try {
            const processed = await fetchLegacyOwnershipProcessed();
            cacheWrite(processed);
            window.__ownershipInit = {
              processed,
              loading: false,
              refreshing: false,
              cacheAge: 0,
              fetchedAt: Date.now(),
            };
            setProcessed(processed);
            setError(null);
          } catch (legacyErr) {
            setError(!isTimeoutLikeError(legacyErr) ? (legacyErr?.message || e.message || "Failed to load ownership data") : "Failed to load ownership data");
          }
        }
      }
      finally { setLoading(false); }
    }
    load();
  }, []);

  function handleRefresh() {
    cacheInvalidate();
    setLoading(true);
    const cached = initFromCacheIfPossible();
    if (cached?.processed?.length) {
      setProcessed(cached.processed);
      setRefreshing(true);
    }
    fetchOwnershipUniverse()
      .then((processed) => {
        assertCompleteUniverse(processed, processed.length);
        cacheWrite(processed);
        window.__ownershipInit = { processed, loading: false, refreshing: false, cacheAge: 0, fetchedAt: Date.now() };
        setProcessed(processed);
        setRefreshing(false);
      })
      .catch(() => {
        const fallback = initFromCacheIfPossible();
        if (fallback?.processed?.length) {
          window.__ownershipInit = { ...fallback, loading: false, refreshing: false };
          setProcessed(fallback.processed);
          setRefreshing(false);
          setError(null);
          return;
        }
        setError("Failed to load ownership data");
        setRefreshing(false);
      })
      .finally(() => setLoading(false));
  }

  // Counts for each metric card
  const metricCounts = useMemo(() => {
    const out = {};
    for (const id of Object.keys(METRICS)) {
      const key = METRICS[id].key;
      let rising = 0, falling = 0;
      for (const s of processed) {
        const v = s[key] ?? 0;
        if (v > 0) rising++; else if (v < 0) falling++;
      }
      out[id] = { rising, falling };
    }
    return out;
  }, [processed]);

  const activeMetric = activeMetricId ? METRICS[activeMetricId] : null;

  const tableRows = useMemo(() => {
    if (!activeMetric) return [];
    let list = processed;
    const q = deferredSearchQ.trim().toLowerCase();
    if (q) list = list.filter(x => x.ticker.toLowerCase().includes(q) || (x.name || "").toLowerCase().includes(q));
    return [...list].sort((a, b) => {
      const va = a[activeMetric.key] ?? 0, vb = b[activeMetric.key] ?? 0;
      return sortDir === "desc" ? vb - va : va - vb;
    });
  }, [processed, activeMetric, deferredSearchQ, sortDir]);

  function openMetric(id) {
    setActiveMetricId(id);
    setView("table");
    setSearchQ("");
    setSortDir("desc");
    setVisibleCount(20);
  }

  function goHome() {
    setView("home");
    setActiveMetricId(null);
  }

  useEffect(() => { setVisibleCount(20); }, [searchQ, sortDir]);

  const commitOwnershipChange = (fn) => startTransition(fn);

  // ─── LOADING ─────────────────────────────────────────────────────────────────
  if (loading) return <HomeLoadingSkeleton T={T} isMobile={isMobile} />;

  // ─── ERROR ───────────────────────────────────────────────────────────────────
  if (error) return (
    <div style={{ width: "100%", minHeight: "100%", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px", boxSizing: "border-box" }}>
      <div style={{ background: T.surface, border: `1px solid ${isDark ? "rgba(239,68,68,0.3)" : "#fecaca"}`, borderRadius: 14, padding: "24px 32px", textAlign: "center", maxWidth: 440, width: "100%" }}>
        <div style={{ fontSize: 20, marginBottom: 10 }}>⚠️</div>
        <div style={{ fontSize: 14, color: "#dc2626", marginBottom: 8, fontWeight: 700 }}>Failed to load ownership data</div>
        <div style={{ fontSize: 13, color: T.subtext, lineHeight: 1.65, marginBottom: 16 }}>{error}</div>
        <button onClick={handleRefresh} style={{ padding: "10px 20px", borderRadius: 8, border: `1.5px solid #dc2626`, background: "transparent", color: "#dc2626", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          Retry
        </button>
      </div>
    </div>
  );

  const shown = tableRows.slice(0, visibleCount);

  // ─── MAIN RENDER ─────────────────────────────────────────────────────────────
  return (
    <div style={{ width: "100%", minHeight: "100%", overflowY: "auto", boxSizing: "border-box", fontFamily: "inherit", color: T.text, background: T.bg }}>
      <div style={{ width: "100%", maxWidth: 1100, margin: "0 auto", padding: isMobile ? "20px 16px 40px" : "32px 32px 48px" }}>

        {view === "home" && (
          <>
            <div style={{ marginBottom: isMobile ? 24 : 34 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <h1 style={{ margin: 0, fontSize: isMobile ? 21 : 25, fontWeight: 700, letterSpacing: "-0.02em", color: T.text }}>Ownership</h1>
                {refreshing && <span style={{ fontSize: 10.5, fontWeight: 600, color: T.subtext, ...mono }}>updating…</span>}
              </div>
              <p style={{ margin: 0, fontSize: 14, color: T.subtext, lineHeight: 1.6, maxWidth: 560 }}>
                See where big investors are moving. Pick a group below to see which stocks they've been buying or selling the most. (YoY Change)
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: isMobile ? 14 : 18 }}>
              {Object.values(METRICS).map(m => (
                <MetricCard
                  key={m.id}
                  metric={m}
                  T={T}
                  isDark={isDark}
                  isMobile={isMobile}
                  count={processed.length}
                  risingCount={metricCounts[m.id]?.rising || 0}
                  fallingCount={metricCounts[m.id]?.falling || 0}
                  onSelect={openMetric}
                />
              ))}
            </div>
          </>
        )}

        {view === "table" && activeMetric && (
          <>
            <button onClick={goHome} style={{
              display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 18,
              background: "transparent", border: "none", cursor: "pointer", padding: "6px 0",
              color: T.subtext, fontSize: 13, fontWeight: 600, fontFamily: "inherit",
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5" /><path d="M11 18l-6-6 6-6" />
              </svg>
              All groups
            </button>

            <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 22, flexWrap: "wrap" }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: `${activeMetric.color}${isDark ? "1c" : "12"}`, border: `1px solid ${activeMetric.color}30`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {activeMetric.icon(activeMetric.color)}
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <h1 style={{ margin: "0 0 4px", fontSize: isMobile ? 18 : 21, fontWeight: 700, letterSpacing: "-0.015em", color: T.text }}>{activeMetric.tableTitle}</h1>
                <p style={{ margin: 0, fontSize: 13, color: T.subtext, lineHeight: 1.55, maxWidth: 560 }}>{activeMetric.description}</p>
              </div>
            </div>

            {/* Search + sort */}
            <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ position: "relative", flex: "1 1 260px", minWidth: 200 }}>
                <svg style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", opacity: 0.4, pointerEvents: "none" }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.text} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  placeholder="Search company or ticker…"
                  style={{ width: "100%", padding: "10px 14px 10px 36px", border: `1.5px solid ${T.border}`, borderRadius: 10, background: T.surface, color: T.text, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
                  onFocus={e => e.target.style.borderColor = activeMetric.color}
                  onBlur={e => e.target.style.borderColor = T.border}
                />
              </div>
              <div style={{ display: "flex", border: `1.5px solid ${T.border}`, borderRadius: 10, overflow: "hidden", flexShrink: 0 }}>
                <button onClick={() => commitOwnershipChange(() => setSortDir("desc"))} style={{
                  padding: "9px 14px", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", border: "none",
                  background: sortDir === "desc" ? (isDark ? `${activeMetric.color}28` : `${activeMetric.color}12`) : "transparent",
                  color: sortDir === "desc" ? activeMetric.color : T.subtext,
                }}>Rising first</button>
                <button onClick={() => commitOwnershipChange(() => setSortDir("asc"))} style={{
                  padding: "9px 14px", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", border: "none",
                  borderLeft: `1.5px solid ${T.border}`,
                  background: sortDir === "asc" ? (isDark ? `${activeMetric.color}28` : `${activeMetric.color}12`) : "transparent",
                  color: sortDir === "asc" ? activeMetric.color : T.subtext,
                }}>Falling first</button>
              </div>
            </div>

            <div style={{ fontSize: 12.5, color: T.subtext, marginBottom: 10, ...mono }}>
              {tableRows.length.toLocaleString()} results{searchQ.trim() ? ` for "${searchQ.trim()}"` : ""}
            </div>

            {/* Table */}
            {tableRows.length === 0 ? (
              <div style={{ textAlign: "center", padding: "70px 20px", color: T.subtext, fontSize: 14 }}>
                No stocks match your search.
              </div>
            ) : (
              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, overflow: "hidden" }}>
                {!isMobile && (
                  <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 18px", background: T.tableHead, borderBottom: `1px solid ${T.border}` }}>
                    <span style={{ width: 26, fontSize: 10.5, fontWeight: 700, color: T.subtext, textTransform: "uppercase", letterSpacing: "0.06em" }}>#</span>
                    <span style={{ width: 38, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 10.5, fontWeight: 700, color: T.subtext, textTransform: "uppercase", letterSpacing: "0.06em" }}>Company</span>
                    {activeMetric.id === "both" && (
                      <>
                        <span style={{ minWidth: 64, textAlign: "right", fontSize: 10.5, fontWeight: 700, color: T.subtext, textTransform: "uppercase", letterSpacing: "0.06em" }}>Foreign</span>
                        <span style={{ minWidth: 64, textAlign: "right", fontSize: 10.5, fontWeight: 700, color: T.subtext, textTransform: "uppercase", letterSpacing: "0.06em" }}>Domestic</span>
                      </>
                    )}
                    <span style={{ minWidth: 84, textAlign: "right", fontSize: 10.5, fontWeight: 700, color: T.subtext, textTransform: "uppercase", letterSpacing: "0.06em" }}>{activeMetric.id === "both" ? "Combined" : activeMetric.colHeader}</span>
                  </div>
                )}
                <div style={{ padding: isMobile ? "0 4px" : 0 }}>
                  {shown.map((stock, i) => (
                    <MetricTableRow
                      key={stock.ticker}
                      stock={stock}
                      metric={activeMetric}
                      rank={i + 1}
                      T={T}
                      isDark={isDark}
                      isMobile={isMobile}
                      onSelect={setSelected}
                    />
                  ))}
                </div>
              </div>
            )}

            {tableRows.length > visibleCount && (
              <div style={{ textAlign: "center", paddingTop: 20 }}>
                <button onClick={() => setVisibleCount(c => c + SHOW_MORE_STEP)} style={{
                  padding: "11px 30px", borderRadius: 10, border: `1.5px solid ${T.border}`, background: "transparent",
                  color: T.text, cursor: "pointer", fontSize: 14, fontWeight: 500, fontFamily: "inherit", transition: "background .15s",
                }}
                  onMouseEnter={e => e.currentTarget.style.background = T.surface}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  Show more +{SHOW_MORE_STEP}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* DRILLDOWN MODAL */}
      {selected && <DrilldownModal stock={selected} T={T} onClose={() => setSelected(null)} />}
    </div>
  );
}
