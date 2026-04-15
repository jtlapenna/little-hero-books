import { resolvePreviewCanonicalsForConfig } from '@/lib/preview-canonicals';
import {
  buildAssetApiUrl,
  buildBaseCharacterAssetKey,
  resolveOrderPathContext,
} from '@/lib/order-paths';
import {
  loadRuntimeBookConfig,
  type BookConfigRuntimeSource,
} from '@/lib/books/runtime-book-config';
import type { BookConfig } from '@/lib/books/types';
import { resolveCanonicalBackendBaseUrl } from '@/lib/backend-url';

type JsonRecord = Record<string, unknown>;

type LoadConfigForW2ABaseInput = (options: {
  bookId: string;
  version?: number;
  source?: BookConfigRuntimeSource | null;
}) => Promise<BookConfig>;

export interface W2ABasePromptMeta {
  version: 'repo-w2a-base-input@v1';
  labels: {
    base: 'IMAGE A';
    hair: 'IMAGE B';
    skin: 'IMAGE C';
  };
  clothingTypeCanonical: string;
  skinToneCanonical: string;
  hasHairRef: boolean;
  hasSkinSwatch: boolean;
}

export interface BuildW2ABaseInputResult {
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
  characterPath: string;
  assetsRoot: string;
  baseCharacterKey: string;
  generatedFileName: string;
  uploadKey: string;
  uploadApiPath: string;
  baseRefS3Key: string;
  baseRefPublicUrl: string | null;
  hairRefS3Key: string | null;
  hairRefPublicUrl: string | null;
  skinToneCanonical: string;
  skinToneHex: string | null;
  skinToneLabel: string | null;
  skinToneId: string;
  skinHexBase: string | null;
  skinColorLock: string;
  clothingTypeCanonical: string;
  favoriteColorHex: string | null;
  shortsHex: string;
  hairStyleCanonical: string | null;
  hairColorCanonical: string | null;
  hairColorLabel: string | null;
  hairPromptBlock: string;
  hairPromptMeta: JsonRecord;
  systemInstructionText: string;
  userPromptText: string;
  generationConfig: JsonRecord;
  promptMeta: W2ABasePromptMeta;
  requestParts: {
    baseLabel: string;
    hairLabel: string;
    skinLabel: string;
  };
  model: string;
  testMode: boolean;
  correlationId: string;
  __meta: {
    storageKey: string;
    baseUploadKey: string;
    generatedAttemptKey: string;
    promptVersion: 'repo-w2a-base-input@v1';
  };
}

export interface BuildW2ABaseInputOptions {
  loadConfig?: LoadConfigForW2ABaseInput;
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

function normalizeConfigSource(value: unknown): BookConfigRuntimeSource {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'bundled' || normalized === 'published' || normalized === 'published-first') {
    return normalized;
  }

  return 'published-first';
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '-');
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
    orderContext.oneManifestUrl,
    orderContext.one_manifest_url,
    orderContext.orderPrefix,
    orderContext.order_prefix,
    orderContext.assetPrefix,
    orderContext.asset_prefix,
  ];

  return values
    .map((value) => toTrimmedString(value))
    .filter((value): value is string => Boolean(value));
}

function resolveCharacterHash(input: JsonRecord, orderContext: JsonRecord, compatSnapshot: JsonRecord): string {
  const direct =
    toTrimmedString(
      pickFirstNonEmpty(
        input.characterHash,
        input.character_hash,
        orderContext.characterHash,
        orderContext.character_hash,
        compatSnapshot.characterHash,
        compatSnapshot.character_hash,
      ),
    ) ?? null;

  if (direct) {
    return direct;
  }

  const pathLikes = [
    toTrimmedString(input.characterPath),
    toTrimmedString(input.baseCharacterKey),
    toTrimmedString(input.oneManifestUrl),
    toTrimmedString(input.orderPrefix),
  ];

  for (const candidate of pathLikes) {
    if (!candidate) continue;
    const pathMatch = candidate.match(/characters\/([^/]+)/i);
    if (pathMatch?.[1]) {
      return pathMatch[1];
    }
  }

  throw new Error('W2A base input requires characterHash');
}

