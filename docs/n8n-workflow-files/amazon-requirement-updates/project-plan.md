# W3 Workflow - Amazon Order Requirements Project Plan

## Overview

This document outlines the requirements and implementation plan for updating the **W3 (PNG Assembly)** and **W4 (Print Fulfillment)** workflows to handle Amazon orders differently from other order sources. Amazon orders require additional pages and different cover designs to meet Amazon Custom product specifications.

**Scope**:
- **W3 Workflow**: Generate 17 pages for Amazon orders (vs 15 for non-Amazon)
- **W4 Workflow**: Validate and process 17-page orders (vs 15-page orders)

---

## Quick Reference: R2 File Structure

### Amazon Orders (17 pages total):
1. `page00-covers-barcode.png` - **NEW** Amazon barcode cover (different from standard cover)
2. `page00-title-page.png` - **NEW** Title page ("real" page 1)
3. `page00-blank.png` - **NEW** Blank page (between title and dedication)
4. `page00-dedication.png` - Dedication page (existing)
5-18. `page01-{description}.png` through `page14-{description}.png` - Story pages (14 pages, existing)

### Non-Amazon Orders (15 pages total):
1. `page00-dedication.png` - Dedication page
2-15. `page01-{description}.png` through `page14-{description}.png` - Story pages (14 pages)

**Key Points**:
- R2 files use `page00-` prefix for special pages (cover, title, blank, dedication)
- Special pages distinguished by suffix: `-covers-barcode`, `-title-page`, `-blank`, `-dedication`
- Story pages keep existing naming: `page01-` through `page14-`
- **New PDFMonkey templates needed** (user will explain changes)

---

## 1. Project Requirements

### 1.1 Order Source Detection
**Requirement**: W3 must be able to distinguish orders coming from Amazon vs. orders from other sources.

**Current State**:
- Orders have `marketplace_id` field (e.g., `"ATVPDKIKX0DER"` for Amazon US)
- Orders have `amazon_order_id` field (present for Amazon orders)
- Orders may have `platform` field (defaults to `'amazon'` in order mapper)

**Detection Strategy**:
- Check for `marketplace_id` matching Amazon marketplace IDs
- Check for presence of `amazon_order_id` field
- Check for `platform === 'amazon'` field
- **Recommended**: Use a combination check for reliability

**Implementation Location**:
- Early in W3 workflow (e.g., "Validate & Normalize W3 Input" or "Build Assembly Input From Manifest")
- Set a flag: `isAmazonOrder: boolean` that flows through all W3 nodes

---

### 1.2 Amazon-Specific Page Requirements

**Requirement**: Amazon orders need:
1. **Different cover-spread file** (Amazon-specific design)
2. **New title page** (after cover, before dedication)
3. **New blank page** (after title page, before dedication)

**Current Page Structure** (Non-Amazon):
- `page00-dedication.png`: Dedication page
- `page01-{description}.png` through `page14-{description}.png`: Story pages (14 pages)
- **Total: 15 pages** (dedication + 14 story pages)

**Amazon Page Structure** (Required - R2 File Names):
- `page00-covers-barcode.png`: Amazon barcode cover (NEW - different from standard cover)
- `page00-title-page.png`: Title page (NEW - "real" page 1)
- `page00-blank.png`: Blank page (NEW - between title and dedication)
- `page00-dedication.png`: Dedication page (existing)
- `page01-{description}.png` through `page14-{description}.png`: Story pages (14 pages, existing)
- **Total: 17 pages** (cover + title + blank + dedication + 14 story pages)

**Page Numbering in R2 Files**:
- **Note**: R2 files use `page00-` prefix for special pages (cover, title, blank, dedication)
- **Actual book page order** (Amazon):
  1. Cover (page00-covers-barcode.png)
  2. Title page (page00-title-page.png)
  3. Blank page (page00-blank.png)
  4. Dedication (page00-dedication.png)
  5-18. Story pages (page01-14)

**Implementation Note**:
- R2 file naming uses `page00-` prefix for multiple special pages
- Need to distinguish by suffix: `-covers-barcode`, `-title-page`, `-blank`, `-dedication`
- Story pages keep existing naming: `page01-` through `page14-`

