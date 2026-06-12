# SPX GEX TERMINAL — CUSTOM QUOTE COLUMN AUDIT

**Scope:** Forensic audit of the 12 Thinkorswim Custom Quote scripts in `SPX GEX TERMINAL COLUMN CODE.txt`. Each titled section is treated as an independent Custom Quote column; duplicate variable/input names across sections are not defects.
**Method:** Static code analysis + dimensional/unit verification + hand-calculated test cases + inspection of the actual exported watchlist CSVs (`spx-0dte.csv`, `ndx-0dte.csv`) shipped with the site, which provide empirical evidence of real platform behavior. Where Thinkorswim behavior cannot be proven from official documentation or the exports, it is explicitly flagged **VERIFY EMPIRICALLY**.
**Date:** June 11, 2026. Underlying levels observed in the exports: SPX ≈ 7,394 (strike 7300 + 94.3 PTS), NDX ≈ 29,4xx. NDX/SPX scale factor ≈ **4.0×**.

**Three empirical findings from your own exports that frame everything below:**

1. **`Gamma()` returned NaN for every row of the SPX 0DTE close snapshot.** The GEX column exported `NaN` across the board. The `gammaHeld` carry-forward did not rescue it. Greeks via thinkScript in Custom Quotes on expiration day are unreliable — and the website weights GEX at **31% of its structureScore**, meaning the top-weighted input was silently zero for that entire dataset.
2. **FLOW STATE exported `NO_DATA` on rows where Sell % exported real values (19–21%).** Two columns built on the *identical* sellPct formula disagreed in the same export — proof that separate Custom Quote instances can compute on different aggregations or stale series. (Your app.js already distrusts this: it recomputes flow state from Sell % and ignores the exported label.)
3. **DWF exported values like 613.18 ($M) on a single deep-ITM strike.** That magnitude equals roughly the *entire session's gross premium* for that contract (≈63k contracts × $97 × 100 ≈ $613M), not a 10-minute directional window. This is direct evidence that at least one flow column is running on a different aggregation than the "2m × 5 bars" the header claims — the exact aggregation-drift failure this audit was commissioned to find.

---

## EXECUTIVE SUMMARY

| Column | Intended Measurement | Actual Measurement | Classification | Aggregation | Accuracy Verdict | Primary Risk | Recommended Action |
|---|---|---|---|---|---|---|---|
| 1. Distance to Spot | Points from strike to underlying | Same — **but falls back to the option's own price when underlying is NaN**, fabricating a ~strike-sized "distance" | B Derived | Any intraday | **INCORRECT FORMULA** (fallback) | Fabricated distances poison the website's spot estimation (PTS is its preferred spot source) | Replace fallback with NaN; add signed + percent output |
| 2. Sell % | Seller-initiated volume share | Volume-weighted close-location-in-range proxy | C Proxy | 2m × 5 bars | **USEFUL PROXY, NOT DIRECT DATA** | Read as true bid-hit execution | Rename "Sell-Pressure % (Est.)"; add min-volume gate; delete dead bg code |
| 3. Flow State | Trade-intent direction per contract | Threshold classifier on the Sell % proxy | C Proxy | 2m × 5 bars | **MATHEMATICALLY VALID BUT MISLABELED** | Labels assert known intent (`BULL_PUT_SELL`) from candle location; no volume gate | Rename to `*_PRESSURE` states; widen 45/55 band; gate on volume |
| 4. GEX Proxy $M/1% | Dealer gamma exposure | Convention-signed Γ·OI dollar-gamma per 1% (calls +, puts −) | C Proxy | Current bar Γ + DAY OI | **USEFUL PROXY, NOT DIRECT DATA** | Stale carried gamma × moving spot; OI blind to same-day 0DTE opens; **empirically NaN at the 0DTE close** | Cap gamma staleness; relabel; disclose OI limitation |
| 5. OI $M | "Capital in the strike" | OI × (possibly stale) daily last × 100 = current marked value of open contracts | B Derived | DAY | **MATHEMATICALLY VALID BUT MISLABELED** | Missing data silently becomes $0; stale last on untraded contracts | NaN-preserving rewrite; rename "OI Market Value (Last) $M" |
| 6. Vol/OI Ratio | Turnover vs. open interest | Exactly that | B Derived | DAY (explicit) | **ACCURATE WITH LIMITATIONS** | Tiny-OI rows hit top heat tier (50 vol / 2 OI = 25 → cyan); ratio ≠ proven opening activity | Add min-OI/min-vol gates; export raw vol & OI beside it |
| 7. Fresh Prem $M | Recent gross premium traded | Σ(bar volume × bar mark) × 100 over 5 bars | C Estimate | 2m × 5 bars (comment wrongly says 1-minute) | **ACCURATE WITH LIMITATIONS** | Comment/aggregation conflict; gross mistaken for net | Fix comment; rename "Fresh Gross Premium (Est.)" |
| 8. Dollar Flow $M | Directional money flow | Candle-location-weighted directional premium proxy | C Proxy | 2m × 5 bars (export evidence suggests a live instance ran at DAY) | **USEFUL PROXY, NOT DIRECT DATA** | minRollingVolume = 1 → single-print noise; "Dollar Flow" too definitive; price source inconsistent with siblings | Raise gate to ≥25; use mark; rename "Directional Premium Proxy" |
| 9. FNPF $M | Net option buying/selling | Same engine as #8 without the put sign-flip | C Proxy | 2m × 5 bars | **USEFUL PROXY, NOT DIRECT DATA** | Positive put FNPF misread as bullish; algebraically redundant with #2/#7/#8 | Label option-side meaning; treat as same evidence as #8, not independent |
| 10. OVR Prem $M | Session premium traded | Day volume × day option VWAP × 100 — **with a fallback that prices the whole session at the current quote** | B/C | DAY | **UNSTABLE OR CONTEXT-DEPENDENT** | Fallback can misstate session premium by >90% on 0DTE decay days; "Flow" implies net | Disable fallback (NaN); rename "Session Gross Premium (Est.)" |
| 11. Flow Concentration | Activity concentration | (bar? session? volume ÷ OI) × √(premium $M) with **inherited, unpinned aggregation** | D Score | Inherits Custom Quote agg | **UNSTABLE OR CONTEXT-DEPENDENT** | The measured time window is unknowable from the code; exported values cannot be attributed to a defined window | REPLACE with two explicit variants (Recent / Session) |
| 12. Buy Strike | Contract quality signal | 5-factor heuristic where up to **50 of 100 points derive from one candle-location variable** | D Score | **Conflict: file says 2m, script says 1m** | **MATHEMATICALLY VALID BUT MISLABELED** | "BUY" overstates evidence; double-counted pressure; missing $5 price cap & spread filter; ±10 momentum on a 0.03% threshold is coin-flip jitter | Restructure scoring, add eligibility gates, rename ACTIONABLE/WATCH |

**Items that must be verified empirically inside Thinkorswim** (documentation alone is insufficient): (a) `vwap(period = AggregationPeriod.DAY)` per individual option contract — the NDX export's Cum Prem values (e.g., 1.31 on a put that collapsed −99% with vol 103 → implied session-average price ≈ $127) are *consistent with a real VWAP*, but per-contract reliability is unproven; (b) `open_interest()` without an explicit `period` on intraday aggregations; (c) depth/fidelity of historical `PriceType.MARK` bars in Custom Quotes; (d) whether Custom Quote sorting uses the plot value when an `AddLabel` is present (community-standard pattern; confirm on your build).

---

## COLUMN AUDITS

### Column 1 — Distance to Spot (Pts)

**Purpose**
Show how far each strike sits from the live underlying, in points, with proximity heat for 0DTE.

**Current Formula**
distance = |strike − U| where U = underlying close **if available, else the option's own close**.

