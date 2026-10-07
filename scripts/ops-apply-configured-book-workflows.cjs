/* Apply reviewed parameter fields while retaining live bindings and topology. */
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
  { id: 'oKsq2x0gARt43k5U', file: 'w2A-SW3-Upload.repo-centric.json', fields: [['Keep Auto Flip Status', 'jsCode'], ['Return Upload Results', 'jsCode']] },
  { id: 'S5apnAgeuitSIO5Z', file: 'w2A-SW0-Base_Character_Generation.repo-centric.json', fields: [['Schema Check + Defaults', 'jsCode'], ['Restore Finalized Base Envelope', 'jsCode']] },
  { id: 'kGob5aDJ6e5WRPh7', file: 'w2A-SW1-Pose_Generation.repo-centric.json', fields: [['Schema Check + Defaults1', 'jsCode'], ['Extract Generated Image', 'jsCode']] },
  { id: 'KhMxEgo57Deo1QWu', file: 'w2B-main-orchestrator.repo-centric.json', fields: [['Build Worklist', 'jsCode'], ['Merge Result Into 2B Manifest', 'jsCode'], ['Final Summary', 'jsCode'], ['Split In Batches', 'batchSize']] },
  { id: 'HduzTWm0ekmrvwrn', file: 'w2A-Orchestrator.repo-centric.json', fields: [['Expand to N Poses', 'jsCode'], ['Resolve Pose Worklist', 'acceptEncoding'], ['Resolve Pose Worklist', 'jsonRequestBody']] },
  { id: '4fxha79xAEaYEBYb', file: 'w2B-sw1-single-pose.repo-centric.json', fields: [['Normalize Pose Scale', 'jsonBody'], ['Build Bria Payload', 'jsCode'], ['Bria Poll', 'retryPolicy']] },
  { id: 'D4rQ0zJG8JlKhZqq', file: 'w3-Book-Assembly.repo-centric.json', fields: [['QA Gate (3A Phase 4)', 'jsCode'], ['Acceptance Tests (3A Phase 5)', 'jsCode']] },
];
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function api(id, suffix = '', method = 'GET', body) {
  const response = await fetch(`${base}/api/v1/workflows/${id}${suffix}`, { method, headers: { 'X-N8N-API-KEY': env.N8N_API_KEY, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) {
    const rawProblem = await response.text();
    savePrivate(`http-error-${crypto.randomUUID()}.json`, { status: response.status, contentType: response.headers.get('content-type'), body: rawProblem });
    let problem = {};
    try { problem = JSON.parse(rawProblem); } catch {}
    const validationPath = typeof problem.message === 'string' ? problem.message.match(/request(?:\/[a-zA-Z0-9_-]+)* must (?:NOT have additional properties|be (?:object|array|string|number|integer|boolean|null)\b)/)?.[0] : null;
    throw new Error(`n8n ${method} workflow ${id}: HTTP ${response.status}${validationPath ? ' (' + validationPath + ')' : ''}`);
  }
  return response.json();
}
function writable(workflow) {
  return { name: workflow.name, nodes: workflow.nodes, connections: workflow.connections, settings: workflow.settings, ...(workflow.staticData !== undefined ? { staticData: workflow.staticData } : {}) };
}
function fieldValue(node, field) {
  if (field === 'retryPolicy') {
    if (node.name !== 'Bria Poll' || node.id !== '46502794-5c68-42ea-9d81-4383bf173216' || node.type !== 'n8n-nodes-base.httpRequest' || (node.parameters.method ?? 'GET') !== 'GET' || node.parameters.options?.response?.response?.neverError === true) throw new Error('Reviewed retry requires Bria Poll GET with persistent-error failure');
    return Object.fromEntries(['retryOnFail', 'maxTries', 'waitBetweenTries'].filter(key => Object.hasOwn(node, key)).map(key => [key, node[key]]));
  }
  if (field === 'jsonRequestBody') {
    const p = node.parameters;
    if (p.method !== 'POST' || p.sendBody !== true || p.options?.response?.response?.responseFormat !== 'json') throw new Error('Reviewed JSON request requires existing POST and JSON response');
    const expression = p.contentType === 'raw' ? p.body : p.contentType === 'json' && p.specifyBody === 'json' ? p.jsonBody : null;
    if (expression !== '={{$json.requestBody}}') throw new Error('Live request body differs from reviewed expression');
    return { contentType: p.contentType, specifyBody: p.specifyBody, jsonBody: p.jsonBody, body: p.body, rawContentType: p.rawContentType };
  }
  if (field !== 'acceptEncoding') return node.parameters[field];
  const headers = node.parameters.headerParameters?.parameters;
  if (node.parameters.sendHeaders !== true || !Array.isArray(headers)) throw new Error('Reviewed HTTP node requires existing explicit headers');
  return headers.filter(h => typeof h.name === 'string' && h.name.toLowerCase() === 'accept-encoding').map(h => h.value);
}
function setField(node, field, value) {
  if (field === 'retryPolicy') { fieldValue(node, field); Object.assign(node, value); return; }
  if (field === 'jsonRequestBody') {
    fieldValue(node, field);
    Object.assign(node.parameters, value);
    delete node.parameters.body; delete node.parameters.rawContentType;
    return;
  }
  if (field !== 'acceptEncoding') { node.parameters[field] = value; return; }
  fieldValue(node, field);
  node.parameters.headerParameters.parameters = node.parameters.headerParameters.parameters.filter(h => typeof h.name !== 'string' || h.name.toLowerCase() !== 'accept-encoding');
  node.parameters.headerParameters.parameters.push({ name: 'Accept-Encoding', value });
}
function savePrivate(file, value) { if (fs.existsSync(path.join(directory, file))) { if (fs.readFileSync(path.join(directory, file), 'utf8') !== JSON.stringify(value)) throw new Error('Protected backup content differs'); return; } fs.writeFileSync(path.join(directory, file), JSON.stringify(value), { mode: 0o600 }); fs.chmodSync(path.join(directory, file), 0o600); }
function owns(current, expected, owner) {
  return current.versionId === owner.versionId && current.active === owner.active && current.activeVersionId === owner.activeVersionId && hash(writable(current)) === hash(writable(expected));
}
function state(workflow) { return { versionId: workflow.versionId, active: workflow.active, activeVersionId: workflow.activeVersionId }; }
async function publish(id, expected, owner, originalActive) {
  const current = await api(id);
  assert.ok(owns(current, expected, owner), 'Live workflow changed before publication');
  assert.equal(current.active, originalActive, 'Live workflow activation changed before publication');
  if (!originalActive) return current;
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
    if (live.active && live.activeVersionId !== live.versionId) throw new Error(`Workflow ${target.id} has unpublished changes; inspect before applying`);
    const repo = JSON.parse(fs.readFileSync(path.join(root, 'docs/n8n-workflow-files/repo-centric/workflows', target.file)));
    const desired = structuredClone(live);
    const fields = [];
    for (const [name, field] of target.fields) {
      const node = desired.nodes.find(n => n.name === name), reference = repo.nodes.find(n => n.name === name);
      if (!node || !reference) throw new Error(`Missing reviewed node ${name}`);
      const referenceValue = fieldValue(reference, field);
      const value = field === 'acceptEncoding' ? (assert.deepEqual(referenceValue, ['identity']), 'identity') : referenceValue;
      const before = fieldValue(node, field);
      const after = field === 'acceptEncoding' ? [value] : value;
      if (field === 'retryPolicy') {
        if (value.retryOnFail !== true || value.maxTries !== 3 || value.waitBetweenTries !== 5000 || Object.keys(value).length !== 3) throw new Error('Reviewed status read retry must be bounded3tries5000ms');
      } else if (field === 'batchSize') {
        if (name !== 'Split In Batches' || !Number.isInteger(value) || value < 1 || value > 100) throw new Error('Reviewed batch size must be integer1..100');
      } else if (field !== 'jsonRequestBody' && (typeof value !== 'string' || /REDACTED_/.test(value))) throw new Error(`Reviewed field ${name}/${field} includes unsupported credential placeholders`);
      fields.push({ node: name, field, beforeSha256: hash(before), afterSha256: hash(after), changed: JSON.stringify(before) !== JSON.stringify(after) });
      setField(node, field, value);
    }
    savePrivate(`${target.id}.before.${live.versionId}.json`, live);
    savePrivate(`${target.id}.desired.${live.versionId}.${hash(writable(desired))}.json`, desired);
    prepared.push({ target, live, desired, fields });
  }
  const audit = prepared.map(p => ({ id: p.target.id, beforeVersionId: p.live.versionId, beforeActiveVersionId: p.live.activeVersionId, beforeActive: p.live.active, fields: p.fields }));
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
      const updated = await api(p.target.id, '', 'PUT', writable(p.desired));
      p.owner = state(updated);
      const published = await publish(p.target.id, p.desired, p.owner, p.live.active);
      const row = audit.find(a => a.id === p.target.id);
      row.afterVersionId = published.versionId;
      row.afterActiveVersionId = published.activeVersionId;
      row.afterActive = published.active;
      row.afterUpdatedAt = published.updatedAt;
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
        const restored = await api(p.target.id, '', 'PUT', writable(p.live));
        await publish(p.target.id, p.live, state(restored), p.live.active);
      }
      catch { recovered = false; console.error(`Recovery verification failed for ${p.target.id}`); }
    }
    console.error(recovered ? 'Attempted updates recovered and verified.' : 'Recovery needs inspection. Do not run dependent tests.');
    throw error;
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
