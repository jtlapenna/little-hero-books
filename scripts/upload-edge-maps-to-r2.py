#!/usr/bin/env python3

"""
Upload edge map images to R2 storage
This replaces pose references with pure structural outlines
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
    edges_dir = os.path.join(script_dir, '../assets/poses/edges')
    
    # R2 configuration
    bucket_name = 'little-hero-assets'
    
    print("Uploading edge map images to R2...\n")
    
    # Upload edge map pose images
    pose_numbers = [1, 2, 3, 4, 5]
    uploaded_count = 0
    
    for pose_num in pose_numbers:
        padded_num = str(pose_num).zfill(2)
        edge_file = os.path.join(edges_dir, f"pose{padded_num}.png")
        
        if os.path.exists(edge_file):
            success = upload_to_r2(
                edge_file,
                bucket_name,
                f'book-mvp-simple-adventure/characters/poses/pose{padded_num}.png'
            )
            if success:
                uploaded_count += 1
        else:
            print(f"⚠ Edge file not found: {edge_file}")
    
    print(f"\n✓ Upload complete!")
    print(f"   Edge maps: {uploaded_count} files")
    print("\nNext steps:")
    print("1. Test workflow with edge maps")
    print("2. Verify character consistency")
    print("3. If still inconsistent, try single-pose processing")

if __name__ == "__main__":
    main()



