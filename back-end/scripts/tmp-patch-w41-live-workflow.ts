import fs from 'node:fs';
import path from 'node:path';

const workflowId = 'boWA0mB20qYK2g4x';
const targetNames = new Set([
  'Fetch Repo W4.1 Sibling Print Input',
  'Aggregate + Signed URLs + Build Lulu Payload',
  'Generate Interior PDF',
  'Poll PDFMonkey until ready',
  'Generate Cover PDF',
  'Poll Cover PDFMonkey until ready',
  'Reattach QA Context (Post Cover Upload)',
  'Lulu: Get Token',
  'Validate PDFs + Guard Lulu',
  'Submit Lulu Print Job',
]);

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

async function main() {
  const apiBase = (
    process.env.N8N_API_URL?.trim() ||
    process.env.N8N_BASE_URL?.trim() ||
    'https://thepeakbeyond.app.n8n.cloud'
  ).replace(/\/$/, '');
  const apiKey = requireEnv('N8N_API_KEY');

  const localPath =
    '/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/workflows/w4.1-Sibling-Aggregation.repo-centric.json';
  const localWorkflow = JSON.parse(fs.readFileSync(localPath, 'utf8')) as {
    nodes?: Array<{ name?: string; parameters?: Record<string, unknown> }>;
  };
  const localByName = new Map(
    (localWorkflow.nodes || [])
      .filter((node) => node.name && targetNames.has(node.name))
      .map((node) => [node.name as string, node]),
  );
  if (localByName.size !== targetNames.size) {
    throw new Error('Local export missing one or more target nodes');
  }

  const headers = {
    'X-N8N-API-KEY': apiKey,
    'Content-Type': 'application/json',
  };

  const currentRes = await fetch(`${apiBase}/api/v1/workflows/${workflowId}`, { headers });
  if (!currentRes.ok) {
    throw new Error(`fetch failed ${currentRes.status}: ${await currentRes.text()}`);
  }
  const current = (await currentRes.json()) as {
    name: string;
    nodes: Array<{ name?: string; parameters?: Record<string, unknown> }>;
    connections: Record<string, unknown>;
    settings?: Record<string, unknown>;
    active?: boolean;
    versionId?: string;
    versionCounter?: number;
  };

  const outDir =
    '/Users/jeff/Projects/little-hero-books/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-30';
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/:/g, '-');
  const beforePath = path.join(
    outDir,
    `w4.1-Sibling-Aggregation.live.before-pdfmonkey-split-poll-route-qa-merge-prod-guard-${stamp}.json`,
  );
  const afterPath = path.join(
    outDir,
    `w4.1-Sibling-Aggregation.live.after-pdfmonkey-split-poll-route-qa-merge-prod-guard-${stamp}.json`,
  );
  fs.writeFileSync(beforePath, JSON.stringify(current, null, 2));

  const patchedNodes = current.nodes.map((node) => {
    if (!node.name || !targetNames.has(node.name)) {
      return node;
    }
    const source = localByName.get(node.name);
    return {
      ...node,
      parameters: source?.parameters ?? node.parameters,
    };
  });

  const updateBody = {
    name: current.name,
    nodes: patchedNodes,
    connections: current.connections,
    settings: current.settings || {},
  };

  const updateRes = await fetch(`${apiBase}/api/v1/workflows/${workflowId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(updateBody),
  });
  if (!updateRes.ok) {
    throw new Error(`update failed ${updateRes.status}: ${await updateRes.text()}`);
  }

  const afterRes = await fetch(`${apiBase}/api/v1/workflows/${workflowId}`, { headers });
  if (!afterRes.ok) {
    throw new Error(`refetch failed ${afterRes.status}: ${await afterRes.text()}`);
  }
  const after = await afterRes.json();
  fs.writeFileSync(afterPath, JSON.stringify(after, null, 2));

  console.log(
    JSON.stringify(
      {
        beforePath,
        afterPath,
        active: after.active,
        versionId: after.versionId,
        versionCounter: after.versionCounter,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
