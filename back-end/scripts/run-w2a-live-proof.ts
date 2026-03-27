#!/usr/bin/env tsx

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { putObject } from '@/lib/r2-client';
import { supabase } from '@/lib/supabase-client';

type ExecutionListEntry = {
  id: string;
  finished: boolean;
  status: string;
  startedAt: string;
  stoppedAt?: string;
  workflowId: string;
};

type JsonRecord = Record<string, unknown>;

const N8N_BASE = 'https://thepeakbeyond.app.n8n.cloud';
const ADMIN_BASE = 'https://admin.littleherolabs.com';
const TOP_WORKFLOW_ID = 'HduzTWm0ekmrvwrn';
const SW1_WORKFLOW_ID = 'kGob5aDJ6e5WRPh7';
const WEBHOOK_URL = `${N8N_BASE}/webhook/2a-start-repo`;
const PUBLIC_R2_URL = 'https://pub-92cec53654f84771956bc84dfea65baa.r2.dev';
const ORDERS_BUCKET =
  process.env.R2_ORDERS_BUCKET_NAME ||
  process.env.R2_ORDERS_BUCKET ||
  'little-hero-orders';
const TRIGGER_MODE =
  (process.env.W2A_PROOF_TRIGGER_MODE?.trim().toLowerCase() || 'router') ===
  'direct'
    ? 'direct'
    : 'router';

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
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

function getN8nApiKey(): string {
  const rootEnv = parseEnvFile('../.env');
  const apiKey = rootEnv.N8N_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Missing N8N_API_KEY in ../.env');
  }
  return apiKey;
}

function getBackendToken(): string {
  const token = process.env.BACKEND_API_TOKEN?.trim();
  if (!token) {
    throw new Error('Missing BACKEND_API_TOKEN in environment');
  }
  return token;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function listExecutions(
  n8nApiKey: string,
  options: {
    workflowId?: string;
    limit?: number;
  } = {},
): Promise<ExecutionListEntry[]> {
  const url = new URL(`${N8N_BASE}/api/v1/executions`);
  url.searchParams.set('limit', String(options.limit ?? 10));
  if (options.workflowId) {
    url.searchParams.set('workflowId', options.workflowId);
  }

  const response = await fetch(
    url,
    {
      headers: {
        'X-N8N-API-KEY': n8nApiKey,
      },
    },
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `listExecutions(${options.workflowId ?? 'all'}) failed: ${response.status} ${text.slice(0, 300)}`,
    );
  }

  const parsed = JSON.parse(text) as { data?: ExecutionListEntry[] };
  return parsed.data ?? [];
}

