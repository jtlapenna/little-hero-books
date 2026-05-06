import {
  buildBgRemovedPoseAssetKey,
  buildOrderPrefix,
  buildPreviewImageAssetKey,
  inferBookIdFromPathLikes,
} from '@/lib/order-paths';
import {
  getLegacyReferenceCharacterPlacement,
  parseCharacterPlacementOverride,
  resolveBookCharacterPlacementMap,
  type BookCharacterPlacementMap,
} from '@/lib/books/character-placement';
import {
  getLegacyReferenceAnimalPlacement,
  parseAnimalPlacementOverride,
  resolveBookAnimalPlacementMap,
  type BookAnimalPlacementMap,
} from '@/lib/books/animal-placement';
import {
  getLegacyReferenceCoverCharacterPlacement,
  mergeCoverCharacterPlacement,
  parseCoverCharacterPlacementOverride,
  resolveBookCoverCharacterPlacement,
} from '@/lib/books/cover-character-placement';
import type {
  BookCharacterPlacementEntry,
  BookConfig,
  BookPageConfig,
} from '@/lib/books/types';
import { resolveCanonicalBackendBaseUrl } from '@/lib/backend-url';
import { buildLegacyBookPagePlan } from '@/lib/books/legacy-page-plan';
import { loadBundledBookConfig } from '@/lib/books/load-book-config';
import { resolvePagePlan } from '@/lib/books/resolve-page-plan';

type JsonRecord = Record<string, unknown>;
const DEFAULT_PAGE_PREVIEW_TEMPLATE_ID = '23277725-4AB0-446A-98C5-CB99C21822B3';
const DEFAULT_STANDARD_COVER_PREVIEW_TEMPLATE_ID = 'D0F07D93-9267-47BB-A6AF-D6EC5ACDF476';
const DEFAULT_AMAZON_COVER_PREVIEW_TEMPLATE_ID = '8DB1D274-AA3C-4E14-B051-65B6F872B013';

export interface W3PreviewPlanPageItem extends JsonRecord {
  orderId: string;
  amazonOrderId: string | null;
  rootOrderId: string | null;
  bookId: string;
  orderR2BaseKey: string;
  backendUrl: string;
  pageIndex: number;
  pageNumber: number;
  pageLabel: string;
  pageHtml: string;
  pageImageFilename: string;
  pageImageR2Key: string;
  page_css: string;
  useImgBackgrounds: boolean;
  pdfMonkeyImageTemplateId: string;
  pdfMonkeyTemplateId: string;
  workflowJobId: number | null;
  workflowJobIdempotencyKey: string | null;
  workflowJobStatus: string | null;
  workflowAttemptId: number | null;
  workflowAttempt: number | null;
  workflowClaimed: boolean;
}

export interface W3PreviewPlanCoverItem extends JsonRecord {
  orderId: string;
  amazonOrderId: string | null;
  rootOrderId: string | null;
  bookId: string;
  orderR2BaseKey: string;
  backendUrl: string;
  coverHTML: string;
  cover_html: string;
  coverImageFilename: string;
  coverImageR2Key: string;
  coverPngFilename: string;
  coverPngR2Key: string;
  pdfMonkeyCoverTemplateId: string;
  pdfMonkeyImageTemplateId: string;
  pdfMonkeyTemplateId: string;
  workflowJobId: number | null;
  workflowJobIdempotencyKey: string | null;
  workflowJobStatus: string | null;
  workflowAttemptId: number | null;
  workflowAttempt: number | null;
  workflowClaimed: boolean;
}

export interface BuildW3PreviewPlanResult extends JsonRecord {
  orderId: string;
  amazonOrderId: string | null;
  rootOrderId: string | null;
  backendUrl: string;
  bookId: string;
  orderR2BaseKey: string;
  page_css: string;
  pages_html: string;
  interiorPagesHTML: string[];
  inputs: JsonRecord;
  renderContext: JsonRecord;
  backgroundImages: JsonRecord[];
  overlayImages: JsonRecord[];
  animalImages: JsonRecord;
  coverSpreadImagePath: string;
  storyTexts: JsonRecord[];
  processedImages: JsonRecord[];
  characterImages: JsonRecord;
  trailType: string;
  animalDisplayName: string;
  pronounsExtracted: string;
  pronounsResolved: JsonRecord;
  useImgBackgrounds: boolean;
  pdfMonkeyImageTemplateId: string;
  pdfMonkeyTemplateId: string;
  pdfFilename: string;
  pagePreviewItems: W3PreviewPlanPageItem[];
  coverPreviewItem: W3PreviewPlanCoverItem;
}

export interface BuildW3PreviewPlanOptions {
  characterPlacementOverride?: BookCharacterPlacementMap;
  animalPlacementOverride?: BookAnimalPlacementMap;
  coverCharacterPlacementOverride?: BookCharacterPlacementEntry | null;
}

type StoryContext = {
  storyTexts: JsonRecord[];
  processedImages: JsonRecord[];
  characterImages: JsonRecord;
  trailType: string;
  animalDisplayName: string;
  pronounsExtracted: string;
  pronounsResolved: JsonRecord;
  dedicationText: string | null;
};

type CanonicalAssets = {
  backendUrl: string;
  backgroundImages: JsonRecord[];
  overlayImages: JsonRecord[];
  animalImages: JsonRecord;
  coverSpreadImagePath: string;
  dedicationText: string | null;
};

type InteriorHtmlResult = {
  pages_html: string;
  interiorPagesHTML: string[];
  page_css: string;
  pageBlocks: Array<{ page: BookPageConfig; html: string }>;
  useImgBackgrounds: boolean;
  pdfMonkeyImageTemplateId: string;
  pdfMonkeyTemplateId: string;
  pdfFilename: string;
};

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
  if (!trimmed) {
    return null;
  }

  const lowered = trimmed.toLowerCase();
  return lowered === 'null' || lowered === 'undefined' ? null : trimmed;
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

function toBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}

function s(value: unknown): string {
  return value == null ? '' : String(value);
}

function trimWhitespace(value: unknown): string {
  return s(value).replace(/\s+/g, ' ').trim();
}

function clamp(value: unknown, max: number): string {
  const text = s(value);
  return text.length > max ? text.slice(0, max) : text;
}

function safeMultiline(value: unknown, max: number): string {
  let output = s(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (output.length > max) {
    output = output.slice(0, max);
  }
  return output;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const text = toTrimmedString(value);
    if (text) {
      return text;
    }
  }

  return '';
}

function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (match) =>
    ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[match] ?? match),
  );
}

function normalizeBreaks(value: unknown): string {
  return String(value ?? '')
    .replace(/(?:<\s*br\s*\/?\s*>|&lt;\s*br\s*\/?\s*&gt;)/gi, '\n')
    .replace(/\r\n/g, '\n');
}

function widont(segment: string): string {
  return String(segment).replace(/\s+([^\s]{1,12})$/u, '\u00A0$1');
}

function formatText(value: unknown): string {
  return normalizeBreaks(value)
    .split(/\n/)
    .map((segment) => widont(segment.trim()))
    .join('\n');
}

function buildNormalizedInputs(input: JsonRecord): JsonRecord {
  const characterSpecs = toRecord(input.characterSpecs);
  const bookSpecs = toRecord(input.bookSpecs);
  const orderDetails = toRecord(input.orderDetails);
  const shippingAddress = toRecord(orderDetails.shippingAddress);

  let dedicationRaw = input.dedicationText ?? null;
  if (!dedicationRaw || dedicationRaw === 'null' || dedicationRaw === '') {
    dedicationRaw = orderDetails.dedicationMessage ?? bookSpecs.dedicationMessage ?? '';
  }

  const hometownRaw = characterSpecs.hometown ?? shippingAddress.city ?? '';
  let title = trimWhitespace(bookSpecs.title);
  const subtitle = trimWhitespace(bookSpecs.subtitle);

  if (!title) {
    title = 'Alex and the Adventure Compass';
  }

  return {
    title: clamp(title, 90),
    subtitle: clamp(subtitle, 120),
    dedicationMessage: safeMultiline(dedicationRaw, 400),
    hometown: clamp(hometownRaw, 60),
    childName: trimWhitespace(characterSpecs.childName),
  };
}

