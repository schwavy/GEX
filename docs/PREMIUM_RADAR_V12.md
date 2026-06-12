# Premium Strike Radar v12

## What was actually wrong

The live chain could have valid spread, Sell Pressure, Fresh Gross Premium, and Underlying Move data while `Recent Volume 10m` was rejected or missing. V11 treated missing chain-wide Recent Volume as a global reason to keep the radar in an incomplete state. This suppressed contracts that were otherwise complete.

## v12 behavior

1. Contract gates are evaluated **row by row**. Partial chain coverage lowers confidence but no longer blocks an otherwise complete contract.
2. `Recent Volume 10m` is validated against session volume implied by `Vol/OI × Open Interest`, rather than against the ambiguous exported `Volume` column.
3. When explicit Recent Volume is invalid or missing, the site estimates recent activity from:

   `Fresh Gross Premium $M × 1,000,000 ÷ (option price × 100)`

   The estimate is visibly labeled `10m volume (est.)`.
4. Estimated activity is used as a gate only. It is **not** scored as a separate evidence axis, avoiding double-counting Fresh Gross Premium and volume.
5. GEX remains optional. Zero GEX coverage never blocks contract selection.
6. `incomplete` and `building` are now separate states:
   - `building`: fewer than five completed 2-minute bars.
   - `incomplete`: the live window exists but some chain fields are missing.
7. A contract can become ACTIONABLE or WATCH during partial chain coverage if its own required fields pass.

## Strict gates remain

A contract still needs:

- Price at or below the selected premium cap
- Distance inside the ticker/DTE preset
- Buy-side pressure for that contract type
- Minimum Fresh Gross Premium
- Valid spread below the preset maximum
- Recent activity, explicit or estimated
- Underlying momentum alignment for ACTIONABLE
- Minimum score

The radar will still correctly show no qualifying contract when cheap contracts are seller-dominant, too far away, too wide, or not momentum-aligned.
