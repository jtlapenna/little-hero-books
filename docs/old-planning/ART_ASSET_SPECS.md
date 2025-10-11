# Art Asset Specifications - Little Hero Books

## 📐 Core Specifications

### Book Dimensions
- **Trim Size**: 11 × 8.25 inches
- **Bleed Size**: 11.25 × 8.75 inches (0.125" bleed each side)
- **Canvas Resolution**: 300 DPI
- **Canvas Pixels**: 3375 × 2625 pixels
- **Color Space**: sRGB (IEC61966-2.1)

### File Formats
- **Backgrounds**: PNG (opaque, no transparency)
- **Character Parts**: PNG (transparent background)
- **Text Overlays**: Handled by renderer (no image files needed)

---

## 🎨 Background Images

### Requirements
- **Canvas**: 3375 × 2625 pixels (11.25 × 8.75 inches @ 300 DPI)
- **Bleed Coverage**: Full coverage to edges
- **Safe Zone**: Keep important elements 150+ pixels from trim edges
- **Style**: Watercolor textures, whimsical, warm colors
- **File Size**: ≤ 6 MB per image

### Story Pages (14 total)
1. **page01_dedication** - Decorative frame with space for text
2. **page02_bedroom** - Child's bedroom (day)
3. **page03_forest** - Forest path entrance
4. **page04_mountain** - Mountain vista
5. **page05_sky** - Sky with clouds
6. **page06_sea** - Ocean scene
7. **page07_lunch** - Picnic area
8. **page08_cave** - Cave entrance
9. **page09_garden** - Magical garden
10. **page10_town** - Town square
11. **page11_bedroom-return** - Bedroom return
12. **page12_compass** - Compass glowing
13. **page13_dedication** - Keepsake frame
14. **page14_dedication2** - Final dedication

### Naming Convention
- **Format**: `page##_description.png`
- **Examples**: `page01_dedication.png`, `page02_bedroom.png`

---

## 👤 Character System

### Base Character Specifications
- **Canvas**: 800 × 1200 pixels (2:3 aspect ratio)
- **Pose**: Standing, neutral, arms at sides
- **Style**: Simple, clean, child-friendly
- **Registration**: Feet at bottom edge (y=1200)

### Character Parts (Modular System)

#### Skin Tones (3-4 options)
- **File**: `skin_light.png`, `skin_medium.png`, `skin_dark.png`
- **Canvas**: 800 × 1200 pixels
- **Style**: Natural skin tones, no clothing
- **Alignment**: Perfect registration with base pose

#### Hair Styles (3-4 options)
- **File**: `hair_short_brown.png`, `hair_long_blonde.png`, `hair_curly_black.png`
- **Canvas**: 800 × 1200 pixels
- **Style**: Various lengths and textures
- **Alignment**: Perfect registration with base pose

#### Clothing (2-3 options each)
- **Tops**: `top_tshirt_blue.png`, `top_dress_red.png`
- **Bottoms**: `bottom_shorts.png`, `bottom_pants.png`
- **Shoes**: `shoes_sneakers.png`
- **Canvas**: 800 × 1200 pixels each
- **Style**: Simple, clean designs

### Character Positioning
- **Local Coordinates**: All parts use same 800×1200 canvas
- **Registration Points**: Consistent alignment across all parts
- **Z-Order**: Base → Skin → Hair → Clothes → Accessories
- **Aspect Ratio**: Preserved automatically by renderer

---

## 🎯 Text Overlays

### Specifications
- **Handled by**: Renderer service (no image files)
- **Fonts**: Helvetica, Helvetica-Bold
- **Sizes**: 14-28pt depending on content
- **Colors**: Dark grays (#333333, #2c3e50)
- **Positioning**: JSON-based coordinates

### Text Styles
- **Headlines**: 28pt, bold, dark blue-gray
- **Page Titles**: 18pt, regular, medium gray
- **Dialogue**: 16pt, regular, dark gray
- **Narration**: 14pt, regular, dark gray

---

## 📁 File Organization

### Directory Structure
```
assets/
├── backgrounds/
│   ├── page01_dedication.png
│   ├── page02_bedroom.png
│   └── ... (14 total)
├── characters/
│   ├── base_pose.png
│   ├── skin_light.png
│   ├── skin_medium.png
│   ├── skin_dark.png
│   ├── hair_short_brown.png
│   ├── hair_long_blonde.png
│   ├── hair_curly_black.png
│   ├── top_tshirt_blue.png
│   ├── top_dress_red.png
│   ├── bottom_shorts.png
│   ├── bottom_pants.png
│   └── shoes_sneakers.png
└── overlays/
    └── characters/
        └── pose01.png  # Current placeholder
```

### Naming Convention
- **Format**: `category_description_variant.png`
- **Examples**: `skin_medium.png`, `hair_curly_black.png`
- **Versioning**: Start with no version, add `_v2` for major changes

---

## ✅ Quality Checklist

### Background Images
- [ ] Canvas size: 3375 × 2625 pixels
- [ ] Resolution: 300 DPI
- [ ] Color space: sRGB
- [ ] Bleed coverage: Full to edges
- [ ] Safe zone: Important elements 150+ pixels from trim
- [ ] File size: ≤ 6 MB
- [ ] Style: Consistent watercolor aesthetic

### Character Parts
- [ ] Canvas size: 800 × 1200 pixels
- [ ] Resolution: 300 DPI
- [ ] Color space: sRGB
- [ ] Background: Transparent
- [ ] Alignment: Perfect registration with base pose
- [ ] Style: Consistent with base character
- [ ] File size: ≤ 1 MB each

### Integration Testing
- [ ] All parts align perfectly when layered
- [ ] No clipping or overlap issues
- [ ] Aspect ratio preserved in renderer
- [ ] Z-order correct (base → skin → hair → clothes)
- [ ] Works with all background scenes
- [ ] No manual positioning required

---

## 🚀 Implementation Priority

### Phase 1: Backgrounds (Complete)
- [x] 14 placeholder background images created
- [x] Mock renderer handling backgrounds
- [x] PDF generation working

### Phase 2: Character System (Current)
- [ ] Create base character pose
- [ ] Add 3-4 skin tone variants
- [ ] Add 3-4 hair style options
- [ ] Add 2-3 clothing options
- [ ] Test all combinations
- [ ] Update renderer for group overlays

### Phase 3: Full Library (Future)
- [ ] Expand to 6-8 skin tones
- [ ] Add 8-10 hair styles
- [ ] Add 10+ clothing options
- [ ] Add accessories
- [ ] Add animal companions
- [ ] Add magical elements

This simplified approach focuses on the essentials needed for MVP while maintaining quality and consistency.
