import { z } from 'zod';
import type { BuildOrderIntakeManifestOptions, NormalizedW0WorkflowInput } from './w0-manifest-builder';

const SelectionSchema = z.object({
  schemaVersion: z.literal('v3').default('v3'),
  bookId: z.string().trim().min(1),
  formatId: z.string().trim().min(1),
  configVersion: z.number().int().positive(),
  configSource: z.literal('published'),
});

export function parseW0ManifestRequest(value: unknown, compatibility: { allowLegacyMvpIntake?: boolean } = {}) {
  const envelope = z.record(z.string(), z.unknown()).parse(value);
  const input = envelope.payload === undefined
    ? envelope
    : z.record(z.string(), z.unknown()).parse(envelope.payload);
  const selection: Record<string, unknown> = {};
  const bookSpecs = input.bookSpecs && typeof input.bookSpecs === 'object' && !Array.isArray(input.bookSpecs)
    ? input.bookSpecs as Record<string, unknown> : {};
  for (const field of Object.keys(SelectionSchema.shape)) {
    const values = [envelope[field], input[field], bookSpecs[field]].filter((entry) => entry !== undefined);
    if (values.some((entry) => entry !== values[0])) {
      throw new Error(`Conflicting W0 selection: ${field}`);
    }
    selection[field] = values[0];
  }
  const legacyMvp = compatibility.allowLegacyMvpIntake && envelope.payload !== undefined &&
    selection.bookId === 'book-mvp-simple-adventure' && selection.configSource === 'published-first' &&
    (selection.schemaVersion === undefined || selection.schemaVersion === 'v3') &&
    selection.configVersion === undefined && selection.formatId === undefined;
  // The existing W0 export omits these selectors. Keep that exact request on MVP v1.
  const options: BuildOrderIntakeManifestOptions = legacyMvp
    ? { schemaVersion: 'v3', bookId: 'book-mvp-simple-adventure', configVersion: 1, configSource: 'published-first' }
    : SelectionSchema.parse(selection);
  return {
    input: input as NormalizedW0WorkflowInput,
    options,
  };
}
