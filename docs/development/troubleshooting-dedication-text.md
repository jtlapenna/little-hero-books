# Troubleshooting Dedication Text Not Appearing in PNG Images

## Issue
Dedication text is reaching "Generate Complete HTML" but not appearing in the generated PNG images.

## Root Cause Analysis

### Story Text (Working)
- **Source**: `order.storyTexts` array (created in "Load Story & Character Poses (3A)")
- **HTML Structure**: `<div class="text-box"><div class="text-content">${text}</div></div>`
- **CSS**: Likely already exists in PDFMonkey PNG template

### Dedication Text (Not Working)
- **Source**: `inputs.dedicationMessage` from "Normalize Inputs (3A Phase 1)1"
- **HTML Structure**: `<div class="dedication-wrap"><div class="dedication-text">${dedText}</div></div>`
- **CSS**: Needs to be added to PDFMonkey PNG template

## Key Differences

1. **Template ID**: PNG images use template `23277725-4AB0-446A-98C5-CB99C21822B3` (2625x2625px), NOT the PDF template
2. **CSS Units**: PNG template needs **pixel-based** CSS, not inch-based
3. **CSS Location**: The CSS must be in the PNG template itself, not just passed as `page_css`

## Solution Steps

### Step 1: Verify Template ID
Check that you're updating the correct template:
- **PNG Template ID**: `23277725-4AB0-446A-98C5-CB99C21822B3`
- **Template Size**: 2625px × 2625px

### Step 2: Add CSS to PNG Template
Add the dedication styles to the PNG template CSS. See `pdfmonkey-png-template-css.css` for the exact CSS.

**Critical CSS:**
```css
.dedication-wrap {
  position: absolute;
  left: 394px;
  right: 394px;
  top: 525px;
  bottom: 525px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 5;
}

.dedication-text {
  width: 100%;
  text-align: center;
  font-size: 35px;
  line-height: 1.4;
  letter-spacing: 1px;
  color: #312116;
  font-family: 'CustomBook', Arial, sans-serif;
}
```

### Step 3: Verify HTML Structure
The HTML being sent should look like:
```html
<div class="book-page" id="page-0">
  <div class="page-bg" style="background-image:url('...');"></div>
  <div class="dedication-wrap">
    <div class="dedication-text">For our little adventurer on her 5th birthday!</div>
  </div>
</div>
```

### Step 4: Debug Checklist

1. **Check if `dedicationMessageRaw` has a value**:
   - In "Generate Complete HTML" node, verify `inputs.dedicationMessage` is not empty
   - Check "Normalize Inputs (3A Phase 1)1" output

2. **Check if HTML is generated**:
   - Look at "Generate Complete HTML" output
   - Verify `interiorPagesHTML[0]` contains the dedication HTML

3. **Check if CSS is in template**:
   - Log into PDFMonkey
   - Edit template `23277725-4AB0-446A-98C5-CB99C21822B3`
   - Verify `.dedication-wrap` and `.dedication-text` styles exist

4. **Check z-index**:
   - `.dedication-wrap` has `z-index: 5`
   - `.page-bg` might need lower z-index or `.dedication-wrap` needs higher

5. **Check font loading**:
   - Verify CustomBook font is loading
   - Check browser console for font loading errors

### Step 5: Test with Inline Styles (Temporary)
If template CSS still doesn't work, temporarily add inline styles to verify positioning:

```html
<div class="dedication-wrap" style="position:absolute;left:394px;right:394px;top:525px;bottom:525px;display:flex;align-items:center;justify-content:center;z-index:5;">
  <div class="dedication-text" style="width:100%;text-align:center;font-size:35px;line-height:1.4;color:#312116;font-family:'CustomBook',Arial,sans-serif;">
    For our little adventurer on her 5th birthday!
  </div>
</div>
```

## Files Reference
- **PNG Template CSS**: `docs/pdfmonkey-png-template-css.css`
- **PDF Template CSS**: `docs/pdfmonkey-template-css-updated.css` (different template!)

