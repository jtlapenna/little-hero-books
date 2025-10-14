# Test Pages - Character Positioning & Lighting

## Overview
This directory contains interactive HTML test pages for positioning characters and adjusting lighting on each book page.

## Features
- **Character Positioning**: Adjust right/top positioning and width
- **Horizontal Flip**: Mirror character images
- **Custom Gradient Lighting**: Two-color gradient with direction control
- **Blend Modes**: Multiple options for lighting effects (overlay, multiply, soft-light, etc.)
- **Copy CSS**: Export positioning and lighting settings as CSS

## Page Status

### ✅ **Created & Ready**
- **Page 01** - Twilight Walk (walking.png)
- **Page 02** - Night Forest (walking-looking-higher.png)
- **Page 03** - Magic Doorway (looking.png)
- **Page 04** - Courage Leap (floating.png)
- **Page 05** - Morning Meadow (walking-looking-down.png)
- **Page 06** - Tall Forest (jogging.png)

### 🔨 **To Be Created**
- **Page 07** - Mountain Vista (looking.png)
- **Page 08** - Picnic Surprise (sitting-eating.png)
- **Page 09** - Beach Discovery (crouching.png)
- **Page 10** - Crystal Cave (crawling-moving-happy.png)
- **Page 11** - Giant Flowers (surprised-looking-up.png)
- **Page 14** - Flying Home (hands-up-excited.png)

### ⏳ **Pending Assets**
- **Page 12** - Enchanted Grove (TBD - image and pose not yet created)
- **Page 13** - Animal Reveal (TBD - will use animal guide asset + character pose)

## Usage

### Running the Test Server
```bash
cd test-pages
node server.js
```

Then open: `http://localhost:3000/pageXX-test.html`

### Positioning Workflow
1. Open a page in your browser
2. Adjust position sliders (right %, top %, width px)
3. Toggle "Flip Horizontal" if character faces wrong direction
4. Adjust lighting gradient:
   - Choose gradient direction
   - Set start/end colors and opacities
   - Select blend mode
5. Click "Copy CSS" to export settings
6. Paste CSS into n8n workflow or renderer template

## Page Mappings

| Page | Background | Pose | Scene |
|------|-----------|------|-------|
| 01 | page01-twilight-walk.png | walking.png | Twilight walk in hometown |
| 02 | page02-night-forest.png | walking-looking-higher.png | Walking through night forest |
| 03 | page03-magic-doorway.png | looking.png | Standing at magical doorway |
| 04 | page04-courage-leap.png | floating.png | Floating through starlit sky |
| 05 | page05-morning-meadow.png | walking-looking-down.png | Landing in sunny meadow |
| 06 | page06-tall-forest.png | jogging.png | Walking through giant trees |
| 07 | page07-mountain-vista.png | looking.png | At mountain vista |
| 08 | page08-picnic-surprise.png | sitting-eating.png | Sitting at picnic |
| 09 | page09-beach-discovery.png | crouching.png | Crouching on beach |
| 10 | page10-crystal-cave.png | crawling-moving-happy.png | Exploring crystal cave |
| 11 | page11-giant-flowers.png | surprised-looking-up.png | Looking up at giant flowers |
| 12 | page12-enchanted-grove.png | TBD | Grove before reveal |
| 13 | page13-animal-reveal.png | TBD | Meeting animal guide |
| 14 | page14-flying-home.png | hands-up-excited.png | Flying home together |

## Technical Notes

- **Page Dimensions**: 8.5" × 8.5" @ 300 DPI
- **Test View Dimensions**: 12" × 8.5" (book area + 3.5" control panel)
- **Text Box**: 65% width, 3% from bottom, standard overlay
- **Font**: CustomFont (with Arial fallback), 14px, 1.2 line-height
- **Character Lighting**: CSS gradient with mask-image clipping to character shape
- **Flip Feature**: Uses `transform: scaleX(-1)` for horizontal mirroring

## Next Steps

1. Complete remaining test pages (07-11, 14)
2. Generate page 12 background and pose
3. Determine page 13 character pose for reveal scene
4. Position characters on all pages
5. Export final CSS for workflow integration
6. Test with full n8n workflow

