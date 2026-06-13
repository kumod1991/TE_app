// NiftyPEHeatmap.jsx  —  Premium Institutional Redesign
// Bloomberg × TradingView × Apple Finance aesthetic
// Drop-in replacement for the existing NiftyPEHeatmap component in TradeEdge.
// Props: { T }  — standard TradeEdge theme object

import { useState, useEffect, useRef, useMemo, useCallback } from "react";

// ─── Raw PE data (2016–2026) ──────────────────────────────────────────────────
// Format: { year, month(1-12): pe }
const PE_RAW = [
  { year: 2016, 1:21.2,  2:20.8,  3:21.5,  4:22.1,  5:22.9,  6:23.1,  7:23.7,  8:24.2,  9:23.8,  10:22.4, 11:21.0, 12:21.6 },
  { year: 2017, 1:22.3,  2:22.7,  3:23.4,  4:23.0,  5:23.8,  6:24.1,  7:25.2,  8:25.8,  9:26.1,  10:26.4, 11:25.9, 12:26.2 },
  { year: 2018, 1:26.8,  2:25.6,  3:24.8,  4:23.9,  5:24.3,  6:23.7,  7:24.9,  8:25.3,  9:25.8,  10:24.1, 11:23.8, 12:24.5 },
  { year: 2019, 1:25.2,  2:26.1,  3:28.4,  4:29.1,  5:27.8,  6:27.3,  7:26.9,  8:25.4,  9:26.8,  10:28.3, 11:28.9, 12:29.5 },
  { year: 2020, 1:28.7,  2:26.3,  3:19.8,  4:22.4,  5:24.6,  6:26.8,  7:30.1,  8:32.4,  9:33.1,  10:35.2, 11:37.8, 12:38.5 },
  { year: 2021, 1:39.4,  2:41.2,  3:37.8,  4:35.6,  5:33.9,  6:31.2,  7:30.4,  8:29.8,  9:28.9,  10:27.3, 11:26.1, 12:25.8 },
  { year: 2022, 1:23.9,  2:22.6,  3:21.4,  4:20.8,  5:20.2,  6:19.8,  7:21.3,  8:22.7,  9:22.4,  10:22.9, 11:23.6, 12:24.1 },
  { year: 2023, 1:22.8,  2:22.1,  3:21.9,  4:22.6,  5:23.4,  6:23.8,  7:24.5,  8:24.9,  9:25.3,  10:24.7, 11:24.2, 12:23.9 },
  { year: 2024, 1:22.4,  2:21.8,  3:22.7,  4:23.5,  5:22.9,  6:23.1,  7:23.8,  8:24.2,  9:24.6,  10:23.9, 11:22.8, 12:22.3 },
  { year: 2025, 1:21.9,  2:21.4,  3:20.8,  4:21.2,  5:21.8,  6:22.4,  7:23.1,  8:22.8,  9:22.5,  10:21.9, 11:21.5, 12:null },
  { year: 2026, 1:20.6,  2:20.1,  3:20.4,  4:20.8,  5:21.2,  6:20.2,  7:null,  8:null,  9:null,  10:null, 11:null, 12:null },
];

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ─── Design constants ─────────────────────────────────────────────────────────
const C = {
  bg:        "#0B1220",
  card:      "#111827",
  card2:     "#141E2E",
  surface:   "#1E293B",
  border:    "rgba(255,255,255,0.06)",
  borderMid: "rgba(255,255,255,0.10)",
  text:      "#F8FAFC",
  sub:       "#CBD5E1",
  muted:     "#64748B",
  // Valuation gradient stops
  cheap:     "#22C55E",
  fair:      "#84CC16",
  neutral:   "#EAB308",
  rich:      "#F97316",
  expensive: "#EF4444",
};

// Get color for a PE value
function peColor(pe, alpha = 1) {
  if (pe == null) return `rgba(255,255,255,0.03)`;
  if (pe < 20)       return alpha < 1 ? `rgba(34,197,94,${alpha})`   : C.cheap;
  if (pe < 22)       return alpha < 1 ? `rgba(132,204,22,${alpha})`  : C.fair;
  if (pe < 25)       return alpha < 1 ? `rgba(234,179,8,${alpha})`   : C.neutral;
  if (pe < 30)       return alpha < 1 ? `rgba(249,115,22,${alpha})`  : C.rich;
  return              alpha < 1 ? `rgba(239,68,68,${alpha})`   : C.expensive;
}

function peCategory(pe) {
  if (pe == null) return "—";
  if (pe < 20)  return "Historically Cheap";
  if (pe < 22)  return "Fair Value";
  if (pe < 25)  return "Fairly Valued";
  if (pe < 30)  return "Rich";
  return              "Expensive";
}

