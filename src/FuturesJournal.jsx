import { useState, useEffect, useMemo, useRef, useCallback } from "react";

/* ─────────────────────────────────────────────────────────────────────────────
   FuturesJournal — "Trade Journal-FUT" page + "Futures Portfolio" dashboard block.
   Trades live in `fut_trades`; prices come from `fut_bhav_copy` (fo_bhav loader).
   default export <FuturesJournal view="trades" | "portfolio" ... />
   ───────────────────────────────────────────────────────────────────────────── */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const mono = { fontFamily: "'IBM Plex Mono', monospace" };
const num2 = (v) => Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num0 = (v) => Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const signed = (v, d = 2) => (v >= 0 ? "+" : "-") + Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtDate = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "");
const todayISO = () => new Date().toISOString().slice(0, 10);

/* ── REST helpers ─────────────────────────────────────────────────────────── */
async function sbGet(path, token) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token || SUPABASE_ANON_KEY}` },
        signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
}
async function sbWrite(method, path, token, body) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        method,
        headers: {
            "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`, Prefer: "return=representation",
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) throw new Error((data && (data.message || data.error)) || `HTTP ${r.status}`);
    return data;
}

let _latestDatePromise = null;
function fetchLatestFutDate() {
    if (!_latestDatePromise) {
        _latestDatePromise = sbGet("fut_bhav_copy?select=trade_date&order=trade_date.desc&limit=1")
            .then(r => (Array.isArray(r) && r[0] ? r[0].trade_date : null))
            .catch(() => { _latestDatePromise = null; return null; });
    }
    return _latestDatePromise;
}

/* ── Calculations ─────────────────────────────────────────────────────────── */
function calcFut(t) {
    const qty = (Number(t.lots) || 0) * (Number(t.lot_size) || 0);
    const sign = t.direction === "SHORT" ? -1 : 1;
    const entryVal = qty * Number(t.entry_price);
    const closed = !!t.exit_date && t.exit_price !== null && t.exit_price !== undefined && t.exit_price !== "";
    const exitVal = closed ? qty * Number(t.exit_price) : null;
    const pnl = closed ? sign * (exitVal - entryVal) : null;
    let days = closed ? Math.round((new Date(t.exit_date) - new Date(t.entry_date)) / 86400000) : null;
    if (days !== null && (!Number.isFinite(days) || days < 0 || days > 3650)) days = 0;   // bad/mistyped dates
    return { ...t, qty, sign, entryVal, exitVal, closed, pnl, days };
}
const priceKey = (symbol, expiry) => `${symbol}|${expiry}`;

/* ── Data hook ────────────────────────────────────────────────────────────── */
function useFutTrades({ session, isDemo, getToken: getTokenProp }) {
    // Parent passes an inline arrow (new identity every render); keep a stable wrapper
    // so reload() isn't re-created and the load effect doesn't loop.
    const tokenRef = useRef(getTokenProp);
    tokenRef.current = getTokenProp;
    const getToken = useCallback(() => tokenRef.current(), []);
    const [trades, setTrades] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const uid = session?.user?.id;

    const reload = useCallback(async () => {
        if (isDemo || !uid) { setLoading(false); return; }
        try {
            const token = await getToken();
            if (!token) throw new Error("no auth token yet");
            const rows = await sbGet("fut_trades?select=*&order=entry_date.desc,id.desc", token);
            setTrades(Array.isArray(rows) ? rows : []);
            setError("");
        } catch (e) {
            console.warn("[FuturesJournal] load failed:", e);
            setError(`Could not load futures trades (${e.message}). Check the fut_trades table/policies, then refresh.`);
        }
        setLoading(false);
    }, [uid, isDemo, getToken]);

    useEffect(() => { reload(); }, [reload]);

    // form: { id?, symbol, expiry_date, direction, lots, lot_size, entry_date, entry_price,
    //         exit_date, exit_lots, exit_price, notes }
    const save = useCallback(async (form) => {
        const lots = parseInt(form.lots, 10);
        const exitLots = form.exit_date && form.exit_lots ? parseInt(form.exit_lots, 10) : null;
        const partial = !!(form.exit_date && exitLots && exitLots < lots);
        const base = {
            symbol: form.symbol.trim().toUpperCase(),
            expiry_date: form.expiry_date,
            direction: form.direction,
            lot_size: parseInt(form.lot_size, 10),
            entry_date: form.entry_date,
            entry_price: parseFloat(form.entry_price),
            notes: form.notes || null,
        };
        const hasExit = !!(form.exit_date && form.exit_price !== "" && form.exit_price !== null);
        const closedRow = {
            ...base,
            lots: partial ? exitLots : lots,
            exit_date: hasExit ? form.exit_date : null,
            exit_price: hasExit ? parseFloat(form.exit_price) : null,
        };
        const remainder = partial && hasExit
            ? { ...base, lots: lots - exitLots, exit_date: null, exit_price: null } : null;

        if (isDemo) {
            setTrades(prev => {
                let next = form.id ? prev.map(t => (t.id === form.id ? { ...closedRow, id: t.id } : t)) : [{ ...closedRow, id: Date.now() }, ...prev];
                if (remainder) next = [{ ...remainder, id: Date.now() + 1 }, ...next];
                return next;
            });
            return;
        }
        const token = await getToken();
        if (form.id) await sbWrite("PATCH", `fut_trades?id=eq.${form.id}`, token, closedRow);
        else await sbWrite("POST", "fut_trades", token, { ...closedRow, user_id: uid });
        if (remainder) await sbWrite("POST", "fut_trades", token, { ...remainder, user_id: uid });
        await reload();
    }, [isDemo, getToken, uid, reload]);

    const remove = useCallback(async (id) => {
        if (!window.confirm("Delete this futures trade?")) return;
        if (isDemo) { setTrades(t => t.filter(x => x.id !== id)); return; }
        const token = await getToken();
        await sbWrite("DELETE", `fut_trades?id=eq.${id}`, token);
        setTrades(t => t.filter(x => x.id !== id));
    }, [isDemo, getToken]);

    const importRows = useCallback(async (rows) => {
        if (isDemo) { setTrades(prev => [...rows.map((r, i) => ({ ...r, id: Date.now() + i })), ...prev]); return rows.length; }
        const token = await getToken();
        for (let i = 0; i < rows.length; i += 200) {
            await sbWrite("POST", "fut_trades", token, rows.slice(i, i + 200).map(r => ({ ...r, user_id: uid })));
        }
        await reload();
        return rows.length;
    }, [isDemo, getToken, uid, reload]);

    return { trades, loading, error, save, remove, importRows, reload };
}

