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
- Measurement ID on site: `G-DEH39J706V`
- Linked Google Ads customer id: `2448506241`

Useful GA4 MCP reports for launch check-ins:

- Daily trend: dimension `date`; metrics `activeUsers`, `sessions`, `eventCount`.
- Page performance: dimension `pagePath`; metrics `screenPageViews`, `activeUsers`, `sessions`.
- Acquisition: dimensions `sessionSourceMedium`, `sessionDefaultChannelGroup`; metrics `sessions`, `activeUsers`, `eventCount`.
- Events: dimension `eventName`; metrics `eventCount`, `activeUsers`.

## Google Search Console

Status: use the local official-API pull script, not a third-party GSC MCP.

Build More Better does not currently rely on an official GSC MCP. Its working pattern is:

- GA4: official Google Analytics MCP.
- GSC: local script calling Google's official Search Console Search Analytics API with Google ADC.

Little Hero Labs now follows that same approach:

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
gcloud auth application-default login
```

Output:

- Raw GSC JSON is written to `reports/seo/raw/<label>/gsc.json`.
- The JSON includes daily, query, page, and query/page reports.
- Tokens and credential files are never written to the repo.

Credential caveat:

- `.lhl-growth/` is gitignored and should hold local credential/env hints only.
- Do not commit Google credential JSON files.

## Why Not A GSC MCP?

We looked at the adjacent Build More Better project and found that its production-ready path is not an official GSC MCP. It uses the official Google Analytics MCP for GA4 and a local Search Console API script for GSC. Little Hero Labs now follows that same pattern to avoid taking a dependency on a random third-party GSC MCP package.

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
