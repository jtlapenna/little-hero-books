# R2 Storage Setup Guide

This guide explains how to set up Cloudflare R2 storage for the Human-in-the-Loop Asset Review System.

## Prerequisites

1. Cloudflare account with R2 enabled
2. R2 bucket created (`little-hero-assets` and `little-hero-orders`)
3. R2 API credentials

## Environment Variables

Create a `.env.local` file in the `back-end` directory with the following variables:

```bash
# Cloudflare R2 Configuration
CLOUDFLARE_ACCOUNT_ID=your_account_id_here
R2_ACCESS_KEY_ID=your_access_key_here
R2_SECRET_ACCESS_KEY=your_secret_key_here

# Next.js Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Getting R2 Credentials

### 1. Get Account ID
1. Log into Cloudflare Dashboard
2. Go to R2 Object Storage
3. Your Account ID is displayed in the right sidebar

### 2. Create API Token
1. Go to "Manage R2 API Tokens" in the R2 dashboard
2. Click "Create API Token"
3. Choose "Custom token"
4. Set permissions:
   - Account: `Cloudflare R2:Edit`
   - Zone Resources: `Include All zones`
5. Save the Access Key ID and Secret Access Key

## R2 Bucket Structure

The system expects the following bucket structure:

### `little-hero-assets` bucket:
```
book-mvp-simple-adventure/
└── order-generated-assets/
    └── characters/
        └── [character-hash]/
            ├── base-character.png
            ├── base-character-bg-removed.png
            ├── 1.png
            ├── 2.png
            ├── ...
            ├── 12.png
            ├── 1_nobg.png
            ├── 2_nobg.png
            ├── ...
            └── 12_nobg.png
```

### `little-hero-orders` bucket:
```
[order-id]/
└── order.json
```

## Testing the Setup

1. Start the development server:
   ```bash
   cd back-end
   npm run dev
   ```

2. Visit `http://localhost:3000/orders` to see if orders are loaded from R2
3. Check the browser console for any R2 connection errors

## Troubleshooting

### Common Issues

1. **"Missing required R2 environment variables"**
   - Ensure all three environment variables are set in `.env.local`
   - Restart the development server after adding variables

2. **"Failed to fetch assets from R2 storage"**
   - Check that your R2 credentials are correct
   - Verify the bucket names match exactly
   - Ensure the character hash directories exist in R2

3. **Images not loading**
   - Check that the character hash exists in R2
   - Verify the file naming convention matches expected format
   - Check browser network tab for 404 errors

### Debug Mode

To enable debug logging, add this to your `.env.local`:
```bash
DEBUG_R2=true
```

## Production Deployment

For production deployment:

1. Set environment variables in your hosting platform
2. Ensure R2 credentials have appropriate permissions
3. Consider using Cloudflare Workers for better performance
4. Set up proper CORS policies for your domain

## Security Notes

- Never commit `.env.local` to version control
- Use least-privilege access for R2 credentials
- Consider using Cloudflare Access for additional security
- Rotate credentials regularly

