# Controlled release route map, 2026-10-21

This record covers read-only checks. It does not approve a production cutover.

Cloudflare Pages project `little-hero-labs-admin` reports production branch `main`. Its latest successful deployment at the check was `b5394e4d-5bf9-48c7-9878-8249769f6bd9`, from commit `5c900710179ad3604b27cc6bfc853aa720dcf17b` at `2026-10-21T20:04:25.485614Z`. Production has `N8N_W0_WEBHOOK_URL` as a secret. The API does not return its value. `N8N_ROUTER_WEBHOOK_URL` and `D2C_INNER_VOICE_V2_SALES_ENABLED` were absent. `GELATO_DRAFT_SUBMISSION_ENABLED` was `false`. The preview environment had no W0 or router setting and kept Gelato draft submission off.

The deployed backend code uses these fallbacks when its environment lacks an override:

| Producer | Setting | Code fallback |
| --- | --- | --- |
| Stripe webhook, sibling helper, admin W0 trigger and resync, Amazon cron | `N8N_W0_WEBHOOK_URL` | `/webhook/order-intake-sibtest` |
| Cron router | `N8N_ROUTER_WEBHOOK_URL` | `/webhook/w1-1-router-sibtest` |
| Amazon API intake and sibling creation scripts | `N8N_W0_WEBHOOK_URL` | No fallback |
| Manual W0 scripts | Script argument or environment | `/webhook/order-intake` |

The production W0 setting hides the effective destination, so the code fallback does not prove where orders go. The router setting was absent at the check, so code would use its fallback if no other runtime binding supplies it. The active workflow at each path remains unverified. Two distinct local n8n API keys returned HTTP 401. The database connection attempt timed out. Local credentials do not establish production routing.

Before any live workflow, backend, or database change, read the effective W0 secret through an authorized route, inspect active n8n ownership and revisions for the W0 and W1 webhook paths, and map W1 through W2A, W2B, W3 and W4. Capture queue and in-flight counts, credential binding, and rollback revisions without customer data. Keep the cron paused until accepted executions and claimed rows reconcile. If any route or active graph stays unknown, keep the release local.

## October 22 API readback

The replacement n8n key returned HTTP 200. The ignored local `N8N_API_KEY` now uses that replacement; no key appears in this record. The [sanitized workflow observation](controlled-pipeline-active-observation-2026-10-22.json) records active revisions and definition hashes for the book pipeline and its direct subworkflows.

`order-intake-repo` belongs to active W0 `9E0oVs46bMoiyRIP`. The workflow with `order-intake-sibtest`, `Of0D9GEpoOYvYMTX`, is inactive. The router remains active at `w1-1-router-sibtest` and targets active `2a-start-repo`, `bg-removal-repo` and `book-assembly-repo`. Its print exits still target the legacy W4 and W4.1 workflows. Both separate Gelato W4 workflows remain inactive. Subworkflows invoked through Execute Workflow need not have a production webhook active; their inactive status alone does not establish a failure.

Cloudflare reports successful production deployment `0ea20157-14b9-4a23-a4e8-f69cafc63198`, source `d928e76cb5f1ee7f212579371661dbfa717e4c0b`. The W0 setting is still a hidden secret. The router setting and Inner Voice sales flag remain absent, and Gelato draft submission remains `false`. The production W0 target therefore remains unproved despite the complete n8n route inventory. No webhook was triggered to infer it.

Supabase access works through the J+J Personal connector. The activation RPC is absent, and no database function body references it. That does not inventory external callers. Inner Voice v1 and v2 remain inactive drafts. Queue aggregation found no ready or pending-W0 rows and three processing Gelato rows, all with `TEST-GELATO-` order names. No order state changed.

Jeff requires reuse of the W0 workflow used for the first Inner Voice book. The March 24 Book 1 handoff records successful repo-centric W0 proof, but also identifies the sibling workflow set as the normal production master. The repo W0 was created March 18; sibling W0 was created February 24. Neither W0 has retained n8n executions, and the database execution log has no W0 or intake entries. These records do not establish which entrypoint handled the first customer book. Preserve the existing production route until that identity is confirmed. Do not reset the Cloudflare secret merely because the repo workflow is active. The prepared repo-source candidates remain local proposals.

## October 22 target selection and credential check

Jeff's screenshot identifies `REPO - w0 - Order Intake & Validation` as the workflow to reuse. Target is W0 `9E0oVs46bMoiyRIP`, path `/webhook/order-intake-repo`. This supersedes the unresolved target choice above. Cloudflare's effective destination still needs separate verification before cutover.

Fresh API reads found W0, W1 and W2A definitions and active revisions unchanged from the private snapshots. Existing managed backend header credential ID is shared across those workflows. Its encrypted value was not read or tested. W1's separate inline signed-URL token differs from the root `.env` backend token. A read-only request using that existing inline token returned HTTP 200 and a signed URL for a synthetic, nonexistent object key. The URL was not followed. This proves that token currently authenticates; it does not prove the managed credential contains the same value. Preserve both until the managed binding is verified. No workflow execution or state mutation occurred.

## Cloudflare browser inspection, October 22

Jeff authorized inspection through his connected Cloudflare browser. The production settings page for `little-hero-labs-admin` shows `N8N_W0_WEBHOOK_URL` as Secret with `Value encrypted`. Clicking that value opens an empty replacement field with the message `This value will no longer be viewable once saved`. Blurring it restores `Value encrypted`. No text was entered and no setting was saved. Asking Jeff to read this same field cannot close the route gap.

The deployments page now identifies canonical production deployment `5f3d1840-9e64-4a77-94fd-263852e7c191`, source `bb2ab85d318c7bde9a322f45b6fcae2a3ba2a9b9`, superseding the earlier `d928e76` deployment. Automatic deployments remain paused. The new source adds an authenticated runtime proof for Gelato account keys, but it does not report the W0 destination. That proof cannot establish W0 routing. No diagnostic or order endpoint was invoked during this browser inspection.

Remaining route evidence needs a bounded authenticated runtime check, or an explicit, reviewed setting change to the selected W0 during controlled cutover with tested recovery. Neither action occurred. Refresh the candidate against `bb2ab85d` and review the exact diff before any release; prior base-dependent build and receipt evidence cannot establish readiness for this newer deployment.

The local W0 build endpoint now has a candidate authenticated GET that classifies the shared setting without returning its value. It rejects query parameters, disables caching and does not call order, storage, config or n8n services. Local handler tests cover exact selected/sibling/legacy destinations, absent and malformed settings, other hosts, user information, query strings, fragments, HTTP and trailing-slash differences. This route is undeployed. Its result would establish the request-time process setting only; producer captures and historical provenance remain separate checks.

## Current readback after diagnostic release

Production deployment `6aae0ce8-03d2-429f-abe9-b7b68d683dfb`, source `12087193c766a2fb41eeeca78136ee23915ea736`, returns `sibling-w0` through the authenticated no-order diagnostic. The setting selects `/webhook/order-intake-sibtest`, owned by inactive W0 `Of0D9GEpoOYvYMTX`. Jeff selected active W0 `9E0oVs46bMoiyRIP`, path `/webhook/order-intake-repo`. Correct this binding only after credential and selected-target patch checks. Then redeploy and require live `selected-w0` readback. This does not establish historical routing or all producer module-captured state.

The activation RPC is now installed and its permissions verified. Book config rows are unchanged. This removes the migration-install blocker without enabling sales or publishing config versions. Managed workflow credential proof and coordinated graph/backend release remain open.
