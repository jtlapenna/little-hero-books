# CSS Integration Guide for n8n Workflow

## Overview
This document explains how to integrate the finalized character positioning CSS from `test-pages/CHARACTER_POSITIONS.md` into the n8n workflow `3-book-assembly-proper-text-box.json`.

## Where to Apply the CSS

**Target File**: `docs/n8n-workflow-files/n8n-new/3-book-assembly-proper-text-box.json`

**Target Node**: "Generate Page HTML" (node id: 6)

**Target Function**: The `functionCode` parameter contains JavaScript that needs to be updated in **two places**:

### 1. Update `getPageLayout()` Function

**Location**: Near the bottom of the "Generate Page HTML" node's `functionCode`

**Current Code** (lines ~250-280 in the function):
```javascript
function getPageLayout(pageNumber) {
  const layouts = {
    1: { // Garden path twilight
      character: { position: 'right: 5%; top: 15%;', width: 300 },
      footprint: { position: 'bottom: 10%; left: 20%;', width: 150 },
      animal: { position: 'right: 10%; top: 30%;', width: 200 }
    },
    // ... only 4 pages defined ...
  };
  return layouts[pageNumber] || layouts[1];
}
```

**Replace With** (from `test-pages/CHARACTER_POSITIONS_FOR_WORKFLOW.txt`):
```javascript
function getPageLayout(pageNumber) {
  const layouts = {
    1: { // Twilight Walk
      character: { 
        position: 'right: -36%; top: 7%; transform: scaleX(1);',
        width: 350
      }
    },
    2: { // Night Forest
      character: { 
        position: 'right: -35%; top: 18%; transform: scaleX(-1);',
        width: 300
      }
    },
    3: { // Magic Doorway
      character: { 
        position: 'right: -19%; top: 15%; transform: scaleX(-1);',
        width: 350
      }
    },
    4: { // Courage Leap
      character: { 
        position: 'right: -30%; top: -2%; transform: scaleX(1) rotateZ(-15deg);',
        width: 390
      }
    },
    5: { // Morning Meadow
      character: { 
        position: 'right: -31%; top: 14%; transform: scaleX(-1);',
        width: 300
      }
    },
    6: { // Tall Forest
      character: { 
        position: 'right: -32%; top: 13%; transform: scaleX(1);',
        width: 300
      }
    },
    7: { // Mountain Vista
      character: { 
        position: 'right: -26%; top: -4%; transform: scaleX(-1);',
        width: 350
      }
    },
    8: { // Picnic Surprise
      character: { 
        position: 'right: -30%; top: 0%; transform: scaleX(1);',
        width: 490
      }
    },
    9: { // Beach Discovery
      character: { 
        position: 'right: -25%; top: 8%; transform: scaleX(-1);',
        width: 400
      }
    },
    10: { // Crystal Cave
      character: { 
        position: 'right: -18%; top: 13%; transform: scaleX(-1);',
        width: 500
      }
    },
    11: { // Giant Flowers
      character: { 
        position: 'right: -57%; top: 24.5%; transform: scaleX(1);',
        width: 200
      }
    },
    12: { // Enchanted Grove
      character: { 
        position: 'right: -14%; top: 15%; transform: scaleX(-1);',
        width: 350
      }
    },
    13: { // Animal Reveal
      character: { 
        position: 'right: -25%; top: 5%; transform: scaleX(1);',
        width: 390
      }
    },
    14: { // Flying Home
      character: { 
        position: 'right: -5%; top: -5%; transform: scaleX(1);',
        width: 450
      },
      tiger: { 
        position: 'right: 15%; top: 18%;',
        width: 450
      }
    }
  };
  return layouts[pageNumber] || layouts[1];
}
```

### 2. Update the Character CSS in HTML Template

**Location**: In the `<style>` section of the HTML template (lines ~100-120 in the function)

**Current Code**:
```css
.character {
  position: absolute;
  ${layout.character.position};
  width: ${layout.character.width}px;
  height: auto;
  z-index: 100;
}
```

**This is already correct!** The dynamic `${layout.character.position}` will now include the `transform` property.

### 3. Add Lighting Gradient System

