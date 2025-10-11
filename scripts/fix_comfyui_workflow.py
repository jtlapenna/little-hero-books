#!/usr/bin/env python3
"""
Fix ComfyUI workflow JSON to be compatible with ComfyUI 0.3.62
"""
import json
import os

def fix_workflow_json(input_file, output_file):
    """Fix the ComfyUI workflow JSON to be compatible"""
    
    # Read the current workflow
    with open(input_file, 'r') as f:
        workflow = json.load(f)
    
    # Create a proper ComfyUI workflow structure
    fixed_workflow = {
        "version": "0.3.62",  # Add required version field
        "workflow_name": workflow.get("workflow_name", "Dreamtime_CharacterAssets_MVP"),
        "notes": workflow.get("notes", ""),
        "groups": workflow.get("groups", []),
        "nodes": workflow.get("nodes", []),
        "links": workflow.get("links", []),
        "pinData": workflow.get("pinData", {}),
        "settings": workflow.get("settings", {}),
        "staticData": workflow.get("staticData", {}),
        "tags": workflow.get("tags", []),
        "triggerCount": workflow.get("triggerCount", 0),
        "updatedAt": workflow.get("updatedAt", "2024-01-01T00:00:00.000Z"),
        "versionId": workflow.get("versionId", "1")
    }
    
    # Write the fixed workflow
    with open(output_file, 'w') as f:
        json.dump(fixed_workflow, f, indent=2)
    
    print(f"✅ Fixed workflow saved to: {output_file}")
    print("✅ Added required 'version' field")
    print("✅ Fixed workflow structure for ComfyUI 0.3.62")

if __name__ == "__main__":
    input_file = "docs/planning/comfy_ui_workflow_json_base_hair_overlay (1).json"
    output_file = "docs/planning/comfy_ui_workflow_json_fixed.json"
    
    if os.path.exists(input_file):
        fix_workflow_json(input_file, output_file)
        print(f"\n📋 Next steps:")
        print(f"   1. Import {output_file} into ComfyUI")
        print(f"   2. Test with pose01")
    else:
        print(f"❌ Input file not found: {input_file}")

