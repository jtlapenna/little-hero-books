#!/usr/bin/env node
/**
 * Submit two sibling orders (same Amazon order, two line items) to Lulu as a
 * single print job so both books ship together to the same address.
 *
 * Prerequisites:
 *   - Backend running (or BACKEND_URL pointing to deployed admin) so signed PDF
 *     URLs can be fetched from GET /api/pdf/{key}?format=json
 *   - LULU_CLIENT_ID and LULU_CLIENT_SECRET in env (or in back-end/.env.local
 *     if run with dotenv from repo root)
 *
 * Usage:
 *   node scripts/submit-sibling-orders-to-lulu.js <orders.json>
 *   node scripts/submit-sibling-orders-to-lulu.js --orders orders.json [--backend-url URL] [--no-supabase]
 *
 * orders.json: JSON array of exactly 2 order objects. Each must have:
 *   - orderId or amazon_order_id
 *   - interiorPdfR2Key or interior_pdf_r2_key
 *   - coverPdfR2Key or cover_pdf_r2_key
 *   - shipping_address (object or JSON string with name, address/street1, city, state, zip, phone)
 *   - character_specs.childName or similar for title (optional)
 *
 * Optional env (for Supabase update after submit):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Use --no-supabase to skip updating Supabase.
 */

const fs = require('fs');
const path = require('path');

const BACKEND_URL = process.env.BACKEND_URL || 'https://admin.littleherolabs.com';
const LULU_CLIENT_ID = process.env.LULU_CLIENT_ID || process.env.LULU_CLIENT_KEY;
const LULU_CLIENT_SECRET = process.env.LULU_CLIENT_SECRET || process.env.LULU_API_SECRET;
const LULU_API_BASE = process.env.LULU_API_BASE || 'https://api.lulu.com';
const POD_PACKAGE_ID = process.env.LULU_POD_PACKAGE_ID || '0850X0850FCPRESS080CW444MXX';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mdnthwpcnphjnnblbvxk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function loadEnvFromBackend() {
  const repoRoot = path.join(__dirname, '..');
  const backEndDir = path.join(repoRoot, 'back-end');
  // Load in order: back-end .env, back-end .env.local, repo root .env (later overrides only if not set)
  const toTry = [
    path.join(backEndDir, '.env'),
    path.join(backEndDir, '.env.local'),
    path.join(repoRoot, '.env'),
  ];
  for (const envPath of toTry) {
    if (!fs.existsSync(envPath)) continue;
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) return;
      const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m) {
        const key = m[1];
        const val = m[2].replace(/^["']|["']$/g, '').trim().replace(/\r$/, '');
        if (!process.env[key]) process.env[key] = val;
      }
    });
  }
}

function parseShippingAddress(addr) {
  if (typeof addr === 'string') {
    try {
      addr = JSON.parse(addr);
    } catch {
      return null;
    }
  }
  if (!addr || typeof addr !== 'object') return null;
  const street1 = (addr.street1 || addr.address || addr.address1 || addr.street || '').toString().trim();
  const normalized = {
    name: addr.name || addr.shippingName || '',
    street1: street1.trim(),
    street2: addr.street2 || addr.address2 || '',
    city: addr.city || '',
    state_code: (addr.state_code || addr.state || addr.stateCode || '').toString().trim().toUpperCase().slice(0, 2),
    postcode: (addr.postcode || addr.zip || addr.postalCode || addr.zipcode || '').toString().trim(),
    country_code: (addr.country_code || addr.country || addr.countryCode || 'US').toString().toUpperCase().slice(0, 2),
    phone_number: addr.phone_number || addr.phone || addr.phoneNumber || '',
  };
  return normalized;
}

async function getSignedPdfUrl(key) {
  const base = process.env.BACKEND_URL || BACKEND_URL;
  const url = `${base.replace(/\/$/, '')}/api/pdf/${key}?format=json`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to get signed URL for ${key}: ${res.status} ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data.signedUrl) throw new Error(`No signedUrl in response for ${key}`);
  return data.signedUrl;
}

async function getLuluAccessToken() {
  const clientId = process.env.LULU_CLIENT_ID || process.env.LULU_CLIENT_KEY;
  const clientSecret = process.env.LULU_CLIENT_SECRET || process.env.LULU_API_SECRET;
  if (!clientId || !clientSecret) {
    const backEnd = path.join(__dirname, '..', 'back-end');
    throw new Error(
      'Lulu credentials not set. Add LULU_CLIENT_ID and LULU_CLIENT_SECRET to back-end/.env or back-end/.env.local, ' +
      'or export them before running. (Script loads from back-end/.env and .env.local.)'
    );
  }
  const apiBase = process.env.LULU_API_BASE || 'https://api.lulu.com';
  const tokenUrl = `${apiBase}/auth/realms/glasstree/protocol/openid-connect/token`;
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Lulu token failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data.access_token) throw new Error('Lulu token response missing access_token');
  return data.access_token;
}

async function submitLuluPrintJob(payload, token) {
  const url = `${LULU_API_BASE.replace(/\/$/, '')}/print-jobs/`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Lulu print job failed: ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  }
  return body;
}

