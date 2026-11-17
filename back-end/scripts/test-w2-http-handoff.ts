import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
// Isolated test tooling pins the live engine; it is not an application dependency.
const n8nTestRequire=createRequire(new URL('./fixtures/n8n-expression-runtime/package.json',import.meta.url));
const {Tournament,astVisit,astBuilders}=n8nTestRequire('@n8n/tournament');
assert.equal(n8nTestRequire('@n8n/tournament/package.json').version,'1.11.1');
const scopeVersion=(path:string)=>JSON.parse(readFileSync(resolve(dirname(path),'../package.json'),'utf8')).version;
assert.equal(scopeVersion(n8nTestRequire.resolve('ast-types')),'0.16.1');
assert.equal(scopeVersion(createRequire(n8nTestRequire.resolve('recast')).resolve('ast-types')),'0.16.1');
// Property-access compatibility subset of n8n's official PrototypeSanitizer.
// https://github.com/n8n-io/n8n/blob/7be94a11840668a8dee22a4c12b3c6a774f27f8a/packages/workflow/src/expression-sandboxing.ts
// This is a property-access subset, not the full n8n SDK sandbox.
const unsafeProperties=new Set(['__proto__','prototype','constructor','getPrototypeOf','setPrototypeOf','getOwnPropertyDescriptor','getOwnPropertyDescriptors','defineProperty','defineProperties','mainModule','binding','_linkedBinding','_load','prepareStackTrace','__lookupGetter__','__lookupSetter__','__defineGetter__','__defineSetter__','caller','callee','arguments','getBuiltinModule','dlopen','execve','loadEnvFile']);
const sanitizeProperty=(value:unknown)=>{const key=String(value);if(unsafeProperties.has(key))throw Error('Forbidden n8n property: '+key);return key;};
const propertyGuard=(ast:unknown,dataNode:unknown)=>astVisit(ast,{
  visitMemberExpression(this:{traverse:(path:unknown)=>void},path:{node:{computed:boolean;property:{type:string;name?:string;value?:unknown};object:unknown};replace:(node:unknown)=>void}){
    this.traverse(path);const node=path.node;
    if(!node.computed)sanitizeProperty(node.property.name);
    else if(['Literal','StringLiteral'].includes(node.property.type))sanitizeProperty(node.property.value);
    else path.replace(astBuilders.memberExpression(node.object,astBuilders.callExpression(astBuilders.memberExpression(dataNode,astBuilders.identifier('__sanitize')),[node.property]),true));
  }
});
const tournament=new Tournament((error:Error)=>{throw error;},undefined,undefined,{before:[],after:[propertyGuard]});
const expressionContext=(input:unknown)=>({$json:input,JSON,Object,Array,Number,Date,Error,decodeURIComponent,__sanitize:sanitizeProperty});
assert.equal(tournament.execute('{{ $json[$json.key] }}',expressionContext({key:'value',value:23})),23);
for(const expression of ['{{ Object.prototype }}',"{{ Object['constructor'] }}",'{{ $json[$json.key] }}'])assert.throws(()=>tournament.execute(expression,expressionContext({key:'prototype'})),/Forbidden n8n property/);

import {NextRequest} from 'next/server';