---

### 1.3 Cover-Spread Differences

**Current Cover-Spread**:
- Uses standard template: `cover-spread.png`
- Generated via PDFMonkey template: `D0F07D93-9267-47BB-A6AF-D6EC5ACDF476` (or similar)
- HTML/CSS in "Generate Cover HTML" node
- R2 file: `cover-spread.png` (or similar)

**Amazon Cover-Spread Requirements**:
- **R2 file name**: `page00-covers-barcode.png`
- Different design/layout with **barcode** (Amazon requirement)
- Must meet Amazon Custom product specifications
- **New PDFMonkey template** required (user will explain changes needed)
- Different dimensions or layout constraints (TBD based on template)

**Implementation**:
- **Separate PDFMonkey template** for Amazon covers (NEW template - user will specify changes)
- Conditional HTML/CSS generation in "Generate Cover HTML" node
- Output to R2 as `page00-covers-barcode.png` (not `cover-spread.png`)

**Note**: User will provide details on PDFMonkey template changes needed

---

### 1.4 Title Page Requirements

**New Page Type**: Title page for Amazon orders

**R2 File Name**: `page00-title-page.png`

**Content**:
- Book title (from `bookSpecs.title` or `${childName} and the Adventure Compass`)
- Child's name
- Optional: Subtitle or decorative elements
- Amazon branding requirements (if any)

**Implementation**:
- New HTML generation in "Generate Complete HTML" node
- **New PDFMonkey template** (user will explain changes needed)
- Must be inserted after cover, before blank page
- Output to R2 as `page00-title-page.png`

**Note**: User will provide details on PDFMonkey template for title page

---

### 1.5 Blank Page Requirements

**New Page Type**: Blank page for Amazon orders

**R2 File Name**: `page00-blank.png`

**Content**:
- Completely blank page (no text, no images)
- May need subtle background color or texture
- Amazon may require this for binding/formatting

**Implementation**:
- Simple HTML generation (blank div with background)
- **New PDFMonkey template** OR inline HTML generation
- Must be inserted after title page, before dedication
- Output to R2 as `page00-blank.png`

**Note**: User will specify if PDFMonkey template needed or can use inline HTML

---

## 2. Impacted Nodes Analysis

### 2.1 W3 Nodes That Need Updates

#### **A. "Validate & Normalize W3 Input" or "Build Assembly Input From Manifest"**
**Impact**: HIGH
**Changes Needed**:
- Add order source detection logic
- Set `isAmazonOrder` flag
- Pass flag through to downstream nodes

**Code Location**: Early in W3 workflow

---

#### **B. "Load Story & Character Poses (3A)"**
**Impact**: MEDIUM
**Changes Needed**:
- May need to adjust page numbering if title/blank pages affect story page numbers
- Currently generates 14 story pages (p01-p14)
- For Amazon: May need to generate p03-p16 (if title=p00, blank=p01, dedication=p02)

**Decision Needed**: How to handle page numbering?

---

#### **C. "Generate Complete HTML" (Interior Pages)**
**Impact**: HIGH
**Changes Needed**:
- Add conditional logic for Amazon orders
- Generate title page HTML (if `isAmazonOrder`)
- Generate blank page HTML (if `isAmazonOrder`)
- Adjust page numbering for story pages
- Currently generates: p00 (dedication) + p01-p14 (story) = 15 pages
- Amazon needs: title + blank + p00 (dedication) + p01-p14 (story) = 17 pages

**Current Code Structure**:
```javascript
// p00 dedication
// pages 1..14 (story)
```

**New Structure Needed**:
```javascript
if (isAmazonOrder) {
  // Title page (p00 or p-1?)
  // Blank page (p01 or p-2?)
  // Dedication page (p02 or keep as p00?)
  // Story pages (p03-p16 or p01-p14?)
} else {
  // Current flow: p00 dedication + p01-p14 story
}
```

---

#### **D. "Generate Cover HTML" or Cover Generation Node**
**Impact**: HIGH
**Changes Needed**:
- Conditional HTML/CSS generation based on `isAmazonOrder`
- Different template ID for Amazon covers
- Different HTML structure for Amazon covers
- May need separate PDFMonkey template

