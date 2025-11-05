#!/bin/bash
# Script to set Cloudflare Pages secrets from .env file
# This reads your .env file and sets all required secrets for both Production and Preview

set -e

PROJECT_NAME="bright-gift"
ENV_FILE="${1:-.env}"

# Required secrets to set (with alternative names)
# The script will check for both the standard name and alternatives
# Format: "TARGET_KEY:ALT1 ALT2 ALT3"
SECRET_MAPPINGS=(
  "CLOUDFLARE_ACCOUNT_ID:CLOUDFLARE_ACCOUNT_ID CLOUDEFLARE_ACCOUNT_ID R2_ACCOUNT_ID"
  "R2_ACCESS_KEY_ID:R2_ACCESS_KEY_ID CLOUDFLARE_R2_ACCESS_KEY CLOUDFLARE_R2_ACCESS_KEY_ID"
  "R2_SECRET_ACCESS_KEY:R2_SECRET_ACCESS_KEY CLOUDFLARE_R2_SECRET_ACCESS_KEY"
  "BACKEND_API_TOKEN:BACKEND_API_TOKEN"
)

REQUIRED_SECRETS=(
  "CLOUDFLARE_ACCOUNT_ID"
  "R2_ACCESS_KEY_ID"
  "R2_SECRET_ACCESS_KEY"
  "BACKEND_API_TOKEN"
)

# Optional secrets (will be set if present)
OPTIONAL_SECRETS=(
  "R2_PUBLIC_BUCKET_NAME"
  "R2_ORDERS_BUCKET_NAME"
  "R2_CHARACTERS_PREFIX"
  "NEXT_PUBLIC_SUPABASE_URL"
  "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  "SUPABASE_SERVICE_ROLE_KEY"
)

echo "Setting Cloudflare Pages secrets from .env file..."
echo "Project: $PROJECT_NAME"
echo "Env file: $ENV_FILE"
echo ""

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Error: .env file not found at $ENV_FILE"
    echo "Usage: $0 [path/to/.env]"
    exit 1
fi

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Error: wrangler CLI not found. Install it with: npm install -g wrangler"
    exit 1
fi

# Create a temporary file for secrets (in .dev.vars format)
TEMP_SECRETS_FILE=$(mktemp)
trap "rm -f $TEMP_SECRETS_FILE" EXIT

echo "Reading secrets from $ENV_FILE..."
echo ""

# Function to extract value from .env file (checks multiple possible names)
get_env_value() {
    local target_key=$1
    local value=""
    
    # First try the target key itself
    value=$(grep "^${target_key}=" "$ENV_FILE" 2>/dev/null | sed -E "s/^${target_key}=['\"]?([^'\"]*)['\"]?$/\1/" | head -1)
    
    # If not found, check alternatives from SECRET_MAPPINGS
    if [ -z "$value" ]; then
        for mapping in "${SECRET_MAPPINGS[@]}"; do
            local key_part="${mapping%%:*}"
            local alts_part="${mapping#*:}"
            
            if [ "$key_part" == "$target_key" ]; then
                for alt in $alts_part; do
                    if [ "$alt" != "$target_key" ]; then
                        local alt_value=$(grep "^${alt}=" "$ENV_FILE" 2>/dev/null | sed -E "s/^${alt}=['\"]?([^'\"]*)['\"]?$/\1/" | head -1)
                        # Only use alternative if it's not empty and not a placeholder
                        if [ ! -z "$alt_value" ] && [[ "$alt_value" != "your_"* ]] && [[ "$alt_value" != "YOUR_"* ]]; then
                            value="$alt_value"
                            break 2
                        fi
                    fi
                done
            fi
        done
    fi
    
    echo "$value"
}

# Collect all secrets into temp file
SECRETS_FOUND=0
ALL_SECRETS=("${REQUIRED_SECRETS[@]}" "${OPTIONAL_SECRETS[@]}")

for secret in "${ALL_SECRETS[@]}"; do
    value=$(get_env_value "$secret")
    
    if [ ! -z "$value" ]; then
        # Skip if it's a comment, empty, or placeholder value
        # But allow values that look like real keys (hex strings, etc.)
        if [[ ! "$value" =~ ^[[:space:]]*# ]] && \
           [[ "$value" != "your_"* ]] && \
           [[ "$value" != "YOUR_"* ]] && \
           [[ "$value" != "" ]]; then
            echo "${secret}=${value}" >> "$TEMP_SECRETS_FILE"
            echo "✅ Found: $secret"
            SECRETS_FOUND=$((SECRETS_FOUND + 1))
        else
            echo "⚠️  Skipped: $secret (placeholder or comment)"
        fi
    else
        echo "⚠️  Not found: $secret"
    fi
done

if [ $SECRETS_FOUND -eq 0 ]; then
    echo "❌ No secrets found in $ENV_FILE"
    echo "Make sure your .env file contains the required variables:"
    echo "  - CLOUDFLARE_ACCOUNT_ID or R2_ACCOUNT_ID"
    echo "  - R2_ACCESS_KEY_ID"
    echo "  - R2_SECRET_ACCESS_KEY"
    echo "  - BACKEND_API_TOKEN"
    exit 1
fi

echo ""
echo "Found $SECRETS_FOUND secrets. Setting them for Cloudflare Pages..."
echo ""

# Use wrangler pages secret bulk to set all secrets at once
wrangler pages secret bulk "$TEMP_SECRETS_FILE" --project-name="$PROJECT_NAME"

echo ""
echo "✅ Success! All secrets have been set for Cloudflare Pages."
echo ""
echo "These secrets are now available to:"
echo "  ✅ Production deployments"
echo "  ✅ Preview deployments"
echo "  ✅ All branch preview deployments"
echo ""
echo "To verify, visit your preview deployment and check: /api/debug/env"

