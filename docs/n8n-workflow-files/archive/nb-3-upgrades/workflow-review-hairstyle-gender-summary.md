# Workflow Review: Hairstyle & Gender Implementation Check

## Project Context
Reviewing Little Hero Books n8n workflows to ensure proper implementation of:
1. **New hairstyles** (puffy-ponytail, small-puffy-ponytail)
2. **Existing hairstyle validation** (curly-tight, curly-crop, buzz)
3. **Gender → clothing style mapping** (he/she/they tied to clothing)
4. **Gender pronoun handling** in manifests and story generation

## Required Hair Styles (18 Total)
**Complete list:**
- ponytail, pigtails
- straight-short, straight-medium, straight-long
- curly-short, curly-medium, curly-long
- afro, pom-poms, bun, locs, side-part
- **buzz** ✅
- **curly-crop** ✅
- **curly-tight** ✅
- **puffy-ponytail** ✅ NEW
- **small-puffy-ponytail** ✅ NEW

All 18 PNG assets exist in R2: `book-mvp-simple-adventure/characters/hairstyles/`

## Gender/Pronouns System
**Expected flow:**
1. Order intake captures `pronouns` field (e.g., "he/him", "she/her", "they/them")
2. Gender may influence `clothingStyle` selection (dress vs tee-shorts)
3. Manifests preserve gender/pronouns throughout pipeline
4. W3 (story generation) uses correct pronouns in narrative text

## Workflow Review Status

### ✅ COMPLETE - No Changes Needed

#### W0 - Order Intake & Validation
- **Status:** ✅ Good
- **Findings:** Passes through `pronouns`, `hairStyle`, `clothingStyle` fields
- **Manifest:** Preserves all fields in `1-manifest.json`
- **Notes:** Pure passthrough - no validation/mapping at this stage

#### W1.1 - Queue Manager and Router
- **Status:** ✅ Good
- **Findings:** Routes orders, passes context through
- **Notes:** No hair/gender logic needed - orchestration only

#### SW0 - Base Character Generation
- **Status:** ✅ COMPLETE - All hairstyles implemented
- **Findings:**
  - Node "Resolve Hairstyle Key and Asset Path" (line 210): All 18 styles in `CANONICAL` array
  - Node "Build Dynamic Hairstyle Description" (line 493): Complete prompt definitions for all styles
  - Canonicalization logic handles variants (e.g., "buzzcut" → "buzz", "puffy ponytail large" → "puffy-ponytail")
  - R2 asset paths correctly constructed
  - **Gender handling:** Uses `clothingTypeCanonical` (dress vs tee-shorts) but doesn't validate against gender
- **No changes needed**

### 🔄 TO REVIEW

#### SW1 - Pose Generation
- **Check for:** Hair style consistency, clothing type locks, gender field preservation
- **Expected:** Should inherit hairstyle/clothing from SW0, pass through to poses

#### SW2 - QA Validation
- **Check for:** Validation logic, does it need gender awareness?
- **Expected:** Pure validation, likely no changes needed

#### W2B - Orchestrator
- **Check for:** Manifest handling, gender field preservation
- **Expected:** Should pass context through, no logic changes

#### W3 - Story Generation & Book Assembly
- **Check for:** 
  1. Pronoun usage in story text generation
  2. Gender-aware narrative (he/him → "he found", she/her → "she discovered", they/them → "they explored")
  3. Manifest gender field retrieval
  4. Story template logic
- **Expected:** This is the CRITICAL workflow for gender implementation

## What to Look For

### In Character Generation Workflows (SW0, SW1):
```javascript
// Hair style canonicalization
const CANONICAL = [...]; // Should have all 18 styles

// Hair style matching logic
if (/buzz|buzzcut/.test(s)) return 'buzz';
if (/puffy\s*ponytail/.test(s)) return 'puffy-ponytail';
// etc.

// Clothing type handling
const clothingTypeCanonical = ... // 'dress' or 'tee-shorts'
```

### In Manifest Workflows (W0, W2B):
```javascript
// Character specs should include
{
  characterSpecs: {
    childName: "...",
    pronouns: "he/him", // ← MUST be preserved
    hairStyle: "puffy-ponytail",
    clothingStyle: "dress", // or "tee-shorts"
    // ... other fields
  }
}
```

### In Story Generation (W3):
```javascript
// Gender-aware pronoun logic
const pronouns = characterSpecs.pronouns || "they/them";
const subject = pronouns.includes('she') ? 'she' : 
                pronouns.includes('he') ? 'he' : 'they';
const object = pronouns.includes('she') ? 'her' : 
               pronouns.includes('he') ? 'him' : 'them';

// Story text should use these dynamically
const storyText = `${childName} discovered ${subject} had a special gift...`;
```

## Gender → Clothing Mapping (Future Enhancement?)
Currently unclear if there's automatic mapping like:
- `pronouns: "she/her"` → defaults to `clothingStyle: "dress"`
- `pronouns: "he/him"` → defaults to `clothingStyle: "tee-shorts"`
- `pronouns: "they/them"` → ???

**Question to answer:** Does this mapping exist? Should it? Or is clothing always user-selected independent of gender?

## Assets Verified
All hairstyle PNGs exist in R2:
```
little-hero-assets/book-mvp-simple-adventure/characters/hairstyles/
  ✅ buzz.png
  ✅ curly-crop.png
  ✅ curly-tight.png
  ✅ puffy-ponytail.png
  ✅ small-puffy-ponytail.png
  (+ all 13 other styles)
```

## Next Steps
1. Continue reviewing remaining workflows (SW1, SW2, W2B, W3)
2. For each workflow, check for:
   - Hairstyle handling (if applicable)
   - Gender/pronouns field preservation
   - Clothing type logic
3. Identify any workflows that need updates
4. Generate updated workflow JSON files for any that need changes

## Review Process
When checking a workflow:
1. Upload the workflow JSON
2. Search for: `hair`, `gender`, `pronouns`, `clothing`, `he`, `she`, `they`
3. Verify fields are preserved/used correctly
4. If changes needed: update and provide full workflow for download
5. If no changes needed: reply "looks good, next"
