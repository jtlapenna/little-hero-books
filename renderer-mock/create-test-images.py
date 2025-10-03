#!/usr/bin/env python3
"""
Create placeholder background images for testing the mock renderer.
These are simple colored rectangles that match the required dimensions.
"""

from PIL import Image, ImageDraw, ImageFont
import os

# Create assets/backgrounds directory
os.makedirs('assets/backgrounds', exist_ok=True)

# Image specifications
WIDTH = 3375   # 11.25 inches at 300 DPI (11" + 0.125" bleed each side)
HEIGHT = 2625  # 8.75 inches at 300 DPI (8.25" + 0.25" bleed top/bottom)

# Page descriptions for The Adventure Compass story
pages = [
    ("page01_bedroom", "Bedroom Scene", (135, 206, 235)),  # Sky blue
    ("page02_bedroom_night", "Bedroom Night", (25, 25, 112)),  # Midnight blue
    ("page03_forest", "Forest Path", (34, 139, 34)),  # Forest green
    ("page04_mountain", "Mountain View", (139, 137, 137)),  # Gray
    ("page05_sky", "Sky Scene", (135, 206, 235)),  # Sky blue
    ("page06_sea", "Ocean Scene", (0, 191, 255)),  # Deep sky blue
    ("page07_picnic", "Picnic Area", (255, 228, 196)),  # Bisque
    ("page08_cave", "Cave Entrance", (105, 105, 105)),  # Dim gray
    ("page09_garden", "Garden Scene", (144, 238, 144)),  # Light green
    ("page10_town", "Town Square", (255, 218, 185)),  # Peach puff
    ("page11_bedroom_return", "Bedroom Return", (135, 206, 235)),  # Sky blue
    ("page12_compass_glow", "Compass Glow", (255, 215, 0)),  # Gold
    ("page13_keepsake_frame", "Keepsake Frame", (255, 228, 196)),  # Bisque
    ("page14_dedication_frame", "Dedication Frame", (255, 228, 196))  # Bisque
]

print("🎨 Creating placeholder background images...")

for filename, description, color in pages:
    # Create image with solid color background
    img = Image.new('RGB', (WIDTH, HEIGHT), color)
    draw = ImageDraw.Draw(img)
    
    # Add page number and description
    try:
        # Try to use a larger font
        font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 120)
    except:
        try:
            # Fallback to default font
            font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 120)
        except:
            # Use default font
            font = ImageFont.load_default()
    
    # Draw page info
    text = f"{filename}\n{description}\n11.25\" × 8.75\" @ 300 DPI\n(11\" × 8.25\" trim)"
    
    # Calculate text position (centered)
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    
    x = (WIDTH - text_width) // 2
    y = (HEIGHT - text_height) // 2
    
    # Draw text with outline for visibility
    draw.text((x-2, y-2), text, fill=(0, 0, 0), font=font)  # Black outline
    draw.text((x+2, y+2), text, fill=(0, 0, 0), font=font)  # Black outline
    draw.text((x, y), text, fill=(255, 255, 255), font=font)  # White text
    
    # Save image
    filepath = f"assets/backgrounds/{filename}.png"
    img.save(filepath, "PNG", dpi=(300, 300))
    print(f"  ✅ Created {filepath}")

print(f"🎉 Created {len(pages)} placeholder background images!")
print("📁 Images saved to: assets/backgrounds/")
print("🔍 Dimensions: 3375×2625 pixels (11.25×8.75 inches @ 300 DPI)")
print("📏 Trim size: 11×8.25 inches (with 0.125\" bleed each side, 0.25\" top/bottom)")
print("🎨 Colors: Each page has a unique color representing the scene")
print("")
print("Next steps:")
print("1. Run: node server.js")
print("2. Test: curl http://localhost:8787/health")
print("3. Test render: curl -X POST http://localhost:8787/render -H 'Content-Type: application/json' -d '{\"orderId\":\"TEST-001\",\"pages\":[{\"background\":\"http://localhost:8787/assets/backgrounds/page01_bedroom.png\"}],\"cover\":{\"front_background\":\"http://localhost:8787/assets/backgrounds/page01_bedroom.png\",\"title\":\"Test Book\"}}'")
