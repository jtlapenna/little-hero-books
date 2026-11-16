import assert from 'node:assert/strict';
async function main() {
 Object.assign(process.env,{SUPABASE_URL:'https://operator.example.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic-operator',CLOUDFLARE_ACCOUNT_ID:'synthetic-operator',CLOUDFLARE_R2_ACCESS_KEY_ID:'synthetic-access',CLOUDFLARE_R2_SECRET_ACCESS_KEY:'synthetic-secret',BACKEND_API_TOKEN:'synthetic-operator-signing-at-least-thirty-two'});
 let row:Record<string,unknown>={}, writes=0, objects=0,tokens=0,manifest:unknown, race=false, mirrorFailure=false;
 const original=globalThis.fetch, logs={log:console.log,warn:console.warn,error:console.error};console.log=()=>{};console.warn=()=>{};console.error=()=>{};
 globalThis.fetch=async(input,init)=>{
  const request=new Request(input,init),url=new URL(request.url);
  if(url.origin==='https://operator.example.test'){
   const table=url.pathname.split('/').pop();
   if(table==='preview_tokens') { if(request.method==='POST') {tokens++;return Response.json({id:1,...await request.json()});} return Response.json(request.headers.get('accept')?.includes('object')?null:[]); }
   assert.equal(table,'orders');
   const patch=request.method==='PATCH'?await request.json():null;
   if(race&&patch){row.updated_at='2026-11-16T08:00:00Z';row.current_workflow='3';row.started_at='2026-11-16T08:00:00Z';race=false;}
   const matched=[...url.searchParams].every(([k,v])=>['select','order','limit','offset'].includes(k)||v==='is.null'?['select','order','limit','offset'].includes(k)||row[k]==null:v.startsWith('eq.')?String(row[k])===v.slice(3):true);
   if(patch&&mirrorFailure&&'flags' in patch) return Response.json({message:'Synthetic flag mirror failure'},{status:503});
   if(patch&&matched){writes++;Object.assign(row,patch);}
   return Response.json(request.headers.get('accept')?.includes('object')?matched?row:null:matched?[row]:[]);
  }
  assert.equal(url.origin,'https://little-hero-orders.synthetic-operator.r2.cloudflarestorage.com');
  if(request.method==='PUT'){objects++;manifest=JSON.parse(await request.text());return new Response(null,{status:200});}
  assert.equal(request.method,'GET');return Response.json(manifest);
 };
 try {
  const {NextRequest}=await import('next/server');
  const {POST:regenerate}=await import('../src/app/api/admin/orders/[orderId]/regenerate-3/route');
  const {POST:finalApproval}=await import('../src/app/api/orders/[orderId]/final-approval/route');
  const {POST:flag}=await import('../src/app/api/orders/[orderId]/flag/route');
  const {POST:approve}=await import('../src/app/api/orders/[orderId]/approve/route');
  const {POST:queue}=await import('../src/app/api/orders/[orderId]/queue-workflow-3/route');
  const {POST:trigger}=await import('../src/app/api/orders/[orderId]/trigger-book-assembly/route');
  const id='SYNTHETIC-OPERATOR',prefix='book-finding-our-inner-voice/orders/'+id;
  const base={id:91,orderId:id,platform:'amazon',product_info:{_overnight_test:true},manifest_2b_url:prefix+'/manifests/2b-manifest.json',manifest_3_url:prefix+'/manifests/3-manifest.json',status:'pending_assembly_review',workflow_step:'book_assembly_completed',execution_status:'done',current_workflow:null,started_at:null,updated_at:'2026-11-16T07:00:00Z',review_stages:{preBria:{status:'approved'},postBria:{status:'approved'},postPdf:{status:'approved'}},has_flags:false,flags:{total:0}};
  const reset=(patch:Record<string,unknown>={})=>{row={...structuredClone(base),...patch};writes=0;objects=0;tokens=0;manifest={entries:[{poseNumber:0,bgRemovedKey:'synthetic.png'}],orderId:id,finalBookUrl:'https://synthetic.example/old.pdf',pageLabels:['p00','p01'],pagePreviewImages:[0,1].map(n=>({pageLabel:'p0'+n,r2Key:prefix+'/preview-images/p0'+n+'.png'})),pngGeneration:{coverImageR2Key:prefix+'/preview-images/cover.png'},summary:{readyForBook:true}};};
  const request=(action:string)=>new NextRequest('https://admin.littleherolabs.com/api/orders/'+id+'/'+action,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({notifyCustomer:false})});
  const context={params:Promise.resolve({orderId:id})};
  for(const owner of [{current_workflow:'3',started_at:'2026-11-16T07:01:00Z',execution_status:'processing'},{print_submission_id:'owned',print_claim_token:'owned',gelato_order_id:'owned',gelato_status:'printed'}]) for(const [name,handler]of [['regenerate-3',regenerate],['final-approval',finalApproval],['queue-workflow-3',queue],['trigger-book-assembly',trigger]]as const){
   reset(owner);const response=await handler(request(name),context);assert.equal(response.status,409,name+' must preserve active ownership');assert.equal(writes,0);assert.equal(objects,0);assert.equal(tokens,0);
  }
  reset({current_workflow:'3',started_at:'2026-11-16T07:01:00Z',execution_status:'processing'}); const staleApproval=await approve(new NextRequest('https://admin.littleherolabs.com/api/orders/'+id+'/approve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({stage:'postBria',status:'approved',bookId:'book-finding-our-inner-voice',orderPrefix:prefix})}),context); assert.equal(staleApproval.status,409); assert.equal(writes,0); assert.equal(row.current_workflow,'3');
  reset({manifest_3_url:null,workflow_step:'bria_processing_complete',status:'pending_bg_removal_review',review_stages:{preBria:{status:'approved'},postBria:{status:'pending'},postPdf:{status:'pending'}}}); const approveRequest=()=>new NextRequest('https://admin.littleherolabs.com/api/orders/'+id+'/approve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({stage:'postBria',status:'approved',bookId:'book-finding-our-inner-voice',orderPrefix:prefix})}); const firstApproval=await approve(approveRequest(),context); assert.equal(firstApproval.status,200,await firstApproval.clone().text()); assert.equal(row.next_workflow,'3'); assert.equal(writes,1); assert.equal((await approve(approveRequest(),context)).status,200); assert.equal(writes,1,'duplicate approval cannot requeue');
  for(const [name,handler]of [['queue-workflow-3',queue],['trigger-book-assembly',trigger]]as const){reset();const response=await handler(request(name),context);assert.equal(response.status,200);assert.equal((await response.json()).alreadyComplete,true);assert.equal(writes,0);assert.equal(objects,0);assert.equal(row.execution_status,'done');}
  reset({manifest_3_url:null,workflow_step:'bria_processing_complete',status:'pending_bg_removal_review'});assert.equal((await queue(request('queue-workflow-3'),context)).status,200);assert.equal(row.next_workflow,'3');assert.equal(writes,1);
  reset({manifest_3_url:null,workflow_step:'bria_processing_complete',status:'pending_bg_removal_review',review_stages:{postBria:{status:'pending'}}});assert.equal((await queue(request('queue-workflow-3'),context)).status,409);assert.equal(writes,0);
  reset({manifest_3_url:null,workflow_step:'bria_processing_complete',status:'pending_bg_removal_review'});race=true;assert.equal((await queue(request('queue-workflow-3'),context)).status,409);assert.equal(writes,0);assert.equal(row.current_workflow,'3');
  for(const invalid of [{manifest_3_url:null},{has_flags:true},{flags:{postPdf:1,total:1}},{review_stages:{preBria:{status:'pending'},postBria:{status:'approved'}}},{review_stages:{preBria:{status:'approved'},postBria:{status:'approved'},postPdf:{status:'in-review'}}}]){reset(invalid);assert.equal((await finalApproval(request('final-approval'),context)).status,409);assert.equal(writes,0);assert.equal(tokens,0);}
  reset(); (manifest as Record<string,unknown>).pngGeneration={coverImageR2Key:prefix+'/preview-images/cover.png',pagesMetadata:{p00:{isFlagged:true,needsReview:true}}}; assert.equal((await finalApproval(request('final-approval'),context)).status,409); assert.equal(writes,0); assert.equal(tokens,0);
  reset();manifest={pageLabels:['p00','p01'],pagePreviewImages:[],summary:{readyForBook:false}};assert.equal((await finalApproval(request('final-approval'),context)).status,409);assert.equal(writes,0);
  reset(); const approved = await finalApproval(request('final-approval'),context); assert.equal(approved.status,200,await approved.clone().text()); assert.equal(row.customer_approval_status,'pending'); assert.equal(row.human_approved,true); assert.equal(tokens,1);
  reset();race=true;assert.equal((await finalApproval(request('final-approval'),context)).status,409);assert.equal(writes,0);assert.equal(tokens,0);
  reset(); mirrorFailure=true; const flagged=await flag(new NextRequest('https://admin.littleherolabs.com/api/orders/'+id+'/flag',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({stage:'postPdf',pageNumber:1,bookId:'book-finding-our-inner-voice'})}),context); assert.equal(flagged.status,200,await flagged.clone().text()); assert.equal((manifest as {pngGeneration:{pagesMetadata:{p01:{isFlagged:boolean}}}}).pngGeneration.pagesMetadata.p01.isFlagged,true); assert.equal((row.review_stages as {postPdf:{status:string}}).postPdf.status,'in-review'); const heldWrites=writes; assert.equal((await finalApproval(request('final-approval'),context)).status,409); assert.equal(writes,heldWrites); assert.equal(tokens,0); mirrorFailure=false;
  logs.log('Actual operator routes refuse owned/stale/flagged/incomplete books; completed assembly queue is idempotent; fresh reviewed incomplete queue passes; zero external/provider operations.');
 }finally{globalThis.fetch=original;Object.assign(console,logs);}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