function canonicalizeHairColor(raw: unknown): string | null {
  const value = String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!value) {
    return null;
  }

  if (/strawberry\s*blonde/.test(value)) return 'strawberry-blonde';
  if (/light\s*brown/.test(value)) return 'light-brown';
  if (/medium\s*brown|^brown$/.test(value)) return 'medium-brown';
  if (/dark\s*brown/.test(value)) return 'dark-brown';
  if (/auburn/.test(value)) return 'auburn';
  if (/ginger|true\s*red|^red$/.test(value)) return 'red';
  if (/black/.test(value)) return 'black';
  if (/blond|blonde/.test(value)) return 'blonde';

  return null;
}

function buildSkinColorLock(skinToneHex: string | null, skinToneLabel: string | null): string {
  if (skinToneHex) {
    return `Target skin tone is ${skinToneLabel ?? 'selected tone'} ${skinToneHex}. Match it exactly and do not lighten or darken it.`;
  }

  return 'Keep skin tone identical to the selected child settings and do not lighten or darken it.';
}

function buildBasePromptContract(input: {
  favoriteColorHex: string | null;
  shortsHex: string;
  clothingTypeCanonical: string;
  skinColorLock: string;
  hairColorLabel: string | null;
  hairStyleCanonical: string | null;
  hairPromptBlock: string;
}): { systemInstructionText: string; userPromptText: string; generationConfig: JsonRecord } {
  const isDress = input.clothingTypeCanonical === 'dress';
  const topColorLock = isDress
    ? (input.favoriteColorHex
        ? [
            `CRITICAL — DRESS COLOR: ${input.favoriteColorHex}`,
            `The dress fabric MUST be ${input.favoriteColorHex}.`,
            'This is the required dress color. Do not use any other color for the dress.',
          ].join('\n')
        : [
            'CRITICAL — DRESS COLOR: Use one solid dress color and keep it consistent across generations.',
          ].join('\n'))
    : (input.favoriteColorHex
        ? [
            `CRITICAL — T-SHIRT COLOR: ${input.favoriteColorHex}`,
            `The t-shirt fabric MUST be ${input.favoriteColorHex}.`,
            `Shorts MUST stay neutral denim ${input.shortsHex}.`,
          ].join('\n')
        : [
            'CRITICAL — T-SHIRT COLOR: Use one solid t-shirt color.',
            `Shorts MUST stay neutral denim ${input.shortsHex}.`,
          ].join('\n'));

  const clothingLock = isDress
    ? [
        'CLOTHING STYLE LOCK — DRESS:',
        '- Outfit must remain a single-piece dress.',
        '- Do not replace with a T-shirt and shorts, pants, or layered outfits.',
      ].join('\n')
    : [
        'CLOTHING STYLE LOCK — T-SHIRT & SHORTS:',
        '- Outfit must remain a short-sleeve T-shirt and shorts.',
        '- Do not replace with a dress, skirt, pants, or layered outfits.',
      ].join('\n');

  const userPromptText = [
    topColorLock,
    'BOOK STYLE: flat, clean vector-like forms with soft textured shading.',
    'BACKGROUND: pure white (#FFFFFF). No props, logos, text, or transparency.',
    'SUBJECT LIMIT: render exactly one child in frame.',
    'FRAMING: show the full body from head to feet with comfortable margin inside the frame.',
    clothingLock,
    `SKIN-TONE LOCK: ${input.skinColorLock}`,
    [
      'HAIRSTYLE LOCK:',
      input.hairStyleCanonical
        ? `- Hair silhouette is locked to ${input.hairStyleCanonical}.`
        : '- Hair silhouette must stay locked to the selected hairstyle.',
      input.hairColorLabel
        ? `- Hair color: ${input.hairColorLabel}. Do not recolor it.`
        : '- Keep the requested hair color unchanged.',
    ].join('\n'),
    input.hairPromptBlock,
    [
      'IMAGE ROLES:',
      '- IMAGE A = base character style guide.',
      '- IMAGE B = hairstyle reference. Use only for hair silhouette, part, and maximum length.',
      '- IMAGE C = optional skin swatch. Use only for skin color matching.',
    ].join('\n'),
    [
      'HARD RULES:',
      '- Exactly one child.',
      '- Keep the base character identity stable.',
      '- No extra limbs or duplicate features.',
      '- No crop above the feet.',
      '- No colored or textured background.',
    ].join('\n'),
  ].join('\n\n');

  const systemInstructionText = [
    'You are a precise illustration tool.',
    input.favoriteColorHex
      ? isDress
        ? `CRITICAL: The dress MUST be ${input.favoriteColorHex}.`
        : `CRITICAL: The t-shirt MUST be ${input.favoriteColorHex} and the shorts MUST be ${input.shortsHex}.`
      : null,
    `CRITICAL: ${input.skinColorLock}`,
    'CRITICAL: Show the full body from head to feet.',
    'Do not add props, logos, text, or extra characters.',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    systemInstructionText,
    userPromptText,
    generationConfig: {
      imageConfig: {
        aspectRatio: '1:1',
        imageSize: '2K',
      },
      temperature: 0.15,
    },
  };
}

