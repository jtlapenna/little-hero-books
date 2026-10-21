/** Local regression for unexpected zero-cost fulfillment. No credentials or real order IDs. */
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { assertGelatoUnconvertedTestDraft, gelatoTestSafetyReason, GELATO_TEST_CONVERSION_DISABLED, GELATO_LIVE_TESTS_PAUSED } from '../src/lib/books/gelato-test-safety';
import { launchProtectedCase } from './helpers/gelato-protected-launcher';
import { observeGelatoFinance } from '../src/lib/books/gelato-financial-observation';
import { GelatoProviderOrderSchema, validateGelatoConnectedOrders, loadGelatoConnectedOrders } from '../src/lib/books/gelato-provider-snapshot';
import { getGelatoOrder } from '../src/lib/books/gelato-api-client';
import { buildGelatoLifecycleResults, gelatoSnapshotDigest, refreshGelatoSubmission, recoverGelatoSubmission } from '../src/lib/books/gelato-lifecycle';
import type { GelatoLifecycleDependencies } from '../src/lib/books/gelato-lifecycle';
import { runEngineeringConversion } from '../src/lib/books/gelato-engineering-conversion';
import { runEngineeringAutomation } from '../src/lib/books/gelato-engineering-automation';

async function main() {
  let external = 0, checks = 0;
  globalThis.fetch = async () => { external++; throw Error('Real network forbidden'); };
  Object.assign(process.env, { SUPABASE_URL:'https://synthetic.invalid', SUPABASE_SERVICE_ROLE_KEY:'synthetic-incident-only', BACKEND_API_TOKEN:'synthetic-incident-authority-for-local-tests-only-12345' });
  const { fixture } = await import('./test-gelato-engineering-automation');
  const { POST: convert } = await import('../src/app/api/internal/w4/engineering-conversion/route');
  const { POST: automate } = await import('../src/app/api/internal/w4/engineering-automation/route');
  await assert.rejects(launchProtectedCase('/not-a-private-context','a'.repeat(64),'execute-approved-unpaid'),{message:GELATO_LIVE_TESTS_PAUSED});checks++;
  const draft = { orderType:'draft', financialStatus:'draft', fulfillmentStatus:'draft', items:[{fulfillmentStatus:'created'}], receipts:[{total:0}] };
  assertGelatoUnconvertedTestDraft(draft); checks++;
  for (const finance of ['pending','paid','invoiced','to_be_invoiced','partially_refunded','refunded','unknown']) {
    for (const total of [0, 20, null]) {
      const raw = {...draft, orderType:'order', financialStatus:finance, receipts:total===null?undefined:[{total}]};
      assert(gelatoTestSafetyReason(raw)); assert.throws(()=>assertGelatoUnconvertedTestDraft(raw)); checks++;
    }
  }
  for (const status of ['in_production','printed','shipped','in_transit','delivered','returned']) {
    for (const raw of [{...draft,fulfillmentStatus:status},{...draft,items:[{fulfillmentStatus:status}]}]) {
      assert.equal(gelatoTestSafetyReason(raw),'unexpected_test_order_production'); checks++;
    }
  }
  for (const raw of [{...draft,items:[{fulfillmentStatus:'created',printJobs:[{}]}]}, {...draft,shipment:{packages:[{trackingCode:'SYNTHETIC-TRACK'}]}}]) {
    assert.equal(gelatoTestSafetyReason(raw),'unexpected_test_order_production'); checks++;
  }
  for (const raw of [{...draft,financialStatus:undefined},{...draft,items:[]},{...draft,fulfillmentStatus:'future'},{...draft,items:[{fulfillmentStatus:'future'}]}]) {
    assert.equal(gelatoTestSafetyReason(raw),'test_order_state_unverified'); checks++;
  }

  for (const [format,count] of [['standard',1],['amazon',1],['amazon',2]] as const) {
    const f = await fixture(format,count,80+checks);
    const originalRequest = JSON.stringify(f.context.submission.request_snapshot);
    // Reproduce an existing provider order entirely in memory; never call the retired conversion path.
    const pendingRaw = {...f.raw(),orderType:'order',financialStatus:'pending',fulfillmentStatus:'created',receipts:[{currency:'USD',isCalculated:true,total:0,totalInclVat:0}]};
    const normalize = (raw:Record<string,unknown>) => GelatoProviderOrderSchema.parse({...raw,financialObservation:observeGelatoFinance(raw,'USD')});
    const request = (f.context.submission.request_snapshot as {request:Parameters<typeof validateGelatoConnectedOrders>[1]}).request;
    const safe = normalize(f.raw());
    validateGelatoConnectedOrders([safe],request,true); checks++;
    for (const change of [{financialStatus:'paid'}, {orderType:'order'}, {fulfillmentStatus:'in_production'}, {items:f.raw().items.map(item=>({...item,fulfillmentStatus:'shipped'}))}]) {
      assert.throws(()=>validateGelatoConnectedOrders([normalize({...f.raw(),...change})],request,true),/draft graph/); checks++;
    }
    // Raw evidence must survive the actual API normalizer and a second schema parse.
    // It must not expose identifiers or cause false legacy fulfillment conflicts.
    for (const [change,expected] of [
      [{items:f.raw().items.map(item=>({...item,printJobs:[{id:'PRIVATE-JOB-IDENTIFIER'}]}))},'unexpected_test_order_production'],
      [{paymentMethodId:'PRIVATE-PAYMENT-IDENTIFIER'},'unexpected_test_order_funding'],
      [{prepaymentTransactionId:'PRIVATE-PREPAYMENT-IDENTIFIER'},'unexpected_test_order_funding'],
    ] as const) {
      const raw={...f.raw(),...change};
      const read=async(id:string)=>getGelatoOrder(id,{apiKey:'synthetic-witness-reader',fetcher:async(input,init)=>{
        assert.equal(String(input),'https://order.gelatoapis.com/v4/orders/'+raw.id);assert.equal(init?.method??'GET','GET');return Response.json(raw);
      }});
      const [normalized]=await loadGelatoConnectedOrders([raw.id],read);
      assert(!JSON.stringify(normalized).includes('PRIVATE-'),'No provider payment or job identifier may enter snapshots');
      assert.equal(gelatoTestSafetyReason(normalized),expected);
      assert.throws(()=>validateGelatoConnectedOrders([normalized],request,true),/draft graph/);
      const result=buildGelatoLifecycleResults(f.context,[normalized])[0];
      assert.equal(result.accepted,true,'Adding observation metadata must not cause a legacy same-timestamp fulfillment conflict');
      assert.equal(result.actionReason,expected);assert(result.items.every(item=>item.actionReason===expected));
      let applied=false;
      const refreshed=await refreshGelatoSubmission(f.context.submission.id,{get:read,verifyStoredFile:async()=>true,loadOrder:async key=>f.rows.get(key)??null,
        store:{load:async()=>f.context,transition:async(name,p)=>{assert.equal(name,'apply_gelato_provider_snapshots');assert.deepEqual(p.p_notifications,[]);assert.equal((p.p_results as {actionReason:string}[])[0].actionReason,expected);applied=true;return {};}}});
      assert(applied&&refreshed.needsAttention);
      const unknown=structuredClone(f.context);unknown.submission.request_state='outcome_unknown';const recoveryCalls:string[]=[];
      await assert.rejects(recoverGelatoSubmission(unknown.submission.id,{get:read,search:async()=>[raw.id],verifyStoredFile:async()=>true,
        store:{load:async()=>unknown,transition:async(name,p)=>{recoveryCalls.push(name);if(name==='begin_gelato_reconciliation')return {recover:true,claimToken:'22222222-2222-4222-8222-222222222222'};assert.equal(name,'finish_gelato_reconciliation_hold');assert.equal(p.p_reason,expected);return {};}}}),/recovery is held/);
      assert.deepEqual(recoveryCalls,['begin_gelato_reconciliation','finish_gelato_reconciliation_hold']);checks++;
    }
    const clean=await getGelatoOrder(f.raw().id,{apiKey:'synthetic-witness-reader',fetcher:async()=>Response.json(f.raw())});
    const bootstrap=buildGelatoLifecycleResults(f.context,[clean])[0];assert.equal(bootstrap.accepted,true);assert.equal(bootstrap.actionReason,null);checks++;
    const pending = normalize(pendingRaw);
    Object.assign(f.context.providerOrders[0],{order_type:'order',status:'created',snapshot:pending,last_event_at:pending.updatedAt,snapshot_digest:gelatoSnapshotDigest(pending)});
    const sentinels = Array.from({length:6},(_,i)=>({id:'EXCLUDED-LOCAL-'+i,status:'untouched'}));
    const beforeSentinels = JSON.stringify(sentinels);
    for (const state of ['created','in_production','printed','shipped','in_transit','delivered']) {
      const raw = {...pendingRaw,financialStatus:state==='created'?'pending':'paid',fulfillmentStatus:state,updatedAt:'2026-10-21T18:00:00Z',
        items:pendingRaw.items.map(item=>({...item,fulfillmentStatus:state})),
        shipment:{shipmentMethodUid:'usps_ground_advantage',packages:['shipped','in_transit','delivered'].includes(state)?[{id:'SYNTHETIC-PARCEL',orderItemIds:pendingRaw.items.map(i=>i.id),trackingCode:'SYNTHETIC-TRACK',trackingUrl:'https://tracking.invalid/local'}]:[]}};
      const current = normalize(raw);
      const result = buildGelatoLifecycleResults(f.context,[current])[0];
      assert.equal(result.accepted,true); assert.equal(result.status,state);
      assert.equal(result.financialAccepted,true); assert.equal(result.financialObservation?.status,raw.financialStatus);
      assert.equal(result.financialObservation?.receipts?.[0].amounts.total,'0');
      assert.equal(result.actionReason,state==='created'?'unexpected_test_order_release':'unexpected_test_order_production');
      assert.equal(result.items.length,count); assert(result.items.every(item=>item.actionReason===result.actionReason));
      if (current.shipment?.packages.length) assert(result.items.every(item=>item.tracking?.[0].providerItemIds.includes(item.providerItemId)));
      const writes:Record<string,unknown>[] = [];
      const dependencies:GelatoLifecycleDependencies = { store:{load:async()=>f.context,transition:async(name,p)=>{assert.equal(name,'apply_gelato_provider_snapshots');assert.deepEqual(p.p_notifications,[]);writes.push(p);return {}; }},
        get:async id=>{assert.equal(id,current.id);return current;},verifyStoredFile:async()=>true,loadOrder:async key=>f.rows.get(key)??null,
        cancel:async()=>{throw Error('Cancellation forbidden');} };
      for (let retry=0;retry<2;retry++) assert.equal((await refreshGelatoSubmission(f.context.submission.id,dependencies)).needsAttention,true);
      assert.equal(writes.length,2); assert.deepEqual(writes[0].p_results,writes[1].p_results);
      assert.equal(JSON.stringify(f.context.submission.request_snapshot),originalRequest);
      assert.equal(JSON.stringify(sentinels),beforeSentinels); checks++;
    }
    // Same-timestamp payment changes remain held, while still surfacing unexpected payment.
    const paid = normalize({...pendingRaw,financialStatus:'paid'});
    const conflict=buildGelatoLifecycleResults(f.context,[paid])[0];
    assert.equal(conflict.financialAccepted,false);assert.equal(conflict.financialActionReason,'same_timestamp_financial_change');
    assert.equal(conflict.actionReason,'unexpected_test_order_payment'); checks++;
    if (count===2) {
      const mixed=normalize({...pendingRaw,updatedAt:'2026-10-21T18:00:00Z',items:pendingRaw.items.map((item,i)=>({...item,fulfillmentStatus:i===0?'shipped':'created'}))});
      const result=buildGelatoLifecycleResults(f.context,[mixed])[0];
      assert.equal(result.actionReason,'unexpected_test_order_production');
      assert.deepEqual(result.items.map(item=>item.status),['shipped','created'],'A cohort warning cannot swap or flatten child-specific facts');checks++;
    }
    const recoveryCalls:string[]=[];
    await assert.rejects(recoverGelatoSubmission(f.context.submission.id,{store:{load:async()=>f.context,transition:async(name,p)=>{
      recoveryCalls.push(name); if(name==='begin_gelato_reconciliation')return {recover:true,claimToken:'22222222-2222-4222-8222-222222222222'};
      assert.equal(name,'finish_gelato_reconciliation_hold');assert.equal(p.p_reason,'unexpected_test_order_release');return {};
    }},get:async()=>pending,search:async()=>[pending.id],verifyStoredFile:async()=>true}),/recovery is held/);
    assert.deepEqual(recoveryCalls,['begin_gelato_reconciliation','finish_gelato_reconciliation_hold']);checks++;
    // Ordinary production facts must not be classified as an engineering incident.
    const ordinary=structuredClone(f.context);ordinary.submission.root_order_id='ORDINARY-LOCAL';ordinary.members.forEach((m,i)=>m.child_order_key='ORDINARY-LOCAL-'+i);
    assert.equal(buildGelatoLifecycleResults(ordinary,[pending])[0].actionReason,null);checks++;

    const productionDependencies={...f.d.conversion};delete productionDependencies.simulationOnly;
    for(let retry=0;retry<2;retry++)await assert.rejects(runEngineeringConversion(f.a.id,'convert',productionDependencies),{message:GELATO_TEST_CONVERSION_DISABLED});
    await assert.rejects(runEngineeringAutomation({action:'queue',authorizationIds:[f.a.id]},{...f.d,conversion:productionDependencies}),{message:GELATO_TEST_CONVERSION_DISABLED});
    assert.equal(f.a.state,'ready');assert.equal(f.stats().patches,0);checks++;
    const observedMethods:string[]=[];
    Object.assign(f.a,{state:'converted',closed_at:'2026-10-21T18:00:00Z',owner_token:'44444444-4444-4444-8444-444444444444'});
    const observed=await runEngineeringConversion(f.a.id,'observe',{...productionDependencies,fetcher:async(input,init)=>{
      assert.equal(new URL(String(input)).origin,'https://order.gelatoapis.com');assert.equal(init?.method,'GET');observedMethods.push('GET');return Response.json(pendingRaw);
    }});
    assert.equal(observed.observation.testSafetyReason,'unexpected_test_order_release');assert.equal(observed.needsAttention,true);assert.deepEqual(observedMethods,['GET']);checks++;
  }

  for (const [route,body] of [[convert,{authorizationId:'33333333-3333-4333-8333-333333333333',action:'convert'}], [automate,{authorizationIds:['33333333-3333-4333-8333-333333333333'],action:'queue'}]] as const) {
    const request = (extra:object={})=>new NextRequest('https://local.invalid/test',{method:'POST',headers:{Authorization:'Bearer '+process.env.BACKEND_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({...body,...extra})});
    const response = await route(request());assert.equal(response.status,423);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
    assert.deepEqual(await response.json(),{error:GELATO_TEST_CONVERSION_DISABLED});
    assert.equal((await route(request({simulationOnly:true}))).status,400,'HTTP callers cannot enable simulation or conversion');checks++;
  }
  assert.equal(external,0);
  console.log(JSON.stringify({checks,externalRequests:external,realOrderReads:0,providerWrites:0,customerMessages:0,deployments:0,scope:'Synthetic local incident and retired conversion regressions only'}));
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
