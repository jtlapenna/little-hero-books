#!/bin/bash

# R2 Bucket Reorganization Script
# This script helps reorganize the little-hero-assets R2 bucket structure

echo "🔄 R2 Bucket Reorganization Script"
echo "=================================="
echo ""

# Set your R2 credentials (you'll need to update these)
R2_ACCOUNT_ID="3daae940fcb6fc5b8bbd9bb8fcc62854"
R2_ACCESS_KEY_ID="your-access-key"
R2_SECRET_ACCESS_KEY="your-secret-key"
BUCKET_NAME="little-hero-assets"

echo "📋 Reorganization Plan:"
echo "1. Move fonts/ → book-mvp-simple-adventure/fonts/"
echo "2. Move overlays/ → book-mvp-simple-adventure/overlays/"
echo "3. Move characters/ → book-mvp-simple-adventure/order-generated-assets/characters/"
echo ""

# Function to move directory in R2
move_r2_directory() {
    local source_dir="$1"
    local dest_dir="$2"
    
    echo "📁 Moving $source_dir → $dest_dir"
    
    # List all objects in source directory
    aws s3api list-objects-v2 \
        --bucket "$BUCKET_NAME" \
        --prefix "$source_dir/" \
        --query 'Contents[].Key' \
        --output text | while read -r key; do
        
        if [ -n "$key" ]; then
            # Get the filename without the source directory prefix
            filename=$(echo "$key" | sed "s|^$source_dir/||")
            
            # Copy to new location
            aws s3 cp "s3://$BUCKET_NAME/$key" "s3://$BUCKET_NAME/$dest_dir/$filename"
            
            if [ $? -eq 0 ]; then
                echo "  ✅ Copied: $filename"
                # Delete original (uncomment when ready)
                # aws s3 rm "s3://$BUCKET_NAME/$key"
                # echo "  🗑️  Deleted: $key"
            else
                echo "  ❌ Failed to copy: $filename"
            fi
        fi
    done
}

# Check if AWS CLI is configured
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Please install AWS CLI first."
    exit 1
fi

# Configure AWS CLI for R2 (if not already configured)
echo "🔧 Configuring AWS CLI for Cloudflare R2..."
aws configure set aws_access_key_id "$R2_ACCESS_KEY_ID"
aws configure set aws_secret_access_key "$R2_SECRET_ACCESS_KEY"
aws configure set region auto

# Set R2 endpoint
export AWS_ENDPOINT_URL="https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"

echo ""
echo "🚀 Starting reorganization..."

# Move fonts
move_r2_directory "fonts" "book-mvp-simple-adventure/fonts"

# Move overlays
move_r2_directory "overlays" "book-mvp-simple-adventure/overlays"

# Move characters
move_r2_directory "characters" "book-mvp-simple-adventure/order-generated-assets/characters"

echo ""
echo "✅ Reorganization complete!"
echo ""
echo "📝 Next steps:"
echo "1. Verify all files were copied correctly in the R2 dashboard"
echo "2. Delete the original directories if everything looks good"
echo "3. Update the workflow URLs to use the new paths"
echo ""
echo "🔗 New asset URLs will be:"
echo "• Fonts: https://little-hero-assets.r2.cloudflarestorage.com/book-mvp-simple-adventure/fonts/"
echo "• Overlays: https://little-hero-assets.r2.cloudflarestorage.com/book-mvp-simple-adventure/overlays/"
echo "• Characters: https://little-hero-assets.r2.cloudflarestorage.com/book-mvp-simple-adventure/order-generated-assets/characters/"
echo "• Backgrounds: https://little-hero-assets.r2.cloudflarestorage.com/book-mvp-simple-adventure/backgrounds/"
