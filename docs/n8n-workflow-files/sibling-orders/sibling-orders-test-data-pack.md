# Sibling Orders Test Data Pack

Use this with:

- `docs/n8n-workflow-files/sibling-orders/sibling-orders-end-to-end-testing-guide.md`

This file provides copy/paste-ready test data for:

- Scenario A: 2-book sibling order
- Scenario B: 3-book sibling order
- Scenario C: D2C multi-book order (2 books)
- Scenario D: D2C multi-book order (3 books)

## Test pseudocode

```text
pick one scenario
set root amazonOrderId (same across sibling items)
set unique per-book orderId on each item
ensure character specs are distinct for each sibling
submit each sibling item as a separate W0 webhook request
run through W1.1 -> W2A -> W2B -> W3 -> W4.1
validate one aggregate submit with N line_items
```

---

## Naming convention

- Root group ID (shared): `amazonOrderId`
- Per-book ID (unique): `orderId`

Example:

- Root: `SIB-E2E-2026-02-24-A`
- Books:
  - `SIB-E2E-2026-02-24-A-item-001`
  - `SIB-E2E-2026-02-24-A-item-002`

---

## Scenario A payload (2 books)

Important: W0 intake expects one order object per request.
Use the two payloads below as two separate webhook POSTs.

```json
{
  "orderId": "SIB-E2E-2026-02-24-A-item-001",
  "amazonOrderId": "SIB-E2E-2026-02-24-A",
  "marketplaceId": "ATVPDKIKX0DER",
  "characterSpecs": {
    "childName": "Avery",
    "age": 5,
    "skinTone": "light",
    "hairColor": "brown",
    "hairStyle": "curly-bob",
    "pronouns": "she/her",
    "favoriteColor": "green",
    "animalGuide": "otter",
    "clothingStyle": "dress"
  },
  "orderDetails": {
    "shippingAddress": {
      "name": "Test Family",
      "address": "100 Main St",
      "city": "Austin",
      "state": "TX",
      "zip": "78701",
      "phone": "5125550101"
    }
  }
}
```

```json
{
  "orderId": "SIB-E2E-2026-02-24-A-item-002",
  "amazonOrderId": "SIB-E2E-2026-02-24-A",
  "marketplaceId": "ATVPDKIKX0DER",
  "characterSpecs": {
    "childName": "Miles",
    "age": 6,
    "skinTone": "medium",
    "hairColor": "black",
    "hairStyle": "short-wavy",
    "pronouns": "he/him",
    "favoriteColor": "blue",
    "animalGuide": "fox",
    "clothingStyle": "hoodie"
  },
  "orderDetails": {
    "shippingAddress": {
      "name": "Test Family",
      "address": "100 Main St",
      "city": "Austin",
      "state": "TX",
      "zip": "78701",
      "phone": "5125550101"
    }
  }
}
```

---

## Scenario B payload (3 books)

Use as three separate webhook POST requests.

```json
{
  "orderId": "SIB-E2E-2026-02-24-B-item-001",
  "amazonOrderId": "SIB-E2E-2026-02-24-B",
  "marketplaceId": "ATVPDKIKX0DER",
  "characterSpecs": {
    "childName": "Luna",
    "age": 4,
    "skinTone": "tan",
    "hairColor": "brown",
    "hairStyle": "long-straight",
    "pronouns": "she/her",
    "favoriteColor": "purple",
    "animalGuide": "rabbit",
    "clothingStyle": "skirt"
  },
  "orderDetails": {
    "shippingAddress": {
      "name": "Sibling Test Household",
      "address": "200 Oak Ave",
      "city": "Seattle",
      "state": "WA",
      "zip": "98101",
      "phone": "2065550101"
    }
  }
}
```

```json
{
  "orderId": "SIB-E2E-2026-02-24-B-item-002",
  "amazonOrderId": "SIB-E2E-2026-02-24-B",
  "marketplaceId": "ATVPDKIKX0DER",
  "characterSpecs": {
    "childName": "Noah",
    "age": 7,
    "skinTone": "deep",
    "hairColor": "black",
    "hairStyle": "coily-short",
    "pronouns": "he/him",
    "favoriteColor": "red",
    "animalGuide": "bear",
    "clothingStyle": "jacket"
  },
  "orderDetails": {
    "shippingAddress": {
      "name": "Sibling Test Household",
      "address": "200 Oak Ave",
      "city": "Seattle",
      "state": "WA",
      "zip": "98101",
      "phone": "2065550101"
    }
  }
}
```

