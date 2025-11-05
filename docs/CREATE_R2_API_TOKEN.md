# Create R2 API Token for Presigned URLs

## Step-by-Step Instructions

### 1. Create the Token in Cloudflare Dashboard

1. Go to Cloudflare Dashboard → **R2** → **Manage R2 API Tokens**
2. Click **"Create Account API token"** (blue button, top right)
3. Fill in the form:
   - **Token name:** `R2 Presigned URL Token - LHB`
   - **Permissions:** Select **"Admin Read & Write"** (for maximum compatibility)
   - **TTL:** Leave default (or set expiration if desired)
   - **Allowlist IPs:** Leave empty (unless you need IP restrictions)

### 2. Apply to Specific Buckets

1. Under **"Applied to"** section:
   - Select **"Specific buckets"** (not "All buckets")
   - Check the boxes for:
     - ✅ `little-hero-assets`
     - ✅ `little-hero-orders`
2. Click **"Continue to summary"**
3. Review and click **"Create API Token"**

### 3. Copy the Credentials

**⚠️ IMPORTANT: You will only see these once!**

After creating the token, Cloudflare will show:
- **Access Key ID** (starts with something like `320e3b...`)
- **Secret Access Key** (long random string)

**Copy both immediately** - you cannot retrieve the secret key later!

### 4. Add to `.env` File

Add these lines to your `.env` file (or update existing ones):

```env
# R2 Credentials for Presigned URL Generation
CLOUDFLARE_ACCOUNT_ID=3daae940fcb6fc5b8bbd9bb8fcc62854
R2_ACCESS_KEY_ID=<paste_access_key_id_here>
R2_SECRET_ACCESS_KEY=<paste_secret_access_key_here>
```

**Replace the placeholders with the actual values from step 3.**

### 5. Verify Token Permissions

The token should have:
- **Permission:** Admin Read & Write (or Object Read & Write minimum)
- **Applied to:** little-hero-assets, little-hero-orders
- **Status:** Active

### 6. Test the Token

After updating `.env`, we'll need to:
1. Rebuild and redeploy the backend
2. Test the signed URL API endpoint
3. Verify the presigned URLs work

## Notes

- **Admin Read & Write** is recommended for presigned URL generation to ensure all operations are allowed
- If you prefer least privilege, **Object Read & Write** should also work
- The token is tied to your Cloudflare account, not to a specific organization
- Keep the secret key secure - treat it like a password

## Next Steps After Creating Token

Once you've added the credentials to `.env`, let me know and I'll:
1. Test the signed URL generation
2. Verify the presigned URLs work with the new credentials
3. Update the backend deployment if needed

