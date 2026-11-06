import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gelatoCustomerStatusMessage } from '../src/lib/books/gelato-consumer-status';
import { NextRequest } from 'next/server';

async function main() {
  process.env.SUPABASE_URL = 'https://db.example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-consumer-proof';
  process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3117';
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  let rows: Record<string, unknown>[] = [];
  let archived: Record<string, unknown>[] = [];
  let writes = 0;
  let allowQueue = false;
  let caseId = 'initial';
  const observations: Record<string, unknown>[] = [];
  let calls: Record<string, unknown>[] = [];
  const transportViolations: string[] = [];
  let fault = '';
  const changedIds = new Set<number>();
  const syntheticFetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const call: Record<string, unknown> = { url: String(input), method: init?.method ?? 'GET', body: init?.body ?? '', response: null };
    calls.push(call);
    const respond = (data: unknown, status = 200) => {
      const body = JSON.stringify(data); call.response = { status, body };
      return new Response(body, { status, headers: { 'Content-Type': 'application/json' } });
    };
    assert.equal(url.hostname, 'db.example.test', 'only synthetic database transport allowed');
    const method = init?.method ?? 'GET';
    if (method !== 'GET') {
      writes++;
      assert.ok(allowQueue && method === 'PATCH' && url.pathname.endsWith('/orders'), 'Guarded request attempted mutation');
    }
    if (method === 'GET' && ((fault === 'root-query' && url.searchParams.has('root_order_id')) ||
        (fault === 'archive-query' && url.pathname.endsWith('/archived_orders')))) {
      return respond({ code: 'synthetic_failure', message: 'Synthetic lookup failure' }, 500);
    }
    const source = url.pathname.endsWith('/archived_orders') ? archived : rows;
    let data = source;
    for (const [column, filter] of url.searchParams) {
      if (!['id', 'orderId', 'order_id', 'root_order_id', 'amazon_order_id'].includes(column) && !column.startsWith('order_data->>')) continue;
      const value = (row: Record<string, unknown>) => column.startsWith('order_data->>')
        ? (row.order_data as Record<string, unknown> | undefined)?.[column.slice(13)] : row[column];
      if (filter.startsWith('eq.')) data = data.filter(row => String(value(row) ?? '') === filter.slice(3));
      if (filter.startsWith('in.(')) data = data.filter(row => filter.slice(4, -1).split(',').includes(String(value(row))));
      if (filter.startsWith('ilike.')) data = data.filter(row => String(value(row) ?? '').startsWith(filter.slice(6).replace(/%$/, '')));
    }
    const limit = Number(url.searchParams.get('limit'));
    if (limit > 0) data = data.slice(0, limit);
    if (method === 'PATCH') {
      const updates = JSON.parse(String(init?.body));
      for (const row of data) { changedIds.add(Number(row.id)); Object.assign(row, updates); }
    }
    const headers = new Headers(init?.headers);
    const body = headers.get('Accept')?.includes('vnd.pgrst.object') ? data[0] ?? null : data;
    return respond(body);
  };
  globalThis.fetch = async (input, init) => {
    try { return await syntheticFetch(input, init); }
    catch(error){const message=caseId+': '+String(error);transportViolations.push(message);
      observations.push({kind:'transport-violation',id:caseId,message});throw error;}
  };
  console.error = () => undefined;
  try {
    const { POST: print } = await import('../src/app/api/orders/[orderId]/print/route');
    const { GET: orderDetail } = await import('../src/app/api/orders/[orderId]/route');
    const { GET: customerStatus } = await import('../src/app/api/preview/[orderId]/status/route');
    const { POST: regenerate } = await import('../src/app/api/admin/orders/[orderId]/regenerate-4/route');
    const root = '111-2222222-3333333';
    const fresh = () => [1, 2].map((id) => ({ id, orderId: `${root}-item-${id}`, root_order_id: root, platform: 'amazon', print_provider: 'gelato' }));
    const request = (path: string) => new NextRequest(`http://localhost:3117${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3117' }, body: '{}' });
    const invokePrint = async (entry: string, expected?: unknown) => {
      calls = [];
      const body = expected === undefined ? '{}' : JSON.stringify({ expected_order_ids: expected });
      const req = new NextRequest('http://localhost:3117/api/orders/' + entry + '/print', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3117' }, body });
      const response = await print(req, { params: Promise.resolve({ orderId: entry }) });
      assert.deepEqual(transportViolations,[],caseId+' swallowed consumer transport assertion');
      observations.push({ kind: 'print-case', id: caseId, request: { url: req.url, body }, response: { status: response.status, body: await response.clone().text() }, calls: structuredClone(calls), rows: structuredClone(rows), archived: structuredClone(archived), writes, changedIds: [...changedIds] });
      return response;
    };
    const invokeDetail = async (entry: string) => {
      calls = [];
      const response = await orderDetail(new NextRequest('http://localhost:3117/api/orders/' + entry), { params: Promise.resolve({ orderId: entry }) });
      assert.deepEqual(transportViolations,[],caseId+' swallowed consumer transport assertion');
      observations.push({ kind: 'detail-case', id: caseId, request: { orderId: entry }, response: { status: response.status, body: await response.clone().text() }, calls: structuredClone(calls), rows: structuredClone(rows) });
      return response;
    };
    for (const scenario of ['selected', 'mixed', 'sibling-submission', 'sibling-provider-order']) {
      caseId = scenario;
      rows = fresh();
      if (scenario === 'selected') rows[0].print_submission_id = 'existing';
      if (scenario === 'mixed') rows[1].print_provider = 'lulu';
      if (scenario === 'sibling-submission') rows[1].print_submission_id = 'existing';
      if (scenario === 'sibling-provider-order') rows[1].gelato_order_id = 'existing';
      const response = await invokePrint(`${root}-item-1`);
      assert.equal(response.ok, false, scenario);
      const body = await response.json();
      assert.match(typeof body.error === 'string' ? body.error : body.error.message, scenario === 'mixed' ? /different print providers/ : /Existing Gelato submission/, scenario);
      assert.equal(writes, 0, 'print guard must reject before shipping hydration or queue mutation');
    }
    const ready = (source: Record<string, unknown>[]) => source.map(row => ({ ...structuredClone(row),
      print_provider: 'lulu', manifest_3_url: 'https://assets.example.test/3-manifest.json',
      workflow_step: 'book_assembly_completed', execution_status: 'done',
      shipping_address: { name: 'Synthetic Parent', street1: '1 Test St', city: 'Test', state: 'CA', zip: '90001', country: 'US' },
    }));
    const producerRows = readProducerRows('actual-csv-complete.json');
    const expectedIds = ['111-2222222-3333333', '111-2222222-3333333-item-line-a-unit-2'];
    assert.deepEqual(producerRows.map(row => row.orderId).sort(), expectedIds);
    for (const entry of expectedIds) {
      caseId = 'valid-root-or-suffix:' + entry;
      rows = ready(producerRows); archived = []; writes = 0; changedIds.clear(); allowQueue = true;
      const response = await invokePrint(entry, expectedIds);
      assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
      const body = await response.json();
      assert.deepEqual(body.queuedOrderIds.sort(), expectedIds);
      assert.equal(body.grouped, true); assert.equal(body.rootOrderId, root);
      assert.deepEqual([...changedIds].sort(), [1, 2]);
      for (const row of rows) {
        const original = producerRows.find(source => source.id === row.id)!;
        for (const key of ['orderId', 'character_hash', 'character_specs', 'book_specs', 'product_info']) assert.deepEqual(row[key], original[key]);
      }
      allowQueue = false;
    }
    for (const scenario of ['unready-root', 'archived-root', 'archive-query', 'root-query', 'alias-conflict', 'duplicate-business', 'truncated', 'missing-unit', 'root-submission', 'root-approval']) {
      caseId = scenario;
      rows = ready(producerRows); archived = []; writes = 0; changedIds.clear(); fault = '';
      if (scenario === 'unready-root') { rows[0].manifest_3_url = null; rows[0].workflow_step = null; }
      if (scenario === 'archived-root') { archived = [{ order_data: rows[0] }]; rows = rows.slice(1); }
      if (scenario === 'archive-query' || scenario === 'root-query') fault = scenario;
      if (scenario === 'alias-conflict') rows[0].amazon_order_id = 'conflicting-root';
      if (scenario === 'duplicate-business') rows.push({ ...rows[0], id: 99 });
      if (scenario === 'truncated') rows = Array.from({ length: 201 }, (_, index) => ({ ...rows[0], id: index + 1, orderId: `extra-${index}` })).concat(ready(producerRows).slice(1));
      if (scenario === 'missing-unit') rows = rows.slice(1);
      if (scenario === 'root-submission' || scenario === 'root-approval') {
        rows.forEach(row => row.print_provider = 'gelato');
        if (scenario === 'root-submission') rows[0].print_submission_id = 'existing';
        else { rows[0].customer_approval_required = true; rows[0].customer_approval_status = 'pending'; }
      }
      const response = await invokePrint(expectedIds[1]);
      assert.equal(response.ok, false, scenario);
      assert.equal(writes, 0, scenario); assert.equal(changedIds.size, 0, scenario);
    }
    caseId = 'delivered-suffix-reprint';
    fault = ''; archived = []; rows = ready(producerRows); writes = 0; allowQueue = true; changedIds.clear();
    rows[1].lifecycle_status = 'recently_delivered';
    const reprint = await invokePrint(expectedIds[1]);
    assert.equal(reprint.status, 200, JSON.stringify(await reprint.clone().json()));
    assert.deepEqual((await reprint.json()).queuedOrderIds, [expectedIds[1]]);
    assert.deepEqual([...changedIds], [2]);
    for (const entry of ['111-', '111-2222222-3333333-item-line-a']) {
      caseId = 'prefix-rejected:' + entry; rows = ready(producerRows); writes = 0; allowQueue = false; changedIds.clear();
      assert.equal((await invokePrint(entry)).ok, false); assert.equal(writes, 0);
    }
    for (const expected of [expectedIds.slice(1), [...expectedIds, 'unseen-book'], [expectedIds[0], expectedIds[0]], null]) {
      caseId = 'stale-or-invalid-confirmation:' + JSON.stringify(expected); rows = ready(producerRows); writes = 0; changedIds.clear();
      assert.equal((await invokePrint(expectedIds[1], expected)).ok, false); assert.equal(writes, 0);
    }
    caseId = 'archived-root-with-one-legacy-suffix';
    rows = ready(fresh()).slice(1); archived = [{ order_data: { id: 99, orderId: root, root_order_id: root, platform: 'amazon' } }]; writes = 0; changedIds.clear();
    assert.equal((await invokePrint(`${root}-item-2`)).ok, false); assert.equal(writes, 0);
    archived = [];
    for (const fixture of ['canonical-frontend-single', 'canonical-frontend-siblings']) {
      const source = readWebsiteProducer(fixture);
      for (const entry of source.map(row => String(row.orderId))) {
        caseId = 'd2c-print:' + fixture + ':' + entry;
        rows = ready(source); writes = 0; changedIds.clear(); allowQueue = true;
        const response = await invokePrint(entry, source.map(row => row.orderId));
        assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
        assert.deepEqual((await response.json()).queuedOrderIds.sort(), source.map(row => row.orderId).sort());
      }
    }
    caseId = 'standalone-admin-approval-policy'; rows = ready(readWebsiteProducer('canonical-frontend-single')); writes = 0; changedIds.clear(); allowQueue = true;
    rows[0].print_provider = 'gelato'; rows[0].customer_approval_required = true; rows[0].customer_approval_status = 'pending';
    const singleton = await invokePrint(String(rows[0].orderId), [rows[0].orderId]);
    assert.equal(singleton.status, 200, JSON.stringify(await singleton.clone().json()));
    assert.equal(rows[0].customer_approval_status, 'approved');
    allowQueue = false; writes = 0; archived = [];
    for (const source of [producerRows, readWebsiteProducer('canonical-frontend-single'), readWebsiteProducer('canonical-frontend-siblings')]) {
      for (const entry of source.map(row => String(row.orderId))) {
        caseId = 'detail-complete:' + entry; rows = structuredClone(source); writes = 0;
        const response = await invokeDetail(entry);
        assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
        const detail = await response.json();
        assert.deepEqual(detail.siblingOrders.map((member: any) => member.orderId).sort(), source.map(row => row.orderId).sort());
        assert.equal(detail.totalSiblings, source.length); assert.equal(writes, 0);
      }
    }
    for (const row of producerRows) {
      caseId = 'delivered-detail:' + row.orderId; rows = [{ ...structuredClone(row), lifecycle_status: 'recently_delivered' }]; writes = 0;
      const response = await invokeDetail(String(row.orderId));
      assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
      const detail = await response.json();
      assert.deepEqual(detail.siblingOrders.map((member: any) => member.orderId), [row.orderId]);
      assert.equal(detail.totalSiblings, 1); assert.equal(writes, 0);
    }

    rows = fresh(); rows[0].print_submission_id = 'existing';
    assert.equal((await regenerate(request('/api/admin/regenerate-4'), { params: Promise.resolve({ orderId: `${root}-item-1` }) })).status, 409);
    archived = [{ id: 700, order_data: rows[0] }]; rows = [];
    assert.equal((await regenerate(request('/api/admin/regenerate-4'), { params: Promise.resolve({ orderId: `${root}-item-1` }) })).status, 409);
    assert.equal(writes, 0, 'archive restore must reject before inserting or deleting');
    const customerFixtures: Record<string, unknown> = {};
    for (const status of ['draft', 'in_production', 'shipped', 'delivered', 'canceled', 'returned']) {
      const type = status === 'draft' ? 'draft' : 'order';
      const packages = status === 'shipped' || status === 'delivered' ? [1, 2].map((id) => ({ providerOrderId: 'synthetic-provider', packageId: `package-${id}`, providerItemIds: ['synthetic-item'], trackingNumber: `tracking-${id}`, trackingUrl: `https://tracking.example.test/${id}`, carrier: 'USPS', quantity: 1 })) : [];
      rows = [{ ...fresh()[0], gelato_status: status, gelato_order_type: type, gelato_tracking: packages, customer_approval_status: 'approved', customer_email: 'parent@example.test', character_specs: { childName: 'Test Child' } }];
      const response = await customerStatus(new NextRequest(`http://localhost:3117/api/preview/${root}-item-1/status?email=parent@example.test`), { params: Promise.resolve({ orderId: `${root}-item-1` }) });
      assert.equal(response.status, 200, status);
      const body = await response.json();
      const expected = gelatoCustomerStatusMessage(status, type);
      assert.equal(body.status, expected.short, status); assert.equal(body.statusLong, expected.long, status);
      assert.equal(body.luluStatus, null); assert.equal(body.printProvider, 'gelato');
      if (packages.length > 1) { assert.equal(body.packages.length, 2); assert.equal(body.trackingNumber, null); }
      customerFixtures[status] = body;
    }
    if (process.env.GELATO_UI_FIXTURE_OUTPUT) writeFileSync(process.env.GELATO_UI_FIXTURE_OUTPUT, JSON.stringify(customerFixtures));

    // GROUP-REUSE-01: retained producer rows, plus one required unexecuted producer successor.
    // Only assembly readiness is overlaid. Persisted provider/book/unit/spec fields stay intact.
    // Positive scope: fallback-unassigned group-completeness diagnostic only.
    // These are intercepted queue controls, not configured Inner Voice provider/eligibility or phase005 print acceptance.
    // v13 contract: an unverifiable group never blanks the detail view (200 + groupVerificationError, no group members);
    // print still refuses with the exact validation reason.
    const assertSelectedValidation = async (response: Response, action: string, reason: string) => {
      if(action==='detail'){
        assert.equal(response.status,200,caseId);const body=await response.json();
        assert.equal(body.groupVerificationError,'Order group could not be verified. Reload the order before sending it to print.',caseId);
        assert.equal(body.siblingOrders,undefined,caseId);assert.equal(body.totalSiblings,undefined,caseId);assert.ok(body.orderId,caseId);
      }else{
        assert.equal(response.status,400,caseId);
        assert.deepEqual(await response.json(),{error:{type:'validation',message:reason}},caseId);
      }
      assert.deepEqual(transportViolations,[],caseId+' swallowed consumer transport assertion');
    };
    const selectedSources = readSelectedProducerFixtures();
    const selectedReady = (source: Record<string, any>[]) => source.map(row => ({...structuredClone(row),
      manifest_3_url:'https://assets.example.test/group-reuse-synthetic-3-manifest.json',
      workflow_step:'book_assembly_completed',execution_status:'done'}));
    const preserveKeys=['id','orderId','order_id','root_order_id','amazon_order_id','character_hash','character_specs',
      'dedication_text','book_specs','product_info','print_provider','print_book_id','print_config_version','print_format_id','one_manifest_url','oneManifestUrl'];
    for(const [sourceId,source] of selectedSources){
      for(const row of source)for(const key of ['print_provider','print_book_id','print_config_version','print_format_id','one_manifest_url','oneManifestUrl'])
        assert(row[key]==null,'fallback-unassigned group-completeness diagnostic requires absent/null raw '+key);
      observations.push({kind:'group-reuse-scope',id:sourceId,scope:'fallback-unassigned group-completeness diagnostic',
        providerAndW0Pins:source.map(row=>({orderId:row.orderId,print_provider:row.print_provider??null,print_book_id:row.print_book_id??null,
          print_config_version:row.print_config_version??null,print_format_id:row.print_format_id??null,one_manifest_url:row.one_manifest_url??null,oneManifestUrl:row.oneManifestUrl??null})),
        phase005:'held; no configured Inner Voice provider, eligibility or print acceptance'});
      const ids=source.map(row=>String(row.orderId)).sort(),physicalIds=source.map(row=>Number(row.id)).sort((a,b)=>a-b);
      assert.equal(ids.length,2);assert.equal(new Set(physicalIds).size,2);
      assert(ids.includes(root));const suffix=ids.find(id=>id!==root)!;assert(suffix.startsWith(root+'-item-'));
      for(const entry of [root,suffix]){
        caseId='selected-detail:'+sourceId+':'+entry;rows=structuredClone(source);archived=[];writes=0;changedIds.clear();allowQueue=false;fault='';
        const before=structuredClone(rows),response=await invokeDetail(entry);
        assert.equal(response.status,200,await response.clone().text());const detail=await response.json();
        assert.deepEqual(detail.siblingOrders.map((row:any)=>row.orderId).sort(),ids);assert.equal(detail.totalSiblings,2);
        assert.equal(detail.orderId,entry);assert.deepEqual(rows,before);assert.equal(writes,0);assert.equal(changedIds.size,0);
        caseId='selected-print:fallback-unassigned-group-completeness:'+sourceId+':'+entry;rows=selectedReady(source);archived=[];writes=0;changedIds.clear();allowQueue=true;
        const queued=await invokePrint(entry,ids);assert.equal(queued.status,200,await queued.clone().text());
        const body=await queued.json();
        assert.deepEqual({...body,queuedOrderIds:[...body.queuedOrderIds].sort()},{success:true,
          message:'Queued 2 sibling orders for print fulfillment. Router will process the group together when capacity is available.',
          orderId:entry,queuedOrderIds:ids,rootOrderId:root,grouped:true,next_workflow:'4',execution_status:'ready_for_processing',isReprint:false});
        assert.deepEqual([...changedIds].sort((a,b)=>a-b),physicalIds);assert(writes>0);
        const queuePatches=calls.filter(call=>call.method==='PATCH'&&new URL(String(call.url)).pathname.endsWith('/orders')&&JSON.parse(String(call.body)).next_workflow==='4');
        assert.equal(queuePatches.length,1);assert.equal(JSON.parse(String(queuePatches[0].body)).status,'queued_for_processing');
        for(const row of rows){const original=source.find(item=>item.id===row.id)!;
          assert.equal(row.next_workflow,'4',caseId);assert.equal(row.execution_status,'ready_for_processing',caseId);
          assert.equal(row.started_at,null,caseId);assert.equal(row.current_workflow,null,caseId);assert.equal(row.customer_approval_status,'approved',caseId);
          assert.equal(row.status,'pending_assembly_review',caseId+' canonical recalculated status retains the synthetic completed assembly step');
          for(const key of preserveKeys)assert.deepEqual(row[key],original[key],caseId+':'+key);}
        allowQueue=false;
      }
      const invalidSelections:Array<[string,string,(source:Record<string,any>[])=>Record<string,any>[]]>=[
        ['missing-unit','Incomplete Amazon root unit partition',source=>source.slice(0,1)],
        ['malformed-nested-selection','Invalid CSV item book selection',source=>{source[0].product_info.line_items[1].bookSelection=[];return source;}],
        ['missing-nested-selection','Invalid CSV item book selection',source=>{delete source[0].product_info.line_items[1].bookSelection;return source;}],
        ['conflicting-nested-selection','Conflicting CSV selected item book',source=>{
          source[0].product_info.line_item.bookSelection={bookId:'book-finding-our-inner-voice',formatId:'amazon',configVersion:2};return source;}],
        ['cross-row-source-selection-conflict','Conflicting Amazon source item partition',source=>{
          const item=source[0].product_info.line_items[1];
          item.bookSelection=item.bookSelection.bookId==='book-mvp-simple-adventure'
            ? {bookId:'book-finding-our-inner-voice',formatId:'amazon',configVersion:2}
            : {bookId:'book-mvp-simple-adventure',formatId:'amazon',configVersion:1};return source;}],
      ];
      for(const [invalid,reason,change] of invalidSelections)for(const action of ['detail','print']){
        caseId='selected-refusal:'+sourceId+':'+invalid+':'+action;
        rows=change(selectedReady(source));archived=[];writes=0;changedIds.clear();allowQueue=false;fault='';
        const before=structuredClone(rows),entry=String(rows[0].orderId);
        const response=action==='detail'?await invokeDetail(entry):await invokePrint(entry,ids);
        await assertSelectedValidation(response,action,reason);assert.equal(writes,0,caseId);assert.equal(changedIds.size,0,caseId);assert.deepEqual(rows,before,caseId);
      }
    }
    for(const action of ['detail','print']){
      caseId='selected-refusal:mixed-quantity:missing-unit:'+action;
      const quantity=readRetainedSelectedRows('mixed-quantity'),removedId=root+'-item-line-a-unit-2';
      assert.equal(quantity.filter(row=>row.orderId===removedId).length,1,'Quantity fixture must contain exactly one intended removed unit');
      rows=selectedReady(quantity).filter(row=>row.orderId!==removedId);
      assert.equal(rows.length,quantity.length-1);assert.equal(rows.some(row=>row.orderId===removedId),false);
      archived=[];writes=0;changedIds.clear();allowQueue=false;fault='';const before=structuredClone(rows),entry=String(rows[0].orderId);
      const response=action==='detail'?await invokeDetail(entry):await invokePrint(entry,quantity.map(row=>row.orderId));
      await assertSelectedValidation(response,action,'Incomplete Amazon root unit partition');assert.equal(writes,0,caseId);assert.equal(changedIds.size,0,caseId);assert.deepEqual(rows,before,caseId);
    }

    // v13: legacy Amazon root keeps an empty placeholder parent beside its per-book children. The placeholder is not a member.
    {
      const stub={id:99,orderId:root,root_order_id:root,amazon_order_id:root,platform:'amazon',product_info:{_customization_missing:true,_retry_on_next_cron:true}};
      const children=fresh().map(row=>({...row,amazon_order_id:root}));const childIds=children.map(row=>String(row.orderId)).sort();
      const entry=root+'-item-1';
      caseId='legacy-placeholder-excluded:detail:'+entry;rows=[structuredClone(stub),...structuredClone(children)];archived=[];writes=0;changedIds.clear();allowQueue=false;fault='';
      let before=structuredClone(rows);let response=await invokeDetail(entry);
      assert.equal(response.status,200,await response.clone().text());let detail=await response.json();
      assert.deepEqual(detail.siblingOrders.map((row:any)=>row.orderId).sort(),childIds);assert.equal(detail.totalSiblings,2);assert.equal(detail.groupVerificationError,undefined);
      assert.deepEqual(rows,before);assert.equal(writes,0);assert.equal(changedIds.size,0);
      caseId='legacy-placeholder-excluded:print:'+entry;rows=[structuredClone(stub),...ready(children)];archived=[];writes=0;changedIds.clear();allowQueue=true;
      before=structuredClone(rows);response=await invokePrint(entry,childIds);
      assert.equal(response.status,200,await response.clone().text());const body=await response.json();
      assert.deepEqual([...body.queuedOrderIds].sort(),childIds);assert.equal(body.grouped,true);assert.equal(body.rootOrderId,root);
      assert.deepEqual([...changedIds].sort((a,b)=>a-b),[1,2]);assert.deepEqual(rows.find(row=>row.id===99),before.find(row=>row.id===99));
      allowQueue=false;
    }

    // v14 negative controls: a root row that carries real customization is not an empty placeholder and stays a member.
    {
      const real={id:99,orderId:root,root_order_id:root,amazon_order_id:root,platform:'amazon',characterSpecs:{childName:'Real Child'},product_info:{_customization_missing:true,_retry_on_next_cron:true}};
      const children=fresh().map(row=>({...row,amazon_order_id:root}));const entry=root+'-item-1';
      const allIds=[root,...children.map(row=>String(row.orderId))].sort();
      caseId='legacy-nonpure-root-kept:detail:'+entry;rows=[structuredClone(real),...structuredClone(children)];archived=[];writes=0;changedIds.clear();allowQueue=false;fault='';
      let before=structuredClone(rows);let response=await invokeDetail(entry);
      assert.equal(response.status,200,await response.clone().text());const detail=await response.json();
      assert.deepEqual(detail.siblingOrders.map((row:any)=>row.orderId).sort(),allIds);assert.equal(detail.totalSiblings,3);
      assert.deepEqual(rows,before);assert.equal(writes,0);assert.equal(changedIds.size,0);
      caseId='legacy-nonpure-root-kept:print:'+entry;rows=[structuredClone(real),...ready(children)];archived=[];writes=0;changedIds.clear();allowQueue=true;
      before=structuredClone(rows);response=await invokePrint(entry,allIds);
      assert.equal(response.ok,false,await response.clone().text());assert.equal(writes,0);assert.equal(changedIds.size,0);assert.deepEqual(rows,before);
      allowQueue=false;
    }

    // v15: legacy Amazon group from two distinct quantity-1 source lines. Each child stores the PER-LINE count (1), not the group size (2).
    {
      const stub={id:99,orderId:root,root_order_id:root,amazon_order_id:root,platform:'amazon',product_info:{_customization_missing:true,_retry_on_next_cron:true}};
      const children=fresh().map(row=>({...row,amazon_order_id:root,product_info:{_quantity_unit_index:1,_quantity_unit_count:1}}));
      const childIds=children.map(row=>String(row.orderId)).sort();const entry=root+'-item-1';
      caseId='legacy-multiline-placeholder-excluded:detail:'+entry;rows=[structuredClone(stub),...structuredClone(children)];archived=[];writes=0;changedIds.clear();allowQueue=false;fault='';
      let before=structuredClone(rows);let response=await invokeDetail(entry);
      assert.equal(response.status,200,await response.clone().text());const detail=await response.json();
      assert.deepEqual(detail.siblingOrders.map((row:any)=>row.orderId).sort(),childIds);assert.equal(detail.totalSiblings,2);assert.equal(detail.groupVerificationError,undefined);
      assert.deepEqual(rows,before);assert.equal(writes,0);assert.equal(changedIds.size,0);
      caseId='legacy-multiline-placeholder-excluded:print:'+entry;rows=[structuredClone(stub),...ready(children)];archived=[];writes=0;changedIds.clear();allowQueue=true;
      before=structuredClone(rows);response=await invokePrint(entry,childIds);
      assert.equal(response.status,200,await response.clone().text());const body=await response.json();
      assert.deepEqual([...body.queuedOrderIds].sort(),childIds);assert.equal(body.grouped,true);
      assert.deepEqual([...changedIds].sort((a,b)=>a-b),[1,2]);assert.deepEqual(rows.find(row=>row.id===99),before.find(row=>row.id===99));
      allowQueue=false;
    }

  } finally {
    if (process.env.GROUP_CONSUMER_OBSERVATIONS) writeFileSync(process.env.GROUP_CONSUMER_OBSERVATIONS, observations.map(frame => JSON.stringify(frame)).join('\n') + '\n');
    globalThis.fetch = originalFetch; console.error = originalError;
    assert.deepEqual(transportViolations,[],'No swallowed consumer transport assertion at completion');
  }
  console.log('Existing actual print/detail/regenerate API controls passed; synthetic queue mutations and rejection frames retained');
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });

