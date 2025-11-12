# Fix: Flip State Not Persisting in W2B Manifest

## Problem
When a user flips an image in Tab 2, the flip state (`flipped: true`, `flippedAt: timestamp`) is saved to the 2B manifest. However, if W2B runs again (e.g., retry loop, manual trigger), the "Build 2B Manifest" node rebuilds the manifest from the 2A manifest, losing the flip state.

## Root Cause
The "Build 2B Manifest" node in W2B:
1. Only reads from the 2A manifest (via "Download 2A Manifest" node)
2. Does NOT check for existing 2B manifest
3. Does NOT preserve `flipped` and `flippedAt` fields when updating entries

## Solution
Update the "Build 2B Manifest" node to:

1. **Try to load existing 2B manifest first** (if it exists)
   - Use HTTP Request to fetch: `https://admin.littleherolabs.com/api/manifests/book-mvp-simple-adventure/orders/{orderId}/manifests/2b-manifest.json`
   - If it exists, use it as the base manifest (preserves manual edits)
   - If it doesn't exist, fall back to 2A manifest (first run)

2. **Preserve `flipped` and `flippedAt` when updating entries**
   - When updating an entry, ensure these fields are preserved from the existing entry
   - The code already does `let next = { ...entry };` which should preserve them, but we need to ensure they're not overwritten

## Implementation Steps

### Option 1: Add HTTP Request Node (Recommended)
1. Add a new HTTP Request node before "Build 2B Manifest" called "Download Existing 2B Manifest (if exists)"
2. URL: `https://admin.littleherolabs.com/api/manifests/book-mvp-simple-adventure/orders/={{ $json.orderId || $json.amazonOrderId }}/manifests/2b-manifest.json`
3. Set it to continue on error (404 is OK - means 2B doesn't exist yet)
4. Update "Build 2B Manifest" to check for this node's output first

### Option 2: Update "Build 2B Manifest" Code (Simpler)
Modify the node to:
1. Extract `orderId` from input
2. Try to fetch existing 2B manifest via HTTP (using n8n's HTTP helper if available)
3. If found, use it as base; otherwise use 2A
4. When updating entries, explicitly preserve `flipped` and `flippedAt`:

```javascript
// When updating entry:
let next = { 
  ...entry,  // This preserves flipped/flippedAt
  // ... update Bria fields ...
};

// Explicitly preserve flip state (belt-and-suspenders)
if (entry.flipped !== undefined) {
  next.flipped = entry.flipped;
}
if (entry.flippedAt) {
  next.flippedAt = entry.flippedAt;
}
```

## Testing
1. Flip an image in Tab 2
2. Verify 2B manifest has `flipped: true` and `flippedAt`
3. Trigger W2B again (or wait for retry)
4. Verify 2B manifest still has `flipped: true` and `flippedAt` after rebuild
5. Run W3 and verify flipped image appears correctly

## Current Status
- ✅ Flip operation saves to manifest correctly
- ✅ W3 reads flip state and adds cache-busting
- ❌ W2B rebuild overwrites flip state (THIS IS THE BUG)

