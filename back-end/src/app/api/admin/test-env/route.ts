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
  
  // Get ALL environment variables to see what's actually available
  const allEnvVars: Record<string, string> = {};
  Object.keys(process.env).sort().forEach(key => {
    // Show first 50 chars of value to help debug
    const value = process.env[key] || '';
    allEnvVars[key] = value.length > 50 ? `${value.substring(0, 50)}...` : value;
  });
  
  // Get all env vars that contain "AMAZON" or "PREVIEW" (case insensitive)
  const allRelevantVars: Record<string, string> = {};
  Object.keys(process.env).forEach(key => {
    const upperKey = key.toUpperCase();
    if (upperKey.includes('AMAZON') || upperKey.includes('PREVIEW')) {
      allRelevantVars[key] = process.env[key] || 'undefined';
    }
  });

  // Check if the variable exists but with different casing or spelling
  const possibleVariations = [
    'AMAZON_PREVIEW_NOTIFICATIONS_ENABLED',
    'NEXT_PUBLIC_AMAZON_PREVIEW_NOTIFICATIONS_ENABLED',
    'AMAZON_PREVIEW_NOTIFICATION_ENABLED', // singular
    'AMAZON_PREVIEW_NOTIFICATIONS', // without _ENABLED
  ];
  
  const variations: Record<string, string> = {};
  possibleVariations.forEach(variation => {
    variations[variation] = process.env[variation] || 'NOT FOUND';
  });

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    envVarCheck: {
      'AMAZON_PREVIEW_NOTIFICATIONS_ENABLED': envVar1 || 'NOT SET',
      'NEXT_PUBLIC_AMAZON_PREVIEW_NOTIFICATIONS_ENABLED': envVar2 || 'NOT SET',
      enabled: (envVar1?.trim().toLowerCase() === 'true') || (envVar2?.trim().toLowerCase() === 'true'),
      rawValue1: envVar1,
      rawValue2: envVar2,
      type1: typeof envVar1,
      type2: typeof envVar2,
    },
    possibleVariations: variations,
    allRelevantEnvVars: allRelevantVars,
    totalEnvVars: Object.keys(process.env).length,
    sampleEnvVars: Object.fromEntries(Object.entries(allEnvVars).slice(0, 20)), // First 20 for debugging
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    vercelUrl: process.env.VERCEL_URL,
    note: 'Check the envVarCheck section. If it shows "NOT SET", the variable might: 1) Have a typo in the name, 2) Be set in wrong environment scope, 3) Need the deployment to be rebuilt. Check possibleVariations for similar names.'
  });
}

