import fs from "node:fs";
import path from "node:path";

const SITE_NAME = "TradeEdge";
const BASE_URL = "https://tradeedge.in";
const OUT_DIR = path.join(process.cwd(), "public");

const nav = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "FAQ", href: "/faq" },
  { label: "Learn", href: "/learn" },
  { label: "Fundamentals", href: "/fundamentals" },
  { label: "Technicals", href: "/technicals" },
  { label: "Journal", href: "/journal" },
  { label: "Legal", href: "/legal" },
];

const pages = [
  {
    url: "/about",
    title: "About TradeEdge",
    description: "Learn what TradeEdge is, who it is for, and how the platform helps Indian market participants organize research and journaling.",
    hero: "About",
    intro: "TradeEdge is a focused Indian market research workspace built to help traders and investors organize screening, chart review, watchlists, and trade journaling in one place.",
    features: [
      "Built for Indian equities, sector analysis, and trading workflows.",
      "Combines research, tracking, and journaling rather than forcing separate tools.",
      "Designed for practical use by active traders and long-term investors alike.",
    ],
    sections: [
      {
        heading: "What TradeEdge does",
        paragraphs: [
          "TradeEdge helps users move from market scan to deeper analysis without losing context. The platform brings together stock screening, company research, flow tracking, market breadth, and journaling into one workspace.",
          "The goal is to reduce the friction between idea generation and actual review. Instead of opening multiple websites and spreadsheets, a user can keep the important parts of their workflow in one place.",
        ],
      },
      {
        heading: "Who it is for",
        paragraphs: [
          "The site is useful for active Indian traders, swing traders, position traders, and investors who want a cleaner process. It is also helpful for people learning how to read market structure, institutional flow, and technical setups.",
          "The platform is especially suited to users who care about repeatable process, reviewable decisions, and keeping an audit trail of their thinking over time.",
        ],
      },
    ],
    related: ["/learn", "/fundamentals", "/technicals", "/journal"],
  },
  {
    url: "/faq",
    title: "TradeEdge FAQ",
    description: "Answers to common questions about TradeEdge, including what the platform does, how the research tools work, and who should use it.",
    hero: "FAQ",
    intro: "These answers explain what TradeEdge is, how the major modules fit together, and what kind of user gets the most value from the platform.",
    features: [
      "Clarifies the platform purpose for new visitors.",
      "Supports trust and reduces bounce from first-time users.",
      "Adds helpful, readable text for search and AdSense review.",
    ],
    faq: [
      {
        q: "What is TradeEdge?",
        a: "TradeEdge is an Indian stock market analytics workspace for screening stocks, reviewing company data, tracking market breadth, following institutional flows, and journaling trades.",
      },
      {
        q: "Is TradeEdge a trading app or a research tool?",
        a: "It is primarily a research and journaling tool. It helps users organize information and review decisions, but it does not replace independent judgment.",
      },
      {
        q: "Who should use TradeEdge?",
        a: "Traders and investors who follow Indian equities, care about process, and want a cleaner workflow for screening and review usually get the most value.",
      },
      {
        q: "Why does the site have so many pages?",
        a: "The site groups different research tasks into focused pages so users can move from broad market context to specific work without rebuilding the same search every time.",
      },
      {
        q: "Does TradeEdge provide investment advice?",
        a: "No. It is a technology and analytics platform. Users are responsible for their own decisions and should review the legal and disclaimer pages before relying on the outputs.",
      },
    ],
    related: ["/about", "/learn", "/fundamentals", "/journal"],
  },
  {
    url: "/learn",
    title: "TradeEdge Learning Hub",
    description: "Guides for Indian stock screening, market breadth, watchlists, trade journaling, and portfolio review.",
    hero: "Learning Hub",
    intro: "This hub collects practical guides that explain how to use TradeEdge and how to think about the market modules inside it.",
    features: [
      "Read a guide before diving into a module.",
      "Learn how the different data views connect to each other.",
      "Use the hub as a strong internal link destination for search.",
    ],
    sections: [
      {
        heading: "Why this hub exists",
        paragraphs: [
          "People usually need help not only with the product, but with the ideas behind it. This hub exists so the site can explain its workflow in plain language instead of only showing screens.",
          "That makes the content more useful for first-time visitors and more credible for search and AdSense review.",
        ],
      },
      {
        heading: "How to use it",
        paragraphs: [
          "Start with the guide that matches your biggest question. If you are screening, read the screening guide. If you are reviewing market health, read the breadth guide. If you are improving your process, read the journaling guide.",
          "Each guide is intentionally short, practical, and tied to one specific workflow.",
        ],
      },
    ],
    related: ["/learn/stock-screening-guide", "/learn/market-breadth-guide", "/learn/trade-journal-guide"],
  },
  {
    url: "/learn/stock-screening-guide",
    title: "How to Screen Indian Stocks",
    description: "A practical guide to building a stock screening workflow for Indian equities.",
    hero: "Stock Screening Guide",
    intro: "A good stock screen should narrow the market to a manageable list of names worth deeper review.",
    features: [
      "Learn how to define your filters before looking at results.",
      "Use quality, valuation, growth, and ownership together instead of one factor alone.",
      "Refine screens into a shortlist you can actually review.",
    ],
    sections: [
      {
        heading: "Start with a clear objective",
        paragraphs: [
          "A screen should answer a specific question. Are you looking for momentum names, quality compounders, turnaround candidates, or event-driven ideas? The filter set should match the question.",
          "When the objective is vague, the output becomes noisy. A useful screen begins with a working thesis and then applies filters that support that thesis.",
        ],
      },
      {
        heading: "Use multiple layers",
        paragraphs: [
          "A single metric rarely tells the whole story. Screening becomes more useful when you combine growth, valuation, ownership, and market behavior. That helps avoid overcommitting to one dimension of the stock.",
          "For example, a company with strong growth may still be unattractive if the ownership trend is weak or if the stock is losing relative strength versus its peers.",
        ],
      },
    ],
    related: ["/fundamentals", "/fundamentals/screener", "/learn/market-breadth-guide"],
  },
  {
    url: "/learn/market-breadth-guide",
    title: "How to Use Market Breadth",
    description: "A guide to breadth indicators, participation, and market internals.",
    hero: "Breadth Guide",
    intro: "Breadth helps you see whether a market move is healthy, narrow, or losing support beneath the surface.",
    features: [
      "Check participation beyond the headline index.",
      "Use breadth to separate strong rallies from fragile ones.",
      "Watch for deterioration before it becomes obvious on price charts.",
    ],
    sections: [
      {
        heading: "Breadth tells you about participation",
        paragraphs: [
          "A market can rise even when only a few stocks are doing the heavy lifting. Breadth measures whether more stocks are joining the move or whether leadership is becoming more concentrated.",
          "Healthy advances typically have wider participation, while weak advances often depend on a shrinking group of leaders.",
        ],
      },
      {
        heading: "Why traders care",
        paragraphs: [
          "Breadth can help traders avoid chasing moves that are already losing support. It can also help them stay with a trend when participation is still improving.",
          "The best use of breadth is as a context filter. It improves timing and helps interpret price action more intelligently.",
        ],
      },
    ],
    related: ["/technicals/breadth", "/technicals/rotation", "/learn/fii-dii-guide"],
  },
  {
    url: "/learn/fii-dii-guide",
    title: "How to Read FII and DII Flows",
    description: "A guide to institutional flow tracking and why it matters for Indian market context.",
    hero: "FII / DII Guide",
    intro: "Institutional flow data gives context to market moves and can help confirm whether a trend is supported by serious participation.",
    features: [
      "Understand how flow data complements price action.",
      "Use institutional signals as confirmation, not a standalone signal.",
      "Watch for changes in behavior across sessions and market phases.",
    ],
    sections: [
      {
        heading: "Why flows matter",
        paragraphs: [
          "FII and DII activity can help explain why price action feels persistent or fragile. When flows support a move, trends often have a better chance of continuing. When flows weaken, rallies may become narrow and easier to reverse.",
          "The important idea is not to predict with flow data alone, but to use it as a context layer for the rest of the market picture.",
        ],
      },
      {
        heading: "How to use the data",
        paragraphs: [
          "Look at the flow trend over time instead of one isolated day. A single session can be noisy. A sequence of sessions gives a better read on whether institutions are supporting or reducing exposure.",
          "Pair the flow view with breadth and sector leadership so you can judge whether the move is broad-based or concentrated.",
        ],
      },
    ],
    related: ["/fundamentals/fiidii", "/technicals/breadth", "/learn/market-breadth-guide"],
  },
  {
    url: "/learn/watchlist-guide",
    title: "How to Build a Better Watchlist",
    description: "A practical watchlist workflow for Indian traders and investors.",
    hero: "Watchlist Guide",
    intro: "A watchlist is most useful when it acts like a decision queue, not a dumping ground for random symbols.",
    features: [
      "Organize symbols by thesis and setup quality.",
      "Keep ideas close to the reason they were added.",
      "Use the watchlist as a bridge between screening and execution.",
    ],
    sections: [
      {
        heading: "Think in categories",
        paragraphs: [
          "A useful watchlist usually separates momentum names, swing candidates, longer-term holdings, and event-driven ideas. That makes review faster and decisions clearer.",
          "If every symbol goes into one bucket, the watchlist becomes harder to maintain and less useful for actual trading.",
        ],
      },
      {
        heading: "Write down the reason",
        paragraphs: [
          "The simple act of recording why a stock was added often improves discipline. You can later compare the original thesis with what actually happened.",
          "TradeEdge supports that process by letting the user move between screening, tracking, and journaling without losing context.",
        ],
      },
    ],
    related: ["/watchlist", "/fundamentals/screener", "/learn/trade-journal-guide"],
  },
  {
    url: "/learn/trade-journal-guide",
    title: "How to Use a Trade Journal",
    description: "A guide to logging trades, reviewing execution, and learning from outcomes.",
    hero: "Journal Guide",
    intro: "A journal helps turn trading from a sequence of outcomes into a repeatable learning process.",
    features: [
      "Log not just the trade, but the reason behind it.",
      "Review behavior patterns instead of judging only profits and losses.",
      "Use the journal to improve process quality over time.",
    ],
    sections: [
      {
        heading: "Record context, not just numbers",
        paragraphs: [
          "A trade journal is most valuable when it captures the setup, the idea, the trigger, and the exit rationale. Entry and exit price alone rarely explain why a trade worked or failed.",
          "The more consistently you record context, the easier it becomes to identify mistakes and repeat good behavior.",
        ],
      },
      {
        heading: "Review the process",
        paragraphs: [
          "The point of journaling is improvement. That means looking for patterns in timing, sizing, hesitation, premature exits, and overconfidence.",
          "Over time, the journal becomes a feedback loop that helps refine both strategy and execution.",
        ],
      },
    ],
    related: ["/journal", "/journal/trades", "/journal/analytics"],
  },
  {
    url: "/learn/technical-breakout-guide",
    title: "How to Evaluate a Technical Breakout",
    description: "A guide to breakout quality, volume, and context for Indian stocks.",
    hero: "Breakout Guide",
    intro: "Not every breakout is equal. Context, volume, and market structure all affect whether a move is worth following.",
    features: [
      "Look at breakout quality, not just the point where price crossed a level.",
      "Check if the move is supported by relative strength and volume.",
      "Use market context before committing capital.",
    ],
    sections: [
      {
        heading: "Breakout context matters",
        paragraphs: [
          "A breakout that occurs in a strong market environment tends to be more credible than one that appears in a weak or fragmented market. That is why breadth and sector leadership matter.",
          "The chart itself is important, but the surrounding market context often determines whether the move can continue.",
        ],
      },
      {
        heading: "Volume and follow-through",
        paragraphs: [
          "Volume is one of the clearest clues that participation is real. Strong follow-through can signal that the market accepts the new price level.",
          "If a breakout lacks support from participation, traders often wait for more confirmation before acting.",
        ],
      },
    ],
    related: ["/technicals/screens", "/technicals/breadth", "/learn/market-breadth-guide"],
  },
  {
    url: "/learn/portfolio-tracking-guide",
    title: "How to Track a Portfolio",
    description: "A guide to tracking holdings, exposure, allocation, and performance in a structured way.",
    hero: "Portfolio Tracking",
    intro: "Portfolio tracking becomes more useful when it shows both the current state of the book and the history behind it.",
    features: [
      "Review holdings and allocation with enough clarity to make changes.",
      "Separate realized outcomes from open-position behavior.",
      "Keep cash flow, exposure, and outcome tracking in one workflow.",
    ],
    sections: [
      {
        heading: "Track what matters",
        paragraphs: [
          "A good portfolio view should show allocation, exposure, and current performance without forcing the user to rebuild the picture manually. That is why a dedicated tracker is useful.",
          "When you can see the whole book, you can make better decisions about concentration, diversification, and risk.",
        ],
      },
      {
        heading: "Tie it back to your process",
        paragraphs: [
          "Portfolio tracking works best when it links to your journal and watchlist. Then the portfolio is not just a snapshot; it becomes part of an ongoing decision process.",
          "That connection is the reason the TradeEdge journal area includes both performance and review-oriented views.",
        ],
      },
    ],
    related: ["/journal/portfolio", "/journal/dashboard", "/learn/trade-journal-guide"],
  },
  {
    url: "/fundamentals",
    title: "Fundamental Stock Screener",
    description: "Screen Indian stocks using fundamentals, ownership, FII/DII activity, announcements, and research-ready company data.",
    hero: "Fundamentals",
    intro: "TradeEdge helps you compare quality, valuation, ownership, institutional flows, and company disclosures from one Indian equity research workspace.",
    features: [
      "Screen by financial strength, valuation, growth, and ownership quality.",
      "Move from a company search to a full research view without changing tools.",
      "Track corporate announcements and flow changes alongside fundamentals.",
    ],
    sections: [
      {
        heading: "What belongs here",
        paragraphs: [
          "Fundamental analysis is most useful when it combines several dimensions rather than relying on one valuation ratio. Quality, growth, ownership, and event flow all matter.",
          "This page acts as the hub for the company-level research workflow inside TradeEdge.",
        ],
      },
    ],
    related: ["/fundamentals/screener", "/fundamentals/search", "/fundamentals/fiidii"],
  },
  {
    url: "/fundamentals/screener",
    title: "Indian Stock Screener",
    description: "Filter Indian equities with quality, valuation, growth, ownership, and market data factors.",
    hero: "Stock Screener",
    intro: "Use the screener to move from broad market noise to a smaller list of stocks that fit your process.",
    features: [
      "Filter companies by the factors that matter to your style.",
      "Review results in a research-first format instead of a generic table.",
      "Pivot quickly into deeper company analysis and watchlist decisions.",
    ],
    sections: [
      {
        heading: "How to think about a screen",
        paragraphs: [
          "A screen should reduce the market to a list you can genuinely inspect. The point is not to search for perfection; it is to create a practical shortlist.",
          "If the output still feels too broad, tighten the criteria until the list reflects a clear process.",
        ],
      },
    ],
    related: ["/fundamentals", "/learn/stock-screening-guide", "/fundamentals/fiidii"],
  },
  {
    url: "/technicals",
    title: "Technical Screens and Market Breadth",
    description: "Find technical breakouts, pullbacks, relative strength leaders, sector heatmaps, and breadth signals for Indian markets.",
    hero: "Technicals",
    intro: "Use the technicals hub to study participation, leadership, and setup quality across the market.",
    features: [
      "Move from broad market internals to actionable chart setups.",
      "Check sector and stock strength in one place.",
      "Use breadth and rotation to validate trend durability.",
    ],
    sections: [
      {
        heading: "What this hub covers",
        paragraphs: [
          "The technical section is for market structure, participation, and setup quality. It is where the platform brings together breadth, screens, heatmaps, and relative rotation.",
          "Together, those pages help users understand whether price action is being backed by healthy participation.",
        ],
      },
    ],
    related: ["/technicals/breadth", "/technicals/screens", "/technicals/rotation"],
  },
  {
    url: "/technicals/breadth",
    title: "Market Breadth Dashboard",
    description: "Read participation, new highs, relative strength, trend alignment, and market internals for Indian equities.",
    hero: "Market Breadth",
    intro: "Breadth tells you whether market strength is being supported by many stocks or only a few names.",
    features: [
      "Track internal strength instead of relying on the headline index alone.",
      "Spot improving participation before it becomes obvious in price.",
      "Use the dashboard to understand whether a rally is broad or narrow.",
    ],
    sections: [
      {
        heading: "Why breadth matters",
        paragraphs: [
          "Breadth is one of the best ways to test whether a market move has underlying health. It can reveal when leadership is narrowing even if the index still looks fine.",
          "That makes it a useful context signal for both traders and investors.",
        ],
      },
    ],
    related: ["/technicals", "/learn/market-breadth-guide", "/fundamentals/fiidii"],
  },
  {
    url: "/journal",
    title: "Trade Journal, Portfolio and XIRR Tracker",
    description: "Record trades, track funds, review dividends, estimate capital gains, and analyze portfolio performance in one journal.",
    hero: "Journal",
    intro: "The journal combines trades, portfolio tracking, and performance analytics so you can review process as well as outcomes.",
    features: [
      "Keep trade history, funds, dividends, and performance under one roof.",
      "Use the journal to spot execution habits and repeatable patterns.",
      "Move between logging, analytics, and portfolio views without losing context.",
    ],
    sections: [
      {
        heading: "Why journaling matters",
        paragraphs: [
          "The journal is the place where decisions become reviewable. That helps users compare what they thought at entry with what actually happened later.",
          "It also gives the site more substantial text content for search and monetization review.",
        ],
      },
    ],
    related: ["/journal/dashboard", "/journal/portfolio", "/journal/trades"],
  },
  {
    url: "/journal/portfolio",
    title: "Portfolio Tracker",
    description: "Monitor holdings, live or end-of-day prices, exposure, allocation, and open trade performance.",
    hero: "Portfolio Tracker",
    intro: "This is the portfolio page for reviewing holdings, allocation, and how open positions are behaving.",
    features: [
      "Track holdings and open position performance in one place.",
      "Review allocation and exposure without switching tools.",
      "Use the page to support review, journaling, and rebalancing decisions.",
    ],
    sections: [
      {
        heading: "What to look at",
        paragraphs: [
          "Portfolio tracking is not only about profit and loss. It is also about concentration, exposure, position sizing, and the balance between different ideas.",
          "When you can review all of that in one place, decisions get easier and more disciplined.",
        ],
      },
    ],
    related: ["/journal", "/journal/dashboard", "/learn/portfolio-tracking-guide"],
  },
  {
    url: "/legal",
    title: "Legal, Privacy and Contact",
    description: "Read TradeEdge disclaimers, privacy policy, terms of use, and contact information.",
    hero: "Legal",
    intro: "This section keeps the platform's disclaimers, privacy, terms, and contact details easy to find.",
    features: [
      "Review the platform's risk and liability position.",
      "Find the privacy and terms pages in one place.",
      "Open the contact page if you need support or clarification.",
    ],
    related: ["/legal/disclaimer", "/legal/privacy", "/legal/terms", "/legal/contact"],
  },
];

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderNav(currentUrl) {
  return nav.map(({ label, href }) => {
    const active = currentUrl === href ? " aria-current=\"page\"" : "";
    return `<a href="${href}"${active}>${escapeHtml(label)}</a>`;
  }).join("");
}

