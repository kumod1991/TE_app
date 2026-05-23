/**
 * /pages/technicals/vcp.jsx
 * VCP Pattern Screen — Volatility Contraction Pattern candidates
 *
 * Props:
 *   T       — theme tokens from THEMES.light / THEMES.dark (passed from parent)
 *   onBack  — callback to go back to Screens list
 *
 * Data source: Supabase `vcp_candidates` table
 */

import { useState, useEffect, useMemo } from "react";

/* ─── Supabase config (mirrors App.jsx) ─────────────────────────────────────── */
const SUPABASE_URL     = "https://munqjcjvzgqyxzlmuyjj.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bnFqY2p2emdxeXh6bG11eWpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3MDc5NzEsImV4cCI6MjA4NzI4Mzk3MX0.9nHH5bTsL-RRwMMPoxTBFz3896BlhBBhUPGh0xP3U4Q";

/* ─── Shared font stacks ─────────────────────────────────────────────────────── */
const SANS = "'IBM Plex Sans', system-ui, sans-serif";
const MONO = "'IBM Plex Mono', monospace";

/* ─── Column definition ─────────────────────────────────────────────────────── */
const COLS = [
  { key: "ticker",              label: "Symbol",      w: "130px", align: "left"   },
  { key: "exchange",            label: "Exch",        w: "56px",  align: "left"   },
  { key: "vcp_score",           label: "Score",       w: "70px",  align: "right",  sort: true },
  { key: "category",            label: "Type",        w: "100px", align: "left"   },
  { key: "contractions",        label: "Legs",        w: "48px",  align: "right",  sort: true },
  { key: "contraction_pattern", label: "Pattern",     w: "140px", align: "left"   },
  { key: "pct_from_high",       label: "Near High",   w: "80px",  align: "right",  sort: true },
  { key: "base_depth",          label: "Base Depth",  w: "80px",  align: "right",  sort: true },
  { key: "volume_dryup",        label: "Vol Dry",     w: "60px",  align: "center" },
  { key: "tight_range",         label: "Tight",       w: "52px",  align: "center" },
  { key: "near_pivot",          label: "Pivot",       w: "52px",  align: "center" },
  { key: "breakout_level",      label: "Pivot Price", w: "90px",  align: "right"  },
  { key: "detected_at",         label: "Time",        w: "70px",  align: "right"  },
];

const PAGE_SIZE = 50;

