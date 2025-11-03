#!/bin/bash
# Pre-upload diagnostic script
# Captures detailed information about what will be uploaded to Cloudflare Pages
# Run this after the build completes to understand what's being deployed

set -e

OUTPUT_DIR=".open-next/cloudflare"

echo "📊 Pre-Upload Diagnostic Report"
echo "================================"
echo ""

if [ ! -d "$OUTPUT_DIR" ]; then
  echo "❌ ERROR: Output directory '$OUTPUT_DIR' does not exist!"
  exit 1
fi

# Generate comprehensive report
echo "📁 Output Directory: $OUTPUT_DIR"
echo "Generated: $(date)"
echo ""

# File count and size
echo "📈 FILE STATISTICS"
echo "------------------"
TOTAL_FILES=$(find "$OUTPUT_DIR" -type f | wc -l | tr -d ' ')
TOTAL_DIRS=$(find "$OUTPUT_DIR" -type d | wc -l | tr -d ' ')
TOTAL_SIZE=$(du -sh "$OUTPUT_DIR" 2>/dev/null | cut -f1)
TOTAL_SIZE_BYTES=$(du -sb "$OUTPUT_DIR" 2>/dev/null | cut -f1)

echo "Total files: $TOTAL_FILES"
echo "Total directories: $TOTAL_DIRS"
echo "Total size: $TOTAL_SIZE ($TOTAL_SIZE_BYTES bytes)"
echo ""

# Largest files
echo "📦 LARGEST FILES (top 15)"
echo "-------------------------"
find "$OUTPUT_DIR" -type f -exec du -h {} + 2>/dev/null | sort -rh | head -15
echo ""

# File structure
echo "📂 DIRECTORY STRUCTURE"
echo "---------------------"
echo "Top-level directories:"
ls -lah "$OUTPUT_DIR" | head -20
echo ""

# Check for problematic patterns
echo "🔍 POTENTIAL ISSUES"
echo "-------------------"
echo ""

# Check for very large files (>5MB)
LARGE_FILES=$(find "$OUTPUT_DIR" -type f -size +5M 2>/dev/null | wc -l | tr -d ' ')
if [ -n "$LARGE_FILES" ] && [ "$LARGE_FILES" -gt 0 ]; then
  echo "⚠️  Found $LARGE_FILES file(s) larger than 5MB:"
  find "$OUTPUT_DIR" -type f -size +5M -exec du -h {} + | head -5
  echo ""
fi

# Check for node_modules
NODE_MODULES=$(find "$OUTPUT_DIR" -name "node_modules" -type d | wc -l | tr -d ' ')
if [ "$NODE_MODULES" -gt 0 ]; then
  echo "❌ Found $NODE_MODULES node_modules directory(ies)!"
  find "$OUTPUT_DIR" -name "node_modules" -type d
  echo ""
fi

# Check for symlinks
SYMLINKS=$(find "$OUTPUT_DIR" -type l | wc -l | tr -d ' ')
if [ "$SYMLINKS" -gt 0 ]; then
  echo "⚠️  Found $SYMLINKS symlink(s) (may cause upload issues):"
  find "$OUTPUT_DIR" -type l | head -5
  echo ""
fi

# Check for special characters in filenames
SPECIAL_CHARS=$(find "$OUTPUT_DIR" -type f -name '*[^a-zA-Z0-9._/-]*' | wc -l | tr -d ' ')
if [ "$SPECIAL_CHARS" -gt 0 ]; then
  echo "⚠️  Found $SPECIAL_CHARS file(s) with special characters in names"
  find "$OUTPUT_DIR" -type f -name '*[^a-zA-Z0-9._/-]*' | head -5
  echo ""
fi

# Critical files check
echo "✅ CRITICAL FILES CHECK"
echo "----------------------"
CRITICAL_FILES=(
  "_worker.js"
  "_routes.json"
  "server-functions/default/handler.mjs"
  "cloudflare/images.js"
  "cloudflare/init.js"
  "middleware/handler.mjs"
)

for file in "${CRITICAL_FILES[@]}"; do
  if [ -f "$OUTPUT_DIR/$file" ]; then
    SIZE=$(du -h "$OUTPUT_DIR/$file" | cut -f1)
    echo "✅ $file ($SIZE)"
  else
    echo "❌ $file -> MISSING"
  fi
done
echo ""

# Generate file tree (limited depth)
echo "📊 FILE TREE (first 50 entries)"
echo "-------------------------------"
find "$OUTPUT_DIR" -type f | head -50
echo ""

# Summary
echo "📋 SUMMARY"
echo "---------"
echo "Files: $TOTAL_FILES"
echo "Size: $TOTAL_SIZE ($TOTAL_SIZE_BYTES bytes)"
echo ""

# Cloudflare Pages limits check
if [ -n "$TOTAL_SIZE_BYTES" ] && [ "$TOTAL_SIZE_BYTES" -gt 104857600 ]; then  # 100MB
  echo "⚠️  WARNING: Output size exceeds 100MB - may exceed Cloudflare Pages limits"
fi

if [ "$TOTAL_FILES" -gt 20000 ]; then
  echo "⚠️  WARNING: File count exceeds 20,000 - may exceed Cloudflare Pages limits"
fi

if [ "$LARGE_FILES" -gt 0 ]; then
  echo "⚠️  WARNING: Large files detected - may cause upload issues"
fi

echo ""
echo "✅ Diagnostic complete!"
echo ""
echo "💡 Next steps:"
echo "1. Review large files - consider if they can be optimized"
echo "2. Check file count - verify all files are necessary"
echo "3. If issues persist, consider alternative deployment method (wrangler pages deploy)"

