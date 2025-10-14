# Character Positions & Lighting - Final CSS

This document contains the finalized CSS for character positioning and lighting for all 14 pages of the book.

**Book Dimensions**: 8.5" × 8.5" @ 300 DPI  
**Last Updated**: 2025-10-11

---

## Page 01 - Twilight Walk

**Pose**: `walking.png`  
**Background**: `page01-twilight-walk.png`

```css
/* Character Positioning */
.character {
    position: absolute;
    right: -36%; 
    top: 7%; 
    width: 350px; 
    transform: scaleX(1);
    height: auto;
    z-index: 100;
}

/* Character Lighting */
.character-lighting::before {
    content: '';
    position: absolute;
    top: 0; 
    left: 0; 
    right: 0; 
    bottom: 0;
    pointer-events: none;
    z-index: 1;
    background: linear-gradient(to bottom, rgba(255, 107, 53, 0.5) 0%, rgba(78, 205, 196, 0.5) 100%); 
    mix-blend-mode: none;
}
```

**Notes**: Character facing normal direction (not flipped), positioned off right edge (negative right %), no lighting blend applied

---

## Page 02 - Night Forest

**Pose**: `walking-looking-higher.png`  
**Background**: `page02-night-forest.png`

```css
/* Character Positioning */
.character {
    position: absolute;
    right: -35%; 
    top: 18%; 
    width: 300px; 
    transform: scaleX(-1);
    height: auto;
    z-index: 100;
}

/* Character Lighting */
.character-lighting::before {
    content: '';
    position: absolute;
    top: 0; 
    left: 0; 
    right: 0; 
    bottom: 0;
    pointer-events: none;
    z-index: 1;
    background: linear-gradient(to bottom left, rgba(255, 221, 51, 0.14) 0%, rgba(52, 30, 102, 0.34) 100%); 
    mix-blend-mode: none;
}
```

**Notes**: Character flipped horizontally, night lighting with yellow to purple gradient 

---

## Page 03 - Magic Doorway

**Pose**: `looking.png`  
**Background**: `page03-magic-doorway.png`

```css
/* Character Positioning */
.character {
    position: absolute;
    right: -19%; 
    top: 15%; 
    width: 350px; 
    transform: scaleX(-1);
    height: auto;
    z-index: 100;
}

/* Character Lighting */
.character-lighting::before {
    content: '';
    position: absolute;
    top: 0; 
    left: 0; 
    right: 0; 
    bottom: 0;
    pointer-events: none;
    z-index: 1;
    background: linear-gradient(to bottom right, rgba(111, 26, 122, 1) 0%, rgba(255, 222, 56, 0.5) 100%); 
    mix-blend-mode: none;
}
```

**Notes**: Character flipped horizontally, magical doorway lighting with purple (100% opacity) to yellow gradient 

---

## Page 04 - Courage Leap

**Pose**: `floating.png`  
**Background**: `page04-courage-leap.png`

```css
/* Character Positioning */
.character {
    position: absolute;
    right: -30%; 
    top: -2%; 
    width: 390px; 
    transform: scaleX(1) rotateZ(-15deg);
    height: auto;
    z-index: 100;
}

/* Character Lighting */
.character-lighting::before {
    content: '';
    position: absolute;
    top: 0; 
    left: 0; 
    right: 0; 
    bottom: 0;
    pointer-events: none;
    z-index: 1;
    background: linear-gradient(to bottom right, rgba(255, 107, 53, 0) 0%, rgba(38, 7, 95, 0.12) 100%); 
    mix-blend-mode: multiply;
}
```

**Notes**: Character rotated -15° for floating/leap effect, positioned off right edge with subtle gradient from transparent orange to dark purple with multiply blend 

---

## Page 05 - Morning Meadow

**Pose**: `walking-looking-down.png`  
**Background**: `page05-morning-meadow.png`

```css
/* Character Positioning */
.character {
    position: absolute;
    right: -31%; 
    top: 14%; 
    width: 300px; 
    transform: scaleX(-1);
    height: auto;
    z-index: 100;
}

/* Character Lighting */
.character-lighting::before {
    content: '';
    position: absolute;
    top: 0; 
    left: 0; 
    right: 0; 
    bottom: 0;
    pointer-events: none;
    z-index: 1;
    background: linear-gradient(to bottom, rgba(255, 107, 53, 0.5) 0%, rgba(78, 205, 196, 0.5) 100%); 
    mix-blend-mode: none;
}
```

