import { useState, useEffect, useMemo, useRef, useCallback, startTransition, memo } from "react";

// ─── SUPABASE ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const SB_H = {
  "Content-Type": "application/json",
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

// Paginated fetch — Supabase PostgREST caps responses at 1000 rows by default.
// We use the HTTP Range header (PostgREST standard) to page through all rows.
const PAGE_SIZE = 1000;
async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e?.name === "AbortError") throw new Error("Request timed out while loading institutional flow data.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
async function sbFetchAll(table, params = {}) {
  const buildUrl = (rangeParams) => {
    const qs = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
    return `${SUPABASE_URL}/rest/v1/${table}?${qs}`;
  };
  const fetchPage = (offset, withCount) => fetchWithTimeout(buildUrl(params), {
    headers: {
      ...SB_H,
      "Range": `${offset}-${offset + PAGE_SIZE - 1}`,
      "Range-Unit": "items",
      "Prefer": withCount ? "count=exact" : "count=none",
    },
  });

  // First page tells us the total row count via the Content-Range response
  // header (PostgREST: "0-999/2143"). We use that to fire every remaining
  // page IN PARALLEL instead of awaiting them one at a time — previously
  // this was a fully serial loop, so N pages cost N sequential network
  // round-trips; now it's effectively one round-trip regardless of N.
  const first = await fetchPage(0, true);
  if (first.status === 416 || first.status === 204) return [];
  if (!first.ok) throw new Error(`${table} HTTP ${first.status}`);
  const firstPage = await first.json();
  if (!Array.isArray(firstPage) || firstPage.length === 0) return [];

  const contentRange = first.headers.get("content-range"); // "0-999/2143"
  const total = contentRange?.includes("/") ? parseInt(contentRange.split("/")[1], 10) : NaN;

  if (!Number.isFinite(total) || firstPage.length < PAGE_SIZE || total <= PAGE_SIZE) {
    return firstPage;
  }

  const remainingOffsets = [];
  for (let offset = PAGE_SIZE; offset < total; offset += PAGE_SIZE) remainingOffsets.push(offset);

  const restPages = await Promise.all(remainingOffsets.map(async (offset) => {
    const r = await fetchPage(offset, false);
    if (r.status === 416 || r.status === 204) return [];
    if (!r.ok) throw new Error(`${table} HTTP ${r.status}`);
    const page = await r.json();
    return Array.isArray(page) ? page : [];
  }));

  return firstPage.concat(...restPages);
}

const CACHE_TTL_MS = 15 * 60 * 1000;

// ─── FORMAT ───────────────────────────────────────────────────────────────────
const fmtCrShort = (v) => {
  if (v == null || !isFinite(+v)) return "—";
  const n = +v, a = Math.abs(n), s = n < 0 ? "-" : "+";
  if (a >= 100000) return `${s}${(a / 100000).toFixed(1)}L`;
  if (a >= 1000)   return `${s}${(a / 1000).toFixed(0)}K`;
  return `${s}${a.toFixed(0)}`;
};
const fmtDate = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};
const fmtDateShort = (d) => {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};
const fmtMonth = (d) => {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
};
const fmtYear = (d) => {
  if (!d) return "";
  return String(new Date(d).getFullYear());
};

// ─── COLORS ───────────────────────────────────────────────────────────────────
const GREEN = "#10b981", RED = "#ef4444", BLUE = "#3b82f6", AMBER = "#f59e0b", PURPLE = "#8b5cf6";
const getColor = (v) => (v == null || !isFinite(+v)) ? "#6b7280" : +v >= 0 ? GREEN : RED;

const DEFAULT_THEME = {
  bg: "#f3f7fb",
  shellBg: "radial-gradient(circle at top left, rgba(15, 118, 110, 0.12), transparent 28%), radial-gradient(circle at top right, rgba(37, 99, 235, 0.1), transparent 24%), linear-gradient(180deg, #f8fbfd 0%, #eef4f8 100%)",
  card: "rgba(255, 255, 255, 0.88)",
  surface: "rgba(241, 245, 249, 0.92)",
  elevated: "rgba(255, 255, 255, 0.96)",
  border: "rgba(15, 23, 42, 0.08)",
  text: "#122033",
  subtext: "#5f7086",
  shadow: "0 18px 45px rgba(15, 23, 42, 0.08)",
  shadowSoft: "0 10px 24px rgba(15, 23, 42, 0.05)",
  headerBg: "linear-gradient(180deg, rgba(248, 251, 253, 0.96) 0%, rgba(243, 247, 251, 0.92) 100%)",
  tabActiveBg: "rgba(15, 118, 110, 0.12)",
  tabActiveText: "#0f766e",
  accent: "#0f766e",
  accentMuted: "rgba(15, 118, 110, 0.14)",
  radiusLg: 24,
  radiusMd: 18,
  radiusSm: 12,
  fontSans: '"IBM Plex Sans", "Segoe UI", sans-serif',
  fontMono: '"IBM Plex Mono", "SFMono-Regular", Consolas, monospace',
};

const DARK_THEME = {
  bg: "#091321",
  shellBg: "linear-gradient(180deg, #091321 0%, #0c1728 100%)",
  card: "#0c1828",
  surface: "#101d30",
  elevated: "#132238",
  border: "rgba(148, 163, 184, 0.12)",
  text: "#edf4ff",
  subtext: "#7f96b3",
  shadow: "0 18px 36px rgba(2, 6, 23, 0.26)",
  shadowSoft: "0 8px 20px rgba(2, 6, 23, 0.16)",
  headerBg: "rgba(9, 19, 33, 0.94)",
  tabActiveBg: "rgba(16, 185, 129, 0.14)",
  tabActiveText: "#34d399",
  accent: "#34d399",
  accentMuted: "rgba(52, 211, 153, 0.18)",
};

function parseColorToRgb(color) {
  if (!color || typeof color !== "string") return null;
  const v = color.trim();
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const raw = hex[1];
    const full = raw.length === 3 ? raw.split("").map(ch => ch + ch).join("") : raw;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
    };
  }
  const rgb = v.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3] };
  return null;
}

function isDarkColor(color) {
  const rgb = parseColorToRgb(color);
  if (!rgb) return false;
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luminance < 0.5;
}

function buildTheme(themeProp = {}) {
  const looksDark = [themeProp.bg, themeProp.card, themeProp.surface]
    .filter(Boolean)
    .some(isDarkColor);
  const base = looksDark ? { ...DEFAULT_THEME, ...DARK_THEME } : DEFAULT_THEME;
  return {
    ...base,
    ...themeProp,
    isDark: looksDark,
    shellOverlay: themeProp.shellOverlay || (looksDark
      ? "linear-gradient(180deg, rgba(255,255,255,0.015), transparent 16%)"
      : "linear-gradient(180deg, rgba(255,255,255,0.28), transparent 22%)"),
    headerShadow: themeProp.headerShadow || (looksDark
      ? "0 8px 22px rgba(2, 6, 23, 0.22)"
      : "0 8px 22px rgba(15, 23, 42, 0.06)"),
  };
}

// ─── DATE RANGE FILTER ────────────────────────────────────────────────────────
// 5Y is the hard ceiling across the module — nothing older is ever fetched,
// cached, or offered as a selectable range (see MAX_HISTORY_YEARS below).
const RANGE_YEARS = { "1Y": 1, "3Y": 3, "5Y": 5 };

function filterByRange(data, range) {
  if (!data.length) return data;
  if (range === "All") return data;
  const years = RANGE_YEARS[range];
  if (!years) return data;
  const getDateStr = (d) => d.date || d.fullDate;
  const latest = new Date(getDateStr(data[data.length - 1]));
  const cutoff = new Date(latest);
  cutoff.setFullYear(latest.getFullYear() - years);
  return data.filter(d => new Date(getDateStr(d)) >= cutoff);
}

// Returns the year-span of a dataset so we can label range buttons accurately
function dataYearSpan(data) {
  if (!data?.length) return 0;
  const getDateStr = (d) => d.date || d.fullDate;
  const oldest = new Date(getDateStr(data[0]));
  const latest = new Date(getDateStr(data[data.length - 1]));
  return (latest - oldest) / (365.25 * 24 * 3600 * 1000);
}

// ─── AGGREGATE ROWS BY FREQUENCY ─────────────────────────────────────────────
function getWeekStart(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay() || 7;
  const mon = new Date(d);
  mon.setDate(d.getDate() - day + 1);
  return mon.toISOString().slice(0, 10);
}