function readProducerRows(name: string): Record<string, any>[] {
  const directory = process.env.GROUP_CONSUMER_PRODUCER_INPUT;
  assert.ok(directory, 'GROUP_CONSUMER_PRODUCER_INPUT must name the accepted producer output');
  const expected: Record<string, string> = {"actual-csv-complete.json": "6e764c2eba29f92815f48bb88f2dd0e4bc487a6420556782559e08d869e168a7", "actual-csv-partial.json": "ebf16c0c1c4b083e76855426940b8482d8e8cb4c9e7c8a639dd27e5a29752785", "actual-csv-mixed.json": "2c4eb0a6e3c2d72f47e0fbb31393d993d5099037e2b886ea3bb37a53a2bea39a", "actual-csv-legacy.json": "d714d7f50bd88080622b677454d3093e92f58f39b258d2d845bcf0c4cbfe579d"};
  assert.ok(expected[name], 'Unknown producer fixture');
  const bytes = readFileSync(resolve(directory, name));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected[name], 'Producer bytes changed');
  const parsed = JSON.parse(bytes.toString());
  return Array.isArray(parsed) ? parsed : [parsed];
}

function readWebsiteProducer(id: string): Record<string, any>[] {
  const file = process.env.GROUP_CONSUMER_D2C_INPUT;
  assert.ok(file, 'GROUP_CONSUMER_D2C_INPUT must name the accepted checkout observations');
  const bytes = readFileSync(file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '8f09a33294819762e8db308ac4fd8f1dc6a610874eef45a8aa81603bc2f0e89e');
  const frame = bytes.toString().trim().split('\n').map(line => JSON.parse(line)).find(frame => frame.kind === 'case' && frame.id === id);
  assert.equal(frame?.observation.response.status, 201);
  assert.deepEqual(frame.observation.unexpected, []);
  return frame.observation.rows.map((row: Record<string, unknown>, index: number) => ({ ...row, id: row.id ?? 101 + index }));
}


