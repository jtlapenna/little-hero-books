/** Operator-held preparation and exact pre-create review. No request body selects service credentials. */
import { createHash, randomUUID } from 'node:crypto';
import { adminWorkflowTestAdmission, hasAdminWorkflowTestMarker } from '../admin-workflow-test';
import { canonicalJsonSha256 as ordinaryReleaseDigest } from '../canonical-json-sha256';
import type { GelatoSubmissionContext } from './gelato-submission-store';
import type { GelatoSubmissionDependencies, GelatoSubmissionIdentity } from './gelato-submission';

export async function workflowTestRows(context: GelatoSubmissionContext, d: GelatoSubmissionDependencies) {
  const rows = await Promise.all(context.members.map(member => d.loadOrder(member.child_order_key)));
  if (!rows.some(hasAdminWorkflowTestMarker)) return null;
  if (rows.length !== 1 || !rows[0] || !adminWorkflowTestAdmission(rows[0])) throw Error('Invalid workflow-test print admission');
  return rows as Record<string, unknown>[];
}
async function artifacts(context: GelatoSubmissionContext, d: GelatoSubmissionDependencies) {
  if (!d.artifactSha256) throw Error('Prepared PDF byte verification unavailable');
  return Promise.all(context.members.map(async member => {
    if (!member.artifact_key || !member.artifact_fingerprint || member.pdf_page_count !== 35) throw Error('Prepared PDF receipt missing');
    return { orderId: member.child_order_key, orderDbId: member.child_order_id, key: member.artifact_key,
      fingerprint: member.artifact_fingerprint, pageCount: member.pdf_page_count, sha256: await d.artifactSha256!(member.artifact_key) };
  }));
}
export async function holdWorkflowTestPrint(context: GelatoSubmissionContext, identity: GelatoSubmissionIdentity, d: GelatoSubmissionDependencies) {
  if (!await workflowTestRows(context, d)) return false;
  if (context.submission.request_state === 'operator_review') return true;
  if (context.submission.request_state !== 'claimed' || !context.submission.quote_snapshot || !d.accountSha256) throw Error('Print preparation is not ready');
  const packet = { version: 1, submissionId: context.submission.id, claimToken: identity.claimToken,
    executionId: `admin-print-${randomUUID()}`, accountSha256: d.accountSha256,
    quoteSnapshot: context.submission.quote_snapshot, artifacts: await artifacts(context, d) };
  await d.store.transition('hold_admin_workflow_test_print', { p_submission_id: identity.submissionId, p_token: identity.claimToken,
    p_packet: packet, p_packet_sha256: ordinaryReleaseDigest(packet) });
  return true;
}
export async function assertWorkflowTestSend(context: GelatoSubmissionContext, d: GelatoSubmissionDependencies) {
  const rows = await workflowTestRows(context, d);
  if (!rows) return;
  const authorization = d.workflowTestSend, s = context.submission;
  if (!authorization || adminWorkflowTestAdmission(rows[0])?.createdBy !== authorization.actor ||
      !s.operator_review_packet || ordinaryReleaseDigest(s.operator_review_packet) !== authorization.packetSha256 ||
      s.operator_review_packet_sha256 !== authorization.packetSha256 || s.operator_approval_actor !== authorization.actor ||
      !s.operator_approval_expires_at || Date.parse(s.operator_approval_expires_at) <= (d.now?.() ?? new Date()).getTime() ||
      s.operator_approval_consumed_at) throw Error('Exact current operator authorization required');
  const packet = s.operator_review_packet as Record<string, unknown>;
  if (packet.accountSha256 !== d.accountSha256 || ordinaryReleaseDigest(packet.quoteSnapshot) !== ordinaryReleaseDigest(s.quote_snapshot) ||
      ordinaryReleaseDigest(packet.artifacts) !== ordinaryReleaseDigest(await artifacts(context, d))) throw Error('Prepared book or account changed; review again');
}
export const workflowTestAccountSha256 = (key: string) => createHash('sha256').update(key).digest('hex');
