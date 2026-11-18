/** Offline W0→W3 coverage of the back-name fit boundary; never generates images or submits orders. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,copyFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,extname,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {BookConfigSchema,RunManifestV3Schema} from '../../../back-end/src/lib/books/types';
import {buildW0RunManifestFromConfig} from '../../../back-end/src/lib/books/build-run-manifest';
import {buildW3AssemblyInput} from '../../../back-end/src/lib/books/w3-assembly-input';
import {buildW3PreviewPlan} from '../../../back-end/src/lib/books/w3-preview-plan';
import {LocalProofAssetMapSchema} from '../../../back-end/scripts/helpers/inner-voice-local-assets';

async function main(){
 const {values}=parseArgs({options:{'source-w0':{type:'string'},'source-2b':{type:'string'},'asset-map':{type:'string'},output:{type:'string'}}});
 for(const name of ['source-w0','source-2b','asset-map','output'] as const)assert.ok(values[name],name);
 globalThis.fetch=async()=>{throw Error('Offline name proof forbids network');};
 const read=(file:string)=>JSON.parse(readFileSync(file,'utf8'));
 const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
 const config=BookConfigSchema.parse(read(resolve(dirname(process.argv[1]),'candidate-config.json')));
 const source=RunManifestV3Schema.parse(read(values['source-w0']!));
 const twoB=read(values['source-2b']!);
 const map=LocalProofAssetMapSchema.parse(read(values['asset-map']!));
 const output=resolve(values.output!);mkdirSync(resolve(output,'assets'),{recursive:true});
 const manifest=read(resolve(output,'proof-manifest.json'));
 for(const count of [12,14,30])for(const format of ['amazon','standard']){
  const role=`M${count}-${format}`;
  const w0=buildW0RunManifestFromConfig(config,{orderId:source.order.orderId,platform:format==='amazon'?'amazon':'d2c',formatId:format,characterHash:twoB.characterHash,input:{characterSpecs:{...source.input.characterSpecs,childName:'M'.repeat(count),animalGuide:'tiger'},bookSpecs:{...source.input.bookSpecs,testMode:true}}});
  const b={...twoB,configVersion:6,bookId:config.bookId,order:{orderId:w0.order.orderId,bookId:config.bookId,formatId:format,configVersion:6}};
  const assembly=await buildW3AssemblyInput({orderId:w0.order.orderId,bookId:config.bookId,formatId:format},{loadManifest:async key=>key===w0.artifacts.manifestKey?w0:key===w0.artifacts.orderPrefix+'/manifests/2b-manifest.json'?b:null});
  const preview=buildW3PreviewPlan({...assembly,backendUrl:'https://offline.invalid'});
  const dependencies:Record<string,string>={};
  const html=preview.coverPreviewItem.coverHTML.replace(/https?:\/\/[^/"']+\/api\/assets\/([A-Za-z0-9._/-]+)/g,(_match,key:string)=>{
   const asset=map.assets[key];assert.ok(asset,key);const bytes=readFileSync(asset.path);assert.equal(sha(bytes),asset.sha256);
   const name='assets/'+asset.sha256+extname(asset.path);dependencies[name]=asset.sha256;
   if(!existsSync(resolve(output,name)))copyFileSync(asset.path,resolve(output,name));return '../'+name;
  });
  const width=config.rendering.preview.coverPx.w,height=config.rendering.preview.coverPx.h;
  const body=`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;width:${width}px;height:${height}px;overflow:hidden}</style></head><body>${html}</body></html>`;
  mkdirSync(resolve(output,role),{recursive:true});writeFileSync(resolve(output,role,'cover.html'),body);
  manifest.files=manifest.files.filter((r:{role:string})=>r.role!==role);
  manifest.files.push({role,pageLabel:'cover',file:role+'/cover.html',width,height,sha256:sha(Buffer.from(body)),dependencies});
 }
 writeFileSync(resolve(output,'proof-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify({nameBoundaryCases:6,networkCalls:0,generationCalls:0}));
}
main().catch(error=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;});