export async function buildW2ABaseInput(
  input: JsonRecord,
  options: BuildW2ABaseInputOptions = {},
): Promise<BuildW2ABaseInputResult> {
  const compatSnapshot = extractCompatSnapshot(input);
  const explicitOrderContext = toRecord(input.orderContext);
  const orderContext = mergeRecords(compatSnapshot, explicitOrderContext);
  const characterSpecs = toRecord(
    pickFirstNonEmpty(
      input.characterSpecs,
      input.character_specs,
      orderContext.characterSpecs,
      orderContext.character_specs,
      compatSnapshot.characterSpecs,
      compatSnapshot.character_specs,
    ),
  );

  const orderId = toTrimmedString(
    pickFirstNonEmpty(
      input.orderId,
      orderContext.orderId,
      compatSnapshot.orderId,
      input.amazonOrderId,
      input.amazon_order_id,
      input.rootOrderId,
      input.root_order_id,
    ),
  );
  if (!orderId) {
    throw new Error('W2A base input requires orderId');
  }

  const characterHash = resolveCharacterHash(input, orderContext, compatSnapshot);
  const pathLikes = resolvePathLikes(input, orderContext);
  const explicitBookId = toTrimmedString(
    pickFirstNonEmpty(input.bookId, orderContext.bookId, compatSnapshot.bookId),
  );
  const explicitOrderPrefix = toTrimmedString(
    pickFirstNonEmpty(input.orderPrefix, input.order_prefix, orderContext.orderPrefix, orderContext.order_prefix),
  );
  const { bookId, orderPrefix } = resolveOrderPathContext(orderId, {
    bookId: explicitBookId ?? undefined,
    orderPrefix: explicitOrderPrefix ?? undefined,
    pathLikes,
  });

  const loadConfig = options.loadConfig ?? loadRuntimeBookConfig;
  const configSource = normalizeConfigSource(
    pickFirstNonEmpty(input.configSource, orderContext.configSource, compatSnapshot.configSource),
  );
  const configVersion = toInteger(
    pickFirstNonEmpty(input.configVersion, input.version, orderContext.configVersion),
  );
  const config = await loadConfig({
    bookId,
    version: configVersion ?? undefined,
    source: configSource,
  });

  const previewResolved = resolvePreviewCanonicalsForConfig(characterSpecs, config);
  const formatId = resolveFormatId(input, orderContext);
  const backendUrl =
    normalizeLikelyUrl(pickFirstNonEmpty(input.backendUrl, orderContext.backendUrl)) ??
    resolveCanonicalBackendBaseUrl(options.defaultBackendUrl);
  const publicR2Url =
    normalizeLikelyUrl(
      pickFirstNonEmpty(input.publicR2Url, orderContext.publicR2Url, compatSnapshot.publicR2Url),
    ) ??
    options.defaultPublicR2Url ??
    null;
  const assetsRoot = `${bookId}/order-generated-assets`;
  const baseCharacterKey = buildBaseCharacterAssetKey(characterHash, bookId);
  const generatedFileName = `characters_${characterHash}_base.png`;
  const hairColorCanonical =
    canonicalizeHairColor(
      pickFirstNonEmpty(
        characterSpecs.hairColor,
        characterSpecs.hair_color,
        input.hairColor,
        orderContext.hairColor,
      ),
    ) ?? null;
  const hairColorLabel =
    toTrimmedString(
      pickFirstNonEmpty(
        characterSpecs.hairColor,
        characterSpecs.hair_color,
        input.hairColor,
        orderContext.hairColor,
      ),
    ) ?? previewResolved.hairColorLabel;
  const hairPromptBlock = [
    'HAIRSTYLE DESCRIPTION:',
    previewResolved.hairStyleCanonical
      ? `- Keep the hairstyle silhouette locked to ${previewResolved.hairStyleCanonical}.`
      : '- Keep the hairstyle silhouette locked to the selected reference.',
    hairColorLabel
      ? `- Hair color: ${hairColorLabel}.`
      : '- Keep the selected hair color unchanged.',
    '- Hair renders as a single connected silhouette with clean, closed edges.',
    '- Keep the face visible unless the selected hairstyle requires otherwise.',
  ].join('\n');
  const skinColorLock = buildSkinColorLock(
    previewResolved.skinToneHex,
    previewResolved.skinToneLabel,
  );
  const promptContract = buildBasePromptContract({
    favoriteColorHex: previewResolved.favoriteColorHex,
    shortsHex: previewResolved.shortsHex,
    clothingTypeCanonical: previewResolved.clothingTypeCanonical,
    skinColorLock,
    hairColorLabel,
    hairStyleCanonical: previewResolved.hairStyleCanonical,
    hairPromptBlock,
  });
  const correlationId = [
    sanitizeId(orderId),
    sanitizeId(characterHash).slice(0, 16),
    'BASE',
  ].join('-');
  const testMode = [
    input.testMode,
    input.__testMode,
    orderContext.testMode,
    orderContext.__testMode,
    compatSnapshot.testMode,
    compatSnapshot.__testMode,
  ].some(toBoolean);

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
    characterPath: `characters/${characterHash}`,
    assetsRoot,
    baseCharacterKey,
    generatedFileName,
    uploadKey: baseCharacterKey,
    uploadApiPath: buildAssetApiUrl(baseCharacterKey),
    baseRefS3Key: previewResolved.baseRefKey,
    baseRefPublicUrl: joinUrl(publicR2Url, previewResolved.baseRefKey),
    hairRefS3Key: previewResolved.hairRefKey,
    hairRefPublicUrl: joinUrl(publicR2Url, previewResolved.hairRefKey),
    skinToneCanonical: previewResolved.skinToneCanonical,
    skinToneHex: previewResolved.skinToneHex,
    skinToneLabel: previewResolved.skinToneLabel,
    skinToneId: previewResolved.skinToneCanonical,
    skinHexBase: previewResolved.skinToneHex,
    skinColorLock,
    clothingTypeCanonical: previewResolved.clothingTypeCanonical,
    favoriteColorHex: previewResolved.favoriteColorHex,
    shortsHex: previewResolved.shortsHex,
    hairStyleCanonical: previewResolved.hairStyleCanonical,
    hairColorCanonical,
    hairColorLabel,
    hairPromptBlock,
    hairPromptMeta: {
      styleKey: previewResolved.hairStyleCanonical,
      colorKey: hairColorCanonical,
      colorLabel: hairColorLabel,
      hairRefS3Key: previewResolved.hairRefKey,
      clothingTypeCanonical: previewResolved.clothingTypeCanonical,
      promptVersion: 'repo-w2a-base-input@v1',
      referenceKey: previewResolved.hairRefKey?.split('/').pop()?.replace(/\.[^.]+$/, '') ?? null,
    },
    systemInstructionText: promptContract.systemInstructionText,
    userPromptText: promptContract.userPromptText,
    generationConfig: promptContract.generationConfig,
    promptMeta: {
      version: 'repo-w2a-base-input@v1',
      labels: {
        base: 'IMAGE A',
        hair: 'IMAGE B',
        skin: 'IMAGE C',
      },
      clothingTypeCanonical: previewResolved.clothingTypeCanonical,
      skinToneCanonical: previewResolved.skinToneCanonical,
      hasHairRef: Boolean(previewResolved.hairRefKey),
      hasSkinSwatch: false,
    },
    requestParts: {
      baseLabel: 'IMAGE A — BASE STYLE GUIDE. Do not infer haircut from this image.',
      hairLabel:
        'IMAGE B — HAIRSTYLE REFERENCE. Use only for hair silhouette, part, length, and placement.',
      skinLabel:
        'IMAGE C — OPTIONAL SKIN SWATCH. Use only for skin color matching; never apply it to hair or clothes.',
    },
    model: 'gemini-3-pro-image-preview',
    testMode,
    correlationId,
    __meta: {
      storageKey: baseCharacterKey,
      baseUploadKey: baseCharacterKey,
      generatedAttemptKey: generatedFileName,
      promptVersion: 'repo-w2a-base-input@v1',
    },
  };
}
