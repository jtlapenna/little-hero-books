import { RunManifestV3, RunManifestV3Schema } from '@/lib/books/types';

export function validateRunManifest(manifest: unknown): RunManifestV3 {
  const parsed = RunManifestV3Schema.parse(manifest);

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

  return parsed;
}

