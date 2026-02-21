# Little Hero Labs — Sibling Order Support: QA Briefing
**Project:** Multi-book (sibling) order support for Little Hero Labs  
**Purpose:** This document provides all context needed to continue the QA review process in a new chat session.

---

## What This Project Is

Little Hero Labs (LHL) is a personalized children's book business. Orders are fulfilled through a pipeline of n8n workflows. Currently the pipeline only supports one book per Amazon order. We are adding support for **multi-book sibling orders** — where a single Amazon order contains N books, each for a different child.

An implementing agent has already made changes to all workflow files. **Your job is QA: verify that every change is correct, catch any bugs the implementing agent introduced, and make fixes as needed.** You are not re-implementing from scratch; you are auditing what was already done.

---

## The Core Problem (Why Any of This Matters)

When Amazon sends a multi-book order, each book gets a synthetic per-book ID (e.g. `114-7080737-5512234-item-001`). The shared root Amazon order ID is `114-7080737-5512234`.

The original pipeline always used `amazon_order_id` (the shared root ID) as the unique routing identifier for every order. With siblings, this causes:

- **R2 path collisions** — two siblings writing manifests/assets to the same directory, overwriting each other
- **Supabase row collapse** — siblings collapsing into a single row because the upsert key is the shared root ID
- **Wrong character specs in print jobs** — Lulu receives one book's character specs but the other book's PDF

**The universal fix, applied in every workflow:** use `order.orderId || order.amazon_order_id` as the per-book routing identifier (synthetic ID takes priority), and carry `amazonOrderId` separately for group-level operations. Never use `amazon_order_id` alone as a routing key when a per-book `orderId` is available.

---

## File Structure

```
/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/
│
├── QA-BRIEFING.md                          ← This file
├── lhl-sibling-orders-master-summary.md   ← Full technical deep-dive; read for background
├── implementation-phase-tracker.md        ← Phase/task checklist with completion status
├── sibling-order-audit-plan.md            ← Original audit plan
│
├── audit-w0.md                            ← Audit spec for W0 (Order Intake)
├── audit-w1.1.md                          ← Audit spec for W1.1 (Queue Manager & Router)
├── audit-w1.1-cron-addendum.md            ← Cron router audit (Vercel side, companion to W1.1)
├── audit-w1.5.md                          ← Audit spec for W1.5 (Health Monitor)
├── audit-w2a.md                           ← Audit spec for W2A Orchestrator
├── audit-w2a-sw0.md                       ← Audit spec for W2A SW0 (Base Character Gen)
├── audit-w2a-sw1.md                       ← Audit spec for W2A SW1 (Pose Generation)
├── audit-w2a-sw2.md                       ← Audit spec for W2A SW2 (QA)
├── audit-w2a-sw3.md                       ← Audit spec for W2A SW3 (Upload)
├── audit-w2b-main.md                      ← Audit spec for W2B Orchestrator
├── audit-w2b-sw1.md                       ← Audit spec for W2B SW1 (Single Pose)
├── audit-w3.md                            ← Audit spec for W3 (Book Assembly)
├── audit-w4.md                            ← Audit spec for W4 (Print Fulfillment)
│
└── sibling-order-n8n-workflows/           ← THE FILES TO EDIT (implementing agent's output)
    ├── w0-Order_Intake_Validation.json
    ├── w1.1-Queue_Manager_and_Router.json
    ├── w1.5-Health_Monitor.json
    ├── w2A-Orchestrator.json
    ├── w2A-SW0-Base_Character_Generation.json
    ├── w2A-SW1-Pose_Generation.json
    ├── w2A-SW2-Pose_and_Style_QA.json
    ├── w2A-SW3-Upload.json
    ├── w2B-main-orchestrator.json
    ├── w2B-sw1-single-pose.json
    ├── w3-Book-Assembly.json
    ├── w4-PRODUCTION-Print_Fulfillment.json
    └── w4.1-Sibling-Aggregation.json
```

**Original (pre-implementation) files** live at:
```
/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/finals/
```
Reference these if you need to compare what was changed vs. the original.

---

## QA Process — How to Review Each File

Follow this exact process for every workflow file:

### Step 1: Read the audit spec first
Read the corresponding `audit-*.md` file completely before touching any code. The audit specifies:
- Which nodes should have been changed (`UPDATE` tag)
- Which nodes should be unchanged (`NO CHANGE` tag)  
- Which nodes need manual confirmation (`VERIFY` tag)
- What the correct before/after code looks like for each changed node
- Open questions and known caveats

