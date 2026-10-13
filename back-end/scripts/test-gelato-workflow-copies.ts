import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

type Workflow = {
  name: string;
  active: boolean;
  nodes: Array<{ name: string; type: string; parameters?: Record<string, unknown> }>;
  connections: Record<string, { main?: Array<Array<{ node: string }>> }>;
};

const root = path.resolve(process.cwd(), '..');
const cases = [
  {
    file: 'w4-GELATO-Print_Fulfillment.repo-centric.json',
    name: 'W4 Gelato Print Fulfillment',
    webhookPath: 'w4-gelato-print-repo',
    endpoint: '/api/internal/w4/build-gelato-print-pdf',
  },
  {
    file: 'w4.1-GELATO-Sibling-Aggregation.repo-centric.json',
    name: 'W4.1 Gelato Sibling Aggregation',
    webhookPath: 'w4-1-sibling-aggregation-gelato-repo',
    endpoint: '/api/internal/w4/build-gelato-sibling-print-pdf',
  },
];

for (const testCase of cases) {
  const workflow = JSON.parse(readFileSync(
    path.join(root, 'docs/n8n-workflow-files/repo-centric/workflows', testCase.file),
    'utf8',
  )) as Workflow;
  assert.equal(workflow.name, testCase.name);
  assert.equal(workflow.active, false, 'Gelato copies stay inactive until separately reviewed and imported');
  assert.equal(workflow.nodes.length, 5, 'copy includes isolated assembly, quote and held draft path');

  const webhook = workflow.nodes.find((node) => node.name === 'Webhook (Gelato Intake)');
  assert.equal(webhook?.parameters?.path, testCase.webhookPath);
  const assembly = workflow.nodes.find((node) => node.name === 'Assemble Gelato Print PDF');
  const code = String(assembly?.parameters?.jsCode ?? '');
  assert.ok(code.includes(testCase.endpoint));
  assert.ok(code.includes('submissionId') && code.includes('claimToken'));
  assert.ok(code.includes('BACKEND_API_TOKEN'));
  assert.ok(!code.includes('/claim/fence'), 'duplicate assembly must not fence active sender');
  assert.ok(!/lulu|pdfmonkey|submit.*order/i.test(code));

  for (const [label, endpoint] of [['Quote Gelato Submission', 'quote-gelato-submission'], ['Create Held Gelato Draft', 'submit-gelato-draft']]) {
    const transition = String(workflow.nodes.find((node) => node.name === label)?.parameters?.jsCode);
    assert.ok(transition.includes('/api/internal/w4/' + endpoint));
    assert.ok(transition.includes('executionId') && !transition.includes('X-API-KEY'));
    assert.ok(!transition.includes('/claim/fence'), 'losing worker must not fence a competing sender');
  }

  const connected = Object.values(workflow.connections).flatMap((connection) =>
    (connection.main ?? []).flatMap((output) => output.map((item) => item.node)));
  assert.deepEqual(new Set(connected), new Set(['Respond to Webhook (Ack)', 'Assemble Gelato Print PDF', 'Quote Gelato Submission', 'Create Held Gelato Draft']));
}

console.log('Gelato workflow copy isolation checks passed');
