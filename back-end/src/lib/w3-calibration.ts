import {
  getLegacyReferenceAnimalPlacement,
  buildW3AssemblyInput,
  buildW3PreviewPlan,
  getLegacyReferenceCharacterPlacement,
  loadBundledBookConfig,
  parseAnimalPlacementOverride,
  parseCharacterPlacementOverride,
  resolvePagePlan,
  resolveBookAnimalPlacementMap,
  resolveBookCharacterPlacementMap,
  type BookAnimalPlacementMap,
  type BookCharacterPlacementEntry,
  type BookCharacterPlacementMap,
  type BuildW3AssemblyInputResult,
  type BuildW3PreviewPlanResult,
} from '@/lib/books';
import {
  buildManifestKeyHintOptionsFromOrderLike,
  buildPoseReferenceAssetKey,
} from '@/lib/order-paths';
import { resolveCanonicalBackendBaseUrl } from '@/lib/backend-url';
import { downloadManifest } from '@/lib/r2-service';
import { extractR2Key } from '@/lib/r2-utils';
import { getOrderFromSupabase } from '@/lib/supabase-client';
import {
  inspectPoseScaleAsset,
  type PoseScaleInspectionResult,
} from '@/lib/pose-scale-normalization';
import amazonFixture from '@/lib/books/fixtures/w3-replay/book1-amazon-sibling.json';
import standardFixture from '@/lib/books/fixtures/w3-replay/book1-standard-manifest-url-hint.json';

type JsonRecord = Record<string, unknown>;

interface W3ReplayFixture {
  fixtureId: string;
  backendUrl?: string;
  input: Record<string, unknown>;
  manifests: {
    oneKey: string;
    one: Record<string, unknown>;
    twoBKey: string;
    twoB: Record<string, unknown>;
    threeKey: string;
    three: Record<string, unknown>;
  };
}

export interface W3CalibrationRequest {
  sourceType: 'fixture' | 'order';
  fixtureId?: string | null;
  orderId?: string | null;
  selectedStoryPageNumber?: number | null;
  selectedPoseNumber?: number | null;
  characterPlacementOverrideByStoryPage?: unknown;
  animalPlacementOverrideByStoryPage?: unknown;
  adminBaseUrl?: string | null;
}

export interface W3CalibrationPageOption {
  pageLabel: string;
  pageNumber: number;
  storyPageNumber: number;
  poseNumber: number | null;
  editableAssetType: 'character' | 'animal';
  backgroundUrl: string | null;
  overlayUrls: string[];
  characterUrl: string | null;
  animalUrl: string | null;
  editableAssetUrl: string | null;
  currentPlacement: BookCharacterPlacementEntry | null;
  legacyPlacement: BookCharacterPlacementEntry | null;
}

export interface W3CalibrationPoseOption {
  poseNumber: number;
  imageUrl: string;
  referenceUrl: string;
  usedByStoryPages: number[];
}

export interface W3CalibrationResponse {
  success: true;
  fixtureOptions: Array<{ fixtureId: string; label: string }>;
  source: {
    type: 'fixture' | 'order';
    fixtureId: string | null;
    orderId: string;
    label: string;
    bookId: string;
    formatId: string | null;
    orderPrefix: string;
    pagePlanSource: string;
    requiredPoseSource: string;
    poseAssetMode: 'live-generated' | 'reference-standin';
  };
  viewport: {
    width: number;
    height: number;
  };
  pages: W3CalibrationPageOption[];
  poses: W3CalibrationPoseOption[];
  selectedStoryPageNumber: number | null;
  selectedPoseNumber: number | null;
  selectedPage: {
    currentSrcDoc: string | null;
    legacySrcDoc: string | null;
    backgroundUrl: string | null;
    overlayUrls: string[];
    editableAssetType: 'character' | 'animal';
    editableAssetUrl: string | null;
    characterUrl: string | null;
    animalUrl: string | null;
    currentPlacement: BookCharacterPlacementEntry | null;
    legacyPlacement: BookCharacterPlacementEntry | null;
  } | null;
  selectedPose: {
    poseNumber: number;
    imageUrl: string;
    referenceUrl: string;
    inspection: PoseScaleInspectionResult | null;
    inspectionError: string | null;
  } | null;
  exportHints: {
    characterPlacementOverrideByStoryPage: Record<string, BookCharacterPlacementEntry>;
    animalPlacementOverrideByStoryPage: Record<string, BookCharacterPlacementEntry>;
    poseAnchorSuggestionByPose: Record<
      string,
      {
        groundContactY: number;
        groundContactCenterX: number;
        headToFeetSpan: number;
      }
    >;
  };
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
  if (!trimmed) {
    return null;
  }

