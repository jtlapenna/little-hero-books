import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
// Note: Cron jobs require Node.js runtime, not Edge

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
const cronSecret = process.env.CRON_SECRET;
const n8nWebhookUrl = process.env.N8N_ROUTER_WEBHOOK_URL || 'https://thepeakbeyond.app.n8n.cloud/webhook/w1-1-router';
const maxConcurrent = 5; // Match W1.1 router maxConcurrent

/**
 * GET /api/cron/router
 * 
 * Vercel Cron job that checks Supabase for ready orders and only calls n8n if work exists.
 * Runs every 60 seconds to replace n8n polling.
 * 
 * Returns early (0 n8n executions) if:
 * - No capacity available (processing_count >= 5)
 * - No ready orders found
 * 
 * Calls n8n webhook (1 execution) if:
 * - Capacity available AND ready orders exist
 */
export async function GET(request: NextRequest) {
  // Verify cron secret (security)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    console.error('[Cron Router] Unauthorized - missing or invalid CRON_SECRET');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!supabaseUrl || !supabaseKey) {
    console.error('[Cron Router] Supabase credentials not configured');
    return NextResponse.json(
      { error: 'Supabase credentials not configured' },
      { status: 500 }
    );
  }

  if (!n8nWebhookUrl) {
    console.error('[Cron Router] N8N_ROUTER_WEBHOOK_URL not configured');
    return NextResponse.json(
      { error: 'N8N webhook URL not configured' },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const startTime = Date.now();

  try {
    // 1. Check capacity using queue_status view
    const { data: capacityData, error: capacityError } = await supabase
      .from('queue_status')
      .select('*')
      .single();

    if (capacityError) {
      console.error('[Cron Router] Failed to check capacity:', capacityError);
      return NextResponse.json(
        { error: 'Failed to check capacity', details: capacityError.message },
        { status: 500 }
      );
    }

    const processingCount = capacityData?.processing_count || 0;
    const queuedCount = capacityData?.queued_count || 0;
    const availableSlots = Math.max(0, maxConcurrent - processingCount);

    // 2. If at capacity, return early (0 n8n executions)
    if (availableSlots === 0) {
      const duration = Date.now() - startTime;
      console.log(`[Cron Router] At capacity (${processingCount}/${maxConcurrent}) - skipped n8n call`);
      return NextResponse.json({
        skipped: true,
        reason: 'at_capacity',
        processingCount,
        maxConcurrent,
        queuedCount,
        duration: `${duration}ms`,
        n8nExecutions: 0,
        timestamp: new Date().toISOString()
      });
    }

    // 3. Fetch ready orders (only if capacity available)
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id,amazon_order_id,character_hash,next_workflow,dedication_text,one_manifest_url,character_specs,execution_status,priority,queued_at')
      .eq('execution_status', 'ready_for_processing')
      .not('next_workflow', 'is', null)
      .order('priority', { ascending: false, nullsFirst: false })
      .order('queued_at', { ascending: true })
      .limit(availableSlots);

    if (ordersError) {
      console.error('[Cron Router] Failed to fetch ready orders:', ordersError);
      return NextResponse.json(
        { error: 'Failed to fetch orders', details: ordersError.message },
        { status: 500 }
      );
    }

    // 4. If no orders, return early (0 n8n executions)
    if (!orders || orders.length === 0) {
      const duration = Date.now() - startTime;
      console.log(`[Cron Router] No ready orders found - skipped n8n call`);
      return NextResponse.json({
        skipped: true,
        reason: 'no_orders',
        processingCount,
        availableSlots,
        queuedCount,
        duration: `${duration}ms`,
        n8nExecutions: 0,
        timestamp: new Date().toISOString()
      });
    }

    // 5. Orders exist - call n8n webhook (1 execution)
    console.log(`[Cron Router] Found ${orders.length} ready orders - calling n8n webhook`);
    
    const webhookResponse = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ orders }),
    });

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      console.error('[Cron Router] n8n webhook failed:', {
        status: webhookResponse.status,
        error: errorText
      });
      return NextResponse.json(
        {
          error: 'n8n webhook call failed',
          status: webhookResponse.status,
          details: errorText,
          ordersProcessed: orders.length
        },
        { status: 502 }
      );
    }

    const duration = Date.now() - startTime;
    const webhookData = await webhookResponse.json().catch(() => ({}));

    console.log(`[Cron Router] Successfully triggered n8n for ${orders.length} orders`);

    return NextResponse.json({
      success: true,
      message: 'Router triggered',
      ordersProcessed: orders.length,
      orderIds: orders.map(o => o.amazon_order_id),
      processingCount,
      availableSlots,
      queuedCount,
      duration: `${duration}ms`,
      n8nExecutions: 1,
      timestamp: new Date().toISOString(),
      webhookResponse: webhookData
    });

  } catch (error: any) {
    console.error('[Cron Router] Unexpected error:', error);
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

