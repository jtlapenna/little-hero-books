import { adminWorkflowTestAdmission } from '../admin-workflow-test';
/** Server composition for the real data/storage/provider contracts. No ambient
 * credentials, default fetch, policy inference or activation. The installed HTTP
 * runtime remains blocked until an explicitly reviewed payable policy is supplied. */
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { composeOrdinaryReleaseRuntime } from './gelato-ordinary-release-runtime';
import type { OrdinaryReleaseDependencies } from './gelato-ordinary-release-core';
import { createGelatoSubmissionStore } from './gelato-submission-store';
import { createGelatoStoredFileVerifier, GELATO_STORED_FILE_HOST } from './gelato-stored-file';
import {loadGelatoFileDigest} from './gelato-file-digest';
import {ESTIMATE_TEST_PRINT_POLICY,observeGelatoReleaseEstimate} from './gelato-release-estimate';

export interface OrdinaryReleaseServiceSources {
  database: SupabaseClient;
  /** Server-configured single test scope; never selected by the HTTP body. */
  testScope?: { orderId: string; expiresAt: string };
  apiKey: string;
  expectedAccountSha256: string;
  approvers: ReadonlySet<string>;
  // Must be installed by reviewed server code, not HTTP input or inferred from a
  // partial quote/calculated receipt. Legacy full-total mode still requires it;
  // the selected estimate policy uses the explicit built-in partial-quote adapter.
  pricingPolicy?:typeof ESTIMATE_TEST_PRINT_POLICY;
  payableEvidence?: OrdinaryReleaseDependencies['payableEvidence'];
  activationApproved: () => Promise<boolean>;
  loadArtifact: (key: string, signal: AbortSignal) => Promise<Response>;
  fetcher: typeof fetch;
  now?: () => Date;
}

export function composeOrdinaryReleaseServiceRuntime(sources: OrdinaryReleaseServiceSources) {
  const key=sources.apiKey;
  if(!key.trim() || createHash('sha256').update(key).digest('hex')!==
      z.string().regex(/^[a-f0-9]{64}$/).parse(sources.expectedAccountSha256))throw Error('release_service_account_mismatch');
  if((sources.pricingPolicy!==ESTIMATE_TEST_PRINT_POLICY&&typeof sources.payableEvidence!=='function') || typeof sources.activationApproved!=='function' ||
      typeof sources.fetcher!=='function' || typeof sources.loadArtifact!=='function')throw Error('release_service_sources_missing');
  if(!sources.approvers.size)return {kind:'blocked' as const,blockers:['print_release_approver_not_configured']};
  const db=sources.database;
  const transport:typeof fetch=async(input,init)=>{
    const request=new Request(input,{...init,redirect:'manual'}),url=new URL(request.url);
    if(url.username||url.password||url.port)throw Error('release_service_transport_denied');
    const provider=url.origin==='https://order.gelatoapis.com' && !url.search &&
      ((url.pathname==='/v4/orders:quote'&&request.method==='POST') ||
       (/^\/v4\/orders\/[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(url.pathname)&&['GET','PATCH'].includes(request.method)));
    const file=url.protocol==='https:'&&url.hostname===GELATO_STORED_FILE_HOST&&request.method==='GET';
    if(!provider&&!file)throw Error('release_service_transport_denied');
    if(provider && request.headers.get('x-api-key')!==key)throw Error('release_service_transport_account_changed');
    if(request.headers.has('authorization')||request.headers.has('cookie')||file&&request.headers.has('x-api-key'))throw Error('release_service_transport_credentials_denied');
    return sources.fetcher(request);
  };
  const release:Omit<OrdinaryReleaseDependencies,'store'>={
    apiKey:key, fetcher:transport, now:sources.now, budgetMs:30000,
    enabled:async()=>{
      if(!await sources.activationApproved())return false;
      if (sources.testScope) {
        if (Date.parse(sources.testScope.expiresAt) <= (sources.now?.() ?? new Date()).getTime()) return false;
        const { data, error } = await db.rpc('gelato_admin_test_release_scope_active', { p_order_id: sources.testScope.orderId, p_account_sha256: sources.expectedAccountSha256 }).abortSignal(AbortSignal.timeout(5000));
        if (error) throw Error('Exact test release scope unavailable');
        return data === true;
      }
      const {data,error}=await db.from('gelato_ordinary_release_gate').select('enabled').eq('id',true)
        .abortSignal(AbortSignal.timeout(5000)).maybeSingle();
      if(error)throw Error('Ordinary release gate unavailable');
      return data?.enabled===true;
    },
    context:async id=>{
      const context=await createGelatoSubmissionStore(db,AbortSignal.timeout(5000)).load(z.string().uuid().parse(id));
      if (sources.testScope && (context.members.length!==1 || context.members[0].child_order_key!==sources.testScope.orderId)) throw Error('Release outside activated test order');
      return context;
    },
    order:async key=>{
      // Child keys from the sealed context only; no numeric/root/prefix fallback.
      z.string().min(1).max(200).parse(key);
      const {data,error}=await db.from('orders').select('*').eq('orderId',key)
        .abortSignal(AbortSignal.timeout(5000)).maybeSingle();
      if(error)throw Error('Exact ordinary order lookup failed');
      if (sources.testScope && (!data || key!==sources.testScope.orderId || !adminWorkflowTestAdmission(data))) throw Error('Activated workflow test changed');
      return data as Record<string,unknown>|null;
    },
    artifactSha256:(key,signal)=>loadGelatoFileDigest(inner=>sources.loadArtifact(key,inner),signal),
    createStoredFileVerifier:signal=>createGelatoStoredFileVerifier({signal,fetcher:transport,
      loadArtifact:(key,fileSignal)=>sources.loadArtifact(key,fileSignal)}),
    pricingPolicy:sources.pricingPolicy,
    payableEvidence:sources.pricingPolicy===ESTIMATE_TEST_PRINT_POLICY?async(raw,context)=>{
      if(!context)throw Error('release_estimate_quote_context_missing');
      return observeGelatoReleaseEstimate(raw,context);
    }:sources.payableEvidence!,
  };
  return composeOrdinaryReleaseRuntime(db,release,sources.approvers);
}
