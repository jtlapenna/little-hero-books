/** Offline replay of redacted, real quote-only responses. No business transport is available. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateGelatoQuote, type GelatoQuoteRequest } from '../src/lib/books/gelato-api-contract';
import { observeGelatoMonetaryQuote, GelatoMonetaryQuoteSchema } from '../src/lib/books/gelato-financial-observation';
import { GelatoPrintConfigSchema } from '../src/lib/books/types';

const evidence=JSON.parse(readFileSync(resolve(__dirname,'../../docs/repo-workflows-planning/gelato-pricing-evidence-2026-10-19/quotes.json'),'utf8')) as {cases:Array<{name:string;observedAt:string;request:GelatoQuoteRequest;raw:Record<string,unknown>}>};
const config=GelatoPrintConfigSchema.parse(JSON.parse(readFileSync(resolve(__dirname,'../src/lib/books/configs/book-finding-our-inner-voice/v2.json'),'utf8')).formats.standard.print);
const checks:string[]=[];
const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('No network allowed in pricing replay');};
try {
 for(const entry of evidence.cases){
  for(const tier of Object.keys(config.shipmentMethodPolicy.tiers)){
   const selected=validateGelatoQuote({response:entry.raw,request:entry.request,config,shippingTier:tier,quotedAt:entry.observedAt,now:new Date(entry.observedAt)});
   const observed=observeGelatoMonetaryQuote(entry.raw,selected,'USD');
   assert.equal(observed.providerExpiresAt,(entry.raw.quotes as Array<Record<string,unknown>>)[0].expirationDateTime);
   assert.equal(observed.shippingOptions.find(s=>s.shipmentMethodUid===selected.shipmentMethodUid)?.numberOfParcels,1,'Live packageCount must survive quote normalization');
   assert.equal(observed.products.reduce((sum,p)=>sum+Math.round(Number(p.price)*100),0),entry.name.includes('siblings')||entry.name.includes('quantity-two')?2436:1218);
   checks.push(entry.name+': '+tier+' exact service, aggregate cost and single quoted parcel');
  }
 }
 const entry=evidence.cases[0], base={response:entry.raw,request:entry.request,config,shippingTier:'standard',quotedAt:entry.observedAt,now:new Date(entry.observedAt)};
 const quote=(raw:Record<string,unknown>)=>(raw.quotes as Array<Record<string,unknown>>)[0];
 const selected=validateGelatoQuote(base);
 const variants=(change:(raw:Record<string,unknown>)=>void)=>{const raw=structuredClone(entry.raw);change(raw);return raw;};
 assert.throws(()=>validateGelatoQuote({...base,response:variants(raw=>{raw.errors=[{message:'some products could not be quoted'}];})}));checks.push('Partial provider errors reject even with an apparently valid quote');
 assert.throws(()=>validateGelatoQuote({...base,response:variants(raw=>{quote(raw).expirationDateTime=new Date(Date.parse(entry.observedAt)-1).toISOString();})}));checks.push('Provider-expired quote rejects inside the local 15 minute window');
 assert.throws(()=>validateGelatoQuote({...base,response:variants(raw=>{quote(raw).expirationDateTime='invalid';})}));checks.push('Malformed provider expiry rejects');
 assert.throws(()=>validateGelatoQuote({...base,now:new Date(Date.parse(entry.observedAt)+16*60000)}));checks.push('Provider 24 hour expiry never extends the local 15 minute maximum');
 const legacy=variants(raw=>{delete quote(raw).expirationDateTime;delete raw.errors;});
 assert.doesNotThrow(()=>validateGelatoQuote({...base,response:legacy}));
 const legacyObserved=observeGelatoMonetaryQuote(legacy,selected,'USD');assert(!('providerExpiresAt' in legacyObserved));
 assert.deepEqual(GelatoMonetaryQuoteSchema.parse(legacyObserved),legacyObserved);checks.push('Legacy quote parsing preserves exact shape without inserting expiry defaults');
 assert.throws(()=>validateGelatoQuote({...base,response:variants(raw=>{quote(raw).shipmentMethods=(quote(raw).shipmentMethods as Array<Record<string,unknown>>).filter(s=>s.shipmentMethodUid!=='usps_ground_advantage');})}));checks.push('Missing requested service rejects without an unintended fallback');
 assert.throws(()=>validateGelatoQuote({...base,response:variants(raw=>{const s=quote(raw).shipmentMethods as unknown[];s.push(structuredClone(s[0]));})}));checks.push('Duplicate exact shipping UID rejects');
 const aliases=(change:(s:Record<string,unknown>)=>void)=>variants(raw=>{change((quote(raw).shipmentMethods as Array<Record<string,unknown>>)[0]);});
 assert.equal(observeGelatoMonetaryQuote(aliases(s=>{s.numberOfParcels=2;delete s.packageCount;}),selected,'USD').shippingOptions[0].numberOfParcels,2);checks.push('Documented legacy numberOfParcels remains supported');
 assert.equal(observeGelatoMonetaryQuote(aliases(s=>{s.numberOfParcels=1;}),selected,'USD').shippingOptions[0].numberOfParcels,1);checks.push('Matching parcel aliases accepted');
 assert.throws(()=>observeGelatoMonetaryQuote(aliases(s=>{s.numberOfParcels=2;}),selected,'USD'));checks.push('Conflicting parcel aliases reject');
 for(const value of [-1,1.5,'1',NaN])assert.throws(()=>observeGelatoMonetaryQuote(aliases(s=>{s.packageCount=value;}),selected,'USD'));
 checks.push('Negative, fractional, string and NaN parcel counts reject');
 assert.equal(observeGelatoMonetaryQuote(aliases(s=>{delete s.packageCount;}),selected,'USD').shippingOptions[0].numberOfParcels,null);checks.push('Missing parcel count stays unknown');
 const summary={kind:'offline-real-response-replay-and-synthetic-negatives',checks:checks.length,passed:checks,providerCalls:0,ordersRead:0,ordersWritten:0};
 if(process.env.GELATO_PRICING_REPLAY_OUTPUT)writeFileSync(process.env.GELATO_PRICING_REPLAY_OUTPUT,JSON.stringify(summary,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify(summary));
} finally {globalThis.fetch=original;}
