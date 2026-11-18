/** Actual signed R2 + Supabase store over a fail-closed synthetic HTTP boundary. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
async function main(){
 Object.assign(process.env,{SUPABASE_URL:'https://copy-runtime.example.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic-copy-store-key',CLOUDFLARE_ACCOUNT_ID:'synthetic-copy-store',R2_ACCESS_KEY_ID:'synthetic-copy-access',R2_SECRET_ACCESS_KEY:'synthetic-copy-secret'});
 const {updatedTestBookFixture}=await import('./updated-test-book-fixture');
 const {buildBookConfigPublishPayload}=await import('../src/lib/books/runtime-book-config');
 const {inspectUpdatedTestBookCopy,prepareUpdatedTestBookCopy}=await import('../src/lib/books/updated-test-book-copy');
 const f=updatedTestBookFixture(),before=structuredClone(f.source);let reads=0,writes=0,inserts=0;
 const displayLimit=Number(/display_order_id\s+VARCHAR\((\d+)\)/i.exec(readFileSync(new URL('../../database/migration-d2c-preview-hash.sql',import.meta.url),'utf8'))?.[1]);assert.equal(displayLimit,20,'Canonical migrated display-label contract');
 const types=new Map<string,string>();
 globalThis.fetch=async(input,init)=>{const request=new Request(input,init),url=new URL(request.url);
  if(url.origin==='https://copy-runtime.example.test'){
   if(url.pathname==='/rest/v1/book_configs'&&request.method==='GET')return Response.json(buildBookConfigPublishPayload(f.targetConfig,{activate:true,now:f.date}));
   assert.equal(url.pathname,'/rest/v1/orders');
   if(request.method==='GET'){const filters=[...url.searchParams].filter(([key])=>['orderId','order_id','root_order_id','amazon_order_id','id'].includes(key));assert.equal(filters.length,1);const[field,value]=filters[0];return Response.json([...f.rows.values()].filter(row=>String(row[field])===value.slice(3)));}
   assert.equal(request.method,'POST');assert(!request.headers.get('prefer')?.includes('resolution='),'Must INSERT, never upsert');
   const row=await request.json();assert.equal(typeof row.display_order_id,'string');assert.ok(row.display_order_id.length<=displayLimit,'Postgres display_order_id VARCHAR('+displayLimit+') must admit the actual INSERT');assert.equal(f.rows.size,1);assert(!('quantity'in row));assert.equal(row.next_workflow,null);f.rows.set(row.orderId,{...row,id:2});inserts++;return new Response(null,{status:201});
  }
  assert(url.hostname.endsWith('.synthetic-copy-store.r2.cloudflarestorage.com'),'No external request allowed: '+url.origin);
  assert(request.headers.get('authorization')?.startsWith('AWS4-HMAC-SHA256 '),'Use actual signed R2 requests');
  const bucket=url.hostname.startsWith('little-hero-orders.')?'orders':'assets',key=decodeURIComponent(url.pathname.slice(1)),name=bucket+':'+key;
  if(request.method==='GET'){reads++;const bytes=f.objects.get(name);return bytes?new Response(bytes.slice()):new Response(null,{status:404});}
  assert.equal(request.method,'PUT');assert.equal(request.headers.get('if-none-match'),'*');assert(!key.includes('/characters/'+f.hash+'/')&&!key.startsWith(f.prefix+'/'),'No original writes');
  if(f.objects.has(name))return new Response(null,{status:412});
  f.objects.set(name,new Uint8Array(await request.arrayBuffer()));types.set(name,request.headers.get('content-type')??'');writes++;return new Response(null,{status:200});
 };
 const {updatedTestBookCopyStore:store}=await import('../src/lib/books/updated-test-book-copy-store');
 const view=await inspectUpdatedTestBookCopy(f.sourceId,store);assert.equal(writes,0);const request={sourceOrderId:f.sourceId,expectedUpdatedAt:view.updatedAt,configChecksum:view.configChecksum,dedicationText:'Luca, we love you!',actor:f.actor};
 const first=await prepareUpdatedTestBookCopy(request,store),again=await prepareUpdatedTestBookCopy(request,store);assert.equal(first.canAssemble,true);assert.equal(again.reused,true);assert.equal(inserts,1);assert.equal(writes,35);
 for(const[key,type]of types)if(key.startsWith('assets:'))assert.equal(type,key.endsWith('_nobg.png')?'image/png':'image/jpeg');
 assert.deepEqual(f.rows.get(f.sourceId),before);for(const[key,bytes]of f.originals)assert.deepEqual(f.objects.get(key),bytes);
 console.log(JSON.stringify({passed:true,actualRuntimeStore:true,signedR2Requests:true,conditionalCreates:writes,inserts,reads,originalsUnchanged:true,liveRequests:0}));
}
main().catch(error=>{console.error(error);process.exitCode=1});
