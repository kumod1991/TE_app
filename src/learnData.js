/*
 * learnData — backend data layer for LearnModule (replaces learnStart/learnFoundations/
 * learnStatements/learnRatios/learnCases/learnTechnical imports).
 *
 *  - Catalog (sections, groups, tracks, lesson titles, glossary): ONE rpc call, cached in
 *    localStorage and served stale-while-revalidate, keyed by the server's content_version.
 *  - Lesson body (blocks + quiz): fetched on demand, cached in memory, next lesson prefetched.
 *
 * Public content only: uses the anon key. All writes happen server-side with the service role.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

/* ── Config: point at the same project App.jsx uses ──────────────────────── */
const API = {
    url: import.meta.env.VITE_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
};
export function configureLearnApi({ url, anonKey }) {
    if (url) API.url = String(url).replace(/\/+$/, "");
    if (anonKey) API.anonKey = anonKey;
}

const CATALOG_LS_KEY = "te_learn_catalog_v1";
const TRACK_COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#059669", "#ea580c", "#c026d3"];

/* ── Transport ───────────────────────────────────────────────────────────── */
async function sb(path, { method = "GET", body, signal } = {}) {
    const res = await fetch(`${API.url}/rest/v1/${path}`, {
        method, signal,
        headers: { apikey: API.anonKey, Authorization: `Bearer ${API.anonKey}`, "Content-Type": "application/json", Accept: "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Learn API ${res.status}`);
    return res.json();
}

let catalogInflight = null;
export function fetchCatalog() {
    if (!catalogInflight) {
        catalogInflight = sb("rpc/lrn_get_catalog", { method: "POST", body: {} })
            .finally(() => { catalogInflight = null; });
    }
    return catalogInflight;
}

export function readCachedCatalog() {
    try {
        const raw = localStorage.getItem(CATALOG_LS_KEY);
        const c = raw ? JSON.parse(raw) : null;
        return c && Array.isArray(c.tracks) && Array.isArray(c.sections) ? c : null;
    } catch { return null; }
}
function writeCachedCatalog(c) {
    try { localStorage.setItem(CATALOG_LS_KEY, JSON.stringify(c)); } catch { /* quota or private mode */ }
}

/* ── Raw catalog → the exact derived structures LearnModule used to build at import time ── */
export function buildCatalog(raw) {
    const sections = raw.sections || [];
    const secOrder = sections.map(s => s.id);

    // TRACKS: course, then tech, then cases (the server already orders by section, then track)
    const TRACKS = [...raw.tracks].sort((a, b) => secOrder.indexOf(a.sectionId) - secOrder.indexOf(b.sectionId));
    const trackSection = Object.fromEntries(TRACKS.map(t => [t.id, t.sectionId]));
    const sectionOf = (trackId) => trackSection[trackId] || "course";

    const LESSONS = TRACKS.flatMap(tr => tr.lessons.map(l => ({ ...l, trackId: tr.id, trackTitle: tr.title })));
    const LESSON_INDEX = Object.fromEntries(LESSONS.map((l, i) => [l.id, i]));
    const lessonsIn = (sid) => LESSONS.filter(l => sectionOf(l.trackId) === sid);

    const groupsBySection = {};
    (raw.groups || []).forEach(g => { (groupsBySection[g.sectionId] ||= []).push(g); });

    const trackColorMap = {};
    const groupOfTrack = {};
    TRACKS.forEach((t, i) => {
        const g = t.groupId ? (raw.groups || []).find(x => x.id === t.groupId) : null;
        groupOfTrack[t.id] = g || null;
        trackColorMap[t.id] = (t.sectionId === "tech" && g && g.color) || TRACK_COLORS[i % TRACK_COLORS.length];
    });
    const trackColor = (id) => trackColorMap[id] || TRACK_COLORS[0];

    const SECTIONS = {};
    sections.forEach(s => {
        const own = TRACKS.filter(t => t.sectionId === s.id);
        const gs = (groupsBySection[s.id] || []).map(g => ({ ...g, tracks: own.filter(t => t.groupId === g.id) }));
        // Tracks with no group (e.g. a newly added tech track) are appended after the grouped ones, as before.
        const ordered = gs.length ? [...gs.flatMap(g => g.tracks), ...own.filter(t => !t.groupId)] : own;
        SECTIONS[s.id] = {
            lessons: lessonsIn(s.id), tracks: ordered, groups: gs.length ? gs : undefined,
            title: s.title, sub: (n) => String(s.subtitle).replace("{n}", n), foot: s.footer,
        };
    });

    const TECH_LEVEL_OF = {};
    TRACKS.forEach(t => { if (t.sectionId === "tech" && groupOfTrack[t.id]) TECH_LEVEL_OF[t.id] = SECTIONS.tech.groups.find(g => g.id === t.groupId); });

    const ALL_TERMS = (raw.glossary || []).map(g => ({ term: g.term, def: g.def, kind: g.kind }));

    return {
        version: raw.version, TRACKS, LESSONS, LESSON_INDEX, SECTIONS, TECH_LEVEL_OF, ALL_TERMS,
        COURSE_LESSONS: lessonsIn("course"), sectionOf, trackColor,
    };
}

/* ── Hook: catalog, stale-while-revalidate ───────────────────────────────── */
export function useLearnCatalog() {
    const [state, setState] = useState(() => {
        const cached = readCachedCatalog();
        return { raw: cached, status: cached ? "ready" : "loading", error: null };
    });

    const load = useCallback(() => {
        let alive = true;
        setState(s => (s.raw ? s : { ...s, status: "loading", error: null }));
        fetchCatalog().then(fresh => {
            if (!alive) return;
            writeCachedCatalog(fresh);
            setState(s => (s.raw && s.raw.version === fresh.version ? { ...s, status: "ready", error: null } : { raw: fresh, status: "ready", error: null }));
        }).catch(err => {
            if (!alive) return;
            setState(s => (s.raw ? { ...s, status: "ready" } : { raw: null, status: "error", error: err }));
        });
        return () => { alive = false; };
    }, []);

    useEffect(() => load(), [load]);

    const catalog = useMemo(() => (state.raw ? buildCatalog(state.raw) : null), [state.raw]);
    return { catalog, status: state.status, error: state.error, reload: load };
}

/* ── Lesson bodies ───────────────────────────────────────────────────────── */
const bodyCache = new Map(); // `${version}:${id}` → { blocks, quiz }
const bodyInflight = new Map();

function loadBody(id, version, signal) {
    const key = `${version}:${id}`;
    if (bodyCache.has(key)) return Promise.resolve(bodyCache.get(key));
    if (bodyInflight.has(key)) return bodyInflight.get(key);
    const p = sb(`lrn_lessons?id=eq.${encodeURIComponent(id)}&select=blocks,quiz`, { signal })
        .then(rows => {
            if (!rows.length) throw new Error("LESSON_NOT_FOUND");
            const body = { blocks: rows[0].blocks || [], quiz: rows[0].quiz || [] };
            bodyCache.set(key, body);
            return body;
        })
        .finally(() => bodyInflight.delete(key));
    bodyInflight.set(key, p);
    return p;
}

export function prefetchLessonBody(id, version) {
    if (!id || bodyCache.has(`${version}:${id}`)) return;
    loadBody(id, version).catch(() => { /* prefetch is best-effort */ });
}

/* Returns { status: "loading" | "ready" | "error", data, retry }. Cached bodies render synchronously. */
export function useLessonBody(id, version) {
    const key = `${version}:${id}`;
    const [res, setRes] = useState({ key: null, status: "loading" });
    const [attempt, setAttempt] = useState(0);
    const cached = bodyCache.get(key);

    useEffect(() => {
        if (bodyCache.has(key)) return undefined;
        let alive = true;
        loadBody(id, version)
            .then(() => { if (alive) setRes({ key, status: "ready" }); })
            .catch(e => { if (alive) setRes({ key, status: "error", notFound: e && e.message === "LESSON_NOT_FOUND" }); });
        return () => { alive = false; };
    }, [id, version, key, attempt]);

    const retry = useCallback(() => { setRes({ key: null, status: "loading" }); setAttempt(a => a + 1); }, []);
    if (cached) return { status: "ready", data: cached, retry };
    if (res.key === key && res.status === "error") return { status: "error", notFound: !!res.notFound, retry };
    if (res.key === key && res.status === "ready" && bodyCache.has(key)) return { status: "ready", data: bodyCache.get(key), retry };
    return { status: "loading", retry };
}
