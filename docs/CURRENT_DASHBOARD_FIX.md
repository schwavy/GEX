# Current SPX Dashboard — Exact Fixes

The uploaded 1:18 AM snapshot is usable for **overnight structure**, but it is not yet fully configured for live contract selection.

## What is working now

- PTS / spot estimation
- GEX proxy coverage
- OI market value
- Vol/OI turnover
- Session gross premium
- Session flow concentration
- SPX symbol and expiration decoding

## What is expected to be blank overnight

These are live 10-minute fields and should not be treated as current data outside RTH:

- Sell-Pressure %
- Flow Pressure State
- Fresh Gross Premium
- Directional Premium Proxy
- Net Option Premium Proxy
- Recent Flow Concentration
- Contract Flow Score
- Underlying Move 10m %
- Recent Volume 10m

The v8 scripts now display `LIVE_LOCKED` or NaN outside the live window. They begin publishing only after 9:40 ET, after five completed 2-minute bars.

## Required Thinkorswim corrections

1. Set **Recent Volume 10m** to **2-minute aggregation**.
   - Your export shows Recent Volume greater than native DAY Volume on every row.
   - That is mathematically impossible and indicates the column is currently set to DAY or another incorrect window.

2. Set **Underlying Move 10m %** to **2-minute aggregation**.

3. Set **Contract Flow Score** to **2-minute aggregation**.

4. Add these native Thinkorswim columns:
   - Mark
   - Bid
   - Ask
   - Volume
   - Open Interest

5. Confirm all live columns use **2 minutes**:
   - PTS
   - Sell Pressure
   - Flow Pressure State
   - GEX Proxy
   - Vol/OI
   - Fresh Gross Premium
   - Directional Premium Proxy
   - Net Option Premium Proxy
   - Recent Flow Concentration
   - Contract Flow Score
   - Underlying Move 10m %
   - Recent Volume 10m

6. Keep only these custom columns on **DAY**:
   - OI Market Value (Last) $M
   - Session Gross Premium (Est.) $M
   - Flow Conc. (Session)

## Expected behavior by time

- Before 9:40 ET: live fields show `LIVE_LOCKED`, NaN, or `INSUFFICIENT_DATA`.
- At/after 9:40 ET: live fields begin evaluating the first complete 10-minute window.
- After 4:00 ET: live fields lock again; structural fields remain available.

## Site behavior in v8

- Overnight mode uses structural fields only.
- Missing live flow no longer lowers the overnight structural-quality score.
- Prior-session gross premium replaces Fresh Gross Premium in the overnight metric row.
- Contract cards are labeled `INVENTORY ONLY` overnight.
- Contract qualification cannot activate until the live window is complete.
- Invalid Recent Volume values are automatically excluded.