**Notes**: Character flipped horizontally, positioned off right edge, gradient disabled (no blend mode) 

---

## Page 06 - Tall Forest

**Pose**: `jogging.png`  
**Background**: `page06-tall-forest.png`

```css
/* Character Positioning */
.character {
    position: absolute;
    right: -32%; 
    top: 13%; 
    width: 300px; 
    transform: scaleX(1);
    height: auto;
    z-index: 100;
}

/* Character Lighting */
.character-lighting::before {
    content: '';
    position: absolute;
    top: 0; 
    left: 0; 
    right: 0; 
    bottom: 0;
    pointer-events: none;
    z-index: 1;
    background: linear-gradient(to bottom, rgba(255, 107, 53, 0.5) 0%, rgba(78, 205, 196, 0.5) 100%); 
    mix-blend-mode: none;
}
```

**Notes**: Character facing normal direction, positioned off right edge, gradient disabled (no blend mode) 

---

## Page 07 - Mountain Vista

**Pose**: `looking.png`  
**Background**: `page07-mountain-vista.png`

```css
/* Character Positioning */
.character {
    position: absolute;
    right: -26%; 
    top: -4%; 
    width: 350px; 
    transform: scaleX(-1);
    height: auto;
    z-index: 100;
}

/* Character Lighting */
.character-lighting::before {
    content: '';
    position: absolute;
    top: 0; 
    left: 0; 
    right: 0; 
    bottom: 0;
    pointer-events: none;
    z-index: 1;
    background: linear-gradient(to bottom, rgba(255, 107, 53, 0.5) 0%, rgba(78, 205, 196, 0.5) 100%); 
    mix-blend-mode: none;
}
```

**Notes**: Character flipped horizontally, positioned off right edge with negative top (higher placement), gradient disabled (no blend mode) 

---

## Page 08 - Picnic Surprise

**Pose**: `sitting-eating.png`  
**Background**: `page08-picnic-surprise.png`

```css
/* Character Positioning */
.character {
    position: absolute;
    right: -30%; 
    top: 0%; 
    width: 490px; 
    transform: scaleX(1);
    height: auto;
    z-index: 100;
}

/* Character Lighting */
.character-lighting::before {
    content: '';
    position: absolute;
    top: 0; 
    left: 0; 
    right: 0; 
    bottom: 0;
    pointer-events: none;
    z-index: 1;
    background: linear-gradient(to bottom, rgba(255, 107, 53, 0.5) 0%, rgba(78, 205, 196, 0.5) 100%); 
    mix-blend-mode: none;
}
```

**Notes**: Character facing normal direction, larger width (490px) for sitting pose, positioned at top edge, gradient disabled (no blend mode) 

---

## Page 09 - Beach Discovery

**Pose**: `crouching.png`  
**Background**: `page09-beach-discovery.png`

```css
/* Character Positioning */
.character {
    position: absolute;
    right: -25%; 
    top: 8%; 
    width: 400px; 
    transform: scaleX(-1);
    height: auto;
    z-index: 100;
}

/* Character Lighting */
.character-lighting::before {
    content: '';
    position: absolute;
    top: 0; 
    left: 0; 
    right: 0; 
    bottom: 0;
    pointer-events: none;
    z-index: 1;
    background: linear-gradient(to bottom, rgba(255, 107, 53, 0.5) 0%, rgba(78, 205, 196, 0.5) 100%); 
    mix-blend-mode: overlay;
}
```

**Notes**: Character flipped horizontally, positioned off right edge, gradient with overlay blend mode applied 

---

## Page 10 - Crystal Cave

**Pose**: `crawling-moving-happy.png`  
**Background**: `page10-crystal-cave.png`

```css
/* Character Positioning */
.character {
    position: absolute;
    right: -18%; 
    top: 13%; 
    width: 500px; 
    transform: scaleX(-1);
    height: auto;
    z-index: 100;
}

/* Character Lighting */
.character-lighting::before {
    content: '';
    position: absolute;
    top: 0; 
    left: 0; 
    right: 0; 
    bottom: 0;
    pointer-events: none;
    z-index: 1;
    background: linear-gradient(to bottom, rgba(255, 107, 53, 0.5) 0%, rgba(78, 205, 196, 0.5) 100%); 
    mix-blend-mode: none;
}
```

**Notes**: Character flipped horizontally, largest width (500px) for crawling pose, positioned off right edge, gradient disabled (no blend mode) 

---

## Page 11 - Giant Flowers