function readRetainedSelectedRows(id: 'mixed-actual-stub-false' | 'mixed-quantity'): Record<string, any>[] {
  const file=process.env.GROUP_CONSUMER_MIXED_OBSERVATIONS;
  assert.equal(file, '/Volumes/WD_BLACK/AgentArtifacts/little-hero-books/mixed-backend-1ffb2cda-be21-4228-bbcc-6711895e3d46/after-observations.jsonl', 'Bind the accepted current mixed producer observations');
  const bytes=readFileSync(file!);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),'b03af36455dc250049cb81239f5485c5e96bf0544a29c7623c3e7d1079b867cb');
  const frames=bytes.toString().trim().split('\n').map(line=>JSON.parse(line)).filter(frame=>frame.kind==='mixed-csv'&&frame.id===id);
  assert.equal(frames.length,1);assert.equal(frames[0].response.status,200);assert.deepEqual(frames[0].unexpected,[]);
  assert.equal(frames[0].response.body.summary.errors,0);return structuredClone(frames[0].rows);
}

function readSelectedProducerFixtures(): Array<[string, Record<string, any>[]]> {
  const file=process.env.GROUP_CONSUMER_LEGACY_SELECTED_OBSERVATIONS;
  assert.equal(file,'/Volumes/WD_BLACK/AgentArtifacts/little-hero-books/group-reuse-producer-5c9d9aa2-8b46-4ad4-bb56-2b7fa9bf6314/producer-observations.jsonl','Required actual all-legacy producer output is not yet accepted');
  const expected=process.env.GROUP_CONSUMER_LEGACY_SELECTED_SHA256;
  assert.match(expected??'',/^[a-f0-9]{64}$/,'Future producer output needs an independently reviewed exact runtime hash');
  const bytes=readFileSync(file!);assert.equal(createHash('sha256').update(bytes).digest('hex'),expected);
  const frames=bytes.toString().trim().split('\n').map(line=>JSON.parse(line));
  assert.equal(frames.filter(frame=>frame.kind==='failure').length,0);
  const sources=frames.filter(frame=>frame.kind==='group-selected-legacy-source'&&frame.id==='mixed-all-legacy-explicit-selection-root');
  assert.equal(sources.length,1);const source=sources[0];
  assert.equal(source.producerSourceSha256,'1531f03c3863dd64eb875dbc5338567b47f6a4ac07775accc892eb6a51730fe3');
  assert.equal(source.routeSha256,'c6d17149d74b5ab4435b5a85c8294105a519fcee49f3807188fc105e712db913');
  assert.equal(source.response.status,200);assert.equal(source.response.body.summary.errors,0);
  assert.equal(source.rows.length,2);assert.equal(source.w0.length,2);
  for(const row of source.rows){assert.equal(row.book_specs.bookId,'book-mvp-simple-adventure');
    assert.equal(row.product_info.line_item.bookSelection.bookId,'book-mvp-simple-adventure');
    assert(row.product_info.line_items.every((item:any)=>item.bookSelection.bookId==='book-mvp-simple-adventure'));}
  assert(frames.some(frame=>frame.kind==='mixed-case-pass'&&frame.id==='mixed-all-legacy-explicit-selection-root'));
  const complete=frames.filter(frame=>frame.kind==='complete'&&frame.family==='mixed-items');assert.equal(complete.length,1);assert.equal(complete[0].cases,44);
  return [['mixed-root',readRetainedSelectedRows('mixed-actual-stub-false')],['all-legacy-selected',structuredClone(source.rows)]];
}
