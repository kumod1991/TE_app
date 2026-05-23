// ============================================================
//  WatchlistSidebar.jsx  — v3 Professional Revamp
//  ✅ Full T.* token compliance — works in light & dark mode
//  📱 Mobile: footer always visible, RS green line shown
//  🎨 Revamped: cleaner layout, better typography, polish
//
//  WHAT CHANGED vs v2:
//  - Root height uses CSS-injected 100dvh fallback chain → footer always visible on iOS/Android
//  - List section has minHeight:0 (critical Safari flex-shrink fix)
//  - Footer uses position:sticky + bottom:0 + zIndex:2 — never clipped
//  - WatchlistItem now shows heat dot + green border accent on BOTH desktop & mobile
//    (previously the green left-border accent was only triggered on active items;
//     now non-active high-heat lists get a subtle accent too, matching PC behaviour)
//  - Redesigned header: usage pill replaces raw progress bar, cleaner hierarchy
//  - Redesigned items: unified padding, better font sizing, no redundant "N stocks" label
//  - Redesigned footer: label above input, refined sizing
//  - No business logic, state, props, or data flow changed
// ============================================================

import { useState, useMemo, useCallback, memo, useEffect, useRef } from "react";

// ─── Style injection ──────────────────────────────────────────
function useInjectStyles(T, isMobile) {
  const prevKey = useRef(null);

  useEffect(() => {
    const key = `${T.border}|${T.subtext}|${T.hover}|${T.green}|${T.neg ?? ""}|${isMobile}`;
    if (prevKey.current === key) return;
    prevKey.current = key;

    let el = document.getElementById("wls-styles");
    if (!el) {
      el = document.createElement("style");
      el.id = "wls-styles";
      document.head.appendChild(el);
    }
    el.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');

      .wls-root * { box-sizing: border-box; }

      .wls-root ::-webkit-scrollbar { width: ${isMobile ? "2px" : "3px"}; }
      .wls-root ::-webkit-scrollbar-track { background: transparent; }
      .wls-root ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 99px; }
      .wls-root ::-webkit-scrollbar-thumb:hover { background: ${T.subtext}; }

      @keyframes wls-shimmer {
        0%   { background-position: -200% 0; }
        100% { background-position:  200% 0; }
      }
      @keyframes wls-fadein {
        from { opacity: 0; transform: translateY(4px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .wls-item-wrap { animation: wls-fadein 0.18s ease both; }
      .wls-icon-btn:hover { opacity: 1 !important; background: ${T.hover} !important; }
      .wls-new-input::placeholder { color: ${T.subtext}; opacity: 0.45; }
      .wls-root { position: relative; isolation: isolate; }
      .wls-root::before {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        background:
          radial-gradient(circle at top left, ${T.green}12 0, transparent 28%),
          radial-gradient(circle at bottom right, ${(T.accent ?? "#2563eb")}12 0, transparent 32%);
        z-index: -1;
      }

      /* ── Mobile: full-height fallback chain ─────────────────
         Browsers apply the LAST value they understand:
           100vh                 — universal fallback
           -webkit-fill-available — iOS Safari <15.4
           100dvh                — Chrome 108+, Safari 15.4+  */
      ${isMobile ? `
        .wls-root {
          height: calc(100vh - 60px);
          height: calc(-webkit-fill-available - 60px);
          height: calc(100dvh - 60px - env(safe-area-inset-bottom, 0px));
        }
        .wls-root input[type="text"],
        .wls-root input:not([type]) { font-size: 16px !important; }
        .wls-root * { -webkit-tap-highlight-color: rgba(0,0,0,0.06); }
      ` : ""}
    `;
  }, [T, isMobile]);
}

// ─── Watchlist meta ───────────────────────────────────────────
function useWatchlistMeta(watchlists, activeWl, rows) {
  return useMemo(() => {
    const meta = {};
    if (!rows || rows.length === 0) return {};

    const total     = rows.length;
    const leaders   = rows.filter(r => (r.rs_rating ?? 0) >= 85).length;
    const improving = rows.filter(r => (r.ret_3m  ?? 0) > 10).length;
    const weakening = rows.filter(r => (r.ret_3m  ?? 0) < 0).length;
    const ratio     = total > 0 ? leaders / total : 0;

    const heat =
      ratio >= 0.4  ? 3 :
      ratio >= 0.25 ? 2 :
      ratio >= 0.1  ? 1 : 0;

    const quality  = total > 0 ? Math.round((leaders / total) * 100) : 0;
    const topStock = [...rows].sort((a, b) => (b.rs_rating || 0) - (a.rs_rating || 0))[0]?.ticker;

    if (activeWl) {
      meta[activeWl] = { total, leaders, heat, improving, weakening, quality, topStock };
    }
    return meta;
  }, [watchlists, activeWl, rows]);
}

// ─── Heat accent ──────────────────────────────────────────────
function heatColor(heat, T) {
  if (heat >= 3) return "#f59e0b";
  if (heat >= 2) return T.pos ?? T.green;
  if (heat >= 1) return T.green;
  return T.border;
}

// ─── Icons ────────────────────────────────────────────────────
const IconPencil = () => (
  <svg width="11" height="11" viewBox="0 0 14 14" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5z"/>
  </svg>
);
const IconTrash = () => (
  <svg width="11" height="11" viewBox="0 0 14 14" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3,4 11,4"/>
    <path d="M5 4V3h4v1"/>
    <path d="M4 4l.6 7.4a1 1 0 001 .6h2.8a1 1 0 001-.6L10 4"/>
  </svg>
);
const IconPlus = () => (
  <svg width="11" height="11" viewBox="0 0 14 14" fill="none"
    stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
    <line x1="7" y1="2"  x2="7"  y2="12"/>
    <line x1="2" y1="7"  x2="12" y2="7"/>
  </svg>
);
const IconClose = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <line x1="3" y1="3" x2="13" y2="13"/>
    <line x1="13" y1="3" x2="3" y2="13"/>
  </svg>
);

// ─── Skeleton ────────────────────────────────────────────────
function SkeletonRow({ widthPct, delay, T }) {
  return (
    <div style={{
      margin: "3px 10px",
      height: 26,
      borderRadius: 5,
      width: `${widthPct}%`,
      background: T.card,
      backgroundImage: `linear-gradient(90deg, transparent 0%, ${T.border} 50%, transparent 100%)`,
      backgroundSize: "200% 100%",
      animation: `wls-shimmer 1.6s ${delay}s infinite`,
    }} />
  );
}

// ─── Watchlist Item ───────────────────────────────────────────
const WatchlistItem = memo(function WatchlistItem({
  w, isActive, isEditing, renameVal, setRenameVal,
  onSelect, onRename, onRenameCancel, onRenameStart, onDelete,
  meta, T, isMobile, onCloseSidebar,
}) {
  const [hov, setHov] = useState(false);
  const m   = meta || {};
  const acc = heatColor(m.heat ?? 0, T);

  // Green left border logic — mirrors what StockRow does for RS ≥ 90.
  // Active list → green border (same as PC). High-heat list → subtle accent.
  // This is what was missing on mobile in v2.
  const borderLeft = isActive
    ? `2px solid ${T.green}`
    : (m.heat ?? 0) >= 2
      ? `2px solid ${acc}55`
      : "2px solid transparent";

  return (
    <div
      className="wls-item-wrap"
      style={{
        margin: isMobile ? "1px 8px" : "1px 6px",
        borderRadius: 14,
        background: isActive ? `${T.green}18` : hov ? T.hover : T.card,
        borderLeft,
        border: `1px solid ${isActive ? `${T.green}35` : hov ? T.border : `${T.border}90`}`,
        boxShadow: isActive ? `0 10px 24px ${T.shadow ?? "rgba(15,23,42,0.08)"}` : "none",
        transition: "background 0.12s ease, border-color 0.15s",
        cursor: isEditing ? "default" : "pointer",
      }}
      onClick={() => {
        if (isEditing) return;
        onSelect(w.id);
        if (isMobile && onCloseSidebar) onCloseSidebar();
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {isEditing ? (
        <div style={{ padding: isMobile ? "8px 10px" : "6px 10px" }}>
          <input
            autoFocus
            value={renameVal}
            onChange={e => setRenameVal(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter")  onRename(w.id);
              if (e.key === "Escape") onRenameCancel();
            }}
            onBlur={() => onRename(w.id)}
            onClick={e => e.stopPropagation()}
            style={{
              width: "100%", padding: "5px 8px",
              background: T.card, border: `1px solid ${T.green}`,
              borderRadius: 5, color: T.text,
              fontSize: isMobile ? 14 : 13, outline: "none",
              fontFamily: "'DM Sans', sans-serif",
            }}
          />
        </div>
      ) : (
        <div style={{
          display: "flex",
          alignItems: "center",
          padding: isMobile ? "14px 12px" : "9px 10px",
          minHeight: isMobile ? 48 : "auto",
          gap: 6,
        }}>
          {/* Heat dot — visible on BOTH mobile and desktop (was missing on mobile) */}
          <span style={{
            width: m.heat >= 3 ? 6 : m.heat >= 2 ? 5 : 4,
            height: m.heat >= 3 ? 6 : m.heat >= 2 ? 5 : 4,
            borderRadius: "50%",
            background: acc,
            boxShadow: m.heat >= 3 ? `0 0 5px ${acc}` : m.heat >= 2 ? `0 0 3px ${acc}` : "none",
            flexShrink: 0,
            transition: "background 0.15s",
          }} />

          {/* Name */}
          <span style={{
            flex: 1,
            fontSize: isMobile ? 14 : 13,
            letterSpacing: "0.01em",
            fontWeight: isActive ? 600 : 400,
            color: isActive ? T.text : T.subtext,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontFamily: "'DM Sans', sans-serif",
            transition: "color 0.12s, font-weight 0.12s",
          }}>
            {w.name}
          </span>

          {/* Stock count — compact chip, both mobile and desktop */}
          {m.total > 0 && (
            <span style={{
              fontSize: 10,
              color: T.subtext,
              fontFamily: "'DM Mono', monospace",
              opacity: isActive ? 0.6 : 0.4,
              flexShrink: 0,
              letterSpacing: "0.02em",
            }}>
              {m.total}
            </span>
          )}

          {/* Action buttons */}
          <div style={{
            display: "flex",
            gap: 1,
            flexShrink: 0,
            opacity: isMobile ? (hov ? 1 : 0.35) : (hov ? 1 : 0),
            transition: "opacity 0.15s",
          }}>
            <button
              onClick={e => { e.stopPropagation(); onRenameStart(w); }}
              title="Rename"
              className="wls-icon-btn"
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: T.subtext,
                padding: isMobile ? "7px 8px" : "4px 5px",
                borderRadius: 5, lineHeight: 1, opacity: 0.7,
                minWidth: isMobile ? 34 : 24,
                minHeight: isMobile ? 34 : 24,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "opacity 0.12s, background 0.12s",
              }}>
              <IconPencil />
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDelete(w.id); }}
              title="Delete"
              className="wls-icon-btn"
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "#ef4444",
                padding: isMobile ? "7px 8px" : "4px 5px",
                borderRadius: 5, lineHeight: 1, opacity: 0.6,
                minWidth: isMobile ? 34 : 24,
                minHeight: isMobile ? 34 : 24,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "opacity 0.12s, background 0.12s",
              }}>
              <IconTrash />
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

// ─── Main Component ───────────────────────────────────────────
export default function WatchlistSidebar({
  sidebarOpen,
  setSidebarOpen,
  watchlists,
  activeWl,
  setActiveWl,
  createWatchlist,
  renameWatchlist,
  deleteWatchlist,
  addStock,
  wlLoading,
  newWlName,
  setNewWlName,
  wlError,
  setWlError,
  creatingWl,
  renamingId,
  setRenamingId,
  renameVal,
  setRenameVal,
  addTicker,
  setAddTicker,
  addError,
  setAddError,
  allRows,
  loadFullWatchlist,
  sidebarScrollRef,
  TickerSearch,
  T,
  isMobile = false,
  onClose,
}) {
  useInjectStyles(T, isMobile);

  const MAX_WATCHLISTS = 25;
  const atWatchlistLimit = watchlists.length >= MAX_WATCHLISTS;

  useEffect(() => {
    if (!activeWl) return;
    loadFullWatchlist(activeWl);
  }, [activeWl, loadFullWatchlist]);

  const wlMeta = useWatchlistMeta(watchlists, activeWl, allRows);

  const [newFocus, setNewFocus] = useState(false);

  const handleRenameStart = useCallback((w) => {
    setRenamingId(w.id);
    setRenameVal(w.name);
  }, [setRenamingId, setRenameVal]);

  const handleRenameCancel = useCallback(() => {
    setRenamingId(null);
  }, [setRenamingId]);

  const usageRatio    = watchlists.length / MAX_WATCHLISTS;
  const progressColor = atWatchlistLimit ? (T.neg ?? "#f87171") : T.green;
  const counterColor  = atWatchlistLimit ? (T.neg ?? "#f87171") : T.subtext;
  const newInputBorder = wlError ? (T.neg ?? "#f87171") : newFocus ? T.green : T.border;
  const createDisabled = !newWlName.trim() || creatingWl || atWatchlistLimit;
  const createBg       = createDisabled ? "transparent" : T.green;
  const createColor    = createDisabled ? T.border : "#000";
  const createBorder   = createDisabled ? T.border : T.green;

  // Swipe-to-close
  const touchStart = useRef(null);
  const touchEnd   = useRef(null);

  const handleTouchStart = (e) => {
    touchEnd.current   = null;
    touchStart.current = e.targetTouches[0].clientX;
  };
  const handleTouchMove = (e) => {
    touchEnd.current = e.targetTouches[0].clientX;
  };
  const handleTouchEnd = () => {
    if (!touchStart.current || !touchEnd.current) return;
    if (touchStart.current - touchEnd.current > 50 && isMobile && onClose) onClose();
  };

  return (
    <div
      className="wls-root"
      style={{
        width: "100%",
        // On mobile: exclude the ~60px bottom action bar so the "New Watchlist" footer
        // is always visible. CSS injection handles the -webkit-fill-available fallback.
        // On desktop: 100% fills the flex parent naturally.
        height: isMobile ? "calc(100dvh - 60px - env(safe-area-inset-bottom, 0px))" : "100%",
        // minHeight:0 lets this flex child shrink below its content size on desktop.
        minHeight: 0,
        flexShrink: 0,
        background: T.surface,
        borderRight: isMobile ? "none" : `1px solid ${T.border}`,
        borderRadius: isMobile ? 0 : 24,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "'DM Sans', sans-serif",
        boxShadow: isMobile ? "none" : `0 16px 36px ${T.shadow ?? "rgba(15,23,42,0.08)"}`,
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >

      {/* ══ HEADER ═══════════════════════════════════════════════ */}
      <div style={{
        flexShrink: 0,
        padding: isMobile ? "14px 13px 0" : "10px 10px 0",
        borderBottom: `1px solid ${T.border}`,
        background: isMobile ? T.surface : "linear-gradient(180deg, transparent, rgba(255,255,255,0.02))",
      }}>

        {/* Title row */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: isMobile ? 11 : 9,
        }}>
          <span style={{
            fontSize: isMobile ? 10.5 : 9.5,
            fontWeight: 700,
            color: T.subtext,
            textTransform: "uppercase",
            letterSpacing: "0.17em",
            fontFamily: "'DM Sans', sans-serif",
            opacity: 0.75,
          }}>
            Watchlists
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {/* Usage pill: progress bar + counter */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              background: T.card,
              border: `1px solid ${T.border}`,
              borderRadius: 99,
              padding: "2px 8px 2px 6px",
            }}>
              <div style={{
                width: 22, height: 3, borderRadius: 99,
                background: T.border, overflow: "hidden",
              }}>
                <div style={{
                  width: `${Math.min(usageRatio * 100, 100)}%`,
                  height: "100%", borderRadius: 99,
                  background: progressColor,
                  transition: "width 0.3s ease",
                }} />
              </div>
              <span style={{
                fontSize: 10, fontWeight: 500,
                color: counterColor,
                fontFamily: "'DM Mono', monospace",
                letterSpacing: "0.02em",
              }}>
                {watchlists.length}<span style={{ opacity: 0.4 }}>/{MAX_WATCHLISTS}</span>
              </span>
            </div>

            {/* Close (mobile only) */}
            {isMobile && onClose && (
              <button
                onClick={onClose}
                aria-label="Close sidebar"
                style={{
                  background: T.card,
                  border: `1px solid ${T.border}`,
                  borderRadius: 6,
                  width: 28, height: 28,
                  cursor: "pointer",
                  color: T.subtext,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  padding: 0,
                }}
              >
                <IconClose />
              </button>
            )}
          </div>
        </div>

        {/* Add-ticker row */}
        <div style={{ paddingBottom: isMobile ? 11 : 9 }}>
          {isMobile && (
            <div style={{
              marginBottom: 8,
              padding: "12px 12px 11px",
              borderRadius: 16,
              border: `1px solid ${T.border}`,
              background: T.card,
              boxShadow: `0 10px 24px ${T.shadow ?? "rgba(15,23,42,0.08)"}`,
            }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.text, letterSpacing: "-0.03em", marginBottom: 4, fontFamily: "'DM Sans', sans-serif" }}>
                Focused watchlists
              </div>
              <div style={{ fontSize: 12, color: T.subtext, lineHeight: 1.45, fontFamily: "'DM Sans', sans-serif" }}>
                Organize leaders, setups, and high-conviction names with a cleaner mobile workflow.
              </div>
            </div>
          )}
          <div style={{
            marginBottom: 8,
            padding: isMobile ? "10px 11px" : "9px 10px",
            borderRadius: 14,
            border: `1px solid ${T.border}`,
            background: T.card,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.text, marginBottom: 3, fontFamily: "'DM Sans', sans-serif" }}>
              Curate leaders, breakouts, and setups
            </div>
            <div style={{ fontSize: 11, color: T.subtext, lineHeight: 1.45, fontFamily: "'DM Sans', sans-serif" }}>
              Add a ticker to keep this watchlist actionable across desktop and mobile.
            </div>
          </div>
          <TickerSearch
            value={addTicker}
            onChange={v => { setAddTicker(v); setAddError(""); }}
            onSelect={v => { setAddTicker(v); setAddError(""); }}
            onSubmit={addStock}
            addError={addError}
            T={T}
            compact={!isMobile}
            isMobile={isMobile}
          />
          {addError && (
            <div style={{
              marginTop: 5,
              fontSize: isMobile ? 12 : 11,
              color: T.neg ?? "#f87171",
              fontFamily: "'DM Sans', sans-serif",
              lineHeight: 1.4,
            }}>
              {addError}
            </div>
          )}
        </div>
      </div>

      {/* ══ LIST ═════════════════════════════════════════════════ */}
      {/*
          flex:1 + minHeight:0 is the correct flex-scroll pattern.
          Without minHeight:0, Safari makes this child expand to fit
          all content, pushing the footer off screen.
          Bottom padding reserves space above the sticky footer.
      */}
          <div
              ref={sidebarScrollRef}
              style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: "auto",
                  overflowX: "hidden",

                  // Bottom padding gives breathing room above the sticky footer
                  padding: isMobile ? "6px 0 80px" : "6px 0 10px",

                  WebkitOverflowScrolling: "touch",
              }}
          >
        {wlLoading ? (
          <div style={{ paddingTop: 6 }}>
            {[72, 55, 88, 60, 78, 50, 66].map((w, i) => (
              <SkeletonRow key={i} widthPct={w} delay={i * 0.08} T={T} />
            ))}
          </div>
        ) : watchlists.length === 0 ? (
          <div style={{
            padding: "28px 14px",
            textAlign: "center",
            color: T.subtext,
            fontSize: 12,
            opacity: 0.5,
            fontFamily: "'DM Sans', sans-serif",
          }}>
            No watchlists yet
          </div>
        ) : (
          watchlists.map((w) => (
            <WatchlistItem
              key={w.id}
              w={w}
              isActive={w.id === activeWl}
              isEditing={renamingId === w.id}
              renameVal={renameVal}
              setRenameVal={setRenameVal}
              onSelect={setActiveWl}
              onRename={renameWatchlist}
              onRenameCancel={handleRenameCancel}
              onRenameStart={handleRenameStart}
              onDelete={deleteWatchlist}
              meta={wlMeta[w.id] || null}
              T={T}
              isMobile={isMobile}
              onCloseSidebar={isMobile ? onClose : undefined}
            />
          ))
        )}
      </div>

      {/* ══ FOOTER ═══════════════════════════════════════════════
          position:sticky keeps this pinned to the viewport bottom
          without removing it from flow. zIndex:2 keeps it above
          list items during iOS momentum scroll.
          env(safe-area-inset-bottom) = iPhone notch home bar spacing.
      */}
          <div style={{
              flexShrink: 0,
              position: "sticky",
              bottom: 0,
              zIndex: 10,                     // 🔥 stronger layering
              background: T.surface,
              borderTop: `1px solid ${T.border}`,

              // 👇 IMPORTANT: prevents cut-off on mobile
              padding: isMobile
                  ? "12px 12px calc(14px + env(safe-area-inset-bottom))"
                  : "10px",

              boxShadow: isMobile
                  ? "0 -6px 20px rgba(0,0,0,0.25)"
                  : "none",
          }}>
        {/* Section label */}
        <div style={{
          fontSize: 9,
          fontWeight: 700,
          color: T.subtext,
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          marginBottom: 6,
          opacity: 0.45,
          fontFamily: "'DM Sans', sans-serif",
        }}>
          New watchlist
        </div>

        {/* Input + button */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            className="wls-new-input"
            value={newWlName}
            onChange={e => { setNewWlName(e.target.value); setWlError(""); }}
            onKeyDown={e => e.key === "Enter" && createWatchlist()}
            onFocus={() => setNewFocus(true)}
            onBlur={() => setNewFocus(false)}
            placeholder={atWatchlistLimit ? "Limit reached" : "Name…"}
            disabled={atWatchlistLimit}
            style={{
              flex: 1,
              padding: isMobile ? "10px 11px" : "6px 9px",
              background: T.card,
              border: `1px solid ${newInputBorder}`,
              borderRadius: 6,
              color: atWatchlistLimit ? T.border : T.text,
              fontSize: isMobile ? 14 : 12,
              outline: "none",
              opacity: atWatchlistLimit ? 0.35 : 1,
              fontFamily: "'DM Sans', sans-serif",
              letterSpacing: "0.01em",
              transition: "border-color 0.15s",
              cursor: atWatchlistLimit ? "not-allowed" : "text",
            }}
          />
          <button
            onClick={createWatchlist}
            disabled={createDisabled}
            title="Create watchlist"
            style={{
              width: isMobile ? 42 : 29,
              height: isMobile ? 42 : 29,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              background: createBg,
              color: createColor,
              border: `1px solid ${createBorder}`,
              borderRadius: 6,
              cursor: createDisabled ? "not-allowed" : "pointer",
              opacity: createDisabled ? 0.35 : 1,
              transition: "all 0.15s",
            }}
          >
            <IconPlus />
          </button>
        </div>

        {wlError && (
          <div style={{
            marginTop: 5,
            fontSize: isMobile ? 11 : 10,
            color: T.neg ?? "#f87171",
            fontFamily: "'DM Sans', sans-serif",
            lineHeight: 1.4,
          }}>
            {wlError}
          </div>
        )}
      </div>
    </div>
  );
}
