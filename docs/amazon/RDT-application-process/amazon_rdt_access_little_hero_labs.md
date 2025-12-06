# Amazon RDT (Restricted Data Token) access – Little Hero Labs

## 0. Quick context

You want to:
- Use Amazon’s Selling Partner API (SP‑API) to pull buyer name + shipping address for your own Amazon Custom orders.
- Feed that data into your existing n8n → Lulu print‑on‑demand workflow so Lulu can ship the personalized book directly to the buyer.
- This requires access to PII (name + address), which in SP‑API is protected via **Restricted Data Access (RDA)** and surfaced via **Restricted Data Tokens (RDTs)**.

In Amazon’s terminology:
- **Restricted operations** = endpoints that return PII (buyerInfo, shippingAddress, regulated info, etc.).
- **Restricted Data Token (RDT)** = short‑lived token (1 hour) that authorizes calls to those restricted operations.
- **Restricted Data Access (RDA)** = the *permission* your app must be granted before you’re allowed to request RDTs at all.

Your practical goal: **Get RDA for Orders PII so you can request RDTs and read shipping addresses programmatically.**

---

## 1. Is your app even eligible?

### 1.1 Type of app

There are two broad categories:

1. **Public apps** (listed in the Selling Partner Appstore, used by multiple, unrelated sellers)
2. **Private apps** (internal integration used by a single seller account or a small, related group of accounts)

For **public apps**, Amazon has been extremely conservative with new PII/RDA approvals, and there are multiple reports from 2021–2025 of developers being told that new public apps with restricted roles are not being approved at all.

For **private apps** that:
- Access PII strictly for **merchant‑fulfilled shipping and/or tax invoicing**, and
- Can demonstrate compliance with the **Data Protection Policy (DPP)** and **Acceptable Use Policy (AUP)**,

…Amazon still explicitly allows PII access *on a must‑have basis*.

> PII is granted to developers for select **tax and merchant fulfilled shipping purposes**, on a must‑have basis.

Your use case (you are the seller of record, and you need the buyer’s address to print and ship the book via an integrated fulfillment partner, Lulu) fits squarely under **merchant‑fulfilled shipping** for a **single seller**.

### 1.2 Practical eligibility conclusion

Assuming you:
- Register a **private SP‑API application** tied only to your Little Hero Labs seller account, and
- Limit PII usage to **fulfillment + tax** (no marketing, profiling, or unrelated analytics), and
- Implement the security controls Amazon requires,

> **Your app is, in principle, eligible for RDA/RDT access.**

If you instead tried to publish this as a multi‑seller public app with RDA, your chances would be much lower.

---

## 2. Criteria and requirements to get RDA / use RDTs

Amazon evaluates PII/RDA requests on **two axes**:

1. **Use case / necessity** – do you truly need PII?
2. **Security & compliance posture** – can you protect PII per the DPP?

### 2.1 Use‑case criteria

You will need to clearly state that:

- You are a **merchant‑fulfilled seller** printing and shipping customized books.
- The buyer’s **name and shipping address** are required to:
  - Send a print job and ship the book to the correct person and address.
  - Comply with tax documentation where required.
- PII is **not used** for:
  - Advertising, retargeting, or building unrelated marketing profiles.
  - Any purpose beyond order fulfillment and tax.

In the AUP questionnaire, you will answer Q4.1 (or equivalent) along the lines of:
- *“We require PII solely to fulfill merchant‑fulfilled Amazon orders (print and ship personalized books) and to meet tax invoicing obligations. We do not use PII for advertising or non‑fulfillment purposes, and we delete/obfuscate it within the required timeframe.”*

### 2.2 Security & compliance requirements

To get RDA, Amazon expects you to implement and document controls in these areas:

#### 2.2.1 Data protection policy & architecture

You’ll need a written **Data Protection Policy** that covers, at minimum:

- High‑level **system architecture**: where Amazon data enters (SP‑API → n8n), where it flows (Lulu API, databases, logs), and where it’s stored.
- Data classifications: what is considered PII (name, address, phone, email, etc.).
- Which systems store PII (e.g., Supabase tables, any R2 buckets, logs) and how those systems are secured.
- A clear statement that PII is used **only** for merchant‑fulfilled shipping and tax.

#### 2.2.2 Encryption & storage

Amazon’s DPP requires:

