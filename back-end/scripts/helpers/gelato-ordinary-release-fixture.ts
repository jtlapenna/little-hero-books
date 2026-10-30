/** Shared canonical submission producer, labelled dummy PDFs and intercepted provider for local tests only. */
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import type {OrdinaryReleaseDependencies,OrdinaryReleasePermit,OrdinaryReleaseOutcome} from '../../src/lib/books/gelato-ordinary-release-core';
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
let index=200;
function dummyPdf(label:string){
 assert.match(label,/^[A-Za-z0-9 /-]+$/);
 const objects:string[]=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Count 35 /Kids ['+Array.from({length:35},(_,i)=>(4+i*2)+' 0 R').join(' ')+'] >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 for(let i=0;i<35;i++){
  const content='BT /F1 9 Tf 20 250 Td ('+label+' / '+(i===0?'DUMMY COVER':'PAGE '+i)+') Tj ET';
  objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 566.929 566.929] /Resources << /Font << /F1 3 0 R >> >> /Contents '+(5+i*2)+' 0 R >>');
  objects.push('<< /Length '+Buffer.byteLength(content)+' >>\nstream\n'+content+'\nendstream');
 }
 let text='%PDF-1.4\n';const offsets=[0];
 for(const [i,object]of objects.entries()){offsets.push(Buffer.byteLength(text));text+=(i+1)+' 0 obj\n'+object+'\nendobj\n';}
 const xref=Buffer.byteLength(text);
 text+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
 return Buffer.from(text);
}
export async function createOrdinaryReleaseFixture(format:'standard'|'amazon'='standard',children=1,currentClock?:Date,dbIdOffset=0,quantity=1,nestedQuantity=false){
  const {fixture}=await import('../test-gelato-engineering-automation');
  const {prepareOrdinaryRelease,ordinaryReleaseDigest}=await import('../../src/lib/books/gelato-ordinary-release-core');
  const {GelatoSavedSnapshotSchema}=await import('../../src/lib/books/gelato-submission');
  const {createGelatoStoredFileVerifier}=await import('../../src/lib/books/gelato-stored-file');
  const f=await fixture(format,children,++index,false,currentClock??'ORDINARY-RELEASE',true,dbIdOffset,quantity);
  const clock=currentClock??new Date('2026-10-16T12:00:00Z');let time=new Date(clock);
  const saved=GelatoSavedSnapshotSchema.parse(f.context.submission.request_snapshot);
  for(const [child,row] of f.rows){Object.assign(row,{book_specs:{testMode:false},human_approved:true,customer_approval_required:true,customer_approval_status:'approved',workflow_step:'customer_approval',execution_status:'done',current_workflow:null,started_at:null,review_stages:{postPdf:{status:'approved'}},next_workflow:'4'});
   if(nestedQuantity)Object.assign(row,{quantity:null,product_info:{quantity}});
   const member=f.context.members.find(m=>m.child_order_key===child)!;
   f.blobs.set(member.artifact_key!,dummyPdf(child+' / '+format));
  }
  let enabled=true,converted=false,patches=0,reads=0,quotes=0,claims=0,finishes=0,version=0;
  let state:'ready'|'preparing'|'sending'|OrdinaryReleaseOutcome='ready';let owner:string|null=null;
  let fault='',persist=true,verifierPhases=0,refreshQuoteMetadata=false,observation=0,currentQuoteId='reviewed-payable-quote',productCents=1218,shippingCents=500;let payable:unknown;const violations:string[]=[];const attempts:string[]=[];
  const id=randomUUID();
  const raw=()=>({...f.raw(),orderType:converted?'order':'draft',fulfillmentStatus:converted?'created':'draft',financialStatus:converted?'pending':'draft',
   items:f.raw().items.map((item,i)=>({...item,files:[{type:'default',url:'https://gelato-api-live.s3.eu-west-1.amazonaws.com/release-'+i+'.pdf'}]}))});
  const permit:OrdinaryReleasePermit={id,submissionId:f.context.submission.id,providerOrderId:f.a.provider_root_id,accountSha256:hash('synthetic-release-account'),packetSha256:'0'.repeat(64),requestSnapshotSha256:ordinaryReleaseDigest(saved),
   artifacts:f.context.members.map(m=>({childOrderId:m.child_order_id,itemReferenceId:m.item_reference_id,providerItemId:m.provider_item_id!,bookId:'book-finding-our-inner-voice',formatId:format,configVersion:2,key:m.artifact_key!,sha256:hash(f.blobs.get(m.artifact_key!)!)})),
   currency:'USD',maximumTotalCents:children===1&&quantity===1?'2000':'10000',approvedAt:clock.toISOString(),expiresAt:new Date(clock.getTime()+15*60000).toISOString()};
  const quoteRaw=()=>({orderReferenceId:saved.request.orderReferenceId,quotes:[{id:currentQuoteId,itemReferenceIds:saved.request.items.map(i=>i.itemReferenceId),products:saved.request.items.map(i=>({...i,price:productCents*i.quantity/100,currency:'USD'})),shipmentMethods:[{shipmentMethodUid:saved.request.shipmentMethodUid,type:'normal',price:shippingCents/100,currency:'USD'}]}]});
  const fullPayable={source:'verified_provider_payable',accountSha256:permit.accountSha256,quoteId:'reviewed-payable-quote',requestFingerprint:f.context.submission.quote_request_fingerprint!,quotedAt:clock.toISOString(),currency:'USD',
   productsCents:String(1218*children*quantity),shippingCents:'500',taxesCents:'100',feesCents:'0',discountCents:'0',totalCents:String(1218*children*quantity+600),quoteResponseSha256:ordinaryReleaseDigest(quoteRaw()),responseSha256:hash('synthetic complete payable evidence '+index)};
  payable=fullPayable;
  const intercept:typeof fetch=async(input,init)=>{
   const r=new Request(input,init),url=new URL(r.url);attempts.push(r.method+' '+url.origin+url.pathname);
   if(url.origin==='https://gelato-api-live.s3.eu-west-1.amazonaws.com'){
    assert.equal(r.method,'GET');assert.equal(r.redirect,'manual');const i=Number(url.pathname.match(/release-(\d+)\.pdf/)?.[1]);assert(Number.isSafeInteger(i));
    const source=fault==='swapped'?(i+1)%children:i;
    return new Response(Uint8Array.from((fault==='bytes'||fault==='provider-file-after-send'&&patches>0)?Buffer.from('corrupt PDF'):f.blobs.get(f.context.members[source].artifact_key!)!));
   }
   assert.equal(url.origin,'https://order.gelatoapis.com');assert.equal(r.headers.get('x-api-key'),'synthetic-release-account');
   assert.equal(r.redirect,'manual');
   if(r.method==='POST'){
    quotes++;assert.equal(url.pathname,'/v4/orders:quote');
    if(refreshQuoteMetadata){observation++;currentQuoteId='fresh-observation-'+observation;time=new Date(time.getTime()+1000);
     payable={...(payable as object),quoteId:currentQuoteId,quotedAt:time.toISOString(),quoteResponseSha256:ordinaryReleaseDigest(quoteRaw()),responseSha256:hash('fresh evidence '+observation)};}
    return Response.json(quoteRaw());
   }
   assert.equal(url.pathname,'/v4/orders/'+permit.providerOrderId);
   if(r.method==='PATCH'){
    assert.equal(state,'sending');assert.equal(owner!==null,true);patches++;assert.equal(patches,1);assert.deepEqual(await r.json(),{orderType:'order'});
    if(fault==='timeout')return new Promise((_resolve,reject)=>r.signal.addEventListener('abort',()=>reject(Error('Synthetic timeout')),{once:true}));
    if(fault==='rejected')return Response.json({error:'Synthetic rejection'},{status:422});
    converted=true;
    if(fault==='lost')throw Error('Synthetic lost mutation response');
    if(fault==='redirect')return new Response(null,{status:302,headers:{location:'https://unexpected.example.test/never'}});
    return Response.json(raw());
   }
   assert.equal(r.method,'GET');reads++;
   if(fault==='original-echo')return Response.json({...raw(),items:f.raw().items});
   if(fault==='shipment-missing')return Response.json({...raw(),shipment:null});
   if(fault==='changed-snapshot')return Response.json({...raw(),shippingAddress:GelatoSavedSnapshotSchema.parse(f.context.submission.request_snapshot).request.shippingAddress});
   if(fault==='provider-id')return Response.json({...raw(),id:'foreign-provider'});
   if(fault==='readback'&&patches)return new Response(null,{status:503});
   return Response.json(raw());
  };
  const fetcher:typeof fetch=async(input,init)=>{try{return await intercept(input,init);}catch(error){if(!(error instanceof Error&&['Synthetic timeout','Synthetic lost mutation response'].includes(error.message)))violations.push(String(error));throw error;}};
  const d:OrdinaryReleaseDependencies={apiKey:'synthetic-release-account',enabled:async()=>enabled,now:()=>new Date(time),budgetMs:2000,
   context:async id=>{assert.equal(id,f.context.submission.id);return structuredClone(f.context);},order:async key=>f.rows.get(key)??null,artifact:async key=>f.blobs.get(key)!,fetcher,
   payableEvidence:async()=>payable,createStoredFileVerifier:signal=>{verifierPhases++;return createGelatoStoredFileVerifier({loadArtifact:async key=>new Response(Uint8Array.from(f.blobs.get(key)!)),fetcher,signal,budgetMs:1000});},
   store:{acquire:async(requested,account)=>{assert.equal(requested,permit.id);assert.equal(account,permit.accountSha256);claims++;
    if(state!=='ready')return{kind:state==='preparing'?'busy':'already_attempted'};state='preparing';owner=randomUUID();version++;return{kind:'acquired',permit:structuredClone(permit),ownerToken:owner};},
    authorizeSend:async(requested,token,digest)=>{assert.equal(requested,permit.id);assert.equal(token,owner);assert.equal(digest,permit.packetSha256);assert.equal(state,'preparing');
     if(fault==='authorize-unknown'){state='sending';throw Error('Synthetic lost authorization response');}
     if(fault==='authorize-false')return false;
     state='sending';
     if(fault==='root-after-authorization')f.context.submission.root_order_id='changed-root';
     if(fault==='reference-after-authorization')f.context.submission.order_reference_id='changed-reference';
     if(fault==='approval-revoked')f.rows.values().next().value!.customer_approval_status='revision_requested';
     if(fault==='file-after-authorization')f.blobs.set(permit.artifacts[0].key,Buffer.from('Changed after authorization'));
     if(fault==='off-after-authorization')enabled=false;
     return true;},
    finish:async(requested,token,outcome,orders)=>{assert.equal(requested,permit.id);assert.equal(token,owner);finishes++;
     if(!persist)throw Error('Synthetic lost persistence');
     if(outcome==='converted'){assert(orders&&orders.length===1);assert.equal(orders[0].orderType,'order');assert.equal(orders[0].items.length,children);}
     state=outcome;return true;}}};
  const prepared=await prepareOrdinaryRelease(permit,d,AbortSignal.timeout(2000));permit.packetSha256=prepared.packetSha256;
  reads=0;quotes=0;attempts.length=0;
  return{f,d,permit,packet:prepared.packet,fullPayable,setQuotePrices:(product:number,shipping:number)=>{productCents=product;shippingCents=shipping;},setRefreshQuoteMetadata:(value:boolean)=>{refreshQuoteMetadata=value;},setTransportSending:()=>{state='sending';owner='55555555-5555-4555-8555-555555555555';},setPayable:(value:unknown)=>{payable=value;},setFault:(v:string)=>{fault=v;},setEnabled:(v:boolean)=>{enabled=v;},setTime:(v:Date)=>{time=v;},setPersist:(v:boolean)=>{persist=v;},
   convertExternally:()=>{converted=true;},stats:()=>({patches,reads,quotes,claims,finishes,state,version,verifierPhases,violations,attempts}),assertClean:()=>assert.deepEqual(violations,[])};
 }
