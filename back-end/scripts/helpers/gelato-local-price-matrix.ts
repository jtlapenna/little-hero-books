/** Offline comparison only: never a payable-evidence adapter or approval issuer. */
import {buildGelatoQuoteRequest,buildGelatoDraftOrderRequest,validateGelatoQuote,type GelatoQuoteRequest} from '../../src/lib/books/gelato-api-contract';
import {observeGelatoMonetaryQuote,observeGelatoFinance} from '../../src/lib/books/gelato-financial-observation';
import {GelatoPrintConfigSchema} from '../../src/lib/books/types';
import {z} from 'zod';
export function usdCents(value:string|null):bigint|null{
 if(value===null||!/^(0|[1-9]\d{0,12})(\.\d{1,2})?$/.test(value))return null;
 const [whole,fraction='']=value.split('.');return BigInt(whole)*BigInt(100)+BigInt(fraction.padEnd(2,'0'));
}
const add=(a:bigint|null,b:bigint|null)=>a===null||b===null?null:a+b;
const text=(v:bigint|null)=>v===null?null:v.toString();
export function compareLocalQuote(input:{request:GelatoQuoteRequest;raw:unknown;config:z.infer<typeof GelatoPrintConfigSchema>;tier:string;at:string;receipt?:unknown}){
 const {request:r,config}=input;
 const built=buildGelatoQuoteRequest({orderReferenceId:r.orderReferenceId,customerReferenceId:r.customerReferenceId,currency:r.currency,recipient:r.recipient,config,items:r.products.map(p=>{
  if(p.files.length!==1||p.files[0].type!=='default')throw Error('Exact quote file required');
  return {...p,fileUrl:p.files[0].url};
 })});
 if(r.currency!=='USD')throw Error('This comparison is USD only');
 const selected=validateGelatoQuote({response:input.raw,request:built,config,shippingTier:input.tier,quotedAt:input.at,now:new Date(input.at)});
 const observed=observeGelatoMonetaryQuote(input.raw,selected,'USD'),shipping=observed.shippingOptions.find(s=>s.shipmentMethodUid===selected.shipmentMethodUid);
 if(!shipping)throw Error('Selected shipping estimate absent');
 // V4 product.price is an aggregate line price for its quantity, established by retained qty-two evidence.
 const products=observed.products.reduce<bigint|null>((sum,p)=>add(sum,usdCents(p.price)),BigInt(0)),ship=usdCents(shipping.price);
 const draft=buildGelatoDraftOrderRequest({orderReferenceId:built.orderReferenceId,customerReferenceId:built.customerReferenceId,currency:built.currency,recipient:built.recipient,items:built.products.map(p=>({...p,fileUrl:p.files[0].url})),config,selectedQuote:selected,now:new Date(input.at)});
 const financial=input.receipt===undefined?null:observeGelatoFinance(input.receipt,'USD');
 // Deliberately not a trusted complete-payable source: receipts are post-submission observations.
 const receipts=financial?.reviewReason===null?financial.receipts:null;
 const receipt=receipts?.length===1&&receipts[0].transactionType==='purchase'?receipts[0]:null;
 const amounts=receipt?.amounts;
 const delta=(v:unknown,quote:bigint|null)=>{const cents=typeof v==='string'?usdCents(v):null;return cents===null||quote===null?null:(cents-quote).toString();};
 const unresolved=['binding pre-conversion total','provider-enforced maximum charge'];
 // This offline helper has no authenticated account/root/item provenance: even a complete
 // calculated receipt remains a candidate observation until the live graph is independently bound.
 unresolved.push('complete account/order/item-bound receipt');
 if(receipt?.isCalculated!==true)unresolved.push('calculated receipt');
 if(amounts)for(const name of ['totalVat','packagingPrice','discount','totalInclVat'])if(usdCents(amounts[name] as string|null)===null)unresolved.push(name);
 return {shippingTier:input.tier,selectedMethod:draft.shipmentMethodUid,quantity:built.products.reduce((n,p)=>n+p.quantity,0),lineCount:built.products.length,
  productsCents:text(products),shippingCents:text(ship),knownProductShippingSubtotalCents:text(add(products,ship)),
  parcels:shipping.numberOfParcels,deliveryEstimate:{min:shipping.minDeliveryDate,max:shipping.maxDeliveryDate},
  alternatives:observed.shippingOptions.map(s=>({method:s.shipmentMethodUid,price:s.price,initialPrice:s.initialPrice,currency:s.currency,parcels:s.numberOfParcels,min:s.minDeliveryDate,max:s.maxDeliveryDate})),
  receiptProductsDeltaCents:delta(amounts?.productsPrice,products),receiptShippingDeltaCents:delta(amounts?.shippingPrice,ship),
  observedReceiptTotalCents:text(usdCents((amounts?.totalInclVat as string|null)??null)),
  receiptIdentityVerified:false,receiptCalculated:receipt?.isCalculated??null,observedReceiptComponents:amounts??null,accountDiscountOrSubscriptionVerified:false,unresolved,canAuthorizePaidSubmission:false as const,
  draft:{orderType:draft.orderType,method:draft.shipmentMethodUid,itemQuantities:draft.items.map(i=>i.quantity),fileUrls:draft.items.map(i=>i.files[0].url)}};
}
