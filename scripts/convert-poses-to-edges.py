#!/usr/bin/env python3

"""
Convert pose reference images to edge maps
This removes ALL visual information except pose structure
"""

from PIL import Image, ImageFilter
import os
import numpy as np

# Configuration
POSE_NUMBERS = [1, 2, 3, 4, 5]
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_DIR = os.path.join(SCRIPT_DIR, '../assets/poses/grayscale')
OUTPUT_DIR = os.path.join(SCRIPT_DIR, '../assets/poses/edges')

def convert_to_edge_map(input_path, output_path):
    """Convert grayscale image to pure edge map"""
    try:
        # Open the grayscale image
        img = Image.open(input_path)
        
        # Convert to RGB for edge detection
        if img.mode != 'RGB':
            img = img.convert('RGB')
        
        # Apply edge detection filter
        edges = img.filter(ImageFilter.FIND_EDGES)
        
        # Convert to pure black and white (no grays)
        edges_array = np.array(edges)
        
        # Threshold to pure black/white
        threshold = 50  # Adjust this value if needed
        edges_array[edges_array < threshold] = 0    # Black
        edges_array[edges_array >= threshold] = 255 # White
        
        # Convert back to PIL Image
        edges_img = Image.fromarray(edges_array.astype('uint8'))
        
        # Convert to RGBA with transparent background
        edges_rgba = Image.new('RGBA', edges_img.size, (255, 255, 255, 0))  # Transparent background
        
        # Copy only the black edges (pose outline)
        edges_array_rgba = np.array(edges_rgba)
        edges_array_gray = np.array(edges_img.convert('L'))
        
        # Where edges are black (0), make them black in RGBA
        # Where edges are white (255), keep transparent
        mask = edges_array_gray == 0
        edges_array_rgba[mask] = [0, 0, 0, 255]  # Black edges
        
        final_img = Image.fromarray(edges_array_rgba)
        
        # Save as PNG
        final_img.save(output_path, 'PNG')
        print(f"✓ Converted to edge map: {os.path.basename(output_path)}")
        return True
    except Exception as e:
        print(f"✗ Failed to convert {os.path.basename(input_path)}: {e}")
        return False

def main():
    # Create output directory
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    print("Converting grayscale pose images to edge maps...\n")
    
    converted = 0
    for pose_num in POSE_NUMBERS:
        padded_num = str(pose_num).zfill(2)
        input_path = os.path.join(INPUT_DIR, f"pose{padded_num}.png")
        output_path = os.path.join(OUTPUT_DIR, f"pose{padded_num}.png")
        
        if os.path.exists(input_path):
            if convert_to_edge_map(input_path, output_path):
                converted += 1
        else:
            print(f"⚠ Skipped: pose{padded_num}.png (file not found)")
    
    print(f"\n✓ Done! Converted {converted} images to edge maps")
    print(f"   Saved to: {OUTPUT_DIR}")
    print("\nNext steps:")
    print("1. Upload these edge map images to R2 storage")
    print("2. Update workflow prompt to reference 'edge map' instead of 'grayscale'")
    print("3. Test workflow - AI should only see pose structure")

if __name__ == "__main__":
    main()