function resolveBackendUrl(input: JsonRecord): string {
  return resolveCanonicalBackendBaseUrl(toTrimmedString(input.backendUrl));
}

function collectBookPathLikes(input: JsonRecord): Array<string | null | undefined> {
  return [
    toTrimmedString(input.orderR2BaseKey),
    toTrimmedString(input.orderPrefix),
    toTrimmedString(input.assetPrefix),
    toTrimmedString(input.oneManifestKey),
    toTrimmedString(input.oneManifestUrl),
    toTrimmedString(input.manifest2bKey),
    toTrimmedString(input.manifest2bUrl),
    toTrimmedString(input.manifest3Key),
    toTrimmedString(input.manifest3Url),
    toTrimmedString(input.coverPngR2Key),
    toTrimmedString(input.coverImageR2Key),
    toTrimmedString(input.coverPdfR2Key),
    toTrimmedString(input.r2Key),
    toTrimmedString(input.path),
    toTrimmedString(input.imageUrl),
    toTrimmedString(input.cloudflareImageUrl),
  ];
}

function resolveBookId(input: JsonRecord, orderId?: string | null): string {
  const explicitBookId = toTrimmedString(input.bookId);
  if (explicitBookId) {
    return explicitBookId;
  }

  const inferredBookId = inferBookIdFromPathLikes(...collectBookPathLikes(input));
  if (inferredBookId) {
    return inferredBookId;
  }

  const orderLabel = orderId ?? resolveOrderId(input) ?? 'unknown-order';
  throw new Error(`W3 preview planning requires bookId or per-book path context for ${orderLabel}`);
}

function resolveCharacterPlacementMap(
  input: JsonRecord,
  config: BookConfig | null,
): BookCharacterPlacementMap {
  const explicitFormatId = toTrimmedString(input.formatId);
  const base = config
    ? resolveBookCharacterPlacementMap(config, explicitFormatId)
    : getLegacyReferenceCharacterPlacement(resolveBookId(input, resolveOrderId(input)));
  const override = parseCharacterPlacementOverride(input.characterPlacement);

  return {
    ...base,
    ...override,
  };
}

function resolveAnimalPlacementMap(
  input: JsonRecord,
  config: BookConfig | null,
): BookAnimalPlacementMap {
  const explicitFormatId = toTrimmedString(input.formatId);
  const base = config
    ? resolveBookAnimalPlacementMap(config, explicitFormatId)
    : getLegacyReferenceAnimalPlacement(resolveBookId(input, resolveOrderId(input)));
  const override = parseAnimalPlacementOverride(input.animalPlacement);

  return {
    ...base,
    ...override,
  };
}

function resolveCoverCharacterPlacement(
  input: JsonRecord,
  config: BookConfig | null,
): BookCharacterPlacementEntry | null {
  const explicitFormatId = toTrimmedString(input.formatId);
  const base = config
    ? resolveBookCoverCharacterPlacement(config, explicitFormatId)
    : getLegacyReferenceCoverCharacterPlacement(resolveBookId(input, resolveOrderId(input)));
  const override = parseCoverCharacterPlacementOverride(input.coverCharacterPlacement);

  return mergeCoverCharacterPlacement(base, override);
}

function buildCharacterStyle(
  placement: BookCharacterPlacementEntry | null,
  toPx: (value: number) => string,
): string {
  if (!placement) {
    return '';
  }

  const anchorXPercent =
    typeof placement.anchorXPercent === 'number' ? placement.anchorXPercent : 50;
  const anchorYPercent =
    typeof placement.anchorYPercent === 'number' ? placement.anchorYPercent : 100;
  const transforms = [`translate(-${anchorXPercent}%,-${anchorYPercent}%)`];
  if (typeof placement.rotateDeg === 'number' && placement.rotateDeg !== 0) {
    transforms.push(`rotate(${placement.rotateDeg}deg)`);
  }

  return [
    `left:${toPx(placement.left)}`,
    `top:${toPx(placement.top)}`,
    `transform:${transforms.join(' ')}`,
    `width:${toPx(placement.width)}`,
    `z-index:${placement.zIndex ?? 11}`,
  ].join('; ') + ';';
}

function buildCoverSpriteStyle(
  placement: BookCharacterPlacementEntry | null,
  toPx: (value: number) => string,
): string {
  const base = buildCharacterStyle(placement, toPx);
  if (!base) {
    return '';
  }

  return `${base} position:absolute; height:auto; display:block;`;
}

function resolveOrderId(input: JsonRecord): string {
  return (
    toTrimmedString(input.orderId) ??
    toTrimmedString(input.amazonOrderId) ??
    ''
  );
}

function resolveAmazonOrderId(input: JsonRecord, orderId: string): string | null {
  void orderId;
  return toTrimmedString(input.amazonOrderId);
}

function resolveRootOrderId(input: JsonRecord, amazonOrderId: string | null, orderId: string): string | null {
  return toTrimmedString(input.rootOrderId) ?? amazonOrderId ?? orderId;
}

function resolveOrderR2BaseKey(input: JsonRecord, orderId: string, bookId: string): string {
  return toTrimmedString(input.orderR2BaseKey) ?? buildOrderPrefix(orderId, bookId);
}

