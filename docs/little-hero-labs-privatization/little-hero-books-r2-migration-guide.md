# R2 Private Migration Guide - little-hero-books

**Repository:** little-hero-books  
**Date:** 2025-01-27  
**Status:** Ready for Implementation  
**Priority:** CRITICAL - Security Issue

---

## Executive Summary

### The Problem
- Public R2 buckets (`little-hero-assets`, `little-hero-orders`) contain customer data
- Hardcoded public R2 URL in 50 files: `https://pub-92cec53654f84771956bc84dfea65baa.r2.dev`
- n8n workflows pass public URLs to Bria API (external service)
- When R2 becomes private, these URLs will fail (403 Forbidden)

### The Solution
1. Make R2 buckets private
2. Implement backend API for signed URL generation
3. Update n8n workflows to use signed URLs
4. Update backend service to use signed URLs
5. Clean up or update test files (determine if needed)

### Complexity: MEDIUM
- **Automation Potential:** 90%+ automatable
- **Total Time:** 6-10 hours
- **Risk Level:** Medium (with proper testing)

---

## Phase 1: Assessment & Cleanup

### Task 1.1: Determine Test Files Usage

**Action:** Analyze test pages and scripts to determine if they're still needed.

**Files to Evaluate:**
- `test-pages/*.html` (15 files)
- `scripts/*.js` containing hardcoded R2 URLs (5 files)
- `docs/**/*.md` with hardcoded URLs (2 files)

**Decision Criteria:**
1. **Check git history:**
   ```bash
   # When were these files last modified?
   git log --oneline --all -- test-pages/ scripts/
   
   # Are they referenced in documentation?
   grep -r "test-pages\|scripts/" README.md docs/ --include="*.md"
   ```

2. **Check for references:**
   ```bash
   # Are test pages referenced in code?
   grep -r "test-pages" --include="*.ts" --include="*.js" --include="*.json"
   
   # Are scripts referenced in package.json or other configs?
   grep -r "scripts/" package.json *.json
   ```

3. **Decision Matrix:**
   - **Delete if:** Not modified in 6+ months AND not referenced anywhere
   - **Keep if:** Used in development, testing, or documentation
   - **Update if:** Actively used - update to use environment variables or signed URLs

**Action Items:**
- [ ] Run assessment commands
- [ ] Document findings
- [ ] Delete unused files (if any)
- [ ] Mark remaining files for update priority

---

## Phase 2: Backend Signed URL Implementation

### Task 2.1: Create Signed URL API Endpoint

**File:** `back-end/src/app/api/r2/signed-url/route.ts`

**Implementation:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { r2Client, R2_PUBLIC_BUCKET, R2_ORDERS_BUCKET } from '@/lib/r2-config';
import { verifyBearerAuth } from '@/lib/auth';

/**
 * Generate signed URL for R2 object access
 * 
 * ⚠️ CRITICAL: This endpoint requires authentication to prevent unauthorized access
 * 
 * Query Parameters:
 * - key: R2 object key (required)
 * - bucket: Bucket name (optional, defaults to R2_PUBLIC_BUCKET)
 * - expiresIn: Expiration time in seconds (optional, defaults to 3600)
 * 
 * Headers:
 * - Authorization: Bearer <BACKEND_API_TOKEN> (REQUIRED)
 * 
 * Returns: { url: string, expiresIn: number }
 */
