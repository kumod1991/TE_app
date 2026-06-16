import React from 'react';
// â”€â”€â”€ FII/DII DECISION GUIDE â€” Drop-in replacement for the docs tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Usage: Replace the {activeTab==="docs"&&(...)} block in FiiDiiModule.jsx
// Props: { T, phase, absorptionLabel, absorptionTrend, momentumLabel, confidence, tradeImplication, invalidation }
// All props come from the existing computed values in FiiDiiModule

const GR = "#059669"; // emerald
const RD = "#dc2626"; // red
const AM = "#d97706"; // amber
const SK = "#0284c7"; // sky

// â”€â”€â”€ Section wrapper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function DocSection({ icon, title, accent = null, children, T }) {
    return (
        <div style={{
            marginBottom: 2,
            borderRadius: 7,
            border: `1px solid ${accent ? accent + "28" : T.border}`,
            background: accent ? accent + "06" : T.surface,
            overflow: "hidden",
        }}>
            <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 16px",
                borderBottom: `1px solid ${accent ? accent + "1a" : T.border}`,
                background: accent ? accent + "0a" : "transparent",
            }}>
                <span style={{ fontSize: 13 }}>{icon}</span>
                <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: ".12em",
                    textTransform: "uppercase", color: accent || T.subtext,
                }}>{title}</span>
            </div>
            <div style={{ padding: "14px 16px" }}>{children}</div>
        </div>
    );
}

// â”€â”€â”€ Pill badge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function Pill({ label, color, T }) {
    return (
        <span style={{
            display: "inline-block",
            padding: "2px 8px", borderRadius: 3,
            fontSize: 10, fontWeight: 600, letterSpacing: ".04em",
            background: color + "15", color,
            border: `1px solid ${color}30`,
        }}>{label}</span>
    );
}

// â”€â”€â”€ Step row (numbered) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function Step({ n, label, desc, T }) {
    return (
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
            <div style={{
                width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                background: T.text + "12", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, fontWeight: 700, color: T.text,
            }}>{n}</div>
            <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 2 }}>{label}</div>
                {desc && <div style={{ fontSize: 11, color: T.subtext, lineHeight: 1.6 }}>{desc}</div>}
            </div>
        </div>
    );
}

// â”€â”€â”€ Warning row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function Warn({ text, T }) {
    return (
        <div style={{
            display: "flex", gap: 8, alignItems: "flex-start",
            padding: "7px 10px", borderRadius: 5, marginBottom: 5,
            background: AM + "0a", border: `1px solid ${AM}25`,
        }}>
            <span style={{ fontSize: 10, flexShrink: 0, marginTop: 2, color: AM, fontWeight: 700 }}>â–²</span>
            <span style={{ fontSize: 11, color: T.subtext, lineHeight: 1.6 }}>{text}</span>
        </div>
    );
}

// â”€â”€â”€ Metric row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function MetricRow({ label, definition, strong, strong2, weak, T }) {
    return (
        <div style={{
            display: "grid", gridTemplateColumns: "1fr 1.6fr 1fr 1fr",
            gap: 8, alignItems: "start",
            padding: "8px 0", borderBottom: `1px solid ${T.border}`,
            fontSize: 11,
        }}>
            <div style={{ fontWeight: 600, color: T.text }}>{label}</div>
            <div style={{ color: T.subtext, lineHeight: 1.55 }}>{definition}</div>
            <div style={{ color: GR, fontWeight: 500, lineHeight: 1.55 }}>{strong}{strong2 && <><br /><span style={{ color: AM }}>{strong2}</span></>}</div>
            <div style={{ color: RD, fontWeight: 500, lineHeight: 1.55 }}>{weak}</div>
        </div>
    );
}

