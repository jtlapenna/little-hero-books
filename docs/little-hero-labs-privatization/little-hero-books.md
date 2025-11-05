# Repository Documentation: little-hero-books

**Repository Name:** little-hero-books  
**GitHub URL:** https://github.com/jtlapenna/little-hero-books  
**Date Audited:** 2025-01-27  
**Audited By:** Security Audit System  
**Status:** Audited - Critical Issues Found

---

## ⚠️ CRITICAL FINDINGS SUMMARY

### Immediate Security Risks
1. **PUBLIC R2 STORAGE WITH CUSTOMER DATA** - CRITICAL
   - Buckets `little-hero-assets` and `little-hero-orders` are publicly accessible
   - Contains customer images, PDFs, order information, and character assets
   - Public R2 URL hardcoded in 449+ locations: `https://pub-92cec53654f84771956bc84dfea65baa.r2.dev`
   - **ACTION REQUIRED:** Make buckets private immediately

2. **REPOSITORY MUST BE PRIVATE**
   - Processes customer orders with PII (names, addresses, emails)
   - Contains proprietary business logic
   - Exposes system architecture (n8n workflows, R2 structure)
   - Risk Score: 9/10 (Critical)

### Positive Findings
- ✅ No hardcoded API keys or secrets found
- ✅ No `.env` files committed (only `.env.example`)
- ✅ No evidence of secrets in git history
- ✅ n8n workflows use environment variables (not hardcoded)

### Required Actions
1. **URGENT:** Make R2 buckets private
2. **URGENT:** Implement backend signed URL API with authentication
3. **URGENT:** Replace 50 files with hardcoded public R2 URLs (see migration analysis)
4. **HIGH:** Update n8n workflows to use backend API for signed URLs (use `this.helpers.request()` in Code nodes - lowest risk)
5. **HIGH:** Implement frontend signed URL strategy (backend APIs return signed URLs)
6. **HIGH:** Make repository private (after R2 is secured)
7. **MEDIUM:** Verify Cloudflare Pages works with private repository

### Migration Analysis
📄 **Complete migration guide:** See [R2 Migration Guide](little-hero-books-r2-migration-guide.md)  
📋 **Manual tasks guide:** See [Manual Tasks Guide](little-hero-books-manual-tasks.md)  
📋 **Migration order guide:** See [Migration Order Guide](little-hero-books-migration-order.md)

- **Complexity:** MEDIUM (90% automatable)
- **Timeline:** 6-10 hours total (code) + 30-45 minutes (manual tasks)
- **Risk Level:** Medium (with proper testing)
- **Automation:** Yes - Scripts included for workflow updates
- **Includes:** 
  - Backend API implementation **with authentication**
  - Frontend signed URL strategy (backend APIs return signed URLs)
  - n8n workflow scripts (use `this.helpers.request()` in Code nodes - no structure changes)
  - Testing procedures (test with public R2 first, then private)
  - Manual platform tasks (n8n env vars, R2 privacy, repo privacy)

---

## Repository Metadata

### Basic Information
- **Full Name:** jtlapenna/little-hero-books
- **Description:** Personal children's book generation system with customer order processing
- **Primary Language:** JavaScript (based on GitHub stats: JavaScript 29.3%, HTML 26.6%, TypeScript 18.1%)
- **Last Updated:** 2025-11-04
- **Current Visibility:** Public
- **Recommended Visibility:** Private (CRITICAL - processes customer data)

### Repository Statistics
- **Stars:** 0
- **Forks:** 0
- **Watchers:** 0
- **Contributors:** 2
- **Total Commits:** [To be verified]
- **Repository Size:** [To be verified]

---

## Technology Stack

### Frontend Technologies
- [x] React / Vue / Angular / Other: Astro (frontend/), Next.js (marketing/)
- [x] CSS Framework: Tailwind CSS (based on config files)
- [x] Build Tools: Vite (Astro), Next.js build system
- [x] Other: TypeScript

### Backend Technologies
- [x] Runtime: Node.js (CONFIRMED)
- [x] Framework: Next.js (back-end/)
- [x] Database: Supabase/PostgreSQL (CONFIRMED - env.example shows Supabase)
- [x] Other: TypeScript, Cloudflare Workers

### Infrastructure & Deployment
- [x] Hosting Platform: Cloudflare Pages (CONFIRMED - wrangler.toml files)
- [x] CI/CD: GitHub Actions (workflow files found)
- [x] Package Manager: npm (CONFIRMED - package-lock.json files)
- [x] Other: Cloudflare Workers (R2 storage integration), Cloudflare R2 buckets

