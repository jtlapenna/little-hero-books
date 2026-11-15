# Inner Voice print-test preparation, November 15

Scope: Jeff approved the November 15 visual book and requested remaining preparation for an end-to-end print test. Shadows must be baked into backgrounds, with original files retained. Preparation does not authorize a paid order or broad customer-print activation.

The artwork checkout remains on `0444c3b8` with substantial existing local work. This task uses the isolated `codex/inner-voice-print-test-prep-20261115` worktree from fetched main `90584f5d`, preserving deployed fixes and avoiding a release from the old mixed artwork tree. The backend dependency lock is unchanged. An exact `npm ci` in this worktree resolved the earlier shared-dependency OpenNext packaging issue; the full Pages build now passes. No dependency versions changed.

## Candidate

`back-end/scripts/prepare-inner-voice-print-test.ts` prepares a new draft version (provisionally 4), content-addressed background keys, a complete local asset map and an audit manifest. It preserves current v3 character frames, clipping, guide layers and long-name/cover fitting. All 73 background bindings include the approved shadow draft 39, corrected cover/pages 6/7 and the page-26 distant slide. Opaque RGBA exports lose only their redundant alpha channel; transparent backgrounds are refused. There is no HTML shadow layer.

The proposed page 31 retains Little Hero Labs, adds the established brand line and a short general note, and uses the website in place of pending copyright copy. Jeff explicitly allowed general LHL information instead of repeating the older title page. After access recovery the older title-page image was retrieved and viewed. It credits Little Hero Labs, dates its publication November17,2025, carries ISBN978-1-257-01679-2 and ©Little Hero Labs2025. The authorized general-information choice avoids repeating that page. No new copyright owner or year was invented.

## Work to complete

1. Verify immutable candidate bindings, source preservation and current CSV/version selection; test negative cases without provider calls.
2. Render both editions with current W0/W3 code, normal and boundary names, and all guide-specific pages. Visually inspect the updated pages, imprint, shadows and clipping.
3. Assemble and independently preflight 35-page Gelato files: cover spread, blank front endpaper, 32 interiors, blank back endpaper. Keep screen-review PDFs separate from print artifacts and preserve lossless pixels.
4. Prepare upload/readback, exact config publication/activation, Amazon import and staged-review steps with rollback. Verify the proposed version is unused before publication; never replace v3 or an in-flight frozen snapshot.
5. Bind a concrete test child, US recipient, quote, artifact hashes and cost approval before physical submission. Paid transport remains held.

## Current live observations

Read-only n8n inspection on November 15 found W0, W1, W2A, W2B and W3 active. The 36-node W1 now includes native Gelato routing. Single and sibling Gelato workflows are active and terminate at held drafts. Cloudflare reports Gelato draft submission enabled, notifications off, and new-book D2C sales absent/off. Legacy Lulu print workflows are inactive. This initial observation preceded the bounded live CSV test described below.

Newer main already supports explicit Inner Voice selection/version pinning in CSV import; its legacy default is intentional. The earlier finding from the old artwork checkout is superseded. The stale local Supabase binding was resolved using the existing project server key in Jeff's connected dashboard. R2 was resolved using an already-present working alternate local binding. Original environment files and service credentials were not changed or rotated. Read-only metadata confirmed v3 active and v4 unused before publication. All 68 new immutable background files were uploaded and all111 configured asset hashes read back successfully. The canonical publisher activated v4 (`d242ae8ef7c22bf5846e84de03d6a7224f14d2bd37b3ed0ef5a2fec9f25eeb8f`); independent runtime readback confirms v4 active and v3 preserved/inactive.

Local files and receipts: `output/inner-voice-print-test-prep-20261115/`. Full live end-to-end generation, paid production, shipment and physical inspection remain unproved.

## Verified preparation and live CSV test

