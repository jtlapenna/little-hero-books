/**
 * GET /api/admin/webhook-diagnostics
 *
 * Returns recent rows from lulu_webhook_log and notification_logs
 * so we can verify whether Lulu is calling our webhook and whether
 * Amazon shipped notifications are being sent.
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  // lulu_webhook_log — most recent 30 rows
  const { data: webhookRows, error: whErr } = await supabase
    .from('lulu_webhook_log')
    .select('*')
    .order('received_at', { ascending: false })
    .limit(30);

  // notification_logs — most recent 30 rows (amazon_message type)
  const { data: notifRows, error: nErr } = await supabase
    .from('notification_logs')
    .select('*')
    .eq('notification_type', 'amazon_message')
    .order('created_at', { ascending: false })
    .limit(30);

  // Orders with lulu_job_id where shipped_at is null (stuck)
  const { data: stuckOrders, error: soErr } = await supabase
    .from('orders')
    .select('amazon_order_id, lulu_job_id, lulu_status, shipped_at, lifecycle_status, updated_at')
    .not('lulu_job_id', 'is', null)
    .is('shipped_at', null)
    .order('updated_at', { ascending: false });

  return NextResponse.json({
    lulu_webhook_log: {
      rows: webhookRows ?? [],
      error: whErr?.message ?? null,
      note: whErr ? 'Table may not exist — run database/migration-lulu-webhook-log.sql' : undefined,
    },
    notification_logs: {
      rows: notifRows ?? [],
      error: nErr?.message ?? null,
    },
    stuck_orders: {
      description: 'Orders with lulu_job_id but shipped_at=null',
      rows: stuckOrders ?? [],
      error: soErr?.message ?? null,
    },
  });
}
