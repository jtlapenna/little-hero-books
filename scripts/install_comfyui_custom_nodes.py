#!/usr/bin/env python3
"""
Install required custom nodes for ComfyUI character generation
"""
import subprocess
import sys
import os

def install_custom_nodes():
    """Install the required custom nodes for character generation"""
    
    print("🔧 Installing ComfyUI custom nodes for character generation...")
    
    # Define the custom nodes we need
    custom_nodes = [
        "ComfyUI-Manager",  # For managing other nodes
        "ComfyUI-ControlNet-Aux",  # For ControlNet support
        "ComfyUI-LoRA",  # For LoRA support
        "ComfyUI-Textual-Inversion",  # For embeddings
        "ComfyUI-Inpaint",  # For mask-based generation
        "ComfyUI-Image-Composite",  # For image compositing
    ]
    
    print("📦 Required custom nodes:")
    for node in custom_nodes:
        print(f"   - {node}")
    
    print("\n📋 Installation instructions:")
    print("1. Open ComfyUI desktop app")
    print("2. Look for 'Manager' or 'Custom Nodes' button")
    print("3. Search for and install each node listed above")
    print("4. Restart ComfyUI after installation")
    
    print("\n🔍 Alternative: Manual installation via ComfyUI Manager")
    print("1. Open ComfyUI")
    print("2. Click 'Manager' button (usually in top menu)")
    print("3. Go to 'Install Custom Nodes' tab")
    print("4. Search for each node and click 'Install'")
    
    print("\n📚 Node descriptions:")
    print("   - ComfyUI-ControlNet-Aux: Pose control and image conditioning")
    print("   - ComfyUI-LoRA: Character consistency and style control")
    print("   - ComfyUI-Textual-Inversion: Custom style embeddings")
    print("   - ComfyUI-Inpaint: Mask-based generation")
    print("   - ComfyUI-Image-Composite: Image overlay and compositing")

if __name__ == "__main__":
    install_custom_nodes()

