# Analytics Setup

Date: 2026-05-12

Purpose: make future Little Hero Labs launch check-ins easy and repeatable, matching the Build More Better analytics pattern.

## GA4

Status: configured and working through the official Google Analytics MCP.

This mirrors Build More Better's GA4 setup. The Codex global config uses Google's `analytics-mcp` package:

Codex config already contains:

```toml
[mcp_servers.google_analytics]
command = "pipx"
args = ["run", "analytics-mcp"]

[mcp_servers.google_analytics.env]
GOOGLE_APPLICATION_CREDENTIALS = "/Users/johncapogna/Sites/buildmorebetter/.bmb-growth/google/application_default_credentials.json"
GOOGLE_PROJECT_ID = "build-more-better"
```

Verified property:

- Account: `accounts/375274448`
- Property: `properties/513268817`
- Display name: `Little Hero Labs`
- Measurement ID on site: `G-K0G1398N35`
- Linked Google Ads customer id: `2448506241`

Useful GA4 MCP reports for launch check-ins:

- Daily trend: dimension `date`; metrics `activeUsers`, `sessions`, `eventCount`.
- Page performance: dimension `pagePath`; metrics `screenPageViews`, `activeUsers`, `sessions`.
- Acquisition: dimensions `sessionSourceMedium`, `sessionDefaultChannelGroup`; metrics `sessions`, `activeUsers`, `eventCount`.
- Events: dimension `eventName`; metrics `eventCount`, `activeUsers`.

## Google Search Console

Status: configured through the Search Console MCP for Little Hero Labs.

Current Codex global MCP config points the `google_search_console` server at Little Hero Labs:

```toml
[mcp_servers.google_search_console.env]
BMB_GA4_PROPERTY_ID = "513268817"
BMB_GSC_SITE_URL = "sc-domain:littleherolabs.com"
GOOGLE_APPLICATION_CREDENTIALS = "/Users/johncapogna/Sites/buildmorebetter/.bmb-growth/google/application_default_credentials.json"
```

Notes:

- The MCP package still uses `BMB_*` env var names, but the values are now Little Hero Labs values.
- The local Google credential was refreshed on 2026-07-02 with Search Console write scope and GA4 read scope.
- The local cached `search-console-mcp` package was patched from `webmasters.readonly` to `webmasters` because sitemap submission requires the full Search Console scope.
- If the MCP transport was already loaded before the patch, restart Codex or start a fresh thread so the server reloads the patched package.

Verified on 2026-07-02:

- `inspection_inspect` works for `sc-domain:littleherolabs.com`.
- `https://www.littleherolabs.com/sitemap.xml` was submitted through the official Search Console API.
- GSC reported the sitemap as submitted and downloaded with `0` warnings and `0` errors.

The local official-API pull script remains available for report exports:

```bash
npm run marketing:gsc:pull -- --start-date 2026-05-12 --end-date 2026-05-19 --label 2026-05-12-launch-pilot
```

Local setup:

1. Confirm the Google Cloud project used by local ADC has the Search Console API enabled.
2. Confirm the Google account has access to the Little Hero Labs Search Console property.
3. Create `.lhl-growth/.env.local` locally:

```bash
LHL_GSC_SITE_URL=sc-domain:littleherolabs.com
```

Use the exact property name from Search Console. If the verified property is URL-prefix instead of domain-level, use that exact value, for example `https://littleherolabs.com/`.

Auth check:

```bash
# gcloud is not installed locally as of 2026-07-02.
# Use the Search Console MCP desktop OAuth flow or refresh the local ADC file with:
# - https://www.googleapis.com/auth/webmasters
# - https://www.googleapis.com/auth/analytics.readonly
```

Output:

- Raw GSC JSON is written to `reports/seo/raw/<label>/gsc.json`.
- The JSON includes daily, query, page, and query/page reports.
- Tokens and credential files are never written to the repo.

Credential caveat:

- `.lhl-growth/` is gitignored and should hold local credential/env hints only.
- Do not commit Google credential JSON files.

## Bing Webmaster Tools

Status: not configured yet in MCP.

The Search Console MCP supports Bing, but it needs a Bing Webmaster Tools API key:

```toml
[mcp_servers.google_search_console.env]
BING_API_KEY = "..."
```

Get the key from Bing Webmaster Tools settings. Until this is added, Bing MCP tools return `No bing accounts found`.

## Amazon Caveat

GA4 and GSC do not measure Amazon Sponsored Products conversion.

For the Amazon pilot, Amazon Ads and Seller Central remain the source of truth for:

- impressions
- clicks
- CPC
- spend
- orders
- sales
- ACoS
- search terms
- reviews
- refunds/replacements
