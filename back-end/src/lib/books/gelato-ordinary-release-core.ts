/** Local-first ordinary release core. No route, scheduler or default HTTP transport is installed; the store is explicitly injected. */
import { createHash } from 'node:crypto';
import { parsePrinterFileUrl, verifyPrinterFileUrl } from '../printer-file-grants';
import { z } from 'zod';
import { buildGelatoReleaseReview } from './gelato-release-review';
import { type GelatoSavedSnapshot, GelatoSavedSnapshotSchema, assertPrinterSendAuthority } from './gelato-submission';
import { getGelatoOrder, requestGelatoQuote } from './gelato-api-client';
import { validateGelatoQuote } from './gelato-api-contract';
import { observeGelatoMonetaryQuote } from './gelato-financial-observation';
import { type GelatoProviderOrder, validateGelatoConnectedOrdersWithFiles } from './gelato-provider-snapshot';
import type { GelatoSubmissionContext } from './gelato-submission-store';
import type { GelatoStoredFileVerifier } from './gelato-stored-file';
import {ESTIMATE_TEST_PRINT_POLICY,GelatoReleaseEstimateSchema,type ReleaseQuoteContext} from './gelato-release-estimate';

const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const Cents = z.string().regex(/^(0|[1-9]\d{0,11})$/);
const ProviderId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/);
const Artifact = z.object({ childOrderId: z.number().int().positive(), itemReferenceId: z.string().min(1),
 providerItemId: ProviderId, bookId:z.string().regex(/^[A-Za-z0-9_-]+$/), formatId:z.string().regex(/^[A-Za-z0-9_-]+$/), configVersion:z.number().int().positive(), key: z.string().min(1), sha256: Hash }).strict();
export const OrdinaryReleasePermitSchema = z.object({ id: z.string().uuid(), submissionId: z.string().uuid(), providerOrderId: ProviderId,
 accountSha256: Hash, packetSha256: Hash, requestSnapshotSha256:Hash, artifacts: z.array(Artifact).min(1).max(100), currency: z.literal('USD'),
 maximumTotalCents: Cents, approvedAt: z.string().datetime({offset:true}), expiresAt: z.string().datetime({offset:true}) }).strict();
export type OrdinaryReleasePermit = z.infer<typeof OrdinaryReleasePermitSchema>;
export const OrdinaryEstimatePermitSchema=OrdinaryReleasePermitSchema.omit({maximumTotalCents:true}).extend({
 pricingPolicy:z.literal(ESTIMATE_TEST_PRINT_POLICY),maximumQuotedSubtotalCents:Cents,artifacts:z.array(Artifact).length(1)}).strict();
export const AnyOrdinaryReleasePermitSchema=z.union([OrdinaryReleasePermitSchema,OrdinaryEstimatePermitSchema]);
export type AnyOrdinaryReleasePermit=z.infer<typeof AnyOrdinaryReleasePermitSchema>;
// This contract is NOT inferred from the existing partial Gelato quote. A future
// reviewed adapter must establish every component from trusted provider evidence.
export const OrdinaryPayableEvidenceSchema = z.object({ source: z.literal('verified_provider_payable'), accountSha256: Hash,
 quoteId: z.string().min(1), requestFingerprint: Hash, quotedAt: z.string().datetime({offset:true}), currency: z.literal('USD'),
 productsCents: Cents, shippingCents: Cents, taxesCents: Cents, feesCents: Cents, discountCents: Cents,
 totalCents: Cents, quoteResponseSha256:Hash, responseSha256: Hash }).strict();
