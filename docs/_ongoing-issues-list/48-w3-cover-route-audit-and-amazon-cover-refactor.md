# 48 - W3 cover route audit and Amazon cover refactor

## Status
🟢 Implemented in W3 cover route and live PNG templates

## Implementation update (2026-03-16)

The original plan assumed the Amazon title and byline would remain dynamic HTML. During implementation, the live Amazon background asset was verified directly and the current `page00-covers-barcode.jpg` already includes:

- `FINDING OUR INNER VOICE`
- `By Little Hero Labs`

That means rendering those two lines again in HTML causes visible duplication on the Amazon front cover. The implemented contract therefore differs slightly from the original plan:

- D2C remains fully dynamic on the front cover, with shrink-to-fit applied only to the possessive child-name line.
- Amazon now treats the fixed title and byline as part of the cover art.
- Amazon HTML/CSS/JS render only the dynamic personalization block:
  - `A Story Made for`
  - child name with one-line shrink-to-fit behavior

The long-name fitting requirement is still satisfied on both routes. The only change is that Amazon's fixed title/byline are now sourced from the cover image rather than live HTML text.

## Summary

W3 currently owns the cover HTML markup, but it does not fully own the cover presentation behavior.

For the cover PNG render, W3 builds `coverHTML` inside the workflow, then sends only `pages_html` to the PDFMonkey cover template. That means the workflow can and should be updated for the new Amazon cover structure, but the final CSS/JS behavior for positioning, dynamic font fitting, and one-line overflow control still depends on the live PDFMonkey PNG template unless those concerns are moved inline into the generated HTML.

The live Amazon PDFMonkey template has now been reviewed directly. It already contains Amazon-specific selectors, but it still relies on fixed font sizes, a single centered/scaled front-text wrapper, and no JS-driven name fitting. This issue documents what must change in the W3 workflow itself to support the new Amazon cover comps, and what still has to change in the PDFMonkey template to make the new layout behave correctly.

## Current W3 cover route

The current W3 cover branch works like this:

1. `Normalize Inputs (3A Phase 1)1`
   - trims and clamps text inputs
   - currently clamps `childName` to 40 characters

2. `Resolve Asset Paths (3A Phase 1)1`
   - resolves `coversBg`, `coversBgAmazon`, `blankBg`, `titlePageBg`, `dedicationBg`, and character asset paths

3. `Route Cover by Order Type (Amazon vs Standard)`
   - sends Amazon orders to `Generate Cover HTML (AMAZON)`
   - sends non-Amazon orders to `Generate Cover HTML (STANDARD)`

4. `Generate Cover HTML (AMAZON)` / `Generate Cover HTML (STANDARD)`
   - generates the cover spread HTML snippet directly in workflow code
   - hardcodes a PNG cover template ID per branch

5. `Set Cover PNG Filenames/Keys`
   - normalizes the cover HTML into `cover_html`
   - reselects the template ID from input fields or fallback defaults

6. `Generate Cover Image with PDFMonkey (3A)1`
   - sends the PNG cover render request
   - currently sends only `pages_html` in the payload

7. `Poll Cover Image (3A)1` / `Download Cover Image (3A)1` / `Upload Cover Preview Image to R2 (3A)1`
   - polls the rendered PNG
   - downloads it
   - uploads it to `preview-images/cover-spread.png`

## Live Amazon PDFMonkey template review

The live Amazon PNG cover template is not generic. It already contains Amazon-specific CSS, including:

- `.front-title-wrap--amazon`
- `.front-title--amazon`
- `.front-title-lines`
- `.front-title-line-1`
- `.front-title-line-2`
- `.front-byline`
- `.front-story-line`

Important implications from the reviewed template:

- the Amazon front cover is currently driven by one centered wrapper, `front-title-wrap--amazon`
- that wrapper uses fixed positioning, fixed width, and transform-based scaling/offsets
- title sizing is fixed through CSS variables and fixed pixel font sizes
- there is no dedicated child-name selector
- there is no `white-space: nowrap` strategy for a long child name
- there is no JS or other measurement-based fit logic