**Current**: Single cover template
**New**: Two cover templates (standard + Amazon)

---

#### **E. "Set Cover PNG Filenames/Keys"**
**Impact**: LOW
**Changes Needed**:
- May need different filename pattern for Amazon covers
- Currently: `cover-spread.png`
- Amazon: `cover-spread-amazon.png` or keep same name?

---

#### **F. "Build 3-Manifest" or Manifest Generation Node**
**Impact**: HIGH
**Changes Needed**:
- Update page count: 15 → 17 for Amazon orders
- Add title page entry to manifest
- Add blank page entry to manifest
- Update `totalPages` in manifest
- Update `pagePreviewImages` array to include title + blank pages

**Current Manifest Structure**:
```json
{
  "pngGeneration": {
    "pages": {
      "p00": "...",
      "p01": "...",
      ...
      "p14": "..."
    },
    "totalPages": 15
  }
}
```

**Amazon Manifest Structure**:
```json
{
  "pngGeneration": {
    "pages": {
      "p00": "...", // title page
      "p01": "...", // blank page
      "p02": "...", // dedication (was p00)
      "p03": "...", // story page 1 (was p01)
      ...
      "p16": "..."  // story page 14 (was p14)
    },
    "totalPages": 17
  }
}
```

---

#### **G. Page Collection/Generation Nodes**
**Impact**: MEDIUM
**Changes Needed**:
- Update `totalPagesRequired` from 15 to 17 for Amazon orders
- Update page generation loops to include title + blank pages
- Update page numbering in collection logic

**Current**: `totalPagesRequired: 15`
**Amazon**: `totalPagesRequired: 17`

---

#### **H. "Get Order Ready for Assembly"**
**Impact**: LOW
**Changes Needed**:
- Update `totalPagesRequired` calculation
- Currently: `totalPagesRequired: 15`
- Amazon: `totalPagesRequired: 17`

---

### 2.2 W4 (Print Fulfillment) Impact

**Impact**: HIGH
**Changes Needed**:
- W4 validates page count (currently expects exactly 15 pages)
- Must update validation to accept 15 (non-Amazon) or 17 (Amazon)
- Update page count validation logic
- Update Lulu API calls that reference `interior_page_count`

**Current W4 Validation**:
- Expects exactly 15 pages (p00-p14)
- Validates `pageImageUrls.length === 15`
- Hardcodes `interior_page_count: 15` in Lulu validation calls

**New W4 Validation**:
- Accept 15 pages (non-Amazon) OR 17 pages (Amazon)
- Validate based on order source
- Use dynamic `interior_page_count` in Lulu API calls

**W4 Nodes Requiring Updates**:

#### **A. "Validate & Normalize W4 Input"**
**Impact**: HIGH
**Current Code Issues**:
- Line: `const requiredKeys = Array.from({ length: 15 }, (_, i) => 'p' + String(i).padStart(2, '0'));`
  - Hardcodes 15 pages (p00-p14)
  - Amazon orders need 17 pages (p00-p16)
- Line: `if (manifest.pageImageUrls.length !== 15) { throw new Error(...) }`
  - Hardcoded validation for exactly 15 pages
- Line: `if (!Array.isArray(pageImageUrls) || pageImageUrls.length !== 15) { throw new Error(...) }`
  - Final validation expects exactly 15 pages

**Changes Needed**:
1. Add order source detection (same logic as W3):
   ```javascript
   const isAmazonOrder = !!(
     manifest.marketplace_id === 'ATVPDKIKX0DER' ||
     manifest.amazon_order_id ||
     manifest.platform === 'amazon' ||
     orderId.startsWith('AMZ-') // if using prefix
   );
   ```
2. Calculate expected page count dynamically:
   ```javascript
   const expectedPageCount = isAmazonOrder ? 17 : 15;
   const requiredKeys = Array.from({ length: expectedPageCount }, (_, i) => 'p' + String(i).padStart(2, '0'));
   ```
3. Update validation checks to use `expectedPageCount` instead of hardcoded `15`
4. Pass `isAmazonOrder` and `expectedPageCount` through to downstream nodes

