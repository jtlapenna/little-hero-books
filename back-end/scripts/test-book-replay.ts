#!/usr/bin/env tsx

import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import * as dotenv from 'dotenv';
import {
  loadBundledBookConfig,
  loadRuntimeBookConfig,
  resolvePagePlan,
  type BookConfigRuntimeSource,
  type RunManifestV3,
} from '@/lib/books';
import { buildW3AssemblyInput } from '@/lib/books/w3-assembly-input';
import { mapSupabaseOrderToOrder } from '@/lib/order-mapper';
import {
  buildManifestKeyCandidates,
  resolveOrderPathContext,
} from '@/lib/order-paths';
import {
  buildOrderIntakeManifestFromOrder,
  buildOrderIntakeManifestFromOrderRuntime,
  type BuildOrderIntakeManifestOptions,
} from '@/lib/w0-manifest-builder';

const backendRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(backendRoot, '.env.local') });

interface W0ReplayFixture {
  fixtureId: string;
  sources?: Array<BookConfigRuntimeSource | 'bundled'>;
  orderId: string;
  order: Record<string, unknown>;
  options?: BuildOrderIntakeManifestOptions;
  expected: {
    bookId: string;
    formatId: string;
    expectedPageCount: number;
    rootOrderId: string;
    amazonOrderId: string | null;
  };
}

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
  expected: {
    orderId: string;
    rootOrderId: string;
    amazonOrderId: string | null;
    bookId: string;
    formatId: string | null;
    orderPrefix: string;
    manifest3Key: string;
    manifest3Url: string;
    pageLabels: string[];
    pagesGenerated: number;
    previewImageKeys: string[];
    requiredPoseNumbers?: number[];
  };
  readback?: {
    orderRecord: Record<string, unknown>;
    expected: {
      orderPrefix: string;
      assetPrefix: string;
      manifest3Url: string;
      manifest3Key: string;
    };
  };
}

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function parseArgs(): {
  fixtureId?: string;
  source: BookConfigRuntimeSource | 'bundled';
  stage: 'w0' | 'w3';
  version?: number;
} {
  const args = process.argv.slice(2);
  let fixtureId: string | undefined;
  let source: BookConfigRuntimeSource | 'bundled' = 'published';
  let stage: 'w0' | 'w3' = 'w0';
  let version: number | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--fixture') {
      fixtureId = args[index + 1]?.trim() || undefined;
      index += 1;
      continue;
    }
    if (arg === '--source') {
      const candidate = args[index + 1]?.trim();
      if (
        candidate === 'bundled' ||
        candidate === 'published' ||
        candidate === 'published-first'
      ) {
        source = candidate;
      } else if (candidate) {
        throw new Error(`Unsupported --source value: ${candidate}`);
      }
      index += 1;
      continue;
    }
    if (arg === '--stage') {
      const candidate = args[index + 1]?.trim();
      if (candidate === 'w0' || candidate === 'w3') {
        stage = candidate;
      } else if (candidate) {
        throw new Error(`Unsupported --stage value: ${candidate}`);
      }
      index += 1;
      continue;
    }
    if (arg === '--version') {
      const parsed = Number.parseInt(args[index + 1] || '', 10);
      if (Number.isFinite(parsed)) {
        version = parsed;
      }
      index += 1;
    }
  }

  return { fixtureId, source, stage, version };
}

function loadJsonFixtures<T>(fixturesDir: string): T[] {
  return readdirSync(fixturesDir)
    .filter((entry) => entry.endsWith('.json'))
    .sort()
    .map((entry) => {
      const raw = readFileSync(path.join(fixturesDir, entry), 'utf8');
      return JSON.parse(raw) as T;
    });
}

function loadW0ReplayFixtures(): W0ReplayFixture[] {
  return loadJsonFixtures<W0ReplayFixture>(
    path.join(backendRoot, 'src/lib/books/fixtures/order-intake'),
  );
}

function loadW3ReplayFixtures(): W3ReplayFixture[] {
  return loadJsonFixtures<W3ReplayFixture>(
    path.join(backendRoot, 'src/lib/books/fixtures/w3-replay'),
  );
}

