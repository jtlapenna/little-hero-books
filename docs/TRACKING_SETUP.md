# Tracking Setup Guide

This guide explains how to configure Google Analytics, Google Search Console, and Ahrefs tracking for the Little Hero Books frontend.

## Overview

Tracking codes have been added to `frontend/src/layouts/Layout.astro`. The implementation uses environment variables so tracking can be enabled/disabled and configured without code changes.

## Required Environment Variables

Set these in your Cloudflare Pages dashboard (Settings → Environment Variables):

### 1. Google Analytics (GA4)
- **Variable Name**: `PUBLIC_GA_MEASUREMENT_ID`
- **Value**: `G-K0G1398N35` (your specific Measurement ID)
- **How to get it** (for reference):
  1. Go to [Google Analytics](https://analytics.google.com/)
  2. Create a new property or select an existing one
  3. Go to Admin → Data Streams → Web
  4. Copy the Measurement ID (starts with `G-`)

### 2. Google Search Console
- **Variable Name**: `PUBLIC_GSC_VERIFICATION`
- **Value**: The verification code from Google Search Console
- **How to get it**:
  1. Go to [Google Search Console](https://search.google.com/search-console)
  2. Add your property (website URL)
  3. Choose "HTML tag" verification method
  4. Copy the `content` value from the meta tag (the long string of characters)

### 3. Ahrefs
- **Variable Name**: `PUBLIC_AHREFS_VERIFICATION`
- **Value**: The verification code from Ahrefs
- **How to get it**:
  1. Go to [Ahrefs](https://ahrefs.com/)
  2. Navigate to Site Explorer or your project
  3. Add your website
  4. Choose "HTML tag" verification method
  5. Copy the `content` value from the meta tag

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

## Verification

After deploying:

1. **Google Analytics**: Check the Real-Time reports in GA4 to see if visitors are being tracked
2. **Google Search Console**: The verification status should show as "Verified" within a few minutes
3. **Ahrefs**: The verification status should show as "Verified" in your Ahrefs project

## How It Works

The tracking codes are conditionally rendered - they only appear if the corresponding environment variable is set. This means:
- You can enable/disable tracking by adding/removing environment variables
- Missing variables won't cause errors
- Each tracking service works independently

## Troubleshooting

- **Tracking not working**: Verify environment variables are set correctly in Cloudflare Pages and that you've redeployed after adding them
- **Verification failing**: Make sure you copied the entire verification code (they can be long strings)
- **Local testing**: Ensure your `.env` file is in the `frontend/` directory and restart your dev server