- Candidate checks: all73 logical background bindings preserve approved RGB pixels; 16 W0/W3 format/guide cases retain32 pages, version4 and baked shadows. Actual current CSV selector refuses draft/checksum drift.
- Rendering:150 selected normal/boundary/guide renders passed with no canvas overflow flags; both editions' normal32 pages, four cover cases, guide matrix and35-page standard managed PDF were visually inspected. Very long-name fitting remains the existing deployed behavior, including small boundary-name cover text.
- Canonical assembler: both35-page local PDFs preserve all66 source image pixels under independent PDF.js decoding. Both remain under the stored-file size budget. These are retained-pose local proofs, not the live CSV order.
- Offline real-route CSV test: the actual upload handler and ZIP parser matched10 customization fields, recipient, version pin and message guard; one local W0 adapter call, zero external requests. Full message-safety tests also passed.
- ZIP staged in the private orders bucket with immutable SHA key, byte readback, parser verification and24-hour signed GET. Recipient data stays out of the ZIP. The recipient-bearing ready CSV and signed URLs are owner-only, excluded from Git.
- Live CSV: one HTTP multipart upload through canonical Next API running on localhost, against live Supabase and active hosted W0. Created exactly one order, `TEST-PRINT-20261115-A` (row1176), zero errors, one W0 trigger and no skipped W0. W0 froze `book-finding-our-inner-voice@4 / amazon`; message marker remains true. Render `testMode` was not set. This is not proof of the separate hosted-admin frontend/auth path; both old local backend tokens are stale and its Cloudflare login is pending.
- Marked tests remain excluded from cron. An exact-row/CAS bounded dispatch through existing W1 (shared capacity checked) started W2A. No direct workflow bypass or global cron change was used. All13 W2A poses completed and were visually reviewed, followed by all13 background-removed W2B cutouts. Both review stages were approved using the canonical approval route. The same exact-row/CAS W1 dispatch started W3, which completed all32 pages and the cover without recorded error. The test marker remains true.
- A single quote-only Gelato request for the local proof returned printing $12.18 + USPS Ground Advantage $3.81 USD. Quote receipt is time-bound; taxes/fees/final amount are unknown. It is not a quote bound to the later live CSV artifact and cannot authorize printing. No provider order was created.

## Remaining gates and limits

