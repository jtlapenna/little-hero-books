/** Human review/approval/application boundary. Provider transport is supplied by a reviewed runtime, never by an HTTP body. */
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AnyOrdinaryReleasePermitSchema, AnyOrdinaryReleasePacketSchema, ordinaryReleaseDigest, prepareOrdinaryRelease, executeOrdinaryRelease,
  type OrdinaryReleaseDependencies, type AnyOrdinaryReleasePermit } from './gelato-ordinary-release-core';
import { GelatoSavedSnapshotSchema } from './gelato-submission';
import {ESTIMATE_TEST_PRINT_POLICY} from './gelato-release-estimate';

const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const Limit=z.string().regex(/^(0|[1-9]\d{0,11})$/);
const Review = z.union([z.object({ action: z.literal('review'), submissionId: z.string().uuid(), maximumTotalCents: Limit }).strict(),
 z.object({action:z.literal('review'),submissionId:z.string().uuid(),pricingPolicy:z.literal(ESTIMATE_TEST_PRINT_POLICY),maximumQuotedSubtotalCents:Limit}).strict()]);
const Approve = z.object({ action: z.literal('approve'), permit: AnyOrdinaryReleasePermitSchema, reviewedPacket: AnyOrdinaryReleasePacketSchema,
  approvedPacketSha256: Hash, approveExactOrder: z.literal(true),acknowledgeFinalChargeMayDiffer:z.literal(true).optional() }).strict();
const Execute = z.object({ action: z.literal('execute'), permitId: z.string().uuid(), approvedPacketSha256: Hash }).strict();
const Action = z.union([Review, Approve, Execute]);
export interface OrdinaryReleaseApplication {
  release: OrdinaryReleaseDependencies;
  approvers: ReadonlySet<string>;
  register(input: { permit: AnyOrdinaryReleasePermit; packet: unknown; actor: string; approvalEvidenceSha256: string }): Promise<string>;
  approved(id: string): Promise<{ permit: unknown; actor: string } | null>;
}
export type OrdinaryReleaseRuntime = { kind: 'ready'; application: OrdinaryReleaseApplication } |
  { kind: 'blocked'; blockers: readonly string[] };
export type ReleaseIdentity = { ok: true; mode: 'access' | 'token'; actor: string } | { ok: false; response: Response };
export interface ReleaseHttpPorts {
  authenticate(request: Request): Promise<ReleaseIdentity>;
  runtime(): Promise<OrdinaryReleaseRuntime>;
  budgetMs?: number;
}
const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

async function within<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(Error('release_application_deadline'));
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(work).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

async function candidate(action:z.infer<typeof Review>, d: OrdinaryReleaseDependencies, signal: AbortSignal): Promise<AnyOrdinaryReleasePermit> {
  const submissionId=action.submissionId;
  if(('pricingPolicy' in action?action.pricingPolicy:undefined)!==d.pricingPolicy)throw Error('release_pricing_policy_not_installed');
  const context = await within(signal, () => d.context(submissionId));
  const saved = GelatoSavedSnapshotSchema.parse(context.submission.request_snapshot);
  const time = (d.now ?? (() => new Date()))();
  const artifacts = await Promise.all(context.members.map(async member => {
    const row = await within(signal, () => d.order(member.child_order_key));
    if (!row || !member.artifact_key || !member.provider_item_id) throw Error('release_application_identity_missing');
    return { childOrderId: member.child_order_id, itemReferenceId: member.item_reference_id, providerItemId: member.provider_item_id,
      bookId: row.print_book_id, formatId: row.print_format_id, configVersion: row.print_config_version,
      key: member.artifact_key, sha256: createHash('sha256').update(await within(signal, () => d.artifact(member.artifact_key!))).digest('hex') };
  }));
  return AnyOrdinaryReleasePermitSchema.parse({ id: randomUUID(), submissionId, providerOrderId: context.submission.accepted_root_order_id,
    accountSha256: createHash('sha256').update(d.apiKey).digest('hex'), packetSha256: '0'.repeat(64),
    requestSnapshotSha256: ordinaryReleaseDigest(saved), artifacts, currency: 'USD',
    ...('pricingPolicy' in action?{pricingPolicy:action.pricingPolicy,maximumQuotedSubtotalCents:action.maximumQuotedSubtotalCents}:{maximumTotalCents:action.maximumTotalCents}),
    approvedAt: time.toISOString(), expiresAt: new Date(time.getTime() + 15 * 60000).toISOString() });
}

