/** John's disclosed-estimate policy. A quote is not a final charge or charge cap. */
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {validateGelatoQuote,type GelatoQuoteRequest} from './gelato-api-contract';
import {observeGelatoMonetaryQuote} from './gelato-financial-observation';
import type {GelatoSavedSnapshot} from './gelato-submission';

export const ESTIMATE_TEST_PRINT_POLICY='disclosed_estimate_test_print_v1' as const;
const Hash=z.string().regex(/^[a-f0-9]{64}$/),Cents=z.string().regex(/^(0|[1-9]\d{0,11})$/);
export const GelatoReleaseEstimateSchema=z.object({source:z.literal('gelato_product_shipping_estimate'),accountSha256:Hash,
 quoteId:z.string().min(1),requestFingerprint:Hash,quotedAt:z.string().datetime({offset:true}),currency:z.literal('USD'),
 productsCents:Cents,shippingCents:Cents,quotedSubtotalCents:Cents,taxesCents:z.null(),feesCents:z.null(),discountCents:z.null(),totalCents:z.null(),
 finalChargeMayDiffer:z.literal(true),providerChargeCapEnforced:z.literal(false),quoteResponseSha256:Hash,responseSha256:Hash}).strict();
export type GelatoReleaseEstimate=z.infer<typeof GelatoReleaseEstimateSchema>;
export interface ReleaseQuoteContext {accountSha256:string;request:GelatoQuoteRequest;config:GelatoSavedSnapshot['config'];shippingTier:string;now:Date}
const canonical=(v:unknown):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.entries(v).filter(([,x])=>x!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>JSON.stringify(k)+':'+canonical(x)).join(',')+'}':JSON.stringify(v);
const digest=(v:unknown)=>createHash('sha256').update(canonical(v)).digest('hex');
function cents(v:string|null){
 if(v===null||!/^(0|[1-9]\d{0,10})(\.\d{1,2})?$/.test(v))throw Error('estimate_amount_unknown_or_imprecise');
 const [whole,part='']=v.split('.');return BigInt(whole)*BigInt(100)+BigInt(part.padEnd(2,'0'));
}
export function observeGelatoReleaseEstimate(rawQuote:unknown,context:ReleaseQuoteContext):GelatoReleaseEstimate{
 const selected=validateGelatoQuote({response:rawQuote,request:context.request,config:context.config,
  shippingTier:context.shippingTier,quotedAt:context.now.toISOString(),now:context.now});
 const quote=observeGelatoMonetaryQuote(rawQuote,selected,context.request.currency);
 const shipping=quote.shippingOptions.filter(v=>v.shipmentMethodUid===selected.shipmentMethodUid);
 if(quote.currency!=='USD'||shipping.length!==1||shipping[0].currency!=='USD'||quote.products.some(v=>v.currency!=='USD'))throw Error('estimate_currency_or_service_unknown');
 // Provider product prices are line totals, including quantity; do not multiply again.
 const products=quote.products.reduce((sum,v)=>sum+cents(v.price),BigInt(0)),shipment=cents(shipping[0].price);
 const hash=digest(rawQuote);
 return GelatoReleaseEstimateSchema.parse({source:'gelato_product_shipping_estimate',accountSha256:context.accountSha256,
  quoteId:selected.quoteId,requestFingerprint:selected.requestFingerprint,quotedAt:selected.quotedAt,currency:'USD',
  productsCents:String(products),shippingCents:String(shipment),quotedSubtotalCents:String(products+shipment),
  taxesCents:null,feesCents:null,discountCents:null,totalCents:null,finalChargeMayDiffer:true,providerChargeCapEnforced:false,
  quoteResponseSha256:hash,responseSha256:hash});
}
