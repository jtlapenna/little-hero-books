#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { buildManifestKey, downloadManifest } from '../src/lib/r2-service';

type CheckStatus = 'pass' | 'fail' | 'skip';

type CheckResult = {
  id: string;
  status: CheckStatus;
  detail: string;
};

type OrderRow = {
  id: number;
  orderId?: string | null;
  order_id?: string | null;
  root_order_id?: string | null;
  amazon_order_id?: string | null;
  manifest_2a_url?: string | null;
  one_manifest_url?: string | null;
  character_hash?: string | null;
};

type ManifestLike = {
  orderId?: string | null;
  rootOrderId?: string | null;
  amazonOrderId?: string | null;
  manifestUrl?: string | null;
  originalManifestUrl?: string | null;
  characterHash?: string | null;
  order?: {
    orderId?: string | null;
    rootOrderId?: string | null;
    amazonOrderId?: string | null;
    oneManifestUrl?: string | null;
  } | null;
  entries?: Array<{ poseNumber?: number; approvedKey?: string | null }>;
};

const repoRoot = path.resolve(__dirname, '..');
const envPath = path.join(repoRoot, '.env.local');
dotenv.config({ path: envPath });

const workflowPaths = {
  w11: path.join(
    repoRoot,
    '..',
    'docs',
    'n8n-workflow-files',
    'sibling-orders',
    'sibling-order-n8n-workflows',
    'SIBLING - w1.1-Queue_Manager_and_Router.json',
  ),
  w2a: path.join(
    repoRoot,
    '..',
    'docs',
    'n8n-workflow-files',
    'sibling-orders',
    'sibling-order-n8n-workflows',
    'SIBLING - w2A-Orchestrator.json',
  ),
  sw3: path.join(
    repoRoot,
    '..',
    'docs',
    'n8n-workflow-files',
    'sibling-orders',
    'sibling-order-n8n-workflows',
    'SIBLING - w2A-SW3-Upload.json',
  ),
};

const backendPaths = {
  workflow2aComplete: path.join(repoRoot, 'src', 'app', 'api', 'webhooks', 'workflow-2a-complete', 'route.ts'),
  replaceImage: path.join(repoRoot, 'src', 'app', 'api', 'orders', '[orderId]', 'replace-image', 'route.ts'),
  create2aManifest: path.join(
    repoRoot,
    'src',
    'app',
    'api',
    'admin',
    'orders',
    '[orderId]',
    'create-2a-manifest',
    'route.ts',
  ),
};

function normalizeManifestRef(value: string | null | undefined): string {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  if (trimmed.includes('/api/manifests/')) {
    return trimmed.split('/api/manifests/')[1] ?? '';
  }
  return trimmed.replace(/^https?:\/\/[^/]+\//i, '');
}

function parseArgs() {
  const args = process.argv.slice(2);
  let rootOrderId: string | null = null;
  let orderIds: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--root-order-id') {
      rootOrderId = args[i + 1]?.trim() || null;
      i += 1;
      continue;
    }
    if (arg === '--order-ids') {
      orderIds = (args[i + 1] || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      i += 1;
      continue;
    }
  }

  return { rootOrderId, orderIds };
}

function addResult(results: CheckResult[], id: string, status: CheckStatus, detail: string) {
  results.push({ id, status, detail });
}

