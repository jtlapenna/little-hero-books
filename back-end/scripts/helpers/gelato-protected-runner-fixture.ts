/** Synthetic disposable service model. No env/key readers, provider clients or default network. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {definitionSha256,workflowDefinition} from './prepare-w1-native-queue';
import {prepareIsolatedWorkflows,type IsolatedCase} from './prepare-gelato-isolated-workflows';
import {NORMAL_FLAGS} from './gelato-isolated-case-runner';
import {ProtectedRunnerBinding,credentialReferenceSha256,sha256,type ProtectedBinding,type ProtectedCredentials} from './gelato-protected-runner-adapter';

export function protectedRunnerFixture(count=1,amazon=false){
 const now=Date.now(),root='TEST-GELATO-LOCAL-'+randomUUID().slice(0,8),source=JSON.parse(readFileSync(path.resolve(__dirname,'../../../docs/n8n-workflow-files/repo-centric/workflows',count===2?'w4.1-GELATO-Sibling-Aggregation.repo-centric.json':'w4-GELATO-Print_Fulfillment.repo-centric.json'),'utf8'));
 const credentials:ProtectedCredentials=Object.fromEntries(['backend','scope','intake','n8n','database','cloudflare','gelato'].map(k=>[k,'SYNTHETIC-'+k+'-'+randomUUID().replaceAll('-','')])) as unknown as ProtectedCredentials;
 const pdfs=Array.from({length:count},(_,i)=>Buffer.from('%PDF-1.4\nSYNTHETIC VISIBLE CHILD '+root+'-'+i+' '+(amazon||count===2?'AMAZON':'WEBSITE')+'\n%%EOF'));
 const p:IsolatedCase={schema:'lhl.gelato-isolated-case@1',runId:'LOCAL-'+randomUUID(),scopeId:randomUUID(),rootOrderId:root,sourceSha:'c'.repeat(40),nativeDefinitionSha256:definitionSha256(workflowDefinition(source)),fixtureManifestSha256:'a'.repeat(64),accountKeySha256:sha256(credentials.gelato),startsAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+20*60_000).toISOString(),members:pdfs.map((pdf,i)=>({orderDbId:101+i,orderId:count===1?root:root+'-'+i,edition:amazon||count===2?'amazon':'standard',pdfSha256:sha256(pdf)}))};
 const prepared=prepareIsolatedWorkflows(p,source);
 const flows=Object.fromEntries(Object.entries(prepared.workflows).map(([k,v],i)=>{
  const bound=JSON.parse(JSON.stringify(v).replaceAll('__LHL_ISOLATED_INTAKE_HEADER_AUTH__','owned-intake').replaceAll('__LHL_BACKEND_HEADER_AUTH_CREDENTIAL_ID__','owned-backend').replaceAll('__LHL_SCOPE_MULTIPLE_HEADERS_AUTH__','owned-scope'));
  return [k,{...bound,id:'OWNED'+i,versionId:'VERSION'+i,activeVersionId:k!=='timer'?'VERSION'+i:null,active:k!=='timer'}];
 }));
 const rows=p.members.map(m=>({id:m.orderDbId,orderId:m.orderId,root_order_id:p.rootOrderId,amazon_order_id:null,print_provider:'gelato',book_specs:{testMode:true},customer_approval_required:true,customer_approval_status:'approved',print_book_id:'book-finding-our-inner-voice',print_config_version:2,print_format_id:m.edition,print_product_uid:'confirmed-square-product',print_inner_page_count:32,print_api_page_count:32,print_expected_pdf_page_count:35}));
 const binding=ProtectedRunnerBinding.parse({packet:p,n8nOrigin:'https://diagnostic.example.test',workflowBindings:Object.fromEntries(Object.entries(flows).map(([k,w])=>[k,{id:w.id,versionId:w.versionId,definitionSha256:definitionSha256(workflowDefinition(w)),credentialReferencesSha256:credentialReferenceSha256(workflowDefinition(w))}])),cohortRowsSha256:definitionSha256(rows),artifacts:p.members.map((m,i)=>({orderDbId:m.orderDbId,key:'book-finding-our-inner-voice/orders/'+m.orderId+'/gelato/print/v2/'+String(i+1).repeat(24)+'.pdf',sourceUrl:'https://admin.littleherolabs.com/api/pdf/book-finding-our-inner-voice/orders/'+m.orderId+'/gelato/print/v2/'+String(i+1).repeat(24)+'.pdf',bytes:pdfs[i].length})),expectedRequest:{productUid:'confirmed-square-product',shipmentMethodUid:'approved-standard-method',currency:'USD',shippingAddress:{country:'US',firstName:'Synthetic',lastName:'Fixture',addressLine1:'1 Local Fixture Way',city:'Fixture',postCode:'00000',state:'CA',email:'fixture@example.test'}},funding:{accountKeySha256:p.accountKeySha256,at:new Date(now).toISOString(),expiresAt:p.expiresAt,evidenceSha256:'f'.repeat(64),noCard:true,zeroWallets:true,noCredits:true,noInvoiceOrOtherRoute:true,providerMessagesSuppressed:true}});
 return {binding,credentials,rows,flows,pdfs:pdfs.map(p=>p.toString('base64'))};
}
export type ProtectedFixture=ReturnType<typeof protectedRunnerFixture>;
export function fixtureServices(f:ProtectedFixture){
 const {binding:b,credentials:c}=f,p=b.packet;
 const submissionId=randomUUID(),claimToken=randomUUID(),providerId='LOCAL-PROVIDER-'+randomUUID();
 const claim={provider:'gelato',dispatchRoute:'dispatch',rootOrderId:p.rootOrderId,routeKind:p.members.length===2?'sibling':'single',submissionId,claimToken,idempotencyKey:'w1.1:'+p.rootOrderId+':'+p.members.map(m=>m.orderDbId).join('-'),orderDbIds:p.members.map(m=>m.orderDbId),orders:p.members.map(m=>({orderDbId:m.orderDbId,orderId:m.orderId,provider:'gelato',rootOrderId:p.rootOrderId,bookId:'book-finding-our-inner-voice',formatId:m.edition,configVersion:2,innerPageCount:32,apiPageCount:32,expectedPdfPageCount:35}))};
 const state={claimed:false,assembled:false,created:false,closed:false,timer:false,registered:false,ticks:0,queueCalls:0,assemblyCalls:0,draftCalls:0,activateCalls:0,closeCalls:0,stopCalls:0,providerReads:0,metadataReads:0,messages:0,startedAt:0};
 const sentinels=Array.from({length:6},(_,i)=>({id:90001+i,status:'untouched',provider:'excluded-'+i}));
 const before=definitionSha256(sentinels),calls:Array<{method:string;path:string}>=[];
 let fault:((kind:string,result:Response)=>Promise<Response>|Response)|undefined;
 const response=(raw:unknown,status=200)=>{const body=JSON.stringify(raw);return new Response(body,{status,headers:{'content-type':'application/json','content-length':String(Buffer.byteLength(body))}});};
 const job=()=>({submission_id:submissionId,engineering_scope_id:p.scopeId,account_key_sha256:p.accountKeySha256,enabled:state.registered&&!state.closed,lease_token:null,lease_expires_at:null,attempt_count:state.ticks,last_success_at:state.ticks?new Date(Date.now()).toISOString():null,last_result:state.ticks?'success':null,last_error_class:null});
 const request=()=>({orderType:'draft',orderReferenceId:'lhb-gelato-'+submissionId,customerReferenceId:p.rootOrderId,currency:b.expectedRequest.currency,shipmentMethodUid:b.expectedRequest.shipmentMethodUid,shippingAddress:b.expectedRequest.shippingAddress,items:p.members.map((m,i)=>({itemReferenceId:'lhb-item-'+m.orderDbId,productUid:b.expectedRequest.productUid,pageCount:32,quantity:1,files:[{type:'default',url:b.artifacts[i].sourceUrl}]}))});
 const handle:typeof fetch=async(input,init)=>{
  const u=new URL(String(input)),method=init?.method??'GET',headers=new Headers(init?.headers);calls.push({method,path:u.pathname});
  assert.equal(init?.redirect,'manual');init?.signal?.throwIfAborted();
  let kind='',result:Response;
  if(u.hostname==='api.cloudflare.com'){
   assert.equal(method,'GET');assert.equal(u.pathname,'/client/v4/accounts/3daae940fcb6fc5b8bbd9bb8fcc62854/pages/projects/little-hero-labs-admin');assert.equal(headers.get('Authorization'),'Bearer '+c.cloudflare);state.metadataReads++;
   const env_vars={...Object.fromEntries(NORMAL_FLAGS.map(k=>[k,{value:'false',type:'plain_text'}])),GELATO_API_KEY:{value:c.gelato},GELATO_STATUS_API_KEY:{value:c.gelato}};
   result=response({success:true,result:{deployment_configs:{production:{env_vars}},canonical_deployment:{env_vars,deployment_trigger:{metadata:{commit_hash:p.sourceSha}}}}});kind='controls';
  }else if(u.hostname==='mdnthwpcnphjnnblbvxk.supabase.co'){
   assert.equal(method,'GET');assert.equal(headers.get('apikey'),c.database);const table=u.pathname.replace('/rest/v1/','');kind=table;
   const scoped=(key:string,value:string)=>assert.equal(u.searchParams.get(key),'eq.'+value);
   switch(table){
    case 'print_provider_dispatch_gates':scoped('provider','gelato');result=response([{enabled:false}]);break;
    case 'gelato_ordinary_release_gate':scoped('id','true');result=response([{id:true,enabled:false}]);break;
    case 'gelato_isolation_scopes':scoped('id',p.scopeId);result=response([{id:p.scopeId,root_order_id:p.rootOrderId,token_sha256:sha256(c.scope),account_key_sha256:p.accountKeySha256,fixture_manifest_sha256:p.fixtureManifestSha256,expires_at:p.expiresAt,closed_at:state.closed?new Date().toISOString():null,submission_id:state.claimed?submissionId:null,status_claims:state.ticks}]);break;
    case 'gelato_engineering_submission_windows':scoped('root_order_id',p.rootOrderId);result=response([{root_order_id:p.rootOrderId,child_order_ids:p.members.map(m=>m.orderDbId),account_key_sha256:p.accountKeySha256,fixture_manifest_sha256:p.fixtureManifestSha256,opened_at:p.startsAt,expires_at:p.expiresAt,closed_at:state.closed?new Date().toISOString():null}]);break;
    case 'orders':assert.equal(u.searchParams.get('id'),'in.('+p.members.map(m=>m.orderDbId).join(',')+')');result=response(f.rows);break;
    case 'print_provider_submission_items':scoped('submission_id',submissionId);assert(state.assembled);result=response(p.members.map((m,i)=>({submission_id:submissionId,item_reference_id:'lhb-item-'+m.orderDbId,child_order_id:m.orderDbId,child_order_key:m.orderId,artifact_key:b.artifacts[i].key,artifact_fingerprint:String(i+1).repeat(24),artifact_claim_token:claimToken,pdf_page_count:35,provider_order_id:state.created?providerId:null,provider_item_id:state.created?'ITEM'+i:null})));break;
    case 'print_provider_submissions':scoped('id',submissionId);result=response([{id:submissionId,root_order_id:p.rootOrderId,claim_token:claimToken,request_state:state.created?'submitted':'claimed',accepted_root_order_id:state.created?providerId:null,order_reference_id:'lhb-gelato-'+submissionId,request_snapshot:{request:request()}}]);break;
    case 'print_provider_submission_orders':scoped('submission_id',submissionId);result=response(state.created?[{provider_order_id:providerId,order_type:'draft'}]:[]);break;
    case 'print_provider_submission_notifications':scoped('submission_id',submissionId);assert.equal(u.searchParams.get('limit'),'1');result=response([]);break;
    case 'gelato_scheduled_status':scoped('submission_id',submissionId);result=response(state.registered?[job()]:[]);break;
    default:throw Error('Unapproved database table');
   }
  }else if(u.origin===b.n8nOrigin){
   if(u.pathname.startsWith('/webhook/')){
    assert.equal(method,'POST');assert.equal(headers.get('x-lhl-isolated-intake'),c.intake);assert(!state.closed);assert(Date.now()<Date.parse(p.expiresAt));
    const stage=u.pathname.split('-').at(-1);kind=String(stage);
    if(stage==='queue'){state.queueCalls++;assert(!state.claimed,'No duplicate queue');state.claimed=true;result=response(claim);}
    else if(stage==='assembly'){state.assemblyCalls++;assert(state.claimed&&!state.assembled);state.assembled=true;result=response({success:true});}
    else if(stage==='draft'){state.draftCalls++;assert(state.assembled&&!state.created,'No duplicate create');state.created=true;result=response({success:true});}
    else throw Error('Foreign workflow path');
   }else{
    assert.equal(headers.get('X-N8N-API-KEY'),c.n8n);const match=u.pathname.match(/^\/api\/v1\/workflows\/(OWNED[0-3])(\/(activate|deactivate))?$/);
    if(match){const stage=Object.keys(f.flows).find(k=>f.flows[k].id===match[1])!;const flow=f.flows[stage];
     if(match[3]){assert.equal(stage,'timer');assert.equal(method,'POST');if(match[3]==='activate'){assert(state.registered);state.activateCalls++;state.timer=true;state.startedAt=Date.now();kind='activate';}else{state.stopCalls++;state.timer=false;kind='deactivate';}}
     result=response({...flow,active:stage==='timer'?state.timer:true,activeVersionId:stage==='timer'&&!state.timer?null:flow.versionId});if(!kind)kind='workflow-'+stage;
    }else if(u.pathname==='/api/v1/executions'){
     assert.equal(method,'GET');assert.equal(u.searchParams.get('workflowId'),b.workflowBindings.timer.id);assert.equal(u.searchParams.get('includeData'),'false');assert.equal(u.searchParams.get('limit'),'10');assert(state.timer);state.ticks=1;
     result=response({data:[{id:'LOCAL-EXECUTION',workflowId:b.workflowBindings.timer.id,status:'success',mode:'trigger',startedAt:new Date(state.startedAt).toISOString(),stoppedAt:new Date(Date.now()+1).toISOString()}],nextCursor:null});kind='executions';
    }else throw Error('Unapproved n8n path');
   }
  }else if(u.origin==='https://admin.littleherolabs.com'&&u.pathname==='/api/internal/w4/submit-gelato-draft'){
   assert.equal(method,'GET');assert.equal(headers.get('Authorization'),'Bearer '+c.backend);const value={present:true,isString:true,isFalse:true,isTrue:false};result=response({contextAvailable:true,draftsEnabled:false,cloudflare:value,globalProcess:value,nodeProcess:value});kind='runtime-off';
  }else if(u.origin==='https://admin.littleherolabs.com'&&u.pathname==='/api/internal/w4/engineering-isolation'){
   assert.equal(method,'POST');assert.equal(headers.get('Authorization'),'Bearer '+c.backend);assert.equal(headers.get('x-lhl-engineering-token'),c.scope);
   const body=JSON.parse(String(init?.body));assert.equal(body.scopeId,p.scopeId);kind=body.action;
   if(body.action==='close'){state.closeCalls++;state.closed=true;result=response({closed:true,customerMessages:false});}
   else if(body.action==='register-status'){assert(state.created&&!state.closed);state.registered=true;result=response({registered:true,customerMessages:false});}
   else throw Error('No manual status tick or queue call is permitted');
  }else if(u.hostname==='order.gelatoapis.com'){
   assert.equal(method,'GET');assert.equal(u.pathname,'/v4/orders/'+providerId);assert.equal(headers.get('X-API-KEY'),c.gelato);assert(state.created&&!state.closed);state.providerReads++;
   result=response({id:providerId,...request(),financialStatus:'draft',fulfillmentStatus:'draft',updatedAt:new Date().toISOString(),connectedOrderIds:[],items:request().items.map((item,i)=>({...item,id:'ITEM'+i,fulfillmentStatus:'draft',files:[{type:'default',url:'https://gelato-api-live.s3.eu-west-1.amazonaws.com/LOCAL-FILE-'+i+'.pdf'}]}))});kind='provider';
  }else{
   assert.equal(method,'GET');assert.equal(headers.has('Authorization'),false);assert.equal(headers.has('X-API-KEY'),false);
   const artifact=b.artifacts.findIndex(a=>a.sourceUrl===u.href),stored=u.hostname==='gelato-api-live.s3.eu-west-1.amazonaws.com'?Number(u.pathname.match(/^\/LOCAL-FILE-(\d)\.pdf$/)?.[1]):-1;
   const index=artifact>=0?artifact:stored;assert(index>=0&&index<p.members.length,'No unapproved file download');const body=Buffer.from(f.pdfs[index],'base64');result=new Response(body,{headers:{'content-type':'application/pdf','content-length':String(body.length)}});kind=artifact>=0?'artifact':'provider-file';
  }
  assert.equal(definitionSha256(sentinels),before);return fault?fault(kind,result):result;
 };
 return {state,sentinels,calls,fetcher:handle,claim,request,binding:b,setFault:(v:typeof fault)=>{fault=v;},assertSentinels:()=>assert.equal(definitionSha256(sentinels),before)};
}
