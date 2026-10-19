/** Local ordinary-path integration. Every service transport is intercepted. Never load dotenv. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import type { GelatoSubmissionContext } from '../src/lib/books/gelato-submission-store';

const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
type Row=Record<string,unknown>;
async function main() {
 const directory=process.env.GELATO_LOCAL_DUMMY_RASTERS; assert(directory,'Pass a local dummy raster directory');
 const rasterManifest=JSON.parse(await readFile(path.join(directory,'rasters.json'),'utf8'));
 assert.equal(rasterManifest.bookId,'book-finding-our-inner-voice');assert.equal(rasterManifest.configSha256,sha(await readFile('src/lib/books/configs/book-finding-our-inner-voice/v2.json')));
 const bindings={SUPABASE_URL:'https://journey-db.example.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic-journey-service',BACKEND_API_TOKEN:'synthetic-journey-authority-at-least-thirty-two-bytes',BACKEND_URL:'https://admin.littleherolabs.com',BACKEND_API_URL:'https://admin.littleherolabs.com',GELATO_API_KEY:'synthetic-journey-provider',GELATO_MERCHANT_CONTACT_EMAIL:'orders@example.test',CLOUDFLARE_ACCOUNT_ID:'synthetic-journey',CLOUDFLARE_R2_ACCESS_KEY_ID:'synthetic-access',CLOUDFLARE_R2_SECRET_ACCESS_KEY:'synthetic-secret',GELATO_DRAFT_SUBMISSION_ENABLED:'false',GELATO_CANCEL_ENABLED:'false',GELATO_STATUS_RELAY_ENABLED:'false',GELATO_STATUS_POLLING_ENABLED:'false',GELATO_SCHEDULED_STATUS_ENABLED:'false',GELATO_NOTIFICATIONS_ENABLED:'false'};
 Object.assign(process.env,bindings);
 const previous=globalThis.fetch;globalThis.fetch=async()=>{throw Error('No real network')};
 let rows:Row[]=[],tokens:Row[]=[],ctx:GelatoSubmissionContext,raw:Row|undefined,creates=0,quotes=0,claims=0;
 let blobs=new Map<string,Buffer>(),manifests=new Map<string,unknown>();const calls:string[]=[],results:Row[]=[];
 let leaseToken='22222222-2222-4222-8222-222222222222',submissionId='11111111-1111-4111-8111-111111111111';
 const match=(entries:Row[],u:URL)=>entries.filter(row=>[...u.searchParams].every(([key,v])=>{
  if(v.startsWith('eq.'))return String(row[key]??'')===v.slice(3);
  if(v==='is.null')return row[key]==null;
  if(v.startsWith('in.('))return v.slice(4,-1).split(',').map(x=>x.replaceAll('"','')).includes(String(row[key]));
  return true;
 }));
 try {
 const {buildW0RunManifestFromConfig}=await import('../src/lib/books/build-run-manifest');
 const {loadBundledBookConfig}=await import('../src/lib/books/load-book-config');
 const {buildW0OrderUpsertPayload}=await import('../src/lib/w0-manifest-builder');
 const {normalizeW0Manifest}=await import('../src/lib/books/normalize-w0-manifest');
 const {buildW3Manifest}=await import('../src/lib/books/w3-manifest');
 const {gelatoSnapshotDigest}=await import('../src/lib/books/gelato-lifecycle');
 const {GelatoProviderOrderSchema}=await import('../src/lib/books/gelato-provider-snapshot');
 const {previewMutationReady}=await import('../src/lib/customer-preview-access');
 const {gelatoQuoteRequestFingerprint}=await import('../src/lib/books/gelato-api-contract');
 const {GelatoSavedSnapshotSchema}=await import('../src/lib/books/gelato-submission');
 const {GelatoMonetaryQuoteSchema}=await import('../src/lib/books/gelato-financial-observation');
 const {buildGelatoReleaseReview}=await import('../src/lib/books/gelato-release-review');
 const {ordinaryPrintRoutingBlocker}=await import('../src/lib/books/gelato-print-admission');
 const {POST:approve}=await import('../src/app/api/preview/[orderId]/approve/route');
 const {POST:claim}=await import('../src/app/api/internal/orders/print-routing/claim/route');
 const {POST:singlePdf}=await import('../src/app/api/internal/w4/build-gelato-print-pdf/route');
 const {POST:siblingPdf}=await import('../src/app/api/internal/w4/build-gelato-sibling-print-pdf/route');
 const {POST:quote}=await import('../src/app/api/internal/w4/quote-gelato-submission/route');
 const {POST:submit}=await import('../src/app/api/internal/w4/submit-gelato-draft/route');
 const workflow=JSON.parse(await readFile('../docs/n8n-workflow-files/repo-centric/workflows/w1.1-Queue_Manager_and_Router.repo-centric.json','utf8'));
 const classifier=workflow.nodes.find((n:Row)=>n.name==='Classify W4 Orders').parameters.jsCode;
 const request=(url:string,body:unknown)=>new NextRequest(url,{method:'POST',headers:{authorization:'Bearer '+bindings.BACKEND_API_TOKEN,'content-type':'application/json'},body:JSON.stringify(body)});
 globalThis.fetch=async(input,init)=>{
  const r=new Request(input,init),u=new URL(r.url);calls.push(r.method+' '+u.hostname+u.pathname);
  if(u.origin===bindings.SUPABASE_URL){
   const name=u.pathname.split('/').pop()!;
   if(u.pathname.includes('/rpc/')){
    const p=await r.json() as Row;
    if(name==='commit_customer_preview_action'){
     const row=rows.find(x=>x.id===p.p_order_id)!;const link=tokens.find(x=>x.token===p.p_token)!;
     if(!row||!link||link.used_at||!previewMutationReady(row)||!Object.entries(p.p_expected as Row).every(([k,v])=>JSON.stringify(row[k]??null)===JSON.stringify(v)))return Response.json(false);
     Object.assign(row,p.p_changes);link.used_at=new Date().toISOString();return Response.json(true);
    }
    if(name==='claim_gelato_print_submission'){
     claims++;const routes=p.p_routes as Array<Row>;assert.equal(routes.length,rows.length);
     ctx={submission:{id:submissionId,provider:'gelato',order_reference_id:'local-journey-'+claims,root_order_id:String(rows[0].root_order_id),workflow_job_idempotency_key:String(p.p_idempotency_key),claim_token:leaseToken,lease_expires_at:new Date(Date.now()+900000).toISOString(),request_state:'claimed',owning_execution_id:null,send_started_at:null,accepted_root_order_id:null,quote_snapshot:null,request_snapshot:null,quote_id:null,shipment_method_uid:null,shipment_policy_version:null,quoted_at:null,quote_request_fingerprint:null},members:routes.map(route=>({submission_id:submissionId,child_order_id:Number(route.orderDbId),child_order_key:String(route.orderId),item_reference_id:'local-item-'+route.orderDbId,artifact_key:null,artifact_fingerprint:null,artifact_claim_token:null,pdf_page_count:null,provider_order_id:null,provider_item_id:null,status:null})),providerOrders:[],notifications:[]};
     rows.forEach(row=>Object.assign(row,{print_submission_id:submissionId,print_claim_token:leaseToken}));return Response.json({dispatch:true,submissionId,claimToken:leaseToken,orderReferenceId:ctx.submission.order_reference_id});
    }
    assert.equal(p.p_submission_id,submissionId);
    if(name==='register_gelato_print_artifact'){const m=ctx.members.find(x=>x.child_order_id===p.p_order_db_id)!;Object.assign(m,{artifact_key:p.p_key,artifact_fingerprint:p.p_fingerprint,artifact_claim_token:leaseToken,pdf_page_count:p.p_pdf_page_count});return Response.json(null);}
    if(name==='record_gelato_quote_snapshot'){Object.assign(ctx.submission,{quote_snapshot:p.p_snapshot,quote_id:p.p_quote_id,shipment_method_uid:p.p_shipment_method_uid,shipment_policy_version:p.p_policy_version,quoted_at:p.p_quoted_at,quote_request_fingerprint:p.p_request_fingerprint});return Response.json(null);}
    if(name==='gelato_engineering_submission_allowed')return Response.json(false); // No engineering exemption or implicit test-mode authority.
    if(name==='begin_gelato_print_submission'){ctx.submission.request_state='submitting';ctx.submission.request_snapshot=structuredClone(ctx.submission.quote_snapshot);return Response.json(null);}
    if(name==='authorize_gelato_print_send'){assert(rows.every(row=>row.customer_approval_status==='approved'));ctx.submission.send_started_at=new Date().toISOString();return Response.json(null);}
    if(name==='record_gelato_accepted_root'){ctx.submission.accepted_root_order_id=String(p.p_root_id);return Response.json(null);}
    if(name==='persist_gelato_draft_result'){
     const graph=(p.p_orders as unknown[]).map(x=>GelatoProviderOrderSchema.parse(x));ctx.submission.request_state='submitted';ctx.providerOrders=graph.map(order=>({provider_order_id:order.id,status:order.fulfillmentStatus,order_type:order.orderType,last_event_at:order.updatedAt,snapshot_digest:gelatoSnapshotDigest(order),snapshot:order,action_reason:null}));
     ctx.members.forEach(m=>{const i=graph[0].items.find(x=>x.itemReferenceId===m.item_reference_id)!;Object.assign(m,{provider_order_id:graph[0].id,provider_item_id:i.id,status:i.fulfillmentStatus})});return Response.json({persisted:true});
    }
    if(name==='fence_gelato_print_submission'){ctx.submission.request_state='outcome_unknown';return Response.json(null);}
    throw Error('Unexpected local RPC '+name);
   }
   assert.equal(r.method,'GET','No direct DB mutation outside isolated RPC simulation');
   let entries:Row[]=name==='orders'?rows:name==='preview_tokens'?tokens:name==='print_provider_submissions'?[ctx.submission]:name==='print_provider_submission_items'?ctx.members:name==='print_provider_submission_orders'?ctx.providerOrders:name==='print_provider_submission_notifications'?[]:(()=>{throw Error('Unexpected table '+name)})();
   entries=match(entries,u);return Response.json(r.headers.get('accept')?.includes('object')?entries[0]??null:entries);
  }
  if(u.hostname==='little-hero-orders.synthetic-journey.r2.cloudflarestorage.com'){
   const key=decodeURIComponent(u.pathname.slice(1));
   if(r.method==='PUT'){assert(key.includes('/gelato/print/'));blobs.set(key,Buffer.from(await r.arrayBuffer()));return new Response(null,{status:200});}
   assert(['GET','HEAD'].includes(r.method));const value=manifests.has(key)?Buffer.from(JSON.stringify(manifests.get(key))):blobs.get(key);
   return new Response(r.method==='HEAD'?null:value?Uint8Array.from(value):null,{status:value?200:404,headers:{'content-type':key.endsWith('.json')?'application/json':key.endsWith('.png')?'image/png':'application/pdf'}});
  }
  if(u.hostname==='order.gelatoapis.com'){
   assert.equal(r.headers.get('x-api-key'),bindings.GELATO_API_KEY);
   if(r.method==='POST'&&u.pathname==='/v4/orders:quote'){quotes++;const q=await r.json();return Response.json({orderReferenceId:q.orderReferenceId,quotes:[{id:'local-quote-'+quotes,itemReferenceIds:q.products.map((x:Row)=>x.itemReferenceId),products:q.products.map((x:Row)=>({...x,price:12.18*Number(x.quantity),currency:'USD'})),shipmentMethods:[{shipmentMethodUid:'usps_ground_advantage',type:'normal',price:5,currency:'USD'}]}]});}
   if(r.method==='POST'&&u.pathname==='/v4/orders'){
    const body=await r.json();assert.equal(body.orderType,'draft');creates++;const id='local-provider-'+creates;
    raw={...body,id,fulfillmentStatus:'draft',financialStatus:'draft',updatedAt:new Date().toISOString(),connectedOrderIds:[],items:body.items.map((x:Row,i:number)=>({...x,id:id+'-item-'+i,fulfillmentStatus:'created',files:[{type:'default',url:'https://gelato-api-live.s3.eu-west-1.amazonaws.com/local-'+i+'.pdf'}]}))};return Response.json(raw);
   }
   assert.equal(r.method,'GET','No regular conversion/cancel/paid API');assert(raw&&u.pathname==='/v4/orders/'+raw.id);return Response.json(raw);
  }
  if(u.hostname==='gelato-api-live.s3.eu-west-1.amazonaws.com'){
   assert.equal(r.method,'GET');const i=Number(u.pathname.match(/local-(\d+)\.pdf/)?.[1]);return new Response(Uint8Array.from(blobs.get(ctx.members[i].artifact_key!)!));
  }
  throw Error('No real network: unexpected '+u.origin);
 };
 for(const [caseIndex,format,count,label] of [[1,'standard',1,'website'],[2,'amazon',1,'amazon-single'],[3,'amazon',2,'amazon-siblings']] as const){
  rows=[];tokens=[];blobs=new Map();manifests=new Map();raw=undefined;
  const root='LOCAL-JOURNEY-'+caseIndex;submissionId='11111111-1111-4111-8111-'+String(caseIndex).padStart(12,'0');const beforeCreates=creates;
  const bundled=loadBundledBookConfig({bookId:'book-finding-our-inner-voice',version:2});assert.equal(bundled.status,'draft');
  // Production branch is exercised using an IN-MEMORY ACTIVE CLONE only. Bundled/published config is unchanged.
  const config=structuredClone(bundled);config.status='active';
  for(let i=0;i<count;i++){
   const orderId=count===1?root:root+'-item-'+(i+1),role=count===2?['SIB-A','SIB-B'][i]:format==='standard'?'WEB-A':'AMZ-A';
   const input={orderId,rootOrderId:root,amazonOrderId:format==='amazon'?root:null,orderDbId:i+1,platform:format==='amazon'?'amazon' as const:'d2c' as const,formatId:format,customerApprovalRequired:true,characterHash:'local-child-'+caseIndex+'-'+i,input:{characterSpecs:{childName:role},bookSpecs:{testMode:false},dedicationText:'Local dummy '+role}};
   const one=buildW0RunManifestFromConfig(config,input);manifests.set(one.artifacts.manifestKey,one);
   const prefix=one.artifacts.orderPrefix,normalized=normalizeW0Manifest(one);
   const three=buildW3Manifest({orderId,rootOrderId:root,amazonOrderId:input.amazonOrderId,bookId:config.bookId,formatId:format,configVersion:2,renderSnapshot:normalized.renderSnapshot,oneManifestKey:one.artifacts.manifestKey,backendUrl:bindings.BACKEND_URL,orderR2BaseKey:prefix,pagePreviewImages:one.book.resolved.pagePlan.map(p=>({pageNumber:p.index,r2Key:prefix+'/preview-images/'+p.label+'.png'})),coverPngR2Key:prefix+'/preview-images/cover-spread.png'});
   assert.equal((three.manifest.summary as Row).readyForBook,true);
   manifests.set(three.manifest3Key,three.manifest);
   const row={...buildW0OrderUpsertPayload({normalizedInput:input,manifest:one,manifestKey:one.artifacts.manifestKey}),id:i+1,orderId,root_order_id:root,amazon_order_id:input.amazonOrderId,one_manifest_url:one.artifacts.manifestKey,manifest_3_url:three.manifest3Key,customer_approval_required:true,customer_approval_status:'pending',review_stages:{postPdf:{status:'approved'}},execution_status:'done',workflow_step:'customer_approval',current_workflow:null,started_at:null,quantity:1,shipping_tier:'standard',customer_email:'local-parent@example.test',shipping_address:{name:'Local Recipient',street1:'1 Synthetic Way',city:'Test City',state:'CA',zip:'90001',country:'US'}};
   rows.push(row);tokens.push({token:'local-journey-token-'+caseIndex+'-'+i,order_id:orderId,used_at:null,expires_at:new Date(Date.now()+86400000).toISOString()});
   const sources=rasterManifest.caseChildren.find((x:Row)=>x.role===role);assert(sources&&sources.assets.length===33);assert.equal(sources.formatId,format);
   for(let j=0;j<33;j++){const asset=sources.assets[j];assert(asset.filename.startsWith(role+'/'));assert.match(asset.filename,/^(WEB-A|AMZ-A|SIB-A|SIB-B)\/[A-Za-z0-9_-]+\.png$/);const bytes:Buffer=await readFile(path.join(directory,asset.filename));assert.equal(sha(bytes),asset.pngSha256);const key=j===32?prefix+'/preview-images/cover-spread.png':prefix+'/preview-images/'+one.book.resolved.pageLabels[j]+'.png';blobs.set(key,bytes);}
  }
  const pendingClaim=await claim(request(bindings.BACKEND_URL+'/api/internal/orders/print-routing/claim',{orderDbIds:rows.map(row=>row.id),idempotencyKey:'local-pending-'+caseIndex}));assert.equal(pendingClaim.status,409);
  rows.forEach(row=>row.print_provider=null);
  const pendingUnassigned=await claim(request(bindings.BACKEND_URL+'/api/internal/orders/print-routing/claim',{orderDbIds:rows.map(row=>row.id),idempotencyKey:'local-pending-unassigned-'+caseIndex}));assert.equal(pendingUnassigned.status,409);
  rows.forEach(row=>row.print_provider='gelato');
  // Actual customer route runs before W1; all siblings must approve independently.
  for(const [i,row] of rows.entries()){
   const response=await approve(request(bindings.BACKEND_URL+'/api/preview/'+row.orderId+'/approve',{token:tokens[i].token}),{params:Promise.resolve({orderId:String(row.orderId)})});assert.equal(response.status,200,await response.text());
  }
  assert(rows.every(row=>row.customer_approval_status==='approved'));assert(rows.every(row=>ordinaryPrintRoutingBlocker(row,false)==='gelato_draft_submission_disabled'));
  const classified=process.env.GELATO_LOCAL_NATIVE_QUEUE==='1'
   ? JSON.parse(JSON.stringify(vm.runInNewContext('(function(){'+workflow.nodes.find((n:Row)=>n.name==='Prep Workflow 4 Orders').parameters.jsCode+'})()',{$input:{first:()=>({json:{workflow4:rows}})}})))
   : await new Function('$input','$env',`return async function(){${classifier}}`)({all:()=>rows.map(json=>({json}))},{SUPABASE_SERVICE_ROLE_KEY:'synthetic'}).call({helpers:{request:async({qs}:{qs:Row})=>{const u=new URL('https://local/');Object.entries(qs).forEach(([k,v])=>u.searchParams.set(k,String(v)));return match(rows,u)}}});
  assert.equal(classified.length,count);
  const claimCode=workflow.nodes.find((n:Row)=>n.name==='Claim and Route Gelato Groups').parameters.jsCode;
  let envelopes;
  if(process.env.GELATO_LOCAL_NATIVE_QUEUE==='1'){
   const {POST:nativeQueue}=await import('../src/app/api/internal/orders/print-routing/queue/route');
   const patch=JSON.parse(await readFile('../docs/n8n-workflow-files/repo-centric/patches/w1-gelato-native-queue.patch.json','utf8'));
   const prep=patch.nodes.find((n:Row)=>n.name==='Prepare Native Print Queue');
   const source=JSON.parse(JSON.stringify(vm.runInNewContext('(function(){'+prep.parameters.jsCode+'})()',{$input:{all:()=>classified}})))[0].json;
   const queueHttp=patch.nodes.find((n:Row)=>n.name==='Claim Native Print Queue');
   assert.equal(queueHttp.parameters.url,bindings.BACKEND_URL+'/api/internal/orders/print-routing/queue');
   const queueBody=JSON.parse(vm.runInNewContext(queueHttp.parameters.jsonBody.slice(3,-2).trim(),{$json:source}));
   const off=await nativeQueue(request(bindings.BACKEND_URL+'/api/internal/orders/print-routing/queue',queueBody));assert.equal(off.status,200);assert((await off.json()).groups.every((g:Row)=>g.dispatchRoute==='hold'));
   process.env.GELATO_DRAFT_SUBMISSION_ENABLED='true'; // Fake process-local bindings and intercepted transport only.
   let result;try{const queued=await nativeQueue(request(bindings.BACKEND_URL+'/api/internal/orders/print-routing/queue',queueBody));assert.equal(queued.status,200,await queued.clone().text());result=await queued.json();}finally{process.env.GELATO_DRAFT_SUBMISSION_ENABLED='false';}
   const expander=patch.nodes.find((n:Row)=>n.name==='Expand Native Print Queue');
   envelopes=JSON.parse(JSON.stringify(vm.runInNewContext('(function(){'+expander.parameters.jsCode+'})()',{$input:{first:()=>({json:result})},$:()=>({first:()=>({json:source})})})));
  }else{
  envelopes=await new Function('$input','$env',`return async function(){${claimCode}}`)({all:()=>classified},{BACKEND_BASE_URL:bindings.BACKEND_URL,BACKEND_API_TOKEN:bindings.BACKEND_API_TOKEN}).call({helpers:{request:async({uri,body}:{uri:string;body:unknown})=>{assert.equal(new URL(uri).pathname,'/api/internal/orders/print-routing/claim');const response=await claim(request(uri,body));assert.equal(response.status,200,await response.clone().text());return response.json();}}});
  }
  assert.equal(envelopes.length,1);assert.equal(envelopes[0].json.dispatchRoute,'dispatch');
  const native=JSON.parse(await readFile('../docs/n8n-workflow-files/repo-centric/workflows/'+(count===1?'w4-GELATO-Print_Fulfillment.repo-centric.json':'w4.1-GELATO-Sibling-Aggregation.repo-centric.json'),'utf8'));
  const payload=envelopes[0].json;
  const outputs=new Map();let current='Prepare Gelato Request',data:unknown={body:payload};const paths:string[]=[];
  for(let step=0;step<12&&current;step++){
   const n=native.nodes.find((n:Row)=>n.name===current);assert(n);
   const scope=()=>({$input:{first:()=>({json:data})},$execution:{id:'local-execution-'+caseIndex},$:(name:string)=>({first:()=>({json:outputs.get(name)})})});
   if(n.type==='n8n-nodes-base.code')data=JSON.parse(JSON.stringify(vm.runInNewContext('(function(){'+n.parameters.jsCode+'})()',scope())))[0].json;
   else {
    const expr=(s:string)=>vm.runInNewContext(s.slice(3,-2).trim(),scope());const url=expr(n.parameters.url),body=JSON.parse(expr(n.parameters.jsonBody)),p=new URL(url).pathname;paths.push(p);
    const handler=p.endsWith('/build-gelato-print-pdf')?singlePdf:p.endsWith('/build-gelato-sibling-print-pdf')?siblingPdf:p.endsWith('/quote-gelato-submission')?quote:p.endsWith('/submit-gelato-draft')?submit:null;assert(handler);
    if(p.endsWith('/submit-gelato-draft')) {
     assert.equal((await handler(request(url,body))).status,409,'OFF must reject ordinary draft submission without an exemption');
     // Positive ordinary-path control is process-local with only fake credentials/transports.
     process.env.GELATO_DRAFT_SUBMISSION_ENABLED='true';
     const priorState=rows[0].customer_approval_status; rows[0].customer_approval_status='revision_requested';
     assert.equal((await handler(request(url,body))).status,409,'Approval revoked after quote must stop create');
     assert.equal(creates,beforeCreates); rows[0].customer_approval_status=priorState;
    }
    try { const result=await handler(request(url,body));const text=await result.text();assert.equal(result.status,200,text);data=JSON.parse(text); }
    finally { process.env.GELATO_DRAFT_SUBMISSION_ENABLED='false'; }
   }
   outputs.set(current,data);current=native.connections[current]?.main?.[0]?.[0]?.node??'';
  }
  assert.equal(creates-beforeCreates,1);assert.equal(ctx!.submission.request_state,'submitted');assert.equal(ctx!.members.length,count);
  const fingerprints=ctx!.members.map(m=>sha(blobs.get(m.artifact_key!)!));assert.equal(new Set(fingerprints).size,count);
  process.env.GELATO_DRAFT_SUBMISSION_ENABLED='true';
  const replay=await submit(request(bindings.BACKEND_URL+'/api/internal/w4/submit-gelato-draft',{submissionId,claimToken:leaseToken,executionId:'local-replay',mode:count===1?'single':'siblings'}));process.env.GELATO_DRAFT_SUBMISSION_ENABLED='false';assert.equal(replay.status,200);assert.equal(creates-beforeCreates,1,'Replay must reuse submitted draft');
  const packet=await buildGelatoReleaseReview(ctx!,{accountKeySha256:sha(Buffer.from('synthetic-account')),intendedAccountKeySha256:sha(Buffer.from('synthetic-account')),cohortSubmissionIds:[submissionId],artifactSha256:new Map(ctx!.members.map((m,i)=>[m.artifact_key!,fingerprints[i]])),loadArtifact:async key=>blobs.get(key)!,loadOrder:async key=>rows.find(row=>row.orderId===key)??null});
  assert.equal(packet.canRelease,false);assert.equal(packet.knownSubtotalCents,count===1?'1718':'2936');assert.equal(packet.payableTotalCents,null);assert.deepEqual(packet.blockers,['ordinary_release_transport_not_installed','specific_paid_test_approval_required','taxes_fees_and_payable_total_unverified']);
  if(caseIndex===1){
   const inputs={accountKeySha256:sha(Buffer.from('synthetic-account')),intendedAccountKeySha256:sha(Buffer.from('synthetic-account')),cohortSubmissionIds:[submissionId],artifactSha256:new Map(ctx!.members.map((m,i)=>[m.artifact_key!,fingerprints[i]])),loadArtifact:async(key:string)=>blobs.get(key)!,loadOrder:async(key:string)=>rows.find(row=>row.orderId===key)??null};
   let reads=0;const noReads={...inputs,loadArtifact:async()=>{reads++;throw Error('Not allowed')},loadOrder:async()=>{reads++;throw Error('Not allowed')}};
   await assert.rejects(()=>buildGelatoReleaseReview(ctx!,{...noReads,accountKeySha256:'0'.repeat(64)}),/account_identity_mismatch/);
   await assert.rejects(()=>buildGelatoReleaseReview(ctx!,{...noReads,cohortSubmissionIds:[]}),/outside_explicit_cohort/);assert.equal(reads,0);
   const damaged=await buildGelatoReleaseReview(ctx!,{...inputs,loadArtifact:async()=>new Uint8Array([1,2,3])});assert(damaged.blockers.includes('artifact_hash_mismatch'));
   const changedRecipient=await buildGelatoReleaseReview(ctx!,{...inputs,loadOrder:async key=>({...rows.find(row=>row.orderId===key)!,shipping_address:{}})});assert(changedRecipient.blockers.includes('recipient_changed'));
   const changedQuantity=await buildGelatoReleaseReview(ctx!,{...inputs,loadOrder:async key=>({...rows.find(row=>row.orderId===key)!,quantity:2})});assert(changedQuantity.blockers.includes('product_quantity_or_pages_mismatch'));
   const expired=await buildGelatoReleaseReview(ctx!,{...inputs,now:new Date(Date.now()+16*60000)});assert(expired.blockers.includes('fresh_bound_quote_required'));
   const scaled=structuredClone(ctx!),scaledSaved=GelatoSavedSnapshotSchema.parse(scaled.submission.request_snapshot),scaledQuote=GelatoMonetaryQuoteSchema.parse(scaledSaved.monetaryQuote);
   scaledSaved.request.items[0].quantity=2;scaledQuote.products[0].quantity=2;scaledQuote.products[0].price='24.36';
   scaledQuote.requestFingerprint=gelatoQuoteRequestFingerprint({orderReferenceId:scaledSaved.request.orderReferenceId,customerReferenceId:scaledSaved.request.customerReferenceId,currency:scaledSaved.request.currency,recipient:scaledSaved.request.shippingAddress,allowMultipleQuotes:false,products:scaledSaved.request.items},scaledSaved.config.shipmentMethodPolicy,scaledSaved.shippingTier,scaledSaved.request.shipmentMethodUid);
   scaledSaved.monetaryQuote=scaledQuote;scaled.submission.request_snapshot=scaledSaved;scaled.submission.quote_request_fingerprint=scaledQuote.requestFingerprint;
   const quantityTwo=await buildGelatoReleaseReview(scaled,{...inputs,loadOrder:async key=>({...rows.find(row=>row.orderId===key)!,quantity:2})});assert.equal(quantityTwo.productsCents,'2436');assert.equal(quantityTwo.knownSubtotalCents,'2936');assert.deepEqual(quantityTwo.blockers,packet.blockers);
   const unknown=structuredClone(ctx!);const monetary=(unknown.submission.request_snapshot as Row).monetaryQuote as {products:Array<{price:unknown}>};monetary.products[0].price=null;
   const unknownPrice=await buildGelatoReleaseReview(unknown,inputs);assert(unknownPrice.blockers.includes('product_cost_unknown'));assert.equal(unknownPrice.knownSubtotalCents,null);
  }
  const combinedJourney=process.env.GELATO_LOCAL_PERSISTENT_JOURNEY==='1' ? await (await import('./helpers/gelato-combined-local-journey')).proveCombinedLocalJourney({context:ctx!,raw,rows,blobs,label}) : undefined;
  const statusJourney=process.env.GELATO_LOCAL_STATUS_JOURNEY==='1' ? await (await import('./helpers/gelato-local-status-journey')).proveLocalStatusJourney({context:ctx!,raw,rows,blobs}) : undefined;
  results.push({...(combinedJourney?{combinedJourney}:{}),...(statusJourney?{statusJourney}:{}),case:label,children:count,productUid:GelatoSavedSnapshotSchema.parse(ctx!.submission.request_snapshot).config.productUid,innerPageCount:32,apiPageCount:32,uploadedPdfPageCount:35,quantityPerItem:1,pdfHashes:fingerprints,pdfPageCounts:ctx!.members.map(m=>m.pdf_page_count),providerCreates:creates-beforeCreates,releaseReview:packet,nativeHttpPaths:paths,state:ctx!.submission.request_state,localNativeQueueBridge:process.env.GELATO_LOCAL_NATIVE_QUEUE==='1',liveControlsAccessed:false,testProcessControlRestoredOff:true,upstream:'canonical W0/W3 producer; dummy raster substitution; simulated admin decision and DB/RPC adapters',config:'in-memory active clone; bundled v2 stays draft'});
 }
 assert.equal(new Set(results.flatMap(result=>result.pdfHashes as string[])).size,4);assert.equal(creates,3);assert.equal(claims,3);assert(calls.every(x=>!x.startsWith('PATCH order.gelatoapis.com')));assert.equal(process.env.GELATO_DRAFT_SUBMISSION_ENABLED,'false');
 if(process.env.GELATO_LOCAL_JOURNEY_OUTPUT)await writeFile(process.env.GELATO_LOCAL_JOURNEY_OUTPUT,JSON.stringify({passed:true,cases:results,liveRequests:0,providerSimulation:{creates,quotes},limitations:['Positive submission uses a temporary process-local true binding with fake services; live controls never accessed','No hosted n8n engine','Upstream image generation and admin decision simulated',process.env.GELATO_LOCAL_PERSISTENT_JOURNEY==='1'?'Assembled draft graph handed to disposable PostgreSQL; REST transport simulated, not PostgREST':'Atomic SQL independently tested, not PostgREST',process.env.GELATO_LOCAL_PERSISTENT_JOURNEY==='1'?'Regular conversion and lifecycle simulated over disposable SQL; no real provider or physical production':'No regular release/conversion or physical production']},null,2)+'\n');
 console.log(JSON.stringify({passed:true,cases:results.map(x=>x.case),childPdfs:4,syntheticDraftCreates:creates,liveRequests:0}));
 } finally {Object.assign(process.env,bindings);globalThis.fetch=previous;}
}
void main().catch(e=>{console.error(e);process.exitCode=1});
