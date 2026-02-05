# Issue: Fix "Hometown" customization always reverting to default text

**Status:** 🔴 Open  
**Priority:** High  
**Created:** 2026-02-05  
**Last Updated:** 2026-02-05

## Description

In the D2C customization flow, the **Hometown** field does not persist correctly. Even when a customer enters a hometown, the UI/output consistently shows the default text **"a cozy town"**.

## Impact

- Customers see incorrect personalization (reduces perceived quality/trust)
- Downstream story/manuscript generation may embed the wrong hometown
- Increased support burden (“my hometown didn’t save”)

## Symptoms / Repro

- Enter a non-default hometown (e.g. "Austin") in the customization flow
- Continue through steps / refresh / revisit summary
- Hometown displays as **"a cozy town"** instead of the entered value

## Expected Behavior

- The entered hometown persists through the entire create/checkout flow
- The order payload and generated story consistently use the customer-provided hometown

## Root Cause (confirmed)

**W0 Order Intake – Normalize Payload node** (`docs/n8n-workflow-files/finals/w0-Order_Intake_Validation.json`): the `characterSpecs` object was built with a fixed set of fields and **did not include `hometown`**. The manifest (1-manifest.json) and downstream workflows (W1.1 → W3) therefore never received hometown; W3 story code correctly falls back to `"a cozy town"` when `characterSpecs.hometown` is missing.

## Fix Applied

- **W0 Normalize Payload**: Added `hometown` to `characterSpecs`, with fallbacks for `cs.hometown`, `cs.homeTown`, and `cs.home_town`. Re-import the updated W0 workflow in n8n for the fix to take effect.

## Other Suspected Causes (ruled out or secondary)

1. **State overwritten by defaults** – Possible in UI; fixing W0 ensures that once the value reaches the backend, it is written to the manifest.
2. **Field name mismatch** – Addressed in Normalize Payload by accepting `hometown` / `homeTown` / `home_town`.
3. **Serialization/validation** – Backend `orders` route already accepts `hometown`; the gap was W0 not copying it into `characterSpecs`.

## Affected Areas / Files

- **Fixed:** `docs/n8n-workflow-files/finals/w0-Order_Intake_Validation.json` (Normalize Payload node)
- **Already correct:** W3 uses `order.characterSpecs?.hometown || 'a cozy town'`; backend/Amazon parsers accept hometown.
- **Optional:** Ensure frontend checkout sends `character_specs.hometown` so W0 receives it.

## Acceptance Criteria

- [ ] Entering a hometown persists across step transitions and page refreshes
- [ ] Checkout/order payload contains the customer-provided hometown
- [ ] Generated story/manuscript uses the provided hometown (not the default)
- [ ] Default `"a cozy town"` is used **only** when hometown is blank/omitted

## Notes

- Prefer fixing this at the earliest point where the value is being overwritten (avoid “patching” later stages).