  const lowered = trimmed.toLowerCase();
  return lowered === 'null' || lowered === 'undefined' ? null : trimmed;
}

function buildPageDocument(pageHtml: string, pageCss: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #ffffff;
      }
      body {
        display: flex;
        align-items: flex-start;
        justify-content: flex-start;
      }
      #w3-calibration-preview-shell {
        position: relative;
        width: 100vw;
        height: 100vh;
        overflow: hidden;
        background: #ffffff;
      }
      #w3-calibration-preview-stage {
        width: 2625px;
        height: 2625px;
        transform-origin: top left;
      }
      ${pageCss}
    </style>
  </head>
  <body>
    <div id="w3-calibration-preview-shell">
      <div id="w3-calibration-preview-stage">${pageHtml}</div>
    </div>
    <script>
      (() => {
        const stage = document.getElementById('w3-calibration-preview-stage');
        const shell = document.getElementById('w3-calibration-preview-shell');
        const targetWidth = 2625;
        const targetHeight = 2625;
        function fit() {
          if (!stage || !shell) return;
          const scale = Math.min(window.innerWidth / targetWidth, window.innerHeight / targetHeight);
          stage.style.transform = 'scale(' + scale + ')';
          shell.style.height = Math.round(targetHeight * scale) + 'px';
        }
        fit();
        window.addEventListener('resize', fit);
      })();
    </script>
  </body>
