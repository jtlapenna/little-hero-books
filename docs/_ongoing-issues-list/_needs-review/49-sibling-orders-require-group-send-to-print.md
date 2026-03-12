# Issue 49: Prevent partial print submission for sibling orders

**Status:** 🔴 Open  
**Priority:** High  
**Created:** 2026-03-12  
**Last Updated:** 2026-03-12

## Summary

Sibling orders currently create one child order per book, but the operational flow still makes it too easy for an admin to send only some of the siblings into W4.1 / print fulfillment.

This creates a real risk that:

- 2 of 3 books are sent to print and 1 is left behind
- a mixed-status sibling group looks "mostly done" in the backend
- fulfillment and customer support have to manually reconcile what was actually printed

The backend should make sibling print submission group-aware by default, so an admin cannot casually send an incomplete sibling set to print.

## Problem Statement

For sibling orders, the unit of customer intent is the full order group, not the individual child row.

Today, the system treats each child as operationally independent in too many places. That is useful for asset generation and debugging, but it is unsafe at print-submission time. The print action should strongly prefer "all siblings together" and should fail or require an explicit override when not all expected items are present and ready.

## Desired Outcome

For sibling orders, the backend should support a safety mode where all books in the group must be sent to print together.

At minimum, we need one of these solutions:

1. A backend setting on sibling orders such as `requireGroupPrintSubmission = true`
   - if enabled, W4.1 refuses to proceed unless all expected child items for the root order are present and eligible

2. A backend admin action such as `Send all items from this order`
   - launching the sibling W4.1 flow for the entire group automatically
   - not requiring the admin to manually select each child

3. Another design with the same practical effect
   - it should be hard to accidentally omit one sibling
   - omission should require an explicit override, not happen silently

## Recommended Direction

Preferred approach:

- sibling orders default to group-send behavior in the backend review UI
- the primary CTA for sibling groups becomes `Send all items from this order`
- individual child `Send to print` actions are hidden, disabled, or protected by an explicit override confirmation
- W4.1 validates the full sibling group before submission

This keeps the safe path as the default path.

## Functional Requirements

### Backend review UI

When viewing a sibling child order:

- clearly show that the order belongs to a multi-book sibling group
- show the total expected sibling count
- show readiness state for each sibling in the group
- offer a single group-level send action

If the admin tries to send only one child:

- block the action, or
- require a strong explicit override with warning copy

### W4.1 / print gating

Before Lulu submission, sibling print flow should verify:

- all expected sibling items for the root order exist
- all expected sibling items are in a printable-ready state
- all required PDFs/manifests/QA checks exist for each sibling

If any sibling is missing or not ready:

- fail before print submission
- surface which sibling is missing or blocked
- do not submit a partial Lulu job

## Example Failure Modes This Should Prevent

- sibling order has 3 books, but only 2 children are sent to W4.1
- one child is filtered out by mistake in the admin UI
- one child is still missing a final PDF but the others are submitted anyway
- an admin assumes the root order send action includes all siblings when it actually does not

## Possible Implementation Approaches

### Option A: Group-level backend setting

Add a sibling-order policy flag in backend logic:

- `requireGroupPrintSubmission: boolean`

Behavior:

- default `true` for D2C sibling orders
- W4.1 checks sibling completeness before doing any print submission
- single-child submission is blocked unless an explicit override is recorded

Pros:

- strongest safety guarantee
- protects against UI mistakes and API misuse

Cons:

- requires policy-aware backend changes, not just UI changes

### Option B: Group send action in admin UI

Add a group-level button:

- `Send all items from this order`

Behavior:

- backend collects all siblings by `rootOrderId`
- validates the full set
- launches the sibling W4.1 flow for all of them together

Pros:

- clean operator experience
- matches mental model of one customer order with multiple books

Cons:

- still needs backend guardrails if child-level endpoints remain available

### Option C: Both

Best long-term option:

- UI defaults to group-send
- backend enforces completeness

This gives both usability and safety.

## Acceptance Criteria

- sibling orders cannot be casually sent to print one child at a time without warning
- backend can determine the expected sibling count for a root order
- W4.1 fails closed if not all required siblings are present and ready
- admin UI exposes a clear group-level print action
- any override path is explicit, logged, and difficult to trigger accidentally
- operationally, it should be very hard for one book in a 3-book sibling order to be left out of print fulfillment

## Related Areas

- backend review UI sibling awareness
- sibling order grouping by `rootOrderId`
- W4.1 sibling aggregation and print submission
- admin send-to-print actions

## Related Issues

- `42-sibling-order-awareness-in-backend-review-ui.md`
- `37-admin-send-to-print-button-not-working.md`
- `29-w4-pdfmonkey-final-pdf-half-rendered-pages.md`