export async function GET(request: NextRequest) {
  // CRITICAL: Require authentication
  const auth = verifyBearerAuth(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error || 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    const bucket = searchParams.get('bucket') || R2_PUBLIC_BUCKET;
    const expiresIn = parseInt(searchParams.get('expiresIn') || '3600', 10);
    
    // Validation
    if (!key) {
      return NextResponse.json(
        { error: 'key parameter is required' },
        { status: 400 }
      );
    }
    
    if (expiresIn < 60 || expiresIn > 604800) {
      return NextResponse.json(
        { error: 'expiresIn must be between 60 and 604800 seconds (1 week)' },
        { status: 400 }
      );
    }
    
    // Validate bucket name
    const validBuckets = [R2_PUBLIC_BUCKET, R2_ORDERS_BUCKET];
    if (!validBuckets.includes(bucket)) {
      return NextResponse.json(
        { error: `Invalid bucket name. Must be one of: ${validBuckets.join(', ')}` },
        { status: 400 }
      );
    }
    
    // Generate signed URL
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });
    
    const signedUrl = await getSignedUrl(r2Client, command, { expiresIn });
    
    // Log for audit trail (optional, but recommended)
    console.log(`[Signed URL API] Generated signed URL for ${bucket}/${key}, expires in ${expiresIn}s`);
    
    return NextResponse.json({
      url: signedUrl,
      expiresIn,
      bucket,
      key,
      generatedAt: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('[Signed URL API] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate signed URL',
        message: error?.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}
```

**Required Changes:**
- [ ] Create route file at `back-end/src/app/api/r2/signed-url/route.ts`
- [ ] **CRITICAL:** Add authentication middleware (REQUIRED - use `verifyBearerAuth` from `@/lib/auth`)
- [ ] Add rate limiting (recommended - consider using middleware or service limits)
- [ ] Add logging/audit trail (for security monitoring)
- [ ] Write unit tests
- [ ] **IMPORTANT:** Ensure `BACKEND_API_TOKEN` environment variable is set

**Dependencies:**
- Ensure `@aws-sdk/s3-request-presigner` is installed
- Ensure R2 client is properly configured

---

### Task 2.2: Update R2 Service to Use Signed URLs

**File:** `back-end/src/lib/r2-service.ts`

**Current Issue (Line 32):**
```typescript
const url = `https://pub-${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.dev/${R2_PUBLIC_BUCKET}/${key}`;
```

**Required Changes:**
1. Create signed URL helper function
2. Update `getCharacterAssets()` to return signed URLs
3. Update all API endpoints that return R2 URLs

**Implementation:**
```typescript
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';

/**
 * Generate signed URL for R2 object
 */
export async function getSignedUrlForObject(
  bucket: string,
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  
  return await getSignedUrl(r2Client, command, { expiresIn });
}

/**
 * Update getCharacterAssets to use signed URLs
 */
export async function getCharacterAssets(characterHash: string): Promise<CharacterAsset[]> {
  const prefix = `${R2_CHARACTERS_PREFIX}${characterHash}/`;
  const res = await r2Client.send(new ListObjectsV2Command({
    Bucket: R2_PUBLIC_BUCKET,
    Prefix: prefix,
  }));

  const items = (res.Contents || []).filter(o => !!o.Key).map(o => o.Key as string);

  const assets: CharacterAsset[] = await Promise.all(
    items.map(async (key) => {
      const file = key.split('/').pop() || '';
      const poseMatch = file.match(/(pose[-_]?)(\d+)/i) || key.match(/\/(\d+)[^/]*$/);
      const poseNumber = poseMatch ? parseInt(poseMatch[2] || poseMatch[1], 10) || 0 : 0;
      const lower = key.toLowerCase();
      const type: CharacterAsset['assetType'] = lower.includes('final')
        ? 'final'
        : (lower.includes('bg-removed') || lower.includes('background-removed'))
          ? 'background-removed'
          : 'original';

      // Generate signed URL instead of public URL
      const url = await getSignedUrlForObject(R2_PUBLIC_BUCKET, key, 3600);

      return { characterHash, poseNumber, url, assetType: type };
    })
  );

  return assets;
}
```

**Action Items:**
- [ ] Create `getSignedUrlForObject()` helper function
- [ ] Update `getCharacterAssets()` to use signed URLs
- [ ] Update all other functions returning R2 URLs
- [ ] Update API endpoints (`/api/orders`, etc.)
- [ ] Test signed URL generation
- [ ] Test URL expiration handling

---

### Task 2.3: Frontend Signed URL Strategy

**Problem:** Frontend needs to display images from R2, but signed URLs expire. Need a strategy for getting and refreshing signed URLs.

**Solution Options:**

**Option A: Backend API Endpoints Return Signed URLs (RECOMMENDED)**
- Backend API endpoints (e.g., `/api/orders/[orderId]`) already generate signed URLs
- Frontend receives signed URLs directly from backend
- No additional frontend code needed
- URLs expire, but backend can refresh on next API call

**Implementation:**
- Backend API endpoints that return image URLs should use `getSignedUrlForObject()` instead of public URLs
- Frontend displays URLs as-is
- When URLs expire, frontend makes new API call to get fresh signed URLs

**Example Backend API Response:**
```typescript
// In /api/orders/[orderId]/route.ts
const assets = await getCharacterAssets(characterHash);
// assets[].url is already a signed URL (from Task 2.2)
return NextResponse.json({ assets });
```

**Option B: Frontend Calls Signed URL API Directly**
- Frontend makes separate API calls to `/api/r2/signed-url` for each image
- Requires authentication token in frontend
- More complex but gives more control

**Implementation:**
```typescript
// Frontend code
async function getSignedUrl(key: string, bucket: string = 'little-hero-assets') {
  const response = await fetch(`/api/r2/signed-url?key=${key}&bucket=${bucket}`, {
    headers: {
      'Authorization': `Bearer ${BACKEND_API_TOKEN}` // Store securely
    }
  });
  const data = await response.json();
  return data.url;
}
```

**Option C: Proxy Endpoint for Frontend**
- Create a public endpoint that generates signed URLs without requiring auth
- Less secure but simpler for frontend
- **Not recommended** - exposes signed URL generation publicly

**Recommended Approach:**
Use **Option A** - Backend APIs already return signed URLs. This is the simplest and most secure approach.

**Action Items:**
- [ ] Update all backend API endpoints to return signed URLs (already covered in Task 2.2)
- [ ] Verify frontend receives signed URLs from backend APIs
- [ ] Test image loading with signed URLs
- [ ] Implement URL refresh mechanism if needed (e.g., refresh on image load error)
- [ ] Test URL expiration handling

---

## Phase 3: n8n Workflow Updates

**⚠️ IMPORTANT:** Do NOT run workflow updates until Phase 2 (Backend API) is complete and tested. Updated workflows will break if the backend API doesn't exist yet.

**Workflow Status During Updates:**
- **Before updates:** Workflows use public R2 URLs (work fine with public buckets)
- **After updates:** Workflows call backend API for signed URLs (need backend API to exist)
- **Testing:** You can test updated workflows with public R2 buckets first, then make buckets private

### Task 3.1: Create Workflow Update Script

**File:** `scripts/update-n8n-workflows-for-private-r2.js`

**Purpose:** Automatically update n8n workflow JSON files to use backend API for signed URLs

**Script:**
```javascript
#!/usr/bin/env node

/**
 * Update n8n workflow files to use signed URLs instead of public R2 URLs
 * 
 * Usage: node scripts/update-n8n-workflows-for-private-r2.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

const PUBLIC_R2_URL = 'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev';
const BACKEND_API_URL_PLACEHOLDER = '{{$env.BACKEND_API_URL}}';
const BACKEND_API_TOKEN_PLACEHOLDER = '{{$env.BACKEND_API_TOKEN}}';

const DRY_RUN = process.argv.includes('--dry-run');

// Patterns to find and replace
const REPLACEMENT_PATTERNS = [
  // Direct URL assignments
  {
    pattern: /const\s+PUBLIC_BASE\s*=\s*['"]https:\/\/pub-92cec53654f84771956bc84dfea65baa\.r2\.dev['"]/g,
    replacement: `const PUBLIC_BASE = $env.BACKEND_API_URL || 'https://your-backend.com'`
  },
  {
    pattern: /const\s+DEFAULT_R2\s*=\s*['"]https:\/\/pub-92cec53654f84771956bc84dfea65baa\.r2\.dev['"]/g,
    replacement: `const DEFAULT_R2 = $env.BACKEND_API_URL || 'https://your-backend.com'`
  },
  {
    pattern: /publicR2Url\s*\?\?\s*['"]https:\/\/pub-92cec53654f84771956bc84dfea65baa\.r2\.dev['"]/g,
    replacement: `publicR2Url ?? ($env.BACKEND_API_URL || 'https://your-backend.com')`
  },
  // URL construction patterns
  {
    pattern: /['"]https:\/\/pub-92cec53654f84771956bc84dfea65baa\.r2\.dev['"]/g,
    replacement: '($env.BACKEND_API_URL || \'https://your-backend.com\')'
  }
];

/**
 * Generate code snippet for getting signed URL from backend
 * 
 * ✅ RECOMMENDED: Use this.helpers.request() in Code nodes (no workflow structure changes)
 * This is the safest approach - keeps existing workflow structure intact.
 */
function generateSignedUrlCode(storageKeyVar = 'storageKey', bucketVar = 'bucket') {
  return `
// Get signed URL from backend API using this.helpers.request()
// This is the RECOMMENDED approach - no workflow structure changes needed
const backendUrl = $env.BACKEND_API_URL || 'https://admin.littleherolabs.com';
const backendToken = $env.BACKEND_API_TOKEN || '';

const signedUrlResponse = await this.helpers.request({
  method: 'GET',
  url: \`\${backendUrl}/api/r2/signed-url\`,
  qs: {
    key: ${storageKeyVar},
    bucket: ${bucketVar} || 'little-hero-assets',
    expiresIn: 3600
  },
  headers: {
    'Authorization': \`Bearer \${backendToken}\`,
    'Content-Type': 'application/json'
  },
  json: true
});

const signedUrl = signedUrlResponse.url || signedUrlResponse.data?.url;
if (!signedUrl) {
  throw new Error('Failed to get signed URL from backend API. Response: ' + JSON.stringify(signedUrlResponse));
}
const imageUrl = signedUrl;`;
}

/**
 * Generate HTTP Request node configuration for signed URL API
 * This is OPTION B - only use if this.helpers.request() doesn't work in your n8n version
 * RECOMMENDED: Use Option A (this.helpers.request() in Code nodes) instead
 */
function generateHttpRequestNodeConfig() {
  return {
    type: 'n8n-nodes-base.httpRequest',
    parameters: {
      method: 'GET',
      url: '={{ $env.BACKEND_API_URL }}/api/r2/signed-url',
      options: {
        queryParameters: {
          parameters: [
            {
              name: 'key',
              value: '={{ $json.storageKey || $json.r2Path || $json.key }}'
            },
            {
              name: 'bucket',
              value: '={{ $json.bucket || "little-hero-assets" }}'
            },
            {
              name: 'expiresIn',
              value: '3600'
            }
          ]
        },
        headers: {
          parameters: [
            {
              name: 'Authorization',
              value: '={{ "Bearer " + $env.BACKEND_API_TOKEN }}'
            },
            {
              name: 'Content-Type',
              value: 'application/json'
            }
          ]
        }
      }
    }
  };
}

/**
 * Update workflow JSON file
 */
function updateWorkflowFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  let updated = false;
  let updatedContent = content;
  
  try {
    const workflow = JSON.parse(content);
    
    // Find all Code nodes
    if (workflow.nodes && Array.isArray(workflow.nodes)) {
      workflow.nodes.forEach((node, index) => {
        if (node.type === 'n8n-nodes-base.code' && node.parameters?.jsCode) {
          let jsCode = node.parameters.jsCode;
          let nodeUpdated = false;
          
          // Check if code contains hardcoded R2 URL
          if (jsCode.includes(PUBLIC_R2_URL)) {
            console.log(`  Found hardcoded URL in node: ${node.name || node.id}`);
            
            // Replace simple patterns
            REPLACEMENT_PATTERNS.forEach(({ pattern, replacement }) => {
              if (pattern.test(jsCode)) {
                jsCode = jsCode.replace(pattern, replacement);
                nodeUpdated = true;
              }
            });
            
            // If URL is used for Bria API or image access, add signed URL generation
            if (jsCode.includes('bria') || jsCode.includes('Bria') || 
                jsCode.includes('imageUrl') || jsCode.includes('fileUrl')) {
              // Look for URL construction patterns
              const urlConstructionPattern = /(?:const\s+|let\s+)?(imageUrl|fileUrl|publicUrl|sourceUrl)\s*=\s*[^;]+pub-92cec53654f84771956bc84dfea65baa[^;]*;/g;
              
              if (urlConstructionPattern.test(jsCode)) {
                // Add signed URL generation before URL construction
                const signedUrlCode = generateSignedUrlCode();
                jsCode = jsCode.replace(
                  urlConstructionPattern,
                  (match) => {
                    // Extract variable name
                    const varMatch = match.match(/(imageUrl|fileUrl|publicUrl|sourceUrl)/);
                    const varName = varMatch ? varMatch[1] : 'imageUrl';
                    return signedUrlCode.replace('imageUrl', varName);
                  }
                );
                nodeUpdated = true;
              }
            }
            
            if (nodeUpdated) {
              workflow.nodes[index].parameters.jsCode = jsCode;
              updated = true;
            }
          }
        }
      });
    }
    
    if (updated) {
      updatedContent = JSON.stringify(workflow, null, 2);
      return { updated: true, content: updatedContent };
    }
    
    return { updated: false, content: null };
    
  } catch (error) {
    console.error(`  Error parsing JSON: ${error.message}`);
    return { updated: false, error: error.message };
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🔍 Searching for n8n workflow files...\n');
  
  const workflowFiles = await glob('docs/n8n-workflow-files/**/*.json', {
    ignore: ['**/node_modules/**']
  });
  
  console.log(`Found ${workflowFiles.length} workflow files\n`);
  
  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No files will be modified\n');
  }
  
  const results = {
    updated: [],
    skipped: [],
    errors: []
  };
  
  for (const filePath of workflowFiles) {
    console.log(`Processing: ${filePath}`);
    
    const result = updateWorkflowFile(filePath);
    
    if (result.error) {
      console.log(`  ❌ Error: ${result.error}\n`);
      results.errors.push({ file: filePath, error: result.error });
    } else if (result.updated) {
      console.log(`  ✅ Updated\n`);
      
      if (!DRY_RUN) {
        // Create backup
        const backupPath = filePath + '.backup';
        fs.copyFileSync(filePath, backupPath);
        
        // Write updated content
        fs.writeFileSync(filePath, result.content, 'utf8');
        console.log(`  📝 Backup created: ${backupPath}\n`);
      }
      
      results.updated.push(filePath);
    } else {
      console.log(`  ⏭️  No changes needed\n`);
      results.skipped.push(filePath);
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('SUMMARY');
  console.log('='.repeat(50));
  console.log(`✅ Updated: ${results.updated.length}`);
  console.log(`⏭️  Skipped: ${results.skipped.length}`);
  console.log(`❌ Errors: ${results.errors.length}`);
  
  if (DRY_RUN) {
    console.log('\n⚠️  This was a dry run. Run without --dry-run to apply changes.');
  }
  
  if (results.updated.length > 0) {
    console.log('\n📋 Updated files:');
    results.updated.forEach(file => console.log(`  - ${file}`));
  }
  
  if (results.errors.length > 0) {
    console.log('\n❌ Files with errors:');
    results.errors.forEach(({ file, error }) => console.log(`  - ${file}: ${error}`));
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { updateWorkflowFile, generateSignedUrlCode };
```

**Action Items:**
- [ ] **WAIT:** Ensure backend API is implemented and tested first (Phase 2)
- [ ] Create script file
- [ ] Install dependencies: `npm install glob`
- [ ] Run in dry-run mode: `node scripts/update-n8n-workflows-for-private-r2.js --dry-run`
- [ ] Review changes
- [ ] Run without dry-run to apply changes
- [ ] Validate JSON files after update
- [ ] **Test workflows with public R2 buckets** (before making buckets private)
- [ ] Verify workflows can get signed URLs from backend API

---

### Task 3.2: Manual n8n Workflow Updates

**✅ SAFE APPROACH: Use `this.helpers.request()` in Code Nodes**

**This is the RECOMMENDED approach** - it keeps existing workflow structure intact and doesn't require adding new nodes.

**Option A: Update Code Node Directly (RECOMMENDED - LOWEST RISK)**

Replace direct URL construction with `this.helpers.request()` call to backend API:

```javascript
// BEFORE: Direct URL construction
const publicR2Url = 'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev';
const imageUrl = `${publicR2Url}/${storageKey}`;

// AFTER: Get signed URL from backend API
const backendUrl = $env.BACKEND_API_URL || 'https://admin.littleherolabs.com';
const backendToken = $env.BACKEND_API_TOKEN || '';

// Get signed URL from backend
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

**Benefits:**
- ✅ No workflow structure changes
- ✅ No new nodes to add
- ✅ Works with existing Code nodes
- ✅ Already proven in your codebase (see `docs/amazon/sp-api-integration-code.md`)
- ✅ Lower risk of breaking workflows

**Option B: Use HTTP Request Node (If you prefer node-based approach)**

If you prefer to use HTTP Request nodes instead of Code nodes:
1. Add an **HTTP Request node** before the Code node that needs the signed URL
2. Configure HTTP Request node:
   - **Method:** GET
   - **URL:** `={{ $env.BACKEND_API_URL }}/api/r2/signed-url`
   - **Query Parameters:**
     - `key`: `={{ $json.storageKey || $json.r2Path }}`
     - `bucket`: `={{ $json.bucket || "little-hero-assets" }}`
     - `expiresIn`: `3600`
   - **Headers:**
     - `Authorization`: `={{ "Bearer " + $env.BACKEND_API_TOKEN }}`
     - `Content-Type`: `application/json`
3. In the Code node, access the response:
   ```javascript
   const signedUrlResponse = $input.first().json;
   const imageUrl = signedUrlResponse.url || signedUrlResponse.data?.url;
   ```

**⚠️ Note:** Option B requires adding new nodes and changing workflow structure, which is higher risk.

**Update Pattern for Workflows:**

1. **BEFORE: Direct URL construction**
   ```javascript
   const publicR2Url = 'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev';
   const imageUrl = `${publicR2Url}/${storageKey}`;
   ```

2. **AFTER: Use this.helpers.request() in Code node (RECOMMENDED)**
   ```javascript
   // Get signed URL from backend API
   const signedUrlResponse = await this.helpers.request({
     method: 'GET',
     url: \`\${$env.BACKEND_API_URL}/api/r2/signed-url\`,
     qs: { key: storageKey, bucket: 'little-hero-assets', expiresIn: 3600 },
     headers: { 'Authorization': \`Bearer \${$env.BACKEND_API_TOKEN}\` },
     json: true
   });
   const imageUrl = signedUrlResponse.url;
   ```
   - ✅ **No workflow structure changes needed**
   - ✅ **Just update the Code node code**
   - ✅ **Lowest risk approach**

3. **Critical workflows to update:**
   - Workflow 2A (Character Generation) - HIGH PRIORITY
   - Workflow 2B (Background Removal) - HIGH PRIORITY
   - Workflow 3 (Book Assembly) - MEDIUM PRIORITY

**Action Items:**
- [ ] Run automated script first (will update Code nodes to use `this.helpers.request()`)
- [ ] Manually review critical workflows
- [ ] Verify `this.helpers.request()` works in your n8n version (test with one workflow first)
- [ ] Test each updated workflow in n8n
- [ ] Update workflow documentation

**⚠️ Testing Recommendation:**
Test `this.helpers.request()` with one workflow first before updating all workflows. If it doesn't work in your n8n version, fall back to Option B (HTTP Request nodes).

---

### Task 3.3: Update n8n Environment Variables

**⚠️ CRITICAL TIMING:** Do this **BEFORE** testing workflows. Environment variables must be set before workflows can use them.

**Required Variables:**
- `BACKEND_API_URL` - Your backend API URL (e.g., `https://admin.littleherolabs.com`)
- `BACKEND_API_TOKEN` - Authentication token for backend API (REQUIRED - backend API requires Bearer token)

**Action Items:**
- [ ] Log into n8n UI
- [ ] Go to Settings > Environment Variables
- [ ] Add `BACKEND_API_URL` (set to your backend domain)
- [ ] Add `BACKEND_API_TOKEN` (set to your `BACKEND_API_TOKEN` value)
- [ ] **IMPORTANT:** Verify variables are accessible in workflows (test with a simple workflow)
- [ ] **DO NOT** test workflows until variables are set (workflows will fail without them)

**📄 Detailed Instructions:** See [Manual Tasks Guide](little-hero-books-manual-tasks.md) - Phase 3

---

## Phase 4: R2 Bucket Privacy Update

**📄 Manual Tasks:** See [Manual Tasks Guide](little-hero-books-manual-tasks.md) for detailed step-by-step instructions

### Task 4.1: Make R2 Buckets Private

**Platform:** Cloudflare Dashboard  
**Reference:** See Manual Tasks Guide - Phase 1

**Quick Steps:**
1. Log into Cloudflare Dashboard
2. Navigate to R2 Object Storage
3. Select `little-hero-assets` bucket
4. Settings > Public Access > Disable
5. Repeat for `little-hero-orders` bucket
6. Verify buckets are private

**Action Items:**
- [ ] Make `little-hero-assets` private (see Manual Tasks Guide)
- [ ] Make `little-hero-orders` private (see Manual Tasks Guide)
- [ ] Verify public URLs return 403
- [ ] Test signed URLs still work

**⚠️ Important:** Do this AFTER backend API and workflows are updated and tested.

---

## Phase 5: Testing & Verification

### Task 5.1: Backend API Testing

**Test Script:** `scripts/test-signed-url-api.js`

```javascript
const https = require('https');

const BACKEND_URL = process.env.BACKEND_API_URL || 'http://localhost:3000';
const API_TOKEN = process.env.BACKEND_API_TOKEN || '';

async function testSignedUrl(key, bucket = 'little-hero-assets') {
  const url = new URL(`${BACKEND_URL}/api/r2/signed-url`);
  url.searchParams.set('key', key);
  url.searchParams.set('bucket', bucket);
  url.searchParams.set('expiresIn', '3600');
  
  return new Promise((resolve, reject) => {
    const req = https.get(url.toString(), {
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(new Error(`Invalid JSON: ${data}`));
        }
      });
    });
    
    req.on('error', reject);
  });
}

// Test cases
async function runTests() {
  console.log('Testing signed URL API...\n');
  
  const testKey = 'book-mvp-simple-adventure/order-generated-assets/characters/test-hash/pose01.png';
  
  try {
    const result = await testSignedUrl(testKey);
    console.log('✅ Success:', result);
    console.log('\n📋 Signed URL:', result.url);
    console.log('⏰ Expires in:', result.expiresIn, 'seconds');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

runTests();
```

**Action Items:**
- [ ] Create test script
- [ ] Test signed URL generation
- [ ] Verify URLs expire correctly
- [ ] Test error handling

---

### Task 5.2: n8n Workflow Testing

**Test Checklist:**
- [ ] Workflow 2A can get signed URLs
- [ ] Bria API receives valid signed URLs
- [ ] Bria API can download images successfully
- [ ] Workflow 2B processes correctly
- [ ] Workflow 3 receives valid URLs
- [ ] Signed URLs expire correctly
- [ ] Error handling works for expired URLs
- [ ] All workflows complete successfully
- [ ] No broken URLs in workflow logs

**Action Items:**
- [ ] Test each critical workflow end-to-end
- [ ] Monitor workflow execution logs
- [ ] Verify Bria API calls succeed
- [ ] Check for any 403 errors

---

### Task 5.3: Frontend Testing

**Test Checklist:**
- [ ] Verify images load in frontend
- [ ] Verify images are using signed URLs (check Network tab in browser dev tools)
- [ ] Test signed URL expiration handling (wait for expiration or use short expiration time)
- [ ] Test URL refresh mechanism (if implemented - refresh on 403 error)
- [ ] Check for broken image links
- [ ] Test error states (403 errors, network errors)
- [ ] Verify backend API endpoints return signed URLs
- [ ] Test image loading on different pages (orders, reviews, etc.)

**Frontend Testing Details:**
1. **Check Network Tab:**
   - Images should load from signed URLs (not public R2 URLs)
   - Signed URLs should have query parameters with expiration

2. **Test URL Expiration:**
   - Wait for signed URL to expire (or set short expiration for testing)
   - Verify image fails to load (403 error)
   - If refresh mechanism exists, verify it gets new signed URL

3. **Test Backend API:**
   - Call `/api/orders/[orderId]` or similar endpoints
   - Verify response contains signed URLs (not public URLs)
   - Verify signed URLs are valid and accessible

---

## Phase 6: Cleanup & Documentation

### Task 6.1: Remove Unused Files

**After assessment from Phase 1:**
- [ ] Delete unused test pages (if any)
- [ ] Delete unused scripts (if any)
- [ ] Update documentation

### Task 6.2: Update Documentation

**Files to update:**
- `README.md` - Document signed URL usage
- `docs/R2_SETUP.md` - Update with private bucket instructions
- `docs/n8n-workflow-files/README.md` - Document workflow changes

**Action Items:**
- [ ] Document signed URL API
- [ ] Update setup instructions
- [ ] Document n8n environment variables
- [ ] Add troubleshooting guide

---

## Implementation Checklist

### Pre-Implementation
- [ ] Review and approve this guide
- [ ] Create backup branch: `git checkout -b backup-before-r2-migration`
- [ ] Assess test files usage (Phase 1)
- [ ] Delete unused files (if any)

### Backend Implementation
- [ ] Create `/api/r2/signed-url` endpoint
- [ ] **CRITICAL:** Add authentication middleware (Bearer token required)
- [ ] Update `r2-service.ts` to use signed URLs
- [ ] Update all API endpoints returning R2 URLs
- [ ] **Frontend Strategy:** Ensure backend APIs return signed URLs (see Task 2.3)
- [ ] Write unit tests
- [ ] Test signed URL generation
- [ ] Test authentication (verify 401 without token, 200 with token)

### n8n Workflow Updates
- [ ] **CRITICAL:** Set n8n environment variables FIRST (BEFORE testing)
  - [ ] Add `BACKEND_API_URL`
  - [ ] Add `BACKEND_API_TOKEN`
- [ ] Create workflow update script
- [ ] Run script in dry-run mode
- [ ] Review automated changes
- [ ] Apply automated updates
- [ ] Manually update critical workflows (use `this.helpers.request()` in Code nodes - lowest risk)
- [ ] Test all workflows (can test with public R2 buckets first)

### R2 Privacy
- [ ] Make `little-hero-assets` bucket private
- [ ] Make `little-hero-orders` bucket private
- [ ] Verify buckets are private

### Testing
- [ ] Test backend API
- [ ] Test n8n workflows end-to-end
- [ ] Test frontend image loading
- [ ] Monitor for 24 hours
- [ ] Verify no 403 errors

### Cleanup
- [ ] Update documentation
- [ ] Remove backup files (after verification)
- [ ] Document lessons learned

---

## Time Estimates

| Phase | Task | Time | Priority |
|-------|------|------|----------|
| 1 | Assessment & Cleanup | 30 min | HIGH |
| 2 | Backend API Implementation | 1-2 hours | HIGH |
| 2 | Backend Service Updates | 1-2 hours | HIGH |
| 3 | Workflow Script Creation | 1 hour | HIGH |
| 3 | Workflow Updates (Automated) | 30 min | HIGH |
| 3 | Workflow Updates (Manual) | 2-3 hours | HIGH |
| 3 | n8n Environment Variables | 15 min | HIGH |
| 4 | R2 Bucket Privacy | 15 min | HIGH |
| 5 | Testing | 2-3 hours | HIGH |
| 6 | Cleanup & Documentation | 30 min | MEDIUM |
| **Total** | | **6-10 hours** | |

---

## Risk Mitigation

### Rollback Plan
1. **Git revert** - Revert code changes if needed
2. **Make R2 buckets public** - Temporarily if critical issues
3. **Revert n8n workflows** - Import previous versions
4. **Monitor and fix** - Address issues incrementally

### Monitoring
- Monitor workflow execution logs
- Check for 403 errors in logs
- Monitor signed URL expiration
- Track API endpoint usage

---

## Success Criteria

✅ R2 buckets are private  
✅ Backend API generates valid signed URLs  
✅ n8n workflows use signed URLs  
✅ Bria API successfully downloads images  
✅ Frontend images load correctly  
✅ No broken workflows  
✅ No 403 errors in logs  
✅ All tests pass  

---

## Testing Strategy: Can Workflows Function After Updates?

**📄 Detailed Answer:** See [Migration Order Guide](little-hero-books-migration-order.md) for complete explanation

### Quick Answer

**Q: If I ask the agent to do automated updates first, will workflows still function for testing before making the repo private?**

**A: No, not if done before the backend API exists. But YES if backend API is implemented first.**

### The Critical Dependency

**Updated workflows require the backend API to exist:**
- Updated workflows call: `$env.BACKEND_API_URL + '/api/r2/signed-url'`
- If backend API doesn't exist → workflows fail ❌
- If backend API exists → workflows work ✅

### Correct Order for Testing

**1. Backend API First (Phase 2)**
- Implement backend API
- Test with public R2 buckets
- ✅ Backend API works

**2. Update Workflows (Phase 3)**
- Run automated update script
- Update n8n environment variables
- ✅ Workflows call backend API

**3. Test with Public R2**
- Test workflows end-to-end
- Verify signed URLs work
- Verify Bria API works
- ✅ Everything works with public buckets

**4. Make R2 Private**
- Make buckets private (manual)
- Test again
- ✅ Everything still works with private buckets

**5. Make Repo Private**
- Make repository private (manual)
- Final verification

### Key Insight

**Signed URLs work with both public and private buckets!**

This means you can:
- Test backend API with public buckets
- Test updated workflows with public buckets
- Fix any issues before making buckets private
- Make buckets private only after everything is tested

---

## Next Steps for Repository Agent

1. **Review this guide** - Understand all phases
2. **Review manual tasks guide** - See [Manual Tasks Guide](little-hero-books-manual-tasks.md)
3. **Review migration order** - See [Migration Order Guide](little-hero-books-migration-order.md)
4. **Start with Phase 1** - Assess test files usage
5. **Implement Phase 2** - Backend signed URL API **with authentication** (MUST BE FIRST)
   - Create `/api/r2/signed-url` endpoint with Bearer token authentication
   - Update backend service to use signed URLs
   - Implement frontend strategy (backend APIs return signed URLs)
6. **Set n8n environment variables** - See Manual Tasks Guide Phase 3 (BEFORE workflow updates)
7. **Execute Phase 3** - Update n8n workflows (after Phase 2 and env vars)
   - Use HTTP Request nodes (not Code nodes) for backend API calls
8. **Test with public R2** - Verify everything works (signed URLs work with public buckets)
9. **Complete Phase 4** - Make R2 private (manual - see Manual Tasks Guide)
10. **Test with private R2** - Final verification
11. **Thoroughly test** - Phase 5
12. **Clean up** - Phase 6

**Critical Order:**
- ✅ Backend API must exist **with authentication** before updating workflows
- ✅ n8n environment variables must be set **BEFORE** testing workflows
- ✅ Use `this.helpers.request()` in Code nodes (no workflow structure changes - lowest risk)
- ✅ Test workflows with public R2 before making buckets private
- ✅ Frontend strategy: Backend APIs return signed URLs (no frontend changes needed)
- ✅ Make buckets private only after everything works

---

## Notes

- This migration is **reversible** - can make buckets public again if needed
- Test thoroughly in development before production
- Monitor closely after deployment
- Keep backups of all workflow files
- Document any issues encountered

---

## Instructions for Repository Agent

### Context
You are working on the `little-hero-books` repository. The repository currently has **public R2 storage buckets containing customer data**, which is a critical security issue. This guide provides step-by-step instructions to migrate from public R2 URLs to private R2 with signed URLs.

### Your Tasks

#### 1. Assess Test Files and Scripts (Phase 1)

**Determine if test pages and scripts are still needed:**

Run these commands to assess usage:

```bash
# Check when files were last modified
git log --oneline --all --since="6 months ago" -- test-pages/ scripts/

# Check for references in code
grep -r "test-pages" --include="*.ts" --include="*.js" --include="*.json" .
grep -r "scripts/" package.json *.json

# Check if referenced in documentation
grep -r "test-pages\|scripts/" README.md docs/ --include="*.md"
```

**Decision:**
- **If files haven't been modified in 6+ months AND not referenced:** Delete them
- **If files are used:** Update them to use environment variables or signed URLs
- **If unsure:** Ask the user before deleting

**Action:**
- [ ] Run assessment commands
- [ ] Document findings
- [ ] Delete unused files OR mark for update
- [ ] Update this guide with findings

---

#### 2. Implement Backend Signed URL API (Phase 2)

**Create the API endpoint:**

1. Create file: `back-end/src/app/api/r2/signed-url/route.ts`
2. Use the implementation provided in this guide (Task 2.1)
3. Ensure `@aws-sdk/s3-request-presigner` is installed
4. Test the endpoint locally

**Update R2 Service:**

1. Open `back-end/src/lib/r2-service.ts`
2. Add `getSignedUrlForObject()` helper function (see Task 2.2)
3. Update `getCharacterAssets()` to use signed URLs
4. Update all API endpoints that return R2 URLs

**Action:**
- [ ] Create `/api/r2/signed-url` endpoint
- [ ] Update `r2-service.ts`
- [ ] Test signed URL generation
- [ ] Write unit tests

---

#### 3. Create n8n Workflow Update Script (Phase 3)

**Create the automation script:**

1. Create file: `scripts/update-n8n-workflows-for-private-r2.js`
2. Use the script provided in this guide (Task 3.1)
3. Install dependencies: `npm install glob` (if not already installed)
4. Run in dry-run mode first: `node scripts/update-n8n-workflows-for-private-r2.js --dry-run`
5. Review changes
6. Run without dry-run to apply changes

**Manual Workflow Updates:**

After automated updates, manually review critical workflows:
- Workflow 2A (Character Generation)
- Workflow 2B (Background Removal)
- Workflow 3 (Book Assembly)

Update these workflows to call the backend API for signed URLs before passing to Bria API.

**Action:**
- [ ] Create workflow update script
- [ ] Run in dry-run mode
- [ ] Review and apply changes
- [ ] Manually update critical workflows
- [ ] Test workflows in n8n

---

#### 4. Update n8n Environment Variables

**📄 Manual Tasks:** See [Manual Tasks Guide](little-hero-books-manual-tasks.md) - Phase 3 for detailed instructions

**Required variables:**
- `BACKEND_API_URL` - Your backend API URL
- `BACKEND_API_TOKEN` - Authentication token (if required)

**Action:**
- [ ] Log into n8n UI (see Manual Tasks Guide)
- [ ] Add `BACKEND_API_URL` environment variable
- [ ] Add `BACKEND_API_TOKEN` if authentication required
- [ ] Test workflows with new variables

---

#### 5. Make R2 Buckets Private (Phase 4)

**IMPORTANT:** Do this AFTER backend API and workflows are updated and tested.

1. Log into Cloudflare Dashboard
2. Navigate to R2 Object Storage
3. Select `little-hero-assets` bucket
4. Settings > Public Access > Disable
5. Repeat for `little-hero-orders` bucket
6. Verify buckets are private

**Action:**
- [ ] Make buckets private
- [ ] Verify public URLs return 403
- [ ] Test signed URLs still work

---

#### 6. Testing (Phase 5)

**Test everything before declaring complete:**

1. Test backend API endpoint
2. Test n8n workflows end-to-end
3. Test frontend image loading
4. Monitor for 24 hours

**Action:**
- [ ] Run test script for signed URL API
- [ ] Test all critical workflows
- [ ] Verify Bria API calls succeed
- [ ] Check for 403 errors
- [ ] Monitor logs

---

### Critical Order of Operations

**DO NOT make R2 buckets private until:**
1. ✅ Backend API endpoint is implemented with authentication
2. ✅ Backend API is tested (with authentication)
3. ✅ n8n environment variables are set (`BACKEND_API_URL`, `BACKEND_API_TOKEN`)
4. ✅ n8n workflows are updated and tested (with public R2 buckets)
5. ✅ Frontend signed URL strategy is implemented (backend APIs return signed URLs)
6. ✅ All tests pass

**Migration Order:**
1. Assess and clean up test files
2. Implement backend API (with authentication)
3. Update backend service (signed URLs in all API responses)
4. Implement frontend signed URL strategy (backend APIs return signed URLs)
5. **Set n8n environment variables** (BEFORE workflow updates)
6. Create and run workflow update script
7. Manually review critical workflows (use HTTP Request nodes)
8. Test workflows with public R2 buckets
9. Make R2 buckets private
10. Final testing with private R2
11. Make repository private
12. Monitor for 24 hours

---

### What to Ask the User

**Before starting:**
- Confirm backend API URL
- Confirm if authentication is needed for signed URL API
- Confirm n8n instance URL

**During assessment:**
- Should test pages be kept or deleted?
- Should scripts be kept or deleted?
- Which workflows are currently in production?

**Before making R2 private:**
- Confirm all tests pass
- Confirm workflows are working
- Get approval to proceed

---

### Success Criteria

✅ Backend API generates valid signed URLs  
✅ n8n workflows use signed URLs  
✅ Bria API successfully downloads images  
✅ R2 buckets are private  
✅ Frontend images load correctly  
✅ No broken workflows  
✅ No 403 errors in logs  

---

### If Something Goes Wrong

**Rollback Steps:**
1. Make R2 buckets public again (temporary)
2. Revert code changes: `git revert`
3. Revert n8n workflows: Import previous versions
4. Fix issues and retry

**Common Issues:**
- **403 errors:** Check signed URL generation, verify buckets are configured correctly
- **Workflow failures:** Check n8n environment variables, verify API endpoint is accessible
- **Image loading issues:** Check frontend signed URL usage, verify URL expiration handling

---

### Questions or Issues?

- Document any problems encountered
- Update this guide with solutions
- Ask the user for clarification when needed
- Don't proceed to next phase until current phase is complete and tested

