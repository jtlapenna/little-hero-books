# ComfyUI Setup Guide for Little Hero Books

## Prerequisites
- ComfyUI installed and running
- Python 3.8+ with required dependencies
- GPU recommended (8GB+ VRAM for SDXL)

## 1. Install ComfyUI (if not already installed)

### Option A: Direct Installation
```bash
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI
pip install -r requirements.txt
```

### Option B: Using ComfyUI Manager (Recommended)
1. Install ComfyUI Manager: https://github.com/ltdrdata/ComfyUI-Manager
2. Use the manager to install ComfyUI and custom nodes

## 2. Required Models

### Checkpoint Models (Main AI Models)
**Location**: `assets/models/checkpoints/`

**Required**:
- **SDXL Base**: `sd_xl_base_1.0.safetensors` (6.6GB)
  - Download: https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0
- **Storybook Style**: Custom fine-tuned model (if available)
  - Alternative: Use SDXL with storybook prompts

### VAE Models (Image Encoding/Decoding)
**Location**: `assets/models/vaes/`

**Required**:
- **SDXL VAE**: `sdxl_vae.safetensors` (335MB)
  - Download: https://huggingface.co/stabilityai/sdxl-vae

### LoRA Models (Character Consistency)
**Location**: `assets/models/loras/`

**Recommended**:
- **Character Consistency LoRA**: Custom trained for your character style
- **Children's Book Style LoRA**: For storybook aesthetic
- **Hair Style LoRA**: For consistent hair generation

### ControlNet Models (Pose Control)
**Location**: `assets/models/controlnet/`

**Required**:
- **OpenPose**: `openpose_fp16.safetensors` (1.4GB)
  - Download: https://huggingface.co/lllyasviel/ControlNet-v1-1

### Embeddings (Textual Inversion)
**Location**: `assets/models/embeddings/`

**Recommended**:
- **Storybook Style**: Custom trained for your art style
- **Character Style**: For consistent character appearance

## 3. Model Download Commands

### Quick Setup Script
```bash
# Create the models directory structure
mkdir -p assets/models/{checkpoints,vaes,loras,controlnet,embeddings}

# Download SDXL Base (6.6GB)
wget -O assets/models/checkpoints/sd_xl_base_1.0.safetensors \
  "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors"

# Download SDXL VAE (335MB)
wget -O assets/models/vaes/sdxl_vae.safetensors \
  "https://huggingface.co/stabilityai/sdxl-vae/resolve/main/sdxl_vae.safetensors"

# Download OpenPose ControlNet (1.4GB)
wget -O assets/models/controlnet/openpose_fp16.safetensors \
  "https://huggingface.co/lllyasviel/ControlNet-v1-1/resolve/main/control_v11p_sd15_openpose.pth"
```

## 4. Custom Nodes Required

Install these custom nodes via ComfyUI Manager:

### Essential Nodes
- **ControlNet**: For pose control
- **OpenPose**: For pose detection
- **Inpaint**: For mask-based generation
- **Load Image**: For loading poses and masks

### Optional but Recommended
- **LoRA Loader**: For character consistency
- **VAE Loader**: For custom VAE models
- **Batch Processing**: For multiple generations

## 5. File Organization

Your project structure should look like:
```
little-hero-books/
├── assets/
│   ├── poses/                    # Your pose images
│   ├── masks/                    # Your mask images
│   ├── output/                   # Generated assets
│   └── models/                   # ComfyUI models
│       ├── checkpoints/
│       ├── vaes/
│       ├── loras/
│       ├── controlnet/
│       └── embeddings/
└── docs/planning/
    └── comfy_ui_workflow_json_base_hair_overlay (1).json
```

## 6. Import Workflow

1. **Start ComfyUI**:
   ```bash
   cd ComfyUI
   python main.py
   ```

2. **Open ComfyUI** in browser: `http://localhost:8188`

3. **Import Workflow**:
   - Click "Load" button
   - Select: `docs/planning/comfy_ui_workflow_json_base_hair_overlay (1).json`
   - Click "Load"

4. **Verify Paths**: Check that all file paths point to your assets directory

## 7. Test with pose01

1. **Place your files**:
   - Copy `pose01.png` to `assets/poses/pose_pose01.png`
   - Copy all masks to `assets/masks/`

2. **Run the workflow**:
   - Click "Queue Prompt"
   - Monitor the generation process
   - Check output in `assets/output/`

## 8. Troubleshooting

### Common Issues
- **Missing models**: Ensure all required models are downloaded
- **Path errors**: Verify file paths in the workflow JSON
- **Memory errors**: Reduce batch size or use CPU fallback
- **Generation quality**: Adjust prompts and LoRA weights

### Performance Tips
- Use GPU acceleration when possible
- Close other applications to free VRAM
- Use smaller batch sizes for testing
- Monitor system resources during generation

## 9. Next Steps

After successful setup:
1. Test with pose01 to verify everything works
2. Create additional poses (pose02, pose03, etc.)
3. Fine-tune prompts for better results
4. Train custom LoRAs for your specific style
5. Integrate with n8n workflow for automation

