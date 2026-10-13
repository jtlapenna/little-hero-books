import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { gelatoCustomerStatusMessage } from '../src/lib/books/gelato-consumer-status';

async function main() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const statusApiSource = readFileSync(resolve(scriptDir, '../src/app/api/preview/[orderId]/status/route.ts'), 'utf8');
  const approvalPageSource = readFileSync(resolve(scriptDir, '../../frontend/src/pages/approve/[token].astro'), 'utf8');

  assert.match(statusApiSource, /statusLong:\s*statusInfo\.long/);
  assert.match(statusApiSource, /statusIcon:\s*statusInfo\.icon/);
  assert.match(statusApiSource, /statusColor:\s*statusInfo\.color/);
  assert.match(statusApiSource, /printProvider:\s*isGelato\s*\?\s*'gelato'/);
  assert.match(statusApiSource, /luluStatus:\s*isGelato\s*\?\s*null/);

  assert.match(approvalPageSource, /statusData\.printProvider\s*===\s*'gelato'/);
  assert.match(approvalPageSource, /getGelatoStatusConfig\(statusData\)/);
  assert.match(approvalPageSource, /statusData\.statusLong/);
  assert.match(approvalPageSource, /statusData\.statusIcon/);
  assert.match(approvalPageSource, /statusData\.statusColor/);
  assert.match(approvalPageSource, /gelatoIcon\.textContent\s*=\s*providerIcon/);
  assert.match(approvalPageSource, /statusMessage\.textContent\s*=\s*statusConfig\.message/);
  assert.match(approvalPageSource, /getStatusConfig\(luluStatus,\s*statusData\.status\)/);
  assert.match(approvalPageSource, /statusData\.packages/);
  assert.match(approvalPageSource, /parcel\.carrier/);
  assert.match(approvalPageSource, /parcel\.trackingNumber/);
  assert.match(approvalPageSource, /link\.href\s*=\s*parcel\.trackingUrl/);
  assert.match(approvalPageSource, /trackingDetails\.replaceChildren\(\)/);
  assert.match(approvalPageSource, /iconType === 'success'\) iconWrapper\.classList\.add\('status-icon-success'\)/);

  const safeTrackingFunction = approvalPageSource.match(/function getSafeTrackingUrl\(value\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(safeTrackingFunction, 'customer page defines its tracking URL validator');
  const getSafeTrackingUrl = new Function(`${safeTrackingFunction}; return getSafeTrackingUrl;`)() as (value: unknown) => string | null;
  const packageFixtures = [
    { carrier: 'UPS', trackingNumber: '1Z-SYNTHETIC', trackingUrl: 'https://carrier.example.test/track/1Z-SYNTHETIC' },
    { carrier: 'USPS', trackingNumber: '9400-SYNTHETIC', trackingUrl: 'javascript:alert(1)' },
  ].map((parcel) => ({ ...parcel, safeTrackingUrl: getSafeTrackingUrl(parcel.trackingUrl) }));
  assert.equal(packageFixtures.length, 2, 'each provider package remains independently represented');
  assert.equal(packageFixtures[0].carrier, 'UPS');
  assert.equal(packageFixtures[0].safeTrackingUrl, 'https://carrier.example.test/track/1Z-SYNTHETIC');
  assert.equal(packageFixtures[1].carrier, 'USPS');
  assert.equal(packageFixtures[1].safeTrackingUrl, null, 'unsafe tracking URL is excluded');

  const printing = gelatoCustomerStatusMessage('in_production', 'order');
  assert.equal(printing.short, 'Printing');
  assert.equal(printing.long, 'Your book is being printed.');
  assert.equal(printing.icon, '📖');
  assert.equal(printing.color, 'blue');

  const shipped = gelatoCustomerStatusMessage('shipped', 'order');
  assert.equal(shipped.short, 'Shipped');
  assert.equal(shipped.long, 'Your book is with the carrier.');
  assert.equal(shipped.icon, '📦');
  assert.equal(shipped.color, 'green');

  const delivered = gelatoCustomerStatusMessage('delivered', 'order');
  assert.equal(delivered.short, 'Delivered');
  assert.equal(delivered.color, 'green');

  const returned = gelatoCustomerStatusMessage('returned', 'order');
  assert.equal(returned.short, 'Order update needed');
  assert.equal(returned.color, 'orange');

  const canceled = gelatoCustomerStatusMessage('canceled', 'order');
  assert.equal(canceled.short, 'Canceled');
  assert.equal(canceled.color, 'gray');

  console.log('test-approval-gelato-status-consumer: ok');
}

main().catch((error) => {
  console.error('test-approval-gelato-status-consumer: failed');
  console.error(error);
  process.exit(1);
});
