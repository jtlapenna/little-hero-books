#!/bin/bash

# ComfyUI Models Setup Script for Little Hero Books
# This script downloads the required models for the ComfyUI workflow

set -e

echo "🚀 Setting up ComfyUI models for Little Hero Books..."

# Create directory structure
echo "📁 Creating directory structure..."
mkdir -p assets/models/{checkpoints,vaes,loras,controlnet,embeddings}

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

# Download SDXL Base Model (6.6GB)
echo "📦 Downloading SDXL Base Model..."
download_file \
    "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors" \
    "assets/models/checkpoints/sd_xl_base_1.0.safetensors"

# Download SDXL VAE (335MB)
echo "📦 Downloading SDXL VAE..."
download_file \
    "https://huggingface.co/stabilityai/sdxl-vae/resolve/main/sdxl_vae.safetensors" \
    "assets/models/vaes/sdxl_vae.safetensors"

# Download OpenPose ControlNet (1.4GB)
echo "📦 Downloading OpenPose ControlNet..."
download_file \
    "https://huggingface.co/lllyasviel/ControlNet-v1-1/resolve/main/control_v11p_sd15_openpose.pth" \
    "assets/models/controlnet/openpose_fp16.safetensors"

echo ""
echo "🎉 Setup complete! Models downloaded to:"
echo "   📁 Checkpoints: assets/models/checkpoints/"
echo "   📁 VAEs: assets/models/vaes/"
echo "   📁 ControlNet: assets/models/controlnet/"
echo ""
echo "📋 Next steps:"
echo "   1. Install ComfyUI (see docs/planning/comfyui_setup_guide.md)"
echo "   2. Copy your pose and mask files to assets/poses/ and assets/masks/"
echo "   3. Import the workflow JSON into ComfyUI"
echo "   4. Test with pose01"
echo ""
echo "💡 Note: You may want to download additional LoRA models for better character consistency"

