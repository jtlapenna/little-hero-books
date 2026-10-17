import {supabase} from '@/lib/supabase-client';
import {gelatoEngineeringConversionRuntime} from './gelato-engineering-conversion-runtime';
import {gelatoLifecycleRuntime} from './gelato-lifecycle-runtime';
import {getGelatoOrder} from './gelato-api-client';
import type {EngineeringAutomationDependencies} from './gelato-engineering-automation';

const flags=['GELATO_DRAFT_SUBMISSION_ENABLED','GELATO_CANCEL_ENABLED','GELATO_STATUS_RELAY_ENABLED','GELATO_STATUS_POLLING_ENABLED','GELATO_NOTIFICATIONS_ENABLED','GELATO_SCHEDULED_STATUS_ENABLED'];
export function gelatoEngineeringAutomationRuntime():EngineeringAutomationDependencies {
 return {
  conversion:gelatoEngineeringConversionRuntime(),
  controlsOff:async(signal)=>{
   if(!flags.every(name=>process.env[name]==='false'))return false;
   const {data,error}=await supabase.from('print_provider_dispatch_gates').select('enabled').eq('provider','gelato').abortSignal(signal??AbortSignal.timeout(30_000)).single();
   return !error&&data?.enabled===false;
  },
  authorizations:async(ids,signal)=>{
   const {data,error}=await supabase.from('gelato_engineering_conversions').select('*').in('id',ids).abortSignal(signal??AbortSignal.timeout(30_000));
   if(error||!data)throw Error('Engineering cohort lookup failed');return data;
  },
  loadOrder:async(key,signal)=>{
   const {data,error}=await supabase.from('orders').select('*').eq('orderId',key).abortSignal(signal??AbortSignal.timeout(30_000)).maybeSingle();
   if(error)throw Error('Exact engineering order lookup failed');return data;
  },
  lifecycle:(signal,apiKey,providerIds)=>({...gelatoLifecycleRuntime(signal),get:id=>{
   if(!providerIds.has(id))throw Error('Unbound provider request');
   return getGelatoOrder(id,{apiKey,signal,fetcher:(input,init)=>fetch(input,{...init,redirect:'manual'})});
  }}),
 };
}
