# Little Hero Books - Project Status Summary

## Project Overview
**Little Hero Books** is a personalized children's book service that generates custom stories through Amazon Custom listings and automated print-on-demand fulfillment. The tagline is "Every child is the hero of their own story."

**Target Age**: 3-7 years old  
**Story Theme**: The Adventure Compass (magical journey through enchanted locations)  
**MVP Constraints**: Single SKU - 8×10 softcover, 16 pages (14 interior + covers), U.S. shipping only

## Technical Architecture
- **Frontend**: Next.js 15.5.6 (React 19) with TypeScript
- **Backend**: Next.js API routes
- **Deployment**: Cloudflare Pages (using OpenNext adapter for Next.js → Cloudflare conversion)
- **Storage**: Cloudflare R2 for character assets and order manifests
- **Database**: Supabase (PostgreSQL)
- **Automation**: n8n workflows for order processing
- **POD**: Print-on-demand integration (Lulu, OnPress)

## Current Deployment Status

### ✅ What's Working
- **Build Process**: Fully functional - builds complete successfully
- **Build Output**: 192 files, 9.5MB total size (optimized)
- **Direct Wrangler Deployment**: Successfully deployed via `npm run pages:deploy`
- **File Structure**: All critical files verified and correctly placed

### ❌ Current Challenges
1. **Cloudflare Pages Auto-Deploy Fails**: Automatic deployments from GitHub fail with "Failed to publish assets" error during upload phase
2. **Worker Runtime Errors**: Deployed site shows "Error 1101: Worker threw exception" when accessing pages
3. **R2 Integration**: Test orders not appearing on admin dashboard (R2 connection needs verification)

## Recent Deployment Issues & Solutions

### Issue 1: Build Failures
**Problem**: Multiple build failures due to:
- Missing `customization-utils.ts` module
- OpenNext config validation errors
- Missing `functions: {}` field in config

**Solution**: 
- Created stub `customization-utils.ts`
- Added `functions: {}` to `open-next.config.ts`
- Fixed all TypeScript compilation errors

### Issue 2: Output Directory Structure
**Problem**: Cloudflare Pages couldn't find output directory `.open-next/cloudflare`

**Solution**: 
- Created `postbuild.sh` script to reorganize OpenNext output
- Copies `worker.js` → `_worker.js`, maintains directory structure
- Creates `_routes.json` for static routing

### Issue 3: Node Modules in Deployment
**Problem**: Deploying 1,670 files (36MB) including `node_modules` directories

**Solution**:
- Updated postbuild script to exclude `node_modules` using `rsync` or `find` fallback
- Added cleanup step to remove any remaining `node_modules`
- Reduced output to 192 files (9.5MB)

### Issue 4: Import Resolution Errors
**Problem**: `Could not resolve "./server-functions/default/handler.mjs"` during deployment

**Solution**:
- Fixed path transformation bug in `find` fallback (strips `.open-next/server-functions/` prefix)
- Added import verification step to postbuild script
- All critical imports now verified before deployment

### Issue 5: Cloudflare Pages Upload Failure
**Problem**: Build succeeds, but "Failed to publish assets" error during upload

**Solution**:
- Bypassed Pages auto-deploy by using direct Wrangler deployment
- Added `version: 1` to `_routes.json` (required field)
- Corrected project name from `little-hero-labs-admin` to `bright-gift`

**Current Status**: Direct deployment works, but site shows "Worker threw exception" errors

## Current Worker Runtime Error

### Error Details
- **Error Code**: 1101
- **Message**: "Worker threw exception"
- **Affected URLs**: 
  - `00d0d08e.bright-gift.pages.dev`
  - `admin.littleherolabs.com/review`
  - `6356388e.little-hero-labs-admin.pages.dev`

### Likely Causes
1. Missing environment variables in Cloudflare Pages
2. R2 client configuration issues (missing credentials)
3. Import/module resolution issues at runtime
4. Edge runtime compatibility issues with Next.js code

### Next Steps Needed
1. Check Cloudflare Pages Workers Logs for detailed error messages
2. Verify environment variables are set in Cloudflare Pages dashboard
3. Test R2 connectivity with diagnostic endpoint (`/api/debug/r2-diagnostic`)
4. Review edge runtime compatibility for Next.js API routes

## Key Files & Scripts

### Build Scripts
- `back-end/scripts/postbuild.sh` - Reorganizes OpenNext output for Cloudflare Pages
- `back-end/scripts/verify-build.sh` - Verifies build output structure
- `back-end/scripts/analyze-output.sh` - Analyzes output directory (file counts, sizes)
- `back-end/scripts/diagnose-worker-imports.sh` - Checks _worker.js imports
- `back-end/scripts/verify-worker-imports.sh` - Validates all imports can resolve
- `back-end/scripts/pre-upload-diagnostic.sh` - Pre-upload analysis

### Configuration Files
- `back-end/open-next.config.ts` - OpenNext adapter configuration
- `wrangler.toml` - Cloudflare Pages/Workers configuration
- `back-end/next.config.ts` - Next.js configuration

