# Connected dummy-book status and recovery results

The local queue work has passed independent review, and the next local status phase now passes too. There is no new screen or visual design to approve. This follow-on changes only the test harness and evidence. It does not deploy the queue, update hosted workflows, enable polling or complete Jeff’s fulfillment plan.

The existing six orders were not read or changed. No live business API, hosted control, credential, funding route or customer-message service was accessed. The tests load synthetic process bindings with all six controls OFF. Scheduler enablement is passed directly to the isolated test function; no hosted or process status control is enabled. The account remains unfunded by this work. Current live state was not freshly inspected in this local phase.

## What passed

The actual website W4, Amazon single W4 and Amazon sibling W4.1 local journeys produce four distinct 35-page dummy PDFs through the configured assembly path. The existing geometry contract remains 32 inner pages, API pageCount 32 and upload length 35 pages. Three draft creates are simulated; no regular-order conversion request is made.

The connected extension passes 125 polling attempts: 41 website, 41 Amazon single and 43 sibling scenarios. It invokes the real registered scheduler, submission-store parsers, lifecycle runtime, R2 artifact loader, bounded stored-file verifier, provider HTTP parser, financial normalization and authenticated admin inspection GET. Provider-hosted PDF responses are compared by SHA-256 with the actual assembled bytes. The sibling case rejects exchanging the two children’s PDFs.

The fake database enforces saved IDs, expected observation revisions and owned poll tokens and records the real runtime’s writes. It is an adapter simulation, not a PostgreSQL transaction test. Relevant tracking/hold/financial persistence semantics were compared with the existing SQL. Existing transactional, locking, concurrency and migration checks remain separate evidence.

| Requirement | Case/workflow | Expected | Observed | Evidence | Status |
|---|---|---|---|---|---|
| Connected queued book assembly and read-only status observation | Website W4; Amazon W4; Amazon W4.1 | Preserve the original artifact and every child/item identity | Four real PDFs, three simulated creates, saved graph polled, exact provider item ownership retained | connected-journey.json | Passed locally/simulated |
| Stored file verification and failure isolation | All three; extra sibling swap | Reject corrupt bytes, redirects, wrong recipient/product quantity and foreign roots | Failed observation retained prior status; identity preflight stopped before file reads; no foreign request or redirect follow | connected-journey.json scenarios | Passed locally/simulated |
| Failure recovery without duplicate submission | All three | Retry observation only after rate, provider, timeout, persistence or file failure | Owned-token cleanup, subsequent good read accepted; zero create/convert/cancel/message calls during status checks | connected-journey.json scenarios | Passed locally/simulated |
| Payment and file-processing observations | All three | Keep pending distinct from paid; retain original quote | Pending/no receipt retained; same-time synthetic paid change held; processed-file presence recorded; quote unchanged | connected-journey.json; actual admin handler | Passed locally/simulated |
| Visible errors and terminal behavior | All three | Admin displays failed attempts and saved accepted states; reject regressions | Actual admin GET exposes registered failed polling; failed/delivered cannot silently resume; child tracking retained | connected-journey.json scenarios | Passed locally/simulated |
| Controls and communications | All three | OFF returns before DB; inspection cannot cancel; no sender | No OFF database call, no notification intents/holds, controls still OFF, inspection read-only | helper assertions; source hashes | Passed locally/simulated |
| Actual recurring schedule and SQL ownership | Hosted scheduler/SQL | Due selection, backoff, lease expiry and terminal monitoring proven in environment | Not exercised by this adapter; existing separate local SQL evidence retained | Previous coverage ledger | Not tested |
| Real provider prepress, multi-root shipments and financial settlement | Fresh approved cohort | Real provider processing/status/receipts | Provider states and processedFileUrl are synthetic; one provider root per case | Explicit receipt limitations | Not tested |
| Actual billing, production, tracking, shipping and delivery | Specific paid W4/W4.1 proof | Exact books, recipient, service and capped spend approved first | No physical action or payment | Previous approval gates | Awaiting Jeff’s specific approval |

The original and native journeys were rerun with the optional extension disabled and both passed. Full TypeScript diagnostics remain unchanged from main: 353 source plus 35 retained generated diagnostics. This is no new type regression, not a green typecheck. The queue phase’s successful package build is retained; this follow-on changes no production code, dependencies or build settings. Independent review found no open confirmed High/Medium findings. The remaining low recipient-ordering assertion was added and rerun.

## Reproduce locally

Use locked backend dependencies and Node 22.19 or later. Node 24.5 ARM was used here. Do not load dotenv or real service credentials. Generate distinguishable dummy rasters with `back-end/scripts/create-gelato-engineering-rasters.py`, the bundled v2 config and a local font, as described in the native-queue results. From `back-end` run in a clean process:

```sh
env -i HOME="$HOME" PATH="$PATH" \
 GELATO_LOCAL_DUMMY_RASTERS=/absolute/path/to/dummy-rasters \
 GELATO_LOCAL_NATIVE_QUEUE=1 GELATO_LOCAL_STATUS_JOURNEY=1 \
 GELATO_LOCAL_JOURNEY_OUTPUT=/absolute/path/to/local-receipt.json \
 node --import tsx scripts/test-gelato-local-journey.ts
```

The fixture uses in-memory active configuration; the bundled draft config stays unchanged. Provider and storage hostnames in the transport are intercepted locally. A watchdog requires completion; unexpected transport attempts are retained outside caught failure paths and fail the test. The reviewer’s temporary mutation removing the saved-root guard caused the test to fail, as intended.

[Evidence and offline verifier](gelato-connected-status-evidence-2026-10-19/README.md). Run `python3 verify.py --source` there for recorded checksums and source consistency; that verifier does not execute the tests. Private full receipts remain under the ignored `.gelato-testing/status-local-20261019` directory in the original checkout. No credentials or recipient originals belong in the public evidence.

## What remains

Source publication, hosted native queue installation and recurring polling activation have not occurred. A future approved rollout needs a fresh W1 snapshot, exact credential and routing review, a safe current polling caller credential, native multi-item failure pairing and terminal W4/W4.1 execution evidence. The existing six orders remain excluded.

The ordinary automatic regular-order release executor is still absent. Read-only release review continues to refuse release because that transport, specific monetary approval and verified payable total are missing. The isolated historical engineering conversion is not ordinary fulfillment. No release behavior was added in this test-only phase.

The fake scheduler deliberately does not model due-time selection, backoff jitter, terminal monitoring windows, lease expiry or concurrent SQL execution. Synthetic processing, printing and delivery statuses prove application handling only. Real prepress, account prices/taxes/invoices, multi-root shipments, physical production and receipt inspection remain live proof or approval gates. Physical printing and cancellation must each retain their specific approval.
