# Mobile deployment and verification

Version 9 includes a dedicated mobile presentation rather than only shrinking the desktop layout.

## Mobile behavior

- Compact two-row header with a full-width dataset selector.
- Large tap targets for dashboard selection, refresh, premium cap, and filters.
- Bottom navigation for Overview, Levels, Contracts, Plan, and Quality.
- Horizontal swipe cards for battlefield levels.
- Trade Plan and strike tables convert into labeled mobile cards.
- Strike output is limited to 12 rows on phones and 24 rows on desktop.
- Heavy blur, grid, scanline, watermark, and animation effects are disabled on mobile.
- Data requests use a 12-second timeout and one cache-busted retry.
- A visible retry button appears when the manifest or CSV fails to load.
- Safe-area padding supports modern iPhone browser chrome and home indicators.

## Publish

1. Replace the GitHub repository contents with this package.
2. Commit to `main`.
3. Keep Cloudflare Pages build command as `npm run build` and output directory as `dist`.
4. Wait for the deployment to finish.
5. Purge the old HTML, CSS, and JS from Cloudflare cache if the old mobile layout remains.
6. On the phone, close the old browser tab and reopen the URL, or use a cache-busting URL such as:

   `https://YOUR-SITE.pages.dev/?view=spx-0dte&mobile=v9`

## Verify on phone

- The page must not scroll horizontally.
- The header must fit without zooming.
- The battlefield levels must swipe horizontally.
- Trade Plan rows must appear as cards, not a wide desktop table.
- The strike table must appear as labeled cards.
- The bottom navigation must remain above the phone safe area.
- If data fails, the hero must show a `Try again` button.