export type OrdinaryPayableEvidence = z.infer<typeof OrdinaryPayableEvidenceSchema>;
export const OrdinaryReleasePacketSchema = z.object({ version:z.literal(2), permitId:z.string().uuid(),
 approvedAt:z.string().datetime({offset:true}), expiresAt:z.string().datetime({offset:true}), submissionId:z.string().uuid(),
 providerOrderId:ProviderId, accountSha256:Hash, originalRequestSha256:Hash,
 artifacts:z.array(Artifact.extend({pdfPageCount:z.number().int().positive()})).min(1).max(100),
 destinationSha256:Hash, shippingTier:z.string().min(1), shipmentMethodUid:z.string().min(1),
 currency:z.literal('USD'), maximumTotalCents:Cents, payable:OrdinaryPayableEvidenceSchema }).strict();
export type OrdinaryReleasePacket = z.infer<typeof OrdinaryReleasePacketSchema>;
export const OrdinaryEstimatePacketSchema=OrdinaryReleasePacketSchema.omit({version:true,maximumTotalCents:true,payable:true}).extend({
 version:z.literal(3),pricingPolicy:z.literal(ESTIMATE_TEST_PRINT_POLICY),maximumQuotedSubtotalCents:Cents,estimate:GelatoReleaseEstimateSchema,
 artifacts:z.array(Artifact.extend({pdfPageCount:z.number().int().positive()})).length(1)}).strict();
