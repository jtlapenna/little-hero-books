# Security Checklist

This checklist provides comprehensive security assessment criteria for GitHub repositories. Use this document during the audit process to ensure all security concerns are identified and addressed.

---

## Secrets Detection Checklist

### Hardcoded Secrets
- [ ] Search for common API key patterns:
  - [ ] `api_key`, `apikey`, `API_KEY`
  - [ ] `api_secret`, `api-secret`, `API_SECRET`
  - [ ] `access_token`, `access-token`, `ACCESS_TOKEN`
  - [ ] `secret_key`, `secret-key`, `SECRET_KEY`
  - [ ] `private_key`, `private-key`, `PRIVATE_KEY`

- [ ] Search for service-specific keys:
  - [ ] AWS: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
  - [ ] GitHub: `GITHUB_TOKEN`, `GH_TOKEN`
  - [ ] Stripe: `STRIPE_SECRET_KEY`, `STRIPE_API_KEY`
  - [ ] Database: Connection strings with passwords
  - [ ] n8n: `N8N_API_KEY`, `N8N_WEBHOOK_URL`
  - [ ] Cloudflare: `CLOUDFLARE_API_TOKEN`, `R2_ACCESS_KEY_ID`

- [ ] Search for credential patterns:
  - [ ] `password`, `passwd`, `pwd`
  - [ ] `credential`, `credentials`
  - [ ] `token`, `bearer`
  - [ ] `auth`, `authorization`

- [ ] Check common file locations:
  - [ ] Root directory config files
  - [ ] `.env` files (including `.env.local`, `.env.production`)
  - [ ] `config/` directories
  - [ ] `secrets/` directories
  - [ ] `credentials/` directories

### Environment Files
- [ ] Check for `.env` files:
  - [ ] `.env` present in repository (CRITICAL)
  - [ ] `.env.example` present (should be safe)
  - [ ] `.env.local` present
  - [ ] `.env.production` present
  - [ ] `.env.development` present

- [ ] Verify `.env.example` safety:
  - [ ] No real secrets in example file
  - [ ] Placeholder values used
  - [ ] Documentation explains how to set up

- [ ] Check for committed secrets:
  - [ ] Review git history for `.env` files
  - [ ] Check for removed but still in history
  - [ ] Use `git log --all --full-history -- .env` to find commits

### Configuration Files
- [ ] Review configuration files for secrets:
  - [ ] `config.json`, `config.yml`, `config.yaml`
  - [ ] `settings.json`, `settings.py`
  - [ ] `wrangler.toml` (Cloudflare Workers)
  - [ ] `package.json` (scripts may contain secrets)
  - [ ] `docker-compose.yml`
  - [ ] `kubernetes.yaml` or similar

- [ ] Check for hardcoded URLs with credentials:
  - [ ] Database connection strings
  - [ ] API endpoints with tokens
  - [ ] Service URLs with embedded credentials

### Git History
- [ ] Check git history for secrets:
  - [ ] Use `git log --all --full-history --source -S "api_key"` to search
  - [ ] Review recent commits for accidental commits
  - [ ] Check for large files that might contain data
  - [ ] Review merge commits carefully

- [ ] If secrets found in history:
  - [ ] Document all found secrets
  - [ ] Plan secret rotation
  - [ ] Consider using `git-filter-repo` to remove (if appropriate)
  - [ ] Note: Removing from history rewrites history (coordinate with team)

---

## Customer Data Exposure Risks

### Data Types to Check
- [ ] **Personal Information (PII):**
  - [ ] Names (first, last, full names)
  - [ ] Email addresses
  - [ ] Phone numbers
  - [ ] Physical addresses
  - [ ] Dates of birth
  - [ ] Social security numbers or national IDs

- [ ] **Customer Data:**
  - [ ] Order information
  - [ ] Purchase history
  - [ ] Customer preferences
  - [ ] Account information
  - [ ] User-generated content

- [ ] **Payment Information:**
  - [ ] Credit card numbers (even if masked)
  - [ ] Payment tokens
  - [ ] Billing addresses
  - [ ] Transaction IDs

- [ ] **Sensitive Business Data:**
  - [ ] Customer lists
  - [ ] Pricing information
  - [ ] Business strategies
  - [ ] Proprietary algorithms

### Data Storage Locations
- [ ] **In Code:**
  - [ ] Sample/test data with real information
  - [ ] Hardcoded customer examples
  - [ ] Mock data that might be real

