import { createHash } from 'node:crypto';
import {
  buildW0RunManifest,
  buildW0RunManifestRuntime,
  validateRunManifest,
} from '@/lib/books';
import type { BookConfigRuntimeSource } from '@/lib/books/runtime-book-config';
import { Platform, RunManifestV3 } from '@/lib/books/types';

const DEFAULT_BOOK_ID = 'book-mvp-simple-adventure';

export type W0ManifestSchemaVersion = 'v2.1' | 'v3';

export interface BuildOrderIntakeManifestOptions {
  schemaVersion?: W0ManifestSchemaVersion;
  bookId?: string;
  configVersion?: number;
  formatId?: string;
  configSource?: BookConfigRuntimeSource | null;
}

export interface BuildOrderIntakeManifestResult {
  manifest: Record<string, unknown> | RunManifestV3;
  manifestKey: string;
  schemaVersion: W0ManifestSchemaVersion;
  bookId: string;
  formatId: string;
}

type OrderRecord = Record<string, unknown>;

export interface NormalizedW0WorkflowInput {
  _raw?: Record<string, unknown>;
  _config?: Record<string, unknown>;
  id?: string;
  orderId?: string;
  amazonOrderId?: string | null;
  amazon_order_id?: string | null;
  marketplaceId?: string | null;
  marketplace_id?: string | null;
  orderDate?: string | null;
  purchaseDate?: string | null;
  customerEmail?: string | null;
  buyer?: Record<string, unknown>;
  items?: unknown[];
  characterSpecs?: Record<string, unknown>;
  character_specs?: Record<string, unknown>;
  bookSpecs?: Record<string, unknown>;
  book_specs?: Record<string, unknown>;
  orderDetails?: Record<string, unknown>;
  order_details?: Record<string, unknown>;
  dedication?:
    | string
    | null
    | {
        raw?: string | null;
        text?: string | null;
        htmlSafe?: string | null;
      };
  displayOrderId?: string | null;
  display_order_id?: string | null;
  characterHash?: string | null;
  character_hash?: string | null;
  previewHash?: string | null;
  preview_hash?: string | null;
  shippingTier?: string | null;
  shipping_tier?: string | null;
  thumbnailUrl?: string | null;
  thumbnail_url?: string | null;
}

export interface BuildW0OrderUpsertPayloadInput {
  normalizedInput: NormalizedW0WorkflowInput;
  manifest: Record<string, unknown> | RunManifestV3;
  manifestKey: string;
}

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

function toArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function extractDedicationText(
  value:
    | NormalizedW0WorkflowInput['dedication']
    | string
    | null
    | undefined,
): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  return (
    toStringValue(record.text) ??
    toStringValue(record.raw) ??
    toStringValue(record.htmlSafe) ??
    null
  );
}

function buildVisualCharacterHash(
  characterSpecs: Record<string, unknown> | undefined,
): string | null {
  if (!characterSpecs || Object.keys(characterSpecs).length === 0) {
    return null;
  }

  const hashInput = JSON.stringify({
    clothingStyle: toStringValue(characterSpecs.clothingStyle) || 't-shirt and shorts',
    favoriteColor: toStringValue(characterSpecs.favoriteColor) || 'blue',
    hairColor: toStringValue(characterSpecs.hairColor) || 'brown',
    hairStyle: toStringValue(characterSpecs.hairStyle) || 'short/straight',
    skinTone: toStringValue(characterSpecs.skinTone) || 'medium',
  });

  return createHash('sha256').update(hashInput).digest('hex').substring(0, 16);
}

