import { buildW0RunManifestFromConfig } from '@/lib/books/build-run-manifest';
import { getBookFormatConfig, listBundledBookConfigs, loadBundledBookConfig } from '@/lib/books/load-book-config';
import {
  computeBookConfigChecksum,
  loadPublishedBookConfigRecord,
  type PublishedBookConfigRecord,
} from '@/lib/books/runtime-book-config';
import { buildW2ABaseInput } from '@/lib/books/w2a-base-input';
import { buildW3AssemblyInput } from '@/lib/books/w3-assembly-input';
import { resolvePagePlan } from '@/lib/books/resolve-page-plan';
import type { BookConfig, RunManifestV3 } from '@/lib/books/types';
import { supabase } from '@/lib/supabase-client';

type JsonRecord = Record<string, unknown>;

type BookConfigIntegrityCheckName =
  | 'schema'
  | 'checksum'
  | 'bundled-match'
  | 'formats'
  | 'w0-builder'
  | 'w2a-builder'
  | 'w3-builder';

export type BookConfigIntegrityIssue = {
  bookId: string | null;
  version: number | null;
  check: BookConfigIntegrityCheckName;
  message: string;
  storedChecksum?: string | null;
  computedChecksum?: string | null;
  bundledChecksum?: string | null;
  details?: JsonRecord;
};

export type BookConfigIntegrityItem = {
  bookId: string;
  version: number;
  isActive: boolean;
  status: string;
  checksum: string;
  bundledChecksum: string | null;
  checkedFormats: string[];
  checks: BookConfigIntegrityCheckName[];
};

export type BookConfigIntegrityResult = {
  ok: boolean;
  mode: 'bundled' | 'published';
  checkedAt: string;
  checkedCount: number;
  items: BookConfigIntegrityItem[];
  issues: BookConfigIntegrityIssue[];
};

type PublishedBookConfigRow = {
  book_id?: string | null;
  version?: number | string | null;
  is_active?: boolean | null;
  status?: string | null;
  checksum?: string | null;
};

type IntegrityTarget = {
  bookId?: string | null;
  version?: number | null;
};

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

function buildIssue(
  target: IntegrityTarget,
  check: BookConfigIntegrityCheckName,
  message: string,
  extras: Partial<BookConfigIntegrityIssue> = {},
): BookConfigIntegrityIssue {
  return {
    bookId: toTrimmedString(target.bookId) ?? null,
    version: toInteger(target.version) ?? null,
    check,
    message,
    ...extras,
  };
}

function assertCondition(
  condition: unknown,
  target: IntegrityTarget,
  check: BookConfigIntegrityCheckName,
  message: string,
  extras?: Partial<BookConfigIntegrityIssue>,
): asserts condition {
  if (!condition) {
    throw buildIssue(target, check, message, extras);
  }
}

function isIntegrityIssue(error: unknown): error is BookConfigIntegrityIssue {
  return (
    !!error &&
    typeof error === 'object' &&
    'check' in error &&
    'message' in error
  );
}

function normalizeErrorToIssue(
  error: unknown,
  target: IntegrityTarget,
  fallbackCheck: BookConfigIntegrityCheckName,
): BookConfigIntegrityIssue {
  if (isIntegrityIssue(error)) {
    return error;
  }
  return buildIssue(
    target,
    fallbackCheck,
    error instanceof Error ? error.message : String(error),
  );
}

function buildRepresentativeCharacterSpecs(): JsonRecord {
  return {
    childName: 'Integrity',
    hairStyle: 'side part',
    hairColor: 'medium brown',
    skinTone: 'medium',
    pronouns: 'they/them',
    favoriteColor: 'blue',
    favoriteAnimal: 'dog',
  };
}

function buildRepresentativeW0Manifest(
  config: BookConfig,
  formatId: string,
): RunManifestV3 {
  return buildW0RunManifestFromConfig(config, {
    orderId: `INTEGRITY-${config.bookId}-${formatId}`,
    rootOrderId: `INTEGRITY-${config.bookId}-${formatId}`,
    amazonOrderId: formatId === 'amazon' ? '111-2222222-3333333' : null,
    platform: formatId === 'amazon' ? 'amazon' : 'd2c',
    formatId,
    characterHash: 'integrityhash001',
    input: {
      characterSpecs: buildRepresentativeCharacterSpecs(),
      bookSpecs: { formatId },
      orderDetails: { quantity: 1 },
      dedicationText: 'For Integrity',
    },
  });
}