**Input Data Sources**
`GetStrike()` (option metadata); `close(symbol = GetUnderlyingSymbol())` (secondary-symbol price at the column's aggregation); fallback: option `close`.

**Aggregation and Timing**
Underlying close is the latest bar at whatever aggregation the Custom Quote uses; effectively current, but can be NaN while loading, premarket, or when the secondary feed is delayed. `GetUnderlyingSymbol()` resolves SPXW→SPX and NDXP/NDXW→NDX correctly (documented behavior).

**Units Check**
Index points. Correct — no multiplier needed.

**Mathematical Validation**
Primary path is exact: |7300 − 7394.3| = 94.3, matching the export. The fallback path is the defect.

**Thinkorswim Compatibility**
Compiles; secondary-symbol reference is supported in Custom Quotes. The NDX export shows PTS = `loading` on several rows — the underlying fetch genuinely does return nothing at times, so the fallback branch is *exercised in production*, not theoretical.

**What It Can Prove**
Exact point distance, when the underlying value is real.

**What It Cannot Prove**
Nothing about moneyness direction (absolute value discards sign) or comparability across SPX/NDX (fixed point thresholds).

**Failure Modes**
(1) Underlying NaN → distance becomes |strike − option price| ≈ strike: a 7300C with the call at 97.04 would print **7,202.96** — a plausible-*format* number that destroys the website's spot estimation, which explicitly prefers the PTS column. (2) Fixed 10/25/50-pt heat is SPX-scaled; at NDX ≈ 29,400 the equivalent bands are ≈ 40/100/200 pts, so every NDX row near the money paints "cold." (3) First bars after the open and premarket: secondary symbol frequently NaN.

**Manual Test Cases**
Normal: 7300C, U = 7394.3 → 94.3 ✓ (matches export). Thin/NDX: 29500C, U = 29,377 → 123 pts → paints BLACK under SPX thresholds despite being ~0.42% away (warm-equivalent). Missing: U = NaN → current code prints 7,202.96; corrected code prints NaN / `loading`.

**Verdict**
**INCORRECT FORMULA** (the fallback). The primary calculation is exact.

**Recommended Display Name**
`Dist (Pts)` plus a `Dist %` twin. Never substitute the option's own price for the underlying.

**Corrected ThinkScript** — see Code Pack, Block 1.

---

### Column 2 — SELL %

**Purpose**
Estimate the fraction of recent option volume that was seller-pressured.

**Current Formula**
Per bar: s = clamp₀¹((High − Close)/(High − Low)); flat bar → 0.50; zero volume → 0.50.
Rolling: Sell% = 100 × Σ(volᵢ·sᵢ) / Σ(volᵢ) over 5 bars.

**Input Data Sources**
Option OHLC + volume at the column's aggregation. No bid/ask, no trade-condition data.

**Aggregation and Timing**
2-minute × 5 bars = a **10-minute** window (not 5 minutes). Rolling intraday; first bars after open under-populated.

**Units Check**
Percent, 0–100. Correct.

**Mathematical Validation**
This is exactly **1 − CLV** (close-location value) normalized to [0,1], volume-weighted — implemented correctly. Hand check: bars (vol, s) = (100, .2)(50, .9)(0, .5)(200, .4)(50, .5) → Σvol = 400, Σvol·s = 170 → 42.5% → GREEN. ✓ Flat bar (H=L⇒O=C) correctly lands on the 0.50 branch. Zero-volume bars contribute zero weight. Σvol = 0 → NaN. ✓

**Thinkorswim Compatibility**
Compiles. Note: the `AssignBackgroundColor` block returns BLACK on every branch — dead code. (Two scripts in the file carry similar inert blocks.)

**What It Can Prove**
Where recent trades printed within the recent price range — a pressure *tendency*.

**What It Cannot Prove**
Bid-side execution, seller-initiated volume, opening vs. closing trades, or institutional activity. Option candles are built from last prints; on thin contracts, prints alternating between bid and ask manufacture "range" from spread, not aggression. A bar that gaps down and closes at its (lower) high reads 0% sell despite the price falling — close-location ignores inter-bar change.

**Failure Modes**
Wide spreads (0DTE far OTM); sparse prints; stale last from a prior session contaminating the first bar; a single 1-lot dominating a 5-bar window (no volume gate exists).

**Manual Test Cases**
Normal: above, 42.5%. Thin: one 2-lot bar closing at its low → 100% "sell" from two contracts. Missing: 5 bars of zero volume → NaN ✓ (and the export's NDX row with a −99% collapsed put shows 99.03% — the proxy behaving as designed on a genuinely sold-off contract).

**Verdict**
**USEFUL PROXY, NOT DIRECT DATA.**

**Recommended Display Name**
`Sell-Pressure % (Est.)` — internally: close-location sell proxy. Every comment claiming it measures executed sell volume must be rewritten.

**Corrected ThinkScript** — Code Pack, Block 2 (adds `minRollingVolume`, honest comments, removes dead code, adds a real heat ramp).

---

### Column 3 — FLOW STATE

**Purpose**
Classify each contract's recent activity into a directional state.

**Current Formula**
sellPct (identical engine to Column 2); call & sellPct<45 → BULL_CALL_BUY; call & >55 → BEAR_CALL_SELL; put & <45 → BEAR_PUT_BUY; put & >55 → BULL_PUT_SELL; else MIXED; NaN → NO_DATA.

**Input Data Sources**
Same OHLCV proxy as Column 2; `IsPut()` for type.

**Aggregation and Timing**
2m × 5 bars intended. **Empirical:** the SPX export shows this column printing `NO_DATA` on rows where the separate Sell % column printed 19–21% — the two instances were not computing on the same series at export time. Your app.js works around this by recomputing state from Sell % (single 45 threshold, which silently deletes the MIXED band).

**Units Check**
Categorical label. N/A.

**Mathematical Validation**
The put/call → market-direction mapping (call buy bullish, call sell bearish, put buy bearish, put sell bullish) is the standard convention and is implemented consistently. The classifier itself is just two thresholds on the Column-2 proxy.

**Thinkorswim Compatibility**
Compiles; label-cell columns sort alphabetically by text unless a numeric plot is added — this script has **no plot**, so the column cannot sort numerically and exports text (confirmed in CSV).

**What It Can Prove**
That the close-location proxy leaned one way over ~10 minutes.

**What It Cannot Prove**
Trade intent. `BULL_PUT_SELL` from a put candle closing near its high cannot distinguish: fresh put writing (bullish), longs closing puts (unwind), the short leg of a spread, or market-maker prints. No volume gate exists — three contracts can print `BULL_CALL_BUY`.

**Failure Modes**
All of Column 2's, plus: thin 45/55 band flips state on noise; multi-leg and closing activity is invisible; the duplicated-engine desync shown in your own export.

**Manual Test Cases**
Call, sellPct 38 → BULL_CALL_BUY (proxy says buy pressure — fine as *pressure*, overstated as *intent*). Put, sellPct 70 → BULL_PUT_SELL (could equally be longs exiting). Vol = 3 contracts → still emits a confident state (gate missing).

**Verdict**
**MATHEMATICALLY VALID BUT MISLABELED.**

**Recommended Display Name**
States: `CALL_BUY_PRESSURE / CALL_SELL_PRESSURE / PUT_BUY_PRESSURE / PUT_SELL_PRESSURE / MIXED / INSUFFICIENT_DATA`. Widen band to 40/60; require minimum rolling volume.

**Corrected ThinkScript** — Code Pack, Block 3.

---

### Column 4 — GEX Proxy $M/1%

**Purpose**
Per-contract gamma-exposure heat in $M per 1% underlying move, calls +, puts −.

**Current Formula**
GEX = sign × Γ × OI × 100 × S² × 0.01 ÷ 10⁶, with Γ carried forward when NaN (`gammaHeld` rec).

**Input Data Sources**
`Gamma()` (thinkScript theoretical greek, current bar); `open_interest(period = DAY)` (prior clearing cycle); spot from `close(symbol = underlying)`.

**Aggregation and Timing**
Γ current; OI is **yesterday's** — by design it cannot see contracts opened today, which for 0DTE is most of the gamma. Spot current.

**Units Check**
Γ [Δ per point] × (0.01·S) [points per 1%] × 100 [multiplier] × OI [contracts] × S [$ per point of notional] = **dollars of delta-notional change per 1% move** — the formula's S²×0.01 grouping is dimensionally exact. ÷10⁶ → $M. The label "$M/1%" is correct; `Sqr()` (square, not square root) is used correctly.

**Mathematical Validation**
Call: Γ = 0.002, OI = 1,000, S = 6,800 → 0.002·1000·100·6800²·0.01 = $92.48M → 92.48 ✓ (cross-check: 1% = 68 pts; ΔΔ = 0.136/contract × 100 sh × 1,000 = 13,600 SPX-equiv × $6,800 = $92.5M ✓). Put: Γ = 0.0015, OI = 5,000, S = 6,800 → −346.8.

**Thinkorswim Compatibility**
Compiles. **Empirical: the entire SPX 0DTE close export shows GEX = NaN.** `Gamma()` did not return values at the 0DTE close, and the carry-forward had nothing valid to carry. Treat greek availability in Custom Quotes — especially expiration day and near the close — as unreliable until verified on your build.

**What It Can Prove**
A convention-signed, OI-weighted dollar-gamma magnitude per strike — a structural map of *where listed gamma sits*, under the assumption calls + / puts −.

**What It Cannot Prove**
Dealer positioning. OI has no direction; calls-positive/puts-negative is the SqueezeMetrics-style *assumption*, not observation. It is not net chain GEX (no aggregation/netting), and for 0DTE it is blind to same-day-opened gamma — usually the majority.

**Failure Modes**
Stale carried Γ × moving spot = false precision (worst in the final hour of 0DTE when true gamma is exploding/collapsing); Γ NaN streaks (observed); OI staleness; premarket spot NaN; deep ITM/far OTM greek noise.

**Manual Test Cases**
Normal: 92.48 above. Carry hazard: Γ goes NaN at 3:00 PM with last valid 0.004, spot moves 40 pts — displayed GEX is fiction with no flag. Missing: Γ never valid → NaN ✓ (observed in export).

**Verdict**
**USEFUL PROXY, NOT DIRECT DATA.**

**Recommended Display Name**
`GEX Proxy $M/1% (conv. C+/P−)`. The website must not caption it as dealer positioning, and must disclose the same-day-OI blind spot for 0DTE.

**Corrected ThinkScript** — Code Pack, Block 4 (staleness cap on the gamma carry: NaN after N bars without a fresh greek).

---

### Column 5 — Open Interest Dollar Value $M

**Purpose**
Show how much option value is associated with each strike's open interest.

**Current Formula**
OI × daily `close` × 100, with **NaN OI → 0 and NaN/zero price → 0**.

**Input Data Sources**
`open_interest()` (bare — valid because the column is declared DAY aggregation); option daily close.

**Aggregation and Timing**
DAY. On the current daily bar, `close` = the last trade of the session *if the contract traded today*; an untraded contract's most recent daily close can be **days old** — stale by construction. Mark is unavailable on DAY (the script's own comment is correct about that).

**Units Check**
Contracts × $/contract-point × 100 = dollars; ÷10⁶ → $M. Correct. Heat tiers compare raw dollars to raw-dollar thresholds — consistent.

**Mathematical Validation**
OI 12,400 × last 2.35 × 100 = $2.914M → 2.91, ORANGE tier ✓. Degenerate: OI 3 × 0.05 = $15 → displays 0.00 in DARK_GRAY — **indistinguishable from a missing-data row, which also displays 0.00** because both NaN branches coerce to zero.

**Thinkorswim Compatibility**
Compiles. If a user accidentally sets the column to an intraday aggregation, bare `open_interest()` behavior is undefined-by-documentation — specify `period = AggregationPeriod.DAY` explicitly regardless (VERIFY EMPIRICALLY on intraday).

**What It Can Prove**
The current *marked* value of existing open contracts at the last traded price.

**What It Cannot Prove**
Capital historically paid (OI was opened across many prices), capital "locked" in the strike, or notional exposure. "Open Interest Dollar Value" invites all three misreadings.

**Failure Modes**
Stale last on untraded strikes; missing-data-as-$0; 0DTE strikes listed intraday with OI 0 until tomorrow's clearing.

**Manual Test Cases**
Normal: 2.91 above. Thin: $15 → 0.00 (true tiny value). Missing: OI NaN → currently 0.00 (false zero); corrected: NaN.

**Verdict**
**MATHEMATICALLY VALID BUT MISLABELED** (plus a missing-data defect).

**Recommended Display Name**
`OI Market Value (Last) $M` — a marked-value proxy, not invested capital.

**Corrected ThinkScript** — Code Pack, Block 5 (NaN-preserving; explicit DAY period).

---

### Column 6 — Vol/OI Ratio

**Purpose**
Flag contracts whose session volume is unusually large relative to standing open interest.

**Current Formula**
`volume(period=DAY)` ÷ `open_interest(period=DAY)`; OI ≤ 0 → NaN.

**Input Data Sources**
Day cumulative option volume; prior-clearing OI. Both explicitly DAY — correct pattern, works at any column aggregation.

**Aggregation and Timing**
Session vs. yesterday's OI. The denominator never updates intraday — that's a property of OI, not a bug.

**Units Check**
Unitless ratio. Correct.

**Mathematical Validation**
18,000 / 9,000 = 2.0 (gray) ✓. Degenerate: 50 / 2 = **25 → CYAN top tier on two contracts of OI** — the heatmap's strongest signal earned by statistical noise. Missing OI → NaN → gray ✓ (this column handles NaN correctly, unlike #5).

**Thinkorswim Compatibility**
Compiles; explicit periods make it aggregation-safe.

**What It Can Prove**
Turnover: today's volume is N× the standing OI.

**What It Cannot Prove**
New *opening* positioning. Volume includes closes, rolls, spread legs, and market-maker prints; ratio > 1 is suggestive, never confirmation. For 0DTE the distortion is structural: strikes listed this morning carry near-zero OI, so every active 0DTE strike trends toward an "extreme" ratio.

**Failure Modes**
Tiny-OI explosion (above); 0DTE OI staleness; comparing tiers across SPX/NDX without recalibration.

**Manual Test Cases**
Normal 2.0; degenerate 25-on-OI-2; missing → NaN ✓.

**Verdict**
**ACCURATE WITH LIMITATIONS.**

**Recommended Display Name**
`Vol/OI (Turnover)` — and export raw `Volume` and `Open.Int` beside it (the NDX watchlist already does; the SPX watchlist does not — harmonize).

**Corrected ThinkScript** — Code Pack, Block 6 (min-OI/min-volume gates control the heat tiers; the raw ratio still displays).

---

### Column 7 — Fresh Prem $M

**Purpose**
Gross premium that traded in the recent rolling window.

**Current Formula**
Σ over 5 bars of (bar volume × price) × 100 ÷ 10⁶, price = bar mark, fallback last, fallback 0.

**Input Data Sources**
Option volume per bar; `close(priceType = PriceType.MARK)` per bar (historical mark bars — VERIFY EMPIRICALLY for depth/fidelity in Custom Quotes), last as fallback.

**Aggregation and Timing**
**The comment says "most recent N one-minute bars"; the file's stated standard is 2-minute.** At 2m, 5 bars = a 10-minute window. This comment/configuration conflict must be resolved suite-wide (see Column 12 and the Aggregation Matrix).

**Units Check**
Contracts × $ × 100 ÷ 10⁶ → $M. Correct.

**Mathematical Validation**
Bars (vol×mark): 120×2.10 + 80×2.25 + 0 + 310×2.40 + 95×2.55 = 1,418.25 → ×100 = $141,825 → **0.14** → DARK_GRAY (<0.25 tier) ✓. Pricing the whole bar's volume at one bar price is an approximation; per-bar typical price ((H+L+C)/3) is a marginally better estimator when mark history is thin.

**Thinkorswim Compatibility**
Compiles; mark-history availability is the only open question.

**What It Can Prove**
An estimate of recent **gross** premium turnover.

**What It Cannot Prove**
Net flow or direction — gross by construction. Must never feed a "money entering/leaving" narrative on the site.

**Failure Modes**
Mark NaN on the whole window → 0 displayed as a true zero (should be NaN when *price* is missing but volume traded); stale prints; first bars after open.

**Manual Test Cases**
Normal 0.14 above; thin: 1 contract × 0.05 → 0.00 (true small); missing price w/ volume 500 → currently $0 (false), corrected NaN.

**Verdict**
**ACCURATE WITH LIMITATIONS.**

**Recommended Display Name**
`Fresh Gross Premium (Est.) $M` — comment must state "5 bars at the Custom Quote aggregation (= 10 min at 2-minute bars)."

**Corrected ThinkScript** — Code Pack, Block 7.

---

### Column 8 — Dollar Flow $M

**Purpose**
Rolling market-directional premium: positive bullish, negative bearish.

**Current Formula**
Per bar: gross = vol × close × 100; net = gross × (1 − 2s) where s = the Column-2 sell fraction; puts sign-flipped to market direction; Σ over 5 bars ÷ 10⁶; NaN if rolling volume < 1.

**Input Data Sources**
Option OHLCV; uses **`close`** while its siblings (#7, #9) use **mark** — internal price-source inconsistency.

**Aggregation and Timing**
Intended 2m × 5 = 10 minutes. **Empirical caution:** the exported `DWF` column printed 613.18 on one deep-ITM strike — session-gross magnitude — meaning the live instance of this family was not on the intended intraday window. Whatever DWF is configured as, the export proves window drift happens in production and is invisible in the output.

**Units Check**
$M, signed. Correct.

**Mathematical Validation**
Algebra verified: close at high → factor +1 (all "buy"); midpoint → 0; low → −1 ✓. Put with vol 200, px 3.00, s = 0.2 → gross $60k, option-net +$36k, market-directional **−0.036** ✓ (put buying = bearish). Sign mapping consistent with Column 3.

**Thinkorswim Compatibility**
Compiles.

**What It Can Prove**
A candle-location-weighted directional *tilt* of recent premium.

**What It Cannot Prove**
Actual dollars entering or leaving the market, initiator side, or institutional behavior. It is a linear transform of (gross premium × the Column-2 proxy) — **not** independent evidence (see Dependency Map).

**Failure Modes**
`minRollingVolume = 1`: a single 1-lot print at the bar's high produces a confident signed reading; thin contracts whipsaw; close-vs-mark inconsistency makes #8 and #9 disagree on identical flow.

**Manual Test Cases**
Normal: −0.036 above. Thin: 1 contract, $0.50, close at high → +0.00005 → colored GREEN as "bullish flow." Missing: zero rolling volume → NaN ✓.

**Verdict**
**USEFUL PROXY, NOT DIRECT DATA.**

**Recommended Display Name**
`Directional Premium Proxy $M`. Raise the volume gate; unify on mark.

**Corrected ThinkScript** — Code Pack, Block 8.

---

### Column 9 — FNPF $M

**Purpose**
Net option-side premium: positive = estimated option buying, negative = estimated option selling.

**Current Formula**
Identical engine to #8 (mark-priced) **without** the put sign-flip.

**Input Data Sources**
Option volume; bar mark→last; the same sell-fraction proxy.

**Aggregation and Timing**
2m × 5 bars.

**Units Check**
$M, signed (option-side). Correct.

**Mathematical Validation**
Same put example: **+0.036** (option-side buying) where #8 shows −0.036 (market-directional). Exactly the documented relationship: `DollarFlow = FNPF × (puts: −1, calls: +1)`, modulo the close-vs-mark difference. Both equal `FreshGross × (1 − 2·s̄)` — i.e., FNPF, Dollar Flow, and Sell % are **one degree of freedom**: given Fresh Prem (#7) and Sell % (#2), FNPF is algebraically determined; given FNPF and `IsPut`, Dollar Flow is determined.

**Thinkorswim Compatibility**
Compiles.

**What It Can Prove**
The option-side rendering of the same proxy as #2/#8.

**What It Cannot Prove**
Anything #8 cannot. Critical UI hazard: **positive FNPF on a put means put BUYING — bearish for the underlying** — a green number a reader will instinctively parse as bullish.

**Failure Modes**
Same as #8, plus the put-sign misreading; no volume gate at all.

**Manual Test Cases**
Put +0.036 (bearish despite the plus sign); call +0.036 (bullish); zero volume → 0.00 — should be NaN.

**Verdict**
**USEFUL PROXY, NOT DIRECT DATA** — and redundant: keep it only if the site explicitly wants option-side vs. market-side views, labeled as the same evidence.

**Recommended Display Name**
`Net Option Premium Proxy $M (option-side)` with an explicit "P+ = put buying = bearish" footnote anywhere it renders.

**Corrected ThinkScript** — Code Pack, Block 9.

---

### Column 10 — OVR Prem $M (Cumulative Premium Flow)

**Purpose**
Total premium traded into the strike this session.

**Current Formula**
day volume × day option VWAP × 100; **if VWAP is NaN/0, fall back to current mark or last and price the ENTIRE session's volume at it.**

**Input Data Sources**
`volume(period=DAY)`; `vwap(period=DAY)` on the option itself; current mark/last fallback.

**Aggregation and Timing**
Session-cumulative.

**Units Check**
$M. Correct. Note `Premium_M` is rounded to 4 decimals while siblings use 2 — cosmetic inconsistency.

**Mathematical Validation**
The identity is exact **when VWAP is real**: VWAP × ΣVol ≡ Σ(price×size) by definition of a volume-weighted average. The NDX export supports VWAP being real at least sometimes: a put that collapsed −99% (last 4.56, vol 103) exported Cum Prem 1.31 → implied session-average price ≈ $127, consistent with early high-priced prints — the *fallback* could never produce that number. The fallback, when it fires, is the danger: contract trades 40,000 at session VWAP 3.20 → true gross **$12.8M**; if VWAP returns NaN at 3:55 PM with last 0.05 → displayed **$0.20M** — a **98.4% understatement**. The error reverses sign on rallies. There is no flag distinguishing the two regimes.

**Thinkorswim Compatibility**
`vwap()` as a fundamental on individual option symbols at DAY period is the least-documented call in the file — **VERIFY EMPIRICALLY per the test plan** (and check extended-hours settings' effect on it).

**What It Can Prove**
Session **gross** premium traded — when VWAP is genuine.

**What It Cannot Prove**
Net or directional flow ("Cumulative Premium *Flow*" is the wrong word); anything at all when the fallback is active.

**Failure Modes**
Fallback on 0DTE decay days (quantified above); extended-hours VWAP contamination; rounding mismatch.

**Manual Test Cases**
Stable price: VWAP≈last → fallback error small. Crash day: 98% understatement above. Rally day: symmetric overstatement.

**Verdict**
**UNSTABLE OR CONTEXT-DEPENDENT** (entirely because of the fallback).

**Recommended Display Name**
`Session Gross Premium (Est.) $M`. Disable the fallback — print NaN and let the site say "—" rather than fabricate.

**Corrected ThinkScript** — Code Pack, Block 10.

---

### Column 11 — Flow Concentrate (Flow Concentration Score)

**Purpose**
Rank strikes by how concentrated activity is: turnover × premium size.

**Current Formula**
score = (vol ÷ OI) × √(vol × price × 100 ÷ 10⁶), with `volume` and `open_interest()` **inheriting the Custom Quote's aggregation** (no explicit periods), mark→last price, validity gates vol ≥ 500, OI ≥ 25, $flow ≥ 250k.

**Input Data Sources**
Whatever-bar volume; OI at unspecified period; mark (no `> 0` check — `!IsNaN` only, flagged correctly in your brief).

**Aggregation and Timing**
**Undefined — this is the core defect.** On a 2-minute column, `volume` is a single 2-minute bar (not the 5-bar window the file header implies, not the session); `open_interest()` without a period on intraday aggregation is not documented to return anything (VERIFY EMPIRICALLY). The NDX export shows the column producing nonzero values (0.93, 15.68), so *some* configuration resolves — but the time window those numbers describe **cannot be determined from the code**, which disqualifies the metric for analytical use until pinned.

**Units Check**
(unitless) × √($M) — an uninterpretable hybrid unit. Acceptable only for a *declared heuristic*; the √ damps premium so turnover dominates, which is a defensible design choice but must be stated, not implied as measurement.

**Mathematical Validation**
vol 174, OI 10, price ~$2 → ratio 17.4 × √(0.0348) ≈ 3.2 — but change the column to DAY and the same formula yields a completely different magnitude from the same market. A score whose value depends on a UI dropdown is not a statistic.

**Thinkorswim Compatibility**
Compiles everywhere; *means* something different everywhere.

**What It Can Prove**
Nothing attributable, as configured.

**What It Cannot Prove**
Concentration over any specific window; comparability across calls/puts, sessions, or SPX/NDX (fixed 5–500 tiers are arbitrary and dominated by the tiny-OI term).

**Failure Modes**
Inherited aggregation (primary); OI NaN→0 silently zeroing the score; mark = 0 passing the NaN-only check; minOI 25 insufficient against the ratio term.

**Manual Test Cases**
Same contract, same moment: 2m bar vol 37 → score ≈ 0 (fails $250k gate); DAY vol 63,186 → score in the hundreds. Identical market, two answers.

**Verdict**
**UNSTABLE OR CONTEXT-DEPENDENT → REPLACE.**

**Recommended Display Name**
Two explicitly-windowed heuristics: `Flow Conc. (10-min)` and `Flow Conc. (Session)` — both labeled proprietary scores. Prefer percentile-ranking within the chain snapshot on the website over fixed tiers.

**Corrected ThinkScript** — Code Pack, Blocks 11A (Recent) and 11B (Session).

---

### Column 12 — BUY STRIKE (Contract Quality Signal)

**Purpose**
Composite 0–100 score + BUY/WATCH/SKIP label for short-term contract selection.

**Current Formula**
proximity(≤25) + buyPressure(≤25, from sellPct) + netBuy(≤25, from netBuyRatio) + premium(≤15) + volume(≤10) ± momentum(10), clipped to [0,100]; eligibility: dist ≤ 40 pts, roll vol ≥ 25, fresh ≥ $10k, net buy ≥ $5k, sellPct ≤ 50. BUY ≥ 75 **and** momentum-aligned; WATCH ≥ 58.

**Input Data Sources**
Strike, underlying (with `[5]` historical indexing of the secondary symbol — supported; early-bar NaN guarded to 0), option OHLCV, close-location proxy. **No bid/ask, no contract-price cap, no OI, no expiration check.**

**Aggregation and Timing**
**Direct conflict:** the file header mandates 2-minute for flow columns; this script's own comment says "Set Custom Quote aggregation to 1 minute." Every threshold below (momentum %, premium $, volume) is window-dependent, so this isn't cosmetic. **Resolution: standardize on 2-minute** so the score's pressure/premium/volume inputs describe the same 10-minute window as Columns 2/7/8/9, and rescale thresholds accordingly (the Code Pack block does).

**Units Check**
Score: dimensionless 0–100. Sub-units verified (premium in $M, distance in points, momentum in %).

**Mathematical Validation — the double-count, derived exactly**
netBuyRatio = netBuyM ÷ freshPremM = Σpᵢvᵢ(1−2sᵢ) ÷ Σpᵢvᵢ = **1 − 2·s̄** (premium-weighted mean sell fraction). SellPct = 100·s̄ (volume-weighted). Within a 10-minute window per-bar prices are nearly constant, so the two means coincide and **netBuyRatio ≈ 1 − SellPct/50**. The "two" scores are two lookup tables on **one variable**: SellPct ≤ 30 ⇒ ratio ≥ 0.40 ⇒ 25 + 20 = 45 pts; SellPct ≤ 25 ⇒ ratio ≥ 0.50 ⇒ **50 of 100 points from a single candle-location proxy.** Additionally, volumeScore double-counts volume already embedded in premiumScore (premium = vol × price). Independent evidence dimensions: proximity, liquidity (premium∪volume), candle-location (counted twice), momentum — **four**, with weight concentrated on the weakest.
Max-score check: 25+25+25+15+10 = 100 before momentum; +10 aligned → 110 → clipped to 100, so clipping erases differentiation among the strongest contracts. A score of 90 can include momentum **against** (100 − 10) and still print WATCH; BUY is protected only by the separate `momentumAligned` requirement.
Momentum threshold: 0.03% over the window ≈ **2.2 SPX pts / ~9 NDX pts per 10 minutes** — satisfied by ordinary noise on virtually every bar, so the ±10 swings are coin-flip jitter, not confirmation.

**Thinkorswim Compatibility**
Compiles. The `SortKey` plot + `AddLabel` pattern is the community-standard way to get sortable label columns — VERIFY on your build that sorting follows the plot. **The exported cell is the label text** (`BUY C 7400 | 86`), which is what the website would have to parse — keep the format frozen if the site ever consumes it.

**What It Can Prove**
That a contract is near the money, recently active, and printing toward the high of its recent range while the underlying drifted the right way.

**What It Cannot Prove**
A "BUY." The dominant input cannot prove initiator side (Column 2's limits inherit wholesale); there is no spread filter (0DTE far-OTM spreads of 30–100% pass silently), **no ≤ $5.00 price cap despite that being the dashboard's stated selection goal** (the website caps client-side; the signal does not), no quote-freshness or expiry check.

**Failure Modes**
Deep-ITM strikes score 25 proximity points by definition; a wide-spread illiquid contract with three lucky prints scores BUY; aggregation drift silently rescales every threshold; clipped ties at 100.

**Manual Test Cases**
Strong: dist 8 (25) + sellPct 28 (25) + ratio .44 (20) + prem .12M (15) + vol 1,400 (10) = 95, aligned → clipped 100 → `BUY C`. Mediocre: sellPct 47 → 8 + 8 pressure/netBuy → 58 → WATCH on the same noise variable. Missing: NaN sellPct → ineligible → SKIP ✓.

**Verdict**
**MATHEMATICALLY VALID BUT MISLABELED** — and structurally double-counted.

**Recommended Display Name**
`Contract Flow Score` with labels `ACTIONABLE C/P | WATCH C/P | LOW | NO DATA`. "BUY" should not appear anywhere this proxy-dominated.

**Corrected ThinkScript** — Code Pack, Block 12: single merged pressure score (30), percent-based proximity (20), premium (20), volume (10), graded momentum (20, with a real threshold and a dead-band), eligibility adds max price $5.00, max spread % via bid/ask, and momentum-against hard-blocks ACTIONABLE. Max = exactly 100, no clipping.

---

## CROSS-COLUMN DEPENDENCY MAP

```
RAW INPUTS
  Option H,L,C,V (per bar) ──► sellFraction s = (H−C)/(H−L)   ◄── ONE variable
  Option price (mark/last/close)                                   feeds FIVE displays
  OI (prior clearing, DAY)
  Gamma() (theoretical, current)
  Underlying close (secondary symbol)

DERIVED LAYERS
  s ──────────────► #2 Sell %                      (display of s)
  s ──────────────► #3 Flow State                  (thresholds on s)
  V×price ────────► #7 Fresh Gross Premium         (gross)
  V×price×(1−2s) ─► #9 FNPF (option-side)          (gross × s)
  ±(#9 by IsPut) ─► #8 Dollar Flow (market-side)   (sign flip of #9)
  s + V×price ────► #12 buyPressure + netBuy = up to 50/100 pts  (s twice)
  V, V×price ─────► #12 volumeScore + premiumScore (volume twice)
  OI ─────────────► #4 GEX, #5 OI $M, #6 Vol/OI, #11 Flow Conc
  Gamma ──────────► #4 only
  Underlying ─────► #1 Distance, #12 momentum
```

**Consequence for the website:** Sell %, Flow State, Dir. Flow (#8), FNPF (#9), and half of the contract score are **one proxy rendered five ways**. A row showing green Sell %, BULL_CALL_BUY, positive Dir. Flow, positive FNPF, and a high score has produced **one** piece of evidence, not five confirmations. Truly independent axes in the whole suite: (1) proximity/structure, (2) gross activity (volume·premium), (3) OI structure (incl. GEX magnitude), (4) candle-location pressure, (5) underlying momentum. Any "confluence" logic in app.js must count axes, not columns. (Today app.js partially compounds this: `inferDirectionalFlow` falls back from Dollar Flow → FNPF → Sell %-connotation — three names, same number.)

## AGGREGATION MATRIX

| Column | Intended Aggregation | Actual Code Behavior | Correct Setting | Window Represented |
|---|---|---|---|---|
| 1 Distance | any | current bar of column agg; NaN-prone secondary fetch | 2 MIN (or any intraday) | instantaneous |
| 2 Sell % | 2m × 5 | as coded at column agg | 2 MIN | 10 minutes |
| 3 Flow State | 2m × 5 | as coded; **export proved instance desync vs #2** | 2 MIN | 10 minutes |
| 4 GEX | current + DAY OI | Γ at column agg w/ unbounded carry; OI explicit DAY ✓ | 2 MIN | now (Γ) / prior day (OI) |
| 5 OI $M | DAY | bare OI valid only because column is DAY | DAY (make period explicit) | prior clearing × last trade |
| 6 Vol/OI | DAY data | explicit DAY periods ✓ — aggregation-safe | any (2 MIN fine) | session ÷ prior day |
| 7 Fresh Prem | 2m × 5 | as coded; **comment says 1-minute — wrong** | 2 MIN | 10 minutes |
| 8 Dollar Flow | 2m × 5 | as coded; **export's DWF shows a live instance drifted to session scale** | 2 MIN | 10 minutes |
| 9 FNPF | 2m × 5 | as coded | 2 MIN | 10 minutes |
| 10 OVR Prem | DAY | explicit DAY ✓; ext-hours effect on vwap unverified | DAY | session |
| 11 Flow Conc | "2m by 5" per header | **inherits column agg; uses 1 bar, not 5; OI period unspecified** | REPLACE (11A: 2 MIN / 11B: DAY) | undefined as coded |
| 12 Buy Strike | header: 2m / script: **1m** | thresholds calibrated to neither | 2 MIN, rescaled thresholds | 10 minutes |

## DATA-SOURCE MATRIX

| Column | Price Source | Volume Source | OI Source | Greek Source | Missing-Data Behavior |
|---|---|---|---|---|---|
| 1 | underlying close → **option close (BAD)** | — | — | — | fallback fabricates value |
| 2 | OHLC only | 5-bar rolling | — | — | NaN ✓ / flat-bar 0.50 |
| 3 | OHLC only | 5-bar rolling (ungated) | — | — | NO_DATA ✓ |
| 4 | underlying close (spot) | — | DAY explicit | Gamma() w/ unbounded carry | NaN plot ✓ / stale-carry hazard |
| 5 | option daily close (stale-prone) | — | bare (DAY column) | — | **NaN→0 (false zero)** |
| 6 | — | DAY explicit | DAY explicit | — | NaN ✓ |
| 7 | mark → last → 0 | 5-bar rolling | — | — | price-missing→$0 (false zero) |
| 8 | **close** (inconsistent) | 5-bar, min=1 | — | — | NaN if no volume ✓ |
| 9 | mark → last → 0 | 5-bar, ungated | — | — | 0 (false zero) |
| 10 | vwap → **current mark/last (BAD fallback)** | DAY | — | — | fallback fabricates value |
| 11 | mark (no >0 check) → last | **1 bar, inherited agg** | **unspecified period** | — | NaN→0 zeroes score silently |
| 12 | close; no bid/ask | 5-bar rolling | none | none | guarded to SKIP ✓ |

**Recommended uniform price hierarchy:** intraday columns: MARK (>0) → LAST (>0) → **NaN**; DAY columns: LAST → NaN. No column may ever substitute the option's own price for the underlying, or a current quote for a session average.

## RENAME MATRIX

| Current Name | Accurate Name | Exact / Derived / Proxy / Score | Reason |
|---|---|---|---|
| Distance to Spot (Pts) | Dist (Pts) + Dist % | Derived | exact once fallback removed; add % for SPX/NDX comparability |
| SELL % | Sell-Pressure % (Est.) | Proxy | close-location, not executed sell volume |
| FLOW STATE | Flow Pressure State | Proxy | `*_PRESSURE` states; intent is unknowable |
| GEX Proxy $M/1% | GEX Proxy $M/1% (conv. C+/P−) | Proxy | sign is convention, not dealer observation |
| OI Dollar Value $M | OI Market Value (Last) $M | Derived | marked value, not invested/locked capital |
| Vol/OI Ratio | Vol/OI (Turnover) | Derived | turnover, not confirmed opening |
| Fresh Prem $M | Fresh Gross Premium (Est.) $M | Estimate | gross, window-stamped |
| Dollar Flow $M | Directional Premium Proxy $M | Proxy | not actual money flow |
| FNPF $M | Net Option Premium Proxy $M (option-side) | Proxy | P+ = put buying = bearish — must be stated |
| OVR Prem $M / "Cumulative Premium Flow" | Session Gross Premium (Est.) $M | Derived/Estimate | "flow" implies net; it is gross |
| Flow Concentrate | Flow Conc. (10-min) / (Session) | Score | proprietary heuristic, explicit window |
| BUY STRIKE | Contract Flow Score (ACTIONABLE/WATCH) | Score | "BUY" exceeds the evidence |

**Pipeline note:** the website's parser matches CSV header text. Renaming columns in Thinkorswim changes exported headers — either update app.js aliases in the same commit, or keep machine headers stable and change only display names on the site. Do not rename in one place only.

## SPX vs NDX CONFIGURATION PRESETS

Scale anchor from your own exports: SPX ≈ 7,394, NDX ≈ 29,4xx → **≈ 4.0×**. Fixed point thresholds do not transfer; percent thresholds do.

| Parameter | SPX 0DTE | SPX 1DTE | NDX 0DTE | NDX 1DTE | Scale-free alternative |
|---|---|---|---|---|---|
| Distance heat (hot/warm/active) | 10/25/50 pts | 15/35/70 | 40/100/200 | 60/140/280 | **0.15% / 0.35% / 0.70%** |
| Buy-Strike max distance | 40 pts | 55 | 160 | 220 | **0.55% / 0.75%** |
| Momentum threshold (10-min) | 0.08% | 0.06% | 0.10% | 0.08% | ATR- or expected-move-normalized |
| Fresh-prem eligibility floor | $10k | $10k | $15k | $15k | percentile within chain |
| Rolling-volume floor | 25 | 25 | 10 | 10 | NDX volume is structurally thinner |
| Max spread (eligibility) | 12% | 10% | 15% | 12% | of mark |
| Strike-step note | verify 5-pt near ATM | — | verify 10/25-pt | — | the site's Steps column already normalizes — prefer it |

## 0DTE vs 1DTE ADJUSTMENTS

**0DTE:** Γ is unstable and empirically NaN-prone into the close (your SPX close export: GEX NaN on every row) — cap gamma-carry at ~5 bars and treat final-hour GEX as unavailable; OI is blind to same-day opens, so Vol/OI and GEX understate 0DTE reality structurally — disclose on the site; premium decay makes the OVR fallback error maximal — fallback must be dead; price-based gates ($5 cap) pass more strikes as the day ages — that is correct behavior, but spread gates matter most exactly then. **1DTE/overnight:** marks are stale premarket (the site's "overnight" mode warning is right); Sell %/flow windows describe the prior session until ~5 bars post-open — suppress directional states for the first 10 minutes; OI is one cycle fresher relative to the trade horizon, so Vol/OI is more meaningful on 1DTE than 0DTE.

## CSV EXPORT SAFETY (Thinkorswim → website)

1. **Exports capture displayed cell text.** Numeric plots export as numbers; label columns export label strings (`NO_DATA`, `BUY C 7400 | 86`). The label format is an API contract with app.js — freeze it.
2. **`loading` cells are real and frequent** (NDX export riddled with them; PTS especially). Export only after columns finish populating; the parser's null-set (`nan|loading|n/a|—|-`) already handles them — corrected scripts emit NaN rather than fake zeros precisely so this path triggers.
3. **NaN must reach the CSV as NaN.** Columns 5/7/9/11 currently convert missing data to 0 — the website then averages, ranks, and scores fiction. The corrected pack fixes all four.
4. **GEX NaN kills 31% of structureScore silently.** app.js weights nGex at 0.31; with the observed all-NaN GEX column, the site's top-weighted input contributes zero with no data-quality flag tied to it. Add a quality check: "GEX coverage X%".
5. **The two watchlists export different column sets** (SPX lacks Cum Prem $M, Flow Concentrate, raw Volume/Open.Int/High/Low that NDX has). Harmonize the four watchlists so all dashboards have identical inputs.
6. **Columns not in the audited file** appeared in exports: `0DTE Delta`, `Net Dominance`, `Gamma Trap`, `DHP`, `Fresh %`. Their scripts were not provided — they are unaudited and should be treated as unverified until submitted.
7. Locale/thousands separators: current exports are clean, but if ToS regional settings ever add `1,234.00`, the parser's `Number()` will null them — keep settings as-is.

## PRIORITY FIX LIST

**Critical — values materially wrong or misleading**
1. Column 1 fallback (option price as underlying) — fabricates distances; poisons the site's preferred spot source.
2. Column 10 fallback (current quote × full session volume) — up to ~98% misstatement on 0DTE decay days, unflagged.
3. Column 11 inherited aggregation — the metric's time window is undefined; exported values are unattributable.
4. Suite-wide aggregation conflict (1m comment in #7 and #12 vs 2m standard; DWF export evidence of live drift) — every rolling threshold's meaning depends on resolving this.

**High — calculation works but interpretation is unsafe**
5. Column 12: 50/100 points from one proxy + "BUY" label + missing $5 cap and spread gate.
6. Column 3: intent-asserting labels, no volume gate, thin 45/55 band (and the exported-state desync).
7. Columns 5/7/9: missing data silently becomes 0 — false zeros enter the analytical pipeline.
8. Column 4: unbounded gamma carry (stale Γ × moving spot) + undisclosed 0DTE OI blindness; site weights it 31%.
9. Column 8: minRollingVolume = 1.

**Medium — thresholds or aggregation need improvement**
10. SPX/NDX preset split (all point-based thresholds).
11. Column 6 low-OI heat distortion; export raw vol/OI everywhere.
12. Unified price hierarchy (mark→last→NaN) across #7/#8/#9/#11.
13. Explicit `period = AggregationPeriod.DAY` on every OI call.

**Low — display, color, comment cleanup**
14. Dead all-black `AssignBackgroundColor` blocks (#2 and Distance's redundancy); #10's 4-decimal rounding; comment hygiene (every "one-minute" reference; every "sell volume" claim).

## EMPIRICAL TEST PLAN (Thinkorswim validation)

Run during RTH, mid-morning, on the standard 2-minute configuration after fixes.

1–4. Pick four contracts: liquid ATM SPX call; liquid ATM SPX put; a low-OI contract (OI < 50); a far-OTM contract (>0.6% out). Repeat the whole grid for NDX.
5. For each, record from native ToS fields at one timestamp: Strike, Underlying (Last), Bid, Ask, Mark, Last, Volume (day), Open Interest, Gamma, and the last five 2-minute bars' H/L/C/V.
6–7. Hand-calculate each column with the formulas in this report; compare to the displayed Custom Quote. Tolerances: Distance ±0.1 pt (underlying moves between reads); Sell%/flow family ±2% (bar boundary timing); GEX ±5% (greek refresh); OI $M and Vol/OI exact; OVR within the bid/ask band around VWAP.
8. Repeat at 1-minute aggregation and confirm every rolling value changes window (if it doesn't, the column is pinned to something other than the column aggregation — investigate).
9. Repeat ~9:35 ET (expect NaN/NO_DATA storms — correct behavior), midday, and 15:45 ET (expect Γ degradation on 0DTE — confirm the staleness cap fires).
10. Repeat for NDX; confirm preset thresholds, not SPX values, are loaded.
11. Export each watchlist; diff CSV values against screenshots of the same moment. Any label column: confirm exported text exactly matches the parser contract.
12. Restart ToS and re-export; flow-family values will differ (bars rebuilt) — confirm *session* columns (5, 6, 10) reproduce within rounding, which is the reproducibility boundary of this dataset.

**Verification worksheet (per contract):**

| Field (native ToS) | Value | Column under test | Hand calc | Displayed | Match? |
|---|---|---|---|---|---|
| Underlying Last | | 1 Dist | \|K−U\| | | ±0.1 |
| 5-bar H/L/C/V | | 2 Sell% | Σv·s/Σv | | ±2% |
| (derived) | | 3 State | threshold map | | exact |
| Gamma, OI, U | | 4 GEX | Γ·OI·100·U²·0.01/1e6 | | ±5% |
| OI, Last | | 5 OI $M | OI·P·100/1e6 | | exact |
| Day Vol, OI | | 6 Vol/OI | V/OI | | exact |
| 5-bar V, Mark | | 7 Fresh | ΣV·M·100/1e6 | | ±2% |
| + sell fracs | | 8/9 Flow/FNPF | gross·(1−2s̄)(±) | | ±2% |
| Day Vol, VWAP | | 10 Session | V·VWAP·100/1e6 | | band |
| per 11A/11B | | 11 Conc | formula as labeled | | exact |
| all above | | 12 Score | component sum | | exact |

---

## FINAL REPLACEMENT CODE PACK

Thirteen standalone Custom Quote scripts (Blocks 1–10, 11A, 11B, 12). Each script's first line states the aggregation it must be configured with. Shared conventions: missing data = `Double.NaN` (never 0); intraday price hierarchy MARK(>0) → LAST(>0) → NaN; every `open_interest()` call carries an explicit period; one `AssignBackgroundColor` per script. SPX-0DTE defaults are loaded; NDX/1DTE values from the preset table are noted inline. `AsText(x, "%1$.0f")` printf formatting and Custom Quote sorting-by-plot-with-label are community-standard — confirm both on your build (test plan, step 11).

### Block 1 — Dist (Pts / %)

```
# CUSTOM QUOTE AGGREGATION: 2 MINUTES (any intraday acceptable)
# Dist — distance from strike to live underlying.
# FIX: no fallback to the option's own price. Underlying missing => NaN.
# Plot stays ABSOLUTE POINTS by default so the site's PTS-based spot
# estimation keeps working. Duplicate the column with mode = Percent for
# the Dist % twin. Renames change CSV headers — update app.js aliases in
# the same commit.

input mode = {default Points, Percent};
input hotPts = 10.0;     # SPX 0DTE. NDX: 40   (percent-equivalent 0.15%)
input warmPts = 25.0;    # SPX 0DTE. NDX: 100  (0.35%)
input activePts = 50.0;  # SPX 0DTE. NDX: 200  (0.70%)
input hotPct = 0.15;
input warmPct = 0.35;
input activePct = 0.70;

def und = close(symbol = GetUnderlyingSymbol());
def K = GetStrike();
def ok = !IsNaN(und) and und > 0;
def distAbs = if ok then AbsValue(K - und) else Double.NaN;
def distPct = if ok then 100 * distAbs / und else Double.NaN;

def hot    = if mode == mode.Percent then hotPct    else hotPts;
def warm   = if mode == mode.Percent then warmPct   else warmPts;
def active = if mode == mode.Percent then activePct else activePts;
def shown  = if mode == mode.Percent then distPct else distAbs;

plot Data = Round(shown, if mode == mode.Percent then 2 else 1);
Data.AssignValueColor(
    if IsNaN(shown) then Color.GRAY
    else if shown <= hot then Color.CYAN
    else if shown <= warm then Color.WHITE
    else if shown <= active then Color.LIGHT_GRAY
    else Color.DARK_GRAY);
AssignBackgroundColor(
    if IsNaN(shown) then Color.BLACK
    else if shown <= hot then CreateColor(0, 55, 55)
    else Color.BLACK);
```

### Block 2 — Sell-Pressure % (Est.)

```
# CUSTOM QUOTE AGGREGATION: 2 MINUTES
# Sell-Pressure % (Est.) — volume-weighted close-location proxy over the
# last 5 bars (= 10 minutes at 2m). Estimates where volume printed inside
# each bar's range. It does NOT measure bid-hit execution, order intent,
# opening vs closing, or institutional activity.
# FIX: minimum-volume gate (thin prints => NaN); dead background code
# replaced with a real heat ramp.

input lookbackBars = 5;
input minRollingVolume = 25;   # NDX: 10

def rng = high - low;
def sellFrac = if rng > 0 then Max(0, Min(1, (high - close) / rng)) else 0.5;
def totVol = Sum(volume, lookbackBars);
def sellPct = if totVol >= minRollingVolume
              then 100 * Sum(volume * sellFrac, lookbackBars) / totVol
              else Double.NaN;

plot Data = Round(sellPct, 0);
Data.AssignValueColor(
    if IsNaN(sellPct) then Color.GRAY
    else if sellPct >= 65 then Color.RED
    else if sellPct >= 55 then Color.LIGHT_RED
    else if sellPct <= 35 then Color.GREEN
    else if sellPct <= 45 then Color.LIGHT_GREEN
    else Color.WHITE);
AssignBackgroundColor(
    if IsNaN(sellPct) then Color.BLACK
    else if sellPct >= 65 then CreateColor(60, 0, 0)
    else if sellPct <= 35 then CreateColor(0, 50, 0)
    else Color.BLACK);
```

### Block 3 — Flow Pressure State

```
# CUSTOM QUOTE AGGREGATION: 2 MINUTES
# Flow Pressure State — threshold classifier on the close-location proxy.
# States describe PRESSURE, not proven intent. Put buy pressure is colored
# RED because it is bearish for the underlying.
# FIX: renamed states; 40/60 band (was 45/55); volume gate; explicit
# INSUFFICIENT_DATA. No plot (matches original; the site recomputes state
# from Sell % anyway). Exported text is an API contract with app.js —
# update normalizeFlowState aliases in the same commit as any rename.

input lookbackBars = 5;
input minRollingVolume = 25;   # NDX: 10
input buyThreshold = 40;       # sellPct <= this => buy pressure
input sellThreshold = 60;      # sellPct >= this => sell pressure

def rng = high - low;
def sellFrac = if rng > 0 then Max(0, Min(1, (high - close) / rng)) else 0.5;
def totVol = Sum(volume, lookbackBars);
def sellPct = if totVol >= minRollingVolume
              then 100 * Sum(volume * sellFrac, lookbackBars) / totVol
              else Double.NaN;
def isP = IsPut();

AddLabel(yes,
    if IsNaN(sellPct) then "INSUFFICIENT_DATA"
    else if sellPct <= buyThreshold and !isP then "CALL_BUY_PRESSURE"
    else if sellPct <= buyThreshold and isP then "PUT_BUY_PRESSURE"
    else if sellPct >= sellThreshold and !isP then "CALL_SELL_PRESSURE"
    else if sellPct >= sellThreshold and isP then "PUT_SELL_PRESSURE"
    else "MIXED",
    if IsNaN(sellPct) then Color.GRAY
    else if sellPct <= buyThreshold then (if isP then Color.RED else Color.GREEN)
    else if sellPct >= sellThreshold then (if isP then Color.GREEN else Color.RED)
    else Color.WHITE);
```

### Block 4 — GEX Proxy $M/1% (conv. C+/P−)

```
# CUSTOM QUOTE AGGREGATION: 2 MINUTES
# Signed GEX proxy: Gamma x OI x 100 x S^2 x 0.01 / 1e6 = $M of
# delta-notional change per 1% underlying move. Sign is the CONVENTION
# calls +, puts − (not observed dealer inventory). DAY OI cannot see
# contracts opened today — structurally understates 0DTE gamma.
# FIX: staleness cap on the gamma carry (was unbounded); NaN preserved;
# explicit DAY OI; no fallback spot. Empirical: Gamma() returned NaN for
# the entire SPX 0DTE close export — expect NaN storms late on expiry day;
# that is correct behavior, not a defect.

input maxStaleBars = 5;   # 5 x 2min = 10 minutes max carry

def gammaNow = Gamma();
def oi = open_interest(period = AggregationPeriod.DAY);
def und = close(symbol = GetUnderlyingSymbol());

def gammaHeld = CompoundValue(1,
    if !IsNaN(gammaNow) then gammaNow else gammaHeld[1], Double.NaN);
def staleBars = CompoundValue(1,
    if !IsNaN(gammaNow) then 0 else staleBars[1] + 1, 9999);
def gammaUsed = if !IsNaN(gammaNow) then gammaNow
                else if staleBars <= maxStaleBars then gammaHeld
                else Double.NaN;

def sign = if IsPut() then -1 else 1;
def gex = if IsNaN(gammaUsed) or IsNaN(oi) or oi <= 0 or IsNaN(und) or und <= 0
          then Double.NaN
          else sign * gammaUsed * oi * 100 * Sqr(und) * 0.01 / 1000000;

plot Data = Round(gex, 2);
Data.AssignValueColor(
    if IsNaN(gex) then Color.GRAY
    else if gex >= 100 then Color.CYAN
    else if gex > 0 then Color.GREEN
    else if gex <= -100 then Color.MAGENTA
    else Color.RED);
AssignBackgroundColor(
    if IsNaN(gex) then Color.BLACK
    else if AbsValue(gex) >= 250 then CreateColor(45, 45, 0)
    else Color.BLACK);
```

### Block 5 — OI Market Value (Last) $M

```
# CUSTOM QUOTE AGGREGATION: DAY
# OI Market Value (Last) $M = prior-clearing OI x last trade x 100 / 1e6.
# A MARKED value of standing open contracts — not invested capital, not
# "locked" money. Last can be days old on untraded strikes.
# FIX: NaN preserved (no false $0); explicit DAY periods.

def oi = open_interest(period = AggregationPeriod.DAY);
def px = close(period = AggregationPeriod.DAY);
def oiVal = if IsNaN(oi) or oi <= 0 or IsNaN(px) or px <= 0
            then Double.NaN
            else oi * px * 100 / 1000000;

plot Data = Round(oiVal, 2);
Data.AssignValueColor(
    if IsNaN(oiVal) then Color.GRAY
    else if oiVal >= 5 then Color.CYAN
    else if oiVal >= 1 then Color.ORANGE
    else if oiVal >= 0.25 then Color.WHITE
    else Color.DARK_GRAY);
AssignBackgroundColor(
    if IsNaN(oiVal) then Color.BLACK
    else if oiVal >= 5 then CreateColor(0, 45, 55)
    else Color.BLACK);
```

### Block 6 — Vol/OI (Turnover)

```
# CUSTOM QUOTE AGGREGATION: ANY (data sources are explicit-DAY; 2 MINUTES fine)
# Vol/OI turnover: session volume / prior-clearing OI. Ratio > 1 suggests,
# never proves, opening activity (volume includes closes, rolls, spreads).
# FIX: heat tiers only fire above min-OI/min-volume gates; the raw ratio
# still displays below the gates (gray) so tiny-OI noise can't paint cyan.

input minOI = 25;          # tiers suppressed below this
input minDayVolume = 100;  # NDX: 50
input tier1 = 5.0;
input tier2 = 10.0;
input tier3 = 25.0;

def v = volume(period = AggregationPeriod.DAY);
def oi = open_interest(period = AggregationPeriod.DAY);
def ratio = if IsNaN(v) or IsNaN(oi) or oi <= 0 then Double.NaN else v / oi;
def gated = !IsNaN(ratio) and oi >= minOI and v >= minDayVolume;

plot Data = Round(ratio, 1);
Data.AssignValueColor(
    if IsNaN(ratio) then Color.GRAY
    else if !gated then Color.DARK_GRAY
    else if ratio >= tier3 then Color.CYAN
    else if ratio >= tier2 then Color.ORANGE
    else if ratio >= tier1 then Color.WHITE
    else Color.GRAY);
AssignBackgroundColor(
    if gated and ratio >= tier3 then CreateColor(0, 45, 55)
    else Color.BLACK);
```

### Block 7 — Fresh Gross Premium (Est.) $M

```
# CUSTOM QUOTE AGGREGATION: 2 MINUTES
# Fresh GROSS premium over the last 5 bars AT THE COLUMN AGGREGATION
# (= 10 minutes at 2m). Gross turnover — says nothing about direction.
# FIX: comment no longer claims "one-minute"; price hierarchy
# mark > 0 -> last > 0 -> NaN; a bar with volume but no usable price
# propagates NaN (honest) instead of contributing $0.
# Historical PriceType.MARK depth in Custom Quotes: VERIFY EMPIRICALLY.

input lookbackBars = 5;
input tier1 = 0.25;
input tier2 = 1.0;
input tier3 = 5.0;

def mk = close(priceType = PriceType.MARK);
def px = if !IsNaN(mk) and mk > 0 then mk
         else if !IsNaN(close) and close > 0 then close
         else Double.NaN;
def barPrem = if volume == 0 then 0 else volume * px * 100;
def freshM = Sum(barPrem, lookbackBars) / 1000000;

plot Data = Round(freshM, 2);
Data.AssignValueColor(
    if IsNaN(freshM) then Color.GRAY
    else if freshM >= tier3 then Color.CYAN
    else if freshM >= tier2 then Color.ORANGE
    else if freshM >= tier1 then Color.WHITE
    else Color.DARK_GRAY);
AssignBackgroundColor(
    if !IsNaN(freshM) and freshM >= tier3 then CreateColor(0, 45, 55)
    else Color.BLACK);
```

### Block 8 — Directional Premium Proxy $M (market-side)

```
# CUSTOM QUOTE AGGREGATION: 2 MINUTES
# Candle-location-weighted directional premium, MARKET direction:
# + bullish (call buy-pressure or put sell-pressure), − bearish.
# A linear transform of (gross premium x the Sell % proxy) — NOT
# independent evidence and NOT actual money flow.
# FIX: minRollingVolume raised 1 -> 25; price unified on mark -> last
# -> NaN (was close, inconsistent with siblings).

input lookbackBars = 5;
input minRollingVolume = 25;   # NDX: 10

def rng = high - low;
def loc = if rng > 0 then Max(0, Min(1, (close - low) / rng)) else 0.5;
def dirFactor = 2 * loc - 1;   # +1 closed at high ... -1 closed at low
def mk = close(priceType = PriceType.MARK);
def px = if !IsNaN(mk) and mk > 0 then mk
         else if !IsNaN(close) and close > 0 then close
         else Double.NaN;
def mktSign = if IsPut() then -1 else 1;
def barFlow = if volume == 0 then 0 else volume * px * 100 * dirFactor * mktSign;
def totVol = Sum(volume, lookbackBars);
def flowM = if totVol >= minRollingVolume
            then Sum(barFlow, lookbackBars) / 1000000
            else Double.NaN;

plot Data = Round(flowM, 3);
Data.AssignValueColor(
    if IsNaN(flowM) then Color.GRAY
    else if flowM > 0 then Color.GREEN
    else if flowM < 0 then Color.RED
    else Color.WHITE);
AssignBackgroundColor(
    if IsNaN(flowM) then Color.BLACK
    else if flowM >= 0.25 then CreateColor(0, 50, 0)
    else if flowM <= -0.25 then CreateColor(60, 0, 0)
    else Color.BLACK);
```

### Block 9 — Net Option Premium Proxy $M (option-side)

```
# CUSTOM QUOTE AGGREGATION: 2 MINUTES
# Option-side net premium estimate: + = net buying of THIS contract,
# − = net selling of it. CRITICAL READING NOTE: positive on a PUT means
# put BUYING, which is BEARISH for the underlying. Value color is by
# MARKET direction to prevent that misread; the number stays option-side.
# Same engine as Block 8 (sign flip only) — same evidence, not new.
# FIX: volume gate added; mark -> last -> NaN hierarchy.

input lookbackBars = 5;
input minRollingVolume = 25;   # NDX: 10

def rng = high - low;
def sellFrac = if rng > 0 then Max(0, Min(1, (high - close) / rng)) else 0.5;
def mk = close(priceType = PriceType.MARK);
def px = if !IsNaN(mk) and mk > 0 then mk
         else if !IsNaN(close) and close > 0 then close
         else Double.NaN;
def barNet = if volume == 0 then 0 else volume * px * 100 * (1 - 2 * sellFrac);
def totVol = Sum(volume, lookbackBars);
def fnpfM = if totVol >= minRollingVolume
            then Sum(barNet, lookbackBars) / 1000000
            else Double.NaN;
def mktM = if IsPut() then -fnpfM else fnpfM;   # market-direction view

plot Data = Round(fnpfM, 3);
Data.AssignValueColor(
    if IsNaN(mktM) then Color.GRAY
    else if mktM > 0 then Color.GREEN
    else if mktM < 0 then Color.RED
    else Color.WHITE);
AssignBackgroundColor(Color.BLACK);
```

### Block 10 — Session Gross Premium (Est.) $M

```
# CUSTOM QUOTE AGGREGATION: DAY
# Session GROSS premium = day volume x day option VWAP x 100 / 1e6.
# Exact identity when VWAP is real. "Flow" removed from the name — this
# is gross, not net.
# FIX: the fallback that priced the ENTIRE session's volume at the
# current quote (up to ~98% error on 0DTE decay) is DELETED. VWAP
# missing => NaN; the site renders "—" instead of fiction.
# vwap() on individual option symbols: VERIFY EMPIRICALLY (NDX export's
# Cum Prem values are consistent with a real VWAP, but confirm per chain).

input tier1 = 0.5;
input tier2 = 2.5;
input tier3 = 10.0;

def v = volume(period = AggregationPeriod.DAY);
def vw = vwap(period = AggregationPeriod.DAY);
def premM = if IsNaN(v) then Double.NaN
            else if v == 0 then 0
            else if IsNaN(vw) or vw <= 0 then Double.NaN
            else v * vw * 100 / 1000000;

plot Data = Round(premM, 2);
Data.AssignValueColor(
    if IsNaN(premM) then Color.GRAY
    else if premM >= tier3 then Color.CYAN
    else if premM >= tier2 then Color.ORANGE
    else if premM >= tier1 then Color.WHITE
    else Color.DARK_GRAY);
AssignBackgroundColor(
    if !IsNaN(premM) and premM >= tier3 then CreateColor(0, 45, 55)
    else Color.BLACK);
```

### Block 11A — Flow Conc. (10-min) [proprietary score]

```
# CUSTOM QUOTE AGGREGATION: 2 MINUTES
# Recent flow concentration, EXPLICIT window: (5-bar volume / DAY OI) x
# sqrt(5-bar gross premium $M). Declared heuristic — hybrid units, tune
# tiers from a week of your own exports (percentile-rank on the site is
# better than fixed tiers).
# FIX (vs original Flow Concentrate): window pinned (was inherited and
# undefined); OI period explicit; mark requires > 0; OI NaN => NaN score
# (was silently zeroed).

input lookbackBars = 5;
input minRollVolume = 100;   # NDX: 50
input minOI = 50;
input minPremiumM = 0.05;
input tier1 = 1.0;
input tier2 = 5.0;
input tier3 = 20.0;

def mk = close(priceType = PriceType.MARK);
def px = if !IsNaN(mk) and mk > 0 then mk
         else if !IsNaN(close) and close > 0 then close
         else Double.NaN;
def rollVol = Sum(volume, lookbackBars);
def premM = Sum(if volume == 0 then 0 else volume * px * 100, lookbackBars) / 1000000;
def oi = open_interest(period = AggregationPeriod.DAY);
def ok = !IsNaN(oi) and oi >= minOI and rollVol >= minRollVolume
         and !IsNaN(premM) and premM >= minPremiumM;
def score = if !ok then Double.NaN else (rollVol / oi) * Sqrt(premM);

plot Data = Round(score, 2);
Data.AssignValueColor(
    if IsNaN(score) then Color.GRAY
    else if score >= tier3 then Color.CYAN
    else if score >= tier2 then Color.ORANGE
    else if score >= tier1 then Color.WHITE
    else Color.DARK_GRAY);
AssignBackgroundColor(Color.BLACK);
```

### Block 11B — Flow Conc. (Session) [proprietary score]

```
# CUSTOM QUOTE AGGREGATION: DAY
# Session flow concentration, EXPLICIT window: (DAY volume / DAY OI) x
# sqrt(session gross premium $M, VWAP-based). Declared heuristic.
# VWAP missing => NaN (no current-quote fallback — see Block 10).

input minDayVolume = 500;   # NDX: 250
input minOI = 50;
input minPremiumM = 0.25;
input tier1 = 5.0;
input tier2 = 50.0;
input tier3 = 500.0;

def v = volume(period = AggregationPeriod.DAY);
def oi = open_interest(period = AggregationPeriod.DAY);
def vw = vwap(period = AggregationPeriod.DAY);
def premM = if IsNaN(v) or v == 0 or IsNaN(vw) or vw <= 0
            then Double.NaN
            else v * vw * 100 / 1000000;
def ok = !IsNaN(oi) and oi >= minOI and !IsNaN(v) and v >= minDayVolume
         and !IsNaN(premM) and premM >= minPremiumM;
def score = if !ok then Double.NaN else (v / oi) * Sqrt(premM);

plot Data = Round(score, 1);
Data.AssignValueColor(
    if IsNaN(score) then Color.GRAY
    else if score >= tier3 then Color.CYAN
    else if score >= tier2 then Color.ORANGE
    else if score >= tier1 then Color.WHITE
    else Color.DARK_GRAY);
AssignBackgroundColor(Color.BLACK);
```

### Block 12 — Contract Flow Score (ACTIONABLE / WATCH / LOW / NO DATA)

```
# CUSTOM QUOTE AGGREGATION: 2 MINUTES  (resolves the 1m-comment/2m-standard conflict)
# Contract Flow Score 0-100. A HEURISTIC SHORTLIST RANKER — "BUY" does not
# appear because the evidence cannot support it (half the old score came
# from one candle-location proxy).
# Components (max = exactly 100, no clipping):
#   Pressure 30 | Proximity 20 (percent-based) | Premium 20 | Volume 10
#   | Momentum 20 (graded; AGAINST blocks ACTIONABLE and WATCH)
# Eligibility adds the gates the old script lacked: max contract price
# ($5.00 — the dashboard's stated selection goal), max bid/ask spread %,
# percent distance cap, rolling-volume floor, premium floor.
# SPX-0DTE defaults; NDX/1DTE values in the preset table.
# Bid/Ask via close(priceType=...) on the current bar; historical depth:
# VERIFY EMPIRICALLY. Label format "ACTIONABLE C 7400 | 86" is an API
# contract if the site ever parses it — freeze it.

input lookbackBars = 5;
input maxPrice = 5.00;
input maxSpreadPct = 12.0;        # SPX 1DTE: 10, NDX 0DTE: 15, NDX 1DTE: 12
input maxDistancePct = 0.55;      # 1DTE: 0.75
input minRollVolume = 25;         # NDX: 10
input minFreshPremM = 0.01;       # NDX: 0.015
input maxSellPct = 50.0;
input minUnderlyingMovePct = 0.08; # SPX 1DTE: 0.06, NDX 0DTE: 0.10, NDX 1DTE: 0.08
input actionableScore = 75;
input watchScore = 58;

# --- shared engine ---
def rng = high - low;
def sellFrac = if rng > 0 then Max(0, Min(1, (high - close) / rng)) else 0.5;
def totVol = Sum(volume, lookbackBars);
def sellPct = if totVol >= minRollVolume
              then 100 * Sum(volume * sellFrac, lookbackBars) / totVol
              else Double.NaN;

def mk = close(priceType = PriceType.MARK);
def lastPx = close;
def px = if !IsNaN(mk) and mk > 0 then mk
         else if !IsNaN(lastPx) and lastPx > 0 then lastPx
         else Double.NaN;
def freshM = Sum(if volume == 0 then 0 else volume * px * 100, lookbackBars) / 1000000;

def bidP = close(priceType = PriceType.BID);
def askP = close(priceType = PriceType.ASK);
def mid = (bidP + askP) / 2;
def spreadPct = if IsNaN(bidP) or IsNaN(askP) or bidP <= 0 or askP < bidP or mid <= 0
                then Double.NaN
                else 100 * (askP - bidP) / mid;

def und = close(symbol = GetUnderlyingSymbol());
def K = GetStrike();
def distPct = if IsNaN(und) or und <= 0 then Double.NaN
              else 100 * AbsValue(K - und) / und;

def undPrior = und[lookbackBars];
def movePct = if IsNaN(und) or IsNaN(undPrior) or undPrior <= 0 then Double.NaN
              else 100 * (und - undPrior) / undPrior;
def isP = IsPut();
def aligned = !IsNaN(movePct) and
              ((!isP and movePct >= minUnderlyingMovePct) or
               (isP and movePct <= -minUnderlyingMovePct));
def strong  = aligned and AbsValue(movePct) >= 2 * minUnderlyingMovePct;
def against = !IsNaN(movePct) and
              ((!isP and movePct <= -minUnderlyingMovePct) or
               (isP and movePct >= minUnderlyingMovePct));

# --- eligibility (all gates the old script lacked) ---
def eligible = !IsNaN(sellPct) and sellPct <= maxSellPct
               and !IsNaN(px) and px > 0 and px <= maxPrice
               and !IsNaN(spreadPct) and spreadPct <= maxSpreadPct
               and !IsNaN(distPct) and distPct <= maxDistancePct
               and totVol >= minRollVolume
               and !IsNaN(freshM) and freshM >= minFreshPremM;

# --- components (max 100 exactly) ---
def pressureScore = if IsNaN(sellPct) then 0
    else if sellPct <= 30 then 30
    else if sellPct <= 40 then 22
    else if sellPct <= 45 then 14
    else if sellPct <= 50 then 6
    else 0;
def proximityScore = if IsNaN(distPct) then 0
    else if distPct <= 0.10 then 20
    else if distPct <= 0.20 then 16
    else if distPct <= 0.35 then 10
    else if distPct <= 0.55 then 4
    else 0;
def premiumScore = if IsNaN(freshM) then 0
    else if freshM >= 0.10 then 20
    else if freshM >= 0.05 then 15
    else if freshM >= 0.02 then 9
    else if freshM >= 0.01 then 4
    else 0;
def volumeScore = if totVol >= 1000 then 10
    else if totVol >= 500 then 8
    else if totVol >= 200 then 5
    else if totVol >= 50 then 3
    else 0;
def momentumScore = if strong then 20 else if aligned then 12 else 0;

def total = Max(0, Min(100,
    pressureScore + proximityScore + premiumScore + volumeScore + momentumScore));

def isActionable = eligible and aligned and total >= actionableScore;
def isWatch = eligible and !against and !isActionable and total >= watchScore;

def typeIsPut = isP;
plot SortKey = if eligible then total else 0;
SortKey.SetDefaultColor(Color.BLACK);

AddLabel(yes,
    (if !eligible then "NO DATA"
     else if isActionable then "ACTIONABLE " + (if typeIsPut then "P " else "C ") + AsText(K, "%1$.0f") + " | " + AsText(total, "%1$.0f")
     else if isWatch then "WATCH " + (if typeIsPut then "P " else "C ") + AsText(K, "%1$.0f") + " | " + AsText(total, "%1$.0f")
     else "LOW | " + AsText(total, "%1$.0f")),
    if !eligible then Color.DARK_GRAY
    else if isActionable then Color.CYAN
    else if isWatch then Color.YELLOW
    else Color.GRAY);
AssignBackgroundColor(
    if isActionable then CreateColor(0, 55, 55)
    else if isWatch then CreateColor(50, 45, 0)
    else Color.BLACK);
```

---

## FINAL RELIABILITY ASSESSMENT

**1. Which columns are trustworthy as-is?**
Only #6 Vol/OI — explicit DAY periods, exact arithmetic, correct NaN handling — and even it needs the low-OI heat gates before its colors can be trusted. #1's primary path and #4's formula are exact, but both carry defects (fallback; unbounded carry) that disqualify "as-is."

**2. Which are valid but must be renamed?**
#3 (states → `*_PRESSURE`), #5 (→ OI Market Value), #7 (→ Fresh **Gross** Premium), #8 (→ Directional Premium **Proxy**), #9 (→ Net Option Premium **Proxy**, option-side), #10 (→ Session **Gross** Premium — after the fallback is removed), #12 (→ Contract Flow Score; "BUY" must go).

**3. Which are proxy-only (candle-location or convention, not measurement)?**
#2, #3, #8, #9, the sign of #4, and ~half the points in #12. None of these observes executions; all of them observe where prints sat inside bar ranges, or assume a positioning convention.

**4. Which are misleading in their current form?**
#1 (fabricated distances when the underlying feed drops — observed `loading` rows prove the branch fires), #10 (fallback misstates session premium by up to ~98% on 0DTE decay), #5/#7/#9 (missing data displayed as $0.00), #3 (intent-asserting labels on 3-contract windows), #12 ("BUY" from a score that is half one variable).

**5. Which should not be used at all until corrected?**
#1 (it poisons the site's spot estimate), #10, #11 (its time window is literally unknowable from the code), and #12's label tier. GEX (#4) should additionally be treated as unavailable in the final hour of 0DTE — your own close export showed it NaN across the board while the site still weighted it 31%.

**6. Where is the redundancy?**
Sell % (#2), Flow State (#3), Dollar Flow (#8), FNPF (#9), and the pressure+netBuy half of #12 are one degree of freedom: `FNPF = FreshGross × (1 − 2s̄)`, `DollarFlow = FNPF × (puts: −1)`, `netBuyRatio ≈ 1 − SellPct/50`. Five renderings, one number. The suite contains roughly five independent evidence axes total: proximity, gross activity, OI structure, candle-location pressure, underlying momentum.

**7. What should be exported alongside the computed columns?**
Raw day Volume and Open.Int (the NDX list has them; SPX doesn't — harmonize), Bid, Ask, spread %, Mark, underlying snapshot, and an export timestamp. Computed scores without their raw inputs cannot be sanity-checked downstream.

**8. Can this suite support claims about institutional flow?**
No. Nothing in it observes trade size distribution, aggressor side, or account class. Any "institutional" language on the site is unsupported by these inputs.

**9. Can it prove bid/ask execution side (buyer- vs seller-initiated)?**
No. Custom Quote columns see OHLCV bars, not time-and-sales with quote context. Close-location is the best available stand-in and must always be labeled as an estimate.

**10. Can it support "high-probability" contract selection?**
Not as a claim. The corrected #12 is a defensible *shortlist ranker* — eligibility gates plus five graded components — but probability statements require forward-logged outcomes: log every ACTIONABLE/WATCH emission with timestamp and score, track P&L of a standard exit rule, and only then attach numbers to the labels.

**11. What additional data would materially improve the terminal?**
Per-contract Bid/Ask (NBBO) and spread history; Delta and IV (for moneyness- and vol-normalized scoring); day-over-day OI change per strike (true opening-activity evidence); ATM-straddle expected move (to normalize distance and momentum); and trade-level time-and-sales with aggressor classification — the last is not available through Custom Quote columns and is the real ceiling on everything this dashboard can claim.

---

*End of audit. Scope covered the 12 scripts in `SPX GEX TERMINAL COLUMN CODE.txt`; exported columns `0DTE Delta`, `Net Dominance`, `Gamma Trap`, `DHP`, and `Fresh %` were not in that file and remain unaudited.*