```json
{
  "orderId": "SIB-E2E-2026-02-24-B-item-003",
  "amazonOrderId": "SIB-E2E-2026-02-24-B",
  "marketplaceId": "ATVPDKIKX0DER",
  "characterSpecs": {
    "childName": "Ivy",
    "age": 5,
    "skinTone": "light-medium",
    "hairColor": "auburn",
    "hairStyle": "braids",
    "pronouns": "she/her",
    "favoriteColor": "teal",
    "animalGuide": "deer",
    "clothingStyle": "overalls"
  },
  "orderDetails": {
    "shippingAddress": {
      "name": "Sibling Test Household",
      "address": "200 Oak Ave",
      "city": "Seattle",
      "state": "WA",
      "zip": "98101",
      "phone": "2065550101"
    }
  }
}
```

---

## CSV row template (if your W0 source is CSV)

Use one row per sibling item, with shared `amazonOrderId` and unique `orderId`.

```csv
amazonOrderId,orderId,marketplaceId,childName,age,skinTone,hairColor,hairStyle,pronouns,favoriteColor,animalGuide,clothingStyle,shipName,shipAddress1,shipCity,shipState,shipPostal,shipCountry,shipPhone
SIB-E2E-2026-02-24-A,SIB-E2E-2026-02-24-A-item-001,ATVPDKIKX0DER,Avery,5,light,brown,curly-bob,she/her,green,otter,dress,Test Family,100 Main St,Austin,TX,78701,US,5125550101
SIB-E2E-2026-02-24-A,SIB-E2E-2026-02-24-A-item-002,ATVPDKIKX0DER,Miles,6,medium,black,short-wavy,he/him,blue,fox,hoodie,Test Family,100 Main St,Austin,TX,78701,US,5125550101
```

Note:

- If your parser expects nested shipping JSON instead of flat CSV columns, map `ship*` columns into `shipping_address` during W0 normalization.

---

## Quick validation queries/checks (manual)

- Confirm shared root + unique per-book IDs:
  - same `amazon_order_id` across siblings
  - distinct `orderId` (or equivalent per-book key) per item
- Confirm W3 outputs are per-book:
  - `orders/<orderId>/...` paths for each sibling
- Confirm W4.1 aggregate behavior:
  - one submit with `line_items.length == sibling count`
  - one shared `lulu_job_id` written back to all sibling rows

---

## n8n webhook run helper (copy/paste)

Replace `N8N_BASE_URL` with your n8n domain and post each sibling item JSON separately.

```bash
N8N_BASE_URL="https://your-n8n-domain"
curl -X POST "${N8N_BASE_URL}/webhook/order-intake" \
  -H "Content-Type: application/json" \
  -d @item-001.json

curl -X POST "${N8N_BASE_URL}/webhook/order-intake" \
  -H "Content-Type: application/json" \
  -d @item-002.json

# Add item-003.json for 3-book scenario
```

---

## Scenario C: D2C Multi-Book Order (2 books)

Tests the D2C frontend multi-book checkout flow. Two books in one Stripe checkout session, creating two sibling orders that go through the same pipeline.

### Test steps

1. **Frontend**: Start at `/create/character`, customize Book 1
2. **Frontend**: Complete dedication on `/create/customize`
3. **Frontend**: On `/create/review`, click "Add Another Book"
4. **Frontend**: Customize Book 2 (different character)
5. **Frontend**: On `/create/review`, confirm 2 books shown, click "Continue to checkout"
6. **Frontend**: On `/create/checkout`, verify summary shows 2 books + correct total
7. **Frontend**: Fill shipping/email, submit
8. **Stripe**: Complete test payment
9. **Backend**: Verify Stripe webhook creates 2 order rows, triggers W0 for each
10. **n8n**: Both orders flow through W1.1 > W2A > W2B > W3 > W4.1

### D2C checkout API payload (multi-book)

