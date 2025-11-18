import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/debug/env-vars
 * 
 * Debug endpoint to check which environment variables are available.
 * Returns only variable names (not values) for security.
 */
export async function GET(request: NextRequest) {
  const allEnvKeys = Object.keys(process.env || {});
  const cronRelated = allEnvKeys.filter(k => 
    k.includes('CRON') || 
    k.includes('SECRET') || 
    k.toLowerCase().includes('cron') || 
    k.toLowerCase().includes('secret')
  );
  
  const hasCronSecret = !!process.env.CRON_SECRET;
  
  return NextResponse.json({
    totalEnvVars: allEnvKeys.length,
    hasCronSecret,
    cronSecretLength: process.env.CRON_SECRET?.length || 0,
    cronRelatedKeys: cronRelated,
    allKeys: allEnvKeys.sort(),
    sampleKeys: allEnvKeys.slice(0, 20)
  });
}

