# Combined local dummy-book integration results — 2026-10-19

All three local cases passed: website W4, Amazon single W4 and Amazon sibling W4.1. Four distinguishable PDFs were assembled through the configured path (32 physical inner pages, API pageCount 32, upload 35 pages), then their saved request/member/file graph was seeded into a disposable PostgreSQL database. The actual ordinary release core/store, registered scheduler, lifecycle writer and admin inspection GET were exercised together. **This is local integration evidence, not live end-to-end completion.** No production source, dependency, schema migration or workflow export was changed; the changes are confined to test helpers/hook, local fixture generation, guarded CI and documentation.

The combined run passed **55 named check groups** and recorded **65 SQL scheduled claims/attempts**, including explicit abandoned-lease fault injection. Exactly three simulated conversions occurred, one per root; four PDF hashes remained distinct. Seven persistent-session driver probes passed, including marker-like result rows, multichunk Unicode, per-session serialization, independent writers/roles, SQL-error rejection and healthy-peer survival. The previous optional-extension-disabled queue/status journey also passed, retaining all **125** simulated status scenarios. Full typecheck remains non-green: **388 inherited diagnostics**, identical file/code/message multiset to the recorded PR32 baseline, none in changed test files. The repository secret scan completed with zero findings.

| Requirement | Case/workflow | Expected | Observed | Evidence | Status |
|---|---|---|---|---|---|
| Combined artifact/approval/release ownership | All three local journeys | Real assembler bytes and saved mappings survive durable approval/retry | Two approvals race on one SQL root; exactly one intercepted conversion per case; new client/store cannot resend | combined-journey.json | Passed locally/simulated. |
| Quote/price admission and child association | All three; sibling swap | Expired/error quotes, incomplete payable and wrong child bytes reject | Negative preparation fails before conversion; two distinct assembled sibling PDFs cannot be exchanged | combined-journey.json | Passed locally/simulated. |
| Lost outcome and persistence recovery | Amazon single and siblings | No duplicate after lost mutation/read/finish acknowledgement | Single recovers read-only while release OFF; sibling lost finish ACK retains SQL closure; replay remains fenced | combined-journey.json | Passed locally/simulated. |
| Scheduled SQL ownership/timing and retry | All three | Due-time, single owner, expired lease, late token and backoff honored | Parallel claim has one owner; expired lease reclaimed; stale completion rejected; no immediate second tick; Retry-After honored; stable terminal horizon stops when expired | combined-journey.json | Passed locally/simulated. |
| Persisted lifecycle/admin/error/financial mappings | All three | Errors visible, recovery read-only, original quote preserved and child tracking correct | Actual scheduler + lifecycle SQL + admin GET cover rate/provider/corrupt/redirect/database faults and sibling swap; synthetic delivery with pending finance stays distinct | combined-journey.json | Passed locally/simulated. |
| OFF and message isolation | All three | OFF rejects before work RPC/provider access; gate read allowed; no intents, unrelated rows or hosted effects | Local sentinels unchanged, zero notification intents, local gates restored OFF, containers removed; no hosted controls or six orders selected | boundary.json | Passed locally/simulated. |
| Real fresh workflow/prepress/final pricing | Fresh future cohort | Latest installed workflows and actual provider responses | Not attempted; no verified payable source or automatic production release adapter installed by this work | remaining plan | Not tested. |
| Actual charges, printing, shipping, delivery and cancellation | Specific physical proof | Exact packet and approval before effects | Plan only; no funding or physical operations | remaining plan | Awaiting Jeff's specific approval. |

## Reproduce the actual tests

Use locked backend dependencies and Node >=22.19. Do not load dotenv, a hosted URL or real credentials. Create distinguishable dummy rasters with `back-end/scripts/create-gelato-engineering-rasters.py` using the bundled v2 config and a local font, or reuse the existing controlled geometry rasters. Pass their directory below. Use an already cached official `postgres:17` image; the recorded run used 17.10 with image digest `postgres@sha256:7958605b474b3d264a969cb3a123d6aa00ad1e1fe9da8a69984dabb704d93317`. The recorded local runs pull no image; CI explicitly fetches the digest-pinned image before testing. No test database TCP port is published, container networking is disabled and its temporary storage is destroyed. This is test-runtime evidence, not hosted 17.11 compatibility advice.

From `back-end`:

```sh
env -i HOME="$HOME" PATH="$PATH" \
 LHL_TEST_POSTGRES_DOCKER_IMAGE=postgres:17 \
 GELATO_LOCAL_DUMMY_RASTERS=/absolute/path/to/dummy-rasters \
 GELATO_LOCAL_NATIVE_QUEUE=1 GELATO_LOCAL_PERSISTENT_JOURNEY=1 \
 GELATO_LOCAL_JOURNEY_OUTPUT=/absolute/path/to/private-combined.json \
 node --import tsx scripts/test-gelato-local-journey.ts
```

