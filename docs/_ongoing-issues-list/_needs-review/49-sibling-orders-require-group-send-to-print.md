# Issue 49: Prevent partial print submission for sibling orders

**Status:** 🟢 Phase 1 runtime guardrail complete  
**Priority:** High  
**Created:** 2026-03-12  
**Last Updated:** 2026-03-17

## Summary

Sibling orders now have a backend group-send guardrail at the print API boundary.

For **initial sibling print submission**:

- manual send-to-print now loads the full sibling group by `root_order_id`
- the request fails closed if the group is incomplete or any sibling is not print-ready
- if the group is ready, the backend queues **all sibling child rows together**

This closes the main Phase 1 risk: accidentally sending only part of a sibling group into W4.

## Implemented runtime policy

### API boundary

The guardrail now lives in [print/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/print/route.ts).

Behavior:

1. If the requested order is **not** a sibling child, the route behaves as before.
2. If the requested order **is** a sibling child and is **not** a reprint:
   - load all sibling child rows for the same `root_order_id`
   - require at least 2 sibling child rows
   - block the request if any sibling:
     - is missing shipping info
     - has not completed W3 / lacks a `manifest_3_url`
     - is currently processing another workflow
     - already has Lulu submission state
   - if all siblings are ready, queue the whole group together
3. Reprints (`lifecycle_status = recently_delivered`) remain single-order actions.

### Router alignment

The cron router already had sibling-group gating. It now uses the shared helper semantics in:

- [sibling-print-policy.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/sibling-print-policy.ts)
- [cron/router/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/cron/router/route.ts)

That keeps the manual print API and router sibling logic aligned instead of maintaining two slightly different readiness rules.

## What this now prevents

- queuing one sibling child for initial print while another sibling is still blocked
- queueing a partial sibling set because the admin happened to open only one child detail page
- silently treating a sibling child like an independent print unit before W4

## Current scope

This issue is now closed for **Phase 1 runtime contract cleanup**.

What is done:

- backend fail-closed group guardrail
- backend group queueing when all siblings are ready
- router + print endpoint aligned on sibling-child detection and W4 group readiness
- admin detail page copy updated so the manual action reflects grouped queueing when applicable

What is **not** part of this Phase 1 closure:

- a separate dedicated `Send all items from this order` UI control
- an explicit override path for bypassing group-send
- broader admin UX improvements beyond the current runtime-safe behavior

Those can still be added later, but they are no longer required to make the runtime safe for Book 2 prep.

## Acceptance criteria status

- sibling orders cannot be casually sent to print one child at a time without warning: **done**
- backend can determine the sibling group by `rootOrderId`: **done**
- W4 routing fails closed when not all sibling children are ready: **done at API boundary and preserved in router**
- any broader override path is explicit: **not implemented yet; safer default is no override**

## Related Areas

- [print/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/orders/[orderId]/print/route.ts)
- [cron/router/route.ts](/Users/jeff/Projects/little-hero-books/back-end/src/app/api/cron/router/route.ts)
- [order-mapper.ts](/Users/jeff/Projects/little-hero-books/back-end/src/lib/order-mapper.ts)
- [page.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/app/orders/[orderId]/page.tsx)
- [post-pdf-stage.tsx](/Users/jeff/Projects/little-hero-books/back-end/src/components/stages/post-pdf-stage.tsx)

## Related Issues

- `42-sibling-order-awareness-in-backend-review-ui.md`
- `37-admin-send-to-print-button-not-working.md`
- `29-w4-pdfmonkey-final-pdf-half-rendered-pages.md`
