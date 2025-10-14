# Page 14 - Tiger Guide Addition

## Overview
Page 14 now includes **two characters** flying together: the child character and the tiger guide.

## Character Positions

### Child Character (Main)
```css
.character {
    position: absolute;
    right: -5%; 
    top: -5%; 
    width: 450px; 
    transform: scaleX(1);
    height: auto;
    z-index: 100;
}
```

### Tiger Guide (Secondary)
```css
.tiger-character {
    position: absolute;
    right: 15%;
    top: 18%;
    width: 450px;
    height: auto;
    z-index: 99;
}
```

## Asset Files
- **Child**: `assets/poses/new-story/flying.png`
- **Tiger**: `assets/poses/new-story/tiger-flying.png`

## Implementation Notes

### Test Page
- File: `test-pages/page14-test.html`
- Tiger character added as separate div after main character
- Tiger positioned with inline styles (not controlled by position panel)
- Both characters use 450px width for visual balance

### Documentation Updated
- ✅ `test-pages/CHARACTER_POSITIONS.md` - Updated Page 14 section
- ✅ `docs/WORKFLOW_CSS_INTEGRATION.md` - Added tiger layout data and implementation guide
- ✅ `test-pages/CHARACTER_POSITIONS_FOR_WORKFLOW.txt` - Regenerated with tiger data

### Workflow Integration
The n8n workflow needs to:
1. Add `tiger` property to layout data for page 14
2. Conditionally render tiger div when `pageNumber === 14`
3. Use tiger-flying.png from R2 storage

Example code for workflow:
```javascript
// In getPageLayout() function
14: { 
  character: { 
    position: 'right: -5%; top: -5%; transform: scaleX(1);',
    width: 450
  },
  tiger: { 
    position: 'right: 15%; top: 18%;',
    width: 450
  }
}

// In HTML template (after character div)
${pageData.currentPageNumber === 14 ? 
  `<div class="tiger-character" style="position: absolute; ${layout.tiger?.position}; width: ${layout.tiger?.width}px; height: auto; z-index: 99;">
    <img src="https://little-hero-assets.r2.cloudflarestorage.com/characters/tiger-flying.png" alt="Tiger Guide">
  </div>` : ''
}
```

## Visual Composition
- Child: Upper right corner, slightly off-page (dynamic flying pose)
- Tiger: Positioned to the left and below child (15% from right, 18% from top)
- Both at 450px width for visual harmony
- Tiger at z-index 99 (behind child at z-index 100)

This creates a cohesive scene of both characters flying home together through the starry sky.

