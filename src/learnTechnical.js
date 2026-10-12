// Technical Analysis curriculum for the Learn module.
// Same lesson schema as the fundamental tracks: { id, title, minutes, summary, blocks, quiz }.
// Supported blocks: p, h, ul, ol, formula, table, callout (kind: key | tip | warn | india).
// The small helpers below only build those same plain objects; nothing here changes the schema.
// All stocks, prices and setups in examples are fictional and for teaching only.
// Educational content only, not investment advice. No setup works every time.
//
// FUTURE VISUAL markers (comments) show where chart components can be added later.

const p = (x) => ({ t: "p", x });
const h = (x) => ({ t: "h", x });
const ul = (...items) => ({ t: "ul", items });
const ol = (...items) => ({ t: "ol", items });
const fm = (label, expr, note) => ({ t: "formula", label, expr, note });
const tb = (caption, head, rows) => ({ t: "table", caption, head, rows });
const co = (kind, title, x) => ({ t: "callout", kind, title, x });
const Q = (q, options, answer, why) => ({ q, options, answer, why });
const L = (id, title, minutes, summary, blocks, quiz) => ({ id, title, minutes, summary, blocks, quiz });
const takeaway = (x) => co("key", "Key takeaway", x);

/* ════════════════════════════════════════════════════════════════════════
   TRACK 1 — Technical Analysis Foundations
   ════════════════════════════════════════════════════════════════════════ */
const TA_FOUNDATIONS = {
    id: "ta-foundations",
    title: "Technical Analysis Foundations",
    blurb: "What technical analysis does, how to read a chart, and the structure of price: trend, support, resistance and trendlines.",
    lessons: [
        L("ta-foundations-what-is-ta", "What technical analysis actually does", 9,
            "Technical analysis is a way of reading what buyers and sellers are doing, and turning it into probabilities. It is not a crystal ball.",
            [
                p("**Technical analysis (TA)** is the study of price and volume to judge what buyers and sellers are doing and where the odds look better or worse. It starts from a simple observation: every trade on the NSE is two real people agreeing on a price with real money. The chart is the record of all those agreements."),
                h("What it is, and what it is not"),
                ul(
                    "**It is** a framework for reading supply and demand, trend, and risk from price and volume.",
                    "**It is** a way to decide where to enter, where you are wrong, and how much to risk.",
                    "**It is not** a method that predicts the future with certainty.",
                    "**It is not** a collection of indicators to be stacked until one says buy.",
                    "**It is not** the opposite of fundamentals. It answers a different question: when and at what risk, rather than what and why."
                ),
                h("Why price is the primary evidence"),
                p("Price is where opinion meets money. News, earnings, rumours, fear and greed all end up in the price, sometimes before the public story is clear. A stock that keeps making new highs on rising volume is telling you that large buyers are willing to pay up. A stock that cannot rally even on good news is telling you that supply is heavy. Indicators such as RSI or MACD are not independent evidence. They are arithmetic done on price and volume, so they can only rearrange what price has already said."),
                co("key", "Key idea", "Price is the primary evidence. Indicators are secondary measurements derived from price and volume."),
                h("Prediction versus probability"),
                p("A forecaster says “this stock will go to ₹600”. A technical analyst says “if this stock closes above ₹500 on strong volume, the odds of a further advance are better than usual, and if it falls below ₹470 the idea is wrong”. The second statement has a trigger, an invalidation point, and no promise."),
                co("key", "Probability, not certainty", "Technical analysis does not predict the future with certainty. It identifies situations where the probability distribution may be favourable."),
                h("The idea of an edge"),
                p("An **edge** is a situation that, repeated many times, pays more than it costs. You do not need to win most trades. You need the average winner to be large enough compared with the average loser."),
                fm("Edge in one line", "Edge exists when:\n(Win rate × Average win) > (Loss rate × Average loss) + costs", "Costs include brokerage, taxes and slippage. Lessons later in this course turn this into the expectancy formula."),
                tb("Three ways of looking at a stock", ["Approach", "Main question", "Main inputs", "Typical output"], [
                    ["Fundamental analysis", "Is this a good business at a sensible price?", "Financial statements, ratios, industry", "A view on value and quality"],
                    ["Technical analysis", "What are buyers and sellers doing, and where is the risk?", "Price, volume, structure, relative strength", "Entry, stop, size, exit plan"],
                    ["Quantitative / systematic trading", "Does a precisely defined rule have a positive edge in past data?", "Rules, historical data, statistics", "A tested, mechanical strategy"],
                ]),
                co("tip", "How the three fit together", "Many practitioners use fundamentals to build a list of good businesses and technicals to time and size the position. Systematic trading takes a technical idea and tests it with rules. This course moves in that direction, from reading charts to rule-based plans."),
                co("warn", "Common mistake", "Treating a setup that worked three times as a law. Any setup has a failure rate. A trader who ignores this risks too much on one trade, and one failure erases weeks of progress."),
                takeaway("Technical analysis reads price and volume to find favourable odds, defines where the idea fails, and manages risk when it does. It works in probabilities, so risk management is part of the method, not an add-on."),
            ],
            [
                Q("What is the primary purpose of technical analysis?", [
                    "To forecast the exact price a stock will reach on a given date",
                    "To identify situations where the odds and payoff look favourable, using price and volume, and to define risk",
                    "To calculate the intrinsic value of a company from its financial statements",
                    "To find setups that cannot fail so that stop losses are unnecessary",
                ], 1, "TA is a decision framework: it reads supply and demand from price and volume to find better-than-average situations and to say where the idea is wrong. It does not give exact forecasts, intrinsic value (that is fundamental analysis), or certainty."),
                Q("Why is probability a more appropriate frame than certainty for chart-based decisions?", [
                    "Because every individual setup can fail, so only the long-run mix of win rate and payoff can be favourable",
                    "Because charts are random, so no analysis has value",
                    "Because probabilities guarantee a profit once you take ten trades",
                    "Because certainty is only possible on weekly charts",
                ], 0, "A single trade outcome is uncertain even for a good setup. What can be favourable is the distribution of many outcomes: how often you win and how much you make or lose when you do. Probabilities do not guarantee anything over a small number of trades either."),
                Q("A setup has won 4 of its last 10 trades. The average winner was 2.5R and the average loser 1R. Which reading is most reasonable?", [
                    "It is failing, because its win rate is below 50%",
                    "Expectancy is (0.4 × 2.5) − (0.6 × 1) = +0.4R per trade, so it may have an edge, but 10 trades is a small sample",
                    "It is guaranteed to be profitable from now on",
                    "Win rate alone should decide whether to continue",
                ], 1, "Win rate on its own is misleading. With 2.5R winners, a 40% win rate gives positive expectancy. But ten trades is too few to be confident, so the result should be treated as encouraging, not proven."),
            ]),

        L("ta-foundations-reading-chart", "Reading a stock chart", 11,
            "OHLC, candlesticks, timeframes, scales, gaps and volume: the vocabulary you need before any analysis makes sense.",
            [
                p("A chart is a compressed record of trading. Each bar or candle covers one time period and summarises it in four prices and one volume figure."),
                h("OHLC and volume"),
                ul(
                    "**Open**: the first traded price of the period. On NSE, the daily open comes from the pre-open session auction at 9:00 to 9:15.",
                    "**High** and **Low**: the highest and lowest prices traded.",
                    "**Close**: the last price, based on a weighted average of the final minutes of trading. Most analysis uses the close because it is the market’s settled opinion for that period.",
                    "**Volume**: how many shares changed hands. It shows how much participation stood behind the price move."
                ),
                p("A **candlestick** draws the open and close as a body and the high and low as thin lines called wicks. A close above the open is usually drawn as a green (hollow) body and a close below the open as a red (solid) body, though colour conventions vary by platform. The next track covers candles in depth."),
                // FUTURE VISUAL: annotated OHLC bar and candle side by side
                h("Timeframes"),
                p("The same stock looks different on every timeframe, and each answers a different question. A stock can be in a strong weekly uptrend while a 5-minute chart shows a messy decline that afternoon."),
                tb("ABC Industries (fictional) on three timeframes", ["Timeframe", "What one candle shows", "What you see", "Best used for"], [
                    ["5-minute", "5 minutes of trading", "Intraday noise, opening drive, lunchtime lull, closing push", "Day trading, fine-tuning entries"],
                    ["Daily", "One NSE session (9:15 to 15:30)", "Swings, support and resistance, breakouts, base building", "Swing and positional trading, most setups in this course"],
                    ["Weekly", "Five sessions", "The primary trend, major bases, long-term averages", "Trend context, stage analysis, position management"],
                ]),
                co("tip", "Start with the weekly chart", "Look at the weekly chart first to see the primary trend and the major levels. Then move to the daily chart to time the entry. A daily buy signal in a weekly downtrend is working against the bigger current."),
                h("Linear versus log scale"),
                p("On a **linear** scale, equal rupee moves look equal. On a **log** (percentage) scale, equal percentage moves look equal. A move from ₹100 to ₹200 is +100% and from ₹200 to ₹300 is +50%, but a linear chart draws them the same height. For stocks that have moved a lot, use log scale so that trendlines and pullback depth are comparable across the chart."),
                h("Adjusted versus unadjusted prices"),
                p("When a company does a split or a bonus, the price drops mechanically without any loss for shareholders. A 1:1 bonus halves the price. If the chart does not adjust for this, it shows a fake crash that can trigger false stops and false signals. Use **adjusted** price history for analysis. Dividends can also be adjusted, though most Indian charting platforms adjust for splits and bonuses by default."),
                co("india", "NSE specifics", "Regular trading runs 9:15 to 15:30 IST. Most stocks carry daily price bands (for example 5%, 10% or 20%), so a stock can hit a circuit and be unable to trade further in that direction. Small and mid caps can also be thinly traded, so the chart looks cleaner than the real ability to enter or exit. Always check liquidity."),
                h("Gaps"),
                p("A **gap** appears when a period opens above the prior high or below the prior low, leaving empty space on the chart. Gaps usually follow overnight news such as results or global moves. A gap up on heavy volume out of a base shows urgent demand. A gap that gets filled in a day or two shows the demand was not durable."),
                h("Volume bars"),
                p("The volume bars under the price chart show participation. A move on high volume carries more information than the same move on thin volume. Compare each bar with the stock’s own average (for example 50-day average volume), not with other stocks."),
                co("warn", "Common mistake", "Analysing an unadjusted chart after a split or bonus, or drawing levels on a linear chart of a stock that has tripled. Both produce levels and signals that do not mean what you think."),
                takeaway("Use the weekly chart for context, the daily chart for decisions, log scale for big moves, adjusted prices always, and volume relative to the stock’s own average."),
            ],
            [
                Q("A stock’s daily chart shows a bullish breakout, but its weekly chart is in a clear downtrend below a falling 30-week average. What does the weekly chart add?", [
                    "Nothing; the daily chart is always more accurate",
                    "Context: the breakout is going against the primary trend, so it needs more caution or a smaller position",
                    "Proof that the breakout will fail",
                    "A guaranteed signal to short the stock",
                ], 1, "Higher timeframes show the dominant trend. A daily signal against it is not automatically wrong, but the odds are less favourable and the risk is higher. Weekly context does not guarantee a failure either."),
                Q("A stock did a 1:1 bonus issue, halving its price overnight. The chart you use is unadjusted. What is the likely problem?", [
                    "The volume will look too high",
                    "It will show a false 50% crash that can trigger false stops and distort every indicator",
                    "Nothing, because bonus issues do not affect price",
                    "The chart will be on log scale automatically",
                ], 1, "A bonus lowers the price mechanically with no loss to shareholders. Unadjusted data records a fake collapse that can break averages and trendlines. Use adjusted data."),
                Q("Why use a log scale for a stock that has gone from ₹100 to ₹600 over three years?", [
                    "Log scale makes the stock look cheaper",
                    "Equal percentage moves occupy equal vertical distances, so trends and pullbacks stay comparable",
                    "Log charts remove the need for volume",
                    "Log scale predicts when the trend will end",
                ], 1, "On a linear chart, early moves look tiny and recent moves look huge, although the percentage moves may be similar. A log scale shows proportional change, which is what matters for returns."),
            ]),

        L("ta-foundations-market-structure", "Market structure: highs, lows and trend", 10,
            "Trend is not an opinion. It is a sequence of swing highs and swing lows. Learn to read it, and to tell a trend from a range.",
            [
                p("Before any indicator, ask one question: **what is price doing with its swings?** A chart moves in waves. Each wave leaves a **swing high** (a peak with lower highs on both sides) and a **swing low** (a trough with higher lows on both sides). The order of these swings defines the trend."),
                h("The four building blocks"),
                tb("Swing relationships", ["Term", "Meaning", "What it suggests"], [
                    ["Higher high (HH)", "A rally peaks above the previous swing high", "Buyers can push past earlier supply"],
                    ["Higher low (HL)", "A pullback ends above the previous swing low", "Buyers step in earlier, at higher prices"],
                    ["Lower high (LH)", "A rally peaks below the previous swing high", "Sellers meet buyers earlier"],
                    ["Lower low (LL)", "A decline ends below the previous swing low", "Sellers push past earlier demand"],
                ]),
                fm("Structure rules", "Uptrend:   HH + HL  (bullish structure)\nDowntrend: LH + LL  (bearish structure)\nRange:     roughly flat highs and lows", "A trend is defined by the sequence of swings. A single new high does not make an uptrend."),
                // FUTURE VISUAL: HH/HL structure example with labelled swings
                h("Trend, range and consolidation"),
                ul(
                    "**Uptrend**: a series of HH and HL. Pullbacks are shallow compared with advances, and each pullback holds above the last low.",
                    "**Downtrend**: a series of LH and LL. Rallies fail below the previous peak.",
                    "**Range**: price moves between a ceiling and a floor without making progress. Buyers and sellers are balanced.",
                    "**Consolidation**: a tighter pause inside a trend or after a move. It can resolve in either direction, and the earlier trend gives it a tilt, not a promise."
                ),
                co("warn", "Do not call every sideways move a trend", "A stock bouncing between ₹180 and ₹210 for four months is in a range, not an uptrend because it made one slightly higher high. Many bad trades come from forcing a trend label on a range."),
                h("How structure evolves"),
                p("Structure changes in steps, not at once. Take a stock in an uptrend with a last higher low at ₹250."),
                ol(
                    "**Healthy uptrend:** price keeps making HH and HL.",
                    "**First warning:** a rally fails to make a new high, forming a lower high, while the last higher low at ₹250 still holds.",
                    "**Break of structure (BOS):** price closes below ₹250, the last higher low. The pattern of HL has broken.",
                    "**Change of character (CHoCH):** the first clear sign that the dominant behaviour has changed, for example the first lower high followed by a break of the last higher low in an advance.",
                    "**New regime:** if later rallies stay below the new lower high and lows keep falling, a downtrend has replaced the uptrend. If price instead stabilises and forms a range, it is basing."
                ),
                p("Break of structure and change of character are useful names for the same idea: **the sequence that defined the trend has stopped repeating**. Neither is a signal to sell on its own. They are a signal to reassess risk."),
                co("tip", "Practical use", "Mark the last two swing highs and lows on the daily chart. Ask: is each swing higher than the last? If the answer is not clearly yes or no, the chart is a range, and trend-following setups should be treated with caution."),
                co("warn", "Common mistake", "Using tiny swings on a 5-minute chart to call a daily trend, or ignoring that a higher low can fail the moment price closes below it. Define swings on the timeframe you trade."),
                takeaway("HH + HL is bullish structure, LH + LL is bearish structure, and flat swings are a range. Trends end in steps, and the break of the last higher low is the first hard evidence."),
            ],
            [
                Q("A stock rises to ₹320, pulls back to ₹290, rallies to ₹315, then closes at ₹285. The earlier swing low was ₹290. What has happened to its structure?", [
                    "It made a higher high, so the uptrend is stronger",
                    "It made a lower high (₹315 below ₹320) and then broke the last swing low (₹290), a break of structure",
                    "Nothing has changed because prices are still above where the rally began",
                    "It is now certain to continue falling",
                ], 1, "₹315 is a lower high and the close at ₹285 is below the last swing low of ₹290. That is a break of structure and a warning that the uptrend’s pattern has failed. It does not guarantee a decline, but risk has risen."),
                Q("A stock oscillated between ₹180 and ₹210 for four months. Which label is the most accurate?", [
                    "Uptrend, because ₹210 is above ₹180",
                    "Downtrend, because it has not made progress",
                    "Range, because highs and lows are not progressing",
                    "Stage 2 advance",
                ], 2, "Roughly flat highs and lows indicate balance between buyers and sellers. Trend-following setups are lower probability inside a range until it resolves."),
                Q("What does a change of character mean in practical terms?", [
                    "A guaranteed reversal signal",
                    "The first clear evidence that the behaviour that defined the trend has stopped repeating, so risk should be reassessed",
                    "A change of the stock’s ticker",
                    "A candle with a long upper wick",
                ], 1, "It is an early structural clue, not a prediction. It tells you the old pattern of higher lows (or lower highs) is no longer reliable and that position size or stops may need review."),
            ]),

        L("ta-foundations-support-resistance", "Support and resistance", 10,
            "Where price has stopped or turned before is where it may stop or turn again. Think of zones, not exact lines.",
            [
                p("**Support** is a price area where demand has been strong enough to stop a decline. **Resistance** is a price area where supply has been strong enough to stop an advance. They exist because traders remember: buyers who missed a bounce want to buy there again, and holders who were stuck at a peak sell when they get back to even."),
                h("Where levels come from"),
                ul(
                    "**Previous swing highs and lows**: the most common and most reliable source.",
                    "**Multiple-touch levels**: an area tested three or four times shows that many participants care about it.",
                    "**Demand and supply zones**: ranges where price moved away fast, suggesting large orders were filled there.",
                    "**Moving averages**: dynamic levels such as the 50-day or 200-day average that leading stocks often respect during pullbacks.",
                    "**Trendlines**: sloped support or resistance (covered in the next lesson).",
                    "**Round numbers and 52-week highs/lows**: psychological anchors, especially for retail participants."
                ),
                h("Zones, not exact prices"),
                p("Prices rarely reverse at the exact same rupee. A stock may peak at ₹498, ₹502 and ₹495 on three tests. Treat ₹495 to ₹505 as the resistance zone. Drawing a razor-thin line at ₹502 and calling every move to ₹503 a breakout leads to false signals. Zones also help you size stops sensibly: place them beyond the zone, not inside it."),
                // FUTURE VISUAL: support/resistance zones with multiple touches
                h("Role reversal"),
                p("When price breaks above resistance and then pulls back to that level, the old ceiling often becomes the new floor. The logic: sellers who sold there are gone, and holders who were trapped got out. New buyers see the old level as value. The same works in reverse when broken support becomes resistance."),
                co("key", "Role reversal", "Resistance becoming support after a breakout is one of the most important ideas in technical analysis. A breakout that retests the old resistance and holds above it confirms that supply there has been absorbed."),
                h("Strength of a level"),
                tb("What makes a level more significant", ["Factor", "Stronger level", "Weaker level"], [
                    ["Number of touches", "Three or more, spaced apart", "A single touch"],
                    ["Time", "Held for months", "Formed days ago"],
                    ["Volume at the level", "Heavy volume when it formed", "Thin volume"],
                    ["Timeframe", "Visible on the weekly chart", "Only visible intraday"],
                    ["Recent relevance", "Tested recently", "Not touched for years"],
                ]),
                co("tip", "Practical use", "Mark only the levels you can see at a glance on the weekly and daily charts. If you have to zoom and squint to justify a level, it is probably not significant."),
                co("warn", "Common mistake", "Drawing too many levels. A chart with ten lines gives a reason to justify any trade. Choose two or three that matter near the current price, and treat the rest as noise."),
                takeaway("Support and resistance are zones where supply and demand have shown up before. More touches, more time, and higher timeframes make a level matter more. A breakout that turns old resistance into support is a sign the supply has been absorbed."),
            ],
            [
                Q("ABC Industries peaked at ₹498, ₹502 and ₹495 on three tests over four months. How should you treat resistance?", [
                    "As a single line at ₹502 exactly",
                    "As a zone of roughly ₹495 to ₹505",
                    "As irrelevant because the highs differ",
                    "As support, because it was tested three times",
                ], 1, "Real trading produces slightly different peaks. A zone captures the area where supply has repeatedly appeared and avoids false breakout calls on a ₹1 or ₹2 move."),
                Q("A stock breaks above ₹500 resistance, pulls back to ₹501 on low volume, and bounces. What does this suggest?", [
                    "The breakout has failed",
                    "Old resistance is acting as new support, which supports the view that supply at that level was absorbed",
                    "The stock must be shorted",
                    "Volume is irrelevant here",
                ], 1, "A successful retest of the broken level, especially on lower volume, is the role-reversal pattern. It strengthens the case that the breakout was genuine, though no pattern guarantees continuation."),
                Q("Which level is most likely to matter?", [
                    "A level touched once on a 5-minute chart last Tuesday",
                    "A zone tested four times over six months on the weekly chart",
                    "A level you only see after zooming into a 1-minute chart",
                    "A random decimal price",
                ], 1, "Levels that are visible on higher timeframes, tested multiple times, and held over longer periods represent more participants and more capital."),
            ]),

        L("ta-foundations-trendlines", "Trendlines and channels", 9,
            "Trendlines add a sloped view of support and resistance. Use them as helpers, never as overrides of price structure.",
            [
                p("A **trendline** connects swing points to show the slope along which price is moving. In an uptrend you draw it under the rising lows. In a downtrend you draw it over the falling highs."),
                h("How to draw a valid trendline"),
                ol(
                    "Use a **log scale** if the stock has moved a lot, so the line reflects percentage growth.",
                    "Connect **two clear swing lows** (uptrend) or swing highs (downtrend). Two points define the line; the third touch is what **validates** it.",
                    "Draw from wick to wick or body to body, but be consistent. Slight imperfections are normal.",
                    "A line with three or more touches, spread across time, carries more weight than one with two touches close together.",
                    "Very steep lines break quickly. A slope that fits the stock’s normal pace is more durable."
                ),
                // FUTURE VISUAL: ascending trendline with three touches and a break
                h("Trendline violations"),
                p("A decisive close below an uptrend line suggests the pace of advance is changing, but it is **not** necessarily a reversal. Often price breaks the line and then moves sideways, forming a new base, or even resumes up with a shallower line. The break tells you to look at structure: is the last higher low still intact?"),
                h("Channels"),
                p("A **channel** adds a parallel line on the other side of the trend. Price oscillates between the two."),
                tb("Channel types", ["Channel", "Description", "Typical use"], [
                    ["Ascending channel", "Rising lows and rising highs, parallel", "Trend following: buying near the lower line in an intact uptrend, with a stop below it"],
                    ["Descending channel", "Falling highs and lows, parallel", "Recognising a downtrend; avoiding longs against it"],
                    ["Horizontal channel", "A range with flat boundaries", "Range trading or waiting for a breakout"],
                ]),
                p("A **channel breakout** upward from a descending channel can mark the end of a decline, but it needs confirmation: volume, a close beyond the line, and ideally a higher low afterwards. A **false trendline break** is a quick poke through the line that reverses within a day or two. Waiting for a close and a bit of follow-through filters many of them."),
                co("warn", "Trendlines are subjective", "Two analysts can draw different lines on the same chart. That is why trendlines should support, never override, price structure. If a stock breaks its trendline but holds the last higher low and its moving averages, the structure is still intact."),
                co("tip", "Practical use", "Draw one trendline you believe in, on the weekly or daily chart. If you need three different lines to explain the same move, the chart is not giving you a clear trendline."),
                takeaway("A trendline is a sloped support or resistance helper. Three touches validate it, a close through it asks you to reassess structure, and no line should override HH/HL or LH/LL."),
            ],
            [
                Q("What validates a trendline?", [
                    "Two points joined, because any two points make a line",
                    "A third touch, ideally spaced over time, after the line was drawn from two swing points",
                    "Drawing it as steeply as possible",
                    "Only volume",
                ], 1, "Two points always define a line, which proves nothing. A subsequent touch that respects the line is evidence that others see it too."),
                Q("A stock closes below its ascending trendline, but the last higher low is intact and it holds the 50-day average. What is the most reasonable reading?", [
                    "The uptrend is over and the stock should be sold at any price",
                    "The pace of the advance may be slowing, but the structure is still bullish, so the line break alone is not decisive",
                    "The trendline break proves a downtrend has started",
                    "Trendlines never matter",
                ], 1, "Structure (HH/HL) and key averages matter more than a subjective line. A line break is a reason to watch closely, not an automatic exit."),
                Q("Why wait for a close beyond a channel line and some follow-through before trusting a breakout from a descending channel?", [
                    "Because intraday pokes through lines often reverse and become false breaks",
                    "Because channels only work after 3 pm",
                    "Because follow-through reduces volume",
                    "Because only weekly closes exist",
                ], 0, "Intraday spikes through a line are common and often reverse. A close beyond it and some follow-through filter noise, though they cannot eliminate failures."),
            ]),
    ],
};

/* ════════════════════════════════════════════════════════════════════════
   TRACK 2 — Candlestick Analysis
   ════════════════════════════════════════════════════════════════════════ */
const TA_CANDLESTICKS = {
    id: "ta-candlesticks",
    title: "Candlestick Analysis",
    blurb: "Read a single candle as a story of supply and demand, then learn why context matters more than the pattern name.",
    lessons: [
        L("ta-candlesticks-anatomy", "Anatomy of a candlestick", 8,
            "One candle is a summary of a tug-of-war between buyers and sellers. Learn to read the body, the wicks and where it closed.",
            [
                p("Every candle is built from the same four prices: open, high, low and close. What matters is the **relationship** between them."),
                tb("Parts of a candle", ["Part", "What it is", "What it tells you"], [
                    ["Body", "Distance between open and close", "Who won the session and by how much"],
                    ["Upper wick", "High to the top of the body", "How far buyers pushed before sellers rejected the price"],
                    ["Lower wick", "Low to the bottom of the body", "How far sellers pushed before buyers rejected the price"],
                    ["Range", "High minus low", "How much price moved; compare with recent ranges"],
                    ["Closing position", "Where the close sits inside the range", "Strong close near the high, weak close near the low"],
                ]),
                // FUTURE VISUAL: candlestick anatomy with labelled body, wicks, range and close location
                h("Bullish and bearish candles"),
                ul(
                    "A **bullish candle** closes above its open. Buyers ended the session in control.",
                    "A **bearish candle** closes below its open. Sellers ended in control.",
                    "A long body means one side dominated. A short body means indecision or balance.",
                    "Long wicks mean price was pushed and then rejected."
                ),
                h("What a candle says about supply and demand"),
                p("Imagine ABC Industries opens at ₹500, falls to ₹488 in the morning as sellers push, then buyers absorb the supply and lift the price to close at ₹509 with a high of ₹510. The candle has a long lower wick (the rejected low), a bullish body (₹500 to ₹509) and a close near the high. The message: sellers tried and failed, and buyers finished in control."),
                p("Now compare an identical range with a close at ₹489. The long upper wick says buyers pushed to ₹510 but were rejected, and the weak close shows sellers finished in control. The same high and low can tell opposite stories depending on **where the close lands**."),
                co("key", "The close is the most important price", "The close is the last agreement of the session and the price most holders use to judge gain or loss. A strong close near the high suggests demand at the end of the day. A weak close near the low suggests the opposite."),
                h("Range and volume"),
                p("Compare each candle’s range with the previous ten to twenty sessions. A candle with a much bigger range than normal on strong volume matters more than a normal-sized candle. A tiny-range candle after a big move shows that activity is drying up."),
                co("warn", "Common mistake", "Reading one candle in isolation. A long lower wick means very different things after a 30% fall into a major support zone than in the middle of a quiet range."),
                takeaway("Read each candle as a battle: the body shows who won, the wicks show what was rejected, and the close shows who was in control at the end. Compare it with its recent neighbours and its location on the chart."),
            ],
            [
                Q("A candle opens at ₹500, drops to ₹488, then closes at ₹509 near its ₹510 high. What does the long lower wick tell you?", [
                    "Buyers pushed the price down to ₹488",
                    "Sellers pushed the price down but buyers absorbed the supply and rejected the lows",
                    "Volume was low",
                    "The candle is bearish",
                ], 1, "A long lower wick means price traded much lower but was rejected, and a close near the high shows buyers finished in control."),
                Q("Two candles have the same ₹488 to ₹510 range. One closes at ₹509 and the other at ₹489. Why do they differ?", [
                    "They do not; the range is all that matters",
                    "The close shows who controlled the end of the session: demand in the first case, supply in the second",
                    "The first candle must have higher volume",
                    "Only the open matters",
                ], 1, "The same range can be a strong or a weak session depending on where it closes. The close reflects the final balance of supply and demand."),
                Q("Why compare a candle’s range with recent sessions?", [
                    "A range that is unusually large (or small) relative to recent history carries more information about participation",
                    "Ranges are always equal across stocks",
                    "To compute RSI",
                    "To adjust for splits",
                ], 0, "Candles are relative. A large range on strong volume signals unusual activity, and a very small range after a big move signals a pause or dry-up."),
            ]),

        L("ta-candlesticks-patterns", "Important candlestick patterns", 13,
            "Eleven patterns, each with its structure, meaning, the place where it matters, the volume you want to see, and how it fails.",
            [
                p("Candlestick patterns are shorthand for a short sequence of supply and demand events. For each one below, ask five questions: what is the **structure**, what does it **mean**, **where** does it matter, what **volume** helps, and how does it **fail**."),
                tb("Single-candle patterns", ["Pattern", "Structure", "Meaning", "Where it matters", "Failure"], [
                    ["Doji", "Open and close nearly equal; wicks on both sides", "Indecision, balance of buyers and sellers", "After a long move, at a key level", "Next candle resumes the prior direction with a strong close"],
                    ["Hammer", "Small body at the top, lower wick at least twice the body, little upper wick", "Sellers pushed down, buyers rejected the lows", "After a decline into support", "Price closes below the hammer’s low"],
                    ["Inverted hammer", "Small body at the bottom, long upper wick", "Buyers tried, partial rejection; needs confirmation", "After a decline at support", "Next candle closes below the low"],
                    ["Shooting star", "Small body at the bottom, long upper wick, after a rally", "Buyers pushed up and were rejected by supply", "After a rally into resistance", "Price closes above the star’s high"],
                    ["Hanging man", "Hammer shape, but after an advance", "Warning that sellers appeared; needs confirmation", "After an extended rise near resistance", "Price makes new highs on strength"],
                ]),
                tb("Two- and three-candle patterns", ["Pattern", "Structure", "Meaning", "Where it matters", "Failure"], [
                    ["Bullish engulfing", "Bullish body that fully covers the previous bearish body", "Demand overwhelms the previous session’s supply", "After a decline, at support", "Price falls below the engulfing candle’s low"],
                    ["Bearish engulfing", "Bearish body that fully covers the previous bullish body", "Supply overwhelms the previous session’s demand", "After a rally, at resistance", "Price closes above the engulfing candle’s high"],
                    ["Morning star", "Long bearish candle, small-bodied candle, then a bullish candle closing well into the first body", "Selling exhausts, buyers take over", "After a decline at support", "Price falls below the middle candle’s low"],
                    ["Evening star", "Long bullish candle, small-bodied candle, then a bearish candle closing well into the first body", "Buying exhausts, sellers take over", "After a rally at resistance", "Price rises above the middle candle’s high"],
                    ["Inside bar", "Entire range within the prior candle’s range", "Compression and a pause; energy is building", "In a trend or at a key level", "Direction of the break against the prior trend is a warning"],
                    ["Outside bar", "Range extends beyond both the prior high and low", "Expansion; the close shows who won", "At turning points", "A weak close nullifies the signal"],
                ]),
                // FUTURE VISUAL: panel with each pattern drawn next to a real-looking example
                h("Volume confirmation"),
                p("Reversal patterns gain weight when they appear on higher-than-average volume, because more participants took part in the rejection. An engulfing candle on volume twice the average says far more than one on a quiet day. Inside bars usually come with falling volume, so look for the **expansion** when price leaves the mother bar."),
                h("Failure conditions matter more than the name"),
                p("Every pattern comes with a built-in stop: the other end of the pattern. A hammer is invalid if price closes below its low. A shooting star is invalid if price closes above its high. Knowing this makes the pattern tradable, because the risk is defined before you act."),
                co("warn", "Common mistake", "Memorising names without asking where the pattern appeared. A hammer printed in the middle of a quiet range is noise. The same candle after a 25% decline into a long-standing support zone on strong volume may be meaningful."),
                co("tip", "Practical use", "Give yourself a short filter: Is there a clear prior move? Is the pattern at a level that matters? Is volume supportive? Is there a logical stop at the pattern’s edge? If fewer than three answers are yes, skip."),
                takeaway("Patterns are tools for reading a short battle between buyers and sellers. They are only worth acting on at meaningful locations, with volume support and a clear failure point."),
            ],
            [
                Q("A hammer forms after a 25% decline, right at a multi-month support zone, on 1.8 times average volume. What strengthens the signal?", [
                    "Only the hammer shape",
                    "Location at a meaningful support, prior decline, and volume above average",
                    "The colour of the candle",
                    "The ticker symbol",
                ], 1, "Context creates the edge: a prior move to reverse, a level where buyers have stepped in before, and heavy participation that shows the rejection was real."),
                Q("Where does a hammer become invalid?", [
                    "When price closes below the hammer’s low",
                    "When the next candle is green",
                    "When volume rises",
                    "It cannot become invalid",
                ], 0, "A close below the hammer’s low means the rejection of the lows failed. That level is the natural stop for the idea."),
                Q("A hammer-shaped candle appears after a long advance, near resistance. How is it named and how should it be treated?", [
                    "It is a hammer and is strongly bullish",
                    "It is a hanging man: a warning that sellers appeared, which needs confirmation by a weak next candle",
                    "It is a doji",
                    "It is a bullish engulfing candle",
                ], 1, "The same shape means different things depending on where it appears. After an advance, the shape may show that sellers are testing the market, but a confirming weak close is needed."),
                Q("What does an inside bar usually represent?", [
                    "Compression and a pause; the break of the mother bar’s range shows where the market resolves",
                    "A guaranteed reversal",
                    "A confirmed breakout",
                    "A volume spike",
                ], 0, "An inside bar shows reduced range and balance. The direction of the break from the mother bar, ideally with volume, is the information."),
            ]),

        L("ta-candlesticks-context", "Candlesticks in context", 9,
            "The same candle means different things in different places. Context beats pattern recognition.",
            [
                p("A candle is a sentence, and the chart is the paragraph. Reading the sentence without the paragraph produces confident mistakes. Three comparisons show why."),
                tb("Same pattern, different value", ["Situation", "Weaker reading", "Stronger reading"], [
                    ["Hammer", "A hammer in the middle of a sideways range, on low volume", "A hammer at a multi-touch support zone after a sharp decline, on high volume"],
                    ["Bullish engulfing", "Inside a strong uptrend after a tiny pullback", "After a decline into support, closing near the high"],
                    ["Shooting star", "In random price action with no nearby resistance", "At a major resistance or after an extended run, on rising volume"],
                ]),
                co("key", "The rule of context", "A hammer at support is not the same as a hammer anywhere. A bullish engulfing after a decline is not the same as a bullish engulfing inside a strong uptrend. A shooting star near major resistance carries more information than one in random price action."),
                h("The four context filters"),
                ol(
                    "**Trend:** what was the prior move? Reversal patterns need something to reverse.",
                    "**Location:** is the candle at support, resistance, a moving average, or in empty space?",
                    "**Volume:** is participation above average at the key candle?",
                    "**Confirmation:** did the next one or two sessions follow through?"
                ),
                h("Worked example"),
                p("PQR Engineering (fictional) has fallen from ₹420 to ₹310 over eight weeks and is approaching ₹300, a level that held in two earlier declines. On Tuesday it forms a bullish engulfing candle: open ₹304, close ₹322, covering Monday’s bearish body, on 2.1 times average volume. On Wednesday it holds above Tuesday’s midpoint and closes at ₹326."),
                ul(
                    "Prior move: a steep decline gives the pattern something to reverse.",
                    "Location: the engulfing happens at a known support.",
                    "Volume: more than twice the average.",
                    "Confirmation: the next day holds and closes higher.",
                    "Failure point: a close below ₹304 (the engulfing candle’s low area) would invalidate it."
                ),
                p("Now take the same engulfing candle in a stock that has risen 20% in two weeks with no pullback. The pattern is still a bullish candle, but it is not a reversal signal. It is just another up day, and the location suggests the risk of buying after an extended move."),
                co("tip", "Combine, do not stack", "Use a candlestick pattern as a timing detail inside a bigger idea (for example a pullback to a rising 50-day average in a Stage 2 stock). It should not be the entire idea."),
                co("warn", "Common mistake", "Trading every pattern that appears. A large share of candlestick signals have no follow-through. Selectivity comes from location, volume and trend, not from knowing more pattern names."),
                takeaway("Read a candle after reading the chart around it. Trend, location, volume and confirmation turn a pattern from a coincidence into evidence."),
            ],
            [
                Q("A bullish engulfing candle appears in a stock that has risen 20% in two weeks without a pullback. How should you view it?", [
                    "As a strong reversal signal because engulfing candles are bullish",
                    "As just another up day with no reversal to confirm, and a location that carries extension risk",
                    "As a signal to short immediately",
                    "As evidence of a Stage 4 decline",
                ], 1, "Reversal patterns need a decline to reverse. Inside a strong run, an engulfing candle adds little, and buying after an extended move increases risk."),
                Q("Which one is the best example of using candlesticks properly?", [
                    "Buying every hammer",
                    "Treating a hammer at a rising 50-day average in a stock with strong structure as a timing clue, with a stop below the hammer’s low",
                    "Ignoring volume because candles are enough",
                    "Selling every doji",
                ], 1, "The candle gives timing inside a bigger idea (trend, support) and defines a stop. It is not the whole thesis."),
                Q("A bullish engulfing candle forms at support on 2.1× volume. The next session closes below its low. What is the right conclusion?", [
                    "The signal failed; the pattern’s low was the invalidation point, so the idea is wrong and exit rules apply",
                    "Hold, because engulfing candles never fail",
                    "Add to the position, because price is cheaper",
                    "Ignore the stop because the volume was high",
                ], 0, "Every pattern has a failure condition. Respecting it limits the loss and keeps the probabilities honest."),
            ]),
    ],
};

