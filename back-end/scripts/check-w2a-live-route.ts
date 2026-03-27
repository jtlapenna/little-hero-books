#!/usr/bin/env tsx

import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

type WorkflowNode = {
  id?: string;
  name?: string;
  type?: string;
  parameters?: Record<string, JsonValue>;
};

type WorkflowResponse = {
  id: string;
  name: string;
  active: boolean;
  isArchived?: boolean;
  nodes?: WorkflowNode[];
};

type ProbeOptions = {
  enabled: boolean;
  payloadFile: string | null;
};

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_ENV_PATH = resolve(SCRIPT_DIR, '../../.env');
const DEFAULT_N8N_BASE = 'https://thepeakbeyond.app.n8n.cloud';
const EXPECTED_QUEUE_MANAGER_ID = 'TDwc85g03FqPf9D6';
const EXPECTED_ORCHESTRATOR_ID = 'HduzTWm0ekmrvwrn';
const EXPECTED_WEBHOOK_PATH = '2a-start-repo';

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) {
    return {};
  }

  const out: Record<string, string> = {};
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const idx = line.indexOf('=');
    if (idx === -1) {
      continue;
    }

    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }

  return out;
}

function getN8nBase(): string {
  return (
    process.env.N8N_API_URL?.trim() ||
    process.env.N8N_BASE_URL?.trim() ||
    DEFAULT_N8N_BASE
  );
}

function getN8nApiKey(): string {
  const rootEnv = parseEnvFile(ROOT_ENV_PATH);
  const apiKey = process.env.N8N_API_KEY?.trim() || rootEnv.N8N_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      `Missing N8N_API_KEY. Set it in the environment or in ${ROOT_ENV_PATH}.`,
    );
  }
  return apiKey;
}

function parseArgs(argv: string[]): ProbeOptions {
  let enabled = false;
  let payloadFile: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--probe-webhook') {
      enabled = true;
      continue;
    }
    if (arg === '--payload-file') {
      payloadFile = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  if (enabled && !payloadFile) {
    throw new Error(
      'Probe mode requires --payload-file /absolute/or/relative/path/to/disposable-payload.json.',
    );
  }

  return { enabled, payloadFile };
}

function printHelp(): void {
  console.log(
    [
      'Usage:',
      '  tsx scripts/check-w2a-live-route.ts',
      '  tsx scripts/check-w2a-live-route.ts --probe-webhook --payload-file ./payload.json',
      '',
      'Safe mode checks live n8n workflow status and configuration without triggering W2A.',
      'Probe mode intentionally POSTs the supplied payload file to 2a-start-repo.',
    ].join('\n'),
  );
}

async function fetchWorkflow(
  workflowId: string,
  n8nBase: string,
  n8nApiKey: string,
): Promise<WorkflowResponse> {
  const response = await fetch(`${n8nBase}/api/v1/workflows/${workflowId}`, {
    headers: {
      'X-N8N-API-KEY': n8nApiKey,
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `fetchWorkflow(${workflowId}) failed: ${response.status} ${text.slice(0, 300)}`,
    );
  }

  return JSON.parse(text) as WorkflowResponse;
}

function walkStrings(value: JsonValue | undefined, found: string[]): void {
  if (typeof value === 'string') {
    found.push(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      walkStrings(entry, found);
    }
    return;
  }

  if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) {
      walkStrings(entry, found);
    }
  }
}

function findNodesContaining(
  workflow: WorkflowResponse,
  expected: string,
): WorkflowNode[] {
  const nodes = workflow.nodes ?? [];
  return nodes.filter((node) => {
    const values: string[] = [];
    walkStrings(node.parameters, values);
    return values.some((value) => value.includes(expected));
  });
}

function getWebhookPaths(workflow: WorkflowResponse): string[] {
  const nodes = workflow.nodes ?? [];
  return nodes
    .filter((node) => node.type === 'n8n-nodes-base.webhook')
    .map((node) => node.parameters?.path)
    .filter((value): value is string => typeof value === 'string');
}

function fail(message: string, failures: string[]): void {
  failures.push(message);
}

function formatNodeNames(nodes: WorkflowNode[]): string {
  if (!nodes.length) {
    return '(none)';
  }

  return nodes
    .map((node) => node.name || node.id || '(unnamed)')
    .join(', ');
}