---

#### **B. "Validate Cover (SANDBOX)" and "Validate Cover (PRODUCTION)"**
**Impact**: HIGH
**Current Code Issues**:
- Line: `"interior_page_count": 15` (hardcoded in JSON body)
- Lulu API requires accurate page count for cover validation

**Changes Needed**:
1. Read `expectedPageCount` from upstream (from "Validate & Normalize W4 Input")
2. Use dynamic value instead of hardcoded `15`:
   ```javascript
   "interior_page_count": $json.expectedPageCount || $node["Validate & Normalize W4 Input"].json.expectedPageCount || 15
   ```
3. Apply same change to both SANDBOX and PRODUCTION versions

---

#### **C. "Build Pages HTML (8.75in)1"**
**Impact**: LOW
**Current Code**:
- Uses `pageImageUrls` array dynamically
- No hardcoded page count assumptions
- Should work with 15 or 17 pages automatically

**Changes Needed**:
- **None required** - already handles dynamic array length
- May want to add validation/logging for page count if helpful for debugging

---

#### **D. "Build Lulu Print Job Payload"**
**Impact**: LOW
**Current Code**:
- Does not hardcode page count
- Lulu API doesn't require page count in print job payload (only in validation)

**Changes Needed**:
- **None required** - no page count references

---

#### **E. POD Package ID Consideration**
**Impact**: MEDIUM
**Current State**:
- Config uses: `podPackageId: '0850X0850FCPRESS080CW444MXX'` (saddle-stitch for 15 pages)
- Amazon orders with 17 pages may need different binding

**Decision Needed**:
- **Option A**: Use same saddle-stitch package (if Lulu supports 17 pages)
- **Option B**: Switch to perfect-bound for 17 pages (requires different `podPackageId`)
- **Option C**: Use conditional logic based on page count

**Recommendation**: Check Lulu documentation for saddle-stitch page limits. If 17 pages exceeds limit, use perfect-bound for Amazon orders.

**Implementation** (if needed):
- Add conditional `podPackageId` selection in "Build Lulu Print Job Payload":
  ```javascript
  const podPackageId = isAmazonOrder 
    ? '0850X0850FCPREPB080CW444MXX' // perfect-bound for 17 pages
    : (j.printOptions?.podPackageId ?? dflt.podPackageId); // saddle-stitch for 15 pages
  ```

---

## 3. Implementation Strategy

### 3.1 Phase 1: Order Source Detection
**Goal**: Add `isAmazonOrder` flag to W3 workflow

**Steps**:
1. Update "Build Assembly Input From Manifest" or early validation node
2. Add detection logic:
   ```javascript
   const isAmazonOrder = !!(
     order.marketplace_id === 'ATVPDKIKX0DER' ||
     order.amazon_order_id ||
     order.platform === 'amazon'
   );
   ```
3. Pass `isAmazonOrder` through all downstream nodes
4. Test with mock Amazon and non-Amazon orders

---

### 3.2 Phase 2: Title Page & Blank Page Generation
**Goal**: Generate title and blank pages for Amazon orders

**Steps**:
1. Update "Generate Complete HTML" node
2. Add title page HTML generation (conditional on `isAmazonOrder`)
3. Add blank page HTML generation (conditional on `isAmazonOrder`)
4. Decide on page numbering strategy
5. Test HTML output for Amazon orders

**Page Numbering Decision**:
- **Option A**: Title=p00, Blank=p01, Dedication=p02, Story=p03-p16
- **Option B**: Title=p-1, Blank=p-2, Dedication=p00, Story=p01-p14 (keep existing)
- **Recommendation**: Option A (cleaner, sequential numbering)

---

### 3.3 Phase 3: Cover-Spread Updates
**Goal**: Different cover design for Amazon orders

**Steps**:
1. Create new PDFMonkey template for Amazon covers
2. Update "Generate Cover HTML" node with conditional logic
3. Add Amazon-specific HTML/CSS
4. Update "Set Cover PNG Filenames/Keys" if needed
5. Test cover generation for both order types

---

### 3.4 Phase 4: Manifest Updates
**Goal**: Update 3-manifest to include new pages

