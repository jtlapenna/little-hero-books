/**
 * GET /api/admin/lulu-webhook-list
 *
 * Lists all webhook subscriptions registered with Lulu's API.
 * Useful for debugging webhook delivery issues.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const luluClientId = process.env.LULU_CLIENT_ID || process.env.LULU_CLIENT_KEY;
  const luluClientSecret = process.env.LULU_CLIENT_SECRET || process.env.LULU_API_SECRET;
  const luluApiBase = (process.env.LULU_API_BASE || 'https://api.lulu.com').replace(/\/+$/, '');

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
        {
          error: 'Failed to get Lulu access token',
          status: tokenRes.status,
          details: text.slice(0, 300),
        },
        { status: 502 }
      );
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Lulu token response missing access_token' },
        { status: 502 }
      );
    }

    // List webhooks
    const webhooksUrl = `${luluApiBase}/webhooks/`;
    const listRes = await fetch(webhooksUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const body = await listRes.json().catch(() => ({}));

    if (!listRes.ok) {
      return NextResponse.json(
        {
          error: 'Failed to list Lulu webhooks',
          status: listRes.status,
          details: body,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      webhooks: body,
      expectedUrl: 'https://admin.littleherolabs.com/api/webhooks/lulu/status',
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: 'Unexpected error',
        details: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
