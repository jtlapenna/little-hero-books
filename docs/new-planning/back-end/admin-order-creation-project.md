# Project Overview: Admin Order Creation Form

## 1. Project Summary

The Admin Order Creation Form enables administrators to manually create orders through a comprehensive web form, bypassing the standard Amazon Custom order intake process. This is essential for:
- Testing workflows with custom order data
- Creating orders for non-Amazon channels (future expansion)
- Manual order entry for special cases
- Customer service order creation

The form validates all required fields, creates the order in Supabase, and automatically triggers Workflow 0 (W0) to generate the initial manifest and queue the order for processing.

---

## 2. Primary Objectives

1. **Comprehensive Form** – Capture all required order data (customer info, character specs, shipping, etc.)
2. **Field Validation** – Client-side and server-side validation to ensure data completeness
3. **Auto-Trigger W0** – Automatically trigger Workflow 0 after order creation to generate manifest
4. **Error Handling** – Clear error messages and recovery options if W0 fails
5. **User Experience** – Intuitive form layout with helpful tooltips and validation feedback

---

## 3. High-Level Workflow

1. **Admin Opens Form**
   - Navigate to `/admin/orders/create`
   - Form loads with default values where applicable

2. **Admin Fills Form**
   - Enter order information (Amazon Order ID, marketplace, etc.)
   - Enter customer information (email, name)
   - Enter character specifications (child name, age, appearance, etc.)
   - Enter book specifications (title, format, pages)
   - Enter shipping information (address, phone - required for Lulu API)
   - Enter dedication (optional)

3. **Form Validation**
   - Client-side validation on blur/change
   - Server-side validation on submit
   - Show validation errors inline

4. **Order Creation**
   - Create order in Supabase with all data
   - Set `execution_status: 'ready_for_processing'`
   - Set `next_workflow: '2A'`
   - Set `workflow_step: 'order_intake'`

5. **W0 Auto-Trigger**
   - Option A: Direct n8n webhook call (immediate)
   - Option B: Queue for W0 processing (W0 picks up on next run)
   - **Recommendation**: Option B (more reliable)

6. **Success/Error Handling**
   - Success: Redirect to order detail page
   - W0 Failure: Show error message, allow retry
   - Validation Error: Show inline errors, allow correction

---

## 4. Core Components

| Component | Description | Technology Stack |
|-----------|-------------|------------------|
| **Order Creation Form** | Multi-section form with validation | Next.js React, React Hook Form, Zod |
| **Form Validation** | Client-side and server-side validation | Zod schema validation |
| **Order Creation API** | Endpoint to create order in Supabase | Next.js API route |
| **W0 Trigger** | Auto-trigger Workflow 0 after creation | n8n webhook OR queue-based |
| **Error Handling** | Display validation and API errors | React error components |
| **Success Redirect** | Navigate to order detail page | Next.js router |

---

## 5. Technical Architecture

```plaintext
┌─────────────────────────────────────┐
│   Admin Order Creation Form          │
│   /admin/orders/create               │
│   • Multi-section form               │
│   • Client-side validation           │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   Order Creation API                  │
│   POST /api/admin/orders/create      │
│   • Server-side validation           │
│   • Create order in Supabase         │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   Supabase Database                  │
│   • Insert order record              │
│   • Set execution_status             │
│   • Set next_workflow                │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│   W0 Auto-Trigger                     │
│   (n8n webhook OR queue)             │
│   • Generate 1-manifest.json         │
│   • Upload to R2                     │
└─────────────────────────────────────┘
```

---

## 6. Form Fields & Validation

### 6.1 Order Information Section

| Field | Type | Required | Validation | Default |
|-------|------|----------|------------|---------|
| Amazon Order ID | Text | Yes | Unique, alphanumeric, max 50 chars | - |
| Marketplace ID | Select | No | Valid marketplace code | 'ATVPDKIKX0DER' |
| Purchase Date | Date | No | Valid ISO date | Current date |

**Validation Rules**:
- Amazon Order ID must be unique (check against existing orders)
- Marketplace ID must match known marketplace codes

### 6.2 Customer Information Section

| Field | Type | Required | Validation | Default |
|-------|------|----------|------------|---------|
| Customer Email | Email | Yes | Valid email format | - |
| Customer Name | Text | No | Max 255 chars | - |