- **Encryption in transit** (HTTPS/TLS) for all PII flows.
- **Encryption at rest** for any persistent storage that ever holds PII.
- Strong key management (no hard‑coded secrets; use secrets manager / environment variables).

PII retention rules:

- You may only retain Amazon PII for **up to 30 days after order delivery** and only as long as necessary to:
  - Fulfill the order,
  - Calculate/remit taxes, and
  - Produce tax invoices.
- If you must retain data longer for legal reasons, it must be stored as **cold, offline, encrypted backups** (no active processing).
- After that window, you must **delete or irreversibly anonymize** PII.

#### 2.2.3 Access control & least privilege

You should show that:

- Only a **small set of named users** (or services) can access PII, on a need‑to‑know basis.
- Individual accounts are used (no shared logins), and access is reviewed periodically.
- Admin tools and dashboards do **not** expose unnecessary PII.

For n8n this usually means:
- Locking down the n8n instance (VPN, IP allowlist, or strong auth).
- Making sure execution logs and error traces don’t dump raw PII in plaintext where it’s broadly visible.

#### 2.2.4 Logging, monitoring, incident response

Your policy and questionnaire answers need to spell out:

- What security logs you keep (auth logs, access logs, API audit logs).
- How you detect unusual access (failed logins, strange traffic patterns, data exports).
- Your **incident response plan**:
  - How incidents are classified.
  - Steps taken if you detect unauthorized access, data leaks, or a compromised system.
  - How, and within what timeframe, you notify Amazon of incidents (they now expect email to designated security contacts).

#### 2.2.5 Vulnerability management

Amazon will ask how you:

- Patch OS, runtimes, and dependencies.
- Perform **vulnerability scanning** or **pen‑testing**.
- Track remediation and verify that high‑risk issues are actually fixed.

For a small shop, this doesn’t have to be elaborate, but you need a credible story:
- Regular OS and library updates
- Periodic scans
- Documented process for addressing findings

#### 2.2.6 Third‑party processors (Lulu)

Because you will forward buyer name/address to **Lulu**:

- Lulu effectively acts as a **sub‑processor** of Amazon PII.
- You should have:
  - A contractual data protection agreement with Lulu (or rely on Lulu’s DPA if they act as a processor for you).
  - Confirmation that Lulu stores and processes data in line with common security practices (encryption, limited access, etc.).
- In your application, note that PII is transmitted to Lulu **only for order fulfillment**, and that Lulu does not use it for independent marketing.

---

## 3. Likelihood of approval & expected timelines

### 3.1 Public vs private again

Community reports from 2021–2025 show:

- **Public apps with restricted roles** frequently receive blanket responses like:
  - “We are not approving the use of restricted data for new public applications at this time.”
- **Private, single‑seller apps** used for merchant‑fulfilled shipping/tax have **better odds**, provided their DPP answers and security story are solid.

### 3.2 Practical likelihood for Little Hero Labs

Given your scenario:

- You’re a **single seller** automating your own MFN fulfillment.
- You can credibly argue that PII is strictly required to ship the order.
- You can implement the minimum security practices described above.

→ **You are in one of the “most acceptable” categories for PII access.**

That said:
- Amazon’s review team is strict and sometimes inconsistent.
- Many developers report multiple rounds of rejection for vague or insufficient answers to the AUP/DPP questions (especially the “why do you need PII” and security/incident response items).

If you invest in a clear, detailed DPP and tight scope, your odds are **reasonable**, but not guaranteed.

### 3.3 Timelines (based on anecdotal reports)

Amazon does **not** publish an official SLA, but forum and blog reports suggest:

- Initial review: often **1–3 weeks** after submitting the RDA request.
- Follow‑up questions / resubmissions: can stretch the process to **4–8+ weeks**.
- Some developers have reported **multiple months** of back‑and‑forth for PII access, especially when trying to get approval for public apps.

For a well‑prepared private app, it’s realistic to plan for **a month or two** from first submission to final outcome, with the understanding that it could be faster or slower.

---

## 4. How to actually apply (step‑by‑step)

### 4.1 Pre‑requisites

1. **Register as a Selling Partner API developer** in Seller Central.
2. Create a **private SP‑API application** in the Developer Console.
   - Use your own AWS account for IAM credentials.
   - Configure the app to only request the minimal roles needed.

### 4.2 Requesting Restricted Data Access (RDA)

In the SP‑API Developer Console:

