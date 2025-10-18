# **Human-in-the-Loop Asset Review System – UI & UX Specification (Stage-Aware Edition)**

## 1) Purpose & Scope

Defines the user experience and interface for a stage-based asset review system that:

- Lists AI-generated assets stored in **Cloudflare R2**.
- Allows human reviewers to **preview**, **download**, **replace**, and **approve** assets by stage.
- Integrates with **n8n** workflows for each approval stage (Pre-Bria, Post-Bria, Post-PDF).
- Organizes everything by **Order**, each containing its own `order.json` file.

The MVP will evolve into a full **backend dashboard for order management and production workflows**.

---

## 2) Information Architecture

### 2.1 Site Map

```
/
  ├─ /orders
  │    ├─ (list) Orders Index
  │    └─ /orders/[orderId]
  │          ├─ Overview (Order Info from order.json + stage status)
  │          ├─ Assets (Grid view + per-stage review controls)
  │          ├─ Activity (optional later)
  │          └─ Settings (permissions, webhooks – later)
  └─ /review (Direct Review)
       └─ shows ONLY orders with any pending review stage
```

### 2.2 URL Model

- **Order Detail**: `/orders/[orderId]` → fetches `order.json` and lists stage-specific assets.
- **Direct Review**: `/review` → lists orders with pending stages and deep-links into `/orders/[orderId]` at the first pending stage.
- **Asset Modal**: `/orders/[orderId]?assetKey=...` → shallow route for inline preview.

### 2.3 Navigation

- **Topbar**: Logo, global search, user menu.
- **Sidebar**: Orders, Products, Libraries, Reports, Settings.
- **Breadcrumbs**: `Orders › [Order ID] › Assets › [Stage]`.

---

## 3) Order Organization & Storage Conventions

⚠️ **Note:** The R2 folder structure described below is *not yet finalized*. The team should schedule a check-in to confirm the storage hierarchy, naming conventions, and stage subfolder plan before implementation.

### 3.1 R2 Directory Structure (Tentative)

```
book-mvp-simple-adventure/
  order-generated-assets/
    characters/
      [orderId]/
        order.json
        assets/
          pre-bria/
          post-bria/
          post-pdf/
```

**Note:** Folder structure **not finalized** — final confirmation needed before implementation.

### 3.2 `order.json` Schema (MVP)

```json
{
  "orderId": "book-001-20251016-abc123",
  "platform": "amazon",
  "amazonOrderId": "TEST-ORDER-003",
  "project": "personalized-book",
  "customer": {
    "firstName": "Alex",
    "lastName": "Doe",
    "email": "test@example.com"
  },
  "orderDate": "2025-10-16T18:04:23.987Z",
  "status": "queued_for_processing",
  "characterSpecs": { /* ... */ },
  "bookSpecs": { /* ... */ },
  "orderDetails": { /* ... */ },
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

## 4) Roles & Permissions

- **Reviewer**: Full access to view/replace/approve assets.
- **Admin** (future): Manage users, permissions, and audit logs.

Auth handled via **NextAuth/Clerk**; reviewer role required to access any endpoints.

---

## 5) Page & Feature Specifications

### 5.1 Orders Index

**Purpose:** Quickly locate and access orders.

**Columns:**

- **Order ID** (sortable)
- **Platform** (sortable, filterable)
- **First Name** (sortable)
- **Last Name** (sortable)
- **Status** (filterable)
- **Order Date** (sortable)
- **Open** (action button)

**Controls:** Search (Order ID, platform, name, email), filters (status/platform), sort toggles.

**Empty State:** “No orders yet. Connect n8n to create orders automatically.”

### 5.2 Order Detail – Overview Tab

Displays key metadata from `order.json`: customer, platform, date, and notes. Includes stage indicators showing the current review progress.

### 5.3 Order Detail – Assets Tab

**Goal:** Review assets stage by stage.

**Stage Selector:** `Pre-Bria` → `Post-Bria` → `Post-PDF` (with status badges).

- Each stage shows its own grid of assets.
- Reviewer can preview, download, or replace assets.
- Replace uploads directly to R2 and refreshes preview.

**Direct Review Flow:** `/review` lists only orders with pending stages and deep-links to the relevant `/orders/[orderId]` at the correct stage.

### 5.4 Asset Preview Modal

- Displays asset with metadata and next/previous navigation.
- Actions: Download, Replace, Approve.
- Keyboard shortcuts: ←/→ navigation, R to replace, Esc to close.

### 5.5 Approve Flow

- Approve button tied to the **current stage**.
- Confirm dialog: “Approve [Stage] for [Order ID]? This triggers the next workflow.”
- `POST /api/approve { prefix, reviewer, stage }`.
- After approval, badge updates and next stage activates.
- Final (Post-PDF) approval triggers completion.

---

## 6) Visual & Interaction Design

- Responsive two-pane layout (sidebar + main panel).
- Clean, neutral UI (Tailwind, 8px spacing, rounded corners, shadows).
- Stage pills with colors for Pending / In Review / Approved.
- Comfortable density, optional compact mode.
- Accessibility: WCAG AA contrast, ARIA labels, keyboard navigation.

---

## 7) Search, Filter & Sorting

- Global search across orders and customer data.
- Filters for status, platform, and date range.
- Debounced input (300ms) for smoother searching.

---

## 8) Performance & Caching

- Virtualized asset grids for large orders.
- Signed GET previews with short TTL (5–15 mins).
- Append `?ts=` for cache-busting after replace.
- Prefer `@thumb.jpg` for fast thumbnails.

---

## 9) Multi-Stage Workflow Integration

| Stage         | Workflow | Description                                         |
| ------------- | -------- | --------------------------------------------------- |
| **Pre-Bria**  | 2A       | Generate base character + 12 poses, send to Bria.ai |
| **Post-Bria** | 2B       | Retrieve background-removed images                  |
| **Post-PDF**  | 3        | Compile final PDF                                   |

Approvals per stage trigger the appropriate n8n workflow.

---

## 10) Future Expansion

- Extend dashboard to manage orders, fulfillment, and analytics.
- Add audit logs, version history, and reviewer performance metrics.
- Support additional review stages and multi-user collaboration.

