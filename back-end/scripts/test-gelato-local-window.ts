/** Offline quote replay/negatives and readiness preparation. No private files or network. */
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,statSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {GelatoPrintConfigSchema} from '../src/lib/books/types';
import {compareLocalQuote,usdCents} from './helpers/gelato-local-price-matrix';
import {prepareLocalWindowPackage} from './helpers/gelato-local-window-package';
import type {GelatoQuoteRequest} from '../src/lib/books/gelato-api-contract';
const root=path.resolve(__dirname,'../..');
const evidence=JSON.parse(readFileSync(path.join(root,'docs/repo-workflows-planning/gelato-pricing-evidence-2026-10-19/quotes.json'),'utf8')) as {cases:Array<{name:string;observedAt:string;request:GelatoQuoteRequest;raw:{quotes:Array<Record<string,unknown>>}}>};
const config=GelatoPrintConfigSchema.parse(JSON.parse(readFileSync(path.join(root,'back-end/src/lib/books/configs/book-finding-our-inner-voice/v2.json'),'utf8')).formats.standard.print);
const amazon=GelatoPrintConfigSchema.parse(JSON.parse(readFileSync(path.join(root,'back-end/src/lib/books/configs/book-finding-our-inner-voice/v2.json'),'utf8')).formats.amazon.print);
const inspection=JSON.parse(readFileSync(path.join(root,'docs/repo-workflows-planning/gelato-live-prep-evidence-2026-10-19/pdf-inspection.json'),'utf8'));
const checks:string[]=[],mark=(s:string)=>checks.push(s),results:unknown[]=[];
const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('No network permitted');};
try{
 for(const entry of evidence.cases){
  for(const tier of Object.keys(config.shipmentMethodPolicy.tiers)){
   const result=compareLocalQuote({request:entry.request,raw:entry.raw,config,tier,at:entry.observedAt});
   assert.equal(result.productsCents,entry.name.includes('siblings')||entry.name.includes('quantity-two')?'2436':'1218');
   assert.equal(result.quantity,entry.name.includes('siblings')||entry.name.includes('quantity-two')?2:1);
   assert.equal(result.draft.orderType,'draft');assert.equal(result.draft.method,result.selectedMethod);assert.equal(result.canAuthorizePaidSubmission,false);assert.equal(result.observedReceiptTotalCents,null);
   assert.deepEqual(result.draft.fileUrls,entry.request.products.map(p=>p.files[0].url));assert.equal(result.parcels,1);
   results.push({case:entry.name,tier,selected:result.selectedMethod,productsCents:result.productsCents,shippingCents:result.shippingCents,quantity:result.quantity,parcels:result.parcels,delivery:result.deliveryEstimate});
   mark(entry.name+' '+tier+': canonical quote selection -> money -> held draft; aggregate line prices and exact file/quantity preserved');
  }
 }
 const e=evidence.cases[0];
 const input=()=>({request:structuredClone(e.request),raw:structuredClone(e.raw),config:structuredClone(config),tier:'standard',at:e.observedAt});
 const quote=(v:ReturnType<typeof input>)=>v.raw.quotes[0];
 const methods=(v:ReturnType<typeof input>)=>quote(v).shipmentMethods as Array<Record<string,unknown>>;
 const variants:Array<[string,(v:ReturnType<typeof input>)=>void]>=[
  ['Unsupported destination rejects without fallback',v=>{v.request.recipient.country='ZZ';}],
  ['Unsupported tier rejects without fallback',v=>{v.tier='overnight-unknown';}],
  ['Unavailable selected method rejects',v=>{quote(v).shipmentMethods=methods(v).filter(s=>s.shipmentMethodUid!=='usps_ground_advantage');}],
  ['Changed quote quantity rejects',v=>{(quote(v).products as Array<Record<string,unknown>>)[0].quantity=9;}],
  ['Changed physical/API page contract rejects',v=>{v.request.products[0].pageCount=35;}],
  ['Changed product contract rejects',v=>{v.request.products[0].productUid='foreign';}],
  ['Provider quote expiry rejects',v=>{quote(v).expirationDateTime=new Date(Date.parse(v.at)-1).toISOString();}],
  ['Currency mismatch rejects',v=>{methods(v)[0].currency='EUR';}],
  ['Partial provider errors reject',v=>{(v.raw as Record<string,unknown>).errors=[{message:'unavailable'}];}],
 ];
 for(const [name,mutate]of variants){const v=input();mutate(v);assert.throws(()=>compareLocalQuote(v));mark(name);}
 const sibling=evidence.cases.find(e=>e.name.includes('siblings'))!;const split={...input(),request:structuredClone(sibling.request),raw:structuredClone(sibling.raw),at:sibling.observedAt};methods(split).forEach(s=>{s.packageCount=2;});assert.equal(compareLocalQuote(split).parcels,2);mark('Synthetic sibling/split parcel count is preserved, never labelled a real split shipment');
 const unknown=input();(quote(unknown).products as Array<Record<string,unknown>>)[0].price=null;delete methods(unknown)[0].price;const u=compareLocalQuote(unknown);assert.equal(u.productsCents,null);assert.equal(u.shippingCents,null);assert.equal(u.knownProductShippingSubtotalCents,null);mark('Missing product/shipping costs remain unknown, never zero');
 const precision=input();methods(precision)[0].price='1.001';assert.equal(compareLocalQuote(precision).shippingCents,null);mark('Sub-cent precision is not silently rounded into payable cents');
 const reprice=input();const before=compareLocalQuote(reprice);methods(reprice)[0].price=99;const after=compareLocalQuote(reprice);assert.notEqual(after.shippingCents,before.shippingCents);assert.equal(after.canAuthorizePaidSubmission,false);mark('Synthetic changed shipping estimate is visible and never approves a price cap');
 const receipt={financialStatus:'draft',receipts:[{id:'SYNTHETIC-RECEIPT',orderId:'SYNTHETIC-ORDER',transactionType:'purchase',currency:'USD',isCalculated:true,productsPrice:'12.18',shippingPrice:'99',totalVat:'1.23',packagingPrice:'0.50',discount:'0.25',totalInclVat:'112.66',items:[]}]};
 const compared=compareLocalQuote({...input(),receipt});assert.equal(compared.receiptProductsDeltaCents,'0');assert.notEqual(compared.receiptShippingDeltaCents,'0');assert.equal(compared.observedReceiptTotalCents,'11266');assert.equal(compared.canAuthorizePaidSubmission,false);assert(compared.unresolved.includes('provider-enforced maximum charge'));mark('Synthetic receipt differences and tax/packaging/discount fields remain observations, not a binding pre-charge total');
 const partial=structuredClone(receipt);delete (partial.receipts[0] as Partial<typeof partial.receipts[0]>).totalInclVat;assert.equal(compareLocalQuote({...input(),receipt:partial}).observedReceiptTotalCents,null);mark('Partial receipt never becomes a complete payable total');
 const unbound=compareLocalQuote({...input(),receipt:{financialStatus:'draft',receipts:[{transactionType:'purchase',currency:'USD',isCalculated:false,totalInclVat:'15.99'}]}});assert(unbound.unresolved.includes('complete account/order/item-bound receipt'));assert(unbound.unresolved.includes('calculated receipt'));assert.equal(unbound.receiptIdentityVerified,false);mark('Syntactically valid receipt cannot remove ownership or calculation blockers');
 assert.equal(usdCents('12.18'),BigInt(1218));for(const value of [null,'-1','1.001','NaN','01','1e3'])assert.equal(usdCents(value),null);mark('USD exact decimal conversion rejects ambiguous precision, negative and exponent costs');
 const ready=prepareLocalWindowPackage(inspection,config,amazon);assert.equal(ready.executable,false);assert.equal(ready.canApprove,false);assert.equal(ready.cases.length,3);assert.equal(ready.artifacts.length,4);assert.equal(ready.proposal.totalQuotes,9);assert.equal(ready.proposal.primaryWorkflowQuotes+ready.proposal.additionalTierQuotes,9);assert.equal(ready.missing.length,8);mark('Three-case/four-PDF package retains all live blockers and nine-quote proposal without issuing authority');
 for(const mutate of [(v:typeof inspection)=>{v.results[0].sha256=v.results[1].sha256;},(v:typeof inspection)=>{v.results[0].role='unknown';},(v:typeof inspection)=>{[v.results[0].sha256,v.results[1].sha256]=[v.results[1].sha256,v.results[0].sha256];},(v:typeof inspection)=>{v.results[0].sha256='b'.repeat(64);},(v:typeof inspection)=>{v.results[0].pageCount=32;},(v:typeof inspection)=>{v.results[0].allPageBoxesCorrect=false;}]){const v=structuredClone(inspection);mutate(v);assert.throws(()=>prepareLocalWindowPackage(v,config,amazon));}mark('Swapped/unknown fixture roles, duplicate bytes and invalid geometry/page evidence reject');
 assert.throws(()=>prepareLocalWindowPackage(inspection,{...config,shipmentMethodPolicy:{...config.shipmentMethodPolicy,tiers:{standard:config.shipmentMethodPolicy.tiers.standard}}},amazon));mark('Changed shipping policy requires renewed preparation review');
 const temp=mkdtempSync(path.join(os.tmpdir(),'lhl-readiness-cli-'));try{
  const out=path.join(temp,'new-private');const run=()=>spawnSync(process.execPath,['--import','tsx',path.join(__dirname,'prepare-gelato-local-window.ts'),'--out',out],{env:{PATH:process.env.PATH,NODE_ENV:'test'},encoding:'utf8'});
  assert.equal(run().status,0);const resultFile=path.join(out,'readiness.json'),before=readFileSync(resultFile,'utf8');assert.equal(JSON.parse(before).canIssueScope,false);assert.equal(JSON.parse(before).executable,false);assert.equal(statSync(out).mode&0o777,0o700);assert.equal(statSync(resultFile).mode&0o777,0o600);assert.notEqual(run().status,0);assert.equal(readFileSync(resultFile,'utf8'),before);mark('Actual local compiler writes private non-executable output and refuses overwrite');
 }finally{rmSync(temp,{recursive:true,force:true});}
 console.log(JSON.stringify({kind:'offline-retained-response-replay-and-explicit-synthetic-negatives',checks:checks.length,passed:checks,replayedQuotes:results,providerCalls:0,orderReads:0,orderWrites:0,deployments:0,customerMessages:0}));
}finally{globalThis.fetch=original;}
