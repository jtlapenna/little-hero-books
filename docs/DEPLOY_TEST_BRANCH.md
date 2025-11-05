# Deploy and Test from Test Branch

## Quick Options

### Option 1: Use GitHub Actions (Automatic)
The workflow `.github/workflows/deploy-cloudflare-pages-preview.yml` will automatically deploy when you push to `feat/r2-privatization`.

**Steps:**
1. Push your changes:
   ```bash
   git push origin feat/r2-privatization
   ```

2. Check GitHub Actions:
   - Go to: https://github.com/jtlapenna/little-hero-books/actions
   - Find the "Deploy Preview to Cloudflare Pages" workflow
   - Wait for it to complete

3. The deployment will be available at:
   - Production URL: `https://admin.littleherolabs.com` (if same project)
   - Or check Cloudflare Pages dashboard for preview URL

---

### Option 2: Manual Deployment (Faster for Testing)

**Prerequisites:**
- Wrangler CLI installed: `npm install -g wrangler` or `cd back-end && npm install`
- Authenticated: `npx wrangler login`

**Steps:**
```bash
# Make sure you're on the test branch
git checkout feat/r2-privatization

# Navigate to back-end
cd back-end

# Build
npm install
npm run pages:build

# Deploy (to preview/production)
npx wrangler pages deploy .open-next/cloudflare --project-name=bright-gift
```

**Test the deployment:**
```bash
# Test signed URL API
export BACKEND_API_TOKEN="your-token-from-env"
curl "https://admin.littleherolabs.com/api/r2/signed-url?key=book-mvp-simple-adventure/backgrounds/page01-twilight-walk.png&bucket=little-hero-assets" \
  -H "Authorization: Bearer ${BACKEND_API_TOKEN}"
```

---

## Testing Checklist

After deployment:

1. **Test Public URL (should return 401/403):**
   ```bash
   curl -I "https://pub-92cec53654f84771956bc84dfea65baa.r2.dev/book-mvp-simple-adventure/backgrounds/page01-twilight-walk.png"
   ```

2. **Test Signed URL API (should return 200 with signed URL):**
   ```bash
   export BACKEND_API_TOKEN="your-actual-token"
   curl "https://admin.littleherolabs.com/api/r2/signed-url?key=book-mvp-simple-adventure/backgrounds/page01-twilight-walk.png&bucket=little-hero-assets&expiresIn=3600" \
     -H "Authorization: Bearer ${BACKEND_API_TOKEN}"
   ```

3. **Test Signed URL (should return 200):**
   ```bash
   # Extract signed URL from step 2, then:
   curl -I "<signed-url-from-step-2>"
   ```

---

## Notes

- **Preview deployments** don't affect production
- The test branch deployment will use the same environment variables as production
- If you need different env vars for testing, set them in Cloudflare Pages dashboard → Settings → Environment variables → Preview


