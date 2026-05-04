import { resolvePreviewCanonicalsForConfig } from '@/lib/preview-canonicals';
import {
  buildAssetApiUrl,
  buildBaseCharacterAssetKey,
  buildGeneratedPoseAssetKey,
  buildPoseReferenceAssetKey,
  resolveOrderPathContext,
} from '@/lib/order-paths';
import {
  loadRuntimeBookConfig,
  type BookConfigRuntimeSource,
} from '@/lib/books/runtime-book-config';
import type { BookConfig } from '@/lib/books/types';
import { resolveCanonicalBackendBaseUrl } from '@/lib/backend-url';
import { EYEBROW_PROMPT_GUARDRAIL } from '@/lib/books/character-prompt-guardrails';

type JsonRecord = Record<string, unknown>;

type LoadConfigForW2APoseInput = (options: {
  bookId: string;
  version?: number;
  source?: BookConfigRuntimeSource | null;
}) => Promise<BookConfig>;

export interface W2APosePromptMeta {
  version: 'repo-w2a-pose-input@v1';
  labels: {
    base: 'BASE';
    pose: 'POSE';
    hair: 'HAIR CHIP';
  };
  poseNumber: number;
  pageLabel: string | null;
  pageType: string | null;
  storyPageNumber: number | null;
  backgroundSlot: string | null;
  retryAttempt: number;
  hasHairRef: boolean;
}

export interface BuildW2APoseInputResult {
  orderId: string;
  rootOrderId: string | null;
  amazonOrderId: string | null;
  bookId: string;
  formatId: string;
  orderPrefix: string;
  backendUrl: string;
  publicR2Url: string | null;
  oneManifestUrl: string | null;
  characterHash: string;
  poseNumber: number;
  currentPoseNumber: number;
  poseNN: string;
  poseNNHyphen: string;
  pageLabel: string | null;
  pageType: string | null;
  storyPageNumber: number | null;
  backgroundSlot: string | null;
  assetsRoot: string;
  baseCharacterKey: string;
  baseRefPublicUrl: string | null;
  poseRefKey: string;
  poseRefKeyAlt: string;
  poseRefPublicUrl: string | null;
  poseRefPublicUrlAlt: string | null;
  hairRefS3Key: string | null;
  hairRefPublicUrl: string | null;
  hairStyleCanonical: string | null;
  clothingTypeCanonical: string | null;
  favoriteColorHex: string | null;
  hairPromptMeta: JsonRecord;
  retryAttempt: number;
  retryTag: string | null;
  maxPoseRetries: number;
  testMode: boolean;
  correlationId: string;
  generatedFileName: string;
  uploadKey: string;
  uploadApiPath: string;
  posePromptPreface: string;
  posePromptBlock: string;
  userPromptText: string;
  promptMeta: W2APosePromptMeta;
}

export interface BuildW2APoseInputOptions {
  loadConfig?: LoadConfigForW2APoseInput;
  defaultBackendUrl?: string;
  defaultPublicR2Url?: string | null;
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

function toPositiveInteger(value: unknown, fallback: number): number {
  const parsed = toInteger(value);
  return parsed !== null && parsed > 0 ? parsed : fallback;
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

function isNonEmpty(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 && normalized !== 'undefined' && normalized !== 'null';
  }

  return true;
}

function pickFirstNonEmpty<T>(...values: T[]): T | null {
  for (const value of values) {
    if (isNonEmpty(value)) {
      return value;
    }
  }

  return null;
}

function joinUrl(base: string | null | undefined, key: string | null | undefined): string | null {
  const normalizedBase = toTrimmedString(base);
  const normalizedKey = toTrimmedString(key);

  if (!normalizedBase || !normalizedKey) {
    return null;
  }

  return `${normalizedBase.replace(/\/$/, '')}/${normalizedKey.replace(/^\/+/, '')}`;
}

function normalizeLikelyUrl(value: unknown): string | null {
  const trimmed = toTrimmedString(value);
  if (!trimmed) {
    return null;
  }

  if (/^https?:\/[^/]/i.test(trimmed)) {
    return trimmed.replace(/^(https?):\/(?!\/)/i, '$1://');
  }

  return trimmed;
}

function isLocalDevelopmentUrl(value: string | null): boolean {
  if (!value) {
    return false;
  }

  return /^https?:\/\/(?:localhost|127(?:\.\d+){3}|0\.0\.0\.0)(?::\d+)?(?:\/|$)/i.test(value);
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '-');
}