export const AnyOrdinaryReleasePacketSchema=z.union([OrdinaryReleasePacketSchema,OrdinaryEstimatePacketSchema]);
export type AnyOrdinaryReleasePacket=z.infer<typeof AnyOrdinaryReleasePacketSchema>;
export type OrdinaryReleaseOutcome = 'converted' | 'outcome_unknown' | 'preflight_failed';
export interface OrdinaryReleaseStore {
 // A persistent, service-only CAS must never reacquire sending/unknown/closed work.
 // It must also serialize ALL permit IDs by account+submission/provider root;
 // a per-permit UUID lock alone is insufficient. A consumed root stays consumed.
 acquire(id: string, accountSha256: string, now: string): Promise<
  { kind: 'acquired'; permit: unknown; ownerToken: string } | { kind: 'busy' | 'already_attempted' | 'disabled' }>;
 // Transactional adapter must recheck permit, expiry, current approval/ownership,
 // exact packet and account, then durably record sending BEFORE returning true.
 authorizeSend(id: string, ownerToken: string, packetSha256: string, now: string): Promise<boolean>;
 finish(id: string, ownerToken: string, outcome: OrdinaryReleaseOutcome, orders?: GelatoProviderOrder[]): Promise<boolean>;
}
export interface OrdinaryReleaseDependencies {
 apiKey: string; enabled?: () => Promise<boolean>; store: OrdinaryReleaseStore;
 context(id: string): Promise<GelatoSubmissionContext>;
 order(key: string): Promise<Record<string, unknown> | null>;
 artifact(key: string): Promise<Uint8Array>;
 // Fresh cache lifetime for each observation phase; never share across send/recovery.
 createStoredFileVerifier(signal:AbortSignal): GelatoStoredFileVerifier;
 // Required injection: there is no global fetch fallback or provider entry point.
 fetcher: typeof fetch;
 pricingPolicy?:typeof ESTIMATE_TEST_PRINT_POLICY;
 payableEvidence(rawQuote: unknown,context?:ReleaseQuoteContext): Promise<unknown>;
 // Persisted original human-reviewed packet, never a fresh quote substituted at send.
 approvedPacket?: (permitId:string) => Promise<unknown>;
 now?: () => Date; budgetMs?: number;
}
function canonical(value: unknown): string {
 if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
 if (value && typeof value === 'object') return '{' + Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',') + '}';
 return JSON.stringify(value);
}
export const ordinaryReleaseDigest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const manualTransport = (d:OrdinaryReleaseDependencies):typeof fetch => (input,init)=>d.fetcher(input,{...init,redirect:'manual'});
const keyDigest = (value: string) => createHash('sha256').update(value).digest('hex');
const now = (d: OrdinaryReleaseDependencies) => (d.now ?? (()=>new Date()))();
function assertPermit(permit: AnyOrdinaryReleasePermit, d: OrdinaryReleaseDependencies) {
 const time=now(d).getTime(), approved=Date.parse(permit.approvedAt), expires=Date.parse(permit.expiresAt);
 if (!d.apiKey.trim() || keyDigest(d.apiKey)!==permit.accountSha256) throw Error('release_account_mismatch');
 if(('pricingPolicy' in permit?permit.pricingPolicy:undefined)!==d.pricingPolicy)throw Error('release_pricing_policy_mismatch');
 if (!Number.isFinite(time) || approved>time || expires<=time || expires<=approved || expires-approved>15*60000) throw Error('release_approval_expired');
}
function amounts(value: string): string {
 if (!/^(0|[1-9]\d{0,10})(\.\d{1,2})?$/.test(value)) throw Error('release_money_precision');
 const [whole,fraction='']=value.split('.');return (BigInt(whole)*BigInt(100)+BigInt(fraction.padEnd(2,'0'))).toString();
}
const preparationOnly = new Set(['ordinary_release_transport_not_installed','specific_paid_test_approval_required','taxes_fees_and_payable_total_unverified']);
async function assertArtifactScope(permit:AnyOrdinaryReleasePermit,context:GelatoSubmissionContext,saved:GelatoSavedSnapshot){
 if(context.members.length!==permit.artifacts.length || saved.request.items.length!==permit.artifacts.length ||
  new Set(context.members.map(m=>m.child_order_id)).size!==context.members.length || new Set(context.members.map(m=>m.child_order_key)).size!==context.members.length ||
  new Set(context.members.map(m=>m.item_reference_id)).size!==context.members.length || new Set(context.members.map(m=>m.provider_item_id)).size!==context.members.length ||
  new Set(permit.artifacts.map(a=>a.childOrderId)).size!==permit.artifacts.length || new Set(permit.artifacts.map(a=>a.itemReferenceId)).size!==permit.artifacts.length ||
  new Set(permit.artifacts.map(a=>a.providerItemId)).size!==permit.artifacts.length || new Set(permit.artifacts.map(a=>a.key)).size!==permit.artifacts.length)throw Error('release_membership_not_bijective');
 for(const member of context.members){
  const artifact=permit.artifacts.find(a=>a.childOrderId===member.child_order_id && a.itemReferenceId===member.item_reference_id && a.providerItemId===member.provider_item_id && a.key===member.artifact_key);
  const items=saved.request.items.filter(item=>item.itemReferenceId===member.item_reference_id);
  if(!artifact || member.artifact_claim_token!==context.submission.claim_token || !member.artifact_fingerprint ||
   artifact.key!==`${artifact.bookId}/orders/${member.child_order_key}/gelato/print/v${artifact.configVersion}/${member.artifact_fingerprint}.pdf` ||
   items.length!==1 || items[0].files.length!==1 || !parsePrinterFileUrl(items[0].files[0].url,artifact.key))throw Error('release_request_artifact_scope_mismatch');
  const url=items[0].files[0].url;
  if(new URL(url).search!=='' && !await verifyPrinterFileUrl(url,artifact.key,{historical:true,scope:{key:artifact.key,submissionId:permit.submissionId,itemReferenceId:member.item_reference_id,
   orderDbId:member.child_order_id,configVersion:artifact.configVersion,inputFingerprint:member.artifact_fingerprint}}))throw Error('release_request_artifact_scope_mismatch');
 }
}
export function prepareOrdinaryRelease(permitValue: unknown,d:OrdinaryReleaseDependencies,signal:AbortSignal,approvedPacket?:unknown){
 return bounded(signal,()=>performOrdinaryReleasePreparation(permitValue,d,signal,approvedPacket));
}
async function performOrdinaryReleasePreparation(permitValue: unknown, d: OrdinaryReleaseDependencies, signal: AbortSignal, approvedPacket?:unknown) {
 const permit=AnyOrdinaryReleasePermitSchema.parse(permitValue); assertPermit(permit,d); signal.throwIfAborted();
 const context=await d.context(permit.submissionId); signal.throwIfAborted();
 const saved=GelatoSavedSnapshotSchema.parse(context.submission.request_snapshot);
 if('pricingPolicy' in permit && (saved.request.items.length!==1||saved.request.items[0].quantity!==1))throw Error('estimate_policy_single_test_copy_required');
 if(ordinaryReleaseDigest(saved)!==permit.requestSnapshotSha256)throw Error('release_approved_snapshot_mismatch');
 if(context.submission.id!==permit.submissionId || saved.request.orderReferenceId!==context.submission.order_reference_id || saved.request.customerReferenceId!==context.submission.root_order_id || context.submission.accepted_root_order_id!==permit.providerOrderId ||
  context.providerOrders.length!==1 || context.providerOrders[0].provider_order_id!==permit.providerOrderId ||
  context.members.length!==permit.artifacts.length || new Set(permit.artifacts.map(a=>a.key)).size!==permit.artifacts.length ||
  new Set(permit.artifacts.map(a=>a.childOrderId)).size!==permit.artifacts.length)throw Error('release_membership_mismatch');
 for(const member of context.members){
  const matches=permit.artifacts.filter(a=>a.childOrderId===member.child_order_id && a.itemReferenceId===member.item_reference_id && a.providerItemId===member.provider_item_id && a.key===member.artifact_key);
  if(matches.length!==1 || member.submission_id!==permit.submissionId || member.provider_order_id!==permit.providerOrderId || member.artifact_claim_token!==context.submission.claim_token)throw Error('release_artifact_binding_mismatch');
 }
 await assertArtifactScope(permit,context,saved);
 const provider=await getGelatoOrder(permit.providerOrderId,{apiKey:d.apiKey,fetcher:manualTransport(d),signal});
 if(provider.id!==permit.providerOrderId || provider.orderType!=='draft' || provider.fulfillmentStatus!=='draft' || provider.financialObservation?.status!=='draft' || provider.financialObservation.reviewReason!==null || provider.items.some(item=>!['created','draft'].includes(item.fulfillmentStatus)) || provider.connectedOrderIds.length || provider.shipment?.shipmentMethodUid!==saved.request.shipmentMethodUid)throw Error('release_requires_current_unfunded_draft');
 const verifyStoredFile=d.createStoredFileVerifier(signal);
 await validateGelatoConnectedOrdersWithFiles([provider],saved.request,(reference,url,expected)=>{
  const member=context.members.find(m=>m.item_reference_id===reference); if(!member)throw Error('release_provider_item_unknown');
  const authorized=permit.artifacts.find(a=>a.itemReferenceId===reference);
  const actual=provider.items.find(i=>i.itemReferenceId===reference);
  if(!actual || actual.id!==authorized?.providerItemId)throw Error('release_provider_item_changed');
  return verifyStoredFile(member,url,expected);
 },true);
 // Also check IDs when provider echoes the original file URL (no verifier callback).
 if(provider.items.some(item=>!permit.artifacts.some(a=>a.itemReferenceId===item.itemReferenceId && a.providerItemId===item.id)))throw Error('release_provider_item_changed');
 const request={orderReferenceId:saved.request.orderReferenceId,customerReferenceId:saved.request.customerReferenceId,currency:saved.request.currency,
  recipient:saved.request.shippingAddress,allowMultipleQuotes:false as const,products:saved.request.items};
 const rawQuote=await requestGelatoQuote(request,{apiKey:d.apiKey,fetcher:manualTransport(d),signal});
 const money=z.union([OrdinaryPayableEvidenceSchema,GelatoReleaseEstimateSchema]).parse(await d.payableEvidence(rawQuote,{
  accountSha256:permit.accountSha256,request,config:saved.config,shippingTier:saved.shippingTier,now:now(d)}));
 if(('pricingPolicy' in permit)!==(money.source==='gelato_product_shipping_estimate'))throw Error('release_pricing_evidence_mismatch');
 const selected=validateGelatoQuote({response:rawQuote,request,config:saved.config,shippingTier:saved.shippingTier,quotedAt:money.quotedAt,now:now(d)});
 if(money.quoteResponseSha256!==ordinaryReleaseDigest(rawQuote) || money.accountSha256!==permit.accountSha256 || money.quoteId!==selected.quoteId || money.requestFingerprint!==selected.requestFingerprint ||
  money.currency!==permit.currency || selected.shipmentMethodUid!==saved.request.shipmentMethodUid)throw Error('release_payable_binding_mismatch');
 const currentQuote=observeGelatoMonetaryQuote(rawQuote,selected,saved.request.currency);
 const projected=structuredClone(context), currentSaved=structuredClone(saved);
 currentSaved.monetaryQuote=currentQuote;
 Object.assign(projected.submission,{request_snapshot:currentSaved,quote_id:selected.quoteId,quote_request_fingerprint:selected.requestFingerprint});
 const boundOrder=async(key:string)=>{
  const row=await d.order(key), a=permit.artifacts.find(a=>context.members.some(m=>m.child_order_key===key&&m.child_order_id===a.childOrderId));
  const info=typeof row?.product_info==='string'?JSON.parse(row.product_info):row?.product_info;
  const quantity=row?.quantity??(info as {quantity?:unknown}|undefined)?.quantity??1;
  const item=saved.request.items.find(item=>item.itemReferenceId===a?.itemReferenceId);
  const stages=row?.review_stages as {postPdf?:{status?:unknown}}|undefined;
  if(!row || !a || !Number.isSafeInteger(quantity) || quantity!==item?.quantity || row.orderId!==key || row.print_claim_token!==context.submission.claim_token || row.shipping_tier!==saved.shippingTier ||
   (row.root_order_id??row.amazon_order_id??row.orderId)!==context.submission.root_order_id || row.print_book_id!==a.bookId || row.print_format_id!==a.formatId ||
   row.print_config_version!==a.configVersion || row.print_product_uid!==saved.config.productUid || row.print_inner_page_count!==saved.config.innerPageCount ||
   row.print_api_page_count!==saved.config.apiPageCount || row.print_expected_pdf_page_count!==saved.config.expectedPdfPageCount ||
   !a.key.startsWith(a.bookId+'/orders/'+key+'/gelato/print/v'+a.configVersion+'/') || row.current_workflow || row.started_at || row.execution_status==='processing' || stages?.postPdf?.status!=='approved')throw Error('release_current_route_or_authority_changed');
  return {...row,quantity};
 };
 const review=await buildGelatoReleaseReview(projected,{accountKeySha256:permit.accountSha256,intendedAccountKeySha256:permit.accountSha256,
  cohortSubmissionIds:[permit.submissionId],artifactSha256:new Map(permit.artifacts.map(a=>[a.key,a.sha256])),loadArtifact:d.artifact,loadOrder:boundOrder,now:now(d)});
 const blockers=review.blockers.filter(reason=>!preparationOnly.has(reason));
 if(blockers.length)throw Error('release_review_blocked:'+blockers.join(','));
 if(review.productsCents!==money.productsCents || review.shippingCents!==money.shippingCents)throw Error('release_payable_components_mismatch');
 if('pricingPolicy' in permit){
  if(money.source!=='gelato_product_shipping_estimate'||String(BigInt(money.productsCents)+BigInt(money.shippingCents))!==money.quotedSubtotalCents||
   BigInt(money.quotedSubtotalCents)>BigInt(permit.maximumQuotedSubtotalCents))throw Error('release_estimate_limit_or_arithmetic');
 }else{
  if(money.source!=='verified_provider_payable')throw Error('release_verified_total_required');
  const total=BigInt(money.productsCents)+BigInt(money.shippingCents)+BigInt(money.taxesCents)+BigInt(money.feesCents)-BigInt(money.discountCents);
  if(total<BigInt(0) || total.toString()!==money.totalCents || total>BigInt(permit.maximumTotalCents))throw Error('release_spend_limit_or_arithmetic');
 }
 // Validate every monetary line's cent precision, including aggregate quantity lines.
 for(const product of currentQuote.products){if(product.price===null)throw Error('release_unknown_product_cost');amounts(product.price);}
 await assertPrinterSendAuthority(saved.request.items,now(d)); signal.throwIfAborted(); assertPermit(permit,d);
 const basePacket={permitId:permit.id,approvedAt:permit.approvedAt,expiresAt:permit.expiresAt,submissionId:permit.submissionId,providerOrderId:permit.providerOrderId,accountSha256:permit.accountSha256,
  originalRequestSha256:ordinaryReleaseDigest(saved),artifacts:permit.artifacts.map(a=>({...a,pdfPageCount:context.members.find(m=>m.child_order_id===a.childOrderId)!.pdf_page_count})),destinationSha256:ordinaryReleaseDigest(saved.request.shippingAddress),
  shippingTier:saved.shippingTier,shipmentMethodUid:saved.request.shipmentMethodUid,currency:permit.currency};
 const freshPacket=AnyOrdinaryReleasePacketSchema.parse('pricingPolicy' in permit?
  {...basePacket,version:3,pricingPolicy:permit.pricingPolicy,maximumQuotedSubtotalCents:permit.maximumQuotedSubtotalCents,estimate:money}:
  {...basePacket,version:2,maximumTotalCents:permit.maximumTotalCents,payable:money});
 // Quote IDs/timestamps/response hashes are observation provenance, not price or
 // spending authority. Preserve the complete approved packet for SQL/audit, but
 // compare every commercial/authority field with independently validated fresh evidence.
 const terms=(packet:AnyOrdinaryReleasePacket)=>{
  const value=packet.version===2?packet.payable:packet.estimate;
  const {quoteId:_quoteId,quotedAt:_quotedAt,quoteResponseSha256:_quoteHash,responseSha256:_responseHash,...commercial}=value;
  return packet.version===2?{...packet,payable:commercial}:{...packet,estimate:commercial};
 };
 const packet=approvedPacket===undefined?freshPacket:AnyOrdinaryReleasePacketSchema.parse(approvedPacket);
 if(approvedPacket!==undefined && (ordinaryReleaseDigest(packet)!==permit.packetSha256 ||
  ordinaryReleaseDigest(terms(packet))!==ordinaryReleaseDigest(terms(freshPacket))))throw Error('release_approved_packet_changed');
 const approvedAge=now(d).getTime()-Date.parse((packet.version===2?packet.payable:packet.estimate).quotedAt);
 if(!Number.isFinite(approvedAge)||approvedAge<0||approvedAge>15*60000)throw Error('release_approved_quote_expired');
 const currentAuthority=async()=>{
  const latest=await d.context(permit.submissionId);
  const binding=(c:GelatoSubmissionContext)=>({submission:c.submission,members:c.members,providerOrders:c.providerOrders});
  if(ordinaryReleaseDigest(binding(latest))!==ordinaryReleaseDigest(binding(context)))throw Error('release_context_changed');
  const finalReview=await buildGelatoReleaseReview(projected,{accountKeySha256:permit.accountSha256,intendedAccountKeySha256:permit.accountSha256,
   cohortSubmissionIds:[permit.submissionId],artifactSha256:new Map(permit.artifacts.map(a=>[a.key,a.sha256])),loadArtifact:d.artifact,loadOrder:boundOrder,now:now(d)});
  if(finalReview.blockers.some(reason=>!preparationOnly.has(reason)))throw Error('release_final_authority_changed');
  await assertPrinterSendAuthority(saved.request.items,now(d)); assertPermit(permit,d); signal.throwIfAborted();
 };
 return {packet,packetSha256:ordinaryReleaseDigest(packet),currentObservation:money,currentAuthority};
}
async function bounded<T>(signal: AbortSignal, work:()=>Promise<T>):Promise<T>{
 signal.throwIfAborted();
 return new Promise((resolve,reject)=>{
  const abort=()=>reject(Error('release_deadline_exceeded')); signal.addEventListener('abort',abort,{once:true});
  Promise.resolve().then(work).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
 });
}
export async function executeOrdinaryRelease(id:string,d:OrdinaryReleaseDependencies){
 z.string().uuid().parse(id);
 const budget=d.budgetMs??30000;
 if(!Number.isSafeInteger(budget)||budget<1||budget>30000)throw Error('release_invalid_budget');
 const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),budget);
 let owner:string|undefined, attempted=false, authorizationAttempted=false;
 try{
  if(!await bounded(controller.signal,()=>d.enabled?.()??Promise.resolve(false)))return {state:'disabled' as const,providerMutationAttempted:false};
  if(!d.apiKey.trim() || typeof d.fetcher!=='function')throw Error('release_runtime_not_installed');
  const acquired=await bounded(controller.signal,()=>d.store.acquire(id,keyDigest(d.apiKey),now(d).toISOString()));
  if(acquired.kind!=='acquired')return {state:acquired.kind,providerMutationAttempted:false};
  owner=z.string().uuid().parse(acquired.ownerToken);
  const permit=AnyOrdinaryReleasePermitSchema.parse(acquired.permit);
  if(permit.id!==id)throw Error('release_permit_identity_mismatch');
  const approvedPacket=d.approvedPacket?await bounded(controller.signal,()=>d.approvedPacket!(id)):undefined;
  if(d.approvedPacket && approvedPacket==null)throw Error('release_recorded_packet_missing');
  const prepared=await bounded(controller.signal,()=>prepareOrdinaryRelease(permit,d,controller.signal,approvedPacket));
  if(prepared.packetSha256!==permit.packetSha256)throw Error('release_approved_packet_changed');
  if(!await bounded(controller.signal,()=>d.enabled!()))throw Error('release_disabled_before_send');
  assertPermit(permit,d); controller.signal.throwIfAborted();
  authorizationAttempted=true;
  const authorized=await bounded(controller.signal,()=>d.store.authorizeSend(id,owner!,prepared.packetSha256,now(d).toISOString()));
  if(!authorized)throw Error('release_send_ownership_unconfirmed');
  controller.signal.throwIfAborted();
  // Final authority check after durable send authorization. If it fails, no send;
  // the consumed permit is held and can never be used for a second attempt.
  if(!await bounded(controller.signal,()=>d.enabled!()))throw Error('release_disabled_after_authorization');
  await bounded(controller.signal,prepared.currentAuthority);
  if(!await bounded(controller.signal,()=>d.enabled!()))throw Error('release_disabled_at_transport');
  assertPermit(permit,d); controller.signal.throwIfAborted();
  attempted=true;
  try {
   const response=await bounded(controller.signal,()=>d.fetcher(`https://order.gelatoapis.com/v4/orders/${permit.providerOrderId}`,{
    method:'PATCH',headers:{'X-API-KEY':d.apiKey,'Content-Type':'application/json'},body:JSON.stringify({orderType:'order'}),redirect:'manual',signal:controller.signal}));
   // The mutation response is not the authoritative result. Never follow a redirect
   // or repeat PATCH, including when response headers/body are lost.
   if(response.body)void response.body.cancel().catch(()=>undefined);
  }catch{ /* A bounded read may still establish the first attempt's outcome. */ }
  const observation=await bounded(controller.signal,()=>observeOrdinaryRelease(permit,d,controller.signal));
  const outcome:OrdinaryReleaseOutcome=observation.converted?'converted':'outcome_unknown';
  const persisted=await bounded(AbortSignal.timeout(1000),()=>d.store.finish(id,owner!,outcome,observation.orders)).catch(()=>false);
  return {state:outcome,providerMutationAttempted:true,persistenceConfirmed:persisted};
 }catch{
  const outcome:OrdinaryReleaseOutcome=attempted||authorizationAttempted?'outcome_unknown':'preflight_failed';
  const persisted=owner?await bounded(AbortSignal.timeout(1000),()=>d.store.finish(id,owner!,outcome)).catch(()=>false):false;
  return {state:outcome,providerMutationAttempted:attempted,persistenceConfirmed:persisted};
 }finally{clearTimeout(timer);}
}