function buildOrderRecordFromNormalizedInput(
  input: NormalizedW0WorkflowInput,
): OrderRecord {
  const raw = toObject(input._raw) ?? {};
  const orderId =
    toStringValue(input.orderId) ??
    toStringValue(input.id) ??
    toStringValue(raw.orderId) ??
    toStringValue(raw.order_id) ??
    toStringValue(raw.id);

  if (!orderId) {
    throw new Error('Normalized W0 input is missing orderId');
  }

  const marketplaceId =
    toStringValue(input.marketplaceId) ??
    toStringValue(input.marketplace_id) ??
    toStringValue(raw.marketplaceId) ??
    toStringValue(raw.marketplace_id);
  const explicitAmazonOrderId =
    toStringValue(input.amazonOrderId) ??
    toStringValue(input.amazon_order_id) ??
    toStringValue(raw.amazonOrderId) ??
    toStringValue(raw.amazon_order_id);
  const isAmazonOrder = Boolean(marketplaceId || explicitAmazonOrderId);
  const amazonOrderId = isAmazonOrder ? explicitAmazonOrderId ?? orderId : null;
  const rootOrderId =
    toStringValue(raw.rootOrderId) ??
    toStringValue(raw.root_order_id) ??
    amazonOrderId ??
    orderId;
  const buyer = toObject(input.buyer) ?? {};
  const characterSpecs =
    toObject(input.characterSpecs) ??
    toObject(input.character_specs) ??
    {};
  const bookSpecs =
    toObject(input.bookSpecs) ??
    toObject(input.book_specs) ??
    {};
  const orderDetails =
    toObject(input.orderDetails) ??
    toObject(input.order_details) ??
    {};
  const shippingAddress =
    toObject(orderDetails.shippingAddress) ??
    toObject(orderDetails.shipping_address) ??
    {};
  const quantity = toPositiveInt(orderDetails.quantity) ?? 1;
  const dedicationText = extractDedicationText(input.dedication);
  const items = toArray(input.items) ?? [];
  const purchaseDate =
    toStringValue(input.orderDate) ??
    toStringValue(input.purchaseDate) ??
    toStringValue(raw.orderDate) ??
    toStringValue(raw.purchaseDate) ??
    new Date().toISOString();

  return {
    orderId,
    order_id: orderId,
    root_order_id: rootOrderId,
    amazon_order_id: amazonOrderId,
    marketplace_id: marketplaceId ?? null,
    platform: isAmazonOrder ? 'amazon' : 'd2c',
    purchase_date: purchaseDate,
    created_at: purchaseDate,
    customer_email:
      toStringValue(input.customerEmail) ??
      toStringValue(buyer.email) ??
      null,
    customer_name:
      toStringValue(buyer.name) ??
      toStringValue(shippingAddress.name) ??
      null,
    dedication_text: dedicationText,
    character_specs: characterSpecs,
    book_specs: bookSpecs,
    product_info: {
      quantity,
      shippingAddress,
      bookSpecs,
      line_items: items,
    },
    display_order_id:
      toStringValue(input.displayOrderId) ??
      toStringValue(input.display_order_id) ??
      null,
    preview_hash:
      toStringValue(input.previewHash) ??
      toStringValue(input.preview_hash) ??
      null,
    shipping_tier:
      toStringValue(input.shippingTier) ??
      toStringValue(input.shipping_tier) ??
      null,
    thumbnail_url:
      toStringValue(input.thumbnailUrl) ??
      toStringValue(input.thumbnail_url) ??
      null,
  };
}

function buildLegacyManifestPayload(
  order: OrderRecord,
  createdAt: string,
  dedicationText: string | null,
  characterSpecs: Record<string, unknown>,
  bookSpecs: Record<string, unknown>,
  orderDetails: Record<string, unknown>,
  amazonOrderId: string | null,
) {
  return {
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
  };
}

