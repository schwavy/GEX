# Live Thinkorswim Validation Worksheet

The audit identified Thinkorswim behavior that must be confirmed empirically. Complete this before treating the system as production-ready.

## Contracts to test for both SPX and NDX

- liquid ATM call
- liquid ATM put
- low-OI contract (OI below 50)
- far-OTM contract

## Record native fields

- Strike
- Underlying Last
- Bid
- Ask
- Mark
- Last
- DAY Volume
- Open Interest
- Gamma
- last five 2-minute H/L/C/V bars

## Required checks

| Test | Expected result |
|---|---|
| PTS | hand calculation within ±0.1 point; missing underlying returns NaN |
| Sell Pressure | hand calculation within ±2% |
| Pressure State | exact mapping from Sell Pressure with 40/60 thresholds |
| GEX | within ±5% when Gamma is available; NaN after five stale bars |
| OI Market Value | exact within rounding |
| Vol/OI | exact |
| Fresh Gross | within ±2% |
| Directional / Net Option Proxy | within ±2% |
| Session Gross | DAY Volume × real option VWAP; missing VWAP returns NaN |
| Concentration | exact for its declared 10-minute or session window |
| Contract Flow Score | exact component sum and gates |

## Platform-specific items to verify

- `vwap(period = AggregationPeriod.DAY)` on individual option contracts
- historical `PriceType.MARK` bars in Custom Quotes
- `Gamma()` availability, especially late on 0DTE
- sorting behavior when a hidden numeric plot and `AddLabel()` are both present

## Timing

Repeat at:

- approximately 9:35 ET
- midday
- approximately 15:45 ET

Early NaN/insufficient-data states and late 0DTE Gamma degradation are expected safeguards, not errors.
