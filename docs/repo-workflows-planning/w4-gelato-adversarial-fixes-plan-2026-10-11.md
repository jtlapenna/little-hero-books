# Gelato review fixes

Scope: fix the confirmed local findings in `w4-gelato-adversarial-review-2026-10-11.md`. Continue the approved isolated build. No activation, config publication, production migration, credential rotation, draft/paid order, deployment, or Git release action is included. Credential literals can be removed locally; external rotation remains an owner action.

Keep the existing config/manifest, persisted order, and submission membership as canonical owners. These fixes extend those paths and preserve separate Lulu/Gelato workflows. Full Gelato lifecycle implementation remains later plan work.

## Checkpoint 1: intake, routing, and credential export

R1: change `assertPrintAssignmentCompatible` to compare supplied fields only. Missing fields mean preserve; explicit null or different values remain rejected. Prove the actual shared upsert accepts ordinary repeated Amazon partial updates for both providers and rejects explicit assignment changes.

R2: preserve book ID, numeric config version, and format selection through W0 Normalize and Dedication into Prepare. Preserve conflicting selectors so the canonical backend parser rejects them rather than silently choosing one. Keep existing unselected intake pinned to MVP v1. Exercise the complete actual node chain and backend parser.

R3: isolate W1.1 group errors. Preserve successful Lulu/Gelato outputs. If result validation fails after a claim may exist, fence the returned claim where identifiable; ambiguous claim responses remain an explicit held outcome for reconciliation. Never throw after earlier successful groups have been accumulated. Test valid then invalid groups, invalid then valid groups, malformed claimed responses, and failed fence behavior.

S1: replace literal credentials in changed W0 CONFIG with environment references. Improve the canonical workflow scanner to inspect decoded code-node strings, recognize relevant key aliases and quote styles, and report locations without values. Use synthetic scanner regressions. Do not display old literals.

## Checkpoint 2: canonical manifests and pages

P1/P2: for Gelato, validate original W0/W3 identities and canonical artifact keys against the persisted requested order before normalization. Require exact ordered frozen W0 page labels and a complete page plan. Require every raster path to match its canonical label. Keep legacy Lulu input support unchanged. Test the actual W0/W3-to-W4 adapter and assembler with wrong-order manifests, swapped/missing/extra labels, and noncanonical rasters.

R4: check persisted assignment before returning a prospective W0 manifest. Reuse an existing compatible canonical W0 manifest on retry. Reject conflicts before upload. Make W0 publication conditional on object absence and reconcile concurrent-existing objects before upsert so differing selectors cannot overwrite the frozen object. Freeze book/format/canonical manifest identity atomically at final database persistence, including different Lulu books with identical print fields. Prefer a repo-owned internal publication helper/endpoint extending current W0 builder and R2 client over workflow-local duplicate rules. Test concurrent same-key and cross-book publication, conflicting versions/providers/books, immutable retry, ordinary intake, and publication success followed by persistence rejection. A losing first-publish race can leave an unused object, but must never change the winning row or overwrite a frozen object.

## Checkpoint 3: submission and archive contracts

D1/D2: stamp `started_at` on both claim paths. Serialize every submission mutation with the same root advisory lock. Order UPDATE/DELETE triggers already hold an order row lock, so they must try the advisory lock and reject a busy transition rather than wait and form a cycle. Keep guard lookups nonblocking. Guard owned Gelato orders against generic health/recovery field resets; keep current token-aware claim/fence transitions allowed. Update direct health/recovery selectors where appropriate and prove the database backstop rejects stale unqualified writes. Test claim-versus-fence, claim-versus-direct identity/delete writes, and unchanged Lulu recovery.

D3/P3: canonicalize and hash the complete quote request, including stable file identity, recipient, currency, references, product/count/quantity, and selected policy. Return a bound selection and require the draft inputs to match. Persist request fingerprint and claim token with the quote. Begin/send must compare the supplied current request fingerprint and current token. Clear quote state on fence/retry. Keep explicit draft-only client behavior. Test every input mutation, token rotation, quote expiry, exact group membership, and unchanged inputs.

D4: treat every failed archive deletion as failure. Capture the inserted archive row ID, roll back only that row, and check compensation errors without deleting prior archive history. Cover the real helper and manual archive path for a protected D2C Gelato row, existing history, and failed compensation. Avoid a broad archive rewrite unless the existing rollback is insufficient.

## Proof and review

For each checkpoint, add meaningful regressions reproducing the prior defect, confirm expected failure where practical, apply fixes, and run affected tests plus adjacent Lulu checks. Review actual producers/consumers rather than only fabricated mapped values. Use fresh adversarial reviewers when capacity permits, verify material candidates independently, and stop once the checkpoint converges. If agent capacity is unavailable, disclose reduced independence and retain source/probe evidence.

Refresh the checkpoint release-safety receipt after shared contract changes. The result cannot establish overall release readiness while the workflow copies still stop after PDF assembly. Record completed fixes, remaining findings, exact checks, and operational limits in the existing execution report.

## Execution result

All three repair checkpoints implemented and cleared by fresh adversarial review. See `w4-gelato-fixes-review-2026-10-11.md` for findings, regressions, independent probes, and remaining build limits. Production build completed; standalone repository TypeScript remains unclean. Full Gelato workflow integration remains later plan work. No release or production action taken.

Release checkpoint also found rolled W0 compatibility gaps. A narrow existing-build MVP v1 bridge and guarded legacy upsert are implemented, with an actual base-node/controller regression. Pause/drain and migration-window row reconciliation remain deployment prerequisites.
