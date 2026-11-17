# Book layout source overlay

This overlay binds the phase 003b book layout and calibration candidate. It retains all 147 source paths from the committed cron overlay and adds 21 layout, calibration, test and fixture paths. Twenty-eight inherited hashes change (the compiled Pages worker test was rebound on 2026-11-06 for the compare-and-set `updated_at` fixture): the production-build workflow, W3 manifest, W4 print input, canonical book types and the two workflows that select this verifier, plus 21 paths rebound on 2026-11-06 for the CI repair round (export-secrets workflow, back-end package manifest, Gelato helpers and tests, W0 payload and manifest builder, checkout and cron routes). The previous manifest is kept in `history/manifest-before-ci-fix-rebind-2026-11-06.json`. Other inherited hashes remain unchanged.

The manifest uses the reviewed clean candidate. It excludes unrelated changes in the working tree. The QA fix successor adds a shared placement schema and records the canonical types rebind; earlier candidate manifests and proof receipts remain frozen.

`verify.py --source` checks the current candidate's 168 source bindings, this overlay's evidence and the preserved cron manifest. It invokes the cron verifier without `--source`, retaining the historical evidence and policy chain. It does not renew any historical manifest, writer, receipt or suite result.

`test-verifier.py` checks one valid source snapshot, then rejects the original 21 corruption mechanisms and six added cases: layout code, HTTP test, layout fixture, unowned rebinding, shared placement schema and canonical config types. The valid startup check and 27 corruption cases have separate counts. Tests use disposable public source and evidence copies. They do not run business suites, database operations, providers or hosted checks.

All execution and installation authority flags remain false. These bindings do not establish current CI success, browser acceptance, hosted template parity, deployment approval or production activation.

Run from the repository root after independent review:

```sh
python3 docs/security/book-layout-source-evidence-2026-10-30/verify.py --source
python3 docs/security/book-layout-source-evidence-2026-10-30/test-verifier.py
```

## November15 streaming print preparation rebind

The previous manifest is preserved byte-for-byte in `history/manifest-before-print-test-streaming-2026-11-15.json`. Five existing source bindings changed after the reviewed streaming fix: the ordinary-release workflow, backend package script, combined-journey helper, local-journey test and stored-file verifier. The three newly rebound inherited paths are explicitly listed in the verifier; the other two were already in its reviewed rebind ledger. All other inherited hashes and the parent manifest are unchanged.

The shared bounded file-digest module and its146MB Worker service/application regression are added explicitly, bringing current source coverage to172 paths. The corruption suite retains its prior27 cases and adds changes to each new bound source and both quote-boundary sources, for31 rejection cases plus the separate valid-snapshot check. The new test proves synthetic Worker memory/binding behavior; it does not establish live transfer throughput or authorize printing. All four execution/installation/acceptance flags remainfalse. Historical receipts, phase evidence and parent proofs are not renewed.

Final review also binds the quote-only CLI and its regression. The helper forces manual redirect handling; the real quote client rejects all tested3xx responses, and different hosts/operations/methods fail before transport. No provider order operation was added.

## November15 operator readiness successor

The prior172-path manifest is preserved byte-for-byte in `history/manifest-before-operator-readiness-2026-11-15.json`. This successor explicitly covers every changed runtime, UI, migration, profile asset, CI command and regression for the admitted CSV operator journey. Current coverage is 236 source paths; inherited changes are enumerated in REBOUND and newly covered paths in ADDED. The valid-snapshot check remains separate from38 corruption rejections, including admission, hold API, both SQL migrations, profile bytes, paid-review UI and independent PDF preflight. Parent manifests and all four false authority flags remain unchanged. This is a source binding, not hosted or paid-order acceptance.

The hosted access-inventory successor adds the actual authentication regression and both canonical consumer fixtures. Print preparation now authenticates before parameter/order lookup; existing verified machine callers remain supported and the test-owner branch still requires Access creator identity. The inventory exercises30real handler denials, including delegated paid review.

## November16 automatic CSV identification successor

The previous236-path manifest is retained unchanged in `history/manifest-before-automatic-csv-2026-11-16.json`. Current coverage is240 source paths, adding the canonical CSV selection and source-item producer plus the request-envelope and archive-consumer regressions. The upload UI, handler and signed admission test now cover file-only listing recognition, all-row identifier rejection and current published-edition selection. Historical ZIP/message probes explicitly retain their original API edition; frozen production orders are not upgraded. The separate valid-snapshot check and43 corruption rejections bind this source change. Parent evidence and all four false authority flags remain unchanged; no hosted, paid or physical acceptance is renewed.

## November16 workflow audit successor

The prior240-path manifest is retained byte-for-byte in `history/manifest-before-workflow-audit-2026-11-16.json`. Current coverage is294 source paths: failure reporting, guarded early retry, paid-provider claim denial, accountable QA attempts and late-event fencing, exact sibling intake, reviewed assembly/approval transitions, and consistent print quote defaults. Newly added and changed inherited paths are explicit in ADDED/REBOUND. The valid snapshot remains separate from51 corruption rejections. Parent manifests and all four false authority flags remain unchanged. This binds local source; it does not activate workflows, spend provider credits, renew hosted acceptance, certify PDF/X, or establish physical print quality.

