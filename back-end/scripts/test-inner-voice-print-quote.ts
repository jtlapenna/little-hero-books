/** Exercise the real quote client and its preparation-only transport. No external requests. */
import assert from 'node:assert/strict';
import {createPrintTestQuoteTransport} from './quote-inner-voice-print-test';
import {requestGelatoQuote} from '../src/lib/books/gelato-api-client';
import type {GelatoQuoteRequest} from '../src/lib/books/gelato-api-contract';

async function main(){
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Quote test forbids external traffic');};
 try{
  const body={orderReferenceId:'LOCAL-QUOTE-BOUNDARY',currency:'USD',recipient:{email:'synthetic@example.test'},products:[]} as unknown as GelatoQuoteRequest;
  let calls=0;
  for(const status of [301,302,303,307,308]){
   const transport=createPrintTestQuoteTransport(async(input,init)=>{
    const request=new Request(input,init);calls++;
    assert.equal(request.url,'https://order.gelatoapis.com/v4/orders:quote');
    assert.equal(request.method,'POST');assert.equal(request.redirect,'manual');
    assert.equal(request.headers.get('x-api-key'),'synthetic-quote-boundary');
    assert.equal((await request.json()).recipient.email,'synthetic@example.test');
    return new Response(null,{status,headers:{location:'https://denied.invalid/orders'}});
   });
   await assert.rejects(()=>requestGelatoQuote(body,{apiKey:'synthetic-quote-boundary',fetcher:transport}),new RegExp('HTTP '+status));
  }
  const before=calls,guard=createPrintTestQuoteTransport(async()=>{calls++;return Response.json({});});
  for(const [url,method] of [['https://denied.invalid/v4/orders:quote','POST'],['https://order.gelatoapis.com/v4/orders','POST'],['https://order.gelatoapis.com/v4/orders:quote','GET']])
   await assert.rejects(()=>guard(url,{method}));
  assert.equal(calls,before);assert.equal(calls,5);
  const result=await requestGelatoQuote(body,{apiKey:'synthetic-quote-boundary',fetcher:createPrintTestQuoteTransport(async()=>Response.json({quotes:[]}))});
  assert.deepEqual(result,{quotes:[]});
  console.log('PASS quote client: five redirects rejected, wrong host/operation/method denied before transport, valid quote accepted; external requests 0');
 }finally{globalThis.fetch=original;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
