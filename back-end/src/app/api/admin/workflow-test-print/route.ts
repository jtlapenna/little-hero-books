import { getCloudflareContext } from '@opennextjs/cloudflare';
import { workflowTestSubmissionActivated } from '@/lib/books/gelato-workflow-test-activation';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireAdminAuth } from '@/lib/admin-auth';
import { getOrderFromSupabase } from '@/lib/supabase-client';
import { adminWorkflowTestAdmission } from '@/lib/admin-workflow-test';
import { canonicalJsonSha256 } from '@/lib/canonical-json-sha256';
import { gelatoSubmissionRuntime } from '@/lib/books/gelato-submission-runtime';
import { quoteGelatoSubmission, submitGelatoDraft, GelatoSavedSnapshotSchema } from '@/lib/books/gelato-submission';
import { gelatoSubmissionStore } from '@/lib/books/gelato-submission-store';
import { holdWorkflowTestPrint } from '@/lib/books/gelato-workflow-test';
export const dynamic = 'force-dynamic';
const responseHeaders = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: responseHeaders });
function activationEnv(): Record<string, unknown> { try { return getCloudflareContext().env as unknown as Record<string, unknown>; } catch { return process.env; } }
const Action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('review'), orderId: z.string().min(1).max(200) }).strict(),
  z.object({ action: z.literal('submit'), orderId: z.string().min(1).max(200), packetSha256: z.string().regex(/^[a-f0-9]{64}$/),
    acknowledgePossibleCharge: z.literal(true), approveExactBookAndRecipient: z.literal(true) }).strict(),
]);
async function target(orderId: string, actor: string) {
  const row = await getOrderFromSupabase(orderId);
  const admission = adminWorkflowTestAdmission(row);
  if (!row || row.orderId !== orderId || admission?.createdBy !== actor || !row.print_submission_id) throw Error('Workflow-test owner or print preparation not found');
  const context = await gelatoSubmissionStore.load(row.print_submission_id);
  if (context.members.length !== 1 || context.members[0].child_order_id !== row.id || context.members[0].child_order_key !== orderId) throw Error('Print membership changed');
  return context;
}
async function review(orderId: string, actor: string) {
  const context = await target(orderId, actor), s = context.submission;
  if (s.request_state !== 'operator_review' || !s.operator_review_packet || !s.operator_review_packet_sha256) throw Error('Print preparation is not held for review');
  if (canonicalJsonSha256(s.operator_review_packet) !== s.operator_review_packet_sha256) throw Error('Saved print review is invalid');
  const packet = s.operator_review_packet as Record<string, unknown>;
  const saved = GelatoSavedSnapshotSchema.parse(packet.quoteSnapshot);
  const expiresAt = new Date(Math.min(Date.parse(s.operator_reviewed_at!), Date.parse(s.quoted_at!)) + 5 * 60000).toISOString();
  const activated = workflowTestSubmissionActivated(activationEnv(), orderId, gelatoSubmissionRuntime().accountSha256);
  const pricesKnown = saved.monetaryQuote?.currency === 'USD' && saved.monetaryQuote.products.length === 1 && saved.monetaryQuote.products.every(p => p.currency === 'USD' && p.price !== null && /^(0|[1-9]\d*)(\.\d{1,2})?$/.test(p.price)) && saved.monetaryQuote.shippingOptions.some(s => s.shipmentMethodUid === saved.request.shipmentMethodUid && s.currency === 'USD' && s.price !== null && /^(0|[1-9]\d*)(\.\d{1,2})?$/.test(s.price));
  return { state: 'operator_review', orderId, submissionId: s.id, packetSha256: s.operator_review_packet_sha256,
    expiresAt, recipient: saved.request.shippingAddress, quantity: saved.request.items[0].quantity,
    productUid: saved.request.items[0].productUid, service: saved.request.shipmentMethodUid,
    quote: saved.monetaryQuote ?? null, accountSha256: packet.accountSha256,
    artifacts: packet.artifacts, pdfUrl: saved.request.items[0].files[0].url, canSubmit: Boolean(pricesKnown) && activated && Date.parse(expiresAt) > Date.now(),
    submissionEnabled: activated, providerMutationAttempted: false };
}
export async function GET(request: NextRequest) {
  const auth = await requireAdminAuth(request); if (!auth.ok) return auth.response;
  if (auth.mode !== 'access') return json({ error: 'Signed-in operator required' }, 403);
  try { return json(await review(request.nextUrl.searchParams.get('orderId') ?? '', auth.actor)); }
  catch { return json({ error: 'Prepared print review unavailable. Reload print status.' }, 409); }
}
export async function POST(request: NextRequest) {
  const auth = await requireAdminAuth(request); if (!auth.ok) return auth.response;
  if (auth.mode !== 'access') return json({ error: 'Signed-in operator required' }, 403);
  const parsed = Action.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Invalid print review action' }, 400);
  const action = parsed.data;
  try {
    const context = await target(action.orderId, auth.actor), d = gelatoSubmissionRuntime();
    if (action.action === 'review') {
      const identity = z.object({ submissionId: z.string().uuid(), claimToken: z.string().uuid() }).parse(
        await d.store.transition('refresh_admin_workflow_test_print', { p_submission_id: context.submission.id, p_actor: auth.actor }));
      const work = { ...identity, executionId: `review-${randomUUID()}`, mode: 'single' as const };
      try {
        await quoteGelatoSubmission(work, d);
        await holdWorkflowTestPrint(await d.store.load(identity.submissionId), work, d);
      } catch (error) {
        await d.store.transition('return_admin_workflow_test_print_hold', { p_submission_id: identity.submissionId, p_token: identity.claimToken }).catch(() => undefined);
        throw error;
      }
      return json(await review(action.orderId, auth.actor));
    }
    if (!workflowTestSubmissionActivated(activationEnv(), action.orderId, d.accountSha256) || !d.accountSha256) return json({ error: 'Test submission is not activated. The print file remains held.', providerMutationAttempted: false }, 409);
    const current = await review(action.orderId, auth.actor);
    if (!current.canSubmit || current.packetSha256 !== action.packetSha256 || current.accountSha256 !== d.accountSha256) throw Error('Prepared print review changed');
    const identity = z.object({ submissionId: z.string().uuid(), claimToken: z.string().uuid(), executionId: z.string().min(1) }).parse(
      await d.store.transition('approve_admin_workflow_test_print', { p_submission_id: context.submission.id, p_actor: auth.actor,
        p_packet_sha256: action.packetSha256, p_account_sha256: d.accountSha256 }));
    const result = await submitGelatoDraft({ ...identity, mode: 'single' }, { ...d, workflowTestSend: { actor: auth.actor, packetSha256: action.packetSha256 } });
    return json({ success: true, ...result });
  } catch {
    // A failed pre-send verification returns to review. A started/ambiguous send can never be reset here.
    if (action.action === 'submit') {
      try { const current = await target(action.orderId, auth.actor);
        if (current.submission.request_state === 'claimed' && !current.submission.send_started_at) await gelatoSubmissionStore.transition('return_admin_workflow_test_print_hold', { p_submission_id: current.submission.id, p_token: current.submission.claim_token });
      } catch { /* Unconfirmed state remains held by canonical ownership/recovery. */ }
    }
    return json({ error: 'Print action was not confirmed. Reload print status before any further action; a submission may have reached Gelato.' }, 409); }
}
