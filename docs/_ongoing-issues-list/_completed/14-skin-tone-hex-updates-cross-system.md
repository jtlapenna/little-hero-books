# Issue 14: Skin Tone Hex Updates — Cross-System Sync

**Created:** 2026-02-03  
**Updated:** 2026-02-03  
**Status:** In Progress  
**Priority:** Medium  
**Affects:** Frontend, Backend, R2 Assets

---

## Summary

The frontend D2C character builder skin tones have been updated with hex values sampled from actual R2 base images, plus two new tones (`medium-dark` and `deep`) that require new R2 assets.

---

## Understanding What Hex Values Control

| Location | What hex controls | Impact on generated characters |
|----------|-------------------|-------------------------------|
| **Frontend `traitOptions.ts`** | UI swatch button colors | None — just what user sees when picking |
| **Backend `customization.ts`** | Metadata/reference (admin UI, etc.) | None — informational only |
| **R2 base images** | N/A — skin tone is **baked into the PNG/JPG pixels** | **Direct** — Gemini uses image as reference |

**Key insight:** The hex values should match the actual R2 base character images so users see accurate swatches.

---

## Final Skin Tone Specification

**File:** `frontend/src/lib/createFlow/traitOptions.ts` ✅ UPDATED

| ID | Label | Hex | Coverage | R2 Status |
|----|-------|-----|----------|-----------|
| `light` | Light | `#EFC28E` | Fair — Caucasian, light East Asian | ✅ Existing |
| `medium` | Medium | `#E7AB62` | Warm beige — East Asian, lighter Latino, Southern European | ✅ Existing |
| `tan` | Tan | `#CF924E` | Golden/olive — Mediterranean, Middle Eastern, South Asian | ✅ Existing |
| `medium-dark` | Medium Dark | `#95623D` | Warm brown — darker Latino, South Asian, lighter African-American | ❌ **NEW** |
| `deep` | Deep | `#7C5130` | Rich brown — African-American, dark South Asian | ❌ **NEW** |

### Changes from Previous

| Old ID | Old Hex | New ID | New Hex | Change |
|--------|---------|--------|---------|--------|
| `light` | `#F0D5B8` | `light` | `#EFC28E` | Hex adjusted to match R2 |
| `medium` | `#D4A574` | `medium` | `#E7AB62` | Hex adjusted to match R2 |
| `olive` | `#B8956E` | — | — | **Removed** |
| `tan` | `#8D5524` | `tan` | `#CF924E` | Hex adjusted to match R2 |
| — | — | `medium-dark` | `#95623D` | **NEW** (replaces olive) |
| `dark` | `#4A2C17` | `deep` | `#7C5130` | Renamed + new hex |

---

## Required Updates

### 1. R2 Assets: Reusing Existing Base Character Images ✅

**Location:** `little-hero-assets/book-mvp-simple-adventure/characters/bases/`

**Mapping (reusing existing files):**

| New Canonical | Uses Existing File | Dress Variant |
|---------------|-------------------|---------------|
| `skin-medium-dark` | `base--skin-light-aa.png` | `base--skin-light-aa--dress.png` |
| `skin-deep` | `base--skin-dark-aa.png` | `base--skin-dark-aa--dress.png` |

No new images needed — reusing the existing `-aa` (African-American) assets.

---

### 2. Backend: `preview-canonicals.ts`

**File:** `back-end/src/lib/preview-canonicals.ts`

**Current:**
```typescript
const SKIN_MAP: Record<string, string> = {
  light: 'skin-light',
  medium: 'skin-medium',
  tan: 'skin-tan',
  olive: 'skin-tan',
  dark: 'skin-brown-deep',
};
```

**Update to:**
```typescript
const SKIN_MAP: Record<string, string> = {
  light: 'skin-light',
  medium: 'skin-medium',
  tan: 'skin-tan',
  'medium-dark': 'skin-medium-dark',  // NEW
  deep: 'skin-deep',                   // NEW (was dark → skin-brown-deep)
};
```

**Also update `BASE_FILENAME_TEE_SHORTS`:**
```typescript
const BASE_FILENAME_TEE_SHORTS: Record<string, string> = {
  'skin-light': 'base--skin-light.png',
  'skin-medium': 'base--skin-medium.jpg',
  'skin-tan': 'base--skin-tan.png',
  'skin-medium-dark': 'base--skin-light-aa.png',  // Reuses existing light-aa
  'skin-deep': 'base--skin-dark-aa.png',          // Reuses existing dark-aa
};
```