function peCategoryShort(pe) {
  if (pe == null) return "—";
  if (pe < 20)  return "Cheap";
  if (pe < 22)  return "Fair";
  if (pe < 25)  return "Fair+";
  if (pe < 30)  return "Rich";
  return              "Bubble";
}

// All non-null PE values
const ALL_PE = PE_RAW.flatMap(r => MONTHS.map((_,i) => r[i+1])).filter(v => v != null);
const PE_MIN = Math.min(...ALL_PE);  // 19.8
const PE_MAX = Math.max(...ALL_PE);  // 41.2
const PE_MEAN = ALL_PE.reduce((a,b) => a+b,0) / ALL_PE.length;
const PE_MEDIAN = (() => { const s = [...ALL_PE].sort((a,b)=>a-b); return s[Math.floor(s.length/2)]; })();
const CURRENT_PE = 20.2;

function pePercentile(pe) {
  const below = ALL_PE.filter(v => v <= pe).length;
  return Math.round((below / ALL_PE.length) * 100);
}

const CURRENT_PERCENTILE = pePercentile(CURRENT_PE);

// ─── Sparkline SVG ────────────────────────────────────────────────────────────
function Sparkline({ values, color, width = 80, height = 24 }) {
  const pts = values.filter(v => v != null);
  if (pts.length < 2) return <span style={{color: C.muted, fontSize:10}}>—</span>;
  const mn = Math.min(...pts), mx = Math.max(...pts), rng = mx - mn || 1;
  const coords = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * width;
    const y = height - ((v - mn) / rng) * (height - 4) - 2;
    return [x, y];
  });
  const poly = coords.map(p => p.join(",")).join(" ");
  const area = `0,${height} ${poly} ${width},${height}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{display:"block", overflow:"visible"}}>
      <defs>
        <linearGradient id={`sg${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#sg${color.replace("#","")})`}/>
      <polyline points={poly} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={coords[coords.length-1][0]} cy={coords[coords.length-1][1]}
        r="2.5" fill={color}/>
    </svg>
  );
}

// ─── Trend line chart (Recharts-free SVG) ─────────────────────────────────────
function TrendChart({ data, activeYears, width = 700, height = 220 }) {
  const [hov, setHov] = useState(null);
  const yearColors = ["#60A5FA","#34D399","#F59E0B","#F472B6","#A78BFA","#38BDF8","#FB7185","#4ADE80","#FACC15","#C084FC"];

  const allPts = data.flatMap(r =>
    MONTHS.map((_,i) => r[i+1]).filter(v => v != null)
  );
  if (!allPts.length) return null;
  const mn = Math.min(...allPts) - 1;
  const mx = Math.max(...allPts) + 1;
  const rng = mx - mn;

  const PAD = {l:40, r:20, t:10, b:30};
  const cW = width - PAD.l - PAD.r;
  const cH = height - PAD.t - PAD.b;

  const xOf = m => PAD.l + (m / 11) * cW;
  const yOf = v => PAD.t + cH - ((v - mn) / rng) * cH;

  const yTicks = [20, 22, 25, 30, 35, 40].filter(v => v >= mn && v <= mx);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{width:"100%", height, display:"block"}}
      onMouseLeave={() => setHov(null)}>
      {/* Grid lines */}
      {yTicks.map(v => (
        <g key={v}>
          <line x1={PAD.l} x2={width-PAD.r} y1={yOf(v)} y2={yOf(v)}
            stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
          <text x={PAD.l-6} y={yOf(v)+3.5} textAnchor="end"
            fontSize="9" fill={C.muted} fontFamily="'IBM Plex Mono',monospace">{v}×</text>
        </g>
      ))}
      {/* Zone fills */}
      <rect x={PAD.l} y={yOf(22)} width={cW} height={yOf(18)-yOf(22)}
        fill="rgba(34,197,94,0.04)" rx="0"/>
      <rect x={PAD.l} y={yOf(25)} width={cW} height={yOf(22)-yOf(25)}
        fill="rgba(132,204,22,0.04)"/>

      {/* Year lines */}
      {data.filter(r => activeYears.includes(r.year)).map((r, ri) => {
        const color = yearColors[data.findIndex(d => d.year === r.year) % yearColors.length];
        const pts = MONTHS.map((_,m) => r[m+1]).filter(v => v != null);
        const coords = pts.map((v, i) => [xOf(i), yOf(v)]);
        const poly = coords.map(p => p.join(",")).join(" ");
        return (
          <g key={r.year}>
            <polyline points={poly} fill="none" stroke={color}
              strokeWidth={hov?.year === r.year ? 2.5 : 1.5}
              strokeLinecap="round" strokeLinejoin="round"
              opacity={hov && hov.year !== r.year ? 0.25 : 0.85}
              onMouseEnter={() => setHov({year: r.year})}/>
            {/* End label */}
            {coords.length > 0 && (
              <text x={coords[coords.length-1][0]+4} y={coords[coords.length-1][1]+4}
                fontSize="8.5" fill={color} opacity="0.75"
                fontFamily="'IBM Plex Mono',monospace">{r.year}</text>
            )}
          </g>
        );
      })}

      {/* Current PE dashed line */}
      <line x1={PAD.l} x2={width-PAD.r} y1={yOf(CURRENT_PE)} y2={yOf(CURRENT_PE)}
        stroke={C.fair} strokeWidth="1.2" strokeDasharray="5,4" opacity="0.6"/>
      <text x={width-PAD.r-2} y={yOf(CURRENT_PE)-4} textAnchor="end"
        fontSize="8" fill={C.fair} fontFamily="'IBM Plex Mono',monospace">Current {CURRENT_PE}×</text>

      {/* X axis month labels */}
      {MONTHS.map((m, i) => (
        <text key={m} x={xOf(i)} y={height-PAD.b+14} textAnchor="middle"
          fontSize="8.5" fill={C.muted} fontFamily="'IBM Plex Sans',sans-serif">{m}</text>
      ))}
    </svg>
  );
}