/* ════════════════════════════════════════════════════════════════════════
   TRACK 3 — Moving Averages and Trend Systems
   ════════════════════════════════════════════════════════════════════════ */
const TA_MOVING_AVERAGES = {
    id: "ta-moving-averages",
    title: "Moving Averages and Trend Systems",
    blurb: "What a moving average measures, how to read alignment and crossovers, and why the 10-week average is a practical tool for managing winners.",
    lessons: [
        L("ta-moving-averages-fundamentals", "Moving average fundamentals", 10,
            "A moving average smooths price to show direction. Understand how it is calculated, why it lags, and what the common periods are used for.",
            [
                p("A **moving average (MA)** is the average of the last N closing prices, recalculated every period. As a new price arrives, the oldest price drops out, so the line “moves”. It filters noise and shows the direction and slope of the trend."),
                h("Simple moving average (SMA)"),
                fm("SMA", "SMA(N) = (Close₁ + Close₂ + … + Close_N) ÷ N", "Every price in the window has equal weight."),
                p("Example: ABC Industries closes at ₹102, ₹104, ₹103, ₹106 and ₹110 over five sessions. The 5-day SMA is (102 + 104 + 103 + 106 + 110) ÷ 5 = 525 ÷ 5 = **₹105**. Tomorrow, if it closes at ₹108, the oldest close (₹102) drops out: (104 + 103 + 106 + 110 + 108) ÷ 5 = **₹106.2**."),
                h("Exponential moving average (EMA)"),
                fm("EMA", "Multiplier = 2 ÷ (N + 1)\nEMA today = (Close today − EMA yesterday) × Multiplier + EMA yesterday", "Recent prices carry more weight, so the EMA reacts faster than the SMA of the same length."),
                p("Example: for a 10-period EMA, the multiplier is 2 ÷ 11 = 0.1818. If yesterday’s EMA was ₹100 and today closes at ₹110, EMA today = (110 − 100) × 0.1818 + 100 = **₹101.82**. A 10-day SMA would respond slower on a day like this, or faster depending on which old price drops out, so the two lines differ."),
                h("Smoothing and lag"),
                p("The more days you average, the smoother the line and the later it turns. Every moving average **lags** because it is built from past prices. That is not a defect to be fixed. It is the trade-off: smoother lines give fewer false signals but later ones."),
                tb("Common moving averages", ["MA", "Typical use", "Advantage", "Limitation"], [
                    ["20-day", "Short-term trend and momentum pullbacks", "Responsive; hugs fast movers", "Whipsaws in choppy markets"],
                    ["50-day", "Intermediate trend; common pullback support for leaders", "Widely watched; roughly 10 weeks", "Late at turning points"],
                    ["100-day", "Slower trend filter", "Smoother than the 50", "Less commonly used by others"],
                    ["150-day", "About 30 weeks; part of trend-template and stage analysis", "Captures the primary trend", "Very slow to react"],
                    ["200-day", "Long-term trend boundary", "Widely followed; separates long-term bull and bear", "A major trend can be well advanced before it turns"],
                ]),
                p("There is nothing magical about these numbers. They matter partly because many participants watch them, which makes them practical reference levels. A stock that repeatedly bounces from its rising 50-day average is telling you that buyers defend that area."),
                // FUTURE VISUAL: price with 20, 50, 150 and 200 DMA overlays
                h("SMA or EMA?"),
                p("Pick one convention and stay consistent. Trend templates and stage analysis traditionally use simple averages (50, 150, 200 days or 30 weeks). Many swing traders use EMAs such as 10 and 21 for shorter-term trends. The difference matters less than the discipline of using the same tool the same way."),
                co("warn", "Common mistake", "Treating a moving average as a precise level. It is a zone and a slope indicator. A stock closing ₹1 below its 50-day average in an otherwise strong trend is not a trend break."),
                co("tip", "Practical use", "Look at two things on any average: the **slope** (rising, flat, falling) and the **location of price** relative to it. Both tell you more than any crossover."),
                takeaway("A moving average is smoothed price. Longer averages are slower and more reliable but later. Use slope and price location, and use one convention consistently."),
            ],
            [
                Q("Five closes: ₹102, ₹104, ₹103, ₹106, ₹110. What is the 5-day SMA?", [
                    "₹103",
                    "₹104",
                    "₹105",
                    "₹110",
                ], 2, "Sum = 525, divided by 5 = ₹105. The SMA gives each close equal weight."),
                Q("Why does an EMA react faster than an SMA of the same length?", [
                    "It uses fewer data points",
                    "It gives more weight to recent prices",
                    "It ignores volume",
                    "It is calculated on weekly data",
                ], 1, "The EMA’s multiplier puts greater weight on the latest closes, so it turns sooner than an SMA of the same period, at the cost of more false signals."),
                Q("A trader complains that the 200-day average only turns after a big move has already happened. What is the right response?", [
                    "The average is broken",
                    "Lag is inherent: it is the price paid for smoothness, so use it for context rather than precise timing",
                    "Use a 2-day average instead for all decisions",
                    "Ignore all averages",
                ], 1, "Moving averages are built from past prices. Longer averages filter noise but lag more. They are better for classifying the trend than for pinpointing turns."),
            ]),

        L("ta-moving-averages-alignment", "Moving average alignment", 9,
            "When short, medium and long averages stack in order and all slope the same way, the trend has a clear shape. Compression and expansion show how it is changing.",
            [
                p("A single average tells you about direction. **Several averages together** tell you about the quality and maturity of the trend. The classic bullish arrangement is:"),
                fm("Bullish alignment", "Price > 50 SMA > 150 SMA > 200 SMA\nall three averages sloping upwards", "Faster averages sit above slower ones because recent prices are higher than older prices. Slope shows the trend is still being fed."),
                h("What alignment tells us"),
                ul(
                    "**Bullish alignment:** over every horizon, recent average prices are higher than older ones. Pullbacks tend to find support at the 50-day or 150-day.",
                    "**Bearish alignment:** price < 50 < 150 < 200 with all sloping down. Rallies tend to stall at the averages above.",
                    "**Mixed or tangled averages:** the lines cross, flatten and overlap. Typical of ranges and transitions between trends."
                ),
                h("Compression and expansion"),
                p("**Compression** is when averages bunch together and flatten. It signals a pause or balance, such as the base before a new advance. **Expansion** is when averages fan out as an advance builds, with price pulling away from the longer lines. Neither is a signal on its own."),
                tb("Reading the arrangement", ["Arrangement", "Typical meaning", "How a trader may respond"], [
                    ["Price above 50 > 150 > 200, all rising", "Mature, healthy uptrend", "Look for pullbacks and breakouts; hold winners"],
                    ["Averages flat and bunched, price oscillating around them", "Basing or range", "Wait; watch for a break above the group on volume"],
                    ["50 below 150, price below both, all falling", "Established downtrend", "Avoid long setups; rallies are for lightening up"],
                    ["Price well above a flat 200 with the 50 flattening", "Possible topping", "Tighten risk and watch distribution"],
                ]),
                h("Slope and location"),
                p("Slope matters as much as order. A 200-day average that is rising for at least a month shows that the long-term trend is turning up or intact. A price **far above** its 50-day average (say 30% to 40%) is extended and carries more pullback risk even in a healthy trend. A price **near** a rising 50-day average is closer to where buyers have defended before and often offers a better risk-to-reward."),
                // FUTURE VISUAL: moving-average alignment, compression and expansion
                co("india", "Small and mid caps", "Indian small and mid caps can stretch far above their averages in strong phases and fall sharply when momentum fades. Distance from the 50-day average is a useful risk gauge."),
                co("warn", "Common mistake", "Treating alignment as a buy signal. It describes the **current trend**; it does not say whether this is a good moment to enter, where to put the stop, or whether the move is already extended."),
                takeaway("Alignment and slope describe trend quality. Stacked, rising averages mean a mature uptrend, bunched flat averages mean a pause, and price distance from the averages is a gauge of extension."),
            ],
            [
                Q("What does 50 SMA > 150 SMA > 200 SMA, all rising, describe?", [
                    "A guaranteed entry point",
                    "A healthy, mature uptrend over several horizons",
                    "A sideways market",
                    "A stock that is cheap",
                ], 1, "Recent average prices exceeding older ones at every horizon is what uptrend means in averages. It is a description of trend quality, not a timing signal."),
                Q("Averages are bunched, flat and tangled while price weaves through them. This most likely indicates:", [
                    "A strong Stage 2 advance",
                    "A pause, base or range with no clear trend",
                    "A guaranteed breakout upward",
                    "A guaranteed breakdown",
                ], 1, "Compression with price crossing the lines suggests balance. Direction will come from the resolution, ideally on volume."),
                Q("A stock in a healthy uptrend is 40% above its 50-day average. What is the sensible conclusion?", [
                    "It is a great entry because the trend is strong",
                    "Extension risk is high: a normal pullback toward the average would be large relative to a sensible stop",
                    "The stock must be shorted",
                    "Averages no longer matter",
                ], 1, "A strong trend can run further, but buying far from support makes the stop distant and the risk/reward poor."),
            ]),

        L("ta-moving-averages-crossovers", "Moving average crossovers", 8,
            "Golden cross and death cross are famous, and mostly late. Learn what crossovers really say and where they fail.",
            [
                p("A **crossover** happens when a faster average crosses a slower one. It is a rule that turns the alignment idea into an event."),
                ul(
                    "**Golden cross:** the 50-day average crosses above the 200-day average.",
                    "**Death cross:** the 50-day average crosses below the 200-day average.",
                    "Shorter versions exist, such as 10 over 20, or 20 over 50, with the same logic and more frequent signals."
                ),
                h("Why crossovers lag"),
                p("The 50-day average can only cross above the 200-day after prices have been higher for a while. By the time the cross occurs, a large part of the move may already be done. For example, a stock that bottoms at ₹200 and rallies to ₹290 might only produce the golden cross at ₹290. A trader waiting for that signal pays 45% more than the low and can still be right."),
                h("Where they work and where they fail"),
                tb("Crossover behaviour", ["Market type", "What happens", "Result"], [
                    ["Sustained trend", "Cross occurs once and price continues in the same direction", "Crossover system captures a large portion of the move"],
                    ["Range or chop", "Price oscillates around the averages and keeps crossing back", "Repeated false signals (whipsaws) and small losses"],
                    ["Sharp reversal", "Price changes direction faster than the averages", "Signal arrives late, often near the turning point"],
                ]),
                co("key", "Crossovers confirm; they do not forecast", "A crossover is a trend-following confirmation. It says the trend has already changed, not that it will continue. That is useful for a long-term filter, but it is a poor entry timing tool."),
                co("warn", "Crossover systems are not magic", "A golden cross does not guarantee an uptrend and a death cross does not guarantee a decline. In range markets, crossovers lose money repeatedly. If you use them, combine them with structure, volume and market regime, and expect false signals."),
                h("A better use of crossovers"),
                ul(
                    "As a **filter**: only look for long setups when the 50 is above the 200.",
                    "As a **context** statement: the long-term trend has turned up or down.",
                    "As a **warning**: a death cross after a long decline tells you the long-term trend is deteriorating, not that the bottom is in."
                ),
                co("tip", "Practical use", "Ask “what is the average telling me that price structure has not already told me?” Usually the answer is that the structure came first."),
                takeaway("Crossovers are late, trend-following confirmations that work in sustained trends and fail in ranges. Use them as filters and context, not as standalone buy and sell triggers."),
            ],
            [
                Q("Why do moving average crossovers lag?", [
                    "Because they are calculated from past prices, so price must already have moved before the averages cross",
                    "Because exchanges delay the data",
                    "Because only weekly charts can show them",
                    "Because crossovers use volume",
                ], 0, "An average of past prices can only cross after prices have changed for a while. That makes crossovers confirmations rather than predictions."),
                Q("A stock oscillates between ₹95 and ₹105 for months. A 20/50 crossover system keeps flipping between buy and sell. What is happening?", [
                    "Whipsaws: in a range, price repeatedly crosses the averages and the signals produce small losses",
                    "A perfect system",
                    "A golden cross",
                    "A breakout",
                ], 0, "Trend-following tools do well in trends and poorly in ranges. Using a market-regime or structure filter can reduce this problem."),
                Q("Which is the most sensible use of the golden cross?", [
                    "A guaranteed buy at any price",
                    "A context filter: long setups are more interesting when the 50-day is above a rising 200-day",
                    "A signal to ignore stop losses",
                    "A sell signal",
                ], 1, "The cross says the long-term trend has improved. It narrows the list of candidates but does not provide entry, stop or size."),
            ]),

        L("ta-moving-averages-10-week", "The 10-week average and position management", 10,
            "Weekly charts remove noise. The 10-week and 30-week averages give practical rules for staying with winners and exiting broken trends.",
            [
                p("Daily charts are noisy. A single bad session can look dramatic and still mean nothing. The **weekly chart** compresses five sessions into one candle, so it shows the trend that really matters for positions held for weeks or months."),
                h("Why weekly averages"),
                ul(
                    "A **10-week SMA** is about the same as a 50-day average. It tracks the intermediate trend.",
                    "A **30-week SMA** is about the same as a 150-day average. It tracks the primary trend and is the main line in stage analysis (covered later).",
                    "Weekly lines are slower and smoother, so a close below them is more meaningful than a daily dip below the 50-day."
                ),
                h("Price versus the 10-week average"),
                p("In a strong advance, leading stocks often hold above their rising 10-week average for months, and pullbacks end near it. That behaviour makes it a practical **trailing guide**."),
                tb("Reading price against the 10-week average", ["Observation", "Likely meaning", "Possible response"], [
                    ["Price holds above a rising 10-week average, with pullbacks to it bouncing", "Healthy trend", "Hold; trail stop below the average or the last higher low"],
                    ["One weekly close slightly below it, then recovery next week", "Normal pullback or shakeout", "Check structure, volume and market before reacting"],
                    ["Two or more weekly closes below it, on rising volume, with the average flattening", "Trend weakening", "Reduce or exit according to your plan"],
                    ["Price decisively below a falling 10-week average and the 30-week", "Trend broken", "Do not hold hoping; exit rules apply"],
                ]),
                // FUTURE VISUAL: weekly chart with 10-week and 30-week averages showing a normal pullback and a real violation
                h("Violation versus normal pullback"),
                p("The difficulty is telling a **violation** from a **normal pullback**. Use evidence in combination."),
                ul(
                    "**Close, not intraday:** a weekly close below the average, not just a wick.",
                    "**Depth:** how far did it close below? A few percent is different from 8%.",
                    "**Volume:** a break on heavy weekly volume is more serious than one on declining volume.",
                    "**Slope:** is the average still rising or has it flattened?",
                    "**Context:** is the stock’s relative strength holding, and is the broad market still healthy?"
                ),
                h("Selling rules in strong trends"),
                p("A common approach for a stock you bought on a breakout: keep the initial stop below the base. Once the stock advances, move the stop up. When the stock is working well, trail below the 10-week average, and exit on a weekly close below it, particularly when volume is high and the average is turning. If the stock is a slower, steadier compounder, the 30-week average is a wider, more patient guide."),
                co("tip", "Practical use", "Choose one rule before entering (for example “exit on a weekly close below the 10-week average with heavier-than-average volume”) and write it into your plan. Deciding during the drawdown is where emotion enters."),
                co("warn", "Common mistake", "Using the 10-week average on stocks that are not trending, or on illiquid names where one week can be distorted by a single large order. The rule belongs with leaders in clear uptrends."),
                co("india", "Corporate actions", "Check that weekly data is adjusted for splits and bonuses. A fake gap can push the stock below its average on paper."),
                takeaway("The weekly 10-week average is a practical trailing guide for strong stocks, and the 30-week is the primary trend line. A violation is judged by close, depth, volume, slope and context, not by a single wick."),
            ],
            [
                Q("Why is a weekly close below the 10-week average more meaningful than a daily dip below the 50-day average?", [
                    "It is not; daily dips are always more important",
                    "Weekly data filters out noise from five sessions, so a weekly close below the line is a more established signal",
                    "Weekly charts have more volume",
                    "Weekly charts remove risk",
                ], 1, "A weekly candle summarises five sessions. A close beyond the average at that scale reflects a more durable change in the balance of buyers and sellers."),
                Q("A stock in a strong uptrend closes one week 1.5% below its rising 10-week average on lighter-than-average volume, then recovers the next week. How should this be read?", [
                    "As a confirmed trend break",
                    "As a likely normal pullback or shakeout; it needs evidence like more closes below, heavier volume and a flattening average to become a violation",
                    "As a signal to double the position at once",
                    "As proof the stock will not rise again",
                ], 1, "Shallow, low-volume dips that recover quickly are typical of healthy trends. A true violation is shown by more evidence, not one close."),
                Q("Which exit rule is best defined?", [
                    "Sell when I feel nervous",
                    "Exit on a weekly close below the 10-week average on above-average volume while the average is flattening",
                    "Sell as soon as the stock falls 1%",
                    "Never sell",
                ], 1, "A written, objective rule with confirmation filters prevents emotional decisions and reduces premature exits from ordinary pullbacks."),
            ]),
    ],
};

/* ════════════════════════════════════════════════════════════════════════
   TRACK 4 — Volume and Price-Volume Analysis
   ════════════════════════════════════════════════════════════════════════ */
const TA_VOLUME = {
    id: "ta-volume",
    title: "Volume and Price-Volume Analysis",
    blurb: "Volume shows how much conviction stands behind a move. Learn to read expansion, dry-up, breakout volume and accumulation.",
    lessons: [
        L("ta-volume-understanding", "Understanding volume", 8,
            "Volume is participation. It is not direction by itself, but it tells you how seriously to take a price move.",
            [
                p("**Volume** is the number of shares traded in a period. Every share traded has a buyer and a seller, so volume does not say who was more aggressive. It says **how many people cared**. Price tells you what happened and volume tells you how much weight to give it."),
                h("Key terms"),
                tb("Volume vocabulary", ["Term", "Meaning", "Why it matters"], [
                    ["Average volume", "Mean volume over a period, usually 50 days", "The stock’s own baseline for “normal”"],
                    ["Relative volume (RVOL)", "Today’s volume ÷ average volume", "Shows how unusual today’s participation is"],
                    ["Volume expansion", "Volume clearly above average", "Many participants acting; institutions often involved"],
                    ["Volume contraction", "Volume falling over several sessions", "Interest fading; often during orderly pullbacks and bases"],
                    ["Volume dry-up", "Volume at or near its lowest levels in the pattern", "Sellers have run out, supply is thin"],
                ]),
                fm("Relative volume", "Relative volume = Today’s volume ÷ 50-day average volume", "Example: average 4,00,000 shares and today 10,00,000 shares gives 2.5x. Compare a stock only with its own history."),
                h("Why volume matters"),
                p("A stock moves 4% on 1.2 times average volume in a quiet week. A different stock moves 4% on 4 times average volume right after results. The percentage is the same, but the second move involved far more capital and probably large institutions, which can sustain a move. Large funds cannot buy or sell in one day, so their activity shows up as unusual volume spread over days or weeks."),
                co("india", "Delivery and liquidity", "In India, many traders also look at delivery percentage (the share of volume that is actually delivered rather than squared off intraday). It can help judge the quality of a volume spike. Also check absolute liquidity: a ₹2 Cr daily turnover small cap can show dramatic volume changes from a few large orders."),
                co("warn", "Common mistake", "Comparing volume across stocks, or treating high volume as bullish by definition. High volume on a decline is selling pressure, and high volume near a top can be distribution. Direction comes from price; volume adds weight."),
                takeaway("Volume tells you how much participation stands behind a price move. Measure it against the stock’s own average, and read it together with price, never alone."),
            ],
            [
                Q("A stock’s 50-day average volume is 4,00,000 shares. Today it traded 10,00,000 shares. What is its relative volume?", [
                    "0.4x",
                    "2.5x",
                    "4x",
                    "6x",
                ], 1, "10,00,000 ÷ 4,00,000 = 2.5. Relative volume compares today’s participation with the stock’s own baseline."),
                Q("Why is relative volume better than raw volume for comparing today’s activity?", [
                    "Raw volume is always misleading",
                    "Different stocks have very different normal volumes, so only a comparison with the stock’s own average is meaningful",
                    "Relative volume predicts prices",
                    "Raw volume is not recorded",
                ], 1, "A million shares is quiet for one stock and extreme for another. Relative volume normalises for that."),
            ]),

        L("ta-volume-price-volume", "Price and volume together", 9,
            "Four combinations of price and volume form the core vocabulary of price-volume analysis. They are tendencies, not laws.",
            [
                p("Reading price and volume together gives four basic combinations. Each one tells you about the balance between buyers and sellers, subject to context."),
                tb("Price and volume combinations", ["Price", "Volume", "Typical interpretation", "Caveat"], [
                    ["Up", "Up", "Demand confirmation: buyers are willing to pay higher prices in size", "A late-stage spike can also be a climax"],
                    ["Up", "Down", "Weaker confirmation: the rise lacks broad participation", "Fine during an orderly rebound in a healthy trend"],
                    ["Down", "Up", "Selling pressure or distribution: sellers are active in size", "May also be a final shakeout or capitulation low"],
                    ["Down", "Down", "Potentially normal correction: sellers are not pressing", "Persistent low-volume decline in a weak trend is still a decline"],
                ]),
                co("warn", "Tendencies, not laws", "These combinations are contextual. High volume at a decline into major support can be capitulation, which marks a low. High volume at the end of a long advance can mean exhaustion. The same combination means different things at different places in the trend."),
                h("What to look for in a healthy advance"),
                ul(
                    "Up days with higher volume than down days.",
                    "Pullbacks with contracting volume that stop near support or a rising average.",
                    "Breakouts and new highs accompanied by above-average volume.",
                    "Few or no high-volume down days that close near their lows."
                ),
                h("Warning patterns"),
                ul(
                    "**Churning:** unusually heavy volume with little price progress. Large sellers may be absorbing the demand.",
                    "**Heavy down days:** a day with the biggest volume in months on a sharp decline is a serious message, particularly after an advance.",
                    "**Rising prices on shrinking volume at highs:** fewer participants are chasing."
                ),
                h("An example"),
                p("XYZ Technologies (fictional) rises from ₹300 to ₹360 over six weeks. Weekly volume on up weeks averages 12 lakh shares and on down weeks 6 lakh. It then falls 6% on 20 lakh shares, the heaviest week in a year, and closes at the low. Compare: if that same 6% pullback had come on 5 lakh shares and bounced from the rising 50-day average, it would read as ordinary profit-taking. The price move is the same; the volume changes the story."),
                // FUTURE VISUAL: price-volume chart with accumulation weeks and one distribution week
                co("tip", "Practical use", "Count the number of high-volume up days versus high-volume down days over the last 15 to 20 sessions. A healthy stock usually shows more of the former."),
                takeaway("Price up with volume up confirms demand, price down with volume up warns of supply. Always ask where in the trend you are, because the same combination can signal either strength or exhaustion."),
            ],
            [
                Q("A stock rises 3% on volume 40% below its average at the top of a long advance. What is the most careful reading?", [
                    "Very bullish confirmation",
                    "Weaker confirmation: participation is thinner, so the rise deserves less trust",
                    "A guaranteed top",
                    "Irrelevant, because volume is meaningless",
                ], 1, "Price rising on fading volume suggests fewer buyers. It is a caution, not a sell signal in itself."),
                Q("After a long advance, a stock falls sharply on the heaviest volume in a year and closes at its low. What does it most likely show?", [
                    "A normal low-volume pullback",
                    "Heavy selling by large holders, a serious warning that supply is overwhelming demand",
                    "A buy signal because price is cheaper",
                    "Nothing, because it was one day",
                ], 1, "A big decline on unusual volume at the end of an advance often reflects institutional distribution. It does not predict the outcome but warrants risk reduction."),
                Q("Why are price-volume relationships called tendencies rather than laws?", [
                    "Because their meaning depends on context such as where in the trend they occur",
                    "Because volume data is random",
                    "Because they only work on Fridays",
                    "Because they are exact on daily charts",
                ], 0, "High volume on a fall can be capitulation near a low or distribution near a high. Location and trend context decide."),
            ]),

        L("ta-volume-breakout", "Breakout volume", 9,
            "A breakout without participation is a rumour. Learn what breakout volume should look like, and what a failed breakout looks like.",
            [
                p("When price moves above a resistance zone, it must absorb all the shares that holders want to sell there. That takes demand, and demand shows up as volume."),
                h("What good breakout volume looks like"),
                ul(
                    "A **volume surge** on the breakout day, often 1.5 to 3 times the 50-day average or more. There is no magic number. Compare with how the stock usually behaves on strong days.",
                    "The surge comes after a period of **quiet volume** during the base, so the contrast is clear.",
                    "A strong close near the day’s high, showing buyers held the move.",
                    "**Follow-through:** the next several sessions hold above the breakout level, ideally with decent volume on up days and lighter volume on pullbacks."
                ),
                fm("Breakout volume check", "Relative volume on breakout day = Breakout day volume ÷ 50-day average volume", "Example: 12,50,000 ÷ 5,00,000 = 2.5x. A reading above roughly 1.5x is commonly considered supportive, but the stock’s own history matters."),
                h("Low-volume breakouts"),
                p("A breakout on average or below-average volume often fails to attract follow-through. Price pushed above the level but not enough shares were absorbed. Not every low-volume breakout fails, particularly in thin stocks or in a strongly rising market, but the odds are less favourable and the risk is higher."),
                h("Failed breakouts"),
                p("A failed breakout happens when price moves above resistance and then falls back below it, usually on the same volume that looked promising or on heavy selling. This is a **bull trap**: late buyers are caught above the level."),
                tb("Breakout quality", ["Feature", "Higher quality", "Lower quality"], [
                    ["Volume on breakout day", "Well above average", "Average or lower"],
                    ["Close", "Near the high", "Near the low, long upper wick"],
                    ["Prior base volume", "Dry-up in the base", "Choppy and heavy throughout"],
                    ["Follow-through", "Holds above the level for days", "Falls back below within days"],
                    ["Market backdrop", "Healthy market", "Market under distribution"],
                ]),
                co("india", "Intraday volume", "Volume builds through the NSE session, so a stock showing 60% of its average volume by noon may finish well above average. When judging an intraday breakout, compare volume with the typical volume by that time of day, or wait for the close."),
                co("tip", "Practical use", "Write down the volume ratio of every breakout you take and what happened afterwards. After 30 trades you will have your own data on how much volume tends to matter for the stocks you trade."),
                takeaway("Breakouts need demand to absorb supply. Look for a clear volume surge after a quiet base, a strong close, and follow-through. Without them the breakout is more likely to fail, and a quick exit is part of the plan."),
            ],
            [
                Q("A stock breaks out of a base on 2.5 times average volume after a quiet, low-volume base and closes near its high. What does this combination suggest?", [
                    "Strong demand absorbed the supply at resistance, which raises the odds of follow-through",
                    "A guaranteed 20% gain",
                    "A bull trap",
                    "That volume is irrelevant",
                ], 0, "Volume expansion against a quiet backdrop plus a strong close is the footprint of real demand. It improves odds but nothing is guaranteed."),
                Q("What is a bull trap?", [
                    "A rise on very high volume",
                    "A breakout above resistance that falls back below it, trapping buyers who bought the move",
                    "A sideways base",
                    "A gap down on bad news",
                ], 1, "The breakout fails to hold, so buyers are caught above the level. This is why stops and a rule about closing back below the pivot exist."),
                Q("Why can a stock that has 60% of its average volume by noon still be a valid high-volume breakout day?", [
                    "Volume accumulates through the session, so it may finish well above average",
                    "Volume resets at noon",
                    "Noon volume is the only volume that counts",
                    "It cannot be valid",
                ], 0, "Judging intraday needs time-of-day awareness. Many traders use the close or compare with typical volume by that hour."),
            ]),

        L("ta-volume-accumulation-distribution", "Accumulation and distribution", 9,
            "Large investors cannot buy or sell in a day. Their footprints show up as accumulation and distribution. Indicators like OBV try to measure it.",
            [
                p("Mutual funds, insurers and foreign portfolio investors take days or weeks to build a position without moving the price too far. That process is **accumulation**. When they exit, it is **distribution**. Neither is announced, but both leave footprints in price and volume."),
                tb("Accumulation versus distribution", ["Feature", "Accumulation", "Distribution"], [
                    ["Where it occurs", "Bases, quiet pullbacks, early in an advance", "Near highs, in extended or topping stocks"],
                    ["Up days", "Higher volume, strong closes", "Higher volume but weak closes, stalling"],
                    ["Down days", "Light volume, shallow declines", "Heavy volume, closes near lows"],
                    ["Support", "Dips are bought near averages", "Rallies fail below prior highs"],
                    ["Result", "Eventually, price advances", "Eventually, price declines"],
                ]),
                h("Up-volume and down-volume"),
                p("A simple measure is to add the volume on up days and compare it with the volume on down days over a period (for example 50 days). A ratio above 1 means more volume came on up days. It is crude but intuitive."),
                h("On-Balance Volume (OBV)"),
                fm("OBV", "If today’s close > yesterday’s: OBV = previous OBV + today’s volume\nIf today’s close < yesterday’s: OBV = previous OBV − today’s volume\nIf unchanged: OBV = previous OBV", "OBV is a running total. The absolute value means nothing. The direction and divergences from price are what you read."),
                p("If price is flat in a base while OBV rises to a new high, it can suggest buyers are quietly absorbing supply. If price makes a new high while OBV fails to, it suggests the rise has less volume behind it."),
                h("Accumulation/Distribution line and similar tools"),
                p("The Accumulation/Distribution (A/D) line and Chaikin money flow use **where the close sits in the day’s range** to weigh the volume. A close near the high counts as more accumulation and a close near the low as more distribution. They add detail beyond OBV, which only checks whether the close was up or down."),
                // FUTURE VISUAL: price with OBV showing divergence in a base
                h("Limitations"),
                ul(
                    "These indicators assume volume reflects institutional behaviour. It also contains retail and intraday trading.",
                    "A single huge block trade can distort the line for months.",
                    "They are derived from price and volume, so they cannot show new information. Use them to confirm what price and volume visually suggest.",
                    "On illiquid small caps, volume is erratic and these tools are less reliable."
                ),
                co("warn", "Common mistake", "Buying only because OBV is rising. An indicator can improve confidence in a setup that already looks good on the chart. It does not replace the setup."),
                takeaway("Accumulation shows demand quietly absorbing supply, distribution shows supply overwhelming demand. Up-volume versus down-volume, OBV and A/D lines can help, but they are secondary to the price and volume bars themselves."),
            ],
            [
                Q("Price is flat in a six-week base while OBV climbs to a new high. What might this suggest?", [
                    "Buyers may be quietly absorbing supply, a possible sign of accumulation, which still needs confirmation from price",
                    "A confirmed breakdown",
                    "OBV is broken",
                    "Distribution",
                ], 0, "OBV rising while price is flat means more volume is trading on up days than down days. It is a clue, not a signal."),
                Q("Which pattern is more consistent with distribution?", [
                    "Heavy volume on up days that close strong",
                    "Repeated heavy-volume days near highs with weak closes and stalling price",
                    "Light volume pullbacks that hold support",
                    "Volume dry-up in a base",
                ], 1, "Stalling price with heavy volume and weak closes suggests supply is meeting demand at those levels."),
                Q("What is a limitation of OBV?", [
                    "It cannot be calculated",
                    "It only uses whether the close was up or down, and one very large block of volume can distort it for a long time",
                    "It uses only price",
                    "It works only on weekly charts",
                ], 1, "OBV treats all volume on an up day as buying, which is crude. Large single-day volume can dominate the running total."),
            ]),
    ],
};

/* ════════════════════════════════════════════════════════════════════════
   TRACK 5 — Momentum Indicators
   ════════════════════════════════════════════════════════════════════════ */