**Validation Rules**:
- Email must be valid format
- Email should be unique per order (warning, not error)

### 6.3 Character Specifications Section

| Field | Type | Required | Validation | Default |
|-------|------|----------|------------|---------|
| Child Name | Text | Yes | Max 50 chars, no special chars | - |
| Age | Number | Yes | Integer, 0-10 | - |
| Skin Tone | Select | Yes | Valid option | - |
| Hair Color | Select | Yes | Valid option | - |
| Hair Style | Select | Yes | Valid option | - |
| Pronouns | Select | Yes | Valid option | - |
| Favorite Color | Select | No | Valid option | - |
| Animal Guide | Select | No | Valid option | - |
| Clothing Style | Select | No | Valid option | - |

**Validation Rules**:
- Age must be between 0 and 10
- All select fields must match valid options from customization source of truth
- Child Name cannot contain special characters (sanitize)

**Options Source**: Reference `Customization_Source_of_Truth.md` for valid options

### 6.4 Book Specifications Section

| Field | Type | Required | Validation | Default |
|-------|------|----------|------------|---------|
| Title | Text | No | Max 200 chars | Auto-generated from child name |
| Total Pages | Number | Yes | Integer, 16 (fixed for MVP) | 16 |
| Format | Select | Yes | Valid format | '8.5x8.5_softcover' |
| Book Type | Select | Yes | Valid type | 'adventure' |

**Validation Rules**:
- Total Pages must be 16 (MVP constraint)
- Format must match valid print formats
- Book Type must match valid book types

**Auto-Generation**:
- If Title is empty, generate: `"{childName} and the Adventure Compass"`

### 6.5 Shipping Information Section

| Field | Type | Required | Validation | Default |
|-------|------|----------|------------|---------|
| Name | Text | Yes | Max 100 chars | - |
| Address | Text | Yes | Max 200 chars | - |
| City | Text | Yes | Max 100 chars | - |
| State | Select | Yes | Valid US state code | - |
| ZIP | Text | Yes | US ZIP format (5 or 9 digits) | - |
| Phone | Text | Yes | Valid phone format | - |

**Validation Rules**:
- Phone is **CRITICAL** (required for Lulu API)
- Phone format: `+1-XXX-XXX-XXXX` or `(XXX) XXX-XXXX` or `XXX-XXX-XXXX`
- ZIP must be valid US ZIP code format
- State must be valid US state code (2 letters)

### 6.6 Dedication Section

| Field | Type | Required | Validation | Default |
|-------|------|----------|------------|---------|
| Dedication Text | Textarea | No | Max 500 chars, max 6 lines | - |

**Validation Rules**:
- Max 500 characters
- Max 6 lines
- Sanitize special characters (HTML entities)

---

## 7. API Endpoint

### 7.1 Create Order
**Endpoint**: `POST /api/admin/orders/create`

**Request Body**:
```json
{
  "amazonOrderId": "TEST-ORDER-001",
  "marketplaceId": "ATVPDKIKX0DER",
  "purchaseDate": "2025-01-15T10:00:00Z",
  "customerEmail": "test@example.com",
  "customerName": "Jane Smith",
  "characterSpecs": {
    "childName": "Emma",
    "age": 5,
    "skinTone": "light",
    "hairColor": "blonde",
    "hairStyle": "straight-long",
    "pronouns": "she/her",
    "favoriteColor": "purple",
    "animalGuide": "penguin",
    "clothingStyle": "adventure"
  },
  "bookSpecs": {
    "title": "Emma and the Adventure Compass",
    "totalPages": 16,
    "format": "8.5x8.5_softcover",
    "bookType": "adventure"
  },
  "shippingAddress": {
    "name": "Jane Smith",
    "address": "123 Main Street",
    "city": "Portland",
    "state": "OR",
    "zip": "97201",
    "phone": "+1-555-123-4567"
  },
  "dedication": "For our little adventurer on her 5th birthday!"
}
```

**Response (Success)**:
```json
{
  "success": true,
  "order": {
    "id": 123,
    "amazon_order_id": "TEST-ORDER-001",
    "execution_status": "ready_for_processing",
    "next_workflow": "2A",
    "workflow_step": "order_intake"
  },
  "w0Triggered": true,
  "message": "Order created successfully. W0 will process shortly."
}
```