```json
{
  "customer_email": "test-d2c@example.com",
  "customer_name": "Test Parent",
  "shipping_address": {
    "name": "Test Parent",
    "address_line1": "456 Oak Avenue",
    "city": "Portland",
    "state": "OR",
    "postal_code": "97201",
    "country": "US"
  },
  "shipping_tier": "mail",
  "books": [
    {
      "character_specs": {
        "childName": "Luna",
        "name": "Luna",
        "age": 5,
        "pronouns": "she-her",
        "skinTone": "light",
        "hairColor": "blonde",
        "hairStyle": "pigtails",
        "favoriteColor": "purple",
        "favoriteAnimal": "unicorn",
        "hometown": "Portland"
      },
      "dedication": "For Luna, who lights up every room."
    },
    {
      "character_specs": {
        "childName": "Max",
        "name": "Max",
        "age": 7,
        "pronouns": "he-him",
        "skinTone": "medium",
        "hairColor": "dark-brown",
        "hairStyle": "buzz",
        "favoriteColor": "green",
        "favoriteAnimal": "t-rex",
        "hometown": "Portland"
      },
      "dedication": "For Max, our brave explorer."
    }
  ]
}
```

### Direct API test (bypasses Stripe, useful for backend-only validation)

```bash
BACKEND_URL="https://admin.littleherolabs.com"
curl -X POST "${BACKEND_URL}/api/checkout/create" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-d2c-multi-$(date +%s)" \
  -d @d2c-multi-book.json
```

Expected response: `order_ids` array with 2 entries (e.g. `["{root}-item-1", "{root}-item-2"]`), `book_count: 2`.

### Assertions

- 2 order rows created in Supabase, both `platform: 'd2c'`
- Order IDs follow `{root}-item-1` and `{root}-item-2` pattern
- Each has distinct `character_specs` and `character_hash`
- Stripe checkout session has 3 line items (2 books + 1 shipping)
- After payment: both orders transition to `pending_w0`, W0 triggered for each
- W0 Normalize Payload detects siblings via `deriveRootOrderId()` regex
- Both books flow through pipeline independently
- W4.1 aggregates both into single Lulu print job

---

## Scenario D: D2C Multi-Book Order (3 books)

Tests D2C sibling behavior at N=3 (same as Amazon stagger test, but from frontend/checkout source).

### D2C checkout API payload (3 books)

```json
{
  "customer_email": "test-d2c-3@example.com",
  "customer_name": "Three Book Parent",
  "shipping_address": {
    "name": "Three Book Parent",
    "address_line1": "789 Cedar Street",
    "city": "Seattle",
    "state": "WA",
    "postal_code": "98101",
    "country": "US"
  },
  "shipping_tier": "mail",
  "books": [
    {
      "character_specs": {
        "childName": "Aria",
        "name": "Aria",
        "age": 5,
        "pronouns": "she-her",
        "skinTone": "light-medium",
        "hairColor": "brown",
        "hairStyle": "braids",
        "favoriteColor": "pink",
        "favoriteAnimal": "fox",
        "hometown": "Seattle"
      },
      "dedication": "For Aria, our bright little hero."
    },
    {
      "character_specs": {
        "childName": "Theo",
        "name": "Theo",
        "age": 6,
        "pronouns": "he-him",
        "skinTone": "medium",
        "hairColor": "black",
        "hairStyle": "short-wavy",
        "favoriteColor": "blue",
        "favoriteAnimal": "bear",
        "hometown": "Seattle"
      },
      "dedication": "For Theo, our fearless explorer."
    },
    {
      "character_specs": {
        "childName": "Nia",
        "name": "Nia",
        "age": 4,
        "pronouns": "she-her",
        "skinTone": "deep",
        "hairColor": "black",
        "hairStyle": "puffs",
        "favoriteColor": "yellow",
        "favoriteAnimal": "butterfly",
        "hometown": "Seattle"
      },
      "dedication": "For Nia, who brings joy everywhere."
    }
  ]
}
```

### Direct API test (backend validation)

```bash
BACKEND_URL="https://admin.littleherolabs.com"
curl -X POST "${BACKEND_URL}/api/checkout/create" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-d2c-multi3-$(date +%s)" \
  -d @d2c-multi-book-3.json
```

Expected response: `order_ids` array with 3 entries, `book_count: 3`.

### Assertions

- 3 order rows created in Supabase, each `platform: 'd2c'`
- All `orderId` values are unique and share one root group identity
- Each row has distinct `character_specs` and `character_hash`
- Stripe checkout session has 4 line items (3 books + 1 shipping)
- After payment: all transition to `pending_w0`, W0 triggered per sibling
- No partial W4.1 aggregate for 2/3 readiness
- Final W4.1 aggregate submits once with `line_items.length == 3`
- All 3 sibling rows share one `lulu_job_id`