const TA_MOMENTUM = {
    id: "ta-momentum",
    title: "Momentum Indicators",
    blurb: "RSI, MACD and the stochastic oscillator: what each actually measures, when it helps, and why “overbought” is not a sell signal.",
    lessons: [
        L("ta-momentum-rsi", "RSI: what it measures and what it does not", 11,
            "RSI compares recent gains with recent losses. In strong trends it can stay high for a long time, so its value lies in ranges and divergences, not in 70/30 rules.",
            [
                p("The **Relative Strength Index (RSI)**, created by J. Welles Wilder, measures the **speed and size of recent price changes** on a 0 to 100 scale. It is a momentum oscillator: it asks whether recent gains have been larger than recent losses."),
                co("warn", "RSI is not Relative Strength", "RSI measures a stock’s own momentum. **Relative strength** compares a stock with an index or other stocks. They are different tools with similar names. The Relative Strength track covers the second."),
                h("The calculation idea"),
                fm("RSI (14 periods)", "RS  = Average gain over 14 periods ÷ Average loss over 14 periods\nRSI = 100 − 100 ÷ (1 + RS)", "Wilder smooths the averages rather than taking a plain mean. If average gain is 1.2 and average loss is 0.6, RS = 2 and RSI = 100 − 100 ÷ 3 = 66.7."),
                p("If a stock has only gained, RSI approaches 100. If it has only lost, RSI approaches 0. A value near 50 means gains and losses have been balanced."),
                h("Why 70 and 30 do not mean sell and buy"),
                p("The textbook rule says above 70 is overbought and below 30 is oversold. That is true for **ranging** markets and often fails in trends. A stock in a powerful advance can stay above 70 for weeks because strong momentum is exactly what produces high RSI. Selling every reading above 70 means selling the best stocks early."),
                co("key", "Overbought is not automatically bearish", "A high RSI shows strong momentum, not a reversal. In a downtrend, an RSI below 30 can persist while the stock keeps falling. Oversold is not automatically bullish."),
                h("RSI ranges during trends"),
                tb("RSI behaviour by regime", ["Regime", "Typical RSI zone", "How to use it"], [
                    ["Strong uptrend", "Often 40 to 80; dips to roughly 40 to 50 tend to attract buyers", "Use pullbacks to the 40 to 50 area as potential entry context, with price confirming"],
                    ["Strong downtrend", "Often 20 to 60; rallies to roughly 50 to 60 tend to stall", "Treat 50 to 60 as resistance on rallies; avoid catching knives at 30"],
                    ["Range", "Swings between roughly 30 and 70", "Classic overbought/oversold readings are more reliable here"],
                ]),
                h("Divergence"),
                p("A **bearish divergence** occurs when price makes a higher high but RSI makes a lower high, showing the push has less momentum. A **bullish divergence** is a lower low in price with a higher low in RSI. Divergences warn that momentum is changing, but they can persist while price keeps trending, so they are best used with structure: a divergence plus a break of the last higher low is far stronger than a divergence alone."),
                h("Failure swings and RSI levels"),
                ul(
                    "**Failure swing (top):** RSI rises above 70, pulls back, rallies but fails to exceed its previous peak, then breaks below the pullback low. It suggests momentum cannot make a new push.",
                    "**RSI support and resistance:** RSI itself can break trendlines and hold levels. A move above 60 after a base can signal that momentum has shifted bullish."
                ),
                // FUTURE VISUAL: RSI staying between 40 and 80 in an uptrend; bearish divergence at a top
                co("tip", "When RSI helps", "In ranges, for finding exhaustion near boundaries. In trends, for spotting the zone where pullbacks tend to end, and for detecting divergence at structural turning points."),
                co("warn", "When to ignore it", "As a stand-alone sell signal for a leading stock above 70, or as a stand-alone buy signal for a stock falling in a weak structure at 30."),
                takeaway("RSI measures momentum. Use its regime-based ranges and divergences with price structure. The 70/30 rule is a range-market tool, not a universal signal."),
            ],
            [
                Q("A stock has average gains of 1.2 and average losses of 0.6 over 14 periods. What is RSI?", [
                    "50.0",
                    "60.0",
                    "66.7",
                    "80.0",
                ], 2, "RS = 1.2 ÷ 0.6 = 2. RSI = 100 − 100 ÷ (1 + 2) = 100 − 33.3 = 66.7."),
                Q("A leading stock in a strong uptrend shows RSI above 70 for six weeks. What is the most reasonable reading?", [
                    "It must be sold immediately because it is overbought",
                    "Strong momentum can keep RSI elevated; the reading alone is not a reversal signal, and structure and volume should decide",
                    "RSI is broken",
                    "It will fall to 30 next week",
                ], 1, "High RSI in a strong trend is a feature of momentum, not a flaw. Exits should rely on structure, risk rules and evidence of distribution."),
                Q("Price makes a higher high but RSI makes a lower high. What is it called, and how should it be used?", [
                    "A bearish divergence: a warning of weakening momentum, best combined with a break of structure",
                    "A golden cross",
                    "A guaranteed top",
                    "A bullish divergence",
                ], 0, "Divergences warn that the push is weaker. They can persist for long periods, so acting only on the divergence leads to early exits."),
            ]),

        L("ta-momentum-macd", "MACD", 10,
            "MACD measures the gap between two moving averages. Learn to read the line, the signal, the histogram and the zero line.",
            [
                p("**MACD** (Moving Average Convergence Divergence) shows how far a fast EMA has moved from a slow EMA, and whether that gap is widening or shrinking. In other words, it measures **trend and momentum together**."),
                fm("Standard MACD (12, 26, 9)", "MACD line   = EMA(12) − EMA(26)\nSignal line = EMA(9) of the MACD line\nHistogram   = MACD line − Signal line", "When the fast EMA is above the slow one, MACD is positive. Its distance from zero reflects how strong the trend is."),
                h("The three components"),
                ul(
                    "**MACD line:** the gap between the fast and slow EMA. Rising means the trend is accelerating, falling means decelerating.",
                    "**Signal line:** a smoothed MACD. When MACD crosses it, momentum has shifted a notch.",
                    "**Histogram:** the gap between them. It is the earliest component to show acceleration or deceleration, because it turns before the lines cross."
                ),
                h("Crossovers and the zero line"),
                tb("Reading MACD", ["Event", "What it says", "Caveat"], [
                    ["MACD crosses above the signal line", "Short-term momentum turned up", "Frequent in ranges; many false signals"],
                    ["MACD crosses below the signal line", "Short-term momentum turned down", "In a strong trend this often marks only a pause"],
                    ["MACD crosses above zero", "Fast EMA moved above slow EMA: an upward shift in trend", "Lags, like any average-based signal"],
                    ["Histogram shrinking while price still rises", "Acceleration is fading", "Can precede a pause or just consolidation"],
                    ["Divergence with price", "Momentum no longer confirming the new high or low", "Can persist for long; use with structure"],
                ]),
                h("Momentum acceleration and deceleration"),
                p("A rising histogram means momentum is accelerating. A histogram that peaks and starts shrinking, even while still positive, means the pace is slowing. That is information about **speed**, not about direction reversing. A car decelerating from 120 to 90 km/h is still moving forward."),
                h("Trend versus range behaviour"),
                p("MACD is built from moving averages, so it behaves like them. In trends it gives useful context. In ranges it crosses back and forth constantly and produces many small losses if traded as a system. Use it after you know the regime."),
                // FUTURE VISUAL: MACD with histogram on a trend-then-range chart
                co("tip", "Practical use", "In a stock with strong structure, MACD staying above zero supports the view that the primary trend is up. A first dip of MACD toward zero followed by a turn back up often accompanies healthy pullbacks."),
                co("warn", "Common mistake", "Selling every bearish signal-line cross in a strong uptrend. These crosses are common in healthy pauses and would cut your winners short."),
                takeaway("MACD is the gap between two EMAs plus a smoothed version. It helps judge whether trend momentum is accelerating or fading, works best in trending markets, and lags like any average-based tool."),
            ],
            [
                Q("What does the standard MACD line represent?", [
                    "RSI minus 50",
                    "EMA(12) minus EMA(26)",
                    "The volume trend",
                    "Highest high minus lowest low",
                ], 1, "MACD is the difference between a fast and a slow exponential moving average, so it measures the gap between short-term and longer-term trend."),
                Q("The histogram is shrinking while price is still rising. What does this show?", [
                    "A guaranteed reversal",
                    "Acceleration is slowing; the advance is losing speed but not necessarily direction",
                    "Volume is rising",
                    "MACD has crossed zero",
                ], 1, "The histogram measures the gap between MACD and signal. A shrinking gap means momentum is slowing. That can precede a pause or a reversal."),
                Q("Why does MACD generate many false crossover signals in a sideways market?", [
                    "It is built from moving averages, which cross back and forth when price has no sustained direction",
                    "It uses volume",
                    "It only works in bear markets",
                    "It is hard-coded to alternate",
                ], 0, "Averages need a trend to stay separated. In a range, the fast average repeatedly crosses the slow one."),
            ]),

        L("ta-momentum-stochastic", "The stochastic oscillator", 8,
            "The stochastic shows where the close sits within its recent range. Useful in ranges, misleading in strong trends.",
            [
                p("The **stochastic oscillator** asks a simple question: in the last N periods, is the close near the top of the range or near the bottom? In strong rising markets, closes tend to be near the highs of the range. In weak markets, they tend to be near the lows."),
                fm("Stochastic %K (14)", "%K = (Close − Lowest Low over 14) ÷ (Highest High over 14 − Lowest Low over 14) × 100\n%D = 3-period average of %K", "Example: the 14-day low is ₹90, the high is ₹110 and the close is ₹107. %K = (107 − 90) ÷ 20 × 100 = 85."),
                p("**Fast stochastic** uses the raw %K. **Slow stochastic** first smooths %K with a 3-period average, so its %K equals the fast %D. Slow is more common because it has fewer false flickers."),
                h("Overbought and oversold"),
                p("Readings above 80 are called overbought and below 20 oversold. In a range, price tends to turn at the edges, so crossing back below 80 or above 20 gives timing clues. In a strong trend, the stochastic can sit above 80 for weeks because the close keeps landing near the top of the range. Treating that as a sell is a classic mistake."),
                co("warn", "Why it fails in trends", "The stochastic measures position within a **recent range**, not trend strength. A stock grinding up with closes near the highs keeps reading overbought while price keeps rising."),
                h("Where it helps"),
                ul(
                    "**Range-bound markets:** boundaries at roughly 20 and 80 can time bounces within a known support/resistance box.",
                    "**Pullback timing in a trend:** a dip below 20 and a turn back above it in a stock with a strong, rising structure can add timing detail to an entry near support.",
                    "**Divergence:** like RSI, a lower stochastic high at a price high can warn of fading momentum."
                ),
                co("tip", "Practical use", "Decide the regime first. If the stock is in a trend, ignore overbought readings and use dips to the low zone for timing. If in a range, treat the extremes as meaningful."),
                takeaway("The stochastic shows where the close is within its recent range. It is a range-market tool, can stay overbought in strong trends, and is best used for timing after the regime is identified."),
            ],
            [
                Q("The 14-day low is ₹90, the high is ₹110 and today’s close is ₹107. What is %K?", [
                    "50",
                    "70",
                    "85",
                    "95",
                ], 2, "%K = (107 − 90) ÷ (110 − 90) × 100 = 17 ÷ 20 × 100 = 85."),
                Q("Why can the stochastic stay above 80 for many weeks in a strong uptrend?", [
                    "Because it measures where the close sits within its recent range, and in strong trends closes cluster near the highs",
                    "Because it uses volume",
                    "Because it is broken",
                    "Because it only works on weekly data",
                ], 0, "In a steady advance, each close is near the top of the lookback range, so the oscillator stays high. That reflects strength, not a certain top."),
            ]),

        L("ta-momentum-comparison", "Choosing between momentum indicators", 8,
            "Three indicators answer slightly different questions. Pick one with a purpose, not one of each by habit.",
            [
                p("RSI, MACD and the stochastic all summarise momentum, so they are strongly correlated. Using all three at once usually repeats the same information three times and creates false confidence. The goal is to know when each is the right tool."),
                tb("Indicator comparison", ["Indicator", "Measures", "Best use", "Major weakness"], [
                    ["RSI", "Speed of recent gains versus losses", "Momentum regime (40 to 80 vs 20 to 60 zones), divergence", "Can stay extreme in strong trends"],
                    ["MACD", "Gap between fast and slow EMA", "Trend confirmation, acceleration and deceleration", "Lags; many false crosses in ranges"],
                    ["Stochastic", "Close within recent range", "Range markets and timing dips within a range", "Overbought for long in strong trends"],
                ]),
                h("Matching tool to question"),
                ul(
                    "“Is momentum still healthy in this uptrend?” → RSI zone behaviour or MACD above zero.",
                    "“Is acceleration fading?” → MACD histogram.",
                    "“Is this a range, and where in the range are we?” → Stochastic with support and resistance.",
                    "“Is a new high being confirmed?” → Compare price with RSI or MACD highs for divergence."
                ),
                co("key", "Indicators support price", "Structure, trend, volume and relative strength come first. A momentum indicator is a measuring tool for the push behind price. If price structure says wait, no indicator reading should override it."),
                h("The danger of indicator stacking"),
                p("Adding indicators until they agree is a form of confirmation bias. You will almost always find one that supports the trade you already want. A better approach: choose one momentum tool, learn its behaviour on your stocks, and write down what it must show for a setup to qualify."),
                co("warn", "Common mistake", "Treating a bearish MACD cross, an RSI above 70 and a stochastic above 80 as three independent warnings. They all derive from the same price series and often react together."),
                co("tip", "Practical use", "For trend-following setups in this course, a simple filter is enough: relative strength and price structure first, and RSI or MACD only for timing and for detecting divergence at key levels."),
                takeaway("Momentum indicators are correlated views of the same data. Choose one for a defined purpose, learn its behaviour by regime, and keep price structure, volume and relative strength as the decision core."),
            ],
            [
                Q("Which pairing of tool and question is best?", [
                    "Stochastic to decide whether a strong stock is in a long-term uptrend",
                    "MACD histogram to see whether trend momentum is accelerating or fading",
                    "RSI to compute position size",
                    "OBV to find the exact top",
                ], 1, "The histogram measures the change in gap between MACD and its signal line, which describes acceleration. The other pairings use the wrong tool for the question."),
                Q("A trader waits until RSI, MACD and the stochastic all agree before buying. What is the risk?", [
                    "None; more indicators always mean better odds",
                    "They are correlated views of the same price data, so agreement adds little new information and can create false confidence",
                    "Indicators cannot agree",
                    "It guarantees late entries only",
                ], 1, "Momentum indicators are derived from the same prices. Agreement among them is largely redundant, and selecting for agreement can be confirmation bias."),
            ]),
    ],
};

/* ════════════════════════════════════════════════════════════════════════
   TRACK 6 — Relative Strength
   ════════════════════════════════════════════════════════════════════════ */
const TA_RELATIVE_STRENGTH = {
    id: "ta-relative-strength",
    title: "Relative Strength",
    blurb: "Leaders outperform the market before they are obvious. Learn the RS line, RS rating, the Mansfield version and a leadership checklist.",
    lessons: [
        L("ta-relative-strength-vs-rsi", "Relative strength versus RSI", 8,
            "Relative strength compares one stock with something else. It is the single most useful filter for finding leaders.",
            [
                p("**Relative strength (RS)** compares the performance of a stock with a benchmark such as the NIFTY 50, or with its sector or peers. It asks: **is this stock doing better or worse than the market?**"),
                co("warn", "RS is not RSI", "RSI is an oscillator built from a single stock’s own price changes. Relative strength is a comparison between two price series. A stock can have a low RSI and strong relative strength (it is falling less than the market), or a high RSI and weak relative strength (it is rising less than the market)."),
                h("Relative performance"),
                p("Suppose over six months the NIFTY 50 is up 8%. ABC Industries is up 24% and PQR Engineering is up 3%. ABC outperformed the market by a wide margin and PQR underperformed, even though both rose. A stock that rises less than the market in a rally is lagging and usually attracts less institutional buying."),
                h("The relative strength line"),
                fm("RS line", "RS line = Stock price ÷ Benchmark price", "Plot this ratio over time. A rising line means the stock is outperforming the benchmark. A falling line means it is underperforming. Direction matters more than the level."),
                ul(
                    "**Stock versus NIFTY:** shows market leadership.",
                    "**Stock versus its sector index:** shows whether it is a leader within its group.",
                    "**RS line making new highs before price:** an early sign of leadership. Many leaders show this before they break out."
                ),
                // FUTURE VISUAL: stock price and RS line in the same panel, RS line making new highs first
                h("Why leaders outperform before they become obvious"),
                p("Institutions build positions over weeks. Their buying lifts a stock relative to the index even before the price breaks a visible level, and that shows up in the RS line. By the time headlines and screens highlight the stock, it may already be well ahead. Watching the RS line lets you see the lead earlier."),
                co("india", "TradeEdge", "TradeEdge’s chart previews show Mansfield relative strength, and its screens use RS Rating and RS-based columns. The next lessons explain what those represent."),
                takeaway("Relative strength compares a stock with a benchmark. A rising RS line shows outperformance, and leaders often show strong RS before their breakout. It is different from RSI."),
            ],
            [
                Q("The NIFTY 50 is up 8% over six months. ABC is up 24% and PQR is up 3%. Which statement is correct?", [
                    "Both have strong relative strength because both rose",
                    "ABC has strong relative strength; PQR has weak relative strength despite rising",
                    "PQR is the leader",
                    "Relative strength cannot be negative if price rose",
                ], 1, "Relative strength is about performance versus the benchmark. PQR rose but underperformed the market."),
                Q("How is a basic RS line calculated?", [
                    "RSI × volume",
                    "Stock price divided by benchmark price",
                    "Stock price minus its 200-day average",
                    "High minus low",
                ], 1, "The ratio of a stock to its benchmark rises when the stock outperforms and falls when it lags."),
                Q("A stock’s price is still in a base but its RS line has just made a new high. What might this suggest?", [
                    "Nothing",
                    "Possible early leadership: the stock is outperforming even before a price breakout",
                    "A confirmed breakdown",
                    "Low volume",
                ], 1, "An RS line at new highs ahead of price often appears before breakouts in leaders. It is a positive clue, not a trigger."),
            ]),

        L("ta-relative-strength-rating", "Relative strength rating and ranking", 9,
            "An RS rating ranks a stock against all others over multiple horizons. It condenses leadership into a number you can screen on.",
            [
                p("The RS line shows one stock against one benchmark. An **RS rating** ranks one stock against **all other stocks**. A rating of 90 means the stock’s weighted performance ranks in the top 10%, and one of 40 means it is below the median."),
                h("How ratings are typically built"),
                ol(
                    "Compute returns over several horizons: for example **3-month, 6-month and 12-month**.",
                    "Combine them into a composite score, often giving the most recent period more weight (for example heavier weight on the last 3 months).",
                    "Convert the composite score into a **percentile rank** across the universe, from 1 (weakest) to 99 (strongest)."
                ),
                tb("Horizon roles", ["Horizon", "What it captures", "Risk if used alone"], [
                    ["3-month", "Recent momentum and emerging leaders", "Can be noisy and chase short spikes"],
                    ["6-month", "Intermediate trend", "Slower to detect new leaders"],
                    ["12-month", "Established leadership", "Late: may include a move that has already ended"],
                    ["Composite", "A balance of all of them", "Weights are a design choice, so ratings differ across providers"],
                ]),
                p("A **percentile ranking** is relative. If the whole market falls, a stock that falls less can still rank high. That is consistent with the idea of leadership: strong stocks resist declines and lead the rebound."),
                h("Why leadership matters"),
                p("Studies of past big winners consistently find that they ranked high in relative strength before their major advances. A stock with a rating of 85 or above is already outperforming most of the market, which suggests institutions favour it. This does not guarantee future results, but it shifts the odds. Starting with strong stocks and waiting for a good entry beats starting with weak stocks and hoping they turn."),
                co("tip", "TradeEdge application", "Many TradeEdge screens use an RS Rating threshold, such as 70 or 80 and above, and RS improving screens look for stocks whose RS is rising versus one or two weeks earlier. Higher thresholds produce shorter lists of stronger names."),
                co("warn", "Common mistake", "Treating a high rating as a buy signal. It is a **filter** for candidates. Entry, stop, volume and market conditions still decide the trade. Also remember a rating that is very high can mean the stock is already extended."),
                takeaway("An RS rating ranks a stock against the whole universe using weighted returns over several horizons. It is a leadership filter, not an entry signal."),
            ],
            [
                Q("What does an RS rating of 90 usually mean?", [
                    "The stock has risen 90%",
                    "The stock’s weighted performance ranks in roughly the top 10% of the universe",
                    "RSI is 90",
                    "The stock is cheap",
                ], 1, "RS ratings are percentile ranks. 90 means better than about 90% of stocks on the rating’s performance measure."),
                Q("Why combine 3-, 6- and 12-month returns in a rating?", [
                    "To balance recent momentum with established leadership and reduce the weakness of any single horizon",
                    "To make the number larger",
                    "Because exchanges require it",
                    "To predict prices exactly",
                ], 0, "Each horizon has a bias: short is noisy, long is late. A composite balances them."),
                Q("What is the right role of an RS rating in a trading process?", [
                    "A buy trigger",
                    "A filter that narrows the list to leaders, with entry, stop and market conditions still needed",
                    "A replacement for stop losses",
                    "A measure of intrinsic value",
                ], 1, "A rating tells you which stocks lead. It does not tell you when to buy, where you are wrong, or how much to risk."),
            ]),

        L("ta-relative-strength-mansfield", "Mansfield relative strength", 9,
            "Stan Weinstein’s version of the RS line puts a zero line on the chart, so outperformance and underperformance are visible at a glance.",
            [
                p("**Mansfield relative strength** is a refinement of the RS line popularised by Stan Weinstein. The plain RS ratio has no natural reference, and you only see whether it is rising or falling. Mansfield RS normalises the ratio around a **zero line**, so you can immediately tell whether a stock has been outperforming or underperforming over the past year."),
                fm("Mansfield RS (classic form)", "RS ratio         = Stock close ÷ Benchmark close\nMansfield RS     = ( RS ratio ÷ 52-week average of RS ratio − 1 ) × 10", "Above zero: the stock’s RS is above its own 52-week average. Below zero: below it. Implementations differ in scaling and smoothing, so check how your platform defines it."),
                h("Interpretation"),
                tb("Reading Mansfield RS", ["Observation", "Meaning", "Use"], [
                    ["Rising and above zero", "Persistent outperformance", "Favour for long setups"],
                    ["Crossing from below to above zero", "RS has turned positive; leadership emerging", "A positive sign when price is in a Stage 1 to 2 transition"],
                    ["Above zero but falling", "Still ahead, but fading", "Watch for weakening momentum"],
                    ["Below zero", "Lagging the benchmark", "Avoid for long setups unless a clear turn develops"],
                ]),
                h("Weekly interpretation"),
                p("Weinstein applied it on **weekly** charts, aligned with the 30-week average. A stock breaking out of a long base into Stage 2 with Mansfield RS crossing above zero is a stronger case than one breaking out with RS still deep below zero. The latter is a breakout without leadership and, in his experience, was more likely to fail."),
                // FUTURE VISUAL: weekly chart with Mansfield RS panel showing the zero-line cross at a breakout
                co("india", "TradeEdge application", "TradeEdge computes Mansfield RS weekly in its database and shows it in chart preview popovers across dashboards. Use it as a quick leadership check when reviewing a screen result: is RS above zero and rising, or below zero and weak?"),
                co("warn", "Common mistake", "Relying on a zero-line cross as a trigger. The line crossing zero says relative performance improved over the past year’s average. It does not say price is at a good entry, nor that the stock will keep outperforming."),
                takeaway("Mansfield RS plots the RS ratio relative to its 52-week average around a zero line, making outperformance versus underperformance visible. Above zero and rising supports leadership; below zero is a caution."),
            ],
            [
                Q("What does Mansfield RS above zero tell you?", [
                    "The stock price is above its 200-day average",
                    "The stock’s relative strength ratio is above its own 52-week average, so it has been outperforming the benchmark",
                    "RSI is above 70",
                    "Volume is high",
                ], 1, "Mansfield RS normalises the RS ratio against its 52-week average. Above zero means current relative performance is stronger than the past year’s typical level."),
                Q("Why does Weinstein prefer Stage 2 breakouts with positive Mansfield RS?", [
                    "Because positive RS shows the breakout has leadership behind it, which in his experience reduces failures",
                    "Because RS predicts volume",
                    "Because zero is magical",
                    "Because it eliminates risk",
                ], 0, "Breakouts in stocks that already lead the market tend to attract more sustained buying. It improves odds but does not remove risk."),
            ]),

        L("ta-relative-strength-leaders", "Finding market leaders", 9,
            "A practical checklist that combines price, relative strength, sector and structure to separate leaders from laggards.",
            [
                p("Cheap stocks are not the best place to look for big winners. Historically, stocks that rose the most started their advance already **showing strength**. Finding leaders means stacking several pieces of evidence."),
                fm("Leadership checklist", "Price near 52-week high\n+ Strong relative strength (RS line rising, high RS rating)\n+ Strong sector\n+ Positive trend (rising averages, price above them)\n+ Constructive base\n+ Volume confirmation", "No single item is enough. Leaders usually satisfy most of these at the same time."),
                h("Why each item matters"),
                tb("Leadership evidence", ["Item", "What it shows", "Failure signal"], [
                    ["Near 52-week high", "No heavy overhead supply from trapped holders", "Far below the high, with a long road back to breakeven for holders"],
                    ["Strong RS", "Institutions prefer it to the market", "RS line falling or making new lows"],
                    ["Strong sector", "Group demand supports individual stocks", "Sector in a downtrend"],
                    ["Positive trend", "Price and averages aligned", "Price under falling averages"],
                    ["Constructive base", "Orderly digestion of the prior advance", "Wide, loose, erratic price action"],
                    ["Volume confirmation", "Accumulation on up days, dry-up on pullbacks", "Heavy selling on down days"],
                ]),
                h("Leaders versus cheap stocks"),
                p("A stock down 45% from its high may look attractive, but it carries a lot of supply: everyone who bought higher wants out near breakeven. A stock at a new high has no such overhead. Buying strength means paying a higher price per share but facing less resistance, and the odds of continuation have historically favoured the strong."),
                co("tip", "TradeEdge application", "Combine screens: a Stage 2 or Trend Template screen for the trend, an RS Rating threshold for leadership, and a check on sector strength in Sector Rotation. Then open the chart and judge the base and volume yourself."),
                co("warn", "Common mistake", "Choosing the highest RS rating without looking at the chart. A stock that has gone up 300% in three months may have a top-tier rating and also be dangerously extended. Leadership and a good entry point are different questions."),
                co("key", "Key idea", "A leader is a stock that other stocks are measured against. You are not trying to buy the cheapest stock in a good sector; you are trying to buy the strongest while its risk is still low."),
                takeaway("Leaders show strong relative strength, trend alignment, sector support, constructive bases and volume confirmation, near 52-week highs. Use RS as a filter, then judge the chart for a low-risk entry."),
            ],
            [
                Q("Why is a stock near its 52-week high often a better candidate than one 45% below its high?", [
                    "Because it has less overhead supply from holders waiting to sell at breakeven, and it shows strength",
                    "Because it is cheaper",
                    "Because 52-week highs are guaranteed to rise",
                    "Because volume is lower",
                ], 0, "Holders who bought higher create supply as price approaches their cost. Near highs, that overhead is largely absent."),
                Q("A stock has an RS rating of 98 after rising 300% in three months and is 60% above its 50-day average. What is the sensible conclusion?", [
                    "It is a perfect entry because the rating is the highest",
                    "It is a clear leader but may be extended, so the entry risk is a separate question",
                    "RS ratings do not matter",
                    "It will certainly collapse",
                ], 1, "Leadership and entry quality are different. Even the strongest leader can offer poor risk/reward when far above its support."),
                Q("Which is the best approach to build a leadership shortlist?", [
                    "Sort by lowest P/E",
                    "Combine trend, RS rating, sector strength and base quality, then review charts",
                    "Pick the highest-priced stocks",
                    "Pick whatever is in the news",
                ], 1, "Leadership is multi-factor. A stack of evidence is more reliable than any single filter."),
            ]),
    ],
};

/* ════════════════════════════════════════════════════════════════════════
   TRACK 7 — Weinstein Stage Analysis
   ════════════════════════════════════════════════════════════════════════ */
const TA_WEINSTEIN = {
    id: "ta-weinstein",
    title: "Weinstein Stage Analysis",
    blurb: "Every stock cycles through basing, advancing, topping and declining. Learn to identify the stage and to trade only where the odds are best.",
    lessons: [
        L("ta-weinstein-overview", "Stan Weinstein’s four stages", 11,
            "A stock’s life cycle has four stages. The 30-week average, volume and relative strength decide which one you are in.",
            [
                p("Stan Weinstein’s core idea is that **every stock is always in one of four stages**, and the single best decision is to avoid owning stocks in the wrong stages. He used weekly charts and the **30-week moving average** (roughly the 150-day) as the main reference."),
                tb("The four stages", ["Stage", "Name", "Price vs 30-week MA", "30-week MA slope", "Meaning"], [
                    ["1", "Basing", "Oscillates around it", "Flattening after a decline", "Buyers and sellers balanced after a decline"],
                    ["2", "Advancing", "Above it", "Rising", "Demand dominates; the trend is up"],
                    ["3", "Topping", "Crosses above and below it", "Flat or turning down", "Distribution; supply is rising"],
                    ["4", "Declining", "Below it", "Falling", "Supply dominates; the trend is down"],
                ]),
                // FUTURE VISUAL: the four stages drawn on one weekly chart with the 30-week average
                h("What defines each stage"),
                ul(
                    "**The 30-week MA:** its slope and the position of price are the first test.",
                    "**Volume:** rises on advances in Stage 2 and on declines in Stage 4. Dries up during basing.",
                    "**Relative strength:** typically turns positive as Stage 1 ends and stays strong in Stage 2.",
                    "**Breakout or breakdown:** a move out of the base above resistance on volume starts Stage 2. A break below support starts Stage 4."
                ),
                h("The transition between stages"),
                p("Stage transitions are gradual. Stage 1 to 2 is confirmed by a breakout above the base’s resistance and the 30-week average, on strong volume, with the average flattening or turning up. Stage 2 to 3 shows as the average flattening, price chopping across it, and heavy volume with little progress. Stage 3 to 4 is a break below support and the average. Stage 4 to 1 is a long, quiet base after the decline."),
                co("key", "The main idea", "You do not need to buy at the bottom or sell at the top. You need to **own stocks in Stage 2 and avoid Stages 3 and 4**. Participating in the middle of the advance is enough."),
                co("india", "TradeEdge application", "The Watchlist dashboard shows a Weinstein stage for each stock, and the Stage 2 Early screen under Market Leaders looks for stocks transitioning into Stage 2. Use the stage as a first filter, then confirm on the chart."),
                co("warn", "Common mistake", "Treating stage as a precise label. Stages are an analytical framework, and stocks can sit on the boundary between two for weeks. When ambiguous, assume the less favourable stage."),
                takeaway("There are four stages: basing, advancing, topping and declining. The 30-week average slope, price location, volume and relative strength classify them. The goal is to participate in Stage 2 and avoid Stages 3 and 4."),
            ],
            [
                Q("Which description fits Stage 2?", [
                    "Price below a falling 30-week MA with heavy volume on declines",
                    "Price above a rising 30-week MA, with strong relative strength and volume expanding on advances",
                    "Price oscillating around a flat 30-week MA with low volume",
                    "Price crossing a turning-down MA after a long run",
                ], 1, "Stage 2 is the advancing phase: price above a rising 30-week average with demand visible in volume and relative strength."),
                Q("What is the practical goal of the stage framework?", [
                    "To buy every bottom",
                    "To own stocks in Stage 2 and avoid Stages 3 and 4, rather than predicting tops and bottoms",
                    "To sell every Stage 2 stock",
                    "To ignore volume",
                ], 1, "The framework improves odds by avoiding stocks in unfavourable stages. It does not require perfect timing of turning points."),
                Q("A stock sits right on the boundary between Stage 3 and Stage 4, with the 30-week MA falling. What is a sensible assumption?", [
                    "Assume the more favourable stage",
                    "When ambiguous, assume the less favourable stage until the chart proves otherwise",
                    "Stages never overlap",
                    "Ignore the 30-week MA",
                ], 1, "Capital preservation matters. A falling average with weak price action should be treated as Stage 4 risk until evidence improves."),
            ]),

        L("ta-weinstein-stage1", "Stage 1: the basing stage", 8,
            "After a decline, a stock goes quiet. Learn the signs of accumulation, and why Stage 1 is a time to watch rather than buy.",
            [
                p("Stage 1 follows a Stage 4 decline. Selling has exhausted itself, but buyers have not yet taken control. The stock moves sideways for months, sometimes years, in a base."),
                h("Characteristics"),
                ul(
                    "**Long consolidation:** often at least a few months, sometimes much longer. The longer the base, the greater the potential energy for the next move.",
                    "**Declining volatility:** the swings tighten compared with the earlier decline.",
                    "**Flattening 30-week MA:** the average stops falling and gradually levels off.",
                    "**Volume dry-up:** trading activity falls, and spikes tend to occur on up days.",
                    "**Failed breakouts:** brief pokes above resistance that reverse are common. They shake out weak hands.",
                    "**Accumulation:** large buyers gradually absorb supply at low prices."
                ),
                tb("Late Stage 1 evidence", ["Evidence", "Why it is encouraging"], [
                    ["Price holds above a prior low several times", "Sellers can no longer push lower"],
                    ["Higher lows within the base", "Buyers become more aggressive"],
                    ["Mansfield RS moves toward and across zero", "The stock begins to outperform"],
                    ["Volume spikes on up days", "Demand increases on strength"],
                ]),
                h("Why not buy in Stage 1?"),
                p("Because capital in a base is idle. A stock can trade sideways for a year, and then fall back into Stage 4. You gain only when it breaks out, and by then the breakout offers a higher-confidence entry with defined risk. Buying early means paying with time and uncertainty for a slightly lower price."),
                co("tip", "Practical use", "Keep a watchlist of late Stage 1 stocks with improving RS and tightening ranges. They are the pool from which Stage 2 breakouts emerge."),
                co("warn", "Common mistake", "Calling every decline’s first bounce a Stage 1 base. A real base takes time, and the 30-week average must flatten. A short pause under a falling average is still Stage 4."),
                takeaway("Stage 1 is a long, quiet base after a decline, with flattening averages and drying volume. Watch it and wait for a breakout rather than paying to be early."),
            ],
            [
                Q("Which sign most supports the end of a Stage 1 base?", [
                    "A falling 30-week MA with heavy selling",
                    "Higher lows, tightening volatility, improving RS and volume spikes on up days",
                    "A single bounce lasting two weeks",
                    "The stock’s name changing",
                ], 1, "A maturing base shows buyers becoming more aggressive, supply drying up and relative performance improving."),
                Q("Why does Weinstein suggest not buying during Stage 1?", [
                    "Because stocks in Stage 1 always fall",
                    "Because the capital may be idle for a long time and the stock can slip back to Stage 4, whereas a confirmed breakout provides better evidence and risk definition",
                    "Because volume is impossible to read",
                    "Because Stage 1 stocks cannot be traded",
                ], 1, "The cost of early entry is time and uncertainty. A breakout from the base gives a clearer entry, stop and confirmation."),
            ]),

        L("ta-weinstein-stage2", "Stage 2: the advancing stage", 10,
            "Stage 2 is where most of the gains are made. Learn what a healthy advance looks like and why participating beats predicting.",
            [
                p("Stage 2 begins when price breaks above the resistance of a Stage 1 base, on strong volume, and moves above a rising 30-week average. It is the phase when institutions have been buying, supply has been absorbed, and the stock trends up."),
                h("Characteristics"),
                ul(
                    "Price **above a rising 30-week MA**, with the average sloping up.",
                    "**Higher highs and higher lows.** Pullbacks are shallower than advances.",
                    "**Strong relative strength:** Mansfield RS above zero and often rising.",
                    "**Breakouts from successive bases** as the stock moves up in steps.",
                    "**Volume expansion on advances** and contraction on pullbacks.",
                    "**Pullbacks that hold the rising averages,** often the 10-week or the 30-week."
                ),
                h("Breakouts, pullbacks and add-on opportunities"),
                tb("Opportunities within Stage 2", ["Opportunity", "What it looks like", "Notes"], [
                    ["Initial breakout from a Stage 1 base", "A move above resistance on heavy volume", "Lowest-risk entry in the stage"],
                    ["Pullback after the breakout", "A dip toward the breakout level on light volume", "A second chance with a tight stop"],
                    ["Continuation breakout", "A new breakout from a smaller base higher up", "Needs RS and trend intact; extended entries carry more risk"],
                    ["Pullback to a rising average", "A test of the 10-week or 30-week average", "Works best in leaders with healthy volume patterns"],
                ]),
                h("Participate rather than predict"),
                p("Weinstein’s main point is that you do not need to buy the exact low. The early part of Stage 2 provides a lot of the move. Aiming to buy the bottom exposes you to long waits and false starts. Waiting for Stage 2 means you buy at a higher price per share, but with confirmation, momentum and a clear risk level."),
                // FUTURE VISUAL: Stage 2 chart with breakout, pullback and continuation entries
                co("india", "TradeEdge application", "The Stage 2 Early screen under Market Leaders targets stocks just entering Stage 2 (price above rising shorter averages and RS improving), and the Trend Template screens select established Stage 2 trends."),
                co("warn", "Common mistake", "Treating Stage 2 as a promise. Many Stage 2 stocks fail at the first breakout, especially in a weak market. A stop is still essential."),
                takeaway("Stage 2 is the advancing phase: price above a rising 30-week MA, strong RS and volume on advances. Participate on confirmation, add on constructive pullbacks, and keep stops."),
            ],
            [
                Q("Which is the best summary of how to approach Stage 2?", [
                    "Predict the bottom and buy before the base ends",
                    "Participate after confirmation, using the breakout and healthy pullbacks, rather than predicting the low",
                    "Wait until the stock has doubled",
                    "Avoid all stocks above their averages",
                ], 1, "Stage 2 offers many entries with confirmation and defined risk. Predicting lows costs time and exposes you to false starts."),
                Q("Which behaviour suggests a healthy Stage 2 advance?", [
                    "Heavy volume on declines and light volume on advances",
                    "Higher highs and higher lows, volume expanding on advances and contracting on pullbacks, pullbacks holding rising averages",
                    "Price crossing a falling MA repeatedly",
                    "RS falling steadily",
                ], 1, "The Stage 2 footprint is trend, volume and relative strength all pointing the same way."),
            ]),

        L("ta-weinstein-stage34", "Stage 3 and Stage 4", 9,
            "Stage 3 is the top, Stage 4 the decline. Learn the warning signs and why holding a declining stock is a cost, not a strategy.",
            [
                p("Every advance ends. The goal is to notice **before** a large part of the gain is lost, and to avoid owning stocks that are falling."),
                h("Stage 3: distribution"),
                ul(
                    "**The 30-week MA flattens** and may begin to turn down.",
                    "**Price chops back and forth across the average** rather than staying above it.",
                    "**Failed rallies:** advances stall below the prior high.",
                    "**Churning volume:** heavy trading with little price progress, as large holders sell into strength.",
                    "**Relative strength weakens**, often before price.",
                    "**Lower highs** form, and then support breaks."
                ),
                h("Stage 4: decline"),
                ul(
                    "Price **below a falling 30-week MA.** Rallies fail at or below the average.",
                    "**Lower highs and lower lows.**",
                    "**Heavy volume on declines,** though breakdowns can also happen on moderate volume.",
                    "**Negative Mansfield RS.**",
                    "**Bounces that look attractive** because the stock is “cheap”, but supply from trapped holders caps them."
                ),
                tb("Stage 3 versus Stage 4", ["Feature", "Stage 3", "Stage 4"], [
                    ["30-week MA", "Flat or beginning to roll over", "Falling"],
                    ["Price", "Chopping around the average", "Below the average"],
                    ["Structure", "Failed highs, support still holding", "Lower highs, lower lows"],
                    ["Volume", "Churning at the top", "Heavy on declines"],
                    ["Response", "Reduce, tighten stops, avoid new buys", "Avoid longs; exit remaining holdings by plan"],
                ]),
                h("The risk of holding declining stocks"),
                p("A stock that falls 50% needs a 100% gain to recover. Holding while it falls ties up capital that could earn elsewhere, and recovery can take years if at all. Hoping a Stage 4 stock will return to Stage 2 turns a controlled loss into an open-ended one."),
                co("warn", "Cheap is not a reason", "A stock down 60% can easily fall another 50%. Weinstein’s rule is simple: do not buy Stage 4 stocks, regardless of price or the story."),
                co("tip", "Practical use", "When a holding enters Stage 3, review the stop, reduce size or stop adding. Do not wait for Stage 4 confirmation to act on risk."),
                takeaway("Stage 3 shows distribution: flat average, chopping price, churning volume. Stage 4 is a decline below a falling average. Avoid buying Stage 4 and treat Stage 3 as a signal to reduce risk."),
            ],
            [
                Q("Which sign is most associated with Stage 3 rather than Stage 2?", [
                    "A rising 30-week MA with price well above it",
                    "A flattening 30-week MA, price chopping across it, and heavy volume with little price progress",
                    "Volume dry-up in a base",
                    "A first breakout from a long base",
                ], 1, "The loss of progress with heavy volume and a flattening average indicates supply meeting demand at the top."),
                Q("A stock fell 50%. How much must it gain to return to its previous high?", [
                    "50%",
                    "75%",
                    "100%",
                    "150%",
                ], 2, "If a ₹200 stock falls to ₹100, it needs to double (+100%) to return to ₹200. Losses are asymmetric."),
                Q("A Stage 4 stock is down 60% and looks cheap. What does stage analysis say?", [
                    "Buy more as it is cheap",
                    "Avoid it: the trend is down and supply overhead is heavy; wait for a long base and a Stage 2 breakout",
                    "Short it with no stop",
                    "Hold forever",
                ], 1, "Price alone does not indicate value. The trend and structure still point down, and the odds are better elsewhere."),
            ]),

        L("ta-weinstein-classification", "Classifying a stock’s stage in practice", 9,
            "Turn the stage framework into a checklist you can apply to any weekly chart, and learn where it can mislead.",
            [
                p("Stage classification is a judgement framework. A simple scorecard keeps it consistent and reduces bias."),
                fm("Stage 2 scorecard", "☐ Price > 30-week MA\n☐ 30-week MA rising\n☐ Relative strength positive (Mansfield above zero or rising RS line)\n☐ Higher highs and higher lows\n☐ Breakout or constructive consolidation near highs\n☐ Volume confirms (expansion on advances, contraction on pullbacks)", "Score one point for each. Six of six is a clear Stage 2. Four or five is probable but needs review. Below four, look at the other stages."),
                tb("Reading the score", ["Items met", "Likely interpretation", "Suggested action"], [
                    ["6 of 6", "Clean Stage 2", "Eligible for setups; judge entry and risk"],
                    ["4 to 5", "Early or late Stage 2, or messy", "Check which items fail and why"],
                    ["2 to 3", "Stage 1 or 3, transitional", "Watchlist only"],
                    ["0 to 1", "Stage 4 or unclear", "Avoid for long setups"],
                ]),
                h("Worked example"),
                p("ABC Industries (fictional) trades at ₹540. Its 30-week MA is ₹480 and rising for the past 10 weeks. It broke out of a 6-month base at ₹520 two weeks ago on 2.2 times average volume. Mansfield RS crossed above zero three weeks earlier. The last pullback made a higher low at ₹505."),
                ul(
                    "Price > 30-week MA (₹540 > ₹480): yes.",
                    "MA rising: yes.",
                    "RS positive: yes.",
                    "HH/HL: yes (₹505 is above the earlier low).",
                    "Breakout near highs: yes.",
                    "Volume confirms: yes (2.2x on the breakout)."
                ),
                p("Score 6 of 6: a clean early Stage 2. That does **not** say to buy at ₹540. It says the stock qualifies for setups. Whether ₹540 is a good entry depends on distance from the pivot (₹520, so 3.8% above), the stop, and the market."),
                co("warn", "Where the framework can mislead", "Sharp V-shaped recoveries, low-liquidity small caps, stocks with recent corporate actions, and markets in transition can all distort the weekly picture. A stock can also meet the checklist and still fail at a breakout. The framework improves odds, it does not remove risk."),
                co("tip", "TradeEdge application", "Use the Watchlist stage label as a first pass, then check the checklist on the weekly chart yourself, in particular RS and volume."),
                takeaway("A scorecard of price vs the 30-week MA, its slope, RS, structure, base and volume makes stage classification repeatable. Treat it as a framework, not a precise truth."),
            ],
            [
                Q("ABC trades at ₹540 above a rising ₹480 30-week MA, broke out on 2.2x volume, has positive Mansfield RS and a higher low. What does a 6/6 score tell you?", [
                    "Buy immediately at any price",
                    "It qualifies as a clean early Stage 2; entry, stop and market still need judging",
                    "The stock cannot fall",
                    "The stock is in Stage 4",
                ], 1, "The score classifies the stock’s stage. It does not define entry timing, stop placement or position size."),
                Q("Why use a scorecard rather than a gut feeling for stage classification?", [
                    "It makes the process consistent and reduces bias from stories and emotion",
                    "It guarantees returns",
                    "It replaces the chart",
                    "It ignores volume",
                ], 0, "A repeatable checklist forces the same questions on every stock, which helps avoid favouring familiar names."),
                Q("A stock meets 3 of 6 Stage 2 items. What is the best handling?", [
                    "Treat as a clean Stage 2",
                    "Keep it on a watchlist and see which items fail and whether they are improving",
                    "Short it",
                    "Ignore RS",
                ], 1, "A mixed score points to a transitional stock. Monitoring it costs nothing, and acting early costs risk."),
            ]),
    ],
};

