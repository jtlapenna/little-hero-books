#!/bin/bash
# Cloudflare Pages build script for marketing site
# This ensures we build from the marketing directory

set -e  # Exit on error

echo "🔨 Building marketing site..."

# We're already in the marketing directory (Cloudflare Pages sets root directory)
# Install dependencies
echo "📦 Installing dependencies..."
npm ci

# Build Next.js app
echo "🏗️ Building Next.js application..."
npm run build

echo "✅ Build complete!"

