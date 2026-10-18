/** Read-only preparation for a future ordinary release. This module cannot authorize or send an order. */
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { validateGelatoQuote } from './gelato-api-contract';
import { GelatoSavedSnapshotSchema, gelatoRecipientFromOrder } from './gelato-submission';
import { GelatoMonetaryQuoteSchema } from './gelato-financial-observation';
import { gelatoApprovalBlocker } from './gelato-print-admission';
import type { GelatoSubmissionContext } from './gelato-submission-store';

function cents(value: string | null): bigint | null {
  if(value===null || !/^(0|[1-9]\d{0,10})(\.\d{1,2})?$/.test(value))return null;
  const [whole,fraction='']=value.split('.');return BigInt(whole)*BigInt(100)+BigInt(fraction.padEnd(2,'0'));
}
const hash=(value:Uint8Array|string)=>createHash('sha256').update(value).digest('hex');
export async function buildGelatoReleaseReview(context: GelatoSubmissionContext, inputs: {
  accountKeySha256:string; intendedAccountKeySha256:string; cohortSubmissionIds:readonly string[];
  artifactSha256:ReadonlyMap<string,string>; loadArtifact:(key:string)=>Promise<Uint8Array>;
  loadOrder:(key:string)=>Promise<Record<string,unknown>|null>; now?:Date;
}) {
 const blockers=new Set<string>();
 if(!/^[a-f0-9]{64}$/.test(inputs.accountKeySha256)||inputs.accountKeySha256!==inputs.intendedAccountKeySha256)throw new Error('account_identity_mismatch');
 if(!inputs.cohortSubmissionIds.includes(context.submission.id))throw new Error('outside_explicit_cohort');
 const saved=GelatoSavedSnapshotSchema.parse(context.submission.request_snapshot);
 const quote=GelatoMonetaryQuoteSchema.safeParse(saved.monetaryQuote);
 if(context.submission.request_state!=='submitted'||context.providerOrders.length!==1||context.providerOrders.some(o=>o.order_type!=='draft'||o.status!=='draft'||o.action_reason&&o.action_reason!=='awaiting_draft_review'))blockers.add('current_draft_review_required');
 const memberIds=new Set(context.members.map(m=>m.item_reference_id));
 if(memberIds.size!==context.members.length||saved.request.items.length!==context.members.length||saved.request.items.some(i=>!memberIds.has(i.itemReferenceId)))blockers.add('item_membership_mismatch');
 const artifacts=[];
 for(const member of context.members){
  const row=await inputs.loadOrder(member.child_order_key);const item=saved.request.items.find(i=>i.itemReferenceId===member.item_reference_id);
  if(!row||row.id!==member.child_order_id||row.print_provider!=='gelato'||row.print_submission_id!==context.submission.id||gelatoApprovalBlocker(row)||row.human_approved!==true)blockers.add('current_approval_or_ownership_missing');
  if(!item||item.quantity!==Number(row?.quantity??1)||item.pageCount!==saved.config.apiPageCount||item.productUid!==saved.config.productUid||member.pdf_page_count!==saved.config.expectedPdfPageCount)blockers.add('product_quantity_or_pages_mismatch');
  if (row) { try { if (!isDeepStrictEqual(JSON.parse(JSON.stringify(gelatoRecipientFromOrder(row))),JSON.parse(JSON.stringify(saved.request.shippingAddress)))) blockers.add('recipient_changed'); } catch { blockers.add('recipient_changed'); } }
  const expected=member.artifact_key?inputs.artifactSha256.get(member.artifact_key):undefined;
  const validKey=member.artifact_key?.match(/^([A-Za-z0-9_-]+)\/orders\/([A-Za-z0-9_-]+)\/gelato\/print\/v([1-9]\d*)\/([a-f0-9]{24})\.pdf$/);
  const actual=member.artifact_key && expected && validKey && validKey[2]===member.child_order_key && validKey[4]===member.artifact_fingerprint ? hash(await inputs.loadArtifact(member.artifact_key)):null;
  if(!expected||!/^[a-f0-9]{64}$/.test(expected)||actual!==expected)blockers.add('artifact_hash_mismatch');
  artifacts.push({childOrderId:member.child_order_id,itemReferenceId:member.item_reference_id,providerItemId:member.provider_item_id,sha256:actual,pdfPageCount:member.pdf_page_count});
 }
 let products:bigint|null=BigInt(0), shipping:bigint|null=null;
 if(!quote.success){products=null;blockers.add('original_monetary_quote_missing');}
 else {
  const q=quote.data, age=(inputs.now??new Date()).getTime()-Date.parse(q.quotedAt);
  if(!Number.isFinite(age)||age<0||age>15*60000||q.quoteId!==context.submission.quote_id||q.requestFingerprint!==context.submission.quote_request_fingerprint)blockers.add('fresh_bound_quote_required');
  try {
   const request={orderReferenceId:saved.request.orderReferenceId,customerReferenceId:saved.request.customerReferenceId,currency:saved.request.currency,recipient:saved.request.shippingAddress,allowMultipleQuotes:false as const,products:saved.request.items};
   const selected=validateGelatoQuote({request,config:saved.config,shippingTier:saved.shippingTier,quotedAt:q.quotedAt,now:inputs.now??new Date(),response:{orderReferenceId:request.orderReferenceId,quotes:[{id:q.quoteId,itemReferenceIds:q.products.map(p=>p.itemReferenceId),products:q.products,shipmentMethods:q.shippingOptions.map(s=>({shipmentMethodUid:s.shipmentMethodUid,...(s.type?{type:s.type}:{})}))}]}});
   if(selected.requestFingerprint!==q.requestFingerprint)blockers.add('fresh_bound_quote_required');
  } catch { blockers.add('fresh_bound_quote_required'); }
  if(q.currency!=='USD'||saved.request.currency!==q.currency)blockers.add('currency_mismatch');
  const selected=q.shippingOptions.filter(s=>s.shipmentMethodUid===q.selectedShipmentMethodUid);
  if(selected.length!==1||q.selectedShipmentMethodUid!==saved.request.shipmentMethodUid)blockers.add('exact_shipping_service_required');
  else {shipping=cents(selected[0].price);if(shipping===null||selected[0].currency!==q.currency){shipping=null;blockers.add('shipping_cost_unknown');}}
  if(q.products.length!==saved.request.items.length||new Set(q.products.map(p=>p.itemReferenceId)).size!==q.products.length)blockers.add('monetary_membership_mismatch');
  for(const product of q.products){
   const requested=saved.request.items.find(i=>i.itemReferenceId===product.itemReferenceId);
   if(!requested||product.quantity!==requested.quantity||product.productUid!==requested.productUid)blockers.add('monetary_membership_mismatch');
   const price=cents(product.price);
   if(price===null||product.currency!==q.currency){products=null;blockers.add('product_cost_unknown');}
   else if(products!==null)products+=price; // Provider line price; never multiply by quantity again.
  }
 }
 if(blockers.has('monetary_membership_mismatch'))products=null;
 if(blockers.has('currency_mismatch')){products=null;shipping=null;}
 const destinationSha256=hash(JSON.stringify(saved.request.shippingAddress));
 // Current retained quote contract does not establish complete taxes/fees or a final payable total.
 // Never turn a partial subtotal into a maximum spend or paid authorization.
 blockers.add('taxes_fees_and_payable_total_unverified');
 blockers.add('specific_paid_test_approval_required');
 blockers.add('ordinary_release_transport_not_installed');
 return {version:1 as const,canRelease:false as const,accountIdentityDigest:inputs.accountKeySha256,submissionId:context.submission.id,artifacts,destinationSha256,
  currency:saved.request.currency,selectedShipmentMethodUid:saved.request.shipmentMethodUid,
  productsCents:products?.toString()??null,shippingCents:shipping?.toString()??null,
  knownSubtotalCents:products!==null&&shipping!==null?(products+shipping).toString():null,payableTotalCents:null,
  blockers:[...blockers].sort(),sideEffects:'none' as const};
}
