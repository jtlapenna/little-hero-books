# Expanded Gelato verification: unpaid diagnostic and preparation evidence

This directory supports the [requirement coverage ledger](../gelato-fulfillment-coverage-2026-10-15.md) and [isolated unpaid-lane design](../gelato-fulfillment-isolation-plan-2026-10-15.md). It records an in-progress phase. There have been no new workflow submissions, regular creates, conversions, payment changes or customer messages.

The initial source is main `e5ab870341842206ca04f933341aab0e66f3da0c`. Earlier results PR #13 remains useful for the completed draft scope. It is not expanded fulfillment proof.

## Evidence boundaries

- `source-preflight.json`: authenticated current-main fetch and PR #12/#13 identities/check results. The existing dirty checkout was preserved.
- `current-controls.json`: five GET-only service requests verifying normal project/serving flags, runtime views/factory, database dispatch and the two workflow copies OFF at the recorded time. It is not an ongoing state guarantee.
- `retained-observations.json`: fresh GET-only observations of the three existing drafts and hash verification of their four original protected PDFs. The API-key fingerprint and all recipient, object-key, file URL and raw-response details are omitted. All orders remained financially draft, with no processed-file URL. Each draft's monetary receipt totals were zero; this does not establish zero fulfillment cost or an actual charge.
- `notification-safety-checks.json`: local canonical quote/lifecycle/outbox and disposable PostgreSQL evidence, including actual old-schema forward upgrade, in-flight refusal, backfill and delivered-receipt preservation. This historical local receipt predates installation/deployment; see notification-safety-live.json for the later rollout.
- `notification-safety-live.json`: exact hosted SQL body/trigger/ACL checks, rollback-only insert/claim/send-authorization proof, PR #14 deployment, three retained-draft refreshes and dated all-OFF observations. Draft refresh does not establish real regular-state notification behavior.
- `quote-observations.json`: five real quote responses, raw-text SHA receipts, allowlisted line prices/options/estimates and local policy selections. All 35 returned shipment options are retained; no recipient, file URL or response body is published. Quantity-one/two proves line-price aggregation. This does not reconcile an order estimate or invoice.
- `after-quotes-controls.json`: fresh GET-only OFF observations after quotes; no control was changed.
- `account-funding.json`: read-only dashboard payment observations and explicit owner confirmation; private email/key fingerprint omitted. No regular-order execution is authorized by this receipt alone.
- `local-fixtures.json`: four new distinguishable local geometry fixtures. Records source fingerprint, PDF hashes, separate 32 inner/API and 35 uploaded-page counts, and independent decoded raster/placement/page-geometry checks. Poppler renders of the cover and first/last inner page for each child were visually inspected. `liveWorkflowExecuted` and provider-processing proof are explicitly false.

Private originals remain owner-only in the originating checkout's ignored testing directory. No environment file, key/password/claim token, recipient, signed URL, private provider response or PDF binary is included. The local generator's domain `fixture.example.test` is a non-network fixture marker, not a live file URL.

## Reproduce the local fixtures

Use a disposable checkout of this branch with Node 20, the locked back-end dependencies (`npm ci` from `back-end`), Python 3 with Pillow, and an explicit TrueType font file. The recorded font hash is in `local-fixtures.json`; a different font/version can produce different PNG/PDF hashes. Supply a fresh run ID and a nonexistent output directory. Neither generator loads application environment files or accesses services; the PDF generator installs a global-fetch rejection sentinel.

From the repository root, substituting your local font and a fresh temporary output directory:

```sh
python3 back-end/scripts/create-gelato-engineering-rasters.py \
  --output-dir /tmp/lhl-gelato-fixtures-fresh \
  --run-id FRESH-UNIQUE-RUN \
  --config back-end/src/lib/books/configs/book-finding-our-inner-voice/v2.json \
  --font /absolute/path/to/font.ttf
cd back-end
node --import tsx scripts/create-gelato-engineering-pdfs.ts /tmp/lhl-gelato-fixtures-fresh
```

