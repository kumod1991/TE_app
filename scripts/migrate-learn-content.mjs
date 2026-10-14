#!/usr/bin/env node
/*
 * One-off (re-runnable) loader: old learn*.js content files → Supabase lrn_* tables.
 *
 *   # inspect only, writes ./learn-seed.json, touches nothing
 *   node scripts/migrate-learn-content.mjs --src ../src/learn --dry-run
 *
 *   # real load (service-role key, never ship this key to the browser)
 *   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/migrate-learn-content.mjs --src ../src/learn
 *
 * Upserts on primary key, so running it twice is harmless. Needs Node 18+, no npm deps.
 * The content files are loaded through a data: URL, so it works whether or not your
 * package.json is "type": "module".
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const SRC = path.resolve(opt("src", "."));
const DRY = flag("dry-run");
const OUT = path.resolve(opt("out", "./learn-seed.json"));

async function load(file) {
    const src = await readFile(path.join(SRC, file), "utf8");
    return import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
}

/* Section copy used to live inside LearnModule.jsx (SECTIONS). `{n}` = lesson count. */
const SECTIONS = [
    { id: "course", title: "Learn fundamental analysis", subtitle: "From reading a P&L to judging a stock, in {n} short lessons.", footer: "This course is for education only and is not investment advice. The company in the examples is fictional.", sort_order: 1 },
    { id: "tech", title: "Learn technical analysis", subtitle: "From reading a chart to a complete, risk-managed trading plan, in {n} lessons across four levels.", footer: "Educational content only, not investment advice. All stocks, prices and setups in the examples are fictional. No setup works every time, and trading involves risk of loss.", sort_order: 2 },
    { id: "cases", title: "Learn fundamental analysis", subtitle: "Real companies analysed from their annual reports, step by step.", footer: "This course is for education only and is not investment advice. The company in the examples is fictional.", sort_order: 3 },
];
const TECH_LEVEL_COLORS = ["#059669", "#2563eb", "#7c3aed", "#ea580c"]; // same as the old TECH_LEVEL_COLORS

async function buildSeed() {
    const { START_TRACK } = await load("learnStart.js");
    const { FOUNDATIONS_TRACKS } = await load("learnFoundations.js");
    const { STATEMENT_TRACKS } = await load("learnStatements.js");
    const { RATIO_TRACKS, GLOSSARY } = await load("learnRatios.js");
    const { CASE_TRACKS, CASE_SECTORS } = await load("learnCases.js");
    const { TECHNICAL_TRACKS, TECHNICAL_LEVELS, TECHNICAL_GLOSSARY } = await load("learnTechnical.js");

    // Same assembly rules the component used at module load.
    const courseTracks = [START_TRACK, ...FOUNDATIONS_TRACKS.filter(t => t.id !== "foundations"), ...STATEMENT_TRACKS, ...RATIO_TRACKS];
    const techById = Object.fromEntries(TECHNICAL_TRACKS.map(t => [t.id, t]));
    const techAssigned = new Set(TECHNICAL_LEVELS.flatMap(g => g.trackIds));
    const techTracks = [...TECHNICAL_LEVELS.flatMap(g => g.trackIds.map(id => techById[id]).filter(Boolean)), ...TECHNICAL_TRACKS.filter(t => !techAssigned.has(t.id))];

    const groups = [
        ...TECHNICAL_LEVELS.map((g, i) => ({ id: g.id, section_id: "tech", title: g.title, color: TECH_LEVEL_COLORS[i % TECH_LEVEL_COLORS.length], unit_singular: "track", unit_plural: "tracks", sort_order: i + 1 })),
        ...CASE_SECTORS.map((g, i) => ({ id: g.id, section_id: "cases", title: g.title, color: null, unit_singular: "company", unit_plural: "companies", sort_order: i + 1 })),
    ];
    const groupOf = {};
    TECHNICAL_LEVELS.forEach(g => g.trackIds.forEach(id => { groupOf[id] = g.id; }));
    CASE_SECTORS.forEach(g => g.trackIds.forEach(id => { groupOf[id] = g.id; }));

    const tracks = [], lessons = [];
    const addTracks = (list, sectionId) => list.forEach((t, ti) => {
        tracks.push({ id: t.id, section_id: sectionId, group_id: groupOf[t.id] ?? null, title: t.title, blurb: t.blurb ?? "", sort_order: ti + 1 });
        t.lessons.forEach((l, li) => lessons.push({
            id: l.id, track_id: t.id, title: l.title, minutes: l.minutes, summary: l.summary ?? "",
            blocks: l.blocks ?? [], quiz: l.quiz ?? [], sort_order: li + 1, is_published: true,
        }));
    });
    addTracks(courseTracks, "course");
    addTracks(techTracks, "tech");
    addTracks(CASE_TRACKS, "cases");

    const glossary = [
        ...GLOSSARY.map(g => ({ kind: "fund", term: g.term, def: g.def })),
        ...TECHNICAL_GLOSSARY.map(g => ({ kind: "tech", term: g.term, def: g.def })),
    ];
    return { sections: SECTIONS, groups, tracks, lessons, glossary };
}

/* ── PostgREST upsert, batched by payload size ─────────────────────────────── */
async function upsert(table, rows, onConflict, { maxBytes = 400_000 } = {}) {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or use --dry-run).");
    let batch = [], size = 0, sent = 0;
    const flush = async () => {
        if (!batch.length) return;
        const res = await fetch(`${url}/rest/v1/${table}?on_conflict=${onConflict}`, {
            method: "POST",
            headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify(batch),
        });
        if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
        sent += batch.length; batch = []; size = 0;
    };
    for (const r of rows) {
        const b = Buffer.byteLength(JSON.stringify(r));
        if (batch.length && size + b > maxBytes) await flush();
        batch.push(r); size += b;
    }
    await flush();
    console.log(`  ${table.padEnd(14)} ${sent} rows`);
}

const seed = await buildSeed();
console.log(`Sections ${seed.sections.length} · groups ${seed.groups.length} · tracks ${seed.tracks.length} · lessons ${seed.lessons.length} · glossary ${seed.glossary.length}`);

// Guard: duplicate ids would silently overwrite each other.
for (const [name, rows] of [["tracks", seed.tracks], ["lessons", seed.lessons]]) {
    const ids = rows.map(r => r.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dupes.length) throw new Error(`Duplicate ${name} ids: ${[...new Set(dupes)].join(", ")}`);
}

if (DRY) {
    await writeFile(OUT, JSON.stringify(seed));
    console.log(`Dry run: wrote ${OUT}`);
} else {
    console.log("Loading…");
    await upsert("lrn_sections", seed.sections, "id");
    await upsert("lrn_groups", seed.groups, "id");
    await upsert("lrn_tracks", seed.tracks, "id");
    await upsert("lrn_lessons", seed.lessons, "id");
    await upsert("lrn_glossary", seed.glossary, "kind,term");
    console.log("Done. Verify with sql/002_verify.sql");
}
