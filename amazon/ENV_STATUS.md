# Amazon SP-API Middleware - Environment Status

**Date**: December 6, 2025  
**Status**: ⚠️ **PARTIALLY CONFIGURED** - Missing Refresh Tokens

---

## ✅ **What's Configured**

### Sandbox Credentials
- ✅ `AMZ_LWA_CLIENT_ID_SANDBOX` - Present (61 chars)
- ✅ `AMZ_LWA_CLIENT_SECRET_SANDBOX` - Present (80 chars)
- ❌ `AMZ_LWA_REFRESH_TOKEN_SANDBOX` - **MISSING**

### Production Credentials
- ✅ `AMZ_LWA_CLIENT_ID_PROD` - Present (61 chars)
- ✅ `AMZ_LWA_CLIENT_SECRET_PROD` - Present (80 chars)
- ❌ `AMZ_LWA_REFRESH_TOKEN_PROD` - **MISSING**

### Configuration
- ✅ `AMAZON_SANDBOX_MODE=true` - Set (sandbox mode active)
- ✅ `AMZ_MARKETPLACE_ID=ATVPDKIKX0DER` - Set
- ✅ `AMZ_REGION=na` - Set
- ✅ `BACKEND_API_URL=https://admin.littleherolabs.com` - Set

---

## ⚠️ **Legacy Variables Found**

The following legacy variables are present in your `.env` file:
- `AMZ_REFRESH_TOKEN` - May be sandbox or production token
- `AMAZON_SP_API_CLIENT_ID` - Legacy format
- `AMAZON_SP_API_CLIENT_SECRET` - Legacy format
- `AMAZON_SP_API_REFRESH_TOKEN` - Legacy format

**Question**: Is `AMZ_REFRESH_TOKEN` a sandbox or production token?

---

## 🔧 **What's Needed**

### Option 1: Use Legacy Token Temporarily (Quick Test)

If `AMZ_REFRESH_TOKEN` is a sandbox token, you can temporarily add:

```bash
# In .env file
AMZ_LWA_REFRESH_TOKEN_SANDBOX=${AMZ_REFRESH_TOKEN}
```

Then test sandbox connectivity.

### Option 2: Get Separate Tokens (Recommended)

You need to get refresh tokens for both sandbox and production from Amazon Solution Provider Portal:

1. **Sandbox App**: "Little Hero Labs Sandbox"
   - Go to: https://developer.amazonservices.com
   - Find your sandbox app
   - Get the refresh token
   - Add to `.env`: `AMZ_LWA_REFRESH_TOKEN_SANDBOX=Atzr|...`

2. **Production App**: "Little Hero Labs Production"
   - Go to: https://developer.amazonservices.com
   - Find your production app
   - Get the refresh token
   - Add to `.env`: `AMZ_LWA_REFRESH_TOKEN_PROD=Atzr|...`

---

## ✅ **Tests Performed**

### 1. Environment Check
```bash
cd amazon && node check-env.js
```
**Result**: ✅ Script runs successfully, identifies missing variables

### 2. Middleware Startup
```bash
cd amazon && npm start
```
**Result**: ✅ Middleware starts successfully on port 4000

### 3. Health Endpoint
```bash
curl http://localhost:4000/health
```
**Result**: ✅ Returns health status correctly
```json
{
  "ok": true,
  "service": "little-hero-books-amazon-middleware",
  "version": "2.0.0",
  "environment": "sandbox",
  "amazonConfig": {
    "hasSandboxCreds": true,
    "hasProdCreds": true,
    "currentMode": "sandbox"
  }
}
```

### 4. Sandbox Test Endpoint
```bash
curl http://localhost:4000/test-sandbox
```
**Result**: ❌ Fails with "Missing LWA credentials for sandbox" (expected - no refresh token)

---

## 📋 **Next Steps**

### Immediate (To Test Sandbox)

1. **Determine if legacy token is sandbox or production:**
   - Check Amazon Solution Provider Portal
   - Or test with sandbox endpoint

2. **Add refresh token to .env:**
   ```bash
   # If AMZ_REFRESH_TOKEN is sandbox:
   AMZ_LWA_REFRESH_TOKEN_SANDBOX=${AMZ_REFRESH_TOKEN}
   
   # Or get new sandbox token from portal
   AMZ_LWA_REFRESH_TOKEN_SANDBOX=Atzr|your_sandbox_token_here
   ```

3. **Test sandbox connectivity:**
   ```bash
   cd amazon
   npm start
   # In another terminal:
   curl http://localhost:4000/test-sandbox
   ```

### For Production

1. **Get production refresh token** from "Little Hero Labs Production" app
2. **Add to .env:**
   ```bash
   AMZ_LWA_REFRESH_TOKEN_PROD=Atzr|your_production_token_here
   ```
3. **Switch to production mode:**
   ```bash
   AMAZON_ENV=production
   # or
   AMAZON_SANDBOX_MODE=false
   ```

---

## 🧪 **Testing Commands**

Once refresh tokens are added:

```bash
# 1. Start middleware
cd amazon && npm start

# 2. Test health (should work)
curl http://localhost:4000/health

# 3. Test sandbox connectivity (requires sandbox refresh token)
curl http://localhost:4000/test-sandbox

# 4. Test order processing (requires valid order ID)
curl -X POST "http://localhost:4000/orders/ORDER-ID/process?useSandbox=true"
```

---

## 📝 **Summary**

**Current Status**: 
- ✅ Middleware code is complete and working
- ✅ Client IDs and secrets are configured
- ❌ Refresh tokens are missing (blocking API calls)

**Action Required**: 
- Add `AMZ_LWA_REFRESH_TOKEN_SANDBOX` to test sandbox
- Add `AMZ_LWA_REFRESH_TOKEN_PROD` for production

**Estimated Time to Complete**: 
- 5-10 minutes to get tokens from Amazon portal
- 1 minute to add to .env file
- 2 minutes to test

