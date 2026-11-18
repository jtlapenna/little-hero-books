/** Offline actual W0→W3→W4→canonical PDF, with local verified rasters; no provider calls. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { parseArgs } from 'node:util';
import { BookConfigSchema, RunManifestV3Schema } from '../src/lib/books/types';
import { calculateCharacterHash } from '../src/lib/character-hash';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { normalizeW0Manifest } from '../src/lib/books/normalize-w0-manifest';
import { buildW0OrderUpsertPayload } from '../src/lib/w0-manifest-builder';
import { buildW3AssemblyInput } from '../src/lib/books/w3-assembly-input';
import { buildW3PreviewPlan } from '../src/lib/books/w3-preview-plan';
import { buildW3Manifest } from '../src/lib/books/w3-manifest';
import { buildW4PrintInput } from '../src/lib/books/w4-print-input';
import { assertW4GelatoPrintInput } from '../src/lib/books/w4-gelato-print-input';
import { resolveFrozenPrintRouting } from '../src/lib/books/print-routing';
import { buildGelatoPrintPdf } from '../src/lib/books/build-gelato-print-pdf';
import { buildBgRemovedPoseAssetKey } from '../src/lib/order-paths';
import { LocalProofAssetMapSchema } from './helpers/inner-voice-local-assets';

const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const read=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
async function main(){
  const {values}=parseArgs({options:{config:{type:'string'},proof:{type:'string'},'asset-map':{type:'string'},'source-w0':{type:'string'},'source-2b':{type:'string'},output:{type:'string'}}});
  for(const name of ['config','proof','asset-map','source-w0','source-2b','output'] as const)assert.ok(values[name],'Missing --'+name);
  globalThis.fetch=async()=>{throw Error('Offline PDF proof forbids network');};
  const config=BookConfigSchema.parse(read(values.config!)); assert.equal(config.status,'active','Use separately validated unpublished release artifact');
  const source=RunManifestV3Schema.parse(read(values['source-w0']!));
  const source2b=read(values['source-2b']!) as {entries:Array<{poseNumber:number;bgRemovedKey:string}>};
  const map=LocalProofAssetMapSchema.parse(read(values['asset-map']!));
  const proof=resolve(values.proof!),output=resolve(values.output!);mkdirSync(output,{recursive:true,mode:0o700});
  const renders=read(resolve(proof,'../render-results.json')) as {results:Array<{role:string;pageLabel:string;file:string;sha256:string;raster:string;rasterSha256:string;dependencies:Record<string,string>}>};
  const orderId=`LOCAL-FINAL-BOOK-V${config.version}`,bookId=config.bookId;
  const specs={...source.input.characterSpecs,childName:'Luca',animalGuide:'tiger'};
  const characterHash=calculateCharacterHash(specs,orderId);
  const w0=buildW0RunManifestFromConfig(config,{orderId,rootOrderId:orderId,amazonOrderId:orderId,platform:'amazon',formatId:'amazon',characterHash,
    runId:'offline-final-book',createdAt:'2026-11-18T00:00:00.000Z',input:{characterSpecs:specs,bookSpecs:{bookId,formatId:'amazon',configVersion:config.version,title:'Finding Our Inner Voice'},orderDetails:{quantity:1},dedicationText:'Luca, we love you!'}});
  const prefix=w0.artifacts.orderPrefix;
  const twoB={bookId,configVersion:config.version,renderSnapshot:w0.book.resolved.renderSnapshot,characterHash,
    order:{orderId,rootOrderId:orderId,amazonOrderId:orderId,bookId,formatId:'amazon',configVersion:config.version},
    entries:source2b.entries.map(e=>{const key=buildBgRemovedPoseAssetKey(characterHash,e.poseNumber,bookId);map.assets[key]=map.assets[e.bgRemovedKey];return{poseNumber:e.poseNumber,bgRemovedKey:key};})};
  const load=async(key:string)=>key===w0.artifacts.manifestKey?w0:key===prefix+'/manifests/2b-manifest.json'?twoB:null;
  const assembly=await buildW3AssemblyInput({orderId,bookId,formatId:'amazon',backendUrl:'https://offline.invalid'},{loadManifest:load});
  assert.equal(assembly.dedicationText,'Luca, we love you!');
  const preview=buildW3PreviewPlan({...assembly,backendUrl:'https://offline.invalid'});
  const localize=(html:string)=>html.replace(/https?:\/\/[^/"']+\/api\/assets\/([A-Za-z0-9._/-]+)/g,(_m,key:string)=>{
    const entry=map.assets[key];assert.ok(entry,'Missing proof dependency '+key);assert.equal(sha(readFileSync(entry.path)),entry.sha256);
    return '../assets/'+entry.sha256+extname(entry.path);
  });
  const pages=[{label:'cover',html:preview.coverPreviewItem.coverHTML,width:config.rendering.preview.coverPx.w,height:config.rendering.preview.coverPx.h,key:preview.coverPreviewItem.coverPngR2Key},
    ...preview.pagePreviewItems.map(p=>({label:p.pageLabel,html:p.pageHtml,width:config.rendering.preview.interiorPx.w,height:config.rendering.preview.interiorPx.h,key:p.pageImageR2Key}))];
  const sources:Array<{label:string;key:string;file:string;sha256:string}>=[];
  for(const page of pages){
    const raster=renders.results.find(r=>r.role==='luca'&&r.pageLabel===page.label);assert.ok(raster);
    const body=`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;width:${page.width}px;height:${page.height}px;overflow:hidden}</style></head><body>${localize(page.html)}</body></html>`;
    assert.equal(sha(Buffer.from(body)),raster.sha256,'Current W3 HTML differs from reviewed raster '+page.label);
    assert.equal(sha(readFileSync(resolve(proof,raster.file))),raster.sha256);
    for(const [name,digest]of Object.entries(raster.dependencies))assert.equal(sha(readFileSync(resolve(proof,name))),digest);
    assert.equal(sha(readFileSync(raster.raster)),raster.rasterSha256);
    sources.push({label:page.label,key:page.key,file:raster.raster,sha256:raster.rasterSha256});
  }
  const three=buildW3Manifest({...preview,pagePreviewImages:preview.pagePreviewItems.map(p=>({pageNumber:p.pageNumber,r2Key:p.pageImageR2Key})),coverPngR2Key:preview.coverPreviewItem.coverPngR2Key},{intake:normalizeW0Manifest(w0)});
  const row={...buildW0OrderUpsertPayload({normalizedInput:{orderId,characterHash},manifest:w0,manifestKey:w0.artifacts.manifestKey}),id:999999,orderId};
  const routing=resolveFrozenPrintRouting(row,w0);assert.equal(routing.orderDbId,999999);
  const w4=assertW4GelatoPrintInput(await buildW4PrintInput({orderId,bookId,formatId:'amazon',backendUrl:'https://offline.invalid'},{expectedProvider:'gelato',loadOrder:async()=>row,
    loadManifest:async key=>key===prefix+'/manifests/3-manifest.json'?three.manifest:load(key)}));
  let writes=0;const file=resolve(output,'luca-final-book-v'+config.version+'.pdf');
  const artifact=await buildGelatoPrintPdf(w4,'https://offline.invalid',{loadImage:async key=>{const source=sources.find(s=>s.key===key);assert.ok(source);return readFileSync(source.file);},
    putObject:async(_key,stream)=>{writes++;writeFileSync(file,Buffer.from(await new Response(stream).arrayBuffer()));}});
  assert.equal(writes,1);assert.equal(artifact.pageCount,35);
  writeFileSync(resolve(output,'w4-geometry.json'),JSON.stringify({providerPrintConfig:w4.providerPrintConfig},null,2)+'\n');
  writeFileSync(resolve(output,'assembly-receipt.json'),JSON.stringify({schema:'lhb.final-book-print-proof@v1',offlineOnly:true,published:false,providerCalls:0,generationCalls:0,
    configVersion:config.version,configSha256:sha(readFileSync(values.config!)),pdf:file,sha256:sha(readFileSync(file)),artifact,sources},null,2)+'\n');
  console.log(JSON.stringify({pdf:file,pages:35,verifiedRasters:sources.length,providerCalls:0,generationCalls:0}));
}
main().catch(error=>{console.error(error instanceof Error?error.message:error);process.exitCode=1});
