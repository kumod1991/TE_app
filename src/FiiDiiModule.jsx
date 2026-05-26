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
async function sbFetchAll(table, params = {}) {
  const allRows = [];
  let offset = 0;
  while (true) {
    // Build query from params object — never risk regex-mangling a string
    const qs = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
    const url = `${SUPABASE_URL}/rest/v1/${table}?${qs}`;
    const r = await fetch(url, {
      headers: {
        ...SB_H,
        "Cache-Control": "no-cache",
        // Range header: ask for rows offset→offset+PAGE_SIZE-1
        "Range": `${offset}-${offset + PAGE_SIZE - 1}`,
        "Range-Unit": "items",
        "Prefer": "count=none",
      },
    });
    // 206 = partial, 200 = full (fits in one page), 416 = range beyond end
    if (r.status === 416 || r.status === 204) break;
    if (!r.ok) throw new Error(`${table} HTTP ${r.status}`);
    const page = await r.json();
    if (!Array.isArray(page) || page.length === 0) break;
    allRows.push(...page);
    if (page.length < PAGE_SIZE) break; // last page — no more rows
    offset += PAGE_SIZE;
  }
  return allRows;
}

const MODULE_CACHE_KEY = "fiidii-module-cache-v1";
const MODULE_CACHE_TTL_MS = 15 * 60 * 1000;
let fiidiiMemoryCache = null;
let fiidiiMemoryCacheTs = 0;
let fiidiiInflightPromise = null;

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

// ─── MATH ─────────────────────────────────────────────────────────────────────
const sum  = (arr) => arr.reduce((a, b) => a + b, 0);
const mean = (arr) => arr.length ? sum(arr) / arr.length : 0;
const std  = (arr) => {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length || 1));
};
const zScore = (v, arr) => { const s = std(arr); return s === 0 ? 0 : (v - mean(arr)) / s; };

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
  fontSans: '"Manrope", "Segoe UI", sans-serif',
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
function filterByRange(data, range) {
  if (!data.length) return data;
  if (range === "All") return data;
  const getDateStr = (d) => d.date || d.fullDate;
  const latest = new Date(getDateStr(data[data.length - 1]));
  const cutoff = new Date(latest);
  if (range === "1Y")  cutoff.setFullYear(latest.getFullYear() - 1);
  if (range === "3Y")  cutoff.setFullYear(latest.getFullYear() - 3);
  if (range === "5Y")  cutoff.setFullYear(latest.getFullYear() - 5);
  if (range === "10Y") cutoff.setFullYear(latest.getFullYear() - 10);
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

function readModuleCache() {
  const now = Date.now();
  if (fiidiiMemoryCache && now - fiidiiMemoryCacheTs < MODULE_CACHE_TTL_MS) {
    return { data: fiidiiMemoryCache, stale: false };
  }
  if (typeof window === "undefined") return { data: fiidiiMemoryCache, stale: true };
  try {
    const raw = window.localStorage.getItem(MODULE_CACHE_KEY);
    if (!raw) return { data: null, stale: true };
    const parsed = JSON.parse(raw);
    if (!parsed?.data) return { data: null, stale: true };
    fiidiiMemoryCache = parsed.data;
    fiidiiMemoryCacheTs = parsed.ts || 0;
    return { data: parsed.data, stale: now - (parsed.ts || 0) >= MODULE_CACHE_TTL_MS };
  } catch {
    return { data: null, stale: true };
  }
}

function writeModuleCache(data) {
  const payload = { data, ts: Date.now() };
  fiidiiMemoryCache = data;
  fiidiiMemoryCacheTs = payload.ts;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MODULE_CACHE_KEY, JSON.stringify(payload));
  } catch {}
}

function latestCashDate(data) {
  return data?.cashData?.[data.cashData.length - 1]?.date || null;
}

async function fetchLatestCashDate() {
  const rows = await sbFetchAll("fii_dii_activity", {
    select: "date",
    order: "date.desc",
    limit: 1,
  });
  return rows?.[0]?.date || null;
}

