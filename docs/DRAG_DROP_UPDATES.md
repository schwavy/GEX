# Daily GitHub Drag/Drop Update

## Replace a dashboard

1. Export the completed Thinkorswim watchlist as CSV.
2. Rename it to exactly one of:
   - `spx-0dte.csv`
   - `spx-1dte.csv`
   - `ndx-0dte.csv`
   - `ndx-1dte.csv`
3. In GitHub open `data/inbox/`.
4. Choose **Add file → Upload files**.
5. Drag the replacement CSV into the page.
6. Confirm the filename is exactly the same and commit to `main`.

Cloudflare will run `npm run build`. The build:

- validates the Symbol header;
- detects SPX versus NDX;
- decodes expiration;
- derives DTE from the publication date;
- assigns live/overnight/close mode automatically;
- generates `dist/data/manifest.json`;
- copies the published CSVs into `dist/data/`;
- creates `dist/data/build-report.json`.

## No manifest editing for normal updates

Do not hand-edit a generated manifest. The source of truth is `data/config.json`.

## Enable 1DTE later

In `data/config.json`, change the applicable object to:

```json
"enabled": true
```

Commit the change. The selector will show the dashboard after the next Cloudflare build.

## Validation failure

A GitHub validation action runs on every push. If it fails, open the workflow log. Common causes:

- filename missing;
- no `Symbol` header;
- SPX CSV placed in an NDX slot;
- malformed JSON in `data/config.json`.

## v8 automatic safeguards

The build report now also checks:

- accepted long and abbreviated Thinkorswim headers;
- missing Mark/Bid/Ask;
- Recent Volume 10m greater than DAY Volume;
- ticker and expiration consistency;
- sample versus current datasets.

After Cloudflare deploys, open:

```text
/data/build-report.json
```

A warning that `Recent Volume exceeds DAY Volume` means the Recent Volume custom column is not set to 2-minute aggregation. Fix the Thinkorswim column before relying on contract selection.
