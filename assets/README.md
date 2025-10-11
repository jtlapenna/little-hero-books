# Little Hero Books - Asset Organization

## Directory Structure
```
assets/
├── poses/                    # Base character poses (1024×1024)
│   └── pose_pose01.png
├── masks/                    # Character masks (1024×1024)
│   ├── pose01_head_mask.png
│   ├── pose01_iris_mask.png
│   ├── pose01_clothing_dress.png
│   ├── pose01_clothing_shirt.png
│   ├── pose01_clothing_shorts.png
│   └── pose01_clothing_shoes.png
├── output/                   # Generated assets from ComfyUI
│   ├── base/                 # Base character images
│   ├── hair/                 # Hair overlays
│   ├── eyes/                 # Eye overlays
│   └── clothes/              # Clothing overlays
└── models/                   # ComfyUI models (symlinked from ComfyUI)
    ├── checkpoints/          # Main AI models
    ├── vaes/                 # VAE models
    ├── loras/                # LoRA models
    └── embeddings/           # Textual inversion embeddings
```

## File Naming Conventions
- **Poses**: `pose_pose01.png`, `pose_pose02.png`, etc.
- **Masks**: `pose01_head_mask.png`, `pose01_iris_mask.png`, etc.
- **Output**: `child_base_pose01_[SKIN_TONE].png`, `hair_pose01_[STYLE]_[COLOR].png`, etc.

## Usage
1. Place your pose images in `poses/`
2. Place your masks in `masks/`
3. ComfyUI will generate assets in `output/`
4. Models are symlinked from your ComfyUI installation