// â”€â”€â”€ Phase row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function PhaseRow({ emoji, phase, condition, implication, color, T }) {
    return (
        <div style={{
            display: "flex", gap: 12, alignItems: "flex-start",
            padding: "10px 0", borderBottom: `1px solid ${T.border}`,
        }}>
            <div style={{
                width: 8, height: 8, borderRadius: "50%", background: color,
                flexShrink: 0, marginTop: 4,
            }}/>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 3 }}>{phase}</div>
                <div style={{ fontSize: 11, color: T.subtext, marginBottom: 3, lineHeight: 1.5 }}>{condition}</div>
                <div style={{ fontSize: 11, color: T.text, lineHeight: 1.5 }}>â†’ {implication}</div>
            </div>
        </div>
    );
}

// â”€â”€â”€ CURRENT STATE PANEL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function CurrentStatePanel({ phase, absorptionLabel, absorptionTrend, momentumLabel, confidence, tradeImplication, invalidation, T }) {
    if (!phase) return null;

    const phaseColor = phase.includes("Distribution") ? RD
        : phase.includes("Accumulation") ? GR
        : phase.includes("Recovery") ? SK
        : AM;

    const absColor = absorptionLabel?.color || AM;
    const momColor = momentumLabel?.color || AM;
    const confColor = confidence?.color || AM;

    return (
        <DocSection icon="â—‰" title="Current State â€” Live Reading" accent={phaseColor} T={T}>
            {/* Phase + Absorption headline */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                <Pill label={phase} color={phaseColor} T={T} />
                {absorptionLabel?.label && <Pill label={absorptionLabel.label} color={absColor} T={T} />}
                {momentumLabel?.label && <Pill label={momentumLabel.label} color={momColor} T={T} />}
                {confidence && <Pill label={`Confidence: ${confidence.pct}% ${confidence.label}`} color={confColor} T={T} />}
            </div>

            {/* Trade implication */}
            {tradeImplication && (
                <div style={{
                    padding: "9px 12px", borderRadius: 5, marginBottom: 10,
                    background: phaseColor + "0d", border: `1px solid ${phaseColor}28`,
                    fontSize: 12, fontWeight: 500, color: T.text, lineHeight: 1.6,
                }}>
                    {tradeImplication}
                </div>
            )}

            {/* Invalidation */}
            {invalidation?.text && (
                <div style={{
                    display: "flex", gap: 10, alignItems: "flex-start",
                    padding: "9px 12px", borderRadius: 5,
                    background: (invalidation.color || AM) + "0a",
                    border: `1px solid ${(invalidation.color || AM)}28`,
                    fontSize: 11, color: T.subtext, lineHeight: 1.6,
                }}>
                    <span style={{ flexShrink: 0, fontWeight: 700, color: invalidation.color || AM, fontSize: 9, letterSpacing: ".08em", textTransform: "uppercase", paddingTop: 1 }}>Watch</span>
                    <span>{invalidation.text}</span>
                </div>
            )}
        </DocSection>
    );
}

