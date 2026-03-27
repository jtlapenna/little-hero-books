#!/usr/bin/env tsx

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
  updatedAt?: string | null;
  createdAt?: string | null;
  versionId?: string | null;
  activeVersionId?: string | null;
  versionCounter?: number | null;
  triggerCount?: number | null;
  isArchived?: boolean;
  nodes?: WorkflowNode[];
  settings?: Record<string, JsonValue> | null;
};

type ExecutionResponse = {
  data?: Array<{
    id?: string;
    status?: string;
    mode?: string;
    startedAt?: string;
    stoppedAt?: string;
    finished?: boolean;
    workflowId?: string;
  }>;
};

type MonitorOptions = {
  pollMs: number;
  durationMs: number;
  once: boolean;
  untilChange: boolean;
  executionLimit: number;
  outputDir: string;
};

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_ENV_PATH = resolve(SCRIPT_DIR, "../../.env");
const DEFAULT_N8N_BASE = "https://thepeakbeyond.app.n8n.cloud";
const W2A_ORCHESTRATOR_ID = "HduzTWm0ekmrvwrn";
const QUEUE_MANAGER_ID = "TDwc85g03FqPf9D6";
const EXPECTED_WEBHOOK_PATH = "2a-start-repo";

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) {
    return {};
  }

  const out: Record<string, string> = {};
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const idx = line.indexOf("=");
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

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultOutputDir(): string {
  return resolve(
    SCRIPT_DIR,
    `../../docs/n8n-workflow-files/repo-centric/live-backups/${todayStamp()}`,
  );
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function parseArgs(argv: string[]): MonitorOptions {
  let pollMs = 30_000;
  let durationMs = 30 * 60_000;
  let once = false;
  let untilChange = false;
  let executionLimit = 10;
  let outputDir = defaultOutputDir();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--poll-seconds") {
      pollMs = parseNumber(argv[index + 1], 30) * 1_000;
      index += 1;
      continue;
    }
    if (arg === "--duration-minutes") {
      durationMs = parseNumber(argv[index + 1], 30) * 60_000;
      index += 1;
      continue;
    }
    if (arg === "--execution-limit") {
      executionLimit = parseNumber(argv[index + 1], 10);
      index += 1;
      continue;
    }
    if (arg === "--out-dir") {
      const raw = argv[index + 1] ?? defaultOutputDir();
      outputDir = isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
      index += 1;
      continue;
    }
    if (arg === "--once") {
      once = true;
      continue;
    }
    if (arg === "--until-change") {
      untilChange = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return {
    pollMs,
    durationMs,
    once,
    untilChange,
    executionLimit,
    outputDir,
  };
}

function printHelp(): void {
  console.log(
    [
      "Usage:",
      "  tsx scripts/watch-w2a-activation.ts",
      "  tsx scripts/watch-w2a-activation.ts --once",
      "  tsx scripts/watch-w2a-activation.ts --duration-minutes 240 --until-change",
      "",
      "Watches the live W2A orchestrator activation state and writes JSON evidence",
      "snapshots when the activation-related state changes.",
    ].join("\n"),
  );
}

async function fetchJson<T>(
  url: string,
  n8nApiKey: string,
): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "X-N8N-API-KEY": n8nApiKey,
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${url} failed: ${response.status} ${text.slice(0, 300)}`);
  }

  return JSON.parse(text) as T;
}

function walkStrings(value: JsonValue | undefined, found: string[]): void {
  if (typeof value === "string") {
    found.push(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      walkStrings(entry, found);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) {
      walkStrings(entry, found);
    }
  }
}

function findNodesContaining(
  workflow: WorkflowResponse,
  expected: string,
): string[] {
  const nodes = workflow.nodes ?? [];
  return nodes
    .filter((node) => {
      const values: string[] = [];
      walkStrings(node.parameters, values);
      return values.some((value) => value.includes(expected));
    })
    .map((node) => node.name || node.id || "(unnamed)");
}

function getWebhookPaths(workflow: WorkflowResponse): string[] {
  return (workflow.nodes ?? [])
    .filter((node) => node.type === "n8n-nodes-base.webhook")
    .map((node) => node.parameters?.path)
    .filter((value): value is string => typeof value === "string");
}

function workflowSummary(workflow: WorkflowResponse) {
  return {
    id: workflow.id,
    name: workflow.name,
    active: workflow.active,
    isArchived: workflow.isArchived ?? false,
    updatedAt: workflow.updatedAt ?? null,
    createdAt: workflow.createdAt ?? null,
    versionId: workflow.versionId ?? null,
    activeVersionId: workflow.activeVersionId ?? null,
    versionCounter: workflow.versionCounter ?? null,
    triggerCount: workflow.triggerCount ?? null,
    settings: workflow.settings ?? null,
  };
}

function executionSummary(executions: ExecutionResponse) {
  return (executions.data ?? []).map((execution) => ({
    id: execution.id ?? null,
    status: execution.status ?? null,
    mode: execution.mode ?? null,
    startedAt: execution.startedAt ?? null,
    stoppedAt: execution.stoppedAt ?? null,
    finished: execution.finished ?? null,
    workflowId: execution.workflowId ?? null,
  }));
}

function fingerprint(workflow: WorkflowResponse): string {
  return JSON.stringify({
    active: workflow.active,
    isArchived: workflow.isArchived ?? false,
    updatedAt: workflow.updatedAt ?? null,
    versionId: workflow.versionId ?? null,
    activeVersionId: workflow.activeVersionId ?? null,
    versionCounter: workflow.versionCounter ?? null,
  });
}

function isoStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function writeSnapshot(
  outputDir: string,
  label: string,
  payload: Record<string, unknown>,
): string {
  mkdirSync(outputDir, { recursive: true });
  const target = resolve(
    outputDir,
    `w2A-Orchestrator.activation-monitor.${label}-${isoStamp()}.json`,
  );
  writeFileSync(target, JSON.stringify(payload, null, 2));
  return target;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function capture(
  n8nBase: string,
  n8nApiKey: string,
  executionLimit: number,
): Promise<Record<string, unknown>> {
  const [orchestrator, queueManager, orchestratorExecutions, queueExecutions] =
    await Promise.all([
      fetchJson<WorkflowResponse>(
        `${n8nBase}/api/v1/workflows/${W2A_ORCHESTRATOR_ID}`,
        n8nApiKey,
      ),
      fetchJson<WorkflowResponse>(
        `${n8nBase}/api/v1/workflows/${QUEUE_MANAGER_ID}`,
        n8nApiKey,
      ),
      fetchJson<ExecutionResponse>(
        `${n8nBase}/api/v1/executions?workflowId=${W2A_ORCHESTRATOR_ID}&limit=${executionLimit}`,
        n8nApiKey,
      ),
      fetchJson<ExecutionResponse>(
        `${n8nBase}/api/v1/executions?workflowId=${QUEUE_MANAGER_ID}&limit=${executionLimit}`,
        n8nApiKey,
      ),
    ]);

  return {
    capturedAt: new Date().toISOString(),
    n8nBase,
    orchestrator: {
      ...workflowSummary(orchestrator),
      webhookPaths: getWebhookPaths(orchestrator),
    },
    queueManager: {
      ...workflowSummary(queueManager),
      nodesReferencingWebhookPath: findNodesContaining(
        queueManager,
        EXPECTED_WEBHOOK_PATH,
      ),
      nodesReferencingOrchestratorId: findNodesContaining(
        queueManager,
        W2A_ORCHESTRATOR_ID,
      ),
    },
    recentExecutions: {
      orchestrator: executionSummary(orchestratorExecutions),
      queueManager: executionSummary(queueExecutions),
    },
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const n8nBase = getN8nBase();
  const n8nApiKey = getN8nApiKey();

  const initial = await capture(n8nBase, n8nApiKey, options.executionLimit);
  const initialPath = writeSnapshot(options.outputDir, "baseline", initial);
  const orchestrator = initial.orchestrator as WorkflowResponse;
  let lastFingerprint = fingerprint(orchestrator);

  console.log(
    [
      `Monitoring ${W2A_ORCHESTRATOR_ID} on ${n8nBase}`,
      `Baseline: ${initialPath}`,
      `active=${orchestrator.active} versionCounter=${orchestrator.versionCounter ?? "?"} activeVersionId=${orchestrator.activeVersionId ?? "null"} updatedAt=${orchestrator.updatedAt ?? "null"}`,
    ].join("\n"),
  );

  if (options.once) {
    return;
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < options.durationMs) {
    await sleep(options.pollMs);
    const current = await capture(n8nBase, n8nApiKey, options.executionLimit);
    const currentWorkflow = current.orchestrator as WorkflowResponse;
    const currentFingerprint = fingerprint(currentWorkflow);

    if (currentFingerprint !== lastFingerprint) {
      const changePath = writeSnapshot(options.outputDir, "change", current);
      console.log(
        [
          `Detected activation-state change.`,
          `Snapshot: ${changePath}`,
          `active=${currentWorkflow.active} versionCounter=${currentWorkflow.versionCounter ?? "?"} activeVersionId=${currentWorkflow.activeVersionId ?? "null"} updatedAt=${currentWorkflow.updatedAt ?? "null"}`,
        ].join("\n"),
      );
      lastFingerprint = currentFingerprint;
      if (options.untilChange) {
        return;
      }
    }
  }

  console.log("No activation-state change detected during watch window.");
}

main().catch((error) => {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(message);
  process.exit(1);
});
