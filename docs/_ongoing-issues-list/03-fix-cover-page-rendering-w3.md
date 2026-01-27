# Issue: Fix Cover Page Rendering Issues in W3

**Status:** 🔴 Open  
**Priority:** Medium  
**Created:** 2026-01-27  
**Last Updated:** 2026-01-27

## Description

Cover page rendering issues in W3 (PDF assembly workflow). Specific issues need to be identified and documented, but this is a known problem area.

## Impact

- Cover pages may not render correctly in final PDF
- Customer-facing quality issues
- Potential print production problems

## Potential Issues to Investigate

1. **Cover image placement/sizing**
   - Character image positioning
   - Background image handling
   - Text overlay positioning

2. **Cover vs interior page differences**
   - Different rendering logic for cover vs interior pages
   - Template differences not properly handled

3. **Asset references**
   - Cover images not found/loaded correctly
   - R2 key paths incorrect for cover
   - Manifest data structure differences for cover

4. **Layout/spacing issues**
   - Margins incorrect
   - Bleed areas not handled
   - Print specifications not met

## Affected Files

- `docs/n8n-workflow-files/finals/w3-AMAZON-PNG_Assembly.json`
- `docs/n8n-workflow-files/finals/w3-PNG_Assembly.json`
- Renderer code (if separate from n8n)
- `back-end/src/app/api/webhooks/workflow-3-complete/route.ts`

## Investigation Needed

1. **Identify specific symptoms:**
   - What exactly is wrong with cover rendering?
   - Is it consistent or intermittent?
   - Does it affect all orders or specific cases?

2. **Compare cover vs interior:**
   - How does cover rendering differ from interior pages?
   - Are there different code paths?
   - Are there different manifest fields?

3. **Check manifest structure:**
   - How is cover data stored in manifests?
   - Is cover entry different from interior page entries?
   - Are cover assets referenced correctly?

4. **Review renderer logic:**
   - Cover-specific rendering code
   - Template differences
   - Asset loading for cover

## Related Issues

- Issue #02: Upsert/Manifest system (cover data may not be in manifest correctly)
- Issue #01: 2B workflow (cover character image may depend on 2B manifest)

## Notes

- Need more specific details about what's wrong with cover rendering
- May be related to manifest data structure
- Could be renderer-specific issue vs workflow issue

## Resolution (2026-01-27)

**Fixed:** Applied the same `useImgBackgrounds` flag support that was added to interior pages to both cover page generation nodes (AMAZON and STANDARD).

### Changes Applied

1. **Added `useImgBackgrounds` flag support:**
   - Defaults to `true` (more reliable in PDFMonkey)
   - Can be explicitly set to `false` if needed
   - Reads from `orderCtx.useImgBackgrounds` or `renderCtx.useImgBackgrounds`

2. **Added URL normalization and cache-busting helpers:**
   - `toAbsoluteAsset()` - converts relative paths to absolute URLs
   - `withBust()` - adds cache-busting query parameters
   - `norm()` - combines both functions

3. **Added conditional layer functions:**
   - `preloadHTML()` - preloads images when using `<img>` tags
   - `coverBgLayerHTML()` - conditionally uses CSS `background-image` or `<img>` tag for cover background
   - `coverPoseLayerHTML()` - conditionally uses CSS `background-image` or `<img>` tag for character pose

4. **Updated HTML generation:**
   - Replaced hardcoded CSS `background-image` with conditional layer functions
   - When `useImgBackgrounds === true`: uses `<img>` tags (more reliable)
   - When `useImgBackgrounds === false`: uses CSS `background-image` (fallback)

### Files Modified

- `docs/n8n-workflow-files/finals/w3-AMAZON-PNG_Assembly.json`
  - `Generate Cover HTML (AMAZON)` node
  - `Generate Cover HTML (STANDARD)` node

### Testing Needed

- Verify cover pages render correctly in PDFMonkey with `useImgBackgrounds=true`
- Test fallback behavior with `useImgBackgrounds=false`
- Confirm character image (pose00) and cover background both render properly
