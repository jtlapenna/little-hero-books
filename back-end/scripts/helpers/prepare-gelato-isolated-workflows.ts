/** Local file preparation only. No environment reads, network, installation or authority issuer. */
import {z} from 'zod';
import {definitionSha256,workflowDefinition} from './prepare-w1-native-queue';
const hash=z.string().regex(/^[a-f0-9]{64}$/),uuid=z.string().uuid();
export const IsolatedCasePacket=z.object({
 schema:z.literal('lhl.gelato-isolated-case@1'),runId:z.string().regex(/^[A-Za-z0-9-]{1,64}$/),
 scopeId:uuid,rootOrderId:z.string().regex(/^TEST-GELATO-[A-Za-z0-9-]{1,38}$/),
 sourceSha:z.string().regex(/^[a-f0-9]{40}$/),nativeDefinitionSha256:hash,fixtureManifestSha256:hash,accountKeySha256:hash,
 startsAt:z.string().datetime({offset:true}),expiresAt:z.string().datetime({offset:true}),
 members:z.array(z.object({orderDbId:z.number().int().positive().safe(),orderId:z.string().regex(/^TEST-GELATO-[A-Za-z0-9-]{1,60}$/),
  edition:z.enum(['standard','amazon']),pdfSha256:hash}).strict()).min(1).max(2),
}).strict().superRefine((p,c)=>{
 if(Date.parse(p.expiresAt)<=Date.parse(p.startsAt)||Date.parse(p.expiresAt)-Date.parse(p.startsAt)>30*60_000)c.addIssue({code:'custom',message:'Window must be positive and at most 30 minutes'});
 for(const key of ['orderDbId','orderId','pdfSha256'] as const)if(new Set(p.members.map(m=>m[key])).size!==p.members.length)c.addIssue({code:'custom',message:'Duplicate member binding'});
 if(p.members.length===2&&p.members.some(m=>m.edition!=='amazon'))c.addIssue({code:'custom',message:'Siblings require Amazon editions'});
 if(p.members.length===1&&p.members[0].orderId!==p.rootOrderId)c.addIssue({code:'custom',message:'Single identity must be its root'});
});
export type IsolatedCase=z.infer<typeof IsolatedCasePacket>;
export type PreparedWorkflow={name:string;nodes:Array<Record<string,unknown>&{name:string;type:string;parameters:Record<string,unknown>}>;connections:Record<string,{main:Array<Array<{node:string;type:string;index:number}>>}>;settings:Record<string,unknown>};
export const CREDENTIALS={intake:'__LHL_ISOLATED_INTAKE_HEADER_AUTH__',backend:'__LHL_BACKEND_HEADER_AUTH_CREDENTIAL_ID__',scope:'__LHL_SCOPE_MULTIPLE_HEADERS_AUTH__'} as const;
const api='https://admin.littleherolabs.com/api/internal/w4/engineering-isolation';
const cred=(type:string,id:string)=>({[type]:{id,name:'Bind reviewed managed credential before installation'}});
const node=(name:string,type:string,parameters:Record<string,unknown>,extra:Record<string,unknown>={})=>({name,type:'n8n-nodes-base.'+type,typeVersion:type==='httpRequest'?4.2:type==='code'?2:1,id:'isolated-'+name.toLowerCase().replace(/[^a-z0-9]+/g,'-'),position:[0,0],parameters,...extra});
const code=(name:string,jsCode:string)=>node(name,'code',{jsCode});
const http=(name:string,url:string,jsonBody:string,multiple=false)=>node(name,'httpRequest',{method:'POST',url,sendBody:true,specifyBody:'json',jsonBody,
 authentication:'genericCredentialType',genericAuthType:multiple?'httpMultipleHeadersAuth':'httpHeaderAuth',options:{timeout:120000,redirect:{redirect:{followRedirects:false}},response:{response:{responseFormat:'json',neverError:false}}}},
 {retryOnFail:false,continueOnFail:false,onError:'stopWorkflow',credentials:cred(multiple?'httpMultipleHeadersAuth':'httpHeaderAuth',multiple?CREDENTIALS.scope:CREDENTIALS.backend)});
