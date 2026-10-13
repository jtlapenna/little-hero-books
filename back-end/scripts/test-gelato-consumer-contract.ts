import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getPrintGroupProviderBlocker,
  getPrintQueueSuccessMessage,
  getGelatoNotificationChildOrderIds,
  hasExistingGelatoSubmission,
  isActionableGelatoAttention,
  isGelatoOrderCompleted,
  isGelatoOrderShipped,
  shouldExcludeFromPrintPhaseAttention,
} from '../src/lib/books/gelato-consumer-policy';
import { getDisplayStatusForOrder } from '../src/lib/status-display';
import { mapSupabaseOrderToOrder } from '../src/lib/order-mapper';

async function main() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const regenerate4Source = readFileSync(resolve(
    scriptDir,
    '../src/app/api/admin/orders/[orderId]/regenerate-4/route.ts',
  ), 'utf8');
  const activeSubmissionGuard = regenerate4Source.indexOf('if (hasExistingGelatoSubmission(orderRecord');
  const activeJobCancellation = regenerate4Source.indexOf('for (const job of staleActiveW4Jobs)');
  assert.ok(
    activeSubmissionGuard >= 0 && activeJobCancellation >= 0 && activeSubmissionGuard < activeJobCancellation,
    'active Gelato submission guard must run before canceling W4 jobs',
  );
  const archivedSubmissionGuard = regenerate4Source.indexOf('if (hasExistingGelatoSubmission(orderData)');
  const archivedRestoreInsert = regenerate4Source.indexOf('.insert(orderData)');
  assert.ok(
    archivedSubmissionGuard >= 0 && archivedRestoreInsert >= 0 && archivedSubmissionGuard < archivedRestoreInsert,
    'archived Gelato submission guard must run before restoring the order',
  );

  const deliveredWithoutGelatoState = await mapSupabaseOrderToOrder({
    orderId: 'gelato-stale-delivered',
    status: 'delivered',
    print_provider: 'gelato',
  }, { includeStatus: false });
  assert.notEqual(getDisplayStatusForOrder(deliveredWithoutGelatoState).workflowStatus, 'delivered');

  const inProductionWithoutGelatoState = await mapSupabaseOrderToOrder({
    orderId: 'gelato-stale-production',
    status: 'in_production',
    print_provider: 'gelato',
    customer_approval_status: 'approved',
    review_stages: {
      preBria: { status: 'approved' },
      postBria: { status: 'approved' },
      postPdf: { status: 'approved' },
    },
  }, { includeStatus: false });
  assert.notEqual(getDisplayStatusForOrder(inProductionWithoutGelatoState).workflowStatus, 'printing');

  const returnedWithStaleCompletion = {
    print_provider: 'gelato',
    gelato_order_type: 'order',
    gelato_status: 'returned',
    status: 'completed',
    execution_status: 'completed',
  } as Parameters<typeof isGelatoOrderCompleted>[0];
  assert.equal(isGelatoOrderShipped(returnedWithStaleCompletion), false);
  assert.equal(isGelatoOrderCompleted(returnedWithStaleCompletion), false);
  assert.equal(hasExistingGelatoSubmission({ print_provider: 'gelato', print_submission_id: 'submission-1' }), true);
  assert.equal(hasExistingGelatoSubmission({ print_provider: 'lulu', print_submission_id: 'submission-1' }), false);
  assert.deepEqual(getGelatoNotificationChildOrderIds([
    { child_order_id: 1, payload: { childOrderIds: [1, 2, '3'] } },
  ]), [1, 2, 3]);

  const actionableGelato = {
    print_provider: 'gelato',
    gelato_action_reason: 'submission_ambiguous',
    lulu_job_id: 'stale-lulu-id',
    workflow_step: 'print_fulfillment',
    next_workflow: '4',
    customer_approval_status: 'approved',
  };
  assert.equal(isActionableGelatoAttention(actionableGelato), true);
  assert.equal(shouldExcludeFromPrintPhaseAttention(actionableGelato), false);
  assert.equal(isActionableGelatoAttention({ print_provider: 'gelato', gelato_notification_attention: true }), true);
  assert.equal(shouldExcludeFromPrintPhaseAttention({
    print_provider: 'gelato',
    gelato_notification_attention: true,
    lulu_job_id: 'stale-lulu-id',
    workflow_step: 'print_fulfillment',
  }), false);
  assert.equal(shouldExcludeFromPrintPhaseAttention({
    ...actionableGelato,
    gelato_action_reason: 'awaiting_draft_review',
  }), true);
  assert.equal(shouldExcludeFromPrintPhaseAttention({
    ...actionableGelato,
    print_provider: 'lulu',
  }), true);

  assert.equal(getPrintGroupProviderBlocker([
    { __resolved_print_provider: 'lulu' },
    { __resolved_print_provider: 'gelato' },
  ]), 'Sibling orders resolve to different print providers');
  assert.match(getPrintGroupProviderBlocker([
    { __resolved_print_provider: 'gelato', print_submission_id: 'existing-submission' },
    { __resolved_print_provider: 'gelato' },
  ]) ?? '', /Existing Gelato submission/);
  assert.match(getPrintGroupProviderBlocker([
    { __resolved_print_provider: 'gelato', gelato_order_id: 'provider-order-without-pointer' },
    { __resolved_print_provider: 'gelato' },
  ]) ?? '', /Existing Gelato submission/);
  assert.equal(getPrintGroupProviderBlocker([
    { __resolved_print_provider: 'lulu' },
    { __resolved_print_provider: 'lulu' },
  ]), null);
  assert.match(getPrintQueueSuccessMessage('gelato', false, 1), /held Gelato draft/);
  assert.match(getPrintQueueSuccessMessage('gelato', false, 1), /printing will not start/);
  assert.match(getPrintQueueSuccessMessage('lulu', false, 1), /print fulfillment/);

  console.log('test-gelato-consumer-contract: ok');
}

main().catch((error) => {
  console.error('test-gelato-consumer-contract: failed');
  console.error(error);
  process.exit(1);
});
