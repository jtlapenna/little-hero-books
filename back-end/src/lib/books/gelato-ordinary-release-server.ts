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
 requireTestScope?: boolean;
 actor?: string;
}
export async function ordinaryEstimateServerRuntime(ports:EstimateServerPorts):Promise<OrdinaryReleaseRuntime>{
 const env=await ports.readEnvironment();
 if(env.GELATO_ORDINARY_RELEASE_ENABLED!=='true')return {kind:'blocked',blockers:['ordinary_release_disabled']};
 const account=z.string().regex(/^[a-f0-9]{64}$/).parse(env.GELATO_ORDINARY_RELEASE_ACCOUNT_SHA256);
 const emails=z.string().min(1).max(2000).parse(env.GELATO_ORDINARY_RELEASE_APPROVERS).split(',').map(v=>v.trim().toLowerCase());
 if(!emails.length||emails.length>10||emails.some(v=>!z.email().safeParse(v).success))throw Error('print_release_approvers_invalid');
 if (ports.requireTestScope && (!ports.actor || !emails.includes(ports.actor))) return {kind:'blocked',blockers:['print_release_operator_not_configured']};
 const apiKey=z.string().trim().min(1).parse(env.GELATO_API_KEY);
 if(createHash('sha256').update(apiKey).digest('hex')!==account)throw Error('release_service_account_mismatch');
 const testScope = ports.requireTestScope ? { orderId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/).parse(env.GELATO_ORDINARY_RELEASE_TEST_ORDER_ID), expiresAt: z.string().datetime({offset:true}).parse(env.GELATO_ORDINARY_RELEASE_TEST_EXPIRES_AT) } : undefined;
 if (testScope && (Date.parse(testScope.expiresAt) <= (ports.now?.() ?? new Date()).getTime() || Date.parse(testScope.expiresAt) > (ports.now?.() ?? new Date()).getTime()+24*3600000)) return {kind:'blocked',blockers:['single_test_release_scope_expired']};
 const services=await ports.loadServices();
 if (testScope) {
  const {data,error}=await services.database.rpc('register_admin_workflow_test_release_scope',{p_order_id:testScope.orderId,p_actor:ports.actor!,p_account_sha256:account,p_expires_at:testScope.expiresAt}).abortSignal(AbortSignal.timeout(5000));
  if(error || data!==true) return {kind:'blocked',blockers:['exact_approved_test_draft_required']};
 }
 return composeOrdinaryReleaseServiceRuntime({...services,testScope,apiKey,merchantEmail:env.GELATO_MERCHANT_CONTACT_EMAIL == null || env.GELATO_MERCHANT_CONTACT_EMAIL === '' ? undefined : z.string().trim().pipe(z.email()).parse(env.GELATO_MERCHANT_CONTACT_EMAIL),expectedAccountSha256:account,approvers:new Set(emails),
  pricingPolicy:ESTIMATE_TEST_PRINT_POLICY,now:ports.now,
  activationApproved:async()=>{ const current=await ports.readEnvironment(); return current.GELATO_ORDINARY_RELEASE_ENABLED==='true' && current.GELATO_ORDINARY_RELEASE_ACCOUNT_SHA256===account && (!testScope || (current.GELATO_ORDINARY_RELEASE_TEST_ORDER_ID===testScope.orderId && current.GELATO_ORDINARY_RELEASE_TEST_EXPIRES_AT===testScope.expiresAt)); }});
}

/** No input URL, injected HTTP credential or request body can select dependencies. */
export async function productionOrdinaryEstimateRuntime(actor?: string):Promise<OrdinaryReleaseRuntime>{
 return ordinaryEstimateServerRuntime({requireTestScope:true,actor,readEnvironment:async()=>{
   const {getCloudflareContext}=await import('@opennextjs/cloudflare');
   return getCloudflareContext().env as unknown as Record<string,unknown>;
  },loadServices:async()=>{
   const [{supabase},storage]=await Promise.all([import('../supabase-client'),import('../r2-client')]);
   return {database:supabase,fetcher:fetch,loadArtifact:(key,signal)=>storage.getObject(storage.R2_ORDERS_BUCKET,key,{signal,redirect:'manual',allowErrorResponse:true})};
  }});
}
