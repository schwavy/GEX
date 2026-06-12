# Premium Strike Radar v10

The Premium Strike Radar does not depend on GEX as a hard qualification gate.

A contract becomes ACTIONABLE only when all of these are available and pass:

- Price is below the selected cap
- Distance is within the ticker/DTE preset
- Sell Pressure indicates option buying
- Fresh Gross Premium clears the minimum
- Recent Volume 10m clears the minimum
- Bid/Ask spread clears the maximum
- Underlying Move 10m aligns with the option direction
- Flow score is at least 75

## Why the current published radar is empty

The current CSV is missing native Mark, Bid, and Ask columns. Therefore spread coverage is zero and no contract may become ACTIONABLE or WATCH.

The current Recent Volume values are also larger than native DAY Volume on every row. The site rejects those values as an aggregation mismatch. Set Recent Volume 10m to 2-minute aggregation with a 5-bar lookback.

The deployed screenshot and uploaded CSV are not the same snapshot. The uploaded CSV estimates SPX near 7,394 and contains populated GEX, while the screenshot maps SPX near 7,420 and reports zero GEX coverage. Replace `data/inbox/spx-0dte.csv`, rebuild, and confirm the generated `dist/data/spx-0dte.csv` matches it.

## v10 behavior

When no contract is ACTIONABLE or WATCH, the radar no longer appears blank. It shows up to three highest-readiness contracts under the premium cap and lists the exact blockers, such as:

- Bid/Ask missing
- Momentum against call
- Distance above preset
- Seller pressure above 50%
- Recent volume missing or invalid

These contracts are clearly labeled BLOCKED and are not recommendations.
