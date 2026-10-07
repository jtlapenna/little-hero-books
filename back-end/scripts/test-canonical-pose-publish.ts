import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {loadBundledBookConfig} from '../src/lib/books/load-book-config';
import {buildW0RunManifestFromConfig} from '../src/lib/books/build-run-manifest';
import {buildW2ARunManifest} from '../src/lib/books/w2a-manifest';
const workflow=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../docs/n8n-workflow-files/repo-centric/workflows/w2A-SW3-Upload.repo-centric.json'),'utf8'));
async function terminal(name:string,input:Record<string,unknown>,acks:unknown[]){const code=workflow.nodes.find((n:{name:string})=>n.name===name).parameters.jsCode;return new(Object.getPrototypeOf(async function(){}).constructor)('$json','$items','$runIndex',code)(input,()=>acks.map(json=>({json})),0) as Promise<{json:Record<string,unknown>}>;}
async function main(){
 const config=loadBundledBookConfig({bookId:'book-finding-our-inner-voice',version:1}),orderId='TEST-CANONICAL-PUBLISH',characterHash='0123456789abcdef';
 const w0=buildW0RunManifestFromConfig(config,{orderId,platform:'d2c',characterHash,input:{bookSpecs:{testMode:true},characterSpecs:{childName:'Zoë',animalGuide:'owl'}}});
 for(const name of ['Keep Auto Flip Status','Return Upload Results']){
  const results=[];
  for(const pose of Object.values(config.rendering.recipe!.poses)){
   const stable=`${config.bookId}/order-generated-assets/characters/${characterHash}/poses/pose${String(pose.poseNumber).padStart(2,'0')}.png`,old=stable.replace('.png','_r1.png');
   const context={orderId,rootOrderId:orderId,amazonOrderId:orderId,bookId:config.bookId,characterHash,renderSnapshot:w0.book.resolved.renderSnapshot,oneManifestUrl:`${config.bookId}/orders/${orderId}/manifests/1-manifest.json`};
   const input={...context,orderContext:context,poseNumber:pose.poseNumber,currentPoseNumber:pose.poseNumber,uploadKey:old,storageKey:old,publicR2Url:'https://assets.example.test',publicUrl:'https://assets.example.test/'+old,qaPass:true,qaCombinedPass:true,autoFlipStatus:'ORIGINAL',__meta:{storageKey:old,uploadKey:old,flipPolicy:'keep'}};
   const ack={success:true,orderId,poseNumber:pose.poseNumber,r2Key:stable,replacedAt:'2026-10-07T00:00:00Z',replacementCount:1};
   const out=await terminal(name,input,[ack]);assert.equal(out.json.approvedKey,stable);assert.equal(out.json.storageKey,stable);assert.equal(out.json.uploadKey,stable);assert.equal(out.json.publicUrl,'https://assets.example.test/'+stable);assert.equal(out.json.qaPass,true);assert.equal((out.json.__meta as {flipPolicy:string}).flipPolicy,'keep');results.push(out.json);
   await assert.rejects(()=>terminal(name,input,[]),/acknowledgement/);await assert.rejects(()=>terminal(name,input,[{...ack,orderId:'OTHER'}]),/acknowledgement/);await assert.rejects(()=>terminal(name,input,[{...ack,poseNumber:999}]),/acknowledgement/);await assert.rejects(()=>terminal(name,input,[{...ack,success:false}]),/acknowledgement/);await assert.rejects(()=>terminal(name,input,[ack,ack]),/acknowledgement/);
  }
  const built=buildW2ARunManifest({orderId,rootOrderId:orderId,bookId:config.bookId,characterHash,results,totalPoses:13,numPoses:13,includeZeroPose:true,allowZeroPose:true});
  const entries=built.manifest.entries as Array<Record<string,unknown>>,summary=built.manifest.summary as Record<string,unknown>;assert.ok(Array.isArray(entries));assert.equal(entries.length,13);assert.equal(summary.readyForBook,true);assert.ok(entries.every(e=>e.approvedKey&&!String(e.approvedKey).includes('_r1')));
  const child=orderId+'-item-1',stable=`${config.bookId}/order-generated-assets/characters/${characterHash}/poses/pose00.png`;
  const sibling=await terminal(name,{orderId,rootOrderId:orderId,amazonOrderId:orderId,manifestKey:`${config.bookId}/orders/${child}/manifests/1-manifest.json`,characterHash,poseNumber:0,qaPass:true,claimGroupSize:2,orderContext:{orderId:child,rootOrderId:orderId}},[{success:true,orderId:child,poseNumber:0,r2Key:stable}]);assert.equal(sibling.json.orderId,child);assert.equal(sibling.json.rootOrderId,orderId);
  const legacyKey=`book-mvp-simple-adventure/order-generated-assets/characters/${characterHash}/poses/pose00.png`;
  const legacy=await terminal(name,{orderId,rootOrderId:orderId,characterHash,poseNumber:0,uploadKey:legacyKey,storageKey:legacyKey,qaPass:true},[{success:true,orderId,poseNumber:0,r2Key:legacyKey}]);assert.equal(legacy.json.approvedKey,legacyKey);
 }
 console.log('Canonical persisted publish keys reach manifest for13named slots, retries, zero, legacy and sibling cases');
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
