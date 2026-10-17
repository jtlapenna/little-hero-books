#!/bin/bash
# Post-build script for Cloudflare Pages
# Reorganizes OpenNext output into Cloudflare Pages-compatible structure
# _worker.js has relative imports that require the full .open-next directory structure

set -e  # Fail on error

echo "🔨 Running post-build script..."

OUTPUT_DIR=".open-next/cloudflare"

# Create output directory
echo "📁 Creating output directory: $OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# Copy worker file (rename to _worker.js for Pages)
echo "📦 Copying worker.js to _worker.js"
if [ ! -f ".open-next/worker.js" ]; then
  echo "❌ ERROR: .open-next/worker.js not found!"
  exit 1
fi
cp .open-next/worker.js "$OUTPUT_DIR/_worker.js"
echo "✅ Copied worker.js"

# Copy cloudflare directory (contains images.js, init.js, skew-protection.js)
# _worker.js imports from "./cloudflare/images.js", so we need cloudflare/ subdirectory
echo "📦 Copying cloudflare directory"
mkdir -p "$OUTPUT_DIR/cloudflare"

# Require the compiled helpers: raw templates still contain unresolved build constants.
# The build writes these inputs at the output root; the worker imports the nested cloudflare/ copies.
for helper in images.js init.js skew-protection.js next-env.mjs; do
  if [ ! -f ".open-next/cloudflare/$helper" ]; then
    echo "ERROR: compiled Cloudflare helper missing: $helper"
    exit 1
  fi
  cp ".open-next/cloudflare/$helper" "$OUTPUT_DIR/cloudflare/$helper"
done

# Copy middleware directory (contains handler.mjs)
echo "📦 Copying middleware directory"
if [ -d ".open-next/middleware" ]; then
  cp -r .open-next/middleware "$OUTPUT_DIR/"
  echo "✅ Copied middleware"
else
  echo "❌ ERROR: .open-next/middleware directory not found!"
  exit 1
fi

# Copy server-functions directory (excluding node_modules)
echo "📦 Copying server-functions directory (excluding node_modules)"
if [ -d ".open-next/server-functions" ]; then
  # Use rsync if available (better for excluding patterns), otherwise use find + cp
  if command -v rsync &> /dev/null; then
    rsync -av --exclude='node_modules' --exclude='**/node_modules' --exclude='package.json' --exclude='**/package.json' \
      .open-next/server-functions/ "$OUTPUT_DIR/server-functions/"
    echo "✅ Copied server-functions (using rsync)"
  else
    # Fallback: use find to copy files while excluding node_modules
    # Need to strip .open-next/server-functions/ prefix from source path
    mkdir -p "$OUTPUT_DIR/server-functions"
    find .open-next/server-functions -type f \
      ! -path "*/node_modules/*" \
      ! -name "package.json" \
      -exec sh -c 'src="$1"; dest_base="$2"; dest_path="${src#.open-next/server-functions/}"; dest="$dest_base/$dest_path"; mkdir -p "$(dirname "$dest")" && cp "$src" "$dest"' _ {} "$OUTPUT_DIR/server-functions" \;
    echo "✅ Copied server-functions (using find)"
  fi
else
  echo "❌ ERROR: .open-next/server-functions directory not found!"
  exit 1
fi

# Copy .build directory if it exists (for durable objects)
echo "📦 Copying .build directory (if exists)"
if [ -d ".open-next/.build" ]; then
  cp -r .open-next/.build "$OUTPUT_DIR/"
  echo "✅ Copied .build directory"
else
  echo "⚠️  WARNING: .open-next/.build directory not found (may be OK)"
  # Create empty .build directory structure to avoid import errors
  mkdir -p "$OUTPUT_DIR/.build/durable-objects"
  touch "$OUTPUT_DIR/.build/durable-objects/queue.js"
  touch "$OUTPUT_DIR/.build/durable-objects/sharded-tag-cache.js"
  touch "$OUTPUT_DIR/.build/durable-objects/bucket-cache-purge.js"
  echo "✅ Created placeholder .build directory"
fi

# Copy assets directory (excluding node_modules if present)
echo "📦 Copying assets directory"
if [ ! -d ".open-next/assets" ]; then
  echo "❌ ERROR: .open-next/assets directory not found!"
  exit 1
fi
# Use rsync if available to exclude node_modules, otherwise use cp
if command -v rsync &> /dev/null; then
  rsync -av --exclude='node_modules' --exclude='**/node_modules' \
    .open-next/assets/ "$OUTPUT_DIR/assets/"