function buildCanonicalAssets(
  input: JsonRecord,
  pagePlan: BookPageConfig[],
): CanonicalAssets {
  const backendUrl = resolveBackendUrl(input);
  const orderId = resolveOrderId(input);

  if (!orderId) {
    throw new Error('Order ID is required for W3 preview planning');
  }

  const bookId = resolveBookId(input, orderId);
  const assetRoot = bookId;
  const backgroundFileByType = {
    title: 'page00-title-page.png',
    blank: 'page00-blank.jpg',
    dedication: 'page00-dedication.jpeg',
  };
  const storyBackgroundFiles = [
    'page01-twilight-walk.jpg',
    'page02-night-forest.jpeg',
    'page03-magic-doorway.jpeg',
    'page04-courage-leap.jpeg',
    'page05-morning-meadow.jpeg',
    'page06-tall-forest.jpg',
    'page07-mountain-vista.jpg',
    'page08-picnic-surprise.jpg',
    'page09-beach-discovery.jpg',
    'page10-crystal-cave.jpg',
    'page11-giant-flowers.jpg',
    'page12-almost-there.jpg',
    'page13-animal-reveal.jpg',
    'page14-flying-home.jpg',
  ];
  const sceneSlugs = [
    'twilight-walk',
    'night-forest',
    'magic-doorway',
    'courage-leap',
    'morning-meadow',
    'tall-forest',
    'mountain-vista',
    'picnic-surprise',
    'beach-discovery',
    'crystal-cave',
    'giant-flowers',
    'almost-there',
    'animal-reveal',
    'flying-home',
  ];
  const sceneNames = [
    'twilight_walk',
    'night_forest',
    'magic_doorway',
    'courage_leap',
    'morning_meadow',
    'tall_forest',
    'mountain_vista',
    'picnic_surprise',
    'beach_discovery',
    'crystal_cave',
    'giant_flowers',
    'enchanted_grove',
    'animal_reveal',
    'flying_home',
  ];

  const backgroundImages = pagePlan.map((page) => {
    const pageType = String(page.type || '');
    const pageNumber = Number(page.index);
    const pageLabel = String(page.label || `p${String(pageNumber).padStart(2, '0')}`);

    if (pageType === 'title') {
      const r2Key = `${assetRoot}/backgrounds/${backgroundFileByType.title}`;
      return {
        pageNumber,
        pageLabel,
        pageType,
        storyPageNumber: null,
        sceneName: 'title',
        r2Key,
        imagePath: `${backendUrl}/api/assets/${r2Key}`,
        validated: true,
      };
    }

    if (pageType === 'blank') {
      const r2Key = `${assetRoot}/backgrounds/${backgroundFileByType.blank}`;
      return {
        pageNumber,
        pageLabel,
        pageType,
        storyPageNumber: null,
        sceneName: 'blank',
        r2Key,
        imagePath: `${backendUrl}/api/assets/${r2Key}`,
        validated: true,
      };
    }

    if (pageType === 'dedication') {
      const r2Key = `${assetRoot}/backgrounds/${backgroundFileByType.dedication}`;
      return {
        pageNumber,
        pageLabel,
        pageType,
        storyPageNumber: null,
        sceneName: 'dedication',
        r2Key,
        imagePath: `${backendUrl}/api/assets/${r2Key}`,
        validated: true,
      };
    }

    const storyPageNumber = Number(page.storyPageNumber);
    const sceneIndex =
      Number.isFinite(storyPageNumber) && storyPageNumber > 0
        ? Math.min(storyPageNumber - 1, sceneSlugs.length - 1)
        : 0;
    const storyBackgroundFile = storyBackgroundFiles[sceneIndex] ?? storyBackgroundFiles[0];
    const r2Key = `${assetRoot}/backgrounds/${storyBackgroundFile}`;

    return {
      pageNumber,
      pageLabel,
      pageType,
      storyPageNumber,
      sceneName: sceneNames[sceneIndex],
      r2Key,
      imagePath: `${backendUrl}/api/assets/${r2Key}`,
      validated: true,
    };
  });

  const characterSpecs = toRecord(input.characterSpecs);
  const animalGuideRaw = characterSpecs.animalGuide ?? input.animalGuide ?? '';
  const animalKey = String(animalGuideRaw).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  const animalSlugFromKey = (value: string): string => {
    if (/^(t\s*rex|t\s*-\s*rex|trex|dinosaur)$/.test(value)) return 't-rex';
    if (/^owl$/.test(value)) return 'owl';
    if (/^penguin$/.test(value)) return 'penguin';
    if (/^unicorn$/.test(value)) return 'unicorn';
    if (/^lion$/.test(value)) return 'lion';
    if (/^tiger$/.test(value)) return 'tiger';
    if (/^dog$/.test(value)) return 'dog';
    if (/^cat$/.test(value)) return 'cat';
    return 'cat';
  };

  const displayNameFromSlug = (slug: string): string => {
    if (slug === 't-rex') return 'T-Rex';
    return slug.charAt(0).toUpperCase() + slug.slice(1);
  };

  const overlayVariantForSlug = (slug: string): string => {
    if (slug === 't-rex') return 'clawprints';
    if (slug === 'owl') return 'owl-feathers';
    if (slug === 'penguin') return 'penguin-feathers';
    if (slug === 'unicorn') return 'fur';
    if (['cat', 'dog', 'lion', 'tiger'].includes(slug)) return 'footprints';
    return 'footprints';
  };

  const animalSlug = animalSlugFromKey(animalKey);
  const animalDisplayName = displayNameFromSlug(animalSlug);
  const overlayVariant = overlayVariantForSlug(animalSlug);
  const overlayImages = pagePlan
    .filter((page) => String(page.overlaySlot || '') === 'animalTracks')
    .map((page) => {
      const r2Key = `${assetRoot}/overlays/animal-tracks/page05-meadow-${overlayVariant}.png`;
      return {
        pageNumber: Number(page.index),
        pageLabel: String(page.label || ''),
        storyPageNumber: Number(page.storyPageNumber || 0) || null,
        imagePath: `${backendUrl}/api/assets/${r2Key}`,
        kind: 'trail',
        slot: 'animalTracks',
        variant: overlayVariant,
        r2Key,
        validated: true,
      };
    });

  const animalsBase = `${assetRoot}/characters/animals`;
  const appearsKey = `${animalsBase}/${animalSlug}-appears.png`;
  const flyingKey = `${animalsBase}/${animalSlug}-flying.png`;
  const animalImages = {
    ...toRecord(input.animalImages),
    slug: animalSlug,
    displayName: animalDisplayName,
    appearsR2Key: appearsKey,
    appears: `${backendUrl}/api/assets/${appearsKey}`,
    appearsImagePath: `${backendUrl}/api/assets/${appearsKey}`,
    imageAppears: `${backendUrl}/api/assets/${appearsKey}`,
    flyingR2Key: flyingKey,
    flying: `${backendUrl}/api/assets/${flyingKey}`,
    flyingImagePath: `${backendUrl}/api/assets/${flyingKey}`,
    imageFlying: `${backendUrl}/api/assets/${flyingKey}`,
  };

  let dedicationText = input.dedicationText ?? null;
  if (!dedicationText || dedicationText === 'null' || dedicationText === '') {
    dedicationText = null;
  }

  return {
    backendUrl,
    backgroundImages,
    overlayImages,
    animalImages,
    coverSpreadImagePath: `${backendUrl}/api/assets/${assetRoot}/covers/cover-spread.jpg`,
    dedicationText,
  };
}

