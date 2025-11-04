// Worker runtime information endpoint
// Helps diagnose worker initialization and runtime issues
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const info: any = {
      timestamp: new Date().toISOString(),
      runtime: {
        name: 'Cloudflare Workers',
        // @ts-ignore - These might not exist in all runtimes
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A',
        // @ts-ignore
        platform: typeof process !== 'undefined' ? process.platform : 'N/A',
      },
      environment: {
        // Check if we can access process.env
        canAccessProcessEnv: typeof process !== 'undefined' && typeof process.env !== 'undefined',
        envVarCount: typeof process !== 'undefined' && typeof process.env !== 'undefined' 
          ? Object.keys(process.env).length 
          : 0,
      },
      modules: {
        // Test if critical modules can be imported
        r2Config: { loaded: false, error: null as string | null },
        r2Service: { loaded: false, error: null as string | null },
        monitoring: { loaded: false, error: null as string | null },
      },
    };

    // Try to import and test critical modules
    try {
      const r2Client = await import('@/lib/r2-client');
      info.modules.r2Config.loaded = true;
      info.modules.r2Config.validateR2Config = r2Client.validateR2Config();
    } catch (error: any) {
      info.modules.r2Config.loaded = false;
      info.modules.r2Config.error = error?.message || String(error);
    }

    try {
      await import('@/lib/r2-service');
      info.modules.r2Service.loaded = true;
    } catch (error: any) {
      info.modules.r2Service.loaded = false;
      info.modules.r2Service.error = error?.message || String(error);
    }

    try {
      await import('@/lib/monitoring');
      info.modules.monitoring.loaded = true;
    } catch (error: any) {
      info.modules.monitoring.loaded = false;
      info.modules.monitoring.error = error?.message || String(error);
    }

    return NextResponse.json(info, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        error: 'Worker info endpoint failed',
        message: error?.message || String(error),
        stack: error?.stack,
      },
      { status: 500 }
    );
  }
}

