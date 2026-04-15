/**
 * POST /api/admin/lulu-webhook-reset
 *
 * Deletes all existing webhook subscriptions and re-registers a fresh one.
 * Use this if webhooks aren't being delivered despite being "subscribed".
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveCanonicalBackendBaseUrl } from '@/lib/backend-url';

export const dynamic = 'force-dynamic';

const LULU_WEBHOOK_TOPIC = 'PRINT_JOB_STATUS_CHANGED';

export async function POST(request: NextRequest) {
  const luluClientId = process.env.LULU_CLIENT_ID || process.env.LULU_CLIENT_KEY;
  const luluClientSecret = process.env.LULU_CLIENT_SECRET || process.env.LULU_API_SECRET;
  const luluApiBase = (process.env.LULU_API_BASE || 'https://api.lulu.com').replace(/\/+$/, '');
  const base =
    process.env.LULU_WEBHOOK_BASE_URL ||
    process.env.ADMIN_BASE_URL ||
    process.env.BACKEND_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  const webhookUrl =
    process.env.LULU_WEBHOOK_URL ||
    `${resolveCanonicalBackendBaseUrl(base)}/api/webhooks/lulu/status`;

  if (!luluClientId || !luluClientSecret) {
    return NextResponse.json(
      {
        error: 'Lulu API credentials not configured',
        hint: 'Set LULU_CLIENT_ID and LULU_CLIENT_SECRET in environment variables.',
      },
      { status: 500 }
    );
  }

  try {
    // Get access token
    const tokenUrl = `${luluApiBase}/auth/realms/glasstree/protocol/openid-connect/token`;
    const basicAuth = Buffer.from(`${luluClientId}:${luluClientSecret}`).toString('base64');

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: 'grant_type=client_credentials',
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      return NextResponse.json(
        { error: 'Failed to get Lulu access token', status: tokenRes.status, details: text.slice(0, 300) },
        { status: 502 }
      );
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return NextResponse.json({ error: 'Lulu token response missing access_token' }, { status: 502 });
    }

    // Step 1: List existing webhooks
    const webhooksUrl = `${luluApiBase}/webhooks/`;
    const listRes = await fetch(webhooksUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const existingWebhooks = await listRes.json().catch(() => ({ results: [] }));
    const webhookList = existingWebhooks.results || existingWebhooks || [];

    // Step 2: Delete all existing webhooks
    const deleteResults: any[] = [];
    for (const wh of webhookList) {
      const whId = wh.id;
      if (!whId) continue;
      
      const deleteRes = await fetch(`${luluApiBase}/webhooks/${whId}/`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      
      deleteResults.push({
        id: whId,
        url: wh.url,
        deleted: deleteRes.ok,
        status: deleteRes.status,
      });
    }

    // Step 3: Create fresh subscription
    const subscribeRes = await fetch(webhooksUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        topics: [LULU_WEBHOOK_TOPIC],
        url: webhookUrl,
      }),
    });

    const subscribeBody = await subscribeRes.json().catch(() => ({}));

    if (!subscribeRes.ok) {
      return NextResponse.json(
        {
          error: 'Webhook re-subscription failed',
          deletedWebhooks: deleteResults,
          subscribeStatus: subscribeRes.status,
          subscribeDetails: subscribeBody,
          webhookUrl,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Webhook reset complete - old webhooks deleted and new one created',
      deletedWebhooks: deleteResults,
      newWebhook: subscribeBody,
      webhookUrl,
      topic: LULU_WEBHOOK_TOPIC,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Unexpected error', details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
