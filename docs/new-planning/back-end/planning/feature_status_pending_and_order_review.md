# Feature Status – Pending Reviews and Order Review Pages

## Original Ideas (from user)
- Pending Reviews page may have large queues → need scalable view
- Toggle between card and list views
- Search and sorting
- Staged review: Pre‑Bria, Post‑Bria, Post‑PDF
- Each image downloadable or replaceable (overwrite in place)
- Group approval per stage; unlock “Initiate next workflow”
- Post‑Bria: toggle black background to inspect white edges
- Optional inline edge‑removal tool (nice to have)
- PDF preview and approval in Post‑PDF
- Flag items needing attention; bubble counts to tabs and lists
- Lists/cards show current stage and elapsed time since submission

## Built Now (current implementation)
- Pending Reviews
  - Card/List toggle, search, sorting (order date, first/last name, platform)
  - Order count in header; responsive layout
- Order Review
  - Full‑width order banner under order ID
  - Full‑width tabs for Pre‑Bria, Post‑Bria, Post‑PDF
  - Pre‑Bria: Base character + 12 poses, per‑asset download/replace, flag
  - Post‑Bria: Same as Pre‑Bria, plus black background toggle for QA
  - Post‑PDF: PDF info + preview placeholder, download, flag, final approval
  - Image Lightbox: download, replace, flag, optional black background
  - Stage approval; after approve → “Initiate Next Workflow” enabled

## Completed ✅
- Persist and surface "Needs Attention" across app (tabs, orders list, pending list)
- Click anywhere on image card to expand (not just button)
- Flag toggle available both on card and in lightbox
- Stage tab badges show flagged counts; stage status → Needs Attention when flagged
- Orders and Pending lists show "Needs Attention (N)" with stage info
- Elapsed time since order submission on lists/cards
- R2 integration (list, signed GET/PUT, replace in place)
- Sequential approval workflow with persistent storage
- Search functionality for order ID and character hash
- Site branding updated to "Little Hero Labs"
- Improved text readability in search and dropdowns
- **Error Handling & Monitoring System** ✅
  - Comprehensive error logging with 10 error types and severity levels
  - Real-time monitoring dashboard at `/monitoring`
  - Health check endpoints (`/api/health`, `/api/errors`)
  - Service health monitoring (R2, n8n, Database, File System)
  - Performance metrics tracking (memory, CPU, uptime)
  - Error management with resolution tracking
  - API wrapper for consistent error handling

## V1 Remaining / Next
- User authentication and role-based access control
- Database integration (replace file-based approval store)
- Email notifications for order status changes
- Asset validation (file type, size, format checks)
- Order processing queue management
- Order history and audit trail
- n8n integration (initiate next workflow; approvals)

## V1.1 Planned
- Webhook retry logic with exponential backoff
- Image optimization and caching
- CDN integration for asset delivery
- Automated testing suite
- Health check endpoints
- Enhanced UI/UX with toast notifications
- Loading states and progress indicators
- Keyboard shortcuts for power users

## Future (V2+)
- Optional inline edge‑removal tooling
- Asset versioning and rollback capability
- Bulk operations
- Advanced analytics and reporting



