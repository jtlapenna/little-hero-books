import assert from 'node:assert/strict';
import { updatedTestBookFixture } from './updated-test-book-fixture';
import { updatedTestCopyResponse } from '../src/lib/books/updated-test-book-copy-http';
import { managedAdminFixture } from './helpers/managed-admin-fixture';
import { requireAdminAuth } from '../src/lib/admin-auth';

async function main(){

 const f=updatedTestBookFixture(),origin='https://fixture.example.test',context={params:Promise.resolve({orderId:f.sourceId})};
 Object.assign(process.env,{SUPABASE_URL:'https://copy-auth.example.test',ADMIN_SITE_ORIGIN:origin,ADMIN_ALLOWED_EMAILS:f.actor});
 // Postgres timestamp-without-time-zone is an opaque exact revision fence.
 f.source.updated_at=f.date.replace(/Z$/, '');
 const managed=await managedAdminFixture([f.actor]);
 globalThis.fetch=async(input,init)=>{const reply=managed.response(new Request(input,init));if(reply)return reply;throw Error('API fixture forbids live network');};
 const deps={ports:f.ports,authorize:requireAdminAuth};
 const request=(body:unknown,headers:Record<string,string>={})=>new Request(origin+'/api/admin/orders/'+f.sourceId+'/updated-test-copy',{method:'POST',headers:{origin,cookie:managed.cookie(f.actor),'content-type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
 const get=await updatedTestCopyResponse(new Request(origin+'/api/admin/orders/'+f.sourceId+'/updated-test-copy',{headers:{cookie:managed.cookie(f.actor)}}),context,deps);assert.equal(get.status,200);assert.match(get.headers.get('cache-control')??'',/no-store/);const view=await get.json();assert.equal(f.writes,0);
 const body={expectedUpdatedAt:view.updatedAt,configChecksum:view.configChecksum,dedicationText:'Luca, we love you!'};
 for(const [req,status]of [[request({...body,characterHash:'forged'}),400],[request('{'),400],[request('x'.repeat(4097)),413],[request(body,{origin:'https://other.example.test'}),403],[request({...body,configChecksum:'0'.repeat(64)}),409]] as const){const result=await updatedTestCopyResponse(req,context,deps);assert.equal(result.status,status,await result.text());assert.equal(f.writes,0);}
 const original=f.ports.loadOrder;let reads=0;f.ports.loadOrder=async id=>{reads++;return original(id);};
 const denied=await updatedTestCopyResponse(request(body,{cookie:''}),context,deps);assert.equal(denied.status,401);assert.equal(reads,0);
 const token=process.env.BACKEND_API_TOKEN;process.env.BACKEND_API_TOKEN='synthetic-copy-machine-token-at-least-thirty-two-bytes';
 try{const deniedMachine=await updatedTestCopyResponse(request(body,{authorization:'Bearer '+process.env.BACKEND_API_TOKEN}),context,{...deps,authorize:requireAdminAuth});assert.equal(deniedMachine.status,403);assert.equal(reads,0);}finally{if(token==null)delete process.env.BACKEND_API_TOKEN;else process.env.BACKEND_API_TOKEN=token;}
 const response=await updatedTestCopyResponse(request(body),context,deps);assert.equal(response.status,200,await response.clone().text());const target=await response.json();assert.equal(target.canAssemble,true);assert.equal(f.rows.size,2);assert.equal(f.rows.get(target.orderId)?.next_workflow,null);assert.equal(f.source.next_workflow,'4');
 const repeat=await updatedTestCopyResponse(request(body),context,deps);assert.equal(repeat.status,200);assert.equal((await repeat.json()).orderId,target.orderId);assert.equal(f.rows.size,2);
 console.log(JSON.stringify({passed:true,actualHttpService:true,strictBody:true,humanOnly:true,originalUnchanged:true,automaticQueueCalls:0,networkCalls:0}));
}
main().catch(error=>{console.error(error);process.exitCode=1});
