#!/usr/bin/env tsx

import path from 'node:path';
import * as dotenv from 'dotenv';
import {
  verifyBundledBookConfigIntegrity,
  verifyPublishedBookConfigIntegrity,
} from '../src/lib/books';

const repoRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(repoRoot, '.env.local') });

type Args = {
  bookId: string | null;
  version: number | null;
  bundledOnly: boolean;
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  let bookId: string | null = null;
  let version: number | null = null;
  let bundledOnly = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--book-id') {
      bookId = args[index + 1]?.trim() || null;
      index += 1;
      continue;
    }
    if (arg === '--version') {
      const parsed = Number.parseInt(args[index + 1] || '', 10);
      version = Number.isFinite(parsed) ? parsed : null;
      index += 1;
      continue;
    }
    if (arg === '--bundled-only') {
      bundledOnly = true;
      continue;
    }
  }

  return { bookId, version, bundledOnly };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const result = args.bundledOnly
    ? await verifyBundledBookConfigIntegrity()
    : await verifyPublishedBookConfigIntegrity({
        bookId: args.bookId,
        version: args.version,
      });

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[verify-book-config-integrity] Failed:', error);
  process.exitCode = 1;
});
