/** Synthetic streaming regression: actual service/application in the production-config Worker engine. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {digestGelatoFile,loadGelatoFileDigest} from '../src/lib/books/gelato-file-digest';

const SIZE=146_665_305,CHUNK=64*1024;
function virtualFile(size:number,fill=37){
 let remaining=size;
 return new ReadableStream<Uint8Array>({pull(controller){if(!remaining){controller.close();return;}const length=Math.min(CHUNK,remaining);remaining-=length;controller.enqueue(new Uint8Array(length).fill(fill));}});
}
function expectedDigest(size:number){const hash=createHash('sha256'),chunk=new Uint8Array(CHUNK).fill(37);for(let n=0;n<size;n+=CHUNK)hash.update(chunk.subarray(0,Math.min(CHUNK,size-n)));return hash.digest('hex');}

async function main(){
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Large-artifact test forbids live traffic');};
 try{
  const signal=()=>AbortSignal.timeout(30000);
  assert.equal(await digestGelatoFile(new Response(virtualFile(SIZE)),{signal:signal()}),expectedDigest(SIZE));
  assert.equal(await digestGelatoFile(new Response(virtualFile(64)),{signal:signal(),maxFileBytes:64}),expectedDigest(64));
  await assert.rejects(()=>digestGelatoFile(new Response(''),{signal:signal()}),/empty/);
  await assert.rejects(()=>digestGelatoFile(new Response('x',{status:302}),{signal:signal()}),/load bytes/);
  await assert.rejects(()=>digestGelatoFile(new Response('x',{headers:{'content-length':'256000001'}}),{signal:signal()}),/byte budget/);
  await assert.rejects(()=>digestGelatoFile(new Response(virtualFile(65)),{signal:signal(),maxFileBytes:64}),/byte budget/);
  await assert.rejects(()=>digestGelatoFile(new Response('x',{headers:{'content-length':'invalid'}}),{signal:signal()}),/byte budget/);
  let cancelled=false;
  const abort=new AbortController();
  const hanging=digestGelatoFile(new Response(new ReadableStream({pull:()=>new Promise(()=>{}),cancel(){cancelled=true;}})),{signal:abort.signal});
  abort.abort();await assert.rejects(()=>hanging);assert.equal(cancelled,true);
  const fetchAbort=new AbortController();let resolveLoad!:(value:Response)=>void,lateCancelled=false;
  const loading=loadGelatoFileDigest(()=>new Promise<Response>(resolve=>{resolveLoad=resolve;}),fetchAbort.signal);
  await Promise.resolve();fetchAbort.abort();await assert.rejects(()=>loading);
  resolveLoad(new Response(new ReadableStream({cancel(){lateCancelled=true;}})));
  await new Promise(resolve=>setTimeout(resolve,0));assert.equal(lateCancelled,true);

  process.env.BACKEND_API_TOKEN='synthetic-large-file-signing-authority-123456789';
  const {createOrdinaryReleaseFixture}=await import('./helpers/gelato-ordinary-release-fixture');
  const fixture=await createOrdinaryReleaseFixture();
  const context=fixture.f.context,rows=[...fixture.f.rows.values()];
  const provider={...fixture.f.raw(),orderType:'draft',fulfillmentStatus:'draft',financialStatus:'draft',
   items:fixture.f.raw().items.map(item=>({...item,files:[{type:'default',url:'https://gelato-api-live.s3.eu-west-1.amazonaws.com/large-synthetic.pdf'}]}))};
  const entry=`import {createClient} from '@supabase/supabase-js';
import {composeOrdinaryReleaseServiceRuntime} from ${JSON.stringify(resolve('src/lib/books/gelato-ordinary-release-service.ts'))};
import {createOrdinaryReleaseHttpHandler} from ${JSON.stringify(resolve('src/lib/books/gelato-ordinary-release-application.ts'))};
const context=${JSON.stringify(context)},rows=${JSON.stringify(rows)},provider=${JSON.stringify(provider)},payable=${JSON.stringify(fixture.fullPayable)};
const size=${SIZE},expected=${JSON.stringify(expectedDigest(SIZE))};
function stream(fill=37){let remaining=size;return new ReadableStream({pull(c){if(!remaining){c.close();return;}const n=Math.min(65536,remaining);remaining-=n;c.enqueue(new Uint8Array(n).fill(fill));}});}
export default {async fetch(request){
 const mode=new URL(request.url).pathname;let artifactReads=0,providerReads=0,mutations=0,registrations=0;
 const dbFetch=async(input,init)=>{const r=new Request(input,init),url=new URL(r.url);if(url.origin!=='https://large-file-db.invalid')throw Error('Forbidden database host');
  if(r.method==='POST'){if(url.pathname!=='/rest/v1/rpc/register_gelato_ordinary_release')throw Error('Unexpected persistence');const p=await r.json();registrations++;return Response.json(p.p_permit.id);}
  if(r.method!=='GET')throw Error('Forbidden database mutation');
  const table=url.pathname.split('/').at(-1);let values;
  if(table==='orders')values=rows.filter(row=>url.searchParams.get('orderId')==='eq.'+row.orderId);
  else if(table==='print_provider_submissions')values=[context.submission];
  else if(table==='print_provider_submission_items')values=context.members;
  else if(table==='print_provider_submission_orders')values=context.providerOrders;
  else if(table==='print_provider_submission_notifications')values=[];
  else if(table==='gelato_ordinary_release_gate')values=[{enabled:true}];
  else throw Error('Unexpected database table');
  return Response.json(r.headers.get('accept')?.includes('object')?values[0]??null:values);
 };
 const saved=context.submission.request_snapshot;
 const transport=async(input,init)=>{const r=new Request(input,init),url=new URL(r.url);
  if(url.origin==='https://gelato-api-live.s3.eu-west-1.amazonaws.com'){if(r.method!=='GET')throw Error('Forbidden file mutation');providerReads++;return new Response(stream(mode==='/changed'?38:37));}
  if(url.origin!=='https://order.gelatoapis.com')throw Error('Forbidden provider host');
  if(r.method==='GET')return Response.json(provider);
  if(r.method==='POST'&&url.pathname==='/v4/orders:quote')return Response.json({orderReferenceId:saved.request.orderReferenceId,quotes:[{id:'reviewed-payable-quote',itemReferenceIds:saved.request.items.map(i=>i.itemReferenceId),products:saved.request.items.map(i=>({...i,price:12.18,currency:'USD'})),shipmentMethods:[{shipmentMethodUid:saved.request.shipmentMethodUid,type:'normal',price:5,currency:'USD'}]}]});
  mutations++;throw Error('No provider order creation or conversion allowed');
 };
 const database=createClient('https://large-file-db.invalid','synthetic-service-only',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:dbFetch}});
 const runtime=composeOrdinaryReleaseServiceRuntime({database,apiKey:'synthetic-release-account',expectedAccountSha256:${JSON.stringify(fixture.permit.accountSha256)},approvers:new Set(['operator@example.test']),activationApproved:async()=>true,
  loadArtifact:async(key,signal)=>{signal.throwIfAborted();if(key!==context.members[0].artifact_key)throw Error('Wrong artifact');artifactReads++;return new Response(stream(),mode==='/over'?{headers:{'content-length':'256000001'}}:{});},
  fetcher:transport,payableEvidence:async()=>payable,now:()=>new Date('2026-10-16T12:00:00Z')});
 const handler=createOrdinaryReleaseHttpHandler({authenticate:async()=>({ok:true,mode:'access',actor:'operator@example.test'}),runtime:async()=>runtime});
 const post=body=>new Request('https://admin.example.test/api/admin/gelato-release',{method:'POST',body:JSON.stringify(body)});
 const review=await handler(post({action:'review',submissionId:context.submission.id,maximumTotalCents:'2000'}));const result=await review.json();
 let approval=null;
 if(review.status===200){if(result.permit.artifacts[0].sha256!==expected)throw Error('Large artifact digest drift');const response=await handler(post({action:'approve',permit:result.permit,reviewedPacket:result.packet,approvedPacketSha256:result.packetSha256,approveExactOrder:true}));approval=response.status;}
 return Response.json({status:review.status,state:result.state,approval,artifactReads,providerReads,mutations,registrations,digest:result.permit?.artifacts[0].sha256});
}};`;
  const config=await fs.readFile('wrangler.toml','utf8'),date=config.match(/^compatibility_date\s*=\s*"([^"]+)"/m)?.[1];
  const flags=[...(config.match(/compatibility_flags\s*=\s*\[([^\]]+)\]/)?.[1]??'').matchAll(/"([^"]+)"/g)].map(match=>match[1]);assert.ok(date&&flags.length);
  const bundle=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'neutral',mainFields:['browser','module','main'],external:['node:*'],logLevel:'silent'});
  const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:date,compatibilityFlags:flags,
   bindings:{BACKEND_API_TOKEN:process.env.BACKEND_API_TOKEN},outboundService:()=>{throw Error('Worker attempted an external request');}}));
  try{
   const good=await(await worker.dispatchFetch('http://local/match')).json() as {status:number;approval:number;artifactReads:number;mutations:number;registrations:number};
   assert.equal(good.status,200);assert.equal(good.approval,200);assert.ok(good.artifactReads>=5);assert.equal(good.mutations,0);assert.equal(good.registrations,1);
   for(const scenario of ['changed','over']){const bad=await(await worker.dispatchFetch('http://local/'+scenario)).json() as {status:number;mutations:number;registrations:number};assert.equal(bad.status,409);assert.equal(bad.mutations,0);assert.equal(bad.registrations,0);}
  }finally{await worker.dispose();}
  fixture.assertClean();
  console.log(JSON.stringify({passed:true,bytesPerArtifact:SIZE,worker:'actual production compatibility date/flags',path:'service + SDK + review + approval + final authority',changedProviderAndOversizeRefused:true,abortAndByteLimitsPassed:true,liveRequests:0,providerMutations:0,productionActivation:false}));
 }finally{globalThis.fetch=original;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
