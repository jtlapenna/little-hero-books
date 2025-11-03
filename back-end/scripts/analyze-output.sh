#!/bin/bash
# Diagnostic script to analyze Cloudflare Pages output directory
# Identifies potential issues that could cause deployment failures

set -e

OUTPUT_DIR=".open-next/cloudflare"

echo "📊 Analyzing Cloudflare Pages output directory..."
echo "=================================================="
echo ""

# Check if directory exists
if [ ! -d "$OUTPUT_DIR" ]; then
  echo "❌ ERROR: Output directory '$OUTPUT_DIR' does not exist!"
  echo "Run 'npm run pages:build' first to generate the output."
  exit 1
fi

echo "📁 Output Directory: $OUTPUT_DIR"
echo ""

# 1. Total file count and size
echo "📈 SIZE STATISTICS"
echo "------------------"
TOTAL_FILES=$(find "$OUTPUT_DIR" -type f | wc -l | tr -d ' ')
TOTAL_DIRS=$(find "$OUTPUT_DIR" -type d | wc -l | tr -d ' ')
TOTAL_SIZE=$(du -sh "$OUTPUT_DIR" 2>/dev/null | cut -f1)
ACTUAL_SIZE_BYTES=$(du -sb "$OUTPUT_DIR" 2>/dev/null | cut -f1)

echo "Total files: $TOTAL_FILES"
echo "Total directories: $TOTAL_DIRS"
echo "Total size: $TOTAL_SIZE ($ACTUAL_SIZE_BYTES bytes)"
echo ""

# 2. Largest files and directories
echo "📦 LARGEST FILES (top 10)"
echo "--------------------------"
find "$OUTPUT_DIR" -type f -exec du -h {} + 2>/dev/null | sort -rh | head -10
echo ""

echo "📦 LARGEST DIRECTORIES (top 10)"
echo "--------------------------------"
du -h --max-depth=1 "$OUTPUT_DIR" 2>/dev/null | sort -rh | head -10
echo ""

# 3. Node modules check
echo "🔍 NODE_MODULES DETECTION"
echo "--------------------------"
NODE_MODULES_COUNT=$(find "$OUTPUT_DIR" -name "node_modules" -type d | wc -l | tr -d ' ')
if [ "$NODE_MODULES_COUNT" -gt 0 ]; then
  echo "⚠️  WARNING: Found $NODE_MODULES_COUNT node_modules directory(ies)!"
  echo "   These should NOT be deployed to Cloudflare Pages."
  find "$OUTPUT_DIR" -name "node_modules" -type d
  NODE_MODULES_SIZE=$(find "$OUTPUT_DIR" -name "node_modules" -type d -exec du -sh {} + 2>/dev/null | awk '{sum+=$1} END {print sum}' || echo "unknown")
  echo "   Total size: $NODE_MODULES_SIZE"
else
  echo "✅ No node_modules directories found"
fi
echo ""

# 4. File type analysis
echo "📄 FILE TYPE BREAKDOWN"
echo "----------------------"
echo "JavaScript files: $(find "$OUTPUT_DIR" -name "*.js" -type f | wc -l | tr -d ' ')"
echo "TypeScript files: $(find "$OUTPUT_DIR" -name "*.ts" -type f | wc -l | tr -d ' ')"
echo "JSON files: $(find "$OUTPUT_DIR" -name "*.json" -type f | wc -l | tr -d ' ')"
echo "MJS files: $(find "$OUTPUT_DIR" -name "*.mjs" -type f | wc -l | tr -d ' ')"
echo "HTML files: $(find "$OUTPUT_DIR" -name "*.html" -type f | wc -l | tr -d ' ')"
echo "CSS files: $(find "$OUTPUT_DIR" -name "*.css" -type f | wc -l | tr -d ' ')"
echo "Image files: $(find "$OUTPUT_DIR" -type f \( -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" -o -name "*.gif" -o -name "*.svg" -o -name "*.webp" \) | wc -l | tr -d ' ')"
echo "Binary files: $(find "$OUTPUT_DIR" -type f -exec file {} \; 2>/dev/null | grep -c "binary" || echo "0")"
echo ""

# 5. Directory depth analysis
echo "📐 DIRECTORY DEPTH ANALYSIS"
echo "--------------------------"
MAX_DEPTH=$(find "$OUTPUT_DIR" -type d | sed 's|[^/]||g' | sort -u | tail -1 | wc -c)
echo "Maximum directory depth: $((MAX_DEPTH - 1))"
echo ""

# 6. Duplicate files check (by name)
echo "🔄 DUPLICATE FILE NAMES"
echo "----------------------"
DUPLICATES=$(find "$OUTPUT_DIR" -type f -exec basename {} \; | sort | uniq -d | wc -l | tr -d ' ')
if [ "$DUPLICATES" -gt 0 ]; then
  echo "⚠️  Found $DUPLICATES duplicate file names:"
  find "$OUTPUT_DIR" -type f -exec basename {} \; | sort | uniq -d | head -10