</html>`;
}

function clonePlacementEntry(
  entry: BookCharacterPlacementEntry,
): BookCharacterPlacementEntry {
  return {
    left: entry.left,
    top: entry.top,
    width: entry.width,
    rotateDeg: entry.rotateDeg,
    zIndex: entry.zIndex,
  };
}

function clonePlacementMap(
  value: BookCharacterPlacementMap | BookAnimalPlacementMap,
): Record<string, BookCharacterPlacementEntry> {
  return Object.fromEntries(
    Object.entries(value).map(([storyPageNumber, entry]) => [
      storyPageNumber,
      clonePlacementEntry(entry),
    ]),
  );
}

function loadReplayFixtures(): W3ReplayFixture[] {
  return [amazonFixture as W3ReplayFixture, standardFixture as W3ReplayFixture];
}

export function listW3CalibrationFixtures(): Array<{ fixtureId: string; label: string }> {
  return loadReplayFixtures().map((fixture) => ({
    fixtureId: fixture.fixtureId,
    label:
      fixture.fixtureId === 'book1-amazon-sibling'
        ? 'Book 1 Amazon Replay'
        : fixture.fixtureId === 'book1-standard-manifest-url-hint'
          ? 'Book 1 D2C Replay'
          : fixture.fixtureId,
  }));
}

async function buildAssemblyInputFromFixture(
  fixtureId: string,
  adminBaseUrl: string,
): Promise<BuildW3AssemblyInputResult> {
  const fixture = loadReplayFixtures().find((entry) => entry.fixtureId === fixtureId);
  if (!fixture) {
    throw new Error(`Unknown W3 calibration fixture: ${fixtureId}`);
  }

  const assemblyInput = await buildW3AssemblyInput(fixture.input, {
    loadManifest: async (manifestKey) => {
      if (manifestKey === fixture.manifests.oneKey) {
        return fixture.manifests.one;
      }
      if (manifestKey === fixture.manifests.twoBKey) {
        return fixture.manifests.twoB;
      }
      if (manifestKey === fixture.manifests.threeKey) {
        return fixture.manifests.three;
      }
      return null;
    },
    defaultBackendUrl: fixture.backendUrl ?? adminBaseUrl,
  });

  const config = loadBundledBookConfig({ bookId: assemblyInput.bookId });
  const resolvedPlan = resolvePagePlan(config, assemblyInput.formatId ?? undefined);
  const processedImages = resolvedPlan.pagePlan
    .map((page) => Number(page.poseNumber))
    .filter((poseNumber): poseNumber is number => Number.isFinite(poseNumber) && poseNumber > 0)
    .filter((poseNumber, index, values) => values.indexOf(poseNumber) === index)
    .map((poseNumber) => {
      const refKey = buildPoseReferenceAssetKey(assemblyInput.bookId, poseNumber);
      return {
        poseNumber,
        fileName: refKey.split('/').pop() ?? `pose${String(poseNumber).padStart(2, '0')}.png`,
        r2Path: refKey,
        publicUrl: `${adminBaseUrl}/api/assets/${refKey}`,
        briaProcessed: false,
        briaStatus: 'reference_pose_standin',
        flipped: false,
        flippedAt: null,
        sourceKey: 'approvedKey' as const,
      };
    });

  return {
    ...assemblyInput,
    expectedPageCount: resolvedPlan.expectedPageCount,
    pagePlan: resolvedPlan.pagePlan,
    pageLabels: resolvedPlan.pageLabels,
    pagePlanSource: 'runtime-config',
    requiredPoseNumbers: resolvedPlan.qaPolicy.pose.requiredPoseNumbers,
    requiredPoseSource: 'runtime-config',
    processedImages,
  };
}

async function buildAssemblyInputFromOrder(
  orderId: string,
  adminBaseUrl: string,
): Promise<BuildW3AssemblyInputResult> {
  const orderRow = await getOrderFromSupabase(orderId);
  if (!orderRow) {
    throw new Error(`Order ${orderId} not found`);
  }

  const manifestHints = buildManifestKeyHintOptionsFromOrderLike(orderRow);
  const record = toRecord(orderRow);

  return buildW3AssemblyInput(
    {
      orderId,
      rootOrderId:
        toTrimmedString(record.root_order_id) ??
        toTrimmedString(record.rootOrderId) ??
        orderId,
      amazonOrderId:
        toTrimmedString(record.amazon_order_id) ??
        toTrimmedString(record.amazonOrderId),
      orderPrefix: manifestHints.orderPrefix,
      bookId: manifestHints.bookId,
      backendUrl: adminBaseUrl,
    },
    {
      loadManifest: downloadManifest,
      defaultBackendUrl: adminBaseUrl,
    },
  );
}

function findFixtureLabel(fixtureId: string | null): string {
  if (!fixtureId) {
    return 'Live order';
  }
  return (
    listW3CalibrationFixtures().find((fixture) => fixture.fixtureId === fixtureId)?.label ??
    fixtureId
  );
}

function buildPageOptions(
  assemblyInput: BuildW3AssemblyInputResult,
  previewPlan: BuildW3PreviewPlanResult,
  currentPlacementMap: BookCharacterPlacementMap,
  legacyPlacementMap: BookCharacterPlacementMap,
  currentAnimalPlacementMap: BookAnimalPlacementMap,
  legacyAnimalPlacementMap: BookAnimalPlacementMap,
): W3CalibrationPageOption[] {
  const backgroundByLabel = new Map(
    previewPlan.backgroundImages.map((entry) => [String(entry.pageLabel), entry]),
  );
  const overlayByLabel = new Map<string, string[]>();
  for (const overlay of previewPlan.overlayImages) {
    const pageLabel = String(overlay.pageLabel || '');
    if (!pageLabel) continue;
    const existing = overlayByLabel.get(pageLabel) ?? [];
    const imagePath = toTrimmedString(overlay.imagePath);
    if (imagePath) {
      existing.push(imagePath);
      overlayByLabel.set(pageLabel, existing);
    }
  }

  const poseImageByNumber = new Map<number, string>();
  const poses = Array.isArray(toRecord(previewPlan.characterImages).poses)
    ? (toRecord(previewPlan.characterImages).poses as unknown[])
    : [];
  for (const pose of poses) {
    const record = toRecord(pose);
    const poseNumber = Number(record.poseNumber);
    const imagePath = toTrimmedString(record.imagePath);
    if (Number.isFinite(poseNumber) && imagePath) {
      poseImageByNumber.set(poseNumber, imagePath);
    }
  }

  const animalImages = toRecord(previewPlan.animalImages);
  const animalAppearsUrl =
    toTrimmedString(animalImages.appears) ??
    toTrimmedString(animalImages.appear) ??
    toTrimmedString(animalImages.page13) ??
    toTrimmedString(animalImages.p13) ??
    toTrimmedString(animalImages.appearsUrl) ??
    toTrimmedString(animalImages.appearsImagePath) ??
    null;
  const animalFlyingUrl =
    toTrimmedString(animalImages.flying) ??
    toTrimmedString(animalImages.fly) ??
    toTrimmedString(animalImages.page14) ??
    toTrimmedString(animalImages.p14) ??
    toTrimmedString(animalImages.flyingUrl) ??
    toTrimmedString(animalImages.flyingImagePath) ??
    null;

  return previewPlan.pagePreviewItems
    .map((item) => {
      const page = assemblyInput.pagePlan[item.pageIndex];
      const storyPageNumber = Number(page?.storyPageNumber);
      const poseNumber = Number(page?.poseNumber);
      if (!Number.isFinite(storyPageNumber) || storyPageNumber <= 0) {
        return null;
      }

      const background = backgroundByLabel.get(item.pageLabel);
      const characterUrl =
        Number.isFinite(poseNumber) && poseNumber > 0 ? poseImageByNumber.get(poseNumber) ?? null : null;
      const animalUrl =
        storyPageNumber === 13
          ? animalAppearsUrl
          : storyPageNumber === 14
            ? animalFlyingUrl
            : null;
      const editableAssetType: 'character' | 'animal' = characterUrl ? 'character' : 'animal';
      const editableAssetUrl = editableAssetType === 'character' ? characterUrl : animalUrl;
      if (!editableAssetUrl) {
        return null;
      }

      return {
        pageLabel: item.pageLabel,
        pageNumber: item.pageNumber,
        storyPageNumber,
        poseNumber: Number.isFinite(poseNumber) && poseNumber > 0 ? poseNumber : null,
        editableAssetType,
        backgroundUrl: toTrimmedString(background?.imagePath),
        overlayUrls: overlayByLabel.get(item.pageLabel) ?? [],
        characterUrl,
        animalUrl,
        editableAssetUrl,
        currentPlacement:
          editableAssetType === 'character'
            ? currentPlacementMap[storyPageNumber] ?? null
            : currentAnimalPlacementMap[storyPageNumber] ?? null,
        legacyPlacement:
          editableAssetType === 'character'
            ? legacyPlacementMap[storyPageNumber] ?? null
            : legacyAnimalPlacementMap[storyPageNumber] ?? null,
      } satisfies W3CalibrationPageOption;
    })
    .filter((item): item is W3CalibrationPageOption => item !== null)
    .sort((left, right) => left.storyPageNumber - right.storyPageNumber);
}

function buildPoseOptions(
  assemblyInput: BuildW3AssemblyInputResult,
  backendUrl: string,
): W3CalibrationPoseOption[] {
  const usedByStoryPages = new Map<number, number[]>();
  for (const page of assemblyInput.pagePlan) {
    if (
      page.storyPageNumber &&
      Number.isFinite(page.storyPageNumber) &&
      page.poseNumber &&
      Number.isFinite(page.poseNumber)
    ) {
      const existing = usedByStoryPages.get(page.poseNumber) ?? [];
      existing.push(page.storyPageNumber);
      usedByStoryPages.set(page.poseNumber, existing);
    }
  }

  return assemblyInput.processedImages
    .filter((image) => Number.isFinite(image.poseNumber) && image.poseNumber > 0)
    .map((image) => {
      const refKey = buildPoseReferenceAssetKey(assemblyInput.bookId, image.poseNumber);
      return {
        poseNumber: image.poseNumber,
        imageUrl: image.publicUrl,
        referenceUrl: `${backendUrl}/api/assets/${refKey}`,
        usedByStoryPages: (usedByStoryPages.get(image.poseNumber) ?? []).sort(
          (left, right) => left - right,
        ),
      };
    })
    .sort((left, right) => left.poseNumber - right.poseNumber);
}

function resolveSelectedStoryPageNumber(
  requested: number | null | undefined,
  pages: W3CalibrationPageOption[],
): number | null {
  if (
    Number.isFinite(requested) &&
    pages.some((page) => page.storyPageNumber === requested)
  ) {
    return requested ?? null;
  }

  return pages[0]?.storyPageNumber ?? null;
}

function resolveSelectedPoseNumber(
  requested: number | null | undefined,
  poses: W3CalibrationPoseOption[],
): number | null {
  if (Number.isFinite(requested) && poses.some((pose) => pose.poseNumber === requested)) {
    return requested ?? null;
  }

  return poses[0]?.poseNumber ?? null;
}

export async function buildW3CalibrationResponse(
  request: W3CalibrationRequest,
): Promise<W3CalibrationResponse> {
  const adminBaseUrl = resolveCanonicalBackendBaseUrl(request.adminBaseUrl);
  const assemblyInput =
    request.sourceType === 'order'
      ? await buildAssemblyInputFromOrder(
          toTrimmedString(request.orderId) ?? '',
          adminBaseUrl,
        )
      : await buildAssemblyInputFromFixture(
          toTrimmedString(request.fixtureId) ?? 'book1-standard-manifest-url-hint',
          adminBaseUrl,
        );

  const config = loadBundledBookConfig({ bookId: assemblyInput.bookId });
  const placementOverride = parseCharacterPlacementOverride(
    request.characterPlacementOverrideByStoryPage,
  );
  const animalPlacementOverride = parseAnimalPlacementOverride(
    request.animalPlacementOverrideByStoryPage,
  );
  const currentPlacementMap: BookCharacterPlacementMap = {
    ...resolveBookCharacterPlacementMap(config, assemblyInput.formatId),
    ...placementOverride,
  };
  const legacyPlacementMap = {
    ...resolveBookCharacterPlacementMap(config, assemblyInput.formatId),
    ...getLegacyReferenceCharacterPlacement(assemblyInput.bookId),
  };
  const currentAnimalPlacementMap: BookAnimalPlacementMap = {
    ...resolveBookAnimalPlacementMap(config, assemblyInput.formatId),
    ...animalPlacementOverride,
  };
  const legacyAnimalPlacementMap: BookAnimalPlacementMap = {
    ...resolveBookAnimalPlacementMap(config, assemblyInput.formatId),
    ...getLegacyReferenceAnimalPlacement(assemblyInput.bookId),
  };

  const currentPreviewPlan = buildW3PreviewPlan(assemblyInput, {
    characterPlacementOverride: currentPlacementMap,
    animalPlacementOverride: currentAnimalPlacementMap,
  });
  const legacyPreviewPlan = buildW3PreviewPlan(assemblyInput, {
    characterPlacementOverride: legacyPlacementMap,
    animalPlacementOverride: legacyAnimalPlacementMap,
  });

  const pages = buildPageOptions(
    assemblyInput,
    currentPreviewPlan,
    currentPlacementMap,
    legacyPlacementMap,
    currentAnimalPlacementMap,
    legacyAnimalPlacementMap,
  );
  const poses = buildPoseOptions(assemblyInput, adminBaseUrl);
  const selectedStoryPageNumber = resolveSelectedStoryPageNumber(
    request.selectedStoryPageNumber ?? null,
    pages,
  );
  const selectedPoseNumber = resolveSelectedPoseNumber(
    request.selectedPoseNumber ?? null,
    poses,
  );
  const selectedPageOption =
    pages.find((page) => page.storyPageNumber === selectedStoryPageNumber) ?? null;
  const currentPreviewItem =
    selectedPageOption
      ? currentPreviewPlan.pagePreviewItems.find(
          (item) => item.pageLabel === selectedPageOption.pageLabel,
        ) ?? null
      : null;
  const legacyPreviewItem =
    selectedPageOption
      ? legacyPreviewPlan.pagePreviewItems.find(
          (item) => item.pageLabel === selectedPageOption.pageLabel,
        ) ?? null
      : null;

  const selectedPoseOption =
    poses.find((pose) => pose.poseNumber === selectedPoseNumber) ?? null;
  let selectedPoseInspection: PoseScaleInspectionResult | null = null;
  let selectedPoseInspectionError: string | null = null;
  if (selectedPoseOption) {
    const imageKey = extractR2Key(selectedPoseOption.imageUrl);
    if (imageKey) {
      try {
        selectedPoseInspection = await inspectPoseScaleAsset({
          imageKey,
          poseNumber: selectedPoseOption.poseNumber,
          bookId: assemblyInput.bookId,
        });
      } catch (error) {
        selectedPoseInspectionError =
          error instanceof Error ? error.message : String(error);
      }
    } else {
      selectedPoseInspectionError = 'Could not extract an R2 asset key for the selected pose.';
    }
  }

  const selectedPose =
    selectedPoseOption
      ? {
          poseNumber: selectedPoseOption.poseNumber,
          imageUrl: selectedPoseOption.imageUrl,
          referenceUrl: selectedPoseOption.referenceUrl,
          inspection: selectedPoseInspection,
          inspectionError: selectedPoseInspectionError,
        }
      : null;

  const poseAnchorSuggestionByPose =
    selectedPose?.inspection?.diagnostics
      ? {
          [String(selectedPose.poseNumber)]: {
            groundContactY:
              selectedPose.inspection.diagnostics.referenceAnchorMetrics.groundContactY,
            groundContactCenterX:
              selectedPose.inspection.diagnostics.referenceAnchorMetrics.groundContactCenterX,
            headToFeetSpan:
              selectedPose.inspection.diagnostics.referenceAnchorMetrics.headToFeetSpan,
          },
        }
      : {};

  return {
    success: true,
    fixtureOptions: listW3CalibrationFixtures(),
    source: {
      type: request.sourceType,
      fixtureId:
        request.sourceType === 'fixture'
          ? toTrimmedString(request.fixtureId) ?? 'book1-standard-manifest-url-hint'
          : null,
      orderId: assemblyInput.orderId,
      label:
        request.sourceType === 'fixture'
          ? findFixtureLabel(toTrimmedString(request.fixtureId))
          : `Live order ${assemblyInput.orderId}`,
      bookId: assemblyInput.bookId,
      formatId: assemblyInput.formatId,
      orderPrefix: assemblyInput.orderPrefix,
      pagePlanSource: assemblyInput.pagePlanSource,
      requiredPoseSource: assemblyInput.requiredPoseSource,
      poseAssetMode:
        request.sourceType === 'fixture' ? 'reference-standin' : 'live-generated',
    },
    viewport: {
      width: config.rendering.preview.interiorPx.w,
      height: config.rendering.preview.interiorPx.h,
    },
    pages,
    poses,
    selectedStoryPageNumber,
    selectedPoseNumber,
    selectedPage: selectedPageOption
      ? {
          currentSrcDoc:
            currentPreviewItem
              ? buildPageDocument(currentPreviewItem.pageHtml, currentPreviewItem.page_css)
              : null,
          legacySrcDoc:
            legacyPreviewItem
              ? buildPageDocument(legacyPreviewItem.pageHtml, legacyPreviewItem.page_css)
              : null,
          backgroundUrl: selectedPageOption.backgroundUrl,
          overlayUrls: selectedPageOption.overlayUrls,
          editableAssetType: selectedPageOption.editableAssetType,
          editableAssetUrl: selectedPageOption.editableAssetUrl,
          characterUrl: selectedPageOption.characterUrl,
          animalUrl: selectedPageOption.animalUrl,
          currentPlacement: selectedPageOption.currentPlacement,
          legacyPlacement: selectedPageOption.legacyPlacement,
        }
      : null,
    selectedPose,
    exportHints: {
      characterPlacementOverrideByStoryPage: clonePlacementMap(placementOverride),
      animalPlacementOverrideByStoryPage: clonePlacementMap(animalPlacementOverride),
      poseAnchorSuggestionByPose,
    },
  };
}
