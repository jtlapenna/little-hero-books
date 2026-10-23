import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { buildD2CW0Payload } from '../src/lib/w0-payload';
import { parseW0ManifestRequest } from '../src/lib/w0-manifest-request';
import { buildOrderIntakeManifestFromNormalizedInputRuntime, buildOrderIntakeManifestFromOrderRuntime, buildW0OrderUpsertPayload } from '../src/lib/w0-manifest-builder';
import { buildBookConfigPublishPayload } from '../src/lib/books/runtime-book-config';
import { loadBundledBookConfig } from '../src/lib/books/load-book-config';

type JsonRecord = Record<string, unknown>;
const graph = JSON.parse(readFileSync(path.resolve('../docs/n8n-workflow-files/repo-centric/workflows/w0-Order_Intake_Validation.repo-centric.json'), 'utf8')) as { nodes: Array<{ name: string; parameters?: { jsCode?: string } }> };
function runCode(name: string, context: JsonRecord): JsonRecord {
  const source = graph.nodes.find(node => node.name === name)?.parameters?.jsCode;
  assert.equal(typeof source, 'string', `Missing actual W0 node: ${name}`);
  return vm.runInNewContext(`(() => { ${source}\n })()`, context, { timeout: 1000 })[0].json;
}
async function main() {
  Object.assign(process.env, { SUPABASE_URL: 'https://w0-character-config.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-config-only' });
  const originalFetch = globalThis.fetch;
  const config = loadBundledBookConfig({ bookId: 'book-finding-our-inner-voice', version: 2 });
  const published = buildBookConfigPublishPayload(config, { activate: true });
  let configReads = 0;
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init), url = new URL(request.url);
    assert.equal(url.origin, 'https://w0-character-config.example.test', 'Every other host is forbidden');
    assert.equal(request.method, 'GET', 'Hash handoff must not write');
    assert.equal(url.pathname, '/rest/v1/book_configs');
    assert.equal(url.searchParams.get('book_id'), `eq.${config.bookId}`);
    assert.equal(url.searchParams.get('version'), 'eq.2');
    configReads++;
    return Response.json([published]);
  };
  const specs = { childName: 'Alex', animalGuide: 'cat', skinTone: 'medium', hairStyle: 'short', hairColor: 'brown', clothingStyle: 'tee-shorts' };
  const cases: Array<{ name: string; raw?: JsonRecord; normalized?: JsonRecord; expected?: string }> = [
    { name: 'canonical-producer', raw: { characterHash: 'producer-hash', character_hash: 'producer-hash' }, expected: 'producer-hash' },
    { name: 'normalized-camel', normalized: { characterHash: 'camel-hash' }, expected: 'camel-hash' },
    { name: 'normalized-snake', normalized: { character_hash: 'snake-hash' }, expected: 'snake-hash' },
    { name: 'raw-camel', raw: { characterHash: 'raw-camel-hash' }, expected: 'raw-camel-hash' },
    { name: 'raw-snake', raw: { character_hash: 'raw-snake-hash' }, expected: 'raw-snake-hash' },
    { name: 'conflicting-precedence', raw: { characterHash: 'raw-camel-hash', character_hash: 'raw-snake-hash' }, normalized: { characterHash: 'first-hash', character_hash: 'second-hash' }, expected: 'first-hash' },
    { name: 'raw-conflicting-precedence', raw: { characterHash: 'first-raw-hash', character_hash: 'second-raw-hash' }, expected: 'first-raw-hash' },
    { name: 'blank-explicit', raw: { characterHash: ' ', character_hash: '' }, normalized: { characterHash: '', character_hash: '  ' } },
    { name: 'missing-hash' },
  ];
  let checks = 0;
  try {
    for (const formatId of ['standard', 'amazon']) {
      let fallbackHash: string | null = null;
      for (const scenario of cases) {
        const orderId = `SYNTHETIC-W0-HASH-${formatId}-${scenario.name}`;
        const raw = buildD2CW0Payload({ orderId, character_specs: specs, product_info: { bookId: config.bookId, formatId, configVersion: 2, totalPages: 32 } });
        delete raw.characterHash; delete raw.character_hash; Object.assign(raw, scenario.raw);
        raw.bookSpecs = { ...raw.bookSpecs as JsonRecord, testMode: true }; raw.book_specs = raw.bookSpecs;
        const normalized = runCode('Normalize Payload', { $input: { first: () => ({ json: raw }) }, $item: () => ({ $node: { 'CONFIG (PRODUCTION)': { json: {} } } }) });
        // Exercise supported alias placements after the actual producer normalizer.
        Object.assign(normalized, scenario.normalized);
        const prepared = runCode('Prepare Build 1 Manifest Body', { $json: normalized });
        const parsed = parseW0ManifestRequest(JSON.parse(String(prepared.requestBody)));
        const built = await buildOrderIntakeManifestFromNormalizedInputRuntime(parsed.input, parsed.options);
        const prefix = (built.manifest as { artifacts: { characterPrefix?: string } }).artifacts.characterPrefix;
        const upsert = buildW0OrderUpsertPayload({ normalizedInput: parsed.input, manifest: built.manifest, manifestKey: built.manifestKey });
        assert.equal(typeof prefix, 'string', `${formatId}/${scenario.name}: actual normalized producer must freeze the character hash`);
        const frozenHash = prefix?.split('/').filter(Boolean).at(-1);
        assert.equal(frozenHash, upsert.character_hash, `${formatId}/${scenario.name}: persisted and frozen hash must match before W1`);
        if (scenario.expected) assert.equal(frozenHash, scenario.expected, 'Existing alias precedence must remain');
        else { assert.match(String(frozenHash), /^[a-f0-9]{16}$/, 'Blank and missing values use the existing visual hash'); if (fallbackHash) assert.equal(frozenHash, fallbackHash); fallbackHash = String(frozenHash); }
        checks++;
      }
      const row = { orderId: `SYNTHETIC-DIRECT-W0-HASH-${formatId}`, character_specs: specs, book_specs: { testMode: true }, product_info: { bookId: config.bookId, formatId } };
      const direct = await buildOrderIntakeManifestFromOrderRuntime(row, row.orderId, { schemaVersion: 'v3', bookId: config.bookId, formatId, configVersion: 2, configSource: 'published' });
      const prefix = (direct.manifest as { artifacts: { characterPrefix?: string } }).artifacts.characterPrefix;
      assert.equal(prefix?.split('/').at(-1), fallbackHash, 'Direct rows use the same visual fallback');
      assert.equal(buildW0OrderUpsertPayload({ normalizedInput: { characterSpecs: specs }, manifest: direct.manifest, manifestKey: direct.manifestKey }).character_hash, fallbackHash);
      checks++;
    }
    assert.equal(checks, 20); assert.equal(configReads, checks);
    console.log(`Actual W0 producer -> published-config manifest -> persisted hash: ${checks} standard/Amazon checks passed; read-only synthetic transport`);
  } finally { globalThis.fetch = originalFetch; }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