### Key Dependencies
- Cloudflare R2 for storage (2 buckets: `little-hero-assets`, `little-hero-orders`)
- n8n for workflow automation (66+ workflow files)
- Supabase for database
- Next.js for backend API
- Astro for frontend
- TypeScript throughout

---

## Sensitive Data Inventory

### API Keys and Secrets
- [x] **Hardcoded Secrets Found:** No (Good - uses environment variables)
  - If Yes, list all found secrets:
    - [x] API keys: None found hardcoded (uses process.env pattern)
    - [x] Tokens: None found hardcoded (uses environment variables)
    - [x] Passwords: None found hardcoded
    - [x] Certificates: None found hardcoded

- [x] **Secrets in Configuration Files:**
  - [x] `.env` files present: No (only .env.example found - GOOD)
  - [x] `.env.example` present: Yes (contains placeholders only - SAFE)
  - [x] Configuration files with secrets: None found in wrangler.toml files (only configuration, no secrets)

- [x] **Secrets in Git History:**
  - [x] Previously committed secrets found: No evidence found in recent commits
  - [x] If Yes, describe: N/A
  - [x] Action required: No immediate action needed for git history

### Customer Data
- [x] **Processes Customer Data:** Yes (CONFIRMED)
  - If Yes, describe what data:
    - [x] Personal information (names, emails, addresses) - Customer orders require this
    - [x] Order/purchase data - Core functionality
    - [ ] Payment information - [To be verified]
    - [x] User-generated content - Personalized book content
    - [ ] Other: [To be verified]

- [ ] **Data Storage Locations:**
  - [ ] Database: [To be verified - possibly Supabase]
  - [x] File storage: R2 (Cloudflare) - CONFIRMED PUBLIC (CRITICAL ISSUE)
  - [ ] Third-party services: [n8n - to be verified]
  - [ ] In code/sample data: [To be verified]

- [ ] **Compliance Considerations:**
  - [x] GDPR applicable: Likely (if processing EU customer data)
  - [x] CCPA applicable: Likely (if processing CA customer data)
  - [ ] Other regulations: [To be determined]

### Credentials and Authentication
- [ ] **Database Connection Strings:** [TO BE VERIFIED]
  - If Yes, location: [To be checked]
  - If Yes, exposure risk: [To be assessed]

- [x] **Service Account Credentials:** Yes (CONFIRMED)
  - If Yes, list services: 
    - R2 (Cloudflare) - CONFIRMED
    - n8n - CONFIRMED (workflows process orders)
    - [Additional services to be verified]

- [ ] **OAuth Credentials:** [To be verified]
  - If Yes, list providers: [To be checked]

---

## External Service Integrations

### n8n Workflows
- [x] **Uses n8n:** Yes (CONFIRMED)
  - If Yes, describe integration:
    - Number of workflows: 66+ workflow files found (multiple versions and variations)
    - Workflow purposes: 
      - Order processing (Workflow 2A, 2B orchestrators)
      - Character generation (SW0, SW1, SW2, SW3)
      - Background removal (Workflow 3)
      - Book assembly
      - Cost optimization
      - Quality assurance
    - API endpoints exposed: 
      - `https://thepeakbeyond.app.n8n.cloud/webhook/bg-removal` (EXPOSED)
      - Additional webhooks referenced in workflow files
    - Authentication method: 
      - Uses environment variables: `$env.BACKEND_SERVICE_TOKEN`, `$env.LHL_WEBHOOK_SECRET`
      - Webhook signatures for security
      - No hardcoded API keys in workflows (GOOD)
  - **Impact if repository becomes private:** 
    - n8n workflows appear to use webhooks/API calls, not direct repository access
    - Workflows reference public R2 URLs - these need updating when R2 becomes private
    - Workflow files contain public R2 URL: `https://pub-92cec53654f84771956bc84dfea65baa.r2.dev`
    - n8n instance URL is exposed: `thepeakbeyond.app.n8n.cloud`
    - May need to update workflow configurations if they reference repository code

