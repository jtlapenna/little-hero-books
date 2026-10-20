/** Test-only bridge: real assembled artifacts -> disposable SQL release ledger -> real scheduler/admin handlers.
 * No hosted URL, credential, provider transport or production entry point is installed.
 */
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {createClient} from '@supabase/supabase-js';
import {NextRequest} from 'next/server';
import {LocalPreviewDatabase,quote} from '../../../scripts/testing/local-preview-database';
import {createOrdinaryReleaseStore,registerReviewedOrdinaryRelease,reconcileStoredOrdinaryRelease} from '../../src/lib/books/gelato-ordinary-release-store';
import {executeOrdinaryRelease,prepareOrdinaryRelease,ordinaryReleaseDigest,type OrdinaryReleaseDependencies,type OrdinaryReleasePermit} from '../../src/lib/books/gelato-ordinary-release-core';
import {createGelatoSubmissionStore,type GelatoSubmissionContext} from '../../src/lib/books/gelato-submission-store';
import {GelatoSavedSnapshotSchema} from '../../src/lib/books/gelato-submission';
import {createGelatoStoredFileVerifier} from '../../src/lib/books/gelato-stored-file';
import {validateGelatoQuote} from '../../src/lib/books/gelato-api-contract';
import {pollRegisteredGelatoStatus} from '../../src/lib/books/gelato-scheduled-status';
import {gelatoLifecycleRuntime} from '../../src/lib/books/gelato-lifecycle-runtime';
import type {GelatoPrintInspection} from '../../src/lib/books/gelato-admin-inspection';
type Row=Record<string,unknown>;
type Raw=Row&{id:string;items:Array<Row&{id:string}>};
const hash=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
const json=(v:unknown)=>quote(JSON.stringify(v))+'::jsonb';
const service=(sql:string)=>'SET ROLE service_role; '+sql;
export async function proveCombinedLocalJourney(f:{context:GelatoSubmissionContext;raw:unknown;rows:Row[];blobs:Map<string,Buffer>;label:string}){
 const db=new LocalPreviewDatabase(),root=path.resolve(__dirname,'../../..'),prior=globalThis.fetch;
 const context=structuredClone(f.context),saved=GelatoSavedSnapshotSchema.parse(context.submission.request_snapshot);
 let raw=structuredClone(f.raw) as Raw;
 // Explicit synthetic provider shipment response; original assembly and saved request are unchanged.
 raw.shipment={shipmentMethodUid:saved.request.shipmentMethodUid,packages:[]};
 const apiKey='synthetic-journey-provider',accountHash=hash(apiKey),origin=process.env.SUPABASE_URL!;
 assert.equal(origin,'https://journey-db.example.test');assert.equal(process.env.GELATO_API_KEY,apiKey);
 const checks:string[]=[],violations:string[]=[],rpcCalls:string[]=[],errors:string[]=[];
 let functionTypes:Record<string,Record<string,string>>={};
 const sessions:Array<Awaited<ReturnType<LocalPreviewDatabase['openSession']>>>=[];let nextSession=0;
 const sqlAsync=(sql:string)=>sessions[nextSession++%sessions.length].query(sql);
 let patches=0,providerReads=0,fileReads=0,fault='',unknownMoney=false,blockReadback=false,loseAck='';
 const rpcAllow=new Set(['register_gelato_ordinary_release','acquire_gelato_ordinary_release','authorize_gelato_ordinary_release','finish_gelato_ordinary_release','begin_gelato_ordinary_observation','register_gelato_scheduled_status','claim_gelato_scheduled_status','finish_gelato_scheduled_status','apply_gelato_scheduled_snapshots','hold_gelato_scheduled_refresh']);
 const tableAllow=new Set(['orders','print_provider_submissions','print_provider_submission_items','print_provider_submission_orders','print_provider_submission_notifications','gelato_scheduled_status']);
 const value=(sql:string)=>JSON.parse(db.sql(sql));
 const insert=(table:string,row:Row)=>{
  assert(tableAllow.has(table));const columns=new Set<string>(value('SELECT jsonb_agg(column_name) FROM information_schema.columns WHERE table_schema=\'public\' AND table_name='+quote(table)));
  const names=Object.keys(row).filter(k=>columns.has(k)).map(k=>'"'+k+'"').join(',');
  db.sql('INSERT INTO public.'+table+'('+names+') SELECT '+names+' FROM jsonb_populate_record(NULL::public.'+table+','+json(row)+')');
 };
 const providerQuote=()=>({orderReferenceId:saved.request.orderReferenceId,errors:fault==='quote-error'?[{code:'SYNTHETIC_ERROR'}]:[],quotes:[{expirationDateTime:new Date(Date.now()+(fault==='expired'?-60000:600000)).toISOString(),id:'combined-fixed-quote',itemReferenceIds:saved.request.items.map(i=>i.itemReferenceId),products:saved.request.items.map(i=>({...i,price:12.18*i.quantity,currency:'USD'})),shipmentMethods:[{shipmentMethodUid:saved.request.shipmentMethodUid,type:'normal',price:5,currency:'USD'}]}]});
 // Freeze quote timestamps/expiry per preparation/approval, otherwise immutable packet changes across retries.
 let quoted=providerQuote();const quotedAt=new Date().toISOString();
 const selectRows=async(table:string,url:URL)=>{
  assert(tableAllow.has(table));const filters:string[]=[];
  for(const [key,v] of url.searchParams){
   if(['select','order','limit'].includes(key))continue;
   assert.match(key,/^[A-Za-z_][A-Za-z0-9_]*$/);assert(v.startsWith('eq.'),'Only exact saved-graph filters supported');
   filters.push('"'+key+'"='+quote(v.slice(3)));
  }
  assert(filters.length>0,'Unbounded local table read forbidden');
  return JSON.parse(await sqlAsync(service('SELECT coalesce(jsonb_agg(to_jsonb(t)),\'[]\'::jsonb) FROM public.'+table+' t WHERE '+filters.join(' AND '))));
 };
 const intercept:typeof fetch=async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url);
  if(url.origin===origin){
   const name=url.pathname.split('/').pop()!;
   if(url.pathname.startsWith('/rest/v1/rpc/')){
    assert.equal(request.method,'POST');assert(rpcAllow.has(name));const args=await request.json() as Row;rpcCalls.push(name);
    if(fault==='database'&&name==='apply_gelato_scheduled_snapshots')return Response.json({message:'Synthetic persistence outage'},{status:503});
    const types=functionTypes[name];
    assert(types);const supplied=Object.entries(args).map(([k,v])=>{assert(Object.hasOwn(types,k));return k+'=>'+(v===null?'NULL':types[k]==='jsonb'?json(v):quote(v))+'::'+types[k];}).join(',');
    const setReturning=name==='claim_gelato_scheduled_status';
    const sql=setReturning?'SELECT coalesce(jsonb_agg(to_jsonb(r)),\'[]\'::jsonb) FROM public.'+name+'('+supplied+') r':'SELECT to_jsonb(public.'+name+'('+supplied+'))';
    try{
     const result=await sqlAsync(service(sql));
     if(loseAck===name){loseAck='';return Response.json({message:'Synthetic lost SQL acknowledgement'},{status:503});}
     return Response.json(result?JSON.parse(result):null);
    }catch(e){errors.push(((e as {stderr?:string}).stderr??String(e)).match(/ERROR: [^\n]+/)?.[0]??'Disposable SQL rejected');return Response.json({message:'Disposable SQL rejected',code:'LOCAL_SQL'},{status:503});}
   }
   assert.equal(request.method,'GET');const selected=await selectRows(name,url);
   return Response.json(request.headers.get('accept')?.includes('object')?selected[0]??null:selected);
  }
  if(url.hostname==='little-hero-orders.synthetic-journey.r2.cloudflarestorage.com'){
   assert.equal(request.method,'GET');const bytes=f.blobs.get(decodeURIComponent(url.pathname.slice(1)));assert(bytes);return new Response(Uint8Array.from(bytes));
  }
  if(url.origin==='https://gelato-api-live.s3.eu-west-1.amazonaws.com'){
   assert.equal(request.method,'GET');assert.equal(request.redirect,'manual');fileReads++;
   const i=Number(url.pathname.match(/local-(\d+)\.pdf/)?.[1]);assert(Number.isSafeInteger(i)&&i>=0&&i<context.members.length);
   if(fault==='redirect')return new Response(null,{status:302,headers:{location:'https://never.example.test/forbidden'}});
   const member=context.members[fault==='swap'?(i+1)%context.members.length:i];const bytes=f.blobs.get(member.artifact_key!)!;
   return new Response(Uint8Array.from(fault==='corrupt'?Buffer.from('Synthetic damaged PDF'):bytes));
  }
  assert.equal(url.origin,'https://order.gelatoapis.com','No external or customer transport');assert.equal(request.headers.get('x-api-key'),apiKey);assert.equal(request.redirect,'manual');
  if(request.method==='POST'){assert.equal(url.pathname,'/v4/orders:quote');return Response.json(quoted);}
  assert.equal(url.pathname,'/v4/orders/'+raw.id,'Only this case provider root');
  if(request.method==='PATCH'){
   assert.deepEqual(await request.json(),{orderType:'order'});assert.equal(patches,0);
   assert.equal(value('SELECT to_jsonb(state) FROM public.gelato_ordinary_release_permits WHERE state=\'sending\' LIMIT 1').toString(),'sending');
   patches++;raw.orderType='order';raw.financialStatus='pending';raw.fulfillmentStatus='created';raw.updatedAt=new Date(Date.now()+1000).toISOString();
   if(f.label==='amazon-single'){blockReadback=true;throw Error('Synthetic mutation response lost');}
   return Response.json(raw);
  }
  assert.equal(request.method,'GET');providerReads++;
  if(blockReadback||fault==='provider')return new Response(null,{status:503});
  if(fault==='rate')return new Response(null,{status:429,headers:{'Retry-After':'120'}});
  return Response.json(raw);
 };
 const transport:typeof fetch=async(input,init)=>{try{return await intercept(input,init);}catch(e){if(!(e instanceof Error&&e.message==='Synthetic mutation response lost'))violations.push(String(e));throw e;}};
 const database=createClient(origin,'synthetic-combined-database',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:transport}});
 const assertClean=()=>{assert.deepEqual(violations,[]);assert.deepEqual(errors,[]);};
 const mark=(s:string)=>{assertClean();checks.push(s);console.log('PASS '+f.label+': '+s);};
 try{
  db.start(root,true);
  // Mirror existing service order-update rights for the actual lifecycle writer; no hosted grants change.
  db.sql('ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS quantity integer,ADD COLUMN IF NOT EXISTS shipping_tier text,ADD COLUMN IF NOT EXISTS customer_email text,ADD COLUMN IF NOT EXISTS customer_name text; GRANT UPDATE(id,gelato_status,gelato_order_type,gelato_action_reason,gelato_tracking,gelato_updated_at) ON public.orders TO service_role');
  // Replace only the two colliding synthetic bootstrap IDs; retain other local sentinels for isolation proof.
  db.sql('DELETE FROM public.orders WHERE id IN (1,2)');
  const sentinel=db.sql('SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM public.orders o');
  for(const row of f.rows)insert('orders',{...row,print_submission_id:null,print_claim_token:null});
  insert('print_provider_submissions',{...context.submission,logical_group:context.submission.root_order_id});
  for(const row of context.providerOrders)insert('print_provider_submission_orders',{...row,provider:'gelato',submission_id:context.submission.id});
  for(const row of context.members)insert('print_provider_submission_items',row);
  for(const row of f.rows)db.sql('UPDATE public.orders SET print_submission_id='+quote(context.submission.id)+'::uuid,print_claim_token='+quote(context.submission.claim_token)+'::uuid WHERE id='+Number(row.id));
  db.sql(readFileSync(path.join(root,'database/20261019081857_gelato_ordinary_release_store.sql'),'utf8'));
  if(process.env.GELATO_LOCAL_ISOLATION_SCHEMA==='1'){const files=readdirSync(path.join(root,'database')).filter(f=>f.endsWith('_gelato_engineering_isolation.sql'));assert.equal(files.length,1);db.sql(readFileSync(path.join(root,'database',files[0]),'utf8'));assert.equal(value('SELECT count(*) FROM public.gelato_isolation_scopes'),0);}
  functionTypes=value('SELECT jsonb_object_agg(name,args) FROM (SELECT p.proname AS name,jsonb_object_agg(p.proargnames[i],format_type(p.proargtypes[i-1],NULL)) AS args FROM pg_proc p,generate_series(1,p.pronargs) i WHERE p.pronamespace=\'public\'::regnamespace AND p.proname IN('+[...rpcAllow].map(quote).join(',')+') GROUP BY p.proname) f');
  for(let i=0;i<4;i++)sessions.push(await db.openSession());
  const loader=createGelatoSubmissionStore(database),store=createOrdinaryReleaseStore(database);
  const permit:OrdinaryReleasePermit={id:randomUUID(),submissionId:context.submission.id,providerOrderId:raw.id,accountSha256:accountHash,packetSha256:'0'.repeat(64),requestSnapshotSha256:ordinaryReleaseDigest(saved),artifacts:context.members.map(m=>({childOrderId:m.child_order_id,itemReferenceId:m.item_reference_id,providerItemId:m.provider_item_id!,bookId:'book-finding-our-inner-voice',formatId:String(f.rows[0].print_format_id),configVersion:2,key:m.artifact_key!,sha256:hash(f.blobs.get(m.artifact_key!)!)})),currency:'USD',maximumTotalCents:'10000',approvedAt:quotedAt,expiresAt:new Date(Date.parse(quotedAt)+900000).toISOString()};
  const d:OrdinaryReleaseDependencies={apiKey,budgetMs:30000,enabled:async()=>value(service('SELECT to_jsonb(enabled) FROM public.gelato_ordinary_release_gate WHERE id')),store,context:id=>loader.load(id),order:async key=>value(service('SELECT to_jsonb(o) FROM public.orders o WHERE "orderId"='+quote(key))),artifact:async key=>f.blobs.get(key)!,fetcher:transport,
   createStoredFileVerifier:signal=>createGelatoStoredFileVerifier({loadArtifact:async key=>new Response(Uint8Array.from(f.blobs.get(key)!)),fetcher:transport,signal,budgetMs:2000}),
   payableEvidence:async q=>{
    if(unknownMoney)return {};const selection=validateGelatoQuote({response:q,request:{orderReferenceId:saved.request.orderReferenceId,customerReferenceId:saved.request.customerReferenceId,currency:saved.request.currency,recipient:saved.request.shippingAddress,allowMultipleQuotes:false,products:saved.request.items},config:saved.config,shippingTier:saved.shippingTier,quotedAt,now:new Date()});
    const products=1218*saved.request.items.reduce((n,i)=>n+i.quantity,0);
    return {source:'verified_provider_payable',accountSha256:accountHash,quoteId:selection.quoteId,requestFingerprint:selection.requestFingerprint,quotedAt,currency:'USD',productsCents:String(products),shippingCents:'500',taxesCents:'100',feesCents:'0',discountCents:'0',totalCents:String(products+600),quoteResponseSha256:ordinaryReleaseDigest(q),responseSha256:hash('SYNTHETIC COMPLETE PAYABLE ONLY')};
   }};
  let before=rpcCalls.length;assert.equal((await executeOrdinaryRelease(permit.id,d)).state,'disabled');assert.equal(rpcCalls.length,before);mark('OFF before work RPC/provider access; gate SELECT allowed');
  unknownMoney=true;await assert.rejects(()=>prepareOrdinaryRelease(permit,d,AbortSignal.timeout(30000)));unknownMoney=false;assert.equal(patches,0);mark('unknown complete payable rejected without send');
  for(const bad of ['expired','quote-error']){fault=bad;quoted=providerQuote();await assert.rejects(()=>prepareOrdinaryRelease(permit,d,AbortSignal.timeout(30000)));assert.equal(patches,0);mark(bad+' quote rejected before approval');}
  fault='';quoted=providerQuote();
  if(context.members.length===2){fault='swap';await assert.rejects(()=>prepareOrdinaryRelease(permit,d,AbortSignal.timeout(30000)));fault='';assert.equal(patches,0);mark('assembled sibling PDFs cannot be exchanged');}
  const prepared=await prepareOrdinaryRelease(permit,d,AbortSignal.timeout(30000));permit.packetSha256=prepared.packetSha256;
  await registerReviewedOrdinaryRelease(database,{permit,packet:prepared.packet,actor:'synthetic-local-reviewer',approvalEvidenceSha256:hash('LOCAL FIXTURE APPROVAL NOT HUMAN SPEND AUTHORITY')});
  db.sql(service('UPDATE public.gelato_ordinary_release_gate SET enabled=true'));
  const second={...permit,id:randomUUID()};const p2=await prepareOrdinaryRelease(second,d,AbortSignal.timeout(30000));second.packetSha256=p2.packetSha256;
  await registerReviewedOrdinaryRelease(database,{permit:second,packet:p2.packet,actor:'synthetic-local-reviewer',approvalEvidenceSha256:hash('SECOND SYNTHETIC APPROVAL')});
  if(f.label==='amazon-siblings')loseAck='finish_gelato_ordinary_release';
  const race=await Promise.all([executeOrdinaryRelease(permit.id,d),executeOrdinaryRelease(second.id,d)]);assert.equal(patches,1);mark('two approvals race on real SQL root: exactly one synthetic conversion');
  db.sql(service('UPDATE public.gelato_ordinary_release_gate SET enabled=false'));
  if(blockReadback){assert(race.some(r=>r.state==='outcome_unknown'));blockReadback=false;const id=value('SELECT to_jsonb(id) FROM public.gelato_ordinary_release_permits WHERE state=\'outcome_unknown\'') as string;const recovered=await reconcileStoredOrdinaryRelease(database,id,d);assert.equal(recovered.state,'converted');assert.equal(recovered.persistenceConfirmed,true);assert.equal(patches,1);mark('lost mutation response and read outage recovered with release OFF, no resend');}
  assert.equal(value('SELECT count(*)::int FROM public.gelato_ordinary_release_permits WHERE state=\'converted\''),1);
  db.sql(service('UPDATE public.gelato_ordinary_release_gate SET enabled=true'));
  const restarted={...d,store:createOrdinaryReleaseStore(createClient(origin,'synthetic-restarted-client',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:transport}}))};
  await executeOrdinaryRelease(permit.id,restarted);await executeOrdinaryRelease(second.id,restarted);assert.equal(patches,1);
  if(f.label==='amazon-siblings'){assert(race.some(r=>'persistenceConfirmed' in r&&r.persistenceConfirmed===false));mark('lost finish acknowledgement preserves committed SQL closure');}
  db.sql(service('UPDATE public.gelato_ordinary_release_gate SET enabled=false'));mark('new store instance/retry cannot send consumed root');
  const snapshotBefore=JSON.stringify((await loader.load(context.submission.id)).submission.request_snapshot);
  const options={enabled:true,apiKey,budgetMs:10000,candidateBudgetMs:4000,cleanupBudgetMs:1000,lifecycle:(signal:AbortSignal)=>({...gelatoLifecycleRuntime(signal,database),get:async(id:string)=>(await import('../../src/lib/books/gelato-api-client')).getGelatoOrder(id,{apiKey,fetcher:transport,signal})})};
  globalThis.fetch=transport;
  before=rpcCalls.length;assert((await pollRegisteredGelatoStatus(database,{...options,enabled:false})).disabled);assert.equal(rpcCalls.length,before);
  assert.equal((await pollRegisteredGelatoStatus(database,options)).checked,0);mark('OFF and empty enrollment select no candidate');
  const enrolled=await database.rpc('register_gelato_scheduled_status',{p_submission_id:context.submission.id,p_account_key_sha256:accountHash,p_enabled:true});assert.equal(enrolled.error,null);
  const due=()=>db.sql(service('UPDATE public.gelato_scheduled_status SET next_attempt_at=clock_timestamp()-interval \'1 second\' WHERE submission_id='+quote(context.submission.id)));
  const job=()=>value('SELECT to_jsonb(j) FROM public.gelato_scheduled_status j WHERE submission_id='+quote(context.submission.id)) as Row;
  const tick=async(expected:'success'|'failed'|'requires_review',error:string|null=null)=>{due();const r=await pollRegisteredGelatoStatus(database,options);assert.equal(r.checked,1,JSON.stringify({r,job:job(),errors,violations}));assert.equal(job().last_result,expected,JSON.stringify({r,job:job(),errors,violations}));assert.equal(job().last_error_class,error);assert.equal(job().lease_token,null);assert.equal(JSON.stringify((await loader.load(context.submission.id)).submission.request_snapshot),snapshotBefore);assertClean();};
  const claimArgs={p_account_key_sha256:accountHash,p_lease_seconds:30};
  due();const simultaneous=await Promise.all([database.rpc('claim_gelato_scheduled_status',claimArgs),database.rpc('claim_gelato_scheduled_status',claimArgs)]);
  assert(simultaneous.every(r=>!r.error));const owners=simultaneous.flatMap(r=>r.data as Array<{submission_id:string;lease_token:string}>);assert.equal(owners.length,1);
  db.sql(service('UPDATE public.gelato_scheduled_status SET lease_expires_at=clock_timestamp()-interval \'1 second\',next_attempt_at=clock_timestamp()-interval \'1 second\' WHERE submission_id='+quote(context.submission.id)));
  const reclaimed=await database.rpc('claim_gelato_scheduled_status',claimArgs);assert.equal(reclaimed.error,null);assert.equal(reclaimed.data.length,1);
  const newOwner=reclaimed.data[0] as {lease_token:string};assert.notEqual(newOwner.lease_token,owners[0].lease_token);
  assert.throws(()=>db.sql(service('SELECT public.finish_gelato_scheduled_status('+quote(context.submission.id)+'::uuid,'+quote(owners[0].lease_token)+'::uuid,\'success\')')),/ownership changed or expired/);
  const closed=await database.rpc('finish_gelato_scheduled_status',{p_submission_id:context.submission.id,p_poll_token:newOwner.lease_token,p_result:'success'});assert.equal(closed.error,null);
  mark('parallel scheduler claim has one owner; abandoned lease expires; stale callback rejected');
  await tick('success');assert.equal((await pollRegisteredGelatoStatus(database,options)).checked,0);mark('actual scheduler persists regular pending status then honors next due time');
  const inspection=async()=>{const {GET}=await import('../../src/app/api/admin/gelato-print/route');const r=await GET(new NextRequest('https://admin.littleherolabs.com/api/admin/gelato-print?orderId='+context.members[0].child_order_key,{headers:{authorization:'Bearer '+process.env.BACKEND_API_TOKEN}}));assert.equal(r.status,200,await r.clone().text());return await r.json() as GelatoPrintInspection;};
  for(const [bad,error]of [['rate','rate_limited'],['provider','provider_unavailable'],['corrupt','invalid_snapshot'],['redirect','invalid_snapshot'],...(context.members.length===2?[['swap','invalid_snapshot']]:[]),['database','database_failure']]){
   fault=bad;await tick('failed',error);const view=await inspection();assert.equal(view.polling?.lastResult,'failed');assert.equal(view.polling?.lastErrorClass,error);
   if(bad==='rate')assert(Date.parse(String(job().next_attempt_at))-Date.parse(String(job().last_attempt_at))>=120000);
   fault='';await tick('success');mark(bad+' failure visible in actual admin handler; read-only SQL recovery');
  }
  const advance=(status:string)=>{raw.updatedAt=new Date(Date.parse(String(raw.updatedAt))+60000).toISOString();raw.fulfillmentStatus=status;raw.items.forEach(i=>{i.fulfillmentStatus=status;});};
  for(const status of ['uploading','passed','in_production','printed','shipped','in_transit','delivered']){advance(status);if(status==='passed')raw.items.forEach(i=>{i.processedFileUrl='https://example.test/SYNTHETIC-PREPRESS';});if(status==='shipped')raw.shipment={shipmentMethodUid:saved.request.shipmentMethodUid,packages:raw.items.map((i,n)=>({id:'synthetic-parcel-'+n,orderItemIds:[i.id],trackingCode:'SYNTHETIC-'+n,trackingUrl:'https://example.test/tracking/'+n}))};await tick('success');}
  const horizon=job().terminal_until;assert(horizon);advance('delivered');await tick('success');assert.equal(job().terminal_until,horizon);mark('synthetic lifecycle persists child tracking and stable terminal monitoring horizon');
  const final=await inspection();assert.equal(final.orders[0].status,'delivered');assert.equal(final.orders[0].financial?.status,'pending');assert.equal(final.items.length,context.members.length);assert.equal(final.canCancel,false);assert.equal(final.polling?.enabled,false);
  for(const m of context.members){const row=value('SELECT to_jsonb(o) FROM public.orders o WHERE id='+m.child_order_id);assert.equal(row.gelato_status,'delivered');assert.deepEqual(row.gelato_tracking[0].providerItemIds,[m.provider_item_id]);}
  db.sql(service('UPDATE public.gelato_scheduled_status SET terminal_until=clock_timestamp()-interval \'1 second\',next_attempt_at=clock_timestamp()-interval \'1 second\' WHERE submission_id='+quote(context.submission.id)));
  assert.equal((await pollRegisteredGelatoStatus(database,options)).checked,0);mark('expired terminal horizon stops real SQL candidate selection');
  const original=job();db.sql(service('UPDATE public.gelato_scheduled_status SET enabled=false WHERE submission_id='+quote(context.submission.id)));
  assert.equal(value('SELECT count(*)::int FROM public.print_provider_submission_notifications'),0);
  assert.equal(db.sql('SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM public.orders o WHERE id NOT IN (1,2)'),sentinel);mark('local sentinels unchanged; zero notification intents; local gates restored OFF');
  assert.equal(value(service('SELECT to_jsonb(enabled) FROM public.gelato_ordinary_release_gate WHERE id')),false);assertClean();
  return {passed:true,checks,postgres:db.sql('SHOW server_version'),assembledPdfHashes:permit.artifacts.map(a=>a.sha256),syntheticProviderConversions:patches,providerReads,fileReads,pollAttempts:original.attempt_count,sqlRpcCalls:rpcCalls.length,persistentRelease:true,persistentScheduler:true,actualAdminHandler:true,syntheticPayable:true,liveRequests:0,customerMessages:0,normalControlsAccessed:false,limitations:['SQL transport is a narrow local REST adapter, not a running PostgREST server','Initial queue/draft persistence uses the earlier in-memory journey before one-way handoff to SQL','Provider prepress/finance/production/delivery and complete payable are synthetic','Local SQL time is advanced by updating due/horizon fields, not a real recurring timer']};
 }finally{globalThis.fetch=prior;try{await Promise.all(sessions.map(s=>s.close()));}finally{db.close();}}
}
