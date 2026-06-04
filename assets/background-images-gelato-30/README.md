# Gelato 30 Background Images

This folder is the ordered production handoff set for the Gelato 30-page version of `Finding Our Inner Voice`.

- `gelato-p01` through `gelato-p30` are the printable interior page backgrounds in story order.
- `page-order.tsv` maps each Gelato page to its source asset and whether it is existing or new.
- `gelato-p28-p29-spiral-activity-spread-master.jpg` keeps the unsplit generated spiral master.
- `gelato-p28-p29-spiral-activity-spread-cropped-square-master.jpg` is the center-cropped 2-square master used to split pages 28 and 29.
- `gelato-p28-spiral-activity-left.jpg` and `gelato-p29-spiral-activity-right.jpg` are the square page assets Jeff should use if the renderer expects one background per page.

Technical notes:

- New single-page backgrounds are `4096 x 4096` JPEGs.
- Existing production backgrounds are mostly `2625 x 2625` JPEGs with 300 DPI metadata.
- The original dedication asset is `2048 x 2048` and should be reviewed if Jeff needs every page above the Gelato full-bleed target before layout.
- Generated images have undefined DPI metadata; Jeff should set/place final rendered pages at the Gelato production dimensions and 300 DPI during export.
- Do not bake text, child art, selected animal art, or animal tracks into these backgrounds unless the page already did so in the current workflow.