async function buildManifestForFixture(
  fixture: W0ReplayFixture,
  source: BookConfigRuntimeSource | 'bundled',
  version?: number,
) {
  const options: BuildOrderIntakeManifestOptions = {
    ...(fixture.options ?? {}),
    configVersion: version ?? fixture.options?.configVersion,
  };

  if (source === 'bundled') {
    return buildOrderIntakeManifestFromOrder(fixture.order, fixture.orderId, options);
  }

  return buildOrderIntakeManifestFromOrderRuntime(fixture.order, fixture.orderId, {
    ...options,
    configSource: source,
  });
}

async function loadConfigForFixture(
  fixture: W0ReplayFixture,
  source: BookConfigRuntimeSource | 'bundled',
  version?: number,
) {
  if (source === 'bundled') {
    return loadBundledBookConfig({
      bookId: fixture.expected.bookId,
      version: version ?? fixture.options?.configVersion,
    });
  }

  return loadRuntimeBookConfig({
    bookId: fixture.expected.bookId,
    version: version ?? fixture.options?.configVersion,
    source,
  });
}

function canonicalizePageLabel(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed === 'p00_dedication') {
    return 'p00';
  }

  return /^p\d{2,}$/.test(trimmed) ? trimmed : null;
}

function sortPageLabels(values: string[]): string[] {
  return [...values].sort((left, right) => {
    const leftNumber = Number.parseInt(left.slice(1), 10);
    const rightNumber = Number.parseInt(right.slice(1), 10);
    return leftNumber - rightNumber;
  });
}

function extractPreviewImageKeys(
  manifest: Record<string, unknown>,
): { pageLabels: string[]; previewImageKeys: string[] } {
  const pagesRecord =
    (manifest.pngGeneration as Record<string, unknown> | undefined)?.pages ??
    manifest.pages ??
    {};
  const pages =
    typeof pagesRecord === 'object' && pagesRecord !== null && !Array.isArray(pagesRecord)
      ? (pagesRecord as Record<string, unknown>)
      : {};

  const pageLabels = sortPageLabels(
    [...new Set(Object.keys(pages).map((key) => canonicalizePageLabel(key)).filter(Boolean) as string[])],
  );
  const previewImageKeys = pageLabels.map((pageLabel) => {
    const raw =
      pages[pageLabel] ??
      (pageLabel === 'p00' ? pages.p00_dedication : undefined);

    if (typeof raw === 'string') {
      return raw;
    }
    if (raw && typeof raw === 'object') {
      const record = raw as Record<string, unknown>;
      const fromRecord =
        record.r2Key ?? record.key ?? record.path ?? null;
      if (typeof fromRecord === 'string' && fromRecord.trim()) {
        return fromRecord.trim();
      }
    }

    throw new Error(`Replay fixture is missing a preview image key for ${pageLabel}`);
  });

  return { pageLabels, previewImageKeys };
}