async function fetchModuleData() {
  const cached = readModuleCache();
  if (cached.data && !cached.stale) {
    const remoteLatest = await fetchLatestCashDate().catch(() => null);
    if (!remoteLatest || remoteLatest <= latestCashDate(cached.data)) return cached.data;
  }
  if (fiidiiInflightPromise) return fiidiiInflightPromise;
  fiidiiInflightPromise = (async () => {
    const [cashResult, derivResult, sectorResult] = await Promise.allSettled([
      sbFetchAll("fii_dii_activity", { select: "*", order: "date.asc" }),
      sbFetchAll("fii_dii_fo",       { select: "*", order: "date.asc" }),
      sbFetchAll("fii_sector_flows", { select: "*", order: "date.desc" }),
    ]);
    if (cashResult.status !== "fulfilled") throw cashResult.reason;
    if (derivResult.status === "rejected") console.warn("[FIIDII] F&O data unavailable; loading cash flows only.", derivResult.reason);
    if (sectorResult.status === "rejected") console.warn("[FIIDII] Sector flow data unavailable; loading without sector tab data.", sectorResult.reason);
    const cash = cashResult.value || [];
    const derivRaw = derivResult.status === "fulfilled" ? derivResult.value || [] : [];
    const sector = sectorResult.status === "fulfilled" ? sectorResult.value || [] : [];
    const data = {
      cashData: [...cash].sort((a, b) => new Date(a.date) - new Date(b.date)),
      derivData: pivotDerivData(derivRaw),
      sectorData: sector,
    };
    writeModuleCache(data);
    return data;
  })().finally(() => { fiidiiInflightPromise = null; });
  return fiidiiInflightPromise;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PURE SVG CHARTS
// ═══════════════════════════════════════════════════════════════════════════════
export function prefetchFiiDiiData() {
  const cached = readModuleCache();
  if (cached.data && !cached.stale) return Promise.resolve(cached.data);
  return fetchModuleData().catch(() => null);
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

        {/* Hover hit areas */}
        {visible.map((d, i) => (
          <rect key={i}
            x={px(i) - cW / visible.length / 2} y={PAD.top}
            width={cW / visible.length} height={cH}
            fill="transparent"
            onMouseEnter={e => show(svgRef.current, e.clientX, e.clientY,
              <>
                <div style={{ fontWeight: 700, marginBottom: 4, color: T.subtext }}>{fmtDate(getPointDate(d))}</div>
                {series.map(s => <div key={s.key} style={{ color: s.color }}>{s.name}: {fmtCrShort(+d[s.key] || 0)}</div>)}
              </>
            )}
          />
        ))}
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
                return (
                  <rect key={si} x={bx} y={by} width={barW} height={bh} fill={clr} opacity={0.88} rx={2}
                    onMouseEnter={e => show(svgRef.current, e.clientX, e.clientY,
                      <>
                        <div style={{ fontWeight: 700, marginBottom: 4, color: T.subtext }}>{fmtDate(d.date)}</div>
                        {series.map(sv => <div key={sv.key} style={{ color: mode === "colored" ? getColor(+d[sv.key]) : sv.color }}>{sv.name}: {fmtCrShort(+d[sv.key] || 0)}</div>)}
                      </>
                    )}
                  />
                );
              })}
              {i % every === 0 && (
                <text x={gx + groupW / 2} y={height - 4} textAnchor="middle" fontSize={9} fill={T.subtext}>{d.label}</text>
              )}
            </g>
          );
        })}
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
const StatCard = ({ label, value, sub, color, T, badge }) => (
  <div style={{ background: T.isDark ? T.elevated || T.surface : T.card, borderRadius: T.radiusMd || 18, padding: "16px 18px", border: `1px solid ${T.border}`, boxShadow: T.shadowSoft, display: "flex", flexDirection: "column", gap: 6, position: "relative", overflow: "hidden", backdropFilter: "blur(14px)" }}>
    <div style={{ position: "absolute", inset: 0, background: T.isDark ? "linear-gradient(180deg, rgba(255,255,255,0.045), transparent 28%)" : "linear-gradient(180deg, rgba(255,255,255,0.32), transparent 46%)", pointerEvents: "none" }} />
    {badge && (
      <div style={{ position: "absolute", top: 12, right: 12, background: badge === "BUY" ? GREEN + "18" : RED + "18", color: badge === "BUY" ? GREEN : RED, border: `1px solid ${badge === "BUY" ? GREEN + "28" : RED + "28"}`, borderRadius: 999, padding: "4px 8px", fontSize: 9, fontWeight: 800, letterSpacing: 1.1 }}>{badge}</div>
    )}
    <div style={{ position: "relative", fontSize: 11, color: T.subtext, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, opacity: T.isDark ? 0.88 : 1 }}>{label}</div>
    <div style={{ position: "relative", fontSize: 22, fontWeight: 800, color: color || T.text, fontFamily: T.fontMono || "monospace", letterSpacing: -0.8 }}>{value}</div>
    {sub && <div style={{ position: "relative", fontSize: 11, color: T.subtext, lineHeight: 1.5, opacity: T.isDark ? 0.92 : 1 }}>{sub}</div>}
  </div>
);

