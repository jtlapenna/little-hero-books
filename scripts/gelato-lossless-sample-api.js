#!/usr/bin/env node
/* Quote the Gelato lossless sample order without exposing the API key. */

const fs = require('fs');
const path = require('path');

function parseEnvFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

const root = path.resolve(__dirname, '..');
const env = {
  ...parseEnvFile(path.join(root, '.env')),
  ...parseEnvFile(path.join(root, 'back-end/.env.local')),
  ...process.env,
};

const apiKey = env.GELATO_API_KEY;
if (!apiKey) {
  console.error('Missing GELATO_API_KEY. Add it to .env before running this script.');
  process.exit(1);
}

function requiredEnv(key) {
  const value = env[key];
  if (!value || !String(value).trim()) {
    console.error(`Missing ${key}. Add it to .env before creating Gelato sample quotes/orders.`);
    process.exit(1);
  }
  return String(value).trim();
}

const productUid =
  'photobooks-softcover_pf_200x200-mm-8x8-inch_pt_170-gsm-65lb-coated-silk_cl_4-4_ccl_4-4_bt_glued-left_ct_matt-lamination_prt_1-0_cpt_250-gsm-100-lb-cover-coated-silk_ver';

const fileUrl =
  'https://admin.littleherolabs.com/api/pdf/book-mvp-simple-adventure/orders/GELATO-LOSSLESS-SAMPLE-20260526/gelato-8x8-softcover-30-inner-pages-lossless-upload.pdf?proxy=true';

const referenceSuffix = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);

const quotePayload = {
  orderReferenceId: `LHL-GELATO-LOSSLESS-QUOTE-${referenceSuffix}`,
  customerReferenceId: 'LHL-INTERNAL-SAMPLE',
  currency: 'USD',
  allowMultipleQuotes: false,
  recipient: {
    firstName: requiredEnv('GELATO_SAMPLE_FIRST_NAME'),
    lastName: requiredEnv('GELATO_SAMPLE_LAST_NAME'),
    addressLine1: requiredEnv('GELATO_SAMPLE_ADDRESS_LINE_1'),
    addressLine2: env.GELATO_SAMPLE_ADDRESS_LINE_2 || undefined,
    city: requiredEnv('GELATO_SAMPLE_CITY'),
    state: requiredEnv('GELATO_SAMPLE_STATE'),
    postCode: requiredEnv('GELATO_SAMPLE_POST_CODE'),
    country: env.GELATO_SAMPLE_COUNTRY || 'US',
    email: requiredEnv('GELATO_SAMPLE_EMAIL'),
    phone: env.GELATO_SAMPLE_PHONE || undefined,
  },
  products: [
    {
      itemReferenceId: 'gelato-lossless-8x8-30p',
      productUid,
      pageCount: 30,
      files: [{ type: 'default', url: fileUrl }],
      quantity: 1,
    },
  ],
};

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }

  return { response, body };
}

function summarizeQuote(body) {
  const quotes = Array.isArray(body?.quotes) ? body.quotes : [];
  return quotes.map((quote) => ({
    quoteId: quote.id,
    fulfillmentCountry: quote.fulfillmentCountry,
    products: quote.products,
    shipmentMethods: (quote.shipmentMethods || []).map((method) => ({
      name: method.name,
      shipmentMethodUid: method.shipmentMethodUid,
      type: method.type,
      price: method.price,
      currency: method.currency,
      minDeliveryDays: method.minDeliveryDays,
      maxDeliveryDays: method.maxDeliveryDays,
      minDeliveryDate: method.minDeliveryDate,
      maxDeliveryDate: method.maxDeliveryDate,
    })),
  }));
}

async function main() {
  const { response, body } = await postJson(
    'https://order.gelatoapis.com/v4/orders:quote',
    quotePayload,
  );

  const output = {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    request: {
      orderReferenceId: quotePayload.orderReferenceId,
      productUid,
      pageCount: 30,
      fileUrl,
    },
    quoteSummary: summarizeQuote(body),
    rawResponse: body,
  };

  const outPath = path.join(root, 'reports/gelato-lossless-sample-quote.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
