# Manual Steps Required: PDFMonkey Image Template Setup

## Overview

Workflow 3 now generates preview images using PDFMonkey's native image generation feature. This requires creating a separate image template in PDFMonkey.

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

### 2. Get Template ID

1. After creating the template, copy the **Template ID**
2. The Template ID will look something like: `abc123def456`

### 3. Update Workflow 3

1. Open Workflow 3 in n8n: `LHB - 3 -Book Assembly`
2. Find the **"Generate Page Preview Images"** node
3. Update the code to use your template ID:
   ```javascript
   pdfMonkeyImageTemplateId: order.pdfMonkeyImageTemplateId || 'YOUR_TEMPLATE_ID_HERE'
   ```
   Or set it as an environment variable in n8n and reference it in the node.

### 4. Alternative: Set as Environment Variable

Instead of hardcoding, you can:
1. In n8n, go to Settings → Environment Variables
2. Add: `PDFMONKEY_IMAGE_TEMPLATE_ID` = `your-template-id`
3. Update the node to use: `process.env.PDFMONKEY_IMAGE_TEMPLATE_ID`

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

