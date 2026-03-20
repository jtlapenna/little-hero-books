#!/usr/bin/env tsx

import fs from 'node:fs';
import path from 'node:path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const repoRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(repoRoot, '.env.local') });

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
const supabaseAccessToken =
  process.env.SUPABASE_ACCESS_TOKEN ||
  process.env.SUPABASE_MANAGEMENT_TOKEN ||
  process.env.SUPABASE_PAT ||
  null;

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

const sqlFile = path.resolve(
  repoRoot,
  '..',
  'docs',
  'database',
  'migration-add-book-configs.sql',
);
const sql = fs.readFileSync(sqlFile, 'utf8');
const supabase = createClient(resolvedSupabaseUrl, resolvedSupabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function getProjectRef(): string | null {
  return resolvedSupabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? null;
}

function truncate(value: string, max = 500): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

async function verifyTable() {
  const { error } = await supabase
    .from('book_configs')
    .select('book_id, version, is_active')
    .limit(1);

  if (error) {
    throw new Error(`Verification failed for book_configs table: ${error.message}`);
  }
}

async function applyViaExecSql(): Promise<void> {
  const endpoint = `${resolvedSupabaseUrl}/rest/v1/rpc/exec_sql`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: resolvedSupabaseServiceKey,
      Authorization: `Bearer ${resolvedSupabaseServiceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ query: sql, sql }),
  });

  if (!response.ok) {
    const body = truncate(await response.text());
    throw new Error(`exec_sql failed (${response.status}): ${body}`);
  }
}

async function applyViaManagementApi(): Promise<void> {
  const projectRef = getProjectRef();
  if (!projectRef) {
    throw new Error('Could not determine Supabase project ref from SUPABASE_URL');
  }

  if (!supabaseAccessToken) {
    throw new Error(
      'No Supabase Management API token found. Set SUPABASE_ACCESS_TOKEN or SUPABASE_MANAGEMENT_TOKEN.',
    );
  }

  const endpoint = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${supabaseAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!response.ok) {
    const body = truncate(await response.text());
    throw new Error(`Management API query failed (${response.status}): ${body}`);
  }
}

async function main() {
  console.log(`Applying migration from ${sqlFile}`);

  const attempts: Array<{ mode: string; error: string }> = [];

  try {
    await applyViaExecSql();
    await verifyTable();
    console.log('Applied book_configs migration via exec_sql RPC.');
    return;
  } catch (error) {
    attempts.push({
      mode: 'exec_sql',
      error: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    await applyViaManagementApi();
    await verifyTable();
    console.log('Applied book_configs migration via Supabase Management API.');
    return;
  } catch (error) {
    attempts.push({
      mode: 'management_api',
      error: error instanceof Error ? error.message : String(error),
    });
  }

  console.error('Failed to apply book_configs migration automatically.');
  for (const attempt of attempts) {
    console.error(`- ${attempt.mode}: ${attempt.error}`);
  }
  console.error(`Run this SQL manually in Supabase SQL Editor: ${sqlFile}`);
  process.exit(1);
}

main().catch((error) => {
  console.error('[apply-book-configs-migration] Unexpected failure:', error);
  process.exit(1);
});
