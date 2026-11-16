#!/usr/bin/env tsx
/** Candidate-to-runtime regression: baked pixels, immutable identity, CSV selection and frozen rendering. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { BookConfigSchema } from '../src/lib/books/types';
import { sha256 } from '../src/lib/books/immutable-asset-upload';
import { buildBookConfigPublishPayload } from '../src/lib/books/runtime-book-config';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { buildW3AssemblyInput } from '../src/lib/books/w3-assembly-input';
import { buildW3PreviewPlan } from '../src/lib/books/w3-preview-plan';
import { buildBgRemovedPoseAssetKey } from '../src/lib/order-paths';

async function main() {
  assert.ok(process.argv[2], 'Supply the candidate directory');
  const dir = resolve(process.argv[2]);
  const config = BookConfigSchema.parse(JSON.parse(readFileSync(resolve(dir, 'authoring-draft.json'), 'utf8')));
  const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json'), 'utf8'));
  const map = JSON.parse(readFileSync(resolve(dir, 'local-asset-map.json'), 'utf8')).assets as Record<string, {path:string;sha256:string}>;
  assert.equal(config.status, 'draft'); assert.equal(manifest.runtimeShadowLayers, 0);
  assert.equal(manifest.entries.length, 73);
  for (const entry of manifest.entries) {
    const raw = readFileSync(entry.source); assert.equal(sha256(raw), entry.sourceSha256);
    // Constant-color pages share the final blank-slot key, but retain all 32 source-page receipts.
    const frozen = readFileSync(map[entry.key]?.path ?? resolve(dir, 'assets', entry.sha256+'.png')); assert.equal(sha256(frozen), entry.sha256);
    assert.ok(entry.key.includes('/'+entry.sha256+'/'), 'Immutable key must bind full image bytes');
    assert.equal((await sharp(frozen).metadata()).channels, 3);
    const a = await sharp(raw).removeAlpha().raw().toBuffer();
    const b = await sharp(frozen).raw().toBuffer();
    assert.equal(sha256(a), sha256(b), 'Flattening may not change approved RGB pixels');
  }
  console.log('PASS all 73 immutable background bindings preserve approved RGB pixels and source hashes');
  for (const key of Object.values(config.assets.guideBackgrounds!.page_13)) assert.ok(manifest.entries.some((row:{key:string})=>row.key===key));
  assert.ok(!JSON.stringify(config).includes('Copyright details pending'));
  console.log('PASS every guide uses the baked page-13 shadow; no pending imprint remains');

  // Use actual configured W0/W3 owners, with network-denied manifest transport.
  let networkAttempts = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { networkAttempts++; throw Error('Offline candidate check forbids network'); };
  for (const formatId of ['standard','amazon']) for (const guide of Object.keys(config.assets.guideBackgrounds!.page_13)) {
    const orderId = `PRINT-PREP-${formatId}-${guide}`, characterHash = 'offline-print-prep';
    const w0 = buildW0RunManifestFromConfig(config, {orderId,platform:formatId==='amazon'?'amazon':'d2c',formatId,characterHash,
      input:{bookSpecs:{testMode:true},characterSpecs:{childName:'Alexandra',animalGuide:guide,pronouns:'they/them',hometown:'Grass Valley'}}});
    assert.equal(w0.book.bookConfigRef.version, config.version);
    const twoB = {characterHash,order:{orderId,bookId:config.bookId},entries:Object.values(config.rendering.recipe!.poses).map(p=>({poseNumber:p.poseNumber,bgRemovedKey:buildBgRemovedPoseAssetKey(characterHash,p.poseNumber,config.bookId)}))};
    const input = await buildW3AssemblyInput({orderId,bookId:config.bookId,formatId,testMode:true,testModePages:0},
      {loadManifest:async key=>key.endsWith('1-manifest.json')?w0:key.endsWith('2b-manifest.json')?twoB:null});
    const preview = buildW3PreviewPlan({...input,backendUrl:'https://offline.invalid'});
    assert.equal(preview.pagePreviewItems.length,32);
    const html = preview.pagePreviewItems[12].pageHtml;
    assert.ok(html.includes(config.assets.guideBackgrounds!.page_13[guide]));
    assert.ok(!/data-layer-id="[^"]*shadow/.test(html), 'No duplicate runtime shadow layer');
  }
  console.log('PASS actual W0/W3 retain candidate version, all 32 pages and baked guide backgrounds in 16 cases');

  // A local fake PostgREST proves the current Amazon selector without reading/writing customer data.
  process.env.SUPABASE_URL='https://print-prep.invalid'; process.env.SUPABASE_SERVICE_ROLE_KEY='offline-only';
  let row: Record<string,unknown> | null = null;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
    if (url.hostname!=='print-prep.invalid' || !url.pathname.endsWith('/rest/v1/book_configs')) {networkAttempts++;throw Error('Unexpected request');}
    const matches = row && (!url.searchParams.has('is_active') || row.is_active===true) &&
      (!url.searchParams.has('version') || String(row.version)===url.searchParams.get('version')!.replace(/^eq\./,''));
    if (new Headers(init?.headers).get('accept')?.includes('vnd.pgrst.object'))
      return matches?Response.json(row):Response.json({code:'PGRST116',message:'no rows',details:'The result contains 0 rows'},{status:406});
    return Response.json(matches?[row]:[]);
  };
  const {resolveCsvBookSelection}=await import('../src/lib/csv-book-selection');
  const form=()=>{const f=new FormData();f.append('bookId',config.bookId);f.append('formatId','amazon');f.append('configVersion',String(config.version));return f;};
  row=buildBookConfigPublishPayload(config,{activate:false});
  await assert.rejects(resolveCsvBookSelection(form()));
  const active=structuredClone(config);active.status='active';row=buildBookConfigPublishPayload(active,{activate:true});
  const selection=await resolveCsvBookSelection(form());assert.equal(selection?.configVersion,config.version);assert.equal(selection?.totalPages,32);
  row={...row,checksum:'0'.repeat(64)};await assert.rejects(resolveCsvBookSelection(form()));
  globalThis.fetch=originalFetch;assert.equal(networkAttempts,0);
  console.log('PASS actual Amazon CSV selection rejects the draft and checksum drift, accepts exact active candidate only; external requests 0');
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
