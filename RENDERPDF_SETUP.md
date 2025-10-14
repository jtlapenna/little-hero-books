# RenderPDF.io Integration Setup Guide

## 🚀 **Quick Setup Steps**

### **1. Get Your API Key**
1. Go to [RenderPDF.io](https://renderpdf.io/app)
2. Sign up for a free account
3. Navigate to your dashboard
4. Copy your API key

### **2. Set Environment Variable**
Add your API key to your `.env` file:
```bash
echo "RENDERPDF_API_KEY=your-api-key-here" >> .env
```

### **3. Test the Integration**
Run the test script to verify everything works:
```bash
node test-renderpdf-integration.js
```

### **4. Update n8n Workflow**
The workflow has been updated to use RenderPDF.io:
- ✅ **URL**: `https://renderpdf.io/api/pdfs/render-sync`
- ✅ **Headers**: Authorization with API key
- ✅ **Body**: `htmlContent` and `filename`
- ✅ **Response**: Downloads PDF and uploads to R2

---

## 📊 **Pricing & Limits**

### **Free Tier**
- ✅ **500 PDF renders per month**
- ✅ **Perfect for testing and small volumes**
- ✅ **No credit card required**

### **Paid Plans**
- **Starter**: $9/month for 1,000 PDFs
- **Growth**: $29/month for 5,000 PDFs
- **Business**: $99/month for 20,000 PDFs

---

## 🔧 **Workflow Changes Made**

### **Updated Nodes:**
1. **"Generate PDF Page"** → Now calls RenderPDF.io API
2. **"Download PDF from RenderPDF and Save to R2"** → Downloads PDF from RenderPDF.io
3. **"Upload PDF to R2"** → Uploads downloaded PDF to R2 storage

### **Request Format:**
```json
{
  "htmlContent": "{{ $json.html }}",
  "filename": "page{{ $json.currentPageNumber }}_{{ $json.amazonOrderId }}.pdf"
}
```

### **Response Format:**
```json
{
  "fileUrl": "https://renderpdf.io/cdn/...",
  "filename": "page01_TEST-ORDER-001.pdf",
  "status": "success"
}
```

---

## 🧪 **Testing Your Setup**

### **1. Test API Key**
```bash
# Set your API key
export RENDERPDF_API_KEY="your-api-key-here"

# Run the test
node test-renderpdf-integration.js
```

### **2. Test Workflow 3**
1. Upload the updated workflow to n8n
2. Use the test payload from `test-payload-workflow3.json`
3. Run the workflow and check the execution logs

### **3. Verify PDF Generation**
- Check that PDFs are generated successfully
- Verify PDFs are uploaded to R2 storage
- Confirm PDF quality and content

---

## 🚨 **Troubleshooting**

### **Common Issues:**

**"No PDF URL returned from RenderPDF.io"**
- Check your API key is correct
- Verify you haven't exceeded monthly limits
- Check RenderPDF.io service status

**"Failed to download PDF"**
- PDF URL might be expired
- Check network connectivity
- Verify PDF was generated successfully

**"HTTP 401 Unauthorized"**
- API key is missing or incorrect
- Check environment variable is set correctly

### **Debug Steps:**
1. Check n8n execution logs
2. Verify API key in environment variables
3. Test with the standalone test script
4. Check RenderPDF.io dashboard for usage stats

---

## 🎯 **Next Steps**

1. **Get API Key** from RenderPDF.io
2. **Set Environment Variable** in your `.env` file
3. **Test Integration** with the test script
4. **Upload Updated Workflow** to n8n
5. **Test End-to-End** with your simulation payload

The integration is now ready for testing! 🚀
