# **Technical Specification: Human‑in‑the‑Loop Asset Review System (Stage‑Aware)**

> **Note on storage structure**: The **R2 folder structure is not finalized**. Before implementation, schedule a check‑in to confirm naming conventions, hierarchy, and stage subfolders.

---

## 1) Overview

A lightweight, stage‑aware backend that exposes endpoints to **list**, **preview (signed GET)**, **replace (signed PUT)**, and **approve** assets stored in **Cloudflare R2**, organized by **order** and **review stage**. Stages:

- **preBria** – before background removal (Workflow 2A produces base character + 12 poses, then sends to Bria).
- **postBria** – after Bria returns background‑removed images (Workflow 2B fetches results).
- **postPdf** – after PDF compilation (Workflow 3 outputs compiled PDF).

Approval per stage sends a **webhook to n8n** which branches logic based on `stage`.

---

## 2) API Endpoints

All endpoints require authenticated **Reviewer** role (see §6) and operate within a validated **order scope** derived from `order.json`.

### 2.1 `GET /api/orders`

Returns a paginated/sortable index of orders (for Orders Index table).

**Query**

- `q` (string, optional): free‑text search across orderId, platform, names, email.
- `status` (string, optional): e.g., `pending-review`, `approved`.
- `platform` (string, optional): `amazon`, `etsy`, etc.
- `sort` (string, optional): `orderDate:desc` (default) or any field asc/desc.
- `page` (number), `pageSize` (number).

**Response**

```json
{
  "items": [
    {
      "orderId": "book-001-20251016-abc123",
      "platform": "amazon",
      "firstName": "Alex",
      "lastName": "Doe",
      "status": "pending-review",
      "orderDate": "2025-10-16T18:04:23.987Z"
    }
  ],
  "page": 1,
  "pageSize": 25,
  "total": 120
}
```

### 2.2 `GET /api/orders/:orderId`

Loads metadata from `order.json`, including `reviewStages` and `assetPrefix`.

**Response (excerpt)**

```json
{
  "orderId": "book-001-20251016-abc123",
  "platform": "amazon",
  "customer": { "firstName": "Alex", "lastName": "Doe", "email": "test@example.com" },
  "orderDate": "2025-10-16T18:04:23.987Z",
  "assetPrefix": "projects/personalized-book/orders/book-001-20251016-abc123/",
  "reviewStages": {
    "preBria": { "status": "pending" },
    "postBria": { "status": "pending" },
    "postPdf": { "status": "pending" }
  }
}
```

### 2.3 `GET /api/list`

Lists assets for a given **order scope** and **stage** and returns **signed GET** preview/download URLs.

**Query**

- `prefix` (required): base order asset prefix (from `order.json.assetPrefix`).
- `stage` (optional): `preBria` | `postBria` | `postPdf`. Defaults to first pending stage.
- `path` (optional): subpath override for advanced cases.

**Response**

```json
{
  "prefix": "projects/book-001/",
  "stage": "postBria",
  "files": [
    {
      "key": "projects/book-001/assets/post-bria/pages/01.png",
      "size": 210394,
      "lastModified": "2025-10-16T19:12:00Z",
      "previewUrl": "https://...signedGet...",
      "downloadUrl": "https://...signedGet..."
    }
  ]
}
```

### 2.4 `POST /api/presign-put`

Returns a **signed PUT** URL to overwrite a file **in place** (same key) at the validated order/stage path.

**Body**

```json
{
  "key": "projects/book-001/assets/post-bria/pages/02.png",
  "contentType": "image/png",
  "stage": "postBria"
}
```

**Response**

```json
{ "method": "PUT", "url": "https://...signedPut...", "key": "projects/book-001/assets/post-bria/pages/02.png", "stage": "postBria" }
```

### 2.5 `POST /api/approve`

Approves the **current stage** for an order and **POSTs to n8n**.

**Body**

```json
{
  "prefix": "projects/book-001/",
  "reviewer": "jeff@thepeakbeyond.com",
  "stage": "postBria"
}
```

**Response**

```json
{ "ok": true, "message": "Stage postBria approved." }
```

**Behavior**

- Builds payload and posts to `N8N_APPROVE_WEBHOOK`:

```json
{
  "prefix": "projects/book-001/",
  "approvedAt": "2025-10-16T19:30:00Z",
  "reviewer": "jeff@thepeakbeyond.com",
  "stage": "postBria"
}
```

- n8n routes: `preBria` → send to Bria (2A), `postBria` → compile/continue (2B), `postPdf` → finalize/publish (3).

### 2.6 `GET /api/review`