- [ ] **In Files:**
  - [ ] CSV files with customer data
  - [ ] JSON files with customer information
  - [ ] Database dumps
  - [ ] Backup files

- [ ] **In Git History:**
  - [ ] Previously committed data files
  - [ ] Removed files that still exist in history
  - [ ] Large files that might contain data

- [ ] **In External Storage:**
  - [ ] R2 buckets (check permissions)
  - [ ] S3 buckets (check permissions)
  - [ ] Database connections (verify access)

### Data Processing Indicators
- [ ] **Code that processes customer data:**
  - [ ] Order processing functions
  - [ ] Payment processing code
  - [ ] Data transformation scripts
  - [ ] Reporting/analytics code

- [ ] **API endpoints that handle customer data:**
  - [ ] Customer creation endpoints
  - [ ] Order submission endpoints
  - [ ] Data retrieval endpoints
  - [ ] Update/modification endpoints

---

## Access Control Requirements

### Repository Access
- [ ] **Current access model:**
  - [ ] Public (anyone can view)
  - [ ] Private (only authorized users)
  - [ ] Internal (organization only)

- [ ] **Required access level:**
  - [ ] Based on data sensitivity
  - [ ] Based on business requirements
  - [ ] Based on compliance needs

### Service Access
- [ ] **n8n Workflow Access:**
  - [ ] How workflows access repository
  - [ ] Authentication method used
  - [ ] Impact of making repository private
  - [ ] Required changes for private access

- [ ] **R2 Bucket Access:**
  - [ ] Current bucket permissions
  - [ ] Public vs private access
  - [ ] Required access level
  - [ ] Authentication method

- [ ] **Database Access:**
  - [ ] Connection method
  - [ ] Credential storage
  - [ ] Access restrictions
  - [ ] Network security

### CI/CD Access
- [ ] **GitHub Actions:**
  - [ ] Secrets stored in GitHub Secrets
  - [ ] Workflow permissions
  - [ ] Repository access requirements
  - [ ] Impact of private repository

- [ ] **Other CI/CD Platforms:**
  - [ ] Access credentials
  - [ ] Repository access method
  - [ ] Required changes for private repo

---

## Compliance Considerations

### GDPR (General Data Protection Regulation)
- [ ] **Applies if:**
  - [ ] Processing data of EU residents
  - [ ] Offering services to EU customers
  - [ ] Storing EU customer data

- [ ] **Requirements:**
  - [ ] Data minimization (only collect needed data)
  - [ ] Consent management
  - [ ] Right to access/deletion
  - [ ] Data breach notification
  - [ ] Privacy by design

- [ ] **Current Compliance:**
  - [ ] Privacy policy in place
  - [ ] Consent mechanisms
  - [ ] Data access/deletion procedures
  - [ ] Breach notification process

### CCPA (California Consumer Privacy Act)
- [ ] **Applies if:**
  - [ ] Processing data of California residents
  - [ ] Meeting revenue thresholds
  - [ ] Handling California customer data

- [ ] **Requirements:**
  - [ ] Right to know what data is collected
  - [ ] Right to delete personal information
  - [ ] Right to opt-out of sale
  - [ ] Non-discrimination for exercising rights

- [ ] **Current Compliance:**
  - [ ] Privacy notice
  - [ ] Opt-out mechanisms
  - [ ] Data deletion procedures

### Other Regulations
- [ ] **HIPAA (if applicable):**
  - [ ] Healthcare data handling
  - [ ] Required safeguards

- [ ] **PCI DSS (if applicable):**
  - [ ] Payment card data handling
  - [ ] Security requirements

- [ ] **Industry-specific:**
  - [ ] Financial services regulations
  - [ ] Education data regulations
  - [ ] Other applicable regulations

---

## Dependency Security Review

### Package Dependencies
- [ ] **Review package.json/requirements.txt/etc.:**
  - [ ] Outdated packages with known vulnerabilities
  - [ ] Packages with security advisories
  - [ ] Unmaintained packages
  - [ ] Packages with suspicious activity

- [ ] **Dependency Management:**
  - [ ] Lock files present (package-lock.json, etc.)
  - [ ] Dependencies pinned to specific versions
  - [ ] Regular dependency updates
  - [ ] Automated security scanning

### Third-Party Services
- [ ] **Service Security:**
  - [ ] API security (authentication, rate limiting)
  - [ ] Data transmission security (HTTPS)
  - [ ] Service provider security practices
  - [ ] Service compliance certifications