**Steps**:
1. Update "Build 3-Manifest" node
2. Add title page entry to `pagePreviewImages`
3. Add blank page entry to `pagePreviewImages`
4. Update `totalPages` to 17 for Amazon orders
5. Update page numbering in manifest structure
6. Test manifest structure for both order types

---

### 3.5 Phase 5: Page Count Updates
**Goal**: Update all page count references

**Steps**:
1. Update `totalPagesRequired` in "Get Order Ready for Assembly"
2. Update page generation loops
3. Update page collection logic
4. Update W4 validation to accept 15 or 17 pages
5. Test end-to-end for both order types

---

## 4. Technical Decisions Needed

### 4.1 Page Numbering Strategy
**Question**: How should we number the new pages?

**Options**:
- **A**: Title=p00, Blank=p01, Dedication=p02, Story=p03-p16 (sequential)
- **B**: Title=p-1, Blank=p-2, Dedication=p00, Story=p01-p14 (keep existing story numbering)

**Recommendation**: Option A (sequential numbering is cleaner)

**Impact**: Requires updating all page references in story generation

---

### 4.2 Cover Template Strategy
**Question**: Separate PDFMonkey template or conditional HTML?

**Decision**: **Separate PDFMonkey template for Amazon covers**
- R2 file: `page00-covers-barcode.png` (different from standard `cover-spread.png`)
- User will provide details on template changes needed
- Template will include barcode (Amazon requirement)

**Status**: Awaiting user specification of template changes

---

### 4.3 Title Page Design
**Question**: What should the title page contain?

**R2 File**: `page00-title-page.png`

**Requirements**:
- Book title
- Child's name
- Amazon branding (if required)
- **New PDFMonkey template** (user will explain changes needed)

**Status**: Awaiting user specification of template design/changes

---

### 4.4 Blank Page Design
**Question**: Completely blank or subtle background?

**R2 File**: `page00-blank.png`

**Options**:
- **A**: Completely blank (white page)
- **B**: Subtle background/texture (matches book design)
- **C**: PDFMonkey template (if user specifies)

**Status**: Awaiting user specification (may need PDFMonkey template)

---

## 5. Testing Strategy

### 5.1 Unit Testing
- Test order source detection logic
- Test title page HTML generation
- Test blank page HTML generation
- Test page numbering logic
- Test manifest structure generation

### 5.2 Integration Testing
- Test full W3 workflow with Amazon order
- Test full W3 workflow with non-Amazon order
- Test W4 validation with 15-page order
- Test W4 validation with 17-page order
- Test cover generation for both order types

### 5.3 End-to-End Testing
- Place test Amazon order → verify 17 pages generated
- Place test non-Amazon order → verify 15 pages generated
- Verify cover designs are different
- Verify title page appears in Amazon orders
- Verify blank page appears in Amazon orders

---

## 6. Files & Resources Needed

### 6.1 New PDFMonkey Templates
- **Amazon cover template** (NEW - with barcode)
  - R2 output: `page00-covers-barcode.png`
  - User will specify template changes needed
- **Title page template** (NEW)
  - R2 output: `page00-title-page.png`
  - User will specify template design/changes
- **Blank page template** (NEW, if needed)
  - R2 output: `page00-blank.png`
  - May be inline HTML or PDFMonkey template (TBD)

### 6.2 HTML/CSS Files
- Amazon cover HTML/CSS (with barcode)
- Title page HTML/CSS
- Blank page HTML/CSS (if not using template)

### 6.3 R2 File Structure
- `page00-covers-barcode.png` (Amazon cover)
- `page00-title-page.png` (title page)
- `page00-blank.png` (blank page)
- `page00-dedication.png` (dedication - existing)
- `page01-{description}.png` through `page14-{description}.png` (story pages - existing)

### 6.4 Documentation
- Amazon Custom product specifications
- PDFMonkey template specifications (from user)
- Cover design requirements (from user)
- Title page design requirements (from user)

---

## 7. Risk Assessment

### 7.1 High Risk
- **Page numbering changes**: Could break existing page references
- **Manifest structure changes**: Could break W4 validation
- **Cover template changes**: Could break cover generation

