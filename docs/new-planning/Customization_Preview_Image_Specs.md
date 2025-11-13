# Customization Preview Image Generation Guide

This guide provides exact specifications for generating preview images for each customization option. Use these specs to prompt image generation tools.

---

## Standard Base Character (Constants)

**Used across all preview image sets:**
- **Hair Style**: `straight-medium` (for hair color and skin tone previews)
- **Hair Color**: `medium-brown` (#7B4B2A) (for hair style and skin tone previews)
- **Skin Tone**: `skin-medium` (for hair style and hair color previews)
- **Pose**: Neutral standing pose, facing forward, arms at sides
- **Clothing**: Default `tee-shorts` in neutral gray (#808080) or white
- **Background**: Pure white (#FFFFFF)
- **Image Dimensions**: 600x600px (square, character centered)
- **Character Scale**: Character should fill approximately 60-70% of frame height

---

## 1. Hair Color Preview Images

**Purpose**: Showcase the 8 different hair color options

**Constants (Same for ALL hair color images):**
- **Hair Style**: `straight-medium`
- **Skin Tone**: `skin-medium` (hex: #D4A574 - medium skin tone)
- **Pose**: Neutral standing, facing forward
- **Clothing**: Gray tee-shorts (#808080)
- **Background**: White (#FFFFFF)

**Variable (Changes per image):**
- **Hair Color**: See list below

### Hair Color List:

1. **Blonde**
   - Hex: #D1B26F
   - Image filename: `preview-hair-color-blonde.png`
   - Label: "Blonde"

2. **Strawberry Blonde**
   - Hex: #E6A273
   - Image filename: `preview-hair-color-strawberry-blonde.png`
   - Label: "Strawberry Blonde"

3. **Light Brown**
   - Hex: #A4754A
   - Image filename: `preview-hair-color-light-brown.png`
   - Label: "Light Brown"

4. **Medium Brown**
   - Hex: #7B4B2A
   - Image filename: `preview-hair-color-medium-brown.png`
   - Label: "Medium Brown"

5. **Dark Brown**
   - Hex: #523418
   - Image filename: `preview-hair-color-dark-brown.png`
   - Label: "Dark Brown"

6. **Auburn**
   - Hex: #8B3F2C
   - Image filename: `preview-hair-color-auburn.png`
   - Label: "Auburn"

7. **Black**
   - Hex: #2B2B2B
   - Image filename: `preview-hair-color-black.png`
   - Label: "Black"

8. **Red**
   - Hex: #C25E2E
   - Image filename: `preview-hair-color-red.png`
   - Label: "Red"

**Prompt Template for Hair Color:**
```
Create a children's book character illustration:
- Character: Child, age 5-6, facing forward, neutral standing pose
- Hair Style: Straight medium-length hair
- Hair Color: [COLOR_NAME] (hex: [HEX_CODE])
- Skin Tone: Medium (hex: #D4A574)
- Clothing: Gray t-shirt and shorts (#808080)
- Background: Pure white (#FFFFFF)
- Style: Warm, friendly, age-appropriate for 3-7 year olds
- Image size: 600x600px, character centered
```

---

## 2. Hair Style Preview Images

**Purpose**: Showcase the 12 different hair style options

**Constants (Same for ALL hair style images):**
- **Hair Color**: `medium-brown` (hex: #7B4B2A)
- **Skin Tone**: `skin-medium` (hex: #D4A574 - medium skin tone)
- **Pose**: Neutral standing, facing forward
- **Clothing**: Gray tee-shorts (#808080)
- **Background**: White (#FFFFFF)

**Variable (Changes per image):**
- **Hair Style**: See list below

### Hair Style List:

1. **Afro**
   - Image filename: `preview-hair-style-afro.png`
   - Label: "Afro"
   - Description: Full, rounded afro hairstyle

2. **Bun**
   - Image filename: `preview-hair-style-bun.png`
   - Label: "Bun"
   - Description: Hair pulled back into a bun at the back or top

3. **Curly Long**
   - Image filename: `preview-hair-style-curly-long.png`
   - Label: "Curly Long"
   - Description: Long, curly hair

4. **Curly Medium**
   - Image filename: `preview-hair-style-curly-medium.png`
   - Label: "Curly Medium"
   - Description: Medium-length, curly hair

5. **Curly Short**
   - Image filename: `preview-hair-style-curly-short.png`
   - Label: "Curly Short"
   - Description: Short, curly hair

6. **Pigtails**
   - Image filename: `preview-hair-style-pigtails.png`
   - Label: "Pigtails"
   - Description: Two pigtails on either side

7. **Pom-Poms**
   - Image filename: `preview-hair-style-pom-poms.png`
   - Label: "Pom-Poms"
   - Description: Hair styled in two pom-pom-like buns

8. **Ponytail**
   - Image filename: `preview-hair-style-ponytail.png`
   - Label: "Ponytail"
   - Description: Hair pulled back into a single ponytail

9. **Side Part**
   - Image filename: `preview-hair-style-side-part.png`
   - Label: "Side Part"
   - Description: Hair parted to the side, natural fall

10. **Straight Long**
    - Image filename: `preview-hair-style-straight-long.png`
    - Label: "Straight Long"
    - Description: Long, straight hair

11. **Straight Medium**
    - Image filename: `preview-hair-style-straight-medium.png`
    - Label: "Straight Medium"
    - Description: Medium-length, straight hair

12. **Straight Short**
    - Image filename: `preview-hair-style-straight-short.png`
    - Label: "Straight Short"
    - Description: Short, straight hair

**Prompt Template for Hair Style:**
```
Create a children's book character illustration:
- Character: Child, age 5-6, facing forward, neutral standing pose
- Hair Style: [STYLE_NAME] ([DESCRIPTION])
- Hair Color: Medium brown (hex: #7B4B2A)
- Skin Tone: Medium (hex: #D4A574)
- Clothing: Gray t-shirt and shorts (#808080)
- Background: Pure white (#FFFFFF)
- Style: Warm, friendly, age-appropriate for 3-7 year olds
- Image size: 600x600px, character centered
```

---

## 3. Skin Tone Preview Images

**Purpose**: Showcase the 5 different skin tone options

**Constants (Same for ALL skin tone images):**
- **Hair Style**: `straight-medium`
- **Hair Color**: `medium-brown` (hex: #7B4B2A)
- **Pose**: Neutral standing, facing forward
- **Clothing**: Gray tee-shorts (#808080)
- **Background**: White (#FFFFFF)

**Variable (Changes per image):**
- **Skin Tone**: See list below

### Skin Tone List:

1. **Skin Light**
   - Canonical ID: `skin-light`
   - Hex: #F4D5B3 (light peach/beige)
   - Image filename: `preview-skin-tone-light.png`
   - Label: "Light"

2. **Skin Medium**
   - Canonical ID: `skin-medium`
   - Hex: #D4A574 (medium tan/beige)
   - Image filename: `preview-skin-tone-medium.png`
   - Label: "Medium"

3. **Skin Tan**
   - Canonical ID: `skin-tan`
   - Hex: #B8864F (tan/olive)
   - Image filename: `preview-skin-tone-tan.png`
   - Label: "Tan"

4. **Skin Brown Light**
   - Canonical ID: `skin-brown-light`
   - Hex: #8B6F47 (light brown)
   - Image filename: `preview-skin-tone-brown-light.png`
   - Label: "Light Brown"

5. **Skin Brown Deep**
   - Canonical ID: `skin-brown-deep`
   - Hex: #5C3D2E (deep brown)
   - Image filename: `preview-skin-tone-brown-deep.png`
   - Label: "Deep Brown"

**Note**: Skin tone hex values are approximate. Use your actual asset base colors if they differ.

**Prompt Template for Skin Tone:**
```
Create a children's book character illustration:
- Character: Child, age 5-6, facing forward, neutral standing pose
- Hair Style: Straight medium-length hair
- Hair Color: Medium brown (hex: #7B4B2A)
- Skin Tone: [TONE_NAME] (hex: [HEX_CODE])
- Clothing: Gray t-shirt and shorts (#808080)
- Background: Pure white (#FFFFFF)
- Style: Warm, friendly, age-appropriate for 3-7 year olds
- Image size: 600x600px, character centered
```

---

## 4. Animal Guide Preview Images (Optional)

**Purpose**: Showcase the 8 different animal guide options

**Constants:**
- **Background**: Simple scene (e.g., soft gradient sky or simple landscape)
- **Style**: Friendly, magical, age-appropriate
- **Image Dimensions**: 600x600px

**Variable:**
- **Animal**: See list below

### Animal Guide List:

1. **Dog**
   - Image filename: `preview-animal-dog.png`
   - Label: "Dog"

2. **Cat**
   - Image filename: `preview-animal-cat.png`
   - Label: "Cat"

3. **Owl**
   - Image filename: `preview-animal-owl.png`
   - Label: "Owl"

4. **Lion**
   - Image filename: `preview-animal-lion.png`
   - Label: "Lion"

5. **Tiger**
   - Image filename: `preview-animal-tiger.png`
   - Label: "Tiger"

6. **Penguin**
   - Image filename: `preview-animal-penguin.png`
   - Label: "Penguin"

7. **T-Rex**
   - Image filename: `preview-animal-trex.png`
   - Label: "T-Rex"

8. **Unicorn**
   - Image filename: `preview-animal-unicorn.png`
   - Label: "Unicorn"

**Prompt Template for Animal Guide:**
```
Create a children's book animal illustration:
- Animal: [ANIMAL_NAME]
- Style: Friendly, magical, age-appropriate for 3-7 year olds
- Background: Simple scene (soft gradient sky or gentle landscape)
- Pose: Friendly, approachable pose
- Image size: 600x600px, animal centered
```

---

## Quick Reference: Constants Summary

| Category | Hair Style | Hair Color | Skin Tone | Hex Values |
|----------|-----------|------------|-----------|------------|
| **Hair Color Previews** | `straight-medium` | Variable | `skin-medium` | Skin: #D4A574 |
| **Hair Style Previews** | Variable | `medium-brown` | `skin-medium` | Hair: #7B4B2A, Skin: #D4A574 |
| **Skin Tone Previews** | `straight-medium` | `medium-brown` | Variable | Hair: #7B4B2A |

---

## File Naming Convention

All preview images should follow this naming pattern:
- Hair Color: `preview-hair-color-[color-name].png`
- Hair Style: `preview-hair-style-[style-name].png`
- Skin Tone: `preview-skin-tone-[tone-name].png`
- Animal Guide: `preview-animal-[animal-name].png`

Use lowercase, hyphens for spaces, and match the canonical IDs from `Customization_Source_of_Truth.md`.

---

## Quality Checklist

Before finalizing each image, verify:
- [ ] Character is centered in frame
- [ ] Background is pure white (#FFFFFF) or specified color
- [ ] All constants match the spec for that category
- [ ] Only the intended variable (hair color/style/skin tone) changes
- [ ] Image is 600x600px
- [ ] Character scale is consistent (60-70% of frame height)
- [ ] Style is warm, friendly, age-appropriate
- [ ] File naming matches convention
- [ ] Hex colors match exactly (verify against source assets if available)

---

## Notes

- **Skin Tone Hex Values**: The hex values provided are approximate. Verify against your actual base character assets (`assets/poses/bases/`) and use those exact colors if they differ.
- **Hair Color Hex Values**: These match the values in `Customization_Source_of_Truth.md`. Use these exact hex codes.
- **Consistency**: The key to avoiding confusion is maintaining perfect consistency in all constants across each image set.
- **Testing**: After generation, visually compare images within each set to ensure only the intended variable changes.