- [ ] **Service Access:**
  - [ ] Credentials properly secured
  - [ ] Access limited to necessary permissions
  - [ ] Regular credential rotation
  - [ ] Monitoring and logging

### Infrastructure Security
- [ ] **Deployment Security:**
  - [ ] Secure deployment process
  - [ ] Environment separation (dev/staging/prod)
  - [ ] Access controls on deployment systems
  - [ ] Deployment logs and monitoring

- [ ] **Network Security:**
  - [ ] HTTPS/TLS encryption
  - [ ] Firewall rules
  - [ ] Network segmentation
  - [ ] DDoS protection

---

## R2 Storage Specific Checks

### Bucket Configuration
- [ ] **Bucket Permissions:**
  - [ ] Public read access (CRITICAL if customer data)
  - [ ] Public write access (CRITICAL)
  - [ ] Private access only
  - [ ] Authenticated access only

- [ ] **Bucket Policies:**
  - [ ] Review bucket policies
  - [ ] Verify CORS configuration
  - [ ] Check for overly permissive policies
  - [ ] Review access logs

### Data Stored
- [ ] **Content Analysis:**
  - [ ] Customer data stored (images, PDFs, etc.)
  - [ ] Order information
  - [ ] User uploads
  - [ ] System assets

- [ ] **Data Access:**
  - [ ] How data is accessed (public URLs vs authenticated)
  - [ ] Who can access the data
  - [ ] Access logging and monitoring

### Integration Points
- [ ] **Repository Integration:**
  - [ ] How repository accesses R2
  - [ ] Credentials used
  - [ ] Impact of repository becoming private

- [ ] **n8n Integration:**
  - [ ] How n8n workflows access R2
  - [ ] Required credentials
  - [ ] Impact of changes

---

## n8n Workflow Security

### Workflow Configuration
- [ ] **Workflow Access:**
  - [ ] How workflows access repositories
  - [ ] Authentication methods
  - [ ] Impact of repository privacy changes

- [ ] **Workflow Credentials:**
  - [ ] Where credentials are stored
  - [ ] How credentials are accessed
  - [ ] Credential security

### Workflow Logic
- [ ] **Data Processing:**
  - [ ] What customer data is processed
  - [ ] How data flows through workflows
  - [ ] Data storage locations
  - [ ] Data retention policies

- [ ] **Error Handling:**
  - [ ] Error logging (check for sensitive data)
  - [ ] Error notifications
  - [ ] Error recovery procedures

---

## Security Best Practices

### Code Security
- [ ] **Input Validation:**
  - [ ] All user inputs validated
  - [ ] SQL injection prevention
  - [ ] XSS prevention
  - [ ] CSRF protection

- [ ] **Error Handling:**
  - [ ] No sensitive data in error messages
  - [ ] Proper error logging
  - [ ] Error messages don't expose system info

### Secret Management
- [ ] **Current Practice:**
  - [ ] Secrets in environment variables
  - [ ] Secrets in secure storage (GitHub Secrets, etc.)
  - [ ] No hardcoded secrets
  - [ ] Secret rotation procedures

- [ ] **Improvements Needed:**
  - [ ] Implement secret management
  - [ ] Set up secret rotation
  - [ ] Remove hardcoded secrets
  - [ ] Audit secret access

### Monitoring and Logging
- [ ] **Security Monitoring:**
  - [ ] Access logs
  - [ ] Failed authentication attempts
  - [ ] Unusual activity patterns
  - [ ] Security alerts

- [ ] **Log Security:**
  - [ ] No secrets in logs
  - [ ] No customer data in logs
  - [ ] Log retention policies
  - [ ] Log access controls

---

## Checklist Completion

### For Each Repository
- [ ] All applicable sections completed
- [ ] All critical issues identified
- [ ] Risk score calculated
- [ ] Action items documented
- [ ] Remediation plan created

### Overall Assessment
- [ ] All repositories audited
- [ ] All critical issues addressed
- [ ] All secrets rotated
- [ ] All permissions reviewed
- [ ] Compliance verified
- [ ] Documentation complete

---

## Notes

- This checklist should be used in conjunction with the repository documentation template
- Mark items as not applicable (N/A) if they don't apply to the repository
- Document any findings in the repository documentation
- Prioritize critical security issues for immediate remediation
- Keep this checklist updated as security practices evolve

---

**Last Updated:** [YYYY-MM-DD]