Current template values that matter:

- `front-title-wrap--amazon` is `width: 1800px`
- `front-title-wrap--amazon` is positioned with `left: calc(5203px * 0.76)` and `top: 945px`
- `front-title-wrap--amazon` uses `transform: translateX(-50%) scale(0.8) translateY(-80px)`
- `.front-title-line-1` and `.front-title-line-2` use `font-size: var(--front-name-size)` where `--front-name-size` is currently `280px`
- `.front-byline` is `120px`
- `.front-story-line` is `140px`

That means the current live template is already partially structured for a richer Amazon layout, but it is still not aligned with the planned design:

- the new comps show a separate title block and byline near the top of the front cover
- the new comps show `A Story Made for` separated from the child name
- the child name needs its own font-size logic
- the `A Story Made for` line needs to move relative to the final fitted child-name size

## Audit findings

### 1. W3 already owns the Amazon cover markup

The Amazon cover route is not a raster title image. It is generated HTML in the workflow.

Current Amazon front-cover markup is only one text block:

- `A Story Made for [Child Name]`

That means the new Amazon layout can be implemented by changing the workflow node that builds the cover HTML.

### 2. W3 does not currently own the final cover CSS/JS behavior

Unlike interior-page rendering, the cover route does not send a `page_css`-style payload field. It sends only `pages_html`.

As a result:

- the workflow can change the DOM structure
- the workflow can add inline wrappers, classes, styles, and data attributes
- but the current positioning and typography behavior still depends on the live PDFMonkey cover template unless CSS/JS is embedded inline in the generated `coverHTML`

This is the main architectural constraint for the refactor.

### 3. The current Amazon cover HTML is too simple for the new comps

The new comps require distinct front-cover elements:

- book title
- byline
- `A Story Made for`
- child name

The current Amazon route collapses the front copy into one line and does not emit separate elements for those pieces, so it cannot reproduce the new design without changing the workflow markup.

### 4. The current live Amazon template is partially reusable, but the current W3 HTML does not take advantage of it

The reviewed template already includes selectors for:

- separate title lines
- a byline
- a story line

But the current Amazon workflow HTML does not emit those elements. It only emits `.front-story-line`, and that one element contains both:

- `A Story Made for`
- the child name

So even though the template has some Amazon-specific CSS scaffolding already, the workflow markup is still too flat to support the planned layout.

### 5. The current workflow and template together cannot guarantee one-line fit for long names

`Normalize Inputs (3A Phase 1)1` currently truncates `childName` to 40 characters.

That clamp is a blocker for the new Amazon cover behavior because:

- it can silently alter the displayed child name before fitting logic runs
- it does not solve layout fit
- it prevents accurate testing of the actual long-name behavior

Also, the reviewed live template still uses:

- fixed front text sizing
- a fixed `1800px` Amazon front text area
- no separate child-name element
- no `nowrap` fit behavior
- no JS-based shrink loop

So the current system cannot satisfy the new long-name requirement without both workflow and template changes.

### 6. The current Amazon template positioning model is not a good fit for the planned comp

The current Amazon template positions the front text by scaling and shifting one wrapper:

- `scale(0.8)`
- `translateX(-50%)`
- `translateY(-80px)`

That is acceptable for the current simple centered text treatment, but it is a poor base for the planned comp because:

- the title and byline need to move to a different visual region than the child name
- the personalization block needs to respond to fitted name size
- transform-based global scaling makes exact type placement harder to reason about

For the new design, the Amazon front cover should be split into separate positioned regions instead of trying to drive everything from one transformed wrapper.

### 7. Template IDs are hardcoded inside the W3 cover branches

Current W3 cover template IDs are hardcoded in the cover HTML nodes:

- standard PNG cover route uses `D0F07D93-9267-47BB-A6AF-D6EC5ACDF476`
- Amazon PNG cover route uses `8DB1D274-AA3C-4E14-B051-65B6F872B013`

That is fragile because:

