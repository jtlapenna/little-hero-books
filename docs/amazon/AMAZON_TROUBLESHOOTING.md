# Amazon Integration - Troubleshooting Guide
## Common Issues and Solutions

---

## 🔑 **Getting Refresh Token**

### **Problem: OAuth URL shows blank page**

**Solution 1: Check Solution Provider Portal**
- Go to Solution Provider Portal (where your app is)
- Click "View sandbox credentials" - token may be there
- Click "Edit App" → Check all tabs for Refresh Token

**Solution 2: Try OAuth URL with redirect URI**
```
https://sellercentral.amazon.com/apps/authorize/consent?application_id=YOUR_CLIENT_ID_HERE&state=test123&version=beta&redirect_uri=https://localhost
```
(Replace `https://localhost` with your app's actual redirect URI)

**Solution 3: Ask Your Colleague**
- They have access to Solution Provider Portal
- Ask: "How did you get the Refresh Token?"
- Ask: "What URL did you use?"

**Solution 4: Contact Amazon Support**
- Ask: "How do I get Refresh Token for SP-API sandbox app?"
- Provide your Client ID: `YOUR_CLIENT_ID_HERE`

---

## 🔍 **Finding Solution Provider Portal**

### **Problem: Can't find Solution Provider Portal**

**You're Currently In**: Amazon Developer Console (for Alexa/Appstore apps) - **Wrong portal**

**What You Need**: Solution Provider Portal (for SP-API apps) - **Different portal**

**Solutions**:
1. **Ask Your Colleague**: "What URL did you use to get to Solution Provider Portal?"
2. **Try These URLs**:
   - https://developer.amazon.com/solution-providers
   - https://developer.amazon.com/sp-api/solution-provider
   - https://sellercentral.amazon.com/apps/develop
3. **Check Browser History**: Look for "solution provider" or "sp-api" URLs
4. **May Need Access**: You might need to be added as a user to the Solution Provider account

**What It Looks Like**:
- Title: "Solution Provider Portal" (not "Amazon Developer")
- Green banner: "Congratulations! You've successfully signed up!"
- Table with your app: "Little Hero Labs Printing"
- Blue link: "View sandbox credentials"

---

## 🆔 **Seller ID vs Account ID**

### **Problem: Confused about Seller ID**

**You Have**: Account ID `amzn1.pa.o.A2V719MRGLK48O`

**For SP-API, Use**: `A2V719MRGLK48O` (the part after the last dot)

**Also Try Getting from Seller Central**:
1. Go to: https://sellercentral.amazon.com/
2. Settings → Account Info
3. Look for "Seller ID" (starts with `A`)

**Note**: Solution Provider Portal ≠ Seller Central. You need Seller ID from Seller Central.

---

## 🧪 **Sandbox vs Production**

### **Problem: Not sure if using sandbox or production**

**Check Your `.env.local`**:
```bash
AMAZON_SANDBOX_MODE=true   # Using sandbox
AMAZON_SANDBOX_MODE=false  # Using production
```

**Sandbox Endpoints**: `sandbox.sellingpartnerapi-na.amazon.com`
**Production Endpoints**: `sellingpartnerapi-na.amazon.com`

**Code automatically detects** - no changes needed when switching.

---

## 🔐 **Authentication Errors**

### **"Access token not found"**
- Make sure "Get Amazon Access Token" node runs before other nodes
- Check node connections
- Verify Refresh Token is set in `.env.local`

### **"Amazon authentication failed"**
- Check Refresh Token is valid (starts with `Atzr|`)
- Verify Client ID and Secret are correct
- Ensure OAuth flow completed successfully
- For sandbox: Make sure you're using sandbox credentials

### **"Rate limit exceeded"**
- Reduce polling frequency (use 15-20 minutes instead of 10)
- Add delays between API calls
- Check Amazon SP-API rate limits

---

## 📦 **Order Fetching Issues**

### **"No orders returned"**
- Check order status filter (currently `Unshipped`)
- Verify time window (currently last 24 hours)
- Check if orders exist in Amazon Seller Central
- For sandbox: May have limited test orders

### **"Customization fields missing"**
- Check Amazon Custom listing has fields configured
- Verify field names match exactly (case-sensitive)
- Review "Fetch Order Items" node output to see actual structure
- Field names may vary: "Child's Name" vs "Child Name" vs "childName"

---

## 🌐 **Environment Variables**

### **"Environment variable not set"**
- Make sure file is named exactly `.env.local` (not `.env.local.txt`)
- Make sure file is in `back-end/` directory
- Restart backend server after changes: `npm run dev`
- For n8n: Add env vars in n8n Settings → Environment Variables

---

## 🔄 **Switching to Production**

### **When Ready to Go Live**

1. **Get Production Credentials**:
   - Same process, but from Seller Central (not Solution Provider Portal)
   - Get production Client ID, Secret, Refresh Token, Seller ID

2. **Update `.env.local`**:
   - Replace all credentials with production values
   - Set `AMAZON_SANDBOX_MODE=false`

3. **Restart Services**:
   - Restart backend
   - Restart n8n workflows

**No code changes needed** - code automatically uses correct endpoints.

---

## 📧 **Amazon Message Center**

### **"Message Center not working"**
- Verify AWS IAM credentials are set in `.env.local`
- Check `confirmCustomizationDetails` is allowed for the order
- Ensure order is in correct status (Unshipped)
- May not work in sandbox (requires real orders)

### **"AWS credentials missing"**
- AWS IAM is only needed for Message Center
- Can be set up later - not required for basic order fetching
- See Part 1B in `AMAZON_SETUP_GUIDE.md` for setup steps

---

## ✅ **Quick Reference**

### **Your Current Credentials**
- Client ID: `YOUR_CLIENT_ID_HERE` ✅
- Client Secret: `YOUR_CLIENT_SECRET_HERE` ✅
- Seller ID: `A2V719MRGLK48O` ✅ (try this first)
- Refresh Token: ⚠️ Still need

### **Next Steps**
1. Get Refresh Token (see "Getting Refresh Token" section above)
2. Update `.env.local` with Refresh Token
3. Set up n8n workflow (see `AMAZON_N8N_CODE.md`)
4. Test order fetching
5. Set up AWS IAM (optional - for Message Center)

---

**Most Common Issue**: Can't find Refresh Token → Check Solution Provider Portal → "View sandbox credentials" or ask your colleague! 🚀

