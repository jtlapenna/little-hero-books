# Little Hero Books - Workflow Update Blueprint v3.0
## PNG-First Approach with Approval Gates & Lulu API Requirements

---

## **Document Changes**
**v1.0 → v2.0:** Added Lulu API requirements (separate interior + cover PDFs)  
**v2.0 → v3.0:** PNG-first architecture + confirmed Lulu specifications + split workflows + approval gates

---

## **Confirmed Lulu API Specifications**

### **Interior Pages (15 pages total)**
```
Trim size:          8.5" x 8.5" (216mm x 216mm)
With bleed:         8.75" x 8.75" (222mm x 222mm)
At 300 DPI:         2625 x 2625 pixels ← CONFIRMED (not 2550)

Bleed:              0.125" all sides (37.5px @ 300 DPI)
Safety margin:      0.5" from trim edge (150px @ 300 DPI)
Resolution:         300 PPI minimum
Color space:        sRGB or CMYK
```

### **Cover Spread (single-page PDF)**
```
Base dimensions:    17.25" x 8.75" (+ spine width)
Spine width:        (pages / 444) + 0.06"
                    = (15 / 444) + 0.06 = 0.094" (28px @ 300 DPI)

Total width:        17.25" + 0.094" = 17.344"
Total height:       8.75"
At 300 DPI:         5203 x 2625 pixels ← CONFIRMED

Bleed:              0.125" all sides
Safety margin:      0.5" from trim edge (0.25" for spine text - NOT RECOMMENDED for thin books)
```

**⚠️ CRITICAL:** Spine is only 0.094" (28px) wide - **DO NOT add text to spine**. Too thin for reliable printing.

---

## **PNG-First Architecture**

### **Why PNG-First?**
✅ Single source of truth for HTML/CSS (no parallel systems)  
✅ Customer preview = exact print output (WYSIWYG)  
✅ Admin approval gate before customer sees anything  
✅ Customer approval gate before committing to print  
✅ Simpler debugging (one rendering path)  
✅ Easier maintenance (maintain ONE HTML/CSS system)  
✅ Can regenerate PDFs without regenerating PNGs  
✅ Guaranteed preview accuracy  

### **File Generation Flow**
```
Generate HTML/CSS (single source)
    ↓
PDFMonkey → Generate PNGs (16 total)
    ├─→ page-00-dedication.png (2625x2625)
    ├─→ page-01.png ... page-14.png (2625x2625 each)
    └─→ cover-spread.png (5203x2625)
    ↓
Upload to R2
    ↓
[APPROVAL GATE: Admin Review]
    ↓
[APPROVAL GATE: Customer Review]
    ↓
Convert Approved PNGs → PDFs
    ├─→ Interior PDF (15 pages)
    └─→ Cover PDF (1 page spread)
    ↓
Submit to Lulu API
```

---

## **SW0 - Base Character Generation**
### Status: ✅ NO CHANGES REQUIRED
The base character workflow generates the character used throughout the book, including for the new cover pose. No modifications needed.

---

## **SW1 - Pose Generation**

### **Node: "Build Dynamic Pose Prompt"**
**Updates Required:**
1. Update `clampPose()` function: Change `Math.min(12, n)` to `Math.min(13, n)`
2. Add pose 13 entry to `POSE_PROMPT_MAP` object with description for cover pose (e.g., standing front-facing, confident pose suitable for cover)
3. Add pose 13 entry to `POSE_NEGATIVES` object with constraint list for cover pose

### **Node: "Prepare Gemini (POSE)" (if it has separate clamping)**
**Updates Required:**
1. Update `clampPose()` function: Change `Math.max(1, Math.min(12, n))` to `Math.max(1, Math.min(13, n))`

### **Node: "Schema Check + Defaults" / "Schema/Defaults"**
**Updates Required:**
1. Update any pose validation logic that checks for max pose number from 12 to 13

### **Node: "Resolve Pose Ref (IMAGE P)"**
**Updates Required:**
1. Update `clamp()` function: Change `Math.min(12, ...)` to `Math.min(13, ...)`
2. Ensure pose-13.png reference file exists in the static poses library

---

## **SW2 - Pose and Style QA**
### Status: ✅ NO CHANGES REQUIRED
QA workflow processes any image that enters it. No pose-count dependencies. Works for 12 or 13 poses.

---

