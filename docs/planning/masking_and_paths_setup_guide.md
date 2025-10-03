# Masking and Paths Setup Guide (ComfyUI → n8n)

## What to mask and how many
- Create masks per pose. Each distinct pose needs its own aligned masks because head/torso/eyes shift with pose.
- Reuse is only safe if two poses share identical head/torso registration (rare). Otherwise: one mask set per pose.

## Mask specs (per pose)
- Canvas: 1024×1024 px, sRGB, 8‑bit PNG
- Alignment: all masks share the same registration box as the pose image
- Colors: white = editable/inpaint area, black = protected; no transparency
- Edge: 1–2 px feather/softness optional
- Files (example for pose01):
  - pose01_head_mask.png (optional reference for hair flow)
  - pose01_hair_mask.png (hair region only)
  - pose01_iris_mask.png (both irises only)
  - pose01_clothing_mask.png (garment/torso area only)

## Photoshop mask creation (quick)
1) Create 1024×1024 canvas; place pose image centered; lock position.
2) For each mask: new layer, draw selection, fill white on black background.
3) Keep edges clean; avoid spill into protected regions.
4) Toggle mask over the pose to verify alignment precisely.
5) Export each as PNG (no alpha).

## Directory layout (example absolute paths)
- PATH_POSE_IMAGE: /data/lhb/poses/
- PATH_MASKS: /data/lhb/masks/
- PATH_MODELS/Checkpoints: /data/lhb/models/checkpoints/
- PATH_MODELS/VAEs: /data/lhb/models/vaes/
- PATH_MODELS/Loras: /data/lhb/models/loras/
- PATH_OUTPUT: /data/lhb/output/

## Naming conventions
- Poses: pose_pose01.png
- Masks: pose01_head_mask.png, pose01_hair_mask.png, pose01_iris_mask.png, pose01_clothing_mask.png
- Outputs:
  - Base: child_base_pose01_[SKIN_TONE].png
  - Hair: hair_pose01_[HAIRSTYLE]_[HAIR_COLOR].png
  - Eyes: eyes_pose01_[EYE_COLOR].png
  - Clothes: clothes_pose01_[OUTFIT_ID].png

## ComfyUI prep
- Replace PATH_* placeholders in the workflow JSON with your absolute paths above.
- Ensure models exist at the specified locations (checkpoint, VAE, LoRA, embeddings).
- Confirm write access to PATH_OUTPUT subfolders: base, hair, eyes, clothes.

## First‑run checklist (pose01)
- Files present:
  - /data/lhb/poses/pose_pose01.png
  - /data/lhb/masks/pose01_head_mask.png
  - /data/lhb/masks/pose01_hair_mask.png
  - /data/lhb/masks/pose01_iris_mask.png
  - /data/lhb/masks/pose01_clothing_mask.png
- Paths replaced in JSON; ComfyUI loads without missing‑file errors.
- Run subflows: Base → Hair → Eyes → Clothes. Verify 4 PNGs in PATH_OUTPUT.

## Asset management boundary
- ComfyUI: generation only (writes PNGs to PATH_OUTPUT).
- n8n: file moves/renames, optional Photoshop/ImageMagick cleanup, optimization, upload to R2/S3, manifest generation, cleanup of temp files.

## Tips
- Keep a vector guide layer for the head/torso boxes and reuse it when drawing masks for new poses.
- Store mask PSDs for future edits; export PNGs for ComfyUI.

## AI‑assisted simplifications (optional but recommended)
- Landmark‑driven warping (fastest):
  - Detect keypoints for new pose (OpenPose for body; MediaPipe Face Mesh for pupils/eyes).
  - Thin‑plate‑spline (TPS) warp the pose01 masks (hair/iris/clothing) to new landmarks.
  - Quick manual cleanup in Photoshop after warping.
- Auto‑segmentation masks:
  - Hair/face: face parsing models (e.g., BiSeNet) to extract hair region; refine edges.
  - Eyes: MediaPipe Face Mesh for precise iris centers/radii → parametric circles.
  - Clothing/torso: human parsing (e.g., SCHP/CIHP) to get upper‑body regions; refine polygon.
- ComfyUI assist:
  - Use ControlNet (OpenPose) to generate each new pose consistently.
  - Post‑process the output with a segmentation node (SAM/parsings) to propose masks; finalize manually.
- Template “mask rig”:
  - Define a minimal keypoint rig (chin, temples, pupils, shoulders).
  - Generate masks procedurally from parametric shapes given those points.

## Recommended hybrid workflow (per new pose)
1) Generate/collect the new pose image (consistent canvas 1024×1024).
2) Detect landmarks (OpenPose + Face Mesh) and TPS‑warp the pose01 mask set to the new pose.
3) Run auto‑segmentation to propose hair/torso regions; pick best base per region.
4) Manually refine edges (1–2 min per mask) in Photoshop; export PNGs.
5) Run ComfyUI Base → Hair → Eyes → Clothes; review outputs; adjust masks only if needed.

## Automation handoff to n8n
- Orchestrate landmark detection, warping, and segmentation via n8n nodes (Python or CLI steps), then pause for manual QA.
- After QA, n8n renames, optimizes, and uploads final masks/overlays, and updates the manifest JSON for the renderer.