### Step 2: Copy the workflow file to Claude's environment
Use the Filesystem copy tool to bring the `.json` file into the Claude computer for inspection. **Do not edit the original until you have fully analyzed it.**

### Step 3: Validate JSON integrity
Run `python3 -c "import json; json.load(open('file.json'))"` first. The implementing agent had a habit of inserting literal newlines inside JSON string values, which breaks parsing. If the file fails to parse, repair all `jsCode` strings by re-encoding literal `\n` bytes as `\\n` escape sequences before doing anything else.

### Step 4: Extract and inspect all `jsCode` nodes
Print the JavaScript code from every Code node. For each node tagged `UPDATE` in the audit:
- Does the change match what the audit specified?
- Are there any subtle bugs the implementing agent introduced while making the fix? (The most common: fixing the output field but leaving the wrong value in a console.log, forgetting to carry `amazonOrderId` through, or fixing field names inconsistently)

### Step 5: Check every NO CHANGE node
Confirm that nodes tagged `NO CHANGE` were actually left alone. The implementing agent occasionally touched nodes it shouldn't have.

### Step 6: Verify connections
Confirm that the node wiring (`connections` object in the JSON) matches the original. New nodes should be wired in; nothing should have been accidentally disconnected.

### Step 7: Apply fixes
Fix any bugs found. Make targeted, surgical edits. Write back the corrected file to:
```
/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/<filename>.json
```

### Step 8: Update the audit file
Append a `## Post-Implementation Review` section to the audit `.md` file documenting:
- What the implementing agent got right
- Any issues found (with severity: Critical / Minor / Cosmetic)
- Root cause of each issue
- Exact fix applied (before/after code snippets)
- List of nodes verified correct with no changes

---

## What Correct Looks Like — Key Patterns

These are the patterns that must be present in every updated workflow. If you see the old pattern, it's a bug.

### orderId resolution (universal fix)
```javascript
// ❌ OLD — broken for siblings (collapses all siblings to same ID)
orderId: order.amazon_order_id,

// ✅ NEW — per-book ID takes priority; root group ID preserved separately
const orderId = order.orderId || order.amazon_order_id;
orderId,
amazonOrderId: order.amazon_order_id,
```

### R2 path construction
```javascript
// ❌ OLD — both siblings write to the same directory
const key = `${prefix}/${order.amazon_order_id}/manifests/1-manifest.json`;

// ✅ NEW — each sibling gets its own directory
const orderId = order.orderId || order.amazon_order_id;
const key = order.one_manifest_url || `${prefix}/${orderId}/manifests/1-manifest.json`;
```

### Supabase upsert conflict key
```javascript
// ❌ OLD — siblings collapse into one row
// ?on_conflict=amazon_order_id

// ✅ NEW — unique row per book
// ?on_conflict=orderId
```

### Supabase query (fetching a specific order's row)
```javascript
// ❌ OLD — returns wrong row for siblings
// ?amazon_order_id=eq.${order.amazon_order_id}

// ✅ NEW — targets the exact per-book row
// ?orderId=eq.${orderId}
```

---

## Common Bugs the Implementing Agent Introduced

Based on completed reviews, watch for these specific failure patterns:

1. **Late orderId derivation in loops** — Agent derives `orderId` at the bottom of a for-loop body, but early `console.warn`/`console.error` lines at the top of the same loop still reference `order.amazon_order_id`. Fix: move `const orderId = order.orderId || order.amazon_order_id` to the very first line of the loop body.

2. **JSON corruption** — Literal newline bytes (`0x0A`) embedded inside `jsCode` JSON string values. The file appears to have code but `JSON.parse()` throws `Invalid control character`. Fix with a Python script that re-encodes all literal newlines in string values as `\\n`.

3. **Field precedence reversal** — Agent adds new sibling fields but puts them in the wrong priority order. The safe pattern is always `specificId || fallbackId` (more specific first, generic fallback last). Example: `r.orderId || r.id || r.amazonOrderId` — never `r.amazonOrderId || r.orderId`.

4. **Missing `amazonOrderId` passthrough** — Agent fixes `orderId` but forgets to also carry `amazonOrderId` into the output payload. Downstream nodes that need to identify the sibling group (e.g. W4.1 aggregation) will be missing this field.

