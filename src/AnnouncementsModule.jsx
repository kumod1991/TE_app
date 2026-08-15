import { useState, useEffect, useCallback, useRef, useMemo } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const ANNOUNCEMENTS_SELECT = "seq_id,symbol,company_name,category,announcement_text,announcement_datetime,attachment_url,industry,tags,priority";

function isTimeoutLikeError(err) {
    const msg = String(err?.message || err || "");
    return err?.code === "57014" || /statement timeout|cancelling statement|timeout|retry/i.test(msg);
}

function groupByDate(items) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const groups = {};
    items.forEach((item) => {
        const d = new Date(item.announcement_datetime);
        d.setHours(0, 0, 0, 0);
        let label;
        if (d.getTime() === today.getTime()) label = "Today";
        else if (d.getTime() === yesterday.getTime()) label = "Yesterday";
        else {
            label = d.toLocaleDateString("en-IN", {
                day: "numeric",
                month: "long",
                year: "numeric",
            });
        }
        if (!groups[label]) groups[label] = [];
        groups[label].push(item);
    });
    return groups;
}

function formatTime(dt) {
    if (!dt) return "";
    const d = new Date(dt);
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

// Tag pill colours
const TAG_COLORS = {
    "M&A":               { bg: "#fef3c7", color: "#92400e" },
    BOARD_MEETING:       { bg: "#dbeafe", color: "#1e40af" },
    MANAGEMENT_CHANGE:   { bg: "#fce7f3", color: "#9d174d" },
    INVESTOR_ACTIVITY:   { bg: "#d1fae5", color: "#065f46" },
    ORDER_FLOW:          { bg: "#ede9fe", color: "#5b21b6" },
    INSIDER_WINDOW:      { bg: "#fee2e2", color: "#991b1b" },
    GENERAL_UPDATE:      { bg: "#f1f5f9", color: "#475569" },
    OTHER:               { bg: "#f1f5f9", color: "#64748b" },
};

function TagPill({ tag, darkMode }) {
    const style = TAG_COLORS[tag] || TAG_COLORS.OTHER;
    return (
        <span style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.07em",
            padding: "3px 10px",
            borderRadius: 99,
            background: darkMode ? "rgba(255,255,255,0.08)" : style.bg,
            color: darkMode ? "rgba(255,255,255,0.6)" : style.color,
            whiteSpace: "nowrap",
            textTransform: "uppercase",
        }}>
            {tag.replace(/_/g, " ")}
        </span>
    );
}

// ─── Add / Edit Filter Modal ─────────────────────────────────────────────────

const EXAMPLE_QUERIES = [
    "Mergers and de-mergers",
    "Capacity expansions",
    "Resignations",
    "Warnings",
    "Approvals and awards",
    "Concalls or presentations",
    "Electric vehicle",
    "Dividend",
    "QIP",
    "Buyback",
];

function normalizeAnnouncementQuery(query) {
    return (query || "").trim().replace(/\s+/g, " ");
}

