# Isolated Gelato workflow and runner preparation — October 20, 2026

This is local preparation, not authority to publish/install a workflow, change credentials, deploy, issue a scope, create an order or activate a timer. Normal controls remain OFF. The six pending orders were not read, selected, refreshed or changed. No Gelato provider request, funding, printing, conversion, cancellation or customer message occurred.

## What changed

The local file compiler produces four separate definitions for one exact cohort: authenticated queue intake, native W4/W4.1 assembly, native W4/W4.1 quote-and-held-draft, and scoped recurring status. It never patches ordinary W1, installs workflows, reads environment/key files or calls a network service. Definitions omit hosted identities, active state, pins and static data. They use unresolved managed credential references, disabled execution-data persistence, no redirects/retries and terminal webhook responses. The native source is pinned by canonical definition hash. Single/sibling assembly selectors are rebuilt from frozen packet members; nested payloads, manifest URLs and other aliases cannot redirect assembly.

Diagnostic W4 is intentionally split after assembly. The protected runner must independently read the exact newly owned artifact bytes and compare every child/hash before calling the draft stage. Native quote/create/check nodes are reused. The old early acknowledgement does not count as terminal success. An uncertain request is not retried.

The runner core has no default service transport, scope issuer or live CLI. Its explicit adapter interface must be bound and reviewed for the concrete approved window. It validates exact packet/workflow/source hashes and a $0, draft-only approval; fresh OFF/funding/message/account/workflow readbacks; exact cohort claims; frozen PDF hashes; bound draft/provider receipts; actual successful timer refreshes; and independent closure. Exclusive journal-directory creation prevents a later attempt from replaying the same local journal. Operations are recorded before dispatch, and expiry is rechecked after journal I/O. Journal failure cannot disable revocation. Close, timer stop and closure readback are independently attempted after failure/expiry. Failure or incomplete cleanup stops later cases.

This journal proves process-level exclusion through atomic directory creation. The test uses two journal instances, not two operating-system workers or a killed runner; power-loss durability and a killed-process cleanup watchdog are not proven. A future live operator needs an independent close path. An adapter ignoring cancellation can have a late effect; no automatic retry is allowed and provider uncertainty needs an owned read-only reconciliation.

## Credential checks performed

Ten allowlisted live read-only requests succeeded: backend machine session, protected draft-OFF diagnostic, two database gates, five exact workflow definitions and Cloudflare backend metadata. No n8n execution, credential decryption or account-wide listing was requested. API response envelopes were not retained; pin/static/execution fields were not selected.

| Credential/boundary | Observation | Consequence |
|---|---|---|
| Backend replacement token | Direct machine authentication succeeds; known-retired fingerprint rejected before requests | Available for later isolated managed binding; this does not validate a stored n8n credential value |
| n8n replacement key | Exact definition GETs succeed | Metadata access confirmed, not workflow execution |
| Existing managed n8n header references | Digests inspected only; old native references differ from the current intake reference | Bind only new diagnostic copies after a separately approved authenticated no-op check; ordinary references stay unchanged |
| GELATO_API_KEY | Local candidate present and absent from the retired-key registry; deployed binding present | No provider authentication, current account identity or funding proof was attempted here |
| GELATO_STATUS_API_KEY | Absent locally and from saved/serving backend bindings | Live scoped polling is blocked. A later approved secret/configuration release must separately configure it to the exact scope-bound GELATO_API_KEY value; the runtime uses key digests, so another key for the same account is insufficient |
| CRON_SECRET | Saved/serving binding present; no current local candidate | Positive ordinary-cron authentication remains unverified. The isolated timer instead uses backend authentication plus its per-scope capability; do not substitute the backend token for ordinary cron |
| Isolated intake/capability credentials | None issued or installed | Generate and privately bind them only for an approved fresh scope; never store tokens in payloads, public evidence or execution output |

No additional key needs to be pasted in chat. Existing protected credentials can support later configuration, subject to current account/funding verification and explicit authorization for hosted changes.

## Verification and evidence

- 24 network-blocked runner/graph checks cover all three cases, aliases, file swaps, wrong account/provider binding, no-op timer false success, expiry, unknown acknowledgement, persistent journal failure and independent cleanup.
- 29 disposable-PostgreSQL checks include the real isolation HTTP route, canonical W0 routing/claim and SQL output feeding the new generated queue guard, runner validator and native assembly preparation for website, Amazon single and siblings. Provider persistence/files are synthetic. This is not hosted W4 execution.
- Existing native workflow producer-to-request tests and 44 ordinary native-queue checks pass. No ordinary graph/source was changed.
- Four frozen PDF hashes and the selected config hash were rechecked against retained local bytes. No PDF was regenerated or uploaded.
- The compiler produced 12 example candidates across three cases. Their row IDs, account digest and unissued scope UUIDs are intentionally illustrative, and their 2030 dates are inactive now. They are not installable or executable approval packets.
- Full typecheck still fails with 387 diagnostics elsewhere; none are in changed/new TypeScript files. This is not a green repository typecheck.
- Workflow-export scanning passed for 70 exports; a known-retired-fingerprint scan found zero matches in 2,325 text files. The broader gitleaks scan could not complete because its executable is unavailable; no full repository scan pass is claimed.
- Two independent reviewers reproduced three control-flow/input gaps; primary verified them, fixed them and added regression tests. Focused re-review resolved those findings. Evidence/source hashes and redacted receipts are in the companion evidence folder.

Local compiler/rehearsal commands from back-end (Node 24):

```sh
npm run test:gelato-isolated-preparation
LHL_TEST_PG_BIN=/path/to/local/postgresql/bin npm run test:gelato-isolation
npm run test:gelato-workflow-copies
npm run test:gelato-native-queue
npm run prepare:gelato-isolated-workflows -- --packet PRIVATE_PACKET.json --native-source REVIEWED_NATIVE_SOURCE.json --out NEW_PRIVATE_DIRECTORY
```

The compiler refuses an existing output directory. Keep outputs private (directory 0700, files 0600). The packet schema in `back-end/scripts/helpers/prepare-gelato-isolated-workflows.ts` is the authoritative input contract. Packet preparation creates no database identity. Recompilation with real IDs/deadlines changes hashes and requires renewed review; do not edit candidate JSON manually or treat the example account digest as authenticated.

## What remains before live testing

Use the [new run sheet](gelato-isolated-live-run-sheet-2026-10-20.md). Finish the protected adapter for the concrete account/scope/artifact/workflow identities and independently test its exact transport/readback/cleanup bindings. The interface and synthetic rehearsal are not a completed live adapter. Obtain authorization before adding the missing status binding, installing/binding/activating diagnostic copies, issuing a scope or running the named draft-only window. Re-read current main and deployment first. No such action was taken in this phase.

The ordinary W1 native bridge remains a separately prepared production change. This isolated diagnostic path does not establish ordinary W1 scheduling, live W0/W3 generation or preview/approval. All configured shipping alternatives, full quote-versus-order cost reconciliation, real prepress processing and later complete-payable protection still require their own observed evidence. The runner stages one native primary quote per case; it does not silently run the nine-quote alternative-tier plan.

Paid proof, actual charges, shipment/delivery, live cancellation, finished-artwork QA and optional real webhook delivery remain separate. Jeff's full plan is not complete.