## November16 Linux CI fixture successor

The prior294-path audit manifest is preserved byte-for-byte in `history/manifest-before-ci-fixture-2026-11-16.json`. The actual notification suppression test now supplies a completed, explicitly reviewed book and intercepted current preview before calling final approval, so it exercises messaging after the canonical admission guard. Runtime approval requirements remain strict. Current coverage is295 source paths and52 corruption rejections plus the separate valid snapshot. Parent evidence and false authority flags remain unchanged; this is not live-message or provider acceptance.

## November16 native Worker transport successor

The prior295-path manifest is retained byte exact in `history/manifest-before-worker-transport-2026-11-16.json`. Current297-source bindings include the native n8n/W0 transport regression and canonical W0 POST transport;54 corruption rejections plus the valid snapshot are required. The two Amazon dispatch callers retain their existing non-2xx refusal. Prior history, parents and four false authority flags remain unchanged; synthetic runtime proof is not provider or physical print acceptance.

## November16 workflow HTTP envelope successor

The prior297-source manifest is preserved byte exact in `history/manifest-before-http-envelope-2026-11-16.json`. Current299-source bindings add the standalone HTTP envelope selector and actual producer/expression/POST regression. The package required workflow-readiness gate and three leaf exports are rebound; only their intended HTTP body expressions change semantically. The separate valid snapshot and56 corruption rejections retain all prior cases. Nullable legacy aliases are absent for optional identity comparison; canonical ownership/job/proof declarations remain strict and malformed top fields never trigger legacy body fallback. Historical parents and all four false authority flags remain unchanged. These bindings establish source consistency, not live generation, provider or physical print acceptance.

## November16 Belize n8n evaluator compatibility successor

The previous299-source manifest is preserved byte exact in `history/manifest-before-n8n-runtime-2026-11-16.json`. Current301 bindings add the isolated locked n8n test-tooling package and lockfile;58corruption rejections retain all prior cases and the separate valid snapshot. The actual HTTP handoff regression now compiles/evaluates all three exported leaf expressions with live-observed Tournament1.11.1 and ast-types0.16.1, including recast’s resolved scope library; Code-node fixtures still use vm. Required production CI installs the separate tooling with ignore-scripts before running readiness; application dependencies/runtime are unchanged. The original optional-catch expression reproduces the exact live Pattern error; explicit catch binding passes every original handler/identity/legacy/QA test with zero providers. Earlier receipts and all four false authority flags remain unchanged; this is not successful paid generation or physical print acceptance.

The same unpublished candidate was further checked against n8n’s documented property-access sanitizer. The selector now uses Object.hasOwn to avoid prohibited prototype access; its Tournament regression applies the corresponding bounded static/literal/dynamic property afterhook and controls. This covers the used property-access rule, not the full n8n SDK sandbox. The pre-property301 candidate is retained at Git03815e0b; the prior published299 manifest remains byte exact in history. Source count and58negative cases are unchanged.

## November17 hair and native continuation successor

The prior301-source manifest is preserved byte exact at `history/manifest-before-hair-native-retry-2026-11-17.json` and bound as evidence. Current304 source paths add the pose prompt owner, lean QA identity restorer and guarded native-retry owner;62corruption rejections plus the separate valid snapshot retain every prior case. Actual graph/handler regressions exercise two-image pose8 request, SW1 Set coercion, repeated SW2 rejection/retry/exhaustion, native dispatch CAS, retained publication correlation through real SW3 return, preserved0–8 state, resumed9–12 and13-pose completion. No provider calls occur in those fixtures. All four authority flags remain false. This source record does not assert hosted CI, live paid generation or print acceptance.


## Admin mobile sign-in successor, November17

The exact prior304-source manifest is preserved in `history/manifest-before-admin-mobile-signin-2026-11-17.json`. The current snapshot binds 329 source files, including first-party managed auth, human consumers, runtime preparation and actual Worker regressions. Eleven additional corruption probes protect the new auth contract and setup instructions. Earlier historical manifests and all62 earlier negative cases remain retained. All execution/install/live-acceptance/suite-renewal authority flags remain false. This source receipt does not activate Supabase Auth, SMTP, production users, workflows, images or printing. Local test/visual evidence is separate; hosted exact-source CI and live delivery/phone acceptance remain pending.


## Admin recovery UI successor, November17

The exact prior329-source manifest is retained at `history/manifest-before-admin-recovery-ui-2026-11-17.json`. Existing native retry ownership, job snapshots, retained assets and consumed dispatch remain strict; a sanitized inspection descriptor and separate generation-free preparation/explicit resume controls expose the existing owner through the admin. Actual native preparation→inspection tests cover retained0–8, remaining9–12 and consumed states after adoption/completion/later failure. Six additional corruption probes protect the inspection, client, order link, runbook, plan and prior manifest; all73earlier probes remain. Source count stays329; no application dependency, workflow export, print setting or live order changes. All four authority flags remain false. Local synthetic browser evidence and hosted publication remain separate from source binding.
