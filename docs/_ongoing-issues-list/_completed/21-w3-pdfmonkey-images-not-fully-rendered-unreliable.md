# Issue: W3 – Images sent to PDF Monkey not fully rendered before capture (unreliable)

**Status:** 🔴 Open  
**Priority:** High  
**Created:** 2026-02-05  
**Last Updated:** 2026-02-05

## Description

Images sent to PDF Monkey in W3 are **not fully rendering** before PDF Monkey makes the page PNG. The **current workflow has no Inline Page Assets node** and had been **working fine for over a week** with no issues — then **suddenly** regressed (e.g. as of this morning). Priority: **what changed?** Secondary: consider inline image assets (base64) for long-term reliability so this doesn’t resurface.

## Impact

- Page preview PNGs in R2 can be half-rendered (blank backgrounds, missing images, cut-off content)
- QA and customers see incorrect previews; risk of approving/shipping wrong art
- Repeated firefighting when the same fix “works then stops”

## Root cause (why it’s unreliable)

**Current W3 flow (w3-NB3---AMAZON-PNG_Assembly.json):**

- **Generate Page Preview Images** builds `pageHtml` with **external image URLs** (e.g. `backendUrl/api/assets/{r2Key}`), often with cache-bust query params.
- **Split in Batches (PNG Pages)** → **Generate Page Image with PDFMonkey** sends that HTML to PDF Monkey.
- **No “Inline Page Assets” node** in this workflow — so PDF Monkey’s renderer must **fetch each image URL** when it renders the page. It then captures the page to PNG.
- **Race:** If PDF Monkey captures before all image requests complete (network latency, backend/R2 slow, PDF Monkey timeout, or load elsewhere), the PNG is **half-rendered**. Any change in latency (backend load, n8n region, PDF Monkey service, DNS) can make the race show up again.
- Past “fixes” (e.g. cache-bust, small wait/throttle) reduce the chance of the race but **don’t remove it**. So behavior appears fixed until conditions change.

**Inline approach (w3-AMAZON-PNG_Assembly-inline-image-assets.json):**

- An **Inline Page Assets** Code node sits between **Split in Batches** and **Generate Page Image with PDFMonkey**.
- It POSTs `pageHtml` to the backend `POST /api/render/inline-page-assets`, which replaces every `/api/assets/...` URL in the HTML with a **data URL** (`data:image/png;base64,...`) by fetching from R2 and inlining.
- The workflow then sends this **inlined HTML** to PDF Monkey. At render time there are **no external fetches** — images are already in the document — so there is **no race** and capture is consistent.

## Symptoms / Repro

1. Run W3 (e.g. w3-NB3---AMAZON-PNG_Assembly) for an order.
2. Check the page preview PNGs in R2 (or in admin/customer review).
3. Some pages show blank/partial backgrounds, missing character art, or cut-off content, even though assets exist in R2 and the same flow sometimes produces correct PNGs.

## Current vs inline workflow

| Aspect | w3-NB3---AMAZON-PNG_Assembly.json (current) | w3-AMAZON-PNG_Assembly-inline-image-assets.json |
|--------|---------------------------------------------|-------------------------------------------------|
| Image delivery to PDF Monkey | URLs in HTML (`/api/assets/...`) | Inlined data URLs (base64) in HTML |
| Inline Page Assets node | **None** | **Yes** (between Split in Batches and Generate Page Image with PDFMonkey) |
| Reliance on PDF Monkey fetch timing | Yes — race possible | No — no fetch at render time |
| Backend dependency at render time | PDF Monkey must reach backend (or n8n fetches not relevant if PM fetches) | Backend called once by n8n before PDF Monkey; PDF Monkey only renders HTML |

## Options

### A. Harden current URL-based system (may still be unreliable)

- Add or increase a **delay** before “Generate Page Image with PDFMonkey” (e.g. longer throttle). Reduces race probability but does not eliminate it; can regress under load.
- Ensure **cache-bust** is always present so PDF Monkey doesn’t use stale content (already used in cover HTML; verify interior `pageHtml`).
- If PDF Monkey supports it: **“wait for images”** or “network idle” in the template — would need to confirm PDF Monkey docs and template options.
- **Downside:** Any solution that depends on “wait long enough” or “hope network is fast” will remain environment-dependent and can break again.

### B. Move to inline image assets (recommended for reliability)

- Add the **Inline Page Assets** node to **w3-NB3---AMAZON-PNG_Assembly** (same pattern as in `w3-AMAZON-PNG_Assembly-inline-image-assets.json`):
  - Between **Split in Batches (PNG Pages)** and **Generate Page Image with PDFMonkey**.
  - For each item: POST `item.pageHtml` to `(item.backendUrl || 'https://admin.littleherolabs.com') + '/api/render/inline-page-assets'`, body `{ html: pageHtml }`, then set `item.pageHtml = response.html`.
- Backend already provides `POST /api/render/inline-page-assets` (`back-end/src/app/api/render/inline-page-assets/route.ts`): it finds `/api/assets/...` URLs, fetches from R2, replaces with data URLs, returns HTML.
- **Pros:** Removes the race; behavior no longer depends on PDF Monkey or network timing. Same fix as in completed issue 13 and in the inline workflow file.
- **Cons:** Slightly larger payload to PDF Monkey (base64); one extra HTTP call per page from n8n to backend (with retries/timeout already in the inline node). Acceptable for reliability.

