#!/bin/bash
# Cloudflare Pages Build Script for Next.js

# Exit on any error
set -e

# Navigate to back-end directory
cd back-end

# Install dependencies
echo "Installing dependencies..."
npm install

# Build the Next.js application
echo "Building Next.js application..."
npm run build

echo "Build complete!"

