# Issue 45: Restore Reporting Page, Modernize Analytics, and Exclude Test Orders

## Status
Open — not started

## Summary

The backend used to have an analytics/reporting page, but it is no longer present in the current app tree. We should restore the reporting feature from a previous commit, verify the API routes still work against the current data model, then extend it with updated analytics and a reliable way to exclude test orders from production reporting.

## Background

The current backend app has no reporting route under `back-end/src/app/admin/`:

- present today: `csv-upload`, `orders-needing-attention`, `orphaned-orders`, `stuck-orders`
- missing today: `analytics` / `reporting`

Git history shows the reporting page previously existed:

- commit `8e24954fc26ad6f3bcea257237c33110c3c5be8a` (2025-11-16): added analytics v1 page and API routes
- commit `63416fa4a4cb6f5c6b102837d881cfa52fd776d2` (2025-11-16): updated the analytics page with a prominent test/production toggle
- analytics API route history also exists for:
  - `back-end/src/app/api/admin/analytics/overview/route.ts`
  - `back-end/src/app/api/admin/analytics/customizations/route.ts`
  - `back-end/src/app/api/admin/analytics/export/route.ts`

At some point those files disappeared from the current tree. The removal does not appear to be intentional product cleanup; it looks like a regression / loss of functionality.

The broader recovery history is:

- branch: `reporting-analytics`
- merge commit on `main`: `97c40d8`
- later the feature disappeared from the current tree without an obvious deliberate deletion commit

Relevant historical commits:

| Commit | Description |
|--------|-------------|
| `8e24954` | Add analytics v1 reporting page with overview and customizations tabs |
| `cad3fd3` | Add workflow completion and customer approval statistics |
| `2531c70` | Add customization statistics |
| `f08d9e7` | Add fuller customization breakdowns |
| `9759133` | Fix customization data extraction and layout |
| `d93ce29` | Improve customization card layout |
| `a9be817` | Additional customization layout refinement |
| `63416fa` | Add prominent test/production data toggle |
| `97c40d8` | Merge commit with the reporting work present |

## Relevant Historical Files

These existed in history and should be the starting point for restoration:

- `back-end/src/app/admin/analytics/page.tsx`
- `back-end/src/app/api/admin/analytics/overview/route.ts`
- `back-end/src/app/api/admin/analytics/customizations/route.ts`
- `back-end/src/app/api/admin/analytics/export/route.ts`
- `back-end/src/components/analytics/AnalyticsFilters.tsx`
- `back-end/src/components/analytics/OverviewTab.tsx`
- `back-end/src/components/analytics/CustomizationsTab.tsx`
- any additional files under `back-end/src/components/analytics/`

## Current-State References

- `back-end/src/app/page.tsx` — current home page; no reporting link is present
- `back-end/src/app/api/orders/route.ts` — current order data source and lifecycle behavior
- `back-end/src/lib/supabase-client.ts` — current order query/update layer
- `back-end/src/app/api/webhooks/stripe/route.ts` and Amazon intake routes — useful for identifying test-order markers

## Required Work

### 1. Restore the reporting UI and APIs from history
- Recover the analytics page and supporting API routes from the November 16, 2025 commits
- Confirm the restored files still build against the current backend app structure
- Re-add navigation entry points so the page is discoverable

### 2. Reconcile with the current order schema
- Verify all historical queries still match current Supabase columns and lifecycle fields
- Update any broken assumptions caused by:
  - sibling-order support
  - D2C orders
  - lifecycle archiving / recently-delivered logic
  - newer manifest or preview fields

### 3. Add updated analytics
- Re-evaluate which metrics matter now that the system includes both Amazon and D2C
- Include current operational/business reporting such as:
  - orders over time
  - platform split
  - completion / approval funnel
  - print-stage metrics
  - reprints
  - sibling-order counts
  - top customization traits if still useful

Recommended metric expansion:

- workflow stage drop-off by W0 -> W2A -> W2B -> W3 -> print
- average time per stage
- current error counts by `execution_status` / `error_type`
- retry-count distribution
- sibling-order integrity metrics, including issue-38-style missing-manifest symptoms
- customer approval rate, revision count, and revision reasons if available
- Lulu submitted vs delivered counts

### 4. Exclude test orders from production reporting
- Define the canonical test-order detection rule
- Support filtering production vs test cleanly in the reporting UI and exports
- Ensure the default production view excludes test noise

Possible signals to evaluate:
- explicit test prefixes / IDs
- known internal email addresses
- known dummy names / addresses
- platform-specific markers
- metadata flags if available

### 5. Verify export behavior
- Restore or rebuild CSV / JSON export endpoints
- Confirm exports respect the same production-vs-test filters as the UI

### 6. Verify access and navigation

- Re-add the page to the admin navigation or another stable admin entry point
- Confirm the page is behind the same auth gate as the rest of the admin app
- Ensure analytics API routes reject unauthenticated access

## Recommended Restore Steps

1. Run `git show 97c40d8 --name-only` to confirm the full analytics file list.
2. Restore the analytics files from the best baseline commit, likely `97c40d8` or `63416fa`.
3. Start the backend locally and confirm `/admin/analytics` renders.
4. Fix any current import, schema, or query drift.
5. Harden the production-vs-test filtering so it applies to every analytics query and export path.
6. Add updated metrics once the restored baseline is stable.
7. Verify the page against the production schema with read-only queries.

## Open Questions

- Which commit should be treated as the best restore baseline: the initial analytics v1 commit (`8e24954`) or the later toggle-improvement commit (`63416fa`)?
- Did the original analytics page ever ship successfully in production, or was it only partially used?
- Should test-order exclusion be query-based, schema-based, or both?
- Should reporting remain in the backend admin app, or should a future version move into a separate ops/reporting surface?
- Is there already a canonical set of test email addresses, order ID prefixes, or metadata flags that should define "test order"?
- Are date presets like last 7 days / last 30 days / all time needed in addition to a raw date range picker?

## Acceptance Criteria

- [ ] The backend once again has a working analytics/reporting page
- [ ] The page is reachable from the current admin UI
- [ ] Restored analytics work with the current order schema and current order types
- [ ] Test orders can be excluded from production reporting and exports
- [ ] Restored metrics are updated to reflect the current business and workflow model
