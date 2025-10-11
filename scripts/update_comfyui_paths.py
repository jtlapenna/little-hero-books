#!/usr/bin/env python3
"""
Update ComfyUI workflow JSON with correct asset paths
"""
import json
import os

# Define the path mappings
path_mappings = {
    "PATH_POSE_IMAGE": "/Users/jeff/Projects/little-hero-books/assets/poses/",
    "PATH_MASKS": "/Users/jeff/Projects/little-hero-books/assets/masks/",
    "PATH_MODELS/Checkpoints": "/Users/jeff/Projects/little-hero-books/assets/models/checkpoints/",
    "PATH_MODELS/VAEs": "/Users/jeff/Projects/little-hero-books/assets/models/vaes/",
    "PATH_MODELS/Loras": "/Users/jeff/Projects/little-hero-books/assets/models/loras/",
    "PATH_MODELS/ControlNet": "/Users/jeff/Projects/little-hero-books/assets/models/controlnet/",
    "PATH_OUTPUT": "/Users/jeff/Projects/little-hero-books/assets/output/"
}

def update_workflow_paths(json_file_path):
    """Update all PATH_* placeholders in the ComfyUI workflow JSON"""
    
    # Read the JSON file
    with open(json_file_path, 'r') as f:
        workflow = json.load(f)
    
    # Convert to string for replacement
    workflow_str = json.dumps(workflow, indent=2)
    
    # Replace all PATH_* placeholders
    for placeholder, real_path in path_mappings.items():
        workflow_str = workflow_str.replace(placeholder, real_path)
    
    # Parse back to JSON to validate
    updated_workflow = json.loads(workflow_str)
    
    # Write the updated file
    with open(json_file_path, 'w') as f:
        json.dump(updated_workflow, f, indent=2)
    
    print(f"✅ Updated {json_file_path} with correct paths")
    print("Updated paths:")
    for placeholder, real_path in path_mappings.items():
        print(f"  {placeholder} → {real_path}")

if __name__ == "__main__":
    workflow_file = "docs/planning/comfy_ui_workflow_json_base_hair_overlay (1).json"
    update_workflow_paths(workflow_file)

