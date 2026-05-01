# Customization Source of Truth

Authoritative list of customer-facing personalization fields and allowed values. Keep this file updated when options change.                                    

## Required Fields
- **Child's Name**: text, 1–20 chars (letters/spaces/hyphens)
- **Age**: 0–7
- **Hair Style** (from assets/hair-references):
  - afro, bun, curly-long, curly-medium, curly-short, pigtails, pom-poms, ponytail, side-part, straight-long, straight-medium, straight-short                   
- **Hair Color** (8 colors - tested and working in n8n workflows):
  - blonde (#D1B26F)
  - strawberry-blonde (#E6A273)
  - light-brown (#A4754A)
  - medium-brown (#7B4B2A)
  - dark-brown (#523418)
  - auburn (#8B3F2C)
  - black (#2B2B2B)
  - red (#C25E2E)
- **Skin Tone**:
  - **R2/Internal System** (canonical IDs for asset storage): skin-light, skin-medium, skin-tan, skin-brown-light, skin-brown-deep
  - **Amazon/Renderer** (customer-facing terminology): light, medium, tan, olive, dark
  - **Base Hex Codes** (extracted from base character images):
    - skin-light (#EEC38D)
    - skin-medium (#EBB167)
    - skin-tan (#D19550)
    - skin-brown-light (#B47442)
    - skin-brown-deep (#8A5733)
  - **Note**: Amazon Custom will use renderer terminology (light, medium, etc.). Internal workflows map to R2 canonical IDs (skin-* prefix). Skin tones are handled via image swatches in the workflow, with base hex codes available for reference.
- **Favorite Color** (for clothing accents; renderer map exists):
  - red (#C83f3C)
  - orange (#DB8A2B)
  - yellow (#E2C351)
  - green (#76A355)
  - blue (#4575A5)
  - pink (#D77A8B)
  - purple (#6E5A93)
  - brown (#6B4E38)
  - black (#212327)
- **Animal Guide** (confirmed from assets/poses/animals):
  - dog, cat, owl, lion, tiger, penguin, t-rex, unicorn

## Optional Fields
- **Clothing Style**:
  - Orders (labels): "t-shirt and shorts", "dress"
  - Canonical (internal): tee-shorts, dress
- **Hometown**: free text (default "Adventure City")
- **Dedication**: free text (≤200–500 chars; UI cap 200 recommended)
- **Pronouns**: she/her, he/him, they/them (default they/them)

## Canonicalization Rules (implementation)
- **Skin Tone** (Amazon → R2 Internal):
  - Amazon input (renderer terminology): Light → skin-light; Medium → skin-medium; Tan/Olive → skin-tan; Dark → skin-brown-deep (or map based on context)
  - Default: skin-medium
  - **Note**: Amazon Custom surfaces will show renderer terminology (light, medium, tan, olive, dark). Internal system uses R2 canonical IDs (skin-* prefix) for asset storage.
- **Clothing Style** input → canonical IDs:
  - Any dress-like → dress; else → tee‑shorts
- **Favorite Color** input → normalized label + hex via renderer color map

## Cross‑system mappings
- **Amazon Custom → Internal**:
  - childName → name
  - hairColor → hair (8 colors: blonde, strawberry-blonde, light-brown, medium-brown, dark-brown, auburn, black, red)
  - hairStyle → hairStyle (matches hair-references names above)
  - skinTone → skin (Amazon shows: light, medium, tan, olive, dark → maps to R2: skin-light, skin-medium, skin-tan, skin-brown-light, skin-brown-deep)
  - favoriteColor → favorite_color
  - animalGuide → favorite_animal
  - clothingStyle → clothingType/clothingStyle → canonical

## Defaults
- favorite_animal: dog
- favorite_color: blue
- hometown: Adventure City
- pronouns: they/them

## Amazon Custom Surface Terminology

**For Amazon Custom listing setup**, use these customer-facing terms:

### Skin Tone (Required - Dropdown with Preview Images)
**Amazon Display Options**: Light, Medium, Tan, Olive, Dark  
**Internal R2 Mapping**: 
- Light → `skin-light` (#EEC38D)
- Medium → `skin-medium` (#EBB167)
- Tan → `skin-tan` (#D19550)
- Olive → `skin-tan` (#D19550) (or map based on context)
- Dark → `skin-brown-deep` (#8A5733) (or `skin-brown-light` (#B47442) based on context)

**Base Hex Codes** (extracted from base character images):
- `skin-light`: #EEC38D
- `skin-medium`: #EBB167
- `skin-tan`: #D19550
- `skin-brown-light`: #B47442
- `skin-brown-deep`: #8A5733

**Implementation Note**: Amazon surfaces use renderer terminology (light, medium, etc.). Internal workflows and R2 storage use canonical IDs with `skin-` prefix. The canonicalization function in n8n workflows handles this mapping. Base hex codes are available in `SKIN_TONE_HEX_MAP` for reference.

### Hair Color (Required - Dropdown)
**Amazon Display Options**: All 8 colors (exact names):
- Blonde
- Strawberry Blonde
- Light Brown
- Medium Brown
- Dark Brown
- Auburn
- Black
- Red

**Internal Mapping**: Direct match (no transformation needed)

### Animal Guide (Required - Dropdown)
**Amazon Display Options**: 
- Dog, Cat, Owl, Lion, Tiger, Penguin, T-Rex, Unicorn

**Internal Mapping**: Direct match (lowercase IDs: dog, cat, owl, lion, tiger, penguin, t-rex, unicorn)

**Note**: These are the confirmed available assets. Update any other documentation to match this list.

## Open Items
- Validate order ingestion maps skin tone terminology correctly (Amazon terms → R2 canonical IDs)
- Confirm any additional hair styles or color variants before launch

## References
- assets/hair-references/
- assets/poses/animals/
- assets/poses/bases/
- docs/amazon/amazon-custom-listing-spec.md
- data/order-model.js
- docs/n8n-workflow-files/finals/SW0 - Base Character Generation.json
- templates/story-template.js

