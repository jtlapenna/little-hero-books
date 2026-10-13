import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

type Parameters = { path?: string; jsCode?: string; url?: string; jsonBody?: string; authentication?: string; genericAuthType?: string; method?: string; options?: { redirect?: { redirect?: { followRedirects?: boolean } }; response?: { response?: { responseFormat?: string; neverError?: boolean } } } };
type Node = { name: string; type: string; parameters: Parameters; credentials?: Record<string, { id: string; name: string }>; retryOnFail?: boolean; continueOnFail?: boolean; onError?: string };
type Workflow = { name: string; active: boolean; nodes: Node[]; connections: Record<string, { main?: Array<Array<{ node: string }>> }> };
const root = path.resolve(process.cwd(), '..');
const claim = { submissionId: '11111111-1111-4111-8111-111111111111', claimToken: '22222222-2222-4222-8222-222222222222' };
const cases = [
  { file: 'w4-GELATO-Print_Fulfillment.repo-centric.json', name: 'W4 Gelato Print Fulfillment', mode: 'single', webhook: 'w4-gelato-print-repo', assembly: 'build-gelato-print-pdf' },
  { file: 'w4.1-GELATO-Sibling-Aggregation.repo-centric.json', name: 'W4.1 Gelato Sibling Aggregation', mode: 'siblings', webhook: 'w4-1-sibling-aggregation-gelato-repo', assembly: 'build-gelato-sibling-print-pdf' },
];
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
type RequestTrace = Array<{ url: string; body: unknown }>;
for (const c of cases) {
  const w = JSON.parse(readFileSync(path.join(root, 'docs/n8n-workflow-files/repo-centric/workflows', c.file), 'utf8')) as Workflow;
  assert.equal(w.name, c.name); assert.equal(w.active, false);
  assert.equal(w.nodes.find(n => n.type === 'n8n-nodes-base.webhook')?.parameters.path, c.webhook);
  const http = w.nodes.filter(n => n.type === 'n8n-nodes-base.httpRequest');
  assert.equal(http.length, 3, 'native HTTP nodes bind backend credentials outside exports');
  for (const n of http) {
    assert.equal(n.parameters.authentication, 'genericCredentialType'); assert.equal(n.parameters.genericAuthType, 'httpHeaderAuth');
    assert.equal(n.credentials?.httpHeaderAuth.id, '__LHL_BACKEND_HEADER_AUTH_CREDENTIAL_ID__');
    assert.equal(n.retryOnFail, false); assert.equal(n.continueOnFail, false); assert.equal(n.onError, 'stopWorkflow');
    assert.equal(n.parameters.options?.redirect?.redirect?.followRedirects, false);
    assert.equal(n.parameters.options?.response?.response?.responseFormat, 'json');
    assert.equal(n.parameters.options?.response?.response?.neverError, false);
    assert.equal(n.parameters.method, 'POST');
    assert.ok(!JSON.stringify(n).includes('BACKEND_API_TOKEN'));
  }
  const identity = { ...claim, executionId: 'TEST-N8N-EXECUTION', mode: c.mode };
  const payload = { ...claim, orderId: 'TEST-GELATO-NATIVE', executionId: 'untrusted', mode: 'untrusted', backendBase: 'https://unsafe.example' };
  function execute(input: unknown, failing?: { endpoint: string; transport?: boolean }, requests: RequestTrace = []) {
    const outputs = new Map<string, unknown>();
    let current = 'Prepare Gelato Request'; let data: unknown = input;
    const context = () => ({ $input: { first: () => ({ json: data }) }, $execution: { id: identity.executionId }, $: (name: string) => ({ first: () => ({ json: outputs.get(name) }) }) });
    const expression = (value: string | undefined): string => { assert.ok(typeof value === 'string'); return vm.runInNewContext(value.slice(3, -2).trim(), context()); };
    for (let step = 0; step < 12 && current; step++) {
      const n = w.nodes.find(n => n.name === current); assert.ok(n, current);
      if (n.type === 'n8n-nodes-base.code') data = (plain(vm.runInNewContext('(function(){' + n.parameters.jsCode + '})()', context())) as Array<{ json: unknown }>)[0].json;
      else {
        assert.equal(n.type, 'n8n-nodes-base.httpRequest');
        const url = expression(n.parameters.url); const body = JSON.parse(expression(n.parameters.jsonBody));
        assert.equal(new URL(url).origin, 'https://admin.littleherolabs.com');
        requests.push({ url, body });
        if (failing?.endpoint && url.endsWith(failing.endpoint)) {
          if (failing.transport) throw new Error('Synthetic HTTP 409');
          data = { success: false };
        } else data = { success: true, submissionId: 'untrusted-result', claimToken: 'untrusted-result', mode: 'untrusted-result' };
      }
      outputs.set(current, data);
      current = w.connections[current]?.main?.[0]?.[0]?.node ?? '';
    }
    return { requests, result: data };
  }
  const result = execute({ body: payload });
  assert.deepEqual(result.requests.map(r => new URL(r.url).pathname), ['/api/internal/w4/' + c.assembly, '/api/internal/w4/quote-gelato-submission', '/api/internal/w4/submit-gelato-draft']);
  assert.deepEqual(result.requests[0].body, payload);
  for (const r of result.requests.slice(1)) assert.deepEqual(r.body, identity, 'HTTP responses cannot replace the prepared claim or execution identity');
  assert.deepEqual(Object.fromEntries(Object.keys(identity).map(k => [k, (result.result as Record<string, unknown>)[k]])), identity);
  for (const input of [{}, { body: [] }, { body: { ...payload, claimToken: 'bad' } }, { body: { ...payload, submissionId: null } }]) assert.throws(() => execute(input));
  for (const endpoint of [c.assembly, 'quote-gelato-submission', 'submit-gelato-draft']) {
    const trace: RequestTrace = [];
    assert.throws(() => execute({ body: payload }, { endpoint }, trace), /Gelato .* was not confirmed/);
    const expected = [c.assembly, 'quote-gelato-submission', 'submit-gelato-draft'].indexOf(endpoint) + 1;
    assert.equal(trace.length, expected, 'failed transition must stop all later HTTP calls');
    trace.length = 0;
    assert.throws(() => execute({ body: payload }, { endpoint, transport: true }, trace), /Synthetic HTTP 409/);
    assert.equal(trace.length, expected, 'HTTP failure must stop all later calls');
  }
  const serialized = JSON.stringify(w);
  assert.ok(!serialized.includes('$env.')); assert.ok(!serialized.includes('X-API-KEY')); assert.ok(!serialized.includes('/claim/fence'));
  assert.ok(!/lulu|pdfmonkey/i.test(serialized));
}
console.log('Gelato native workflow credential and producer-to-request checks passed');
