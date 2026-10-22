# Local scope-authentication and runtime-key corrections

October 22, 2026. Local engineering only. **No publication, deployment, hosted workflow/credential change, provider request or order action occurred.** Normal controls were not changed. The six historical orders were not read or modified.

## What was wrong and what changed

The isolated queue/timer and three scope-header probe candidates used `authentication=genericCredentialType` with `genericAuthType=httpMultipleHeadersAuth`. n8n’s HTTP Request V3 implementation handles a fixed generic set that excludes this credential, then calls its ordinary request helper. Consequently, the registered multiple-header credential is not injected. Its predefined-credential path calls the credential authenticator and applies both `Authorization` and `x-lhl-engineering-token`. The compiler now selects that path. Backend-only assembly/draft requests retain single-header authentication. Keys remain managed credentials, with no values in workflow definitions.

The local regression executes pinned, unmodified excerpts of the actual upstream selector, dispatcher and credential class using synthetic keys. It reproduces missing headers in the old mode and verifies both headers and backend authentication in the corrected mode. Source provenance is in `back-end/scripts/fixtures/n8n-http-auth-upstream.json`; the original files are [HTTP Request](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/HttpRequest/V3/HttpRequestV3.node.ts) and [Multiple Headers Auth](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/credentials/HttpMultipleHeadersAuth.credentials.ts). Git blob IDs and full-source SHA-256 hashes identify the inspected snapshots. The fixture includes the upstream Sustainable Use License terms in `back-end/scripts/fixtures/n8n-LICENSE.md`; excerpts are used for internal compatibility regression tests.

This is a reproduced source-level defect consistent with the three hosted failures. Their exact HTTP/node errors were not retained, and the installed n8n version has not been independently verified. An unauthorized backend response stops the HTTP node before the terminal responder, which is consistent with the prior unparseable webhook responses; that explanation is an inference, not a recovered execution log.

The runner also compared key hashes with Cloudflare metadata values that are masked as an empty string or null. Masks now establish only secret presence/type. A fresh 32-byte random challenge reuses the existing authenticated diagnostic GET. Runtime HMAC-SHA256 proofs are separated by protocol, challenge, environment layer and key role. They prove that order/status keys in Cloudflare, global process and Node process agree with the privately supplied, packet-bound Gelato key. The response contains no raw keys or stable key hashes. All six normal controls must be literal `false` in all three sources to produce a proof. Invalid challenges, absent keys/context and unsafe flags fail closed; the default diagnostic response remains compatible.

A new protected binding requires both the exact Cloudflare deployment UUID and its immutable project-specific Pages origin. The adapter checks canonical source/UUID/URL against those approved values and requests the proof from that unique origin, with redirects rejected. This prevents accepting a matching-key proof from a different canonical-domain deployment. A move during or after preflight fails the deployment checks. This reuses one existing GET: the 200-call business cap, 24-call cleanup caps and 12 observation iterations are unchanged; the longest tested single case remains 192 business calls.

Cleanup does not need a successful key proof. Failed proofs and deployment drift still attempt owned scope closure and all workflow stops; unverified closure remains an error. Old private contexts lacking the new deployment fields fail validation. They must be regenerated and reviewed, not silently edited or relaunched.

## Observed local results

| Check | Result |
|---|---|
| Pinned upstream credential dispatch/injection | 12 passed |
| Actual authenticated GET and key-proof guards | 98 passed |
| Concrete protected transport/retry/cleanup | 68 passed |
| Actual OS crash recovery | 7 passed |
| Launcher and independent monitor | 15 passed |
| Generated single/Amazon/sibling workflow guards | 24 passed |
| Corrected inactive no-order probe graphs | 36 passed |
| Existing submission-runtime and access-boundary suites | Passed |
| TypeScript baseline comparison | 394 identical existing diagnostics; zero changed-file diagnostics |

