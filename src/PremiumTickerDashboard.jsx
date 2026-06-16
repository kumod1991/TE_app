import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

// â”€â”€â”€ SUPABASE CONFIG â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
// â”€â”€â”€ DESIGN TOKEN BUILDER (mirrors WatchlistDashboard + StockDashboard T.*) â”€â”€
//  buildDashboardTheme(T) â†’ enhanced T object with panelBg, shellBg, pillBg, etc.
//  Fonts: 'DM Sans' (UI), 'DM Mono' (numbers/tickers), 'IBM Plex Mono' (data)
function hexToRgb(hex) {
    if (!hex || typeof hex !== "string") return null;
    const value = hex.trim().replace("#", "");
    const normalized = value.length === 3
        ? value.split("").map(ch => ch + ch).join("")
        : value;
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
    const num = parseInt(normalized, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function withAlpha(color, alpha) {
    if (!color) return `rgba(15, 23, 42, ${alpha})`;
    if (color.startsWith("rgba")) {
        return color.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, `rgba($1,$2,$3,${alpha})`);
    }
    if (color.startsWith("rgb(")) {
        return color.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
    }
    const rgb = hexToRgb(color);
    if (rgb) return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
    return color;
}

function luminance(color) {
    const rgb = hexToRgb(color);
    if (!rgb) return 1;
    const ch = c => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * ch(rgb.r) + 0.7152 * ch(rgb.g) + 0.0722 * ch(rgb.b);
}

function buildDashboardTheme(T = {}) {
    const bg      = T.bg      || "#f4f7fb";
    const isDark  = luminance(bg) < 0.35;
    const accent  = T.accent  || (isDark ? "#7dd3fc" : "#2563eb");
    const accentAlt = T.pos   || "#10b981";
    const surface = T.surface || (isDark ? "#111827" : "#ffffff");
    const card    = T.card    || surface;
    const text    = T.text    || (isDark ? "#f8fafc" : "#0f172a");
    const muted   = T.muted   || (isDark ? "#94a3b8" : "#64748b");
    const subtext = T.subtext || muted;
    const border  = T.border  || (isDark ? "rgba(148,163,184,0.18)" : "rgba(15,23,42,0.09)");
    const pos     = T.pos     || (isDark ? "#34d399" : "#10b981");
    const neg     = T.neg     || (isDark ? "#f87171" : "#ef4444");
    const green   = T.green   || pos;

    return {
        ...T,
        bg, card, surface, text, muted, subtext, border, accent, isDark, pos, neg, green,
        // Panel / Shell
        panelBg: isDark
            ? `linear-gradient(180deg, ${withAlpha(card, 0.98)} 0%, ${withAlpha("#020617", 0.9)} 100%)`
            : `linear-gradient(180deg, ${withAlpha(card, 0.98)} 0%, ${withAlpha("#f8fafc", 0.98)} 100%)`,
        shellBg: isDark
            ? `radial-gradient(circle at top left, ${withAlpha(accent, 0.18)} 0%, transparent 34%), radial-gradient(circle at top right, ${withAlpha(accentAlt, 0.14)} 0%, transparent 28%), ${bg}`
            : `radial-gradient(circle at top left, ${withAlpha(accent, 0.12)} 0%, transparent 34%), radial-gradient(circle at top right, ${withAlpha(accentAlt, 0.1)} 0%, transparent 30%), linear-gradient(180deg, #f8fbff 0%, ${bg} 100%)`,
        // Borders & fills
        panelBorder: isDark ? withAlpha("#cbd5e1", 0.14) : withAlpha("#0f172a", 0.08),
        insetBorder: isDark ? withAlpha("#ffffff", 0.08) : withAlpha("#ffffff", 0.8),
        softFill:    isDark ? withAlpha("#94a3b8", 0.10) : withAlpha("#e2e8f0", 0.70),
        hover:       isDark ? withAlpha(accent, 0.09) : withAlpha(accent, 0.06),
        tableHeadBg: isDark ? withAlpha("#0f172a", 0.76) : withAlpha("#f8fafc", 0.92),
        // Shadows
        shadowLg: isDark ? "0 24px 60px rgba(2, 6, 23, 0.45)" : "0 24px 60px rgba(15, 23, 42, 0.10)",
        shadowMd: isDark ? "0 14px 34px rgba(2, 6, 23, 0.34)" : "0 14px 34px rgba(15, 23, 42, 0.08)",
        // Pills / tabs
        ring:       withAlpha(accent, isDark ? 0.32 : 0.18),
        pillBg:     isDark ? withAlpha("#0f172a", 0.72) : withAlpha("#ffffff", 0.8),
        pillBorder: isDark ? withAlpha("#cbd5e1", 0.12) : withAlpha("#0f172a", 0.08),
        // Positive / negative fills
        posSoft: withAlpha(pos, isDark ? 0.14 : 0.10),
        negSoft: withAlpha(neg, isDark ? 0.14 : 0.08),
    };
}

// â”€â”€â”€ SHARED COLOUR PALETTE (mirrors WatchlistDashboard screen pill colours) â”€â”€
function buildColorPalette(isDark) {
    return {
        blue:   isDark ? "#60a5fa" : "#2563eb",
        purple: isDark ? "#a78bfa" : "#7c3aed",
        green:  isDark ? "#34d399" : "#059669",
        amber:  isDark ? "#fbbf24" : "#d97706",
        rose:   isDark ? "#fb7185" : "#e11d48",
        cyan:   isDark ? "#22d3ee" : "#0891b2",
        indigo: isDark ? "#818cf8" : "#4f46e5",
    };
}

// â”€â”€â”€ MATH HELPERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CR = 1e7;
function n(v) { return v != null && !isNaN(Number(v)) ? Number(v) : null; }
function ratio(a, b, d = 2) { return n(a) != null && n(b) != null && Number(b) !== 0 ? Number((Number(a) / Number(b)).toFixed(d)) : null; }
function pct(a, b, d = 2) { return n(a) != null && n(b) != null && Number(b) !== 0 ? Number((((Number(a) / Number(b)) * 100)).toFixed(d)) : null; }
function growth(curr, prev, d = 1) {
    return n(curr) != null && n(prev) != null && Number(prev) !== 0
        ? Number((((Number(curr) - Number(prev)) / Math.abs(Number(prev))) * 100).toFixed(d))
        : null;
}
function fmt(v, kind = "pct", d = 2) {
    if (v == null) return "--";
    if (kind === "pct") return `${Number(v).toFixed(d)}%`;
    if (kind === "x")   return `${Number(v).toFixed(d)}x`;
    if (kind === "days") return `${Number(v).toFixed(1)}d`;
    if (kind === "cr")  return `${Math.round(Number(v)).toLocaleString("en-IN")} Cr`;
    return Number(v).toFixed(d);
}
function ebitdaOf(row) {
    if (!row) return null;
    if (row.EBITDA != null) return Number(row.EBITDA);
    if (row.EBIT != null && row.Depreciation != null) return Number(row.EBIT) + Number(row.Depreciation);
    return null;
}

// â”€â”€â”€ VIEWPORT HOOK (matches WatchlistDashboard + StockDashboard pattern) â”€â”€â”€â”€â”€
function useViewportFlags() {
    const getWidth = () => (typeof window === "undefined" ? 1440 : window.innerWidth);
    const [width, setWidth] = useState(getWidth);
    useEffect(() => {
        if (typeof window === "undefined") return;
        const onResize = () => setWidth(window.innerWidth);
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);
    return { width, isPhone: width <= 640, isTablet: width > 640 && width <= 1080, isCompact: width < 768 };
}

// â”€â”€â”€ LIGHTWEIGHT CHARTS SPARKLINE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const LW_CDN = "https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js";
let lwLoaded = false, lwCallbacks = [];
function ensureLightweightCharts(cb) {
    if (typeof window === "undefined") return;
    if (window.LightweightCharts) { cb(); return; }
    if (lwLoaded) { lwCallbacks.push(cb); return; }
    lwLoaded = true; lwCallbacks.push(cb);
    const script = document.createElement("script");
    script.src = LW_CDN;
    script.onload = () => { lwCallbacks.forEach(fn => fn()); lwCallbacks = []; };
    document.head.appendChild(script);
}
function hexToRgba(hex, alpha) {
    const h = hex.replace("#", "");
    const r = parseInt(h.length === 3 ? h[0]+h[0] : h.slice(0,2), 16);
    const g = parseInt(h.length === 3 ? h[1]+h[1] : h.slice(2,4), 16);
    const b = parseInt(h.length === 3 ? h[2]+h[2] : h.slice(4,6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

function Sparkline({ values, color, height = 70 }) {
    const wrapRef = useRef(null);
    const containerRef = useRef(null);
    const chartRef = useRef(null);
    const seriesRef = useRef(null);
    const tooltipRef = useRef(null);
    const [ready, setReady] = useState(!!window?.LightweightCharts);
    const data = useMemo(() => {
        const valid = (values || []).filter(v => v != null && !isNaN(v));
        return valid.map((v, i) => ({ time: i + 1, value: Number(v) }));
    }, [values]);
    useEffect(() => { if (ready) return; ensureLightweightCharts(() => setReady(true)); }, [ready]);
    useLayoutEffect(() => {
        if (!ready || !containerRef.current || data.length < 2) return;
        const LC = window.LightweightCharts;
        const el = containerRef.current;
        const parentEl = wrapRef.current;
        const w = (parentEl ? parentEl.getBoundingClientRect().width : 0) || el.clientWidth || 240;
        const chart = LC.createChart(el, {
            width: Math.floor(w), height,
            layout: { background: { type: "solid", color: "transparent" }, textColor: "transparent", attributionLogo: false },
            grid: { vertLines: { visible: false }, horzLines: { visible: false } },
            crosshair: { vertLine: { visible: true, width: 1, color: hexToRgba(color, 0.4), style: 1, labelVisible: false }, horzLine: { visible: false, labelVisible: false } },
            rightPriceScale: { visible: false }, leftPriceScale: { visible: false },
            timeScale: { visible: false, borderVisible: false },
            handleScroll: false, handleScale: false,
        });
        const series = chart.addAreaSeries({
            lineColor: color, lineWidth: 2,
            topColor: hexToRgba(color, 0.18), bottomColor: hexToRgba(color, 0.00),
            priceLineVisible: false, lastValueVisible: false,
            crosshairMarkerVisible: true, crosshairMarkerRadius: 4,
            crosshairMarkerBorderColor: color, crosshairMarkerBackgroundColor: "#ffffff", crosshairMarkerBorderWidth: 2,
        });
        series.setData(data);
        chart.timeScale().fitContent();
        chart.subscribeCrosshairMove(param => {
            const tooltip = tooltipRef.current;
            if (!tooltip) return;
            if (!param.point || !param.seriesData?.size) { tooltip.style.display = "none"; return; }
            const point = param.seriesData.get(series);
            if (!point) { tooltip.style.display = "none"; return; }
            tooltip.style.display = "block";
            tooltip.textContent = point.value.toFixed(2);
            const tooltipLeft = Math.max(0, Math.min(param.point.x, w - 80));
            tooltip.style.left = `${tooltipLeft}px`;
            tooltip.style.top = "-32px";
        });
        chartRef.current = chart;
        let ro = null;
        if (typeof ResizeObserver !== "undefined" && parentEl) {
            ro = new ResizeObserver(entries => {
                const entry = entries[0];
                if (!entry || !chartRef.current) return;
                const newW = Math.floor(entry.contentRect.width);
                if (newW > 0) { chartRef.current.applyOptions({ width: newW }); chartRef.current.timeScale().fitContent(); }
            });
            ro.observe(parentEl);
        }
        return () => { if (ro) ro.disconnect(); chart.remove(); chartRef.current = null; };
    }, [ready, data, color, height]);

    if (!ready || data.length < 2) {
        return (
            <div ref={wrapRef} style={{ position: "relative", width: "100%", minWidth: 0, height }}>
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, opacity: 0.35, fontFamily: "'DM Sans', sans-serif" }}>
                    {!ready ? "Loadingâ€¦" : "No data"}
                </div>
            </div>
        );
    }
    return (
        <div ref={wrapRef} style={{ position: "relative", width: "100%", minWidth: 0, overflow: "visible", height }}>
            <div ref={tooltipRef} style={{
                position: "absolute", display: "none",
                background: "#000000", color: "#ffffff",
                padding: "5px 10px", borderRadius: 6, fontSize: 12, fontWeight: 700,
                pointerEvents: "none", transform: "translateX(-50%)", zIndex: 999,
                whiteSpace: "nowrap", boxShadow: "0 6px 20px rgba(0,0,0,0.5)",
                fontFamily: "'DM Mono', monospace",
                border: "1px solid rgba(255,255,255,0.15)",
            }} />
            <div ref={containerRef} style={{ width: "100%", minWidth: 0, overflow: "hidden" }} />
        </div>
    );
}

// â”€â”€â”€ SECTION CARD (matches StockDashboard SectionCard) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function SectionCard({ D, children, style = {} }) {
    return (
        <div style={{
            background: D.panelBg,
            border: `1px solid ${D.panelBorder}`,
            boxShadow: D.shadowMd,
            borderRadius: 24,
            padding: 20,
            marginBottom: 18,
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            position: "relative",
            overflow: "hidden",
            ...style,
        }}>
            {/* Inset highlight border (matches StockDashboard) */}
            <div style={{
                position: "absolute", inset: 1, borderRadius: 23,
                border: `1px solid ${D.insetBorder}`,
                pointerEvents: "none",
            }} />
            <div style={{ position: "relative", zIndex: 1 }}>
                {children}
            </div>
        </div>
    );
}

// â”€â”€â”€ CARD HEADER (matches StockDashboard CardHeader) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function CardHeader({ D, title, subtitle, right, kicker }) {
    return (
        <div style={{ marginBottom: 18 }}>
            {kicker && (
                <div style={{ fontSize: 10, color: D.subtext, textTransform: "uppercase", letterSpacing: ".14em", fontWeight: 700, marginBottom: 5, fontFamily: "'DM Sans', sans-serif" }}>
                    {kicker}
                </div>
            )}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: D.text, letterSpacing: "-0.02em", fontFamily: "'DM Sans', sans-serif" }}>
                        {title}
                    </div>
                    {subtitle && (
                        <div style={{ fontSize: 12, color: D.subtext, marginTop: 3, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.45 }}>
                            {subtitle}
                        </div>
                    )}
                </div>
                {right && <div style={{ flexShrink: 0 }}>{right}</div>}
            </div>
        </div>
    );
}