/** Every action is deliberate POST. Machine bearer, customer preview, and enabled flags cannot grant human spending approval. */
export function createOrdinaryReleaseHttpHandler(ports: ReleaseHttpPorts) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const identity = await ports.authenticate(request);
    if (!identity.ok) return identity.response;
    if (identity.mode !== 'access') return json({ error: 'A signed-in authorized operator is required' }, 403);
    let input: unknown;
    try { const text = await request.text(); if (text.length > 65536) return json({ error: 'Request too large' }, 413); input = JSON.parse(text); }
    catch { return json({ error: 'Invalid release request' }, 400); }
    const parsed = Action.safeParse(input);
    if (!parsed.success) return json({ error: 'Invalid release request' }, 400);
    const runtime = await ports.runtime();
    if (runtime.kind === 'blocked') return json({ state: 'blocked', canSubmit: false, blockers: runtime.blockers, providerMutationAttempted: false }, 409);
    const app = runtime.application, d = app.release;
    if (!app.approvers.has(identity.actor)) return json({ error: 'This operator cannot authorize a print release' }, 403);
    const budget = ports.budgetMs ?? 30000;
    if (!Number.isSafeInteger(budget) || budget < 1 || budget > 30000) return json({ error: 'Release runtime unavailable' }, 409);
    const deadline = Date.now() + budget;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), budget);
    try {
      const action = parsed.data;
      if (action.action === 'execute') {
        const recorded = await within(controller.signal, () => app.approved(action.permitId));
        if (!recorded || recorded.actor !== identity.actor) return json({ error: 'Exact recorded approval required' }, 409);
        const permit = AnyOrdinaryReleasePermitSchema.parse(recorded.permit);
        if (permit.id !== action.permitId || permit.packetSha256 !== action.approvedPacketSha256) return json({ error: 'Exact recorded approval required' }, 409);
        // Core rechecks current files/customer approval/account/price and persists sending before its one PATCH.
        controller.signal.throwIfAborted();
        const remaining = deadline - Date.now();
        if (remaining < 1) throw Error('release_application_deadline');
        return json(await executeOrdinaryRelease(permit.id, { ...d, budgetMs: Math.min(d.budgetMs ?? 30000, remaining) }));
      }
      if(action.action==='approve' && 'pricingPolicy' in action.permit && action.acknowledgeFinalChargeMayDiffer!==true)
        return json({error:'Explicit acknowledgement of possible final-charge differences is required',providerMutationAttempted:false},400);
      const permit = action.action === 'review' ? await candidate(action, d, controller.signal) : action.permit;
      const prepared = await prepareOrdinaryRelease(permit, d, controller.signal, action.action === 'approve' ? action.reviewedPacket : undefined);
      if (action.action === 'review') {
        return json({ state: 'review_required', canSubmit: false, permit: { ...permit, packetSha256: prepared.packetSha256 },
          packet: prepared.packet, packetSha256: prepared.packetSha256, providerMutationAttempted: false,
          ...('pricingPolicy' in permit?{requiredAcknowledgement:'final_charge_may_differ',providerChargeCapEnforced:false}:{} ) });
      }
      if (permit.packetSha256 !== action.approvedPacketSha256 || prepared.packetSha256 !== action.approvedPacketSha256) {
        return json({ error: 'Book, quote or approval packet changed; review again', providerMutationAttempted: false }, 409);
      }
      await within(controller.signal, prepared.currentAuthority);
      controller.signal.throwIfAborted();
      const approvalEvidenceSha256 = ordinaryReleaseDigest({ version: 1, actor: identity.actor,
        recordedAt: (d.now ?? (() => new Date()))().toISOString(), permitId: permit.id,
        packetSha256: prepared.packetSha256, approveExactOrder: true,
        ...('pricingPolicy' in permit?{pricingPolicy:permit.pricingPolicy,acknowledgeFinalChargeMayDiffer:action.acknowledgeFinalChargeMayDiffer}:{} ) });
      const registered = await within(controller.signal, () => app.register({ permit, packet: prepared.packet, actor: identity.actor, approvalEvidenceSha256 }));
      if (registered !== permit.id) throw Error('release_registered_identity_changed');
      return json({ state: 'approved', permitId: permit.id, packetSha256: prepared.packetSha256, providerMutationAttempted: false });
    } catch { return json({ error: 'Release could not be confirmed. Inspect the recorded state before another action.', providerMutationAttempted: false }, 409); }
    finally { clearTimeout(timer); }
  };
}
