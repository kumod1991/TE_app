import { useState, useEffect, useMemo, useRef, useCallback, createContext, useContext } from "react";
import { useLearnCatalog, useLessonBody, prefetchLessonBody } from "./learnData";

/*
 * LearnModule — structured courses on fundamental and technical analysis, plus case studies and a glossary.
 * Props: T (theme tokens). All styling is inline with theme tokens.
 * Progress is stored in localStorage (guarded) under LS_KEY.
 */

const SANS = "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif";
const MONO = "'IBM Plex Mono', monospace";
const LS_KEY = "te_learn_progress_v1";
const SHELL_MAX = 1400;   // same centered container width as StockDashboard
const TEXT_MAX = 940;     // readable measure for paragraphs and lists only

/* Catalog (tracks, lessons, groups, glossary) now comes from the backend via learnData.js. */
const CatalogCtx = createContext(null);

function loadProgress(lessonIndex) {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return { done: {}, last: null };
        const p = JSON.parse(raw);
        return {
            done: p && typeof p.done === "object" && p.done ? p.done : {},
            last: p && typeof p.last === "string" && lessonIndex[p.last] != null ? p.last : null,
        };
    } catch {
        return { done: {}, last: null };
    }
}

function saveProgress(p) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch { }
}

function useIsMobile(breakpoint = 860) {
    const [mobile, setMobile] = useState(() => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(`(max-width: ${breakpoint}px)`).matches);
    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return undefined;
        const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
        const apply = () => setMobile(mq.matches);
        apply();
        if (mq.addEventListener) mq.addEventListener("change", apply);
        else mq.addListener(apply);
        return () => {
            if (mq.removeEventListener) mq.removeEventListener("change", apply);
            else mq.removeListener(apply);
        };
    }, [breakpoint]);
    return mobile;
}

