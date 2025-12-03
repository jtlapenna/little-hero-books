# RBI Use Case Evaluation for Little Hero Books

**Date:** January 2025  
**Objective Assessment** - Evaluating RBI's applicability to specific LHL use cases without assuming claims are valid

---

## Use Case 1: Pose QA with Gemini

### Current System
- **Two Gemini API calls per pose:**
  1. **Pose QA**: Validates pose/position (pose_score, single_subject, extra_limbs, bg_white, leakage_from_pose_ref, cropped)
  2. **Style QA**: Validates character traits (style_score, color_score, line_style_match, palette_shift, skin_tone_match, hair_color_match)
- **Cost**: ~$0.001-$0.10 per validation (2 API calls)
- **Time**: 1-5 seconds per validation
- **Location**: `docs/n8n-workflow-files/finals/SW2 - Pose and Style QA.json`

### RBI Potential
**What RBI Claims:**
- Can provide "coherence scores" (clarity, coherence, resonance, sovereignty)
- Can validate content with "Proof-of-Meaning"
- Costs $0.00001 per validation
- Takes <100ms

**Critical Questions:**
1. **Can RBI analyze images?** - RBI documentation shows text-based analysis. Need to verify if it can process image data (base64, URLs, or image embeddings).
2. **Does RBI understand pose validation?** - RBI provides generic "coherence" scores, but can it detect "extra_limbs", "single_subject", "bg_white" like Gemini does?
3. **Can RBI compare two images?** - Pose QA requires comparing generated image vs pose reference. RBI's `/field/neighbors` endpoint does similarity, but unclear if it works on images.

**Assessment:**
- **Unlikely to replace Gemini directly** - RBI appears text-focused, while pose QA requires visual analysis
- **Possible hybrid approach:**
  - Use RBI to pre-validate order data before Gemini calls (catch invalid orders early)
  - Use RBI to score the text prompts/instructions for coherence
  - Keep Gemini for actual image validation
- **Value**: Low-Medium (if RBI can't analyze images, it can't replace Gemini for pose QA)

**Recommendation:**
- **Test RBI with image data** - Try sending base64 image data or image URLs to RBI endpoints
- **If RBI can't handle images**: Use RBI for pre-validation only (validate order specs before expensive Gemini calls)
- **If RBI can handle images**: Run parallel test comparing RBI scores vs Gemini scores on same images

---

## Use Case 2: Duplicate Order Detection

### Current System
- **No duplicate detection** - Each order generates new character even if specs are identical
- **Character hash exists**: `character_hash` is calculated from character specs
- **No similarity search**: Orders with similar (but not identical) specs still generate new characters
- **Location**: `back-end/src/app/api/cron/amazon-orders/route.ts` (calculateCharacterHash function)

### RBI Potential
**What RBI Claims:**
- `/field/neighbors` endpoint finds similar items
- Can detect duplicates with similarity scores
- Fast similarity search (<150ms)

**Assessment:**
- **High potential value** - This is exactly what RBI's `/field/neighbors` endpoint is designed for
- **Implementation:**
  ```typescript
  // Before generating character, check for similar orders
  const similar = await findSimilarOrders(
    { characterSpecs: order.characterSpecs },
    existingOrders.map(o => ({ id: o.orderId, characterSpecs: o.characterSpecs }))
  );
  if (similar[0]?.score > 0.95) {
    // Reuse existing character
  }
  ```
- **Value**: High - Could save $6 per duplicate (skip Bria AI generation)
- **Risk**: Low - Simple to test, easy to fallback if RBI unavailable

**Recommendation:**
- **High priority** - This is a clear win if RBI works as claimed
- **Test with real orders**: Compare RBI similarity scores vs manual assessment
- **Start small**: Add duplicate check before Workflow 2A (character generation)

---

## Use Case 3: Codebase Analysis (Backend/Frontend)

### Current System
- **No automated code analysis** - Manual code reviews
- **No inefficiency detection** - Issues found through debugging
- **No discrepancy tracking** - Manual comparison of frontend/backend logic

### RBI Potential
**What RBI Claims:**
- Can analyze content for "coherence"
- Can detect patterns and inconsistencies
- Provides "field dynamics" showing stability

**Assessment:**
- **Unclear applicability** - RBI appears designed for content/data validation, not code analysis
- **Questions:**
  1. Can RBI parse TypeScript/JavaScript code?
  2. Can RBI understand code structure (functions, classes, imports)?
  3. Can RBI detect code inefficiencies (performance issues, anti-patterns)?
  4. Can RBI compare frontend/backend implementations for discrepancies?

**Assessment:**
- **Low-Medium potential** - RBI might be able to analyze code as "text content", but:
  - Code requires semantic understanding (not just coherence)
  - Inefficiencies require domain knowledge (not just pattern matching)
  - Discrepancies require understanding of business logic (not just similarity)

**Recommendation:**
- **Test with code samples** - Try sending TypeScript code to RBI `/field/analyze` endpoint
- **If RBI provides useful insights**: Could use for:
  - Detecting duplicate code patterns
  - Finding inconsistent naming conventions
  - Identifying code that doesn't match documentation
- **If RBI doesn't understand code**: Skip this use case, use proper code analysis tools (ESLint, TypeScript compiler, etc.)

---

## Use Case 4: n8n Workflow Analysis/Optimization

### Current System
- **Complex workflows** - Multiple workflows with code nodes, expressions, HTTP requests
- **No automated optimization** - Manual workflow review
- **No pattern detection** - Similar logic duplicated across workflows
- **Location**: `docs/n8n-workflow-files/finals/`

