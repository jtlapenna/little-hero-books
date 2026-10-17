import { z } from 'zod';
import type { CustomerCorrection } from '@/types/order';

const receiptSchema = z.object({
  kind: z.literal('customer-correction'), version: z.literal(1), receiptId: z.string().uuid(),
  orderId: z.string().min(1), revisionCount: z.number().int().positive(),
  submittedAt: z.string().datetime(), reason: z.string().min(1), message: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()), email: z.string().nullable(), name: z.string().nullable(),
});

type CorrectionInput = { reason: string; message: string | null; payload: Record<string, unknown>; email: string | null; name: string | null; revisionCount: number };

/** Save this array in the SAME winning order CAS as revision_requested. */
export function correctionHistoryForTransition(row: Record<string, unknown>, orderId: string, input: CorrectionInput): unknown[] {
  if (row.rejection_history != null && !Array.isArray(row.rejection_history)) throw new Error('Invalid correction history');
  const receipt = receiptSchema.parse({ ...input, orderId, kind: 'customer-correction', version: 1,
    receiptId: crypto.randomUUID(), submittedAt: new Date().toISOString() });
  return [...(Array.isArray(row.rejection_history) ? row.rejection_history : []), receipt];
}

/** A reset clears revision_count; historical records cannot reappear as current corrections. */
export function readDurableCustomerCorrection(row: Record<string, unknown> | null | undefined, orderId: string): CustomerCorrection | null {
  const revision = Number(row?.revision_count ?? 0);
  if (!Number.isInteger(revision) || revision < 1 || !Array.isArray(row?.rejection_history)) return null;
  for (const value of [...row.rejection_history].reverse()) {
    const parsed = receiptSchema.safeParse(value);
    if (!parsed.success || parsed.data.orderId !== orderId || parsed.data.revisionCount !== revision) continue;
    const { reason, message, payload, email, name, revisionCount, submittedAt } = parsed.data;
    return { reason, message, payload, email, name, revisionCount, submittedAt };
  }
  return null;
}
