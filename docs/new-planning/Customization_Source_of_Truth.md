# Customization Source of Truth

Authoritative list of customer-facing personalization fields and allowed values. Keep this file updated when options change.                                    

## Required Fields
- **Child's Name**: text, 1–20 chars (letters/spaces/hyphens)
- **Age**: 3–8 (UI may show 3–7 in some docs; normalize to 3–8)
- **Hair Style** (from assets/hair-references):
  - afro, bun, curly-long, curly-medium, curly-short, pigtails, pom-poms, ponytail, side-part, straight-long, straight-medium, straight-short                   
- **Hair Color** (IDs and hex):
  - blonde (#D1B26F)
  - strawberry-blonde (#E6A273)
  - light-brown (#A4754A)
  - medium-brown (#7B4B2A)
  - dark-brown (#523418)
  - auburn (#8B3F2C)
  - black (#2B2B2B)
  - red (#C25E2E)
- **Skin Tone** (canonical IDs inferred from base assets; uses image swatches, not hex codes):
  - skin-light, skin-medium, skin-tan, skin-brown-light, skin-brown-deep
  - Note: Skin tones are handled via image swatches in the workflow rather than hex codes. If hex codes are needed for reference, they should be extracted from the base character images.
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
- **Favorite Food**: free text (≤30 chars)
- **Hometown**: free text (default "Adventure City")
- **Occasion**: birthday, holiday, milestone, general
- **Dedication**: free text (≤200–500 chars; UI cap 200 recommended)
- **Pronouns**: she/her, he/him, they/them (default they/them)

## Canonicalization Rules (implementation)
- Skin Tone input → canonical IDs:
  - Light → skin-light; Medium → skin-medium; Tan/Olive → skin-tan; Brown/Light → skin-brown-light; Brown/Deep → skin-brown-deep; default = skin-medium         
- Clothing Style input → canonical IDs:
  - Any dress-like → dress; else → tee‑shorts
- Favorite Color input → normalized label + hex via renderer color map

## Cross‑system mappings
- Amazon Custom → Internal
  - childName → name
  - hairColor → hair (maps to hair color IDs above)
  - hairStyle → hairStyle (matches hair-references names above)
  - skinTone → skin (maps to canonical IDs)
  - favoriteColor → favorite_color
  - animalGuide → favorite_animal
  - clothingStyle → clothingType/clothingStyle → canonical
- Renderer Zod (`renderer/src/schema.ts`)
  - hair: enum [black, brown, blonde, red, other]
  - skin: enum [light, medium, dark, olive, tan]
  - options: favorite_animal, favorite_food, favorite_color, hometown, occasion, dedication                                                                     

## Defaults
- favorite_animal: dog
- favorite_food: pizza
- favorite_color: blue
- hometown: Adventure City
- occasion: general
- pronouns: they/them

## Open Items
- Ensure renderer Zod enums are updated to reflect new hair colors/skin tone canonical IDs                                                                      
- Confirm any additional hair styles or color variants before launch
- Validate order ingestion maps to these IDs consistently across workflows

## References
- assets/hair-references/
- assets/poses/animals/
- assets/poses/bases/
- docs/amazon/amazon-custom-listing-spec.md
- docs/AMAZON_LISTING_FINAL.md
- renderer/src/schema.ts
- data/order-model.js
- docs/n8n-workflow-files/finals/SW0 - Base Character Generation.json
- templates/story-template.js

