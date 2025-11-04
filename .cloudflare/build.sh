#!/bin/bash
# Cloudflare Pages build script
# This script is used by Cloudflare Pages auto-deploy

set -e  # Exit on error

echo "🔨 Starting Cloudflare Pages build..."

# Navigate to back-end directory
cd back-end

# Install dependencies
echo "📦 Installing dependencies..."
npm ci

# Build for Cloudflare Pages
echo "🏗️ Building for Cloudflare Pages..."
npm run pages:build

echo "✅ Build complete!"

