
function PremiumContactForm({ T }) {
    const panelBorder = "rgba(15,23,42,0.08)";
    return (
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
            <div style={{
                borderRadius: 28,
                padding: "40px 36px",
                background: "linear-gradient(135deg, rgba(59,130,246,0.06), rgba(16,185,129,0.08))",
                border: `1px solid ${panelBorder}`,
                boxShadow: "0 16px 48px rgba(15,23,42,0.10)",
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
                    <div style={{
                        width: 52, height: 52, borderRadius: 16, flexShrink: 0,
                        background: "linear-gradient(135deg, rgba(59,130,246,0.18), rgba(16,185,129,0.22))",
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26,
                    }}>✉️</div>
                    <div>
                        <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 800, color: T.green, marginBottom: 4 }}>Contact us</div>
                        <h3 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: "-0.01em" }}>We'd love to hear from you</h3>
                    </div>
                </div>
                <p style={{ margin: "0 0 28px", fontSize: 15, lineHeight: 1.8, color: "rgba(15,23,42,0.70)" }}>
                    Have suggestions, improvements, or queries about TradeEdge? Feel free to write to us directly — we read every message and aim to respond within 1–2 business days.
                </p>
                <div style={{
                    display: "inline-flex", alignItems: "center", gap: 12,
                    padding: "14px 22px", borderRadius: 16,
                    background: "rgba(255,255,255,0.90)",
                    border: `1px solid ${panelBorder}`,
                    boxShadow: "0 2px 10px rgba(15,23,42,0.06)",
                }}>
                    <span style={{ fontSize: 18 }}>📧</span>
                    <a
                        href="mailto:kmk03072018@gmail.com"
                        style={{ fontSize: 16, fontWeight: 700, color: "#0ea5e9", textDecoration: "none", letterSpacing: "0.01em" }}
                    >
                        kmk03072018@gmail.com
                    </a>
                </div>
                <p style={{ margin: "24px 0 0", fontSize: 13, lineHeight: 1.6, color: "rgba(15,23,42,0.48)", fontStyle: "italic" }}>
                    Your feedback helps us make TradeEdge better for everyone. Thank you for taking the time to reach out.
                </p>
            </div>
        </div>
    );
}

function LegalSectionCards({ sections, footerText, callout }) {
    const cardShadow = "0 24px 60px rgba(15,23,42,0.10)";
    const glassBorder = "rgba(15,23,42,0.08)";
    const sectionTitleStyle = { color: "#0f172a", fontSize: 16, fontWeight: 800, margin: 0, letterSpacing: 0.2 };
    const subHeadingStyle = { color: "#0f172a", fontSize: 12, fontWeight: 800, marginBottom: 8, marginTop: 18, letterSpacing: "0.08em", textTransform: "uppercase" };
    const bodyStyle = { color: "rgba(15,23,42,0.72)", lineHeight: 1.85, margin: "0 0 10px", fontSize: 14 };
    const listStyle = { color: "rgba(15,23,42,0.72)", lineHeight: 1.85, fontSize: 14, paddingLeft: 22, margin: "0 0 10px" };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {callout && (
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 16, padding: "20px 22px", borderRadius: 24, border: `1px solid ${callout.border}`, background: callout.background, boxShadow: cardShadow }}>
                    <div style={{ width: 44, height: 44, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.72)", color: callout.iconColor, fontSize: 22, fontWeight: 800 }}>!</div>
                    <div>
                        <div style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 800, color: callout.iconColor, marginBottom: 6 }}>Important notice</div>
                        <div style={{ ...bodyStyle, margin: 0, color: "#78350f", fontWeight: 700 }}>{callout.body}</div>
                    </div>
                </div>
            )}
            {sections.map(section => (
                <section key={section.title} style={{ borderRadius: 24, padding: "24px 24px 22px", background: "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.92))", border: `1px solid ${glassBorder}`, boxShadow: cardShadow }}>
                    <h3 style={sectionTitleStyle}>{section.title}</h3>
                    {section.body && section.body.map(paragraph => <p key={paragraph} style={{ ...bodyStyle, marginTop: 12 }}>{paragraph}</p>)}
                    {section.intro && <p style={{ ...bodyStyle, marginTop: 12 }}>{section.intro}</p>}
                    {section.subSections && section.subSections.map(sub => (
                        <div key={sub.title}>
                            <div style={subHeadingStyle}>{sub.title}</div>
                            <ul style={listStyle}>{sub.bullets.map(item => <li key={item} style={{ marginBottom: 6 }}>{item}</li>)}</ul>
                        </div>
                    ))}
                    {section.bullets && <ul style={{ ...listStyle, marginTop: 10 }}>{section.bullets.map(item => <li key={item} style={{ marginBottom: 6 }}>{item}</li>)}</ul>}
                    {section.outro && <p style={{ ...bodyStyle, marginTop: 12 }}>{section.outro}</p>}
                </section>
            ))}
            <div style={{ marginTop: 4, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(15,23,42,0.42)", fontWeight: 800 }}>{footerText}</div>
        </div>
    );
}

