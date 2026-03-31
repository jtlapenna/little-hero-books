import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin-auth';
import { acknowledgeWorkflowAlert } from '@/lib/workflow-alerts';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ alertId: string }> },
) {
  const adminAuth = requireAdminAuth(request);
  if (!adminAuth.ok) {
    return adminAuth.response;
  }

  try {
    const { alertId } = await params;
    const parsedId = Number.parseInt(alertId, 10);
    if (!Number.isFinite(parsedId) || parsedId <= 0) {
      return NextResponse.json({ error: 'Invalid alert id' }, { status: 400 });
    }

    const actor =
      request.headers.get('x-admin-email')?.trim() ||
      request.headers.get('x-admin-user')?.trim() ||
      'admin';
    const alert = await acknowledgeWorkflowAlert(parsedId, actor);
    if (!alert) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      alert,
    });
  } catch (error) {
    console.error('[POST /api/admin/workflow-alerts/:alertId/acknowledge] Error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal Server Error',
      },
      { status: 500 },
    );
  }
}
