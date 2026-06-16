/*
===============================================================
  ForumModule.jsx — TradeEdge Investor Community (v2)
  Premium redesign: conviction system, sidebars, sentiment,
  structured thesis format, author credibility, gamification.
  All sub-components inline. Supabase realtime enabled.
===============================================================
*/

import {
  useState, useEffect, useCallback, useMemo, useRef, memo, useContext, createContext, startTransition
} from "react";
import { createClient } from "@supabase/supabase-js";
import { QuoteContext } from "./App";

// ─── Supabase ────────────────────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("Supabase env vars missing");
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Contexts ────────────────────────────────────────────────────────────────
const TokenContext = createContext(() => Promise.resolve(null));
const useToken = () => useContext(TokenContext);

// ─── Constants ───────────────────────────────────────────────────────────────
const PAGE_SIZE = 20;
const REPLY_PAGE_SIZE = 30;

const CONVICTION_META = {
  low:    { label: "Low Conviction",    color: "#64748b", score: 30 },
  medium: { label: "Medium Conviction", color: "#d97706", score: 65 },
  high:   { label: "High Conviction",   color: "#059669", score: 92 },
};

const THESIS_TYPES = ["Bullish", "Bearish", "Neutral", "Technical", "Macro", "Risk"];

const LEVEL_META = {
  Beginner:    { color: "#64748b", badge: "⚪" },
  Contributor: { color: "#3b82f6", badge: "🔵" },
  Analyst:     { color: "#8b5cf6", badge: "🟣" },
  Researcher:  { color: "#f59e0b", badge: "🟡" },
  Veteran:     { color: "#ef4444", badge: "🔴" },
  "Top 1%":    { color: "#10b981", badge: "🟢" },
};

const TAG_META = {
  Bullish:     { color: "#10b981", bg: "rgba(16,185,129,0.10)" },
  Bearish:     { color: "#f43f5e", bg: "rgba(244,63,94,0.08)" },
  Neutral:     { color: "#64748b", bg: "rgba(148,163,184,0.08)" },
  Technical:   { color: "#3b82f6", bg: "rgba(96,165,250,0.08)" },
  Macro:       { color: "#8b5cf6", bg: "rgba(167,139,250,0.08)" },
  Risk:        { color: "#d97706", bg: "rgba(251,191,36,0.08)" },
  Fundamental: { color: "#059669", bg: "rgba(52,211,153,0.08)" },
  News:        { color: "#ea580c", bg: "rgba(251,146,60,0.08)" },
  Question:    { color: "#64748b", bg: "rgba(148,163,184,0.08)" },
  Idea:        { color: "#2563eb", bg: "rgba(96,165,250,0.08)" },
};

// ─── Utilities ───────────────────────────────────────────────────────────────
function withAlpha(color, alpha) {
  if (!color || typeof color !== "string") return `rgba(15,23,42,${alpha})`;
  if (color.startsWith("rgba")) return color.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, `rgba($1,$2,$3,${alpha})`);
  if (color.startsWith("rgb(")) return color.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
  // Handle hex colors (#rrggbb or #rgb)
  if (color.startsWith("#")) {
    let hex = color.slice(1);
    if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return `rgba(${r},${g},${b},${alpha})`;
  }
  return color;
}

function useViewport() {
  const [width, setWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const h = () => setWidth(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return { width, isMobile: width < 768, isTablet: width >= 768 && width < 1100, isDesktop: width >= 1100 };
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const addToast = useCallback((message, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);
  }, []);
  return { toasts, addToast };
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
}

function stripMarkdown(md) {
  if (!md) return "";
  return md.replace(/```[\s\S]*?```/g, "").replace(/`[^`]+`/g, "").replace(/^#+\s/gm, "").replace(/\*\*\*(.+?)\*\*\*/g, "$1").replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1").replace(/^[-*]\s/gm, "").replace(/^\d+\.\s/gm, "").replace(/^>\s/gm, "").replace(/\n+/g, " ").trim();
}

function renderMarkdown(md) {
  if (!md) return "";
  let html = md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/```[\s\S]*?```/g, m => {
      const inner = m.slice(3, -3).replace(/^\w*\n?/, "");
      return `<pre style="background:rgba(0,0,0,.08);padding:12px 16px;border-radius:10px;overflow-x:auto;font-size:13px;font-family:'IBM Plex Mono',monospace;margin:12px 0;line-height:1.5">${inner}</pre>`;
    })
    .replace(/`([^`]+)`/g, "<code style=\"background:rgba(0,0,0,.08);padding:2px 6px;border-radius:5px;font-family:'IBM Plex Mono',monospace;font-size:13px\">$1</code>")
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid rgba(0,0,0,.1);margin:10px 0">')
    .replace(/^### (.+)$/gm, "<h3 style=\"font-size:15px;font-weight:800;margin:12px 0 3px\">$1</h3>")
    .replace(/^## (.+)$/gm, "<h2 style=\"font-size:17px;font-weight:800;margin:14px 0 4px\">$1</h2>")
    .replace(/^# (.+)$/gm, "<h1 style=\"font-size:21px;font-weight:900;margin:16px 0 5px\">$1</h1>")
    .replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid rgba(96,165,250,0.5);margin:8px 0;padding:4px 14px;opacity:.85;font-style:italic">$1</blockquote>')
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^[-*] (.+)$/gm, '<li style="margin:4px 0">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li style="margin:4px 0;list-style-type:decimal">$1</li>')
    .replace(/(<li[^>]*>[\s\S]*?<\/li>\n?)+/g, m => `<ul style="padding-left:20px;margin:8px 0">${m}</ul>`)
    .replace(/\n\n/g, '</p><p style="margin:5px 0">')
    .replace(/\n/g, "<br/>");
  return `<p style="margin:5px 0">${html}</p>`;
}

// ─── Forum Cache (stale-while-revalidate) ─────────────────────────────────────
const FORUM_CACHE_KEY = "te_forum_threads_v1";
const FORUM_CACHE_TTL = 5 * 60 * 1000; // 5 minutes — show stale, revalidate in background

function readForumCache(cacheKey) {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    return { data, stale: Date.now() - ts > FORUM_CACHE_TTL };
  } catch { return null; }
}

function writeForumCache(cacheKey, data) {
  try { localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data })); } catch { /* quota exceeded, ignore */ }
}


function sbHeaders(token) {
  return { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token || SUPABASE_ANON_KEY}` };
}

async function sbFetch(path, opts = {}, token) {
  const { headers: extraHeaders, ...restOpts } = opts;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...restOpts,
    headers: { ...sbHeaders(token), ...(extraHeaders || {}) },
  });
  if (!r.ok) { const text = await r.text().catch(() => r.statusText); throw new Error(text || r.statusText); }
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("application/json") && r.status !== 204) return r.json();
  return null;
}

async function fetchUserBookmarks(userId, token, threadIds = []) {
  if (!userId) return [];
  let qs = `forum_bookmarks?select=thread_id,created_at&user_id=eq.${userId}`;
  if (Array.isArray(threadIds) && threadIds.length > 0) {
    qs += `&thread_id=in.(${threadIds.join(",")})`;
  }
  const rows = await sbFetch(qs, {}, token).catch(() => []);
  return Array.isArray(rows) ? rows : [];
}

function applySavedFlags(threads, bookmarkRows = []) {
  const bookmarkMap = new Map((bookmarkRows || []).map(row => [row.thread_id, row.created_at || true]));
  return (threads || []).map(thread => ({
    ...thread,
    is_saved: bookmarkMap.has(thread.id),
    saved_at: bookmarkMap.get(thread.id) || thread.saved_at || null,
  }));
}

function sortSavedThreads(threads, sort) {
  const list = [...(threads || [])];
  if (sort === "top") {
    list.sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0) || new Date(b.saved_at || b.created_at) - new Date(a.saved_at || a.created_at));
  } else if (sort === "discussed") {
    list.sort((a, b) => (b.reply_count || 0) - (a.reply_count || 0) || new Date(b.saved_at || b.created_at) - new Date(a.saved_at || a.created_at));
  } else {
    list.sort((a, b) => new Date(b.saved_at || b.created_at) - new Date(a.saved_at || a.created_at));
  }
  return list;
}

async function uploadToStorage(bucket, path, file, token, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`);
    xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY);
    xhr.setRequestHeader("Authorization", `Bearer ${token || SUPABASE_ANON_KEY}`);
    xhr.setRequestHeader("x-upsert", "true");
    if (onProgress) xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) resolve(`${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`); else reject(new Error(`Upload failed: ${xhr.statusText}`)); };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
}