function loadText(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

function runSourceChecks(): CheckResult[] {
  const results: CheckResult[] = [];
  const w11 = loadText(workflowPaths.w11);
  const w2a = loadText(workflowPaths.w2a);
  const sw3 = loadText(workflowPaths.sw3);
  const workflow2aComplete = loadText(backendPaths.workflow2aComplete);
  const replaceImage = loadText(backendPaths.replaceImage);
  const create2aManifest = loadText(backendPaths.create2aManifest);

  const routerSafe =
    w11.includes('orderId: perItemOrderId') &&
    w11.includes('rootOrderId: rootOrderId') &&
    w11.includes('amazonOrderId: rootOrderId');
  addResult(
    results,
    'V1',
    routerSafe ? 'pass' : 'fail',
    routerSafe
      ? 'Sibling router keeps per-item orderId separate from the shared root order id.'
      : 'Sibling router export does not show the expected per-item/root identity split.',
  );

  const manifestSafe =
    w2a.includes('Bootstrap 2A Manifest Stub') &&
    w2a.includes('manifestBootstrapReady') &&
    w2a.includes('order.oneManifestUrl') &&
    w2a.includes('workflow-2a-complete');
  addResult(
    results,
    'V2',
    manifestSafe ? 'pass' : 'fail',
    manifestSafe
      ? 'Sibling W2A bootstraps and finalizes per-item 2A manifests before SW3 and hands completion to the backend route.'
      : 'Sibling W2A export is missing the expected bootstrap/final-manifest/backend-handoff contract.',
  );

  const sw3Safe =
    sw3.includes('per-item orderId is required') &&
    sw3.includes('Canonical publish would target the root order ID') &&
    sw3.includes("/api/orders/' + encodeURIComponent(orderId) + '/replace-image");
  addResult(
    results,
    'V5-source',
    sw3Safe ? 'pass' : 'fail',
    sw3Safe
      ? 'Sibling SW3 canonical publish is wired to the per-item orderId with invariant failures on root-id collapse.'
      : 'Sibling SW3 export still appears to allow root-biased canonical publish routing.',
  );

  const completionSafe =
    workflow2aComplete.includes('manifest body orderId does not match payload orderId') &&
    workflow2aComplete.includes('expected exactly one updated row');
  addResult(
    results,
    'V4-source',
    completionSafe ? 'pass' : 'fail',
    completionSafe
      ? 'workflow-2a-complete validates manifest identity and updates exactly one row.'
      : 'workflow-2a-complete is missing exact-row and manifest-identity enforcement.',
  );

  const hardFailSafe =
    replaceImage.includes('Missing 2A manifest for sibling preBria publish') &&
    !replaceImage.includes('uploadDirectCanonicalPoseWithoutManifest');
  addResult(
    results,
    'V6-source',
    hardFailSafe ? 'pass' : 'fail',
    hardFailSafe
      ? 'replace-image now hard-fails sibling preBria publishes when the 2A manifest is missing.'
      : 'replace-image still appears to contain the missing-manifest direct-upload fallback.',
  );

  const repairSafe =
    create2aManifest.includes('rootOrderId') &&
    create2aManifest.includes('oneManifestUrl') &&
    create2aManifest.includes("buildManifestKey(perBookOrderId, '2a')");
  addResult(
    results,
    'V7-source',
    repairSafe ? 'pass' : 'fail',
    repairSafe
      ? 'create-2a-manifest rebuilds sibling-safe identity fields on the per-item manifest key.'
      : 'create-2a-manifest still appears to rebuild sibling-unsafe identity fields.',
  );

  return results;
}

async function fetchRuntimeRows(rootOrderId: string | null, orderIds: string[]): Promise<OrderRow[]> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase credentials in .env.local');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const rows = new Map<string, OrderRow>();

  if (rootOrderId) {
    const byRoot = await supabase
      .from('orders')
      .select('id, orderId, order_id, root_order_id, amazon_order_id, manifest_2a_url, one_manifest_url, character_hash')
      .eq('root_order_id', rootOrderId);
    if (byRoot.error && byRoot.error.code !== '42703') throw byRoot.error;
    for (const row of byRoot.data ?? []) {
      const perBookId = String((row as OrderRow).orderId ?? (row as OrderRow).order_id ?? '').trim();
      if (perBookId) rows.set(perBookId, row as OrderRow);
    }

    if (rows.size === 0) {
      const byAmazonRoot = await supabase
        .from('orders')
        .select('id, orderId, order_id, root_order_id, amazon_order_id, manifest_2a_url, one_manifest_url, character_hash')
        .eq('amazon_order_id', rootOrderId);
      if (byAmazonRoot.error && byAmazonRoot.error.code !== '42703') throw byAmazonRoot.error;
      for (const row of byAmazonRoot.data ?? []) {
        const perBookId = String((row as OrderRow).orderId ?? (row as OrderRow).order_id ?? '').trim();
        if (perBookId && perBookId !== rootOrderId) rows.set(perBookId, row as OrderRow);
      }
    }
  }

  for (const orderId of orderIds) {
    const byOrderId = await supabase
      .from('orders')
      .select('id, orderId, order_id, root_order_id, amazon_order_id, manifest_2a_url, one_manifest_url, character_hash')
      .eq('orderId', orderId)
      .maybeSingle();
    if (byOrderId.error && byOrderId.error.code !== 'PGRST116' && byOrderId.error.code !== '42703') {
      throw byOrderId.error;
    }
    if (byOrderId.data) {
      rows.set(orderId, byOrderId.data as OrderRow);
      continue;
    }

    const byOrderIdSnake = await supabase
      .from('orders')
      .select('id, orderId, order_id, root_order_id, amazon_order_id, manifest_2a_url, one_manifest_url, character_hash')
      .eq('order_id', orderId)
      .maybeSingle();
    if (byOrderIdSnake.error && byOrderIdSnake.error.code !== 'PGRST116') throw byOrderIdSnake.error;
    if (byOrderIdSnake.data) {
      rows.set(orderId, byOrderIdSnake.data as OrderRow);
    }
  }

  return Array.from(rows.values());
}

