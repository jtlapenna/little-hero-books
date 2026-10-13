import type { BuildW4PrintInputResult } from './w4-print-input';
import type { BookPrintConfig } from './types';
import { buildManifestKeyFromOrderPrefix, buildOrderPrefix, buildPreviewImageAssetKey } from '@/lib/order-paths';

export type W4GelatoPrintInput = BuildW4PrintInputResult & {
  providerPrintConfig: Extract<BookPrintConfig, { provider: 'gelato' }>;
};

export function assertW4GelatoPrintInput(
  input: BuildW4PrintInputResult,
): W4GelatoPrintInput {
  const print = input.providerPrintConfig;
  if (!print || print.provider !== 'gelato') throw new Error('Gelato print input requires a Gelato book configuration');
  if (!Number.isInteger(input.bookConfigVersion) || (input.bookConfigVersion ?? 0) < 1) {
    throw new Error('Gelato print input requires a positive frozen book config version');
  }
  if (print.productUid.trim().length === 0) throw new Error('Gelato print input requires a product UID');
  if (print.innerPageCount !== input.pageLabels.length) {
    throw new Error('Gelato print input inner page count does not match the resolved page plan');
  }
  if (input.pagePlan.length !== input.pageLabels.length ||
      input.pagePlan.some((page, index) => page.label !== input.pageLabels[index]) ||
      input.pagePreviewImageKeys.length !== input.pageLabels.length ||
      input.pagePreviewImageKeys.some((key, index) => key !== buildPreviewImageAssetKey(input.orderPrefix, input.pageLabels[index]))) {
    throw new Error('Gelato print input requires a complete ordered plan with canonical page rasters');
  }
  if (input.coverPreviewImageKey !== `${input.orderPrefix}/preview-images/cover-spread.png`) {
    throw new Error('Gelato print input requires the canonical cover raster');
  }
  if (print.expectedPdfPageCount !== print.innerPageCount + 3) {
    throw new Error('Gelato print input PDF page count is inconsistent with the configured print product');
  }
  if (!Number.isInteger(print.apiPageCount) || print.apiPageCount < 1) {
    throw new Error('Gelato print input requires a positive API page count');
  }
  const canonicalOrderPrefix = buildOrderPrefix(input.orderId, input.bookId);
  if (input.orderPrefix !== canonicalOrderPrefix || input.orderR2BaseKey !== canonicalOrderPrefix) {
    throw new Error('Gelato print input order prefix does not match its canonical order identity');
  }
  if (input.oneManifestKey !== buildManifestKeyFromOrderPrefix(canonicalOrderPrefix, '1') ||
      input.manifest3Key !== buildManifestKeyFromOrderPrefix(canonicalOrderPrefix, '3') ||
      input.manifest4Key !== buildManifestKeyFromOrderPrefix(canonicalOrderPrefix, '4')) {
    throw new Error('Gelato print input manifest keys do not match its canonical order identity');
  }
  return input as W4GelatoPrintInput;
}
