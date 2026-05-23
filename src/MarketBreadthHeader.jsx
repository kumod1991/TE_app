import { useState, useEffect, useRef, useCallback } from "react";

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
//  MARKET BREADTH HEADER v7 Ã¢â‚¬â€ Mobile-First Swipeable Interface
//
//  MOBILE layout (< 768 px):
//    Full-screen pager Ã¢â‚¬â€ swipe left/right between pages:
//      Page 0 Ã¢â‚¬â€ Full regime header (banner + signals + score + metrics)
//      Page 1 Ã¢â‚¬â€ % Above SMA-20  +  % Above SMA-50
//      Page 2 Ã¢â‚¬â€ % Above SMA-150 +  % Above SMA-200
//      Page 3 Ã¢â‚¬â€ % Near 52W High +  % Near 52W Low
//
//  DESKTOP layout (Ã¢â€°Â¥ 768 px):
//    Unchanged v6 header (charts rendered below by parent).
//
//  New props (optional Ã¢â‚¬â€œ only needed for mobile chart pages):
//    chartData         Ã¢â‚¬â€ array of breadth rows (same as `data` in parent)
//    chartConfigs      Ã¢â‚¬â€ CHART_CONFIGS array from parent
//    capColMap         Ã¢â‚¬â€ CAP_COL_MAP from parent
//    capSegments       Ã¢â‚¬â€ CAP_SEGMENTS array from parent
//    chartSegs         Ã¢â‚¬â€ state object from parent
//    onToggleSeg       Ã¢â‚¬â€ toggleSeg function from parent
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

const clamp = (v, mn, mx) => Math.min(mx, Math.max(mn, v));
const fmt1  = (v) => (v == null ? "-" : Number(v).toFixed(1));
const sans  = "'IBM Plex Sans', system-ui, sans-serif";
const mono  = "'IBM Plex Mono', 'Roboto Mono', monospace";

// Ã¢â€â‚¬Ã¢â€â‚¬ 5-tier colour system Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const SEV = {
  critical:  "#b91c1c",
  weak:      "#d94444",
  neutral:   "#64748b",
  improving: "#84cc16",
  strong:    "#10b981",
};

// Ã¢â€â‚¬Ã¢â€â‚¬ Breadth Score Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function computeScore(row) {
  if (!row) return null;
  const s200 = clamp((row.above_sma200  / 100) * 35,  0, 35);
  const s50  = clamp((row.above_sma50   / 100) * 25,  0, 25);
  const s150 = clamp((row.above_sma150  / 100) * 15,  0, 15);
  const s20  = clamp((row.above_sma20   / 100) * 10,  0, 10);
  const sHi  = clamp((row.near_52w_high / 100) * 7.5, 0, 7.5);
  const sLo  = clamp((row.near_52w_low  / 100) * 7.5, 0, 7.5);
  return clamp(Math.round((s200 + s50 + s150 + s20 + sHi - sLo) * (100 / 92.5)), 0, 100);
}

function getScoreZone(score) {
  if (score >= 75) return { zone: "Top 10% historically",      color: SEV.strong,    extreme: false };
  if (score >= 60) return { zone: "Above average breadth",     color: SEV.strong,    extreme: false };
  if (score >= 45) return { zone: "Average range",             color: SEV.neutral,   extreme: false };
  if (score >= 30) return { zone: "Below average breadth",     color: SEV.improving, extreme: false };
  if (score >= 20) return { zone: "Bottom 15% historically",   color: SEV.weak,      extreme: false };
  if (score >= 10) return { zone: "Bottom 5% historically",    color: SEV.weak,      extreme: true  };
  return                  { zone: "Extreme Capitulation Zone", color: SEV.critical,  extreme: true  };
}