The current workflow uses CSS filter-based lighting. However, our test pages use a gradient overlay system. You have **two options**:

#### Option A: Keep CSS Filters (Simpler, Already Implemented)
- The current `getLightingClass()` function applies hue-rotate, saturate, brightness filters
- This works well and is already in the workflow
- **No changes needed**

#### Option B: Use Gradient Overlay System (Matches Test Pages Exactly)
- Replace the CSS filter system with the gradient `::before` pseudo-element approach
- This matches the test pages exactly but is more complex
- See `test-pages/page01-test.html` for the full implementation

**Recommendation**: Start with Option A (CSS filters) since it's already implemented and works well. The gradient system can be added later if needed for more precise color matching.

## Additional Changes Needed

### Update Total Pages
**Location**: Node 1 "Get Order Ready for Assembly", line 11

**Change**:
```javascript
totalPagesRequired: 4, // 4 pages for testing
```

**To**:
```javascript
totalPagesRequired: 14, // Full book (change to 4 for testing)
```

### Update Character Pose Loading
**Location**: Node 2 "Load Generated Characters", line 21

**Change**:
```javascript
for (let i = 1; i <= 4; i++) {
```

**To**:
```javascript
for (let i = 1; i <= 14; i++) {
```

### Update Background Loading
**Location**: Node 3 "Load Background Images", line 31

**Change**:
```javascript
for (let i = 1; i <= 4; i++) {
```

**To**:
```javascript
for (let i = 1; i <= 14; i++) {
```

### Update Story Text
**Location**: Node 4 "Load Story Text"

The `getStoryText()` function needs to be updated with the actual story from `docs/new-planning/STORY-footprints_of_wonder.md` for all 14 pages.

### Update Pose File Names
The workflow needs to know which pose file to use for each page. This mapping should be added:

```javascript
function getPoseFileName(pageNumber) {
  const poses = {
    1: 'walking.png',
    2: 'walking-looking-higher.png',
    3: 'looking.png',
    4: 'floating.png',
    5: 'walking-looking-down.png',
    6: 'jogging.png',
    7: 'looking.png',
    8: 'sitting-eating.png',
    9: 'crouching.png',
    10: 'crawling-moving-happy.png',
    11: 'surprised-looking-up.png',
    12: 'surprised.png',
    13: 'tiger-appears.png', // Note: This is the animal guide, not the child
    14: 'flying.png'
  };
  return poses[pageNumber] || 'walking.png';
}
```

### Add Tiger Guide Overlay for Page 14

Page 14 requires **two characters** flying together. The HTML template in the workflow needs to conditionally add the tiger guide:

**In the HTML template section**, after the main character div, add:

```javascript
${pageData.currentPageNumber === 14 ? 
  `<div class="tiger-character" style="position: absolute; ${layout.tiger?.position || 'right: 15%; top: 18%;'}; width: ${layout.tiger?.width || 450}px; height: auto; z-index: 99;">
    <img src="https://little-hero-assets.r2.cloudflarestorage.com/characters/tiger-flying.png" alt="Tiger Guide">
  </div>` : ''
}
```

This will add the tiger guide only on page 14, positioned according to the layout data.

## Testing

1. **Test with 4 pages first**: Keep `totalPagesRequired: 4` and only update layouts 1-4
2. **Verify positioning**: Check that characters appear in the correct positions
3. **Verify transforms**: Check that flipping (scaleX) and rotation (rotateZ) work correctly
4. **Expand to 14 pages**: Once 4-page test works, expand to full 14 pages

## Files Reference

- **Character Positions**: `test-pages/CHARACTER_POSITIONS.md`
- **Extracted Data**: `test-pages/CHARACTER_POSITIONS_FOR_WORKFLOW.txt`
- **Test Pages**: `test-pages/page01-test.html` through `page14-test.html`
- **Workflow**: `docs/n8n-workflow-files/n8n-new/3-book-assembly-proper-text-box.json`

## Summary

The main update is replacing the `getPageLayout()` function in the "Generate Page HTML" node with the actual positioning data from our test pages. This will ensure characters are positioned exactly as you've configured them in the test server.

