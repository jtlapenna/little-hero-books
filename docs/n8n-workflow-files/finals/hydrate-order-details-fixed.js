// Hydrate Order Details (Supabase → 1-manifest → 3A) — emits `shippingAddress` + `customer`
// Requires j.CONFIG.supabase and j.CONFIG.r2, and j.orderId (or amazonOrderId).
// Priority: existing in JSON → Supabase row → R2 1-manifest.json → R2 3A-manifest.json.

const jIn = $input.first()?.json || {};
const j = { ...jIn };
const orderId = j.orderId || j.amazonOrderId || j.AmazonOrderId || j.amazon_order_id;

if (!orderId) throw new Error('Hydrate Order Details: missing orderId');

function firstNonEmpty(...vals) {
  for (const v of vals) {
    if (v === undefined || v === null) continue;
    const s = typeof v === 'string' ? v.trim() : v;
    if (s !== '' && s !== undefined && s !== null) return s;
  }
  return undefined;
}

// ---- helpers to shape Lulu shipping/customer ----
function normalizeCountry(c) {
  const s = String(c || '').trim().toUpperCase();
  return s || undefined;
}

function normalizeState(s) {
  return String(s || '').trim().toUpperCase() || undefined;
}

function normalizePhone(p) {
  const s = String(p || '').trim();
  return s || undefined;
}

function toShippingAddress(src) {
  if (!src || typeof src !== 'object') return undefined;

  // CRITICAL: Handle both manifest format (address, phone, zip, state) and Lulu format (street1, phone_number, postcode, state_code)
  const name        = firstNonEmpty(src.name, src.full_name, src.recipient, src.customer_name);
  const street1     = firstNonEmpty(src.street1, src.address1, src.address, src.line1); // 'address' is from manifest
  const street2     = firstNonEmpty(src.street2, src.address2, src.line2);
  const city        = firstNonEmpty(src.city, src.town);
  const state_code  = normalizeState(firstNonEmpty(src.state_code, src.state, src.region, src.province_code)); // 'state' is from manifest
  const postcode    = firstNonEmpty(src.postcode, src.postal_code, src.zip); // 'zip' is from manifest
  const country_code= normalizeCountry(firstNonEmpty(src.country_code, src.country, src.country_iso, 'US')); // Default to US if missing
  const phone_number= normalizePhone(firstNonEmpty(src.phone_number, src.phone, src.customer_phone)); // 'phone' is from manifest
  const email       = firstNonEmpty(src.email, src.customer_email);

  return {
    name, street1, street2, city, state_code, postcode, country_code, phone_number, email
  };
}

function toCustomer(src, fallbackEmail) {
  if (!src || typeof src !== 'object') src = {};
  return {
    name: firstNonEmpty(src.name, src.full_name, src.customer_name),
    email: firstNonEmpty(src.email, src.customer_email, fallbackEmail),
  };
}

// ---- 1) take anything from incoming payload if already present ----
let shippingAddress = toShippingAddress(j.shippingAddress || j.shipping_address);
let customer        = toCustomer(j.customer, j.contact_email || j.customer_email);

// ---- 2) Supabase row fallback (if still missing pieces) ----
async function getSupabaseOrder() {
  const base = j.CONFIG?.supabase?.projectUrl;
  const key  = j.CONFIG?.supabase?.serviceRoleKey;
  if (!base || !key) {
    console.log('[Hydrate] No Supabase config available');
    return null;
  }

  // Use amazon_order_id field (not orderId) - that's the actual column name in Supabase
  const url = `${base.replace(/\/$/, '')}/rest/v1/orders?limit=1&or=(amazon_order_id.eq.${encodeURIComponent(orderId)},orderId.eq.${encodeURIComponent(orderId)})`;
  const http = this.helpers.httpRequest;
  try {
    const resp = await http({
      method: 'GET',
      url,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
      json: true
    });
    const rows = Array.isArray(resp) ? resp : [];
    if (rows.length > 0) {
      console.log('[Hydrate] Found Supabase order:', { 
        amazon_order_id: rows[0].amazon_order_id,
        hasOrderDetails: !!rows[0].order_details,
        hasShippingAddress: !!rows[0].shipping_address
      });
    } else {
      console.log('[Hydrate] No Supabase order found for:', orderId);
    }
    return rows[0] || null;
  } catch (err) {
    console.log('[Hydrate] Supabase query error:', err.message || err);
    return null;
  }
}

