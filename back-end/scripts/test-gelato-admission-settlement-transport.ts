/** Transport boundary regressions; synthetic injected fetch only, no HTTP or private input. */
import assert from 'node:assert/strict';
import {protectedRunnerFixture,fixtureServices} from './helpers/gelato-protected-runner-fixture';
import {definitionSha256} from './helpers/prepare-w1-native-queue';
import type {Launch} from './helpers/gelato-protected-launch-context';
import {createSetupCleanup,settlementIdentity} from './helpers/gelato-setup-cleanup';
async function main(){let groups=0;
 for(const mode of (['normal','rotated-no-access-pair','redirect','huge-known-length','aborted-fetch'] as const).filter(mode=>!process.argv[2]||mode===process.argv[2])){
  const f=protectedRunnerFixture(),service=fixtureServices(f),p=f.binding.packet;
  const c:Launch={schema:'lhl.protected-launch@1',binding:f.binding,bindingSha256:definitionSha256(f.binding),credentials:{...f.credentials},journalRoot:'/synthetic-local-only',transport:{kind:'synthetic-loopback',origin:'http://127.0.0.1:11111'},approval:{packetSha256:definitionSha256(p),workflowSha256:definitionSha256(Object.fromEntries(Object.entries(f.binding.workflowBindings).map(([k,w])=>[k,w.definitionSha256]))),sourceSha:p.sourceSha,maximumSpendCents:0,draftOnly:true,customerMessages:false}};
  if(mode==='rotated-no-access-pair'){delete c.credentials.diagnosticAccessClientId;delete c.credentials.diagnosticAccessClientSecret;c.credentials.gelato='SYNTHETIC-ROTATED-GELATO-NOT-USED';}
  const id=settlementIdentity(c);let persisted=false,cancelled=0;const methods:string[]=[];
  const response=(v:unknown,status=200)=>Response.json(v,{status});
  const fetcher:typeof fetch=async(input,init)=>{
   const url=new URL(String(input));assert.equal(init?.redirect,'manual');assert.equal((init?.headers as Record<string,string>)['X-LHL-Setup-Settlement'],'1');methods.push(String(init?.method)+' '+url.pathname);
   let r:Response;
   if(url.pathname.endsWith('/rpc/revoke_gelato_admission')){
    assert.deepEqual(JSON.parse(String(init?.body)),id);if(mode==='aborted-fetch')throw new DOMException('Synthetic abort','AbortError');persisted=true;
    r=response({revoked:true,scopeId:p.scopeId,rootOrderId:p.rootOrderId,scopePresent:false,parentPresent:false,scopeClosed:true,parentClosed:true,registrationDisabled:true,leaseCleared:true,customerMessages:false});
   }else if(url.pathname.endsWith('/gelato_admission_revocations'))r=response(persisted?[{scope_id:p.scopeId,root_order_id:p.rootOrderId,token_sha256:id.p_token_sha256,account_key_sha256:p.accountKeySha256,fixture_manifest_sha256:p.fixtureManifestSha256,child_order_ids:id.p_child_order_ids,revoked_at:new Date().toISOString()}]:[]);
   else if(url.pathname.endsWith('/gelato_isolation_scopes')||url.pathname.endsWith('/gelato_engineering_submission_windows'))r=response([]);
   else r=await service.fetcher(input,init);
   if(mode==='redirect'&&methods.length===1){return new Response(new ReadableStream({cancel(){cancelled++;}}),{status:302,headers:{location:'https://foreign.example.test/'}});}
   if(mode==='huge-known-length'&&methods.length<=9){const v=await r.json();const base=JSON.stringify({...v,syntheticPadding:''});const raw=JSON.stringify({...v,syntheticPadding:'x'.repeat(1_999_000-Buffer.byteLength(base))});r=new Response(new ReadableStream({start(controller){controller.enqueue(Buffer.from(raw));controller.close();},cancel(){cancelled++;}}),{headers:{'content-type':'application/json','content-length':String(Buffer.byteLength(raw))}});}
   return r;
  };
  const adapter=createSetupCleanup(c,fetcher);
  if(mode==='normal'||mode==='rotated-no-access-pair'){const result=await adapter.cleanup();assert.equal(result.confirmed,true);assert.equal(result.calls,15);}
  else{await assert.rejects(adapter.cleanup());if(mode==='redirect')assert.equal(cancelled,1,'Rejected redirect body must be cancelled');if(mode==='huge-known-length'){assert(adapter.counters().bytes>=15000000,'Exercise cumulative limit, not merely per-response refusal');assert(adapter.counters().bytes<=16000000,'Cannot continue reading/dispatching beyond cumulative budget');assert(cancelled>0,'Oversized remaining response must be cancelled before body consumption');}}
  assert(adapter.counters().calls<=24);assert(!methods.some(v=>/gelatoapis|\/activate|\/orders\/list/.test(v)));groups++;console.log('PASS '+mode);
 }
 console.log(JSON.stringify({passed:true,groups,hostedOrHttpCalls:0,syntheticFetchOnly:true}));
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