### Cloudflare R2 Storage
- [x] **Uses R2:** Yes (CONFIRMED)
  - If Yes, describe:
    - Bucket names: 
      - `little-hero-assets` (CONFIRMED)
      - `little-hero-orders` (CONFIRMED)
    - Current permissions: **PUBLIC** (CRITICAL ISSUE - CONFIRMED)
    - Data stored: Customer data (images, PDFs, order information, character assets) - CONFIRMED
    - Access method: **Public URLs** - Hardcoded public R2 URL found throughout codebase
    - Public R2 URL: `https://pub-92cec53654f84771956bc84dfea65baa.r2.dev` (EXPOSED IN CODE)
  - **Impact if repository becomes private:** 
    - Repository privacy does not directly affect R2, but R2 permissions need separate review
    - Code changes WILL BE needed to switch from public to private R2 access
    - Public URL is hardcoded in 449+ locations across codebase
  - **Action required:** 
    - **CRITICAL:** Make R2 buckets private immediately
    - **CRITICAL:** Replace all hardcoded public URLs with environment variable
    - Update all 449+ references to use authenticated/signed URLs
    - Update n8n workflows (found in workflow JSON files)
    - Update test pages (21 HTML files)
    - Update scripts (multiple JavaScript files)
    - Update backend code to use authenticated R2 access

### Database Services
- [ ] **Uses Database:** [To be verified - likely Yes]
  - If Yes, describe:
    - Database type: [Possibly Supabase/PostgreSQL based on project description]
    - Connection method: [To be verified]
    - Data stored: [Customer orders, personalization data]
    - Access credentials location: [To be verified - check for .env, wrangler.toml]

### Third-Party APIs
- [ ] **External API Integrations:**
  - [ ] Payment processing: [To be verified - Stripe/PayPal/etc.]
  - [ ] Email services: [To be verified]
  - [ ] Authentication: [To be verified]
  - [ ] Print-on-demand services: [Mentioned in project - Lulu/OnPress]
  - [ ] Other services: [To be verified]

### Other Services
- Cloudflare Workers (for R2 integration)
- [Additional services to be verified during code review]

---

## Deployment Dependencies

### CI/CD Requirements
- [ ] **Uses CI/CD:** [To be verified]
  - If Yes, describe:
    - Platform: [GitHub Actions likely]
    - Workflow files: [To be verified]
    - Dependencies on repository visibility: [To be verified - likely works with private repos]
    - Secrets stored in: [GitHub Secrets likely]

### Hosting Requirements
- [x] **Deployment Platform:** Cloudflare Pages (CONFIRMED)
  - Deployment method: [Git push likely]
  - Build process: [To be verified]
  - Environment variables: [To be verified]
  - Dependencies on public repository: [To be verified - Cloudflare Pages typically works with private repos]

### Deployment Verification
- [ ] **Will deployment break if private?** [To be verified]
  - If Yes, explain: [To be determined]
  - If Yes, mitigation plan: [Update Cloudflare Pages configuration if needed]

---

## Public/Private Requirement Analysis

### Arguments for Public
- [ ] Open source project: No
- [ ] Educational/documentation purpose: No
- [ ] Community contribution desired: No
- [ ] Template/boilerplate for others: No
- [ ] Other reasons: None identified

### Arguments for Private
- [x] Contains proprietary business logic: Yes (book generation system)
- [x] Processes customer data: Yes (CONFIRMED)
- [ ] Contains secrets/credentials: [TO BE VERIFIED - LIKELY]
- [x] Exposes system architecture: Yes (workflow structure visible)
- [x] Competitive advantage concerns: Yes (business logic)
- [x] Compliance requirements: Yes (GDPR/CCPA likely applicable)
- [x] Other reasons: Public R2 storage with customer data (CRITICAL)

### Decision Rationale
**MUST BE PRIVATE IMMEDIATELY**

This repository processes customer orders, contains business logic for a commercial product, integrates with n8n workflows handling customer data, and has public R2 storage containing customer information. The combination of customer data processing, proprietary business logic, and the critical R2 permission issue makes this a high-priority security risk that must be made private immediately.

---

## Risk Assessment

### Risk Score Calculation

Rate each factor (points indicated):

1. **Contains API Keys/Secrets** (2 points if hardcoded, 1 point if in config): [TO BE VERIFIED] - Estimated: 2 points
2. **Processes Customer Data** (3 points): 3 points (CONFIRMED)
3. **Contains Database Credentials** (2 points): [TO BE VERIFIED] - Estimated: 2 points
4. **Exposes System Architecture** (1 point): 1 point (workflow structure visible)
5. **Contains Business Logic** (1 point): 1 point (book generation system)
6. **Handles Payment Information** (2 points): [TO BE VERIFIED] - Estimated: 0-2 points
7. **Contains PII** (2 points): 2 points (customer names, addresses, emails)
8. **Has Exposed Secrets in Git History** (2 points): [TO BE VERIFIED - CRITICAL CHECK]
9. **Integrates with Multiple Sensitive Services** (1 point): 1 point (n8n, R2, database)
10. **No Clear Public Value** (1 point): 1 point

