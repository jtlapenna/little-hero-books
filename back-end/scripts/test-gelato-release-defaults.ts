import assert from 'node:assert/strict';
async function main() {
 Object.assign(process.env, { SUPABASE_URL:'https://defaults.example.test', SUPABASE_SERVICE_ROLE_KEY:'synthetic-defaults', BACKEND_API_TOKEN:'synthetic-defaults-signing-at-least-thirty-two' });
 const prior = globalThis.fetch; let escaped = 0; globalThis.fetch = async () => { escaped++; throw Error('Live transport forbidden'); };
 try {
  const { createOrdinaryReleaseFixture: setup } = await import('./helpers/gelato-ordinary-release-fixture');
  const { prepareOrdinaryRelease } = await import('../src/lib/books/gelato-ordinary-release-core');
  const { quoteGelatoSubmission, GelatoSavedSnapshotSchema } = await import('../src/lib/books/gelato-submission');
  const { buildSiblingOrderRow } = await import('../src/lib/sibling-order-helpers');
  const source = buildSiblingOrderRow({ orderId:'SYNTHETIC-CSV-DEFAULTS',parentOrderId:'SYNTHETIC-CSV-DEFAULTS',platform:'amazon',shippingAddress:{name:'Synthetic Adult',street1:'1 Test Street',city:'Test City',state:'CA',zip:'00000',country:'US'},customerName:'Synthetic Adult',customerEmail:null,characterSpecs:{childName:'Synthetic'},characterHash:'synthetic-only',marketplaceId:null,purchaseDate:null });
  assert.equal(source.shipping_tier, undefined); assert.equal(source.customer_email, null);
  for (const kind of ['missing-tier','missing-email','both'] as const) {
   const s=await setup('amazon',1), row=s.f.rows.values().next().value!, saved=GelatoSavedSnapshotSchema.parse(s.f.context.submission.request_snapshot);
   if (kind!=='missing-email') row.shipping_tier=source.shipping_tier;
   if (kind!=='missing-tier') row.customer_email=source.customer_email;
   const context=structuredClone(s.f.context);context.submission.request_state='claimed';
   let snapshot: unknown;
   const canonical={orderId:row.orderId,orderDbId:row.id,orderPrefix:`${row.print_book_id}/orders/${row.orderId}`,rootOrderId:context.submission.root_order_id,bookConfigVersion:row.print_config_version,providerPrintConfig:saved.config};
   await quoteGelatoSubmission({submissionId:context.submission.id,claimToken:context.submission.claim_token,executionId:'synthetic-defaults',mode:'single'}, {
    store:{load:async()=>context,transition:async(name,p)=>{assert.equal(name,'record_gelato_quote_snapshot');snapshot=p.p_snapshot;return null;}},
    loadPrintInput:async()=>canonical as never,loadOrder:async()=>row,artifactExists:async()=>true,backendUrl:'https://admin.littleherolabs.com',draftsEnabled:false,merchantEmail:saved.request.shippingAddress.email,now:s.d.now,
    quote:async request=>({orderReferenceId:request.orderReferenceId,quotes:[{id:'synthetic-defaults',itemReferenceIds:request.products.map(i=>i.itemReferenceId),products:request.products.map(i=>({...i,price:12.18,currency:'USD'})),shipmentMethods:[{shipmentMethodUid:saved.request.shipmentMethodUid,type:'normal',price:5,currency:'USD'}]}]}),
   });
   const produced=GelatoSavedSnapshotSchema.parse(snapshot);assert.equal(produced.shippingTier,'standard');assert.deepEqual(produced.request.shippingAddress,saved.request.shippingAddress);
   // Same trusted server fallback used by quote; request bodies cannot supply it.
   Object.assign(s.d,{merchantEmail:saved.request.shippingAddress.email});
   await prepareOrdinaryRelease(s.permit,s.d,AbortSignal.timeout(2000));
   assert.equal(s.stats().patches,0,'review cannot send orders');
   row.shipping_tier='express';await assert.rejects(prepareOrdinaryRelease(s.permit,s.d,AbortSignal.timeout(2000)),/release_current_route_or_authority_changed/);row.shipping_tier=undefined;
   row.customer_email='changed@example.test';await assert.rejects(prepareOrdinaryRelease(s.permit,s.d,AbortSignal.timeout(2000)),/recipient_changed/);
   row.customer_email=null;Object.assign(s.d,{merchantEmail:'changed-merchant@example.test'});await assert.rejects(prepareOrdinaryRelease(s.permit,s.d,AbortSignal.timeout(2000)),/recipient_changed/);
   assert.equal(s.stats().patches,0);s.assertClean();
  }
  assert.equal(escaped,0);console.log('Actual Amazon CSV defaults → quote → release preparation passed; changed shipping/contact blocked; zero provider mutations/live requests.');
 } finally { globalThis.fetch=prior; }
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