async function getExecution(
  executionId: string,
  n8nApiKey: string,
  includeData = false,
): Promise<any> {
  const response = await fetch(
    `${N8N_BASE}/api/v1/executions/${executionId}?includeData=${includeData ? 'true' : 'false'}`,
    {
      headers: {
        'X-N8N-API-KEY': n8nApiKey,
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

async function postInternalJson(
  url: string,
  body: unknown,
  backendToken: string,
): Promise<any> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${backendToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${url} failed: ${response.status} ${text.slice(0, 500)}`);
  }
  return parsed;
}

function buildDisposableInput(): {
  now: string;
  orderId: string;
  rootOrderId: string;
  characterHash: string;
  characterSpecs: JsonRecord;
  payload: JsonRecord;
} {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const orderId = `W2A-TOP-PROD-${stamp}`;
  const rootOrderId = orderId;
  const now = new Date().toISOString();

  const customerEmail = 'jeff.lapenna+codex-w2a-proof@gmail.com';
  const customerName = 'Jeff LaPenna';
  const shippingAddress = {
    name: customerName,
    address: '12207 Sunset Ave.',
    city: 'Grass Valley',
    state: 'CA',
    zip: '95945',
    country: 'US',
    phone: '+1-678-478-3477',
  };
  const characterSpecs = {
    childName: 'Avery',
    age: 5,
    pronouns: 'she/her',
    skinTone: 'medium',
    hairColor: 'medium-brown',
    hairStyle: 'straight-short',
    favoriteColor: 'green',
    animalGuide: 'fox',
    clothingStyle: 'dress',
  };
  const bookSpecs = {
    title: 'Avery and the Adventure Compass',
    totalPages: 16,
    format: '8.5x8.5_softcover',
    bookType: 'adventure',
  };

  const sortedSpecs = Object.keys(characterSpecs)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = (characterSpecs as Record<string, unknown>)[key];
      return acc;
    }, {});
  const characterHash = createHash('md5')
    .update(JSON.stringify({ ...sortedSpecs, orderId }))
    .digest('hex')
    .substring(0, 16);

  return {
    now,
    orderId,
    rootOrderId,
    characterHash,
    characterSpecs,
    payload: {
      id: orderId,
      orderId,
      rootOrderId,
      root_order_id: rootOrderId,
      amazonOrderId: rootOrderId,
      amazon_order_id: rootOrderId,
      marketplaceId: 'ATVPDKIKX0DER',
      orderDate: now,
      purchaseDate: now,
      customerEmail,
      buyer: { email: customerEmail, name: customerName },
      shippingAddress,
      characterSpecs,
      character_specs: characterSpecs,
      bookSpecs,
      book_specs: bookSpecs,
      orderDetails: { quantity: 1, shippingAddress },
      order_details: { quantity: 1, shippingAddress },
      product_info: { quantity: 1, shippingAddress },
      dedication: 'Avery! This is a disposable W2A workflow-jobs proof run.',
      items: [],
      characterHash,
      character_hash: characterHash,
      publicR2Url: PUBLIC_R2_URL,
      backendUrl: ADMIN_BASE,
      _raw: {
        id: orderId,
        orderId,
        amazonOrderId: rootOrderId,
        amazon_order_id: rootOrderId,
        rootOrderId,
        root_order_id: rootOrderId,
        marketplaceId: 'ATVPDKIKX0DER',
        characterHash,
        character_hash: characterHash,
      },
    },
  };
}

function summarizeExecution(execution: any): JsonRecord | null {
  if (!execution) {
    return null;
  }

  return {
    id: execution.id,
    finished: execution.finished,
    status: execution.status,
    lastNodeExecuted: execution.data?.resultData?.lastNodeExecuted ?? null,
    error: execution.data?.resultData?.error ?? null,
    startedAt: execution.startedAt,
    stoppedAt: execution.stoppedAt ?? null,
  };
}

async function main(): Promise<void> {
  const n8nApiKey = getN8nApiKey();
  const backendToken = getBackendToken();
  const { now, orderId, rootOrderId, characterHash, characterSpecs, payload } =
    buildDisposableInput();

  console.log(
    JSON.stringify({
      step: 'setup',
      orderId,
      rootOrderId,
      characterHash,
      hairStyle: characterSpecs.hairStyle,
      triggerMode: TRIGGER_MODE,
    }),
  );

  // The workflow-scoped executions endpoint can miss still-running parents.
  // Use the recent global feed and filter locally so we can see the top-level
  // W2A execution as soon as it starts.
  const recentBefore = await listExecutions(n8nApiKey, { limit: 100 });
  const beforeTopIds = new Set(
    recentBefore
      .filter((execution) => execution.workflowId === TOP_WORKFLOW_ID)
      .map((execution) => execution.id),
  );
  const beforeSw1Ids = new Set(
    recentBefore
      .filter((execution) => execution.workflowId === SW1_WORKFLOW_ID)
      .map((execution) => execution.id),
  );

  const buildResponse = await postInternalJson(
    `${ADMIN_BASE}/api/internal/w0/build-manifest`,
    payload,
    backendToken,
  );
  await putObject(
    ORDERS_BUCKET,
    String(buildResponse.r2Key),
    JSON.stringify(buildResponse.manifest, null, 2),
    'application/json',
  );
  const upsertResponse = await postInternalJson(
    `${ADMIN_BASE}/api/internal/w0/upsert-order`,
    buildResponse,
    backendToken,
  );

  console.log(
    JSON.stringify({
      step: 'w0-state-created',
      manifestKey: buildResponse.r2Key,
      bookId: buildResponse.bookId,
      formatId: buildResponse.formatId,
      wasInsert: upsertResponse.wasInsert,
      rowId: upsertResponse.record?.id ?? upsertResponse.id ?? null,
    }),
  );

  if (TRIGGER_MODE === 'direct') {
    const webhookPayload = {
      ...payload,
      next_workflow: '2A',
      status: 'queued_for_processing',
      workflow_step: 'order_intake',
      oneManifestUrl: buildResponse.r2Key,
      one_manifest_url: buildResponse.r2Key,
      includeZeroPose: false,
      allowZeroPose: false,
      testMode: false,
      __testMode: false,
      workflow: '2A',
    };

    const webhookResponse = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': `${orderId}-2a-proof`,
      },
      body: JSON.stringify(webhookPayload),
    });
    const webhookText = await webhookResponse.text();
    console.log(
      JSON.stringify({
        step: 'webhook-triggered',
        triggerMode: TRIGGER_MODE,
        status: webhookResponse.status,
        body: webhookText.slice(0, 200),
      }),
    );
    if (!webhookResponse.ok) {
      throw new Error(`Webhook trigger failed: ${webhookResponse.status} ${webhookText}`);
    }
  } else {
    console.log(
      JSON.stringify({
        step: 'webhook-skipped',
        triggerMode: TRIGGER_MODE,
        reason: 'waiting for live queue/router to enqueue the repo-centric 2A workflow',
      }),
    );
  }

  let topExecution: ExecutionListEntry | null = null;
  let sw1Execution: ExecutionListEntry | null = null;
  const deadline = Date.now() + 8 * 60 * 1000;

  while (Date.now() < deadline) {
    const recentExecutions = await listExecutions(n8nApiKey, { limit: 100 });
    const topList = recentExecutions.filter(
      (execution) => execution.workflowId === TOP_WORKFLOW_ID,
    );
    const sw1List = recentExecutions.filter(
      (execution) => execution.workflowId === SW1_WORKFLOW_ID,
    );

    if (!topExecution) {
      topExecution =
        topList.find(
          (execution) =>
            !beforeTopIds.has(execution.id) && execution.startedAt >= now,
        ) ?? null;
    }

    if (!sw1Execution) {
      sw1Execution =
        sw1List.find(
          (execution) =>
            !beforeSw1Ids.has(execution.id) && execution.startedAt >= now,
        ) ?? null;
    }

    const orderCheck = await supabase
      .from('orders')
      .select(
        'id,orderId,manifest_2a_url,execution_status,current_workflow,workflow_step,updated_at',
      )
      .eq('orderId', orderId)
      .maybeSingle();
    if (orderCheck.error) {
      throw orderCheck.error;
    }

    const jobCheck = await supabase
      .from('workflow_jobs')
      .select(
        'id,status,attempt_count,created_at,updated_at,external_provider,external_request_id,logical_key',
      )
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });
    if (jobCheck.error) {
      throw jobCheck.error;
    }

    const jobIds = (jobCheck.data ?? []).map((job) => job.id);
    const eventsCheck = jobIds.length
      ? await supabase
          .from('workflow_job_events')
          .select('id,event_type,created_at,job_id')
          .in('job_id', jobIds)
          .order('created_at', { ascending: false })
          .limit(20)
      : { data: [], error: null };
    if (eventsCheck.error) {
      throw eventsCheck.error;
    }

    const eventTrail = (eventsCheck.data ?? []).map((event) => event.event_type);

    console.log(
      JSON.stringify({
        step: 'poll',
        topExecutionId: topExecution?.id ?? null,
        topFinished: topExecution?.finished === true,
        topStatus: topExecution?.status ?? null,
        sw1ExecutionId: sw1Execution?.id ?? null,
        sw1Finished: sw1Execution?.finished === true,
        sw1Status: sw1Execution?.status ?? null,
        orderStatus: orderCheck.data
          ? {
              manifest2aUrl: orderCheck.data.manifest_2a_url,
              executionStatus: orderCheck.data.execution_status,
              currentWorkflow: orderCheck.data.current_workflow,
              workflowStep: orderCheck.data.workflow_step,
              updatedAt: orderCheck.data.updated_at,
            }
          : null,
        jobCount: (jobCheck.data ?? []).length,
        jobStatuses: (jobCheck.data ?? []).map((job) => ({
          id: job.id,
          status: job.status,
          logicalKey: job.logical_key,
          externalRequestId: job.external_request_id,
        })),
        eventTrail,
      }),
    );

    if (
      orderCheck.data?.manifest_2a_url ||
      orderCheck.data?.execution_status === 'done' ||
      topExecution?.finished === true ||
      eventTrail.includes('provider-failed') ||
      eventTrail.includes('completed') ||
      eventTrail.includes('failed')
    ) {
      if (
        orderCheck.data?.manifest_2a_url ||
        orderCheck.data?.execution_status === 'done' ||
        eventTrail.includes('provider-failed') ||
        eventTrail.includes('failed') ||
        topExecution?.status === 'error' ||
        topExecution?.status === 'crashed'
      ) {
        break;
      }
    }

    await sleep(4000);
  }

  const fullTopExecution = topExecution
    ? await getExecution(topExecution.id, n8nApiKey, true)
    : null;
  const fullSw1Execution = sw1Execution
    ? await getExecution(sw1Execution.id, n8nApiKey, true)
    : null;

  const orderRow = await supabase
    .from('orders')
    .select(
      'id, orderId, root_order_id, amazon_order_id, one_manifest_url, manifest_2a_url, execution_status, current_workflow, workflow_step, character_hash, updated_at',
    )
    .eq('orderId', orderId)
    .maybeSingle();
  if (orderRow.error) {
    throw orderRow.error;
  }

  const jobs = await supabase
    .from('workflow_jobs')
    .select(
      'id,job_type,stage,order_id,logical_key,status,attempt_count,external_provider,external_request_id,external_status_url,created_at,updated_at,started_at,completed_at,failed_at',
    )
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });
  if (jobs.error) {
    throw jobs.error;
  }

  const jobIds = (jobs.data ?? []).map((job) => job.id);
  const attempts = jobIds.length
    ? await supabase
        .from('workflow_job_attempts')
        .select(
          'id,job_id,attempt,status,worker_kind,provider_request_id,provider_status_url,started_at,ended_at,error_message,updated_at',
        )
        .in('job_id', jobIds)
        .order('created_at', { ascending: true })
    : { data: [], error: null };
  if (attempts.error) {
    throw attempts.error;
  }

  const events = jobIds.length
    ? await supabase
        .from('workflow_job_events')
        .select('id,job_id,attempt_id,event_type,payload,created_at')
        .in('job_id', jobIds)
        .order('created_at', { ascending: true })
    : { data: [], error: null };
  if (events.error) {
    throw events.error;
  }

  console.log(
    JSON.stringify({
      step: 'final',
      orderId,
      topExecution: summarizeExecution(fullTopExecution),
      sw1Execution: summarizeExecution(fullSw1Execution),
      orderRow: orderRow.data ?? null,
      jobs: jobs.data ?? [],
      attempts: attempts.data ?? [],
      events:
        (events.data ?? []).map((event) => ({
          id: event.id,
          jobId: event.job_id,
          attemptId: event.attempt_id,
          eventType: event.event_type,
          createdAt: event.created_at,
          payload: event.payload,
        })) ?? [],
    }),
  );
}

main().catch((error) => {
  console.error('[run-w2a-live-proof] failure:', error);
  process.exitCode = 1;
});