/* ════════════════════════════════════════════════════════════════════════
   TRACK 8 — Chart Patterns
   ════════════════════════════════════════════════════════════════════════ */
const TA_CHART_PATTERNS = {
    id: "ta-chart-patterns",
    title: "Chart Patterns",
    blurb: "Why bases form, and how to recognise cup and handle, flat base, high tight flag, VCP, double bottom, flags and failed patterns.",
    lessons: [
        L("ta-chart-patterns-why-bases", "Why bases form", 8,
            "A base is a pause where the market digests a prior advance. The pattern names matter less than the supply and demand underneath.",
            [
                p("After a stock advances, some holders take profits and new buyers hesitate. Price pauses and moves sideways or pulls back. This pause is a **base** or consolidation. A good base lets the market absorb supply, so that the next advance is not blocked by sellers."),
                h("What happens inside a base"),
                ul(
                    "**Profit-taking:** early buyers sell, creating the initial pullback.",
                    "**Supply absorption:** holders who want out are met by patient buyers at lower prices.",
                    "**Shakeouts:** sudden dips flush out weak holders and stop-loss orders.",
                    "**Institutional accumulation:** large buyers quietly build positions during quiet periods.",
                    "**Volatility contraction:** swings become smaller as sellers run out.",
                    "**Demand/supply balance:** eventually, supply dries up, and a small amount of demand moves the price."
                ),
                tb("Healthy versus unhealthy bases", ["Feature", "Healthy", "Unhealthy"], [
                    ["Depth", "Moderate for the stock and market", "Excessive; far larger than the market’s decline"],
                    ["Price action", "Orderly, tightening", "Wide, loose, erratic"],
                    ["Volume", "Declining toward the right side", "Heavy selling on down days"],
                    ["Closes", "Near the middle to upper part of ranges", "Frequently near lows"],
                    ["Relative strength", "Holds up", "Deteriorates"],
                ]),
                // FUTURE VISUAL: comparison of a tight constructive base and a loose, erratic one
                h("Pattern names are descriptions"),
                p("Cup with handle, flat base and others are names for common shapes of this process. Real charts rarely look like textbook drawings. Learn the underlying logic, and you can judge imperfect examples sensibly: **is supply drying up, and is demand stepping in on strength?**"),
                co("warn", "Common mistake", "Forcing a pattern name onto a chart. If you have to squint to see the pattern and explain away the flaws, there is no pattern."),
                takeaway("Bases are periods where supply is absorbed and volatility contracts. The healthiest bases are orderly, tightening and supported by relative strength. Names describe shapes, the supply and demand logic decides quality."),
            ],
            [
                Q("What is the main purpose of a base in the context of supply and demand?", [
                    "To let price drift without any activity",
                    "To absorb supply from profit-taking and weak holders so the next advance meets less resistance",
                    "To create a gap",
                    "To increase volume permanently",
                ], 1, "A base is a digestion period. When supply dries up, demand can push price higher more easily."),
                Q("Which feature is most consistent with an unhealthy base?", [
                    "Tightening swings and contracting volume",
                    "Wide, erratic swings with heavy volume on down days and weak closes",
                    "Holding relative strength",
                    "A shakeout followed by recovery",
                ], 1, "Heavy selling with erratic price action suggests distribution rather than orderly digestion."),
            ]),

        L("ta-chart-patterns-cup-handle", "Cup and handle", 10,
            "A rounded recovery followed by a small pullback. One of the most studied bases in growth-stock trading.",
            [
                p("The **cup and handle**, popularised by William O’Neil (and earlier described by William Jiler as a saucer with a platform), looks like a teacup from the side: a rounded decline and recovery (the cup) followed by a small pullback (the handle)."),
                h("Structure"),
                tb("Typical cup-and-handle characteristics", ["Part", "Typical characteristics (guidelines, not rules)"], [
                    ["Prior advance", "A meaningful uptrend before the base, often 30% or more"],
                    ["Cup", "Rounded, U-shaped; a decline of roughly 12% to 35% in normal markets, deeper in bear markets; several weeks to many months"],
                    ["Right side", "Recovers most of the way back toward the left-side high"],
                    ["Handle", "A short, shallow pullback, often 1 to 4 weeks and usually in the upper half of the base, with volume dry-up"],
                    ["Pivot", "The high of the handle (a small buffer above it is common)"],
                    ["Breakout", "A move above the pivot on volume well above average"],
                ]),
                // FUTURE VISUAL: annotated cup and handle with pivot and volume
                h("Why it works"),
                p("The decline shakes out weak holders. The rounded recovery shows that buyers are returning gradually. The handle gives one last shakeout and lets remaining sellers exit. When supply is thin, a push through the handle’s high meets little resistance."),
                h("Volume"),
                ul(
                    "Volume tends to be heavier on the left side of the cup and quieter near the bottom.",
                    "Volume dries up in the handle, especially in the last few days.",
                    "Breakout volume is commonly at least 40% to 50% above average, and often much more."
                ),
                h("Failure conditions"),
                ul(
                    "**V-shaped cup** with no time to base; a sharp drop and a sharp spike back.",
                    "**Too deep a cup** relative to the market.",
                    "**Handle too deep or too long,** or in the lower half of the base.",
                    "**A handle that drifts upward with volume rising** instead of a quiet dip.",
                    "**Breakout on weak volume** or a close back inside the handle.",
                    "**Poor relative strength.**"
                ),
                co("tip", "Practical use", "Define the pivot on the chart before the breakout. Place an alert slightly above it. That removes the temptation to chase and lets you assess volume at the actual moment."),
                co("warn", "Common mistake", "Calling any U shape a cup and handle. Check the prior uptrend, the depth, the symmetry and the handle’s location. A cup in a stock in Stage 4 is just a bounce."),
                takeaway("A cup and handle is a rounded recovery with a shallow, quiet handle. Buy a decisive move above the handle high on strong volume, and treat failures like a close back inside the handle as a reason to exit."),
            ],
            [
                Q("What does the handle do in a cup and handle?", [
                    "It raises the stock’s price",
                    "It provides a final, shallow pullback with low volume that shakes out remaining sellers before the breakout",
                    "It signals a bear market",
                    "It marks the bottom of the cup",
                ], 1, "The handle is a small, quiet pullback that clears the last supply. Thin supply then allows a breakout."),
                Q("Which feature makes a cup and handle lower quality?", [
                    "A rounded cup",
                    "A handle that is deep, in the lower half of the base, and forms with rising volume",
                    "A handle high used as the pivot",
                    "Breakout volume above average",
                ], 1, "A deep or lower-half handle on rising volume suggests supply remains, not that it has been absorbed."),
                Q("Where is the pivot usually placed?", [
                    "At the bottom of the cup",
                    "At the high of the handle, with a small buffer above",
                    "At the left-side peak of the previous year",
                    "At the 200-day average",
                ], 1, "The pivot is the level a stock must move above to resolve the base, typically the handle’s high."),
            ]),

        L("ta-chart-patterns-flat-base", "Flat base", 7,
            "A tight, shallow sideways pause after an advance. Often forms as a second-stage base in strong stocks.",
            [
                p("A **flat base** is a shallow, sideways consolidation that forms after a stock has already advanced. It signals that holders are not selling much, even though price is not rising."),
                tb("Typical flat base characteristics", ["Feature", "Guideline"], [
                    ["Prior move", "An uptrend and often a breakout from an earlier base"],
                    ["Depth", "Shallow, usually 10% to 15% or less from high to low"],
                    ["Duration", "At least about five weeks, often five to seven or longer"],
                    ["Price action", "Tight range; closes near the middle to upper half"],
                    ["Volume", "Declines, with dry-up on the right side"],
                    ["Pivot", "The high of the base"],
                    ["Breakout", "Above the pivot on above-average volume"],
                ]),
                p("Flat bases are strong because price refuses to fall. If a stock holds within 10% of its high for several weeks while the market wobbles, buyers are defending it. That resilience is itself a signal of demand."),
                co("tip", "Practical use", "Flat bases often appear after a first breakout, making them good tests of leadership. If a stock stays tight while the market corrects, mark it for the next breakout attempt."),
                co("warn", "Failure signs", "Wide ranges, heavy volume on down days, closes near lows, or a base that is much deeper than 15%. A flat base that breaks below its low should be treated as a failed pattern."),
                // FUTURE VISUAL: flat base after a breakout with pivot
                takeaway("A flat base is a tight, shallow, multi-week pause near highs. Orderly price action and dry-up in volume suggest holders are not selling, and a breakout above the high with volume is the trigger."),
            ],
            [
                Q("What is a typical depth for a flat base?", [
                    "About 10% to 15% or less",
                    "About 40% to 50%",
                    "Exactly 25%",
                    "There is no depth guideline",
                ], 0, "Flat bases are shallow by nature. If the pause becomes much deeper, it is a different pattern or an unhealthy one."),
                Q("Why can a flat base signal strength?", [
                    "Because the stock refuses to fall even without rising, suggesting holders are not selling and buyers are defending",
                    "Because price is falling quickly",
                    "Because volume is high on down days",
                    "Because it is far below the high",
                ], 0, "Holding tight near highs shows demand absorbing the little supply that appears."),
            ]),

        L("ta-chart-patterns-high-tight-flag", "High tight flag", 8,
            "A rare, fast pattern: a huge advance followed by a very tight pause. High reward and high risk.",
            [
                p("The **high tight flag** (also called the power play) is among the strongest continuation patterns, and one of the rarest. A stock advances sharply and then pauses in a very tight range."),
                tb("Typical characteristics", ["Part", "Guideline"], [
                    ["Pole", "A very fast advance, often 100% or more in about 4 to 8 weeks"],
                    ["Flag", "A tight consolidation, usually 3 to 5 weeks, with a pullback of no more than about 10% to 25%"],
                    ["Volume", "Huge volume on the advance; quiet on the flag"],
                    ["Trigger", "A move above the flag’s high on renewed volume"],
                ]),
                h("Why it is rare"),
                p("Doubling in two months is unusual. It usually requires a catalyst such as a major earnings surprise, a new product, an approval or a sector rotation. Most stocks that surge that fast fall back, and the few that hold their gains in a tight range show exceptional demand."),
                h("Risks"),
                ul(
                    "**Extension:** after a 100% move, volatility is high and stops are wide in rupee terms.",
                    "**News dependence:** the catalyst may fade, and the stock may drop on any disappointment.",
                    "**Liquidity:** small caps can gap through stops.",
                    "**Position size must be smaller** because the stop distance is larger."
                ),
                // FUTURE VISUAL: high tight flag with pole, flag and breakout
                co("warn", "Common mistake", "Chasing any stock that has doubled. The pattern requires a tight flag. A wide, sloppy pullback after a spike is a failed run, not a flag."),
                co("tip", "Practical use", "Because the risk per share is larger, reduce size so the rupee risk stays the same as for normal setups. Size is the control, not the stop width."),
                takeaway("The high tight flag is a rare, fast pattern with a large pole and a tight flag. It can be powerful, but extended prices and news risk require smaller size and strict stops."),
            ],
            [
                Q("What distinguishes a high tight flag from any stock that has doubled?", [
                    "Nothing",
                    "The advance must be followed by a very tight, shallow consolidation with quiet volume",
                    "A high P/E",
                    "A falling price",
                ], 1, "The flag’s tightness shows that holders are not selling after a huge advance, which is the sign of strength."),
                Q("Why should position size be reduced for a high tight flag?", [
                    "The stop distance in rupees is larger because the stock is extended and volatile, so the same risk requires fewer shares",
                    "Because the pattern never works",
                    "Because volume is high",
                    "Because it is in Stage 4",
                ], 0, "Risk per trade is shares times stop distance. A larger stop distance means fewer shares for the same risk."),
            ]),

        L("ta-chart-patterns-vcp", "VCP: the volatility contraction pattern", 12,
            "Wide swings, then smaller, then tighter, as supply dries up. Mark Minervini’s signature setup and one of the best frameworks for timing breakouts.",
            [
                p("The **Volatility Contraction Pattern (VCP)**, taught by Mark Minervini, is a base in which each pullback is smaller than the one before. It is a visual record of selling pressure drying up."),
                fm("The VCP idea", "Wide swings → smaller swings → tighter swings → supply dries up → breakout", "Each contraction is often about half the size of the previous one. Volume falls as the swings tighten."),
                h("Contractions"),
                p("A VCP is described by its contractions (often written as T). For example: the stock pulls back 25% (T1), rallies, pulls back 12% (T2), rallies, pulls back 6% (T3), then tightens to a 3% pause (T4). Most VCPs have two to four contractions; sometimes five or six."),
                tb("Example VCP for a fictional stock", ["Contraction", "High to low", "Depth", "Volume"], [
                    ["T1", "₹400 → ₹300", "25%", "Heavy"],
                    ["T2", "₹380 → ₹334", "12%", "Lower"],
                    ["T3", "₹375 → ₹352", "6%", "Lower still"],
                    ["T4", "₹372 → ₹361", "3%", "Very low; dry-up"],
                ]),
                // FUTURE VISUAL: VCP with numbered contractions and the volume panel
                h("Why it works"),
                p("Each pullback occurs because some holders sell. The shrinking size shows fewer sellers each time. Eventually the last pullback is tiny and quiet: almost nobody wants to sell. At that moment even modest demand can lift the price, which is the **line of least resistance**."),
                h("Key ingredients"),
                ul(
                    "**A prior uptrend** in Stage 2, with the Trend Template conditions met.",
                    "**Contractions of decreasing depth,** roughly half each time.",
                    "**Volume dry-up** on the final contraction, ideally with a day or two of very low volume.",
                    "**Relative strength** strong; RS line near highs.",
                    "**A pivot** at the high of the last contraction.",
                    "**Breakout volume** clearly above average."
                ),
                h("Failure signals"),
                ul(
                    "Contractions grow instead of shrink.",
                    "Heavy volume on down days in the final contraction.",
                    "Breakout on weak volume.",
                    "A close back below the pivot with heavy volume.",
                    "A market in a correction."
                ),
                co("key", "VCP is a concept, not one shape", "VCPs appear inside cup-and-handles, flat bases and other bases. What matters is the progression from loose to tight with volume drying up."),
                co("india", "TradeEdge application", "The Leadership Tight Base screen under Pullback finds Stage 2 leaders with RS above a high threshold, a tight 20-day range and volume contraction, which captures the quantitative side of a VCP. It does not draw contractions for you. Open the chart and count them yourself."),
                co("warn", "Common mistake", "Counting any wobbly sequence as a VCP. The contractions must show a clear tightening, and the stock must already be in a strong trend."),
                takeaway("A VCP is a base where pullbacks shrink and volume dries up, showing sellers are running out. The pivot at the last contraction’s high with a volume surge is the trigger, and failure signs are growing contractions or heavy selling."),
            ],
            [
                Q("In a VCP, what does a sequence of 25%, 12%, 6% pullbacks suggest?", [
                    "Selling pressure is increasing",
                    "Each wave of selling is smaller, suggesting supply is being absorbed and fewer sellers remain",
                    "A bear market",
                    "Volume is irrelevant",
                ], 1, "Shrinking pullbacks mean fewer holders are willing to sell at each stage. That is the logic of the pattern."),
                Q("Which condition would weaken a VCP setup?", [
                    "Volume dry-up in the last contraction",
                    "Contractions that grow larger over time, with heavy volume on down days",
                    "Relative strength near highs",
                    "A pivot at the last high",
                ], 1, "Growing contractions and heavy selling mean supply is not drying up."),
                Q("Why is the TradeEdge Leadership Tight Base screen only a partial VCP detector?", [
                    "It captures quantitative traits such as RS, tight range and volume contraction, but not the visual count and quality of contractions",
                    "It detects VCP perfectly",
                    "It ignores volume",
                    "It only looks at Stage 4 stocks",
                ], 0, "Screens apply numeric filters. Judging the shape and progression of contractions still needs your eyes."),
            ]),

        L("ta-chart-patterns-double-bottom", "Double bottom", 8,
            "A W-shaped base where the second low tests the first. Often found after a correction in a recovering leader.",
            [
                p("A **double bottom** looks like the letter W. Price falls to a first low, rallies, falls again to or slightly below the first low, and then recovers above the middle peak."),
                tb("Structure", ["Part", "Description"], [
                    ["First low", "The initial decline into support"],
                    ["Middle peak", "The rally between the two lows; this is the pivot"],
                    ["Second low", "A retest of the first low, often undercutting it slightly, which shakes out weak holders"],
                    ["Recovery", "A move above the middle peak on strong volume"],
                ]),
                h("Volume and confirmation"),
                ul(
                    "Volume is often lower on the second low than on the first, showing weaker selling.",
                    "A breakout above the middle peak on volume well above average confirms.",
                    "A modest undercut of the first low followed by a quick recovery (a shakeout) is often a positive sign.",
                    "The pivot should sit below the overall high of the base. A W that makes new highs in the middle is a different formation."
                ),
                // FUTURE VISUAL: double bottom with undercut and pivot at the middle peak
                h("When it is more reliable"),
                p("Double bottoms are more common than cups and appear in many conditions, so quality varies. They work better when the stock was a leader before the correction, the base is not too wide and loose, and the market is rising again."),
                co("warn", "Failure signs", "A W with wide, loose swings; three lows instead of two; heavy volume on down days; or a recovery stalling below the middle peak. A close below the second low invalidates the pattern."),
                co("tip", "Practical use", "A pivot at the middle peak gives a clear, objective trigger. The second low provides the natural stop reference."),
                takeaway("A double bottom is a W where the second low tests the first, often with a shakeout. The middle peak is the pivot, and volume on the breakout confirms. Avoid loose, sloppy Ws."),
            ],
            [
                Q("Where is the pivot of a double bottom?", [
                    "At the first low",
                    "At the middle peak between the two lows",
                    "At the second low",
                    "At the 52-week low",
                ], 1, "The market must clear the supply at the middle peak to complete the W."),
                Q("Why might a slight undercut of the first low be a positive sign?", [
                    "It triggers stop orders and shakes out weak holders, so a quick recovery shows strong demand",
                    "It always means a breakdown",
                    "It increases volume permanently",
                    "It indicates a split",
                ], 0, "A brief flush below support followed by a rapid recovery means sellers were exhausted."),
            ]),

        L("ta-chart-patterns-flags", "Flags, pennants and tight consolidations", 8,
            "Continuation patterns that pause a strong move. Tightness and low volume are the evidence.",
            [
                p("Flags and pennants are short pauses within a strong trend. They form after a sharp move (the pole), and the trend usually resumes if the pause is orderly."),
                tb("Continuation patterns", ["Pattern", "Shape", "Volume", "Resolution"], [
                    ["Bull flag", "Small, parallel channel sloping slightly down after a sharp rise", "Dries up during the flag", "Break above the flag’s upper line on volume"],
                    ["Bear flag", "Small channel sloping slightly up after a sharp fall", "Light on the bounce", "Break below the lower line, continuing the decline"],
                    ["Pennant", "Small symmetrical triangle after a sharp move", "Dries up as lines converge", "Break in the direction of the prior move"],
                    ["Tight range", "A few days or weeks of narrow, sideways price", "Low", "Break of the range on higher volume"],
                ]),
                h("What makes a good continuation"),
                ul(
                    "A **strong prior move** with volume.",
                    "A **shallow, orderly pause,** much smaller than the pole.",
                    "**Volume dry-up** during the pause.",
                    "**Duration** short relative to the pole; long flags lose the momentum logic.",
                    "**Breakout with volume** in the direction of the trend."
                ),
                // FUTURE VISUAL: bull flag and pennant on a daily chart
                co("warn", "Common mistake", "Treating a deep, loose pullback as a flag. If the pause retraces more than a third to a half of the pole, or volume stays high, it is probably a reversal in progress."),
                co("tip", "Practical use", "A tight range under a recent high and above a rising 10-day or 20-day average is a common entry zone for momentum stocks. The stop goes below the range."),
                takeaway("Flags, pennants and tight ranges are brief pauses in a strong trend. Shallow depth, short duration and dry-up in volume support continuation, and the breakout of the pause is the trigger."),
            ],
            [
                Q("Which feature is most consistent with a good bull flag?", [
                    "A deep retracement of most of the pole on heavy volume",
                    "A shallow, orderly pullback after a sharp rise, with volume drying up",
                    "A long pause lasting several months",
                    "Rising volume on the down move",
                ], 1, "A flag is a brief, shallow pause. Heavy volume or deep retracement suggest the move is failing."),
                Q("A pause retraces 60% of the pole on heavy volume. How should this be viewed?", [
                    "As a textbook flag",
                    "As likely a reversal or failed move rather than a continuation pattern",
                    "As a guaranteed breakout",
                    "As an inside bar",
                ], 1, "Flags are shallow. Deep retracements on heavy volume point to real selling."),
            ]),

        L("ta-chart-patterns-failed", "Failed patterns", 9,
            "Patterns fail. Learn the common failure types, and how a failure can become information or even a new setup.",
            [
                p("Every pattern in this track fails some of the time. Experienced traders treat failure as part of the process: they define it in advance, exit quickly, and learn from it."),
                tb("Types of failure", ["Type", "What happens", "What it tells you"], [
                    ["Failed breakout", "Price breaks above the pivot, then closes back below it", "Demand was not enough to absorb supply"],
                    ["Failed base", "The base breaks down below its low instead of breaking out", "Sellers won the resolution"],
                    ["Bull trap", "A breakout that attracts buyers, then reverses sharply", "Late buyers are trapped; supply overhead increases"],
                    ["Shakeout", "A brief break below support or the handle low that quickly recovers", "Weak holders flushed out; may strengthen the setup"],
                    ["Undercut and rally", "Price dips below a prior low and then rallies back above it", "A failed breakdown; sellers could not hold the level"],
                ]),
                h("Telling a shakeout from a real breakdown"),
                ul(
                    "**Speed of recovery:** shakeouts recover within days. Real breakdowns keep falling.",
                    "**Volume:** a shakeout often has a volume spike followed by dry-up. Real breakdowns show sustained heavy selling.",
                    "**Close:** a close back above the level within a day or two supports a shakeout.",
                    "**Market context:** a weak market makes real breakdowns likelier."
                ),
                h("Failure as information"),
                p("A stock that fails a breakout is telling you something about demand. If you exit at the stop, you lose a small amount and keep your capital. If the stock later forms a tighter base and breaks out again, you can re-enter. Many strong stocks need two attempts. The failure that shakes you out may build the base for the successful move."),
                co("key", "Define failure before you enter", "For each setup, write what failure looks like: for example “close back below the pivot on above-average volume” or “break of the handle low”. Then act on it. Hope is not a rule."),
                co("warn", "Common mistake", "Moving the stop lower because the pattern “should work”. The pattern is not entitled to work. A failed pattern is a signal to exit."),
                co("tip", "Practical use", "Keep a record of failed setups with screenshots. After a few dozen, you will see which failure types are most common for your style and markets."),
                takeaway("Patterns fail, and failure is defined in advance and respected. A failure can become information, or even a new setup if the stock rebuilds a tighter base."),
            ],
            [
                Q("A stock breaks above a pivot, then closes back below it on heavy volume two days later. What is this called, and what is the correct response?", [
                    "A bull trap or failed breakout; exit according to the stop plan",
                    "A shakeout; buy more",
                    "A golden cross; hold",
                    "A flat base; ignore",
                ], 0, "The move failed to hold above the pivot and heavy volume shows real selling. The planned exit limits the loss."),
                Q("What most reliably separates a shakeout from a breakdown?", [
                    "The colour of the candle",
                    "How quickly price recovers and whether selling continues, together with volume and market context",
                    "The ticker",
                    "The time of day",
                ], 1, "Shakeouts reverse quickly with volume exhaustion, while breakdowns continue lower with sustained selling."),
                Q("Why is a small loss on a failed breakout often better than holding?", [
                    "It preserves capital for the next setup, and the stock may offer a better entry after rebuilding",
                    "Because failed breakouts always recover",
                    "Because losses are tax-free",
                    "Because it removes the need for rules",
                ], 0, "Capital preservation is the point of the stop. Holding hope turns small losses into large ones."),
            ]),
    ],
};

/* ════════════════════════════════════════════════════════════════════════
   TRACK 9 — Breakouts and Entries
   ════════════════════════════════════════════════════════════════════════ */
const TA_BREAKOUTS = {
    id: "ta-breakouts",
    title: "Breakouts and Entries",
    blurb: "What a breakout is, how to define the pivot, what volume to expect, where to enter, and what to do when it fails.",
    lessons: [
        L("ta-breakouts-what-is", "What is a breakout?", 8,
            "A breakout is the resolution of a period of supply and demand balance. The best ones follow a clear sequence.",
            [
                p("A **breakout** occurs when price moves decisively above a resistance level (or below support), ending a period of consolidation. It is a statement that demand has overwhelmed the supply that previously capped the price."),
                fm("The sequence", "Resistance\n→ accumulation (supply absorbed)\n→ tightening (volatility contracts)\n→ demand expansion (volume rises)\n→ breakout", "Breakouts that follow this sequence tend to be higher quality than random pokes through a level."),
                h("Why breakouts can work"),
                ul(
                    "**No overhead supply:** at a new high, no holder is waiting to sell at breakeven.",
                    "**Momentum attraction:** screens, alerts and traders all notice a new high, bringing new buyers.",
                    "**Short covering and stop buying:** traders positioned the other way buy to exit.",
                    "**Institutional accumulation:** funds may keep buying over days as the stock proves itself."
                ),
                h("Why many breakouts fail"),
                ul(
                    "The market is weak, so the breakout lacks follow-through.",
                    "The base was loose or too short, so supply remains.",
                    "Volume was thin, so little supply was absorbed.",
                    "The stock was already extended, with late buyers entering."
                ),
                tb("Breakout quality checklist", ["Question", "Higher probability", "Lower probability"], [
                    ["Prior trend", "Stage 2 uptrend", "Downtrend or range"],
                    ["Base", "Tight, orderly, adequate length", "Loose, erratic, short"],
                    ["Relative strength", "Strong, near highs", "Weak or falling"],
                    ["Volume", "Surge versus average", "Average or below"],
                    ["Market", "Healthy uptrend", "Correction or heavy distribution"],
                ]),
                // FUTURE VISUAL: breakout from a tight base with volume surge
                co("warn", "Common mistake", "Treating every move above a line as a breakout. A genuine breakout is a resolution after supply has been absorbed. A poke through a level in a messy chart is noise."),
                co("india", "TradeEdge application", "The Breakouts category under TechLens includes Volume Breakout, 52-Week High, Pivot Breakout, Fresh Breakout and Weekly Breakout Soon, which each filter for different stages of this process."),
                takeaway("A breakout is the resolution of accumulation and tightening by demand expansion. Quality depends on trend, base, relative strength, volume and market. Weak breakouts fail often."),
            ],
            [
                Q("Which sequence best describes a high-quality breakout?", [
                    "Heavy selling, then a random spike",
                    "Resistance, accumulation, tightening, demand expansion, breakout",
                    "A gap down, then a bounce",
                    "A sideways drift with no volume",
                ], 1, "Quality breakouts follow supply absorption and contraction before demand expands."),
                Q("Why can a breakout in a market under heavy distribution be riskier?", [
                    "Because individual stocks cannot move independently",
                    "Because follow-through buying is less likely, and breakouts fail more often in weak markets",
                    "Because volume is always low",
                    "Because it makes stops unnecessary",
                ], 1, "Market conditions affect the odds. In a weak market, most breakouts struggle to hold."),
            ]),

        L("ta-breakouts-pivot", "Identifying the pivot", 8,
            "The pivot is the line you act on. Define it, plan the buy zone, and understand chase risk.",
            [
                p("The **pivot point** is the price level that, once exceeded, completes the base and triggers a buy. For a flat base it is the base high. For a cup and handle it is the handle high. For a VCP it is the high of the last contraction. For a double bottom it is the middle peak."),
                h("Pivot, buy zone and extension"),
                tb("Zones around the pivot", ["Zone", "Typical definition", "Implication"], [
                    ["Pivot", "The resistance high (plus a small buffer)", "Trigger level"],
                    ["Buy zone", "From the pivot to roughly 3% to 5% above it", "Entry still close enough that the stop stays reasonable"],
                    ["Extended", "More than about 5% above the pivot", "Risk per share rises; better to wait for a pullback or new base"],
                ]),
                fm("Distance from pivot", "Extension % = (Current price − Pivot) ÷ Pivot × 100", "Example: pivot ₹200, price ₹208. Extension = 8 ÷ 200 = 4%, inside a typical buy zone. At ₹220 the extension is 10%."),
                h("Chase risk"),
                p("The further above the pivot you buy, the further your stop is from your entry (if the stop stays below the base), and so the larger the loss if it fails. At ₹208, a stop below the base at ₹190 risks ₹18 per share. At ₹220 it risks ₹30, which is 67% more risk for the same idea. Chasing destroys risk/reward before the trade begins."),
                co("tip", "Practical use", "Before the open, write the pivot, the upper limit of the buy zone, and the stop. Set an alert at the pivot. If the stock opens beyond the buy zone, skip it."),
                co("warn", "Common mistake", "Buying a stock that gapped 8% above the pivot because “it is a breakout”. The gap changed the risk. Wait for a pullback or a new base."),
                co("india", "NSE specifics", "Check circuit limits. A stock that locks in an upper circuit on breakout day can be impossible to buy, and a stock that gaps up on the next session may open well beyond the buy zone."),
                takeaway("The pivot is the trigger level. Plan a buy zone of a few percent above it, avoid chasing extended prices, and write the numbers down in advance."),
            ],
            [
                Q("Pivot is ₹200 and the price is ₹208. What is the extension?", [
                    "2%",
                    "4%",
                    "8%",
                    "10%",
                ], 1, "(208 − 200) ÷ 200 = 4%, inside a typical 3% to 5% buy zone."),
                Q("Why does buying far above the pivot hurt the trade?", [
                    "The stop is further from entry if kept below the base, so risk per share rises",
                    "Volume decreases",
                    "The pivot disappears",
                    "Charts do not allow it",
                ], 0, "A wider stop distance means either a bigger loss or fewer shares, and the reward potential is not larger."),
                Q("A stock opens 8% above its pivot after a gap. What is a disciplined response?", [
                    "Buy at the open regardless",
                    "Skip or wait for a pullback or a new base, because the entry is extended",
                    "Short it",
                    "Double the position size",
                ], 1, "Extended entries have worse risk/reward. A disciplined trader sticks to the pre-defined buy zone."),
            ]),

        L("ta-breakouts-volume", "Breakout volume in practice", 8,
            "How much volume is enough, how to check it intraday, and how institutional participation shows up.",
            [
                p("Breakout volume is evidence that the move has real participation. This lesson applies the earlier volume concepts to the actual decision."),
                h("What to measure"),
                ul(
                    "**Relative volume** on the breakout day versus the 50-day average.",
                    "**Volume versus recent high-volume days:** is it the highest in months?",
                    "**Close location:** did buyers hold the move into the close?",
                    "**Follow-through volume** in the following days."
                ),
                tb("Example breakout day for XYZ Technologies (fictional)", ["Item", "Value", "Reading"], [
                    ["Pivot", "₹300", "Breakout level"],
                    ["Breakout day close", "₹309", "3% above the pivot, inside the buy zone"],
                    ["Day’s range", "₹298 to ₹310", "Close near the high"],
                    ["50-day average volume", "4,00,000", "Baseline"],
                    ["Breakout day volume", "10,00,000", "2.5x average"],
                    ["Next three sessions", "Hold above ₹300 on lighter volume", "Follow-through intact"],
                ]),
                h("Institutional participation"),
                p("Funds buy over many days. Footprints include a high-volume breakout day, then multiple up days with above-average volume, strong closes, and pullbacks that find buyers quickly. A single spike followed by fading volume and weak closes suggests retail excitement without sustained institutional buying."),
                h("Intraday check"),
                p("If you act intraday, compare the volume so far with the stock’s typical volume at that time. Many platforms provide this. If you cannot, consider acting near the close, when the day’s volume and close location are clearer, at the cost of a slightly higher entry."),
                co("tip", "Practical use", "Record the relative volume of each breakout you take and its outcome. Your own results will show how much volume matters in your universe."),
                co("warn", "Common mistake", "Relying on volume alone. A 4x volume day that closes at its low after a long advance can be a blow-off, not a breakout. Combine volume with location, base and market."),
                takeaway("Check relative volume, comparison with recent history, close location and follow-through. Volume supports the thesis, but is never the whole thesis."),
            ],
            [
                Q("XYZ breaks out at ₹309 on 10,00,000 shares versus a 4,00,000 average, closing near the high, then holds above ₹300 for three days. How would you describe it?", [
                    "Weak, because volume is only 2.5 times average",
                    "A supportive breakout with strong volume, a strong close and follow-through",
                    "A confirmed failure",
                    "Irrelevant",
                ], 1, "2.5x volume with a high close and follow-through are all supportive evidence."),
                Q("Which pattern suggests retail excitement rather than sustained institutional buying?", [
                    "A single volume spike followed by fading volume and weak closes",
                    "Several up days with above-average volume and strong closes",
                    "Pullbacks that are quickly bought",
                    "A volume dry-up in the base",
                ], 0, "Institutions build positions over days. A one-day spike that fades often lacks that persistence."),
            ]),

        L("ta-breakouts-entry", "Proper breakout entry and stop placement", 10,
            "Entry near the pivot, a stop that invalidates the idea, and a risk/reward worth taking.",
            [
                p("A good entry is not just a price. It is a combination of entry, stop and size that gives acceptable risk compared with reward."),
                h("Entry"),
                ul(
                    "Buy as price moves above the pivot, within the buy zone (for example up to 3% to 5% above).",
                    "Prefer entries where volume is on pace to be above average.",
                    "Avoid buying on a gap far above the zone.",
                    "Some traders scale in: for example half at the pivot and the rest on follow-through."
                ),
                h("Stop placement"),
                p("The stop should be where the **breakout thesis is invalid**. For a breakout, that is typically below the pivot, below the handle low, or below the last contraction’s low, not simply a fixed percentage. A fixed maximum (for example 7% to 8%) acts as a cap, but if the logical stop is further away, the setup needs a smaller size or should be skipped."),
                tb("Example setups", ["Item", "Tight setup", "Loose setup"], [
                    ["Pivot", "₹200", "₹200"],
                    ["Entry", "₹203", "₹212"],
                    ["Logical stop", "₹190 (below last contraction low)", "₹190"],
                    ["Risk per share", "₹13 (6.4%)", "₹22 (10.4%)"],
                    ["Target scenario", "₹245 (+₹42)", "₹245 (+₹33)"],
                    ["Reward ÷ Risk", "3.2R", "1.5R"],
                ]),
                p("Same stock, same stop level, but entering at ₹212 instead of ₹203 cuts reward/risk from 3.2R to 1.5R. Entry discipline is risk management."),
                co("key", "Risk/reward is decided at entry", "A trade with poor reward/risk at entry is hard to rescue later. Skipping marginal setups is a legitimate decision."),
                co("tip", "Practical use", "Reward is a scenario, not a prediction. Use the prior base depth, a measured move or the next resistance zone to define a reasonable target, and judge whether risk is worth it."),
                co("warn", "Common mistake", "Placing the stop at a round percentage without checking structure. A stop inside the base’s normal volatility will be hit by noise, and one too far makes the trade too expensive."),
                takeaway("Enter in the buy zone, place the stop where the thesis fails, and check reward/risk before acting. Extended entries shrink reward/risk fast."),
            ],
            [
                Q("Pivot ₹200, stop ₹190, target scenario ₹245. What is reward/risk if you enter at ₹203?", [
                    "About 1.5R",
                    "About 2R",
                    "About 3.2R",
                    "About 5R",
                ], 2, "Risk = 203 − 190 = 13. Reward = 245 − 203 = 42. 42 ÷ 13 ≈ 3.2R."),
                Q("What should determine the stop for a breakout trade?", [
                    "A random 3%",
                    "The level where the breakout thesis is invalid, such as below the last contraction low or the pivot, checked against maximum acceptable risk",
                    "The price you paid",
                    "Whatever the broker suggests",
                ], 1, "A structural stop reflects when the idea is wrong. Percentages alone ignore structure."),
                Q("The logical stop is 14% below the extended entry. What is the disciplined choice?", [
                    "Use a 3% stop anyway",
                    "Skip the trade or cut the size so rupee risk stays within plan",
                    "Ignore the stop",
                    "Double the size",
                ], 1, "If structure demands a distant stop, either size down or wait for a better entry."),
            ]),

        L("ta-breakouts-failure", "When breakouts fail", 8,
            "Small losses are the price of admission. Learn the signs, act quickly and decide whether re-entry makes sense.",
            [
                p("Even high-quality breakouts fail. What separates good traders from others is not avoiding failures but handling them."),
                h("Signs of failure"),
                ul(
                    "**Close back below the pivot,** especially on above-average volume.",
                    "**Reversal on the breakout day,** closing near the low after a high-volume surge.",
                    "**Heavy-volume down days** soon after the breakout.",
                    "**Loss of the short-term averages** (for example the 10-day or 20-day) soon after breakout.",
                    "**Market turns down,** pulling most breakouts with it."
                ),
                h("Squat versus failure"),
                p("A stock may break out and then hover or dip slightly. That could be a normal retest. The difference: a retest holds above the pivot on light volume and recovers; a failure closes meaningfully below the pivot, usually with volume. Give the stock room that matches your stop, but do not widen the stop to avoid a loss."),
                h("The stop is the plan"),
                p("If price hits your stop, you exit. Do not wait for a bounce. Do not average down. The loss is already defined, which is the whole point of defining risk before entry."),
                h("Re-entry"),
                p("If a stock stops you out but its trend, relative strength and structure remain strong, it can set up again. A second attempt is reasonable if the stock forms a new pivot or reclaims the failed level with volume. The key is that re-entry is a **new trade with a new plan**, not an attempt to recover the loss."),
                tb("After a failed breakout", ["Condition", "Likely next step"], [
                    ["Trend and RS intact, stock rebuilds a tight area above the pivot", "Watch for a new pivot and a re-entry"],
                    ["Closes below the base low on heavy volume", "Move on; the base failed"],
                    ["Market turns into a correction", "Stand aside; most breakouts will struggle"],
                ]),
                co("warn", "Common mistake", "Revenge trading: re-entering immediately to win back the loss. Wait for a valid new setup."),
                co("key", "A small loss is a business expense", "A loss limited to 1R is part of the process. A loss that grows to 3R because you hoped is a rule violation."),
                takeaway("Failed breakouts show as closes back below the pivot, heavy selling, or a turning market. Exit at the stop, and re-enter only if a new valid setup forms."),
            ],
            [
                Q("Which is the clearest sign of a failed breakout?", [
                    "A close back below the pivot on above-average volume",
                    "A one-day pullback on light volume that holds the pivot",
                    "Rising relative strength",
                    "A tight handle",
                ], 0, "Closing below the pivot with volume shows supply overwhelmed the breakout."),
                Q("After being stopped out of a strong stock, which approach to re-entry is sound?", [
                    "Buy immediately at a higher price to win the loss back",
                    "Wait for a new valid setup with its own pivot, stop and size",
                    "Never trade that stock again",
                    "Increase size to recover faster",
                ], 1, "Re-entry should be a new, rule-based trade. Revenge trades abandon the plan."),
            ]),
    ],
};

