#!/usr/bin/env python3

"""
Upload annotated images to R2 storage
This replaces the original images with annotated versions
"""

import boto3
import os
from botocore.exceptions import ClientError

def upload_to_r2(file_path, bucket_name, object_key):
    """Upload a file to R2 storage"""
    try:
        # R2 credentials (you'll need to set these)
        r2_client = boto3.client(
            's3',
            endpoint_url='https://your-account-id.r2.cloudflarestorage.com',
            aws_access_key_id='your-access-key',
            aws_secret_access_key='your-secret-key',
            region_name='auto'
        )
        
        # Upload file
        r2_client.upload_file(file_path, bucket_name, object_key)
        print(f"✓ Uploaded: {object_key}")
        return True
        
    except ClientError as e:
        print(f"✗ Failed to upload {object_key}: {e}")
        return False
    except Exception as e:
        print(f"✗ Error uploading {object_key}: {e}")
        return False

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Paths
    character_file = os.path.join(script_dir, '../assets/poses/annotated-character.png')
    poses_dir = os.path.join(script_dir, '../assets/poses/annotated')
    
    # R2 configuration
    bucket_name = 'little-hero-assets'
    
    print("Uploading annotated images to R2...\n")
    
    # Upload annotated character (replace base-character.png)
    if os.path.exists(character_file):
        success = upload_to_r2(
            character_file, 
            bucket_name, 
            'book-mvp-simple-adventure/characters/base-character.png'
        )
        if success:
            print("✓ Character annotation uploaded")
    else:
        print(f"⚠ Character file not found: {character_file}")
    
    # Upload annotated pose images
    pose_numbers = [1, 2, 3, 4, 5]
    uploaded_count = 0
    
    for pose_num in pose_numbers:
        padded_num = str(pose_num).zfill(2)
        pose_file = os.path.join(poses_dir, f"pose{padded_num}.png")
        
        if os.path.exists(pose_file):
            success = upload_to_r2(
                pose_file,
                bucket_name,
                f'book-mvp-simple-adventure/characters/poses/pose{padded_num}.png'
            )
            if success:
                uploaded_count += 1
        else:
            print(f"⚠ Pose file not found: {pose_file}")
    
    print(f"\n✓ Upload complete!")
    print(f"   Character: 1 file")
    print(f"   Poses: {uploaded_count} files")
    print("\nNext steps:")
    print("1. Update workflow to use crystal-clear prompt")
    print("2. Test with annotated images")
    print("3. Verify character consistency")

if __name__ == "__main__":
    main()



