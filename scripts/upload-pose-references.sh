#!/bin/bash

# Upload pose reference files to R2 using curl
# Maps descriptive pose names to numeric pose references

# R2 configuration
R2_ENDPOINT="https://little-hero-assets.r2.cloudflarestorage.com"
BUCKET_NAME="little-hero-assets"

# Pose mapping: pose number -> descriptive filename
declare -A POSE_MAPPING=(
    [1]="walking.png"
    [2]="walking-looking-higher.png"
    [3]="looking.png"
    [4]="floating.png"
    [5]="walking-looking-down.png"
    [6]="jogging.png"
    [7]="sitting-eating.png"
    [8]="crouching.png"
    [9]="crawling-moving-happy.png"
    [10]="surprised-looking-up.png"
    [11]="surprised.png"
    [12]="flying.png"
)

echo "🚀 Uploading pose reference files to R2..."
echo ""

# Check if we have the source files
SOURCE_DIR="assets/poses/new-story"
if [ ! -d "$SOURCE_DIR" ]; then
    echo "❌ Source directory not found: $SOURCE_DIR"
    exit 1
fi

success_count=0
total_count=${#POSE_MAPPING[@]}

# Upload each pose
for pose_num in "${!POSE_MAPPING[@]}"; do
    source_file="${POSE_MAPPING[$pose_num]}"
    source_path="$SOURCE_DIR/$source_file"
    r2_key="book-mvp-simple-adventure/characters/poses/pose$(printf "%02d" $pose_num).png"
    
    echo "📤 Uploading: $source_file → $r2_key"
    
    # Check if source file exists
    if [ ! -f "$source_path" ]; then
        echo "❌ Source file not found: $source_path"
        continue
    fi
    
    # Upload using curl (you'll need to add your R2 credentials)
    # This is a placeholder - you'll need to add proper authentication
    echo "⚠️  Manual upload required for: $r2_key"
    echo "   Source: $source_path"
    echo "   R2 Path: $R2_ENDPOINT/$r2_key"
    echo ""
    
    success_count=$((success_count + 1))
done

echo "📊 Upload Summary:"
echo "   📁 Files to upload: $success_count/$total_count"
echo ""
echo "🔧 Manual Upload Instructions:"
echo "   1. Use your R2 dashboard or AWS CLI to upload files"
echo "   2. Upload from: assets/poses/new-story/"
echo "   3. Upload to: book-mvp-simple-adventure/characters/poses/"
echo "   4. Rename files to: pose01.png, pose02.png, etc."
echo ""
echo "📋 Files to upload:"
for pose_num in "${!POSE_MAPPING[@]}"; do
    source_file="${POSE_MAPPING[$pose_num]}"
    r2_name="pose$(printf "%02d" $pose_num).png"
    echo "   $source_file → $r2_name"
done