/* ════════════════════════════════════════════════════════════════════════
   TRACK 10 — Pullbacks and Continuation Entries
   ════════════════════════════════════════════════════════════════════════ */
const TA_PULLBACKS = {
    id: "ta-pullbacks",
    title: "Pullbacks and Continuation Entries",
    blurb: "Buy constructive weakness in strong stocks: what a healthy pullback looks like, where it ends, and how to tell it from a trend break.",
    lessons: [
        L("ta-pullbacks-healthy", "What makes a healthy pullback?", 8,
            "Strong stocks rest. A healthy pullback is orderly, quiet and supported.",
            [
                p("Trends do not move in straight lines. In a strong uptrend, prices advance, pause, and advance again. The pauses are **pullbacks**, and they are where many traders find lower-risk entries."),
                h("Features of a healthy pullback"),
                ul(
                    "**Price contraction:** the pullback is shallow compared with the preceding advance (for example less than a third to a half of the last leg).",
                    "**Lower volume:** selling is light compared with the advance.",
                    "**Support:** the decline stalls near a rising moving average (10-week, 50-day), a prior breakout level or a trendline.",
                    "**Relative strength holds:** the RS line stays near highs rather than diving.",
                    "**No heavy distribution:** no large down days on huge volume.",
                    "**Higher low** forms, preserving the uptrend structure."
                ),
                tb("Healthy versus warning pullback", ["Feature", "Healthy", "Warning"], [
                    ["Depth", "Shallow relative to the advance", "Gives back most of the advance"],
                    ["Volume", "Contracting", "Expanding on down days"],
                    ["Support", "Holds rising average or breakout level", "Slices through support"],
                    ["RS line", "Stays near highs", "Drops sharply"],
                    ["Structure", "Higher low forms", "Lower low forms"],
                ]),
                // FUTURE VISUAL: Stage 2 stock with a quiet pullback to the 50-day average
                p("Example: PQR Engineering rises from ₹300 to ₹400 in six weeks. It then pulls back to ₹372 (−7%) over seven sessions on volume 40% below average, stopping at the rising 50-day average. That is shallow, quiet and supported. If instead it fell to ₹330 in three sessions on 2x volume, it would be a warning."),
                co("tip", "Practical use", "Measure the pullback as a percentage of the prior advance, not only of price. A 10% pullback after a 15% advance is much deeper than a 10% pullback after a 60% advance."),
                co("warn", "Common mistake", "Buying a pullback in a stock that never had a strong advance to begin with. A pullback needs an uptrend to continue."),
                takeaway("A healthy pullback is shallow, quiet, supported at a rising average or prior breakout level, with relative strength holding and a higher low forming."),
            ],
            [
                Q("Which pullback is healthier?", [
                    "A 7% decline on 40% below-average volume that stops at the rising 50-day average",
                    "A 20% decline on 2x volume that slices through the 50-day average",
                    "A decline with the RS line collapsing",
                    "A decline that forms a lower low",
                ], 0, "Shallow depth, light volume and support at a rising average are the healthy markers."),
                Q("Why measure pullback depth relative to the prior advance?", [
                    "A 10% dip after a 15% run is a big giveback, but after a 60% run it is modest, so proportion matters",
                    "Because depth does not matter",
                    "Because percentages are illegal",
                    "Because it removes volume",
                ], 0, "Context sets what is normal. The same percentage means different things after different advances."),
            ]),

        L("ta-pullbacks-moving-average", "Pullbacks to the 10-week and 50-day averages", 9,
            "The two most-watched support zones for leaders. Learn the signal, the risk and the entry mechanics.",
            [
                p("In strong trends, leaders often pull back to a rising average and then resume. The 10-week average (about the 50-day) is the common intermediate level, with the 21-day EMA and 20-day SMA for faster stocks."),
                h("Trend context first"),
                p("A pullback entry only makes sense when the trend is clearly up: price above rising 50, 150 and 200-day averages, strong RS and sound structure. A pullback to the 50-day in a downtrend is a bounce attempt in a falling stock, not a continuation."),
                h("The setup"),
                ol(
                    "Identify a leader in Stage 2 or meeting the Trend Template.",
                    "Wait for the pullback to approach the 10-week or 50-day average on contracting volume.",
                    "Look for a **reversal signal** near the average: a strong close, a hammer, an inside bar break, or a day on increased volume closing in the upper half of the range.",
                    "Enter as price moves above the signal candle’s high, with a stop below the signal candle’s low or the average."
                ),
                tb("Example pullback entry for ABC Industries (fictional)", ["Item", "Value"], [
                    ["Prior advance", "₹400 → ₹520"],
                    ["Pullback low (touching rising 50-day)", "₹478"],
                    ["Signal day", "Closes ₹488 near its high on rising volume"],
                    ["Entry", "₹490 (above the signal day’s high)"],
                    ["Stop", "₹473 (below pullback low and average)"],
                    ["Risk per share", "₹17 (3.5%)"],
                    ["Target scenario", "Retest of ₹520 high, then higher: +₹30 ≈ 1.8R, more if it breaks out"],
                ]),
                p("Notice how a pullback entry gives a tighter stop than chasing a breakout, but the reward is smaller if it only returns to the prior high. Many traders use pullbacks as add-on entries to an existing winner."),
                // FUTURE VISUAL: pullback to a rising 50-day with the signal candle and stop
                co("tip", "Practical use", "Combine a pullback to the average with a nearby prior breakout level or trendline. Several supports in the same area make a stronger zone."),
                co("warn", "Common mistake", "Treating the average as a guarantee. Averages are zones. If price closes decisively below it on heavy volume and the average flattens, the thesis is wrong."),
                takeaway("Pullbacks to a rising 10-week or 50-day average in a confirmed uptrend can offer tight-risk entries. Wait for a reversal signal, place the stop below the low and the average, and respect failure."),
            ],
            [
                Q("Why is trend context essential before a pullback entry?", [
                    "A pullback to an average in a downtrend is just a bounce in a weak stock, not a continuation",
                    "Because averages do not matter",
                    "Because volume must be maximum",
                    "Because trend context is optional",
                ], 0, "A pullback entry assumes the larger trend is up. Without it, you are catching a falling stock."),
                Q("Entry ₹490, stop ₹473, prior high ₹520. What is reward/risk to the prior high?", [
                    "About 0.5R",
                    "About 1.8R",
                    "About 3R",
                    "About 6R",
                ], 1, "Risk = 17. Reward to ₹520 = 30. 30 ÷ 17 ≈ 1.8R."),
            ]),

        L("ta-pullbacks-constructive", "Buying constructive weakness", 8,
            "A healthy pullback and the start of a downtrend can look alike at first. Learn the differences before you buy.",
            [
                p("The hardest question in pullback trading is: **is this a pause or the beginning of something worse?** No rule is perfect, but several clues separate them."),
                tb("Healthy pullback versus beginning of a downtrend", ["Clue", "Healthy pullback", "Early downtrend"], [
                    ["Volume on down days", "Light and shrinking", "Heavy and expanding"],
                    ["Closes", "Mid to upper range", "Near lows"],
                    ["Support", "Holds near a rising average", "Breaks the average and fails to reclaim it"],
                    ["Relative strength", "Holds near highs", "Breaks down"],
                    ["Market", "Healthy or neutral", "In a correction"],
                    ["Structure", "Higher low", "Lower high then lower low"],
                    ["30-week MA", "Rising", "Flattening"],
                ]),
                h("Using multiple clues"),
                p("No single clue decides it. A stock can undercut its 50-day for a day (a shakeout) and still be healthy. Look for the weight of evidence: if most items lean healthy, a pullback entry is reasonable. If most lean weak, wait."),
                h("The role of the market"),
                p("Leading stocks pulling back while the market is healthy is common. When the market itself is breaking down, pullbacks in leaders can become deeper corrections. Check the market regime before buying weakness."),
                co("warn", "Common mistake", "Averaging into a falling stock because “it is a pullback in a leader”. If the stock closes below its stop, the pullback thesis has failed."),
                co("tip", "Practical use", "Pre-define the level at which a pullback becomes a failure: for example a weekly close below the 10-week average on heavy volume, or a break of the last higher low."),
                takeaway("Constructive weakness is quiet, shallow and supported, with RS and structure intact in a healthy market. When volume, structure, RS and the market all lean negative, the pullback is more likely a trend change."),
            ],
            [
                Q("Which clue most strongly favours a healthy pullback over an early downtrend?", [
                    "Heavy volume on down days",
                    "A higher low forming with light volume on declines and RS holding near highs",
                    "A falling 30-week average",
                    "RS breaking down",
                ], 1, "Quiet selling, preserved structure and holding RS are the signs of a pause."),
                Q("Why check the market regime before buying a pullback in a leader?", [
                    "In a market correction, even leaders can have deeper declines, so pullbacks are riskier",
                    "Leaders never fall",
                    "The market does not matter",
                    "Because markets cannot affect stocks",
                ], 0, "Stocks are influenced by the broader market. Pullbacks tend to be deeper and longer in weak markets."),
            ]),

        L("ta-pullbacks-reclaim", "Reclaim setups", 8,
            "When a stock breaks a level and quickly takes it back, the failed breakdown can be a useful signal.",
            [
                p("A **reclaim** happens when price closes below a significant level and then recovers above it. The break flushed out sellers, and the recovery shows buyers took control."),
                tb("Common reclaim types", ["Setup", "What happens", "What it suggests"], [
                    ["Reclaiming a moving average", "Closes below the 50-day (or 10-week), then closes back above on strong volume", "The break was a shakeout; the trend continues"],
                    ["Reclaiming a breakout level", "Falls back below the pivot, then closes above it again", "A failed failure; the original breakout may resume"],
                    ["Failed breakdown", "Breaks below a clear support or base low, then closes back inside", "Sellers could not hold control"],
                    ["Undercut and rally", "Briefly dips below a prior low and rallies strongly", "Stops triggered and absorbed by buyers"],
                ]),
                h("How to trade a reclaim"),
                ul(
                    "**Confirm the context:** the stock should be in an uptrend or a strong base. A reclaim in a Stage 4 stock is usually a bounce.",
                    "**Wait for the close** back above the level, with volume ideally above average.",
                    "**Enter above the reclaim candle’s high.**",
                    "**Stop below the undercut low,** the logical point where the thesis fails."
                ),
                // FUTURE VISUAL: undercut of the handle low followed by reclaim and breakout
                p("Example: PQR trades in a base with a low of ₹250. It dips to ₹244 intraday, then closes at ₹256 on 1.8x volume. The undercut cleared stop orders under ₹250, and the close back above shows demand. Entry is above the day’s high; the stop sits below ₹244. The risk is small relative to the base."),
                co("warn", "Common mistake", "Buying the undercut before it recovers. You cannot tell a shakeout from a breakdown until the close. Waiting costs a small price for much more information."),
                co("tip", "Practical use", "Reclaims work best when the market is also recovering. A reclaim during a market correction is weaker."),
                takeaway("A reclaim is a quick recovery of a lost level, showing sellers failed. Confirm with a close and volume, enter above the reclaim candle, and stop below the undercut low."),
            ],
            [
                Q("Why wait for the close before treating an undercut as a reclaim?", [
                    "Until the close you cannot tell whether it is a shakeout or a real breakdown",
                    "Because closes are always above the open",
                    "Because volume does not matter",
                    "Because undercuts do not exist",
                ], 0, "Intraday dips can recover or continue. The close shows where the balance settled."),
                Q("Where does the stop usually go in an undercut-and-reclaim trade?", [
                    "Above the high",
                    "Below the undercut low",
                    "At the 52-week high",
                    "No stop is needed",
                ], 1, "If price returns below the undercut low, the reclaim thesis has failed."),
            ]),
    ],
};

/* ════════════════════════════════════════════════════════════════════════
   TRACK 11 — Market Regime and Market Breadth
   ════════════════════════════════════════════════════════════════════════ */
const TA_MARKET_REGIME = {
    id: "ta-market-regime",
    title: "Market Regime and Market Breadth",
    blurb: "A good setup works better in a good market. Learn to read the index, breadth, distribution, follow-through and sector rotation.",
    lessons: [
        L("ta-market-regime-why", "Why the market regime matters", 8,
            "Most stocks move with the market. The same setup has different odds in different regimes.",
            [
                p("Individual stocks are influenced by the broader market. In strong markets, breakouts tend to follow through and pullbacks are brief. In weak markets, most breakouts fail and rallies fade. The **market regime** is the backdrop that shapes the odds for every setup."),
                tb("Regimes", ["Regime", "Typical features", "Approach"], [
                    ["Bull market (risk-on)", "Index above rising averages; many leaders; breakouts follow through", "Be more active; normal to larger size"],
                    ["Correction", "Index falls below key averages; distribution; leaders fall", "Reduce exposure; tighten stops; wait"],
                    ["Bear market (risk-off)", "Extended downtrend; most stocks in Stage 4", "Mostly cash; avoid longs"],
                    ["Sideways market", "Index range-bound; breakouts fail often; leaders mixed", "Be selective; smaller size; shorter holding"],
                ]),
                co("key", "The principle", "A good stock setup has a lower probability of working when the overall market regime is hostile. Strong stocks can survive weak markets, but most do not."),
                h("Practical use"),
                ul(
                    "Check the index before the stock: trend, averages, breadth.",
                    "Adjust size and the number of positions to the regime.",
                    "Pay attention to **leaders**: if new leaders are breaking out and holding, the market is healthy. If breakouts keep failing, the regime is poor even if the index looks fine.",
                    "Use the trading results themselves as feedback. A string of stop-outs may mean the regime has changed."
                ),
                co("warn", "Common mistake", "Fighting the regime: forcing breakout trades in a correction because the chart looks perfect. The odds have changed even if the pattern has not."),
                takeaway("The market regime sets the odds for every setup. Match exposure and selectivity to the regime, and use the behaviour of leaders as a real-time gauge."),
            ],
            [
                Q("Why does the market regime matter for an individual stock setup?", [
                    "Most stocks are influenced by the market, so setups have lower odds in hostile regimes",
                    "It does not; stocks are independent",
                    "It only matters for index funds",
                    "It changes the pattern shape",
                ], 0, "Correlation means follow-through is less likely when the market is falling."),
                Q("Breakouts keep failing even though the index looks fine. What might it mean?", [
                    "The regime may be deteriorating beneath the surface, so reduce risk",
                    "Nothing",
                    "Time to increase size",
                    "Stops are unnecessary",
                ], 0, "Leaders’ behaviour can warn before the index does."),
            ]),

        L("ta-market-regime-index", "Index trend analysis", 9,
            "Apply what you have learned about trend to NIFTY 50, Bank NIFTY and sector indices.",
            [
                p("The same tools that analyse a stock work on an index: structure, averages, volume and relative strength. Use them to classify the regime."),
                h("Indices to follow"),
                ul(
                    "**NIFTY 50:** large-cap benchmark and the main reference.",
                    "**Bank NIFTY:** the banking sector, a heavy driver of the NIFTY and index-derivative activity.",
                    "**Broader indices:** NIFTY Midcap and Smallcap indices show how the wider market behaves, which is often where growth-stock setups live.",
                    "**Sector indices:** IT, Pharma, Auto, Metals, Realty, FMCG and others for sector context."
                ),
                h("A simple classification"),
                tb("NIFTY trend checklist", ["Question", "Bullish", "Bearish"], [
                    ["Price vs 50-day and 200-day", "Above both", "Below both"],
                    ["Slope of averages", "Rising", "Falling"],
                    ["Structure", "HH and HL", "LH and LL"],
                    ["Recent behaviour at support", "Dips bought", "Rallies sold"],
                    ["Breadth (next lesson)", "Broad participation", "Narrow or deteriorating"],
                ]),
                p("If the NIFTY is above rising 50 and 200-day averages with higher highs and lows, the regime is constructive. If it is below a falling 50-day and has made a lower low, defensive. Mixed readings are a transition: be selective."),
                h("Large-cap versus broad market"),
                p("The NIFTY 50 can be held up by a handful of heavyweights while the average stock falls. Compare it with midcap and smallcap indices. If the NIFTY makes a new high but midcaps and smallcaps lag, the market is narrow, and breakout setups in smaller stocks are riskier."),
                // FUTURE VISUAL: NIFTY 50 with 50/200 DMA and midcap divergence
                co("india", "Index volume", "Cash indices have no traded volume of their own. Volume analysis for the market is often done using aggregate NSE cash-market volume, index futures, or ETFs tracking the index. Be clear which series you use and stay consistent."),
                co("warn", "Common mistake", "Looking only at the NIFTY 50. It can hide weakness in the broader market where many setups occur."),
                takeaway("Classify the regime with the same structure and average rules used for stocks, and compare large-cap, midcap and smallcap indices to see how broad the market really is."),
            ],
            [
                Q("The NIFTY 50 makes a new high, but the Midcap and Smallcap indices are lagging and falling. What does this suggest?", [
                    "A narrow market, so breakout setups in smaller stocks carry more risk",
                    "A very healthy broad rally",
                    "Nothing",
                    "That volume is rising",
                ], 0, "A few heavyweights can lift the NIFTY while most stocks weaken. Narrow markets are less reliable."),
                Q("Why can’t you read volume directly from the NIFTY 50 index?", [
                    "A cash index is a calculation and has no traded volume of its own, so analysts use aggregate market volume, futures or ETFs",
                    "Because volume is banned",
                    "Because it trades only on weekends",
                    "Because indices are not priced",
                ], 0, "The index is a basket calculation. Volume must come from the constituents or related instruments."),
            ]),

        L("ta-market-regime-breadth", "Market breadth", 9,
            "Breadth asks how many stocks participate. It often turns before the index.",
            [
                p("**Market breadth** measures how many stocks are participating in a move. A healthy advance has many stocks rising. A weak one is carried by a few."),
                tb("Common breadth measures", ["Measure", "What it shows", "Healthy", "Warning"], [
                    ["Advance/decline (A/D) line", "Cumulative net number of advancing minus declining stocks", "Rising with the index", "Falling while the index makes new highs"],
                    ["New 52-week highs vs lows", "How many stocks hit extremes", "Many highs, few lows", "Lows expanding, highs shrinking"],
                    ["% of stocks above 50-day / 200-day", "Share of stocks in uptrends", "Above roughly 50% and rising", "Falling sharply, or very low"],
                    ["Breadth thrust", "A sudden burst of participation", "A sharp rise in advancers after a decline", "Not applicable"],
                ]),
                h("Breadth thrust"),
                p("A **breadth thrust** occurs when an unusually large share of stocks advances in a short period, often after a market low. It shows broad and urgent buying and has historically been associated with the start of strong rallies. Different studies use different thresholds, and thrusts are not guaranteed signals."),
                h("Breadth deterioration"),
                p("When the index rises but fewer stocks are above their 50-day averages, new highs shrink and the A/D line lags, the market is **narrowing**. That does not mean an immediate fall, but it increases risk: when the few leading names stumble, nothing supports the index."),
                // FUTURE VISUAL: NIFTY vs % of stocks above 200-day, showing divergence
                co("india", "TradeEdge application", "TradeEdge has a Market Breadth tab. Use it to check advance/decline readings and participation before selecting setups, particularly when the index is near highs."),
                co("warn", "Common mistake", "Treating breadth divergences as timing signals. They can persist for weeks or months. Use them to adjust risk, not to predict the exact top."),
                takeaway("Breadth shows whether many stocks support a move. Expanding highs and a rising share above averages is healthy. A narrowing market increases risk, but is not a precise timing tool."),
            ],
            [
                Q("The NIFTY makes a new high while the percentage of stocks above their 50-day average falls. What does it suggest?", [
                    "Breadth deterioration: the rally is narrowing and risk is rising",
                    "A perfectly healthy market",
                    "An immediate crash",
                    "That all stocks are in Stage 2",
                ], 0, "Fewer stocks participating means less support for the index. It is a warning, not a timer."),
                Q("What is a breadth thrust?", [
                    "A sudden, broad surge in advancing stocks, often after a decline, showing urgent widespread buying",
                    "A single stock’s spike",
                    "A volume dry-up",
                    "A pullback to the 200-day",
                ], 0, "It reflects participation across many stocks, which is why it has been associated with strong market beginnings."),
            ]),

        L("ta-market-regime-distribution-follow-through", "Distribution and follow-through", 9,
            "Two heuristics from William O’Neil’s market-timing work. Useful frameworks, never guarantees.",
            [
                p("William O’Neil studied past market tops and bottoms and noticed recurring patterns in how an index behaves on volume. Two are widely used."),
                h("Distribution days"),
                p("A **distribution day** is commonly defined as a day when an index falls meaningfully (for example about 0.2% or more) on higher volume than the previous session. It suggests institutions are selling. A cluster of distribution days (commonly four to six within about four to five weeks) is regarded as a sign of pressure that can precede a correction. Thresholds vary by source and era."),
                h("Follow-through days"),
                p("After a correction, a rally attempt begins when the index has an up day following a low. A **follow-through day** typically occurs on the fourth day or later of the rally attempt, when the index rises strongly (commonly around 1.25% to 2%) on higher volume than the previous day. It suggests that large buyers are returning. Many rallies that start this way continue, but a number fail."),
                tb("Distribution versus follow-through", ["Concept", "When it matters", "What it suggests", "Limitation"], [
                    ["Distribution day", "Near market highs", "Institutional selling pressure", "Thresholds are heuristic; can cluster without a correction"],
                    ["Follow-through day", "After a correction low", "Buyers returning; a new rally may be starting", "Can fail; needs leaders to confirm"],
                    ["Failed follow-through", "A few days after a follow-through day", "Index falls below the low of the rally attempt", "Signals the attempt failed and caution is needed"],
                ]),
                // FUTURE VISUAL: index chart with distribution days marked at a top and a follow-through day at a low
                h("Defensive positioning"),
                p("When distribution accumulates and leaders start failing, defensive steps include raising cash, tightening stops, reducing size, and avoiding extended entries. When a follow-through day appears and leaders break out successfully, exposure can be increased gradually. Many practitioners add exposure in steps and require individual stocks to confirm."),
                co("india", "Volume source", "In India, consider using aggregate NSE cash volume or a liquid index ETF or futures series for these calculations. Be consistent."),
                co("warn", "These are heuristics", "They come from historical US markets. They have worked often but not always, and parameters differ among authors. Treat them as a framework to organise your thinking. Never present them as guaranteed signals."),
                takeaway("Distribution days flag institutional selling and follow-through days flag buyers returning. Both are rule-of-thumb market-timing tools, best used with leaders’ behaviour and your own results."),
            ],
            [
                Q("What is a distribution day, commonly?", [
                    "A day when the index falls noticeably on higher volume than the prior day, suggesting institutional selling",
                    "A day with no volume",
                    "A day when the index rises on low volume",
                    "A holiday",
                ], 0, "It highlights selling pressure by combining decline and volume expansion."),
                Q("Why should follow-through days be treated with caution?", [
                    "They can fail, and the rally needs confirmation from leading stocks",
                    "They are always correct",
                    "They only appear in bear markets",
                    "They are illegal signals",
                ], 0, "Heuristics improve odds but do not guarantee outcomes."),
                Q("Which is a sensible use of these concepts?", [
                    "Selling everything the moment a fourth distribution day appears, with no other check",
                    "Using them to adjust exposure gradually alongside breadth, leader behaviour and your own trade results",
                    "Ignoring the market entirely",
                    "Buying only on distribution days",
                ], 1, "Rules of thumb are best used as part of a broader judgement."),
            ]),

        L("ta-market-regime-sector-rotation", "Sector rotation", 9,
            "Money moves between sectors. Aligning stock leadership with sector leadership improves odds.",
            [
                p("Capital does not flow evenly through the market. At any time some sectors lead and others lag. **Sector rotation** is the shift of leadership from one group to another as conditions change."),
                h("Leading and lagging"),
                ul(
                    "**Leading sectors:** have strong relative strength versus the NIFTY, many stocks in Stage 2 and many breakouts.",
                    "**Lagging sectors:** weak RS, many stocks in Stage 3 or 4.",
                    "**Rotation:** leadership changes. Sectors that led one cycle often lag the next."
                ),
                h("Why it helps stock selection"),
                p("A strong stock in a strong sector has tailwinds: sector inflows, peers confirming the trend, and attention. A strong stock in a weak sector faces headwinds. Historically a large share of big winners were part of leading industry groups. When stock and sector leadership align, odds tend to improve."),
                tb("Reading sector strength", ["Evidence", "Strong sector", "Weak sector"], [
                    ["Sector index vs NIFTY (RS line)", "Rising", "Falling"],
                    ["Constituents in Stage 2", "Many", "Few"],
                    ["New highs among constituents", "Several leaders", "Mostly lows"],
                    ["Breakouts", "Hold and follow through", "Fail often"],
                ]),
                // FUTURE VISUAL: relative rotation graph quadrants (leading, weakening, lagging, improving)
                co("india", "TradeEdge application", "The Sector Rotation module uses an RRG-style chart to show whether each sector is leading, weakening, lagging or improving relative to the market. Use it to shortlist sectors before picking stocks."),
                co("tip", "Practical use", "Keep a short list of the top three to five sectors. Look for the strongest two or three stocks inside each. Avoid the laggards of leading groups, which rarely lead."),
                co("warn", "Common mistake", "Buying the cheapest stock in a hot sector because it has not moved yet. Laggards usually lag for a reason. Leaders in a leading group offer better odds."),
                takeaway("Sectors rotate. Combine sector strength with stock-level leadership, and use relative strength to see where capital is flowing."),
            ],
            [
                Q("Why does aligning stock and sector leadership help?", [
                    "A strong stock in a strong sector has tailwinds from group inflows and peer confirmation",
                    "Sectors have no influence",
                    "It removes the need for stops",
                    "It makes valuation irrelevant",
                ], 0, "Group strength supports individual stocks and signals broad demand."),
                Q("A hot sector contains one stock that has not moved and trades at a low multiple. What is the usual risk in buying it as the “cheap one”?", [
                    "It is probably lagging for a reason, and laggards rarely lead",
                    "It is guaranteed to catch up",
                    "It will always double",
                    "Nothing",
                ], 0, "Relative weakness in a strong group is typically informative, not an opportunity by itself."),
            ]),
    ],
};

/* ════════════════════════════════════════════════════════════════════════
   TRACK 12 — O'Neil and Minervini Framework
   ════════════════════════════════════════════════════════════════════════ */
