/** Actual authenticated GET and proof verifier; synthetic request-time sources only. */
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {NextRequest} from 'next/server';
import {GET} from '../src/app/api/internal/w4/submit-gelato-draft/route';
import {GELATO_NORMAL_CONTROL_FLAGS,createGelatoRuntimeKeyProof,verifyGelatoRuntimeKeyProof,type GelatoRuntimeSources} from '../src/lib/books/gelato-runtime-key-proof';
const key='SYNTHETIC-effective-gelato-account-123456789',token='SYNTHETIC-backend-auth-only-123456789',challenge='a'.repeat(64);
const globals=globalThis as typeof globalThis&{[key:symbol]:unknown},contextKey=Symbol.for('__cloudflare-context__');
const oldContext=Object.getOwnPropertyDescriptor(globals,contextKey),names=[...GELATO_NORMAL_CONTROL_FLAGS,'GELATO_API_KEY','GELATO_STATUS_API_KEY','BACKEND_API_TOKEN'],saved=new Map(names.map(n=>[n,process.env[n]]));
const oldFetch=globalThis.fetch;let network=0,checks=0;globalThis.fetch=async()=>{network++;throw Error('Network prohibited');};
const fresh=()=>({...Object.fromEntries(GELATO_NORMAL_CONTROL_FLAGS.map(n=>[n,'false'])),GELATO_API_KEY:key,GELATO_STATUS_API_KEY:key});
const sources=():GelatoRuntimeSources=>({cloudflare:fresh(),globalProcess:fresh(),nodeProcess:fresh()});
const context=(env:unknown)=>Object.defineProperty(globals,contextKey,{configurable:true,value:env===undefined?undefined:{env}});
const invoke=async(query='keyChallenge='+challenge,authorized=true)=>{
 const r=await GET(new NextRequest('https://immutable.little-hero-labs-admin.pages.dev/api/internal/w4/submit-gelato-draft'+(query?'?'+query:''),{headers:authorized?{Authorization:'Bearer '+token}:{}}));assert.equal(r.headers.get('cache-control'),'private, no-store');return {status:r.status,body:await r.json()};
};
async function main(){
 try{
  Object.assign(process.env,fresh(),{BACKEND_API_TOKEN:token});context(fresh());
  const unauth=await invoke('keyChallenge=bad',false);assert.equal(unauth.status,401);checks++;
  for(const q of ['keyChallenge=','keyChallenge=bad','keyChallenge='+'A'.repeat(64),'keyChallenge='+challenge+'&keyChallenge='+challenge,'keyChallenge='+challenge+'&orderId=FOREIGN']){assert.equal((await invoke(q)).status,400);checks++;}
  const normal=await invoke('');assert.equal(normal.status,200);assert(!Object.hasOwn(normal.body,'keyAttestation'));checks++;
  const good=await invoke();assert.equal(good.status,200);verifyGelatoRuntimeKeyProof(good.body.keyAttestation,challenge,key);assert(!JSON.stringify(good.body).includes(key));assert(!JSON.stringify(good.body).includes(token));checks++;
  const proof=good.body.keyAttestation;assert.equal(proof.proofs.cloudflare.order,createHmac('sha256',key).update(JSON.stringify(['lhl.gelato-runtime-key-proof@1',challenge,'cloudflare','order'])).digest('hex'));checks++;
  for(const layer of ['cloudflare','globalProcess','nodeProcess'] as const)for(const slot of ['GELATO_API_KEY','GELATO_STATUS_API_KEY'] as const){const s=sources();s[layer][slot]='SYNTHETIC-wrong-account-key-123456789';assert.throws(()=>verifyGelatoRuntimeKeyProof(createGelatoRuntimeKeyProof(challenge,s),challenge,key));checks++;}
  for(const layer of ['cloudflare','globalProcess','nodeProcess'] as const)for(const flag of GELATO_NORMAL_CONTROL_FLAGS){for(const value of ['true',undefined,false,'FALSE']){const s=sources();s[layer][flag]=value;assert.throws(()=>createGelatoRuntimeKeyProof(challenge,s));checks++;}}
  for(const bad of [undefined,null,{}, {...proof,challenge:'b'.repeat(64)}, {...proof,extra:true}, {...proof,proofs:{...proof.proofs,globalProcess:{...proof.proofs.globalProcess,status:proof.proofs.globalProcess.order}}}]){assert.throws(()=>verifyGelatoRuntimeKeyProof(bad,challenge,key));checks++;}
  for(const field of ['GELATO_API_KEY','GELATO_STATUS_API_KEY']){const e=fresh();Reflect.deleteProperty(e,field);context(e);assert.equal((await invoke()).status,503);checks++;}
  context(undefined);assert.equal((await invoke()).status,503);checks++;
  context(fresh());process.env.GELATO_STATUS_API_KEY='SYNTHETIC-wrong-runtime-status-key-123456789';const wrong=await invoke();assert.equal(wrong.status,200);assert.throws(()=>verifyGelatoRuntimeKeyProof(wrong.body.keyAttestation,challenge,key));checks++;
  process.env.GELATO_STATUS_API_KEY=key;process.env.GELATO_NOTIFICATIONS_ENABLED='true';assert.equal((await invoke()).status,503);checks++;
  assert.equal(network,0);console.log(JSON.stringify({checks,actualGetHandler:true,allSixKeySlotsChecked:true,flagsFailClosed:true,externalRequests:0,providerCalls:0,orderReads:0,deployments:0,customerMessages:0}));
 }finally{globalThis.fetch=oldFetch;if(oldContext)Object.defineProperty(globals,contextKey,oldContext);else Reflect.deleteProperty(globals,contextKey);for(const [name,value]of saved){if(value===undefined)delete process.env[name];else process.env[name]=value;}}
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