// â”€â”€â”€ METRIC CARD (styled with shared token system) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function MetricCard({ title, subtitle, value, series, color, D }) {
    const [isHovered, setIsHovered] = useState(false);
    const isDark = D.isDark;
    return (
        <div
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                position: "relative",
                padding: "18px 18px 16px",
                borderRadius: 18,
                border: `1px solid ${isHovered ? withAlpha(color, isDark ? 0.35 : 0.22) : D.panelBorder}`,
                background: isDark
                    ? `linear-gradient(135deg, ${withAlpha("#1e293b", 0.90)} 0%, ${withAlpha("#0f172a", 0.85)} 100%)`
                    : `linear-gradient(135deg, ${withAlpha("#ffffff", 0.99)} 0%, ${withAlpha("#f8fafc", 0.97)} 100%)`,
                boxShadow: isHovered
                    ? (isDark ? `0 20px 48px rgba(0,0,0,0.40), 0 0 0 1px ${withAlpha(color, 0.18)}` : `0 20px 48px rgba(100,116,139,0.18), 0 0 0 1px ${withAlpha(color, 0.12)}`)
                    : D.shadowMd,
                overflow: "hidden",
                minWidth: 0,
                transition: "all 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
                transform: isHovered ? "translateY(-4px)" : "translateY(0)",
                cursor: "default",
            }}
        >
            {/* Glow overlay */}
            <div style={{
                position: "absolute", top: 0, right: 0, width: "55%", height: "55%",
                background: `radial-gradient(circle at top right, ${withAlpha(color, isDark ? 0.10 : 0.07)} 0%, transparent 55%)`,
                pointerEvents: "none", opacity: isHovered ? 1 : 0.6, transition: "opacity 0.22s ease",
            }} />
            {/* Inset border (matches SectionCard) */}
            <div style={{
                position: "absolute", inset: 1, borderRadius: 17,
                border: `1px solid ${isDark ? withAlpha("#ffffff", 0.06) : withAlpha("#ffffff", 0.75)}`,
                pointerEvents: "none",
            }} />

            <div style={{ position: "relative", zIndex: 1 }}>
                {/* Title */}
                <div style={{ fontSize: 10, color: D.subtext, textTransform: "uppercase", letterSpacing: ".14em", fontWeight: 700, marginBottom: 3, opacity: 0.85, fontFamily: "'DM Sans', sans-serif" }}>
                    {title}
                </div>
                {/* Subtitle */}
                <div style={{ fontSize: 11, color: D.subtext, marginBottom: 12, lineHeight: 1.4, opacity: 0.65, fontFamily: "'DM Sans', sans-serif" }}>
                    {subtitle}
                </div>
                {/* Value */}
                <div style={{
                    fontSize: 30, fontWeight: 800, color: color,
                    letterSpacing: "-0.03em",
                    textShadow: isDark ? "0 2px 8px rgba(0,0,0,0.22)" : "0 4px 16px rgba(255,255,255,0.5)",
                    marginBottom: series && series.filter(Boolean).length > 1 ? 14 : 0,
                    transition: "transform 0.2s ease",
                    transform: isHovered ? "scale(1.04)" : "scale(1)",
                    fontFamily: "'DM Mono', monospace",
                }}>
                    {value}
                </div>
                {/* Sparkline */}
                {series && series.filter(Boolean).length > 1 && (
                    <div style={{ opacity: isHovered ? 1 : 0.8, transition: "opacity 0.22s ease" }}>
                        <Sparkline values={series.filter(Boolean)} color={color} height={64} />
                    </div>
                )}
            </div>
        </div>
    );
}

// â”€â”€â”€ HERO SUMMARY PILL (ticker / sector tags) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function HeroPill({ label, D }) {
    const isDark = D.isDark;
    return (
        <span style={{
            padding: "8px 15px", borderRadius: 999,
            border: `1px solid ${D.pillBorder}`,
            background: D.pillBg,
            color: D.text, fontSize: 12, fontWeight: 700,
            boxShadow: isDark ? "0 8px 24px rgba(0,0,0,0.20)" : "0 4px 16px rgba(15,23,42,0.08)",
            letterSpacing: "0.02em", fontFamily: "'DM Mono', monospace",
        }}>
            {label}
        </span>
    );
}

// â”€â”€â”€ LOADING SKELETON â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function SkeletonCard({ D }) {
    return (
        <div style={{
            padding: "18px 18px 16px", borderRadius: 18,
            border: `1px solid ${D.panelBorder}`,
            background: D.isDark
                ? `linear-gradient(135deg, ${withAlpha("#1e293b", 0.85)} 0%, ${withAlpha("#0f172a", 0.80)} 100%)`
                : `linear-gradient(135deg, ${withAlpha("#ffffff", 0.97)} 0%, ${withAlpha("#f8fafc", 0.95)} 100%)`,
            boxShadow: D.shadowMd,
        }}>
            {[100, 60, 80].map((w, i) => (
                <div key={i} style={{ width: `${w}%`, height: i === 2 ? 28 : 11, borderRadius: 4, background: D.border, opacity: 0.5 - i * 0.1, marginBottom: i < 2 ? 10 : 0, animation: "ptdPulse 1.4s ease-in-out infinite", animationDelay: `${i * 0.12}s` }} />
            ))}
        </div>
    );
}

// â”€â”€â”€ GROUP TAB BAR (matches StockDashboard tab style) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function GroupTabBar({ groups, activeIdx, onSelect, D, isPhone }) {
    const isDark = D.isDark;
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        if (!isPhone || !isOpen) return;
        
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isPhone, isOpen]);

    // Mobile: Dropdown selector
    if (isPhone) {
        const activeGroup = groups[activeIdx];
        
        return (
            <div ref={dropdownRef} style={{ position: 'relative', marginBottom: 20 }}>
                {/* Dropdown button */}
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    style={{
                        width: '100%',
                        padding: '12px 16px',
                        fontSize: 13,
                        fontWeight: 600,
                        borderRadius: 16,
                        border: `1px solid ${D.panelBorder}`,
                        cursor: 'pointer',
                        background: D.softFill,
                        color: D.text,
                        fontFamily: "'DM Sans', sans-serif",
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'all 0.15s ease',
                        boxShadow: isOpen ? `0 0 0 2px ${D.ring}` : 'none',
                    }}
                >
                    <span>{activeGroup.shortTitle || activeGroup.title}</span>
                    <svg 
                        width="16" 
                        height="16" 
                        viewBox="0 0 16 16" 
                        fill="none"
                        style={{
                            transition: 'transform 0.2s ease',
                            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        }}
                    >
                        <path 
                            d="M4 6L8 10L12 6" 
                            stroke="currentColor" 
                            strokeWidth="2" 
                            strokeLinecap="round" 
                            strokeLinejoin="round"
                        />
                    </svg>
                </button>

                {/* Dropdown menu */}
                {isOpen && (
                    <div
                        style={{
                            position: 'absolute',
                            top: 'calc(100% + 6px)',
                            left: 0,
                            right: 0,
                            zIndex: 1000,
                            background: isDark 
                                ? `linear-gradient(135deg, ${withAlpha('#1e293b', 0.98)} 0%, ${withAlpha('#0f172a', 0.96)} 100%)`
                                : `linear-gradient(135deg, ${withAlpha('#ffffff', 0.98)} 0%, ${withAlpha('#f8fafc', 0.96)} 100%)`,
                            border: `1px solid ${D.panelBorder}`,
                            borderRadius: 16,
                            boxShadow: D.shadowLg,
                            backdropFilter: 'blur(20px)',
                            WebkitBackdropFilter: 'blur(20px)',
                            overflow: 'hidden',
                            animation: 'ptdFadeIn 0.2s ease',
                        }}
                    >
                        {/* Inset border for glass effect */}
                        <div style={{
                            position: 'absolute',
                            inset: 1,
                            borderRadius: 15,
                            border: `1px solid ${isDark ? withAlpha('#ffffff', 0.06) : withAlpha('#ffffff', 0.75)}`,
                            pointerEvents: 'none',
                        }} />
                        
                        <div style={{ 
                            position: 'relative', 
                            zIndex: 1,
                            padding: '6px',
                        }}>
                            {groups.map((g, i) => {
                                const active = activeIdx === i;
                                return (
                                    <button
                                        key={g.title}
                                        onClick={() => {
                                            onSelect(i);
                                            setIsOpen(false);
                                        }}
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            fontSize: 13,
                                            fontWeight: active ? 700 : 600,
                                            borderRadius: 12,
                                            border: 'none',
                                            cursor: 'pointer',
                                            background: active
                                                ? (isDark ? withAlpha(D.accent, 0.18) : withAlpha(D.accent, 0.12))
                                                : 'transparent',
                                            color: active ? D.accent : D.text,
                                            boxShadow: active ? `0 0 0 1px ${withAlpha(D.accent, 0.28)}` : 'none',
                                            transition: 'all 0.15s ease',
                                            fontFamily: "'DM Sans', sans-serif",
                                            textAlign: 'left',
                                            display: 'block',
                                            marginBottom: i < groups.length - 1 ? '2px' : 0,
                                        }}
                                        onMouseEnter={e => {
                                            if (!active) {
                                                e.currentTarget.style.background = D.hover;
                                            }
                                        }}
                                        onMouseLeave={e => {
                                            if (!active) {
                                                e.currentTarget.style.background = 'transparent';
                                            }
                                        }}
                                    >
                                        {g.shortTitle || g.title}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Desktop/Tablet: Horizontal tabs (original design)
    return (
        <div style={{
            display: "flex", 
            gap: 6, 
            padding: "6px", 
            marginBottom: 20,
            background: D.softFill, 
            borderRadius: 999,
            border: `1px solid ${D.panelBorder}`,
            flexWrap: "wrap",
        }}>
            {groups.map((g, i) => {
                const active = activeIdx === i;
                return (
                    <button 
                        key={g.title} 
                        onClick={() => onSelect(i)}
                        style={{
                            padding: "7px 14px", 
                            fontSize: 12, 
                            fontWeight: 600,
                            borderRadius: 999, 
                            border: "none", 
                            cursor: "pointer",
                            background: active
                                ? (isDark ? withAlpha(D.accent, 0.18) : withAlpha(D.accent, 0.12))
                                : "transparent",
                            color: active ? D.accent : D.subtext,
                            boxShadow: active ? `0 0 0 1px ${withAlpha(D.accent, 0.28)}` : "none",
                            transition: "all 0.15s ease",
                            fontFamily: "'DM Sans', sans-serif",
                            whiteSpace: "nowrap",
                        }}
                        onMouseEnter={e => { 
                            if (!active) { 
                                e.currentTarget.style.color = D.text; 
                                e.currentTarget.style.background = D.hover; 
                            } 
                        }}
                        onMouseLeave={e => { 
                            if (!active) { 
                                e.currentTarget.style.color = D.subtext; 
                                e.currentTarget.style.background = "transparent"; 
                            } 
                        }}
                    >
                        {g.shortTitle || g.title}
                    </button>
                );
            })}
        </div>
    );
}

// â”€â”€â”€ MARKDOWN-LITE RENDERER (Premium) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function MarkdownLite({ text, D, accentColor }) {
    if (!text) return null;
    const acc = accentColor || D.accent;
    const lines = text.split("\n");
    const elements = [];
    let i = 0;

    const parseInline = (str) => {
        const parts = str.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
        return parts.map((p, idx) => {
            if (p.startsWith("**") && p.endsWith("**")) return (
                <strong key={idx} style={{ fontWeight: 700, color: D.text }}>{p.slice(2, -2)}</strong>
            );
            if (p.startsWith("`") && p.endsWith("`")) return (
                <code key={idx} style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.85em", background: withAlpha(acc, 0.10), padding: "2px 6px", borderRadius: 5, color: acc, border: `1px solid ${withAlpha(acc, 0.18)}` }}>{p.slice(1, -1)}</code>
            );
            return p;
        });
    };

    while (i < lines.length) {
        const line = lines[i];

        if (line.startsWith("# ")) {
            elements.push(
                <div key={i} style={{ margin: "28px 0 12px", paddingBottom: 12, borderBottom: `1px solid ${withAlpha(acc, 0.20)}` }}>
                    <h1 style={{ fontSize: 20, fontWeight: 800, color: D.text, margin: 0, letterSpacing: "-0.04em", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.2 }}>{line.slice(2)}</h1>
                </div>
            );
        } else if (line.startsWith("## ")) {
            elements.push(
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, margin: "22px 0 8px" }}>
                    <div style={{ width: 3, height: 18, borderRadius: 2, background: acc, flexShrink: 0 }} />
                    <h2 style={{ fontSize: 15, fontWeight: 700, color: D.text, margin: 0, letterSpacing: "-0.025em", fontFamily: "'DM Sans', sans-serif" }}>{line.slice(3)}</h2>
                </div>
            );
        } else if (line.startsWith("### ")) {
            elements.push(
                <h3 key={i} style={{ fontSize: 11, fontWeight: 800, color: acc, margin: "16px 0 6px", textTransform: "uppercase", letterSpacing: ".12em", fontFamily: "'DM Sans', sans-serif" }}>{line.slice(4)}</h3>
            );
        } else if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
            const tableLines = [];
            while (i < lines.length && lines[i].trim().startsWith("|")) {
                tableLines.push(lines[i]);
                i++;
            }
            const dataLines = tableLines.filter(l => !/^[\s|:-]+$/.test(l));
            const headers = dataLines[0]?.split("|").slice(1, -1).map(h => h.trim()) || [];
            const bodyRows = dataLines.slice(1);
            elements.push(
                <div key={`table-${i}`} style={{ overflowX: "auto", margin: "16px 0", borderRadius: 12, border: `1px solid ${D.panelBorder}`, boxShadow: `0 2px 12px ${withAlpha(D.text, 0.04)}` }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>
                        <thead>
                            <tr style={{ background: D.isDark ? withAlpha("#0f172a", 0.8) : withAlpha(acc, 0.05) }}>
                                {headers.map((h, hi) => (
                                    <th key={hi} style={{ padding: "10px 14px", textAlign: "left", color: acc, fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", borderBottom: `1px solid ${D.panelBorder}`, whiteSpace: "nowrap" }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {bodyRows.map((row, ri) => {
                                const cells = row.split("|").slice(1, -1).map(c => c.trim());
                                return (
                                    <tr key={ri} style={{ borderBottom: ri < bodyRows.length - 1 ? `1px solid ${D.panelBorder}` : "none", background: ri % 2 === 0 ? "transparent" : withAlpha(D.text, D.isDark ? 0.03 : 0.02) }}>
                                        {cells.map((cell, ci) => (
                                            <td key={ci} style={{ padding: "9px 14px", color: ci === 0 ? D.text : D.subtext, fontWeight: ci === 0 ? 600 : 400, verticalAlign: "top", lineHeight: 1.55, fontSize: 12 }}>{parseInline(cell)}</td>
                                        ))}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            );
            continue;
        } else if (/^\d+\.\s/.test(line)) {
            const listItems = [];
            while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
                listItems.push(lines[i].replace(/^\d+\.\s/, ""));
                i++;
            }
            elements.push(
                <ol key={`ol-${i}`} style={{ paddingLeft: 0, marginBottom: 14, listStyle: "none", fontFamily: "'DM Sans', sans-serif" }}>
                    {listItems.map((item, idx) => (
                        <li key={idx} style={{ display: "flex", gap: 12, fontSize: 13.5, color: D.text, lineHeight: 1.7, marginBottom: 8, alignItems: "flex-start" }}>
                            <span style={{ minWidth: 22, height: 22, borderRadius: 6, background: withAlpha(acc, 0.12), color: acc, fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1, fontFamily: "'DM Mono', monospace" }}>{idx + 1}</span>
                            <span style={{ flex: 1 }}>{parseInline(item)}</span>
                        </li>
                    ))}
                </ol>
            );
            continue;
        } else if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
            const listItems = [];
            while (i < lines.length && (lines[i].trim().startsWith("- ") || lines[i].trim().startsWith("* "))) {
                listItems.push(lines[i].trim().slice(2));
                i++;
            }
            elements.push(
                <ul key={`ul-${i}`} style={{ paddingLeft: 0, marginBottom: 12, listStyle: "none", fontFamily: "'DM Sans', sans-serif" }}>
                    {listItems.map((item, idx) => (
                        <li key={idx} style={{ display: "flex", gap: 10, fontSize: 13.5, color: D.text, lineHeight: 1.68, marginBottom: 5, alignItems: "flex-start" }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: acc, flexShrink: 0, marginTop: 8 }} />
                            <span style={{ flex: 1 }}>{parseInline(item)}</span>
                        </li>
                    ))}
                </ul>
            );
            continue;
        } else if (line.trim() === "---") {
            elements.push(<div key={i} style={{ height: 1, background: `linear-gradient(90deg, ${withAlpha(acc, 0.25)} 0%, transparent 100%)`, margin: "20px 0" }} />);
        } else if (line.trim() === "") {
            // skip
        } else {
            elements.push(<p key={i} style={{ fontSize: 13.5, color: D.isDark ? withAlpha(D.text, 0.82) : withAlpha(D.text, 0.78), lineHeight: 1.75, margin: "0 0 10px", fontFamily: "'DM Sans', sans-serif" }}>{parseInline(line)}</p>);
        }
        i++;
    }
    return <div>{elements}</div>;
}

// â”€â”€â”€ SCORE RING (Premium) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ScoreRing({ score, D, C }) {
    const fraction = Math.min(Math.max(score / 10, 0), 1);
    const r = 40, cx = 52, cy = 52, strokeW = 6;
    const circumference = 2 * Math.PI * r;
    const dash = fraction * circumference;
    const color = score >= 7.5 ? C.green : score >= 5.5 ? C.amber : C.rose;
    const label = score >= 7.5 ? "Strong" : score >= 5.5 ? "Moderate" : "Weak";
    return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 104 }}>
            <div style={{ position: "relative", width: 104, height: 104 }}>
                {/* Glow behind ring */}
                <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: `radial-gradient(circle, ${withAlpha(color, 0.12)} 0%, transparent 70%)`, pointerEvents: "none" }} />
                <svg width={104} height={104} viewBox="0 0 104 104" style={{ position: "relative", zIndex: 1 }}>
                    {/* Track */}
                    <circle cx={cx} cy={cy} r={r} fill="none" stroke={D.isDark ? withAlpha(D.text, 0.07) : withAlpha(D.text, 0.08)} strokeWidth={strokeW} />
                    {/* Progress */}
                    <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={strokeW}
                        strokeDasharray={`${dash} ${circumference - dash}`}
                        strokeLinecap="round"
                        transform={`rotate(-90 ${cx} ${cy})`}
                        style={{ transition: "stroke-dasharray 1s cubic-bezier(0.4,0,0.2,1)", filter: `drop-shadow(0 0 6px ${withAlpha(color, 0.5)})` }}
                    />
                    {/* Score number */}
                    <text x={cx} y={cy - 5} textAnchor="middle" fill={color} fontSize={22} fontWeight={800} fontFamily="'DM Mono', monospace">{score.toFixed(1)}</text>
                    <text x={cx} y={cy + 13} textAnchor="middle" fill={D.subtext} fontSize={9} fontFamily="'DM Sans', sans-serif" fontWeight={600} opacity={0.7}>OUT OF 10</text>
                </svg>
            </div>
            {/* Label badge */}
            <div style={{
                padding: "3px 10px", borderRadius: 999, fontSize: 10, fontWeight: 800,
                letterSpacing: ".1em", textTransform: "uppercase", fontFamily: "'DM Sans', sans-serif",
                color, background: withAlpha(color, 0.12), border: `1px solid ${withAlpha(color, 0.25)}`,
            }}>{label}</div>
        </div>
    );
}

