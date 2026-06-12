# Wavy Flow Terminal — Pre-Redesign Action Tracker

Source: forensic audit of `SPX GEX TERMINAL COLUMN CODE.txt` and the exported SPX/NDX watchlists.

## Rule for this phase

Do **not** redesign the site until the items marked **BLOCKER** and **HIGH** are complete and empirically validated.

Status legend:
- [ ] Not started
- [~] In progress
- [x] Complete
- [!] Blocked / needs platform verification

---

# Phase 0 — Freeze and Baseline

## WF-000 — Freeze the current production version
- Priority: BLOCKER
- Area: GitHub / Cloudflare
- Action:
  - Tag the current production commit.
  - Save a copy of the current four watchlist layouts.
  - Save one SPX and one NDX CSV export as baseline fixtures.
- Done when:
  - A rollback version exists.
  - Baseline CSVs are stored in `/tests/fixtures/`.

## WF-001 — Create a single aggregation standard
- Priority: BLOCKER
- Area: Thinkorswim
- Standard:
  - Intraday flow columns: **2-minute aggregation, 5-bar lookback = 10 minutes**
  - Daily structure columns: **DAY**
- Intraday columns:
  - Distance
  - Sell Pressure
  - Flow Pressure State
  - GEX Proxy
  - Fresh Gross Premium
  - Directional Premium Proxy
  - Net Option Premium Proxy
  - Recent Flow Concentration
  - Contract Flow Score
- Daily columns:
  - OI Market Value
  - Vol/OI data sources
  - Session Gross Premium
  - Session Flow Concentration
- Done when:
  - Every custom column editor shows the correct aggregation.
  - A screenshot of each configured column is stored for reference.

---

# Phase 1 — Critical Calculation Repairs

## WF-010 — Fix Distance to Spot
- Priority: BLOCKER
- Problem:
  - The current fallback uses the option price when the underlying is missing.
  - This can fabricate a distance near the strike value and corrupt site spot estimation.
- Action:
  - Remove the option-price fallback.
  - Missing underlying must return `Double.NaN`.
  - Keep point distance for site compatibility.
  - Add a separate percentage-distance column for SPX/NDX comparability.
- Done when:
  - Missing underlying displays NaN/loading, never a fabricated number.
  - Hand calculation matches within ±0.1 point.

## WF-011 — Remove false-zero behavior everywhere
- Priority: BLOCKER
- Area:
  - OI Market Value
  - Fresh Gross Premium
  - Net Option Premium Proxy
  - Flow Concentration
  - Any site parser fallback
- Action:
  - Missing data must remain NaN/null.
  - True zero and missing data must be distinguishable.
- Done when:
  - Missing source data exports as `NaN`, `loading`, or blank.
  - The site renders missing values as `—`, not `0`.

## WF-012 — Fix Session Gross Premium fallback
- Priority: BLOCKER
- Problem:
  - Current fallback multiplies full-session volume by the current quote.
  - On 0DTE decay days this can be wrong by more than 90%.
- Action:
  - Use DAY volume × DAY option VWAP only.
  - If VWAP is missing, return NaN.
  - Delete all current mark/last fallback logic for session premium.
- Done when:
  - A missing VWAP produces `—`.
  - No current quote is ever used to price the whole session.

## WF-013 — Replace Flow Concentration
- Priority: BLOCKER
- Problem:
  - Current script inherits the Custom Quote aggregation.
  - Its time window is undefined.
- Action:
  - Replace it with two columns:
    - `Flow Conc. (10-min)` at 2-minute aggregation
    - `Flow Conc. (Session)` at DAY aggregation
  - Use explicit DAY OI in both.
  - Preserve NaN.
- Done when:
  - Each score has a declared window.
  - Changing the UI aggregation no longer changes the intended meaning.

## WF-014 — Standardize price-source hierarchy
- Priority: HIGH
- Intraday standard:
  - MARK > 0
  - else LAST > 0
  - else NaN
- Daily standard:
  - DAY LAST
  - else NaN
