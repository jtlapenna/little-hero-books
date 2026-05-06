import { NextRequest, NextResponse } from 'next/server';
import { verifyPublishedBookConfigIntegrity } from '@/lib/books';
import {
  resolveWorkflowAlertsByAlertType,
  upsertWorkflowAlert,
} from '@/lib/workflow-alerts';

export const dynamic = 'force-dynamic';

const ALERT_TYPE = 'book_config_integrity_failed';

function buildDedupeKey(input: {
  bookId: string | null;
  version: number | null;
  check: string;
}): string {
  return [
    'book-config-integrity',
    input.bookId ?? 'unknown-book',
    input.version ?? 'unknown-version',
    input.check,
  ].join(':');
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await verifyPublishedBookConfigIntegrity();

    if (result.ok) {
      await resolveWorkflowAlertsByAlertType(ALERT_TYPE);
      return NextResponse.json({
        success: true,
        message: 'Book config integrity check passed',
        ...result,
      });
    }

    const alerts = [];
    for (const issue of result.issues) {
      const alert = await upsertWorkflowAlert({
        dedupeKey: buildDedupeKey(issue),
        stage: 'book-config',
        alertType: ALERT_TYPE,
        severity: 'critical',
        summary: issue.message,
        details: {
          bookId: issue.bookId,
          version: issue.version,
          check: issue.check,
          storedChecksum: issue.storedChecksum ?? null,
          computedChecksum: issue.computedChecksum ?? null,
          bundledChecksum: issue.bundledChecksum ?? null,
          details: issue.details ?? null,
          checkedAt: result.checkedAt,
        },
      });
      alerts.push({
        id: alert.id,
        dedupeKey: alert.dedupe_key,
        summary: alert.summary,
      });
    }

    return NextResponse.json(
      {
        success: false,
        message: 'Book config integrity check failed',
        ...result,
        alerts,
      },
      { status: 500 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await upsertWorkflowAlert({
      dedupeKey: 'book-config-integrity:cron:unexpected-error',
      stage: 'book-config',
      alertType: ALERT_TYPE,
      severity: 'critical',
      summary: `Book config integrity cron failed: ${message}`,
      details: {
        error: message,
        checkedAt: new Date().toISOString(),
      },
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Book config integrity cron failed',
        details: message,
      },
      { status: 500 },
    );
  }
}