/* ── Live prices from fut_bhav_copy ───────────────────────────────────────── */
function useFutPrices(openTrades) {
    const [prices, setPrices] = useState({});   // "SYM|expiry" -> { close, settle }
    const [asOf, setAsOf] = useState(null);
    const sig = useMemo(() => [...new Set(openTrades.map(t => t.symbol))].sort().join(","), [openTrades]);

    useEffect(() => {
        if (!sig) { setPrices({}); return; }
        let cancelled = false;
        (async () => {
            try {
                const latest = await fetchLatestFutDate();
                if (!latest) return;
                const list = sig.split(",").map(s => `"${s}"`).join(",");
                const rows = await sbGet(
                    `fut_bhav_copy?select=symbol,expiry_date,close,settle_price,underlying_price` +
                    `&trade_date=eq.${latest}&symbol=in.(${encodeURIComponent(list)})&limit=1000`);
                if (cancelled || !Array.isArray(rows)) return;
                const map = {};
                rows.forEach(r => { map[priceKey(r.symbol, r.expiry_date)] = { close: Number(r.close), settle: Number(r.settle_price) }; });
                setPrices(map);
                setAsOf(latest);
            } catch { /* leave prices empty */ }
        })();
        return () => { cancelled = true; };
    }, [sig]);

    return { prices, asOf };
}

function buildOpenRows(rows, prices) {
    return rows.filter(t => !t.closed).map(t => {
        const p = prices[priceKey(t.symbol, t.expiry_date)];
        const ltp = p ? (p.close || p.settle || null) : null;
        const curVal = ltp !== null ? t.qty * ltp : null;
        const unreal = ltp !== null ? t.sign * (ltp - Number(t.entry_price)) * t.qty : null;
        const pct = ltp !== null && t.entryVal ? (unreal / t.entryVal) * 100 : null;
        const dte = Math.ceil((new Date(t.expiry_date + "T00:00:00") - new Date(todayISO() + "T00:00:00")) / 86400000);
        return { ...t, ltp, curVal, unreal, pct, dte };
    });
}

/* ── Stats (mirrors calcStatsFromRows for the cash journal) ───────────────── */
function calcFutStats(rows) {
    const closed = rows.filter(t => t.closed);
    const wins = closed.filter(t => t.pnl > 0);
    const losses = closed.filter(t => t.pnl <= 0);
    const sum = (a, f) => a.reduce((s, t) => s + f(t), 0);
    const gainPnl = sum(wins, t => t.pnl), gainBase = sum(wins, t => t.entryVal);
    const lossPnl = sum(losses, t => t.pnl), lossBase = sum(losses, t => t.entryVal);
    const avgGain = gainBase ? (gainPnl / gainBase) * 100 : 0;
    const avgLoss = lossBase ? (lossPnl / lossBase) * 100 : 0;
    const avgHoldWin = gainBase ? sum(wins, t => t.days * t.entryVal) / gainBase : 0;
    const avgHoldLoss = lossBase ? sum(losses, t => t.days * t.entryVal) / lossBase : 0;
    const avgPnLWin = wins.length ? gainPnl / wins.length : 0;
    const avgPnLLoss = losses.length ? Math.abs(lossPnl / losses.length) : 0;
    return {
        closed, wins, losses, avgGain, avgLoss, avgHoldWin, avgHoldLoss,
        winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
        rr: avgPnLLoss ? avgPnLWin / avgPnLLoss : 0,
        totalPnl: gainPnl + lossPnl,
    };
}

/* One hook feeding hero (combined), futures dashboard and futures portfolio. */
export function useFutData({ session, isDemo, getToken }) {
    const base = useFutTrades({ session, isDemo, getToken });
    const rows = useMemo(() => base.trades.map(calcFut), [base.trades]);
    const open = useMemo(() => rows.filter(t => !t.closed), [rows]);
    const { prices, asOf } = useFutPrices(open);
    const openRows = useMemo(() => buildOpenRows(rows, prices), [rows, prices]);
    const stats = useMemo(() => calcFutStats(rows), [rows]);
    const summary = useMemo(() => {
        const priced = openRows.filter(r => r.unreal !== null);
        const unreal = priced.reduce((s, r) => s + r.unreal, 0);
        return {
            realized: stats.totalPnl, unreal, combined: stats.totalPnl + unreal,
            notional: priced.reduce((s, r) => s + r.curVal, 0),
            invested: priced.reduce((s, r) => s + r.entryVal, 0),
            pricedCount: priced.length, openCount: openRows.length, hasPrices: priced.length > 0,
            closedCount: stats.closed.length, wins: stats.wins.length, losses: stats.losses.length,
        };
    }, [openRows, stats]);
    return { ...base, rows, openRows, asOf, stats, summary };
}

