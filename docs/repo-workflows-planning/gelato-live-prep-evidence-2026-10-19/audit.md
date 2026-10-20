# Read-only Gelato workflow audit and frozen dummy books

Prepared October 19, 2026. This phase read workflow definitions and control metadata, generated local dummy PDFs, and prepared a run sheet. It did not run a hosted workflow, inspect executions/orders, call Gelato, upload artifacts, create claims/windows/registrations, change credentials, deploy, fund, print or send messages. The six pending orders were excluded from every live selector and operation. No claim is made about their current contents because they were not read.

## Source and serving baseline

A fresh fetch confirmed main `a1a6a734640191327980666cc353592013b7db01` (PR34). The working branch's `38fe286231e3ff586e1ea330554d2e9984bcdfa2` has the identical source tree. PR34 adds tests/evidence; it is not deployed. Cloudflare's fresh metadata identifies backend source `fb0d31cf92ca2d933b875abd7b9f12998c1c01e0` (PR33), canonical deployment `bb101484-ac2b-48eb-af6e-1073ac1788d3`; frontend remains `5bccf890da26b0c1c9b752d18229d15608e55d4b`.

At 22:35:32 UTC, all six project settings and canonical-serving bindings were false or absent with false defaults. Native Git deployments were held on both projects. At 22:38:26 UTC, two exact database gate GETs confirmed normal Gelato dispatch and ordinary release OFF. Final readback at 22:44:00–22:44:02 UTC again confirmed all six controls and both gates OFF, identical serving deployments and native Git holds. These receipts establish those observation times, not a perpetual state. No control window was opened, so no restoration write was necessary.

## Installed workflow findings

The audit used 29 GETs for 21 distinct known LHL workflow definitions. Published/current definitions agreed for the 9 active workflows in the original 13-workflow graph. Inactive subworkflows are not automatically unusable: n8n can invoke some as subworkflows. No execution proof or full creative-generation readiness is inferred from activity flags.

| Workflow | ID | State | Published version, or current version if inactive |
|---|---|---|---|
| REPO - w0 - Order Intake & Validation | `9E0oVs46bMoiyRIP` | Active | `6cb2afbe-5d68-4514-8279-9e61e2c22ddb` |
| REPO - w3-Book-Assembly | `D4rQ0zJG8JlKhZqq` | Active | `2647e2af-c0f9-4299-a405-7633174a512e` |
| REPO - w1.1 - Queue Manager and Router | `TDwc85g03FqPf9D6` | Active | `3b9ba6c9-7b6c-42fb-82f7-c90b81369c0c` |
| REPO - w4.1-Sibling-Aggregation | `boWA0mB20qYK2g4x` | Active | `3e4b6970-0a28-48d3-a1d6-4a2b365be54b` |
| REPO - w4-PRODUCTION-Print_Fulfillment | `m4qIN9PCgifUcYih` | Active | `1f2e0701-be4b-4350-89b8-73f2bb59f6f6` |
| W4 Gelato Print Fulfillment | `8ZqgZ7ksY0Fj8Acx` | Inactive | `cfc4ecfc-c059-4d9e-87aa-49ac539b3683` |
| W4.1 Gelato Sibling Aggregation | `d7wi1rS0CxGVdRVb` | Inactive | `5592f6a2-2a2b-4852-96cf-f0109c4f8820` |