- Action:
  - Apply this hierarchy consistently across Fresh Premium, Directional Premium, FNPF, and Recent Flow Concentration.
- Done when:
  - All related scripts use the same price hierarchy.

## WF-015 — Make every OI request explicit
- Priority: HIGH
- Action:
  - Replace every ambiguous `open_interest()` call with:
    - `open_interest(period = AggregationPeriod.DAY)`
- Done when:
  - No custom script contains a bare `open_interest()` call.

---

# Phase 2 — Column-by-Column Corrections

## WF-020 — Sell % → Sell-Pressure % (Estimated)
- Priority: HIGH
- Action:
  - Add minimum rolling volume gate.
    - SPX default: 25
    - NDX default: 10
  - Keep 2-minute × 5 bars.
  - Remove dead background-color code.
  - Rename the site display label.
- Done when:
  - Thin prints return NaN/insufficient data.
  - Site wording never implies true bid-hit execution.

## WF-021 — Flow State → Flow Pressure State
- Priority: HIGH
- Action:
  - Use the same sell-pressure engine as WF-020.
  - Require the same rolling volume gate.
  - Widen thresholds from 45/55 to 40/60.
  - Use labels:
    - CALL_BUY_PRESSURE
    - CALL_SELL_PRESSURE
    - PUT_BUY_PRESSURE
    - PUT_SELL_PRESSURE
    - MIXED
    - INSUFFICIENT_DATA
  - Update parser aliases in the same commit.
- Done when:
  - Sell Pressure and Flow Pressure State agree on every row.
  - No row has real Sell Pressure but `NO_DATA`.

## WF-022 — GEX Proxy hardening
- Priority: HIGH
- Action:
  - Keep the formula as a convention-signed proxy.
  - Add a maximum gamma carry of 5 bars.
  - Use explicit DAY OI.
  - Preserve NaN.
  - Rename display to:
    - `GEX Proxy $M/1% (Convention C+/P−)`
- Done when:
  - Gamma older than 5 bars is rejected.
  - The site shows GEX coverage.
  - GEX is not described as observed dealer inventory.

## WF-023 — OI $M → OI Market Value (Last) $M
- Priority: HIGH
- Action:
  - Use explicit DAY OI and DAY close.
  - Preserve NaN.
  - Rename display text.
- Done when:
  - Missing OI/price is not displayed as zero.
  - Test calculation matches exactly within rounding.

## WF-024 — Vol/OI turnover gates
- Priority: MEDIUM
- Action:
  - Keep the raw ratio.
  - Suppress heat tiers unless:
    - OI ≥ 25
    - SPX day volume ≥ 100
    - NDX day volume ≥ 50
  - Export raw Volume and Open Interest beside it.
- Done when:
  - Tiny-OI contracts no longer paint the strongest heat tier.

## WF-025 — Fresh Premium → Fresh Gross Premium (Estimated)
- Priority: HIGH
- Action:
  - Correct the comment to 2-minute × 5 bars = 10 minutes.
  - Use the standard intraday price hierarchy.
  - Preserve NaN when price is missing but volume exists.
  - Rename display text.
- Done when:
  - It is clearly labeled gross, not net.
  - Missing price does not become $0.

## WF-026 — Dollar Flow → Directional Premium Proxy
- Priority: HIGH
- Action:
  - Raise minimum rolling volume:
    - SPX: 25
    - NDX: 10
  - Use the standard intraday price hierarchy.
  - Preserve NaN.
  - Rename display text.
- Done when:
  - Single-print rows cannot create confident directional readings.
  - The value stays within the same 10-minute scale as Fresh Premium.

## WF-027 — FNPF → Net Option Premium Proxy
- Priority: HIGH
- Action:
  - Add the same rolling-volume gate.
  - Use the same price hierarchy.
  - Preserve NaN.
  - Color by market implication, while keeping the number option-side.
  - Add site note:
    - Positive put value = put buying = bearish for underlying.
- Done when:
  - Zero volume returns NaN, not 0.
  - Put-side interpretation is explicit.

