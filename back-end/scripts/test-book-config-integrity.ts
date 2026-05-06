#!/usr/bin/env tsx

import {
  buildBookConfigPublishPayload,
  computeBookConfigChecksum,
  listBundledBookConfigs,
  parsePublishedBookConfigRow,
  verifyBundledBookConfigIntegrity,
} from '@/lib/books';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  const [config] = listBundledBookConfigs();
  assert(config, 'Expected at least one bundled book config');

  const payload = buildBookConfigPublishPayload(config, {
    publishedBy: 'test-book-config-integrity',
    activate: true,
    now: '2026-05-05T00:00:00.000Z',
  });

  assert(payload.book_id === config.bookId, 'Publish payload should include book_id');
  assert(payload.version === config.version, 'Publish payload should include version');
  assert(payload.schema === config.schema, 'Publish payload should include schema');
  assert(payload.status === config.status, 'Publish payload should include status');
  assert(
    payload.default_format_id === config.defaultFormatId,
    'Publish payload should include default_format_id',
  );
  assert(payload.config_json === config, 'Publish payload should include config_json');
  assert(
    payload.checksum === computeBookConfigChecksum(config),
    'Publish payload should include canonical checksum',
  );
  assert(payload.is_active === true, 'Publish payload should include activation intent');
  assert(
    payload.published_at === payload.updated_at,
    'Publish payload should keep published_at and updated_at in the same write payload',
  );

  const parsed = parsePublishedBookConfigRow(payload);
  assert(parsed.checksum === payload.checksum, 'Valid publish payload should parse strictly');

  let rejectedChecksumMismatch = false;
  try {
    parsePublishedBookConfigRow({
      ...payload,
      checksum: '0'.repeat(64),
    });
  } catch (error) {
    rejectedChecksumMismatch =
      error instanceof Error &&
      error.message.includes('Published row checksum mismatch');
  }
  assert(
    rejectedChecksumMismatch,
    'Strict published row parsing should reject checksum mismatches',
  );

  const bundledResult = await verifyBundledBookConfigIntegrity();
  assert(bundledResult.ok, 'Bundled book config integrity should pass');
  assert(
    bundledResult.items.length === listBundledBookConfigs().length,
    'Bundled integrity should check every bundled config',
  );

  console.log('test-book-config-integrity: ok');
}

main().catch((error) => {
  console.error('test-book-config-integrity: failed');
  console.error(error);
  process.exit(1);
});