function renderSections(sections = []) {
  return sections.map((section) => `
        <article class="card">
          <h2>${escapeHtml(section.heading)}</h2>
          ${section.paragraphs.map((paragraph) => `<p class="copy">${escapeHtml(paragraph)}</p>`).join("")}
        </article>`).join("");
}

function renderFaq(faq = []) {
  if (!faq.length) return "";
  return faq.map((item) => `
        <article class="card">
          <h2>${escapeHtml(item.q)}</h2>
          <p class="copy">${escapeHtml(item.a)}</p>
        </article>`).join("");
}

function renderSchema(page) {
  const pageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: page.title,
    url: `${BASE_URL}${page.url}`,
    description: page.description,
    isPartOf: {
      "@type": "WebSite",
      name: SITE_NAME,
      url: BASE_URL,
    },
  };
  if (!page.faq?.length) return pageSchema;
  return [
    pageSchema,
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: page.faq.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.a,
        },
      })),
    },
  ];
}

function renderPage(page) {
  const canonical = `${BASE_URL}${page.url}`;
  const title = `${page.title} | ${SITE_NAME}`;
  const navHtml = renderNav(page.url);
  const featuresHtml = page.features.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const relatedHtml = (page.related || []).map((href) => `<a href="${href}">${escapeHtml(href.replace(/^\/+/, "").replaceAll("/", " / "))}</a>`).join("");
  const schema = renderSchema(page);

  return `<!doctype html>
<html lang="en-IN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#f8fafc" />
    <meta name="robots" content="index,follow,max-image-preview:large" />
    <meta name="description" content="${escapeHtml(page.description)}" />
    <title>${escapeHtml(title)}</title>
    <link rel="canonical" href="${canonical}" />
    <link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192" />
    <link rel="apple-touch-icon" href="/tradeedge_logo.png" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(page.description)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="${BASE_URL}/og-image.svg" />
    <meta property="og:image:alt" content="TradeEdge ${escapeHtml(page.title)} preview" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(page.description)}" />
    <meta name="twitter:image" content="${BASE_URL}/og-image.svg" />
    <script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>
    <style>
      :root {
        color-scheme: light;
        --bg: #f3f7fb;
        --panel: rgba(255,255,255,.92);
        --panel-border: rgba(15,23,42,.09);
        --text: #0f172a;
        --muted: #475569;
        --accent: #0f766e;
        --accent-2: #1d4ed8;
        --shadow: 0 24px 80px rgba(15,23,42,.08);
      }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        min-height: 100%;
        background:
          radial-gradient(circle at top left, rgba(29,78,216,.13), transparent 32%),
          radial-gradient(circle at top right, rgba(15,118,110,.12), transparent 28%),
          var(--bg);
        color: var(--text);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body::before {
        content: "";
        position: fixed;
        inset: 0;
        background-image:
          linear-gradient(rgba(15,23,42,.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(15,23,42,.03) 1px, transparent 1px);
        background-size: 24px 24px;
        pointer-events: none;
        mask-image: linear-gradient(to bottom, rgba(0,0,0,.35), transparent 85%);
      }
      a { color: inherit; text-decoration: none; }
      .shell {
        position: relative;
        max-width: 1120px;
        margin: 0 auto;
        padding: 28px 20px 56px;
      }
      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 34px;
        flex-wrap: wrap;
      }
      .brand { display: flex; flex-direction: column; gap: 4px; }
      .brand strong { letter-spacing: .12em; font-size: 13px; }
      .brand span { color: var(--muted); font-size: 13px; }
      .nav { display: flex; gap: 10px; flex-wrap: wrap; }
      .nav a, .cta, .related a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        padding: 10px 14px;
        font-size: 13px;
        border: 1px solid var(--panel-border);
        background: rgba(255,255,255,.74);
        box-shadow: 0 8px 24px rgba(15,23,42,.04);
      }
      .nav a[aria-current="page"] {
        background: rgba(15,118,110,.1);
        border-color: rgba(15,118,110,.24);
        color: #0f766e;
        font-weight: 700;
      }
      .hero {
        position: relative;
        overflow: hidden;
        border: 1px solid var(--panel-border);
        border-radius: 28px;
        background: var(--panel);
        box-shadow: var(--shadow);
        padding: 38px;
      }
      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border-radius: 999px;
        padding: 8px 12px;
        background: rgba(29,78,216,.08);
        color: #1d4ed8;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      h1 {
        margin: 18px 0 12px;
        font-size: clamp(36px, 5vw, 64px);
        line-height: 1.02;
        letter-spacing: -.05em;
      }
      .lead {
        max-width: 72ch;
        color: var(--muted);
        font-size: clamp(17px, 2vw, 19px);
        line-height: 1.7;
        margin: 0;
      }
      .actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 24px; }
      .cta { background: linear-gradient(135deg, var(--accent), var(--accent-2)); color: white; border: none; font-weight: 700; }
      .grid { display: grid; grid-template-columns: 1.3fr .9fr; gap: 20px; margin-top: 22px; }
      .stack { display: grid; gap: 16px; margin-top: 20px; }
      .card {
        border: 1px solid var(--panel-border);
        border-radius: 24px;
        background: rgba(255,255,255,.86);
        box-shadow: 0 14px 36px rgba(15,23,42,.05);
        padding: 24px;
      }
      h2 { margin: 0 0 12px; font-size: 22px; letter-spacing: -.03em; }
      ul { margin: 0; padding-left: 18px; color: var(--muted); line-height: 1.8; }
      .copy { color: var(--muted); line-height: 1.8; margin: 0 0 12px; }
      .copy:last-child { margin-bottom: 0; }
      .related { display: flex; gap: 10px; flex-wrap: wrap; }
      .footer { margin-top: 26px; color: var(--muted); font-size: 13px; line-height: 1.6; }
      @media (max-width: 900px) {
        .grid { grid-template-columns: 1fr; }
        .hero { padding: 26px; border-radius: 22px; }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <div class="topbar">
        <div class="brand">
          <strong>TRADEEDGE</strong>
          <span>Indian stock market analytics workspace</span>
        </div>
        <nav class="nav" aria-label="Primary">${navHtml}</nav>
      </div>
      <section class="hero">
        <span class="eyebrow">${escapeHtml(page.hero)}</span>
        <h1>${escapeHtml(page.title)}</h1>
        <p class="lead">${escapeHtml(page.intro)}</p>
        <div class="actions">
          <a class="cta" href="/">Open the app</a>
          <a href="${page.url}">This landing page</a>
        </div>
        <div class="grid">
          <article class="card">
            <h2>What you can do here</h2>
            <ul>${featuresHtml}</ul>
          </article>
          <article class="card">
            <h2>Related pages</h2>
            <div class="related">${relatedHtml}</div>
            <p class="copy" style="margin-top:12px;">These pages form a crawlable route cluster for fundamentals, technicals, the journal, and learning content.</p>
          </article>
        </div>
        <div class="stack">
          ${renderSections(page.sections || [])}
          ${renderFaq(page.faq || [])}
        </div>
        <p class="footer">TradeEdge is designed for Indian equity research, screening, chart review, and trade journaling. The app remains fully available below this static landing content when JavaScript loads.</p>
      </section>
    </main>
  </body>
</html>`;
}

for (const page of pages) {
  const outFile = path.join(OUT_DIR, ...page.url.split("/").filter(Boolean), "index.html");
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, renderPage(page), "utf8");
}

console.log(`Generated ${pages.length} prerender pages into public/.`);
