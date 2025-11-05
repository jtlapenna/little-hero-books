# n8n Hardcoded Values Guide

**Date:** 2025-01-27  
**Context:** n8n instance doesn't support environment variables

---

## Security Assessment

### ✅ **Acceptable if:**
- Your n8n workflows are **NOT publicly accessible**
- Your n8n instance is **private/self-hosted** or behind authentication
- You have **access control** on your n8n instance
- You're comfortable with secrets in workflow JSON files

### ⚠️ **Security Considerations:**
- Secrets in code/workflows are less secure than environment variables
- Anyone with access to workflow JSON files can see the secrets
- If workflows are exported/shared, secrets are exposed
- Hard to rotate secrets (requires updating workflows)

### ✅ **Your Situation:**
- You mentioned n8n workflows are not publicly available ✅
- This makes hardcoded values **acceptable** for your use case
- Still recommended to rotate secrets periodically

---

## Implementation

### Code Node Example

Replace the environment variable approach with hardcoded values:

```javascript
// BEFORE (with env vars - doesn't work in your n8n):
const backendUrl = $env.BACKEND_API_URL || 'https://admin.littleherolabs.com';
const backendToken = $env.BACKEND_API_TOKEN || '';

// AFTER (with hardcoded values - works in your n8n):
const backendUrl = 'https://admin.littleherolabs.com';
const backendToken = 'YOUR_ACTUAL_BACKEND_API_TOKEN_HERE'; // Replace with your token

// Get signed URL from backend API
const signedUrlResponse = await this.helpers.request({
  method: 'GET',
  url: `${backendUrl}/api/r2/signed-url`,
  qs: {
    key: storageKey,
    bucket: 'little-hero-assets',
    expiresIn: 3600
  },
  headers: {
    'Authorization': `Bearer ${backendToken}`,
    'Content-Type': 'application/json'
  },
  json: true
});

const imageUrl = signedUrlResponse.url || signedUrlResponse.data?.url;
if (!imageUrl) {
  throw new Error('Failed to get signed URL from backend API. Response: ' + JSON.stringify(signedUrlResponse));
}
```

---

## Where to Get Your Token

Your `BACKEND_API_TOKEN` should be:
- The same value as in your backend `.env` file
- Set in `back-end/.env` as `BACKEND_API_TOKEN=your-token-here`
- Used by the backend API to authenticate requests

---

## Updating Workflows

### Step 1: Find Hardcoded R2 URLs
Search your workflows for:
- `https://pub-92cec53654f84771956bc84dfea65baa.r2.dev`
- `pub-92cec53654f84771956bc84dfea65baa`
- Direct R2 URL construction

### Step 2: Replace with Signed URL API Call
Use the code snippet above in Code nodes where you currently build R2 URLs.

### Step 3: Update Backend URL and Token
Replace:
- `'https://admin.littleherolabs.com'` with your actual backend URL
- `'YOUR_ACTUAL_BACKEND_API_TOKEN_HERE'` with your actual token

---

## Security Best Practices

### ✅ **Do:**
- Use hardcoded values only if workflows are private
- Rotate the token periodically (update all workflows when you do)
- Keep workflow JSON files secure (don't commit to public repos)
- Use different tokens for different environments if possible

### ❌ **Don't:**
- Commit workflow JSON files with hardcoded secrets to public repos
- Share workflow JSON files with hardcoded secrets
- Use the same token for multiple services if possible
- Leave old tokens in workflows after rotation

---

## Token Rotation Process

If you need to rotate your `BACKEND_API_TOKEN`:

1. **Generate new token** in backend
2. **Update backend `.env`** with new token
3. **Update all n8n workflows** with new token
4. **Test all workflows** to ensure they still work
5. **Deploy backend** with new token
6. **Remove old token** from backend

---

## Alternative: Custom Auth

If you mentioned "custom auth" as an option, you could:
- Use n8n's credential system to store the token
- Reference credentials in workflows instead of hardcoding
- This is more secure than hardcoded values

**Check if your n8n supports:**
- Custom credentials/nodes
- Credential storage
- Credential references in Code nodes

---

## Summary

**For your situation:**
- ✅ Hardcoded values are **acceptable** if workflows are private
- ✅ Use hardcoded `backendUrl` and `backendToken` in Code nodes
- ⚠️ Be aware of security implications
- ✅ Follow best practices for secret management

**Code Pattern:**
```javascript
const backendUrl = 'https://admin.littleherolabs.com';
const backendToken = 'your-actual-token-here';
```

---

**Next Steps:**
1. Get your `BACKEND_API_TOKEN` from `.env`
2. Update migration guide code examples with hardcoded values
3. Proceed with Phase 3 (n8n workflow updates)

