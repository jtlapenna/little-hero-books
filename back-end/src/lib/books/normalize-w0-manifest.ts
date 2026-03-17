import { BookPageConfig, RunManifestV3, RunManifestV3Schema } from '@/lib/books/types';

export interface ManifestDedication {
  raw: string;
  text: string;
  htmlSafe: string;
}

export interface NormalizedW0Manifest {
  schema: string | null;
  orderId: string | null;
  rootOrderId: string | null;
  amazonOrderId: string | null;
  bookId: string | null;
  formatId: string | null;
  manifestKey: string | null;
  requiredPoseNumbers: number[];
  purchaseDate: string | null;
  buyer: {
    email: string | null;
    name: string | null;
  };
  dedication: ManifestDedication | null;
  characterSpecs: Record<string, unknown>;
  bookSpecs: Record<string, unknown>;
  orderDetails: Record<string, unknown>;
  shippingAddress: Record<string, unknown>;
  pageLabels: string[];
  pagePlan: BookPageConfig[];
}

export interface NormalizeW0ManifestOptions {
  fallbackManifestKey?: string;
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

function toStringValue(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildDedication(value: unknown): ManifestDedication | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }
    return {
      raw: trimmed,
      text: trimmed,
      htmlSafe: trimmed,
    };
  }

  const dedication = toObject(value);
  if (!dedication) {
    return null;
  }

  const raw = toStringValue(dedication.raw);
  const text = toStringValue(dedication.text) ?? raw;
  const htmlSafe = toStringValue(dedication.htmlSafe) ?? text ?? raw;
  const resolved = raw ?? text ?? htmlSafe;

  if (!resolved) {
    return null;
  }

  return {
    raw: raw ?? resolved,
    text: text ?? resolved,
    htmlSafe: htmlSafe ?? resolved,
  };
}

function extractBookIdFromManifestKey(manifestKey: string | null): string | null {
  if (!manifestKey) {
    return null;
  }

  const marker = '/orders/';
  const index = manifestKey.indexOf(marker);
  if (index <= 0) {
    return null;
  }

  return manifestKey.slice(0, index);
}

function extractOrderIdFromManifestKey(manifestKey: string | null): string | null {
  if (!manifestKey) {
    return null;
  }

  const match = /\/orders\/([^/]+)\/manifests\//.exec(manifestKey);
  return match?.[1] ?? null;
}

function normalizeV3Manifest(
  manifest: RunManifestV3,
  options: NormalizeW0ManifestOptions,
): NormalizedW0Manifest {
  const orderDetails = toObject(manifest.input.orderDetails) ?? {};
  const shippingAddress =
    toObject(orderDetails.shippingAddress) ??
    toObject(manifest.shipping.address) ??
    {};

  return {
    schema: manifest.schema,
    orderId: manifest.order.orderId,
    rootOrderId: manifest.order.rootOrderId,
    amazonOrderId: manifest.order.amazonOrderId,
    bookId: manifest.book.bookConfigRef.bookId,
    formatId: manifest.book.bookConfigRef.formatId,
    manifestKey: options.fallbackManifestKey ?? manifest.artifacts.manifestKey,
    requiredPoseNumbers: [...manifest.book.resolved.qaPolicy.pose.requiredPoseNumbers],
    purchaseDate: null,
    buyer: {
      email: null,
      name: null,
    },
    dedication: buildDedication(manifest.input.dedicationText),
    characterSpecs: toObject(manifest.input.characterSpecs) ?? {},
    bookSpecs: toObject(manifest.input.bookSpecs) ?? {},
    orderDetails: {
      ...orderDetails,
      shippingAddress,
    },
    shippingAddress,
    pageLabels: [...manifest.book.resolved.pageLabels],
    pagePlan: [...manifest.book.resolved.pagePlan],
  };
}

function normalizeLegacyManifest(
  manifest: Record<string, unknown>,
  options: NormalizeW0ManifestOptions,
): NormalizedW0Manifest {
  const order = toObject(manifest.order) ?? {};
  const orderDetails = toObject(order.orderDetails) ?? {};
  const shippingAddress =
    toObject(orderDetails.shippingAddress) ??
    toObject(manifest.shippingAddress) ??
    {};
  const manifestKey = options.fallbackManifestKey ?? null;
  const orderId =
    toStringValue(manifest.orderId) ??
    extractOrderIdFromManifestKey(manifestKey);

  return {
    schema: toStringValue(manifest.schema),
    orderId,
    rootOrderId:
      toStringValue(manifest.rootOrderId) ??
      toStringValue(manifest.siblingGroupId) ??
      toStringValue(manifest.amazonOrderId) ??
      orderId,
    amazonOrderId: toStringValue(manifest.amazonOrderId),
    bookId:
      toStringValue(manifest.bookId) ??
      extractBookIdFromManifestKey(manifestKey),
    formatId:
      toStringValue(manifest.formatId) ??
      toStringValue(order.formatId) ??
      toStringValue(toObject(order.bookSpecs)?.formatId) ??
      null,
    manifestKey,
    requiredPoseNumbers: [],
    purchaseDate: toStringValue(order.purchaseDate),
    buyer: {
      email: toStringValue(toObject(order.buyer)?.email),
      name: toStringValue(toObject(order.buyer)?.name),
    },
    dedication: buildDedication(order.dedication),
    characterSpecs: toObject(order.characterSpecs) ?? {},
    bookSpecs: toObject(order.bookSpecs) ?? {},
    orderDetails: {
      ...orderDetails,
      shippingAddress,
    },
    shippingAddress,
    pageLabels: [],
    pagePlan: [],
  };
}

export function normalizeW0Manifest(
  manifest: unknown,
  options: NormalizeW0ManifestOptions = {},
): NormalizedW0Manifest {
  if (!isRecord(manifest)) {
    throw new Error('W0 manifest must be an object');
  }

  const schema = toStringValue(manifest.schema);
  if (schema === 'lhb.run-manifest@v3') {
    const parsed = RunManifestV3Schema.safeParse(manifest);
    if (!parsed.success) {
      throw new Error(`Invalid lhb.run-manifest@v3 payload: ${parsed.error.message}`);
    }
    return normalizeV3Manifest(parsed.data, options);
  }

  return normalizeLegacyManifest(manifest, options);
}
