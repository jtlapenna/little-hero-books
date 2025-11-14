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
  const executionId = `health-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();
  const metrics = {
    stuckQueryMs: 0,
    retryQueryMs: 0,
    orphanedQueryMs: 0,
    webhookCallMs: 0,
    totalMs: 0
  };

  console.log(`[Cron Health Monitor] [${executionId}] Starting execution at ${new Date().toISOString()}`);

  try {
    // 1. Check for stuck orders (processing > 30 minutes)
    const stuckQueryStart = Date.now();
    const stuckThreshold = new Date(Date.now() - 30 * 60 * 1000);
    const { data: stuckOrders, error: stuckError } = await supabase
      .from('orders')
      .select('id,amazon_order_id,current_workflow,started_at,retry_count,error_message')
      .eq('execution_status', 'processing')
      .lt('started_at', stuckThreshold.toISOString());
    metrics.stuckQueryMs = Date.now() - stuckQueryStart;

    if (stuckError) {
      console.error(`[Cron Health Monitor] [${executionId}] Failed to fetch stuck orders:`, {
        error: stuckError.message,
        code: stuckError.code,
        details: stuckError.details,
        duration: `${metrics.stuckQueryMs}ms`
      });
    } else {
      const stuckDetails = (stuckOrders || []).map((o: any) => ({
        orderId: o.amazon_order_id,
        workflow: o.current_workflow,
        startedAt: o.started_at,
        minutesStuck: o.started_at ? Math.floor((Date.now() - new Date(o.started_at).getTime()) / 1000 / 60) : null,
        retryCount: o.retry_count
      }));
      console.log(`[Cron Health Monitor] [${executionId}] Stuck orders query:`, {
        count: stuckOrders?.length || 0,
        details: stuckDetails,
        duration: `${metrics.stuckQueryMs}ms`
      });
    }

    // 2. Check for retry-ready orders (error status, next_retry_at <= now, retry_count < 3)
    const retryQueryStart = Date.now();
    const { data: retryOrders, error: retryError } = await supabase
      .from('orders')
      .select('id,amazon_order_id,next_workflow,retry_count,error_message,error_type,character_specs,character_hash,one_manifest_url')
      .eq('execution_status', 'error')
      .lte('next_retry_at', new Date().toISOString())
      .lt('retry_count', 3)
      .order('next_retry_at', { ascending: true })
      .limit(10);
    metrics.retryQueryMs = Date.now() - retryQueryStart;

    if (retryError) {
      console.error(`[Cron Health Monitor] [${executionId}] Failed to fetch retry orders:`, {
        error: retryError.message,
        code: retryError.code,
        details: retryError.details,
        duration: `${metrics.retryQueryMs}ms`
      });
    } else {
      const retryDetails = (retryOrders || []).map((o: any) => ({
        orderId: o.amazon_order_id,
        workflow: o.next_workflow,
        retryCount: o.retry_count,
        errorType: o.error_type,
        hasManifest: !!o.one_manifest_url,
        hasCharacterHash: !!o.character_hash
      }));
      console.log(`[Cron Health Monitor] [${executionId}] Retry orders query:`, {
        count: retryOrders?.length || 0,
        details: retryDetails,
        duration: `${metrics.retryQueryMs}ms`
      });
    }

    // 3. Check for orphaned orders (using RPC function)
    const orphanedQueryStart = Date.now();
    const { data: orphanedOrders, error: orphanedError } = await supabase.rpc('get_orphaned_orders');
    metrics.orphanedQueryMs = Date.now() - orphanedQueryStart;

    if (orphanedError) {
      console.error(`[Cron Health Monitor] [${executionId}] Failed to fetch orphaned orders:`, {
        error: orphanedError.message,
        code: orphanedError.code,
        details: orphanedError.details,
        duration: `${metrics.orphanedQueryMs}ms`
      });
    } else {
      const orphanedDetails = (orphanedOrders || []).map((o: any) => ({
        orderId: o.amazon_order_id,
        orphanReason: o.orphan_reason,
        executionStatus: o.execution_status,
        workflow: o.next_workflow || o.current_workflow
      }));
      console.log(`[Cron Health Monitor] [${executionId}] Orphaned orders query:`, {
        count: orphanedOrders?.length || 0,
        details: orphanedDetails,
        duration: `${metrics.orphanedQueryMs}ms`
      });
    }

    // 4. Count work items
    const stuckCount = stuckOrders?.length || 0;
    const retryCount = retryOrders?.length || 0;
    const orphanedCount = orphanedOrders?.length || 0;
    const totalWork = stuckCount + retryCount + orphanedCount;

    // 5. If no work, return early (0 n8n executions)
    if (totalWork === 0) {
      metrics.totalMs = Date.now() - startTime;
      console.log(`[Cron Health Monitor] [${executionId}] No work found - skipped n8n call:`, {
        stuck: stuckCount,
        retries: retryCount,
        orphaned: orphanedCount,
        total: totalWork,
        metrics,
        totalDuration: `${metrics.totalMs}ms`
      });
      return NextResponse.json({
        skipped: true,
        reason: 'no_work',
        executionId,
        stuckCount: 0,
        retryCount: 0,
        orphanedCount: 0,
        metrics,
        timestamp: new Date().toISOString()
      });
    }

    // 6. Work exists - call n8n webhook (1 execution)
    const payload = {
      stuck: stuckOrders || [],
      retries: retryOrders || [],
      orphaned: orphanedOrders || []
    };

    console.log(`[Cron Health Monitor] [${executionId}] Found work - calling n8n webhook:`, {
      stuck: stuckCount,
      retries: retryCount,
      orphaned: orphanedCount,
      total: totalWork,
      stuckOrderIds: stuckOrders?.map((o: any) => o.amazon_order_id) || [],
      retryOrderIds: retryOrders?.map((o: any) => o.amazon_order_id) || [],
      orphanedOrderIds: orphanedOrders?.map((o: any) => o.amazon_order_id) || [],
      webhookUrl: n8nWebhookUrl
    });

    const webhookStart = Date.now();
    const webhookResponse = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    metrics.webhookCallMs = Date.now() - webhookStart;

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      metrics.totalMs = Date.now() - startTime;
      console.error(`[Cron Health Monitor] [${executionId}] n8n webhook failed:`, {
        status: webhookResponse.status,
        statusText: webhookResponse.statusText,
        error: errorText.substring(0, 500),
        workFound: {
          stuck: stuckCount,
          retries: retryCount,
          orphaned: orphanedCount,
          total: totalWork
        },
        webhookDuration: `${metrics.webhookCallMs}ms`,
        totalDuration: `${metrics.totalMs}ms`
      });
      return NextResponse.json(
        {
          error: 'n8n webhook call failed',
          executionId,
          status: webhookResponse.status,
          details: errorText.substring(0, 500),
          workFound: {
            stuckCount,
            retryCount,
            orphanedCount,
            total: totalWork
          },
          metrics
        },
        { status: 502 }
      );
    }

    const webhookData = await webhookResponse.json().catch(() => ({}));
    metrics.totalMs = Date.now() - startTime;

    console.log(`[Cron Health Monitor] [${executionId}] Successfully triggered n8n:`, {
      workProcessed: {
        stuck: stuckCount,
        retries: retryCount,
        orphaned: orphanedCount,
        total: totalWork
      },
      stuckOrderIds: stuckOrders?.map((o: any) => o.amazon_order_id) || [],
      retryOrderIds: retryOrders?.map((o: any) => o.amazon_order_id) || [],
      orphanedOrderIds: orphanedOrders?.map((o: any) => o.amazon_order_id) || [],
      webhookStatus: webhookResponse.status,
      webhookDuration: `${metrics.webhookCallMs}ms`,
      totalDuration: `${metrics.totalMs}ms`,
      n8nExecutions: 1
    });

    return NextResponse.json({
      success: true,
      message: 'Health monitor triggered',
      executionId,
      workProcessed: {
        stuckCount,
        retryCount,
        orphanedCount,
        total: totalWork
      },
      stuckOrderIds: stuckOrders?.map((o: any) => o.amazon_order_id) || [],
      retryOrderIds: retryOrders?.map((o: any) => o.amazon_order_id) || [],
      orphanedOrderIds: orphanedOrders?.map((o: any) => o.amazon_order_id) || [],
      metrics,
      n8nExecutions: 1,
      timestamp: new Date().toISOString(),
      webhookResponse: webhookData
    });

  } catch (error: any) {
    metrics.totalMs = Date.now() - startTime;
    console.error(`[Cron Health Monitor] [${executionId}] Unexpected error:`, {
      error: error.message,
      stack: error.stack,
      name: error.name,
      metrics,
      totalDuration: `${metrics.totalMs}ms`
    });
    return NextResponse.json(
      {
        error: 'Internal server error',
        executionId,
        details: error.message,
        metrics,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

