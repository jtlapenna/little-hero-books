/** Actual pinned upstream auth selection/injection against synthetic keys; no services. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {protectedRunnerFixture} from './helpers/gelato-protected-runner-fixture';
import {verifyBearerAuth} from '../src/lib/auth';
const originalFetch=globalThis.fetch;let external=0;globalThis.fetch=async()=>{external++;throw Error('External transport forbidden');};
const root=path.resolve(__dirname,'../..'),snapshot=JSON.parse(readFileSync(path.join(__dirname,'fixtures/n8n-http-auth-upstream.json'),'utf8'));
const compile=(s:string)=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports:Record<string,unknown>={};vm.runInNewContext(compile(snapshot.multipleHeadersCredential),{exports},{timeout:1000});
const Auth=exports.HttpMultipleHeadersAuth as new()=>{authenticate:(data:unknown,options:unknown)=>Promise<unknown>};const auth=new Auth();
const sandbox={exports:{} as Record<string,unknown>,getAllowedDomains:()=>undefined};
vm.runInNewContext(compile(`async function select(authentication,itemIndex){let genericCredentialType,nodeCredentialType,httpBasicAuth,httpBearerAuth,httpDigestAuth,httpHeaderAuth,httpQueryAuth,httpCustomAuth,httpTemplatedCustomAuth,oAuth1Api,oAuth2Api,allowedDomains;${snapshot.selectCredential};return {httpHeaderAuth,nodeCredentialType};} exports.select=select;`),sandbox,{timeout:1000});
const select=sandbox.exports.select as (this:unknown,a:unknown,i:number)=>Promise<{httpHeaderAuth?:{name:string;value:string};nodeCredentialType?:string}>;
const dispatchBox={exports:{} as Record<string,unknown>,getOAuth2AdditionalParameters:()=>undefined};
vm.runInNewContext(compile(`async function dispatch(authentication,nodeCredentialType,requestOptions){let oAuth1Api,oAuth2Api;const itemIndex=0,requestPromises=[];${snapshot.dispatchRequest};return Promise.all(requestPromises);} exports.dispatch=dispatch;`),dispatchBox,{timeout:1000});
const dispatch=dispatchBox.exports.dispatch as (this:unknown,a:unknown,type:unknown,options:unknown)=>Promise<Array<{headers:Record<string,string>}>>;
const backend='SYNTHETIC-backend-authority-1234567890',scope='SYNTHETIC-scope-authority-1234567890',intake='SYNTHETIC-intake-authority-1234567890';let checks=0;
async function outbound(n:Record<string,unknown>){
 const params=n.parameters as Record<string,unknown>,refs=n.credentials as Record<string,unknown>;let selected=0,injected=0;
 const context={getNodeParameter:(name:string)=>params[name],getNode:()=>n,getCredentials:async(type:string)=>{selected++;assert(refs[type]);if(type==='httpHeaderAuth')return {name:'Authorization',value:'Bearer '+backend};assert.equal(type,'httpMultipleHeadersAuth');return {headers:{values:[{name:'Authorization',value:'Bearer '+backend},{name:'x-lhl-engineering-token',value:scope}]}};},helpers:{request:(options:unknown)=>Promise.resolve(options),requestWithAuthentication:async function(type:string,options:unknown){injected++;assert.equal(type,'httpMultipleHeadersAuth');return auth.authenticate(await context.getCredentials(type),options);}}};
 const a=await select.call(context,params.authentication,0),options={headers:{'Content-Type':'application/json'}};
 if(a.httpHeaderAuth)Object.assign(options.headers,{[a.httpHeaderAuth.name]:a.httpHeaderAuth.value});
 const [r]=await dispatch.call(context,params.authentication,a.nodeCredentialType,options);return {r,selected,injected};
}
async function main(){
 const saved=process.env.BACKEND_API_TOKEN;process.env.BACKEND_API_TOKEN=backend;
 try{
  const fixture=protectedRunnerFixture();
  for(const stage of ['queue','timer'] as const){
   const n=fixture.flows[stage].nodes.find((v:{type:string})=>v.type.endsWith('.httpRequest'));assert(n);
   assert.equal(n.parameters.authentication,'predefinedCredentialType');assert.equal(n.parameters.nodeCredentialType,'httpMultipleHeadersAuth');assert(!Object.hasOwn(n.parameters,'genericAuthType'));
   const {r,injected}=await outbound(n);assert.equal(injected,1);assert.equal(r.headers.Authorization,'Bearer '+backend);assert.equal(r.headers['x-lhl-engineering-token'],scope);assert.equal(r.headers['Content-Type'],'application/json');assert(verifyBearerAuth(new Request('https://fixture.example.test',{headers:r.headers})).ok);checks++;
   const legacy=structuredClone(n);legacy.parameters.authentication='genericCredentialType';legacy.parameters.genericAuthType='httpMultipleHeadersAuth';delete legacy.parameters.nodeCredentialType;
   const broken=await outbound(legacy);assert.equal(broken.injected,0);assert(!broken.r.headers.Authorization&&!broken.r.headers['x-lhl-engineering-token']);assert(!verifyBearerAuth(new Request('https://fixture.example.test',{headers:broken.r.headers})).ok);checks++;
  }
  for(const stage of ['assembly','draft'] as const)for(const n of fixture.flows[stage].nodes.filter((v:{type:string})=>v.type.endsWith('.httpRequest'))){const {r,injected}=await outbound(n);assert.equal(injected,0);assert.equal(r.headers.Authorization,'Bearer '+backend);assert(!r.headers['x-lhl-engineering-token']);checks++;}
  const probes=JSON.parse(readFileSync(path.join(root,'docs/repo-workflows-planning/gelato-auth-attestation-evidence-2026-10-22/probe-candidates.json'),'utf8'));
  for(const p of probes.candidates){const n=p.workflow.nodes.find((v:{type:string})=>v.type.endsWith('.httpRequest'));assert.equal(n.parameters.method,'GET');const {r}=await outbound(n);assert.equal(r.headers.Authorization,'Bearer '+backend);assert.equal(r.headers['x-lhl-engineering-token'],p.credentialPart==='scope-header'?scope:undefined);assert(n.retryOnFail===false&&n.parameters.options.redirect.redirect.followRedirects===false);checks++;}
  const options={headers:{'Content-Type':'application/json'}};await auth.authenticate({headers:{values:[{name:'x-lhl-isolated-intake',value:intake}]}},options);assert.deepEqual(options,{headers:{'Content-Type':'application/json'}});checks++;
  assert.equal(external,0);console.log(JSON.stringify({checks,upstreamAuthExcerptsExecuted:true,legacyModeReproducedWithoutHeaders:true,bothScopedHeadersApplied:true,backendOnlyPreserved:true,externalRequests:0,hostedCalls:0,credentialFilesRead:0,limits:['Pinned upstream excerpts, not a hosted n8n execution or proof of installed engine version']}));
 }finally{if(saved===undefined)delete process.env.BACKEND_API_TOKEN;else process.env.BACKEND_API_TOKEN=saved;}
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{globalThis.fetch=originalFetch;});