1. **The reviewed native queue patch is not installed.** Live W1 connects `Prep Workflow 4 Orders → Classify W4 Orders → Validate Shipping for w4`; it has no `Prepare Native Print Queue`, `Claim Native Print Queue` or `Claim and Route Gelato Groups` node. Its classifier differs from the newer repository classifier. The two literal W1 webhook destinations match the active legacy W4/W4.1 workflows, which contain Lulu submission nodes and no `Create Held Gelato Draft` node. This is a routing readiness gap, not evidence any provider order was sent.
2. **All eight known Gelato definitions are inactive.** This includes the two original Gelato targets and six historic test copies. Their 4 nonempty check/prepare code nodes match the corresponding reviewed native workflow source. Managed HTTP header-auth references are present for assembly, quote and draft creation. No old copy or consumed claim was activated/reused.
3. **Authentication readiness is unproven.** W0's managed backend credential reference and the old Gelato native definitions' reference have different digests. References can be different and still valid; this audit did not retrieve their values or call a backend with them. Bind fresh diagnostic copies to a current verified managed credential before a later window. W3 uses backend-owned preview/assembly endpoints; static route evidence does not prove a successful W3 execution.
4. **Positive ordinary queue proof is incompatible with the current shared OFF setting.** `gelato-native-queue.ts` calls `ordinaryPrintRoutingBlocker`, which returns `gelato_draft_submission_disabled` before claim when draft submission is OFF. The engineering draft exception in `gelato-submission-runtime.ts` applies to the separate draft boundary; it does not bypass ordinary queue admission. Do not present direct-claim success as proof of ordinary W1 scheduling.
5. **Positive recurring polling is also gated.** `/api/cron/gelato-status` authenticates `CRON_SECRET`, then returns disabled before importing/querying the scheduler while `GELATO_SCHEDULED_STATUS_ENABLED` is OFF. The scheduler also requires a dedicated provider status key and opt-in registrations. A new reviewed isolated test boundary/deployment is needed before positive timer proof while normal controls remain OFF. No cron credential was retrieved/installed or scheduler invoked here.

The next engineering change should create/review an exact-cohort test boundary for queue and status automation (or an equivalently isolated test deployment). It must never fall back to an ordinary selector or enroll historic orders. Installing the W1 patch alone will not resolve the OFF admission boundary. This audit does not authorize workflow installation or deployment.

## Frozen local PDFs

All files were newly assembled using the existing production PDF builder with local PNG loaders/object storage and fetch disabled. No live credential was loaded by the assembler. Four visible child/edition identities, front/back labels, run stamp and 32 numbered interiors distinguish the fixtures. These are geometry/identity fixtures, not creative approval or provider prepress proof.

| Role | Edition | Local PDF filename | Full SHA-256 |
|---|---|---|---|
| WEB-A | standard | WEB-A-standard-dummy.pdf | `f6ec01664f7a1f46efea6904ff168b9be8c2e5328c806cd43d8810b8fb32b5cf` |
| AMZ-A | amazon | AMZ-A-amazon-dummy.pdf | `2269a3566228d45d4867e9605fd38895438ff9c30cea056c86591a995bdef5ab` |
| SIB-A | amazon | SIB-A-amazon-dummy.pdf | `3b140bd0718583b00b90f0b1b37b942cdea0c78380304e7616606e1720c6cf7f` |
| SIB-B | amazon | SIB-B-amazon-dummy.pdf | `f0e5d766be11c999ce2da4d37d95f52a58c28085ab42dda8146c2c4e7a282398` |

Each file has 35 upload pages: cover spread (PDF 1), blank front endpaper (2), ordered p00–p31 interiors (3–34), blank back endpaper (35). Physical inner count and API pageCount remain 32. Trim is 200 × 200 mm; interior canvas including bleed is 206 × 206 mm, cover canvas is the configured 409.03 × 206 mm. MediaBoxes are 1159.455118 × 583.937008 points for the cover, 583.937008 square for other pages. Quantity is one per item.

Private originals, rasters, full source bindings, inspection renders and preparation helpers are under `.gelato-testing/live-test-prep-20261019/` in the original checkout; PDFs are in `output/pdf/`. Files/hashes are frozen locally, not uploaded or bound to live submissions. Future W0/W3 timestamps/claims may change canonical artifact keys. Reconcile freshly assembled bytes against these frozen PDF hashes and record new immutable live keys, grants and submission bindings; do not reuse the preparer's synthetic input as a real W0 or W3 execution.

See [the live-test run sheet](gelato-live-test-run-sheet-2026-10-19.md) and [redacted evidence](gelato-live-prep-evidence-2026-10-19/README.md). Current metadata checks and local PDF inspection do not complete Jeff's engineering/physical fulfillment plan.
