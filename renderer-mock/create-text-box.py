#!/usr/bin/env python3
"""
Create a rounded rectangle PNG for text background boxes.
This will be used as an overlay instead of trying to draw with pdf-lib.
"""

from PIL import Image, ImageDraw
import math

def create_rounded_rectangle(width, height, corner_radius, color, opacity=255):
    """Create a rounded rectangle image with the specified dimensions and styling."""
    
    # Create image with transparency
    img = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Convert hex color to RGB
    if color.startswith('#'):
        color = color[1:]
    r = int(color[0:2], 16)
    g = int(color[2:4], 16)
    b = int(color[4:6], 16)
    
    # Create rounded rectangle
    # We'll draw it as a filled shape
    draw.rounded_rectangle(
        [(0, 0), (width-1, height-1)],
        radius=corner_radius,
        fill=(r, g, b, opacity)
    )
    
    return img

def main():
    # Create different sizes of text boxes
    # Standard size for most pages
    standard_box = create_rounded_rectangle(
        width=607,  # matches the width from logs
        height=90,  # matches the height from logs
        corner_radius=50,
        color='ede9c1',  # cream color
        opacity=128  # 50% opacity (128/255)
    )
    standard_box.save('assets/overlays/text-boxes/standard-box.png')
    print("✅ Created standard-box.png (607x90, 50px radius)")
    
    # Smaller box for dedication pages
    small_box = create_rounded_rectangle(
        width=400,
        height=70,
        corner_radius=50,
        color='ede9c1',
        opacity=128
    )
    small_box.save('assets/overlays/text-boxes/small-box.png')
    print("✅ Created small-box.png (400x70, 50px radius)")
    
    # Large box for longer text
    large_box = create_rounded_rectangle(
        width=700,
        height=120,
        corner_radius=50,
        color='ede9c1',
        opacity=128
    )
    large_box.save('assets/overlays/text-boxes/large-box.png')
    print("✅ Created large-box.png (700x120, 50px radius)")

if __name__ == '__main__':
    main()