function resolvePayloadFile(path: string | null): string | null {
  if (!path) {
    return null;
  }
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

async function probeWebhook(
  webhookUrl: string,
  payloadFile: string,
): Promise<{ status: number; body: string }> {
  if (!existsSync(payloadFile)) {
    throw new Error(`Probe payload file not found: ${payloadFile}`);
  }

  const raw = readFileSync(payloadFile, 'utf8');
  const payload = JSON.parse(raw) as JsonValue;

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return {
    status: response.status,
    body: await response.text(),
  };
}

async function main(): Promise<void> {
  const probe = parseArgs(process.argv.slice(2));
  const n8nBase = getN8nBase();
  const n8nApiKey = getN8nApiKey();
  const expectedWebhookUrl = `${n8nBase}/webhook/${EXPECTED_WEBHOOK_PATH}`;

  const [queueManager, orchestrator] = await Promise.all([
    fetchWorkflow(EXPECTED_QUEUE_MANAGER_ID, n8nBase, n8nApiKey),
    fetchWorkflow(EXPECTED_ORCHESTRATOR_ID, n8nBase, n8nApiKey),
  ]);

  const failures: string[] = [];
  const orchestratorWebhookPaths = getWebhookPaths(orchestrator);
  const queueManagerWebhookNodes = findNodesContaining(
    queueManager,
    expectedWebhookUrl,
  );

  if (!queueManager.active) {
    fail(
      `Queue manager ${queueManager.id} (${queueManager.name}) is inactive.`,
      failures,
    );
  }
  if (queueManager.isArchived) {
    fail(
      `Queue manager ${queueManager.id} (${queueManager.name}) is archived.`,
      failures,
    );
  }
  if (!orchestrator.active) {
    fail(
      `Orchestrator ${orchestrator.id} (${orchestrator.name}) is inactive.`,
      failures,
    );
  }
  if (orchestrator.isArchived) {
    fail(
      `Orchestrator ${orchestrator.id} (${orchestrator.name}) is archived.`,
      failures,
    );
  }
  if (!orchestratorWebhookPaths.includes(EXPECTED_WEBHOOK_PATH)) {
    fail(
      `Orchestrator ${orchestrator.id} is missing webhook path ${EXPECTED_WEBHOOK_PATH}. Found: ${orchestratorWebhookPaths.join(', ') || '(none)'}.`,
      failures,
    );
  }
  if (!queueManagerWebhookNodes.length) {
    fail(
      `Queue manager ${queueManager.id} does not reference ${expectedWebhookUrl}.`,
      failures,
    );
  }

  console.log(`n8n base: ${n8nBase}`);
  console.log(
    `Queue manager: ${queueManager.id} | ${queueManager.name} | active=${queueManager.active} | archived=${queueManager.isArchived === true}`,
  );
  console.log(
    `Orchestrator: ${orchestrator.id} | ${orchestrator.name} | active=${orchestrator.active} | archived=${orchestrator.isArchived === true}`,
  );
  console.log(
    `Orchestrator webhook paths: ${orchestratorWebhookPaths.join(', ') || '(none)'}`,
  );
  console.log(
    `Queue manager nodes referencing ${EXPECTED_WEBHOOK_PATH}: ${formatNodeNames(queueManagerWebhookNodes)}`,
  );

  if (probe.enabled) {
    const payloadFile = resolvePayloadFile(probe.payloadFile);
    if (!payloadFile) {
      throw new Error('Probe mode enabled without a payload file.');
    }

    console.log(
      `Probe mode enabled. Posting payload from ${payloadFile} to ${expectedWebhookUrl}.`,
    );
    const result = await probeWebhook(expectedWebhookUrl, payloadFile);
    console.log(`Webhook probe response: ${result.status} ${result.body}`);

    if (result.status !== 200 || result.body.trim() !== '{"status":"accepted"}') {
      fail(
        `Webhook probe expected 200 {"status":"accepted"} but received ${result.status} ${result.body}.`,
        failures,
      );
    }
  } else {
    console.log(
      'Safe mode only: webhook was not called. Use --probe-webhook --payload-file <disposable.json> for an intentional live ack check.',
    );
  }

  if (failures.length) {
    console.error('\nW2A live route preflight FAILED:');
    for (const entry of failures) {
      console.error(`- ${entry}`);
    }
    process.exit(1);
  }

  console.log('\nW2A live route preflight passed.');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`W2A live route preflight failed: ${message}`);
  process.exit(1);
});