**Response (Validation Error)**:
```json
{
  "success": false,
  "errors": {
    "amazonOrderId": "Order ID already exists",
    "customerEmail": "Invalid email format",
    "shippingAddress.phone": "Phone number is required for Lulu API"
  }
}
```

**Response (W0 Trigger Failed)**:
```json
{
  "success": true,
  "order": { ... },
  "w0Triggered": false,
  "w0Error": "Failed to trigger W0 workflow",
  "message": "Order created but W0 trigger failed. You can retry W0 manually."
}
```

---

## 8. W0 Auto-Trigger Implementation

### Option A: Direct n8n Webhook Call (Immediate)

**Implementation**:
```typescript
// In order creation API
const w0WebhookUrl = process.env.N8N_W0_WEBHOOK_URL;
const response = await fetch(w0WebhookUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    amazonOrderId: orderData.amazonOrderId,
    // ... other order data
  })
});
```

**Pros**:
- Immediate processing
- Can return W0 result synchronously

**Cons**:
- Requires W0 webhook endpoint
- Network dependency (if n8n is down, order creation fails)
- Timeout risk for long-running W0

### Option B: Queue-Based (Recommended)

**Implementation**:
```typescript
// In order creation API
// Order is created with execution_status: 'ready_for_processing'
// W0 picks up order on next scheduled run (every 30 seconds)
// No immediate webhook call needed
```

**Pros**:
- More reliable (no network dependency)
- W0 handles its own scheduling
- Order creation doesn't fail if W0 is temporarily unavailable

**Cons**:
- Slight delay (up to 30 seconds) before W0 processes
- Cannot return W0 result synchronously

**Recommendation**: Use Option B (queue-based) for reliability.

---

## 9. UI Components

### 9.1 Form Layout

**Sections** (collapsible/expandable):
1. Order Information
2. Customer Information
3. Character Specifications
4. Book Specifications
5. Shipping Information
6. Dedication