/** Read-only reconciliation primitive. Does not authorize, convert, retry or close a permit.
 * The persistent adapter must fence observations against an active sender. */
export function observeOrdinaryRelease(permitValue:unknown,d:OrdinaryReleaseDependencies,signal:AbortSignal){
 return bounded(signal,()=>performOrdinaryReleaseObservation(permitValue,d,signal));
}
async function performOrdinaryReleaseObservation(permitValue:unknown,d:OrdinaryReleaseDependencies,signal:AbortSignal){
 const permit=AnyOrdinaryReleasePermitSchema.parse(permitValue);
 // Reconciliation remains useful after approval expiry; exact account and bindings still apply.
 if(!d.apiKey.trim() || keyDigest(d.apiKey)!==permit.accountSha256)throw Error('release_account_mismatch');
 const context=await d.context(permit.submissionId); signal.throwIfAborted();
 if(context.submission.id!==permit.submissionId || context.submission.accepted_root_order_id!==permit.providerOrderId ||
  context.providerOrders.length!==1 || context.providerOrders[0].provider_order_id!==permit.providerOrderId || context.members.length!==permit.artifacts.length)throw Error('release_recovery_graph_changed');
 const saved=GelatoSavedSnapshotSchema.parse(context.submission.request_snapshot);
 if(ordinaryReleaseDigest(saved)!==permit.requestSnapshotSha256)throw Error('release_approved_snapshot_mismatch');
 if(saved.request.orderReferenceId!==context.submission.order_reference_id || saved.request.customerReferenceId!==context.submission.root_order_id)throw Error('release_recovery_identity_changed');
 await assertArtifactScope(permit,context,saved);
 const actual=await getGelatoOrder(permit.providerOrderId,{apiKey:d.apiKey,fetcher:manualTransport(d),signal});
 if(actual.id!==permit.providerOrderId || actual.shipment?.shipmentMethodUid!==saved.request.shipmentMethodUid || actual.connectedOrderIds.length || actual.items.some(item=>!permit.artifacts.some(a=>a.itemReferenceId===item.itemReferenceId&&a.providerItemId===item.id)))throw Error('release_recovery_provider_identity_changed');
 for(const member of context.members){
  const artifact=permit.artifacts.find(a=>a.childOrderId===member.child_order_id && a.itemReferenceId===member.item_reference_id && a.providerItemId===member.provider_item_id && a.key===member.artifact_key);
  if(!artifact || member.submission_id!==permit.submissionId || member.provider_order_id!==permit.providerOrderId || keyDigestBytes(await d.artifact(artifact.key))!==artifact.sha256)throw Error('release_recovery_artifact_changed');
 }
 const verifyStoredFile=d.createStoredFileVerifier(signal);
 const orders=await validateGelatoConnectedOrdersWithFiles([actual],saved.request,(ref,url,expected)=>{
  const member=context.members.find(m=>m.item_reference_id===ref);if(!member)throw Error('release_recovery_member_missing');return verifyStoredFile(member,url,expected);
 });
 signal.throwIfAborted();return {converted:actual.orderType==='order',orders};
}
function keyDigestBytes(value:Uint8Array){return createHash('sha256').update(value).digest('hex');}
