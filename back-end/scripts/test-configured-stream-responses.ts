import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {loadBundledBookConfig} from '../src/lib/books/load-book-config';
import {buildW0RunManifestFromConfig} from '../src/lib/books/build-run-manifest';
import {buildW2ABaseInput} from '../src/lib/books/w2a-base-input';
import {buildW2APoseInput} from '../src/lib/books/w2a-pose-input';
import {buildW2BWorklist} from '../src/lib/books/w2b-worklist';
import {resolveW2APoseWorklistResponse} from '../src/app/api/internal/w2a/resolve-pose-worklist/route';
import {buildW2BPoseInput} from '../src/lib/books/w2b-pose-input';
const workflowRoot=path.resolve(__dirname,'../../docs/n8n-workflow-files/repo-centric/workflows');
const targets=[['w2A-Orchestrator.repo-centric.json','Expand to N Poses'],['w2A-SW0-Base_Character_Generation.repo-centric.json','Schema Check + Defaults'],['w2A-SW0-Base_Character_Generation.repo-centric.json','Restore Finalized Base Envelope'],['w2A-SW1-Pose_Generation.repo-centric.json','Schema Check + Defaults1'],['w2B-main-orchestrator.repo-centric.json','Build Worklist'],['w2B-main-orchestrator.repo-centric.json','Merge Result Into 2B Manifest'],['w2B-main-orchestrator.repo-centric.json','Final Summary'],['w2B-sw1-single-pose.repo-centric.json','Build Bria Payload']];
const source=(file:string,name:string)=>JSON.parse(fs.readFileSync(path.join(workflowRoot,file),'utf8')).nodes.find((n:{name:string})=>n.name===name).parameters.jsCode as string;
function block(code:string,name:string){const start=code.indexOf('function '+name+'('),end=code.indexOf('\nfunction ',start+10);assert.ok(start>=0&&end>start,name);return code.slice(start,end);}
function extract(code:string){return new Function('Buffer',[block(code,'asObject'),block(code,'toBufferLike'),block(code,'extractStreamText'),'return extractStreamText;'].join('\n'))(Buffer) as (input:unknown)=>string|null;}
function stream(text:string){const bytes=Buffer.from(text),chunks=[];for(let i=0;i<bytes.length;i+=601)chunks.push(bytes.subarray(i,i+601).toJSON());return {_readableState:{buffer:chunks,bufferIndex:0},_outBuffer:bytes.subarray(Math.max(0,bytes.length-137)).toJSON(),_outOffset:Math.min(137,bytes.length)};}
function node(code:string,payload:unknown,items:Record<string,unknown[]>={},binary:Record<string,unknown>={fixture:{data:'AAAA',mimeType:'image/png'}}){const current={json:payload,binary,pairedItem:{item:2}};return new (Object.getPrototypeOf(async function(){}).constructor)('$input','$json','$binary','$items','$runIndex','$itemIndex','$node','Buffer','$execution','$getWorkflowStaticData','require',code)({first:()=>current,all:()=>[current],item:current},payload,binary,(name:string)=>items[name]??[],0,2,{},Buffer,{customData:{}},()=>({}),createRequire(__filename));}
async function main(){
 const config=loadBundledBookConfig({bookId:'book-finding-our-inner-voice',version:1}),orderId='TEST-STREAM-CANONICAL';
 const characterSpecs={childName:'Zoë ❄',hometown:'Zürich',animalGuide:'owl',pronouns:'they/them',skinTone:'medium',hairStyle:'side-part',hairColor:'medium-brown'};
 const w0=buildW0RunManifestFromConfig(config,{orderId,platform:'d2c',characterHash:'0123456789abcdef',input:{bookSpecs:{testMode:true},characterSpecs}});
 const body={orderId,bookId:config.bookId,formatId:'standard',configVersion:1,renderSnapshot:w0.book.resolved.renderSnapshot,characterHash:'0123456789abcdef',characterSpecs,publicR2Url:'https://assets.example.test',testMode:true};
 const base=await buildW2ABaseInput(body,{loadConfig:async()=>config});const canonical={success:true,...base};const text=JSON.stringify(canonical);
 for(const [file,name]of targets){const decode=extract(source(file,name));assert.equal(decode(stream(text)),text,`${name}:exact chunk assembly`);
  const first=Buffer.from('{"x":"'),middle=Buffer.from('a'),last=Buffer.from('"}');assert.equal(decode({_readableState:{buffer:[first.toJSON(),middle.toJSON(),middle.toJSON(),last.toJSON()]} }),'{"x":"aa"}');
  assert.equal(decode({_readableState:{buffer:[Buffer.from('discard').toJSON(),{data:Buffer.from(text).toJSON(),chunk:Buffer.from('wrong').toJSON()}],bufferIndex:1}}),text);
  assert.equal(decode({_readableState:{buffer:{head:{data:Buffer.from(text).toJSON(),chunk:Buffer.from('duplicate').toJSON(),next:null}}}}),text);
  assert.equal(decode({_outBuffer:Buffer.concat([Buffer.from(text),Buffer.alloc(20)]).toJSON(),_outOffset:Buffer.byteLength(text)}),text);
  assert.equal(decode({}),null);const truncated=decode(stream(text.slice(0,-30)))!;assert.throws(()=>JSON.parse(truncated));
 }
 const prepared=await node(source(targets[0][0],'Prepare Resolve Pose Worklist Body'),{...body,oneManifestUrl:`${config.bookId}/orders/${orderId}/manifests/1-manifest.json`}) as Array<{json:{requestBody:string}}> ;
 const http=JSON.parse(fs.readFileSync(path.join(workflowRoot,targets[0][0]),'utf8')).nodes.find((n:{name:string})=>n.name==='Resolve Pose Worklist').parameters;
 assert.equal(http.contentType,'json');assert.equal(http.specifyBody,'json');assert.equal(http.jsonBody,'={{$json.requestBody}}');
 const newJsonBody=new Function('$json','return ('+http.jsonBody.slice(3,-2)+')')(prepared[0].json);assert.deepEqual(JSON.parse(newJsonBody),JSON.parse(prepared[0].json.requestBody));assert.equal(JSON.parse(newJsonBody).payload.bookId,config.bookId);
 const resolved=await resolveW2APoseWorklistResponse({...body,oneManifestUrl:`${config.bookId}/orders/${orderId}/manifests/1-manifest.json`,includeZeroPose:true},{downloadOneManifest:async()=>w0,instrumentPoseWorkItems:async p=>p.poseWorklist});
 const expandCode=source(targets[0][0],targets[0][1]);
 for(const payload of [resolved,JSON.stringify(resolved),Buffer.from(JSON.stringify(resolved)).toJSON(),stream(JSON.stringify(resolved))]){
  const expanded=await node(expandCode,payload) as Array<{json:Record<string,unknown>}>;assert.deepEqual(expanded.map(e=>e.json.poseNumber),resolved.poseWorklist.map(p=>p.poseNumber));assert.equal(expanded[0].json.bookId,config.bookId);assert.equal(expanded[0].json.characterHash,body.characterHash);assert.deepEqual(expanded[0].json.renderSnapshot,w0.book.resolved.renderSnapshot);assert.equal(expanded[0].json.testMode,true);assert.equal(expanded[0].json.poseWorklist,undefined);
 }
 for(const [file,name]of targets.slice(1,4)){
  const payload=name==='Schema Check + Defaults1'?{success:true,...await buildW2APoseInput({...body,poseNumber:1},{loadConfig:async()=>config})}:canonical;
  const result=await node(source(file,name),stream(JSON.stringify(payload))) as {json:Record<string,unknown>;binary?:unknown;pairedItem?:unknown}|Array<{json:Record<string,unknown>;binary?:unknown;pairedItem?:unknown}>;
  const item=Array.isArray(result)?result[0]:result;assert.equal(item.json.bookId,config.bookId,name);assert.equal(item.json.characterHash,body.characterHash,name);
  if(name==='Schema Check + Defaults'){assert.equal(item.json.baseRefS3Key,base.baseRefS3Key);assert.deepEqual(item.json.renderSnapshot,base.renderSnapshot);}
  if(name==='Schema Check + Defaults1')assert.equal(item.json.poseRefKey,config.rendering.recipe!.poses.arrival.referenceKey);
  if(name==='Restore Finalized Base Envelope'){assert.ok(item.binary);assert.deepEqual(item.pairedItem,{item:2});}
 }
 const generatedBinary={data:Buffer.from('byte-identical-generated-image').toString('base64'),mimeType:'image/png',fileName:'pose01.png'};
 const signedPart={inlineData:{mimeType:'image/png',data:'already-extracted'},thoughtSignature:'synthetic-provider-signature'.repeat(50000)};
 const poseCanonical=await buildW2APoseInput({...body,poseNumber:1},{loadConfig:async()=>config});
 const inflated={...poseCanonical,candidates:[{content:{parts:[signedPart]}}],workflowLogEvent:{nested:{candidates:[{content:{parts:[signedPart]}}]}}};
 const extracted=await node(source('w2A-SW1-Pose_Generation.repo-centric.json','Extract Generated Image'),inflated,{}, {generated:generatedBinary}) as {json:Record<string,unknown>;binary:{generated:{data:string}}};
 assert.equal(extracted.binary.generated.data,generatedBinary.data);assert.equal(extracted.json.bookId,config.bookId);assert.deepEqual(extracted.json.renderSnapshot,w0.book.resolved.renderSnapshot);assert.equal(extracted.json.uploadKey,poseCanonical.uploadKey);assert.ok(!JSON.stringify(extracted.json).includes('synthetic-provider-signature'));assert.ok(Buffer.byteLength(JSON.stringify(extracted.json))<150000);assert.ok(Buffer.byteLength(JSON.stringify(inflated))>2500000);
 const twoA={schema:'lhb.run-manifest@v2.0',order:{orderId,bookId:config.bookId,characterHash:body.characterHash},characterHash:body.characterHash,entries:Object.values(config.rendering.recipe!.poses).map(p=>({poseNumber:p.poseNumber,approved:true,status:'approved',approvedKey:p.referenceKey}))};
 const worklist=await buildW2BWorklist({...body,manifest2aUrl:`${config.bookId}/orders/${orderId}/manifests/2a-manifest.json`},{loadManifest:async key=>key.endsWith('1-manifest.json')?w0:key.endsWith('2a-manifest.json')?twoA:null});
 const workResult=await node(source(targets[4][0],targets[4][1]),stream(JSON.stringify({success:true,...worklist}))) as Array<{json:Record<string,unknown>}>;assert.equal(workResult.length,worklist.workItems.length);assert.equal(workResult[0].json.orderId,orderId);
 const batchWorkflow=JSON.parse(fs.readFileSync(path.join(workflowRoot,targets[4][0]),'utf8'));
 const batch=batchWorkflow.nodes.find((n:{name:string})=>n.name==='Split In Batches');
 assert.equal(batch.typeVersion,3);assert.equal(batch.parameters.batchSize,1);
 assert.deepEqual(batchWorkflow.connections['Split In Batches'].main.map((links:Array<{node:string}>)=>links.map(link=>link.node)),[['Final Summary'],['Execute Workflow: s2B-sw']]);
 assert.equal(workResult.length,13);
 if(process.env.LHL_N8N_BATCH_SOURCE){
  const ts=createRequire(__filename)('typescript');
  const upstream=fs.readFileSync(process.env.LHL_N8N_BATCH_SOURCE,'utf8');
  const compiled=ts.transpileModule(upstream,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports:Record<string,new()=>{execute:(this:unknown)=>Promise<Array<Array<{json:Record<string,unknown>}>>>}>={};
  new Function('exports','require',compiled)(exports,(name:string)=>{assert.equal(name,'n8n-workflow');return {NodeConnectionTypes:{Main:'main'},deepCopy:structuredClone};});
  const execute=new exports.SplitInBatchesV3().execute;
  const context:Record<string,unknown>={};let input=structuredClone(workResult);const processed:unknown[]=[];
  const host={getInputData:()=>input,getContext:()=>context,getNodeParameter:(name:string)=>name==='batchSize'?batch.parameters.batchSize:{},getInputSourceData:()=>({main:[{previousNode:'Build Worklist'}]})};
  for(let run=0;run<=13;run++){
   const [done,loop]=await execute.call(host);
   if(run===13){assert.equal(loop.length,0);assert.equal(done.length,13);assert.equal(context.done,true);}
   else {assert.equal(done.length,0);assert.equal(loop.length,1);processed.push(loop[0].json.poseNumber);input=loop;}
  }
  assert.deepEqual(processed,workResult.map(item=>item.json.poseNumber));assert.equal(new Set(processed).size,13);assert.equal(context.maxRunIndex,13);
  console.log('Actual upstream v3 execute processed canonical13 exactly once through Loop and Done');
 }
 const incoming={orderId,characterHash:body.characterHash,poseNumber:1,briaStatus:'completed',approvedKey:twoA.entries[0].approvedKey,bgRemovedKey:'fixture/pose.png'};
 const merge=await node(source(targets[5][0],targets[5][1]),{}, {'Normalize Result':[{json:{...body,result:incoming,manifest2bKey:'fixture/2b.json'}}],'Download 2A Manifest (for merge)':[{json:stream(JSON.stringify(twoA))}],'Download 2B Manifest (if exists)':[{json:stream(JSON.stringify({...twoA,stage:'2b'}))}]}) as Array<{json:{manifest2b:typeof twoA;orderId:string}}> ;
 assert.equal(merge[0].json.orderId,orderId);assert.equal((merge[0].json.manifest2b.entries.find(e=>e.poseNumber===1) as unknown as {briaStatus:string}).briaStatus,'completed');
 const summary=await node(source(targets[6][0],targets[6][1]),{}, {'Normalize 2B Input':[{json:stream(JSON.stringify(worklist))}]}) as Array<{json:Record<string,unknown>}>;assert.equal(summary[0].json.orderId,orderId);
 const poseInput=buildW2BPoseInput({...body,...worklist.workItems[0]});const bria=await node(source(targets[7][0],targets[7][1]),stream(JSON.stringify({success:true,...poseInput}))) as Array<{json:Record<string,unknown>}>;assert.equal(bria[0].json.approvedKey,poseInput.approvedKey);assert.deepEqual((bria[0].json.bria as {payload:unknown}).payload,poseInput.briaPayload);
 const pollWorkflow=JSON.parse(fs.readFileSync(path.join(workflowRoot,targets[7][0]),'utf8'));
 const poll=pollWorkflow.nodes.find((n:{name:string})=>n.name==='Bria Poll');
 assert.equal(poll.parameters.method??'GET','GET');assert.notEqual(poll.parameters.options?.response?.response?.neverError,true);
 assert.equal(poll.retryOnFail,true);assert.equal(poll.maxTries,3);assert.equal(poll.waitBetweenTries,5000);
 console.log('Eight exported stream helpers and canonical generation/normalization adapters passed');
}
main().catch(e=>{console.error(e);process.exitCode=1});
