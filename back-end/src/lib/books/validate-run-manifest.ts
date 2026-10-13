import { resolvePagePlan } from './resolve-page-plan';
import { validateRenderSnapshot, requiredRecipePoses } from './book-render-recipe';
import { RunManifestV3, RunManifestV3Schema } from '@/lib/books/types';

export function validateRunManifest(manifest: unknown): RunManifestV3 {
  const raw = manifest && typeof manifest === 'object' ? manifest as Record<string, unknown> : {};
  const book = raw.book && typeof raw.book === 'object' ? raw.book as Record<string, unknown> : {};
  const ref = book.bookConfigRef && typeof book.bookConfigRef === 'object' ? book.bookConfigRef as Record<string, unknown> : {};
  const resolved = book.resolved && typeof book.resolved === 'object' ? book.resolved as Record<string, unknown> : {};
  const print = resolved.print && typeof resolved.print === 'object' ? resolved.print as Record<string, unknown> : {};
  const legacyV1 = ref.bookId === 'book-finding-our-inner-voice' && ref.version === 1;
  const parsed = RunManifestV3Schema.parse(legacyV1 && print.provider === undefined
    ? { ...raw, book: { ...book, resolved: { ...resolved, print: { ...print, provider: 'lulu' } } } }
    : manifest);

  if (parsed.book.resolved.print.provider === 'gelato' &&
      parsed.book.resolved.print.innerPageCount !== parsed.book.resolved.expectedPageCount) {
    throw new Error('Gelato innerPageCount must match the frozen page plan');
  }

  if (parsed.book.resolved.expectedPageCount !== parsed.book.resolved.pagePlan.length) {
    throw new Error(
      `Run manifest expectedPageCount mismatch: expected ${parsed.book.resolved.expectedPageCount}, got ${parsed.book.resolved.pagePlan.length}`,
    );
  }

  if (parsed.book.resolved.pageLabels.length !== parsed.book.resolved.pagePlan.length) {
    throw new Error(
      `Run manifest pageLabels mismatch: expected ${parsed.book.resolved.pagePlan.length}, got ${parsed.book.resolved.pageLabels.length}`,
    );
  }

  const pagePlanLabels = parsed.book.resolved.pagePlan.map((page) => page.label);
  const labelsMatch = parsed.book.resolved.pageLabels.every(
    (label, index) => label === pagePlanLabels[index],
  );

  if (!labelsMatch) {
    throw new Error('Run manifest pageLabels do not match pagePlan labels');
  }

  const expectedManifestKeyPrefix = `${parsed.book.bookConfigRef.bookId}/orders/${parsed.order.orderId}/manifests/`;
  if (!parsed.artifacts.manifestKey.startsWith(expectedManifestKeyPrefix)) {
    throw new Error(
      `Run manifest key does not match order/book prefix: ${parsed.artifacts.manifestKey}`,
    );
  }

  if (parsed.book.resolved.renderSnapshot) {
    const snapshot = validateRenderSnapshot(parsed.book.resolved.renderSnapshot, parsed.book.bookConfigRef);
    if (snapshot.testOnly !== undefined && snapshot.testOnly !== (parsed.input.bookSpecs.testMode === true)) throw new Error('Render snapshot test marker mismatch');
    const expectedResolved = resolvePagePlan(snapshot.bookConfig, snapshot.formatId);
    for (const field of ['expectedPageCount', 'pageLabels', 'trimIn', 'bleedIn', 'templates', 'print', 'qaPolicy'] as const) {
      if (JSON.stringify(expectedResolved[field]) !== JSON.stringify(parsed.book.resolved[field])) throw new Error(`Render snapshot resolved ${field} mismatch`);
    }
    const frozenPlan = snapshot.bookConfig.formats[snapshot.formatId].interior.pageSequence;
    if (JSON.stringify(frozenPlan) !== JSON.stringify(parsed.book.resolved.pagePlan)) throw new Error('Render snapshot page plan mismatch');
    const required = requiredRecipePoses(snapshot.bookConfig, snapshot.formatId);
    if (JSON.stringify(required) !== JSON.stringify(parsed.book.resolved.qaPolicy.pose.requiredPoseNumbers)) throw new Error('Render snapshot required poses mismatch');
  }
  return parsed;
}