## WF-028 — Replace Buy Strike with Contract Flow Score
- Priority: HIGH
- Action:
  - Set 2-minute aggregation, 5-bar lookback.
  - Remove `BUY` language.
  - New states:
    - ACTIONABLE
    - WATCH
    - LOW
    - NO DATA
  - Add eligibility gates:
    - Premium cap
    - Bid/ask spread
    - Percent distance
    - Minimum rolling volume
    - Minimum fresh premium
    - Momentum alignment
  - Remove double-counting of Sell Pressure and net-buy ratio.
  - Cap score naturally at 100 without clipping.
- Done when:
  - A seller-dominant or extreme-distance contract can never be ACTIONABLE.
  - No contract is recommended solely because it is cheap.

## WF-029 — Remove or quarantine unaudited columns
- Priority: HIGH
- Columns:
  - DWF
  - 0DTE Delta
  - Net Dominance
  - Gamma Trap
  - DHP
  - Fresh %
- Action:
  - Remove them from site scoring.
  - Mark as `UNVERIFIED` if still displayed.
  - Audit their scripts separately before reactivation.
- Done when:
  - None of these fields affects levels, bias, confidence, or contract ranking.

---

# Phase 3 — SPX / NDX / DTE Presets

## WF-030 — Add ticker and DTE presets
- Priority: HIGH
- Presets:

| Parameter | SPX 0DTE | SPX 1DTE | NDX 0DTE | NDX 1DTE |
|---|---:|---:|---:|---:|
| Hot / warm / active distance | 10 / 25 / 50 pts | 15 / 35 / 70 | 40 / 100 / 200 | 60 / 140 / 280 |
| Max contract distance | 0.55% | 0.75% | 0.55% | 0.75% |
| Momentum threshold | 0.08% | 0.06% | 0.10% | 0.08% |
| Min fresh premium | $10K | $10K | $15K | $15K |
| Min rolling volume | 25 | 25 | 10 | 10 |
| Max spread | 12% | 10% | 15% | 12% |

- Done when:
  - The selected manifest dataset automatically loads the correct preset.
  - NDX never uses SPX point thresholds.

## WF-031 — Add 0DTE/1DTE behavior rules
- Priority: HIGH
- 0DTE:
  - GEX can be unavailable late in the day.
  - OI is blind to same-day openings.
  - Spread gates become more important.
- 1DTE / Overnight:
  - Suppress flow interpretation until five fresh post-open bars exist.
  - Show prior-session flow as baseline only.
- Done when:
  - Overnight flow cannot be mistaken for live flow.
  - First 10 minutes show `BUILDING LIVE WINDOW`.

---

# Phase 4 — CSV and Watchlist Standardization

## WF-040 — Harmonize all four watchlists
- Priority: BLOCKER
- Watchlists:
  - SPX 0DTE
  - SPX 1DTE
  - NDX 0DTE
  - NDX 1DTE
- Required identical fields:
  - Symbol
  - Last
  - Mark
  - Bid
  - Ask
  - PTS
  - Sell Pressure
  - Flow Pressure State
  - GEX Proxy
  - Vol/OI
  - OI Market Value
  - Fresh Gross Premium
  - Directional Premium Proxy
  - Net Option Premium Proxy
  - Session Gross Premium
  - Recent Flow Concentration
  - Session Flow Concentration
  - Contract Flow Score
  - Native Volume
  - Native Open Interest
- Done when:
  - All four exports share the same headers and order.

## WF-041 — Add raw audit fields
- Priority: HIGH
- Add:
  - Bid
  - Ask
  - Mark
  - Native Volume
  - Native Open Interest
  - Underlying snapshot
  - Export timestamp
- Done when:
  - Every computed value can be sanity-checked from the export.

## WF-042 — Freeze CSV/API contracts
- Priority: HIGH
- Action:
  - Decide which machine headers remain stable.
  - Update site aliases whenever a Thinkorswim header changes.
  - Freeze label formats for categorical columns.
- Done when:
  - A documented header map exists.
  - Site parser tests cover all aliases.

