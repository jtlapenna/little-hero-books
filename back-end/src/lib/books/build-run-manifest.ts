import { loadBundledBookConfig } from '@/lib/books/load-book-config';
import { resolvePagePlan } from '@/lib/books/resolve-page-plan';
import {
  Platform,
  RunManifestInputSchema,
  RunManifestV3,
} from '@/lib/books/types';

export interface BuildW0RunManifestInput {
  orderId: string;
  rootOrderId?: string;
  amazonOrderId?: string | null;
  orderDbId?: number | null;
  platform: Platform;
  workflow?: string | null;
  customerApprovalRequired?: boolean;
  bookId: string;
  configVersion?: number;
  formatId?: string;
  characterHash?: string | null;
  requestedShippingTier?: string | null;
  resolvedProviderShippingLevel?: string | null;
  shippingAddress?: Record<string, unknown>;
  input?: {
    characterSpecs?: Record<string, unknown>;
    bookSpecs?: Record<string, unknown>;
    orderDetails?: Record<string, unknown>;
    dedicationText?: string | null;
  };
  runId?: string;
  createdAt?: string;
}

function replacePattern(pattern: string, orderId: string): string {
  return pattern.replaceAll('{orderId}', orderId);
}

export function buildW0RunManifest(input: BuildW0RunManifestInput): RunManifestV3 {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const runId = input.runId ?? `w0-${input.orderId}-${Date.now()}`;
  const rootOrderId = input.rootOrderId ?? input.orderId;
  const config = loadBundledBookConfig({
    bookId: input.bookId,
    version: input.configVersion,
  });
  const resolved = resolvePagePlan(config, input.formatId);
  const formatId = input.formatId ?? config.defaultFormatId;
  const orderPrefix = config.assets.generated.orderPrefix.replaceAll('{orderId}', input.orderId);
  const manifestKey = `${orderPrefix}/manifests/1-manifest.json`;
  const characterPrefix = input.characterHash
    ? config.assets.generated.characterBasePrefix.replaceAll(
        '{characterHash}',
        input.characterHash,
      )
    : null;

  return {
    schema: 'lhb.run-manifest@v3',
    manifestType: 'w0',
    stage: '1-order-intake',
    createdAt,
    updatedAt: createdAt,
    runId,
    order: {
      orderId: input.orderId,
      rootOrderId,
      amazonOrderId: input.amazonOrderId ?? null,
      orderDbId: input.orderDbId ?? null,
      platform: input.platform,
      workflow: input.workflow ?? '1',
      customerApprovalRequired: input.customerApprovalRequired ?? false,
    },
    book: {
      bookConfigRef: {
        schema: config.schema,
        bookId: config.bookId,
        version: config.version,
        formatId,
      },
      resolved,
    },
    shipping: {
      requestedTier: input.requestedShippingTier ?? null,
      resolvedProviderLevel: input.resolvedProviderShippingLevel ?? null,
      address: {
        name:
          typeof input.shippingAddress?.name === 'string'
            ? input.shippingAddress.name
            : undefined,
        city:
          typeof input.shippingAddress?.city === 'string'
            ? input.shippingAddress.city
            : undefined,
        state_code:
          typeof input.shippingAddress?.state_code === 'string'
            ? input.shippingAddress.state_code
            : undefined,
        postcode:
          typeof input.shippingAddress?.postcode === 'string'
            ? input.shippingAddress.postcode
            : typeof input.shippingAddress?.postal_code === 'string'
              ? input.shippingAddress.postal_code
              : undefined,
        country_code:
          typeof input.shippingAddress?.country_code === 'string'
            ? input.shippingAddress.country_code
            : typeof input.shippingAddress?.country === 'string'
              ? input.shippingAddress.country
              : undefined,
      },
    },
    input: RunManifestInputSchema.parse({
      characterSpecs: input.input?.characterSpecs ?? {},
      bookSpecs: input.input?.bookSpecs ?? {},
      orderDetails: input.input?.orderDetails ?? {},
      dedicationText: input.input?.dedicationText ?? null,
    }),
    artifacts: {
      manifestKey,
      orderPrefix,
      characterPrefix,
    },
    entries: [],
    summary: {
      expectedPageCount: resolved.expectedPageCount,
      pageLabels: resolved.pageLabels,
      interiorPdfFilename: replacePattern(
        config.rendering.pdf.interiorFilenamePattern,
        input.orderId,
      ),
      coverPdfFilename: replacePattern(
        config.rendering.pdf.coverFilenamePattern,
        input.orderId,
      ),
    },
    errors: [],
  };
}

