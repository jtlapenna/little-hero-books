# ComfyUI Advanced Setup Guide - Custom Nodes & Models

## Why We Need These Features

### **LoRA (Low-Rank Adaptation)**
- **Purpose**: Fine-tune AI models for consistent character style
- **Benefit**: Same character appearance across all poses
- **Example**: Train on your specific art style

### **ControlNet**
- **Purpose**: Control pose and composition precisely
- **Benefit**: Character maintains exact pose from reference image
- **Example**: OpenPose for body pose control

### **Textual Inversion (Embeddings)**
- **Purpose**: Create custom keywords for specific styles
- **Benefit**: Consistent art style across generations
- **Example**: "watercolor_childrens_book" style

### **Inpaint Nodes**
- **Purpose**: Generate content only in masked areas
- **Benefit**: Precise control over what gets generated
- **Example**: Generate hair only in head mask area

## Step 1: Install Custom Nodes

### **Via ComfyUI Manager (Recommended)**
1. **Open ComfyUI desktop app**
2. **Look for "Manager" button** (usually in top menu)
3. **Go to "Install Custom Nodes" tab**
4. **Search and install each node**:

```
ComfyUI-Manager (if not already installed)
ComfyUI-ControlNet-Aux
ComfyUI-LoRA  
ComfyUI-Textual-Inversion
ComfyUI-Inpaint
ComfyUI-Image-Composite
```

5. **Restart ComfyUI** after installation

### **Manual Installation (Alternative)**
```bash
# Navigate to ComfyUI custom_nodes directory
cd /Users/jeff/Documents/ComfyUI/custom_nodes

# Clone each repository
git clone https://github.com/ltdrdata/ComfyUI-Manager.git
git clone https://github.com/Fannovel16/ComfyUI-ControlNet-Aux.git
git clone https://github.com/kijai/ComfyUI-LoRA.git
git clone https://github.com/pythongosssss/ComfyUI-Textual-Inversion.git
git clone https://github.com/spacepxl/ComfyUI-Inpaint.git
git clone https://github.com/pythongosssss/ComfyUI-Image-Composite.git
```

## Step 2: Download Required Models

### **ControlNet Models**
**Location**: `assets/models/controlnet/`

```bash
# OpenPose ControlNet (for pose control)
wget -O assets/models/controlnet/openpose_fp16.safetensors \
  "https://huggingface.co/lllyasviel/ControlNet-v1-1/resolve/main/control_v11p_sd15_openpose.pth"

# Canny Edge ControlNet (for edge control)
wget -O assets/models/controlnet/canny_fp16.safetensors \
  "https://huggingface.co/lllyasviel/ControlNet-v1-1/resolve/main/control_v11p_sd15_canny.pth"
```

### **LoRA Models**
**Location**: `assets/models/loras/`

**For Character Consistency**:
```bash
# Download character consistency LoRA (example)
wget -O assets/models/loras/character_consistency.safetensors \
  "https://huggingface.co/[your-username]/character-consistency-lora/resolve/main/character_consistency.safetensors"
```

**For Art Style**:
```bash
# Download watercolor style LoRA (example)
wget -O assets/models/loras/watercolor_style.safetensors \
  "https://huggingface.co/[your-username]/watercolor-style-lora/resolve/main/watercolor_style.safetensors"
```

### **Textual Inversion Embeddings**
**Location**: `assets/models/embeddings/`

```bash
# Create embeddings directory
mkdir -p assets/models/embeddings

# Download example embeddings
wget -O assets/models/embeddings/watercolor_childrens_book.pt \
  "https://huggingface.co/[your-username]/watercolor-childrens-book/resolve/main/watercolor_childrens_book.pt"

wget -O assets/models/embeddings/storybook_illustration.pt \
  "https://huggingface.co/[your-username]/storybook-illustration/resolve/main/storybook_illustration.pt"
```

## Step 3: Create Custom LoRA Models (Optional)

### **For Character Consistency**
1. **Collect 20-50 images** of your character in different poses
2. **Use LoRA training tools** (like Kohya_ss or ComfyUI-LoRA-Trainer)
3. **Train on your character images**
4. **Save as `character_consistency.safetensors`**

### **For Art Style**
1. **Collect 50-100 images** in your desired art style
2. **Train LoRA** on the style images
3. **Save as `watercolor_style.safetensors`**

## Step 4: Create Textual Inversion Embeddings (Optional)

### **For Art Style Keywords**
1. **Use ComfyUI-Textual-Inversion** or similar tools
2. **Train on your art style images**
3. **Create keywords** like "watercolor_childrens_book"
4. **Save as `.pt` files**

## Step 5: Test Advanced Workflow

### **After Installation**
1. **Restart ComfyUI**
2. **Import the full workflow**: `comfy_ui_workflow_json_fixed.json`
3. **Test with pose01**
4. **Verify all custom nodes load correctly**

### **Expected Results**
- **Base character** with consistent style
- **Hair overlay** that matches the pose
- **Eye color** that fits the character
- **All assets** saved to correct folders

## Troubleshooting

### **Custom Nodes Not Loading**
- Check ComfyUI logs for errors
- Ensure all dependencies are installed
- Restart ComfyUI after installation

### **Models Not Found**
- Verify file paths in workflow JSON
- Check file permissions
- Ensure models are in correct directories

### **Generation Quality Issues**
- Adjust LoRA weights (0.5-1.0)
- Fine-tune prompts
- Experiment with different samplers

## Next Steps

1. **Install custom nodes** via ComfyUI Manager
2. **Download required models** (ControlNet, LoRA, embeddings)
3. **Test the advanced workflow**
4. **Fine-tune for your specific needs**
5. **Create custom LoRA models** for better consistency

**The advanced workflow will give you much better results than the simplified version!**

