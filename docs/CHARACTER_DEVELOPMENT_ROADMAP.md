# Character Development Roadmap - Little Hero Books

## 🎯 Current Status: Text-First Approach

**Phase 1 Complete**: Text generation and basic overlays working  
**Phase 2 Next**: Character system with precise positioning  
**Phase 3 Future**: Full customization library  

---

## Phase 2: Character System (Current Priority)

### Goal
Create a precise, modular character system that can be easily customized without manual adjustment.

### Approach
1. **Start Simple**: One base character pose
2. **Modular Parts**: Skin, hair, clothes as separate layers
3. **Precise Positioning**: JSON-based slot mapping
4. **Test Thoroughly**: Before expanding

### Character Specifications

#### Base Character Pose
- **Canvas**: 800×1200 pixels (2:3 aspect ratio)
- **Pose**: Standing, neutral, arms at sides
- **Baseline**: Feet at bottom edge (y=1200)
- **Centerline**: Body centered (x=400)
- **Style**: Simple, clean, child-friendly

#### Modular Parts System
```
character_base/
├── base_pose.png          # Body outline (no skin/hair/clothes)
├── skin_light.png         # Light skin tone
├── skin_medium.png        # Medium skin tone  
├── skin_dark.png          # Dark skin tone
├── hair_short_brown.png   # Short brown hair
├── hair_long_blonde.png   # Long blonde hair
├── hair_curly_black.png   # Curly black hair
├── top_tshirt_blue.png    # Blue t-shirt
├── top_dress_red.png      # Red dress
├── bottom_shorts.png      # Shorts
├── bottom_pants.png       # Pants
└── shoes_sneakers.png     # Sneakers
```

#### Positioning System
- **Local Coordinates**: All parts use same 800×1200 canvas
- **Registration Points**: Consistent alignment across all parts
- **Z-Order**: Base → Skin → Hair → Clothes → Accessories
- **Aspect Ratio**: Preserved automatically by renderer

### Implementation Steps

1. **Create Base Character**
   - Design one neutral pose
   - Export as 800×1200 PNG
   - Test positioning in renderer

2. **Add Skin Tones**
   - Create 3-4 skin tone variants
   - Ensure perfect alignment
   - Test with different backgrounds

3. **Add Hair Styles**
   - Create 3-4 hair options
   - Test layering with skin tones
   - Verify no clipping issues

4. **Add Clothing**
   - Create 2-3 top options
   - Create 2-3 bottom options
   - Test combinations

5. **Test & Refine**
   - Test all combinations
   - Verify positioning accuracy
   - Fix any alignment issues

### Renderer Updates Needed

#### Current State
- Basic overlay system working
- Aspect ratio preservation added
- Text overlays working

#### Required Updates
- **Group Overlay Support**: Handle character as a group of parts
- **Local Coordinate System**: Parts positioned relative to character
- **Z-Order Management**: Proper layering of character parts
- **Slot Mapping**: JSON-based positioning per background

#### Example Character Overlay Structure
```json
{
  "type": "group",
  "name": "character",
  "x": 400,
  "y": 200,
  "height": 600,
  "children": [
    {
      "type": "image",
      "name": "base",
      "src": "character_base/base_pose.png",
      "x": 0,
      "y": 0
    },
    {
      "type": "image", 
      "name": "skin",
      "src": "character_base/skin_medium.png",
      "x": 0,
      "y": 0
    },
    {
      "type": "image",
      "name": "hair",
      "src": "character_base/hair_short_brown.png", 
      "x": 0,
      "y": 0
    }
  ]
}
```

---

## Phase 3: Full Customization Library (Future)

### Expanded Character Options
- **Poses**: 3-4 different poses (standing, waving, sitting)
- **Skin Tones**: 6-8 options
- **Hair Styles**: 8-10 options with multiple colors
- **Clothing**: 10+ top options, 8+ bottom options
- **Accessories**: Hats, glasses, backpacks, etc.

### Advanced Features
- **Animal Companions**: Dog, cat, rabbit, fox, etc.
- **Magical Elements**: Stars, sparkles, compass glow
- **Seasonal Themes**: Holiday outfits, seasonal accessories

---

## Success Criteria

### Phase 2 Complete When:
- [ ] One base character pose created
- [ ] 3-4 skin tone variants working
- [ ] 3-4 hair style options working
- [ ] 2-3 clothing options working
- [ ] All combinations render correctly
- [ ] No manual positioning required
- [ ] Aspect ratio preserved
- [ ] Z-order correct

### Quality Standards:
- [ ] All parts align perfectly
- [ ] No clipping or overlap issues
- [ ] Consistent style across all parts
- [ ] High resolution (300 DPI ready)
- [ ] Transparent backgrounds for overlays
- [ ] File sizes optimized

---

## Next Steps

1. **Design Base Character**: Create the foundational pose
2. **Update Renderer**: Add group overlay support
3. **Create Skin Tones**: Start with 3 variants
4. **Test Integration**: Ensure everything works together
5. **Iterate & Expand**: Add more options gradually

This approach ensures we build a solid foundation before expanding, reducing complexity and potential issues.