### 7.2 Medium Risk
- **Order source detection**: May miss edge cases
- **W4 validation updates**: May reject valid orders

### 7.3 Low Risk
- **Title/blank page generation**: Simple HTML generation
- **Testing**: Can test with mock orders before production

---

## 8. Success Criteria

### 8.1 Functional Requirements
- ✅ Amazon orders generate 17 pages (cover + title + blank + dedication + 14 story)
- ✅ Non-Amazon orders generate 15 pages (dedication + 14 story)
- ✅ Amazon orders use different cover design
- ✅ Title page appears in Amazon orders
- ✅ Blank page appears in Amazon orders
- ✅ W4 accepts both 15 and 17 page orders

### 8.2 Quality Requirements
- ✅ No regression in non-Amazon order processing
- ✅ All pages render correctly
- ✅ Manifest structure is valid
- ✅ Cover designs meet Amazon specifications

---

## 9. Next Steps

1. **Review this plan** with team
2. **Make technical decisions** (page numbering, template strategy, POD package for 17 pages)
3. **Design title page** mockup
4. **Create Amazon cover template** in PDFMonkey
5. **Implement Phase 1** (order source detection in W3)
6. **Implement Phase 2** (title + blank pages in W3)
7. **Implement Phase 3** (cover updates in W3)
8. **Implement Phase 4** (manifest updates in W3)
9. **Implement Phase 5** (page count updates in W3)
10. **Implement W4 Updates** (validate & normalize, cover validation, POD package selection)
11. **Test end-to-end** with both order types (15-page non-Amazon, 17-page Amazon)
12. **Deploy to production**

---

## 10. W4 Implementation Details

### 10.1 Order Source Detection in W4

**Location**: "Validate & Normalize W4 Input" node

**Detection Logic** (same as W3):
```javascript
const isAmazonOrder = !!(
  manifest.marketplace_id === 'ATVPDKIKX0DER' ||
  manifest.amazon_order_id ||
  manifest.platform === 'amazon' ||
  orderId.startsWith('AMZ-') // optional prefix check
);
```

**Output**: Add `isAmazonOrder` and `expectedPageCount` to node output for downstream use

---

### 10.2 Page Count Validation Updates

**Location**: "Validate & Normalize W4 Input" node

**Changes**:
1. Replace hardcoded `15` with `expectedPageCount`
2. Update `requiredKeys` generation to use dynamic count
3. Update all validation error messages to reference `expectedPageCount`
4. Ensure validation accepts both 15 and 17 pages

**Code Pattern**:
```javascript
const expectedPageCount = isAmazonOrder ? 17 : 15;
const requiredKeys = Array.from({ length: expectedPageCount }, (_, i) => 
  'p' + String(i).padStart(2, '0')
);

// ... validation logic ...

if (pageImageUrls.length !== expectedPageCount) {
  throw new Error(`W4 validation: expected ${expectedPageCount} pages; resolved ${pageImageUrls.length}.`);
}
```

---

### 10.3 Lulu Cover Validation Updates

**Location**: "Validate Cover (SANDBOX)" and "Validate Cover (PRODUCTION)" nodes

**Changes**:
1. Read `expectedPageCount` from upstream node
2. Replace hardcoded `"interior_page_count": 15` with dynamic value

**Code Pattern**:
```javascript
"interior_page_count": $json.expectedPageCount || 
  $node["Validate & Normalize W4 Input"].json.expectedPageCount || 
  15
```

---

### 10.4 POD Package Selection (If Needed)

**Location**: "Build Lulu Print Job Payload" node

**Decision**: Check Lulu documentation for saddle-stitch page limits

**If 17 pages requires perfect-bound**:
```javascript
const isAmazonOrder = j.isAmazonOrder || 
  j.marketplace_id === 'ATVPDKIKX0DER' ||
  !!j.amazon_order_id;

const podPackageId = isAmazonOrder
  ? '0850X0850FCPREPB080CW444MXX' // perfect-bound for 17 pages
  : (j.printOptions?.podPackageId ?? dflt.podPackageId); // saddle-stitch for 15 pages
```

