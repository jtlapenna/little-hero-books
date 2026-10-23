import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { buildW2ABootstrapManifest } from '../src/lib/books/w2a-manifest';
import { loadBundledBookConfig } from '../src/lib/books/load-book-config';
import { resolveW2APoseWorklistResponse } from '../src/app/api/internal/w2a/resolve-pose-worklist/route';
import { buildValidatedW2ABootstrapManifest, buildW2ABootstrapResponse, persistValidatedW2ABootstrapManifest, W2ABootstrapExistsError } from '../src/app/api/internal/w2a/bootstrap-manifest/route';

type CodeGraph = { nodes: Array<{ name: string; parameters?: { jsCode?: string; jsonBody?: string; headerParameters?: { parameters?: Array<{ name: string; value?: string }> }; queryParameters?: { parameters?: Array<{ name: string; value?: string }> } } }>; connections?: Record<string, { main?: Array<Array<{ node: string }>> }> };

async function runCode(graph: CodeGraph, name: string, context: Record<string, unknown>) {
  const code = graph.nodes.find((node) => node.name === name)?.parameters?.jsCode;
  assert.ok(code, `Missing ${name}`);
  return await vm.runInNewContext(`(async () => { ${code}\n })()`, {
    console: { log() {}, warn() {}, error() {} }, ...context,
  }, { timeout: 1000 }) as Array<{ json: Record<string, unknown> }>;
}