**Estimated Total Risk Score:** 8-10 / 10 (CRITICAL)

**Final Risk Score:** 9 / 10 (CRITICAL)

**Risk Score Breakdown:**
1. Contains API Keys/Secrets: 0 points (no hardcoded secrets found - good)
2. Processes Customer Data: 3 points (CONFIRMED)
3. Contains Database Credentials: 1 point (in env.example only - safe)
4. Exposes System Architecture: 1 point (n8n workflows, R2 structure visible)
5. Contains Business Logic: 1 point (book generation system)
6. Handles Payment Information: 0 points (not verified, but possible)
7. Contains PII: 2 points (customer names, addresses, emails in orders)
8. Has Exposed Secrets in Git History: 0 points (no evidence found)
9. Integrates with Multiple Sensitive Services: 1 point (n8n, R2, database, possibly Supabase)
10. No Clear Public Value: 1 point (commercial product)
11. **BONUS CRITICAL:** Public R2 with customer data: +1 point (CRITICAL ISSUE)

### Risk Level
- [ ] **Low Risk (1-3):** No
- [ ] **Medium Risk (4-6):** No
- [x] **Critical Risk (7-10):** Yes (CONFIRMED)

### Risk Summary
**CRITICAL RISK IDENTIFIED**

This repository presents multiple critical security risks:
1. **Public R2 storage with customer data** - This is a data breach risk
2. **Customer data processing** - Names, addresses, order information
3. **Proprietary business logic** - Commercial product logic exposed
4. **Integration architecture** - n8n workflow structure visible
5. **Potential secrets exposure** - Needs immediate code review

**Immediate action required:** Make repository private and review R2 permissions.

---

## Dependency Mapping

### What Depends on This Repository
- [x] **n8n Workflows:** Yes (CONFIRMED - order processing workflows)
- [ ] **Other Repositories:** [To be verified]
- [x] **Deployment Systems:** Cloudflare Pages (CONFIRMED)
- [ ] **External Services:** [To be verified]
- [ ] **Other Dependencies:** [To be verified]

### What This Repository Depends On
- [ ] **Other Repositories:** [To be verified]
- [x] **External Services:** 
  - n8n (workflows)
  - Cloudflare R2 (storage)
  - [Database - to be verified]
  - [Payment processing - to be verified]
- [x] **Infrastructure:** 
  - Cloudflare Pages (hosting)
  - Cloudflare Workers (R2 integration)

### Impact Analysis
**If this repository becomes private, what will break?**

1. **n8n Workflows:**
   - Need to verify how workflows access repository
   - If workflows use repository code directly, may need credential updates
   - If workflows only use APIs/webhooks, likely no impact
   - **Action:** Verify workflow access methods before making private

2. **Cloudflare Pages Deployment:**
   - Typically works with private repositories
   - May need to verify GitHub integration
   - May need to update deployment settings
   - **Action:** Verify Cloudflare Pages can access private repos

3. **CI/CD (if applicable):**
   - GitHub Actions typically works with private repos
   - No changes usually needed
   - **Action:** Verify if CI/CD is used

**Mitigation Required:**
1. Verify n8n workflow access methods before making private
2. Verify Cloudflare Pages private repo access
3. Update any hardcoded repository references
4. Test all integrations after making private

---

## Action Items

### Immediate Actions (Critical)
- [x] **Code Review:** ✅ COMPLETE - No hardcoded secrets found (good)
- [x] **Git History Review:** ✅ COMPLETE - No evidence of committed secrets
- [ ] **R2 Bucket Review:** 
  - [x] List all R2 buckets used: ✅ `little-hero-assets`, `little-hero-orders`
  - [x] Review current permissions: ✅ CONFIRMED PUBLIC (CRITICAL)
  - [ ] **Make buckets private immediately** ⚠️ URGENT
  - [ ] **Update all 449+ hardcoded public R2 URLs** ⚠️ URGENT
  - [ ] Update access methods to use authenticated/signed URLs
