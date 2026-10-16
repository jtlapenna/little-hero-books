import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase-client';
import { getObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { createGelatoSubmissionStore, type GelatoSubmissionStore } from './gelato-submission-store';
import { createGelatoStoredFileVerifier } from './gelato-stored-file';
import type { EngineeringConversionDependencies } from './gelato-engineering-conversion';

const controlNames = ['GELATO_DRAFT_SUBMISSION_ENABLED','GELATO_CANCEL_ENABLED','GELATO_STATUS_RELAY_ENABLED','GELATO_STATUS_POLLING_ENABLED','GELATO_NOTIFICATIONS_ENABLED'];
type Sources = { environment?: Record<string, string | undefined>; database?: SupabaseClient; store?: GelatoSubmissionStore; fetcher?: typeof fetch };
export async function readEngineeringArtifact(load: (signal: AbortSignal) => Promise<Response>, budgetMs=30_000): Promise<Uint8Array> {
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(new Error('Engineering PDF read timed out')),budgetMs);
  let abortHandler: (()=>void)|undefined;
  const aborted=new Promise<never>((_,reject)=>{abortHandler=()=>reject(new Error('Engineering PDF read timed out'));controller.signal.addEventListener('abort',abortHandler,{once:true});});
  let reader: ReadableStreamDefaultReader<Uint8Array>|undefined;
  try {
    const response=await Promise.race([load(controller.signal),aborted]);
    if(!response.ok||!response.body)throw new Error('Engineering PDF lookup failed');
    reader=response.body.getReader();const chunks:Uint8Array[]=[];let length=0;
    for(;;){const next=await Promise.race([reader.read(),aborted]);if(next.done)break;length+=next.value.length;if(length>64_000_000)throw new Error('Engineering PDF exceeds bound');chunks.push(next.value);}
    return Buffer.concat(chunks);
  } catch(error){if(reader)void reader.cancel().catch(()=>undefined);throw error;}
  finally {clearTimeout(timeout);if(abortHandler)controller.signal.removeEventListener('abort',abortHandler);}
}
export function gelatoEngineeringConversionRuntime(sources: Sources = {}): EngineeringConversionDependencies {
  const environment = sources.environment ?? process.env;
  const apiKey = environment.GELATO_API_KEY;
  if (!apiKey?.trim()) throw new Error('Explicit engineering account key is required');
  const database = sources.database ?? supabase;
  const store = sources.store ?? createGelatoSubmissionStore(database);
  const verify = createGelatoStoredFileVerifier({ loadArtifact: (key,signal) => getObject(R2_ORDERS_BUCKET,key,{signal,redirect:'manual',allowErrorResponse:true}) });
  return { apiKey, normalControlsOff: controlNames.every(name => environment[name] === 'false'), fetcher: sources.fetcher,
    transition: (name,params) => store.transition(name,params), context: id => store.load(id),
    closeOwned: async (id,ownerToken) => {
      const {error}=await database.from('gelato_engineering_conversions').update({closed_at:new Date().toISOString()})
        .eq('id',id).eq('owner_token',ownerToken).is('closed_at',null).abortSignal(AbortSignal.timeout(10_000));
      if(error)throw new Error('Engineering owner closure was not confirmed');
      const {data,error:readError}=await database.from('gelato_engineering_conversions').select('closed_at')
        .eq('id',id).eq('owner_token',ownerToken).abortSignal(AbortSignal.timeout(10_000)).maybeSingle();
      if(readError)throw new Error('Engineering closure readback failed');
      return typeof data?.closed_at==='string'&&Number.isFinite(Date.parse(data.closed_at));
    },
    authorization: async id => { const {data,error}=await database.from('gelato_engineering_conversions').select('*').eq('id',id).single();
      if(error||!data)throw new Error('Engineering authorization lookup failed');return data; },
    artifact: key => readEngineeringArtifact(signal=>getObject(R2_ORDERS_BUCKET,key,{signal,redirect:'manual',allowErrorResponse:true})),
    verifyFile: async (reference,url,expected,context) => { const members=context.members.filter(m=>m.item_reference_id===reference);
      return members.length===1&&verify(members[0],url,expected); },
  };
}
