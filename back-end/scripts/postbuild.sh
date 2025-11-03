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

# Try cloudflare-templates first (these are the source implementations)
if [ -f ".open-next/cloudflare-templates/images.js" ]; then
  cp .open-next/cloudflare-templates/images.js "$OUTPUT_DIR/cloudflare/images.js"
  cp .open-next/cloudflare-templates/init.js "$OUTPUT_DIR/cloudflare/init.js"
  cp .open-next/cloudflare-templates/skew-protection.js "$OUTPUT_DIR/cloudflare/skew-protection.js"
  echo "✅ Copied cloudflare files from cloudflare-templates"
# Fallback to .open-next/cloudflare if templates don't exist
elif [ -f ".open-next/cloudflare/images.js" ]; then
  cp .open-next/cloudflare/images.js "$OUTPUT_DIR/cloudflare/images.js"
  cp .open-next/cloudflare/init.js "$OUTPUT_DIR/cloudflare/init.js"
  cp .open-next/cloudflare/skew-protection.js "$OUTPUT_DIR/cloudflare/skew-protection.js"
  echo "✅ Copied cloudflare files from .open-next/cloudflare"
else
  echo "❌ ERROR: cloudflare files not found in expected locations!"
  exit 1
fi

# Copy next-env.mjs to cloudflare/ directory (needed by init.js)
if [ -f ".open-next/cloudflare/next-env.mjs" ]; then
  cp .open-next/cloudflare/next-env.mjs "$OUTPUT_DIR/cloudflare/next-env.mjs"
  echo "✅ Copied next-env.mjs to cloudflare/"
elif [ -f "$OUTPUT_DIR/next-env.mjs" ]; then
  # If it's already at root, copy it to cloudflare/ as well
  cp "$OUTPUT_DIR/next-env.mjs" "$OUTPUT_DIR/cloudflare/next-env.mjs"
  echo "✅ Copied next-env.mjs from root to cloudflare/"
else
  echo "⚠️  WARNING: next-env.mjs not found, but continuing..."
fi

# Copy middleware directory (contains handler.mjs)
echo "📦 Copying middleware directory"
if [ -d ".open-next/middleware" ]; then
  cp -r .open-next/middleware "$OUTPUT_DIR/"
  echo "✅ Copied middleware"
else
  echo "❌ ERROR: .open-next/middleware directory not found!"
  exit 1
fi

# Copy server-functions directory
echo "📦 Copying server-functions directory"
if [ -d ".open-next/server-functions" ]; then
  cp -r .open-next/server-functions "$OUTPUT_DIR/"
  echo "✅ Copied server-functions"
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

# Copy assets directory
echo "📦 Copying assets directory"
if [ ! -d ".open-next/assets" ]; then
  echo "❌ ERROR: .open-next/assets directory not found!"
  exit 1
fi
cp -r .open-next/assets "$OUTPUT_DIR/assets"
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
test -d "$OUTPUT_DIR/middleware" || { echo "❌ ERROR: middleware directory missing!"; exit 1; }
test -d "$OUTPUT_DIR/server-functions" || { echo "❌ ERROR: server-functions directory missing!"; exit 1; }

echo ""
echo "✅ Post-build script completed successfully!"
echo "📁 Output directory structure:"
ls -la "$OUTPUT_DIR" | head -15

