#!/usr/bin/env tsx

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  resolveW2APoseWorkflowReplay,
  type WorkflowJobRecord,
} from "@/lib/workflow-jobs";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

type JsonRecord = Record<string, unknown>;

type CliOptions = {
  apply: boolean;
  executionLimit: number;
  orderId: string;
  waitSeconds: number;
};

type ExecutionListEntry = {
  id: string;
  finished: boolean;
  status: string;
  startedAt: string;
  stoppedAt?: string | null;
  workflowId: string;
};

type WorkflowResponse = {
  id: string;
  name: string;
  active: boolean;
  isArchived?: boolean;
};

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_ENV_PATH = resolve(SCRIPT_DIR, "../../.env");
const DEFAULT_N8N_BASE = "https://thepeakbeyond.app.n8n.cloud";
const TOP_WORKFLOW_ID = "HduzTWm0ekmrvwrn";
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

function getEnv(): Record<string, string> {
  return {
    ...parseEnvFile(ROOT_ENV_PATH),
    ...process.env,
  };
}

function requireEnv(name: string, env: Record<string, string>): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}. Set it in the environment or in ${ROOT_ENV_PATH}.`);
  }
  return value;
}

function getN8nBase(env: Record<string, string>): string {
  return (
    env.N8N_API_URL?.trim() ||
    env.N8N_BASE_URL?.trim() ||
    DEFAULT_N8N_BASE
  );
}

function getN8nApiKey(env: Record<string, string>): string {
  return requireEnv("N8N_API_KEY", env);
}

function getSupabaseServiceRoleKey(env: Record<string, string>): string {
  return (
    env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    ""
  );
}

function createSupabase(env: Record<string, string>) {
  const url = requireEnv("SUPABASE_URL", env);
  const serviceRoleKey = getSupabaseServiceRoleKey(env);
  if (!serviceRoleKey) {
    throw new Error(
      `Missing SUPABASE_SERVICE_ROLE_KEY. Set it in the environment or in ${ROOT_ENV_PATH}.`,
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function parseArgs(argv: string[]): CliOptions {
  let apply = false;
  let executionLimit = 40;
  let orderId: string | null = null;
  let waitSeconds = 20;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--limit") {
      executionLimit = Math.max(
        1,
        Number.parseInt(argv[index + 1] ?? "40", 10) || 40,
      );
      index += 1;
      continue;
    }
    if (arg === "--wait-seconds") {
      waitSeconds = Math.max(
        0,
        Number.parseInt(argv[index + 1] ?? "20", 10) || 20,
      );
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    if (orderId) {
      throw new Error(`Only one orderId is supported per run. Unexpected extra argument: ${arg}`);
    }
    orderId = arg.trim();
  }

  if (!orderId) {
    throw new Error("Usage requires a per-item orderId.");
  }

  return {
    apply,
    executionLimit,
    orderId,
    waitSeconds,
  };
}

function printHelp(): void {
  console.log(
    [
      "Usage:",
      "  tsx scripts/replay-w2a-order.ts <orderId>",
      "  tsx scripts/replay-w2a-order.ts --apply <orderId>",
      "  tsx scripts/replay-w2a-order.ts --apply --wait-seconds 30 <orderId>",
      "",
      "Dry-run mode recovers the original W2A webhook payload from n8n, verifies",
      "the live 2a-start-repo route, and reports which pose jobs will be reused",
      "versus rerun.",
      "",
      "Apply mode reposts the recovered payload to 2a-start-repo with a fresh",
      "Idempotency-Key after the same safety checks.",
    ].join("\n"),
  );
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function looksLikeReplayPayload(value: unknown): value is JsonRecord {
  if (!isRecord(value)) {
    return false;
  }

  const orderId = toTrimmedString(value.orderId);
  const rootOrderId =
    toTrimmedString(value.rootOrderId) ??
    toTrimmedString(value.root_order_id) ??
    toTrimmedString(value.amazonOrderId) ??
    toTrimmedString(value.amazon_order_id);

  return Boolean(
    orderId &&
      (rootOrderId ||
        isRecord(value.characterSpecs) ||
        isRecord(value.bookSpecs) ||
        isRecord(value.shippingAddress) ||
        isRecord(value.orderDetails)),
  );
}

function collectPayloadCandidates(
  value: unknown,
  out: JsonRecord[],
  seen: WeakSet<object>,
  depth = 0,
): void {
  if (depth > 12) {
    return;
  }

  if (looksLikeReplayPayload(value)) {
    out.push(value);
  }

  if (!isRecord(value)) {
    if (Array.isArray(value)) {
      for (const entry of value.slice(0, 50)) {
        collectPayloadCandidates(entry, out, seen, depth + 1);
      }
    }
    return;
  }

  if (seen.has(value)) {
    return;
  }
  seen.add(value);

  for (const entry of Object.values(value)) {
    if (Array.isArray(entry)) {
      for (const child of entry.slice(0, 50)) {
        collectPayloadCandidates(child, out, seen, depth + 1);
      }
      continue;
    }

    collectPayloadCandidates(entry, out, seen, depth + 1);
  }
}

function summarizeWorkflow(workflow: WorkflowResponse) {
  return {
    id: workflow.id,
    name: workflow.name,
    active: workflow.active,
    isArchived: workflow.isArchived ?? false,
  };
}

async function listExecutions(
  workflowId: string,
  n8nBase: string,
  n8nApiKey: string,
  limit: number,
): Promise<ExecutionListEntry[]> {
  const response = await fetch(
    `${n8nBase}/api/v1/executions?workflowId=${encodeURIComponent(workflowId)}&limit=${limit}`,
    {
      headers: {
        "X-N8N-API-KEY": n8nApiKey,
      },
    },
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `listExecutions(${workflowId}) failed: ${response.status} ${text.slice(0, 300)}`,
    );
  }

  const parsed = JSON.parse(text) as { data?: ExecutionListEntry[] };
  return parsed.data ?? [];
}

async function getExecution(
  executionId: string,
  n8nBase: string,
  n8nApiKey: string,
): Promise<any> {
  const response = await fetch(
    `${n8nBase}/api/v1/executions/${executionId}?includeData=true`,
    {
      headers: {
        "X-N8N-API-KEY": n8nApiKey,
      },
    },
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `getExecution(${executionId}) failed: ${response.status} ${text.slice(0, 300)}`,
    );
  }

  return JSON.parse(text);
}

async function fetchWorkflow(
  workflowId: string,
  n8nBase: string,
  n8nApiKey: string,
): Promise<WorkflowResponse> {
  const response = await fetch(`${n8nBase}/api/v1/workflows/${workflowId}`, {
    headers: {
      "X-N8N-API-KEY": n8nApiKey,
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

function extractExecutionPayload(
  execution: unknown,
  targetOrderId: string,
): JsonRecord | null {
  const matches: JsonRecord[] = [];
  collectPayloadCandidates(execution, matches, new WeakSet<object>());

  return (
    matches.find(
      (candidate) => toTrimmedString(candidate.orderId) === targetOrderId,
    ) ?? null
  );
}

async function findExecutionWithPayload(
  orderId: string,
  n8nBase: string,
  n8nApiKey: string,
  limit: number,
) {
  const executions = await listExecutions(
    TOP_WORKFLOW_ID,
    n8nBase,
    n8nApiKey,
    limit,
  );

  for (const execution of executions) {
    const fullExecution = await getExecution(execution.id, n8nBase, n8nApiKey);
    const payload = extractExecutionPayload(fullExecution, orderId);
    if (!payload) {
      continue;
    }

    return {
      listEntry: execution,
      fullExecution,
      payload,
    };
  }

  return null;
}

async function fetchStage2AJobs(
  orderId: string,
  env: Record<string, string>,
): Promise<WorkflowJobRecord[]> {
  const supabase = createSupabase(env);
  const response = await supabase
    .from("workflow_jobs")
    .select("*")
    .eq("order_id", orderId)
    .eq("stage", "2a")
    .order("logical_key", { ascending: true });

  if (response.error) {
    throw new Error(
      `workflow_jobs query failed for ${orderId}: ${response.error.message}`,
    );
  }

  return (response.data ?? []) as WorkflowJobRecord[];
}

function summarizeJobStatuses(jobs: WorkflowJobRecord[]) {
  const counts = new Map<string, number>();
  for (const job of jobs) {
    counts.set(job.status, (counts.get(job.status) ?? 0) + 1);
  }

  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

async function postReplayWebhook(
  webhookUrl: string,
  payload: JsonRecord,
  orderId: string,
): Promise<{ status: number; body: string }> {
  const idempotencyKey = `${orderId}-replay-${Date.now()}`;
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(payload),
  });

  return {
    status: response.status,
    body: await response.text(),
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const env = getEnv();
  const n8nBase = getN8nBase(env);
  const n8nApiKey = getN8nApiKey(env);
  const webhookUrl = `${n8nBase}/webhook/${EXPECTED_WEBHOOK_PATH}`;

  const [workflow, jobRows, matchedExecution] = await Promise.all([
    fetchWorkflow(TOP_WORKFLOW_ID, n8nBase, n8nApiKey),
    fetchStage2AJobs(options.orderId, env),
    findExecutionWithPayload(
      options.orderId,
      n8nBase,
      n8nApiKey,
      options.executionLimit,
    ),
  ]);

  if (!workflow.active) {
    throw new Error(
      `Top-level workflow ${TOP_WORKFLOW_ID} is not active. Refusing to replay ${options.orderId}.`,
    );
  }

  if (!matchedExecution) {
    throw new Error(
      `Could not recover an original W2A webhook payload for ${options.orderId} from the latest ${options.executionLimit} executions.`,
    );
  }

  const replayRows = await Promise.all(
    jobRows.map(async (job) => ({
      job,
      replay: await resolveW2APoseWorkflowReplay(job),
    })),
  );
  const reusableJobs = replayRows
    .filter((entry) => entry.replay)
    .map((entry) => entry.job);
  const pendingJobs = replayRows
    .filter((entry) => !entry.replay)
    .map((entry) => entry.job);

  console.log(
    JSON.stringify(
      {
        step: "dry-run",
        mode: options.apply ? "apply" : "report",
        orderId: options.orderId,
        webhookUrl,
        workflow: summarizeWorkflow(workflow),
        matchedExecution: {
          id: matchedExecution.listEntry.id,
          status: matchedExecution.listEntry.status,
          startedAt: matchedExecution.listEntry.startedAt,
          finished: matchedExecution.listEntry.finished,
          stoppedAt: matchedExecution.listEntry.stoppedAt ?? null,
        },
        payloadSummary: {
          orderId: toTrimmedString(matchedExecution.payload.orderId),
          rootOrderId:
            toTrimmedString(matchedExecution.payload.rootOrderId) ??
            toTrimmedString(matchedExecution.payload.root_order_id) ??
            toTrimmedString(matchedExecution.payload.amazonOrderId) ??
            toTrimmedString(matchedExecution.payload.amazon_order_id),
          characterHash:
            toTrimmedString(matchedExecution.payload.characterHash) ??
            toTrimmedString(matchedExecution.payload.character_hash),
          backendUrl: toTrimmedString(matchedExecution.payload.backendUrl),
          includeZeroPose: matchedExecution.payload.includeZeroPose ?? null,
        },
        workflowJobs: {
          total: jobRows.length,
          statuses: summarizeJobStatuses(jobRows),
          reusableLogicalKeys: reusableJobs.map((job) => job.logical_key),
          pendingLogicalKeys: pendingJobs.map((job) => `${job.logical_key}:${job.status}`),
        },
      },
      null,
      2,
    ),
  );

  if (!options.apply) {
    return;
  }

  const beforeExecutionIds = new Set(
    (
      await listExecutions(
        TOP_WORKFLOW_ID,
        n8nBase,
        n8nApiKey,
        options.executionLimit,
      )
    ).map((execution) => execution.id),
  );

  const webhookResponse = await postReplayWebhook(
    webhookUrl,
    matchedExecution.payload,
    options.orderId,
  );

  console.log(
    JSON.stringify(
      {
        step: "webhook-posted",
        orderId: options.orderId,
        status: webhookResponse.status,
        bodyPreview: webhookResponse.body.slice(0, 300),
      },
      null,
      2,
    ),
  );

  if (options.waitSeconds <= 0) {
    return;
  }

  const deadline = Date.now() + options.waitSeconds * 1000;
  let observedExecution: ExecutionListEntry | null = null;
  while (Date.now() < deadline) {
    const executions = await listExecutions(
      TOP_WORKFLOW_ID,
      n8nBase,
      n8nApiKey,
      options.executionLimit,
    );
    observedExecution =
      executions.find((execution) => !beforeExecutionIds.has(execution.id)) ?? null;
    if (observedExecution) {
      break;
    }

    await sleep(2000);
  }

  const refreshedJobs = await fetchStage2AJobs(options.orderId, env);
  const refreshedReplayRows = await Promise.all(
    refreshedJobs.map(async (job) => ({
      job,
      replay: await resolveW2APoseWorkflowReplay(job),
    })),
  );
  const refreshedReusableJobs = refreshedReplayRows
    .filter((entry) => entry.replay)
    .map((entry) => entry.job);
  const refreshedPendingJobs = refreshedReplayRows
    .filter((entry) => !entry.replay)
    .map((entry) => entry.job);

  console.log(
    JSON.stringify(
      {
        step: "post-apply-observation",
        orderId: options.orderId,
        newExecution: observedExecution
          ? {
              id: observedExecution.id,
              status: observedExecution.status,
              startedAt: observedExecution.startedAt,
              finished: observedExecution.finished,
              stoppedAt: observedExecution.stoppedAt ?? null,
            }
          : null,
        workflowJobs: {
          total: refreshedJobs.length,
          statuses: summarizeJobStatuses(refreshedJobs),
          reusableLogicalKeys: refreshedReusableJobs.map((job) => job.logical_key),
          pendingLogicalKeys: refreshedPendingJobs.map(
            (job) => `${job.logical_key}:${job.status}`,
          ),
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("[replay-w2a-order] failure:", error);
  process.exitCode = 1;
});
