import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {runEngineeringConversion,type EngineeringConversionDependencies} from '../src/lib/books/gelato-engineering-conversion';
async function main(){
 let closed=false,state='ready';let reached!:()=>void,release!:()=>void;
 const ready=new Promise<void>(r=>{reached=r;}),gate=new Promise<void>(r=>{release=r;});
 const id='33333333-3333-4333-8333-333333333333',owner='44444444-4444-4444-8444-444444444444';
 const d:EngineeringConversionDependencies={apiKey:'synthetic-race-key',normalControlsOff:true,
  authorization:async()=>{throw Error('unused');},artifact:async()=>{throw Error('No artifact read expected');},verifyFile:async()=>false,
  context:async()=>{reached();await gate;throw Error('Synthetic preflight stop after race');},
  closeOwned:async(a:string,token:string)=>{assert.equal(a,id);assert.equal(token,owner);closed=true;return true;},
  transition:async(name)=>{if(name==='begin_gelato_engineering_conversion'){assert.equal(state,'ready','Already owned');state='preparing';return{id,submission_id:'11111111-1111-4111-8111-111111111111',provider_root_id:'synthetic-root',account_key_sha256:createHash('sha256').update('synthetic-race-key').digest('hex'),owner_token:owner,state,closed_at:null,expires_at:'2026-10-16T12:15:00Z',artifacts:[{child_order_id:1,artifact_key:'synthetic.pdf',provider_item_id:'item',sha256:'a'.repeat(64)}]};}if(name==='finish_gelato_engineering_conversion'){state='preflight_failed';return null;}assert.equal(name,'close_gelato_engineering_conversion');closed=true;return null;},
  fetcher:async()=>{throw Error('No provider call expected');}};
 const winner=runEngineeringConversion(id,'convert',d);await ready;
 try{await assert.rejects(runEngineeringConversion(id,'convert',d));assert.equal(closed,false,'Losing conversion must not close the winning owner');}
 finally{release();await winner;}
 assert(closed);console.log('Application concurrency probe: loser preserves winner; owner closes after preflight, zero provider calls.');
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
