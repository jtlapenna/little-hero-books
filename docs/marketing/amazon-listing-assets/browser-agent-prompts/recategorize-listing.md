# Browser-Agent Prompt — Recategorize Amazon Listing B0G4QPLWKH

> Copy the prompt block below into your browser agent (signed into Seller Central as the LHL seller account). The agent will navigate Seller Central, attempt the recategorization itself if possible, and otherwise open a Seller Support case on your behalf.

---

## Prompt to paste

```
You are operating in Amazon Seller Central, signed in as Little Hero Labs (the seller of ASIN B0G4QPLWKH, the personalized children's book "Finding Our Inner Voice"). I need you to fix the product's category, which is currently wrong.

CONTEXT
- The book is a personalized children's picture book for ages 0-7.
- Amazon currently has it ranked in two browse nodes that are wrong for this product:
  - "Stress Management Self-Help" (#4,533) — wrong, this is an adult self-help category
  - "Children's Books on Health" (#4,559) — too narrow, this isn't a health book
- The correct browse nodes for a personalized children's picture book are typically one of:
  - Books > Children's Books > Growing Up & Facts of Life > Friendship, Social Skills & School Life
  - Books > Children's Books > Literature & Fiction > Family Life
  - Books > Children's Books > Growing Up & Facts of Life > Self-Esteem & Self-Respect
- For Amazon Custom personalized books specifically, peer products like Wonderbly's "The Little Boy Who Lost His Name" (B074JJ2DH1) are categorized under "Baby Products > Gifts > Newborn Gift Sets" — that is also a valid alternative.
- Brand Registry status: NOT YET REGISTERED (trademark pending). This may limit some self-service category-change options.

GOAL
Get the listing OUT of "Stress Management Self-Help" and into a more appropriate children's-book category. Either of these target nodes is acceptable, ranked in order of preference:
1. Books > Children's Books > Growing Up & Facts of Life > Self-Esteem & Self-Respect
2. Books > Children's Books > Growing Up & Facts of Life > Friendship, Social Skills & School Life
3. Books > Children's Books > Literature & Fiction > Family Life
4. Baby Products > Gifts > Newborn Gift Sets (peer-product convention)

STEP-BY-STEP

Step 1 — Navigate to the listing edit page
- Go to: https://sellercentral.amazon.com/
- Click "Inventory" → "Manage All Inventory" (or "Manage Inventory")
- Locate ASIN B0G4QPLWKH ("Finding Our Inner Voice" by Little Hero Labs)
- Click "Edit" next to the listing.

Step 2 — Try the self-service category update
- In the listing editor, look for these tabs in order: "Vital Info" → "Description" → "Keywords" → "More Details" / "Compliance" / "Product Identity"
- Look for a field called "Item Type Keyword", "Browse Node", "Categorization", "Recommended Browse Nodes", or "Department"
- If you can edit the browse node directly, set it to one of the target nodes above.
- Save changes and screenshot confirmation.
- If saving succeeds, skip to Step 4.

Step 3 — If self-service is blocked, open a Seller Support case
- Click the "Help" link (top-right of Seller Central).
- Click "Get product support" → search for "Change product category" or "Browse node change."
- If routed to "Contact Us," select:
  - Product type: Books
  - Issue: "I want to change the category / browse node of my product"
  - ASIN: B0G4QPLWKH
- Compose a message using this template (paste exactly):

  ---
  Subject: Browse node change request for ASIN B0G4QPLWKH

  Hello,

  I am the seller of ASIN B0G4QPLWKH, "Finding Our Inner Voice" — a personalized children's picture book for ages 0-7. The product is currently classified under "Stress Management Self-Help" (#4,533) and "Children's Books on Health" (#4,559). Both classifications are incorrect: this is a children's picture book, not a self-help book or a health-focused children's book.

  Please reassign the listing to one of the following browse nodes (in order of preference):
  1. Books > Children's Books > Growing Up & Facts of Life > Self-Esteem & Self-Respect
  2. Books > Children's Books > Growing Up & Facts of Life > Friendship, Social Skills & School Life
  3. Books > Children's Books > Literature & Fiction > Family Life
  4. Baby Products > Gifts > Newborn Gift Sets

  Peer-product reference: Wonderbly's "The Little Boy Who Lost His Name" (B074JJ2DH1) is in "Baby Products > Gifts > Newborn Gift Sets," which is the convention for personalized children's books in this segment.

  Thank you,
  Little Hero Labs
  ---

- Submit the case. Capture the case ID.

Step 4 — Verify
- Navigate back to the public listing: https://www.amazon.com/dp/B0G4QPLWKH
- Scroll to "Best Sellers Rank" in product details. If the change is applied, the subcategory ranks should reflect the new browse node (this can take up to 24 hours after a self-service edit, or longer for a Seller Support case).
- If the rank still shows "Stress Management Self-Help," that's expected immediately after submitting — Amazon takes time to reindex.

REPORT BACK
Reply with a structured report containing:
- Whether you used self-service (Step 2) or had to open a Seller Support case (Step 3).
- Which target browse node you set or requested (the numbered choice).
- Self-service: link to listing edit confirmation screenshot.
- Seller Support case: case ID, screenshot of the submitted ticket.
- Verification: whether the public listing's BSR subcategories have updated yet (yes/no/too soon).
- Any errors, blockers, or surprises encountered.

DO NOT
- Do not change the title, description, bullets, images, price, or any other listing attribute. Only the category.
- Do not click "Delete listing" or "Stop selling product."
- Do not accept any prompts to enroll in Brand Registry or paid programs.
- Do not modify Search Terms or Backend Keywords.
```

---

## Notes for Jeff

- This prompt is conservative: it only touches category. If self-service fails, a Seller Support case is the path. Cases typically resolve in 1-3 business days.
- Some Custom listings have category locked behind Brand Registry. If the case bounces back with that requirement, the workaround is to wait until trademark + Brand Registry resolves, then resubmit. The "Baby Products > Gifts > Newborn Gift Sets" target may bypass this since that's where Wonderbly sits without Brand Registry being required.
- The Seller Support case template references a competitor ASIN as a peer example — this is a known-effective tactic for browse-node change requests.
- The audit doc that produced this prompt: [2026-05-08-listing-audit.md](../2026-05-08-listing-audit.md).
