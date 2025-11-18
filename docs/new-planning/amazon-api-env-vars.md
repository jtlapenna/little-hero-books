# Amazon API Integration - Environment Variables

## Required Environment Variables for Vercel

Add these to your Vercel project settings (Environment Variables):

### Amazon SP-API Credentials
```bash
AMZ_APP_CLIENT_ID=YOUR_AMAZON_CLIENT_ID
AMZ_APP_CLIENT_SECRET=YOUR_AMAZON_CLIENT_SECRET
AMZ_REFRESH_TOKEN=YOUR_AMAZON_REFRESH_TOKEN
AMZ_SELLER_ID=A2V719MRGLK48O
AMZ_MARKETPLACE_ID=ATVPDKIKX0DER
AMZ_REGION=na
AMAZON_SANDBOX_MODE=true
```

### n8n Webhook URL
```bash
N8N_W0_WEBHOOK_URL=https://thepeakbeyond.app.n8n.cloud/webhook/order-intake
```

### Existing Variables (Already Set)
```bash
CRON_SECRET=your-existing-cron-secret
SUPABASE_URL=https://mdnthwpcnphjnnblbvxk.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kbnRod3BjbnBoam5uYmxidnhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDUwMDc4MCwiZXhwIjoyMDc2MDc2NzgwfQ.wNVQ3U2nWTGu8VsuXKasWOCxVhpca5x42wSapQDinGs
```

## Alternative Variable Names (Supported)

The cron route also supports these alternative names for compatibility:

```bash
# Amazon SP-API (alternative names)
AMAZON_SP_API_CLIENT_ID=... (same as AMZ_APP_CLIENT_ID)
AMAZON_SP_API_CLIENT_SECRET=... (same as AMZ_APP_CLIENT_SECRET)
AMAZON_SP_API_REFRESH_TOKEN=... (same as AMZ_REFRESH_TOKEN)
AMAZON_SP_API_SELLER_ID=... (same as AMZ_SELLER_ID)
AMAZON_SP_API_MARKETPLACE_ID=... (same as AMZ_MARKETPLACE_ID)
AMAZON_SP_API_REGION=... (same as AMZ_REGION)
```

## Local Development (.env file)

For local development, add these to your `.env` file in the project root:

```bash
# Amazon SP-API
AMZ_APP_CLIENT_ID=YOUR_AMAZON_CLIENT_ID
AMZ_APP_CLIENT_SECRET=YOUR_AMAZON_CLIENT_SECRET
AMZ_REFRESH_TOKEN=YOUR_AMAZON_REFRESH_TOKEN
AMZ_SELLER_ID=A2V719MRGLK48O
AMZ_MARKETPLACE_ID=ATVPDKIKX0DER
AMZ_REGION=na
AMAZON_SANDBOX_MODE=true

# n8n Webhooks
N8N_W0_WEBHOOK_URL=https://thepeakbeyond.app.n8n.cloud/webhook/order-intake

# Cron Security
CRON_SECRET=your-cron-secret-here
```

## Notes

- **Sandbox Mode**: Set `AMAZON_SANDBOX_MODE=true` for testing, `false` for production
- **Webhook URL**: The W0 webhook URL is already configured in n8n
- **Cron Secret**: Use the same `CRON_SECRET` as your router cron for consistency
- **Supabase**: Uses existing Supabase credentials (already configured)

