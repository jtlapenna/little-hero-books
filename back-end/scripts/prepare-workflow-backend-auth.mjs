import fs from 'node:fs';
import path from 'node:path';
export const CREDENTIAL_ID = '__LHL_BACKEND_HEADER_AUTH_CREDENTIAL_ID__';
const origin = 'https://admin.littleherolabs.com';
function expressionValue(value) {
  const text = String(value).replace(/^=/, '');
  const parts = []; let last = 0;
  for (const match of text.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
    if (match.index > last) parts.push(JSON.stringify(text.slice(last, match.index)));
    parts.push(`String(${match[1].trim()})`); last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(JSON.stringify(text.slice(last)));
  return parts.join(' + ') || '""';
}
function pinBackendUrl(value) {
  if (String(value).includes('LHL pinned backend')) return value;
  const expression = expressionValue(value);
  return `={{ (() => { /* LHL pinned backend */ const value = ${expression}; if (!value.startsWith('${origin}/api/') || /[\\\\\\s#@]/.test(value) || /%(?:2e|2f|5c|25|3f|23)/i.test(value.split('?')[0]) || value.split('?')[0].split('/').some(p => p === '.' || p === '..')) throw new Error('Invalid backend request destination'); return value; })() }}`;
}
function nativeAuth(node, id) {
  const p = node.parameters;
  p.authentication = 'genericCredentialType'; p.genericAuthType = 'httpHeaderAuth';
  node.credentials ??= {}; node.credentials.httpHeaderAuth = { id, name: 'LHL backend API' };
  if (p.headerParameters?.parameters) p.headerParameters.parameters = p.headerParameters.parameters.filter(h => String(h.name).toLowerCase() !== 'authorization');
  p.options ??= {}; p.options.redirect = { redirect: { followRedirects: false } };
}
const assetDestination = `    const text = String(url);
    const backendUrl = '${origin}';
    const match = text.match(/^https:\\/\\/([A-Za-z0-9.-]+)\\/([^?#]+)(?:\\?[^#]*)?$/);
    if (!match || /[\\\\\\s]/.test(text)) throw new Error('Invalid image destination');
    const host = match[1], rawPath = match[2];
    const publicR2 = host === 'pub-92cec53654f84771956bc84dfea65baa.r2.dev';
    const backend = host === 'admin.littleherolabs.com';
    if ((!backend && rawPath.includes('api/assets/')) || (!publicR2 && /(?:\\.r2\\.dev|\\.r2\\.cloudflarestorage\\.com)$/.test(host))) throw new Error('Unapproved asset destination');
    let finalUrl = text;
    const headers = {};
    if (backend || publicR2) {
      const key = backend ? rawPath.replace(/^api\\/assets\\//, '') : rawPath;
      if ((backend && !rawPath.startsWith('api/assets/')) || !/^[A-Za-z0-9_-]+(?:\\/[A-Za-z0-9_.-]+)+\\.(?:png|jpe?g|webp)$/.test(key) || key.split('/').some(p => p === '.' || p === '..') || text.includes('%')) throw new Error('Invalid backend asset key');
      finalUrl = backendUrl + '/api/assets/' + key;
      headers.Authorization = 'Bearer ' + backendToken;
    }
`;
function hardenAssetCode(code) {
  if (!code.includes("finalUrl.includes('/api/assets/')")) return code;
  const start = code.indexOf('    let finalUrl = url;');
  const fetchStart = code.indexOf('    const res = await this.helpers.httpRequest(', start);
  if (start < 0 || fetchStart < 0) throw new Error('Asset helper shape changed');
  const token = code.slice(start, fetchStart).match(/    const backendToken = [^\n]+;/)?.[0];
  if (!token) throw new Error('Asset helper authority assignment missing');
  code = code.slice(0, start) + token + '\n' + assetDestination + code.slice(fetchStart);
  code = code.replace("url: finalUrl, headers, encoding:'arraybuffer'", "url: finalUrl, headers, encoding:'arraybuffer', disableFollowRedirect: true");
  // Signed source URLs and backend authority must not reach workflow logs.
  code = code.replace("{ url, msg: e?.message }", "{ fileName, failed: true }").replace("fileName, url, e?.message||e", "fileName, 'image request failed'");
  return code;
}
function manifestDownloadExpression(which) {
  return `={{ (() => { const ctx = $items('Normalize Result', 0, $runIndex)?.[0]?.json || {}; const orderId = String(ctx.orderId || ''); const raw = String(${which === '2a' ? "ctx.manifest2aUrl || ''" : "ctx.manifest2bKey || ''"}); const prefix = '${origin}/api/manifests/'; const key = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw; if (!/^[A-Za-z0-9_-]+\\/orders\\/[A-Za-z0-9_-]+\\/manifests\\/${which}-manifest\\.json$/.test(key) || key.split('/')[2] !== orderId) throw new Error('Invalid ${which.toUpperCase()} manifest destination'); return prefix + key + '?v=' + Date.now(); })() }}`;
}
function hardenMerge(code) {
  if (code.includes('function requireManifestResponse')) return code;
  const prefixStart = code.indexOf('function parseJsonPrefix('), prefixEnd = code.indexOf('function asManifest(', prefixStart);
  if (prefixStart < 0 || prefixEnd < 0) throw new Error('Merge parser shape changed');
  code = code.slice(0, prefixStart) + `function parseJsonText(text) { if (typeof text !== 'string') return null; try { return JSON.parse(text); } catch { return null; } }\n\n` + code.slice(prefixEnd);
  const start = code.indexOf('let manifest2a = null;'), end = code.indexOf('if (!incoming ||', start);
  if (start < 0 || end < 0) throw new Error('Merge fallback shape changed');
  const guard = `function requireManifestResponse(raw, stage, missingAllowed) {
  if (!raw || !Number.isInteger(raw.statusCode) || (raw.statusCode !== 200 && !(missingAllowed && raw.statusCode === 404))) throw new Error('Manifest download failed');
  if (raw.statusCode === 404) return null;
  const manifest = asManifest(raw.body);
  const actualOrderId = manifest?.orderId || manifest?.order?.orderId;
  const actualHash = manifest?.characterHash || manifest?.order?.characterHash;
  if (!manifest || manifest.schema !== 'lhb.run-manifest@v2.0' || (stage === '2b' ? manifest.stage !== stage : manifest.stage !== undefined && manifest.stage !== stage) || actualOrderId !== orderId || actualHash !== incoming.characterHash || !Array.isArray(manifest.entries) || !manifest.entries.length || manifest.entries.some(e => !e || (typeof e.poseNumber !== 'number' && !/^[0-9]+$/.test(String(e.poseNumber))) || !Number.isInteger(Number(e.poseNumber)) || Number(e.poseNumber) < 0) || new Set(manifest.entries.map(e => Number(e.poseNumber))).size !== manifest.entries.length) throw new Error('Manifest identity or schema differs');
  if ((manifest.orderId && manifest.orderId !== orderId) || (manifest.order?.orderId && manifest.order.orderId !== orderId) || (manifest.characterHash && manifest.characterHash !== incoming.characterHash) || (manifest.order?.characterHash && manifest.order.characterHash !== incoming.characterHash)) throw new Error('Manifest identity differs');
  return manifest;
}
const manifest2a = requireManifestResponse($items('Download 2A Manifest (for merge)', 0, $runIndex)?.[0]?.json, '2a', false);
const downloaded2b = requireManifestResponse(manifest2bMaybe, '2b', true);

`;
  code = code.slice(0, start) + guard + code.slice(end);
  const old = `let manifest2b = asManifest(manifest2bMaybe);\nif (manifest2b && manifest2b.schema !== 'lhb.run-manifest@v2.0') {\n  manifest2b = null;\n}`;
  if (!code.includes(old)) throw new Error('Merge initialization shape changed');
  return code.replace(old, 'let manifest2b = downloaded2b;');
}
export function prepareWorkflowBackendAuth(input, credentialId = CREDENTIAL_ID) {
  if (!/^[A-Za-z0-9_-]{4,100}$/.test(credentialId)) throw new Error('Invalid credential reference');
  const w = structuredClone(input); const changed = [];
  for (const n of w.nodes) {
    const p = n.parameters ?? {};
    if (n.type === 'n8n-nodes-base.httpRequest' && (String(p.url).includes('admin.littleherolabs.com') || String(p.url).includes('backendUrl') || ['Download 2B Manifest (if exists)', 'Download 2A Manifest (for merge)', 'Get Pose'].includes(n.name))) {
      nativeAuth(n, credentialId); p.url = pinBackendUrl(p.url);
      if (n.name === 'Get Pose') p.url = `={{ (() => { const key = String($json.poseRefKey || ''); if (!/^[A-Za-z0-9_-]+(?:\\/[A-Za-z0-9_.-]+)+\\.(?:png|jpe?g|webp)$/.test(key) || key.split('/').some(p => p === '.' || p === '..')) throw new Error('Invalid pose reference key'); return '${origin}/api/assets/' + key; })() }}`;
      changed.push(n.name);
    }
    if (typeof p.jsCode === 'string' && ['Pose QA — Build Request1','Reattach (Style QA): Base + Generated'].includes(n.name)) {
      const next = hardenAssetCode(p.jsCode); if (next !== p.jsCode) { p.jsCode = next; changed.push(n.name); }
    }
  }
  const merge = w.nodes.find(n => n.name === 'Merge Result Into 2B Manifest');
  if (merge) {
    for (const [name, which] of [['Download 2B Manifest (if exists)', '2b'], ['Download 2A Manifest (for merge)', '2a']]) {
      const node = w.nodes.find(n => n.name === name); if (!node) throw new Error('Required download node missing');
      node.parameters.url = manifestDownloadExpression(which);
      node.parameters.options.response = { response: { responseFormat: 'text', fullResponse: true, neverError: true } };
      nativeAuth(node, credentialId);
    }
    w.connections['Normalize Result'].main = [[{ node: 'Download 2B Manifest (if exists)', type: 'main', index: 0 }]];
    w.connections['Download 2B Manifest (if exists)'].main = [[{ node: 'Download 2A Manifest (for merge)', type: 'main', index: 0 }]];
    w.connections['Download 2A Manifest (for merge)'] = { main: [[{ node: 'Merge Result Into 2B Manifest', type: 'main', index: 0 }]] };
    merge.parameters.jsCode = hardenMerge(merge.parameters.jsCode); changed.push(merge.name);
    const upload = w.nodes.find(n => n.name === 'Upload 2B Manifest to R2');
    if (!upload || upload.continueOnFail || (upload.onError && upload.onError !== 'stopWorkflow')) throw new Error('Manifest upload must stop on error');
    const restoredName = 'Restore 2B Manifest Upload Context';
    let restored = w.nodes.find(n => n.name === restoredName);
    if (!restored) {
      restored = { id: 'b3d27959-604e-4e31-87c6-866049c1fced', name: restoredName, type: 'n8n-nodes-base.code', typeVersion: 2,
        position: [upload.position[0] + 120, upload.position[1] + 120], parameters: { mode: 'runOnceForEachItem', jsCode: `const ack = $json || {};
const context = $('Prep Manifest Binary').item.json;
if (ack.success !== true || ack.error || !context || typeof context.complete !== 'boolean' || typeof context.needsHumanReview !== 'boolean' || typeof context.orderId !== 'string' || !context.characterHash || context.backendUrl !== 'https://admin.littleherolabs.com' || !String(context.manifest2bKey).includes('/orders/' + context.orderId + '/manifests/2b-manifest.json')) throw new Error('Manifest upload acknowledgement or paired context invalid');
return { json: { ...context } };` } };
      w.nodes.push(restored);
    }
    w.connections['Upload 2B Manifest to R2'].main = [[{node: restoredName, type:'main',index:0}]];
    w.connections[restoredName] = {main:[[{node:'If Complete',type:'main',index:0}]]};
    const completeNode = w.nodes.find(n => n.name === 'If Complete');
    if (completeNode.parameters.conditions?.conditions?.length !== 1 || completeNode.parameters.conditions.conditions[0].operator?.type !== 'boolean') throw new Error('Completion condition shape changed');
    completeNode.parameters.conditions.conditions[0].leftValue = '={{ $json.complete === true }}';
    const notify = w.nodes.find(n => n.name === 'Notify Backend (2B Complete)');
    notify.parameters.url = 'https://admin.littleherolabs.com/api/webhooks/workflow-2b-complete';
    notify.parameters.jsonBody = "={{ { orderId: $json.orderId, rootOrderId: $json.amazonOrderId, amazonOrderId: $json.amazonOrderId, manifestUrl: $json.manifest2bKey, characterHash: $json.characterHash, needsReview: $json.needsHumanReview } }}";
    merge.parameters.jsCode = merge.parameters.jsCode.replace("const backendUrl = ctx.backendUrl || incoming.backendUrl || 'https://admin.littleherolabs.com';", "const backendUrl = 'https://admin.littleherolabs.com';").replace('backendUrl: ctx.backendUrl || backendUrl', 'backendUrl');
    changed.push(restoredName, 'If Complete', notify.name);
  }
  return { workflow: w, changedNodes: [...new Set(changed)] };
}
