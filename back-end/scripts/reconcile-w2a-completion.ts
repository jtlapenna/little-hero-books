#!/usr/bin/env tsx

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  buildManifestKeyCandidates,
  buildManifestKeyHintOptionsFromOrderLike,
} from "@/lib/order-paths";

type CliOptions = {
  apply: boolean;
  orderIds: string[];
};

type OrderRow = {
  id: number;
  orderId: string | null;
  root_order_id: string | null;
  amazon_order_id: string | null;
  workflow_step: string | null;
  execution_status: string | null;
  current_workflow: string | null;
  started_at: string | null;
  updated_at: string | null;
  manifest_2a_url: string | null;
  one_manifest_url: string | null;
};

type WorkflowJobRow = {
  id: number;
  logical_key: string;
  status: string;
  attempt_count: number;
  claimed_at: string | null;
  completed_at: string | null;
  updated_at: string | null;
};

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_ENV_PATH = resolve(SCRIPT_DIR, "../../.env");
const DEFAULT_ADMIN_BASE = "https://admin.littleherolabs.com";

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
  const orderIds: string[] = [];
  let apply = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown argument: ${arg}`);
    }

    orderIds.push(arg);
  }

  if (!orderIds.length) {
    throw new Error("Provide at least one per-item orderId.");
  }

  return {
    apply,
    orderIds,
  };
}

function printHelp(): void {
  console.log(
    [
      "Usage:",
      "  tsx scripts/reconcile-w2a-completion.ts <orderId> [more-orderIds...]",
      "  tsx scripts/reconcile-w2a-completion.ts --apply <orderId> [more-orderIds...]",
      "",
      "Dry-run mode reports whether a W2A order is safe to finalize.",
      "Apply mode calls the existing workflow-2a-complete webhook only when",
      "all W2A workflow_jobs succeeded and a 2A manifest URL is reachable.",
    ].join("\n"),
  );
}

function summarizeStatuses(jobs: WorkflowJobRow[]) {
  const counts = new Map<string, number>();
  for (const job of jobs) {
    counts.set(job.status, (counts.get(job.status) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

async function fetchOrderRow(
  orderId: string,
  env: Record<string, string>,
): Promise<OrderRow | null> {
  const supabase = createSupabase(env);

  const response = await supabase
    .from("orders")
    .select(
      "id, orderId, root_order_id, amazon_order_id, workflow_step, execution_status, current_workflow, started_at, updated_at, manifest_2a_url, one_manifest_url",
    )
    .eq("orderId", orderId)
    .maybeSingle();

  if (response.error) {
    throw new Error(`orders query failed for ${orderId}: ${response.error.message}`);
  }

  return response.data ?? null;
}

async function fetchWorkflowJobs(
  orderId: string,
  env: Record<string, string>,
): Promise<WorkflowJobRow[]> {
  const supabase = createSupabase(env);

  const response = await supabase
    .from("workflow_jobs")
    .select(
      "id, logical_key, status, attempt_count, claimed_at, completed_at, updated_at",
    )
    .eq("order_id", orderId)
    .eq("stage", "2a")
    .order("id", { ascending: true });

  if (response.error) {
    throw new Error(
      `workflow_jobs query failed for ${orderId}: ${response.error.message}`,
    );
  }

  return (response.data ?? []) as WorkflowJobRow[];
}

async function resolveManifestUrl(
  orderId: string,
  orderRow: OrderRow,
  adminBase: string,
): Promise<string | null> {
  const pathLikes = [
    orderRow.manifest_2a_url,
    orderRow.one_manifest_url,
    ...buildManifestKeyHintOptionsFromOrderLike(orderRow).pathLikes,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  const candidateKeys = buildManifestKeyCandidates(orderId, "2a", {
    ...buildManifestKeyHintOptionsFromOrderLike(orderRow),
    pathLikes,
  });

  for (const key of candidateKeys) {
    const url = `${adminBase}/api/manifests/${key}`;
    const response = await fetch(url, { redirect: "follow" });
    if (response.ok) {
      return url;
    }
  }

  return null;
}

async function finalizeW2AOrder(options: {
  adminBase: string;
  backendToken: string;
  orderId: string;
  rootOrderId: string | null;
  manifestUrl: string;
  posesGenerated: number;
}): Promise<unknown> {
  const response = await fetch(
    `${options.adminBase}/api/webhooks/workflow-2a-complete`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.backendToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        orderId: options.orderId,
        manifestUrl: options.manifestUrl,
        amazonOrderId: options.rootOrderId ?? undefined,
        posesGenerated: options.posesGenerated,
        needsReview: false,
      }),
    },
  );

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(
      `workflow-2a-complete failed for ${options.orderId}: ${response.status} ${text.slice(0, 500)}`,
    );
  }
  return parsed;
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  const env = getEnv();
  const adminBase =
    env.ADMIN_BASE_URL?.trim() || env.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_ADMIN_BASE;
  const backendToken = requireEnv("BACKEND_API_TOKEN", env);
  createSupabase(env);

  let hadFailure = false;

  for (const orderId of cli.orderIds) {
    console.log(`\n== ${orderId} ==`);

    const orderRow = await fetchOrderRow(orderId, env);
    if (!orderRow) {
      hadFailure = true;
      console.log("order row: missing");
      continue;
    }

    const jobs = await fetchWorkflowJobs(orderId, env);
    const manifestUrl = await resolveManifestUrl(orderId, orderRow, adminBase);
    const statusCounts = summarizeStatuses(jobs);
    const allSucceeded = jobs.length > 0 && jobs.every((job) => job.status === "succeeded");
    const alreadyCompleted =
      orderRow.workflow_step === "2A-complete" && Boolean(orderRow.manifest_2a_url);
    const safeToFinalize = !alreadyCompleted && allSucceeded && Boolean(manifestUrl);

    console.log(
      JSON.stringify(
        {
          orderRow: {
            id: orderRow.id,
            orderId: orderRow.orderId,
            rootOrderId: orderRow.root_order_id,
            workflowStep: orderRow.workflow_step,
            executionStatus: orderRow.execution_status,
            currentWorkflow: orderRow.current_workflow,
            manifest2aUrl: orderRow.manifest_2a_url,
            oneManifestUrl: orderRow.one_manifest_url,
            updatedAt: orderRow.updated_at,
          },
          workflowJobs: {
            count: jobs.length,
            statuses: statusCounts,
          },
          manifestUrl,
          safeToFinalize,
          applyRequested: cli.apply,
        },
        null,
        2,
      ),
    );

    if (!cli.apply) {
      continue;
    }

    if (!safeToFinalize) {
      hadFailure = true;
      console.log("apply: skipped");
      continue;
    }

    const result = await finalizeW2AOrder({
      adminBase,
      backendToken,
      orderId,
      rootOrderId: orderRow.root_order_id ?? orderRow.amazon_order_id,
      manifestUrl: manifestUrl!,
      posesGenerated: jobs.length,
    });

    const refreshed = await fetchOrderRow(orderId, env);
    console.log(
      JSON.stringify(
        {
          apply: "completed",
          completionResponse: result,
          refreshedOrderRow: refreshed
            ? {
                id: refreshed.id,
                orderId: refreshed.orderId,
                workflowStep: refreshed.workflow_step,
                executionStatus: refreshed.execution_status,
                currentWorkflow: refreshed.current_workflow,
                manifest2aUrl: refreshed.manifest_2a_url,
                updatedAt: refreshed.updated_at,
              }
            : null,
        },
        null,
        2,
      ),
    );
  }

  if (hadFailure) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