There are 260 reported checks across the first seven suite receipts. These are local tests, not live provider acceptance. The two additional suites are recorded by successful exit and observed completion, without inventing an assertion count. Full application typecheck remains failing on the unchanged baseline.

## Reproduce without credentials or services

Use the repository’s locked backend dependencies and Node 22 or a compatible newer version. Use a runtime matching the installed native esbuild architecture; do not reinstall dependencies to hide a runtime mismatch. From the repository root:

```sh
cd back-end
env -i PATH="$PATH" NODE_ENV=test node --import tsx scripts/test-gelato-credential-auth.ts
env -i PATH="$PATH" NODE_ENV=test node --import tsx scripts/test-gelato-runtime-key-proof.ts
env -i PATH="$PATH" NODE_ENV=test node --import tsx scripts/test-gelato-protected-runner.ts
env -i PATH="$PATH" NODE_ENV=test node --import tsx scripts/test-gelato-protected-runner-crashes.ts
env -i PATH="$PATH" NODE_ENV=test node --import tsx scripts/test-gelato-protected-launch.ts
env -i PATH="$PATH" NODE_ENV=test node --import tsx scripts/test-gelato-isolated-preparation.ts
env -i PATH="$PATH" NODE_ENV=test node --import tsx scripts/test-gelato-submission-runtime.ts
env -i PATH="$PATH" NODE_ENV=test node --import tsx scripts/test-access-boundary.ts
cd ..
env -i PATH="$PATH" node docs/repo-workflows-planning/gelato-auth-attestation-evidence-2026-10-22/test-probes.mjs
python3 docs/repo-workflows-planning/gelato-draft-approval-evidence-2026-10-22/verify.py
python3 docs/repo-workflows-planning/gelato-auth-attestation-evidence-2026-10-22/verify.py --source
```

The two process suites start disposable loopback services and use synthetic credentials. They do not contact LHL, n8n or Gelato. No test reads local credential files. The source verifier reads/checksums only; omitting `--source` verifies retained evidence only. CI retains historical evidence checks and uses the new verifier for current source coverage, including every source previously covered by PR52 plus the new contracts/tests. Historical receipts are not rewritten to claim a new pass.

## Bounded next steps requiring later approval

1. Publish/review this local diff and deploy the reviewed backend with controls OFF. No migration or key rotation is needed. The new attestation code is currently undeployed.
2. Read back the exact new deployment UUID and immutable Pages URL; regenerate the private binding with those values, source and workflow hashes. Old private compiled bundles now fail strict reconstruction. Do not weaken that guard.
3. Regenerate/review the twelve owned inactive case definitions so their embedded source and scoped authentication match. Install updates only under separate approval. Existing ordinary workflows and seven managed credentials need no change for this selector correction, subject to fresh reference checks.
4. Install four fresh no-order probe copies from this proposal (new nonce `b2c84d61`), bind only the existing managed diagnostic credential references, and run each at most once under explicit bounded approval. Old consumed probe paths/IDs must not be invoked again. Leave all copies inactive after cleanup. Verify the real engine credential injection and runtime OFF response without order/provider calls. These four no-query probes do not return a key attestation. Separately approve one authenticated fresh-challenge GET against the bound immutable deployment origin, then privately verify its proof with the exact approved Gelato key before A2 approval; this read needs no scope, fixture approval or order selector.
5. Only after those readbacks pass, finish human PDF/private-destination review, refresh account/funding/message facts and obtain the exact A2 approval for the three unconverted-draft cases. The provisional October 22 windows do not activate anything; rebind/reapprove them if they expire or another material binding changes.

Matching runtime keys do not establish current account billing/payment facts, provider file processing, ordinary automatic fulfillment, taxes/invoice totals, printing, shipping or delivery. All prior physical-test and cancellation approval requirements remain. This package has `canExecute=false`, `canInstall=false`, no scope/window issuance and no live approval. The heartbeat remains paused.