function normalizeConfigSource(value: unknown): BookConfigRuntimeSource {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'bundled' || normalized === 'published' || normalized === 'published-first') {
    return normalized;
  }
  return 'published-first';
}

function resolveFormatId(primary: JsonRecord, orderContext: JsonRecord): string {
  return (
    toTrimmedString(primary.formatId) ??
    toTrimmedString(orderContext.formatId) ??
    (pickFirstNonEmpty(
      primary.amazonOrderId,
      primary.amazon_order_id,
      primary.rootOrderId,
      primary.root_order_id,
      orderContext.amazonOrderId,
      orderContext.amazon_order_id,
      orderContext.rootOrderId,
      orderContext.root_order_id,
    )
      ? 'amazon'
      : 'standard')
  );
}

function resolvePathLikes(primary: JsonRecord, orderContext: JsonRecord): string[] {
  const values = [
    primary.oneManifestUrl,
    primary.one_manifest_url,
    primary.orderPrefix,
    primary.order_prefix,
    primary.assetPrefix,
    primary.asset_prefix,
    primary.assetsRoot,
    primary.assets_root,
    orderContext.oneManifestUrl,
    orderContext.one_manifest_url,
    orderContext.orderPrefix,
    orderContext.order_prefix,
    orderContext.assetPrefix,
    orderContext.asset_prefix,
    orderContext.assetsRoot,
    orderContext.assets_root,
  ];

  return values
    .map((value) => toTrimmedString(value))
    .filter((value): value is string => Boolean(value));
}

function mergeRecords(...values: unknown[]): JsonRecord {
  return values.reduce<JsonRecord>((acc, value) => {
    if (!isRecord(value)) {
      return acc;
    }
    return {
      ...acc,
      ...value,
    };
  }, {});
}

function extractCompatSnapshot(input: JsonRecord): JsonRecord {
  const meta = toRecord(input.__meta);
  const deriveQaPass = toRecord(meta.deriveQaPass);
  return mergeRecords(
    input.orderData,
    input.ctx,
    meta.snapshot,
    deriveQaPass.snapshot,
  );
}

function deriveOrderIdFromCorrelationId(
  correlationId: unknown,
  characterHash: unknown,
): string | null {
  const normalizedCorrelationId = toTrimmedString(correlationId);
  if (!normalizedCorrelationId) {
    return null;
  }

  const normalizedCharacterHash = toTrimmedString(characterHash);
  if (normalizedCharacterHash) {
    const marker = `-${normalizedCharacterHash}-`;
    const markerIndex = normalizedCorrelationId.indexOf(marker);
    if (markerIndex > 0) {
      return normalizedCorrelationId.slice(0, markerIndex);
    }
  }

  const patternMatch = normalizedCorrelationId.match(
    /^(.*?)-[A-Za-z0-9]{6,64}-(?:POSE|STYLE)\d{2}(?:-R\d+)?(?:-.+)?$/,
  );
  return patternMatch?.[1] ?? null;
}

function extractSkinToneVariantKey(characterSpecs: JsonRecord): string | null {
  const raw = String(
    pickFirstNonEmpty(
      characterSpecs.skinTone,
      characterSpecs.skin_tone,
      characterSpecs.skinToneCanonical,
      '',
    ) ?? '',
  )
    .trim()
    .toLowerCase();

  if (!raw) {
    return null;
  }

  if (['deep', 'skin-deep', 'dark'].includes(raw)) {
    return 'deep';
  }

  if (['medium-dark', 'skin-medium-dark', 'skin-brown-light'].includes(raw)) {
    return 'medium-dark';
  }

  return null;
}

