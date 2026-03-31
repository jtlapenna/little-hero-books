import {
  buildBaseCharacterAssetKey,
  resolveOrderPathContext,
} from '@/lib/order-paths';

type JsonRecord = Record<string, unknown>;

export interface FinalizeW2ABaseResultOutput {
  success: true;
  orderId: string;
  rootOrderId: string | null;
  amazonOrderId: string | null;
  bookId: string;
  formatId: string | null;
  orderPrefix: string;
  oneManifestUrl: string | null;
  publicR2Url: string | null;
  characterHash: string;
  characterPath: string;
  assetsRoot: string;
  baseCharacterKey: string;
  baseRefPublicUrl: string | null;
  hairRefS3Key: string | null;
  hairRefPublicUrl: string | null;
  skinToneCanonical: string | null;
  clothingTypeCanonical: string | null;
  hairStyleCanonical: string | null;
  hairPromptMeta: JsonRecord;
  hairPromptBlock: string;
  characterSpecs: JsonRecord;
  generatedFileName: string;
  generatedImage: {
    mimeType: string;
    size: number | null;
    isMock: boolean;
    modelVersion: string | null;
  };
  base: {
    uploadKey: string;
    publicUrl: string | null;
    mime: string;
    bytes: number | null;
  };
  uploadKey: string;
  storageKey: string;
  __meta: JsonRecord;
  __testMode: boolean;
  testMode: boolean;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value);
  }

  if (typeof value !== 'string') {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }
  }

  return false;
}

function joinUrl(base: string | null | undefined, key: string | null | undefined): string | null {
  const normalizedBase = toTrimmedString(base);
  const normalizedKey = toTrimmedString(key);

  if (!normalizedBase || !normalizedKey) {
    return null;
  }

  return `${normalizedBase.replace(/\/$/, '')}/${normalizedKey.replace(/^\/+/, '')}`;
}

function deriveCharacterHash(input: JsonRecord): string | null {
  const direct =
    toTrimmedString(input.characterHash) ??
    toTrimmedString(toRecord(input.ctx).characterHash) ??
    null;
  if (direct) {
    return direct;
  }

  const candidates = [
    toTrimmedString(input.characterPath),
    toTrimmedString(input.baseCharacterKey),
    toTrimmedString(input.generatedFileName),
    toTrimmedString(input.baseGeneratedFileName),
    toTrimmedString(toRecord(input.__meta).storageKey),
    toTrimmedString(toRecord(input.__meta).generatedAttemptKey),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const pathMatch = candidate.match(/characters\/([^/]+)/i);
    if (pathMatch?.[1]) {
      return pathMatch[1];
    }
    const fileMatch = candidate.match(/characters_([A-Za-z0-9]+)_base\./i);
    if (fileMatch?.[1]) {
      return fileMatch[1];
    }
  }

  return null;
}

