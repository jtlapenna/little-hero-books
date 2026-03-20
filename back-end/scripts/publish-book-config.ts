#!/usr/bin/env tsx

import path from 'node:path';
import * as dotenv from 'dotenv';
import { publishBundledBookConfig } from '../src/lib/books';

const repoRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(repoRoot, '.env.local') });

interface Args {
  bookId: string;
  version?: number;
  activate: boolean;
  publishedBy: string | null;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  let bookId = '';
  let version: number | undefined;
  let activate = false;
  let publishedBy: string | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--book-id') {
      bookId = args[index + 1]?.trim() || '';
      index += 1;
      continue;
    }

    if (arg === '--version') {
      const parsed = Number.parseInt(args[index + 1] || '', 10);
      if (Number.isFinite(parsed)) {
        version = parsed;
      }
      index += 1;
      continue;
    }

    if (arg === '--published-by') {
      publishedBy = args[index + 1]?.trim() || null;
      index += 1;
      continue;
    }

    if (arg === '--activate') {
      activate = true;
      continue;
    }
  }

  if (!bookId) {
    throw new Error(
      'Usage: tsx scripts/publish-book-config.ts --book-id <bookId> [--version <n>] [--activate] [--published-by <name>]',
    );
  }

  return { bookId, version, activate, publishedBy };
}

async function main() {
  const args = parseArgs();
  const published = await publishBundledBookConfig({
    bookId: args.bookId,
    version: args.version,
    activate: args.activate,
    publishedBy: args.publishedBy,
  });

  console.log(
    JSON.stringify(
      {
        success: true,
        bookId: published.config.bookId,
        version: published.config.version,
        checksum: published.checksum,
        isActive: published.row.is_active === true,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('[publish-book-config] Failed:', error);
  process.exitCode = 1;
});