async function main() {
  const deployedPath = process.argv[2];
  const workflowPath = deployedPath ?? path.resolve('../docs/n8n-workflow-files/repo-centric/workflows/w1.1-Queue_Manager_and_Router.repo-centric.json');
  const workflow = JSON.parse(readFileSync(workflowPath, 'utf8')) as CodeGraph;
  const w2aPath = process.argv[3] ?? path.resolve('../docs/n8n-workflow-files/repo-centric/workflows/w2A-Orchestrator.repo-centric.json');
  const w2aGraph = JSON.parse(readFileSync(w2aPath, 'utf8')) as CodeGraph;
  const config = loadBundledBookConfig({ bookId: 'book-finding-our-inner-voice', version: 2 });
  const manifest = buildW0RunManifestFromConfig(config, {
    orderId: 'SYNTHETIC-W1-W2A', platform: 'd2c', formatId: 'standard', characterHash: 'synthetic-hash',
    input: { characterSpecs: { childName: 'Alex', animalGuide: 'cat' }, bookSpecs: { testMode: true } },
  });
  const pointer = manifest.artifacts.manifestKey;
  const cronRow = {
    id: 19, orderId: 'SYNTHETIC-W1-W2A', root_order_id: 'SYNTHETIC-W1-W2A',
    character_specs: { childName: 'Alex', animalGuide: 'cat' },
    character_hash: 'synthetic-hash', one_manifest_url: pointer, next_workflow: '2A',
    updated_at: '2026-10-21T00:00:00.000Z',
    print_book_id: config.bookId, print_format_id: 'standard', print_config_version: 2,
  };
  const extracted = await runCode(workflow, 'Extract Orders from Webhook', {
    $input: { first: () => ({ json: { body: { orders: [cronRow] } } }) },
  });
  const routed = await runCode(workflow, 'Route Orders by Workflow', {
    $input: { all: () => extracted }, $execution: { customData: {} },
  });
  assert.equal((routed[0].json.workflow2A as unknown[]).length, 1);
  const prepared = await runCode(workflow, 'Prep 2A Orders', {
    $input: { first: () => routed[0] },
    fetch: async () => ({ ok: true, json: async () => manifest }),
  });
  assert.equal(prepared.length, 1);
  assert.equal(prepared[0].json.oneManifestUrl, pointer);
  assert.equal((prepared[0].json.bookSpecs as { testMode?: boolean })?.testMode, true);
  const repoWorkflow = JSON.parse(readFileSync(path.resolve('../docs/n8n-workflow-files/repo-centric/workflows/w1.1-Queue_Manager_and_Router.repo-centric.json'), 'utf8')) as CodeGraph;
  const missingSpecsRow = { ...cronRow, character_specs: null };
  const missingSpecsRouting = { json: { workflow2A: [missingSpecsRow] } };
  const recovered = await runCode(repoWorkflow, 'Prep 2A Orders', {
    $input: { first: () => missingSpecsRouting },
    fetch: async () => ({ ok: true, json: async () => manifest }),
  });
  assert.equal((recovered[0].json.characterSpecs as { childName?: string }).childName, 'Alex');
  assert.equal((recovered[0].json.bookSpecs as { testMode?: boolean }).testMode, true);
  const missingBothRow = { ...missingSpecsRow, character_hash: null };
  const missingBoth = await runCode(repoWorkflow, 'Prep 2A Orders', {
    $input: { first: () => ({ json: { workflow2A: [missingBothRow] } }) },
    fetch: async () => ({ ok: true, json: async () => manifest }),
  });
  assert.equal(missingBoth[0].json.characterHash, 'synthetic-hash', 'W1 must use the frozen W0 hash');
  const staleHash = await runCode(repoWorkflow, 'Prep 2A Orders', {
    $input: { first: () => ({ json: { workflow2A: [{ ...missingSpecsRow, character_hash: 'stale-hash' }] } }) },
    fetch: async () => ({ ok: true, json: async () => manifest }),
  });
  assert.equal(staleHash.length, 0, 'W1 must hold a row with a stale character hash');
  let configuredFetches = 0;
  const staleNonempty = await runCode(repoWorkflow, 'Prep 2A Orders', {
    $input: { first: () => ({ json: { workflow2A: [{
      ...cronRow, character_specs: { childName: 'Wrong child', animalGuide: 'cat' }, character_hash: 'stale-hash',
    }] } }) },
    fetch: async () => { configuredFetches++; return { ok: true, json: async () => manifest }; },
  });
  assert.equal(configuredFetches, 1, 'Configured rows must read frozen W0 before claim');
  assert.equal(staleNonempty.length, 0, 'Stale nonempty specs must be held before claim');
  const failedConfiguredFetch = await runCode(repoWorkflow, 'Prep 2A Orders', {
    $input: { first: () => ({ json: { workflow2A: [cronRow] } }) },
    fetch: async () => ({ ok: false, status: 503 }),
  });
  assert.equal(failedConfiguredFetch.length, 0, 'Configured row must stay unclaimed when frozen W0 cannot be read');
  const malformedConfiguredManifest = await runCode(repoWorkflow, 'Prep 2A Orders', {
    $input: { first: () => ({ json: { workflow2A: [cronRow] } }) },
    fetch: async () => ({ ok: true, json: async () => ({ schema: 'lhb.run-manifest@v3' }) }),
  });
  assert.equal(malformedConfiguredManifest.length, 0, 'Configured row must stay unclaimed when W0 is malformed');
  const validNonemptyMissingHash = await runCode(repoWorkflow, 'Prep 2A Orders', {
    $input: { first: () => ({ json: { workflow2A: [{ ...cronRow, character_hash: null }] } }) },
    fetch: async () => ({ ok: true, json: async () => manifest }),
  });
  assert.equal(validNonemptyMissingHash[0].json.characterHash, 'synthetic-hash');
  const failedRecovery = await runCode(repoWorkflow, 'Prep 2A Orders', {
    $input: { first: () => missingSpecsRouting },
    fetch: async () => ({ ok: false, status: 404 }),
  });
  assert.equal(failedRecovery.length, 0, 'Failed manifest fetch must leave the order ready for retry');
  const emptySpecsRecovery = await runCode(repoWorkflow, 'Prep 2A Orders', {
    $input: { first: () => ({ json: { workflow2A: [{ ...cronRow, character_specs: {} }] } }) },
    fetch: async () => ({ ok: true, json: async () => manifest }),
  });
  assert.equal((emptySpecsRecovery[0].json.characterSpecs as { childName?: string }).childName, 'Alex');
  const wrongLegacy = {
    schema: 'lhb.run-manifest@v2.0', order: {
      orderId: 'SYNTHETIC-OTHER-ORDER', characterSpecs: { childName: 'Wrong child' },
    },
  };
  const rejectedLegacyRecovery = await runCode(repoWorkflow, 'Prep 2A Orders', {
    $input: { first: () => missingSpecsRouting },
    fetch: async () => ({ ok: true, json: async () => wrongLegacy }),
  });
  assert.equal(rejectedLegacyRecovery.length, 0, 'Wrong-order legacy specs must not reach W2A');
  await assert.rejects(() => resolveW2APoseWorklistResponse({
    orderId: cronRow.orderId, oneManifestUrl: pointer,
  }, {
    downloadOneManifest: async () => wrongLegacy,
    loadBookConfig: async () => config,
    instrumentPoseWorkItems: async (payload) => payload.poseWorklist,
  }), /order identity/, 'Legacy nested order identity must match W2A request');
  if (deployedPath) {
    const activeRecovery = await runCode(workflow, 'Prep 2A Orders', {
      $input: { first: () => missingSpecsRouting },
      fetch: async () => ({ ok: true, json: async () => manifest }),
    });
    assert.equal((activeRecovery[0]?.json.characterSpecs as { childName?: string })?.childName, 'Alex',
      'Selected W1 graph must recover missing specs from frozen W0');
  }

  const claimNode = workflow.nodes.find((node) => node.name === 'Mark as Processing (2A)');
  assert.equal(claimNode?.parameters?.headerParameters?.parameters?.find((header) => header.name === 'Prefer')?.value, 'return=representation');
  const revisionExpression = claimNode?.parameters?.queryParameters?.parameters?.find((parameter) => parameter.name === 'updated_at')?.value;
  assert.ok(revisionExpression?.includes('expectedUpdatedAt'), 'W1 claim must compare the row revision verified before claim');
  if (!revisionExpression) throw new Error('Missing W1 claim revision predicate');
  const revisionPredicate = vm.runInNewContext(revisionExpression.slice(3, -2), { $json: {
    expectedUpdatedAt: cronRow.updated_at,
  } }) as string;
  assert.equal(revisionPredicate, `eq.${cronRow.updated_at}`);
  for (const marker of ['started_at', 'current_workflow']) {
    assert.equal(claimNode?.parameters?.queryParameters?.parameters?.find((parameter) => parameter.name === marker)?.value, 'is.null');
  }
  assert.equal(workflow.connections?.['Prep 2A Orders']?.main?.[0]?.[0]?.node, 'Mark as Processing (2A)');
  assert.equal(workflow.connections?.['Mark as Processing (2A)']?.main?.[0]?.[0]?.node, 'Trigger 2A Workflow');
  assert.equal(workflow.nodes.find((node) => node.name === 'Trigger 2A Workflow')?.parameters?.jsonBody, '={{$json}}');
  const claimedRow = {
    ...missingSpecsRow,
    character_hash: null,
    order_id: cronRow.orderId,
    book_specs: { title: 'Stale legacy title' },
    print_book_id: config.bookId,
    print_format_id: 'standard',
    print_config_version: 2,
    execution_status: 'processing',
  };
  const normalized = await runCode(w2aGraph, 'Normalize Router Payload', {
    $input: { first: () => ({ json: { body: claimedRow } }) },
  });
  const execution = { customData: {} as Record<string, unknown> };
  const staticData = {};
  const captured = await runCode(w2aGraph, 'Capture Order Context', {
    $json: normalized[0].json,
    $execution: execution,
    $getWorkflowStaticData: () => staticData,
  });
  assert.equal(captured[0].json.characterHash, null);
  assert.equal(w2aGraph.connections?.['Capture Order Context']?.main?.[0]?.[0]?.node, 'Prepare Bootstrap 2A Manifest Body');
  assert.equal(w2aGraph.connections?.['Bootstrap 2A Manifest Stub']?.main?.[0]?.[0]?.node, 'Set Environment Defaults (code)');
  assert.equal(w2aGraph.connections?.['Set Environment Defaults (code)']?.main?.[0]?.[0]?.node, 'Generate Character Hash1');
  const preparedBootstrap = await runCode(w2aGraph, 'Prepare Bootstrap 2A Manifest Body', { $json: captured[0].json });
  const bootstrapPayload = (JSON.parse(String(preparedBootstrap[0].json.requestBody)) as { payload: Record<string, unknown> }).payload;
  assert.equal(bootstrapPayload.oneManifestUrl, pointer);
  assert.throws(() => buildW2ABootstrapManifest(normalized[0].json), /requires characterHash/);
  const validatedBootstrap = await buildValidatedW2ABootstrapManifest(bootstrapPayload, {
    downloadOneManifest: async (key) => { assert.equal(key, pointer); return manifest; },
  });
  await assert.rejects(() => buildValidatedW2ABootstrapManifest({
    ...bootstrapPayload,
    orderContext: { ...bootstrapPayload.orderContext as Record<string, unknown>, oneManifestUrl: 'book-finding-our-inner-voice/orders/OTHER-ORDER/manifests/1-manifest.json' },
  }, {
    downloadOneManifest: async (key) => { assert.equal(key, pointer); return manifest; },
  }), /conflicting frozen W0 manifest pointers/, 'Bootstrap must reject conflicting W0 pointers');
  assert.equal(validatedBootstrap.manifestKey, pointer.replace('/1-manifest.json', '/2a-manifest.json'));
  assert.equal(validatedBootstrap.characterHash, 'synthetic-hash', 'Frozen W0 must supply missing claim data');
  assert.equal(validatedBootstrap.characterSpecs.childName, 'Alex', 'Claim response must not erase recovered character specs');
  assert.equal(validatedBootstrap.bookSpecs.testMode, true, 'Frozen W0 must own book specs');
  const bootstrapResponse = buildW2ABootstrapResponse(bootstrapPayload, validatedBootstrap);
  const defaultsResult = await runCode(w2aGraph, 'Set Environment Defaults (code)', {
    $json: bootstrapResponse,
    $binary: {},
    $items: () => [{ json: bootstrapResponse }],
  });
  const hashResult = await runCode(w2aGraph, 'Generate Character Hash1', {
    $json: (defaultsResult as unknown as { json: Record<string, unknown> }).json,
    $binary: {}, $input: { item: {} }, $execution: execution, $getWorkflowStaticData: () => staticData,
  });
  const canonicalGraphOutput = (hashResult as unknown as { json: Record<string, unknown> }).json;
  assert.equal(canonicalGraphOutput.characterHash, 'synthetic-hash');
  assert.equal((canonicalGraphOutput.characterSpecs as { childName?: string }).childName, 'Alex');
  assert.equal((execution.customData.orderContext as { characterHash?: string }).characterHash, 'synthetic-hash');
  const started = await runCode(w2aGraph, 'Start / Pass-through', {
    $json: { success: true, baseCharacterKey: 'synthetic-base.png' },
    $items: () => [defaultsResult],
    $runIndex: 0, $input: { item: {} }, $itemIndex: 0,
  });
  assert.equal(started[0].json.characterHash, 'synthetic-hash');
  assert.equal(started[0].json.oneManifestUrl, pointer);
  assert.equal(started[0].json.print_book_id, config.bookId);
  assert.equal(started[0].json.print_format_id, 'standard');
  assert.equal(started[0].json.print_config_version, 2);
  let storedBootstrap: Record<string, unknown> | null = null;
  const persistOptions = {
    downloadOneManifest: async () => manifest,
    uploadIfAbsent: async (_key: string, value: Record<string, unknown>) => {
      if (storedBootstrap) return false;
      storedBootstrap = value;
      return true;
    },
  };
  await persistValidatedW2ABootstrapManifest(normalized[0].json, persistOptions);
  const firstBootstrap = storedBootstrap;
  await assert.rejects(() => persistValidatedW2ABootstrapManifest(normalized[0].json, persistOptions), W2ABootstrapExistsError);
  assert.equal(storedBootstrap, firstBootstrap, 'A duplicate bootstrap must not erase an existing run');
  const nameOnlyManifest = structuredClone(manifest);
  nameOnlyManifest.input.characterSpecs = { name: 'Alex', animalGuide: 'cat' };
  const nameOnlyBootstrap = await buildValidatedW2ABootstrapManifest(normalized[0].json, {
    downloadOneManifest: async () => nameOnlyManifest,
  });
  assert.equal(nameOnlyBootstrap.childName, 'Alex');
  await assert.rejects(() => buildValidatedW2ABootstrapManifest({
    ...normalized[0].json, childName: 'Taylor',
  }, { downloadOneManifest: async () => nameOnlyManifest }), /child name identity/);
  const legacyBootstrap = await buildValidatedW2ABootstrapManifest({
    orderId: 'SYNTHETIC-LEGACY-MVP',
    characterHash: 'legacy-hash',
    characterSpecs: { childName: 'Alex' },
    bookId: 'book-mvp-simple-adventure',
  });
  assert.equal(legacyBootstrap.bookId, 'book-mvp-simple-adventure');
  await assert.rejects(() => buildValidatedW2ABootstrapManifest({
    orderId: cronRow.orderId, characterHash: 'synthetic-hash',
    bookId: config.bookId,
  }), /requires frozen W0 manifest pointer/);
  const staleClaim = await runCode(w2aGraph, 'Normalize Router Payload', {
    $input: { first: () => ({ json: { body: { ...claimedRow, character_specs: { childName: 'Wrong child', animalGuide: 'cat' } } } }) },
  });
  await assert.rejects(() => buildValidatedW2ABootstrapManifest(staleClaim[0].json, {
    downloadOneManifest: async () => manifest,
  }), /character specs identity/, 'Same-order stale specs must not reach pose generation');
  await assert.rejects(() => buildValidatedW2ABootstrapManifest({ ...normalized[0].json, characterHash: 'wrong-hash' }, {
    downloadOneManifest: async () => manifest,
  }), /character hash identity/, 'Same-order stale hash must not reach pose generation');
  await assert.rejects(() => buildValidatedW2ABootstrapManifest({
    ...normalized[0].json, formatId: 'amazon',
  }, { downloadOneManifest: async () => manifest }), /format identity/);
  await assert.rejects(() => buildValidatedW2ABootstrapManifest({
    ...normalized[0].json, print_config_version: 99,
  }, { downloadOneManifest: async () => manifest }), /version identity/);
  const request = await runCode(w2aGraph, 'Prepare Resolve Pose Worklist Body', { $json: started[0].json });
  const resolverPayload = (JSON.parse(String(request[0].json.requestBody)) as { payload: Record<string, unknown> }).payload;
  assert.equal(resolverPayload.oneManifestUrl, pointer);
  assert.equal(resolverPayload.orderId, cronRow.orderId);
  assert.equal(resolverPayload.print_book_id, config.bookId);
  assert.equal(resolverPayload.print_format_id, 'standard');
  assert.equal(resolverPayload.print_config_version, 2);

  let downloads = 0;
  const resolved = await resolveW2APoseWorklistResponse(resolverPayload, {
    downloadOneManifest: async (key) => { downloads++; assert.equal(key, pointer); return manifest; },
    instrumentPoseWorkItems: async (payload) => payload.poseWorklist,
  });
  assert.equal(downloads, 1);
  assert.equal(resolved.bookId, config.bookId);
  assert.equal(resolved.formatId, 'standard');
  assert.equal((resolved.characterSpecs as { childName?: string }).childName, 'Alex');
  assert.equal(resolved.characterHash, 'synthetic-hash');
  assert.equal(resolved.pagePlanSource, 'w0-v3');
  assert.equal(resolved.expectedPageCount, 32);
  assert.deepEqual(resolved.pageLabels, manifest.book.resolved.pageLabels);
  assert.equal(resolved.poseWorklist[0]?.configVersion, 2);
  await assert.rejects(() => resolveW2APoseWorklistResponse({
    ...resolverPayload, characterSpecs: { childName: 'Wrong child', animalGuide: 'cat' },
  }, {
    downloadOneManifest: async () => manifest,
    instrumentPoseWorkItems: async (payload) => payload.poseWorklist,
  }), /character specs identity/, 'Direct W2A resolver must reject stale child data');
  await assert.rejects(() => resolveW2APoseWorklistResponse({ ...resolverPayload, formatId: 'amazon' }, {
    downloadOneManifest: async () => manifest,
    instrumentPoseWorkItems: async (payload) => payload.poseWorklist,
  }), /format identity/, 'The requested format must match frozen W0');
  await assert.rejects(() => resolveW2APoseWorklistResponse({ ...resolverPayload, print_config_version: 99 }, {
    downloadOneManifest: async () => manifest,
    instrumentPoseWorkItems: async (payload) => payload.poseWorklist,
  }), /version identity/, 'The stored version must match frozen W0');
  await assert.rejects(() => resolveW2APoseWorklistResponse({ ...resolverPayload, print_config_version: '2junk' }, {
    downloadOneManifest: async () => manifest,
    instrumentPoseWorkItems: async (payload) => payload.poseWorklist,
  }), /version identity is malformed/, 'Malformed stored version must not match frozen W0');
  const missingSnapshot = structuredClone(manifest);
  delete (missingSnapshot.book.resolved as { renderSnapshot?: unknown }).renderSnapshot;
  await assert.rejects(() => resolveW2APoseWorklistResponse(resolverPayload, {
    downloadOneManifest: async () => missingSnapshot,
    instrumentPoseWorkItems: async (payload) => payload.poseWorklist,
  }), /frozen render snapshot/, 'Configured Gelato W0 cannot use a page plan without its frozen snapshot');
  const luluConfig = loadBundledBookConfig({ bookId: 'book-finding-our-inner-voice', version: 1 });
  const luluManifest = buildW0RunManifestFromConfig(luluConfig, {
    orderId: 'SYNTHETIC-LULU-V1', platform: 'd2c', formatId: 'standard',
    characterHash: 'lulu-hash', input: { characterSpecs: { childName: 'Alex' }, bookSpecs: { testMode: true } },
  });
  delete (luluManifest.book.resolved as { renderSnapshot?: unknown }).renderSnapshot;
  await assert.rejects(() => resolveW2APoseWorklistResponse({
    orderId: 'SYNTHETIC-LULU-V1', oneManifestUrl: luluManifest.artifacts.manifestKey,
  }, {
    downloadOneManifest: async () => luluManifest,
    instrumentPoseWorkItems: async (payload) => payload.poseWorklist,
  }), /frozen render snapshot/, 'Configured Lulu W0 also requires its frozen snapshot');
  assert.ok(resolved.requiredPoseNumbers.length > 0);

  await assert.rejects(() => resolveW2APoseWorklistResponse(resolverPayload, {
    downloadOneManifest: async () => { throw new Error('Synthetic selected-key 404'); },
    loadBookConfig: async () => config,
    instrumentPoseWorkItems: async (payload) => payload.poseWorklist,
  }), /frozen W0 snapshot|manifest/i, 'A missing frozen manifest must not silently repin the order');

  const swappedManifest = buildW0RunManifestFromConfig(config, {
    orderId: 'SYNTHETIC-OTHER-ORDER', platform: 'd2c', formatId: 'standard', characterHash: 'other-hash',
    input: { characterSpecs: { childName: 'Taylor', animalGuide: 'dog' }, bookSpecs: { testMode: true } },
  });
  assert.throws(() => buildW2ABootstrapManifest({
    ...normalized[0].json,
    oneManifestUrl: swappedManifest.artifacts.manifestKey,
  }), /order identity|order prefix/i, 'W2A must reject another order before writing a bootstrap manifest');
  await assert.rejects(() => resolveW2APoseWorklistResponse({
    ...resolverPayload,
    oneManifestUrl: swappedManifest.artifacts.manifestKey,
    one_manifest_url: swappedManifest.artifacts.manifestKey,
    orderContext: { oneManifestUrl: swappedManifest.artifacts.manifestKey },
  }, {
    downloadOneManifest: async () => swappedManifest,
    instrumentPoseWorkItems: async (payload) => payload.poseWorklist,
  }), /order identity|manifest.*order/i, 'A frozen manifest from another order must be rejected');

  const otherBook = loadBundledBookConfig({ bookId: 'book-mvp-simple-adventure', version: 1 });
  const otherBookManifest = buildW0RunManifestFromConfig(otherBook, {
    orderId: cronRow.orderId, platform: 'd2c', formatId: otherBook.defaultFormatId,
    characterHash: 'synthetic-hash', input: { characterSpecs: { childName: 'Alex' }, bookSpecs: { testMode: true } },
  });
  assert.throws(() => buildW2ABootstrapManifest({
    ...normalized[0].json,
    oneManifestUrl: otherBookManifest.artifacts.manifestKey,
  }), /book identity|1-manifest pointer/, 'A same-order pointer to another book must fail before bootstrap write');
  await assert.rejects(() => resolveW2APoseWorklistResponse({
    ...resolverPayload,
    oneManifestUrl: otherBookManifest.artifacts.manifestKey,
    one_manifest_url: otherBookManifest.artifacts.manifestKey,
    orderContext: { oneManifestUrl: otherBookManifest.artifacts.manifestKey },
  }, {
    downloadOneManifest: async () => otherBookManifest,
    instrumentPoseWorkItems: async (payload) => payload.poseWorklist,
  }), /book identity/, 'Stored print book identity must reject a same-order wrong-book snapshot');
  await assert.rejects(() => resolveW2APoseWorklistResponse({
    orderId: cronRow.orderId,
    formatId: 'amazon',
    oneManifestUrl: otherBookManifest.artifacts.manifestKey,
  }, {
    downloadOneManifest: async () => ({
      schema: 'lhb.run-manifest@v2.0', orderId: cronRow.orderId,
      bookId: otherBook.bookId, formatId: 'standard',
    }),
    loadBookConfig: async () => otherBook,
    instrumentPoseWorkItems: async (payload) => payload.poseWorklist,
  }), /format identity/, 'A legacy W0 format must not override an explicit request format');

  const amazonManifest = buildW0RunManifestFromConfig(config, {
    orderId: 'SYNTHETIC-INNER-VOICE-AMAZON', platform: 'amazon', formatId: 'amazon', characterHash: 'amazon-hash',
    input: { characterSpecs: { childName: 'Alex', animalGuide: 'cat' }, bookSpecs: { testMode: true } },
  });
  const amazonRow = {
    ...cronRow, orderId: 'SYNTHETIC-INNER-VOICE-AMAZON', root_order_id: 'SYNTHETIC-INNER-VOICE-AMAZON',
    character_specs: null, character_hash: null, one_manifest_url: amazonManifest.artifacts.manifestKey,
    print_format_id: 'amazon',
  };
  const amazonPrep = await runCode(repoWorkflow, 'Prep 2A Orders', {
    $input: { first: () => ({ json: { workflow2A: [amazonRow] } }) },
    fetch: async () => ({ ok: true, json: async () => amazonManifest }),
  });
  assert.equal(amazonPrep[0].json.characterHash, 'amazon-hash');
  const amazonBootstrap = await buildValidatedW2ABootstrapManifest(amazonPrep[0].json, {
    downloadOneManifest: async () => amazonManifest,
  });
  const amazonWorklist = await resolveW2APoseWorklistResponse({
    ...amazonPrep[0].json, bookId: config.bookId, formatId: 'amazon',
  }, {
    downloadOneManifest: async () => amazonManifest,
    instrumentPoseWorkItems: async (payload) => payload.poseWorklist,
  });
  assert.equal(amazonBootstrap.characterHash, 'amazon-hash');
  assert.equal(amazonWorklist.formatId, 'amazon');
  assert.equal(amazonWorklist.expectedPageCount, 32);

  const legacyRow = {
    ...cronRow, orderId: 'SYNTHETIC-LEGACY-MVP', root_order_id: 'SYNTHETIC-LEGACY-MVP',
    print_book_id: otherBook.bookId, print_format_id: otherBook.defaultFormatId,
    print_config_version: 1, one_manifest_url: null,
    character_specs: { childName: 'Alex' }, character_hash: 'legacy-hash',
  };
  const legacyPrep = await runCode(repoWorkflow, 'Prep 2A Orders', {
    $input: { first: () => ({ json: { workflow2A: [legacyRow] } }) },
    fetch: () => { throw new Error('Legacy row with specs must not fetch W0'); },
  });
  assert.equal(legacyPrep.length, 1);
  assert.equal((await buildValidatedW2ABootstrapManifest({
    ...legacyPrep[0].json, bookId: otherBook.bookId,
  })).bookId, otherBook.bookId);

  console.log(`${deployedPath ? 'Selected external' : 'Repo'} W1 frozen character and config handoff to W2A passed`);
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
