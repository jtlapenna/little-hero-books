# Vercel Environment Variables Checklist

## Required Variables for Amazon Integration

### ✅ **Amazon SP-API Credentials** (for order processing)
```bash
AMZ_APP_CLIENT_ID=amzn1.application-oa2-client.xxxxx
AMZ_APP_CLIENT_SECRET=amzn1.oa2-cs.v1.xxxxx
AMZ_REFRESH_TOKEN=Atzr|xxxxx
AMZ_SELLER_ID=A2V719MRGLK48O
AMZ_MARKETPLACE_ID=ATVPDKIKX0DER
AMZ_REGION=na
AMAZON_SANDBOX_MODE=false  # Set to 'false' for production
```

### ✅ **AWS IAM Credentials** (for Messaging API)
```bash
AWS_ACCESS_KEY_ID=AKIAxxxxx
AWS_SECRET_ACCESS_KEY=xxxxx
AWS_REGION=us-east-1
```

### ✅ **Customer Site Configuration**
```bash
CUSTOMER_SITE_URL=https://littleherolabs.com
PREVIEW_AUTO_APPROVAL_HOURS=72
```

### ✅ **n8n Webhook**
```bash
N8N_W0_WEBHOOK_URL=https://thepeakbeyond.app.n8n.cloud/webhook/order-intake
```

### ✅ **Cron Security**
```bash
CRON_SECRET=your-cron-secret-here
```

## How to Check in Vercel

1. Go to Vercel Dashboard → Your Project
2. Settings → Environment Variables
3. Check each variable above
4. Make sure they're set for **Production** environment (not just Preview/Development)

## Status from Documentation

According to `docs/amazon/CREDENTIALS_STATUS_SUMMARY.md`:
- ✅ AWS IAM credentials: Configured in `.env.local`
- ✅ Amazon SP-API credentials: Configured in `.env.local` (production)
- ⚠️ **Need to verify**: Are these also in Vercel?

## Action Items

1. **Check Vercel** for all variables above
2. **Add missing variables** if not present
3. **Verify** `AMAZON_SANDBOX_MODE=false` for production
4. **Redeploy** after adding variables