### NPM Scripts
- `npm run pages:build` - Builds Next.js app and runs postbuild script
- `npm run pages:deploy` - Deploys directly using Wrangler (bypasses auto-deploy)
- `npm run pages:verify` - Verifies build output
- `npm run pages:analyze` - Analyzes output directory
- `npm run pages:diagnose` - Diagnoses worker imports
- `npm run pages:pre-upload` - Runs pre-upload diagnostic

## R2 Integration Status

### Current Setup
- **Buckets**: 
  - `little-hero-assets` (public assets)
  - `little-hero-orders` (order manifests)
- **Prefix**: `book-mvp-simple-adventure/order-generated-assets/characters/`
- **Client**: AWS SDK S3Client configured for R2

### Known Issues
- Test orders not appearing on admin dashboard
- `/api/orders` endpoint returns empty array
- R2 connection may need verification

### Diagnostic Tools
- `/api/debug/r2-diagnostic` - Comprehensive R2 connectivity check
- `/api/debug/r2-get` - Test R2 file retrieval
- R2 service functions in `back-end/src/lib/r2-service.ts`

## Deployment Workflow

### Current (Working)
1. Build locally: `cd back-end && npm run pages:build`
2. Deploy manually: `npm run pages:deploy`
3. Site deploys successfully but shows runtime errors

### Automated (GitHub Actions)
- Workflow file: `.github/workflows/deploy-cloudflare-pages.yml`
- Requires secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- Not yet configured (secrets need to be added)

### Cloudflare Pages Auto-Deploy
- Currently failing with "Failed to publish assets" error
- Build succeeds, upload fails
- May be Cloudflare infrastructure issue

## Critical Environment Variables Needed

### For Cloudflare Pages
- `R2_ACCESS_KEY_ID` - Cloudflare R2 access key
- `R2_SECRET_ACCESS_KEY` - Cloudflare R2 secret key
- `CLOUDFLARE_ACCOUNT_ID` or `R2_ACCOUNT_ID` - Account ID for R2 endpoint
- `R2_PUBLIC_BUCKET_NAME` or `R2_ASSETS_BUCKET_NAME` - Public assets bucket
- `R2_ORDERS_BUCKET_NAME` - Orders bucket name
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key

## File Structure

```
back-end/
├── .open-next/cloudflare/          # Build output (Cloudflare Pages)
│   ├── _worker.js                  # Main worker entry point
│   ├── _routes.json                # Static routing config
│   ├── server-functions/           # Server-side Next.js functions
│   │   └── default/
│   │       └── handler.mjs        # 4.7MB bundled server handler
│   ├── cloudflare/                 # Cloudflare-specific files
│   ├── middleware/                 # Next.js middleware
│   ├── assets/                     # Static assets
│   └── _next/static/               # Next.js static files
├── scripts/
│   ├── postbuild.sh               # Post-build reorganization
│   ├── verify-build.sh            # Build verification
│   ├── analyze-output.sh          # Output analysis
│   ├── diagnose-worker-imports.sh  # Import diagnosis
│   └── pre-upload-diagnostic.sh   # Pre-upload analysis
├── src/
│   ├── app/                        # Next.js app directory
│   │   ├── api/                   # API routes
│   │   │   ├── orders/            # Order management
│   │   │   ├── webhooks/          # n8n webhook handlers
│   │   │   └── debug/             # Diagnostic endpoints
│   │   └── orders/                # Order pages
│   └── lib/                       # Shared utilities
│       ├── r2-config.ts           # R2 client configuration
│       ├── r2-service.ts          # R2 interaction functions
│       └── auth.ts                # Authentication utilities
└── open-next.config.ts            # OpenNext adapter config
```

## Next Immediate Priorities

1. **Fix Worker Runtime Errors**
   - Check Cloudflare Workers Logs for detailed error messages
   - Verify environment variables are set in Cloudflare Pages dashboard
   - Test with minimal route to isolate the issue

2. **Verify R2 Integration**
   - Test `/api/debug/r2-diagnostic` endpoint
   - Verify R2 credentials are correct
   - Check if orders exist in R2 buckets

3. **Set Up Automated Deployment**
   - Add Cloudflare API token and account ID to GitHub secrets
   - Enable GitHub Actions workflow
   - Test automated deployment

4. **Debug Worker Exception**
   - Review worker logs for stack traces
   - Check if it's related to missing environment variables
   - Verify edge runtime compatibility

## Key Learnings

1. **Cloudflare Pages auto-deploy has upload issues** - Direct Wrangler deployment works better
2. **OpenNext output structure is complex** - Requires careful post-build reorganization
3. **Large bundled files (4.7MB handler.mjs)** may cause issues - but deployment succeeds
4. **Diagnostic tools are essential** - Multiple scripts help identify issues quickly

## Commands Reference

```bash
# Build
cd back-end && npm run pages:build

# Deploy directly
cd back-end && npm run pages:deploy

# Verify build
cd back-end && npm run pages:verify

# Analyze output
cd back-end && npm run pages:analyze

# Diagnose imports
cd back-end && npm run pages:diagnose

# Check R2 diagnostic
curl https://your-site.pages.dev/api/debug/r2-diagnostic
```

## Contact Information
- **Repository**: `jtlapenna/little-hero-books`
- **Project Name**: `bright-gift` (Cloudflare Pages)
- **Custom Domain**: `admin.littleherolabs.com`