async function runW0Replay(
  fixtureId: string | undefined,
  source: BookConfigRuntimeSource | 'bundled',
  version?: number,
) {
  const fixtures = loadW0ReplayFixtures().filter(
    (fixture) => {
      const fixtureMatches = fixtureId === undefined || fixture.fixtureId === fixtureId;
      if (!fixtureMatches) {
        return false;
      }

      // Keep the default published replay set stable, but let explicit fixture
      // selection opt into source-specific checks such as local Book 2 publish proof.
      if (fixtureId !== undefined) {
        return true;
      }

      return !fixture.sources || fixture.sources.includes(source);
    },
  );

  assert(fixtures.length > 0, 'No replay fixtures matched the requested filters');

  const results = [];

  for (const fixture of fixtures) {
    const config = await loadConfigForFixture(fixture, source, version);
    const built = await buildManifestForFixture(fixture, source, version);

    assert(
      built.schemaVersion === 'v3',
      `Replay harness currently expects v3 fixtures (${fixture.fixtureId})`,
    );

    const manifest = built.manifest as RunManifestV3;
    const resolvedPlan = resolvePagePlan(config, fixture.expected.formatId);
    const manifestKey = `${fixture.expected.bookId}/orders/${fixture.orderId}/manifests/1-manifest.json`;

    assert(built.bookId === fixture.expected.bookId, `${fixture.fixtureId} should preserve bookId`);
    assert(
      built.formatId === fixture.expected.formatId,
      `${fixture.fixtureId} should preserve formatId`,
    );
    assert(
      manifest.artifacts.manifestKey === manifestKey,
      `${fixture.fixtureId} should use the canonical manifest key`,
    );
    assert(
      manifest.book.bookConfigRef.bookId === fixture.expected.bookId,
      `${fixture.fixtureId} should pin bookConfigRef.bookId`,
    );
    assert(
      manifest.book.bookConfigRef.version === config.version,
      `${fixture.fixtureId} should pin bookConfigRef.version from the loaded config`,
    );
    assert(
      manifest.book.bookConfigRef.formatId === fixture.expected.formatId,
      `${fixture.fixtureId} should pin bookConfigRef.formatId`,
    );
    assert(
      manifest.book.resolved.expectedPageCount === fixture.expected.expectedPageCount,
      `${fixture.fixtureId} should preserve expectedPageCount`,
    );
    assert(
      manifest.book.resolved.expectedPageCount === resolvedPlan.expectedPageCount,
      `${fixture.fixtureId} should match resolved page-plan count`,
    );
    assert(
      JSON.stringify(manifest.book.resolved.pageLabels) ===
        JSON.stringify(resolvedPlan.pageLabels),
      `${fixture.fixtureId} should match resolved page labels`,
    );
    assert(
      manifest.order.rootOrderId === fixture.expected.rootOrderId,
      `${fixture.fixtureId} should preserve rootOrderId`,
    );
    assert(
      manifest.order.amazonOrderId === fixture.expected.amazonOrderId,
      `${fixture.fixtureId} should preserve amazonOrderId`,
    );

    if (source !== 'bundled') {
      const bundled = buildOrderIntakeManifestFromOrder(fixture.order, fixture.orderId, {
        ...(fixture.options ?? {}),
        configVersion: version ?? fixture.options?.configVersion,
      });
      const bundledManifest = bundled.manifest as RunManifestV3;

      assert(
        JSON.stringify(manifest.book.resolved) ===
          JSON.stringify(bundledManifest.book.resolved),
        `${fixture.fixtureId} published replay should match bundled resolved page plan`,
      );
      assert(
        JSON.stringify(manifest.summary.pageLabels) ===
          JSON.stringify(bundledManifest.summary.pageLabels),
        `${fixture.fixtureId} published replay should match bundled summary page labels`,
      );
    }

    results.push({
      fixtureId: fixture.fixtureId,
      stage: 'w0',
      source,
      bundledParityVerified: source !== 'bundled',
      bookId: manifest.book.bookConfigRef.bookId,
      version: manifest.book.bookConfigRef.version,
      formatId: manifest.book.bookConfigRef.formatId,
      orderId: manifest.order.orderId,
      rootOrderId: manifest.order.rootOrderId,
      manifestKey: manifest.artifacts.manifestKey,
      expectedPageCount: manifest.book.resolved.expectedPageCount,
    });
  }

  return results;
}