// â”€â”€â”€ MAIN EXPORT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function FiiDiiDocsTab({
    T,
    // Live state props (pass from FiiDiiModule computed values)
    phase,
    absorptionLabel,
    absorptionTrend,
    momentumLabel,
    confidence,
    tradeImplication,
    invalidation,
}) {
    const hasLiveData = !!phase;

    return (
        <div style={{ maxWidth: 680, display: "flex", flexDirection: "column", gap: 8 }}>

            {/* â”€â”€ 1. HOW TO READ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <DocSection icon="â†’" title="How to Read This Dashboard" accent={SK} T={T}>
                <Step n="1" label="Start with Phase" desc="Phase defines the structural regime â€” the most important signal. Sets the context for everything else." T={T} />
                <Step n="2" label="Check Absorption" desc="Absorption tells you if domestic institutions are stepping in. High absorption means selling pressure is being cushioned." T={T} />
                <Step n="3" label="Read Momentum" desc="Momentum detects early directional shifts. An early warning, not a confirmation." T={T} />
                <Step n="4" label="Validate with Derivatives" desc="Derivatives confirm or contradict cash flows. Divergence between cash and derivatives = extra uncertainty." T={T} />
                <div style={{
                    marginTop: 6, padding: "7px 10px", borderRadius: 4,
                    background: SK + "0a", border: `1px solid ${SK}25`,
                    fontSize: 11, color: T.subtext, lineHeight: 1.6,
                }}>
                    <span style={{ fontWeight: 600, color: SK }}>Reading order:</span> Phase â†’ Absorption â†’ Momentum â†’ Derivatives
                </div>
            </DocSection>

            {/* â”€â”€ 2. CURRENT STATE (live, only if data available) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            {hasLiveData && (
                <CurrentStatePanel
                    phase={phase}
                    absorptionLabel={absorptionLabel}
                    absorptionTrend={absorptionTrend}
                    momentumLabel={momentumLabel}
                    confidence={confidence}
                    tradeImplication={tradeImplication}
                    invalidation={invalidation}
                    T={T}
                />
            )}

            {/* â”€â”€ 3. COMMON MISINTERPRETATIONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <DocSection icon="â–²" title="Common Misinterpretations" accent={AM} T={T}>
                <Warn text="Strong absorption â‰  bullish reversal. DII buying cushions falls â€” it does not cause uptrends." T={T} />
                <Warn text="Improving momentum â‰  trend change. Momentum shows the direction of change, not its completion." T={T} />
                <Warn text="Transition Phase â‰  directional signal. Transition is the default state â€” mixed or indeterminate flows. Avoid forcing a view." T={T} />
                <Warn text="Derivatives alone â‰  market direction. Index futures and options show positioning bias, not outcome." T={T} />
                <Warn text="Recovery Phase â‰  confirmed uptrend. Recovery requires FII 20D to cross above 0 before becoming structural." T={T} />
                <Warn text="High confidence â‰  guaranteed result. Confidence reflects signal clarity, not price outcome." T={T} />
            </DocSection>

            {/* â”€â”€ 4. KEY METRICS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <DocSection icon="â‰¡" title="Key Metrics" T={T}>
                <div style={{
                    display: "grid", gridTemplateColumns: "1fr 1.6fr 1fr 1fr",
                    gap: 4, padding: "4px 0 8px", marginBottom: 2,
                    borderBottom: `1px solid ${T.border}`,
                }}>
                    {["Metric", "What it measures", "Strong signal", "Weak signal"].map((h, i) => (
                        <div key={i} style={{ fontSize: 9, fontWeight: 700, color: T.subtext, textTransform: "uppercase", letterSpacing: ".1em" }}>{h}</div>
                    ))}
                </div>
                <MetricRow label="FII 20D" definition="Rolling 20-day sum of FII net flows. Represents institutional trend strength." strong="> 0 (buying)" weak="< âˆ’50K (deep sell)" T={T} />
                <MetricRow label="DII 20D" definition="Rolling 20-day sum of DII net flows. Represents domestic support base." strong="> 0 (active support)" weak="< 0 (domestic exit)" T={T} />
                <MetricRow label="Momentum" definition="FII 5D minus FII 20D. Positive = FII short-term flows improving vs trend." strong="> +20K (clear shift)" weak="< 0 (worsening)" T={T} />
                <MetricRow label="Absorption" definition="DII 20D Ã· |FII 20D|. How much DII is absorbing FII selling." strong="> 1.2 (strong)" strong2="0.5â€“1.2 (moderate)" weak="< 0.5 (weak/absent)" T={T} />
                <MetricRow label="Confidence" definition="Phase base + absorption modifier + momentum modifier. Hard-capped per phase." strong="> 75 = High" weak="< 50 = Low" T={T} />
            </DocSection>

            {/* â”€â”€ 5. PHASE LOGIC â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <DocSection icon="â—ˆ" title="Phase Logic â€” Priority Order" T={T}>
                <div style={{ fontSize: 11, color: T.subtext, marginBottom: 10, lineHeight: 1.6 }}>
                    Phases are checked in strict priority order. Distribution is evaluated first to prevent false Recovery signals.
                </div>
                <PhaseRow phase="Distribution" color={RD}
                    condition="FII 20D < âˆ’50K and DII 20D < 0 â€” OR â€” absorption < 0.5"
                    implication="Broad institutional selling. Avoid longs. Sell-on-rise bias."
                    T={T} />
                <PhaseRow phase="Accumulation" color={GR}
                    condition="FII 20D > 0 AND DII 20D > 0"
                    implication="Both institutions buying. Buy-on-dips environment."
                    T={T} />
                <PhaseRow phase="Recovery" color={SK}
                    condition="FII 20D > âˆ’40K AND FII 5D > FII 20D AND momentum > 0"
                    implication="Selling slowing, early reversal forming. Cautious long bias."
                    T={T} />
                <PhaseRow phase="Transition" color={AM}
                    condition="All other cases (default / catch-all)"
                    implication="Mixed or indeterminate flows. Wait for confirmation. No directional bias."
                    T={T} />
                <div style={{
                    marginTop: 10, padding: "8px 10px", borderRadius: 4,
                    background: T.text + "06", border: `1px solid ${T.border}`,
                    fontSize: 11, color: T.subtext, lineHeight: 1.6,
                }}>
                    <span style={{ fontWeight: 600, color: T.text }}>Absorption</span> is computed independently â€” it never changes the phase label. Phase = structure. Absorption = support strength.
                </div>
            </DocSection>

            {/* â”€â”€ 6. DATA SOURCES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <DocSection icon="âŠ¡" title="Data Sources" T={T}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {[
                        { label: "Cash Flows", detail: "fii_dii_activity â€” Daily FII & DII gross buy/sell and net flows in â‚¹ Crore. Source: NSE." },
                        { label: "Derivatives OI", detail: "fii_dii_fo â€” Index Futures, Index Calls, Index Puts split by long/short. NSE Participant-wise OI. Filtered by client_type FII or DII." },
                        { label: "Smoothing", detail: "All primary signals use 5-day and 20-day rolling sums. Raw daily values available in the Databases tab." },
                    ].map(({ label, detail }) => (
                        <div key={label} style={{ display: "flex", gap: 12, fontSize: 11 }}>
                            <div style={{ width: 90, flexShrink: 0, fontWeight: 600, color: T.text, paddingTop: 1 }}>{label}</div>
                            <div style={{ color: T.subtext, lineHeight: 1.65 }}>{detail}</div>
                        </div>
                    ))}
                </div>
            </DocSection>

            {/* â”€â”€ Disclaimer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <div style={{ fontSize: 10, color: T.subtext, padding: "4px 2px", lineHeight: 1.7, opacity: 0.7 }}>
                For informational purposes only. Not SEBI registered. Not investment advice. Market data may be delayed.
            </div>
        </div>
    );
}

// â”€â”€â”€ DROP-IN REPLACEMENT SNIPPET â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// In FiiDiiModule.jsx, replace the {activeTab==="docs"&&(...)} block with:
//
// {activeTab === "docs" && (
//     <FiiDiiDocsTab
//         T={T}
//         phase={flowPhase.phase}
//         absorptionLabel={flowPhase.absLabel}
//         absorptionTrend={flowPhase.absT}
//         momentumLabel={flowPhase.momLabel}
//         confidence={flowPhase.confidence}
//         tradeImplication={flowPhase.tradeImpl}
//         invalidation={flowPhase.invalidation}
//     />
// )}
//
// All props come directly from the existing `flowPhase` useMemo in FiiDiiModule.
// Either import { FiiDiiDocsTab } from "./FiiDiiDocsTab"
// or paste this component directly into FiiDiiModule.jsx above the main export.


