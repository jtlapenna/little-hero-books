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
  const objects=new Map<string,unknown>();let one:unknown;let ids=100,writes=0,providerCalls=0;
  globalThis.fetch=async(input,init)=>{
    const request=new Request(input,init),url=new URL(request.url);
    if(url.hostname.endsWith('.synthetic-handoff.r2.cloudflarestorage.com')){
      if(request.method==='HEAD')return new Response(null,{status:404});
      if(request.method==='GET')return url.pathname.endsWith('/1-manifest.json')?Response.json(one):objects.has(url.pathname)?Response.json(objects.get(url.pathname)):new Response(null,{status:404});
      assert.equal(request.method,'PUT');assert.equal(request.headers.get('If-None-Match'),'*');if(objects.has(url.pathname))return new Response(null,{status:412});objects.set(url.pathname,await request.json());return new Response(null,{status:200});
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
    return Response.json(request.headers.get('Accept')?.includes('object')?found??null:found?[found]:[]);
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
    const topNode=(name:string,input:unknown,extra:Record<string,unknown>={})=>vm.runInNewContext('(function(){'+top.nodes.find((n:{name:string})=>n.name===name).parameters.jsCode+'\n})()',{$json:input,$input:{first:()=>({json:input})},$execution:{id:'4242',customData:{}},$getWorkflowStaticData:()=>({}),$binary:{},Buffer,console:{log(){},warn(){},error(){}},...extra});
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
    const item=topNode('Expand to N Poses',work,{$execution:{id:'4242',customData:{orderContext:canonical.orderContext}}})[0].json;assert(item.workflowJobId);
    const poseInput={...item,body:structuredClone(canonical.body),workflowParentClaim:canonical.workflowParentClaim};
    const poseResponse=await pose(request('/api/internal/w2a/build-pose-input',wire(1,poseInput)));assert.equal(poseResponse.status,200,await poseResponse.clone().text());const generated=await poseResponse.json();assert.equal(generated.workflowJobId,item.workflowJobId);assert(generated.workflowAttemptId);
    // Use the actual QA producer and actual HTTP/repository retry consumer, retaining the persisted previous snapshot.
    const job=tables.workflow_jobs.find(j=>j.id===generated.workflowJobId)!;job.status='succeeded';job.result_snapshot={uploadKey:generated.uploadKey,generatedFileName:generated.generatedFileName};job.lease_owner=null;job.lease_expires_at=null;
    const attempt=tables.workflow_job_attempts.find(a=>a.id===generated.workflowAttemptId)!;attempt.status='succeeded';attempt.ended_at=new Date().toISOString();
    const qaNode=top.nodes.find((n:{name:string})=>n.name.includes('QA Handoff')).name;
    const rejected=topNode(qaNode,{...generated,qa:{combined:{pass:false}}},{global:{}}).json;
    const retryInput={...poseInput,retryAttempt:1,qaRetryProof:rejected.qaRetryProof,workflowJobId:generated.workflowJobId};
    assert.deepEqual(wire(1,retryInput).qaRetryProof,JSON.parse(JSON.stringify(rejected.qaRetryProof)));
    const retryResponse=await pose(request('/api/internal/w2a/build-pose-input',wire(1,retryInput)));assert.equal(retryResponse.status,200,await retryResponse.clone().text());assert.equal((await retryResponse.json()).workflowAttempt,2);
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
    assert.equal(providerCalls,0);
    log('Actual W0/bootstrap → exported SW0/SW1/W2B HTTP expressions → POST handlers: base, pose, QA retry, explicit background job, legacy envelopes and identity/claim conflicts passed; zero provider calls');
  }finally{globalThis.fetch=transport;console.log=log;console.error=errorLog;}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