function getRegimeZone(score) {
  if (score >= 70) return { label: "Expansion / Bullish",  color: SEV.strong    };
  if (score >= 50) return { label: "Neutral / Transition", color: SEV.neutral   };
  if (score >= 30) return { label: "Weak / Distribution",  color: SEV.improving };
  return                  { label: "Capitulation / Panic", color: SEV.critical  };
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Weighted Momentum Engine Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function computeMomentum(latestRow, prevRow, fiveDayRows, score) {
  if (!latestRow || !prevRow) return null;

  const wd1 = (key, w) => ((latestRow[key] ?? 0) - (prevRow[key] ?? 0)) * w;
  const w1d =
    wd1("above_sma200", 0.35) + wd1("above_sma50", 0.25) +
    wd1("above_sma150", 0.15) + wd1("above_sma20", 0.10) +
    wd1("near_52w_high", 0.075) - wd1("near_52w_low", 0.075);

  const oldest = fiveDayRows?.[0];
  const wd5 = oldest ? (key, w) => ((latestRow[key] ?? 0) - (oldest[key] ?? 0)) * w : null;
  const w5d = oldest
    ? wd5("above_sma200", 0.35) + wd5("above_sma50", 0.25) +
      wd5("above_sma150", 0.15) + wd5("above_sma20", 0.10) +
      wd5("near_52w_high", 0.075) - wd5("near_52w_low", 0.075)
    : null;

  const stDelta = (latestRow.above_sma20  ?? 0) - (prevRow.above_sma20  ?? 0);
  const ltDelta = (latestRow.above_sma200 ?? 0) - (prevRow.above_sma200 ?? 0);
  const stLeads = stDelta > 0 && ltDelta <= 0;
  const bothUp  = stDelta > 0 && ltDelta > 0;

  let label, color, icon, structureNote;

  if (score < 30) {
    if (w1d > 1.5)       { label = "Weak Bounce";           color = SEV.improving; icon = "\u2191"; }
    else if (w1d > 0)    { label = "Weak Bounce";           color = SEV.improving; icon = "\u2197"; }
    else if (w1d >= -0.5){ label = "Stalling";              color = SEV.weak;      icon = "\u2192"; }
    else                 { label = "Accelerating Weakness"; color = SEV.critical;  icon = "\u2193"; }
    structureNote = stLeads
      ? "Short-term breadth (20 DMA) ticking up, but 200 DMA still deeply negative - not structural."
      : bothUp
      ? "Slight improvement across timeframes - still well within capitulation territory."
      : "No evidence of institutional accumulation. Structural decline continues.";
  } else if (score <= 60) {
    if (w1d > 2 && (w5d ?? 0) > 0) { label = "Improving";     color = SEV.strong;    icon = "\u2191"; }
    else if (w1d > 0)               { label = "Recovering";    color = SEV.improving; icon = "\u2197"; }
    else if (w1d >= -0.5)           { label = "Stalling";      color = SEV.improving; icon = "\u2192"; }
    else if ((w5d ?? 0) < -3)       { label = "Deteriorating"; color = SEV.weak;      icon = "\u2193"; }
    else                            { label = "Weakening";     color = SEV.weak;      icon = "\u2193"; }
    structureNote = stLeads
      ? "Short-term momentum recovering but long-term breadth (200 DMA) still lagging."
      : bothUp
      ? "Broad improvement across timeframes - watch for follow-through above 50% thresholds."
      : "Breadth contracting across timeframes. No confirmed reversal signal.";
  } else {
    if (w1d > 1.5)       { label = "Strong Expansion"; color = SEV.strong;    icon = "\u2191";  }
    else if (w1d > 0)    { label = "Expanding";        color = SEV.strong;    icon = "\u2197";  }
    else if (w1d >= -0.5){ label = "Pullback";         color = SEV.improving; icon = "\u2192"; }
    else                 { label = "Correcting";       color = SEV.weak;      icon = "\u2193"; }
    structureNote = "Broad participation confirmed across timeframes. Long-term structure supports the uptrend.";
  }

  const regimeAlignment =
    score < 30  ? { label: "Counter-trend (Bearish)",  color: SEV.critical  } :
    score <= 60 ? { label: "Transitional",             color: SEV.improving } :
                  { label: "Trend-aligned (Bullish)",  color: SEV.strong    };

  const signalQuality =
    score < 30  ? { label: "Low Confidence",    color: SEV.critical  } :
    score <= 60 ? { label: "Medium Confidence", color: SEV.improving } :
                  { label: "High Confidence",   color: SEV.strong    };

  return {
    label, color, icon, structureNote, regimeAlignment, signalQuality,
    dayDelta:     +w1d.toFixed(2),
    fiveDayDelta: w5d != null ? +w5d.toFixed(2) : null,
  };
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Regime classification Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function getRegime(score, sma200) {
  if (score == null) return null;
  if (sma200 >= 60) return { label: "EXPANSION",           phase: "bull",  icon: "\u2191", desc: "Strong breadth - majority above key averages",   action: "Favorable for longs. Broad participation confirmed." };
  if (sma200 >= 50) return { label: "ACCUMULATION",        phase: "nbull", icon: "\u2197", desc: "Mixed signals - watch for follow-through",        action: "Selective longs only. Monitor sector rotation." };
  if (sma200 >= 40) return { label: "TRANSITION",          phase: "neut",  icon: "\u2192", desc: "Breadth undecided - directional clarity needed", action: "Neutral posture. Wait for confirmation." };
  if (sma200 >= 25) return { label: "DISTRIBUTION",        phase: "weak",  icon: "\u2193", desc: "Institutional selling - participation declining", action: "Avoid aggressive longs. Breadth deteriorating." };
  return              { label: "PANIC / CAPITULATION", phase: "bear",  icon: "\u2193", desc: "Extreme weakness - broad-based selling pressure",  action: "Risk-off. Capital preservation mode." };
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Phase colours Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const PC = {
  bull:  { bg: "rgba(16,185,129,0.08)",  brd: "rgba(16,185,129,0.28)", txt: "#10b981", grd: "linear-gradient(135deg,rgba(16,185,129,0.10) 0%,rgba(16,185,129,0.02) 100%)" },
  nbull: { bg: "rgba(245,158,11,0.07)",  brd: "rgba(245,158,11,0.25)", txt: "#f59e0b", grd: "linear-gradient(135deg,rgba(245,158,11,0.09) 0%,rgba(245,158,11,0.02) 100%)" },
  neut:  { bg: "rgba(148,163,184,0.06)", brd: "rgba(148,163,184,0.22)",txt: "#94a3b8", grd: "linear-gradient(135deg,rgba(148,163,184,0.07) 0%,rgba(148,163,184,0.01) 100%)" },
  weak:  { bg: "rgba(210,55,55,0.07)",   brd: "rgba(210,55,55,0.22)",  txt: "#d94444", grd: "linear-gradient(135deg,rgba(210,55,55,0.08) 0%,rgba(210,55,55,0.01) 100%)" },
  bear:  { bg: "rgba(185,28,28,0.10)",   brd: "rgba(185,28,28,0.32)",  txt: "#b91c1c", grd: "linear-gradient(135deg,rgba(185,28,28,0.13) 0%,rgba(185,28,28,0.02) 100%)" },
};

const premiumShell = (isDark) => ({
  position: "relative",
  overflow: "hidden",
  borderRadius: 26,
  border: `1px solid ${isDark ? "rgba(148,163,184,0.18)" : "rgba(15,23,42,0.10)"}`,
  background: isDark
    ? "linear-gradient(180deg,rgba(6,11,23,0.98),rgba(11,19,34,0.98))"
    : "linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,250,252,0.98))",
  boxShadow: isDark
    ? "0 28px 80px rgba(2,6,23,0.42), inset 0 1px 0 rgba(255,255,255,0.05)"
    : "0 28px 70px rgba(15,23,42,0.10), inset 0 1px 0 rgba(255,255,255,0.85)",
});

const premiumSection = (isDark, accent = "rgba(148,163,184,0.18)") => ({
  position: "relative",
  overflow: "hidden",
  border: `1px solid ${isDark ? "rgba(255,255,255,0.07)" : "rgba(15,23,42,0.08)"}`,
  background: isDark
    ? `linear-gradient(180deg, ${accent} 0%, rgba(255,255,255,0.02) 68%, rgba(255,255,255,0.015) 100%)`
    : `linear-gradient(180deg, ${accent} 0%, rgba(255,255,255,0.94) 70%, rgba(241,245,249,0.94) 100%)`,
  boxShadow: isDark
    ? "0 18px 42px rgba(2,6,23,0.24)"
    : "0 16px 32px rgba(15,23,42,0.07)",
  backdropFilter: "blur(18px)",
});

const mobilePanel = (isDark, accent = "rgba(148,163,184,0.14)") => ({
  position: "relative",
  overflow: "hidden",
  borderRadius: 22,
  border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)"}`,
  background: isDark
    ? `linear-gradient(180deg, ${accent} 0%, rgba(12,18,30,0.96) 72%, rgba(9,14,24,0.98) 100%)`
    : `linear-gradient(180deg, ${accent} 0%, rgba(255,255,255,0.98) 74%, rgba(244,247,250,0.98) 100%)`,
  boxShadow: isDark
    ? "0 18px 34px rgba(2,6,23,0.24), inset 0 1px 0 rgba(255,255,255,0.04)"
    : "0 16px 28px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.85)",
  backdropFilter: "blur(16px)",
});


// Ã¢â€â‚¬Ã¢â€â‚¬ Market Message builder Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function buildMessage(regime, score, latestRow, momentum) {
  const p    = regime?.phase;
  const s200 = fmt1(latestRow?.above_sma200);
  const s50  = fmt1(latestRow?.above_sma50);
  const lo   = fmt1(latestRow?.near_52w_low);
  const hi   = fmt1(latestRow?.near_52w_high);
  const isWeakBounce = momentum?.label === "Weak Bounce";
  const isAccel      = momentum?.label === "Accelerating Weakness";

  if (p === "bear") return {
    icon: "\u2193",
    summary: isWeakBounce
      ? "Broad-based distribution persists. Weak bounce - not a reversal. Structure broken."
      : isAccel
      ? "Distribution accelerating. Selling pressure intensifying across timeframes."
      : "Broad-based distribution continues. No accumulation. Long-term structure broken.",
    bullets: [
      `Only ${s200}% above 200 DMA - ${lo}% near 52-week lows`,
      isWeakBounce
        ? "Short-term breadth rising but long-term structure remains broken"
        : "No evidence of institutional accumulation at current levels",
      "Breadth expansion required before any re-entry is warranted",
    ],
    actions: ["Avoid aggressive longs", "Focus on capital preservation", "Wait for breadth expansion confirmation"],
  };

  if (p === "weak") return {
    icon: "\u2193",
    summary: "Market internals deteriorating. Participation narrowing across cap sizes.",
    bullets: [
      `${s50}% above 50 DMA - ${s200}% above 200 DMA`,
      "Breadth contracting - most sectors below key moving averages",
      isWeakBounce ? "Recent bounce is short-term only - structural confirmation absent" : "No reversal signals confirmed",
    ],
    actions: ["Reduce exposure on rallies", "Favour cash and defensive positions", "Wait for 50 DMA breadth above 40%"],
  };

  if (p === "neut") return {
    icon: "\u2192",
    summary: "Mixed signals - market at a structural inflection point.",
    bullets: [
      `${s50}% above 50 DMA - ${s200}% above 200 DMA`,
      "Breadth undecided - no clear directional edge",
      "Watch for decisive expansion or contraction from current levels",
    ],
    actions: ["Stay selective - favour quality setups only", "Avoid averaging into weak positions", "Wait for breadth to clear 50% on 50 DMA"],
  };

  if (p === "nbull") return {
    icon: "\u2197",
    summary: "Early accumulation signals detected - confirmation required.",
    bullets: [
      `${s50}% above 50 DMA - ${hi}% near 52-week highs`,
      "Breadth starting to improve - watch long-term metrics for confirmation",
      "Pattern consistent with early recovery, not yet a confirmed uptrend",
    ],
    actions: ["Small selective longs with tight risk", "Monitor 200 DMA breadth for follow-through", "Size positions smaller until breadth confirms"],
  };

  return {
    icon: "\u2713",
    summary: "Broad market participation - conditions constructive.",
    bullets: [
      `${s200}% above 200 DMA - ${hi}% near 52-week highs`,
      "Internals confirm uptrend - broad sector participation",
      "Breadth structure healthy across all timeframes",
    ],
    actions: ["Favour breakouts in leading sectors", "Stay long with trailing stops", "Add on breadth-confirmed pullbacks"],
  };
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Signal Strip data builder Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function buildSignalStrip(score, latestRow, momentum) {
  const signals = [];

  if (score < 20)      signals.push({ icon: "\u25BC", label: "Weak Structure",     sev: "critical" });
  else if (score < 40) signals.push({ icon: "\u25E6", label: "Fragile Structure",   sev: "weak"     });
  else if (score < 60) signals.push({ icon: "\u25C7", label: "Mixed Structure",     sev: "neutral"  });
  else                 signals.push({ icon: "\u25B2", label: "Strong Structure",    sev: "strong"   });

  const hi = latestRow?.near_52w_high ?? 0;
  if (hi < 5)       signals.push({ icon: "\u2193", label: "No Leadership",      sev: "critical" });
  else if (hi < 12) signals.push({ icon: "\u2198", label: "Thin Leadership",    sev: "weak"     });
  else              signals.push({ icon: "\u2191", label: "Leadership Active",  sev: "strong"   });

  const lo = latestRow?.near_52w_low ?? 0;
  if (lo >= 40)      signals.push({ icon: "\u25BC", label: "High Stress",         sev: "critical" });
  else if (lo >= 20) signals.push({ icon: "\u25E6", label: "Elevated Stress",     sev: "weak"     });
  else               signals.push({ icon: "\u2713", label: "Low Stress",          sev: "strong"   });

  if (momentum) {
    const sev =
      momentum.color === SEV.critical ? "critical" :
      momentum.color === SEV.weak     ? "weak"     :
      momentum.color === SEV.strong   ? "strong"   : "neutral";
    signals.push({ icon: "\u21BB", label: momentum.label, sev });
  }

  if (score < 30) signals.push({ icon: "\u26A0", label: "Low Confidence", sev: "critical" });

  return signals.slice(0, 5);
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Card Status Labels Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function cardStatus(val, fieldKey, inverse) {
  if (inverse) {
    if (val >= 40) return { label: "High Stress",    color: SEV.critical  };
    if (val >= 25) return { label: "Elevated",       color: SEV.weak      };
    return               { label: "Neutral",         color: SEV.neutral   };
  }
  if (fieldKey === "near_52w_high") {
    if (val >= 25) return { label: "Leadership Present", color: SEV.strong    };
    if (val >= 12) return { label: "Leadership Thin",    color: SEV.improving };
    return               { label: "Leadership Absent",   color: SEV.critical  };
  }
  if (fieldKey === "above_sma50" || fieldKey === "above_sma200") {
    if (val >= 60) return { label: "Strong",           color: SEV.strong    };
    if (val >= 50) return { label: "Holding",          color: SEV.improving };
    if (val >= 40) return { label: "Neutral",          color: SEV.neutral   };
    if (val >= 25) return { label: "Weak",             color: SEV.weak      };
    return               { label: "Critical Weakness", color: SEV.critical  };
  }
  if (fieldKey === "above_sma20") {
    if (val >= 60) return { label: "Strong",           color: SEV.strong    };
    if (val >= 40) return { label: "Neutral",          color: SEV.neutral   };
    if (val >= 25) return { label: "Fading",           color: SEV.improving };
    return               { label: "Critical Weakness", color: SEV.critical  };
  }
  if (fieldKey === "above_sma150") {
    if (val >= 60) return { label: "Strong",           color: SEV.strong    };
    if (val >= 40) return { label: "Neutral",          color: SEV.neutral   };
    if (val >= 25) return { label: "Weak",             color: SEV.weak      };
    return               { label: "Critical Weakness", color: SEV.critical  };
  }
  if (val >= 60) return { label: "Strong",           color: SEV.strong   };
  if (val >= 40) return { label: "Neutral",          color: SEV.neutral  };
  if (val >= 25) return { label: "Weak",             color: SEV.weak     };
  return               { label: "Critical Weakness", color: SEV.critical };
}

function borderCol(val, fieldKey, inverse) { return cardStatus(val, fieldKey, inverse).color; }

function deltaCol(d, inverse) {
  if (d === 0) return SEV.neutral;
  return inverse ? (d > 0 ? SEV.critical : SEV.strong) : (d > 0 ? SEV.strong : SEV.critical);
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Structure Tag Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function getStructureTag(val, delta5d, fieldKey, inverse, score) {
  if (delta5d == null) return null;
  if (inverse) {
    if (delta5d > 3)  return { label: "Deteriorating", color: SEV.critical  };
    if (delta5d < -3) return { label: "Stress Easing", color: SEV.strong    };
    return                   { label: "Neutral",       color: SEV.neutral   };
  }
  const isLongTerm = fieldKey === "above_sma200" || fieldKey === "above_sma150";
  if (isLongTerm) {
    if (delta5d < -3 && val < 35) return { label: "Structural Decline", color: SEV.critical  };
    if (delta5d > 3  && val < 35) return { label: "Tactical Bounce",    color: SEV.improving };
  }
  const sc = score ?? 50;
  if (sc < 30) {
    if (delta5d > 3)  return { label: "Early Improvement", color: SEV.improving };
    if (delta5d < -3) return { label: "Deteriorating",     color: SEV.critical  };
    return                   { label: "Structurally Weak", color: SEV.weak      };
  }
  if (sc <= 60) {
    if (delta5d > 3)  return { label: "Improving",     color: SEV.strong  };
    if (delta5d < -3) return { label: "Deteriorating", color: SEV.weak    };
    return                   { label: "Neutral",       color: SEV.neutral };
  }
  if (delta5d > 3)  return { label: "Strong",        color: SEV.strong    };
  if (delta5d < -3) return { label: "Pullback",      color: SEV.improving };
  return                   { label: "Consolidating", color: SEV.neutral   };
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Sparkline Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function Sparkline({ values, color, width = 42, height = 12 }) {
  if (!values || values.length < 2) return null;
  const mn = Math.min(...values), mx = Math.max(...values), rng = mx - mn || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - mn) / rng) * (height - 3) - 1.5;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.88" />
    </svg>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Mini Bar Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function MiniBar({ value, color, inverse = false }) {
  const pct = clamp(value ?? 0, 0, 100);
  const fillColor = inverse
    ? (pct >= 40 ? SEV.critical : pct >= 20 ? SEV.weak : SEV.neutral)
    : color;
  return (
    <div style={{ height: 3, borderRadius: 2, overflow: "hidden",
      background: "rgba(148,163,184,0.14)", marginBottom: 4, marginTop: 1 }}>
      <div style={{ height: "100%", width: `${pct}%`, borderRadius: 2,
        background: fillColor, opacity: 0.72,
        transition: "width 0.4s ease" }} />
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Enhanced Tooltips Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const TIPS = {
  above_sma20: {
    title: "Above 20 DMA",
    def: "% of stocks above their 20-day moving average. First to react to market moves.",
    range: ">60% bull - 40-60% mixed - <25% critical",
    interp: (v) => v >= 60 ? `${v}% - broad short-term strength` :
                  v >= 40 ? `${v}% - mixed short-term momentum` :
                  v >= 25 ? `${v}% - fading short-term breadth` :
                            `${v}% -> critical short-term weakness`, 
  },
  above_sma50: {
    title: "Above 50 DMA",
    def: "% of stocks above their 50-day MA. Core intermediate regime indicator.",
    range: ">60% bull - 40-60% neutral - <40% bear",
    interp: (v) => v >= 60 ? `${v}% - healthy intermediate structure` :
                  v >= 40 ? `${v}% - breadth at inflection` :
                            `${v}% -> intermediate structure broken`, 
  },
  above_sma150: {
    title: "Above 150 DMA",
    def: "% of stocks above their 150-day MA. Intermediate-to-long term trend strength.",
    range: ">55% healthy - <35% structurally weak",
    interp: (v) => v >= 55 ? `${v}% - intermediate trend healthy` :
                  v >= 35 ? `${v}% - intermediate trend weakening` :
                            `${v}% -> structural deterioration`, 
  },
  above_sma200: {
    title: "Above 200 DMA",
    def: "% of stocks in long-term uptrend. Definitive bull/bear filter.",
    range: ">60% bull market - <25% panic / capitulation",
    interp: (v) => v >= 60 ? `${v}% - long-term bull market breadth` :
                  v >= 40 ? `${v}% - long-term breadth deteriorating` :
                  v >= 25 ? `${v}% -> weak long-term structure` :
                            `${v}% -> capitulation-level breadth`, 
  },
  near_52w_high: {
    title: "Near 52W High",
    def: "% of stocks within 5% of their 52-week high. Leadership & momentum gauge.",
    range: ">25% strong leadership - <12% leadership absent",
    interp: (v) => v >= 25 ? `${v}% - broad leadership confirmed` :
                  v >= 12 ? `${v}% - leadership thin` :
                            `${v}% -> no leadership - avoid aggressive longs`, 
  },
  near_52w_low: {
    title: "Near 52W Low",
    def: "% of stocks within 5% of their 52-week low. Stress gauge. INVERSE - higher = worse.",
    range: ">40% extreme stress - >20% elevated - <10% healthy",
    interp: (v) => v >= 40 ? `${v}% -> extreme market stress` :
                  v >= 20 ? `${v}% - elevated distress` :
                            `${v}% - stress contained`, 
  },
};

// Ã¢â€â‚¬Ã¢â€â‚¬ Metric Card Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function MetricCard({ label, value, delta, fiveDayVal, sparkValues, fieldKey, inverse = false, isDark, T, tier = "secondary", timeframeTag, score }) {
  const [hovered, setHovered] = useState(false);
  const numVal = value ?? 0;
  const st     = cardStatus(numVal, fieldKey, inverse);
  const bc     = borderCol(numVal, fieldKey, inverse);
  const dc     = deltaCol(delta ?? 0, inverse);
  const delta5 = fiveDayVal != null ? +(numVal - fiveDayVal).toFixed(1) : null;
  const stTag  = getStructureTag(numVal, delta5, fieldKey, inverse, score);

  const isCore      = tier === "core";
  const isSentiment = tier === "sentiment";
  const borderW     = isCore ? "4px" : isSentiment ? "2px" : "3px";
  const valueFontSz = isCore ? 20 : isSentiment ? 16 : 18;
  const cardPad     = isCore ? "11px 13px" : "8px 11px";
  const bgTint      = isCore
    ? (isDark ? `${bc}14` : `${bc}0a`)
    : isSentiment
    ? (isDark ? "rgba(255,255,255,0.012)" : "rgba(0,0,0,0.012)")
    : (isDark ? "rgba(255,255,255,0.022)" : "rgba(0,0,0,0.016)");

  const d1Str = delta != null && delta !== 0 ? `${delta > 0 ? "+" : ""}${fmt1(delta)} (1D)` : null;
  const d5Str = delta5 != null ? `${delta5 > 0 ? "+" : ""}${delta5} (5D)` : null;
  const tip   = TIPS[fieldKey];

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        background: isDark
          ? `linear-gradient(180deg, ${bgTint} 0%, rgba(255,255,255,0.02) 100%)`
          : `linear-gradient(180deg, rgba(255,255,255,0.96) 0%, ${bgTint} 100%)`,
        border: `1px solid ${isDark ? "rgba(255,255,255,0.07)" : "rgba(15,23,42,0.08)"}`,
        borderLeft: `${borderW} solid ${bc}`,
        borderRadius: 16,
        padding: isCore ? "13px 14px" : isSentiment ? "11px 12px" : cardPad,
        cursor: "default",
        opacity: isSentiment ? 0.82 : 1,
        transition: "box-shadow 0.18s, transform 0.18s, border-color 0.18s",
        boxShadow: hovered
          ? `0 18px 34px ${isDark ? "rgba(2,6,23,0.34)" : "rgba(15,23,42,0.10)"}`
          : `0 8px 18px ${isDark ? "rgba(2,6,23,0.20)" : "rgba(15,23,42,0.05)"}`,
        transform: hovered ? "translateY(-2px)" : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: isCore ? 9 : 8.5, fontWeight: isCore ? 800 : 700,
            color: T.muted, textTransform: "uppercase", letterSpacing: ".09em", fontFamily: sans }}>
            {label}
          </span>
          {isCore && (
            <span style={{ fontSize: 7, fontWeight: 800, letterSpacing: ".1em",
              color: bc, background: `${bc}30`, border: `1px solid ${bc}52`,
              borderRadius: 3, padding: "1px 4px", fontFamily: sans }}>CORE</span>
          )}
        </div>
        {timeframeTag && (
          <span style={{ fontSize: 6.5, fontWeight: 600, letterSpacing: ".04em",
            color: isDark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.2)",
            fontFamily: sans, textTransform: "uppercase" }}>
            {timeframeTag}
          </span>
        )}
      </div>

      <MiniBar value={numVal} color={bc} inverse={inverse} />

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 4, marginBottom: 8 }}>
        <span style={{ fontFamily: mono, fontSize: valueFontSz, fontWeight: 800,
          color: T.text, lineHeight: 1, letterSpacing: "-.03em" }}>
          {fmt1(value)}%
        </span>
        <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {d1Str && (
            <span style={{ fontFamily: mono, fontSize: 8.5, fontWeight: 600, color: dc }}>{d1Str}</span>
          )}
          {d1Str && d5Str && (
            <span style={{ fontFamily: mono, fontSize: 8.5, color: isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.18)" }}>|</span>
          )}
          {d5Str && (
            <span style={{ fontFamily: mono, fontSize: 8.5, fontWeight: 600,
              color: stTag?.color ?? SEV.neutral }}>{d5Str}</span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <Sparkline values={sparkValues} color={bc} width={38} height={11} />
          {stTag && (
            <span style={{ fontSize: 7.5, fontWeight: 700, color: stTag.color, fontFamily: sans }}>
              {stTag.label}
            </span>
          )}
        </div>
        <span style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: ".04em",
          color: st.color, background: `${st.color}18`,
          border: `1px solid ${st.color}28`, borderRadius: 4, padding: "2px 5px",
          fontFamily: sans, whiteSpace: "nowrap", flexShrink: 0 }}>
          {st.label}
        </span>
      </div>

      {hovered && tip && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 8px)", left: "50%",
          transform: "translateX(-50%)",
          background: "#0f172a", color: "#e2e8f0",
          fontSize: 10.5, lineHeight: 1.55, padding: "10px 14px", borderRadius: 8,
          maxWidth: 260, width: "max-content", zIndex: 200, pointerEvents: "none",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          border: `1px solid ${bc}40`,
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: bc, marginBottom: 5,
            fontFamily: sans, letterSpacing: ".03em" }}>{tip.title}</div>
          <div style={{ color: "rgba(226,232,240,0.72)", marginBottom: 4, fontFamily: sans }}>{tip.def}</div>
          <div style={{ color: "rgba(226,232,240,0.45)", marginBottom: 5, fontSize: 9.5, fontFamily: sans }}>{tip.range}</div>
          <div style={{ color: bc, fontWeight: 700, fontSize: 10.5, fontFamily: sans }}>{tip.interp(numVal)}</div>
          <div style={{ position: "absolute", bottom: -5, left: "50%", transform: "translateX(-50%)",
            width: 8, height: 8, background: "#0f172a", clipPath: "polygon(0 0,100% 0,50% 100%)" }} />
        </div>
      )}
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Metric Group Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function MetricGroup({ title, subtitle, metrics, isDark, T, fiveDayRows, score, groupWeight = "primary" }) {
  const oldest     = fiveDayRows?.[0];
  const isTertiary = groupWeight === "tertiary";
  const isSecondary= groupWeight === "secondary";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ marginBottom: 2 }}>
        <div style={{ fontSize: isTertiary ? 8.5 : isSecondary ? 9 : 9.5,
          fontWeight: isTertiary ? 600 : isSecondary ? 700 : 800,
          letterSpacing: ".12em", textTransform: "uppercase",
          opacity: isTertiary ? 0.65 : 1,
          color: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.28)", fontFamily: sans }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 7.5, fontFamily: sans, marginTop: 3,
            letterSpacing: ".03em",
            color: isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.22)" }}>
            {subtitle}
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {metrics.map(m => (
          <MetricCard
            key={m.fieldKey}
            label={m.label}
            value={m.value}
            delta={m.delta}
            fiveDayVal={oldest ? (oldest[m.fieldKey] ?? null) : null}
            sparkValues={fiveDayRows?.map(r => r[m.fieldKey] ?? 0)}
            fieldKey={m.fieldKey}
            inverse={m.inverse}
            isDark={isDark}
            T={T}
            tier={m.tier}
            timeframeTag={m.timeframeTag}
            score={score}
          />
        ))}
      </div>
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Signal Strip Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function SignalStrip({ signals, isDark, scanMode }) {
  const c = { critical: SEV.critical, weak: SEV.weak, neutral: SEV.neutral, improving: SEV.improving, strong: SEV.strong };

  if (scanMode) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 0,
        padding: "5px 18px",
        background: isDark ? "rgba(0,0,0,0.22)" : "rgba(0,0,0,0.05)",
        borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
        fontFamily: mono, flexWrap: "wrap", rowGap: 0,
      }}>
        {signals.map((s, i) => {
          const col = c[s.sev] || SEV.neutral;
          return (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              {i > 0 && (
                <span style={{ color: isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.18)",
                  margin: "0 6px", fontSize: 8 }}>-</span>
              )}
              <span style={{ fontSize: 9.5, color: col, fontWeight: 700, letterSpacing: ".01em" }}>*</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: col, letterSpacing: ".02em" }}>
                {s.label}
              </span>
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "12px 18px 8px",
      background: "transparent",
      flexWrap: "wrap",
    }}>
      <span style={{ fontSize: 7, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase",
        color: isDark ? "rgba(255,255,255,0.24)" : "rgba(0,0,0,0.26)", fontFamily: sans, marginRight: 5 }}>
        Desk Summary
      </span>
      {signals.map((s, i) => {
        const col = c[s.sev] || SEV.neutral;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 3,
            padding: "5px 10px",
            background: isDark ? `${col}14` : `${col}10`,
            border: `1px solid ${col}2b`,
            borderRadius: 999,
            boxShadow: isDark ? "inset 0 1px 0 rgba(255,255,255,0.03)" : "inset 0 1px 0 rgba(255,255,255,0.85)" }}>
            <span style={{ fontSize: 9.5 }}>{s.icon}</span>
            <span style={{ fontSize: 8.5, fontWeight: 700, color: col, fontFamily: sans, letterSpacing: ".02em" }}>
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Unified Score + Momentum Panel Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function UnifiedPanel({ score, phase, momentum, isDark }) {
  const pc        = PC[phase] || PC.neut;
  const scoreZone = getScoreZone(score);
  const regZone   = getRegimeZone(score);
  const divider   = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";

  const scoreLabel =
    score >= 75 ? "Strong Market"    :
    score >= 55 ? "Healthy Market"   :
    score >= 40 ? "Mixed Conditions" :
    score >= 25 ? "Weak Market"      : "Critical Weakness";

  const barGrad =
    score >= 55 ? `linear-gradient(90deg,${SEV.strong},#34d399)` :
    score >= 40 ? `linear-gradient(90deg,${SEV.improving},#fbbf24)` :
    score >= 25 ? `linear-gradient(90deg,${SEV.weak},#e55)` :
                  `linear-gradient(90deg,${SEV.critical},${SEV.weak})`;

  return (
    <div style={{ display: "flex", alignItems: "stretch",
      borderBottom: `1px solid ${divider}`,
      background: isDark ? "rgba(255,255,255,0.008)" : "rgba(0,0,0,0.008)" }}>

      <div style={{ padding: "14px 24px", textAlign: "center", minWidth: 200,
        borderRight: `1px solid ${divider}`, display: "flex", flexDirection: "column",
        justifyContent: "center", alignItems: "center" }}>

        <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase",
          color: isDark ? "rgba(255,255,255,0.24)" : "rgba(0,0,0,0.26)", fontFamily: sans, marginBottom: 5 }}>
          Breadth Score
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
          <span style={{ fontFamily: mono, fontSize: 44, fontWeight: 900, color: pc.txt,
            lineHeight: 1, letterSpacing: "-.05em" }}>{score}</span>
          <span style={{ fontFamily: mono, fontSize: 13, color: isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.22)" }}>/ 100</span>
        </div>

        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".06em",
          color: pc.txt, background: pc.bg, border: `1px solid ${pc.brd}`,
          borderRadius: 4, padding: "2px 9px", fontFamily: sans, marginBottom: 8 }}>
          {scoreLabel}
        </span>

        <div style={{ width: "100%", maxWidth: 180 }}>
          <div style={{ height: 5, borderRadius: 10, overflow: "hidden",
            background: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)", marginBottom: 3 }}>
            <div style={{ height: "100%", width: `${score}%`, borderRadius: 10,
              background: barGrad, transition: "width 0.6s cubic-bezier(.4,0,.2,1)" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            {["0","25","40","55","75","100"].map(v => (
              <span key={v} style={{ fontSize: 7, fontFamily: mono,
                color: isDark ? "rgba(255,255,255,0.17)" : "rgba(0,0,0,0.18)" }}>{v}</span>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <span style={{ fontSize: 8, fontWeight: 700, color: scoreZone.color,
            background: `${scoreZone.color}12`, border: `1px solid ${scoreZone.color}26`,
            borderRadius: 3, padding: "2px 7px", fontFamily: sans }}>
            {scoreZone.extreme ? "! " : ""}{scoreZone.zone}
          </span>
          <span style={{ fontSize: 7.5, fontWeight: 700, color: regZone.color, fontFamily: sans }}>
            {regZone.label}
          </span>
        </div>
      </div>

      {momentum && (
        <div style={{ flex: 1, padding: "14px 22px", display: "flex", flexDirection: "column",
          justifyContent: "center", gap: 8 }}>

          <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase",
            color: isDark ? "rgba(255,255,255,0.24)" : "rgba(0,0,0,0.26)", fontFamily: sans }}>
            Momentum
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: mono, fontSize: 20, color: momentum.color, fontWeight: 900, lineHeight: 1 }}>
              {momentum.icon}
            </span>
            <span style={{ fontFamily: mono, fontSize: 15, fontWeight: 800,
              color: momentum.color, letterSpacing: ".02em" }}>
              {momentum.label}
            </span>
          </div>

          <div style={{ display: "flex", gap: 5, alignItems: "center", fontFamily: mono, fontSize: 10.5, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, color: momentum.dayDelta >= 0 ? SEV.strong : SEV.critical }}>
              {momentum.dayDelta >= 0 ? "+" : ""}{momentum.dayDelta} (1D)
            </span>
            {momentum.fiveDayDelta != null && (
              <>
                <span style={{ color: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)" }}>|</span>
                <span style={{ fontWeight: 700, color: momentum.fiveDayDelta >= 0 ? SEV.strong : SEV.critical }}>
                  {momentum.fiveDayDelta >= 0 ? "+" : ""}{momentum.fiveDayDelta} (5D)
                </span>
              </>
            )}
          </div>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase",
                color: isDark ? "rgba(255,255,255,0.26)" : "rgba(0,0,0,0.28)", fontFamily: sans }}>Alignment</span>
              <span style={{ fontSize: 8, color: isDark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.18)" }}>-</span>
              <span style={{ fontSize: 8.5, fontWeight: 800, color: momentum.regimeAlignment.color, fontFamily: sans }}>
                {momentum.regimeAlignment.label}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase",
                color: isDark ? "rgba(255,255,255,0.26)" : "rgba(0,0,0,0.28)", fontFamily: sans }}>Signal</span>
              <span style={{ fontSize: 8, color: isDark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.18)" }}>-</span>
              <span style={{ fontSize: 8.5, fontWeight: 800, color: momentum.signalQuality.color,
                background: `${momentum.signalQuality.color}14`,
                border: `1px solid ${momentum.signalQuality.color}28`,
                borderRadius: 3, padding: "1px 5px", fontFamily: sans }}>
                {momentum.signalQuality.label}
              </span>
            </div>
          </div>

          <div style={{ fontSize: 9, lineHeight: 1.5, fontFamily: sans,
            color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.48)",
            background: isDark ? "rgba(255,255,255,0.022)" : "rgba(0,0,0,0.022)",
            border: `1px solid ${divider}`,
            borderLeft: `2px solid ${momentum.color}50`,
            borderRadius: "0 5px 5px 0",
            padding: "6px 10px", maxWidth: 360,
          }}>
            {momentum.structureNote}
          </div>
        </div>
      )}
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Market Message Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function MarketMessage({ msg, phase, isDark, T }) {
  const [expanded, setExpanded] = useState(false);
  const pc      = PC[phase] || PC.neut;
  const divider = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
  return (
    <div style={{ borderBottom: `1px solid ${divider}`,
      background: isDark ? "rgba(255,255,255,0.008)" : "rgba(0,0,0,0.008)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 18px",
        borderLeft: `3px solid ${pc.txt}` }}>
        <span style={{ fontSize: 11, color: pc.txt, flexShrink: 0 }}>{msg.icon}</span>
        <span style={{ flex: 1, fontSize: 10.5, fontWeight: 600, lineHeight: 1.4,
          color: isDark ? "rgba(255,255,255,0.76)" : "rgba(0,0,0,0.7)", fontFamily: sans }}>
          {msg.summary}
        </span>
        <button onClick={() => setExpanded(e => !e)} style={{
          flexShrink: 0, background: "transparent",
          border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)"}`,
          borderRadius: 5, padding: "3px 8px",
          fontSize: 9, fontWeight: 700, fontFamily: sans,
          color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)",
          cursor: "pointer", letterSpacing: ".04em", transition: ".1s",
        }}>
          {expanded ? "Hide" : "Details"}
        </button>
      </div>

      {expanded && (
        <div style={{ padding: "0 18px 10px 18px" }}>
          <div style={{
            background: isDark ? "rgba(255,255,255,0.022)" : "rgba(0,0,0,0.018)",
            border: `1px solid ${divider}`,
            borderLeft: `2px solid ${pc.txt}50`,
            borderRadius: "0 7px 7px 0",
            padding: "9px 15px",
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 8 }}>
              {msg.bullets.map((b, i) => (
                <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 8.5, fontFamily: mono, flexShrink: 0, marginTop: 2,
                    color: isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.28)" }}>-</span>
                  <span style={{ fontSize: 10.5, lineHeight: 1.5, fontFamily: sans,
                    color: isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.6)" }}>{b}</span>
                </div>
              ))}
            </div>
            <div style={{ borderTop: `1px solid ${divider}`, paddingTop: 7,
              display: "flex", flexDirection: "column", gap: 3 }}>
              {msg.actions.map((a, i) => (
                <div key={i} style={{ display: "flex", gap: 7, alignItems: "center" }}>
                  <span style={{ fontSize: 9, fontWeight: 700, fontFamily: mono, color: pc.txt }}>-></span>
                  <span style={{ fontSize: 10.5, fontWeight: 600, fontFamily: sans, color: pc.txt }}>{a}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Regime Banner Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function RegimeBanner({ regime, pc, regimeSubtitle, range, setRange, isDark, T, regimeDuration, scanMode, setScanMode, livePulse, refreshing, onRefresh }) {
  const RANGE_OPTS = ["3M","6M","1Y","2Y"];
  const divider    = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
  useEffect(() => {
    if (document.getElementById("te-spin-style")) return;
    const s = document.createElement("style");
    s.id = "te-spin-style";
    s.textContent = "@keyframes te-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }";
    document.head.appendChild(s);
  }, []);
  return (
    <div style={{ position: "relative", overflow: "hidden",
      background: pc.grd, borderBottom: `2px solid ${pc.brd}`, padding: "9px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, flexWrap: "wrap" }}>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, flexShrink: 0,
            background: `${pc.txt}18`, border: `1.5px solid ${pc.brd}`,
            display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: mono, fontSize: 16, fontWeight: 900, color: pc.txt }}>
              {regime.icon}
            </span>
          </div>
          <div style={{ padding: "0 0 6px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 1 }}>
              <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: ".15em",
                textTransform: "uppercase", fontFamily: sans,
                color: isDark ? "rgba(255,255,255,0.26)" : "rgba(0,0,0,0.26)" }}>
                Market Regime
              </span>
              <span style={{ fontSize: 8, color: isDark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.2)" }}>- NSE</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <span style={{ fontFamily: mono, fontSize: 16, fontWeight: 900, color: pc.txt,
                letterSpacing: ".04em", lineHeight: 1 }}>
                {regime.label}
              </span>
              {regimeDuration != null && (
                <span style={{ fontSize: 7.5, fontWeight: 800, letterSpacing: ".07em", fontFamily: sans,
                  textTransform: "uppercase", color: pc.txt,
                  background: `${pc.txt}18`, border: `1px solid ${pc.txt}28`,
                  borderRadius: 3, padding: "1px 5px" }}>
                  {regimeDuration}s
                </span>
              )}
            </div>
            <div style={{ fontSize: 9, fontFamily: sans,
              color: isDark ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.42)" }}>
              {regimeSubtitle}
            </div>
          </div>
        </div>

        {!scanMode && (
          <div style={{ flex: 1, maxWidth: 300, minWidth: 190, padding: "6px 11px",
            background: isDark ? "rgba(0,0,0,0.14)" : "rgba(0,0,0,0.04)",
            borderRadius: 6, border: `1px solid ${divider}` }}>
            <div style={{ fontSize: 8.5, fontWeight: 600, lineHeight: 1.4, marginBottom: 2, fontFamily: sans,
              color: isDark ? "rgba(255,255,255,0.68)" : "rgba(0,0,0,0.65)" }}>
              {regime.desc}
            </div>
            <div style={{ fontSize: 9, fontWeight: 700, fontFamily: sans, color: pc.txt }}>
              {regime.action}
            </div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/*{scanMode && (*/}
          {/*  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>*/}
          {/*    <span style={{*/}
          {/*      fontSize: 8, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase",*/}
          {/*      fontFamily: sans, color: pc.txt,*/}
          {/*      background: `${pc.txt}18`, border: `1px solid ${pc.txt}35`,*/}
          {/*      borderRadius: 4, padding: "3px 8px",*/}
          {/*    }}>*/}
          {/*      Ã¢Å¡Â¡ SCAN MODE Ã¢â‚¬â€ Live Monitoring*/}
          {/*    </span>*/}
          {/*    <span style={{*/}
          {/*      fontSize: 8.5, fontWeight: 700, fontFamily: sans, letterSpacing: ".08em",*/}
          {/*      color: livePulse ? SEV.strong : "rgba(16,185,129,0.35)",*/}
          {/*      transition: "color 0.6s ease",*/}
          {/*    }}>*/}
          {/*      Ã¢â€”Â LIVE*/}
          {/*    </span>*/}
          {/*  </div>*/}
          {/*)}*/}

          <div style={{ position: "relative" }}>
            <button
              onClick={() => setScanMode(s => !s)}
              title="Press S to toggle Scan Mode"
              style={{
                height: 25, padding: "0 9px",
                border: `1px solid ${scanMode ? pc.txt : divider}`,
                borderRadius: 5,
                background: scanMode ? `${pc.txt}22` : "transparent",
                color: scanMode ? pc.txt : (isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)"),
                fontWeight: 700, fontSize: 9, fontFamily: sans, cursor: "pointer", letterSpacing: ".06em",
                transition: "all .15s",
              }}>
              {scanMode ? "ON SCAN" : "OFF SCAN"}
            </button>
          </div>

          <button
            onClick={onRefresh}
            title="Refresh data"
            disabled={refreshing}
            style={{
              height: 25, width: 25,
              border: `1px solid ${divider}`,
              borderRadius: 5,
              background: "transparent",
              color: isDark ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.38)",
              cursor: refreshing ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, lineHeight: 1,
              flexShrink: 0,
              opacity: refreshing ? 0.5 : 1,
              animation: refreshing ? "te-spin 0.7s linear infinite" : "none",
              transition: "opacity .15s",
            }}>
              ↺
          </button>

          {!scanMode && (
            <div style={{ display: "flex" }}>
              {RANGE_OPTS.map(r => (
                <button key={r} onClick={() => setRange(r)} style={{
                  height: 25, padding: "0 8px", border: "none",
                  borderBottom: `2px solid ${range === r ? pc.txt : "transparent"}`,
                  background: "transparent",
                  color: range === r ? pc.txt : (isDark ? "rgba(255,255,255,0.32)" : "rgba(0,0,0,0.35)"),
                  fontWeight: range === r ? 700 : 400,
                  fontSize: 11, fontFamily: sans, cursor: "pointer", transition: ".12s",
                }}>{r}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Scan Metric Card Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function ScanMetricCard({ label, value, delta, fiveDayVal, sparkValues, fieldKey, inverse = false, isDark, T, score }) {
  const numVal = value ?? 0;
  const st     = cardStatus(numVal, fieldKey, inverse);
  const bc     = borderCol(numVal, fieldKey, inverse);
  const dc     = deltaCol(delta ?? 0, inverse);
  const delta5 = fiveDayVal != null ? +(numVal - fiveDayVal).toFixed(1) : null;
  const pct = clamp(numVal, 0, 100);
  const fillColor = inverse
    ? (pct >= 40 ? SEV.critical : pct >= 20 ? SEV.weak : SEV.neutral)
    : bc;

  return (
    <div style={{
      background: isDark ? `${bc}0d` : `${bc}07`,
      borderLeft: `3px solid ${bc}`,
      borderRadius: "0 6px 6px 0",
      padding: "6px 9px",
      display: "flex", flexDirection: "column", gap: 0,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 8, fontWeight: 700, color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)",
          textTransform: "uppercase", letterSpacing: ".07em", fontFamily: sans }}>
          {label}
        </span>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
          <span style={{ fontFamily: mono, fontSize: 16, fontWeight: 800, color: st.color,
            lineHeight: 1, letterSpacing: "-.03em" }}>
            {fmt1(value)}%
          </span>
          {(delta ?? 0) !== 0 && (
            <span style={{ fontFamily: mono, fontSize: 8.5, fontWeight: 600, color: dc }}>
              {(delta ?? 0) > 0 ? "+" : "-"}{Math.abs(delta ?? 0).toFixed(1)}
            </span>
          )}
        </div>
      </div>
      <div style={{ height: 2, borderRadius: 2, overflow: "hidden",
        background: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)", marginBottom: 4 }}>
        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 2,
          background: fillColor, transition: "width 0.4s ease" }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
        <Sparkline values={sparkValues} color={bc} width={36} height={10} />
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {delta5 != null && (
            <span style={{ fontFamily: mono, fontSize: 8, fontWeight: 600,
              color: deltaCol(delta5, inverse) }}>
              {delta5 > 0 ? "+" : ""}{delta5}
            </span>
          )}
          <span style={{ fontSize: 8, fontWeight: 800, color: st.color, fontFamily: sans,
            letterSpacing: ".03em" }}>
            {st.label}
          </span>
        </div>
      </div>
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Scan View Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function ScanView({ score, scoreLabel, momentum, metrics, isDark, T, fiveDayRows, pc, livePulse }) {
  const divider = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const oldest  = fiveDayRows?.[0];
  const sep     = <span style={{ color: isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.2)", fontFamily: mono, fontSize: 11 }}>|</span>;
  const allMetrics = [...metrics.trend, ...metrics.momentum, ...metrics.extremes];
  const scoreColor =
    score >= 60 ? SEV.strong :
    score >= 40 ? SEV.improving :
    score >= 25 ? SEV.weak :
                  SEV.critical;

  return (
    <div style={{
      background: isDark ? "rgba(0,0,0,0.18)" : "rgba(0,0,0,0.03)",
      borderBottom: `1px solid ${divider}`,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 18px",
        borderBottom: `1px solid ${divider}`,
        fontFamily: mono, flexWrap: "wrap",
      }}>
        <span style={{ fontSize: 22, fontWeight: 900, color: scoreColor, lineHeight: 1,
          letterSpacing: "-.04em" }}>{score}</span>
        <span style={{ fontSize: 9, fontWeight: 700, color: scoreColor, fontFamily: sans,
          background: `${scoreColor}18`, border: `1px solid ${scoreColor}30`,
          borderRadius: 3, padding: "2px 7px", letterSpacing: ".05em" }}>
          {scoreLabel}
        </span>
        {sep}
        {momentum && (
          <>
            <span style={{ fontSize: 14, fontWeight: 900, color: momentum.color }}>{momentum.icon}</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: momentum.color, letterSpacing: ".02em" }}>{momentum.label}</span>
            {sep}
            <span style={{ fontSize: 11, fontWeight: 700, color: momentum.dayDelta >= 0 ? SEV.strong : SEV.critical }}>
              {momentum.dayDelta >= 0 ? "+" : ""}{momentum.dayDelta}
            </span>
            <span style={{ fontSize: 9.5, color: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)", fontFamily: sans }}>(1D)</span>
            {momentum.fiveDayDelta != null && (
              <>
                <span style={{ fontSize: 9, color: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)" }}>-</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: momentum.fiveDayDelta >= 0 ? SEV.strong : SEV.critical }}>
                  {momentum.fiveDayDelta >= 0 ? "+" : ""}{momentum.fiveDayDelta}
                </span>
                <span style={{ fontSize: 9.5, color: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)", fontFamily: sans }}>(5D)</span>
              </>
            )}
            {sep}
            <span style={{ fontSize: 11, fontWeight: 800, color: momentum.regimeAlignment.color, fontFamily: sans }}>
              {momentum.regimeAlignment.label}
            </span>
            {sep}
            <span style={{ fontSize: 10, fontWeight: 800, color: momentum.signalQuality.color, fontFamily: sans }}>
              {momentum.signalQuality.label}
            </span>
          </>
        )}
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, padding: "8px 16px 10px",
      }}>
        {allMetrics.map(m => (
          <ScanMetricCard
            key={m.fieldKey}
            label={m.label}
            value={m.value}
            delta={m.delta}
            fiveDayVal={oldest ? (oldest[m.fieldKey] ?? null) : null}
            sparkValues={fiveDayRows?.map(r => r[m.fieldKey] ?? 0)}
            fieldKey={m.fieldKey}
            inverse={m.inverse}
            isDark={isDark}
            T={T}
            score={score}
          />
        ))}
      </div>
    </div>
  );
}

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
//  MOBILE-ONLY COMPONENTS
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â

// Ã¢â€â‚¬Ã¢â€â‚¬ Embedded BreadthLineChart (self-contained, no App.jsx deps) Ã¢â€â‚¬Ã¢â€â‚¬
function MobileBreadthChart({ data, lines, isDark, T }) {
  const [hovIdx, setHovIdx] = useState(null);

  if (!data || data.length === 0) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
      height: 160, color: T.muted, fontSize: 12, fontFamily: sans, opacity: 0.4 }}>
      No data
    </div>
  );

  const allVals = lines.flatMap(l => data.map(d => d[l.key] ?? 0));
  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);
  const min = Math.max(0, Math.floor(rawMin / 10) * 10);
  const max = Math.min(100, Math.ceil(rawMax / 10) * 10);
  const rng = max - min || 1;

  const H_chart = 150;
  const W = 800, PAD_L = 32, PAD_R = 8, PAD_T = 6, PAD_B = 20;
  const cW = W - PAD_L - PAD_R, cH = H_chart - PAD_T - PAD_B;

  const xOf = i => PAD_L + (i / Math.max(data.length - 1, 1)) * cW;
  const yOf = v => PAD_T + cH - ((v - min) / rng) * cH;

  const yTicks = [0, 25, 50, 75, 100].filter(v => v >= min && v <= max);
  const xTickIdxs = [];
  const step = Math.max(1, Math.floor(data.length / 3));
  for (let i = 0; i < data.length; i += step) xTickIdxs.push(i);
  if (!xTickIdxs.includes(data.length - 1)) xTickIdxs.push(data.length - 1);

  const hovData = hovIdx !== null ? data[hovIdx] : null;
  const latestVal = lines[0] ? data[data.length - 1][lines[0].key] : null;
  const prevVal   = data.length > 10 && lines[0] ? data[data.length - 11][lines[0].key] : null;
  const trend = latestVal != null && prevVal != null ? latestVal - prevVal : null;

  const signalColor = latestVal == null ? T.subtext
    : latestVal >= 60 ? (isDark ? "#4ade80" : "#16a34a")
    : latestVal <= 40 ? (T.neg || "#ef4444")
    : T.subtext;

  return (
    <div style={{ position: "relative" }}>
      {/* Header: value + trend */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        {lines.length === 1 && latestVal !== null ? (
          <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
            <span style={{ fontFamily: mono, fontSize: 22, fontWeight: 700,
              color: signalColor, letterSpacing: "-.02em", lineHeight: 1 }}>
              {Number(latestVal).toFixed(1)}%
            </span>
            {trend !== null && (
              <span style={{ fontFamily: mono, fontSize: 11,
                color: trend > 0 ? (isDark ? "#4ade80" : "#16a34a") : trend < 0 ? (T.neg || "#ef4444") : T.muted,
                fontWeight: 600 }}>
                {trend > 0 ? "+" : trend < 0 ? "-" : "->"}{Math.abs(trend).toFixed(1)}
              </span>
            )}
            <span style={{ fontSize: 10, color: T.muted, fontFamily: sans }}>
              {latestVal >= 60 ? "Bullish" : latestVal <= 40 ? "Bearish" : "Neutral"}
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {lines.map(l => (
              <div key={l.key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 14, height: 1.5, background: l.color, borderRadius: 2 }} />
                <span style={{ fontSize: 10, color: T.muted, fontFamily: sans }}>{l.label}</span>
                <span style={{ fontSize: 10, color: T.text, fontFamily: mono, fontWeight: 700 }}>
                  {Number(data[data.length - 1][l.key] ?? 0).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SVG */}
      <div style={{ position: "relative", userSelect: "none" }}
        onTouchStart={e => {
          // Prevent swipe conflict when touching chart
          e.stopPropagation();
        }}>
        <svg viewBox={`0 0 ${W} ${H_chart}`}
          style={{ width: "100%", height: H_chart, display: "block", overflow: "visible", touchAction: "none" }}
          onMouseMove={e => {
            const rect = e.currentTarget.getBoundingClientRect();
            const px = (e.clientX - rect.left) / rect.width * W;
            const idx = Math.round((px - PAD_L) / cW * (data.length - 1));
            setHovIdx(Math.max(0, Math.min(data.length - 1, idx)));
          }}
          onMouseLeave={() => setHovIdx(null)}>
          <defs>
            {lines.map(l => (
              <linearGradient key={`mg-${l.key}`} id={`mg-${l.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={l.color} stopOpacity={isDark ? "0.14" : "0.10"} />
                <stop offset="100%" stopColor={l.color} stopOpacity="0" />
              </linearGradient>
            ))}
            <clipPath id={`mclip-${lines.map(l => l.key).join('-')}`}>
              <rect x={PAD_L} y={PAD_T} width={cW} height={cH} />
            </clipPath>
          </defs>

          {/* Y grid + ticks */}
          {yTicks.map(v => (
            <g key={v}>
              <line x1={PAD_L} y1={yOf(v)} x2={W - PAD_R} y2={yOf(v)}
                stroke={isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}
                strokeWidth={v === 50 ? 1.5 : 1}
                strokeDasharray={v === 50 ? "none" : "3,4"} />
              <text x={PAD_L - 4} y={yOf(v) + 3.5} textAnchor="end"
                fontSize={9} fontFamily={mono}
                fill={isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.28)"}>
                {v}
              </text>
            </g>
          ))}

          {/* X ticks */}
          {xTickIdxs.map(i => {
            const r = data[i];
            if (!r?.date) return null;
            const d = new Date(r.date);
            const label = `${d.getDate().toString().padStart(2,"0")}/${(d.getMonth()+1).toString().padStart(2,"0")}`;
            return (
              <text key={i} x={xOf(i)} y={H_chart - 5} textAnchor="middle"
                fontSize={8} fontFamily={mono}
                fill={isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.25)"}>
                {label}
              </text>
            );
          })}

          {/* Area + line per series */}
          {lines.map(l => {
            const pts = data.map((d, i) => `${xOf(i).toFixed(1)},${yOf(d[l.key] ?? 0).toFixed(1)}`).join(" ");
            const firstX = xOf(0), lastX = xOf(data.length - 1);
            const areaPath = `M${firstX},${yOf(data[0][l.key] ?? 0)} ` +
              data.slice(1).map((d, i) => `L${xOf(i+1).toFixed(1)},${yOf(d[l.key] ?? 0).toFixed(1)}`).join(" ") +
              ` L${lastX},${PAD_T + cH} L${firstX},${PAD_T + cH} Z`;
            return (
              <g key={l.key} clipPath={`url(#mclip-${lines.map(x=>x.key).join('-')})`}>
                <path d={areaPath} fill={`url(#mg-${l.key})`} />
                <polyline points={pts} fill="none" stroke={l.color} strokeWidth="1.8"
                  strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
              </g>
            );
          })}

          {/* Hover line */}
          {hovIdx !== null && (
            <line x1={xOf(hovIdx)} y1={PAD_T} x2={xOf(hovIdx)} y2={PAD_T + cH}
              stroke={isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.18)"}
              strokeWidth={1} strokeDasharray="3,3" />
          )}
        </svg>

        {/* Hover tooltip */}
        {hovData && (
          <div style={{
            position: "absolute", top: 4, right: 8,
            background: isDark ? "rgba(15,23,42,0.92)" : "rgba(255,255,255,0.92)",
            border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)"}`,
            borderRadius: 6, padding: "5px 9px",
            fontSize: 10, fontFamily: mono, pointerEvents: "none",
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
          }}>
            <div style={{ fontSize: 8.5, color: isDark ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.38)",
              fontFamily: sans, marginBottom: 3 }}>
              {hovData.date}
            </div>
            {lines.map(l => (
              <div key={l.key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: l.color, flexShrink: 0 }} />
                <span style={{ color: isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.55)", fontSize: 9 }}>{l.label}</span>
                <span style={{ color: l.color, fontWeight: 700 }}>{Number(hovData[l.key] ?? 0).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Cap segment toggle (mobile) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function MobileCapFilter({ chartId, segments, activeSegs, onToggle, isDark, T }) {
  return (
    <div style={{ display: "flex", background: isDark ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.72)",
      borderRadius: 999, padding: 3, gap: 4,
      border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)"}`,
      boxShadow: isDark ? "inset 0 1px 0 rgba(255,255,255,0.03)" : "inset 0 1px 0 rgba(255,255,255,0.92)" }}>
      {segments.map(seg => {
        const active = activeSegs.has(seg.id);
        return (
          <button key={seg.id}
            onClick={() => onToggle(chartId, seg.id)}
            style={{ height: 24, padding: "0 10px", border: "none", borderRadius: 999,
              background: active ? (isDark ? "rgba(255,255,255,0.14)" : "#ffffff") : "transparent",
              color: active ? (isDark ? "#e2e8f0" : "#0f172a") : (isDark ? "rgba(255,255,255,0.42)" : "rgba(15,23,42,0.44)"),
              fontWeight: active ? 700 : 500,
              fontSize: 10, fontFamily: sans, cursor: "pointer", transition: ".15s",
              boxShadow: active ? `0 8px 18px ${isDark ? "rgba(2,6,23,0.22)" : "rgba(15,23,42,0.08)"}` : "none" }}>
            {seg.label}
          </button>
        );
      })}
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Mobile Chart Pair Page Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function MobileChartPage({ chartData, cfgA, cfgB, capColMap, capSegments, chartSegs, onToggleSeg, isDark, T }) {
  const buildLines = (cfg) => {
    if (!cfg || !chartData) return [];
    const segs = chartSegs?.[cfg.id] || new Set(["all"]);
    const lines = [];
    if (segs.has("all"))   lines.push({ key: cfg.allKey,   label: "All",   color: cfg.allColor });
    const cols = capColMap?.[cfg.capPrefix] || {};
    if (segs.has("large") && cols.large) lines.push({ key: cols.large, label: "Large", color: isDark ? "#818cf8" : "#6366f1" });
    if (segs.has("mid")   && cols.mid)   lines.push({ key: cols.mid,   label: "Mid",   color: isDark ? "#fb923c" : "#ea580c" });
    if (segs.has("small") && cols.small) lines.push({ key: cols.small, label: "Small", color: isDark ? "#4ade80" : "#16a34a" });
    return lines;
  };

  const divider = isDark ? "rgba(255,255,255,0.07)" : "rgba(15,23,42,0.08)";

  const ChartBlock = ({ cfg }) => {
    if (!cfg) return null;
    const lines = buildLines(cfg);
    const activeSegs = chartSegs?.[cfg.id] || new Set(["all"]);
    return (
      <div style={{ ...mobilePanel(isDark, `${cfg.allColor}14`), padding: 16, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
          <div style={{ padding: "0 0 6px" }}>
            <div style={{ fontSize: 9.5, fontWeight: 800, color: isDark ? "rgba(255,255,255,0.52)" : "rgba(15,23,42,0.48)",
              textTransform: "uppercase", letterSpacing: ".12em", fontFamily: sans, marginBottom: 6 }}>
              {cfg.title}
            </div>
            <div style={{ fontSize: 10.5, color: isDark ? "rgba(255,255,255,0.34)" : "rgba(15,23,42,0.38)", fontFamily: sans }}>
              Swipe page with live breadth context
            </div>
          </div>
          {capSegments && onToggleSeg && (
            <MobileCapFilter
              chartId={cfg.id}
              segments={capSegments}
              activeSegs={activeSegs}
              onToggle={onToggleSeg}
              isDark={isDark}
              T={T}
            />
          )}
        </div>
        <MobileBreadthChart data={chartData} lines={lines} isDark={isDark} T={T} />
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "14px 14px 4px", height: "100%", overflowY: "auto" }}>
      <ChartBlock cfg={cfgA} />
      <ChartBlock cfg={cfgB} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "2px 0 8px",
        color: isDark ? "rgba(255,255,255,0.22)" : "rgba(15,23,42,0.26)", fontSize: 10, fontFamily: sans }}>
        <span style={{ width: 5, height: 5, borderRadius: 999, background: divider }} />
        Tap filters to compare cap participation
      </div>
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Page Dots Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function PageDots({ total, current, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px 0 14px" }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: i === current ? 22 : 7,
          height: 7,
          borderRadius: 999,
          background: i === current ? color : "rgba(148,163,184,0.24)",
          boxShadow: i === current ? `0 0 0 6px ${color}18` : "none",
          transition: "all 0.25s ease",
        }} />
      ))}
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Mobile Swipe Pager Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function MobileSwipePager({
  // Header data
  latestRow, prevRow, fiveDayRows, range, setRange, isDark, T,
  onRefresh, scanMode, setScanMode, livePulse, refreshing,
  // Computed
  score, regime, pc, momentum, msg, signals, metrics,
  regimeDuration, regimeSubtitle, divider,
  // Chart data
  chartData, chartConfigs, capColMap, capSegments, chartSegs, onToggleSeg,
}) {
  const [page, setPage] = useState(0);
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const dragX = useRef(0);
  const [offsetX, setOffsetX] = useState(0);
  const containerRef = useRef(null);
  const TOTAL_PAGES = 4;

  const goTo = useCallback((idx) => {
    setPage(Math.max(0, Math.min(TOTAL_PAGES - 1, idx)));
    setOffsetX(0);
  }, []);

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    dragX.current = 0;
  };

  const handleTouchMove = (e) => {
    if (touchStartX.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (Math.abs(dy) > Math.abs(dx) * 1.4) return;
    dragX.current = dx;
    setOffsetX(dx);
  };

  const handleTouchEnd = () => {
    const dx = dragX.current;
    if (Math.abs(dx) > 40) {
      if (dx < 0 && page < TOTAL_PAGES - 1) goTo(page + 1);
      else if (dx > 0 && page > 0) goTo(page - 1);
      else setOffsetX(0);
    } else {
      setOffsetX(0);
    }
    touchStartX.current = null;
    touchStartY.current = null;
    dragX.current = 0;
  };

  const scoreLabel =
    score >= 75 ? "Strong Market" :
    score >= 55 ? "Healthy Market" :
    score >= 40 ? "Mixed Conditions" :
    score >= 25 ? "Weak Market" : "Critical Weakness";

  const PAGE_LABELS = ["Overview", "Momentum", "Trend", "52W Levels"];
  const cfgByIdx = (idx) => chartConfigs?.[idx] || null;
  const OVERVIEW_LABELS = {
    sma20: "20 SMA",
    sma50: "50 SMA",
    sma150: "150 SMA",
    sma200: "200 SMA",
    "52high": "52W High",
    "52low": "52W Low",
  };
  const overviewCards = (chartConfigs || []).map(cfg => {
    const value = latestRow?.[cfg.allKey] ?? null;
    const prev = prevRow?.[cfg.allKey] ?? null;
    const delta = value != null && prev != null ? +(value - prev).toFixed(1) : null;
    const inverse = cfg.id === "52low";
    const good = inverse ? (value != null && value < 15) : (value != null && value >= 40);
    const state = inverse
      ? (value >= 25 ? "Stress" : value >= 15 ? "Watch" : "Contained")
      : (value >= 60 ? "Strong" : value >= 40 ? "Mixed" : "Weak");
    return {
      id: cfg.id,
      label: OVERVIEW_LABELS[cfg.id] || cfg.title,
      value,
      delta,
      color: cfg.allColor,
      good,
      state,
    };
  });
  const healthyCount = overviewCards.filter(card => card.good).length;
  const overviewTone = healthyCount >= 4
    ? "Participation is holding across most trend windows."
    : healthyCount <= 2
    ? "Breadth is still narrow and leadership remains selective."
    : "Breadth is mixed, with participation improving only in parts of the stack.";

  return (
    <div ref={containerRef} style={{ position: "relative", overflow: "hidden", fontFamily: sans, padding: "0 12px 8px", touchAction: "pan-y pinch-zoom" }}>
      <div style={{ ...mobilePanel(isDark, `${pc.txt}10`), borderRadius: 24, overflow: "hidden" }}>
        <div style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: isDark
            ? "radial-gradient(circle at top right, rgba(16,185,129,0.10), transparent 26%), radial-gradient(circle at bottom left, rgba(59,130,246,0.08), transparent 28%)"
            : "radial-gradient(circle at top right, rgba(16,185,129,0.10), transparent 26%), radial-gradient(circle at bottom left, rgba(59,130,246,0.06), transparent 28%)"
        }} />

        <div style={{ position: "relative" }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "14px 14px 0",
            overflowX: "auto",
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none",
          }}>
            {PAGE_LABELS.map((label, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                style={{
                  flexShrink: 0,
                  height: 34,
                  padding: "0 14px",
                  borderRadius: 999,
                  border: `1px solid ${i === page ? `${pc.txt}45` : divider}`,
                  background: i === page
                    ? (isDark ? `${pc.txt}22` : "#ffffff")
                    : (isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.58)"),
                  color: i === page ? pc.txt : (isDark ? "rgba(255,255,255,0.54)" : "rgba(15,23,42,0.56)"),
                  fontWeight: i === page ? 800 : 600,
                  fontSize: 10.5,
                  fontFamily: sans,
                  letterSpacing: ".04em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  boxShadow: i === page ? `0 10px 24px ${pc.txt}18` : "none",
                  transition: ".18s ease",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{
              transform: `translateX(${offsetX}px)`,
              transition: offsetX === 0 ? "transform 0.28s cubic-bezier(.4,0,.2,1)" : "none",
              willChange: "transform",
              touchAction: "pan-y pinch-zoom",
            }}
          >
            {page === 0 && (
              <div style={{ padding: "12px 14px 8px" }}>
                <div style={{ display: "grid", gap: 12 }}>
                  <div style={{ ...mobilePanel(isDark, `${pc.txt}12`), padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", color: isDark ? "rgba(255,255,255,0.42)" : "rgba(15,23,42,0.42)", marginBottom: 6 }}>
                          Breadth Overview
                        </div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                          <span style={{ fontFamily: mono, fontSize: 40, fontWeight: 900, color: pc.txt, lineHeight: 1, letterSpacing: "-.06em" }}>{score}</span>
                          <span style={{ fontSize: 11, color: isDark ? "rgba(255,255,255,0.30)" : "rgba(15,23,42,0.34)" }}>/100</span>
                        </div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".04em", color: pc.txt, background: pc.bg, border: `1px solid ${pc.brd}`, borderRadius: 999, padding: "5px 10px" }}>
                        {scoreLabel}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 900, color: momentum?.color || pc.txt, fontFamily: mono }}>
                        {momentum ? `${momentum.icon} ${momentum.label}` : regime?.phase}
                      </span>
                      {momentum && (
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 10.5, fontFamily: mono }}>
                          <span style={{ color: momentum.dayDelta >= 0 ? SEV.strong : SEV.critical, fontWeight: 800 }}>
                            {momentum.dayDelta >= 0 ? "+" : ""}{momentum.dayDelta} (1D)
                          </span>
                          {momentum.fiveDayDelta != null && (
                            <span style={{ color: momentum.fiveDayDelta >= 0 ? SEV.strong : SEV.critical, fontWeight: 800 }}>
                              {momentum.fiveDayDelta >= 0 ? "+" : ""}{momentum.fiveDayDelta} (5D)
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div style={{ height: 6, borderRadius: 999, overflow: "hidden", background: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)", marginBottom: 10 }}>
                      <div style={{
                        height: "100%",
                        width: `${score}%`,
                        borderRadius: 999,
                        background: score >= 55
                          ? `linear-gradient(90deg, ${SEV.strong}, #34d399)`
                          : score >= 40
                          ? `linear-gradient(90deg, ${SEV.improving}, #fbbf24)`
                          : score >= 25
                          ? `linear-gradient(90deg, ${SEV.weak}, #f97316)`
                          : `linear-gradient(90deg, ${SEV.critical}, ${SEV.weak})`,
                      }} />
                    </div>

                    <div style={{ fontSize: 11.5, lineHeight: 1.6, color: isDark ? "rgba(255,255,255,0.56)" : "rgba(15,23,42,0.62)" }}>
                      {overviewTone}
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {overviewCards.map(card => (
                      <div key={card.id} style={{ ...mobilePanel(isDark, `${card.color}12`), padding: 14 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                          <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: isDark ? "rgba(255,255,255,0.34)" : "rgba(15,23,42,0.38)" }}>
                            {card.label}
                          </div>
                          <span style={{ fontSize: 8.5, fontWeight: 800, color: card.color }}>
                            {card.state}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                          <span style={{ fontFamily: mono, fontSize: 17, fontWeight: 800, color: card.color }}>
                    {card.value == null ? "-" : `${Number(card.value).toFixed(1)}%`}
                          </span>
                          {card.delta != null && (
                            <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 800, color: card.delta >= 0 ? SEV.strong : SEV.critical }}>
                              {card.delta >= 0 ? "+" : ""}{card.delta}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  padding: "12px 16px 6px",
                  color: isDark ? "rgba(255,255,255,0.24)" : "rgba(15,23,42,0.28)",
                  fontSize: 10,
                  fontFamily: sans,
                  letterSpacing: ".04em",
                  textTransform: "uppercase",
                }}>
                  <span style={{ fontSize: 12 }}>{"<"}</span>
                  Swipe for chart pages
                  <span style={{ fontSize: 12 }}>{">"}</span>
                </div>
              </div>
            )}

            {page === 1 && chartData && chartConfigs && (
              <MobileChartPage
                chartData={chartData}
                cfgA={cfgByIdx(0)}
                cfgB={cfgByIdx(1)}
                capColMap={capColMap}
                capSegments={capSegments}
                chartSegs={chartSegs}
                onToggleSeg={onToggleSeg}
                isDark={isDark}
                T={T}
              />
            )}

            {page === 2 && chartData && chartConfigs && (
              <MobileChartPage
                chartData={chartData}
                cfgA={cfgByIdx(2)}
                cfgB={cfgByIdx(3)}
                capColMap={capColMap}
                capSegments={capSegments}
                chartSegs={chartSegs}
                onToggleSeg={onToggleSeg}
                isDark={isDark}
                T={T}
              />
            )}

            {page === 3 && chartData && chartConfigs && (
              <MobileChartPage
                chartData={chartData}
                cfgA={cfgByIdx(4)}
                cfgB={cfgByIdx(5)}
                capColMap={capColMap}
                capSegments={capSegments}
                chartSegs={chartSegs}
                onToggleSeg={onToggleSeg}
                isDark={isDark}
                T={T}
              />
            )}

            {page > 0 && !chartData && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.28)", fontSize: 12, fontFamily: sans }}>
                Chart data not available
              </div>
            )}
          </div>

          <PageDots total={TOTAL_PAGES} current={page} color={pc.txt} />
        </div>
      </div>
    </div>
  );
}
export default function MarketBreadthHeader({
  latestRow, prevRow, fiveDayRows,
  range, setRange,
  isDark, T,
  onRefresh,
  chartData,
  chartConfigs,
  capColMap,
  capSegments,
  chartSegs,
  onToggleSeg,
}) {
  const [scanMode, setScanMode] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "s" || e.key === "S") {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
        setScanMode(m => !m);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const [livePulse, setLivePulse] = useState(true);
  useEffect(() => {
    const t = setInterval(() => setLivePulse(p => !p), 2000);
    return () => clearInterval(t);
  }, []);

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await onRefresh?.(); } catch {}
    setTimeout(() => setRefreshing(false), 800);
  };

  // Detect mobile using CSS media query approach via window width
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (!latestRow) {
    return (
      <div style={{
        fontFamily: sans,
        padding: "10px 20px",
        background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
        borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{
          width: 120, height: 14, borderRadius: 4,
          background: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)",
          animation: "shimmer 1.4s ease-in-out infinite",
          backgroundSize: "200% 100%",
          backgroundImage: isDark
            ? "linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.10) 50%,rgba(255,255,255,0.04) 75%)"
            : "linear-gradient(90deg,rgba(0,0,0,0.04) 25%,rgba(0,0,0,0.09) 50%,rgba(0,0,0,0.04) 75%)",
        }} />
        <div style={{
          width: 200, height: 10, borderRadius: 4,
          background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
        }} />
      </div>
    );
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Compute shared values Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const score    = computeScore(latestRow);
  const regime   = getRegime(score, latestRow.above_sma200 ?? 0);
  const pc       = PC[regime?.phase] || PC.neut;
  const momentum = computeMomentum(latestRow, prevRow, fiveDayRows, score);
  const msg      = buildMessage(regime, score, latestRow, momentum);
  const signals  = buildSignalStrip(score, latestRow, momentum);

  const regimeDuration = (() => {
    if (!fiveDayRows || fiveDayRows.length === 0) return null;
    if (score >= 30) return null;
    let count = 0;
    for (let i = fiveDayRows.length - 1; i >= 0; i--) {
      const s = computeScore(fiveDayRows[i]);
      if (s != null && s < 30) count++;
      else break;
    }
    if (score < 30) count++;
    return count;
  })();

  const scoreLabel =
    score >= 75 ? "Strong Market"    :
    score >= 55 ? "Healthy Market"   :
    score >= 40 ? "Mixed Conditions" :
    score >= 25 ? "Weak Market"      : "Critical Weakness";

  const delta = (key) =>
    prevRow ? +(((latestRow[key] ?? 0) - (prevRow[key] ?? 0)).toFixed(1)) : 0;

  const metrics = {
    trend: [
      { label: "Above 50 DMA",  fieldKey: "above_sma50",  value: latestRow.above_sma50,  delta: delta("above_sma50"),  tier: "core",      timeframeTag: "Intermediate"      },
      { label: "Above 200 DMA", fieldKey: "above_sma200", value: latestRow.above_sma200, delta: delta("above_sma200"), tier: "core",      timeframeTag: "Long-Term"         },
    ],
    momentum: [
      { label: "Above 20 DMA",  fieldKey: "above_sma20",  value: latestRow.above_sma20,  delta: delta("above_sma20"),  tier: "secondary", timeframeTag: "Short-Term"        },
      { label: "Above 150 DMA", fieldKey: "above_sma150", value: latestRow.above_sma150, delta: delta("above_sma150"), tier: "secondary", timeframeTag: "Intermediate-Long" },
    ],
    extremes: [
      { label: "Near 52W High", fieldKey: "near_52w_high", value: latestRow.near_52w_high, delta: delta("near_52w_high"), tier: "sentiment", timeframeTag: "Annual"  },
      { label: "Near 52W Low",  fieldKey: "near_52w_low",  value: latestRow.near_52w_low,  delta: delta("near_52w_low"),  tier: "sentiment", timeframeTag: "Annual", inverse: true },
    ],
  };

  const regimeSubtitle = `${fmt1(latestRow.above_sma200)}% - 200D  -  ${fmt1(latestRow.above_sma50)}% - 50D  -  ${fmt1(latestRow.near_52w_low)}% - 52W lows`;
  const divider        = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  //  MOBILE LAYOUT
  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  if (isMobile) {
    return (
      <div style={{ fontFamily: sans }}>
        {/* Regime Banner Ã¢â‚¬â€ always visible as the sticky header on mobile */}
        <RegimeBanner
          regime={regime} pc={pc} regimeSubtitle={regimeSubtitle}
          range={range} setRange={setRange} isDark={isDark} T={T}
          regimeDuration={regimeDuration} scanMode={scanMode} setScanMode={setScanMode}
          livePulse={livePulse} refreshing={refreshing} onRefresh={handleRefresh}
        />

        {/* Swipeable pager below the banner */}
        <MobileSwipePager
          latestRow={latestRow} prevRow={prevRow} fiveDayRows={fiveDayRows}
          range={range} setRange={setRange} isDark={isDark} T={T}
          onRefresh={handleRefresh} scanMode={scanMode} setScanMode={setScanMode}
          livePulse={livePulse} refreshing={refreshing}
          score={score} regime={regime} pc={pc} momentum={momentum}
          msg={msg} signals={signals} metrics={metrics}
          regimeDuration={regimeDuration} regimeSubtitle={regimeSubtitle} divider={divider}
          chartData={chartData}
          chartConfigs={chartConfigs}
          capColMap={capColMap}
          capSegments={capSegments}
          chartSegs={chartSegs}
          onToggleSeg={onToggleSeg}
        />
      </div>
    );
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  //  DESKTOP LAYOUT Ã¢â‚¬â€ unchanged from v6
  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  return (
    <div style={{ fontFamily: sans }}>
      <div style={premiumShell(isDark)}>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
          background: isDark
            ? "radial-gradient(circle at top right, rgba(16,185,129,0.10), transparent 24%), radial-gradient(circle at bottom left, rgba(59,130,246,0.08), transparent 26%)"
            : "radial-gradient(circle at top right, rgba(16,185,129,0.10), transparent 24%), radial-gradient(circle at bottom left, rgba(59,130,246,0.06), transparent 26%)" }} />

        <div style={{ position: "relative" }}>
          {/* 1. REGIME BANNER */}
          <RegimeBanner regime={regime} pc={pc} regimeSubtitle={regimeSubtitle}
            range={range} setRange={setRange} isDark={isDark} T={T}
            regimeDuration={regimeDuration} scanMode={scanMode} setScanMode={setScanMode}
            livePulse={livePulse} refreshing={refreshing} onRefresh={handleRefresh} />

          {/* 2. SIGNAL STRIP */}
          <SignalStrip signals={signals} isDark={isDark} scanMode={scanMode} />

          {scanMode ? (
            <ScanView
              score={score} scoreLabel={scoreLabel} momentum={momentum}
              metrics={metrics} isDark={isDark} T={T} fiveDayRows={fiveDayRows}
              pc={pc} livePulse={livePulse}
            />
          ) : (
            <>
              {/* 3. UNIFIED SCORE + MOMENTUM */}
              <UnifiedPanel score={score} phase={regime.phase} momentum={momentum} isDark={isDark} />

              {/* 4. MARKET MESSAGE */}
              <MarketMessage msg={msg} phase={regime.phase} isDark={isDark} T={T} />

              {/* 5. METRIC GROUPS */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16,
                padding: "0 18px 18px" }}>
                <div style={{ ...premiumSection(isDark, `${pc.txt}10`), borderRadius: 22, padding: "18px" }}>
                  <MetricGroup title="Trend Health" subtitle="Long-term structure - core signal"
                    metrics={metrics.trend} isDark={isDark} T={T} fiveDayRows={fiveDayRows}
                    score={score} groupWeight="primary" />
                </div>
                <div style={{ ...premiumSection(isDark, `${SEV.improving}10`), borderRadius: 22, padding: "18px" }}>
                  <MetricGroup title="Momentum" subtitle="Short and intermediate participation"
                    metrics={metrics.momentum} isDark={isDark} T={T} fiveDayRows={fiveDayRows}
                    score={score} groupWeight="secondary" />
                </div>
                <div style={{ ...premiumSection(isDark, `${SEV.neutral}10`), borderRadius: 22, padding: "18px" }}>
                  <MetricGroup title="Extremes" subtitle="Leadership and stress confirmation"
                    metrics={metrics.extremes} isDark={isDark} T={T} fiveDayRows={fiveDayRows}
                    score={score} groupWeight="tertiary" />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}







