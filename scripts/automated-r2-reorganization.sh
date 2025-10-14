#!/bin/bash

# Automated R2 Bucket Reorganization Script
# Uses wrangler authentication + s3cmd for actual file operations

echo "🔄 Automated R2 Bucket Reorganization"
echo "===================================="
echo ""

# Set your R2 bucket info
ACCOUNT_ID="3daae940fcb6fc5b8bbd9bb8fcc62854"
BUCKET_NAME="little-hero-assets"

echo "📋 Reorganization Plan:"
echo "1. Move fonts/ → book-mvp-simple-adventure/fonts/"
echo "2. Move overlays/ → book-mvp-simple-adventure/overlays/"
echo "3. Move characters/ → book-mvp-simple-adventure/order-generated-assets/characters/"
echo ""

# Check if wrangler is installed and authenticated
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Installing..."
    npm install -g wrangler
fi

if ! wrangler whoami &> /dev/null; then
    echo "🔐 Not logged in to Cloudflare. Opening browser for authentication..."
    wrangler login
fi

echo "✅ Authenticated with Cloudflare"

# Install s3cmd if not present
if ! command -v s3cmd &> /dev/null; then
    echo "📦 Installing s3cmd..."
    pip install s3cmd
fi

echo "✅ s3cmd found"

# Extract credentials from wrangler config
echo "🔧 Extracting credentials from wrangler config..."

# Get the wrangler config directory
WRANGLER_CONFIG_DIR="$HOME/.wrangler"
if [ ! -d "$WRANGLER_CONFIG_DIR" ]; then
    echo "❌ Wrangler config directory not found"
    exit 1
fi

# Try to extract credentials from wrangler config
# This is a simplified approach - we'll prompt for credentials
echo "🔑 Please provide your R2 API credentials:"
echo "   (You can find these in Cloudflare Dashboard → R2 → Manage R2 API tokens)"
echo ""

read -p "Enter your R2 Access Key ID: " ACCESS_KEY_ID
read -p "Enter your R2 Secret Access Key: " SECRET_ACCESS_KEY

if [ -z "$ACCESS_KEY_ID" ] || [ -z "$SECRET_ACCESS_KEY" ]; then
    echo "❌ Credentials are required"
    exit 1
fi

# Configure s3cmd for R2
echo "🔧 Configuring s3cmd for Cloudflare R2..."
cat > ~/.s3cfg << EOF
[default]
access_key = $ACCESS_KEY_ID
secret_key = $SECRET_ACCESS_KEY
bucket_location = auto
host_base = $ACCOUNT_ID.r2.cloudflarestorage.com
host_bucket = $ACCOUNT_ID.r2.cloudflarestorage.com
enable_multipart = False
EOF

echo "✅ s3cmd configured for R2"

# Test the connection
echo "🔍 Testing connection to R2..."
if s3cmd ls s3://$BUCKET_NAME/ > /dev/null 2>&1; then
    echo "✅ Successfully connected to R2 bucket: $BUCKET_NAME"
else
    echo "❌ Failed to connect to R2 bucket. Please check your credentials."
    exit 1
fi

# Function to move directory using s3cmd
move_r2_directory() {
    local source_dir="$1"
    local dest_dir="$2"
    
    echo "📁 Moving $source_dir → $dest_dir"
    
    # List all objects in source directory
    echo "  📋 Listing files in $source_dir..."
    files=$(s3cmd ls s3://$BUCKET_NAME/$source_dir/ | awk '{print $4}' | sed "s|s3://$BUCKET_NAME/||")
    
    if [ -z "$files" ]; then
        echo "  ⚠️  No files found in $source_dir/"
        return
    fi
    
    echo "  📊 Found $(echo "$files" | wc -l) files to move"
    
    # Copy each file to new location
    echo "$files" | while read -r key; do
        if [ -n "$key" ]; then
            # Get the filename without the source directory prefix
            filename=$(echo "$key" | sed "s|^$source_dir/||")
            
            echo "  📄 Copying: $filename"
            
            # Copy to new location
            s3cmd cp "s3://$BUCKET_NAME/$key" "s3://$BUCKET_NAME/$dest_dir/$filename" --quiet
            
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
    
    count=$(s3cmd ls s3://$BUCKET_NAME/$dir/ | wc -l)
    echo "  📊 Found $count files in $dir/"
    
    if [ "$count" -gt 0 ]; then
        echo "  ✅ Directory $dir/ exists and has content"
        echo "  📋 Files in $dir/:"
        s3cmd ls s3://$BUCKET_NAME/$dir/ | awk '{print "    - " $4}' | sed "s|s3://$BUCKET_NAME/||"
    else
        echo "  ⚠️  Directory $dir/ is empty or doesn't exist"
    fi
}

echo ""
echo "🚀 Starting automated reorganization..."

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
echo "✅ Automated reorganization complete!"
echo ""
echo "📝 Next steps:"
echo "1. Verify all files were copied correctly above"
echo "2. Delete the original directories if everything looks good:"
echo "   - s3cmd del s3://$BUCKET_NAME/fonts/ --recursive"
echo "   - s3cmd del s3://$BUCKET_NAME/overlays/ --recursive"
echo "   - s3cmd del s3://$BUCKET_NAME/characters/ --recursive"
echo "3. Update the workflow URLs to use the new paths"
echo ""
echo "🔗 New asset URLs will be:"
echo "• Fonts: https://little-hero-assets.r2.cloudflarestorage.com/book-mvp-simple-adventure/fonts/"
echo "• Overlays: https://little-hero-assets.r2.cloudflarestorage.com/book-mvp-simple-adventure/overlays/"
echo "• Characters: https://little-hero-assets.r2.cloudflarestorage.com/book-mvp-simple-adventure/order-generated-assets/characters/"
echo "• Backgrounds: https://little-hero-assets.r2.cloudflarestorage.com/book-mvp-simple-adventure/backgrounds/"
