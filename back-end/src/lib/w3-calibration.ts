import {
  getLegacyReferenceAnimalPlacement,
  buildW3AssemblyInput,
  buildW3PreviewPlan,
  mergeCoverCharacterPlacement,
  getLegacyReferenceCoverCharacterPlacement,
  getLegacyReferenceCharacterPlacement,
  loadBundledBookConfig,
  parseAnimalPlacementOverride,
  parseCharacterPlacementOverride,
  parseCoverCharacterPlacementOverride,
  resolvePagePlan,
  resolveBookAnimalPlacementMap,
  resolveBookCoverCharacterPlacement,
  resolveBookCharacterPlacementMap,
  type BookAnimalPlacementMap,
  type BookCharacterPlacementEntry,
  type BookCharacterPlacementMap,
  type BuildW3AssemblyInputResult,
  type BuildW3PreviewPlanResult,
} from '@/lib/books';
import {
  buildManifestKeyHintOptionsFromOrderLike,
  buildBgRemovedPoseAssetKey,
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
  coverCharacterPlacementOverride?: unknown;
  adminBaseUrl?: string | null;
}

export interface W3CalibrationPageOption {
  pageLabel: string;
  pageNumber: number;
  storyPageNumber: number;
  poseNumber: number | null;
  editableAssetType: 'character' | 'animal' | 'cover-character';
  backgroundUrl: string | null;
  overlayUrls: string[];
  characterUrl: string | null;
  animalUrl: string | null;
  editableAssetUrl: string | null;
  currentPlacement: BookCharacterPlacementEntry | null;
  legacyPlacement: BookCharacterPlacementEntry | null;
  viewport: {
    width: number;
    height: number;
  };
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
    editableAssetType: 'character' | 'animal' | 'cover-character';
    editableAssetUrl: string | null;
    characterUrl: string | null;
    animalUrl: string | null;
    currentPlacement: BookCharacterPlacementEntry | null;
    legacyPlacement: BookCharacterPlacementEntry | null;
    viewport: {
      width: number;
      height: number;
    };
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
    coverCharacterPlacementOverride: BookCharacterPlacementEntry | null;
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

function buildPreviewDocument(
  pageHtml: string,
  pageCss: string,
  viewport: { width: number; height: number },
): string {
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
        width: ${viewport.width}px;
        height: ${viewport.height}px;
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
        const targetWidth = ${viewport.width};
        const targetHeight = ${viewport.height};
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

const STANDARD_COVER_PREVIEW_CSS = `
@font-face {
  font-family: 'CustomBook';
  src:
    url('https://admin.littleherolabs.com/api/assets/book-mvp-simple-adventure/fonts/custom-font.woff2') format('woff2'),
    url('https://admin.littleherolabs.com/api/assets/book-mvp-simple-adventure/fonts/custom-font.ttf') format('truetype');
  font-display: swap;
}

@page {
  size: 5203px 2625px;
  margin: 0;
}

html,
body {
  margin: 0;
  padding: 0;
  width: 5203px;
  height: 2625px;
  overflow: visible;
  -webkit-text-size-adjust: 100%;
}

* {
  box-sizing: border-box;
}

.cover-viewport,
.cover-canvas,
.cover-spread {
  position: relative;
  width: 5203px;
  height: 2625px;
  overflow: visible;
}

.cover-canvas {
  transform: none;
}

.bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  background-repeat: no-repeat, no-repeat;
  background-position: 86.5% 80.5%, center center;
  background-size: 1200px auto, cover;
}

.half {
  position: absolute;
  top: 0;
  height: 2625px;
}

.back {
  left: 0;
  width: 2601px;
}

.front {
  right: 0;
  width: 2602px;
}

.spine {
  position: absolute;
  left: 2601px;
  top: 0;
  width: 2px;
  height: 100%;
  background: rgba(0, 0, 0, 0.06);
  z-index: 3;
}

:root {
  --gold-main: #F4D28B;
  --gold-body: #F7E3B3;
  --gold-footer: #F4D28B;
  --panel-stroke: rgba(255, 255, 255, 0.80);
  --panel-text: #F7EBD1;
  --front-name-size: 280px;
  --front-label-size: 200px;
}

.front-title-wrap {
  position: absolute;
  left: calc(5203px * 0.76);
  top: 640px;
  width: 1800px;
  text-align: center;
  z-index: 6;
  transform: translateX(-50%) scale(0.8) translateY(-150px);
  transform-origin: center top;
}

.front-title {
  font-family: 'CustomBook', Arial, sans-serif;
  line-height: 1.06;
  letter-spacing: 2px;
  color: var(--gold-main);
  text-transform: uppercase;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

.front-title .name {
  display: inline-block;
  font-size: var(--front-name-size);
  white-space: nowrap;
  max-width: none;
  vertical-align: top;
}

.front-title .label {
  display: block;
  font-size: var(--front-label-size);
}

.back-wrap {
  position: absolute;
  left: 0;
  top: 370px;
  width: 2601px;
  padding: 0 220px;
  z-index: 6;
  text-align: center;
  margin: 0 auto;
  transform: scale(0.8) translateY(-150px);
  transform-origin: center top;
}

.back-h1 {
  font-family: 'CustomBook', Arial, sans-serif;
  font-size: 160px;
  line-height: 1.08;
  letter-spacing: 2px;
  color: var(--gold-main);
  margin-bottom: 80px;
}

.back-body {
  white-space: pre-line;
  font-family: 'CustomBook', Arial, sans-serif;
  font-size: 86px;
  line-height: 1.3;
  letter-spacing: 1px;
  color: var(--gold-body);
  margin: 0 auto 80px;
  max-width: 2000px;
}

.try-wrap {
  position: relative;
  width: 2000px;
  padding-top: 12px;
  margin: 200px auto 400px;
}

.try-hdr {
  font-family: 'CustomBook', Arial, sans-serif;
  font-size: 140px;
  letter-spacing: 8px;
  color: var(--gold-main);
  text-align: center;
  margin-bottom: 28px;
}

.try-panel {
  margin: 0 auto;
  width: 1600px;
  border: 8px solid var(--panel-stroke);
  border-radius: 98px;
  padding: 40px 60px;
  text-align: center;
}

.try-text {
  white-space: pre-line;
  font-family: 'CustomBook', Arial, sans-serif;
  font-size: 86px;
  line-height: 1.25;
  letter-spacing: 1px;
  color: var(--panel-text);
}

.footer {
  font-family: 'CustomBook', Arial, sans-serif;
  letter-spacing: 2px;
  color: var(--gold-footer);
  text-align: center;
  position: relative;
}

.footer .line {
  font-size: 86px;
  display: block;
}

.footer .name {
  font-size: 86px;
  display: block;
  margin-top: 12px;
}

.logo-overlay,
.logo-overlay-img {
  position: absolute;
  top: 0;
  left: 0;
  width: 5203px;
  height: 2625px;
  z-index: 999;
  pointer-events: none;
}
`;

const AMAZON_COVER_PREVIEW_CSS = `
@font-face {
  font-family: 'CustomBook';
  src:
    url('https://admin.littleherolabs.com/api/assets/book-mvp-simple-adventure/fonts/custom-font.woff2') format('woff2'),
    url('https://admin.littleherolabs.com/api/assets/book-mvp-simple-adventure/fonts/custom-font.ttf') format('truetype');
  font-display: swap;
}

html,
body {
  margin: 0;
  padding: 0;
  width: 5203px;
  height: 2625px;
  overflow: hidden;
  -webkit-text-size-adjust: 100%;
}

* {
  box-sizing: border-box;
}

.cover-viewport,
.cover-canvas,
.cover-spread {
  position: relative;
  width: 5203px;
  height: 2625px;
}

.cover-canvas {
  transform: none;
}

.bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  background-repeat: no-repeat, no-repeat;
  background-position: 86.5% 80.5%, center center;
  background-size: 1200px auto, cover;
}

.half {
  position: absolute;
  top: 0;
  height: 2625px;
}

.back {
  left: 0;
  width: 2601px;
}

.front {
  right: 0;
  width: 2602px;
}

.spine {
  position: absolute;
  left: 2601px;
  top: 0;
  width: 2px;
  height: 100%;
  background: rgba(0, 0, 0, 0.06);
  z-index: 3;
}

:root {
  --gold-main: #F4D28B;
  --gold-body: #F7E3B3;
  --gold-footer: #F4D28B;
  --panel-stroke: rgba(255, 255, 255, 0.80);
  --panel-text: #F7EBD1;
}

.back-wrap {
  position: absolute;
  left: 0;
  top: 370px;
  width: 2601px;
  padding: 0 220px;
  z-index: 6;
  text-align: center;
  margin: 0 auto;
  transform: scale(0.8) translateY(-150px);
  transform-origin: center top;
}

.back-h1 {
  font-family: 'CustomBook', Arial, sans-serif;
  font-size: 160px;
  line-height: 1.08;
  letter-spacing: 2px;
  color: var(--gold-main);
  margin-bottom: 80px;
}

.back-body {
  white-space: pre-line;
  font-family: 'CustomBook', Arial, sans-serif;
  font-size: 86px;
  line-height: 1.3;
  letter-spacing: 1px;
  color: var(--gold-body);
  margin: 0 auto 80px;
  max-width: 2000px;
}

.try-wrap {
  position: relative;
  width: 2000px;
  padding-top: 12px;
  margin: 200px auto 400px;
}

.try-hdr {
  font-family: 'CustomBook', Arial, sans-serif;
  font-size: 140px;
  letter-spacing: 8px;
  color: var(--gold-main);
  text-align: center;
  margin-bottom: 28px;
}

.try-panel {
  margin: 0 auto;
  width: 1600px;
  border: 8px solid var(--panel-stroke);
  border-radius: 98px;
  padding: 40px 60px;
  text-align: center;
}

.try-text {
  white-space: pre-line;
  font-family: 'CustomBook', Arial, sans-serif;
  font-size: 86px;
  line-height: 1.25;
  letter-spacing: 1px;
  color: var(--panel-text);
}

.footer {
  font-family: 'CustomBook', Arial, sans-serif;
  letter-spacing: 2px;
  color: var(--gold-footer);
  text-align: center;
  position: relative;
}

.footer .line {
  font-size: 86px;
  display: block;
}

.footer .name {
  font-size: 86px;
  display: block;
  margin-top: 12px;
}

.front-story-line,
.front-child-name {
  font-family: 'CustomBook', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

.front-amazon-personalization {
  position: absolute;
  left: 3020px;
  top: 710px;
  width: 1780px;
  z-index: 6;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 26px;
  text-align: center;
}

.front-story-line {
  font-size: 98px;
  line-height: 1.05;
  letter-spacing: 1px;
  color: #F7E3B3;
  text-transform: none;
}

.front-child-name {
  display: inline-block;
  font-size: 120px;
  line-height: 0.96;
  letter-spacing: 2px;
  color: #F7EBD1;
  text-transform: uppercase;
  white-space: nowrap;
  max-width: none;
  vertical-align: top;
}

.logo-overlay,
.logo-overlay-img {
  position: absolute;
  top: 0;
  left: 0;
  width: 5203px;
  height: 2625px;
  z-index: 999;
  pointer-events: none;
}
`;

const COVER_PREVIEW_FIT_SCRIPT = `
(() => {
  const EMERGENCY_MIN_FONT_SIZE = 24;

  function readNumber(el, attrName) {
    const raw = el.getAttribute(attrName);
    if (raw == null || raw === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }

  function getFitContainer(el) {
    return el.closest('[data-fit-container="single-line"]') || el.parentElement;
  }

  function fitsWithin(el, container) {
    const availableWidth =
      container.clientWidth ||
      container.getBoundingClientRect().width ||
      0;
    return {
      availableWidth,
      fits: el.scrollWidth <= availableWidth + 0.5,
    };
  }

  function fitSingleLine(el) {
    const container = getFitContainer(el);
    if (!container) return;

    const computed = window.getComputedStyle(el);
    let fontSize = readNumber(el, 'data-fit-max');
    if (!Number.isFinite(fontSize)) {
      fontSize = parseFloat(computed.fontSize) || 120;
    }

    const softMin = readNumber(el, 'data-fit-soft-min');

    el.style.display = 'inline-block';
    el.style.whiteSpace = 'nowrap';
    el.style.maxWidth = 'none';
    el.style.fontSize = fontSize + 'px';

    let state = fitsWithin(el, container);
    while (!state.fits && fontSize > EMERGENCY_MIN_FONT_SIZE) {
      fontSize -= 1;
      el.style.fontSize = fontSize + 'px';
      state = fitsWithin(el, container);
    }

    el.dataset.fitApplied = String(fontSize);
    if (softMin !== null && fontSize < softMin) {
      el.dataset.fitSoftMinExceeded = 'true';
    }

    if (!state.fits) {
      el.dataset.fitOverflow = 'true';
      document.documentElement.setAttribute('data-fit-overflow', 'true');
    }
  }

  function runFitPass() {
    const targets = document.querySelectorAll('[data-fit-mode="single-line"]');
    targets.forEach((target) => fitSingleLine(target));
  }

  function startFitPass() {
    window.requestAnimationFrame(() => {
      runFitPass();
      window.requestAnimationFrame(runFitPass);
    });
  }

  function fitViewport() {
    const stage = document.getElementById('w3-cover-preview-stage');
    const shell = document.getElementById('w3-cover-preview-shell');
    if (!stage || !shell) return;

    const targetWidth = ${5203};
    const targetHeight = ${2625};
    const scale = Math.min(window.innerWidth / targetWidth, window.innerHeight / targetHeight);
    stage.style.transform = 'scale(' + scale + ')';
    shell.style.height = Math.round(targetHeight * scale) + 'px';
  }

  function start() {
    fitViewport();
    startFitPass();
    window.addEventListener('resize', fitViewport);
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(start).catch(start);
  } else if (document.readyState === 'complete') {
    start();
  } else {
    window.addEventListener('load', start, { once: true });
  }
})();
`;

function buildCoverPreviewDocument(
  pageHtml: string,
  viewport: { width: number; height: number },
  formatId?: string | null,
): string {
  const pageCss = formatId === 'amazon' ? AMAZON_COVER_PREVIEW_CSS : STANDARD_COVER_PREVIEW_CSS;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      #w3-cover-preview-shell {
        position: relative;
        width: 100vw;
        height: 100vh;
        overflow: hidden;
        background: #ffffff;
      }
      #w3-cover-preview-stage {
        width: ${viewport.width}px;
        height: ${viewport.height}px;
        transform-origin: top left;
      }
      ${pageCss}
    </style>
  </head>
  <body>
    <div id="w3-cover-preview-shell">
      <div id="w3-cover-preview-stage">${pageHtml}</div>
    </div>
    <script>${COVER_PREVIEW_FIT_SCRIPT}</script>
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
  poseAssetMode: 'live-generated' | 'reference-standin',
  currentPlacementMap: BookCharacterPlacementMap,
  legacyPlacementMap: BookCharacterPlacementMap,
  currentAnimalPlacementMap: BookAnimalPlacementMap,
  legacyAnimalPlacementMap: BookAnimalPlacementMap,
  currentCoverPlacement: BookCharacterPlacementEntry | null,
  legacyCoverPlacement: BookCharacterPlacementEntry | null,
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

