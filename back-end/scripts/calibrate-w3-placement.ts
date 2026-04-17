#!/usr/bin/env tsx

import path from 'node:path';
import os from 'node:os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import {
  buildW3AssemblyInput,
  buildW3PreviewPlan,
  getLegacyReferenceCharacterPlacement,
  loadBundledBookConfig,
  resolveBookCharacterPlacementMap,
  type BuildW3AssemblyInputResult,
  type BuildW3PreviewPlanResult,
  type BookCharacterPlacementMap,
  type BookPageConfig,
} from '@/lib/books';

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

interface CalibrationSummaryRow {
  fixtureId: string;
  formatId: string | null;
  pageLabel: string;
  pageNumber: number;
  storyPageNumber: number;
  currentPng: string;
  legacyPng: string;
  overlayPng: string;
  diffPng: string;
  diffPixels: number;
  diffRatio: number;
  currentPlacement: BookCharacterPlacementMap[number] | null;
  legacyPlacement: BookCharacterPlacementMap[number] | null;
}

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function parseArgs(): { fixtureIds: string[] | null; outputDir: string | null } {
  const args = process.argv.slice(2);
  const fixtureIds: string[] = [];
  let outputDir: string | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--fixture') {
      const value = args[index + 1]?.trim();
      if (value) {
        fixtureIds.push(value);
      }
      index += 1;
      continue;
    }
    if (arg === '--output-dir') {
      outputDir = args[index + 1]?.trim() || null;
      index += 1;
    }
  }

  return {
    fixtureIds: fixtureIds.length > 0 ? fixtureIds : null,
    outputDir,
  };
}

function loadReplayFixtures(): W3ReplayFixture[] {
  const fixturesDir = path.resolve(
    __dirname,
    '../src/lib/books/fixtures/w3-replay',
  );
  const entries = ['book1-amazon-sibling.json', 'book1-standard-manifest-url-hint.json'];
  return entries.map((entry) =>
    JSON.parse(readFileSync(path.join(fixturesDir, entry), 'utf8')) as W3ReplayFixture,
  );
}

async function buildAssemblyInputFromFixture(
  fixture: W3ReplayFixture,
): Promise<BuildW3AssemblyInputResult> {
  return buildW3AssemblyInput(fixture.input, {
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
    defaultBackendUrl: fixture.backendUrl,
  });
}

