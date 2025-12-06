# RDT Implementation Plan – PII Protection for Little Hero Labs

Goal: Put concrete technical and process controls in place so that when you apply for Restricted Data Access (RDA) and use Restricted Data Tokens (RDTs), you can credibly demonstrate that Amazon buyer PII is **minimized, protected, and deleted on schedule** across your actual stack (n8n → Supabase → Lulu → R2, etc.).

This guide assumes:
- You will build a **private SP-API app** used only for your own seller account.
- You will use PII **only** for merchant-fulfilled shipping and required tax purposes.
- Your core components: Amazon SP-API, n8n (cloud), Supabase, Cloudflare R2, Lulu API, plus internal admin tools.

The plan is organized as a sequence of workstreams. You don’t have to do them strictly in order, but treating them as phases will make the RDA questionnaire much easier.

---

## Phase 0 – Scope & data classification

**Objective:** Decide exactly what Amazon data you will touch, and which pieces count as PII that must be strongly protected.

**Tasks:**
1. **Define the Amazon datasets you’ll access via SP-API:**
   - Order ID, line items, SKUs, quantities.
   - Buyer name.
   - Shipping address (street, city, region, postal, country).
   - Phone number (if available).
   - Buyer email / anonymized email.
   - Customization / Amazon Custom data if required for printing.

2. **Classify each field:**
   - "PII" – buyer name, full address, phone, email.
   - "Order-identifying but non-PII" – order ID, SKUs, quantities, price, etc.
   - "Analytics-only" – non-identifying aggregates you may keep long-term.

3. **Write a short internal PII scope statement**, e.g.:
   - "We treat buyer name, full postal address, phone number, and email address as Amazon PII and apply enhanced protection, limited access, and strict retention controls."

This scope statement will later be copied almost verbatim into your Data Protection Policy and RDA answers.

---

## Phase 1 – Data flow mapping

**Objective:** Document where PII flows in and out of your system, so you can point to specific controls at each step.

**Tasks:**
1. **Draw a simple data flow diagram** (even in a Google Doc / Whimsical):
   - Amazon SP-API → n8n → Supabase → Lulu API → Carriers.
   - Any use of Cloudflare R2 (e.g., storing PDFs with embedded addresses).
   - Any admin UI/dashboard where staff can view orders.

2. **For each arrow in the diagram, note:**
   - Whether PII is present.
   - How the data is transported (HTTPS API call, direct DB connection, etc.).

3. **For each system (n8n, Supabase, R2, Lulu):**
   - Decide whether PII is **stored** there or only **transiently processed**.

Keep this diagram and table in a single internal doc – you’ll reference it repeatedly when answering Amazon’s DPP questions.

---

## Phase 2 – Storage, retention, and deletion controls

**Objective:** Ensure that any stored Amazon PII is minimized, encrypted, and automatically removed or anonymized within Amazon’s required timelines.

**Tasks:**
1. **Decide what PII you actually need to persist in Supabase:**
   - Example minimal choice: store full shipping address only long enough to fulfill the order and handle returns (e.g., 30 days after delivery), then anonymize.
   - For analytics, store only non-PII (product, price, city/region if needed, but not street address or full name).

2. **Design a retention model:**
   - For each PII field, define a retention rule, e.g.:
     - "Full name + street-level address: delete or anonymize within 30 days after order delivery."
     - "Phone and email: delete within 30 days after delivery unless needed for an open support case."
   - Include a policy for backups: e.g., rotate encrypted backups such that PII never persists beyond the allowed window.

3. **Implement retention automation in Supabase:**
   - Add timestamps to each order row: `order_created_at`, `delivered_at` (if available), ` pii_purge_due_at`.
   - Create a scheduled job (via Supabase cron or n8n) that runs nightly to:
     - Overwrite PII columns with nulls or irreversible hashes when `now() > pii_purge_due_at`.
     - Optionally move non-PII analytics fields to a separate table.

4. **Decide how to handle PII in Cloudflare R2 (if used for shipping labels/PDFs):**
   - Prefer not to store PII in R2 if possible.
   - If unavoidable, include an object-level metadata field like `pii_purge_due_at` and run a scheduled deletion job.

5. **Confirm retention with Lulu:**
   - Review Lulu’s own retention practices.
   - If they keep addresses long-term, document that they do so as your processor for shipping/returns and that data is not reused for marketing.