// ─── Base UI ──────────────────────────────────────────────────────────────────
function Avatar({ name, size = 32, T, url }) {
  const initials = (name || "?").split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const palette = ["#2563eb", "#059669", "#7c3aed", "#db2777", "#d97706", "#0891b2", "#dc2626", "#0d9488"];
  const color = palette[(name || "").charCodeAt(0) % palette.length];
  if (url) return <img src={url} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: `linear-gradient(135deg, ${color}, ${color}cc)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: size * 0.38, fontWeight: 800, flexShrink: 0, userSelect: "none", border: `1.5px solid ${color}44` }}>
      {initials}
    </div>
  );
}

function TickerBadge({ ticker, size = "sm", onTickerClick, T }) {
  const { quotes } = useContext(QuoteContext);
  const quote = quotes?.[ticker];
  const pct = quote?.pct ?? quote?.change_pct ?? null;
  const isPos = pct != null && pct >= 0;
  const isLg = size === "lg";
  return (
    <span
      onClick={onTickerClick && ticker ? (e) => { e.stopPropagation(); onTickerClick(ticker); } : undefined}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        background: T.accentFill, border: `1px solid ${withAlpha(T.accent, 0.2)}`,
        borderRadius: 6, padding: isLg ? "5px 12px" : "3px 8px",
        cursor: onTickerClick ? "pointer" : "default", flexShrink: 0,
        transition: "all 0.15s",
      }}
      onMouseEnter={e => onTickerClick && Object.assign(e.currentTarget.style, { transform: "scale(1.04)", background: withAlpha(T.accent, 0.15) })}
      onMouseLeave={e => onTickerClick && Object.assign(e.currentTarget.style, { transform: "scale(1)", background: T.accentFill })}
    >
      <span style={{ fontSize: isLg ? 13 : 11, fontWeight: 800, color: T.accent, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.04em" }}>{ticker}</span>
      {pct != null && <span style={{ fontSize: isLg ? 12 : 10, color: isPos ? T.green : T.red, fontWeight: 700 }}>{isPos ? "+" : ""}{pct.toFixed(2)}%</span>}
    </span>
  );
}

function ConvictionBadge({ conviction, T }) {
  const meta = CONVICTION_META[conviction] || CONVICTION_META.low;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, background: withAlpha(meta.color, 0.1), borderRadius: 6, padding: "3px 8px", border: `1px solid ${withAlpha(meta.color, 0.25)}` }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: meta.color }} />
      <span style={{ fontSize: 9, fontWeight: 800, color: meta.color, letterSpacing: "0.06em", textTransform: "uppercase" }}>{meta.label}</span>
      <span style={{ fontSize: 9, fontWeight: 900, color: meta.color, fontFamily: "'IBM Plex Mono', monospace" }}>{meta.score}</span>
    </div>
  );
}

function LevelBadge({ level, T }) {
  const meta = LEVEL_META[level] || LEVEL_META.Beginner;
  return (
    <span style={{ fontSize: 9, fontWeight: 800, color: meta.color, background: withAlpha(meta.color, 0.1), padding: "2px 7px", borderRadius: 4, letterSpacing: "0.04em", textTransform: "uppercase" }}>
      {level || "Beginner"}
    </span>
  );
}

function ThesisTypeBadge({ type, T }) {
  const meta = TAG_META[type];
  const color = meta ? meta.color : T.accent;
  const bg = meta ? meta.bg : withAlpha(T.accent, 0.08);
  return (
    <span style={{ fontSize: 9, fontWeight: 800, color, background: bg, padding: "2px 7px", borderRadius: 4, letterSpacing: "0.04em", border: `1px solid ${withAlpha(color, 0.18)}` }}>
      {type}
    </span>
  );
}

function SentimentBar({ bullish = 0, bearish = 0, T }) {
  const total = bullish + bearish;
  if (total === 0) return null;
  const bullPct = Math.round((bullish / total) * 100);
  const bearPct = 100 - bullPct;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: T.green, fontFamily: "'IBM Plex Mono', monospace" }}>🟢 {bullPct}%</span>
      <div style={{ flex: 1, height: 4, borderRadius: 4, overflow: "hidden", background: withAlpha(T.red, 0.2), minWidth: 60 }}>
        <div style={{ width: `${bullPct}%`, height: "100%", background: `linear-gradient(90deg, ${T.green}, ${withAlpha(T.green, 0.7)})`, borderRadius: 4, transition: "width 0.4s ease" }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 800, color: T.red, fontFamily: "'IBM Plex Mono', monospace" }}>🔴 {bearPct}%</span>
    </div>
  );
}

function VoteButton({ upvotes, downvotes, userVote, onVote, onLoginRequired, T, compact = false }) {
  const netVotes = (upvotes || 0) - (downvotes || 0);
  const p = compact ? "4px 8px" : "6px 12px";
  return (
    <div style={{ display: "flex", alignItems: "center", background: T.mutedFill, borderRadius: 8, overflow: "hidden", border: `1px solid ${withAlpha(T.text, 0.07)}` }}>
      <button
        onClick={(e) => { e.stopPropagation(); onVote ? onVote(1) : onLoginRequired?.(); }}
        style={{ display: "flex", alignItems: "center", gap: 4, border: "none", background: userVote === 1 ? withAlpha(T.green, 0.15) : "transparent", color: userVote === 1 ? T.green : T.subtext, padding: p, cursor: "pointer", fontSize: compact ? 11 : 12, fontWeight: 700, transition: "all 0.15s" }}
      >
        ▲ <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{upvotes || 0}</span>
      </button>
      <div style={{ width: 1, background: withAlpha(T.text, 0.08), alignSelf: "stretch" }} />
      <button
        onClick={(e) => { e.stopPropagation(); onVote ? onVote(-1) : onLoginRequired?.(); }}
        style={{ display: "flex", alignItems: "center", gap: 4, border: "none", background: userVote === -1 ? withAlpha(T.red, 0.12) : "transparent", color: userVote === -1 ? T.red : T.subtext, padding: p, cursor: "pointer", fontSize: compact ? 11 : 12, fontWeight: 700, transition: "all 0.15s" }}
      >
        ▼
      </button>
    </div>
  );
}

function BookmarkButton({ isSaved, onToggle, onLoginRequired, T, compact = false }) {
  const p = compact ? "4px 10px" : "6px 14px";
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle ? onToggle() : onLoginRequired?.(); }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: p,
        background: isSaved ? withAlpha(T.accent, 0.12) : T.mutedFill,
        border: `1px solid ${isSaved ? withAlpha(T.accent, 0.22) : withAlpha(T.text, 0.07)}`,
        borderRadius: 8,
        color: isSaved ? T.accent : T.subtext,
        cursor: "pointer",
        fontSize: compact ? 11 : 12,
        fontWeight: 700,
        transition: "all 0.15s",
      }}
    >
      <span>🔖</span>
      <span>{isSaved ? "Saved" : "Save"}</span>
    </button>
  );
}

function StatPill({ icon, value, label, T }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, color: T.subtext }}>
      <span style={{ fontSize: 12 }}>{icon}</span>
      <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" }}>{value}</span>
      {label && <span style={{ fontSize: 11, color: T.muted }}>{label}</span>}
    </div>
  );
}

function SkeletonCard({ T }) {
  return (
    <div style={{ padding: "20px 24px", background: T.surface, borderRadius: 16, marginBottom: 12, border: `1px solid ${withAlpha(T.text, 0.06)}` }}>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: T.mutedFill }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ height: 10, width: "25%", background: T.mutedFill, borderRadius: 4 }} />
          <div style={{ height: 18, width: "75%", background: T.mutedFill, borderRadius: 4 }} />
          <div style={{ height: 13, width: "55%", background: T.mutedFill, borderRadius: 4 }} />
        </div>
      </div>
    </div>
  );
}

function ToastContainer({ toasts, T }) {
  if (!toasts.length) return null;
  return (
    <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", zIndex: 9999, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
      {toasts.map(t => (
        <div key={t.id} style={{ background: t.type === "error" ? T.red : T.green, color: "#fff", padding: "10px 22px", borderRadius: 10, fontSize: 13, fontWeight: 700, boxShadow: "0 8px 28px rgba(0,0,0,.22)", animation: "slideInBottom 0.25s ease" }}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ─── Media Components ─────────────────────────────────────────────────────────
function MediaUploader({ onFilesAdded, maxFiles = 8, userId, token, T, isMobile = false, pasteHandlerRef }) {
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState([]);
  const inputRef = useRef();
  const queueLen = useRef(0);
  queueLen.current = queue.length;

  const processFiles = useCallback(async (files) => {
    const toProcess = Array.from(files).slice(0, maxFiles - queueLen.current);
    if (!toProcess.length) return;
    const newItems = toProcess.map(f => ({ id: Math.random().toString(36).slice(2), file: f, name: f.name, type: f.type.startsWith("image/") ? "image" : f.type.startsWith("video/") ? "video" : "document", status: "uploading", progress: 0, localUrl: f.type.startsWith("image/") || f.type.startsWith("video/") ? URL.createObjectURL(f) : null }));
    setQueue(q => [...q, ...newItems]);
    for (const item of newItems) {
      try {
        const url = await uploadToStorage("forum-attachments", `${userId || "anon"}/draft/${item.id}-${item.file.name}`, item.file, token, (pct) => setQueue(q => q.map(x => x.id === item.id ? { ...x, progress: pct } : x)));
        setQueue(q => q.map(x => x.id === item.id ? { ...x, status: "done", progress: 100, url } : x));
        onFilesAdded?.({ type: item.type, url, name: item.name });
      } catch { setQueue(q => q.map(x => x.id === item.id ? { ...x, status: "error" } : x)); }
    }
  }, [maxFiles, userId, token, onFilesAdded]);

  const handlePaste = useCallback((e) => {
    const files = Array.from(e.clipboardData?.items || []).filter(i => i.kind === "file").map(i => i.getAsFile()).filter(Boolean);
    if (files.length) { e.preventDefault(); e.stopPropagation(); processFiles(files); }
  }, [processFiles]);

  useEffect(() => { if (pasteHandlerRef) pasteHandlerRef.current = handlePaste; }, [handlePaste, pasteHandlerRef]);
  useEffect(() => { document.addEventListener("paste", handlePaste); return () => document.removeEventListener("paste", handlePaste); }, [handlePaste]);

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); processFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        style={{ border: `1.5px dashed ${dragging ? T.accent : withAlpha(T.text, 0.12)}`, borderRadius: 12, padding: "20px", textAlign: "center", cursor: "pointer", background: dragging ? withAlpha(T.accent, 0.06) : T.mutedFill, transition: "all .15s" }}
      >
        <div style={{ fontSize: 20, marginBottom: 4 }}>📎</div>
        <div style={{ fontSize: 13, color: T.subtext, fontWeight: 600 }}>{dragging ? "Drop to upload" : "Attach files · Drag or paste"}</div>
      </div>
      <input ref={inputRef} type="file" multiple hidden onChange={(e) => processFiles(e.target.files)} />
      {queue.length > 0 && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          {queue.map(item => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: T.surface, border: `1px solid ${item.status === "error" ? T.red : withAlpha(T.text, 0.08)}`, borderRadius: 10 }}>
              {item.type === "image" && item.localUrl ? <img src={item.localUrl} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, flexShrink: 0, opacity: item.status === "uploading" ? 0.6 : 1 }} /> : <span style={{ fontSize: 16 }}>{item.type === "image" ? "🖼" : item.type === "video" ? "🎬" : "📄"}</span>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: item.status === "error" ? T.red : T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                {item.status === "uploading" && <div style={{ width: "100%", height: 3, background: T.mutedFill, borderRadius: 2, marginTop: 4 }}><div style={{ width: `${item.progress}%`, height: "100%", background: T.accent, borderRadius: 2, transition: "width .2s" }} /></div>}
                {item.status === "error" && <div style={{ fontSize: 11, color: T.red, marginTop: 2 }}>Upload failed</div>}
              </div>
              {item.status === "done" && <span style={{ color: T.green, fontSize: 14 }}>✓</span>}
              <button onClick={() => { if (item.localUrl) URL.revokeObjectURL(item.localUrl); setQueue(q => q.filter(x => x.id !== item.id)); }} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 14 }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MediaPreview({ items, T }) {
  const [lightbox, setLightbox] = useState(null);
  const imgs = (items || []).filter(m => m.type === "image");
  const docs = (items || []).filter(m => m.type !== "image" && m.type !== "video");
  if (!items || items.length === 0) return null;
  return (
    <>
      {imgs.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {imgs.map((m, i) => (
            <img key={i} src={m.url} alt="" onClick={() => setLightbox(m.url)} style={{ flex: "1 1 calc(50% - 3px)", minWidth: 180, maxWidth: imgs.length === 1 ? "100%" : "calc(50% - 3px)", height: "auto", maxHeight: 340, objectFit: "cover", borderRadius: 10, cursor: "zoom-in", border: `1px solid ${withAlpha(T.text, 0.08)}`, display: "block" }} />
          ))}
        </div>
      )}
      {docs.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {docs.map((m, i) => (
            <a key={i} href={m.url} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", background: T.mutedFill, borderRadius: 8, border: `1px solid ${withAlpha(T.text, 0.08)}`, textDecoration: "none", color: T.subtext, fontSize: 12, fontWeight: 600 }}>📄 {m.name || "Document"}</a>
          ))}
        </div>
      )}
      {lightbox && <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.94)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out", backdropFilter: "blur(8px)" }}><img src={lightbox} alt="" style={{ maxWidth: "92vw", maxHeight: "90vh", borderRadius: 10, objectFit: "contain" }} /></div>}
    </>
  );
}

function MarkdownToolbar({ textareaRef, value, onChange, T }) {
  const wrap = (b, a = b) => {
    const el = textareaRef.current; if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const next = value.slice(0, s) + b + (value.slice(s, e) || "text") + a + value.slice(e);
    onChange(next); setTimeout(() => { el.focus(); el.setSelectionRange(s + b.length, s + b.length + (value.slice(s, e) || "text").length); }, 0);
  };
  const tools = [{ l: "B", fn: () => wrap("**") }, { l: "I", fn: () => wrap("*") }, { l: "H2", fn: () => wrap("## ", "") }, { l: "•", fn: () => wrap("- ", "") }, { l: "❝", fn: () => wrap("> ", "") }];
  return (
    <div style={{ display: "flex", gap: 2, padding: "6px 10px", background: T.mutedFill, borderBottom: `1px solid ${withAlpha(T.text, 0.07)}`, borderRadius: "10px 10px 0 0" }}>
      {tools.map(t => <button key={t.l} onClick={t.fn} type="button" style={{ padding: "4px 10px", border: "none", background: "transparent", color: T.subtext, cursor: "pointer", borderRadius: 6, fontSize: 12, fontWeight: 800 }}>{t.l}</button>)}
    </div>
  );
}

// ─── Left Sidebar ─────────────────────────────────────────────────────────────
function LeftSidebar({ session, filter, onFilterChange, onNewThread, onLoginRequired, T }) {
  const navItems = [
    { id: "all", icon: "🔭", label: "Discovery" },
    { id: "trending", icon: "🔥", label: "Trending" },
    { id: "new", icon: "⚡", label: "Latest" },
    ...(session ? [{ id: "mine", icon: "📁", label: "My Posts" }] : []),
    ...(session ? [{ id: "saved", icon: "🔖", label: "Saved" }] : []),
  ];
  return (
    <div style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", gap: 0, paddingRight: 8 }}>
      {/* New Post Button */}
      <button
        onClick={session ? onNewThread : onLoginRequired}
        style={{ width: "100%", padding: "12px 16px", background: T.accent, color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer", marginBottom: 20, boxShadow: `0 4px 16px ${withAlpha(T.accent, 0.3)}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.15s" }}
        onMouseEnter={e => e.currentTarget.style.boxShadow = `0 6px 24px ${withAlpha(T.accent, 0.4)}`}
        onMouseLeave={e => e.currentTarget.style.boxShadow = `0 4px 16px ${withAlpha(T.accent, 0.3)}`}
      >
        <span style={{ fontSize: 16 }}>✍️</span> New Thesis
      </button>

      {/* Nav */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 24 }}>
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => onFilterChange(item.id)}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
              border: "none", background: filter === item.id ? withAlpha(T.accent, 0.1) : "transparent",
              color: filter === item.id ? T.accent : T.subtext, borderRadius: 8,
              fontSize: 13, fontWeight: filter === item.id ? 700 : 500, cursor: "pointer",
              textAlign: "left", transition: "all 0.1s",
              borderLeft: filter === item.id ? `3px solid ${T.accent}` : "3px solid transparent",
            }}
          >
            <span>{item.icon}</span> {item.label}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: withAlpha(T.text, 0.06), marginBottom: 20 }} />

      {/* Watchlist stocks */}
      <div style={{ fontSize: 9, fontWeight: 800, color: T.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10, paddingLeft: 14 }}>Popular Tickers</div>
      <WatchlistSidebarTickers T={T} />
    </div>
  );
}

function WatchlistSidebarTickers({ T }) {
  const { quotes } = useContext(QuoteContext);
  const tickers = ["RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK", "BAJFINANCE", "NIFTY50", "SENSEX"];
  const available = tickers.filter(t => quotes?.[t]).slice(0, 6);
  if (!available.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {available.map(ticker => {
        const q = quotes[ticker];
        const pct = q?.pct ?? q?.change_pct ?? null;
        const isPos = pct != null && pct >= 0;
        return (
          <div key={ticker} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 14px", borderRadius: 8, background: T.mutedFill }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.text, fontFamily: "'IBM Plex Mono', monospace" }}>{ticker}</span>
            {pct != null && <span style={{ fontSize: 11, fontWeight: 700, color: isPos ? T.green : T.red }}>{isPos ? "+" : ""}{pct.toFixed(2)}%</span>}
          </div>
        );
      })}
    </div>
  );
}