## WF-043 — Preserve loading and NaN safely
- Priority: HIGH
- Action:
  - Export only after watchlist columns finish loading.
  - Parser null set must include:
    - NaN
    - loading
    - N/A
    - —
    - blank
  - Do not convert missing values to zero.
- Done when:
  - Missing values never enter averages or rankings as zero.

## WF-044 — Keep locale-safe numeric exports
- Priority: MEDIUM
- Action:
  - Keep Thinkorswim export formatting without thousands separators.
  - Add parser support for commas only if needed later.
- Done when:
  - `1,234.00` cannot silently parse as null.

---

# Phase 5 — Website Logic Corrections Before Redesign

## WF-050 — Replace column-counting with independent-axis scoring
- Priority: BLOCKER
- Independent axes:
  1. Structure / proximity
  2. Gross activity
  3. OI / gamma structure
  4. Flow pressure
  5. Underlying momentum
- Action:
  - Sell %, Flow State, FNPF, and Directional Premium count as one axis.
  - Volume and premium are not double-counted.
- Done when:
  - Repeated renderings of the same proxy cannot increase confidence multiple times.

## WF-051 — Remove fixed GEX weighting
- Priority: BLOCKER
- Problem:
  - Site currently gives GEX major weight even when coverage is zero.
- Action:
  - Calculate GEX coverage.
  - Exclude GEX from scoring when coverage is insufficient.
  - Renormalize weights or cap confidence.
- Suggested rule:
  - GEX coverage < 40% → confidence cap 70%.
- Done when:
  - All-NaN GEX cannot produce a normal-confidence market map.

## WF-052 — Add data-quality scoring and warnings
- Priority: HIGH
- Display:
  - PTS coverage
  - GEX coverage
  - OI-value coverage
  - Directional-flow coverage
  - Sell-pressure coverage
  - Session-premium coverage
  - Dataset age
  - Expected aggregation
  - DTE mismatch
  - Excluded low-volume rows
  - Fallback count
- Done when:
  - Every unavailable major input creates a visible warning.

## WF-053 — Correct site display names
- Priority: HIGH
- Display map:
  - PTS → Distance to Spot
  - Sell % → Sell-Pressure % — Estimated
  - FLOW STATE → Flow Pressure State
  - GEX → GEX Proxy — Convention C+/P−
  - OI $M → OI Market Value — Last
  - Vol/OI → Vol/OI Turnover
  - Fresh Prem → Fresh Gross Premium — Estimated
  - Dollar Flow → Directional Premium Proxy
  - FNPF → Net Option Premium Proxy
  - Cum Prem → Session Gross Premium — Estimated
  - Flow Concentrate → Flow Concentration Score
  - Buy Strike → Contract Flow Score
- Done when:
  - No label overstates what the data proves.

## WF-054 — Correct contract radar language and behavior
- Priority: BLOCKER
- Action:
  - Replace:
    - Best Call
    - Best Put
    - Runner
  - With:
    - ACTIONABLE
    - WATCH
    - LOW
    - NO ACTIONABLE CONTRACT
  - Do not show a recommendation when no contract passes all gates.
- Done when:
  - Score-zero, seller-dominant, wide-spread, or extreme-distance contracts cannot be promoted.

## WF-055 — Correct confidence claims
- Priority: HIGH
- Action:
  - Do not call the score probability.
  - Confidence is a model-completeness/confluence measure only.
  - Cap confidence for:
    - Overnight/close data
    - Missing GEX
    - Missing directional flow
    - Aggregation mismatch
- Done when:
  - The site does not imply backtested win probability.

## WF-056 — Remove unsupported terminology
- Priority: HIGH
- Remove or qualify:
  - Institutional flow
  - Confirmed dealer inventory
  - True bid-side selling
  - Guaranteed high-probability
- Approved description:
  - `Rules-based structure, activity, open-interest, and estimated flow-pressure terminal.`
- Done when:
  - All public copy matches the actual data limitations.

## WF-057 — Suppress stale overnight flow
- Priority: HIGH
- Action:
  - In overnight/close mode, label flow columns as prior-session baseline.
  - Do not generate a live directional conclusion until five fresh bars exist.
