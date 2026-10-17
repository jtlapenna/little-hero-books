import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import { NextRequest } from 'next/server';
import { prepareWorkflowBackendAuth, CREDENTIAL_ID } from './prepare-workflow-backend-auth.mjs';

const root = resolve('..');
const read = (file: string) => JSON.parse(readFileSync(resolve(root, 'docs/n8n-workflow-files', file), 'utf8'));
const w = read('repo-centric/workflows/w2B-main-orchestrator.repo-centric.json');
const sw2 = read('finals/w2A-SW2-Pose_and_Style_QA.json');
const sw3 = read('repo-centric/workflows/w2A-SW3-Upload.repo-centric.json');
const node = (workflow: typeof w, name: string) => { const value = workflow.nodes.find((n: {name:string}) => n.name === name); assert(value, name); return value; };
const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
const evaluate = (value: string, json: Record<string, unknown>, items: (name: string, output?: number, run?: number) => unknown[] = () => [], run = 0) => {
  assert(value.startsWith('={{') && value.endsWith('}}')); return new Function('$json', '$items', '$runIndex', `return (${value.slice(3, -2)});`)(json, items, run);
};
async function main() {
  Object.assign(process.env, { BACKEND_API_TOKEN: 'synthetic-workflow-machine-authority-123456789', CLOUDFLARE_ACCOUNT_ID: 'synthetic-workflow', R2_ACCESS_KEY_ID: 'synthetic-access', R2_SECRET_ACCESS_KEY: 'synthetic-secret' });
  const { buildW2ARunManifest } = await import('../src/lib/books/w2a-manifest');
  const { GET: manifests } = await import('../src/app/api/manifests/[...path]/route');
  const oldFetch = globalThis.fetch, log = console.log, warn = console.warn, error = console.error;
  globalThis.fetch = async () => { throw new Error('All real traffic forbidden'); };
  console.log = () => undefined; console.warn = () => undefined; console.error = () => undefined;
  try {
    for (const workflow of [w, sw2, sw3]) {
      assert.deepEqual(prepareWorkflowBackendAuth(workflow).workflow, workflow, 'Transformation is idempotent');
      for (const n of workflow.nodes) {
        if (n.parameters?.authentication !== 'genericCredentialType' || n.parameters?.genericAuthType !== 'httpHeaderAuth') continue;
        assert.equal(n.credentials.httpHeaderAuth.id, CREDENTIAL_ID);
        assert.equal(n.parameters.options.redirect.redirect.followRedirects, false);
        assert(!(n.parameters.headerParameters?.parameters || []).some((h:{name:string}) => h.name.toLowerCase() === 'authorization'));
        if (n.parameters.url.startsWith('={{')) new Function('$json', '$items', '$runIndex', `return (${n.parameters.url.slice(3,-2)});`);
        else assert(n.parameters.url.startsWith('https://admin.littleherolabs.com/api/'));
      }
    }
    const path = ['Normalize Result', 'Download 2B Manifest (if exists)', 'Download 2A Manifest (for merge)', 'Merge Result Into 2B Manifest'];
    for (let i=0;i<path.length-1;i++) assert.deepEqual(w.connections[path[i]].main, [[{node:path[i+1],type:'main',index:0}]]);
    const merge = new AsyncFunction('$items', '$runIndex', 'Buffer', node(w,'Merge Result Into 2B Manifest').parameters.jsCode);
    const restore = new Function('$json','$',node(w,'Restore 2B Manifest Upload Context').parameters.jsCode);
    const carry = (context: Record<string,unknown>, ack: unknown = {success:true}) => restore(ack,(name:string)=>{assert.equal(name,'Prep Manifest Binary');return {item:{json:context}};}).json;
    assert.equal(w.connections['Upload 2B Manifest to R2'].main[0][0].node,'Restore 2B Manifest Upload Context');
    assert.equal(w.connections['Restore 2B Manifest Upload Context'].main[0][0].node,'If Complete');
    const make = (orderId: string, poseNumber = 0) => {
      const characterHash = orderId.endsWith('2') ? 'b'.repeat(16) : 'a'.repeat(16);
      const prefix = `book-synthetic/orders/${orderId}`;
      const built = buildW2ARunManifest({ orderId, rootOrderId:'SYNTHETIC-ROOT', amazonOrderId:'SYNTHETIC-ROOT', bookId:'book-synthetic', characterHash,
        poseResults:[0,1].map(pose => ({poseNumber:pose,qaPass:true,approvedKey:`book-synthetic/order-generated-assets/characters/${characterHash}/poses/pose${String(pose).padStart(2,'0')}.png`})) });
      const result = {orderId,amazonOrderId:'SYNTHETIC-ROOT',characterHash,poseNumber,briaStatus:'completed',bgRemovedKey:'synthetic/nobg.png',bgRemovedImageUrl:'https://synthetic.example/nobg.png'};
      const ctx = { orderId, characterHash, backendUrl:'https://attacker.invalid', manifest2aUrl:`https://admin.littleherolabs.com/api/manifests/${prefix}/manifests/2a-manifest.json`, manifest2bKey:`${prefix}/manifests/2b-manifest.json`, result };
      return { ctx, manifest: built.manifest };
    };
    const envelopes = (value: unknown) => [value, JSON.stringify(value), {body:value}, {data:JSON.stringify(value)}, {_readableState:{buffer:[Buffer.from(JSON.stringify(value))]}}];
    const run = async (fixture: ReturnType<typeof make>, raw2b: unknown, raw2a: unknown = {statusCode:200,body:fixture.manifest}, index=0) => {
      const items = (name:string, output?:number, run?:number) => { assert.equal(output,0); assert.equal(run,index); return [{json:name==='Normalize Result'?fixture.ctx:name==='Download 2B Manifest (if exists)'?raw2b:name==='Download 2A Manifest (for merge)'?raw2a: (()=>{throw Error('Unexpected workflow lookup')})()}]; };
      return (await merge(items,index,Buffer))[0].json;
    };
    for (const [index, id] of ['SYNTHETIC-ROOT-item-1','SYNTHETIC-ROOT-item-2'].entries()) {
      const f = make(id), lookup=(name:string,_output?:number,run?:number)=>{assert.equal(name,'Normalize Result');assert.equal(run,index);return [{json:f.ctx}];};
      for (const which of ['2A Manifest (for merge)','2B Manifest (if exists)']) {
        const n=node(w,'Download '+which); const url=evaluate(n.parameters.url, {statusCode:404},lookup,index);
        assert(url.startsWith('https://admin.littleherolabs.com/api/manifests/book-synthetic/orders/'+id+'/'));
        const bad=structuredClone(f.ctx);bad.manifest2bKey=bad.manifest2bKey.replace(id,'OTHER');bad.manifest2aUrl=bad.manifest2aUrl.replace(id,'OTHER');
        assert.throws(()=>evaluate(n.parameters.url,{},()=>[{json:bad}],index));
      }
      for (const body of envelopes(f.manifest)) {
        const merged=await run(f,{statusCode:404,body:'missing'},{statusCode:200,body},index);
        assert.equal(merged.orderId,id);assert.equal(merged.manifest2b.stage,'2b');assert.equal(merged.manifest2b.entries[0].briaStatus,'completed');
        const existing=structuredClone(merged.manifest2b);existing.entries[1].sentinel='preserve-this-pose';
        const next=await run(f,{statusCode:200,body:JSON.stringify(existing)},{statusCode:200,body},index);
        assert.equal(next.manifest2b.entries[1].sentinel,'preserve-this-pose');
        const prep=new Function('$json','Buffer',node(w,'Prep Manifest Binary').parameters.jsCode)(next,Buffer)[0];
        assert.equal(prep.json.orderId,id);assert.equal(JSON.parse(Buffer.from(prep.binary.data.data,'base64').toString()).orderId,id);
        const carried = carry(prep.json);
        const notify=evaluate(node(w,'Notify Backend (2B Complete)').parameters.jsonBody,carried,()=>{throw Error('Conditional notification cannot use another node run index');},0);
        assert.equal(notify.orderId,id);assert.equal(notify.manifestUrl,f.ctx.manifest2bKey);assert.equal(notify.characterHash,f.ctx.characterHash);
      }
      for (const raw of [{statusCode:401,body:{}},{statusCode:403,body:{}},{statusCode:302,body:{}},{statusCode:500,body:{}},{error:'timeout'},{statusCode:200,body:'{invalid'},
        {statusCode:200,body:JSON.stringify({...f.manifest,stage:'2b'})+' trailing'}, {statusCode:200,body:{...f.manifest,stage:'2b',schema:'wrong'}},
        {statusCode:200,body:{...f.manifest,stage:'2b',orderId:'OTHER'}},{statusCode:200,body:{...f.manifest,stage:'2b',characterHash:'OTHER'}},{statusCode:200,body:{...f.manifest,stage:'2b',entries:[null]}}]) await assert.rejects(run(f,raw,undefined,index));
    }
    // Merge executes per pose; the conditional Notify executes only at completion.
    // Its first runIndex0 must carry Merge1's review flag, never read Merge0.
    const first = make('SYNTHETIC-ROOT-item-1',0);
    const partial = await run(first,{statusCode:404});assert.equal(partial.complete,false);
    const last = make('SYNTHETIC-ROOT-item-1',1);last.ctx.result.briaStatus='failed';
    const final = await run(last,{statusCode:200,body:partial.manifest2b},{statusCode:200,body:last.manifest},1);
    assert.equal(final.complete,true);assert.equal(final.manifest2b.summary.needsHumanReview,true);
    const finalPrep = new Function('$json','Buffer',node(w,'Prep Manifest Binary').parameters.jsCode)(final,Buffer)[0];
    const carried = carry(finalPrep.json);
    const finalNotify = evaluate(node(w,'Notify Backend (2B Complete)').parameters.jsonBody,carried,()=>{throw Error('No conditional cross-node index allowed');},0);
    assert.equal(finalNotify.needsReview,true);assert.equal(finalNotify.orderId,last.ctx.orderId);
    for(const ack of [{success:false},{success:true,error:'failed'},{}])assert.throws(()=>carry(finalPrep.json,ack));
    // Actual API storage-status producer feeds the real exported merge consumer.
    const f=make('SYNTHETIC-ROOT-item-1'), key=f.ctx.manifest2bKey;
    let storageStatus:number|'throw'=404;
    globalThis.fetch=async(input,init)=>{const req=new Request(input,init);assert.equal(new URL(req.url).hostname,'little-hero-orders.synthetic-workflow.r2.cloudflarestorage.com');if(storageStatus==='throw')throw Error('fetch failed 404 misleading text');return new Response('{}',{status:storageStatus});};
    for(const status of [404,403,500,'throw'] as const){storageStatus=status;const response=await manifests(new NextRequest('https://admin.littleherolabs.com/api/manifests/'+key,{headers:{authorization:'Bearer '+process.env.BACKEND_API_TOKEN}}),{params:Promise.resolve({path:key.split('/')})});const full={statusCode:response.status,body:await response.text()};assert.equal(response.status,status===404?404:502);if(status===404)assert.equal((await run(f,full)).orderId,f.ctx.orderId);else await assert.rejects(run(f,full));}
    for(const name of ['Pose QA — Build Request1','Reattach (Style QA): Base + Generated']){
      const code=node(sw2,name).parameters.jsCode,start=code.indexOf('async function downloadToBinary'),end=code.indexOf('\n}',start)+2;
      assert(start>=0&&end>start);const fragment=code.slice(start,end), functionName=fragment.match(/async function (\w+)/)![1];
      const call=new AsyncFunction('url','Buffer',fragment+`; return ${functionName}.call(this,url,'synthetic.png');`);
      const calls:Array<{url:string;headers:Record<string,string>;disableFollowRedirect:boolean}>=[];
      const helpers={httpRequest:async(options:typeof calls[number])=>{calls.push(options);return Buffer.from('synthetic-image');},prepareBinaryData:async()=>({data:'synthetic'})};
      for(const url of ['https://attacker.invalid/api/assets/book/poses/a.png','https://admin.littleherolabs.com.attacker.invalid/api/assets/book/poses/a.png','http://admin.littleherolabs.com/api/assets/book/poses/a.png','https://u:p@admin.littleherolabs.com/api/assets/book/poses/a.png','https://admin.littleherolabs.com:443/api/assets/book/poses/a.png','https://admin.littleherolabs.com/api/assets/book/../a.png','https://admin.littleherolabs.com/api/assets/book/%2e%2e/a.png']){const before=calls.length;await call.call({helpers},url,Buffer);assert.equal(calls.length,before);}
      await call.call({helpers},'https://admin.littleherolabs.com/api/assets/book/poses/a.png',Buffer);assert(calls.at(-1)!.headers.Authorization);assert.equal(calls.at(-1)!.disableFollowRedirect,true);
      await call.call({helpers},'https://replicate.delivery/synthetic/a.png',Buffer);assert.equal(calls.at(-1)!.headers.Authorization,undefined);
    }
    const getPose=node(sw2,'Get Pose');for(const key of ['book/../a.png','book/%2e/a.png','book/a.png?x=1','book/a.png#x','book\\a.png'])assert.throws(()=>evaluate(getPose.parameters.url,{poseRefKey:key}));
    assert.equal(evaluate(getPose.parameters.url,{poseRefKey:'book/characters/poses/pose00.png'}),'https://admin.littleherolabs.com/api/assets/book/characters/poses/pose00.png');
    const publish=node(sw3,'HTTP Request Finalize Canonical Publish');assert.equal(publish.parameters.contentType,'multipart-form-data');assert(publish.parameters.bodyParameters.parameters.some((p:{inputDataFieldName?:string})=>p.inputDataFieldName==='=generated'));
    const body={orderId:'SYNTHETIC-ROOT',rootOrderId:'SYNTHETIC-ROOT',manifestKey:'book/orders/SYNTHETIC-ROOT-item-2/manifests/1-manifest.json',poseNumber:0,storageKey:'book/characters/pose00.png'};
    assert.equal(evaluate(publish.parameters.url,body),'https://admin.littleherolabs.com/api/orders/SYNTHETIC-ROOT-item-2/replace-image');
    const pose=publish.parameters.bodyParameters.parameters.find((p:{name:string})=>p.name==='poseNumber');assert.equal(evaluate(pose.value,body),'0');
    assert.throws(()=>evaluate(publish.parameters.url,{orderId:'SYNTHETIC-ROOT',rootOrderId:'SYNTHETIC-ROOT',claimGroupSize:2}));
    const acknowledge = new Function('$json','$items','$runIndex',node(sw3,'Return Upload Results').parameters.jsCode);
    const input = {...body,characterHash:'a'.repeat(16),publicR2Url:'https://public.synthetic.example'};
    const ackKey = `book/order-generated-assets/characters/${input.characterHash}/poses/pose00.png`;
    const ack = {success:true,orderId:'SYNTHETIC-ROOT-item-2',poseNumber:0,r2Key:ackKey,replacementCount:1};
    const lookup = (values:unknown[]) => (name:string,out?:number,run?:number) => {assert.equal(name,'HTTP Request Finalize Canonical Publish');assert.equal(out,0);assert.equal(run,1);return values;};
    const accepted = acknowledge(input,lookup([{json:{body:ack}}]),1).json;assert.equal(accepted.poseNumber,0);assert.equal(accepted.orderId,ack.orderId);assert.equal(accepted.approvedKey,ackKey);
    for(const replies of [[],[{json:{...ack,orderId:'OTHER'}}],[{json:{...ack,success:false}}],[{json:ack},{json:ack}]])assert.throws(()=>acknowledge(input,lookup(replies),1));

  } finally {globalThis.fetch=oldFetch;console.log=log;console.warn=warn;console.error=error;}
  console.log('Workflow authorization: actual native expressions/credentials, canonical2A→Merge→binary/notification, indexed sibling/pose0 runs, genuineAPI404vsstoragefailures, strict denials, bothSW2secret destinations andSW3multipart passed; zero live workflows/providers');
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