function buildStoryContext(input: JsonRecord, backendUrl: string): StoryContext {
  const order = toRecord(input);
  const characterSpecs = toRecord(order.characterSpecs);
  const childName = toTrimmedString(characterSpecs.childName);
  if (!childName) {
    throw new Error('Child name required (characterSpecs.childName)');
  }

  const hometown = toTrimmedString(characterSpecs.hometown) ?? 'a cozy town';
  const hometownReturn = toTrimmedString(characterSpecs.hometown)
    ? `to ${characterSpecs.hometown}`
    : 'back to their cozy town';
  const publicR2Url = toTrimmedString(order.publicR2Url);
  const characterHash = toTrimmedString(order.characterHash);

  if (!characterHash) {
    throw new Error('Missing characterHash in W3 preview plan input');
  }

  const pronounsRaw = toTrimmedString(characterSpecs.pronouns) ?? '';
  const pronounsLower = pronounsRaw.toLowerCase();
  const pronouns = (() => {
    if (pronounsLower.includes('she') || pronounsLower.includes('girl')) {
      return {
        subject: 'she',
        object: 'her',
        possessive: 'her',
        reflexive: 'herself',
      };
    }
    if (pronounsLower.includes('he') || pronounsLower.includes('boy')) {
      return {
        subject: 'he',
        object: 'him',
        possessive: 'his',
        reflexive: 'himself',
      };
    }
    return {
      subject: 'they',
      object: 'them',
      possessive: 'their',
      reflexive: 'themselves',
    };
  })();

  const animalImages = toRecord(order.animalImages);
  const animalSlug =
    toTrimmedString(animalImages.slug) ??
    String(characterSpecs.animalGuide || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const displayNameFromSlug = (slug: string): string => {
    if (slug === 't-rex') return 'T-Rex';
    if (!slug) return 'Tiger';
    return slug.charAt(0).toUpperCase() + slug.slice(1);
  };
  const animalDisplayName =
    toTrimmedString(animalImages.displayName) ?? displayNameFromSlug(animalSlug || 'tiger');

  let trailType = 'footprints';
  if (/(t\s*-\s*rex|t\s*rex|trex|dinosaur)/i.test(animalSlug)) {
    trailType = 'giant footprints';
  } else if (/(owl|penguin)/i.test(animalSlug)) {
    trailType = 'feathers';
  } else if (/unicorn/i.test(animalSlug)) {
    trailType = 'colorful fur';
  } else if (/(lion|tiger|dog|cat)/i.test(animalSlug)) {
    trailType = 'paw prints';
  }

  const lines = [
    `It was bedtime in ${hometown}. ${childName} closed ${pronouns.possessive} eyes and took a soft breath.<br>"Let's take a dream-walk," a quiet voice whispered.`,
    `Outside, the night sparkled with stars.<br>"Look up," the voice said. "Pause. Breathe. Listen."`,
    `A glowing door opened.<br>"When we listen to our own quiet, new worlds begin to whisper back."`,
    `${childName} floated among the stars.<br>"This is a place your quiet made," the voice whispered.<br>"Whenever the day feels too much, breathe and visit again."`,
    `${childName} noticed a trail of ${trailType} and felt a tiny yes inside.<br>"You can follow me anytime," the voice said. Listening helps you find the way.`,
    `Wind whooshed as ${childName} ran, light and quick.<br>"Listening brings courage," the voice said. "It can feel like joy."`,
    `A wide view appeared.<br>"Sometimes it helps to stop and see how far you've come," the voice said.`,
    `Lunch was waiting."Hungry? Let's eat," the voice said.<br> "Being kind to your body is listening, too."`,
    `"When you look closely, you can find beautiful things," the voice said.<br>${childName} paused and found a shining shell.`,
    `A crystal cave glimmered.<br>"Small steps. Watch where your feet go," the voice said. "Careful can be brave."`,
    `Giant flowers stretched overhead. ${childName} gasped in surprise.<br>"You'll be amazed by what you can grow," the voice said.`,
    `The voice felt very close now, and a trail led deeper between the trees.<br>"To hear me clearly, go quiet inside," it said. "That quiet is your heart."`,
    `${animalDisplayName} stepped from the light, warm and bright.<br>"I've been with you the whole time," said ${animalDisplayName}. "I am your quiet inside voice."`,
    `"Ready to fly home?" asked ${animalDisplayName}. They whooshed through the stars ${hometownReturn}.<br>"Wherever you go—pause, breathe, listen—I'm always with you."`,
  ];

  const storyTexts = lines.map((text, index) => ({
    pageNumber: index + 1,
    text,
    characterName: childName,
    hometown,
    animalGuide: animalDisplayName,
    trailType,
    validated: true,
    pronouns: pronounsRaw,
    pronounsUsed: pronouns,
  }));

  const processedImages =
    Array.isArray(order.processedImages) && order.processedImages.length > 0
      ? order.processedImages.map((entry) => toRecord(entry))
      : Array.from({ length: 12 }, (_, index) => {
          const poseNumber = index + 1;
          const padded = String(poseNumber).padStart(2, '0');
          const fileName = `characters_${characterHash}_pose${padded}_nobg.png`;
          const r2Path = `${resolveBookId(order, resolveOrderId(order))}/order-generated-assets/characters/${characterHash}/${fileName}`;
          const publicUrl = publicR2Url ? `${publicR2Url}/${r2Path}` : null;

          return {
            poseNumber,
            fileName,
            r2Path,
            publicUrl,
            briaProcessed: true,
            briaStatus: 'COMPLETED',
            processingError: false,
          };
        });

  const poseNames = [
    'walking',
    'walking-looking-higher',
    'looking',
    'floating',
    'walking-looking-down',
    'jogging',
    'looking',
    'sitting-eating',
    'crouching',
    'crawling-moving-happy',
    'surprised-looking-up',
    'surprised',
  ];

  const characterImages = {
    base: `${backendUrl}/api/assets/${resolveBookId(order, resolveOrderId(order))}/order-generated-assets/characters/${characterHash}/base-character.png`,
    poses: processedImages
      .filter((entry) => {
        const poseNumber = toInteger(entry.poseNumber);
        return poseNumber !== null && poseNumber >= 1 && poseNumber <= 12;
      })
      .sort((left, right) => Number(left.poseNumber) - Number(right.poseNumber))
      .map((entry) => {
        const poseNumber = Number(entry.poseNumber);
        const imagePath =
          toTrimmedString(entry.publicUrl) ??
          (toTrimmedString(entry.r2Path)
            ? `${backendUrl}/api/assets/${String(entry.r2Path)}`
            : null);

        return {
          poseNumber,
          poseFilename: poseNames[poseNumber - 1] || `pose${String(poseNumber).padStart(2, '0')}`,
          imagePath,
          pageNumber: poseNumber,
          validated: !toBoolean(entry.processingError),
        };
      }),
  };

  let dedicationText = input.dedicationText ?? null;
  if (dedicationText === 'null' || dedicationText === '') {
    dedicationText = null;
  }

  return {
    storyTexts,
    processedImages,
    characterImages,
    trailType,
    animalDisplayName,
    pronounsExtracted: pronounsRaw,
    pronounsResolved: pronouns,
    dedicationText: toTrimmedString(dedicationText),
  };
}

function buildRenderContext(input: JsonRecord): JsonRecord {
  const orderId = resolveOrderId(input);
  const amazonOrderId = toTrimmedString(input.amazonOrderId);
  const rootOrderId = toTrimmedString(input.rootOrderId) ?? amazonOrderId ?? orderId;
  const characterHash = toTrimmedString(input.characterHash);
  const bookId = resolveBookId(input);
  const backendUrl = resolveBackendUrl(input);
  const orderR2BaseKey = resolveOrderR2BaseKey(input, orderId, bookId);
  const assetRoot = bookId;

  if (!orderId || !characterHash) {
    throw new Error('Resolve Asset Paths: unable to derive orderId/characterHash');
  }

  return {
    font: `${assetRoot}/fonts/CustomBook.ttf`,
    coversBg: `${assetRoot}/backgrounds/page00-covers.jpg`,
    coversBgStandard: `${assetRoot}/backgrounds/page00-covers.jpg`,
    coversBgAmazon: `${assetRoot}/backgrounds/page00-covers-barcode.jpg`,
    dedicationBg: `${assetRoot}/backgrounds/page00-dedication.jpeg`,
    blankBg: `${assetRoot}/backgrounds/page00-blank.jpg`,
    titlePageBg: `${assetRoot}/backgrounds/page00-title-page.png`,
    p05Overlay: `${assetRoot}/overlays/pages/page05-overlay.png`,
    p12Overlay: `${assetRoot}/overlays/pages/page12-overlay.png`,
    pose00: `${assetRoot}/order-generated-assets/characters/${characterHash}/base-character.png`,
    backendUrl,
    orderId,
    amazonOrderId,
    rootOrderId,
    characterHash,
    bookId,
    formatId: toTrimmedString(input.formatId),
    orderR2BaseKey,
  };
}

function deepFindUrl(obj: unknown, keyRegex: RegExp): string {
  try {
    const seen = new Set<unknown>();
    const stack: unknown[] = [obj];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!isRecord(current) || seen.has(current)) {
        continue;
      }
      seen.add(current);

      for (const [key, value] of Object.entries(current)) {
        if (keyRegex.test(String(key))) {
          if (typeof value === 'string' && value) {
            return value;
          }
          if (isRecord(value)) {
            const hit = firstString(
              value.imagePath,
              value.url,
              value.publicUrl,
              value.href,
              value.r2Key,
            );
            if (hit) {
              return hit;
            }
          }
        }

        if (value && typeof value === 'object') {
          stack.push(value);
        }
      }
    }
  } catch {
    return '';
  }

  return '';
}