const SignalPill = ({ signal, T }) => {
  const cfg = {
    "Bullish Regime":     { bg: GREEN + "22", color: GREEN, icon: "🟢" },
    "Bearish Regime":     { bg: RED   + "22", color: RED,   icon: "🔴" },
    "Sideways / Neutral": { bg: AMBER + "22", color: AMBER, icon: "🟡" },
    "DII Absorbing":      { bg: BLUE  + "22", color: BLUE,  icon: "🔵" },
    "Risk-Off":           { bg: RED   + "22", color: RED,   icon: "🔴" },
  }[signal] || { bg: "#6b728022", color: "#6b7280", icon: "⚪" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}22`, borderRadius: 999, padding: "7px 14px", fontSize: 12, fontWeight: 800, letterSpacing: 0.2, boxShadow: T?.isDark ? "none" : "inset 0 1px 0 rgba(255,255,255,0.3)" }}>
      {cfg.icon} {signal}
    </span>
  );
};

const ViewToggle = ({ options, value, onChange, T, dataSpanYears }) => (
  <div style={{ display: "flex", gap: 4, background: T.surface || T.bg, borderRadius: 999, padding: 4, border: `1px solid ${T.border}`, boxShadow: T.isDark ? "none" : "inset 0 1px 0 rgba(255,255,255,0.6)", flexShrink: 0 }}>
    {options.map(opt => {
      const rangeYears = opt === "1Y" ? 1 : opt === "3Y" ? 3 : opt === "5Y" ? 5 : opt === "10Y" ? 10 : null;
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

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
const FiiDiiModuleInner = ({ T: themeProp, isVisible = true }) => {
  const TABS = ["Overview", "Cash Flow", "Derivatives", "Sector Rotation", "Signals"];
  const T = useMemo(() => buildTheme(themeProp), [themeProp]);
  const initialCache = useMemo(() => readModuleCache(), []);
  const [activeTab,       setActiveTab]       = useState("Overview");
  const [cashData,        setCashData]        = useState(() => initialCache.data?.cashData || []);
  const [derivData,       setDerivData]       = useState(() => initialCache.data?.derivData || []);
  const [sectorData,      setSectorData]      = useState(() => initialCache.data?.sectorData || []);
  const [loading,         setLoading]         = useState(() => !initialCache.data);
  const [error,           setError]           = useState(null);
  const [isMobile,        setIsMobile]        = useState(() => window.innerWidth < 768);
  const [selectedSector,  setSelectedSector]  = useState("__ALL__");
  const [fullscreen,      setFullscreen]      = useState(false);
  const [selectedSectors, setSelectedSectors] = useState([]);
  // (1) Overview chart: "Daily" | "20D Rolling" — default 20D Rolling
  const [flowView,        setFlowView]        = useState("20D Rolling");
  // Default chart range
  const [overviewRange,   setOverviewRange]   = useState("3Y");
  const [derivRange,      setDerivRange]      = useState("3Y");
  // Table frequency toggles
  const [cashFreq,        setCashFreq]        = useState("Daily");

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById("fiidii-module-fonts")) return;
    const link = document.createElement("link");
    link.id = "fiidii-module-fonts";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600;700&family=Manrope:wght@500;600;700;800&display=swap";
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    const cached = initialCache;
    if (cached.data) {
      setCashData(cached.data.cashData || []);
      setDerivData(cached.data.derivData || []);
      setSectorData(cached.data.sectorData || []);
      setLoading(false);
    }

    let cancelled = false;
    (async () => {
      try {
        if (!cached.data) setLoading(true);
        const data = await fetchModuleData();
        if (cancelled) return;
        setCashData(data.cashData || []);
        setDerivData(data.derivData || []);
        setSectorData(data.sectorData || []);
        setError(null);
      } catch (e) {
        if (!cancelled) {
          if (cached.data) {
            console.warn("[FIIDII] Refresh failed; keeping cached module data.", e);
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
  }, [initialCache]);

  // ── CASH MEMO ──────────────────────────────────────────────────────────────
  const cashMemo = useMemo(() => {
    if (!cashData.length) return {};
    const latest = cashData[cashData.length - 1];
    const last   = (n) => cashData.slice(-n);
    const S      = (arr, k) => sum(arr.map(d => +d[k] || 0));
    const fii1 = +latest.fii_net || 0, dii1 = +latest.dii_net || 0;
    const fii5  = S(last(5),  "fii_net"), dii5  = S(last(5),  "dii_net");
    const fii20 = S(last(20), "fii_net"), dii20 = S(last(20), "dii_net");
    const z     = zScore(fii1, last(20).map(d => +d.fii_net || 0));

    // Full-history daily + rolling arrays (ASC order, date field preserved)
    const daily = cashData.map(d => ({
      date: d.date, label: fmtDateShort(d.date),
      fiiNet: +d.fii_net || 0, diiNet: +d.dii_net || 0,
    }));
    const rolling = cashData.map((d, i) => {
      const slice = cashData.slice(Math.max(0, i - 19), i + 1);
      return { date: d.date, label: fmtDateShort(d.date), fiiRoll: S(slice, "fii_net"), diiRoll: S(slice, "dii_net") };
    });

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

    return { latest, fii1, dii1, fii5, dii5, fii20, dii20, z, daily, rolling, participation, absorption, sellStreak, totalInst1: fii1 + dii1 };
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

  // ── SECTOR MEMO ────────────────────────────────────────────────────────────
  const sectorMemo = useMemo(() => {
    if (!sectorData.length) return {};
    const allSectors = [...new Set(sectorData.map(d => d.sector))].sort();
    const latestDate = sectorData[0]?.date;
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 60);
    const parseNI = (d) => d.net_investment != null
      ? parseFloat(String(d.net_investment).replace(/,/g, "")) || 0 : 0;

    const ranking = allSectors.map(sector => {
      const rows = sectorData.filter(d => d.sector === sector);
      const total    = sum(rows.filter(d => new Date(d.date) >= cutoff).map(d => parseNI(d)));
      const momentum = sum(rows.slice(0, 3).map(d => parseNI(d)));
      return { sector, total, momentum };
    }).sort((a, b) => b.total - a.total);

    const sectorHistory = selectedSector === "__ALL__" ? [] :
      sectorData.filter(d => d.sector === selectedSector)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .map(d => {
          // FIX: Robust parsing — strip commas, handle string "1,560" → 1560
          const raw = d.net_investment;
          const val = raw != null ? parseFloat(String(raw).replace(/,/g, "")) || 0 : 0;
          return { date: d.date, label: fmtDateShort(d.date), value: val };
        });

    const multiSectorData = (() => {
      if (!selectedSectors.length) return [];
      // FIX: Normalise all dates to YYYY-MM-DD strings once for O(1) lookup
      const normDate = (d) => {
        if (!d) return "";
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
        return new Date(d).toISOString().slice(0, 10);
      };
      // Build a fast lookup map: "YYYY-MM-DD|SectorName" → parsed value
      const lookup = new Map();
      sectorData.forEach(d => {
        const key = `${normDate(d.date)}|${(d.sector || "").trim().toLowerCase()}`;
        // FIX: strip commas from values like "1,560"
        const val = d.net_investment != null
          ? parseFloat(String(d.net_investment).replace(/,/g, "")) || 0
          : 0;
        lookup.set(key, val);
      });
      const dateSet = [...new Set(sectorData.map(d => normDate(d.date)))].sort();
      return dateSet.map(date => {
        const row = { label: fmtDateShort(date), date };
        selectedSectors.forEach(sec => {
          const key = `${date}|${sec.trim().toLowerCase()}`;
          row[sec] = lookup.get(key) ?? 0;
        });
        return row;
      });
    })();

    const latestSnapshot = sectorData
      .filter(d => d.date === latestDate)
      .map(d => ({
        ...d,
        // FIX: parse robustly here too
        net_investment: d.net_investment != null
          ? parseFloat(String(d.net_investment).replace(/,/g, "")) || 0
          : 0,
      }))
      .sort((a, b) => Math.abs(+b.net_investment||0) - Math.abs(+a.net_investment||0));

    return { allSectors, latestDate, ranking, leaders: ranking.slice(0, 3), laggards: ranking.slice(-3).reverse(), sectorHistory, latestSnapshot, multiSectorData };
  }, [sectorData, selectedSector, selectedSectors]);

  // ── SIGNALS MEMO ───────────────────────────────────────────────────────────
  const signals = useMemo(() => {
    if (cashMemo.fii20 == null) return {};
    const { fii20=0, dii20=0, z=0, absorption="", sellStreak=0 } = cashMemo;
    const { lsRatio="1", buildUp="" } = derivMemo;
    const lr = parseFloat(lsRatio) || 1;
    const { latestSnapshot=[], leaders=[] } = sectorMemo;
    let regime = "Sideways / Neutral";
    if      (fii20 > 0 && lr > 1)                      regime = "Bullish Regime";
    else if (fii20 < 0 && buildUp === "Short Build-up") regime = "Bearish Regime";
    else if (fii20 < 0 && dii20 > Math.abs(fii20))     regime = "DII Absorbing";
    else if (fii20 < 0 && dii20 < 0)                   regime = "Risk-Off";
    const insights = [];
    if (sellStreak >= 5) insights.push({ type:"alert",   icon:"🚨", text:`FII selling for ${sellStreak} consecutive sessions — Highest in recent period.` });
    if (z > 2)   insights.push({ type:"alert",   icon:"🚨", text:"Extreme FII buying — Z-score >2. Historically precedes strong rallies." });
    if (z < -2)  insights.push({ type:"alert",   icon:"⚠️", text:"Extreme FII selling — Z-score <-2. Panic selling detected." });
    if (absorption === "DII Absorbing FII") insights.push({ type:"bullish", icon:"🛡️", text:"DII absorbing FII selling. Domestic support intact — Bullish." });
    if (absorption === "Both Buying")       insights.push({ type:"bullish", icon:"🚀", text:"Both FII & DII buying together — Strong institutional conviction." });
    if (absorption === "Both Selling")      insights.push({ type:"bearish", icon:"🔻", text:"Both institutions selling simultaneously — Rare risk-off event." });
    if (lr > 1.5) insights.push({ type:"bullish", icon:"📈", text:`FII L/S ${lr.toFixed(2)}x — heavily net-long in F&O. Bullish positioning.` });
    if (lr < 0.7) insights.push({ type:"bearish", icon:"📉", text:`FII L/S ${lr.toFixed(2)}x — net-short in F&O. Bearish positioning.` });
    if (leaders.length) insights.push({ type:"info", icon:"🏆", text:`Top rotation: ${leaders.map(l => l.sector).join(", ")} (60D inflows).` });
    const buying  = latestSnapshot.filter(s => +s.net_investment > 0).length;
    const breadth = latestSnapshot.length ? Math.round(buying / latestSnapshot.length * 100) : 0;
    if (breadth > 70) insights.push({ type:"bullish", icon:"🌐", text:`Broad buying: ${breadth}% of sectors seeing inflows.` });
    if (breadth < 30) insights.push({ type:"bearish", icon:"🌐", text:`Narrow market: only ${breadth}% sectors with inflows.` });
    const exportText = [`📊 FII-DII Signal: ${regime}`, ``, `FII 20D: ${fmtCrShort(fii20)} | DII 20D: ${fmtCrShort(dii20)}`, `FII L/S: ${lr.toFixed(2)}x | Z-Score: ${z.toFixed(2)}`, ...insights.map(i => i.text), ``, `#FII #DII #NSE #Markets`].join("\n");
    return { regime, insights, exportText, lsRatio: lr, z, breadth };
  }, [cashMemo, derivMemo, sectorMemo]);

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
    const selectedRangeYears = overviewRange === "1Y" ? 1 : overviewRange === "3Y" ? 3 : overviewRange === "5Y" ? 5 : overviewRange === "10Y" ? 10 : null;
    const rangeExceedsData = selectedRangeYears != null && selectedRangeYears > spanYears;
    return { isRolling, spanYears, chartData, chartSeries, rangeExceedsData };
  }, [cashMemo.daily, cashMemo.rolling, flowView, overviewRange]);

  const cashFlowTableRows = useMemo(() => {
    const rawReverse = [...cashData].reverse();
    const aggRows = aggregateCashRows(rawReverse, cashFreq);
    const allFii = cashData.map(d => +d.fii_net || 0);
    const avgFii = allFii.length ? mean(allFii) : 0;
    const stdFii = allFii.length ? std(allFii) : 0;

    return aggRows.map((row, i) => {
      const fiiN = +row.fii_net || 0;
      const diiN = +row.dii_net || 0;
      const prev = aggRows[i + 1];
      const prevFii = prev ? +prev.fii_net || 0 : null;
      const chg = prevFii ? ((fiiN - prevFii) / Math.abs(prevFii) * 100) : null;
      const abs = fiiN < 0 && diiN > Math.abs(fiiN) ? "Absorbed" : fiiN < 0 && diiN < 0 ? "Risk-Off" : fiiN > 0 && diiN > 0 ? "Both Buy" : "—";
      const rowZ = cashFreq === "Daily" && stdFii > 0 ? (fiiN - avgFii) / stdFii : 0;
      return {
        ...row,
        fiiN,
        diiN,
        chg,
        abs,
        rowZ,
        label: fmtPeriodLabel(row.endDate || row.date, cashFreq),
      };
    });
  }, [cashData, cashFreq]);

  const derivativesTabData = useMemo(() => {
    const rows = derivMemo.rows || [];
    const lsTrend = derivMemo.lsTrend || [];
    const derivSpanYears = dataYearSpan(rows);
    const filteredRows = filterByRange(rows, derivRange);
    const filteredLsTrend = filterByRange(lsTrend, derivRange);
    const derivSelectedRangeYears = derivRange === "1Y" ? 1 : derivRange === "3Y" ? 3 : derivRange === "5Y" ? 5 : derivRange === "10Y" ? 10 : null;
    const derivRangeExceedsData = derivSelectedRangeYears != null && derivSelectedRangeYears > derivSpanYears;
    return { derivSpanYears, filteredRows, filteredLsTrend, derivRangeExceedsData };
  }, [derivMemo.rows, derivMemo.lsTrend, derivRange]);

  const sectorSnapshotMaxAbs = useMemo(() => {
    const snapshot = sectorMemo.latestSnapshot || [];
    return snapshot.reduce((max, item) => Math.max(max, Math.abs(+item.net_investment || 0)), 0);
  }, [sectorMemo.latestSnapshot]);

  // ── SWIPE ──────────────────────────────────────────────────────────────────
  const card = { background: T.isDark ? T.surface : T.card, borderRadius: T.radiusLg || 24, padding: isMobile ? 14 : 18, border: `1px solid ${T.border}`, boxShadow: T.shadow, backdropFilter: "blur(16px)" };
  const sh   = { fontSize: isMobile ? 16 : 18, fontWeight: 800, color: T.text, marginBottom: 16, marginTop: 0, letterSpacing: -0.4 };
  const noData = (msg) => <div style={{ ...card, textAlign: "center", color: T.subtext, padding: 40, fontSize: 13 }}>{msg || "No data"}</div>;

  if (loading) return (
    <div style={{ padding: 60, textAlign: "center", color: T.subtext, fontFamily: T.fontSans }}>
      <div style={{ fontSize: 28 }}>📊</div>
      <div style={{ fontSize: 14, marginTop: 8 }}>Loading institutional flow data…</div>
    </div>
  );
  if (error) return <div style={{ padding: 40, textAlign: "center", color: RED, fontSize: 14, fontFamily: T.fontSans }}>Error: {error}</div>;

  // ══════════════════════════════════════════════════════════════════════════
  // OVERVIEW TAB
  // ══════════════════════════════════════════════════════════════════════════
  const OverviewTab = () => {
    const { fii1, dii1, fii5, dii5, fii20, dii20, z, daily, rolling, participation, absorption, latest, totalInst1 } = cashMemo;
    const insightText = (() => {
      if (absorption === "DII Absorbing FII") return { text: "DII absorbing FII selling → Bullish cushion", color: GREEN };
      if (absorption === "Both Buying")        return { text: "Both FII & DII buying → Strong momentum",     color: GREEN };
      if (absorption === "Both Selling")       return { text: "Both selling → Risk-off event, caution",       color: RED   };
      return { text: "Mixed flows — no dominant direction", color: T.subtext };
    })();

    // (1) Only Daily or 20D Rolling; default 20D Rolling; filter by range
    const { isRolling, spanYears, chartData, chartSeries, rangeExceedsData } = overviewTabData;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {signals.regime && (
          <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: T.subtext, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Market Regime</div>
              <SignalPill signal={signals.regime} T={T} />
            </div>
            <div style={{ fontSize: 12, color: insightText.color, fontWeight: 600, maxWidth: 320, textAlign: isMobile ? "left" : "right" }}>{insightText.text}</div>
          </div>
        )}

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

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10 }}>
          <StatCard label="Total Inst. 1D"    value={fmtCrShort(totalInst1)} color={getColor(totalInst1)} T={T} />
          <StatCard label="FII Z-Score (20D)" value={isFinite(z) ? z.toFixed(2) : "—"} color={z > 2 ? GREEN : z < -2 ? RED : AMBER} sub={z > 2 ? "Extreme Buying" : z < -2 ? "Panic Selling" : "Normal"} T={T} />
          <StatCard label="FII Participation" value={`${(participation * 100).toFixed(0)}%`} color={BLUE} sub="of institutional volume" T={T} />
          <StatCard label="Absorption"        value={absorption} color={absorption.includes("Both Sell") ? RED : absorption.includes("Both Buy") ? GREEN : BLUE} T={T} />
        </div>

        {/* (1) Chart with Daily/20D Rolling toggle + 1Y/3Y/5Y/10Y range */}
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
              <ViewToggle options={["1Y", "3Y", "5Y", "10Y"]} value={overviewRange} onChange={setOverviewRange} T={T} dataSpanYears={spanYears} />
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
  };

  // ══════════════════════════════════════════════════════════════════════════
  // CASH FLOW TAB  — (2) no cumulative chart; (4) frequency toggle on table
  // ══════════════════════════════════════════════════════════════════════════
  const CashFlowTab = () => {
    const { fii5, dii5, fii20, dii20, z, sellStreak } = cashMemo;

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

        <div style={{ ...card, borderLeft: `4px solid ${z > 2 ? GREEN : z < -2 ? RED : AMBER}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 11, color: T.subtext, fontWeight: 600, textTransform: "uppercase" }}>FII Z-Score (20D window)</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: z > 2 ? GREEN : z < -2 ? RED : AMBER, fontFamily: "monospace" }}>{isFinite(z) ? z.toFixed(2) : "—"}</div>
          </div>
          <div style={{ fontSize: 12, color: T.subtext, maxWidth: 280 }}>
            {z > 2 ? "🚨 Extreme FII buying — 2+ SD above mean" : z < -2 ? "⚠️ Panic selling — 2+ SD below mean" : "📊 Flows within normal range"}
          </div>
        </div>

        {/* (4) Frequency toggle on cash flow table */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
            <h3 style={{ ...sh, margin: 0 }}>Cash Flow Data</h3>
            <ViewToggle options={["Daily", "Weekly", "Monthly", "Annual"]} value={cashFreq} onChange={setCashFreq} T={T} />
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
                {cashFlowTableRows.map((row, i) => {
                  const { fiiN, diiN, chg, abs, rowZ, label } = row;
                  const absC = abs==="Absorbed" ? GREEN : abs==="Risk-Off" ? RED : abs==="Both Buy" ? BLUE : T.subtext;
                  const rowBg = rowZ > 2 ? GREEN+"12" : rowZ < -2 ? RED+"12" : i%2===0 ? T.card : (T.surface||T.bg);
                  return (
                    <tr key={i} style={{ background: rowBg }}>
                      <td style={{ padding: "8px 10px", color: T.text, borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>
                        {label}
                        {rowZ > 2  && <span style={{ marginLeft: 4, fontSize: 9, color: GREEN }}>▲EXT</span>}
                        {rowZ < -2 && <span style={{ marginLeft: 4, fontSize: 9, color: RED   }}>▼EXT</span>}
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
        </div>
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  // DERIVATIVES TAB
  // ══════════════════════════════════════════════════════════════════════════
  const DerivativesTab = () => {
    if (!derivMemo.rows?.length) return noData("No F&O data available. Check fii_dii_fo table format.");
    const { latest, lsRatio, buildUp, lsTrend, rows } = derivMemo;
    const { derivSpanYears, filteredRows, filteredLsTrend, derivRangeExceedsData } = derivativesTabData;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10 }}>
          <StatCard label="FII Net Position" value={latest.fiiNet ? (latest.fiiNet>0?"+":"")+latest.fiiNet.toLocaleString("en-IN"):"—"} color={getColor(latest.fiiNet)} T={T} />
          <StatCard label="FII L/S Ratio"    value={lsRatio} color={parseFloat(lsRatio)>1?GREEN:RED} sub={parseFloat(lsRatio)>1?"Net Long":"Net Short"} T={T} />
          <StatCard label="DII Net Position" value={latest.diiNet ? (latest.diiNet>0?"+":"")+latest.diiNet.toLocaleString("en-IN"):"—"} color={getColor(latest.diiNet)} T={T} />
          <StatCard label="Build-up"         value={buildUp} color={buildUp==="Long Build-up"?GREEN:buildUp==="Short Build-up"?RED:AMBER} T={T} />
        </div>

        {/* (3) FII Long vs Short — smooth line chart, range picker */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
            <div>
              <h3 style={{ ...sh, margin: 0 }}>FII Long vs Short</h3>
              <div style={{ fontSize: 12, color: T.subtext, marginTop: 2 }}>Index futures only</div>
            </div>
            <ViewToggle options={["1Y", "3Y", "5Y", "10Y"]} value={derivRange} onChange={setDerivRange} T={T} dataSpanYears={derivSpanYears} />
          </div>
          <SvgLineChart data={filteredRows} series={[{ key:"fiiFutLong", color:GREEN, name:"FII Long" }, { key:"fiiFutShort", color:RED, name:"FII Short" }]} height={isMobile?220:300} fill={false} T={T} />
          {derivRangeExceedsData && (
            <div style={{ fontSize: 11, color: AMBER, marginTop: 8, display: "flex", alignItems: "center", gap: 5 }}>
              <span>★</span>
              <span>Data available from 8 Apr 2022 — showing all {filteredRows.length} sessions ({derivSpanYears.toFixed(1)} years).</span>
            </div>
          )}
        </div>

        {/* (3) L/S Ratio trend — smooth, same range */}
        <div style={card}>
          <h3 style={{ ...sh, marginBottom: 4 }}>FII Long/Short Ratio Trend</h3>
          <div style={{ fontSize: 12, color: T.subtext, marginBottom: 12 }}>Index futures only · Ratio &gt; 1 = net long (bullish), &lt; 1 = net short (bearish)</div>
          <SvgLineChart data={filteredLsTrend} series={[{ key:"lsRatio", color:PURPLE, name:"FII L/S Ratio" }]} height={isMobile?180:240} fill={true} T={T} />
        </div>

      </div>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  // SECTOR ROTATION TAB
  // ══════════════════════════════════════════════════════════════════════════
  const SectorTab = () => {
    if (!sectorMemo.ranking) return noData("No sector data.");
    const { allSectors, ranking, leaders, laggards, sectorHistory, latestSnapshot, latestDate, multiSectorData } = sectorMemo;
    const SECTOR_COLORS = [GREEN, BLUE, AMBER, PURPLE, RED, "#06b6d4", "#f97316", "#84cc16"];
    const toggleSector = (sec) => setSelectedSectors(prev => prev.includes(sec) ? prev.filter(s => s!==sec) : prev.length<5 ? [...prev,sec] : prev);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile?"1fr":"1fr 1fr", gap: 14 }}>
          {[{ title:"🏆 Top 3 Leaders (60D)", list:leaders, color:GREEN }, { title:"📉 Bottom 3 Laggards (60D)", list:laggards, color:RED }].map(({ title, list, color }) => (
            <div key={title} style={card}>
              <h3 style={{ ...sh, color }}>{title}</h3>
              {list.map((s, i) => (
                <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:i<2?`1px solid ${T.border}`:"none" }}>
                  <div style={{ fontSize:13, color:T.text, fontWeight:500 }}><span style={{ color, fontWeight:700, marginRight:6 }}>#{i+1}</span>{s.sector}</div>
                  <div style={{ fontFamily:"monospace", fontWeight:700, color, fontSize:13 }}>{fmtCrShort(s.total)}</div>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div style={card}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14, flexWrap:"wrap" }}>
            <h3 style={{ ...sh, margin:0 }}>Sector Historical Flow</h3>
            <select value={selectedSector} onChange={e => setSelectedSector(e.target.value)}
              style={{ background:T.card, color:T.text, border:`1px solid ${T.border}`, borderRadius:6, padding:"5px 10px", fontSize:13, fontFamily:"inherit", cursor:"pointer" }}>
              <option value="__ALL__">— Select Sector —</option>
              {allSectors.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {sectorHistory.length > 0 && <button onClick={() => setFullscreen(true)} style={{ background:T.card, border:`1px solid ${T.border}`, color:T.text, borderRadius:6, padding:"5px 12px", fontSize:11, cursor:"pointer", fontFamily:"inherit" }}>⛶ Fullscreen</button>}
          </div>
          {sectorHistory.length > 0
            ? <SvgLineChart data={sectorHistory} series={[{ key:"value", color:GREEN, name:"Net Investment" }]} height={isMobile?200:280} fill={true} T={T} />
            : <div style={{ color:T.subtext, fontSize:13, textAlign:"center", padding:24 }}>Select a sector above to view full historical flow</div>
          }
        </div>

        <div style={card}>
          <h3 style={{ ...sh, marginBottom:6 }}>Multi-Sector Overlay</h3>
          <div style={{ fontSize:12, color:T.subtext, marginBottom:10 }}>Select up to 5 sectors to compare</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:14 }}>
            {allSectors.map(sec => {
              const active = selectedSectors.includes(sec);
              const clr    = SECTOR_COLORS[selectedSectors.indexOf(sec) % SECTOR_COLORS.length] || T.border;
              return (
                <button key={sec} onClick={() => toggleSector(sec)} style={{ padding:"4px 10px", fontSize:11, borderRadius:20, border:`1.5px solid ${active?clr:T.border}`, background:active?clr+"22":"transparent", color:active?clr:T.subtext, cursor:"pointer", fontFamily:"inherit", fontWeight:active?700:400, transition:"all 0.15s" }}>{sec}</button>
              );
            })}
          </div>
          {selectedSectors.length > 0 && multiSectorData.length > 0
            ? <SvgLineChart data={multiSectorData} series={selectedSectors.map((sec, i) => ({ key:sec, color:SECTOR_COLORS[i%SECTOR_COLORS.length], name:sec }))} height={isMobile?220:300} T={T} />
            : <div style={{ color:T.subtext, fontSize:13, textAlign:"center", padding:20 }}>{selectedSectors.length===0?"Click sectors above to compare them":"Loading…"}</div>
          }
        </div>

        <div style={card}>
          <h3 style={sh}>Full Sector Ranking — 60D Net Flows</h3>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead><tr style={{ background:T.surface||T.bg }}>
                {["#","Sector","60D Flow","Momentum","Signal"].map((h,i) => (
                  <th key={h} style={{ padding:"8px 10px", textAlign:i<2?"left":"right", fontSize:10, fontWeight:700, textTransform:"uppercase", color:T.subtext, borderBottom:`1px solid ${T.border}` }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {ranking.map((s, i) => (
                  <tr key={i} style={{ background:i%2===0?T.card:(T.surface||T.bg) }}>
                    <td style={{ padding:"8px 10px", color:T.subtext, borderBottom:`1px solid ${T.border}`, fontWeight:700, width:32 }}>{i+1}</td>
                    <td style={{ padding:"8px 10px", color:T.text,    borderBottom:`1px solid ${T.border}`, fontWeight:500 }}>{s.sector}</td>
                    <td style={{ padding:"8px 10px", textAlign:"right", fontFamily:"monospace", fontWeight:700, color:getColor(s.total), borderBottom:`1px solid ${T.border}` }}>{fmtCrShort(s.total)}</td>
                    <td style={{ padding:"8px 10px", textAlign:"right", fontFamily:"monospace", color:getColor(s.momentum), borderBottom:`1px solid ${T.border}` }}>{fmtCrShort(s.momentum)}</td>
                    <td style={{ padding:"8px 10px", textAlign:"right", borderBottom:`1px solid ${T.border}`, fontSize:11, fontWeight:700, color:s.momentum>0&&s.total>0?GREEN:s.momentum<0&&s.total<0?RED:AMBER }}>
                      {s.momentum>0&&s.total>0?"▲ Accelerating":s.momentum<0&&s.total<0?"▼ Declining":"~ Turning"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={card}>
          <h3 style={sh}>Latest Snapshot — {fmtDate(latestDate)}</h3>
          {latestSnapshot.map((s, i) => {
            const pct = sectorSnapshotMaxAbs ? Math.abs(+s.net_investment||0)/sectorSnapshotMaxAbs*100 : 0;
            const val = +s.net_investment || 0;
            return (
              <div key={i} style={{ marginBottom:8 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:3 }}>
                  <span style={{ color:T.text, fontWeight:500 }}>{s.sector}</span>
                  <span style={{ color:getColor(val), fontWeight:700, fontFamily:"monospace" }}>{fmtCrShort(val)}</span>
                </div>
                <div style={{ background:T.border, borderRadius:2, height:4, overflow:"hidden" }}>
                  <div style={{ width:`${pct}%`, height:"100%", background:val>=0?GREEN:RED, borderRadius:2, transition:"width 0.4s ease" }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  // SIGNALS TAB
  // ══════════════════════════════════════════════════════════════════════════
  const SignalsTab = () => {
    const { regime, insights=[], exportText, lsRatio, z, breadth } = signals;
    const [copied, setCopied] = useState(false);
    const copy = () => { navigator.clipboard?.writeText(exportText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); };

    return (
      <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
        <div style={{ ...card, background:regime==="Bullish Regime"?GREEN+"12":regime==="Bearish Regime"?RED+"12":AMBER+"12", borderColor:regime==="Bullish Regime"?GREEN+"44":regime==="Bearish Regime"?RED+"44":AMBER+"44", textAlign:"center", padding:28 }}>
          <div style={{ fontSize:11, color:T.subtext, fontWeight:600, textTransform:"uppercase", marginBottom:8 }}>Current Market Regime</div>
          <SignalPill signal={regime} T={T} />
          <div style={{ marginTop:12, fontSize:12, color:T.subtext }}>Based on FII 20D · F&O L/S ratio · DII absorption · Sector breadth</div>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4, 1fr)", gap:10 }}>
          <StatCard label="FII 20D Flow"   value={fmtCrShort(cashMemo.fii20)}  color={getColor(cashMemo.fii20)}  T={T} />
          <StatCard label="DII 20D Flow"   value={fmtCrShort(cashMemo.dii20)}  color={getColor(cashMemo.dii20)}  T={T} />
          <StatCard label="FII L/S Ratio"  value={typeof lsRatio==="number"?lsRatio.toFixed(2):"—"} color={parseFloat(lsRatio)>1?GREEN:RED} sub={parseFloat(lsRatio)>1?"Net Long":"Net Short"} T={T} />
          <StatCard label="Sector Breadth" value={`${breadth??0}%`} color={breadth>60?GREEN:breadth<40?RED:AMBER} sub="sectors with inflows" T={T} />
        </div>

        <div style={card}>
          <h3 style={sh}>🧠 Insight Engine</h3>
          {insights.length===0
            ? <div style={{ color:T.subtext, fontSize:13 }}>No significant signals currently.</div>
            : <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {insights.map((ins, i) => (
                  <div key={i} style={{ display:"flex", gap:12, alignItems:"flex-start", padding:"12px 14px", borderRadius:8, background:ins.type==="bullish"?GREEN+"12":ins.type==="bearish"?RED+"12":ins.type==="alert"?AMBER+"12":(T.surface||T.bg), border:`1px solid ${ins.type==="bullish"?GREEN+"33":ins.type==="bearish"?RED+"33":ins.type==="alert"?AMBER+"33":T.border}` }}>
                    <span style={{ fontSize:20 }}>{ins.icon}</span>
                    <div style={{ fontSize:13, color:T.text, lineHeight:1.5 }}>{ins.text}</div>
                  </div>
                ))}
              </div>
          }
        </div>

        {/*<div style={card}>*/}
        {/*  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>*/}
        {/*    <h3 style={{ ...sh, margin:0 }}>📤 Export Insight</h3>*/}
        {/*    <button onClick={copy} style={{ background:BLUE, color:"#fff", border:"none", borderRadius:8, padding:"6px 16px", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>*/}
        {/*      {copied?"✓ Copied!":"Copy for X / Twitter"}*/}
        {/*    </button>*/}
        {/*  </div>*/}
        {/*  <pre style={{ background:T.surface||T.bg, borderRadius:8, padding:14, fontSize:12, color:T.text, whiteSpace:"pre-wrap", lineHeight:1.7, margin:0, border:`1px solid ${T.border}` }}>{exportText||"Loading…"}</pre>*/}
        {/*</div>*/}

        {derivMemo.buildUp && derivMemo.buildUp !== "Neutral" && (
          <div style={{ ...card, borderLeft:`4px solid ${derivMemo.buildUp==="Long Build-up"?GREEN:RED}` }}>
            <div style={{ fontSize:11, color:T.subtext, fontWeight:600, textTransform:"uppercase", marginBottom:4 }}>F&O Build-up Alert</div>
            <div style={{ fontSize:15, fontWeight:700, color:derivMemo.buildUp==="Long Build-up"?GREEN:RED }}>
              {derivMemo.buildUp==="Long Build-up"?"📈 Long Build-up Detected":"📉 Short Build-up Detected"}
            </div>
            <div style={{ fontSize:12, color:T.subtext, marginTop:4 }}>
              {derivMemo.buildUp==="Long Build-up"?"FII adding longs, reducing shorts — Bullish":"FII adding shorts, reducing longs — Bearish"}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER — (5) Sticky header + tab bar
  // ══════════════════════════════════════════════════════════════════════════
  const tabContent = {
    "Overview":        <OverviewTab />,
    "Cash Flow":       <CashFlowTab />,
    "Derivatives":     <DerivativesTab />,
    "Sector Rotation": <SectorTab />,
    "Signals":         <SignalsTab />,
  };

  return (
    <div
      style={{ width:"100%", minHeight:"100%", overflowY:"auto", boxSizing:"border-box", fontFamily:T.fontSans, color:T.text, background:T.bg, padding:isMobile ? "0" : "22px 28px 36px" }}
    >
      <div
        style={{ width:"100%", maxWidth:isMobile?"100%":1400, margin:"0 auto", minHeight:"100%", background:T.shellBg, border:isMobile?"none":`1px solid ${T.border}`, borderRadius:isMobile?0:(T.radiusLg + 6), boxShadow:T.shadow, position:"relative", overflow:"hidden" }}
      >
      <div style={{ position:"absolute", inset:0, background:T.shellOverlay, pointerEvents:"none" }} />
      {/* Fullscreen sector chart */}
      {fullscreen && sectorMemo.sectorHistory?.length > 0 && (
        <div style={{ position:"fixed", inset:0, zIndex:9999, background:T.shellBg, display:"flex", flexDirection:"column" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 20px", borderBottom:`1px solid ${T.border}`, background:T.headerBg, backdropFilter:"blur(16px)", boxShadow:T.headerShadow }}>
            <div style={{ fontSize:15, fontWeight:800, color:T.text, letterSpacing:-0.3 }}>{selectedSector} — Historical Net Flow</div>
            <button onClick={() => setFullscreen(false)} style={{ background:T.card, border:`1px solid ${T.border}`, color:T.text, borderRadius:999, padding:"8px 16px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit", boxShadow:T.shadowSoft }}>✕ Close</button>
          </div>
          <div style={{ flex:1, padding:16, overflowY:"auto" }}>
            <SvgLineChart data={sectorMemo.sectorHistory} series={[{ key:"value", color:GREEN, name:"Net Investment" }]} height={window.innerHeight-100} fill={true} T={T} />
          </div>
        </div>
      )}

      {/* ── (5) STICKY HEADER + TAB BAR ── */}
      <div style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: T.headerBg,
        borderBottom: `1px solid ${T.border}`,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        boxShadow: T.headerShadow,
      }}>
        {/* Title row */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12, padding:isMobile?"18px 14px 12px":"24px 28px 16px" }}>
          <div>
            <div style={{ fontSize:10, fontWeight:800, letterSpacing:1.6, textTransform:"uppercase", color:T.accent, marginBottom:6, opacity:T.isDark ? 0.9 : 1 }}>Institutional Flow Dashboard</div>
            <h1 style={{ fontSize:isMobile?22:30, fontWeight:800, color:T.text, margin:0, letterSpacing:-1 }}>FII · DII Analytics</h1>
            <p style={{ fontSize:isMobile?12:13, color:T.subtext, margin:"6px 0 0", lineHeight:1.6, maxWidth:900 }}>
              Institutional flow intelligence for cash, derivatives, sector rotation, and regime tracking as of {fmtDate(cashData[cashData.length-1]?.date)}.
            </p>
          </div>
          {signals.regime && <SignalPill signal={signals.regime} T={T} />}
        </div>

        {/* Tab row */}
        <div style={{ display:"flex", overflowX:"auto", scrollbarWidth:"none", padding:isMobile?"0 14px 14px":"0 28px 18px", gap:8 }}>
            {TABS.map(t => (
              <button key={t} onClick={() => startTransition(() => setActiveTab(t))} style={{
              padding:isMobile?"10px 14px":"11px 18px", fontSize:isMobile?11:12, fontWeight:700,
              border:`1px solid ${activeTab===t ? T.accentMuted : "transparent"}`, background:activeTab===t?T.tabActiveBg:"transparent", color:activeTab===t?(T.tabActiveText || T.text):T.subtext,
              borderRadius:999,
              cursor:"pointer", transition:"all 0.15s", fontFamily:"inherit", whiteSpace:"nowrap", flexShrink:0, letterSpacing:0.2, boxShadow: activeTab===t && T.isDark ? "inset 0 0 0 1px rgba(52, 211, 153, 0.08)" : "none",
            }}>{t === "Signals" ? "🧠 " : ""}{t}</button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ padding:isMobile?"16px 14px 28px":"22px 28px 36px", position:"relative" }}>
        {tabContent[activeTab]}
      </div>
      </div>
    </div>
  );
}

// Export memoized component to prevent unnecessary re-renders when parent updates
export default memo(FiiDiiModuleInner);
