import { getBookFormatConfig } from '@/lib/books/load-book-config';
import { BookConfig, BookPageConfig, ResolvedBookPlan } from '@/lib/books/types';

function assertSequentialPageIndexes(pageSequence: BookPageConfig[]): void {
  for (let index = 0; index < pageSequence.length; index += 1) {
    if (pageSequence[index].index !== index) {
      throw new Error(
        `Page sequence index mismatch at position ${index}: got ${pageSequence[index].index}`,
      );
    }
  }
}

function assertUniqueLabels(pageSequence: BookPageConfig[]): void {
  const labels = new Set<string>();

  for (const page of pageSequence) {
    if (labels.has(page.label)) {
      throw new Error(`Duplicate page label detected: ${page.label}`);
    }
    labels.add(page.label);
  }
}

export function resolvePagePlan(config: BookConfig, formatId?: string): ResolvedBookPlan {
  const format = getBookFormatConfig(config, formatId);
  const pagePlan = [...format.interior.pageSequence];
  const pageLabels = pagePlan.map((page) => page.label);

  if (format.interior.expectedPageCount !== pagePlan.length) {
    throw new Error(
      `expectedPageCount mismatch for ${config.bookId}/${format.formatId}: expected ${format.interior.expectedPageCount}, got ${pagePlan.length}`,
    );
  }

  assertSequentialPageIndexes(pagePlan);
  assertUniqueLabels(pagePlan);

  return {
    expectedPageCount: format.interior.expectedPageCount,
    pageLabels,
    pagePlan,
    trimIn: format.trimIn,
    bleedIn: format.bleedIn,
    templates: format.templates,
    print: format.print,
    qaPolicy: config.qa,
  };
}

