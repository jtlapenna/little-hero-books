import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseAmazonCustomization } from '../src/lib/amazon-customization-parser';

const graph = JSON.parse(readFileSync('../docs/n8n-workflow-files/repo-centric/workflows/w1.1-Queue_Manager_and_Router.repo-centric.json', 'utf8'));
const rootId = 'SYNTHETIC-ROOT';
const rows = [1, 2].map(n => ({ id: 100+n, orderId: `${rootId}-item-${n}`, root_order_id: rootId, amazon_order_id: rootId, character_hash: `synthetic-hash-${n}`,
  one_manifest_url: `book-finding-our-inner-voice/orders/${rootId}-item-${n}/manifests/1-manifest.json`, print_book_id: 'book-finding-our-inner-voice', print_format_id: 'amazon', print_config_version: 4 }));
const run = (name: string, inputs: unknown[], prep?: unknown[]) => vm.runInNewContext(`(function(){${graph.nodes.find((n: {name:string}) => n.name === name).parameters.jsCode}\n})()`, {
  $input: { all: () => inputs, first: () => inputs[0] }, $items: () => prep, $runIndex: 0, console: { log(){}, warn(){}, error(){} },
}, { timeout: 1000 });
const prepared = run('Prep 2B Orders', [{ json: { workflow2B: rows } }]);
const claimed = rows.map(row => ({ json: { ...row, execution_status: 'processing', started_at: '2026-11-16T00:00:00Z', current_workflow: '2B' } }));
for (const items of [claimed, [...claimed].reverse(), [claimed[1]], [claimed[0]]]) {
  const out = run('Verify Order Claimed (2B)', items, prepared);
  assert.equal(out.length, items.length);
  for (let i=0;i<items.length;i++) { assert.equal(out[i].json.orderId, items[i].json.orderId); assert.equal(out[i].json.orderDbId, items[i].json.id); assert.equal(out[i].json.characterHash, items[i].json.character_hash); }
}
assert.equal(run('Verify Order Claimed (2B)', [{ json: { ...rows[1], orderId: rows[0].orderId } }], prepared).length, 0, 'contradictory physical/per-book identities must not dispatch');
assert.equal(run('Verify Order Claimed (2B)', [{ json: { amazon_order_id: rootId } }], prepared).length, 0, 'shared root alone must not choose a sibling');
assert.equal(run('Verify Order Claimed (2B)', [{ json: { id: 999, orderId: rows[1].orderId } }], prepared).length, 0, 'unknown physical claim must not borrow a per-book match');
for (const dedication of ['', 'For Alex & friends']) for (const first of [true, false]) {
  const values = [{ label: "Child's First Name", text: 'Alex' }, { label: "Child's Age", optionValue: '2' }];
  const note = { label: 'Dedication Message', text: dedication };
  const areas = first ? [note, ...values] : [...values, note];
  const parsed = parseAmazonCustomization({ 'version3.0': { customizationInfo: { surfaces: [{ areas }] } } });
  assert.equal(parsed?.age, '2'); assert.equal(parsed?.dedication, dedication);
}
for (const invalid of ['For Alex', '8', '-1', '2x', '']) assert.equal(parseAmazonCustomization({ 'version3.0': { customizationInfo: { surfaces: [{ areas: [{ label: "Child's First Name", text: 'Alex' }, { label: 'Age', optionValue: invalid }] }] } } }), null);
const nested = parseAmazonCustomization({ customizationData: { children: [{ children: [{ children: [{ children: [{ label: "Child's First Name", inputValue: 'Alex' }, { label: 'Dedication Message', inputValue: 'For Alex' }] }, { label: "Child's Age", displayValue: '2' }] }] }] } });
assert.equal(nested?.age, '2'); assert.equal(nested?.dedication, 'For Alex');
console.log('W1 exact claimed-sibling association and documented Amazon dedication/age producer checks passed; no external calls.');
