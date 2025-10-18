// Health check endpoint
import { NextRequest, NextResponse } from 'next/server';
import { monitoringService } from '@/lib/monitoring';

export async function GET(request: NextRequest) {
  try {
    const status = await monitoringService.runAllHealthChecks();
    
    // Only return 503 for critical system failures, not for expected "not implemented" services
    // Check if any critical services (R2, File System) are unhealthy
    const criticalServices = status.checks.filter(check => 
      check.service === 'R2 Storage' || check.service === 'File System'
    );
    const criticalUnhealthy = criticalServices.some(check => check.status === 'unhealthy');
    
    const httpStatus = criticalUnhealthy ? 503 : 200;
    
    return NextResponse.json(status, { status: httpStatus });
  } catch (error) {
    console.error('Health check failed:', error);
    return NextResponse.json(
      {
        overall: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check system failure'
      },
      { status: 503 }
    );
  }
}