---

### 3. Backend: `customization.ts`

**File:** `back-end/src/types/customization.ts`

**Update `SKIN_TONES` array:**
```typescript
export const SKIN_TONES = [
  'skin-light',
  'skin-medium',
  'skin-tan',
  'skin-medium-dark',  // NEW
  'skin-deep',         // NEW (replaces skin-brown-deep for D2C)
] as const;
```

**Update `SKIN_TONE_HEX_MAP`:**
```typescript
export const SKIN_TONE_HEX_MAP: Record<SkinToneCanonical, { id: SkinToneCanonical; hex: string; label: string }> = {
  'skin-light': { id: 'skin-light', hex: '#EFC28E', label: 'Light' },
  'skin-medium': { id: 'skin-medium', hex: '#E7AB62', label: 'Medium' },
  'skin-tan': { id: 'skin-tan', hex: '#CF924E', label: 'Tan' },
  'skin-medium-dark': { id: 'skin-medium-dark', hex: '#95623D', label: 'Medium Dark' },
  'skin-deep': { id: 'skin-deep', hex: '#7C5130', label: 'Deep' },
};
```

---

### 4. n8n Workflow: w2A `Resolve Skin Tone & Base Path1`

**File:** `docs/n8n-workflow-files/nb-3-upgrades/w2A-SW0-Base_Character_Generation.json`

**Update `canonicalSkinTone()` function:**
```javascript
function canonicalSkinTone(raw){
  const s = norm(raw);
  if (!s) return 'skin-medium';
  
  // New D2C IDs
  if (/medium[-_ ]?dark/.test(s)) return 'skin-medium-dark';
  if (/^deep($|\b)/.test(s)) return 'skin-deep';
  
  // Existing mappings...
  if (/^(light|fair)(\b|$)/.test(s)) return 'skin-light';
  if (/(tan|olive)/.test(s)) return 'skin-tan';
  if (/(medium|mid|default|normal|average)/.test(s)) return 'skin-medium';
  
  // Legacy mappings (Amazon orders)
  if (/(brown).*(deep|dark)/.test(s)) return 'skin-deep';
  if (/(brown).*(light)/.test(s)) return 'skin-medium-dark';
  
  return 'skin-medium';
}
```

**Update `FILENAME_MAP`:**
```javascript
const FILENAME_MAP = {
  'tee-shorts': {
    'skin-light': 'base--skin-light.png',
    'skin-medium': 'base--skin-medium.jpg',
    'skin-tan': 'base--skin-tan.png',
    'skin-medium-dark': 'base--skin-light-aa.png',   // Reuses existing
    'skin-deep': 'base--skin-dark-aa.png',           // Reuses existing
  },
  'dress': {
    'skin-light': 'base--skin-light--dress.png',
    'skin-medium': 'base--skin-medium--dress.png',
    'skin-tan': 'base--skin-tan--dress.png',
    'skin-medium-dark': 'base--skin-light-aa--dress.png',  // Reuses existing
    'skin-deep': 'base--skin-dark-aa--dress.png',          // Reuses existing
  }
};
```

---

## Checklist

### Frontend ✅
- [x] Update `frontend/src/lib/createFlow/traitOptions.ts` with final hex values

### R2 Assets ✅
- [x] Existing files reused: `base--skin-light-aa.png` → medium-dark, `base--skin-dark-aa.png` → deep
- [x] No new uploads needed

### Backend ✅
- [x] Update `back-end/src/lib/preview-canonicals.ts` — SKIN_MAP and BASE_FILENAME_TEE_SHORTS
- [x] Update `back-end/src/types/customization.ts` — SKIN_TONES and SKIN_TONE_HEX_MAP

### n8n Workflow (REMAINING — for production Amazon orders)
- [ ] Update `Resolve Skin Tone & Base Path1` node in w2A — see code changes in §4 above
- [ ] Deploy updated workflow to n8n cloud

### Testing
- [ ] Test D2C preview generation with all 5 skin tones
- [ ] Verify correct base image loads for each tone

---

## Notes

- **Legacy compatibility:** Amazon orders may still send old canonical values like `skin-brown-deep`. The n8n canonicalization should map these to the new canonicals.
- **Existing R2 assets:** The old `base--skin-dark-aa.png` and `base--skin-light-aa.png` can remain for backward compatibility with in-flight Amazon orders.
