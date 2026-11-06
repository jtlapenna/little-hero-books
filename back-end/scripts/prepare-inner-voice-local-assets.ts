#!/usr/bin/env tsx
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { prepareInnerVoiceLocalAssets } from './helpers/inner-voice-local-assets';

async function main() {
  const { values } = parseArgs({ options: Object.fromEntries(
    ['config', 'asset-map', 'upload-plan', 'source-root', 'output', 'inventory'].map(key => [key, { type: 'string' as const }]),
  ), allowPositionals: false });
  for (const key of ['config', 'asset-map', 'upload-plan', 'source-root', 'output']) if (!values[key]) throw new Error(`Missing --${key}`);
  const result = await prepareInnerVoiceLocalAssets({ root: resolve(__dirname, '../..'),
    configFile: resolve(values.config!), assetMapFile: resolve(values['asset-map']!), uploadPlanFile: resolve(values['upload-plan']!),
    sourceRoot: resolve(values['source-root']!), output: resolve(values.output!),
    inventoryFile: values.inventory ? resolve(values.inventory) : undefined });
  console.log(JSON.stringify({ output: result.output, declaredKeys: result.report.declaredKeys,
    resolvedKeys: result.report.resolvedKeys, missing: result.report.missing.length,
    finalArtCandidateBound: result.report.finalArtCandidateBound, approved: false, printReady: false, liveRequests: 0 }));
  if (!result.report.localReferenceClosureComplete) process.exitCode = 2;
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
