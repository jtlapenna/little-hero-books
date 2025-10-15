# Character Positioning - Final PDF Dimensions (2550px × 2550px)

This document contains the final character positioning CSS for all 14 pages of the Little Hero Books story, optimized for PDF generation at 300 DPI (2550px × 2550px).

## Character Positioning CSS

### Page 01 - Twilight Walk
```css
/* Character Positioning for PDF (2550px × 2550px) */
.character {
    position: absolute;
    right: 22%; top: 38%; width: 1000px; transform: scaleX(1);
    height: auto;
    z-index: 100;
}
```

### Page 02 - Night Forest
```css
/* Character Positioning for PDF (2550px × 2550px) */
.character {
    position: absolute;
    right: 25%; top: 50%; width: 900px; transform: scaleX(1);
    height: auto;
    z-index: 100;
}
```

### Page 03 - Magic Doorway
```css
/* Character Positioning for PDF (2550px × 2550px) */
.character {
    position: absolute;
    right: 45%; top: 50%; width: 900px; transform: scaleX(-1);
    height: auto;
    z-index: 100;
}
```

### Page 04 - Courage Leap
```css
/* Character Positioning for PDF (2550px × 2550px) */
.character {
    position: absolute;
    right: 30%; top: 32%; width: 800px; transform: scaleX(1) rotateZ(-20deg);
    height: auto;
    z-index: 100;
}
```

### Page 05 - Morning Meadow
```css
/* Character Positioning for PDF (2550px × 2550px) */
.character {
    position: absolute;
    right: 33%; top: 46%; width: 900px; transform: scaleX(-1);
    height: auto;
    z-index: 100;
}
```

### Page 06 - Tall Forest
```css
/* Character Positioning for PDF (2550px × 2550px) */
.character {
    position: absolute;
    right: 30%; top: 46%; width: 900px; transform: scaleX(1);
    height: auto;
    z-index: 100;
}
```

### Page 07 - Mountain Vista
```css
/* Character Positioning for PDF (2550px × 2550px) */
.character {
    position: absolute;
    right: 35%; top: 30%; width: 900px; transform: scaleX(-1);
    height: auto;
    z-index: 100;
}
```

### Page 08 - Picnic Surprise
```css
/* Character Positioning for PDF (2550px × 2550px) */
.character {
    position: absolute;
    right: 25%; top: 35%; width: 900px; transform: scaleX(1);
    height: auto;
    z-index: 100;
}
```

### Page 09 - Beach Discovery
```css
/* Character Positioning for PDF (2550px × 2550px) */
.character {
    position: absolute;
    right: 32%; top: 46%; width: 900px; transform: scaleX(-1);
    height: auto;
    z-index: 100;
}
```

### Page 10 - Crystal Cave
```css
/* Character Positioning for PDF (2550px × 2550px) */
.character {
    position: absolute;
    right: 35%; top: 45%; width: 900px; transform: scaleX(-1);
    height: auto;
    z-index: 100;
}
```

### Page 11 - Giant Flowers
```css
/* Character Positioning for PDF (2550px × 2550px) */
.character {
    position: absolute;
    right: 12%; top: 69%; width: 300px; transform: scaleX(1);
    height: auto;
    z-index: 100;
}
```

### Page 12 - Enchanted Grove
```css
/* Character Positioning for PDF (2550px × 2550px) */
.character {
    position: absolute;
    right: 50%; top: 50%; width: 900px; transform: scaleX(1);
    height: auto;
    z-index: 100;
}
```

### Page 13 - Animal Reveal (Tiger Only)
```css
/* Animal Positioning for PDF (2550px × 2550px) */
.animal-guide {
    position: absolute;
    right: -30%; top: -5%; width: 1950px; height: auto; z-index: 90;
}

.animal-guide img {
    width: 100%;
    height: auto;
}
```

### Page 14 - Flying Home (Character + Animal)
```css
/* Character Positioning for PDF (2550px × 2550px) */
.character {
    position: absolute;
    right: 50%; top: 50%; width: 900px; transform: scaleX(1);
    height: auto;
    z-index: 100;
}

/* Animal Positioning for PDF (2550px × 2550px) */
.animal-guide {
    position: absolute;
    right: 3%; top: 8%; width: 1650px; height: auto; z-index: 90;
}

.animal-guide img {
    width: 100%;
    height: auto;
}
```

## Notes

- **Scale**: All positioning is optimized for 2550px × 2550px (8.5" × 8.5" at 300 DPI)
- **Character Images**: Use background-removed images (`_nobg.png`) for seamless integration
- **Animal Images**: 
  - Page 13: `tiger-appears.png` (animal only)
  - Page 14: `tiger-flying.png` (character + animal)
- **Transform Properties**: 
  - `scaleX(-1)` flips character horizontally
  - `rotateZ()` adds rotation when needed
- **Z-Index**: Characters at 100, animals at 90 to layer properly

## Implementation

These CSS rules should be applied to the respective pages in the n8n workflow's "Generate Complete HTML" node, ensuring consistent character positioning across all generated PDFs.