function buildInteriorHtml(
  input: JsonRecord,
  inputs: JsonRecord,
  renderContext: JsonRecord,
  pagePlan: BookPageConfig[],
  bookConfig: BookConfig | null,
): InteriorHtmlResult {
  const order = toRecord(input);
  const explicitFormatId = toTrimmedString(order.formatId);
  const isAmazonOrder =
    explicitFormatId === 'amazon' ||
    (explicitFormatId === null &&
      (order.isAmazonOrder === true ||
        order.orderSource === 'amazon' ||
        Boolean(order.amazonOrderId)));
  let fallbackPlan: BookPageConfig[] = [];
  let resolvedBookConfig = bookConfig;
  if (!pagePlan.length) {
    try {
      const config =
        resolvedBookConfig ??
        loadBundledBookConfig({
        bookId: resolveBookId(order, resolveOrderId(order)),
        });
      resolvedBookConfig = config;
      fallbackPlan = resolvePagePlan(config, explicitFormatId ?? undefined).pagePlan;
    } catch {
      fallbackPlan = buildLegacyBookPagePlan(isAmazonOrder);
    }
  }
  const resolvedPagePlan = (pagePlan.length ? pagePlan : fallbackPlan)
    .slice()
    .sort((left, right) => Number(left.index) - Number(right.index));
  const backendUrl = resolveBackendUrl({ ...order, backendUrl: renderContext.backendUrl });
  const dedicationMessageRaw = String(order.dedicationText || inputs.dedicationMessage || '').trim();
  const useImgBackgrounds =
    order.useImgBackgrounds === false
      ? false
      : Boolean(order.useImgBackgrounds ?? renderContext.useImgBackgrounds ?? true);
  const p05OverlayKey = toTrimmedString(renderContext.p05Overlay);
  const p05OverlayUrlFromContext = p05OverlayKey
    ? `${backendUrl}/api/assets/${p05OverlayKey}`
    : null;
  const runBust = encodeURIComponent(
    toTrimmedString(order.runStamp) ??
      toTrimmedString(order.runId) ??
      Date.now().toString(),
  );
  const assetRoot = resolveBookId(order, resolveOrderId(order));

  const toAbsoluteAsset = (value: unknown): string => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    return `${backendUrl}/api/assets/${raw.replace(/^\/+/, '')}`;
  };
  const withBust = (value: string): string => {
    if (!value) return '';
    const separator = value.includes('?') ? '&' : '?';
    return `${value}${separator}v=${runBust}`;
  };
  const norm = (value: unknown): string => withBust(toAbsoluteAsset(value));
  const preloadHTML = (urls: string[]): string => {
    const uniqueUrls = Array.from(new Set(urls.filter((url) => typeof url === 'string' && url)));
    if (!uniqueUrls.length) return '';
    const imgs = uniqueUrls
      .map(
        (url) =>
          `<img src="${url}" width="1" height="1" alt="" loading="eager" decoding="sync" fetchpriority="high">`,
      )
      .join('');
    return `<div class="__preloads" style="position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;opacity:0;visibility:hidden;">${imgs}</div>`;
  };
  const bgLayerHTML = (url: string): string => {
    if (!url) return '';
    if (!useImgBackgrounds) {
      return `<div class="page-bg" style="background-image:url('${url}');"></div>`;
    }
    return `<div class="page-bg"><img src="${url}" alt="" loading="eager" decoding="sync" fetchpriority="high" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"></div>`;
  };
  const overlayLayerHTML = (url: string | null): string => {
    if (!url) return '';
    if (!useImgBackgrounds) {
      return `<div class="page-overlay" style="background-image:url('${url}');"></div>`;
    }
    return `<div class="page-overlay"><img src="${url}" alt="" loading="eager" decoding="sync" fetchpriority="high" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"></div>`;
  };
  const backgrounds = Array.isArray(order.backgroundImages) ? order.backgroundImages.map(toRecord) : [];
  const storyTexts = Array.isArray(order.storyTexts) ? order.storyTexts.map(toRecord) : [];
  const overlayImages = Array.isArray(order.overlayImages) ? order.overlayImages.map(toRecord) : [];

  const findBackgroundRaw = (pageNumber: number): string =>
    toTrimmedString(
      backgrounds.find((entry) => Number(entry.pageNumber) === Number(pageNumber))?.imagePath,
    ) ?? '';

  const findStoryText = (page: BookPageConfig): string => {
    const storyPageNumber = Number(page.storyPageNumber);
    if (Number.isFinite(storyPageNumber) && storyPageNumber > 0) {
      const byStoryPage = storyTexts.find(
        (entry) =>
          Number(entry.storyPageNumber) === storyPageNumber ||
          Number(entry.pageNumber) === storyPageNumber,
      );
      const text = toTrimmedString(byStoryPage?.text);
      if (text) {
        return text;
      }
    }

    const pageNumber = Number(page.index);
    const byPhysicalPage = storyTexts.find(
      (entry) =>
        Number(entry.physicalPageNumber) === pageNumber ||
        toTrimmedString(entry.pageLabel) === page.label,
    );
    return toTrimmedString(byPhysicalPage?.text) ?? '';
  };

  const findOverlayUrl = (page: BookPageConfig): string | null => {
    const pageNumber = Number(page.index);
    const arrayHit = overlayImages.find(
      (entry) =>
        Number(entry.pageNumber) === pageNumber &&
        firstString(entry.imagePath, entry.url, entry.publicUrl, entry.r2Key),
    );
    if (arrayHit) {
      return withBust(toAbsoluteAsset(firstString(
        arrayHit.imagePath,
        arrayHit.url,
        arrayHit.publicUrl,
        arrayHit.r2Key,
      )));
    }

    if (page.overlaySlot === 'animalTracks' && p05OverlayUrlFromContext) {
      return withBust(p05OverlayUrlFromContext);
    }

    return null;
  };

  const findPose = (page: BookPageConfig): JsonRecord | null => {
    if (page.poseNumber === null || page.poseNumber === undefined || page.poseNumber === '') {
      return null;
    }
    const poseNumber = Number(page.poseNumber);
    if (!Number.isFinite(poseNumber)) {
      return null;
    }

    const characterImages = toRecord(order.characterImages);
    const poses = Array.isArray(characterImages.poses)
      ? characterImages.poses.map(toRecord)
      : [];
    let pose = poses.find((entry) => Number(entry.poseNumber) === poseNumber) ?? null;
    if (!pose && Number(page.storyPageNumber) === 14) {
      pose =
        poses.find((entry) =>
          /fly|flying/i.test(firstString(entry.poseFilename, entry.filename)),
        ) ?? null;
    }
    if (!pose) {
      return null;
    }

    const imagePath = norm(
      pose.imagePath || pose.url || pose.publicUrl || pose.href || '',
    );

    return imagePath ? { ...pose, imagePath } : null;
  };

  const getAnimalSrc = (kind: 'appears' | 'flying'): string => {
    const animal = toRecord(order.animalImages);
    const direct =
      kind === 'appears'
        ? firstString(
            animal.appears,
            animal.appear,
            animal.page13,
            animal.p13,
            animal.animalAppears,
            animal.appearsImagePath,
            animal.appearsUrl,
            animal.imageAppears,
          )
        : firstString(
            animal.flying,
            animal.fly,
            animal.page14,
            animal.p14,
            animal.animalFlying,
            animal.flyingImagePath,
            animal.flyingUrl,
            animal.imageFlying,
          );
    if (direct) {
      return norm(direct);
    }

    const regex = kind === 'appears' ? /appear|p13|page.?13/i : /flying|fly|p14|page.?14/i;
    const deep = deepFindUrl(animal, regex);
    if (deep) {
      return norm(deep);
    }

    const deepOrder = deepFindUrl(order, regex);
    return deepOrder ? norm(deepOrder) : '';
  };

  const BASE = 2550;
  const PX = 2625;
  const SCALE = PX / BASE;
  const toPx = (value: number): string => `${Math.round(Number(value || 0) * SCALE)}px`;
  const characterPlacementMap = resolveCharacterPlacementMap(order, resolvedBookConfig);
  const animalPlacementMap = resolveAnimalPlacementMap(order, resolvedBookConfig);
  const charStyle = (storyPageNumber: number | null): string => {
    if (storyPageNumber === null || !Number.isFinite(storyPageNumber)) {
      return '';
    }

    return buildCharacterStyle(characterPlacementMap[storyPageNumber] ?? null, toPx);
  };
  const animalStyle = (storyPageNumber: number | null): string => {
    if (storyPageNumber === null || !Number.isFinite(storyPageNumber)) {
      return '';
    }

    return buildCharacterStyle(animalPlacementMap[storyPageNumber] ?? null, toPx);
  };

  const animalHTML = (page: BookPageConfig): string => {
    const storyPageNumber = Number(page.storyPageNumber);
    const name = firstString(order.animalDisplayName, toRecord(order.animalImages).displayName, 'Animal');

    if (storyPageNumber === 13) {
      const src = getAnimalSrc('appears');
      if (!src) {
        return '<div class="animal missing" data-missing="page13-appears"></div>';
      }
      return `
      <div class="animal" style="${animalStyle(storyPageNumber)}">
        <img class="sprite" src="${src}" alt="${name} Appears" loading="eager" decoding="sync" fetchpriority="high">
      </div>`;
    }

    if (storyPageNumber === 14) {
      const src = getAnimalSrc('flying');
      if (!src) {
        return '<div class="animal missing" data-missing="page14-flying"></div>';
      }
      return `
      <div class="animal" style="${animalStyle(storyPageNumber)}">
        <img class="sprite" src="${src}" alt="${name} Flying" loading="eager" decoding="sync" fetchpriority="high">
      </div>`;
    }

    return '';
  };

  const pageBlocks: Array<{ page: BookPageConfig; html: string }> = [];
  let pages_html = '';
  const interiorPagesHTML: string[] = [];

  for (const page of resolvedPagePlan) {
    const pageNumber = Number(page.index);
    const pageType = String(page.type || '');
    const background = norm(findBackgroundRaw(pageNumber));
    const preloadUrls = [background];
    let content = '';

    if (pageType === 'dedication') {
      const dedicationText = escapeHtml(formatText(dedicationMessageRaw));
      content = `${bgLayerHTML(background)}${
        dedicationText
          ? `<div class="dedication-wrap"><div class="dedication-text">${dedicationText}</div></div>`
          : ''
      }`;
    } else if (pageType === 'story') {
      const text = escapeHtml(formatText(findStoryText(page)));
      const pose = findPose(page);
      const overlayUrl = findOverlayUrl(page);
      const animalSrc =
        Number(page.storyPageNumber) === 13
          ? getAnimalSrc('appears')
          : Number(page.storyPageNumber) === 14
            ? getAnimalSrc('flying')
            : '';
      const textBoxOverlay = withBust(
        `${backendUrl}/api/assets/${assetRoot}/overlays/text-boxes/standard-box.png`,
      );
      preloadUrls.push(
        overlayUrl ?? '',
        textBoxOverlay,
        toTrimmedString(pose?.imagePath) ?? '',
        animalSrc,
      );

      const textBlock = `
  <div class="text-box">
    <img class="text-box__overlay" src="${textBoxOverlay}" alt="" aria-hidden="true">
    <div class="text-content">${text || ''}</div>
  </div>`.trim();

      content = [
        bgLayerHTML(background),
        overlayLayerHTML(overlayUrl),
        textBlock,
        pose
          ? `<div class="character" style="${charStyle(Number(page.storyPageNumber))}"><img class="sprite" src="${pose.imagePath}" alt="" loading="eager" decoding="sync" fetchpriority="high"></div>`
          : '',
        animalHTML(page),
      ].join('\n');
    } else {
      content = bgLayerHTML(background);
    }

    const block = `
<div class="book-page" id="page-${pageNumber}">
  ${preloadHTML(preloadUrls)}
  ${content}
</div>`;

    pages_html += block;
    interiorPagesHTML.push(block);
    pageBlocks.push({ page, html: block });
  }

  const PX_PER_IN = 96;
  const int = (value: number): number => Math.round(value);
  const minimalCss = `
@page { size: 2625px 2625px; margin: 0; }
html, body {
  margin: 0;
  padding: 0;
  width: 2625px;
  height: 2625px;
  overflow: hidden;
}
.book-page {
  position: relative;
  width: 2625px;
  height: 2625px;
  overflow: hidden;
  display: block;
}
.page-bg, .page-overlay {
  position: absolute;
  inset: 0;
  background-repeat: no-repeat;
  background-position: center center;
  background-size: cover;
}
.dedication-wrap {
  position: absolute;
  left: ${int(0.15 * 2625)}px;
  right: ${int(0.15 * 2625)}px;
  top: ${int(0.20 * 2625)}px;
  bottom: ${int(0.20 * 2625)}px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 5;
}
.dedication-text {
  width: 100%;
  text-align: center;
  font-size: ${(26 / 72) * PX_PER_IN}px;
  line-height: 1.4;
  letter-spacing: 1px;
  color: #312116;
  font-family: 'CustomBook', Arial, sans-serif;
}
.character, .animal { position: absolute; }
.character img, .animal img { width:100%; height:auto; display:block; }
`;

  const imageTemplateId =
    toTrimmedString(order.pdfMonkeyImageTemplateId) ??
    toTrimmedString(order.pdfMonkeyTemplateId) ??
    DEFAULT_PAGE_PREVIEW_TEMPLATE_ID;

  return {
    pages_html,
    interiorPagesHTML,
    page_css: minimalCss,
    pageBlocks,
    useImgBackgrounds,
    pdfMonkeyImageTemplateId: imageTemplateId,
    pdfMonkeyTemplateId: imageTemplateId,
    pdfFilename: `complete_book_${resolveOrderId(order) || 'ORDER'}.pdf`,
  };
}