function buildPageDocument(pageHtml: string, pageCss: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=2625, initial-scale=1">
    <style>${pageCss}</style>
  </head>
  <body>${pageHtml}</body>
</html>`;
}

function resolveChromeExecutablePath(): string | undefined {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

async function renderPagePng(
  browser: Awaited<ReturnType<(typeof import('puppeteer'))['default']['launch']>>,
  html: string,
  css: string,
): Promise<Buffer> {
  const page = await browser.newPage();
  try {
    await page.setViewport({
      width: 2625,
      height: 2625,
      deviceScaleFactor: 1,
    });
    await page.setContent(buildPageDocument(html, css), {
      waitUntil: 'domcontentloaded',
    });
    await page
      .waitForFunction(
        () => Array.from(document.images).every((image) => image.complete),
        { timeout: 15000 },
      )
      .catch(() => undefined);
    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
    return Buffer.from(await page.screenshot({ type: 'png' }));
  } finally {
    await page.close();
  }
}

async function buildOverlayAndDiff(
  currentPng: Buffer,
  legacyPng: Buffer,
): Promise<{
  overlayPng: Buffer;
  diffPng: Buffer;
  diffPixels: number;
  diffRatio: number;
}> {
  const [currentRaw, legacyRaw] = await Promise.all([
    sharp(currentPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(legacyPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);

  assert(
    currentRaw.info.width === legacyRaw.info.width &&
      currentRaw.info.height === legacyRaw.info.height,
    'Calibration render dimensions must match',
  );

  const overlayRaw = Buffer.alloc(currentRaw.data.length);
  const diffRaw = Buffer.alloc(currentRaw.data.length);
  let diffPixels = 0;
  const threshold = 20;

  for (let index = 0; index < currentRaw.data.length; index += 4) {
    const currentAlpha = currentRaw.data[index + 3];
    const legacyAlpha = legacyRaw.data[index + 3];
    const alpha = Math.max(currentAlpha, legacyAlpha, 255);

    const currentR = currentRaw.data[index];
    const currentG = currentRaw.data[index + 1];
    const currentB = currentRaw.data[index + 2];
    const legacyR = legacyRaw.data[index];
    const legacyG = legacyRaw.data[index + 1];
    const legacyB = legacyRaw.data[index + 2];

    const maxDelta = Math.max(
      Math.abs(currentR - legacyR),
      Math.abs(currentG - legacyG),
      Math.abs(currentB - legacyB),
      Math.abs(currentAlpha - legacyAlpha),
    );

    overlayRaw[index] = Math.round((currentR + legacyR) / 2);
    overlayRaw[index + 1] = Math.round((currentG + legacyG) / 2);
    overlayRaw[index + 2] = Math.round((currentB + legacyB) / 2);
    overlayRaw[index + 3] = alpha;

    if (maxDelta > threshold) {
      diffPixels += 1;
      overlayRaw[index] = Math.min(255, overlayRaw[index] + 70);
      overlayRaw[index + 2] = Math.min(255, overlayRaw[index + 2] + 90);

      diffRaw[index] = 255;
      diffRaw[index + 1] = 0;
      diffRaw[index + 2] = 170;
      diffRaw[index + 3] = 255;
    } else {
      diffRaw[index] = 0;
      diffRaw[index + 1] = 0;
      diffRaw[index + 2] = 0;
      diffRaw[index + 3] = 0;
    }
  }

  const width = currentRaw.info.width;
  const height = currentRaw.info.height;
  return {
    overlayPng: await sharp(overlayRaw, {
      raw: { width, height, channels: 4 },
    })
      .png()
      .toBuffer(),
    diffPng: await sharp(diffRaw, {
      raw: { width, height, channels: 4 },
    })
      .png()
      .toBuffer(),
    diffPixels,
    diffRatio: diffPixels / (width * height),
  };
}

function findPageItem(
  previewPlan: BuildW3PreviewPlanResult,
  pageLabel: string,
): { pageHtml: string; page_css: string; pageNumber: number } {
  const item = previewPlan.pagePreviewItems.find((entry) => entry.pageLabel === pageLabel);
  if (!item) {
    throw new Error(`Preview plan is missing page ${pageLabel}`);
  }

  return item;
}

async function main(): Promise<void> {
  const { fixtureIds, outputDir } = parseArgs();
  const allFixtures = loadReplayFixtures();
  const fixtures = fixtureIds
    ? allFixtures.filter((fixture) => fixtureIds.includes(fixture.fixtureId))
    : allFixtures;

  assert(fixtures.length > 0, 'No W3 replay fixtures matched the requested filters');

  const resolvedOutputDir =
    outputDir ??
    path.join(
      os.tmpdir(),
      'lhb-w3-placement-calibration',
      new Date().toISOString().replace(/[:.]/g, '-'),
    );
  mkdirSync(resolvedOutputDir, { recursive: true });

  const puppeteer = await import('puppeteer');
  const executablePath = resolveChromeExecutablePath();
  const browser = await puppeteer.default.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });

  try {
    const summary: CalibrationSummaryRow[] = [];

    for (const fixture of fixtures) {
      const assemblyInput = await buildAssemblyInputFromFixture(fixture);
      const currentPlan = buildW3PreviewPlan(assemblyInput);
      const legacyPlacement = getLegacyReferenceCharacterPlacement(assemblyInput.bookId);
      const legacyPlan = buildW3PreviewPlan(assemblyInput, {
        characterPlacementOverride: legacyPlacement,
      });
      const config = loadBundledBookConfig({ bookId: assemblyInput.bookId });
      const currentPlacement = resolveBookCharacterPlacementMap(config, assemblyInput.formatId);
      const fixtureDir = path.join(resolvedOutputDir, fixture.fixtureId);
      mkdirSync(fixtureDir, { recursive: true });

      for (const page of assemblyInput.pagePlan as BookPageConfig[]) {
        const storyPageNumber =
          typeof page.storyPageNumber === 'number' ? page.storyPageNumber : null;
        if (
          storyPageNumber === null ||
          (!currentPlacement[storyPageNumber] && !legacyPlacement[storyPageNumber])
        ) {
          continue;
        }

        const currentPage = findPageItem(currentPlan, page.label);
        const legacyPage = findPageItem(legacyPlan, page.label);
        const [currentPng, legacyPng] = await Promise.all([
          renderPagePng(browser, currentPage.pageHtml, currentPage.page_css),
          renderPagePng(browser, legacyPage.pageHtml, legacyPage.page_css),
        ]);
        const diffArtifacts = await buildOverlayAndDiff(currentPng, legacyPng);

        const baseName = `${page.label}-story-${String(storyPageNumber).padStart(2, '0')}`;
        const currentPngPath = path.join(fixtureDir, `${baseName}.current.png`);
        const legacyPngPath = path.join(fixtureDir, `${baseName}.legacy.png`);
        const overlayPngPath = path.join(fixtureDir, `${baseName}.overlay.png`);
        const diffPngPath = path.join(fixtureDir, `${baseName}.diff.png`);

        writeFileSync(currentPngPath, currentPng);
        writeFileSync(legacyPngPath, legacyPng);
        writeFileSync(overlayPngPath, diffArtifacts.overlayPng);
        writeFileSync(diffPngPath, diffArtifacts.diffPng);

        summary.push({
          fixtureId: fixture.fixtureId,
          formatId: assemblyInput.formatId,
          pageLabel: page.label,
          pageNumber: currentPage.pageNumber,
          storyPageNumber,
          currentPng: currentPngPath,
          legacyPng: legacyPngPath,
          overlayPng: overlayPngPath,
          diffPng: diffPngPath,
          diffPixels: diffArtifacts.diffPixels,
          diffRatio: Number(diffArtifacts.diffRatio.toFixed(6)),
          currentPlacement: currentPlacement[storyPageNumber] ?? null,
          legacyPlacement: legacyPlacement[storyPageNumber] ?? null,
        });
      }
    }

    const summaryPath = path.join(resolvedOutputDir, 'summary.json');
    writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(
      JSON.stringify(
        {
          success: true,
          outputDir: resolvedOutputDir,
          summaryPath,
          renderedPages: summary.length,
          fixtures: [...new Set(summary.map((row) => row.fixtureId))],
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('[calibrate-w3-placement] Failed:', error);
  process.exit(1);
});