function resolvePoseReferenceKey(
  config: BookConfig,
  poseNumber: number,
  characterSpecs: JsonRecord,
): string {
  const poseVariantKey = extractSkinToneVariantKey(characterSpecs);
  const variantBasePath =
    (poseVariantKey && config.assets.poses.skinToneVariantPaths[poseVariantKey]) || null;
  const poseNN = String(Math.max(0, poseNumber)).padStart(2, '0');

  if (variantBasePath) {
    return `${variantBasePath.replace(/\/+$/, '')}/pose${poseNN}.png`;
  }

  return buildPoseReferenceAssetKey(config.bookId, poseNumber);
}

function buildRetryAwareUploadKey(
  characterHash: string,
  poseNumber: number,
  retryAttempt: number,
  bookId: string,
): { uploadKey: string; fileName: string } {
  const baseKey = buildGeneratedPoseAssetKey(characterHash, poseNumber, bookId);
  const poseNN = String(Math.max(0, poseNumber)).padStart(2, '0');
  const suffix = retryAttempt > 0 ? `_r${retryAttempt}` : '';
  const fileName = `pose${poseNN}${suffix}.png`;

  return {
    uploadKey: baseKey.replace(/pose\d{2}\.png$/, fileName),
    fileName,
  };
}

function buildCorrelationId(options: {
  orderId: string;
  characterHash: string;
  poseNumber: number;
  retryAttempt: number;
  retryTag: string | null;
}): string {
  const poseNN = String(Math.max(0, options.poseNumber)).padStart(2, '0');
  const retrySegment = options.retryAttempt > 0 ? `-R${options.retryAttempt}` : '';
  const tagSegment = options.retryTag ? `-${sanitizeId(options.retryTag)}` : '';

  return [
    sanitizeId(options.orderId),
    sanitizeId(options.characterHash).slice(0, 16),
    `POSE${poseNN}${retrySegment}${tagSegment}`,
  ]
    .filter(Boolean)
    .join('-');
}

function buildPosePromptBlock(input: {
  childName: string | null;
  favoriteAnimal: string | null;
  clothingTypeCanonical: string | null;
  poseNumber: number;
  pageLabel: string | null;
  pageType: string | null;
  storyPageNumber: number | null;
  backgroundSlot: string | null;
  hasHairRef: boolean;
  posePromptPreface: string;
}): string {
  const lines: string[] = [];

  if (input.posePromptPreface) {
    lines.push(input.posePromptPreface, '');
  }

  lines.push(
    'STYLE TRANSFER TASK:',
    'Use BASE for appearance, palette, facial features, and hair color.',
    'Preserve BASE facial features exactly, including two visible natural eyebrows above the eyes.',
    'Use POSE for body pose only.',
    input.hasHairRef
      ? 'Use HAIR CHIP for hair silhouette only. Hair color must still match BASE exactly.'
      : 'No HAIR CHIP is provided. Keep both hair silhouette and hair color aligned to BASE.',
    'Render exactly one child on a pure white background.',
    'Show the full body, including hands and feet.',
    'Do not transfer props, textures, or background details from the pose reference.',
    EYEBROW_PROMPT_GUARDRAIL,
  );

  if (input.childName) {
    lines.push(`Character name: ${input.childName}.`);
  }

  if (input.favoriteAnimal) {
    lines.push(`Story context: the child theme includes ${input.favoriteAnimal}.`);
  }

  if (input.clothingTypeCanonical) {
    lines.push(`Clothing lock: ${input.clothingTypeCanonical}.`);
  }

  lines.push(
    `Pose number: ${input.poseNumber}.`,
    `Page context: ${input.pageLabel ?? 'unknown'}${input.pageType ? ` (${input.pageType})` : ''}.`,
  );

  if (input.storyPageNumber !== null) {
    lines.push(`Story page number: ${input.storyPageNumber}.`);
  }

  if (input.backgroundSlot) {
    lines.push(`Background slot: ${input.backgroundSlot}.`);
  }

  lines.push(
    '',
    'HARD RULES:',
    '- Exactly one child.',
    '- Keep the base character identity stable.',
    '- Keep the pose locked to POSE.',
    '- No extra limbs.',
    '- No crop above the feet.',
    '- No colored or textured background.',
  );

  return lines.join('\n').trim();
}

