#!/bin/bash

# Upload grayscale pose reference images to Cloudflare R2
# This replaces the color pose images with grayscale versions

set -e

# Configuration
BUCKET_NAME="little-hero-assets"
BUCKET_PATH="book-mvp-simple-adventure/characters/poses"
INPUT_DIR="$(dirname "$0")/../assets/poses/grayscale"
ENDPOINT="https://92cec53654f84771956bc84dfea65baa.r2.cloudflarestorage.com"

# Check for R2 credentials
if [ -z "$R2_ACCESS_KEY_ID" ] || [ -z "$R2_SECRET_ACCESS_KEY" ]; then
  echo "❌ Error: R2 credentials not found"
  echo "   Please set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY environment variables"
  echo ""
  echo "   Example:"
  echo "   export R2_ACCESS_KEY_ID='your-access-key-id'"
  echo "   export R2_SECRET_ACCESS_KEY='your-secret-access-key'"
  echo "   ./scripts/upload-grayscale-poses-to-r2.sh"
  exit 1
fi

# Check if aws-cli is installed
if ! command -v aws &> /dev/null; then
  echo "❌ Error: AWS CLI not found"
  echo "   Install with: brew install awscli"
  echo "   Or: pip3 install awscli"
  exit 1
fi

echo "Uploading grayscale pose images to R2..."
echo ""

uploaded=0
failed=0

for i in 01 02 03 04 05; do
  filename="pose${i}.png"
  filepath="${INPUT_DIR}/${filename}"
  s3path="s3://${BUCKET_NAME}/${BUCKET_PATH}/${filename}"
  
  if [ ! -f "$filepath" ]; then
    echo "✗ File not found: ${filename}"
    ((failed++))
    continue
  fi
  
  echo "Uploading ${filename}..."
  
  if aws s3 cp "$filepath" "$s3path" \
    --endpoint-url "$ENDPOINT" \
    --content-type "image/png" \
    --no-progress 2>&1; then
    
    filesize=$(du -h "$filepath" | cut -f1)
    echo "✓ Uploaded: ${filename} (${filesize})"
    ((uploaded++))
  else
    echo "✗ Failed to upload ${filename}"
    ((failed++))
  fi
done

echo ""
echo "✓ Done! Uploaded ${uploaded} files, ${failed} failed"
echo ""
echo "Next steps:"
echo "1. In n8n workflow, verify 'Load Pose Reference' connects to 'Prepare Gemini Requests'"
echo "2. Test the workflow - pose images should now be grayscale"

