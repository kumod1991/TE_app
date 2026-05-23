import { useState, useEffect, useMemo } from "react";

// ─── SUPABASE ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://munqjcjvzgqyxzlmuyjj.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bnFqY2p2emdxeXh6bG11eWpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3MDc5NzEsImV4cCI6MjA4NzI4Mzk3MX0.9nHH5bTsL-RRwMMPoxTBFz3896BlhBBhUPGh0xP3U4Q";
function sbH() {
  return { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
}

// ─── CACHE (7-day localStorage TTL) ──────────────────────────────────────────
// FIX 2: Store only the processed output, not raw shareholding+mapping arrays.
// This cuts the localStorage payload by ~60-70% and eliminates the need to run
// buildSectorMap / buildRawData / buildProcessed on every cold mount.
const CACHE_KEY    = "ownership_processed_v8"; // bumped: names now from company_financials.name
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function cacheRead() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, processed } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    return { processed, ts };
  } catch { return null; }
}

function cacheWrite(processed) {
  // FIX 2: Persist only the processed array — not raw API payloads.
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), processed })); } catch {}
}

function cacheInvalidate() {
  try { localStorage.removeItem(CACHE_KEY); } catch {}
  if (window.__ownershipInit) {
    window.__ownershipInit.refreshing = true;
    window.__ownershipInit.fetchedAt  = 0; // force re-fetch on next load()
  }
  _prefetchPromise = null; // allow prefetch to run again after invalidation
}

// ─── BACKGROUND PREFETCH ─────────────────────────────────────────────────────
// Call prefetchOwnershipData() from your app root / after login succeeds.
// It fires before the user ever clicks the Ownership tab so that when they
// do arrive, data is already fetched, processed, and parked on
// window.__ownershipInit — giving an instant first render.
//
// *** FIX 1 — MOST IMPORTANT ***
// This function already exists but must actually be called after login.
// Without this call, window.__ownershipInit is always null on page load,
// forcing every tab visit to hit localStorage + run buildProcessed() from scratch.
//
// Usage (in your app root or post-login handler):
//   import { prefetchOwnershipData } from "./OwnershipScansModule";
//   prefetchOwnershipData(); // fire-and-forget — warm the cache before tab is clicked
let _prefetchPromise = null;
const FRESH_MS = 5 * 60 * 1000; // 5 minutes — skip network if data is newer than this

export function prefetchOwnershipData() {
  // Already fully loaded and fresh — nothing to do
  if (window.__ownershipInit && !window.__ownershipInit.loading && !window.__ownershipInit.refreshing) {
    return Promise.resolve();
  }

  // ── SYNCHRONOUS cache warm-up ──────────────────────────────────────────────
  // This MUST be synchronous so that window.__ownershipInit is populated before
  // the component mounts and calls getInit(). Any async/setTimeout/requestIdleCallback
  // here creates a race where getInit() still sees null and falls into the cold-load path.
  if (!window.__ownershipInit) {
    const cached = cacheRead();
    if (cached) {
      const age = Date.now() - cached.ts;
      window.__ownershipInit = {
        processed: cached.processed,
        loading:   false,
        refreshing: age > FRESH_MS, // only background-refresh if genuinely stale
        cacheAge:  age,
        fetchedAt: cached.ts,
      };
    }
  }

  // If we now have fresh data (either just set above or already existed), skip the network
  if (window.__ownershipInit && !window.__ownershipInit.loading && !window.__ownershipInit.refreshing) {
    return Promise.resolve();
  }

  // Network fetch needed — deduplicate with a module-level promise
  if (_prefetchPromise) return _prefetchPromise;

  // Mark as loading so getInit() in the component sees a loading state
  // and doesn't launch its own duplicate fetch
  if (!window.__ownershipInit) {
    window.__ownershipInit = { processed: [], loading: true, refreshing: false, cacheAge: null, fetchedAt: null };
  }

  _prefetchPromise = Promise.all([
    fetchAllPages("company_shareholding?select=ticker,name,quarterly"),
    fetchCompanyFinancialsMapping(),
  ]).then(async ([sh, mp]) => {
    const sectorMap = buildSectorMap(mp);
    const cfNames   = buildCfNameMap(mp);
    const rawData   = buildRawData(sh, mp, cfNames);
    const processed = await buildProcessedAsync(rawData, sectorMap);
    cacheWrite(processed);
    window.__ownershipInit = {
      processed,
      loading: false, refreshing: false, cacheAge: 0,
      fetchedAt: Date.now(),
    };
  }).catch(() => {
    _prefetchPromise = null; // allow retry on next call
  });
  return _prefetchPromise;
}

