import { createOrdinaryReleaseHttpHandler } from '../src/lib/books/gelato-ordinary-release-application';
import { createOrdinaryReleaseFixture } from './helpers/gelato-ordinary-release-fixture';
import { ESTIMATE_TEST_PRINT_POLICY, observeGelatoReleaseEstimate } from '../src/lib/books/gelato-release-estimate';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
/** Synthetic loopback UI QA gateway. Never loads dotenv or forwards API actions to Next/live services. */
import { connect } from 'node:net';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mapSupabaseOrderToOrder } from '../src/lib/order-mapper';
import { createAdminWorkflowTestAdmission } from '../src/lib/admin-workflow-test';
import { loadBundledBookConfig } from '../src/lib/books/load-book-config';
const port=3010, backend='http://127.0.0.1:3009', origin=`http://127.0.0.1:${port}`, config=loadBundledBookConfig({bookId:'book-finding-our-inner-voice',version:3});
const state=new Map<string,string>();
let csvUiRequests=0;
const token='synthetic-ui-gateway-only-token-long-value';
const sid='11111111-1111-4111-8111-111111111111';
const quote=(orderId:string)=>({state:'operator_review',orderId,submissionId:sid,packetSha256:'d'.repeat(64),expiresAt:new Date(Date.now()+(orderId==='UI-EXPIRED'?-1000:300000)).toISOString(),recipient:{firstName:'Test',lastName:'Adult',addressLine1:'1 Synthetic Lane',city:'Test City',state:'CA',postCode:'00000',country:'US',email:'test@example.test'},quantity:1,productUid:'synthetic-photo-book',service:'usps_ground_advantage',accountSha256:'e'.repeat(64),quote:{version:1,quoteId:'synthetic-quote',quotedAt:new Date().toISOString(),requestFingerprint:'c'.repeat(64),currency:'USD',selectedShipmentMethodUid:'usps_ground_advantage',products:[{itemReferenceId:'item',productUid:'synthetic-photo-book',quantity:1,price:'12.18',currency:'USD'}],shippingOptions:[{shipmentMethodUid:'usps_ground_advantage',name:'USPS Ground Advantage',type:'normal',price:'3.81',initialPrice:'3.81',currency:'USD',minDeliveryDate:null,maxDeliveryDate:null,numberOfParcels:1}]},pdfUrl:origin+'/api/pdf/synthetic.pdf',artifacts:[{key:'synthetic.pdf',sha256:'a'.repeat(64),pageCount:35,orderId}],canSubmit:orderId!=='UI-BLOCKED',submissionEnabled:orderId!=='UI-BLOCKED'});
async function order(orderId:string){
 const approval=orderId==='UI-APPROVAL', noPreview=orderId==='UI-NO-PREVIEW';
 const status=approval||noPreview?'pending_review':'pending_review';
 const requested=state.get(orderId)==='prepared';
 const row={id:9001,orderId,amazon_order_id:orderId,root_order_id:orderId,platform:'amazon',status,
  product_info:{_overnight_test:true,_created_via_csv:true,_admin_workflow_test:{...createAdminWorkflowTestAdmission('operator@example.test',3),...(requested?{preparePrintRequestedAt:new Date().toISOString()}:{})}},book_specs:{bookId:config.bookId,formatId:'amazon',configVersion:3,totalPages:32},
  print_provider:'gelato',print_book_id:config.bookId,print_format_id:'amazon',print_config_version:3,print_submission_id:approval||noPreview?null:sid,
  customer_name:'Test Adult',customer_email:'test@example.test',character_specs:{childName:'Alex',age:5,pronouns:'they/them',animalGuide:'cat',skinTone:'medium',hairColor:'brown',hairStyle:'short-straight',favoriteColor:'blue',hometown:'Synthetic Town'},
  shipping_address:{name:'Test Adult',address:'1 Synthetic Lane',city:'Test City',state:'CA',zip:'00000',country:'US'},created_at:new Date().toISOString(),
  execution_status:approval?'ready_for_processing':'done',next_workflow:approval?'4':null,workflow_step:approval||noPreview?'customer_approval':'print_prepared',
  current_workflow:null,started_at:null,customer_approval_required:true,customer_approval_status:noPreview?'not_requested':approval?'approved':'approved',
  review_stages:{preBria:{status:'approved'},postBria:{status:'approved'},postPdf:{status:'approved'}},one_manifest_url:origin+'/api/manifests/book-finding-our-inner-voice/orders/'+orderId+'/manifests/1-manifest.json',manifest_3_url:origin+'/api/manifests/book-finding-our-inner-voice/orders/'+orderId+'/manifests/3-manifest.json',gelato_order_type:orderId==='UI-DRAFT'?(releaseExecuted?'order':'draft'):undefined,gelato_status:orderId==='UI-DRAFT'?(releaseExecuted?'created':'draft'):approval||noPreview?null:'prepared'};
 if(orderId.startsWith('UI-W2A-')){
  const count=Number(state.get(orderId+'-reads')??0)+1; state.set(orderId+'-reads',String(count));
  Object.assign(row,{execution_status:orderId==='UI-W2A-POLL'&&count===1?'processing':'error_requires_manual_review',current_workflow:orderId==='UI-W2A-POLL'&&count===1?'2A':null,next_workflow:'2A',workflow_step:'order_intake',print_submission_id:null,manifest_3_url:null,customer_approval_status:null,review_stages:{preBria:{status:'pending'},postBria:{status:'pending'},postPdf:{status:'pending'}},error_type:'w2a_provider_billing',error_message:'Gemini image generation is blocked because its prepaid credits are depleted. Restore the project balance, then queue W2A again.',started_at:orderId==='UI-W2A-POLL'&&count===1?new Date().toISOString():null});
 }
 const result=await mapSupabaseOrderToOrder(row,{includeStatus:false});
 result.totalSiblings=1;result.siblingOrders=[{orderId,childName:'Alex',status:result.status} as never];
 if(!noPreview)result.customerPreview={token:'synthetic-preview',url:origin+'/approve/synthetic-preview',notification:{status:'suppressed'}};
 result.bookContext={bookId:config.bookId,formatId:'amazon',orderPrefix:config.bookId+'/orders/'+orderId,pagePlanSource:'runtime-config',expectedPageCount:32,pageLabels:config.formats.amazon.interior.pageSequence.map(p=>p.label),pagePlan:config.formats.amazon.interior.pageSequence,printTrimMm:{w:200,h:200}} as never;
 return result;
}
let releaseSubmissionId=sid, releaseExecuted=false;
let releaseHandler: ReturnType<typeof createOrdinaryReleaseHttpHandler> | undefined;
async function releaseFixtureHandler() {
 if (!releaseHandler) {
  const fixture=await createOrdinaryReleaseFixture('amazon',1,new Date());
  releaseSubmissionId=fixture.permit.submissionId;
  for (const snapshot of [fixture.f.context.submission.quote_snapshot,fixture.f.context.submission.request_snapshot]) { if(snapshot && typeof snapshot==='object') (snapshot as {request:{shippingAddress:Record<string,string>}}).request.shippingAddress.addressLine2='Unit 42'; }
  for (const row of fixture.f.rows.values()) (row.shipping_address as Record<string,string>).street2='Unit 42';
  for (const provider of fixture.f.context.providerOrders) { const snapshot=provider.snapshot as {shippingAddress:Record<string,string>};snapshot.shippingAddress.addressLine2='Unit 42'; }
  fixture.d.pricingPolicy=ESTIMATE_TEST_PRINT_POLICY;
  fixture.d.payableEvidence=async(raw,context)=>{if(!context)throw Error('Missing synthetic quote context');return observeGelatoReleaseEstimate(raw,context);};
  const approvals=new Map<string,{permit:unknown;actor:string;packet:unknown}>();
  fixture.d.approvedPacket=async id=>approvals.get(id)?.packet;
  releaseHandler=createOrdinaryReleaseHttpHandler({authenticate:async()=>({ok:true,mode:'access',actor:'operator@example.test'}),runtime:async()=>({kind:'ready',application:{release:fixture.d,approvers:new Set(['operator@example.test']),register:async input=>{
   for(const key of Object.keys(fixture.permit))delete (fixture.permit as unknown as Record<string,unknown>)[key];Object.assign(fixture.permit,input.permit);
   approvals.set(input.permit.id,{permit:input.permit,actor:input.actor,packet:input.packet});return input.permit.id;
  },approved:async id=>approvals.get(id)??null}})});
 }
 return releaseHandler;
}
const server=createServer(async(req,res)=>{
 const url=new URL(req.url!,origin);res.setHeader('Cache-Control','no-store');
 const json=(body:unknown,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
 try{
  if(url.pathname.startsWith('/api/')){
   if(url.pathname==='/api/admin/w2a-recovery'){
    let id=url.searchParams.get('orderId')??'';
    if(req.method==='POST'){
     const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk);
     const body=JSON.parse(Buffer.concat(chunks).toString());id=body.orderId;
     console.log(JSON.stringify({w2aUiAction:body.action,orderId:id,resolvedCause:body.resolvedCause===true}));
     await new Promise(resolve=>setTimeout(resolve,500));
     state.set(id,body.action==='record_failure'?'recorded':'queued');
     return json({success:id!=='UI-W2A-UNCERTAIN',action:body.action,...(id==='UI-W2A-UNCERTAIN'?{error:'Response was not confirmed'}:{})},id==='UI-W2A-UNCERTAIN'?503:200);
    }
    if(id==='UI-W2A-LOOKUP-ERROR')return json({error:'Workflow inspection is unavailable'},503);
    if(id==='UI-W2A-SLOW')await new Promise(resolve=>setTimeout(resolve,2000));
    const missing=id==='UI-W2A-MISSING'&&state.get(id)!=='recorded',queued=state.get(id)==='queued';
    const candidate={orderRowId:9001,orderId:id,rootOrderId:id,executionStatus:queued?'ready_for_processing':missing?'processing':'error_requires_manual_review',currentWorkflow:missing?'2A':null,workflowStep:'order_intake',manifest2aUrl:null,oneManifestUrl:'/synthetic/1-manifest.json',updatedAt:'2026-11-16T07:00:00Z',latestJobUpdateAt:null,minutesSinceLatestJobUpdate:null,alreadyCompleted:false,allSucceeded:false,hasIncompleteJobs:false,recommendedAction:queued?'monitor':missing?'record_failure':'retry',recommendedReason:queued?'queued_for_router':'generation_stopped_before_pose_jobs',jobCounts:{total:0,statuses:{},activeCount:0,succeededCount:0,failedCount:0,retryWaitingCount:0,deadLetteredCount:0,canceledCount:0}};
    return json({success:true,summary:{candidateCount:id?1:0,finalizeReady:0,replayReady:0,inspectNeeded:id?1:0},candidates:id?[candidate]:[],inspectionError:null,inspectedOrder:id?{...candidate,resolvedVia:'orderId',safeToFinalize:false,safeToReplay:false,payloadRecoverable:true,workflow:{id:'synthetic',name:'W2A',active:true,isArchived:false},matchedExecution:{id:'101',status:'error',startedAt:'2026-11-16T05:50:28Z',finished:false,stoppedAt:'2026-11-16T05:50:34Z'},executionLookupError:null,replayableLogicalKeys:[],pendingLogicalKeys:[],failure:{executionId:'101',claimStartedAt:'2026-11-16T05:50:28.244000Z',failedAt:'2026-11-16T05:50:34.758000Z',code:'w2a_provider_billing',message:'Gemini image generation is blocked because its prepaid credits are depleted. Restore the project balance, then queue W2A again.',...(queued?{resolvedAt:'2026-11-16T07:00:00Z'}:{})},failureRecorded:!missing&&!queued,canRecordFailure:missing,safeToRetry:!missing&&!queued,failureLookupError:null,failureRevision:'2026-11-16T07:00:00Z'}:null});
   }
   if(url.pathname==='/api/admin/amazon-orders/upload-csv'&&req.method==='POST'){
    const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk);
    const form=await new Request(origin+url.pathname,{method:'POST',headers:{'content-type':req.headers['content-type']??''},body:Buffer.concat(chunks)}).formData();
    if([...form.keys()].some(key=>!['file','admin_workflow_test'].includes(key)))return json({error:'UI sent a forbidden book selector'},400);
    const file=form.get('file');if(!file||typeof file==='string')return json({error:'Missing synthetic CSV'},400);
    console.log(JSON.stringify({csvUiRequest:++csvUiRequests,fieldNames:[...form.keys()],workflowTest:form.get('admin_workflow_test')==='true'}));
    if(file.name.includes('uncertain')){res.destroy();return;}
    if(file.name.includes('error'))return json({error:'The book could not be identified for row 2. Include a recognized Amazon SKU or ASIN.'},400);
    if(file.name.includes('delay'))await new Promise(resolve=>setTimeout(resolve,1200));
    const bad=file.name.includes('legacy');
    return json({success:true,summary:{total_rows:1,created:1,matched:0,pending:0,errors:0},details:{created_orders:['UI-CSV-NEW'],matched_orders:[],pending_orders:[],errors:[],w0_triggered:['UI-CSV-NEW'],w0_skipped:[]},selection:{bookId:bad?'book-mvp-simple-adventure':config.bookId,formatId:'amazon',configVersion:bad?1:3,title:bad?'Adventure Compass':'Finding Our Inner Voice'},timestamp:new Date().toISOString()});
   }
   const artDir=process.env.LHL_UI_ARTIFACT_DIR;
   if(artDir&&url.pathname.startsWith('/api/assets/')){
    const label=url.pathname.match(/\/(p\d{2}|cover-spread|cover)\.png$/)?.[1];
    if(label){const bytes=await sharp(readFileSync(resolve(artDir,'live-pages',label==='cover-spread'?'cover.png':label+'.png'))).resize({width:700}).png().toBuffer();res.writeHead(200,{'Content-Type':'image/png'});res.end(bytes);return;}
   }
   if(artDir&&url.pathname.startsWith('/api/manifests/')&&url.pathname.endsWith('3-manifest.json')){
    const id=url.pathname.match(/\/orders\/([^/]+)\//)?.[1]??'UI-APPROVAL';
    const source=readFileSync(resolve(artDir,'private/live-3-manifest.json'),'utf8').replaceAll('TEST-PRINT-20261115-A',id).replaceAll('https://admin.littleherolabs.com',origin);
    return json(JSON.parse(source));
   }

   if(url.pathname==='/api/admin/gelato-print'&&url.searchParams.get('orderId')==='UI-DRAFT')await releaseFixtureHandler();
   if(url.pathname==='/api/admin/gelato-print')return json({submissionId:url.searchParams.get('orderId')==='UI-DRAFT'?releaseSubmissionId:sid,releaseAttempt:url.searchParams.get('orderId')==='UI-DRAFT'&&releaseExecuted?{attempted:true,state:'converted'}:null,state:url.searchParams.get('orderId')==='UI-DRAFT'?'submitted':'operator_review',orders:url.searchParams.get('orderId')==='UI-DRAFT'?[{id:'synthetic-root',orderType:releaseExecuted?'order':'draft',status:releaseExecuted?'created':'draft',actionReason:null}]:[],items:[{orderId:url.searchParams.get('orderId'),status:null}],canRefresh:false,canRecover:false,notifications:[]});
   if(url.pathname==='/api/admin/gelato-release'&&req.method==='POST'){
    const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk);
    const action=JSON.parse(Buffer.concat(chunks).toString());
    const handler=await releaseFixtureHandler(),response=await handler(new Request('https://admin.example.test/api/admin/gelato-release',{method:'POST',headers:{'Content-Type':'application/json'},body:Buffer.concat(chunks).toString()}));
    const body=await response.json();if(action.action==='execute'&&body.state==='converted')releaseExecuted=true;return json(body,response.status);
   }
   if(url.pathname==='/api/admin/workflow-test-print'){
    if(req.method==='GET'){const id=url.searchParams.get('orderId')!;if(id==='UI-EMPTY'&&!state.has(id))return json({error:'Refresh quote required'},409);return json(quote(id));}
    const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks).toString());
    if(body.action==='review'){state.set(body.orderId,'reviewed');return json(quote(body.orderId));}
    return json({error:'Synthetic uncertain-response fixture. Reload print status; no provider call occurred.'},409);
   }
   if(url.pathname==='/api/orders/UI-APPROVAL/print'&&req.method==='POST'){
    if(!process.env.LHL_UI_OPERATOR_RECEIPT)return json({error:'Actual handler receipt not supplied to this fixture'},409);
    const receipt=JSON.parse(readFileSync(process.env.LHL_UI_OPERATOR_RECEIPT,'utf8')).cases[0].operatorPreparationReceipt;
    if(!receipt?.preparationOnly||receipt.next_workflow!=='4')throw Error('Invalid actual handler receipt');
    state.set('UI-APPROVAL','prepared');return json({...receipt,orderId:'UI-APPROVAL',queuedOrderIds:['UI-APPROVAL']});
   }
   const match=url.pathname.match(/^\/api\/orders\/([^/]+)$/);if(match)return json(await order(decodeURIComponent(match[1])));
   if(url.pathname.endsWith('/final-approval'))return json({previewUrl:origin+'/approve/synthetic-preview',token:'synthetic-preview',notification:{sent:false,attempted:false,skipped:true},order:await order('UI-NO-PREVIEW')});
   if(url.pathname.startsWith('/api/manifests/'))return json({schema:'lhb.run-manifest@v3',pages:{},summary:{totalPages:32}});
   return json({error:'Synthetic UI fixture has no data for this request'},404);
  }
  const response=await fetch(backend+url.pathname+url.search,{method:req.method,headers:{authorization:'Bearer '+token,accept:req.headers.accept??'*/*'}});
  res.writeHead(response.status,Object.fromEntries([...response.headers].filter(([key])=>!['content-encoding','content-length','transfer-encoding'].includes(key))));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{json({error:'Synthetic UI gateway unavailable'},503);}
});
server.on('upgrade', (request, socket, head) => {
 const upstream = connect(3009, '127.0.0.1', () => {
  const headers = Object.entries(request.headers).filter(([key]) => !['authorization','host','origin'].includes(key)).map(([key, value]) => `${key}: ${value}`).join('\r\n');
  upstream.write(`${request.method} ${request.url} HTTP/1.1\r\n${headers}\r\nhost: localhost:3009\r\norigin: http://localhost:3009\r\nauthorization: Bearer ${token}\r\n\r\n`);
  if (head.length) upstream.write(head); socket.pipe(upstream); upstream.pipe(socket);
 });
 upstream.on('error', () => socket.destroy()); socket.on('error', () => upstream.destroy());
});
server.listen(port,'127.0.0.1',()=>console.log(`Synthetic UI gateway ${origin}; API calls remain local. Fixture id hash ${createHash('sha256').update(sid).digest('hex').slice(0,8)}`));
