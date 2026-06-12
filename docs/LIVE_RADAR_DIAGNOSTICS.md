# Live Radar Diagnostics — v11

The Premium Strike Radar now distinguishes two states:

1. **BUILDING** — before the first five 2-minute bars complete.
2. **INCOMPLETE** — the 10-minute clock has completed, but required fields are missing, invalid, or below coverage thresholds.

In INCOMPLETE state the radar no longer hides all contracts behind a generic message. It shows the strongest contracts under the premium cap as BLOCKED cards, with readiness and exact blockers such as missing Bid/Ask, invalid Recent Volume, missing momentum, excessive distance, seller pressure, or insufficient fresh premium.

ACTIONABLE and WATCH promotion remains disabled while chain-wide near-spot coverage is incomplete. This preserves the safety rules while making the failure diagnosable.