- the template selection logic is duplicated
- template IDs are not sourced from a single config authority
- book config and W4 use a different cover template ID path, which creates drift risk even if the PNG/PDF templates are intentionally different

### 8. The same cover-route logic exists in both final and sibling W3 workflows

The sibling W3 export duplicates the same cover architecture and nearly the same node code.

If the Amazon cover route is refactored in W3, the same workflow-side changes must also be applied to:

- the main W3 workflow export
- the sibling-order W3 workflow export

### 9. The Amazon title page image is separate from the cover route

`page00-title-page.png` is an interior-page asset used by the Amazon page plan. It is not the Amazon cover route itself.

This matters because the cover refactor should target the cover branch only and should not be conflated with the Amazon title page.

## Workflow changes required

### 1. Update `Normalize Inputs (3A Phase 1)1`

Required changes:

- remove or materially relax the `childName` 40-character clamp
- preserve the real child name so the cover route can fit the actual string
- keep existing trimming/sanitization

Recommended shape:

- keep `inputs.childName`
- optionally add a second explicit field if needed later, such as `inputs.childNameDisplay`

Goal:

- the cover route should receive the real child name, not a truncated surrogate

### 2. Rebuild `Generate Cover HTML (AMAZON)`

This is the primary workflow node that must change.

Required changes:

- replace the single combined front text line with structured markup
- stop putting the child name inside `.front-story-line`
- emit separate elements for:
  - title
  - byline
  - story-prefix line
  - child name
- move those elements to the new comp positions
- preserve the existing background, character, logo overlay, and back-cover content unless intentionally redesigning them too

Recommended front-cover DOM shape for the new plan:

```html
<div class="front-amazon-header">
  <div class="front-book-title">FINDING OUR INNER VOICE</div>
  <div class="front-book-byline">By Little Hero Labs</div>
</div>

<div class="front-amazon-personalization">
  <div class="front-story-line">A Story Made for</div>
  <div
    class="front-child-name"
    data-fit-to-width="true"
    data-min-font-size="60"
    data-max-font-size="120"
  >
    LUCA
  </div>
</div>
```

The exact class names can vary, but the workflow should emit a stable semantic structure that the template CSS/JS can target.

Important note:

- the current live template already has `.front-story-line`, so that selector can likely be retained
- the child name still needs a new dedicated element and style target
- title and byline should become their own positioned block rather than sharing the current centered/scaled Amazon wrapper

### 3. Decide where the dynamic font-fit logic lives

This is the most important design decision in the refactor.

Two viable approaches:

#### Preferred: keep W3 responsible for semantic HTML, move fit behavior to the live PDFMonkey PNG cover template

Workflow changes:

- emit semantic wrappers and data attributes
- pass any needed sizing hints as inline CSS variables or `data-*` attributes
- ensure the child name is isolated in its own element so only that line is resized

Why this is preferred:

- cleaner separation of concerns
- easier to iterate on typography/layout without re-editing workflow code
- matches the current architecture, where cover template styling already lives outside the workflow

#### Alternative: embed cover-specific `<style>` and `<script>` directly inside `coverHTML`

Workflow changes:

- inject the CSS and JS inline into the generated HTML snippet
- include the fit loop in the generated markup itself

Risks:

- depends on what the live PDFMonkey template allows or sanitizes
- makes the workflow node larger and harder to maintain
- increases duplication between main and sibling W3 workflows

### 4. Update `Generate Cover Image with PDFMonkey (3A)1` only if the chosen strategy requires it

If the refactor uses the existing external cover template:

- this node may not need structural changes
- it can keep sending `pages_html`

If the refactor needs more explicit payload-driven styling:

- add extra payload fields instead of hiding everything in one HTML string
- example candidates:
  - `front_name`
  - `front_name_min_font_size`
  - `front_name_max_font_size`
  - `cover_variant`

At minimum, this node should be reviewed so the chosen HTML/CSS/JS strategy is explicit rather than accidental.

### 5. Clean up template ID sourcing

Required workflow cleanup:

- stop hardcoding template IDs separately inside the cover HTML branch nodes
- centralize template selection in one place
- make it obvious which template is the Amazon PNG cover template and which is the standard PNG cover template