export default function PremiumLegalPage({ T, onClose, initialTab = "disclaimer" }) {
    const [activeTab, setActiveTab] = useState(initialTab);
    const tabs = [
        { id: "disclaimer", label: "Disclaimer", eyebrow: "Risk and conduct", title: "Read the regulatory and platform risk position.", summary: "A clearer presentation of TradeEdge's non-advisory position, data limitations, and user responsibility framework.", highlights: ["Non-advisory", "Risk disclosure", "Data limitations"], tone: "rgba(245,158,11,0.9)" },
        { id: "privacy", label: "Privacy Policy", eyebrow: "Data and security", title: "Understand how information is collected, secured, and retained.", summary: "An editorial privacy view covering account data, storage, processors, user rights, and retention.", highlights: ["Collection scope", "Security controls", "User rights"], tone: "rgba(14,165,233,0.9)" },
        { id: "terms", label: "Terms of Service", eyebrow: "Platform usage", title: "The rules, obligations, and service boundaries for TradeEdge.", summary: "A refined terms layout focused on responsibilities, prohibited use, availability, and legal boundaries.", highlights: ["User duties", "Prohibited activity", "Liability limits"], tone: "rgba(99,102,241,0.9)" },
        { id: "contact", label: "Contact Us", eyebrow: "Support and legal desk", title: "Reach the team through a cleaner premium support flow.", summary: "Use the contact desk for platform support, privacy requests, and legal communication.", highlights: ["Fast routing", "Privacy requests", "Human support"], tone: "rgba(16,185,129,0.9)" },
    ];
    const activeMeta = tabs.find(tab => tab.id === activeTab) || tabs[0];
    const disclaimerSections = [
        { title: "1. Regulatory Status and Non-Advisory Declaration", body: ['TradeEdge ("the Platform," "we," "us," or "our") is a financial analytics and portfolio tracking platform operated as a technology service. The Platform is not registered with the Securities and Exchange Board of India (SEBI) as an Investment Adviser, Research Analyst, Stockbroker, Depository Participant, or Portfolio Manager.', "No content, feature, tool, visualization, output, or communication on the Platform shall be construed as investment advice, a buy or sell recommendation, a solicitation to trade, or a suggestion to hold any security, derivative, mutual fund unit, or any other financial instrument. All information is provided strictly for informational and educational purposes."] },
        { title: "2. No Investment Recommendation", intro: "The Platform does not, and is not designed to:", bullets: ["Recommend the purchase, sale, or retention of any specific security or financial product.", "Predict future market movements, price targets, or investment returns.", "Identify stocks as suitable investments for any individual user.", "Substitute for consultation with a SEBI-registered investment professional."], outro: "Users are solely responsible for their own investment decisions. TradeEdge expressly disclaims any liability arising from reliance on any information, analytics, or data presented on the Platform." },
        { title: "3. Risk Disclosure", intro: "Investing and trading in equity, derivatives, mutual funds, and other financial instruments involve significant risk, including:", bullets: ["Market Risk: Security prices fluctuate due to macroeconomic, geopolitical, and sector-specific factors beyond any platform's ability to predict.", "Volatility Risk: Rapid price swings can result in substantial and sudden loss of capital, particularly in derivative and small-cap instruments.", "Liquidity Risk: Certain securities may not be easily tradeable at the desired price or volume.", "Capital Loss Risk: You may lose part or all of your invested capital. Past performance is not indicative of future results.", "Leverage Risk: Margin and futures trading amplify both gains and losses."], outro: "Users are advised to consult a SEBI-registered investment adviser and a qualified tax professional before making investment or tax-related decisions." },
        { title: "4. Data Accuracy and API Limitations", body: ["Market data, stock quotes, historical prices, fundamental data, and related information are sourced from third-party API providers. TradeEdge does not guarantee the accuracy, completeness, timeliness, or reliability of any such data."], bullets: ["Market data may be delayed, incomplete, or inaccurate due to feed interruptions, API latency, or provider errors.", "Fundamental data is sourced as-is and may not reflect the latest corporate filings.", "Portfolio analytics are indicative only and may not match your broker's official statements or contract notes.", "Capital gains calculations are algorithmic estimates and are not tax advice."] },
    ];
    const privacySections = [
        { title: "1. Introduction", body: ['TradeEdge ("we," "us," or "our") is committed to protecting the privacy of its users. This Privacy Policy describes the categories of personal information we collect, the purposes for which it is used, how it is stored and secured, and the rights available to users with respect to their data.', "This Policy is intended to align with applicable Indian data protection principles, including the Information Technology Act, 2000, the SPDI Rules, 2011, and the Digital Personal Data Protection Act, 2023 to the extent notified and in force."] },
        { title: "2. Data We Collect", subSections: [{ title: "Account and authentication data", bullets: ["Email address used for account creation, login, and service communication.", "Authentication tokens managed via Supabase. We do not store raw passwords.", "Google OAuth profile data such as display name and email when you sign in with Google."] }, { title: "User-generated data", bullets: ["Trade journal entries including ticker, date, quantity, price, and notes.", "Portfolio data and watchlists configured within the Platform.", "Preferences and settings such as display options and themes."] }, { title: "Usage and technical data", bullets: ["Browser type, operating system, device type, and screen resolution.", "IP address and approximate geographic region.", "Pages visited, features used, session duration, and error logs for analytics and service improvement."] }] },
        { title: "3. Data We Do Not Collect", intro: "TradeEdge explicitly does not collect, store, or process:", bullets: ["Bank account numbers, IFSC codes, or net banking credentials.", "Demat account numbers or depository participant credentials.", "Broker login credentials, API keys, or trading platform tokens.", "UPI IDs, card numbers, or payment instrument details.", "PAN, Aadhaar, or government-issued identity document numbers."] },
        { title: "4. Data Use, Security, and Rights", bullets: ["Collected data is used to authenticate accounts, store journal and portfolio data, and provide analytics based on your inputs.", "We use encrypted transport, row-level access controls, and restricted administrative access.", "Users may request access, correction, deletion, export, and withdrawal of consent subject to applicable law.", "Contact support@tradeedge.in for privacy rights requests."], outro: "We do not use your data for advertising profiling, cross-platform tracking, or sale to third parties." },
    ];
    const termsSections = [
        { title: "1. Acceptance and Nature of Service", body: ['By accessing or using the TradeEdge platform, you agree to be bound by these Terms of Service, the Privacy Policy, and the Disclaimer.', "TradeEdge is a self-service financial analytics and portfolio tracking platform for informational and personal record-keeping purposes. It does not execute trades, hold securities, manage funds, or provide regulated financial services."] },
        { title: "2. User Responsibilities", bullets: ["Provide accurate information during account registration and maintain its accuracy.", "Use the Platform solely for lawful purposes and in accordance with these Terms.", "Ensure all trade data and portfolio details entered by you are accurate.", "Independently verify analytics, estimates, and calculations with broker statements and qualified professionals."] },
        { title: "3. Prohibited Activities", bullets: ["Reverse-engineering or extracting source code from the Platform.", "Using bots or crawlers to scrape data without written consent.", "Circumventing authentication or security controls.", "Uploading malicious code or sharing account credentials."] },
        { title: "4. Liability, Availability, and Jurisdiction", bullets: ["TradeEdge provides the Platform on an as-is and as-available basis.", "Service interruptions, API failures, and data limitations may occur and do not create liability against TradeEdge.", "These Terms are governed by the laws of India, and the Courts of Mumbai, Maharashtra, India have exclusive jurisdiction.", "Contact support@tradeedge.in for grievances and account termination requests."] },
    ];

    return (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, background: "linear-gradient(180deg, #eef5fb 0%, #f8fafc 34%, #f3f7fb 100%)", position: "relative" }}>
            <div style={{ position: "sticky", top: 0, zIndex: 10, background: "linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.88))", borderBottom: "1px solid rgba(15,23,42,0.08)", backdropFilter: "blur(16px)", padding: "18px 24px 16px", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(15,23,42,0.48)", marginBottom: 6 }}>Legal hub</div>
                        <h2 style={{ margin: 0, color: "#0f172a", fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>Legal Information</h2>
                    </div>
                    <button onClick={onClose} title="Close" style={{ width: 42, height: 42, background: "rgba(255,255,255,0.88)", border: "1px solid rgba(15,23,42,0.08)", cursor: "pointer", color: T.subtext, fontSize: 18, lineHeight: 1, padding: 0, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>x</button>
                </div>
                <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 2 }}>{tabs.map(tab => <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ background: activeTab === tab.id ? "linear-gradient(135deg, rgba(15,23,42,0.96), rgba(16,185,129,0.92))" : "rgba(255,255,255,0.78)", border: "1px solid rgba(15,23,42,0.08)", cursor: "pointer", padding: "11px 16px", fontFamily: "inherit", fontSize: 12.5, fontWeight: 800, color: activeTab === tab.id ? "#fff" : "#334155", borderRadius: 999, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{tab.label}</button>)}</div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "30px 24px 40px" }}>
                <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
                    <div style={{ position: "relative", overflow: "hidden", borderRadius: 32, padding: "30px 28px", background: `linear-gradient(135deg, rgba(15,23,42,0.96), ${activeMeta.tone})`, boxShadow: "0 34px 90px rgba(15,23,42,0.24)", color: "#fff" }}>
                        <div style={{ position: "absolute", right: -70, top: -90, width: 260, height: 260, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,255,255,0.18), rgba(255,255,255,0))" }} />
                        <div style={{ position: "relative", display: "grid", gridTemplateColumns: "minmax(0, 1.8fr) minmax(260px, 1fr)", gap: 24, alignItems: "end" }}>
                            <div>
                                <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 800, color: "rgba(255,255,255,0.72)", marginBottom: 10 }}>{activeMeta.eyebrow}</div>
                                <h1 style={{ margin: 0, fontSize: 36, lineHeight: 1.06, fontWeight: 800, letterSpacing: "-0.03em", maxWidth: 700 }}>{activeMeta.title}</h1>
                                <p style={{ margin: "14px 0 0", maxWidth: 700, fontSize: 15, lineHeight: 1.85, color: "rgba(255,255,255,0.78)" }}>{activeMeta.summary}</p>
                            </div>
                            <div style={{ padding: "18px 18px 16px", borderRadius: 24, background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)" }}>
                                <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 800, color: "rgba(255,255,255,0.62)", marginBottom: 10 }}>Highlights</div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{activeMeta.highlights.map(item => <div key={item} style={{ display: "flex", alignItems: "center", gap: 10, color: "#fff", fontSize: 14, fontWeight: 700 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,255,255,0.88)", flexShrink: 0 }} />{item}</div>)}</div>
                            </div>
                        </div>
                    </div>
                    {activeTab === "disclaimer" && <LegalSectionCards sections={disclaimerSections} footerText="Last updated: April 2025 | Governing jurisdiction: Courts of Mumbai, India" callout={{ body: "TradeEdge is not a SEBI-registered Investment Advisor, Research Analyst, Broker, or Portfolio Management Service. Nothing on this platform constitutes investment advice.", background: "linear-gradient(180deg, rgba(255,251,235,0.96), rgba(254,243,199,0.88))", border: "rgba(245,158,11,0.28)", iconColor: "#b45309" }} />}
                    {activeTab === "privacy" && <LegalSectionCards sections={privacySections} footerText="Last updated: April 2025 | Contact: support@tradeedge.in" />}
                    {activeTab === "terms" && <LegalSectionCards sections={termsSections} footerText="Last updated: April 2025 | Governing jurisdiction: Courts of Mumbai, Maharashtra, India" />}
                    {activeTab === "contact" && <PremiumContactForm T={T} />}
                </div>
            </div>
        </div>
    );
}