**Pose**: `surprised-looking-up.png`  
**Background**: `page11-giant-flowers.png`

```css
/* Character Positioning */
.character {
    position: absolute;
    right: -57%; 
    top: 24.5%; 
    width: 200px; 
    transform: scaleX(1);
    height: auto;
    z-index: 100;
}

/* Character Lighting */
.character-lighting::before {
    content: '';
    position: absolute;
    top: 0; 
    left: 0; 
    right: 0; 
    bottom: 0;
    pointer-events: none;
    z-index: 1;
    background: linear-gradient(to bottom, rgba(255, 107, 53, 0.5) 0%, rgba(78, 205, 196, 0.5) 100%); 
    mix-blend-mode: none;
}
```

**Notes**: Character facing normal direction, smallest width (200px) for distant perspective, positioned far off right edge, gradient disabled (no blend mode) 

---

## Page 12 - Enchanted Grove

**Pose**: `surprised.png`  
**Background**: `page12-almost-there.png`

```css
/* Character Positioning */
.character {
    position: absolute;
    right: -14%; 
    top: 15%; 
    width: 350px; 
    transform: scaleX(-1);
    height: auto;
    z-index: 100;
}

/* Character Lighting */
.character-lighting::before {
    content: '';
    position: absolute;
    top: 0; 
    left: 0; 
    right: 0; 
    bottom: 0;
    pointer-events: none;
    z-index: 1;
    background: linear-gradient(to bottom, rgba(255, 107, 53, 0.5) 0%, rgba(78, 205, 196, 0.5) 100%); 
    mix-blend-mode: overlay;
}
```

**Notes**: Character flipped horizontally in surprised pose, looking around for the source of the voice, with overlay blend mode

---

## Page 13 - Animal Reveal

**Pose**: `tiger-appears.png` (animal guide overlay)  
**Background**: `page13-animal-reveal.png`

```css
/* Character Positioning */
.character {
    position: absolute;
    right: -25%; 
    top: 5%; 
    width: 390px; 
    transform: scaleX(1);
    height: auto;
    z-index: 100;
}

/* Character Lighting */
.character-lighting::before {
    content: '';
    position: absolute;
    top: 0; 
    left: 0; 
    right: 0; 
    bottom: 0;
    pointer-events: none;
    z-index: 1;
    background: linear-gradient(to bottom, rgba(255, 107, 53, 0.5) 0%, rgba(78, 205, 196, 0.5) 100%); 
    mix-blend-mode: overlay;
}
```

**Notes**: Tiger guide appears as overlay character positioned off right edge, facing normal direction with overlay blend mode

---

## Page 14 - Flying Home

**Pose**: `flying.png` (child) + `tiger-flying.png` (animal guide)  
**Background**: `page14-flying-home.png`

```css
/* Child Character Positioning */
.character {
    position: absolute;
    right: -5%; 
    top: -5%; 
    width: 450px; 
    transform: scaleX(1);
    height: auto;
    z-index: 100;
}

/* Child Character Lighting */
.character-lighting::before {
    content: '';
    position: absolute;
    top: 0; 
    left: 0; 
    right: 0; 
    bottom: 0;
    pointer-events: none;
    z-index: 1;
    background: linear-gradient(to bottom, rgba(255, 107, 53, 0.5) 0%, rgba(78, 205, 196, 0.5) 100%); 
    mix-blend-mode: overlay;
}

/* Animal Guide Positioning */
.animal-guide {
    position: absolute;
    right: 15%;
    top: 18%;
    width: 450px;
    height: auto;
    z-index: 99;
}
```

**Notes**: Two characters flying together - child in upper right corner and animal guide alongside. Both use same 450px width for visual balance. 

---

## Summary

- **Completed**: 14/14 pages ✅
- **In Progress**: 0/14 pages
- **Pending**: 0/14 pages

## Integration Notes

To integrate these into the n8n workflow:

1. Extract positioning values: `right`, `top`, `width`, `transform` (flip)
2. Extract lighting gradient: direction, start color/opacity, end color/opacity, blend mode
3. Map to page number in workflow
4. Apply to character overlay during page generation

## Common Patterns Observed

- **Character Width Range**: 280-350px typically
- **Vertical Position**: Varies by pose and scene
- **Horizontal Position**: Can be negative for off-edge positioning
- **Lighting**: Most scenes use subtle gradients with low opacity
- **Blend Modes**: Varies by scene lighting (none, overlay, soft-light, multiply)

