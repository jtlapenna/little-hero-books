# How to Get a Cloudflare API Token

## 🔑 **Step-by-Step Instructions**

### **Step 1: Go to Cloudflare Dashboard**

1. Log in to your Cloudflare account: https://dash.cloudflare.com/
2. Navigate to: **My Profile** → **API Tokens**
   - Or go directly: https://dash.cloudflare.com/profile/api-tokens

### **Step 2: Create a New Token**

1. Click **"Create Token"** button
2. You'll see template options - choose **"Edit Cloudflare Workers"** or **"Create Custom Token"**

### **Step 3: Configure Token Permissions**

If using **"Create Custom Token"**:

1. **Token Name**: `Little Hero Labs - Pages Deploy` (or any name you prefer)

2. **Permissions**:
   - **Account** → **Cloudflare Pages** → **Edit**
   - **Zone** → **Zone Settings** → **Read** (if needed)
   - **Account** → **Account Settings** → **Read** (if needed)

3. **Account Resources**:
   - Include: **All accounts** (or select your specific account)

4. **Zone Resources** (if applicable):
   - Include: **All zones** (or select specific zones)

### **Step 4: Create and Copy Token**

1. Click **"Continue to summary"**
2. Review permissions
3. Click **"Create Token"**
4. **⚠️ IMPORTANT**: Copy the token immediately - you won't be able to see it again!

---

## 🔐 **Using the Token**

### **Option 1: Environment Variable (Recommended)**

Add to your shell profile (`~/.zshrc` or `~/.bashrc`):

```bash
export CLOUDFLARE_API_TOKEN="your-token-here"
```

Then reload:
```bash
source ~/.zshrc  # or source ~/.bashrc
```

### **Option 2: Per-Session**

```bash
export CLOUDFLARE_API_TOKEN="your-token-here"
cd back-end
npm run pages:deploy
```

### **Option 3: Inline (Less Secure)**

```bash
CLOUDFLARE_API_TOKEN="your-token-here" npm run pages:deploy
```

---

## ✅ **Verify Token Works**

Test your token:

```bash
wrangler whoami
```

Should show your Cloudflare account email.

---

## 🔒 **Security Best Practices**

1. **Never commit tokens to git** - Add to `.gitignore`
2. **Use least privilege** - Only grant permissions needed
3. **Rotate tokens** - Regenerate periodically
4. **Store securely** - Use environment variables or secret managers

---

## 📝 **Quick Reference**

- **Token Creation**: https://dash.cloudflare.com/profile/api-tokens
- **Required Permission**: `Cloudflare Pages` → `Edit`
- **Documentation**: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/

---

## 🐛 **Troubleshooting**

### **"Invalid API Token"**
- Verify token was copied correctly (no extra spaces)
- Check token hasn't expired or been revoked
- Ensure token has correct permissions

### **"Insufficient Permissions"**
- Verify token has `Cloudflare Pages` → `Edit` permission
- Check account resources include your account

### **"Token Not Found"**
- Make sure you're using the API Token (not Global API Key)
- Verify token is set in environment: `echo $CLOUDFLARE_API_TOKEN`

