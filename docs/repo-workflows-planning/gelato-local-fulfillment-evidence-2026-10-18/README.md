# Local fulfillment evidence

This package records local synthetic engineering checks on baseline d423177a. It contains no new live provider results, recipient data, credentials or six pending-order records. `local-journey.json` uses synthetic account hashes, IDs, costs and destination hashes. The three “creates” are fake transport calls, not dashboard orders.

- `ci-followup.json`: initial PR check failure, fixture correction and 90 local read/approval cases; latest hosted status belongs to PR #30.
- `checks.json`: 18 successful selected commands and exact dependency-lock hash.
- `local-journey.json`: website/Amazon/sibling paths, file hashes/counts, read-only release packets and limitations.
- `preview-transaction.json`: 32 disposable PostgreSQL transaction checks.
- `existing-schema.json`: original migration/RPC compatibility and new claim/send/recovery probes.
- `ordinary-router.json`: 23 actual cron-handler regression cases with intercepted transports.
- `review.json`: independent review scope and resolved findings.
- `dummy-pdf-benchmark.json`: 16 additional synthetic real-byte measurements under the current dependency lock; not deployed timing, billed CPU, final artwork throughput or a full three-candidate batch.
- `typecheck.json`: failing baseline typecheck and comparison limits.
- `manifest.json`: payload and relevant source SHA-256 values. `verify.py` checks the recorded evidence offline; add `--source` to check source bytes in this checkout too.

Run from repository root:

```sh
python3 docs/repo-workflows-planning/gelato-local-fulfillment-evidence-2026-10-18/verify.py --source
```

This verifies recorded receipt consistency and hashes, not live services, PDFs currently held by a provider or present controls.

## Repeating source checks

Use supported Node (tested 24.5.0; repo minimum 22.19), the committed lockfile and PostgreSQL 17. Do not load dotenv or pass any real keys. These scripts install synthetic bindings and intercept transports. Work in `back-end/`:

```sh
npm run test:customer-preview-access
npm run test:gelato-ordinary-router
npm run test:w1-gelato-claim-routing
npm run test:gelato-submission
LHL_TEST_PG_BIN=/path/to/postgresql17/bin npm run test:preview-action-transaction
LHL_TEST_PG_BIN=/path/to/postgresql17/bin npm run test:preview-print-schema
```

For a cached official Docker image, replace the PG-bin setting with `LHL_TEST_POSTGRES_DOCKER_IMAGE=postgres:17`. The helper refuses other images, uses `--pull=never --network=none`, no exposed ports/mounts and temporary memory-backed data, then removes only its own container. It never accepts a DB URL. Do not repoint it to a hosted database.

The ordinary-router and SQL checks are added to existing CI. Hosted CI has not run for these uncommitted changes. The journey is an explicit local opt-in because its dummy image generation needs Pillow and a local font.

## Repeating the connected dummy-book journey

Fresh dummy fixtures can be generated entirely from public source. From repository root, after installing Pillow in a local Python environment, choose an existing readable TrueType font path for `LHL_QA_FONT`. Use a new empty output location; the generator refuses overwriting one.

```sh
LHL_QA_DIR=$(mktemp -d /tmp/lhl-dummy-journey.XXXXXX)
python3 back-end/scripts/create-gelato-engineering-rasters.py \
  --output-dir "$LHL_QA_DIR/rasters" --run-id local-qa \
  --config back-end/src/lib/books/configs/book-finding-our-inner-voice/v2.json \
  --font "$LHL_QA_FONT"
cd back-end
GELATO_LOCAL_DUMMY_RASTERS="$LHL_QA_DIR/rasters" \
GELATO_LOCAL_JOURNEY_OUTPUT="$LHL_QA_DIR/local-journey.json" \
npm run test:gelato-local-journey
```

These generate distinguishable WEB-A, AMZ-A, SIB-A and SIB-B images with edition, page number, cover labels and identity markers. The recorded run reused retained engineering rasters, verified their hashes/config/edition/role, and produced fresh canonical in-memory order/artifact identities. Re-generated raster/PDF hashes can differ with font, run label and PDF metadata; verify the new run’s own immutable hashes rather than expecting old hashes. No private asset directory or credential is required for reproduction.

The bundled config remains draft. Only an in-memory clone is active in the test. Real renderer generation and administrative approval are simulated. The backend assembler produces real PDF bytes and validates their configured page count, but this phase does not independently render every new PDF page for creative or physical QA. The earlier dummy geometry evidence remains historical. Product contract: 32 physical inner pages, API pageCount 32, uploaded assembled PDF 35 pages.

All current source changes remain local. Neither this README nor the test helper authorizes publication, hosted migration, deployment, live polling enrollment, provider order mutation, payment or customer messages.