The driver regression is `env -i HOME="$HOME" PATH="$PATH" LHL_TEST_POSTGRES_DOCKER_IMAGE=postgres:17 node --import tsx scripts/test-local-preview-sessions.ts` from the same directory.

For the prior-status regression, omit `GELATO_LOCAL_PERSISTENT_JOURNEY`, set `GELATO_LOCAL_STATUS_JOURNEY=1`, and use a different output path. The optional hook defaults disabled. No package or lockfile changed. The offline verifier is distinct from both commands.

## Boundaries and review

The initial W0/W3 producers, preview action route and W1/W4/W4.1 node bodies execute locally with dummy artwork, simulated admin decisions and simulated initial DB RPCs; there is no hosted n8n engine. A one-way handoff then seeds their real assembled artifact graph into SQL. A narrow local Supabase REST/RPC bridge invokes actual SQL under service_role, not a running PostgREST server. SQL function metadata is cached and four independent psql sessions are warmed before timed claims; production deadlines were not changed. These are actual SQL connections for the races, with no network route. Query framing uses random exact-line markers, UTF-8 decoding, serialized queries per connection and bounded close/error handling. The earlier Docker-per-query approach hit the one-second claim deadline and was replaced; its failed run is not counted as a pass. The bootstrap fixture mirrors only required existing service update rights; no hosted privilege or RLS was changed.

Complete payable values are synthetic fixture inputs, not verified provider amounts or permission to spend. Provider file-processing, finance, production, tracking and delivery responses are synthetic. Due/lease/terminal times are advanced by explicit disposable SQL fixture updates, not wall-clock recurring hosted scheduling; no process is killed for the lease-abandonment simulation. Byte checks use actual assembled PDFs, but this is not final-art size/performance or physical print-quality evidence. Admin GET is invoked directly, not through a signed-in browser/full UI shell. All unexpected transports fail closed; no provider/customer service is called.

An independent fresh-context source critic traced direct release/SQL/scheduler/lifecycle/admin contracts and reported no remaining findings. It identified a new-instance evidence wording issue plus query-marker and multibyte decoding issues in the opt-in local driver. All were corrected and the driver probes passed. The OFF group label was clarified editorially after the run: its guard reads the local gate, then rejects before work RPCs/provider access. Public labels reflect that clarification; private original labels remain retained. The primary agent completed and checked the full run; the reviewer did not independently rerun the whole suite. Existing public source/CI proofs are retained, not rerun wholesale. No commit, push or deployment occurred in this phase. Hosted controls were not read or changed; the preceding PR32 OFF verification is historical, not a fresh live-state attestation.

[Redacted evidence and offline verifier](gelato-combined-evidence-2026-10-19/README.md). [Remaining live, pricing and physical plans](gelato-remaining-test-plan-2026-10-19.md). Jeff's complete production/billing/delivery plan remains unfinished.

## Publication follow-up

Before publication, the branch was fast-forwarded to main `fb0d31cf92ca2d933b875abd7b9f12998c1c01e0`, preserving PR33's separate PDFMonkey fix. The original controlled-Python-raster results above remain historical evidence. The existing required `check-gelato-ordinary-release.yml` workflow now also runs the session probes, creates visible dummy rasters through the already locked Sharp dependency, executes the combined journey in a clean environment, and verifies this evidence/source manifest. No dependency or lockfile was added. CI's fixture path is disposable and its provider/database credentials are synthetic. No generated runtime files are uploaded as public artifacts.

`create-gelato-local-rasters.ts OUTPUT_DIR RUN_ID` is the local/CI alternative to the original Python generator, run through Node's existing tsx loader from `back-end`. It creates a new directory, four labelled child/edition sets and 132 geometry PNGs. The raster byte hashes may differ across generators/fonts; each run verifies its actual bytes and distinct child PDFs internally rather than equating them with a previous run's hashes. No creative or physical quality is approved by either generator.

The session probe was corrected during publication review to compare a peer connection against its captured original SQL role, supporting native local PostgreSQL usernames as well as Docker's `postgres` role. The native server startup remains untested on this host; the independently executable Docker probe is the recorded runtime proof. Required hosted checks and PR state are supplied by the publication PR, not inferred from the original local receipt.

The publication-time full typecheck on that newer main reports 389 diagnostics: the prior 388 plus TS2345 in main's unmodified `scripts/test-w4-print-worker.ts` from PR33. None are in this change's files; this is not a green full typecheck or an independently rerun diagnostic baseline of PR33. The corrected seven session probes passed. A fresh Sharp-fixture/combined replay twice stopped on the local Docker startup deadline before any SQL case ran; those attempts are not passes. The publication PR's required hosted combined job must pass before merge. The earlier completed 55-group/65-attempt controlled-fixture run above remains the complete local integration evidence.