  const renderContext = toRecord(previewPlan.renderContext);
  const isAmazonOrder = assemblyInput.formatId === 'amazon' || assemblyInput.isAmazonOrder;
  const coverBackgroundKey =
    (isAmazonOrder
      ? toTrimmedString(renderContext.coversBgAmazon) ?? toTrimmedString(renderContext.coversBg)
      : toTrimmedString(renderContext.coversBg)) ?? null;
  const coverPoseKey =
    poseAssetMode === 'reference-standin'
      ? buildPoseReferenceAssetKey(assemblyInput.bookId, 0)
      : toTrimmedString(renderContext.characterHash)
        ? buildBgRemovedPoseAssetKey(
            toTrimmedString(renderContext.characterHash) as string,
            0,
            assemblyInput.bookId,
          )
        : toTrimmedString(renderContext.pose00) ?? buildPoseReferenceAssetKey(assemblyInput.bookId, 0);
  const coverOption =
    coverBackgroundKey && coverPoseKey
      ? ({
          pageLabel: 'cover',
          pageNumber: 0,
          storyPageNumber: 0,
          poseNumber: 0,
          editableAssetType: 'cover-character',
          backgroundUrl: `${previewPlan.backendUrl}/api/assets/${coverBackgroundKey}`,
          overlayUrls: [
            `${previewPlan.backendUrl}/api/assets/${assemblyInput.bookId}/overlays/logo-and-url.png`,
          ],
          characterUrl: `${previewPlan.backendUrl}/api/assets/${coverPoseKey}`,
          animalUrl: null,
          editableAssetUrl: `${previewPlan.backendUrl}/api/assets/${coverPoseKey}`,
          currentPlacement: currentCoverPlacement,
          legacyPlacement: legacyCoverPlacement,
          viewport: {
            width: 5203,
            height: 2625,
          },
        } satisfies W3CalibrationPageOption)
      : null;

