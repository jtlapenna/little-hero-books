#!/bin/bash
# Post-build script for Cloudflare Pages
# Reorganizes OpenNext output into Cloudflare Pages-compatible structure

set -e  # Fail on error

echo "🔨 Running post-build script..."

OUTPUT_DIR=".open-next/cloudflare"

# Create output directory
echo "📁 Creating output directory: $OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# Copy worker file
echo "📦 Copying worker.js to _worker.js"
if [ ! -f ".open-next/worker.js" ]; then
  echo "❌ ERROR: .open-next/worker.js not found!"
  exit 1
fi
cp .open-next/worker.js "$OUTPUT_DIR/_worker.js"
echo "✅ Copied worker.js"

# Copy assets
echo "📦 Copying assets directory"
if [ ! -d ".open-next/assets" ]; then
  echo "❌ ERROR: .open-next/assets directory not found!"
  exit 1
fi
cp -r .open-next/assets "$OUTPUT_DIR/assets"
echo "✅ Copied assets"

# Copy static files
echo "📦 Copying static files"
if [ ! -d ".next/static" ]; then
  echo "⚠️  WARNING: .next/static directory not found (may be OK if no static files)"
else
  mkdir -p "$OUTPUT_DIR/_next/static"
  cp -r .next/static/* "$OUTPUT_DIR/_next/static/"
  echo "✅ Copied static files"
fi

# Create _routes.json for static asset routing
echo "📝 Creating _routes.json"
cat > "$OUTPUT_DIR/_routes.json" << 'EOF'
{
  "include": ["/*"],
  "exclude": ["/_next/*", "/favicon.ico"]
}
EOF
echo "✅ Created _routes.json"

# Verify critical files exist
echo "🔍 Verifying build output..."
test -f "$OUTPUT_DIR/_worker.js" || { echo "❌ ERROR: _worker.js missing!"; exit 1; }
test -d "$OUTPUT_DIR/assets" || { echo "❌ ERROR: assets directory missing!"; exit 1; }

echo ""
echo "✅ Post-build script completed successfully!"
echo "📁 Output directory structure:"
ls -la "$OUTPUT_DIR" | head -10

