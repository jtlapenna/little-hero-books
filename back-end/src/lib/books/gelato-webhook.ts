import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { GelatoIdSchema } from './gelato-provider-snapshot';

export const GELATO_WEBHOOK_HEADER = 'x-lhl-gelato-webhook-token';
const MaxBodyBytes = 64 * 1024;
const Signal = z.object({
  id: z.string().trim().min(1).max(200),
  event: z.enum(['order_status_updated', 'order_item_status_updated', 'order_item_tracking_code_updated', 'order_delivery_estimate_updated']),
  orderId: GelatoIdSchema,
  orderReferenceId: z.string().trim().min(1).max(200),
}).strip();
export type GelatoWebhookSignal = z.infer<typeof Signal>;
export type GelatoWebhookReceipt = {
  event: GelatoWebhookSignal['event']; eventSha256: string; orderSha256: string;
  disposition: 'disabled' | 'unmapped' | 'refreshed' | 'requires_review';
};
export interface GelatoWebhookDependencies {
  secret?: string;
  enabled: boolean;
  refresh(signal: GelatoWebhookSignal, abort: AbortSignal): Promise<{ accepted: boolean; needsAttention?: boolean }>;
  receipt(receipt: GelatoWebhookReceipt): void;
  budgetMs?: number;
}
const digest = (value: string) => createHash('sha256').update(value).digest();
// Shared-header authentication, not a provider signature. Use a separate random 32+ byte secret.
export function matchesGelatoSecret(provided: string | null, expected: string | undefined): boolean {
  if (!expected || expected.trim() !== expected || expected.length < 32 || expected.length > 512 || !provided || provided.length > 512) return false;
  return timingSafeEqual(digest(provided), digest(expected));
}
export async function withGelatoDeadline<T>(abort: AbortSignal, work: () => Promise<T>): Promise<T> {
  abort.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(new Error('Gelato status deadline exceeded'));
    abort.addEventListener('abort', stop, { once: true });
    Promise.resolve().then(work).then(resolve, reject).finally(() => abort.removeEventListener('abort', stop));
  });
}
class BodyError extends Error {
  constructor(readonly status: number) { super('Invalid webhook body'); }
}
async function readBody(request: Request, abort: AbortSignal): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') throw new BodyError(415);
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MaxBodyBytes)) throw new BodyError(413);
  const reader = request.body?.getReader();
  if (!reader) throw new BodyError(400);
  let total = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await withGelatoDeadline(abort, () => reader.read());
      if (done) break;
      total += value.byteLength;
      if (total > MaxBodyBytes) throw new BodyError(413);
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw new BodyError(400); }
  } finally {
    // Do not await cancellation of an uncooperative body stream after the deadline.
    void reader.cancel().catch(() => undefined);
  }
}
export async function handleGelatoWebhook(request: Request, d: GelatoWebhookDependencies): Promise<Response> {
  const headers = { 'Cache-Control': 'private, no-store' };
  const respond = (body: object, status = 200) => Response.json(body, { status, headers });
  if (!matchesGelatoSecret(request.headers.get(GELATO_WEBHOOK_HEADER), d.secret)) return respond({ error: 'Unauthorized' }, 401);
  const abort = AbortSignal.any([request.signal, AbortSignal.timeout(Math.min(10_000, Math.max(1, d.budgetMs ?? 10_000)))]);
  let raw: unknown;
  try { raw = await readBody(request, abort); }
  catch (error) { return respond({ error: 'Invalid or incomplete Gelato event' }, error instanceof BodyError ? error.status : 408); }
  // Unknown events are acknowledged without retaining their body or accessing order data.
  const envelope = z.object({ event: z.string().min(1).max(200) }).safeParse(raw);
  if (!envelope.success) return respond({ error: 'Invalid Gelato event' }, 400);
  if (!Signal.shape.event.safeParse(envelope.data.event).success) return respond({ accepted: true, disposition: 'unsupported' });
  const parsed = Signal.safeParse(raw);
  if (!parsed.success) return respond({ error: 'Invalid Gelato event identity' }, 400);
  const signal = parsed.data;
  const receipt = (disposition: GelatoWebhookReceipt['disposition']) => d.receipt({
    event: signal.event, eventSha256: digest(signal.id).toString('hex'), orderSha256: digest(signal.orderId).toString('hex'), disposition,
  });
  if (!d.enabled) {
    receipt('disabled');
    return respond({ accepted: true, disposition: 'disabled' });
  }
  try {
    const result = await withGelatoDeadline(abort, () => d.refresh(signal, abort));
    receipt(!result.accepted ? 'unmapped' : result.needsAttention ? 'requires_review' : 'refreshed');
    return respond({ accepted: true, disposition: !result.accepted ? 'unmapped' : result.needsAttention ? 'requires_review' : 'refreshed' });
  } catch {
    // Non-2xx invites bounded provider retries. No create, conversion or customer delivery occurs here.
    return respond({ error: 'Gelato status refresh was not confirmed' }, 503);
  }
}