const TA_ONEIL_MINERVINI = {
    id: "ta-oneil-minervini",
    title: "O’Neil and Minervini Framework",
    blurb: "The technical side of CAN SLIM and Mark Minervini’s Trend Template, and how they combine with Weinstein’s stages and relative strength.",
    lessons: [
        L("ta-oneil-minervini-canslim", "CAN SLIM: the technical components", 9,
            "William O’Neil’s method has fundamental and technical parts. Here we focus on the technical ones.",
            [
                p("**CAN SLIM** is William O’Neil’s growth-stock framework. The fundamental letters (C and A for earnings, N partly for new products) are covered in the fundamental analysis course. The technical and market letters are the focus here."),
                tb("The technical and market components", ["Letter", "Meaning", "Technical interpretation"], [
                    ["N", "New highs (and new products)", "Buy stocks breaking out to new highs from sound bases, not those far below highs"],
                    ["S", "Supply and demand", "Volume behaviour: dry-up in bases, surges on breakouts; smaller share floats can move faster"],
                    ["L", "Leader or laggard", "Relative strength: buy the leaders of leading groups"],
                    ["I", "Institutional sponsorship", "Evidence of accumulation by quality funds, visible in volume and strong closes"],
                    ["M", "Market direction", "Follow the index and breadth; most stocks follow the market"],
                ]),
                h("The technical workflow"),
                ol(
                    "Check the **market** direction first (M).",
                    "Find the **leading groups** and the **leaders** in them with high relative strength (L).",
                    "Look for stocks near highs forming **sound bases** (N).",
                    "Confirm **volume** behaviour and signs of institutional demand (S, I).",
                    "Buy a **breakout** from the pivot, within the buy zone, with a stop.",
                    "Follow selling rules: cut losses quickly and manage winners."
                ),
                co("key", "Leaders, not cheap stocks", "O’Neil’s studies of big winners found they were usually strong stocks making new highs, not bargains. The question is not “is it cheap?” but “is it leading, and is the base sound?”."),
                co("warn", "Limitations", "The framework was built mostly on US growth stocks. The market, the liquidity and the index structure differ in India. Use it as a way of thinking, test it on Indian data, and avoid treating thresholds as fixed."),
                co("tip", "Combining with fundamentals", "Many practitioners require strong earnings growth in addition to technical strength. Technical leadership without fundamental support can be speculative."),
                takeaway("The technical side of CAN SLIM is: healthy market, leading group, leading stock, sound base, volume confirmation, and a disciplined breakout entry with defined risk."),
            ],
            [
                Q("According to CAN SLIM’s technical logic, what is a better candidate?", [
                    "A stock 50% below its high that looks cheap",
                    "A leading stock in a leading group breaking out from a sound base near a new high",
                    "The lowest-priced stock in the market",
                    "A stock in Stage 4",
                ], 1, "The approach prefers strength: leaders breaking out with demand evidence."),
                Q("Why is “M” (market direction) the first check?", [
                    "Most stocks follow the market, so setups have better odds in healthy markets",
                    "Because it does not matter",
                    "Because it picks the stock",
                    "Because it replaces risk management",
                ], 0, "Market regime sets the background odds for every setup."),
            ]),

        L("ta-oneil-minervini-trend-template", "The Minervini Trend Template", 11,
            "Eight conditions that define a Stage 2 uptrend. Understand why each is there, rather than memorising the numbers.",
            [
                p("Mark Minervini’s **Trend Template** is a set of eight technical conditions he uses as a first filter to find stocks in a confirmed Stage 2 uptrend. A stock must meet them to be considered for his setups."),
                tb("The eight criteria", ["#", "Condition", "Purpose"], [
                    ["1", "Price above the 150-day and 200-day averages", "The stock is above its long-term trend lines"],
                    ["2", "150-day average above the 200-day average", "Medium-term trend is above long-term trend"],
                    ["3", "200-day average rising for at least one month (preferably 4 to 5)", "The long-term trend is up, not flat or turning down"],
                    ["4", "50-day above both 150-day and 200-day", "Short-term trend leads: full bullish alignment"],
                    ["5", "Price above the 50-day average", "The stock is currently strong, not in a deep pullback"],
                    ["6", "Price at least about 30% above its 52-week low", "Has already shown strong demand; not a stock bouncing near lows"],
                    ["7", "Price within about 25% of its 52-week high (closer is better)", "Little overhead supply; near highs"],
                    ["8", "Relative strength rating 70 or higher (80 to 90 preferred)", "Outperforming most of the market"],
                ]),
                h("Why each condition exists"),
                ul(
                    "**1 to 5:** together define the alignment of averages seen in the Moving Averages track. They say price, short, medium and long trends all agree.",
                    "**6:** a stock only 5% above its low has not proven itself. Real uptrends have typically already advanced.",
                    "**7:** stocks far below their highs carry a lot of overhead supply.",
                    "**8:** adds the leadership filter from the Relative Strength track."
                ),
                co("warn", "Not universal truths", "The numbers (30%, 25%, 70) are guidelines from his experience. They are not natural laws. Different markets and periods may justify different values, so test before assuming they are optimal. Do not hard-code them as truth in your thinking."),
                co("india", "TradeEdge application", "TradeEdge includes the Minervini screen (all eight criteria) and the Trend Template 7 of 8 screen, which allows one criterion to be missed. The relaxed version lists more names, including stocks that are just emerging, and you must judge which criterion fails and why."),
                co("tip", "Practical use", "The template is a filter, not a trigger. Passing it means the stock is in a strong trend. You still need a base, a pivot, volume and a stop."),
                takeaway("The Trend Template combines price, three averages, slope, distance from highs and lows, and relative strength to identify Stage 2 stocks. It filters candidates, it does not time entries."),
            ],
            [
                Q("Which criterion ensures the long-term trend is genuinely up and not flat?", [
                    "Price above the 50-day average",
                    "The 200-day average rising for at least a month",
                    "RS rating of 70",
                    "Price 30% above its 52-week low",
                ], 1, "A rising 200-day average shows the long-term trend direction. Price above a flat average does not."),
                Q("Why does the template require price to be within about 25% of its 52-week high?", [
                    "Stocks near highs have less overhead supply from trapped holders",
                    "Because 25% is a law of nature",
                    "To make stocks cheaper",
                    "To lower volume",
                ], 0, "Overhead supply is the main reason stocks far below highs struggle to rise."),
                Q("What is the right way to use the Trend Template numbers?", [
                    "As universal fixed laws",
                    "As useful guidelines to be tested, not immutable truths",
                    "Ignore them",
                    "Apply only to index funds",
                ], 1, "They reflect one practitioner’s experience. Responsible use includes testing in your own market."),
            ]),

        L("ta-oneil-minervini-combined", "Stage 2 plus Trend Template plus RS", 9,
            "Weinstein, O’Neil and Minervini describe overlapping ideas. Learn where they agree and where they differ.",
            [
                p("The three frameworks reach similar conclusions from different directions. Understanding the overlap helps you build one coherent process instead of a patchwork."),
                tb("Comparison of frameworks", ["Aspect", "Weinstein", "O’Neil", "Minervini"], [
                    ["Core idea", "Own Stage 2, avoid Stages 3 and 4", "Buy leaders breaking out from sound bases", "Buy Stage 2 leaders at low-risk pivots with tight risk"],
                    ["Timeframe", "Weekly charts", "Daily and weekly", "Daily, with weekly context"],
                    ["Key average", "30-week", "10-week and 50-day", "50, 150, 200-day"],
                    ["Relative strength", "Mansfield RS", "RS rating", "RS rating and RS line"],
                    ["Entry focus", "Breakout from Stage 1 base on volume", "Pivot of cup, flat base and others", "Pivot of VCP"],
                    ["Risk emphasis", "Stop below support", "Cut losses at 7% to 8%", "Tight, defined stop; position sizing"],
                ]),
                h("Where they overlap"),
                ul(
                    "Price above a rising long-term average (30-week is about the 150-day).",
                    "Strong relative strength.",
                    "Breakouts from bases with volume.",
                    "Avoiding declining stocks.",
                    "Cutting losses quickly."
                ),
                h("Where they differ"),
                ul(
                    "**Entry precision:** Minervini puts more weight on VCP tightness and low-risk pivots, Weinstein on the weekly breakout and stage, O’Neil on base patterns and the market.",
                    "**Stops:** O’Neil’s 7% to 8% rule of thumb is simple, Minervini’s stops are tied to the setup and capped, Weinstein’s are tied to support.",
                    "**Holding:** Weinstein’s approach is more positional, using the 30-week as a trailing guide, whereas the others often take partial profits sooner.",
                ),
                h("A combined filter"),
                fm("Combined view", "Weinstein: Stage 2 on the weekly chart\n+ Minervini: Trend Template met on the daily chart\n+ O’Neil: leading group and sound base\n+ RS: strong rating and RS line near highs", "Each lens removes a different kind of weak candidate."),
                co("warn", "Common mistake", "Mixing contradictory rules from different authors, such as a 7% stop with a 15% wide base. Choose one consistent set and test it."),
                co("tip", "Practical use", "Use weekly Stage analysis for context, the Trend Template to filter, and the base and volume to time. Write the combined process in a checklist."),
                takeaway("The three frameworks share a core: strong, leading, trending stocks near highs, bought at low-risk pivots with defined stops. Choose one consistent set of rules instead of mixing contradictory ones."),
            ],
            [
                Q("Which idea is shared by Weinstein, O’Neil and Minervini?", [
                    "Buy the cheapest stocks near lows",
                    "Prefer strong, leading stocks in uptrends and cut losses quickly",
                    "Ignore volume",
                    "Hold losers indefinitely",
                ], 1, "All three emphasise strength, trend, relative strength and loss control."),
                Q("The 30-week moving average is approximately equal to which daily average?", [
                    "50-day",
                    "100-day",
                    "150-day",
                    "250-day",
                ], 2, "30 weeks × 5 sessions = 150 sessions."),
                Q("Why is mixing contradictory rules a problem?", [
                    "It makes the process inconsistent and hard to test, so you cannot learn whether it works",
                    "It improves performance",
                    "It removes risk",
                    "It is required",
                ], 0, "A clear rule set lets you measure results and improve. Mixed rules hide what is working."),
            ]),
    ],
};

/* ════════════════════════════════════════════════════════════════════════
   TRACK 13 — Risk Management
   ════════════════════════════════════════════════════════════════════════ */
const TA_RISK = {
    id: "ta-risk-management",
    title: "Risk Management",
    blurb: "Stops that invalidate the idea, position sizing from rupee risk, reward-to-risk, expectancy and portfolio-level risk.",
    lessons: [
        L("ta-risk-stop-loss", "Stop loss: where the idea is wrong", 10,
            "A stop is not a percentage you pick. It is the price at which your reason for the trade no longer holds.",
            [
                p("A **stop loss** is a predefined exit if the trade moves against you. It caps the loss and keeps one failure from damaging the account."),
                co("key", "The stop principle", "The stop should invalidate the trade thesis, not simply satisfy an arbitrary percentage."),
                h("Types of stops"),
                tb("Stop methods", ["Method", "How it works", "Strength", "Weakness"], [
                    ["Technical / structural stop", "Below a swing low, pivot, base low or signal candle", "Tied to the reason for the trade", "Distance varies; may be wide"],
                    ["Percentage stop", "A fixed percent below entry (for example 7%)", "Simple and consistent", "Ignores structure and the stock’s volatility"],
                    ["ATR stop", "Entry minus a multiple of Average True Range (for example 2 × ATR)", "Adapts to volatility", "May sit in meaningless places relative to structure"],
                    ["Volatility-adjusted stop", "Wider for volatile stocks, tighter for calm ones", "Fits the stock’s normal noise", "Needs smaller size when wide"],
                    ["Time stop", "Exit if the trade does not move within N days", "Frees capital from dead trades", "May exit before a delayed move"],
                ]),
                fm("Average True Range (ATR)", "True Range = max( High − Low, |High − Previous close|, |Low − Previous close| )\nATR(14) = Wilder-smoothed average of True Range over 14 periods", "ATR measures a stock’s typical daily movement in rupees. Example: ATR ₹8 on a ₹400 stock is 2% of price per day."),
                h("Choosing a stop"),
                ol(
                    "Find the **structural level** where the thesis fails (for example below the last contraction low).",
                    "Check that the stop is **outside normal noise**: compare the distance with ATR. A stop closer than about one ATR is often hit by ordinary movement.",
                    "Check the **maximum risk** you accept per share. If the structural stop is too far, reduce size or skip."
                ),
                p("Example: ABC enters at ₹500. The last contraction low is ₹472 and ATR(14) is ₹9. A stop at ₹470 is ₹30 away (6%), well beyond one ATR, so noise will not trigger it. A stop at ₹495 would be inside one ATR and likely to be hit by noise."),
                co("warn", "Common mistake", "Moving a stop lower after entry because the stock is “just a pullback”. That changes risk after the fact. Stops can be moved up to protect profit, but not widened."),
                co("india", "Gap risk", "Stops are triggered by prices, and a stock that gaps below your stop on bad news opens at the gap price, not at your stop. Results, regulatory news and overnight global moves can cause this, which is why position size matters as much as the stop."),
                takeaway("Place the stop where the idea fails, check it against volatility and your maximum risk, and never widen it. If the logical stop is too far, reduce size or skip the trade."),
            ],
            [
                Q("What should determine where a stop is placed?", [
                    "The level at which the trade thesis is invalidated",
                    "A fixed 10% for every trade",
                    "Whatever keeps the loss under ₹1,000",
                    "The price you want the stock to reach",
                ], 0, "A stop tied to structure reflects why you entered. Arbitrary numbers can sit in noise or exceed acceptable risk."),
                Q("ATR(14) is ₹9. Entry ₹500. Which stop is most likely to be hit by normal noise?", [
                    "₹470",
                    "₹472",
                    "₹495",
                    "₹460",
                ], 2, "₹495 is only ₹5 below entry, which is less than one ATR (₹9). Normal daily movement could reach it."),
                Q("A stock gaps below your stop at the open on bad news. At which price are you likely to exit?", [
                    "Exactly at the stop",
                    "At or near the gap price, which can be worse than the stop",
                    "Above the stop",
                    "No exit occurs",
                ], 1, "A stop becomes a market order when triggered. Gaps skip prices, so slippage can exceed the planned loss."),
            ]),

        L("ta-risk-position-sizing", "Position sizing", 10,
            "Size the trade so that being wrong costs a fixed, small part of the account. This is the single most important calculation.",
            [
                p("**Position sizing** decides how many shares to buy. The right method starts not with how much you want to invest but with how much you are willing to lose."),
                fm("Position size", "Position Size = Capital at Risk ÷ Risk Per Share\nRisk Per Share = Entry Price − Stop Price", "Capital at risk is a fixed percentage of your account, commonly 0.5% to 1% per trade for many traders. It is a personal decision."),
                h("Worked example"),
                tb("Position size example", ["Item", "Value"], [
                    ["Account capital", "₹10,00,000"],
                    ["Risk per trade", "1% = ₹10,000"],
                    ["Entry", "₹500"],
                    ["Stop", "₹475"],
                    ["Risk per share", "₹25"],
                    ["Position size", "₹10,000 ÷ ₹25 = 400 shares"],
                    ["Position value", "400 × ₹500 = ₹2,00,000 (20% of the account)"],
                ]),
                p("If the stop hits, the loss is about ₹10,000 (1% of the account), ignoring costs and slippage. If the stop were wider, at ₹450 (₹50 risk), size would be 200 shares. **Same risk, different size.**"),
                h("What position sizing teaches"),
                ul(
                    "A wide stop does not mean more risk, it means **fewer shares**.",
                    "A tight stop allows more shares, but check that it is outside normal noise.",
                    "Position value can be large even when risk is small. Check concentration separately.",
                    "Liquidity matters: do not buy more shares than the stock can trade without moving price."
                ),
                co("tip", "Practical use", "Calculate size before you enter, with a calculator or spreadsheet. If the position value exceeds your concentration limit (for example 20% to 25%), cap the size."),
                co("warn", "Common mistake", "Choosing shares by feel, such as always buying 500 shares. The same 500 shares can risk ₹5,000 on one trade and ₹30,000 on another."),
                co("india", "Costs", "Brokerage, STT, exchange charges and slippage reduce results. For small accounts and tight stops, include a cost estimate in the risk per share."),
                takeaway("Position size equals capital at risk divided by risk per share. Risk a fixed small percentage, size from the stop distance, and cap size for concentration and liquidity."),
            ],
            [
                Q("Capital ₹10,00,000, risk 1%, entry ₹500, stop ₹475. How many shares?", [
                    "200",
                    "400",
                    "500",
                    "2,000",
                ], 1, "Risk = ₹10,000. Risk per share = ₹25. 10,000 ÷ 25 = 400 shares."),
                Q("If the stop were ₹450 instead of ₹475 with the same 1% risk, what changes?", [
                    "Size doubles",
                    "Size halves to about 200 shares",
                    "Nothing",
                    "Risk becomes 2%",
                ], 1, "Risk per share doubles to ₹50, so size is 10,000 ÷ 50 = 200. A wider stop reduces shares, not risk."),
                Q("Why is “I always buy 500 shares” a poor sizing method?", [
                    "Rupee risk varies with each stop distance, so the same shares can risk very different amounts",
                    "500 is too small",
                    "It cannot be done",
                    "It removes costs",
                ], 0, "Shares are not risk. Risk depends on shares times stop distance."),
            ]),

        L("ta-risk-reward", "Risk/reward, R multiples and expectancy", 11,
            "Think in R, the amount you risk. A strategy can be profitable even when it loses more often than it wins.",
            [
                p("**1R** is the amount you risk on a trade. If you risk ₹10,000, a ₹30,000 profit is **+3R** and a stopped-out loss is **−1R**. Measuring in R makes trades comparable regardless of size."),
                fm("R multiple", "R multiple = (Exit price − Entry price) ÷ (Entry price − Stop price)", "Example: entry ₹500, stop ₹475, exit ₹575. R = 75 ÷ 25 = +3R."),
                h("Reward-to-risk"),
                p("If you risk ₹25 per share to potentially make ₹75, the reward/risk is 3:1. Before entering, estimate a realistic reward scenario and compare it with risk."),
                h("Expected value"),
                fm("Expectancy in R", "Expectancy = (Win rate × Average win in R) − (Loss rate × Average loss in R)", "It is the average result per trade in R over many trades."),
                tb("Different profiles with similar profitability", ["Profile", "Win rate", "Avg win", "Avg loss", "Expectancy"], [
                    ["Frequent small winner", "65%", "1.0R", "1.0R", "(0.65×1.0) − (0.35×1.0) = +0.30R"],
                    ["Balanced", "50%", "2.0R", "1.0R", "(0.50×2.0) − (0.50×1.0) = +0.50R"],
                    ["Few big winners", "45%", "3.0R", "1.0R", "(0.45×3.0) − (0.55×1.0) = +0.80R"],
                    ["Low win-rate trend follower", "35%", "3.5R", "1.0R", "(0.35×3.5) − (0.65×1.0) = +0.575R"],
                ]),
                p("A 45% win rate with an average winner of 3R and an average loser of 1R produces +0.80R per trade. Over 100 trades that is +80R. At ₹10,000 per R, that is ₹8,00,000 before costs, drawdowns and sample uncertainty."),
                co("key", "Win rate is not the goal", "Many beginners focus on win rate. A system that wins 70% but averages 0.5R winners and 2R losers loses money: (0.7×0.5) − (0.3×2.0) = −0.25R. What matters is the combination of win rate and payoff."),
                co("warn", "Caveats", "Expectancy estimated from a small number of trades is uncertain. Costs, slippage and changing markets can reduce it. Treat these numbers as an illustration of the logic, not a promise."),
                co("tip", "Practical use", "Record every trade’s result in R. After 30 to 50 trades, calculate your own win rate and average winner and loser. These are the real inputs for improving the process."),
                takeaway("Measure trades in R. Expectancy combines win rate with average win and loss in R. Strategies with lower win rates can be profitable when winners are much larger than losers."),
            ],
            [
                Q("Entry ₹500, stop ₹475, exit ₹575. What is the R multiple?", [
                    "+1R",
                    "+2R",
                    "+3R",
                    "+5R",
                ], 2, "Risk = 25. Gain = 75. R = 75 ÷ 25 = 3."),
                Q("A system wins 45% of trades with an average winner of 3R and an average loser of 1R. What is its expectancy?", [
                    "+0.20R",
                    "+0.45R",
                    "+0.80R",
                    "−0.10R",
                ], 2, "(0.45 × 3) − (0.55 × 1) = 1.35 − 0.55 = +0.80R per trade."),
                Q("A system wins 70% of trades, with average winners of 0.5R and average losers of 2R. What is the result?", [
                    "Profitable because win rate is high",
                    "Negative expectancy: (0.7×0.5) − (0.3×2.0) = −0.25R",
                    "Break-even",
                    "Cannot be calculated",
                ], 1, "A high win rate does not offset poor payoff. The average loser is four times the average winner."),
            ]),

        L("ta-risk-portfolio", "Portfolio-level risk", 9,
            "Individual trade risk is only part of the picture. Correlation, concentration and gap risk matter at the portfolio level.",
            [
                p("Risking 1% per trade seems safe. But if you hold ten positions that all fall together, the portfolio risk is not 1%. Portfolio risk depends on how positions relate to each other."),
                h("Key risks"),
                tb("Portfolio risk factors", ["Risk", "What it is", "How to manage"], [
                    ["Correlation", "Positions that move together, such as stocks in the same trend or theme", "Treat highly correlated positions as one larger position"],
                    ["Sector concentration", "Too much in one industry", "Cap exposure per sector"],
                    ["Position concentration", "One position too large", "Cap position value as a percent of account"],
                    ["Total open risk", "Sum of risk across all open trades if all stops hit", "Set a maximum (for example 5% to 6% of capital)"],
                    ["Gap risk", "A stock opens beyond its stop on news", "Smaller size around events; avoid oversized positions in volatile names"],
                    ["Market-wide risk", "A broad sell-off hits most stocks at once", "Reduce exposure when the regime deteriorates"],
                ]),
                fm("Total open risk", "Open risk = Sum of (Position size × Risk per share) for all open positions", "Example: six trades each risking 1% means 6% of the account is at risk if all stops hit."),
                p("Six positions at 1% each is 6% of the account at risk. If four are in the same sector and the sector falls sharply, gaps can make the realised loss larger than planned. Some practitioners cap sector exposure and reduce total open risk when markets weaken."),
                co("india", "Small and mid cap risk", "Illiquid names can gap through stops, and lower and upper circuits can prevent exit for a day or more. Use smaller sizes and count liquidity as a risk."),
                co("warn", "Common mistake", "Diversifying by number of stocks rather than by risk. Ten similar stocks behave like one or two."),
                co("tip", "Practical use", "Keep a simple table: ticker, sector, position value, risk at stop. Total each column. If sector or total risk exceed limits, do not add."),
                takeaway("Manage risk at the portfolio level: cap total open risk, sector exposure and position size, treat correlated positions as one, and respect gap and market-wide risk."),
            ],
            [
                Q("Six open trades each risk 1% of capital. What is the total open risk if all stops hit?", [
                    "1%",
                    "3%",
                    "6%",
                    "60%",
                ], 2, "Open risk sums across positions: 6 × 1% = 6%."),
                Q("Four of six positions are in the same sector and are highly correlated. How should they be viewed?", [
                    "As four independent bets",
                    "As closer to one larger position, since they tend to move together",
                    "As zero risk",
                    "As hedges for each other",
                ], 1, "Correlated positions share the same drivers, so their risks add rather than offset."),
            ]),
    ],
};

/* ════════════════════════════════════════════════════════════════════════
   TRACK 14 — Trade Management
   ════════════════════════════════════════════════════════════════════════ */
const TA_TRADE_MANAGEMENT = {
    id: "ta-trade-management",
    title: "Trade Management",
    blurb: "After entry: trailing stops, partial profits, when to sell, and how to add to and reduce positions.",
    lessons: [
        L("ta-trade-management-winners", "Managing a winning trade", 10,
            "The initial stop protects capital. Later stops protect profit. Choose a method in advance.",
            [
                p("Entry is the beginning. How a trade is managed after it works often decides whether it becomes a small gain or a large one."),
                h("A typical sequence"),
                ol(
                    "**Initial stop:** below the thesis-invalidation level.",
                    "**Break-even:** once the stock reaches a multiple of risk (for example +1.5R to +2R) and holds, many traders move the stop to entry. This protects capital but can cause a stop-out in a normal pullback, so do it thoughtfully.",
                    "**Trailing stop:** raise the stop as the stock advances, below higher lows or a moving average.",
                    "**Partial profits:** sell part at a target or after a large move, and trail the rest."
                ),
                tb("Trailing methods", ["Method", "How", "Fits"], [
                    ["Swing-low trail", "Stop below the most recent higher low", "Trending stocks with clear swings"],
                    ["Moving-average trail", "Exit on a close below the 10-day EMA, 50-day or 10-week average", "Strong leaders; choose by how tightly you want to follow"],
                    ["ATR trail", "Stop at highest close minus a multiple of ATR (for example 3 × ATR)", "Volatile stocks; adapts to noise"],
                    ["Percent-from-high trail", "Stop a fixed percent below the highest price", "Simple but ignores structure"],
                ]),
                p("Example: ABC is bought at ₹500 with a ₹475 stop (1R = ₹25). At ₹550 (+2R) the stop moves to ₹500 (break-even). At ₹600 the stop trails to ₹560, just below the last higher low. If it later falls to ₹560, the trade exits at +2.4R."),
                // FUTURE VISUAL: price with stages of stop movement: initial, breakeven, trailing
                co("tip", "Practical use", "Match the trailing method to the stock’s behaviour. A tight trail on a volatile mid cap will exit on noise. A wide trail on a calm large cap gives back too much."),
                co("warn", "Common mistake", "Moving to break-even too early. A stock that has just broken out will often retest the pivot. Stops that sit exactly at entry are frequently hit by that normal retest."),
                takeaway("Protect capital first, then profit. Use a pre-chosen trailing method that matches the stock’s volatility, and consider partial profits to bank some gain."),
            ],
            [
                Q("Entry ₹500, stop ₹475. The stock reaches ₹600 and the stop trails to ₹560. If the stock falls and exits at ₹560, what is the R multiple?", [
                    "+1.0R",
                    "+2.0R",
                    "+2.4R",
                    "+4.0R",
                ], 2, "Gain = 60. Risk = 25. 60 ÷ 25 = 2.4R."),
                Q("Why can moving the stop to break-even too early backfire?", [
                    "Breakouts often retest the pivot, and a stop at entry is likely to be triggered by that normal retest",
                    "Because it increases risk",
                    "Because break-even is not allowed",
                    "Because it widens the stop",
                ], 0, "A retest near entry is common. A stop exactly there turns normal noise into a loss of opportunity."),
            ]),

        L("ta-trade-management-when-to-sell", "When to sell", 10,
            "A list of objective reasons to exit, so the decision is not made in the middle of fear or greed.",
            [
                p("Selling is the hardest decision because it is judged against what happens next. Pre-defined reasons make it easier."),
                tb("Reasons to sell", ["Reason", "What you see", "Typical response"], [
                    ["Stop-loss hit", "Price reaches the stop", "Exit; no negotiation"],
                    ["Failed breakout", "Close back below the pivot on volume", "Exit per plan"],
                    ["Heavy distribution", "Largest down day or week in a long time on big volume", "Reduce or exit"],
                    ["Trend break", "Loses the last higher low or a key average on volume", "Exit or reduce"],
                    ["Moving-average violation", "Weekly close below the 10-week average with volume", "Exit or reduce by plan"],
                    ["Stage transition", "Flattening 30-week average, chopping price", "Tighten, reduce, avoid adding"],
                    ["Relative strength deterioration", "RS line breaks down while price stalls", "Review; a warning that leadership is fading"],
                    ["Climactic run", "Very steep, extended advance on huge volume", "Consider selling into strength"],
                    ["Market turns", "Index in correction; leaders failing", "Reduce exposure"],
                ]),
                h("Selling into strength versus weakness"),
                p("Selling **into strength** (during a sharp advance) usually gives better prices but risks leaving a larger move. Selling **into weakness** (after the trend breaks) is more certain but gives back profit. Many traders combine: take partial profits into strength and exit the remainder on a technical violation."),
                h("The plan versus the emotion"),
                ul(
                    "Write sell rules before entry.",
                    "Differentiate a **plan-based sale** (a rule triggered) from an **emotional sale** (fear or boredom).",
                    "Review exits regularly: did you sell by rule, too early, or too late?"
                ),
                co("india", "Events", "Results announcements and regulatory events can gap the stock. Decide in advance whether to hold through an event, and size accordingly."),
                co("warn", "Common mistake", "Selling a strong stock because it is “up a lot”. Price gain alone is not a sell reason. Evidence of weakness, a rule or a better use of capital is."),
                takeaway("Sell for objective reasons: stops, failed breakouts, distribution, trend and average violations, stage transitions, fading RS, or a deteriorating market. Write the rules before you enter."),
            ],
            [
                Q("Which is a rule-based reason to exit?", [
                    "The stock is up 40% and feels expensive",
                    "A weekly close below the 10-week average on heavy volume, as defined in the plan",
                    "A friend is nervous",
                    "The market is open",
                ], 1, "Rules triggered by price and volume evidence are objective, unlike feelings."),
                Q("What is the trade-off of selling into strength versus weakness?", [
                    "Strength often gives better prices but may leave a bigger move, while weakness gives more certainty but returns some profit",
                    "There is none",
                    "Weakness is always better",
                    "Strength is always better",
                ], 0, "Each approach has a cost. Combining partial selling and a technical exit balances them."),
            ]),

        L("ta-trade-management-scaling-in", "Scaling in", 8,
            "Add to winners, not losers. Each addition must be confirmed and risk-controlled.",
            [
                p("**Scaling in** means building a position in stages rather than all at once. Done well, it increases exposure only when the trade is working."),
                h("Common approaches"),
                ul(
                    "**Initial position, then add on confirmation:** start with a partial size (for example half) at the pivot, add the rest as the stock follows through.",
                    "**Pyramid:** add smaller amounts as the stock rises, so the average cost rises more slowly than the price.",
                    "**Add on a constructive pullback:** a new entry at a rising average or a retest of the breakout level."
                ),
                tb("Example pyramid", ["Step", "Price", "Shares", "Comment"], [
                    ["Initial buy", "₹500", "200", "Half the planned size, stop ₹475"],
                    ["Add 1", "₹520", "100", "Follow-through confirmed, stop moved to ₹500 for the whole position"],
                    ["Add 2", "₹540", "50", "Smaller add; whole position stop raised to ₹520"],
                ]),
                p("Total shares: 350. Average cost: (200×500 + 100×520 + 50×540) ÷ 350 = (1,00,000 + 52,000 + 27,000) ÷ 350 = ₹511.4. A stop at ₹520 locks in a small profit on the combined position, so the added shares did not increase risk beyond the original plan."),
                co("key", "Risk control for adds", "Before each add, recalculate total risk to the stop. The combined position should not risk more than your plan allows."),
                co("warn", "Do not average down", "Adding to a loser lowers your average price but increases risk in a trade that has already told you it is not working. Scaling in is for confirmed strength."),
                takeaway("Scale in on confirmation with smaller adds, keep total risk within plan by raising the stop, and never add to losing positions."),
            ],
            [
                Q("What is the main difference between pyramiding and averaging down?", [
                    "Pyramiding adds to winners on confirmation, averaging down adds to losers",
                    "They are the same",
                    "Pyramiding adds to losers",
                    "Averaging down adds on strength",
                ], 0, "Adding to strength is consistent with the thesis. Adding to weakness fights the market."),
                Q("Why should each add be smaller than the previous one?", [
                    "So average cost rises slowly and the position is not heavily exposed to a pullback at the highest price",
                    "Because rules require it",
                    "To reduce volume",
                    "To increase risk",
                ], 0, "Smaller adds at higher prices limit exposure at the least favourable entry points."),
            ]),

        L("ta-trade-management-scaling-out", "Scaling out", 8,
            "Taking partial profits can reduce regret and lock in gains, if it follows a plan rather than emotion.",
            [
                p("**Scaling out** means selling a position in parts. It balances two risks: giving back profit if the trade reverses, and missing a large move if you sell too early."),
                h("Common approaches"),
                ul(
                    "**Sell a portion at a target** (for example half at +2R or +3R) and trail the remainder.",
                    "**Sell into a climactic run,** keep a smaller core with a trailing stop.",
                    "**Sell a fraction on each violation of a short-term average,** and the rest on a major violation."
                ),
                tb("Example: scaling out", ["Step", "Price", "Action", "R banked"], [
                    ["Entry ₹500, stop ₹475, 400 shares", "", "1R = ₹25 per share", ""],
                    ["Target 1", "₹575", "Sell 200 shares", "+3R on half"],
                    ["Stop on the remainder", "₹550", "Trail below higher low", "Locks in +2R on the rest"],
                    ["Final exit", "₹620 (trail hit)", "Sell 200 shares", "+4.8R on the rest"],
                ]),
                p("Average outcome: (3R + 4.8R) ÷ 2 = 3.9R. If the stock had reversed after Target 1, the remaining half would still have exited at +2R, so the trade would have returned about 2.5R on average."),
                h("Premature profit-taking"),
                p("Selling too early is a common error. If you cut every winner at +1.5R while letting losers reach −1R, expectancy shrinks. A plan with a core position for the trend helps avoid this, because you know part of the position is designed to capture a larger move."),
                co("key", "Plan versus emotion", "A trading plan sells a portion because a rule says so. Emotional selling happens because the gain feels fragile. The result can look similar, but only one is repeatable."),
                co("tip", "Practical use", "Decide your partial profit rule before entry, for example half at +2R. Note the reason for each sale in your journal."),
                takeaway("Scaling out balances regret and risk. Use pre-defined targets and trailing stops for the remainder, and avoid cutting every winner short."),
            ],
            [
                Q("Entry ₹500, stop ₹475. Half is sold at ₹575 and half exits at ₹620. What is the average R multiple?", [
                    "3.0R",
                    "3.9R",
                    "4.8R",
                    "5.0R",
                ], 1, "Half at +3R and half at +4.8R: (3 + 4.8) ÷ 2 = 3.9R."),
                Q("Why can cutting every winner at +1.5R damage a system?", [
                    "Average winners become small compared with losers, lowering expectancy",
                    "It increases the win rate permanently",
                    "It removes risk",
                    "It improves payoff",
                ], 0, "If losers are −1R and winners are capped near +1.5R, you need a very high win rate to be profitable."),
            ]),
    ],
};

/* ════════════════════════════════════════════════════════════════════════
   TRACK 15 — Technical Screening
   ════════════════════════════════════════════════════════════════════════ */
