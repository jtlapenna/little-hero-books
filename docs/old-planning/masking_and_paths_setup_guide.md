# Masking and Paths Setup Guide (ComfyUI → n8n)

## Current Approach: Page-Specific Base Assets (Approach B)
- **Phase 1 (Manual Creation)**: Create base poses + masks for each book page manually
- **Phase 2 (Asset Generation)**: Use ComfyUI to generate all character variations for each pose
- **Phase 3 (Future Upgrade)**: Add AI automation for pose generation and mask creation

## What to mask and how many
- **Current**: 12-14 poses (one per book page) with masks for each pose
- **Manual Process**: Create each pose and its masks manually for full control
- **Asset Output**: ComfyUI generates character variations for all poses

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

## First‑run checklist (pose01 template)
- Files present:
  - /data/lhb/poses/pose_pose01.png
  - /data/lhb/masks/pose01_head_mask.png
  - /data/lhb/masks/pose01_hair_mask.png
  - /data/lhb/masks/pose01_iris_mask.png
  - /data/lhb/masks/pose01_clothing_mask.png
- Paths replaced in JSON; ComfyUI loads without missing‑file errors.
- Run subflows: Base → Hair → Eyes → Clothes. Verify 4 PNGs in PATH_OUTPUT.
- Test character consistency and quality before proceeding to AI generation.

## Asset management boundary
- ComfyUI: generation only (writes PNGs to PATH_OUTPUT).
- n8n: file moves/renames, optional Photoshop/ImageMagick cleanup, optimization, upload to R2/S3, manifest generation, cleanup of temp files.

## Tips
- Keep a vector guide layer for the head/torso boxes and reuse it when drawing masks for new poses.
- Store mask PSDs for future edits; export PNGs for ComfyUI.

## Current Status: Page-Specific Base Assets (Approach B)

### ✅ Completed (80%)
- n8n workflow structure (routing, ComfyUI API calls, status monitoring)
- ComfyUI workflow JSON (base, hair, eyes, clothing generation)
- Cloudflare R2 upload integration
- Error handling and retry logic
- Asset type routing (base, hair, eye, clothing)

### 🔄 Remaining Work (20%)

#### **Phase 1: Pose Creation (5%)**
- **Missing**: 12-14 base pose images for each book page
- **Effort**: 1-2 days of manual work
- **Tools**: Photoshop/Illustrator for pose creation

#### **Phase 2: Mask Creation (10%)**
- **Missing**: Masks for each pose (hair, iris, clothing)
- **Effort**: 2-3 days of manual work
- **Tools**: Photoshop for mask creation

#### **Phase 3: ComfyUI Setup (3%)**
- **Missing**: Replace PATH_* placeholders in JSON
- **Effort**: 1-2 hours
- **Tools**: Text editor to update paths

#### **Phase 4: Testing & Refinement (2%)**
- **Missing**: Test each pose with ComfyUI
- **Effort**: 1-2 days
- **Tools**: ComfyUI testing

### **Total Remaining Effort**: 1-2 weeks
- **Manual Work**: 4-5 days
- **Setup & Testing**: 2-3 days
- **Refinement**: 1-2 days

### **Next Steps for Approach B**:
1. Create pose01 (template pose)
2. Create masks for pose01
3. Test ComfyUI with pose01
4. Create remaining 11-13 poses
5. Create masks for all poses
6. Test full pipeline
7. Refine and optimize

## Future Upgrade: AI-Assisted Process (Approach A)

### What Approach A Does
**Intelligent Automation**: AI generates new poses and masks automatically, then ComfyUI creates character assets for each pose.

### How Approach A Functions
1. **Template Creation**: Create pose01 + masks manually as reference
2. **AI Pose Generation**: Use ControlNet + LoRA to generate new poses with character consistency
3. **AI Mask Generation**: Use SAM + BiSeNet to create fresh masks for each new pose
4. **Asset Generation**: ComfyUI generates character assets for all poses automatically

### Tools Required for Approach A
- **ControlNet + OpenPose**: For pose generation with character consistency
- **SAM + BiSeNet**: For intelligent mask segmentation
- **Face Mesh**: For precise eye/face landmark detection
- **Thin-plate-spline warping**: For mask adaptation (optional)
- **ComfyUI**: For character asset generation

### Node-by-Node Flow for Approach A
```
1. Webhook Trigger
   ↓
2. Pose Generation Router
   ↓
3. AI Pose Generation Node (ControlNet + LoRA)
   ↓
4. AI Mask Generation Node (SAM + BiSeNet)
   ↓
5. Quality Control Checkpoint (Manual Review)
   ↓
6. Batch Asset Generation Loop
   ↓
7. ComfyUI API Call (per pose)
   ↓
8. Status Monitoring & Retry Logic
   ↓
9. Asset Download & Upload to R2
   ↓
10. Success/Error Response
```

### Development Requirements for Approach A
- **New AI Integrations**: 2 major tools (pose generation + mask generation)
- **Workflow Modifications**: 8-10 significant changes to existing n8n workflow
- **Development Time**: 3-4 weeks
- **Complexity**: High (AI reliability, error handling)
- **Testing**: Extensive (AI consistency, fallback scenarios)

### When to Upgrade to Approach A
- After Approach B is working and proven in market
- When you need to add many more poses quickly
- When manual pose creation becomes a bottleneck
- When you have 3-4 weeks for development and testing

## Automation handoff to n8n
- Orchestrate pose generation, mask creation, and asset re-rendering via n8n nodes (Python or CLI steps), then pause for manual QA.
- After QA, n8n renames, optimizes, and uploads final assets, and updates the manifest JSON for the renderer.
