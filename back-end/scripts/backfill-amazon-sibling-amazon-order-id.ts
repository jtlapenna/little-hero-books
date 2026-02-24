#!/usr/bin/env tsx
/**
 * Purpose: normalize legacy Amazon sibling rows where amazon_order_id was incorrectly set
 * to the synthetic per-book orderId (e.g. <root>-item-<suffix>).
 *
 * Backfill rule (rerunnable):
 * - If orderId contains "-item-" AND amazon_order_id === orderId AND platform != "d2c"
 *   then set amazon_order_id = <root> (strip "-item-..." suffix).
 *
 * Usage:
 *   tsx back-end/scripts/backfill-amazon-sibling-amazon-order-id.ts --dry-run
 *   tsx back-end/scripts/backfill-amazon-sibling-amazon-order-id.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function parseArgs(argv: string[]) {
  // Purpose: minimal CLI parsing.
  return { dryRun: argv.includes('--dry-run') };
}

function deriveRoot(orderId: string): string | null {
  const idx = orderId.indexOf('-item-');
  if (idx <= 0) return null;
  return orderId.slice(0, idx).trim() || null;
}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));
  console.log(`\n🔧 Backfill amazon_order_id for legacy sibling rows${dryRun ? ' (dry-run)' : ''}\n`);

  // PSEUDOCODE
  // - fetch candidate rows (orderId like %-item-%)
  // - filter to legacy-bad rows (amazon_order_id === orderId, platform != d2c)
  // - update each row by integer id to amazon_order_id = root
  // - print summary

  const { data, error } = await supabase
    .from('orders')
    .select('id, orderId, amazon_order_id, platform')
    .like('orderId', '%-item-%')
    .limit(10000);

  if (error) {
    console.error('❌ Failed to fetch candidate rows:', error);
    process.exit(1);
  }

  const candidates = ((data ?? []) as Array<Record<string, unknown>>).filter((r) => {
    const orderId = String(r.orderId ?? '').trim();
    const amazonOrderId = String(r.amazon_order_id ?? '').trim();
    const platform = String(r.platform ?? '').trim();
    return !!orderId && !!amazonOrderId && platform !== 'd2c' && orderId === amazonOrderId;
  });

  console.log(`Found ${candidates.length} row(s) to normalize.\n`);
  if (candidates.length === 0) return;

  let updated = 0;
  let skipped = 0;
  for (const row of candidates) {
    const id = row.id as number | undefined;
    const orderId = String(row.orderId ?? '').trim();
    const root = deriveRoot(orderId);
    if (!id || !root) {
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`[dry-run] id=${id} orderId=${orderId} amazon_order_id: ${orderId} -> ${root}`);
      continue;
    }

    const { error: updateError } = await supabase
      .from('orders')
      .update({ amazon_order_id: root, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (updateError) {
      console.error(`❌ Update failed for id=${id} orderId=${orderId}:`, updateError);
      continue;
    }

    updated++;
    console.log(`✅ Updated id=${id}: amazon_order_id -> ${root}`);
  }

  console.log(`\nDone. updated=${updated}, skipped=${skipped}${dryRun ? ' (dry-run)' : ''}\n`);
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});