function buildRepresentative2BManifest(
  config: BookConfig,
  formatId: string,
  orderId: string,
) {
  const resolved = resolvePagePlan(config, formatId);
  const requiredPoseNumbers = resolved.qaPolicy.pose.requiredPoseNumbers;

  return {
    schema: 'lhb.run-manifest@v3',
    manifestType: 'w2b',
    stage: '2-background-removal',
    bookId: config.bookId,
    formatId,
    orderId,
    entries: requiredPoseNumbers.map((poseNumber) => ({
      poseNumber,
      approvedKey: `${config.bookId}/integrity/${orderId}/poses/pose-${poseNumber}.png`,
      bgRemovedKey: `${config.bookId}/integrity/${orderId}/poses/pose-${poseNumber}-bg.png`,
      briaStatus: 'completed',
    })),
  };
}

async function validateRepresentativeBuilders(
  config: BookConfig,
  formatId: string,
): Promise<void> {
  const target = { bookId: config.bookId, version: config.version };
  const w0Manifest = buildRepresentativeW0Manifest(config, formatId);
  assertCondition(
    w0Manifest.book.bookConfigRef.bookId === config.bookId &&
      w0Manifest.book.bookConfigRef.version === config.version &&
      w0Manifest.book.bookConfigRef.formatId === formatId,
    target,
    'w0-builder',
    `W0 manifest did not preserve book config reference for ${config.bookId}@v${config.version}/${formatId}`,
  );

  const w2aInput = await buildW2ABaseInput(
    {
      orderId: w0Manifest.order.orderId,
      bookId: config.bookId,
      formatId,
      characterHash: 'integrityhash001',
      characterSpecs: buildRepresentativeCharacterSpecs(),
    },
    {
      loadConfig: async () => config,
      defaultBackendUrl: 'https://admin.littleherolabs.com',
    },
  );
  assertCondition(
    w2aInput.bookId === config.bookId && w2aInput.formatId === formatId,
    target,
    'w2a-builder',
    `W2A base input did not preserve book/format for ${config.bookId}@v${config.version}/${formatId}`,
  );

  const manifest2b = buildRepresentative2BManifest(config, formatId, w0Manifest.order.orderId);
  const manifestByKey = new Map<string, unknown>([
    [w0Manifest.artifacts.manifestKey, w0Manifest],
    [`${w0Manifest.artifacts.orderPrefix}/manifests/2b-manifest.json`, manifest2b],
  ]);
  const w3Input = await buildW3AssemblyInput(
    {
      orderId: w0Manifest.order.orderId,
      bookId: config.bookId,
      formatId,
      oneManifestUrl: w0Manifest.artifacts.manifestKey,
      manifest2bUrl: `${w0Manifest.artifacts.orderPrefix}/manifests/2b-manifest.json`,
      characterHash: 'integrityhash001',
    },
    {
      defaultBackendUrl: 'https://admin.littleherolabs.com',
      loadManifest: async (manifestKey) => manifestByKey.get(manifestKey) ?? null,
    },
  );
  assertCondition(
    w3Input.bookId === config.bookId &&
      w3Input.formatId === formatId &&
      w3Input.pagePlanSource === 'w0-v3',
    target,
    'w3-builder',
    `W3 assembly input did not use the published-config W0 manifest for ${config.bookId}@v${config.version}/${formatId}`,
  );
}

