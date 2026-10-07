/* Apply four reviewed parameter fields while retaining live bindings and topology. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const dotenv = require('../back-end/node_modules/dotenv');
const root = path.resolve(__dirname, '..');
const arg = name => process.argv[process.argv.indexOf(name) + 1];
if (!process.argv.includes('--env-file') || !process.argv.includes('--backup-dir')) throw new Error('Pass --env-file and --backup-dir. Add --apply only after release review.');
const env = { ...dotenv.parse(fs.readFileSync(arg('--env-file'))), ...process.env };
const base = (env.N8N_API_URL || env.N8N_BASE_URL || 'https://thepeakbeyond.app.n8n.cloud').replace(/\/$/, '');
if (!env.N8N_API_KEY) throw new Error('Missing configured n8n API access');
const directory = path.resolve(arg('--backup-dir'));
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
fs.chmodSync(directory, 0o700);
const targets = [
  { id: 'HduzTWm0ekmrvwrn', file: 'w2A-Orchestrator.repo-centric.json', fields: [['Expand to N Poses', 'jsCode']] },
  { id: '4fxha79xAEaYEBYb', file: 'w2B-sw1-single-pose.repo-centric.json', fields: [['Normalize Pose Scale', 'jsonBody']] },
  { id: 'D4rQ0zJG8JlKhZqq', file: 'w3-Book-Assembly.repo-centric.json', fields: [['QA Gate (3A Phase 4)', 'jsCode'], ['Acceptance Tests (3A Phase 5)', 'jsCode']] },
];
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function api(id, suffix = '', method = 'GET', body) {
  const response = await fetch(`${base}/api/v1/workflows/${id}${suffix}`, { method, headers: { 'X-N8N-API-KEY': env.N8N_API_KEY, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new Error(`n8n ${method} workflow ${id}: HTTP ${response.status}`);
  return response.json();
}
function writable(workflow) {
  return { name: workflow.name, nodes: workflow.nodes, connections: workflow.connections, settings: workflow.settings, ...(workflow.staticData !== undefined ? { staticData: workflow.staticData } : {}) };
}
function savePrivate(file, value) { if (fs.existsSync(path.join(directory, file))) { assert.equal(fs.readFileSync(path.join(directory, file), 'utf8'), JSON.stringify(value), 'Protected backup content differs'); return; } fs.writeFileSync(path.join(directory, file), JSON.stringify(value), { mode: 0o600 }); fs.chmodSync(path.join(directory, file), 0o600); }
function owns(current, expected, owner) {
  return current.versionId === owner.versionId && current.active === owner.active && current.activeVersionId === owner.activeVersionId && hash(writable(current)) === hash(writable(expected));
}
function state(workflow) { return { versionId: workflow.versionId, active: workflow.active, activeVersionId: workflow.activeVersionId }; }
async function publish(id, expected, owner) {
  const current = await api(id);
  assert.ok(owns(current, expected, owner), 'Live workflow changed before publication');
  assert.equal(current.active, true, 'Live workflow deactivated before publication');
  if (current.activeVersionId !== current.versionId) {
    const activated = await api(id, '/activate', 'POST', { versionId: current.versionId });
    Object.assign(owner, state(activated));
  }
  const published = await api(id);
  assert.ok(owns(published, expected, owner), 'Live workflow changed during publication');
  assert.equal(published.active, true);
  assert.equal(published.activeVersionId, published.versionId);
  return published;
}
async function main() {
  const prepared = [];
  for (const target of targets) {
    const live = await api(target.id);
    if (!live.active || live.activeVersionId !== live.versionId) throw new Error(`Workflow ${target.id} has unpublished changes; inspect before applying`);
    const repo = JSON.parse(fs.readFileSync(path.join(root, 'docs/n8n-workflow-files/repo-centric/workflows', target.file)));
    const desired = structuredClone(live);
    const fields = [];
    for (const [name, field] of target.fields) {
      const node = desired.nodes.find(n => n.name === name), reference = repo.nodes.find(n => n.name === name);
      if (!node || !reference) throw new Error(`Missing reviewed node ${name}`);
      const value = reference.parameters[field];
      if (typeof value !== 'string' || /REDACTED_/.test(value)) throw new Error(`Reviewed field ${name}/${field} includes unsupported credential placeholders`);
      fields.push({ node: name, field, beforeSha256: hash(node.parameters[field]), afterSha256: hash(value), changed: node.parameters[field] !== value });
      node.parameters[field] = value;
    }
    savePrivate(`${target.id}.before.${live.versionId}.json`, live);
    savePrivate(`${target.id}.desired.${hash(writable(desired))}.json`, desired);
    prepared.push({ target, live, desired, fields });
  }
  const audit = prepared.map(p => ({ id: p.target.id, beforeVersionId: p.live.versionId, beforeActiveVersionId: p.live.activeVersionId, fields: p.fields }));
  console.log(JSON.stringify({ mode: process.argv.includes('--apply') ? 'apply' : 'plan', workflows: audit }));
  if (!process.argv.includes('--apply')) return;
  const attempted = [];
  try {
    for (const p of prepared) {
      if (!p.fields.some(f => f.changed)) continue;
      const fresh = await api(p.target.id);
      assert.ok(owns(fresh, p.live, state(p.live)), 'Live workflow or activation changed after preparation');
      assert.equal(hash(writable(fresh)), hash(writable(p.live)), 'Live content changed after preparation');
      attempted.push(p);
      const updated = await api(p.target.id, '?publishIfActive=false', 'PUT', writable(p.desired));
      p.owner = state(updated);
      const published = await publish(p.target.id, p.desired, p.owner);
      const row = audit.find(a => a.id === p.target.id);
      row.afterVersionId = published.versionId;
      row.afterActiveVersionId = published.activeVersionId;
      row.credentialsAndTopologyPreserved = true;
      savePrivate(`${p.target.id}.after.${published.versionId}.json`, published);
    }
    const file = path.join(directory, 'sanitized-audit.json');
    fs.writeFileSync(file, JSON.stringify({ appliedAt: new Date().toISOString(), workflows: audit }, null, 2) + '\n', { mode: 0o600 });
    console.log('Selected fields published and live content verified. Sanitized audit: ' + file);
  } catch (error) {
    let recovered = true;
    for (const p of attempted.reverse()) {
      try {
        const current = await api(p.target.id);
        if (owns(current, p.live, state(p.live))) continue;
        if (!p.owner || !owns(current, p.desired, p.owner)) throw new Error('Concurrent live state differs; manual recovery required');
        const restored = await api(p.target.id, '?publishIfActive=false', 'PUT', writable(p.live));
        await publish(p.target.id, p.live, state(restored));
      }
      catch { recovered = false; console.error(`Recovery verification failed for ${p.target.id}`); }
    }
    console.error(recovered ? 'Attempted updates recovered and verified.' : 'Recovery needs inspection. Do not run dependent tests.');
    throw error;
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
