import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { SignJWT } from 'jose';
import { NextRequest } from 'next/server';

async function main() {
  Object.assign(process.env, {
    SUPABASE_URL: 'https://preview-db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-preview-server-key',
    BACKEND_API_TOKEN: 'synthetic-preview-file-authority-with-enough-entropy',
    CLOUDFLARE_ACCOUNT_ID: 'synthetic-preview', R2_ACCESS_KEY_ID: 'synthetic-access', R2_SECRET_ACCESS_KEY: 'synthetic-secret',
    CUSTOMER_REVIEW_STRICT_MODE: 'true',
  });
  const originalFetch = globalThis.fetch;
  const originalLog = console.log, originalWarn = console.warn, originalError = console.error;
  type Row = Record<string, unknown>;
  const id = 'ORDER-A-item-1', sibling = 'ORDER-A-item-2', foreign = 'ORDER-B-item-1';
  const prefix = `book-test/orders/${id}`;
  const token = 'synthetic-preview-token-A';
  let rows: Row[] = [], tokens: Row[] = [], feedback: Row[] = [], r2Reads: string[] = [], writes: string[] = [], lookups: string[] = [];
  let manifest: Row = {};
  const reset = () => {
    rows = [
      { id: 11, orderId: id, root_order_id: 'ORDER-A', amazon_order_id: 'ORDER-A', asset_prefix: prefix, book_specs: { bookId: 'book-test' }, character_specs: { childName: 'Synthetic Child', age: 6 }, customer_name: 'Synthetic Parent', customer_email: 'parent@example.test', status: 'pending', customer_approval_status: 'pending', revision_count: 0, updated_at: '2026-10-18T00:00:00Z', manifest_3_url: prefix + '/manifests/3-manifest.json', workflow_step: 'customer_approval', execution_status: 'done', review_stages: { postPdf: { status: 'approved' } } },
      { id: 12, orderId: sibling, root_order_id: 'ORDER-A', amazon_order_id: 'ORDER-A', status: 'pending' },
      { id: 13, orderId: foreign, root_order_id: 'ORDER-B', amazon_order_id: 'ORDER-B', status: 'pending' },
    ];
    tokens = [{ token, order_id: id, expires_at: new Date(Date.now() + 86400000).toISOString(), used_at: null }];
    feedback = []; r2Reads = []; writes = []; lookups = [];
    manifest = { internal: 'PRIVATE-MANIFEST-MARKER', backendApiToken: 'PRIVATE-CONFIG-MARKER', manifest: {
      pagePlan: [{ index: 0, label: 'p00', type: 'dedication' }, { index: 1, label: 'p01', type: 'story' }],
      pngGeneration: { pages: { p01: `${prefix}/preview-images/p01.png`, p00_dedication: `${prefix}/preview-images/p00.png`, p00: `${prefix}/preview-images/p00.png` }, coverSpreadImage: `${prefix}/preview-images/cover-spread.png` },
      summary: { readyForBook: true }, privateAddress: 'PRIVATE-ADDRESS-MARKER',
    } };
  };
  reset();
  const request = (path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) => new NextRequest(`https://admin.example.test${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const filtered = (items: Row[], url: URL) => items.filter((row) => [...url.searchParams].every(([name, value]) => {
    assert.ok(!value.startsWith('ilike.') && !value.startsWith('like.'), 'no fuzzy customer authorization query');
    if (value.startsWith('eq.')) return String(row[name] ?? '') === value.slice(3);
    if (value === 'is.null') return row[name] == null;
    if (value.startsWith('gt.')) return Date.parse(String(row[name])) > Date.parse(value.slice(3));
    return true;
  })).slice(0, Number(url.searchParams.get('limit') ?? 100));
  globalThis.fetch = async (input, init) => {
    const req = new Request(input, init), url = new URL(req.url);
    if (url.hostname === 'preview-db.example.test') {
      if (url.pathname.endsWith('/rpc/commit_customer_preview_action')) {
        assert.equal(req.method, 'POST'); const p = await req.json() as Row;
        const row = rows.find(row => row.id === p.p_order_id); const link = tokens.find(link => link.token === p.p_token);
        if (!row || !link || link.used_at || Date.parse(String(link.expires_at)) <= Date.now() ||
          !Object.entries(p.p_expected as Row).every(([key,value]) => JSON.stringify(row[key] ?? null) === JSON.stringify(value)) ||
          ['approved','revision_requested'].includes(String(row.customer_approval_status))) return Response.json(false);
        Object.assign(row, p.p_changes); link.used_at = new Date().toISOString(); writes.push('preview-action:RPC'); return Response.json(true);
      }
      const table = url.pathname.split('/').pop();
      let items = table === 'orders' ? rows : table === 'preview_tokens' ? tokens : table === 'customer_feedback' ? feedback : [];
      if (table === 'orders') lookups.push(url.searchParams.toString());
      let found = filtered(items, url);
      if (req.method === 'PATCH') {
        const changes = await req.json() as Row;
        // Model one atomic database statement after its request body has arrived.
        found = filtered(items, url);
        if (table === 'orders') { assert.equal(url.searchParams.get('id'), 'eq.11', 'all customer writes are pinned to own unique row'); assert.ok(found.length <= 1); }
        found.forEach((row) => Object.assign(row, changes)); writes.push(`${table}:PATCH`);
      } else if (req.method === 'POST') {
        assert.equal(table, 'customer_feedback'); const added = await req.json() as Row;
        assert.equal(added.order_id, id); feedback.push(added); found = [added]; writes.push('feedback:POST');
      } else assert.ok(['GET', 'HEAD'].includes(req.method));
      if (req.method === 'HEAD') return new Response(null, { headers: { 'Content-Range': `0-0/${found.length}` } });
      const singular = req.headers.get('Accept')?.includes('vnd.pgrst.object');
      return Response.json(singular ? found[0] ?? null : found);
    }
    assert.ok(url.hostname.endsWith('.synthetic-preview.r2.cloudflarestorage.com'), 'no real provider transport allowed');
    assert.ok(['GET', 'HEAD'].includes(req.method), 'no storage writes');
    const key = decodeURIComponent(url.pathname.slice(1)); r2Reads.push(key);
    if (key.endsWith('-manifest.json')) {
      assert.ok(key.startsWith(`${prefix}/manifests/`), 'only authorized own-order manifest reads');
      if (key.endsWith('/3-manifest.json')) return Response.json(manifest);
      return Response.json({ order: { orderId: id, assetPrefix: prefix, characterSpecs: { childName: 'Synthetic Child', age: 6 } } });
    }
    return new Response(req.method === 'HEAD' ? null : 'synthetic-image-bytes', { headers: { 'Content-Type': 'image/png' } });
  };
  console.log = () => undefined; console.warn = () => undefined; console.error = () => undefined;
  try {
    const { POST: validate } = await import('../src/app/api/preview/validate-token/route');
    const { POST: files, OPTIONS: fileOptions } = await import('../src/app/api/preview/[orderId]/files/route');
    const { GET: status, OPTIONS: statusOptions } = await import('../src/app/api/preview/[orderId]/status/route');
    const { POST: approve } = await import('../src/app/api/preview/[orderId]/approve/route');
    const { POST: reject } = await import('../src/app/api/preview/[orderId]/reject/route');
    const { POST: contact } = await import('../src/app/api/preview/contact/route');
    const assets = await import('../src/app/api/assets/[...path]/route');
    const manifests = await import('../src/app/api/manifests/[...path]/route');
    const pdf = await import('../src/app/api/pdf/[...path]/route');
    const { validatePreviewToken, validatePreviewReadToken } = await import('../src/lib/preview-tokens');
    const { findExactPreviewOrder } = await import('../src/lib/customer-preview-access');
    const context = (orderId = id) => ({ params: Promise.resolve({ orderId }) });
    const fileContext = (key: string) => ({ params: Promise.resolve({ path: key.split('/') }) });
    const getFiles = (orderId = id, linkToken: unknown = token) => files(request(`/api/preview/${orderId}/files`, 'POST', { token: linkToken }), context(orderId));

    for (const expires of ['2000-01-01', 'invalid-date', new Date(Date.now() - 1).toISOString()]) {
      reset(); tokens[0].expires_at = expires;
      const response = await validate(request('/api/preview/validate-token', 'POST', { token }));
      assert.equal(response.status, 401); assert.equal((await response.json()).order, undefined);
      assert.equal((await getFiles()).status, 401); assert.equal(r2Reads.length, 0); assert.equal(lookups.length, 0);
      assert.equal((await validatePreviewToken(token)).orderId, undefined);
    }
    for (const invalid of [null, {}, [], '', 'a', 'invalid%token', 'missing-token-with-no-record']) {
      reset(); assert.equal((await getFiles(id, invalid)).status, 401); assert.equal(r2Reads.length, 0); assert.equal(lookups.length, 0);
    }
    reset();
    assert.equal((await getFiles(foreign)).status, 403);
    assert.equal((await getFiles(sibling)).status, 403);
    assert.equal(r2Reads.length, 0); assert.ok(lookups.every((query) => !query.includes(foreign) && !query.includes(sibling)));
    tokens[0].order_id = 'ORDER-A'; assert.equal((await getFiles('ORDER-A')).status, 404, 'ambiguous root has no implicit primary');
    assert.equal(r2Reads.length, 0);
    reset(); rows = [rows[0]]; tokens[0].order_id = 'ORDER-A';
    assert.equal((await getFiles(id)).status, 200, 'unique root alias resolves own canonical book');
    reset(); rows[0].asset_prefix = `book-test/orders/${foreign}`;
    assert.equal((await getFiles()).status, 404); assert.equal(r2Reads.length, 0, 'cross-order path hints never reach R2');
    assert.equal(await findExactPreviewOrder('ORDER-A%'), null);

    reset(); const dtoResponse = await getFiles(); assert.equal(dtoResponse.status, 200);
    assert.match(dtoResponse.headers.get('cache-control')!, /private.*no-store/);
    const dto = await dtoResponse.json(); assert.equal(dto.ready, true);
    assert.deepEqual(dto.pages.map((page: { pageLabel: string }) => page.pageLabel), ['p00', 'p01']);
    assert.ok(dto.coverImageUrl); assert.ok(!JSON.stringify(dto).includes('PRIVATE-'));
    const image = new URL(dto.pages[0].imageUrl, 'https://admin.example.test');
    const imageKey = image.pathname.slice('/api/assets/'.length);
    const imageResponse = await assets.GET(request(image.pathname + image.search), fileContext(imageKey));
    assert.equal(imageResponse.status, 200); assert.match(imageResponse.headers.get('cache-control')!, /no-store/);
    assert.equal((await assets.HEAD(request(image.pathname + image.search, 'HEAD'), fileContext(imageKey))).status, 200);
    const before = r2Reads.length;
    for (const key of [`${prefix}/preview-images/p02.png`, `book-test/orders/${foreign}/preview-images/p00.png`, `${prefix}/manifests/3-manifest.json`]) {
      assert.equal((await assets.GET(request(`/api/assets/${key}${image.search}`), fileContext(key))).status, 401);
    }
    assert.equal((await assets.GET(request(`${image.pathname}${image.search}&previewGrant=duplicate`), fileContext(imageKey))).status, 401);
    assert.equal((await manifests.GET(request(`/api/manifests/${prefix}/manifests/3-manifest.json${image.search}`), fileContext(`${prefix}/manifests/3-manifest.json`))).status, 401);
    assert.equal((await pdf.GET(request(`/api/pdf/${prefix}/book.pdf${image.search}`), fileContext(`${prefix}/book.pdf`))).status, 401);
    assert.equal(r2Reads.length, before, 'invalid capabilities perform no storage work');
    const derived = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`littleherolabs:preview-files:v1\u0000${process.env.BACKEND_API_TOKEN}`)));
    for (const [purpose, exp] of [['wrong-purpose', Math.floor(Date.now() / 1000) + 60], ['customer-preview-image', Math.floor(Date.now() / 1000) - 1]] as const) {
      const grant = await new SignJWT({ purpose, key: imageKey }).setProtectedHeader({ alg: 'HS256' }).setIssuer('littleherolabs:preview-files:v1').setAudience('customer-preview-image').setIssuedAt().setExpirationTime(exp).sign(derived);
      assert.equal((await assets.GET(request(`${image.pathname}?previewGrant=${grant}`), fileContext(imageKey))).status, 401);
    }
    const machine = { Authorization: `Bearer ${process.env.BACKEND_API_TOKEN}` };
    assert.equal((await manifests.GET(request(`/api/manifests/${prefix}/manifests/3-manifest.json`, 'GET', undefined, machine), fileContext(`${prefix}/manifests/3-manifest.json`))).status, 200);
    assert.equal((await assets.GET(request('/api/assets/book-test/backgrounds/page01.png'), fileContext('book-test/backgrounds/page01.png'))).status, 200, 'public library rendering contract unchanged');
    assert.equal((await assets.GET(request(`/api/assets/${imageKey}`, 'GET', undefined, { Origin: 'https://admin.example.test', Host: 'admin.example.test' }), fileContext(imageKey))).status, 401);

    reset();
    assert.equal((await status(request(`/api/preview/${id}/status`), context())).status, 401); assert.equal(lookups.length, 0);
    assert.equal((await status(request(`/api/preview/${id}/status?email=wrong@example.test`), context())).status, 404);
    assert.equal((await status(request(`/api/preview/${id}/status?email=parent@example.test`), context())).status, 200);
    assert.equal((await status(request(`/api/preview/${id}/status`, 'GET', undefined, { 'X-Preview-Token': token }), context())).status, 200);
    assert.equal((await status(request(`/api/preview/${foreign}/status`, 'GET', undefined, { 'X-Preview-Token': token }), context(foreign))).status, 403);
    const approveRequest = () => request(`/api/preview/${id}/approve`, 'POST', { token });
    assert.equal((await approve(approveRequest(), context())).status, 200);
    assert.equal(rows[0].customer_approval_status, 'approved'); assert.ok(tokens[0].used_at);
    assert.equal((await approve(approveRequest(), context())).status, 401);
    assert.equal((await validatePreviewReadToken(token)).valid, true); assert.equal((await validatePreviewToken(token)).valid, false);
    const approvedRead = await (await validate(request('/api/preview/validate-token', 'POST', { token }))).json();
    assert.equal(approvedRead.readValid, true); assert.equal(approvedRead.canApprove, false); assert.equal(approvedRead.order.customerApprovalStatus, 'approved');
    assert.equal((await getFiles()).status, 200);
    const previousWrites = writes.length;
    assert.equal((await approve(request(`/api/preview/${sibling}/approve`, 'POST', { token }), context(sibling))).status, 401);
    assert.equal(writes.length, previousWrites);

    reset();
    assert.equal((await reject(request(`/api/preview/${id}/reject`, 'POST', { token, feedback: { pageNumber: 1, issueType: 'text', description: 'Synthetic correction' } }), context())).status, 200);
    assert.equal(rows[0].customer_approval_status, 'revision_requested'); assert.ok(tokens[0].used_at);
    const revisionRead = await (await validate(request('/api/preview/validate-token', 'POST', { token }))).json();
    assert.equal(revisionRead.readValid, true); assert.equal(revisionRead.canApprove, false); assert.equal(revisionRead.order.customerApprovalStatus, 'revision_requested');
    reset();
    assert.equal((await contact(request('/api/preview/contact', 'POST', { token, orderId: id, reason: 'name_typo', fields: { childName: 'Corrected Synthetic' }, email: 'parent@example.test' }))).status, 200);
    assert.equal(rows[0].customer_approval_status, 'revision_requested'); assert.ok(tokens[0].used_at);
    // Missing/unavailable RPC must leave both records unchanged and keep the link retryable.
    for (const kind of ['approve','reject','contact'] as const) {
      reset(); const healthy=globalThis.fetch;
      globalThis.fetch=async(input,init)=>{
        const r=new Request(input,init);
        if(new URL(r.url).pathname.endsWith('/rpc/commit_customer_preview_action')) return Response.json({message:'Synthetic RPC unavailable'},{status:503});
        return healthy(r);
      };
      const action=()=>kind==='approve'?approve(approveRequest(),context()):kind==='reject'?reject(request(`/api/preview/${id}/reject`,'POST',{token,feedback:{pageNumber:1,issueType:'text',description:'Synthetic'}}),context()):contact(request('/api/preview/contact','POST',{token,orderId:id,reason:'name_typo',fields:{childName:'Synthetic'},email:'parent@example.test'}));
      assert.equal((await action()).status,500); assert.equal(rows[0].customer_approval_status,'pending'); assert.equal(tokens[0].used_at,null);assert.deepEqual(writes,[]);
      globalThis.fetch=healthy;assert.equal((await action()).status,200);
    }
    for (const busy of [{current_workflow:'3'},{started_at:new Date().toISOString()},{execution_status:'processing'},{manifest_3_url:null},{review_stages:{}}]) {
      reset();Object.assign(rows[0],busy);assert.equal((await approve(approveRequest(),context())).status,409);assert.equal(tokens[0].used_at,null);assert.deepEqual(writes,[]);
    }
    // Distinct live links must compete on one atomic order transition, not just token use.
    for (const correction of ['reject', 'contact']) {
      reset();
      const otherToken = 'synthetic-preview-token-B';
      tokens.push({ ...tokens[0], token: otherToken });
      const correctionRequest = correction === 'reject'
        ? reject(request(`/api/preview/${id}/reject`, 'POST', { token: otherToken, feedback: { pageNumber: 1, issueType: 'text', description: 'Synthetic race' } }), context())
        : contact(request('/api/preview/contact', 'POST', { token: otherToken, orderId: id, reason: 'name_typo', fields: { childName: 'Synthetic' }, email: 'parent@example.test' }));
      const result = await Promise.all([approve(request(`/api/preview/${id}/approve`, 'POST', { token }), context()), correctionRequest]);
      assert.deepEqual(result.map(response => response.status).sort(), [200, 409]);
      if (rows[0].customer_approval_status === 'approved') { assert.equal((rows[0].rejection_history as Row[] | undefined)?.length ?? 0, 0); assert.equal(rows[0].next_workflow, '4'); assert.equal(feedback.length, 0); }
      else { assert.equal((rows[0].rejection_history as Row[]).length, 1); assert.equal(rows[0].customer_approval_status, 'revision_requested'); assert.equal(rows[0].next_workflow, null); assert.equal(feedback.length, 1); }
    }
    reset();
    const { readDurableCustomerCorrection } = await import('../src/lib/customer-corrections');
    const { GET: adminDetail } = await import('../src/app/api/orders/[orderId]/route');
    for (const kind of ['reject', 'contact'] as const) for (const fault of ['returned-feedback', 'thrown-feedback', 'status-projection', 'status-calculation'] as const) {
      if (kind === 'reject' && fault.startsWith('status')) continue;
      reset(); rows[0].rejection_history = [{ legacy: 'preserved' }];
      const healthyFetch = globalThis.fetch; let insertAttempts = 0;
      globalThis.fetch = async (input, init) => {
        const req = new Request(input, init), url = new URL(req.url);
        if (url.pathname.endsWith('/customer_feedback') && req.method === 'POST') {
          insertAttempts++;
          if (fault === 'returned-feedback') return Response.json({ message: 'Synthetic auxiliary failure' }, { status: 503 });
          if (fault === 'thrown-feedback') throw new Error('Synthetic auxiliary transport failure');
        }
        if (fault === 'status-calculation' && url.pathname.endsWith('/orders') && req.method === 'GET' && rows[0].customer_approval_status === 'revision_requested') return Response.json({ message: 'Synthetic status read failure' }, { status: 503 });
        if (fault === 'status-projection' && url.pathname.endsWith('/orders') && req.method === 'PATCH') {
          const changes = await req.clone().json() as Row;
          if (Object.hasOwn(changes, 'status') && !Object.hasOwn(changes, 'rejection_history')) return Response.json({ message: 'Synthetic projection failure' }, { status: 503 });
        }
        return healthyFetch(input, init);
      };
      const submit = () => kind === 'reject'
        ? reject(request(`/api/preview/${id}/reject`, 'POST', { token, feedback: { pageNumber: 2, issueType: 'text', description: 'Durable synthetic description' } }), context())
        : contact(request('/api/preview/contact', 'POST', { token, orderId: id, reason: 'name_typo', message: 'Durable synthetic message', fields: { childName: 'Durable Synthetic' }, email: 'parent@example.test' }));
      const accepted = await submit(); globalThis.fetch = healthyFetch;
      assert.equal(accepted.status, 200, `${kind}/${fault}: canonical acceptance`);
      const history = rows[0].rejection_history as Row[]; assert.equal(history.length, 2); assert.deepEqual(history[0], { legacy: 'preserved' });
      const durable = readDurableCustomerCorrection(rows[0], id)!; assert.ok(durable);
      assert.equal(durable.message, kind === 'reject' ? 'Durable synthetic description' : 'Durable synthetic message');
      assert.deepEqual(durable.payload, kind === 'reject' ? { pageNumber: 2, issueType: 'text' } : { childName: 'Durable Synthetic' });
      assert.equal(readDurableCustomerCorrection({ ...rows[0], revision_count: 0 }, id), null);
      assert.equal(readDurableCustomerCorrection(rows[0], foreign), null);
      const detail = await adminDetail(request(`/api/orders/${id}`), context());
      assert.equal(detail.status, 200, 'actual admin readback'); assert.deepEqual((await detail.json()).latestCustomerCorrection, durable);
      assert.equal((await submit()).status, 401); assert.equal(insertAttempts, 1); assert.equal((rows[0].rejection_history as Row[]).length, 2);
    }
    for (const kind of ['reject', 'contact'] as const) {
      reset(); rows[0].rejection_history = { malformed: true };
      const result = kind === 'reject'
        ? await reject(request(`/api/preview/${id}/reject`, 'POST', { token, feedback: { pageNumber: 1, issueType: 'text', description: 'Synthetic' } }), context())
        : await contact(request('/api/preview/contact', 'POST', { token, orderId: id, reason: 'name_typo', fields: { childName: 'Synthetic' }, email: 'parent@example.test' }));
      assert.equal(result.status, 500); assert.equal(tokens[0].used_at, null); assert.equal(writes.length, 0);
    }
    reset(); rows[0].revision_count = 1;
    assert.equal((await contact(request('/api/preview/contact', 'POST', { token, orderId: id, reason: 'name_typo', fields: { childName: 'Synthetic' }, email: 'parent@example.test' }))).status, 409);
    reset();
    rows[0].display_order_id = 'LH-01234-1'; rows[1].display_order_id = 'LH-01234-2'; rows[1].customer_email = 'parent@example.test';
    const group = await status(request('/api/preview/LH-01234/status?email=parent@example.test'), context('LH-01234'));
    assert.equal(group.status, 200); assert.deepEqual((await group.json()).bookOrderIds, ['LH-01234-1', 'LH-01234-2']);
    assert.equal((await status(request('/api/preview/LH-01234/status?email=wrong@example.test'), context('LH-01234'))).status, 404);
    assert.equal((await getFiles('LH-01234')).status, 403, 'email group listing never expands token authority');
    reset(); (manifest.manifest as Row).pagePlan = []; (manifest.manifest as Row).pageLabels = ['p00','p01','p02'];
    assert.equal((await (await getFiles()).json()).ready, false, 'legacy missing page is not ready');
    (manifest.manifest as Row).pageLabels = ['p00','p01'];
    assert.equal((await (await getFiles()).json()).ready, true, 'complete trusted legacy pageLabels supported');
    delete (manifest.manifest as Row).pageLabels;
    assert.equal((await (await getFiles()).json()).ready, false, 'received images never define completeness');
    (manifest.manifest as Row).pagePlan = [{label:'invalid'}];
    assert.equal((await (await getFiles()).json()).ready, false);
    reset(); (manifest.manifest as Row).pngGeneration = { pages: { p00: `book-test/orders/${foreign}/preview-images/p00.png` }, coverSpreadImage: `${prefix}/preview-images/cover-spread.png` };
    const partial = await (await getFiles()).json(); assert.equal(partial.ready, false); assert.equal(partial.pages.length, 0);
    for (const preflight of [await fileOptions(), await statusOptions()]) assert.match(preflight.headers.get('access-control-allow-headers')!, /X-Preview-Token/);

    // Carry the actual authorized DTO through the real frontend loader and renewal event.
    reset();
    const pageSource = readFileSync(resolve('../frontend/src/pages/approve/[token].astro'), 'utf8');
    const inline = pageSource.match(/<script[^>]*define:vars[^>]*>([\s\S]*?)<\/script>/)![1];
    const tree = ts.createSourceFile('preview.js', inline, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const names = new Set(['loadPages', 'refreshPreviewFiles', 'endPreviewAccess', 'syncReactViewer', 'computeInitialSpreadIndex', 'createSpreads', 'loadPagesAndDisplay']);
    const functions = tree.statements.filter((node) => ts.isFunctionDeclaration(node) && node.name && names.has(node.name.text)).map((node) => node.getText(tree)).join('\n');
    const events: Array<{ detail: { preservePosition?: boolean; spreads: unknown[] } }> = [];
    let timer: (() => void) | undefined;
    const sandbox = vm.createContext({ console: { log() {}, warn() {}, error() {} }, Date, URL, Number, Map, Set,
      API_BASE: 'https://admin.example.test', token, document: { hidden: false },
      window: { dispatchEvent(event: { detail: { spreads: unknown[] } }) { events.push(event); } },
      CustomEvent: class { constructor(public name: string, public detailWrapper: { detail: unknown }) { Object.assign(this, detailWrapper); } },
      setTimeout(callback: () => void) { timer = callback; return 1; }, clearTimeout() {}, clearInterval() {},
      updatePreviewReadiness() {}, showError() {}, updateHeaderForCurtain() {}, loadingState: null,
      fetch: async (url: string, options: RequestInit) => files(new Request(url, options), context()),
    });
    vm.runInContext(`let orderData={orderId:${JSON.stringify(id)}};let previewFilesTimer=null,previewFilesExpiresAt=0,refreshingPreviewFiles=false,previewAccessEnded=false,previewApprovalAllowed=true,previewPagesLoaded=false,statusPollInterval=null;let spreads=[],currentInitialSpread=0,bookViewerReady=true;const BOOK_VIEWER_EVENT='preview-test',bookViewerWrapper=null,previewContent={style:{}};${functions}`, sandbox);
    const loaded = await vm.runInContext(`loadPages(${JSON.stringify(id)})`, sandbox);
    assert.deepEqual(loaded.pages.map((entry: { pageLabel: string }) => entry.pageLabel), ['p00', 'p01']); assert.equal(loaded.ready, true); assert.ok(timer);
    await vm.runInContext('refreshPreviewFiles()', sandbox);
    assert.equal(events.at(-1)?.detail.preservePosition, true);
    assert.ok(events.at(-1)?.detail.spreads.length);
    tokens[0].expires_at = '2000-01-01';
    await vm.runInContext(`loadPagesAndDisplay(${JSON.stringify(id)})`, sandbox);
    assert.equal(vm.runInContext('previewAccessEnded', sandbox), true);
    assert.equal(vm.runInContext('previewContent.style.display', sandbox), 'none', 'denied loader cannot reopen preview');
    vm.runInContext('fetch = async () => { endPreviewAccess(); throw new Error("Synthetic late network failure"); }', sandbox);
    await vm.runInContext(`loadPagesAndDisplay(${JSON.stringify(id)})`, sandbox);
    assert.equal(vm.runInContext('previewContent.style.display', sandbox), 'none', 'late network failure cannot reopen preview');
    assert.ok(pageSource.includes("showReadOnlyPreview('Your correction request has been received.')"));
    assert.ok(!pageSource.includes('/api/manifests/')); assert.ok(!pageSource.includes('localStorage'));
    const layout = readFileSync(resolve('../frontend/src/layouts/Layout.astro'), 'utf8');
    assert.ok(layout.includes('{!sensitivePreview && <ClientRouter')); assert.ok(layout.includes('{!sensitivePreview && <>')); assert.ok(layout.includes("sensitivePreview ? '/approve'"));
  } finally {
    globalThis.fetch = originalFetch; console.log = originalLog; console.warn = originalWarn; console.error = originalError;
  }
  console.log('Customer preview actual routes + frontend DTO: lifecycle, exact scope, pinned writes, image capabilities, privacy, readiness and renewal passed; zero live traffic');
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