The raster generator writes 132 numbered PNGs: 32 interior pages and one visibly labeled cover spread for each of WEB-A (standard edition), AMZ-A (Amazon edition), SIB-A and SIB-B (Amazon sibling edition). It does not use recent character-placement review PDFs. The next command invokes the actual configured assembler, then independently decodes all 140 PDF pages and checks page geometry, expected blank endpapers, exact full-page image placement and every raster's pixel hash. All four PDF hashes must differ. Output creation is exclusive; do not delete or replace consumed artifacts to reuse a run ID.

These are direct local assembler fixtures. They do not run intake, canonical frozen-manifest loading, claims, n8n, the deployed backend or Gelato. Future native runs must use their fresh source rasters through the normal workflow and verify the resulting canonical PDF; a prebuilt diagnostic PDF is not a substitute.

Render and inspect the output independently with Poppler, for example:

```sh
pdfinfo /tmp/lhl-gelato-fixtures-fresh/WEB-A.pdf
pdftoppm -f 1 -l 3 -scale-to 900 -png \
  /tmp/lhl-gelato-fixtures-fresh/WEB-A.pdf /tmp/web-a-review
```

Repeat for all children and the final interior page (PDF page 34). Check legible child/edition, FRONT/BACK COVER labels, inner sequence numbers and visible identity markers. The confirmed trim is 200 x 200 mm; the upload includes the configured cover spread and two blank endpapers. Do not change API pageCount to 35 or a generic documentation example without SKU-specific provider evidence.

Adjacent existing local regressions from `back-end`:

```sh
npm run test:gelato-print-pdf
npm run test:gelato-api-contract
npm run test:gelato-attention-recovery-api
```

The first supports `GELATO_TEST_PDF_PATH` for its unlabeled geometry baseline, as described in its source. Its successful output is not a finished illustrated book or provider validation. The API contract test exercises configured tier selection and fail-closed behavior using synthetic and previously captured provider-shaped data; it is not a fresh quote on the new account. The attention/recovery suite tests simulated boundaries rather than a live admin session.

## Before any new provider order

`account-funding.json` records completed inspection of the existing LHL account: no payment methods, 14 inactive zero wallets, no configured auto-top-up, Free plan, no monthly invoices, and explicit owner confirmation that no other invoice/credit/promotional funding route exists. Prepayment history was not exposed by its View control and is not claimed empty. The three exact earlier draft roots bind the signed-in account to the stored key privately. No billing change occurred.

The same-account fallback can reuse the protected synthetic native lane without new hosting, subject to exact cohort/account pins, competing-work inventory, scoped lifecycle actions and durable synthetic notification suppression. A different account would require the separate-stack/account-ownership alternative. The management connector exposed no Supabase organizations/projects; this is not a blocker to the same-account fallback. Normal keys and shared n8n variables remain unchanged.

The implementation currently only creates held drafts. The design records the proposed explicit conversion step, account-bound consumers, immutable price observations and safe admin summaries that need review/implementation before expanded native tests. If the verified no-payment account blocks acceptance or processing, preserve the exact response and mark that boundary blocked. Actual charges, printing, shipment and delivery require a separately approved priced physical packet. No paid test or charge/production-affecting cancellation is authorized by this preparation package.

## Quote-only reproduction boundary

`back-end/scripts/observe-gelato-engineering-quotes.ts` is a protected operator diagnostic for the originating checkout and retained owner-only journals. It reads the ignored credential and approved-recipient files, pins the key fingerprint and old journal hashes, reads three old drafts and four canonical PDF bodies, and sends exactly five fresh quote references. Redirects fail; permitted provider POST is only `/v4/orders:quote`. No create, patch/conversion, cancellation, backend mutation or storage write route exists. Output directory and all intent/raw response files are exclusive and owner-only. It never changes process credentials or application controls.

