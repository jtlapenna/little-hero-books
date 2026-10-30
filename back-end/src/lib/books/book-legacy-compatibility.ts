import { loadBundledBookConfig } from './load-book-config';
import type { BookConfig } from './types';
import type { NormalizedW0Manifest } from './normalize-w0-manifest';

const HISTORICAL_NON_RECIPE_TUPLES = new Set([
  'book-mvp-simple-adventure@1/standard',
  'book-mvp-simple-adventure@1/amazon',
  'book-2-example@1/standard',
  'book-2-example@1/amazon',
]);

export function stableBookValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableBookValue).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableBookValue(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function isHistoricalNonRecipeConfig(config: BookConfig, formatId: string): boolean {
  if (config.rendering.recipe || !HISTORICAL_NON_RECIPE_TUPLES.has(`${config.bookId}@${config.version}/${formatId}`)) return false;
  const historical = loadBundledBookConfig({ bookId: config.bookId, version: config.version });
  return stableBookValue(config.formats[formatId]?.print) === stableBookValue(historical.formats[formatId]?.print);
}

export function requiresConfiguredW0Snapshot(snapshot: NormalizedW0Manifest): boolean {
  if (snapshot.schema !== 'lhb.run-manifest@v3') return false;
  if (snapshot.renderSnapshot) return true;
  const tuple = `${snapshot.bookId}@${snapshot.configVersion}/${snapshot.formatId}`;
  if (!HISTORICAL_NON_RECIPE_TUPLES.has(tuple)) return true;
  const historical = loadBundledBookConfig({ bookId: snapshot.bookId!, version: snapshot.configVersion });
  return stableBookValue(snapshot.print) !== stableBookValue(historical.formats[snapshot.formatId!]?.print);
}

export function assertBookIntakeLimits(
  config: BookConfig,
  input: { characterSpecs?: Record<string, unknown>; dedicationText?: string | null } | undefined,
): void {
  const specs = input?.characterSpecs ?? {};
  const childName = typeof specs.childName === 'string' ? specs.childName.trim()
    : typeof specs.name === 'string' ? specs.name.trim() : '';
  const declared = config.intake?.customization;
  const historicalNameLimit = config.bookId === 'book-finding-our-inner-voice' && config.version >= 2 ? 30 : undefined;
  const nameLimit = declared?.childNameMaxLength ?? historicalNameLimit;
  if (nameLimit !== undefined && childName.length > nameLimit) {
    if (declared?.childNameMaxLength === undefined && historicalNameLimit !== undefined) {
      throw new Error('Inner Voice child name must be 30 characters or fewer');
    }
    throw new Error(`Child name must be ${nameLimit} characters or fewer`);
  }
  const dedicationLimit = declared?.dedicationMaxLength;
  if (dedicationLimit !== undefined && typeof input?.dedicationText === 'string' && input.dedicationText.length > dedicationLimit) {
    throw new Error(`Dedication must be ${dedicationLimit} characters or fewer`);
  }
}
