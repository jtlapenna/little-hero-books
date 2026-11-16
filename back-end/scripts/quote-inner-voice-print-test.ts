#!/usr/bin/env tsx
/** Obtain a non-binding print/shipping quote for the local proof. Never creates an order. */
import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {BookConfigSchema} from '../src/lib/books/types';
import {sha256} from '../src/lib/books/immutable-asset-upload';
import {getObject,putObject,R2_ORDERS_BUCKET,validateR2Config} from '../src/lib/r2-client';
import {getSignedUrlForObject} from '../src/lib/r2-service';
import {buildGelatoQuoteRequest,validateGelatoQuote,type GelatoRecipient} from '../src/lib/books/gelato-api-contract';
import {requestGelatoQuote} from '../src/lib/books/gelato-api-client';
import {observeGelatoMonetaryQuote} from '../src/lib/books/gelato-financial-observation';

export function createPrintTestQuoteTransport(fetcher:typeof fetch):typeof fetch {
 return async(input,init)=>{
  const request=new Request(input,init);
  assert.equal(request.url,'https://order.gelatoapis.com/v4/orders:quote');
  assert.equal(request.method,'POST');
  return fetcher(new Request(request,{redirect:'manual'}));
 };
}

async function main(){
 assert.ok(process.argv[2],'Supply preparation directory');
 const dir=resolve(process.argv[2]),target=resolve(dir,'private/local-proof-quote.json');assert.ok(!existsSync(target),'Do not overwrite a quote');
 assert.ok(validateR2Config().valid&&process.env.R2_ORDERS_BUCKET_NAME===R2_ORDERS_BUCKET,'Explicit orders bucket required');
 const config=BookConfigSchema.parse(JSON.parse(readFileSync(resolve(dir,'candidate-verified/release-config.json'),'utf8')));
 const print=config.formats.amazon.print;assert.equal(print.provider,'gelato');
 const rows=JSON.parse(readFileSync(resolve(dir,'print-pdfs/canonical-assembly-receipt.json'),'utf8')) as Array<{formatId:string;file:string;sha256:string;bytes:number}>;
 const artifact=rows.find(row=>row.formatId==='amazon');assert.ok(artifact);
 const data=readFileSync(artifact.file);assert.equal(sha256(data),artifact.sha256);assert.equal(data.byteLength,artifact.bytes);
 const key=`print-tests/20261115/local-proof/${artifact.sha256}/amazon-canonical.pdf`;
 const existing=await getObject(R2_ORDERS_BUCKET,key,{allowNotFound:true});
 if(existing.status===404){const uploaded=await putObject(R2_ORDERS_BUCKET,key,data,'application/pdf',{ifNoneMatch:'*'});assert.ok(uploaded.ok||uploaded.status===412);}
 else{assert.ok(existing.ok);assert.equal(sha256(new Uint8Array(await existing.arrayBuffer())),artifact.sha256);}
 const verified=await getObject(R2_ORDERS_BUCKET,key);assert.ok(verified.ok);assert.equal(sha256(new Uint8Array(await verified.arrayBuffer())),artifact.sha256);
 const fileUrl=await getSignedUrlForObject(key,R2_ORDERS_BUCKET,86400);
 const recipient=JSON.parse(readFileSync(resolve(dir,'private/recipient.json'),'utf8')) as GelatoRecipient;
 const request=buildGelatoQuoteRequest({orderReferenceId:'LOCAL-PROOF-QUOTE-20261115-A',customerReferenceId:'PRINT-PREP-20261115',currency:'USD',recipient,
  items:[{itemReferenceId:'LOCAL-PROOF-QUOTE-20261115-A-1',productUid:print.productUid,pageCount:print.apiPageCount,quantity:1,fileUrl}],config:print});
 let providerCalls=0;
 const fetcher=createPrintTestQuoteTransport(async(input,init)=>{providerCalls++;return fetch(input,init);});
 const quotedAt=new Date().toISOString(),raw=await requestGelatoQuote(request,{fetcher});
 const selected=validateGelatoQuote({request,response:raw,config:print,shippingTier:'standard',quotedAt,now:new Date()});
 const monetary=observeGelatoMonetaryQuote(raw,selected,'USD');
 writeFileSync(target,JSON.stringify({request,response:raw,selected,monetary,fileSha256:artifact.sha256,localProofOnly:true,notAnOrder:true},null,2)+'\n',{flag:'wx',mode:0o600});
 const shipping=monetary.shippingOptions.find(option=>option.shipmentMethodUid===selected.shipmentMethodUid);
 const result={schema:'lhb.inner-voice-local-proof-quote@v1',quotedAt,quoteId:selected.quoteId,productUid:print.productUid,pageCount:print.apiPageCount,quantity:1,currency:'USD',
  products:monetary.products.map(product=>({price:product.price,quantity:product.quantity})),shipping:shipping?{uid:shipping.shipmentMethodUid,price:shipping.price,minDeliveryDate:shipping.minDeliveryDate,maxDeliveryDate:shipping.maxDeliveryDate}:null,
  fileSha256:artifact.sha256,fileKey:key,providerCalls,quoteOnly:true,localProofOnly:true,actualCsvOrder:false,taxesAndFinalFeesUnknown:true,paidOrder:false};
 writeFileSync(resolve(dir,'local-proof-quote-receipt.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(__filename))
 main().catch(error=>{console.error(error instanceof Error?error.message:'Quote failed');process.exitCode=1;});
