# New-book Amazon workflow test plan

Status: preparation only. Automations paused; all changes uncommitted. No external test has run under this plan. [Scope reset and John's published-work comparison](new-book-e2e-scope-reset-2026-10-29.md) define the boundary.

Current direction: Jeff confirmed that workflows are intended to be book-agnostic, driven by each book's configuration. Confirm that design before choosing implementation changes. John's reply supplies baseline and workflow references; it does not assign work to his agent or require waiting for that agent. Investigate source directly, inspect hosted bindings when authorized, and discuss product or architecture choices with Jeff.

## Agreed steps and current status

1. **Verify configuration-driven workflows.** Trace book selection and configuration through upload, W0, queue/router, Gemini base/poses, Bria, W3 and the PDF-generation segment. Produce the evidence and decision described below before assuming a new-book-specific implementation.
2. **Reconcile the book changes with current main.** Preserve John's revision/reapproval and print safeguards. The latest comparison verified PR #65 merged at `ced6e3b15c28d0efa1640ae37ddcb8f796d352d9`; local HEAD remained `f7efbb3308df1111568890ed6de9ae5c7c38fe74`. Refresh the comparison before integration. Do not overwrite the mixed worktree or import unrelated print/payment changes as pilot work.
3. **Prepare the synthetic Amazon input.** Build CSV/TXT and matching customization ZIP/JSON using the existing parser, approved appearances and fresh test identities. Validate locally through the real upload/parser/W0 path with external effects replaced by explicit test boundaries.
4. **Complete only agreed book-pipeline gaps.** After the architecture decision, implement necessary book selection and flexible text/layout support through the chosen configuration contract. Preserve first-book behavior and shared safeguards. This step is pending investigation, not permission for a workflow redesign.
5. **Verify the selected service chain and stop controls.** Identify actual hosted versions and configuration/template bindings. Confirm fresh Gemini, Bria and PDFMonkey calls can finish while messages, payment and print orders/drafts remain blocked. Local exports alone cannot establish this.
6. **Run the bounded pilot, then expand.** After the separate external-run authorization below, submit one order through the normal upload endpoint and inspect every resulting page. Then run the other appearance/name cases and later repeat affected cases with final artwork.

Step 1 source audit is complete: [book-agnostic findings and decisions](book-agnostic-workflow-audit-2026-10-29.md). The shared repo-centric core uses config, but intake, W4 routing, flow publication and PDF defaults prevent a complete book-agnostic claim. Hosted behavior remains unverified. Steps 2 through 6 remain pending. Existing local PDFs provide layout evidence, not a completed hosted pilot. Keep progress and evidence against these steps; do not revive the superseded checkout/heartbeat plan.

Jeff subsequently requested a plan for complete config-driven repo-centric reuse. Use the [reviewed shared-workflow implementation plan](book-agnostic-repo-centric-implementation-plan-2026-10-29.md) for that preparation. This pilot plan still defines the later actual-provider acceptance and external-run authorization boundary. Neither document resumes automation or authorizes execution by itself.

## First check: are workflows book-agnostic?

For each stage, record the source file/node, configuration input, effective value sent downstream and any fallback or override. Check book/config version and Amazon edition, title, page count/order, required poses and cover pose, prompts/style references, guides, asset paths, placements/orientation, dynamic text/typography and PDFMonkey templates/geometry. Include subworkflow inputs and cached/resume paths so a selected book cannot silently revert to the first book.

Classify apparent hardcoding by its effect. A book name in an example, an explicit legacy default or a configurable template is not automatically a defect. A constant that overrides the selected configuration or prevents a supported book from rendering is a demonstrated gap. Separate backend dispatch gaps from n8n orchestration and shared renderer capability gaps. New text-layout primitives may require a shared renderer change even when workflow orchestration is book-agnostic.

Acceptance: trace the first book and Inner Voice through the same workflow logic with their respective frozen configs. Show that intended differences in required poses, page plans, references, copy and templates come from configuration and that first-book behavior remains compatible. Use local producer-to-consumer tests to establish source behavior, then verify actual hosted bindings separately before claiming production support. Reject unsupported configuration explicitly rather than silently using first-book values. A successful local render alone does not establish this contract.

If a gap is found, present Jeff with its exact location, effect on the pilot, smallest fix, first-book compatibility check and any architecture choice. Compare the applicable options: complete the existing configuration contract, add a reusable renderer capability selected by configuration, or use a disclosed temporary book-specific path. Do not assume a fork or adapter is the answer. Obtain Jeff's decision before taking an alternative architecture path. Continue independent fixture and source preparation while that decision is pending.

## Outcome and test entry

Submit one labeled synthetic order through the same Amazon upload handler used by the admin uploader. Follow its actual n8n execution through Gemini character generation, Bria background removal and PDFMonkey output. Inspect the resulting review PDFs and stop before customer messages, printing, payment or fulfillment drafts. This proves the book-production chain from upload. It does not prove Amazon purchase, payment collection or physical printing.

Preferred entry: admin CSV/TXT upload, using synthetic Amazon-format rows and a matching customization ZIP. The UI posts multipart `file` to `/api/admin/amazon-orders/upload-csv`. An authenticated file POST to that same endpoint is an acceptable simulation because it retains the same parser, order creation and W0 dispatch. Use approved test IDs and synthetic contact/shipping fields, never a real customer's data or order ID. Preserve required normal review steps.

Do not substitute `/api/amazon/orders`, a direct W0 webhook, hand-created database rows or prebuilt manifests and call that an equivalent upload. They skip or change upload behavior. `/api/admin/test-amazon-upload` tests Amazon messaging uploads, not order intake, and is excluded.

## Resolve these book-test details first

1. Verify the intended test environment and actual active n8n workflow IDs/versions. John's reply identifies main and retained export IDs, but reports deployment separately. Repo-centric exports describe a migration track; legacy SIBLING exports cannot establish what is deployed. Preserve PR #64's review invalidation and the four shared-file changes before using a combined candidate.
2. Confirm new-book selection through Amazon upload. Current source hardcodes `AMAZON_CSV_BOOK_ID = 'book-mvp-simple-adventure'` and format `amazon` in `back-end/src/app/api/admin/amazon-orders/upload-csv/route.ts`, including its W0 payload. John's reply confirms no newer selector was found. `sibling-order-helpers.ts` also supplies first-book title/page defaults. Trace their actual downstream effect, then agree on the smallest configuration-driven selection change while keeping existing first-book uploads unchanged. Any authoritative SKU/ASIN mapping is a product decision to settle with Jeff. Do not silently route a new-book test to the first book.
3. Confirm selected workflow can consume the new book's configuration, poses, assets and flexible text. Local `w3-manifest-publish.ts` refuses `lhb.book-render@v2` with `Flow publication is not yet available`. Local W4 input also refuses unverified flow fit. The retained book configuration file `v2.json` uses rendering schema `lhb.book-render@v1`; configuration version and rendering schema are separate. Establish which source and schema the selected chain uses, then resolve missing shared rendering support under the architecture decision above. Preserve print guards. Removing a refusal alone does not prove support.
4. Identify existing controls that allow actual Gemini, Bria, storage and PDFMonkey calls while preventing print submission and customer/Amazon messages, including asynchronous queue, reminder and fulfillment jobs. A generic test mode may select mock providers. Check the executed branch, not the flag's name. In the SIBLING exports, W3 generates PDFMonkey page/cover PNG previews; actual cover/interior PDF generation is inside W4, alongside print submission. If that is the selected chain, include its PDF-generation segment with a verified stop before any print order or draft. W3 previews alone do not satisfy the PDF requirement. Confirm whether a PDF-only control already exists with John; if absent, prepare the smallest bounded change before execution. Keep all print guards.

Jeff sent [the coordination prompt](john-new-book-e2e-coordination-prompt-2026-10-29.md) and supplied John's reply. Treat the prompt's draft label as its historical state when written. Its factual questions are now inputs to our investigation, not a dependency on another agent. No checkout recovery, payment redesign, new intake SQL framework or Linux suite is required by this plan.

Do not trigger the whole W4 workflow as a PDF test. The saved SIBLING W4 export defaults to `testMode: false` and contains an enabled production print-submit node. Before execution, identify the exact PDF-only path and prove its stop control covers queued/retried execution too. A local export or guard name cannot establish the hosted behavior.

## Prepare and run

1. Freeze a small test packet: chosen source/workflow/template versions, new-book and Amazon edition IDs, approved assets, expected customizations, unique case IDs, CSV/TXT, customization ZIP/JSON and hashes. Use the actual customization parser. CSV header validation alone is insufficient: valid customization data must download and parse for W0 to run. Confirm fixture hosting and access without exposing credentials. Current artwork can support a disclosed provisional pipeline test; final artwork remains necessary for final visual acceptance.
2. Verify book selection and parsed values locally using that packet. Preserve uploader-generated root, line-item and quantity-expanded child IDs. Record expected child/guide/appearance and supported dynamic text from the editor, including age, pronouns, hometown and dedication where configured. Do not invent missing production values. Use fresh identities and confirm the workflow will generate new outputs rather than take a cached/resume branch.
3. Present the concrete external run packet to Jeff: target, cases, expected provider usage/cost bound, fixture/asset uploads, hosted test records and stop controls. Current instructions prohibit these external actions. Obtain explicit authorization for that bounded run; keep print orders, fulfillment drafts, customer messages and payment excluded. Do not deploy or upload as part of preparation.
4. Run one pilot through the exact upload endpoint and selected normal workflow. Capture created/matched IDs plus `w0_triggered` and `w0_skipped`. A successful HTTP response with W0 skipped is not a passing book test. Follow normal human review gates where required, recording their actions. Stop and fix the first failing book stage before buying more generation runs.
5. After pilot passes, run the remaining appearance/name cases below. Include distinct sibling line items and quantity expansion if those are part of the approved Amazon test. Keep per-child evidence separate. End each case at the review PDFs. Inspect every page and cover against frozen editor choices, then repeat final-artwork cases when finished illustrations replace provisional ones.

## Proposed cases

| Case | Child and guide | Main check |
| --- | --- | --- |
| Pilot | Alexandra, deep skin, black afro, purple shirt, Cat | Complete chain; editor-selected cover and flying scene |
| Second | James, light skin, red curls, green shirt, Owl | Distinct appearance and guide, no cross-child reuse |
| Short name | A, medium-dark skin, dark pigtails, pink dress, Dog | Short-name sentence spacing and supported outfit |
| Long name | Alexandria Isabella Montgomery, tan skin, blonde buzz cut, orange shirt, Unicorn | Wrapping, font size, line spacing and complete names |

Confirm exact supported labels and editor values before freezing. Cover must show hands over heart. Flying scene must match the selected orientation for child and guide, and read as one consistently formatted sentence across names. Review all other configured text, scene placements and guide appearances, not only these two pages.

## Evidence and pass criteria

| Stage | Required evidence |
| --- | --- |
| Upload and W0 | Input hashes, actual parsed selections, root/per-child IDs, selected new-book configuration and W0 execution ID |
| Queue and W2A | Linked n8n executions; actual Gemini generation calls and returned base/required-pose outputs; provider/model/request identifiers where available |
| W2B | Actual Bria submission/completion and resulting transparent images used downstream; inspect edges and missing body parts |
| W3 and PDF-generation segment | Actual PDFMonkey document IDs, completion and downloaded PNG/PDF outputs; identify which stage generated each artifact and show selected assets and dynamic text traveled into its rendering inputs. Include W4's PDF-only segment if required by the selected chain, with submission blocked. |
| Review | Correct cover, page count/order, each child's appearance/guide, all supported custom text, font/emphasis/spacing, no clipping or accidental fallback; separate headless visual review |
| Stop | No print order/draft, payment call or customer/Amazon message; verify relevant job/event records and preserved stop controls |

Store fresh bulk evidence under the UUID-validated external project root. Redact secrets and personal data. Link each stage using the same case and per-child identity. Disclose any skipped provider, cache reuse, mock, manual substitution or local assembly. Such a case cannot establish the requested full service chain. The four existing provisional local books remain useful layout references; they did not run hosted n8n, Gemini, Bria or PDFMonkey as one production chain.

Pass means one order entered through the normal upload handler, selected the new book, traversed all required services, produced correct review output and stopped at the agreed boundary. Then expand the matrix. A first-book result, hand-built final PDF or disconnected collection of service calls fails this acceptance check.