5. **Partial fix (some nodes fixed, others missed)** — Agent fixes Prep nodes but misses a fallback in the Merge/Verify node downstream. Check every node in the data path, not just the obvious ones.

---

## Completed Reviews

| Workflow File | Audit File | QA Status | Issues Found |
|---------------|------------|-----------|--------------|
| `w0-Order_Intake_Validation.json` | `audit-w0.md` | ✅ Complete | 3 issues fixed: JSON corruption (critical), extractOrderId field precedence (critical), missing sibling test mocks (minor) |
| `w1.1-Queue_Manager_and_Router.json` | `audit-w1.1.md` | ✅ Complete | 1 issue fixed: logging used root group ID in error messages (cosmetic) |
| `w4.1-Sibling-Aggregation.json` | `audit-w4.1.md` | ✅ Complete | 1 issue fixed: missing Reattach Cover Context node — coverPdfR2Key lost before Upload Cover PDF (critical) |

All subsequent files are pending review.

---

## Review Order (Follow This Sequence)

Reviews should follow the phase dependency chain. Do not skip ahead — each workflow depends on the one before it sending the correct `orderId`.

```
W0  →  W1.1  →  W2A  →  W2A-SW0  →  W2A-SW1  →  W2A-SW2  →  W2A-SW3
                     →  W2B-main  →  W2B-SW1
                                  →  W3  →  W4  →  W4.1  →  W1.5
```

The audit for each is in the corresponding `audit-*.md` file. When Jeff tells you which file to review next, read its audit spec first, then proceed through Steps 1–8 above.

---

## Key Technical Context

**R2 bucket structure (per-book, correct):**
```
book-mvp-simple-adventure/orders/<orderId>/manifests/1-manifest.json
book-mvp-simple-adventure/orders/<orderId>/manifests/2a-manifest.json
book-mvp-simple-adventure/orders/<orderId>/manifests/3-manifest.json
book-mvp-simple-adventure/orders/<orderId>/manifests/4-manifest.json
book-mvp-simple-adventure/orders/<orderId>/preview-images/
```

**Character assets (shared across siblings with identical character specs):**
```
book-mvp-simple-adventure/characters/<characterHash>/poses/
book-mvp-simple-adventure/characters/<characterHash>/bg-removed/
```
Character assets are keyed by `characterHash`, not `orderId`, so siblings with different characters get separate asset directories automatically. No changes needed to asset generation for the sibling fix.

**Supabase `orders` table key fields:**
- `id` — auto-increment row ID (used for `orderDbId` in all Mark-as-Processing PATCH calls)
- `orderId` — unique per-book synthetic ID (e.g. `114-7080737-5512234-item-001`) — **the correct routing key**
- `amazon_order_id` — root group ID shared by all siblings in the same Amazon order (e.g. `114-7080737-5512234`) — **for group-level operations only**

**What the Vercel cron sends to W1.1:**
Each order object in the `orders` array includes the fields from the Supabase SELECT query. As of the last audit, `orderId` is NOT included in that SELECT — it must be added as part of the cron router work. Until it is, `order.orderId` will be `undefined` in W1.1 and the fallback to `amazon_order_id` will silently apply. The workflow file changes are still correct; they are just inert until the cron SELECT is updated.

---

## What Is Out of Scope for This Review

These items require changes outside the n8n workflow JSON files and are tracked in the phase tracker but are **not part of the workflow QA process:**

- Vercel cron router (`back-end/src/app/api/cron/router/route.ts`) — needs `orderId` added to SELECT, sibling group detection logic, W3 PDFMonkey concurrency sub-limit
- Vercel health monitor cron (`back-end/src/app/api/cron/health-monitor/route.ts`) — needs `orderId` in SELECTs
- Supabase schema — `UNIQUE` constraint on `orderId`, `sibling_waiting` enum value, `get_orphaned_orders` RPC update
- Backend API webhook handlers — must accept per-book `orderId` in payloads

---

## Files to Never Edit

- Any file under `.../finals/` — these are the originals, for reference only
- `lhl-sibling-orders-master-summary.md` — master reference doc, not a work product
- `implementation-phase-tracker.md` — update status fields only if Jeff asks; don't restructure it
- `audit-*.md` files — **append** a `## Post-Implementation Review` section; never modify the original audit content above it
