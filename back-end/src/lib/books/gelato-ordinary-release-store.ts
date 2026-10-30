/** Explicit database injection only. This module does not issue approvals from HTTP or enable a control. */
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AnyOrdinaryReleasePermitSchema, ordinaryReleaseDigest, observeOrdinaryRelease, type OrdinaryReleaseDependencies, type OrdinaryReleaseStore } from './gelato-ordinary-release-core';
import { GelatoProviderOrderSchema } from './gelato-provider-snapshot';
const Owner = z.object({kind:z.literal('acquired'),permit:AnyOrdinaryReleasePermitSchema,ownerToken:z.string().uuid()}).strict();
const Held = z.object({kind:z.enum(['busy','already_attempted','disabled'])}).strict();
const Observing = z.object({kind:z.literal('observe'),permit:AnyOrdinaryReleasePermitSchema,ownerToken:z.string().uuid()}).strict();
async function rpc(database:SupabaseClient,name:string,parameters:Record<string,unknown>,signal?:AbortSignal){
 const {data,error}=await database.rpc(name,parameters).abortSignal(signal??AbortSignal.timeout(5000));
 if(error)throw Error('Ordinary release persistence was not confirmed');return data as unknown;
}
export function createOrdinaryReleaseStore(database:SupabaseClient):OrdinaryReleaseStore {
 return {
  async acquire(id,accountSha256){return z.union([Owner,Held]).parse(await rpc(database,'acquire_gelato_ordinary_release',{p_id:id,p_account_sha256:accountSha256}));},
  async authorizeSend(id,ownerToken,packetSha256){return z.boolean().parse(await rpc(database,'authorize_gelato_ordinary_release',{p_id:id,p_token:ownerToken,p_packet_sha256:packetSha256}));},
  async finish(id,ownerToken,outcome,orders){return z.boolean().parse(await rpc(database,'finish_gelato_ordinary_release',{p_id:id,p_token:ownerToken,p_outcome:outcome,p_orders:orders?z.array(GelatoProviderOrderSchema).parse(orders):null}));},
 };
}
/** Trusted operator boundary, not an approval API. Only invoke AFTER specific recorded approval. */
export async function registerReviewedOrdinaryRelease(database:SupabaseClient,input:{permit:unknown;packet:unknown;actor:string;approvalEvidenceSha256:string}){
 const permit=AnyOrdinaryReleasePermitSchema.parse(input.permit);
 if(ordinaryReleaseDigest(input.packet)!==permit.packetSha256)throw Error('Reviewed ordinary packet differs');
 z.string().trim().min(1).max(200).parse(input.actor);z.string().regex(/^[a-f0-9]{64}$/).parse(input.approvalEvidenceSha256);
 const id=z.string().uuid().parse(await rpc(database,'register_gelato_ordinary_release',{p_permit:permit,p_packet:input.packet,p_actor:input.actor,p_evidence_sha256:input.approvalEvidenceSha256}));
 if(id!==permit.id)throw Error('Registered ordinary permit differs');return id;
}
export async function reapExpiredOrdinaryRelease(database:SupabaseClient,id:string){
 return z.boolean().parse(await rpc(database,'reap_gelato_ordinary_release',{p_id:z.string().uuid().parse(id)}));
}
/** May observe with release controls OFF. Never authorizes, patches, cancels, funds or sends messages. */
export async function reconcileStoredOrdinaryRelease(database:SupabaseClient,id:string,d:OrdinaryReleaseDependencies){
 z.string().uuid().parse(id);
 if(!d.apiKey.trim())throw Error('Explicit observation account missing');
 const {createHash}=await import('node:crypto');
 const budget=z.number().finite().int().min(1).max(30000).parse(d.budgetMs??30000);
 const claim=z.union([Observing,z.object({kind:z.enum(['busy','closed'])}).strict()]).parse(await rpc(database,'begin_gelato_ordinary_observation',{p_id:id,p_account_sha256:createHash('sha256').update(d.apiKey).digest('hex')}));
 if(claim.kind!=='observe')return {state:claim.kind,persistenceConfirmed:false};
 const timer=new AbortController(),watchdog=setTimeout(()=>timer.abort(),budget);
 try{
  const observation=await observeOrdinaryRelease(claim.permit,d,timer.signal);
  const state=observation.converted?'converted':'outcome_unknown';
  const persistenceConfirmed=z.boolean().parse(await rpc(database,'finish_gelato_ordinary_release',{p_id:id,p_token:claim.ownerToken,p_outcome:state,p_orders:observation.orders}));
  return {state,persistenceConfirmed};
 }catch{
  const persistenceConfirmed=await rpc(database,'finish_gelato_ordinary_release',{p_id:id,p_token:claim.ownerToken,p_outcome:'outcome_unknown',p_orders:null}).then(value=>value===true).catch(()=>false);
  return {state:'outcome_unknown',persistenceConfirmed};
 }finally{clearTimeout(watchdog);}
}
