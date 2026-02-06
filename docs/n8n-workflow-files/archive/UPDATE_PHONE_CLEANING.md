# Update Phone Number Cleaning in w1.1 Workflow

## Problem
Lulu API rejects phone numbers with extensions (e.g., "+1 602-671-6610 ext. 02924"). The phone number comes from Supabase (CSV upload or Amazon order) and may contain extensions.

## Solution
Update the "Prep Workflow 4 Orders" node in w1.1 to clean phone numbers by stripping extensions before passing to w4.

## Current Code (w1.1 - Prep Workflow 4 Orders)

```javascript
// Ensure shipping_address has phone_number (use company fallback if missing)
const shippingAddress = order.shipping_address ? {
  ...order.shipping_address,
  phone_number: order.shipping_address.phone_number || 
                order.shipping_address.phone || 
                '+1-678-478-3477' // Company fallback
} : null;
```

## Updated Code (with phone cleaning)

```javascript
// Clean phone number function (strips extensions)
function cleanPhoneNumber(phone) {
  if (!phone) return null;
  let cleaned = String(phone).trim();
  // Remove extension patterns: "ext. 02924", "ext 02924", "extension 02924", "x 02924", etc.
  cleaned = cleaned.replace(/\s*(ext|extension|x)[\s:\.]*\d+/gi, '');
  cleaned = cleaned.trim();
  return cleaned || null;
}

// Process Workflow 4 orders
const routing = $input.first().json;
const orders4 = routing.workflow4 || [];
if (orders4.length === 0) {
  console.log('No orders for Workflow 4');
  return [];
}
console.log(`=== PROCESSING ${orders4.length} ORDERS FOR WORKFLOW 4 ===`);
const prefix = 'book-mvp-simple-adventure/orders';

// Build minimal payload - W4 will fetch 3-manifest itself
return orders4.map(order => {
  // Clean phone number (strip extensions) and ensure phone_number exists
  const rawPhone = order.shipping_address?.phone_number || 
                   order.shipping_address?.phone;
  const cleanedPhone = cleanPhoneNumber(rawPhone);
  
  // Use cleaned phone if available, otherwise use company fallback
  // Company fallback: 678-478-3477 (for non-Amazon orders)
  const phone_number = cleanedPhone || '+1-678-478-3477';
  
  const shippingAddress = order.shipping_address ? {
    ...order.shipping_address,
    phone_number: phone_number
  } : null;

  return {
    json: {
      orderId: order.amazon_order_id,
      characterHash: order.character_hash,
      orderDbId: order.id,
      workflow: '4',
      shipping_address: shippingAddress,
      // Pass 3-manifest key (W4 will fetch it via backend proxy, like W3 does)
      manifest3Key: `${prefix}/${order.amazon_order_id}/manifests/3-manifest.json`,
      oneManifestKey: order.one_manifest_url || `${prefix}/${order.amazon_order_id}/manifests/1-manifest.json`
    }
  };
});
```

## Steps to Update

1. **Open w1.1 workflow in n8n**
2. **Find the "Prep Workflow 4 Orders" Code node**
3. **Replace the existing code with the updated version above**
4. **Test with an order that has a phone number with an extension**

## Testing

After updating:
1. Test with phone number containing extension: "+1 602-671-6610 ext. 02924" → should become "+1 602-671-6610"
2. Test with phone number without extension: "+1 602-671-6610" → should remain "+1 602-671-6610"
3. Test with missing phone number → should use fallback "+1-678-478-3477"
4. Verify Lulu API accepts the cleaned phone number

## Phone Number Source Logic

- **Amazon orders**: Use customer's phone from Amazon order data
- **CSV uploads**: Use phone from CSV (may contain extensions - will be cleaned)
- **Other orders**: Use company fallback "+1-678-478-3477"

