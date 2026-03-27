import bookMvpSimpleAdventureV1Json from './configs/book-mvp-simple-adventure/v1.json';
import book2ExampleV1Json from './configs/book-2-example/v1.json';
import { BookConfig, BookConfigSchema, BookFormatConfig } from '@/lib/books/types';

const BUNDLED_BOOK_CONFIGS = [
  bookMvpSimpleAdventureV1Json,
  book2ExampleV1Json,
] as const;

type BundledConfigMap = Map<string, Map<number, BookConfig>>;

function buildBundledConfigMap(): BundledConfigMap {
  const byBook = new Map<string, Map<number, BookConfig>>();

  for (const rawConfig of BUNDLED_BOOK_CONFIGS) {
    const config = BookConfigSchema.parse(rawConfig);
    const versions = byBook.get(config.bookId) ?? new Map<number, BookConfig>();
    versions.set(config.version, config);
    byBook.set(config.bookId, versions);
  }

  return byBook;
}

const bundledConfigMap = buildBundledConfigMap();

export interface LoadBundledBookConfigOptions {
  bookId: string;
  version?: number;
}

export function listBundledBookConfigs(): BookConfig[] {
  return Array.from(bundledConfigMap.values()).flatMap((versions) =>
    Array.from(versions.values()),
  );
}

export function loadBundledBookConfig({
  bookId,
  version,
}: LoadBundledBookConfigOptions): BookConfig {
  const versions = bundledConfigMap.get(bookId);
  if (!versions || versions.size === 0) {
    throw new Error(`Unknown bundled book config: ${bookId}`);
  }

  if (version !== undefined) {
    const exact = versions.get(version);
    if (!exact) {
      throw new Error(`Missing bundled book config version ${version} for ${bookId}`);
    }
    return exact;
  }

  const latest = Array.from(versions.values()).sort((a, b) => b.version - a.version)[0];
  if (!latest) {
    throw new Error(`No bundled config versions found for ${bookId}`);
  }
  return latest;
}

export function getBookFormatConfig(config: BookConfig, formatId?: string): BookFormatConfig {
  const resolvedFormatId = formatId ?? config.defaultFormatId;
  const format = config.formats[resolvedFormatId];

  if (!format) {
    throw new Error(
      `Unknown format "${resolvedFormatId}" for book ${config.bookId}@v${config.version}`,
    );
  }

  return format;
}
