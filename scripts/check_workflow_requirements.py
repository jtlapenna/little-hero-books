#!/usr/bin/env python3
"""
Check what's needed for the ComfyUI character generation workflow
"""
import os
import json

def check_workflow_requirements():
    """Check what's installed and what's missing for the workflow"""
    
    print("🔍 Checking ComfyUI workflow requirements...\n")
    
    # Check what we have
    print("✅ What we have:")
    
    # Check models
    models = {
        "SDXL Base": "assets/models/checkpoints/sd_xl_base_1.0.safetensors",
        "SDXL VAE": "assets/models/vaes/sdxl_vae.safetensors", 
        "OpenPose ControlNet": "assets/models/controlnet/openpose_fp16.safetensors"
    }
    
    for name, path in models.items():
        if os.path.exists(path):
            size = os.path.getsize(path)
            print(f"   ✅ {name}: {size:,} bytes")
        else:
            print(f"   ❌ {name}: MISSING")
    
    # Check assets
    assets = {
        "Pose Image": "assets/poses/pose_pose01.png",
        "Head Mask": "assets/masks/pose01_head_mask.png",
        "Iris Mask": "assets/masks/pose01_iris_mask.png",
        "Dress Mask": "assets/masks/pose01_clothing_dress.png",
        "Shirt Mask": "assets/masks/pose01_clothing_shirt.png",
        "Shorts Mask": "assets/masks/pose01_clothing_shorts.png",
        "Shoes Mask": "assets/masks/pose01_clothing_shoes.png"
    }
    
    print("\n📸 Assets:")
    for name, path in assets.items():
        if os.path.exists(path):
            size = os.path.getsize(path)
            print(f"   ✅ {name}: {size:,} bytes")
        else:
            print(f"   ❌ {name}: MISSING")
    
    # Check what we still need
    print("\n❌ What we still need:")
    
    # Custom nodes (these need to be installed in ComfyUI)
    custom_nodes = [
        "ComfyUI-ControlNet-Aux (for pose control)",
        "ComfyUI-LoRA (for character consistency)", 
        "ComfyUI-Textual-Inversion (for style embeddings)",
        "ComfyUI-Inpaint (for mask-based generation)",
        "ComfyUI-Image-Composite (for image overlays)"
    ]
    
    print("🔧 Custom Nodes (install via ComfyUI Manager):")
    for node in custom_nodes:
        print(f"   - {node}")
    
    # Optional but recommended
    print("\n💡 Optional but recommended:")
    print("   - Character consistency LoRA (custom trained)")
    print("   - Art style LoRA (custom trained)")
    print("   - Textual inversion embeddings (custom trained)")
    
    print("\n📋 Next steps:")
    print("1. Install custom nodes via ComfyUI Manager")
    print("2. Test with simplified workflow first")
    print("3. Test with advanced workflow after nodes are installed")
    print("4. Create custom LoRAs for better consistency (optional)")

if __name__ == "__main__":
    check_workflow_requirements()