### RBI Potential
**What RBI Claims:**
- Can analyze content for coherence
- Can detect patterns
- Can provide quality scores

**Assessment:**
- **Medium potential** - Workflows are JSON/text, so RBI could analyze them
- **Possible uses:**
  1. **Workflow coherence**: Check if workflow structure is consistent
  2. **Pattern detection**: Find duplicate logic across workflows
  3. **Expression validation**: Validate n8n expressions for correctness
  4. **Configuration coherence**: Check if workflow configs match expected patterns

**Questions:**
1. Can RBI understand n8n workflow JSON structure?
2. Can RBI detect inefficient workflow patterns (unnecessary nodes, redundant steps)?
3. Can RBI validate n8n expressions (syntax, variable references)?

**Recommendation:**
- **Test with workflow JSON** - Export a workflow and send to RBI `/field/analyze`
- **If useful**: Could use RBI to:
  - Score workflow "quality" (coherence, completeness)
  - Find similar workflows (for consolidation)
  - Validate workflow configurations
- **If not useful**: Skip this use case, use n8n's built-in validation

---

## Use Case 5: Templated n8n System (Universal Workflows)

### Current System
- **Hardcoded book IDs**: `book-mvp-simple-adventure` appears in multiple places
- **Template paths**: Some workflows use `templatePath` but not consistently
- **Book-specific configs**: Each book type may need different settings
- **Goal**: Make workflows work for any book/asset type via `bookId` configs in Supabase

### RBI Potential
**What RBI Claims:**
- Can validate content coherence
- Can detect patterns
- Can provide quality scores

**Assessment:**
- **Low-Medium potential** - RBI could help validate that templated configs are coherent, but:
  - The templating work is primarily about code refactoring (expressions, variables)
  - RBI can't refactor code or create templates
  - RBI could validate that configs match expected patterns

**Possible uses:**
1. **Config validation**: Before using a book config, validate it with RBI
2. **Pattern detection**: Find workflows that don't follow templated patterns
3. **Coherence checking**: Ensure book configs are internally consistent

**Recommendation:**
- **Low priority** - RBI is not a templating tool
- **Better approach**: Use RBI to validate book configs AFTER templating is done
- **Focus on templating first**: Convert hardcoded values to expressions, then use RBI to validate configs

---

## Use Case 6: Other Potential Use Cases

### A. Order Validation at Intake
**Current**: Basic schema validation  
**RBI Potential**: Validate character spec coherence (e.g., age 3-7, valid hair/skin combinations)  
**Value**: Medium - Catch invalid orders before expensive processing  
**Risk**: Low - Easy to test

### B. Manifest Validation
**Current**: Manual manifest review  
**RBI Potential**: Validate manifest structure and content coherence  
**Value**: Medium - Catch manifest errors early  
**Risk**: Low - Can validate JSON structure

### C. Story Content Validation
**Current**: LLM generates story, manual review  
**RBI Potential**: Validate story coherence, age-appropriateness, name usage  
**Value**: Medium - Pre-screen stories before human review  
**Risk**: Medium - Need to verify RBI understands story quality

### D. Customer Correction Analysis
**Current**: Manual review of customer corrections  
**RBI Potential**: Categorize corrections, detect patterns, prioritize urgent issues  
**Value**: Medium - Better correction handling  
**Risk**: Low - Text analysis is RBI's strength

### E. Error Pattern Detection
**Current**: Manual error investigation  
**RBI Potential**: Find similar errors, detect patterns, suggest fixes  
**Value**: High - Learn from past errors  
**Risk**: Medium - Need to verify RBI can understand error context

---

## Summary Recommendations

### High Priority (Test First)
1. **Duplicate Order Detection** - Clear use case, high value, low risk
2. **Order Validation at Intake** - Simple to test, medium value

### Medium Priority (Test After High Priority)
3. **Error Pattern Detection** - High value if it works
4. **Customer Correction Analysis** - Text analysis is RBI's strength
5. **Story Content Validation** - Medium value, need to verify quality

### Low Priority (Test If Time Permits)
6. **n8n Workflow Analysis** - Unclear if RBI understands workflow structure
7. **Codebase Analysis** - Unclear if RBI understands code semantics
8. **Pose QA Replacement** - Unlikely (RBI appears text-focused, not image-focused)

### Skip
9. **Templated n8n System** - RBI can't create templates, only validate configs

---

## Testing Strategy

### Phase 1: Validate RBI Capabilities
1. **Test with text data** - Order specs, corrections, story content
2. **Test with image data** - Try sending images to RBI (may not work)
3. **Test with code/workflow JSON** - See if RBI provides useful insights

### Phase 2: Pilot High-Priority Use Cases
1. **Duplicate detection** - Test with 10-20 real orders
2. **Order validation** - Test with valid/invalid order specs
3. **Error pattern detection** - Test with historical error logs

### Phase 3: Measure Results
1. **Accuracy**: Does RBI catch real duplicates? Does it miss any?
2. **Speed**: Is RBI actually <100ms as claimed?
3. **Cost**: Is RBI actually $0.00001 as claimed?
4. **Value**: Do RBI results improve our processes?

---

## Critical Questions to Answer

1. **Can RBI analyze images?** (For pose QA use case)
2. **Can RBI understand code semantics?** (For codebase analysis)
3. **Can RBI understand n8n workflow structure?** (For workflow analysis)
4. **Are RBI's cost/speed claims accurate?** (Need to measure)
5. **Do RBI scores correlate with actual quality?** (Need to validate)

---

**Next Steps:**
1. Set up RBI service locally
2. Test RBI with sample data from each use case
3. Measure actual performance (speed, cost, accuracy)
4. Decide which use cases to pursue based on test results