// ─── Market Cycle Timeline ────────────────────────────────────────────────────
const CYCLES = [
  { period:"2016–2018", label:"Fair Valuation",    color:"#84CC16", width:20 },
  { period:"2019",      label:"Getting Rich",       color:"#EAB308", width:8  },
  { period:"2020",      label:"Expensive",          color:"#F97316", width:8  },
  { period:"2021",      label:"Bubble Territory",   color:"#EF4444", width:8  },
  { period:"2022",      label:"Valuation Reset",    color:"#60A5FA", width:8  },
  { period:"2023–2026", label:"Fair Valuation",     color:"#84CC16", width:20 },
];

// ─── Gauge bar ────────────────────────────────────────────────────────────────
function ValuationGauge({ percentile, currentPE }) {
  const pct = percentile / 100;
  const markerPct = `${percentile}%`;

  return (
    <div style={{padding:"20px 0 8px"}}>
      <div style={{position:"relative"}}>
        {/* Gradient bar */}
        <div style={{
          height: 12,
          borderRadius: 8,
          background: `linear-gradient(to right, ${C.cheap}, ${C.fair} 25%, ${C.neutral} 50%, ${C.rich} 75%, ${C.expensive})`,
          boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
          position: "relative",
        }}>
          {/* Current marker */}
          <div style={{
            position:"absolute",
            left: markerPct,
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: peColor(currentPE),
            border: "3px solid #0B1220",
            boxShadow: `0 0 0 2px ${peColor(currentPE)}, 0 4px 12px rgba(0,0,0,0.5)`,
            zIndex: 2,
            transition: "left 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}/>
        </div>

        {/* Zone labels */}
        <div style={{display:"flex", justifyContent:"space-between", marginTop:8}}>
          {["Cheap","Fair","Neutral","Rich","Expensive"].map((l,i) => (
            <span key={l} style={{fontSize:9, color:C.muted, fontWeight:500,
              letterSpacing:"0.06em", textTransform:"uppercase"}}>{l}</span>
          ))}
        </div>
      </div>

      <div style={{marginTop:16, display:"flex", alignItems:"center", gap:16, flexWrap:"wrap"}}>
        <div style={{
          padding:"6px 14px",
          borderRadius:8,
          background:`${peColor(currentPE)}18`,
          border:`1px solid ${peColor(currentPE)}40`,
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
          Historical range: <span style={{color:C.sub, fontWeight:600}}>{PE_MIN.toFixed(1)}×</span>
          {" – "}
          <span style={{color:C.sub, fontWeight:600}}>{PE_MAX.toFixed(1)}×</span>
        </span>
      </div>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KPICard({ icon, label, value, sub, accent }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        borderRadius: 16,
        padding: "18px 20px",
        background: hov
          ? "rgba(255,255,255,0.055)"
          : "rgba(255,255,255,0.03)",
        border: `1px solid ${hov ? "rgba(255,255,255,0.12)" : C.border}`,
        backdropFilter: "blur(12px)",
        boxShadow: hov
          ? "0 8px 32px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.06) inset"
          : "0 4px 16px rgba(0,0,0,0.2)",
        transform: hov ? "translateY(-2px)" : "translateY(0)",
        transition: "all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
        cursor: "default",
        flex: "1 1 160px",
        minWidth: 0,
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 10,
        background: `${accent}18`,
        border: `1px solid ${accent}30`,
        display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 12, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{fontSize:11, color:C.muted, fontWeight:600,
        letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:6}}>{label}</div>
      <div style={{fontSize:22, fontWeight:700, color:C.text,
        fontFamily:"'IBM Plex Mono',monospace", letterSpacing:"-0.02em", lineHeight:1}}>{value}</div>
      {sub && <div style={{fontSize:11, color:C.muted, marginTop:6}}>{sub}</div>}
    </div>
  );
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────
function CellTooltip({ pe, month, year, visible }) {
  if (!visible || pe == null) return null;
  const pct = pePercentile(pe);
  const color = peColor(pe);
  return (
    <div style={{
      position:"absolute", zIndex:100,
      bottom:"calc(100% + 8px)", left:"50%", transform:"translateX(-50%)",
      background:"#0D1B2A",
      border:`1px solid ${color}50`,
      borderRadius:10,
      padding:"10px 13px",
      minWidth:150,
      pointerEvents:"none",
      boxShadow:`0 8px 24px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)`,
      whiteSpace:"nowrap",
    }}>
      <div style={{fontSize:11, fontWeight:700, color:C.sub, marginBottom:7}}>
        {month} {year}
      </div>
      <div style={{display:"flex", flexDirection:"column", gap:4}}>
        <div style={{display:"flex", justifyContent:"space-between", gap:16}}>
          <span style={{fontSize:10, color:C.muted}}>P/E Ratio</span>
          <span style={{fontSize:12, fontWeight:700, color:color,
            fontFamily:"'IBM Plex Mono',monospace"}}>{pe.toFixed(1)}×</span>
        </div>
        <div style={{display:"flex", justifyContent:"space-between", gap:16}}>
          <span style={{fontSize:10, color:C.muted}}>Category</span>
          <span style={{fontSize:10, fontWeight:600, color:color}}>{peCategoryShort(pe)}</span>
        </div>
        <div style={{display:"flex", justifyContent:"space-between", gap:16}}>
          <span style={{fontSize:10, color:C.muted}}>Percentile</span>
          <span style={{fontSize:10, fontWeight:600, color:C.sub}}>{pct}th</span>
        </div>
      </div>
    </div>
  );
}

// ─── Heatmap cell ─────────────────────────────────────────────────────────────
function HeatCell({ pe, month, year }) {
  const [hov, setHov] = useState(false);
  const color = peColor(pe);
  const bgAlpha = pe != null ? 0.18 : 0.02;

  return (
    <td style={{padding:"3px 2px", position:"relative"}}>
      <div
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          position:"relative",
          borderRadius:10,
          width:"100%",
          minWidth: 52,
          height: 42,
          display:"flex",
          flexDirection:"column",
          alignItems:"center",
          justifyContent:"center",
          gap:1,
          background: pe != null ? `${color}${Math.round(bgAlpha*255).toString(16).padStart(2,"0")}` : "rgba(255,255,255,0.02)",
          border: `1px solid ${pe != null ? color+"28" : "rgba(255,255,255,0.04)"}`,
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
            <span style={{fontSize:8, color:color, opacity:0.65, fontWeight:500}}>{peCategoryShort(pe)}</span>
          </>
        ) : (
          <span style={{fontSize:10, color:"rgba(255,255,255,0.12)"}}>—</span>
        )}
        <CellTooltip pe={pe} month={month} year={year} visible={hov}/>
      </div>
    </td>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function NiftyPEHeatmap({ T }) {
  const [view, setView] = useState("heatmap"); // "heatmap" | "trend"
  const [range, setRange] = useState("full");  // "5y" | "10y" | "full"
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const sans = "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  const mono = "'IBM Plex Mono', monospace";

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

  // Filter data by range
  const visibleData = useMemo(() => {
    const now = new Date();
    const cutoff = range === "5y" ? now.getFullYear() - 5
                 : range === "10y" ? now.getFullYear() - 10
                 : 2015;
    return PE_RAW.filter(r => r.year > cutoff);
  }, [range]);

  // All years for trend view
  const allYears = visibleData.map(r => r.year);
  const [activeYears, setActiveYears] = useState(allYears);
  useEffect(() => setActiveYears(allYears), [range]);

  // Export CSV
  const exportCSV = useCallback(() => {
    const header = ["Year", ...MONTHS].join(",");
    const rows = PE_RAW.map(r =>
      [r.year, ...MONTHS.map((_,i) => r[i+1] != null ? r[i+1] : "")].join(",")
    );
    const blob = new Blob([[header, ...rows].join("\n")], {type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = "nifty50_pe_heatmap.csv"; a.click();
    URL.revokeObjectURL(url);
  }, []);

  // Year average
  const yearAvg = (row) => {
    const vals = MONTHS.map((_,i) => row[i+1]).filter(v => v != null);
    if (!vals.length) return null;
    return vals.reduce((a,b) => a+b,0) / vals.length;
  };

  // Icons (inline SVG)
  const icons = {
    pe:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    zone: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
    hist: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="5" height="18"/><rect x="10" y="8" width="5" height="13"/><rect x="17" y="13" width="5" height="8"/></svg>,
    pct:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>,
    high: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>,
    low:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
    mean: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><path d="M7 8l-4 4 4 4"/></svg>,
    full: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>,
    exit: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/></svg>,
    csv:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  };

  // Ghost btn style
  const ghostBtn = (active = false, accent = C.fair) => ({
    display:"inline-flex", alignItems:"center", gap:6,
    padding:"7px 12px",
    borderRadius:8,
    border:`1px solid ${active ? accent+"55" : C.border}`,
    background: active ? `${accent}12` : "rgba(255,255,255,0.03)",
    color: active ? accent : C.muted,
    fontSize:12, fontWeight: active ? 600 : 400,
    fontFamily:sans, cursor:"pointer",
    transition:"all 0.15s ease",
    whiteSpace:"nowrap",
  });

  const segBtn = (active) => ({
    height:26, padding:"0 11px",
    border:"none",
    borderRadius:6,
    background: active ? "rgba(255,255,255,0.10)" : "transparent",
    color: active ? C.text : C.muted,
    fontSize:12, fontWeight: active ? 600 : 400,
    fontFamily:sans, cursor:"pointer",
    transition:"all 0.12s",
  });

  return (
    <div ref={containerRef} style={{
      background: C.bg,
      color: C.text,
      fontFamily: sans,
      minHeight: "100%",
      overflowX: "hidden",
      opacity: mounted ? 1 : 0,
      transform: mounted ? "translateY(0)" : "translateY(6px)",
      transition: "opacity 0.35s ease, transform 0.35s ease",
      ...(isFullscreen ? {height:"100dvh", overflowY:"auto"} : {}),
    }}>
      <div style={{maxWidth:1400, margin:"0 auto", padding:"28px 24px 48px"}}>

        {/* ── HEADER ─────────────────────────────────────────────────── */}
        <div style={{
          display:"flex", alignItems:"flex-start", justifyContent:"space-between",
          gap:24, flexWrap:"wrap", marginBottom:32,
        }}>
          {/* Left: Title */}
          <div>
            <div style={{
              fontSize:11, color:C.muted, fontWeight:700, letterSpacing:"0.12em",
              textTransform:"uppercase", marginBottom:10,
            }}>
              Market Intelligence · Nifty 50
            </div>
            <h1 style={{
              margin:0, fontSize:32, fontWeight:700, color:C.text,
              letterSpacing:"-0.03em", lineHeight:1.1,
            }}>
              Nifty 50 Valuation History
            </h1>
            <p style={{
              margin:"8px 0 0", fontSize:14, color:C.muted, fontWeight:400,
            }}>
              Monthly trailing P/E ratio since 2016 · Updated monthly
            </p>
          </div>

          {/* Right: KPI cards */}
          <div style={{display:"flex", gap:12, flexWrap:"wrap", flex:"1 1 auto", justifyContent:"flex-end"}}>
            <KPICard
              icon={<span style={{color:"#60A5FA"}}>{icons.pe}</span>}
              label="Current P/E"
              value={`${CURRENT_PE}×`}
              sub={peCategory(CURRENT_PE)}
              accent="#60A5FA"
            />
            <KPICard
              icon={<span style={{color:C.fair}}>{icons.zone}</span>}
              label="Fair Value Zone"
              value="18× – 22×"
              sub="Historical consensus"
              accent={C.fair}
            />
            <KPICard
              icon={<span style={{color:C.muted}}>{icons.hist}</span>}
              label="Historical Range"
              value={`${PE_MIN.toFixed(1)}× – ${PE_MAX.toFixed(1)}×`}
              sub="Since Jan 2016"
              accent={C.neutral}
            />
            <KPICard
              icon={<span style={{color:C.neutral}}>{icons.pct}</span>}
              label="Percentile"
              value={`${CURRENT_PERCENTILE}th`}
              sub="Of all monthly readings"
              accent={C.neutral}
            />
          </div>
        </div>

        {/* ── VALUATION GAUGE ────────────────────────────────────────── */}
        <div style={{
          borderRadius:16,
          background:"rgba(255,255,255,0.025)",
          border:`1px solid ${C.border}`,
          padding:"20px 24px 16px",
          marginBottom:20,
          boxShadow:"0 4px 24px rgba(0,0,0,0.2)",
        }}>
          <div style={{
            fontSize:11, fontWeight:700, color:C.muted,
            letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:12,
          }}>
            Valuation Spectrum
          </div>
          <ValuationGauge percentile={CURRENT_PERCENTILE} currentPE={CURRENT_PE}/>
        </div>

        {/* ── INSIGHTS STRIP ─────────────────────────────────────────── */}
        <div style={{
          display:"grid",
          gridTemplateColumns:"repeat(auto-fit, minmax(160px, 1fr))",
          gap:10,
          marginBottom:20,
        }}>
          {[
            { icon: icons.pe,   label:"Current Market",  value:`${CURRENT_PE}×`,         sub:"Fairly Valued", accent:"#60A5FA" },
            { icon: icons.high, label:"All-Time High",    value:`${PE_MAX.toFixed(1)}×`,  sub:"Feb 2021",      accent:C.expensive },
            { icon: icons.low,  label:"All-Time Low",     value:`${PE_MIN.toFixed(1)}×`,  sub:"Jun 2020",      accent:C.cheap },
            { icon: icons.mean, label:"Mean P/E",         value:`${PE_MEAN.toFixed(1)}×`, sub:"Since 2016",    accent:C.neutral },
            { icon: icons.mean, label:"Median P/E",       value:`${PE_MEDIAN.toFixed(1)}×`,sub:"Since 2016",   accent:C.fair },
          ].map(item => (
            <div key={item.label} style={{
              borderRadius:12,
              padding:"14px 16px",
              background:"rgba(255,255,255,0.025)",
              border:`1px solid ${C.border}`,
              display:"flex", flexDirection:"column", gap:8,
            }}>
              <div style={{display:"flex", alignItems:"center", gap:8}}>
                <div style={{
                  width:26, height:26, borderRadius:7,
                  background:`${item.accent}15`,
                  border:`1px solid ${item.accent}25`,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  color:item.accent, flexShrink:0,
                }}>{item.icon}</div>
                <span style={{fontSize:10, color:C.muted, fontWeight:600,
                  letterSpacing:"0.08em", textTransform:"uppercase"}}>{item.label}</span>
              </div>
              <div style={{fontFamily:mono, fontSize:20, fontWeight:700,
                color:item.accent, letterSpacing:"-0.02em", lineHeight:1}}>{item.value}</div>
              <div style={{fontSize:11, color:C.muted}}>{item.sub}</div>
            </div>
          ))}
        </div>

        {/* ── CONTROLS ───────────────────────────────────────────────── */}
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          flexWrap:"wrap", gap:12, marginBottom:16,
        }}>
          {/* Left: View toggle + Range */}
          <div style={{display:"flex", alignItems:"center", gap:8, flexWrap:"wrap"}}>
            {/* View toggle */}
            <div style={{
              display:"flex", gap:2,
              background:"rgba(255,255,255,0.04)",
              borderRadius:10, padding:3,
              border:`1px solid ${C.border}`,
            }}>
              {[["heatmap","Heatmap"],["trend","Trend View"]].map(([v,l]) => (
                <button key={v} onClick={() => setView(v)} style={segBtn(view === v)}>{l}</button>
              ))}
            </div>

            {/* Divider */}
            <div style={{width:1, height:18, background:C.border}}/>

            {/* Range filter */}
            <div style={{display:"flex", gap:2}}>
              {[["full","All Years"],["10y","10Y"],["5y","5Y"]].map(([v,l]) => (
                <button key={v} onClick={() => setRange(v)}
                  style={{...ghostBtn(range===v), padding:"5px 10px", fontSize:11}}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Right: actions */}
          <div style={{display:"flex", gap:8, alignItems:"center"}}>
            <button onClick={exportCSV}
              style={{...ghostBtn(false), padding:"6px 12px"}}
              onMouseEnter={e => {e.currentTarget.style.color=C.sub; e.currentTarget.style.borderColor="rgba(255,255,255,0.15)";}}
              onMouseLeave={e => {e.currentTarget.style.color=C.muted; e.currentTarget.style.borderColor=C.border;}}>
              {icons.csv} Export CSV
            </button>
            <button onClick={toggleFullscreen}
              style={{...ghostBtn(false), padding:"6px 11px"}}
              onMouseEnter={e => {e.currentTarget.style.color=C.sub;}}
              onMouseLeave={e => {e.currentTarget.style.color=C.muted;}}
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}>
              {isFullscreen ? icons.exit : icons.full}
            </button>
          </div>
        </div>

        {/* ── HEATMAP ────────────────────────────────────────────────── */}
        {view === "heatmap" && (
          <div style={{
            borderRadius:16,
            background:"rgba(255,255,255,0.02)",
            border:`1px solid ${C.border}`,
            overflow:"hidden",
            boxShadow:"0 4px 32px rgba(0,0,0,0.25)",
          }}>
            <div style={{
              overflowX:"auto",
              scrollbarWidth:"thin",
              scrollbarColor:`${C.border} transparent`,
            }}>
              <table style={{
                borderCollapse:"collapse",
                width:"100%",
                minWidth:860,
                fontFamily:sans,
              }}>
                <thead>
                  <tr style={{
                    background:"rgba(255,255,255,0.03)",
                    borderBottom:`1px solid ${C.border}`,
                  }}>
                    {/* Year column */}
                    <th style={{
                      position:"sticky", left:0, zIndex:10,
                      background:"#111827",
                      padding:"12px 18px",
                      textAlign:"left",
                      fontSize:10, fontWeight:700, color:C.muted,
                      letterSpacing:"0.1em", textTransform:"uppercase",
                      borderRight:`1px solid ${C.border}`,
                      whiteSpace:"nowrap",
                      minWidth:70,
                    }}>Year</th>

                    {/* Sparkline column */}
                    <th style={{
                      padding:"12px 10px",
                      fontSize:10, fontWeight:700, color:C.muted,
                      letterSpacing:"0.1em", textTransform:"uppercase",
                      width:90,
                      borderRight:`1px solid ${C.border}`,
                    }}>Trend</th>

                    {/* Month columns */}
                    {MONTHS.map(m => (
                      <th key={m} style={{
                        padding:"12px 4px",
                        textAlign:"center",
                        fontSize:10, fontWeight:700, color:C.muted,
                        letterSpacing:"0.06em", textTransform:"uppercase",
                        minWidth:58,
                      }}>{m}</th>
                    ))}

                    {/* Avg column */}
                    <th style={{
                      padding:"12px 14px",
                      fontSize:10, fontWeight:700, color:C.muted,
                      letterSpacing:"0.1em", textTransform:"uppercase",
                      borderLeft:`1px solid ${C.border}`,
                      whiteSpace:"nowrap",
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
                        background: isEven ? "transparent" : "rgba(255,255,255,0.012)",
                        transition:"background 0.1s",
                      }}
                        onMouseEnter={e => e.currentTarget.style.background="rgba(255,255,255,0.025)"}
                        onMouseLeave={e => e.currentTarget.style.background=isEven ? "transparent" : "rgba(255,255,255,0.012)"}
                      >
                        {/* Year cell */}
                        <td style={{
                          position:"sticky", left:0, zIndex:5,
                          background: isEven ? C.card : "#131d2f",
                          padding:"6px 18px",
                          borderRight:`1px solid ${C.border}`,
                          whiteSpace:"nowrap",
                        }}>
                          <span style={{
                            fontSize:13, fontWeight:700, color:C.sub,
                            fontFamily:mono, letterSpacing:"0.02em",
                          }}>{row.year}</span>
                        </td>

                        {/* Sparkline */}
                        <td style={{
                          padding:"6px 10px",
                          borderRight:`1px solid ${C.border}`,
                          verticalAlign:"middle",
                        }}>
                          <Sparkline
                            values={vals}
                            color={avg != null ? peColor(avg) : C.muted}
                            width={80} height={26}
                          />
                        </td>

                        {/* Month cells */}
                        {vals.map((pe, mi) => (
                          <HeatCell key={mi} pe={pe} month={MONTHS[mi]} year={row.year}/>
                        ))}

                        {/* Avg badge */}
                        <td style={{
                          padding:"6px 14px",
                          borderLeft:`1px solid ${C.border}`,
                          textAlign:"center",
                          whiteSpace:"nowrap",
                        }}>
                          {avg != null ? (
                            <span style={{
                              display:"inline-block",
                              padding:"3px 9px",
                              borderRadius:20,
                              background:`${peColor(avg)}18`,
                              border:`1px solid ${peColor(avg)}35`,
                              fontSize:11, fontWeight:700,
                              color:peColor(avg),
                              fontFamily:mono,
                            }}>{avg.toFixed(1)}×</span>
                          ) : (
                            <span style={{color:C.muted, fontSize:11}}>—</span>
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

        {/* ── TREND VIEW ─────────────────────────────────────────────── */}
        {view === "trend" && (
          <div style={{
            borderRadius:16,
            background:"rgba(255,255,255,0.02)",
            border:`1px solid ${C.border}`,
            padding:"20px 20px 16px",
            boxShadow:"0 4px 32px rgba(0,0,0,0.25)",
          }}>
            <div style={{
              display:"flex", alignItems:"center", justifyContent:"space-between",
              gap:12, marginBottom:16, flexWrap:"wrap",
            }}>
              <div>
                <div style={{fontSize:13, fontWeight:600, color:C.sub}}>Monthly P/E by Year</div>
                <div style={{fontSize:11, color:C.muted, marginTop:2}}>
                  Hover to highlight a year · Jan – Dec trajectory
                </div>
              </div>
              {/* Year toggles */}
              <div style={{display:"flex", gap:5, flexWrap:"wrap"}}>
                {allYears.map((y, yi) => {
                  const colors = ["#60A5FA","#34D399","#F59E0B","#F472B6","#A78BFA","#38BDF8","#FB7185","#4ADE80","#FACC15","#C084FC"];
                  const color = colors[yi % colors.length];
                  const active = activeYears.includes(y);
                  return (
                    <button key={y}
                      onClick={() => setActiveYears(prev =>
                        prev.includes(y) ? prev.filter(p => p !== y) : [...prev, y]
                      )}
                      style={{
                        padding:"3px 10px", borderRadius:6, border:`1px solid ${active ? color+"55" : C.border}`,
                        background: active ? `${color}15` : "transparent",
                        color: active ? color : C.muted,
                        fontSize:11, fontWeight: active ? 600 : 400,
                        fontFamily:mono, cursor:"pointer", transition:"all 0.12s",
                      }}>
                      {y}
                    </button>
                  );
                })}
              </div>
            </div>
            <TrendChart data={visibleData} activeYears={activeYears}/>
          </div>
        )}

        {/* ── MARKET CYCLE TIMELINE ──────────────────────────────────── */}
        <div style={{
          marginTop:20,
          borderRadius:16,
          background:"rgba(255,255,255,0.02)",
          border:`1px solid ${C.border}`,
          padding:"20px 24px",
        }}>
          <div style={{
            fontSize:11, fontWeight:700, color:C.muted,
            letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:16,
          }}>
            Market Cycle Context
          </div>
          <div style={{display:"flex", gap:2, borderRadius:10, overflow:"hidden", marginBottom:16}}>
            {CYCLES.map(cyc => (
              <div key={cyc.period} style={{
                flex:cyc.width,
                height:10,
                background:`${cyc.color}40`,
                borderRight:`1px solid rgba(0,0,0,0.3)`,
                position:"relative",
              }}/>
            ))}
          </div>
          <div style={{display:"flex", gap:10, flexWrap:"wrap"}}>
            {CYCLES.map(cyc => (
              <div key={cyc.period} style={{
                display:"flex", alignItems:"center", gap:8,
                padding:"8px 12px",
                borderRadius:8,
                background:"rgba(255,255,255,0.025)",
                border:`1px solid ${C.border}`,
                flex:"1 1 auto", minWidth:0,
              }}>
                <div style={{width:10, height:10, borderRadius:3, background:cyc.color, flexShrink:0}}/>
                <div>
                  <div style={{fontSize:11, fontWeight:700, color:C.sub,
                    fontFamily:mono}}>{cyc.period}</div>
                  <div style={{fontSize:10, color:cyc.color, marginTop:1}}>{cyc.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── COLOR LEGEND ───────────────────────────────────────────── */}
        <div style={{
          marginTop:16,
          display:"flex", alignItems:"center", gap:16, flexWrap:"wrap",
          padding:"12px 0",
        }}>
          <span style={{fontSize:11, color:C.muted, fontWeight:600,
            letterSpacing:"0.08em", textTransform:"uppercase"}}>Legend</span>
          {[
            [C.cheap,    "< 20×",  "Cheap"],
            [C.fair,     "20–22×", "Fair"],
            [C.neutral,  "22–25×", "Fairly Valued"],
            [C.rich,     "25–30×", "Rich"],
            [C.expensive,"> 30×",  "Expensive"],
          ].map(([color, range2, label]) => (
            <div key={label} style={{display:"flex", alignItems:"center", gap:7}}>
              <div style={{width:22, height:22, borderRadius:6,
                background:`${color}25`, border:`1px solid ${color}50`}}/>
              <div>
                <div style={{fontSize:11, fontWeight:600, color, fontFamily:mono}}>{range2}</div>
                <div style={{fontSize:10, color:C.muted}}>{label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── DISCLAIMER ─────────────────────────────────────────────── */}
        <div style={{
          marginTop:12,
          padding:"10px 14px",
          borderRadius:8,
          background:"rgba(245,158,11,0.06)",
          border:"1px solid rgba(245,158,11,0.15)",
          fontSize:11, color:"#92400e",
          color:"rgba(217,119,6,0.8)",
        }}>
          P/E data is indicative and for research purposes only. Not investment advice.
          Historical valuation does not guarantee future returns.
        </div>
      </div>

      {/* Global keyframes */}
      <style>{`
        @keyframes pe-fadein { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.10); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.18); }
      `}</style>
    </div>
  );
}
