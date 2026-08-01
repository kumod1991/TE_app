import { useState, useEffect, useMemo, useCallback, useRef } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://munqjcjvzgqyxzlmuyjj.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11bnFqY2p2emdxeXh6bG11eWpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3MDc5NzEsImV4cCI6MjA4NzI4Mzk3MX0.9nHH5bTsL-RRwMMPoxTBFz3896BlhBBhUPGh0xP3U4Q";
const IPO_CACHE_KEY = "te_ipo_master_cache_v2";
const IPO_CACHE_TTL = 5 * 60 * 1000; // 5 min
const PAGE_SIZE = 25;

/** Builds a compact page-number sequence with ellipses, e.g. [1,2,3,4,"...",19,20]. */
function getPaginationRange(current, total) {
    const DOTS = "...";
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    if (current <= 4) return [1, 2, 3, 4, DOTS, total - 1, total];
    if (current >= total - 3) return [1, 2, DOTS, total - 3, total - 2, total - 1, total];
    return [1, 2, DOTS, current - 1, current, current + 1, DOTS, total - 1, total];
}

/* ────────────────────────────────────────────────────────────
   DATE / FORMAT HELPERS  (all derived — nothing hardcoded)
   ──────────────────────────────────────────────────────────── */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseDate(d) {
    if (!d) return null;
    const dt = new Date(d + "T00:00:00");
    return isNaN(dt.getTime()) ? null : dt;
}
function todayStart() { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }
function daysUntil(d) {
    const dt = parseDate(d);
    if (!dt) return null;
    return Math.round((dt.getTime() - todayStart().getTime()) / 86400000);
}
function fmtDatePlain(d) {
    const dt = parseDate(d);
    if (!dt) return null;
    return `${dt.getDate()} ${MONTHS[dt.getMonth()]}`;
}
function fmtDateFull(d) {
    const dt = parseDate(d);
    if (!dt) return "—";
    return `${String(dt.getDate()).padStart(2, "0")} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}
function fmtRelativeOrFull(d) {
    const diff = daysUntil(d);
    if (diff == null) return "—";
    if (diff === 0) return "today";
    if (diff === -1) return "yesterday";
    return fmtDateFull(d);
}
function fmtMoney(v) {
    if (v == null) return "—";
    const n = Number(v);
    const s = n.toFixed(2).replace(/\.00$/, "");
    return `₹${s.replace(/\B(?=(\d{3})+(?!\d)(?=\D|$))/g, ",")}`;
}
function fmtUpdatedAgo(ts) {
    if (!ts) return null;
    const min = Math.floor((Date.now() - ts) / 60000);
    if (min < 1) return "just now";
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
}

/** Derives a human timeline label purely from date columns + status. */
function timelineLabel(r) {
    if (r.status === "open" && r.close_date) {
        const d = daysUntil(r.close_date);
        if (d === 0) return { text: "Closes Today", urgent: true };
        if (d === 1) return { text: "Closes Tomorrow", urgent: true };
        if (d > 1) return { text: `${d} Days Left`, urgent: d <= 2 };
    }
    if (r.status === "pre_apply" && r.open_date) {
        const d = daysUntil(r.open_date);
        if (d === 0) return { text: "Opens Today", urgent: true };
        if (d === 1) return { text: "Opens Tomorrow", urgent: false };
        if (d > 1) return { text: `Opens in ${d} Days`, urgent: false };
    }
    if (r.status === "closed" && r.listing_date) {
        const d = daysUntil(r.listing_date);
        if (d === 0) return { text: "Listing Today", urgent: true };
        if (d === 1) return { text: "Listing Tomorrow", urgent: true };
        if (d > 1) return { text: `Listing in ${d} Days`, urgent: false };
    }
    const fallback = fmtDatePlain(r.listing_date) || fmtDatePlain(r.close_date) || fmtDatePlain(r.open_date);
    return { text: fallback || "TBA", urgent: false };
}

/* ────────────────────────────────────────────────────────────
   DERIVED CLASSIFICATIONS  (thresholds only — no fabricated data)
   ──────────────────────────────────────────────────────────── */
function subscriptionStrength(rate) {
    if (rate == null) return null;
    const n = Number(rate);
    if (n > 5) return { label: "Excellent", tone: "pos" };
    if (n >= 3) return { label: "Strong", tone: "accent" };
    if (n >= 1) return { label: "Average", tone: "amber" };
    return { label: "Weak", tone: "neg" };
}
function listingPerformance(pct) {
    if (pct == null) return null;
    const n = Number(pct);
    if (n >= 40) return { label: "Outstanding", tone: "pos" };
    if (n >= 15) return { label: "Excellent", tone: "pos" };
    if (n >= 5) return { label: "Good", tone: "accent" };
    if (n >= 0) return { label: "Flat", tone: "muted" };
    return { label: "Negative", tone: "neg" };
}

const STATUS_META = {
    open: { label: "Open", tone: "pos" },
    closed: { label: "Closed", tone: "amber" },
    pre_apply: { label: "Opens Soon", tone: "accent" },
    upcoming: { label: "Upcoming", tone: "muted" },
    listed: { label: "Listed", tone: "accent" },
};

/* ────────────────────────────────────────────────────────────
   ICONS
   ──────────────────────────────────────────────────────────── */
const I = {
    calendar: (p = {}) => <svg width={p.s || 15} height={p.s || 15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
    clock: (p = {}) => <svg width={p.s || 15} height={p.s || 15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
    trendDown: (p = {}) => <svg width={p.s || 15} height={p.s || 15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="8 10 12 14 16 10" /></svg>,
    search: (p = {}) => <svg width={p.s || 14} height={p.s || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
    external: (p = {}) => <svg width={p.s || 11} height={p.s || 11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>,
    chevron: (p = {}) => <svg width={p.s || 11} height={p.s || 11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>,
    chevronRight: (p = {}) => <svg width={p.s || 11} height={p.s || 11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>,
    sort: (dir, p = {}) => dir ? <svg width={p.s || 10} height={p.s || 10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ transform: dir === "asc" ? "rotate(180deg)" : "none" }}><polyline points="6 9 12 15 18 9" /></svg> : <span style={{ width: p.s || 10, display: "inline-block" }} />,
    inbox: (p = {}) => <svg width={p.s || 28} height={p.s || 28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>,
    refresh: (p = {}) => <svg width={p.s || 13} height={p.s || 13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>,
};

const TABS = [
    { id: "upcoming", label: "Upcoming IPOs", icon: "calendar" },
    { id: "recent", label: "Recent IPOs", icon: "clock" },
    { id: "below", label: "Below IPO Price", icon: "trendDown" },
];

/* ────────────────────────────────────────────────────────────
   MAIN COMPONENT
   ──────────────────────────────────────────────────────────── */
export default function IPOModule({ T }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastFetched, setLastFetched] = useState(null);
    const [activeTab, setActiveTab] = useState("upcoming");
    const [query, setQuery] = useState("");
    const [chip, setChip] = useState("all");
    const [sort, setSort] = useState({ key: "date", dir: "asc" });
    const [focusedRow, setFocusedRow] = useState(-1);
    const [showPipeline, setShowPipeline] = useState(false);
    const [page, setPage] = useState(1);
    const rowRefs = useRef([]);

    const load = useCallback(async (skipCache = false) => {
        if (!skipCache) {
            try {
                const cached = JSON.parse(localStorage.getItem(IPO_CACHE_KEY) || "null");
                if (cached && Date.now() - cached.ts < IPO_CACHE_TTL && Array.isArray(cached.data)) {
                    setRows(cached.data);
                    setLastFetched(cached.ts);
                    setLoading(false);
                }
            } catch { /* ignore */ }
        }
        try {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/ipo_master?select=*&order=updated_at.desc`, {
                headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
            });
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const data = await res.json();
            setRows(Array.isArray(data) ? data : []);
            setLastFetched(Date.now());
            setError(null);
            try { localStorage.setItem(IPO_CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch { /* ignore */ }
        } catch (e) {
            setError(e.message || "Failed to load IPO data");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    /* ── Global summary (always computed from the full dataset) ── */
    const summary = useMemo(() => {
        const total = rows.length;
        const open = rows.filter(r => r.status === "open").length;
        const preApply = rows.filter(r => r.status === "pre_apply").length;
        const closed = rows.filter(r => r.status === "closed").length;
        const mainboard = rows.filter(r => r.issue_type === "Mainboard").length;
        const sme = rows.filter(r => r.issue_type === "SME" || r.is_sme).length;
        const subRates = rows.map(r => r.total_subscription_rate).filter(v => v != null).map(Number);
        const highestSub = subRates.length ? Math.max(...subRates) : null;
        const avgSub = subRates.length ? subRates.reduce((a, b) => a + b, 0) / subRates.length : null;
        return { total, open, preApply, closed, mainboard, sme, highestSub, avgSub };
    }, [rows]);

    /* ── Tab-scoped row sets ── */
    const { upcomingAll, pipelineRows, recentAll, belowAll } = useMemo(() => {
        const hasDate = (r) => r.open_date || r.close_date || r.listing_date;
        const upcoming = rows.filter(r => r.status !== "listed" && hasDate(r));
        const pipeline = rows.filter(r => r.status !== "listed" && !hasDate(r))
            .sort((a, b) => (a.company_name || "").localeCompare(b.company_name || ""));
        const recent = rows.filter(r => r.status === "listed" && r.listing_date);
        const below = recent.filter(r => r.listing_gains_percent != null && Number(r.listing_gains_percent) < 0);
        return { upcomingAll: upcoming, pipelineRows: pipeline, recentAll: recent, belowAll: below };
    }, [rows]);

    const baseRows = activeTab === "upcoming" ? upcomingAll : activeTab === "recent" ? recentAll : activeTab === "below" ? belowAll : [];

    /* ── Filter chips (contextual to Upcoming tab, live counts) ── */
    const chips = useMemo(() => {
        if (activeTab !== "upcoming") return [];
        const c = [
            //{ id: "all", label: "All", count: upcomingAll.length },
            { id: "open", label: "Open", count: upcomingAll.filter(r => r.status === "open").length },
            { id: "pre_apply", label: "Pre Apply", count: upcomingAll.filter(r => r.status === "pre_apply").length },
            { id: "closed", label: "Closed", count: upcomingAll.filter(r => r.status === "closed").length },
            { id: "mainboard", label: "Mainboard", count: upcomingAll.filter(r => r.issue_type === "Mainboard").length },
            { id: "sme", label: "SME", count: upcomingAll.filter(r => r.issue_type === "SME" || r.is_sme).length },
        ];
        return c.filter(x => x.count > 0 || x.id === "all");
    }, [activeTab, upcomingAll]);

    /* ── Search + chip + sort pipeline ── */
    const visibleRows = useMemo(() => {
        let list = [...baseRows];
        if (chip !== "all" && activeTab === "upcoming") {
            list = list.filter(r => {
                if (chip === "open" || chip === "pre_apply" || chip === "closed") return r.status === chip;
                if (chip === "mainboard") return r.issue_type === "Mainboard";
                if (chip === "sme") return r.issue_type === "SME" || r.is_sme;
                return true;
            });
        }
        if (query.trim()) {
            const q = query.trim().toLowerCase();
            list = list.filter(r => r.company_name?.toLowerCase().includes(q) || r.symbol?.toLowerCase().includes(q));
        }
        const dir = sort.dir === "asc" ? 1 : -1;
        list.sort((a, b) => {
            if (sort.key === "name") return dir * (a.company_name || "").localeCompare(b.company_name || "");
            if (sort.key === "subscription") return dir * ((a.total_subscription_rate ?? -1) - (b.total_subscription_rate ?? -1));
            if (sort.key === "gain") return dir * ((a.listing_gains_percent ?? -999) - (b.listing_gains_percent ?? -999));
            if (sort.key === "overallGain") return dir * ((a.gain ?? -999) - (b.gain ?? -999));
            const da = new Date(a.listing_date || a.close_date || a.open_date || 0);
            const db = new Date(b.listing_date || b.close_date || b.open_date || 0);
            return dir * (da - db);
        });
        return list;
    }, [baseRows, chip, activeTab, query, sort]);

    useEffect(() => { setFocusedRow(-1); rowRefs.current = []; setPage(1); }, [activeTab, chip, query, sort]);

    const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
    useEffect(() => { setFocusedRow(-1); rowRefs.current = []; }, [currentPage]);
    const pagedRows = useMemo(
        () => visibleRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
        [visibleRows, currentPage]
    );

    const toggleSort = (key) => setSort(s => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });

    const handleTableKeyDown = (e) => {
        if (!pagedRows.length) return;
        if (e.key === "ArrowDown") { e.preventDefault(); setFocusedRow(i => { const n = Math.min(i + 1, pagedRows.length - 1); rowRefs.current[n]?.focus(); return n; }); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setFocusedRow(i => { const n = Math.max(i - 1, 0); rowRefs.current[n]?.focus(); return n; }); }
        else if (e.key === "Enter" && focusedRow >= 0) {
            const url = pagedRows[focusedRow]?.primary_document_url;
            if (url) window.open(url, "_blank", "noreferrer");
        }
    };

    /* ── style helpers ── */
    const tone = (t) => ({
        pos: { fg: T.posText || T.pos, bg: T.posFill || "rgba(5,150,105,0.1)" },
        neg: { fg: T.negText || T.neg, bg: T.negFill || "rgba(244,63,94,0.09)" },
        accent: { fg: T.accent, bg: T.accentFill || "rgba(37,99,235,0.09)" },
        amber: { fg: T.amber, bg: T.amberFill || "rgba(217,119,6,0.1)" },
        muted: { fg: T.subtext, bg: T.mutedFill || "#eef2f7" },
    }[t] || { fg: T.subtext, bg: T.mutedFill || "#eef2f7" });

    const S = {
        wrap: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "auto", background: T.bg, fontFamily: "'IBM Plex Sans', -apple-system, sans-serif" },
        inner: { maxWidth: 1360, width: "100%", margin: "0 auto", padding: "24px 28px 48px" },
        crumb: { fontSize: 12, color: T.muted, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 },
        headerRow: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 10 },
        title: { fontSize: 24, fontWeight: 700, color: T.text, letterSpacing: "-.02em", margin: 0 },
        subtitle: { fontSize: 12.5, color: T.muted, marginTop: 4 },
        refreshBtn: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: T.subtext, background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer", fontWeight: 600, transition: "all .15s" },

        cardsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 22 },
        card: { background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 16px", transition: "transform .15s, box-shadow .15s, border-color .15s" },
        cardLabel: { fontSize: 11, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: ".04em" },
        cardValue: { fontSize: 22, fontWeight: 700, color: T.text, marginTop: 6, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "-.01em" },

        tabRow: { display: "flex", gap: 4, marginBottom: 16, borderBottom: `1px solid ${T.border}`, overflowX: "auto" },
        tab: (active) => ({
            display: "flex", alignItems: "center", gap: 6, padding: "10px 4px", marginRight: 20,
            fontSize: 13.5, fontWeight: 600, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
            color: active ? T.text : T.muted, borderBottom: `2px solid ${active ? T.accent : "transparent"}`,
            transition: "color .15s, border-color .15s",
        }),

        toolbar: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" },
        searchBox: { display: "flex", alignItems: "center", gap: 8, background: T.card, border: `1px solid ${T.border}`, borderRadius: 9, padding: "8px 12px", minWidth: 220, color: T.muted, transition: "border-color .15s" },
        searchInput: { border: "none", outline: "none", background: "transparent", fontSize: 13, color: T.text, width: "100%", fontFamily: "inherit" },
        chipRow: { display: "flex", gap: 6, flexWrap: "wrap" },
        chipBtn: (active) => ({
            fontSize: 12, fontWeight: 600, padding: "6.5px 12px", borderRadius: 999, cursor: "pointer", userSelect: "none",
            border: `1px solid ${active ? T.accent : T.border}`, background: active ? T.accent : T.card, color: active ? "#fff" : T.subtext,
            transition: "all .12s", display: "inline-flex", alignItems: "center", gap: 5,
        }),
        chipCount: (active) => ({ fontSize: 10.5, fontWeight: 700, opacity: active ? 0.85 : 0.6 }),

        panel: { background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden" },
        tableScroll: { overflowX: "auto" },
        table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
        thead: { position: "sticky", top: 0, zIndex: 2, background: T.tableHead || T.card },
        th: (sortable) => ({
            textAlign: "left", padding: "11px 14px", fontSize: 10.8, fontWeight: 700, color: T.muted,
            textTransform: "uppercase", letterSpacing: ".05em", borderBottom: `1px solid ${T.border}`,
            whiteSpace: "nowrap", cursor: sortable ? "pointer" : "default", userSelect: "none",
        }),
        thInner: { display: "inline-flex", alignItems: "center", gap: 4 },
        row: (i, focused) => ({
            background: focused ? (T.selected || T.hover) : i % 2 === 1 ? (T.tableAlt || "transparent") : "transparent",
            outline: focused ? `2px solid ${T.accent}` : "none",
            outlineOffset: -2,
            cursor: "default",
            transition: "background .1s",
        }),
        td: { padding: "12px 14px", borderBottom: `1px solid ${T.borderSubtle || T.border}`, color: T.text, verticalAlign: "middle" },
        companyName: { fontSize: 13.5, fontWeight: 700, color: T.text, letterSpacing: "-.005em" },
        symbol: { fontSize: 11, color: T.muted, fontFamily: "'IBM Plex Mono', monospace", marginTop: 1 },
        docLink: { fontSize: 10.5, color: T.accent, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 3, marginTop: 3, opacity: 0.85 },
        pill: (t) => ({ display: "inline-flex", alignItems: "center", fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: tone(t).bg, color: tone(t).fg, letterSpacing: ".01em" }),
        mono: { fontFamily: "'IBM Plex Mono', monospace", fontVariantNumeric: "tabular-nums" },
        timelineText: (urgent) => ({ fontSize: 12.5, fontWeight: 600, color: urgent ? (T.negText || T.neg) : T.text }),
        subWrap: { display: "flex", flexDirection: "column", gap: 4, minWidth: 90 },
        subBarTrack: { height: 4, borderRadius: 4, background: T.mutedFill || "#eef2f7", overflow: "hidden" },
        subBarFill: (pct, t) => ({ height: "100%", width: `${Math.min(pct, 100)}%`, background: tone(t).fg, borderRadius: 4, transition: "width .4s ease" }),
        gainText: (up) => ({ color: up ? (T.posText || T.pos) : (T.negText || T.neg), fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" }),

        empty: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "56px 20px", color: T.muted, gap: 10, textAlign: "center" },
        emptyTitle: { fontSize: 14, fontWeight: 700, color: T.subtext },
        emptySub: { fontSize: 12.5, maxWidth: 340, lineHeight: 1.5 },

        paginationRow: { display: "flex", alignItems: "center", gap: 6, padding: "14px 20px", borderTop: `1px solid ${T.border}`, flexWrap: "wrap" },
        pageBtn: (active) => ({
            minWidth: 30, height: 30, padding: "0 8px", display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 12.5, fontWeight: 600, borderRadius: 7, cursor: "pointer", userSelect: "none",
            border: `1px solid ${active ? T.accent : T.border}`,
            background: active ? (T.accentFill || "rgba(37,99,235,0.09)") : T.card,
            color: active ? T.accent : T.subtext,
            transition: "all .12s",
        }),
        pageDots: { padding: "0 4px", color: T.muted, fontSize: 12.5, fontWeight: 600 },
        pageNextBtn: (disabled) => ({
            display: "inline-flex", alignItems: "center", gap: 4, height: 30, padding: "0 12px",
            fontSize: 12.5, fontWeight: 600, borderRadius: 7,
            cursor: disabled ? "default" : "pointer",
            border: `1px solid ${T.border}`, background: T.card,
            color: disabled ? T.muted : T.subtext,
            opacity: disabled ? 0.5 : 1,
            transition: "all .12s",
        }),
        pipelineToggle: { padding: "13px 20px", borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" },
        pipelineList: { padding: "4px 20px 16px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: "8px 14px" },
        pipelineItem: { fontSize: 12.5, color: T.text, padding: "8px 11px", borderRadius: 8, background: T.tableAlt || T.hover, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 },
    };

    /* ── cell renderers ── */
    const NameCell = ({ r }) => (
        <div>
            <div style={S.companyName}>{r.company_name}</div>
            <div style={S.symbol}>{r.symbol}{r.is_sme ? " · SME" : r.issue_type ? ` · ${r.issue_type}` : ""}</div>
            {r.primary_document_url && (
                <a href={r.primary_document_url} target="_blank" rel="noreferrer" style={S.docLink} onClick={e => e.stopPropagation()}>
                    {I.external()} RHP / DRHP
                </a>
            )}
        </div>
    );

    const StatusPill = ({ status }) => {
        const meta = STATUS_META[status] || { label: status, tone: "muted" };
        return <span style={S.pill(meta.tone)}>{meta.label}</span>;
    };

    const TimelineCell = ({ r }) => {
        const t = timelineLabel(r);
        return <span style={S.timelineText(t.urgent)}>{t.text}</span>;
    };

    const SubscriptionCell = ({ r }) => {
        if (r.total_subscription_rate == null) return <span style={{ color: T.muted }}>—</span>;
        const strength = subscriptionStrength(r.total_subscription_rate);
        const pct = Math.min(Number(r.total_subscription_rate) * 20, 100); // 5x = full bar
        return (
            <div style={S.subWrap}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                    <span style={{ ...S.mono, fontWeight: 700, fontSize: 12.5 }}>{Number(r.total_subscription_rate).toFixed(2)}×</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: tone(strength.tone).fg }}>{strength.label}</span>
                </div>
                <div style={S.subBarTrack}><div style={S.subBarFill(pct, strength.tone)} /></div>
            </div>
        );
    };

    const MinInvestmentCell = ({ r }) => {
        const max = r.price_band_max != null ? Number(r.price_band_max) : null;
        if (!r.lot_size || max == null) return <span style={{ color: T.muted }}>—</span>;
        return <span style={S.mono}>{fmtMoney(r.lot_size * max)}</span>;
    };

    const GainCell = ({ pct }) => {
        if (pct == null) return <span style={{ color: T.muted }}>—</span>;
        const n = Number(pct);
        const perf = listingPerformance(n);
        return (
            <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-start" }}>
                <span style={S.gainText(n >= 0)}>{n >= 0 ? "+" : ""}{n.toFixed(2)}%</span>
                <span style={S.pill(perf.tone)}>{perf.label}</span>
            </div>
        );
    };

    const Pagination = () => {
        if (totalPages <= 1) return null;
        const pages = getPaginationRange(currentPage, totalPages);
        return (
            <div style={S.paginationRow}>
                {pages.map((p, i) => p === "..." ? (
                    <span key={`dots-${i}`} style={S.pageDots}>...</span>
                ) : (
                    <div key={p} style={S.pageBtn(p === currentPage)} onClick={() => setPage(p)}>{p}</div>
                ))}
                <div
                    style={S.pageNextBtn(currentPage === totalPages)}
                    onClick={() => currentPage < totalPages && setPage(p => Math.min(p + 1, totalPages))}
                >
                    Next {I.chevronRight({ s: 12 })}
                </div>
            </div>
        );
    };

    const EmptyState = ({ title, sub }) => (
        <div style={S.empty}>
            {I.inbox({ s: 30 })}
            <div style={S.emptyTitle}>{title}</div>
            {sub && <div style={S.emptySub}>{sub}</div>}
        </div>
    );

    /* ── header cell w/ sort ── */
    const SortTh = ({ label, sortKey, align }) => (
        <th style={{ ...S.th(true), textAlign: align || "left" }} onClick={() => toggleSort(sortKey)}>
            <span style={S.thInner}>{label} {I.sort(sort.key === sortKey ? sort.dir : null)}</span>
        </th>
    );

    /* ── table variants ── */
    const renderUpcomingTable = () => (
        <table style={S.table}>
            <thead style={S.thead}>
                <tr>
                    <SortTh label="Company" sortKey="name" />
                    <th style={S.th(false)}>Timeline</th>
                    <th style={S.th(false)}>Price Band</th>
                    <th style={S.th(false)}>Min. Investment</th>
                    <SortTh label="Subscription" sortKey="subscription" />
                    <th style={S.th(false)}>Status</th>
                </tr>
            </thead>
            <tbody>
                {pagedRows.map((r, i) => (
                    <tr key={r.ipo_id} ref={el => rowRefs.current[i] = el} tabIndex={0} style={S.row(i, focusedRow === i)}
                        onFocus={() => setFocusedRow(i)}
                        onMouseEnter={e => e.currentTarget.style.background = T.hover}
                        onMouseLeave={e => e.currentTarget.style.background = focusedRow === i ? (T.selected || T.hover) : (i % 2 === 1 ? (T.tableAlt || "transparent") : "transparent")}>
                        <td style={S.td}><NameCell r={r} /></td>
                        <td style={S.td}><TimelineCell r={r} /></td>
                        <td style={S.td}>{r.price_band_text || "—"}</td>
                        <td style={S.td}><MinInvestmentCell r={r} /></td>
                        <td style={S.td}><SubscriptionCell r={r} /></td>
                        <td style={S.td}><StatusPill status={r.status} /></td>
                    </tr>
                ))}
            </tbody>
        </table>
    );

    const renderListedTable = () => (
        <table style={S.table}>
            <thead style={S.thead}>
                <tr>
                    <SortTh label="Company" sortKey="name" />
                    <SortTh label="Listing Date" sortKey="date" />
                    <th style={S.th(false)}>Issue Price</th>
                    <th style={S.th(false)}>Listing Price</th>
                    <SortTh label="Listing Gain" sortKey="gain" />
                    <th style={S.th(false)}>Current Price</th>
                    <SortTh label="Overall Gain/Loss" sortKey="overallGain" />
                </tr>
            </thead>
            <tbody>
                {pagedRows.map((r, i) => (
                    <tr key={r.ipo_id} ref={el => rowRefs.current[i] = el} tabIndex={0} style={S.row(i, focusedRow === i)}
                        onFocus={() => setFocusedRow(i)}
                        onMouseEnter={e => e.currentTarget.style.background = T.hover}
                        onMouseLeave={e => e.currentTarget.style.background = focusedRow === i ? (T.selected || T.hover) : (i % 2 === 1 ? (T.tableAlt || "transparent") : "transparent")}>
                        <td style={S.td}><NameCell r={r} /></td>
                        <td style={S.td}>{fmtRelativeOrFull(r.listing_date)}</td>
                        <td style={{ ...S.td, ...S.mono }}>{fmtMoney(r.issue_price)}</td>
                        <td style={{ ...S.td, ...S.mono }}>{fmtMoney(r.listing_price)}</td>
                        <td style={S.td}><GainCell pct={r.listing_gains_percent} /></td>
                        <td style={{ ...S.td, ...S.mono }}>{r.current_price != null ? fmtMoney(r.current_price) : <span style={{ color: T.muted }}>—</span>}</td>
                        <td style={S.td}><GainCell pct={r.gain} /></td>
                    </tr>
                ))}
            </tbody>
        </table>
    );

    const renderBody = () => {
        if (loading) return <EmptyState title="Loading IPO data…" />;
        if (error) return <EmptyState title="Couldn't load IPO data" sub={error} />;
        if (visibleRows.length === 0) {
            return <EmptyState title="No matching IPOs" sub={query ? `Nothing matches "${query}". Try a different name or symbol.` : "Nothing to show in this view right now."} />;
        }
        return activeTab === "upcoming" ? renderUpcomingTable() : renderListedTable();
    };

    return (
        <div style={S.wrap} onKeyDown={handleTableKeyDown}>
            <div style={S.inner}>
                {/* Breadcrumb + Header */}
                <div style={S.crumb}><span>FinSight</span><span>/</span><span style={{ color: T.text, fontWeight: 600 }}>IPO</span></div>
                <div style={S.headerRow}>
                    <div>
                        <h2 style={S.title}>IPO Tracker</h2>
                        <div style={S.subtitle}>
                            {lastFetched ? `Updated ${fmtUpdatedAgo(lastFetched)}` : "Live from ipo_master"}
                        </div>
                    </div>
                    <button style={S.refreshBtn} onClick={() => { setLoading(true); load(true); }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = T.accent}
                        onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
                        {I.refresh()} Refresh
                    </button>
                </div>

                {/* Summary Cards */}
                <div style={S.cardsGrid}>
                    {[
                        { label: "Total IPOs", value: summary.total },
                        { label: "Open", value: summary.open },
                        { label: "Pre Apply", value: summary.preApply },
                        { label: "Closed", value: summary.closed },
                        { label: "Mainboard", value: summary.mainboard },
                        { label: "SME", value: summary.sme },
                        { label: "Highest Sub.", value: summary.highestSub != null ? `${summary.highestSub.toFixed(1)}×` : "—" },
                        { label: "Avg. Sub.", value: summary.avgSub != null ? `${summary.avgSub.toFixed(1)}×` : "—" },
                    ].map(c => (
                        <div key={c.label} style={S.card}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = T.borderStrong; e.currentTarget.style.transform = "translateY(-1px)"; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.transform = "none"; }}>
                            <div style={S.cardLabel}>{c.label}</div>
                            <div style={S.cardValue}>{loading ? "—" : c.value}</div>
                        </div>
                    ))}
                </div>

                {/* Tabs */}
                <div style={S.tabRow}>
                    {TABS.map(t => (
                        <div key={t.id} style={S.tab(activeTab === t.id)} onClick={() => { setActiveTab(t.id); setChip("all"); setQuery(""); }}>
                            {I[t.icon]()} {t.label}
                        </div>
                    ))}
                </div>

                {/* Toolbar: search + chips */}
                <div style={S.toolbar}>
                    <div style={S.searchBox}>
                        {I.search()}
                        <input
                            style={S.searchInput}
                            placeholder="Search company or symbol…"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                        />
                    </div>
                    {chips.length > 0 && (
                        <div style={S.chipRow}>
                            {chips.map(c => (
                                <div key={c.id} style={S.chipBtn(chip === c.id)} onClick={() => setChip(c.id)}>
                                    {c.label} <span style={S.chipCount(chip === c.id)}>{c.count}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Table panel */}
                <div style={S.panel}>
                    <div style={S.tableScroll}>{renderBody()}</div>

                    {!loading && !error && visibleRows.length > 0 && <Pagination />}

                    {activeTab === "upcoming" && !loading && !error && pipelineRows.length > 0 && (
                        <>
                            <div style={S.pipelineToggle} onClick={() => setShowPipeline(s => !s)}>
                                <span style={{ fontSize: 12.5, fontWeight: 600, color: T.subtext }}>
                                    IPO Pipeline — dates not yet announced ({pipelineRows.length})
                                </span>
                                <span style={{ color: T.subtext, transform: showPipeline ? "rotate(180deg)" : "none", transition: "transform .15s" }}>{I.chevron()}</span>
                            </div>
                            {showPipeline && (
                                <div style={S.pipelineList}>
                                    {pipelineRows.map(r => (
                                        <div key={r.ipo_id} style={S.pipelineItem}>
                                            <span>{r.company_name}</span>
                                            {r.primary_document_url && (
                                                <a href={r.primary_document_url} target="_blank" rel="noreferrer" style={{ color: T.accent }}>{I.external()}</a>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
