import { NextRequest, NextResponse } from 'next/server';

/**
 * Simple test endpoint to check if AMAZON_PREVIEW_NOTIFICATIONS_ENABLED is available
 * GET /api/admin/test-env
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Check all possible ways the env var might be set
  const envVar1 = process.env.AMAZON_PREVIEW_NOTIFICATIONS_ENABLED;
  const envVar2 = process.env.NEXT_PUBLIC_AMAZON_PREVIEW_NOTIFICATIONS_ENABLED;
  
  // Get all env vars that contain "AMAZON" or "PREVIEW"
  const allRelevantVars: Record<string, string> = {};
  Object.keys(process.env).forEach(key => {
    const upperKey = key.toUpperCase();
    if (upperKey.includes('AMAZON') || upperKey.includes('PREVIEW')) {
      allRelevantVars[key] = process.env[key] || 'undefined';
    }
  });

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    envVarCheck: {
      'AMAZON_PREVIEW_NOTIFICATIONS_ENABLED': envVar1 || 'NOT SET',
      'NEXT_PUBLIC_AMAZON_PREVIEW_NOTIFICATIONS_ENABLED': envVar2 || 'NOT SET',
      enabled: (envVar1?.trim().toLowerCase() === 'true') || (envVar2?.trim().toLowerCase() === 'true')
    },
    allRelevantEnvVars: allRelevantVars,
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    vercelUrl: process.env.VERCEL_URL,
    note: 'If AMAZON_PREVIEW_NOTIFICATIONS_ENABLED shows "NOT SET", you need to: 1) Set it in Vercel Project Settings → Environment Variables, 2) Make sure it\'s set for Production, 3) Trigger a new deployment (Redeploy). This commit triggers a redeploy.'
  });
}

