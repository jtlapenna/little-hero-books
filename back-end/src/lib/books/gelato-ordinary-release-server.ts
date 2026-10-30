/** Request-time server wiring. Imported lazily behind the OFF installation gate. */
import {z} from 'zod';
import {createHash} from 'node:crypto';
import {composeOrdinaryReleaseServiceRuntime,type OrdinaryReleaseServiceSources} from './gelato-ordinary-release-service';
import {ESTIMATE_TEST_PRINT_POLICY} from './gelato-release-estimate';
import type {OrdinaryReleaseRuntime} from './gelato-ordinary-release-application';

type Services=Pick<OrdinaryReleaseServiceSources,'database'|'loadArtifact'|'fetcher'>;
export interface EstimateServerPorts {
 readEnvironment:()=>Promise<Record<string,unknown>>;
 loadServices:()=>Promise<Services>;
 now?:()=>Date;
}
export async function ordinaryEstimateServerRuntime(ports:EstimateServerPorts):Promise<OrdinaryReleaseRuntime>{
 const env=await ports.readEnvironment();
 if(env.GELATO_ORDINARY_RELEASE_ENABLED!=='true')return {kind:'blocked',blockers:['ordinary_release_disabled']};
 const account=z.string().regex(/^[a-f0-9]{64}$/).parse(env.GELATO_ORDINARY_RELEASE_ACCOUNT_SHA256);
 const emails=z.string().min(1).max(2000).parse(env.GELATO_ORDINARY_RELEASE_APPROVERS).split(',').map(v=>v.trim().toLowerCase());
 if(!emails.length||emails.length>10||emails.some(v=>!z.email().safeParse(v).success))throw Error('print_release_approvers_invalid');
 const apiKey=z.string().trim().min(1).parse(env.GELATO_API_KEY);
 if(createHash('sha256').update(apiKey).digest('hex')!==account)throw Error('release_service_account_mismatch');
 const services=await ports.loadServices();
 return composeOrdinaryReleaseServiceRuntime({...services,apiKey,expectedAccountSha256:account,approvers:new Set(emails),
  pricingPolicy:ESTIMATE_TEST_PRINT_POLICY,now:ports.now,
  activationApproved:async()=>(await ports.readEnvironment()).GELATO_ORDINARY_RELEASE_ENABLED==='true'});
}

/** No input URL, injected HTTP credential or request body can select dependencies. */
export async function productionOrdinaryEstimateRuntime():Promise<OrdinaryReleaseRuntime>{
 return ordinaryEstimateServerRuntime({readEnvironment:async()=>{
   const {getCloudflareContext}=await import('@opennextjs/cloudflare');
   return getCloudflareContext().env as unknown as Record<string,unknown>;
  },loadServices:async()=>{
   const [{supabase},storage]=await Promise.all([import('../supabase-client'),import('../r2-client')]);
   return {database:supabase,fetcher:fetch,loadArtifact:(key,signal)=>storage.getObject(storage.R2_ORDERS_BUCKET,key,{signal,redirect:'manual',allowErrorResponse:true})};
  }});
}
