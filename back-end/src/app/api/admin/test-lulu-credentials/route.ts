import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/test-lulu-credentials
 * 
 * Test endpoint to verify Lulu API credentials are configured.
 */
export async function GET(request: NextRequest) {
  // Check multiple possible variable names
  const luluClientId = process.env.LULU_CLIENT_ID || process.env.LULU_CLIENT_KEY;
  const luluClientSecret = process.env.LULU_CLIENT_SECRET || process.env.LULU_API_SECRET;
  const luluApiBase = process.env.LULU_API_BASE || 'https://api.lulu.com';

  // Check all possible variations
  const allLuluVars: Record<string, string> = {};
  Object.keys(process.env).forEach(key => {
    if (key.toUpperCase().includes('LULU')) {
      const value = process.env[key] || '';
      // Show first 10 chars and last 4 chars for security
      allLuluVars[key] = value.length > 14 
        ? `${value.substring(0, 10)}...${value.substring(value.length - 4)}`
        : value.length > 0
        ? '***'
        : 'NOT SET';
    }
  });

  return NextResponse.json({
    configured: {
      LULU_CLIENT_ID: luluClientId ? `${luluClientId.substring(0, 10)}...${luluClientId.substring(luluClientId.length - 4)}` : 'NOT SET',
      LULU_CLIENT_SECRET: luluClientSecret ? '***SET***' : 'NOT SET',
      LULU_API_BASE: luluApiBase,
    },
    allLuluEnvVars: allLuluVars,
    hasCredentials: !!(luluClientId && luluClientSecret),
    nodeEnv: process.env.NODE_ENV,
    note: 'If credentials show as NOT SET, check: 1) Variable names are exact (LULU_CLIENT_ID, LULU_CLIENT_SECRET), 2) Server was restarted after adding vars, 3) .env.local is in back-end/ directory'
  });
}