// ─── PAGINATED FETCH (parallel) ───────────────────────────────────────────────
// Uses a HEAD request to get total row count, then fires all page requests
// concurrently via Promise.all — turning 4 sequential round-trips (~1.2 s) into
// one parallel burst (~300 ms limited by the slowest page).
async function fetchAllPages(path) {
  const PAGE = 1000;

  // Step 1: cheap HEAD to discover total count
  let total = null;
  try {
    const head = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: "HEAD",
      headers: { ...sbH(), "Range-Unit": "items", Prefer: "count=exact" },
    });
    const cr = head.headers.get("content-range"); // e.g. "0-999/4231"
    if (cr) total = parseInt(cr.split("/")[1], 10);
  } catch {}

  // Step 2a: parallel fetch when we know the total
  if (total && total > 0) {
    const offsets = [];
    for (let o = 0; o < total; o += PAGE) offsets.push(o);
    const pages = await Promise.all(
      offsets.map(offset =>
        fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
          headers: { ...sbH(), Range: `${offset}-${offset + PAGE - 1}`, "Range-Unit": "items" },
        }).then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status} on ${path}`);
          return r.json();
        })
      )
    );
    return pages.flat();
  }

  // Step 2b: fallback to original sequential loop if HEAD failed
  let offset = 0, all = [];
  while (true) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { ...sbH(), Range: `${offset}-${offset + PAGE - 1}`, "Range-Unit": "items", Prefer: "count=exact" },
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

// ─── COMPANY NAME LOOKUP ──────────────────────────────────────────────────────
// Reads ticker → name from company_financials (synced nightly from bhav_copy).
// Reuses the existing fetchAllPages helper so pagination is handled automatically.
async function fetchCompanyFinancialsNames() {
  try {
    const rows = await fetchAllPages("company_financials?select=ticker,name");
    const map = {};
    for (const row of rows) {
      if (row.ticker && row.name) {
        map[String(row.ticker).trim()] = row.name;
      }
    }
    return map;
  } catch (err) {
    console.warn("[Ownership] company_financials name lookup failed; falling back to ticker.", err?.message || err);
    return {};
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const safeNum = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const fmt     = (v, d = 2) => (v >= 0 ? "+" : "") + Number(v).toFixed(d);
const mono    = { fontFamily: "'IBM Plex Mono', monospace" };

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
  if (qs.length < 4) return null;
  const oldest = qs[0];
  const oldProm = safeNum(oldest.promoters);
  const oldFii  = safeNum(oldest.fiis);
  const oldDii  = safeNum(oldest.diis);
  const startDate = oldest.date;
  const promFell    = tProm < -1;
  const instRose    = tFii > 1 || tDii > 1;
  const instAbsorbed = promFell && instRose;
  const fiiDominant  = Math.abs(tFii) > Math.abs(tDii) * 1.5;
  const diiDominant  = Math.abs(tDii) > Math.abs(tFii) * 1.5;
  const balanced     = !fiiDominant && !diiDominant && (tFii > 0.5 && tDii > 0.5);
  if (instAbsorbed) return `Promoter stake fell from ${oldProm.toFixed(1)}% → ${ownPromoter.toFixed(1)}% since ${startDate} while FIIs and DIIs steadily accumulated — ownership transitioning from promoter-led to institutional-led structure.`;
  if (balanced) return `Both FII (${oldFii.toFixed(1)}% → ${ownFii.toFixed(1)}%) and DII (${oldDii.toFixed(1)}% → ${ownDii.toFixed(1)}%) have been building positions since ${startDate} — balanced dual conviction is the strongest institutional signal.`;
  if (fiiDominant && tFii > 1) return `FII stake expanded from ${oldFii.toFixed(1)}% → ${ownFii.toFixed(1)}% since ${startDate} with DII relatively flat — foreign capital driving the ownership shift, likely momentum/macro driven.`;
  if (diiDominant && tDii > 1) return `DII stake expanded from ${oldDii.toFixed(1)}% → ${ownDii.toFixed(1)}% since ${startDate} with FII relatively flat — domestic conviction trade, typically longer-duration holding.`;
  if (tFii < -1 && tDii < -1) return `FII reduced from ${oldFii.toFixed(1)}% → ${ownFii.toFixed(1)}% and DII from ${oldDii.toFixed(1)}% → ${ownDii.toFixed(1)}% since ${startDate} — coordinated institutional exit, public absorbing supply.`;
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
  else if (signal === "Selective Accumulation") insight = tFii > tDii ? `FII ${fmt(tFii)}% over 4Q while DII neutral — selective foreign interest building` : `DII ${fmt(tDii)}% over 4Q while FII neutral — domestic funds accumulating selectively`;
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

// ─── SPARKBAR ─────────────────────────────────────────────────────────────────
const SC = ["▁","▂","▃","▄","▅","▆","▇","█"];
function spark(values) {
  const n = values.map(safeNum);
  const mn = Math.min(...n), mx = Math.max(...n), r = mx - mn || 1;
  return n.map(v => SC[Math.round(((v - mn) / r) * 7)]).join("");
}

// ─── SIGNAL CONFIG ────────────────────────────────────────────────────────────
const SIG = {
  "Aggressive Accumulation": { color: "#059669", bg: "rgba(5,150,105,0.08)",  border: "rgba(5,150,105,0.18)",  label: "Accum. ↑↑" },
  "Strong Accumulation":     { color: "#059669", bg: "rgba(5,150,105,0.06)",  border: "rgba(5,150,105,0.15)",  label: "Accum. ↑" },
  "Selective Accumulation":  { color: "#6b7280", bg: "rgba(107,114,128,0.06)", border: "rgba(107,114,128,0.15)", label: "Selective" },
  "Promoter Led":            { color: "#2563eb", bg: "rgba(37,99,235,0.07)",  border: "rgba(37,99,235,0.18)",  label: "Promoter Led" },
  "Distribution":            { color: "#dc2626", bg: "rgba(220,38,38,0.06)",  border: "rgba(220,38,38,0.18)",  label: "Distribution" },
  "Noise":                   { color: "#94a3b8", bg: "transparent",            border: "rgba(148,163,184,0.14)", label: "Neutral" },
};
const PHASE_CFG = {
  "Accumulation Phase": { color: "#10b981", icon: "↗" },
  "Early Entry":        { color: "#d97706", icon: "→" },
  "Distribution Phase": { color: "#dc2626", icon: "↘" },
  "Consolidation":      { color: "#6b7280", icon: "—" },
  "Insufficient Data":  { color: "#6b7280", icon: "?" },
};

// ─── FLOW BADGE ───────────────────────────────────────────────────────────────
function FlowBadge({ v, T }) {
  const n = safeNum(v);
  const isPos = n > 0.05, isNeg = n < -0.05;
  if (!isPos && !isNeg) return <span style={{ color: T.muted, ...mono }}>—</span>;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      padding: "2px 6px", borderRadius: 4, fontSize: 11, fontWeight: 600,
      ...mono,
      background: isPos ? "rgba(5,150,105,0.08)" : "rgba(220,38,38,0.07)",
      color: isPos ? "#059669" : "#dc2626",
      border: `1px solid ${isPos ? "rgba(5,150,105,0.2)" : "rgba(220,38,38,0.2)"}`,
    }}>
      {fmt(n)}%
    </span>
  );
}

// ─── SIGNAL BADGE ─────────────────────────────────────────────────────────────
function SignalBadge({ signal }) {
  const cfg = SIG[signal] || SIG["Noise"];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 9px", borderRadius: 4,
      fontSize: 10, fontWeight: 600,
      background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.border}`,
      whiteSpace: "nowrap",
      letterSpacing: "0.02em",
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
// Renders 3 mini SVG bar-charts (FII, DII, Promoter) side-by-side in the Trend
// cell. Hovering reveals a tooltip with label + last-4Q values + net change.
function TrendSparklines({ stock, T }) {
  const [tooltip, setTooltip] = useState(null); // { x, y, series }
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
      const fill = trend > 0.05 ? color
        : trend < -0.05 ? "#ef4444"
        : "#94a3b8";
      return (
        <rect key={i} x={x} y={y} width={BAR_W} height={barH}
          rx="1" fill={fill} opacity={opacity} />
      );
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

      {/* Portal-style fixed tooltip */}
      {tooltip && (
        <div style={{
          position: "fixed",
          left: tooltip.x,
          top: tooltip.y - 8,
          transform: "translate(-50%, -100%)",
          zIndex: 99999,
          background: T.card,
          border: `1px solid ${T.border}`,
          borderRadius: 8,
          padding: "9px 12px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          pointerEvents: "none",
          minWidth: 140,
          whiteSpace: "nowrap",
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: tooltip.series.color }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: T.text, letterSpacing: "0.05em" }}>
              {tooltip.series.label} Trend
            </span>
          </div>
          {/* Last 4 quarters */}
          <div style={{ display: "flex", gap: 6, marginBottom: 7 }}>
            {tooltip.vals.map((v, i) => {
              const n = safeNum(v);
              return (
                <div key={i} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: T.muted, marginBottom: 2 }}>Q{i + 1}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace",
                    color: T.subtext }}>{n.toFixed(1)}%</div>
                </div>
              );
            })}
          </div>
          {/* Net change */}
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 10, color: T.muted }}>4Q net</span>
            <span style={{
              fontSize: 12, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace",
              color: tooltip.series.trend > 0.05 ? "#059669" : tooltip.series.trend < -0.05 ? "#dc2626" : T.muted,
            }}>
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
  const qs = stock.allQuarterly;
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
  const inflectIdx = stock.inflect ? qs.findIndex(q => q.date === stock.inflect) : -1;

  const thStyle = {
    padding: "8px 14px", textAlign: "right", fontSize: 10, fontWeight: 600,
    textTransform: "uppercase", letterSpacing: ".07em", color: T.muted,
    background: T.tableHead, borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap",
  };
  const tdStyle = (extra = {}) => ({
    padding: "9px 14px", fontSize: 12, borderTop: `1px solid ${T.border}`,
    verticalAlign: "middle", textAlign: "right", ...mono, ...extra,
  });

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(2,6,23,0.62)", backdropFilter: "blur(10px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: isDark
          ? "linear-gradient(180deg, rgba(15,26,43,0.98) 0%, rgba(11,18,32,0.99) 100%)"
          : "linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(248,250,252,0.99) 100%)",
        border: `1px solid ${isDark ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.08)"}`, borderRadius: 24,
        width: "min(95vw,780px)", maxHeight: "90vh", overflow: "auto", padding: "28px 32px",
        boxShadow: `0 40px 110px rgba(0,0,0,0.34)`,
        animation: "modalIn .2s cubic-bezier(.16,1,.3,1)",
      }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
              <span style={{ fontSize: 24, fontWeight: 700, color: T.text, letterSpacing: "-0.5px",
                fontFamily: "'DM Mono', 'IBM Plex Mono', monospace" }}>{stock.ticker}</span>
              <SignalBadge signal={stock.signal} />
              <span style={{
                background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4,
                padding: "2px 8px", fontSize: 10, fontWeight: 600, color: pCfg.color, letterSpacing: "0.02em",
              }}>
                {pCfg.icon} {stock.phase}
              </span>
            </div>
            <div style={{ fontSize: 13, color: T.subtext, fontWeight: 400 }}>{stock.name}</div>
          </div>
          <button onClick={onClose} style={{
            background: isDark ? "rgba(10,18,32,0.8)" : "rgba(255,255,255,0.8)", border: `1px solid ${isDark ? "rgba(148,163,184,0.16)" : "rgba(15,23,42,0.08)"}`,
            color: T.muted, borderRadius: 12, padding: "8px 14px", cursor: "pointer", fontSize: 12,
            fontFamily: "inherit", flexShrink: 0, letterSpacing: "0.02em",
            transition: "all .12s",
          }}>✕ Close</button>
        </div>

        {/* Insight banner */}
        <div style={{
          background: `linear-gradient(180deg, ${cfg.bg} 0%, ${isDark ? "rgba(10,18,32,0.82)" : "rgba(255,255,255,0.82)"} 100%)`, border: `1px solid ${cfg.border}`, borderRadius: 18,
          padding: "18px 20px", marginBottom: 18,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: cfg.color, letterSpacing: ".1em",
            textTransform: "uppercase", marginBottom: 8 }}>
            Flow Summary · {stock.latestDate}
          </div>
          <div style={{ fontSize: 13, color: T.text, lineHeight: 1.65, marginBottom: stock.inflect ? 8 : 0 }}>
            💡 {stock.insight}
          </div>
          {stock.inflect && (
            <div style={{ fontSize: 12, color: T.subtext, marginBottom: stock.anomalies.length > 0 ? 8 : 0 }}>
              📍 FII inflection: <strong style={{ color: T.text }}>{stock.inflect}</strong>
            </div>
          )}
          {stock.anomalies.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {stock.anomalies.map(a => (
                <span key={a} style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px",
                  borderRadius: 4, background: "rgba(220,38,38,0.07)", color: "#dc2626",
                  border: "1px solid rgba(220,38,38,0.2)" }}>🚨 {a}</span>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 24, marginTop: 14, flexWrap: "wrap" }}>
            {[
              { label: "Score",         val: fmt(stock.score),              color: stock.score > 3 ? "#059669" : stock.score < -3 ? "#dc2626" : T.subtext },
              { label: "Conviction",    val: stock.conviction,              color: stock.conviction === "High" ? "#059669" : T.subtext },
              { label: "Combined Flow", val: fmt(stock.combinedFlow) + "%", color: stock.combinedFlow > 0 ? "#059669" : "#dc2626" },
              { label: "Timing",        val: stock.timing,                  color: stock.timing === "Recent" ? "#10b981" : stock.timing === "Mature" ? T.muted : T.subtext },
              { label: "Dominance",     val: stock.dominance,               color: stock.dominance === "Balanced" ? "#8b5cf6" : "#3b82f6" },
              { label: "FII Accel.",    val: fmt(stock.accel.fii) + "%",    color: stock.accel.fii > 0 ? "#059669" : "#dc2626" },
            ].map(c => (
              <div key={c.label}>
                <div style={{ fontSize: 9, color: T.muted, letterSpacing: ".07em", textTransform: "uppercase", marginBottom: 3 }}>{c.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: c.color, ...mono }}>{c.val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Ownership Story */}
        {stock.story && (
          <div style={{
            background: isDark ? "rgba(10,18,32,0.78)" : "rgba(255,255,255,0.82)", border: `1px solid ${isDark ? "rgba(148,163,184,0.12)" : "rgba(15,23,42,0.07)"}`, borderRadius: 18,
            padding: "16px 18px", marginBottom: 18,
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: T.muted, letterSpacing: ".09em",
              textTransform: "uppercase", marginBottom: 8 }}>Ownership Story</div>
            <div style={{ fontSize: 13, color: T.text, lineHeight: 1.7 }}>{stock.story}</div>
          </div>
        )}

        {/* Ownership vs Flow cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
          {[
            {
              title: "Ownership (Position)",
              items: [
                { label: "Promoter", val: stock.ownPromoter.toFixed(1) + "%", color: "#059669" },
                { label: "FII",      val: stock.ownFii.toFixed(1) + "%",      color: "#3b82f6" },
                { label: "DII",      val: stock.ownDii.toFixed(1) + "%",      color: "#8b5cf6" },
                { label: "Public",   val: stock.ownPublic.toFixed(1) + "%",   color: T.subtext },
              ],
            },
            {
              title: "Flow (Decision Variable)",
              items: [
                { label: "FII 4Q",    val: fmt(stock.fiiTrend) + "%",      color: stock.fiiTrend  > 0 ? "#059669" : "#dc2626" },
                { label: "DII 4Q",    val: fmt(stock.diiTrend) + "%",      color: stock.diiTrend  > 0 ? "#059669" : "#dc2626" },
                { label: "FII QoQ",   val: fmt(stock.deltaFii) + "%",      color: stock.deltaFii  > 0 ? "#059669" : "#dc2626" },
                { label: "Promo. 4Q", val: fmt(stock.promoterTrend) + "%", color: stock.promoterTrend > 0 ? "#059669" : "#dc2626" },
              ],
            },
          ].map(panel => (
            <div key={panel.title} style={{
              background: isDark ? "rgba(10,18,32,0.78)" : "rgba(255,255,255,0.84)", border: `1px solid ${isDark ? "rgba(148,163,184,0.12)" : "rgba(15,23,42,0.07)"}`, borderRadius: 18, padding: "16px 18px",
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: T.muted, letterSpacing: ".09em",
                textTransform: "uppercase", marginBottom: 14 }}>{panel.title}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {panel.items.map(c => (
                  <div key={c.label}>
                    <div style={{ fontSize: 9, color: T.muted, marginBottom: 4, textTransform: "uppercase", letterSpacing: ".05em" }}>{c.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: c.color, ...mono }}>{c.val}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div style={{ background: isDark ? "rgba(10,18,32,0.78)" : "rgba(255,255,255,0.84)", border: `1px solid ${isDark ? "rgba(148,163,184,0.12)" : "rgba(15,23,42,0.07)"}`, borderRadius: 18,
          padding: "16px 14px 12px", marginBottom: 18 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: T.muted, letterSpacing: ".09em",
            textTransform: "uppercase", marginBottom: 10, paddingLeft: 6 }}>Shareholding Trend (%)</div>
          <svg width="100%" viewBox={`0 0 ${W} ${H + 22}`} style={{ display: "block" }}>
            {[0, 0.33, 0.66, 1].map(f => {
              const y = gY(mn + f * r);
              return <line key={f} x1={20} x2={W - 20} y1={y} y2={y}
                stroke={T.border} strokeWidth="0.5" strokeDasharray="3,3" />;
            })}
            {series.map(s => (
              <polyline key={s.key}
                points={qs.map((q, i) => `${gX(i)},${gY(q[s.key])}`).join(" ")}
                fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {inflectIdx > 0 && (
              <g>
                <line x1={gX(inflectIdx)} x2={gX(inflectIdx)} y1={8} y2={H - 5}
                  stroke="#d97706" strokeWidth="1" strokeDasharray="4,3" />
                <text x={gX(inflectIdx)} y={7} textAnchor="middle" fontSize="8" fill="#d97706">FII↑</text>
              </g>
            )}
            {qs.map((q, i) => i % Math.max(1, Math.floor(qs.length / 5)) === 0 && (
              <text key={i} x={gX(i)} y={H + 18} textAnchor="middle" fontSize="8.5" fill={T.muted}>
                {q.date?.slice(0, 7) || ""}
              </text>
            ))}
          </svg>
          <div style={{ display: "flex", gap: 16, paddingLeft: 6, flexWrap: "wrap", marginTop: 4 }}>
            {series.map(s => (
              <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 16, height: 2, background: s.color, borderRadius: 2 }} />
                <span style={{ fontSize: 11, color: T.subtext }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quarterly history table */}
        <div style={{ fontSize: 9, fontWeight: 700, color: T.muted, letterSpacing: ".09em",
          textTransform: "uppercase", marginBottom: 10 }}>Quarterly History</div>
        <div style={{ background: isDark ? "rgba(10,18,32,0.78)" : "rgba(255,255,255,0.9)", border: `1px solid ${isDark ? "rgba(148,163,184,0.12)" : "rgba(15,23,42,0.07)"}`, borderRadius: 18,
          overflow: "hidden", marginBottom: 16 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: "left" }}>Date</th>
                {["Promoter %","FII %","DII %","Public %","Shareholders"].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...qs].reverse().map((q, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? T.card : T.surface }}>
                  <td style={tdStyle({ textAlign: "left", fontWeight: 600, color: T.text, fontSize: 12 })}>{q.date}</td>
                  <td style={tdStyle({ color: "#059669" })}>{safeNum(q.promoters).toFixed(2)}</td>
                  <td style={tdStyle({ color: "#3b82f6" })}>{safeNum(q.fiis).toFixed(2)}</td>
                  <td style={tdStyle({ color: "#8b5cf6" })}>{safeNum(q.diis).toFixed(2)}</td>
                  <td style={tdStyle({ color: T.subtext })}>{safeNum(q.public).toFixed(2)}</td>
                  <td style={tdStyle({ color: T.muted })}>{q.number_of_shareholders ? Number(q.number_of_shareholders).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {qs.some(q => q.number_of_shareholders) && (
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: T.muted, letterSpacing: ".09em",
              textTransform: "uppercase", marginBottom: 10 }}>Shareholders Trend</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <MiniLine data={qs.map(q => q.number_of_shareholders || 0)} color="#d97706" w={180} h={38} />
              <span style={{ fontSize: 12, color: T.subtext }}>
                Latest: {qs[qs.length-1]?.number_of_shareholders
                  ? Number(qs[qs.length-1].number_of_shareholders).toLocaleString() : "—"}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── INSIGHTS STRIP ───────────────────────────────────────────────────────────
function InsightsStrip({ processed, T }) {
  const isDark = (T?.bg || "").toLowerCase() === "#060d1a";
  const stats = useMemo(() => {
    if (!processed.length) return null;
    const fiiLeading     = processed.filter(x => !["Noise","Distribution"].includes(x.signal) && x.fiiTrend > x.diiTrend).length;
    const totalAccum     = processed.filter(x => !["Noise","Distribution"].includes(x.signal)).length;
    const fiiPct         = totalAccum > 0 ? Math.round(fiiLeading / totalAccum * 100) : 0;
    const sectorCounts   = {};
    processed.filter(x => x.sector && ["Aggressive Accumulation","Strong Accumulation"].includes(x.signal))
      .forEach(x => { sectorCounts[x.sector] = (sectorCounts[x.sector] || 0) + 1; });
    const topSector      = Object.entries(sectorCounts).sort((a,b) => b[1]-a[1])[0];
    const accelPositive  = processed.filter(x => x.accel.fii > 0.5 && x.accel.dii > 0.5).length;
    const promExitInstEntry = processed.filter(x => x.promoterTrend < -1 && x.combinedFlow > 2).length;
    const items = [
      accelPositive > 0      && { label: `${accelPositive} stocks`, sub: "showing accelerating dual accumulation (FII+DII)", dot: "#d97706" },
      promExitInstEntry > 0  && { label: `${promExitInstEntry} stocks`, sub: "with promoter exit absorbed by institutions", dot: "#6366f1" },
      topSector              && { label: topSector[0], sub: `${topSector[1]} stocks in strong accumulation — top sector`, dot: "#059669" },
      fiiPct > 0             && { label: `${fiiPct}%`, sub: "of accumulation cases led by FII flows", dot: "#3b82f6" },
    ].filter(Boolean).slice(0, 4);
    return items;
  }, [processed]);

  if (!stats || !stats.length) return null;
  const borderColor = isDark ? "rgba(148,163,184,0.10)" : "rgba(15,23,42,0.07)";
  const bg = isDark ? "rgba(10,18,32,0.82)" : "rgba(255,255,255,0.92)";
  return (
    <div style={{
      display: "flex", gap: 8, padding: "2px 0 8px", overflowX: "auto",
      flexShrink: 0, alignItems: "stretch",
    }} className="os-chip-scroll">
      <div style={{
        display: "flex", alignItems: "center", gap: 6, padding: "8px 12px",
        borderRadius: 10, background: bg, border: `1px solid ${borderColor}`,
        flexShrink: 0,
      }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: T.muted }} />
        <span style={{ fontSize: 9, fontWeight: 800, color: T.muted, letterSpacing: ".12em", textTransform: "uppercase" }}>
          Intel
        </span>
      </div>
      {stats.map((item, i) => (
        <div key={i} style={{
          background: bg,
          border: `1px solid ${borderColor}`,
          borderRadius: 10, padding: "8px 14px",
          display: "flex", alignItems: "center", gap: 10,
          whiteSpace: "nowrap", flexShrink: 0,
        }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: item.dot, flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: T.text, fontFamily: "'IBM Plex Mono', monospace" }}>{item.label}</span>
          <span style={{ fontSize: 11.5, color: T.subtext }}>{item.sub}</span>
        </div>
      ))}
    </div>
  );
}

// ─── INLINE LOADING SKELETON ──────────────────────────────────────────────────
// Shows skeleton UI when no cached data is available (true first load only)
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
    <div style={{ padding: "24px 28px" }}>
      <style>{`
        @keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }
      `}</style>

      {/* Header skeleton */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Block w={180} h={20} />
          <Block w={340} h={13} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Block w={86} h={32} style={{ borderRadius: 8 }} />
          <Block w={72} h={32} style={{ borderRadius: 8 }} />
        </div>
      </div>

      {/* Stat cards skeleton */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{
            background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "18px 20px",
            display: "flex", flexDirection: "column", gap: 8,
          }}>
            <Block w={90} h={10} />
            <Block w={60} h={24} />
            <Block w={120} h={11} />
          </div>
        ))}
      </div>

      {/* Filter row skeleton */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[80, 110, 90, 110, 100, 90, 110, 110, 100].map((w, i) => (
          <Block key={i} w={w} h={30} style={{ borderRadius: 6 }} />
        ))}
      </div>

      {/* Table skeleton */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", background: T.tableHead, borderBottom: `1px solid ${T.border}`, display: "flex", gap: 12 }}>
          {[140, 60, 50, 50, 80, 80, 70, 60, 100, 80].map((w, i) => (
            <Block key={i} w={w} h={10} />
          ))}
        </div>
        {[...Array(8)].map((_, i) => (
          <div key={i} style={{
            padding: "13px 14px", borderTop: `1px solid ${T.border}`,
            background: i % 2 === 0 ? T.card : T.surface,
            display: "flex", gap: 12, alignItems: "center",
          }}>
            <Block w={140} h={13} />
            {[60, 50, 50, 80, 80, 70, 60, 100, 80].map((w, j) => (
              <Block key={j} w={w} h={12} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── DATA BUILDERS ────────────────────────────────────────────────────────────
// buildSectorMap / buildRawData / buildProcessed are used by prefetchOwnershipData
// and by applyData inside the component. They are NOT called on re-mount when
// window.__ownershipInit is already populated (which is the common path).
function buildSectorMap(mapping) {
  const sMap = {};
  mapping.forEach(({ nse_code, sector, ticker }) => {
    if (ticker && sector) sMap[String(ticker).trim()] = sector;
    if (nse_code && sector) sMap[String(nse_code).trim()] = sector;
  });
  return sMap;
}
// Build ticker → company name map from company_financials rows (already in memory).
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
  // Enrich each row's name from company_financials (preferred) → shareholding name → ticker
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
// Async chunked variant used on true cold loads — yields to the browser every
// CHUNK rows so the skeleton keeps animating instead of freezing mid-crunch.
async function buildProcessedAsync(rawData, sectorMap) {
  const CHUNK = 200;
  const results = [];
  for (let i = 0; i < rawData.length; i += CHUNK) {
    const chunk = rawData.slice(i, i + CHUNK).map(r => processStock(r, sectorMap)).filter(Boolean);
    results.push(...chunk);
    // Yield to browser between chunks
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return results;
}

// ─── PERSISTENT WINDOW CACHE ──────────────────────────────────────────────────
// window.__ownershipInit is a true singleton that survives any number of React
// mount/unmount cycles within a single page session.
//
// Shape:
//   { processed[], loading, refreshing, cacheAge, fetchedAt }
//
// FIX 2 improvement: getInit() no longer needs to call buildSectorMap /
// buildRawData / buildProcessed — those are expensive and only run once during
// prefetch or applyData. Cache now stores the final processed array directly.
function getInit() {
  // window.__ownershipInit is populated synchronously by prefetchOwnershipData()
  // before the component ever mounts — so this is almost always just a fast property read.
  if (window.__ownershipInit) return window.__ownershipInit;

  // Fallback: prefetch wasn't called yet (e.g. direct deep-link). Read localStorage now.
  const cached = cacheRead();
  if (!cached) {
    window.__ownershipInit = {
      processed: [],
      loading: true, refreshing: false, cacheAge: null, fetchedAt: null,
    };
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

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function OwnershipScansModule({ T }) {
  const getIsMobile = () => (typeof window !== "undefined" ? window.innerWidth <= 768 : false);
  const isDark = (T?.bg || "").toLowerCase() === "#060d1a";
  // getInit() is synchronous — on repeat visits reads from window, zero cost.
  // On first visit after login it reads only the processed array from localStorage
  // (no heavy rebuild). If prefetchOwnershipData() was called after login,
  // window.__ownershipInit is already populated before the tab is even clicked.
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
  const [showEdu,    setShowEdu]    = useState(false);
  const [searchQ,    setSearchQ]    = useState("");
  const [page,           setPage]          = useState(1);
  const [fullScreen,     setFullScreen]     = useState(false);
  const [fullPage,       setFullPage]       = useState(1);
  const [fullPageSize,   setFullPageSize]   = useState(25);
  const [isMobile,       setIsMobile]       = useState(getIsMobile);
  const [mobileVisibleCount, setMobileVisibleCount] = useState(25);
  const PREVIEW_SIZE = 8;
  const PAGE_SIZE    = 50;

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onResize = () => setIsMobile(getIsMobile());
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // FIX 2: applyData now only needs the raw API responses; it builds processed
  // once and caches only that — no raw arrays are persisted.
  async function applyData(shareholding, mapping, cfNames = {}) {
    const sMap    = buildSectorMap(mapping);
    const raw     = buildRawData(shareholding, mapping, cfNames);
    // Use async chunked build to avoid blocking the main thread on large datasets
    const proc    = await buildProcessedAsync(raw, sMap);
    // FIX 2: persist processed output only
    cacheWrite(proc);
    // Update window singleton so next re-mount is still instant
    window.__ownershipInit = {
      processed: proc,
      loading: false, refreshing: false, cacheAge: 0,
      fetchedAt: Date.now(),
    };
    setProcessed(proc);
  }

  useEffect(() => {
    async function load() {
      setError(null);

      const w = window.__ownershipInit;

      // ── Fast path: data is fully loaded and fresh ──────────────────────────
      // prefetchOwnershipData() already populated window.__ownershipInit synchronously
      // from localStorage before this component mounted, so this is the common path.
      if (w && !w.loading && !w.refreshing) {
        setProcessed(w.processed);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // ── Cache hit but stale: data is already on screen, await background refresh ──
      // prefetchOwnershipData() is already running the network fetch (_prefetchPromise).
      // Just wait for it to finish rather than launching a duplicate parallel fetch.
      if (w && !w.loading && w.refreshing) {
        setProcessed(w.processed || []);
        setLoading(false);
        setRefreshing(true);
        if (_prefetchPromise) {
          try { await _prefetchPromise; } catch {}
        }
        // After prefetch resolves, window.__ownershipInit has fresh data
        const fresh = window.__ownershipInit;
        if (fresh) {
          setProcessed(fresh.processed);
        }
        setRefreshing(false);
        return;
      }

      // ── Cold load: no cache at all — show skeleton and fetch ──────────────
      // This only happens on the very first ever visit (empty localStorage).
      setLoading(true);
      try {
        // If prefetch already started, piggyback on it
        if (_prefetchPromise) {
          await _prefetchPromise;
          const fresh = window.__ownershipInit;
          if (fresh) setProcessed(fresh.processed);
        } else {
          const [sh, mp] = await Promise.all([
            fetchAllPages("company_shareholding?select=ticker,name,quarterly"),
            fetchCompanyFinancialsMapping(),
          ]);
          await applyData(sh, mp, buildCfNameMap(mp));
        }
      } catch (e) { setError(e.message); }
      finally { setLoading(false); }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const paginated  = useMemo(() => filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE), [filtered, page]);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  useEffect(() => {
    setMobileVisibleCount(25);
  }, [filter, scoreMin, searchQ, sortKey, sortDir, processed.length, isMobile]);

  function onSort(k) {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
    setPage(1);
  }

  // ── TABLE STYLES ────────────────────────────────────────────────────────────
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
        ...TH_BASE,
        textAlign: left ? "left" : "right",
        color: active ? T.text : T.muted,
        borderBottom: `2px solid ${active ? (T.green || "#10b981") : T.border}`,
        paddingBottom: active ? 8 : 9,
      }}>
        {label}{active ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
      </th>
    );
  };

  const TD = (extra = {}) => ({
    padding: "0 16px", height: 54, fontSize: 13,
    borderBottom: `1px solid ${isDark ? "rgba(99,131,179,0.07)" : "rgba(15,23,42,0.05)"}`,
    verticalAlign: "middle", ...extra,
  });

  const Fbtn = ({ id, label, col }) => (
    <button
      onClick={() => { setFilter(id); setPage(1); }}
      style={{
        padding: "5px 13px", borderRadius: 5, fontSize: 11.5, fontWeight: 600,
        cursor: "pointer", fontFamily: "inherit", transition: "all .1s",
        border: `1px solid ${filter === id ? col : T.border}`,
        background: filter === id ? col + "14" : "transparent",
        color: filter === id ? col : T.muted,
        letterSpacing: "0.01em",
      }}
    >{label}</button>
  );

  const filterOptions = [
    { id: "all",        label: "All",            col: "#6b7280" },
    { id: "smart",      label: "Smart Money",    col: "#059669" },
    { id: "aggressive", label: "Aggressive",     col: "#059669" },
    { id: "recent",     label: "Recent Entry",   col: "#10b981" },
    { id: "accel",      label: "Accelerating",   col: "#d97706" },
    { id: "balanced",   label: "Balanced",       col: "#8b5cf6" },
    { id: "promoter",   label: "Promoter Led",   col: "#2563eb" },
    { id: "promout",    label: "Inst. Absorbed", col: "#6366f1" },
    { id: "exit",       label: "Distribution",   col: "#dc2626" },
  ];
  const sortOptions = [
    { value: "score", label: "Score" },
    { value: "combinedFlow", label: "Combined Flow" },
    { value: "fiiTrend", label: "FII Flow 4Q" },
    { value: "diiTrend", label: "DII Flow 4Q" },
    { value: "promoterTrend", label: "Promoter Flow" },
    { value: "deltaFii", label: "FII QoQ" },
    { value: "accelFii", label: "FII Acceleration" },
  ];
  const previewStocks = isMobile
    ? filtered.slice(0, mobileVisibleCount)
    : filtered.slice(0, PREVIEW_SIZE);
  const fullPageStocks = filtered.slice((fullPage - 1) * fullPageSize, fullPage * fullPageSize);
  const fullPageCount = Math.max(1, Math.ceil(filtered.length / fullPageSize));
  const activeFilter = filterOptions.find(x => x.id === filter) || filterOptions[0];
  const activeSort = sortOptions.find(x => x.value === sortKey)?.label || sortKey;
  const chipPalette = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#f97316"];
  const positiveRegime = summary.avgInst >= 0;
  const elevatedBorder = isDark ? "rgba(148,163,184,0.14)" : "rgba(15,23,42,0.08)";
  const sectionCardBg = T.card;
  const softSectionBg = T.surface || T.card;
  const summaryCards = [
    {
      label: "Smart Money",
      value: summary.smartMoney,
      sub: "Names with aligned institutional accumulation",
      color: "#059669",
      tint: "rgba(5,150,105,0.10)",
    },
    {
      label: "Distribution",
      value: summary.distribution,
      sub: "FII and DII selling pressure is dominant",
      color: "#dc2626",
      tint: "rgba(220,38,38,0.08)",
    },
    {
      label: "Promoter Support",
      value: summary.promoterUp,
      sub: "Promoter stake increased over the last four quarters",
      color: "#2563eb",
      tint: "rgba(37,99,235,0.08)",
    },
    {
      label: "Universe",
      value: processed.length,
      sub: summary.label + " — market regime signal",
      color: summary.avgInst >= 0 ? "#059669" : "#dc2626",
      tint: summary.avgInst >= 0 ? "rgba(5,150,105,0.08)" : "rgba(220,38,38,0.06)",
    },
  ];
  function renderStockCard(stock, rowNum) {
    const chipColor = chipPalette[stock.ticker.charCodeAt(0) % chipPalette.length];
    const positiveFlow = stock.combinedFlow >= 0;
    const scoreColor = stock.score > 3 ? "#059669" : stock.score < -3 ? "#dc2626" : T.text;
    const statGridCols = isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))";

    return (
      <button
        key={`${stock.ticker}-${rowNum}`}
        onClick={() => setSelected(stock)}
        className="os-premium-card"
        style={{
          width: "100%",
          border: `1px solid ${elevatedBorder}`,
          borderRadius: 18,
          background: sectionCardBg,
          padding: isMobile ? 16 : 18,
          cursor: "pointer",
          textAlign: "left",
          color: "inherit",
          boxShadow: isDark ? "0 10px 22px rgba(0,0,0,0.14)" : "0 8px 18px rgba(15,23,42,0.04)",
          transition: "transform .18s ease, box-shadow .18s ease, border-color .18s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <div style={{
              width: isMobile ? 42 : 48,
              height: isMobile ? 42 : 48,
              borderRadius: 14,
              flexShrink: 0,
              background: `${chipColor}18`,
              border: `1px solid ${chipColor}32`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `inset 0 1px 0 ${chipColor}22`,
            }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: chipColor, letterSpacing: "0.08em", ...mono }}>
                {stock.ticker.slice(0, 4)}
              </span>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                <span style={{ fontSize: isMobile ? 14 : 15, fontWeight: 700, color: T.text }}>
                  {stock.name || stock.ticker}
                </span>
                {stock.timing === "Recent" && (
                  <span style={{ padding: "3px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: "rgba(16,185,129,0.12)", color: "#059669" }}>
                    RECENT
                  </span>
                )}
                {stock.accel.fii > 0.3 && stock.accel.dii > 0.3 && (
                  <span style={{ padding: "3px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: "rgba(217,119,6,0.12)", color: "#b45309" }}>
                    ACCEL
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: T.subtext, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span style={{ ...mono }}>{stock.ticker}</span>
                {stock.sector && <span>{stock.sector}</span>}
                <span style={{ color: positiveFlow ? "#059669" : "#dc2626", fontWeight: 600 }}>
                  {positiveFlow ? "Flow +" : "Flow -"} {fmt(stock.combinedFlow)}%
                </span>
              </div>
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.12em", color: T.muted, marginBottom: 4 }}>
              Score
            </div>
            <div style={{ fontSize: isMobile ? 22 : 24, fontWeight: 800, color: scoreColor, ...mono }}>
              {fmt(stock.score)}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: statGridCols, gap: 10, marginBottom: 14 }}>
          {[
            { label: "Promoter", value: `${stock.ownPromoter.toFixed(1)}%`, color: T.text },
            { label: "FII 4Q", value: `${fmt(stock.fiiTrend)}%`, color: stock.fiiTrend >= 0 ? "#059669" : "#dc2626" },
            { label: "DII 4Q", value: `${fmt(stock.diiTrend)}%`, color: stock.diiTrend >= 0 ? "#059669" : "#dc2626" },
            { label: "Conviction", value: stock.conviction, color: stock.conviction === "High" ? "#059669" : stock.conviction === "Medium" ? "#b45309" : T.subtext },
          ].map(item => (
            <div key={item.label} style={{ border: `1px solid ${T.border}`, borderRadius: 16, padding: "10px 12px", background: T.card }}>
              <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.08em", color: T.muted, marginBottom: 5 }}>
                {item.label}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: item.color, ...mono }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>

        <div style={{ borderRadius: 18, padding: "12px 14px", background: positiveFlow ? "rgba(5,150,105,0.06)" : "rgba(220,38,38,0.05)", border: `1px solid ${positiveFlow ? "rgba(5,150,105,0.12)" : "rgba(220,38,38,0.12)"}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
            <SignalBadge signal={stock.signal} />
            <span style={{ fontSize: 11.5, color: T.subtext }}>{stock.phase}</span>
          </div>
          <div style={{ fontSize: 12.5, lineHeight: 1.65, color: T.subtext }}>
            {stock.story || "Institutional ownership pattern available in the drilldown."}
          </div>
        </div>

        <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontSize: 11.5, color: T.muted }}>
            #{rowNum} in current ranking
          </div>
          <div style={{ transform: "scale(0.96)", transformOrigin: "right center" }}>
            <TrendSparklines stock={stock} T={T} />
          </div>
        </div>
      </button>
    );
  }

  // ─── TRUE FIRST-LOAD (no cache) ────────────────────────────────────────────
  if (loading) return <LoadingSkeleton T={T} />;

  if (error) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", background: T.bg }}>
      <div style={{
        background: T.card, border: "1px solid rgba(220,38,38,0.25)", borderRadius: 12,
        padding: "24px 32px", textAlign: "center", maxWidth: 400,
      }}>
        <div style={{ fontSize: 20, marginBottom: 10 }}>⚠️</div>
        <div style={{ fontSize: 13, color: "#dc2626", marginBottom: 6, fontWeight: 600 }}>Failed to load data</div>
        <div style={{ fontSize: 12, color: T.subtext, lineHeight: 1.6 }}>{error}</div>
        <div style={{ fontSize: 11, color: T.muted, marginTop: 6 }}>Check the failing Supabase endpoint shown above. <code>company_shareholding</code> is required; <code>company_financials</code> is only used for sector mapping.</div>
      </div>
    </div>
  );

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="os-scroll-root" style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", minHeight: 0, overflowY: "scroll", overflowX: "hidden", background: T.bg }}>
      <style>{[
        "@keyframes spin    { to { transform: rotate(360deg) } }",
        "@keyframes fadeIn  { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: translateY(0) } }",
        "@keyframes modalIn { from { opacity: 0; transform: translateY(10px) scale(.98) } to { opacity: 1; transform: none } }",
        "@keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }",
        "@keyframes floatIn { from { opacity: 0; transform: translateY(16px) scale(.985) } to { opacity: 1; transform: translateY(0) scale(1) } }",
        ".os-row { transition: box-shadow .15s; }",
        ".os-row td { transition: background .1s; }",
        ".os-row:hover td { background: " + (isDark ? "rgba(99,131,179,0.04)" : "rgba(15,23,42,0.025)") + " !important; }",
        ".os-row:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.06); position: relative; z-index: 1; }",
        ".os-btn { transition: opacity .12s, transform .12s; }",
        ".os-btn:hover { opacity: .78; transform: translateY(-1px); }",
        ".os-chip-scroll { scrollbar-width: none; }",
        ".os-chip-scroll::-webkit-scrollbar { display: none; }",
        "select { appearance: none; }",
        ".os-premium-card { transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; }",
        ".os-premium-card:hover { transform: translateY(-2px); box-shadow: " + (isDark ? "0 18px 36px rgba(0,0,0,0.24)" : "0 14px 28px rgba(15,23,42,0.08)") + " !important; }",
        ".os-scroll-root { scrollbar-width: thin; }",
        ".os-scroll-root::-webkit-scrollbar { width: 5px; }",
        ".os-scroll-root::-webkit-scrollbar-track { background: transparent; }",
        ".os-scroll-root::-webkit-scrollbar-thumb { background: rgba(100,116,139,0.25); border-radius: 999px; }",
        ".os-icon-btn { transition: background .12s, color .12s; }",
        ".os-icon-btn:hover { background: " + (isDark ? "rgba(99,131,179,0.12)" : "rgba(15,23,42,0.06)") + " !important; }",
      ].join("\n")}</style>

      <div style={{ width: "100%", maxWidth: isMobile ? "100%" : 1400, margin: "0 auto", textAlign: "center", padding: isMobile ? "16px 14px 28px" : "22px 28px 36px", boxSizing: "border-box" }}>

        {/* PAGE HEADER — Command Center */}
        <div style={{
          border: `1px solid ${elevatedBorder}`,
          borderRadius: 20,
          marginBottom: 18,
          background: sectionCardBg,
          boxShadow: isDark ? "0 14px 36px rgba(0,0,0,0.18)" : "0 12px 28px rgba(15,23,42,0.05)",
          animation: "fadeIn .24s ease",
        }}>
          <div style={{ padding: isMobile ? "18px 18px 16px" : "22px 28px 20px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            {/* Left: Title + insight line */}
            <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <div style={{ fontSize: isMobile ? 22 : 27, lineHeight: 1.0, letterSpacing: "-0.04em", fontWeight: 800, color: T.text, fontFamily: "'DM Sans', 'Inter', sans-serif" }}>
                  Ownership Intelligence
                </div>
                {refreshing && (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 1.2s linear infinite", flexShrink: 0 }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                )}
              </div>
              <div style={{ fontSize: isMobile ? 12.5 : 13, color: T.subtext, lineHeight: 1.6, marginBottom: 14, maxWidth: 560 }}>
                Track institutional accumulation and distribution across the equity universe
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 7, background: softSectionBg, border: `1px solid ${elevatedBorder}`, fontSize: 11, color: T.subtext, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>
                  {processed.length} stocks
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 7, background: `${activeFilter.col}10`, border: `1px solid ${activeFilter.col}22`, fontSize: 11, color: activeFilter.col, fontWeight: 700 }}>
                  {activeFilter.label}
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 7, background: softSectionBg, border: `1px solid ${elevatedBorder}`, fontSize: 11, color: T.subtext }}>
                  {filtered.length} matched
                </span>
              </div>
            </div>
            {/* Right: icon-only actions */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, paddingTop: 2 }}>
              {!isMobile && (
                <button title="View full universe" className="os-btn" onClick={() => { setFullScreen(true); setFullPage(1); }} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 10, border: `1px solid ${T.border}`, background: T.text, color: T.surface || T.card, cursor: "pointer" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                </button>
              )}
              <button title="Refresh data" className="os-btn" onClick={() => { cacheInvalidate(); setProcessed([]); setLoading(true); Promise.all([fetchAllPages("company_shareholding?select=ticker,name,quarterly"), fetchCompanyFinancialsMapping()]).then(([sh, mp]) => applyData(sh, mp, buildCfNameMap(mp))).catch(e => setError(e.message)).finally(() => setLoading(false)); }} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 10, border: `1px solid ${T.border}`, background: "transparent", color: T.subtext, cursor: "pointer" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
              </button>
              <button title="How to use" className="os-btn" onClick={() => setShowEdu(v => !v)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 10, border: `1px solid ${showEdu ? T.text : T.border}`, background: showEdu ? T.text : "transparent", color: showEdu ? (T.surface || T.card) : T.subtext, cursor: "pointer" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
              </button>
            </div>
          </div>
        </div>

        {/* EDUCATION PANEL */}
        {showEdu && (
          <div style={{
            background: sectionCardBg,
            border: `1px solid ${elevatedBorder}`, borderRadius: 18,
            padding: "18px 22px", marginBottom: 20,
            animation: "fadeIn .18s cubic-bezier(.16,1,.3,1)",
            boxShadow: isDark ? "0 12px 28px rgba(0,0,0,0.16)" : "0 10px 22px rgba(15,23,42,0.04)",
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 14 }}>
              How To Use Ownership Scans
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "10px 28px", fontSize: 12.5, color: T.subtext, lineHeight: 1.75 }}>
              <div><span style={{ color: T.text, fontWeight: 600 }}>1. Start with filters</span> to isolate Smart Money, Recent Entry, Accelerating, Promoter Led, or Distribution setups.</div>
              <div><span style={{ color: T.text, fontWeight: 600 }}>2. Use Score and 4Q flows</span> to rank conviction. Higher positive FII and DII flows usually indicate stronger institutional interest.</div>
              <div><span style={{ color: T.text, fontWeight: 600 }}>3. Treat Ownership % as context</span>, but treat flow change over QoQ and 4Q as the main decision signal.</div>
              <div><span style={{ color: "#3b82f6", fontWeight: 600 }}>4. FII Flow ↑</span> suggests foreign participation. <span style={{ color: "#8b5cf6", fontWeight: 600 }}>DII Flow ↑</span> suggests domestic conviction.</div>
              <div><span style={{ color: "#059669", fontWeight: 600 }}>5. Open any stock</span> to inspect the quarterly ownership chart, flow summary, and ownership story before acting.</div>
              <div><span style={{ color: T.text, fontWeight: 600 }}>6. Watch for divergence</span> where promoter selling is absorbed by institutions, or where both FIIs and DIIs distribute together.</div>
            </div>
          </div>
        )}

        {/* TOP INSIGHT CARD */}
        {(() => {
          const top = processed.length ? [...processed].sort((a,b) => b.score - a.score)[0] : null;
          const accelCount = processed.filter(x => x.accel.fii > 0.5 && x.accel.dii > 0.5).length;
          const topSectorCounts = {};
          processed.filter(x => x.sector && ["Aggressive Accumulation","Strong Accumulation"].includes(x.signal))
            .forEach(x => { topSectorCounts[x.sector] = (topSectorCounts[x.sector] || 0) + 1; });
          const topSector = Object.entries(topSectorCounts).sort((a,b) => b[1]-a[1])[0];
          if (!top) return null;
          return (
            <div style={{ border: `1px solid ${elevatedBorder}`, borderRadius: 16, background: sectionCardBg, padding: isMobile ? "14px 16px" : "16px 22px", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", boxShadow: isDark ? "0 8px 20px rgba(0,0,0,0.14)" : "0 6px 16px rgba(15,23,42,0.04)" }}>
              <div>
                <div style={{ fontSize: 9, fontWeight: 800, color: T.muted, letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 6 }}>Top Insight Today</div>
                {topSector ? (
                  <div style={{ fontSize: 13, color: T.text, lineHeight: 1.5 }}>
                    <span style={{ fontWeight: 700, color: "#059669" }}>{topSector[0]}</span>
                    <span style={{ color: T.subtext }}> showing strongest institutional accumulation — </span>
                    <span style={{ fontWeight: 600, color: T.text }}>{topSector[1]} stocks</span>
                    {accelCount > 0 && <span style={{ color: T.subtext }}> with {accelCount} dual FII+DII acceleration</span>}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: T.subtext }}>Top-ranked name: <span style={{ fontWeight: 700, color: T.text }}>{top.name || top.ticker}</span> — score <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: "#059669", fontWeight: 700 }}>{fmt(top.score)}</span></div>
                )}
              </div>
              {top && (
                <button onClick={() => setSelected(top)} style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 14px", cursor: "pointer", fontFamily: "inherit", color: T.subtext, fontSize: 11.5, fontWeight: 600, flexShrink: 0 }}>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.text, fontWeight: 700 }}>{top.ticker}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                </button>
              )}
            </div>
          );
        })()}

        {/* INTEL STRIP */}
        <div style={{ marginBottom: 14 }}>
          <InsightsStrip processed={processed} T={T} />
        </div>

        {/* SUMMARY STAT CARDS */}
        {processed.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: isMobile ? 10 : 14, marginBottom: 18 }}>
            {summaryCards.map(c => (
              <div key={c.label} style={{ background: sectionCardBg, border: `1px solid ${elevatedBorder}`, borderRadius: 16, padding: isMobile ? "14px 16px" : "18px 20px", boxShadow: isDark ? "0 8px 20px rgba(0,0,0,0.12)" : "0 6px 16px rgba(15,23,42,0.04)" }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: T.muted, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 8 }}>{c.label}</div>
                <div style={{ fontSize: isMobile ? 26 : 30, fontWeight: 800, color: c.color, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "-0.03em", marginBottom: 6, lineHeight: 1 }}>{c.value.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: T.subtext, lineHeight: 1.5 }}>{c.sub}</div>
                <div style={{ marginTop: 10, height: 3, borderRadius: 999, background: T.border, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 999, width: `${Math.min(100, (c.value / Math.max(processed.length, 1)) * 100)}%`, background: c.color, opacity: 0.7, transition: "width 0.6s ease" }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* FILTERS + CONTROLS — Segmented + Advanced Dropdown */}
        <div style={{
          border: `1px solid ${elevatedBorder}`,
          borderRadius: 18,
          background: sectionCardBg,
          padding: isMobile ? 14 : 16,
          marginBottom: 18,
          boxShadow: isDark ? "0 12px 28px rgba(0,0,0,0.16)" : "0 10px 22px rgba(15,23,42,0.04)",
        }}>
          {/* Primary segmented control row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            {/* Primary segments */}
            <div style={{ display: "inline-flex", borderRadius: 12, border: `1px solid ${T.border}`, overflow: "hidden", background: softSectionBg, flexShrink: 0 }}>
              {[
                { id: "all",   label: "All" },
                { id: "smart", label: "Accumulation" },
                { id: "exit",  label: "Distribution" },
              ].map(({ id, label }, idx, arr) => (
                <button key={id} onClick={() => { setFilter(id); setPage(1); setFullPage(1); }}
                  style={{
                    padding: "9px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                    fontFamily: "inherit", border: "none", outline: "none",
                    borderRight: idx < arr.length - 1 ? `1px solid ${T.border}` : "none",
                    background: filter === id ? (id === "exit" ? "#dc262614" : id === "all" ? T.elevated || softSectionBg : "#05996914") : "transparent",
                    color: filter === id ? (id === "exit" ? "#dc2626" : id === "all" ? T.text : "#059669") : T.subtext,
                    transition: "all .12s",
                  }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Advanced filter dropdown */}
            <div style={{ position: "relative", flexShrink: 0 }}>
              <select
                value={["aggressive","recent","accel","balanced","promoter","promout"].includes(filter) ? filter : ""}
                onChange={e => { if (e.target.value) { setFilter(e.target.value); setPage(1); setFullPage(1); } }}
                style={{ background: softSectionBg, border: `1px solid ${["aggressive","recent","accel","balanced","promoter","promout"].includes(filter) ? "#6366f1" : T.border}`, color: ["aggressive","recent","accel","balanced","promoter","promout"].includes(filter) ? "#6366f1" : T.subtext, borderRadius: 12, padding: "9px 14px 9px 12px", fontSize: 12, fontFamily: "inherit", cursor: "pointer", fontWeight: 600 }}>
                <option value="">Filters ⚙</option>
                <option value="aggressive">Aggressive Accum.</option>
                <option value="recent">Recent Entry</option>
                <option value="accel">Accelerating (FII+DII)</option>
                <option value="balanced">Balanced Conviction</option>
                <option value="promoter">Promoter Led</option>
                <option value="promout">Inst. Absorbed</option>
              </select>
            </div>

            {/* Sort + Score */}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <select value={sortKey} onChange={e => { setSortKey(e.target.value); setSortDir("desc"); setPage(1); setFullPage(1); }} style={{ background: softSectionBg, border: `1px solid ${T.border}`, color: T.text, borderRadius: 10, padding: "8px 12px", fontSize: 11.5, fontFamily: "inherit", cursor: "pointer" }}>
                {sortOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <select value={scoreMin} onChange={e => { setScoreMin(Number(e.target.value)); setPage(1); setFullPage(1); }} style={{ background: softSectionBg, border: `1px solid ${T.border}`, color: T.text, borderRadius: 10, padding: "8px 12px", fontSize: 11.5, fontFamily: "inherit", cursor: "pointer" }}>
                {[-10, -5, 0, 1, 2, 3, 5].map(v => <option key={v} value={v}>Score ≥ {v >= 0 ? "+" : ""}{v}</option>)}
              </select>
            </div>
          </div>

          {/* Search */}
          <div style={{ position: "relative" }}>
            <svg style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2.2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input placeholder="Search ticker or company…" value={searchQ} onChange={e => { setSearchQ(e.target.value); setPage(1); setFullPage(1); }} style={{ width: "100%", background: softSectionBg, border: `1px solid ${T.border}`, color: T.text, borderRadius: 10, padding: "9px 12px 9px 34px", fontSize: 12, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
        </div>

        {/* COUNT ROW */}
        <div style={{ fontSize: 11.5, color: T.muted, marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
            {filtered.length} names{searchQ.trim() ? ` matching "${searchQ.trim()}"` : ""} — sorted by <span style={{ color: T.subtext, fontWeight: 600 }}>{activeSort}</span>
          </span>
        </div>

        {/* PREVIEW TABLE + MOBILE CARDS */}
        <div style={{
          background: sectionCardBg,
          border: `1px solid ${elevatedBorder}`,
          borderRadius: 20,
          overflow: "hidden",
          marginBottom: 16,
          boxShadow: isDark ? "0 12px 28px rgba(0,0,0,0.16)" : "0 10px 22px rgba(15,23,42,0.04)",
        }}>
          <div style={{ padding: isMobile ? "16px 14px 12px" : "18px 20px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", borderBottom: `1px solid ${T.border}` }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 4 }}>Top-ranked ownership names</div>
              <div style={{ fontSize: 12.5, color: T.subtext }}>
                {isMobile ? "Card-first mobile scan view." : "Preview table aligned with the main dashboard layout."}
              </div>
            </div>
            {filtered.length > PREVIEW_SIZE && (
              <button onClick={() => { setFullScreen(true); setFullPage(1); }} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "9px 14px", borderRadius: 12, background: "transparent", border: `1px solid ${T.border}`, color: T.text, cursor: "pointer", fontSize: 12.5, fontFamily: "inherit", fontWeight: 700 }}>
                View all {filtered.length}
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: "52px 24px", textAlign: "center" }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: T.tableHead, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 6 }}>No stocks match current filters</div>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 16 }}>Try adjusting the score threshold or switching to a different filter.</div>
              <button onClick={() => { setFilter("all"); setScoreMin(-10); setSearchQ(""); }} style={{ padding: "8px 16px", borderRadius: 10, border: `1px solid ${T.border}`, background: "transparent", color: T.subtext, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Clear all filters</button>
            </div>
          ) : isMobile ? (
            <div style={{ padding: isMobile ? "14px 14px 14px" : "0 14px 14px", display: "grid", gap: 12 }}>
              {previewStocks.map((stock, i) => renderStockCard(stock, i + 1))}
              {filtered.length > previewStocks.length && (
                <button
                  onClick={() => setMobileVisibleCount(c => Math.min(c + 25, filtered.length))}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "12px 16px",
                    borderRadius: 12,
                    border: `1px solid ${T.border}`,
                    background: "transparent",
                    color: T.text,
                    cursor: "pointer",
                    fontSize: 12.5,
                    fontWeight: 700,
                    fontFamily: "inherit",
                  }}
                >
                  Show more
                </button>
              )}
            </div>
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
                  <thead>
                    <tr>
                      <th style={{ ...TH_BASE, width: 44, textAlign: "center", padding: "9px 8px" }}>#</th>
                      <th style={{ ...TH_BASE, textAlign: "left", minWidth: 230 }} onClick={() => onSort("ticker")}>
                        <span style={{ color: sortKey === "ticker" ? T.text : T.muted }}>
                          Company
                        </span>
                      </th>
                      <th style={{ ...TH_BASE, textAlign: "left", minWidth: 130 }}>Industry</th>
                      <Th col="ownPromoter" label="Promo. %" />
                      <Th col="ownFii" label="FII %" />
                      <Th col="ownDii" label="DII %" />
                      <Th col="fiiTrend" label="FII Flow 4Q" />
                      <Th col="diiTrend" label="DII Flow 4Q" />
                      <Th col="score" label="Score" />
                      <th style={{ ...TH_BASE, textAlign: "center" }}>Signal</th>
                      <th style={{ ...TH_BASE, textAlign: "center" }}>Conv.</th>
                      <th style={{ ...TH_BASE, textAlign: "center" }}>Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewStocks.map((stock, i) => {
                      const chipColor = chipPalette[stock.ticker.charCodeAt(0) % chipPalette.length];
                      return (
                        <tr key={stock.ticker} className="os-row" style={{ cursor: "pointer" }} onClick={() => setSelected(stock)}>
                          <td style={{ ...TD(), width: 44, textAlign: "center", padding: "0 8px", color: T.muted, fontSize: 12 }}>{i + 1}</td>
                          <td style={{ ...TD(), textAlign: "left", paddingLeft: 12 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: `${chipColor}15`, border: `1px solid ${chipColor}28`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <span style={{ fontSize: 9, fontWeight: 800, color: chipColor, letterSpacing: "0.02em", ...mono }}>{stock.ticker.slice(0, 4)}</span>
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 2 }}>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{stock.name || stock.ticker}</span>
                                  {stock.timing === "Recent" && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: "rgba(16,185,129,0.1)", color: "#10b981" }}>RECENT</span>}
                                  {stock.accel.fii > 0.3 && stock.accel.dii > 0.3 && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 999, background: "rgba(217,119,6,0.08)", color: "#d97706" }}>ACCEL</span>}
                                </div>
                                <div style={{ fontSize: 11, color: T.muted }}>
                                  <span style={{ ...mono, color: T.subtext }}>{stock.ticker}</span>
                                  {stock.sector && <span style={{ color: T.muted }}> · {stock.sector}</span>}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td style={{ ...TD(), textAlign: "left", fontSize: 12, color: T.subtext }}>{stock.sector || "—"}</td>
                          <td style={{ ...TD(), textAlign: "right", ...mono, color: T.muted, fontSize: 13 }}>{stock.ownPromoter.toFixed(1)}</td>
                          <td style={{ ...TD(), textAlign: "right", ...mono, color: T.muted, fontSize: 13 }}>{stock.ownFii.toFixed(1)}</td>
                          <td style={{ ...TD(), textAlign: "right", ...mono, color: T.muted, fontSize: 13 }}>{stock.ownDii.toFixed(1)}</td>
                          <td style={{ ...TD(), textAlign: "right", ...mono }}><span style={{ fontSize: 13, fontWeight: 700, color: stock.fiiTrend > 0.05 ? "#059669" : stock.fiiTrend < -0.05 ? "#dc2626" : T.muted }}>{fmt(stock.fiiTrend)}%</span></td>
                          <td style={{ ...TD(), textAlign: "right", ...mono }}><span style={{ fontSize: 13, fontWeight: 700, color: stock.diiTrend > 0.05 ? "#059669" : stock.diiTrend < -0.05 ? "#dc2626" : T.muted }}>{fmt(stock.diiTrend)}%</span></td>
                          <td style={{ ...TD(), textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 14, letterSpacing: "-0.01em", color: stock.score > 3 ? "#059669" : stock.score < -3 ? "#dc2626" : T.text }}>{fmt(stock.score)}</td>
                          <td style={{ ...TD(), textAlign: "center" }}><SignalBadge signal={stock.signal} /></td>
                          <td style={{ ...TD(), textAlign: "center", fontSize: 12, fontWeight: 700, color: stock.conviction === "High" ? "#059669" : stock.conviction === "Medium" ? "#d97706" : T.muted }}>{stock.conviction}</td>
                          <td style={{ ...TD(), textAlign: "center", padding: "0 10px" }}><TrendSparklines stock={stock} T={T} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: "12px 18px 16px", borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", background: T.tableHead }}>
                <span style={{ fontSize: 12, color: T.muted }}>
                  Showing {Math.min(PREVIEW_SIZE, filtered.length)} of {filtered.length} stocks
                </span>
                <span style={{ fontSize: 12, color: T.subtext }}>
                  Ranked by {activeSort}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

        {/* FULL-SCREEN OVERLAY */}
        {fullScreen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: `linear-gradient(180deg, ${T.bg} 0%, ${T.surface || T.bg} 100%)`, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden", animation: "fadeIn .18s ease" }}>

            {/* Top bar */}
            <div style={{ borderBottom: `1px solid ${T.border}`, background: `${T.card}F2`, backdropFilter: "blur(18px)", flexShrink: 0, boxShadow: "0 18px 42px rgba(15,23,42,0.06)", display: "flex", justifyContent: "center" }}>
              <div style={{ width: "100%", maxWidth: isMobile ? "100%" : 1400, padding: isMobile ? "14px" : "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <button onClick={() => setFullScreen(false)}
                    style={{ display: "flex", alignItems: "center", gap: 7, background: T.surface || T.card, border: `1px solid ${T.border}`, borderRadius: 14, cursor: "pointer", color: T.subtext, fontSize: 12.5, padding: "10px 14px", fontFamily: "inherit", fontWeight: 700 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5"/><path d="m12 5-7 7 7 7"/></svg>
                    Back
                  </button>
                  <div style={{ width: 1, height: 18, background: T.border }} />
                  <span style={{ fontSize: isMobile ? 17 : 18, fontWeight: 800, color: T.text, letterSpacing: "-0.03em" }}>Ownership Scans Workspace</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 999, background: isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.04)", border: `1px solid ${T.border}`, fontSize: 11.5, color: T.subtext }}><span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: T.text }}>{filtered.length}</span> stocks</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 1, border: `1px solid ${T.border}`, borderRadius: 999, overflow: "hidden", background: T.surface || T.card }}>
                    {[25, 50, 100].map(n => (
                      <button key={n} onClick={() => { setFullPageSize(n); setFullPage(1); }}
                        style={{ padding: "8px 12px", fontSize: 11.5, fontFamily: "inherit", cursor: "pointer", border: "none",
                          background: fullPageSize === n ? activeFilter.col + "14" : "transparent",
                          color: fullPageSize === n ? activeFilter.col : T.muted,
                          fontWeight: fullPageSize === n ? 700 : 500,
                          borderRight: n !== 100 ? `1px solid ${T.border}` : "none" }}>
                        {n}
                      </button>
                    ))}
                  </div>
                  <select value={sortKey} onChange={e => { setSortKey(e.target.value); setSortDir("desc"); setFullPage(1); }}
                    style={{ background: T.surface || T.card, border: `1px solid ${T.border}`, color: T.text, borderRadius: 14, padding: "10px 12px", fontSize: 12.5, fontFamily: "inherit", cursor: "pointer" }}>
                    <option value="combinedFlow">Combined Flow</option>
                    <option value="score">Score</option>
                    <option value="fiiTrend">FII Flow 4Q</option>
                    <option value="diiTrend">DII Flow 4Q</option>
                    <option value="promoterTrend">Promoter Flow</option>
                    <option value="accelFii">FII Acceleration</option>
                  </select>
                  <div style={{ position: "relative" }}>
                    <svg style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2.2" strokeLinecap="round">
                      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                    </svg>
                    <input placeholder="Search ticker / name..." value={searchQ}
                      onChange={e => { setSearchQ(e.target.value); setFullPage(1); }}
                      style={{ background: T.surface || T.card, border: `1px solid ${T.border}`, color: T.text, borderRadius: 14, padding: "10px 12px 10px 28px", fontSize: 12.5, width: isMobile ? "100%" : 220, outline: "none", fontFamily: "inherit" }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Filter bar */}
            <div style={{ borderBottom: `1px solid ${T.border}`, background: `${T.card}F0`, flexShrink: 0, display: "flex", justifyContent: "center" }}>
              <div className="os-chip-scroll" style={{ width: "100%", maxWidth: isMobile ? "100%" : 1400, display: "flex", alignItems: "center", gap: 8, padding: isMobile ? "10px 14px" : "10px 24px", overflowX: "auto" }}>
                {/* Primary segments */}
                <div style={{ display: "inline-flex", borderRadius: 10, border: `1px solid ${T.border}`, overflow: "hidden", background: T.surface || T.card, flexShrink: 0 }}>
                  {[
                    { id: "all",   label: "All" },
                    { id: "smart", label: "Accumulation" },
                    { id: "exit",  label: "Distribution" },
                  ].map(({ id, label }, idx, arr) => (
                    <button key={id} onClick={() => { setFilter(id); setFullPage(1); }}
                      style={{
                        padding: "8px 14px", fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                        fontFamily: "inherit", border: "none", outline: "none",
                        borderRight: idx < arr.length - 1 ? `1px solid ${T.border}` : "none",
                        background: filter === id ? (id === "exit" ? "#dc262612" : id === "all" ? T.elevated || "#f0f0f0" : "#05996912") : "transparent",
                        color: filter === id ? (id === "exit" ? "#dc2626" : id === "all" ? T.text : "#059669") : T.subtext,
                      }}>
                      {label}
                    </button>
                  ))}
                </div>
                {/* Advanced dropdown */}
                <select
                  value={["aggressive","recent","accel","balanced","promoter","promout"].includes(filter) ? filter : ""}
                  onChange={e => { if (e.target.value) { setFilter(e.target.value); setFullPage(1); } }}
                  style={{ background: T.surface || T.card, border: `1px solid ${["aggressive","recent","accel","balanced","promoter","promout"].includes(filter) ? "#6366f1" : T.border}`, color: ["aggressive","recent","accel","balanced","promoter","promout"].includes(filter) ? "#6366f1" : T.subtext, borderRadius: 10, padding: "8px 12px", fontSize: 11.5, fontFamily: "inherit", cursor: "pointer", fontWeight: 600, flexShrink: 0 }}>
                  <option value="">Filters ⚙</option>
                  <option value="aggressive">Aggressive Accum.</option>
                  <option value="recent">Recent Entry</option>
                  <option value="accel">Accelerating (FII+DII)</option>
                  <option value="balanced">Balanced Conviction</option>
                  <option value="promoter">Promoter Led</option>
                  <option value="promout">Inst. Absorbed</option>
                </select>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: T.muted }}>Score ≥</span>
                  <select value={scoreMin} onChange={e => { setScoreMin(Number(e.target.value)); setFullPage(1); }}
                    style={{ background: T.surface || T.card, border: `1px solid ${T.border}`, color: T.text, borderRadius: 8, padding: "7px 10px", fontSize: 11, fontFamily: "inherit", cursor: "pointer" }}>
                    {[-10,-5,0,1,2,3,5].map(v => <option key={v} value={v}>{v >= 0 ? "+" : ""}{v}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Scrollable table area */}
            <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: isMobile ? "12px 14px 14px" : "18px 24px 16px", display: "flex", justifyContent: "center" }}>
              <div style={{ width: "100%", maxWidth: isMobile ? "100%" : 1400, border: `1px solid ${T.border}`, borderRadius: 24, overflow: "hidden", background: T.card, boxShadow: "0 18px 38px rgba(15,23,42,0.05)", flexShrink: 0 }}>
              <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", background: `linear-gradient(180deg, ${T.surface || T.card} 0%, ${T.card} 100%)` }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 3 }}>Ranked ownership universe</div>
                  <div style={{ fontSize: 12, color: T.subtext }}>Scrollable institutional ownership table with fixed headers and cleaner spacing.</div>
                </div>
                <div style={{ fontSize: 12, color: T.muted }}>Showing {Math.min(fullPage * fullPageSize, filtered.length)} of {filtered.length}</div>
              </div>
              <div style={{ maxHeight: isMobile ? "none" : "calc(100vh - 320px)", minHeight: 0, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1120 }}>
                <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
                  <tr>
                    <th style={{ ...TH_BASE, width: 44, textAlign: "center", padding: "9px 8px" }}>#</th>
                    <th style={{ ...TH_BASE, textAlign: "left", minWidth: 280 }} onClick={() => onSort("ticker")}>
                      <span style={{ color: sortKey === "ticker" ? T.text : T.muted }}>
                        Company{sortKey === "ticker" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                      </span>
                    </th>
                    <th style={{ ...TH_BASE, textAlign: "left", minWidth: 160 }}>Industry</th>
                    <Th col="ownPromoter" label="Promo. %" />
                    <Th col="ownFii"      label="FII %" />
                    <Th col="ownDii"      label="DII %" />
                    <Th col="fiiTrend"    label="FII Flow 4Q" />
                    <Th col="diiTrend"    label="DII Flow 4Q" />
                    <Th col="score"       label="Score" />
                    <th style={{ ...TH_BASE, textAlign: "center" }}>Signal</th>
                    <th style={{ ...TH_BASE, textAlign: "center" }}>Conv.</th>
                    <th style={{ ...TH_BASE, textAlign: "center" }}>Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const fp = filtered.slice((fullPage-1)*fullPageSize, fullPage*fullPageSize);
                    if (fp.length === 0) return (
                      <tr><td colSpan={12} style={{ padding: "48px 24px", textAlign: "center", color: T.muted, fontSize: 13 }}>No stocks match current filters</td></tr>
                    );
                    return fp.map((stock, i) => {
                      const rowNum = (fullPage - 1) * fullPageSize + i + 1;
                      const chipPalette = ["#6366f1","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#14b8a6","#f97316"];
                      const chipColor = chipPalette[stock.ticker.charCodeAt(0) % chipPalette.length];
                      return (
                        <tr key={stock.ticker} className="os-row" style={{ cursor: "pointer" }} onClick={() => setSelected(stock)}>
                          <td style={{ ...TD(), width: 44, textAlign: "center", padding: "0 8px", color: T.muted, fontSize: 12 }}>{rowNum}</td>
                          <td style={{ ...TD(), textAlign: "left", paddingLeft: 12 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{ width: 36, height: 36, borderRadius: 7, flexShrink: 0, background: chipColor + "15", border: `1px solid ${chipColor}28`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <span style={{ fontSize: 9, fontWeight: 800, color: chipColor, letterSpacing: "0.02em", fontFamily: "'IBM Plex Mono', monospace" }}>{stock.ticker.slice(0,4)}</span>
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 2 }}>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{stock.name || stock.ticker}</span>
                                  {stock.timing === "Recent" && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: "rgba(16,185,129,0.1)", color: "#10b981", border: "1px solid rgba(16,185,129,0.22)", letterSpacing: "0.04em" }}>RECENT</span>}
                                  {stock.accel.fii > 0.3 && stock.accel.dii > 0.3 && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: "rgba(217,119,6,0.08)", color: "#d97706", border: "1px solid rgba(217,119,6,0.2)", letterSpacing: "0.04em" }}>ACCEL</span>}
                                  {stock.anomalies.length > 0 && <span title={stock.anomalies.join(", ")} style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: "rgba(220,38,38,0.07)", color: "#dc2626", border: "1px solid rgba(220,38,38,0.18)", cursor: "help" }}>⚠</span>}
                                </div>
                                <div style={{ fontSize: 11, color: T.muted }}>
                                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: T.subtext }}>{stock.ticker}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td style={{ ...TD(), textAlign: "left", fontSize: 12, color: T.subtext }}>{stock.sector || "—"}</td>
                          <td style={{ ...TD(), textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", color: T.muted, fontSize: 13 }}>{stock.ownPromoter.toFixed(1)}</td>
                          <td style={{ ...TD(), textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", color: T.muted, fontSize: 13 }}>{stock.ownFii.toFixed(1)}</td>
                          <td style={{ ...TD(), textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", color: T.muted, fontSize: 13 }}>{stock.ownDii.toFixed(1)}</td>
                          <td style={{ ...TD(), textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: stock.fiiTrend > 0.05 ? "#059669" : stock.fiiTrend < -0.05 ? "#dc2626" : T.muted }}>{fmt(stock.fiiTrend)}%</span>
                          </td>
                          <td style={{ ...TD(), textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: stock.diiTrend > 0.05 ? "#059669" : stock.diiTrend < -0.05 ? "#dc2626" : T.muted }}>{fmt(stock.diiTrend)}%</span>
                          </td>
                          <td style={{ ...TD(), textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 14, letterSpacing: "-0.01em", color: stock.score > 3 ? "#059669" : stock.score < -3 ? "#dc2626" : T.text, minWidth: 64 }}>{fmt(stock.score)}</td>
                          <td style={{ ...TD(), textAlign: "center" }}><SignalBadge signal={stock.signal} /></td>
                          <td style={{ ...TD(), textAlign: "center", fontSize: 12, fontWeight: 600, color: stock.conviction === "High" ? "#059669" : stock.conviction === "Medium" ? "#d97706" : T.muted }}>{stock.conviction}</td>
                          <td style={{ ...TD(), textAlign: "center", padding: "0 10px" }}>
                            <TrendSparklines stock={stock} T={T} />
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
              </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ borderTop: `1px solid ${T.border}`, background: `${T.card}F2`, backdropFilter: "blur(14px)", flexShrink: 0, display: "flex", justifyContent: "center" }}>
              <div style={{ width: "100%", maxWidth: isMobile ? "100%" : 1400, padding: isMobile ? "12px 14px 16px" : "12px 24px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: T.muted }}>
                  Showing {Math.min(fullPage * fullPageSize, filtered.length)} of {filtered.length} stocks
                </span>
                {Math.ceil(filtered.length / fullPageSize) > 1 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button onClick={() => setFullPage(p => Math.max(1, p-1))} disabled={fullPage === 1}
                      style={{ background: T.surface || T.card, border: `1px solid ${T.border}`, borderRadius: 12, color: T.subtext, padding: "8px 12px", cursor: fullPage === 1 ? "default" : "pointer", fontSize: 12, fontFamily: "inherit", opacity: fullPage === 1 ? 0.45 : 1 }}>
                      ← Prev
                    </button>
                    <span style={{ fontSize: 12, color: T.muted, minWidth: 80, textAlign: "center" }}>
                      Page {fullPage} of {Math.ceil(filtered.length / fullPageSize)}
                    </span>
                    <button onClick={() => setFullPage(p => Math.min(Math.ceil(filtered.length / fullPageSize), p+1))} disabled={fullPage === Math.ceil(filtered.length / fullPageSize)}
                      style={{ background: T.surface || T.card, border: `1px solid ${T.border}`, borderRadius: 12, color: T.subtext, padding: "8px 12px", cursor: fullPage === Math.ceil(filtered.length / fullPageSize) ? "default" : "pointer", fontSize: 12, fontFamily: "inherit", opacity: fullPage === Math.ceil(filtered.length / fullPageSize) ? 0.45 : 1 }}>
                      Next →
                    </button>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

      {/* MODAL */}
      {selected && <DrilldownModal stock={selected} T={T} onClose={() => setSelected(null)} />}
    </div>
  );
}
