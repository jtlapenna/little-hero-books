import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { assemble, writeAll } from './assemble-inner-voice-custom-flow-review';
const sha = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
async function main() {
  const source = Buffer.from('abcdefgh'); const written: number[] = [];
  await writeAll({ write: async (buffer, offset, length) => { const n = Math.min(3, length); written.push(...buffer.subarray(offset, offset + n)); return { bytesWritten:n }; } }, source);
  assert.deepEqual(Buffer.from(written), source);
  await assert.rejects(writeAll({ write: async () => ({ bytesWritten:0 }) }, source), /stalled PDF write/);
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'local-flow-pdf-test-'));
try {
  const proof = path.join(root,'proof'), raster = path.join(root,'raster'), output = path.join(root,'output');
  await fs.mkdir(path.join(proof,'A'),{recursive:true}); await fs.mkdir(path.join(proof,'assets')); await fs.mkdir(path.join(raster,'A'),{recursive:true});
  async function put(base: string, file: string, value: string) { const bytes=Buffer.from(value); await fs.writeFile(path.join(base,file),bytes); return sha(bytes); }
  const config = {bookId:'book',formats:{standard:{interior:{pageSequence:[{label:'p00'}]}}},rendering:{preview:{coverPx:{w:20,h:10},interiorPx:{w:10,h:10}}}};
  const configHash = await put(proof,'flow-config.json',JSON.stringify(config));
  const manifestHash = await put(proof,'flow-export-manifest.json','{}'), mapHash = await put(proof,'source-asset-map.json','{}'), ledgerHash = await put(proof,'source-pose-ledger.json','{}');
  const assetHash = await put(proof,'assets/a','asset');
  const selection = {role:'A',formatId:'standard'};
  const recordHash = await put(proof,'A/prepared-record.json',JSON.stringify({selection,orderId:'ORDER-A',rootOrderId:'ROOT',characterHash:'abc'}));
  const w0 = await put(proof,'A/w0.json','{}'), twoB = await put(proof,'A/retained-2b.json','{}');
  const cover = await put(proof,'A/cover.html','cover'), page = await put(proof,'A/p00.html','page');
  const coverPng = await put(raster,'A/cover.png','cover-png'), pagePng = await put(raster,'A/p00.png','page-png');
  const proofManifest = {schema:'lhb.custom-flow-local-proof@v1',approved:false,printReady:false,configSha256:configHash,flowManifestSha256:manifestHash,assetMapSha256:mapHash,poseLedgerSha256:ledgerHash,
    recordSha256:{A:recordHash},assets:{a:{file:'assets/a',sha256:assetHash}},cases:[{role:'A',selection,orderId:'ORDER-A',rootOrderId:'ROOT',characterHash:'abc',w0Sha256:w0,twoBSha256:twoB,
      files:[{label:'cover',file:'A/cover.html',sha256:cover,width:20,height:10},{label:'p00',file:'A/p00.html',sha256:page,width:10,height:10}]}]};
  let proofHash = await put(proof,'proof-manifest.json',JSON.stringify(proofManifest));
  const results = {schema:'lhb.custom-flow-local-rasters@v1',approved:false,printReady:false,proofManifestSha256:proofHash,networkAttempts:[],pages:[
    {role:'A',label:'cover',file:'A/cover.png',sha256:coverPng,width:20,height:10},{role:'A',label:'p00',file:'A/p00.png',sha256:pagePng,width:10,height:10}]};
  const saveResults = () => put(raster,'render-results.json',JSON.stringify(results));
  await saveResults();
  await fs.writeFile(path.join(raster,'A/p00.png'),'tampered');
  await assert.rejects(assemble(proof,raster,output),/Hash mismatch/);
  await assert.rejects(fs.stat(output),{code:'ENOENT'});
  await put(raster,'A/p00.png','page-png');
  proofManifest.cases[0].orderId='OTHER'; proofHash=await put(proof,'proof-manifest.json',JSON.stringify(proofManifest)); results.proofManifestSha256=proofHash; await saveResults();
  await assert.rejects(assemble(proof,raster,output)); await assert.rejects(fs.stat(output),{code:'ENOENT'});
  proofManifest.cases[0].orderId='ORDER-A'; proofHash=await put(proof,'proof-manifest.json',JSON.stringify(proofManifest)); results.proofManifestSha256=proofHash; await saveResults();
  await fs.mkdir(output); await fs.writeFile(path.join(output,'keep'),'untouched');
  await assert.rejects(assemble(proof,raster,output),{code:'EEXIST'});
  assert.equal(await fs.readFile(path.join(output,'keep'),'utf8'),'untouched');
  console.log('Local PDF fixture rejects tampering, child identity mismatch, and existing output.');
} finally { await fs.rm(root,{recursive:true,force:true}); }

}
main().catch(error => { console.error(error); process.exitCode = 1; });
