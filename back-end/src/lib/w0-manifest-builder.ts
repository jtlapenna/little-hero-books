import { buildW0RunManifest, validateRunManifest } from '@/lib/books';
import { Platform, RunManifestV3 } from '@/lib/books/types';

const DEFAULT_BOOK_ID = 'book-mvp-simple-adventure';

export type W0ManifestSchemaVersion = 'v2.1' | 'v3';

export interface BuildOrderIntakeManifestOptions {
  schemaVersion?: W0ManifestSchemaVersion;
  bookId?: string;
  configVersion?: number;
  formatId?: string;
}

export interface BuildOrderIntakeManifestResult {
  manifest: Record<string, unknown> | RunManifestV3;
  manifestKey: string;
  schemaVersion: W0ManifestSchemaVersion;
  bookId: string;
  formatId: string;
}

type OrderRecord = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toObject(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value)) {
    return value;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function toStringValue(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toPositiveInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function toBooleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function normalizeProductInfo(order: OrderRecord): Record<string, unknown> {
  return toObject(order.product_info) ?? toObject(order.productInfo) ?? {};
}

function normalizeCharacterSpecs(order: OrderRecord): Record<string, unknown> {
  return toObject(order.character_specs) ?? toObject(order.characterSpecs) ?? {};
}

function normalizeShippingAddress(
  order: OrderRecord,
  productInfo: Record<string, unknown>,
): Record<string, unknown> {
  return (
    toObject(productInfo.shippingAddress) ??
    toObject(productInfo.shipping_address) ??
    toObject(order.shipping_address) ??
    toObject(order.shippingAddress) ??
    {}
  );
}

function normalizeBookSpecs(
  order: OrderRecord,
  productInfo: Record<string, unknown>,
): Record<string, unknown> {
  const existing =
    toObject(productInfo.bookSpecs) ??
    toObject(order.book_specs) ??
    toObject(order.bookSpecs);

  if (existing && Object.keys(existing).length > 0) {
    return existing;
  }

  return {
    title: toStringValue(productInfo.title) ?? 'Adventure Book',
    totalPages: 16,
    format: '8.5x8.5_softcover',
    bookType: 'adventure',
  };
}

function normalizeOrderDetails(
  productInfo: Record<string, unknown>,
  shippingAddress: Record<string, unknown>,
): Record<string, unknown> {
  const orderDetails =
    toObject(productInfo.orderDetails) ?? toObject(productInfo.order_details) ?? {};

  return {
    ...orderDetails,
    quantity: toPositiveInt(productInfo.quantity) ?? 1,
    shippingAddress,
  };
}

function normalizePlatform(order: OrderRecord): Platform {
  const explicitPlatform = toStringValue(order.platform)?.toLowerCase();
  if (explicitPlatform === 'd2c') {
    return 'd2c';
  }

  if (explicitPlatform === 'amazon') {
    return 'amazon';
  }

  return toStringValue(order.amazon_order_id) || toStringValue(order.marketplace_id)
    ? 'amazon'
    : 'd2c';
}

function resolveBookId(
  order: OrderRecord,
  productInfo: Record<string, unknown>,
  bookSpecs: Record<string, unknown>,
  options: BuildOrderIntakeManifestOptions,
): string {
  return (
    options.bookId ??
    toStringValue(bookSpecs.bookId) ??
    toStringValue(productInfo.bookId) ??
    toStringValue(order.book_id) ??
    DEFAULT_BOOK_ID
  );
}

function resolveFormatId(
  order: OrderRecord,
  productInfo: Record<string, unknown>,
  bookSpecs: Record<string, unknown>,
  options: BuildOrderIntakeManifestOptions,
): string {
  const explicitFormatId =
    options.formatId ??
    toStringValue(bookSpecs.formatId) ??
    toStringValue(productInfo.formatId) ??
    toStringValue(order.format_id);

  if (explicitFormatId) {
    return explicitFormatId;
  }

  const legacyFormat = toStringValue(bookSpecs.format)?.toLowerCase();
  if (legacyFormat?.includes('amazon')) {
    return 'amazon';
  }

  const channel = toStringValue(bookSpecs.channel)?.toLowerCase();
  if (channel === 'amazon') {
    return 'amazon';
  }

  return normalizePlatform(order) === 'amazon' ? 'amazon' : 'standard';
}

function normalizeManifestSelection(
  order: OrderRecord,
  options: BuildOrderIntakeManifestOptions,
) {
  const productInfo = normalizeProductInfo(order);
  const bookSpecs = normalizeBookSpecs(order, productInfo);
  const formatId = resolveFormatId(order, productInfo, bookSpecs, options);
  const bookId = resolveBookId(order, productInfo, bookSpecs, options);

  return {
    productInfo,
    bookSpecs,
    formatId,
    bookId,
  };
}

export function resolveW0ManifestSchemaVersion(
  value: unknown,
): W0ManifestSchemaVersion {
  return value === 'v3' ? 'v3' : 'v2.1';
}

export function buildOrderIntakeManifestFromOrder(
  order: OrderRecord,
  orderId: string,
  options: BuildOrderIntakeManifestOptions = {},
): BuildOrderIntakeManifestResult {
  const createdAt = new Date().toISOString();
  const schemaVersion = resolveW0ManifestSchemaVersion(options.schemaVersion);
  const { productInfo, bookSpecs, bookId, formatId } = normalizeManifestSelection(
    order,
    options,
  );
  const characterSpecs = normalizeCharacterSpecs(order);
  const shippingAddress = normalizeShippingAddress(order, productInfo);
  const orderDetails = normalizeOrderDetails(productInfo, shippingAddress);
  const manifestKey = `${bookId}/orders/${orderId}/manifests/1-manifest.json`;
  const dedicationText = toStringValue(order.dedication_text) ?? null;
  const amazonOrderId = toStringValue(order.amazon_order_id) ?? null;
  const rootOrderId =
    toStringValue(order.root_order_id) ?? amazonOrderId ?? orderId;

  if (schemaVersion === 'v2.1') {
    return {
      manifest: {
        schema: 'lhb.run-manifest@v2.1',
        runStamp: createdAt,
        amazonOrderId,
        marketplaceId: toStringValue(order.marketplace_id) ?? null,
        order: {
          purchaseDate:
            toStringValue(order.purchase_date) ??
            toStringValue(order.created_at) ??
            null,
          buyer: {
            email: toStringValue(order.customer_email) ?? null,
            name: toStringValue(order.customer_name) ?? null,
          },
          dedication: dedicationText
            ? {
                raw: dedicationText,
                text: dedicationText,
                htmlSafe: dedicationText,
              }
            : null,
          characterSpecs,
          bookSpecs,
          orderDetails,
        },
      },
      manifestKey,
      schemaVersion,
      bookId,
      formatId,
    };
  }

  const manifest = validateRunManifest(
    buildW0RunManifest({
      orderId,
      rootOrderId,
      amazonOrderId,
      orderDbId: toPositiveInt(order.id) ?? null,
      platform: normalizePlatform(order),
      workflow: '1',
      customerApprovalRequired: toBooleanValue(order.customer_approval_required),
      bookId,
      configVersion: options.configVersion,
      formatId,
      characterHash: toStringValue(order.character_hash) ?? null,
      requestedShippingTier:
        toStringValue(order.shipping_tier) ??
        toStringValue(productInfo.shippingTier) ??
        null,
      resolvedProviderShippingLevel:
        toStringValue(order.amazon_shipment_service_level) ?? null,
      shippingAddress,
      input: {
        characterSpecs,
        bookSpecs,
        orderDetails,
        dedicationText,
      },
    }),
  );

  return {
    manifest,
    manifestKey: manifest.artifacts.manifestKey,
    schemaVersion,
    bookId,
    formatId: manifest.book.bookConfigRef.formatId,
  };
}