const TA_SCREENING = {
    id: "ta-screening",
    title: "Technical Screening",
    blurb: "Turn chart observations into objective conditions that generate repeatable candidate lists, and learn what screens cannot do.",
    lessons: [
        L("ta-screening-from-chart", "From chart analysis to screening", 8,
            "A screen is a set of rules that selects stocks. It extends your attention, but it does not replace judgement.",
            [
                p("India has thousands of listed stocks. You cannot read every chart. **Screening** converts a visual idea into numeric conditions and lists every stock that satisfies them."),
                fm("What screening does", "Subjective chart observation\n→ Objective conditions\n→ Repeatable candidate generation", "The screen is a funnel. It narrows thousands of stocks to a short list worth a human review."),
                h("A good screening workflow"),
                ol(
                    "**Define the idea** in words: “strong stocks near highs that are tightening”.",
                    "**Translate** each part into a measurable condition: price vs averages, RS rating, distance from high, volume ratio.",
                    "**Run the screen** and get a candidate list.",
                    "**Review the charts** of each candidate manually.",
                    "**Record** which screen results turned into trades and how they performed. Adjust the thresholds."
                ),
                h("Strengths and limits"),
                tb("Screens versus judgement", ["Screens do well", "Screens do poorly"], [
                    ["Covering the whole market consistently", "Judging the quality of a pattern’s shape"],
                    ["Applying the same rules every day", "Reading the context of news and events"],
                    ["Surfacing leaders you did not know", "Distinguishing a clean base from a messy one"],
                    ["Avoiding emotional bias in selection", "Understanding market regime and liquidity"],
                ]),
                co("india", "TradeEdge application", "TechLens → Screens provides ready-made screens grouped by theme: Market Leaders, Breakouts, Pullback and Legend Screens. The next lessons explain what typical conditions mean so you can interpret the results."),
                co("warn", "Common mistake", "Treating the screen output as a buy list. It is a research list. Every name still needs a chart review, a stop and a size."),
                takeaway("Screening turns chart ideas into objective rules and lists candidates consistently. It cannot judge shape quality, context or market regime. Always review the chart."),
            ],
            [
                Q("What is the right role of a screen output?", [
                    "A final buy list",
                    "A research shortlist to be reviewed on charts",
                    "A replacement for stops",
                    "A guarantee of performance",
                ], 1, "Screens find candidates consistently. Judgement, risk definition and sizing still follow."),
                Q("Which is something screens do poorly?", [
                    "Applying the same rules to every stock",
                    "Judging the shape quality of a base and the context of news",
                    "Scanning thousands of stocks",
                    "Reducing emotional bias",
                ], 1, "Shape quality and context need human judgement."),
            ]),

        L("ta-screening-trend-template", "A Trend Template screen", 10,
            "Worked example: translating the Trend Template into conditions and understanding every line.",
            [
                p("Here is an example screen built from the Trend Template ideas. Each condition has a purpose."),
                fm("Example Trend Template screen", "SMA50 > SMA150 > SMA200\nClose > SMA50\nClose > SMA200\nSMA200 today > SMA200 about 22 trading days ago (rising)\nClose ≥ 1.30 × 52-week low\nClose ≥ 0.75 × 52-week high  (within 25% of the high)\nRS Rating ≥ 75", "These are illustrative thresholds. Parameters differ among practitioners, and you should test them."),
                tb("Reading each condition", ["Condition", "What it checks", "What happens if you remove it"], [
                    ["SMA50 > SMA150 > SMA200", "Full bullish alignment", "Includes stocks in transition or recovering from downtrends"],
                    ["Close > SMA50", "Stock currently strong", "Includes stocks in deeper pullbacks"],
                    ["Close > SMA200", "Above the long-term line", "Includes stocks still in long-term downtrends"],
                    ["SMA200 rising", "Long-term trend is up", "Includes stocks above a flat or falling long-term line"],
                    ["Close ≥ 1.30 × 52-week low", "Has advanced meaningfully from lows", "Includes bounces from lows"],
                    ["Close ≥ 0.75 × 52-week high", "Near highs, less overhead supply", "Includes stocks far below highs"],
                    ["RS Rating ≥ 75", "Outperforming the market", "Includes laggards"],
                ]),
                h("What you will see in the results"),
                ul(
                    "A relatively small list in a healthy market and a very short list in a weak one. The count itself tells you about the regime.",
                    "Extended stocks and stocks near pivots mixed together. Next steps (pivot proximity, base quality) narrow them.",
                    "Illiquid stocks, which you must filter separately with minimum turnover."
                ),
                co("india", "TradeEdge application", "The Minervini screen uses all eight criteria. The Trend Template 7 of 8 screen allows one failure and is sorted by criteria met and RS rating, so you can see which stocks narrowly miss. Use it to find stocks about to qualify, and check which criterion is failing."),
                co("tip", "Practical use", "Add a liquidity filter (for example average daily turnover above a minimum rupee value) to avoid names that you cannot trade with your size."),
                co("warn", "Common mistake", "Tuning thresholds until the screen shows past winners. That is hindsight selection. Choose thresholds from logic and test them on data you did not use to design them."),
                takeaway("A Trend Template screen stacks alignment, slope, distance from high and low, and RS. Every condition filters out a type of weak candidate. Add a liquidity filter and avoid tuning to past winners."),
            ],
            [
                Q("What does requiring SMA200 to be higher than it was about a month ago check?", [
                    "That volume is high",
                    "That the long-term trend is rising rather than flat or falling",
                    "That the stock is cheap",
                    "That the RS rating is 99",
                ], 1, "Comparing the average with its own value earlier measures slope."),
                Q("A Trend Template screen returns only a handful of stocks. What might that indicate?", [
                    "A broken screen only",
                    "Few stocks are in confirmed uptrends, which may reflect a weak market regime",
                    "All stocks are Stage 2",
                    "A holiday",
                ], 1, "The number of stocks meeting strict trend criteria is itself a read on market health."),
                Q("Why is tuning thresholds until past winners appear a mistake?", [
                    "It uses hindsight, so the screen may not work on new data",
                    "It improves out-of-sample performance",
                    "It is required",
                    "It reduces trades",
                ], 0, "Fitting to known winners can create a screen that explains the past but fails on new data."),
            ]),

        L("ta-screening-breakout", "A fresh breakout screen", 8,
            "Detect stocks that have just moved above a resistance level with participation and strength.",
            [
                p("A fresh breakout screen looks for stocks that have just crossed a recent high, with confirming conditions."),
                fm("Example fresh breakout screen", "Close > highest high of the prior 20 trading days (the pivot)\nClose ≤ 1.03 × pivot  (not too extended)\nVolume ≥ 1.5 × 50-day average volume\nSMA50 > SMA150 > SMA200\nRS Rating ≥ 70\nClose within about 10% of 52-week high", "A bar with Close in the upper half of its range can be added to filter weak closes."),
                tb("Condition meanings", ["Condition", "Purpose"], [
                    ["Close above prior 20-day high", "A recent resistance has been cleared"],
                    ["Close ≤ 103% of pivot", "Buy zone: avoids chasing extended moves"],
                    ["Relative volume ≥ 1.5", "Participation behind the move"],
                    ["Averages aligned", "Stage 2 context"],
                    ["RS Rating ≥ 70", "Leadership"],
                    ["Near 52-week high", "Little overhead supply"],
                ]),
                h("What the screen cannot tell you"),
                ul(
                    "Whether the 20-day high is the true pivot of a good base, or just a short-term high inside a messy range.",
                    "Whether the base was tight and quiet before the move.",
                    "Whether the market backdrop supports follow-through.",
                    "Whether liquidity allows your position size."
                ),
                co("india", "TradeEdge application", "The Fresh Breakout screen follows this pattern: it checks the close against the 20-day pivot, a ceiling of 103% of the pivot, relative volume of at least 1.5, trend alignment and an RS rating threshold. The Weekly Breakout Soon and 52-week-high screens use the same logic on different horizons."),
                co("warn", "Common mistake", "Buying every name on the list. Many are low-quality breakouts. Sort by base quality and market context after the screen."),
                takeaway("A fresh breakout screen checks pivot clearance, extension, volume, trend and RS. It does not judge base quality or market backdrop, so review each chart."),
            ],
            [
                Q("Why include “Close ≤ 103% of the pivot”?", [
                    "To exclude breakouts already extended beyond a reasonable buy zone",
                    "To exclude all volume",
                    "To find declining stocks",
                    "To increase risk",
                ], 0, "A stock far above its pivot has worse reward/risk."),
                Q("What does a breakout screen not tell you?", [
                    "Whether price is above the prior 20-day high",
                    "Whether the base before the breakout was tight and healthy",
                    "Whether volume was above 1.5x",
                    "Whether the RS rating passes",
                ], 1, "Shape and quality of the base need visual review."),
            ]),

        L("ta-screening-vcp", "What can and cannot be screened: VCP and tight bases", 9,
            "Hard filters can approximate tightness and volume dry-up. They cannot replace your eyes.",
            [
                p("Not every chart pattern can be captured by simple numeric filters. VCP is a good example."),
                h("What can be measured"),
                ul(
                    "**Tightness:** the high-low range over the last 10 or 20 days as a percent of price.",
                    "**Contraction:** whether the recent 10-day range is smaller than the prior 10-day range.",
                    "**Volume dry-up:** recent average volume versus earlier average, or volume near its lowest in the base.",
                    "**Trend and leadership:** Stage 2, RS rating, proximity to highs.",
                    "**Proximity to a pivot:** distance of price from the recent high."
                ),
                h("What is hard to measure"),
                ul(
                    "**The count and shape of contractions** (are they successive and about half the size?).",
                    "**Whether the base is orderly or erratic** beyond a simple range number.",
                    "**Context:** news, results dates, sector situation.",
                    "**Whether a shakeout is constructive.**"
                ),
                tb("Hard filters versus human interpretation", ["Hard quantitative filters", "Human chart interpretation"], [
                    ["20-day range ≤ 10%", "Is the shape a clean VCP or a messy range?"],
                    ["Recent 10-day range < prior 10-day range", "Do contractions step down progressively?"],
                    ["Recent volume < prior volume", "Is the last contraction dry enough, with a shakeout?"],
                    ["RS Rating > 80 and Stage 2", "Is this stock a real leader with a catalyst?"],
                ]),
                co("india", "TradeEdge application", "The Leadership Tight Base screen requires RS Rating above 80, Stage 2, a 20-day range of 10% or less, a recent 10-day range tighter than the prior 10 days, and contracting volume. It finds candidates that look like late-stage VCPs. The VCP screen as such was removed because numeric filters cannot judge pattern quality on their own."),
                co("warn", "Not every pattern can be an SQL filter", "A tight 20-day range also describes dull, illiquid stocks that never go anywhere. That is why RS, Stage and liquidity filters are paired with it."),
                co("tip", "Practical use", "Use screens to find tight leaders, then use your eyes to count contractions, check the volume dry-up, and decide the pivot."),
                takeaway("Hard filters approximate tightness, contraction and volume dry-up. Pattern quality, contraction sequence and context still need human interpretation."),
            ],
            [
                Q("Which is easiest to capture in a numeric screen?", [
                    "A 20-day range of 10% or less with RS above 80",
                    "Whether contractions step down cleanly in a convincing shape",
                    "Whether the news is good",
                    "Whether a shakeout is constructive",
                ], 0, "Range, RS and Stage are numeric. Shape quality and context are not easily reduced to numbers."),
                Q("Why pair a tight-range filter with RS and Stage filters?", [
                    "A tight range alone also describes dull stocks that go nowhere, so leadership and trend add meaning",
                    "To make the list longer",
                    "To remove volume",
                    "Because tight ranges are always bullish",
                ], 0, "Tightness is only meaningful in a leading stock in an uptrend."),
            ]),

        L("ta-screening-pullback", "A pullback screen", 8,
            "Find strong stocks that have pulled back quietly toward support.",
            [
                p("A pullback screen looks for stocks whose trend is strong, but which have recently dipped toward a rising average with calm volume."),
                fm("Example pullback screen", "SMA50 > SMA150 > SMA200  (strong trend)\nRS Rating ≥ 75\nClose within 3% of SMA50 or within 3% of the 10-week average\nClose ≥ 0.85 × 52-week high  (not too deep)\n5-day average volume < 0.8 × 50-day average volume  (volume contraction)\nClose > SMA200", "A recovery filter such as Close > previous day’s high can capture a reversal day."),
                tb("Reading each condition", ["Condition", "Purpose"], [
                    ["Aligned averages", "A real trend exists to continue"],
                    ["RS Rating high", "The stock is a leader"],
                    ["Close near SMA50 or 10-week average", "The pullback has reached a common support"],
                    ["Close within 15% of high", "The pullback is shallow"],
                    ["Quiet recent volume", "Selling is light"],
                    ["Close above SMA200", "The primary trend is intact"],
                ]),
                p("The results are **candidates for a timing review**. You still check structure (is there a higher low?), the market regime, and look for a reversal signal near the average before acting."),
                co("india", "TradeEdge application", "TechLens → Screens → Pullback contains pullback screens, including Leadership Tight Base, which finds leaders whose range has contracted. Use them for candidates and check that RS and volume support the setup."),
                co("warn", "Common mistake", "Buying the first stock on the list because it is near its average. A pullback is only constructive if structure, volume and RS support it. If any of these is poor, skip."),
                takeaway("A pullback screen selects strong, aligned stocks near support with quiet volume. It is a candidate generator. Structure, signal candles and market conditions decide the entry."),
            ],
            [
                Q("Why include a volume contraction condition in a pullback screen?", [
                    "Quiet volume suggests the pullback is light profit-taking rather than heavy distribution",
                    "To exclude leaders",
                    "To find breakouts",
                    "To increase volatility",
                ], 0, "Healthy pullbacks tend to have contracting volume."),
                Q("A stock passes the pullback screen, but the market is in a correction and the stock has formed a lower low. What should you do?", [
                    "Buy because it passed the screen",
                    "Skip or wait, since structure and market conditions argue against a healthy pullback",
                    "Add to the position",
                    "Ignore the market",
                ], 1, "Screens identify candidates. Structure and regime can invalidate them."),
            ]),
    ],
};

/* ════════════════════════════════════════════════════════════════════════
   TRACK 16 — Building a Complete Trading Setup
   ════════════════════════════════════════════════════════════════════════ */
const TA_SETUPS = {
    id: "ta-trading-setups",
    title: "Building a Complete Trading Setup",
    blurb: "Put everything together: a complete framework and three worked fictional examples, a breakout, a pullback and a failure.",
    lessons: [
        L("ta-trading-setups-complete", "The complete setup framework", 8,
            "A setup is a chain. Every link must hold before capital is committed.",
            [
                p("A setup is not a single signal. It is a chain of conditions from the broad market to the exit plan."),
                fm("The chain", "Market regime\n↓\nSector strength\n↓\nStock trend\n↓\nRelative strength\n↓\nBase\n↓\nVolume\n↓\nEntry\n↓\nStop\n↓\nPosition size\n↓\nExit", "If an early link is weak, the later ones cannot fully compensate. If all are strong, the odds improve, but are not guaranteed."),
                tb("What each link asks", ["Link", "Question", "Where covered"], [
                    ["Market regime", "Is the market supportive?", "Market Regime track"],
                    ["Sector", "Is the group leading?", "Sector rotation"],
                    ["Trend", "Is the stock in Stage 2 with aligned averages?", "Weinstein, Trend Template"],
                    ["Relative strength", "Is it a leader?", "Relative Strength track"],
                    ["Base", "Is supply absorbed?", "Chart Patterns"],
                    ["Volume", "Does participation confirm?", "Volume track"],
                    ["Entry", "Is the entry near the pivot and not extended?", "Breakouts, Pullbacks"],
                    ["Stop", "Where is the thesis wrong?", "Risk Management"],
                    ["Size", "How many shares for 1% risk?", "Position sizing"],
                    ["Exit", "What sells it?", "Trade Management"],
                ]),
                p("Using this chain avoids a common error: starting with a pretty chart and justifying it afterwards. Starting with the market and working down protects you from attractive setups in hostile conditions."),
                co("tip", "Practical use", "Print or keep the chain as a checklist. A trade that cannot answer every link should either be skipped or taken at reduced size."),
                co("warn", "Common mistake", "Strong in one link but weak elsewhere, for example a perfect chart during a market correction. A chain is only as strong as its weakest link."),
                takeaway("A complete setup runs from market to exit plan, in order. Each link adds evidence, and a weak link calls for reduced size or no trade."),
            ],
            [
                Q("Why start with the market regime rather than the stock chart?", [
                    "Because setups have different odds in different regimes, and starting from the market prevents justifying an attractive chart in a hostile environment",
                    "Because charts do not matter",
                    "Because the market determines exact prices",
                    "Because stocks are independent",
                ], 0, "The market sets the background odds. Evaluating it first avoids bias toward a favourite chart."),
                Q("A stock shows a perfect base but the market is in a correction. What does the chain suggest?", [
                    "Ignore the market and buy full size",
                    "A weak link calls for waiting or reduced size",
                    "Short the stock",
                    "Skip stops",
                ], 1, "A weak early link lowers the odds, even if later links are strong."),
            ]),

        L("ta-trading-setups-breakout-example", "Worked example: a breakout setup", 11,
            "A fictional case from market check to position size and management. Not a recommendation.",
            [
                co("warn", "Hypothetical example", "ABC Industries is a fictional company with invented numbers, used only to illustrate the process. It is not a real security or a recommendation."),
                h("1. Market and sector"),
                p("NIFTY 50 is above rising 50-day and 200-day averages. Midcap index is also in an uptrend, and about 62% of stocks are above their 50-day average. The sector index (Engineering) has a rising RS line versus the NIFTY, and several constituents are in Stage 2. Verdict: supportive."),
                h("2. Stock trend and relative strength"),
                p("ABC trades at ₹198 with SMA50 ₹185, SMA150 ₹168 and SMA200 ₹160 (rising). It is 7% below its 52-week high of ₹213 and 62% above its low. RS rating 88, Mansfield RS above zero and rising. All Trend Template criteria are met."),
                h("3. The base"),
                p("Over 12 weeks ABC formed a VCP: pullbacks of 18%, 9%, 5% and a final 3% tight pause. Volume in the last pause fell to 55% of the 50-day average. The pivot is ₹200 (the high of the last contraction)."),
                tb("The plan before the open", ["Item", "Value"], [
                    ["Pivot", "₹200"],
                    ["Buy zone", "₹200 to ₹206 (up to 3% above)"],
                    ["Planned entry", "₹201"],
                    ["Stop (below last contraction low ₹188)", "₹187"],
                    ["Risk per share", "₹14 (7.0%)"],
                    ["Account", "₹10,00,000; risk 1% = ₹10,000"],
                    ["Position size", "₹10,000 ÷ ₹14 ≈ 714 shares"],
                    ["Position value", "≈ ₹1,43,500 (14.4% of the account)"],
                    ["Target scenario", "Prior high ₹213, then a measured move toward ₹240"],
                    ["Reward/Risk", "To ₹240: 39 ÷ 14 ≈ 2.8R"],
                ]),
                h("4. The breakout day"),
                p("ABC opens at ₹199, trades above ₹200 mid-morning on rising volume and closes at ₹207, near the day’s high of ₹208. Volume is 2.4 times average. The entry at ₹201 was triggered by a buy-stop at the pivot. Close of ₹207 is 3.5% above the pivot, so the stock is now outside the buy zone for new buyers, but the existing position is fine."),
                h("5. Management"),
                ul(
                    "Stop stays at ₹187 until the stock holds and makes a new high.",
                    "After a retest holding ₹202 and a new high at ₹215, the stop moves to ₹201 (break-even) and then trails below higher lows.",
                    "Half of the position is sold at ₹236 (about +2.5R). The rest trails the 10-day EMA.",
                    "The remainder exits at ₹248 when the stock closes below the 10-day EMA on heavy volume."
                ),
                tb("Outcome in R (illustrative)", ["Part", "Shares", "Exit", "R"], [
                    ["First half", "357", "₹236", "+2.5R"],
                    ["Second half", "357", "₹248", "+3.4R"],
                    ["Total", "714", "", "average ≈ +2.9R, about ₹29,300"],
                ]),
                co("key", "What the example teaches", "Every number was set before entry: pivot, stop, size, targets and exit rules. The process works even though the outcome is not guaranteed. The same setup in another case could stop out at −1R."),
                takeaway("A complete breakout trade has a market check, a stock qualification, a pivot, a stop, a size and an exit plan, all written before entry."),
            ],
            [
                Q("Entry ₹201, stop ₹187, risk ₹10,000. How many shares (approximately)?", [
                    "500",
                    "714",
                    "1,000",
                    "1,430",
                ], 1, "Risk per share = ₹14. 10,000 ÷ 14 ≈ 714 shares."),
                Q("Why were the pivot, stop, size and exit rules written before the open?", [
                    "So decisions are made calmly, not during price movement, which reduces emotional errors",
                    "Because the broker requires it",
                    "To guarantee a profit",
                    "To avoid volume",
                ], 0, "Pre-defined plans remove improvisation during stress."),
                Q("The stock closes 3.5% above the pivot on breakout day. What does that mean for a new buyer?", [
                    "It is still inside the 3% buy zone",
                    "It is slightly beyond the buy zone, so a new entry carries more extension risk",
                    "It is a gap down",
                    "Nothing",
                ], 1, "Beyond the zone, reward/risk worsens for new buyers, though an existing position is managed normally."),
            ]),

        L("ta-trading-setups-pullback-example", "Worked example: a pullback setup", 10,
            "A fictional continuation entry at a rising average. Compare its risk profile with the breakout.",
            [
                co("warn", "Hypothetical example", "XYZ Technologies is fictional and its numbers are invented for illustration. This is not a recommendation."),
                h("1. Market and sector"),
                p("The NIFTY is in an uptrend. IT sector RS line is rising. Verdict: supportive."),
                h("2. Stock context"),
                p("XYZ broke out of a base at ₹300 five weeks ago and ran to ₹372 (+24%) with strong volume. It then pulled back for seven sessions to ₹348 on volume 40% below average, touching its rising 50-day average (₹346). RS line stays near highs, and the structure shows a higher low versus the earlier ₹310 swing low. Weekly: price above a rising 10-week average."),
                h("3. Signal"),
                p("On day eight XYZ forms a small hammer-like candle with a low of ₹344, closes at ₹354 in the upper half of its range on volume 20% above the previous day. The next morning it trades above the signal candle’s high of ₹355."),
                tb("The plan", ["Item", "Value"], [
                    ["Entry", "₹356 (above signal high)"],
                    ["Stop", "₹341 (below the signal low and 50-day average)"],
                    ["Risk per share", "₹15 (4.2%)"],
                    ["Account", "₹10,00,000; risk 1% = ₹10,000"],
                    ["Size", "10,000 ÷ 15 ≈ 666 shares (₹2,37,000, about 24% of the account)"],
                    ["Concentration cap", "Cap at 20% = ₹2,00,000 ≈ 560 shares"],
                    ["Target scenario", "Retest of ₹372 high, then a breakout toward ₹400"],
                    ["Reward/Risk", "To ₹372: 16 ÷ 15 ≈ 1.1R; to ₹400: 44 ÷ 15 ≈ 2.9R"],
                ]),
                p("Notice the concentration cap: the risk-based size (666 shares) would exceed 20% of the account, so the position is capped at 560 shares, risking about ₹8,400 (0.84% of the account). The cap overrides the risk formula."),
                h("Comparison with a breakout"),
                tb("Breakout versus pullback", ["Feature", "Breakout (ABC)", "Pullback (XYZ)"], [
                    ["Entry", "At the pivot, with momentum", "At support, with a signal candle"],
                    ["Stop distance", "7.0%", "4.2%"],
                    ["Reward to first target", "Larger (new highs possible)", "Smaller (return to prior high)"],
                    ["Failure sign", "Close back below pivot", "Close below the average and signal low"],
                    ["Market dependence", "High", "High"],
                ]),
                co("tip", "Practical use", "Pullback entries often have tighter stops but less obvious reward to the first target. Their value is greatest when a breakout above the prior high is likely."),
                takeaway("A pullback setup has a tight, structural stop, but the reward to the first target can be modest. Check concentration and reward/risk before acting."),
            ],
            [
                Q("Risk-based size is 666 shares (₹2,37,000), but the concentration cap is 20% of ₹10,00,000. What is the position?", [
                    "666 shares",
                    "About 560 shares, because the cap overrides the formula",
                    "1,000 shares",
                    "No trade is possible",
                ], 1, "20% of ₹10,00,000 = ₹2,00,000. 2,00,000 ÷ 356 ≈ 560 shares, which risks less than 1%."),
                Q("Why can a pullback entry have a tighter stop than a breakout?", [
                    "The entry is at a support level with a nearby invalidation point, so the stop sits close below it",
                    "Because pullbacks have no risk",
                    "Because volume is higher",
                    "Because pullbacks gap up",
                ], 0, "At support, the thesis is wrong if price drops a short distance below, so the structural stop is nearer."),
            ]),

        L("ta-trading-setups-failure-example", "Worked example: a failed breakout", 9,
            "What it looks like when the thesis fails, and why a small loss is the plan working.",
            [
                co("warn", "Hypothetical example", "PQR Engineering is fictional. The numbers are invented to illustrate the process."),
                h("The setup"),
                p("PQR formed a 10-week flat base with a ₹250 pivot. It met Stage 2 and Trend Template conditions, RS rating 82. The market was neutral, with breadth slightly weakening. Plan: entry ₹251, stop ₹236 (below the base low), risk ₹15 per share. Risk 1% of ₹10,00,000 = ₹10,000, so size ≈ 666 shares."),
                h("What happened"),
                ol(
                    "**Day 1:** PQR breaks out to ₹258 intraday but closes at ₹253 with a long upper wick on volume of 1.3x average. The signal is mediocre.",
                    "**Day 2:** the stock gaps up slightly to ₹255 and fades to close at ₹248, back below the pivot, on 1.6x volume.",
                    "**Day 3:** the market falls 1.4%. PQR closes at ₹241 on 2.0x volume.",
                    "**Day 4:** the stock opens at ₹238 and trades to ₹235, hitting the ₹236 stop. The exit fills at ₹235."
                ),
                tb("Result", ["Item", "Value"], [
                    ["Entry", "₹251"],
                    ["Exit", "₹235"],
                    ["Loss per share", "₹16 (slightly more than the planned ₹15 due to slippage)"],
                    ["Loss", "666 × ₹16 ≈ ₹10,656 (about −1.07R, 1.07% of account)"],
                ]),
                h("What went right"),
                ul(
                    "The loss was close to the planned 1% despite slippage.",
                    "The warning signs were visible earlier: mediocre breakout volume and a close below the pivot on Day 2. A trader whose plan said “exit on a close back below the pivot on above-average volume” would have exited at about ₹248 for a −0.2R loss.",
                    "The account was preserved for the next setup."
                ),
                h("What to review"),
                p("In the journal: was the market warning visible (weakening breadth)? Was the breakout volume below the ideal level? Would a rule such as “do not add size when the market is neutral” or “exit on a close below the pivot” have improved the result? A failed trade is data, not a verdict."),
                co("key", "The lesson", "A good process still produces losses. A loss of about 1R from a valid setup is a cost of doing business. A large loss from ignoring the plan is the actual damage."),
                takeaway("A failed breakout handled by the plan costs about 1R or less. Review the signs, refine the rules and move on."),
            ],
            [
                Q("Which exit rule would have reduced the loss in this example?", [
                    "Exit on a close back below the pivot on above-average volume",
                    "Never use stops",
                    "Average down at ₹240",
                    "Wait for a bounce",
                ], 0, "Day 2 closed back below ₹250 on 1.6x volume. Exiting there would have lost roughly ₹3 per share rather than ₹16."),
                Q("The loss was slightly above 1R because of slippage. What does this show?", [
                    "Stops can fill slightly worse than planned, so sizing should account for some slippage",
                    "The stop did not work",
                    "Risk is zero",
                    "Stops are unnecessary",
                ], 0, "Fast moves and gaps can produce worse fills. Planning for modest slippage is part of risk management."),
                Q("How should a failed trade be treated after the exit?", [
                    "Ignored",
                    "Reviewed in the journal for signs missed and for rule improvements, without assuming the process is wrong",
                    "Used as a reason to double the next size",
                    "Deleted",
                ], 1, "Losses carry information. Review separates a bad outcome from a bad decision."),
            ]),
    ],
};

/* ════════════════════════════════════════════════════════════════════════
   TRACK 17 — Backtesting and Systematic Trading
   ════════════════════════════════════════════════════════════════════════ */
const TA_BACKTESTING = {
    id: "ta-backtesting",
    title: "Backtesting and Systematic Trading",
    blurb: "Test an idea on history without fooling yourself: biases, overfitting, performance metrics and turning a trading idea into rules.",
    lessons: [
        L("ta-backtesting-what-is", "What is a backtest?", 8,
            "A backtest applies exact rules to past data to see how they would have performed. It is evidence, not proof.",
            [
                p("A **backtest** simulates a trading strategy on historical data. Instead of asking “does this look like it works?”, you ask “what would have happened if I had followed these exact rules?”."),
                h("What a backtest needs"),
                tb("Components of a rule-based strategy", ["Component", "Question it answers", "Example"], [
                    ["Universe", "Which stocks are eligible?", "NSE stocks with average turnover above ₹5 Cr"],
                    ["Entry rule", "Exactly when do we buy?", "Close above the 20-day high with relative volume ≥ 1.5, Trend Template met"],
                    ["Stop rule", "Where is the loss capped?", "Below the 10-day low, maximum 8% below entry"],
                    ["Exit rule", "Exactly when do we sell?", "Close below the 10-week average, or stop hit"],
                    ["Position sizing", "How many shares?", "1% of equity risk per trade, max 20% in one stock"],
                    ["Costs", "What does trading cost?", "Brokerage, taxes, impact and slippage"],
                    ["Portfolio rules", "How many positions at once?", "Max 8 open positions, max 25% per sector"],
                ]),
                h("Costs and slippage"),
                p("Backtests that ignore costs overstate results. Each trade has brokerage, STT, exchange fees and **slippage**: the difference between the price you expected and the price you got. High-turnover strategies and illiquid stocks are especially sensitive. Test with conservative cost assumptions."),
                h("What a backtest can and cannot tell you"),
                ul(
                    "**Can:** show whether the rules had a positive expectancy in the past sample, how big losing streaks and drawdowns were, and how sensitive results are to parameters.",
                    "**Cannot:** guarantee that future results will resemble the past. Markets change, and your data may be flawed."
                ),
                co("warn", "Common mistake", "Backtesting a vague idea like “buy strong breakouts” by looking at charts. If you cannot write the rules so that another person gets the same trades, it is not a backtest. It is a story."),
                takeaway("A backtest applies precise, complete rules including costs to historical data. It is evidence about an idea, with limits, not proof about the future."),
            ],
            [
                Q("Which description is a rule-based strategy suitable for backtesting?", [
                    "Buy strong stocks that look good",
                    "Buy when the close exceeds the 20-day high, relative volume ≥ 1.5 and Trend Template is met; stop below the 10-day low; exit on close below the 10-week average",
                    "Buy when I feel confident",
                    "Follow the news",
                ], 1, "Only explicit rules can be replicated and tested objectively."),
                Q("Why include slippage and costs in a backtest?", [
                    "Ignoring them overstates results, especially for active strategies and illiquid stocks",
                    "They do not matter",
                    "They always improve results",
                    "They are optional for all strategies",
                ], 0, "Real trading has frictions. Results without them can be misleadingly good."),
            ]),

        L("ta-backtesting-lookahead", "Look-ahead bias", 8,
            "Using information that was not available at the time of the decision. A subtle error that can make bad strategies look brilliant.",
            [
                p("**Look-ahead bias** occurs when a backtest uses information that would not have been known at the moment of the trade."),
                h("Examples"),
                tb("Common look-ahead errors", ["Error", "Why it is wrong"], [
                    ["Entering at the day’s low or the exact breakout price using the full day’s data", "You do not know the day’s low until the day ends"],
                    ["Using today’s close to decide to buy at today’s open", "The close happens after the open"],
                    ["Using the 52-week high computed including today when deciding at the open", "Today’s high was unknown at the open"],
                    ["Using financial results before they were announced", "The data was not public yet"],
                    ["Using an RS rating calculated with data up to a later date", "The rating would have been different at the time"],
                    ["Adjusting for later splits incorrectly or using today’s index membership", "Uses knowledge from the future"],
                ]),
                h("How to avoid it"),
                ul(
                    "Decide signals using only data available **before** the trade. For example, a signal at today’s close executes at tomorrow’s open or tomorrow’s trigger.",
                    "Lag any derived indicators properly.",
                    "Use point-in-time data for fundamentals and index constituents where possible.",
                    "Check suspiciously good results: ask “what did I know at that time?”"
                ),
                p("Example: a rule “buy when the stock breaks above its 20-day high” tested using daily bars. If the backtest buys at the 20-day high exactly on any day when the high exceeded it, it assumes perfect execution at the trigger price, even though gaps can open far above it. A realistic test would use the gap-up open as the entry when price opens above the trigger."),
                co("key", "The test", "For every input, ask: at the moment of this decision, would I have had this number? If not, the test is contaminated."),
                co("warn", "Common mistake", "Believing results that look too good. A strategy with a 90% win rate and tiny drawdowns usually has a data or timing error."),
                takeaway("Look-ahead bias uses future information. Make signals depend only on data available at decision time, and execute with realistic fills."),
            ],
            [
                Q("A backtest buys at today’s low whenever the day’s range touched a signal. What is the problem?", [
                    "You cannot know the day’s low until the day ends, so the fill is unrealistic",
                    "It is correct",
                    "Lows do not exist",
                    "It removes costs",
                ], 0, "Using the full day’s data to pick a fill is look-ahead. A real order cannot target the unknown low."),
                Q("A breakout rule buys at the 20-day high price. On a day the stock gaps up 5% above that price at the open, what should a realistic test assume?", [
                    "Execution at the 20-day high anyway",
                    "Execution near the gap-up open price, not at the trigger",
                    "No trade at all, always",
                    "Execution at the next day’s low",
                ], 1, "Gaps skip prices. Real fills occur at the first available price beyond the trigger."),
            ]),

        L("ta-backtesting-survivorship", "Survivorship bias", 7,
            "Testing only on companies that still exist today produces flattering results.",
            [
                p("**Survivorship bias** occurs when a test includes only stocks that survived to the present and excludes those that were delisted, merged, suspended or went bankrupt."),
                h("Why it matters"),
                p("Suppose you test a strategy on today’s NIFTY 500 constituents going back ten years. Stocks that collapsed, were demoted from the index or delisted are missing, while today’s winners are overrepresented. The result looks better than what a trader could have actually achieved, because at the time, you could not know which stocks would succeed."),
                tb("Survivorship bias in practice", ["Biased test", "Better test"], [
                    ["Today’s index members only", "Index constituents as they were at each past date"],
                    ["Stocks with full price history to today", "Include delisted and suspended stocks"],
                    ["Ignoring stocks that dropped off lists", "Treat delisting as a loss, with realistic exit"],
                ]),
                p("Survivorship bias especially affects strategies that buy weak or beaten-down stocks, because many never recover. It also flatters strategies that hold through long drawdowns."),
                co("india", "Indian market note", "Small and mid caps have high churn: suspensions, delistings, and companies that stop trading. Point-in-time data matters even more here."),
                co("tip", "Practical use", "When you use a screen result history, ask whether the historical universe included stocks that no longer exist. If not, treat the numbers as optimistic."),
                takeaway("Survivorship bias hides failures, making tests look better than reality. Use point-in-time universes and include delisted stocks where possible."),
            ],
            [
                Q("Why is testing only on today’s index constituents misleading?", [
                    "It excludes stocks that failed or were removed, so results are too optimistic",
                    "It increases costs",
                    "It removes all winners",
                    "It uses too much data",
                ], 0, "At the time of trading you could not know which stocks would survive, but the biased test acts as though you did."),
                Q("Which strategy is most distorted by survivorship bias?", [
                    "Buying beaten-down stocks hoping for recovery",
                    "Buying only after confirmed new highs",
                    "Using stops",
                    "Trading index futures",
                ], 0, "Many beaten-down stocks never recover or are delisted, and a survivor-only test hides them."),
            ]),

        L("ta-backtesting-overfitting", "Overfitting", 9,
            "A strategy fitted to past noise will look perfect and fail in live trading.",
            [
                p("**Overfitting** (curve fitting) happens when rules are tuned so tightly to past data that they capture random noise rather than a real pattern. The result looks excellent in the test and disappoints live."),
                h("Common causes"),
                ul(
                    "**Too many conditions:** each additional filter fits the past better, but leaves fewer trades and less reliability.",
                    "**Parameter optimisation:** searching for the best moving-average length, stop percentage and volume threshold until the equity curve looks perfect.",
                    "**Many tests, one winner:** try 200 variations and the best one will look good by chance.",
                    "**Small samples:** 25 trades are too few to tell skill from luck."
                ),
                tb("Signs of overfitting", ["Sign", "Why it is a warning"], [
                    ["Results collapse when a parameter changes slightly", "The edge depends on a precise value, which is rarely real"],
                    ["Very many conditions with few trades", "Fitting noise with too little data"],
                    ["Great in-sample, poor out-of-sample", "The rules did not generalise"],
                    ["Rules with no logical rationale", "No reason they should work"],
                ]),
                h("Protecting against it"),
                ol(
                    "**Start from logic:** have a reason, such as supply and demand, why the rule should work.",
                    "**Keep rules simple,** with few parameters.",
                    "**Test parameter robustness:** results should stay decent across a range of values (for example 40, 50 and 60-day averages), not only one.",
                    "**Use out-of-sample data:** design on one period, test on another you did not touch.",
                    "**Use walk-forward testing:** repeatedly optimise on a window and test on the next.",
                    "**Require enough trades** for the conclusion (many dozens or hundreds).",
                    "**Paper or small-size forward test** before full commitment."
                ),
                co("key", "The principle", "A robust strategy performs reasonably across many nearby parameter values, many time periods and many stocks. A fragile one performs well only at one setting in one period."),
                co("warn", "Common mistake", "Treating the best backtest result as the true strategy performance. The best of many tries is biased upward. Expect worse live results."),
                takeaway("Overfitting fits noise. Keep rules simple, logical and robust across parameters, and validate on out-of-sample data and enough trades."),
            ],
            [
                Q("A strategy’s results collapse when the moving-average length changes from 47 to 50 days. What does this suggest?", [
                    "A robust edge",
                    "Fragility and probable overfitting: the result depends on a precise parameter",
                    "A great system",
                    "Nothing",
                ], 1, "Real edges tend to survive small parameter changes. A sharp dependence suggests fitted noise."),
                Q("What is out-of-sample testing?", [
                    "Testing on data not used to design or tune the rules",
                    "Testing only on the best period",
                    "Removing losing trades",
                    "Adding more indicators",
                ], 0, "Evaluating on unseen data checks whether the rules generalise."),
                Q("Why is the best of 200 tested variations likely to disappoint live?", [
                    "With many tries, one will look good by chance, so its performance is biased upward",
                    "Because 200 is too small",
                    "Because live markets are identical",
                    "Because it has too few conditions",
                ], 0, "Selection from many noisy results inflates the winner’s apparent quality."),
            ]),

        L("ta-backtesting-metrics", "Performance metrics", 12,
            "The numbers that describe a strategy: expectancy, profit factor, drawdown, CAGR and ratios. Each answers a different question.",
            [
                p("A single number never tells the full story. Use several metrics to understand returns, risk and reliability."),
                tb("Key metrics", ["Metric", "Meaning", "Question it answers"], [
                    ["Win rate", "Winning trades ÷ total trades", "How often does it win?"],
                    ["Average win", "Mean gain of winners", "How big are winners?"],
                    ["Average loss", "Mean loss of losers", "How big are losers?"],
                    ["Profit factor", "Gross profit ÷ gross loss", "How many rupees earned per rupee lost?"],
                    ["Expectancy", "Average result per trade", "What is a typical trade worth?"],
                    ["Maximum drawdown", "Largest peak-to-trough fall in equity", "How painful can it get?"],
                    ["CAGR", "Compound annual growth rate", "What yearly growth rate resulted?"],
                    ["Sharpe ratio", "Excess return ÷ volatility of returns", "Return per unit of volatility"],
                    ["Calmar ratio", "CAGR ÷ maximum drawdown", "Return per unit of worst drawdown"],
                    ["Number of trades", "Sample size", "How much can we trust the statistics?"],
                ]),
                fm("Expectancy", "Expectancy = (Win Rate × Average Win) − (Loss Rate × Average Loss)", "Express in rupees per trade, percent or R."),
                h("Numerical example"),
                p("A backtest has 100 trades. 40 are winners with an average win of ₹12,000, and 60 are losers with an average loss of ₹4,000."),
                tb("Worked numbers", ["Item", "Calculation", "Result"], [
                    ["Win rate", "40 ÷ 100", "40%"],
                    ["Gross profit", "40 × ₹12,000", "₹4,80,000"],
                    ["Gross loss", "60 × ₹4,000", "₹2,40,000"],
                    ["Net profit", "4,80,000 − 2,40,000", "₹2,40,000"],
                    ["Expectancy per trade", "(0.40 × 12,000) − (0.60 × 4,000) = 4,800 − 2,400", "₹2,400"],
                    ["Profit factor", "4,80,000 ÷ 2,40,000", "2.0"],
                    ["Payoff ratio", "12,000 ÷ 4,000", "3.0"],
                ]),
                fm("Other formulas", "CAGR = (Ending value ÷ Starting value)^(1 ÷ years) − 1\nMaximum drawdown = (Trough − Peak) ÷ Peak\nCalmar = CAGR ÷ |Max drawdown|\nSharpe = (Strategy return − Risk-free return) ÷ Standard deviation of returns", "Example: ₹10,00,000 grows to ₹18,00,000 in 4 years. CAGR = 1.8^(0.25) − 1 ≈ 15.8%. If the worst drawdown was 24%, Calmar ≈ 15.8 ÷ 24 ≈ 0.66."),
                h("Reading them together"),
                ul(
                    "A high win rate with a poor payoff ratio is fragile. A low win rate with a high payoff ratio requires patience.",
                    "A profit factor above about 1.5 after costs is usually considered decent, but depends on the sample.",
                    "A great CAGR with a 60% drawdown may be unlivable. Ask if you would keep trading through it.",
                    "A strategy with 20 trades has unreliable statistics, however good they look."
                ),
                co("warn", "Common mistake", "Choosing a strategy by CAGR alone. Compare it with drawdown, number of trades, costs and robustness."),
                takeaway("Use expectancy, profit factor, drawdown, CAGR, risk-adjusted ratios and sample size together. A good-looking single metric can hide fragility."),
            ],
            [
                Q("100 trades: 40 winners averaging ₹12,000 and 60 losers averaging ₹4,000. What is the expectancy per trade?", [
                    "₹1,200",
                    "₹2,400",
                    "₹4,800",
                    "₹8,000",
                ], 1, "(0.40 × 12,000) − (0.60 × 4,000) = 4,800 − 2,400 = ₹2,400."),
                Q("What is the profit factor of the same results?", [
                    "0.5",
                    "1.0",
                    "2.0",
                    "3.0",
                ], 2, "Gross profit ₹4,80,000 ÷ gross loss ₹2,40,000 = 2.0."),
                Q("Why can CAGR alone be a poor way to choose a strategy?", [
                    "It ignores drawdown, sample size and robustness, so a high CAGR can hide an unlivable risk profile",
                    "It is always wrong",
                    "It includes volume",
                    "It does not use time",
                ], 0, "Return must be judged against risk and reliability. Calmar and Sharpe help, but sample size and robustness still matter."),
            ]),

        L("ta-backtesting-rules", "From trading idea to rule-based strategy", 10,
            "Convert a vague preference into precise, testable rules.",
            [
                p("Most trading ideas begin as feelings: “I like strong breakouts.” A rule-based strategy replaces each vague word with a number or a yes/no test."),
                h("A translation exercise"),
                tb("From idea to rule", ["Vague idea", "Precise rule"], [
                    ["Strong stock", "Trend Template criteria met and RS rating ≥ 80"],
                    ["Near highs", "Close within 10% of the 52-week high"],
                    ["Breakout", "Close above the highest high of the previous 20 sessions"],
                    ["With volume", "Volume ≥ 1.5 × the 50-day average volume"],
                    ["Not extended", "Close no more than 3% above the 20-day high"],
                    ["Good market", "NIFTY 50 close above its 50-day average and 50-day above 200-day"],
                    ["Cut losses", "Initial stop at the lower of the 10-day low and 8% below entry"],
                    ["Let winners run", "Exit when the close is below the 10-week average, or stop is hit"],
                    ["Risk small", "Risk 1% of equity per trade; max position 20%; max 8 positions"],
                ]),
                p("Each row removes judgement. Two people running these rules on the same data should produce the same trades."),
                h("A development process"),
                ol(
                    "**Idea and rationale:** why should this work (supply and demand, momentum, behaviour)?",
                    "**Write rules** completely, including universe, entry, exit, size and costs.",
                    "**Backtest** on one period.",
                    "**Check robustness** across parameters and sub-periods.",
                    "**Validate** on out-of-sample data.",
                    "**Forward test** with small size and compare live results with expectations.",
                    "**Monitor** performance and drawdown versus the backtest, and define when to pause."
                ),
                co("india", "TradeEdge application", "TradeEdge screens already implement many of these rules (for example the Fresh Breakout screen and Trend Template). Understanding the rules behind a screen lets you judge whether its results fit your plan."),
                co("warn", "Common mistake", "Adding discretionary exceptions in live trading (“this one looks different”). If exceptions are common, the rules are incomplete. Record them in the journal and revise the rules, rather than breaking them case by case."),
                co("tip", "Practical use", "Keep strategy rules in one page. If it takes ten pages to describe, it is probably overfit or unclear."),
                takeaway("A rule-based strategy replaces vague words with numbers and yes/no tests, then is tested, validated out of sample, forward tested and monitored."),
            ],
            [
                Q("Which pair converts a vague phrase into a precise rule?", [
                    "“Strong volume” → “Volume I like”",
                    "“Strong volume” → “Volume ≥ 1.5 × the 50-day average”",
                    "“Near highs” → “Looks high”",
                    "“Cut losses” → “Sell when worried”",
                ], 1, "Precise rules use measurable conditions so results can be replicated."),
                Q("Why record discretionary exceptions in a journal instead of just making them?", [
                    "Frequent exceptions show the rules are incomplete, and recording them lets you refine the rules rather than drift",
                    "Because journals prevent losses",
                    "Because exceptions are illegal",
                    "Because it hides mistakes",
                ], 0, "Tracking exceptions turns improvisation into data to improve the system."),
            ]),
    ],
};

