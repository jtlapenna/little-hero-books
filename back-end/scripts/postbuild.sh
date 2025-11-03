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

# Generate build timestamp (milliseconds since epoch)
# macOS date doesn't support %N, so use Node.js or fallback
if command -v node &> /dev/null; then
  BUILD_TIMESTAMP=$(node -e "console.log(Date.now())")
else
  # Fallback: seconds * 1000 (less precise but works everywhere)
  BUILD_TIMESTAMP=$(($(date +%s) * 1000))
fi

# Try cloudflare-templates first (these are the source implementations)
if [ -f ".open-next/cloudflare-templates/images.js" ]; then
  cp .open-next/cloudflare-templates/images.js "$OUTPUT_DIR/cloudflare/images.js"
  # Copy init.js and inject all required constants
  if [ -f ".open-next/cloudflare-templates/init.js" ]; then
    # Replace all object shorthand constants with actual values
    # Also inject __DEPLOYMENT_ID__ definition at the top of initRuntime function
    sed -e "s/__BUILD_TIMESTAMP_MS__,/__BUILD_TIMESTAMP_MS__: ${BUILD_TIMESTAMP},/g" \
        -e "s/__NEXT_BASE_PATH__,/__NEXT_BASE_PATH__: \"\",/g" \
        -e "s/__ASSETS_RUN_WORKER_FIRST__,/__ASSETS_RUN_WORKER_FIRST__: false,/g" \
        -e "s/__TRAILING_SLASH__,/__TRAILING_SLASH__: false,/g" \
        -e "s/function initRuntime() {/function initRuntime() {\n    const __DEPLOYMENT_ID__ = \"\";/g" \
      .open-next/cloudflare-templates/init.js > "$OUTPUT_DIR/cloudflare/init.js"
    echo "✅ Copied and updated init.js with constants (timestamp: ${BUILD_TIMESTAMP})"
  else
    cp .open-next/cloudflare-templates/init.js "$OUTPUT_DIR/cloudflare/init.js"
    echo "✅ Copied init.js (template not found)"
  fi
  # Copy skew-protection.js and inject __SKEW_PROTECTION_ENABLED__
  if [ -f ".open-next/cloudflare-templates/skew-protection.js" ]; then
    sed "s/__SKEW_PROTECTION_ENABLED__/false/g" \
      .open-next/cloudflare-templates/skew-protection.js > "$OUTPUT_DIR/cloudflare/skew-protection.js"
    echo "✅ Copied and updated skew-protection.js"
  else
    cp .open-next/cloudflare-templates/skew-protection.js "$OUTPUT_DIR/cloudflare/skew-protection.js"
    echo "✅ Copied skew-protection.js"
  fi
  echo "✅ Copied cloudflare files from cloudflare-templates"
# Fallback to .open-next/cloudflare if templates don't exist
elif [ -f ".open-next/cloudflare/images.js" ]; then
  cp .open-next/cloudflare/images.js "$OUTPUT_DIR/cloudflare/images.js"
  # Copy init.js and inject all required constants
  if [ -f ".open-next/cloudflare/init.js" ]; then
    # Replace all object shorthand constants with actual values (or update existing values)
    # Also inject __DEPLOYMENT_ID__ definition at the top of initRuntime function
    sed -e "s/__BUILD_TIMESTAMP_MS__,/__BUILD_TIMESTAMP_MS__: ${BUILD_TIMESTAMP},/g" \
        -e "s/__BUILD_TIMESTAMP_MS__: [0-9]*,/__BUILD_TIMESTAMP_MS__: ${BUILD_TIMESTAMP},/g" \
        -e "s/__NEXT_BASE_PATH__,/__NEXT_BASE_PATH__: \"\",/g" \
        -e "s/__ASSETS_RUN_WORKER_FIRST__,/__ASSETS_RUN_WORKER_FIRST__: false,/g" \
        -e "s/__TRAILING_SLASH__,/__TRAILING_SLASH__: false,/g" \
        -e "s/function initRuntime() {/function initRuntime() {\n    const __DEPLOYMENT_ID__ = \"\";/g" \
      .open-next/cloudflare/init.js > "$OUTPUT_DIR/cloudflare/init.js"
    echo "✅ Copied and updated init.js with constants (timestamp: ${BUILD_TIMESTAMP})"
  else
    cp .open-next/cloudflare/init.js "$OUTPUT_DIR/cloudflare/init.js"
    echo "✅ Copied init.js (template not found)"
  fi
  # Copy skew-protection.js and inject __SKEW_PROTECTION_ENABLED__
  if [ -f ".open-next/cloudflare/skew-protection.js" ]; then
    sed "s/__SKEW_PROTECTION_ENABLED__/false/g" \
      .open-next/cloudflare/skew-protection.js > "$OUTPUT_DIR/cloudflare/skew-protection.js"
    echo "✅ Copied and updated skew-protection.js"
  else
    cp .open-next/cloudflare/skew-protection.js "$OUTPUT_DIR/cloudflare/skew-protection.js"
    echo "✅ Copied skew-protection.js"
  fi
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

# Create _routes.json for static asset routing
echo "📝 Creating _routes.json"
cat > "$OUTPUT_DIR/_routes.json" << 'EOF'
{
  "version": 1,
  "include": ["/*"],
  "exclude": ["/_next/*", "/favicon.ico"]
}
EOF
echo "✅ Created _routes.json"

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

# Run pre-upload diagnostic
if [ -f "scripts/pre-upload-diagnostic.sh" ]; then
  echo ""
  echo "📊 Running pre-upload diagnostic..."
  bash scripts/pre-upload-diagnostic.sh
fi

