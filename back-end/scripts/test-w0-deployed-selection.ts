import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { buildD2CW0Payload } from '../src/lib/w0-payload';
import { parseW0ManifestRequest } from '../src/lib/w0-manifest-request';

type WorkflowNode = { name: string; parameters?: { jsCode?: string } };
type Workflow = { nodes: WorkflowNode[] };

function runCode(workflow: Workflow, nodeName: string, context: Record<string, unknown>): Record<string, unknown> {
  const node = workflow.nodes.find((entry) => entry.name === nodeName);
  const code = node?.parameters?.jsCode;
  if (typeof code !== 'string') throw new Error(`Missing ${nodeName}`);
  const result = vm.runInNewContext(`(() => { ${code}\n })()`, context, { timeout: 1000 }) as Array<{ json: Record<string, unknown> }>;
  assert.equal(result.length, 1);
  return result[0].json;
}

function buildRequest(workflow: Workflow, raw: Record<string, unknown>): Record<string, unknown> {
  const normalized = runCode(workflow, 'Normalize Payload', {
    $input: { first: () => ({ json: raw }) },
    $item: () => ({ $node: { 'CONFIG (PRODUCTION)': { json: {} } } }),
  });
  const prepared = runCode(workflow, 'Prepare Build 1 Manifest Body', { $json: normalized });
  return JSON.parse(String(prepared.requestBody)) as Record<string, unknown>;
}

function loadWorkflow(file: string): Workflow {
  return JSON.parse(readFileSync(file, 'utf8')) as Workflow;
}

const repoWorkflow = loadWorkflow(path.resolve('../docs/n8n-workflow-files/repo-centric/workflows/w0-Order_Intake_Validation.repo-centric.json'));
const raw = buildD2CW0Payload({
  orderId: 'SYNTHETIC-INNER-VOICE',
  character_specs: { childName: 'Alex', animalGuide: 'cat' },
  product_info: {
    bookId: 'book-finding-our-inner-voice',
    formatId: 'standard',
    configVersion: 2,
    totalPages: 32,
  },
});

const repoRequest = buildRequest(repoWorkflow, raw);
const repoResult = parseW0ManifestRequest(repoRequest, { allowLegacyMvpIntake: true });
assert.equal(repoResult.options.bookId, 'book-finding-our-inner-voice');
assert.equal(repoResult.options.formatId, 'standard');
assert.equal(repoResult.options.configVersion, 2);
const downgraded = {
  payload: { _raw: raw }, schemaVersion: 'v3',
  bookId: 'book-mvp-simple-adventure', configSource: 'published-first',
};
assert.throws(() => parseW0ManifestRequest(downgraded, { allowLegacyMvpIntake: true }), /Conflicting W0 selection: bookId/);
assert.throws(() => parseW0ManifestRequest({ ...downgraded, payload: { _raw: { body: raw } } },
  { allowLegacyMvpIntake: true }), /Conflicting W0 selection: bookId/);
const legacy = parseW0ManifestRequest({
  payload: { _raw: { orderId: 'SYNTHETIC-LEGACY' } },
  schemaVersion: 'v3', bookId: 'book-mvp-simple-adventure', configSource: 'published-first',
}, { allowLegacyMvpIntake: true });
assert.equal(legacy.options.configVersion, 1);

const deployedPath = process.argv[2];
if (deployedPath) {
  const graph = loadWorkflow(deployedPath);
  const deployedRequest = buildRequest(graph, raw);
  if (process.argv.includes('--candidate')) {
    const result = parseW0ManifestRequest(deployedRequest, { allowLegacyMvpIntake: true });
    assert.equal(result.options.bookId, 'book-finding-our-inner-voice');
    assert.equal(result.options.formatId, 'standard');
    assert.equal(result.options.configVersion, 2);
    const unwrapped = runCode(graph, 'CONFIG (PRODUCTION)', {
      $input: { first: () => ({ json: { body: raw } }) },
    });
    assert.equal(unwrapped.orderId, raw.orderId);
    assert.equal(unwrapped.supabase, undefined);
    assert.equal(unwrapped.r2, undefined);
    assert.equal(unwrapped.s3, undefined);
    console.log('Prepared W0 graph preserves synthetic Inner Voice selection without embedding service secrets');
  } else {
    assert.throws(
      () => parseW0ManifestRequest(deployedRequest, { allowLegacyMvpIntake: true }),
      /Conflicting W0 selection: bookId/,
      'A deployed W0 graph that discards the Inner Voice selection must be rejected',
    );
    console.log('Downloaded W0 graph rejects synthetic selection downgrade');
  }
} else {
  console.log('Downloaded W0 graph check skipped; pass its export path to run it');
}

console.log('Repo W0 producer-to-parser selection guard passed');