A reviewer reproducing offline can inspect the redacted summaries; reproducing live requires the private original package/key/recipient, source review and a new unused receipt directory. The helper deliberately pins the originating path and does not supply credentials or replace missing journals. From `back-end`, the original operator used Node 20 with tsx and the private source root, passing `quotes-20261015-C` as the new directory name. Do not reuse that consumed directory. First inspect any partial run; never delete its evidence to make replay possible. An earlier `quotes-20261015-B` stopped at the first provider GET before any quote because it compared expiring signed URLs; its receipt remains private.

Five actual quotes show USD 12.18 per quantity-one product line and 24.36 per quantity-two line for both editions. Siblings return two lines of 12.18 each and one estimated package. Standard shipping is 3.81 single or 5.32 pair; priority 9.22 and expedited 29.81 for either. All configured tier matches are real quote validation, while unsupported-tier/destination rejections are local policy checks. No UI failure handling, invoice, charge, file-processing completion, printing or shipment is inferred. Quotes expire and cannot authorize a later create/conversion. Capture a new quote in each actual workflow window.

## Synthetic notification safeguard and rollout

`migration-gelato-engineering-notification-suppression.sql` is the forward migration for the currently deployed schema. Equivalent definitions are included in the fresh-install schema. With notification delivery OFF, install the reviewed forward migration using an authorized database connection. It locks notification writes, aborts if a known engineering sender has already started, suppresses pending synthetic receipts, preserves delivered evidence, installs the insert guard and enforces eligibility immediately before send authorization. Application changes suppress intent creation for a whole engineering cohort and block marked queued payloads before any sender call.

The permanent identifier boundary is retained `TEST-GELATO-*` submission/root/member identity, case-insensitively. `book_specs.testMode` also suppresses current marked records, but is mutable; it alone is not a permanent latch after removal. Do not remove the synthetic identifiers or route these records through ordinary scheduling.

Run `npm run test:gelato-notifications` and `GELATO_TEST_PG_BIN=/absolute/postgres/bin npm run test:gelato-print-submissions` from `back-end`. The latter needs PostgreSQL server/client tools and `ripgrep` on PATH. It starts and destroys a private Unix-socket-only disposable database, not a configured Supabase project. Its optional `GELATO_TEST_PRINT_SCHEMA` chooses a local old-schema SQL fixture for forward-upgrade verification. The recorded upgrade used the schema extracted from current main e5ab870. It covers migration repeatability, unsafe started-sender rejection, old pending quarantine, whole delivered-row preservation, mixed cohorts, ordinary positive controls and existing concurrency/ownership tests. No credentials are needed for these local tests.

The CI job runs both suites without production secrets. Main's deployment workflow is separate, does not depend on that job and does not apply SQL. Pushing a feature branch does not deploy production; merging backend changes to main automatically deploys the application. PR #14's suppression SQL was installed and verified before its merge. For the scoped change, install and verify its empty authorization table/functions before merge, wait for green CI/preview builds, then merge to trigger runtime deployment. If runtime arrives first accidentally, unavailable/empty scoped authority still fails closed before provider creation. Keep all delivery/submission controls OFF and verify serving source/runtime after deployment. The external Chrome dashboard subsequently supplied authorized SQL access. The exact migration and application are now installed/deployed; see notification-safety-live.json. The plugin management account remains separate and unauthorized. Do not enable regular-order testing on the strength of local suites alone.


## Normal controls remain OFF

The historical runner must not be reused to enable global controls. The separate [scoped-window plan](../gelato-scoped-unpaid-test-plan-2026-10-15.md) describes the prepared exact-order, expiring authorization. Its database suite includes actual service-role insertion/terminal closure and anonymous denial, two-session expiry contention at begin/send with the waiter observed blocked before expiry, and ordinary enabled-gate regression coverage. The migration drift checker compares all three copied definitions with their canonical source before database tests. These are local proofs; no new native/provider order is inferred.
