import { createClient } from '@supabase/supabase-js';
import {
  getObject,
  listObjects,
  putObject,
  R2_ORDERS_BUCKET,
} from '@/lib/r2-client';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonRecord = { [key: string]: JsonValue };

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

function assertEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

const supabase = createClient(
  assertEnv(supabaseUrl, 'SUPABASE_URL'),
  assertEnv(supabaseKey, 'SUPABASE_SERVICE_ROLE_KEY'),
);

function toRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function deepReplace(
  value: JsonValue,
  replacements: Array<[string, string]>,
): JsonValue {
  if (typeof value === 'string') {
    let next = value;
    for (const [from, to] of replacements) {
      next = next.split(from).join(to);
    }
    return next;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => deepReplace(entry, replacements));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, deepReplace(entry, replacements)]),
    );
  }

  return value;
}

function deriveNewOrderId(sourceOrderId: string, newRootGroupId: string): string {
  const itemMatch = sourceOrderId.match(/-item-(\d+)$/i);
  if (!itemMatch) {
    throw new Error(`Could not derive sibling item suffix from ${sourceOrderId}`);
  }
  return `${newRootGroupId}-item-${itemMatch[1]}`;
}

async function copyPrefix(
  sourceOrderId: string,
  newOrderId: string,
  sourceRootGroupId: string,
  newRootGroupId: string,
) {
  const sourcePrefix = `book-mvp-simple-adventure/orders/${sourceOrderId}/`;
  const targetPrefix = `book-mvp-simple-adventure/orders/${newOrderId}/`;
  const replacements: Array<[string, string]> = [
    [sourceOrderId, newOrderId],
    [sourceRootGroupId, newRootGroupId],
    [sourcePrefix, targetPrefix],
  ];

  const listed = await listObjects(R2_ORDERS_BUCKET, { prefix: sourcePrefix, maxKeys: 500 });
  const objects = listed.Contents || [];
  if (!objects.length) {
    throw new Error(`No R2 objects found under ${sourcePrefix}`);
  }

  for (const object of objects) {
    const sourceKey = object.Key;
    const targetKey = sourceKey
      .replace(sourcePrefix, targetPrefix)
      .split(sourceOrderId)
      .join(newOrderId)
      .split(sourceRootGroupId)
      .join(newRootGroupId);

    const response = await getObject(R2_ORDERS_BUCKET, sourceKey);
    const contentType = response.headers.get('content-type') || undefined;

    if (sourceKey.endsWith('.json')) {
      const text = await response.text();
      const parsed = JSON.parse(text) as JsonValue;
      const replaced = deepReplace(parsed, replacements);
      await putObject(
        R2_ORDERS_BUCKET,
        targetKey,
        `${JSON.stringify(replaced, null, 2)}\n`,
        'application/json',
      );
      continue;
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    await putObject(R2_ORDERS_BUCKET, targetKey, bytes, contentType);
  }
}

async function main() {
  const sourceRootGroupId = process.argv[2];
  const newRootGroupId = process.argv[3];
  if (!sourceRootGroupId || !newRootGroupId) {
    throw new Error(
      'usage: tsx scripts/ops-clone-w41-group.ts <sourceRootGroupId> <newRootGroupId>',
    );
  }

  const { data: sourceRows, error: sourceError } = await supabase
    .from('orders')
    .select('*')
    .eq('root_order_id', sourceRootGroupId)
    .order('orderId', { ascending: true });
  if (sourceError) throw sourceError;
  if (!sourceRows || sourceRows.length < 2) {
    throw new Error(`Expected at least 2 sibling rows for ${sourceRootGroupId}`);
  }

  const now = new Date().toISOString();
  const clonedRows = [] as JsonRecord[];

  for (const rawRow of sourceRows as JsonRecord[]) {
    const sourceOrderId = String(rawRow.orderId || '');
    const newOrderId = deriveNewOrderId(sourceOrderId, newRootGroupId);

    await copyPrefix(sourceOrderId, newOrderId, sourceRootGroupId, newRootGroupId);

    const replaced = toRecord(
      deepReplace(rawRow, [
        [sourceOrderId, newOrderId],
        [sourceRootGroupId, newRootGroupId],
      ]),
    );

    delete replaced.id;

    clonedRows.push({
      ...replaced,
      orderId: newOrderId,
      amazonOrderId: newRootGroupId,
      amazon_order_id: newRootGroupId,
      root_order_id: newRootGroupId,
      processing_id: null,
      status: 'pending_print',
      workflow_step: 'print_fulfillment',
      next_workflow: '4.1',
      current_workflow: '4.1',
      execution_status: 'ready_for_processing',
      order_status: 'processing',
      lulu_job_id: null,
      lulu_status: null,
      print_submitted_at: null,
      tracking_number: null,
      carrier: null,
      shipped_at: null,
      delivered_at: null,
      error_message: null,
      error_type: null,
      retry_count: 0,
      last_error_at: null,
      next_retry_at: null,
      last_skip_reason: null,
      last_skip_at: null,
      last_skip_details: null,
      customer_approval_required: true,
      customer_approval_status: 'approved',
      customer_approval_requested_at: now,
      customer_approval_approved_at: now,
      created_at: now,
      updated_at: now,
      queued_at: null,
      started_at: null,
      printFulfillmentStartedAt: null,
      printFulfillmentFinishedAt: null,
      printFulfillmentStatus: null,
      print_fulfillment_started_at: null,
      print_fulfillment_finished_at: null,
      preview_reminder_sent: null,
      lifecycle_status: 'pending_print',
      reprint_count: 0,
      reprint_reason: null,
      reprint_note: null,
    });
  }

  const { data: inserted, error: insertError } = await supabase
    .from('orders')
    .insert(clonedRows)
    .select('id,orderId,root_order_id,amazon_order_id,status,workflow_step,next_workflow,current_workflow,execution_status,manifest_3_url');
  if (insertError) throw insertError;

  console.log(
    JSON.stringify(
      {
        sourceRootGroupId,
        newRootGroupId,
        insertedCount: inserted?.length ?? 0,
        rows: inserted,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