**Features**:
- Progress indicator (which section you're on)
- Save draft (localStorage) - optional
- Form validation on blur/change
- Inline error messages
- Required field indicators (*)
- Help tooltips for complex fields

### 9.2 Form Validation UI

**Error Display**:
- Inline error messages below each field
- Error summary at top of form
- Disable submit button if validation fails
- Highlight invalid fields with red border

**Success Indicators**:
- Green checkmark for valid fields
- Progress bar showing completion percentage

### 9.3 Success/Error Handling

**Success State**:
- Show success message
- Redirect to order detail page after 2 seconds
- Or show "View Order" button

**Error State**:
- Show error banner at top
- List all validation errors
- Allow correction and resubmit
- If W0 fails: Show "Retry W0" button

---

## 10. Implementation Checklist

### Phase 1: Form Structure & Validation
- [ ] Create form page (`/admin/orders/create`)
- [ ] Set up React Hook Form
- [ ] Create Zod validation schema
- [ ] Implement form sections (Order, Customer, Character, Book, Shipping, Dedication)
- [ ] Add form field components (text, select, textarea, date)
- [ ] Implement client-side validation
- [ ] Add inline error messages
- [ ] Add required field indicators
- [ ] Add help tooltips

### Phase 2: API Endpoint
- [ ] Create order creation API (`POST /api/admin/orders/create`)
- [ ] Implement server-side validation (Zod schema)
- [ ] Check for duplicate Amazon Order ID
- [ ] Create order in Supabase with all fields
- [ ] Set execution_status and next_workflow
- [ ] Return success/error response
- [ ] Add error handling and logging

### Phase 3: W0 Integration
- [ ] Choose W0 trigger method (webhook OR queue)
- [ ] Implement W0 trigger logic
- [ ] Handle W0 trigger failures gracefully
- [ ] Add retry mechanism for W0 failures
- [ ] Test W0 auto-trigger with test orders

### Phase 4: UI Polish & Error Handling
- [ ] Add loading states during submission
- [ ] Add success/error toast notifications
- [ ] Implement redirect to order detail page
- [ ] Add "Retry W0" button if W0 fails
- [ ] Add form reset after successful submission
- [ ] Add draft save functionality (optional)

### Phase 5: Testing & Documentation
- [ ] Test form validation (all fields, edge cases)
- [ ] Test duplicate order ID handling
- [ ] Test W0 auto-trigger success and failure
- [ ] Test with minimal required fields
- [ ] Test with all optional fields
- [ ] Test error recovery (W0 retry)
- [ ] Update API documentation
- [ ] Create user guide for order creation

---

## 11. Form Field Options Reference

### Character Specifications Options

**Skin Tone**: `light`, `medium`, `dark`

**Hair Color**: `blonde`, `brown`, `black`, `red`, `gray`

**Hair Style**: `straight-long`, `straight-short`, `curly-long`, `curly-short`, `wavy-long`, `wavy-short`, `braided`, `ponytail`, `bun`

**Pronouns**: `she/her`, `he/him`, `they/them`

**Favorite Color**: `red`, `blue`, `green`, `yellow`, `purple`, `pink`, `orange`, `black`, `white`

**Animal Guide**: `penguin`, `fox`, `bear`, `rabbit`, `owl`, `deer`, `wolf`, `tiger`, `elephant`, `dolphin`

**Clothing Style**: `adventure`, `casual`, `formal`, `sporty`, `fantasy`

### Book Specifications Options

**Format**: `8.5x8.5_softcover` (MVP - single format)

**Book Type**: `adventure` (MVP - single type)

**Total Pages**: `16` (MVP - fixed)

### Shipping Options

**State**: US state codes (2 letters): `AL`, `AK`, `AZ`, `AR`, `CA`, `CO`, `CT`, `DE`, `FL`, `GA`, `HI`, `ID`, `IL`, `IN`, `IA`, `KS`, `KY`, `LA`, `ME`, `MD`, `MA`, `MI`, `MN`, `MS`, `MO`, `MT`, `NE`, `NV`, `NH`, `NJ`, `NM`, `NY`, `NC`, `ND`, `OH`, `OK`, `OR`, `PA`, `RI`, `SC`, `SD`, `TN`, `TX`, `UT`, `VT`, `VA`, `WA`, `WV`, `WI`, `WY`

---

## 12. Estimated Timeline

| Task | Duration | Notes |
|------|----------|-------|
| Form structure & validation | 2-3 days | Complex form with many fields |
| API endpoint & validation | 1-2 days | Server-side validation, Supabase integration |
| W0 integration | 1 day | Webhook or queue-based trigger |
| UI polish & error handling | 1 day | Loading states, toasts, redirects |
| Testing & documentation | 1 day | Comprehensive testing |
| **Total** | **6-8 days** | Solo developer estimate |

---

## 13. Success Criteria

- ✅ Admins can create orders via form with all required fields
- ✅ Form validates all fields (client-side and server-side)
- ✅ Duplicate order IDs are prevented
- ✅ Orders are created in Supabase with correct status
- ✅ W0 auto-triggers after order creation (or queues for W0)
- ✅ Clear error messages for validation failures
- ✅ W0 failures are handled gracefully with retry option
- ✅ Success redirects to order detail page
- ✅ Form is intuitive and user-friendly

---

## 14. Considerations

### Data Completeness
- **Critical**: Phone number is required for Lulu API
- Validate all required fields before allowing submission
- Warn (don't error) on optional fields that might be needed later

### W0 Reliability
- **Recommendation**: Use queue-based trigger (Option B)
- If W0 fails, order is still created and can be manually triggered
- Consider adding "Trigger W0" button on order detail page for manual retry

### Testing
- Test with various field combinations
- Test edge cases (very long names, special characters, etc.)
- Test duplicate order ID handling
- Test W0 trigger success and failure scenarios

### Future Enhancements
- Save draft functionality (localStorage or backend)
- Form templates (save common configurations)
- Bulk order creation (CSV upload)
- Integration with other order sources (Etsy, Shopify, etc.)

---

## 15. Related Files

- Form page: `back-end/src/app/admin/orders/create/page.tsx`
- API endpoint: `back-end/src/app/api/admin/orders/create/route.ts`
- Validation schema: `back-end/src/lib/validation/order-creation-schema.ts`
- W0 workflow: `docs/n8n-workflow-files/finals/LHB - 0 - ORDER INTAKE VALIDATION.json`
- Customization options: `Customization_Source_of_Truth.md`

