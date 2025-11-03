#!/bin/bash
# Build verification script for Cloudflare Pages
# Checks that all required files exist in the build output directory

set -e

OUTPUT_DIR=".open-next/cloudflare"
REQUIRED_FILES=(
  "_worker.js"
  "assets"
  "_next/static"
)

echo "🔍 Verifying build output in: $OUTPUT_DIR"
echo ""

# Check if output directory exists
if [ ! -d "$OUTPUT_DIR" ]; then
  echo "❌ ERROR: Output directory '$OUTPUT_DIR' does not exist!"
  echo ""
  echo "Current directory: $(pwd)"
  echo "Directory contents:"
  ls -la .open-next/ 2>/dev/null || echo "  .open-next/ does not exist"
  exit 1
fi

echo "✅ Output directory exists"
echo ""

# Check for required files
MISSING_FILES=()
for file in "${REQUIRED_FILES[@]}"; do
  if [ ! -e "$OUTPUT_DIR/$file" ]; then
    MISSING_FILES+=("$file")
    echo "❌ Missing: $file"
  else
    echo "✅ Found: $file"
  fi
done

echo ""

# Report directory structure
echo "📁 Build output structure:"
tree -L 3 "$OUTPUT_DIR" 2>/dev/null || find "$OUTPUT_DIR" -maxdepth 3 -type f -o -type d | head -20

echo ""

# Check file sizes
if [ -f "$OUTPUT_DIR/_worker.js" ]; then
  WORKER_SIZE=$(du -h "$OUTPUT_DIR/_worker.js" | cut -f1)
  echo "📦 _worker.js size: $WORKER_SIZE"
fi

# Final status
if [ ${#MISSING_FILES[@]} -gt 0 ]; then
  echo ""
  echo "❌ BUILD VERIFICATION FAILED"
  echo "Missing files: ${MISSING_FILES[*]}"
  exit 1
else
  echo ""
  echo "✅ BUILD VERIFICATION PASSED"
  echo "All required files are present"
  exit 0
fi