### C. Find what changed (priority — it was working for a week)

The workflow and code didn't add inline assets; something in the environment or a deploy likely tipped the race. Check:

1. **Backend deploys (last 24–48 h)** — Any deploy to the admin backend (e.g. Vercel) that could change `/api/assets/` (timeouts, auth, redirects, cold starts, region)? New env vars or config that affect response time or routing?
2. **`backendUrl` used by W3** — What URL does the workflow send in `pageHtml`? Did that host get a new deployment, domain, or CDN so PDF Monkey's requests now take a different path (e.g. longer TTFB)?
3. **PDF Monkey** — Status page or changelog: any change to render timing, image loading, or timeouts? Different region or worker that's farther from your backend?
4. **n8n** — Workflow re-saved or re-imported (could have changed node order, throttle, or expression)? n8n Cloud region or instance change? Higher load so PDF Monkey documents are created with more concurrency?
5. **R2 / Cloudflare** — Backend fetches assets from R2 to serve `/api/assets/`. Any R2 or Cloudflare change (e.g. cache, rate limits, region) that could slow those responses?
6. **DNS / network** — If PDF Monkey resolves `backendUrl` and fetches images from it, a DNS or routing change could increase latency from PDF Monkey to backend.
7. **Load** — More traffic or longer queues so backend or PDF Monkey is under more load and responses are slower, making the race more likely to show.

**Concrete checks:** Compare a failing run vs a good run: backend logs for `/api/assets/` (status codes, duration); PDF Monkey document create/poll times; n8n execution timestamps. If backend or PDF Monkey response times are clearly higher on the failing runs, that points to a recent change in that layer.

## Affected Areas / Files

- **Workflow:** `docs/n8n-workflow-files/finals/w3-NB3---AMAZON-PNG_Assembly.json` — no Inline Page Assets; flow is Split in Batches → Generate Page Image with PDFMonkey.
- **Reference (inline variant):** `docs/n8n-workflow-files/finals/w3-AMAZON-PNG_Assembly-inline-image-assets.json` — has Inline Page Assets node and same backend endpoint.
- **Backend:** `back-end/src/app/api/render/inline-page-assets/route.ts` — already implements inlining for `/api/assets/` URLs.
- **Past fix:** `docs/_ongoing-issues-list/completed/13-w3-backgrounds-and-proof-preview-display.md` — documents the inline-asset fix for “half-rendered PNGs.”

## Investigation / next steps

1. **What changed (first):** Run through the "Find what changed" checklist in Option C (backend deploys, backendUrl, PDF Monkey, n8n, R2, DNS, load). Compare failing-run vs last-known-good timings and logs. (If you confirm the active workflow has no Inline Page Assets node, then focus on what changed in the environment; see Option C.)
2. **Short-term:** If you find a specific change (e.g. a deploy that slowed `/api/assets/`), consider reverting or tuning that so the URL-based flow is stable again.
3. **Long-term:** To avoid the same race in the future, add the **Inline Page Assets** node to the active W3 (see Option B). Then PDF Monkey never fetches image URLs and timing changes won't resurface this issue.
4. **If inline is present but issues persist:** Check backend logs for `/api/render/inline-page-assets` errors; HTML size vs 5MB limit; that all image URLs in `pageHtml` use `/api/assets/...`.

## Acceptance Criteria

- [ ] W3 page preview PNGs in R2 consistently show fully rendered images (no blank/partial backgrounds or missing art) when assets exist in R2.
- [ ] Fix is stable across multiple runs and over time (no “works then stops” regression).
- [ ] Decision documented: either (1) inline assets in production W3 and note in runbook, or (2) if staying URL-based, document the mitigation and known reliability limits.

## PDF Monkey documentation (confirmed)

- **Base64 / data-URI images:** [Including images in your documents](https://docs.pdfmonkey.io/how-tos/images) explicitly supports **data-uri** (base64): *"The data-uri format is a way to provide a complete image **without requiring any HTTP request**."* You can send `{"imageUrl":"data:image/png;base64,..."}` in the payload and use `<img src="{{imageUrl}}"/>`, or inline static base64 in the HTML. So the **inline (base64) strategy is supported** and does not rely on PDF Monkey fetching URLs.
- **URL-based images:** Images from URL are *"Paid account only"* and require PDF Monkey to load the URL; that loading can race with capture.
- **Performance:** The same doc recommends *"using inlined SVG or **data-uri images as they will not need to load**"* — aligning with using inline assets to avoid load timing.
- **Partial render:** The docs do not mention "partial render" or "wait for images" explicitly. Troubleshooting covers blank document (unpublished template), data not showing, and empty download URL — not image load timing. So the fix is not documented as such; using data-uri is the documented way to avoid external image loading.

## Notes

- The 300 ms throttle in NB3 (“Wait 300ms (Throttle)”) before Split in Batches does not address the race: the race is between PDF Monkey’s renderer and **its** image fetches, not between n8n nodes.
- Inline workflow uses a 60s timeout for the inline-page-assets HTTP call; backend has retries for R2. If pages have many large images, watch for timeout and consider increasing or batching.
