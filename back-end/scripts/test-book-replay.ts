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
import {
  buildOrderIntakeManifestFromOrder,
  buildOrderIntakeManifestFromOrderRuntime,
  type BuildOrderIntakeManifestOptions,
} from '@/lib/w0-manifest-builder';

const backendRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(backendRoot, '.env.local') });

interface ReplayFixture {
  fixtureId: string;
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

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function parseArgs(): {
  fixtureId?: string;
  source: BookConfigRuntimeSource | 'bundled';
  version?: number;
} {
  const args = process.argv.slice(2);
  let fixtureId: string | undefined;
  let source: BookConfigRuntimeSource | 'bundled' = 'published';
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
    if (arg === '--version') {
      const parsed = Number.parseInt(args[index + 1] || '', 10);
      if (Number.isFinite(parsed)) {
        version = parsed;
      }
      index += 1;
    }
  }

  return { fixtureId, source, version };
}

function loadReplayFixtures(): ReplayFixture[] {
  const fixturesDir = path.join(
    backendRoot,
    'src/lib/books/fixtures/order-intake',
  );

  return readdirSync(fixturesDir)
    .filter((entry) => entry.endsWith('.json'))
    .sort()
    .map((entry) => {
      const raw = readFileSync(path.join(fixturesDir, entry), 'utf8');
      return JSON.parse(raw) as ReplayFixture;
    });
}

async function buildManifestForFixture(
  fixture: ReplayFixture,
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
  fixture: ReplayFixture,
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

async function main(): Promise<void> {
  const { fixtureId, source, version } = parseArgs();
  const fixtures = loadReplayFixtures().filter(
    (fixture) => fixtureId === undefined || fixture.fixtureId === fixtureId,
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
      source,
      bookId: manifest.book.bookConfigRef.bookId,
      version: manifest.book.bookConfigRef.version,
      formatId: manifest.book.bookConfigRef.formatId,
      orderId: manifest.order.orderId,
      rootOrderId: manifest.order.rootOrderId,
      manifestKey: manifest.artifacts.manifestKey,
      expectedPageCount: manifest.book.resolved.expectedPageCount,
    });
  }

  console.log(
    JSON.stringify(
      {
        success: true,
        fixtureCount: results.length,
        source,
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
