import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {decode, encode} from 'fast-png';
import {loadBundledBookConfig} from '../src/lib/books/load-book-config';
import {buildW0RunManifestFromConfig} from '../src/lib/books/build-run-manifest';
import {buildW2BPoseInput} from '../src/lib/books/w2b-pose-input';
import type {NormalizePoseScaleFn} from '../src/lib/pose-scale-normalization';
const sourcePath=path.resolve(__dirname,'../src/lib/pose-scale-normalization.ts');
const config=loadBundledBookConfig({bookId:'book-finding-our-inner-voice',version:1});
const orderId='TEST-NORMALIZATION-CONTAINMENT',characterHash='0123456789abcdef';
const w0=buildW0RunManifestFromConfig(config,{orderId,platform:'d2c',characterHash,input:{bookSpecs:{testMode:true},characterSpecs:{childName:'Fixture'}}});
const pose=Object.values(w0.book.resolved.renderSnapshot!.bookConfig.rendering.recipe!.poses).find(p=>p.poseNumber===11)!;
const input=buildW2BPoseInput({orderId,bookId:config.bookId,characterHash,poseNumber:11,approvedKey:`${config.bookId}/order-generated-assets/characters/${characterHash}/poses/pose11.png`});
function runtime(source:string,store:Map<string,Uint8Array>){
 const require=createRequire(sourcePath),ts=require('typescript');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports:{normalizePoseScaleAsset?:NormalizePoseScaleFn}={};
 new Function('exports','require',compiled)(exports,(name:string)=>name==='@/lib/r2-client'?{getObject:async(_bucket:string,key:string)=>{assert.ok(store.has(key),key);return new Response(store.get(key)! as BodyInit)},putObject:async(_bucket:string,key:string,bytes:Uint8Array)=>{store.set(key,Uint8Array.from(bytes))}}:require(name));
 return exports.normalizePoseScaleAsset!;
}
function png(width:number,height:number,paint:(x:number,y:number)=>number[]|null){const data=new Uint8Array(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const color=paint(x,y);if(color)data.set([...color,255],(y*width+x)*4)}return encode({width,height,data,channels:4});}
function stats(bytes:Uint8Array){const p=decode(bytes);let count=0;const colors=new Set<string>();for(let i=0;i<p.data.length;i+=4)if(p.data[i+3]>128){count++;colors.add([p.data[i],p.data[i+1],p.data[i+2]].join(','))}return {count,colors};}
async function run(sourceBytes:Uint8Array,refBytes:Uint8Array,source=fs.readFileSync(sourcePath,'utf8')){const store=new Map([[input.bgRemovedKey,sourceBytes],[pose.referenceKey,refBytes]]);const normalize=runtime(source,store);const result=await normalize({imageKey:input.bgRemovedKey,referenceKey:pose.referenceKey,poseNumber:11,bookId:config.bookId,mode:'strict'});return {result,bytes:store.get(input.bgRemovedKey)!,normalize,store};}
async function main(){
 const flight=(x:number,y:number)=>{if(x>=70&&x<=130&&y>=20&&y<=95)return [200,40,40];if(x>=10&&x<=70&&y>=35&&y<=45)return [30,80,200];if(x>=125&&x<=175&&y>=90&&y<=105)return [40,180,70];return null};
 const source=png(200,200,flight),ref=png(200,200,(x,y)=>flight(199-x,y));
 const adjusted=await run(source,ref);assert.equal(adjusted.result.containmentAdjusted,true);assert.equal(stats(adjusted.bytes).count,stats(source).count);assert.deepEqual(stats(adjusted.bytes).colors,stats(source).colors);
 const first=Buffer.from(adjusted.bytes);for(let i=0;i<3;i++){await adjusted.normalize({imageKey:input.bgRemovedKey,referenceKey:pose.referenceKey,poseNumber:11,bookId:config.bookId,mode:'strict'});assert.deepEqual(Buffer.from(adjusted.store.get(input.bgRemovedKey)!),first,'Repeated normalization must preserve corrected pixels');}
 const wide=png(200,200,(x,y)=>x>=10&&x<=189&&y>=70&&y<=109?(x<20?[200,40,40]:x>179?[40,180,70]:[30,80,200]):null);
 const tall=png(200,200,(x,y)=>x>=70&&x<=129&&y>=10&&y<=189?[30,80,200]:null);
 const fit=await run(wide,tall),t=fit.result.appliedTransform!;assert.equal(fit.result.containmentAdjusted,true);assert.ok(t.left>=0&&t.top>=0&&t.left+t.width<=200&&t.top+t.height<=200);assert.ok(t.scaleFactor<2);assert.deepEqual(stats(fit.bytes).colors,stats(wide).colors);
 const standing=png(200,200,(x,y)=>x>=80&&x<=119&&y>=50&&y<=129?[200,40,40]:null),standingRef=png(200,200,(x,y)=>x>=75&&x<=124&&y>=40&&y<=139?[200,40,40]:null);
 const ordinary=await run(standing,standingRef);assert.equal(ordinary.result.containmentAdjusted,undefined);
 if(process.env.LHL_NORMALIZATION_BASE_SOURCE){const baseline=fs.readFileSync(process.env.LHL_NORMALIZATION_BASE_SOURCE,'utf8');const old=await run(source,ref,baseline);assert.ok(stats(old.bytes).count<stats(source).count*.8,'Old sampler must reproduce clipping');assert.deepEqual((await run(standing,standingRef,baseline)).bytes,ordinary.bytes,'Contained legacy output must remain byte-identical');}
 if(process.env.LHL_NORMALIZATION_PROOF_ROOT){const root=process.env.LHL_NORMALIZATION_PROOF_ROOT;const approved=fs.readFileSync(path.join(root,'hosted-generation/E/pose11-provider-original.png')),reference=fs.readFileSync(path.join(root,pose.referenceKey));const actual=await run(approved,reference);assert.equal(actual.result.containmentAdjusted,true);const before=Buffer.from(actual.bytes);await actual.normalize({imageKey:input.bgRemovedKey,referenceKey:pose.referenceKey,poseNumber:11,bookId:config.bookId,mode:'strict'});assert.deepEqual(Buffer.from(actual.store.get(input.bgRemovedKey)!),before,'Actual fly output must be idempotent');fs.writeFileSync(path.join(root,'hosted-generation/E/pose11-contained-local.png'),before);console.log('Actual provider fly PNG and canonical frozen reference persist complete, idempotent silhouette');}
 console.log('Canonical normalization persistence: containment, uniform fit, unchanged contained output and repeat safety passed');
}
main().catch(e=>{console.error(e.stack);process.exitCode=1});