/* ── Trade modal ──────────────────────────────────────────────────────────── */
function FutTradeModal({ trade, onClose, onSave, T }) {
    const editing = !!trade;
    const [form, setForm] = useState(trade ? {
        id: trade.id, symbol: trade.symbol, expiry_date: trade.expiry_date, direction: trade.direction,
        lots: String(trade.lots), lot_size: String(trade.lot_size), entry_date: trade.entry_date,
        entry_price: String(trade.entry_price), exit_date: trade.exit_date || "", exit_lots: String(trade.lots),
        exit_price: trade.exit_price ?? "", notes: trade.notes || "",
    } : {
        symbol: "", expiry_date: "", direction: "SHORT", lots: "1", lot_size: "", entry_date: todayISO(),
        entry_price: "", exit_date: "", exit_lots: "", exit_price: "", notes: "",
    });
    const [contracts, setContracts] = useState([]);       // [{expiry_date, lot_size}]
    const [fetching, setFetching] = useState(null);       // "entry" | "exit"
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState("");
    const timer = useRef(null);
    const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

    const loadContracts = (sym) => {
        clearTimeout(timer.current);
        const s = sym.trim().toUpperCase();
        if (!s) { setContracts([]); return; }
        timer.current = setTimeout(async () => {
            try {
                const latest = await fetchLatestFutDate();
                if (!latest) return;
                const rows = await sbGet(`fut_bhav_copy?select=expiry_date,lot_size&trade_date=eq.${latest}&symbol=eq.${encodeURIComponent(s)}&order=expiry_date.asc`);
                if (!Array.isArray(rows)) return;
                setContracts(rows);
                if (rows.length) setForm(f => ({
                    ...f,
                    expiry_date: rows.some(r => r.expiry_date === f.expiry_date) ? f.expiry_date : rows[0].expiry_date,
                    lot_size: f.lot_size || String(rows[0].lot_size || ""),
                }));
            } catch { /* ignore */ }
        }, 250);
    };
    useEffect(() => { if (editing) loadContracts(trade.symbol); /* eslint-disable-next-line */ }, []);

    const fetchPrice = async (leg) => {
        const date = leg === "entry" ? form.entry_date : form.exit_date;
        if (!form.symbol || !form.expiry_date || !date) { setErr("Enter symbol, expiry and date first."); return; }
        setFetching(leg); setErr("");
        try {
            const rows = await sbGet(`fut_bhav_copy?select=close,settle_price&symbol=eq.${encodeURIComponent(form.symbol.trim().toUpperCase())}&expiry_date=eq.${form.expiry_date}&trade_date=eq.${date}&limit=1`);
            const p = rows?.[0] ? (rows[0].close || rows[0].settle_price) : null;
            if (p) setForm(f => ({ ...f, [leg === "entry" ? "entry_price" : "exit_price"]: String(p) }));
            else setErr(`No bhavcopy row for ${form.symbol.toUpperCase()} ${form.expiry_date} on ${date}.`);
        } catch (e) { setErr(`Price lookup failed (${e.message}).`); }
        setFetching(null);
    };

    const lots = parseInt(form.lots, 10) || 0;
    const lotSize = parseInt(form.lot_size, 10) || 0;
    const qty = lots * lotSize;
    const entryVal = qty * (parseFloat(form.entry_price) || 0);
    const exitLots = parseInt(form.exit_lots, 10) || lots;
    const exitQty = exitLots * lotSize;
    const sign = form.direction === "SHORT" ? -1 : 1;
    const livePnl = form.exit_date && form.exit_price !== "" ? sign * ((parseFloat(form.exit_price) || 0) - (parseFloat(form.entry_price) || 0)) * exitQty : null;

    const submit = async () => {
        if (!form.symbol.trim()) return setErr("Symbol is required.");
        if (!form.expiry_date) return setErr("Expiry date is required.");
        if (!(lots > 0) || !(lotSize > 0)) return setErr("Lots and lot size must be greater than 0.");
        if (!form.entry_date || !(parseFloat(form.entry_price) > 0)) return setErr("Entry date and price are required.");
        const yr = (d) => parseInt(String(d).slice(0, 4), 10);
        const okYear = (d) => yr(d) >= 2000 && yr(d) <= 2100;
        if (!okYear(form.entry_date) || !okYear(form.expiry_date) || (form.exit_date && !okYear(form.exit_date))) return setErr("Check the year in your dates (e.g. 2026, not 0206).");
        if (form.exit_date && form.exit_date < form.entry_date) return setErr("Exit date cannot be before the entry date.");
        if (form.expiry_date < form.entry_date) return setErr("Expiry cannot be before the entry date.");
        if (form.exit_date && form.exit_price === "") return setErr("Enter an exit price or clear the exit date.");
        if (form.exit_date && exitLots > lots) return setErr(`Exit lots (${exitLots}) cannot exceed open lots (${lots}).`);
        setSaving(true); setErr("");
        try { await onSave(form); onClose(); }
        catch (e) { setErr(`Save failed: ${e.message}`); setSaving(false); }
    };

    const inputStyle = {
        width: "100%", padding: "9px 11px", background: T.inputBg, border: `1px solid ${T.border}`,
        borderRadius: 6, color: T.text, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
    };
    const labelStyle = { display: "block", fontSize: 11, fontWeight: 600, color: T.muted, marginBottom: 5, textTransform: "uppercase", letterSpacing: ".05em" };
    const grid2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 };
    const fetchBtn = (leg) => (
        <button type="button" onClick={() => fetchPrice(leg)} disabled={fetching === leg} style={{
            fontSize: 10, padding: "1px 7px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.pill,
            color: T.subtext, cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
        }}>{fetching === leg ? "…" : "Bhav"}</button>
    );
    const sideBtn = (d) => {
        const active = form.direction === d;
        const c = d === "LONG" ? T.posText : T.negText;
        const g = d === "LONG" ? T.posFill : T.negFill;
        return (
            <button key={d} type="button" onClick={() => setForm(f => ({ ...f, direction: d }))} style={{
                flex: 1, padding: "10px 0", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13,
                fontWeight: 700, background: active ? g : T.surface, color: active ? c : T.muted,
                borderBottom: active ? `2.5px solid ${c}` : "2.5px solid transparent",
            }}>{d}</button>
        );
    };

    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal" style={{ padding: 0, overflow: "hidden", borderRadius: 10, minWidth: 420, maxWidth: 480, maxHeight: "92vh", overflowY: "auto" }}>
                <div style={{ display: "flex", alignItems: "center", borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ flex: 1, padding: "14px 22px", fontWeight: 700, fontSize: 14, color: T.text }}>
                        {editing ? "Edit / Close Futures Trade" : "Add Futures Trade"}
                    </div>
                    <button onClick={onClose} style={{ padding: "0 16px", border: "none", background: "transparent", color: T.muted, cursor: "pointer", fontSize: 18, fontFamily: "inherit" }}>x</button>
                </div>
                <div style={{ display: "flex", borderBottom: `1px solid ${T.border}` }}>{["LONG", "SHORT"].map(sideBtn)}</div>

                <div style={{ padding: "20px 22px 22px" }}>
                    <div style={grid2}>
                        <div>
                            <label style={labelStyle}>Symbol</label>
                            <input value={form.symbol} placeholder="e.g. RELIANCE"
                                onChange={e => { set("symbol")(e); loadContracts(e.target.value); }}
                                style={{ ...inputStyle, textTransform: "uppercase", fontWeight: 700 }} autoComplete="off" />
                        </div>
                        <div>
                            <label style={labelStyle}>Expiry</label>
                            {contracts.length > 0 ? (
                                <select value={form.expiry_date} onChange={set("expiry_date")} style={inputStyle}>
                                    {contracts.map(c => <option key={c.expiry_date} value={c.expiry_date}>{fmtDate(c.expiry_date)}</option>)}
                                    {form.expiry_date && !contracts.some(c => c.expiry_date === form.expiry_date) &&
                                        <option value={form.expiry_date}>{fmtDate(form.expiry_date)}</option>}
                                </select>
                            ) : (
                                <input type="date" value={form.expiry_date} onChange={set("expiry_date")} style={inputStyle} />
                            )}
                        </div>
                    </div>

                    <div style={grid2}>
                        <div>
                            <label style={labelStyle}>Lots</label>
                            <input type="number" min="1" value={form.lots} onChange={set("lots")} style={inputStyle} />
                        </div>
                        <div>
                            <label style={labelStyle}>Lot size</label>
                            <input type="number" min="1" value={form.lot_size} onChange={set("lot_size")} placeholder="auto from bhav" style={inputStyle} />
                        </div>
                    </div>

                    <div style={grid2}>
                        <div>
                            <label style={labelStyle}>Entry date</label>
                            <input type="date" value={form.entry_date} onChange={set("entry_date")} style={inputStyle} />
                        </div>
                        <div>
                            <label style={{ ...labelStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span>Entry price</span>{fetchBtn("entry")}
                            </label>
                            <input type="number" step="0.05" value={form.entry_price} onChange={set("entry_price")} style={inputStyle} />
                        </div>
                    </div>

                    {qty > 0 && entryVal > 0 && (
                        <div style={{ padding: "10px 14px", borderRadius: 7, background: T.pill, border: `1px solid ${T.border}`, marginBottom: 14, display: "flex", justifyContent: "space-between", fontSize: 12, color: T.subtext }}>
                            <span>{qty.toLocaleString("en-IN")} qty · notional</span>
                            <strong style={{ ...mono, color: T.text }}>{num2(entryVal)}</strong>
                        </div>
                    )}

                    <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: ".08em", margin: "6px 0 10px" }}>Exit (optional)</div>
                    <div style={grid2}>
                        <div>
                            <label style={labelStyle}>Exit date</label>
                            <input type="date" value={form.exit_date} onChange={set("exit_date")} style={inputStyle} />
                        </div>
                        <div>
                            <label style={labelStyle}>Exit lots</label>
                            <input type="number" min="1" value={form.exit_lots} onChange={set("exit_lots")} placeholder={String(lots || "")} style={inputStyle} />
                        </div>
                    </div>
                    <div style={{ marginBottom: 14 }}>
                        <label style={{ ...labelStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span>Exit price</span>{fetchBtn("exit")}
                        </label>
                        <input type="number" step="0.05" value={form.exit_price} onChange={set("exit_price")} style={inputStyle} />
                    </div>
                    {livePnl !== null && (
                        <div style={{ padding: "10px 14px", borderRadius: 7, marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center",
                            background: livePnl >= 0 ? T.posFill : T.negFill, border: `1px solid ${livePnl >= 0 ? T.posMid : T.negMid}88` }}>
                            <span style={{ fontSize: 12, color: T.subtext }}>
                                {exitLots < lots ? `Realised on ${exitLots} of ${lots} lots (rest stays open)` : "Realised P&L"}
                            </span>
                            <strong style={{ ...mono, fontSize: 15, color: livePnl >= 0 ? T.posText : T.negText }}>{signed(livePnl)}</strong>
                        </div>
                    )}

                    <div style={{ marginBottom: 14 }}>
                        <label style={labelStyle}>Notes</label>
                        <input value={form.notes} onChange={set("notes")} placeholder="Setup, stop-loss, reason…" style={inputStyle} />
                    </div>

                    {err && <div style={{ color: T.negText, fontSize: 12, marginBottom: 12 }}>{err}</div>}

                    <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                        <button className="journal-btn-ghost" onClick={onClose}>Cancel</button>
                        <button className="btn-add" onClick={submit} disabled={saving} style={{ opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : editing ? "Update" : "Add Trade"}</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ── CSV import ───────────────────────────────────────────────────────────── */
const CSV_COLS = ["symbol", "expiry_date", "direction", "lots", "lot_size", "entry_date", "entry_price", "exit_date", "exit_price", "notes"];

function parseCSV(text) {
    const rows = []; let row = [], cur = "", q = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (q) {
            if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
            else if (c === '"') q = false;
            else cur += c;
        } else if (c === '"') q = true;
        else if (c === ",") { row.push(cur); cur = ""; }
        else if (c === "\n" || c === "\r") {
            if (c === "\r" && text[i + 1] === "\n") i++;
            row.push(cur); cur = ""; rows.push(row); row = [];
        } else cur += c;
    }
    if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(x => x.trim() !== ""));
}

function FutImportModal({ T, onClose, onImport }) {
    const [msg, setMsg] = useState("");
    const [busy, setBusy] = useState(false);
    const downloadTemplate = () => {
        const csv = CSV_COLS.join(",") + "\nRELIANCE,2026-11-24,SHORT,1,500,2026-11-03,1450.50,2026-11-07,1420.00,sample\n";
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
        a.download = "futures_trades_template.csv"; a.click();
    };
    const handleFile = async (e) => {
        const file = e.target.files?.[0]; if (!file) return;
        setBusy(true); setMsg("");
        try {
            const rows = parseCSV(await file.text());
            const head = rows[0].map(h => h.trim().toLowerCase());
            const idx = Object.fromEntries(CSV_COLS.map(c => [c, head.indexOf(c)]));
            const missing = ["symbol", "expiry_date", "direction", "lots", "lot_size", "entry_date", "entry_price"].filter(c => idx[c] < 0);
            if (missing.length) throw new Error(`Missing column(s): ${missing.join(", ")}`);
            const out = [];
            rows.slice(1).forEach((r, n) => {
                const g = (c) => (idx[c] >= 0 ? (r[idx[c]] || "").trim() : "");
                const dir = g("direction").toUpperCase();
                if (!g("symbol")) return;
                if (dir !== "LONG" && dir !== "SHORT") throw new Error(`Row ${n + 2}: direction must be LONG or SHORT`);
                const hasExit = g("exit_date") && g("exit_price");
                out.push({
                    symbol: g("symbol").toUpperCase(), expiry_date: g("expiry_date"), direction: dir,
                    lots: parseInt(g("lots"), 10), lot_size: parseInt(g("lot_size"), 10),
                    entry_date: g("entry_date"), entry_price: parseFloat(g("entry_price")),
                    exit_date: hasExit ? g("exit_date") : null, exit_price: hasExit ? parseFloat(g("exit_price")) : null,
                    notes: g("notes") || null,
                });
            });
            if (!out.length) throw new Error("No rows found.");
            const n = await onImport(out);
            setMsg(`Imported ${n} trade(s).`);
        } catch (er) { setMsg(`Import failed: ${er.message}`); }
        setBusy(false); e.target.value = "";
    };
    return (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="modal" style={{ padding: 22, borderRadius: 10, minWidth: 380, maxWidth: 440 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: T.text, marginBottom: 6 }}>Import futures trades (CSV)</div>
                <div style={{ fontSize: 12.5, color: T.subtext, marginBottom: 14, lineHeight: 1.6 }}>
                    Columns: <span style={mono}>{CSV_COLS.join(", ")}</span>. Dates as YYYY-MM-DD, direction LONG or SHORT. Exit columns can be blank for open trades.
                </div>
                <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                    <button className="journal-btn-ghost" onClick={downloadTemplate}>Template</button>
                    <label className="journal-btn-ghost" style={{ cursor: "pointer" }}>
                        {busy ? "Importing…" : "Choose CSV"}
                        <input type="file" accept=".csv,text/csv" onChange={handleFile} style={{ display: "none" }} disabled={busy} />
                    </label>
                </div>
                {msg && <div style={{ fontSize: 12.5, color: msg.startsWith("Imported") ? T.posText : T.negText, marginBottom: 10 }}>{msg}</div>}
                <div style={{ display: "flex", justifyContent: "flex-end" }}><button className="journal-btn-ghost" onClick={onClose}>Close</button></div>
            </div>
        </div>
    );
}

/* ── Badges ───────────────────────────────────────────────────────────────── */
const SideBadge = ({ d, T }) => (
    <span style={{
        fontSize: 10.5, fontWeight: 800, letterSpacing: ".04em", padding: "2px 8px", borderRadius: 999,
        background: d === "LONG" ? T.posFill : T.negFill, color: d === "LONG" ? T.posText : T.negText,
    }}>{d}</span>
);

/* ── Trades page ──────────────────────────────────────────────────────────── */
function FutTradesPage({ T, Hero, data }) {
    const { trades, loading, error, save, remove, importRows } = data;
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState("all");
    const [modal, setModal] = useState(null);       // null | {trade?}
    const [showImport, setShowImport] = useState(false);

    const rows = useMemo(() => trades.map(calcFut), [trades]);
    const filtered = useMemo(() => rows.filter(t => {
        const ms = t.symbol.toLowerCase().includes(search.toLowerCase());
        const mf = filter === "all" || (filter === "open" && !t.closed) || (filter === "closed" && t.closed)
            || (filter === "win" && t.closed && t.pnl > 0) || (filter === "loss" && t.closed && t.pnl < 0);
        return ms && mf;
    }), [rows, search, filter]);

    const closedN = rows.filter(t => t.closed).length;
    const winsN = rows.filter(t => t.closed && t.pnl > 0).length;
    const realized = rows.reduce((s, t) => s + (t.closed ? t.pnl : 0), 0);

    const exportCSV = () => {
        const headers = ["Symbol", "Expiry", "Side", "Lots", "Lot Size", "Qty", "Entry Date", "Entry Price", "Exit Date", "Exit Price", "P&L", "Days", "Status", "Notes"];
        const lines = filtered.map(t => [t.symbol, t.expiry_date, t.direction, t.lots, t.lot_size, t.qty, t.entry_date, t.entry_price,
            t.exit_date || "", t.exit_price ?? "", t.closed ? t.pnl.toFixed(2) : "", t.days ?? "", !t.closed ? "Open" : t.pnl > 0 ? "Win" : t.pnl < 0 ? "Loss" : "Break", t.notes || ""]);
        const csv = [headers, ...lines].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
        a.download = `fut_trades_${filter}_${todayISO()}.csv`; a.click();
    };

    const actions = (
        <>
            <button className="journal-btn-ghost" onClick={() => setShowImport(true)}>Import CSV</button>
            <button className="journal-btn-ghost" onClick={exportCSV}>Export CSV</button>
            <button className="btn-add" onClick={() => setModal({})}>+ Add Trade</button>
        </>
    );

    return (
        <div>
            <Hero
                T={T}
                kicker="Journals / Trade Journal-FUT"
                title="Trade Journal — Futures"
                metrics={[
                    { label: "Total trades", value: `${rows.length}`, sub: `${filtered.length} in current view` },
                    { label: "Open vs closed", value: `${rows.length - closedN} / ${closedN}`, sub: "Open positions / completed positions" },
                    { label: "Winning trades", value: `${winsN}`, sub: "Closed positions with positive P&L" },
                ]}
                actions={actions}
                asideTitle="Realised P&L"
                asideValue={`${signed(realized, 0)}`}
                asideTone={realized >= 0 ? "positive" : "negative"}
                asideBody={`${closedN} closed futures trades. Long and short both counted.`}
            />
            {error && <div style={{ background: T.redGlow, border: `1px solid ${T.red}44`, borderRadius: 10, padding: "12px 16px", marginBottom: 14, color: T.redText, fontSize: 13 }}>{error}</div>}
            {showImport && <FutImportModal T={T} onClose={() => setShowImport(false)} onImport={importRows} />}
            {modal && <FutTradeModal T={T} trade={modal.trade} onClose={() => setModal(null)} onSave={save} />}

            <div className="journal-toolbar" style={{ marginBottom: 16 }}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search symbol"
                    style={{ padding: "11px 15px", background: T.inputBg, border: `1px solid ${T.border}`, borderRadius: 999, color: T.text, fontSize: 13, fontFamily: "inherit", outline: "none", width: 220, maxWidth: "100%" }} />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {["all", "open", "closed", "win", "loss"].map(f => (
                        <button key={f} onClick={() => setFilter(f)} className={`journal-pill-filter${filter === f ? " active" : ""}`} style={{ textTransform: "capitalize" }}>{f}</button>
                    ))}
                </div>
            </div>

            <div className="table-wrap">
                {loading ? <div className="empty"><div className="empty-text">Loading…</div></div>
                    : filtered.length === 0 ? <div className="empty"><div className="empty-text">No futures trades found</div></div>
                        : <table>
                            <thead><tr>
                                <th>#</th><th>Symbol</th><th>Expiry</th><th>Side</th><th>Lots</th><th>Qty</th><th>Entry</th><th>Entry Price</th>
                                <th>Exit</th><th>Exit Price</th><th>P&amp;L</th><th>Days</th><th>Status</th><th></th>
                            </tr></thead>
                            <tbody>
                                {filtered.map((t, i) => (
                                    <tr key={t.id}>
                                        <td className="td-mono" style={{ color: T.muted }}>{i + 1}</td>
                                        <td style={{ fontWeight: 700 }}>{t.symbol}</td>
                                        <td className="td-mono" style={{ color: T.subtext }}>{t.expiry_date}</td>
                                        <td><SideBadge d={t.direction} T={T} /></td>
                                        <td className="td-mono">{t.lots}</td>
                                        <td className="td-mono">{num0(t.qty)}</td>
                                        <td className="td-mono" style={{ color: T.subtext }}>{t.entry_date}</td>
                                        <td className="td-mono">{num2(t.entry_price)}</td>
                                        <td className="td-mono" style={{ color: T.subtext }}>{t.exit_date || ""}</td>
                                        <td className="td-mono">{t.closed ? num2(t.exit_price) : ""}</td>
                                        <td>{t.closed ? <span className={t.pnl > 0 ? "pnl-pos" : t.pnl < 0 ? "pnl-neg" : ""}>{signed(t.pnl)}</span> : <span style={{ color: T.muted }}>–</span>}</td>
                                        <td className="td-mono" style={{ color: T.subtext }}>{t.days ?? ""}</td>
                                        <td>{!t.closed ? <span className="badge badge-open">Open</span> : t.pnl > 0 ? <span className="badge badge-win">Win</span> : t.pnl < 0 ? <span className="badge badge-loss">Loss</span> : <span className="badge" style={{ background: T.pill, color: T.subtext }}>Break</span>}</td>
                                        <td><span style={{ display: "flex", gap: 2 }}>
                                            <button className="action-btn" onClick={() => setModal({ trade: t })} title="Edit / close trade">✏️</button>
                                            <button className="action-btn" onClick={() => remove(t.id)} title="Delete trade">🗑️</button>
                                        </span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>}
            </div>
        </div>
    );
}

/* ── Segmented tabs (Cash | Futures) ──────────────────────────────────────── */
const TAB_ICONS = {
    cash: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></svg>,
    futures: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 17 9 11 13 15 21 7" /><polyline points="15 7 21 7 21 13" /></svg>,
};

export function SegmentedTabs({ T, value, onChange, items }) {
    const n = items.length;
    const idx = Math.max(0, items.findIndex(i => i.id === value));
    return (
        <div role="tablist" style={{
            position: "relative", display: "inline-grid", gridTemplateColumns: `repeat(${n}, minmax(138px, 1fr))`,
            padding: 4, margin: "4px 0 20px", borderRadius: 999, background: T.card, border: `1px solid ${T.border}`,
            boxShadow: `inset 0 1px 2px ${T.shadow}, 0 1px 0 ${T.border}`, maxWidth: "100%",
        }}>
            {/* sliding thumb */}
            <span aria-hidden style={{
                position: "absolute", top: 4, bottom: 4, left: 4, width: `calc((100% - 8px) / ${n})`,
                transform: `translateX(${idx * 100}%)`, transition: "transform .32s cubic-bezier(.4,0,.2,1)",
                borderRadius: 999, background: `linear-gradient(135deg, ${T.accent}, ${T.accent}dd)`,
                boxShadow: `0 8px 18px ${T.shadow}, inset 0 1px 0 rgba(255,255,255,.18)`,
            }} />
            {items.map(it => {
                const active = it.id === value;
                return (
                    <button key={it.id} role="tab" aria-selected={active} onClick={() => onChange(it.id)} style={{
                        position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        padding: "9px 18px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit",
                        fontSize: 13, fontWeight: 700, letterSpacing: ".01em", whiteSpace: "nowrap", borderRadius: 999,
                        color: active ? T.card : T.subtext, transition: "color .25s ease",
                    }}>
                        <span style={{ display: "inline-flex", opacity: active ? 1 : 0.7 }}>{TAB_ICONS[it.id]}</span>
                        <span>{it.label}</span>
                        {it.count ? (
                            <span style={{
                                fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999, ...mono,
                                background: active ? "rgba(255,255,255,.2)" : T.pill, color: active ? T.card : T.muted,
                                transition: "background .25s ease, color .25s ease",
                            }}>{it.count}</span>
                        ) : null}
                    </button>
                );
            })}
        </div>
    );
}

/* ── Futures "capital gains" tab: FY-wise business income + turnover ───────── */
// Futures are non-speculative business income (not capital gains), so there is no
// short/long-term split. Turnover = sum of |P&L| of each squared-off contract.
export function calcFutFYRows(closed, getFY, curFY) {
    const byFY = {};
    closed.forEach(t => {
        if (!t.exit_date || parseInt(String(t.exit_date).slice(0, 4), 10) < 2000) return;   // ignore mistyped dates
        const fy = getFY(t.exit_date);
        const r = byFY[fy] || (byFY[fy] = { fy, n: 0, profit: 0, loss: 0 });
        r.n += 1;
        if (t.pnl > 0) r.profit += t.pnl; else r.loss += t.pnl;
    });
    const curStart = parseInt(curFY.slice(0, 4), 10);
    const starts = Object.keys(byFY).map(f => parseInt(f.slice(0, 4), 10));
    const first = Math.min(curStart, ...starts), last = Math.max(curStart, ...starts);
    const out = [];
    for (let y = first; y <= last; y++) {
        const fy = `${y}-${String(y + 1).slice(-2)}`;
        const r = byFY[fy] || { fy, n: 0, profit: 0, loss: 0 };
        out.push({ ...r, net: r.profit + r.loss, turnover: r.profit + Math.abs(r.loss) });
    }
    return out;
}

export function FutTaxTable({ T, rows, curFY }) {
    const tot = rows.reduce((a, r) => ({ n: a.n + r.n, profit: a.profit + r.profit, loss: a.loss + r.loss, net: a.net + r.net, turnover: a.turnover + r.turnover }),
        { n: 0, profit: 0, loss: 0, net: 0, turnover: 0 });
    const pad = "9px 14px";
    const sub = { background: T.surface, color: T.subtext, fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", textAlign: "right", padding: pad, borderBottom: `2px solid ${T.border}` };
    const banner = { background: T.green, color: "#fff", fontWeight: 700, fontSize: 13, letterSpacing: ".06em", textAlign: "center", padding: "11px 0" };
    const col = (v) => (v > 0 ? T.pos : v < 0 ? T.neg : T.muted);
    const cell = (v, color) => ({ textAlign: "right", padding: pad, fontSize: 13, color: color || col(v), ...mono });
    const fmt = (v) => (v === 0 ? "0.00" : num2(v));
    const yearCell = { fontWeight: 700, fontSize: 13, padding: pad, color: T.text, background: T.surface, borderRight: `1px solid ${T.border}`, whiteSpace: "nowrap" };
    const note = { fontSize: 12, color: T.muted, lineHeight: 1.6 };

    return (
        <div>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "auto", WebkitOverflowScrolling: "touch", boxShadow: `0 2px 8px ${T.shadow}` }}>
                <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", minWidth: 680, fontFamily: "inherit" }}>
                    <colgroup>
                        <col style={{ width: "12%" }} /><col style={{ width: "10%" }} /><col style={{ width: "19.5%" }} />
                        <col style={{ width: "19.5%" }} /><col style={{ width: "19.5%" }} /><col style={{ width: "19.5%" }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <td rowSpan={2} style={{ ...sub, textAlign: "left", paddingLeft: 16, verticalAlign: "middle", borderRight: `1px solid ${T.border}`, fontSize: 12 }}>FY</td>
                            <td colSpan={5} style={banner}>FUTURES · NON-SPECULATIVE BUSINESS INCOME</td>
                        </tr>
                        <tr>
                            <td style={sub}>Trades</td><td style={sub}>Profit</td><td style={sub}>Loss</td><td style={sub}>Net P&amp;L</td><td style={sub}>Turnover</td>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, i) => (
                            <tr key={r.fy} style={{ background: i % 2 === 0 ? T.card : T.surface, borderTop: `1px solid ${T.border}`, opacity: r.n === 0 && r.fy !== curFY ? 0.5 : 1 }}>
                                <td style={yearCell}>{r.fy}</td>
                                <td style={cell(r.n, r.n ? T.text : T.muted)}>{r.n}</td>
                                <td style={cell(r.profit)}>{fmt(r.profit)}</td>
                                <td style={cell(r.loss)}>{fmt(r.loss)}</td>
                                <td style={{ ...cell(r.net), fontWeight: 700 }}>{fmt(r.net)}</td>
                                <td style={cell(r.turnover, r.turnover ? T.text : T.muted)}>{fmt(r.turnover)}</td>
                            </tr>
                        ))}
                        <tr style={{ background: T.greenGlow, borderTop: `2px solid ${T.green}` }}>
                            <td style={{ ...yearCell, color: T.greenText, background: "transparent" }}>TOTAL</td>
                            <td style={cell(tot.n, T.text)}>{tot.n}</td>
                            <td style={cell(tot.profit)}>{fmt(tot.profit)}</td>
                            <td style={cell(tot.loss)}>{fmt(tot.loss)}</td>
                            <td style={{ ...cell(tot.net), fontWeight: 700 }}>{fmt(tot.net)}</td>
                            <td style={cell(tot.turnover, T.text)}>{fmt(tot.turnover)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={note}><strong style={{ color: T.subtext }}>Tax head</strong> · Futures P&amp;L is non-speculative business income, taxed at slab rates and reported in ITR-3. It is not capital gains, so there is no short/long-term split.</span>
                <span style={note}><strong style={{ color: T.subtext }}>Turnover</strong> · Sum of the absolute profit or loss of each closed contract (ICAI method). Open positions count only once squared off.</span>
                <span style={note}><strong style={{ color: T.subtext }}>Note</strong> · Brokerage and other charges aren't included. Loss carry-forward depends on filing on time. This is not tax advice, so confirm with a CA.</span>
            </div>
        </div>
    );
}

/* ── Futures dashboard section (mirrors the cash stats + charts) ───────────── */
export function SectionHead({ T, kicker, title, right, first = false }) {
    return (
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 8, margin: first ? "6px 0 16px" : "36px 0 16px", paddingTop: first ? 0 : 22, borderTop: first ? "none" : `1px solid ${T.border}` }}>
            <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: T.muted }}>{kicker}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: "-.02em" }}>{title}</div>
            </div>
            {right ? <div style={{ fontSize: 12, color: T.subtext }}>{right}</div> : null}
        </div>
    );
}

