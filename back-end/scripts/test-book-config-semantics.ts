import assert from 'node:assert/strict';
import { configuredBookRaw } from './configured-book-fixture';
import { BookConfigSchema, type BookConfig } from '../src/lib/books/types';
import { assertBookConfigSemantics } from '../src/lib/books/book-config-semantics';
import { listBundledBookConfigs } from '../src/lib/books/load-book-config';
import {
  computeBookConfigChecksum, loadRuntimeBookConfig, parsePublishedBookConfigRow, publishBookConfig,
} from '../src/lib/books/runtime-book-config';
import { buildW0RunManifestRuntime } from '../src/lib/books/build-run-manifest';
import { normalizeW0Manifest } from '../src/lib/books/normalize-w0-manifest';

async function main() {
  let checks = 0;
  const raw = JSON.parse(JSON.stringify(configuredBookRaw()).replaceAll('book-contract-fixture', 'book-neutral-contract'));
  raw.intake = { titleTemplate: '[Child Name] Visits the Garden', bookType: 'garden',
    characterProfile: 'storybook-child@v1', customization: { childNameMaxLength: 45 } };
  const row = (value: typeof raw) => ({ book_id: value.bookId, version: value.version,
    config_json: value, checksum: computeBookConfigChecksum(value as BookConfig), is_active: true });
  const published = parsePublishedBookConfigRow(row(raw));
  assert.equal(published.config.bookId, 'book-neutral-contract'); checks++;
  assert.equal(published.checksum, computeBookConfigChecksum(raw as BookConfig), 'Checksum covers persisted raw JSON'); checks++;
  assert.equal(published.config.intake?.customization?.childNameMaxLength, 45); checks++;

  const invalid = (change: (value: typeof raw) => void, pattern: RegExp) => {
    const value = structuredClone(raw); change(value);
    assert.throws(() => parsePublishedBookConfigRow(row(value)), pattern);
    checks++;
  };
  invalid(value => { value.defaultFormatId = 'missing'; }, /schema validation/);
  invalid(value => { value.defaultFormatId = 'toString'; }, /schema validation/);
  invalid(value => { value.formats.standard.formatId = 'different'; }, /schema validation/);
  invalid(value => { value.formats.standard.interior.pageSequence[1].index = 0; }, /schema validation/);
  invalid(value => { value.formats.standard.interior.pageSequence[1].id = 'title'; }, /schema validation/);
  invalid(value => { value.formats.standard.interior.expectedPageCount = 99; }, /schema validation/);
  invalid(value => { value.formats.standard.interior.pageSequence[1].backgroundSlot = 'missing'; }, /schema validation/);
  invalid(value => { value.assets.generated.orderPrefix = 'other-book/orders/{orderId}'; }, /schema validation/);
  invalid(value => { value.assets.generated.orderPrefix = `${value.bookId}/orders/{unknown}`; }, /schema validation/);
  invalid(value => { value.assets.generated.orderPrefix += '/{characterHash}'; }, /schema validation/);
  invalid(value => { value.assets.generated.characterBasePrefix += '/{orderId}'; }, /schema validation/);
  invalid(value => { value.assets.fonts.primary = `${value.bookId}/fonts/{orderId}.ttf`; }, /schema validation/);
  invalid(value => { value.assets.poses.skinToneVariantPaths.deep = `${value.bookId}/poses/{orderId}`; }, /schema validation/);
  invalid(value => { value.assets.fonts.primary = `${value.bookId}/../font.ttf`; }, /schema validation/);
  invalid(value => { value.formats.standard.bleedIn = { w: 1, h: 1 }; }, /schema validation/);
  invalid(value => { value.intake.titleTemplate = '[Unknown Token]'; }, /schema validation/);
  invalid(value => { value.intake.characterProfile = 'unsupported-profile'; }, /schema validation/);

  const rectangle = structuredClone(raw);
  rectangle.formats.standard.trimIn = { w: 7, h: 9 };
  rectangle.formats.standard.bleedIn = { w: 7.25, h: 9.25 };
  rectangle.formats.standard.cover.spreadSizeIn = { w: 14.25, h: 9.25 };
  assertBookConfigSemantics(BookConfigSchema.parse(rectangle)); checks++;
  for (const config of listBundledBookConfigs()) {
    const before = computeBookConfigChecksum(config);
    assertBookConfigSemantics(config);
    assert.equal(computeBookConfigChecksum(config), before, 'Validation must not mutate existing config'); checks++;
  }

  Object.assign(process.env, { SUPABASE_URL: 'https://book-config-contract.example.test',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-book-config-key' });
  const originalFetch = globalThis.fetch;
  let reads = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assert.equal(url.origin, 'https://book-config-contract.example.test');
    assert.equal(url.pathname, '/rest/v1/book_configs');
    assert.equal(input instanceof Request ? input.method : init?.method ?? 'GET', 'GET');
    assert.equal(url.searchParams.get('book_id'), 'eq.book-neutral-contract');
    assert.equal(url.searchParams.get('version'), `eq.${raw.version}`);
    reads++;
    return Response.json([row(raw)]);
  };
  try {
    const selected = await loadRuntimeBookConfig({ bookId: raw.bookId, version: raw.version, source: 'published' });
    assert.equal(selected.intake?.titleTemplate, raw.intake.titleTemplate); checks++;
    const manifest = await buildW0RunManifestRuntime({ bookId: raw.bookId, configVersion: raw.version,
      configSource: 'published', orderId: 'CONFIG-CONTRACT-01', platform: 'amazon', formatId: 'amazon',
      characterHash: 'neutral-child', input: { characterSpecs: { childName: 'Ada', animalGuide: 'owl' } } });
    const normalized = normalizeW0Manifest(manifest);
    assert.equal(normalized.bookId, raw.bookId); checks++;
    assert.equal(normalized.configVersion, raw.version); checks++;
    assert.equal(normalized.renderSnapshot?.bookConfig.intake?.bookType, 'garden'); checks++;
    assert.deepEqual(normalized.pagePlan.map(page => page.id), ['title', 'scene-a', 'scene-b']); checks++;
    assert.ok(reads >= 2, 'Both runtime selection and W0 must traverse the published loader'); checks++;
    const beforeInvalidPublish = reads;
    const invalidPublish = BookConfigSchema.parse({ ...raw, defaultFormatId: 'missing' });
    await assert.rejects(() => publishBookConfig(invalidPublish), /Default book format is missing/); checks++;
    assert.equal(reads, beforeInvalidPublish, 'Invalid publication must reject before any storage request'); checks++;
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log(`Book config semantics: ${checks} checks passed; synthetic published loader to W0, zero live requests`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
