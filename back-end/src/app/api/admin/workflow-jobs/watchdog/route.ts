import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { getWorkflowAlertStorageMode } from '@/lib/workflow-alerts';
import { runRepoWorkflowWatchdog } from '@/lib/workflow-watchdog';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const adminAuth = requireAdminAuth(request);
  if (!adminAuth.ok) {
    return adminAuth.response;
  }

  try {
    const [summary, storageMode] = await Promise.all([
      runRepoWorkflowWatchdog(),
      getWorkflowAlertStorageMode(),
    ]);

    return NextResponse.json({
      success: true,
      ranAt: new Date().toISOString(),
      storageMode,
      summary,
    });
  } catch (error) {
    console.error('[POST /api/admin/workflow-jobs/watchdog] Error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal Server Error',
      },
      { status: 500 },
    );
  }
}
