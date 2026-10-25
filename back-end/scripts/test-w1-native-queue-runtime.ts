/** Local native-engine proof. Requires private snapshot; no dotenv or hosted clients. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  prepareW1NativeQueue,
  definitionSha256,
  workflowDefinition,
} from './helpers/prepare-w1-native-queue';
import { runNativePrintQueue } from '../src/lib/books/gelato-native-queue';
async function main() {
  const sha = (s: string) => createHash('sha256').update(s).digest('hex');
  const args = process.argv.slice(2),
    option = (k: string) =>
      args.includes(k) ? args[args.indexOf(k) + 1] : undefined;
  const snapshot = option('--snapshot'),
    expected = option('--definition-sha'),
    output = option('--output');
  assert(
    snapshot && expected && output,
    'Required: --snapshot PRIVATE_JSON --definition-sha SHA256 --output PRIVATE_DIRECTORY',
  );
  const artifact = resolve(output);
  mkdirSync(artifact, { recursive: true, mode: 0o700 });
  const harnessSha = sha(readFileSync(__filename, 'utf8'));
  writeFileSync(
    resolve(artifact, 'native-queue-runtime.sanitized.json'),
    JSON.stringify({
      schema: 'lhl.w1-native-queue-runtime@1',
      passed: false,
      status: 'running',
      harnessFileSha256: harnessSha,
    }) + '\n',
    { mode: 0o600 },
  );
  const root = resolve(__dirname, '../..');
  const patchText = readFileSync(
    resolve(
      root,
      'docs/n8n-workflow-files/repo-centric/patches/w1-gelato-native-queue.patch.json',
    ),
    'utf8',
  );
  const sourceText = readFileSync(resolve(snapshot), 'utf8'),
    source = JSON.parse(sourceText),
    patch = JSON.parse(patchText);
  const prepared = prepareW1NativeQueue(source, patch, expected);
  assert.equal(source.nodes.length, 28);
  assert.equal(prepared.candidate.nodes.length, 38);
  const candidate = structuredClone(prepared.candidate);
  for (const n of candidate.nodes) {
    const credentials = n.credentials as
      | Record<string, { id: string; name: string }>
      | undefined;
    if (
      patch.nodes.some((p: any) => p.id === n.id) &&
      credentials?.httpHeaderAuth
    )
      credentials.httpHeaderAuth = {
        id: 'e7oKyY07EBCKuCjU',
        name: 'LHL Backend Header Auth',
      };
  }
  writeFileSync(
    resolve(artifact, 'w1-native-queue-bound-review.private.json'),
    JSON.stringify(candidate, null, 2) + '\n',
    { mode: 0o600 },
  );
  const sourceNames = [
    'Extract Orders from Webhook',
    'Route Orders by Workflow',
    'Prep Workflow 4 Orders',
  ];
  const exactNodes = sourceNames.map((name) => {
    const n = source.nodes.find((n: any) => n.name === name);
    assert(n);
    assert(!/https?:\/\/|\$env\.|supabase|Bearer /i.test(n.parameters.jsCode));
    return structuredClone(n);
  });
  const guard = resolve(artifact, 'loopback-only.cjs');
  writeFileSync(
    guard,
    `const net=require('node:net'),dns=require('node:dns');
const allowed=h=>['127.0.0.1','localhost','::1','[::1]'].includes(h);
const connect=net.Socket.prototype.connect;net.Socket.prototype.connect=function(...args){const values=Array.isArray(args[0])?args[0]:args;const [options]=net._normalizeArgs(values);if(!options.path&&!allowed(options.host||'localhost'))throw Error('LOCAL_PROOF_NON_LOOPBACK_DENIED');return connect.apply(this,args);};
for(const target of [dns,dns.promises]){const lookup=target.lookup;target.lookup=function(h,...args){if(!allowed(h))throw Error('LOCAL_PROOF_DNS_DENIED');return lookup.call(this,h,...args)};}
const resolverMethods=['resolve','resolve4','resolve6','resolveAny','resolveCaa','resolveCname','resolveMx','resolveNaptr','resolveNs','resolvePtr','resolveSoa','resolveSrv','resolveTxt','reverse','lookupService'];
for(const target of [dns,dns.promises,dns.Resolver.prototype,dns.promises.Resolver.prototype])for(const method of resolverMethods)if(typeof target[method]==='function')target[method]=()=>{throw Error('LOCAL_PROOF_DNS_RESOLVER_DENIED')};
require('node:dgram').createSocket=()=>{throw Error('LOCAL_PROOF_DATAGRAM_DENIED')};`,
    { mode: 0o600 },
  );
  const runtimeDirectory = mkdtempSync(
    resolve(tmpdir(), 'lhl-native-queue-home-'),
  );
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    PATH: process.env.PATH ?? '/opt/homebrew/bin:/usr/bin:/bin',
    LC_ALL: 'C',
    NODE_OPTIONS: '--require ' + guard,
    N8N_USER_FOLDER: runtimeDirectory,
    N8N_DIAGNOSTICS_ENABLED: 'false',
    N8N_VERSION_NOTIFICATIONS_ENABLED: 'false',
    N8N_TEMPLATES_ENABLED: 'false',
    N8N_PERSONALIZATION_ENABLED: 'false',
    N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS: 'true',
    N8N_RUNNERS_ENABLED: 'false',
  };
  assert(!Object.prototype.hasOwnProperty.call(env, 'HOME'));
  async function command(executable: string, argv: string[], timeout = 90000) {
    return await new Promise<{ code: number | null; text: string }>(
      (resolve, reject) => {
        const child = spawn(executable, argv, {
          env,
          cwd: runtimeDirectory,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let text = '';
        child.stdout.on('data', (b) => (text += b));
        child.stderr.on('data', (b) => (text += b));
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          reject(Error('Local engine command deadline exceeded'));
        }, timeout);
        child.on('error', reject);
        child.on('close', (code) => {
          clearTimeout(timer);
          resolve({ code, text });
        });
      },
    );
  }
  const n8n = option('--n8n') ?? '/opt/homebrew/bin/n8n',
    version = await command(n8n, ['--version']);
  assert.equal(version.code, 0);
  assert.equal(version.text.trim(), '1.110.1');
  const denial = await command(process.execPath, [
    '-e',
    `(async()=>{const n=require('node:net'),d=require('node:dns');let c=0;for(const f of [()=>n.connect({host:'outside.invalid',port:443}),()=>d.lookup('outside.invalid',()=>{}),()=>n.connect({host:'203.0.113.1',port:443}),()=>require('node:dgram').createSocket('udp4'),()=>n.connect('443','203.0.113.1'),()=>n.connect(' 443','203.0.113.1'),()=>d.resolve('outside.invalid',()=>{}),()=>d.promises.resolve('outside.invalid'),()=>new d.Resolver().resolve4('outside.invalid',()=>{}),()=>new d.promises.Resolver().resolve4('outside.invalid')])try{f()}catch(e){if(String(e).includes('LOCAL_PROOF_'))c++}try{await fetch('https://203.0.113.1')}catch(e){if(String(e.cause).includes('LOCAL_PROOF_'))c++}if(c!==11)process.exit(2);console.log(c)})()`,
  ]);
  assert.equal(denial.code, 0);
  assert.equal(denial.text.trim(), '11');
  globalThis.fetch = async () => {
    throw Error('LOCAL_PROOF_PARENT_FETCH_DENIED');
  };
  function executionJson(text: string) {
    for (let start = 0; start < text.length; start++) {
      if (text[start] !== '{') continue;
      let depth = 0,
        quoted = false,
        escaped = false;
      for (let end = start; end < text.length; end++) {
        const c = text[end];
        if (quoted) {
          if (escaped) escaped = false;
          else if (c === '\\') escaped = true;
          else if (c === '"') quoted = false;
          continue;
        }
        if (c === '"') {
          quoted = true;
          continue;
        }
        if (c === '{') depth++;
        if (c === '}' && --depth === 0) {
          try {
            const value = JSON.parse(text.slice(start, end + 1));
            if (value?.data?.resultData) return value;
          } catch {}
          break;
        }
      }
    }
    return undefined;
  }
  type Scenario = {
    name: string;
    ids: number[];
    off?: boolean;
    lulu?: number[];
    siblings?: boolean;
    conflict?: boolean;
    queue?: string;
    failed?: number[];
    triggerTimeout?: boolean;
    fence?: string;
    expectError?: string;
  };
  const scenarios: Scenario[] = [
    { name: 'empty', ids: [] },
    { name: 'gelato-off', ids: [1], off: true },
    { name: 'lulu-passthrough', ids: [1], lulu: [1] },
    { name: 'lulu-siblings', ids: [1, 2], lulu: [1, 2], siblings: true },
    { name: 'single-success', ids: [1] },
    { name: 'siblings-success', ids: [1, 2], siblings: true },
    { name: 'claim-conflict', ids: [1], conflict: true },
    {
      name: 'queue-malformed',
      ids: [1],
      queue: 'malformed',
      expectError: 'Expand Native Print Queue',
    },
    {
      name: 'queue-http503',
      ids: [1],
      queue: 'status503',
      expectError: 'Claim Native Print Queue',
    },
    {
      name: 'queue-timeout',
      ids: [1],
      queue: 'timeout',
      expectError: 'Claim Native Print Queue',
    },
    { name: 'single-http-error-fenced', ids: [1], failed: [1] },
    {
      name: 'single-timeout-fenced',
      ids: [1],
      failed: [1],
      triggerTimeout: true,
    },
    {
      name: 'siblings-http-error-fenced',
      ids: [1, 2],
      siblings: true,
      failed: [1],
    },
    {
      name: 'mixed-success-errors-lulu',
      ids: [1, 2, 3, 4, 5],
      lulu: [5],
      failed: [2, 3],
    },
    {
      name: 'fence-false',
      ids: [1],
      failed: [1],
      fence: 'false',
      expectError: 'Confirm Native Gelato Fence',
    },
    {
      name: 'fence-http503',
      ids: [1],
      failed: [1],
      fence: 'status503',
      expectError: 'Fence Failed Native Gelato Claim',
    },
  ];
  const uuid = (kind: number, id: number) =>
    `${String(kind).padStart(8, '0')}-1111-4111-8111-${String(id).padStart(12, '0')}`;
  let current: Scenario,
    requests: { path: string; body: any }[] = [],
    claimCalls = 0,
    memberCalls = 0,
    handlerFailures = 0;
  function rows(s: Scenario) {
    return s.ids.map((id) => ({
      id,
      orderId: `SYNTHETIC-NATIVE-${id}`,
      root_order_id: s.siblings
        ? 'SYNTHETIC-NATIVE-SIB'
        : s.name === 'mixed-success-errors-lulu' && [3, 4].includes(id)
          ? 'SYNTHETIC-NATIVE-MIX-SIB'
          : `SYNTHETIC-NATIVE-${id}`,
      next_workflow: '4',
      execution_status: 'ready_for_processing',
      customer_approval_required: true,
      customer_approval_status: 'approved',
      print_provider: s.lulu?.includes(id) ? 'lulu' : 'gelato',
      character_hash: `synthetic-hash-${id}`,
      one_manifest_url: `synthetic/orders/${id}/manifests/1-manifest.json`,
      shipping_address: {
        name: 'Alex Synthetic',
        address_line1: '1 Test Lane',
        city: 'Test City',
        state: 'CA',
        zip: '90001',
        country: 'US',
        phone_number: '5550000000',
      },
      shipping_tier: 'ground',
    }));
  }
  const server = createServer(async (req, res) => {
    try {
      let raw = '';
      for await (const part of req) raw += part;
      const body = JSON.parse(raw || '{}'),
        requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1'),
        path = requestUrl.pathname;
      requests.push({ path, body });
      const send = (status: number, value: unknown) => {
        if (res.destroyed) return;
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(value));
      };
      if (path === '/queue') {
        assert.deepEqual(body, { orderDbIds: current.ids });
        if (current.queue === 'timeout') {
          setTimeout(() => send(200, { success: false }), 600);
          return;
        }
        if (current.queue === 'status503') {
          send(503, { error: 'synthetic unavailable' });
          return;
        }
        const all = rows(current);
        const result = await runNativePrintQueue(body, {
          draftsEnabled: !current.off,
          loadOrders: async (ids) => all.filter((r) => ids.includes(r.id)),
          loadMembers: async (root) => {
            memberCalls++;
            return all
              .filter((r) => r.root_order_id === root)
              .map((r) => ({ id: r.id, orderId: r.orderId }));
          },
          claim: async (ids) => {
            claimCalls++;
            return {
              provider: 'gelato',
              routes: all
                .filter((r) => ids.includes(r.id))
                .map((r) => ({
                  orderDbId: r.id,
                  orderId: r.orderId,
                  rootOrderId: r.root_order_id,
                  provider: 'gelato',
                  bookId: 'book-finding-our-inner-voice',
                  configVersion: 2,
                  formatId: 'standard',
                  productUid: 'synthetic-product',
                  innerPageCount: 32,
                  apiPageCount: 32,
                  expectedPdfPageCount: 35,
                })),
              claim: {
                dispatch: !current.conflict,
                submissionId: uuid(1, ids[0]),
                claimToken: uuid(2, ids[0]),
                orderReferenceId: 'synthetic-reference',
                reason: current.conflict ? 'already_submitted' : undefined,
              },
            };
          },
          fence: async () => {
            throw Error('Unexpected backend validation fence');
          },
        });
        send(
          200,
          current.queue === 'malformed'
            ? { success: true, customerMessages: false, groups: [] }
            : result,
        );
        return;
      }
      if (path === '/single' || path === '/siblings') {
        const id = Number(body.orderDbIds?.[0]);
        assert.equal(body.submissionId, uuid(1, id));
        assert.equal(body.claimToken, uuid(2, id));
        assert.equal(
          path,
          body.orderDbIds.length > 1 ? '/siblings' : '/single',
        );
        if (current.failed?.includes(id)) {
          if (current.triggerTimeout) {
            setTimeout(
              () =>
                send(500, {
                  error: 'synthetic timeout',
                  submissionId: 'FOREIGN',
                  claimToken: 'FOREIGN',
                }),
              600,
            );
            return;
          }
          send(500, {
            error: 'synthetic child failure',
            submissionId: 'FOREIGN',
            claimToken: 'FOREIGN',
          });
          return;
        }
        send(200, { accepted: true });
        return;
      }
      if (path === '/rest/v1/orders') {
        assert.equal(req.method, 'GET');
        assert.equal(req.headers.apikey, 'synthetic-no-authority');
        const root = requestUrl.searchParams.get('root_order_id');
        assert(root && root.startsWith('eq.'));
        const rootId = root.slice(3);
        send(
          200,
          rows(current).filter((row) => row.root_order_id === rootId),
        );
        return;
      }
      if (path === '/fence') {
        assert.equal(
          Object.keys(body).sort().join(','),
          'claimToken,submissionId',
        );
        send(current.fence === 'status503' ? 503 : 200, {
          success: true,
          fenced: current.fence !== 'false',
        });
        return;
      }
      throw Error('Unexpected loopback path');
    } catch {
      handlerFailures++;
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end('{"error":"SYNTHETIC_HANDLER_ASSERTION"}');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`,
    reports: any[] = [];
  const classifier = structuredClone(
    source.nodes.find((n: any) => n.name === 'Classify W4 Orders'),
  );
  const classifierSource = classifier.parameters.jsCode;
  let bindingChanges = 0;
  classifier.parameters.jsCode = classifierSource
    .replace(/const supabaseUrl = '[^']+';/, () => {
      bindingChanges++;
      return "const supabaseUrl = '" + origin + "';";
    })
    .replace(/const supabaseKey = '[^']+';/, () => {
      bindingChanges++;
      return "const supabaseKey = 'synthetic-no-authority';";
    });
  assert.equal(bindingChanges, 2);
  assert(!/https?:\/\/(?!127\.0\.0\.1)/.test(classifier.parameters.jsCode));
  const shipping = structuredClone(
    source.nodes.find((n: any) => n.name === 'Validate Shipping for w4'),
  );
  assert(shipping);

  try {
    for (const scenario of scenarios) {
      current = scenario;
      requests = [];
      claimCalls = 0;
      memberCalls = 0;
      handlerFailures = 0;
      const native = structuredClone(patch.nodes);
      for (const n of native) {
        delete n.credentials;
        if (n.type === 'n8n-nodes-base.httpRequest') {
          n.parameters.url =
            origin +
            (n.name === 'Claim Native Print Queue'
              ? '/queue'
              : n.name === 'Fence Failed Native Gelato Claim'
                ? '/fence'
                : n.name === 'Trigger Native W4 Gelato'
                  ? '/single'
                  : '/siblings');
          delete n.parameters.authentication;
          delete n.parameters.genericAuthType;
          if (
            (scenario.queue === 'timeout' &&
              n.name === 'Claim Native Print Queue') ||
            (scenario.triggerTimeout && n.name === 'Trigger Native W4 Gelato')
          )
            n.parameters.options.timeout = 200;
        }
      }
      const manual = {
          id: randomUUID(),
          name: 'Local Manual',
          type: 'n8n-nodes-base.manualTrigger',
          typeVersion: 1,
          position: [0, 0],
          parameters: {},
        },
        seed = {
          id: randomUUID(),
          name: 'Synthetic Webhook Input',
          type: 'n8n-nodes-base.code',
          typeVersion: 2,
          position: [200, 0],
          parameters: {
            jsCode:
              'return [{json:' +
              JSON.stringify({ body: { orders: rows(scenario) } }) +
              '}];',
          },
        },
        legacy = {
          id: randomUUID(),
          name: 'Legacy Shipping Valid',
          type: 'n8n-nodes-base.code',
          typeVersion: 2,
          position: [1000, 0],
          parameters: { jsCode: 'return $input.all();' },
        };
      const edge = (name: string) => ({
        main: [[{ node: name, type: 'main', index: 0 }]],
      });
      const workflow = {
        id: 'native-local-' + scenario.name,
        name: scenario.name,
        active: false,
        versionId: randomUUID(),
        settings: { executionOrder: 'v1' },
        nodes: [
          manual,
          seed,
          ...structuredClone(exactNodes),
          ...native,
          structuredClone(classifier),
          structuredClone(shipping),
          legacy,
        ],
        connections: {
          'Local Manual': edge('Synthetic Webhook Input'),
          'Synthetic Webhook Input': edge('Extract Orders from Webhook'),
          'Extract Orders from Webhook': edge('Route Orders by Workflow'),
          'Route Orders by Workflow': edge('Prep Workflow 4 Orders'),
          'Prep Workflow 4 Orders': edge('Prepare Native Print Queue'),
          ...structuredClone(patch.connections),
          'Classify W4 Orders': edge('Validate Shipping for w4'),
          'Validate Shipping for w4': {
            main: [
              [{ node: 'Legacy Shipping Valid', type: 'main', index: 0 }],
              [],
            ],
          },
        },
      };
      const serialized = JSON.stringify(workflow);
      assert(!serialized.includes('https://'));
      assert(!serialized.includes('credentials'));
      assert(!serialized.includes('$env.'));
      const target = resolve(artifact, scenario.name + '.runtime.private.json');
      writeFileSync(target, serialized + '\n', { mode: 0o600 });
      const imported = await command(n8n, [
        'import:workflow',
        '--input=' + target,
      ]);
      assert.equal(imported.code, 0, 'Native import failed');
      assert(
        existsSync(resolve(runtimeDirectory, '.n8n/database.sqlite')),
        'Native SQLite must use explicit N8N_USER_FOLDER',
      );
      const executed = await command(n8n, [
        'execute',
        '--id=' + workflow.id,
        '--rawOutput',
      ]);
      writeFileSync(
        resolve(artifact, scenario.name + '.runtime.private.log'),
        executed.text,
        { mode: 0o600 },
      );
      const decoded = executionJson(executed.text);
      assert(decoded, 'Native raw result missing');
      assert.equal(
        executed.code,
        scenario.expectError ? 1 : 0,
        'Native CLI exit must match expected result',
      );
      assert.equal(decoded.finished, scenario.expectError ? undefined : true);
      assert(
        Number.isFinite(Date.parse(decoded.startedAt)) &&
          Number.isFinite(Date.parse(decoded.stoppedAt)) &&
          Date.parse(decoded.stoppedAt) >= Date.parse(decoded.startedAt),
        'Native execution must have coherent stop time',
      );
      assert(!decoded.waitTill);
      const result = decoded.data.resultData,
        run = result.runData ?? {},
        errors = Object.keys(run).filter((name) =>
          run[name].some((entry: any) => entry.error),
        );
      assert.deepEqual(
        errors,
        scenario.expectError ? [scenario.expectError] : [],
        scenario.name + ' unexpected error node',
      );
      assert.equal(Boolean(result.error), Boolean(scenario.expectError));
      if (scenario.expectError)
        assert.equal(result.error.node.name, scenario.expectError);
      const terminal =
        scenario.expectError ??
        (!scenario.ids.length
          ? 'Extract Orders from Webhook'
          : scenario.off || scenario.conflict
            ? 'Expand Native Print Queue'
            : scenario.failed?.length
              ? 'Confirm Native Gelato Fence'
              : scenario.lulu?.length
                ? 'Legacy Shipping Valid'
                : scenario.siblings
                  ? 'Trigger Native W4.1 Gelato'
                  : 'Trigger Native W4 Gelato');
      assert.equal(result.lastNodeExecuted, terminal);
      assert.deepEqual(Object.keys(run).slice(0, 3), [
        'Local Manual',
        'Synthetic Webhook Input',
        'Extract Orders from Webhook',
      ]);
      if (!scenario.ids.length) assert.equal(Object.keys(run).length, 3);
      assert.equal(handlerFailures, 0);
      const calls = (path: string) => requests.filter((r) => r.path === path);
      assert.equal(calls('/queue').length, scenario.ids.length ? 1 : 0);
      const noDispatch =
          scenario.off ||
          scenario.conflict ||
          !!scenario.queue ||
          !scenario.ids.length,
        groups = noDispatch
          ? []
          : scenario.siblings
            ? scenario.lulu?.length
              ? []
              : [scenario.ids]
            : scenario.name === 'mixed-success-errors-lulu'
              ? [[1], [2], [3, 4]]
              : scenario.ids
                  .filter((id) => !scenario.lulu?.includes(id))
                  .map((id) => [id]);
      assert.deepEqual(
        calls('/single')
          .concat(calls('/siblings'))
          .map((r) => r.body.orderDbIds)
          .sort((a, b) => a[0] - b[0]),
        groups,
      );
      const fences = groups
        .filter((ids) => scenario.failed?.includes(ids[0]))
        .map((ids) => ({
          submissionId: uuid(1, ids[0]),
          claimToken: uuid(2, ids[0]),
        }));
      assert.deepEqual(
        calls('/fence')
          .map((r) => r.body)
          .sort((a, b) => a.submissionId.localeCompare(b.submissionId)),
        fences,
      );
      const lulu = (run['IF Native Gelato Provider'] ?? [])
        .flatMap((entry: any) => entry.data?.main?.[1] ?? [])
        .map((item: any) => item.json);
      assert.deepEqual(
        lulu.map((row: any) => row.orderDbId).sort(),
        scenario.lulu ?? [],
      );
      for (const row of lulu) {
        assert.equal(row.provider, 'lulu');
        assert.equal(row.orderId, `SYNTHETIC-NATIVE-${row.orderDbId}`);
        assert.equal(row.characterHash, `synthetic-hash-${row.orderDbId}`);
        assert.equal(
          row.oneManifestKey,
          `synthetic/orders/${row.orderDbId}/manifests/1-manifest.json`,
        );
        assert.equal(row.shipping_address.address_line_1, '1 Test Lane');
        assert.equal(row.shipping_tier, 'ground');
      }
      if (scenario.off) {
        assert.equal(claimCalls, 0);
        assert.equal(memberCalls, 0);
      }
      const lookupCount = new Set(
        rows(scenario)
          .filter((row) => scenario.lulu?.includes(row.id))
          .map((row) => row.root_order_id),
      ).size;
      assert.equal(calls('/rest/v1/orders').length, lookupCount);
      const legacyPassed = (run['Legacy Shipping Valid'] ?? [])
        .flatMap((entry: any) => entry.data?.main?.[0] ?? [])
        .map((item: any) => item.json);
      assert.deepEqual(
        legacyPassed.map((row: any) => row.orderDbId).sort(),
        scenario.lulu ?? [],
      );
      if (scenario.name === 'lulu-siblings')
        assert(legacyPassed.every((row: any) => row._route === 'sibling'));
      assert.equal(
        requests.length,
        (scenario.ids.length ? 1 : 0) +
          groups.length +
          fences.length +
          lookupCount,
      );
      reports.push({
        name: scenario.name,
        passed: true,
        loopbackRequests: requests.length,
        syntheticClaims: claimCalls,
        legacyItems: lulu.length,
        dispatches: groups.length,
        fences: fences.length,
        errorNode: scenario.expectError ?? null,
        runtimeDefinitionSha256: sha(serialized),
        timeoutOverrideMs:
          scenario.queue === 'timeout' || scenario.triggerTimeout ? 200 : null,
      });
      console.log(JSON.stringify({ case: scenario.name, passed: true }));
    }
    const report = {
      schema: 'lhl.w1-native-queue-runtime@1',
      passed: true,
      cases: reports.length,
      n8nVersion: '1.110.1',
      taskRunners: false,
      sourceSnapshotSha256: sha(sourceText),
      sourceDefinitionSha256: expected,
      patchFileSha256: sha(patchText),
      unboundCandidateDefinitionSha256: prepared.candidateDefinitionSha256,
      boundReviewCandidateDefinitionSha256: definitionSha256(
        workflowDefinition(candidate),
      ),
      candidateNodes: 38,
      sourceNodesPreserved: 28,
      exactRuntimeSourceNodes: [...sourceNames, 'Validate Shipping for w4'],
      exactPatchNodeLogic: 10,
      harnessFileSha256: harnessSha,
      legacyClassifierSourceSha256: sha(classifierSource),
      legacyClassifierBoundSha256: sha(classifier.parameters.jsCode),
      networkDenialChecks: 11,
      configIsolation: {
        explicitN8nUserFolder: true,
        homeOverride: false,
        isolatedChildCwd: true,
        nativeSqliteVerified: true,
      },
      networkGuardBoundary:
        'JavaScript socket, DNS and datagram guards; not an OS sandbox',
      liveRequests: 0,
      providerCreates: 0,
      hostedWorkflowInstalls: 0,
      limits: [
        'Local n8n 1.110.1, not hosted execution',
        '38-node candidate preserved privately. Executable rehearsal uses exact new 10-node branch plus exact Extract, Route, Prep4 and shipping IF. Legacy classifier changes only Supabase URL/key bindings. Other legacy and non-print nodes excluded.',
        'Synthetic manual entry replaces webhook. Actual legacy classifier and shipping IF execute; identity sink stops before legacy claims and dispatch.',
        'HTTP origins replaced with loopback and credential bindings removed. Timeout cases use 200ms override. No other tested Code or IF changes.',
        'Actual runNativePrintQueue with synthetic dependencies. No SQL claim, W4/W4.1 execution, provider API, customer data or messages.',
      ],
      reports,
    };
    writeFileSync(
      resolve(artifact, 'native-queue-runtime.sanitized.json'),
      JSON.stringify(report, null, 2) + '\n',
      { mode: 0o600 },
    );
    console.log(
      JSON.stringify({
        passed: true,
        cases: reports.length,
        report: resolve(artifact, 'native-queue-runtime.sanitized.json'),
      }),
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(runtimeDirectory, { recursive: true, force: true });
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
