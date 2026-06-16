// NiftyPEHeatmap.jsx  â€”  Premium Institutional Redesign
// Bloomberg Ã— TradingView Ã— Apple Finance aesthetic
// Drop-in replacement for the existing NiftyPEHeatmap component in TradeEdge.
// Props: { T }  â€” standard TradeEdge theme object

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";

// â”€â”€â”€ Responsive hook â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function useIsMobile(bp = 640) {
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < bp : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${bp - 1}px)`);
    const handler = e => setMobile(e.matches);
    mq.addEventListener("change", handler);
    setMobile(mq.matches);
    return () => mq.removeEventListener("change", handler);
  }, [bp]);
  return mobile;
}

// â”€â”€â”€ Supabase REST config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const SB_HEADERS = {
  "Content-Type": "application/json",
  apikey:         SUPABASE_ANON_KEY,
  Authorization:  `Bearer ${SUPABASE_ANON_KEY}`,
};

// Fetch all rows from nifty50_pe, paginating if needed (PostgREST default limit = 1000)
async function fetchNiftyPE() {
  const url = `${SUPABASE_URL}/rest/v1/nifty50_pe?select=date,pe_ratio&order=date.asc&limit=2000`;
  const res = await fetch(url, { headers: SB_HEADERS });
  if (!res.ok) throw new Error(`Supabase error ${res.status}: ${await res.text()}`);
  return res.json(); // [{ date: "2016-01-31", pe_ratio: 21.2 }, ...]
}

// â”€â”€â”€ DB row helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Transform flat rows â†’ [{ year, 1..12 }] grid (same shape as old PE_RAW)
function rowsToGrid(rows) {
  const map = {};
  for (const { date, pe_ratio } of rows) {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    if (!map[y]) map[y] = { year: y };
    map[y][m] = pe_ratio != null ? +pe_ratio : null;
  }
  return Object.values(map)
    .sort((a, b) => a.year - b.year)
    .map(row => {
      for (let m = 1; m <= 12; m++) if (!(m in row)) row[m] = null;
      return row;
    });
}

// Derive all statistics from the grid
function deriveStats(grid) {
  const all = grid.flatMap(r => Array.from({length:12}, (_,i) => r[i+1])).filter(v => v != null);
  if (!all.length) return { allPE:[], peMin:0, peMax:0, peMean:0, peMedian:0, currentPE:0, currentPercentile:0 };
  const sorted = [...all].sort((a,b) => a-b);
  const currentPE = (() => {
    for (const row of [...grid].reverse())
      for (let m = 12; m >= 1; m--)
        if (row[m] != null) return row[m];
    return all[all.length - 1];
  })();
  const currentPercentile = Math.round((all.filter(v => v <= currentPE).length / all.length) * 100);
  return {
    allPE:    all,
    peMin:    sorted[0],
    peMax:    sorted[sorted.length - 1],
    peMean:   all.reduce((a,b) => a+b, 0) / all.length,
    peMedian: sorted[Math.floor(sorted.length / 2)],
    currentPE,
    currentPercentile,
  };
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// â”€â”€â”€ Valuation colour palettes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Dark theme: vivid, high-brightness colours readable on dark backgrounds
const VAL_DARK = {
  cheap:     "#22C55E",   // green-500
  fair:      "#84CC16",   // lime-500
  neutral:   "#EAB308",   // yellow-500
  rich:      "#F97316",   // orange-500
  expensive: "#EF4444",   // red-500
};

// Light theme: deep, saturated colours readable on white/light-grey backgrounds
const VAL_LIGHT = {
  cheap:     "#16A34A",   // green-600   â€” dark enough on white
  fair:      "#4D7C0F",   // lime-700    â€” olive-green, clearly visible
  neutral:   "#B45309",   // amber-700   â€” warm brown-amber, not washed out
  rich:      "#C2410C",   // orange-700  â€” deep orange
  expensive: "#DC2626",   // red-600     â€” clear red
};

// Alpha tints for cell backgrounds â€” lighter in light mode, richer in dark
const VAL_BG_DARK = {
  cheap:     "rgba(34,197,94,",
  fair:      "rgba(132,204,22,",
  neutral:   "rgba(234,179,8,",
  rich:      "rgba(249,115,22,",
  expensive: "rgba(239,68,68,",
};

const VAL_BG_LIGHT = {
  cheap:     "rgba(22,163,74,",
  fair:      "rgba(77,124,15,",
  neutral:   "rgba(180,83,9,",
  rich:      "rgba(194,65,12,",
  expensive: "rgba(220,38,38,",
};

// VAL is set at runtime in buildC and exported via C; default to light for module-level uses
let VAL = VAL_LIGHT;
let VAL_BG = VAL_BG_LIGHT;

// Build runtime C â€” maps TradeEdge T tokens directly; works in both light & dark
function buildC(T) {
  // isDark: true when T is the dark theme (used for alpha overlays that invert in light)
  const isDark = T?.bg === "#060d1a" || (T?.bg && T.bg.startsWith("#0"));
  // Set module-level VAL / VAL_BG so peColor() uses the right palette
  VAL    = isDark ? VAL_DARK    : VAL_LIGHT;
  VAL_BG = isDark ? VAL_BG_DARK : VAL_BG_LIGHT;
  return {
    isDark,
    bg:         T?.bg         ?? "#f0f4f8",
    card:       T?.card       ?? "#ffffff",
    cardAlt:    T?.cardAlt    ?? T?.card ?? "#f8fafc",
    surface:    T?.surface    ?? "#ffffff",
    border:     T?.border     ?? "#dde3ec",
    borderStrong: T?.borderStrong ?? T?.border ?? "#c8d1de",
    text:       T?.text       ?? "#0a0f1e",
    sub:        T?.subtext    ?? "#475569",
    muted:      T?.muted      ?? "#94a3b8",
    hover:      T?.hover      ?? "#f1f5f9",
    tableHead:  T?.tableHead  ?? "#f6f9fc",
    tableAlt:   T?.tableAlt   ?? "rgba(0,0,0,0.012)",
    tableHover: T?.tableHover ?? "#f1f5f9",
    shadow:     T?.shadow     ?? "rgba(10,15,30,0.08)",
    thumbBg:    T?.thumbBg    ?? "#cbd5e1",
    thumbHover: T?.thumbHover ?? "#94a3b8",
    // Derived: glass/overlay tints that must flip between light & dark
    glassBg:    isDark ? "rgba(255,255,255,0.03)"  : "rgba(0,0,0,0.02)",
    glassHov:   isDark ? "rgba(255,255,255,0.055)" : "rgba(0,0,0,0.04)",
    glassBorder:isDark ? "rgba(255,255,255,0.12)"  : "rgba(0,0,0,0.10)",
    rowAlt:     isDark ? "rgba(255,255,255,0.012)" : "rgba(0,0,0,0.015)",
    rowHov:     isDark ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.03)",
    panelBg:    isDark ? "rgba(255,255,255,0.02)"  : "rgba(0,0,0,0.015)",
    subheadBg:  isDark ? "rgba(255,255,255,0.03)"  : "rgba(0,0,0,0.02)",
    emptyCell:  isDark ? "rgba(255,255,255,0.02)"  : "rgba(0,0,0,0.03)",
    emptyCellBorder: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.06)",
    emptyDash:  isDark ? "rgba(255,255,255,0.12)"  : "rgba(0,0,0,0.18)",
    tooltipBg:  isDark ? "#0D1B2A" : "#ffffff",
    tooltipShadow: isDark
      ? "0 8px 24px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)"
      : "0 8px 24px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)",
    gaugeBorder: isDark ? "#0B1220" : "#f0f4f8",
    scrollThumb: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.15)",
    scrollThumbHov: isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.22)",
    stickyOdd:  isDark ? "#131d2f" : "#f6f9fc",
    // Spread the runtime-selected VAL so C.cheap/fair/etc are always correct
    cheap:     VAL.cheap,
    fair:      VAL.fair,
    neutral:   VAL.neutral,
    rich:      VAL.rich,
    expensive: VAL.expensive,
  };
}

// Get colour for a PE value
// alpha < 1 â†’ returns a background tint using the right palette for current theme
// alpha = 1 â†’ returns the solid text/stroke colour
function peColor(pe, alpha = 1) {
  if (pe == null) return alpha < 1 ? "rgba(128,128,128,0.06)" : "rgba(128,128,128,0.4)";
  if (pe < 20)   return alpha < 1 ? `${VAL_BG.cheap}${alpha})`   : VAL.cheap;
  if (pe < 22)   return alpha < 1 ? `${VAL_BG.fair}${alpha})`    : VAL.fair;
  if (pe < 25)   return alpha < 1 ? `${VAL_BG.neutral}${alpha})`  : VAL.neutral;
  if (pe < 30)   return alpha < 1 ? `${VAL_BG.rich}${alpha})`     : VAL.rich;
  return          alpha < 1 ? `${VAL_BG.expensive}${alpha})`  : VAL.expensive;
}

function peCategory(pe) {
  if (pe == null) return "â€”";
  if (pe < 20)  return "Historically Cheap";
  if (pe < 22)  return "Fair Value";
  if (pe < 25)  return "Fairly Valued";
  if (pe < 30)  return "Rich";
  return              "Expensive";
}

function peCategoryShort(pe) {
  if (pe == null) return "â€”";
  if (pe < 20)  return "Cheap";
  if (pe < 22)  return "Fair";
  if (pe < 25)  return "Fair+";
  if (pe < 30)  return "Rich";
  return              "Bubble";
}

// pePercentile is computed at render time with the live allPE array
function pePercentile(pe, allPE) {
  if (pe == null || !allPE?.length) return 0;
  return Math.round((allPE.filter(v => v <= pe).length / allPE.length) * 100);
}

// â”€â”€â”€ Market cycle data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// CYCLES is a function so it picks up the current VAL at render time
function getCycles() {
  return [
    { period:"2016â€“2018", label:"Fair Valuation",   color:VAL.fair,      width:20 },
    { period:"2019",      label:"Getting Rich",      color:VAL.neutral,   width:8  },
    { period:"2020",      label:"Expensive",         color:VAL.rich,      width:8  },
    { period:"2021",      label:"Bubble Territory",  color:VAL.expensive, width:8  },
    { period:"2022",      label:"Valuation Reset",   color:"#3B82F6",     width:8  },
    { period:"2023â€“2026", label:"Fair Valuation",    color:VAL.fair,      width:20 },
  ];
}

// â”€â”€â”€ Sparkline (C passed as prop) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function Sparkline({ values, color, C, width = 80, height = 24 }) {
  const pts = values.filter(v => v != null);
  if (pts.length < 2) return <span style={{color: C.muted, fontSize:10}}>â€”</span>;
  const mn = Math.min(...pts), mx = Math.max(...pts), rng = mx - mn || 1;
  const coords = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * width;
    const y = height - ((v - mn) / rng) * (height - 4) - 2;
    return [x, y];
  });
  const poly = coords.map(p => p.join(",")).join(" ");
  const area = `0,${height} ${poly} ${width},${height}`;
  const gradId = `sg${color.replace(/[^a-zA-Z0-9]/g,"")}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      style={{display:"block", overflow:"visible"}}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradId})`}/>
      <polyline points={poly} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={coords[coords.length-1][0]} cy={coords[coords.length-1][1]}
        r="2.5" fill={color}/>
    </svg>
  );
}

// â”€â”€â”€ Trend line chart (C passed as prop) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â”€â”€â”€ Trend line chart â€” FiiDii-style: responsive, smooth, zoom/pan â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function useTCWidth(ref) {
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

function tcNiceTicks(minV, maxV, count = 5) {
  const range = maxV - minV || 1;
  const raw   = range / count;
  const mag   = Math.pow(10, Math.floor(Math.log10(raw)));
  const step  = [1, 2, 2.5, 5, 10].find(n => mag * n >= raw) * mag;
  const lo    = Math.floor(minV / step) * step;
  const ticks = [];
  for (let t = lo; t <= maxV + step * 0.5; t += step) ticks.push(+t.toFixed(8));
  return ticks;
}

function smoothBezier(pts) {
  if (pts.length < 2) return pts.length ? `M ${pts[0][0]},${pts[0][1]}` : "";
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const cpx = (x0 + x1) / 2;
    d += ` C ${cpx},${y0} ${cpx},${y1} ${x1},${y1}`;
  }
  return d;
}

const TC_PAD = { top: 14, right: 16, bottom: 30, left: 52 };

function TrendChart({ points, C, height = 300, peMean = 0, currentPE = null, allPE = [] }) {
  const wrapRef = useRef(null);
  const svgRef  = useRef(null);
  const W = useTCWidth(wrapRef);

  const [viewport, setViewport] = useState({ start: 0, end: null });
  const isPanning  = useRef(false);
  const panStartX  = useRef(0);
  const panStartVP = useRef(null);

  useEffect(() => { setViewport({ start: 0, end: null }); }, [points?.length]);

  const validVals = points.filter(p => p.pe != null).map(p => p.pe);
  if (validVals.length < 2) return (
    <div ref={wrapRef} style={{height, display:"flex", alignItems:"center",
      justifyContent:"center", color:C.muted, fontSize:13}}>
      Not enough data for this period
    </div>
  );

  const totalPts = points.length;
  const vpEnd    = viewport.end ?? totalPts - 1;
  const vpStart  = Math.max(0, Math.min(viewport.start, vpEnd - 1));
  const visible  = points.slice(vpStart, vpEnd + 1);

  const cW = W - TC_PAD.left - TC_PAD.right;
  const cH = height - TC_PAD.top - TC_PAD.bottom;

  const visVals = visible.filter(p => p.pe != null).map(p => p.pe);
  const rawMin  = Math.min(...visVals);
  const rawMax  = Math.max(...visVals);
  const ticks   = tcNiceTicks(rawMin - 0.5, rawMax + 0.5);
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const span = hi - lo || 1;

  const px = i => TC_PAD.left + (i / Math.max(visible.length - 1, 1)) * cW;
  const py = v => TC_PAD.top + cH - ((v - lo) / span) * cH;

  // Build smooth bezier path (skip nulls)
  const segments = [];
  let seg = [];
  visible.forEach((p, i) => {
    if (p.pe != null) { seg.push([px(i), py(p.pe)]); }
    else if (seg.length) { segments.push(seg); seg = []; }
  });
  if (seg.length) segments.push(seg);

  // Area fill under first segment
  const firstSeg = segments[0] ?? [];
  const areaPath = firstSeg.length >= 2
    ? smoothBezier(firstSeg) + ` L ${firstSeg[firstSeg.length-1][0]},${TC_PAD.top+cH} L ${firstSeg[0][0]},${TC_PAD.top+cH} Z`
    : "";

  // X-axis: show Jan label for each year visible; every Nth otherwise
  const every = Math.max(1, Math.ceil(visible.length / (W < 480 ? 5 : 10)));
  const xLabels = [];
  visible.forEach((p, i) => {
    if (p.isJan || (i % every === 0 && !xLabels.some(l => Math.abs(l.x - px(i)) < 40)))
      xLabels.push({ x: px(i), label: p.isJan ? String(p.year) : p.label.slice(0,3) });
  });

  // Hover
  const [hovIdx, setHovIdx] = useState(null);
  const hovPt = hovIdx != null ? visible[hovIdx] : null;

  const handleMouseMove = useCallback(e => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left);
    const relX = mouseX - TC_PAD.left;
    const idx = Math.round((relX / cW) * (visible.length - 1));
    const clamped = Math.max(0, Math.min(visible.length - 1, idx));
    setHovIdx(visible[clamped]?.pe != null ? clamped : null);
  }, [cW, visible.length]);

  // Zoom
  const onWheel = useCallback(e => {
    e.preventDefault();
    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return;
    const mouseRatio = Math.max(0, Math.min(1, (e.clientX - svgRect.left - TC_PAD.left) / cW));
    const curLen  = vpEnd - vpStart + 1;
    const zoomDir = e.deltaY > 0 ? 1 : -1;
    const step    = Math.max(1, Math.round(curLen * 0.15));
    let newLen    = Math.max(12, Math.min(totalPts, curLen + zoomDir * step));
    const anchor  = vpStart + Math.round(mouseRatio * (curLen - 1));
    let newStart  = Math.round(anchor - mouseRatio * (newLen - 1));
    let newEnd    = newStart + newLen - 1;
    if (newStart < 0)        { newStart = 0; newEnd = newLen - 1; }
    if (newEnd >= totalPts)  { newEnd = totalPts - 1; newStart = newEnd - newLen + 1; }
    setViewport({ start: Math.max(0, newStart), end: newEnd });
  }, [vpStart, vpEnd, totalPts, cW]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  // Pan
  const onMouseDown = e => {
    isPanning.current = true;
    panStartX.current = e.clientX;
    panStartVP.current = { start: vpStart, end: vpEnd };
    e.preventDefault();
  };
  const onMouseMove = useCallback(e => {
    if (!isPanning.current) return;
    const dx = e.clientX - panStartX.current;
    const curLen = panStartVP.current.end - panStartVP.current.start + 1;
    const shift  = -Math.round((dx / cW) * curLen);
    let ns = panStartVP.current.start + shift;
    let ne = panStartVP.current.end   + shift;
    if (ns < 0)        { ns = 0; ne = curLen - 1; }
    if (ne >= totalPts){ ne = totalPts - 1; ns = ne - curLen + 1; }
    setViewport({ start: Math.max(0, ns), end: ne });
  }, [cW, totalPts]);
  const onMouseUp = () => { isPanning.current = false; };

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => { window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseup", onMouseUp); };
  }, [onMouseMove]);

  // Touch pan
  const touchRef = useRef(null);
  const onTouchStart = e => {
    if (e.touches.length === 1)
      touchRef.current = { x: e.touches[0].clientX, start: vpStart, end: vpEnd };
  };
  const onTouchMove = e => {
    if (!touchRef.current || e.touches.length !== 1) return;
    e.stopPropagation();
    const dx = e.touches[0].clientX - touchRef.current.x;
    const curLen = touchRef.current.end - touchRef.current.start + 1;
    const shift  = -Math.round((dx / cW) * curLen);
    let ns = touchRef.current.start + shift;
    let ne = touchRef.current.end   + shift;
    if (ns < 0)        { ns = 0; ne = curLen - 1; }
    if (ne >= totalPts){ ne = totalPts - 1; ns = ne - curLen + 1; }
    setViewport({ start: Math.max(0, ns), end: ne });
  };

  // Reference lines within visible range
  const meanInRange = peMean != null && peMean >= lo && peMean <= hi;
  const currentInRange = currentPE != null && currentPE >= lo && currentPE <= hi;

  const mono = "'IBM Plex Mono', monospace";
  const sans = "'IBM Plex Sans', sans-serif";
  const lineColor = peColor(visible.filter(p=>p.pe!=null).slice(-1)[0]?.pe);

  return (
    <div ref={wrapRef} style={{ width:"100%", userSelect:"none", position:"relative" }}>
      <svg ref={svgRef}
        width={W} height={height}
        style={{ display:"block", overflow:"visible",
          cursor: isPanning.current ? "grabbing" : "crosshair" }}
        onMouseLeave={() => { setHovIdx(null); }}
        onMouseMove={handleMouseMove}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={() => { touchRef.current = null; }}
      >
        <defs>
          <linearGradient id="tcAreaGrad2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={lineColor} stopOpacity="0.18"/>
            <stop offset="100%" stopColor={lineColor} stopOpacity="0"/>
          </linearGradient>
          <clipPath id="tcClip2">
            <rect x={TC_PAD.left} y={TC_PAD.top} width={cW} height={cH}/>
          </clipPath>
        </defs>

        {/* Valuation zone bands */}
        {lo < 22 && hi > 18 && (
          <rect x={TC_PAD.left} y={py(Math.min(22, hi))} width={cW}
            height={Math.abs(py(Math.max(18, lo)) - py(Math.min(22, hi)))}
            fill={peColor(19, 0.08)} clipPath="url(#tcClip2)"/>
        )}
        {lo < 25 && hi > 22 && (
          <rect x={TC_PAD.left} y={py(Math.min(25, hi))} width={cW}
            height={Math.abs(py(Math.max(22, lo)) - py(Math.min(25, hi)))}
            fill={peColor(23, 0.06)} clipPath="url(#tcClip2)"/>
        )}

        {/* Grid lines + Y-axis labels */}
        {ticks.map(t => (
          <g key={t}>
            <line x1={TC_PAD.left} x2={TC_PAD.left+cW} y1={py(t)} y2={py(t)}
              stroke={C.border}
              strokeDasharray={t % 5 === 0 ? "none" : "3 3"}
              strokeWidth={t % 5 === 0 ? 1 : 0.8}/>
            <text x={TC_PAD.left-6} y={py(t)+3.5} textAnchor="end"
              fontSize={9} fill={C.muted} fontFamily={mono}>{t}Ã—</text>
          </g>
        ))}

        {/* Area fill */}
        {areaPath && (
          <path d={areaPath} fill="url(#tcAreaGrad2)" clipPath="url(#tcClip2)"/>
        )}

        {/* Line */}
        {segments.map((sg, si) => (
          <path key={si} d={smoothBezier(sg)} fill="none"
            stroke={lineColor} strokeWidth={2.2}
            strokeLinecap="round" strokeLinejoin="round"
            clipPath="url(#tcClip2)"/>
        ))}

        {/* Mean reference line */}
        {meanInRange && (
          <>
            <line x1={TC_PAD.left} x2={TC_PAD.left+cW}
              y1={py(peMean)} y2={py(peMean)}
              stroke={VAL.neutral} strokeWidth={1} strokeDasharray="4 4" opacity={0.55}/>
            <text x={TC_PAD.left+cW-2} y={py(peMean)-4} textAnchor="end"
              fontSize={8} fill={VAL.neutral} fontFamily={mono} opacity={0.8}>
              Mean {peMean.toFixed(1)}Ã—
            </text>
          </>
        )}

        {/* Current PE reference line */}
        {currentInRange && (
          <>
            <line x1={TC_PAD.left} x2={TC_PAD.left+cW}
              y1={py(currentPE)} y2={py(currentPE)}
              stroke={VAL.fair} strokeWidth={1.2} strokeDasharray="5 4" opacity={0.75}/>
            <text x={TC_PAD.left+cW-2} y={py(currentPE)-4} textAnchor="end"
              fontSize={8} fill={VAL.fair} fontFamily={mono}>
              Now {currentPE}Ã—
            </text>
          </>
        )}

        {/* Hover crosshair + dot */}
        {hovPt && hovIdx != null && (
          <g>
            <line x1={px(hovIdx)} x2={px(hovIdx)} y1={TC_PAD.top} y2={TC_PAD.top+cH}
              stroke={C.borderStrong} strokeWidth={1} strokeDasharray="3 3"/>
            <circle cx={px(hovIdx)} cy={py(hovPt.pe)} r={5}
              fill={peColor(hovPt.pe)} stroke={C.bg} strokeWidth={2}/>
          </g>
        )}

        {/* X-axis labels */}
        {xLabels.map(({ x, label }, li) => (
          <text key={li} x={x} y={height - TC_PAD.bottom + 14} textAnchor="middle"
            fontSize={9} fill={C.muted} fontFamily={sans}>{label}</text>
        ))}
      </svg>

      {/* Hover tooltip â€” positioned in top-left like FiiDii */}
      {hovPt && (() => {
        const color = peColor(hovPt.pe);
        return (
          <div style={{
            position:"absolute", top:8, left: TC_PAD.left + 4,
            background: C.tooltipBg,
            border:`1px solid ${color}55`,
            borderRadius:10, padding:"8px 13px",
            pointerEvents:"none",
            boxShadow: C.tooltipShadow,
            zIndex:10, minWidth:130,
          }}>
            <div style={{fontSize:11, fontWeight:700, color:C.sub, marginBottom:5}}>
              {hovPt.label}
            </div>
            <div style={{fontSize:20, fontWeight:700, color,
              fontFamily:mono, letterSpacing:"-0.02em", lineHeight:1}}>
              {hovPt.pe.toFixed(1)}Ã—
            </div>
            <div style={{fontSize:10, color, marginTop:3}}>{peCategory(hovPt.pe)}</div>
            <div style={{fontSize:10, color:C.muted, marginTop:2}}>
              {pePercentile(hovPt.pe, allPE)}th percentile
            </div>
          </div>
        );
      })()}

      {/* Legend + zoom hint */}
      <div style={{display:"flex", alignItems:"center", gap:14,
        paddingLeft: TC_PAD.left, marginTop:4, flexWrap:"wrap"}}>
        <div style={{display:"flex", alignItems:"center", gap:5,
          fontSize:11, color:C.muted}}>
          <div style={{width:18, height:2, background:lineColor, borderRadius:1}}/>
          Nifty 50 P/E
        </div>
        <div style={{display:"flex", alignItems:"center", gap:5, fontSize:11, color:C.muted}}>
          <div style={{width:18, height:1, background:VAL.neutral,
            borderTop:`1px dashed ${VAL.neutral}`, opacity:0.7}}/>
          Mean
        </div>
        <div style={{fontSize:10, color:C.muted, marginLeft:"auto"}}>
          ðŸ–± scroll to zoom Â· drag to pan
        </div>
      </div>
    </div>
  );
}


// â”€â”€â”€ Valuation gauge (C passed as prop) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ValuationGauge({ percentile, currentPE, C, peMin = 0, peMax = 0 }) {
  return (
    <div style={{padding:"20px 0 8px"}}>
      <div style={{position:"relative"}}>
        <div style={{
          height: 12, borderRadius: 8,
          background: `linear-gradient(to right, ${VAL.cheap}, ${VAL.fair} 25%, ${VAL.neutral} 50%, ${VAL.rich} 75%, ${VAL.expensive})`,
          boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
          position: "relative",
        }}>
          <div style={{
            position:"absolute",
            left: `${percentile}%`,
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: 20, height: 20, borderRadius: "50%",
            background: peColor(currentPE),
            border: `3px solid ${C.gaugeBorder}`,
            boxShadow: `0 0 0 2px ${peColor(currentPE)}, 0 4px 12px rgba(0,0,0,0.35)`,
            zIndex: 2,
            transition: "left 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}/>
        </div>
        <div style={{display:"flex", justifyContent:"space-between", marginTop:8}}>
          {["Cheap","Fair","Neutral","Rich","Expensive"].map(l => (
            <span key={l} style={{fontSize:9, color:C.muted, fontWeight:500,
              letterSpacing:"0.06em", textTransform:"uppercase"}}>{l}</span>
          ))}
        </div>
      </div>
      <div style={{marginTop:16, display:"flex", alignItems:"center", gap:16, flexWrap:"wrap"}}>
        <div style={{
          padding:"6px 14px", borderRadius:8,
          background:peColor(currentPE, 0.10),
          border:`1px solid ${peColor(currentPE, 0.30)}`,
        }}>
          <span style={{fontSize:12, fontWeight:700, color:peColor(currentPE)}}>
            {peCategory(currentPE)}
          </span>
        </div>
        <span style={{fontSize:12, color:C.muted}}>
          <span style={{color:C.sub, fontWeight:600}}>{percentile}th percentile</span>
          {" "}of historical range
        </span>
        <span style={{fontSize:12, color:C.muted}}>
          Range: <span style={{color:C.sub, fontWeight:600}}>{peMin.toFixed(1)}Ã—</span>
          {" â€“ "}
          <span style={{color:C.sub, fontWeight:600}}>{peMax.toFixed(1)}Ã—</span>
        </span>
      </div>
    </div>
  );
}

// â”€â”€â”€ KPI Card (C passed as prop) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function KPICard({ icon, label, value, sub, accent, C, compact = false }) {
  const [hov, setHov] = useState(false);

  // â”€â”€ Compact (mobile) â€” horizontal pill: icon Â· label Â· value â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (compact) {
    return (
      <div
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 12px",
          borderRadius: 10,
          background: hov ? C.glassHov : C.glassBg,
          border: `1px solid ${hov ? C.glassBorder : C.border}`,
          transition: "all 0.15s ease",
          cursor: "default",
          flexShrink: 0,
        }}
      >
        <div style={{
          width: 22, height: 22, borderRadius: 6,
          background: `${accent}18`, border: `1px solid ${accent}30`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: accent, flexShrink: 0,
        }}>{icon}</div>
        <div style={{display:"flex", flexDirection:"column", gap:1}}>
          <span style={{fontSize:9, color:C.muted, fontWeight:600,
            letterSpacing:"0.07em", textTransform:"uppercase", lineHeight:1}}>{label}</span>
          <span style={{fontSize:14, fontWeight:700, color:C.text,
            fontFamily:"'IBM Plex Mono',monospace", letterSpacing:"-0.02em",
            lineHeight:1}}>{value}</span>
        </div>
      </div>
    );
  }

  // â”€â”€ Full card (desktop) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        borderRadius: 16, padding: "18px 20px",
        background: hov ? C.glassHov : C.glassBg,
        border: `1px solid ${hov ? C.glassBorder : C.border}`,
        backdropFilter: "blur(12px)",
        boxShadow: hov
          ? `0 8px 32px ${C.shadow}, 0 1px 0 ${C.glassBg} inset`
          : "0 4px 16px rgba(0,0,0,0.2)",
        transform: hov ? "translateY(-2px)" : "translateY(0)",
        transition: "all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
        cursor: "default", flex: "1 1 160px", minWidth: 0,
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 10,
        background: `${accent}18`, border: `1px solid ${accent}30`,
        display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 12, flexShrink: 0,
      }}>{icon}</div>
      <div style={{fontSize:11, color:C.muted, fontWeight:600,
        letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:6}}>{label}</div>
      <div style={{fontSize:22, fontWeight:700, color:C.text,
        fontFamily:"'IBM Plex Mono',monospace", letterSpacing:"-0.02em", lineHeight:1}}>{value}</div>
      {sub && <div style={{fontSize:11, color:C.muted, marginTop:6}}>{sub}</div>}
    </div>
  );
}

// â”€â”€â”€ Cell Tooltip (C passed as prop) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function CellTooltip({ pe, month, year, visible, C, allPE = [] }) {
  if (!visible || pe == null) return null;
  const color = peColor(pe);
  return (
    <div style={{
      position:"absolute", zIndex:100,
      bottom:"calc(100% + 8px)", left:"50%", transform:"translateX(-50%)",
      background:C.tooltipBg,
      border:`1px solid ${color}50`,
      borderRadius:10, padding:"10px 13px", minWidth:150,
      pointerEvents:"none",
      boxShadow:C.tooltipShadow,
      whiteSpace:"nowrap",
    }}>
      <div style={{fontSize:11, fontWeight:700, color:C.sub, marginBottom:7}}>
        {month} {year}
      </div>
      <div style={{display:"flex", flexDirection:"column", gap:4}}>
        <div style={{display:"flex", justifyContent:"space-between", gap:16}}>
          <span style={{fontSize:10, color:C.muted}}>P/E Ratio</span>
          <span style={{fontSize:12, fontWeight:700, color,
            fontFamily:"'IBM Plex Mono',monospace"}}>{pe.toFixed(1)}Ã—</span>
        </div>
        <div style={{display:"flex", justifyContent:"space-between", gap:16}}>
          <span style={{fontSize:10, color:C.muted}}>Category</span>
          <span style={{fontSize:10, fontWeight:600, color}}>{peCategoryShort(pe)}</span>
        </div>
        <div style={{display:"flex", justifyContent:"space-between", gap:16}}>
          <span style={{fontSize:10, color:C.muted}}>Percentile</span>
          <span style={{fontSize:10, fontWeight:600, color:C.sub}}>{pePercentile(pe, allPE)}th</span>
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ Heat cell (C passed as prop) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function HeatCell({ pe, month, year, C, allPE = [] }) {
  const [hov, setHov] = useState(false);
  const color = peColor(pe);
  // isDark: higher fill alpha in dark; in light use stronger fill for visibility
  const bgAlpha = pe != null ? (C.isDark ? 0.18 : 0.12) : 0.02;

  return (
    <td style={{padding:"3px 2px", position:"relative"}}>
      <div
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          position:"relative", borderRadius:10, width:"100%",
          minWidth: 52, height: 42,
          display:"flex", flexDirection:"column",
          alignItems:"center", justifyContent:"center", gap:1,
          background: pe != null
            ? peColor(pe, bgAlpha)
            : C.emptyCell,
          border: `1px solid ${pe != null ? peColor(pe, C.isDark ? 0.25 : 0.30) : C.emptyCellBorder}`,
          cursor: pe != null ? "pointer" : "default",
          transform: hov && pe != null ? "scale(1.06)" : "scale(1)",
          boxShadow: hov && pe != null ? `0 0 12px ${color}30` : "none",
          transition: "all 0.15s ease",
          boxSizing:"border-box",
        }}
      >
        {pe != null ? (
          <>
            <span style={{
              fontSize:12, fontWeight:700, color, lineHeight:1,
              fontFamily:"'IBM Plex Mono',monospace",
            }}>{pe.toFixed(1)}</span>
            <span style={{fontSize:8, color, opacity:0.65, fontWeight:500}}>
              {peCategoryShort(pe)}
            </span>
          </>
        ) : (
          <span style={{fontSize:10, color:C.emptyDash}}>â€”</span>
        )}
        <CellTooltip pe={pe} month={month} year={year} visible={hov} C={C} allPE={allPE}/>
      </div>
    </td>
  );
}

// â”€â”€â”€ Error Boundary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Catches any render error in NiftyPEHeatmap so it cannot crash sibling routes
class PEErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, message: "" }; }
  static getDerivedStateFromError(err) { return { hasError: true, message: err?.message ?? "Unknown error" }; }
  componentDidCatch(err, info) { console.error("[NiftyPEHeatmap]", err, info); }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{
        display:"flex", flexDirection:"column", alignItems:"center",
        justifyContent:"center", minHeight:240, gap:12, padding:32,
        color:"#94a3b8", fontFamily:"'IBM Plex Sans', sans-serif",
      }}>
        <div style={{fontSize:14, fontWeight:600, color:"#ef4444"}}>Failed to render P/E Heatmap</div>
        <div style={{fontSize:12, color:"#64748b"}}>{this.state.message}</div>
        <button onClick={() => this.setState({ hasError:false, message:"" })}
          style={{ padding:"6px 16px", borderRadius:8, border:"1px solid #ef444440",
            background:"#ef444415", color:"#ef4444", fontSize:12, cursor:"pointer" }}>
          Retry
        </button>
      </div>
    );
  }
}

// â”€â”€â”€ Main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function NiftyPEHeatmapInner({ T }) {
  const C = useMemo(() => buildC(T), [T]);

  // â”€â”€ Data state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [peGrid, setPeGrid]     = useState([]);   // [{ year, 1..12 }]
  const [stats, setStats]       = useState({      // derived from peGrid
    allPE:[], peMin:0, peMax:0, peMean:0, peMedian:0, currentPE:0, currentPercentile:0,
  });
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  // â”€â”€ UI state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [view, setView]         = useState("heatmap");
  const [range, setRange]       = useState("full");
  const [trendPeriod, setTrendPeriod] = useState("all");
  const [mounted, setMounted]   = useState(false);
  const containerRef            = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeYears, setActiveYears]   = useState([]);

  const isMobile = useIsMobile(640);
  const sans = "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  const mono = "'IBM Plex Mono', monospace";

  // â”€â”€ Fetch from Supabase â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchNiftyPE()
      .then(rows => {
        if (cancelled) return;
        const grid = rowsToGrid(rows);
        const s    = deriveStats(grid);
        setPeGrid(grid);
        setStats(s);
        setActiveYears(grid.map(r => r.year));
      })
      .catch(err => {
        if (!cancelled) setError(err.message ?? "Failed to load P/E data");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { setTimeout(() => setMounted(true), 60); }, []);
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen().catch(()=>{});
    else document.exitFullscreen().catch(()=>{});
  }, []);

  // Destructure stats for ergonomic use in render
  const { allPE, peMin, peMax, peMean, peMedian, currentPE, currentPercentile } = stats;

  const visibleData = useMemo(() => {
    const cutoff = range === "5y" ? new Date().getFullYear() - 5
                 : range === "10y" ? new Date().getFullYear() - 10
                 : 2015;
    return peGrid.filter(r => r.year > cutoff);
  }, [range, peGrid]);

  // Sync activeYears when range changes
  useEffect(() => {
    setActiveYears(visibleData.map(r => r.year));
  }, [range]);

  // Build flat chronological points for single-line trend chart
  const trendPoints = useMemo(() => {
    const now = new Date();
    const nowYear = now.getFullYear();
    const nowMonth = now.getMonth() + 1;
    const cutoffYear =
      trendPeriod === "1y" ? nowYear - 1 :
      trendPeriod === "3y" ? nowYear - 3 :
      trendPeriod === "5y" ? nowYear - 5 : 2015;
    const pts = [];
    for (const row of peGrid) {
      if (row.year <= cutoffYear) continue;
      for (let m = 1; m <= 12; m++) {
        if (row.year === nowYear && m > nowMonth) continue;
        pts.push({
          label:  `${MONTHS[m-1]} ${row.year}`,
          year:   row.year,
          month:  m,
          pe:     row[m] ?? null,
          isJan:  m === 1,
        });
      }
    }
    return pts;
  }, [trendPeriod, peGrid]);

  const exportCSV = useCallback(() => {
    const header = ["Year", ...MONTHS].join(",");
    const rows = peGrid.map(r =>
      [r.year, ...MONTHS.map((_,i) => r[i+1] != null ? r[i+1] : "")].join(",")
    );
    const blob = new Blob([[header, ...rows].join("\n")], {type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = "nifty50_pe_heatmap.csv"; a.click();
    URL.revokeObjectURL(url);
  }, []);

  const yearAvg = (row) => {
    const vals = MONTHS.map((_,i) => row[i+1]).filter(v => v != null);
    return vals.length ? vals.reduce((a,b) => a+b,0) / vals.length : null;
  };

  // Inline SVG icons
  const Ico = ({ d, size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d}/>
    </svg>
  );

  const ghostBtn = (active = false, accent) => { accent = accent ?? C.fair; return {
    display:"inline-flex", alignItems:"center", gap:6,
    padding:"7px 12px", borderRadius:8,
    border:`1px solid ${active ? accent+"55" : C.border}`,
    background: active ? `${accent}15` : "transparent",
    color: active ? accent : C.muted,
    fontSize:12, fontWeight: active ? 600 : 400,
    fontFamily:sans, cursor:"pointer",
    transition:"all 0.15s ease", whiteSpace:"nowrap",
  }; };

  const segBtn = (active) => ({
    height:26, padding:"0 11px", border:"none", borderRadius:6,
    background: active ? C.surface : "transparent",
    color: active ? C.text : C.muted,
    fontSize:12, fontWeight: active ? 600 : 400,
    fontFamily:sans, cursor:"pointer", transition:"all 0.12s",
  });

  return (
    <div ref={containerRef} style={{
      background: C.bg, color: C.text, fontFamily: sans,
      minHeight: "100%", overflowX: "hidden",
      opacity: mounted ? 1 : 0,
      transform: mounted ? "translateY(0)" : "translateY(6px)",
      transition: "opacity 0.35s ease, transform 0.35s ease",
      ...(isFullscreen ? {height:"100dvh", overflowY:"auto"} : {}),
    }}>
      <div style={{maxWidth:1400, margin:"0 auto", padding: isMobile ? "16px 14px 40px" : "28px 24px 48px"}}>

        {/* â”€â”€ LOADING â”€â”€ */}
        {loading && (
          <div style={{
            display:"flex", flexDirection:"column", alignItems:"center",
            justifyContent:"center", minHeight:320, gap:16,
          }}>
            <div style={{
              width:36, height:36, borderRadius:"50%",
              border:`3px solid ${C.border}`,
              borderTopColor: VAL.fair,
              animation:"pe-spin 0.7s linear infinite",
            }}/>
            <span style={{fontSize:13, color:C.muted}}>Loading valuation dataâ€¦</span>
          </div>
        )}

        {/* â”€â”€ ERROR â”€â”€ */}
        {!loading && error && (
          <div style={{
            margin:"40px auto", maxWidth:420, padding:"24px 28px",
            borderRadius:14, background:`${VAL.expensive}10`,
            border:`1px solid ${VAL.expensive}40`,
            textAlign:"center",
          }}>
            <div style={{fontSize:15, fontWeight:600, color:VAL.expensive, marginBottom:8}}>
              Failed to load P/E data
            </div>
            <div style={{fontSize:12, color:C.muted, marginBottom:16}}>{error}</div>
            <button
              onClick={() => {
                setError(null); setLoading(true);
                fetchNiftyPE()
                  .then(rows => {
                    const g = rowsToGrid(rows); const s = deriveStats(g);
                    setPeGrid(g); setStats(s); setActiveYears(g.map(r => r.year));
                  })
                  .catch(e => setError(e.message ?? "Failed to load P/E data"))
                  .finally(() => setLoading(false));
              }}
              style={{
                padding:"8px 20px", borderRadius:8,
                border:`1px solid ${VAL.expensive}50`,
                background:`${VAL.expensive}15`, color:VAL.expensive,
                fontSize:12, fontWeight:600, cursor:"pointer",
              }}>
              Retry
            </button>
          </div>
        )}

        {/* â”€â”€ MAIN CONTENT (only when data is ready) â”€â”€ */}
        {!loading && !error && peGrid.length > 0 && (<>

        {/* â”€â”€ HEADER â”€â”€ */}
        <div style={{
          display:"flex", alignItems:"flex-start", justifyContent:"space-between",
          gap: isMobile ? 12 : 24, flexWrap:"wrap",
          marginBottom: isMobile ? 16 : 32,
        }}>
          <div style={{flex: isMobile ? "1 1 100%" : "0 0 auto"}}>
            {!isMobile && (
              <div style={{
                fontSize:11, color:C.muted, fontWeight:700,
                letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:10,
              }}>
                Market Intelligence Â· Nifty 50
              </div>
            )}
            <h1 style={{
              margin:0,
              fontSize: isMobile ? 22 : 32,
              fontWeight:700, color:C.text,
              letterSpacing:"-0.03em", lineHeight:1.1,
            }}>
              Nifty 50 PE
            </h1>
            {!isMobile && (
              <p style={{margin:"8px 0 0", fontSize:14, color:C.muted}}>
                Monthly trailing P/E ratio
              </p>
            )}
          </div>

          {/* KPI cards â€” full cards on desktop, horizontal scroll pills on mobile */}
          {isMobile ? (
            <div style={{
              display:"flex", gap:8, overflowX:"auto", width:"100%",
              paddingBottom:4, scrollbarWidth:"none",
              WebkitOverflowScrolling:"touch",
            }}>
              <KPICard compact C={C} accent="#60A5FA" label="Current P/E"
                value={`${currentPE.toFixed(1)}Ã—`}
                icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}/>
              <KPICard compact C={C} accent={VAL.fair} label="Fair Value"
                value="18â€“22Ã—"
                icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}/>
              <KPICard compact C={C} accent={VAL.neutral} label="Range"
                value={`${peMin.toFixed(1)}â€“${peMax.toFixed(1)}Ã—`}
                icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="5" height="18"/><rect x="10" y="8" width="5" height="13"/><rect x="17" y="13" width="5" height="8"/></svg>}/>
              <KPICard compact C={C} accent={VAL.neutral} label="Percentile"
                value={`${currentPercentile}th`}
                icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>}/>
            </div>
          ) : (
            <div style={{display:"flex", gap:12, flexWrap:"wrap", flex:"1 1 auto", justifyContent:"flex-end"}}>
              <KPICard C={C} accent="#60A5FA" label="Current P/E"
                value={`${currentPE.toFixed(1)}Ã—`} sub={peCategory(currentPE)}
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}/>
              <KPICard C={C} accent={VAL.fair} label="Fair Value Zone"
                value="18Ã— â€“ 22Ã—" sub="Historical consensus"
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}/>
              <KPICard C={C} accent={VAL.neutral} label="Historical Range"
                value={`${peMin.toFixed(1)}Ã— â€“ ${peMax.toFixed(1)}Ã—`} sub="Since Jan 2016"
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="5" height="18"/><rect x="10" y="8" width="5" height="13"/><rect x="17" y="13" width="5" height="8"/></svg>}/>
              <KPICard C={C} accent={VAL.neutral} label="Percentile"
                value={`${currentPercentile}th`} sub="Of all monthly readings"
                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>}/>
            </div>
          )}
        </div>

        {/* â”€â”€ VALUATION GAUGE â”€â”€ */}
        <div style={{
          borderRadius:16, background:C.card,
          border:`1px solid ${C.border}`, padding:"20px 24px 16px",
          marginBottom:20, boxShadow:"0 4px 24px rgba(0,0,0,0.08)",
        }}>
          <div style={{fontSize:11, fontWeight:700, color:C.muted,
            letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:12}}>
            Valuation Spectrum
          </div>
          <ValuationGauge C={C} percentile={currentPercentile} currentPE={currentPE} peMin={peMin} peMax={peMax}/>
        </div>

        {/* â”€â”€ INSIGHTS STRIP â”€â”€ */}
        <div style={{
          display: isMobile ? "flex" : "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          flexDirection: isMobile ? "row" : undefined,
          overflowX: isMobile ? "auto" : undefined,
          scrollbarWidth: isMobile ? "none" : undefined,
          gap:10, marginBottom:20,
        }}>
          {[
            { label:"Current Market",  value:`${currentPE.toFixed(1)}Ã—`, sub:peCategory(currentPE), accent:"#60A5FA" },
            { label:"All-Time High",   value:`${peMax.toFixed(1)}Ã—`,    sub:"Historical High", accent:VAL.expensive },
            { label:"All-Time Low",    value:`${peMin.toFixed(1)}Ã—`,    sub:"Historical Low",  accent:VAL.cheap },
            { label:"Mean P/E",        value:`${peMean.toFixed(1)}Ã—`,   sub:"Since 2016",    accent:VAL.neutral },
            { label:"Median P/E",      value:`${peMedian.toFixed(1)}Ã—`, sub:"Since 2016",    accent:VAL.fair },
          ].map(item => (
            <div key={item.label} style={{
              borderRadius:12, padding: isMobile ? "10px 14px" : "14px 16px",
              background:C.card, border:`1px solid ${C.border}`,
              display:"flex", flexDirection:"column", gap: isMobile ? 5 : 8,
              flexShrink: isMobile ? 0 : undefined,
              minWidth: isMobile ? 120 : undefined,
            }}>
              <span style={{fontSize:10, color:C.muted, fontWeight:600,
                letterSpacing:"0.08em", textTransform:"uppercase"}}>{item.label}</span>
              <div style={{fontFamily:mono, fontSize: isMobile ? 16 : 20, fontWeight:700,
                color:item.accent, letterSpacing:"-0.02em", lineHeight:1}}>{item.value}</div>
              <div style={{fontSize:11, color:C.muted}}>{item.sub}</div>
            </div>
          ))}
        </div>

        {/* â”€â”€ CONTROLS â”€â”€ */}
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          flexWrap:"wrap", gap:12, marginBottom:16,
        }}>
          <div style={{display:"flex", alignItems:"center", gap:8, flexWrap:"wrap"}}>
            {/* View toggle */}
            <div style={{
              display:"flex", gap:2, background:C.surface,
              borderRadius:10, padding:3, border:`1px solid ${C.border}`,
            }}>
              {[["heatmap","Heatmap"],["trend","Trend View"]].map(([v,l]) => (
                <button key={v} onClick={() => setView(v)} style={segBtn(view === v)}>{l}</button>
              ))}
            </div>

            <div style={{width:1, height:18, background:C.border}}/>

            {/* Range */}
            <div style={{display:"flex", gap:2}}>
              {[["full","All Years"],["10y","10Y"],["5y","5Y"]].map(([v,l]) => (
                <button key={v} onClick={() => setRange(v)}
                  style={{...ghostBtn(range===v), padding:"5px 10px", fontSize:11}}>
                  {l}
                </button>
              ))}
            </div>

            {/* Trend period picker (only in trend view) */}
            {view === "trend" && (
              <>
                <div style={{width:1, height:18, background:C.border}}/>
                <div style={{display:"flex", gap:2}}>
                  {[["all","All"],["5y","5Y"],["3y","3Y"],["1y","1Y"]].map(([v,l]) => (
                    <button key={v} onClick={() => setTrendPeriod(v)}
                      style={{...ghostBtn(trendPeriod===v, "#60A5FA"), padding:"5px 10px", fontSize:11}}>
                      {l}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Actions */}
          <div style={{display:"flex", gap:8, alignItems:"center"}}>
            <button onClick={exportCSV} style={{...ghostBtn(), padding:"6px 12px"}}
              onMouseEnter={e => {e.currentTarget.style.color=C.sub; e.currentTarget.style.borderColor=C.borderStrong;}}
              onMouseLeave={e => {e.currentTarget.style.color=C.muted; e.currentTarget.style.borderColor=C.border;}}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export CSV
            </button>
            <button onClick={toggleFullscreen} title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              style={{...ghostBtn(), padding:"6px 11px"}}
              onMouseEnter={e => {e.currentTarget.style.color=C.sub;}}
              onMouseLeave={e => {e.currentTarget.style.color=C.muted;}}>
              {isFullscreen
                ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/></svg>
                : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
              }
            </button>
          </div>
        </div>

        {/* â”€â”€ HEATMAP â”€â”€ */}
        {view === "heatmap" && (
          <div style={{
            borderRadius:16, background:C.panelBg,
            border:`1px solid ${C.border}`, overflow:"hidden",
            boxShadow:"0 4px 32px rgba(0,0,0,0.25)",
          }}>
            <div style={{overflowX:"auto", scrollbarWidth:"thin",
              scrollbarColor:`${C.border} transparent`}}>
              <table style={{
                borderCollapse:"collapse", width:"100%",
                minWidth:860, fontFamily:sans,
              }}>
                <thead>
                  <tr style={{background:C.subheadBg,
                    borderBottom:`1px solid ${C.border}`}}>
                    <th style={{
                      position:"sticky", left:0, zIndex:10,
                      background:C.tableHead, padding:"12px 18px", textAlign:"left",
                      fontSize:10, fontWeight:700, color:C.muted,
                      letterSpacing:"0.1em", textTransform:"uppercase",
                      borderRight:`1px solid ${C.border}`, whiteSpace:"nowrap", minWidth:70,
                    }}>Year</th>
                    <th style={{
                      padding:"12px 10px", fontSize:10, fontWeight:700, color:C.muted,
                      letterSpacing:"0.1em", textTransform:"uppercase",
                      width:90, borderRight:`1px solid ${C.border}`,
                    }}>Trend</th>
                    {MONTHS.map(m => (
                      <th key={m} style={{
                        padding:"12px 4px", textAlign:"center",
                        fontSize:10, fontWeight:700, color:C.muted,
                        letterSpacing:"0.06em", textTransform:"uppercase", minWidth:58,
                      }}>{m}</th>
                    ))}
                    <th style={{
                      padding:"12px 14px", fontSize:10, fontWeight:700, color:C.muted,
                      letterSpacing:"0.1em", textTransform:"uppercase",
                      borderLeft:`1px solid ${C.border}`, whiteSpace:"nowrap",
                    }}>Avg</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleData.map((row, ri) => {
                    const avg = yearAvg(row);
                    const vals = MONTHS.map((_,i) => row[i+1]);
                    const isEven = ri % 2 === 0;
                    return (
                      <tr key={row.year} style={{
                        borderTop:`1px solid ${C.border}`,
                        background: isEven ? "transparent" : C.rowAlt,
                        transition:"background 0.1s",
                      }}
                        onMouseEnter={e => e.currentTarget.style.background=C.rowHov}
                        onMouseLeave={e => e.currentTarget.style.background=isEven ? "transparent" : C.rowAlt}
                      >
                        <td style={{
                          position:"sticky", left:0, zIndex:5,
                          background: isEven ? C.card : C.stickyOdd,
                          padding:"6px 18px", borderRight:`1px solid ${C.border}`,
                          whiteSpace:"nowrap",
                        }}>
                          <span style={{fontSize:13, fontWeight:700, color:C.sub,
                            fontFamily:mono, letterSpacing:"0.02em"}}>{row.year}</span>
                        </td>
                        <td style={{
                          padding:"6px 10px", borderRight:`1px solid ${C.border}`,
                          verticalAlign:"middle",
                        }}>
                          <Sparkline C={C} values={vals}
                            color={avg != null ? peColor(avg) : C.muted}
                            width={80} height={26}/>
                        </td>
                        {vals.map((pe, mi) => (
                          <HeatCell key={mi} pe={pe} month={MONTHS[mi]} year={row.year} C={C} allPE={allPE}/>
                        ))}
                        <td style={{
                          padding:"6px 14px", borderLeft:`1px solid ${C.border}`,
                          textAlign:"center", whiteSpace:"nowrap",
                        }}>
                          {avg != null ? (
                            <span style={{
                              display:"inline-block", padding:"3px 9px", borderRadius:20,
                              background:peColor(avg, 0.10), border:`1px solid ${peColor(avg, 0.28)}`,
                              fontSize:11, fontWeight:700, color:peColor(avg), fontFamily:mono,
                            }}>{avg.toFixed(1)}Ã—</span>
                          ) : (
                            <span style={{color:C.muted, fontSize:11}}>â€”</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* â”€â”€ TREND VIEW â”€â”€ */}
        {view === "trend" && (
          <div style={{
            borderRadius:16, background:C.panelBg,
            border:`1px solid ${C.border}`, padding:"20px 20px 16px",
            boxShadow:"0 4px 32px rgba(0,0,0,0.25)",
          }}>
            <div style={{
              display:"flex", alignItems:"center", justifyContent:"space-between",
              gap:12, marginBottom:16, flexWrap:"wrap",
            }}>
              <div>
                <div style={{fontSize:13, fontWeight:600, color:C.sub}}>
                  P/E Ratio â€” Continuous Timeline
                </div>
                <div style={{fontSize:11, color:C.muted, marginTop:2}}>
                  Hover for details Â· Shaded zones = Fair Value range
                </div>
              </div>
            </div>
            <TrendChart points={trendPoints} C={C} height={320} peMean={peMean} currentPE={currentPE} allPE={allPE}/>
          </div>
        )}

        {/* â”€â”€ MARKET CYCLE TIMELINE â”€â”€ */}
        <div style={{
          marginTop:20, borderRadius:16, background:C.panelBg,
          border:`1px solid ${C.border}`, padding:"20px 24px",
        }}>
          <div style={{
            fontSize:11, fontWeight:700, color:C.muted,
            letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:16,
          }}>
            Market Cycle Context
          </div>
          <div style={{display:"flex", gap:2, borderRadius:10, overflow:"hidden", marginBottom:16}}>
            {getCycles().map(cyc => (
              <div key={cyc.period} style={{
                flex:cyc.width, height:10,
                background:`${cyc.color}40`,
                borderRight:"1px solid rgba(0,0,0,0.3)",
              }}/>
            ))}
          </div>
          <div style={{display:"flex", gap:10, flexWrap:"wrap"}}>
            {getCycles().map(cyc => (
              <div key={cyc.period} style={{
                display:"flex", alignItems:"center", gap:8,
                padding:"8px 12px", borderRadius:8,
                background:C.glassBg,
                border:`1px solid ${C.border}`,
                flex:"1 1 auto", minWidth:0,
              }}>
                <div style={{width:10, height:10, borderRadius:3, background:cyc.color, flexShrink:0}}/>
                <div>
                  <div style={{fontSize:11, fontWeight:700, color:C.sub, fontFamily:mono}}>
                    {cyc.period}
                  </div>
                  <div style={{fontSize:10, color:cyc.color, marginTop:1}}>{cyc.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* â”€â”€ LEGEND â”€â”€ */}
        <div style={{
          marginTop:16, display:"flex", alignItems:"center",
          gap:16, flexWrap:"wrap", padding:"12px 0",
        }}>
          <span style={{fontSize:11, color:C.muted, fontWeight:600,
            letterSpacing:"0.08em", textTransform:"uppercase"}}>Legend</span>
          {[
            [VAL.cheap,    "< 20Ã—",  "Cheap"],
            [VAL.fair,     "20â€“22Ã—", "Fair"],
            [VAL.neutral,  "22â€“25Ã—", "Fairly Valued"],
            [VAL.rich,     "25â€“30Ã—", "Rich"],
            [VAL.expensive,"> 30Ã—",  "Expensive"],
          ].map(([color, rng2, label]) => (
            <div key={label} style={{display:"flex", alignItems:"center", gap:7}}>
              <div style={{width:22, height:22, borderRadius:6,
                background:`${color}25`, border:`1px solid ${color}50`}}/>
              <div>
                <div style={{fontSize:11, fontWeight:600, color, fontFamily:mono}}>{rng2}</div>
                <div style={{fontSize:10, color:C.muted}}>{label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* â”€â”€ DISCLAIMER â”€â”€ */}
        <div style={{
          marginTop:12, padding:"10px 14px", borderRadius:8,
          background:"rgba(245,158,11,0.06)",
          border:"1px solid rgba(245,158,11,0.15)",
          fontSize:11, color:"rgba(217,119,6,0.8)",
        }}>
          P/E data is indicative and for research purposes only. Not investment advice.
          Historical valuation does not guarantee future returns.
        </div>

        </>)}

        <style>{[
          `::-webkit-scrollbar { width:5px; height:5px; }`,
          `::-webkit-scrollbar-track { background:transparent; }`,
          `::-webkit-scrollbar-thumb { background:${C.scrollThumb}; border-radius:4px; }`,
          `::-webkit-scrollbar-thumb:hover { background:${C.scrollThumbHov}; }`,
          `.pe-pill-strip::-webkit-scrollbar { display:none; }`,
          `@keyframes pe-spin { to { transform: rotate(360deg); } }`,
        ].join("\n")}</style>
      </div>
    </div>
  );
}

export default function NiftyPEHeatmap(props) {
  return (
    <PEErrorBoundary>
      <NiftyPEHeatmapInner {...props}/>
    </PEErrorBoundary>
  );
}
