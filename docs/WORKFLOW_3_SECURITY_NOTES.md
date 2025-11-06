# Workflow 3 Security & Configuration Notes

## Critical Security Issue: Hardcoded API Tokens

**Status:** ⚠️ **REQUIRES MANUAL FIX**

### Issue

The workflow contains hardcoded PDFMonkey API tokens in multiple nodes:
- `Poll PDFMonkey until ready` (line ~153)
- `Generate Page Image with PDFMonkey` (line ~329)
- `Poll PDFMonkey Image until ready` (line ~352)

**Current Token:** `Bearer 2zpxHdmsse2ECXgVVtVR`

### Impact

- API token is visible in workflow JSON file
- Token could be exposed if workflow is shared or version controlled
- No rotation mechanism
- Cannot use different tokens per environment

### Recommended Fix

1. **Use n8n Credentials System:**
   - In n8n, go to Settings → Credentials
   - Create a new "Header Auth" credential with:
     - Name: "PDFMonkey API"
     - Header Name: "Authorization"
     - Header Value: "Bearer {YOUR_TOKEN}"
   - Replace all hardcoded tokens with credential reference

2. **Or Use Environment Variables:**
   - Set `PDFMONKEY_API_TOKEN` in n8n environment variables
   - Update code nodes to use: `process.env.PDFMONKEY_API_TOKEN`

### Nodes Requiring Updates

1. **Poll PDFMonkey until ready** (line ~153):
   ```javascript
   // Replace:
   const AUTH_HEADER = { Authorization: 'Bearer 2zpxHdmsse2ECXgVVtVR' };
   
   // With:
   const AUTH_HEADER = { Authorization: `Bearer ${process.env.PDFMONKEY_API_TOKEN || $credentials.pdfMonkeyApiToken.value}` };
   ```

2. **Generate Page Image with PDFMonkey** (HTTP Request node, line ~329):
   - Replace hardcoded header value with credential reference

3. **Poll PDFMonkey Image until ready** (line ~352):
   - Same fix as #1

## Template ID Configuration

**Status:** ✅ **FIXED** (with proper error handling)

The image template ID now:
- Checks `order.pdfMonkeyImageTemplateId` first
- Falls back to `process.env.PDFMONKEY_IMAGE_TEMPLATE_ID`
- Throws clear error if neither is provided

See `docs/MANUAL_STEPS_PDFMONKEY_PREVIEW_IMAGES.md` for setup instructions.

## Other Security Best Practices

1. ✅ Using backend proxy URLs (prevents direct R2 exposure)
2. ✅ Manifest schema validation (prevents invalid data injection)
3. ✅ Input validation for required fields
4. ⚠️ No rate limiting on PDFMonkey API calls
5. ⚠️ No retry logic with exponential backoff

## Priority

**CRITICAL:** Fix API token hardcoding before production deployment.

