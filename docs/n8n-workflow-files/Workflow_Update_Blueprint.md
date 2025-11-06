# Little Hero Books - Workflow Update Blueprint
## Adding Front/Back Cover, Dedication & Inner Cover Pages

---

## **SW0 - Base Character Generation**
### Status: ✅ NO CHANGES REQUIRED
The base character workflow generates the character used throughout the book, including for the new cover pose. No modifications needed.

---

## **SW1 - Pose Generation**

### **Node: "Build Dynamic Pose Prompt"**
**Updates Required:**
1. Update `clampPose()` function: Change `Math.min(12, n)` to `Math.min(13, n)`
2. Add pose 13 entry to `POSE_PROMPT_MAP` object with description for cover pose (e.g., standing front-facing, confident pose)
3. Add pose 13 entry to `POSE_NEGATIVES` object with constraint list for cover pose

### **Node: "Prepare Gemini (POSE)" (if it has separate clamping)**
**Updates Required:**
1. Update `clampPose()` function: Change `Math.max(1, Math.min(12, n))` to `Math.max(1, Math.min(13, n))`

### **Node: "Schema Check + Defaults" / "Schema/Defaults"**
**Updates Required:**
1. Update any pose validation logic that checks for max pose number from 12 to 13

### **Node: "Resolve Pose Ref (IMAGE P)"**
**Updates Required:**
1. Update `clamp()` function: Change `Math.min(12, ...)` to `Math.min(13, ...)`
2. Ensure pose-13.png reference file exists in the static poses library

---

## **SW2 - Pose and Style QA**
### Status: ✅ NO CHANGES REQUIRED
QA workflow processes any image that enters it. No pose-count dependencies. Works for 12 or 13 poses.

---

## **2B - Background Removal**
### Status: ✅ NO CHANGES REQUIRED
Background removal workflow processes images individually with no pose-count constraints. Works for any number of poses.

---

## **SW3 - Upload**
### Status: ✅ NO CHANGES REQUIRED
Upload workflow handles individual file uploads. No pose-count dependencies.

---

## **2A - Orchestrator**

### **Node: "Create Final Summary"**
**Updates Required:**
1. Update any hardcoded references or validations that expect exactly 12 poses
2. Update `counts.total` validation logic to expect 13 poses
3. Update `progress.readyForBook` condition to check for 13 approved poses

### **Node: Any validation/counting nodes**
**Updates Required:**
1. Search for hardcoded "12" references related to pose counts
2. Update to 13 poses
3. Ensure manifest validation expects 13 entries

---

## **Workflow 3 - Book Assembly**

### **Node: "Get Order Ready for Assembly"**
**Updates Required:**
1. Update `totalPagesRequired` from 14 to 18 (adding 4 new pages: front cover, back cover, dedication, inner cover)
2. Ensure `processedImages` array can handle 13 poses instead of 12

### **Node: "Generate Complete HTML" (or similar page generation node)**
**Updates Required:**
1. Add HTML template generation for **Front Cover Page**:
   - Dynamic: Character image (from pose 13), Child's name
   - Static: Background image, optional animal guide image
   
2. Add HTML template generation for **Back Cover Page**:
   - Dynamic: Child's name, optional animal guide image
   - Static: Background image, any fixed back cover text
   
3. Add HTML template generation for **Dedication Page**:
   - Dynamic: Custom dedication text (from order data)
   - Static: Background image, decorative elements
   
4. Add HTML template generation for **Inner Cover Page**:
   - Dynamic: TBD based on design requirements
   - Static: Background image

### **Node: "Download 2B Manifest" / "Build Assembly Input From Manifest"**
**Updates Required:**
1. Update to process 13 pose entries from manifest instead of 12
2. Ensure pose 13 is correctly mapped to front cover usage

### **Node: "Prepare PDFMonkey Data" (or PDF generation prep)**
**Updates Required:**
1. Update page order array to include 4 new pages
2. Ensure new pages are positioned correctly:
   - Front Cover (page 1)
   - Inner Cover (page 2)
   - Dedication (page 3)
   - [Existing story pages...]
   - Back Cover (final page)

---

## **Static Assets Required (Outside Workflows)**

### **To Be Created/Added:**
1. **pose-13.png** - Static pose reference image for front cover character pose
2. **cover-background.png** - Background image for front cover
3. **back-cover-background.png** - Background image for back cover  
4. **dedication-background.png** - Background image for dedication page
5. **inner-cover-background.png** - Background image for inner cover
6. **Animal guide images** - Static images for animals (if not already existing)

### **Storage Location:**
- Pose reference: `book-mvp-simple-adventure/characters/poses/pose-13.png`
- Backgrounds: `book-mvp-simple-adventure/templates/backgrounds/[filename].png`
- Animal guides: `book-mvp-simple-adventure/templates/animals/[filename].png`

---

## **Order Data Schema Updates**

### **Required New Fields in Order Input:**
```javascript
{
  // Existing fields...
  bookCustomization: {
    dedicationText: "Custom dedication message", // For dedication page
    animalGuide: "bear" | "fox" | "owl" | null,  // Optional animal selection
    // Additional customization fields as needed
  }
}
```

---

## **Summary of Changes**

| Workflow | Nodes to Update | Complexity |
|----------|----------------|------------|
| SW0 | 0 nodes | None |
| SW1 | 3-4 nodes | Low - Update pose limit from 12→13, add pose 13 data |
| SW2 | 0 nodes | None |
| 2B | 0 nodes | None |
| SW3 | 0 nodes | None |
| 2A | 1-2 nodes | Low - Update expected pose count 12→13 |
| Workflow 3 | 3-4 nodes | Medium - Add 4 new page templates, update page count |

**Total Estimated Effort:** Low-Medium complexity. Most changes are simple constant updates. The main work is in Workflow 3 adding the new page HTML templates.

**Testing Strategy:**
1. Test SW1 with pose 13 generation first
2. Verify 2A orchestrator handles 13 poses correctly
3. Test Workflow 3 with all 4 new pages in isolation
4. Full end-to-end test with complete book generation

---

## **Implementation Order (Recommended)**

1. **Phase 1:** Update SW1 for pose 13 support
2. **Phase 2:** Update 2A Orchestrator for 13-pose validation
3. **Phase 3:** Create and upload static assets (backgrounds, animal guides, pose-13.png)
4. **Phase 4:** Update Workflow 3 for new page generation
5. **Phase 5:** End-to-end testing

---

**Document Version:** 1.0  
**Created:** For Little Hero Labs cover pages project  
**Status:** Blueprint - Ready for implementation