## **2B - Background Removal**
### Status: ✅ NO CHANGES REQUIRED
Background removal workflow processes images individually with no pose-count constraints. Works for any number of poses.

---

## **SW3 - Upload**
### Status: ✅ NO CHANGES REQUIRED
Upload workflow handles individual file uploads. No pose-count dependencies.

---

## **2A - Orchestrator**

### **Node: "Create Final Summary"**
**Updates Required:**
1. Update any hardcoded references or validations that expect exactly 12 poses
2. Update `counts.total` validation logic to expect 13 poses
3. Update `progress.readyForBook` condition to check for 13 approved poses

### **Node: Any validation/counting nodes**
**Updates Required:**
1. Search for hardcoded "12" references related to pose counts
2. Update to 13 poses
3. Ensure manifest validation expects 13 entries

---

## **Workflow 3A - PNG Generation & Approval**

### **Purpose**
Generate all PNG assets for preview and print, with admin and customer approval gates before PDF generation.

### **Workflow Structure**

```
[Download 2B Manifest]
        ↓
[Build Assembly Input From Manifest]
        ↓
[Get Order Ready for Assembly]
        ↓
[Load Generated Characters] (13 poses)
        ↓
[Load Background Images] (15 backgrounds)
        ↓
[Load Story Text]
        ↓
[Generate Complete HTML] ← SINGLE SOURCE OF TRUTH
        ↓
        ├─────────────────────┬─────────────────────┐
        ↓                     ↓                     ↓
   DEDICATION PAGE    STORY PAGES (14)      COVER SPREAD
   (page-00)          (page-01 to 14)       (back+spine+front)
        ↓                     ↓                     ↓
[Generate Dedication PNG] [Loop: Generate Story PNGs] [Generate Cover Spread PNG]
   2625x2625                2625x2625 each            5203x2625
        ↓                     ↓                     ↓
[Upload to R2]           [Upload to R2]         [Upload to R2]
        ↓                     ↓                     ↓
        └─────────────────────┴─────────────────────┘
                              ↓
                    [Collect All PNG URLs]
                              ↓
                    [Build 3A Manifest]
                    • status: "pending_admin_review"
                    • previewImages: [16 PNG URLs]
                    • dedicationImage: {...}
                    • storyImages: [14 images]
                    • coverSpreadImage: {...}
                              ↓
                    [Upload 3A Manifest to R2]
                              ↓
                    [Webhook: Notify Admin Dashboard]
                              ↓
                    ═════════════════════════
                    ║  GATE: Admin Review   ║
                    ═════════════════════════
                              ↓
                    [Admin Approves]
                    Update status: "pending_customer_review"
                              ↓
                    [Webhook: Notify Customer Preview]
                              ↓
                    ═════════════════════════
                    ║ GATE: Customer Review ║
                    ═════════════════════════
                              ↓
                    [Customer Approves]
                    Update status: "ready_for_print"
                              ↓
                    [Trigger Workflow 4]
```

---

## **Workflow 3A - Node Details**

### **Node: "Get Order Ready for Assembly"**
**Updates Required:**
1. Update `totalPagesRequired` from 14 to 15 (adding 1 dedication page to interior)
2. Ensure `processedImages` array can handle 13 poses instead of 12
3. **CRITICAL:** Validate that all dimensions are set to **2625x2625** (not 2550)

### **Node: "Generate Complete HTML"**
**Updates Required:**
1. Generate HTML for **3 distinct output types** (all from single CSS system):
   - **Dedication page** (page-00):
     - Dynamic: Custom dedication text from order data
     - Static: Background image, decorative elements
     - Dimensions: 2625x2625px
   
   - **Story pages** (page-01 through page-14):
     - Dynamic: Story text, character images, page numbers
     - Static: Background images per page
     - Dimensions: 2625x2625px each
   
   - **Cover spread**:
     - Dynamic: Character image (pose 13), child's name, optional animal guide
     - Static: Front/back backgrounds, barcode placement area
     - Dimensions: 5203x2625px (back 2587px + spine 29px + front 2587px)
     - Layout: CSS positioned sections for back cover, spine, front cover

2. **Export complete CSS** with page_css including:
   ```css
   @page { size: 2625px 2625px; margin: 0; }  /* For interior pages */
   @page { size: 5203px 2625px; margin: 0; }  /* For cover spread */
   * { box-sizing: border-box; margin: 0; padding: 0; }
   body { width: 2625px; height: 2625px; overflow: hidden; }
   ```

