#!/usr/bin/env node

/**
 * Sync 2B manifest from R2 inventory (backfill missing bgRemovedKey for poses 0–12).
 * Use when bg-removed images exist in R2 but 2b-manifest.json is incomplete.
 *
 * Usage:
 *   node scripts/sync-2b-manifest-for-order.js <orderId> [baseUrl]
 *
 * Example:
 *   node scripts/sync-2b-manifest-for-order.js 111-0060602-1283417
 *   node scripts/sync-2b-manifest-for-order.js 111-0060602-1283417 https://admin.littleherolabs.com
 *
 * Requires backend at baseUrl (default: http://localhost:3000).
 * No auth required for POST /api/orders/[orderId]/sync-2b-manifest.
 */

const http = require('http');
const https = require('https');

const orderId = process.argv[2];
const baseUrl = process.argv[3] || process.env.BACKEND_URL || 'http://localhost:3000';

if (!orderId) {
  console.error('Usage: node scripts/sync-2b-manifest-for-order.js <orderId> [baseUrl]');
  console.error('Example: node scripts/sync-2b-manifest-for-order.js 111-0060602-1283417');
  process.exit(1);
}

const url = new URL(`/api/orders/${encodeURIComponent(orderId)}/sync-2b-manifest`, baseUrl);
const isHttps = url.protocol === 'https:';
const lib = isHttps ? https : http;

const req = lib.request(
  {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname + url.search,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  },
  (res) => {
    let body = '';
    res.on('data', (ch) => (body += ch));
    res.on('end', () => {
      try {
        const data = body ? JSON.parse(body) : {};
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log('Sync 2B manifest result:', JSON.stringify(data, null, 2));
          if (data.updatedPoseNumbers?.length) {
            console.log('Updated poses:', data.updatedPoseNumbers.join(', '));
          }
          if (data.stillMissingPoseNumbers?.length) {
            console.log('Still missing in R2 or manifest:', data.stillMissingPoseNumbers.join(', '));
          }
        } else {
          console.error('Error:', res.statusCode, data.error || body);
          process.exit(1);
        }
      } catch (e) {
        console.error('Response:', res.statusCode, body);
        process.exit(1);
      }
    });
  }
);

req.on('error', (e) => {
  console.error('Request failed:', e.message);
  process.exit(1);
});
req.end(JSON.stringify({}));