/* ══════════════════════════════════════════════════════════════════════════════
   VCPScreen component
══════════════════════════════════════════════════════════════════════════════ */
export default function VCPScreen({ T, onBack }) {
  /* Detect dark mode from theme */
  const isDark = T?.bg !== "#f0f4f8"; // THEMES.light.bg
  const ACCENT = isDark ? "#6366f1" : "#4f46e5";

  /* ── State ── */
  const [rows,        setRows]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [catFilter,   setCatFilter]   = useState("ALL");   // ALL | IDEAL | DEVELOPING
  const [scoreFilter, setScoreFilter] = useState("ALL");   // ALL | HIGH | MID
  const [nearPivot,   setNearPivot]   = useState(false);
  const [sortKey,     setSortKey]     = useState("vcp_score");
  const [sortDir,     setSortDir]     = useState("desc");
  const [page,        setPage]        = useState(0);

  /* ── Fetch once on mount ── */
  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${SUPABASE_URL}/rest/v1/vcp_candidates?select=*&order=vcp_score.desc`, {
      headers: {
        apikey:        SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => { setRows(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(e  => { setError(e.message); setLoading(false); });
  }, []);

  /* ── Memoised filter + sort ── */
  const filtered = useMemo(() => {
    let r = rows;
    if (catFilter   !== "ALL")  r = r.filter(x => x.category === catFilter);
    if (scoreFilter === "HIGH") r = r.filter(x => Number(x.vcp_score) >= 80);
    if (scoreFilter === "MID")  r = r.filter(x => Number(x.vcp_score) >= 60 && Number(x.vcp_score) < 80);
    if (nearPivot)              r = r.filter(x => x.near_pivot);
    return [...r].sort((a, b) => {
      const av = a[sortKey] ?? 0, bv = b[sortKey] ?? 0;
      return sortDir === "desc" ? (bv > av ? 1 : -1) : (av > bv ? 1 : -1);
    });
  }, [rows, catFilter, scoreFilter, nearPivot, sortKey, sortDir]);

  const idealRows      = useMemo(() => filtered.filter(r => r.category === "IDEAL"),      [filtered]);
  const developingRows = useMemo(() => filtered.filter(r => r.category !== "IDEAL"),      [filtered]);
  const paginated      = useMemo(() => filtered.slice(page * PAGE_SIZE, (page+1)*PAGE_SIZE), [filtered, page]);
  const totalPages     = Math.ceil(filtered.length / PAGE_SIZE);

  /* ── Mini insights ── */
  const tightest     = useMemo(() =>
    rows.length ? [...rows].sort((a,b) => Number(a.base_depth||99) - Number(b.base_depth||99))[0] : null,
    [rows]);
  const closestBreak = useMemo(() =>
    rows.filter(r => r.pct_from_high != null)
        .sort((a,b) => Math.abs(Number(a.pct_from_high)) - Math.abs(Number(b.pct_from_high)))[0] || null,
    [rows]);

  /* ── Colour helpers ── */
  const scoreColor = v => {
    const n = Number(v);
    if (n >= 80) return isDark ? "#4ade80"  : "#15803d";
    if (n >= 60) return isDark ? "#818cf8"  : "#4f46e5";
    return isDark ? "#64748b" : "#94a3b8";
  };
  const scoreTagBg = v => {
    const n = Number(v);
    if (n >= 80) return isDark ? "rgba(74,222,128,0.13)"   : "rgba(21,128,61,0.09)";
    if (n >= 60) return isDark ? "rgba(129,140,248,0.15)"  : "rgba(79,70,229,0.09)";
    return isDark ? "rgba(100,116,139,0.12)" : "rgba(148,163,184,0.12)";
  };
  const boolIcon = (v, icon) => v
    ? <span style={{ fontSize: 13 }}>{icon}</span>
    : <span style={{ color: T?.muted, fontSize: 11 }}>—</span>;
  const fmtTime  = v => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? v : d.toLocaleDateString("en-IN", { day:"2-digit", month:"short" });
  };
  const toggleSort = key => {
    if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
    setPage(0);
  };

  /* ── Sub-components ── */
  const FilterBtn = ({ active, onClick, children }) => (
    <button onClick={onClick} style={{
      height: 28, padding: "0 12px",
      border: `1px solid ${active ? ACCENT : T?.border}`,
      borderRadius: 5,
      background: active
        ? (isDark ? "rgba(99,102,241,0.15)" : "rgba(79,70,229,0.08)")
        : "transparent",
      color: active ? ACCENT : T?.subtext, fontSize: 12, fontFamily: SANS,
      fontWeight: active ? 600 : 400, cursor: "pointer", transition: ".12s",
      whiteSpace: "nowrap",
    }}>{children}</button>
  );

  const ColHeader = ({ col }) => (
    <div
      style={{
        textAlign: col.align, fontSize: 10, fontWeight: 700,
        textTransform: "uppercase", letterSpacing: ".07em", color: T?.muted,
        cursor: col.sort ? "pointer" : "default",
        paddingRight: col.align === "right" ? 4 : 0,
        paddingLeft: col.align === "left" && col.key === "ticker" ? 16 : 0,
        display: "flex", alignItems: "center",
        justifyContent: col.align === "right" ? "flex-end"
          : col.align === "center" ? "center" : "flex-start",
        gap: 4,
      }}
      onClick={col.sort ? () => toggleSort(col.key) : undefined}
      onMouseEnter={e => { if (col.sort) e.currentTarget.style.color = ACCENT; }}
      onMouseLeave={e => { e.currentTarget.style.color = T?.muted; }}
    >
      {col.label}
      {col.sort && sortKey === col.key && (
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none"
          stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: sortDir === "desc" ? "rotate(180deg)" : "none", transition: ".15s" }}>
          <path d="M4 1v6M1 4l3-3 3 3" />
        </svg>
      )}
    </div>
  );

  const SectionHeader = ({ icon, label, count, color }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10,
      padding: "14px 16px 10px", marginTop: 8 }}>
      <span style={{ fontSize: 15 }}>{icon}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color, fontFamily: SANS,
        letterSpacing: ".01em" }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600,
        color, opacity: .6 }}>({count})</span>
    </div>
  );

  const RenderRow = ({ row }) => {
    const hue      = row.ticker.split("").reduce((h,c) => h + c.charCodeAt(0)*37, 0) % 360;
    const avatarBg = isDark ? `hsl(${hue},18%,16%)` : `hsl(${hue},28%,91%)`;
    const avatarFg = isDark ? `hsl(${hue},40%,62%)` : `hsl(${hue},36%,32%)`;
    const isIdeal  = row.category === "IDEAL";

    return (
      <div
        style={{ display: "grid", gridTemplateColumns: COLS.map(c => c.w).join(" "),
          padding: "9px 0", borderBottom: `1px solid ${T?.border}`,
          transition: "background .08s", cursor: "pointer", alignItems: "center" }}
        onMouseEnter={e => e.currentTarget.style.background = T?.hover}
        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
      >
        {/* Symbol */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, paddingLeft: 16 }}>
          <div style={{ flexShrink: 0, width: 30, height: 18, borderRadius: 3,
            background: avatarBg, display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 4px", fontSize: 7.5, fontWeight: 700, color: avatarFg,
            fontFamily: MONO, textTransform: "uppercase", letterSpacing: ".03em" }}>
            {row.ticker?.slice(0, 4)}
          </div>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: T?.text,
            fontVariantNumeric: "tabular-nums" }}>
            {row.ticker}
          </span>
        </div>

        {/* Exchange */}
        <div style={{ fontSize: 10, fontWeight: 600, color: T?.muted,
          fontFamily: MONO, letterSpacing: ".04em" }}>{row.exchange}</div>

        {/* Score */}
        <div style={{ textAlign: "right", paddingRight: 4 }}>
          <span style={{ display: "inline-block", fontFamily: MONO, fontSize: 12, fontWeight: 700,
            padding: "2px 7px", borderRadius: 4,
            background: scoreTagBg(row.vcp_score), color: scoreColor(row.vcp_score) }}>
            {row.vcp_score != null ? Number(row.vcp_score).toFixed(0) : "—"}
          </span>
        </div>

        {/* Category badge */}
        <div>
          <span style={{
            display: "inline-block", fontSize: 10, fontWeight: 700,
            padding: "2px 8px", borderRadius: 3, letterSpacing: ".04em",
            textTransform: "uppercase", fontFamily: MONO,
            background: isIdeal
              ? (isDark ? "rgba(74,222,128,0.12)"  : "rgba(21,128,61,0.08)")
              : (isDark ? "rgba(251,191,36,0.12)"  : "rgba(180,130,0,0.09)"),
            color: isIdeal
              ? (isDark ? "#4ade80"  : "#15803d")
              : (isDark ? "#fbbf24"  : "#a16207"),
            border: `1px solid ${isIdeal
              ? (isDark ? "rgba(74,222,128,0.25)"  : "rgba(21,128,61,0.2)")
              : (isDark ? "rgba(251,191,36,0.25)"  : "rgba(180,130,0,0.2)")}`,
          }}>
            {isIdeal ? "IDEAL" : "DEV"}
          </span>
        </div>

        {/* Legs */}
        <div style={{ fontFamily: MONO, fontSize: 12, textAlign: "right", paddingRight: 4,
          color: T?.text, fontVariantNumeric: "tabular-nums" }}>
          {row.contractions ?? "—"}
        </div>

        {/* Pattern */}
        <div style={{ fontSize: 11, color: T?.subtext, fontFamily: MONO,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.contraction_pattern ?? "—"}
        </div>

        {/* Near High */}
        <div style={{ textAlign: "right", paddingRight: 4, fontFamily: MONO, fontSize: 12,
          fontVariantNumeric: "tabular-nums",
          color: row.pct_from_high != null
            ? (Math.abs(Number(row.pct_from_high)) <= 5 ? (isDark ? "#4ade80" : "#15803d") : T?.text)
            : T?.muted }}>
          {row.pct_from_high != null ? `${Number(row.pct_from_high).toFixed(1)}%` : "—"}
        </div>

        {/* Base Depth */}
        <div style={{ textAlign: "right", paddingRight: 4, fontFamily: MONO, fontSize: 12,
          color: T?.subtext, fontVariantNumeric: "tabular-nums" }}>
          {row.base_depth != null ? `${Number(row.base_depth).toFixed(1)}%` : "—"}
        </div>

        {/* Boolean badges */}
        <div style={{ textAlign: "center" }}>{boolIcon(row.volume_dryup, "📉")}</div>
        <div style={{ textAlign: "center" }}>{boolIcon(row.tight_range,  "📦")}</div>
        <div style={{ textAlign: "center" }}>{boolIcon(row.near_pivot,   "🎯")}</div>

        {/* Pivot Price */}
        <div style={{ textAlign: "right", paddingRight: 4, fontFamily: MONO, fontSize: 12,
          color: T?.text, fontVariantNumeric: "tabular-nums" }}>
          {row.breakout_level != null
            ? `₹${Number(row.breakout_level).toLocaleString("en-IN", { maximumFractionDigits: 1 })}`
            : "—"}
        </div>

        {/* Time */}
        <div style={{ textAlign: "right", paddingRight: 16, fontSize: 11, color: T?.muted }}>
          {fmtTime(row.detected_at) ?? "—"}
        </div>
      </div>
    );
  };

  /* ── Main render ── */
  return (
    <div style={{ fontFamily: SANS, flex: 1, overflow: "auto", minHeight: 0,
      display: "flex", flexDirection: "column",
      background: T?.bg, color: T?.text }}>

      {/* ── TOP BAR ── */}
      <div style={{ flexShrink: 0, background: T?.card, borderBottom: `1px solid ${T?.border}`,
        padding: "0 24px", display: "flex", alignItems: "center",
        height: 44, gap: 14, position: "sticky", top: 0, zIndex: 20 }}>
        <button onClick={onBack}
          style={{ display: "flex", alignItems: "center", gap: 5,
            background: "none", border: "none", color: T?.subtext, cursor: "pointer",
            fontSize: 12, fontFamily: SANS, padding: 0, transition: "color .12s" }}
          onMouseEnter={e => e.currentTarget.style.color = T?.text}
          onMouseLeave={e => e.currentTarget.style.color = T?.subtext}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 8H3M7 12l-4-4 4-4" />
          </svg>
          Screens
        </button>
        <span style={{ color: T?.border }}>›</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: T?.text }}>VCP Pattern</span>
        {!loading && (
          <span style={{ fontFamily: MONO, fontSize: 11, color: T?.muted }}>
            {filtered.length} setups
          </span>
        )}
      </div>

      {/* ── FILTER BAR ── */}
      <div style={{ flexShrink: 0, padding: "10px 24px", background: T?.surface,
        borderBottom: `1px solid ${T?.border}`,
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 11, color: T?.muted, marginRight: 2,
            textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600 }}>Type:</span>
          {[["ALL","All"],["IDEAL","🔥 Ideal"],["DEVELOPING","⚡ Developing"]].map(([v,l]) => (
            <FilterBtn key={v} active={catFilter === v}
              onClick={() => { setCatFilter(v); setPage(0); }}>{l}</FilterBtn>
          ))}
        </div>

        <div style={{ width: 1, height: 20, background: T?.border, margin: "0 4px" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 11, color: T?.muted, marginRight: 2,
            textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600 }}>Score:</span>
          {[["ALL","All"],["HIGH","≥80"],["MID","60–80"]].map(([v,l]) => (
            <FilterBtn key={v} active={scoreFilter === v}
              onClick={() => { setScoreFilter(v); setPage(0); }}>{l}</FilterBtn>
          ))}
        </div>

        <div style={{ width: 1, height: 20, background: T?.border, margin: "0 4px" }} />

        <FilterBtn active={nearPivot}
          onClick={() => { setNearPivot(p => !p); setPage(0); }}>
          🎯 Near Pivot
        </FilterBtn>

        <div style={{ flex: 1 }} />

        {!loading && rows.length > 0 && (
          <span style={{ fontSize: 11, color: T?.muted, fontFamily: MONO }}>
            Sorted: {COLS.find(c => c.key === sortKey)?.label} {sortDir === "desc" ? "↓" : "↑"}
          </span>
        )}
      </div>

      {/* ── INSIGHTS BAR ── */}
      {!loading && !error && rows.length > 0 && (
        <div style={{ flexShrink: 0, padding: "8px 24px",
          borderBottom: `1px solid ${T?.border}`,
          display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          {tightest && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: T?.muted,
                textTransform: "uppercase", letterSpacing: ".07em" }}>Tightest Contraction</span>
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600,
                color: isDark ? "#4ade80" : "#15803d" }}>
                {tightest.ticker} · {Number(tightest.base_depth || 0).toFixed(1)}%
              </span>
            </div>
          )}
          {closestBreak && (
            <>
              <span style={{ color: T?.border }}>·</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: T?.muted,
                  textTransform: "uppercase", letterSpacing: ".07em" }}>Closest to Breakout</span>
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600,
                  color: isDark ? "#818cf8" : "#4f46e5" }}>
                  {closestBreak.ticker} · {Number(closestBreak.pct_from_high || 0).toFixed(1)}%
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── LOADING ── */}
      {loading && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: 12, color: T?.muted }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%",
            border: `2px solid ${T?.border}`, borderTopColor: ACCENT,
            animation: "spin .8s linear infinite" }} />
          <span style={{ fontSize: 13 }}>Fetching VCP candidates…</span>
        </div>
      )}

      {/* ── ERROR ── */}
      {!loading && error && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 28 }}>⚠️</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: T?.text }}>Failed to load data</span>
          <span style={{ fontSize: 12, color: T?.muted }}>{error}</span>
        </div>
      )}

      {/* ── EMPTY ── */}
      {!loading && !error && filtered.length === 0 && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 32 }}>📊</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: T?.text }}>
            No VCP setups found for today
          </span>
          <span style={{ fontSize: 12, color: T?.muted }}>
            Market may not be in contraction phase
          </span>
        </div>
      )}

      {/* ── TABLE ── */}
      {!loading && !error && filtered.length > 0 && (
        <div style={{ flex: 1, overflow: "auto" }}>

          {/* Column headers — sticky */}
          <div style={{
            display: "grid",
            gridTemplateColumns: COLS.map(c => c.w).join(" "),
            padding: "8px 0",
            borderBottom: `1px solid ${T?.border}`,
            background: T?.tableHead,
            position: "sticky", top: 0, zIndex: 5,
          }}>
            {COLS.map(col => <ColHeader key={col.key} col={col} />)}
          </div>

          {/* Rows — grouped when no category filter */}
          {catFilter === "ALL" ? (
            <>
              {idealRows.length > 0 && (
                <>
                  <SectionHeader icon="🔥" label="IDEAL SETUPS"
                    count={idealRows.length} color={isDark ? "#4ade80" : "#15803d"} />
                  {idealRows.map((row, i) => <RenderRow key={row.ticker + i} row={row} />)}
                </>
              )}
              {developingRows.length > 0 && (
                <>
                  <SectionHeader icon="⚡" label="DEVELOPING SETUPS"
                    count={developingRows.length} color={isDark ? "#fbbf24" : "#a16207"} />
                  {developingRows.map((row, i) => <RenderRow key={row.ticker + i} row={row} />)}
                </>
              )}
            </>
          ) : (
            /* Flat paginated view */
            paginated.map((row, i) => <RenderRow key={row.ticker + i} row={row} />)
          )}

          {/* Pagination (only in filtered/flat view) */}
          {totalPages > 1 && catFilter !== "ALL" && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
              gap: 8, padding: "20px 0", borderTop: `1px solid ${T?.border}` }}>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                style={{ height: 28, padding: "0 12px", border: `1px solid ${T?.border}`,
                  borderRadius: 5, background: "transparent", color: T?.subtext,
                  cursor: page === 0 ? "not-allowed" : "pointer", fontSize: 12, fontFamily: SANS,
                  opacity: page === 0 ? .4 : 1 }}>← Prev</button>
              <span style={{ fontSize: 12, color: T?.muted, fontFamily: MONO }}>
                {page + 1} / {totalPages}
              </span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
                style={{ height: 28, padding: "0 12px", border: `1px solid ${T?.border}`,
                  borderRadius: 5, background: "transparent", color: T?.subtext,
                  cursor: page === totalPages - 1 ? "not-allowed" : "pointer",
                  fontSize: 12, fontFamily: SANS,
                  opacity: page === totalPages - 1 ? .4 : 1 }}>Next →</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
