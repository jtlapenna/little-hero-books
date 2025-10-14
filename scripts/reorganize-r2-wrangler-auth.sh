#!/bin/bash

# R2 Bucket Reorganization Script using Wrangler Authentication + Manual Steps
# This script helps reorganize the little-hero-assets R2 bucket structure

echo "🔄 R2 Bucket Reorganization Script (Wrangler Auth + Dashboard)"
echo "============================================================="
echo ""

# Set your R2 bucket info
BUCKET_NAME="little-hero-assets"

echo "📋 Reorganization Plan:"
echo "1. Move fonts/ → book-mvp-simple-adventure/fonts/"
echo "2. Move overlays/ → book-mvp-simple-adventure/overlays/"
echo "3. Move characters/ → book-mvp-simple-adventure/order-generated-assets/characters/"
echo ""

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Installing..."
    echo "Installing wrangler..."
    npm install -g wrangler
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install wrangler. Please install manually:"
        echo "   npm install -g wrangler"
        echo "   or"
        echo "   yarn global add wrangler"
        exit 1
    fi
fi

echo "✅ Wrangler CLI found"

# Check if user is logged in
if ! wrangler whoami &> /dev/null; then
    echo "🔐 Not logged in to Cloudflare. Opening browser for authentication..."
    echo ""
    echo "Please complete the authentication in your browser window."
    echo "Press Enter when you're done authenticating..."
    read -p "Press Enter to continue..."
    
    # Try to login
    wrangler login
    if [ $? -ne 0 ]; then
        echo "❌ Failed to authenticate. Please try again."
        exit 1
    fi
fi

echo "✅ Authenticated with Cloudflare"

# Test the connection by listing buckets
echo "🔍 Testing connection to R2..."
if wrangler r2 bucket list > /dev/null 2>&1; then
    echo "✅ Successfully connected to R2"
else
    echo "❌ Failed to connect to R2. Please check your authentication."
    exit 1
fi

echo ""
echo "⚠️  Note: Wrangler CLI doesn't have list/copy commands for R2 objects."
echo "   We'll use the R2 Dashboard for the actual file operations."
echo ""

echo "🌐 R2 Dashboard Links (You're now authenticated):"
echo "=================================================="
echo ""
echo "📁 Fonts Directory:"
echo "   https://dash.cloudflare.com/3daae940fcb6fc5b8bbd9bb8fcc62854/r2/default/buckets/$BUCKET_NAME?prefix=fonts%2F"
echo ""
echo "📁 Overlays Directory:"
echo "   https://dash.cloudflare.com/3daae940fcb6fc5b8bbd9bb8fcc62854/r2/default/buckets/$BUCKET_NAME?prefix=overlays%2F"
echo ""
echo "📁 Characters Directory:"
echo "   https://dash.cloudflare.com/3daae940fcb6fc5b8bbd9bb8fcc62854/r2/default/buckets/$BUCKET_NAME?prefix=characters%2F"
echo ""

echo "📋 Manual Steps (Now that you're authenticated):"
echo "================================================"
echo ""
echo "1. 📁 Move Fonts:"
echo "   - Go to fonts/ directory link above"
echo "   - Select all files"
echo "   - Copy to: book-mvp-simple-adventure/fonts/"
echo ""
echo "2. 📁 Move Overlays:"
echo "   - Go to overlays/ directory link above"
echo "   - Select all files"
echo "   - Copy to: book-mvp-simple-adventure/overlays/"
echo ""
echo "3. 📁 Move Characters:"
echo "   - Go to characters/ directory link above"
echo "   - Select all files"
echo "   - Copy to: book-mvp-simple-adventure/order-generated-assets/characters/"
echo ""

echo "🔗 New Asset URLs (After Reorganization):"
echo "=========================================="
echo ""
echo "• Font: https://little-hero-assets.r2.cloudflarestorage.com/book-mvp-simple-adventure/fonts/custom-font.ttf"
echo "• Text Box: https://little-hero-assets.r2.cloudflarestorage.com/book-mvp-simple-adventure/overlays/text-boxes/standard-box.png"
echo "• Backgrounds: https://little-hero-assets.r2.cloudflarestorage.com/book-mvp-simple-adventure/backgrounds/page1_background.png"
echo "• Characters: https://little-hero-assets.r2.cloudflarestorage.com/book-mvp-simple-adventure/order-generated-assets/characters/6ec1cd52dce77992/characters_6ec1cd52dce77992_pose01.png"
echo ""

echo "✅ After reorganization, the workflow will be updated with these new URLs!"
echo ""
echo "Press Enter when you've completed the reorganization..."
read -p "Press Enter to continue..."
