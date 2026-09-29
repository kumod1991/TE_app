import { useState } from "react";

/**
 * DeleteAccountPage
 *
 * Props
 *  - T                  theme tokens (same object used across TradeEdge)
 *  - session            current session ({ user: { email, id } }) or null
 *  - isDemo             true when the demo account is active
 *  - onConfirmDelete    async () => void — calls the delete-account edge function
 *                       and wipes local per-user data. Must throw on failure.
 *  - onDone             () => void — sign the user out locally and leave the page
 *  - onCancel           () => void — go back to where the user came from
 *  - onLoginRequired    () => void — open the login modal (logged-out visitors)
 */

const DELETED_ITEMS = [
    "Your login and profile",
    "Trade journal entries, funds and dividend records",
    "Portfolio, P&L history and journal analytics",
    "Watchlists and saved screener filters",
    "Forum threads and replies you posted, and files you uploaded",
];

function Icon({ name, size = 18 }) {
    const c = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round" };
    if (name === "alert") return <svg {...c}><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
    if (name === "check") return <svg {...c}><polyline points="20 6 9 17 4 12" /></svg>;
    if (name === "trash") return <svg {...c}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>;
    return null;
}

export default function DeleteAccountPage({ T, session, isDemo, onConfirmDelete, onDone, onCancel, onLoginRequired }) {
    const email = session?.user?.email || session?.email || "";
    const [typed, setTyped] = useState("");
    const [understood, setUnderstood] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [deleted, setDeleted] = useState(false);

    const emailMatches = email && typed.trim().toLowerCase() === email.toLowerCase();
    const canDelete = emailMatches && understood && !busy;

    const handleDelete = async () => {
        if (!canDelete) return;
        setBusy(true);
        setError("");
        try {
            await onConfirmDelete();
            setDeleted(true);
        } catch (e) {
            setError(e?.message || "Something went wrong. Please try again.");
        } finally {
            setBusy(false);
        }
    };

    const card = {
        background: T.card, border: `1px solid ${T.border}`, borderRadius: 14,
        padding: "28px 28px", width: "100%", boxSizing: "border-box",
    };
    const primaryBtn = (enabled, danger) => ({
        background: enabled ? (danger ? T.red : T.green) : T.border,
        color: enabled ? "#fff" : T.subtext,
        border: "none", borderRadius: 9, padding: "11px 20px",
        fontSize: 14, fontWeight: 700, fontFamily: "inherit",
        cursor: enabled ? "pointer" : "not-allowed", transition: "opacity .15s",
    });
    const ghostBtn = {
        background: "none", color: T.text, border: `1px solid ${T.border}`,
        borderRadius: 9, padding: "11px 20px", fontSize: 14, fontWeight: 600,
        fontFamily: "inherit", cursor: "pointer",
    };

    let body;

    if (deleted) {
        body = (
            <div style={{ ...card, textAlign: "center" }}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: T.posFill, color: T.green, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                    <Icon name="check" size={22} />
                </div>
                <h1 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: "-.02em" }}>Your account has been deleted</h1>
                <p style={{ margin: "0 0 22px", fontSize: 14, lineHeight: 1.6, color: T.subtext }}>
                    Your data has been removed from TradeEdge. You're welcome back any time — you can always create a new account.
                </p>
                <button onClick={onDone} style={primaryBtn(true, false)}>Back to TradeEdge</button>
            </div>
        );
    } else if (isDemo) {
        body = (
            <div style={card}>
                <h1 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800, color: T.text }}>Delete account</h1>
                <p style={{ margin: "0 0 20px", fontSize: 14, lineHeight: 1.6, color: T.subtext }}>
                    You're in the demo account, which has no personal data to delete. Sign in with your own account to delete it.
                </p>
                <button onClick={onCancel} style={ghostBtn}>Go back</button>
            </div>
        );
    } else if (!session) {
        body = (
            <div style={card}>
                <h1 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: "-.02em" }}>Delete your TradeEdge account</h1>
                <p style={{ margin: "0 0 20px", fontSize: 14, lineHeight: 1.6, color: T.subtext }}>
                    Sign in to the account you want to delete. For your security, we can only delete an account from within that account.
                </p>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button onClick={onLoginRequired} style={primaryBtn(true, false)}>Sign in</button>
                    <button onClick={onCancel} style={ghostBtn}>Cancel</button>
                </div>
            </div>
        );
    } else {
        body = (
            <div style={card}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span style={{ color: T.red, display: "inline-flex" }}><Icon name="trash" size={20} /></span>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: "-.02em" }}>Delete account</h1>
                </div>
                <p style={{ margin: "0 0 20px", fontSize: 14, lineHeight: 1.6, color: T.subtext }}>
                    You're signed in as <strong style={{ color: T.text }}>{email}</strong>. Deleting your account is permanent and cannot be undone.
                </p>

                <div style={{ border: `1px solid ${T.red}44`, background: `${T.red}0d`, borderRadius: 10, padding: "14px 16px", marginBottom: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: T.red, marginBottom: 10 }}>
                        <Icon name="alert" size={15} /> What will be deleted
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.75, color: T.text }}>
                        {DELETED_ITEMS.map(item => <li key={item}>{item}</li>)}
                    </ul>
                </div>

                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 6 }}>
                    Type your email to confirm
                </label>
                <input
                    type="email"
                    value={typed}
                    onChange={e => setTyped(e.target.value)}
                    placeholder={email}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    disabled={busy}
                    style={{
                        width: "100%", boxSizing: "border-box", padding: "11px 13px", fontSize: 14,
                        fontFamily: "inherit", color: T.text, background: T.bg,
                        border: `1px solid ${emailMatches ? T.red : T.border}`, borderRadius: 9, outline: "none",
                    }}
                />

                <label style={{ display: "flex", alignItems: "flex-start", gap: 10, margin: "16px 0 20px", fontSize: 13.5, lineHeight: 1.5, color: T.text, cursor: "pointer" }}>
                    <input type="checkbox" checked={understood} onChange={e => setUnderstood(e.target.checked)} disabled={busy} style={{ marginTop: 3, accentColor: T.red }} />
                    I understand that my account and all associated data will be permanently deleted.
                </label>

                {error && (
                    <div role="alert" style={{ fontSize: 13, color: T.red, background: `${T.red}12`, border: `1px solid ${T.red}44`, borderRadius: 8, padding: "10px 12px", marginBottom: 16 }}>
                        {error}
                    </div>
                )}

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button onClick={handleDelete} disabled={!canDelete} style={primaryBtn(canDelete, true)}>
                        {busy ? "Deleting…" : "Permanently delete my account"}
                    </button>
                    <button onClick={onCancel} disabled={busy} style={ghostBtn}>Cancel</button>
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, background: T.bg, overflowY: "auto" }}>
            <div style={{ maxWidth: 560, width: "100%", margin: "0 auto", boxSizing: "border-box", padding: "40px 20px 60px" }}>
                {body}
            </div>
        </div>
    );
}