// Map plausible Supabase columns → Lulu shape
// Supabase stores shipping address in order_details.shippingAddress (JSONB) or shipping_address (JSONB)
function shippingFromSupabase(row) {
  if (!row) return undefined;
  
  // First, try to get shipping address from JSONB fields
  const orderDetails = row.order_details || {};
  const shippingFromOrderDetails = orderDetails.shippingAddress || orderDetails.shipping_address || {};
  const shippingFromRow = row.shipping_address || {};
  
  // Combine all sources (order_details.shippingAddress takes priority)
  const src = {
    name: firstNonEmpty(
      shippingFromOrderDetails.name,
      shippingFromOrderDetails.full_name,
      shippingFromRow.name,
      shippingFromRow.full_name,
      row.customer_name,
      row.ship_name,
      row.recipient_name
    ),
    street1: firstNonEmpty(
      shippingFromOrderDetails.address,
      shippingFromOrderDetails.address1,
      shippingFromOrderDetails.street1,
      shippingFromRow.address,
      shippingFromRow.address1,
      shippingFromRow.street1,
      row.ship_address1,
      row.shipping_address1
    ),
    street2: firstNonEmpty(
      shippingFromOrderDetails.address2,
      shippingFromOrderDetails.street2,
      shippingFromRow.address2,
      shippingFromRow.street2,
      row.ship_address2,
      row.shipping_address2
    ),
    city: firstNonEmpty(
      shippingFromOrderDetails.city,
      shippingFromRow.city,
      row.ship_city,
      row.shipping_city
    ),
    state_code: firstNonEmpty(
      shippingFromOrderDetails.state,
      shippingFromOrderDetails.state_code,
      shippingFromRow.state,
      shippingFromRow.state_code,
      row.ship_state,
      row.shipping_state
    ),
    postcode: firstNonEmpty(
      shippingFromOrderDetails.zip,
      shippingFromOrderDetails.postal_code,
      shippingFromOrderDetails.postcode,
      shippingFromRow.zip,
      shippingFromRow.postal_code,
      shippingFromRow.postcode,
      row.ship_postal_code,
      row.shipping_postal_code
    ),
    country_code: firstNonEmpty(
      shippingFromOrderDetails.country,
      shippingFromOrderDetails.country_code,
      shippingFromRow.country,
      shippingFromRow.country_code,
      row.ship_country,
      row.shipping_country,
      'US' // Default to US if not specified
    ),
    phone_number: firstNonEmpty(
      shippingFromOrderDetails.phone,
      shippingFromOrderDetails.phoneNumber,
      shippingFromOrderDetails.phone_number,
      shippingFromRow.phone,
      shippingFromRow.phoneNumber,
      shippingFromRow.phone_number,
      row.ship_phone,
      row.shipping_phone,
      row.phone
    ),
    email: firstNonEmpty(
      shippingFromOrderDetails.email,
      shippingFromRow.email,
      row.customer_email,
      row.email
    ),
  };
  return toShippingAddress(src);
}

function customerFromSupabase(row) {
  if (!row) return undefined;
  const src = {
    name: firstNonEmpty(
      row.customer_name,
      row.ship_name,
      row.recipient_name
    ),
    email: firstNonEmpty(
      row.customer_email,
      row.email
    ),
  };
  return toCustomer(src);
}

// ---- 3) R2 1-manifest.json / 3A-manifest.json fallback ----
const crypto = require('crypto');
function hmac(key, data) { return crypto.createHmac('sha256', key).update(data).digest(); }
function sha256Hex(data) { return crypto.createHash('sha256').update(data).digest('hex'); }
function toHex(buf) { return buf.toString('hex'); }

