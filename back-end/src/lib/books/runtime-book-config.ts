import { createHash } from 'node:crypto';
import { loadBundledBookConfig, type LoadBundledBookConfigOptions } from '@/lib/books/load-book-config';
import { BookConfig, BookConfigSchema } from '@/lib/books/types';
import { supabase } from '@/lib/supabase-client';

export type BookConfigRuntimeSource = 'bundled' | 'published' | 'published-first';

type PublishedBookConfigRow = Record<string, unknown>;

export interface LoadRuntimeBookConfigOptions extends LoadBundledBookConfigOptions {
  source?: BookConfigRuntimeSource | null;
}

export interface PublishBookConfigOptions {
  activate?: boolean;
  publishedBy?: string | null;
}

export interface PublishedBookConfigRecord {
  row: PublishedBookConfigRow;
  config: BookConfig;
  checksum: string;
  source: 'published';
}

class PublishedBookConfigError extends Error {
  code: 'not-found' | 'table-missing' | 'unavailable' | 'invalid-row' | 'query-failed';

  constructor(
    code: PublishedBookConfigError['code'],
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'PublishedBookConfigError';
    this.code = code;
  }
}

function normalizeRuntimeSource(value: string | null | undefined): BookConfigRuntimeSource {
  const normalized = String(value ?? '').trim().toLowerCase();

  if (normalized === 'bundled') {
    return 'bundled';
  }

  if (normalized === 'published') {
    return 'published';
  }

  if (normalized === 'published-first') {
    return 'published-first';
  }

  return 'published-first';
}

function getRuntimeSourceOverride(
  source: LoadRuntimeBookConfigOptions['source'],
): BookConfigRuntimeSource {
  return normalizeRuntimeSource(
    source ?? process.env.BOOK_CONFIG_RUNTIME_SOURCE ?? 'published-first',
  );
}

function isTableMissingError(error: unknown, tableName: string): boolean {
  const candidate = error as { code?: string; message?: string } | null;
  if (!candidate) return false;

  const message = String(candidate.message ?? '').toLowerCase();
  return (
    candidate.code === 'PGRST205' ||
    candidate.code === '42P01' ||
    message.includes(`could not find the table '${tableName}'`) ||
    message.includes(`relation "${tableName}" does not exist`)
  );
}

