# Cloudflare Pages Setup for Little Hero Books

## 🎯 Overview
This guide walks you through setting up automatic deployment from GitHub to Cloudflare Pages for the Little Hero Books backend.

## 📋 Prerequisites
- ✅ GitHub repository: `jtlapenna/little-hero-books`
- ✅ Domain purchased: `littleherolabs.com` (in Cloudflare)
- ✅ Next.js application ready in `back-end/` directory
- ✅ Cloudflare account with Pages access

---

## 🚀 Deployment Steps

### Step 1: Connect GitHub Repository to Cloudflare Pages

1. **Login to Cloudflare Dashboard**
   - Go to https://dash.cloudflare.com/
   - Navigate to **Workers & Pages** → **Pages**
   - Click **Create a project**

2. **Connect to Git**
   - Select **Connect to Git**
   - Choose GitHub and authorize Cloudflare
   - Select repository: `jtlapenna/little-hero-books`
   - Click **Begin setup**

---

### Step 2: Configure Build Settings

**Build Configuration**:
- **Framework preset**: `Next.js` (automatic detection)
- **Build command**: `cd back-end && npm install && npm run build`
- **Build output directory**: `.next` (or leave blank for auto-detection)
- **Root directory**: Leave blank (default)

**Advanced Build Settings** (if needed):
```
NODE_VERSION=20
```

**Note**: You can use the `_cloudflare/build.sh` script as an alternative build method.

---

### Step 3: Set Environment Variables

Add these environment variables in Cloudflare Pages settings:

**Required Variables**:
```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://mdnthwpcnphjnnblbvxk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Cloudflare R2 (for asset storage)
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
R2_BUCKET_NAME=little-hero-assets
CLOUDFLARE_ACCOUNT_ID=your_account_id

# Application
NEXT_PUBLIC_APP_URL=https://littleherolabs.com
NODE_ENV=production
```

**How to Add**:
1. In Pages settings, go to **Settings** → **Environment variables**
2. Add each variable for both **Production** and **Preview** environments
3. Click **Save**

---

### Step 4: Configure Custom Domain

1. **In Cloudflare Pages**:
   - Go to your project → **Custom domains**
   - Click **Set up a custom domain**
   - Enter: `littleherolabs.com`
   - Click **Continue**
   - Cloudflare will automatically configure DNS

2. **Verify DNS**:
   - Go to Cloudflare → **DNS** settings
   - Ensure CNAME record is created for your domain
   - SSL/TLS should auto-configure

---

### Step 5: Enable Automatic Deployments

**Automatic deployments are enabled by default**, which means:
- Every push to `main` branch = Production deployment
- Every pull request = Preview deployment
- Every commit = Automatic build

**To verify**:
1. Make a small commit and push to GitHub
2. Check Cloudflare Pages dashboard
3. Deployment should start automatically

---

## 🔄 Workflow: Auto-Deploy on Git Push

Once configured, here's the automatic workflow:

```
Git Push → GitHub
    ↓
Cloudflare Pages detects changes
    ↓
Clones repository
    ↓
Runs build command (back-end/.next)
    ↓
Deploys to littleherolabs.com
    ↓
Your site is live!
```

---

## 📊 Deployment Status

**Check deployment status**:
- **Cloudflare Dashboard** → Pages → Your project → Deployments
- Each deployment shows:
  - Status (Building, Success, Failed)
  - Commit message
  - Build logs
  - Deployment URL

---

## 🛠️ Troubleshooting

### Build Fails
1. Check **Build logs** in Cloudflare Pages
2. Verify Node version (should be 20)
3. Check environment variables are set correctly
4. Verify `back-end/package.json` exists

### Domain Not Working
1. Check DNS settings in Cloudflare
2. Ensure SSL/TLS is enabled (Automatic)
3. Clear browser cache
4. Verify DNS propagation: `dig littleherolabs.com`

### Environment Variables Not Loading
1. Ensure variables are set for correct environment (Production/Preview)
2. Restart deployment after adding variables
3. Check variable names match code

---

## 🎯 Next Steps

After deployment is working:

1. ✅ **Test the site** - Visit https://littleherolabs.com
2. ✅ **Set up Google Analytics** - Add tracking code
3. ✅ **Configure Search Console** - Verify domain ownership
4. ✅ **Add Ahrefs tracking** - Monitor keyword rankings

---

## 📝 Quick Reference

**Repository**: `jtlapenna/little-hero-books`  
**Domain**: `littleherolabs.com`  
**Framework**: Next.js  
**Build Directory**: `back-end/.next`  
**Auto-Deploy**: Enabled on `main` branch

**Useful Commands**:
```bash
# Local testing
cd back-end
npm run dev

# Production build test
cd back-end
npm run build
npm start
```

---

## ✅ Checklist

- [ ] Cloudflare Pages account created
- [ ] GitHub repository connected
- [ ] Build settings configured
- [ ] Environment variables added
- [ ] Custom domain configured
- [ ] First deployment successful
- [ ] Site accessible at littleherolabs.com
- [ ] SSL certificate active

---

**Need Help?**
- Cloudflare Pages Docs: https://developers.cloudflare.com/pages/
- Next.js on Cloudflare: https://developers.cloudflare.com/pages/framework-guides/nextjs/

