#!/usr/bin/env tsx
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { prepareFinalArtCandidate, validateFinalArtCandidate } from '../src/lib/books/final-art-candidate';

async function main() {
  const { values } = parseArgs({ options: Object.fromEntries(
    ['config', 'recipe', 'cover', 'page06', 'page07', 'logo', 'barcode', 'panel', 'output'].map(key => [key, { type: 'string' as const }]),
  ), allowPositionals: false });
  for (const key of ['config', 'recipe', 'cover', 'page06', 'page07', 'logo', 'barcode', 'panel', 'output']) {
    if (!values[key]) throw new Error(`Missing --${key}. Supply all six PNGs, draft config, cover recipe and a new output directory with an existing parent.`);
  }
  const root = resolve(__dirname, '../..');
  const inventoryFile = await prepareFinalArtCandidate({ root, output: resolve(values.output!),
    configFile: resolve(values.config!), recipeFile: resolve(values.recipe!), assets: {
      'cover-background': resolve(values.cover!), 'page-06-background': resolve(values.page06!),
      'page-07-background': resolve(values.page07!), 'cover-logo': resolve(values.logo!),
      'cover-barcode': resolve(values.barcode!), 'cover-try-panel': resolve(values.panel!),
    } });
  const candidate = await validateFinalArtCandidate(root, inventoryFile);
  console.log(JSON.stringify({ inventoryFile, inventorySha256: candidate.inventorySha256,
    configSha256: candidate.inventory.configSha256, assets: candidate.inventory.entries.length,
    approved: false, printReady: false, remoteChecked: false }));
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
