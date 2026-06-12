# Premium Strike Radar v13

## Why the prior page looked broken

The screenshots showed two separate problems:

1. The website was loading a different CSV than the Thinkorswim watchlist shown beside it.
   - Thinkorswim showed 7435C near 7.20, 7420P near 10.00, and 7405P near 24.40.
   - The site showed 7435C near 9.70, 7420P near 8.10, and 7405P near 4.20.
   - Those cannot be the same export.

2. Thinkorswim can export shortened custom-column headers such as `GEX PRO...`, `Fresh GR...`, `Dollar Flo...`, `REC Fl...`, and `Underly...`. Older parsers required exact full names, so values could display in Thinkorswim while the site reported zero coverage.

## v13 behavior

- Shortened Thinkorswim headers are recognized.
- CSV requests are cache-busted with the exact source-file fingerprint.
- Dataset Profile shows the source fingerprint and row count.
- The radar always shows:
  - Primary call setup
  - Primary put setup
  - Runner
- `ACTIONABLE` remains strict.
- `WATCH` means safety gates passed but confirmation is incomplete.
- `CONDITIONAL` means the contract is a valid shortlist candidate for the next underlying trigger, but it is not an entry now.
- `BLOCKED` means contract-level data or quality gates failed.

## Deployment check

After replacing `data/inbox/spx-0dte.csv` and deploying, compare the site's Source Fingerprint against `dist/data/manifest.json`.

The site must display the same contract prices as the CSV. If it does not, the current deployment is not serving the file you replaced.