else
  cp -r .open-next/assets "$OUTPUT_DIR/assets"
  # Remove node_modules if they exist
  find "$OUTPUT_DIR/assets" -type d -name "node_modules" -exec rm -rf {} + 2>/dev/null || true
fi
echo "✅ Copied assets"

# Copy static files from .next to _next/static
echo "📦 Copying static files"
if [ ! -d ".next/static" ]; then
  echo "⚠️  WARNING: .next/static directory not found (may be OK if no static files)"
else
  mkdir -p "$OUTPUT_DIR/_next/static"
  cp -r .next/static/* "$OUTPUT_DIR/_next/static/"
  echo "✅ Copied static files"
fi

# Copy public directory files to output root (for static assets like PDF worker)
echo "📦 Copying public directory files"
if [ -d "public" ]; then
  # Copy all files from public/ to output root, preserving directory structure
  # Use find to copy files individually to handle edge cases
  find public -type f -exec sh -c 'src="$1"; dest_base="$2"; dest_path="${src#public/}"; dest="$dest_base/$dest_path"; mkdir -p "$(dirname "$dest")" && cp "$src" "$dest"' _ {} "$OUTPUT_DIR" \;
  
  # Verify critical files were copied
  if [ -f "public/pdf.worker.min.mjs" ]; then
    if [ -f "$OUTPUT_DIR/pdf.worker.min.mjs" ]; then
      echo "✅ Copied pdf.worker.min.mjs to output root"
    else
      echo "❌ ERROR: pdf.worker.min.mjs not found in output directory!"
      exit 1
    fi
  fi
  echo "✅ Copied public directory files"
else
  echo "⚠️  WARNING: public directory not found (may be OK if no public files)"
fi

# Install raw-entry policy before OpenNext normalization/image shortcuts and emit narrow static exclusions.
node --import tsx scripts/enforce-pages-access-boundary.mts "$OUTPUT_DIR"
echo "✅ Installed raw access boundary and reviewed Pages routes"

# Clean up any remaining node_modules or package.json files that shouldn't be deployed
echo "🧹 Cleaning up unnecessary files..."
find "$OUTPUT_DIR" -type d -name "node_modules" -exec rm -rf {} + 2>/dev/null || true
find "$OUTPUT_DIR/server-functions" -name "package.json" -type f -delete 2>/dev/null || true
echo "✅ Cleanup complete"

# Verify critical files exist
echo "🔍 Verifying build output..."
test -f "$OUTPUT_DIR/_worker.js" || { echo "❌ ERROR: _worker.js missing!"; exit 1; }
test -d "$OUTPUT_DIR/assets" || { echo "❌ ERROR: assets directory missing!"; exit 1; }
test -d "$OUTPUT_DIR/middleware" || { echo "❌ ERROR: middleware directory missing!"; exit 1; }
test -d "$OUTPUT_DIR/server-functions" || { echo "❌ ERROR: server-functions directory missing!"; exit 1; }

# Verify critical import files exist
echo "🔍 Verifying critical imports..."
test -f "$OUTPUT_DIR/server-functions/default/handler.mjs" || { 
  echo "❌ ERROR: server-functions/default/handler.mjs missing!"
  echo "   This file is required for _worker.js to function."
  echo "   Files in server-functions/default:"
  ls -la "$OUTPUT_DIR/server-functions/default/" 2>/dev/null || echo "   (directory is empty)"
  exit 1
}
test -f "$OUTPUT_DIR/cloudflare/images.js" || { echo "❌ ERROR: cloudflare/images.js missing!"; exit 1; }
test -f "$OUTPUT_DIR/cloudflare/init.js" || { echo "❌ ERROR: cloudflare/init.js missing!"; exit 1; }
test -f "$OUTPUT_DIR/middleware/handler.mjs" || { echo "❌ ERROR: middleware/handler.mjs missing!"; exit 1; }
echo "✅ All critical imports verified"

echo ""
echo "✅ Post-build script completed successfully!"
echo "📁 Output directory structure:"
ls -la "$OUTPUT_DIR" | head -15

# Run pre-upload diagnostic (temporarily disabled for faster builds)
# Uncomment to enable diagnostic reporting
# if [ -f "scripts/pre-upload-diagnostic.sh" ]; then
#   echo ""
#   echo "📊 Running pre-upload diagnostic..."
#   bash scripts/pre-upload-diagnostic.sh
# fi

