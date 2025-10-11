# Character Asset Workflow - Pre-Generation Strategy

Here's a comprehensive workflow for generating **all** character + animal assets using AI + manual cleanup in a **pre-generation approach**. This ensures consistent quality, fast order processing, and reliable production.

---

## 🎯 Core Requirements Recap

You'll need:

* **Base Character Assets**: Body poses (per scene) in each skin tone
* **Hair Overlays**: Head/face poses (per scene) in each skin tone + all hairstyles
* **Eye Overlays**: Interchangeable eye colors for each head pose
* **Animal Companions**: Multiple poses per scene
* **Quality Control**: Photoshop cleanup and standardization

**Key Change**: All assets are generated **before orders** and stored as prefab components. The renderer assembles existing assets rather than generating new ones.

---

## 🧩 Pre-Generation Pipeline Overview

Here's the high-level pipeline for generating all assets upfront:

1. **Setup Style Consistency**: Download Hugging Face embeddings and train LoRAs for character consistency and art style.
2. **Define Pose Templates**: Create skeleton + bounding boxes per scene (7 poses total).
3. **Generate Base Character Assets**: Body + head per pose + skin tone using LoRA + embeddings.
4. **Generate Hair Overlay Assets**: All hairstyles + colors per head pose using LoRA + embeddings.
5. **Generate Eye Color Overlays**: All eye colors per head pose using LoRA + embeddings.
6. **Generate Animal Companion Assets**: All poses per scene using LoRA + embeddings.
7. **Photoshop Batch Processing**: Clean up, standardize sizes, align bounding boxes using automated scripts.
8. **Quality Control**: Verify all assets meet production standards.
9. **Deploy to Asset Management**: Store in organized structure for renderer access.

---

## 🔧 Tools & Techniques

### **Style Consistency & Quality Control**
* **Hugging Face Embeddings**: Download pre-trained embeddings for watercolor children's book style and storybook illustration aesthetic.
* **LoRA Training**: Train custom LoRAs for character consistency (0.8 strength) and art style (0.6 strength) to maintain visual coherence across all generations.
* **ComfyUI Integration**: Use our updated workflow JSON with built-in LoRA and embedding nodes for automated, consistent generation.

### **Generation & Processing**
* Use **ComfyUI** (node-based) with our integrated LoRA + embedding workflow for consistent character generation. ([Journey AI Art][1])
* Use **ControlNet / pose guides** to enforce skeleton / pose constraints so the AI doesn't drift.
* Use **layered overlay approach** (97% fewer images) with separate body, hair, and eye overlays for maximum efficiency.
* Use a "master template" with fixed 1024×1024 bounding boxes so every generated asset fits consistently.
* **Photoshop Scripts**: Automated batch processing for alignment, cleanup, and standardization of all assets.

### **Quality Assurance**
* Use your stronger LLMs (GPT-5 etc.) to generate precise prompts with embedding keywords for consistent style application.
* Implement automated quality checks for dimensions, transparency, and positioning.
* **Batch Processing**: Process all assets through standardized Photoshop scripts.

---

## 📅 Detailed Stepwise Workflow (Pre-Generation)

Here's the granular breakdown for generating all assets upfront:

| Stage                        | Input / Template                               | AI Generation                      | Output                                     | Notes                                                       |
| ---------------------------- | ---------------------------------------------- | ---------------------------------- | ------------------------------------------ | ----------------------------------------------------------- |
| **1. Pose Template**         | Skeleton / stick figure + bounding box overlay | none (manual)                      | Template file for each scene               | Use fixed proportions, designate head box, body box, margin |
| **2. Base Character Assets** | Pose template + skin tone label + prompt       | Diffusion model (via ComfyUI)      | Transparent PNG: body + head (no hair)     | Generate per skin tone (4 tones × 7 poses = 28 assets)     |
| **3. Hair Overlay Assets**  | Base head + hairstyle prompt + hair color spec | Diffuse hair overlay (transparent) | PNG hair layers to drop onto head          | Generate all combinations (28 base × 7 styles × 5 colors = 980 assets) |
| **4. Eye Color Overlays**   | Base head overlay + iris prompt                | Diffusion or inpainting            | Transparent iris/eye color overlays        | Generate all combinations (28 base × 4 eye colors = 112 assets) |
| **5. Animal Companion Assets** | Scene prompt + animal pose spec                | Diffusion model                    | PNG animal overlay                         | Generate all poses per scene (7 poses × 3-4 animals = 21-28 assets) |
| **6. Photoshop Batch Processing** | All PNGs                                       | Photoshop scripts or batch actions | Corrected, aligned, same size, layer order | Fix clipping, shadows, alignment for all assets |
| **7. Quality Control**       | All processed PNGs                             | Automated + manual checks          | Production-ready assets                    | Verify dimensions, transparency, positioning |
| **8. Asset Deployment**      | Production-ready assets                        | File organization                  | Organized asset library                    | Deploy to renderer-accessible storage |

