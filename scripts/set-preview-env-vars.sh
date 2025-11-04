#!/bin/bash
# Script to set environment variables for Cloudflare Pages Preview environment
# This uses Wrangler CLI to set secrets, which are available to ALL environments

set -e

PROJECT_NAME="little-hero-labs-admin"

echo "Setting environment variables for Cloudflare Pages Preview..."
echo "Note: Secrets set via Wrangler are available to BOTH Production and Preview"
echo ""

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "Error: wrangler CLI not found. Install it with: npm install -g wrangler"
    exit 1
fi

# Required variables
echo "Setting required secrets..."
echo "You'll be prompted to enter the value for each secret."
echo ""

# CLOUDFLARE_ACCOUNT_ID
read -p "Enter CLOUDFLARE_ACCOUNT_ID (or press Enter to skip): " account_id
if [ ! -z "$account_id" ]; then
    echo "$account_id" | wrangler pages secret put CLOUDFLARE_ACCOUNT_ID --project-name="$PROJECT_NAME"
    echo "✅ Set CLOUDFLARE_ACCOUNT_ID"
fi

# R2_ACCESS_KEY_ID
read -p "Enter R2_ACCESS_KEY_ID (or press Enter to skip): " access_key
if [ ! -z "$access_key" ]; then
    echo "$access_key" | wrangler pages secret put R2_ACCESS_KEY_ID --project-name="$PROJECT_NAME"
    echo "✅ Set R2_ACCESS_KEY_ID"
fi

# R2_SECRET_ACCESS_KEY
read -p "Enter R2_SECRET_ACCESS_KEY (or press Enter to skip): " secret_key
if [ ! -z "$secret_key" ]; then
    echo "$secret_key" | wrangler pages secret put R2_SECRET_ACCESS_KEY --project-name="$PROJECT_NAME"
    echo "✅ Set R2_SECRET_ACCESS_KEY"
fi

# BACKEND_API_TOKEN
read -p "Enter BACKEND_API_TOKEN (or press Enter to skip): " api_token
if [ ! -z "$api_token" ]; then
    echo "$api_token" | wrangler pages secret put BACKEND_API_TOKEN --project-name="$PROJECT_NAME"
    echo "✅ Set BACKEND_API_TOKEN"
fi

echo ""
echo "✅ Done! All secrets have been set."
echo ""
echo "Note: Secrets set via 'wrangler pages secret put' are available to:"
echo "  - Production deployments"
echo "  - Preview deployments"
echo "  - All environments"
echo ""
echo "To verify, visit your preview deployment and check: /api/debug/env"