// â”€â”€â”€ ANALYSIS TABS CONFIG â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const ANALYSIS_TABS = [
    { key: "business_overview",  label: "Overview",    shortLabel: "Overview",  icon: "â—ˆ", desc: "Company profile & market position" },
    { key: "financial_analysis", label: "Financials",  shortLabel: "P&L",       icon: "â—‰", desc: "P&L, balance sheet & cash flows" },
    { key: "investment_thesis",  label: "Thesis",      shortLabel: "Thesis",    icon: "â—Ž", desc: "Bull & bear case arguments" },
    { key: "risks_and_outlook",  label: "Risks",       shortLabel: "Risks",     icon: "â—", desc: "Key risks & 12â€“18M outlook" },
    { key: "full_report",        label: "Full Report", shortLabel: "Report",    icon: "â–£", desc: "Complete institutional deep dive" },
];

// Per-tab accent colours for visual differentiation
const TAB_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

// â”€â”€â”€ TAB ICONS (SVG-based, sharper than glyphs) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const TAB_ICONS = [
    // Overview â€“ compass rose
    ({ color, size = 16 }) => (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke={color} strokeWidth="1.2" opacity="0.4"/>
            <circle cx="8" cy="8" r="1.5" fill={color}/>
            <path d="M8 2v2M8 12v2M2 8h2M12 8h2" stroke={color} strokeWidth="1.2" strokeLinecap="round"/>
            <path d="M5.5 5.5L7.2 7.2M8.8 8.8L10.5 10.5" stroke={color} strokeWidth="1" strokeLinecap="round" opacity="0.6"/>
        </svg>
    ),
    // Financials â€“ bar chart
    ({ color, size = 16 }) => (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
            <rect x="2" y="9" width="3" height="5" rx="1" fill={color} opacity="0.9"/>
            <rect x="6.5" y="5" width="3" height="9" rx="1" fill={color}/>
            <rect x="11" y="2" width="3" height="12" rx="1" fill={color} opacity="0.7"/>
        </svg>
    ),
    // Thesis â€“ lightbulb
    ({ color, size = 16 }) => (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
            <path d="M8 2C5.8 2 4 3.8 4 6c0 1.5.8 2.8 2 3.5V11h4V9.5C11.2 8.8 12 7.5 12 6c0-2.2-1.8-4-4-4z" stroke={color} strokeWidth="1.2" fill="none"/>
            <path d="M6 12h4M6.5 13.5h3" stroke={color} strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
    ),
    // Risks â€“ shield
    ({ color, size = 16 }) => (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
            <path d="M8 2L3 4.5V8c0 2.8 2 5.2 5 6 3-0.8 5-3.2 5-6V4.5L8 2z" stroke={color} strokeWidth="1.2" fill="none"/>
            <path d="M8 6v3M8 10.5v.5" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
    ),
    // Full Report â€“ document
    ({ color, size = 16 }) => (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
            <rect x="3" y="1.5" width="10" height="13" rx="1.5" stroke={color} strokeWidth="1.2" fill="none"/>
            <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" stroke={color} strokeWidth="1.1" strokeLinecap="round"/>
        </svg>
    ),
];

