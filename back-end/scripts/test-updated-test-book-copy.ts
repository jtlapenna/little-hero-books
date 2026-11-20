import assert from 'node:assert/strict';
import { updatedTestBookFixture } from './updated-test-book-fixture';
import { inspectUpdatedTestBookCopy, prepareUpdatedTestBookCopy } from '../src/lib/books/updated-test-book-copy';
import { adminWorkflowTestAdmission, adminWorkflowTestMayRoute } from '../src/lib/admin-workflow-test';
import { buildW3AssemblyInput } from '../src/lib/books/w3-assembly-input';
import { buildW3PreviewPlan } from '../src/lib/books/w3-preview-plan';
import { buildW3Manifest } from '../src/lib/books/w3-manifest';
import { normalizeW0Manifest } from '../src/lib/books/normalize-w0-manifest';
import { buildW4PrintInput } from '../src/lib/books/w4-print-input';
import { assertW4GelatoPrintInput } from '../src/lib/books/w4-gelato-print-input';
import { resolveFrozenPrintRouting } from '../src/lib/books/print-routing';
import { buildGeneratedPoseAssetKey, buildBgRemovedPoseAssetKey } from '../src/lib/order-paths';

type Fixture=ReturnType<typeof updatedTestBookFixture>;
const decode=(bytes:Uint8Array)=>JSON.parse(new TextDecoder().decode(bytes));
async function request(f:Fixture,dedication='Luca, we love you!'){
 const view=await inspectUpdatedTestBookCopy(f.sourceId,f.ports);
 return{sourceOrderId:f.sourceId,expectedUpdatedAt:view.updatedAt,configChecksum:view.configChecksum,dedicationText:dedication,actor:f.actor};
}
function unchanged(f:Fixture,source:unknown){assert.deepEqual(f.rows.get(f.sourceId),source);for(const[key,bytes]of f.originals)assert.deepEqual(f.objects.get(key),bytes);}
async function main(){
 globalThis.fetch=async()=>{throw Error('Test forbids all external requests');};
 let checks=0;
 const orientationBoundary=updatedTestBookFixture();
 orientationBoundary.targetConfig.version=12;
 await assert.rejects(inspectUpdatedTestBookCopy(orientationBoundary.sourceId,orientationBoundary.ports),/requires fresh poses 5 and 11/);
 assert.equal(orientationBoundary.writes,0);
 checks++;

 const f=updatedTestBookFixture(),before=structuredClone(f.source),input=await request(f);
 const first=await prepareUpdatedTestBookCopy(input,f.ports),target=f.rows.get(first.orderId)!;
 assert.equal(first.reused,false);assert.equal(first.canAssemble,true);assert.equal(target.next_workflow,null);assert.equal(target.execution_status,'done');
 assert.notEqual(target.character_hash,f.hash);assert.equal(target.root_order_id,first.orderId);assert.equal(target.amazon_order_id,first.orderId);
 assert(adminWorkflowTestAdmission(target));assert.equal(adminWorkflowTestMayRoute(target),false);assert.equal(target.customer_approval_status,'not_requested');assert.equal((target.review_stages as any).postPdf.status,'pending');
 const prefix=`${f.bookId}/orders/${first.orderId}`;
 const load=async(key:string)=>{const b=await f.ports.readObject('orders',key);return b?decode(b):null;};
 const w0=await load(prefix+'/manifests/1-manifest.json');assert.equal(w0.order.orderDbId,null);assert.equal(w0.input.dedicationText,'Luca, we love you!');
 const twoB=await load(prefix+'/manifests/2b-manifest.json');
 for(const n of f.w0.book.resolved.qaPolicy.pose.requiredPoseNumbers){
  assert.deepEqual(f.objects.get('assets:'+buildGeneratedPoseAssetKey(String(target.character_hash),n,f.bookId)),f.objects.get('assets:'+buildGeneratedPoseAssetKey(f.hash,n,f.bookId)));
  assert.deepEqual(f.objects.get('assets:'+buildBgRemovedPoseAssetKey(String(target.character_hash),n,f.bookId)),f.objects.get('assets:'+buildBgRemovedPoseAssetKey(f.hash,n,f.bookId)));
  assert.equal(twoB.entries.find((e:any)=>e.poseNumber===n).flipped,[3,11].includes(n));
 }
 assert.equal(twoB.entries.find((e:any)=>e.poseNumber===8).sourceReplacementCount,1);
 for(const [key,type] of f.contentTypes)if(key.startsWith('assets:'))assert.equal(type,key.endsWith('_nobg.png')?'image/png':'image/jpeg','Preserve actual accepted image MIME despite legacy .png suffix');
 const assembly=await buildW3AssemblyInput({orderId:first.orderId,bookId:f.bookId,formatId:'amazon'},{loadManifest:load});
 assert.equal(assembly.dedicationText,'Luca, we love you!');assert.equal(new Set([0,...assembly.requiredPoseNumbers]).size,13);
 const preview=buildW3PreviewPlan({...assembly,backendUrl:'https://offline.invalid'});
 const three=buildW3Manifest({...preview,pagePreviewImages:preview.pagePreviewItems.map(p=>({pageNumber:p.pageNumber,r2Key:p.pageImageR2Key})),coverPngR2Key:preview.coverPreviewItem.coverPngR2Key},{intake:normalizeW0Manifest(w0)});
 const w4=assertW4GelatoPrintInput(await buildW4PrintInput({orderId:first.orderId,bookId:f.bookId,formatId:'amazon'},{expectedProvider:'gelato',loadOrder:async()=>target,
  loadManifest:async key=>key===prefix+'/manifests/3-manifest.json'?three.manifest:load(key)}));
 assert.equal(w4.orderDbId,2);assert.equal(w4.pageLabels.length,32);assert.equal(w4.providerPrintConfig.expectedPdfPageCount,35);assert.equal(resolveFrozenPrintRouting({...target,id:2,orderId:first.orderId},w0).configVersion,5);
 unchanged(f,before);checks++;
 const fullWrites=f.writes;
 target.workflow_step='book_assembly_completed';target.manifest_3_url=prefix+'/manifests/3-manifest.json';target.status='pending_assembly_review';target.next_workflow='4';
 f.objects.set('assets:'+buildBgRemovedPoseAssetKey(String(target.character_hash),8,f.bookId),new Uint8Array([9,8,7]));
 const advanced=structuredClone(target);const repeat=await prepareUpdatedTestBookCopy(input,f.ports);assert.equal(repeat.reused,true);assert.equal(repeat.canAssemble,false);assert.equal(f.writes,fullWrites);assert.deepEqual(target,advanced);unchanged(f,before);checks++;
 for(let failure=0;failure<fullWrites;failure++){
  const test=updatedTestBookFixture(),original=structuredClone(test.source),req=await request(test);test.failAfter=failure;
  try{await prepareUpdatedTestBookCopy(req,test.ports);}catch(error){assert.match(String(error),/SYNTHETIC_INTERRUPTION/);}
  assert.equal(test.rows.size,failure===fullWrites-1?2:1,'No target row may exist before complete staging');
  test.failAfter=-1;const a=await prepareUpdatedTestBookCopy(req,test.ports),b=await prepareUpdatedTestBookCopy(req,test.ports);assert.equal(a.orderId,b.orderId);assert.equal(test.rows.size,2);assert.equal(test.rows.get(a.orderId)?.next_workflow,null);unchanged(test,original);checks++;
 }
 for(const hook of ['failBeforeInsert','failReadback'] as const){const test=updatedTestBookFixture(),req=await request(test);test[hook]=true;await assert.rejects(prepareUpdatedTestBookCopy(req,test.ports),/SYNTHETIC_/);test[hook]=false;await prepareUpdatedTestBookCopy(req,test.ports);assert.equal(test.rows.size,2);checks++;}
 const concurrent=updatedTestBookFixture(),req=await request(concurrent);const both=await Promise.all([prepareUpdatedTestBookCopy(req,concurrent.ports),prepareUpdatedTestBookCopy(req,concurrent.ports)]);assert.equal(both[0].orderId,both[1].orderId);assert.equal(concurrent.rows.size,2);checks++;
 for(const mutation of [
  (test:Fixture)=>{test.source.current_workflow='3';},
  (test:Fixture)=>{test.source.print_manifest_key=test.bookId+'/orders/OTHER/manifests/1-manifest.json';},
  (test:Fixture)=>{const key='orders:'+test.prefix+'/manifests/2a-manifest.json';const value=decode(test.objects.get(key)!);value.entries[8].isFlagged=true;test.objects.set(key,new TextEncoder().encode(JSON.stringify(value)));},
  (test:Fixture)=>{const key='orders:'+test.prefix+'/manifests/2b-manifest.json';const value=decode(test.objects.get(key)!);value.entries[8].needsReview=true;test.objects.set(key,new TextEncoder().encode(JSON.stringify(value)));},
  (test:Fixture)=>{test.source.print_claim_token='owned';},
  (test:Fixture)=>{(test.source.review_stages as any).postBria.status='pending';},
  (test:Fixture)=>{test.targetConfig.rendering.recipe!.poses[Object.keys(test.targetConfig.rendering.recipe!.poses)[0]].referenceKey+='-changed';},
  (test:Fixture)=>{const key='orders:'+test.prefix+'/manifests/2a-manifest.json';const value=decode(test.objects.get(key)!);value.revisions.pending={'8':{r2Key:'pending.png'}};test.objects.set(key,new TextEncoder().encode(JSON.stringify(value)));},
  (test:Fixture)=>{const key='orders:'+test.prefix+'/manifests/2b-manifest.json';const value=decode(test.objects.get(key)!);value.entries.find((e:any)=>e.poseNumber===8).sourceReplacementCount=0;test.objects.set(key,new TextEncoder().encode(JSON.stringify(value)));},
 ]){const test=updatedTestBookFixture(),req=await request(test);mutation(test);await assert.rejects(prepareUpdatedTestBookCopy(req,test.ports));assert.equal(test.writes,0);assert.equal(test.rows.size,1);checks++;}
 const changed=updatedTestBookFixture(),changedReq=await request(changed);changed.afterWrite=key=>{if(key.endsWith('updated-copy-receipt.json')){const asset='assets:'+buildGeneratedPoseAssetKey(changed.hash,8,changed.bookId);changed.objects.set(asset,new Uint8Array([1,1]));}};await assert.rejects(prepareUpdatedTestBookCopy(changedReq,changed.ports),/Source image changed/);assert.equal(changed.rows.size,1);checks++;
 const collision=updatedTestBookFixture(),collisionReq=await request(collision),created=await prepareUpdatedTestBookCopy(collisionReq,collision.ports);collision.rows.get(created.orderId)!.product_info={};await assert.rejects(prepareUpdatedTestBookCopy(collisionReq,collision.ports),/another preparation/);assert.equal(collision.rows.size,2);checks++;
 for(const dedication of ['', '  Luca, we love you!  ']){const test=updatedTestBookFixture();const result=await prepareUpdatedTestBookCopy(await request(test,dedication),test.ports);assert.equal(String(test.rows.get(result.orderId)?.dedication_text??''),dedication.trim());checks++;}
 const stale=updatedTestBookFixture(),staleReq=await request(stale);await assert.rejects(prepareUpdatedTestBookCopy({...staleReq,configChecksum:'0'.repeat(64)},stale.ports),/changed/);await assert.rejects(prepareUpdatedTestBookCopy({...staleReq,actor:'backend-automation'},stale.ports),/human/);assert.equal(stale.writes,0);checks++;
 console.log(JSON.stringify({passed:true,checks,durableFaultPositions:fullWrites,actualW0W3W4:true,originalsUnchanged:true,networkCalls:0,generationCalls:0,providerCalls:0}));
}
main().catch(error=>{console.error(error);process.exitCode=1});
