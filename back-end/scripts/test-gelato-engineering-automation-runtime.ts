import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {Miniflare,Response as WorkerResponse} from 'miniflare';
import {NextRequest} from 'next/server';
const bindings={SUPABASE_URL:'https://synthetic-automation.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic-only',BACKEND_API_TOKEN:'synthetic-automation-bearer-authority-at-least-thirty-two-bytes',GELATO_API_KEY:'explicit-test-key',CLOUDFLARE_ACCOUNT_ID:'synthetic-automatic',CLOUDFLARE_R2_ACCESS_KEY_ID:'synthetic-access',CLOUDFLARE_R2_SECRET_ACCESS_KEY:'synthetic-secret',GELATO_DRAFT_SUBMISSION_ENABLED:'false',GELATO_CANCEL_ENABLED:'false',GELATO_STATUS_RELAY_ENABLED:'false',GELATO_STATUS_POLLING_ENABLED:'false',GELATO_SCHEDULED_STATUS_ENABLED:'false',GELATO_NOTIFICATIONS_ENABLED:'false'};
async function main(){
 Object.assign(process.env,bindings);
 const {fixture}=await import('./test-gelato-engineering-automation');
 assert.equal(process.env.BACKEND_API_TOKEN,bindings.BACKEND_API_TOKEN,'Imported producer fixture must preserve caller signing authority');
 const {POST}=await import('../src/app/api/internal/w4/engineering-automation/route');
 const {runEngineeringAutomation}=await import('../src/lib/books/gelato-engineering-automation');
 const {gelatoEngineeringAutomationRuntime}=await import('../src/lib/books/gelato-engineering-automation-runtime');
 let current=await fixture('amazon',2,0,true,new Date());let databaseWrites=0,artifactReads=0,storedReads=0;const requests:string[]=[];
 const handle=async(request:Request):Promise<Response>=>{
  const u=new URL(request.url);requests.push(request.method+' '+u.hostname+u.pathname);const c=current.context;
  if(u.origin===bindings.SUPABASE_URL){
   assert.equal(request.headers.get('apikey'),bindings.SUPABASE_SERVICE_ROLE_KEY);const table=u.pathname.split('/').pop();
   if(u.pathname.includes('/rpc/')){databaseWrites++;const body=await request.json() as Record<string,unknown>;
    if(['apply_gelato_provider_snapshots','hold_gelato_provider_refresh'].includes(table!))return Response.json(await current.d.lifecycle(new AbortController().signal,bindings.GELATO_API_KEY,new Set([current.a.provider_root_id])).store.transition(table!,body));
    assert(['begin_gelato_engineering_conversion','authorize_gelato_engineering_conversion_send','finish_gelato_engineering_conversion'].includes(table!));return Response.json(await current.d.conversion.transition(table!,body));}
   if(request.method==='PATCH'){databaseWrites++;assert.equal(table,'gelato_engineering_conversions');assert.equal(u.searchParams.get('id'),'eq.'+current.a.id);assert.equal(u.searchParams.get('owner_token'),'eq.'+current.a.owner_token);assert.equal(u.searchParams.get('closed_at'),'is.null');const body=await request.json() as {closed_at:string};assert.deepEqual(Object.keys(body),['closed_at']);current.a.closed_at=body.closed_at;return new Response(null,{status:204});}
   assert.equal(request.method,'GET');let rows:unknown[];
   if(table==='orders'){assert.equal(u.searchParams.has('or'),false);assert(u.searchParams.get('orderId')?.startsWith('eq.'));const key=u.searchParams.get('orderId')!.slice(3);rows=current.rows.has(key)?[current.rows.get(key)!]:[];}
   else if(table==='gelato_engineering_conversions')rows=[current.a];else if(table==='print_provider_dispatch_gates')rows=[{enabled:false}];else if(table==='print_provider_submissions')rows=[c.submission];else if(table==='print_provider_submission_items')rows=c.members;else if(table==='print_provider_submission_orders')rows=c.providerOrders;else{assert.equal(table,'print_provider_submission_notifications');rows=[];}
   return Response.json(request.headers.get('Accept')?.includes('vnd.pgrst.object')?rows[0]:rows);
  }
  if(u.origin==='https://order.gelatoapis.com'){assert.equal(request.headers.get('X-API-KEY'),bindings.GELATO_API_KEY);const body=request.method==='GET'?undefined:await request.text();return current.d.conversion.fetcher!(u,{method:request.method,headers:request.headers,body,redirect:'manual'});}
  assert.equal(request.method,'GET','No storage writes or external delivery');
  if(u.hostname==='little-hero-orders.synthetic-automatic.r2.cloudflarestorage.com'){artifactReads++;assert(request.headers.get('Authorization')?.startsWith('AWS4-HMAC-SHA256'));const key=decodeURIComponent(u.pathname.slice(1));assert(current.blobs.has(key));return new Response(Uint8Array.from(current.blobs.get(key)!));}
  assert.equal(u.hostname,'gelato-api-live.s3.eu-west-1.amazonaws.com','No unrelated service or customer delivery');storedReads++;const index=Number(u.pathname.match(/automatic-fixture-(\d+)\.pdf/)?.[1]);assert(Number.isInteger(index));return new Response(Uint8Array.from(current.blobs.get(current.context.members[index].artifact_key!)!));
 };
 const previous=globalThis.fetch;globalThis.fetch=async(input,init)=>handle(new Request(input,init));
 const body=(action:'queue'|'poll'|'signal')=>({action,authorizationIds:[current.a.id],...(action==='signal'?{providerOrderId:current.a.provider_root_id}:{})});
 try{
  for(const action of ['queue','poll','signal'] as const){const response=await POST(new NextRequest('https://admin.example.test/api/internal/w4/engineering-automation',{method:'POST',headers:{Authorization:'Bearer '+bindings.BACKEND_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(body(action))}));const text=await response.text();assert.equal(response.status,200,action+': '+text);assert.equal(JSON.parse(text).completed,true);assert(!text.includes('PRIVATE-RAW-MARKER')&&!text.includes('1 Test St'));}
  assert.equal(current.stats().patches,1);assert.equal(current.stats().applies,2);assert(artifactReads>0&&storedReads>0);assert(current.a.closed_at);assert.equal(current.context.providerOrders[0].order_type,'order');
  const before=databaseWrites;process.env.GELATO_NOTIFICATIONS_ENABLED='true';assert.equal((await POST(new NextRequest('https://admin.example.test/api/internal/w4/engineering-automation',{method:'POST',headers:{Authorization:'Bearer '+bindings.BACKEND_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(body('queue'))}))).status,409);assert.equal(databaseWrites,before);process.env.GELATO_NOTIFICATIONS_ENABLED='false';
  for(const stall of ['headers','body'])for(const action of ['poll','signal'] as const){let rowReads=0;globalThis.fetch=async(input,init)=>{const request=new Request(input,init);if(new URL(request.url).pathname.endsWith('/orders')&&++rowReads>current.rows.size){if(stall==='headers')return new Promise<Response>(()=>{});return new Response(new ReadableStream({pull:()=>new Promise<void>(()=>{})}));}return handle(request);};const runtime=gelatoEngineeringAutomationRuntime();runtime.statusBudgetMs=20;const start=Date.now();const result=runEngineeringAutomation(body(action),runtime);if(action==='signal')await assert.rejects(result,/deadline/);else assert.equal((await result).completed,false);assert(Date.now()-start<500);globalThis.fetch=async(input,init)=>handle(new Request(input,init));}
  current=await fixture('amazon',2,0,true,new Date());requests.length=0;artifactReads=0;storedReads=0;
  const entry=`import {runEngineeringAutomation} from ${JSON.stringify(resolve('src/lib/books/gelato-engineering-automation.ts'))};import {gelatoEngineeringAutomationRuntime} from ${JSON.stringify(resolve('src/lib/books/gelato-engineering-automation-runtime.ts'))};export default {async fetch(r){return Response.json(await runEngineeringAutomation(await r.json(),gelatoEngineeringAutomationRuntime()));}};`;
  const settings=await fs.readFile('wrangler.toml','utf8'),date=settings.match(/^compatibility_date\s*=\s*"([^"]+)"/m)?.[1],flags=[...(settings.match(/compatibility_flags\s*=\s*\[([^\]]+)\]/)?.[1]??'').matchAll(/"([^"]+)"/g)].map(m=>m[1]);assert(date&&flags.length);
  const bundle=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'neutral',mainFields:['browser','module','main'],external:['node:*'],logLevel:'silent'});
  const worker=new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:date,compatibilityFlags:flags,bindings,outboundService:async request=>{const response=await handle(new Request(request.url,{method:request.method,headers:[...request.headers],...(request.method==='GET'?{}:{body:await request.text()})}));return new WorkerResponse(response.status===204?null:await response.arrayBuffer(),{status:response.status,headers:[...response.headers]});}});
  try{for(const action of ['queue','poll','signal'] as const){const response=await worker.dispatchFetch('https://local/engineering',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body(action))});const result=await response.json() as {completed:boolean};assert.equal(result.completed,true,action);}}finally{await worker.dispose();}
  assert.equal(current.stats().patches,1);assert.equal(current.stats().applies,2);assert(artifactReads>0&&storedReads>0);assert(requests.every(r=>!r.includes('search')&&!r.includes('cancel')));
 }finally{globalThis.fetch=previous;}
 console.log('Actual authenticated automation route + real Supabase/R2/provider runtime in Node and production-config Worker: native draft -> one queue conversion -> poll/signal byte checks and projection; deadlines, OFF gates and response privacy pass; zero live traffic.');
}
const watchdog=setTimeout(()=>{throw Error('Actual automation runtime regression stalled');},30_000);
void main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>clearTimeout(watchdog));
