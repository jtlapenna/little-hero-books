# Manual Steps Required: PDFMonkey Image Template Setup

## Overview

Workflow 3 generates both PDFs and preview images using PDFMonkey. You need to provide template IDs for both:
- **PDF Template**: Already exists (for generating the final book PDF)
- **Image Template**: Must be created (for generating preview images)

This guide shows you how to find these template IDs in PDFMonkey.

## Steps Required

### 1. Create Image Template in PDFMonkey

1. Log into your PDFMonkey account: https://app.pdfmonkey.io
2. Navigate to Templates section
3. Create a **new template** (separate from your PDF template)
4. Configure the template:
   - **Template Type**: Image (not PDF)
   - **Output Format**: PNG
   - **Dimensions**: 2550px × 2550px
   - **Template Structure**: Use the same HTML structure as your PDF template
     - The template should accept `pages_html` in the payload
     - Each page is wrapped in `<div class="book-page" id="page-{N}">...</div>`
   - **Background**: White or transparent (as needed)

### 2. Find the Template ID in PDFMonkey

**Step-by-Step Instructions:**

1. **Log into PDFMonkey Dashboard:**
   - Go to: https://app.pdfmonkey.io
   - Sign in with your account

2. **Navigate to Templates:**
   - Click **"Templates"** in the left sidebar menu
   - You'll see a list of all your templates

3. **Find Your PDF Template:**
   - Look for the template you use for generating book PDFs
   - Click on it to open the template details page

4. **Locate the Template ID:**
   - The Template ID is displayed in **multiple places**:
     - **At the top of the template details page** (usually in a header or info box)
     - **In the browser URL**: `https://app.pdfmonkey.io/templates/{TEMPLATE_ID}`
     - **In the template settings/API section** (if available)
   - Template IDs typically look like:
     - UUID format: `5539ddb4-ec78-4ae9-a3fb-db1e7f8dd172`
     - Short format: `abc123def456`
   - **Copy this ID** - this is your PDF template ID

5. **Find Your Image Template ID (after creating it):**
   - After creating the image template in step 1, click on it in the Templates list
   - Follow the same steps above to find and copy its Template ID

**Visual Guide:**
- Template ID is usually shown prominently at the top of the template page
- It may be labeled as "Template ID", "ID", or "Template UUID"
- If you can't find it, check the browser URL while viewing the template

### 3. Set Template IDs in n8n Environment Variables (Recommended)

**This is the recommended approach** - it keeps template IDs out of the workflow code:

1. In n8n, go to **Settings** → **Environment Variables**
2. Add these environment variables:
   - **PDFMONKEY_TEMPLATE_ID** = `your-pdf-template-id` (from step 2 above)
   - **PDFMONKEY_IMAGE_TEMPLATE_ID** = `23277725-4AB0-446A-98C5-CB99C21822B3` (image template ID)
3. Save the environment variables

**Note:** The image template ID `23277725-4AB0-446A-98C5-CB99C21822B3` is already configured as the default in the workflow. You can override it with an environment variable if needed.

**Alternative: Set in Order Data**
- If you prefer, you can pass `pdfMonkeyTemplateId` and `pdfMonkeyImageTemplateId` in the order data when triggering the workflow
- The workflow will check order data first, then fall back to environment variables

### 4. Verify Template IDs Are Set

The workflow will throw a clear error if template IDs are missing:
- "pdfMonkeyTemplateId is required..." (for PDF generation)
- "pdfMonkeyImageTemplateId is required..." (for image generation)

This ensures you don't accidentally use the wrong template or have missing configuration.

## Verification

After setup:
1. Run Workflow 3 for a test order
2. Check that 14 preview images are generated (one per page)
3. Verify images are uploaded to R2 at: `book-mvp-simple-adventure/orders/{orderId}/preview-images/page-{NN}_preview.png`
4. Confirm 3-manifest is created with `bookAssembly.pagePreviewImages` array
5. Test frontend displays preview images correctly on Post-PDF tab

## Notes

- The image template uses the same HTML as the PDF template, just with different output format
- PDFMonkey generates PNG images when `_type: 'png'` is set in the document meta
- Images are 2550×2550 pixels (matching PDF page dimensions)
- Each page is generated as a separate image file

