#!/usr/bin/env tsx

import path from 'node:path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { loadRuntimeBookConfig } from '../src/lib/books';

const repoRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(repoRoot, '.env.local') });

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

function requireEnv(value: string | undefined, name: string): string {
  if (value) {
    return value;
  }

  throw new Error(`Missing required env var: ${name}`);
}

const resolvedSupabaseUrl = requireEnv(
  supabaseUrl,
  'SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL',
);
const resolvedSupabaseServiceKey = requireEnv(
  supabaseServiceKey,
  'SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY',
);

function parseArgs() {
  const args = process.argv.slice(2);
  let bookId = '';
  let version: number | undefined;

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
  }

  if (!bookId) {
    throw new Error(
      'Usage: tsx scripts/verify-book-config-publish.ts --book-id <bookId> [--version <n>]',
    );
  }

  return { bookId, version };
}

async function main() {
  const { bookId, version } = parseArgs();
  const supabase = createClient(resolvedSupabaseUrl, resolvedSupabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let query = supabase
    .from('book_configs')
    .select('book_id,version,is_active,checksum,published_at,published_by,status')
    .eq('book_id', bookId)
    .order('version', { ascending: false });

  if (version !== undefined) {
    query = query.eq('version', version);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to query book_configs: ${error.message}`);
  }

  const runtimeConfig = await loadRuntimeBookConfig({
    bookId,
    version,
    source: 'published',
  });

  console.log(
    JSON.stringify(
      {
        rows: data ?? [],
        runtime: {
          bookId: runtimeConfig.bookId,
          version: runtimeConfig.version,
          defaultFormatId: runtimeConfig.defaultFormatId,
          status: runtimeConfig.status,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('[verify-book-config-publish] Failed:', error);
  process.exit(1);
});