async function main() {
  Object.assign(process.env,{SUPABASE_URL:'https://handoff-db.example.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic-handoff-key',BACKEND_API_TOKEN:'synthetic-handoff-machine',CLOUDFLARE_ACCOUNT_ID:'synthetic-handoff',R2_ACCESS_KEY_ID:'synthetic-access',R2_SECRET_ACCESS_KEY:'synthetic-secret'});
  const transport=globalThis.fetch,log=console.log,errorLog=console.error;
  const tables:Record<string,Record<string,any>[]>={orders:[],workflow_jobs:[],workflow_job_attempts:[],workflow_job_events:[],book_configs:[]};
  const objects=new Map<string,unknown>(),executions=new Map<string,any>();let one:unknown;let ids=100,writes=0,providerCalls=0;
  globalThis.fetch=async(input,init)=>{
    const request=new Request(input,init),url=new URL(request.url);
    if(url.hostname==='n8n-handoff.example.test'){
      if(request.method==='POST'){assert(url.pathname.endsWith('/4242/retry'));assert.deepEqual(await request.json(),{loadWorkflow:true});return Response.json({id:'5252'});}
      if(url.pathname.endsWith('/executions'))return Response.json({data:[{id:'4242'}],nextCursor:null});
      const id=url.pathname.split('/').pop()!;assert(executions.has(id),'Unexpected execution lookup '+id);return Response.json(executions.get(id));
    }
    if(url.hostname.endsWith('.synthetic-handoff.r2.cloudflarestorage.com')){
      if(request.method==='HEAD')return new Response(null,{status:objects.has(url.pathname)?200:404});
      if(request.method==='GET')return url.pathname.endsWith('/1-manifest.json')?Response.json(one):objects.has(url.pathname)?(objects.get(url.pathname) instanceof Uint8Array ? new Response(Uint8Array.from(objects.get(url.pathname) as Uint8Array).buffer) : Response.json(objects.get(url.pathname))):new Response(null,{status:404});
      assert.equal(request.method,'PUT');if(!url.pathname.endsWith('/2a-manifest.json'))assert.equal(request.headers.get('If-None-Match'),'*');if(objects.has(url.pathname)&&request.headers.has('If-None-Match'))return new Response(null,{status:412});objects.set(url.pathname,await request.json());return new Response(null,{status:200});
    }
    if(url.hostname!=='handoff-db.example.test'){providerCalls++;throw Error('Nonfixture transport forbidden');}
    const table=url.pathname.split('/').pop()!,records=tables[table];assert(records,'Unexpected table '+table);
    const matches=(row:Record<string,any>)=>[...url.searchParams].every(([key,value])=>{
      if(['select','order','limit'].includes(key))return true;
      if(value.startsWith('eq.'))return String(row[key])===value.slice(3);
      if(value==='is.null')return row[key]==null;
      throw Error('Unexpected filter '+key+'='+value);
    });
    let found:Record<string,any>|undefined;
    if(request.method==='POST'){found={id:++ids,...await request.json()};records.push(found!);writes++;}
    else {found=records.find(matches);if(request.method==='PATCH'&&found){Object.assign(found,await request.json());found.updated_at=new Date().toISOString();writes++;}else assert.equal(request.method,'GET');}
    return Response.json(request.headers.get('Accept')?.includes('object')?found??null:request.method==='GET'?records.filter(matches):found?[found]:[]);
  };
  console.log=()=>{};console.error=()=>{};
  try{
    const [{loadBundledBookConfig},{buildW0RunManifestFromConfig},{POST:bootstrap},{POST:base},{POST:pose},{POST:bg},{POST:worklist},{attachWorkflowJobsToW2BWorkItems}]=await Promise.all([
      import('../src/lib/books/load-book-config'),import('../src/lib/books/build-run-manifest'),import('../src/app/api/internal/w2a/bootstrap-manifest/route'),import('../src/app/api/internal/w2a/build-base-input/route'),import('../src/app/api/internal/w2a/build-pose-input/route'),import('../src/app/api/internal/w2b/build-pose-input/route'),import('../src/app/api/internal/w2a/resolve-pose-worklist/route'),import('../src/lib/workflow-jobs/w2b-pose-jobs')]);
    const bookId='book-finding-our-inner-voice',orderId='SYNTHETIC-HTTP-HANDOFF',characterHash='synthetic-handoff-hash',oneUrl=`${bookId}/orders/${orderId}/manifests/1-manifest.json`;
    const config=loadBundledBookConfig({bookId,version:3}),specs={childName:'Fixture',age:2,pronouns:'he/him',animalGuide:'tiger',favoriteColor:'red',skinTone:'light',hairColor:'light-brown',hairStyle:'side-part'};
    one=buildW0RunManifestFromConfig(config,{orderId,platform:'amazon',formatId:'amazon',characterHash,input:{characterSpecs:specs,orderDetails:{quantity:1}}});
    const row={id:4,orderId,root_order_id:null,amazon_order_id:orderId,execution_status:'processing',current_workflow:'2A',started_at:'2026-11-16T05:00:00.000',updated_at:'2026-11-16T05:00:01.000Z',workflow_step:'order_intake',character_hash:characterHash,character_specs:specs,book_specs:{bookId,formatId:'amazon',configVersion:3},product_info:{quantity:1},print_book_id:bookId,print_format_id:'amazon',print_config_version:3,print_provider:'gelato',one_manifest_url:oneUrl,manifest_2a_url:null,manifest_2b_url:null,manifest_3_url:null,print_submission_id:null,print_claim_token:null,gelato_order_id:null};tables.orders.push(row);
    const files=['w2A-SW0-Base_Character_Generation.repo-centric.json','w2A-SW1-Pose_Generation.repo-centric.json','w2B-sw1-single-pose.repo-centric.json'];
    const nodeNames=['Fetch Repo W2A Base Input','Fetch Repo W2A Pose Input','Normalize Input'];
    const graphs=files.map(file=>JSON.parse(readFileSync('../docs/n8n-workflow-files/repo-centric/workflows/'+file,'utf8')));
    const top=JSON.parse(readFileSync('../docs/n8n-workflow-files/repo-centric/workflows/w2A-Orchestrator.repo-centric.json','utf8'));
    const topNode=(name:string,input:unknown,extra:Record<string,unknown>={})=>vm.runInNewContext('(function(){'+top.nodes.find((n:{name:string})=>n.name===name).parameters.jsCode+'\n})()',{$json:input,$itemIndex:0,$input:{first:()=>({json:input}),item:{pairedItem:{item:0}}},$execution:{id:'4242',customData:{}},$getWorkflowStaticData:()=>({}),global:{},$binary:{},Buffer,console:{log(){},warn(){},error(){}},...extra});
    const wire=(index:number,input:unknown)=>{
      const expression=graphs[index].nodes.find((n:{name:string})=>n.name===nodeNames[index]).parameters.body;
      return JSON.parse(tournament.execute(expression.slice(1),expressionContext(input)));
    };
    const request=(path:string,input:unknown)=>new NextRequest('https://admin.littleherolabs.com'+path,{method:'POST',headers:{Authorization:'Bearer synthetic-handoff-machine','Content-Type':'application/json'},body:JSON.stringify(input)});
    const normalized=topNode('Normalize Router Payload',{body:structuredClone(row)})[0].json;
    const captured=topNode('Capture Order Context',normalized)[0].json;
    const bootstrapBody=JSON.parse(topNode('Prepare Bootstrap 2A Manifest Body',captured)[0].json.requestBody);
    const bootResponse=await bootstrap(request('/api/internal/w2a/bootstrap-manifest',bootstrapBody));assert.equal(bootResponse.status,200,await bootResponse.clone().text());const boot=await bootResponse.json();
    const canonical=topNode('Set Environment Defaults (code)',boot,{$items:()=>[{json:boot}]}).json;
    assert(canonical.workflowParentClaim);assert(canonical.body);assert.equal(canonical.body.workflowParentClaim,undefined,'Actual raw router body has no newly captured parent claim');
    const baseResponse=await base(request('/api/internal/w2a/build-base-input',wire(0,canonical)));
    assert.equal(baseResponse.status,200,'Actual bootstrap → exported SW0 HTTP expression → POST: '+await baseResponse.clone().text());
    assert.equal((await baseResponse.json()).workflowParentClaim.executionId,'4242');
    const legacyBase=await base(request('/api/internal/w2a/build-base-input',wire(0,{headers:{synthetic:true},body:wire(0,canonical)})));assert.equal(legacyBase.status,200);
    // Historical orders have nullable raw assignments even after the parent resolves defaults.
    const configuredOne=one;
    const legacyBookId='book-mvp-simple-adventure',legacyOrderId='SYNTHETIC-LEGACY-HANDOFF';
    const legacyConfig=loadBundledBookConfig({bookId:legacyBookId,version:1});
    const legacyOneUrl=`${legacyBookId}/orders/${legacyOrderId}/manifests/1-manifest.json`;
    one=buildW0RunManifestFromConfig(legacyConfig,{orderId:legacyOrderId,platform:'amazon',formatId:'amazon',characterHash,input:{characterSpecs:specs,orderDetails:{quantity:1}}});
    const legacyRow={...row,id:5,orderId:legacyOrderId,root_order_id:null,amazon_order_id:legacyOrderId,book_specs:{bookId:legacyBookId,formatId:'amazon',configVersion:1},print_book_id:null,print_format_id:null,print_config_version:null,character_hash:null,product_info:{quantity:1},one_manifest_url:legacyOneUrl};
    tables.orders.push(legacyRow);
    const legacyNormalized=topNode('Normalize Router Payload',{body:structuredClone(legacyRow)})[0].json;
    const legacyCaptured=topNode('Capture Order Context',legacyNormalized)[0].json;
    const legacyBootstrapBody=JSON.parse(topNode('Prepare Bootstrap 2A Manifest Body',legacyCaptured)[0].json.requestBody);
    const legacyBootResponse=await bootstrap(request('/api/internal/w2a/bootstrap-manifest',legacyBootstrapBody));assert.equal(legacyBootResponse.status,200,await legacyBootResponse.clone().text());const legacyBoot=await legacyBootResponse.json();
    const legacyTop=topNode('Set Environment Defaults (code)',legacyBoot,{$items:()=>[{json:legacyBoot}]}).json;
    const historicalResponse=await base(request('/api/internal/w2a/build-base-input',wire(0,legacyTop)));
    assert.equal(historicalResponse.status,200,'Resolved historical defaults with nullable raw aliases: '+await historicalResponse.clone().text());
    assert.equal((await historicalResponse.json()).bookId,legacyBookId);
    one=configuredOne;

    const workBody=JSON.parse(topNode('Prepare Resolve Pose Worklist Body',canonical)[0].json.requestBody);
    const workResponse=await worklist(request('/api/internal/w2a/resolve-pose-worklist',workBody));assert.equal(workResponse.status,200,await workResponse.clone().text());const work=await workResponse.json();
    const item=topNode('Expand to N Poses',work,{$execution:{id:'4242',customData:{orderContext:canonical.orderContext}}}).find((entry:any)=>entry.json.poseNumber===8).json;assert(item.workflowJobId);
    const poseInput={...item,body:structuredClone(canonical.body),workflowParentClaim:canonical.workflowParentClaim};
    const poseResponse=await pose(request('/api/internal/w2a/build-pose-input',wire(1,poseInput)));assert.equal(poseResponse.status,200,await poseResponse.clone().text());const generated=await poseResponse.json();assert.equal(generated.workflowJobId,item.workflowJobId);assert(generated.workflowAttemptId);
    const preparePose=graphs[1].nodes.find((n:any)=>n.name==='TESTING - Prepare Gemini (POSE)').parameters.jsCode;
    const binary={base:{mimeType:'image/png'},pose:{mimeType:'image/png'},hair:{mimeType:'image/jpeg'},skin:{mimeType:'image/png'}};
    const prepared=await vm.runInNewContext('(async function(){'+preparePose+'\n}).call({helpers})',{
      $json:generated,$binary:binary,$itemIndex:0,$input:{item:{}},Buffer,console:{log(){}},helpers:{getBinaryDataBuffer:async()=>Buffer.from('synthetic-image')},
    });
    assert.equal(prepared.json.requestBody.contents[0].parts.filter((p:any)=>p.inlineData||p.inline_data).length,2,'Pose transfer must use exactly BASE and POSE images, ignoring stale auxiliary binaries');
    assert.doesNotMatch(JSON.stringify(prepared.json.requestBody),/HAIR CHIP|silhouette override/);
    const qaGraph=JSON.parse(readFileSync('../docs/n8n-workflow-files/finals/w2A-SW2-Pose_and_Style_QA.json','utf8'));
    const runQaNode=(name:string,input:any,trigger:any,graph=qaGraph)=>{
      const node=graph.nodes.find((n:any)=>n.name===name);
      const context={...expressionContext(input),$binary:{generated:{mimeType:'image/png',fileName:input.generatedFileName}},$itemIndex:0,$input:{item:{pairedItem:{item:0}}},$:()=>({first:()=>({json:trigger})}),Buffer,console:{log(){},warn(){}}};
      if(node.type==='n8n-nodes-base.code')return vm.runInNewContext('(function(){'+node.parameters.jsCode+'\n})()',context).json;
      const out:any=node.parameters.includeOtherFields?{...input}:{};
      for(const field of node.parameters.assignments.assignments){
        let value=typeof field.value==='string'&&field.value.startsWith('=')?tournament.execute(field.value.slice(1),context):field.value;
        if(value!=null){if(field.type==='string')value=String(value);if(field.type==='number')value=Number(value);}
        const keys=node.parameters.options?.dotNotation===false?[field.name]:field.name.split('.');let target=out;
        for(const key of keys.slice(0,-1))target=target[key]??={};target[keys.at(-1)!]=value;
      }
      return out;
    };
    const qaReturn=(generatedOutput:any)=>{
      const generatedEnvelope={...generatedOutput,generatedImage:{mimeType:'image/png',size:100}};
      const trigger=runQaNode('Return Generated Image',generatedEnvelope,generatedEnvelope,graphs[1]);
      assert.equal(typeof trigger.retryAttempt,'number');assert.equal(typeof trigger.poseNumber,'number');
      const verdict=runQaNode('Combine QA Verdicts',{...trigger,qaPass:false,qaScore:0.3,qaThreshold:0.75},trigger);
      const side=runQaNode('Set (Return Envelope)',trigger,trigger);
      let merged={...verdict,...side};
      if(qaGraph.nodes.some((n:any)=>n.name==='Restore QA Order Identity'))merged=runQaNode('Restore QA Order Identity',merged,trigger);
      return runQaNode('Return QA Results',merged,trigger);
    };
    const identityHelper=qaGraph.nodes.find((n:any)=>n.name==='Restore QA Order Identity').parameters.jsCode;
    const helperSource=readFileSync('scripts/helpers/restore-w2a-qa-identity.js','utf8').split('module.exports = ',2)[1].trim().replace(/;$/, '');
    assert(identityHelper.includes(helperSource));
    for(const foreign of [{orderId:'OTHER'},{rootOrderId:'OTHER'},{amazonOrderId:'OTHER'},{orderContext:{orderId:'OTHER'}}])assert.throws(()=>runQaNode('Restore QA Order Identity',foreign,generated),/Conflicting QA order identity/);
    for(const invalid of [-1,4,1.2,'1',null])assert.throws(()=>runQaNode('Restore QA Order Identity',{}, {...generated,retryAttempt:invalid}),/Invalid QA trigger retry attempt/);
    let current=generated;
    // Real SW2 return is deliberately lossy upstream. Repeated rejections must retain the exact attempt.
    for(let retry=1;retry<=4;retry++){
      const job=tables.workflow_jobs.find(j=>j.id===current.workflowJobId)!;job.status='succeeded';job.result_snapshot={uploadKey:current.uploadKey,generatedFileName:current.generatedFileName};job.lease_owner=null;job.lease_expires_at=null;
      const attempt=tables.workflow_job_attempts.find(a=>a.id===current.workflowAttemptId)!;attempt.status='succeeded';attempt.ended_at=new Date().toISOString();
      const returned=qaReturn(current);
      assert.equal(returned.orderId,orderId,'Actual SW2 must restore the current trigger order identity');
      assert.equal(returned.retryAttempt,retry-1,'Actual SW2 must preserve canonical retryAttempt');
      const qaNode=top.nodes.find((n:{name:string})=>n.name.includes('QA Handoff')).name;
      const rejected=topNode(qaNode,returned,{global:{}}).json;
      const bumped=topNode('Bump retry counter',rejected).json;
      assert.equal(bumped.retryAttempt,retry);assert.equal(bumped.shouldRetry,retry<=3);
      const built=topNode('Retry Builder (Prompt Tweaks)',bumped).json;
      const returnNode=top.nodes.find((n:any)=>n.name==='Return Retry Context');
      const retryContext={...built};
      for(const field of returnNode.parameters.assignments.assignments){
        const value=typeof field.value==='string'&&field.value.startsWith('=')?tournament.execute(field.value.slice(1),{...expressionContext(built),$binary:{}}):field.value;
        if(!field.name.includes('.'))retryContext[field.name]=value;
      }
      const response=await pose(request('/api/internal/w2a/build-pose-input',wire(1,retryContext)));
      if(retry===4){assert.notEqual(response.status,200,'Exhausted retries cannot reserve another attempt');break;}
      assert.equal(response.status,200,'Actual repeated QA return → retry → exported expression → POST: '+await response.clone().text());
      current=await response.json();assert.equal(current.workflowAttempt,retry+1);
    }
    const bgSource={orderId,rootOrderId:generated.rootOrderId,amazonOrderId:generated.amazonOrderId,bookId,characterHash,poseNumber:generated.poseNumber,approvedKey:generated.uploadKey,manifest2aUrl:`${bookId}/orders/${orderId}/manifests/2a-manifest.json`,backendUrl:'https://admin.littleherolabs.com'};
    const [bgItem]=await attachWorkflowJobsToW2BWorkItems({orderId,rootOrderId:generated.rootOrderId,amazonOrderId:generated.amazonOrderId,bookId,workItems:[bgSource]});
    const bgResponse=await bg(request('/api/internal/w2b/build-pose-input',wire(2,{...bgItem,body:structuredClone(canonical.body)})));assert.equal(bgResponse.status,200,await bgResponse.clone().text());assert.equal((await bgResponse.json()).workflowJobId,bgItem.workflowJobId);
    const source=readFileSync('scripts/helpers/select-workflow-http-envelope.js','utf8').split('module.exports = ',2)[1].trim().replace(/;$/, '');
    for(let index=0;index<3;index++)assert.equal(graphs[index].nodes.find((n:{name:string})=>n.name===nodeNames[index]).parameters.body,'={{JSON.stringify(('+source+')($json))}}','Exported selector must match its standalone source');
    // Conflicts stop at the actual serialization boundary, rather than silently selecting a different identity.
    for(let index=0;index<3;index++){
      const seed={id:4,orderId,rootOrderId:orderId,amazonOrderId:orderId,bookId,formatId:'amazon',configVersion:3,characterHash,oneManifestUrl:oneUrl,poseNumber:0,approvedKey:generated.uploadKey,workflowParentClaim:canonical.workflowParentClaim,workflowJobId:10,workflowAttemptId:11,workflowJobIdempotencyKey:'synthetic-key',qaRetryProof:{schema:'synthetic-proof'},renderSnapshot:{bookId,configVersion:3}};
      for(const patch of [{id:99},{orderId:'OTHER'},{rootOrderId:'FOREIGN-ROOT'},{bookId:'book-other'},{formatId:'standard'},{configVersion:2},{characterHash:'other'},{oneManifestUrl:`${bookId}/orders/OTHER/manifests/1-manifest.json`},{poseNumber:1},{workflowJobId:99},{workflowAttemptId:99},{workflowJobIdempotencyKey:'foreign'},{approvedKey:'foreign.png'},{qaRetryProof:{schema:'foreign'}},{workflowParentClaim:{...canonical.workflowParentClaim,executionId:'999'}}]){
        assert.throws(()=>wire(index,{...seed,body:{...seed,...patch}}),/Conflicting workflow envelope/);
      }
      assert.deepEqual(wire(index,{...seed,body:{root_order_id:null,amazon_order_id:orderId,print_book_id:null,print_format_id:'',print_config_version:undefined,character_hash:null}}),seed);
      assert.throws(()=>wire(index,{...seed,orderId:null,body:seed}),/Conflicting workflow envelope/);
      assert.throws(()=>wire(index,{body:[]}),/Legacy workflow body/);
      assert.deepEqual(wire(index,{body:seed}),seed);
      assert.deepEqual(wire(index,Object.assign(Object.create(null),seed)),seed);
      assert.deepEqual(wire(index,{...seed,hasOwnProperty:false}),{...seed,hasOwnProperty:false});
      assert.deepEqual(wire(index,{...seed,body:{...seed,oneManifestUrl:'https://admin.littleherolabs.com/api/manifests/'+oneUrl,workflowParentClaim:{...canonical.workflowParentClaim,startedAt:'2026-11-16T05:00:00.000000Z'}}}),seed);
      assert.throws(()=>wire(index,{...seed,body:{...seed,workflowParentClaim:{...canonical.workflowParentClaim,startedAt:'2026-11-16T05:00:00.000001Z'}}}),/Conflicting workflow envelope/);
      assert.throws(()=>wire(index,{workflowParentClaim:undefined,body:seed}),/Conflicting workflow envelope/,'Malformed canonical declaration must not fall back');
      const before=writes;
      const invalid=wire(index,{...seed,workflowParentClaim:null,body:{orderId}});
      if(index<2){const response=await (index===0?base:pose)(request('/api/internal/w2a/'+(index===0?'build-base-input':'build-pose-input'),invalid));assert.notEqual(response.status,200);assert.equal(writes,before);}
    }
    const before=writes;
    const stale={...canonical,workflowParentClaim:{...canonical.workflowParentClaim,startedAt:'2026-11-16T04:00:00Z'},orderContext:{...canonical.orderContext,workflowParentClaim:{...canonical.workflowParentClaim,startedAt:'2026-11-16T04:00:00Z'}}};
    assert.notEqual((await base(request('/api/internal/w2a/build-base-input',wire(0,stale)))).status,200);assert.equal(writes,before);
    assert.notEqual((await bg(request('/api/internal/w2b/build-pose-input',wire(2,{...bgItem,workflowJobId:999,body:{orderId}})))).status,200);assert.equal(writes,before);
    // Resume producer: real bootstrap/worklist/pose jobs, saved native loop, admission, retry and completion.
    Object.assign(process.env,{N8N_API_URL:'https://n8n-handoff.example.test',N8N_API_KEY:'synthetic-n8n-key'});
    const {prepareNativeW2ARetry,dispatchNativeW2ARetry,mapNativeRetryFailure,NATIVE_RETRY_KEY}=await import('../src/lib/w2a-native-retry');
    const {buildW2AFailure}=await import('../src/lib/w2a-execution-failure');
    const nativeId='SYNTHETIC-NATIVE-RETRY',nativeOne=`${bookId}/orders/${nativeId}/manifests/1-manifest.json`;
    one=buildW0RunManifestFromConfig(config,{orderId:nativeId,platform:'amazon',formatId:'amazon',characterHash,input:{characterSpecs:specs,orderDetails:{quantity:1}}});
    const nativeRow:any={...structuredClone(row),id:6,orderId:nativeId,amazon_order_id:nativeId,product_info:{quantity:1},one_manifest_url:nativeOne};tables.orders.push(nativeRow);
    const nativeRaw=structuredClone(nativeRow);
    const cap=topNode('Capture Order Context',topNode('Normalize Router Payload',{body:nativeRaw})[0].json)[0].json;
    const bootRes=await bootstrap(request('/api/internal/w2a/bootstrap-manifest',JSON.parse(topNode('Prepare Bootstrap 2A Manifest Body',cap)[0].json.requestBody)));assert.equal(bootRes.status,200,await bootRes.clone().text());
    const nativeBoot=await bootRes.json(),nativeTop=topNode('Set Environment Defaults (code)',nativeBoot,{$items:()=>[{json:nativeBoot}]}).json;
    const nativeWorkRes=await worklist(request('/api/internal/w2a/resolve-pose-worklist',JSON.parse(topNode('Prepare Resolve Pose Worklist Body',nativeTop)[0].json.requestBody)));assert.equal(nativeWorkRes.status,200,await nativeWorkRes.clone().text());
    const nativeItems=topNode('Expand to N Poses',await nativeWorkRes.json(),{$execution:{id:'4242',customData:{orderContext:nativeTop.orderContext}}}).map((i:any)=>i.json);
    const published:any[]=[],acceptedInputs:any[]=[];let rejectedSource:any;
    const sw3=JSON.parse(readFileSync('../docs/n8n-workflow-files/finals/w2A-SW3-Upload.json','utf8'));
    const uploadReturn=sw3.nodes.find((n:any)=>n.name==='Return Upload Results').parameters.jsCode;
    const publishedAck=(input:any)=>vm.runInNewContext('(function(){'+uploadReturn+'\n})()',{$json:input,$input:{first:()=>({json:input})},$binary:{},console:{log(){},warn(){}}}).json;
    for(let n=0;n<=9;n++){
      const response=await pose(request('/api/internal/w2a/build-pose-input',wire(1,nativeItems.find((i:any)=>i.poseNumber===n))));assert.equal(response.status,200,await response.clone().text());
      const output=await response.json(),job=tables.workflow_jobs.find(j=>j.id===output.workflowJobId)!,attempt=tables.workflow_job_attempts.find(a=>a.id===output.workflowAttemptId)!;
      Object.assign(job,{status:'succeeded',result_snapshot:{uploadKey:output.uploadKey,generatedFileName:output.generatedFileName},lease_owner:null,lease_expires_at:null});Object.assign(attempt,{status:'succeeded',ended_at:'2026-11-16T05:04:00.000Z'});
      if(n<9){const accepted={...output,success:true,qaPass:true,qa:{combined:{pass:true}}};acceptedInputs.push(accepted);const ack=publishedAck(accepted);published.push(ack);objects.set('/'+output.uploadKey,new Uint8Array([n+1,2,3]));}
      else {
        const returned=qaReturn(output),handoff=topNode(top.nodes.find((n:any)=>n.name.includes('QA Handoff')).name,returned,{global:{}}).json;
        const bumped=topNode('Bump retry counter',handoff).json;rejectedSource=topNode('Retry Builder (Prompt Tweaks)',bumped).json;
        delete rejectedSource.orderId;delete rejectedSource.rootOrderId;rejectedSource.amazonOrderId='';rejectedSource.orderContext={};
      }
    }
    objects.set('/'+acceptedInputs[0].baseCharacterKey,new Uint8Array([10,20,30]));
    const claim=structuredClone(nativeTop.workflowParentClaim),root:any={id:'4242',workflowId:'HduzTWm0ekmrvwrn',status:'error',startedAt:'2026-11-16T05:00:00.000Z',stoppedAt:'2026-11-16T05:05:00.000Z',data:{executionData:{nodeExecutionStack:[{node:{name:'Execute SW1 - Pose Generation'},data:{main:[[{json:rejectedSource}]]}}]},resultData:{error:{message:'Synthetic failed QA handoff'},lastNodeExecuted:'Execute SW1 - Pose Generation',runData:{'Webhook (Router)':[{data:{main:[[{json:{body:nativeRaw}}]]}}],'SW3 - Upload':published.map(json=>({data:{main:[[{json}]]}})),'IF: QA Combined Pass?':acceptedInputs.map(json=>({data:{main:[[{json}]]}}))}}}};
    const failure=buildW2AFailure(root);Object.assign(nativeRow,{execution_status:'error_requires_manual_review',current_workflow:null,started_at:null,error_type:failure.code,error_message:failure.message,last_error_at:failure.failedAt,product_info:{...nativeRow.product_info,_w2a_failure:failure}});executions.set('4242',root);
    const retainedJobs=structuredClone(tables.workflow_jobs.filter(j=>j.order_id===nativeId&&Number(j.logical_key.slice(-2))<9)),retainedImages=new Map([...objects].filter(([key])=>published.some(i=>'/'+i.uploadKey===key)));
    const missing=tables.workflow_jobs.findIndex(j=>j.order_id===nativeId&&j.logical_key==='pose-12'),removed=tables.workflow_jobs.splice(missing,1)[0];
    await assert.rejects(()=>prepareNativeW2ARetry({orderId:nativeId,executionId:'4242',updatedAt:nativeRow.updated_at},'fixture-admin'),/complete frozen pose worklist/);tables.workflow_jobs.push(removed);
    const preparedNative=await prepareNativeW2ARetry({orderId:nativeId,executionId:'4242',updatedAt:nativeRow.updated_at},'fixture-admin');assert(preparedNative.prepared);assert.equal(nativeRow.execution_status,'error_requires_manual_review');
    const runtime={...root,id:'5252',status:'running',retryOf:'4242',startedAt:'2026-11-16T06:00:00.000Z'};executions.set('5252',runtime);
    const mapper=top.nodes.find((n:any)=>n.name==='Execute SW1 - Pose Generation').parameters.workflowInputs.value;
    const resumeBody=tournament.execute(mapper.slice(1),{...expressionContext(rejectedSource),$execution:{id:'5252'}});
    assert.equal(resumeBody.workflowNativeParentExecutionId,'5252');
    assert.equal((await pose(request('/api/internal/w2a/build-pose-input',wire(1,resumeBody)))).status,409,'Prepared admission alone never starts generation');
    const imageKey='/'+published[0].uploadKey,originalBytes=objects.get(imageKey);objects.set(imageKey,new Uint8Array([99]));
    await assert.rejects(()=>dispatchNativeW2ARetry({orderId:nativeId,executionId:'4242',updatedAt:nativeRow.updated_at},'fixture-admin'),/Retained image changed/);objects.set(imageKey,originalBytes);assert.equal(nativeRow.product_info[NATIVE_RETRY_KEY].phase,'prepared');
    await dispatchNativeW2ARetry({orderId:nativeId,executionId:'4242',updatedAt:nativeRow.updated_at},'fixture-admin');
    await assert.rejects(()=>dispatchNativeW2ARetry({orderId:nativeId,executionId:'4242',updatedAt:nativeRow.updated_at},'fixture-admin'),/fresh prepared/,'Dispatch is consumed before retry POST');
    await assert.rejects(()=>prepareNativeW2ARetry({orderId:nativeId,executionId:'4242',updatedAt:nativeRow.updated_at},'fixture-admin'),/already consumed/,'Preparation cannot re-arm an uncertain dispatch');
    for(const patch of [{workflowNativeParentExecutionId:'999'},{orderId:'FOREIGN'},{poseNumber:8},{retryAttempt:2}]){
      const before=structuredClone(nativeRow);const response=await pose(request('/api/internal/w2a/build-pose-input',wire(1,{...resumeBody,...patch})));assert.equal(response.status,409);assert.deepEqual(nativeRow,before,'Invalid native request must not adopt the physical order');
    }
    for(let n=9;n<=12;n++){
      const body=n===9?resumeBody:tournament.execute(mapper.slice(1),{...expressionContext(nativeItems.find((i:any)=>i.poseNumber===n)),$execution:{id:'5252'}});
      const response=await pose(request('/api/internal/w2a/build-pose-input',wire(1,body)));assert.equal(response.status,200,'Native continuation pose'+n+': '+await response.clone().text());
      const output=await response.json();assert.equal(output.workflowParentClaim.executionId,'5252');assert.equal(output.workflowAttempt,n===9?2:1);
      published.push(publishedAck({...output,success:true,uploadKey:output.uploadKey.replace(/_r\d+(?=\.)/,''),qaPass:true,qa:{combined:{pass:true}}}));
    }
    assert.deepEqual(tables.workflow_jobs.filter(j=>j.order_id===nativeId&&Number(j.logical_key.slice(-2))<9),retainedJobs);
    for(const [key,bytes]of retainedImages)assert.deepEqual(objects.get(key),bytes);
    const mappedFailure=mapNativeRetryFailure(nativeRow,{...root,id:'5252',retryOf:'4242'},{...failure,executionId:'5252'});assert.equal(mappedFailure.claimStartedAt,nativeRow.started_at);
    assert.equal(mapNativeRetryFailure(nativeRow,{...root,id:'5252',retryOf:'FOREIGN'},{...failure,executionId:'5252'}).claimStartedAt,failure.claimStartedAt);
    const manifestItems=topNode('Write Run Manifest1',published[0],{$input:{all:()=>published.map(json=>({json}))},$execution:{id:'5252',customData:{orderContext:nativeTop.orderContext}}});
    const manifestBody=JSON.parse(topNode('Prepare Build 2A Manifest Body',manifestItems[0].json)[0].json.requestBody);
    const {POST:manifestPost}=await import('../src/app/api/internal/w2a/build-run-manifest/route');
    const manifestRes=await manifestPost(request('/api/internal/w2a/build-run-manifest',manifestBody));assert.equal(manifestRes.status,200,await manifestRes.clone().text());const manifestOut=await manifestRes.json();assert.equal(manifestOut.manifest.entries.length,13);
    const completion=JSON.parse(topNode('Prepare 2A Completion Upsert Body',manifestOut,{$execution:{id:'5252',customData:{orderContext:nativeTop.orderContext}}})[0].json.requestBody);
    assert.equal(completion.workflowNativeParentExecutionId,'5252');assert.equal(completion.workflowParentClaim.executionId,'4242','Saved context is old; only verified lineage can map it');
    const {POST:completePost}=await import('../src/app/api/webhooks/workflow-2a-complete/route');
    const completeResponse=await completePost(request('/api/webhooks/workflow-2a-complete',completion));assert.equal(completeResponse.status,200,await completeResponse.clone().text());assert.equal(nativeRow.execution_status,'done');
    assert.equal(nativeRow.product_info[NATIVE_RETRY_KEY].currentClaim.executionId,'5252');
    assert.equal(providerCalls,0);
    log('Actual W0/bootstrap → pose8 two-image request → SW1 return/SW2/repeated QA retry/exhaustion → POST passed; native preparation/dispatch CAS → retained0–8/resumed9–12 → 13-pose manifest/completion passed, zero provider calls');
  }finally{globalThis.fetch=transport;console.log=log;console.error=errorLog;}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
