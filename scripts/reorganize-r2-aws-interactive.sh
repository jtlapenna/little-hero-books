#!/bin/bash

# R2 Bucket Reorganization Script using AWS CLI with interactive authentication
# This script helps reorganize the little-hero-assets R2 bucket structure

echo "🔄 R2 Bucket Reorganization Script (AWS CLI + Interactive Auth)"
echo "==============================================================="
echo ""

# Set your R2 bucket info
ACCOUNT_ID="3daae940fcb6fc5b8bbd9bb8fcc62854"
BUCKET_NAME="little-hero-assets"
ENDPOINT_URL="https://$ACCOUNT_ID.r2.cloudflarestorage.com"
PROFILE_NAME="r2"

echo "📋 Reorganization Plan:"
echo "1. Move fonts/ → book-mvp-simple-adventure/fonts/"
echo "2. Move overlays/ → book-mvp-simple-adventure/overlays/"
echo "3. Move characters/ → book-mvp-simple-adventure/order-generated-assets/characters/"
echo ""

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Please install it first:"
    echo "   macOS: brew install awscli"
    echo "   Linux: curl 'https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip' -o 'awscliv2.zip' && unzip awscliv2.zip && sudo ./aws/install"
    exit 1
fi

echo "✅ AWS CLI found"

# Configure AWS CLI for R2 using interactive setup
echo "🔧 Configuring AWS CLI for Cloudflare R2..."
echo ""
echo "Please provide your R2 credentials when prompted:"
echo ""

# Run aws configure to set up credentials interactively
aws configure --profile $PROFILE_NAME

if [ $? -ne 0 ]; then
    echo "❌ Failed to configure AWS CLI. Please run manually:"
    echo "   aws configure --profile $PROFILE_NAME"
    exit 1
fi

echo "✅ AWS CLI configured for R2"

# Test the connection
echo "🔍 Testing connection to R2..."
if aws --profile $PROFILE_NAME --endpoint-url "$ENDPOINT_URL" s3 ls s3://$BUCKET_NAME/ > /dev/null 2>&1; then
    echo "✅ Successfully connected to R2 bucket: $BUCKET_NAME"
else
    echo "❌ Failed to connect to R2 bucket. Please check your credentials."
    exit 1
fi

# Function to move directory using AWS CLI
move_r2_directory() {
    local source_dir="$1"
    local dest_dir="$2"
    
    echo "📁 Moving $source_dir → $dest_dir"
    
    # List all objects in source directory
    echo "  📋 Listing files in $source_dir..."
    files=$(aws --profile $PROFILE_NAME --endpoint-url "$ENDPOINT_URL" s3 ls "s3://$BUCKET_NAME/$source_dir/" --recursive | awk '{print $4}')
    
    if [ -z "$files" ]; then
        echo "  ⚠️  No files found in $source_dir/"
        return
    fi
    
    # Copy each file to new location
    echo "$files" | while read -r key; do
        if [ -n "$key" ]; then
            # Get the filename without the source directory prefix
            filename=$(echo "$key" | sed "s|^$source_dir/||")
            
            echo "  📄 Processing: $filename"
            
            # Copy to new location
            aws --profile $PROFILE_NAME --endpoint-url "$ENDPOINT_URL" s3 cp "s3://$BUCKET_NAME/$key" "s3://$BUCKET_NAME/$dest_dir/$filename"
            
            if [ $? -eq 0 ]; then
                echo "    ✅ Copied: $filename"
            else
                echo "    ❌ Failed to copy: $filename"
            fi
        fi
    done
    
    echo "  ✅ Completed copying $source_dir/"
}

# Function to verify directory exists and show contents
verify_directory() {
    local dir="$1"
    echo "🔍 Verifying $dir..."
    
    count=$(aws --profile $PROFILE_NAME --endpoint-url "$ENDPOINT_URL" s3 ls "s3://$BUCKET_NAME/$dir/" --recursive | wc -l)
    echo "  📊 Found $count files in $dir/"
    
    if [ "$count" -gt 0 ]; then
        echo "  ✅ Directory $dir/ exists and has content"
        echo "  📋 Files in $dir/:"
        aws --profile $PROFILE_NAME --endpoint-url "$ENDPOINT_URL" s3 ls "s3://$BUCKET_NAME/$dir/" --recursive | awk '{print "    - " $4}'
    else
        echo "  ⚠️  Directory $dir/ is empty or doesn't exist"
    fi
}

echo ""
echo "🚀 Starting reorganization..."

# Move fonts
move_r2_directory "fonts" "book-mvp-simple-adventure/fonts"

# Move overlays
move_r2_directory "overlays" "book-mvp-simple-adventure/overlays"

# Move characters
move_r2_directory "characters" "book-mvp-simple-adventure/order-generated-assets/characters"

echo ""
echo "🔍 Verification:"
verify_directory "book-mvp-simple-adventure/fonts"
verify_directory "book-mvp-simple-adventure/overlays"
verify_directory "book-mvp-simple-adventure/order-generated-assets/characters"

echo ""
echo "✅ Reorganization complete!"
echo ""
echo "📝 Next steps:"
echo "1. Verify all files were copied correctly above"
echo "2. Delete the original directories if everything looks good:"
echo "   - aws --profile $PROFILE_NAME --endpoint-url $ENDPOINT_URL s3 rm s3://$BUCKET_NAME/fonts/ --recursive"
echo "   - aws --profile $PROFILE_NAME --endpoint-url $ENDPOINT_URL s3 rm s3://$BUCKET_NAME/overlays/ --recursive"
echo "   - aws --profile $PROFILE_NAME --endpoint-url $ENDPOINT_URL s3 rm s3://$BUCKET_NAME/characters/ --recursive"
echo "3. Update the workflow URLs to use the new paths"
echo ""
echo "🔗 New asset URLs will be:"
echo "• Fonts: https://little-hero-assets.r2.cloudflarestorage.com/book-mvp-simple-adventure/fonts/"
echo "• Overlays: https://little-hero-assets.r2.cloudflarestorage.com/book-mvp-simple-adventure/overlays/"
echo "• Characters: https://little-hero-assets.r2.cloudflarestorage.com/book-mvp-simple-adventure/order-generated-assets/characters/"
echo "• Backgrounds: https://little-hero-assets.r2.cloudflarestorage.com/book-mvp-simple-adventure/backgrounds/"