async function runW3Replay(fixtureId: string | undefined) {
  const fixtures = loadW3ReplayFixtures().filter(
    (fixture) => fixtureId === undefined || fixture.fixtureId === fixtureId,
  );

  assert(fixtures.length > 0, 'No W3 replay fixtures matched the requested filters');

  const results = [];

  for (const fixture of fixtures) {
    const built = await buildW3AssemblyInput(fixture.input, {
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

    const replayPreviewState = extractPreviewImageKeys(fixture.manifests.three);

    assert(
      built.orderId === fixture.expected.orderId,
      `${fixture.fixtureId} should preserve orderId`,
    );
    assert(
      built.rootOrderId === fixture.expected.rootOrderId,
      `${fixture.fixtureId} should preserve rootOrderId`,
    );
    assert(
      built.amazonOrderId === fixture.expected.amazonOrderId,
      `${fixture.fixtureId} should preserve amazonOrderId`,
    );
    assert(
      built.bookId === fixture.expected.bookId &&
        built.formatId === fixture.expected.formatId,
      `${fixture.fixtureId} should preserve book and format identity`,
    );
    assert(
      built.orderPrefix === fixture.expected.orderPrefix,
      `${fixture.fixtureId} should resolve the canonical orderPrefix`,
    );
    assert(
      built.manifest3Key === fixture.expected.manifest3Key &&
        built.manifest3Url === fixture.expected.manifest3Url,
      `${fixture.fixtureId} should derive the canonical 3-manifest key and URL`,
    );
    assert(
      JSON.stringify(built.pageLabels) === JSON.stringify(fixture.expected.pageLabels),
      `${fixture.fixtureId} should preserve the frozen W3 page labels`,
    );
    assert(
      built.expectedPageCount === fixture.expected.pagesGenerated,
      `${fixture.fixtureId} should preserve pagesGenerated as the expected W3 page count`,
    );
    assert(
      JSON.stringify(replayPreviewState.pageLabels) ===
        JSON.stringify(fixture.expected.pageLabels),
      `${fixture.fixtureId} should preserve the frozen W3 page labels in 3-manifest output`,
    );
    assert(
      JSON.stringify(replayPreviewState.previewImageKeys) ===
        JSON.stringify(fixture.expected.previewImageKeys),
      `${fixture.fixtureId} should preserve canonical W3 preview image keys`,
    );
    if (fixture.expected.requiredPoseNumbers) {
      assert(
        JSON.stringify(built.requiredPoseNumbers) ===
          JSON.stringify(fixture.expected.requiredPoseNumbers),
        `${fixture.fixtureId} should preserve the expected W3 required pose numbers`,
      );
    }

    if (fixture.readback) {
      const mapped = await mapSupabaseOrderToOrder(fixture.readback.orderRecord, {
        includeStatus: false,
      });
      assert(
        mapped.manifest3Url === fixture.readback.expected.manifest3Url,
        `${fixture.fixtureId} readback should preserve manifest3Url`,
      );

      const manifestUrlHint =
        (fixture.readback.orderRecord.asset_prefix as string | undefined) ??
        (fixture.readback.orderRecord.manifest_3_url as string | undefined) ??
        '';
      assert(
        resolveOrderPathContext(fixture.expected.orderId, {
          orderPrefix: manifestUrlHint,
        }).orderPrefix === fixture.readback.expected.orderPrefix,
        `${fixture.fixtureId} should normalize manifest URL orderPrefix hints`,
      );
      assert(
        buildManifestKeyCandidates(fixture.expected.orderId, '3', {
          orderPrefix: manifestUrlHint,
          pathLikes: [
            fixture.readback.orderRecord.asset_prefix as string | undefined,
            fixture.readback.orderRecord.manifest_3_url as string | undefined,
          ],
        }).includes(fixture.readback.expected.manifest3Key),
        `${fixture.fixtureId} should keep canonical 3-manifest key candidates when path hints are URLs`,
      );
    }

    results.push({
      fixtureId: fixture.fixtureId,
      stage: 'w3',
      orderId: built.orderId,
      rootOrderId: built.rootOrderId,
      amazonOrderId: built.amazonOrderId,
      orderPrefix: built.orderPrefix,
      manifest3Key: built.manifest3Key,
      pagesGenerated: built.expectedPageCount,
    });
  }

  return results;
}

async function main(): Promise<void> {
  const { fixtureId, source, stage, version } = parseArgs();
  const results =
    stage === 'w0'
      ? await runW0Replay(fixtureId, source, version)
      : await runW3Replay(fixtureId);

  console.log(
    JSON.stringify(
      {
        success: true,
        stage,
        fixtureCount: results.length,
        source: stage === 'w0' ? source : null,
        versionOverride: version ?? null,
        results,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('[test-book-replay] Failed:', error);
  process.exit(1);
});
