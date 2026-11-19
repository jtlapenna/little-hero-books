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
import {managedAdminFixture} from './helpers/managed-admin-fixture';

async function main() {
  Object.assign(process.env,{SUPABASE_URL:'https://handoff-db.example.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic-handoff-key',BACKEND_API_TOKEN:'synthetic-handoff-machine',CLOUDFLARE_ACCOUNT_ID:'synthetic-handoff',R2_ACCESS_KEY_ID:'synthetic-access',R2_SECRET_ACCESS_KEY:'synthetic-secret'});
  Object.assign(process.env,{ADMIN_SITE_ORIGIN:'https://admin.littleherolabs.com',ADMIN_ALLOWED_EMAILS:'operator@example.test'});
  const managed=await managedAdminFixture(['operator@example.test']);
  const transport=globalThis.fetch,log=console.log,errorLog=console.error;
  const tables:Record<string,Record<string,any>[]>={orders:[],workflow_jobs:[],workflow_job_attempts:[],workflow_job_events:[],book_configs:[],preview_tokens:[]};
  // JSONB object ordering is not JavaScript insertion ordering. Exercise the storage boundary.
  const jsonb=(value:unknown):unknown=>Array.isArray(value)?value.map(jsonb):value!==null&&typeof value==='object'
    ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>Buffer.byteLength(a)-Buffer.byteLength(b)||Buffer.compare(Buffer.from(a),Buffer.from(b))).map(([key,item])=>[key,jsonb(item)])):value;
  const databaseRow=(row:Record<string,unknown>|null)=>row===null?null:Object.fromEntries(Object.entries(row).map(([key,value])=>[key,['product_info','normalized_input_snapshot','result_snapshot','review_stages','metadata'].includes(key)?jsonb(value):value]));
  const objects=new Map<string,unknown>(),executions=new Map<string,any>();let one:unknown;let ids=100,writes=0,providerCalls=0,retryPosts=0;let historyResponse:any=null;
  globalThis.fetch=async(input,init)=>{
    const request=new Request(input,init),url=new URL(request.url);
    const authResponse=managed.response(request);if(authResponse)return authResponse;
    if(url.hostname==='n8n-handoff.example.test'){
      if(request.method==='POST'){retryPosts++;assert(url.pathname.endsWith('/4242/retry'));assert.deepEqual(await request.json(),{loadWorkflow:true});return Response.json({id:'5252'});}
      if(url.pathname.includes('/workflows/'))return Response.json({id:'HduzTWm0ekmrvwrn',name:'W2A fixture',active:true});
      if(url.pathname.endsWith('/executions'))return Response.json(historyResponse ?? {data:[...executions.values()].filter(e=>e.workflowId==='HduzTWm0ekmrvwrn').sort((a,b)=>Number(b.id)-Number(a.id)).map(e=>({id:e.id})),nextCursor:null});
      const id=url.pathname.split('/').pop()!;assert(executions.has(id),'Unexpected execution lookup '+id);return Response.json(executions.get(id));
    }
    if(url.hostname.endsWith('.synthetic-handoff.r2.cloudflarestorage.com')){
      if(request.method==='DELETE'){objects.delete(url.pathname);return new Response(null,{status:204});}
      if(request.method==='HEAD')return new Response(null,{status:objects.has(url.pathname)?200:404});
      if(request.method==='GET')return url.pathname.endsWith('/1-manifest.json')?Response.json(one):objects.has(url.pathname)?(objects.get(url.pathname) instanceof Uint8Array ? new Response(Uint8Array.from(objects.get(url.pathname) as Uint8Array).buffer) : Response.json(objects.get(url.pathname))):new Response(null,{status:404});
      assert.equal(request.method,'PUT');if(!url.pathname.endsWith('/2a-manifest.json') && !request.headers.get('Content-Type')?.startsWith('image/'))assert.equal(request.headers.get('If-None-Match'),'*');if(objects.has(url.pathname)&&request.headers.has('If-None-Match'))return new Response(null,{status:412});objects.set(url.pathname,request.headers.get('Content-Type')?.startsWith('image/')?new Uint8Array(await request.arrayBuffer()):await request.json());return new Response(null,{status:200});
    }
    if(url.hostname==='admin.littleherolabs.com' && request.method==='GET' && url.pathname.startsWith('/api/manifests/'))return new Response(null,{status:404});
    if(url.hostname!=='handoff-db.example.test'){providerCalls++;throw Error('Nonfixture transport forbidden');}
    const table=url.pathname.split('/').pop()!,records=tables[table];assert(records,'Unexpected table '+table);
    const matches=(row:Record<string,any>)=>[...url.searchParams].every(([key,value])=>{
      if(['select','order','limit'].includes(key) || value.startsWith('gte.') || key==='or')return true;
      if(value.startsWith('eq.'))return String(row[key])===value.slice(3);
      if(value==='is.null')return row[key]==null;
      if(value.startsWith('in.'))return value.slice(4,-1).split(',').map(v=>v.replaceAll('\"','')).includes(String(row[key]));
      if(value.startsWith('like.'))return String(row[key]??'').startsWith(value.slice(5).replace('%',''));
      throw Error('Unexpected filter '+key+'='+value);
    });
    let found:Record<string,any>|undefined;
    if(request.method==='POST'){found={id:++ids,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),...await request.json()};Object.assign(found!,databaseRow(found!));records.push(found!);writes++;}
    else {found=records.find(matches);if(request.method==='PATCH'){const patch=await request.json();if(found){Object.assign(found,databaseRow(patch));found.updated_at=new Date().toISOString();writes++;}}else assert.equal(request.method,'GET');}
    return Response.json(request.headers.get('Accept')?.includes('object')?databaseRow(found??null):request.method==='GET'?records.filter(matches).map(databaseRow):found?[databaseRow(found)]:[]);
  };
  console.log=()=>{};console.error=()=>{};
  try{
    const [{loadBundledBookConfig},{buildW0RunManifestFromConfig},{POST:bootstrap},{POST:base},{POST:pose},{POST:bg},{POST:worklist},{attachWorkflowJobsToW2BWorkItems}]=await Promise.all([
      import('../src/lib/books/load-book-config'),import('../src/lib/books/build-run-manifest'),import('../src/app/api/internal/w2a/bootstrap-manifest/route'),import('../src/app/api/internal/w2a/build-base-input/route'),import('../src/app/api/internal/w2a/build-pose-input/route'),import('../src/app/api/internal/w2b/build-pose-input/route'),import('../src/app/api/internal/w2a/resolve-pose-worklist/route'),import('../src/lib/workflow-jobs/w2b-pose-jobs')]);
    const {assertActiveW2AParentRow}=await import('../src/lib/w2a-parent-claim');
    const claimExample={orderRowId:4,orderId:'CLAIM-PERMUTATION',startedAt:'2026-11-16T05:00:00.000001Z',executionId:'4242'};
    const permutations=(entries:[string,unknown][]):[string,unknown][][]=>entries.length?entries.flatMap((entry,index)=>permutations(entries.filter((_,i)=>i!==index)).map(rest=>[entry,...rest])):[[]];
    for(const ownerEntries of permutations(Object.entries(claimExample)))for(const inputEntries of permutations(Object.entries(claimExample))){
      const owner=Object.fromEntries(ownerEntries),input=Object.fromEntries(inputEntries);
      const active={id:4,orderId:claimExample.orderId,execution_status:'processing',current_workflow:'2A',started_at:claimExample.startedAt,product_info:{_w2a_parent_claim:owner}};
      assert.doesNotThrow(()=>assertActiveW2AParentRow(active,input as any));
      for(const change of [{orderRowId:5},{orderId:'FOREIGN'},{executionId:'5252'},{startedAt:'2026-11-16T05:00:00.000002Z'}])assert.throws(()=>assertActiveW2AParentRow(active,{...input,...change} as any));
    }
    assert.throws(()=>assertActiveW2AParentRow(null,{} as any));
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
    const baseGraph = graphs[0];
    const baseNode = (name: string) => baseGraph.nodes.find((node: { name: string }) => node.name === name);
    const runBaseNode = (name: string, input: Record<string, unknown>, context: Record<string, unknown> = {}) =>
      vm.runInNewContext('(async function(){' + baseNode(name).parameters.jsCode + '\n}).call({helpers})', {
        $json: input, helpers: {}, ...context,
      });
    const gateName = 'Requires Inner Voice Base Face QA?';
    const gateCondition = baseNode(gateName).parameters.conditions.conditions[0].leftValue;
    const gate = (bookId: string, isMock: boolean) => tournament.execute(gateCondition.slice(1), expressionContext({bookId, generatedImage:{isMock}}));
    const innerVoiceBook = 'book-finding-our-inner-voice';
    assert.equal(gate(innerVoiceBook,false),true);
    assert.equal(gate(innerVoiceBook,true),false);
    assert.equal(gate('book-mvp-simple-adventure',false),false);
    const edges: [string, string[]][] = [
      ['Process Gemini API response and extract generated image1', [gateName]],
      [gateName, ['Build Base Face QA Request','Finalize Repo W2A Base Result']],
      ['Build Base Face QA Request', ['Verify Base Face (Gemini)']],
      ['Verify Base Face (Gemini)', ['Require Base Face Match']],
      ['Require Base Face Match', ['Finalize Repo W2A Base Result']],
    ];
    for (const [source, destinations] of edges) {
      assert.deepEqual(baseGraph.connections[source].main.flat().map((edge: {node:string})=>edge.node),destinations);
    }
    const approvedBase = {json:{characterHash:'synthetic'},binary:{data:{mimeType:'image/png'}}};
    const inline = (name: string) => ({inlineData:{mimeType:'image/png',data:Buffer.from(name).toString('base64')}});
    const qaRequest = await runBaseNode('Build Base Face QA Request', {
      requestBody:{contents:[{parts:[{text:'base prompt'},inline('reference'),inline('hair')]}]},
    }, {$binary:approvedBase.binary,$itemIndex:0,helpers:{getBinaryDataBuffer:async()=>Buffer.from('output')}});
    assert.equal(qaRequest.json.baseFaceQaRequest.generationConfig.responseMimeType,'application/json');
    assert.deepEqual(JSON.parse(JSON.stringify(qaRequest.json.baseFaceQaRequest.contents[0].parts.filter((part:{inlineData?:unknown})=>part.inlineData))),[inline('reference'),inline('output')]);
    const readApprovedBase = (value: unknown, finishReason = 'STOP') => runBaseNode('Require Base Face Match', {
      candidates:[{finishReason,content:{parts:[{text:JSON.stringify(value)}]}}],
    }, {$:()=>({item:approvedBase})});
    const faceApproved = await readApprovedBase({nose_design_match:true,head_proportions_match:true});
    assert.equal(faceApproved.json,approvedBase.json);
    assert.equal(faceApproved.binary,approvedBase.binary);
    await assert.rejects(readApprovedBase({nose_design_match:false,head_proportions_match:true}),/filled triangular nose/);
    await assert.rejects(readApprovedBase({nose_design_match:true,head_proportions_match:false}),/head shape/);
    await assert.rejects(readApprovedBase({nose_design_match:'true',head_proportions_match:true}),/base face QA failed/);
    await assert.rejects(readApprovedBase({},'MAX_TOKENS'),/base face QA failed/);

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
    const posePrompt = JSON.stringify(prepared.json.requestBody);
    assert.match(posePrompt, /Copy the nose from BASE/);
    assert.match(posePrompt, /Keep the BASE skull, cheek and jaw outline/);
    assert.match(posePrompt, /Ignore its face, skull shape, skin color, and head-to-body proportions/);

    const passingStyleVerdict = {
      identity_score: 1, identity_match: true, style_score: 1, color_score: 1, hair_color_score: 1,
      skin_tone_score: 1, skin_pass: true, skin_evaluable: true, skin_roi: 'face',
      skin_s_base: 0.4, skin_s_out: 0.4, skin_v_base: 0.9, skin_v_out: 0.9, skin_ds_pct: 0, skin_dv_pct: 0,
      clothing_score: 1, hair_cleanliness_score: 1,
      nose_design_match: true, head_proportions_match: true, visible_skin_match: true,
    };
    const checkStyleVerdict = (verdict: Record<string, unknown>) => {
      const response = { candidates: [{ content: { parts: [{ text: JSON.stringify(verdict) }] } }] };
      const parsed = runQaNode('Parse Style QA Verdict', response, generated);
      return runQaNode('Derive Style QA Pass', parsed, generated);
    };
    assert.equal(checkStyleVerdict(passingStyleVerdict).styleQaPass, true);
    for (const field of ['nose_design_match', 'head_proportions_match', 'visible_skin_match']) {
      for (const invalid of [false, undefined, 'true']) {
        const result = checkStyleVerdict({ ...passingStyleVerdict, [field]: invalid });
        assert.equal(result.styleQaPass, false, `${field} must explicitly pass`);
        assert(result.styleQaReasons.includes(field.replace(/_match$/, '_mismatch_or_unverified')));
      }
    }

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
    // Canonical accepted revision → worklist → persisted jobs → exported n8n HTTP → actual claim.
    const {buildW2BWorklist}=await import('../src/lib/books/w2b-worklist');
    const approved=Array.from({length:13},(_,poseNumber)=>({poseNumber,approved:true,status:'approved',approvedKey:`${bookId}/order-generated-assets/characters/${characterHash}/poses/pose${String(poseNumber).padStart(2,'0')}.png`,replacedAt:null as string|null,replacementCount:0}));
    const aManifest={orderId,bookId,characterHash,order:{orderId,bookId,characterHash},entries:approved};
    const bManifest={orderId,bookId,characterHash,entries:approved.map(e=>({poseNumber:e.poseNumber,briaStatus:'completed',bgRemovedKey:`${bookId}/order-generated-assets/characters/${characterHash}/characters_${characterHash}_pose${String(e.poseNumber).padStart(2,'0')}_nobg.png`,sourceApprovedKey:e.approvedKey,sourceReplacedAt:null,sourceReplacementCount:0}))};
    const originalWorklist=await buildW2BWorklist({orderId,bookId,force:true,backendUrl:'https://admin.littleherolabs.com'},{loadManifest:async key=>key.endsWith('/2a-manifest.json')?aManifest:key.endsWith('/2b-manifest.json')?bManifest:null});
    const original11=originalWorklist.workItems.find(e=>e.poseNumber===11)!;
    const [first11]=await attachWorkflowJobsToW2BWorkItems({orderId,bookId,workItems:[original11]});
    const firstResponse=await bg(request('/api/internal/w2b/build-pose-input',wire(2,first11)));assert.equal(firstResponse.status,200,await firstResponse.clone().text());
    const oldJob=tables.workflow_jobs.find(j=>j.id===first11.workflowJobId)!;Object.assign(oldJob,{status:'succeeded',lease_owner:null,lease_expires_at:null,completed_at:'2026-11-18T01:00:00Z'});
    const oldSnapshot=structuredClone(oldJob),otherImages=structuredClone(approved.filter(e=>e.poseNumber!==11));
    approved[11].replacedAt='2026-11-18T02:00:00.001Z';approved[11].replacementCount=1;
    const changed=await buildW2BWorklist({orderId,bookId,backendUrl:'https://admin.littleherolabs.com'},{loadManifest:async key=>key.endsWith('/2a-manifest.json')?aManifest:key.endsWith('/2b-manifest.json')?bManifest:null});
    assert.equal(changed.summary.skippedBy2BManifest,12);assert.deepEqual(changed.workItems.map(e=>e.poseNumber),[11]);
    const [revision11]=await attachWorkflowJobsToW2BWorkItems({...changed,workItems:changed.workItems});
    assert.notEqual(revision11.workflowJobId,first11.workflowJobId,'Accepted revision needs its own cutout job');
    const [repeat11]=await attachWorkflowJobsToW2BWorkItems({...changed,workItems:changed.workItems});assert.equal(repeat11.workflowJobId,revision11.workflowJobId,'Same revision enqueue is idempotent');
    const revisionResponse=await bg(request('/api/internal/w2b/build-pose-input',wire(2,revision11)));assert.equal(revisionResponse.status,200,await revisionResponse.clone().text());const revisionBody=await revisionResponse.json();assert.equal(revisionBody.workflowJobId,revision11.workflowJobId);assert.equal(revisionBody.replacedAt,approved[11].replacedAt);assert.equal(revisionBody.replacementCount,1);assert(revisionBody.workflowAttemptId);
    assert.notEqual((await bg(request('/api/internal/w2b/build-pose-input',wire(2,revision11)))).status,200,'Duplicate cannot acquire active revision');
    assert.notEqual((await bg(request('/api/internal/w2b/build-pose-input',wire(2,{...revision11,workflowJobId:first11.workflowJobId,workflowJobIdempotencyKey:first11.workflowJobIdempotencyKey})))).status,200,'Stale original job cannot own replacement');
    assert.deepEqual(oldJob,oldSnapshot);assert.deepEqual(approved.filter(e=>e.poseNumber!==11),otherImages);
    const {buildW2BPoseJobIdentity}=await import('../src/lib/workflow-jobs/w2b-pose-jobs');
    assert.equal(buildW2BPoseJobIdentity(original11).logicalKey,'pose-11','Unreplaced legacy identity unchanged');
    const revisionKey=buildW2BPoseJobIdentity({...original11,replacedAt:approved[11].replacedAt,replacementCount:1}).logicalKey;
    for(const patch of [{replacementCount:2},{replacedAt:'2026-11-18T02:00:00.002Z'},{approvedKey:approved[10].approvedKey},{characterHash:'different-character'}])assert.notEqual(buildW2BPoseJobIdentity({...original11,replacedAt:approved[11].replacedAt,replacementCount:1,...patch}).logicalKey,revisionKey);
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
    const {prepareNativeW2ARetry,dispatchNativeW2ARetry,mapNativeRetryFailure,inspectNativeW2ARecovery,NATIVE_RETRY_KEY}=await import('../src/lib/w2a-native-retry');
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
    const {inspectW2ARecoveryOrder}=await import('../src/lib/w2a-recovery');
    const unpreparedInspection=await inspectW2ARecoveryOrder(nativeId,{adminBaseUrl:'https://admin.littleherolabs.com',includeExecutionLookup:true});assert.equal(unpreparedInspection.nativeRecovery?.phase,'unprepared');
    const missing=tables.workflow_jobs.findIndex(j=>j.order_id===nativeId&&j.logical_key==='pose-12'),removed=tables.workflow_jobs.splice(missing,1)[0];
    await assert.rejects(()=>prepareNativeW2ARetry({orderId:nativeId,executionId:'4242',updatedAt:nativeRow.updated_at},'fixture-admin'),/complete frozen pose worklist/);tables.workflow_jobs.push(removed);
    const preparedNative=await prepareNativeW2ARetry({orderId:nativeId,executionId:'4242',updatedAt:nativeRow.updated_at},'fixture-admin');assert(preparedNative.prepared);assert.equal(nativeRow.execution_status,'error_requires_manual_review');
    const nativeStatus=inspectNativeW2ARecovery(nativeRow,failure,tables.workflow_jobs.filter(j=>j.order_id===nativeId) as any);
    assert.equal(nativeStatus.phase,'prepared');assert.equal(nativeStatus.canResume,true);
    assert.deepEqual(nativeStatus.retainedPoses,[0,1,2,3,4,5,6,7,8]);assert.deepEqual(nativeStatus.remainingPoses,[9,10,11,12]);
    assert(!JSON.stringify(nativeStatus).includes('sourceInput'),'Recovery DTO never includes raw admission');
    const inspectedNative=await inspectW2ARecoveryOrder(nativeId,{adminBaseUrl:'https://admin.littleherolabs.com',includeExecutionLookup:true});
    assert.deepEqual(inspectedNative.nativeRecovery,nativeStatus,'Actual order inspection must carry prepared recovery to the admin client');
    if(process.env.LHL_RECOVERY_FIXTURE_DIR){const fs=await import('node:fs/promises');await fs.mkdir(process.env.LHL_RECOVERY_FIXTURE_DIR,{recursive:true});await fs.writeFile(process.env.LHL_RECOVERY_FIXTURE_DIR+'/inspections.json',JSON.stringify({unprepared:unpreparedInspection,prepared:inspectedNative}),{mode:0o600});}
    const preparedRow=structuredClone(nativeRow);
    for(const mutate of [
      (r:any)=>{r.id=999;},(r:any)=>{r.orderId='OTHER';},(r:any)=>{r.product_info[NATIVE_RETRY_KEY].phase='bogus';},
      (r:any)=>{r.product_info[NATIVE_RETRY_KEY].firstPose=-1;},(r:any)=>{r.product_info[NATIVE_RETRY_KEY].jobs=[null];},
      (r:any)=>{r.product_info[NATIVE_RETRY_KEY].sourceFailure.executionId='999';},
      (r:any)=>{r.product_info[NATIVE_RETRY_KEY].jobs.pop();},
    ]){const bad=structuredClone(preparedRow);mutate(bad);assert.equal(inspectNativeW2ARecovery(bad,failure,tables.workflow_jobs.filter(j=>j.order_id===nativeId) as any).canResume,false);}
    const runtime={...root,id:'5252',status:'running',retryOf:'4242',startedAt:'2026-11-16T06:00:00.000Z'};executions.set('5252',runtime);
    const mapper=top.nodes.find((n:any)=>n.name==='Execute SW1 - Pose Generation').parameters.workflowInputs.value;
    const resumeBody=tournament.execute(mapper.slice(1),{...expressionContext(rejectedSource),$execution:{id:'5252'}});
    assert.equal(resumeBody.workflowNativeParentExecutionId,'5252');
    assert.equal((await pose(request('/api/internal/w2a/build-pose-input',wire(1,resumeBody)))).status,409,'Prepared admission alone never starts generation');
    const imageKey='/'+published[0].uploadKey,originalBytes=objects.get(imageKey);objects.set(imageKey,new Uint8Array([99]));
    await assert.rejects(()=>dispatchNativeW2ARetry({orderId:nativeId,executionId:'4242',updatedAt:nativeRow.updated_at},'fixture-admin'),/Retained image changed/);objects.set(imageKey,originalBytes);assert.equal(nativeRow.product_info[NATIVE_RETRY_KEY].phase,'prepared');
    await dispatchNativeW2ARetry({orderId:nativeId,executionId:'4242',updatedAt:nativeRow.updated_at},'fixture-admin');
    assert.equal(inspectNativeW2ARecovery(nativeRow,failure,tables.workflow_jobs.filter(j=>j.order_id===nativeId) as any).phase,'dispatching');
    assert.equal(inspectNativeW2ARecovery(nativeRow,failure,tables.workflow_jobs.filter(j=>j.order_id===nativeId) as any).canPrepare,false);
    assert.equal(inspectNativeW2ARecovery(nativeRow,failure,tables.workflow_jobs.filter(j=>j.order_id===nativeId) as any).canResume,false);
    await assert.rejects(()=>dispatchNativeW2ARetry({orderId:nativeId,executionId:'4242',updatedAt:nativeRow.updated_at},'fixture-admin'),/fresh prepared/,'Dispatch is consumed before retry POST');
    await assert.rejects(()=>prepareNativeW2ARetry({orderId:nativeId,executionId:'4242',updatedAt:nativeRow.updated_at},'fixture-admin'),/already consumed/,'Preparation cannot re-arm an uncertain dispatch');
    for(const patch of [{workflowNativeParentExecutionId:'999'},{orderId:'FOREIGN'},{poseNumber:8},{retryAttempt:2}]){
      const before=structuredClone(nativeRow);const response=await pose(request('/api/internal/w2a/build-pose-input',wire(1,{...resumeBody,...patch})));assert.equal(response.status,409);assert.deepEqual(nativeRow,before,'Invalid native request must not adopt the physical order');
    }
    // User continuation adopts, then its input endpoint fails before any job attempt.
    const {normalizeNativeW2ARetryInput}=await import('../src/lib/w2a-native-retry');
    await normalizeNativeW2ARetryInput(wire(1,resumeBody));
    runtime.status='error';runtime.stoppedAt='2026-11-16T06:01:00.000Z';
    runtime.workflowData={nodes:[{type:'n8n-nodes-base.executeWorkflow',parameters:{workflowId:'fixture-sw1'}}]};
    runtime.data={...root.data,resultData:{...root.data.resultData,error:{executionId:'5253',message:'Input endpoint rejected parent'},lastNodeExecuted:'Execute SW1 - Pose Generation'}};
    executions.set('5253',{id:'5253',workflowId:'fixture-sw1',status:'error',stoppedAt:runtime.stoppedAt,data:{parentExecution:{executionId:'5252',workflowId:runtime.workflowId},resultData:{error:{message:'A different execution owns this W2A parent claim'},lastNodeExecuted:'Fetch Repo W2A Pose Input'}}});
    const {recordW2AExecutionFailure}=await import('../src/lib/w2a-failure-recovery');
    const {POST:reportFailure}=await import('../src/app/api/internal/w2a/report-failure/route');
    const reportResult=await reportFailure(request('/api/internal/w2a/report-failure',{executionId:'5252'}));
    assert.equal(reportResult.status,200,await reportResult.clone().text());
    const recordedFailure=await reportResult.json();assert.equal(recordedFailure.recorded,true);
    // n8n invokes the workflow's own error-trigger branch after the parent fails.
    const observer={id:'5353',workflowId:root.workflowId,mode:'error',status:'success',finished:true,retryOf:null,
      startedAt:'2026-11-16T06:01:01.000Z',stoppedAt:'2026-11-16T06:01:02.000Z',workflowData:{...structuredClone(top),id:root.workflowId},
      data:{startData:{},executionData:{nodeExecutionStack:[]},resultData:{lastNodeExecuted:'Report W2A Execution Failure',runData:{
        'W2A Error Trigger':[{source:[],executionStatus:'success',data:{main:[[{json:{execution:{id:'5252'},workflow:{id:root.workflowId}}}]]}}],
        'Report W2A Execution Failure':[{source:[{previousNode:'W2A Error Trigger'}],executionStatus:'success',data:{main:[[{json:recordedFailure}]]}}],
      }}}};
    executions.set('5353',observer);

    const stoppedJobs=structuredClone(tables.workflow_jobs),stoppedAttempts=structuredClone(tables.workflow_job_attempts);
    const {GET:recoveryGet,POST:recoveryPost}=await import('../src/app/api/admin/w2a-recovery/route');
    const adminRequest=(body?:unknown)=>new NextRequest('https://admin.littleherolabs.com/api/admin/w2a-recovery?orderId='+nativeId,{method:body?'POST':'GET',headers:{cookie:managed.cookie('operator@example.test'),origin:'https://admin.littleherolabs.com','content-type':'application/json'},body:body?JSON.stringify(body):undefined});
    const stoppedDto=await (await recoveryGet(adminRequest())).json();
    assert(stoppedDto.inspectedOrder,JSON.stringify(stoppedDto));assert.equal(stoppedDto.inspectedOrder.nativeRecovery.canPrepare,true);assert.equal(stoppedDto.inspectedOrder.nativeRecovery.canResume,false);assert.equal(stoppedDto.inspectedOrder.failure.executionId,'5252');
    const actionBody=(dto:any,action:string)=>({action,orderId:nativeId,executionId:dto.failure.executionId,updatedAt:dto.failureRevision,resolvedCause:true});
    const assertRejected=async(body:unknown)=>{const before=structuredClone(nativeRow),jobBefore=structuredClone(tables.workflow_jobs),attemptBefore=structuredClone(tables.workflow_job_attempts),posts=retryPosts;const response=await recoveryPost(adminRequest(body));assert.equal(response.status,400,await response.clone().text());assert.deepEqual(nativeRow,before);assert.deepEqual(tables.workflow_jobs,jobBefore);assert.deepEqual(tables.workflow_job_attempts,attemptBefore);assert.equal(retryPosts,posts);};
    const stoppedBody=actionBody(stoppedDto.inspectedOrder,'prepare_native_retry');
    const {isVerifiedW2AFailureObserver}=await import('../src/lib/w2a-failure-recovery');
    const {assertLatestFailure}=await import('../src/lib/w2a-failure-recovery');
    assert.equal(isVerifiedW2AFailureObserver(observer,recordedFailure.failure),true);
    const reporterNode=(value:any)=>value.workflowData.nodes.find((node:any)=>node.name==='Report W2A Execution Failure');
    const reportOutput=(value:any)=>value.data.resultData.runData['Report W2A Execution Failure'][0].data.main[0][0].json;
    const triggerOutput=(value:any)=>value.data.resultData.runData['W2A Error Trigger'][0].data.main[0][0].json;
    const corruptObservers:Array<(value:any)=>void>=[
      value=>{value.mode='webhook';},value=>{value.status='running';},value=>{value.status='new';},value=>{value.status='error';},value=>{value.finished=false;},
      value=>{delete value.stoppedAt;},value=>{value.startedAt='2099-01-01T00:00:00Z';},value=>{value.retryOf='4242';},value=>{value.data.parentExecution={executionId:'1'};},
      value=>{value.data.executionData.nodeExecutionStack=[{}];},value=>{value.data.executionData.waitingExecution={pending:{}};},value=>{value.data.startData={runNodeFilter:['Generate']};},
      value=>{value.data.resultData.error={message:'stopped'};},value=>{value.workflowData.id='FOREIGN';},
      value=>{value.workflowData.nodes.find((node:any)=>node.name==='W2A Error Trigger').type='n8n-nodes-base.webhook';},value=>{reporterNode(value).type='n8n-nodes-base.code';},
      value=>{reporterNode(value).parameters.url='https://example.test/generate';},value=>{reporterNode(value).parameters.method='GET';},value=>{reporterNode(value).parameters.body='={{ $json }}';},
      value=>{reporterNode(value).parameters.options.redirect.redirect.followRedirects=true;},
      value=>{reporterNode(value).parameters.options.proxy='http://proxy.example.test:8080';},value=>{reporterNode(value).parameters.options.allowUnauthorizedCerts=true;},
      value=>{reporterNode(value).parameters.options.response.response.responseFormat='text';},value=>{reporterNode(value).parameters.sendQuery=true;},
      value=>{reporterNode(value).typeVersion=1;},value=>{reporterNode(value).parameters.sendHeaders=false;},
      value=>{value.workflowData.nodes.find((node:any)=>node.name==='W2A Error Trigger').parameters.notice='changed';},
      value=>{value.workflowData.connections['W2A Error Trigger'].main[0].push({node:'Execute SW1 - Pose Generation',type:'main',index:0});},
      value=>{value.workflowData.connections['Report W2A Execution Failure']={main:[[{node:'Execute SW1 - Pose Generation',type:'main',index:0}]]};},
      value=>{value.data.resultData.runData['Execute SW1 - Pose Generation']=[];},value=>{value.data.resultData.runData['W2A Error Trigger'].push(value.data.resultData.runData['W2A Error Trigger'][0]);},
      value=>{value.data.resultData.runData['Report W2A Execution Failure'][0].source=[{previousNode:'Generate'}];},
      value=>{value.data.resultData.runData['Report W2A Execution Failure'][0].data.main[0].push({json:reportOutput(value)});},
      value=>{value.data.resultData.runData['W2A Error Trigger'][0].executionStatus='running';},
      value=>{triggerOutput(value).execution.id='FOREIGN';},value=>{triggerOutput(value).workflow.id='FOREIGN';},
      value=>{reportOutput(value).success=false;},value=>{reportOutput(value).recorded=false;},value=>{reportOutput(value).stale=true;},
      value=>{reportOutput(value).failure.claimStartedAt='2026-11-16T06:00:00.000001Z';},
      value=>{reportOutput(value).failure.orderId='FOREIGN';},value=>{reportOutput(value).failure.orderRowId=999;},
      value=>{reportOutput(value).failure.orderRowId=999;reportOutput(value).failure.orderId='FOREIGN';},
      value=>{reportOutput(value).failure.sourceExecutionIds=[];},
      value=>{delete value.data.resultData.runData['Report W2A Execution Failure'];},
    ];
    for(const corrupt of corruptObservers){const bad=structuredClone(observer);corrupt(bad);assert.equal(isVerifiedW2AFailureObserver(bad,recordedFailure.failure),false);executions.set('5353',bad);await assertRejected(stoppedBody);}
    const persistedDefaults=structuredClone(observer),persistedNode=reporterNode(persistedDefaults);
    Object.assign(persistedNode.parameters,{specifyHeaders:'keypair',provideSslCertificates:false,sendQuery:false,preBuiltAgentsCalloutHttpRequest:'',curlImport:'',infoMessage:''});
    Object.assign(persistedNode.parameters.options.response.response,{fullResponse:false,neverError:false});
    persistedDefaults.workflowData.nodes.find((node:any)=>node.name==='W2A Error Trigger').parameters={notice:''};
    assert.equal(isVerifiedW2AFailureObserver(persistedDefaults,recordedFailure.failure),true,'Actual n8n explicit defaults remain canonical');
    executions.set('5353',{...structuredClone(observer),id:'5354'});await assertRejected(stoppedBody);
    const foreignObserver=structuredClone(observer);Object.assign(reportOutput(foreignObserver).failure,{executionId:'5300',orderId:'FOREIGN-ORDER',orderRowId:999,sourceExecutionIds:['5300','5301']});triggerOutput(foreignObserver).execution.id='5300';
    assert.equal(isVerifiedW2AFailureObserver(foreignObserver,recordedFailure.failure),true);executions.set('5353',foreignObserver);await assertLatestFailure(recordedFailure.failure,true);executions.set('5353',observer);

    await assertRejected({...stoppedBody,updatedAt:'1999-01-01T00:00:00Z'});
    const assertUnknownHistory=async(body:unknown)=>{
      for(const detail of [{},{id:'7777',workflowId:root.workflowId,status:'running'}, {...root,id:'7778'}, {...root,id:'7777',workflowId:'FOREIGN'},...['new','running','success','error'].map(status=>({...root,id:'7777',status}))]){
        executions.set('7777',detail);historyResponse={data:[{id:'7777'},{id:'5252'},{id:'4242'}],nextCursor:null};await assertRejected(body);
      }
      executions.delete('7777');historyResponse={data:[],nextCursor:'repeat'};await assertRejected(body);historyResponse=null;
    };
    await assertUnknownHistory(stoppedBody);
    for(const change of [(value:any)=>value.images.pop(),(value:any)=>value.images.push(value.images[0]),(value:any)=>{value.images[0].sha256='bad';},(value:any)=>{value.images[0].bytes=0;},(value:any)=>{value.images[0].key='foreign.png';}]){
      const info=structuredClone(nativeRow.product_info);change(nativeRow.product_info[NATIVE_RETRY_KEY]);await assertRejected(stoppedBody);nativeRow.product_info=info;
    }
    const pinnedImage=objects.get(imageKey);objects.set(imageKey,new Uint8Array([7,7]));await assertRejected(stoppedBody);objects.set(imageKey,pinnedImage);
    const originalAttempt=structuredClone(tables.workflow_job_attempts.find(a=>a.job_id===nativeRow.product_info[NATIVE_RETRY_KEY].sourceInput.workflowJobId)!);tables.workflow_job_attempts.push({...originalAttempt,id:99999});await assertRejected(stoppedBody);tables.workflow_job_attempts.pop();
    const targetAttempt=tables.workflow_job_attempts.find(a=>a.job_id===nativeRow.product_info[NATIVE_RETRY_KEY].sourceInput.workflowJobId)!;
    const targetTime=targetAttempt.updated_at;targetAttempt.updated_at='2099-01-01T00:00:00Z';await assertRejected(stoppedBody);targetAttempt.updated_at=targetTime;
    const childStatus=executions.get('5253').status;executions.get('5253').status='running';await assertRejected(stoppedBody);executions.get('5253').status=childStatus;
    const stoppedFixture=structuredClone(stoppedDto.inspectedOrder);
    const preparedAgain=await recoveryPost(adminRequest(actionBody(stoppedDto.inspectedOrder,'prepare_native_retry')));
    assert.equal(preparedAgain.status,200,'Failed adopted continuation must be recoverable without generation: '+await preparedAgain.clone().text());
    const againDto=await preparedAgain.json();assert.equal(againDto.after.failure.executionId,'4242');assert.equal(againDto.after.nativeRecovery.canResume,true);
    const refreshPrepared=await recoveryPost(adminRequest(actionBody(againDto.after,'prepare_native_retry')));assert.equal(refreshPrepared.status,200,await refreshPrepared.clone().text());
    const refreshPreparedDto=await refreshPrepared.json();assert.deepEqual(nativeRow.product_info[NATIVE_RETRY_KEY].images,preparedRow.product_info[NATIVE_RETRY_KEY].images);
    assert.equal(nativeRow.product_info[NATIVE_RETRY_KEY].failedContinuations[0].dispatchedBy,'fixture-admin');
    assert.equal(nativeRow.product_info[NATIVE_RETRY_KEY].failedContinuations[0].checkedBy,'operator@example.test');
    await assertUnknownHistory(actionBody(refreshPreparedDto.after,'prepare_native_retry'));
    await assertUnknownHistory(actionBody(refreshPreparedDto.after,'resume_native_retry'));
    const refreshedDto=await (await recoveryGet(adminRequest())).json();
    assert.equal(refreshedDto.inspectedOrder.failure.executionId,'4242');
    assert.deepEqual(tables.workflow_jobs,stoppedJobs);assert.deepEqual(tables.workflow_job_attempts,stoppedAttempts);
    const resumedAgain=await recoveryPost(adminRequest(actionBody(refreshedDto.inspectedOrder,'resume_native_retry')));
    assert.equal(resumedAgain.status,200,await resumedAgain.clone().text());
    assert.equal(nativeRow.product_info[NATIVE_RETRY_KEY].failedContinuations[0].dispatchedBy,'fixture-admin');
    if(process.env.LHL_RECOVERY_FIXTURE_DIR){const fs=await import('node:fs/promises');await fs.writeFile(process.env.LHL_RECOVERY_FIXTURE_DIR+'/new-inspections.json',JSON.stringify({stopped:stoppedFixture,prepared:refreshedDto.inspectedOrder}),{mode:0o600});}
    executions.set('6262',{...root,id:'6262',retryOf:'4242',status:'running',startedAt:'2026-11-16T07:00:00.000Z'});
    for(let n=9;n<=12;n++){
      const body=n===9?{...resumeBody,workflowNativeParentExecutionId:'6262'}:tournament.execute(mapper.slice(1),{...expressionContext(nativeItems.find((i:any)=>i.poseNumber===n)),$execution:{id:'6262'}});
      const response=await pose(request('/api/internal/w2a/build-pose-input',wire(1,body)));assert.equal(response.status,200,'Native continuation pose'+n+': '+await response.clone().text());
      const output=await response.json();assert.equal(output.workflowParentClaim.executionId,'6262');assert.equal(output.workflowAttempt,n===9?2:1);
      if(n===9){const adopted=await inspectW2ARecoveryOrder(nativeId,{adminBaseUrl:'https://admin.littleherolabs.com',includeExecutionLookup:false});assert.equal(adopted.nativeRecovery?.phase,'adopted');assert.equal(adopted.nativeRecovery?.canResume,false);}
      const ack=publishedAck({...output,success:true,uploadKey:output.uploadKey.replace(/_r\d+(?=\.)/,''),qaPass:true,qa:{combined:{pass:true}}});published.push(ack);
      // The provider boundary is synthetic; persist its terminal job/attempt and
      // canonical upload just as the initial retained-pose fixture does.
      Object.assign(tables.workflow_jobs.find(j=>j.id===output.workflowJobId)!,{status:'succeeded',result_snapshot:{uploadKey:output.uploadKey,generatedFileName:output.generatedFileName},lease_owner:null,lease_expires_at:null});
      Object.assign(tables.workflow_job_attempts.find(a=>a.id===output.workflowAttemptId)!,{status:'succeeded',ended_at:'2026-11-16T07:05:00.000Z'});
      objects.set('/'+ack.approvedKey,new Uint8Array([n+1,2,3]));
    }
    assert.deepEqual(tables.workflow_jobs.filter(j=>j.order_id===nativeId&&Number(j.logical_key.slice(-2))<9),retainedJobs);
    for(const [key,bytes]of retainedImages)assert.deepEqual(objects.get(key),bytes);
    const mappedFailure=mapNativeRetryFailure(nativeRow,{...root,id:'6262',retryOf:'4242'},{...failure,executionId:'6262'});assert.equal(mappedFailure.claimStartedAt,nativeRow.started_at);
    assert.equal(mapNativeRetryFailure(nativeRow,{...root,id:'6262',retryOf:'FOREIGN'},{...failure,executionId:'6262'}).claimStartedAt,failure.claimStartedAt);
    const manifestItems=topNode('Write Run Manifest1',published[0],{$input:{all:()=>published.map(json=>({json}))},$execution:{id:'6262',customData:{orderContext:nativeTop.orderContext}}});
    const manifestBody=JSON.parse(topNode('Prepare Build 2A Manifest Body',manifestItems[0].json)[0].json.requestBody);
    const {POST:manifestPost}=await import('../src/app/api/internal/w2a/build-run-manifest/route');
    for(const claims of [
      {workflowParentClaim:{...claim,executionId:'invalid'}},
      {workflowParentClaim:{...claim,orderId:'FOREIGN'},orderContext:{...manifestBody.payload.orderContext,workflowParentClaim:{...claim,orderId:'FOREIGN'}}},
      {workflowParentClaim:claim,orderContext:{...manifestBody.payload.orderContext,workflowParentClaim:{...claim,executionId:'9999'}}},
    ]){
      const beforeObjects=structuredClone(objects),beforeWrites=writes;
      const refused=await manifestPost(request('/api/internal/w2a/build-run-manifest',{payload:{...manifestBody.payload,...claims}}));
      assert.equal(refused.status,500);assert.match((await refused.json()).details,/consistent parent claim/);
      assert.deepEqual(objects,beforeObjects);assert.equal(writes,beforeWrites);
    }
    const manifestRes=await manifestPost(request('/api/internal/w2a/build-run-manifest',manifestBody));assert.equal(manifestRes.status,200,await manifestRes.clone().text());const manifestOut=await manifestRes.json();assert.equal(manifestOut.manifest.entries.length,13);
    const completion=JSON.parse(topNode('Prepare 2A Completion Upsert Body',manifestOut,{$execution:{id:'6262',customData:{}}})[0].json.requestBody);
    assert.equal(completion.workflowNativeParentExecutionId,'6262');assert.equal(completion.workflowParentClaim.executionId,'4242','Saved context is old; only verified lineage can map it');
    const {POST:completePost}=await import('../src/app/api/webhooks/workflow-2a-complete/route');
    const runningRow=structuredClone(nativeRow),runningRoot=structuredClone(executions.get('6262'));
    const canonicalManifest=structuredClone(objects.get('/'+manifestOut.manifestKey)) as any;
    const tempKey=manifestOut.orderPrefix+'/revisions/pose08/synthetic.png',replacementBytes=new Uint8Array([137,80,78,71,13,10,26,10]);
    const attachReplacement=()=>{
      const m=structuredClone(canonicalManifest);m.revisions={history:[],pending:{pose08:{poseNumber:8,r2Key:tempKey,status:'completed',jobId:'synthetic-revision8'}}};
      objects.set('/'+manifestOut.manifestKey,m);objects.set('/'+tempKey,replacementBytes);
    };
    attachReplacement();
    const {POST:replacePost}=await import('../src/app/api/orders/[orderId]/replace-image/route');
    const replaceRequest=()=>{const form=new FormData();form.set('poseNumber','8');form.set('stage','preBria');form.set('temporaryR2Key',tempKey);return new NextRequest('https://admin.littleherolabs.com/api/orders/'+nativeId+'/replace-image',{method:'POST',headers:{cookie:managed.cookie('operator@example.test'),origin:'https://admin.littleherolabs.com'},body:form});};
    const allJobs=structuredClone(tables.workflow_jobs),allAttempts=structuredClone(tables.workflow_job_attempts);
    const pendingBefore=structuredClone(objects),orderBefore=structuredClone(nativeRow);
    const locked=await replacePost(replaceRequest(),{params:Promise.resolve({orderId:nativeId})});assert.equal(locked.status,500);assert.match((await locked.json()).error,/owned by an active workflow/);assert.deepEqual(objects,pendingBefore);assert.deepEqual(nativeRow,orderBefore);
    // Reproduce the old callback with no execution customData, then recover it
    // through the actual admin actions, including a realistic large native run.
    const missingClaim={...completion};delete missingClaim.workflowParentClaim;
    assert.equal((await completePost(request('/api/webhooks/workflow-2a-complete',missingClaim))).status,500);
    const stoppedRoot={...runningRoot,status:'error',stoppedAt:'2026-11-16T07:06:00.000Z',padding:'x'.repeat(23198010),data:{...runningRoot.data,resultData:{...runningRoot.data.resultData,error:{message:'Missing completion parent claim'},lastNodeExecuted:'Supabase — Upsert from 2A Manifest'}}};
    executions.set('6262',stoppedRoot);executions.set('6263',{id:'6263',workflowId:'HduzTWm0ekmrvwrn',status:'error',data:{resultData:{error:{message:'n8n recovery details exceed the inspection limit'}}}});
    const syncDto=await (await recoveryGet(adminRequest())).json();assert.equal(syncDto.inspectedOrder.failure.executionId,'6262');assert.equal(syncDto.inspectedOrder.canRecordFailure,true);
    const synced=await recoveryPost(adminRequest({...actionBody(syncDto.inspectedOrder,'record_failure'),claimStartedAt:syncDto.inspectedOrder.failure.claimStartedAt}));assert.equal(synced.status,200,await synced.clone().text());const syncOut=await synced.json();const {verifyCompletedW2ARecovery}=await import('../src/lib/w2a-completed-recovery');await verifyCompletedW2ARecovery(nativeRow);assert.equal(syncOut.after.safeToFinalize,true);
    const finalized=await recoveryPost(adminRequest({...actionBody(syncOut.after,'finalize'),claimStartedAt:syncOut.after.failure.claimStartedAt}));assert.equal(finalized.status,200,await finalized.clone().text());assert.equal(nativeRow.current_workflow,null);assert.equal(nativeRow.started_at,null);
    const acceptReplacement=async()=>{
      const beforeManifest=structuredClone(objects.get('/'+manifestOut.manifestKey)) as any;
      const response=await replacePost(replaceRequest(),{params:Promise.resolve({orderId:nativeId})});assert.equal(response.status,200,await response.clone().text());
      const m=objects.get('/'+manifestOut.manifestKey) as any;assert.equal(m.revisions.pending.pose08,undefined);assert.equal(m.revisions.history.at(-1).status,'accepted');
      assert.deepEqual(m.entries.filter((e:any)=>e.poseNumber!==8),beforeManifest.entries.filter((e:any)=>e.poseNumber!==8));
      assert.deepEqual(objects.get('/'+m.entries.find((e:any)=>e.poseNumber===8).approvedKey),replacementBytes);
      assert.deepEqual(tables.workflow_jobs,allJobs);assert.deepEqual(tables.workflow_job_attempts,allAttempts);assert.equal(nativeRow.next_workflow,null);assert.equal(nativeRow.human_approved,false);
    };
    await acceptReplacement();
    Object.keys(nativeRow).forEach(k=>delete nativeRow[k]);Object.assign(nativeRow,runningRow);executions.set('6262',runningRoot);executions.delete('6263');attachReplacement();
    const completeResponse=await completePost(request('/api/webhooks/workflow-2a-complete',{...completion,needsReview:true}));assert.equal(completeResponse.status,200,await completeResponse.clone().text());assert.equal(nativeRow.execution_status,'processing');assert.equal(nativeRow.current_workflow,null);assert.equal(nativeRow.started_at,null);
    await acceptReplacement();
    assert.equal(nativeRow.product_info[NATIVE_RETRY_KEY].currentClaim.executionId,'6262');
    const completedInspection=await inspectW2ARecoveryOrder(nativeId,{adminBaseUrl:'https://admin.littleherolabs.com',includeExecutionLookup:false});assert.equal(completedInspection.nativeRecovery?.phase,'adopted');assert.equal(completedInspection.nativeRecovery?.canPrepare,false);
    const doneRow=structuredClone(nativeRow);Object.assign(nativeRow,{execution_status:'error_requires_manual_review',current_workflow:null,started_at:null,product_info:{...nativeRow.product_info,_w2a_failure:{...mappedFailure,executionId:'6262',resolvedAt:undefined}}});
    const laterFailure=await inspectW2ARecoveryOrder(nativeId,{adminBaseUrl:'https://admin.littleherolabs.com',includeExecutionLookup:false});assert.equal(laterFailure.nativeRecovery?.phase,'adopted');assert.equal(laterFailure.nativeRecovery?.canResume,false);Object.assign(nativeRow,doneRow);
    assert.equal(providerCalls,0);
    log('Actual W0/bootstrap → pose8 two-image request → SW1 return/SW2/repeated QA retry/exhaustion → POST passed; actual failure-report observer history + strict negatives → native preparation/dispatch CAS → retained0–8/resumed9–12 → 13-pose manifest/completion passed, zero provider calls');
  }finally{globalThis.fetch=transport;console.log=log;console.error=errorLog;}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
