/** Local-only definition preparation. No HTTP clients, activation, credential reads or execution. */
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
const Edge=z.object({node:z.string(),type:z.literal('main'),index:z.number().int().nonnegative()}).passthrough();
const Connections=z.record(z.string(),z.object({main:z.array(z.array(Edge))}).passthrough());
const Node=z.object({id:z.string().min(1),name:z.string().min(1),type:z.string(),parameters:z.record(z.string(),z.unknown())}).passthrough();
const Workflow=z.object({name:z.string(),nodes:z.array(Node),connections:Connections,settings:z.record(z.string(),z.unknown())}).passthrough();
const Patch=z.object({schema:z.literal('lhl.w1-native-queue-patch@1'),insertAfter:z.literal('Prep Workflow 4 Orders'),legacyNext:z.literal('Classify W4 Orders'),nodes:z.array(Node).length(10),connections:Connections}).strict();
function canonical(value:unknown):unknown{if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>[k,canonical(v)]));return value;}
export const definitionSha256=(value:unknown)=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export function workflowDefinition(raw:unknown){const w=Workflow.parse(raw);return {name:w.name,nodes:w.nodes,connections:w.connections,settings:w.settings};}
export function prepareW1NativeQueue(raw:unknown,rawPatch:unknown,expectedDefinitionSha256:string){
 const source=Workflow.parse(raw),definition=workflowDefinition(source),patch=Patch.parse(rawPatch);
 if(source.name!=='REPO - w1.1 - Queue Manager and Router'||source.id!=null&&source.id!=='TDwc85g03FqPf9D6')throw Error('Unexpected W1 identity');
 if(!/^[a-f0-9]{64}$/.test(expectedDefinitionSha256)||definitionSha256(definition)!==expectedDefinitionSha256)throw Error('W1 snapshot differs from reviewed definition');
 const names=new Set(source.nodes.map(n=>n.name)),ids=new Set(source.nodes.map(n=>n.id));
 if(names.size!==source.nodes.length||ids.size!==source.nodes.length)throw Error('Ambiguous existing W1 node identity');
 if(source.nodes.some(n=>/scheduleTrigger|\.cron$|\.interval$/.test(n.type)))throw Error('Autonomous workflow requires separate review');
 if(source.nodes.find(n=>n.name===patch.insertAfter)?.type!=='n8n-nodes-base.code'||source.nodes.find(n=>n.name===patch.legacyNext)?.type!=='n8n-nodes-base.code')throw Error('Unexpected legacy W1 entry nodes');
 if(!isDeepStrictEqual(source.connections[patch.insertAfter],{main:[[{node:patch.legacyNext,type:'main',index:0}]]}))throw Error('Legacy entry connection differs');
 if(source.nodes.find(n=>n.name==='Validate Shipping for w4')?.type!=='n8n-nodes-base.if'||
  !isDeepStrictEqual(source.connections[patch.legacyNext],{main:[[{node:'Validate Shipping for w4',type:'main',index:0}]]}))throw Error('Unsupported legacy classifier continuation');
 const classifierInputs=Object.entries(source.connections).flatMap(([from,c])=>c.main.flatMap((output,port)=>output.filter(e=>e.node===patch.legacyNext).map(e=>({from,port,index:e.index}))));
 if(!isDeepStrictEqual(classifierInputs,[{from:patch.insertAfter,port:0,index:0}]))throw Error('Unexpected alternate classifier entry');
 const added=new Set(patch.nodes.map(n=>n.name)),addedIds=new Set(patch.nodes.map(n=>n.id));
 if(added.size!==patch.nodes.length||addedIds.size!==patch.nodes.length||patch.nodes.some(n=>names.has(n.name)||ids.has(n.id)))throw Error('W1 update already present or node identity collision');
 for(const [from,connection] of Object.entries(source.connections)){
  if(!names.has(from)||connection.main.flat().some(e=>!names.has(e.node)))throw Error('Invalid existing W1 graph');
 }
 for(const [from,connection] of Object.entries(patch.connections)){
  if(!added.has(from)||connection.main.flat().some(e=>!added.has(e.node)&&e.node!==patch.legacyNext))throw Error('Patch escapes native/legacy boundary');
 }
 if(Object.keys(patch.connections).length!==patch.nodes.length)throw Error('Patch graph is incomplete');
 const candidate=structuredClone(definition);
 candidate.nodes.push(...structuredClone(patch.nodes));
 candidate.connections[patch.insertAfter]={main:[[{node:'Prepare Native Print Queue',type:'main',index:0}]]};
 Object.assign(candidate.connections,structuredClone(patch.connections));
 for(const n of source.nodes)if(!isDeepStrictEqual(candidate.nodes.find(x=>x.id===n.id),n))throw Error('Existing W1 node changed');
 for(const [name,edges] of Object.entries(source.connections))if(name!==patch.insertAfter&&!isDeepStrictEqual(candidate.connections[name],edges))throw Error('Unrelated W1 connection changed');
 return {schema:'lhl.w1-native-queue-preparation@1',canDeploy:false,sourceDefinitionSha256:expectedDefinitionSha256,
  candidateDefinitionSha256:definitionSha256(candidate),candidate,
  review:{existingNodesPreserved:source.nodes.length,addedNodes:patch.nodes.map(n=>n.name),
   supportedLegacyBoundary:'Prep Workflow 4 Orders → Classify W4 Orders → Validate Shipping for w4',
   existingSettingsAndCredentialsPreserved:true,activationIncluded:false,dynamicStateIncluded:false,
   newCredentialBindings:'Unresolved backend header-auth placeholders; no secrets in patch',
   limitations:['Archived input is not a fresh hosted readback','Requires reviewed backend queue route and separately verified W4/W4.1 targets','No activation, execution, polling registration, conversion, funding or customer messages']}};
}
