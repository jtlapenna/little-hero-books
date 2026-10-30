import bookMvpSimpleAdventureV1Json from './configs/book-mvp-simple-adventure/v1.json';
import innerVoiceV1Json from './configs/book-finding-our-inner-voice/v1.json';
import innerVoiceV2Json from './configs/book-finding-our-inner-voice/v2.json';
import book2ExampleV1Json from './configs/book-2-example/v1.json';
import { BookConfig, BookConfigSchema, BookFormatConfig } from '@/lib/books/types';
import { assertBookConfigSemantics } from './book-config-semantics';
import { validateBookRenderRecipe } from './book-render-recipe';

const BUNDLED_BOOK_CONFIGS = [
  bookMvpSimpleAdventureV1Json,
  book2ExampleV1Json,
  innerVoiceV1Json,
  innerVoiceV2Json,
] as const;

type BundledConfigMap = Map<string, Map<number, BookConfig>>;

function buildBundledConfigMap(): BundledConfigMap {
  const byBook = new Map<string, Map<number, BookConfig>>();

  for (const rawConfig of BUNDLED_BOOK_CONFIGS) {
    const config = BookConfigSchema.parse(rawConfig);
    assertBookConfigSemantics(config);
    for (const formatId of Object.keys(config.formats)) validateBookRenderRecipe(config, formatId);
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

  const baseline = versions.get(1);
  if (!baseline) {
    throw new Error(`No baseline bundled config found for ${bookId}; specify version`);
  }
  return baseline;
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