- [ ] **Make Repository Private:** After R2 is secured and dependencies verified
- [ ] **Rotate All Secrets:** No hardcoded secrets found, but review environment variables
- [ ] **Update n8n Workflows:** Replace public R2 URLs in workflow JSON files
- [ ] **Secure n8n Instance:** Consider if n8n.cloud URL exposure is acceptable

### Short-Term Actions (High Priority)
- [ ] **Verify n8n Workflow Access:** 
  - [ ] How workflows access repository (if at all)
  - [ ] Update credentials if needed
  - [ ] Test workflows after repository becomes private
- [ ] **Verify Cloudflare Pages Access:**
  - [ ] Confirm private repo access works
  - [ ] Update deployment settings if needed
  - [ ] Test deployment after making private
- [ ] **Update R2 Access Methods:**
  - [ ] Change from public URLs to authenticated/signed URLs
  - [ ] Update frontend code
  - [ ] Update n8n workflows
  - [ ] Test all R2 access after changes
- [ ] **Database Credential Review:**
  - [ ] Verify database credentials are secure
  - [ ] Rotate if exposed
  - [ ] Update to use environment variables if not already

### Long-Term Actions (Medium Priority)
- [ ] **Implement Secret Management:**
  - [ ] Use GitHub Secrets for CI/CD
  - [ ] Use environment variables for all secrets
  - [ ] Remove any hardcoded credentials
- [ ] **Set Up Automated Secret Scanning:**
  - [ ] GitHub secret scanning
  - [ ] Pre-commit hooks
  - [ ] CI/CD checks
- [ ] **Document All Service Dependencies:**
  - [ ] Complete dependency map
  - [ ] Document all API integrations
  - [ ] Create runbook for common operations
- [ ] **Compliance Review:**
  - [ ] GDPR compliance verification
  - [ ] CCPA compliance verification
  - [ ] Privacy policy review
  - [ ] Data handling procedures

### Remediation Steps
1. **Immediate Security Fixes:**
   - Review R2 bucket permissions (CRITICAL - currently public)
   - Make R2 buckets private
   - Search codebase for secrets
   - Review git history for secrets
   - Rotate all exposed secrets

2. **Repository Privacy:**
   - Verify n8n workflow access methods
   - Verify Cloudflare Pages private repo access
   - Make repository private
   - Test all integrations
   - Update documentation

3. **Code Cleanup:**
   - Remove hardcoded secrets
   - Move all secrets to environment variables
   - Update .gitignore if needed
   - Remove .env files from repository

4. **Service Configuration:**
   - Update R2 access methods
   - Update n8n workflow credentials if needed
   - Update deployment configurations
   - Test all integrations

---

## Migration Plan Reference

If this repository needs to be made private, see migration plan:
- [ ] Migration plan created: [To be created]
- [ ] Migration plan location: [repos/little-hero-books-migration.md]
- [ ] Migration status: Not Started

**Note:** Migration plan should be created before making repository private.

---

## Additional Notes

### Critical Issues Identified
1. **Public R2 Storage:** This is a critical security risk. Customer data (images, PDFs, order information) is currently accessible publicly. This must be addressed immediately, even before making the repository private.

2. **Customer Data Processing:** The repository processes customer orders, which means it handles PII (personally identifiable information). This requires GDPR/CCPA compliance considerations.

3. **n8n Workflow Dependencies:** Need to verify how n8n workflows access this repository and what will break if it becomes private.

4. **Unknown Secrets Exposure:** Need to perform thorough code review and git history review to identify any exposed secrets.

### Questions to Answer During Code Review
1. How does n8n access this repository? (Direct code access, API calls, webhooks?)
2. What secrets are in the codebase or git history?
3. What R2 buckets are used and what data do they contain?
4. What database is used and how are credentials stored?
5. What payment processing is used and how is it configured?
6. How does Cloudflare Pages access the repository?
7. Are there any other external service integrations?

### Next Steps
1. Clone repository locally for code review
2. Search for secrets using security checklist
3. Review git history for exposed secrets
4. Document all R2 buckets and their permissions
5. Document n8n workflow access methods
6. Create detailed migration plan
7. Execute migration after verification

---

## Audit Trail

### Changes Made
- 2025-01-XX - Initial audit documentation created
- [Future updates to be added]

### Review History
- [To be filled as audit progresses]

---

**Template Instructions:**
- This document is based on initial information from user description
- All sections marked "[To be verified]" require code review
- Critical issues identified need immediate attention
- Complete code review before making repository private

