import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { canRetryFailedUnsentPrint } from '../src/lib/books/gelato-admin-inspection';

const root = path.resolve(__dirname, '../..');

// Only a failed claim with no provider orders can be retried.
assert.equal(canRetryFailedUnsentPrint({ state: 'failed', providerOrderCount: 0, itemProviderOrderIds: [null, undefined, ''] }), true);
assert.equal(canRetryFailedUnsentPrint({ state: 'failed', providerOrderCount: 1, itemProviderOrderIds: [] }), false, 'provider order exists');
assert.equal(canRetryFailedUnsentPrint({ state: 'failed', providerOrderCount: 0, itemProviderOrderIds: ['abc'] }), false, 'item already has a provider order');
for (const state of ['claimed', 'submitting', 'outcome_unknown', 'submitted']) {
  assert.equal(canRetryFailedUnsentPrint({ state, providerOrderCount: 0, itemProviderOrderIds: [] }), false, `${state} is never retryable`);
}

// The database function re-checks every guard itself; the admin route cannot widen them.
const sql = readFileSync(path.join(root, 'database/20261109120000_gelato_retire_failed_unsent_submission.sql'), 'utf8');
for (const guard of [
  "s.request_state <> 'failed'", 's.send_started_at IS NOT NULL', 's.accepted_root_order_id IS NOT NULL',
  'print_provider_submission_orders', 'gelato_ordinary_release_roots', 'gelato_ordinary_release_permits',
  'gelato_engineering_conversions', 'gelato_scheduled_status', 'gelato_isolation_scopes',
  "execution_status IS DISTINCT FROM 'ready_for_processing'", 'print_claim_token IS DISTINCT FROM s.claim_token', "delivery_state <> 'pending'",
  'lock_gelato_submission_root', 'GRANT EXECUTE ON FUNCTION public.retire_failed_unsent_gelato_submission(uuid) TO service_role',
]) assert.ok(sql.includes(guard), `retire function must keep guard: ${guard}`);
assert.ok(!/GRANT[^;]*retire_failed_unsent_gelato_submission[^;]*\b(anon|authenticated|PUBLIC)\b[^;]*;/i.test(sql.replace(/REVOKE[^;]*;/gi, '')), 'only service_role may execute');

const route = readFileSync(path.join(root, 'back-end/src/app/api/admin/gelato-print/route.ts'), 'utf8');
assert.ok(route.includes("parsed.data.action === 'retry'") && route.includes('if (!inspected.canRetry)'), 'retry must require canRetry');
assert.ok(route.includes('requireAdminAuth'), 'admin auth stays on the route');
console.log('Gelato retry guard checks passed');
