# Analytical Changes Implemented in v8

- Independent-axis scoring replaces column-counting.
- Sell Pressure, Pressure State, Net Option Premium, and Directional Premium are one axis.
- GEX participates only when at least 40% of rows have usable values.
- Confidence is capped when the dataset is overnight/close, GEX is sparse, flow pressure is sparse, or DTE conflicts.
- Missing values remain null and display as `—`.
- The website ignores unaudited DWF, Delta, Dominance, Gamma Trap, DHP, and Fresh % fields.
- Contract ACTIONABLE status requires price cap, spread, percent distance, 10-minute volume, fresh premium, buy pressure, and momentum alignment.
- Missing Bid/Ask, recent volume, or momentum prevents ACTIONABLE status.
- SPX/NDX and 0DTE/1DTE presets are applied automatically.
- Prior-session snapshots are labeled baseline and cannot masquerade as fresh live flow.
- Spot estimation uses put-call parity and safe distance clustering rather than an unsafe call/put sign assumption.
