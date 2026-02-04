import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
// Note: Cron jobs require Node.js runtime, not Edge

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
const cronSecret = process.env.CRON_SECRET;
const n8nWebhookUrl = process.env.N8N_ROUTER_WEBHOOK_URL || 'https://thepeakbeyond.app.n8n.cloud/webhook/w1-1-router';
const maxConcurrent = 5; // Match W1.1 router maxConcurrent

// Amazon orders processing - import the processing function
import { processAmazonOrders } from '../amazon-orders/route';

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

  // CRITICAL: This cron must call the W1.1 router only, not a workflow webhook directly.
  // If N8N_ROUTER_WEBHOOK_URL is set to book-assembly (W3), bg-removal (W2B), etc., orders
  // would bypass the router (no Mark as Processing, no capacity limit, wrong payload shape).
  const urlLower = n8nWebhookUrl.toLowerCase();
  const isDirectWorkflowUrl =
    urlLower.includes('book-assembly') ||
    urlLower.includes('bg-removal') ||
    urlLower.includes('2a-start') ||
    urlLower.includes('order-intake') ||
    urlLower.includes('w4-pdf-print');
  if (isDirectWorkflowUrl) {
    console.error('[Cron Router] N8N_ROUTER_WEBHOOK_URL must be the W1.1 router webhook, not a workflow URL', {
      configured: n8nWebhookUrl.replace(/\/[^/]+$/, '/...'),
      hint: 'Set N8N_ROUTER_WEBHOOK_URL to your n8n W1.1 router webhook (e.g. .../webhook/w1-1-router), not book-assembly or other workflow URLs.',
    });
    return NextResponse.json(
      {
        error: 'Router webhook misconfiguration',
        message: 'N8N_ROUTER_WEBHOOK_URL must point to the W1.1 router webhook (e.g. .../webhook/w1-1-router), not to a workflow (book-assembly, bg-removal, etc.). Orders must go through the router.',
      },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const executionId = `router-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();
  const metrics = {
    capacityCheckMs: 0,
    ordersFetchMs: 0,
    w0CleanupMs: 0,
    webhookCallMs: 0,
    totalMs: 0
  };

  console.log(`[Cron Router] [${executionId}] Starting execution at ${new Date().toISOString()}`);

  try {
    // 0. First, process new Amazon orders (runs before normal routing)
    // This is integrated here to stay within Vercel's 2-cron limit
    const amazonOrdersStart = Date.now();
    try {
      // Directly call the Amazon orders processing function
      const amazonResult = await processAmazonOrders(supabase, {
        testMode: false,
        executionId: `${executionId}-amazon`,
        supabaseUrl,
        supabaseKey,
        n8nW0WebhookUrl: process.env.N8N_W0_WEBHOOK_URL || 'https://thepeakbeyond.app.n8n.cloud/webhook/order-intake',
        amazonClientId: process.env.AMZ_LWA_CLIENT_ID_PROD 
          || process.env.AMZ_APP_CLIENT_ID 
          || process.env.AMAZON_SP_API_CLIENT_ID,
        amazonClientSecret: process.env.AMZ_LWA_CLIENT_SECRET_PROD
          || process.env.AMZ_APP_CLIENT_SECRET 
          || process.env.AMAZON_SP_API_CLIENT_SECRET,
        amazonRefreshToken: process.env.AMZ_APP_PROD_REFRESH_TOKEN
          || process.env.AMZ_REFRESH_TOKEN 
          || process.env.AMAZON_SP_API_REFRESH_TOKEN,
        amazonSellerId: process.env.AMZ_SELLER_ID || process.env.AMAZON_SP_API_SELLER_ID,
        amazonMarketplaceId: process.env.AMZ_MARKETPLACE_ID || process.env.AMAZON_SP_API_MARKETPLACE_ID || 'ATVPDKIKX0DER',
        amazonRegion: process.env.AMZ_REGION || process.env.AMAZON_SP_API_REGION || 'na',
        amazonSandboxMode: process.env.AMAZON_SANDBOX_MODE === 'true',
      });

      const amazonDuration = Date.now() - amazonOrdersStart;
      console.log(`[Cron Router] [${executionId}] Amazon orders check completed (${amazonDuration}ms):`, {
        ordersFound: amazonResult.ordersFound || 0,
        ordersProcessed: amazonResult.ordersProcessed || 0,
        errors: amazonResult.errors?.length || 0,
      });
    } catch (amazonError: any) {
      const amazonDuration = Date.now() - amazonOrdersStart;
      console.error(`[Cron Router] [${executionId}] Amazon orders check failed (${amazonDuration}ms):`, amazonError.message);
      // Continue with normal routing even if Amazon check fails
    }

    // 0b. Process Amazon preview reminders (day-1, day-2, auto-approval message) — no extra cron
    const remindersStart = Date.now();
    let remindersSummary: { processed: number; sent: number; skipped: number; errors: number; debug?: any } | null = null;
    try {
      const { processPreviewReminders } = await import('@/lib/notifications/process-preview-reminders');
      const reminderResult = await processPreviewReminders(supabase);
      const remindersDuration = Date.now() - remindersStart;
      remindersSummary = {
        processed: reminderResult.processed,
        sent: reminderResult.sent,
        skipped: reminderResult.skipped,
        errors: reminderResult.errors.length,
        debug: reminderResult.debug,
      };
      console.log(`[Cron Router] [${executionId}] Preview reminders (${remindersDuration}ms):`, remindersSummary);
      if (reminderResult.errors.length > 0) {
        reminderResult.errors.slice(0, 10).forEach((e) => console.warn(`[Cron Router] [${executionId}] Reminder error:`, e));
      }
    } catch (reminderError: any) {
      const remindersDuration = Date.now() - remindersStart;
      console.error(`[Cron Router] [${executionId}] Preview reminders failed (${remindersDuration}ms):`, reminderError.message);
      remindersSummary = { processed: 0, sent: 0, skipped: 0, errors: 1, debug: { error: reminderError.message } };
    }

    // 1. Check capacity using queue_status view
    const capacityCheckStart = Date.now();
    const { data: capacityData, error: capacityError } = await supabase
      .from('queue_status')
      .select('*')
      .single();
    metrics.capacityCheckMs = Date.now() - capacityCheckStart;

    if (capacityError) {
      console.error(`[Cron Router] [${executionId}] Failed to check capacity:`, {
        error: capacityError.message,
        code: capacityError.code,
        details: capacityError.details,
        hint: capacityError.hint,
        duration: `${metrics.capacityCheckMs}ms`
      });
      return NextResponse.json(
        { 
          error: 'Failed to check capacity', 
          details: capacityError.message,
          executionId,
          metrics
        },
        { status: 500 }
      );
    }

    const processingCount = capacityData?.processing_count || 0;
    const queuedCount = capacityData?.queued_count || 0;
    const availableSlots = Math.max(0, maxConcurrent - processingCount);

    console.log(`[Cron Router] [${executionId}] Capacity check:`, {
      processing: processingCount,
      queued: queuedCount,
      available: availableSlots,
      maxConcurrent,
      duration: `${metrics.capacityCheckMs}ms`
    });

    // 2. If at capacity, return early (0 n8n executions)
    if (availableSlots === 0) {
      metrics.totalMs = Date.now() - startTime;
      console.log(`[Cron Router] [${executionId}] At capacity - skipped n8n call:`, {
        processing: processingCount,
        queued: queuedCount,
        maxConcurrent,
        totalDuration: `${metrics.totalMs}ms`
      });
      return NextResponse.json({
        skipped: true,
        reason: 'at_capacity',
        executionId,
        processingCount,
        maxConcurrent,
        queuedCount,
        metrics,
        timestamp: new Date().toISOString()
      });
    }

    // 3. First, check for orders that completed W0 but weren't updated properly
    // These orders have one_manifest_url and workflow_step='order_intake' but still have execution_status='pending_w0'
    const w0CleanupStart = Date.now();
    const { data: w0CompletedOrders, error: w0CleanupError } = await supabase
      .from('orders')
      .select('id,amazon_order_id,one_manifest_url,manifest_2a_url,manifest_2b_url,manifest_3_url,workflow_step,execution_status,next_workflow,review_stages')
      .eq('execution_status', 'pending_w0')
      .not('one_manifest_url', 'is', null);
    
    if (w0CompletedOrders && w0CompletedOrders.length > 0) {
      console.log(`[Cron Router] [${executionId}] Found ${w0CompletedOrders.length} order(s) that completed W0 but weren't updated`);
      
      // Import determineNextWorkflow to calculate next_workflow
      const { determineNextWorkflow } = await import('@/lib/determine-next-workflow');
      
      // Update each order to ready_for_processing with correct next_workflow
      const w0UpdatePromises = w0CompletedOrders.map(async (order) => {
        // Never overwrite an explicit W4 (admin or customer-approved) with a recalculated value
        if (order.next_workflow === '4') {
          return;
        }
        // Parse review_stages if it's a string
        let reviewStages = order.review_stages;
        if (typeof reviewStages === 'string') {
          try {
            reviewStages = JSON.parse(reviewStages);
          } catch (e) {
            reviewStages = null;
          }
        }
        
        // Determine next workflow based on order progress (W4 only if customer approved or not required)
        const nextWorkflow = determineNextWorkflow({
          one_manifest_url: order.one_manifest_url,
          manifest_2a_url: order.manifest_2a_url,
          manifest_2b_url: order.manifest_2b_url,
          manifest_3_url: order.manifest_3_url,
          workflow_step: order.workflow_step,
          review_stages: reviewStages,
          next_workflow: order.next_workflow,
          customer_approval_required: order.customer_approval_required ?? undefined,
          customer_approval_status: order.customer_approval_status ?? undefined,
        });
        
        if (nextWorkflow) {
          const { error: updateError } = await supabase
            .from('orders')
            .update({
              execution_status: 'ready_for_processing',
              next_workflow: nextWorkflow,
              workflow_step: 'order_intake', // Ensure workflow_step is set
              updated_at: new Date().toISOString(),
            })
            .eq('id', order.id);
          
          if (updateError) {
            console.error(`[Cron Router] [${executionId}] Failed to update W0-completed order ${order.amazon_order_id}:`, updateError.message);
          } else {
            console.log(`[Cron Router] [${executionId}] ✅ Updated W0-completed order ${order.amazon_order_id} to ready_for_processing with next_workflow=${nextWorkflow}`);
          }
        } else {
          console.warn(`[Cron Router] [${executionId}] Could not determine next_workflow for W0-completed order ${order.amazon_order_id}`);
        }
      });
      
      await Promise.all(w0UpdatePromises);
    }
    const w0CleanupMs = Date.now() - w0CleanupStart;
    if (w0CleanupMs > 0) {
      console.log(`[Cron Router] [${executionId}] W0 cleanup took ${w0CleanupMs}ms`);
    }
    metrics.w0CleanupMs = w0CleanupMs;

    // 4. Fetch ready orders (only if capacity available)
    // IMPORTANT:
    // - We must NOT block manual regenerations of W2B/W3 just because Lulu fields are set.
    // - We ONLY want to prevent auto-routing "already printed" orders into W4 unless the admin
    //   explicitly cleared Lulu fields (regenerate-4 does this).
    const ordersFetchStart = Date.now();
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id,amazon_order_id,character_hash,next_workflow,dedication_text,one_manifest_url,character_specs,execution_status,priority,queued_at,updated_at,shipping_address,lulu_status,lulu_job_id,customer_approval_required,customer_approval_status,amazon_shipment_service_level')
      .eq('execution_status', 'ready_for_processing')
      .not('next_workflow', 'is', null)
      .order('priority', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: true, nullsFirst: true }) // Fallback for orders without queued_at
      .order('queued_at', { ascending: true, nullsFirst: true }) // Primary ordering when queued_at exists
      // Fetch extra since we'll apply a small in-memory eligibility filter below
      .limit(Math.max(availableSlots * 3, availableSlots));
    metrics.ordersFetchMs = Date.now() - ordersFetchStart;

    if (ordersError) {
      console.error(`[Cron Router] [${executionId}] Failed to fetch ready orders:`, {
        error: ordersError.message,
        code: ordersError.code,
        details: ordersError.details,
        duration: `${metrics.ordersFetchMs}ms`
      });
      return NextResponse.json(
        { 
          error: 'Failed to fetch orders', 
          details: ordersError.message,
          executionId,
          metrics
        },
        { status: 500 }
      );
    }

    // 5. Apply eligibility filter:
    // - Allow W2B / W3 to be regenerated even if Lulu fields exist (order may have been printed).
    // - For W4, only allow routing if: Lulu fields cleared AND (customer approval not required OR customer approved).
    const eligibleOrders = (orders || []).filter((o) => {
      const next = String(o.next_workflow || '');
      if (next !== '4') return true;
      if (o.lulu_job_id || o.lulu_status) return false;
      const approvalRequired = o.customer_approval_required === true;
      const approved = o.customer_approval_status === 'approved';
      if (approvalRequired && !approved) return false;
      return true;
    });

    // 6. If no eligible orders, return early (0 n8n executions)
    if (!eligibleOrders || eligibleOrders.length === 0) {
      metrics.totalMs = Date.now() - startTime;
      console.log(`[Cron Router] [${executionId}] No eligible ready orders found - skipped n8n call:`, {
        processing: processingCount,
        available: availableSlots,
        queued: queuedCount,
        fetched: orders?.length || 0,
        totalDuration: `${metrics.totalMs}ms`
      });
      return NextResponse.json({
        skipped: true,
        reason: 'no_orders',
        executionId,
        processingCount,
        availableSlots,
        queuedCount,
        fetched: orders?.length || 0,
        reminders: remindersSummary,
        metrics,
        timestamp: new Date().toISOString()
      });
    }

    const ordersToRoute = eligibleOrders.slice(0, availableSlots);

    // Log order details for diagnostics
    const ordersByWorkflow = ordersToRoute.reduce((acc, order) => {
      const workflow = order.next_workflow || 'unknown';
      if (!acc[workflow]) acc[workflow] = [];
      acc[workflow].push(order.amazon_order_id);
      return acc;
    }, {} as Record<string, string[]>);

    console.log(`[Cron Router] [${executionId}] Found ${ordersToRoute.length} eligible ready orders:`, {
      total: ordersToRoute.length,
      fetched: orders?.length || 0,
      byWorkflow: ordersByWorkflow,
      orderIds: ordersToRoute.map(o => o.amazon_order_id),
      oldestQueued: ordersToRoute[0]?.queued_at,
      priorities: ordersToRoute.map(o => ({ id: o.amazon_order_id, priority: o.priority })),
      fetchDuration: `${metrics.ordersFetchMs}ms`
    });

    // 7. Update queued_at and status for all orders being picked up (mark as queued for routing)
    // This ensures queued_at represents when the order was actually queued for routing
    // and status is set to 'queued_for_processing' when actually queued
    const nowIso = new Date().toISOString();
    const orderIds = ordersToRoute.map(o => o.id);
    
    const { error: updateError } = await supabase
      .from('orders')
      .update({ 
        queued_at: nowIso,
        status: 'queued_for_processing'  // Set status when actually queued by router
      })
      .in('id', orderIds);
    
    if (updateError) {
      console.warn(`[Cron Router] [${executionId}] Failed to update queued_at (continuing anyway):`, updateError.message);
      // Continue even if update fails - don't block routing
    } else {
      console.log(`[Cron Router] [${executionId}] Updated queued_at for ${orderIds.length} order(s)`);
    }

    // 8. Orders exist - call n8n webhook (1 execution)
    const webhookStart = Date.now();
    console.log(`[Cron Router] [${executionId}] Calling n8n webhook: ${n8nWebhookUrl}`);
    
    const webhookResponse = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ orders: ordersToRoute }),
    });
    metrics.webhookCallMs = Date.now() - webhookStart;

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      metrics.totalMs = Date.now() - startTime;
      console.error(`[Cron Router] [${executionId}] n8n webhook failed:`, {
        status: webhookResponse.status,
        statusText: webhookResponse.statusText,
        error: errorText.substring(0, 500), // Limit error text length
        ordersAttempted: ordersToRoute.length,
        orderIds: ordersToRoute.map(o => o.amazon_order_id),
        webhookDuration: `${metrics.webhookCallMs}ms`,
        totalDuration: `${metrics.totalMs}ms`
      });
      return NextResponse.json(
        {
          error: 'n8n webhook call failed',
          executionId,
          status: webhookResponse.status,
          details: errorText.substring(0, 500),
          ordersProcessed: ordersToRoute.length,
          orderIds: ordersToRoute.map(o => o.amazon_order_id),
          metrics
        },
        { status: 502 }
      );
    }

    const webhookData = await webhookResponse.json().catch(() => ({}));
    metrics.totalMs = Date.now() - startTime;

    console.log(`[Cron Router] [${executionId}] Successfully triggered n8n:`, {
      ordersProcessed: ordersToRoute.length,
      orderIds: ordersToRoute.map(o => o.amazon_order_id),
      byWorkflow: ordersByWorkflow,
      webhookStatus: webhookResponse.status,
      webhookDuration: `${metrics.webhookCallMs}ms`,
      totalDuration: `${metrics.totalMs}ms`,
      n8nExecutions: 1
    });

    return NextResponse.json({
      success: true,
      message: 'Router triggered',
      executionId,
      ordersProcessed: ordersToRoute.length,
      orderIds: ordersToRoute.map(o => o.amazon_order_id),
      ordersByWorkflow,
      processingCount,
      availableSlots,
      queuedCount,
      metrics,
      n8nExecutions: 1,
      timestamp: new Date().toISOString(),
      webhookResponse: webhookData
    });

  } catch (error: any) {
    metrics.totalMs = Date.now() - startTime;
    console.error(`[Cron Router] [${executionId}] Unexpected error:`, {
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

