import { createClient } from '@supabase/supabase-js';
import {
  getObject,
  putObject,
  R2_ORDERS_BUCKET,
  listObjects,
} from '@/lib/r2-client';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonRecord = { [key: string]: JsonValue };

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

function assertEnv(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const supabase = createClient(
  assertEnv(supabaseUrl, 'SUPABASE_URL'),
  assertEnv(supabaseKey, 'SUPABASE_SERVICE_ROLE_KEY'),
);

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

function toRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

async function copyOrderPrefix(sourceOrderId: string, targetOrderId: string, newRootGroupId: string) {
  const sourcePrefix = `book-mvp-simple-adventure/orders/${sourceOrderId}/`;
  const targetPrefix = `book-mvp-simple-adventure/orders/${targetOrderId}/`;
  const listed = await listObjects(R2_ORDERS_BUCKET, { prefix: sourcePrefix, maxKeys: 500 });
  const objects = listed.Contents || [];
  if (!objects.length) {
    throw new Error(`No R2 objects found under ${sourcePrefix}`);
  }

  const replacements: Array<[string, string]> = [
    [sourceOrderId, targetOrderId],
    [sourcePrefix, targetPrefix],
  ];

  for (const object of objects) {
    const sourceKey = object.Key;
    const targetKey = sourceKey.replace(sourcePrefix, targetPrefix).split(sourceOrderId).join(targetOrderId);
    const response = await getObject(R2_ORDERS_BUCKET, sourceKey);
    const contentType = response.headers.get('content-type') || undefined;

    if (sourceKey.endsWith('.json')) {
      const parsed = JSON.parse(await response.text()) as JsonValue;
      const replaced = deepReplace(parsed, replacements);
      const finalValue = deepReplace(replaced, [[sourceOrderId, targetOrderId]]);
      await putObject(
        R2_ORDERS_BUCKET,
        targetKey,
        `${JSON.stringify(finalValue, null, 2)}\n`,
        'application/json',
      );
    } else {
      const bytes = new Uint8Array(await response.arrayBuffer());
      await putObject(R2_ORDERS_BUCKET, targetKey, bytes, contentType);
    }
  }
}

async function main() {
  const [newRootGroupId, sourceOrderA, sourceOrderB] = process.argv.slice(2);
  if (!newRootGroupId || !sourceOrderA || !sourceOrderB) {
    throw new Error(
      'usage: tsx scripts/tmp-create-w41-group-from-w4-orders.ts <newRootGroupId> <sourceOrderA> <sourceOrderB>',
    );
  }

  const { data: existing, error: existingError } = await supabase
    .from('orders')
    .select('id,orderId')
    .eq('root_order_id', newRootGroupId);
  if (existingError) throw existingError;
  if ((existing ?? []).length > 0) {
    throw new Error(`Target root group already exists: ${newRootGroupId}`);
  }

  const { data: sourceRows, error: sourceError } = await supabase
    .from('orders')
    .select('*')
    .in('orderId', [sourceOrderA, sourceOrderB])
    .order('orderId', { ascending: true });
  if (sourceError) throw sourceError;
  if (!sourceRows || sourceRows.length !== 2) {
    throw new Error('Expected exactly 2 source W4 orders');
  }

  const now = new Date().toISOString();
  const clonedRows: JsonRecord[] = [];

  for (const [index, rawRow] of (sourceRows as JsonRecord[]).entries()) {
    const sourceOrderId = String(rawRow.orderId || '');
    const sourceRoot = String(rawRow.root_order_id || sourceOrderId);
    const targetOrderId = `${newRootGroupId}-item-${index + 1}`;

    await copyOrderPrefix(sourceOrderId, targetOrderId, newRootGroupId);

    const replaced = toRecord(
      deepReplace(rawRow, [
        [sourceOrderId, targetOrderId],
        [sourceRoot, newRootGroupId],
      ]),
    );

    delete replaced.id;

    clonedRows.push({
      ...replaced,
      orderId: targetOrderId,
      root_order_id: newRootGroupId,
      amazon_order_id: newRootGroupId,
      amazonOrderId: newRootGroupId,
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
      lifecycle_status: 'pending_print',
      reprint_count: 0,
      reprint_reason: null,
      reprint_note: null,
    });
  }

  const { data: inserted, error: insertError } = await supabase
    .from('orders')
    .insert(clonedRows)
    .select('id,orderId,root_order_id,amazon_order_id,status,workflow_step,current_workflow,next_workflow,execution_status,manifest_3_url');
  if (insertError) throw insertError;

  console.log(
    JSON.stringify(
      {
        newRootGroupId,
        sourceOrderIds: [sourceOrderA, sourceOrderB],
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