export function FutDashboardSection({ T, fut, Sparkline, Donut, StatCardHead }) {
    const { stats, summary, rows } = fut;
    const combined = summary.combined;
    const closedByExit = useMemo(
        () => [...stats.closed].sort((a, b) => (a.exit_date || "").localeCompare(b.exit_date || "") || a.id - b.id),
        [stats.closed]);
    const futSeries = useMemo(() => {
        const byDate = {};
        stats.closed.forEach(t => { byDate[t.exit_date] = (byDate[t.exit_date] || 0) + t.pnl; });
        let run = 0;
        return Object.keys(byDate).sort().map(d => { run += byDate[d]; return { date: d, value: run }; });
    }, [stats.closed]);
    const bySymbol = useMemo(() => {
        const m = {};
        stats.closed.forEach(t => { m[t.symbol] = (m[t.symbol] || 0) + t.pnl; });
        return Object.entries(m).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 8);
    }, [stats.closed]);
    const maxAbs = bySymbol.length ? Math.max(...bySymbol.map(([, v]) => Math.abs(v))) || 1 : 1;
    const openN = summary.openCount;

    return (
        <div>
            {fut.error && <div style={{ background: T.redGlow, border: `1px solid ${T.red}44`, borderRadius: 10, padding: "12px 16px", marginBottom: 14, color: T.redText, fontSize: 13 }}>{fut.error}</div>}
            {rows.length === 0 && !fut.loading ? (
                <div className="empty">
                    <div className="empty-text">No futures trades yet</div>
                    <div style={{ color: T.muted, fontSize: 13, marginTop: 6 }}>Add trades under Journal → Trade Journal-FUT to see your futures stats here.</div>
                </div>
            ) : (<>
                <div className="stats-row">
                    <div className="stat-card hero">
                        <StatCardHead T={T} icon="pulse" label="Net P&amp;L from Futures" tone={combined >= 0 ? "positive" : "negative"} />
                        <div className={`stat-value hero ${combined >= 0 ? "green" : "red"}`}>{signed(combined, 0)}</div>
                        <div className="stat-sub">{summary.closedCount} closed · {openN} open</div>
                    </div>
                    <div className="stat-card">
                        <StatCardHead T={T} icon="percent" label="Win / Loss Rate" />
                        <div className="stat-value">{stats.winRate.toFixed(2)}%</div>
                        <div className="stat-sub">{stats.wins.length}W / {stats.losses.length}L</div>
                    </div>
                    <div className="stat-card">
                        <StatCardHead T={T} icon="trendUp" label="Avg Gain" tone="positive" />
                        <div className="stat-value green">+{stats.avgGain.toFixed(2)}%</div>
                        <div className="stat-sub">Avg hold {stats.avgHoldWin.toFixed(1)} days</div>
                    </div>
                    <div className="stat-card">
                        <StatCardHead T={T} icon="trendDown" label="Avg Loss" tone="negative" />
                        <div className="stat-value red">{stats.avgLoss.toFixed(2)}%</div>
                        <div className="stat-sub">Avg hold {stats.avgHoldLoss.toFixed(1)} days</div>
                    </div>
                </div>
                <div className="stats-row-2">
                    <div className="stat-card">
                        <StatCardHead T={T} icon="scale" label="Reward / Risk" />
                        <div className="stat-value">{stats.rr.toFixed(2)}</div>
                        <div className="stat-sub">Gain vs Loss ratio</div>
                    </div>
                    <div className="stat-card">
                        <StatCardHead T={T} icon="wallet" label="Notional Exposure (Live)" />
                        <div className="stat-value" style={{ fontSize: 18, color: summary.hasPrices ? T.text : T.muted }}>
                            {summary.hasPrices ? num0(summary.notional) : "–"}
                        </div>
                        <div className="stat-sub">
                            {summary.hasPrices ? `Bhavcopy prices  ${summary.pricedCount}/${openN} contracts` : "No priced open contracts"}
                        </div>
                    </div>
                    <div className="stat-card">
                        <StatCardHead T={T} icon="clock" label="Avg Hold (Wins)" />
                        <div className="stat-value">{stats.avgHoldWin.toFixed(1)}<span style={{ fontSize: 13, color: T.subtext }}> d</span></div>
                    </div>
                    <div className="stat-card">
                        <StatCardHead T={T} icon="clock" label="Avg Hold (Losses)" />
                        <div className="stat-value">{stats.avgHoldLoss.toFixed(1)}<span style={{ fontSize: 13, color: T.subtext }}> d</span></div>
                    </div>
                </div>
                <div className="chart-grid">
                    <div className="chart-card"><div className="chart-title">Cumulative P&amp;L</div><Sparkline series={futSeries} data={closedByExit.map(t => t.pnl)} T={T} /></div>
                    <div className="chart-card"><div className="chart-title">Win / Loss Breakdown</div><div style={{ paddingTop: 12 }}><Donut win={stats.wins.length} loss={stats.losses.length} T={T} /></div></div>
                    <div className="chart-card" style={{ gridColumn: "span 2" }}>
                        <div className="chart-title">P&amp;L by Symbol</div>
                        {bySymbol.length === 0 ? <div className="empty" style={{ padding: 16 }}>No closed trades</div> : (
                            <div className="bar-chart">
                                {bySymbol.map(([sym, pnl]) => (
                                    <div className="bar-row" key={sym}>
                                        <div className="bar-label">{sym}</div>
                                        <div className="bar-track"><div className="bar-fill" style={{ width: `${(Math.abs(pnl) / maxAbs) * 100}%`, background: pnl >= 0 ? T.green : T.red }}>
                                            <span className="bar-fill-val">{signed(pnl, 0)}</span>
                                        </div></div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </>)}
        </div>
    );
}

/* ── Futures portfolio (open positions, marked to bhavcopy) ───────────────── */
export function FutPortfolio({ T, fut }) {
    const { loading, openRows, summary, asOf } = fut;
    const col = (v) => (v >= 0 ? T.greenText : T.redText);

    const card = (label, value, sub, color) => (
        <div className="stat-card">
            <div className="stat-label">{label}</div>
            <div className="stat-value" style={{ fontSize: 18, ...mono, color: color || T.text }}>{value}</div>
            <div className="stat-sub">{sub}</div>
        </div>
    );

    return (
        <section style={{ marginTop: 32 }}>
            <SectionHead T={T} kicker="Journals / Futures Portfolio" title="Futures Portfolio"
                right={asOf ? `Prices: NSE F&O bhavcopy, ${fmtDate(asOf)}` : "Prices: NSE F&O bhavcopy"} />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14, marginBottom: 18 }}>
                {card("Open positions", String(summary.openCount), `${summary.pricedCount} priced from bhavcopy`)}
                {card("Notional exposure", summary.hasPrices ? num0(summary.notional) : "–", summary.hasPrices ? `Entry notional ${num0(summary.invested)}` : "No priced positions")}
                {card("Unrealised P&L", summary.openCount ? signed(summary.unreal, 0) : "–", summary.invested ? `${signed((summary.unreal / summary.invested) * 100)}% on entry notional` : "", summary.openCount ? col(summary.unreal) : T.muted)}
                {card("Realised P&L", signed(summary.realized, 0), `${summary.closedCount} closed trades`, col(summary.realized))}
            </div>

            {loading ? <div className="empty"><div className="empty-text">Loading…</div></div>
                : openRows.length === 0 ? (
                    <div className="empty">
                        <div className="empty-text">No open futures positions</div>
                        <div style={{ color: T.muted, fontSize: 13, marginTop: 6 }}>Add trades under Journal → Trade Journal-FUT.</div>
                    </div>
                ) : (
                    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden", boxShadow: `0 2px 8px ${T.shadow}` }}>
                        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                                <thead><tr>
                                    {["Symbol", "Expiry", "Side", "Lots", "Qty", "Entry", "LTP", "Notional", "Unrealised P&L", "P&L %", "DTE"].map((h, i) => (
                                        <th key={h} style={{ padding: "10px 12px", fontSize: 10.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: T.muted, textAlign: i === 0 ? "left" : "right", borderBottom: `1px solid ${T.border}` }}>{h}</th>
                                    ))}
                                </tr></thead>
                                <tbody>
                                    {openRows.map((r, i) => {
                                        const bg = i % 2 === 0 ? T.card : T.surface;
                                        const td = { padding: "10px 12px", fontSize: 12.5, textAlign: "right", borderBottom: `1px solid ${T.border}`, ...mono };
                                        return (
                                            <tr key={r.id} style={{ background: bg }}>
                                                <td style={{ ...td, textAlign: "left", fontWeight: 700, color: T.greenText }}>{r.symbol}</td>
                                                <td style={{ ...td, color: T.subtext }}>{fmtDate(r.expiry_date)}</td>
                                                <td style={td}><SideBadge d={r.direction} T={T} /></td>
                                                <td style={td}>{r.lots}</td>
                                                <td style={td}>{num0(r.qty)}</td>
                                                <td style={td}>{num2(r.entry_price)}</td>
                                                <td style={{ ...td, fontWeight: 700, color: r.ltp ? T.text : T.muted }}>{r.ltp ? num2(r.ltp) : "–"}</td>
                                                <td style={td}>{r.curVal !== null ? num0(r.curVal) : "–"}</td>
                                                <td style={{ ...td, fontWeight: 700, color: r.unreal !== null ? col(r.unreal) : T.muted }}>{r.unreal !== null ? signed(r.unreal, 0) : "–"}</td>
                                                <td style={{ ...td, color: r.pct !== null ? col(r.pct) : T.muted }}>{r.pct !== null ? `${signed(r.pct)}%` : "–"}</td>
                                                <td style={{ ...td, color: r.dte <= 3 ? T.redText : T.subtext }}>{r.dte < 0 ? "expired" : `${r.dte}d`}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            {openRows.some(r => r.ltp === null) && !loading && (
                <div style={{ fontSize: 12, color: T.muted, marginTop: 10 }}>
                    "–" means that contract has no row in the latest bhavcopy (not loaded yet, or already expired).
                </div>
            )}
        </section>
    );
}

/* ── Entry: the Trade Journal-FUT page ────────────────────────────────────── */
export default function FuturesJournal({ T, session, isDemo, getToken, Hero }) {
    const data = useFutTrades({ session, isDemo, getToken });
    return <FutTradesPage T={T} Hero={Hero} data={data} />;
}