---

## Phase 3 – Access control & least privilege

**Objective:** Lock down who can see PII and from where, and prove it to Amazon with concrete details.

**Tasks:**
1. **Define roles for internal users:**
   - Example roles: Admin, Operations, Support.
   - Specify which roles can view PII and which cannot.

2. **Supabase access control:**
   - Use Row-Level Security and policies to ensure only authenticated roles with a legitimate need can select PII columns.
   - Ensure that any public-facing API or admin UI never exposes PII unless strictly needed.

3. **n8n access control:**
   - Ensure n8n is secured with strong authentication (no open/public instances).
   - Limit workspace access to named accounts only (no generic shared logins).
   - Avoid exposing full PII in node labels, screenshots, or error messages.

4. **Credential and secret management:**
   - Store SP-API keys, LWA client secrets, database passwords, and Lulu keys only in n8n credentials / environment variables, never in source code or logs.
   - Document the process for rotating these secrets.

5. **Access reviews:**
   - Create a simple quarterly checklist: "Review who has access to Supabase PII tables, n8n, and any dashboards. Remove access for ex-contractors or staff who no longer need it."

Document these steps in a short "Access Control" section of your Data Protection Policy.

---

## Phase 4 – Transport security (in transit)

**Objective:** Verify that PII is always transmitted over secure channels.

**Tasks:**
1. **Confirm all external APIs use HTTPS:**
   - Amazon SP-API endpoints.
   - Lulu API.
   - Supabase and R2 endpoints.

2. **Internal admin interfaces:**
   - Ensure any admin UI is only served over HTTPS.
   - Avoid accessing admin tools over insecure networks without VPN or equivalent protection.

3. **No PII in URLs where possible:**
   - Avoid putting names or addresses in query strings or path segments that might land in web server logs.

---

## Phase 5 – Logging, monitoring, and incident response

**Objective:** Log enough to detect misuse, but avoid leaking PII into logs; and have a clear playbook for what happens if something goes wrong.

**Tasks:**
1. **Define a logging policy:**
   - Decide which events to log: successful/failed logins, access to PII tables, SP-API call failures, unusual numbers of exports.
   - Configure n8n to avoid full payload logging for nodes that handle PII, or to explicitly mask PII fields.

2. **PII in logs:**
   - Minimize or mask PII in logs wherever possible.
   - If some PII must be logged for troubleshooting, tie it to the same 30-day retention/deletion schedule.

3. **Monitoring basics:**
   - Enable basic alerts for suspicious activities: repeated failed logins, new logins from unfamiliar IPs, spikes in export operations.

4. **Incident response plan (IRP):**
   - Draft a 1–2 page IRP covering:
     - How incidents are reported internally (e.g., email/Slack channel).
     - Steps for containment (revoking keys, disabling accounts, blocking IPs).
     - Eradication and recovery (patching, restoring from clean backups).
     - Notification obligations, including notifying Amazon via their security contact path if Amazon PII is involved.
   - Be ready to summarize this process in the DPP questionnaire.

---

## Phase 6 – Vulnerability management & secure development

**Objective:** Show Amazon you have a credible process for finding and fixing security issues.

**Tasks:**
1. **Patch management:**
   - Define how often you review and apply updates to:
     - Operating systems on any self-hosted components.
     - Application dependencies and libraries.
   - For managed services (Supabase, n8n cloud, R2, Lulu), rely on their patch processes but note this in your policy.

2. **Regular scans:**
   - Use at least one vulnerability scanner (for example, on any custom backend code) and document how often you run it and how you track remediation.

3. **Development practices:**
   - Avoid committing secrets to source control.
   - Use code review for changes touching PII handling.
   - Maintain separate environments for development/test vs production.
   - Never use real Amazon PII in dev/test – use sandbox or synthetic data.

---

## Phase 7 – Third-party and sub-processor management

**Objective:** Make sure Amazon PII shared with third parties is limited, justified, and protected.

**Tasks:**
1. **Identify all third parties that may see Amazon PII:**
   - Lulu (shipping address, name, maybe phone/email).
   - Supabase (database host).
   - Cloudflare R2 (if storing PII in files).
   - Any logging or monitoring SaaS that might capture PII.