async function validateConfigRecord(
  record: PublishedBookConfigRecord,
): Promise<BookConfigIntegrityItem> {
  const config = record.config;
  const target = { bookId: config.bookId, version: config.version };
  const storedChecksum = toTrimmedString(record.row.checksum);
  const computedChecksum = computeBookConfigChecksum(config);
  assertCondition(
    storedChecksum === computedChecksum,
    target,
    'checksum',
    `Stored checksum does not match config_json for ${config.bookId}@v${config.version}`,
    { storedChecksum, computedChecksum },
  );

  const bundled = loadBundledBookConfig({
    bookId: config.bookId,
    version: config.version,
  });
  const bundledChecksum = computeBookConfigChecksum(bundled);
  assertCondition(
    computedChecksum === bundledChecksum,
    target,
    'bundled-match',
    `Published config does not match bundled config for ${config.bookId}@v${config.version}`,
    { storedChecksum, computedChecksum, bundledChecksum },
  );

  const checkedFormats = Object.keys(config.formats);
  for (const formatId of checkedFormats) {
    getBookFormatConfig(config, formatId);
    resolvePagePlan(config, formatId);
    await validateRepresentativeBuilders(config, formatId);
  }

  return {
    bookId: config.bookId,
    version: config.version,
    isActive: record.row.is_active === true,
    status: String(record.row.status ?? config.status),
    checksum: computedChecksum,
    bundledChecksum,
    checkedFormats,
    checks: ['schema', 'checksum', 'bundled-match', 'formats', 'w0-builder', 'w2a-builder', 'w3-builder'],
  };
}

async function loadPublishedRows(target: IntegrityTarget): Promise<PublishedBookConfigRow[]> {
  let query = supabase
    .from('book_configs')
    .select('book_id,version,is_active,status,checksum')
    .order('book_id', { ascending: true })
    .order('version', { ascending: false });

  if (target.bookId) {
    query = query.eq('book_id', target.bookId);
    if (target.version !== null && target.version !== undefined) {
      query = query.eq('version', target.version);
    }
  } else {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return (data as PublishedBookConfigRow[] | null) ?? [];
}

export async function verifyPublishedBookConfigIntegrity(
  target: IntegrityTarget = {},
): Promise<BookConfigIntegrityResult> {
  const checkedAt = new Date().toISOString();
  const rows = await loadPublishedRows(target);
  const items: BookConfigIntegrityItem[] = [];
  const issues: BookConfigIntegrityIssue[] = [];

  if (rows.length === 0) {
    issues.push(
      buildIssue(
        target,
        'schema',
        target.bookId
          ? `No published book config rows found for ${target.bookId}${target.version ? `@v${target.version}` : ''}`
          : 'No active published book configs found',
      ),
    );
  }

  for (const row of rows) {
    const bookId = toTrimmedString(row.book_id);
    const version = toInteger(row.version);
    const rowTarget = { bookId, version };

    try {
      assertCondition(bookId, rowTarget, 'schema', 'Published row is missing book_id');
      assertCondition(version, rowTarget, 'schema', `Published row ${bookId} is missing version`);

      const record = await loadPublishedBookConfigRecord({ bookId, version });
      items.push(await validateConfigRecord(record));
    } catch (error) {
      issues.push(normalizeErrorToIssue(error, rowTarget, 'schema'));
    }
  }

  return {
    ok: issues.length === 0,
    mode: 'published',
    checkedAt,
    checkedCount: items.length,
    items,
    issues,
  };
}

export async function verifyBundledBookConfigIntegrity(): Promise<BookConfigIntegrityResult> {
  const checkedAt = new Date().toISOString();
  const items: BookConfigIntegrityItem[] = [];
  const issues: BookConfigIntegrityIssue[] = [];

  for (const config of listBundledBookConfigs()) {
    const target = { bookId: config.bookId, version: config.version };
    try {
      const checksum = computeBookConfigChecksum(config);
      const checkedFormats = Object.keys(config.formats);
      for (const formatId of checkedFormats) {
        getBookFormatConfig(config, formatId);
        resolvePagePlan(config, formatId);
        await validateRepresentativeBuilders(config, formatId);
      }
      items.push({
        bookId: config.bookId,
        version: config.version,
        isActive: config.status === 'active',
        status: config.status,
        checksum,
        bundledChecksum: checksum,
        checkedFormats,
        checks: ['schema', 'checksum', 'formats', 'w0-builder', 'w2a-builder', 'w3-builder'],
      });
    } catch (error) {
      issues.push(normalizeErrorToIssue(error, target, 'schema'));
    }
  }

  return {
    ok: issues.length === 0,
    mode: 'bundled',
    checkedAt,
    checkedCount: items.length,
    items,
    issues,
  };
}