else
  echo "✅ No duplicate file names found"
fi
echo ""

# 7. Source files check (should not be deployed)
echo "🔍 SOURCE FILES DETECTION"
echo "-------------------------"
TS_FILES=$(find "$OUTPUT_DIR" -name "*.ts" -type f | wc -l | tr -d ' ')
TSX_FILES=$(find "$OUTPUT_DIR" -name "*.tsx" -type f | wc -l | tr -d ' ')
if [ "$TS_FILES" -gt 0 ] || [ "$TSX_FILES" -gt 0 ]; then
  echo "⚠️  WARNING: Found TypeScript source files in output!"
  echo "   .ts files: $TS_FILES"
  echo "   .tsx files: $TSX_FILES"
  echo "   These should not be deployed (only compiled JS should be included)."
else
  echo "✅ No TypeScript source files found"
fi
echo ""

# 8. Critical files check
echo "✅ CRITICAL FILES CHECK"
echo "----------------------"
CRITICAL_FILES=("_worker.js" "_routes.json" "assets" "middleware" "server-functions" "cloudflare")
for file in "${CRITICAL_FILES[@]}"; do
  if [ -e "$OUTPUT_DIR/$file" ]; then
    echo "✅ Found: $file"
  else
    echo "❌ Missing: $file"
  fi
done
echo ""

# 9. Directory structure overview
echo "📂 DIRECTORY STRUCTURE (top 3 levels)"
echo "-------------------------------------"
find "$OUTPUT_DIR" -maxdepth 3 -type d | sort | head -30
echo ""

# 10. Package.json files (should not be in output)
echo "📦 PACKAGE.JSON FILES"
echo "--------------------"
PKG_JSON_COUNT=$(find "$OUTPUT_DIR" -name "package.json" -type f | wc -l | tr -d ' ')
if [ "$PKG_JSON_COUNT" -gt 0 ]; then
  echo "⚠️  WARNING: Found $PKG_JSON_COUNT package.json file(s):"
  find "$OUTPUT_DIR" -name "package.json" -type f
else
  echo "✅ No package.json files found"
fi
echo ""

# 11. Lock files (should not be in output)
echo "🔒 LOCK FILES"
echo "-------------"
LOCK_FILES=$(find "$OUTPUT_DIR" -name "package-lock.json" -o -name "yarn.lock" -o -name "pnpm-lock.yaml" | wc -l | tr -d ' ')
if [ "$LOCK_FILES" -gt 0 ]; then
  echo "⚠️  WARNING: Found $LOCK_FILES lock file(s):"
  find "$OUTPUT_DIR" -name "package-lock.json" -o -name "yarn.lock" -o -name "pnpm-lock.yaml"
else
  echo "✅ No lock files found"
fi
echo ""

# 12. Summary and recommendations
echo "📋 SUMMARY & RECOMMENDATIONS"
echo "============================"
ISSUES=0

if [ "$NODE_MODULES_COUNT" -gt 0 ]; then
  echo "❌ ISSUE: node_modules directories found - remove these"
  ISSUES=$((ISSUES + 1))
fi

if [ "$TS_FILES" -gt 0 ] || [ "$TSX_FILES" -gt 0 ]; then
  echo "❌ ISSUE: TypeScript source files found - remove these"
  ISSUES=$((ISSUES + 1))
fi

if [ "$PKG_JSON_COUNT" -gt 0 ]; then
  echo "⚠️  WARNING: package.json files found - may be unnecessary"
  ISSUES=$((ISSUES + 1))
fi

if [ "$LOCK_FILES" -gt 0 ]; then
  echo "⚠️  WARNING: lock files found - may be unnecessary"
  ISSUES=$((ISSUES + 1))
fi

# Check file count (Cloudflare Pages has limits)
if [ "$TOTAL_FILES" -gt 20000 ]; then
  echo "⚠️  WARNING: Very high file count ($TOTAL_FILES) - may exceed Cloudflare Pages limits"
  ISSUES=$((ISSUES + 1))
fi

# Check size (Cloudflare Pages has limits)
if [ -n "$ACTUAL_SIZE_BYTES" ] && [ "$ACTUAL_SIZE_BYTES" -gt 104857600 ]; then  # 100MB
  echo "⚠️  WARNING: Large output size - may exceed Cloudflare Pages limits"
  ISSUES=$((ISSUES + 1))
fi

if [ "$ISSUES" -eq 0 ]; then
  echo "✅ No major issues detected"
else
  echo ""
  echo "Total issues found: $ISSUES"
fi

echo ""
echo "✅ Analysis complete!"

