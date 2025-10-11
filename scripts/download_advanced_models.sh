#!/bin/bash

# Download Advanced ComfyUI Models for Character Generation
# This script downloads ControlNet, LoRA, and embedding models

set -e

echo "🚀 Downloading advanced ComfyUI models for character generation..."

# Create directory structure
echo "📁 Creating directory structure..."
mkdir -p assets/models/{controlnet,loras,embeddings}

# Function to download file with progress
download_file() {
    local url=$1
    local output=$2
    local filename=$(basename "$output")
    
    echo "⬇️  Downloading $filename..."
    if command -v wget &> /dev/null; then
        wget --progress=bar:force -O "$output" "$url"
    elif command -v curl &> /dev/null; then
        curl -L --progress-bar -o "$output" "$url"
    else
        echo "❌ Error: Neither wget nor curl found. Please install one of them."
        exit 1
    fi
    echo "✅ Downloaded $filename"
}

# Download ControlNet models
echo "📦 Downloading ControlNet models..."

# OpenPose ControlNet (for pose control)
download_file \
    "https://huggingface.co/lllyasviel/ControlNet-v1-1/resolve/main/control_v11p_sd15_openpose.pth" \
    "assets/models/controlnet/openpose_fp16.safetensors"

# Canny Edge ControlNet (for edge control)
download_file \
    "https://huggingface.co/lllyasviel/ControlNet-v1-1/resolve/main/control_v11p_sd15_canny.pth" \
    "assets/models/controlnet/canny_fp16.safetensors"

# Download example LoRA models (you'll need to replace these with actual models)
echo "📦 Downloading example LoRA models..."

# Note: These are placeholder URLs - you'll need to find or create actual LoRA models
echo "⚠️  Note: LoRA models need to be created or downloaded separately"
echo "   - character_consistency.safetensors (for character consistency)"
echo "   - watercolor_style.safetensors (for art style)"
echo "   - See docs/planning/comfyui_advanced_setup_guide.md for details"

# Download example embeddings (you'll need to replace these with actual embeddings)
echo "📦 Downloading example embeddings..."

# Note: These are placeholder URLs - you'll need to find or create actual embeddings
echo "⚠️  Note: Embeddings need to be created or downloaded separately"
echo "   - watercolor_childrens_book.pt (for art style)"
echo "   - storybook_illustration.pt (for storybook style)"
echo "   - See docs/planning/comfyui_advanced_setup_guide.md for details"

echo ""
echo "🎉 ControlNet models downloaded successfully!"
echo ""
echo "📋 Next steps:"
echo "   1. Install custom nodes via ComfyUI Manager"
echo "   2. Create or download LoRA models for character consistency"
echo "   3. Create or download embeddings for art style"
echo "   4. Test the advanced workflow"
echo ""
echo "💡 For LoRA and embedding creation, see:"
echo "   docs/planning/comfyui_advanced_setup_guide.md"