/* ════════════════════════════════════════════════════════════════════════
   TRACK 18 — Trading Psychology and Execution
   ════════════════════════════════════════════════════════════════════════ */
const TA_PSYCHOLOGY = {
    id: "ta-psychology",
    title: "Trading Psychology and Execution",
    blurb: "Why capable traders break their own rules, and the habits that keep decisions mechanical: accepting small losses and keeping a journal.",
    lessons: [
        L("ta-psychology-rules", "Why traders break their own rules", 9,
            "The hardest part of trading is not analysis. It is doing what the plan says when your emotions say otherwise.",
            [
                p("Most traders know the rules: cut losses, size properly, follow the plan. Most still break them. The gap between knowing and doing is psychological."),
                tb("Common psychological traps", ["Trap", "What it feels like", "What it causes"], [
                    ["Fear", "Anxiety after losses; hesitation at valid entries", "Missed trades, exiting winners too early"],
                    ["Greed", "Wanting more than the plan allows", "Oversizing, holding past targets, not taking profit"],
                    ["FOMO", "Fear of missing out as a stock runs", "Chasing extended entries"],
                    ["Revenge trading", "Anger after a loss; need to “win it back”", "Larger, lower-quality trades"],
                    ["Loss aversion", "Losses feel about twice as painful as equal gains feel good", "Holding losers, selling winners early"],
                    ["Confirmation bias", "Looking only for evidence that supports your view", "Ignoring warning signs"],
                    ["Overconfidence", "A winning streak feels like skill", "Larger size, looser rules"],
                ]),
                h("The disposition effect"),
                p("Research finds that investors tend to sell winners too soon and hold losers too long. It is the behavioural mirror of the rule “cut losses and let winners run”. Rules and written plans exist to counter it."),
                h("Making discipline easier"),
                ul(
                    "**Decide in advance:** write entry, stop, size and exit before the trade. Execution becomes following instructions.",
                    "**Use orders:** stop orders and alerts reduce the need for in-the-moment decisions.",
                    "**Limit risk per trade** so no single loss triggers panic.",
                    "**Reduce size after losses** instead of increasing it.",
                    "**Take breaks** after a series of losses or after an emotional trade."
                ),
                co("key", "The principle", "You cannot remove emotion. You can design a process where emotion has less influence."),
                co("warn", "Common mistake", "Believing a better indicator will fix emotional errors. Rule-breaking happens with any system."),
                takeaway("Fear, greed, FOMO, revenge trading, loss aversion and bias push traders away from their plans. Pre-defined rules, orders and small risk reduce their influence."),
            ],
            [
                Q("What is the disposition effect?", [
                    "Selling winners too early and holding losers too long",
                    "Holding winners and selling losers",
                    "Buying only at lows",
                    "Trading only with orders",
                ], 0, "It is a behavioural tendency documented among investors, and it works against good risk management."),
                Q("Why use stop orders and written plans?", [
                    "They turn decisions into pre-agreed actions, reducing in-the-moment emotional influence",
                    "They guarantee profit",
                    "They remove all losses",
                    "They eliminate slippage",
                ], 0, "Discipline is easier when the decision has already been made."),
            ]),

        L("ta-psychology-fomo", "FOMO and chasing", 8,
            "Buying a stock far above its proper entry can destroy risk/reward before the trade begins.",
            [
                p("**FOMO** (fear of missing out) is the urge to buy because a stock is rising and you are not in it. It shows up as buying at the high of the day, buying after a gap, or buying a breakout that was missed yesterday."),
                h("The mathematics of chasing"),
                tb("Same stock, different entries (stop fixed at ₹187, target ₹240)", ["Entry", "Risk per share", "Reward", "Reward/Risk"], [
                    ["₹201 (at the pivot)", "₹14", "₹39", "2.8R"],
                    ["₹210 (4.5% above)", "₹23", "₹30", "1.3R"],
                    ["₹220 (9.5% above)", "₹33", "₹20", "0.6R"],
                ]),
                p("The stock, stop and target are the same. Only the entry changed. Reward/risk fell from 2.8R to 0.6R. If you must keep the same rupee risk, you buy fewer shares, and potential profit shrinks. If you keep the same size, your risk rises."),
                h("How to handle it"),
                ul(
                    "**Define the buy zone in advance** and skip anything beyond it.",
                    "**Remember the next setup:** there are always new bases and pullbacks. Missing one trade costs nothing; chasing it can.",
                    "**Wait for a pullback or a new base** if the stock gets extended.",
                    "**Track missed trades** to see that most extended entries offered worse outcomes than waiting."
                ),
                co("tip", "Practical use", "Set an alert at the pivot and an upper alert at the end of the buy zone. If the upper alert triggers first, close the chart and move on."),
                co("warn", "Common mistake", "Justifying a chase because the stock is strong. Strength is not the issue. Price relative to your stop is."),
                takeaway("Chasing worsens reward/risk: the stock and stop stay the same while your entry moves away. Use a pre-defined buy zone and wait for the next setup instead."),
            ],
            [
                Q("Stop ₹187, target ₹240. What is reward/risk if you enter at ₹220 instead of ₹201?", [
                    "It rises",
                    "It falls from about 2.8R to about 0.6R",
                    "It stays the same",
                    "It becomes negative infinity",
                ], 1, "At ₹220, risk is ₹33 and reward ₹20, which gives 0.6R. The chased entry destroys the trade’s asymmetry."),
                Q("What practical tool prevents impulsive chasing?", [
                    "A pre-defined buy zone with an upper alert, beyond which the trade is skipped",
                    "Larger size",
                    "Ignoring the stop",
                    "Trading more stocks",
                ], 0, "A pre-decided limit removes the choice in the moment."),
            ]),

        L("ta-psychology-small-losses", "Accepting small losses", 8,
            "A controlled loss is a business expense, not a failure.",
            [
                p("A **small, controlled loss** is the cost of searching for winners. No strategy wins every time. What destroys accounts is not small losses but large ones that grew because the trader refused to accept them."),
                co("key", "Reframe", "A controlled loss is a business expense, not a failure."),
                h("Why it is hard"),
                ul(
                    "Losses hurt more than equal gains please (loss aversion).",
                    "Selling makes the loss real, so holding keeps hope alive.",
                    "Ego attaches to being right about the stock."
                ),
                h("The arithmetic of loss"),
                fm("Gain needed to recover a loss", "Required gain = Loss ÷ (1 − Loss)", "A 10% loss needs +11.1%. A 25% loss needs +33%. A 50% loss needs +100%."),
                tb("Recovery table", ["Loss", "Gain to recover"], [
                    ["5%", "5.3%"],
                    ["10%", "11.1%"],
                    ["20%", "25%"],
                    ["30%", "42.9%"],
                    ["50%", "100%"],
                    ["70%", "233%"],
                ]),
                p("A trader taking 1R losses of 1% of equity can lose ten in a row and be down about 9.6%, then recover with a 10.6% gain. A trader who lets one loss reach 50% needs a 100% gain. Small losses protect the ability to keep trading."),
                h("Practices that help"),
                ol(
                    "Use stop orders where possible so exit is automatic.",
                    "Record the loss in R, without commentary on yourself.",
                    "Review whether the rules were followed, not just the outcome.",
                    "Celebrate rule-following, including when the result is a small loss."
                ),
                co("warn", "Common mistake", "Evaluating decisions only by outcomes. A trade that followed the rules and lost was a good decision. A trade that broke the rules and won was a bad one that got lucky."),
                takeaway("Small losses are costs of doing business. Losses compound against you, so keep them small, automate exits when possible, and judge your process by rule-following rather than outcome."),
            ],
            [
                Q("What gain is needed to recover from a 50% loss?", [
                    "50%",
                    "75%",
                    "100%",
                    "200%",
                ], 2, "A 50% loss requires doubling the remaining capital, a 100% gain."),
                Q("A trader follows every rule and takes a −1R loss. How should it be classified?", [
                    "A bad decision",
                    "A good decision with a normal bad outcome",
                    "A system failure",
                    "A mistake",
                ], 1, "Process quality is separate from result in any single trade."),
            ]),

        L("ta-psychology-journal", "The trading journal", 9,
            "A journal turns experience into data. It is the feedback loop that improves the process.",
            [
                p("Memory is unreliable. After a few weeks, you remember best the dramatic trades and forget the ordinary ones. A **trading journal** records each trade objectively so you can learn from patterns instead of anecdotes."),
                h("What to record"),
                tb("Journal fields", ["Field", "Why it matters"], [
                    ["Date, stock", "Basic identification"],
                    ["Setup type", "Breakout, pullback, reclaim: shows which setups work for you"],
                    ["Market regime", "Reveals how results vary with conditions"],
                    ["Entry, stop, position size", "Defines planned risk"],
                    ["Risk (₹ and % of account)", "Checks adherence to risk rules"],
                    ["Exit price and reason", "Shows whether exits followed rules"],
                    ["Result in R", "Standardises comparison across trades"],
                    ["Mistake (if any)", "Flags rule violations"],
                    ["Lesson", "One sentence to improve"],
                    ["Screenshot", "Preserves the chart context as you saw it"],
                ]),
                h("What to review"),
                ul(
                    "**Weekly:** were rules followed? Which mistakes repeated?",
                    "**Monthly:** results by setup type and market regime; average winner and loser in R; win rate.",
                    "**Quarterly:** is the strategy behaving as tested? Should size or selectivity change?"
                ),
                p("After 50 to 100 trades, patterns often show clearly, such as breakouts in weak markets losing consistently, or early exits cutting the average winner."),
                co("india", "TradeEdge application", "TradeEdge’s Trading Journal lets you log trades, track partial sells and see analytics such as win rate and P&L over time. Use it consistently, and add notes about setup and mistakes where possible."),
                co("warn", "Common mistake", "Logging only results and not reasons. Without setup, regime and mistake fields, a journal tells you what happened but not why."),
                co("tip", "Practical use", "Take a screenshot at entry and at exit. Reviewing the chart you actually saw avoids hindsight bias."),
                takeaway("A journal records each trade’s setup, regime, risk, exit, result in R, mistakes and lessons. Regular reviews turn experience into measurable improvement."),
            ],
            [
                Q("Why record the result in R rather than only in rupees?", [
                    "R standardises results across different position sizes, making trades comparable",
                    "Because rupees are not allowed",
                    "Because R guarantees profit",
                    "Because R hides losses",
                ], 0, "A ₹10,000 gain may be 1R or 5R depending on risk. R shows quality independent of size."),
                Q("What is the main benefit of recording the market regime for each trade?", [
                    "You can see how setups perform in different conditions and adjust selectivity",
                    "It makes the journal longer",
                    "It predicts the next trade",
                    "It reduces costs",
                ], 0, "Performance often varies strongly with market conditions, which only shows if regime is recorded."),
            ]),
    ],
};

/* ════════════════════════════════════════════════════════════════════════
   TRACK 19 — Advanced TradeEdge Technical Analysis Framework
   ════════════════════════════════════════════════════════════════════════ */
const TA_TRADEEDGE_FRAMEWORK = {
    id: "ta-tradeedge-framework",
    title: "TradeEdge Technical Analysis Framework",
    blurb: "A single synthesis: scorecard, screen-to-trade workflow, final checklist and your own written trading plan.",
    lessons: [
        L("ta-tradeedge-framework-overview", "The TradeEdge technical framework", 9,
            "Ten layers of evidence, from the market to risk management, combined into one repeatable decision process.",
            [
                p("This framework brings together everything in the course. It does not predict. It organises evidence so each decision is explicit."),
                fm("The layers", "Market Regime\n+ Sector Strength\n+ Weinstein Stage\n+ Trend Template\n+ Relative Strength\n+ Price Structure\n+ Base Pattern\n+ Volume\n+ Breakout / Pullback\n+ Risk Management", "Each layer removes a different kind of weak trade."),
                tb("Layer by layer", ["Layer", "Question", "Evidence", "TradeEdge tool"], [
                    ["Market regime", "Is the market supportive?", "Index trend, breadth, distribution", "Market Breadth tab"],
                    ["Sector strength", "Is the group leading?", "Sector RS, rotation", "Sector Rotation module"],
                    ["Weinstein stage", "Is the stock in Stage 2?", "30-week MA, price, RS", "Watchlist stage, Stage 2 Early screen"],
                    ["Trend Template", "Are averages and highs/lows aligned?", "Eight criteria", "Minervini and 7-of-8 screens"],
                    ["Relative strength", "Is it a leader?", "RS rating, Mansfield RS", "RS screens, chart previews"],
                    ["Price structure", "HH/HL intact? Key levels clear?", "Chart reading", "Charts"],
                    ["Base pattern", "Is supply absorbed?", "Tightness, depth, duration", "Leadership Tight Base"],
                    ["Volume", "Does participation confirm?", "Dry-up, surge, close location", "Volume breakout screens"],
                    ["Breakout / pullback", "Is entry valid and not extended?", "Pivot, buy zone, support", "Fresh Breakout, Weekly Breakout Soon, pullback screens"],
                    ["Risk management", "Stop, size, reward/risk", "Plan and rules", "Trading Journal"],
                ]),
                co("tip", "Using the framework", "Work top-down. If the market is hostile, reduce exposure and selectivity. If the stock fails Stage or Trend, stop. Only stocks that pass all layers reach the entry and sizing decision."),
                co("warn", "Not a prediction", "A stock that satisfies every layer still has a meaningful chance of failing. The framework raises the quality of candidates and defines risk. It does not eliminate uncertainty."),
                takeaway("The framework stacks ten layers of evidence from the market to risk management. It improves selection and discipline, but cannot guarantee any single outcome."),
            ],
            [
                Q("What is the main purpose of the TradeEdge technical framework?", [
                    "To predict outcomes with certainty",
                    "To organise evidence so each decision is explicit, improving selection and discipline",
                    "To remove stop losses",
                    "To avoid using charts",
                ], 1, "It is a decision-support structure, not a prediction engine."),
                Q("Why work top-down from the market to the stock?", [
                    "So a hostile market or a failed trend check stops weak trades before they reach the entry decision",
                    "Because stocks are independent of markets",
                    "Because it makes charts unnecessary",
                    "Because it is shorter",
                ], 0, "Early layers filter out trades with poor odds, avoiding attractive-looking but ill-timed setups."),
            ]),

        L("ta-tradeedge-framework-scorecard", "The scorecard", 9,
            "A simple scoring grid to compare candidates and identify weak links. A decision aid, not a model.",
            [
                p("A scorecard puts the layers on a common scale so you can compare setups and spot weak links quickly."),
                tb("TradeEdge scorecard", ["Component", "What a high score means", "Score"], [
                    ["Market regime", "Index above rising averages; healthy breadth; leaders working", "/10"],
                    ["Sector strength", "Sector RS rising; several stocks in Stage 2", "/10"],
                    ["Trend", "Stage 2; Trend Template met; averages aligned and rising", "/10"],
                    ["Relative strength", "High RS rating; RS line near highs; Mansfield RS positive", "/10"],
                    ["Base quality", "Tight, orderly, adequate duration, supply absorbed", "/10"],
                    ["Volume", "Dry-up in base; surge on breakout; supportive closes", "/10"],
                    ["Breakout quality", "Clean pivot, strong close, inside buy zone, follow-through", "/10"],
                    ["Risk/reward", "Logical stop, reward/risk of 3R or better, size within limits", "/10"],
                ]),
                h("How to use it"),
                ol(
                    "Score each component honestly from 0 to 10, based on written criteria.",
                    "Add them up (maximum 80).",
                    "**Look at the minimum, not only the total.** A 9 in everything except a 3 in market regime should give pause.",
                    "Define thresholds in advance, for example “trade only if total ≥ 60 and no component below 5”.",
                    "Record the score in the journal and later compare it with outcomes."
                ),
                p("Example: DEF Ltd (fictional): market 7, sector 8, trend 9, RS 8, base 7, volume 6, breakout 7, risk/reward 6 = 58. Under a threshold of 60, the setup is skipped or taken smaller. Volume and risk/reward are the weak links. A better entry or a tighter base could change the score."),
                co("key", "A decision aid, not a model", "The score is not a probability and has no proven predictive power by itself. Its value is consistency: it forces the same questions every time and reveals the weakest link."),
                co("warn", "Common mistake", "Fudging scores to justify a stock you like. Write the scoring rules down and score before you look at the chart’s appeal."),
                co("tip", "Practical use", "After 50 or more trades, compare scores with results in R. If high scores do not do better, revise the criteria."),
                takeaway("A scorecard standardises evaluation and highlights weak links. Use total and minimum thresholds set in advance, and test them against your own results."),
            ],
            [
                Q("DEF scores market 7, sector 8, trend 9, RS 8, base 7, volume 6, breakout 7, risk/reward 6. What is the total?", [
                    "54",
                    "56",
                    "58",
                    "60",
                ], 2, "7 + 8 + 9 + 8 + 7 + 6 + 7 + 6 = 58."),
                Q("Why examine the lowest component, not only the total?", [
                    "A strong total can hide a critical weak link, such as a hostile market",
                    "Totals are meaningless",
                    "The lowest score is always the best",
                    "Because components are random",
                ], 0, "A single poor layer can dominate the risk even when others are strong."),
                Q("What best describes the scorecard’s status?", [
                    "A probability forecast",
                    "A decision-support framework whose value is consistency, to be validated against your own results",
                    "A guarantee",
                    "A replacement for risk management",
                ], 1, "It does not predict, but it standardises analysis."),
            ]),

        L("ta-tradeedge-framework-workflow", "From screen to trade", 9,
            "The complete workflow, from screening to journal review.",
            [
                p("Here is the end-to-end workflow, which you can adapt to your own style."),
                fm("Workflow", "Screen\n↓\nShortlist\n↓\nOpen chart\n↓\nAnalyse structure\n↓\nCheck market / sector\n↓\nValidate setup\n↓\nDefine entry\n↓\nDefine stop\n↓\nCalculate position size\n↓\nExecute\n↓\nJournal\n↓\nReview", "Most of the work happens before the order is placed."),
                tb("What happens at each step", ["Step", "Action"], [
                    ["Screen", "Run TechLens screens (for example Trend Template, Fresh Breakout, Leadership Tight Base)"],
                    ["Shortlist", "Remove illiquid names; keep a manageable list (5 to 15)"],
                    ["Open chart", "Weekly first for stage and trend, then daily"],
                    ["Analyse structure", "Check HH/HL, key levels, base shape, volume pattern"],
                    ["Check market/sector", "Regime and sector RS supportive?"],
                    ["Validate setup", "Score it; confirm no major weak link"],
                    ["Define entry", "Pivot, buy zone, trigger and alert"],
                    ["Define stop", "Structural level and maximum risk"],
                    ["Calculate size", "Capital at risk ÷ risk per share, then check concentration and liquidity"],
                    ["Execute", "Place the order and the stop; avoid chasing"],
                    ["Journal", "Log setup, regime, plan and screenshot"],
                    ["Review", "After exit, record result in R, mistakes and lesson"],
                ]),
                h("Time allocation"),
                p("Do the analysis outside market hours, when you are calm. During the session, your task is mostly to follow the plan: alerts trigger, orders execute, stops protect. Analysis done in the heat of price movement tends to be worse."),
                co("tip", "Daily routine", "Evenings: review open positions, update stops, run screens, build tomorrow’s alert list. Mornings: confirm alerts and plans. During the day: act only on pre-defined triggers."),
                co("warn", "Common mistake", "Skipping the shortlist step and acting on the first interesting screen result. Most of the edge is in what you reject."),
                takeaway("Screen, shortlist, chart, structure, market, validation, entry, stop, size, execution, journal, review. Do the thinking in advance and let execution be mechanical."),
            ],
            [
                Q("When is the best time to do chart analysis and plan trades?", [
                    "During volatile market hours, in real time",
                    "Outside market hours when calm, with alerts and orders prepared in advance",
                    "Right after a loss",
                    "Randomly",
                ], 1, "Calm preparation produces better decisions than reacting to every tick."),
                Q("Which step comes immediately after defining the stop?", [
                    "Position size calculation",
                    "Execution without sizing",
                    "Journal review",
                    "Screening",
                ], 0, "Size depends on the stop distance, so it must follow the stop definition."),
            ]),

        L("ta-tradeedge-framework-checklist", "The final technical analysis checklist", 8,
            "One page to review before every trade.",
            [
                p("Use this checklist as a gate. Every box should be answered with evidence, not hope."),
                ul(
                    "☐ Market trend favourable",
                    "☐ Sector strong",
                    "☐ Stock in Stage 2",
                    "☐ Price above key moving averages",
                    "☐ Moving averages aligned",
                    "☐ Relative strength strong",
                    "☐ Base is constructive",
                    "☐ Volume pattern healthy",
                    "☐ Breakout or pullback is valid",
                    "☐ Entry is not extended",
                    "☐ Stop is technically logical",
                    "☐ Risk/reward acceptable",
                    "☐ Position size calculated",
                    "☐ Portfolio concentration acceptable",
                    "☐ Exit plan defined",
                    "☐ Trade journal prepared"
                ),
                h("How to use it"),
                ul(
                    "If two or more boxes fail, skip the trade.",
                    "If one box fails, ask whether the failure is a hard stop (such as market or stage) or something that can be solved with smaller size.",
                    "If you cannot answer a box, treat it as unchecked."
                ),
                co("key", "Process over outcome", "The checklist exists to ensure that you did the work before risking capital. A trade taken with a full checklist that loses is still a good decision."),
                co("warn", "Reminder", "Nothing in this course guarantees profits. Educational content only. Markets involve risk of loss."),
                takeaway("Check every box with evidence before entering. When boxes fail, skip, reduce size or wait."),
            ],
            [
                Q("If two or more checklist boxes fail, what is the sensible action?", [
                    "Trade anyway with larger size",
                    "Skip the trade or wait for a better setup",
                    "Ignore the checklist",
                    "Remove the stop",
                ], 1, "Multiple failures mean the setup does not meet your own standards."),
                Q("A checklist box cannot be answered with evidence. How should it be treated?", [
                    "As passed",
                    "As unchecked, which is a reason for caution",
                    "As irrelevant",
                    "As proof of strength",
                ], 1, "Unknowns are risks. Do not assume them away."),
            ]),

        L("ta-tradeedge-framework-capstone", "Capstone: build your own technical trading plan", 15,
            "Write the plan that turns this course into a process you can follow, test and improve.",
            [
                p("The final exercise is to write a one-page trading plan, answering the questions below in specific, measurable terms. Use this lesson as a template and write your answers in your journal or notes."),
                h("1. Market"),
                p("**What market conditions will I trade?** Example: NIFTY above rising 50-day and 200-day averages, breadth healthy, leaders holding breakouts. State what makes you reduce or stop: for example four or more distribution days, NIFTY below the 50-day and breadth deteriorating."),
                h("2. Universe"),
                p("**What stocks will I consider?** Example: NSE stocks with average daily turnover above ₹5 Cr, price above ₹50, Trend Template met, RS rating ≥ 80, in leading sectors."),
                h("3. Setup"),
                p("**What exact setup am I looking for?** Example: tight base or VCP near highs with volume dry-up in the last pause; or a pullback to a rising 50-day with a reversal signal."),
                h("4. Entry"),
                p("**What confirms entry?** Example: price above the pivot within a 3% buy zone with volume ≥ 1.5 × average; or a break above the signal candle’s high at a rising average."),
                h("5. Stop"),
                p("**Where is the thesis invalidated?** Example: below the last contraction low or the signal candle’s low, never more than 8% from entry. If the logical stop is wider, reduce size or skip."),
                h("6. Position size"),
                p("**How much capital will I risk?** Example: 1% of equity per trade; size equals risk divided by risk per share; max 20% of the account in one stock; max 6% total open risk; max 25% in one sector."),
                h("7. Exit"),
                p("**What causes me to exit?** Example: stop hit, close back below the pivot on above-average volume, weekly close below the 10-week average on heavy volume, or a sustained market breakdown. Partial profit at +2R, remainder trailing."),
                h("8. Review"),
                p("**How will I measure whether the system works?** Example: journal every trade in R, review weekly for rule compliance, monthly for win rate, average win/loss, expectancy, and maximum drawdown. Pause and review if drawdown exceeds a pre-set limit (for example 8% of equity)."),
                tb("Plan template", ["Section", "Your answer"], [
                    ["Market", "…"],
                    ["Universe", "…"],
                    ["Setup", "…"],
                    ["Entry", "…"],
                    ["Stop", "…"],
                    ["Position size", "…"],
                    ["Exit", "…"],
                    ["Review", "…"],
                ]),
                co("warn", "Important", "The examples above are illustrations, not recommendations. Your plan must fit your capital, time, risk tolerance and regulations. This course is for education, not investment advice, and no strategy guarantees profits."),
                co("tip", "Next step", "Start small. Trade the plan with minimal size for a few months, journal everything, and refine the rules only on the basis of enough data."),
                takeaway("A written plan covering market, universe, setup, entry, stop, size, exit and review converts knowledge into a process. Test it small, record everything, and improve it with evidence."),
            ],
            [
                Q("Your stock passes the screen and has a logical stop 14% below entry. Your plan caps stops at 8%. What follows from your plan?", [
                    "Use an 8% stop regardless of structure",
                    "Reduce size so the rupee risk is acceptable or skip the trade",
                    "Ignore the cap",
                    "Remove the stop",
                ], 1, "If the logical stop exceeds your limit, you cannot force a tighter stop without hiding the real risk. You reduce size or skip."),
                Q("A trader risks 1% per trade, buys at ₹250 with a stop at ₹235 on a ₹20,00,000 account. About how many shares?", [
                    "800",
                    "1,000",
                    "1,333",
                    "2,000",
                ], 2, "Risk = ₹20,000. Risk per share = ₹15. 20,000 ÷ 15 ≈ 1,333 shares (₹3,33,250, about 16.7% of the account)."),
                Q("Which sequence best reflects the course’s decision hierarchy?", [
                    "Pattern, then indicator, then market",
                    "Market regime, trend, structure, relative strength, volume, pattern, entry, risk, management",
                    "Entry, then everything else",
                    "News, then stop",
                ], 1, "The course moves from broad context to specific entry and then to risk and management."),
                Q("A strategy wins 40% of trades with a 3R average win and a 1R average loss. What is its expectancy per trade?", [
                    "+0.2R",
                    "+0.6R",
                    "+1.2R",
                    "−0.6R",
                ], 1, "(0.4 × 3) − (0.6 × 1) = 1.2 − 0.6 = +0.6R."),
                Q("A setup scores very high on trend, RS and base but the market is in a correction. What does the framework suggest?", [
                    "Ignore the market layer",
                    "Treat the market as a weak link: wait, reduce size, or skip",
                    "Increase size because the stock is strong",
                    "Short the stock",
                ], 1, "A weak market layer lowers the odds for even strong setups."),
                Q("Which statement about backtests is correct?", [
                    "They prove future profits",
                    "They are evidence with limits: include costs, avoid look-ahead and survivorship bias, check robustness and sample size",
                    "They are unnecessary",
                    "More parameters always make them better",
                ], 1, "Backtests inform decisions only when they avoid common biases and overfitting."),
            ]),
    ],
};

/* ════════════════════════════════════════════════════════════════════════
   EXPORTS
   ════════════════════════════════════════════════════════════════════════ */
export const TECHNICAL_TRACKS = [
    TA_FOUNDATIONS,
    TA_CANDLESTICKS,
    TA_MOVING_AVERAGES,
    TA_VOLUME,
    TA_MOMENTUM,
    TA_RELATIVE_STRENGTH,
    TA_WEINSTEIN,
    TA_CHART_PATTERNS,
    TA_BREAKOUTS,
    TA_PULLBACKS,
    TA_MARKET_REGIME,
    TA_ONEIL_MINERVINI,
    TA_RISK,
    TA_TRADE_MANAGEMENT,
    TA_SCREENING,
    TA_SETUPS,
    TA_BACKTESTING,
    TA_PSYCHOLOGY,
    TA_TRADEEDGE_FRAMEWORK,
];

// Difficulty levels, used by the Outline's existing `groups` mechanism.
// Each group lists track ids; LearnModule resolves them against TECHNICAL_TRACKS.
export const TECHNICAL_LEVELS = [
    { id: "ta-level-1", title: "Level 1 · Beginner", trackIds: ["ta-foundations", "ta-candlesticks", "ta-moving-averages"] },
    { id: "ta-level-2", title: "Level 2 · Intermediate", trackIds: ["ta-volume", "ta-momentum", "ta-relative-strength"] },
    { id: "ta-level-3", title: "Level 3 · Advanced", trackIds: ["ta-weinstein", "ta-chart-patterns", "ta-breakouts", "ta-pullbacks", "ta-market-regime", "ta-oneil-minervini", "ta-risk-management", "ta-trade-management"] },
    { id: "ta-level-4", title: "Level 4 · Systematic", trackIds: ["ta-screening", "ta-trading-setups", "ta-backtesting", "ta-psychology", "ta-tradeedge-framework"] },
];

// Glossary entries for the Technical tab (same { term, def } shape as the fundamental glossary).
export const TECHNICAL_GLOSSARY = [
    { term: "Accumulation", def: "Large investors gradually buying a stock, often during quiet bases, visible as up-day volume and strong closes." },
    { term: "ATR (Average True Range)", def: "A volatility measure: the average of the true range (the largest of high−low, |high−previous close| and |low−previous close|) over, typically, 14 periods." },
    { term: "Base", def: "A multi-week consolidation where supply is absorbed before a possible next advance, such as a cup and handle or flat base." },
    { term: "Break of structure", def: "A close below the last higher low (in an uptrend) or above the last lower high (in a downtrend), the first hard evidence that the trend’s pattern has failed." },
    { term: "Breakout", def: "A move above resistance (or a pivot) that ends a consolidation, ideally on strong volume." },
    { term: "Buy zone", def: "The area from the pivot to a few percent above it (commonly up to 3% to 5%) where entry still offers acceptable reward/risk." },
    { term: "Candlestick", def: "A chart symbol showing a period’s open, high, low and close, with a body between open and close and wicks to the extremes." },
    { term: "Churning", def: "Heavy volume with little price progress, which can indicate supply meeting demand at a level." },
    { term: "Distribution", def: "Large holders selling into strength, often near highs, seen as heavy volume with weak closes and stalling price." },
    { term: "Distribution day", def: "An index day that falls meaningfully on higher volume than the previous session, a sign of institutional selling." },
    { term: "Drawdown", def: "The decline from a peak in account equity to a subsequent trough, usually quoted as a percentage." },
    { term: "EMA", def: "Exponential moving average: an average that gives more weight to recent prices, so it reacts faster than an SMA." },
    { term: "Expectancy", def: "The average result per trade: (win rate × average win) − (loss rate × average loss)." },
    { term: "Follow-through day", def: "A strong up day on higher volume, typically on day four or later of a rally attempt after a correction, suggesting buyers are returning." },
    { term: "Golden cross / Death cross", def: "The 50-day average crossing above (golden) or below (death) the 200-day average. Both are lagging trend confirmations." },
    { term: "Higher high / Higher low", def: "A swing high above the previous one, and a pullback low above the previous low. Together they define an uptrend." },
    { term: "High tight flag", def: "A rare pattern where a stock roughly doubles in a few weeks, then consolidates in a very tight range before continuing." },
    { term: "Look-ahead bias", def: "A backtesting error where information not available at the time of the decision is used." },
    { term: "MACD", def: "Moving Average Convergence Divergence: the gap between a 12 and 26-period EMA, with a 9-period signal line and histogram." },
    { term: "Mansfield RS", def: "A relative strength measure that normalises a stock-to-index ratio around a zero line, using its 52-week average." },
    { term: "Market breadth", def: "How many stocks participate in a market move, measured by advance/decline, new highs and lows, and the share of stocks above key averages." },
    { term: "OBV", def: "On-Balance Volume: a running total that adds volume on up days and subtracts it on down days." },
    { term: "Overfitting", def: "Tuning a strategy so closely to past data that it captures noise and fails on new data." },
    { term: "Pivot", def: "The price level that completes a base and triggers a buy, such as the handle high of a cup and handle." },
    { term: "Position sizing", def: "Choosing the number of shares so that a stop-out costs a fixed percentage of capital: capital at risk ÷ risk per share." },
    { term: "R multiple", def: "A trade’s result expressed in units of initial risk. +3R means a profit three times the amount risked." },
    { term: "Relative strength (RS)", def: "A comparison of a stock’s performance with a benchmark or with other stocks. Not the same as RSI." },
    { term: "RS rating", def: "A percentile-style rank of a stock’s weighted past performance versus all other stocks, from low (weak) to high (strong)." },
    { term: "RSI", def: "Relative Strength Index: a 0 to 100 momentum oscillator based on average gains versus average losses over, typically, 14 periods." },
    { term: "Shakeout", def: "A brief break below support or a base low that quickly reverses, flushing out weak holders and stop orders." },
    { term: "SMA", def: "Simple moving average: the arithmetic mean of the last N closing prices." },
    { term: "Stage analysis", def: "Stan Weinstein’s framework of four stages: basing (1), advancing (2), topping (3) and declining (4), using the 30-week average." },
    { term: "Stochastic oscillator", def: "A 0 to 100 oscillator showing where the close sits within the recent high-low range." },
    { term: "Support / Resistance", def: "Price zones where demand (support) or supply (resistance) has previously stopped a decline or an advance." },
    { term: "Survivorship bias", def: "A testing error where only stocks that still exist are included, hiding failures and overstating results." },
    { term: "Trend Template", def: "Mark Minervini’s eight-condition filter for stocks in a confirmed Stage 2 uptrend." },
    { term: "VCP", def: "Volatility Contraction Pattern: a base whose pullbacks get progressively smaller while volume dries up, showing supply is running out." },
    { term: "Volume dry-up", def: "A period of unusually low volume, typically in the last stage of a base, showing sellers have largely finished." },
];
