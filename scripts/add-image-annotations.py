#!/usr/bin/env python3

"""
Add visual annotations to character and pose images
This makes it crystal clear to Gemini which image to copy from
"""

from PIL import Image, ImageDraw, ImageFont
import os

def add_annotations_to_character(input_path, output_path):
    """Add clear annotations to custom character image"""
    try:
        # Open the image
        img = Image.open(input_path)
        
        # Convert to RGBA if needed
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
        
        # Create a copy for drawing
        annotated = img.copy()
        draw = ImageDraw.Draw(annotated)
        
        # Try to load a font, fallback to default
        try:
            font_large = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 40)
            font_small = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 24)
        except:
            font_large = ImageFont.load_default()
            font_small = ImageFont.load_default()
        
        # Add green border (source indicator)
        border_width = 8
        for i in range(border_width):
            draw.rectangle([i, i, img.width-i-1, img.height-i-1], outline='green', width=1)
        
        # Add "COPY THIS CHARACTER" text at top
        text = "COPY THIS CHARACTER"
        bbox = draw.textbbox((0, 0), text, font=font_large)
        text_width = bbox[2] - bbox[0]
        text_x = (img.width - text_width) // 2
        text_y = 20
        
        # Add background rectangle for text
        padding = 10
        draw.rectangle([text_x - padding, text_y - padding, 
                       text_x + text_width + padding, text_y + 50 + padding], 
                      fill='green', outline='white', width=2)
        
        # Add text
        draw.text((text_x, text_y), text, fill='white', font=font_large)
        
        # Add "SOURCE OF TRUTH" at bottom
        source_text = "SOURCE OF TRUTH"
        bbox = draw.textbbox((0, 0), source_text, font=font_small)
        source_width = bbox[2] - bbox[0]
        source_x = (img.width - source_width) // 2
        source_y = img.height - 40
        
        draw.rectangle([source_x - 5, source_y - 5, 
                       source_x + source_width + 5, source_y + 30], 
                      fill='darkgreen', outline='white', width=1)
        draw.text((source_x, source_y), source_text, fill='white', font=font_small)
        
        # Save annotated image
        annotated.save(output_path, 'PNG')
        print(f"✓ Annotated character: {os.path.basename(output_path)}")
        return True
        
    except Exception as e:
        print(f"✗ Failed to annotate character: {e}")
        return False

def add_annotations_to_pose(input_path, output_path):
    """Add clear annotations to pose image"""
    try:
        # Open the image
        img = Image.open(input_path)
        
        # Convert to RGBA if needed
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
        
        # Create a copy for drawing
        annotated = img.copy()
        draw = ImageDraw.Draw(annotated)
        
        # Try to load a font
        try:
            font_large = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 40)
            font_small = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 24)
        except:
            font_large = ImageFont.load_default()
            font_small = ImageFont.load_default()
        
        # Add red border (pose only indicator)
        border_width = 8
        for i in range(border_width):
            draw.rectangle([i, i, img.width-i-1, img.height-i-1], outline='red', width=1)
        
        # Add "POSE ONLY" text at top
        text = "POSE ONLY - IGNORE CHARACTER"
        bbox = draw.textbbox((0, 0), text, font=font_large)
        text_width = bbox[2] - bbox[0]
        text_x = (img.width - text_width) // 2
        text_y = 20
        
        # Add background rectangle for text
        padding = 10
        draw.rectangle([text_x - padding, text_y - padding, 
                       text_x + text_width + padding, text_y + 50 + padding], 
                      fill='red', outline='white', width=2)
        
        # Add text
        draw.text((text_x, text_y), text, fill='white', font=font_large)
        
        # Add "STRUCTURE ONLY" at bottom
        structure_text = "STRUCTURE ONLY"
        bbox = draw.textbbox((0, 0), structure_text, font=font_small)
        structure_width = bbox[2] - bbox[0]
        structure_x = (img.width - structure_width) // 2
        structure_y = img.height - 40
        
        draw.rectangle([structure_x - 5, structure_y - 5, 
                       structure_x + structure_width + 5, structure_y + 30], 
                      fill='darkred', outline='white', width=1)
        draw.text((structure_x, structure_y), structure_text, fill='white', font=font_small)
        
        # Save annotated image
        annotated.save(output_path, 'PNG')
        print(f"✓ Annotated pose: {os.path.basename(output_path)}")
        return True
        
    except Exception as e:
        print(f"✗ Failed to annotate pose: {e}")
        return False

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Paths
    character_input = os.path.join(script_dir, '../assets/poses/base-character.png')
    character_output = os.path.join(script_dir, '../assets/poses/annotated-character.png')
    
    poses_input_dir = os.path.join(script_dir, '../assets/poses/grayscale')
    poses_output_dir = os.path.join(script_dir, '../assets/poses/annotated')
    
    # Create output directory
    os.makedirs(poses_output_dir, exist_ok=True)
    
    print("Adding visual annotations to images...\n")
    
    # Annotate custom character
    if os.path.exists(character_input):
        add_annotations_to_character(character_input, character_output)
    else:
        print(f"⚠ Character file not found: {character_input}")
    
    # Annotate pose images
    pose_numbers = [1, 2, 3, 4, 5]
    annotated_count = 0
    
    for pose_num in pose_numbers:
        padded_num = str(pose_num).zfill(2)
        input_path = os.path.join(poses_input_dir, f"pose{padded_num}.png")
        output_path = os.path.join(poses_output_dir, f"pose{padded_num}.png")
        
        if os.path.exists(input_path):
            if add_annotations_to_pose(input_path, output_path):
                annotated_count += 1
        else:
            print(f"⚠ Pose file not found: {input_path}")
    
    print(f"\n✓ Done! Annotated {annotated_count} pose images")
    print(f"   Character: {character_output}")
    print(f"   Poses: {poses_output_dir}")
    print("\nNext steps:")
    print("1. Upload annotated images to R2")
    print("2. Update workflow to use annotated images")
    print("3. Test with crystal-clear visual cues")

if __name__ == "__main__":
    main()
