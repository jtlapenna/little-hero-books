import { z } from 'zod';
import { quoteGelatoSubmission, submitGelatoDraft, type GelatoSubmissionDependencies } from './gelato-submission';

export const GelatoSubmissionIdentitySchema = z.object({
  submissionId: z.string().uuid(), claimToken: z.string().uuid(),
  executionId: z.string().trim().min(1).max(200), mode: z.enum(['single', 'siblings']),
}).strict();

export async function handleGelatoSubmission(body: unknown, action: 'quote' | 'draft', dependencies: GelatoSubmissionDependencies) {
  const identity = GelatoSubmissionIdentitySchema.safeParse(body);
  if (!identity.success) return { status: 400, body: { error: 'Gelato submission requires exact claim and execution identity' } };
  try {
    const result = action === 'quote' ? await quoteGelatoSubmission(identity.data, dependencies) : await submitGelatoDraft(identity.data, dependencies);
    return { status: 200, body: { success: true, ...result } };
  } catch {
    return { status: 409, body: { error: 'Gelato submission was not confirmed; inspect saved submission before retrying' } };
  }
}
