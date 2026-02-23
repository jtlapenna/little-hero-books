#!/usr/bin/env npx tsx
/**
 * Test check-and-flip-orientation endpoint without n8n.
 * Usage:
 *   npx tsx scripts/test-check-and-flip.ts [baseUrl] [characterHash] [poseNumber]
 * Examples:
 *   npx tsx scripts/test-check-and-flip.ts
 *   npx tsx scripts/test-check-and-flip.ts http://localhost:3001 d442cde92b91c581 3
 *   npx tsx scripts/test-check-and-flip.ts https://admin.littleherolabs.com d442cde92b91c581 3
 */

async function main() {
  const BASE_URL = process.argv[2] || 'http://localhost:3001';
  const CHARACTER_HASH = process.argv[3] || 'd442cde92b91c581';
  const POSE_NUMBER = parseInt(process.argv[4] || '3', 10);

  const PUBLIC_R2 = 'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev';
  const ASSETS_ROOT = 'book-mvp-simple-adventure/order-generated-assets';
  const REF_ROOT = 'book-mvp-simple-adventure/characters/poses';

  const poseNN = String(POSE_NUMBER).padStart(2, '0');
  const imageUrl = `${PUBLIC_R2}/${ASSETS_ROOT}/characters/${CHARACTER_HASH}/poses/pose${poseNN}.png`;
  const poseRefUrl = `${PUBLIC_R2}/${REF_ROOT}/pose${poseNN}.png`;

  const payload = { imageUrl, poseRefUrl, characterHash: CHARACTER_HASH, poseNumber: POSE_NUMBER };

  console.log('POST', `${BASE_URL}/api/check-and-flip-orientation`);
  console.log('Payload:', JSON.stringify(payload, null, 2));
  console.log('---');

  const res = await fetch(`${BASE_URL}/api/check-and-flip-orientation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }

  console.log('Status:', res.status, res.statusText);
  console.log('Response:', JSON.stringify(json, null, 2));

  if (!res.ok) process.exit(1);
}

main();