function buildV3ManifestInput(
  order: OrderRecord,
  orderId: string,
  options: BuildOrderIntakeManifestOptions,
  selection: ReturnType<typeof normalizeManifestSelection>,
  characterSpecs: Record<string, unknown>,
  shippingAddress: Record<string, unknown>,
  orderDetails: Record<string, unknown>,
  dedicationText: string | null,
) {
  const amazonOrderId = toStringValue(order.amazon_order_id) ?? null;
  const rootOrderId =
    toStringValue(order.root_order_id) ?? amazonOrderId ?? orderId;

  return {
    orderId,
    rootOrderId,
    amazonOrderId,
    orderDbId: toPositiveInt(order.id) ?? null,
    platform: normalizePlatform(order),
    workflow: '1',
    customerApprovalRequired: toBooleanValue(order.customer_approval_required),
    bookId: selection.bookId,
    configVersion: options.configVersion,
    configSource: options.configSource,
    formatId: selection.formatId,
    characterHash: toStringValue(order.character_hash) ?? null,
    requestedShippingTier:
      toStringValue(order.shipping_tier) ??
      toStringValue(selection.productInfo.shippingTier) ??
      null,
    resolvedProviderShippingLevel:
      toStringValue(order.amazon_shipment_service_level) ?? null,
    shippingAddress,
    input: {
      characterSpecs,
      bookSpecs: selection.bookSpecs,
      orderDetails,
      dedicationText,
    },
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

  if (schemaVersion === 'v2.1') {
    return {
      manifest: buildLegacyManifestPayload(
        order,
        createdAt,
        dedicationText,
        characterSpecs,
        bookSpecs,
        orderDetails,
        amazonOrderId,
      ),
      manifestKey,
      schemaVersion,
      bookId,
      formatId,
    };
  }

  const manifest = validateRunManifest(
    buildW0RunManifest(
      buildV3ManifestInput(
        order,
        orderId,
        options,
        { productInfo, bookSpecs, formatId, bookId },
        characterSpecs,
        shippingAddress,
        orderDetails,
        dedicationText,
      ),
    ),
  );

  return {
    manifest,
    manifestKey: manifest.artifacts.manifestKey,
    schemaVersion,
    bookId,
    formatId: manifest.book.bookConfigRef.formatId,
  };
}

export async function buildOrderIntakeManifestFromOrderRuntime(
  order: OrderRecord,
  orderId: string,
  options: BuildOrderIntakeManifestOptions = {},
): Promise<BuildOrderIntakeManifestResult> {
  const createdAt = new Date().toISOString();
  const schemaVersion = resolveW0ManifestSchemaVersion(options.schemaVersion);
  const selection = normalizeManifestSelection(order, options);
  const characterSpecs = normalizeCharacterSpecs(order);
  const shippingAddress = normalizeShippingAddress(order, selection.productInfo);
  const orderDetails = normalizeOrderDetails(selection.productInfo, shippingAddress);
  const manifestKey = `${selection.bookId}/orders/${orderId}/manifests/1-manifest.json`;
  const dedicationText = toStringValue(order.dedication_text) ?? null;
  const amazonOrderId = toStringValue(order.amazon_order_id) ?? null;

  if (schemaVersion === 'v2.1') {
    return {
      manifest: buildLegacyManifestPayload(
        order,
        createdAt,
        dedicationText,
        characterSpecs,
        selection.bookSpecs,
        orderDetails,
        amazonOrderId,
      ),
      manifestKey,
      schemaVersion,
      bookId: selection.bookId,
      formatId: selection.formatId,
    };
  }

  const manifest = validateRunManifest(
    await buildW0RunManifestRuntime(
      buildV3ManifestInput(
        order,
        orderId,
        options,
        selection,
        characterSpecs,
        shippingAddress,
        orderDetails,
        dedicationText,
      ),
    ),
  );

  return {
    manifest,
    manifestKey: manifest.artifacts.manifestKey,
    schemaVersion,
    bookId: selection.bookId,
    formatId: manifest.book.bookConfigRef.formatId,
  };
}

export async function buildOrderIntakeManifestFromNormalizedInputRuntime(
  input: NormalizedW0WorkflowInput,
  options: BuildOrderIntakeManifestOptions = {},
): Promise<BuildOrderIntakeManifestResult> {
  const order = buildOrderRecordFromNormalizedInput(input);
  const orderId = toStringValue(order.orderId);

  if (!orderId) {
    throw new Error('Normalized W0 input did not produce a valid orderId');
  }

  return buildOrderIntakeManifestFromOrderRuntime(order, orderId, options);
}

export function buildW0OrderUpsertPayload({
  normalizedInput,
  manifest,
  manifestKey,
}: BuildW0OrderUpsertPayloadInput): Record<string, unknown> {
  const manifestRecord = manifest as Record<string, unknown>;
  const manifestOrder = toObject(manifestRecord.order) ?? {};
  const manifestInput = toObject(manifestRecord.input) ?? {};
  const buyer = toObject(manifestOrder.buyer) ?? {};
  const characterSpecs =
    toObject(manifestInput.characterSpecs) ??
    toObject(manifestOrder.characterSpecs) ??
    {};
  const bookSpecs =
    toObject(manifestInput.bookSpecs) ??
    toObject(manifestOrder.bookSpecs) ??
    {};
  const orderDetails =
    toObject(manifestInput.orderDetails) ??
    toObject(manifestOrder.orderDetails) ??
    {};
  const shippingAddress =
    toObject(orderDetails.shippingAddress) ??
    toObject(orderDetails.shipping_address) ??
    {};
  const primaryOrderId =
    toStringValue(manifestOrder.orderId) ??
    toStringValue(manifestRecord.orderId) ??
    toStringValue(manifestOrder.amazonOrderId) ??
    toStringValue(manifestRecord.amazonOrderId);

  if (!primaryOrderId) {
    throw new Error('Manifest is missing orderId for Supabase upsert payload');
  }

  const explicitCharacterHash =
    toStringValue(normalizedInput.characterHash) ??
    toStringValue(normalizedInput.character_hash) ??
    toStringValue(normalizedInput._raw?.characterHash) ??
    toStringValue(normalizedInput._raw?.character_hash) ??
    null;
  const body: Record<string, unknown> = {
    orderId: primaryOrderId,
    execution_status: 'ready_for_processing',
    next_workflow: '2A',
    one_manifest_url: manifestKey,
    root_order_id:
      toStringValue(manifestOrder.rootOrderId) ??
      toStringValue(normalizedInput._raw?.rootOrderId) ??
      toStringValue(normalizedInput._raw?.root_order_id) ??
      primaryOrderId,
    dedication_text:
      toStringValue(manifestInput.dedicationText) ??
      extractDedicationText(manifestOrder.dedication as any),
    character_specs: characterSpecs,
    character_hash: explicitCharacterHash ?? buildVisualCharacterHash(characterSpecs),
    customer_email:
      toStringValue(buyer.email) ??
      toStringValue(normalizedInput.customerEmail) ??
      null,
    customer_name:
      toStringValue(buyer.name) ??
      toStringValue(toObject(normalizedInput.buyer)?.name) ??
      toStringValue(shippingAddress.name) ??
      null,
    shipping_address: shippingAddress,
    product_info: orderDetails,
    purchase_date:
      toStringValue(manifestOrder.purchaseDate) ??
      toStringValue(normalizedInput.orderDate) ??
      toStringValue(normalizedInput.purchaseDate) ??
      null,
    workflow_step: 'order_intake',
    status: 'new',
    marketplace_id:
      toStringValue(manifestRecord.marketplaceId) ??
      toStringValue(normalizedInput.marketplaceId) ??
      toStringValue(normalizedInput.marketplace_id) ??
      toStringValue(normalizedInput._raw?.marketplaceId) ??
      toStringValue(normalizedInput._raw?.marketplace_id) ??
      null,
    book_specs: bookSpecs,
    display_order_id:
      toStringValue((manifestOrder as Record<string, unknown>).displayOrderId) ??
      toStringValue(normalizedInput.displayOrderId) ??
      toStringValue(normalizedInput.display_order_id) ??
      null,
    preview_hash:
      toStringValue((manifestOrder as Record<string, unknown>).previewHash) ??
      toStringValue(normalizedInput.previewHash) ??
      toStringValue(normalizedInput.preview_hash) ??
      null,
    shipping_tier:
      toStringValue((manifestOrder as Record<string, unknown>).shippingTier) ??
      toStringValue(normalizedInput.shippingTier) ??
      toStringValue(normalizedInput.shipping_tier) ??
      null,
    thumbnail_url:
      toStringValue((manifestOrder as Record<string, unknown>).thumbnailUrl) ??
      toStringValue(normalizedInput.thumbnailUrl) ??
      toStringValue(normalizedInput.thumbnail_url) ??
      null,
  };

  const amazonOrderId =
    toStringValue(manifestOrder.amazonOrderId) ??
    toStringValue(manifestRecord.amazonOrderId);
  if (amazonOrderId) {
    body.amazon_order_id = amazonOrderId;
  }

  return body;
}