  const storyPages = previewPlan.pagePreviewItems
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
        viewport: {
          width: 2625,
          height: 2625,
        },
      } satisfies W3CalibrationPageOption;
    })
    .filter((item): item is W3CalibrationPageOption => item !== null)
    .sort((left, right) => left.storyPageNumber - right.storyPageNumber);

  return coverOption ? [...storyPages, coverOption] : storyPages;
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
  const coverCharacterPlacementOverride = parseCoverCharacterPlacementOverride(
    request.coverCharacterPlacementOverride,
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
  const currentCoverPlacement = mergeCoverCharacterPlacement(
    resolveBookCoverCharacterPlacement(config, assemblyInput.formatId),
    coverCharacterPlacementOverride,
  );
  const legacyCoverPlacement = getLegacyReferenceCoverCharacterPlacement(
    assemblyInput.bookId,
  );

  const currentPreviewPlan = buildW3PreviewPlan(assemblyInput, {
    characterPlacementOverride: currentPlacementMap,
    animalPlacementOverride: currentAnimalPlacementMap,
    coverCharacterPlacementOverride: currentCoverPlacement,
  });
  const legacyPreviewPlan = buildW3PreviewPlan(assemblyInput, {
    characterPlacementOverride: legacyPlacementMap,
    animalPlacementOverride: legacyAnimalPlacementMap,
    coverCharacterPlacementOverride: legacyCoverPlacement,
  });

  const pages = buildPageOptions(
    assemblyInput,
    currentPreviewPlan,
    request.sourceType === 'fixture' ? 'reference-standin' : 'live-generated',
    currentPlacementMap,
    legacyPlacementMap,
    currentAnimalPlacementMap,
    legacyAnimalPlacementMap,
    currentCoverPlacement,
    legacyCoverPlacement,
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
    selectedPageOption && selectedPageOption.pageLabel !== 'cover'
      ? currentPreviewPlan.pagePreviewItems.find(
          (item) => item.pageLabel === selectedPageOption.pageLabel,
        ) ?? null
      : null;
  const legacyPreviewItem =
    selectedPageOption && selectedPageOption.pageLabel !== 'cover'
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
            selectedPageOption.pageLabel === 'cover'
              ? currentPreviewPlan.coverPreviewItem?.coverHTML
                ? buildCoverPreviewDocument(
                    currentPreviewPlan.coverPreviewItem.coverHTML,
                    selectedPageOption.viewport,
                    assemblyInput.formatId,
                  )
                : null
              : currentPreviewItem
                ? buildPreviewDocument(
                    currentPreviewItem.pageHtml,
                    currentPreviewItem.page_css,
                    selectedPageOption.viewport,
                  )
                : null,
          legacySrcDoc:
            selectedPageOption.pageLabel === 'cover'
              ? legacyPreviewPlan.coverPreviewItem?.coverHTML
                ? buildCoverPreviewDocument(
                    legacyPreviewPlan.coverPreviewItem.coverHTML,
                    selectedPageOption.viewport,
                    assemblyInput.formatId,
                  )
                : null
              : legacyPreviewItem
                ? buildPreviewDocument(
                    legacyPreviewItem.pageHtml,
                    legacyPreviewItem.page_css,
                    selectedPageOption.viewport,
                  )
                : null,
          backgroundUrl: selectedPageOption.backgroundUrl,
          overlayUrls: selectedPageOption.overlayUrls,
          editableAssetType: selectedPageOption.editableAssetType,
          editableAssetUrl: selectedPageOption.editableAssetUrl,
          characterUrl: selectedPageOption.characterUrl,
          animalUrl: selectedPageOption.animalUrl,
          currentPlacement: selectedPageOption.currentPlacement,
          legacyPlacement: selectedPageOption.legacyPlacement,
          viewport: selectedPageOption.viewport,
        }
      : null,
    selectedPose,
    exportHints: {
      characterPlacementOverrideByStoryPage: clonePlacementMap(placementOverride),
      animalPlacementOverrideByStoryPage: clonePlacementMap(animalPlacementOverride),
      coverCharacterPlacementOverride: coverCharacterPlacementOverride,
      poseAnchorSuggestionByPose,
    },
  };
}