function graph(name:string,nodes:PreparedWorkflow['nodes']):PreparedWorkflow{
 const connections:PreparedWorkflow['connections']={};nodes.forEach((n,i)=>{n.position=[i*280,0];connections[n.name]={main:[i+1<nodes.length?[{node:nodes[i+1].name,type:'main',index:0}]:[]]};});
 return {name,nodes,connections,settings:{executionOrder:'v1',callerPolicy:'workflowsFromSameOwner',availableInMCP:false,executionTimeout:240,saveDataErrorExecution:'none',saveDataSuccessExecution:'none',saveManualExecutions:false,saveExecutionProgress:false}};
}
const webhook=(path:string)=>node('Scoped Authenticated Intake','webhook',{httpMethod:'POST',path,responseMode:'responseNode',authentication:'headerAuth'}, {credentials:cred('httpHeaderAuth',CREDENTIALS.intake)});
const respond=()=>node('Return Terminal Result','respondToWebhook',{respondWith:'json',responseBody:'={{ JSON.stringify($json) }}',options:{responseCode:200}});
export const workflowPath=(p:IsolatedCase,stage:'queue'|'assembly'|'draft')=>'lhl-isolated-'+p.scopeId+'-'+stage;
function guard(p:IsolatedCase){return `const bound=${JSON.stringify(p)};\nif(Date.now()<Date.parse(bound.startsAt)||Date.now()>=Date.parse(bound.expiresAt))throw Error('Isolated window is not active');\n`;}
/** Exported code is exercised with actual queue responses in the disposable SQL suite. */
export function isolatedClaimGuard(p:IsolatedCase){return guard(p)+`
const raw=$input.first()?.json;const group=raw&&Object.prototype.hasOwnProperty.call(raw,'body')?raw.body:raw;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if(!group||group.provider!=='gelato'||group.dispatchRoute!=='dispatch'||group.rootOrderId!==bound.rootOrderId||group.routeKind!==(bound.members.length===2?'sibling':'single')||!uuid.test(group.submissionId)||!uuid.test(group.claimToken)||
 group.idempotencyKey!=='w1.1:'+bound.rootOrderId+':'+bound.members.map(m=>m.orderDbId).sort((a,b)=>a-b).join('-')||
 !Array.isArray(group.orderDbIds)||group.orderDbIds.length!==bound.members.length||new Set(group.orderDbIds).size!==bound.members.length||group.orderDbIds.some(id=>!bound.members.some(m=>m.orderDbId===id))||
 !Array.isArray(group.orders)||group.orders.length!==bound.members.length||new Set(group.orders.map(m=>m.orderDbId)).size!==bound.members.length||group.orders.some(row=>!bound.members.some(m=>m.orderDbId===row.orderDbId&&m.orderId===row.orderId&&m.edition===row.formatId)||row.provider!=='gelato'||row.rootOrderId!==bound.rootOrderId||row.bookId!=='book-finding-our-inner-voice'||row.configVersion!==2||row.innerPageCount!==32||row.apiPageCount!==32||row.expectedPdfPageCount!==35))throw Error('Isolated dispatch does not match the frozen cohort');
`;}
export function prepareIsolatedWorkflows(raw:unknown,nativeRaw:unknown){
 const p=IsolatedCasePacket.parse(raw),source=workflowDefinition(nativeRaw),wanted=p.members.length===2?'W4.1 Gelato Sibling Aggregation':'W4 Gelato Print Fulfillment';
 if(source.name!==wanted||definitionSha256(source)!==p.nativeDefinitionSha256)throw Error('Native source differs from reviewed definition');
 const named=(name:string)=>{const found=source.nodes.filter(n=>n.name===name);if(found.length!==1)throw Error('Native node identity differs');return structuredClone(found[0]);};
 const nativeHttp=['Assemble Gelato Print PDF','Quote Gelato Submission','Create Held Gelato Draft'];
 for(const name of nativeHttp){const n=named(name);if(n.type!=='n8n-nodes-base.httpRequest'||n.retryOnFail!==false||n.onError!=='stopWorkflow'||n.parameters.method!=='POST')throw Error('Native HTTP safety contract differs');}
 const wrap=(stage:'assembly'|'draft',names:string[])=>{
  const prep=named('Prepare Gelato Request');const original=String(prep.parameters.jsCode);
  const proof=stage==='draft'?`const proof=group.artifactVerification;if(!proof||proof.fixtureManifestSha256!==bound.fixtureManifestSha256||proof.scopeId!==bound.scopeId||!Array.isArray(proof.files)||proof.files.length!==bound.members.length||new Set(proof.files.map(f=>f.orderDbId)).size!==bound.members.length||proof.files.some(f=>!bound.members.some(m=>m.orderDbId===f.orderDbId&&m.pdfSha256===f.sha256)))throw Error('Independent frozen PDF verification is required');\n`:'';
  // Strip the proof before feeding the exact original native preparation code.
  prep.parameters.jsCode=isolatedClaimGuard(p)+proof+`const clean={submissionId:group.submissionId,claimToken:group.claimToken,bookId:'book-finding-our-inner-voice',configVersion:2,rootOrderId:bound.rootOrderId,...(bound.members.length===1?{orderId:bound.members[0].orderId,formatId:bound.members[0].edition}:{orders:bound.members.map(m=>({orderId:m.orderId,orderDbId:m.orderDbId,bookId:'book-finding-our-inner-voice',configVersion:2,formatId:m.edition}))})};return (function($input){\n`+original+`\n})({first:()=>({json:{body:clean}})});`;
  const nodes:PreparedWorkflow['nodes']=[webhook(workflowPath(p,stage)),prep,...names.map(named),respond()];
  for(const n of nodes)if(n.type==='n8n-nodes-base.httpRequest'){
   n.credentials=cred('httpHeaderAuth',CREDENTIALS.backend);n.parameters.options={...(n.parameters.options as object),timeout:120000};
  }
  return graph('TEST-GELATO '+p.runId+' '+stage,nodes);
 };
 const queue=graph('TEST-GELATO '+p.runId+' isolated queue',[
  webhook(workflowPath(p,'queue')),
  code('Require Empty Scoped Trigger',guard(p)+`const body=$input.first()?.json?.body;if(!body||Array.isArray(body)||Object.keys(body).length)throw Error('Queue accepts an empty body only');return [{json:{scopeId:bound.scopeId,action:'queue'}}];`),
  http('Claim Exact Isolated Queue',api,'={{ JSON.stringify($json) }}',true),
  code('Verify Exact Native Claim',`const result=$input.first()?.json;if(result?.success!==true||result.customerMessages!==false||!Array.isArray(result.groups)||result.groups.length!==1)throw Error('Queue acknowledgement is not a dispatch');\nconst $input={first:()=>({json:result.groups[0]})};\n`),respond()]);
 // The nested guard accepts only one real native claim. A replay/alreadyClaimed result cannot dispatch.
 queue.nodes[3].parameters.jsCode=`const result=$input.first()?.json;if(result?.success!==true||result.customerMessages!==false||!Array.isArray(result.groups)||result.groups.length!==1)throw Error('Queue acknowledgement is not a dispatch');return (function($input){\n`+isolatedClaimGuard(p)+`return [{json:group}];\n})({first:()=>({json:result.groups[0]})});`;
 const assembly=wrap('assembly',['Assemble Gelato Print PDF','Check Gelato Assembly']);
 const draft=wrap('draft',['Quote Gelato Submission','Check Gelato Quote','Create Held Gelato Draft','Check Gelato Draft']);
 const timer=graph('TEST-GELATO '+p.runId+' isolated status timer',[
  node('Scoped Minute Timer','scheduleTrigger',{rule:{interval:[{field:'minutes',minutesInterval:1}]}}),
  code('Stop Outside Scoped Window',`const bound=${JSON.stringify(p)};if(Date.now()<Date.parse(bound.startsAt)||Date.now()>=Date.parse(bound.expiresAt))return [];return [{json:{scopeId:bound.scopeId,action:'status'}}];`),
  http('Poll Exact Isolated Scope',api,'={{ JSON.stringify($json) }}',true),
  code('Require Quiet Status Result',`const r=$input.first()?.json;if(r?.customerMessages!==false||!Number.isSafeInteger(r.checked)||r.checked<0||r.checked>1)throw Error('Scoped polling result differs');return [{json:r}];`)]);
 const workflows={queue,assembly,draft,timer};
 return {schema:'lhl.gelato-isolated-workflows@1',canInstall:false,canExecute:false,packet:p,packetSha256:definitionSha256(p),
  workflows,workflowSha256:Object.fromEntries(Object.entries(workflows).map(([k,w])=>[k,definitionSha256(w)])),
  requiredCredentials:CREDENTIALS,limits:{queueClaims:1,draftCreates:1,statusLeases:3,windowMinutes:30},
  limitations:['Local definitions only; no hosted install, credential binding, scope or account funding attestation',
   'Diagnostic W4 is split at assembly for independent R2-byte verification; it does not establish ordinary W1/W0/W3 execution',
   'No early webhook ACK: terminal assembly/draft response is required; an uncertain result closes authority and must not be retried',
   'Separate approved protected adapter must verify runtime/account/workflow readbacks, private artifact bytes, exact provider result, timer and cleanup before any live window']};
}
