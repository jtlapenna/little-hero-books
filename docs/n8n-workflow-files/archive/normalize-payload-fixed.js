// Accepts many shapes (Amazon Custom / backend forwarder / mock)
// Normalize core fields and optional specs. Dedication is handled in the next node.
// Gets CONFIG from earlier node execution (CONFIG runs before Mock Order)

const raw = $input.first().json || {};
const config = $item(0).$node["CONFIG (PRODUCTION)"]?.json || {};

// DEBUG: Log the raw input structure
console.log('=== NORMALIZE PAYLOAD DEBUG ===');
console.log('Raw input keys:', Object.keys(raw));
console.log('Has raw.body?', !!raw.body);
if (raw.body) {
  console.log('raw.body keys:', Object.keys(raw.body));
  console.log('raw.body.amazonOrderId:', raw.body.amazonOrderId);
  console.log('raw.body.orderId:', raw.body.orderId);
  console.log('raw.body.id:', raw.body.id);
}
console.log('raw.amazonOrderId:', raw.amazonOrderId);
console.log('raw.orderId:', raw.orderId);
console.log('raw.id:', raw.id);

function safe(o){ return (o && typeof o === 'object') ? o : {}; }
function coerceStr(v){ return (v==null) ? undefined : String(v); }
function num(v){ const n = Number(v); return Number.isFinite(n) ? n : undefined; }
function extractItems(r){ return Array.isArray(r.items) ? r.items : (Array.isArray(r.lineItems) ? r.lineItems : []); }

// FIXED: Check body first (webhook payload structure), then top-level fields
function extractOrderId(r){ 
  // n8n webhook nodes wrap POST body in a 'body' property
  // Check if r.body exists and is an object (webhook structure)
  if (r.body && typeof r.body === 'object') {
    // Try to extract from body
    const bodyId = r.body.amazonOrderId || r.body.orderId || r.body.id;
    if (bodyId) {
      console.log('✅ extractOrderId found in body:', bodyId);
      return String(bodyId);
    }
  }
  // Fall back to top-level fields (direct payload or flattened structure)
  const topLevelId = r.amazonOrderId || r.orderId || r.id;
  if (topLevelId) {
    console.log('✅ extractOrderId found in top-level:', topLevelId);
    return String(topLevelId);
  }
  console.log('❌ extractOrderId: No order ID found, returning UNKNOWN-ORDER');
  console.log('❌ Raw structure (first 1000 chars):', JSON.stringify(r, null, 2).substring(0, 1000));
  return 'UNKNOWN-ORDER'; 
}

// Map pronouns/gender to clothing style
function mapClothingStyle(pronouns, explicitClothing) {
  // If clothing style is explicitly provided, use it
  if (explicitClothing && String(explicitClothing).trim()) {
    return String(explicitClothing).trim();
  }
  
  // Map from pronouns if no explicit clothing
  if (!pronouns) return 'tee-shorts'; // default
  
  const p = String(pronouns).toLowerCase().trim();
  
  // girl or she/her → dress
  if (p.includes('girl') || p.includes('she')) {
    return 'dress';
  }
  
  // boy, he/him, they/them → tee-shorts
  if (p.includes('boy') || p.includes('he') || p.includes('they')) {
    return 'tee-shorts';
  }
  
  // default
  return 'tee-shorts';
}

// CRITICAL: Determine the actual data source
// n8n webhook nodes wrap POST body in 'body' property, but also may have top-level fields
// Use body if it exists and is different from raw (webhook structure), otherwise use raw
const body = (raw.body && typeof raw.body === 'object' && raw.body !== raw) ? raw.body : raw;

const orderId = extractOrderId(raw);
const items = extractItems(body);

console.log('✅ Extracted orderId:', orderId);
console.log('✅ Using body for field extraction:', body === raw.body ? 'YES (from raw.body)' : 'NO (using raw)');

// Optional specs - check body first, then raw
const cs = safe(body.characterSpecs || body.character_specs || body.CharacterSpecs || raw.characterSpecs);
const bs = safe(body.bookSpecs || raw.bookSpecs);
const od = safe(body.orderDetails || raw.orderDetails);
const shipping = safe(od.shippingAddress || od.shipping_address);

const characterSpecs = {
  childName: coerceStr(cs.childName),
  skinTone: coerceStr(cs.skinTone),
  hairColor: coerceStr(cs.hairColor),
  hairStyle: coerceStr(cs.hairStyle),
  age: num(cs.age),
  pronouns: coerceStr(cs.pronouns),
  favoriteColor: coerceStr(cs.favoriteColor),
  animalGuide: coerceStr(cs.animalGuide),
  clothingStyle: mapClothingStyle(cs.pronouns, cs.clothingStyle), // Map from pronouns if not provided
};

const bookSpecs = {
  title: coerceStr(bs.title),
  totalPages: num(bs.totalPages),
  format: coerceStr(bs.format),
  bookType: coerceStr(bs.bookType),
};

const orderDetails = {
  quantity: num(od.quantity) || 1,
  shippingAddress: {
    name: coerceStr(shipping.name),
    address: coerceStr(shipping.address),
    city: coerceStr(shipping.city),
    state: coerceStr(shipping.state),
    zip: coerceStr(shipping.zip),
    phone: coerceStr(shipping.phone || shipping.phoneNumber || shipping.phone_number), // CRITICAL: Required for Lulu API
  }
};

// Extract amazonOrderId - check body first, then raw, then use orderId as fallback
const amazonOrderId = body.amazonOrderId || body.amazon_order_id || raw.amazonOrderId || raw.amazon_order_id || (orderId !== 'UNKNOWN-ORDER' ? orderId : null);

console.log('✅ Extracted amazonOrderId:', amazonOrderId);
console.log('=== END NORMALIZE PAYLOAD DEBUG ===');

return [{
  json: {
    _raw: raw,
    _config: config, // Merge config into flow for downstream nodes
    orderId,
    // legacy fields for compatibility
    buyer: body.buyer || raw.buyer || {},
    purchaseDate: body.purchaseDate || body.purchase_date || raw.purchaseDate || raw.createdAt || null,
    // normalized fields
    status: coerceStr(body.status || raw.status) || 'queued_for_processing',
    orderDate: coerceStr(body.orderDate || body.order_date || raw.orderDate) || new Date().toISOString(),
    customerEmail: coerceStr(body.customerEmail || body.customer_email || raw.customerEmail),
    items,
    characterSpecs,
    bookSpecs,
    orderDetails,
    // Preserve amazonOrderId for Build manifest node
    amazonOrderId: amazonOrderId,
    marketplaceId: body.marketplaceId || body.marketplace_id || raw.marketplaceId,
  }
}];

