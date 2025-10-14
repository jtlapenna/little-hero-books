#!/bin/bash

# R2 Bucket Reorganization Script using Cloudflare R2 Dashboard
# Since wrangler doesn't have copy/list commands for R2 objects, this provides manual steps

echo "🔄 R2 Bucket Reorganization Guide"
echo "================================="
echo ""

# Set your bucket name
BUCKET_NAME="little-hero-assets"

echo "📋 Reorganization Plan:"
echo "1. Move fonts/ → book-mvp-simple-adventure/fonts/"
echo "2. Move overlays/ → book-mvp-simple-adventure/overlays/"
echo "3. Move characters/ → book-mvp-simple-adventure/order-generated-assets/characters/"
echo ""

echo "⚠️  Note: Wrangler CLI doesn't have copy/list commands for R2 objects."
echo "   Please use the R2 Dashboard for this reorganization."
echo ""

echo "🌐 R2 Dashboard Links:"
echo "======================"
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

echo "📋 Manual Steps:"
echo "==============="
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
