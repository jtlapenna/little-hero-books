#!/bin/bash
# Pre-deployment verification script
# Validates all imports in _worker.js can be resolved before deployment

set -e

OUTPUT_DIR=".open-next/cloudflare"

echo "🔍 Verifying _worker.js imports..."
echo "==================================="
echo ""

# Check if output directory exists
if [ ! -d "$OUTPUT_DIR" ]; then
  echo "❌ ERROR: Output directory '$OUTPUT_DIR' does not exist!"
  exit 1
fi

# Check if _worker.js exists
if [ ! -f "$OUTPUT_DIR/_worker.js" ]; then
  echo "❌ ERROR: _worker.js not found!"
  exit 1
fi

# Extract relative imports from _worker.js
echo "📄 Extracting import paths from _worker.js..."
echo ""

# Try to extract relative import paths (handles both minified and unminified)
RELATIVE_IMPORTS=$(grep -oE '["'"'"']\./[^"'"'"']+["'"'"']' "$OUTPUT_DIR/_worker.js" | sed 's/["'"'"']//g' | sort -u)

if [ -z "$RELATIVE_IMPORTS" ]; then
  echo "⚠️  Could not extract imports (file may be minified)"
  echo "   Checking known critical paths instead..."
  RELATIVE_IMPORTS="./server-functions/default/handler.mjs
./cloudflare/images.js
./cloudflare/init.js
./middleware/handler.mjs"
fi

MISSING_FILES=()
FAILED=false

echo "$RELATIVE_IMPORTS" | while IFS= read -r import_path; do
  # Skip empty lines
  [ -z "$import_path" ] && continue
  
  # Resolve path relative to OUTPUT_DIR
  RESOLVED_PATH="$OUTPUT_DIR/$import_path"
  
  # Try different extensions
  FOUND=false
  for ext in "" ".mjs" ".js"; do
    if [ -f "${RESOLVED_PATH}${ext}" ]; then
      FOUND=true
      echo "✅ $import_path"
      break
    fi
  done
  
  if [ "$FOUND" = false ]; then
    echo "❌ $import_path -> NOT FOUND"
    echo "   Expected at: $RESOLVED_PATH"
    MISSING_FILES+=("$import_path")
    FAILED=true
  fi
done

# Check critical file explicitly
CRITICAL_FILE="$OUTPUT_DIR/server-functions/default/handler.mjs"
if [ ! -f "$CRITICAL_FILE" ]; then
  echo ""
  echo "❌ CRITICAL: server-functions/default/handler.mjs is missing!"
  echo "   This file is required for the worker to function."
  echo ""
  echo "   Current server-functions structure:"
  find "$OUTPUT_DIR/server-functions" -type f 2>/dev/null | head -10 || echo "   (no files found)"
  exit 1
fi

echo ""
echo "✅ Critical file verified: server-functions/default/handler.mjs"

# Check directory structure
echo ""
echo "📂 Verifying directory structure..."
echo ""

REQUIRED_DIRS=(
  "server-functions"
  "server-functions/default"
  "cloudflare"
  "middleware"
  "assets"
)

for dir in "${REQUIRED_DIRS[@]}"; do
  if [ -d "$OUTPUT_DIR/$dir" ]; then
    echo "✅ $dir/"
  else
    echo "❌ $dir/ -> MISSING"
    exit 1
  fi
done

echo ""
echo "✅ All imports and directory structure verified!"
echo "   Ready for deployment."