function isSupabaseUnavailableError(error: unknown): boolean {
  const candidate = error as { message?: string } | null;
  const message = String(candidate?.message ?? '');
  return message.includes('Missing Supabase environment variables');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(',')}}`;
}

export function computeBookConfigChecksum(config: BookConfig): string {
  return createHash('sha256').update(stableStringify(config)).digest('hex');
}

function parsePublishedBookConfigRow(row: PublishedBookConfigRow): PublishedBookConfigRecord {
  const rawConfig = row.config_json;
  if (rawConfig === null || rawConfig === undefined) {
    throw new PublishedBookConfigError(
      'invalid-row',
      'Published book config row is missing config_json',
    );
  }

  let parsedRawConfig: unknown = rawConfig;
  if (typeof rawConfig === 'string') {
    try {
      parsedRawConfig = JSON.parse(rawConfig);
    } catch (error) {
      throw new PublishedBookConfigError(
        'invalid-row',
        'Published book config row contains invalid JSON',
        { cause: error },
      );
    }
  }

  let config: BookConfig;
  try {
    config = BookConfigSchema.parse(parsedRawConfig);
  } catch (error) {
    throw new PublishedBookConfigError(
      'invalid-row',
      'Published book config row failed schema validation',
      { cause: error },
    );
  }

  const rowBookId = typeof row.book_id === 'string' ? row.book_id.trim() : '';
  const rowVersion =
    typeof row.version === 'number'
      ? row.version
      : Number.parseInt(String(row.version ?? ''), 10);
  if (rowBookId && rowBookId !== config.bookId) {
    throw new PublishedBookConfigError(
      'invalid-row',
      `Published row book_id ${rowBookId} does not match config bookId ${config.bookId}`,
    );
  }
  if (Number.isFinite(rowVersion) && rowVersion !== config.version) {
    throw new PublishedBookConfigError(
      'invalid-row',
      `Published row version ${rowVersion} does not match config version ${config.version}`,
    );
  }

  const checksum = computeBookConfigChecksum(config);
  const storedChecksum = typeof row.checksum === 'string' ? row.checksum.trim() : '';
  if (storedChecksum && storedChecksum !== checksum) {
    throw new PublishedBookConfigError(
      'invalid-row',
      `Published row checksum mismatch for ${config.bookId}@v${config.version}`,
    );
  }

  return {
    row,
    config,
    checksum,
    source: 'published',
  };
}

async function fetchSinglePublishedBookConfigRow(
  bookId: string,
  version?: number,
): Promise<PublishedBookConfigRow> {
  try {
    if (version !== undefined) {
      const { data, error } = await supabase
        .from('book_configs')
        .select('*')
        .eq('book_id', bookId)
        .eq('version', version)
        .maybeSingle();

      if (isTableMissingError(error, 'book_configs')) {
        throw new PublishedBookConfigError(
          'table-missing',
          'book_configs table is not available',
        );
      }
      if (error) {
        throw new PublishedBookConfigError(
          'query-failed',
          `Failed to read published book config ${bookId}@v${version}: ${error.message}`,
          { cause: error },
        );
      }
      if (!data) {
        throw new PublishedBookConfigError(
          'not-found',
          `No published book config found for ${bookId}@v${version}`,
        );
      }

      return data as PublishedBookConfigRow;
    }

    const activeQuery = await supabase
      .from('book_configs')
      .select('*')
      .eq('book_id', bookId)
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (isTableMissingError(activeQuery.error, 'book_configs')) {
      throw new PublishedBookConfigError(
        'table-missing',
        'book_configs table is not available',
      );
    }

    if (activeQuery.error && activeQuery.error.code !== '42703') {
      throw new PublishedBookConfigError(
        'query-failed',
        `Failed to read active published book config for ${bookId}: ${activeQuery.error.message}`,
        { cause: activeQuery.error },
      );
    }

    if (activeQuery.data) {
      return activeQuery.data as PublishedBookConfigRow;
    }

    const latestQuery = await supabase
      .from('book_configs')
      .select('*')
      .eq('book_id', bookId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (isTableMissingError(latestQuery.error, 'book_configs')) {
      throw new PublishedBookConfigError(
        'table-missing',
        'book_configs table is not available',
      );
    }
    if (latestQuery.error) {
      throw new PublishedBookConfigError(
        'query-failed',
        `Failed to read latest published book config for ${bookId}: ${latestQuery.error.message}`,
        { cause: latestQuery.error },
      );
    }
    if (!latestQuery.data) {
      throw new PublishedBookConfigError(
        'not-found',
        `No published book config found for ${bookId}`,
      );
    }

    return latestQuery.data as PublishedBookConfigRow;
  } catch (error) {
    if (error instanceof PublishedBookConfigError) {
      throw error;
    }

    if (isSupabaseUnavailableError(error)) {
      throw new PublishedBookConfigError(
        'unavailable',
        'Supabase is unavailable for published book config lookup',
        { cause: error },
      );
    }

    throw new PublishedBookConfigError(
      'query-failed',
      `Failed to query published book config for ${bookId}`,
      { cause: error },
    );
  }
}

function canFallbackToBundled(error: unknown): boolean {
  return (
    error instanceof PublishedBookConfigError &&
    (error.code === 'not-found' ||
      error.code === 'table-missing' ||
      error.code === 'unavailable')
  );
}

export async function loadPublishedBookConfigRecord(
  options: LoadBundledBookConfigOptions,
): Promise<PublishedBookConfigRecord> {
  const row = await fetchSinglePublishedBookConfigRow(options.bookId, options.version);
  return parsePublishedBookConfigRow(row);
}

export async function loadPublishedBookConfig(
  options: LoadBundledBookConfigOptions,
): Promise<BookConfig> {
  const record = await loadPublishedBookConfigRecord(options);
  return record.config;
}

export async function loadRuntimeBookConfig(
  options: LoadRuntimeBookConfigOptions,
): Promise<BookConfig> {
  const runtimeSource = getRuntimeSourceOverride(options.source);

  if (runtimeSource !== 'bundled') {
    try {
      return await loadPublishedBookConfig(options);
    } catch (error) {
      if (runtimeSource === 'published' || !canFallbackToBundled(error)) {
        throw error;
      }
    }
  }

  return loadBundledBookConfig(options);
}

export async function publishBookConfig(
  config: BookConfig,
  options: PublishBookConfigOptions = {},
): Promise<PublishedBookConfigRecord> {
  const checksum = computeBookConfigChecksum(config);
  const now = new Date().toISOString();
  const publishedBy = options.publishedBy?.trim() || null;
  const bookConfigsTable = () => supabase.from('book_configs') as any;

  try {
    const existing = await loadPublishedBookConfigRecord({
      bookId: config.bookId,
      version: config.version,
    }).catch((error) => {
      if (
        error instanceof PublishedBookConfigError &&
        error.code === 'not-found'
      ) {
        return null;
      }
      throw error;
    });

    if (existing && existing.checksum !== checksum) {
      throw new Error(
        `Published book config ${config.bookId}@v${config.version} already exists with different content`,
      );
    }

    if (!existing) {
      const payload = {
        book_id: config.bookId,
        version: config.version,
        schema: config.schema,
        status: config.status,
        default_format_id: config.defaultFormatId,
        config_json: config,
        checksum,
        published_at: now,
        published_by: publishedBy,
        is_active: options.activate === true,
        updated_at: now,
      };

      const { error } = await bookConfigsTable().insert(payload);
      if (isTableMissingError(error, 'book_configs')) {
        throw new Error('book_configs table is not available');
      }
      if (error) {
        throw new Error(
          `Failed to publish book config ${config.bookId}@v${config.version}: ${error.message}`,
        );
      }
    }

    if (options.activate) {
      const deactivate = await bookConfigsTable()
        .update({ is_active: false, updated_at: now })
        .eq('book_id', config.bookId)
        .neq('version', config.version);

      if (isTableMissingError(deactivate.error, 'book_configs')) {
        throw new Error('book_configs table is not available');
      }
      if (deactivate.error) {
        throw new Error(
          `Failed to deactivate previous book config versions for ${config.bookId}: ${deactivate.error.message}`,
        );
      }

      const activate = await bookConfigsTable()
        .update({
          is_active: true,
          checksum,
          updated_at: now,
          published_at: now,
          ...(publishedBy ? { published_by: publishedBy } : {}),
        })
        .eq('book_id', config.bookId)
        .eq('version', config.version);

      if (activate.error) {
        throw new Error(
          `Failed to mark ${config.bookId}@v${config.version} active: ${activate.error.message}`,
        );
      }
    }

    return loadPublishedBookConfigRecord({
      bookId: config.bookId,
      version: config.version,
    });
  } catch (error) {
    if (error instanceof PublishedBookConfigError) {
      throw error;
    }

    if (isSupabaseUnavailableError(error)) {
      throw new Error(
        'Supabase is unavailable for book config publish. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.',
      );
    }

    throw error;
  }
}

export async function publishBundledBookConfig(
  options: LoadBundledBookConfigOptions & PublishBookConfigOptions,
): Promise<PublishedBookConfigRecord> {
  const bundledConfig = loadBundledBookConfig(options);
  return publishBookConfig(bundledConfig, options);
}
