/** Actual quote/hold/submit service and endpoint with closed synthetic dependencies. SQL boundaries run separately. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import configFile from '../src/lib/books/configs/book-finding-our-inner-voice/v2.json';
import { GelatoPrintConfigSchema } from '../src/lib/books/types';
import { submitGelatoDraft, quoteGelatoSubmission, type GelatoSubmissionDependencies, type GelatoSubmissionIdentity } from '../src/lib/books/gelato-submission';
import { GelatoProviderOrderSchema } from '../src/lib/books/gelato-provider-snapshot';
import { createAdminWorkflowTestAdmission } from '../src/lib/admin-workflow-test';
import { workflowTestSubmissionActivated } from '../src/lib/books/gelato-workflow-test-activation';
import type { GelatoSubmissionContext } from '../src/lib/books/gelato-submission-store';
import type { W4GelatoPrintInput } from '../src/lib/books/w4-gelato-print-input';
process.env.BACKEND_API_TOKEN='synthetic-operator-service-signing-authority-at-least-32';
globalThis.fetch=async()=>{throw Error('All live transports forbidden');};
const config=GelatoPrintConfigSchema.parse(configFile.formats.amazon.print),actor='operator@example.test',key='synthetic-provider-account',account=createHash('sha256').update(key).digest('hex');
async function fixture(){
 let now=new Date(),sends=0,fileSha='b'.repeat(64);const calls:string[]=[];
 const identity:GelatoSubmissionIdentity={submissionId:'11111111-1111-4111-8111-111111111111',claimToken:'22222222-2222-4222-8222-222222222222',executionId:'w4-assembly',mode:'single'};
 const orderId='TEST-NEW-OPERATOR',prefix='book-finding-our-inner-voice/orders/'+orderId;
 const context:GelatoSubmissionContext={submission:{id:identity.submissionId,provider:'gelato',root_order_id:orderId,order_reference_id:'operator-order-reference',workflow_job_idempotency_key:'job',claim_token:identity.claimToken,lease_expires_at:new Date(now.getTime()+900000).toISOString(),request_state:'claimed',owning_execution_id:null,send_started_at:null,accepted_root_order_id:null,quote_snapshot:null,request_snapshot:null,quote_id:null,shipment_method_uid:null,shipment_policy_version:null,quoted_at:null,quote_request_fingerprint:null},members:[{submission_id:identity.submissionId,child_order_id:1,child_order_key:orderId,item_reference_id:'item-one',artifact_key:prefix+'/gelato/print/v2/'+ 'a'.repeat(24)+'.pdf',artifact_fingerprint:'a'.repeat(24),artifact_claim_token:identity.claimToken,pdf_page_count:35,provider_order_id:null,provider_item_id:null,status:null}],providerOrders:[]};
 const row:Record<string,unknown>={id:1,orderId,print_provider:'gelato',print_book_id:'book-finding-our-inner-voice',print_format_id:'amazon',print_config_version:2,print_submission_id:identity.submissionId,print_claim_token:identity.claimToken,quantity:1,customer_approval_required:true,customer_approval_status:'approved',review_stages:{postPdf:{status:'approved'}},product_info:{_overnight_test:true,_created_via_csv:true,_admin_workflow_test:{...createAdminWorkflowTestAdmission(actor,2),preparePrintRequestedAt:now.toISOString()}},customer_email:'test@example.test',shipping_address:{name:'Test Adult',address:'1 Test Lane',city:'Test City',state:'CA',zip:'00000',country:'US'}};
 let request:unknown;
 const d:GelatoSubmissionDependencies={store:{load:async()=>context,transition:async(name,p)=>{calls.push(name);const s=context.submission;
  if(name==='record_gelato_quote_snapshot')Object.assign(s,{quote_snapshot:p.p_snapshot,quote_id:p.p_quote_id,shipment_method_uid:p.p_shipment_method_uid,shipment_policy_version:p.p_policy_version,quoted_at:p.p_quoted_at,quote_request_fingerprint:p.p_request_fingerprint});
  else if(name==='hold_admin_workflow_test_print')Object.assign(s,{request_state:'operator_review',operator_review_packet:p.p_packet,operator_review_packet_sha256:p.p_packet_sha256,operator_reviewed_at:now.toISOString()});
  else if(name==='begin_gelato_print_submission')Object.assign(s,{request_state:'submitting',request_snapshot:s.quote_snapshot});
  else if(name==='authorize_gelato_print_send')Object.assign(s,{send_started_at:now.toISOString(),operator_approval_consumed_at:now.toISOString()});
  else if(name==='record_gelato_accepted_root')s.accepted_root_order_id=String(p.p_root_id);
  else if(name==='persist_gelato_draft_result')s.request_state='submitted';
  else if(name==='fence_gelato_print_submission')s.request_state='outcome_unknown';
  else throw Error('Unexpected transition '+name);return null;
 }},loadOrder:async()=>row,loadPrintInput:async()=>({orderId,orderDbId:1,orderPrefix:prefix,rootOrderId:orderId,bookConfigVersion:2,providerPrintConfig:config} as W4GelatoPrintInput),artifactExists:async()=>true,artifactSha256:async()=>fileSha,accountSha256:account,backendUrl:'https://admin.littleherolabs.com',draftsEnabled:false,now:()=>now,verifyStoredFile:async()=>true,
 quote:async q=>({orderReferenceId:q.orderReferenceId,quotes:[{id:'quote-one',itemReferenceIds:q.products.map(p=>p.itemReferenceId),products:q.products.map(p=>({...p,price:12.18,currency:'USD'})),shipmentMethods:[{shipmentMethodUid:'usps_ground_advantage',type:'normal',price:3.81,currency:'USD',numberOfParcels:1}]}]}),
 create:async q=>{sends++;request=q;return {...q,id:'provider-one',connectedOrderIds:[]};},get:async()=>GelatoProviderOrderSchema.parse({...request as object,id:'provider-one',orderType:'draft',fulfillmentStatus:'draft',updatedAt:now.toISOString(),connectedOrderIds:[],items:(request as {items:object[]}).items.map(item=>({...item,id:'provider-item-one',fulfillmentStatus:'created'}))})};
 await quoteGelatoSubmission(identity,d);
 return {d,context,row,identity,calls,sends:()=>sends,setFile:(sha:string)=>{fileSha=sha;},expire:()=>{now=new Date(now.getTime()+360000);},approve:()=>{const s=context.submission,packet=s.operator_review_packet as {executionId:string};Object.assign(s,{request_state:'claimed',operator_approval_actor:actor,operator_approval_expires_at:new Date(now.getTime()+300000).toISOString(),lease_expires_at:new Date(now.getTime()+300000).toISOString()});return {...identity,executionId:packet.executionId};}};
}
async function main(){
 const checks:string[]=[];
 for(const globalEnabled of [false,true]){const x=await fixture();x.d.draftsEnabled=globalEnabled;const r=await submitGelatoDraft(x.identity,x.d);assert.equal(r.outcome,'operator_review');assert.equal(x.sends(),0);assert.equal(x.context.submission.request_state,'operator_review');assert(!x.calls.includes('begin_gelato_print_submission'));assert.equal((await submitGelatoDraft(x.identity,x.d)).held,true);}checks.push('default workflow halts before provider create with global drafts OFF or ON');
 for(const corruption of ['file','account','actor','expiry','missing-approval']){const x=await fixture();await submitGelatoDraft(x.identity,x.d);const work=x.approve(),packet=x.context.submission.operator_review_packet_sha256!;x.d.workflowTestSend={actor,packetSha256:packet};if(corruption==='file')x.setFile('c'.repeat(64));if(corruption==='account')x.d.accountSha256='d'.repeat(64);if(corruption==='actor')x.d.workflowTestSend.actor='foreign@example.test';if(corruption==='expiry')x.expire();if(corruption==='missing-approval')x.context.submission.operator_approval_actor=null;await assert.rejects(()=>submitGelatoDraft(work,x.d));assert.equal(x.sends(),0);assert(!x.calls.includes('begin_gelato_print_submission'));}checks.push('file, account, actor, expiry and unrecorded authorization stop before send');
 const x=await fixture();await submitGelatoDraft(x.identity,x.d);const work=x.approve();x.d.workflowTestSend={actor,packetSha256:x.context.submission.operator_review_packet_sha256!};assert.equal((await submitGelatoDraft(work,x.d)).outcome,'draft');assert.equal(x.sends(),1);assert(x.context.submission.operator_approval_consumed_at);assert.equal((await submitGelatoDraft(work,x.d)).reused,true);assert.equal(x.sends(),1);checks.push('exact approved bytes travel through real quote/hold/submit producer once, with global draft flag OFF');
 const env={GELATO_WORKFLOW_TEST_SUBMISSION_ENABLED:'true',GELATO_WORKFLOW_TEST_SUBMISSION_ORDER_ID:'TEST-NEW-OPERATOR',GELATO_WORKFLOW_TEST_SUBMISSION_ACCOUNT_SHA256:account,GELATO_WORKFLOW_TEST_SUBMISSION_EXPIRES_AT:new Date(Date.now()+3600000).toISOString()};
 assert(workflowTestSubmissionActivated(env,'TEST-NEW-OPERATOR',account));for(const changed of [{GELATO_WORKFLOW_TEST_SUBMISSION_ENABLED:'false'},{GELATO_WORKFLOW_TEST_SUBMISSION_ORDER_ID:'other'},{GELATO_WORKFLOW_TEST_SUBMISSION_ACCOUNT_SHA256:'f'.repeat(64)},{GELATO_WORKFLOW_TEST_SUBMISSION_EXPIRES_AT:new Date(Date.now()-1000).toISOString()},{GELATO_WORKFLOW_TEST_SUBMISSION_EXPIRES_AT:new Date(Date.now()+25*3600000).toISOString()}])assert.equal(workflowTestSubmissionActivated({...env,...changed},'TEST-NEW-OPERATOR',account),false);checks.push('activation requires independently pinned exact order/account and bounded future expiry');
 console.log(JSON.stringify({passed:true,checks,liveRequests:0,providerCreates:'synthetic only'}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
