# Overnight workflow audit — November16

Offline source inspection and synthetic tests cover intake/W0, W1 routing/health, W2A generation/recovery, W2B removal, W3 assembly/review, W4/W4.1 print/release, fulfillment, messaging suppression and direct admin consumers. No image generation, provider order, payment, customer message, billing change, production deployment or live order advancement occurred tonight. Coverage is not hosted or physical acceptance.

Checkout: `/Users/jeff/Projects/Little-Hero-Books/worktrees/little-hero-books/print-test-prep-20261115`, branch `codex/w2a-error-reporting-recovery`, base `f0f1dc9a3d8c19c937c4cc5035ac284872150460` (fetched origin/main). Canonical artwork and originals remain separate and untouched. This candidate is prepared locally; publication remains separate.

## Prepared changes

- Saved W2A parent/child evidence now supplies a curated error and a durable manual hold. Only the reserved physical parent execution can report its failure. An acknowledged early retry may reuse only the unchanged empty frozen bootstrap, with no base image or pose progress. Raw line-item metadata remains under `product_info.items` when execution reservation needs an object carrier.
- Provider consumers stop without an owned attempt or verified replay. A bounded QA retry reserves an accountable attempt, binds the preceding rejected image and frozen input, and refuses changed/held parents. Late callbacks cannot clear a newer lease.
- A complete approved canonical image set can finalize into pending human review without generation or dispatch. Frozen required poses include cover pose0. Jobs and manifest are read again after asset checks; late completion is idempotent. This is not a transaction across database tables and object storage; human review remains required.
- Amazon Dedication Message no longer corrupts age; W1 chooses exact siblings before shared root matches.
- Assembly and approvals reject stale, owned, flagged or incomplete state. Already-complete ordinary assembly is idempotent. Intake, reset, orphan and force controls preserve new failure ownership through revision fences and complete durable metadata reads.
- Quote and release share the same Amazon shipping default and trusted merchant-contact fallback, retaining changed recipient/account/price/artifact rejection.

Configured partial replay remains held until generation provenance can be verified. Generic full replay would rerun SW0 and is unavailable. No general W2B force/source-replacement policy was added. These are disclosed recovery limits, not claims that every interrupted run can resume automatically.

## Evidence and limits

See coverage/findings JSON, discovery/challenge reports, checkpoint reviews, final consequence reports and final-verification.md here. Tests exercise actual handlers and exported nodes with intercepted synthetic transports, including duplicate parent, stale intake/admin writes, completed-manifest recovery, callback races and quote-to-release defaults. Required CI selects the new suites and changed completion/workflow regressions.

The real local admin rendered the stopped error, acknowledgement gate, successful queue readback, uncertain response readback, missing-error sync, empty results, inspection error, disabled force controls, and empty review/approval tabs. Full-page screenshots were inspected in the conversation. The loopback gateway never forwards API actions to live services. No generated character composite or printed-book visual quality is certified by those checks. Earlier v4 artwork/32-page assembly evidence remains retained.

Synthetic logs/probes: `output/workflow-readiness-audit-20261116/` (Git-excluded scratch). Durable reports are here; private bindings/live evidence stay excluded. Source evidence preserves the previous240-path manifest byte-for-byte, historical parents and four false authority flags. Whole-repository TypeScript has baseline failures. Native built-package identity requires Linux and explicitly fails closed on this Mac. Exact final-SHA Linux CI is required before publication; earlier CSV CI is not evidence for this candidate.

## Tomorrow before paid testing

1. Review the candidate and authorize the intended Git/publication steps. Run existing required exact-SHA CI, including Linux native identity, production build, export/secret and source-evidence gates. No commit, push or deploy was performed tonight.
2. Quiesce intake/router advancement and verify/drain existing executions before changing contracts. Snapshot live exports privately; preserve IDs, subworkflow bindings, credential bindings, webhook paths and publication state. Deploy the reviewed backend through gated main deployment and publish the entire compatible cohort before reopening routing. Updating only the original W2A/SW0 pair is insufficient:
   - `repo-centric/workflows/w1.1-Queue_Manager_and_Router.repo-centric.json`
   - `repo-centric/workflows/w2A-Orchestrator.repo-centric.json`
   - `repo-centric/workflows/w2A-SW0-Base_Character_Generation.repo-centric.json`
   - `repo-centric/workflows/w2A-SW1-Pose_Generation.repo-centric.json`
   - `finals/w2A-SW2-Pose_and_Style_QA.json` (verify its actual shared hosted binding)
   - `repo-centric/workflows/w2B-sw1-single-pose.repo-centric.json`

   Verify source/wiring parity without invoking providers. Verify published self Error Trigger, saved error executions and reporter auth. Identify the configured W1.5/health webhook owner/export explicitly; the hosted manifest does not establish it. Old executions lack new ownership envelopes. If rollback is necessary, keep routing quiesced and restore the complete compatible backend/export cohort. Preserve durable failure metadata; do not erase it to make rollback appear healthy.
3. Reconcile Luca E's already-failed run through canonical admin recovery and verify its hosted error/hold. Keep generation stopped until Jeff restores Gemini billing and deliberately retries. Re-read live state rather than assuming it still matches earlier evidence.
4. Recheck the exact order/account/actor print scope and expiry before quote/release. E's original scope expires `2026-11-16T23:49:48.099Z`; it was not extended. Retain message suppression and the general printing gate.
5. After generation, visually review Luca's cover and every page, including baked shadows and corrected slides. Complete review/preview, inspect the combined print PDF and fresh quote, then deliberately release one test shipment. Physical trim/color/binding/shadow quality remains delivery acceptance. Independent PDF/X certification has not been established by offline tests.
