# Gelato queue and full-book proof

October 23, 2026. Continued from main `df3b7d08fe228ecffe988b371e2b2ad548a2f607`. This package adds local proof tools and evidence. No production workflow, stored book config, sales control, schema, order, provider setting or customer message changed.

## Queue extension

The existing ten-node patch prepares cleanly against the current 28-node W1 graph. The private 38-node candidate preserves all existing nodes. The two new backend credential references use the previously verified managed credential. No candidate was installed. Gelato W4/W4.1 remain inactive.

Actual local n8n 1.110.1 passed 16 scenarios: empty/OFF input, Lulu single/sibling classification and shipping validation, successful single/sibling claims, conflicts, malformed responses, HTTP failure/timeout, failed-dispatch fencing, mixed successful/failed single and sibling claims, and failed/unconfirmed fences. Eleven transport-denial checks passed. Each execution checks its exit, completion/error state, entry trace and terminal node. The child process has a clean environment, explicit private `N8N_USER_FOLDER` and isolated cwd. Its SQLite location was verified. JavaScript transport guards restrict external access; this native test does not claim an OS sandbox.

The rehearsal replaces HTTP origins and credentials with loopback/synthetic bindings. It runs the exact new branch and existing extraction, routing, preparation, shipping IF, and legacy classifier with only URL/key substitutions. It stops before legacy claims/dispatch. The backend queue uses synthetic dependencies. No hosted SQL claim, W4 execution or provider request occurred.

Installation stays deferred. The bridge adds a backend dependency to Lulu traffic; lookup or authentication failures can hold those orders. Existing valid Gelato claims can still reach quote endpoints despite OFF draft controls. The incident hold therefore still excludes provider writes and native print-workflow activation.

A read-only `pg_catalog` query found all five submission tables and eight required queue/submission functions with expected signatures. Presence does not prove body parity or successful invocation. No migration was needed or applied.

## Book proof

The committed v2 config and the newer saved book layout differ. The newer renderer/config already exists in the mixed `book-lettering-release` worktree. That worktree was preserved. The local proof freezes its source and inputs instead of adding another renderer or overwriting a stored draft.

The approved 56-file guide upload map supplies pages 9, 10, 12, 13 and 24 plus reveal/flying guide layers. Shared backgrounds use the editor's selected files, including the corrected page 11 and page 19 artwork. Exact local overrides preserve immutable remote keys. Lettering revision 1240 and its existing browser/long-name adjustments feed the renderer. Child pose inputs remain retained v1 reference fixtures, shown as gray figures. No current W2 pose was generated. The exporter creates W0, supplies a synthetic 2B manifest, then runs actual W3 assembly and preview planning. This is not the earlier HTTP/SQL intake proof joined to a fresh W2 run.

Headless Chrome rendered all eight guides in standard and Amazon formats: 512 interior pages. A 30-character wide-name test rendered cat and unicorn in both formats: another 128 pages. All 640 final PNGs decode as 2625-square RGB. Disk exhaustion caused two short-run and three long-run failures. Only this run's retry outputs were removed; identical generated files were hard-linked to recover space. The affected short-run channel/group and three long-run pages were rerendered. Reconciled manifests preserve the first-attempt failure counts and bind all final page hashes.

An OS-network-denied replay of the frozen exporter reproduced all 514 interior/cover HTML files byte-for-byte after the recorded local asset mapping. The completed source ledger binds renderer files, config, fonts, images and HTML. The dependency installation remains an external local symlink; later snapshots also freeze the dependency lock. Historical source ledgers remain unchanged.

The strict W3/W4 probe verifies source, HTML, render-record and per-page hashes, fully decodes all 64 cat rasters, builds actual W3 manifests, and calls actual W4 input construction. Both draft books stay `testOnly:true` and `readyForBook:false`; W4 rejects them. Wrong order, wrong format and reordered labels fail; a missing page remains unready. A deliberately truncated PNG fails even with its ledger hash updated. These checks prove draft refusal, not positive print readiness.

The existing canonical PDF builder produced two review files. Each contains one cover spread, blank endpaper, 32 interiors, and blank endpaper: 35 PDF pages. Its independent decoder checked all 70 pages, full RGB pixel identity, page order and geometry. The cover visibly says `TEMPORARY COVER / LAYOUT PROOF` and `NOT FOR PRINT OR ORDER SUBMISSION`. The PDF checker constructs explicit local W4 fixture inputs. It does not bypass the production draft refusal or prove a production-ready W3-to-W4 handoff.

Review copies: `/Users/jeff/Projects/little-hero-books/output/cover-independent-proof-2026-10-23`.

## Visual review and limits

Inspected the complete 32-page cat layout, both channel contact sheets, all eight guides across the seven guide-specific pages, the temporary cover, and full-size long-name risk pages 14 and 22. Text/figure separation and the separate guide layers remain intact in these fixture renders. The 512-page lettering audit found no clipping or orphan flags. Its 32 collision flags concern rotated text bounds on pages 14 and 22; full-size inspection found separate visible glyphs. The 128-page long-name audit found no page clipping. Four flags identify the deliberately isolated long name on page 10; eight collision flags cover the same rotated bounds. That long-name break remains a typography review item before publication. This review does not approve final copy, final characters, cover art or physical print quality.

## Checks and next steps

The 44 native-queue checks, workflow-copy checks and canonical PDF suite pass. Full TypeScript checking still reports 386 diagnostics in existing files; neither new TypeScript script has a diagnostic. Independent reviews found and fixed source-copy races, insufficient transport guards, missing execution-state assertions, incomplete HTML provenance and insufficient PNG decoding. Final reports pin the corrected source and actual results. The workflow-export scanner found no changed workflow exports.

Next: integrate the preserved newer renderer/art/lettering into a reviewed release without replacing an immutable config version; verify uploaded shared assets against that exact snapshot; settle the Lulu availability change before W1 installation; then join isolated intake/SQL evidence to fresh W2 output and the rendered-book path. The final cover and page copy remain open. Inner Voice Amazon product routing still needs its SKU or ASIN. Gelato's incident explanation and a reliable provider test barrier remain prerequisites for any provider write. Sales and print submission stay closed.

Project alignment: reuse the existing queue patch, configured renderer and PDF assembler. Fix the committed/newer-layout divergence in the next integration phase. No broad refactor or parallel renderer was added.

Evidence: [summary](gelato-queue-full-book-proof-evidence-2026-10-23/summary.json), [native runtime](gelato-queue-full-book-proof-evidence-2026-10-23/native-queue-runtime.json), [draft boundary](gelato-queue-full-book-proof-evidence-2026-10-23/w3-w4-draft-boundary.json), [PDF checks](gelato-queue-full-book-proof-evidence-2026-10-23/pdf-receipts.json), and [independent review](gelato-queue-full-book-proof-evidence-2026-10-23/independent-review.json).
