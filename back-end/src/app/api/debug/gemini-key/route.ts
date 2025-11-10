import { NextRequest, NextResponse } from 'next/server';

/**
 * Debug endpoint to check if Gemini API key is configured
 * GET /api/debug/gemini-key
 */
export async function GET(request: NextRequest) {
  const hasKey = !!process.env.GOOGLE_GEMINI_API_KEY;
  const keyLength = process.env.GOOGLE_GEMINI_API_KEY?.length || 0;
  const keyPrefix = process.env.GOOGLE_GEMINI_API_KEY?.substring(0, 10) || 'N/A';
  
  return NextResponse.json({
    configured: hasKey,
    keyLength,
    keyPrefix: hasKey ? `${keyPrefix}...` : 'N/A',
    message: hasKey 
      ? 'Gemini API key is configured' 
      : 'Gemini API key is NOT configured',
    envVarName: 'GOOGLE_GEMINI_API_KEY',
    timestamp: new Date().toISOString(),
  });
}