---

## ✅ Asset Generation Schedule

### **Phase 1: Base Character Assets (Week 1)**
- 4 skin tones × 7 poses = **28 base character assets**
- Focus on consistency and quality
- Establish bounding box standards

### **Phase 2: Hair Overlay Assets (Week 2)**
- 28 base characters × 7 hairstyles × 5 colors = **980 hair overlay assets**
- Use inpainting for precise hair placement
- Ensure perfect head alignment

### **Phase 3: Eye Color Overlays (Week 3)**
- 28 base characters × 4 eye colors = **112 eye overlay assets**
- Focus on subtle, natural color variations
- Maintain consistent eye shape and position

### **Phase 4: Animal Companion Assets (Week 4)**
- 7 poses × 3-4 animals = **21-28 animal assets**
- Ensure consistent style with character assets
- Test positioning in various scenes

### **Phase 5: Quality Control & Deployment (Week 5)**
- Photoshop batch processing for all assets
- Quality control and standardization
- Deploy to asset management system

---

## 📐 Precision & Scaling Strategies

* Always generate to a **fixed bounding box / canvas size**. E.g. 1024×1024 or whatever your renderer expects, with defined head/body area. This ensures alignment across assets.
* Use **mask + transparency control** to isolate hair, head, and body so layers don’t bleed.
* Use the same aspect ratio / DPI / resolution settings across all generations.
* Track metadata (scene ID, pose ID, skin tone, hairstyle, hair color, animal pose) in file naming or JSON manifest so automation downstream knows exactly which asset is which.
* When generating hair overlays, include **“transparent background, overlay only”** in prompt and optionally use negative prompts to avoid other elements.

---

## ⚠️ Risks & Challenges

* AI drift: the model may change proportions or style subtly between generations; you’ll need quality control and possible human cleanup.
* Hair + head alignment: hair overlays must match head shape and position exactly. Some mismatch may happen.
* Character consistency across scenes (especially when changing scenes/backgrounds) is nontrivial — often you must reference a “character identity embed” or LoRA to maintain facial consistency.
* Animals: multiple animal poses may require separate tuning, and consistency across scenes is also tough.
* Eye color overlays: small details are harder for diffusion models to render cleanly; may require manual cleanup or vector overlays.

---

## 🛠 Suggested Tools & Resources

* **ComfyUI** for structured node workflows and pose / prompt control. ([Wikipedia][3])
* **Scenario** for reskinning and color variant generation. ([Scenario][2])
* **Layer.ai** for production-quality 2D asset pipelines and variant generation. ([layer.ai][4])
* Use prompt engineering and embeddings (textual inversion / LoRA) to lock in your character’s identity across generations.
* Use Photoshop batch scripts or actions to align, crop, resize, and clean up your PNG assets.

---

## 🚀 Integration with Renderer

Once all assets are generated and processed:

1. **Asset Library**: Store all assets in organized structure (skin tone, hairstyle, eye color, pose)
2. **Renderer Integration**: n8n workflow selects appropriate assets based on order customization
3. **Assembly**: Renderer composites selected assets onto backgrounds
4. **Quality Assurance**: Automated checks ensure proper asset selection and positioning

This pre-generation approach ensures:
- **Fast order processing** (seconds, not minutes)
- **Consistent quality** across all orders
- **Reliable production** with no AI generation failures
- **Cost efficiency** (one-time generation vs per-order costs)
- **Scalability** for high order volumes

If you like, I can **draft a concrete prompt library** (templates for generating base body, hair overlays, animal poses) tailored to your art style and scene list. Do you want me to build that next?

[1]: https://journeyaiart.com/blog-Create-Consistent-Editable-AI-Characters-Backgrounds-for-your-Projects-ComfyUI-Tutorial-38777?utm_source=chatgpt.com "Create Consistent, Editable AI Characters & Backgrounds for your Projects! (ComfyUI Tutorial)"
[2]: https://help.scenario.com/en/articles/reskinning-assets?utm_source=chatgpt.com "Reskin Game Assets with AI - Fast & Efficient Workflow | Scenario"
[3]: https://en.wikipedia.org/wiki/ComfyUI?utm_source=chatgpt.com "ComfyUI"
[4]: https://www.layer.ai/features/2d-ai-art-generation?utm_source=chatgpt.com "Generate 2D game assets with AI | Layer"