1. Live W0/W2A/W2B/W3 generation and visual review are complete. The actual cover and32 interiors preserve approved v4 artwork, baked shadows and fresh character cutouts; dedication, hometown and they/them text were checked. The order stays in postPdf review for user review, with no customer approval, print claim or provider order.
2. The actual order's canonical W4 input and35-page print PDF are built and inspected locally; all33 decoded images match source pixels, and all35 Poppler-rendered pages were visually reviewed. The145,336,706-byte artifact has SHA `c345b2c1be1e3e12fefc6c876ff20a30dab9f17aa8e0b510343706916951b54c`. An immutable private quote copy was uploaded/read back and a fresh quote returned at19:06UTC: $12.18 printing + $3.81 shipping, final taxes/fees unknown. It is not registered as a production print claim. Preserve exact bytes; never substitute the offline managed copy.
3. Gelato recommends PDF/X-4 with GRACoL2006 output intent and3mm photobook bleed ([official requirements](https://support.gelato.com/en/articles/8996349-what-are-the-design-requirements-for-pdf-uploads)). Current W4 emits PDF1.4/untagged DeviceRGB. The offline managed copies add profiles/boxes but are not independently PDF/X-4 certified and do not change W4 behavior. This is a print-finishing limitation requiring resolution or an explicitly reviewed proof decision before calling the automatic print path fully ready.
4. Paid printing remains blocked in source by `ORDINARY_ESTIMATE_INSTALLATION_ENABLED=false`, then runtime/account/approver/exact-permit gates. W4 being active is insufficient. No charge, broad print activation, provider create, customer message or shipment test is authorized by this preparation record. Historical provider-draft safety incidents remain relevant; do not create an order just to test a hold without the specific reviewed decision.
5. Hosted UI/auth, SP-API marketplace intake, automatic scheduler, sibling edition, paid fulfillment and physical quality remain separate unproved coverage.

Validation: focused candidate/CSV/message/flow/PDF checks and lint pass. Repository-wide TypeScript still fails in existing repository files; no new preparation-script diagnostics were reported. A focused streaming-digest application fix is prepared locally, as detailed below; it has not been deployed. No commit or push occurred. Next dev generated `back-end/AGENTS.md`; it is retained and excluded from the intended task source scope.

Rollback: use the canonical existing publisher to reactivate bundled v3 only after checking its preserved checksum `8429257be1e2b634dcc33c2a7bbc871d90ca43a4be54bdff4cdb40ba1b2af89e`. Preserve v4, immutable assets and in-flight frozen snapshots. A selector rollback does not retarget the test order already frozen to v4. Do not delete publication rows or assets.

## Large-artifact review fix, November15

Actual print PDFs are about146MB, exceeding the ordinary release path’s old64MB buffered reader. The prepared change replaces that path with a shared SHA-256 stream reader, preserving256MB per-file and512MB operation budgets,30-second/caller cancellation, host/redirect validation, exact byte identity and all existing approval/money gates. It does not change rendering, workflow routing, service credentials, schema or paid activation.

A real Worker-engine regression drives a146,665,305-byte synthetic stream through service/application review and final authority without collecting the PDF in memory. Changed-provider, oversized, empty, redirect, cancellation and late-loader cases are rejected. Existing core61, service33 and application11 cases pass, along with stored-file Worker tests and financial observations. Native disposable PostgreSQL17.12 passes24 ownership/recovery groups. The combined persistent journey passes website, Amazon single and sibling cases with actual local assembled PDFs and zero external requests. A real R2 read of the146,665,305-byte proof matched its SHA in17.238seconds, with zero provider calls. That confirms one current read, not a universal latency guarantee.

Full Pages build passes with own exact locked dependencies. Lint has no errors and four existing unused-variable warnings. Repository-wide TypeScript remains failing, including generated Next route export checks; it is not reported as a full typecheck pass. The source-evidence overlay preserves the prior manifest byte-for-byte, renews only changed bindings, adds the two new source files and passes172 source bindings plus1 positive/31 corruption checks. Both independent reviewers checked the fix and source-evidence update. All paid activation flags remain false.

## Handoff after live book review

The complete contact sheet (cover plus32 interiors), individual sheets, actual PDF, pixel verification and quote are in the ignored preparation output. Durable sanitized live-test receipt: `inner-voice-v4-live-test-2026-11-15.json`. The hosted admin login error was an email mismatch: the shipment Gmail address is not on the existing admin allow-list. The existing approved Little Hero Labs admin address has a sign-in-code screen open for Jeff; no access policy was changed. That user handoff remains pending, so hosted UI upload has not been asserted.

The source fix is tested and the full Pages bundle passes, but it remains uncommitted and undeployed in this isolated checkout. It requires a fresh final release-safety gate before any commit/push/deployment. Paid printing remains held. PDF finishing/conformance remains an explicit limitation, alongside automatic scheduler and real shipment/physical inspection coverage. Superseded by Jeff’s clarified operator sequence below: do not reupload the CSV. After sign-in, Jeff will operate the remaining review controls on the preserved order; reviewed routing, deployment and specific print approval remain separate gates.

## Clarified acceptance scope, November15

Jeff clarified that the intended end-to-end acceptance is him advancing the standard hosted-admin review and print controls. The agent-advanced preparation is not that acceptance proof. [Operator sequence and current blockers](inner-voice-admin-print-test-2026-11-15.md) records the preserved assembly-review starting point, login handoff, marked-test routing exclusion, missing paid-release UI/runtime bindings and unchanged money gates. Do not follow the earlier proposed idempotent CSV reupload; the existing order must remain intact and Jeff will operate the remaining controls himself.