- Done when:
  - The site cannot present yesterday's final 10 minutes as today's live flow.

---

# Phase 6 — Empirical Platform Validation

## WF-060 — Verify undocumented Thinkorswim behavior
- Priority: BLOCKER
- Test:
  - Option `vwap(period = DAY)`
  - Intraday `open_interest()`
  - Historical `PriceType.MARK` bars
  - Sorting by hidden plot when `AddLabel()` is present
- Done when:
  - Results are documented for the current Thinkorswim build.

## WF-061 — Run the four-contract test grid
- Priority: BLOCKER
- For SPX and NDX test:
  - Liquid ATM call
  - Liquid ATM put
  - Low-OI contract
  - Far-OTM contract
- Record:
  - Strike
  - Underlying
  - Bid
  - Ask
  - Mark
  - Last
  - Day volume
  - OI
  - Gamma
  - Last five 2-minute H/L/C/V bars
- Done when:
  - Every corrected column is hand-checked.

## WF-062 — Test across session times
- Priority: HIGH
- Times:
  - 9:35 ET
  - Midday
  - 15:45 ET
- Expected:
  - Early NaN/insufficient-data states
  - Stable midday calculations
  - Gamma degradation late on 0DTE
- Done when:
  - Behavior matches the intended safeguards.

## WF-063 — Test 1-minute versus 2-minute aggregation
- Priority: HIGH
- Action:
  - Temporarily switch a test copy between 1m and 2m.
  - Confirm rolling outputs change as expected.
- Done when:
  - No intraday flow column is secretly pinned to DAY/session data.

## WF-064 — Export/screenshot parity test
- Priority: HIGH
- Action:
  - Export CSV and capture the watchlist screenshot at the same timestamp.
  - Compare values and labels.
- Done when:
  - CSV values match the displayed cells.

## WF-065 — Restart reproducibility test
- Priority: MEDIUM
- Action:
  - Restart Thinkorswim and re-export.
  - Session columns should remain stable within rounding.
  - Rolling columns may differ due to rebuilt bars.
- Done when:
  - Reproducibility boundaries are documented.

---

# Phase 7 — Forward Validation Before Probability Claims

## WF-070 — Start signal logging
- Priority: HIGH
- Log every:
  - ACTIONABLE
  - WATCH
  - Major level activation
  - Bias change
- Store:
  - Timestamp
  - Ticker
  - DTE
  - Contract
  - Score components
  - Underlying trigger
  - Entry/exit rule
  - Outcome
- Done when:
  - A structured signal log exists.

## WF-071 — Define one standard outcome rule
- Priority: HIGH
- Examples:
  - Underlying-based stop and three targets
  - Time stop
  - Maximum holding period
- Done when:
  - All logged signals use the same evaluation method.

## WF-072 — Delay “high-probability” claims
- Priority: BLOCKER
- Action:
  - Do not display win-rate or probability language until a statistically meaningful forward sample exists.
- Done when:
  - Public wording reflects only observed, logged performance.

---

# Recommended Work Order

Complete in this exact order:

1. WF-000 to WF-015
2. WF-040 to WF-043
3. WF-020 to WF-029
4. WF-030 to WF-031
5. WF-060 to WF-065
6. WF-050 to WF-057
7. WF-070 to WF-072
8. Only then begin the full visual/site redesign

---

# Redesign Readiness Gate

Do not begin the full redesign until all are true:

- [ ] Distance cannot fabricate values.
- [ ] Missing data never becomes zero.
- [ ] Session premium fallback is removed.
- [ ] Flow Concentration has explicit windows.
- [ ] All four watchlists share identical headers.
- [ ] Intraday columns are verified at 2m × 5.
- [ ] GEX coverage controls GEX weighting.
- [ ] Redundant flow columns count as one evidence axis.
- [ ] Contract recommendations enforce spread, distance, activity, and momentum gates.
- [ ] SPX/NDX and 0DTE/1DTE presets are active.
- [ ] Overnight flow is suppressed until live bars populate.
- [ ] Empirical Thinkorswim tests are documented.