**Note**: Current config uses `'0850X0850FCPRESS080CW444MXX'` (saddle-stitch). Need to verify if this supports 17 pages or if perfect-bound is required.

---

## 11. Questions for Discussion

1. ✅ **Page numbering**: RESOLVED - Using R2 file naming: `page00-{type}.png` for special pages
2. ✅ **Cover template**: RESOLVED - Separate PDFMonkey template for Amazon (with barcode)
3. ⏳ **Title page design**: AWAITING - User will explain PDFMonkey template changes
4. ⏳ **Blank page**: AWAITING - User will specify if PDFMonkey template needed
5. ⏳ **PDFMonkey template changes**: AWAITING - User will explain changes needed
6. ⚠️ **POD Package for 17 pages**: DECISION NEEDED - Does saddle-stitch support 17 pages, or do we need perfect-bound?
7. **Amazon specifications**: Do we have official requirements document?
8. **Testing**: Should we test with real Amazon order or mock data first?

## 12. Awaiting User Input

**Before implementation can begin, need:**
1. PDFMonkey template specifications for:
   - Amazon cover template (with barcode) - `page00-covers-barcode.png`
   - Title page template - `page00-title-page.png`
   - Blank page template (if needed) - `page00-blank.png`
2. Details on what changes are needed in the templates
3. Confirmation on blank page approach (template vs inline HTML)

---

## Appendix: Current W3 Node Structure

### Key Nodes in W3 Workflow:
1. **Extract Manifest URL (3)** - Gets 2B manifest
2. **Download 2B Manifest** - Fetches manifest JSON
3. **Build Assembly Input From Manifest** - Normalizes manifest data
4. **Get Order Ready for Assembly** - Initializes assembly state
5. **Load Story & Character Poses (3A)** - Loads story text and character images
6. **Generate Complete HTML** - Generates interior page HTML (p00-p14)
7. **Generate Cover HTML** - Generates cover HTML
8. **Set Cover PNG Filenames/Keys** - Sets cover file paths
9. **Build 3-Manifest** - Creates final manifest with all pages
10. **Various PDFMonkey nodes** - Generate PNGs for pages and cover

### Current Page Flow:
- p00: Dedication page
- p01-p14: Story pages (14 pages)
- Cover: Cover-spread (separate)

### Amazon Page Flow (Required - R2 File Names):
- `page00-covers-barcode.png`: Amazon barcode cover (NEW)
- `page00-title-page.png`: Title page (NEW - "real" page 1)
- `page00-blank.png`: Blank page (NEW - between title and dedication)
- `page00-dedication.png`: Dedication page (existing)
- `page01-{description}.png` through `page14-{description}.png`: Story pages (14 pages, existing)

**Note**: R2 file naming uses `page00-` prefix for special pages, distinguished by suffix

---

## W4 Workflow - Summary of Required Updates

### Nodes Requiring Changes:

1. **"Validate & Normalize W4 Input"** ⚠️ **HIGH PRIORITY**
   - Add order source detection
   - Replace hardcoded `15` with dynamic `expectedPageCount` (15 or 17)
   - Update all page count validations
   - Pass `isAmazonOrder` and `expectedPageCount` downstream

2. **"Validate Cover (SANDBOX)"** ⚠️ **HIGH PRIORITY**
   - Replace hardcoded `"interior_page_count": 15` with dynamic value
   - Read `expectedPageCount` from upstream node

3. **"Validate Cover (PRODUCTION)"** ⚠️ **HIGH PRIORITY** (if exists)
   - Same changes as SANDBOX version

4. **"Build Lulu Print Job Payload"** ⚠️ **MEDIUM PRIORITY** (conditional)
   - Only if POD package needs to change for 17 pages
   - Add conditional `podPackageId` selection based on `isAmazonOrder`

### Nodes NOT Requiring Changes:

- **"Build Pages HTML (8.75in)1"** - Already handles dynamic array length
- **"Process Lulu Response"** - No page count references
- **"Build 4-Manifest JSON"** - No page count validation
- All other nodes - No page count dependencies

### Total W4 Nodes to Update: **2-3 nodes** (depending on POD package decision)

