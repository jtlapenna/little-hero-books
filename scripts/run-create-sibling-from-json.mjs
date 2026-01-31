#!/usr/bin/env node
/**
 * Build payload from customization JSON and call create-sibling API.
 * Usage: node scripts/run-create-sibling-from-json.mjs <path-to-152767221929961.json>
 */
import fs from 'fs';
import path from 'path';

const jsonPath = process.argv[2] || '/Users/jeff/Desktop/114-7080737-5512234_152767221929961/152767221929961.json';
const orderId = '114-7080737-5512234';
const orderItemId = '152767221929961';
const apiUrl = 'https://admin.littleherolabs.com/api/admin/orders/' + orderId + '/create-sibling';

const custom = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const payload = { customization_json: custom, order_item_id: orderItemId };

const res = await fetch(apiUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Origin': 'https://admin.littleherolabs.com',
  },
  body: JSON.stringify(payload),
});

const text = await res.text();
let json;
try {
  json = JSON.parse(text);
} catch {
  json = { raw: text };
}
console.log('Status:', res.status, res.statusText);
console.log(JSON.stringify(json, null, 2));
process.exit(res.ok ? 0 : 1);
