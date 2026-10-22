/** Order-free, nonce-bound proof of effective request-time keys. No environment or I/O loader. */
import {createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
export const GELATO_NORMAL_CONTROL_FLAGS=['GELATO_DRAFT_SUBMISSION_ENABLED','GELATO_CANCEL_ENABLED','GELATO_STATUS_RELAY_ENABLED','GELATO_STATUS_POLLING_ENABLED','GELATO_SCHEDULED_STATUS_ENABLED','GELATO_NOTIFICATIONS_ENABLED'] as const;
export const GelatoKeyChallenge=z.string().regex(/^[a-f0-9]{64}$/);
const digest=z.string().regex(/^[a-f0-9]{64}$/);
const roles={order:'GELATO_API_KEY',status:'GELATO_STATUS_API_KEY'} as const;
const layers=['cloudflare','globalProcess','nodeProcess'] as const;
export type GelatoRuntimeSources=Record<typeof layers[number],Record<string,unknown>>;
const pair=z.object({order:digest,status:digest}).strict();
const Proof=z.object({schema:z.literal('lhl.gelato-runtime-key-proof@1'),challenge:GelatoKeyChallenge,
 proofs:z.object({cloudflare:pair,globalProcess:pair,nodeProcess:pair}).strict()}).strict();
const sign=(key:string,challenge:string,layer:string,role:string)=>createHmac('sha256',key).update(JSON.stringify(['lhl.gelato-runtime-key-proof@1',challenge,layer,role])).digest('hex');
export function createGelatoRuntimeKeyProof(rawChallenge:unknown,sources:GelatoRuntimeSources){
 const challenge=GelatoKeyChallenge.parse(rawChallenge);
 const proofs=Object.fromEntries(layers.map(layer=>{
  const env=sources[layer];
  if(GELATO_NORMAL_CONTROL_FLAGS.some(flag=>env[flag]!=='false'))throw Error('Runtime key proof unavailable');
  return [layer,Object.fromEntries(Object.entries(roles).map(([role,name])=>{
   const key=env[name];if(typeof key!=='string'||key.trim().length<16)throw Error('Runtime key proof unavailable');
   return [role,sign(key,challenge,layer,role)];
  }))];
 }));
 return Proof.parse({schema:'lhl.gelato-runtime-key-proof@1',challenge,proofs});
}
export function verifyGelatoRuntimeKeyProof(raw:unknown,rawChallenge:unknown,key:string){
 const challenge=GelatoKeyChallenge.parse(rawChallenge),proof=Proof.parse(raw);
 if(typeof key!=='string'||key.trim().length<16||proof.challenge!==challenge)throw Error('Effective account/status binding unverified');
 for(const layer of layers)for(const role of Object.keys(roles) as Array<keyof typeof roles>){
  const expected=Buffer.from(sign(key,challenge,layer,role),'hex'),observed=Buffer.from(proof.proofs[layer][role],'hex');
  if(!timingSafeEqual(expected,observed))throw Error('Effective account/status binding unverified');
 }
}