function aggregateCashRows(rows, freq) {
  if (freq === "Daily") return rows;
  const getKey = (date) => {
    if (freq === "Weekly")  return getWeekStart(date);
    if (freq === "Monthly") { const d = new Date(date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
    if (freq === "Annual")  return String(new Date(date).getFullYear());
    return date;
  };
  const buckets = {};
  rows.forEach(r => {
    const k = getKey(r.date);
    if (!buckets[k]) buckets[k] = { date: r.date, endDate: r.date, fii_buy:0, fii_sell:0, fii_net:0, dii_buy:0, dii_sell:0, dii_net:0 };
    buckets[k].endDate   = r.date;
    buckets[k].fii_buy  += +r.fii_buy  || 0;
    buckets[k].fii_sell += +r.fii_sell || 0;
    buckets[k].fii_net  += +r.fii_net  || 0;
    buckets[k].dii_buy  += +r.dii_buy  || 0;
    buckets[k].dii_sell += +r.dii_sell || 0;
    buckets[k].dii_net  += +r.dii_net  || 0;
  });
  return Object.values(buckets).sort((a, b) => new Date(b.endDate) - new Date(a.endDate));
}

function fmtPeriodLabel(dateStr, freq) {
  if (!dateStr) return "—";
  if (freq === "Annual")  return fmtYear(dateStr);
  if (freq === "Monthly") return fmtMonth(dateStr);
  if (freq === "Weekly")  return `Wk ${fmtDateShort(dateStr)}`;
  return fmtDate(dateStr);
}

function getPointDate(d) {
  return d?.date || d?.fullDate || d?.endDate || null;
}

function pivotDerivData(rows) {
  if (!rows?.length) return [];
  const hasClientType = Object.keys(rows[0]).includes("client_type");
  if (!hasClientType) return [...rows].sort((a, b) => new Date(a.date) - new Date(b.date));
  const byDate = {};
  rows.forEach(r => {
    const d = r.date;
    if (!byDate[d]) byDate[d] = { date: d };
    const ct = (r.client_type || "").toUpperCase();
    if (ct === "FII") {
      byDate[d].fii_fut_long  = +r.index_fut_long  || 0;
      byDate[d].fii_fut_short = +r.index_fut_short || 0;
      byDate[d].fii_long  = (+r.index_fut_long||0)+(+r.index_call_long||0)+(+r.index_put_long||0);
      byDate[d].fii_short = (+r.index_fut_short||0)+(+r.index_call_short||0)+(+r.index_put_short||0);
    } else if (ct === "DII") {
      byDate[d].dii_fut_long  = +r.index_fut_long  || 0;
      byDate[d].dii_fut_short = +r.index_fut_short || 0;
      byDate[d].dii_long  = (+r.index_fut_long||0)+(+r.index_call_long||0)+(+r.index_put_long||0);
      byDate[d].dii_short = (+r.index_fut_short||0)+(+r.index_call_short||0)+(+r.index_put_short||0);
    }
  });
  return Object.values(byDate)
    .map(d => ({ ...d, fii_net: (d.fii_long||0)-(d.fii_short||0), dii_net: (d.dii_long||0)-(d.dii_short||0) }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

// Small helper — a localStorage + in-memory TTL cache keyed by name, reused for
// both the cash and derivatives datasets below so each has its own independent
// freshness window and doesn't force-refetch the other.
//
// RANGE-AWARE: each cache entry also remembers how many years of history it
// actually holds (`years`). A read only counts as "covering" a request if
// years >= requested — this is what lets us fetch just the 1–3Y that's
// visible on first paint instead of always pulling the full 5Y ceiling, and
// then transparently top it up if/when the person picks a wider range.
function makeCache(storageKey) {
  let memData = null, memTs = 0, memYears = 0;
  return {
    read() {
      const now = Date.now();
      if (memData && now - memTs < CACHE_TTL_MS) return { data: memData, years: memYears, stale: false };
      if (typeof window === "undefined") return { data: memData, years: memYears, stale: true };
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) return { data: null, years: 0, stale: true };
        const parsed = JSON.parse(raw);
        if (!parsed?.data) return { data: null, years: 0, stale: true };
        memData = parsed.data;
        memTs = parsed.ts || 0;
        memYears = parsed.years || 0;
        return { data: parsed.data, years: memYears, stale: now - (parsed.ts || 0) >= CACHE_TTL_MS };
      } catch {
        return { data: null, years: 0, stale: true };
      }
    },
    write(data, years) {
      memData = data;
      memTs = Date.now();
      memYears = years;
      if (typeof window === "undefined") return;
      try { window.localStorage.setItem(storageKey, JSON.stringify({ data, ts: memTs, years })); } catch {}
    },
  };
}

// ─── CASH DATA — fii_dii_activity_mv ───────────────────────────────────────────
// The mv already carries precomputed 5D/20D rolling sums, 20D avg/std, and
// z-score per row (window functions run once in Postgres), so we only select
// the columns the UI actually reads instead of `select=*` (which also pulled
// down created_at and prev_*/*_change columns nobody renders).
//
// RANGE-CAPPED, DEMAND-DRIVEN FETCH: 5Y is the hard ceiling (ViewToggle only
// offers 1Y/3Y/5Y now) and we never fetch beyond it. On top of that, we don't
// pull the full 5Y just because it's the ceiling — we only ever request
// exactly what's needed for the range currently selected/visible (e.g. 1Y on
// first paint), and transparently top up with an additional fetch only if the
// person actually switches to a wider range. This keeps first-load payload
// and localStorage cache size proportional to what's on screen, not to the
// theoretical max.
const cashCache = makeCache("fiidii-cash-cache-v4");
let cashInflight = null, cashInflightYears = 0;
const CASH_SELECT = [
  "date", "fii_buy", "fii_sell", "fii_net", "dii_buy", "dii_sell", "dii_net",
  "fii_net_5d", "fii_net_20d", "dii_net_5d", "dii_net_20d",
].join(",");
const MAX_HISTORY_YEARS = 5;

function cutoffISOForYears(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - Math.min(years, MAX_HISTORY_YEARS));
  return d.toISOString().slice(0, 10);
}

async function fetchLatestCashDate() {
  const rows = await sbFetchAll("fii_dii_activity_mv", { select: "date", order: "date.desc", limit: 1 });
  return rows?.[0]?.date || null;
}

async function refreshCashData(years) {
  const boundedYears = Math.min(years, MAX_HISTORY_YEARS);
  // Reuse an in-flight request only if it already covers (or exceeds) what's
  // being asked for now — a bigger concurrent request still gets its own fetch.
  if (cashInflight && cashInflightYears >= boundedYears) return cashInflight;
  cashInflightYears = boundedYears;
  cashInflight = (async () => {
    const rows = await sbFetchAll("fii_dii_activity_mv", {
      select: CASH_SELECT, order: "date.asc", date: `gte.${cutoffISOForYears(boundedYears)}`,
    });
    const data = [...rows].sort((a, b) => new Date(a.date) - new Date(b.date));
    cashCache.write(data, boundedYears);
    return data;
  })().finally(() => { cashInflight = null; cashInflightYears = 0; });
  return cashInflight;
}

async function fetchCashData(years, { preferCache = true } = {}) {
  const boundedYears = Math.min(years, MAX_HISTORY_YEARS);
  const cached = cashCache.read();
  const cacheCoversRange = !!cached.data && cached.years >= boundedYears;

  if (preferCache && cacheCoversRange && !cached.stale) {
    fetchLatestCashDate()
      .then(remoteLatest => {
        const localLatest = cached.data[cached.data.length - 1]?.date;
        if (remoteLatest && remoteLatest > localLatest) refreshCashData(cached.years).catch(() => null);
      })
      .catch(() => null);
    return cached.data;
  }
  if (preferCache && cacheCoversRange && cached.stale) {
    refreshCashData(cached.years).catch(() => null);
    return cached.data;
  }
  // No cache yet, or cache covers a narrower range than requested — fetch
  // exactly the range needed (never more).
  return refreshCashData(boundedYears);
}

// ─── DERIVATIVES DATA — fii_dii_fo_mv ─────────────────────────────────────────────
// Lazy: only fetched the first time the Derivatives tab is actually opened (see
// the component effect below), since most sessions never touch it.
// Only the columns pivotDerivData() actually reads are selected — `select=*`
// was pulling every stock-level/OI column in the table on every load.
// Same range-capped, demand-driven fetch pattern as cash data: 5Y ceiling,
// but only the currently-selected range is actually requested up front.
const derivCache = makeCache("fiidii-deriv-cache-v5"); // v5: mv-backed, bump to invalidate old v4 shape
let derivInflight = null, derivInflightYears = 0;
// fii_dii_fo_mv is a pre-pivoted materialized view — one row per date with
// fii_/dii_ columns already merged and net precomputed server-side.
// Reading it directly instead of the raw fii_dii_fo table (2 rows/date,
// FII + DII, requiring a client-side group-by/pivot) halves the rows
// fetched and removes the JS pivot step, fixing the slow first-load on the
// Derivatives tab. pivotDerivData() already has a fast-path for pre-pivoted
// rows (no `client_type` column), so it's left in place as a no-op sort.
const DERIV_SELECT = [
  "date",
  "fii_fut_long", "fii_fut_short",
  "fii_long", "fii_short", "fii_net",
  "dii_long", "dii_short", "dii_net",
].join(",");

async function refreshDerivData(years) {
  const boundedYears = Math.min(years, MAX_HISTORY_YEARS);
  if (derivInflight && derivInflightYears >= boundedYears) return derivInflight;
  derivInflightYears = boundedYears;
  derivInflight = (async () => {
    const rows = await sbFetchAll("fii_dii_fo_mv", {
      select: DERIV_SELECT, order: "date.asc", date: `gte.${cutoffISOForYears(boundedYears)}`,
    });
    const data = pivotDerivData(rows);
    derivCache.write(data, boundedYears);
    return data;
  })().finally(() => { derivInflight = null; derivInflightYears = 0; });
  return derivInflight;
}

async function fetchDerivData(years, { preferCache = true } = {}) {
  const boundedYears = Math.min(years, MAX_HISTORY_YEARS);
  const cached = derivCache.read();
  const cacheCoversRange = !!cached.data && cached.years >= boundedYears;

  if (preferCache && cacheCoversRange && !cached.stale) return cached.data;
  if (preferCache && cacheCoversRange && cached.stale) {
    refreshDerivData(cached.years).catch(() => null);
    return cached.data;
  }
  return refreshDerivData(boundedYears);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PURE SVG CHARTS
// ═══════════════════════════════════════════════════════════════════════════════
// Called on hover/route-preload from outside the module — only warms the cash
// dataset (Overview/Cash Flow), which covers the tabs people actually land on.
export function prefetchFiiDiiData() {
  const years = RANGE_YEARS["3Y"]; // matches the module's default selected range
  const cached = cashCache.read();
  if (cached.data && cached.years >= years && !cached.stale) return Promise.resolve(cached.data);
  return fetchCashData(years, { preferCache: false }).catch(() => null);
}

const PAD = { top: 10, right: 12, bottom: 30, left: 56 };

function useChartWidth(ref) {
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(es => setW(es[0].contentRect.width || 600));
    ro.observe(ref.current);
    setW(ref.current.clientWidth || 600);
    return () => ro.disconnect();
  }, []);
  return w;
}

function yLabel(v) {
  const a = Math.abs(v);
  if (a >= 100000) return `${v < 0 ? "-" : ""}${(a / 100000).toFixed(1)}L`;
  if (a >= 1000)   return `${v < 0 ? "-" : ""}${(a / 1000).toFixed(0)}K`;
  return String(Math.round(v));
}

function niceYTicks(minV, maxV, count = 5) {
  const range = maxV - minV || 1;
  const raw   = range / count;
  const mag   = Math.pow(10, Math.floor(Math.log10(raw)));
  const step  = [1, 2, 5, 10].find(n => mag * n >= raw) * mag;
  const lo    = Math.floor(minV / step) * step;
  const ticks = [];
  for (let t = lo; t <= maxV + step * 0.5; t += step) ticks.push(+t.toFixed(8));
  return ticks;
}

function useTooltip() {
  const [tip, setTip] = useState(null);
  const show = useCallback((svgEl, clientX, clientY, content) => {
    const rect = svgEl.getBoundingClientRect();
    setTip({ x: clientX - rect.left, y: clientY - rect.top, content });
  }, []);
  const hide = useCallback(() => setTip(null), []);
  return { tip, show, hide };
}

function SvgTooltip({ tip, T, svgWidth = 1000 }) {
  if (!tip) return null;
  const W = 168;
  // FIXED: Prevent tooltip overflow on right edge
  const rightEdge = tip.x + 14 + W;
  const xPos = rightEdge > svgWidth 
    ? Math.max(5, tip.x - W - 14)  // Show on left if would overflow
    : Math.max(5, tip.x + 14);     // Show on right normally
  
  return (
    <foreignObject x={xPos} y={Math.max(2, tip.y - 24)} width={W} height={120} style={{ pointerEvents: "none" }}>
      <div xmlns="http://www.w3.org/1999/xhtml" style={{
        background: T.card, border: `1px solid ${T.border}`, borderRadius: 8,
        padding: "8px 10px", fontSize: 11, color: T.text,
        boxShadow: "0 4px 16px rgba(0,0,0,.4)", maxWidth: W,
      }}>
        {tip.content}
      </div>
    </foreignObject>
  );
}

// ── TRADINGVIEW-STYLE PANNABLE/ZOOMABLE LINE CHART ───────────────────────────
function SvgLineChart({ data, series, height = 240, fill = false, T }) {
  const wrapRef  = useRef(null);
  const svgRef   = useRef(null);
  const W = useChartWidth(wrapRef);
  const { tip, show, hide } = useTooltip();

  // Viewport: [startIdx, endIdx] into data array — full data always loaded
  const [viewport, setViewport] = useState({ start: 0, end: null });
  const isPanning  = useRef(false);
  const panStartX  = useRef(0);
  const panStartVP = useRef(null);

  // Reset viewport when data changes (new range selected)
  useEffect(() => { setViewport({ start: 0, end: null }); }, [data?.length]);

  if (!data?.length) return <div ref={wrapRef} style={{ height }} />;

  const totalPts = data.length;
  const vpEnd    = viewport.end ?? totalPts - 1;
  const vpStart  = Math.max(0, Math.min(viewport.start, vpEnd - 1));
  const visible  = data.slice(vpStart, vpEnd + 1);

  const cW = W - PAD.left - PAD.right;
  const cH = height - PAD.top - PAD.bottom;

  const allVals = visible.flatMap(d => series.map(s => +d[s.key] || 0));
  const minV = Math.min(0, ...allVals), maxV = Math.max(0, ...allVals);
  const ticks = niceYTicks(minV, maxV);
  const lo = ticks[0], hi = ticks[ticks.length - 1], span = hi - lo || 1;

  const px = (i) => PAD.left + (i / Math.max(visible.length - 1, 1)) * cW;
  const py = (v) => PAD.top + cH - ((+v - lo) / span) * cH;
  const zeroY = py(0);
  const every = Math.max(1, Math.ceil(visible.length / (W < 480 ? 5 : 10)));

  const smoothPath = (pts) => {
    if (pts.length < 2) return `M ${pts[0]?.[0] || 0},${pts[0]?.[1] || 0}`;
    let d = `M ${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const cpx = (x0 + x1) / 2;
      d += ` C ${cpx},${y0} ${cpx},${y1} ${x1},${y1}`;
    }
    return d;
  };

  // ── Zoom: wheel or pinch ──
  const onWheel = useCallback((e) => {
    e.preventDefault();
    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return;
    const mouseRatio = Math.max(0, Math.min(1, (e.clientX - svgRect.left - PAD.left) / cW));
    const curLen  = vpEnd - vpStart + 1;
    const zoomDir = e.deltaY > 0 ? 1 : -1; // +1 = zoom out, -1 = zoom in
    const step    = Math.max(1, Math.round(curLen * 0.15));
    let newLen    = Math.max(20, Math.min(totalPts, curLen + zoomDir * step));
    const anchor  = vpStart + Math.round(mouseRatio * (curLen - 1));
    let newStart  = Math.round(anchor - mouseRatio * (newLen - 1));
    let newEnd    = newStart + newLen - 1;
    if (newStart < 0)          { newStart = 0; newEnd = newLen - 1; }
    if (newEnd >= totalPts)    { newEnd = totalPts - 1; newStart = newEnd - newLen + 1; }
    newStart = Math.max(0, newStart);
    setViewport({ start: newStart, end: newEnd });
  }, [vpStart, vpEnd, totalPts, cW]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  // ── Pan: mouse drag ──
  const onMouseDown = (e) => {
    isPanning.current = true;
    panStartX.current = e.clientX;
    panStartVP.current = { start: vpStart, end: vpEnd };
    e.preventDefault();
  };
  const onMouseMove = useCallback((e) => {
    if (!isPanning.current) return;
    const dx = e.clientX - panStartX.current;
    const ratio = dx / cW;
    const curLen = panStartVP.current.end - panStartVP.current.start + 1;
    const shift  = -Math.round(ratio * curLen);
    let ns = panStartVP.current.start + shift;
    let ne = panStartVP.current.end   + shift;
    if (ns < 0)          { ns = 0; ne = curLen - 1; }
    if (ne >= totalPts)  { ne = totalPts - 1; ns = ne - curLen + 1; }
    ns = Math.max(0, ns);
    setViewport({ start: ns, end: ne });
  }, [cW, totalPts]);
  const onMouseUp = () => { isPanning.current = false; };

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup",   onMouseUp);
    return () => { window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseup", onMouseUp); };
  }, [onMouseMove]);

  // ── Touch pan ──
  const touchRef = useRef(null);
  const onTouchStartChart = (e) => {
    if (e.touches.length === 1) {
      touchRef.current = { x: e.touches[0].clientX, start: vpStart, end: vpEnd };
    }
  };
  const onTouchMoveChart = (e) => {
    if (!touchRef.current || e.touches.length !== 1) return;
    e.stopPropagation();
    const dx = e.touches[0].clientX - touchRef.current.x;
    const curLen = touchRef.current.end - touchRef.current.start + 1;
    const shift  = -Math.round((dx / cW) * curLen);
    let ns = touchRef.current.start + shift;
    let ne = touchRef.current.end   + shift;
    if (ns < 0)         { ns = 0; ne = curLen - 1; }
    if (ne >= totalPts) { ne = totalPts - 1; ns = ne - curLen + 1; }
    ns = Math.max(0, ns);
    setViewport({ start: ns, end: ne });
  };

  return (
    <div ref={wrapRef} style={{ width: "100%", userSelect: "none" }}>
      <svg ref={svgRef} width={W} height={height}
        style={{ display: "block", overflow: "visible", cursor: isPanning.current ? "grabbing" : "crosshair" }}
        onMouseLeave={() => { hide(); }}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStartChart}
        onTouchMove={onTouchMoveChart}
        onTouchEnd={() => { touchRef.current = null; }}
      >
        {/* Clip path to keep lines inside chart area */}
        <defs>
          <clipPath id="chartClip">
            <rect x={PAD.left} y={PAD.top} width={cW} height={cH} />
          </clipPath>
        </defs>

        {ticks.map(t => (
          <g key={t}>
            <line x1={PAD.left} x2={PAD.left + cW} y1={py(t)} y2={py(t)}
              stroke={T.border} strokeDasharray={t === 0 ? "none" : "3 3"}
              strokeWidth={t === 0 ? 1.5 : 1} />
            <text x={PAD.left - 5} y={py(t) + 4} textAnchor="end" fontSize={9} fill={T.subtext}>{yLabel(t)}</text>
          </g>
        ))}
        {visible.map((d, i) => i % every === 0 && (
          <text key={i} x={px(i)} y={height - 4} textAnchor="middle" fontSize={9} fill={T.subtext}>{d.label}</text>
        ))}

        <g clipPath="url(#chartClip)">
          {series.map(s => {
            const pts   = visible.map((d, i) => [px(i), py(+d[s.key] || 0)]);
            const pathD = smoothPath(pts);
            const fillD = pts.length > 1
              ? pathD + ` L ${pts[pts.length - 1][0]},${zeroY} L ${pts[0][0]},${zeroY} Z`
              : "";
            return (
              <g key={s.key}>
                {fill && fillD && <path d={fillD} fill={s.color} fillOpacity={0.12} />}
                <path d={pathD} fill="none" stroke={s.color} strokeWidth={2.2}
                  strokeDasharray={s.dashed ? "6 3" : "none"}
                  strokeLinecap="round" strokeLinejoin="round" />
              </g>
            );
          })}
        </g>

        {/* Single hover hit area — was one <rect> per data point (750-2500+ nodes
            on multi-year daily series); now one rect + nearest-point lookup. */}
        <rect
          x={PAD.left} y={PAD.top} width={cW} height={cH}
          fill="transparent"
          onMouseMove={e => {
            const rect = svgRef.current.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left - PAD.left) / cW));
            const i = Math.round(ratio * (visible.length - 1));
            const d = visible[i];
            if (!d) return;
            show(svgRef.current, e.clientX, e.clientY,
              <>
                <div style={{ fontWeight: 700, marginBottom: 4, color: T.subtext }}>{fmtDate(getPointDate(d))}</div>
                {series.map(s => <div key={s.key} style={{ color: s.color }}>{s.name}: {fmtCrShort(+d[s.key] || 0)}</div>)}
              </>
            );
          }}
        />
        <SvgTooltip tip={tip} T={T} svgWidth={W} />
      </svg>

      <div style={{ display: "flex", gap: 14, paddingLeft: PAD.left, flexWrap: "wrap", marginTop: 4 }}>
        {series.map(s => (
          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: T.subtext }}>
            <div style={{ width: 18, height: 2, background: s.color, borderRadius: 1 }} />
            {s.name}
          </div>
        ))}
        <div style={{ fontSize: 10, color: T.subtext, marginLeft: "auto" }}>🖱 scroll to zoom · drag to pan</div>
      </div>
    </div>
  );
}

// ── BAR CHART ─────────────────────────────────────────────────────────────────
function SvgBarChart({ data, series, height = 220, mode = "grouped", T }) {
  const wrapRef = useRef(null);
  const svgRef  = useRef(null);
  const W = useChartWidth(wrapRef);
  const { tip, show, hide } = useTooltip();
  if (!data?.length) return <div ref={wrapRef} style={{ height }} />;

  const cW = W - PAD.left - PAD.right;
  const cH = height - PAD.top - PAD.bottom;
  const n = data.length, ns = series.length;
  const groupW = cW / n;
  const barW = Math.max(2, Math.min(mode === "grouped" ? groupW / ns - 3 : groupW - 6, 28));
  const every = Math.max(1, Math.ceil(n / (W < 480 ? 5 : 10)));
  const allVals = data.flatMap(d => series.map(s => +d[s.key] || 0));
  const minV = Math.min(0, ...allVals), maxV = Math.max(0, ...allVals);
  const ticks = niceYTicks(minV, maxV);
  const lo = ticks[0], hi = ticks[ticks.length - 1], span = hi - lo || 1;
  const py = (v) => PAD.top + cH - ((+v - lo) / span) * cH;
  const zeroY = py(0);

  return (
    <div ref={wrapRef} style={{ width: "100%" }}>
      <svg ref={svgRef} width={W} height={height} style={{ display: "block", overflow: "visible" }} onMouseLeave={hide}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={PAD.left} x2={PAD.left + cW} y1={py(t)} y2={py(t)}
              stroke={T.border} strokeDasharray={t === 0 ? "none" : "3 3"} strokeWidth={t === 0 ? 1.5 : 1} />
            <text x={PAD.left - 5} y={py(t) + 4} textAnchor="end" fontSize={9} fill={T.subtext}>{yLabel(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const gx = PAD.left + i * groupW;
          return (
            <g key={i}>
              {series.map((s, si) => {
                const v = +d[s.key] || 0;
                const bx = mode === "grouped"
                  ? gx + si * (barW + 2) + (groupW - ns * (barW + 2)) / 2
                  : gx + (groupW - barW) / 2;
                const by = v >= 0 ? py(v) : zeroY;
                const bh = Math.max(2, Math.abs(py(v) - zeroY));
                const clr = mode === "colored" ? (v >= 0 ? GREEN : RED) : s.color;
                return <rect key={si} x={bx} y={by} width={barW} height={bh} fill={clr} opacity={0.88} rx={2} />;
              })}
              {i % every === 0 && (
                <text x={gx + groupW / 2} y={height - 4} textAnchor="middle" fontSize={9} fill={T.subtext}>{d.label}</text>
              )}
            </g>
          );
        })}
        {/* Single hover hit area — was one onMouseEnter per bar per series. */}
        <rect
          x={PAD.left} y={PAD.top} width={cW} height={cH}
          fill="transparent"
          onMouseMove={e => {
            const rect = svgRef.current.getBoundingClientRect();
            const localX = e.clientX - rect.left - PAD.left;
            const i = Math.max(0, Math.min(n - 1, Math.floor(localX / groupW)));
            const d = data[i];
            if (!d) return;
            show(svgRef.current, e.clientX, e.clientY,
              <>
                <div style={{ fontWeight: 700, marginBottom: 4, color: T.subtext }}>{fmtDate(d.date)}</div>
                {series.map(sv => <div key={sv.key} style={{ color: mode === "colored" ? getColor(+d[sv.key]) : sv.color }}>{sv.name}: {fmtCrShort(+d[sv.key] || 0)}</div>)}
              </>
            );
          }}
        />
        <SvgTooltip tip={tip} T={T} svgWidth={W} />
      </svg>
      <div style={{ display: "flex", gap: 14, paddingLeft: PAD.left, flexWrap: "wrap", marginTop: 4 }}>
        {mode === "grouped" && series.map(s => (
          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: T.subtext }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color }} />{s.name}
          </div>
        ))}
        {mode === "colored" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: T.subtext }}><div style={{ width: 10, height: 10, borderRadius: 2, background: GREEN }} />Positive</div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: T.subtext }}><div style={{ width: 10, height: 10, borderRadius: 2, background: RED }} />Negative</div>
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// UI HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
const StatCard = memo(({ label, value, sub, color, T, badge }) => (
  <div style={{ background: T.isDark ? T.elevated || T.surface : T.card, borderRadius: T.radiusMd || 18, padding: "16px 18px", border: `1px solid ${T.border}`, boxShadow: T.shadowSoft, display: "flex", flexDirection: "column", gap: 6, position: "relative", overflow: "hidden" }}>
    <div style={{ position: "absolute", inset: 0, background: T.isDark ? "linear-gradient(180deg, rgba(255,255,255,0.045), transparent 28%)" : "linear-gradient(180deg, rgba(255,255,255,0.32), transparent 46%)", pointerEvents: "none" }} />
    {badge && (
      <div style={{ position: "absolute", top: 12, right: 12, background: badge === "BUY" ? GREEN + "18" : RED + "18", color: badge === "BUY" ? GREEN : RED, border: `1px solid ${badge === "BUY" ? GREEN + "28" : RED + "28"}`, borderRadius: 999, padding: "4px 8px", fontSize: 9, fontWeight: 800, letterSpacing: 1.1 }}>{badge}</div>
    )}
    <div style={{ position: "relative", fontSize: 11, color: T.subtext, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, opacity: T.isDark ? 0.88 : 1 }}>{label}</div>
    <div style={{ position: "relative", fontSize: 22, fontWeight: 800, color: color || T.text, fontFamily: T.fontMono || "monospace", letterSpacing: -0.8 }}>{value}</div>
    {sub && <div style={{ position: "relative", fontSize: 11, color: T.subtext, lineHeight: 1.5, opacity: T.isDark ? 0.92 : 1 }}>{sub}</div>}
  </div>
));

const ViewToggle = ({ options, value, onChange, T, dataSpanYears }) => (
  <div style={{ display: "flex", gap: 4, background: T.surface || T.bg, borderRadius: 999, padding: 4, border: `1px solid ${T.border}`, boxShadow: T.isDark ? "none" : "inset 0 1px 0 rgba(255,255,255,0.6)", flexShrink: 0 }}>
    {options.map(opt => {
      const rangeYears = RANGE_YEARS[opt] || null;
      const exceedsData = dataSpanYears != null && rangeYears != null && rangeYears > dataSpanYears;
      const isActive = value === opt;
      return (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          title={exceedsData ? `Only ~${dataSpanYears.toFixed(1)}Y of data available (from Apr 2022). Showing all available data.` : undefined}
          style={{
            padding: "7px 12px", fontSize: 11, fontWeight: 700, borderRadius: 999, border: "none",
            cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", position: "relative",
            background: isActive ? T.tabActiveBg || T.card : "transparent",
            color: isActive ? T.tabActiveText || T.text : T.subtext,
            boxShadow: isActive ? (T.isDark ? "inset 0 0 0 1px rgba(52, 211, 153, 0.12)" : "0 6px 18px rgba(15, 23, 42, 0.08)") : "none",
            transition: "all 0.15s",
            opacity: exceedsData && !isActive ? 0.65 : 1,
          }}
        >
          {opt}
          {exceedsData && (
            <span style={{
              marginLeft: 2, fontSize: 8, color: AMBER,
              fontWeight: 800, verticalAlign: "super", lineHeight: 1,
            }}>★</span>
          )}
        </button>
      );
    })}
  </div>
);

const CASH_TABLE_PAGE_SIZE = 25;

const TablePagination = ({ page, totalPages, onChange, T }) => {
  if (totalPages <= 1) return null;
  const pages = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) {
      pages.push(p);
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…");
    }
  }
  const btnStyle = (active, disabled) => ({
    minWidth: 28, height: 28, padding: "0 8px", borderRadius: 8,
    border: `1px solid ${T.border}`, fontFamily: "inherit",
    background: active ? (T.tabActiveBg || T.card) : "transparent",
    color: active ? (T.tabActiveText || T.text) : T.subtext,
    fontSize: 11, fontWeight: 700,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.4 : 1,
  });
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
      <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1} style={btnStyle(false, page === 1)}>‹ Prev</button>
      {pages.map((p, i) => (
        p === "…"
          ? <span key={`e${i}`} style={{ color: T.subtext, fontSize: 11, padding: "0 2px" }}>…</span>
          : <button key={p} onClick={() => onChange(p)} style={btnStyle(p === page, false)}>{p}</button>
      ))}
      <button onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page === totalPages} style={btnStyle(false, page === totalPages)}>Next ›</button>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
const FiiDiiModuleInner = ({ T: themeProp, isVisible = true }) => {
  const TABS = ["Overview", "Cash Flow", "Derivatives"];
  const T = useMemo(() => buildTheme(themeProp), [themeProp]);
  const initialCashCache = useMemo(() => cashCache.read(), []);
  const [activeTab,       setActiveTab]       = useState("Overview");
  const [cashData,        setCashData]        = useState(() => initialCashCache.data || []);
  const [derivData,       setDerivData]       = useState(() => derivCache.read().data || []);
  const [loading,         setLoading]         = useState(() => !initialCashCache.data);
  const [error,           setError]           = useState(null);
  const [isMobile,        setIsMobile]        = useState(() => window.innerWidth < 768);
  // (1) Overview chart: "Daily" | "20D Rolling" — default 20D Rolling
  const [flowView,        setFlowView]        = useState("20D Rolling");
  // Default chart range
  const [overviewRange,   setOverviewRange]   = useState("3Y");
  const [derivRange,      setDerivRange]      = useState("3Y");
  // Table frequency toggles
  const [cashFreq,        setCashFreq]        = useState("Daily");
  // Cash Flow table pagination — show latest CASH_TABLE_PAGE_SIZE rows per page
  const [cashPage,        setCashPage]        = useState(1);

  // Reset to page 1 whenever the frequency changes (row set changes underneath)
  useEffect(() => { setCashPage(1); }, [cashFreq]);

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById("fiidii-module-fonts")) return;
    // NOTE: IBM Plex Sans/Mono should already be loaded once, globally, by
    // the rest of the app's theme system (per the shared T/D token setup).
    // If that's confirmed, this effect and the <link> below can be deleted
    // entirely — this was previously loading "Manrope" as well, a font used
    // nowhere else in the app, meaning every cold visit to this tab paid for
    // an extra font family fetch that couldn't reuse anything the browser
    // had already cached from the rest of the site. Now it only requests
    // IBM Plex Sans/Mono, so if those are already on the page this is a
    // harmless no-op (browser dedupes the request); if not, it's at least
    // no longer double the font weight.
    const preconnect1 = document.createElement("link");
    preconnect1.rel = "preconnect"; preconnect1.href = "https://fonts.googleapis.com";
    const preconnect2 = document.createElement("link");
    preconnect2.rel = "preconnect"; preconnect2.href = "https://fonts.gstatic.com"; preconnect2.crossOrigin = "anonymous";
    document.head.appendChild(preconnect1);
    document.head.appendChild(preconnect2);
    const link = document.createElement("link");
    link.id = "fiidii-module-fonts";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600;700&family=IBM+Plex+Sans:wght@500;600;700;800&display=swap";
    document.head.appendChild(link);
  }, []);

  // ── Cash data (fii_dii_activity_mv) — loaded eagerly; drives Overview + Cash Flow ──
  // Fetches only what the currently-selected range needs (e.g. just 1Y on
  // first paint, not the full 5Y ceiling), and re-runs to top up whenever
  // overviewRange is widened — so switching to 3Y/5Y fetches just the extra
  // history it needs instead of everything up front.
  useEffect(() => {
    const years = RANGE_YEARS[overviewRange] || RANGE_YEARS["3Y"];
    const cached = cashCache.read();
    const cacheCoversRange = !!cached.data && cached.years >= years;
    if (cacheCoversRange) {
      setCashData(cached.data);
      setLoading(false);
    }

    let cancelled = false;
    (async () => {
      try {
        if (!cacheCoversRange) setLoading(true);
        const data = await fetchCashData(years, { preferCache: cacheCoversRange });
        if (cancelled) return;
        setCashData(data);
        setError(null);
      } catch (e) {
        if (!cancelled) {
          if (cached.data) {
            console.warn("[FIIDII] Cash refresh failed; keeping cached data.", e);
            setError(null);
          } else {
            setError(e.message);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [overviewRange]);

  // ── Derivatives data (fii_dii_fo_mv) — lazy: fetched the first time the tab opens ──
  // Same demand-driven pattern: only the selected derivRange is fetched, and
  // widening the range on this tab tops up rather than re-pulling everything.
  const derivLoadedYearsRef = useRef(0);
  useEffect(() => {
    if (activeTab !== "Derivatives") return;
    const years = RANGE_YEARS[derivRange] || RANGE_YEARS["3Y"];
    if (derivLoadedYearsRef.current >= years) return;
    const cached = derivCache.read();
    const cacheCoversRange = !!cached.data && cached.years >= years;
    if (cacheCoversRange) { setDerivData(cached.data); derivLoadedYearsRef.current = cached.years; }

    let cancelled = false;
    (async () => {
      try {
        const data = await fetchDerivData(years, { preferCache: cacheCoversRange || !!cached.data });
        if (!cancelled) { setDerivData(data); derivLoadedYearsRef.current = years; }
      } catch (e) {
        if (!cancelled) console.warn("[FIIDII] F&O data unavailable; loading cash flows only.", e);
      }
    })();

    return () => { cancelled = true; };
  }, [activeTab, derivRange]);

  // ── CASH MEMO ──────────────────────────────────────────────────────────────
  // fii5/dii5/fii20/dii20/z come straight off the mv's precomputed rolling
  // columns instead of re-slicing and re-summing the full history on every
  // recalculation.
  const cashMemo = useMemo(() => {
    if (!cashData.length) return {};
    const latest = cashData[cashData.length - 1];
    const fii1 = +latest.fii_net || 0, dii1 = +latest.dii_net || 0;
    const fii5  = +latest.fii_net_5d  || 0, dii5  = +latest.dii_net_5d  || 0;
    const fii20 = +latest.fii_net_20d || 0, dii20 = +latest.dii_net_20d || 0;

    // Full-history daily + rolling arrays (ASC order, date field preserved)
    const daily = cashData.map(d => ({
      date: d.date, label: fmtDateShort(d.date),
      fiiNet: +d.fii_net || 0, diiNet: +d.dii_net || 0,
    }));
    // fii_net_20d / dii_net_20d are already 20-day rolling sums from the mv —
    // no need for the O(n×20) slice+sum pass this used to do per row.
    const rolling = cashData.map(d => ({
      date: d.date, label: fmtDateShort(d.date),
      fiiRoll: +d.fii_net_20d || 0, diiRoll: +d.dii_net_20d || 0,
    }));

    const participation = (fii1 === 0 && dii1 === 0) ? 0.5 : Math.abs(fii1) / (Math.abs(fii1) + Math.abs(dii1));
    let absorption = "Mixed";
    if      (fii1 < 0 && dii1 > Math.abs(fii1))              absorption = "DII Absorbing FII";
    else if (fii1 > 0 && dii1 < 0 && Math.abs(dii1) > fii1) absorption = "FII Absorbing DII";
    else if (fii1 > 0 && dii1 > 0)                           absorption = "Both Buying";
    else if (fii1 < 0 && dii1 < 0)                           absorption = "Both Selling";

    const sellStreak = (() => {
      let s = 0;
      for (let i = cashData.length - 1; i >= 0; i--) { if (+cashData[i].fii_net < 0) s++; else break; }
      return s;
    })();

    return { latest, fii1, dii1, fii5, dii5, fii20, dii20, daily, rolling, participation, absorption, sellStreak, totalInst1: fii1 + dii1 };
  }, [cashData]);

  // ── DERIV MEMO ─────────────────────────────────────────────────────────────
  const derivMemo = useMemo(() => {
    if (!derivData.length) return {};
    const rows = derivData.map(d => ({
      label: fmtDateShort(d.date), fullDate: d.date,
      fiiLong: +d.fii_long||0, fiiShort: +d.fii_short||0, fiiNet: +d.fii_net||0,
      diiLong: +d.dii_long||0, diiShort: +d.dii_short||0, diiNet: +d.dii_net||0,
      // Futures-only for L/S ratio — options excluded (calls/puts distort directional signal)
      fiiFutLong: +d.fii_fut_long||0, fiiFutShort: +d.fii_fut_short||0,
    }));
    const latest = rows[rows.length - 1] || {}, prev = rows[rows.length - 2] || {};
    const lsRatio = latest.fiiFutShort ? (latest.fiiFutLong / latest.fiiFutShort).toFixed(2) : "—";
    const lsTrend = rows.map(r => ({
      date: r.fullDate, fullDate: r.fullDate, label: r.label,
      lsRatio: r.fiiFutShort ? +(r.fiiFutLong / r.fiiFutShort).toFixed(2) : 1,
      fiiNet: r.fiiNet, diiNet: r.diiNet,
    }));
    let buildUp = "Neutral";
    if      (latest.fiiFutLong  > prev.fiiFutLong  && latest.fiiFutShort <= prev.fiiFutShort) buildUp = "Long Build-up";
    else if (latest.fiiFutShort > prev.fiiFutShort && latest.fiiFutLong  <= prev.fiiFutLong)  buildUp = "Short Build-up";
    else if (latest.fiiFutLong  < prev.fiiFutLong  && latest.fiiFutShort <  prev.fiiFutShort) buildUp = "Unwinding";
    return { rows, latest, lsRatio, buildUp, lsTrend };
  }, [derivData]);

  const overviewTabData = useMemo(() => {
    const daily = cashMemo.daily || [];
    const rolling = cashMemo.rolling || [];
    const isRolling = flowView === "20D Rolling";
    const source = isRolling ? rolling : daily;
    const spanYears = dataYearSpan(source);
    const chartData = filterByRange(source, overviewRange);
    const chartSeries = isRolling
      ? [{ key: "fiiRoll", color: RED, name: "FII 20D Rolling" }, { key: "diiRoll", color: BLUE, name: "DII 20D Rolling" }]
      : [{ key: "fiiNet", color: GREEN, name: "FII Net" }, { key: "diiNet", color: BLUE, name: "DII Net" }];
    const selectedRangeYears = RANGE_YEARS[overviewRange] || null;
    const rangeExceedsData = selectedRangeYears != null && selectedRangeYears > spanYears;
    return { isRolling, spanYears, chartData, chartSeries, rangeExceedsData };
  }, [cashMemo.daily, cashMemo.rolling, flowView, overviewRange]);

  // Aggregation only — needed to know the full row/page count. Cheap: O(n) bucket
  // pass, no per-row derived stats yet.
  const cashFlowAggRows = useMemo(() => {
    const rawReverse = [...cashData].reverse();
    return aggregateCashRows(rawReverse, cashFreq);
  }, [cashData, cashFreq]);

  // Cash Flow table pagination — only slice+render CASH_TABLE_PAGE_SIZE rows at a time
  const cashPageCount = Math.max(1, Math.ceil(cashFlowAggRows.length / CASH_TABLE_PAGE_SIZE));
  const cashPageClamped = Math.min(Math.max(1, cashPage), cashPageCount);

  // Per-row derived stats (chg/abs/label) — only computed for the page
  // actually on screen, instead of every aggregated row up front.
  const cashFlowPageRows = useMemo(() => {
    const start = (cashPageClamped - 1) * CASH_TABLE_PAGE_SIZE;
    return cashFlowAggRows.slice(start, start + CASH_TABLE_PAGE_SIZE).map((row, localI) => {
      const i = start + localI;
      const fiiN = +row.fii_net || 0;
      const diiN = +row.dii_net || 0;
      const prev = cashFlowAggRows[i + 1];
      const prevFii = prev ? +prev.fii_net || 0 : null;
      const chg = prevFii ? ((fiiN - prevFii) / Math.abs(prevFii) * 100) : null;
      const abs = fiiN < 0 && diiN > Math.abs(fiiN) ? "Absorbed" : fiiN < 0 && diiN < 0 ? "Risk-Off" : fiiN > 0 && diiN > 0 ? "Both Buy" : "—";
      return {
        ...row,
        fiiN,
        diiN,
        chg,
        abs,
        label: fmtPeriodLabel(row.endDate || row.date, cashFreq),
      };
    });
  }, [cashFlowAggRows, cashPageClamped, cashFreq]);

  const derivativesTabData = useMemo(() => {
    const rows = derivMemo.rows || [];
    const lsTrend = derivMemo.lsTrend || [];
    const derivSpanYears = dataYearSpan(rows);
    const filteredRows = filterByRange(rows, derivRange);
    const filteredLsTrend = filterByRange(lsTrend, derivRange);
    const derivSelectedRangeYears = RANGE_YEARS[derivRange] || null;
    const derivRangeExceedsData = derivSelectedRangeYears != null && derivSelectedRangeYears > derivSpanYears;
    return { derivSpanYears, filteredRows, filteredLsTrend, derivRangeExceedsData };
  }, [derivMemo.rows, derivMemo.lsTrend, derivRange]);

  // ── SWIPE ──────────────────────────────────────────────────────────────────
  // card/sh memoized so hoisted tab components get stable style object refs
  const card = useMemo(() => ({
    background: T.isDark ? T.surface : T.card, borderRadius: T.radiusLg || 24,
    padding: isMobile ? 14 : 18, border: `1px solid ${T.border}`, boxShadow: T.shadow,
    // backdrop-filter blur removed — it was the single most expensive style
    // property on this page (GPU compositing cost stacked across every card).
  }), [T, isMobile]);
  const sh = useMemo(() => ({
    fontSize: isMobile ? 16 : 18, fontWeight: 800, color: T.text, marginBottom: 16, marginTop: 0, letterSpacing: -0.4,
  }), [T, isMobile]);
  const noData = useCallback((msg) => <div style={{ ...card, textAlign: "center", color: T.subtext, padding: 40, fontSize: 13 }}>{msg || "No data"}</div>, [card]);

  if (loading) return (
    <div style={{ padding: 60, textAlign: "center", color: T.subtext, fontFamily: T.fontSans }}>
      <div style={{ fontSize: 28 }}>📊</div>
      <div style={{ fontSize: 14, marginTop: 8 }}>Loading institutional flow data…</div>
    </div>
  );
  if (error) return <div style={{ padding: 40, textAlign: "center", color: RED, fontSize: 14, fontFamily: T.fontSans }}>Error: {error}</div>;

  return (
    <div style={{ width:"100%", minHeight:"100%", overflowY:"auto", boxSizing:"border-box", fontFamily:T.fontSans, color:T.text, background:T.bg, padding:isMobile ? "0" : "22px 28px 36px" }}>
      <div style={{ width:"100%", maxWidth:isMobile?"100%":1400, margin:"0 auto", minHeight:"100%", background:T.shellBg, border:isMobile?"none":`1px solid ${T.border}`, borderRadius:isMobile?0:(T.radiusLg + 6), boxShadow:T.shadow, position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", inset:0, background:T.shellOverlay, pointerEvents:"none" }} />

      {/* ── STICKY HEADER + TAB BAR ── */}
      <div style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: T.headerBg,
        borderBottom: `1px solid ${T.border}`,
        boxShadow: T.headerShadow,
      }}>
        {/* Title row */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12, padding:isMobile?"18px 14px 12px":"24px 28px 16px" }}>
          <div>
            <div style={{ fontSize:10, fontWeight:800, letterSpacing:1.6, textTransform:"uppercase", color:T.accent, marginBottom:6, opacity:T.isDark ? 0.9 : 1 }}>Institutional Flow Dashboard</div>
            <h1 style={{ fontSize:isMobile?22:30, fontWeight:800, color:T.text, margin:0, letterSpacing:-1 }}>FII · DII Analytics</h1>
            <p style={{ fontSize:isMobile?12:13, color:T.subtext, margin:"6px 0 0", lineHeight:1.6, maxWidth:900 }}>
              Institutional flow intelligence for cash, derivatives, and regime tracking as of {fmtDate(cashData[cashData.length-1]?.date)}.
            </p>
          </div>
        </div>

        {/* Tab row */}
        <div style={{ display:"flex", overflowX:"auto", scrollbarWidth:"none", padding:isMobile?"0 14px 14px":"0 28px 18px", gap:8 }}>
            {TABS.map(t => (
              <button key={t} onClick={() => startTransition(() => setActiveTab(t))} style={{
              padding:isMobile?"10px 14px":"11px 18px", fontSize:isMobile?11:12, fontWeight:700,
              border:`1px solid ${activeTab===t ? T.accentMuted : "transparent"}`, background:activeTab===t?T.tabActiveBg:"transparent", color:activeTab===t?(T.tabActiveText || T.text):T.subtext,
              borderRadius:999,
              cursor:"pointer", transition:"all 0.15s", fontFamily:"inherit", whiteSpace:"nowrap", flexShrink:0, letterSpacing:0.2, boxShadow: activeTab===t && T.isDark ? "inset 0 0 0 1px rgba(52, 211, 153, 0.08)" : "none",
            }}>{t}</button>
          ))}
        </div>
      </div>

      {/* Tab content — only the ACTIVE tab is rendered/mounted now. Previously
          all three tabs (tabContent = {...}) were built as JSX every render
          regardless of which was visible; this now conditionally renders just
          one, and each tab is a hoisted, memoized top-level component instead
          of an inline closure redefined on every render (which used to force
          a full unmount/remount of the whole tab subtree on any state change). */}
      <div style={{ padding:isMobile?"16px 14px 28px":"22px 28px 36px", position:"relative" }}>
        {activeTab === "Overview" && (
          <OverviewTab
            cashMemo={cashMemo} overviewTabData={overviewTabData}
            isMobile={isMobile} T={T} card={card} sh={sh}
            flowView={flowView} setFlowView={setFlowView}
            overviewRange={overviewRange} setOverviewRange={setOverviewRange}
          />
        )}
        {activeTab === "Cash Flow" && (
          <CashFlowTab
            cashMemo={cashMemo} cashFlowAggRows={cashFlowAggRows} cashFlowPageRows={cashFlowPageRows}
            cashPageClamped={cashPageClamped} cashPageCount={cashPageCount} setCashPage={setCashPage}
            cashFreq={cashFreq} setCashFreq={setCashFreq}
            isMobile={isMobile} T={T} card={card} sh={sh}
          />
        )}
        {activeTab === "Derivatives" && (
          <DerivativesTab
            derivMemo={derivMemo} derivativesTabData={derivativesTabData}
            isMobile={isMobile} T={T} card={card} sh={sh} noData={noData}
            derivRange={derivRange} setDerivRange={setDerivRange}
          />
        )}
      </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TABS — hoisted to module scope (top-level `const`s, not inline closures inside
// FiiDiiModuleInner) and memoized. Inline definitions were being recreated as a
// brand-new component type on every render, which forces React to unmount and
// remount the entire tab's DOM tree instead of diffing it — the single biggest
// contributor to this page feeling heavy. Each tab only re-renders when its own
// props actually change now.
// ═══════════════════════════════════════════════════════════════════════════════

const OverviewTab = memo(function OverviewTab({ cashMemo, overviewTabData, isMobile, T, card, sh, flowView, setFlowView, overviewRange, setOverviewRange }) {
  const { fii1, dii1, fii5, dii5, fii20, dii20, participation, absorption, latest, totalInst1 } = cashMemo;
  const { isRolling, spanYears, chartData, chartSeries, rangeExceedsData } = overviewTabData;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={sh}>Flow Summary <span style={{ fontSize: 12, color: T.subtext, fontWeight: 400 }}>as of {fmtDate(latest?.date)}</span></h2>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(6, 1fr)", gap: 10 }}>
          <StatCard label="FII 1D"  value={fmtCrShort(fii1)}  color={getColor(fii1)}  badge={fii1 > 0 ? "BUY" : fii1 < 0 ? "SELL" : null} T={T} />
          <StatCard label="FII 5D"  value={fmtCrShort(fii5)}  color={getColor(fii5)}  T={T} />
          <StatCard label="FII 20D" value={fmtCrShort(fii20)} color={getColor(fii20)} T={T} />
          <StatCard label="DII 1D"  value={fmtCrShort(dii1)}  color={getColor(dii1)}  badge={dii1 > 0 ? "BUY" : dii1 < 0 ? "SELL" : null} T={T} />
          <StatCard label="DII 5D"  value={fmtCrShort(dii5)}  color={getColor(dii5)}  T={T} />
          <StatCard label="DII 20D" value={fmtCrShort(dii20)} color={getColor(dii20)} T={T} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr)", gap: 10 }}>
        <StatCard label="Total Inst. 1D"    value={fmtCrShort(totalInst1)} color={getColor(totalInst1)} T={T} />
        <StatCard label="FII Participation" value={`${(participation * 100).toFixed(0)}%`} color={BLUE} sub="of institutional volume" T={T} />
        <StatCard label="Absorption"        value={absorption} color={absorption.includes("Both Sell") ? RED : absorption.includes("Both Buy") ? GREEN : BLUE} T={T} />
      </div>

      <div style={card}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          <div>
            <h3 style={{ ...sh, margin: 0 }}>Institutional Flow Chart</h3>
            <div style={{ fontSize: 12, color: T.subtext, marginTop: 2 }}>
              {isRolling ? "20-day rolling sum — trend momentum" : "Daily net flows by session"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <ViewToggle options={["Daily", "20D Rolling"]} value={flowView} onChange={setFlowView} T={T} />
            <ViewToggle options={["1Y", "3Y", "5Y"]} value={overviewRange} onChange={setOverviewRange} T={T} dataSpanYears={spanYears} />
          </div>
        </div>
        {isRolling
          ? <SvgLineChart data={chartData} series={chartSeries} height={isMobile ? 220 : 320} fill={true} T={T} />
          : <SvgBarChart  data={chartData} series={chartSeries} height={isMobile ? 220 : 320} mode="grouped" T={T} />
        }
        {rangeExceedsData && (
          <div style={{ fontSize: 11, color: AMBER, marginTop: 8, display: "flex", alignItems: "center", gap: 5 }}>
            <span>★</span>
            <span>Data available from 8 Apr 2022 — showing all {chartData.length} sessions ({spanYears.toFixed(1)} years).</span>
          </div>
        )}
      </div>
    </div>
  );
});

const CashFlowTab = memo(function CashFlowTab({ cashMemo, cashFlowAggRows, cashFlowPageRows, cashPageClamped, cashPageCount, setCashPage, cashFreq, setCashFreq, isMobile, T, card, sh }) {
  const { fii5, dii5, fii20, dii20, sellStreak } = cashMemo;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {sellStreak >= 3 && (
        <div style={{ ...card, borderLeft: `4px solid ${RED}`, background: RED + "0a" }}>
          <div style={{ fontSize: 11, color: T.subtext, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>⚠️ Alert</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: RED }}>FII selling for {sellStreak} consecutive sessions — Highest recent streak</div>
        </div>
      )}

      <div>
        <h2 style={sh}>Rolling Flow Metrics</h2>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10 }}>
          <StatCard label="FII Rolling 5D"  value={fmtCrShort(fii5)}  color={getColor(fii5)}  T={T} />
          <StatCard label="FII Rolling 20D" value={fmtCrShort(fii20)} color={getColor(fii20)} T={T} />
          <StatCard label="DII Rolling 5D"  value={fmtCrShort(dii5)}  color={getColor(dii5)}  T={T} />
          <StatCard label="DII Rolling 20D" value={fmtCrShort(dii20)} color={getColor(dii20)} T={T} />
        </div>
      </div>

      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
          <h3 style={{ ...sh, margin: 0 }}>Cash Flow Data</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: T.subtext }}>
              Showing {cashFlowAggRows.length === 0 ? 0 : (cashPageClamped - 1) * CASH_TABLE_PAGE_SIZE + 1}
              –{Math.min(cashPageClamped * CASH_TABLE_PAGE_SIZE, cashFlowAggRows.length)} of {cashFlowAggRows.length}
            </span>
            <ViewToggle options={["Daily", "Weekly", "Monthly", "Annual"]} value={cashFreq} onChange={setCashFreq} T={T} />
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: T.surface || T.bg }}>
                {["Period", "FII Buy", "FII Sell", "FII Net", "DII Buy", "DII Sell", "DII Net", "Status"].map((h, i) => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: i===0 ? "left":"right", fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: T.subtext, borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cashFlowPageRows.map((row, i) => {
                const { fiiN, diiN, chg, abs, label } = row;
                const absC = abs==="Absorbed" ? GREEN : abs==="Risk-Off" ? RED : abs==="Both Buy" ? BLUE : T.subtext;
                const rowBg = i%2===0 ? T.card : (T.surface||T.bg);
                return (
                  <tr key={i} style={{ background: rowBg }}>
                    <td style={{ padding: "8px 10px", color: T.text, borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>
                      {label}
                    </td>
                    {[row.fii_buy, row.fii_sell, fiiN, row.dii_buy, row.dii_sell, diiN].map((v, j) => (
                      <td key={j} style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace", fontWeight: [2,5].includes(j)?700:400, color: [2,5].includes(j)?getColor(v):T.subtext, borderBottom: `1px solid ${T.border}` }}>
                        {fmtCrShort(v)}
                        {j===2 && chg!==null && <span style={{ fontSize:9, marginLeft:4, color:chg>=0?GREEN:RED }}>{chg>=0?"▲":"▼"}{Math.abs(chg).toFixed(0)}%</span>}
                      </td>
                    ))}
                    <td style={{ padding: "8px 10px", textAlign: "right", borderBottom: `1px solid ${T.border}`, fontSize: 11, fontWeight: 600, color: absC }}>{abs}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <TablePagination page={cashPageClamped} totalPages={cashPageCount} onChange={setCashPage} T={T} />
      </div>
    </div>
  );
});

const DerivativesTab = memo(function DerivativesTab({ derivMemo, derivativesTabData, isMobile, T, card, sh, noData, derivRange, setDerivRange }) {
  if (!derivMemo.rows?.length) return noData("No F&O data available. Check fii_dii_fo_mv table format.");
  const { latest, lsRatio, buildUp } = derivMemo;
  const { derivSpanYears, filteredRows, filteredLsTrend, derivRangeExceedsData } = derivativesTabData;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10 }}>
        <StatCard label="FII Net Position" value={latest.fiiNet ? (latest.fiiNet>0?"+":"")+latest.fiiNet.toLocaleString("en-IN"):"—"} color={getColor(latest.fiiNet)} T={T} />
        <StatCard label="FII L/S Ratio"    value={lsRatio} color={parseFloat(lsRatio)>1?GREEN:RED} sub={parseFloat(lsRatio)>1?"Net Long":"Net Short"} T={T} />
        <StatCard label="DII Net Position" value={latest.diiNet ? (latest.diiNet>0?"+":"")+latest.diiNet.toLocaleString("en-IN"):"—"} color={getColor(latest.diiNet)} T={T} />
        <StatCard label="Build-up"         value={buildUp} color={buildUp==="Long Build-up"?GREEN:buildUp==="Short Build-up"?RED:AMBER} T={T} />
      </div>

      <div style={card}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          <div>
            <h3 style={{ ...sh, margin: 0 }}>FII Long vs Short</h3>
            <div style={{ fontSize: 12, color: T.subtext, marginTop: 2 }}>Index futures only</div>
          </div>
          <ViewToggle options={["1Y", "3Y", "5Y"]} value={derivRange} onChange={setDerivRange} T={T} dataSpanYears={derivSpanYears} />
        </div>
        <SvgLineChart data={filteredRows} series={[{ key:"fiiFutLong", color:GREEN, name:"FII Long" }, { key:"fiiFutShort", color:RED, name:"FII Short" }]} height={isMobile?220:300} fill={false} T={T} />
        {derivRangeExceedsData && (
          <div style={{ fontSize: 11, color: AMBER, marginTop: 8, display: "flex", alignItems: "center", gap: 5 }}>
            <span>★</span>
            <span>Data available from 8 Apr 2022 — showing all {filteredRows.length} sessions ({derivSpanYears.toFixed(1)} years).</span>
          </div>
        )}
      </div>

      <div style={card}>
        <h3 style={{ ...sh, marginBottom: 4 }}>FII Long/Short Ratio Trend</h3>
        <div style={{ fontSize: 12, color: T.subtext, marginBottom: 12 }}>Index futures only · Ratio &gt; 1 = net long (bullish), &lt; 1 = net short (bearish)</div>
        <SvgLineChart data={filteredLsTrend} series={[{ key:"lsRatio", color:PURPLE, name:"FII L/S Ratio" }]} height={isMobile?180:240} fill={true} T={T} />
      </div>
    </div>
  );
});

// Export memoized component to prevent unnecessary re-renders when parent updates
export default memo(FiiDiiModuleInner);