Returns **only orders with pending review** in any stage (used by `/review`).

**Query**: accepts same filters/sorts as `/api/orders`.

---

## 3) Storage (Cloudflare R2) – **Tentative**

**Bucket**: `little-hero-assets`

**Example (to be finalized)**

```
book-mvp-simple-adventure/
  order-generated-assets/
    characters/
      [orderId]/
        order.json
        assets/
          pre-bria/
            pages/...
          post-bria/
            pages/...
          post-pdf/
            compiled.pdf
```

> ⚠️ Reconfirm structure before coding migrations, policies, or presign path validators.

Signed URL TTLs: GET 300–900s; PUT 900s.

---

## 4) order.json (MVP)

```json
{
  "orderId": "book-001-20251016-abc123",
  "platform": "amazon",
  "amazonOrderId": "TEST-ORDER-003",
  "project": "personalized-book",
  "customer": { "firstName": "Alex", "lastName": "Doe", "email": "test@example.com" },
  "orderDate": "2025-10-16T18:04:23.987Z",
  "status": "queued_for_processing",
  "characterSpecs": {},
  "bookSpecs": {},
  "orderDetails": {},
  "assetPrefix": "projects/personalized-book/orders/book-001-20251016-abc123/",
  "reviewStages": {
    "preBria": { "status": "pending" },
    "postBria": { "status": "pending" },
    "postPdf": { "status": "pending" }
  },
  "webhooks": { "onApprove": "<n8n-approve-webhook-url>" }
}
```

---

## 5) Auth & Security

- Auth via NextAuth/Clerk; **Reviewer** role required.
- **Prefix/key validation**: every list/replace/approve must resolve within the **order’s** `assetPrefix` and approved subfolders for the requested `stage`.
- **MIME whitelist**: e.g., `image/png`, `image/jpeg`, `image/webp`, `application/pdf` (postPdf only).
- **CORS**: allow PUT to signed URL; deny all other cross‑origin writes.
- **Rate limiting**: simple token bucket on write endpoints.

---

## 6) Cache & CDN

- Dashboard previews: add `Cache-Control: no-store` or append `?ts=` after replace.
- Optional: Cloudflare **purge** per file path after overwrite.

---

## 7) n8n Integration

- Single env var `N8N_APPROVE_WEBHOOK` or per‑order override `order.json.webhooks.onApprove`.
- Payload always includes `{ prefix, stage, approvedAt, reviewer }`.
- n8n branches to **2A/2B/3** based on `stage`.

---

## 8) Errors & Retries

| Case               | Code | Action                                   |
| ------------------ | ---- | ---------------------------------------- |
| Unauth/No role     | 403  | Prompt login / permissions               |
| Missing/Bad stage  | 400  | Default to first pending or return error |
| Key outside scope  | 400  | Reject (security)                        |
| Signed URL expired | 400  | Regenerate                               |
| n8n webhook 5xx    | 502  | Retry with backoff (×3)                  |

---

## 9) Environment

```
R2_BUCKET=
R2_ACCESS_KEY=
R2_SECRET_KEY=
R2_ACCOUNT_ID=
N8N_APPROVE_WEBHOOK=
CF_ZONE_ID=            # optional purge
CF_API_TOKEN=         # optional purge
```

---

## 10) Implementation Notes (Node/Next.js)

- Use `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` with R2 endpoint: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` and `region: "auto"`.
- Prefer **API routes** collocated with Next.js app; protect via middleware.
- For large uploads, consider Multipart (later); MVP: single PUT is fine.

**Presign helpers (pseudo):**

```ts
const r2 = new S3Client({ region: 'auto', endpoint, credentials });
export const presignGet = (Key, ttl=600) => getSignedUrl(r2, new GetObjectCommand({ Bucket, Key }), { expiresIn: ttl });
export const presignPut = (Key, ContentType, ttl=900) => getSignedUrl(r2, new PutObjectCommand({ Bucket, Key, ContentType }), { expiresIn: ttl });
```

---

## 11) QA & E2E

- Unit: key validators, stage router, MIME checks.
- Integration: replace flow (PUT), stage‑aware approve payloads, webhook retries.
- E2E: create mock order → list stage assets → replace → approve stage 1 → approve stage 2 → approve stage 3 → verify n8n received correct `{ stage }` per step.

---

## 12) Roadmap Hooks

- Optional DB (Postgres/Supabase) for audit logs and richer queries.
- Asset versioning & rollbacks (R2 object versioning).
- Bulk actions and multi‑reviewer assignments.
- Full backend dashboard for orders/fulfillment/analytics.

