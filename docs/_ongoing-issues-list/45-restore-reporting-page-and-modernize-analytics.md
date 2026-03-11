# Issue 45: Restore Reporting Page, Modernize Analytics, and Exclude Test Orders

## Status
Open — not started

## Summary

The backend used to have an analytics/reporting page, but it is no longer present in the current app tree. We should restore the reporting feature from a previous commit, verify the API routes still work against the current data model, then extend it with updated analytics and a reliable way to exclude test orders from production reporting.

The important implementation distinction is:

- restoring the page shell and historical APIs is relatively straightforward
- restoring it as a trustworthy business-reporting surface is a larger follow-up because the current system now has D2C orders, sibling-order support, and lifecycle archiving into `archived_orders`

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
- `back-end/src/lib/order-lifecycle.ts` — current lifecycle logic that moves completed orders into `archived_orders`
- `database/migration-order-lifecycle.sql` and `database/migration-order-lifecycle-fix.sql` — lifecycle / Lulu-related schema references

## Audit Findings

### Restore difficulty

Restoring the old reporting feature is not a greenfield build. The prior implementation still exists in git and was fairly self-contained:

- `back-end/src/app/admin/analytics/page.tsx`
- `back-end/src/app/api/admin/analytics/overview/route.ts`
- `back-end/src/app/api/admin/analytics/customizations/route.ts`
- `back-end/src/app/api/admin/analytics/export/route.ts`
- `back-end/src/components/analytics/*`
- historical helper modules `supabase-analytics.ts` and `analytics-helpers.ts`

This means the initial restore should be relatively easy. However, the historical implementation is not trustworthy as-is for current production reporting because:

- it queried `orders` only, while current lifecycle logic archives completed historical orders into `archived_orders`
- it used a simplistic `isTestOrder()` heuristic based largely on whether `amazon_order_id` looked like an Amazon ID
- it predates current D2C, sibling-order, and lifecycle behavior
- it depended on `recharts`, which is not currently present in `back-end/package.json`

### Test-vs-production filtering difficulty

Filtering current production data should be easier than the original issue text implies, as long as we use a positive production rule instead of only a negative “test order” heuristic.

Current data audit findings:

- current `orders` rows checked: `11`
- Amazon rows: `8`
- D2C rows: `3`
- Amazon-pattern `amazon_order_id` rows: `8`
- Amazon-pattern rows with at least one Lulu fulfillment signal: `8`
- non-Amazon-pattern rows with Lulu fulfillment signal: `0`

For the current real-order set, a strong production rule appears available:

- `platform = 'amazon'`
- `amazon_order_id` matches Amazon order format `^\d{3}-\d{7}-\d{7}$`
- and at least one Lulu fulfillment signal is present:
  - `lulu_job_id`
  - `lulu_status`
  - `print_submitted_at`
  - `shipped_at`
  - `delivered_at`

This should be the first production filter for the restored reporting page. It is stronger and more reliable than the old `isTestOrder()` helper.

### Main risk

The main risk is not test filtering. The main risk is incomplete analytics if the restored page only reads from `orders` and ignores `archived_orders`. That would make the page easy to restore but misleading for historical business reporting.

## Phased Implementation Plan

### Phase 1: Restore the page quickly

Goal: bring back a working analytics page and export flow with the historical feature set, without yet claiming it is the final source of truth for all historical reporting.

Work:

- restore the analytics UI and API routes from the best baseline commit, likely `63416fa`
- restore or recreate:
  - `back-end/src/app/admin/analytics/page.tsx`
  - `back-end/src/app/api/admin/analytics/overview/route.ts`
  - `back-end/src/app/api/admin/analytics/customizations/route.ts`
  - `back-end/src/app/api/admin/analytics/export/route.ts`
  - `back-end/src/components/analytics/*`
  - helper modules required by those routes
- re-add a stable navigation entry from the current admin home page
- decide whether to:
  - re-add `recharts` as a dependency, or
  - temporarily replace charts with simple summary cards/tables if dependency restore is undesirable
- verify `/admin/analytics` renders locally and the endpoints return data

Expected difficulty:

- relatively easy compared to the later phases

Expected output:

- a usable analytics page is back in the app
- exports work again
- page is clearly labeled as an initial restored version if necessary

### Phase 2: Make the data correct for current operations

Goal: reconcile the restored analytics code with the current schema and lifecycle model.

Work:

- audit all historical analytics queries against the current schema
- update the restored code for:
  - `platform`
  - `orderId`
  - `root_order_id`
  - sibling-order rows
  - current approval fields
  - current print / Lulu fields
