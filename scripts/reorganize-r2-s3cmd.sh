#!/bin/bash

# R2 Bucket Reorganization Script using s3cmd
# This script helps reorganize the little-hero-assets R2 bucket structure

echo "🔄 R2 Bucket Reorganization Script (s3cmd)"
echo "==========================================="
echo ""

# Set your R2 credentials and bucket
ACCOUNT_ID="3daae940fcb6fc5b8bbd9bb8fcc62854"
BUCKET_NAME="little-hero-assets"
ACCESS_KEY_ID="your-access-key-id"
SECRET_ACCESS_KEY="your-secret-access-key"

echo "📋 Reorganization Plan:"
echo "1. Move fonts/ → book-mvp-simple-adventure/fonts/"
echo "2. Move overlays/ → book-mvp-simple-adventure/overlays/"
echo "3. Move characters/ → book-mvp-simple-adventure/order-generated-assets/characters/"
echo ""

# Check if s3cmd is installed
if ! command -v s3cmd &> /dev/null; then
    echo "❌ s3cmd not found. Installing..."
    echo "Installing s3cmd..."
    pip install s3cmd
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install s3cmd. Please install manually:"
        echo "   pip install s3cmd"
        exit 1
    fi
fi

echo "✅ s3cmd found"

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
    
    # Copy each file to new location
    echo "$files" | while read -r key; do
        if [ -n "$key" ]; then
            # Get the filename without the source directory prefix
            filename=$(echo "$key" | sed "s|^$source_dir/||")
            
            echo "  📄 Processing: $filename"
            
            # Copy to new location
            s3cmd cp "s3://$BUCKET_NAME/$key" "s3://$BUCKET_NAME/$dest_dir/$filename"
            
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
    else
        echo "  ⚠️  Directory $dir/ is empty or doesn't exist"
    fi
}

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
echo "1. Verify all files were copied correctly in the R2 dashboard"
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
