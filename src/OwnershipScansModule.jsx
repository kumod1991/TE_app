import { useState, useEffect, useMemo } from "react";

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

async function rpcFetch(fn, body = {}, timeoutMs = 20000) {
  const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: sbH(),
    body: JSON.stringify(body),
  }, timeoutMs);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status} on rpc/${fn}`);
  }
  return res.json();
}

// ─── CACHE (7-day localStorage TTL) ──────────────────────────────────────────
const CACHE_KEY    = "ownership_processed_v10";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_EXPECTED_UNIVERSE = 500;

function cacheRead() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, processed } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    if (!Array.isArray(processed) || processed.length < MIN_EXPECTED_UNIVERSE) return null;
    return { processed, ts };
  } catch { return null; }
}

function cacheWrite(processed) {
  if (!Array.isArray(processed) || processed.length < MIN_EXPECTED_UNIVERSE) return;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), processed })); } catch {}
}

function assertCompleteUniverse(processed, sourceCount) {
  if (Array.isArray(processed) && processed.length >= MIN_EXPECTED_UNIVERSE) return;
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

  if (!window.__ownershipInit) {
    window.__ownershipInit = { processed: [], loading: true, refreshing: false, cacheAge: null, fetchedAt: null };
  }

  _prefetchPromise = fetchOwnershipUniverse().then((processed) => {
    assertCompleteUniverse(processed, processed.length);
    cacheWrite(processed);
    window.__ownershipInit = {
      processed,
      loading: false, refreshing: false, cacheAge: 0,
      fetchedAt: Date.now(),
    };
  }).catch(() => {
    initFromCacheIfPossible();
    _prefetchPromise = null;
  });
  return _prefetchPromise;
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

const OWNERSHIP_RPC_LIMIT = 5000;
const OWNERSHIP_RPC_TIMEOUT_MS = 12000;

async function fetchOwnershipScans({ limit = OWNERSHIP_RPC_LIMIT, timeoutMs = OWNERSHIP_RPC_TIMEOUT_MS } = {}) {
  const rows = await rpcFetch("get_company_shareholding_scans", { p_limit: limit }, timeoutMs);
  return normalizeOwnershipRows(Array.isArray(rows) ? rows : []);
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
  return processed;
}

async function fetchOwnershipUniverse() {
  const rpc = await fetchOwnershipScans();
  if (Array.isArray(rpc) && rpc.length > 0) return rpc;
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
  const allQuarterlySource = Array.isArray(row.allQuarterly)
    ? row.allQuarterly
    : Array.isArray(row.all_quarterly)
      ? row.all_quarterly
      : [];
  return {
    ...row,
    ownPromoter: safeNum(row.ownPromoter ?? row.own_promoter ?? row.promoter_pct ?? row.promoter),
    ownFii: safeNum(row.ownFii ?? row.own_fii ?? row.fii_pct ?? row.fii),
    ownDii: safeNum(row.ownDii ?? row.own_dii ?? row.dii_pct ?? row.dii),
    ownPublic: safeNum(row.ownPublic ?? row.own_public ?? row.public_pct ?? row.public_retail ?? row.public),
    deltaFii: safeNum(row.deltaFii ?? row.delta_fii),
    deltaDii: safeNum(row.deltaDii ?? row.delta_dii),
    deltaPromoter: safeNum(row.deltaPromoter ?? row.delta_promoter),
    deltaPublic: safeNum(row.deltaPublic ?? row.delta_public),
    fiiTrend: safeNum(row.fiiTrend ?? row.fii_trend),
    diiTrend: safeNum(row.diiTrend ?? row.dii_trend),
    promoterTrend: safeNum(row.promoterTrend ?? row.promoter_trend),
    publicTrend: safeNum(row.publicTrend ?? row.public_trend),
    combinedFlow: safeNum(row.combinedFlow ?? row.combined_flow),
    score: safeNum(row.score),
    accel: row.accel && typeof row.accel === "object"
      ? { fii: safeNum(row.accel.fii), dii: safeNum(row.accel.dii) }
      : { fii: 0, dii: 0 },
    anomalies: Array.isArray(row.anomalies) ? row.anomalies : [],
    last4: last4Source.map(normalizeOwnershipSeriesEntry).filter(Boolean),
    allQuarterly: allQuarterlySource.map(normalizeOwnershipSeriesEntry).filter(Boolean),
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
    last4: recentQ, allQuarterly: q, latestDate: last.date,
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

// ─── MINI SVG LINE ────────────────────────────────────────────────────────────
function MiniLine({ data, color, w = 80, h = 32 }) {
  const n = data.map(safeNum);
  if (n.length < 2) return null;
  const mn = Math.min(...n), mx = Math.max(...n), r = mx - mn || 1;
  const pts = n.map((v, i) => `${(i / (n.length - 1)) * w},${h - ((v - mn) / r) * (h - 4) - 2}`).join(" ");
  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── TREND SPARKLINES ─────────────────────────────────────────────────────────
function TrendSparklines({ stock, T }) {
  const [tooltip, setTooltip] = useState(null);
  const W = 28, H = 28, BAR_W = 4, GAP = 2;
  const series = [
    { key: "fiis",      label: "FII",      color: "#3b82f6", trend: stock.fiiTrend },
    { key: "diis",      label: "DII",      color: "#8b5cf6", trend: stock.diiTrend },
    { key: "promoters", label: "Promoter", color: "#059669", trend: stock.promoterTrend },
  ];

  function renderBars(values, color, trend) {
    const nums = values.map(safeNum);
    const mx = Math.max(...nums.map(Math.abs), 1);
    const totalW = nums.length * BAR_W + (nums.length - 1) * GAP;
    const offsetX = (W - totalW) / 2;
    return nums.map((v, i) => {
      const barH = Math.max(2, (Math.abs(v) / mx) * (H - 4));
      const x = offsetX + i * (BAR_W + GAP);
      const y = H - barH;
      const opacity = i === nums.length - 1 ? 1 : 0.35 + (i / nums.length) * 0.45;
      const fill = trend > 0.05 ? color : trend < -0.05 ? "#ef4444" : "#94a3b8";
      return <rect key={i} x={x} y={y} width={BAR_W} height={barH} rx="1" fill={fill} opacity={opacity} />;
    });
  }

  return (
    <div style={{ position: "relative", display: "inline-flex", gap: 5, alignItems: "flex-end" }}>
      {series.map((s) => {
        const vals = stock.last4.map(q => q[s.key]);
        return (
          <div key={s.key} style={{ position: "relative", cursor: "default" }}
            onMouseEnter={e => {
              const rect = e.currentTarget.getBoundingClientRect();
              setTooltip({ x: rect.left + rect.width / 2, y: rect.top, series: s, vals });
            }}
            onMouseLeave={() => setTooltip(null)}>
            <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
              {renderBars(vals, s.color, s.trend)}
            </svg>
          </div>
        );
      })}
      {tooltip && (
        <div style={{
          position: "fixed", left: tooltip.x, top: tooltip.y - 8,
          transform: "translate(-50%, -100%)", zIndex: 99999,
          background: T.card, border: `1px solid ${T.border}`,
          borderRadius: 8, padding: "9px 12px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          pointerEvents: "none", minWidth: 140, whiteSpace: "nowrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: tooltip.series.color }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: T.text, letterSpacing: "0.05em" }}>
              {tooltip.series.label} Trend
            </span>
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 7 }}>
            {tooltip.vals.map((v, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 9, color: T.muted, marginBottom: 2 }}>Q{i + 1}</div>
                <div style={{ fontSize: 11, fontWeight: 600, ...mono, color: T.subtext }}>{safeNum(v).toFixed(1)}%</div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 10, color: T.muted }}>4Q net</span>
            <span style={{ fontSize: 12, fontWeight: 700, ...mono, color: tooltip.series.trend > 0.05 ? "#059669" : tooltip.series.trend < -0.05 ? "#dc2626" : T.muted }}>
              {fmt(tooltip.series.trend)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DRILLDOWN MODAL ──────────────────────────────────────────────────────────
function DrilldownModal({ stock, T, onClose }) {
  const isDark = (T?.bg || "").toLowerCase() === "#060d1a";
  const qs = (stock.allQuarterly || []).filter(Boolean);
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

// ─── INSIGHTS STRIP ───────────────────────────────────────────────────────────
function InsightsStrip({ processed, T }) {
  const isDark = (T?.bg || "").toLowerCase() === "#060d1a";
  const stats = useMemo(() => {
    if (!processed.length) return null;
    const fiiLeading    = processed.filter(x => !["Noise","Distribution"].includes(x.signal) && x.fiiTrend > x.diiTrend).length;
    const totalAccum    = processed.filter(x => !["Noise","Distribution"].includes(x.signal)).length;
    const fiiPct        = totalAccum > 0 ? Math.round(fiiLeading / totalAccum * 100) : 0;
    const sectorCounts  = {};
    processed.filter(x => x.sector && ["Aggressive Accumulation","Strong Accumulation"].includes(x.signal))
      .forEach(x => { sectorCounts[x.sector] = (sectorCounts[x.sector] || 0) + 1; });
    const topSector     = Object.entries(sectorCounts).sort((a,b) => b[1]-a[1])[0];
    const accelPositive = processed.filter(x => x.accel.fii > 0.5 && x.accel.dii > 0.5).length;
    const promExitInstEntry = processed.filter(x => x.promoterTrend < -1 && x.combinedFlow > 2).length;
    return [
      accelPositive > 0     && { label: `${accelPositive} stocks`, sub: "where both foreign and domestic buying is speeding up", dot: "#d97706" },
      promExitInstEntry > 0 && { label: `${promExitInstEntry} stocks`, sub: "where promoters sold but funds bought the shares up", dot: "#6366f1" },
      topSector             && { label: topSector[0], sub: `${topSector[1]} stocks with strong buying — top sector`, dot: "#059669" },
      fiiPct > 0            && { label: `${fiiPct}%`, sub: "of buying activity is foreign-fund led", dot: "#3b82f6" },
    ].filter(Boolean).slice(0, 4);
  }, [processed]);

  if (!stats || !stats.length) return null;
  const borderColor = isDark ? "rgba(148,163,184,0.10)" : "rgba(15,23,42,0.07)";
  const bg = isDark ? "rgba(10,18,32,0.82)" : "rgba(255,255,255,0.92)";

  return (
    <div style={{ display: "flex", gap: 8, padding: "2px 0 8px", overflowX: "auto", flexShrink: 0, alignItems: "stretch" }} className="os-chip-scroll">
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10, background: bg, border: `1px solid ${borderColor}`, flexShrink: 0 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.muted }} />
        <span style={{ fontSize: 9, fontWeight: 800, color: T.muted, letterSpacing: ".12em", textTransform: "uppercase" }}>Highlights</span>
      </div>
      {stats.map((item, i) => (
        <div key={i} style={{ background: bg, border: `1px solid ${borderColor}`, borderRadius: 10, padding: "8px 14px", display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap", flexShrink: 0 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: item.dot, flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: T.text, ...mono }}>{item.label}</span>
          <span style={{ fontSize: 11.5, color: T.subtext }}>{item.sub}</span>
        </div>
      ))}
    </div>
  );
}

// ─── LOADING SKELETON ─────────────────────────────────────────────────────────
function LoadingSkeleton({ T }) {
  const pulse = {
    background: `linear-gradient(90deg, ${T.surface} 25%, ${T.tableHead} 50%, ${T.surface} 75%)`,
    backgroundSize: "200% 100%",
    animation: "shimmer 1.4s ease-in-out infinite",
    borderRadius: 6,
  };
  const Block = ({ w, h = 14, style = {} }) => (
    <div style={{ width: w, height: h, ...pulse, ...style }} />
  );
  return (
    <div style={{ padding: "28px 32px", maxWidth: 1400, margin: "0 auto" }}>
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>
      <div style={{ marginBottom: 28 }}>
        <Block w={200} h={28} style={{ marginBottom: 10 }} />
        <Block w={360} h={14} style={{ marginBottom: 20 }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
            <Block w={90} h={10} />
            <Block w={60} h={28} />
            <Block w={120} h={11} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[80, 110, 90, 110, 100, 90, 110].map((w, i) => (
          <Block key={i} w={w} h={32} style={{ borderRadius: 8 }} />
        ))}
      </div>
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", background: T.tableHead, borderBottom: `1px solid ${T.border}`, display: "flex", gap: 12 }}>
          {[140, 80, 60, 60, 90, 90, 80, 70, 110].map((w, i) => (
            <Block key={i} w={w} h={10} />
          ))}
        </div>
        {[...Array(8)].map((_, i) => (
          <div key={i} style={{ padding: "14px 16px", borderTop: `1px solid ${T.border}`, background: i % 2 === 0 ? T.card : T.surface, display: "flex", gap: 12, alignItems: "center" }}>
            <Block w={140} h={13} />
            {[80, 60, 60, 90, 90, 80, 70, 110].map((w, j) => (
              <Block key={j} w={w} h={12} />
            ))}
          </div>
        ))}
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

// ─── STOCK CARD (mobile / preview) ───────────────────────────────────────────
function StockCard({ stock, onSelect, T, isDark, rowNum, isMobile }) {
  const chipPalette = ["#6366f1","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#14b8a6","#f97316"];
  const chipColor = chipPalette[stock.ticker.charCodeAt(0) % chipPalette.length];
  const positiveFlow = stock.combinedFlow >= 0;
  const scoreColor = stock.score > 3 ? "#059669" : stock.score < -3 ? "#dc2626" : T.text;
  const elevatedBorder = isDark ? "rgba(148,163,184,0.14)" : "rgba(15,23,42,0.08)";

  return (
    <button
      onClick={() => onSelect(stock)}
      className="os-stock-card"
      style={{
        width: "100%", textAlign: "left", color: "inherit", cursor: "pointer",
        display: "flex", gap: 18, padding: "18px 20px",
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 14, alignItems: "flex-start",
        transition: "box-shadow .2s, border-color .2s",
      }}
    >
      {/* Avatar */}
      <div style={{
        width: 42, height: 42, borderRadius: 10, flexShrink: 0,
        background: `${chipColor}15`, border: `1px solid ${chipColor}28`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: 9, fontWeight: 800, color: chipColor, letterSpacing: "0.02em", ...mono }}>{stock.ticker.slice(0,4)}</span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: "-0.01em" }}>
            {stock.name || stock.ticker}
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#6366f1", background: isDark ? "rgba(99,102,241,0.15)" : "#eef2ff", padding: "2px 8px", borderRadius: 5, letterSpacing: "0.02em", ...mono }}>
            {stock.ticker}
          </span>
          {stock.timing === "Recent" && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: "rgba(16,185,129,0.1)", color: "#10b981" }}>RECENT</span>
          )}
          {stock.accel.fii > 0.3 && stock.accel.dii > 0.3 && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: "rgba(217,119,6,0.1)", color: "#d97706" }}>ACCEL</span>
          )}
          <span style={{ fontSize: 13, marginLeft: "auto", whiteSpace: "nowrap", ...mono, fontWeight: 700, color: scoreColor }}>
            {fmt(stock.score)}
          </span>
        </div>

        {stock.sector && (
          <div style={{ fontSize: 13, color: T.subtext, marginBottom: 6 }}>· {stock.sector}</div>
        )}

        <div style={{ display: "flex", gap: 5, marginBottom: 8, flexWrap: "wrap" }}>
          <SignalBadge signal={stock.signal} />
          <span style={{ fontSize: 11, fontWeight: 600, color: T.subtext, padding: "3px 8px", borderRadius: 99, background: isDark ? "rgba(255,255,255,0.05)" : "rgba(15,23,42,0.04)", border: `1px solid ${T.border}` }}>
            Foreign {fmt(stock.fiiTrend)}% · Domestic {fmt(stock.diiTrend)}%
          </span>
        </div>

        {stock.story && (
          <p style={{
            margin: "6px 0 0", fontSize: 13, color: T.subtext, lineHeight: 1.6,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>
            {stock.story}
          </p>
        )}
      </div>
    </button>
  );
}

// ─── MAIN TABLE ROW ───────────────────────────────────────────────────────────
function TableRow({ stock, rowNum, onSelect, T, isDark, TH_BASE, sortKey }) {
  const chipPalette = ["#6366f1","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#14b8a6","#f97316"];
  const chipColor = chipPalette[stock.ticker.charCodeAt(0) % chipPalette.length];
  const td = { padding: "0 16px", height: 54, fontSize: 13, borderBottom: `1px solid ${isDark ? "rgba(99,131,179,0.07)" : "rgba(15,23,42,0.05)"}`, verticalAlign: "middle" };

  return (
    <tr className="os-row" style={{ cursor: "pointer" }} onClick={() => onSelect(stock)}>
      <td style={{ ...td, width: 44, textAlign: "center", color: T.muted, fontSize: 12 }}>{rowNum}</td>
      <td style={{ ...td, textAlign: "left", paddingLeft: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 7, flexShrink: 0, background: `${chipColor}15`, border: `1px solid ${chipColor}28`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: chipColor, letterSpacing: "0.02em", ...mono }}>{stock.ticker.slice(0,4)}</span>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{stock.name || stock.ticker}</span>
              {stock.timing === "Recent" && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: "rgba(16,185,129,0.1)", color: "#10b981" }}>RECENT</span>}
              {stock.accel.fii > 0.3 && stock.accel.dii > 0.3 && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: "rgba(217,119,6,0.08)", color: "#d97706" }}>ACCEL</span>}
              {stock.anomalies.length > 0 && <span title={stock.anomalies.join(", ")} style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: "rgba(220,38,38,0.07)", color: "#dc2626", cursor: "help" }}>⚠</span>}
            </div>
            <div style={{ fontSize: 11, color: T.muted, ...mono }}>{stock.ticker}</div>
          </div>
        </div>
      </td>
      <td style={{ ...td, textAlign: "left", fontSize: 12, color: T.subtext }}>{stock.sector || "—"}</td>
      <td style={{ ...td, textAlign: "right", ...mono, color: T.muted, fontSize: 13 }}>{stock.ownPromoter.toFixed(1)}</td>
      <td style={{ ...td, textAlign: "right", ...mono, color: T.muted, fontSize: 13 }}>{stock.ownFii.toFixed(1)}</td>
      <td style={{ ...td, textAlign: "right", ...mono, color: T.muted, fontSize: 13 }}>{stock.ownDii.toFixed(1)}</td>
      <td style={{ ...td, textAlign: "right", ...mono }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: stock.fiiTrend > 0.05 ? "#059669" : stock.fiiTrend < -0.05 ? "#dc2626" : T.muted }}>{fmt(stock.fiiTrend)}%</span>
      </td>
      <td style={{ ...td, textAlign: "right", ...mono }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: stock.diiTrend > 0.05 ? "#059669" : stock.diiTrend < -0.05 ? "#dc2626" : T.muted }}>{fmt(stock.diiTrend)}%</span>
      </td>
      <td style={{ ...td, textAlign: "right", ...mono, fontWeight: 700, fontSize: 14, color: stock.score > 3 ? "#059669" : stock.score < -3 ? "#dc2626" : T.text, minWidth: 64 }}>{fmt(stock.score)}</td>
      <td style={{ ...td, textAlign: "center" }}><SignalBadge signal={stock.signal} /></td>
      <td style={{ ...td, textAlign: "center", fontSize: 12, fontWeight: 600, color: stock.conviction === "High" ? "#059669" : stock.conviction === "Medium" ? "#d97706" : T.muted }}>{stock.conviction}</td>
      <td style={{ ...td, textAlign: "center", padding: "0 10px" }}><TrendSparklines stock={stock} T={T} /></td>
    </tr>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function OwnershipScansModule({ T }) {
  const getIsMobile = () => (typeof window !== "undefined" ? window.innerWidth <= 768 : false);
  const isDark = (T?.bg || "").toLowerCase() === "#060d1a";
  const darkMode = isDark;
  const init = getInit();

  const [processed,  setProcessed]  = useState(() => init.processed);
  const [loading,    setLoading]    = useState(() => init.loading);
  const [refreshing, setRefreshing] = useState(() => init.refreshing);
  const [error,      setError]      = useState(null);
  const [selected,   setSelected]   = useState(null);
  const [sortKey,    setSortKey]    = useState("score");
  const [sortDir,    setSortDir]    = useState("desc");
  const [filter,     setFilter]     = useState("smart");
  const [scoreMin,   setScoreMin]   = useState(-10);
  const [searchQ,    setSearchQ]    = useState("");
  const [page,       setPage]       = useState(1);
  const [fullScreen, setFullScreen] = useState(false);
  const [fullPage,   setFullPage]   = useState(1);
  const [fullPageSize, setFullPageSize] = useState(25);
  const [isMobile,   setIsMobile]   = useState(getIsMobile);
  const [mobileVisibleCount, setMobileVisibleCount] = useState(25);
  const [explainerDismissed, setExplainerDismissedState] = useState(() => {
    try { return localStorage.getItem("ownership_explainer_dismissed") === "1"; } catch { return false; }
  });
  function setExplainerDismissed(v) {
    setExplainerDismissedState(v);
    try { localStorage.setItem("ownership_explainer_dismissed", v ? "1" : "0"); } catch {}
  }

  const PREVIEW_SIZE = 8;
  const PAGE_SIZE    = 50;

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
        if (_prefetchPromise) {
          try { await _prefetchPromise; } catch {}
        }
        const fresh = window.__ownershipInit;
        if (fresh) setProcessed(fresh.processed);
        setRefreshing(false);
        return;
      }

      setLoading(true);
      try {
        if (_prefetchPromise) {
          await _prefetchPromise;
          const fresh = window.__ownershipInit || initFromCacheIfPossible();
          if (fresh?.processed) setProcessed(fresh.processed);
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

  const summary = useMemo(() => {
    if (!processed.length) return { avgInst: 0, label: "No Data", smartMoney: 0, distribution: 0, promoterUp: 0 };
    const avgInst = processed.reduce((s, x) => s + x.fiiTrend + x.diiTrend, 0) / processed.length;
    return {
      avgInst,
      label: avgInst > 0.5 ? "Strong Buying" : avgInst > 0 ? "Mild Buying" : avgInst > -0.5 ? "Neutral" : "Selling Pressure",
      smartMoney:   processed.filter(x => ["Aggressive Accumulation","Strong Accumulation","Selective Accumulation"].includes(x.signal)).length,
      distribution: processed.filter(x => x.signal === "Distribution").length,
      promoterUp:   processed.filter(x => x.promoterTrend > 1).length,
    };
  }, [processed]);

  const filtered = useMemo(() => {
    let list = processed.filter(x => x.score >= scoreMin);
    if (filter === "smart")         list = list.filter(x => x.fiiTrend > 0 && x.diiTrend > 0);
    else if (filter === "aggressive") list = list.filter(x => x.signal === "Aggressive Accumulation");
    else if (filter === "early")    list = list.filter(x => ["Selective Accumulation","Strong Accumulation"].includes(x.signal));
    else if (filter === "promoter") list = list.filter(x => x.promoterTrend > 1);
    else if (filter === "exit")     list = list.filter(x => x.signal === "Distribution");
    else if (filter === "recent")   list = list.filter(x => x.timing === "Recent");
    else if (filter === "accel")    list = list.filter(x => x.accel.fii > 0 && x.accel.dii > 0);
    else if (filter === "balanced") list = list.filter(x => x.dominance === "Balanced" && x.fiiTrend > 1 && x.diiTrend > 1);
    else if (filter === "promout")  list = list.filter(x => x.promoterTrend < -1 && x.combinedFlow > 2);
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      list = list.filter(x => x.ticker.toLowerCase().includes(q) || (x.name || "").toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      let va, vb;
      if (sortKey === "accelFii") { va = a.accel?.fii ?? 0; vb = b.accel?.fii ?? 0; }
      else { va = a[sortKey] ?? 0; vb = b[sortKey] ?? 0; }
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [processed, filter, scoreMin, searchQ, sortKey, sortDir]);

  useEffect(() => { setMobileVisibleCount(25); }, [filter, scoreMin, searchQ, sortKey, sortDir, processed.length]);

  function onSort(k) {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
    setPage(1);
  }

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
        window.__ownershipInit = {
          processed,
          loading: false,
          refreshing: false,
          cacheAge: 0,
          fetchedAt: Date.now(),
        };
        setProcessed(processed);
        setRefreshing(false);
      })
      .catch((e) => {
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

  const filterOptions = [
    { id: "all",        label: "All",                        col: "#6b7280" },
    { id: "smart",      label: "Both Buying",                col: "#059669" },
    { id: "aggressive", label: "Heavy Buying",                col: "#059669" },
    { id: "recent",     label: "New Buying",                 col: "#10b981" },
    { id: "accel",      label: "Speeding Up",                col: "#d97706" },
    { id: "balanced",   label: "Balanced",                   col: "#8b5cf6" },
    { id: "promoter",   label: "Promoters Buying",           col: "#2563eb" },
    { id: "promout",    label: "Promoters Out, Funds In",    col: "#6366f1" },
    { id: "exit",       label: "Both Selling",               col: "#dc2626" },
  ];
  const sortOptions = [
    { value: "score",         label: "Overall Score" },
    { value: "combinedFlow",  label: "Combined Buying (4Q)" },
    { value: "fiiTrend",      label: "Foreign Funds (4Q)" },
    { value: "diiTrend",      label: "Domestic Funds (4Q)" },
    { value: "promoterTrend", label: "Promoter Stake (4Q)" },
    { value: "deltaFii",      label: "Foreign Funds (Latest Qtr)" },
    { value: "accelFii",      label: "Foreign Fund Acceleration" },
  ];

  const activeFilter = filterOptions.find(x => x.id === filter) || filterOptions[0];
  const activeSort   = sortOptions.find(x => x.value === sortKey)?.label || sortKey;
  const fullPageCount = Math.max(1, Math.ceil(filtered.length / fullPageSize));
  const summaryCards = [
    { label: "Both Buying",     value: summary.smartMoney,   sub: "Foreign + domestic funds both accumulating",  color: "#059669" },
    { label: "Both Selling",    value: summary.distribution, sub: "Foreign + domestic funds both reducing",      color: "#dc2626" },
    { label: "Promoters Buying",value: summary.promoterUp,   sub: "Founder/insider stake up over 4 quarters",    color: "#2563eb" },
    { label: "Universe",        value: processed.length,     sub: summary.label + " overall",                    color: summary.avgInst >= 0 ? "#059669" : "#dc2626" },
  ];

  // Tab style matching Announcements module
  const tabStyle = (active, col = "#5b5bd6") => ({
    padding: "8px 18px", borderRadius: 8, border: `1.5px solid ${active ? col : T.border}`,
    background: active ? (darkMode ? `${col}28` : `${col}12`) : "transparent",
    color: active ? col : T.subtext,
    fontSize: 14, fontWeight: active ? 600 : 400,
    cursor: "pointer", transition: "all .15s",
    display: "inline-flex", alignItems: "center", gap: 6,
    fontFamily: "inherit",
  });

  // ─── FULL SCREEN TABLE VIEW ─────────────────────────────────────────────────
  if (fullScreen) {
    const TH_BASE = {
      padding: "10px 16px", fontSize: 10, fontWeight: 700, textTransform: "uppercase",
      letterSpacing: ".09em", background: T.tableHead, whiteSpace: "nowrap",
      cursor: "pointer", userSelect: "none", position: "sticky", top: 0, zIndex: 1,
      color: T.muted, borderBottom: `1px solid ${isDark ? "rgba(99,131,179,0.10)" : "rgba(15,23,42,0.06)"}`,
    };
    const Th = ({ col, label, left = false }) => {
      const active = sortKey === col;
      return (
        <th onClick={() => onSort(col)} style={{
          ...TH_BASE, textAlign: left ? "left" : "right",
          color: active ? T.text : T.muted,
          borderBottom: `2px solid ${active ? (T.green || "#10b981") : T.border}`,
          paddingBottom: active ? 8 : 9,
        }}>
          {label}{active ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
        </th>
      );
    };

    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: T.bg, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg) } }
          .os-row:hover td { background: ${isDark ? "rgba(99,131,179,0.04)" : "rgba(15,23,42,0.025)"} !important; }
          .os-chip-scroll { scrollbar-width: none; }
          .os-chip-scroll::-webkit-scrollbar { display: none; }
          select { appearance: none; }
        `}</style>

        {/* Top bar */}
        <div style={{ borderBottom: `1px solid ${T.border}`, background: T.card, flexShrink: 0, display: "flex", justifyContent: "center", boxShadow: "0 1px 0 rgba(0,0,0,0.04)" }}>
          <div style={{ width: "100%", maxWidth: 1400, padding: isMobile ? "14px" : "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <button onClick={() => setFullScreen(false)} style={{ display: "flex", alignItems: "center", gap: 7, background: "transparent", border: `1.5px solid ${T.border}`, borderRadius: 8, cursor: "pointer", color: T.subtext, fontSize: 13, padding: "8px 14px", fontFamily: "inherit", fontWeight: 600 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5"/><path d="m12 5-7 7 7 7"/></svg>
                Back
              </button>
              <span style={{ fontSize: 18, fontWeight: 700, color: T.text, letterSpacing: "-0.02em" }}>Ownership Universe</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: T.subtext, ...mono }}>{filtered.length} stocks</span>
              <select value={sortKey} onChange={e => { setSortKey(e.target.value); setSortDir("desc"); setFullPage(1); }}
                style={{ background: T.surface || T.card, border: `1.5px solid ${T.border}`, color: T.text, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>
                {sortOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <div style={{ position: "relative" }}>
                <svg style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2.2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <input placeholder="Search ticker / name..." value={searchQ} onChange={e => { setSearchQ(e.target.value); setFullPage(1); }}
                  style={{ background: T.surface || T.card, border: `1.5px solid ${T.border}`, color: T.text, borderRadius: 8, padding: "9px 12px 9px 30px", fontSize: 13, width: isMobile ? "100%" : 200, outline: "none", fontFamily: "inherit" }} />
              </div>
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div style={{ borderBottom: `1px solid ${T.border}`, background: T.surface || T.card, flexShrink: 0, display: "flex", justifyContent: "center" }}>
          <div className="os-chip-scroll" style={{ width: "100%", maxWidth: 1400, display: "flex", alignItems: "center", gap: 8, padding: isMobile ? "10px 14px" : "10px 24px", overflowX: "auto" }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "nowrap" }}>
              {filterOptions.slice(0,3).map(f => (
                <button key={f.id} onClick={() => { setFilter(f.id); setFullPage(1); }} style={tabStyle(filter === f.id, f.col)}>{f.label}</button>
              ))}
            </div>
            <select value={["aggressive","recent","accel","balanced","promoter","promout"].includes(filter) ? filter : ""} onChange={e => { if (e.target.value) { setFilter(e.target.value); setFullPage(1); } }}
              style={{ background: T.surface || T.card, border: `1.5px solid ${["aggressive","recent","accel","balanced","promoter","promout"].includes(filter) ? "#6366f1" : T.border}`, color: ["aggressive","recent","accel","balanced","promoter","promout"].includes(filter) ? "#6366f1" : T.subtext, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit", cursor: "pointer", fontWeight: 600 }}>
              <option value="">More filters ⚙</option>
              <option value="aggressive">Heavy Buying</option>
              <option value="recent">New Buying</option>
              <option value="accel">Speeding Up (Both Funds)</option>
              <option value="balanced">Balanced Conviction</option>
              <option value="promoter">Promoters Buying</option>
              <option value="promout">Promoters Out, Funds In</option>
            </select>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              {[25,50,100].map(n => (
                <button key={n} onClick={() => { setFullPageSize(n); setFullPage(1); }}
                  style={{ padding: "7px 12px", borderRadius: 7, fontSize: 12, fontFamily: "inherit", cursor: "pointer", border: `1.5px solid ${fullPageSize === n ? activeFilter.col : T.border}`, background: fullPageSize === n ? `${activeFilter.col}14` : "transparent", color: fullPageSize === n ? activeFilter.col : T.subtext, fontWeight: fullPageSize === n ? 700 : 500 }}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table */}
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: isMobile ? "12px 14px 14px" : "18px 24px 16px", display: "flex", justifyContent: "center" }}>
          <div style={{ width: "100%", maxWidth: 1400, border: `1px solid ${T.border}`, borderRadius: 16, overflow: "hidden", background: T.card, boxShadow: "0 4px 20px rgba(15,23,42,0.06)" }}>
            <div style={{ maxHeight: "calc(100vh - 300px)", overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1120 }}>
                <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
                  <tr>
                    <th style={{ ...TH_BASE, width: 44, textAlign: "center" }}>#</th>
                    <Th col="ticker" label="Company" left />
                    <th style={{ ...TH_BASE, textAlign: "left", minWidth: 160 }}>Sector</th>
                    <Th col="ownPromoter" label="Promoter %" />
                    <Th col="ownFii"      label="Foreign %" />
                    <Th col="ownDii"      label="Domestic %" />
                    <Th col="fiiTrend"    label="Foreign 4Q" />
                    <Th col="diiTrend"    label="Domestic 4Q" />
                    <Th col="score"       label="Score" />
                    <th style={{ ...TH_BASE, textAlign: "center" }}>Trend</th>
                    <th style={{ ...TH_BASE, textAlign: "center" }}>Confidence</th>
                    <th style={{ ...TH_BASE, textAlign: "center" }}>Last 4 Qtrs</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const fp = filtered.slice((fullPage-1)*fullPageSize, fullPage*fullPageSize);
                    if (fp.length === 0) return (
                      <tr><td colSpan={12} style={{ padding: "48px 24px", textAlign: "center", color: T.muted, fontSize: 13 }}>No stocks match current filters</td></tr>
                    );
                    return fp.map((stock, i) => (
                      <TableRow key={stock.ticker} stock={stock} rowNum={(fullPage-1)*fullPageSize+i+1} onSelect={setSelected} T={T} isDark={isDark} TH_BASE={TH_BASE} sortKey={sortKey} />
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer pagination */}
        <div style={{ borderTop: `1px solid ${T.border}`, background: T.card, flexShrink: 0, display: "flex", justifyContent: "center" }}>
          <div style={{ width: "100%", maxWidth: 1400, padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: T.muted }}>Showing {Math.min(fullPage*fullPageSize, filtered.length)} of {filtered.length} stocks</span>
            {fullPageCount > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button onClick={() => setFullPage(p => Math.max(1,p-1))} disabled={fullPage===1} style={{ background: T.surface||T.card, border: `1.5px solid ${T.border}`, borderRadius: 8, color: T.subtext, padding: "8px 14px", cursor: fullPage===1?"default":"pointer", fontSize: 13, fontFamily: "inherit", opacity: fullPage===1?0.45:1 }}>← Prev</button>
                <span style={{ fontSize: 13, color: T.muted, minWidth: 80, textAlign: "center" }}>Page {fullPage} of {fullPageCount}</span>
                <button onClick={() => setFullPage(p => Math.min(fullPageCount,p+1))} disabled={fullPage===fullPageCount} style={{ background: T.surface||T.card, border: `1.5px solid ${T.border}`, borderRadius: 8, color: T.subtext, padding: "8px 14px", cursor: fullPage===fullPageCount?"default":"pointer", fontSize: 13, fontFamily: "inherit", opacity: fullPage===fullPageCount?0.45:1 }}>Next →</button>
              </div>
            )}
          </div>
        </div>

        {selected && <DrilldownModal stock={selected} T={T} onClose={() => setSelected(null)} />}
      </div>
    );
  }

  // ─── LOADING ─────────────────────────────────────────────────────────────────
  if (loading) return <LoadingSkeleton T={T} />;

  // ─── ERROR ───────────────────────────────────────────────────────────────────
  if (error) return (
    <div style={{ width: "100%", minHeight: "100%", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px", boxSizing: "border-box" }}>
      <div style={{ background: T.surface, border: `1px solid ${darkMode ? "rgba(239,68,68,0.3)" : "#fecaca"}`, borderRadius: 14, padding: "24px 32px", textAlign: "center", maxWidth: 440, width: "100%" }}>
        <div style={{ fontSize: 20, marginBottom: 10 }}>⚠️</div>
        <div style={{ fontSize: 14, color: "#dc2626", marginBottom: 8, fontWeight: 700 }}>Failed to load ownership data</div>
        <div style={{ fontSize: 13, color: T.subtext, lineHeight: 1.65, marginBottom: 16 }}>{error}</div>
        <button onClick={handleRefresh} style={{ padding: "10px 20px", borderRadius: 8, border: `1.5px solid #dc2626`, background: "transparent", color: "#dc2626", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          Retry
        </button>
      </div>
    </div>
  );

  // ─── MAIN RENDER ─────────────────────────────────────────────────────────────
  return (
    <div style={{ width: "100%", minHeight: "100%", overflowY: "auto", boxSizing: "border-box", fontFamily: "inherit", color: T.text, background: T.bg, padding: isMobile ? "0" : "22px 28px 36px" }}>
      <style>{`
        @keyframes spin    { to { transform: rotate(360deg) } }
        @keyframes fadeIn  { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }
        .os-chip-scroll { scrollbar-width: none; }
        .os-chip-scroll::-webkit-scrollbar { display: none; }
        .os-stock-card:hover { box-shadow: ${darkMode ? "0 4px 24px rgba(0,0,0,0.45)" : "0 4px 20px rgba(0,0,0,0.09)"}; border-color: ${darkMode ? "rgba(99,102,241,0.4)" : "#c7d2fe"} !important; }
        .os-row:hover td { background: ${isDark ? "rgba(99,131,179,0.04)" : "rgba(15,23,42,0.025)"} !important; }
        select { appearance: none; }
      `}</style>

      <div style={{ width: "100%", maxWidth: isMobile ? "100%" : 1400, margin: "0 auto", background: T.shellBg || T.surface, border: isMobile ? "none" : `1px solid ${T.border}`, borderRadius: isMobile ? 0 : 22, boxShadow: T.shadow, overflow: "hidden", padding: isMobile ? "16px" : "28px 32px", boxSizing: "border-box" }}>

        {/* ── HEADER (Announcements style) ── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: T.subtext, marginBottom: 8, display: "flex", gap: 6, letterSpacing: "0.02em" }}>
            <span style={{ color: "#5b5bd6", cursor: "pointer" }}>Fundamentals</span>
            <span>›</span>
            <span>Ownership</span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, color: T.text, letterSpacing: "-0.03em", lineHeight: 1.15 }}>
                Who's Buying, Who's Selling
                {refreshing && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 1.2s linear infinite", marginLeft: 10, verticalAlign: "middle" }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                )}
              </h1>
              <p style={{ margin: "8px 0 0", fontSize: 15, color: T.subtext, lineHeight: 1.6 }}>
                See which stocks foreign funds, domestic funds, and promoters have been buying or selling over the last 4 quarters.
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {!isMobile && (
                <button onClick={() => { setFullScreen(true); setFullPage(1); }} style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 16px", borderRadius: 8, border: `1.5px solid ${T.border}`, background: T.text, color: T.surface || T.card, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  Full universe
                </button>
              )}
              <button onClick={handleRefresh} title="Refresh data" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, borderRadius: 8, border: `1.5px solid ${T.border}`, background: "transparent", color: T.subtext, cursor: "pointer" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
              </button>
            </div>
          </div>

          {!explainerDismissed && (
            <div style={{ marginTop: 18, padding: "14px 16px", borderRadius: 12, background: isDark ? "rgba(99,102,241,0.08)" : "#eef2ff", border: `1px solid ${isDark ? "rgba(99,102,241,0.22)" : "#c7d2fe"}`, display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ flex: 1, fontSize: 13, color: T.text, lineHeight: 1.7 }}>
                <strong>What you're looking at:</strong> every company has owners — promoters (founders/insiders), <strong>FII</strong> (foreign investors), <strong>DII</strong> (Indian mutual funds &amp; insurers), and the general public. When FII or DII steadily raise their stake over several quarters, it's often a sign of growing institutional conviction in the stock. This page tracks those ownership shifts and flags the stocks where the shift has been strongest.
              </div>
              <button onClick={() => setExplainerDismissed(true)} style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 6, border: "none", background: "transparent", color: T.subtext, cursor: "pointer", fontSize: 16, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>
          )}
        </div>

        {/* ── INTEL STRIP ── */}
        <div style={{ marginBottom: 28 }}>
          <InsightsStrip processed={processed} T={T} />
        </div>

        {/* ── SUMMARY STAT CARDS ── */}
        {processed.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: isMobile ? 10 : 14, marginBottom: 28 }}>
            {summaryCards.map(c => (
              <div key={c.label} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: isMobile ? "14px 16px" : "18px 20px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.subtext, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>{c.label}</div>
                <div style={{ fontSize: isMobile ? 26 : 30, fontWeight: 700, color: c.color, ...mono, letterSpacing: "-0.02em", marginBottom: 6, lineHeight: 1 }}>{c.value.toLocaleString()}</div>
                <div style={{ fontSize: 12, color: T.subtext, lineHeight: 1.5 }}>{c.sub}</div>
                <div style={{ marginTop: 10, height: 2, borderRadius: 999, background: T.border, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 999, width: `${Math.min(100, (c.value / Math.max(processed.length, 1)) * 100)}%`, background: c.color, opacity: 0.65, transition: "width 0.6s ease" }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── FILTER BAR (Announcements style) ── */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.subtext, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.09em" }}>Show me</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "0 0 18px" }}>
            <button style={tabStyle(filter === "all", "#6b7280")} onClick={() => { setFilter("all"); setPage(1); }}>All stocks</button>
            <button style={tabStyle(filter === "smart", "#059669")} onClick={() => { setFilter("smart"); setPage(1); }}>Both buying</button>
            <button style={tabStyle(filter === "exit", "#dc2626")} onClick={() => { setFilter("exit"); setPage(1); }}>Both selling</button>
            <button style={tabStyle(filter === "recent", "#10b981")} onClick={() => { setFilter("recent"); setPage(1); }}>New buying</button>
            <button style={tabStyle(filter === "accel", "#d97706")} onClick={() => { setFilter("accel"); setPage(1); }}>Speeding up</button>
            <button style={tabStyle(filter === "promoter", "#2563eb")} onClick={() => { setFilter("promoter"); setPage(1); }}>Promoters buying</button>
            <button style={tabStyle(filter === "promout", "#6366f1")} onClick={() => { setFilter("promout"); setPage(1); }}>Promoters selling, funds buying</button>
            <button style={tabStyle(filter === "aggressive", "#059669")} onClick={() => { setFilter("aggressive"); setPage(1); }}>Heavy buying</button>
          </div>
          <div style={{ fontSize: 13.5, color: T.subtext, marginBottom: 4, lineHeight: 1.6 }}>
            {filter === "smart"      && <>Stocks where <strong>both foreign and domestic funds</strong> have been buying over the last 4 quarters.</>}
            {filter === "exit"       && <>Stocks where <strong>both foreign and domestic funds</strong> have been selling together.</>}
            {filter === "all"        && <>All stocks in the universe, no filter applied.</>}
            {filter === "recent"     && <>Stocks where <strong>foreign funds started buying</strong> only in the last 2 quarters — a fresh move.</>}
            {filter === "accel"      && <>Stocks where buying from <strong>both fund types is picking up pace</strong>, not just continuing.</>}
            {filter === "promoter"   && <>Stocks where <strong>founders/insiders have raised their own stake</strong> by more than 1% over 4 quarters.</>}
            {filter === "promout"    && <>Stocks where <strong>promoters sold but funds bought the shares up</strong> — a handover, not a warning sign on its own.</>}
            {filter === "aggressive" && <>Stocks with the <strong>strongest dual buying</strong> — over 5% added by both foreign and domestic funds in 4 quarters.</>}
          </div>
        </div>

        {/* ── SEARCH ── */}
        <div style={{ position: "relative", maxWidth: 480, marginBottom: 28 }}>
          <svg style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", opacity: 0.4, pointerEvents: "none" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.text} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            value={searchQ}
            onChange={e => { setSearchQ(e.target.value); setPage(1); }}
            placeholder="Search company or ticker…"
            style={{ width: "100%", padding: "11px 16px 11px 38px", border: `1.5px solid ${T.border}`, borderRadius: 10, background: T.surface, color: T.text, fontSize: 15, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
            onFocus={e => e.target.style.borderColor = "#6366f1"}
            onBlur={e => e.target.style.borderColor = T.border}
          />
        </div>

        {/* ── SORT ROW ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: T.subtext, ...mono }}>
            {filtered.length} results{searchQ.trim() ? ` for "${searchQ.trim()}"` : ""} — sorted by <strong style={{ color: T.text }}>{activeSort}</strong>
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <select value={sortKey} onChange={e => { setSortKey(e.target.value); setSortDir("desc"); setPage(1); }}
              style={{ background: T.surface, border: `1.5px solid ${T.border}`, color: T.text, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>
              {sortOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={scoreMin} onChange={e => { setScoreMin(Number(e.target.value)); setPage(1); }}
              style={{ background: T.surface, border: `1.5px solid ${T.border}`, color: T.text, borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>
              {[-10,-5,0,1,2,3,5].map(v => <option key={v} value={v}>Score ≥ {v >= 0 ? "+" : ""}{v}</option>)}
            </select>
          </div>
        </div>

        {/* ── CONTENT ── */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", paddingTop: 80, color: T.subtext, fontSize: 15 }}>
            No stocks match the current filter.
            <div style={{ marginTop: 16 }}>
              <button onClick={() => { setFilter("all"); setScoreMin(-10); setSearchQ(""); }} style={{ padding: "10px 20px", borderRadius: 8, border: `1.5px solid ${T.border}`, background: "transparent", color: T.subtext, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Clear filters
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.slice(0, isMobile ? mobileVisibleCount : PREVIEW_SIZE + (page - 1) * PAGE_SIZE).map((stock, i) => (
              <StockCard
                key={stock.ticker}
                stock={stock}
                onSelect={setSelected}
                T={T}
                isDark={isDark}
                rowNum={i + 1}
                isMobile={isMobile}
              />
            ))}

            {/* Load more / View all */}
            {filtered.length > (isMobile ? mobileVisibleCount : PREVIEW_SIZE) && (
              <div style={{ textAlign: "center", paddingTop: 8, paddingBottom: 8 }}>
                {isMobile ? (
                  <button onClick={() => setMobileVisibleCount(c => c + 25)} style={{ padding: "12px 32px", borderRadius: 10, border: `1.5px solid ${T.border}`, background: "transparent", color: T.text, cursor: "pointer", fontSize: 14, fontWeight: 500, fontFamily: "inherit", transition: "background .15s" }}
                    onMouseEnter={e => e.currentTarget.style.background = T.surface}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    Load more
                  </button>
                ) : (
                  <button onClick={() => { setFullScreen(true); setFullPage(1); }} style={{ padding: "12px 32px", borderRadius: 10, border: `1.5px solid ${T.border}`, background: "transparent", color: T.text, cursor: "pointer", fontSize: 14, fontWeight: 500, fontFamily: "inherit", transition: "background .15s" }}
                    onMouseEnter={e => e.currentTarget.style.background = T.surface}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    View all {filtered.length} stocks
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* DRILLDOWN MODAL */}
      {selected && <DrilldownModal stock={selected} T={T} onClose={() => setSelected(null)} />}
    </div>
  );
}