1. For your app, request the relevant roles (e.g., Orders API) and indicate that you require **restricted data** (buyerInfo, shippingAddress) via RDT.
2. This triggers the RDA questionnaire, which includes:
   - **Acceptable Use questions** (why you need PII).
   - **Data Protection Policy questions**:
     - Incident response plan
     - Vulnerability management
     - Data retention and deletion
     - Encryption and access control
3. Attach or reference your **Data Protection Policy** and any **architecture diagrams** you have.
4. Make sure your answers explicitly:
   - Tie PII use *only* to MFN fulfillment and tax.
   - Commit to deleting/obfuscating PII within 30 days after delivery.
   - Describe specific technical controls (not just vague statements like “we take security seriously”).

### 4.3 Special case – public applications

If you ever decided to turn this into a **public app** (for other sellers):

- You would need to undergo an **architecture review** with Amazon’s SP‑API Solutions Architecture team.
- You’d present data flows, security controls, and how you handle PII.
- As of recent years, many devs report that Amazon is largely **not approving new public apps with PII**, so this path is uncertain.

For your current Little Hero Labs needs, **stay in the private‑app lane**.

### 4.4 Once RDA is granted – using RDTs in practice

When/if your RDA request is approved:

1. Your app gains permission to call the **Tokens API** `createRestrictedDataToken` operation.
2. For each API call that needs PII (e.g., order address):
   - Request an RDT with a payload specifying:
     - The HTTP method (e.g., `GET`)
     - The resource path (e.g., `/orders/v0/orders/{orderId}/address`)
     - The data elements you need (e.g., `buyerInfo`, `shippingAddress`).
   - The Tokens API returns a short‑lived **Restricted Data Token**.
3. When calling the restricted operation (e.g., `getOrderAddress`):
   - Use the RDT value in the `x-amz-access-token` header instead of your normal LWA access token.

From an n8n perspective, you will:
- Either call a custom HTTP Request node that first hits the Tokens API to obtain an RDT, then calls the Orders endpoint with that token.
- Or, if you wrap SP‑API logic in a small external service, that service will handle the RDT flow and just expose a simpler API to n8n.

---

## 5. Design notes & gotchas for your stack

### 5.1 n8n and logs

- n8n execution logs, error logs, and screenshots can easily capture full payloads.
- You should:
  - Avoid logging raw PII where possible.
  - Use environment variables and credentials nodes for secrets.
  - Ensure the n8n instance is not publicly exposed without strong auth.

### 5.2 Storage and retention

Decide **where**, if anywhere, you store Amazon PII:

- If you only need PII long enough to send the job to Lulu, consider:
  - Keeping PII purely in memory/transient queues.
  - Storing only a minimal subset (e.g., city/country, or anonymized IDs) in Supabase for analytics.
- If you do store PII (e.g., in Supabase), implement:
  - Per‑order deletion / anonymization jobs that run after the 30‑day window.
  - Strict row‑level and column‑level permissions so PII is never exposed in dashboards.

### 5.3 Lulu integration

- Make sure the data you send to Lulu is the **minimum necessary** (name, address, and maybe email/phone if required for shipping).
- Avoid sending non‑necessary Amazon order details.
- Verify Lulu’s own security posture and document it, so you can reference it in your RDA answers.

### 5.4 Fallback if RDA is denied

If, for any reason, Amazon refuses to grant you PII/RDA:

- Manual path: pull addresses via Seller Central UI and paste/upload to Lulu.
- Semi‑automated: use Amazon’s own merchant‑fulfilled shipping label tools and treat Lulu as a separate step.
- Operationally painful, but it keeps you compliant while you iterate on the RDA application.

---

## 6. What you likely need to do next

1. **Confirm your app model**: private SP‑API app tied only to your seller account.
2. **Draft a concise Data Protection Policy** tailored to your actual architecture (n8n, Supabase, R2, Lulu).
3. **Harden your environment**:
   - Encryption, access control, secrets management, logging, incident response.
4. **Prepare strong RDA answers**:
   - Use‑case: MFN fulfillment only.
   - Security controls: concrete, specific, auditable.
5. Submit the RDA request and be prepared for **at least one round of follow‑up questions**.

If you’d like, we can next draft:
- A lightweight but Amazon‑appropriate Data Protection Policy for Little Hero Labs.
- Concrete RDA questionnaire answers that reflect your real architecture and processes.