async function run(ordersPath, updateSupabase) {
  const ordersRaw = fs.readFileSync(ordersPath, 'utf8');
  let orders;
  try {
    orders = JSON.parse(ordersRaw);
  } catch (e) {
    throw new Error(`Invalid JSON in ${ordersPath}: ${e.message}`);
  }
  if (!Array.isArray(orders) || orders.length !== 2) {
    throw new Error('orders.json must be a JSON array of exactly 2 order objects');
  }

  const first = orders[0];
  const second = orders[1];
  const orderId1 = first.orderId || first.amazon_order_id;
  const orderId2 = second.orderId || second.amazon_order_id;
  const interiorKey1 = first.interiorPdfR2Key || first.interior_pdf_r2_key;
  const coverKey1 = first.coverPdfR2Key || first.cover_pdf_r2_key;
  const interiorKey2 = second.interiorPdfR2Key || second.interior_pdf_r2_key;
  const coverKey2 = second.coverPdfR2Key || second.cover_pdf_r2_key;
  const shipAddr = parseShippingAddress(first.shipping_address || second.shipping_address);
  const childName1 = (first.character_specs && typeof first.character_specs === 'object' ? first.character_specs.childName : null) || (typeof first.character_specs === 'string' ? (() => { try { return JSON.parse(first.character_specs).childName; } catch { return null; } })() : null) || 'Book 1';
  const childName2 = (second.character_specs && typeof second.character_specs === 'object' ? second.character_specs.childName : null) || (typeof second.character_specs === 'string' ? (() => { try { return JSON.parse(second.character_specs).childName; } catch { return null; } })() : null) || 'Book 2';

  if (!orderId1 || !orderId2 || !interiorKey1 || !coverKey1 || !interiorKey2 || !coverKey2) {
    throw new Error('Each order must have orderId/amazon_order_id, interiorPdfR2Key, coverPdfR2Key');
  }
  if (!shipAddr || !shipAddr.phone_number) {
    throw new Error('shipping_address with phone_number is required (use first order\'s address)');
  }

  console.log('Fetching signed PDF URLs from backend...');
  const [interiorUrl1, coverUrl1, interiorUrl2, coverUrl2] = await Promise.all([
    getSignedPdfUrl(interiorKey1),
    getSignedPdfUrl(coverKey1),
    getSignedPdfUrl(interiorKey2),
    getSignedPdfUrl(coverKey2),
  ]);
  console.log('Got 4 signed URLs');

  console.log('Getting Lulu access token...');
  const token = await getLuluAccessToken();
  console.log('Token obtained');

  const contactEmail = first.customer_email || second.customer_email || 'orders@littleherolabs.com';
  const payload = {
    external_id: `sibling-${orderId1}-${Date.now()}`,
    contact_email: contactEmail,
    shipping_level: 'MAIL',
    shipping_address: shipAddr,
    line_items: [
      {
        external_id: orderId1,
        title: `Little Hero Book – ${childName1}`,
        quantity: 1,
        printable_normalization: {
          interior: { source_url: interiorUrl1 },
          cover: { source_url: coverUrl1 },
          pod_package_id: POD_PACKAGE_ID,
        },
      },
      {
        external_id: orderId2,
        title: `Little Hero Book – ${childName2}`,
        quantity: 1,
        printable_normalization: {
          interior: { source_url: interiorUrl2 },
          cover: { source_url: coverUrl2 },
          pod_package_id: POD_PACKAGE_ID,
        },
      },
    ],
  };

  console.log('Submitting print job to Lulu (2 line items, 1 shipment)...');
  const job = await submitLuluPrintJob(payload, token);
  const jobId = job.id ?? job.job_id ?? job.data?.id;
  const status = job.status ?? job.data?.status ?? 'CREATED';
  console.log('Lulu print job created:', { id: jobId, status });

  if (updateSupabase && SUPABASE_SERVICE_ROLE_KEY) {
    const patch = {
      lulu_job_id: String(jobId).slice(0, 50),
      lulu_status: status,
      print_submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      execution_status: 'done',
      started_at: null,
      current_workflow: null,
    };
    await patchSupabaseOrder(orderId1, patch);
    console.log('Updated Supabase order', orderId1);
    await patchSupabaseOrder(orderId2, patch);
    console.log('Updated Supabase order', orderId2);
  } else if (updateSupabase && !SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('Set SUPABASE_SERVICE_ROLE_KEY to update both orders in Supabase with lulu_job_id:', jobId);
  }

  console.log('Done. Lulu job id:', jobId);
  return jobId;
}

async function patchSupabaseOrder(orderId, patch) {
  if (!SUPABASE_SERVICE_ROLE_KEY) return;
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/orders?amazon_order_id=eq.${encodeURIComponent(orderId)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase PATCH failed for ${orderId}: ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}

function main() {
  loadEnvFromBackend();

  let ordersPath = process.argv[2];
  let updateSupabase = true;
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--no-supabase') updateSupabase = false;
    if (process.argv[i] === '--orders' && process.argv[i + 1]) ordersPath = process.argv[i + 1];
    if (process.argv[i] === '--backend-url' && process.argv[i + 1]) {
      process.env.BACKEND_URL = process.argv[i + 1];
    }
  }

  if (!ordersPath || !fs.existsSync(ordersPath)) {
    console.error('Usage: node scripts/submit-sibling-orders-to-lulu.js <orders.json> [--no-supabase] [--backend-url URL]');
    console.error('  orders.json must be a JSON array of exactly 2 order objects with orderId, interiorPdfR2Key, coverPdfR2Key, shipping_address');
    process.exit(1);
  }

  run(ordersPath, updateSupabase).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

main();
