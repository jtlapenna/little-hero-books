#!/usr/bin/env tsx
import { resolve } from 'node:path';
import { reconcileFinalArtCandidate, validateFinalArtCandidate } from '../src/lib/books/final-art-candidate';

async function main() {
  const [action, inventoryFile, approvalFile, ...extra] = process.argv.slice(2);
  if (!['--offline', '--verify-remote', '--apply'].includes(action) || !inventoryFile || extra.length ||
    (action === '--offline' ? Boolean(approvalFile) : !approvalFile)) {
    throw new Error('Usage: upload-inner-voice-final-art.ts --offline <inventory.json> | --verify-remote|--apply <inventory.json> <approval.json>');
  }
  const root = resolve(__dirname, '../..');
  if (action === '--offline') {
    const candidate = await validateFinalArtCandidate(root, resolve(inventoryFile));
    console.log(JSON.stringify({ assets: candidate.inventory.entries.length, approved: false, printReady: false,
      inventorySha256: candidate.inventorySha256, configSha256: candidate.inventory.configSha256, remoteChecked: false }));
    return;
  }
  const results = await reconcileFinalArtCandidate({ root, inventoryFile: resolve(inventoryFile),
    approvalFile: resolve(approvalFile!), write: action === '--apply', store: async () => {
      const bucket = process.env.R2_PUBLIC_BUCKET_NAME || process.env.R2_ASSETS_BUCKET_NAME || process.env.R2_PUBLIC_BUCKET;
      if (!bucket) throw new Error('Set an explicit public R2 bucket');
      const { R2_PUBLIC_BUCKET, validateR2Config, getObject, putObject } = await import('../src/lib/r2-client');
      if (!validateR2Config().valid || R2_PUBLIC_BUCKET !== bucket) throw new Error('R2 credentials or bucket missing');
      return { get: key => getObject(bucket, key, { allowNotFound: true }),
        putIfAbsent: (key, data, type) => putObject(bucket, key, data, type, { ifNoneMatch: '*' }) };
    } });
  console.log(JSON.stringify({ action, results, configPublished: false, printReady: false }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