// â”€â”€â”€ BUSINESS ANALYSIS CARD (Premium) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function BusinessAnalysisCard({ analysis, D, C, isPhone }) {
    const [activeTab, setActiveTab] = useState(0);
    const [animKey, setAnimKey] = useState(0);
    const [hoverTab, setHoverTab] = useState(null);

    if (!analysis) return null;

    const handleTabChange = (idx) => {
        if (idx === activeTab) return;
        setActiveTab(idx);
        setAnimKey(k => k + 1);
    };

    const tab = ANALYSIS_TABS[activeTab];
    const content = analysis[tab.key] || "";
    const tabColor = TAB_COLORS[activeTab];

    const analyzedDate = analysis.analyzed_at
        ? new Date(analysis.analyzed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
        : null;

    const isDark = D.isDark;

    // Glassy card base
    const cardBg = isDark
        ? "linear-gradient(160deg, rgba(13,20,40,0.97) 0%, rgba(8,14,30,0.99) 100%)"
        : "linear-gradient(160deg, rgba(255,255,255,0.99) 0%, rgba(248,250,255,0.99) 100%)";

    const glassEdge = isDark
        ? "0 0 0 1px rgba(255,255,255,0.07) inset, 0 0 0 1px rgba(100,130,255,0.05) inset"
        : "0 0 0 1px rgba(255,255,255,0.95) inset, 0 0 0 1px rgba(99,102,241,0.06) inset";

    const premiumShadow = isDark
        ? `0 40px 100px rgba(0,0,0,0.65), 0 16px 40px rgba(0,0,0,0.40), ${glassEdge}`
        : `0 32px 80px rgba(15,23,42,0.12), 0 8px 24px rgba(15,23,42,0.06), ${glassEdge}`;

    return (
        <div style={{
            borderRadius: 28,
            background: cardBg,
            boxShadow: premiumShadow,
            overflow: "hidden",
            position: "relative",
            marginBottom: 18,
        }}>
            {/* â”€â”€ MULTI-LAYER AMBIENT GLOW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <div style={{
                position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
                background: isDark
                    ? `radial-gradient(ellipse 80% 300px at 15% -60px, ${withAlpha(tabColor, 0.13)} 0%, transparent 65%), radial-gradient(ellipse 50% 200px at 85% 0%, ${withAlpha(tabColor, 0.07)} 0%, transparent 60%)`
                    : `radial-gradient(ellipse 80% 250px at 15% -60px, ${withAlpha(tabColor, 0.08)} 0%, transparent 65%), radial-gradient(ellipse 40% 160px at 85% 0%, ${withAlpha(tabColor, 0.05)} 0%, transparent 60%)`,
                transition: "background 0.6s cubic-bezier(0.4,0,0.2,1)",
            }} />

            {/* â”€â”€ HEADER ZONE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <div style={{ position: "relative", zIndex: 2, padding: isPhone ? "24px 20px 0" : "32px 36px 0" }}>

                {/* Top meta row: eyebrow + score ring */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 20, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Eyebrow bar */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                            <div style={{
                                display: "flex", alignItems: "center", gap: 6,
                                padding: "4px 10px 4px 8px",
                                borderRadius: 999,
                                background: withAlpha(tabColor, isDark ? 0.12 : 0.08),
                                border: `1px solid ${withAlpha(tabColor, isDark ? 0.22 : 0.15)}`,
                                transition: "all 0.3s ease",
                            }}>
                                <div style={{ width: 5, height: 5, borderRadius: "50%", background: tabColor, boxShadow: `0 0 6px ${withAlpha(tabColor, 0.8)}` }} />
                                <span style={{
                                    fontSize: 9.5, color: tabColor, textTransform: "uppercase",
                                    letterSpacing: ".2em", fontWeight: 800,
                                    fontFamily: "'DM Sans', sans-serif",
                                    transition: "color 0.3s",
                                }}>Research & Analysis</span>
                            </div>
                        </div>

                        {/* Title */}
                        <div style={{
                            fontSize: isPhone ? 24 : 30, fontWeight: 900, color: D.text,
                            letterSpacing: "-0.05em", fontFamily: "'DM Sans', sans-serif",
                            lineHeight: 1.08, marginBottom: 10,
                        }}>
                            Business Analysis
                        </div>

                        {/* Meta chips row */}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            {analysis.company_name && (
                                <span style={{
                                    display: "inline-flex", alignItems: "center", gap: 5,
                                    padding: "3px 9px", borderRadius: 8,
                                    background: isDark ? withAlpha(D.text, 0.07) : withAlpha(D.text, 0.05),
                                    border: `1px solid ${D.panelBorder}`,
                                    fontSize: 11.5, color: D.text, fontWeight: 600,
                                    fontFamily: "'DM Sans', sans-serif",
                                }}>
                                    {analysis.company_name}
                                </span>
                            )}
                            {analysis.sector && (
                                <span style={{
                                    display: "inline-flex", alignItems: "center",
                                    padding: "3px 9px", borderRadius: 8,
                                    background: isDark ? withAlpha(tabColor, 0.09) : withAlpha(tabColor, 0.06),
                                    border: `1px solid ${withAlpha(tabColor, 0.18)}`,
                                    fontSize: 11.5, color: tabColor, fontWeight: 600,
                                    fontFamily: "'DM Sans', sans-serif",
                                    transition: "all 0.3s ease",
                                }}>
                                    {analysis.sector}
                                </span>
                            )}
                            {analyzedDate && (
                                <span style={{
                                    fontSize: 11, color: D.subtext, opacity: 0.6,
                                    fontFamily: "'DM Mono', monospace",
                                    padding: "3px 6px",
                                }}>Â· {analyzedDate}</span>
                            )}
                        </div>
                    </div>

                    {/* Score ring â€” elevated */}
                    {analysis.score != null && (
                        <div style={{
                            padding: 2,
                            borderRadius: "50%",
                            background: isDark
                                ? `radial-gradient(circle, ${withAlpha(tabColor, 0.15)} 0%, transparent 70%)`
                                : `radial-gradient(circle, ${withAlpha(tabColor, 0.10)} 0%, transparent 70%)`,
                            transition: "background 0.5s",
                        }}>
                            <ScoreRing score={Number(analysis.score)} D={D} C={C} />
                        </div>
                    )}
                </div>

                {/* â”€â”€ PREMIUM TAB BAR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                <div style={{
                    display: "flex",
                    gap: isPhone ? 6 : 8,
                    overflowX: "auto",
                    marginLeft: isPhone ? -20 : -36,
                    marginRight: isPhone ? -20 : -36,
                    paddingLeft: isPhone ? 20 : 36,
                    paddingRight: isPhone ? 20 : 36,
                    paddingBottom: 0,
                    scrollbarWidth: "none",
                    msOverflowStyle: "none",
                }}>
                    {ANALYSIS_TABS.map((t, idx) => {
                        const active = activeTab === idx;
                        const hovering = hoverTab === idx && !active;
                        const tColor = TAB_COLORS[idx];
                        const IconComp = TAB_ICONS[idx];
                        return (
                            <button
                                key={t.key}
                                onClick={() => handleTabChange(idx)}
                                onMouseEnter={() => setHoverTab(idx)}
                                onMouseLeave={() => setHoverTab(null)}
                                style={{
                                    position: "relative",
                                    flexShrink: 0,
                                    border: "none",
                                    cursor: "pointer",
                                    outline: "none",
                                    borderRadius: "12px 12px 0 0",
                                    padding: isPhone ? "10px 14px 14px" : "11px 20px 16px",
                                    background: active
                                        ? isDark
                                            ? `linear-gradient(180deg, ${withAlpha(tColor, 0.13)} 0%, ${withAlpha(tColor, 0.07)} 100%)`
                                            : `linear-gradient(180deg, ${withAlpha(tColor, 0.09)} 0%, ${withAlpha(tColor, 0.05)} 100%)`
                                        : hovering
                                            ? isDark ? withAlpha(D.text, 0.04) : withAlpha(D.text, 0.03)
                                            : "transparent",
                                    transition: "background 0.2s ease",
                                    // Active tab gets a top border glow
                                    boxShadow: active
                                        ? `inset 0 2px 0 0 ${tColor}, inset 1px 0 0 ${withAlpha(tColor, 0.15)}, inset -1px 0 0 ${withAlpha(tColor, 0.15)}`
                                        : "none",
                                }}
                            >
                                <div style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: isPhone ? 0 : 7,
                                    flexDirection: isPhone ? "column" : "row",
                                }}>
                                    <div style={{
                                        opacity: active ? 1 : hovering ? 0.7 : 0.45,
                                        transition: "opacity 0.2s",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        marginBottom: isPhone ? 4 : 0,
                                    }}>
                                        <IconComp color={active ? tColor : D.subtext} size={isPhone ? 14 : 15} />
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", alignItems: isPhone ? "center" : "flex-start", gap: 1 }}>
                                        <span style={{
                                            fontSize: isPhone ? 10.5 : 12,
                                            fontWeight: active ? 700 : 500,
                                            color: active ? tColor : hovering ? D.text : D.subtext,
                                            letterSpacing: active ? ".02em" : ".03em",
                                            fontFamily: "'DM Sans', sans-serif",
                                            whiteSpace: "nowrap",
                                            transition: "color 0.2s",
                                        }}>
                                            {isPhone ? t.shortLabel : t.label}
                                        </span>
                                        {!isPhone && (
                                            <span style={{
                                                fontSize: 9.5, color: active ? withAlpha(tColor, 0.7) : D.subtext,
                                                opacity: active ? 0.85 : 0.45,
                                                fontFamily: "'DM Sans', sans-serif",
                                                letterSpacing: ".01em",
                                                transition: "all 0.2s",
                                                whiteSpace: "nowrap",
                                            }}>
                                                {t.desc}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {/* Active bottom fill bleed (connects tab to content) */}
                                {active && (
                                    <div style={{
                                        position: "absolute", bottom: 0, left: 0, right: 0, height: 2,
                                        background: isDark
                                            ? `linear-gradient(180deg, ${withAlpha("#0d1428", 0.97)} 0%, ${withAlpha("#0d1428", 0.97)} 100%)`
                                            : `linear-gradient(180deg, ${withAlpha("#ffffff", 0.97)} 0%, ${withAlpha("#f8fafd", 0.97)} 100%)`,
                                        zIndex: 10,
                                    }} />
                                )}
                            </button>
                        );
                    })}
                    {/* Spacer fill line */}
                    <div style={{ flex: 1, borderBottom: `1px solid ${D.panelBorder}`, marginBottom: 0 }} />
                </div>
            </div>

            {/* â”€â”€ CONTENT ZONE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <div style={{
                position: "relative", zIndex: 1,
                background: isDark
                    ? `linear-gradient(180deg, ${withAlpha("#0d1428", 0.97)} 0%, ${withAlpha("#080e1e", 0.99)} 100%)`
                    : `linear-gradient(180deg, ${withAlpha("#ffffff", 0.97)} 0%, ${withAlpha("#f8fafd", 0.99)} 100%)`,
                borderTop: `1px solid ${D.panelBorder}`,
            }}>
                {/* Premium section header strip */}
                <div style={{
                    padding: isPhone ? "14px 20px" : "14px 36px",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    borderBottom: `1px solid ${D.panelBorder}`,
                    background: isDark
                        ? withAlpha(tabColor, 0.04)
                        : withAlpha(tabColor, 0.025),
                    transition: "background 0.4s",
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {/* Animated pulse dot */}
                        <div style={{ position: "relative", width: 8, height: 8, flexShrink: 0 }}>
                            <div style={{
                                position: "absolute", inset: 0, borderRadius: "50%",
                                background: tabColor, opacity: 0.25,
                                animation: "baPulseRing 2s ease-in-out infinite",
                                transform: "scale(1)",
                            }} />
                            <div style={{
                                position: "absolute", inset: "2px",
                                borderRadius: "50%", background: tabColor,
                                boxShadow: `0 0 8px ${withAlpha(tabColor, 0.8)}`,
                            }} />
                        </div>
                        <span style={{
                            fontSize: 11, color: tabColor, fontWeight: 700,
                            letterSpacing: ".12em", textTransform: "uppercase",
                            fontFamily: "'DM Sans', sans-serif",
                        }}>
                            {tab.label}
                        </span>
                        <span style={{
                            fontSize: 11.5, color: D.subtext, opacity: 0.55,
                            fontFamily: "'DM Sans', sans-serif", fontStyle: "italic",
                        }}>
                            â€” {tab.desc}
                        </span>
                    </div>

                    {/* Right: content length indicator dots */}
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        {ANALYSIS_TABS.map((_, idx) => (
                            <div key={idx} style={{
                                width: activeTab === idx ? 16 : 5,
                                height: 5, borderRadius: 999,
                                background: activeTab === idx ? tabColor : withAlpha(D.subtext, 0.2),
                                transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)",
                                boxShadow: activeTab === idx ? `0 0 8px ${withAlpha(tabColor, 0.5)}` : "none",
                            }} />
                        ))}
                    </div>
                </div>

                {/* Scrollable markdown content */}
                <div
                    key={animKey}
                    style={{
                        padding: isPhone ? "22px 20px 32px" : "30px 36px 42px",
                        maxHeight: 600,
                        overflowY: "auto",
                        animation: "baFadeSlide 0.35s cubic-bezier(0.4,0,0.2,1) both",
                        scrollbarWidth: "thin",
                        scrollbarColor: `${withAlpha(tabColor, 0.25)} transparent`,
                    }}
                >
                    <MarkdownLite text={content} D={D} accentColor={tabColor} />
                </div>

                {/* Bottom fade-out gradient for scrollable content */}
                <div style={{
                    position: "sticky", bottom: 0, left: 0, right: 0,
                    height: 48, pointerEvents: "none",
                    background: isDark
                        ? `linear-gradient(0deg, ${withAlpha("#080e1e", 0.92)} 0%, transparent 100%)`
                        : `linear-gradient(0deg, ${withAlpha("#f8fafd", 0.92)} 0%, transparent 100%)`,
                    marginTop: -48,
                }} />
            </div>

            {/* â”€â”€ INLINE KEYFRAMES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <style>{`
                @keyframes baFadeSlide {
                    from { opacity: 0; transform: translateY(10px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                @keyframes baPulseRing {
                    0%, 100% { transform: scale(1); opacity: 0.25; }
                    50%      { transform: scale(2.2); opacity: 0; }
                }
            `}</style>
        </div>
    );
}

// â”€â”€â”€ TAG CONFIG (announcement categories â†’ display) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const TAG_CONFIG = {
    "M&A":              { label: "M&A",             color: "#8b5cf6", bg: "rgba(139,92,246,0.10)", border: "rgba(139,92,246,0.22)" },
    "BOARD_MEETING":    { label: "Board Meeting",   color: "#f59e0b", bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.22)" },
    "INVESTOR_ACTIVITY":{ label: "Investor Meet",   color: "#3b82f6", bg: "rgba(59,130,246,0.10)", border: "rgba(59,130,246,0.22)" },
    "ORDER_FLOW":       { label: "Order Flow",      color: "#10b981", bg: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.22)" },
    "INSIDER_WINDOW":   { label: "Insider Window",  color: "#ef4444", bg: "rgba(239,68,68,0.10)",  border: "rgba(239,68,68,0.22)"  },
    "MANAGEMENT_CHANGE":{ label: "Management",      color: "#f97316", bg: "rgba(249,115,22,0.10)", border: "rgba(249,115,22,0.22)" },
    "GENERAL_UPDATE":   { label: "General Update",  color: "#64748b", bg: "rgba(100,116,139,0.10)",border: "rgba(100,116,139,0.22)"},
    "OTHER":            { label: "Other",           color: "#94a3b8", bg: "rgba(148,163,184,0.08)",border: "rgba(148,163,184,0.18)"},
};

function parseTags(tagsRaw) {
    if (!tagsRaw) return [];
    if (Array.isArray(tagsRaw)) return tagsRaw;
    try { return JSON.parse(tagsRaw); } catch { return []; }
}

function AnnouncementTag({ tag, D }) {
    const cfg = TAG_CONFIG[tag] || TAG_CONFIG["OTHER"];
    return (
        <span style={{
            display: "inline-flex", alignItems: "center",
            padding: "2px 8px", borderRadius: 6,
            fontSize: 9.5, fontWeight: 700,
            letterSpacing: ".08em", textTransform: "uppercase",
            color: cfg.color, background: cfg.bg,
            border: `1px solid ${cfg.border}`,
            fontFamily: "'DM Sans', sans-serif",
            whiteSpace: "nowrap",
        }}>
            {cfg.label}
        </span>
    );
}

function AnnouncementRow({ ann, D, C, isPhone, idx }) {
    const [expanded, setExpanded] = useState(false);
    const [hovered, setHovered] = useState(false);
    const isDark = D.isDark;

    const tags = parseTags(ann.tags);
    const hasHighPriority = ann.priority >= 10;
    const isMedPriority = ann.priority >= 4 && ann.priority < 10;

    const dt = ann.announcement_datetime
        ? new Date(ann.announcement_datetime)
        : ann.exchange_datetime
        ? new Date(ann.exchange_datetime)
        : null;

    const dateStr = dt
        ? dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
        : "â€”";
    const timeStr = dt
        ? dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
        : "";

    const accentColor = hasHighPriority ? C.purple : isMedPriority ? C.amber : D.subtext;

    return (
        <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                borderRadius: 16,
                border: `1px solid ${hovered ? withAlpha(accentColor, isDark ? 0.30 : 0.18) : D.panelBorder}`,
                background: hovered
                    ? (isDark ? withAlpha(accentColor, 0.05) : withAlpha(accentColor, 0.03))
                    : (isDark
                        ? `linear-gradient(135deg, ${withAlpha("#1e293b", 0.85)} 0%, ${withAlpha("#0f172a", 0.80)} 100%)`
                        : `linear-gradient(135deg, ${withAlpha("#ffffff", 0.99)} 0%, ${withAlpha("#f8fafc", 0.97)} 100%)`),
                boxShadow: hovered ? D.shadowMd : "none",
                overflow: "hidden",
                transition: "all 0.18s cubic-bezier(0.4, 0, 0.2, 1)",
                animation: `ptdFadeIn 0.3s cubic-bezier(0.4,0,0.2,1) both`,
                animationDelay: `${idx * 0.04}s`,
                position: "relative",
            }}
        >
            {/* Priority accent bar */}
            {(hasHighPriority || isMedPriority) && (
                <div style={{
                    position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
                    background: accentColor,
                    borderRadius: "16px 0 0 16px",
                    boxShadow: `0 0 10px ${withAlpha(accentColor, 0.5)}`,
                }} />
            )}

            <button
                onClick={() => setExpanded(e => !e)}
                style={{
                    width: "100%", textAlign: "left", background: "none", border: "none",
                    cursor: "pointer", padding: isPhone ? "14px 14px 14px 18px" : "16px 20px 16px 24px",
                    display: "flex", alignItems: "flex-start", gap: 14,
                    fontFamily: "'DM Sans', sans-serif",
                }}
            >
                {/* Expand/collapse chevron */}
                <div style={{
                    flexShrink: 0, width: 22, height: 22, borderRadius: 6,
                    background: isDark ? withAlpha(D.text, 0.07) : withAlpha(D.text, 0.05),
                    border: `1px solid ${D.panelBorder}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    marginTop: 2,
                    transition: "transform 0.2s ease",
                    transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
                }}>
                    <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
                        <path d="M3.5 2l3.5 3-3.5 3" stroke={D.subtext} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </div>

                {/* Main content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Top row: category + date */}
                    <div style={{
                        display: "flex", alignItems: "center", gap: 8,
                        flexWrap: "wrap", marginBottom: 6,
                    }}>
                        <span style={{
                            fontSize: 10, fontWeight: 700, color: D.subtext,
                            textTransform: "uppercase", letterSpacing: ".12em",
                            fontFamily: "'DM Sans', sans-serif",
                            opacity: 0.7,
                        }}>
                            {ann.category}
                        </span>
                        <span style={{
                            fontSize: 9.5, color: D.subtext, opacity: 0.45,
                            fontFamily: "'DM Mono', monospace",
                        }}>Â·</span>
                        <span style={{
                            fontSize: 10.5, color: D.subtext, opacity: 0.6,
                            fontFamily: "'DM Mono', monospace",
                        }}>
                            {dateStr}{timeStr ? ` Â· ${timeStr}` : ""}
                        </span>
                        {/* Tags */}
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginLeft: "auto" }}>
                            {tags.filter(t => t !== "OTHER" || tags.length === 1).map(tag => (
                                <AnnouncementTag key={tag} tag={tag} D={D} />
                            ))}
                        </div>
                    </div>

                    {/* Announcement text preview */}
                    <div style={{
                        fontSize: isPhone ? 12.5 : 13,
                        color: D.text,
                        lineHeight: 1.6,
                        fontFamily: "'DM Sans', sans-serif",
                        fontWeight: 450,
                        display: "-webkit-box",
                        WebkitLineClamp: expanded ? "unset" : 2,
                        WebkitBoxOrient: "vertical",
                        overflow: expanded ? "visible" : "hidden",
                        transition: "all 0.25s ease",
                    }}>
                        {ann.announcement_text}
                    </div>

                    {/* Expanded: attachment link */}
                    {expanded && ann.attachment_url && (
                        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <a
                                href={ann.attachment_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                style={{
                                    display: "inline-flex", alignItems: "center", gap: 6,
                                    padding: "6px 12px", borderRadius: 8,
                                    background: isDark ? withAlpha(C.blue, 0.12) : withAlpha(C.blue, 0.08),
                                    border: `1px solid ${withAlpha(C.blue, 0.22)}`,
                                    color: C.blue, fontSize: 11.5, fontWeight: 600,
                                    fontFamily: "'DM Sans', sans-serif",
                                    textDecoration: "none",
                                    transition: "all 0.15s ease",
                                }}
                            >
                                <svg width={13} height={13} viewBox="0 0 13 13" fill="none">
                                    <path d="M7.5 1H12v4.5M12 1L5.5 7.5M5 2.5H2C1.4 2.5 1 2.9 1 3.5v7.5C1 11.6 1.4 12 2 12h7.5c.6 0 1-.4 1-1V8" stroke={C.blue} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                View Filing
                                {ann.attachment_size && (
                                    <span style={{ opacity: 0.6, fontSize: 10 }}>({ann.attachment_size})</span>
                                )}
                            </a>
                            {ann.industry && (
                                <span style={{
                                    fontSize: 10.5, color: D.subtext, opacity: 0.55,
                                    fontFamily: "'DM Sans', sans-serif",
                                    padding: "6px 10px", borderRadius: 8,
                                    background: isDark ? withAlpha(D.text, 0.05) : withAlpha(D.text, 0.04),
                                    border: `1px solid ${D.panelBorder}`,
                                }}>
                                    {ann.industry}
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </button>
        </div>
    );
}

// â”€â”€â”€ ANNOUNCEMENTS TAB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function AnnouncementsTab({ symbol, D, C, isPhone }) {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [activeFilter, setActiveFilter] = useState("ALL");
    const [page, setPage] = useState(0);
    const PAGE_SIZE = 20;
    const isDark = D.isDark;
    const H = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };

    useEffect(() => {
        if (!symbol) return;
        let cancelled = false;
        setLoading(true); setError("");
        (async () => {
            try {
                const url = `${SUPABASE_URL}/rest/v1/corporate_announcements?symbol=eq.${encodeURIComponent(symbol.trim().toUpperCase())}&select=seq_id,symbol,company_name,category,announcement_text,announcement_datetime,exchange_datetime,industry,attachment_url,attachment_size,tags,priority&order=announcement_datetime.desc&limit=200`;
                const r = await fetch(url, { headers: H });
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const rows = await r.json();
                if (!cancelled) setData(Array.isArray(rows) ? rows : []);
            } catch (e) {
                if (!cancelled) setError(e.message || "Failed to load announcements");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [symbol]);

    // Derive unique filter options from data
    const filterOptions = useMemo(() => {
        const tagSet = new Set();
        data.forEach(a => parseTags(a.tags).forEach(t => tagSet.add(t)));
        const options = [{ id: "ALL", label: "All", count: data.length }];
        // Priority order for filters
        const order = ["M&A","BOARD_MEETING","INVESTOR_ACTIVITY","ORDER_FLOW","INSIDER_WINDOW","MANAGEMENT_CHANGE","GENERAL_UPDATE","OTHER"];
        order.forEach(t => {
            if (tagSet.has(t)) {
                const cnt = data.filter(a => parseTags(a.tags).includes(t)).length;
                options.push({ id: t, label: (TAG_CONFIG[t]?.label || t), count: cnt });
            }
        });
        return options;
    }, [data]);

    const filtered = useMemo(() => {
        if (activeFilter === "ALL") return data;
        return data.filter(a => parseTags(a.tags).includes(activeFilter));
    }, [data, activeFilter]);

    const paginated = filtered.slice(0, (page + 1) * PAGE_SIZE);
    const hasMore = paginated.length < filtered.length;

    const handleFilterChange = (id) => {
        setActiveFilter(id);
        setPage(0);
    };

    // Stats bar
    const statsItems = useMemo(() => {
        const highPri = data.filter(a => a.priority >= 10).length;
        const medPri  = data.filter(a => a.priority >= 4 && a.priority < 10).length;
        return [
            { label: "Total", value: data.length, color: D.accent },
            { label: "High Impact", value: highPri, color: C.purple },
            { label: "Medium Impact", value: medPri, color: C.amber },
        ];
    }, [data]);

    if (loading) {
        return (
            <div style={{ padding: isPhone ? "28px 16px" : "32px 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, color: D.subtext }}>
                <div style={{ width: 32, height: 32, border: `2.5px solid ${withAlpha(D.subtext, 0.15)}`, borderTopColor: C.blue, borderRadius: "50%", animation: "ptdSpin 0.75s linear infinite" }} />
                <span style={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>Loading announcementsâ€¦</span>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ padding: "20px 0" }}>
                <div style={{ padding: "14px 18px", borderRadius: 14, background: D.negSoft, border: `1px solid ${withAlpha(D.neg, 0.20)}`, color: D.neg, fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>
                    âš ï¸ {error}
                </div>
            </div>
        );
    }

    if (!data.length) {
        return (
            <div style={{ padding: "40px 0", textAlign: "center", color: D.subtext, fontFamily: "'DM Sans', sans-serif" }}>
                <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>ðŸ“‹</div>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>No Announcements</div>
                <div style={{ fontSize: 12, opacity: 0.6 }}>No exchange filings found for {symbol}</div>
            </div>
        );
    }

    return (
        <div style={{ animation: "ptdFadeIn 0.28s cubic-bezier(0.4,0,0.2,1) both" }}>
            {/* â”€â”€ Stats strip â”€â”€ */}
            <div style={{
                display: "flex", gap: isPhone ? 8 : 14, marginBottom: 18, flexWrap: "wrap",
            }}>
                {statsItems.map(s => (
                    <div key={s.label} style={{
                        flex: isPhone ? "1 1 auto" : "0 0 auto",
                        padding: isPhone ? "10px 12px" : "12px 18px",
                        borderRadius: 14,
                        background: isDark
                            ? `linear-gradient(135deg, ${withAlpha("#1e293b", 0.85)} 0%, ${withAlpha("#0f172a", 0.80)} 100%)`
                            : `linear-gradient(135deg, ${withAlpha("#ffffff", 0.99)} 0%, ${withAlpha("#f8fafc", 0.97)} 100%)`,
                        border: `1px solid ${D.panelBorder}`,
                        display: "flex", flexDirection: "column", gap: 3,
                    }}>
                        <span style={{ fontSize: 9.5, color: D.subtext, textTransform: "uppercase", letterSpacing: ".12em", fontWeight: 700, fontFamily: "'DM Sans', sans-serif", opacity: 0.7 }}>{s.label}</span>
                        <span style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: "'DM Mono', monospace", letterSpacing: "-0.03em" }}>{s.value}</span>
                    </div>
                ))}
            </div>

            {/* â”€â”€ Filter pills â”€â”€ */}
            <div style={{
                display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16,
                overflowX: "auto", scrollbarWidth: "none",
                paddingBottom: 2,
            }}>
                {filterOptions.map(opt => {
                    const active = activeFilter === opt.id;
                    const cfg = TAG_CONFIG[opt.id] || { color: D.accent, bg: withAlpha(D.accent, 0.08), border: withAlpha(D.accent, 0.20) };
                    return (
                        <button
                            key={opt.id}
                            onClick={() => handleFilterChange(opt.id)}
                            style={{
                                padding: "6px 12px", borderRadius: 999,
                                cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                                fontSize: 11.5, fontWeight: active ? 700 : 500,
                                whiteSpace: "nowrap",
                                background: active
                                    ? (opt.id === "ALL" ? withAlpha(D.accent, isDark ? 0.18 : 0.12) : cfg.bg)
                                    : (isDark ? withAlpha(D.text, 0.06) : withAlpha(D.text, 0.05)),
                                color: active
                                    ? (opt.id === "ALL" ? D.accent : cfg.color)
                                    : D.subtext,
                                border: `1px solid ${active
                                    ? (opt.id === "ALL" ? withAlpha(D.accent, 0.28) : cfg.border)
                                    : D.panelBorder}`,
                                transition: "all 0.15s ease",
                                display: "flex", alignItems: "center", gap: 5,
                            }}
                        >
                            {opt.label}
                            <span style={{
                                fontSize: 10, fontWeight: 700,
                                color: active ? (opt.id === "ALL" ? D.accent : cfg.color) : D.subtext,
                                opacity: active ? 0.8 : 0.45,
                                fontFamily: "'DM Mono', monospace",
                            }}>
                                {opt.count}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* â”€â”€ Announcement list â”€â”€ */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {paginated.map((ann, idx) => (
                    <AnnouncementRow
                        key={ann.seq_id || idx}
                        ann={ann}
                        D={D}
                        C={C}
                        isPhone={isPhone}
                        idx={idx}
                    />
                ))}
            </div>

            {/* â”€â”€ Load more â”€â”€ */}
            {hasMore && (
                <div style={{ textAlign: "center", marginTop: 20 }}>
                    <button
                        onClick={() => setPage(p => p + 1)}
                        style={{
                            padding: "10px 24px", borderRadius: 12,
                            background: isDark ? withAlpha(D.accent, 0.12) : withAlpha(D.accent, 0.08),
                            border: `1px solid ${withAlpha(D.accent, 0.22)}`,
                            color: D.accent, fontSize: 12.5, fontWeight: 600,
                            cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                            transition: "all 0.15s ease",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = isDark ? withAlpha(D.accent, 0.18) : withAlpha(D.accent, 0.12); }}
                        onMouseLeave={e => { e.currentTarget.style.background = isDark ? withAlpha(D.accent, 0.12) : withAlpha(D.accent, 0.08); }}
                    >
                        Load more Â· {filtered.length - paginated.length} remaining
                    </button>
                </div>
            )}
        </div>
    );
}

// â”€â”€â”€ MAIN COMPONENT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function PremiumTickerDashboard({ symbol, T }) {
    const [raw, setRaw] = useState(null);
    const [fin, setFin] = useState(null);
    const [analysis, setAnalysis] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [activeGroupIdx, setActiveGroupIdx] = useState(0);

    const { isPhone, isTablet, isCompact } = useViewportFlags();

    // Build the unified theme from the T prop (same pattern as StockDashboard.buildDashboardTheme)
    const D = useMemo(() => buildDashboardTheme(T || {}), [T]);
    const isDark = D.isDark;
    const C = useMemo(() => buildColorPalette(isDark), [isDark]);

    // â”€â”€ Data Fetch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    useEffect(() => {
        if (!symbol) return;
        let cancelled = false;
        const H = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
        (async () => {
            setLoading(true); setError("");
            try {
                const [ratioRows, finRows, analysisRows] = await Promise.all([
                    fetch(`${SUPABASE_URL}/rest/v1/stock_ratios?ticker=eq.${encodeURIComponent(symbol.trim().toUpperCase())}&select=*&limit=1`, { headers: H }).then(r => r.ok ? r.json() : []),
                    fetch(`${SUPABASE_URL}/rest/v1/company_financials?ticker=eq.${encodeURIComponent(symbol.trim().toUpperCase())}&select=inc_annual,bs_annual,cf_annual,inc_quarterly,bs_quarterly&limit=1`, { headers: H }).then(r => r.ok ? r.json() : []),
                    fetch(`${SUPABASE_URL}/rest/v1/company_analyses?ticker=eq.${encodeURIComponent(symbol.trim().toUpperCase())}&select=*&limit=1`, { headers: H }).then(r => r.ok ? r.json() : []),
                ]);
                if (cancelled) return;
                const parse = v => Array.isArray(v) ? v : (typeof v === "string" ? JSON.parse(v || "[]") : []);
                setRaw(ratioRows?.[0] || null);
                setAnalysis(analysisRows?.[0] || null);
                setFin(finRows?.[0] ? {
                    incAnn: parse(finRows[0].inc_annual),
                    bsAnn:  parse(finRows[0].bs_annual),
                    cfAnn:  parse(finRows[0].cf_annual),
                    incQtr: parse(finRows[0].inc_quarterly),
                    bsQtr:  parse(finRows[0].bs_quarterly),
                } : null);
                if (!ratioRows?.[0]) setError(`No data found for ${symbol}`);
            } catch (e) {
                if (!cancelled) setError(e.message || "Unable to load dashboard.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [symbol]);

    // â”€â”€ Derived financials â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const incAnn = useMemo(() => [...(fin?.incAnn || [])].sort((a, b) => String(a._period || "").localeCompare(String(b._period || ""))), [fin?.incAnn]);
    const bsAnn  = useMemo(() => [...(fin?.bsAnn  || [])].sort((a, b) => String(a._period || "").localeCompare(String(b._period || ""))), [fin?.bsAnn]);
    const cfAnn  = useMemo(() => [...(fin?.cfAnn  || [])].sort((a, b) => String(a._period || "").localeCompare(String(b._period || ""))), [fin?.cfAnn]);
    const incQtr = useMemo(() => [...(fin?.incQtr || [])].sort((a, b) => String(b._period || "").localeCompare(String(a._period || ""))), [fin?.incQtr]);
    const bsQtr  = useMemo(() => [...(fin?.bsQtr  || [])].sort((a, b) => String(b._period || "").localeCompare(String(a._period || ""))), [fin?.bsQtr]);

    const getBs = period => period ? bsAnn.find(b => b._period && b._period.slice(0,4) === period.slice(0,4)) || null : null;
    const getCf = period => period ? cfAnn.find(c => c._period && c._period.slice(0,4) === period.slice(0,4)) || null : null;
    const latestQtrWith = key => bsQtr.find(b => b[key] != null && Number(b[key]) !== 0) || bsQtr.find(b => b[key] != null) || null;

    const sharedTtm = useMemo(() => {
        const q = incQtr.slice(0, 4);
        if (!q.length) return null;
        const out = {};
        ["Revenue","COGS","GrossProfit","EBIT","Depreciation","InterestExpense","NetIncome"].forEach(k => {
            const vals = q.map(r => r[k]).filter(v => v != null && !isNaN(Number(v)));
            out[k] = vals.length ? vals.reduce((a, b) => a + Number(b), 0) : null;
        });
        out.EBITDA = ebitdaOf(out);
        out.EPS = q.map(r => r.EPS).filter(v => v != null && !isNaN(Number(v))).reduce((a, b) => a + Number(b), 0) || null;
        return out;
    }, [incQtr]);

    const marginSeries = {
        gpm:    [...incAnn.map(r => pct(r.GrossProfit, r.Revenue)).filter(Boolean),   raw?.gpm           ?? pct(sharedTtm?.GrossProfit, sharedTtm?.Revenue)],
        ebitda: [...incAnn.map(r => pct(ebitdaOf(r), r.Revenue)).filter(Boolean),     raw?.ebitda_margin ?? pct(ebitdaOf(sharedTtm), sharedTtm?.Revenue)],
        ebit:   [...incAnn.map(r => pct(r.EBIT, r.Revenue)).filter(Boolean),          raw?.ebit_margin   ?? pct(sharedTtm?.EBIT, sharedTtm?.Revenue)],
        pat:    [...incAnn.map(r => pct(r.NetIncome, r.Revenue)).filter(Boolean),      raw?.pat_margin    ?? pct(sharedTtm?.NetIncome, sharedTtm?.Revenue)],
    };

    const returnRows = incAnn.map(r => {
        const bs = getBs(r._period);
        const npm   = ratio(r.NetIncome, r.Revenue, 4);
        const turns = ratio(r.Revenue, bs?.TotalAssets, 4);
        const lev   = ratio(bs?.TotalAssets, bs?.StockholderEquity ?? bs?.TotalEquity, 4);
        const ebitM = ratio(r.EBIT, r.Revenue, 4);
        const ce    = bs ? (Number(bs.TotalEquity ?? bs.StockholderEquity ?? 0) + Number(bs.TotalDebt ?? ((bs.BorrowingsCurrent ?? 0) + (bs.LongTermDebt ?? 0))) - Number(bs.CashAndShortTerm ?? bs.Cash ?? 0) - Number(bs.LongTermInvestments ?? 0)) : null;
        const ceTurns = ratio(r.Revenue, ce, 4);
        return {
            roe:   npm != null && turns != null && lev   != null ? Number((npm * turns * lev   * 100).toFixed(2)) : null,
            roa:   npm != null && turns != null             ? Number((npm * turns         * 100).toFixed(2)) : null,
            roce:  ebitM != null && ceTurns != null         ? Number((ebitM * ceTurns     * 100).toFixed(2)) : null,
            asset: turns != null                            ? Number(turns.toFixed(2))                        : null,
        };
    });

    const ttmBs = latestQtrWith("TotalAssets");
    const ttmNpm = ratio(sharedTtm?.NetIncome, sharedTtm?.Revenue, 6);
    const ttmAssetTurns = ratio(sharedTtm?.Revenue, ttmBs?.TotalAssets, 6);
    const ttmFinLev = ratio(ttmBs?.TotalAssets, ttmBs?.StockholderEquity ?? ttmBs?.TotalEquity, 6);
    const ttmCurrentRatio = ratio(latestQtrWith("TotalCurrentAssets")?.TotalCurrentAssets, latestQtrWith("TotalCurrentLiab")?.TotalCurrentLiab);
    const ttmQuickRatio = (() => {
        const ca = latestQtrWith("TotalCurrentAssets")?.TotalCurrentAssets;
        const cl = latestQtrWith("TotalCurrentLiab")?.TotalCurrentLiab;
        const inv = latestQtrWith("Inventories")?.Inventories ?? 0;
        return n(ca) != null && n(cl) != null && Number(cl) !== 0 ? Number(((Number(ca) - Number(inv)) / Number(cl)).toFixed(2)) : null;
    })();
    const ttmInvTurn = ratio(sharedTtm?.COGS, latestQtrWith("Inventories")?.Inventories);
    const ttmCcc = (() => {
        const rec = latestQtrWith("TradeReceivables")?.TradeReceivables ?? latestQtrWith("AccountsReceivable-TradeNet")?.["AccountsReceivable-TradeNet"] ?? null;
        const inv = latestQtrWith("Inventories")?.Inventories ?? null;
        const pay = latestQtrWith("TradePayables")?.TradePayables ?? null;
        const debtor    = sharedTtm?.Revenue && rec != null ? (365 * Number(rec)) / Number(sharedTtm.Revenue) : null;
        const inventory = sharedTtm?.COGS    && inv != null ? (365 * Number(inv)) / Number(sharedTtm.COGS)   : null;
        const payable   = sharedTtm?.COGS    && pay != null ? (365 * Number(pay)) / Number(sharedTtm.COGS)   : null;
        return debtor != null && inventory != null && payable != null ? Number((debtor + inventory - payable).toFixed(1)) : raw?.ccc ?? null;
    })();
    const latestAnnual = incAnn[incAnn.length - 1];
    const otherRows = incAnn.map(r => {
        const bs = getBs(r._period);
        const rev = r.Revenue != null ? Number(r.Revenue) : null;
        const depr = r.Depreciation != null ? Number(r.Depreciation) : null;
        const rec = bs?.TradeReceivables ?? bs?.["AccountsReceivable-TradeNet"] ?? null;
        const inv = bs?.Inventories ?? null;
        return {
            recSales: pct(rec, rev),
            depSales: pct(depr, rev),
            invSales: pct(inv, rev),
        };
    });
    const latestReceivables = (() => {
        const q = latestQtrWith("TradeReceivables") || latestQtrWith("AccountsReceivable-TradeNet");
        if (q) return q.TradeReceivables ?? q["AccountsReceivable-TradeNet"] ?? null;
        const a = [...bsAnn].reverse().find(b =>
            (b.TradeReceivables != null && Number(b.TradeReceivables) !== 0) ||
            (b["AccountsReceivable-TradeNet"] != null && Number(b["AccountsReceivable-TradeNet"]) !== 0)
        );
        return a ? (a.TradeReceivables ?? a["AccountsReceivable-TradeNet"] ?? null) : null;
    })();
    const latestInventory = (() => {
        const q = latestQtrWith("Inventories");
        if (q) return q.Inventories ?? null;
        const a = [...bsAnn].reverse().find(b => b.Inventories != null && Number(b.Inventories) !== 0);
        return a?.Inventories ?? null;
    })();
    const ttmDepSales = pct(sharedTtm?.Depreciation, sharedTtm?.Revenue);
    const ttmRecSales = pct(latestReceivables, sharedTtm?.Revenue);
    const ttmInvSales = pct(latestInventory, sharedTtm?.Revenue);

    // â”€â”€ Metric groups â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const groups = [
        {
            title: "Margin Ratios",
            shortTitle: "Margins",
            subtitle: "Core earnings metrics and margin analysis",
            cards: [
                { title: "Gross Margin",  subtitle: "Gross Profit / Revenue", value: fmt(raw?.gpm           ?? marginSeries.gpm.at(-1),    "pct"), series: marginSeries.gpm,    color: C.green  },
                { title: "EBITDA Margin", subtitle: "EBITDA / Revenue",        value: fmt(raw?.ebitda_margin ?? marginSeries.ebitda.at(-1), "pct"), series: marginSeries.ebitda, color: C.blue   },
                { title: "EBIT Margin",   subtitle: "EBIT / Revenue",          value: fmt(raw?.ebit_margin   ?? marginSeries.ebit.at(-1),   "pct"), series: marginSeries.ebit,   color: C.amber  },
                { title: "PAT Margin",    subtitle: "Net Income / Revenue",    value: fmt(raw?.pat_margin    ?? marginSeries.pat.at(-1),    "pct"), series: marginSeries.pat,    color: C.rose   },
            ],
        },
        {
            title: "Return Ratios",
            shortTitle: "Returns",
            subtitle: "Capital efficiency and shareholder returns",
            cards: [
                { title: "ROE",         subtitle: "DuPont return on equity", value: fmt(raw?.roe ?? (ttmNpm && ttmAssetTurns && ttmFinLev ? ttmNpm * ttmAssetTurns * ttmFinLev * 100 : null), "pct"), series: [...returnRows.map(r => r.roe).filter(Boolean),   raw?.roe],               color: C.purple },
                { title: "ROA",         subtitle: "Net income / assets",     value: fmt(raw?.roa ?? (ttmNpm && ttmAssetTurns ? ttmNpm * ttmAssetTurns * 100 : null), "pct"),                         series: [...returnRows.map(r => r.roa).filter(Boolean),   raw?.roa],               color: C.green  },
                { title: "ROCE",        subtitle: "EBIT efficiency",         value: fmt(raw?.roce, "pct"),                                                                                            series: [...returnRows.map(r => r.roce).filter(Boolean),  raw?.roce],              color: C.cyan   },
                { title: "Asset Turns", subtitle: "Revenue / assets",        value: fmt(raw?.asset_turnover ?? ttmAssetTurns, "x"),                                                                   series: [...returnRows.map(r => r.asset).filter(Boolean), raw?.asset_turnover ?? ttmAssetTurns], color: C.indigo },
            ],
        },
        {
            title: "Liquidity & Leverage",
            shortTitle: "Liquidity",
            subtitle: "Balance sheet strength and solvency",
            cards: [
                { title: "Current Ratio",     subtitle: "Current assets / liabilities",  value: fmt(ttmCurrentRatio, "x"),  series: [...bsAnn.map(r => ratio(r.TotalCurrentAssets, r.TotalCurrentLiab)).filter(Boolean), ttmCurrentRatio], color: C.blue  },
                { title: "Quick Ratio",       subtitle: "(CA - Inventory) / CL",          value: fmt(ttmQuickRatio, "x"),    series: [...bsAnn.map(r => r.TotalCurrentAssets && r.TotalCurrentLiab ? ((Number(r.TotalCurrentAssets) - Number(r.Inventories ?? 0)) / Number(r.TotalCurrentLiab)) : null).filter(Boolean), ttmQuickRatio], color: C.green },
                { title: "Debt / Equity",     subtitle: "Total debt / equity",            value: fmt(raw?.debt_eq, "x"),     series: [...bsAnn.map(r => ratio(r.TotalDebt ?? ((r.BorrowingsCurrent ?? 0) + (r.LongTermDebt ?? 0)), r.TotalEquity ?? r.StockholderEquity)).filter(Boolean), raw?.debt_eq], color: C.rose  },
                { title: "Interest Coverage", subtitle: "EBIT / interest",                value: fmt(raw?.icr, "x"),         series: [...incAnn.map(r => ratio(Math.abs(Number(r.EBIT ?? 0)), Math.abs(Number(r.InterestExpense ?? 0)))).filter(Boolean), raw?.icr], color: C.amber },
            ],
        },
        {
            title: "Turnover & Growth",
            shortTitle: "Growth",
            subtitle: "Operational efficiency and quality metrics",
            cards: [
                { title: "Inventory Turnover",    subtitle: "COGS / inventory",              value: fmt(raw?.inv_turnover ?? ttmInvTurn, "x"),                                                        series: [...bsAnn.map(r => ratio(incAnn.find(i => i._period && r._period && i._period.slice(0,4) === r._period.slice(0,4))?.COGS, r.Inventories)).filter(Boolean), raw?.inv_turnover ?? ttmInvTurn], color: C.blue  },
                { title: "Cash Conversion Cycle", subtitle: "Debtor + inventory - payable",   value: fmt(ttmCcc, "days"),                                                                             series: [...incAnn.map(r => { const bs = getBs(r._period); const rev = Number(r.Revenue ?? 0); const cogs = Number(r.COGS ?? 0); const dd = rev && bs?.TradeReceivables != null ? (365 * Number(bs.TradeReceivables)) / rev : null; const id = cogs && bs?.Inventories != null ? (365 * Number(bs.Inventories)) / cogs : null; const pd = cogs && bs?.TradePayables != null ? (365 * Number(bs.TradePayables)) / cogs : null; return dd != null && id != null && pd != null ? Number((dd + id - pd).toFixed(1)) : null; }).filter(Boolean), ttmCcc], color: C.rose  },
                { title: "Sales Growth",          subtitle: "YoY revenue growth",             value: fmt(growth(sharedTtm?.Revenue, latestAnnual?.Revenue), "pct", 1),                               series: incAnn.slice(1).map((r, i) => growth(r.Revenue, incAnn[i].Revenue)).filter(Boolean).concat(growth(sharedTtm?.Revenue, latestAnnual?.Revenue)), color: C.green },
                { title: "CFO / PAT",             subtitle: "Cash conversion quality",        value: fmt(ratio(cfAnn.at(-1)?.OperatingCF, sharedTtm?.NetIncome) ?? raw?.cfo_pat, "x"),              series: incAnn.map(r => ratio(getCf(r._period)?.OperatingCF, r.NetIncome)).filter(Boolean).concat(ratio(cfAnn.at(-1)?.OperatingCF, sharedTtm?.NetIncome) ?? raw?.cfo_pat), color: C.amber },
            ],
        },
        {
            title: "Valuation",
            shortTitle: "Valuation",
            subtitle: "Market pricing and enterprise value metrics",
            cards: [
                { title: "Market Cap",  subtitle: "Current market capitalization", value: fmt(raw?.market_cap_cr, "cr"), series: [raw?.market_cap_cr], color: C.blue   },
                { title: "P/E",         subtitle: "Price / EPS",                   value: fmt(raw?.pe, "x", 1),          series: [raw?.pe],            color: C.amber  },
                { title: "P/S",         subtitle: "Market cap / sales",            value: fmt(raw?.ps, "x"),             series: [raw?.ps],             color: C.green  },
                { title: "EV / EBITDA", subtitle: "Enterprise value / EBITDA",     value: fmt(raw?.ev_ebitda, "x", 1),   series: [raw?.ev_ebitda],     color: C.purple },
            ],
        },
        {
            title: "Other Ratios",
            shortTitle: "Others",
            subtitle: "Working capital and depreciation intensity",
            cards: [
                { title: "Receivables / Sales", subtitle: "Trade receivables / revenue", value: fmt(ttmRecSales, "pct"), series: [...otherRows.map(r => r.recSales).filter(Boolean), ttmRecSales], color: C.cyan   },
                { title: "Dep / Sales",         subtitle: "Depreciation / revenue",      value: fmt(ttmDepSales, "pct"), series: [...otherRows.map(r => r.depSales).filter(Boolean), ttmDepSales], color: C.amber  },
                { title: "Inventory / Sales",   subtitle: "Inventory / revenue",         value: fmt(ttmInvSales, "pct"), series: [...otherRows.map(r => r.invSales).filter(Boolean), ttmInvSales], color: C.indigo },
            ],
        },
    ];

    const cardCols = isPhone ? 1 : isTablet ? 2 : 4;
    const calcCapitalEmployed = bs => {
        if (!bs) return null;
        const equity = bs.TotalEquity ?? bs.StockholderEquity ?? null;
        const debt = bs.TotalDebt ?? ((bs.BorrowingsCurrent ?? 0) + (bs.LongTermDebt ?? 0));
        const cash = bs.CashAndShortTerm ?? bs.Cash ?? 0;
        const ltInv = bs.LongTermInvestments ?? 0;
        if (equity == null) return null;
        return Number(equity) + Number(debt) - Number(cash) - Number(ltInv);
    };
    const latestPayables = latestQtrWith("TradePayables")?.TradePayables ?? null;
    const latestCf = cfAnn.at(-1);
    const returnBreakdownRows = incAnn.map(r => {
        const bs = getBs(r._period);
        const ce = calcCapitalEmployed(bs);
        const npm = ratio(r.NetIncome, r.Revenue, 6);
        const assetTurns = ratio(r.Revenue, bs?.TotalAssets, 6);
        const finLev = ratio(bs?.TotalAssets, bs?.StockholderEquity ?? bs?.TotalEquity, 6);
        const ebitMargin = ratio(r.EBIT, r.Revenue, 6);
        const ceTurnover = ratio(r.Revenue, ce, 6);
        return {
            roa: npm != null && assetTurns != null ? Number((npm * assetTurns * 100).toFixed(2)) : null,
            roe: npm != null && assetTurns != null && finLev != null ? Number((npm * assetTurns * finLev * 100).toFixed(2)) : null,
            roce: ebitMargin != null && ceTurnover != null ? Number((ebitMargin * ceTurnover * 100).toFixed(2)) : null,
            npm: npm != null ? Number((npm * 100).toFixed(2)) : null,
            assetTurns: assetTurns != null ? Number(assetTurns.toFixed(2)) : null,
            finLev: finLev != null ? Number(finLev.toFixed(2)) : null,
            ebitMargin: ebitMargin != null ? Number((ebitMargin * 100).toFixed(2)) : null,
            ceTurnover: ceTurnover != null ? Number(ceTurnover.toFixed(2)) : null,
        };
    });
    const ttmCapitalEmployed = calcCapitalEmployed(latestQtrWith("TotalEquity") || latestQtrWith("StockholderEquity"));
    const ttmNpmPct = pct(sharedTtm?.NetIncome, sharedTtm?.Revenue);
    const ttmEbitMarginPct = pct(sharedTtm?.EBIT, sharedTtm?.Revenue);
    const ttmFinLevRatio = ratio(ttmBs?.TotalAssets, ttmBs?.StockholderEquity ?? ttmBs?.TotalEquity);
    const ttmCeTurnover = ratio(sharedTtm?.Revenue, ttmCapitalEmployed);
    const leverageRows = bsAnn.map(r => {
        const eq = r.TotalEquity ?? r.StockholderEquity ?? null;
        const ltDebt = r.LongTermDebt ?? 0;
        const stDebt = r.BorrowingsCurrent ?? 0;
        const inc = incAnn.find(p => p._period && r._period && p._period.slice(0, 4) === r._period.slice(0, 4));
        return {
            debtEq: ratio(ltDebt + stDebt, eq),
            ltDebtEq: ratio(ltDebt, eq),
            stDebtEq: ratio(stDebt, eq),
            icr: ratio(Math.abs(Number(inc?.EBIT ?? 0)), Math.abs(Number(inc?.InterestExpense ?? 0))),
        };
    });
    const ttmLeverageBs = latestQtrWith("TotalEquity") || latestQtrWith("StockholderEquity");
    const ttmDebtEq = ratio((ttmLeverageBs?.LongTermDebt ?? 0) + (ttmLeverageBs?.BorrowingsCurrent ?? 0), ttmLeverageBs?.TotalEquity ?? ttmLeverageBs?.StockholderEquity);
    const ttmLtDebtEq = ratio(ttmLeverageBs?.LongTermDebt, ttmLeverageBs?.TotalEquity ?? ttmLeverageBs?.StockholderEquity);
    const ttmStDebtEq = ratio(ttmLeverageBs?.BorrowingsCurrent, ttmLeverageBs?.TotalEquity ?? ttmLeverageBs?.StockholderEquity);
    const turnoverRows = bsAnn.map(r => ({
        assetTurn: ratio(incAnn.find(i => i._period && r._period && i._period.slice(0, 4) === r._period.slice(0, 4))?.Revenue, r.TotalAssets),
        invTurn: ratio(incAnn.find(i => i._period && r._period && i._period.slice(0, 4) === r._period.slice(0, 4))?.COGS, r.Inventories),
    }));
    const growthRows = {
        sales: incAnn.slice(1).map((r, i) => growth(r.Revenue, incAnn[i].Revenue)).filter(v => v != null).concat(growth(sharedTtm?.Revenue, latestAnnual?.Revenue)),
        ebitda: incAnn.slice(1).map((r, i) => growth(ebitdaOf(r), ebitdaOf(incAnn[i]))).filter(v => v != null).concat(growth(ebitdaOf(sharedTtm), ebitdaOf(latestAnnual))),
        ebit: incAnn.slice(1).map((r, i) => growth(r.EBIT, incAnn[i].EBIT)).filter(v => v != null).concat(growth(sharedTtm?.EBIT, latestAnnual?.EBIT)),
        pat: incAnn.slice(1).map((r, i) => growth(r.NetIncome, incAnn[i].NetIncome)).filter(v => v != null).concat(growth(sharedTtm?.NetIncome, latestAnnual?.NetIncome)),
        eps: incAnn.slice(1).map((r, i) => growth(r.EPS, incAnn[i].EPS)).filter(v => v != null).concat(growth(sharedTtm?.EPS, latestAnnual?.EPS)),
    };
    const cashConversionRows = incAnn.map(r => {
        const bs = getBs(r._period);
        const rev = Number(r.Revenue ?? 0);
        const cogs = Number(r.COGS ?? 0);
        const rec = bs?.TradeReceivables ?? bs?.["AccountsReceivable-TradeNet"] ?? null;
        const inv = bs?.Inventories ?? null;
        const pay = bs?.TradePayables ?? null;
        const debtorDays = rev && rec != null ? Number(((365 * Number(rec)) / rev).toFixed(1)) : null;
        const inventoryDays = cogs && inv != null ? Number(((365 * Number(inv)) / cogs).toFixed(1)) : null;
        const payableDays = cogs && pay != null ? Number(((365 * Number(pay)) / cogs).toFixed(1)) : null;
        return {
            debtorDays,
            inventoryDays,
            payableDays,
            ccc: debtorDays != null && inventoryDays != null && payableDays != null ? Number((debtorDays + inventoryDays - payableDays).toFixed(1)) : null,
        };
    });
    const forensicRows = incAnn.map(r => {
        const cf = getCf(r._period);
        const bs = getBs(r._period);
        const rev = r.Revenue != null ? Number(r.Revenue) : null;
        const depr = r.Depreciation != null ? Number(r.Depreciation) : null;
        const cfo = cf?.OperatingCF != null ? Number(cf.OperatingCF) : null;
        const rec = bs?.TradeReceivables ?? bs?.["AccountsReceivable-TradeNet"] ?? null;
        const inv = bs?.Inventories ?? null;
        return {
            cfoPat: ratio(cfo, r.NetIncome),
            cfoEbitda: ratio(cfo, ebitdaOf(r)),
            depSales: pct(depr, rev),
            recSales: pct(rec, rev),
            invSales: pct(inv, rev),
        };
    });
    const ttmCfoPat = ratio(latestCf?.OperatingCF, sharedTtm?.NetIncome);
    const ttmCfoEbitda = ratio(latestCf?.OperatingCF, ebitdaOf(sharedTtm));
    const ttmDebtorDays = sharedTtm?.Revenue && latestReceivables != null ? Number(((365 * Number(latestReceivables)) / Number(sharedTtm.Revenue)).toFixed(1)) : null;
    const ttmInventoryDays = sharedTtm?.COGS && latestInventory != null ? Number(((365 * Number(latestInventory)) / Number(sharedTtm.COGS)).toFixed(1)) : null;
    const ttmPayableDays = sharedTtm?.COGS && latestPayables != null ? Number(((365 * Number(latestPayables)) / Number(sharedTtm.COGS)).toFixed(1)) : null;
    const premiumTabs = [
        {
            id: "margin",
            title: "Margin Ratios",
            shortTitle: "Margin Ratios",
            subtitle: "Core earnings metrics and margin analysis",
            cards: groups[0].cards,
        },
        {
            id: "return",
            title: "Return Ratios",
            shortTitle: "Return Ratios",
            subtitle: "DuPont returns and capital-efficiency breakdown",
            cards: [
                { title: "Du-Pont RoA", subtitle: "NPM x Asset Turns", value: fmt(raw?.roa ?? (ttmNpm && ttmAssetTurns ? ttmNpm * ttmAssetTurns * 100 : null), "pct"), series: [...returnBreakdownRows.map(r => r.roa).filter(v => v != null), raw?.roa], color: C.green },
                { title: "NPM", subtitle: "Net Profit Margin", value: fmt(ttmNpmPct, "pct"), series: [...returnBreakdownRows.map(r => r.npm).filter(v => v != null), ttmNpmPct], color: C.blue },
                { title: "Asset Turns", subtitle: "Revenue / assets", value: fmt(raw?.asset_turnover ?? ttmAssetTurns, "x"), series: [...returnBreakdownRows.map(r => r.assetTurns).filter(v => v != null), raw?.asset_turnover ?? ttmAssetTurns], color: C.indigo },
                { title: "Du-Pont RoE", subtitle: "NPM x turns x leverage", value: fmt(raw?.roe ?? (ttmNpm && ttmAssetTurns && ttmFinLev ? ttmNpm * ttmAssetTurns * ttmFinLev * 100 : null), "pct"), series: [...returnBreakdownRows.map(r => r.roe).filter(v => v != null), raw?.roe], color: C.purple },
                { title: "Financial Leverage", subtitle: "Assets / equity", value: fmt(ttmFinLevRatio, "x"), series: [...returnBreakdownRows.map(r => r.finLev).filter(v => v != null), ttmFinLevRatio], color: C.rose },
                { title: "Du-Pont ROCE", subtitle: "EBIT margin x CE turnover", value: fmt(raw?.roce ?? (ttmEbitMarginPct != null && ttmCeTurnover != null ? (ttmEbitMarginPct / 100) * ttmCeTurnover * 100 : null), "pct"), series: [...returnBreakdownRows.map(r => r.roce).filter(v => v != null), raw?.roce ?? (ttmEbitMarginPct != null && ttmCeTurnover != null ? (ttmEbitMarginPct / 100) * ttmCeTurnover * 100 : null)], color: C.cyan },
                { title: "EBIT Margin", subtitle: "EBIT / revenue", value: fmt(ttmEbitMarginPct, "pct"), series: [...returnBreakdownRows.map(r => r.ebitMargin).filter(v => v != null), ttmEbitMarginPct], color: C.amber },
                { title: "CE Turnover", subtitle: "Revenue / capital employed", value: fmt(ttmCeTurnover, "x"), series: [...returnBreakdownRows.map(r => r.ceTurnover).filter(v => v != null), ttmCeTurnover], color: C.green },
            ],
        },
        {
            id: "liquidity",
            title: "Liquidity Ratios",
            shortTitle: "Liquidity Ratios",
            subtitle: "Short-term balance sheet strength",
            cards: [
                { title: "Current Ratio", subtitle: "Current assets / liabilities", value: fmt(ttmCurrentRatio, "x"), series: [...bsAnn.map(r => ratio(r.TotalCurrentAssets, r.TotalCurrentLiab)).filter(v => v != null), ttmCurrentRatio], color: C.blue },
                { title: "Quick Ratio", subtitle: "(CA - Inventory) / CL", value: fmt(ttmQuickRatio, "x"), series: [...bsAnn.map(r => r.TotalCurrentAssets && r.TotalCurrentLiab ? ((Number(r.TotalCurrentAssets) - Number(r.Inventories ?? 0)) / Number(r.TotalCurrentLiab)) : null).filter(v => v != null), ttmQuickRatio], color: C.green },
            ],
        },
        {
            id: "leverage",
            title: "Leverage Ratios",
            shortTitle: "Leverage Ratios",
            subtitle: "Debt profile and solvency coverage",
            cards: [
                { title: "Debt / Equity", subtitle: "Total debt / equity", value: fmt(raw?.debt_eq ?? ttmDebtEq, "x"), series: [...leverageRows.map(r => r.debtEq).filter(v => v != null), raw?.debt_eq ?? ttmDebtEq], color: C.rose },
                { title: "LT Debt / Equity", subtitle: "Long-term debt / equity", value: fmt(ttmLtDebtEq, "x"), series: [...leverageRows.map(r => r.ltDebtEq).filter(v => v != null), ttmLtDebtEq], color: C.amber },
                { title: "ST Debt / Equity", subtitle: "Short-term debt / equity", value: fmt(ttmStDebtEq, "x"), series: [...leverageRows.map(r => r.stDebtEq).filter(v => v != null), ttmStDebtEq], color: C.indigo },
                { title: "Interest Coverage", subtitle: "EBIT / interest", value: fmt(raw?.icr, "x"), series: [...leverageRows.map(r => r.icr).filter(v => v != null), raw?.icr], color: C.green },
            ],
        },
        {
            id: "turnover",
            title: "Turnover Ratios",
            shortTitle: "Turnover Ratios",
            subtitle: "Asset efficiency and operating turns",
            cards: [
                { title: "Asset Turnover", subtitle: "Revenue / total assets", value: fmt(raw?.asset_turnover ?? ttmAssetTurns, "x"), series: [...turnoverRows.map(r => r.assetTurn).filter(v => v != null), raw?.asset_turnover ?? ttmAssetTurns], color: C.blue },
                { title: "Inventory Turnover", subtitle: "COGS / inventory", value: fmt(raw?.inv_turnover ?? ttmInvTurn, "x"), series: [...turnoverRows.map(r => r.invTurn).filter(v => v != null), raw?.inv_turnover ?? ttmInvTurn], color: C.green },
            ],
        },
        {
            id: "valuation",
            title: "Valuation Ratios",
            shortTitle: "Valuation Ratios",
            subtitle: "Market pricing and enterprise value metrics",
            cards: [
                { title: "Market Cap", subtitle: "Current market capitalization", value: fmt(raw?.market_cap_cr, "cr"), series: [raw?.market_cap_cr], color: C.blue },
                { title: "P/E", subtitle: "Price / EPS", value: fmt(raw?.pe, "x", 1), series: [raw?.pe], color: C.amber },
                { title: "P/S", subtitle: "Market cap / sales", value: fmt(raw?.ps, "x"), series: [raw?.ps], color: C.green },
                { title: "P/B", subtitle: "Market cap / book value", value: fmt(raw?.pb, "x"), series: [raw?.pb], color: C.indigo },
                { title: "EV / EBITDA", subtitle: "Enterprise value / EBITDA", value: fmt(raw?.ev_ebitda, "x", 1), series: [raw?.ev_ebitda], color: C.purple },
                { title: "Price / OCF", subtitle: "Market cap / operating cash", value: fmt(raw?.price_ocf, "x", 1), series: [raw?.price_ocf], color: C.cyan },
                { title: "Price / FCF", subtitle: "Market cap / free cash flow", value: fmt(raw?.price_fcf, "x", 1), series: [raw?.price_fcf], color: C.rose },
            ],
        },
        {
            id: "growth",
            title: "Growth Ratios",
            shortTitle: "Growth Ratios",
            subtitle: "Year-over-year operating growth",
            cards: [
                { title: "Sales Growth", subtitle: "Revenue growth", value: fmt(growth(sharedTtm?.Revenue, latestAnnual?.Revenue), "pct", 1), series: growthRows.sales, color: C.green },
                { title: "EBITDA Growth", subtitle: "EBITDA growth", value: fmt(growth(ebitdaOf(sharedTtm), ebitdaOf(latestAnnual)), "pct", 1), series: growthRows.ebitda, color: C.blue },
                { title: "EBIT Growth", subtitle: "EBIT growth", value: fmt(growth(sharedTtm?.EBIT, latestAnnual?.EBIT), "pct", 1), series: growthRows.ebit, color: C.amber },
                { title: "PAT Growth", subtitle: "Net income growth", value: fmt(growth(sharedTtm?.NetIncome, latestAnnual?.NetIncome), "pct", 1), series: growthRows.pat, color: C.rose },
                { title: "EPS Growth", subtitle: "EPS growth", value: fmt(growth(sharedTtm?.EPS, latestAnnual?.EPS), "pct", 1), series: growthRows.eps, color: C.indigo },
            ],
        },
        {
            id: "cash_conversion",
            title: "Cash Conversion",
            shortTitle: "Cash Conversion",
            subtitle: "Working-capital cycle in days",
            cards: [
                { title: "Debtor Days", subtitle: "365 x receivables / sales", value: fmt(ttmDebtorDays, "days"), series: [...cashConversionRows.map(r => r.debtorDays).filter(v => v != null), ttmDebtorDays], color: C.cyan },
                { title: "Inventory Days", subtitle: "365 x inventory / COGS", value: fmt(ttmInventoryDays, "days"), series: [...cashConversionRows.map(r => r.inventoryDays).filter(v => v != null), ttmInventoryDays], color: C.blue },
                { title: "Payable Days", subtitle: "365 x payables / COGS", value: fmt(ttmPayableDays, "days"), series: [...cashConversionRows.map(r => r.payableDays).filter(v => v != null), ttmPayableDays], color: C.amber },
                { title: "Cash Conversion Cycle", subtitle: "Debtor + inventory - payable", value: fmt(ttmCcc, "days"), series: [...cashConversionRows.map(r => r.ccc).filter(v => v != null), ttmCcc], color: C.rose },
            ],
        },
        {
            id: "forensic",
            title: "Forensic Check",
            shortTitle: "Forensic Check",
            subtitle: "Cash-conversion and accounting quality signals",
            cards: [
                { title: "CFO / PAT", subtitle: "Cash flow from ops / PAT", value: fmt(ttmCfoPat ?? raw?.cfo_pat, "x"), series: [...forensicRows.map(r => r.cfoPat).filter(v => v != null), ttmCfoPat ?? raw?.cfo_pat], color: C.green },
                { title: "CFO / EBITDA", subtitle: "Cash flow from ops / EBITDA", value: fmt(ttmCfoEbitda, "x"), series: [...forensicRows.map(r => r.cfoEbitda).filter(v => v != null), ttmCfoEbitda], color: C.blue },
                { title: "Dep / Sales", subtitle: "Depreciation / sales", value: fmt(ttmDepSales, "pct"), series: [...forensicRows.map(r => r.depSales).filter(v => v != null), ttmDepSales], color: C.amber },
                { title: "Receivables / Sales", subtitle: "Trade receivables / sales", value: fmt(ttmRecSales, "pct"), series: [...forensicRows.map(r => r.recSales).filter(v => v != null), ttmRecSales], color: C.cyan },
                { title: "Inventory / Sales", subtitle: "Inventory / sales", value: fmt(ttmInvSales, "pct"), series: [...forensicRows.map(r => r.invSales).filter(v => v != null), ttmInvSales], color: C.indigo },
            ],
        },
        {
            id: "__announcements__",
            title: "Announcements",
            shortTitle: "Announcements",
            subtitle: "Exchange filings and corporate disclosures",
            cards: [],
            isAnnouncementsTab: true,
        },
    ];
    const activeGroup = premiumTabs[activeGroupIdx] || premiumTabs[0];

    // â”€â”€â”€ Hero summary cards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const heroSummary = [
        { label: "Price", value: raw?.current_price != null ? `â‚¹${Number(raw.current_price).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "--", color: C.blue, icon: "ðŸ“ˆ" },
        { label: "ROE",   value: fmt(raw?.roe, "pct"), color: C.purple, icon: "ðŸ’Ž" },
        { label: "ROCE",  value: fmt(raw?.roce, "pct"), color: C.green, icon: "ðŸŽ¯" },
        { label: "P/E",   value: fmt(raw?.pe, "x", 1), color: C.amber, icon: "ðŸ“Š" },
    ];

    // â”€â”€ Computed backgrounds (matching StockDashboard shellBg pattern) â”€â”€â”€â”€â”€â”€
    const shellBg = D.shellBg;
    const panelBg = isDark
        ? `radial-gradient(ellipse at top left, ${withAlpha(C.blue, 0.12)} 0%, transparent 50%), radial-gradient(ellipse at top right, ${withAlpha(C.purple, 0.10)} 0%, transparent 50%), ${D.panelBg}`
        : `radial-gradient(ellipse at top left, ${withAlpha(C.blue, 0.07)} 0%, transparent 45%), radial-gradient(ellipse at 85% 15%, ${withAlpha(C.green, 0.05)} 0%, transparent 40%), ${D.panelBg}`;

    // â”€â”€â”€ LOADING STATE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (loading) {
        return (
            <div style={{ flex: 1, minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, color: D.subtext, fontSize: 13, background: shellBg, fontFamily: "'DM Sans', sans-serif" }}>
                <div style={{ width: 36, height: 36, border: `3px solid ${withAlpha(D.subtext, 0.18)}`, borderTopColor: C.blue, borderRadius: "50%", animation: "ptdSpin 0.75s linear infinite" }} />
                <div>Loading premium analytics for <span style={{ fontWeight: 700, color: C.blue, fontFamily: "'DM Mono', monospace" }}>{symbol}</span></div>
            </div>
        );
    }

    // â”€â”€â”€ ERROR STATE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (error && !raw) {
        return (
            <div style={{ margin: 24 }}>
                <SectionCard D={D}>
                    <div style={{ padding: "12px 16px", borderRadius: 14, border: `1px solid ${withAlpha(D.neg, 0.25)}`, background: D.negSoft, color: D.neg, fontWeight: 600, textAlign: "center", fontFamily: "'DM Sans', sans-serif" }}>
                        <div style={{ fontSize: 16, marginBottom: 6 }}>âš ï¸ Error Loading Data</div>
                        <div style={{ fontSize: 13, opacity: 0.8 }}>{error}</div>
                    </div>
                </SectionCard>
            </div>
        );
    }

    return (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", background: shellBg, fontFamily: "'DM Sans', sans-serif" }}>

            {/* â”€â”€ HERO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <div style={{
                background: panelBg,
                borderBottom: `1px solid ${D.panelBorder}`,
                backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
            }}>
                <div style={{ maxWidth: 1400, margin: "0 auto", padding: isPhone ? "24px 16px 28px" : "32px 28px 36px" }}>
                {/* Kicker + name row */}
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 20 }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ fontSize: 10, color: isDark ? withAlpha(C.blue, 0.85) : C.blue, textTransform: "uppercase", letterSpacing: ".16em", fontWeight: 800, marginBottom: 7, fontFamily: "'DM Sans', sans-serif" }}>
                            Dashboard
                        </div>
                        <div style={{ fontSize: isPhone ? 28 : 36, fontWeight: 900, color: D.text, letterSpacing: "-0.04em", lineHeight: 1.1, marginBottom: 4, fontFamily: "'DM Sans', sans-serif" }}>
                            {raw?.name || symbol}
                        </div>
                        {raw?.sector && (
                            <div style={{ fontSize: 13, color: D.subtext, marginTop: 4, fontFamily: "'DM Sans', sans-serif" }}>
                                {raw.sector}
                            </div>
                        )}
                    </div>
                    {/* Ticker + sector pills */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start", paddingTop: 4 }}>
                        <HeroPill label={symbol} D={D} />
                        {raw?.sector && <HeroPill label={raw.sector} D={D} />}
                    </div>
                </div>

                {/* Summary cards (4-up on desktop) */}
                <div style={{ display: "grid", gridTemplateColumns: isPhone ? "1fr 1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: isPhone ? 10 : 14 }}>
                    {heroSummary.map(item => (
                        <div key={item.label}
                            style={{
                                padding: isPhone ? "14px 14px" : "18px 20px",
                                borderRadius: 18,
                                border: `1px solid ${D.panelBorder}`,
                                background: isDark
                                    ? `linear-gradient(135deg, ${withAlpha("#1e293b", 0.88)} 0%, ${withAlpha("#0f172a", 0.82)} 100%)`
                                    : `linear-gradient(135deg, ${withAlpha("#ffffff", 0.97)} 0%, ${withAlpha("#f8fafc", 0.95)} 100%)`,
                                boxShadow: D.shadowMd,
                                transition: "all 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
                                cursor: "default", position: "relative", overflow: "hidden",
                            }}
                            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = D.shadowLg; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = D.shadowMd; }}
                        >
                            <div style={{ position: "absolute", inset: 1, borderRadius: 17, border: `1px solid ${isDark ? withAlpha("#ffffff", 0.06) : withAlpha("#ffffff", 0.75)}`, pointerEvents: "none" }} />
                            <div style={{ position: "relative", zIndex: 1 }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                                    <div style={{ fontSize: 10, color: D.subtext, textTransform: "uppercase", letterSpacing: ".14em", fontWeight: 700, fontFamily: "'DM Sans', sans-serif", flex: 1 }}>
                                        {item.label}
                                    </div>
                                    <div style={{ fontSize: 18, opacity: 0.5, flexShrink: 0 }}>{item.icon}</div>
                                </div>
                                <div style={{ fontSize: isPhone ? 22 : 28, fontWeight: 900, color: item.color, letterSpacing: "-0.03em", fontFamily: "'DM Mono', monospace", textAlign: "left" }}>
                                    {item.value}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                </div>
            </div>

            {/* â”€â”€ MAIN CONTENT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <div style={{ padding: isPhone ? "16px 12px 32px" : "24px 24px 48px", maxWidth: 1400, margin: "0 auto" }}>

                {/* Partial data notice */}
                {error && raw && (
                    <div style={{
                        marginBottom: 16, padding: "11px 14px", borderRadius: 12,
                        border: `1px solid ${withAlpha(D.neg, 0.20)}`,
                        background: D.negSoft, color: D.subtext,
                        fontSize: 12, fontFamily: "'DM Sans', sans-serif",
                        display: "flex", alignItems: "center", gap: 8,
                    }}>
                        <span>âš ï¸</span>
                        <span>Partial data: {error}</span>
                    </div>
                )}

                {/* Group tab navigation (all viewports) */}
                <GroupTabBar groups={premiumTabs} activeIdx={activeGroupIdx} onSelect={setActiveGroupIdx} D={D} isPhone={isPhone} />

                {activeGroup.isAnnouncementsTab ? (
                    <SectionCard key="announcements" D={D}>
                        <CardHeader
                            D={D}
                            kicker="Exchange Filings"
                            title="Announcements"
                            subtitle="Corporate disclosures and regulatory filings"
                        />
                        <AnnouncementsTab symbol={symbol} D={D} C={C} isPhone={isPhone} />
                    </SectionCard>
                ) : (
                <SectionCard key={activeGroup.title} D={D}>
                    <CardHeader
                        D={D}
                        kicker="Analytics"
                        title={activeGroup.title}
                        subtitle={activeGroup.subtitle}
                    />
                    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cardCols}, minmax(0, 1fr))`, gap: isPhone ? 10 : 16 }}>
                        {activeGroup.cards.map(card => (
                            <MetricCard key={card.title} D={D} {...card} />
                        ))}
                    </div>
                </SectionCard>
                )}

                {/* â”€â”€ BUSINESS ANALYSIS CARD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
                <BusinessAnalysisCard analysis={analysis} D={D} C={C} isPhone={isPhone} />
            </div>

            {/* â”€â”€ GLOBAL STYLES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800;0,9..40,900;1,9..40,400&family=DM+Mono:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap');

                * { box-sizing: border-box; }

                @keyframes ptdSpin {
                    to { transform: rotate(360deg); }
                }
                @keyframes ptdPulse {
                    0%, 100% { opacity: 0.45; }
                    50%       { opacity: 0.18; }
                }
                @keyframes ptdFadeIn {
                    from { opacity: 0; transform: translateY(6px); }
                    to   { opacity: 1; transform: translateY(0); }
                }

                /* Scrollbar styling (matches WatchlistDashboard) */
                ::-webkit-scrollbar { height: 8px; width: 8px; }
                ::-webkit-scrollbar-thumb { background: ${withAlpha(D.muted, 0.30)}; border-radius: 999px; }
                ::-webkit-scrollbar-track { background: transparent; }

                button { outline: none; }
                button:focus-visible { box-shadow: 0 0 0 3px ${D.ring}; }
            `}</style>
        </div>
    );
}

