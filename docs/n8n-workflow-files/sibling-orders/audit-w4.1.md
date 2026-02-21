# W4.1 Sibling Aggregation — QA Review
**File:** `w4.1-Sibling-Aggregation.json`
**QA Date:** 2026-02-19
**Status:** Complete (1 critical fix applied)

---

## Post-Implementation Review

### What the Implementing Agent Got Right

- **Config + Validate Sibling Group:** Correct per-book `orderId` precedence (`s.orderId || s.amazon_order_id`); validates `siblingGroup` ≥ 2; derives `manifest3Key` per-book; validates `shipping_address.phone_number`.
- **Validate & Normalize Per Sibling:** Fetches 3-manifest from backend; extracts `pageImageUrls`, `coverPdfR2Key`, `pdfR2Key` with per-book paths; propagates `orderId`, `childName`, `shippingAddress`.
- **R2 paths:** All paths use per-book `orderId` — `orders/${orderId}/...` for interior PDF, cover PDF, and 4-manifest.
- **Supabase PATCH:** Uses `orderId=eq.{{perBookId}}` (correct per-book targeting).
- **Lulu payload:** N `line_items` with `external_id: s.orderId`, shared `shipping_address`, `pod_package_id`.
- **Aggregate + Signed URLs:** R2 presigning per sibling; `line_items` built correctly.
- **Notify:** Sends `{ orderIds: [...] }` via Aggregate for Notify node.
- **Connections:** Full flow wired correctly (Webhook → Config+Validate → dual branch to Ack + Validate Per Sibling → PDF pipeline → Aggregate → Lulu → Supabase → 4-manifest → Notify).

### Issues Found

| Severity | Issue | Root Cause | Fix Applied |
|----------|-------|------------|-------------|
| **Critical** | Upload Cover PDF to R2 would fail — `coverPdfR2Key` missing from item | Generate Cover PDF (HTTP) replaces output with API response; context (orderId, coverPdfR2Key, CONFIG) from Build Cover HTML was lost before Poll Cover. Poll Cover returned `{...ctxIn, coverPdfDownloadUrl}` where ctxIn = PDFMonkey response only. | Added **Reattach Cover Context (PDFM)** node between Generate Cover PDF and Poll Cover PDFMonkey. Reattach merges HTTP response with context from Build Cover HTML (or Validate & Normalize Per Sibling), preserving `coverPdfR2Key`, `orderId`, `CONFIG`. Matches W4 pattern. |

### Nodes Verified Correct (No Changes)

- Webhook (W4.1 Intake)
- Respond to Webhook (Ack)
- Build Pages HTML (8.75in)
- Prepare PDFMonkey Data
- Generate Interior PDF
- Poll PDFMonkey until ready
- Download Interior PDF
- Upload Interior PDF to R2
- Build Cover HTML
- Prepare Cover PDFMonkey Data
- Generate Cover PDF
- Poll Cover PDFMonkey until ready (receives from Reattach; has full context)
- Download Cover PDF
- Upload Cover PDF to R2
- Aggregate + Signed URLs + Build Lulu Payload
- Lulu: Get Token
- Submit Lulu Print Job
- Split for Supabase PATCH
- Supabase: PATCH N rows
- Build 4-Manifest JSON
- Upload 4-Manifest to R2
- Aggregate for Notify
- Notify: Sent to Print

### JSON Integrity

- File parses successfully.
- No invalid control characters in `jsCode` strings.

### Dependencies Noted

- **Backend manifest API:** `GET /api/manifests/${manifest3Key}` — manifest3Key includes path (e.g. `book-mvp-simple-adventure/orders/.../manifests/3-manifest.json`). Confirm backend route accepts key with slashes.
- **S3/R2 credentials:** Nodes use credential ID `7tJOX9QjL1jqyEjf` — must exist in n8n instance.
- **Backend print-submitted webhook:** Expects `{ orderIds: string[] }`. Confirm contract.
