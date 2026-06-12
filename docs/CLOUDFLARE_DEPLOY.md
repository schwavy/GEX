# GitHub → Cloudflare Pages

## Cloudflare Pages settings

- Framework preset: None
- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: blank
- Node.js: 20 or newer

## First deploy

1. Upload this entire project to the root of the GitHub repository.
2. In Cloudflare Pages connect that repository.
3. Enter the settings above.
4. Deploy.

## Future updates

Only replace CSV files in `data/inbox/` for normal dashboard updates. Cloudflare rebuilds the static site automatically.

## Cache

The included `_headers` file tells Cloudflare not to cache CSV and manifest data aggressively. The application also fetches them with `cache: no-store`.

## v8 note

The site now determines overnight versus live behavior from the generated manifest. Do not force `mode: live` manually. Upload the CSV and let `npm run build` derive the correct mode from the current Eastern Time and contract expiration.
