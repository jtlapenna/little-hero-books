# **Project Overview: Human-in-the-Loop Asset Review System**

## **1. Project Summary**

The Human-in-the-Loop (HITL) Asset Review System enables a human reviewer to **preview, replace, and approve AI-generated assets** before they are finalized for publication or product creation.\
It integrates directly with **n8n workflows** and **Cloudflare R2 storage**, ensuring all approved assets remain at the same file paths used by downstream automation.

This system eliminates the need for external storage duplication or manual file handling, allowing efficient oversight while maintaining a seamless pipeline between AI asset generation, human review, and automated publishing.

---

## **2. Primary Objectives**

1. **Enable Human Review** – Provide a simple dashboard where each generated asset can be previewed in context before approval.
2. **Allow Direct Replacement** – Permit reviewers to replace any asset file directly in R2 using the same file key and URL.
3. **Maintain Storage Continuity** – Ensure replaced files **overwrite** the existing R2 objects without changing their public URLs or downstream paths.
4. **Streamline Approval → Automation** – Upon final approval, trigger an **n8n webhook** to begin the next stage (e.g., book product creation or publishing).
5. **Minimize Infrastructure Overhead** – Avoid unnecessary databases or complex batch logic in the MVP; support expansion later.

---

## **3. High-Level Workflow**

1. **Asset Generation (n8n)**

   - AI creates assets (e.g., images or illustrations).
   - n8n uploads each asset to R2 under a structured prefix (e.g., `projects/book-001/pages/01.png`).
   - n8n notifies the backend via webhook with metadata about the uploaded assets.

2. **Human Review (Dashboard)**

   - Reviewer visits `/review?prefix=projects/book-001/`.
   - Backend lists all assets under that prefix using **R2’s ListObjectsV2** API.
   - Each asset loads via **signed GET URL** for secure preview.
   - Reviewer can:
     - **View** asset preview
     - **Download** file
     - **Replace** an asset (uploads directly to R2 with **presigned PUT**, overwriting same key)

3. **Approval (Single Action)**

   - Reviewer clicks **Approve All** when everything looks good.
   - Backend sends **webhook POST** to n8n:
     ```json
     {
       "prefix": "projects/book-001/",
       "approvedAt": "2025-10-16T19:30:00Z",
       "reviewer": "jeff@thepeakbeyond.com"
     }
     ```
   - n8n begins the next workflow (product creation, packaging, publishing, etc.).

---

## **4. Core Components**

| Component                | Description                                                    | Technology Stack                            |
| ------------------------ | -------------------------------------------------------------- | ------------------------------------------- |
| **Frontend (Dashboard)** | Displays assets, allows preview/replace/approve actions        | Next.js (React), TailwindCSS or Mantine     |
| **Backend API**          | Handles R2 communication, presigned URLs, and webhook triggers | Next.js API routes or Express/Fastify       |
| **Storage Layer**        | Hosts all generated and replaced assets                        | Cloudflare R2 (S3-compatible API)           |
| **Workflow Automation**  | Handles asset creation and post-approval actions               | n8n                                         |
| **Authentication**       | Restricts access to reviewers                                  | NextAuth / Clerk / Auth0                    |
| **CDN Cache Management** | Refreshes replaced files instantly                             | Cloudflare API or query-based cache-busting |

---

## **5. Minimal Technical Architecture**

```plaintext
                ┌───────────────────┐
                │   n8n Workflow     │
                │ (Generates Assets) │
                └───────┬───────┘
                         │
                         ▼
               ┌──────────────────┐
               │  Cloudflare R2   │
               │ (Stores Assets)  │
               └───────┬───────┘
                       │  Signed GET/PUT
                       ▼
       ┌─────────────────────────────────────┐
       │  Review Dashboard (Next.js App)  │
       │  • Lists assets via /api/list    │
       │  • Replace via /api/presign-put  │
       │  • Approve triggers n8n webhook  │
       └─────────────────────────────────────┘
                       │
                       ▼
             ┌────────────────────────┐
             │  n8n Next Workflow      │
             │ (Book/Product Creation) │
             └────────────────────────┘
```

---

## **6. Key Interactions**

| Action            | API Endpoint            | Description                                                |
| ----------------- | ----------------------- | ---------------------------------------------------------- |
| **List Assets**   | `GET /api/list?prefix=` | Returns all assets under a prefix with signed preview URLs |
| **Replace Asset** | `POST /api/presign-put` | Returns a presigned PUT URL for overwriting an asset       |
| **Approve All**   | `POST /api/approve`     | Triggers an n8n webhook to begin the next workflow         |

---

## **7. Security & Access Control**

- Authentication required (reviewer login).
- Presigned URLs expire after 5–15 minutes.
- Only assets under approved prefixes are accessible.
- MIME type and key validation prevent unauthorized overwrites.
- Optional Cloudflare CDN purge on file replacement.

---

## **8. Future Expansion**

| Phase       | Enhancement                          | Description                                                                                                                                              |
| ----------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 2** | Reviewer Audit Log                   | Add database table to record approvals, replacements, timestamps, and reviewer info                                                                      |
| **Phase 2** | Inline Comparison                    | Add a “before vs. after” diff preview for replaced assets                                                                                                |
| **Phase 3** | Multi-Reviewer Workflow              | Introduce assignment, comments, and change requests                                                                                                      |
| **Phase 3** | Integration with Auth Roles          | Add roles like creator, reviewer, publisher                                                                                                              |
| **Phase 4** | Automated Notifications              | Slack/email alerts when new reviews are ready                                                                                                            |
| **Phase 5** | **Full Backend Dashboard Expansion** | Evolve this dashboard into a full backend system for **order management**, product tracking, asset libraries, and team collaboration across all projects |

---

## **9. Project Goals & Success Criteria**

- Human reviewers can easily view and replace AI assets **without touching R2 directly**
- File URLs remain **stable and reusable**
- Approval reliably triggers **n8n workflow**
- Interface is lightweight and intuitive
- Minimal maintenance and technical debt

---

## **10. Estimated Timeline (MVP)**

| Task                                            | Duration       | Notes                             |
| ----------------------------------------------- | -------------- | --------------------------------- |
| Backend setup (R2 SDK, presigned URL endpoints) | 1–2 days       | Includes signed GET/PUT setup     |
| Frontend dashboard (list + replace + approve)   | 2–3 days       | Focus on usability and simplicity |
| Auth integration                                | 0.5–1 day      | Basic reviewer login              |
| n8n webhook connection                          | 0.5 day        | Approval event trigger            |
| Cloudflare cache handling                       | 0.5 day        | Optional purge or cache-bust      |
| **Total (MVP)**                                 | **\~4–6 days** | Solo developer estimate           |

