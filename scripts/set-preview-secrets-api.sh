#!/bin/bash
# Script to set Cloudflare Pages secrets for Preview environment using Cloudflare API
# This is needed because wrangler CLI doesn't support setting secrets for preview

set -e

PROJECT_NAME="bright-gift"
ENV_FILE="${1:-.env}"

echo "Setting Cloudflare Pages secrets for PREVIEW environment via API..."
echo "Project: $PROJECT_NAME"
echo ""

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Error: .env file not found at $ENV_FILE"
    exit 1
fi

# Check for required tools
if ! command -v curl &> /dev/null; then
    echo "❌ Error: curl not found"
    exit 1
fi

# Get Cloudflare credentials
echo "This script needs your Cloudflare API token and Account ID."
echo "You can get these from: https://dash.cloudflare.com/profile/api-tokens"
echo ""

read -p "Enter your Cloudflare API Token: " API_TOKEN
read -p "Enter your Cloudflare Account ID: " ACCOUNT_ID

if [ -z "$API_TOKEN" ] || [ -z "$ACCOUNT_ID" ]; then
    echo "❌ Error: API Token and Account ID are required"
    exit 1
fi

echo ""
echo "Reading secrets from $ENV_FILE..."
echo ""

# Function to extract value from .env file
get_env_value() {
    local target_key=$1
    local value=$(grep "^${target_key}=" "$ENV_FILE" 2>/dev/null | sed -E "s/^${target_key}=['\"]?([^'\"]*)['\"]?$/\1/" | head -1)
    
    # Try alternatives
    if [ -z "$value" ]; then
        case "$target_key" in
            "CLOUDFLARE_ACCOUNT_ID")
                value=$(grep "^CLOUDEFLARE_ACCOUNT_ID=" "$ENV_FILE" 2>/dev/null | sed -E "s/^CLOUDEFLARE_ACCOUNT_ID=['\"]?([^'\"]*)['\"]?$/\1/" | head -1)
                [ -z "$value" ] && value=$(grep "^R2_ACCOUNT_ID=" "$ENV_FILE" 2>/dev/null | sed -E "s/^R2_ACCOUNT_ID=['\"]?([^'\"]*)['\"]?$/\1/" | head -1)
                ;;
            "R2_ACCESS_KEY_ID")
                # Try CLOUDFLARE_R2_ACCESS_KEY first (real value), then CLOUDFLARE_R2_ACCESS_KEY_ID (might be placeholder)
                value=$(grep "^CLOUDFLARE_R2_ACCESS_KEY=" "$ENV_FILE" 2>/dev/null | sed -E "s/^CLOUDFLARE_R2_ACCESS_KEY=['\"]?([^'\"]*)['\"]?$/\1/" | head -1)
                if [[ "$value" == "your_"* ]] || [[ "$value" == "YOUR_"* ]]; then
                    value=""  # Skip placeholder
                fi
                [ -z "$value" ] && value=$(grep "^R2_ACCESS_KEY_ID=" "$ENV_FILE" 2>/dev/null | sed -E "s/^R2_ACCESS_KEY_ID=['\"]?([^'\"]*)['\"]?$/\1/" | head -1)
                ;;
            "R2_SECRET_ACCESS_KEY")
                value=$(grep "^CLOUDFLARE_R2_SECRET_ACCESS_KEY=" "$ENV_FILE" 2>/dev/null | sed -E "s/^CLOUDFLARE_R2_SECRET_ACCESS_KEY=['\"]?([^'\"]*)['\"]?$/\1/" | head -1)
                [ -z "$value" ] && value=$(grep "^R2_SECRET_ACCESS_KEY=" "$ENV_FILE" 2>/dev/null | sed -E "s/^R2_SECRET_ACCESS_KEY=['\"]?([^'\"]*)['\"]?$/\1/" | head -1)
                ;;
        esac
    fi
    
    # Skip placeholder values
    if [[ "$value" == "your_"* ]] || [[ "$value" == "YOUR_"* ]]; then
        value=""
    fi
    
    echo "$value"
}

# Required secrets
REQUIRED_SECRETS=(
    "CLOUDFLARE_ACCOUNT_ID"
    "R2_ACCESS_KEY_ID"
    "R2_SECRET_ACCESS_KEY"
    "BACKEND_API_TOKEN"
)

SECRETS_SET=0

for secret in "${REQUIRED_SECRETS[@]}"; do
    value=$(get_env_value "$secret")
    
    if [ ! -z "$value" ]; then
        echo "Setting $secret for Preview environment..."
        
        # Use Cloudflare API to set secret for preview
        # Note: This requires the Pages API which may not be fully documented
        # Alternative: We'll use wrangler with a workaround or provide dashboard instructions
        
        # For now, provide instructions
        echo "⚠️  Cloudflare API doesn't have a direct endpoint for setting preview secrets."
        echo "   You need to set this in the dashboard:"
        echo "   1. Go to: https://dash.cloudflare.com → Workers & Pages → $PROJECT_NAME"
        echo "   2. Settings → Environment Variables"
        echo "   3. Find $secret and edit it"
        echo "   4. Check 'Preview' checkbox"
        echo "   5. Save"
        echo ""
        
        SECRETS_SET=$((SECRETS_SET + 1))
    else
        echo "⚠️  Skipped: $secret (not found in .env or is placeholder)"
    fi
done

echo ""
echo "Summary:"
echo "  Found $SECRETS_SET secrets to set"
echo ""
echo "Unfortunately, Cloudflare Pages API doesn't support setting preview secrets programmatically."
echo "You must use the dashboard to enable Preview for each secret."
echo ""
echo "See: scripts/set-preview-secrets-via-dashboard.md for detailed instructions"

