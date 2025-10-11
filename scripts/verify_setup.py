#!/usr/bin/env python3
"""
Verify ComfyUI setup is complete
"""
import os
import json

def check_file_exists(filepath, description):
    """Check if a file exists and report status"""
    if os.path.exists(filepath):
        size = os.path.getsize(filepath)
        print(f"✅ {description}: {filepath} ({size:,} bytes)")
        return True
    else:
        print(f"❌ {description}: {filepath} - MISSING")
        return False

def verify_comfyui_setup():
    """Verify all required files and directories exist"""
    print("🔍 Verifying ComfyUI setup for Little Hero Books...\n")
    
    all_good = True
    
    # Check pose files
    print("📸 Pose Files:")
    all_good &= check_file_exists("assets/poses/pose_pose01.png", "Base pose image")
    
    # Check mask files
    print("\n🎭 Mask Files:")
    masks = [
        ("assets/masks/pose01_head_mask.png", "Head mask"),
        ("assets/masks/pose01_iris_mask.png", "Iris mask"),
        ("assets/masks/pose01_clothing_dress.png", "Dress mask"),
        ("assets/masks/pose01_clothing_shirt.png", "Shirt mask"),
        ("assets/masks/pose01_clothing_shorts.png", "Shorts mask"),
        ("assets/masks/pose01_clothing_shoes.png", "Shoes mask")
    ]
    
    for filepath, description in masks:
        all_good &= check_file_exists(filepath, description)
    
    # Check model files
    print("\n🤖 Model Files:")
    models = [
        ("assets/models/checkpoints/sd_xl_base_1.0.safetensors", "SDXL Base Model"),
        ("assets/models/vaes/sdxl_vae.safetensors", "SDXL VAE"),
        ("assets/models/controlnet/openpose_fp16.safetensors", "OpenPose ControlNet")
    ]
    
    for filepath, description in models:
        all_good &= check_file_exists(filepath, description)
    
    # Check workflow file
    print("\n⚙️  Workflow File:")
    all_good &= check_file_exists("docs/planning/comfy_ui_workflow_json_base_hair_overlay (1).json", "ComfyUI Workflow JSON")
    
    # Check output directories
    print("\n📁 Output Directories:")
    output_dirs = [
        "assets/output/base",
        "assets/output/hair", 
        "assets/output/eyes",
        "assets/output/clothes"
    ]
    
    for dirpath in output_dirs:
        if os.path.exists(dirpath):
            print(f"✅ Output directory: {dirpath}")
        else:
            print(f"❌ Output directory: {dirpath} - MISSING")
            all_good = False
    
    print("\n" + "="*50)
    if all_good:
        print("🎉 SETUP COMPLETE! Ready for ComfyUI import and testing.")
        print("\n📋 Next steps:")
        print("   1. Install ComfyUI (see docs/planning/comfyui_setup_guide.md)")
        print("   2. Import workflow JSON into ComfyUI")
        print("   3. Test with pose01")
    else:
        print("⚠️  SETUP INCOMPLETE! Please fix the missing items above.")
    
    return all_good

if __name__ == "__main__":
    verify_comfyui_setup()

