# Local Gelato QA evidence and reproduction

Read [the coverage ledger](../gelato-coverage-current-2026-10-18.md) first. This directory contains local/synthetic results and clearly prefixed historical live OFF receipts. Nothing here authorizes activation, a new order, a provider refresh of existing orders, payment, messages or cancellation.

## Files

- `polling-benchmark.json`: 16 actual-route measurements, four retained dummy-PDF hashes/lengths, runtime labels and limitations. No binary PDFs or private artifact keys are published.
- `cases.json`: five synthetic cases generated through the actual authenticated inspection GET, using the provider financial parser and stored-schema parser.
- `browser-review.json`: six observed browser assertions, including refresh failure/reload recovery. The browser uses actual `GelatoStage` with application Tailwind CSS in the same white container used by the order page. It does not load the full admin shell, navigate child pages or execute a real refresh.
- Four PNGs show financial-review, unknown/OFF, inspection-error and overdue/recovered states. All identities are synthetic. Enabled text in synthetic cases does not describe production.
- `historical-pr27-*.json`: allowlisted metadata from the independently retained prior deployment receipt. The private final route receipt is cumulative (26 entries): its first13 repeat the separately included temporary-window records. The public final projection includes only entries14–26, with derivation metadata and original source checksum; together the two public files describe26 checks, not39. Private originals are unchanged. Timestamped history only; not fresh attestation. Application effect claims derive from source OFF short circuits and bounded client calls, not server-side traffic capture.
- `checks.json`, `manifest.json`, `verify.py`: local command receipts, hashes and consistency checks. Checksums detect mismatches; they do not authenticate a live service or independently repeat provider/PDF byte checks.

The temporary historical webhook deployment retains its explicitly approved immutable OFF snapshot. The temporary secret was removed from project/current serving settings and the local key discarded. This package does not claim global erasure from old snapshots. No Gelato webhook subscription was configured.

## Offline verification (no credentials/network)

From the repository root:

```sh
python3 docs/repo-workflows-planning/gelato-offline-qa-evidence-2026-10-18/verify.py
```

This verifies recorded checksums, benchmark structure/byte totals/deadline result, browser case and assertion consistency, and 26 historical probe records. It does not repeat live tests or reread the six pending orders.

## Re-run local tests

Use the existing locked dependencies and supported Node 20/22, from `back-end/`. Do **not** load `.env` or use dotenv-backed integration/ops scripts. These harnesses install synthetic bindings/transports. A minimal environment provides additional isolation; adjust the Node directory to your machine:

```sh
QA_NODE_DIR=/absolute/path/to/node22/bin
# Use this prefix for each command below:
# env -i HOME="$HOME" PATH="$QA_NODE_DIR:/usr/bin:/bin" ...
node --import tsx scripts/test-gelato-submission.ts
node --import tsx scripts/test-gelato-api-contract.ts
node --import tsx scripts/test-gelato-financial-observation.ts
node --import tsx scripts/test-gelato-scheduled-status.ts
node --import tsx scripts/test-gelato-poll-stored-file.ts
```

`test-gelato-submission.ts` now sends unsupported tier, missing exact service and unsupported-country cases through the real submission endpoint. Expected: HTTP409, no saved quote or provider create. These are synthetic rejection tests, not proof that Gelato rejects a particular real destination today. Browser inspection errors are distinct from these quote endpoint errors.

For realistic-byte benchmarking, privately locate the **retained dummy fixture directory**, containing `WEB-A.pdf`, `AMZ-A.pdf`, `SIB-A.pdf`, `SIB-B.pdf` and `pdf-receipts.json`. Do not use finished customer assets or creative placement review PDFs. The benchmark verifies file hashes/lengths against those receipts before installing bytes in synthetic storage. Independent review parsed all four retained files as 35 pages. Original assembly/raster verification is in PR #22; this benchmark hashes rather than revalidating page geometry itself.

```sh
env -i HOME="$HOME" PATH="$QA_NODE_DIR:/usr/bin:/bin"   GELATO_BENCH_PDF_DIR=/private/path/to/dummy-fixtures   GELATO_BENCH_OUTPUT=/tmp/gelato-benchmark.json   node --import tsx scripts/test-gelato-webhook-status.ts
```

If retained files are unavailable, generate **new local dummy fixtures** with the existing `create-gelato-engineering-rasters.py` and `create-gelato-engineering-pdfs.ts` scripts, then benchmark against their new receipts. Their `--output-dir`, `--run-id`, `--config`, `--font` inputs and the PDF script's raster-directory argument are documented in those sources. Generation needs Pillow, a local font and the existing PDF dependencies. New receipts/hashes will differ; they cannot replace historical provider-byte evidence. No live upload is needed.

The benchmark also runs the pre-existing webhook/scheduler regression suite. Miniflare requires local loopback permission; an EACCES/EPERM listener failure is an environment failure, not a passing Worker result. The script's global fetch is replaced with allowlisted in-memory transport; unknown outbound calls fail. Miniflare outbound service is intercepted. No real billing/account configuration is loaded.

Default candidate time is 2500 ms, total tick ceiling10000 ms and max three candidates. Benchmark invokes one candidate per request: nine fast Node runs, three delayed Node runs, one deadline failure, three focused Worker runs. Slow mode delays each64KiB read by10 or100 ms. It models stream delivery, not an observed service. Worker bridge buffers bodies; CPU/RSS are process-level samples, not billed Worker CPU or peak memory.

## Actual component browser QA

```sh
env -i HOME="$HOME" PATH="$QA_NODE_DIR:/usr/bin:/bin"   GELATO_UI_REVIEW_DIR=/tmp/gelato-browser-review   node --import tsx scripts/test-gelato-admin-inspection.tsx
env -i HOME="$HOME" PATH="$QA_NODE_DIR:/usr/bin:/bin"   node scripts/build-gelato-browser-review.mjs /tmp/gelato-browser-review
python3 -m http.server 8791 --bind 127.0.0.1 --directory /tmp/gelato-browser-review
```

Open `http://127.0.0.1:8791` in a local browser. Keep the server bound to loopback. Do not copy or expose private `.env` files in that directory. Use Scenario to inspect current/overdue siblings, financial-review, unknown/OFF and inspection-error. In overdue: click Refresh Gelato status; expect visible failure while stored prices remain; click Reload details; expect cleared error and confirmation. Confirm two distinct sibling link targets without navigating to production. No cancel control should appear. The request interceptor permits only the local inspection path; refresh intentionally returns409; CSP blocks real connections. This page cannot exercise provider status transitions.

Wait for the scenario's expected text to become visible before assertions; the actual component fetches asynchronously. Stop the loopback server after QA. Do not deploy this fixture or add it to application routing.

## Future live boundary

Fresh cohort registration, separate status credential installation, enabled scheduler/timer and ordinary release remain preparation only. Historical claims and all six pending regular orders are excluded. Obtain specific scope approval before any fresh enabled test window. Recheck account funding/config and live OFF state then; recorded OFF receipts are not current guarantees. No money or customer messages are authorized.