2. **For each, document:**
   - What specific PII fields they receive.
   - For what purpose (e.g., printing & shipping books).
   - A reference to their security/privacypage or DPA.

3. **Limit data where possible:**
   - Send only what Lulu truly needs to fulfill the order.
   - Avoid sending Amazon IDs or unnecessary metadata.

4. **Contractual assurances:**
   - Where possible, ensure your agreements or terms with these providers include data protection commitments.

You’ll summarize this in the DPP section that asks about third-party data processors.

---

## Phase 8 – RDT-specific implementation details

**Objective:** Implement the RDT flow in a way that respects minimization and least privilege from day one.

**Tasks:**
1. **Identify required restricted operations and data elements:**
   - Example:
     - `GET /orders/v0/orders/{orderId}` with `buyerInfo`, `shippingAddress` data elements.
     - `GET /orders/v0/orders/{orderId}/address` if you use the address endpoint directly.
   - Limit the RDT request to only the paths and data elements you actually need.

2. **Implement a small RDT wrapper service or n8n pattern:**
   - Option A – External service:
     - Build a small backend (e.g., Node/Express) that:
       - Accepts a specific order ID.
       - Requests an RDT for that single order, with minimal data elements.
       - Calls the restricted endpoint and returns a trimmed response to n8n.
   - Option B – Pure n8n flow:
     - Use HTTP nodes to call `createRestrictedDataToken` with the required payload.
     - Use a subsequent HTTP node to call the restricted operation, passing the RDT in `x-amz-access-token`.

3. **Scope and lifetime of tokens:**
   - Ensure each RDT is used only for its intended call(s).
   - Do not store RDTs long-term; treat them as short-lived, in-memory tokens.

4. **Error handling:**
   - Decide how you’ll handle RDT failures (e.g., retry limits, fallback to manual processing).
   - Avoid logging full responses that include PII.

5. **Testing in sandbox:**
   - Use Amazon’s sandbox/SP-API test data to validate the RDT flow without touching real PII.
   - Once approved for RDA, start with a few low-volume, real orders in production to confirm everything works.

---

## Phase 9 – Data Protection Policy (DPP) & AUP questionnaire prep

**Objective:** Pre-assemble the answers Amazon expects, based on the work you’ve done in Phases 0–8.

**Tasks:**
1. **Draft a formal Data Protection Policy document** that includes:
   - Scope and classification of Amazon data.
   - Data flow overview and architecture.
   - Storage, retention, and deletion controls.
   - Access control and least privilege.
   - Transport security.
   - Logging, monitoring, and incident response.
   - Vulnerability management.
   - Use of third-party processors and limits on their access.

2. **Prepare specific, concrete answers for the RDA questions:**
   - Why you need PII: clearly tie it only to merchant-fulfilled shipping and tax.
   - How long you retain PII and how you delete/anonymize it.
   - How you secure PII at rest and in transit.
   - How you control access and monitor for abuse.
   - How you would handle and report a security incident involving Amazon data.

3. **Tie each claim in your answers to an actual control you’ve implemented:**
   - If you say "we delete PII after 30 days," make sure the Supabase job really exists.
   - If you say "only operations staff can view PII," confirm roles and RLS policies enforce that.

---

## Phase 10 – Internal dry run and documentation package

**Objective:** Make sure your story is internally consistent and ready for Amazon’s review.

**Tasks:**
1. **Internal review:**
   - Walk through a single order from Amazon → n8n → Supabase → Lulu → deletion.
   - For each step, verify:
     - Is PII present here?
     - Is it encrypted in transit and at rest?
     - Who can see it?
     - When does it get deleted or anonymized?

2. **Create a small "RDT Application Pack":**
   - Data flow diagram.
   - Data Protection Policy.
   - Access control overview.
   - Incident response summary.
   - One-page description of your use case and why PII is required.

3. **Only after this dry run** should you submit the RDA request in the SP-API developer console.

---

## Outcome

Once these phases are in place, you will be able to:
- Honestly claim that you use Amazon PII **only** for merchant-fulfilled shipping and tax.
- Prove you **minimize, protect, and delete** PII according to Amazon’s expectations.
- Back up each statement in the RDA questionnaire with real, implemented controls.

That substantially improves your chances of a successful RDT approval for your Little Hero Labs integration.

