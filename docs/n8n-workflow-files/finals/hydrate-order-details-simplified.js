// Hydrate Order Details - SIMPLIFIED VERSION
// Direct extraction from 1-manifest.json structure
// Requires: CONFIG.r2, CONFIG.supabase, orderId
// Uses top-level await (supported in n8n Code nodes)

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

// Simple normalization functions
function normalizeCountry(c) {
  const s = String(c || '').trim().toUpperCase();
  return s || 'US'; // Default to US
}
function normalizeState(s) {
  return String(s || '').trim().toUpperCase() || undefined;
}
function normalizePhone(p) {
  const s = String(p || '').trim();
  return s || undefined;
}

// Direct extraction from 1-manifest.json structure
// Structure: order.orderDetails.shippingAddress = { name, address, city, state, zip, phone }
function extractShippingFromManifest(manifest) {
  if (!manifest || !manifest.order || !manifest.order.orderDetails || !manifest.order.orderDetails.shippingAddress) {
    return null;
  }
  
  const sa = manifest.order.orderDetails.shippingAddress;
  
  // Direct mapping from manifest fields to Lulu format
  return {
    name: sa.name || undefined,
    street1: sa.address || sa.street1 || sa.address1 || undefined, // 'address' is the manifest field
    street2: sa.address2 || sa.street2 || undefined,
    city: sa.city || undefined,
    state_code: normalizeState(sa.state || sa.state_code), // 'state' is the manifest field
    postcode: sa.zip || sa.postcode || sa.postal_code || undefined, // 'zip' is the manifest field
    country_code: normalizeCountry(sa.country || sa.country_code || 'US'),
    phone_number: normalizePhone(sa.phone || sa.phone_number || sa.phoneNumber), // 'phone' is the manifest field
    email: sa.email || undefined
  };
}

// Direct extraction from 1-manifest.json structure
// Structure: order.buyer = { email, name }
function extractCustomerFromManifest(manifest) {
  if (!manifest || !manifest.order || !manifest.order.buyer) {
    return null;
  }
  
  const buyer = manifest.order.buyer;
  
  return {
    name: buyer.name || undefined,
    email: buyer.email || undefined
  };
}

// Fetch manifest from R2
const crypto = require('crypto');
function hmac(key, data) { return crypto.createHmac('sha256', key).update(data).digest(); }
function sha256Hex(data) { return crypto.createHash('sha256').update(data).digest('hex'); }
function toHex(buf) { return buf.toString('hex'); }

function buildQueryString(params) {
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
  if (!cfg) {
    return null;
  }
  
  const url = presignR2Get(key, cfg, 3600);
  if (!url) {
    return null;
  }
  
  const http = this.helpers.httpRequest;
  try {
    const resp = await http({ method:'GET', url, json:true, ignoreHttpStatusErrors:true });
    if (!resp || typeof resp !== 'object') {
      return null;
    }
    return resp;
  } catch (err) {
    return null;
  }
}

async function getSupabaseOrder() {
  const base = j.CONFIG?.supabase?.projectUrl;
  const key  = j.CONFIG?.supabase?.serviceRoleKey;
  if (!base || !key) {
    return null;
  }

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
    return rows[0] || null;
  } catch (err) {
    return null;
  }
}

// Main logic - using top-level await
let shippingAddress = null;
let customer = null;

const row = await getSupabaseOrder.call(this);

// If we have Supabase data, try to extract from there
if (row) {
  const orderDetails = row.order_details || {};
  const shippingFromOrderDetails = orderDetails.shippingAddress || orderDetails.shipping_address || {};
  
  if (Object.keys(shippingFromOrderDetails).length > 0) {
    shippingAddress = extractShippingFromManifest({ order: { orderDetails: { shippingAddress: shippingFromOrderDetails } } });
  }
  
  if (row.customer_email || row.customer_name) {
    customer = {
      name: row.customer_name || undefined,
      email: row.customer_email || undefined
    };
  }
}

// If still missing, fetch from 1-manifest.json
if (!shippingAddress || !shippingAddress.phone_number || !customer || !customer.email) {
  const manifestKey = `book-mvp-simple-adventure/orders/${orderId}/manifests/1-manifest.json`;
  const manifest = await fetchManifestJson.call(this, manifestKey);
  
  if (manifest) {
    // Extract shipping address
    if (!shippingAddress || !shippingAddress.phone_number) {
      const extracted = extractShippingFromManifest(manifest);
      if (extracted && extracted.phone_number) {
        shippingAddress = extracted;
      }
    }
    
    // Extract customer
    if (!customer || !customer.email) {
      const extracted = extractCustomerFromManifest(manifest);
      if (extracted && extracted.email) {
        customer = extracted;
      }
    }
    
    // Patch email into shipping address if missing
    if (shippingAddress && !shippingAddress.email && customer && customer.email) {
      shippingAddress.email = customer.email;
    }
  }
}

// Final output - MUST be at top level, not inside async function
const out = {
  ...j,
  shippingAddress: shippingAddress || {},
  customer: customer || {}
};

return [{ json: out }];