function buildQueryString(params) {
  // Manual query string builder (URLSearchParams not available in n8n Code node)
  const pairs = [];
  for (const [key, value] of Object.entries(params)) {
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return pairs.join('&');
}

function presignR2Get(key, cfg, expires=3600) {
  const { bucket, endpointHost, region, accessKeyId, secretAccessKey } = cfg || {};
  if (!bucket || !endpointHost || !accessKeyId || !secretAccessKey) return null;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g,'').replace(/\..+/, '') + 'Z';
  const date = amzDate.slice(0,8);
  const service = 's3';
  const rgn = region || 'auto';
  const objectKey = encodeURIComponent(String(key).replace(/^\/+/, '')).replace(/%2F/g, '/');
  const canonicalUri = `/${bucket}/${objectKey}`;
  const credentialScope = `${date}/${rgn}/${service}/aws4_request`;
  const credential = `${accessKeyId}/${credentialScope}`;
  const signedHeaders = 'host';
  const query = buildQueryString({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': credential,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': signedHeaders,
  });
  const canonicalHeaders = `host:${endpointHost}\n`;
  const payloadHash = 'UNSIGNED-PAYLOAD';
  const canonicalRequest = ['GET', canonicalUri, query, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');
  const kDate = hmac(Buffer.from('AWS4' + secretAccessKey, 'utf8'), date);
  const kRegion = hmac(kDate, rgn);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = toHex(hmac(kSigning, stringToSign));
  return `https://${endpointHost}/${bucket}/${objectKey}?${query}&X-Amz-Signature=${signature}`;
}

async function fetchManifestJson(key) {
  const cfg = j.CONFIG?.r2;
  const url = presignR2Get(key, cfg, 3600);
  if (!url) {
    console.log('[Hydrate] Could not presign R2 URL for:', key);
    return null;
  }
  const http = this.helpers.httpRequest;
  try {
    const resp = await http({ method:'GET', url, json:true, ignoreHttpStatusErrors:true });
    if (!resp || typeof resp !== 'object') {
      console.log('[Hydrate] Manifest fetch returned invalid response for:', key);
      return null;
    }
    console.log('[Hydrate] Successfully fetched manifest:', key, {
      hasOrder: !!resp.order,
      hasOrderDetails: !!resp.order?.orderDetails,
      hasShippingAddress: !!(resp.order?.orderDetails?.shippingAddress || resp.shippingAddress)
    });
    return resp;
  } catch (err) {
    console.log('[Hydrate] Manifest fetch error for', key, ':', err.message || err);
    return null;
  }
}

function shippingFromManifest(m) {
  if (!m || typeof m !== 'object') return undefined;
  
  // Check multiple locations in manifest
  const order = m.order || {};
  const orderDetails = order.orderDetails || order.order_details || {};
  const shippingFromOrderDetails = orderDetails.shippingAddress || orderDetails.shipping_address || {};
  
  console.log('[Hydrate] shippingFromManifest - checking locations:', {
    hasOrder: !!order,
    hasOrderDetails: !!orderDetails,
    hasShippingFromOrderDetails: !!shippingFromOrderDetails && Object.keys(shippingFromOrderDetails).length > 0,
    shippingFromOrderDetailsKeys: shippingFromOrderDetails ? Object.keys(shippingFromOrderDetails) : []
  });
  
  // Try manifest top-level, then order.orderDetails, then order
  const shipping = m.shippingAddress || 
                   m.shipping_address || 
                   shippingFromOrderDetails ||
                   order.shippingAddress ||
                   order.shipping_address ||
                   m.shipping || 
                   m.customer?.shipping ||
                   {};
  
  console.log('[Hydrate] shippingFromManifest - selected shipping object:', {
    hasData: Object.keys(shipping).length > 0,
    keys: Object.keys(shipping),
    sample: Object.keys(shipping).length > 0 ? { name: shipping.name, address: shipping.address, phone: shipping.phone } : null
  });
  
  const result = toShippingAddress(shipping);
  console.log('[Hydrate] shippingFromManifest - toShippingAddress result:', result ? 'found' : 'not found', result ? { name: result.name, street1: result.street1, phone_number: result.phone_number } : null);
  
  return result;
}

function customerFromManifest(m) {
  if (!m || typeof m !== 'object') return undefined;
  
  // Check multiple locations in manifest
  const order = m.order || {};
  const buyer = order.buyer || {};
  const customerFromOrder = order.customer || {};
  
  console.log('[Hydrate] customerFromManifest - checking locations:', {
    hasOrder: !!order,
    hasBuyer: !!buyer && Object.keys(buyer).length > 0,
    buyerKeys: buyer ? Object.keys(buyer) : [],
    hasCustomerFromOrder: !!customerFromOrder && Object.keys(customerFromOrder).length > 0
  });
  
  // Try manifest top-level, then order.buyer (common in 1-manifest), then order.customer
  const customer = m.customer || 
                   buyer ||
                   customerFromOrder ||
                   { 
                     name: m.customer_name || order.customer_name || buyer.name, 
                     email: m.customer_email || order.customer_email || buyer.email
                   };
  
  console.log('[Hydrate] customerFromManifest - selected customer object:', {
    hasData: Object.keys(customer).length > 0,
    keys: Object.keys(customer),
    sample: Object.keys(customer).length > 0 ? { name: customer.name, email: customer.email } : null
  });
  
  const result = toCustomer(customer, m.customer_email || order.customer_email || buyer.email);
  console.log('[Hydrate] customerFromManifest - toCustomer result:', result ? 'found' : 'not found', result ? { name: result.name, email: result.email } : null);
  
  return result;
}

// Main async logic - n8n will await this promise automatically
console.log('[Hydrate] Starting hydration for orderId:', orderId);
const row = await getSupabaseOrder.call(this);
if (!shippingAddress) {
  shippingAddress = shippingFromSupabase(row);
  console.log('[Hydrate] After Supabase check, shippingAddress:', shippingAddress ? 'found' : 'not found');
}
if (!customer) {
  customer = customerFromSupabase(row);
  console.log('[Hydrate] After Supabase check, customer:', customer ? 'found' : 'not found');
}

// R2 manifest layer (only if still missing any critical pieces)
const needShip = !shippingAddress || !shippingAddress.phone_number || !shippingAddress.country_code;
if (needShip || !customer || !customer.email) {
  console.log('[Hydrate] Need to fetch manifests, needShip:', needShip, 'needCustomer:', !customer || !customer.email);
  const baseKey = `book-mvp-simple-adventure/orders/${orderId}/manifests/`;
  const m1  = await fetchManifestJson.call(this, baseKey + '1-manifest.json');
  const m3A = m1 ? null : await fetchManifestJson.call(this, baseKey + '3A-manifest.json');

  const src = m1 || m3A;
  if (src) {
    console.log('[Hydrate] Manifest fetched, structure check:', {
      hasOrder: !!src.order,
      hasOrderDetails: !!src.order?.orderDetails,
      hasShippingAddress: !!src.order?.orderDetails?.shippingAddress,
      hasBuyer: !!src.order?.buyer,
      shippingAddressKeys: src.order?.orderDetails?.shippingAddress ? Object.keys(src.order.orderDetails.shippingAddress) : [],
      buyerKeys: src.order?.buyer ? Object.keys(src.order.buyer) : []
    });
    
    // DIRECT EXTRACTION from known structure (1-manifest.json format)
    if (!shippingAddress && src.order?.orderDetails?.shippingAddress) {
      const sa = src.order.orderDetails.shippingAddress;
      console.log('[Hydrate] Direct extraction from manifest shippingAddress:', sa);
      shippingAddress = toShippingAddress(sa);
      console.log('[Hydrate] After direct extraction, shippingAddress:', shippingAddress);
    } else if (!shippingAddress) {
      // Fallback to complex extraction
      shippingAddress = shippingFromManifest(src);
      console.log('[Hydrate] After manifest check (fallback), shippingAddress:', shippingAddress ? 'found' : 'not found');
    }
    
    if (!customer && src.order?.buyer) {
      const buyer = src.order.buyer;
      console.log('[Hydrate] Direct extraction from manifest buyer:', buyer);
      customer = toCustomer(buyer, buyer.email);
      console.log('[Hydrate] After direct extraction, customer:', customer);
    } else if (!customer) {
      // Fallback to complex extraction
      customer = customerFromManifest(src);
      console.log('[Hydrate] After manifest check (fallback), customer:', customer ? 'found' : 'not found');
    }
    
    // patch missing bits if manifest has them
    if (shippingAddress && src.order?.buyer && !shippingAddress.email) {
      shippingAddress.email = firstNonEmpty(shippingAddress.email, src.order.buyer.email);
    }
  } else {
    console.log('[Hydrate] No manifest found (neither 1-manifest.json nor 3A-manifest.json)');
  }
}

console.log('[Hydrate] Final shippingAddress:', shippingAddress ? JSON.stringify(shippingAddress) : 'empty');
console.log('[Hydrate] Final customer:', customer ? JSON.stringify(customer) : 'empty');

// Final: if still missing, at least pass through what we had (Build Lulu will enforce requirements)
const out = {
  ...j,
  shippingAddress: shippingAddress || j.shippingAddress || j.shipping_address || {},
  customer: customer || j.customer || {}
};

return [{ json: out }];

