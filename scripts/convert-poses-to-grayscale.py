#!/usr/bin/env python3

"""
Convert pose reference images to grayscale
This prevents AI from copying clothing colors from pose references
"""

from PIL import Image
import os

# Configuration
POSE_NUMBERS = [1, 2, 3, 4, 5]
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_DIR = os.path.join(SCRIPT_DIR, '../assets/poses')
OUTPUT_DIR = os.path.join(SCRIPT_DIR, '../assets/poses/grayscale')

def convert_to_grayscale(input_path, output_path):
    """Convert a single image to grayscale"""
    try:
        # Open the image
        img = Image.open(input_path)
        
        # Convert to grayscale (keep alpha channel if present)
        if img.mode == 'RGBA':
            # Separate RGB and alpha
            rgb = img.convert('RGB')
            gray = rgb.convert('L')
            # Merge back with alpha
            img_gray = Image.merge('LA', (gray, img.split()[3]))
            # Convert back to RGBA for PNG
            img_gray = img_gray.convert('RGBA')
        else:
            img_gray = img.convert('L').convert('RGBA')
        
        # Save as PNG
        img_gray.save(output_path, 'PNG')
        print(f"✓ Converted: {os.path.basename(output_path)}")
        return True
    except Exception as e:
        print(f"✗ Failed to convert {os.path.basename(input_path)}: {e}")
        return False

def main():
    # Create output directory
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    print("Converting pose reference images to grayscale...\n")
    
    converted = 0
    for pose_num in POSE_NUMBERS:
        padded_num = str(pose_num).zfill(2)
        input_path = os.path.join(INPUT_DIR, f"pose{padded_num}.png")
        output_path = os.path.join(OUTPUT_DIR, f"pose{padded_num}.png")
        
        if os.path.exists(input_path):
            if convert_to_grayscale(input_path, output_path):
                converted += 1
        else:
            print(f"⚠ Skipped: pose{padded_num}.png (file not found)")
    
    print(f"\n✓ Done! Converted {converted} images to grayscale")
    print(f"   Saved to: {OUTPUT_DIR}")
    print("\nNext steps:")
    print("1. Upload these grayscale images to R2 storage at:")
    print("   little-hero-assets/book-mvp-simple-adventure/characters/poses/")
    print("2. In n8n workflow, delete 'Convert Poses to Grayscale' node")
    print("3. Connect 'Load Pose Reference' directly to 'Prepare Gemini Requests'")

if __name__ == "__main__":
    main()

