# Cloudflare Pages Deployment Troubleshooting

## Current Issue
Build succeeds, but deployment fails with "Failed to publish assets" during upload phase.

## Diagnostic Results
- **Files**: 188 files
- **Total Size**: 9.1MB (within limits)
- **Largest File**: handler.mjs at 4.7MB (⚠️ potential issue)
- **All critical files verified**: ✅

## Root Cause Hypothesis
The 4.7MB `handler.mjs` file may be causing Cloudflare Pages' upload mechanism to fail. This is a bundled Next.js server function that includes all dependencies.

## Solution: Direct Wrangler Deployment

Since Cloudflare Pages auto-deploy is failing, use direct Wrangler deployment:

### Step 1: Install Wrangler (if not already installed)
```bash
npm install -g wrangler
# or
cd back-end && npm install wrangler --save-dev
```

### Step 2: Authenticate
```bash
wrangler login
```

### Step 3: Build and Deploy
```bash
cd back-end
npm run pages:build
npm run pages:deploy
```

### Step 4: Set up CI/CD (GitHub Actions)
Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Cloudflare Pages

on:
  push:
    branches: [main]
    paths:
      - 'back-end/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - name: Install dependencies
        run: |
          cd back-end
          npm ci
      - name: Build
        run: |
          cd back-end
          npm run pages:build
      - name: Deploy
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: back-end
          command: pages deploy .open-next/cloudflare --project-name=little-hero-labs-admin
```

## Alternative: Optimize handler.mjs

If direct deployment also fails, we may need to:
1. Split the handler into smaller chunks
2. Use dynamic imports
3. Reduce bundle size

## Contact Cloudflare Support

If issues persist, contact Cloudflare with:
- Error ID: 92e39527-7287-4eb8-ba9c-463a65e3de3a
- Deployment ID from latest failure
- Diagnostic output showing 4.7MB handler.mjs file