// ─── Right Sidebar ─────────────────────────────────────────────────────────────
function RightSidebar({ threads, T, onTickerClick }) {
  const sentimentMap = useMemo(() => {
    const map = {};
    threads.forEach(t => {
      if (!t.ticker) return;
      if (!map[t.ticker]) map[t.ticker] = { ticker: t.ticker, bull: 0, bear: 0, count: 0 };
      if (t.thesis_type === "Bullish") map[t.ticker].bull++;
      else if (t.thesis_type === "Bearish") map[t.ticker].bear++;
      map[t.ticker].count++;
    });
    return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 6);
  }, [threads]);

  const topAuthors = useMemo(() => {
    const map = {};
    threads.forEach(t => {
      const k = t.author_display_name || "Anon";
      if (!map[k]) map[k] = { name: k, votes: 0, posts: 0 };
      map[k].votes += (t.upvotes || 0);
      map[k].posts++;
    });
    return Object.values(map).sort((a, b) => b.votes - a.votes).slice(0, 5);
  }, [threads]);

  return (
    <div style={{ width: 240, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16, paddingLeft: 8 }}>
      {/* Trending Tickers */}
      <SidePanel title="Community Sentiment" T={T}>
        {sentimentMap.length === 0 ? (
          <div style={{ fontSize: 12, color: T.muted, textAlign: "center", padding: "12px 0" }}>No data yet</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sentimentMap.map(({ ticker, bull, bear, count }) => {
              const total = bull + bear;
              const bullPct = total > 0 ? Math.round((bull / total) * 100) : 50;
              return (
                <div key={ticker} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <button onClick={() => onTickerClick?.(ticker)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: T.accent, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.04em" }}>{ticker}</span>
                    </button>
                    <span style={{ fontSize: 10, color: T.muted }}>{count} posts</span>
                  </div>
                  <div style={{ display: "flex", height: 4, borderRadius: 3, overflow: "hidden", background: withAlpha(T.red, 0.2) }}>
                    <div style={{ width: `${bullPct}%`, background: T.green, borderRadius: 3, transition: "width 0.3s" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 10, color: T.green, fontWeight: 700 }}>🟢 {bullPct}%</span>
                    <span style={{ fontSize: 10, color: T.red, fontWeight: 700 }}>🔴 {100 - bullPct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SidePanel>

      {/* Top Contributors */}
      <SidePanel title="Top Contributors" T={T}>
        {topAuthors.length === 0 ? (
          <div style={{ fontSize: 12, color: T.muted, textAlign: "center", padding: "12px 0" }}>—</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {topAuthors.map((author, i) => (
              <div key={author.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: T.muted, fontFamily: "'IBM Plex Mono', monospace", width: 14 }}>#{i + 1}</span>
                <Avatar name={author.name} size={24} T={T} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{author.name}</div>
                  <div style={{ fontSize: 10, color: T.muted }}>▲ {author.votes} · {author.posts} posts</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SidePanel>

      {/* Most Bullish */}
      <SidePanel title="Most Bullish" T={T}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {threads.filter(t => t.thesis_type === "Bullish" && t.ticker).slice(0, 4).map(t => (
            <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button onClick={() => onTickerClick?.(t.ticker)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: T.green, fontFamily: "'IBM Plex Mono', monospace" }}>{t.ticker}</span>
              </button>
              <span style={{ fontSize: 10, color: T.muted }}>▲ {t.upvotes || 0}</span>
            </div>
          ))}
          {threads.filter(t => t.thesis_type === "Bullish" && t.ticker).length === 0 && <div style={{ fontSize: 12, color: T.muted, textAlign: "center", padding: "8px 0" }}>—</div>}
        </div>
      </SidePanel>
    </div>
  );
}

function SidePanel({ title, children, T }) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${withAlpha(T.text, 0.07)}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${withAlpha(T.text, 0.06)}`, fontSize: 9, fontWeight: 800, color: T.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>{title}</div>
      <div style={{ padding: "12px 14px" }}>{children}</div>
    </div>
  );
}

// ─── Thread Card ──────────────────────────────────────────────────────────────
const ThreadCard = memo(function ThreadCard({ thread, onClick, session, userVotes, onVote, onLoginRequired, onTickerClick, onToggleBookmark, T, isMobile = false }) {
  const [hov, setHov] = useState(false);
  const myVote = userVotes?.[thread.id] ?? 0;
  const images = (thread.media_urls || []).filter(m => m.type === "image");
  const bodyPreview = stripMarkdown(thread.body).slice(0, isMobile ? 90 : 150) + (thread.body?.length > (isMobile ? 90 : 150) ? "…" : "");
  const convMeta = CONVICTION_META[thread.conviction_score >= 80 ? "high" : thread.conviction_score >= 50 ? "medium" : "low"] || CONVICTION_META.low;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        cursor: "pointer", background: T.surface,
        border: `1px solid ${hov ? withAlpha(T.accent, 0.3) : withAlpha(T.text, 0.07)}`,
        borderRadius: isMobile ? 14 : 16, marginBottom: 10,
        transition: "all 0.18s cubic-bezier(0.4,0,0.2,1)",
        boxShadow: hov ? `0 8px 32px ${withAlpha(T.accent, 0.08)}` : "none",
        position: "relative", overflow: "hidden",
        fontFamily: "'IBM Plex Sans', sans-serif",
      }}
    >
      {/* Left accent on hover */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: hov ? T.accent : "transparent", borderRadius: "16px 0 0 16px", transition: "background 0.18s" }} />

      {thread.is_pinned && (
        <div style={{ position: "absolute", top: 12, right: 14, background: T.amber, color: "#fff", fontSize: 8, fontWeight: 900, padding: "2px 6px", borderRadius: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>📌 Pinned</div>
      )}

      <div style={{ padding: isMobile ? "14px 16px" : "18px 24px" }}>
        {/* Top row: ticker + type + conviction */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          {thread.ticker && <TickerBadge ticker={thread.ticker} T={T} onTickerClick={onTickerClick} />}
          {thread.thesis_type && <ThesisTypeBadge type={thread.thesis_type} T={T} />}
          {(thread.conviction_score != null) && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, background: withAlpha(convMeta.color, 0.1), borderRadius: 5, padding: "2px 7px", border: `1px solid ${withAlpha(convMeta.color, 0.2)}` }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: convMeta.color }} />
              <span style={{ fontSize: 9, fontWeight: 800, color: convMeta.color, letterSpacing: "0.05em", textTransform: "uppercase" }}>{convMeta.label}</span>
            </div>
          )}
          {(thread.tags || []).slice(0, 2).map(tag => {
            const tm = TAG_META[tag] || {};
            return <span key={tag} style={{ fontSize: 9, fontWeight: 700, color: tm.color || T.subtext, background: tm.bg || T.mutedFill, borderRadius: 4, padding: "2px 7px" }}>{tag}</span>;
          })}
        </div>

        {/* Main content row */}
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Title */}
            <div style={{ fontSize: isMobile ? 15 : 17, fontWeight: 800, color: T.text, marginBottom: 5, lineHeight: 1.3, letterSpacing: "-0.01em" }}>{thread.title}</div>

            {/* Structured preview: Bull/Bear case if available */}
            {thread.bull_case ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                {thread.bull_case && <div style={{ fontSize: 12, color: T.green, display: "flex", gap: 6 }}><span>🟢</span><span style={{ color: T.subtext, lineHeight: 1.5 }}>{stripMarkdown(thread.bull_case).slice(0, 80)}…</span></div>}
                {thread.bear_case && <div style={{ fontSize: 12, color: T.red, display: "flex", gap: 6 }}><span>🔴</span><span style={{ color: T.subtext, lineHeight: 1.5 }}>{stripMarkdown(thread.bear_case).slice(0, 80)}…</span></div>}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: T.subtext, lineHeight: 1.55, opacity: 0.85 }}>{bodyPreview}</div>
            )}

            {/* Target price / horizon */}
            {(thread.target_price || thread.time_horizon || thread.expected_cagr) && (
              <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
                {thread.target_price && <span style={{ fontSize: 10, color: T.subtext, background: T.mutedFill, padding: "2px 8px", borderRadius: 5, fontFamily: "'IBM Plex Mono', monospace" }}>🎯 ₹{Number(thread.target_price).toLocaleString("en-IN")}</span>}
                {thread.time_horizon && <span style={{ fontSize: 10, color: T.subtext, background: T.mutedFill, padding: "2px 8px", borderRadius: 5 }}>⏳ {thread.time_horizon}</span>}
                {thread.expected_cagr && <span style={{ fontSize: 10, color: T.green, background: T.posFill, padding: "2px 8px", borderRadius: 5, fontFamily: "'IBM Plex Mono', monospace" }}>~{thread.expected_cagr}% CAGR</span>}
              </div>
            )}
          </div>

          {images.length > 0 && !isMobile && (
            <img src={images[0].url} alt="" style={{ width: 90, height: 68, borderRadius: 10, objectFit: "cover", border: `1px solid ${withAlpha(T.text, 0.07)}`, flexShrink: 0 }} />
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, paddingTop: 12, borderTop: `1px solid ${withAlpha(T.text, 0.05)}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Avatar name={thread.author_display_name} size={22} T={T} />
            <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{thread.author_display_name || "Anon"}</span>
            <span style={{ fontSize: 11, color: T.muted }}>· {timeAgo(thread.created_at)}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div onClick={e => e.stopPropagation()}>
              <VoteButton upvotes={thread.upvotes} downvotes={thread.downvotes} userVote={myVote} onVote={session ? (v) => onVote(thread.id, "thread", v) : null} onLoginRequired={onLoginRequired} T={T} compact />
            </div>
            <div onClick={e => e.stopPropagation()}>
              <BookmarkButton isSaved={!!thread.is_saved} onToggle={session ? () => onToggleBookmark?.(thread.id) : null} onLoginRequired={onLoginRequired} T={T} compact />
            </div>
            <StatPill icon="💬" value={thread.reply_count || 0} T={T} />
            {thread.view_count > 0 && <StatPill icon="👁" value={thread.view_count} T={T} />}
          </div>
        </div>
      </div>
    </div>
  );
});

// ─── Reply Composer ───────────────────────────────────────────────────────────
function ReplyComposer({ threadId, parentReplyId, parentAuthor, session, onSubmitted, onCancel, T, isMobile = false }) {
  const getToken = useToken();
  const [body, setBody] = useState(parentAuthor ? `@${parentAuthor} ` : "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [mediaItems, setMediaItems] = useState([]);
  const [previewMode, setPreviewMode] = useState(false);
  const textRef = useRef();
  const pasteRef = useRef(null);

  // @mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState("");       // text after @
  const [mentionAnchor, setMentionAnchor] = useState(null);  // caret position at @
  const [mentionSuggestions, setMentionSuggestions] = useState([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [participants, setParticipants] = useState([]);
  const mentionOpen = mentionQuery !== null && mentionQuery !== undefined && mentionAnchor !== null;

  // Fetch thread participants once on mount
  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const replies = await sbFetch(`forum_replies?thread_id=eq.${threadId}&select=author_display_name,author_id`, {}, token).catch(() => []);
        const seen = new Set();
        const names = [];
        (replies || []).forEach(r => {
          const name = r.author_display_name;
          if (name && !seen.has(name) && r.author_id !== session?.user?.id) { seen.add(name); names.push(name); }
        });
        setParticipants(names);
      } catch {}
    })();
  }, [threadId]); // eslint-disable-line

  const handleBodyChange = (e) => {
    const val = e.target.value;
    setBody(val);
    const pos = e.target.selectionStart;
    // Find if cursor is in an @mention
    const textUpToCursor = val.slice(0, pos);
    const match = textUpToCursor.match(/@([\w\s.]*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionAnchor(pos - match[0].length);
      setMentionIndex(0);
      const q = match[1].toLowerCase();
      setMentionSuggestions(participants.filter(n => n.toLowerCase().includes(q)).slice(0, 6));
    } else {
      setMentionQuery(null);
      setMentionAnchor(null);
      setMentionSuggestions([]);
    }
  };

  const insertMention = (name) => {
    if (mentionAnchor === null) return;
    const before = body.slice(0, mentionAnchor);
    const after = body.slice(textRef.current?.selectionStart ?? mentionAnchor + 1 + mentionQuery.length);
    const inserted = `@${name} `;
    const newBody = before + inserted + after;
    setBody(newBody);
    setMentionQuery(null);
    setMentionAnchor(null);
    setMentionSuggestions([]);
    setTimeout(() => {
      if (textRef.current) {
        const cur = before.length + inserted.length;
        textRef.current.focus();
        textRef.current.setSelectionRange(cur, cur);
      }
    }, 0);
  };

  const handleKeyDown = (e) => {
    if (!mentionOpen || !mentionSuggestions.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, mentionSuggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(mentionSuggestions[mentionIndex]); }
    else if (e.key === "Escape") { setMentionQuery(null); setMentionAnchor(null); setMentionSuggestions([]); }
  };

  const submit = async () => {
    if (!body.trim() || body.trim().length < 3) return;
    setSubmitting(true); setError("");
    try {
      await sbFetch("forum_replies", {
        method: "POST",
        body: JSON.stringify({
          thread_id: threadId, parent_reply_id: parentReplyId || null,
          author_id: session.user.id,
          author_display_name: session.user.user_metadata?.full_name || session.user.email?.split("@")[0] || "Anonymous",
          body: body.trim(), media_urls: mediaItems.filter(m => m.url),
        })
      }, await getToken());
      setBody(""); setMediaItems([]);
      onSubmitted?.();
    } catch (err) { console.error(err); setError(err?.message || "Failed to post."); }
    finally { setSubmitting(false); }
  };

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", position: "relative" }}>
      <div style={{ border: `1px solid ${withAlpha(T.accent, 0.2)}`, borderRadius: 12, overflow: "visible", background: T.surface, position: "relative" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 6px 4px 0", borderRadius: "12px 12px 0 0", overflow: "hidden" }}>
          <MarkdownToolbar textareaRef={textRef} value={body} onChange={setBody} T={T} />
          <div style={{ display: "flex", background: T.mutedFill, borderRadius: 6, padding: 2, marginRight: 8 }}>
            <button onClick={() => setPreviewMode(false)} type="button" style={{ padding: "3px 10px", borderRadius: 4, border: "none", background: !previewMode ? T.surface : "transparent", color: !previewMode ? T.text : T.subtext, fontSize: 10, fontWeight: 800, cursor: "pointer" }}>Write</button>
            <button onClick={() => setPreviewMode(true)} type="button" style={{ padding: "3px 10px", borderRadius: 4, border: "none", background: previewMode ? T.surface : "transparent", color: previewMode ? T.text : T.subtext, fontSize: 10, fontWeight: 800, cursor: "pointer" }}>Preview</button>
          </div>
        </div>
        {previewMode
          ? <div style={{ padding: "12px 16px", minHeight: 100, fontSize: 14, lineHeight: 1.7, color: T.text }} dangerouslySetInnerHTML={{ __html: renderMarkdown(body) || "<span style='opacity:0.4'>Nothing yet…</span>" }} />
          : (
            <div style={{ position: "relative" }}>
              <textarea
                ref={textRef}
                value={body}
                onChange={handleBodyChange}
                onKeyDown={handleKeyDown}
                onPaste={e => { if (pasteRef.current) pasteRef.current(e); }}
                placeholder={parentAuthor ? `Reply to @${parentAuthor}…` : "Share your perspective…"}
                style={{ width: "100%", minHeight: 110, border: "none", outline: "none", padding: "12px 16px", fontSize: 14, color: T.text, background: "transparent", resize: "vertical", fontFamily: "inherit", lineHeight: 1.7, boxSizing: "border-box" }}
              />
              {/* @mention dropdown */}
              {mentionOpen && mentionSuggestions.length > 0 && (
                <div style={{ position: "absolute", bottom: "100%", left: 12, zIndex: 200, background: T.surface, border: `1px solid ${withAlpha(T.accent, 0.25)}`, borderRadius: 10, boxShadow: `0 8px 28px ${withAlpha(T.text, 0.15)}`, minWidth: 200, overflow: "hidden" }}>
                  <div style={{ padding: "6px 10px 4px", fontSize: 9, fontWeight: 800, color: T.muted, textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: `1px solid ${withAlpha(T.text, 0.06)}` }}>Mention a participant</div>
                  {mentionSuggestions.map((name, i) => (
                    <button
                      key={name}
                      onMouseDown={e => { e.preventDefault(); insertMention(name); }}
                      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", border: "none", background: i === mentionIndex ? withAlpha(T.accent, 0.1) : "transparent", color: i === mentionIndex ? T.accent : T.text, cursor: "pointer", fontSize: 13, fontWeight: i === mentionIndex ? 700 : 500, textAlign: "left" }}
                    >
                      <Avatar name={name} size={22} T={T} />
                      <span>@{name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        }
      </div>
      <div style={{ marginTop: 8 }}>
        <MediaUploader onFilesAdded={m => setMediaItems(p => [...p, m])} userId={session?.user?.id} token={session?.access_token} T={T} isMobile={isMobile} pasteHandlerRef={pasteRef} />
      </div>
      <MediaPreview items={mediaItems} T={T} />
      {participants.length > 0 && !mentionOpen && !previewMode && (
        <div style={{ marginTop: 6, fontSize: 11, color: T.muted }}>
          💡 Type <span style={{ fontWeight: 700, color: T.accent }}>@</span> to mention a participant
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end", alignItems: "center" }}>
        {error && <span style={{ fontSize: 12, color: T.red, flex: 1 }}>⚠ {error}</span>}
        {onCancel && <button onClick={onCancel} type="button" style={{ padding: "8px 16px", background: "none", border: `1px solid ${withAlpha(T.text, 0.12)}`, borderRadius: 8, color: T.subtext, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Cancel</button>}
        <button onClick={submit} disabled={submitting || !body.trim()} type="button" style={{ padding: "9px 24px", background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: submitting || !body.trim() ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 800, opacity: submitting || !body.trim() ? 0.5 : 1 }}>
          {submitting ? "Posting…" : "Post Reply"}
        </button>
      </div>
    </div>
  );
}

// ─── Reply Card ───────────────────────────────────────────────────────────────
const ReplyCard = memo(function ReplyCard({ reply, threadId, depth = 0, session, userVotes, onVote, onLoginRequired, onReplyPosted, onReplyDeleted, onReplyUpdated, T, isMobile = false, postIndex, totalPosts, refCallback }) {
  const getToken = useToken();
  const [showComposer, setShowComposer] = useState(false);
  const [hov, setHov] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(reply.body);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const editRef = useRef();
  const myVote = userVotes?.[reply.id] ?? 0;
  const isOwner = session?.user?.id && reply.author_id === session.user.id;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await sbFetch(`forum_replies?id=eq.${reply.id}`, { method: "DELETE" }, await getToken());
      onReplyDeleted?.(reply.id);
    } catch (err) { console.error(err); setDeleting(false); setConfirmDelete(false); }
  };

  const handleEditSave = async () => {
    if (!editBody.trim()) return;
    setEditSaving(true); setEditError("");
    try {
      await sbFetch(`forum_replies?id=eq.${reply.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ body: editBody.trim() })
      }, await getToken());
      onReplyUpdated?.(reply.id, editBody.trim());
      setEditing(false);
    } catch (err) { console.error(err); setEditError(err?.message || "Save failed."); }
    finally { setEditSaving(false); }
  };

  return (
    <div ref={refCallback} data-post-index={postIndex} style={{ marginLeft: depth > 0 ? (isMobile ? 16 : 32) : 0, position: "relative", fontFamily: "'IBM Plex Sans', sans-serif" }}>
      {depth > 0 && <div style={{ position: "absolute", left: isMobile ? -10 : -18, top: 0, bottom: 0, width: 2, background: `linear-gradient(to bottom, ${withAlpha(T.accent, 0.2)}, ${withAlpha(T.accent, 0.03)})`, borderRadius: 2 }} />}
      <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{ background: T.surface, border: `1px solid ${hov ? withAlpha(T.accent, 0.18) : withAlpha(T.text, 0.06)}`, borderRadius: isMobile ? 14 : 16, padding: isMobile ? "16px" : "20px 24px", transition: "border-color 0.15s, box-shadow 0.15s", boxShadow: hov ? `0 4px 20px ${withAlpha(T.accent, 0.06)}` : "none", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: hov ? `linear-gradient(90deg, ${T.accent}, transparent)` : "transparent", transition: "background 0.2s" }} />

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Avatar name={reply.author_display_name} size={isMobile ? 28 : 32} T={T} />
            <div>
              <div style={{ fontSize: isMobile ? 13 : 14, fontWeight: 700, color: T.text }}>{reply.author_display_name || "Anon"}</div>
              <div style={{ fontSize: 11, color: T.muted }}>{timeAgo(reply.created_at)}{postIndex != null ? ` · #${postIndex}/${totalPosts}` : ""}</div>
            </div>
          </div>
          {isOwner && !editing && (
            confirmDelete
              ? <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: T.muted }}>Delete this reply?</span>
                  <button onClick={handleDelete} disabled={deleting} style={{ padding: "5px 12px", background: T.red, color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>{deleting ? "…" : "Delete"}</button>
                  <button onClick={() => setConfirmDelete(false)} style={{ padding: "5px 10px", background: "none", border: `1px solid ${withAlpha(T.text, 0.1)}`, borderRadius: 7, fontSize: 12, color: T.subtext, cursor: "pointer" }}>Cancel</button>
                </div>
              : <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button
                    onClick={() => { setEditing(true); setEditBody(reply.body); }}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", background: T.mutedFill, border: `1px solid ${withAlpha(T.text, 0.1)}`, borderRadius: 7, cursor: "pointer", color: T.subtext, fontSize: 12, fontWeight: 600 }}
                  >
                    ✏️ Edit
                  </button>
                  <button
                    onClick={() => setConfirmDelete(true)}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", background: withAlpha(T.red, 0.07), border: `1px solid ${withAlpha(T.red, 0.18)}`, borderRadius: 7, cursor: "pointer", color: T.red, fontSize: 12, fontWeight: 600 }}
                  >
                    🗑 Delete
                  </button>
                </div>
          )}
        </div>

        {/* Body or Edit mode */}
        {editing ? (
          <div style={{ marginBottom: 12 }}>
            <textarea
              ref={editRef}
              value={editBody}
              onChange={e => setEditBody(e.target.value)}
              style={{ width: "100%", minHeight: 100, border: `1px solid ${withAlpha(T.accent, 0.3)}`, borderRadius: 10, padding: "10px 14px", fontSize: 14, color: T.text, background: T.mutedFill, resize: "vertical", fontFamily: "inherit", lineHeight: 1.7, outline: "none", boxSizing: "border-box" }}
            />
            {editError && <div style={{ fontSize: 12, color: T.red, marginTop: 4 }}>⚠ {editError}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
              <button onClick={() => { setEditing(false); setEditError(""); }} style={{ padding: "7px 14px", background: "none", border: `1px solid ${withAlpha(T.text, 0.12)}`, borderRadius: 8, color: T.subtext, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Cancel</button>
              <button onClick={handleEditSave} disabled={editSaving || !editBody.trim()} style={{ padding: "7px 18px", background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: editSaving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 800, opacity: editSaving ? 0.6 : 1 }}>{editSaving ? "Saving…" : "Save"}</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: isMobile ? 13 : 14, color: T.text, lineHeight: 1.7, opacity: 0.9 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(reply.body) }} />
            <MediaPreview items={reply.media_urls || []} T={T} />
          </>
        )}

        {/* Footer */}
        {!editing && (
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${withAlpha(T.text, 0.05)}` }}>
            <VoteButton upvotes={reply.upvotes} downvotes={reply.downvotes} userVote={myVote} onVote={session ? (v) => onVote(reply.id, "reply", v) : null} onLoginRequired={onLoginRequired} T={T} compact />
            {depth < 4 && session && (
              <button onClick={() => setShowComposer(!showComposer)} style={{ background: "none", border: "none", color: showComposer ? T.accent : T.subtext, cursor: "pointer", fontSize: 12, fontWeight: 700, padding: "4px 8px", borderRadius: 6, display: "flex", alignItems: "center", gap: 5 }}>
                ↩ Reply
              </button>
            )}
          </div>
        )}

        {showComposer && !editing && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${withAlpha(T.text, 0.06)}` }}>
            <ReplyComposer threadId={threadId} parentReplyId={reply.id} parentAuthor={reply.author_display_name} session={session} T={T} isMobile={isMobile} onSubmitted={() => { setShowComposer(false); onReplyPosted?.(); }} onCancel={() => setShowComposer(false)} />
          </div>
        )}
      </div>

      {reply.children?.map(child => (
        <div key={child.id} style={{ marginTop: 10 }}>
          <ReplyCard
            reply={child} threadId={threadId} depth={depth + 1} session={session}
            userVotes={userVotes} onVote={onVote} onLoginRequired={onLoginRequired}
            onReplyPosted={onReplyPosted} onReplyDeleted={onReplyDeleted} onReplyUpdated={onReplyUpdated}
            T={T} isMobile={isMobile}
          />
        </div>
      ))}
    </div>
  );
});

// ─── Premium Composer ─────────────────────────────────────────────────────────
// ─── Ticker Autocomplete ──────────────────────────────────────────────────────
function TickerAutocomplete({ value, onChange, inputStyle, T }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const wrapperRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetchSuggestions = useCallback(async (q) => {
    if (!q || q.length < 1) { setSuggestions([]); setOpen(false); return; }
    setLoading(true);
    try {
      // Search by ticker prefix OR company name containing the query
      const url = `bhav_copy?or=(ticker.ilike.${encodeURIComponent(q + "%")},name.ilike.${encodeURIComponent("%" + q + "%")})&select=ticker,name&order=ticker.asc&limit=8`;
      const data = await sbFetch(url, {});
      // Deduplicate by ticker
      const seen = new Set();
      const unique = (Array.isArray(data) ? data : []).filter(r => { if (seen.has(r.ticker)) return false; seen.add(r.ticker); return true; });
      setSuggestions(unique);
      setOpen(unique.length > 0);
    } catch { setSuggestions([]); setOpen(false); }
    finally { setLoading(false); }
  }, []);

  const handleChange = (e) => {
    const val = e.target.value.toUpperCase();
    onChange(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 220);
  };

  const handleSelect = (item) => {
    onChange(item.ticker);
    setSuggestions([]);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <input
        value={value}
        onChange={handleChange}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder="RELIANCE"
        autoComplete="off"
        style={{ ...inputStyle, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800, letterSpacing: "0.04em" }}
      />
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
          background: T.surface, border: `1px solid ${withAlpha(T.text, 0.12)}`,
          borderRadius: 10, boxShadow: `0 8px 28px ${withAlpha(T.text, 0.12)}`,
          zIndex: 2000, overflow: "hidden",
        }}>
          {loading && (
            <div style={{ padding: "10px 14px", fontSize: 12, color: T.muted }}>Searching…</div>
          )}
          {!loading && suggestions.map((item, i) => (
            <div
              key={item.ticker + i}
              onMouseDown={() => handleSelect(item)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 14px", cursor: "pointer",
                borderBottom: i < suggestions.length - 1 ? `1px solid ${withAlpha(T.text, 0.06)}` : "none",
                transition: "background 0.1s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = withAlpha(T.accent, 0.07)}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800, fontSize: 12, color: T.accent, minWidth: 80 }}>{item.ticker}</span>
              <span style={{ fontSize: 12, color: T.subtext, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ThreadComposer({ session, T, onClose, onPosted }) {
  const { isMobile } = useViewport(); const getToken = useToken();
  const [step, setStep] = useState(1); // 1=basics, 2=thesis, 3=conviction
  const [title, setTitle] = useState(""); const [ticker, setTicker] = useState(""); const [body, setBody] = useState("");
  const [thesisType, setThesisType] = useState("Bullish"); const [conviction, setConviction] = useState("medium");
  const [tags, setTags] = useState([]);
  const [bullCase, setBullCase] = useState(""); const [bearCase, setBearCase] = useState("");
  const [risks, setRisks] = useState(""); const [targetPrice, setTargetPrice] = useState(""); const [timeHorizon, setTimeHorizon] = useState(""); const [expectedCagr, setExpectedCagr] = useState("");
  const [mediaItems, setMediaItems] = useState([]); const [submitting, setSubmitting] = useState(false); const [error, setError] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const textRef = useRef();

  const submit = async () => {
    if (!title.trim() || !body.trim()) { setError("Title and analysis are required."); return; }
    setSubmitting(true); setError("");
    try {
      const convScore = CONVICTION_META[conviction]?.score || 50;
      const payload = {
        author_id: session.user.id,
        author_display_name: session.user.user_metadata?.full_name || session.user.email?.split("@")[0] || "Anonymous",
        ticker: ticker.toUpperCase().trim() || null, title: title.trim(), body: body.trim(),
        tags, media_urls: mediaItems.filter(m => m.url),
        thesis_type: thesisType, conviction_score: convScore,
        bull_case: bullCase.trim() || null, bear_case: bearCase.trim() || null,
        risks: risks.trim() || null,
        target_price: targetPrice ? parseFloat(targetPrice) : null,
        time_horizon: timeHorizon.trim() || null,
        expected_cagr: expectedCagr ? parseFloat(expectedCagr) : null,
      };
      const res = await sbFetch("forum_threads", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload) }, await getToken());
      onPosted?.(Array.isArray(res) ? res[0] : res);
      onClose();
    } catch (err) { console.error(err); setError(err.message || "Publish failed."); }
    finally { setSubmitting(false); }
  };

  const inputStyle = { width: "100%", padding: "11px 14px", borderRadius: 10, border: `1px solid ${withAlpha(T.text, 0.1)}`, background: T.mutedFill, color: T.text, fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" };
  const labelStyle = { fontSize: 10, fontWeight: 800, color: T.muted, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 6 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", backdropFilter: "blur(16px)", zIndex: 1000, display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 24, fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <div style={{ background: T.bg, width: "100%", maxWidth: 860, maxHeight: isMobile ? "96vh" : "92vh", borderRadius: isMobile ? "20px 20px 0 0" : 20, display: "flex", flexDirection: "column", overflow: "hidden", border: `1px solid ${withAlpha(T.text, 0.1)}` }}>

        {/* Header */}
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${withAlpha(T.text, 0.08)}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 900, color: T.text, margin: 0, letterSpacing: "-0.02em" }}>Publish Investment Thesis</h2>
            <p style={{ fontSize: 12, color: T.muted, margin: "2px 0 0" }}>Structure your thesis like professional research.</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 22, lineHeight: 1 }}>✕</button>
        </div>

        {/* Step tabs */}
        <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${withAlpha(T.text, 0.08)}`, padding: "0 24px" }}>
          {[{ n: 1, label: "Basics" }, { n: 2, label: "Thesis" }, { n: 3, label: "Conviction" }].map(s => (
            <button key={s.n} onClick={() => setStep(s.n)} style={{ padding: "10px 20px", border: "none", background: "transparent", color: step === s.n ? T.accent : T.muted, fontSize: 13, fontWeight: step === s.n ? 800 : 500, cursor: "pointer", borderBottom: step === s.n ? `2px solid ${T.accent}` : "2px solid transparent", marginBottom: -1 }}>
              {s.n}. {s.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "20px 16px" : "28px 32px" }}>
          {error && <div style={{ marginBottom: 16, padding: "10px 14px", background: withAlpha(T.red, 0.1), borderRadius: 8, color: T.red, fontSize: 13 }}>⚠ {error}</div>}

          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={labelStyle}>Ticker</label>
                  <TickerAutocomplete value={ticker} onChange={setTicker} inputStyle={inputStyle} T={T} />
                </div>
                <div>
                  <label style={labelStyle}>Thesis Type</label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {THESIS_TYPES.map(type => {
                      const color = type === "Bullish" ? T.green : type === "Bearish" ? T.red : T.accent;
                      return (
                        <button key={type} onClick={() => setThesisType(type)} type="button" style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${thesisType === type ? color : withAlpha(T.text, 0.1)}`, background: thesisType === type ? withAlpha(color, 0.12) : T.mutedFill, color: thesisType === type ? color : T.subtext, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                          {type}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Headline</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="A compelling one-line investment case…" style={{ ...inputStyle, fontSize: isMobile ? 16 : 18, fontWeight: 800, letterSpacing: "-0.01em" }} />
              </div>

              <div>
                <label style={labelStyle}>Tags</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["Thesis", "Risk", "Fundamental", "Technical", "Macro", "News"].map(tag => (
                    <button key={tag} onClick={() => setTags(p => p.includes(tag) ? p.filter(t => t !== tag) : [...p, tag])} type="button" style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${tags.includes(tag) ? T.accent : withAlpha(T.text, 0.1)}`, background: tags.includes(tag) ? withAlpha(T.accent, 0.1) : T.mutedFill, color: tags.includes(tag) ? T.accent : T.subtext, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Analysis</label>
                  <div style={{ display: "flex", background: T.mutedFill, borderRadius: 6, padding: 2 }}>
                    <button onClick={() => setPreviewMode(false)} type="button" style={{ padding: "3px 10px", borderRadius: 4, border: "none", background: !previewMode ? T.surface : "transparent", color: !previewMode ? T.text : T.subtext, fontSize: 10, fontWeight: 800, cursor: "pointer" }}>Write</button>
                    <button onClick={() => setPreviewMode(true)} type="button" style={{ padding: "3px 10px", borderRadius: 4, border: "none", background: previewMode ? T.surface : "transparent", color: previewMode ? T.text : T.subtext, fontSize: 10, fontWeight: 800, cursor: "pointer" }}>Preview</button>
                  </div>
                </div>
                <div style={{ border: `1px solid ${withAlpha(T.text, 0.1)}`, borderRadius: 12, overflow: "hidden", background: T.surface }}>
                  <MarkdownToolbar textareaRef={textRef} value={body} onChange={setBody} T={T} />
                  {previewMode
                    ? <div style={{ padding: "14px 16px", minHeight: 180, fontSize: 14, lineHeight: 1.7, color: T.text }} dangerouslySetInnerHTML={{ __html: renderMarkdown(body) || "<span style='opacity:0.4'>Empty</span>" }} />
                    : <textarea ref={textRef} value={body} onChange={e => setBody(e.target.value)} placeholder="Your detailed investment analysis, supported by data and reasoning…" style={{ width: "100%", minHeight: 200, border: "none", outline: "none", padding: "14px 16px", fontSize: 14, color: T.text, background: "transparent", resize: "vertical", fontFamily: "inherit", lineHeight: 1.7, boxSizing: "border-box" }} />
                  }
                </div>
              </div>

              <MediaUploader onFilesAdded={m => setMediaItems(p => [...p, m])} userId={session?.user?.id} token={session?.access_token} T={T} isMobile={isMobile} />
              <MediaPreview items={mediaItems} T={T} />
            </div>
          )}

          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ background: T.surface, border: `1px solid ${withAlpha(T.text, 0.07)}`, borderRadius: 12, padding: 16 }}>
                <p style={{ fontSize: 12, color: T.muted, margin: "0 0 16px", lineHeight: 1.6 }}>Structure your thesis like a professional research note. Fill as many sections as relevant — this dramatically increases post quality and discoverability.</p>
                {[
                  { label: "Bull Case", val: bullCase, set: setBullCase, placeholder: "Key reasons why this investment should work…", color: T.green },
                  { label: "Bear Case", val: bearCase, set: setBearCase, placeholder: "Key risks or reasons this may not work…", color: T.red },
                  { label: "Key Risks", val: risks, set: setRisks, placeholder: "Regulatory, competitive, macro, execution risks…", color: T.amber },
                ].map(({ label, val, set, placeholder, color }) => (
                  <div key={label} style={{ marginBottom: 16 }}>
                    <label style={{ ...labelStyle, color }}>{label}</label>
                    <textarea value={val} onChange={e => set(e.target.value)} placeholder={placeholder} style={{ ...inputStyle, minHeight: 80, resize: "vertical", lineHeight: 1.6 }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Conviction selector */}
              <div>
                <label style={labelStyle}>Conviction Level</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 8 }}>
                  {Object.entries(CONVICTION_META).map(([key, meta]) => (
                    <button key={key} onClick={() => setConviction(key)} type="button" style={{ padding: "14px 12px", borderRadius: 12, border: `2px solid ${conviction === key ? meta.color : withAlpha(T.text, 0.1)}`, background: conviction === key ? withAlpha(meta.color, 0.1) : T.surface, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, transition: "all 0.15s" }}>
                      <div style={{ width: 12, height: 12, borderRadius: "50%", background: meta.color }} />
                      <span style={{ fontSize: 11, fontWeight: 800, color: conviction === key ? meta.color : T.subtext, letterSpacing: "0.04em", textTransform: "uppercase" }}>{meta.label}</span>
                      <span style={{ fontSize: 18, fontWeight: 900, color: meta.color, fontFamily: "'IBM Plex Mono', monospace" }}>{meta.score}</span>
                      <span style={{ fontSize: 9, color: T.muted }}>/ 100</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Price targets */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Target Price (₹)</label>
                  <input value={targetPrice} onChange={e => setTargetPrice(e.target.value)} placeholder="e.g. 3200" type="number" style={{ ...inputStyle, fontFamily: "'IBM Plex Mono', monospace" }} />
                </div>
                <div>
                  <label style={labelStyle}>Time Horizon</label>
                  <input value={timeHorizon} onChange={e => setTimeHorizon(e.target.value)} placeholder="e.g. 12–18 months" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Expected CAGR (%)</label>
                  <input value={expectedCagr} onChange={e => setExpectedCagr(e.target.value)} placeholder="e.g. 24" type="number" style={{ ...inputStyle, fontFamily: "'IBM Plex Mono', monospace" }} />
                </div>
              </div>

              {/* Summary preview */}
              {(ticker || title) && (
                <div style={{ background: T.surface, border: `1px solid ${withAlpha(T.text, 0.08)}`, borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: T.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>Post Preview</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                    {ticker && <TickerBadge ticker={ticker} T={T} />}
                    <ThesisTypeBadge type={thesisType} T={T} />
                    <ConvictionBadge conviction={conviction} T={T} />
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: T.text, marginBottom: 6 }}>{title || "Your headline…"}</div>
                  <div style={{ fontSize: 13, color: T.subtext, lineHeight: 1.55 }}>{stripMarkdown(body).slice(0, 120) || "Your analysis preview…"}</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: isMobile ? "14px 20px" : "18px 32px", borderTop: `1px solid ${withAlpha(T.text, 0.08)}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: T.surface }}>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 1 && <button onClick={() => setStep(s => s - 1)} type="button" style={{ padding: "10px 20px", background: "none", border: `1px solid ${withAlpha(T.text, 0.12)}`, borderRadius: 10, color: T.subtext, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>← Back</button>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {step < 3
              ? <button onClick={() => setStep(s => s + 1)} type="button" style={{ padding: "10px 24px", background: T.accent, color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Continue →</button>
              : <button onClick={submit} disabled={submitting} type="button" style={{ padding: "12px 32px", background: T.accent, color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: `0 6px 20px ${withAlpha(T.accent, 0.3)}`, opacity: submitting ? 0.6 : 1 }}>{submitting ? "Publishing…" : "🚀 Publish Thesis"}</button>
            }
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Thread View ──────────────────────────────────────────────────────────────
function ThreadView({ thread: initialThread, session, onBack, onLoginRequired, onTickerClick, addToast, T }) {
  const { isMobile } = useViewport(); const getToken = useToken();
  const [thread, setThread] = useState(initialThread);
  const [replies, setReplies] = useState([]);
  const [loadingReplies, setLoadingReplies] = useState(true);
  const [showReplyComposer, setShowReplyComposer] = useState(false);
  const [userVotes, setUserVotes] = useState({});
  const [myThreadVote, setMyThreadVote] = useState(0);
  const [replySort, setReplySort] = useState("oldest");
  const [showEditComposer, setShowEditComposer] = useState(false);
  const [confirmDeleteThread, setConfirmDeleteThread] = useState(false);
  const [deletingThread, setDeletingThread] = useState(false);
  const isAuthor = session?.user?.id && thread.author_id === session.user.id;
  const convMeta = CONVICTION_META[thread.conviction_score >= 80 ? "high" : thread.conviction_score >= 50 ? "medium" : "low"] || CONVICTION_META.low;

  const displayedReplies = useMemo(() => {
    let sorted = [...replies];
    if (replySort === "newest") sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    else if (replySort === "top") sorted.sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0));
    else sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const roots = []; const byId = new Map(sorted.map(r => [r.id, { ...r, children: [] }]));
    byId.forEach(r => { if (r.parent_reply_id && byId.has(r.parent_reply_id)) byId.get(r.parent_reply_id).children.push(r); else roots.push(r); });
    return roots;
  }, [replies, replySort]);

  const loadReplies = useCallback(async () => {
    setLoadingReplies(true);
    try {
      const data = await sbFetch(`forum_replies?thread_id=eq.${thread.id}&order=created_at.asc`, {}, await getToken());
      setReplies(Array.isArray(data) ? data : []);
      if (session && data.length) {
        const votes = await sbFetch(`forum_votes?user_id=eq.${session.user.id}&target_type=eq.reply&target_id=in.(${data.map(r => r.id).join(",")})`, {}, await getToken()).catch(() => []);
        const vmap = {}; votes.forEach(v => vmap[v.target_id] = v.vote); setUserVotes(vmap);
        const tv = await sbFetch(`forum_votes?user_id=eq.${session.user.id}&target_id=eq.${thread.id}&target_type=eq.thread`, {}, await getToken()).catch(() => []);
        setMyThreadVote(tv?.[0]?.vote ?? 0);
      }
    } catch (err) { console.error(err); }
    finally { setLoadingReplies(false); }
  }, [thread.id, session, getToken]);

  useEffect(() => { loadReplies(); }, [loadReplies]);

  useEffect(() => {
    const ch1 = supabase.channel(`thread:${thread.id}`).on("postgres_changes", { event: "UPDATE", schema: "public", table: "forum_threads", filter: `id=eq.${thread.id}` }, p => setThread(t => ({ ...t, ...p.new }))).subscribe();
    const ch2 = supabase.channel(`replies:${thread.id}`).on("postgres_changes", { event: "*", schema: "public", table: "forum_replies", filter: `thread_id=eq.${thread.id}` }, () => loadReplies()).subscribe();
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, [thread.id, loadReplies]);

  const handleVote = useCallback(async (tid, ty, vote) => {
    if (!session) return;
    const prev = ty === "thread" ? myThreadVote : (userVotes[tid] ?? 0);
    const newVote = prev === vote ? 0 : vote;
    if (ty === "thread") {
      setMyThreadVote(newVote);
      const upDelta = (newVote === 1 ? 1 : 0) - (prev === 1 ? 1 : 0);
      const downDelta = (newVote === -1 ? 1 : 0) - (prev === -1 ? 1 : 0);
      setThread(t => ({ ...t, upvotes: Math.max(0, (t.upvotes || 0) + upDelta), downvotes: Math.max(0, (t.downvotes || 0) + downDelta) }));
    } else {
      const upDelta = (newVote === 1 ? 1 : 0) - (prev === 1 ? 1 : 0);
      const downDelta = (newVote === -1 ? 1 : 0) - (prev === -1 ? 1 : 0);
      setUserVotes(v => ({ ...v, [tid]: newVote }));
      setReplies(rs => rs.map(r => r.id !== tid ? r : { ...r, upvotes: Math.max(0, (r.upvotes || 0) + upDelta), downvotes: Math.max(0, (r.downvotes || 0) + downDelta) }));
    }
    try {
      const targetId = ty === "thread" ? thread.id : tid;
      if (newVote === 0) {
        await sbFetch(`forum_votes?user_id=eq.${session.user.id}&target_id=eq.${targetId}&target_type=eq.${ty}`, { method: "DELETE" }, await getToken());
      } else {
        await sbFetch("forum_votes", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ user_id: session.user.id, target_id: targetId, target_type: ty, vote: newVote }) }, await getToken());
      }
    } catch (err) { console.error("Vote failed:", err); }
  }, [session, myThreadVote, userVotes, thread.id, getToken]);

  const handleDeleteThread = async () => {
    setDeletingThread(true);
    try {
      await sbFetch(`forum_threads?id=eq.${thread.id}`, { method: "DELETE" }, await getToken());
      addToast("Thread deleted.");
      onBack();
    } catch (err) { console.error(err); setDeletingThread(false); setConfirmDeleteThread(false); }
  };

  const handleToggleBookmark = useCallback(async () => {
    if (!session) return;
    const prevSaved = !!thread.is_saved;
    const nextSaved = !prevSaved;
    setThread(t => ({ ...t, is_saved: nextSaved }));
    try {
      const token = await getToken();
      if (nextSaved) {
        await sbFetch("forum_bookmarks", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates" },
          body: JSON.stringify({ user_id: session.user.id, thread_id: thread.id }),
        }, token);
        addToast("Saved to bookmarks.");
      } else {
        await sbFetch(`forum_bookmarks?user_id=eq.${session.user.id}&thread_id=eq.${thread.id}`, { method: "DELETE" }, token);
        addToast("Removed from saved.");
      }
    } catch (err) {
      console.error("Bookmark update failed:", err);
      setThread(t => ({ ...t, is_saved: prevSaved }));
      addToast("Could not update saved posts.", "error");
    }
  }, [session, thread.id, thread.is_saved, getToken, addToast]);

  return (
    <div style={{ flex: 1, overflowY: "auto", background: T.bg, fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: isMobile ? "16px 16px 140px" : "32px 32px 80px" }}>
        {/* Back + Actions */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: T.surface, border: `1px solid ${withAlpha(T.text, 0.08)}`, borderRadius: 8, color: T.subtext, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>← Back</button>
          {isAuthor && (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowEditComposer(true)} style={{ padding: "8px 14px", background: T.mutedFill, border: `1px solid ${withAlpha(T.text, 0.08)}`, borderRadius: 8, color: T.subtext, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Edit</button>
              {confirmDeleteThread
                ? <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <button onClick={handleDeleteThread} disabled={deletingThread} style={{ padding: "8px 14px", background: T.red, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 800 }}>{deletingThread ? "…" : "Delete"}</button>
                    <button onClick={() => setConfirmDeleteThread(false)} style={{ padding: "8px 12px", background: "none", border: `1px solid ${withAlpha(T.text, 0.1)}`, borderRadius: 8, color: T.subtext, cursor: "pointer", fontSize: 13 }}>Cancel</button>
                  </div>
                : <button onClick={() => setConfirmDeleteThread(true)} style={{ padding: "8px 14px", background: withAlpha(T.red, 0.1), border: `1px solid ${withAlpha(T.red, 0.2)}`, borderRadius: 8, color: T.red, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Delete</button>
              }
            </div>
          )}
        </div>

        {/* OP Card */}
        <div style={{ background: T.surface, border: `1px solid ${withAlpha(T.text, 0.08)}`, borderRadius: 18, marginBottom: 20, overflow: "hidden", position: "relative" }}>
          {/* Top accent bar */}
          <div style={{ height: 3, background: `linear-gradient(90deg, ${T.accent}, ${withAlpha(T.accent, 0.3)})` }} />

          <div style={{ padding: isMobile ? "20px 18px" : "28px 32px" }}>
            {/* Tags row */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
              {thread.ticker && <TickerBadge ticker={thread.ticker} T={T} onTickerClick={onTickerClick} size="lg" />}
              {thread.thesis_type && <ThesisTypeBadge type={thread.thesis_type} T={T} />}
              {thread.conviction_score != null && <ConvictionBadge conviction={thread.conviction_score >= 80 ? "high" : thread.conviction_score >= 50 ? "medium" : "low"} T={T} />}
              {(thread.tags || []).map(tag => {
                const tm = TAG_META[tag] || {};
                return <span key={tag} style={{ fontSize: 10, fontWeight: 700, color: tm.color || T.subtext, background: tm.bg || T.mutedFill, borderRadius: 5, padding: "2px 8px" }}>{tag}</span>;
              })}
            </div>

            {/* Title */}
            <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 900, color: T.text, margin: "0 0 16px", lineHeight: 1.25, letterSpacing: "-0.025em" }}>{thread.title}</h1>

            {/* Author row */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${withAlpha(T.text, 0.06)}` }}>
              <Avatar name={thread.author_display_name} size={36} T={T} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{thread.author_display_name || "Anonymous"}</div>
                <div style={{ fontSize: 11, color: T.muted }}>{timeAgo(thread.created_at)}</div>
              </div>
            </div>

            {/* Structured Thesis Sections */}
            {(thread.bull_case || thread.bear_case || thread.risks) && (
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : (thread.bull_case && thread.bear_case ? "1fr 1fr" : "1fr"), gap: 12, marginBottom: 20 }}>
                {thread.bull_case && (
                  <div style={{ background: withAlpha(T.green, 0.06), border: `1px solid ${withAlpha(T.green, 0.15)}`, borderRadius: 12, padding: "14px 16px" }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: T.green, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>🟢 Bull Case</div>
                    <div style={{ fontSize: 13, color: T.text, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(thread.bull_case) }} />
                  </div>
                )}
                {thread.bear_case && (
                  <div style={{ background: withAlpha(T.red, 0.05), border: `1px solid ${withAlpha(T.red, 0.15)}`, borderRadius: 12, padding: "14px 16px" }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: T.red, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>🔴 Bear Case</div>
                    <div style={{ fontSize: 13, color: T.text, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(thread.bear_case) }} />
                  </div>
                )}
                {thread.risks && (
                  <div style={{ background: withAlpha(T.amber, 0.06), border: `1px solid ${withAlpha(T.amber, 0.15)}`, borderRadius: 12, padding: "14px 16px", gridColumn: isMobile ? "1" : "1 / -1" }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: T.amber, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>⚠️ Key Risks</div>
                    <div style={{ fontSize: 13, color: T.text, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(thread.risks) }} />
                  </div>
                )}
              </div>
            )}

            {/* Main body */}
            <div style={{ fontSize: isMobile ? 14 : 15, color: T.text, lineHeight: 1.78 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(thread.body) }} />

            <MediaPreview items={thread.media_urls || []} T={T} />

            {/* Target metrics row */}
            {(thread.target_price || thread.time_horizon || thread.expected_cagr) && (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 20, paddingTop: 16, borderTop: `1px solid ${withAlpha(T.text, 0.06)}` }}>
                {thread.target_price && (
                  <div style={{ background: T.mutedFill, borderRadius: 10, padding: "10px 14px" }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: T.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>Target Price</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: T.accent, fontFamily: "'IBM Plex Mono', monospace" }}>₹{Number(thread.target_price).toLocaleString("en-IN")}</div>
                  </div>
                )}
                {thread.time_horizon && (
                  <div style={{ background: T.mutedFill, borderRadius: 10, padding: "10px 14px" }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: T.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>Horizon</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>{thread.time_horizon}</div>
                  </div>
                )}
                {thread.expected_cagr && (
                  <div style={{ background: T.posFill, borderRadius: 10, padding: "10px 14px", border: `1px solid ${withAlpha(T.green, 0.15)}` }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: T.green, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>Expected CAGR</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: T.green, fontFamily: "'IBM Plex Mono', monospace" }}>~{thread.expected_cagr}%</div>
                  </div>
                )}
              </div>
            )}

            {/* Footer actions */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 20, paddingTop: 16, borderTop: `1px solid ${withAlpha(T.text, 0.06)}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <VoteButton upvotes={thread.upvotes} downvotes={thread.downvotes} userVote={myThreadVote} onVote={session ? (v) => handleVote(thread.id, "thread", v) : null} onLoginRequired={onLoginRequired} T={T} />
                <BookmarkButton isSaved={!!thread.is_saved} onToggle={session ? handleToggleBookmark : null} onLoginRequired={onLoginRequired} T={T} />
                <StatPill icon="💬" value={thread.reply_count || 0} T={T} />
                {thread.view_count > 0 && <StatPill icon="👁" value={thread.view_count} T={T} />}
              </div>
            </div>
          </div>
        </div>

        {/* Reply Composer */}
        {session && (
          <div style={{ background: T.surface, border: `1px solid ${withAlpha(T.text, 0.08)}`, borderRadius: 14, padding: isMobile ? "16px" : "20px 24px", marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: T.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>Add to Discussion</div>
            <ReplyComposer threadId={thread.id} session={session} T={T} isMobile={isMobile} onSubmitted={() => { loadReplies(); addToast("Reply posted! ✓"); }} />
          </div>
        )}

        {/* Replies section */}
        {(replies.length > 0 || loadingReplies) && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>{replies.length} {replies.length === 1 ? "Reply" : "Replies"}</div>
              <select value={replySort} onChange={e => setReplySort(e.target.value)} style={{ background: T.surface, color: T.text, border: `1px solid ${withAlpha(T.text, 0.1)}`, borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, outline: "none", cursor: "pointer" }}>
                <option value="oldest">Oldest</option>
                <option value="newest">Newest</option>
                <option value="top">Top Voted</option>
              </select>
            </div>

            {loadingReplies ? [1, 2].map(i => <SkeletonCard key={i} T={T} />) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {displayedReplies.map((reply, idx) => (
                  <ReplyCard
                    key={reply.id} reply={reply} threadId={thread.id} session={session}
                    userVotes={userVotes} onVote={handleVote} onLoginRequired={onLoginRequired}
                    T={T} isMobile={isMobile} postIndex={idx + 2} totalPosts={1 + replies.length}
                    onReplyPosted={() => { loadReplies(); }}
                    onReplyDeleted={(id) => setReplies(rs => rs.filter(r => r.id !== id))}
                    onReplyUpdated={(id, newBody) => setReplies(rs => rs.map(r => r.id === id ? { ...r, body: newBody } : r))}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {!session && (
          <div style={{ textAlign: "center", padding: "32px", background: T.surface, borderRadius: 14, border: `1px solid ${withAlpha(T.text, 0.07)}` }}>
            <div style={{ fontSize: 14, color: T.subtext, marginBottom: 12 }}>Join the discussion</div>
            <button onClick={onLoginRequired} style={{ padding: "10px 28px", background: T.accent, color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>Log In to Reply</button>
          </div>
        )}
      </div>

      {showEditComposer && (
        <EditThreadComposer thread={thread} session={session} T={T} onClose={() => setShowEditComposer(false)} onSaved={(updated) => { setThread(t => ({ ...t, ...updated })); addToast("Updated ✓"); }} />
      )}
    </div>
  );
}

// ─── Edit Composer ────────────────────────────────────────────────────────────
function EditThreadComposer({ thread, session, T, onClose, onSaved }) {
  const { isMobile } = useViewport(); const getToken = useToken();
  const [step, setStep] = useState(1);
  const [ticker, setTicker] = useState(thread.ticker || "");
  const [title, setTitle] = useState(thread.title || "");
  const [body, setBody] = useState(thread.body || "");
  const [thesisType, setThesisType] = useState(thread.thesis_type || "Bullish");
  const [tags, setTags] = useState(thread.tags || []);
  const [bullCase, setBullCase] = useState(thread.bull_case || "");
  const [bearCase, setBearCase] = useState(thread.bear_case || "");
  const [risks, setRisks] = useState(thread.risks || "");
  const [targetPrice, setTargetPrice] = useState(thread.target_price != null ? String(thread.target_price) : "");
  const [timeHorizon, setTimeHorizon] = useState(thread.time_horizon || "");
  const [expectedCagr, setExpectedCagr] = useState(thread.expected_cagr != null ? String(thread.expected_cagr) : "");
  const convictionKey = thread.conviction_score >= 80 ? "high" : thread.conviction_score >= 50 ? "medium" : "low";
  const [conviction, setConviction] = useState(convictionKey);
  const [previewMode, setPreviewMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const textRef = useRef();

  const submit = async () => {
    if (!title.trim() || !body.trim()) { setError("Title and analysis are required."); return; }
    setSubmitting(true); setError("");
    try {
      const convScore = CONVICTION_META[conviction]?.score || 50;
      const payload = {
        ticker: ticker.toUpperCase().trim() || null,
        title: title.trim(), body: body.trim(),
        thesis_type: thesisType, tags,
        conviction_score: convScore,
        bull_case: bullCase.trim() || null, bear_case: bearCase.trim() || null,
        risks: risks.trim() || null,
        target_price: targetPrice ? parseFloat(targetPrice) : null,
        time_horizon: timeHorizon.trim() || null,
        expected_cagr: expectedCagr ? parseFloat(expectedCagr) : null,
        updated_at: new Date().toISOString(),
      };
      const res = await sbFetch(`forum_threads?id=eq.${thread.id}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload) }, await getToken());
      onSaved?.(Array.isArray(res) ? res[0] : res); onClose();
    } catch (err) { console.error(err); setError(err.message || "Save failed."); } finally { setSubmitting(false); }
  };

  const inputStyle = { width: "100%", padding: "11px 14px", borderRadius: 10, border: `1px solid ${withAlpha(T.text, 0.1)}`, background: T.mutedFill, color: T.text, fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" };
  const labelStyle = { fontSize: 10, fontWeight: 800, color: T.muted, textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 6 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", backdropFilter: "blur(16px)", zIndex: 1000, display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 24, fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <div style={{ background: T.bg, width: "100%", maxWidth: 860, maxHeight: isMobile ? "96vh" : "92vh", borderRadius: isMobile ? "20px 20px 0 0" : 20, display: "flex", flexDirection: "column", overflow: "hidden", border: `1px solid ${withAlpha(T.text, 0.1)}` }}>

        {/* Header */}
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${withAlpha(T.text, 0.08)}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 900, color: T.text, margin: 0, letterSpacing: "-0.02em" }}>Edit Investment Thesis</h2>
            <p style={{ fontSize: 12, color: T.muted, margin: "2px 0 0" }}>All fields are editable — update any part of your thesis.</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 22, lineHeight: 1 }}>✕</button>
        </div>

        {/* Step tabs — identical to ThreadComposer */}
        <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${withAlpha(T.text, 0.08)}`, padding: "0 24px" }}>
          {[{ n: 1, label: "Basics" }, { n: 2, label: "Thesis" }, { n: 3, label: "Conviction" }].map(s => (
            <button key={s.n} onClick={() => setStep(s.n)} style={{ padding: "10px 20px", border: "none", background: "transparent", color: step === s.n ? T.accent : T.muted, fontSize: 13, fontWeight: step === s.n ? 800 : 500, cursor: "pointer", borderBottom: step === s.n ? `2px solid ${T.accent}` : "2px solid transparent", marginBottom: -1 }}>
              {s.n}. {s.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "20px 16px" : "28px 32px" }}>
          {error && <div style={{ marginBottom: 16, padding: "10px 14px", background: withAlpha(T.red, 0.1), borderRadius: 8, color: T.red, fontSize: 13 }}>⚠ {error}</div>}

          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={labelStyle}>Ticker</label>
                  <TickerAutocomplete value={ticker} onChange={setTicker} inputStyle={inputStyle} T={T} />
                </div>
                <div>
                  <label style={labelStyle}>Thesis Type</label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {THESIS_TYPES.map(type => {
                      const color = type === "Bullish" ? T.green : type === "Bearish" ? T.red : T.accent;
                      return (
                        <button key={type} onClick={() => setThesisType(type)} type="button" style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${thesisType === type ? color : withAlpha(T.text, 0.1)}`, background: thesisType === type ? withAlpha(color, 0.12) : T.mutedFill, color: thesisType === type ? color : T.subtext, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                          {type}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Headline</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="A compelling one-line investment case…" style={{ ...inputStyle, fontSize: isMobile ? 16 : 18, fontWeight: 800, letterSpacing: "-0.01em" }} />
              </div>

              <div>
                <label style={labelStyle}>Tags</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["Thesis", "Risk", "Fundamental", "Technical", "Macro", "News"].map(tag => (
                    <button key={tag} onClick={() => setTags(p => p.includes(tag) ? p.filter(t => t !== tag) : [...p, tag])} type="button" style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${tags.includes(tag) ? T.accent : withAlpha(T.text, 0.1)}`, background: tags.includes(tag) ? withAlpha(T.accent, 0.1) : T.mutedFill, color: tags.includes(tag) ? T.accent : T.subtext, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Analysis</label>
                  <div style={{ display: "flex", background: T.mutedFill, borderRadius: 6, padding: 2 }}>
                    <button onClick={() => setPreviewMode(false)} type="button" style={{ padding: "3px 10px", borderRadius: 4, border: "none", background: !previewMode ? T.surface : "transparent", color: !previewMode ? T.text : T.subtext, fontSize: 10, fontWeight: 800, cursor: "pointer" }}>Write</button>
                    <button onClick={() => setPreviewMode(true)} type="button" style={{ padding: "3px 10px", borderRadius: 4, border: "none", background: previewMode ? T.surface : "transparent", color: previewMode ? T.text : T.subtext, fontSize: 10, fontWeight: 800, cursor: "pointer" }}>Preview</button>
                  </div>
                </div>
                <div style={{ border: `1px solid ${withAlpha(T.text, 0.1)}`, borderRadius: 12, overflow: "hidden", background: T.surface }}>
                  <MarkdownToolbar textareaRef={textRef} value={body} onChange={setBody} T={T} />
                  {previewMode
                    ? <div style={{ padding: "14px 16px", minHeight: 180, fontSize: 14, lineHeight: 1.7, color: T.text }} dangerouslySetInnerHTML={{ __html: renderMarkdown(body) || "<span style='opacity:0.4'>Empty</span>" }} />
                    : <textarea ref={textRef} value={body} onChange={e => setBody(e.target.value)} placeholder="Your detailed investment analysis…" style={{ width: "100%", minHeight: 200, border: "none", outline: "none", padding: "14px 16px", fontSize: 14, color: T.text, background: "transparent", resize: "vertical", fontFamily: "inherit", lineHeight: 1.7, boxSizing: "border-box" }} />
                  }
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ background: T.surface, border: `1px solid ${withAlpha(T.text, 0.07)}`, borderRadius: 12, padding: 16 }}>
                <p style={{ fontSize: 12, color: T.muted, margin: "0 0 16px", lineHeight: 1.6 }}>Structure your thesis like a professional research note. Fill as many sections as relevant.</p>
                {[
                  { label: "Bull Case", val: bullCase, set: setBullCase, placeholder: "Key reasons why this investment should work…", color: T.green },
                  { label: "Bear Case", val: bearCase, set: setBearCase, placeholder: "Key risks or reasons this may not work…", color: T.red },
                  { label: "Key Risks", val: risks, set: setRisks, placeholder: "Regulatory, competitive, macro, execution risks…", color: T.amber },
                ].map(({ label, val, set, placeholder, color }) => (
                  <div key={label} style={{ marginBottom: 16 }}>
                    <label style={{ ...labelStyle, color }}>{label}</label>
                    <textarea value={val} onChange={e => set(e.target.value)} placeholder={placeholder} style={{ ...inputStyle, minHeight: 80, resize: "vertical", lineHeight: 1.6 }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <label style={labelStyle}>Conviction Level</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 8 }}>
                  {Object.entries(CONVICTION_META).map(([key, meta]) => (
                    <button key={key} onClick={() => setConviction(key)} type="button" style={{ padding: "14px 12px", borderRadius: 12, border: `2px solid ${conviction === key ? meta.color : withAlpha(T.text, 0.1)}`, background: conviction === key ? withAlpha(meta.color, 0.1) : T.surface, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, transition: "all 0.15s" }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: meta.color }} />
                      <span style={{ fontSize: 11, fontWeight: 800, color: conviction === key ? meta.color : T.subtext }}>{meta.label}</span>
                      <span style={{ fontSize: 20, fontWeight: 900, color: meta.color, fontFamily: "'IBM Plex Mono', monospace" }}>{meta.score}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Target Price (₹)</label>
                  <input type="number" value={targetPrice} onChange={e => setTargetPrice(e.target.value)} placeholder="e.g. 2500" style={{ ...inputStyle, fontFamily: "'IBM Plex Mono', monospace" }} />
                </div>
                <div>
                  <label style={labelStyle}>Time Horizon</label>
                  <input value={timeHorizon} onChange={e => setTimeHorizon(e.target.value)} placeholder="e.g. 12–18 months" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Expected CAGR (%)</label>
                  <input type="number" value={expectedCagr} onChange={e => setExpectedCagr(e.target.value)} placeholder="e.g. 25" style={{ ...inputStyle, fontFamily: "'IBM Plex Mono', monospace" }} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 24px", borderTop: `1px solid ${withAlpha(T.text, 0.08)}`, background: T.surface, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 1 && <button onClick={() => setStep(s => s - 1)} type="button" style={{ padding: "10px 20px", background: T.mutedFill, border: `1px solid ${withAlpha(T.text, 0.1)}`, borderRadius: 10, color: T.subtext, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>← Back</button>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {step < 3
              ? <button onClick={() => setStep(s => s + 1)} type="button" style={{ padding: "10px 24px", background: T.accent, color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Continue →</button>
              : <button onClick={submit} disabled={submitting} style={{ padding: "10px 28px", background: T.accent, color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer", opacity: submitting ? 0.6 : 1 }}>{submitting ? "Saving…" : "Save Changes"}</button>
            }
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Forum Feed ───────────────────────────────────────────────────────────────
function ForumFeed({ session, onViewThread, onNewThread, onLoginRequired, onTickerClick, T, addToast }) {
  const { isMobile, isTablet } = useViewport(); const getToken = useToken();
  const [threads, setThreads] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all"); const [sort, setSort] = useState("latest");
  const [search, setSearch] = useState(""); const [searchDebounced, setSearchDebounced] = useState("");
  const [page, setPage] = useState(1); const [userVotes, setUserVotes] = useState({});
  const searchTimer = useRef();

  useEffect(() => { clearTimeout(searchTimer.current); searchTimer.current = setTimeout(() => setSearchDebounced(search), 300); return () => clearTimeout(searchTimer.current); }, [search]);

  useEffect(() => {
    if (!session && (filter === "mine" || filter === "saved")) {
      setFilter("all");
      setPage(1);
    }
  }, [session, filter]);

  const loadThreads = useCallback(async (backgroundRefresh = false) => {
    const cacheKey = `${FORUM_CACHE_KEY}_${sort}_${filter}_${session?.user?.id || "anon"}`;
    const canUseCache = filter !== "saved";
    // On first load: show cache immediately, skip spinner
    if (!backgroundRefresh && canUseCache) {
      const cached = readForumCache(cacheKey);
      if (cached) {
        setThreads(cached.data);
        setLoading(false);
        if (!cached.stale) return; // fresh — no network call needed
        // Stale: fall through to background revalidation without showing spinner
      } else {
        setLoading(true);
      }
    }
    setError(null);
    try {
      const token = await getToken();
      const orderMap = { latest: "created_at.desc", top: "upvotes.desc", discussed: "reply_count.desc" };
      let threads = [];
      if (filter === "saved" && session) {
        const bookmarks = await fetchUserBookmarks(session.user.id, token);
        const bookmarkedIds = bookmarks.map(b => b.thread_id).filter(Boolean);
        if (bookmarkedIds.length > 0) {
          const data = await sbFetch(`forum_threads?select=*&id=in.(${bookmarkedIds.join(",")})`, {}, token);
          const fetched = Array.isArray(data) ? data : [];
          const fetchMap = new Map(fetched.map(t => [t.id, t]));
          const bookmarkMap = new Map(bookmarks.map(b => [b.thread_id, b.created_at]));
          threads = bookmarkedIds.map(id => fetchMap.get(id)).filter(Boolean).map(t => ({
            ...t,
            is_saved: true,
            saved_at: bookmarkMap.get(t.id) || null,
          }));
          threads = sortSavedThreads(threads, sort);
        }
      } else {
        let qs = `forum_threads?select=*&order=is_pinned.desc,${orderMap[sort] || "created_at.desc"}`;
        if (filter === "mine" && session) qs += `&author_id=eq.${session.user.id}`;
        if (filter === "trending") qs += `&upvotes=gt.0`;
        const data = await sbFetch(qs, {}, token);
        threads = Array.isArray(data) ? data : [];
      }
      const bookmarkRows = session && threads.length ? await fetchUserBookmarks(session.user.id, token, threads.map(t => t.id)) : [];
      const enrichedThreads = session ? applySavedFlags(threads, bookmarkRows) : threads;
      // Only update if data actually changed (avoids needless re-renders)
      setThreads(prev => {
        const prevIds = prev.map(t => `${t.id}:${t.upvotes}:${t.reply_count}:${t.is_saved ? 1 : 0}`).join();
        const nextIds = enrichedThreads.map(t => `${t.id}:${t.upvotes}:${t.reply_count}:${t.is_saved ? 1 : 0}`).join();
        return prevIds === nextIds ? prev : enrichedThreads;
      });
      if (filter !== "saved") writeForumCache(cacheKey, enrichedThreads);
      if (session && enrichedThreads.length) {
        const votes = await sbFetch(`forum_votes?user_id=eq.${session.user.id}&target_type=eq.thread&target_id=in.(${enrichedThreads.map(t => t.id).join(",")})`, {}, token).catch(() => []);
        const vmap = {}; votes.forEach(v => vmap[v.target_id] = v.vote); setUserVotes(vmap);
      }
    } catch (err) {
        const isJwtExpired = err.message?.includes("JWT expired") || err.message?.includes("PGRST303");
        if (isJwtExpired) {
            await supabase.auth.signOut();
            return; // App's auth listener will handle redirect
        }
        if (!backgroundRefresh) setError(err.message);
    } finally {
      if (!backgroundRefresh) setLoading(false);
    }
  }, [sort, filter, session, getToken]);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  // Background revalidation every 60s — keeps data fresh without any visible blink
  useEffect(() => {
    const id = setInterval(() => loadThreads(true), 60_000);
    return () => clearInterval(id);
  }, [loadThreads]);

  // Realtime — updates wrapped in startTransition so they render in background without blinking
  useEffect(() => {
    const ch = supabase.channel("forum:feed")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "forum_threads" }, p => {
        startTransition(() => setThreads(ts => ts.map(t => t.id === p.new.id ? { ...t, ...p.new } : t)));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "forum_threads" }, p => {
        startTransition(() => setThreads(ts => ts.find(t => t.id === p.new.id) ? ts : [p.new, ...ts]));
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  const handleVote = useCallback(async (tid, ty, vote) => {
    if (!session) return;
    const prev = userVotes[tid] ?? 0; const newVote = prev === vote ? 0 : vote;
    const upDelta = (newVote === 1 ? 1 : 0) - (prev === 1 ? 1 : 0);
    const downDelta = (newVote === -1 ? 1 : 0) - (prev === -1 ? 1 : 0);
    setUserVotes(v => ({ ...v, [tid]: newVote }));
    setThreads(ts => ts.map(t => t.id !== tid ? t : { ...t, upvotes: Math.max(0, (t.upvotes || 0) + upDelta), downvotes: Math.max(0, (t.downvotes || 0) + downDelta) }));
    try {
      if (newVote === 0) {
        await sbFetch(`forum_votes?user_id=eq.${session.user.id}&target_id=eq.${tid}&target_type=eq.${ty}`, { method: "DELETE" }, await getToken());
      } else {
        await sbFetch("forum_votes", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ user_id: session.user.id, target_id: tid, target_type: ty, vote: newVote }) }, await getToken());
      }
    } catch (err) {
      console.error("Vote failed:", err);
      setUserVotes(v => ({ ...v, [tid]: prev }));
      setThreads(ts => ts.map(t => t.id !== tid ? t : { ...t, upvotes: Math.max(0, (t.upvotes || 0) - upDelta), downvotes: Math.max(0, (t.downvotes || 0) - downDelta) }));
    }
  }, [session, userVotes, getToken]);

  const handleToggleBookmark = useCallback(async (tid) => {
    if (!session) return;
    const current = threads.find(t => t.id === tid);
    const prevSaved = !!current?.is_saved;
    const nextSaved = !prevSaved;
    const cacheKey = `${FORUM_CACHE_KEY}_${sort}_${filter}_${session?.user?.id || "anon"}`;
    let nextThreads = null;
    setThreads(ts => {
      if (filter === "saved" && !nextSaved) return ts.filter(t => t.id !== tid);
      const updated = ts.map(t => t.id !== tid ? t : { ...t, is_saved: nextSaved, saved_at: nextSaved ? (t.saved_at || new Date().toISOString()) : null });
      nextThreads = updated;
      return updated;
    });
    try {
      const token = await getToken();
      if (nextSaved) {
        await sbFetch("forum_bookmarks", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates" },
          body: JSON.stringify({ user_id: session.user.id, thread_id: tid }),
        }, token);
        if (filter === "saved") setThreads(ts => sortSavedThreads(ts, sort));
        addToast("Saved to bookmarks.");
      } else {
        await sbFetch(`forum_bookmarks?user_id=eq.${session.user.id}&thread_id=eq.${tid}`, { method: "DELETE" }, token);
        addToast("Removed from saved.");
      }
      if (filter !== "saved" && Array.isArray(nextThreads)) writeForumCache(cacheKey, nextThreads);
    } catch (err) {
      console.error("Bookmark update failed:", err);
      setThreads(ts => {
        if (filter === "saved" && !prevSaved) return ts;
        const reverted = ts.map(t => t.id !== tid ? t : { ...t, is_saved: prevSaved, saved_at: prevSaved ? t.saved_at : null });
        if (filter !== "saved") writeForumCache(cacheKey, reverted);
        return reverted;
      });
      addToast("Could not update saved posts.", "error");
    }
  }, [session, threads, filter, sort, getToken, addToast]);

  const displayed = useMemo(() => {
    let list = [...threads];
    if (searchDebounced.trim()) {
      const q = searchDebounced.toLowerCase();
      list = list.filter(t => t.title.toLowerCase().includes(q) || (t.ticker || "").toLowerCase().includes(q) || stripMarkdown(t.body).toLowerCase().includes(q) || (t.tags || []).some(tag => tag.toLowerCase().includes(q)));
    }
    return list;
  }, [threads, searchDebounced]);

  const paged = displayed.slice(0, page * PAGE_SIZE);
  const hasMore = displayed.length > page * PAGE_SIZE;
  const showSidebars = !isMobile && !isTablet;

  return (
    <div style={{ flex: 1, overflowY: "auto", background: T.bg, fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: isMobile ? "16px 16px 100px" : "32px 32px 80px" }}>
        {/* Page header */}
        <div style={{ marginBottom: isMobile ? 20 : 32 }}>
          <h1 style={{ fontSize: isMobile ? 28 : 36, fontWeight: 900, color: T.text, margin: 0, letterSpacing: "-0.04em" }}>Discussion Forum</h1>
          <p style={{ fontSize: 14, color: T.muted, marginTop: 4 }}>High-conviction theses · Professional research · Signal over noise</p>
        </div>

        {/* Sticky filter bar */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20, alignItems: "center", flexWrap: "wrap", position: "sticky", top: 0, zIndex: 20, background: `${withAlpha(T.bg, 0.92)}`, backdropFilter: "blur(20px)", padding: "10px 0", borderBottom: `1px solid ${withAlpha(T.text, 0.07)}` }}>
          {/* Search */}
          <div style={{ position: "relative", flex: isMobile ? "1 1 100%" : "0 0 260px" }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, opacity: 0.4 }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tickers, theses, tags…" style={{ width: "100%", padding: "9px 14px 9px 36px", borderRadius: 10, background: T.surface, border: `1px solid ${withAlpha(T.text, 0.08)}`, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>

          {/* Sort/filter tabs */}
          <div style={{ display: "flex", background: T.mutedFill, borderRadius: 9, padding: 2, overflowX: "auto", flexShrink: 0 }}>
            {[{ id: "all", label: "All" }, { id: "trending", label: "🔥 Hot" }, { id: "new", label: "⚡ New" }, ...(session ? [{ id: "mine", label: "My Posts" }] : [])].map(f => (
              <button key={f.id} onClick={() => { setFilter(f.id); setPage(1); }} style={{ padding: "7px 14px", borderRadius: 7, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", background: filter === f.id ? T.surface : "transparent", color: filter === f.id ? T.text : T.subtext, transition: "background 0.15s, color 0.15s, box-shadow 0.15s", whiteSpace: "nowrap", boxShadow: filter === f.id ? `0 2px 8px ${T.shadow}` : "none" }}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Sort select */}
          <select value={sort} onChange={e => { setSort(e.target.value); setPage(1); }} style={{ background: T.surface, color: T.text, border: `1px solid ${withAlpha(T.text, 0.08)}`, borderRadius: 9, padding: "7px 12px", fontSize: 12, fontWeight: 600, outline: "none", cursor: "pointer" }}>
            <option value="latest">Latest</option>
            <option value="top">Top Voted</option>
            <option value="discussed">Most Discussed</option>
          </select>

          {/* Mobile new thesis */}
          {isMobile && (
            <button onClick={session ? onNewThread : onLoginRequired} style={{ marginLeft: "auto", padding: "8px 16px", background: T.accent, color: "#fff", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>+ Thesis</button>
          )}
        </div>

        {/* Main layout */}
        <div style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
          {/* Left sidebar */}
          {showSidebars && (
            <LeftSidebar session={session} filter={filter} onFilterChange={(f) => { setFilter(f); setPage(1); }} onNewThread={onNewThread} onLoginRequired={onLoginRequired} T={T} />
          )}

          {/* Feed */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {loading && page === 1 ? (
              [1, 2, 3].map(i => <SkeletonCard key={i} T={T} />)
            ) : error ? (
              <div style={{ textAlign: "center", padding: 60, color: T.red }}>Error loading threads. {error}</div>
            ) : (
              <>
                {paged.map(t => (
                  <ThreadCard key={t.id} thread={t} T={T} session={session} userVotes={userVotes} onVote={handleVote} onLoginRequired={onLoginRequired} onTickerClick={onTickerClick} onToggleBookmark={handleToggleBookmark} onClick={() => onViewThread(t)} isMobile={isMobile} />
                ))}
                {hasMore && (
                  <div style={{ textAlign: "center", marginTop: 28, paddingBottom: 48 }}>
                    <button onClick={() => setPage(p => p + 1)} style={{ padding: "12px 40px", background: T.surface, border: `1px solid ${withAlpha(T.text, 0.1)}`, borderRadius: 12, color: T.text, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Load More</button>
                  </div>
                )}
                {displayed.length === 0 && (
                  <div style={{ textAlign: "center", padding: "80px 24px" }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>🕯️</div>
                    <div style={{ fontSize: 15, color: T.muted }}>{filter === "saved" && session ? "No saved posts yet." : "No discussions found."}</div>
                    {session && <button onClick={onNewThread} style={{ marginTop: 16, padding: "10px 24px", background: T.accent, color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>Start a Discussion</button>}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right sidebar */}
          {showSidebars && <RightSidebar threads={threads} T={T} onTickerClick={onTickerClick} />}
        </div>
      </div>

      {/* Mobile FAB */}
      {isMobile && (
        <button
          onClick={session ? onNewThread : onLoginRequired}
          style={{ position: "fixed", bottom: 24, right: 20, width: 56, height: 56, borderRadius: "50%", background: T.accent, color: "#fff", fontSize: 24, border: "none", boxShadow: `0 8px 28px ${withAlpha(T.accent, 0.45)}`, zIndex: 100, cursor: "pointer" }}
        >
          ✍️
        </button>
      )}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function ForumModule({ T, session, getToken: getTokenProp, onTickerClick, onLoginRequired: onLoginRequiredProp }) {
  const getToken = useCallback(async () => {
    if (getTokenProp) return getTokenProp();
    // Always fetch a live session so Supabase can auto-refresh an expired JWT
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  }, [getTokenProp]);
  const [view, setView] = useState("feed");
  const [activeThread, setActiveThread] = useState(null);
  const [showComposer, setShowComposer] = useState(false);
  const { toasts, addToast } = useToast();

  const handleLoginRequired = useCallback(() => {
    if (onLoginRequiredProp) onLoginRequiredProp(); else addToast("Please log in to continue", "error");
  }, [onLoginRequiredProp, addToast]);

  const handleViewThread = useCallback((t) => { setActiveThread(t); setView("thread"); window.scrollTo(0, 0); }, []);
  const handlePosted = useCallback((t) => { if (t) { setActiveThread(t); setView("thread"); addToast("Published! 🚀"); } }, [addToast]);

  return (
    <TokenContext.Provider value={getToken}>
      <style>{`
        @keyframes slideInBottom {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;700&family=IBM+Plex+Sans:wght@400;500;600;700;800;900&display=swap');
      `}</style>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, background: T.bg, minHeight: "100vh", position: "relative", fontFamily: "'IBM Plex Sans', sans-serif" }}>
        {view === "feed" && (
          <ForumFeed
            session={session} onViewThread={handleViewThread}
            onNewThread={() => setShowComposer(true)}
            onLoginRequired={handleLoginRequired}
            onTickerClick={onTickerClick}
            addToast={addToast} T={T}
          />
        )}
        {view === "thread" && activeThread && (
          <ThreadView
            thread={activeThread} session={session}
            onBack={() => { setView("feed"); setActiveThread(null); }}
            onLoginRequired={handleLoginRequired}
            onTickerClick={onTickerClick}
            addToast={addToast} T={T}
          />
        )}
        {showComposer && session && (
          <ThreadComposer session={session} T={T} onClose={() => setShowComposer(false)} onPosted={handlePosted} />
        )}
        <ToastContainer toasts={toasts} T={T} />
      </div>
    </TokenContext.Provider>
  );
}