export async function buildW2APoseInput(
  input: JsonRecord,
  options: BuildW2APoseInputOptions = {},
): Promise<BuildW2APoseInputResult> {
  const compatSnapshot = extractCompatSnapshot(input);
  const explicitOrderContext = toRecord(input.orderContext);
  const orderContext = mergeRecords(compatSnapshot, explicitOrderContext);
  const characterSpecs = toRecord(
    pickFirstNonEmpty(
      input.characterSpecs,
      orderContext.characterSpecs,
      compatSnapshot.characterSpecs,
    ),
  );
  const fallbackCorrelationId = pickFirstNonEmpty(
    input.correlationId,
    orderContext.correlationId,
    compatSnapshot.correlationId,
  );
  const fallbackCharacterHash = pickFirstNonEmpty(
    input.characterHash,
    orderContext.characterHash,
    compatSnapshot.characterHash,
  );

  const orderId = toTrimmedString(
    pickFirstNonEmpty(
      input.orderId,
      orderContext.orderId,
      input.rootOrderId,
      input.root_order_id,
      input.amazonOrderId,
      input.amazon_order_id,
      compatSnapshot.orderId,
      compatSnapshot.rootOrderId,
      compatSnapshot.root_order_id,
      compatSnapshot.amazonOrderId,
      compatSnapshot.amazon_order_id,
      deriveOrderIdFromCorrelationId(fallbackCorrelationId, fallbackCharacterHash),
    ),
  );
  if (!orderId) {
    throw new Error('W2A pose input requires orderId');
  }

  const characterHash = toTrimmedString(
    pickFirstNonEmpty(
      input.characterHash,
      orderContext.characterHash,
      compatSnapshot.characterHash,
    ),
  );
  if (!characterHash) {
    throw new Error('W2A pose input requires characterHash');
  }

  const poseNumber = toInteger(
    pickFirstNonEmpty(
      input.poseNumber,
      input.currentPoseNumber,
      input.workingPoseNumber,
      orderContext.poseNumber,
      orderContext.currentPoseNumber,
      compatSnapshot.poseNumber,
      compatSnapshot.currentPoseNumber,
      compatSnapshot.expectedPoseNumber,
    ),
  );
  if (poseNumber === null || poseNumber < 0) {
    throw new Error('W2A pose input requires poseNumber');
  }

  const pathLikes = resolvePathLikes(input, orderContext);
  const resolvedBookId = toTrimmedString(
    pickFirstNonEmpty(input.bookId, orderContext.bookId),
  );
  const resolvedOrderPrefix = toTrimmedString(
    pickFirstNonEmpty(input.orderPrefix, input.order_prefix, orderContext.orderPrefix, orderContext.order_prefix),
  );
  const { bookId, orderPrefix } = resolveOrderPathContext(orderId, {
    bookId: resolvedBookId ?? undefined,
    orderPrefix: resolvedOrderPrefix ?? undefined,
    pathLikes,
  });

  const loadConfig = options.loadConfig ?? loadRuntimeBookConfig;
  const configSource = normalizeConfigSource(
    pickFirstNonEmpty(input.configSource, orderContext.configSource, compatSnapshot.configSource),
  );
  const configVersion = toInteger(
    pickFirstNonEmpty(
      input.configVersion,
      input.version,
      orderContext.configVersion,
      compatSnapshot.configVersion,
    ),
  );
  const config = await loadConfig({
    bookId,
    version: configVersion ?? undefined,
    source: configSource,
  });
  const formatId = resolveFormatId(input, orderContext);

  const explicitBackendUrl = normalizeLikelyUrl(
    pickFirstNonEmpty(input.backendUrl, explicitOrderContext.backendUrl),
  );
  const compatBackendUrl = normalizeLikelyUrl(
    pickFirstNonEmpty(orderContext.backendUrl, compatSnapshot.backendUrl),
  );
  const backendUrl =
    explicitBackendUrl ??
    (isLocalDevelopmentUrl(compatBackendUrl) ? null : compatBackendUrl) ??
    resolveCanonicalBackendBaseUrl(options.defaultBackendUrl);
  const publicR2Url =
    normalizeLikelyUrl(
      pickFirstNonEmpty(input.publicR2Url, orderContext.publicR2Url, compatSnapshot.publicR2Url),
    ) ??
    options.defaultPublicR2Url ??
    null;

  const currentPoseNumber = poseNumber;
  const poseNN = `pose${String(Math.max(0, poseNumber)).padStart(2, '0')}`;
  const poseNNHyphen = `pose-${String(Math.max(0, poseNumber)).padStart(2, '0')}`;
  const previewResolved = resolvePreviewCanonicalsForConfig(characterSpecs, config);
  const baseCharacterKey = buildBaseCharacterAssetKey(characterHash, bookId);
  const baseRefPublicUrl = joinUrl(publicR2Url, baseCharacterKey);
  const poseRefKey = resolvePoseReferenceKey(config, poseNumber, characterSpecs);
  const poseRefKeyAlt = poseRefKey.replace(/\/pose(\d{2})\.png$/, '/pose-$1.png');
  const poseRefPublicUrl = joinUrl(publicR2Url, poseRefKey);
  const poseRefPublicUrlAlt = joinUrl(publicR2Url, poseRefKeyAlt);
  const hairRefS3Key =
    toTrimmedString(
      pickFirstNonEmpty(
        input.hairRefS3Key,
        orderContext.hairRefS3Key,
        compatSnapshot.hairRefS3Key,
      ),
    ) ??
    previewResolved.hairRefKey;
  const hairRefPublicUrl = joinUrl(publicR2Url, hairRefS3Key);

  const retryAttempt = Math.max(
    0,
    toInteger(
      pickFirstNonEmpty(input.retryAttempt, input.qaRetry, orderContext.retryAttempt),
    ) ?? 0,
  );
  const retryTag =
    toTrimmedString(
      pickFirstNonEmpty(input.retryTag, orderContext.retryTag, compatSnapshot.retryTag),
    ) ?? null;
  const maxPoseRetries = toPositiveInteger(
    pickFirstNonEmpty(
      input.maxPoseRetries,
      input.maxRetries,
      orderContext.maxPoseRetries,
      compatSnapshot.maxPoseRetries,
    ),
    3,
  );
  const testMode = [
    input.testMode,
    input.__testMode,
    orderContext.testMode,
    orderContext.__testMode,
    compatSnapshot.testMode,
    compatSnapshot.__testMode,
  ].some(toBoolean);
  const correlationId =
    toTrimmedString(
      pickFirstNonEmpty(input.correlationId, orderContext.correlationId, compatSnapshot.correlationId),
    ) ??
    buildCorrelationId({
      orderId,
      characterHash,
      poseNumber,
      retryAttempt,
      retryTag,
    });
  const pageLabel =
    toTrimmedString(
      pickFirstNonEmpty(input.pageLabel, orderContext.pageLabel, compatSnapshot.pageLabel),
    ) ?? null;
  const pageType =
    toTrimmedString(
      pickFirstNonEmpty(input.pageType, orderContext.pageType, compatSnapshot.pageType),
    ) ?? null;
  const storyPageNumber =
    toInteger(
      pickFirstNonEmpty(
        input.storyPageNumber,
        orderContext.storyPageNumber,
        compatSnapshot.storyPageNumber,
      ),
    ) ?? null;
  const backgroundSlot =
    toTrimmedString(
      pickFirstNonEmpty(
        input.backgroundSlot,
        orderContext.backgroundSlot,
        compatSnapshot.backgroundSlot,
      ),
    ) ?? null;
  const posePromptPreface =
    toTrimmedString(
      pickFirstNonEmpty(
        input.posePromptPreface,
        orderContext.posePromptPreface,
        compatSnapshot.posePromptPreface,
      ),
    ) ??
    '';
  const favoriteAnimal =
    toTrimmedString(pickFirstNonEmpty(characterSpecs.favoriteAnimal, characterSpecs.favorite_animal)) ??
    null;
  const childName =
    toTrimmedString(
      pickFirstNonEmpty(input.childName, orderContext.childName, characterSpecs.childName),
    ) ?? null;

  const promptMeta: W2APosePromptMeta = {
    version: 'repo-w2a-pose-input@v1',
    labels: {
      base: 'BASE',
      pose: 'POSE',
      hair: 'HAIR CHIP',
    },
    poseNumber,
    pageLabel,
    pageType,
    storyPageNumber,
    backgroundSlot,
    retryAttempt,
    hasHairRef: Boolean(hairRefS3Key),
  };

  const posePromptBlock = buildPosePromptBlock({
    childName,
    favoriteAnimal,
    clothingTypeCanonical: previewResolved.clothingTypeCanonical,
    poseNumber,
    pageLabel,
    pageType,
    storyPageNumber,
    backgroundSlot,
    hasHairRef: Boolean(hairRefS3Key),
    posePromptPreface,
  });
  const userPromptText = posePromptBlock;
  const { uploadKey, fileName } = buildRetryAwareUploadKey(
    characterHash,
    poseNumber,
    retryAttempt,
    bookId,
  );

  return {
    orderId,
    rootOrderId:
      toTrimmedString(
        pickFirstNonEmpty(
          input.rootOrderId,
          input.root_order_id,
          input.amazonOrderId,
          input.amazon_order_id,
          orderContext.rootOrderId,
          orderContext.root_order_id,
          orderContext.amazonOrderId,
          orderContext.amazon_order_id,
          compatSnapshot.rootOrderId,
          compatSnapshot.root_order_id,
          compatSnapshot.amazonOrderId,
          compatSnapshot.amazon_order_id,
          compatSnapshot.orderId,
          orderId,
        ),
      ) ?? null,
    amazonOrderId:
      toTrimmedString(
        pickFirstNonEmpty(
          input.amazonOrderId,
          input.amazon_order_id,
          orderContext.amazonOrderId,
          orderContext.amazon_order_id,
          input.rootOrderId,
          orderContext.rootOrderId,
          compatSnapshot.amazonOrderId,
          compatSnapshot.amazon_order_id,
          compatSnapshot.rootOrderId,
          compatSnapshot.root_order_id,
          compatSnapshot.orderId,
          orderId,
        ),
      ) ?? null,
    bookId,
    formatId,
    orderPrefix,
    backendUrl,
    publicR2Url,
    oneManifestUrl:
      toTrimmedString(
        pickFirstNonEmpty(
          input.oneManifestUrl,
          input.one_manifest_url,
          orderContext.oneManifestUrl,
          compatSnapshot.oneManifestUrl,
          compatSnapshot.one_manifest_url,
        ),
      ) ?? null,
    characterHash,
    poseNumber,
    currentPoseNumber,
    poseNN,
    poseNNHyphen,
    pageLabel,
    pageType,
    storyPageNumber,
    backgroundSlot,
    assetsRoot: `${bookId}/order-generated-assets`,
    baseCharacterKey,
    baseRefPublicUrl,
    poseRefKey,
    poseRefKeyAlt,
    poseRefPublicUrl,
    poseRefPublicUrlAlt,
    hairRefS3Key,
    hairRefPublicUrl,
    hairStyleCanonical: previewResolved.hairStyleCanonical,
    clothingTypeCanonical: previewResolved.clothingTypeCanonical,
    favoriteColorHex: previewResolved.favoriteColorHex,
    hairPromptMeta: {
      ...toRecord(input.hairPromptMeta),
      styleKey: previewResolved.hairStyleCanonical,
      hairRefS3Key,
      clothingTypeCanonical: previewResolved.clothingTypeCanonical,
    },
    retryAttempt,
    retryTag,
    maxPoseRetries,
    testMode,
    correlationId,
    generatedFileName: fileName,
    uploadKey,
    uploadApiPath: buildAssetApiUrl(uploadKey),
    posePromptPreface,
    posePromptBlock,
    userPromptText,
    promptMeta,
  };
}
