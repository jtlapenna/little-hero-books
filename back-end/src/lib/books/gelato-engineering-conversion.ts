import { parsePrinterFileUrl, verifyPrinterFileUrl } from '../printer-file-grants';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { GelatoSavedSnapshotSchema, assertPrinterSendAuthority } from './gelato-submission';
import { validateGelatoQuote } from './gelato-api-contract';
import { GelatoProviderOrderSchema, validateGelatoConnectedOrdersWithFiles } from './gelato-provider-snapshot';
import type { GelatoSubmissionContext } from './gelato-submission-store';
import { GELATO_SIMULATION_ORIGIN, requireGelatoConversionSimulation, gelatoTestSafetyReason } from './gelato-test-safety';

const digest = (v: string | Uint8Array) => createHash('sha256').update(v).digest('hex');
const Hash = z.string().regex(/^[a-f0-9]{64}$/);
export const EngineeringConversionSchema = z.object({
  id: z.string().uuid(), submission_id: z.string().uuid(), provider_root_id: z.string().min(1), account_key_sha256: Hash,
  owner_token: z.string().uuid().nullable(), state: z.enum(['ready','preparing','sending','converted','rejected','outcome_unknown','preflight_failed']),
  closed_at: z.string().nullable(), expires_at: z.string(), observations: z.record(z.string(),z.unknown()).default({}),
  artifacts: z.array(z.object({ child_order_id: z.number().int().positive(), artifact_key: z.string().min(1), provider_item_id:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/), sha256: Hash }).strict()).min(1).max(2),
});
export type EngineeringConversion = z.infer<typeof EngineeringConversionSchema>;
export interface EngineeringConversionDependencies {
  apiKey: string;
  normalControlsOff: boolean;
  transition(name: string, parameters: Record<string, unknown>): Promise<unknown>;
  authorization(id: string): Promise<unknown>;
  closeOwned(id: string, ownerToken: string): Promise<boolean>;
  context(id: string): Promise<GelatoSubmissionContext>;
  artifact(key: string): Promise<Uint8Array>;
  verifyFile(reference: string, url: string, expected: string, context: GelatoSubmissionContext): Promise<boolean>;
  fetcher?: typeof fetch;
  now?: () => Date;
  providerBudgetMs?: number;
  /** Historical offline protocol simulations only. Never read from env, request or database. */
  simulationOnly?: true;
}
const receiptAmounts = ['productsPrice','productsPriceVat','productsPriceInclVat','shippingPrice','shippingPriceVat','shippingPriceInclVat','packagingPrice','packagingPriceVat','packagingPriceInclVat','discount','discountVat','discountInclVat','total','totalVat','totalInclVat'];
const status = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value) ? value : null;
export function engineeringProviderObservation(raw: Record<string, unknown>) {
  const parsed = GelatoProviderOrderSchema.parse(raw);
  const receipts = Array.isArray(raw.receipts) ? raw.receipts.map((value: unknown) => {
    const r = z.record(z.string(),z.unknown()).parse(value);
    return { currency: typeof r.currency === 'string' && /^[A-Z]{3}$/.test(r.currency) ? r.currency : null,
      isCalculated: typeof r.isCalculated === 'boolean' ? r.isCalculated : null,
      ...Object.fromEntries(receiptAmounts.map(k => [k, typeof r[k] === 'number' && Number.isFinite(r[k]) ? r[k] : null])) };
  }) : [];
  return { providerOrderId: parsed.id, orderType: parsed.orderType, financialStatus: status(raw.financialStatus),
    fulfillmentStatus: parsed.fulfillmentStatus, processingStatus: status(raw.processingStatus),
    processingLogCount: Array.isArray(raw.processingLog) ? raw.processingLog.length : null,
    items: parsed.items.map(i => ({ providerItemId: i.id, itemReferenceId: i.itemReferenceId, fulfillmentStatus: i.fulfillmentStatus,
      productUid: i.productUid, quantity: i.quantity, apiPageCount: i.pageCount ?? null, processedFileUrlPresent: Boolean(i.processedFileUrl) })),
    shipmentMethodUid: parsed.shipment?.shipmentMethodUid ?? null, receipts,
    testSafetyReason: gelatoTestSafetyReason(raw),
    unsafeFundingOrProductionObserved: ['unexpected_test_order_payment','unexpected_test_order_production','unexpected_test_order_funding'].includes(gelatoTestSafetyReason(raw) ?? ''),
  };
}
// Shared immutable membership/file proof. Status-only callers must also validate current order rows.
export async function validateEngineeringConversionContext(a: EngineeringConversion, d: EngineeringConversionDependencies) {
  const context = await d.context(a.submission_id);
  const saved = GelatoSavedSnapshotSchema.parse(context.submission.request_snapshot);
  const members = [...context.members].sort((x,y) => x.child_order_id-y.child_order_id);
  const artifacts = [...a.artifacts].sort((x,y) => x.child_order_id-y.child_order_id);
  if (context.submission.id !== a.submission_id || !/^TEST-GELATO-[A-Za-z0-9-]{1,38}$/.test(context.submission.root_order_id) ||
      context.submission.request_state !== 'submitted' || context.submission.accepted_root_order_id !== a.provider_root_id || members.length !== artifacts.length ||
      context.providerOrders.length !== 1 || context.providerOrders[0].provider_order_id !== a.provider_root_id) throw new Error('Engineering conversion context differs');
  for (let i=0;i<members.length;i++) {
    const m=members[i], artifact=artifacts[i];
    if (m.child_order_id!==artifact.child_order_id || m.provider_item_id!==artifact.provider_item_id || !/^TEST-GELATO-[A-Za-z0-9-]{1,38}$/.test(m.child_order_key) || m.artifact_key!==artifact.artifact_key ||
        m.artifact_key!==`book-finding-our-inner-voice/orders/${m.child_order_key}/gelato/print/v2/${m.artifact_fingerprint}.pdf` || !m.artifact_fingerprint||!/^[a-f0-9]{24}$/.test(m.artifact_fingerprint)||m.pdf_page_count!==35 || m.provider_order_id!==a.provider_root_id || !m.provider_item_id) throw new Error('Engineering artifact membership differs');
    const requested=saved.request.items.filter(item=>item.itemReferenceId===m.item_reference_id);
    if (requested.length !== 1 || requested[0].files.length !== 1 || !parsePrinterFileUrl(requested[0].files[0].url, artifact.artifact_key) ||
        (new URL(requested[0].files[0].url).search !== '' && !await verifyPrinterFileUrl(requested[0].files[0].url, artifact.artifact_key, { historical: true,
          scope: { key: artifact.artifact_key, submissionId: context.submission.id, itemReferenceId: m.item_reference_id, orderDbId: m.child_order_id, configVersion: 2, inputFingerprint: m.artifact_fingerprint } }))) throw new Error('Engineering request URL differs from authorized artifact');
    if (digest(await d.artifact(artifact.artifact_key))!==artifact.sha256) throw new Error('Engineering immutable PDF bytes differ');
  }
  return {context,saved,members,artifacts};
}
async function performEngineeringConversion(id: string, action: 'convert' | 'observe', d: EngineeringConversionDependencies, acquired: (a: EngineeringConversion) => void) {
  z.string().uuid().parse(id);
  // No live conversion through the retired no-payment test path, including old authorizations.
  if (action === 'convert') requireGelatoConversionSimulation(d);
  if (!d.normalControlsOff || !d.apiKey?.trim()) throw new Error('Engineering conversion requires closed normal controls and an explicit key');
  const keyHash = digest(d.apiKey);
  const rawEvidence: Array<{ method: string; path: string; httpStatus: number | null; responseText: string | null }> = [];
  const http = async (method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown) => {
    if (!/^\/orders\/[A-Za-z0-9_-]+$/.test(path) && !(method === 'POST' && path === '/orders:quote')) throw new Error('Unreviewed engineering provider route');
    const controller=new AbortController();
    const budget=d.providerBudgetMs??30_000;
    if(!Number.isFinite(budget)||budget<=0||budget>30_000)throw new Error('Invalid provider request budget');
    const timeout=setTimeout(()=>controller.abort(new Error('Engineering provider deadline exceeded')),budget);
    let onAbort: (()=>void)|undefined;
    const aborted=new Promise<never>((_,reject)=>{onAbort=()=>reject(new Error('Engineering provider deadline exceeded'));controller.signal.addEventListener('abort',onAbort,{once:true});});
    let response:Response|undefined;
    try {
      response=await Promise.race([(d.fetcher??fetch)(`${d.simulationOnly === true ? GELATO_SIMULATION_ORIGIN : 'https://order.gelatoapis.com'}/v4${path}`,{method,
        headers:{'X-API-KEY':d.apiKey,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual',signal:controller.signal}),aborted]);
      const text=await Promise.race([response.text(),aborted]);rawEvidence.push({method,path,httpStatus:response.status,responseText:text});
      return {ok:response.ok,status:response.status,text,json:()=>JSON.parse(text) as Record<string,unknown>};
    }catch{
      if(response?.body)void response.body.cancel().catch(()=>undefined);
      rawEvidence.push({method,path,httpStatus:response?.status??null,responseText:null});throw new Error('Engineering provider response is uncertain');
    }finally{clearTimeout(timeout);if(onAbort)controller.signal.removeEventListener('abort',onAbort);}

  };
  const a = EngineeringConversionSchema.parse(action === 'convert'
    ? await d.transition('begin_gelato_engineering_conversion', { p_id: id, p_key_sha256: keyHash }) : await d.authorization(id));
  if (a.id !== id || a.account_key_sha256 !== keyHash || !a.owner_token) throw new Error('Engineering account or ownership differs');
  acquired(a);
  let sendAuthorizationAttempted = false;
  let outcome: 'converted'|'rejected'|'outcome_unknown'|'preflight_failed' = 'preflight_failed';
  let observations: Record<string, unknown> = action==='observe'?{...a.observations}:{};
  let persistenceConfirmed = false;
  let observationPersisted = false;

  try {
  const {context,saved,members,artifacts}=await validateEngineeringConversionContext(a,d);
  const validate = async (raw: Record<string, unknown>) => {
    const parsed = GelatoProviderOrderSchema.parse(raw);
    if (parsed.id!==a.provider_root_id || parsed.items.some(i=>!members.some(m=>m.provider_item_id===i.id&&m.item_reference_id===i.itemReferenceId))) throw new Error('Engineering provider identity changed');
    await validateGelatoConnectedOrdersWithFiles([parsed],saved.request,(ref,url,expected)=>d.verifyFile(ref,url,expected,context));
    return parsed;
  };
    const before=await http('GET',`/orders/${a.provider_root_id}`); if(!before.ok)throw new Error('Engineering draft lookup failed');
    const beforeRaw=before.json();const parsedBefore=await validate(beforeRaw);
    if(action==='convert') {
      if(engineeringProviderObservation(beforeRaw).unsafeFundingOrProductionObserved||beforeRaw.paymentMethodId||beforeRaw.prepaymentTransactionId)throw new Error('Engineering draft has unexpected funding or production evidence');
      if(parsedBefore.orderType!=='draft'||parsedBefore.fulfillmentStatus!=='draft'||beforeRaw.financialStatus!=='draft')throw new Error('Engineering conversion requires a current unfunded draft');
      const quoteRequest={orderReferenceId:saved.request.orderReferenceId,customerReferenceId:saved.request.customerReferenceId,currency:saved.request.currency,
        allowMultipleQuotes:false as const,recipient:saved.request.shippingAddress,products:saved.request.items};
      await assertPrinterSendAuthority(saved.request.items, (d.now ?? (() => new Date()))());
      const quote=await http('POST','/orders:quote',quoteRequest);if(!quote.ok)throw new Error('Engineering fresh quote failed');
      const now=(d.now??(()=>new Date()))();const selected=validateGelatoQuote({response:quote.json(),request:quoteRequest,config:saved.config,shippingTier:saved.shippingTier,quotedAt:now.toISOString(),now});
      if(selected.shipmentMethodUid!==saved.request.shipmentMethodUid)throw new Error('Engineering current service differs');
      sendAuthorizationAttempted=true;
      await d.transition('authorize_gelato_engineering_conversion_send',{p_id:id,p_token:a.owner_token,p_key_sha256:keyHash,
        p_preflight_sha256:digest(JSON.stringify({before:digest(before.text),quote:digest(quote.text),artifacts}))});
      await assertPrinterSendAuthority(saved.request.items, (d.now ?? (() => new Date()))());
      try { const patch=await http('PATCH',`/orders/${a.provider_root_id}`,{orderType:'order'});
        observations={patchHttpStatus:patch.status,patchResponseSha256:digest(patch.text),diagnosticQuoteId:selected.quoteId,quoteResponseSha256:digest(quote.text)};
      } catch { observations={patchResponseUncertain:true,diagnosticQuoteId:selected.quoteId,quoteResponseSha256:digest(quote.text)}; }
    }
    const after=action==='observe'?before:await http('GET',`/orders/${a.provider_root_id}`);
    if(!after.ok)throw new Error('Engineering outcome lookup failed');const raw=after.json();const parsed=await validate(raw);
    outcome=parsed.orderType==='order'?'converted':parsed.orderType==='draft'&&raw.financialStatus==='draft'&&[400,401,403,404,422].includes(Number(observations.patchHttpStatus))?'rejected':'outcome_unknown';
    observations={...observations,...engineeringProviderObservation(raw),providerResponseSha256:digest(after.text),noNewCreate:true};
    if(action==='observe'&&(!['sending','outcome_unknown'].includes(a.state)||(a.state==='outcome_unknown'&&outcome==='outcome_unknown'))) {
      persistenceConfirmed=true;
    } else {
      await d.transition('finish_gelato_engineering_conversion',{p_id:id,p_token:a.owner_token,p_state:outcome,p_observations:observations});persistenceConfirmed=true;observationPersisted=true;
    }
  } catch {
    outcome=sendAuthorizationAttempted||action==='observe'?'outcome_unknown':'preflight_failed';
    observations={...observations,needsAttention:true,noAutomaticRetry:true};
    if(action==='convert')await d.transition('finish_gelato_engineering_conversion',{p_id:id,p_token:a.owner_token,p_state:outcome,p_observations:observations}).then(()=>{persistenceConfirmed=true;observationPersisted=true;}).catch(()=>undefined);
  }
  return {authorizationId:id,state:outcome,observation:observations,needsAttention:observations.testSafetyReason!=null||observations.needsAttention===true,persistenceConfirmed,observationPersisted,privateEvidence:rawEvidence};
}

export async function runEngineeringConversion(id: string, action: 'convert' | 'observe', dependencies: EngineeringConversionDependencies) {
  z.string().uuid().parse(id);
  let result: Awaited<ReturnType<typeof performEngineeringConversion>> | undefined;
  let failure: unknown;
  let closureConfirmed=false;
  let ownedToken: string | null=null;
  try { result=await performEngineeringConversion(id,action,dependencies,a=>{
    if(action==='convert')ownedToken=a.owner_token;
    else closureConfirmed=a.closed_at!==null;
  }); } catch(error) { failure=error; }
  finally {
    // A losing or unconfirmed begin does not own another worker's authorization.
    // Ambiguous acquisition requires the independent emergency closer; never retry send.
    if(ownedToken)await dependencies.closeOwned(id,ownedToken).then(confirmed=>{closureConfirmed=confirmed;}).catch(()=>undefined);
  }
  if(failure)throw failure;
  if(!result)throw new Error('Engineering conversion result unavailable');
  return {...result,closureConfirmed};
}