function FilterModal({ existing, onSave, onClose, T }) {
    const [query, setQuery] = useState(existing || "");
    const inputRef = useRef(null);

    useEffect(() => { inputRef.current?.focus(); }, []);

    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.45)", display: "flex",
            alignItems: "center", justifyContent: "center",
        }}
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: T.surface,
                    border: `1px solid ${T.border}`,
                    borderRadius: 14,
                    padding: "36px 40px 32px",
                    width: "min(580px, 94vw)",
                    boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
                }}
            >
                <h2 style={{ margin: "0 0 8px", fontSize: 24, fontWeight: 700, color: T.text, letterSpacing: "-0.02em" }}>
                    {existing ? "Edit filter" : "Add new search filter"}
                </h2>
                <p style={{ margin: "0 0 28px", fontSize: 15, color: T.subtext, lineHeight: 1.6 }}>
                    Create a filter for tracking latest announcements.
                </p>

                <label style={{ fontSize: 14, fontWeight: 600, color: T.text, display: "block", marginBottom: 10, letterSpacing: "-0.01em" }}>
                    Query
                </label>
                <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && query.trim()) onSave(query.trim()); }}
                    placeholder="e.g. merger OR acquisition"
                    style={{
                        width: "100%", padding: "13px 16px", borderRadius: 10,
                        border: `1.5px solid ${T.border}`, background: T.bg,
                        color: T.text, fontSize: 15, boxSizing: "border-box",
                        outline: "none",
                        transition: "border-color .15s",
                    }}
                    onFocus={(e) => e.target.style.borderColor = "#6366f1"}
                    onBlur={(e) => e.target.style.borderColor = T.border}
                />

                <button
                    onClick={() => query.trim() && onSave(query.trim())}
                    style={{
                        marginTop: 16, padding: "13px 26px", borderRadius: 10,
                        background: "#5b5bd6", color: "#fff",
                        border: "none", cursor: "pointer", fontWeight: 600,
                        fontSize: 14, display: "flex", alignItems: "center", gap: 6,
                        opacity: query.trim() ? 1 : 0.5,
                        letterSpacing: "0.04em",
                    }}
                >
                    SHOW RESULTS ›
                </button>

                <hr style={{ margin: "28px 0", border: "none", borderTop: `1px solid ${T.border}` }} />

                <p style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 14, letterSpacing: "-0.01em" }}>Examples</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
                    {EXAMPLE_QUERIES.map((eq) => (
                        <button key={eq}
                            onClick={() => setQuery(eq)}
                            style={{
                                padding: "7px 15px", borderRadius: 8, fontSize: 13,
                                border: `1px solid ${T.border}`, background: "transparent",
                                color: T.text, cursor: "pointer",
                                transition: "background .12s",
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = T.hover || "rgba(0,0,0,0.05)"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                        >
                            {eq}
                        </button>
                    ))}
                </div>

                <p style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 10 }}>Query language</p>
                <ul style={{ margin: 0, padding: "0 0 0 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                        <>Results include derived words. Searching for <code>warning</code> will include <code>warned</code>.</>,
                        <>Results include partial words. Searching for <code>flag</code> will include <code>flagship</code>.</>,
                        <>Use double quotes for specific phrases: <code>"scheme of arrangement"</code>.</>,
                        <>Use <code>OR</code> to search for any of multiple terms.</>,
                        <>Prefix with <code>-</code> to exclude: <code>financial results -book -closer</code></>,
                    ].map((text, i) => (
                        <li key={i} style={{ fontSize: 13.5, color: T.subtext, lineHeight: 1.6 }}>
                            {text}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

// ─── Announcement Card ───────────────────────────────────────────────────────

function AnnouncementCard({ item, T, darkMode }) {
    const tags = useMemo(() => {
        try {
            return typeof item.tags === "string" ? JSON.parse(item.tags) : (item.tags || []);
        } catch { return []; }
    }, [item.tags]);

    const initials = item.symbol?.slice(0, 4) || "??";

    return (
        <div style={{
            display: "flex", gap: 18, padding: "18px 20px",
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 14, alignItems: "flex-start",
            transition: "box-shadow .2s, border-color .2s",
            // Skip layout/paint work for cards scrolled out of view — the
            // browser treats them as roughly this size until they're near
            // the viewport, then renders them for real. Keeps long lists
            // cheap without needing a windowing library.
            contentVisibility: "auto",
            containIntrinsicSize: "0 96px",
        }}
            onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = darkMode ? "0 4px 24px rgba(0,0,0,0.45)" : "0 4px 20px rgba(0,0,0,0.09)";
                e.currentTarget.style.borderColor = darkMode ? "rgba(99,102,241,0.4)" : "#c7d2fe";
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.borderColor = T.border;
            }}
        >
            {/* Icon / Avatar */}
            <div style={{
                width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                background: darkMode ? "rgba(99,102,241,0.18)" : "#eef2ff",
                display: "flex", alignItems: "center", justifyContent: "center",
                border: `1px solid ${darkMode ? "rgba(99,102,241,0.3)" : "#c7d2fe"}`,
            }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={darkMode ? "#818cf8" : "#6366f1"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                </svg>
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
                {/* Company + time row */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: "-0.01em" }}>
                        {item.company_name
                            ? item.company_name.length > 40
                                ? item.company_name.slice(0, 40) + "…"
                                : item.company_name
                            : item.symbol}
                    </span>
                    <span style={{
                        fontSize: 12, fontWeight: 600, color: "#6366f1",
                        background: darkMode ? "rgba(99,102,241,0.15)" : "#eef2ff",
                        padding: "2px 8px", borderRadius: 5,
                        letterSpacing: "0.02em",
                    }}>
                        {item.symbol}
                    </span>
                    {item.industry && (
                        <span style={{ fontSize: 13, color: T.subtext }}>· {item.industry}</span>
                    )}
                    <span style={{ fontSize: 13, color: T.subtext, marginLeft: "auto", whiteSpace: "nowrap" }}>
                        {formatTime(item.announcement_datetime)}
                    </span>
                </div>

                {/* Category / title link */}
                <a
                    href={item.attachment_url || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        fontSize: 15, fontWeight: 500,
                        color: "#5b5bd6",
                        textDecoration: "none",
                        display: "inline-flex", alignItems: "center", gap: 5,
                        lineHeight: 1.5,
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.textDecoration = "underline"}
                    onMouseLeave={(e) => e.currentTarget.style.textDecoration = "none"}
                >
                    {item.category}
                    {item.attachment_url && (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.7 }}>
                            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                        </svg>
                    )}
                </a>

                {/* Announcement text summary */}
                {item.announcement_text && (
                    <p style={{
                        margin: "6px 0 0", fontSize: 13.5, color: T.subtext,
                        lineHeight: 1.65,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                    }}>
                        {item.announcement_text}
                    </p>
                )}

                {/* Tags */}
                {tags.filter(t => t !== "OTHER").length > 0 && (
                    <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                        {tags.filter(t => t !== "OTHER").map((tag) => (
                            <TagPill key={tag} tag={tag} darkMode={darkMode} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Main Module ─────────────────────────────────────────────────────────────

// ─── PostgREST server-side filter builder ────────────────────────────────────
// Builds the query params object that will be sent to Supabase REST API
// so ALL filtering/searching happens on the database, not in the browser.

const IMPORTANT_TAGS_FILTER = ["M&A", "BOARD_MEETING", "MANAGEMENT_CHANGE", "INVESTOR_ACTIVITY", "ORDER_FLOW"];
const RESULTS_CATEGORY_KEYWORDS = ["Financial Results", "Quarterly Results", "Annual Results", "Unaudited Financial Results", "Audited Financial Results", "Outcome of Board Meeting"];

/**
 * Build PostgREST filter params for a given filter + search combo.
 *
 * tags column is text[] in PostgreSQL.
 * PostgREST cs operator for text[]: tags=cs.{TAG}
 * BUT special chars like & in "M&A" break array literal parsing.
 *
 * Strategy:
 *  - "Important" tab → use `priority.gte.2` (all important-tagged rows have priority ≥ 2)
 *    This is reliable, fast (indexed integer), and avoids all array literal issues.
 *  - "Results" tab   → category.ilike on well-known category strings (no special chars)
 *  - Custom filters  → full-text search on text columns (no tags array needed)
 *  - Search box      → ilike on text columns
 */
// Escape ILIKE wildcards so user-typed % or _ are treated literally.
function escapeIlikeLiteral(term) {
    return term.replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * One OR-group covering every way someone would search for an
 * announcement: ticker prefix match (fast, index-friendly — no leading
 * wildcard), company_name/category/announcement_text substring match, and
 * a full-text arm against the pre-computed `search_vector` column so
 * stemmed/derived words (e.g. "warning" → "warned") still hit. Pair this
 * with the GIN index on search_vector + trigram indexes noted below.
 */
function termSearchGroup(term) {
    const safe = escapeIlikeLiteral(term);
    return `or(symbol.ilike.${safe}*,company_name.ilike.*${safe}*,category.ilike.*${safe}*,announcement_text.ilike.*${safe}*,search_vector.plfts(english).${safe})`;
}

function buildServerParams(activeFilter, customFilters, debouncedSearch) {
    const base = {
        select: ANNOUNCEMENTS_SELECT,
        order: "announcement_datetime.desc",
    };

    // filterPairs: array of [paramKey, paramValue] appended to the URL
    // Multiple pairs AND together in PostgREST.
    const filterPairs = [];

    // ── Tab filters ──
    if (activeFilter === "important") {
        // All "important" rows have priority >= 2 (M&A=12, BOARD_MEETING=4,
        // MANAGEMENT_CHANGE=2, INVESTOR_ACTIVITY=3, ORDER_FLOW=4-5).
        // Rows with priority 0 or 1 are routine/low-signal (OTHER, GENERAL_UPDATE).
        filterPairs.push(["priority", "gte.2"]);

    } else if (activeFilter === "results") {
        // category is a plain text column — ilike works fine here
        const catOr = RESULTS_CATEGORY_KEYWORDS
            .map(k => `category.ilike.*${k}*`)
            .join(",");
        filterPairs.push(["or", `(${catOr})`]);

    } else if (typeof activeFilter === "number") {
        const rawQuery = customFilters[activeFilter] || "";
        if (rawQuery.trim()) {
            const orParts = rawQuery.split(/\s+OR\s+/i).map(s => s.trim()).filter(Boolean);
            const orConditions = orParts.map(part => {
                const words = part.match(/"[^"]+"|\S+/g) || [];
                const andParts = words.map(w => {
                    const exclude = w.startsWith("-");
                    const term = w.replace(/^-/, "").replace(/^"|"$/g, "").trim();
                    if (!term) return null;
                    const cols = termSearchGroup(term);
                    return exclude ? `not.${cols}` : cols;
                }).filter(Boolean);
                if (andParts.length === 0) return null;
                return andParts.length === 1 ? andParts[0] : `and(${andParts.join(",")})`;
            }).filter(Boolean);

            if (orConditions.length === 1) {
                filterPairs.push(["and", `(${orConditions[0]})`]);
            } else if (orConditions.length > 1) {
                filterPairs.push(["or", `(${orConditions.join(",")})`]);
            }
        }
    }

    // ── Search box (ticker / company name / category / text / full-text) ──
    // ANDed with whatever tab or custom filter is already active above.
    if (debouncedSearch && debouncedSearch.trim()) {
        filterPairs.push(["and", `(${termSearchGroup(debouncedSearch.trim())})`]);
    }

    return { ...base, _filterPairs: filterPairs };
}

// ─── Module-level cache (persists across tab navigations) ────────────────────
// Key: stringified {activeFilter, debouncedSearch, customFilter}
// Value: { announcements: [], offset: number, hasMore: boolean }
const announcementsCache = new Map();
const ANNOUNCEMENTS_LS_KEY = "te_announcements_cache_v1";
const ANNOUNCEMENTS_LS_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const PAGE_SIZE = 25;

function getCacheKey(activeFilter, debouncedSearch, customFilters = []) {
    const customFilter = typeof activeFilter === "number" ? (customFilters[activeFilter] || "") : "";
    return JSON.stringify({ activeFilter, debouncedSearch, customFilter });
}

function readStoredAnnouncementsCache() {
    if (typeof window === "undefined") return;
    try {
        const raw = window.localStorage.getItem(ANNOUNCEMENTS_LS_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!parsed || Date.now() - (parsed.ts || 0) > ANNOUNCEMENTS_LS_MAX_AGE_MS) return;
        Object.entries(parsed.entries || {}).forEach(([key, value]) => {
            if (Array.isArray(value?.announcements)) announcementsCache.set(key, value);
        });
    } catch {}
}

function writeStoredAnnouncementsCache() {
    if (typeof window === "undefined") return;
    try {
        const entries = {};
        announcementsCache.forEach((value, key) => { entries[key] = value; });
        window.localStorage.setItem(ANNOUNCEMENTS_LS_KEY, JSON.stringify({ ts: Date.now(), entries }));
    } catch {}
}

readStoredAnnouncementsCache();

async function fetchAnnouncementsPage(activeFilter, customFilters, debouncedSearch, pageOffset = 0) {
    // Always read corporate_announcements directly via PostgREST — no RPC.
    // The RPC path used to own the "all" tab (the default view) and search
    // there against search_vector only, which never indexes the ticker
    // symbol — that's why symbol/ticker search felt broken. Direct reads
    // with the OR group below cover symbol + company_name + category +
    // announcement_text + full-text every time, for every tab.
    const { _filterPairs, ...baseParams } = buildServerParams(activeFilter, customFilters, debouncedSearch);
    const url = new URL(`${SUPABASE_URL}/rest/v1/corporate_announcements`);
    Object.entries({ ...baseParams, limit: PAGE_SIZE, offset: pageOffset })
        .forEach(([k, v]) => url.searchParams.append(k, String(v)));
    (_filterPairs || []).forEach(([k, v]) => url.searchParams.append(k, v));

    const controller = new AbortController();
    const fetchTimeout = setTimeout(() => controller.abort(), 15000);
    try {
        const resp = await fetch(url.toString(), {
            signal: controller.signal,
            headers: {
                apikey: SUPABASE_ANON_KEY,
                Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
                "Content-Type": "application/json",
                // NOTE: Prefer: count=exact intentionally omitted — it forces a full
                // COUNT(*) scan on every request which causes HTTP 500s on large tables
                // without a matching index. We paginate by page-length heuristic instead.
            },
        });
        if (!resp.ok) {
            // Surface the real Supabase/PostgREST error message for easier debugging
            let errMsg = `Server error ${resp.status}`;
            try {
                const errBody = await resp.json();
                if (errBody?.message) errMsg = errBody.message;
                else if (errBody?.hint) errMsg = errBody.hint;
                else if (errBody?.details) errMsg = errBody.details;
            } catch { /* ignore parse errors */ }
            throw new Error(errMsg);
        }
        const data = await resp.json();
        if (!Array.isArray(data)) throw new Error(data?.message || "Unexpected response from server");
        return data;
    } finally {
        clearTimeout(fetchTimeout);
    }
}

export function prefetchAnnouncementsData() {
    const cacheKey = getCacheKey("all", "", []);
    if (announcementsCache.has(cacheKey)) return Promise.resolve(announcementsCache.get(cacheKey));
    return fetchAnnouncementsPage("all", [], "", 0)
        .then(data => {
            const cached = { announcements: data, offset: PAGE_SIZE, hasMore: data.length === PAGE_SIZE };
            announcementsCache.set(cacheKey, cached);
            writeStoredAnnouncementsCache();
            return cached;
        })
        .catch(() => null);
}

export default function AnnouncementsModule({ T }) {
    const darkMode = T?.bg === "#0f1117" || T?.bg === "#111827" || (T?.bg && parseInt(T.bg.replace("#",""), 16) < 0x888888 * 3 / 3);
    const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

    useEffect(() => {
        const handler = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener("resize", handler);
        return () => window.removeEventListener("resize", handler);
    }, []);

    const [activeFilter, setActiveFilter] = useState("all");
    const [customFilters, setCustomFilters] = useState(() => {
        try { return JSON.parse(localStorage.getItem("te_ann_filters") || "[]"); } catch { return []; }
    });
    const [showFilterModal, setShowFilterModal] = useState(false);
    const [editingFilter, setEditingFilter] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");

    const [announcements, setAnnouncements] = useState([]);
    const [loading, setLoading] = useState(false);
    const [revalidating, setRevalidating] = useState(false);
    const [error, setError] = useState(null);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);

    // Debounce search input — only fire server query after 400 ms of inactivity
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchQuery), 400);
        return () => clearTimeout(t);
    }, [searchQuery]);

    // Re-fetch from scratch whenever filter or debounced search changes
    useEffect(() => {
        fetchPage(0, true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeFilter, debouncedSearch]);

    const fetchPage = useCallback(async (pageOffset, reset = false) => {
        const cacheKey = getCacheKey(activeFilter, debouncedSearch, customFilters);
        // Declared here (not inside if(reset)) so the catch block below can
        // always safely check it — previously this threw a ReferenceError
        // on any error during a reset fetch, silently swallowing the error
        // UI and retry button.
        const cached = announcementsCache.get(cacheKey);

        if (reset) {
            setError(null);
            if (cached) {
                // Show stale data immediately; refresh silently in background
                setAnnouncements(cached.announcements);
                setOffset(cached.offset);
                setHasMore(cached.hasMore);
                setRevalidating(true);
            } else {
                // No cache yet — show full loading spinner
                setLoading(true);
                setAnnouncements([]);
            }
        }

        try {
            const data = await fetchAnnouncementsPage(activeFilter, customFilters, debouncedSearch, pageOffset);

            if (reset) {
                const newOffset = PAGE_SIZE;
                const newHasMore = data.length === PAGE_SIZE;
                setAnnouncements(data);
                setOffset(newOffset);
                setHasMore(newHasMore);
                // Store fresh data in cache
                announcementsCache.set(cacheKey, { announcements: data, offset: newOffset, hasMore: newHasMore });
                writeStoredAnnouncementsCache();
            } else {
                setAnnouncements(prev => {
                    const merged = [...prev, ...data];
                    announcementsCache.set(cacheKey, { announcements: merged, offset: pageOffset + PAGE_SIZE, hasMore: data.length === PAGE_SIZE });
                    writeStoredAnnouncementsCache();
                    return merged;
                });
                setOffset(prev => prev + PAGE_SIZE);
                setHasMore(data.length === PAGE_SIZE);
            }
        } catch (e) {
            if (isTimeoutLikeError(e)) {
                if (cached) {
                    setError(null);
                } else {
                    setError("Announcements are still loading.");
                }
            } else {
                setError(e.message || "Failed to load announcements");
            }
        } finally {
            setLoading(false);
            setRevalidating(false);
        }
    }, [activeFilter, customFilters, debouncedSearch]);

    const loadMore = () => fetchPage(offset, false);

    // Auto-load the next page when the sentinel at the bottom of the list
    // scrolls into view — no click needed, on mobile or desktop. Falls
    // back to the manual button below if IntersectionObserver is
    // unavailable or a fetch is already in flight.
    const sentinelRef = useRef(null);
    useEffect(() => {
        if (!hasMore || loading) return;
        const node = sentinelRef.current;
        if (!node || typeof IntersectionObserver === "undefined") return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting) loadMore();
        }, { rootMargin: "600px 0px" });
        observer.observe(node);
        return () => observer.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasMore, loading, offset]);

    const grouped = useMemo(() => groupByDate(announcements), [announcements]);

    const saveFilter = (query) => {
        const next = [...customFilters];
        if (editingFilter !== null) {
            next[editingFilter] = query;
        } else {
            next.push(query);
        }
        setCustomFilters(next);
        try { localStorage.setItem("te_ann_filters", JSON.stringify(next)); } catch {}
        const newIdx = editingFilter !== null ? editingFilter : next.length - 1;
        setActiveFilter(newIdx);
        setShowFilterModal(false);
        setEditingFilter(null);
        // fetchPage will fire automatically via the activeFilter useEffect
    };

    const removeFilter = (idx) => {
        const next = customFilters.filter((_, i) => i !== idx);
        setCustomFilters(next);
        try { localStorage.setItem("te_ann_filters", JSON.stringify(next)); } catch {}
        if (activeFilter === idx) setActiveFilter("all");
    };

    const filterBarStyle = {
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        padding: "0 0 18px",
    };

    const tabStyle = (active) => ({
        padding: "8px 18px", borderRadius: 8, border: `1.5px solid ${active ? "#5b5bd6" : T.border}`,
        background: active ? (darkMode ? "rgba(91,91,214,0.18)" : "#eef2ff") : "transparent",
        color: active ? "#5b5bd6" : T.subtext,
        fontSize: 14, fontWeight: active ? 600 : 400,
        cursor: "pointer", transition: "all .15s",
        display: "flex", alignItems: "center", gap: 6,
    });

    return (
        <div style={{
            width: "100%", minHeight: "100%", overflowY: "auto",
            boxSizing: "border-box", fontFamily: "inherit",
            color: T.text, background: T.bg,
            padding: isMobile ? "0" : "22px 28px 36px",
        }}>
        <div style={{
            width: "100%", maxWidth: isMobile ? "100%" : 1400,
            margin: "0 auto", minHeight: "100%",
            background: T.shellBg || T.surface,
            border: isMobile ? "none" : `1px solid ${T.border}`,
            borderRadius: isMobile ? 0 : ((T.radiusLg || 16) + 6),
            boxShadow: T.shadow,
            overflow: "hidden",
            padding: isMobile ? "16px" : "28px 32px",
            boxSizing: "border-box",
        }}>
            {/* Header */}
            <div style={{ marginBottom: 32 }}>
                <div style={{ fontSize: 12, color: T.subtext, marginBottom: 8, display: "flex", gap: 6, letterSpacing: "0.02em" }}>
                    <span style={{ color: "#5b5bd6", cursor: "pointer" }}>Fundamentals</span>
                    <span>›</span>
                    <span>Announcements</span>
                </div>
                <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, color: T.text, letterSpacing: "-0.03em", lineHeight: 1.15 }}>
                    Latest Announcements
                </h1>
                <p style={{ margin: "8px 0 0", fontSize: 15, color: T.subtext, lineHeight: 1.6 }}>
                    Corporate disclosures and regulatory filings from listed companies
                </p>
            </div>

            {/* Filter bar */}
            <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.subtext, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.09em" }}>
                    Filters
                </div>
                <div style={filterBarStyle}>
                    <button style={tabStyle(activeFilter === "all")} onClick={() => setActiveFilter("all")}>
                        All
                    </button>
                    <button style={tabStyle(activeFilter === "important")} onClick={() => setActiveFilter("important")}>
                        Important
                    </button>
                    <button style={tabStyle(activeFilter === "results")} onClick={() => setActiveFilter("results")}>
                        Results
                    </button>

                    {/* Custom filters */}
                    {customFilters.map((f, i) => (
                        <div key={i} style={{ position: "relative", display: "flex" }}>
                            <button
                                style={{ ...tabStyle(activeFilter === i), paddingRight: 8 }}
                                onClick={() => setActiveFilter(i)}
                            >
                                {f.length > 20 ? f.slice(0, 20) + "…" : f}
                            </button>
                            <button
                                title="Edit"
                                onClick={(e) => { e.stopPropagation(); setEditingFilter(i); setShowFilterModal(true); }}
                                style={{ marginLeft: -1, padding: "0 5px", borderTop: `1.5px solid ${activeFilter === i ? "#5b5bd6" : T.border}`, borderRight: `1.5px solid ${activeFilter === i ? "#5b5bd6" : T.border}`, borderBottom: `1.5px solid ${activeFilter === i ? "#5b5bd6" : T.border}`, borderLeft: "none", borderRadius: "0 7px 7px 0", background: "transparent", cursor: "pointer", color: T.subtext, fontSize: 12, transition: "background .12s" }}
                            >✎</button>
                            <button
                                title="Remove"
                                onClick={(e) => { e.stopPropagation(); removeFilter(i); }}
                                style={{ padding: "0 5px", borderTop: `1.5px solid ${activeFilter === i ? "#5b5bd6" : T.border}`, borderRight: `1.5px solid ${activeFilter === i ? "#5b5bd6" : T.border}`, borderBottom: `1.5px solid ${activeFilter === i ? "#5b5bd6" : T.border}`, borderLeft: "none", borderRadius: "0 7px 7px 0", marginLeft: -1, background: "transparent", cursor: "pointer", color: "#ef4444", fontSize: 12, transition: "background .12s" }}
                            >×</button>
                        </div>
                    ))}

                    <button
                        style={{ ...tabStyle(false), color: "#5b5bd6", borderStyle: "dashed" }}
                        onClick={() => { setEditingFilter(null); setShowFilterModal(true); }}
                    >
                        + Add Filter
                    </button>
                </div>

                {/* Context line */}
                <div style={{ fontSize: 13.5, color: T.subtext, marginBottom: 4, lineHeight: 1.6 }}>
                    {activeFilter === "important" && (
                        <>Showing <strong>non-recurring announcements</strong> identified by machine.</>
                    )}
                    {activeFilter === "all" && <>Showing all announcements.</>}
                    {activeFilter === "results" && <>Showing financial results announcements.</>}
                    {typeof activeFilter === "number" && (
                        <>Showing results for: <strong>{customFilters[activeFilter]}</strong></>
                    )}
                </div>
            </div>

            {/* Search — sticky on mobile so it stays reachable while scrolling a long list */}
            <div style={{
                position: isMobile ? "sticky" : "relative",
                top: isMobile ? 0 : undefined,
                zIndex: isMobile ? 5 : undefined,
                background: isMobile ? (T.shellBg || T.surface) : undefined,
                paddingTop: isMobile ? 6 : undefined,
                paddingBottom: isMobile ? 10 : undefined,
                maxWidth: isMobile ? "100%" : 480,
                marginBottom: isMobile ? 0 : 28,
            }}>
                <div style={{ position: "relative" }}>
                    <svg style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", opacity: 0.4, pointerEvents: "none" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.text} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by ticker, company, or keyword…"
                        style={{
                            width: "100%", padding: searchQuery ? "11px 38px 11px 38px" : "11px 16px 11px 38px",
                            border: `1.5px solid ${T.border}`, borderRadius: 10,
                            background: T.surface, color: T.text, fontSize: 15,
                            outline: "none", boxSizing: "border-box",
                        }}
                        onFocus={(e) => e.target.style.borderColor = "#6366f1"}
                        onBlur={(e) => e.target.style.borderColor = T.border}
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery("")}
                            aria-label="Clear search"
                            style={{
                                position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                                width: 22, height: 22, borderRadius: "50%", border: "none",
                                background: T.border, color: T.subtext, cursor: "pointer",
                                fontSize: 13, lineHeight: "22px", padding: 0,
                            }}
                        >×</button>
                    )}
                </div>
            </div>

            {/* Content */}
            {/* Subtle revalidation indicator — shown while background refresh is in progress */}
            {revalidating && (
                <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    marginBottom: 12, padding: "6px 14px", borderRadius: 8,
                    background: darkMode ? "rgba(99,102,241,0.12)" : "#eef2ff",
                    border: `1px solid ${darkMode ? "rgba(99,102,241,0.25)" : "#c7d2fe"}`,
                    width: "fit-content",
                }}>
                    <div style={{
                        width: 14, height: 14, borderRadius: "50%",
                        border: `2px solid ${darkMode ? "rgba(99,102,241,0.3)" : "#c7d2fe"}`,
                        borderTopColor: "#6366f1",
                        animation: "te-spin 0.7s linear infinite",
                        flexShrink: 0,
                    }} />
                    <span style={{ fontSize: 12, color: "#6366f1", fontWeight: 500 }}>Refreshing…</span>
                    <style>{`@keyframes te-spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            )}

            {loading && announcements.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 80, gap: 16 }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: "50%",
                        border: `3px solid ${T.border}`,
                        borderTopColor: "#6366f1",
                        animation: "te-spin 0.7s linear infinite",
                    }} />
                <span style={{ fontSize: 14, color: T.subtext }}>Loading announcements…</span>
                    <style>{`@keyframes te-spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            ) : error ? (
                <div style={{
                    padding: "20px 24px", borderRadius: 10,
                    background: darkMode ? "rgba(239,68,68,0.12)" : "#fef2f2",
                    border: `1px solid ${darkMode ? "rgba(239,68,68,0.3)" : "#fecaca"}`,
                    color: "#ef4444", fontSize: 14,
                    display: "flex", alignItems: "center", gap: 10,
                }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    {error}
                    <button onClick={() => fetchPage(0, true)} style={{ marginLeft: "auto", color: "#ef4444", background: "none", border: "1px solid #ef4444", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 12 }}>
                        Retry
                    </button>
                </div>
            ) : Object.keys(grouped).length === 0 ? (
                <div style={{ textAlign: "center", paddingTop: 80, color: T.subtext, fontSize: 15 }}>
                    No announcements match the current filter.
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                    {Object.entries(grouped).map(([dateLabel, items]) => (
                        <div key={dateLabel} style={{ contentVisibility: "auto", containIntrinsicSize: "0 400px" }}>
                            {/* Date group header */}
                            <div style={{
                                fontSize: 13, fontWeight: 700, color: T.subtext,
                                marginBottom: 14, paddingBottom: 10,
                                borderBottom: `1px solid ${T.border}`,
                                letterSpacing: "0.06em", textTransform: "uppercase",
                            }}>
                                {dateLabel}
                            </div>

                            {/* Cards */}
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                {items.map((item) => (
                                    <AnnouncementCard
                                        key={item.seq_id}
                                        item={item}
                                        T={T}
                                        darkMode={darkMode}
                                    />
                                ))}
                            </div>
                        </div>
                    ))}

                    {/* Load more — auto-fires ~600px before this scrolls into view */}
                    {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
                    {hasMore && (
                        <div style={{ textAlign: "center", paddingTop: 8, paddingBottom: 16 }}>
                            <button
                                onClick={loadMore}
                                disabled={loading}
                                style={{
                                    padding: "12px 32px", borderRadius: 10,
                                    border: `1.5px solid ${T.border}`,
                                    background: "transparent", color: T.text,
                                    cursor: loading ? "wait" : "pointer",
                                    fontSize: 14, fontWeight: 500,
                                    opacity: loading ? 0.6 : 1,
                                    transition: "background .15s",
                                    letterSpacing: "0.01em",
                                }}
                                onMouseEnter={(e) => !loading && (e.currentTarget.style.background = T.surface)}
                                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                            >
                                {loading ? "Loading…" : "Load more"}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Filter Modal */}
            {showFilterModal && (
                <FilterModal
                    existing={editingFilter !== null ? customFilters[editingFilter] : ""}
                    onSave={saveFilter}
                    onClose={() => { setShowFilterModal(false); setEditingFilter(null); }}
                    T={T}
                />
            )}
        </div>
        </div>
    );
}
