# Tracking Setup Guide

This guide explains how to configure Google Analytics, Google Search Console, and Ahrefs tracking for the Little Hero Books frontend.

## ✅ Status: All Tracking Services Configured

- **Google Analytics (GA4)**: ✅ Active and verified
- **Google Search Console**: ✅ Active and verified (DNS method)
- **Ahrefs**: ✅ Active and verified

## Overview

Tracking codes have been added to `frontend/src/layouts/Layout.astro`. The implementation uses environment variables so tracking can be enabled/disabled and configured without code changes.

## Required Environment Variables

Set these in your Cloudflare Pages dashboard (Settings → Environment Variables):

### 1. Google Analytics (GA4)
- **Status**: ✅ Active and verified
- **Variable Name**: `PUBLIC_GA_MEASUREMENT_ID`
- **Value**: `G-K0G1398N35` (configured as Secret in Cloudflare Pages)
- **How to get it** (for reference):
  1. Go to [Google Analytics](https://analytics.google.com/)
  2. Create a new property or select an existing one
  3. Go to Admin → Data Streams → Web
  4. Copy the Measurement ID (starts with `G-`)

### 2. Google Search Console
- **Status**: ✅ Verified via DNS TXT record (recommended method)
- **Method**: Domain name provider verification (DNS TXT record in Cloudflare)
- **Note**: DNS verification is more permanent and doesn't require code changes. The HTML tag method in the code is available as a fallback but not needed when using DNS verification.

### 3. Ahrefs
- **Status**: ✅ Active and verified
- **Variable Name**: `PUBLIC_AHREFS_VERIFICATION` (if using HTML tag method)
- **Note**: Verification method may vary. If using DNS verification, no environment variable is needed.

## Setting Up in Cloudflare Pages

**Note**: Since this project uses `wrangler.toml` for environment variable management, you'll need to use **Secrets** (encrypted variables) via the Dashboard. Secrets work exactly like environment variables in your code - they're just encrypted at rest.

1. Go to your Cloudflare Pages dashboard
2. Select your project: `little-hero-books-frontend`
3. Navigate to **Settings** → **Environment Variables**
4. Add each variable as a **Secret**:
   - Click **Add variable**
   - Enter the variable name (e.g., `PUBLIC_GA_MEASUREMENT_ID`)
   - Select **Secret** as the type
   - Enter the value
   - Select **Production**, **Preview**, and/or **Development** environments as needed
   - Click **Save**

**Important**: Secrets are encrypted and secure. They work identically to regular environment variables in your code - no code changes needed.

## Local Development

For local development, create a `.env` file in the `frontend/` directory:

```env
PUBLIC_GA_MEASUREMENT_ID=G-K0G1398N35
PUBLIC_GSC_VERIFICATION=your-google-search-console-code
PUBLIC_AHREFS_VERIFICATION=your-ahrefs-code
```

**Note**: Add `.env` to `.gitignore` to keep your tracking IDs private.

## Verification Status

All tracking services have been verified and are active:

1. **Google Analytics**: ✅ Verified - Tracking active via GA4 Measurement ID `G-K0G1398N35`
2. **Google Search Console**: ✅ Verified - Domain verified via DNS TXT record
3. **Ahrefs**: ✅ Verified - Site verified and active

### How to Check Status

- **Google Analytics**: Check Real-Time reports in GA4 dashboard to see active visitors
- **Google Search Console**: Property shows as "Verified" in Search Console dashboard
- **Ahrefs**: Site shows as verified in Ahrefs project dashboard

## How It Works

The tracking codes are conditionally rendered - they only appear if the corresponding environment variable is set. This means:
- You can enable/disable tracking by adding/removing environment variables
- Missing variables won't cause errors
- Each tracking service works independently

## Troubleshooting

- **Tracking not working**: Verify environment variables are set correctly in Cloudflare Pages and that you've redeployed after adding them
- **Verification failing**: Make sure you copied the entire verification code (they can be long strings)
- **Local testing**: Ensure your `.env` file is in the `frontend/` directory and restart your dev server