Good options:

- source the IDs from upstream config before the branch
- or centralize the final selection in `Set Cover PNG Filenames/Keys`

Avoid:

- one hardcoded ID in `Generate Cover HTML (AMAZON)`
- another hardcoded ID in `Generate Cover HTML (STANDARD)`
- then a second fallback layer in `Set Cover PNG Filenames/Keys`

### 6. Mirror the same changes into the sibling W3 workflow export

The sibling workflow has the same cover route and should not be allowed to drift.

Required outcome:

- main W3 export and sibling W3 export must be updated together

## Likely non-workflow work

These items are probably required, but they are not strictly workflow edits:

- update the live PDFMonkey PNG cover template CSS
- enable or verify JavaScript injection in that template if dynamic shrink-to-fit is implemented there
- add JS that reduces the child-name font size until it fits on one line
- reposition the `A Story Made for` line based on the final fitted name size if needed

Specific template changes now indicated by the reviewed CSS:

- stop relying on the current `front-title-wrap--amazon` transform-based centered block for all front text
- create separate layout regions for:
  - top title/byline
  - lower personalization block
- keep `A Story Made for` as its own element instead of combining it with the child name
- add a dedicated `.front-child-name` selector
- add `white-space: nowrap` and width constraints to the child-name element
- add fit logic that reduces child-name font size from a large default down to a floor when necessary
- expose the fitted result to CSS, either by:
  - setting an inline font size on the child-name element
  - setting a CSS variable such as `--fitted-child-name-size`
  - adding a size-tier data attribute or class
- use the fitted result to adjust the vertical spacing or position of the `A Story Made for` line

The reviewed template also suggests one more cleanup:

- either remove the unused two-line-title assumption for Amazon, or deliberately reuse it

Right now the template supports `.front-title-line-1` and `.front-title-line-2`, but the new comp appears to want a single title line at the top of the front cover. Workflow and template should agree on that structure instead of carrying both models indefinitely.

Without that template-side work, W3 can generate better markup but still cannot guarantee the final visual behavior.

## Relevant files

Primary workflow files:

- `docs/n8n-workflow-files/finals/w3-Book-Assembly.json`
- `docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING - w3-Book-Assembly.json`

Related config:

- `back-end/src/lib/books/configs/book-mvp-simple-adventure/v1.json`

Historical reference:

- `docs/n8n-workflow-files/archive/old-cover-png-css.css`

Unversioned but confirmed runtime dependency:

- live PDFMonkey Amazon PNG cover template CSS

Related downstream cover-PDF config path:

- `docs/n8n-workflow-files/finals/w4-PRODUCTION-Print_Fulfillment.json`

## Open questions

- Will the new Amazon cover refactor affect only Amazon, or should the standard cover route be structurally normalized at the same time?
- Should the live PDFMonkey PNG template own the font-fit JS, or should W3 inline that JS into the generated `coverHTML`?
- Should template IDs become part of book config for W3 PNG generation, or remain workflow-managed but centralized?
- Is the current background art fully text-free, or are any legacy title placements still baked into image assets?

## Acceptance criteria

- [ ] W3 cover-route architecture is documented clearly enough that a maintainer can tell what is workflow-owned vs template-owned
- [ ] `Normalize Inputs (3A Phase 1)1` no longer blocks long-name fitting by truncating the display name prematurely
- [ ] `Generate Cover HTML (AMAZON)` emits semantic markup for the new Amazon cover layout
- [ ] The workflow makes room for dynamic one-line child-name fitting instead of concatenating all front copy into one element
- [ ] The Amazon live template no longer depends on one centered/scaled text wrapper for all front text
- [ ] The child name has a dedicated one-line fit system with a defined max and min font size
- [ ] Cover template ID selection is centralized and no longer duplicated across multiple branch nodes
- [ ] The sibling W3 workflow is kept in sync with the main W3 cover-route refactor
- [ ] The implementation path for template-side CSS/JS updates is explicitly defined, not left implicit
