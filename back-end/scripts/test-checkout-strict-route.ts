import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { connect } from 'node:net';

async function main() {
  for (const host of ['127.0.0.1', '192.0.2.1']) await new Promise<void>((resolve, reject) => {
    const socket = connect(443, host); socket.setTimeout(1500, () => { socket.destroy(); reject(Error('Network denial not proven')); });
    socket.on('connect', () => { socket.destroy(); reject(Error('Network unexpectedly connected')); });
    socket.on('error', error => ['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code || '') ? resolve() : reject(error));
  });
  Object.assign(process.env, { SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic', STRIPE_SECRET_KEY: 'sk_test_synthetic', D2C_FRONTEND_ORIGIN: 'https://www.littleherolabs.com' });
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw Error('Unexpected external call'); };
  const { POST } = await import('../src/app/api/checkout/create/route');
  const base = { shipping_address: { name: 'Test Adult', address_line1: '1 Test Lane', city: 'Test', state: 'CA', postal_code: '00000', country: 'US' }, customer_email: 'buyer@example.test', character_specs: { name: 'A', age: 5, favoriteAnimal: 'cat' } };
  for (const [label, patch, path] of [
    ['partial age', { character_specs: { ...base.character_specs, age: '7years' } }, 'character_specs.age'],
    ...['', ' ', '-1', '+1', '1e1', '11', '99999999999999999999999999999999999999999999999'].map(age => [`invalid age ${age}`, { character_specs: { ...base.character_specs, age } }, 'character_specs.age'] as const),
    ['fractional age', { character_specs: { ...base.character_specs, age: '3.5' } }, 'character_specs.age'],
    ['names conflict', { character_specs: { ...base.character_specs, childName: 'B' } }, 'character_specs.childName'],
    ['guides conflict', { character_specs: { ...base.character_specs, animalGuide: 'dog' } }, 'character_specs.animalGuide'],
    ['book conflict', { product_info: { bookId: 'book-mvp-simple-adventure', book_id: 'other' } }, 'product_info.bookId'],
    ['format conflict', { product_info: { formatId: 'standard', format_id: 'other' } }, 'product_info.formatId'],
    ['sibling conflict', { character_specs: undefined, books: [{ character_specs: base.character_specs }, { character_specs: { ...base.character_specs, animalGuide: 'dog' } }] }, 'books.1.character_specs.animalGuide'],
    ['shapes conflict', { books: [{ character_specs: { ...base.character_specs, age: 6 } }] }, 'books'],
    ['missing guide', { character_specs: { name: 'A', age: 5 } }, 'character_specs.animalGuide'],
    ['blank guide', { character_specs: { ...base.character_specs, favoriteAnimal: '' } }, 'character_specs.animalGuide'],
    ...Object.getOwnPropertyNames(Object.prototype).map(guide => [`prototype guide ${guide}`, { character_specs: { ...base.character_specs, favoriteAnimal: guide } }, 'character_specs.animalGuide'] as const),
    ...Object.getOwnPropertyNames(Object.prototype).map(bookId => [`prototype book ${bookId}`, { product_info: { bookId } }, 'character_specs.animalGuide'] as const),
    ...['book-mvp-simple-adventure', 'book-finding-our-inner-voice'].map(bookId => [`unsupported guide ${bookId}`, { product_info: { bookId }, character_specs: { ...base.character_specs, favoriteAnimal: 'dragon' } }, 'character_specs.animalGuide'] as const),
  ] as const) {
    const response = await POST(new NextRequest('https://admin.example.test/api/checkout/create', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': label }, body: JSON.stringify({ ...base, ...patch }) }));
    assert.equal(response.status, 400, label);
    const result = await response.json(); assert.ok(result.fields?.some((field: {path: string}) => field.path === path), label); assert.equal(calls, 0, label);
  }
  const rows: Record<string, any>[] = [];
  const { loadBundledBookConfig } = await import('../src/lib/books/load-book-config');
  const { computeBookConfigChecksum } = await import('../src/lib/books/runtime-book-config');
  const innerConfig = { ...loadBundledBookConfig({ bookId: 'book-finding-our-inner-voice', version: 2 }), status: 'active' as const };
  const configRow = { book_id: innerConfig.bookId, version: 2, is_active: true, config_json: innerConfig, checksum: computeBookConfigChecksum(innerConfig) };
  process.env.D2C_INNER_VOICE_V2_SALES_ENABLED = '1';
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    if (url.hostname === 'db.example.test' && url.pathname === '/rest/v1/idempotency_keys') return request.method === 'GET' ? Response.json(null) : new Response(null, { status: 201 });
    if (url.hostname === 'db.example.test' && url.pathname === '/rest/v1/book_configs') return Response.json(configRow);
    if (url.hostname === 'db.example.test' && url.pathname === '/rest/v1/orders') { rows.push(await request.json()); return Response.json({ id: rows.length }); }
    if (url.hostname === 'api.stripe.com' && url.pathname === '/v1/checkout/sessions') return Response.json({ id: 'cs_test_synthetic', object: 'checkout.session', url: 'https://checkout.example.test/synthetic' });
    throw Error('Unexpected transport: ' + url.hostname + url.pathname);
  };
  const guides = ['cat', 'dog', 'owl', 'lion', 'tiger', 'penguin', 'unicorn', 't-rex'];
  const matrix = ['book-mvp-simple-adventure', 'book-finding-our-inner-voice'].flatMap(bookId => guides.flatMap(guide => (guide === 't-rex' ? ['t-rex', 'trex', 't rex', 'dinosaur'] : [guide]).map(alias => ({ bookId, guide, alias }))));
  const accepted = [
    { ...base, character_specs: { name: ' A ', childName: 'A', age: ' 0007 ', favorite_animal: ' T Rex ', favoriteAnimal: 'dinosaur', animalGuide: 't-rex', hometown: 'Oak' }, product_info: { bookId: ' book-mvp-simple-adventure ', book_id: 'book-mvp-simple-adventure', format_id: ' standard ' } },
    { ...base, character_specs: { name: 'A', age: 5, favorite_animal: 'cat' } },
    { ...base, character_specs: { name: 'A', age: '05', favoriteAnimal: 'cat' }, books: [{ character_specs: { childName: ' A ', age: 5, animalGuide: 'CAT' } }] },
    { ...base, character_specs: { name: 'A', childName: 'A', age: 5, favorite_animal: 'dinosaur' }, product_info: { bookId: 'book-finding-our-inner-voice', formatId: 'standard' } },
    ...matrix.map(({bookId, guide, alias}) => ({ ...base, character_specs: { name: 'A', age: 5, animalGuide: ` ${guide.toUpperCase()} `, favoriteAnimal: alias, favorite_animal: guide }, product_info: { bookId, formatId: 'standard' } })),
  ];
  for (const [index, payload] of accepted.entries()) {
    const response = await POST(new NextRequest('https://admin.example.test/api/checkout/create', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': 'accepted-' + index }, body: JSON.stringify(payload) }));
    assert.equal(response.status, 201, await response.clone().text());
  }
  assert.equal(rows.length, 4 + matrix.length);
  for (const row of rows) {
    const specs = row.character_specs;
    assert.equal(specs.childName, 'A'); assert.equal(specs.name, 'A');
    assert.equal(specs.animalGuide, specs.favoriteAnimal); assert.equal(specs.animalGuide, specs.favorite_animal);
  }
  assert.equal(rows[0].character_specs.age, 7); assert.equal(rows[0].character_specs.animalGuide, 't-rex');
  assert.equal(rows[0].character_specs.hometown, 'Oak'); assert.equal(rows[1].character_specs.animalGuide, 'cat');
  const { buildW0RunManifestFromConfig } = await import('../src/lib/books/build-run-manifest');
  const { normalizeW0Manifest } = await import('../src/lib/books/normalize-w0-manifest');
  const { buildW2APoseWorklist } = await import('../src/lib/books/review-page-plan');
  const { buildW2APoseInput } = await import('../src/lib/books/w2a-pose-input');
  const { buildW3PreviewPlan } = await import('../src/lib/books/w3-preview-plan');
  const specs = rows[3].character_specs;
  const w0 = buildW0RunManifestFromConfig(innerConfig, { orderId: rows[3].orderId, platform: 'd2c', formatId: 'standard', characterHash: rows[3].character_hash, input: { characterSpecs: specs, bookSpecs: { testMode: true } } });
  const frozen = normalizeW0Manifest(w0);
  assert.deepEqual(frozen.characterSpecs, specs);
  const worklist = buildW2APoseWorklist(frozen.pagePlan, { includeZeroPose: true, coverLayers: frozen.renderSnapshot?.bookConfig.rendering.recipe?.covers.standard.layers });
  const pose = await buildW2APoseInput({ orderId: rows[3].orderId, bookId: innerConfig.bookId, formatId: 'standard', configVersion: innerConfig.version, characterHash: rows[3].character_hash, characterSpecs: specs, renderSnapshot: frozen.renderSnapshot, testMode: true, ...worklist[0] }, { loadConfig: async () => innerConfig });
  assert.match(pose.userPromptText, /includes t-rex/);
  const preview = buildW3PreviewPlan({ orderId: rows[3].orderId, bookId: innerConfig.bookId, formatId: 'standard', configVersion: innerConfig.version, renderSnapshot: frozen.renderSnapshot, backendUrl: 'https://offline.invalid', characterHash: rows[3].character_hash, characterSpecs: specs, testMode: true, processedImages: worklist.map(item => ({ poseNumber: item.poseNumber, publicUrl: `https://offline.invalid/pose${item.poseNumber}.png` })) });
  assert.match(preview.pages_html, /T-Rex/);
  const legacy = loadBundledBookConfig({ bookId: 'book-mvp-simple-adventure', version: 1 });
  const legacySpecs = rows[0].character_specs;
  const legacyW0 = buildW0RunManifestFromConfig(legacy, { orderId: rows[0].orderId, platform: 'd2c', formatId: 'standard', characterHash: rows[0].character_hash, input: { characterSpecs: legacySpecs, bookSpecs: { testMode: true } } });
  const legacyFrozen = normalizeW0Manifest(legacyW0);
  assert.deepEqual(legacyFrozen.characterSpecs, legacySpecs);
  const legacyWorklist = buildW2APoseWorklist(legacyFrozen.pagePlan, { includeZeroPose: true });
  const legacyPose = await buildW2APoseInput({ orderId: rows[0].orderId, bookId: legacy.bookId, formatId: 'standard', characterHash: rows[0].character_hash, characterSpecs: legacySpecs, renderSnapshot: legacyFrozen.renderSnapshot, testMode: true, ...legacyWorklist[0] }, { loadConfig: async () => legacy });
  assert.match(legacyPose.userPromptText, /includes t-rex/);
  const { buildW3AssemblyInput } = await import('../src/lib/books/w3-assembly-input');
  const { buildBgRemovedPoseAssetKey } = await import('../src/lib/order-paths');
  const twoB = { characterHash: rows[0].character_hash, order: { orderId: rows[0].orderId, bookId: legacy.bookId }, entries: legacyWorklist.map(item => ({ poseNumber: item.poseNumber, bgRemovedKey: buildBgRemovedPoseAssetKey(rows[0].character_hash, item.poseNumber, legacy.bookId) })) };
  const assembly = await buildW3AssemblyInput({ orderId: rows[0].orderId, bookId: legacy.bookId, formatId: 'standard', testMode: true, testModePages: 0 }, { loadManifest: async key => key.endsWith('1-manifest.json') ? legacyW0 : key.endsWith('2b-manifest.json') ? twoB : null });
  const legacyPreview = buildW3PreviewPlan({ ...assembly, backendUrl: 'https://offline.invalid' });
  assert.equal(legacyPreview.animalImages.slug, 't-rex');
  for (const [index, { bookId, guide, alias }] of matrix.entries()) {
    const row = rows[4 + index];
    const config = bookId === legacy.bookId ? legacy : innerConfig;
    const specs = row.character_specs;
    assert.equal(specs.animalGuide, guide, `${bookId} ${alias}`);
    assert.equal(specs.favoriteAnimal, guide); assert.equal(specs.favorite_animal, guide);
    const w0 = buildW0RunManifestFromConfig(config, { orderId: row.orderId, platform: 'd2c', formatId: 'standard', characterHash: row.character_hash, input: { characterSpecs: specs, bookSpecs: { testMode: true } } });
    const frozen = normalizeW0Manifest(w0);
    assert.deepEqual(frozen.characterSpecs, specs);
    const worklist = buildW2APoseWorklist(frozen.pagePlan, { includeZeroPose: true, coverLayers: frozen.renderSnapshot?.bookConfig.rendering.recipe?.covers.standard.layers });
    const pose = await buildW2APoseInput({ orderId: row.orderId, bookId, formatId: 'standard', configVersion: config.version, characterHash: row.character_hash, characterSpecs: specs, renderSnapshot: frozen.renderSnapshot, testMode: true, ...worklist[0] }, { loadConfig: async () => config });
    assert.ok(pose.userPromptText.includes(`Story context: the child theme includes ${guide}.`), `${bookId} ${alias} W2`);
    if (bookId === legacy.bookId) {
      const twoB = { characterHash: row.character_hash, order: { orderId: row.orderId, bookId }, entries: worklist.map(item => ({ poseNumber: item.poseNumber, bgRemovedKey: buildBgRemovedPoseAssetKey(row.character_hash, item.poseNumber, bookId) })) };
      const assembly = await buildW3AssemblyInput({ orderId: row.orderId, bookId, formatId: 'standard', testMode: true, testModePages: 0 }, { loadManifest: async key => key.endsWith('1-manifest.json') ? w0 : key.endsWith('2b-manifest.json') ? twoB : null });
      const preview = buildW3PreviewPlan({ ...assembly, backendUrl: 'https://offline.invalid' });
      assert.equal(preview.animalImages.slug, guide, `${bookId} ${alias} W3`);
    } else {
      const preview = buildW3PreviewPlan({ orderId: row.orderId, bookId, formatId: 'standard', configVersion: config.version, renderSnapshot: frozen.renderSnapshot, backendUrl: 'https://offline.invalid', characterHash: row.character_hash, characterSpecs: specs, testMode: true, processedImages: worklist.map(item => ({ poseNumber: item.poseNumber, publicUrl: `https://offline.invalid/pose${item.poseNumber}.png` })) });
      const displayed = guide === 't-rex' ? 'T-Rex' : guide[0].toUpperCase() + guide.slice(1);
      assert.ok(preview.pages_html.includes(displayed), `${bookId} ${alias} W3`);
    }
  }
  console.log('Strict checkout rejects invalid cases before calls and accepts normalized forms with synthetic adapters.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
