# Phase089 ordinary flow QA2 — PASS

Final bounded repair review of the current working source on `codex/gelato-first-book-gap-closure` (base HEAD `f7efbb3308df1111568890ed6de9ae5c7c38fe74`). No unresolved issue from the original ordinary-flow finding remains. No source edits or live effects.

Verified the repaired primitive uses customer approval `not_requested`, retains the requirement for fresh approval, clears both approval timestamps, withdraws the queue, places the relevant active review stage in-review, and sets an internal raw review status. Actual `status-display.ts` and `review-page-filters.ts` consumers now place all three stage holds in their correct first-review tabs. Additional real mapper/filter probes confirm revision_count=1 places all three stage holds in Secondary Review.

Found one remaining overwrite during this repair review: `approveStage(..., 'pending')` replaced the new in-review hold with pending. Parent removed that overwrite. Rechecked the final source and reran the actual `approveStage` with every HTTP call intercepted. Final result:

```json
{"customer":"not_requested","stage":{"status":"in-review"},"status":"pending_assembly_review","display":"review_poses","phase":"first_review","inReviewPoses":true,"liveRequests":0}
```

The independently written intercepted caller probe is `/tmp/lhl-ordinary-qa2-repro.cjs`. It exercises the real load/CAS/link-retirement/reset path and actual mapper/filter rather than directly inspecting the primitive.

Reran `scripts/test-book-review-invalidation.ts` against the final bytes: 26 checks passed, zero live requests. Also reran the complete website correction/rebuild/new-link/buyer-approval/native-queue/draft journey with the actual final-approval route and notifyCustomer:false: passed, one child PDF, one synthetic draft create, zero live requests. The final reset-branch repair does not affect that journey's approved branches. The requested focused W3 publisher/configured pipeline/boundary checks passed in QA1.

Reviewed final-approval notification handling: only an explicit boolean false skips both notification channels. Omitted/true values retain the existing D2C email and Amazon messaging routing. Token creation and pending buyer approval still run, and the journey verifies a new token replaces the rejected proof's used link and that a pending customer decision blocks print claim. Database schema declares customer_approval_status as VARCHAR(50), and the existing SQL print guards reject any required state other than approved.

Scope remains the original ordinary review visibility finding and its actual callers. The initial coverage limits remain: no hosted browser/n8n/PostgREST/provider effects, no physical printing, and no full tsc rerun. No acceptance requirement was weakened.