/* ── Theme: same token system as StockDashboard's buildDashboardTheme ────── */
function hexToRgb(hex) {
    const v = String(hex || "").replace("#", "").trim();
    const n = v.length === 3 ? v.split("").map(c => c + c).join("") : v;
    if (!/^[0-9a-fA-F]{6}$/.test(n)) return null;
    const num = parseInt(n, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function withAlpha(color, alpha) {
    if (!color || typeof color !== "string") return `rgba(15, 23, 42, ${alpha})`;
    if (color.startsWith("rgba")) return color.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, `rgba($1,$2,$3,${alpha})`);
    if (color.startsWith("rgb(")) return color.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
    const rgb = hexToRgb(color);
    return rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})` : color;
}

function luminance(color) {
    const rgb = hexToRgb(color);
    if (!rgb) return 1;
    const ch = c => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * ch(rgb.r) + 0.7152 * ch(rgb.g) + 0.0722 * ch(rgb.b);
}

function buildLearnTheme(T = {}) {
    const bg = T.bg || "#f6f7f5";
    const isDark = luminance(bg) < 0.32;
    const accent = T.accent || (isDark ? "#7fa8db" : "#1e3a5f");
    const surface = T.surface || (isDark ? "#12161d" : "#ffffff");
    const card = T.card || surface;
    const text = T.text || (isDark ? "#f4f5f3" : "#14181f");
    const muted = T.muted || (isDark ? "#9aa1ab" : "#6b7280");
    const subtext = T.subtext || muted;
    const pos = T.posMid || T.pos || "#0e7a53";
    const neg = T.negMid || T.neg || "#c23b3b";
    const amber = T.amber || (isDark ? "#e0a33a" : "#b7791f");
    const gold = T.gold || (isDark ? "#d4b15a" : "#a67c1a");
    return {
        ...T,
        bg, surface, card, text, muted, subtext, accent, pos, neg, amber, gold, isDark,
        posText: T.posText || pos,
        negText: T.negText || neg,
        onAccent: luminance(accent) > 0.5 ? "#14181f" : "#ffffff",
        panelBorder: isDark ? withAlpha("#e2e8f0", 0.12) : withAlpha("#0f172a", 0.08),
        softFill: isDark ? withAlpha("#94a3b8", 0.08) : withAlpha("#e2e8f0", 0.45),
        hoverBg: isDark ? withAlpha(accent, 0.1) : withAlpha(accent, 0.05),
        tableHeadBg: isDark ? withAlpha("#0b0e13", 0.9) : "#fafaf8",
        shadowSm: isDark ? "0 1px 2px rgba(0,0,0,0.4)" : "0 1px 2px rgba(15,23,42,0.08)",
        shadowMd: isDark ? "0 8px 20px rgba(0,0,0,0.28)" : "0 1px 2px rgba(15,23,42,0.03), 0 8px 20px rgba(15,23,42,0.04)",
        shadowLg: isDark ? "0 12px 32px rgba(0,0,0,0.34)" : "0 1px 2px rgba(15,23,42,0.04), 0 12px 28px rgba(15,23,42,0.05)",
        ring: withAlpha(accent, isDark ? 0.32 : 0.18),
        pillBg: isDark ? "#181d26" : "#f1f2ef",
        accentSoft: withAlpha(accent, isDark ? 0.16 : 0.08),
        posSoft: withAlpha(pos, isDark ? 0.15 : 0.08),
        negSoft: withAlpha(neg, isDark ? 0.15 : 0.07),
        amberSoft: withAlpha(amber, isDark ? 0.15 : 0.09),
        goldSoft: withAlpha(gold, isDark ? 0.15 : 0.09),
    };
}


function buildCss(T) {
    return `
        .lm-root, .lm-root * { box-sizing: border-box; }
        .lm-root { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
        .lm-root button { outline: none; font-family: inherit; }
        .lm-root button:focus-visible, .lm-root input:focus-visible { box-shadow: 0 0 0 3px ${T.ring}; }
        .lm-root ::-webkit-scrollbar { height: 9px; width: 9px; }
        .lm-root ::-webkit-scrollbar-thumb { background: ${withAlpha(T.muted, 0.34)}; border-radius: 999px; }
        .lm-root ::-webkit-scrollbar-track { background: transparent; }
        .lm-out, .lm-opt, .lm-nav, .lm-seg, .lm-ghost, .lm-input, .lm-done { transition: background .16s ease, border-color .16s ease, color .16s ease, box-shadow .16s ease; }
        .lm-out:hover { background: ${T.hoverBg}; }
        .lm-opt:not(:disabled):hover { border-color: ${withAlpha(T.accent, 0.5)}; background: ${T.hoverBg}; }
        .lm-nav:not(:disabled):hover { border-color: ${withAlpha(T.accent, 0.45)}; box-shadow: ${T.shadowMd}; }
        .lm-ghost:not(:disabled):hover { border-color: ${withAlpha(T.accent, 0.45)}; }
        .lm-done:hover { box-shadow: ${T.shadowMd}; }
        .lm-input:focus { border-color: ${T.accent}; box-shadow: 0 0 0 3px ${T.ring}; outline: none; }
        .lm-article { animation: lmIn .28s ease; }
        .lm-bar { transition: width .5s cubic-bezier(.2,.7,.2,1); }
        .lm-skel { animation: lmPulse 1.2s ease-in-out infinite; }
        @keyframes lmPulse { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
        @keyframes lmIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) {
            .lm-article, .lm-skel { animation: none; }
            .lm-root *, .lm-bar { transition: none !important; }
        }
    `;
}

function Icon({ name, size = 16, stroke = 2 }) {
    const p = {
        width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: stroke,
        strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: "false", style: { flex: "0 0 auto", display: "block" },
    };
    switch (name) {
        case "check": return <svg {...p}><polyline points="20 6 9 17 4 12" /></svg>;
        case "bulb": return <svg {...p}><path d="M9 18h6" /><path d="M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" /></svg>;
        case "alert": return <svg {...p}><path d="M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
        case "pin": return <svg {...p}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" /></svg>;
        case "spark": return <svg {...p}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" /></svg>;
        case "book": return <svg {...p}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16z" /><path d="M4 21.5A2.5 2.5 0 0 1 6.5 19H20" /></svg>;
        case "clock": return <svg {...p}><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>;
        case "left": return <svg {...p}><polyline points="15 18 9 12 15 6" /></svg>;
        case "right": return <svg {...p}><polyline points="9 18 15 12 9 6" /></svg>;
        case "down": return <svg {...p}><polyline points="6 9 12 15 18 9" /></svg>;
        case "search": return <svg {...p}><circle cx="11" cy="11" r="7" /><line x1="20" y1="20" x2="16.5" y2="16.5" /></svg>;
        case "sigma": return <svg {...p}><path d="M18 4H6l6 8-6 8h12" /></svg>;
        case "flask": return <svg {...p}><path d="M9 3h6" /><path d="M10 3v6L4.5 19a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9V3" /></svg>;
        case "x": return <svg {...p}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
        case "reset": return <svg {...p}><polyline points="1 4 1 10 7 10" /><path d="M3.5 15a9 9 0 1 0 2.1-9.4L1 10" /></svg>;
        default: return null;
    }
}

/* Small rounded-square icon tile, same shape language as StockAvatar. */
function Tile({ color, size = 28, children, radius }) {
    return (
        <span aria-hidden="true" style={{
            width: size, height: size, minWidth: size, borderRadius: radius ?? Math.round(size * 0.32),
            background: withAlpha(color, 0.14), color, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto",
        }}>{children}</span>
    );
}

/* ── Inline **bold** ─────────────────────────────────────────────────────── */
function Inline({ x, T }) {
    const parts = String(x ?? "").split(/(\*\*[^*]+\*\*)/g);
    return (
        <>
            {parts.map((p, i) =>
                p.length > 4 && p.startsWith("**") && p.endsWith("**")
                    ? <strong key={i} style={{ fontWeight: 650, color: T.text }}>{p.slice(2, -2)}</strong>
                    : <span key={i}>{p}</span>
            )}
        </>
    );
}

const NUMERIC_CELL = /^[()₹\d.,x%\s−+-]+$/;
const isNumericCell = (s) => {
    const clean = String(s ?? "").replace(/\*\*/g, "").trim();
    return clean.length > 0 && NUMERIC_CELL.test(clean);
};

/* ── Callouts ────────────────────────────────────────────────────────────── */
function calloutStyle(kind, T) {
    switch (kind) {
        case "warn": return { color: T.amber, soft: T.amberSoft, label: "Watch out", icon: "alert" };
        case "india": return { color: T.gold, soft: T.goldSoft, label: "India context", icon: "pin" };
        case "tip": return { color: T.pos, soft: T.posSoft, label: "Tip", icon: "spark" };
        default: return { color: T.accent, soft: T.accentSoft, label: "Key idea", icon: "bulb" };
    }
}

/* ── Block renderer ──────────────────────────────────────────────────────── */
function Block({ b, T, mobile }) {
    switch (b.t) {
        case "p":
            return <p style={{ margin: "0 0 18px", maxWidth: TEXT_MAX, fontSize: 16, lineHeight: 1.8, color: T.text }}><Inline x={b.x} T={T} /></p>;
        case "h":
            return <h3 style={{ margin: "34px 0 12px", maxWidth: TEXT_MAX, fontSize: 18.5, fontWeight: 700, letterSpacing: "-0.015em", lineHeight: 1.35, color: T.text }}>{b.x}</h3>;
        case "ul":
        case "ol": {
            const Tag = b.t;
            return (
                <Tag style={{ margin: "0 0 20px", maxWidth: TEXT_MAX, paddingLeft: 22, color: T.text, fontSize: 16, lineHeight: 1.75 }}>
                    {b.items.map((it, i) => <li key={i} style={{ marginBottom: 8, paddingLeft: 3 }}><Inline x={it} T={T} /></li>)}
                </Tag>
            );
        }
        case "formula":
            return (
                <div style={{ margin: "8px 0 24px", border: `1px solid ${T.panelBorder}`, borderRadius: 14, background: T.card, boxShadow: T.shadowMd, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 14px", background: T.tableHeadBg, borderBottom: `1px solid ${T.panelBorder}` }}>
                        <Tile color={T.accent} size={24}><Icon name="sigma" size={13} /></Tile>
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: T.text, letterSpacing: "-0.005em" }}>{b.label}</span>
                    </div>
                    <div style={{ padding: "16px 18px" }}>
                        <pre style={{ margin: 0, fontFamily: MONO, fontSize: 14.5, fontWeight: 500, lineHeight: 1.7, color: T.text, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{b.expr}</pre>
                        {b.note && <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.panelBorder}`, fontSize: 13.5, lineHeight: 1.65, color: T.subtext }}><Inline x={b.note} T={T} /></div>}
                    </div>
                </div>
            );
        case "table": {
            const cols = b.head.length;
            const numericCol = b.head.map((_, c) => c > 0 && b.rows.every(r => !r[c] || isNumericCell(r[c])) && b.rows.some(r => r[c]));
            const stackable = mobile && cols <= 3 && !numericCol.slice(1).every(Boolean);
            if (stackable) {
                return (
                    <figure style={{ margin: "8px 0 24px" }}>
                        {b.caption && <figcaption style={{ fontSize: 13.5, fontWeight: 700, color: T.text, marginBottom: 10 }}>{b.caption}</figcaption>}
                        <div style={{ border: `1px solid ${T.panelBorder}`, borderRadius: 14, background: T.card, boxShadow: T.shadowMd, overflow: "hidden" }}>
                            {b.rows.map((r, ri) => (
                                <div key={ri} style={{ padding: "12px 14px", borderBottom: ri === b.rows.length - 1 ? "none" : `1px solid ${T.panelBorder}` }}>
                                    <div style={{ fontSize: 14.5, fontWeight: 700, color: T.text, lineHeight: 1.45, marginBottom: 6 }}><Inline x={r[0]} T={T} /></div>
                                    {r.slice(1).map((cell, k) => cell ? (
                                        <div key={k} style={{ marginTop: k ? 6 : 0 }}>
                                            <div style={{ fontSize: 11.5, fontWeight: 700, color: T.muted, letterSpacing: "0.04em", marginBottom: 1 }}>{b.head[k + 1]}</div>
                                            <div style={{ fontSize: 14, lineHeight: 1.55, color: T.subtext, fontFamily: numericCol[k + 1] ? MONO : SANS }}><Inline x={cell} T={T} /></div>
                                        </div>
                                    ) : null)}
                                </div>
                            ))}
                        </div>
                    </figure>
                );
            }
            const stickyFirst = mobile ? { position: "sticky", left: 0, zIndex: 1 } : null;
            return (
                <figure style={{ margin: "8px 0 26px" }}>
                    {b.caption && <figcaption style={{ fontSize: 13.5, fontWeight: 700, color: T.text, marginBottom: 10, letterSpacing: "-0.005em" }}>{b.caption}</figcaption>}
                    <div style={{ overflowX: "auto", border: `1px solid ${T.panelBorder}`, borderRadius: 14, background: T.card, boxShadow: T.shadowMd, overscrollBehavior: "contain" }}>
                        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 14, minWidth: cols > 3 ? 560 : 0 }}>
                            <thead>
                                <tr>
                                    {b.head.map((h, c) => (
                                        <th key={c} style={{
                                            textAlign: numericCol[c] ? "right" : "left", padding: "11px 14px", fontWeight: 700, color: T.muted, fontSize: 12,
                                            letterSpacing: "0.06em", textTransform: "uppercase", background: T.tableHeadBg, borderBottom: `1px solid ${T.panelBorder}`, whiteSpace: "nowrap",
                                            ...(c === 0 ? stickyFirst : null),
                                        }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {b.rows.map((r, ri) => (
                                    <tr key={ri}>
                                        {r.map((cell, c) => (
                                            <td key={c} style={{
                                                padding: "11px 14px", verticalAlign: "top", color: T.text, lineHeight: 1.55,
                                                textAlign: numericCol[c] ? "right" : "left",
                                                fontFamily: numericCol[c] ? MONO : SANS,
                                                fontWeight: c === 0 ? 600 : 400,
                                                fontVariantNumeric: "tabular-nums",
                                                borderBottom: ri === b.rows.length - 1 ? "none" : `1px solid ${T.panelBorder}`,
                                                minWidth: c === 0 ? 120 : 0,
                                                ...(c === 0 && stickyFirst ? { ...stickyFirst, background: T.card, boxShadow: `1px 0 0 ${T.panelBorder}` } : null),
                                            }}><Inline x={cell} T={T} /></td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </figure>
            );
        }
        case "callout": {
            const s = calloutStyle(b.kind, T);
            return (
                <aside style={{
                    margin: "8px 0 24px", display: "flex", gap: 12, alignItems: "flex-start", padding: "14px 16px", borderRadius: 14,
                    background: s.soft, border: `1px solid ${withAlpha(s.color, 0.24)}`,
                }}>
                    <Tile color={s.color} size={30}><Icon name={s.icon} size={16} /></Tile>
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: s.color, marginBottom: 3, letterSpacing: "-0.005em" }}>{b.title || s.label}</div>
                        <div style={{ fontSize: 14.5, lineHeight: 1.7, color: T.text }}><Inline x={b.x} T={T} /></div>
                    </div>
                </aside>
            );
        }
        case "lab":
            return <RatioLab T={T} />;
        default:
            return null;
    }
}

/* ── Quiz ────────────────────────────────────────────────────────────────── */
function Quiz({ items, T }) {
    const [picked, setPicked] = useState({});
    if (!items || !items.length) return null;
    const answered = Object.keys(picked).length;
    const correct = items.filter((q, i) => picked[i] === q.answer).length;
    const allDone = answered === items.length;
    const scoreColor = correct === items.length ? T.pos : T.amber;
    return (
        <section style={{ marginTop: 40, border: `1px solid ${T.panelBorder}`, borderRadius: 16, background: T.card, boxShadow: T.shadowMd, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 18px", background: T.tableHeadBg, borderBottom: `1px solid ${T.panelBorder}`, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Tile color={T.accent} size={28}><Icon name="check" size={15} /></Tile>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em", color: T.text }}>Check yourself</h3>
                </div>
                {allDone ? (
                    <span role="status" style={{ fontSize: 12.5, fontWeight: 700, fontFamily: MONO, padding: "3px 10px", borderRadius: 999, color: scoreColor, background: withAlpha(scoreColor, 0.12), border: `1px solid ${withAlpha(scoreColor, 0.26)}` }}>
                        {correct} of {items.length} correct
                    </span>
                ) : (
                    <span style={{ fontSize: 12.5, fontWeight: 700, fontFamily: MONO, color: T.muted }}>{answered}/{items.length} answered</span>
                )}
            </div>
            <div style={{ padding: "6px 18px 8px" }}>
                {items.map((q, qi) => {
                    const sel = picked[qi];
                    const done = sel != null;
                    return (
                        <div key={qi} style={{ padding: "16px 0", borderBottom: qi === items.length - 1 ? "none" : `1px solid ${T.panelBorder}` }}>
                            <div style={{ fontSize: 15, fontWeight: 650, lineHeight: 1.55, color: T.text, marginBottom: 12, letterSpacing: "-0.005em" }}>{q.q}</div>
                            <div role="group" aria-label={q.q} style={{ display: "grid", gap: 8 }}>
                                {q.options.map((opt, oi) => {
                                    const isRight = oi === q.answer;
                                    const isPicked = sel === oi;
                                    let border = T.panelBorder, bg = T.pillBg, color = T.text, opacity = 1, badgeBg = withAlpha(T.muted, 0.14), badgeColor = T.subtext;
                                    if (done && isRight) { border = withAlpha(T.pos, 0.5); bg = T.posSoft; color = T.text; badgeBg = T.pos; badgeColor = "#fff"; }
                                    else if (done && isPicked) { border = withAlpha(T.neg, 0.5); bg = T.negSoft; color = T.text; badgeBg = T.neg; badgeColor = "#fff"; }
                                    else if (done) { opacity = 0.6; }
                                    return (
                                        <button
                                            key={oi}
                                            type="button"
                                            className="lm-opt"
                                            disabled={done}
                                            onClick={() => setPicked(p => ({ ...p, [qi]: oi }))}
                                            style={{
                                                display: "flex", alignItems: "center", gap: 12, textAlign: "left", padding: "10px 14px", borderRadius: 12,
                                                border: `1px solid ${border}`, background: bg, color, opacity, fontSize: 14.5, lineHeight: 1.5,
                                                cursor: done ? "default" : "pointer",
                                            }}
                                        >
                                            <span aria-hidden="true" style={{ width: 24, height: 24, minWidth: 24, borderRadius: 8, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 12, fontWeight: 700, background: badgeBg, color: badgeColor }}>
                                                {done && isRight ? <Icon name="check" size={13} stroke={3} /> : done && isPicked ? <Icon name="x" size={13} stroke={3} /> : String.fromCharCode(65 + oi)}
                                            </span>
                                            <span style={{ flex: 1, minWidth: 0 }}>{opt}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            {done && (
                                <div style={{ marginTop: 12, padding: "11px 14px", borderRadius: 12, background: T.softFill, fontSize: 14, lineHeight: 1.65, color: T.subtext }}>
                                    <strong style={{ color: sel === q.answer ? T.posText : T.negText, fontWeight: 700 }}>{sel === q.answer ? "Correct. " : "Not quite. "}</strong>
                                    {q.why}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

/* ── Ratio Lab ───────────────────────────────────────────────────────────── */
const LAB_YEAR1 = {
    revenue: "24", cogs: "18", otherOpex: "3", otherIncome: "0", dep: "0.3", interest: "0.36", tax: "0.34",
    equity: "7", borrowings: "3", stBorrowings: "0", payables: "0.5", otherLiabs: "0",
    fixedAssets: "2.7", inventory: "5", receivables: "2", cash: "0.8", otherAssets: "0",
    cfo: "-0.2", capex: "0", shares: "5", price: "8",
};
const LAB_YEAR2 = {
    revenue: "30", cogs: "22.5", otherOpex: "3.6", otherIncome: "0", dep: "0.5", interest: "0.3", tax: "0.45",
    equity: "9.15", borrowings: "2.5", stBorrowings: "0", payables: "0.75", otherLiabs: "0",
    fixedAssets: "4.2", inventory: "5.9", receivables: "1.5", cash: "0.8", otherAssets: "0",
    cfo: "3", capex: "2", shares: "5", price: "8",
};
const LAB_DEFAULTS = LAB_YEAR1;

const LAB_GROUPS = [
    { title: "Profit & loss (₹ lakh)", fields: [
        ["revenue", "Revenue"], ["cogs", "Raw material / COGS"], ["otherOpex", "Employee + other expenses"],
        ["otherIncome", "Other income"], ["dep", "Depreciation"], ["interest", "Interest"], ["tax", "Tax"],
    ] },
    { title: "Funding side of balance sheet (₹ lakh)", fields: [
        ["equity", "Shareholders’ equity"], ["borrowings", "Total borrowings"], ["stBorrowings", "…of which due in 1 year"],
        ["payables", "Trade payables"], ["otherLiabs", "Other current liabilities"],
    ] },
    { title: "Asset side of balance sheet (₹ lakh)", fields: [
        ["fixedAssets", "Fixed assets, CWIP, investments"], ["inventory", "Inventory"], ["receivables", "Receivables"],
        ["cash", "Cash & bank"], ["otherAssets", "Other current assets"],
    ] },
    { title: "Cash flow and market", fields: [
        ["cfo", "Cash from operations (₹ lakh)"], ["capex", "Capex (₹ lakh)"], ["shares", "Shares (lakh)"], ["price", "Share price (₹)"],
    ] },
];

const num = (s) => {
    const n = Number(String(s ?? "").replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : 0;
};
const div = (a, b) => (b === 0 || !Number.isFinite(a / b) ? null : a / b);

function computeLab(v) {
    const n = Object.fromEntries(Object.keys(LAB_DEFAULTS).map(k => [k, num(v[k])]));
    const ebitda = n.revenue - n.cogs - n.otherOpex;
    const ebit = ebitda + n.otherIncome - n.dep;
    const pbt = ebit - n.interest;
    const pat = pbt - n.tax;
    const eps = div(pat, n.shares);
    const totalAssets = n.fixedAssets + n.inventory + n.receivables + n.cash + n.otherAssets;
    const fundingTotal = n.equity + n.borrowings + n.payables + n.otherLiabs;
    const currentAssets = n.inventory + n.receivables + n.cash + n.otherAssets;
    const currentLiab = n.payables + n.stBorrowings + n.otherLiabs;
    const capitalEmployed = n.equity + n.borrowings;
    const mcap = n.price * n.shares;
    const ev = mcap + n.borrowings - n.cash;
    const fcf = n.cfo - n.capex;
    const recDays = div(n.receivables * 365, n.revenue);
    const invDays = div(n.inventory * 365, n.cogs);
    const payDays = div(n.payables * 365, n.cogs);
    return {
        statements: { ebitda, ebit, pbt, pat, eps, totalAssets, fundingTotal, mcap, ev, fcf },
        balanced: Math.abs(totalAssets - fundingTotal) < 0.5,
        gap: totalAssets - fundingTotal,
        groups: [
            { title: "Profitability", items: [
                { k: "Gross margin", v: div((n.revenue - n.cogs) * 100, n.revenue), u: "%", f: "(Revenue − COGS) ÷ Revenue" },
                { k: "EBITDA margin", v: div(ebitda * 100, n.revenue), u: "%", f: "EBITDA ÷ Revenue" },
                { k: "Net margin", v: div(pat * 100, n.revenue), u: "%", f: "PAT ÷ Revenue" },
                { k: "ROE", v: div(pat * 100, n.equity), u: "%", f: "PAT ÷ Equity", tone: (x) => x >= 15 ? "good" : x >= 10 ? "watch" : "weak" },
                { k: "ROCE", v: div(ebit * 100, capitalEmployed), u: "%", f: "EBIT ÷ (Equity + Borrowings)", tone: (x) => x >= 15 ? "good" : x >= 10 ? "watch" : "weak" },
                { k: "ROA", v: div(pat * 100, totalAssets), u: "%", f: "PAT ÷ Total assets" },
            ] },
            { title: "Valuation", items: [
                { k: "P/E", v: eps && eps > 0 ? n.price / eps : null, u: "x", f: "Price ÷ EPS" },
                { k: "P/B", v: div(mcap, n.equity), u: "x", f: "Market cap ÷ Equity" },
                { k: "EV/EBITDA", v: ebitda > 0 ? div(ev, ebitda) : null, u: "x", f: "(Mcap + Debt − Cash) ÷ EBITDA" },
                { k: "P/S", v: div(mcap, n.revenue), u: "x", f: "Market cap ÷ Revenue" },
                { k: "Earnings yield", v: pat > 0 ? div(pat * 100, mcap) : null, u: "%", f: "PAT ÷ Market cap" },
                { k: "FCF yield", v: div(fcf * 100, mcap), u: "%", f: "(CFO − Capex) ÷ Market cap" },
            ] },
            { title: "Leverage and liquidity", items: [
                { k: "Debt / equity", v: div(n.borrowings, n.equity), u: "x", f: "Borrowings ÷ Equity", tone: (x) => x <= 1 ? "good" : x <= 2 ? "watch" : "weak" },
                { k: "Net debt / EBITDA", v: ebitda > 0 ? div(n.borrowings - n.cash, ebitda) : null, u: "x", f: "(Debt − Cash) ÷ EBITDA", tone: (x) => x <= 2 ? "good" : x <= 3.5 ? "watch" : "weak" },
                { k: "Interest cover", v: n.interest > 0 ? div(ebit, n.interest) : null, u: "x", f: "EBIT ÷ Interest", tone: (x) => x >= 3 ? "good" : x >= 1.5 ? "watch" : "weak" },
                { k: "Current ratio", v: div(currentAssets, currentLiab), u: "x", f: "Current assets ÷ Current liabilities", tone: (x) => (x >= 1.2 && x <= 3) ? "good" : x >= 1 ? "watch" : "weak" },
                { k: "Quick ratio", v: div(currentAssets - n.inventory, currentLiab), u: "x", f: "(Current assets − Inventory) ÷ Current liabilities" },
            ] },
            { title: "Efficiency and cash quality", items: [
                { k: "Receivable days", v: recDays, u: " d", f: "Receivables ÷ Revenue × 365", d: 0 },
                { k: "Inventory days", v: invDays, u: " d", f: "Inventory ÷ COGS × 365", d: 0 },
                { k: "Payable days", v: payDays, u: " d", f: "Payables ÷ COGS × 365", d: 0 },
                { k: "Cash conversion cycle", v: recDays != null && invDays != null && payDays != null ? recDays + invDays - payDays : null, u: " d", f: "Inventory + Receivable − Payable days", d: 0 },
                { k: "Asset turnover", v: div(n.revenue, totalAssets), u: "x", f: "Revenue ÷ Total assets" },
                { k: "CFO / EBITDA", v: ebitda > 0 ? div(n.cfo * 100, ebitda) : null, u: "%", f: "Cash from operations ÷ EBITDA", tone: (x) => x >= 60 ? "good" : x >= 40 ? "watch" : "weak" },
                { k: "CFO / PAT", v: pat > 0 ? div(n.cfo, pat) : null, u: "x", f: "Cash from operations ÷ PAT" },
                { k: "Capex / depreciation", v: div(n.capex, n.dep), u: "x", f: "Capex ÷ Depreciation" },
            ] },
        ],
    };
}

function fmtVal(v, u, d) {
    if (v == null || !Number.isFinite(v)) return "—";
    const digits = d != null ? d : (u === "%" || u === "x" ? 1 : 0);
    const s = v.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    return `${s}${u}`;
}

const fmtCr = (v, digits = 0) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits }));

function RatioLab({ T }) {
    const [vals, setVals] = useState(LAB_DEFAULTS);
    const res = useMemo(() => computeLab(vals), [vals]);
    const set = (k) => (e) => setVals(p => ({ ...p, [k]: e.target.value }));
    const toneColor = (t) => t === "good" ? T.pos : t === "watch" ? T.amber : t === "weak" ? T.neg : T.muted;
    const toneLabel = (t) => t === "good" ? "Healthy" : t === "watch" ? "Watch" : t === "weak" ? "Weak" : "";
    const isDefault = Object.keys(LAB_DEFAULTS).every(k => vals[k] === LAB_DEFAULTS[k]);
    const isYear1 = Object.keys(LAB_YEAR1).every(k => vals[k] === LAB_YEAR1[k]);
    const isYear2 = Object.keys(LAB_YEAR2).every(k => vals[k] === LAB_YEAR2[k]);
    const pill = (off) => ({ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 13px", borderRadius: 999, border: `1px solid ${T.panelBorder}`, background: T.pillBg, color: off ? T.muted : T.text, fontSize: 13, fontWeight: 650, cursor: off ? "default" : "pointer", opacity: off ? 0.7 : 1 });
    const s = res.statements;
    const balColor = res.balanced ? T.pos : T.amber;

    return (
        <div style={{ margin: "10px 0 28px", border: `1px solid ${T.panelBorder}`, borderRadius: 16, background: T.card, boxShadow: T.shadowLg, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "14px 18px", background: T.tableHeadBg, borderBottom: `1px solid ${T.panelBorder}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
                    <Tile color="#ea580c" size={36}><Icon name="flask" size={18} /></Tile>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em", color: T.text }}>Ravi's kirana shop</div>
                        <div style={{ fontSize: 12.5, color: T.muted }}>Year 1 and Year 2 from the lessons. Change any number and the ratios update.</div>
                    </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className="lm-ghost" onClick={() => setVals(LAB_YEAR1)} disabled={isYear1} style={pill(isYear1)}><Icon name="reset" size={13} />Year 1</button>
                    <button type="button" className="lm-ghost" onClick={() => setVals(LAB_YEAR2)} disabled={isYear2} style={pill(isYear2)}>Year 2</button>
                </div>
            </div>

            <div style={{ padding: "18px 18px 6px" }}>
                {LAB_GROUPS.map(g => (
                    <fieldset key={g.title} style={{ border: "none", margin: "0 0 18px", padding: 0, minWidth: 0 }}>
                        <legend style={{ fontSize: 13.5, fontWeight: 700, color: T.text, padding: 0, marginBottom: 10, letterSpacing: "-0.005em" }}>{g.title}</legend>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
                            {g.fields.map(([k, label]) => (
                                <label key={k} style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12.5, color: T.subtext, lineHeight: 1.35 }}>
                                    <span>{label}</span>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        className="lm-input"
                                        value={vals[k]}
                                        onChange={set(k)}
                                        style={{
                                            width: "100%", padding: "8px 11px", borderRadius: 10,
                                            border: `1px solid ${T.panelBorder}`, background: T.pillBg,
                                            color: T.text, fontFamily: MONO, fontSize: 14, fontWeight: 500, textAlign: "right", fontVariantNumeric: "tabular-nums",
                                        }}
                                    />
                                </label>
                            ))}
                        </div>
                    </fieldset>
                ))}
            </div>

            <div style={{ padding: "0 18px 18px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(104px, 1fr))", gap: 10, marginBottom: 14 }}>
                    {[
                        ["EBITDA", fmtCr(s.ebitda)], ["EBIT", fmtCr(s.ebit)], ["PAT", fmtCr(s.pat)],
                        ["EPS", s.eps == null ? "—" : `₹${fmtCr(s.eps, 1)}`], ["Market cap", fmtCr(s.mcap)], ["EV", fmtCr(s.ev)], ["FCF", fmtCr(s.fcf)],
                    ].map(([k, v]) => (
                        <div key={k} style={{ padding: "10px 12px", borderRadius: 12, background: T.softFill, border: `1px solid ${T.panelBorder}` }}>
                            <div style={{ fontSize: 12, color: T.muted, fontWeight: 600, marginBottom: 2 }}>{k}</div>
                            <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: T.text, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{v}</div>
                        </div>
                    ))}
                </div>

                <div role="status" style={{
                    display: "flex", alignItems: "flex-start", gap: 9, marginBottom: 22, padding: "10px 14px", borderRadius: 12, fontSize: 13.5, lineHeight: 1.55, fontWeight: 600,
                    color: res.balanced ? T.posText : T.amber, background: withAlpha(balColor, 0.09), border: `1px solid ${withAlpha(balColor, 0.24)}`,
                }}>
                    <span style={{ marginTop: 2 }}><Icon name={res.balanced ? "check" : "alert"} size={15} stroke={2.4} /></span>
                    <span>
                        {res.balanced
                            ? `Balance sheet balances: assets ${fmtCr(s.totalAssets)} = liabilities + equity ${fmtCr(s.fundingTotal)}.`
                            : `Balance sheet is off by ₹${fmtCr(Math.abs(res.gap))} Cr (assets ${fmtCr(s.totalAssets)} vs liabilities + equity ${fmtCr(s.fundingTotal)}). Real statements always balance, so fix an input.`}
                    </span>
                </div>

                {res.groups.map(g => (
                    <div key={g.title} style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 14.5, fontWeight: 700, color: T.text, marginBottom: 10, letterSpacing: "-0.01em" }}>{g.title}</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                            {g.items.map(it => {
                                const tone = it.tone && it.v != null ? it.tone(it.v) : null;
                                const tc = toneColor(tone);
                                return (
                                    <div key={it.k} style={{ border: `1px solid ${T.panelBorder}`, borderRadius: 14, padding: "12px 14px", background: T.surface }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, minHeight: 22 }}>
                                            <span style={{ fontSize: 13, color: T.subtext, fontWeight: 600 }}>{it.k}</span>
                                            {tone && (
                                                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: tc, padding: "2px 8px", borderRadius: 999, background: withAlpha(tc, 0.12), border: `1px solid ${withAlpha(tc, 0.24)}` }}>
                                                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: tc }} />{toneLabel(tone)}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em", color: T.text, margin: "4px 0 6px", fontVariantNumeric: "tabular-nums" }}>{fmtVal(it.v, it.u, it.d)}</div>
                                        <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.45 }}>{it.f}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
                <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.6 }}>
                    Status labels are rough rules of thumb for a typical non-financial company. They are for learning, not advice, and do not fit banks, NBFCs or very cyclical businesses.
                </div>
            </div>
        </div>
    );
}

/* ── Progress ring ───────────────────────────────────────────────────────── */
function ProgressRing({ pct, size = 40, stroke = 4, T, showLabel = false }) {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    return (
        <span style={{ position: "relative", width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)", display: "block" }} aria-hidden="true">
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={withAlpha(T.muted, 0.2)} strokeWidth={stroke} />
                <circle className="lm-bar" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={pct >= 100 ? T.pos : T.accent} strokeWidth={stroke} strokeLinecap="round"
                    strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, pct) / 100)} style={{ transition: "stroke-dashoffset .5s cubic-bezier(.2,.7,.2,1)" }} />
            </svg>
            {showLabel && <span style={{ position: "absolute", fontFamily: MONO, fontSize: Math.round(size * 0.27), fontWeight: 700, color: T.text, letterSpacing: "-0.03em" }}>{pct}%</span>}
        </span>
    );
}

function ProgressPill({ done, total, T, compact }) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    return (
        <div role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Course progress"
            style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: compact ? "4px 12px 4px 5px" : "5px 14px 5px 6px", borderRadius: 999, background: T.pillBg, border: `1px solid ${T.panelBorder}` }}>
            <ProgressRing pct={pct} size={compact ? 28 : 34} stroke={3.5} T={T} />
            <span style={{ fontSize: 13, color: T.subtext, whiteSpace: "nowrap" }}>
                <span style={{ fontFamily: MONO, fontWeight: 700, color: T.text }}>{done}/{total}</span>{compact ? "" : " lessons done"}
            </span>
        </div>
    );
}

/* ── Outline (lesson list) ───────────────────────────────────────────────── */
function Outline({ activeId, done, onPick, T, tracks, groups, mobile }) {
    const { trackColor } = useContext(CatalogCtx);
    const trackOf = (id) => { const t = tracks.find(tr => tr.lessons.some(l => l.id === id)); return t ? t.id : null; };
    const [open, setOpen] = useState(() => { const t = trackOf(activeId); return t ? { [t]: true } : {}; });
    useEffect(() => {
        const t = trackOf(activeId);
        if (t) setOpen(o => (o[t] ? o : { ...o, [t]: true }));
    }, [activeId]);
    const toggle = (id) => setOpen(o => ({ ...o, [id]: !o[id] }));
    const renderTrack = (tr) => {
                const d = tr.lessons.filter(l => done[l.id]).length;
                const n = tr.lessons.length;
                const col = trackColor(tr.id);
                const complete = d === n && n > 0;
                const isOpen = !!open[tr.id];
                return (
                    <div key={tr.id} style={{ marginBottom: mobile ? 6 : 18 }}>
                        <div style={{ padding: mobile ? "8px 10px 6px" : "4px 10px 8px" }}>
                            <button type="button" onClick={() => toggle(tr.id)} aria-expanded={isOpen} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: 0, border: "none", background: "transparent", cursor: "pointer", textAlign: "left", fontFamily: SANS }}>
                                <Tile color={col} size={24}>
                                    {complete ? <Icon name="check" size={13} stroke={3} /> : <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700 }}>{tracks.indexOf(tr) + 1}</span>}
                                </Tile>
                                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: T.text, letterSpacing: "-0.01em", lineHeight: 1.3 }}>{tr.title}</span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: complete ? T.pos : T.muted, fontFamily: MONO }}>{d}/{n}</span>
                                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "0 0 auto", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .15s ease" }}><polyline points="6 9 12 15 18 9" /></svg>
                            </button>
                            <div style={{ height: 3, borderRadius: 2, background: withAlpha(T.muted, 0.16), marginTop: mobile ? 7 : 9, overflow: "hidden" }}>
                                <div className="lm-bar" style={{ width: `${n ? (d / n) * 100 : 0}%`, height: "100%", background: complete ? T.pos : col, borderRadius: 2 }} />
                            </div>
                        </div>
                        {isOpen && tr.lessons.map(l => {
                            const active = l.id === activeId;
                            const isDone = !!done[l.id];
                            return (
                                <button
                                    key={l.id}
                                    type="button"
                                    className="lm-out"
                                    onClick={() => onPick(l.id)}
                                    aria-current={active ? "page" : undefined}
                                    style={{
                                        display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                                        padding: mobile ? "11px 10px" : "8px 10px", marginBottom: 2, cursor: "pointer", borderRadius: 10,
                                        border: `1px solid ${active ? withAlpha(col, 0.32) : "transparent"}`,
                                        background: active ? withAlpha(col, T.isDark ? 0.16 : 0.08) : "transparent",
                                        color: active ? T.text : T.subtext, fontSize: 13.5, lineHeight: 1.4, fontWeight: active ? 650 : 500,
                                    }}
                                >
                                    <span aria-hidden="true" style={{
                                        flex: "0 0 auto", width: 18, height: 18, borderRadius: "50%",
                                        border: `1.5px solid ${isDone ? T.pos : active ? col : withAlpha(T.muted, 0.5)}`,
                                        background: isDone ? T.pos : "transparent", color: "#fff",
                                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                                    }}>
                                        {isDone ? <Icon name="check" size={10} stroke={3.5} /> : active ? <span style={{ width: 6, height: 6, borderRadius: "50%", background: col }} /> : null}
                                    </span>
                                    <span style={{ flex: 1, minWidth: 0 }}>{l.title}</span>
                                    <span style={{ flex: "0 0 auto", fontSize: 12, color: T.muted, fontFamily: MONO }}>{l.minutes}m</span>
                                </button>
                            );
                        })}
                    </div>
                );
    };
    return (
        <nav aria-label="Course outline">
            {groups
                ? groups.map((g, gi) => {
                    const lessons = g.tracks.flatMap(t => t.lessons);
                    const d = lessons.filter(l => done[l.id]).length;
                    return (
                        <section key={g.id} aria-label={g.title} style={{ marginTop: gi === 0 ? 0 : (mobile ? 10 : 6), paddingTop: gi === 0 ? 0 : (mobile ? 10 : 14), borderTop: gi === 0 ? "none" : `1px solid ${T.panelBorder}` }}>
                            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "2px 10px 10px", fontFamily: SANS }}>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T.muted }}>
                                    {g.color && <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: g.color, boxShadow: `0 0 0 3px ${withAlpha(g.color, 0.18)}` }} />}{g.title}
                                </span>
                                <span style={{ fontSize: 11, fontWeight: 600, color: T.muted, fontFamily: MONO }}>{g.tracks.length} {g.tracks.length === 1 ? (g.unit || ["company", "companies"])[0] : (g.unit || ["company", "companies"])[1]} · {d}/{lessons.length}</span>
                            </div>
                            {g.tracks.map(renderTrack)}
                        </section>
                    );
                })
                : tracks.map(renderTrack)}
        </nav>
    );
}

/* ── Glossary ────────────────────────────────────────────────────────────── */
function Glossary({ T, mobile }) {
    const { ALL_TERMS } = useContext(CatalogCtx);
    const [q, setQ] = useState("");
    const [scope, setScope] = useState("all"); // all | fund | tech
    const items = useMemo(() => {
        const s = q.trim().toLowerCase();
        return ALL_TERMS
            .filter(g => scope === "all" || g.kind === scope)
            .sort((a, b) => a.term.localeCompare(b.term))
            .filter(g => !s || g.term.toLowerCase().includes(s) || g.def.toLowerCase().includes(s));
    }, [q, scope, ALL_TERMS]);
    const groups = useMemo(() => {
        const m = new Map();
        items.forEach(g => {
            const k = (g.term.trim()[0] || "#").toUpperCase();
            if (!m.has(k)) m.set(k, []);
            m.get(k).push(g);
        });
        return [...m.entries()];
    }, [items]);

    return (
        <div className="lm-article" style={{ width: "100%", maxWidth: SHELL_MAX, margin: "0 auto", padding: mobile ? "20px 14px 56px" : "32px 20px 72px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <h2 style={{ margin: 0, fontSize: mobile ? 23 : 28, fontWeight: 700, letterSpacing: "-0.025em", lineHeight: 1.2, color: T.text }}>Glossary</h2>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: T.accent, padding: "2px 9px", borderRadius: 999, background: T.accentSoft, border: `1px solid ${withAlpha(T.accent, 0.22)}`, fontFamily: MONO }}>{items.length}</span>
            </div>
            <p style={{ margin: "0 0 18px", fontSize: 15, color: T.subtext, lineHeight: 1.6 }}>Short definitions of the terms used across the fundamental and technical courses.</p>

            <div style={{ position: "sticky", top: 0, zIndex: 2, padding: "6px 0 14px", background: T.bg }}>
                <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: T.muted, display: "flex" }}><Icon name="search" size={16} /></span>
                    <input
                        type="search"
                        className="lm-input"
                        value={q}
                        onChange={e => setQ(e.target.value)}
                        placeholder="Search terms, e.g. ROCE or RSI"
                        aria-label="Search glossary"
                        style={{
                            width: "100%", padding: "12px 14px 12px 40px", borderRadius: 14,
                            border: `1px solid ${T.panelBorder}`, background: T.card, boxShadow: T.shadowMd,
                            color: T.text, fontFamily: SANS, fontSize: 14.5,
                        }}
                    />
                </div>
                <div role="group" aria-label="Glossary scope" style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    {[["all", "All"], ["fund", "Fundamentals"], ["tech", "Technicals"]].map(([id, label]) => {
                        const on = scope === id;
                        return (
                            <button key={id} type="button" className="lm-ghost" aria-pressed={on} onClick={() => setScope(id)} style={{
                                padding: "6px 14px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: on ? 700 : 600,
                                border: `1px solid ${on ? withAlpha(T.accent, 0.45) : T.panelBorder}`,
                                background: on ? T.accentSoft : T.card, color: on ? T.accent : T.subtext,
                            }}>{label}</button>
                        );
                    })}
                </div>
            </div>

            {items.length === 0 && (
                <div style={{ padding: "40px 20px", textAlign: "center", fontSize: 14.5, color: T.muted, border: `1px dashed ${T.panelBorder}`, borderRadius: 14 }}>
                    No terms match “{q}”. Try a shorter word.
                </div>
            )}

            {groups.map(([letter, list]) => (
                <section key={letter} style={{ marginBottom: 22 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                        <Tile color={T.accent} size={28}><span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700 }}>{letter}</span></Tile>
                        <div style={{ flex: 1, height: 1, background: T.panelBorder }} />
                    </div>
                    <dl style={{ margin: 0, border: `1px solid ${T.panelBorder}`, borderRadius: 14, background: T.card, boxShadow: T.shadowMd, overflow: "hidden" }}>
                        {list.map((g, i) => (
                            <div key={g.kind + g.term} style={{ padding: "14px 18px", borderBottom: i === list.length - 1 ? "none" : `1px solid ${T.panelBorder}` }}>
                                <dt style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 4, letterSpacing: "-0.01em" }}>
                                    {g.term}
                                    {scope === "all" && <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", padding: "1px 7px", borderRadius: 999, color: g.kind === "tech" ? "#7c3aed" : T.muted, background: g.kind === "tech" ? withAlpha("#7c3aed", 0.12) : T.pillBg, border: `1px solid ${g.kind === "tech" ? withAlpha("#7c3aed", 0.24) : T.panelBorder}` }}>{g.kind === "tech" ? "Technical" : "Fundamental"}</span>}
                                </dt>
                                <dd style={{ margin: 0, fontSize: 14.5, lineHeight: 1.7, color: T.subtext }}>{g.def}</dd>
                            </div>
                        ))}
                    </dl>
                </section>
            ))}
        </div>
    );
}

/* ── Main module ─────────────────────────────────────────────────────────── */
function LearnBody({ T: baseT }) {
    const catalog = useContext(CatalogCtx);
    const { LESSONS, LESSON_INDEX, COURSE_LESSONS, SECTIONS, TECH_LEVEL_OF, sectionOf, trackColor } = catalog;
    const T = useMemo(() => buildLearnTheme(baseT || {}), [baseT]);
    const mobile = useIsMobile();
    const [progress, setProgress] = useState(() => loadProgress(LESSON_INDEX));
    const [initialId] = useState(() => { const last = loadProgress(LESSON_INDEX).last; const l = last != null ? LESSONS[LESSON_INDEX[last]] : null; return l ? l.id : COURSE_LESSONS[0].id; });
    const [view, setView] = useState(() => sectionOf(LESSONS[LESSON_INDEX[initialId] ?? 0].trackId)); // course | tech | cases | glossary
    const [activeId, setActiveId] = useState(initialId);
    const lastBySection = useRef({});
    const [menuOpen, setMenuOpen] = useState(false);
    const [readPct, setReadPct] = useState(0);
    const scrollRef = useRef(null);
    const sideRef = useRef(null);
    const rafRef = useRef(0);

    const lesson = LESSONS[LESSON_INDEX[activeId] ?? 0];
    const section = sectionOf(lesson.trackId);
    const sec = SECTIONS[section];
    const techLevel = TECH_LEVEL_OF[lesson.trackId];
    const list = sec.lessons;
    const idx = list.indexOf(lesson);
    const prev = idx > 0 ? list[idx - 1] : null;
    const next = idx < list.length - 1 ? list[idx + 1] : null;
    const doneCount = list.filter(l => progress.done[l.id]).length;
    const isDone = !!progress.done[lesson.id];
    const col = trackColor(lesson.trackId);
    const body = useLessonBody(lesson.id, catalog.version);
    const nextId = next ? next.id : null;
    useEffect(() => { if (body.status === "ready" && nextId) prefetchLessonBody(nextId, catalog.version); }, [body.status, nextId, catalog.version]);

    const pick = useCallback((id) => {
        const target = sectionOf(LESSONS[LESSON_INDEX[id]].trackId);
        lastBySection.current[target] = id;
        setActiveId(id);
        setView(target);
        setMenuOpen(false);
        setProgress(p => {
            const np = { ...p, last: id };
            saveProgress(np);
            return np;
        });
    }, [LESSONS, LESSON_INDEX, sectionOf]);

    const toggleDone = () => {
        setProgress(p => {
            const done = { ...p.done };
            if (done[lesson.id]) delete done[lesson.id]; else done[lesson.id] = true;
            const np = { ...p, done };
            saveProgress(np);
            return np;
        });
    };

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTo({ top: 0 });
        setReadPct(0);
    }, [activeId, view]);

    useEffect(() => {
        const el = sideRef.current && sideRef.current.querySelector('[aria-current="page"]');
        if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
    }, [activeId, view, mobile, menuOpen]);

    useEffect(() => {
        if (!menuOpen) return undefined;
        const onKey = (e) => { if (e.key === "Escape") setMenuOpen(false); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [menuOpen]);

    useEffect(() => { if (!mobile) setMenuOpen(false); }, [mobile]);

    useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

    const onScroll = useCallback((e) => {
        const el = e.currentTarget;
        if (rafRef.current) return;
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = 0;
            const max = el.scrollHeight - el.clientHeight;
            setReadPct(max > 0 ? Math.min(100, Math.round((el.scrollTop / max) * 100)) : 0);
        });
    }, []);

    const switchView = (id) => {
        setMenuOpen(false);
        if (id === "glossary") { setView("glossary"); return; }
        if (id === section) { setView(id); return; }
        pick(lastBySection.current[id] || SECTIONS[id].lessons[0].id);
    };
    const segBtn = (id, label) => {
        const active = view === id;
        return (
            <button
                key={id}
                type="button"
                className="lm-seg"
                onClick={() => switchView(id)}
                aria-pressed={active}
                style={{
                    flex: mobile ? 1 : "0 0 auto", minHeight: mobile ? 36 : undefined, padding: mobile ? "7px 2px" : "7px 16px", border: "none", borderRadius: 9, cursor: "pointer", fontSize: mobile ? 12 : 13.5, whiteSpace: "nowrap", letterSpacing: "-0.005em",
                    fontWeight: active ? 700 : 600, background: active ? T.card : "transparent", color: active ? T.text : T.muted,
                    boxShadow: active ? T.shadowSm : "none",
                }}
            >{label}</button>
        );
    };

    const navBtn = (target, dir) => (
        <button
            type="button"
            className="lm-nav"
            disabled={!target}
            onClick={() => target && pick(target.id)}
            style={{
                flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 12, flexDirection: dir === "next" ? "row-reverse" : "row",
                textAlign: dir === "next" ? "right" : "left", padding: "14px 16px", borderRadius: 14,
                border: `1px solid ${T.panelBorder}`, background: T.card, color: T.text,
                cursor: target ? "pointer" : "default", opacity: target ? 1 : 0.4, boxShadow: target ? T.shadowMd : "none",
            }}
        >
            <span style={{ color: T.muted, display: "flex" }}><Icon name={dir === "next" ? "right" : "left"} size={18} /></span>
            <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: "block", fontSize: 12.5, color: T.muted, fontWeight: 600, marginBottom: 2 }}>{dir === "next" ? "Next lesson" : "Previous lesson"}</span>
                <span style={{ display: "block", fontSize: 14.5, fontWeight: 650, letterSpacing: "-0.005em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{target ? target.title : "None"}</span>
            </span>
        </button>
    );

    return (
        <div className="lm-root" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, width: "100%", background: T.bg, color: T.text, fontFamily: SANS }}>
            <style>{buildCss(T)}</style>

            {/* Header */}
            <div style={{ position: "relative", flex: "0 0 auto", background: T.surface, borderBottom: `1px solid ${T.panelBorder}`, padding: mobile ? "8px 12px" : "14px 20px" }}>
              <div style={{ width: "100%", maxWidth: SHELL_MAX, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: mobile ? 8 : 12, flexWrap: mobile ? "nowrap" : "wrap" }}>
                {mobile ? (
                    <h1 style={{ position: "absolute", width: 1, height: 1, margin: -1, padding: 0, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 }}>{sec.title}</h1>
                ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    <Tile color={T.accent} size={40} radius={12}><Icon name="book" size={20} /></Tile>
                    <div style={{ minWidth: 0 }}>
                        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", color: T.text, lineHeight: 1.25 }}>{view === "glossary" ? "Glossary" : sec.title}</h1>
                        <div style={{ fontSize: 13.5, color: T.subtext, marginTop: 2 }}>{view === "glossary" ? "Definitions across fundamental and technical analysis." : sec.sub(list.length)}</div>
                    </div>
                </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: mobile ? 8 : 12, flexWrap: mobile ? "nowrap" : "wrap", flex: mobile ? 1 : "0 1 auto", minWidth: 0 }}>
                    <div role="group" aria-label="Section" style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: mobile ? 3 : 4, borderRadius: 12, background: T.pillBg, border: `1px solid ${T.panelBorder}`, flex: mobile ? 1 : "0 0 auto", minWidth: 0 }}>
                        {segBtn("course", mobile ? "Fundamentals" : "Fundamentals")}
                        {segBtn("tech", "Technicals")}
                        {segBtn("cases", mobile ? "Cases" : "Case studies")}
                        {segBtn("glossary", "Glossary")}
                    </div>
                </div>
                {!mobile && <ProgressPill done={doneCount} total={list.length} T={T} />}
              </div>
                {view !== "glossary" && (
                    <div aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, bottom: -1, height: 2, background: "transparent" }}>
                        <div className="lm-bar" style={{ width: `${readPct}%`, height: "100%", background: col }} />
                    </div>
                )}
            </div>

            {/* Mobile lesson picker */}
            {mobile && view !== "glossary" && (
                <div style={{ flex: "0 0 auto", position: "relative", zIndex: 20, background: T.surface, borderBottom: `1px solid ${T.panelBorder}` }}>
                    <button
                        type="button"
                        onClick={() => setMenuOpen(o => !o)}
                        aria-expanded={menuOpen}
                        style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, padding: "11px 14px", border: "none", background: "transparent", color: T.text, fontSize: 14, fontWeight: 650, cursor: "pointer", textAlign: "left" }}
                    >
                        <Tile color={col} size={26}>{menuOpen ? <Icon name="book" size={14} /> : <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700 }}>{idx + 1}</span>}</Tile>
                        <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: 12, color: T.muted, fontWeight: 600 }}>{menuOpen ? `${list.length} lessons` : `Lesson ${idx + 1} of ${list.length}`}</span>
                            <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{menuOpen ? "Choose a lesson" : lesson.title}</span>
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: doneCount === list.length ? T.pos : T.muted, fontFamily: MONO }}>{doneCount}/{list.length}</span>
                        <span style={{ color: T.muted, display: "flex", transform: menuOpen ? "rotate(180deg)" : "none", transition: "transform .18s ease" }}><Icon name="down" size={16} stroke={2.4} /></span>
                    </button>
                    {menuOpen && (
                        <div ref={sideRef} style={{ position: "absolute", left: 0, right: 0, top: "100%", maxHeight: "62vh", overflowY: "auto", overscrollBehavior: "contain", padding: "10px 8px 14px", background: T.surface, borderTop: `1px solid ${T.panelBorder}`, borderBottom: `1px solid ${T.panelBorder}`, boxShadow: T.shadowLg }}>
                            <Outline activeId={lesson.id} done={progress.done} onPick={pick} T={T} tracks={sec.tracks} groups={sec.groups} mobile={mobile} />
                        </div>
                    )}
                </div>
            )}

            {mobile && menuOpen && view !== "glossary" && (
                <div onClick={() => setMenuOpen(false)} aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 10, background: "rgba(8,12,20,0.45)" }} />
            )}

            {/* Body */}
            <div style={{ display: "flex", flex: 1, minHeight: 0, width: "100%", maxWidth: SHELL_MAX, margin: "0 auto", gap: mobile ? 0 : 20, padding: mobile ? 0 : "20px 20px 0" }}>
                {!mobile && view !== "glossary" && (
                    <aside ref={sideRef} style={{ flex: "0 0 296px", alignSelf: "stretch", overflowY: "auto", background: T.surface, border: `1px solid ${T.panelBorder}`, borderRadius: 16, boxShadow: T.shadowMd, padding: "16px 12px 24px", marginBottom: 20, overscrollBehavior: "contain" }}>
                        <Outline activeId={lesson.id} done={progress.done} onPick={pick} T={T} tracks={sec.tracks} groups={sec.groups} mobile={mobile} />
                    </aside>
                )}

                <main ref={scrollRef} onScroll={onScroll} style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
                    {view === "glossary" ? (
                        <Glossary T={T} mobile={mobile} />
                    ) : (
                        <article key={lesson.id} className="lm-article" style={{ width: "100%", padding: mobile ? "22px 16px 56px" : "8px 8px 80px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "4px 11px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, color: col, background: withAlpha(col, T.isDark ? 0.16 : 0.09), border: `1px solid ${withAlpha(col, 0.26)}` }}>
                                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: col }} />{lesson.trackTitle}
                                </span>
                                {techLevel && (
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 11px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, color: T.subtext, background: T.pillBg, border: `1px solid ${T.panelBorder}` }}>{techLevel.title}</span>
                                )}
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 11px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, color: T.subtext, background: T.pillBg, border: `1px solid ${T.panelBorder}` }}>
                                    <Icon name="clock" size={13} />{lesson.minutes} min read
                                </span>
                                <span style={{ fontSize: 12.5, fontWeight: 700, color: T.muted, fontFamily: MONO }}>{idx + 1}/{list.length}</span>
                            </div>
                            <h2 style={{ margin: "0 0 12px", fontSize: mobile ? 26 : 34, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.18, color: T.text }}>{lesson.title}</h2>
                            <p style={{ margin: "0 0 28px", paddingBottom: 26, maxWidth: TEXT_MAX, borderBottom: `1px solid ${T.panelBorder}`, fontSize: mobile ? 16 : 17, lineHeight: 1.65, color: T.subtext }}>{lesson.summary}</p>

                            {body.status === "ready" ? (
                                <>
                                    {body.data.blocks.map((b, i) => <Block key={i} b={b} T={T} mobile={mobile} />)}

                                    <Quiz key={`q-${lesson.id}`} items={body.data.quiz} T={T} />
                                </>
                            ) : (
                                <LessonBodyState status={body.status} notFound={body.notFound} onRetry={body.retry} T={T} />
                            )}

                            <div style={{ marginTop: 32, display: "flex", justifyContent: "center" }}>
                                <button
                                    type="button"
                                    className="lm-done"
                                    onClick={toggleDone}
                                    aria-pressed={isDone}
                                    style={{
                                        display: "inline-flex", alignItems: "center", gap: 9, padding: "12px 24px", borderRadius: 999, fontSize: 14.5, fontWeight: 700, cursor: "pointer", letterSpacing: "-0.005em",
                                        border: `1px solid ${isDone ? withAlpha(T.pos, 0.45) : T.accent}`,
                                        background: isDone ? T.posSoft : T.accent,
                                        color: isDone ? T.posText : T.onAccent,
                                    }}
                                >
                                    <Icon name="check" size={16} stroke={2.8} />
                                    {isDone ? "Completed. Click to undo" : "Mark lesson complete"}
                                </button>
                            </div>

                            <div style={{ marginTop: 24, display: "flex", gap: 12, flexDirection: mobile ? "column" : "row" }}>
                                {navBtn(prev, "prev")}
                                {navBtn(next, "next")}
                            </div>

                            <p style={{ margin: "30px 0 0", fontSize: 12.5, lineHeight: 1.65, color: T.muted, textAlign: "center" }}>
                                {sec.foot}
                            </p>
                        </article>
                    )}
                </main>
            </div>
        </div>
    );
}

/* ── Lesson body placeholder: skeleton while loading, retry on failure ───── */
function LessonBodyState({ status, notFound, onRetry, T }) {
    if (status === "error") {
        return (
            <div role="alert" style={{ margin: "8px 0 24px", padding: "16px 18px", borderRadius: 14, border: `1px solid ${withAlpha(T.amber, 0.3)}`, background: T.amberSoft, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <span style={{ flex: 1, minWidth: 200, fontSize: 14.5, lineHeight: 1.6, color: T.text }}>
                    {notFound ? "This lesson is no longer available. Pick another from the outline." : "Could not load this lesson. Check your connection and try again."}
                </span>
                {!notFound && (
                    <button type="button" className="lm-ghost" onClick={onRetry} style={{ padding: "8px 16px", borderRadius: 999, border: `1px solid ${T.panelBorder}`, background: T.card, color: T.text, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>Try again</button>
                )}
            </div>
        );
    }
    return (
        <div role="status" aria-busy="true" aria-label="Loading lesson" style={{ maxWidth: TEXT_MAX }}>
            {[96, 100, 88, 94, 62, 0, 98, 91, 74].map((w, i) => w === 0
                ? <div key={i} style={{ height: 22 }} />
                : <div key={i} className="lm-skel" style={{ height: 14, width: `${w}%`, borderRadius: 7, background: T.softFill, marginBottom: 14 }} />)}
        </div>
    );
}

/* ── Public component: loads the catalog from the backend, then renders the module ── */
export default function LearnModule({ T: baseT }) {
    const T = useMemo(() => buildLearnTheme(baseT || {}), [baseT]);
    const { catalog, status, reload } = useLearnCatalog();
    const empty = !!catalog && catalog.LESSONS.length === 0;
    if (!catalog || empty) {
        return (
            <div className="lm-root" style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, minHeight: 0, width: "100%", padding: 24, background: T.bg, color: T.text, fontFamily: SANS }}>
                <style>{buildCss(T)}</style>
                {status === "error" ? (
                    <div role="alert" style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 15, marginBottom: 12, color: T.subtext }}>Could not load the lessons.</div>
                        <button type="button" className="lm-ghost" onClick={reload} style={{ padding: "9px 20px", borderRadius: 999, border: `1px solid ${T.panelBorder}`, background: T.card, color: T.text, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Try again</button>
                    </div>
                ) : empty ? (
                    <div role="status" style={{ textAlign: "center", fontSize: 15, color: T.subtext, lineHeight: 1.6 }}>No lessons are published yet.</div>
                ) : (
                    <span role="status" className="lm-skel" style={{ fontSize: 14, color: T.muted }}>Loading lessons…</span>
                )}
            </div>
        );
    }
    return (
        <CatalogCtx.Provider value={catalog}>
            <LearnBody T={baseT} />
        </CatalogCtx.Provider>
    );
}
