#!/usr/bin/env tsx
/** Explicit, hash-pinned release operations. Default is offline; no operation submits a print order. */
import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {BookConfigSchema} from '../src/lib/books/types';
import {sha256,reconcileAsset,type AssetStore} from '../src/lib/books/immutable-asset-upload';
import {configuredLocalAssetUses,LocalProofAssetMapSchema} from './helpers/inner-voice-local-assets';
import {computeBookConfigChecksum} from '../src/lib/books/runtime-book-config';

async function main(){
 const {values}=parseArgs({options:{candidate:{type:'string'},action:{type:'string',default:'offline'},'config-sha':{type:'string'},receipt:{type:'string'}}});
 assert.ok(values.candidate,'Supply --candidate <candidate-verified directory>');
 const action=values.action!;assert.ok(['offline','verify','upload','publish','activate'].includes(action),'Unknown action');
 if(action!=='offline')assert.ok(values.receipt&&!existsSync(resolve(values.receipt)),'Supply a new --receipt path before any remote operation');
 const dir=resolve(values.candidate),draft=BookConfigSchema.parse(JSON.parse(readFileSync(resolve(dir,'authoring-draft.json'),'utf8')));
 const manifest=JSON.parse(readFileSync(resolve(dir,'manifest.json'),'utf8')) as {candidateSha256:string;entries:Array<{key:string;sha256:string;role:string}>;unusedUnmappedAliases:string[]};
 assert.equal(sha256(readFileSync(resolve(dir,'authoring-draft.json'))),manifest.candidateSha256);
 const map=LocalProofAssetMapSchema.parse(JSON.parse(readFileSync(resolve(dir,'local-asset-map.json'),'utf8'))).assets;
 const config=structuredClone(draft);config.status='active';
 assert.equal(config.bookId,'book-finding-our-inner-voice');assert.ok(config.version>3);
 const bytes=Buffer.from(JSON.stringify(config,null,2)+'\n'),digest=sha256(bytes);
 if(action!=='offline')assert.equal(values['config-sha'],digest,'Supply the exact reviewed active-config SHA-256');
 const uses=configuredLocalAssetUses(config),entries=[...new Map(manifest.entries.filter(row=>uses.has(row.key)).map(row=>[row.key,row])).values()];
 for(const [key,source] of Object.entries(map))assert.equal(sha256(readFileSync(source.path)),source.sha256,`Local asset changed: ${key}`);
 if(action==='offline'){
  writeFileSync(resolve(dir,'release-config.json'),bytes);
  console.log(JSON.stringify({action,configVersion:config.version,releaseConfigSha256:digest,runtimeChecksum:computeBookConfigChecksum(config),newBackgroundKeys:entries.length,uploaded:false,activated:false}));return;
 }
 // No environment file is auto-loaded. The operator supplies current credentials explicitly.
 const storage=await import('../src/lib/r2-client');
 const bucket=process.env.R2_ASSETS_BUCKET_NAME||process.env.R2_PUBLIC_BUCKET_NAME;
 assert.ok(bucket&&bucket===storage.R2_PUBLIC_BUCKET&&storage.validateR2Config().valid,'An explicit, valid assets-bucket binding is required');
 const store:AssetStore={get:key=>storage.getObject(bucket,key,{allowNotFound:true}),putIfAbsent:(key,data,type)=>storage.putObject(bucket,key,data,type,{ifNoneMatch:'*'})};
 const uploaded=[];
 if(action==='upload')for(const row of entries){
  const path=map[row.key]?.path;assert.ok(path,'New background missing from asset map');
  const data=readFileSync(path);assert.ok(row.key.includes('/'+row.sha256+'/'),'Background key must be content-addressed');
  uploaded.push({key:row.key,result:await reconcileAsset(store,{taskId:row.role,source:path,sha256:row.sha256,r2Key:row.key,uploadApproved:true},data,config.bookId,config.version,true)});
 }
 // Always verify every mapped static asset before any config publication/activation.
 const verified=[];
 for(const key of uses.keys()){
  const source=map[key];
  if(!source){
   assert.ok(manifest.unusedUnmappedAliases.includes(key)&&/\/v1\/animals\/(?:cat|dog|lion|penguin|t-rex|tiger|unicorn)-clues\.png$/.test(key),'Unmapped selected asset');continue;
  }
  const response=await store.get(key);assert.ok(response.ok,`Remote asset unavailable (${response.status}): ${key}`);
  assert.equal(sha256(new Uint8Array(await response.arrayBuffer())),source.sha256,`Remote asset differs: ${key}`);verified.push(key);
 }
 let published=false,activated=false;
 if(action==='publish'||action==='activate'){
  const {publishBookConfig}=await import('../src/lib/books/runtime-book-config');
  const record=await publishBookConfig(config,{activate:action==='activate',publishedBy:'inner-voice-print-test-preparation-20261115'});
  assert.equal(record.checksum,computeBookConfigChecksum(config));published=true;activated=record.row.is_active===true;
 }
 const result={action,configVersion:config.version,releaseConfigSha256:digest,runtimeChecksum:computeBookConfigChecksum(config),verifiedAssets:verified.length,uploaded,published,activated,providerCalls:0,printSubmitted:false};
 assert.ok(values.receipt,'Supply --receipt for the completed operation record');
 writeFileSync(resolve(values.receipt),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
}
main().catch(error=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;});