function buildCoverPreviewItem(
  input: JsonRecord,
  inputs: JsonRecord,
  renderContext: JsonRecord,
  bookConfig: BookConfig | null,
): W3PreviewPlanCoverItem {
  const orderContext = toRecord(input);
  const backendUrl = resolveBackendUrl({
    ...orderContext,
    backendUrl: renderContext.backendUrl ?? orderContext.backendUrl,
  });
  const orderId =
    toTrimmedString(renderContext.orderId) ??
    resolveOrderId(orderContext) ??
    'ORDER';
  const bookId = resolveBookId(orderContext, orderId);
  const orderR2BaseKey = resolveOrderR2BaseKey(orderContext, orderId, bookId);
  const childName =
    toTrimmedString(inputs.childName) ??
    toTrimmedString(inputs.name) ??
    toTrimmedString(orderContext.childName) ??
    toTrimmedString(orderContext.name) ??
    '';
  const safeChildName = childName || '[CHILD NAME]';
  const runBust = encodeURIComponent(
    toTrimmedString(orderContext.runStamp) ??
      toTrimmedString(orderContext.runId) ??
      Date.now().toString(),
  );
  const toAssetUrl = (value: unknown): string => {
    const raw = String(value || '').trim().replace(/^\/+/, '');
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) {
      const separator = raw.includes('?') ? '&' : '?';
      return `${raw}${separator}v=${runBust}`;
    }
    return `${backendUrl}/api/assets/${raw}?v=${runBust}`;
  };
  const esc = (value: unknown): string =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  const useImgBackgrounds =
    orderContext.useImgBackgrounds === false
      ? false
      : Boolean(orderContext.useImgBackgrounds ?? renderContext.useImgBackgrounds ?? true);
  const explicitFormatId = toTrimmedString(orderContext.formatId);
  const isAmazonOrder =
    explicitFormatId === 'amazon' ||
    (explicitFormatId === null &&
      (orderContext.isAmazonOrder === true ||
        orderContext.orderSource === 'amazon' ||
        Boolean(orderContext.amazonOrderId)));

  const coversBgKey = isAmazonOrder
    ? toTrimmedString(renderContext.coversBgAmazon) ?? toTrimmedString(renderContext.coversBg)
    : toTrimmedString(renderContext.coversBg);
  if (!coversBgKey) {
    throw new Error('W3 cover preview planning requires a cover background asset');
  }

  const logoKey = `${bookId}/overlays/logo-and-url.png`;
  const logoUrl = toAssetUrl(logoKey);
  const poseImageKey =
    toTrimmedString(renderContext.characterHash)
      ? buildBgRemovedPoseAssetKey(renderContext.characterHash, 0, bookId)
      : toTrimmedString(renderContext.pose00);
  if (!poseImageKey) {
    throw new Error('W3 cover preview planning requires a pose00 asset');
  }
  const poseUrl = toAssetUrl(poseImageKey);
  const coversBgUrl = toAssetUrl(coversBgKey);
  const coverImageFilename = 'cover-spread.png';
  const coverImageR2Key = `${orderR2BaseKey}/preview-images/${coverImageFilename}`;
  const coverCharacterPlacement = resolveCoverCharacterPlacement(orderContext, bookConfig);
  const coverCharacterStyle = buildCoverSpriteStyle(
    coverCharacterPlacement,
    (value) => `${Math.round(value)}px`,
  );

  let coverHTML = '';
  let templateId = DEFAULT_STANDARD_COVER_PREVIEW_TEMPLATE_ID;

  if (isAmazonOrder) {
    const storyPrefix = 'A Story Made for';
    const frontChildHtml = esc(safeChildName);
    const backTitle = 'About Your Inner Voice.';
    const backBody =
      'On a gentle adventure, [CHILD NAME]\n' +
      'learns to hear the quiet voice inside—\n' +
      'the one that helps us feel brave, kind and true.';
    const tryThisHdr = 'TRY THIS';
    const tryThisTxt = 'Hand on heart.\nBreathe in 4, breathe out 4.\nWhat is your inner voice saying?';
    const madeWith = 'Made with love for';

    coverHTML = `
  <!-- [AMAZON COVER] Physical sheet viewport -->
  <div class="cover-viewport">
    <div class="cover-canvas">
      <div class="cover-spread">
        ${
          useImgBackgrounds
            ? `
        <div class="bg" style="position:absolute;inset:0;">
          <img src="${esc(coversBgUrl)}" alt="" loading="eager" decoding="sync" fetchpriority="high" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;">
          <img src="${esc(poseUrl)}" alt="" loading="eager" decoding="sync" fetchpriority="high"
               style="${coverCharacterStyle}">
</div>
`
            : `
        <div class="bg"
             style="
               background-image:
                 url('${esc(poseUrl)}'),
                 url('${esc(coversBgUrl)}');
             ">
        </div>
`
        }

        <div class="half back"></div>
        <div class="half front"></div>
        <div class="spine"></div>

        <div class="back-wrap">
          <div class="back-h1">${esc(backTitle)}</div>
          <div class="back-body">
            ${esc(backBody.replace('[CHILD NAME]', safeChildName))}
          </div>
          <div class="try-wrap">
            <div class="try-hdr">${esc(tryThisHdr)}</div>
            <div class="try-panel">
              <div class="try-text">${esc(tryThisTxt)}</div>
            </div>
          </div>
          <div class="footer">
            <span class="line">${esc(madeWith)}</span>
            <span class="name">${esc(safeChildName)}</span>
          </div>
        </div>

        <div class="front-amazon-personalization" data-fit-container="single-line">
          <div class="front-story-line">${esc(storyPrefix)}</div>
          <div class="front-child-name" data-fit-mode="single-line" data-fit-max="120" data-fit-soft-min="60">${frontChildHtml}</div>
        </div>

        <img src="${esc(logoUrl)}"
             alt=""
             class="logo-overlay-img"
             style="position: absolute; top: 0; left: 0; width: 5203px; height: 2625px; z-index: 999; pointer-events: none; display: block;" />
      </div>
    </div>
  </div>
`.trim();
    templateId = DEFAULT_AMAZON_COVER_PREVIEW_TEMPLATE_ID;
  } else {
    const possessive = (name: string): string => {
      if (!name) return "[CHILD'S NAME]";
      const trimmed = name.trim();
      if (!trimmed) return "[CHILD'S NAME]";
      return /s$/i.test(trimmed) ? `${trimmed}'` : `${trimmed}'s`;
    };
    const frontNameHtml = esc(possessive(childName || "[CHILD'S NAME]"))
      .replace(/&apos;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&amp;#39;/g, "'")
      .replace(/&#x27;/g, "'");
    const backTitle = 'About Your Inner Voice.';
    const backBody =
      'On a gentle adventure, [CHILD NAME]\n' +
      'learns to hear the quiet voice inside—\n' +
      'the one that helps us feel brave, kind and true.';
    const tryThisHdr = 'TRY THIS';
    const tryThisTxt = 'Hand on heart.\nBreathe in 4, breathe out 4.\nWhat is your inner voice saying?';
    const madeWith = 'Made with love for';

    coverHTML = `
  <!-- [LULU FIX COVER] Physical sheet viewport -->
  <div class="cover-viewport">
    <div class="cover-canvas">
      <div class="cover-spread">
        ${
          useImgBackgrounds
            ? `
        <div class="bg" style="position:absolute;inset:0;">
          <img src="${esc(coversBgUrl)}" alt="" loading="eager" decoding="sync" fetchpriority="high" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;">
          <img src="${esc(poseUrl)}" alt="" loading="eager" decoding="sync" fetchpriority="high"
               style="${coverCharacterStyle}">
</div>
`
            : `
        <div class="bg"
             style="
               background-image:
                 url('${esc(poseUrl)}'),
                 url('${esc(coversBgUrl)}');
             ">
        </div>
`
        }

        <div class="half back"></div>
        <div class="half front"></div>
        <div class="spine"></div>

        <div class="back-wrap">
          <div class="back-h1">${esc(backTitle)}</div>
          <div class="back-body">
            ${esc(backBody.replace('[CHILD NAME]', safeChildName))}
          </div>
          <div class="try-wrap">
            <div class="try-hdr">${esc(tryThisHdr)}</div>
            <div class="try-panel">
              <div class="try-text">${esc(tryThisTxt)}</div>
            </div>
          </div>
          <div class="footer">
            <span class="line">${esc(madeWith)}</span>
            <span class="name">${esc(safeChildName)}</span>
          </div>
        </div>

        <div class="front-title-wrap">
          <div class="front-title" data-fit-container="single-line">
            <span class="name" data-fit-mode="single-line">${frontNameHtml}</span>
            <span class="label">INNER VOICE</span>
          </div>
        </div>

        <img src="${esc(logoUrl)}" alt="" class="logo-overlay-img" style="position: absolute; top: 0; left: 0; width: 5203px; height: 2625px; z-index: 999; pointer-events: none; display: block;" />
      </div>
    </div>
  </div>
`.trim();
  }

  return {
    ...orderContext,
    backendUrl,
    orderId,
    amazonOrderId: toTrimmedString(orderContext.amazonOrderId),
    rootOrderId: toTrimmedString(orderContext.rootOrderId) ?? toTrimmedString(orderContext.amazonOrderId) ?? orderId,
    bookId,
    orderR2BaseKey,
    coverHTML,
    cover_html: coverHTML,
    coverImageFilename,
    coverImageR2Key,
    coverPngFilename: coverImageFilename,
    coverPngR2Key: coverImageR2Key,
    pdfMonkeyCoverTemplateId: templateId,
    pdfMonkeyImageTemplateId: templateId,
    pdfMonkeyTemplateId: templateId,
    workflowJobId: toInteger(orderContext.workflowJobId),
    workflowJobIdempotencyKey: toTrimmedString(orderContext.workflowJobIdempotencyKey),
    workflowJobStatus: toTrimmedString(orderContext.workflowJobStatus),
    workflowAttemptId: toInteger(orderContext.workflowAttemptId),
    workflowAttempt: toInteger(orderContext.workflowAttempt),
    workflowClaimed: toBoolean(orderContext.workflowClaimed),
  };
}

function buildPagePreviewItems(
  input: JsonRecord,
  interiorHtml: InteriorHtmlResult,
): W3PreviewPlanPageItem[] {
  const orderId = resolveOrderId(input);
  const amazonOrderId = toTrimmedString(input.amazonOrderId);
  const rootOrderId = toTrimmedString(input.rootOrderId) ?? amazonOrderId ?? orderId;
  const bookId = resolveBookId(input, orderId);
  const backendUrl = resolveBackendUrl(input);
  const orderR2BaseKey = resolveOrderR2BaseKey(input, orderId, bookId);

  const items = interiorHtml.pageBlocks.map(({ page, html }, index) => {
    const pageNumber = Number(page.index);
    const pageLabel = toTrimmedString(page.label) ?? `p${String(pageNumber).padStart(2, '0')}`;
    const pageImageFilename = `${pageLabel}.png`;
    const pageImageR2Key = buildPreviewImageAssetKey(orderR2BaseKey, pageLabel);

    return {
      orderId,
      amazonOrderId,
      rootOrderId,
      bookId,
      orderR2BaseKey,
      backendUrl,
      pageIndex: index,
      pageNumber,
      pageLabel,
      pageHtml: html,
      pageImageFilename,
      pageImageR2Key,
      page_css: interiorHtml.page_css,
      useImgBackgrounds: interiorHtml.useImgBackgrounds,
      pdfMonkeyImageTemplateId: interiorHtml.pdfMonkeyImageTemplateId,
      pdfMonkeyTemplateId: interiorHtml.pdfMonkeyTemplateId,
      workflowJobId: toInteger(input.workflowJobId),
      workflowJobIdempotencyKey: toTrimmedString(input.workflowJobIdempotencyKey),
      workflowJobStatus: toTrimmedString(input.workflowJobStatus),
      workflowAttemptId: toInteger(input.workflowAttemptId),
      workflowAttempt: toInteger(input.workflowAttempt),
      workflowClaimed: toBoolean(input.workflowClaimed),
    };
  });

  const testModePages = input.testModePages;
  if (Array.isArray(testModePages) && testModePages.length > 0) {
    const allowed = new Set(
      testModePages
        .map((value) => toInteger(value))
        .filter((value): value is number => value !== null),
    );
    return items.filter((item) => allowed.has(item.pageNumber));
  }

  const testModeLimit = toInteger(testModePages);
  if (testModeLimit !== null && testModeLimit > 0) {
    return [...items]
      .sort((left, right) => left.pageNumber - right.pageNumber)
      .slice(0, testModeLimit);
  }

  return items;
}

export function buildW3PreviewPlan(
  input: JsonRecord,
  options: BuildW3PreviewPlanOptions = {},
): BuildW3PreviewPlanResult {
  const orderId = resolveOrderId(input);
  if (!orderId) {
    throw new Error('W3 preview planning requires orderId');
  }

  const bookId = resolveBookId(input, orderId);
  const amazonOrderId = resolveAmazonOrderId(input, orderId);
  const rootOrderId = resolveRootOrderId(input, amazonOrderId, orderId);
  const explicitFormatId = toTrimmedString(input.formatId);
  const isAmazonFallback =
    explicitFormatId === 'amazon' ||
    (explicitFormatId === null &&
      (toBoolean(input.isAmazonOrder) || Boolean(input.amazonOrderId)));
  let bookConfig: BookConfig | null = null;
  let pagePlan =
    Array.isArray(input.pagePlan) && input.pagePlan.length > 0
      ? input.pagePlan.map((page) => page as BookPageConfig)
      : [];
  if (!pagePlan.length) {
    try {
      bookConfig = loadBundledBookConfig({ bookId });
      pagePlan = resolvePagePlan(bookConfig, explicitFormatId ?? undefined).pagePlan;
    } catch {
      pagePlan = buildLegacyBookPagePlan(isAmazonFallback);
    }
  } else {
    try {
      bookConfig = loadBundledBookConfig({ bookId });
    } catch {
      bookConfig = null;
    }
  }
  const sortedPagePlan = [...pagePlan].sort((left, right) => left.index - right.index);
  const inputs = buildNormalizedInputs(input);
  const canonicalAssets = buildCanonicalAssets(input, sortedPagePlan);
  const storyContext = buildStoryContext(
    {
      ...input,
      animalImages: canonicalAssets.animalImages,
      dedicationText: toTrimmedString(input.dedicationText) ?? canonicalAssets.dedicationText,
    },
    canonicalAssets.backendUrl,
  );
  const renderContext = buildRenderContext(input);
  const baseOrder: JsonRecord = {
    ...input,
    orderId,
    amazonOrderId,
    rootOrderId,
    bookId,
    backendUrl: canonicalAssets.backendUrl,
    orderR2BaseKey: resolveOrderR2BaseKey(input, orderId, bookId),
    inputs,
    renderContext,
    backgroundImages: canonicalAssets.backgroundImages,
    overlayImages: canonicalAssets.overlayImages,
    animalImages: canonicalAssets.animalImages,
    coverSpreadImagePath: canonicalAssets.coverSpreadImagePath,
    dedicationText:
      storyContext.dedicationText ??
      toTrimmedString(canonicalAssets.dedicationText) ??
      toTrimmedString(input.dedicationText),
    storyTexts: storyContext.storyTexts,
    processedImages: storyContext.processedImages,
    characterImages: storyContext.characterImages,
    trailType: storyContext.trailType,
    animalDisplayName: storyContext.animalDisplayName,
    pronounsExtracted: storyContext.pronounsExtracted,
    pronounsResolved: storyContext.pronounsResolved,
    characterPlacement: options.characterPlacementOverride ?? null,
    animalPlacement: options.animalPlacementOverride ?? null,
    coverCharacterPlacement: options.coverCharacterPlacementOverride ?? null,
    pagePlan: sortedPagePlan,
    pageLabels:
      Array.isArray(input.pageLabels) && input.pageLabels.length > 0
        ? input.pageLabels
        : sortedPagePlan.map((page) => page.label),
  };
  const interiorHtml = buildInteriorHtml(
    baseOrder,
    inputs,
    renderContext,
    sortedPagePlan,
    bookConfig,
  );
  const coverPreviewItem = buildCoverPreviewItem(baseOrder, inputs, renderContext, bookConfig);
  const pagePreviewItems = buildPagePreviewItems(baseOrder, interiorHtml);

  return {
    ...baseOrder,
    page_css: interiorHtml.page_css,
    pages_html: interiorHtml.pages_html,
    interiorPagesHTML: interiorHtml.interiorPagesHTML,
    useImgBackgrounds: interiorHtml.useImgBackgrounds,
    pdfMonkeyImageTemplateId: interiorHtml.pdfMonkeyImageTemplateId,
    pdfMonkeyTemplateId: interiorHtml.pdfMonkeyTemplateId,
    pdfFilename: interiorHtml.pdfFilename,
    pagePreviewItems,
    coverPreviewItem,
  } as BuildW3PreviewPlanResult;
}