export function finalizeW2ABaseResult(
  input: JsonRecord,
): FinalizeW2ABaseResultOutput {
  const orderContext = toRecord(input.orderContext);
  const orderId =
    toTrimmedString(input.orderId) ??
    toTrimmedString(orderContext.orderId);
  if (!orderId) {
    throw new Error('W2A base result requires orderId');
  }

  const characterHash = deriveCharacterHash(input);
  if (!characterHash) {
    throw new Error('W2A base result requires characterHash');
  }

  const explicitBookId =
    toTrimmedString(input.bookId) ??
    toTrimmedString(orderContext.bookId);
  const explicitOrderPrefix =
    toTrimmedString(input.orderPrefix) ??
    toTrimmedString(input.order_prefix) ??
    toTrimmedString(orderContext.orderPrefix);
  const { bookId, orderPrefix } = resolveOrderPathContext(orderId, {
    bookId: explicitBookId ?? undefined,
    orderPrefix: explicitOrderPrefix ?? undefined,
    pathLikes: [
      toTrimmedString(input.oneManifestUrl),
      toTrimmedString(input.one_manifest_url),
      explicitOrderPrefix,
      toTrimmedString(input.baseCharacterKey),
    ].filter((value): value is string => Boolean(value)),
  });

  const assetsRoot =
    toTrimmedString(input.assetsRoot) ??
    `${bookId}/order-generated-assets`;
  const baseCharacterKey =
    toTrimmedString(input.baseCharacterKey) ??
    toTrimmedString(toRecord(input.__meta).storageKey) ??
    buildBaseCharacterAssetKey(characterHash, bookId);
  const generatedFileName =
    toTrimmedString(input.generatedFileName) ??
    toTrimmedString(input.baseGeneratedFileName) ??
    toTrimmedString(toRecord(input.__meta).generatedAttemptKey) ??
    `characters_${characterHash}_base.png`;
  const publicR2Url =
    toTrimmedString(input.publicR2Url) ??
    toTrimmedString(orderContext.publicR2Url) ??
    null;
  const hairPromptMeta = toRecord(input.hairPromptMeta);
  const hairRefS3Key =
    toTrimmedString(input.hairRefS3Key) ??
    toTrimmedString(hairPromptMeta.hairRefS3Key) ??
    null;
  const generatedImageRecord = toRecord(input.generatedImage);
  const generatedMimeType =
    toTrimmedString(generatedImageRecord.mimeType) ??
    toTrimmedString(toRecord(input.base).mime) ??
    'image/png';
  const generatedBytes =
    toInteger(generatedImageRecord.size) ??
    toInteger(toRecord(input.base).bytes) ??
    toInteger(toRecord(input.__meta).bytes) ??
    null;
  const testMode = [
    input.testMode,
    input.__testMode,
    orderContext.testMode,
    orderContext.__testMode,
  ].some(toBoolean);
  const finalMeta: JsonRecord = {
    ...toRecord(input.__meta),
    storageKey: baseCharacterKey,
    baseUploadKey: baseCharacterKey,
    generatedAttemptKey: generatedFileName,
    sw0Finalized: true,
    sw0FinalizerVersion: 'repo-w2a-base-result@v1',
  };
  if (generatedBytes !== null) {
    finalMeta.bytes = generatedBytes;
  }

  return {
    success: true,
    orderId,
    rootOrderId:
      toTrimmedString(input.rootOrderId) ??
      toTrimmedString(input.root_order_id) ??
      toTrimmedString(input.amazonOrderId) ??
      toTrimmedString(input.amazon_order_id) ??
      toTrimmedString(orderContext.rootOrderId) ??
      toTrimmedString(orderContext.root_order_id) ??
      null,
    amazonOrderId:
      toTrimmedString(input.amazonOrderId) ??
      toTrimmedString(input.amazon_order_id) ??
      toTrimmedString(orderContext.amazonOrderId) ??
      toTrimmedString(orderContext.amazon_order_id) ??
      toTrimmedString(input.rootOrderId) ??
      toTrimmedString(orderContext.rootOrderId) ??
      null,
    bookId,
    formatId:
      toTrimmedString(input.formatId) ??
      toTrimmedString(orderContext.formatId) ??
      null,
    orderPrefix,
    oneManifestUrl:
      toTrimmedString(input.oneManifestUrl) ??
      toTrimmedString(input.one_manifest_url) ??
      toTrimmedString(orderContext.oneManifestUrl) ??
      null,
    publicR2Url,
    characterHash,
    characterPath:
      toTrimmedString(input.characterPath) ??
      `characters/${characterHash}`,
    assetsRoot,
    baseCharacterKey,
    baseRefPublicUrl:
      joinUrl(publicR2Url, baseCharacterKey),
    hairRefS3Key,
    hairRefPublicUrl: joinUrl(publicR2Url, hairRefS3Key),
    skinToneCanonical: toTrimmedString(input.skinToneCanonical),
    clothingTypeCanonical:
      toTrimmedString(input.clothingTypeCanonical) ??
      toTrimmedString(hairPromptMeta.clothingTypeCanonical),
    hairStyleCanonical:
      toTrimmedString(input.hairStyleCanonical) ??
      toTrimmedString(hairPromptMeta.styleKey),
    hairPromptMeta,
    hairPromptBlock: toTrimmedString(input.hairPromptBlock) ?? '',
    characterSpecs: toRecord(input.characterSpecs),
    generatedFileName,
    generatedImage: {
      mimeType: generatedMimeType,
      size: generatedBytes,
      isMock: toBoolean(generatedImageRecord.isMock),
      modelVersion: toTrimmedString(generatedImageRecord.modelVersion),
    },
    base: {
      uploadKey: baseCharacterKey,
      publicUrl: joinUrl(publicR2Url, baseCharacterKey),
      mime: generatedMimeType,
      bytes: generatedBytes,
    },
    uploadKey: baseCharacterKey,
    storageKey: baseCharacterKey,
    __meta: finalMeta,
    __testMode: testMode,
    testMode,
  };
}