3. Ensure all font imports, image URLs, and styles are inline (no external dependencies)

### **Node: "Generate Dedication PNG"**
**New Node - Add to workflow:**
- Input: Dedication HTML from "Generate Complete HTML"
- Process through PDFMonkey image template
- Dimensions: 2625x2625px at 300 DPI
- Output format: PNG
- Filename: `page-00-dedication_preview.png`

### **Node: "Loop: Generate Story PNGs"**
**New Node - Add to workflow:**
- Input: Story pages HTML (pages 1-14) from "Generate Complete HTML"
- **CRITICAL:** Set node to "Run Once for Each Item" (manual UI setting required after import)
- Loop through 14 story pages
- Process each through PDFMonkey image template
- Dimensions: 2625x2625px at 300 DPI per page
- Output format: PNG
- Filename pattern: `page-{01-14}_preview.png`

### **Node: "Generate Cover Spread PNG"**
**New Node - Add to workflow:**
- Input: Cover spread HTML from "Generate Complete HTML"
- Process through PDFMonkey image template
- Dimensions: 5203x2625px at 300 DPI
- Layout sections:
  - Back cover: 0-2587px (8.625" at 300 DPI)
  - Spine: 2587-2616px (29px = 0.097" at 300 DPI)
  - Front cover: 2616-5203px (8.625" at 300 DPI)
- Output format: PNG
- Filename: `cover-spread_preview.png`
- **⚠️ Note:** Spine too thin for text (29px) - use solid color or subtle design only

### **Node: "Upload to R2" (3 instances)**
**Updates Required:**
1. Upload dedication PNG to R2 bucket
2. Upload all 14 story PNGs to R2 bucket (loop through)
3. Upload cover spread PNG to R2 bucket
4. Return public URLs for all uploaded files

### **Node: "Collect All PNG URLs"**
**New Node - Add to workflow:**
- Merge outputs from all three upload branches
- Organize URLs into structured array:
  ```javascript
  {
    dedicationImage: {
      pageNumber: 0,
      filename: "page-00-dedication_preview.png",
      url: "https://...",
      dimensions: { width: 2625, height: 2625 }
    },
    storyImages: [
      {
        pageNumber: 1,
        filename: "page-01_preview.png",
        url: "https://...",
        dimensions: { width: 2625, height: 2625 }
      },
      // ... pages 2-14
    ],
    coverSpreadImage: {
      filename: "cover-spread_preview.png",
      url: "https://...",
      dimensions: { width: 5203, height: 2625 }
    }
  }
  ```

### **Node: "Build 3A Manifest"**
**New Node - Add to workflow:**
- Create manifest structure:
  ```javascript
  {
    orderId: "...",
    workflowVersion: "3A",
    status: "pending_admin_review",
    createdAt: "...",
    pngGeneration: {
      completedAt: "...",
      totalPngs: 16,
      dedicationImage: { ... },
      storyImages: [ ... ], // 14 items
      coverSpreadImage: { ... }
    },
    specifications: {
      interiorDimensions: "2625x2625",
      coverDimensions: "5203x2625",
      resolution: 300,
      pageCount: 15,
      trimSize: "8.5x8.5",
      spineWidth: "0.094",
      bleed: "0.125"
    },
    approvals: {
      admin: {
        status: "pending",
        reviewUrl: "https://admin.littleherolabs.com/review/{orderId}"
      },
      customer: {
        status: "not_ready", // Will change after admin approval
        reviewUrl: "https://preview.littleherolabs.com/{orderId}"
      }
    },
    nextWorkflow: {
      trigger: "workflow_4",
      condition: "both_approvals_complete"
    }
  }
  ```

### **Node: "Upload 3A Manifest to R2"**
**Updates Required:**
- Upload manifest JSON to R2
- Store at: `orders/{orderId}/manifest-3a.json`
- Return public URL

### **Node: "Webhook: Notify Admin Dashboard"**
**New Node - Add to workflow:**
- Send webhook to admin dashboard system
- Payload includes:
  - Order ID
  - Preview image URLs
  - Review dashboard URL
  - Order metadata (customer name, book title, etc.)
- Triggers admin email/notification for review

### **Node: "Admin Review Gate"**
**Process (External to n8n):**
- Admin views all 16 PNGs in dashboard
- Checks for:
  - Image quality issues
  - Character consistency
  - Text readability
  - Layout problems
  - Color accuracy
- Admin action: **Approve** or **Request Regeneration**
- If approved:
  - Update manifest status to "pending_customer_review"
  - Trigger "Webhook: Notify Customer Preview"
- If regeneration requested:
  - Return to appropriate workflow point
  - Log rejection reason

### **Node: "Webhook: Notify Customer Preview"**
**New Node - Add to workflow:**
- Triggered after admin approval
- Send notification to customer (email/SMS)
- Payload includes:
  - Preview gallery URL
  - Book details
  - Approval CTA
- Customer receives link to interactive preview

### **Node: "Customer Review Gate"**
**Process (External to n8n):**
- Customer views all 16 PNGs in interactive preview
- Reviews:
  - Character likeness
  - Overall aesthetic
  - Dedication text
  - Story page layouts
  - Cover design
- Customer action: **Approve** or **Request Changes**
- If approved:
  - Update manifest status to "ready_for_print"
  - Trigger Workflow 4
- If changes requested:
  - Escalate to admin/support
  - Determine if regeneration needed

### **Node: "Trigger Workflow 4"**
**New Node - Add to workflow:**
- Triggered when both approvals complete
- Pass to Workflow 4:
  - Order ID
  - 3A Manifest URL
  - All approved PNG URLs
- Workflow 4 executes PDF assembly and Lulu submission

---

## **Workflow 4 - PDF Assembly & Lulu Submission**

### **Purpose**
Convert approved PNGs to print-ready PDFs and submit to Lulu API for printing.

### **Workflow Structure**

```
[Triggered by Workflow 3A]
        ↓
[Download 3A Manifest]
        ↓
[Fetch Approved PNGs from R2]
        ↓
[Validate PNG Integrity]
        ↓
        ├───────────────────┬───────────────────┐
        ↓                   ↓                   ↓
[Generate Interior PDF] [Generate Cover PDF] [Calculate Spine]
   (15 pages)              (1 spread)          (from page count)
        ↓                   ↓                   ↓
[Validate Interior PDF] [Validate Cover PDF]  │
        ↓                   ↓                   │
[Upload Interior to R2] [Upload Cover to R2] ──┘
        ↓                   ↓
        └───────────────────┴───────────────────┐
                                                 ↓
                                    [Build Lulu API Payload]
                                                 ↓
                                    [Submit to Lulu API]
                                                 ↓
                                    [Receive Lulu Order ID]
                                                 ↓
                                    [Build 4 Manifest]
                                    • status: "sent_to_printer"
                                    • luluOrderId
                                    • estimatedShipDate
                                                 ↓
                                    [Upload 4 Manifest to R2]
                                                 ↓
                                    [Webhook: Notify Admin]
                                                 ↓
                                    [Webhook: Notify Customer]
```

---

## **Workflow 4 - Node Details**

### **Node: "Download 3A Manifest"**
**New Node:**
- Input: Manifest URL from Workflow 3A trigger
- Download manifest JSON from R2
- Validate status is "ready_for_print"
- Extract PNG URLs for processing

### **Node: "Fetch Approved PNGs from R2"**
**New Node:**
- Input: PNG URLs from 3A manifest
- Download all 16 PNGs:
  - 1 dedication (page-00)
  - 14 story pages (page-01 to 14)
  - 1 cover spread
- Store temporarily for PDF embedding
- Validate file sizes and dimensions

### **Node: "Validate PNG Integrity"**
**New Node:**
- Check each PNG:
  - Correct dimensions (2625x2625 or 5203x2625)
  - File not corrupted
  - Resolution metadata confirms 300 DPI
- If validation fails:
  - Log error
  - Notify admin
  - Halt workflow

### **Node: "Calculate Spine Width"**
**New Node:**
- Formula: `(pageCount / 444) + 0.06`
- For 15 pages: `(15 / 444) + 0.06 = 0.094 inches`
- Convert to pixels: `0.094 * 300 = 28.2px` (round to 29px)
- Pass to cover PDF generation

### **Node: "Generate Interior PDF"**
**New Node:**
- Create simple HTML wrapper for PNG embedding:
  ```html
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      @page { size: 2625px 2625px; margin: 0; }
      body { margin: 0; padding: 0; }
      img { width: 2625px; height: 2625px; display: block; }
    </style>
  </head>
  <body>
    <!-- Embed all 15 PNGs as pages -->
    <img src="page-00-dedication.png" />
    <img src="page-01.png" />
    <!-- ... pages 02-14 -->
  </body>
  </html>
  ```
- Process through PDFMonkey or similar PDF generator
- Output: Multi-page PDF (15 pages)
- Filename: `interior_${orderId}.pdf`

### **Node: "Generate Cover PDF"**
**New Node:**
- Create simple HTML wrapper for cover PNG:
  ```html
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      @page { size: 5203px 2625px; margin: 0; }
      body { margin: 0; padding: 0; }
      img { width: 5203px; height: 2625px; display: block; }
    </style>
  </head>
  <body>
    <img src="cover-spread.png" />
  </body>
  </html>
  ```
- Process through PDFMonkey or similar PDF generator
- Output: Single-page PDF (cover spread)
- Filename: `cover_${orderId}.pdf`

### **Node: "Validate Interior PDF"**
**New Node:**
- Check PDF properties:
  - Page count = 15
  - Each page dimensions = 2625x2625px
  - No compression artifacts
  - Embedded images at 300 DPI
- If validation fails, halt and notify

### **Node: "Validate Cover PDF"**
**New Node:**
- Check PDF properties:
  - Page count = 1
  - Dimensions = 5203x2625px
  - No compression artifacts
  - Embedded image at 300 DPI
- If validation fails, halt and notify

### **Node: "Upload Interior to R2"**
**New Node:**
- Upload interior PDF to R2 bucket
- Path: `orders/{orderId}/pdfs/interior_${orderId}.pdf`
- Return public URL
- Set appropriate cache headers

### **Node: "Upload Cover to R2"**
**New Node:**
- Upload cover PDF to R2 bucket
- Path: `orders/{orderId}/pdfs/cover_${orderId}.pdf`
- Return public URL
- Set appropriate cache headers

### **Node: "Build Lulu API Payload"**
**New Node:**
- Construct Lulu API request:
  ```javascript
  {
    "contact_email": "...",
    "line_items": [
      {
        "title": "Little Hero Book - {childName}",
        "cover": "https://.../cover_${orderId}.pdf",
        "interior": "https://.../interior_${orderId}.pdf",
        "pod_package_id": "...", // Lulu's product ID for 8.5x8.5 paperback
        "quantity": 1
      }
    ],
    "production_delay": 120, // minutes buffer
    "shipping_address": {
      "name": "...",
      "street1": "...",
      "city": "...",
      "state_code": "...",
      "postcode": "...",
      "country_code": "US"
    },
    "shipping_level": "STANDARD" // or customer's choice
  }
  ```
- Validate all required fields present
- Ensure PDF URLs are publicly accessible

### **Node: "Submit to Lulu API"**
**New Node:**
- HTTP POST to Lulu Print-Job Creation endpoint
- Include authentication headers (API key)
- Handle rate limits / retries
- Capture response:
  - Lulu order ID
  - Status
  - Estimated production time
  - Tracking information (when available)

### **Node: "Receive Lulu Order ID"**
**New Node:**
- Extract Lulu order ID from API response
- Store for order tracking
- Log successful submission
- Calculate estimated ship date

### **Node: "Build 4 Manifest"**
**New Node:**
- Create final manifest:
  ```javascript
  {
    orderId: "...",
    workflowVersion: "4",
    status: "sent_to_printer",
    completedAt: "...",
    pdfGeneration: {
      interior: {
        filename: "interior_${orderId}.pdf",
        url: "https://...",
        pageCount: 15,
        fileSize: "...",
        dimensions: "2625x2625"
      },
      cover: {
        filename: "cover_${orderId}.pdf",
        url: "https://...",
        pageCount: 1,
        fileSize: "...",
        dimensions: "5203x2625"
      }
    },
    luluSubmission: {
      orderId: "...", // Lulu's order ID
      submittedAt: "...",
      status: "accepted",
      estimatedShipDate: "...",
      trackingUrl: "..."
    },
    approvals: {
      admin: { status: "approved", approvedAt: "...", approvedBy: "..." },
      customer: { status: "approved", approvedAt: "..." }
    }
  }
  ```

### **Node: "Upload 4 Manifest to R2"**
**New Node:**
- Upload manifest JSON to R2
- Store at: `orders/{orderId}/manifest-4.json`
- Return public URL
- Archive previous manifests (3A, 2B, etc.)

### **Node: "Webhook: Notify Admin"**
**New Node:**
- Send notification to admin system
- Payload:
  - Order successfully sent to printer
  - Lulu order ID
  - Estimated ship date
  - PDF URLs for records

### **Node: "Webhook: Notify Customer"**
**New Node:**
- Send confirmation to customer
- Email/SMS with:
  - Order confirmed and sent to printer
  - Estimated delivery date
  - Tracking link (when available)
  - Thank you message

---

## **Static Assets Required (Outside Workflows)**

### **To Be Created/Added:**
1. **pose-13.png** - Static pose reference image for front cover character pose
2. **dedication-background.png** - Background image for dedication page (interior)
3. **cover-template-spread.png** - Base template for cover spread with:
   - Bleed guides (0.125" all sides)
   - Safety margin guides (0.5" from trim)
   - Spine width area marked
   - Back cover, spine, and front cover sections clearly defined
4. **Animal guide images** - Static images for animals on cover (if not already existing)
5. **ISBN/EAN barcode** - Generated barcode image for back cover (for retail distribution)

### **Storage Location:**
- Pose reference: `book-mvp-simple-adventure/characters/poses/pose-13.png`
- Backgrounds: `book-mvp-simple-adventure/templates/backgrounds/[filename].png`
- Cover template: `book-mvp-simple-adventure/templates/covers/lulu-cover-template.png`
- Animal guides: `book-mvp-simple-adventure/templates/animals/[filename].png`
- Barcodes: `book-mvp-simple-adventure/orders/[orderId]/isbn-barcode.png`

---

## **Order Data Schema Updates**

### **Required New Fields in Order Input:**
```javascript
{
  // Existing fields...
  bookCustomization: {
    dedicationText: "Custom dedication message", // For dedication page in interior
    animalGuide: "bear" | "fox" | "owl" | null,  // Optional animal selection for cover
  },
  printSpecifications: {
    trimSize: "8.5x8.5", // inches - square format
    pageCount: 15, // Calculated after interior assembly
    bindingType: "paperback" | "hardcover",
    paperType: "standard" | "premium", // if Lulu offers options
    isbn: "978-XXXXXXXXXX", // For retail distribution barcode
  },
  shippingAddress: {
    name: "...",
    street1: "...",
    street2: "...",
    city: "...",
    state_code: "...",
    postcode: "...",
    country_code: "US"
  }
}
```

---

## **Summary of Changes**

| Workflow | Nodes to Update | Complexity |
|----------|----------------|------------|
| SW0 | 0 nodes | None |
| SW1 | 3-4 nodes | Low - Update pose limit from 12→13, add pose 13 data |
| SW2 | 0 nodes | None |
| 2B | 0 nodes | None |
| SW3 | 0 nodes | None |
| 2A | 1-2 nodes | Low - Update expected pose count 12→13 |
| **Workflow 3A** | **15-20 nodes** | **High** - Complete PNG generation pipeline with approval gates |
| **Workflow 4** | **15-20 nodes** | **High** - PDF assembly and Lulu API integration |

**Total Estimated Effort:** High complexity. Major architectural changes:
- PNG-first approach replaces direct PDF generation
- Two new approval gates (admin + customer)
- Split workflows for better separation of concerns
- New external integrations (admin dashboard, customer preview, Lulu API)

**Critical Technical Considerations:**
1. **Dimension accuracy** - MUST use 2625x2625 (not 2550) for interior pages
2. **Cover spread** - Single 5203x2625 PNG with CSS-positioned sections
3. **Spine width** - 29px too thin for text, use solid color only
4. **Approval flow** - External systems must update manifest status to trigger next workflow
5. **PNG to PDF conversion** - Simple HTML wrapper, no complex rendering needed
6. **Lulu API** - Must handle authentication, rate limits, error responses
7. **PDF validation** - Critical to catch issues before Lulu submission

**Testing Strategy:**
1. **Phase 1:** Test SW1 with pose 13 generation
2. **Phase 2:** Test 2A orchestrator with 13-pose validation
3. **Phase 3:** Test Workflow 3A PNG generation (all 16 PNGs)
4. **Phase 4:** Test approval flow (admin → customer → ready_for_print)
5. **Phase 5:** Test Workflow 4 PNG→PDF conversion
6. **Phase 6:** Test PDF validation against Lulu requirements
7. **Phase 7:** Test Lulu API submission (sandbox first)
8. **Phase 8:** End-to-end test with real order

---

## **Implementation Order (Recommended)**

### **Phase 1: Foundation Updates** (Week 1)
1. Update SW1 for pose 13 support
2. Update 2A Orchestrator for 13-pose validation
3. Create and upload static assets (pose-13.png, backgrounds, templates)
4. Update dimensions in existing Workflow 3 from 2550→2625

### **Phase 2: Workflow 3A - PNG Generation** (Week 2-3)
5. Create "Generate Complete HTML" node (single source of truth)
6. Create three PNG generation branches (dedication, story pages, cover)
7. Implement R2 upload for all PNGs
8. Build "Collect All PNG URLs" aggregation node
9. Create 3A manifest structure
10. Test end-to-end PNG generation (16 PNGs total)

### **Phase 3: Approval Gates** (Week 3-4)
11. Build admin dashboard for preview/approval
12. Build customer preview interface
13. Implement status update webhooks
14. Test approval flows (admin → customer → ready_for_print)

### **Phase 4: Workflow 4 - PDF Assembly** (Week 4-5)
15. Create "Fetch Approved PNGs" node
16. Create "Generate Interior PDF from PNGs" node
17. Create "Generate Cover PDF from PNG" node
18. Implement PDF validation nodes
19. Upload PDFs to R2
20. Test PDF generation from PNGs

### **Phase 5: Lulu Integration** (Week 5-6)
21. Create "Build Lulu API Payload" node
22. Implement "Submit to Lulu API" node with error handling
23. Build 4 manifest structure
24. Implement customer/admin notification webhooks
25. Test with Lulu sandbox environment

### **Phase 6: Integration & Testing** (Week 6-7)
26. End-to-end test (SW0 → SW1 → 2A → 3A → approval → 4 → Lulu)
27. Validate PDFs with Lulu's preflight tools
28. Load testing (multiple concurrent orders)
29. Error recovery testing (API failures, approval rejections)
30. Production deployment

---

## **Visual Workflow Structure**

```
                    ┌─────────────────────────────────────────┐
                    │     Workflow 3A: PNG Generation         │
                    │                                         │
                    │  Generate HTML → Generate 16 PNGs      │
                    │      ↓                                  │
                    │  Upload to R2                           │
                    │      ↓                                  │
                    │  Build 3A Manifest                      │
                    │  status: "pending_admin_review"         │
                    │      ↓                                  │
                    │  ╔═══════════════════════╗             │
                    │  ║  GATE: Admin Review   ║             │
                    │  ╚═══════════════════════╝             │
                    │      ↓                                  │
                    │  Update status: "pending_customer"      │
                    │      ↓                                  │
                    │  ╔═══════════════════════╗             │
                    │  ║ GATE: Customer Review ║             │
                    │  ╚═══════════════════════╝             │
                    │      ↓                                  │
                    │  Update status: "ready_for_print"       │
                    │      ↓                                  │
                    │  Trigger Workflow 4                     │
                    └─────────────────────────────────────────┘
                                    ↓
                    ┌─────────────────────────────────────────┐
                    │   Workflow 4: PDF Assembly & Lulu       │
                    │                                         │
                    │  Fetch Approved PNGs                    │
                    │      ↓                                  │
                    │  Generate Interior PDF (15 pages)       │
                    │  Generate Cover PDF (1 spread)          │
                    │      ↓                                  │
                    │  Validate PDFs                          │
                    │      ↓                                  │
                    │  Upload PDFs to R2                      │
                    │      ↓                                  │
                    │  Build Lulu API Payload                 │
                    │      ↓                                  │
                    │  Submit to Lulu API                     │
                    │      ↓                                  │
                    │  Receive Lulu Order ID                  │
                    │      ↓                                  │
                    │  Build 4 Manifest                       │
                    │  status: "sent_to_printer"              │
                    │      ↓                                  │
                    │  Notify Customer & Admin                │
                    └─────────────────────────────────────────┘
```

---

**Document Version:** 3.0  
**Created:** For Little Hero Labs cover pages project  
**Updated:** PNG-first architecture + confirmed Lulu specs + split workflows  
**Status:** Blueprint - Ready for implementation
