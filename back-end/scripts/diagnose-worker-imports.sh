#!/bin/bash
# Diagnostic script to analyze _worker.js imports and verify file structure
# Identifies import resolution issues before deployment

set -e

OUTPUT_DIR=".open-next/cloudflare"

echo "🔍 Diagnosing _worker.js imports and file structure..."
echo "====================================================="
echo ""

# Check if output directory exists
if [ ! -d "$OUTPUT_DIR" ]; then
  echo "❌ ERROR: Output directory '$OUTPUT_DIR' does not exist!"
  echo "Run 'npm run pages:build' first to generate the output."
  exit 1
fi

# Check if _worker.js exists
if [ ! -f "$OUTPUT_DIR/_worker.js" ]; then
  echo "❌ ERROR: _worker.js not found in $OUTPUT_DIR"
  exit 1
fi

echo "📄 Analyzing _worker.js imports..."
echo "---------------------------------"

# Extract all import/require statements from _worker.js
echo "Import statements found in _worker.js:"
echo ""

IMPORTS=$(grep -E "(import|require|from|import\(|await import)" "$OUTPUT_DIR/_worker.js" | grep -oE '["'"'"'][^"'"'"']+["'"'"']' | sed 's/["'"'"']//g' | sort -u)

if [ -z "$IMPORTS" ]; then
  echo "⚠️  No import statements found (may be minified)"
  # Try to find relative imports even if minified
  echo ""
  echo "Searching for relative path patterns..."
  grep -oE '["'"'"']\./[^"'"'"']+["'"'"']' "$OUTPUT_DIR/_worker.js" | sed 's/["'"'"']//g' | sort -u || echo "No relative imports found"
else
  echo "$IMPORTS" | while read -r import_path; do
    # Skip empty lines
    [ -z "$import_path" ] && continue
    
    # Handle relative imports
    if [[ "$import_path" == ./* ]]; then
      # Resolve relative path from _worker.js location
      RESOLVED_PATH="$OUTPUT_DIR/$import_path"
      # Remove .mjs extension if present for file check
      CHECK_PATH="${RESOLVED_PATH%.mjs}"
      
      if [ -f "$RESOLVED_PATH" ] || [ -f "$CHECK_PATH.mjs" ] || [ -f "$CHECK_PATH.js" ]; then
        echo "✅ $import_path -> Found"
      else
        echo "❌ $import_path -> MISSING"
        echo "   Expected at: $RESOLVED_PATH"
      fi
    else
      echo "ℹ️  $import_path (external/absolute)"
    fi
  done
fi

echo ""
echo "📁 Verifying server-functions structure..."
echo "------------------------------------------"

# Check for server-functions directory
if [ ! -d "$OUTPUT_DIR/server-functions" ]; then
  echo "❌ ERROR: server-functions directory not found!"
  exit 1
fi

echo "✅ server-functions directory exists"

# Check for default subdirectory
if [ ! -d "$OUTPUT_DIR/server-functions/default" ]; then
  echo "❌ ERROR: server-functions/default directory not found!"
  exit 1
fi

echo "✅ server-functions/default directory exists"

# Check for handler.mjs
HANDLER_PATH="$OUTPUT_DIR/server-functions/default/handler.mjs"
if [ ! -f "$HANDLER_PATH" ]; then
  echo "❌ ERROR: handler.mjs not found at expected path!"
  echo "   Expected: $HANDLER_PATH"
  echo ""
  echo "   Files in server-functions/default:"
  ls -la "$OUTPUT_DIR/server-functions/default/" 2>/dev/null || echo "   (directory is empty or doesn't exist)"
  exit 1
fi

echo "✅ handler.mjs found at: $HANDLER_PATH"
HANDLER_SIZE=$(du -h "$HANDLER_PATH" | cut -f1)
echo "   Size: $HANDLER_SIZE"

echo ""
echo "📂 Complete server-functions directory structure:"
echo "-------------------------------------------------"
find "$OUTPUT_DIR/server-functions" -type f | head -20
echo ""

# Check for any node_modules that might have been missed
echo "🔍 Checking for node_modules in server-functions..."
NODE_MODULES_COUNT=$(find "$OUTPUT_DIR/server-functions" -name "node_modules" -type d | wc -l | tr -d ' ')
if [ "$NODE_MODULES_COUNT" -gt 0 ]; then
  echo "⚠️  WARNING: Found $NODE_MODULES_COUNT node_modules directory(ies) in server-functions!"
  find "$OUTPUT_DIR/server-functions" -name "node_modules" -type d
else
  echo "✅ No node_modules found in server-functions"
fi

echo ""
echo "📊 File count in server-functions:"
echo "----------------------------------"
FILE_COUNT=$(find "$OUTPUT_DIR/server-functions" -type f | wc -l | tr -d ' ')
DIR_COUNT=$(find "$OUTPUT_DIR/server-functions" -type d | wc -l | tr -d ' ')
echo "Files: $FILE_COUNT"
echo "Directories: $DIR_COUNT"

echo ""
echo "🔍 Checking critical import paths..."
echo "------------------------------------"

# Check specific known imports
CRITICAL_IMPORTS=(
  "./server-functions/default/handler.mjs"
  "./cloudflare/images.js"
  "./cloudflare/init.js"
  "./middleware/handler.mjs"
)

ALL_GOOD=true
for import in "${CRITICAL_IMPORTS[@]}"; do
  RESOLVED="$OUTPUT_DIR/$import"
  if [ -f "$RESOLVED" ]; then
    echo "✅ $import"
  else
    echo "❌ $import -> NOT FOUND"
    echo "   Expected at: $RESOLVED"
    ALL_GOOD=false
  fi
done

echo ""
if [ "$ALL_GOOD" = true ]; then
  echo "✅ All critical imports verified!"
else
  echo "❌ Some critical imports are missing!"
  exit 1
fi

echo ""
echo "✅ Diagnosis complete!"