async function runRuntimeChecks(rootOrderId: string | null, orderIds: string[]): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  if (!rootOrderId && orderIds.length === 0) {
    addResult(results, 'runtime', 'skip', 'No --root-order-id or --order-ids provided; runtime checks skipped.');
    return results;
  }

  const rows = await fetchRuntimeRows(rootOrderId, orderIds);
  if (rows.length === 0) {
    addResult(results, 'runtime', 'fail', 'No matching sibling rows were found for the requested runtime verification target.');
    return results;
  }

  const manifests = new Map<string, ManifestLike>();
  const manifestKeys: string[] = [];
  let schemaPass = true;
  let dbPass = true;

  for (const row of rows) {
    const perBookId = String(row.orderId ?? row.order_id ?? '').trim();
    const rowRootOrderId = String(row.root_order_id ?? row.amazon_order_id ?? '').trim();
    const manifestKey = normalizeManifestRef(row.manifest_2a_url) || buildManifestKey(perBookId, '2a');
    const expectedKey = buildManifestKey(perBookId, '2a');
    manifestKeys.push(manifestKey);

    if (!row.manifest_2a_url || manifestKey !== expectedKey) {
      dbPass = false;
    }

    try {
      const manifest = (await downloadManifest(manifestKey)) as ManifestLike;
      manifests.set(perBookId, manifest);
      const manifestOrderId = String(manifest.order?.orderId ?? manifest.orderId ?? '').trim();
      const manifestRoot = String(
        manifest.order?.rootOrderId ?? manifest.rootOrderId ?? manifest.order?.amazonOrderId ?? manifest.amazonOrderId ?? '',
      ).trim();
      const manifestOne = String(manifest.order?.oneManifestUrl ?? '').trim();
      const manifestUrl = normalizeManifestRef(manifest.manifestUrl ?? manifest.originalManifestUrl ?? '');

      if (
        manifestOrderId !== perBookId ||
        manifestRoot !== rowRootOrderId ||
        !manifestOne ||
        manifestUrl !== expectedKey
      ) {
        schemaPass = false;
      }
    } catch {
      schemaPass = false;
    }
  }

  const distinctKeys = new Set(manifestKeys.filter(Boolean));
  addResult(
    results,
    'V3-runtime',
    distinctKeys.size === rows.length && manifestKeys.every(Boolean) ? 'pass' : 'fail',
    distinctKeys.size === rows.length && manifestKeys.every(Boolean)
      ? `Runtime rows resolve to ${rows.length} distinct per-item 2A manifest keys.`
      : 'Runtime rows do not resolve to distinct per-item 2A manifest keys.',
  );

  addResult(
    results,
    'V4-runtime',
    dbPass ? 'pass' : 'fail',
    dbPass
      ? 'Each sibling row has a non-empty manifest_2a_url on its own expected per-item manifest key.'
      : 'One or more sibling rows are missing manifest_2a_url or point at a non-per-item 2A manifest key.',
  );

  addResult(
    results,
    'V7-runtime',
    schemaPass ? 'pass' : 'fail',
    schemaPass
      ? 'Downloaded sibling 2A manifests match the expected per-item/root/one-manifest identity schema.'
      : 'One or more downloaded sibling 2A manifests do not match the expected sibling-safe schema.',
  );

  const pose12PerItem = Array.from(manifests.entries()).every(([perBookId, manifest]) => {
    const entry = manifest.entries?.find((candidate) => Number(candidate.poseNumber) === 12);
    return !entry || String(manifest.order?.orderId ?? manifest.orderId ?? '').trim() === perBookId;
  });
  addResult(
    results,
    'V5-runtime',
    pose12PerItem ? 'pass' : 'fail',
    pose12PerItem
      ? 'Pose-12 manifest context remains tied to the per-item orderId for each verified sibling row.'
      : 'Pose-12 manifest context does not stay tied to the per-item orderId for at least one verified sibling row.',
  );

  return results;
}

function printResults(command: string, results: CheckResult[]) {
  const grouped = {
    pass: results.filter((result) => result.status === 'pass'),
    fail: results.filter((result) => result.status === 'fail'),
    skip: results.filter((result) => result.status === 'skip'),
  };

  console.log('Issue 38 sibling verifier');
  console.log('Command:', command);
  console.log('');

  for (const result of results) {
    const marker = result.status === 'pass' ? 'PASS' : result.status === 'fail' ? 'FAIL' : 'SKIP';
    console.log(`[${marker}] ${result.id} ${result.detail}`);
  }

  console.log('');
  console.log(
    `Summary: ${grouped.pass.length} pass, ${grouped.fail.length} fail, ${grouped.skip.length} skip`,
  );
  console.log('');
  console.log('Audit log snippet:');
  console.log(
    `- \`${new Date().toISOString()}\` Command: \`${command}\`. Results: ${grouped.pass.length} pass, ${grouped.fail.length} fail, ${grouped.skip.length} skip. Open failures: ${
      grouped.fail.map((result) => result.id).join(', ') || 'none'
    }.`,
  );
}

async function main() {
  const { rootOrderId, orderIds } = parseArgs();
  const sourceResults = runSourceChecks();
  const runtimeResults = await runRuntimeChecks(rootOrderId, orderIds);
  const results = [...sourceResults, ...runtimeResults];
  const command = process.argv.join(' ');

  printResults(command, results);

  if (results.some((result) => result.status === 'fail')) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Verifier failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