- address lifecycle behavior so reporting does not silently miss legitimate historical orders
- determine whether analytics should read:
  - `orders` only for live operations, or
  - `orders` plus `archived_orders` for full historical reporting

Recommended approach:

- Phase 2 should explicitly add a combined reporting query layer that can read both `orders` and `archived_orders` when the metric is intended to be historical
- if a combined layer is too large for the first pass, the UI should clearly distinguish:
  - active/live operations view
  - full historical reporting view

Expected difficulty:

- medium
- this is the phase where most of the real work lives

### Phase 3: Replace the old test-order heuristic with a canonical production filter

Goal: make production reporting reliable now, based on current known-good data patterns.

Work:

- stop relying primarily on the historical `isTestOrder(orderId)` helper
- implement a positive “current legitimate Amazon production order” rule for the current dataset:
  - `platform = 'amazon'`
  - `amazon_order_id` matches `^\d{3}-\d{7}-\d{7}$`
  - and at least one of:
    - `lulu_job_id`
    - `lulu_status`
    - `print_submitted_at`
    - `shipped_at`
    - `delivered_at`
- apply the same filter logic consistently in:
  - overview metrics
  - customization metrics
  - exports
  - any future reporting tabs

Fallback / future-safe support:

- keep support for known explicit test markers such as:
  - test order prefixes
  - known internal email addresses
  - dummy recipient names or addresses
- but treat those as supplemental exclusions, not the primary production definition for current Amazon reporting

Expected difficulty:

- relatively easy
- easier than the original issue description implied

### Phase 4: Modernize the analytics surface

Goal: improve the page beyond simple restoration so it reflects the current business and workflow model.

Work:

- expand metrics to cover the current pipeline:
  - orders over time
  - platform split
  - workflow funnel from W0 -> W2A -> W2B -> W3 -> W4 / Lulu
  - customer approval funnel
  - Lulu submitted / shipped / delivered counts
  - retry and error distributions
  - sibling-order counts and integrity indicators
  - reprint counts
- re-evaluate whether customization reporting is still useful as a first-class tab
- update layout and copy so the page reads as an operational dashboard, not just a recovered prototype

Expected difficulty:

- medium
- depends on how much of the original charting experience is kept

### Phase 5: Harden and document

Goal: make the reporting page dependable for ongoing use.

Work:

- verify all analytics API routes are protected the same way as the rest of the admin app
- verify exports exactly match the current UI filters
- add a short doc note describing:
  - what counts as production
  - what tables are included
  - what metrics are historical vs active-only
- test against production-like read-only queries before treating the page as trusted

## Recommended Implementation Order

1. Restore the page and endpoints from `63416fa`.
2. Fix build/runtime drift, including chart dependency decisions.
3. Re-add navigation so the page is reachable.
4. Replace the old test heuristic with the new production filter for current Amazon orders.
5. Verify exports use the same filtering logic.
6. Expand the query layer to include `archived_orders` where historical completeness matters.
7. Modernize metrics and UI once the data layer is trustworthy.

## Open Questions

- Which commit should be treated as the best restore baseline: the initial analytics v1 commit (`8e24954`) or the later toggle-improvement commit (`63416fa`)? Current recommendation: start from `63416fa`.
- Did the original analytics page ever ship successfully in production, or was it only partially used?
- Should test-order exclusion be query-based, schema-based, or both? Current recommendation: query-based first, with optional schema support later if a canonical flag is added.
- Should reporting remain in the backend admin app, or should a future version move into a separate ops/reporting surface?
- Is there already a canonical set of test email addresses, order ID prefixes, or metadata flags that should define "test order" for non-Amazon / future D2C production reporting?
- Are date presets like last 7 days / last 30 days / all time needed in addition to a raw date range picker?
- Should Phase 1 explicitly ship as “current operational reporting” first, with full historical reporting deferred until `archived_orders` is included?

## Acceptance Criteria

- [ ] The backend once again has a working analytics/reporting page
- [ ] The page is reachable from the current admin UI
- [ ] Phase 1 restore works against the current backend app without broken imports or missing dependencies
- [ ] Production reporting defaults to a reliable current Amazon+Lulu filter instead of the old ID-only heuristic
- [ ] The same production/test filtering logic is applied to exports
- [ ] Restored analytics work with the current order schema and current order types
- [ ] Historical reporting is explicit about whether it includes `archived_orders`
- [ ] Restored metrics are updated to reflect the current business and workflow model
