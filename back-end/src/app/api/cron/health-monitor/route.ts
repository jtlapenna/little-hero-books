import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
// Note: Cron jobs require Node.js runtime, not Edge

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
const cronSecret = process.env.CRON_SECRET;
const n8nWebhookUrl = process.env.N8N_HEALTH_MONITOR_WEBHOOK_URL;

/**
 * GET /api/cron/health-monitor
 * 
 * Vercel Cron job that checks Supabase for stuck/retry/orphaned orders and only calls n8n if work exists.
 * Runs every 10 minutes to replace n8n polling from W1.2, W1.3, W1.4.
 * 
 * Returns early (0 n8n executions) if:
 * - No stuck orders found
 * - No retry-ready orders found
 * - No orphaned orders found
 * 
 * Calls n8n webhook (1 execution) if:
 * - Any of the above conditions have work
 */
export async function GET(request: NextRequest) {
  // Verify cron secret (security)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    console.error('[Cron Health Monitor] Unauthorized - missing or invalid CRON_SECRET');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!supabaseUrl || !supabaseKey) {
    console.error('[Cron Health Monitor] Supabase credentials not configured');
    return NextResponse.json(
      { error: 'Supabase credentials not configured' },
      { status: 500 }
    );
  }

  if (!n8nWebhookUrl) {
    console.error('[Cron Health Monitor] N8N_HEALTH_MONITOR_WEBHOOK_URL not configured');
    return NextResponse.json(
      { error: 'N8N webhook URL not configured' },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const startTime = Date.now();

  try {
    // 1. Check for stuck orders (processing > 30 minutes)
    const stuckThreshold = new Date(Date.now() - 30 * 60 * 1000);
    const { data: stuckOrders, error: stuckError } = await supabase
      .from('orders')
      .select('id,amazon_order_id,current_workflow,started_at,retry_count,error_message')
      .eq('execution_status', 'processing')
      .lt('started_at', stuckThreshold.toISOString());

    if (stuckError) {
      console.error('[Cron Health Monitor] Failed to fetch stuck orders:', stuckError);
    }

    // 2. Check for retry-ready orders (error status, next_retry_at <= now, retry_count < 3)
    const { data: retryOrders, error: retryError } = await supabase
      .from('orders')
      .select('id,amazon_order_id,next_workflow,retry_count,error_message,error_type,character_specs,character_hash,one_manifest_url')
      .eq('execution_status', 'error')
      .lte('next_retry_at', new Date().toISOString())
      .lt('retry_count', 3)
      .order('next_retry_at', { ascending: true })
      .limit(10);

    if (retryError) {
      console.error('[Cron Health Monitor] Failed to fetch retry orders:', retryError);
    }

    // 3. Check for orphaned orders (using RPC function)
    const { data: orphanedOrders, error: orphanedError } = await supabase.rpc('get_orphaned_orders');

    if (orphanedError) {
      console.error('[Cron Health Monitor] Failed to fetch orphaned orders:', orphanedError);
    }

    // 4. Count work items
    const stuckCount = stuckOrders?.length || 0;
    const retryCount = retryOrders?.length || 0;
    const orphanedCount = orphanedOrders?.length || 0;
    const totalWork = stuckCount + retryCount + orphanedCount;

    // 5. If no work, return early (0 n8n executions)
    if (totalWork === 0) {
      const duration = Date.now() - startTime;
      console.log(`[Cron Health Monitor] No work found - skipped n8n call`);
      return NextResponse.json({
        skipped: true,
        reason: 'no_work',
        stuckCount: 0,
        retryCount: 0,
        orphanedCount: 0,
        duration: `${duration}ms`,
        n8nExecutions: 0,
        timestamp: new Date().toISOString()
      });
    }

    // 6. Work exists - call n8n webhook (1 execution)
    console.log(`[Cron Health Monitor] Found work: ${stuckCount} stuck, ${retryCount} retries, ${orphanedCount} orphaned - calling n8n webhook`);

    const payload = {
      stuck: stuckOrders || [],
      retries: retryOrders || [],
      orphaned: orphanedOrders || []
    };

    const webhookResponse = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      console.error('[Cron Health Monitor] n8n webhook failed:', {
        status: webhookResponse.status,
        error: errorText
      });
      return NextResponse.json(
        {
          error: 'n8n webhook call failed',
          status: webhookResponse.status,
          details: errorText,
          workFound: {
            stuckCount,
            retryCount,
            orphanedCount
          }
        },
        { status: 502 }
      );
    }

    const duration = Date.now() - startTime;
    const webhookData = await webhookResponse.json().catch(() => ({}));

    console.log(`[Cron Health Monitor] Successfully triggered n8n for ${totalWork} work items`);

    return NextResponse.json({
      success: true,
      message: 'Health monitor triggered',
      workProcessed: {
        stuckCount,
        retryCount,
        orphanedCount,
        total: totalWork
      },
      stuckOrderIds: stuckOrders?.map(o => o.amazon_order_id) || [],
      retryOrderIds: retryOrders?.map(o => o.amazon_order_id) || [],
      orphanedOrderIds: orphanedOrders?.map((o: any) => o.amazon_order_id) || [],
      duration: `${duration}ms`,
      n8nExecutions: 1,
      timestamp: new Date().toISOString(),
      webhookResponse: webhookData
    });

  } catch (error: any) {
    console.error('[Cron Health Monitor] Unexpected error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error.message,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

