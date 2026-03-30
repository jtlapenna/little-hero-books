import { recordWorkflowJobEventResponse } from '@/app/api/internal/workflow-jobs/log-event/route';

async function main() {
  const jobIdRaw = process.argv[2];
  const reason = process.argv[3] || 'Manual cleanup';
  if (!jobIdRaw) {
    throw new Error('usage: tsx scripts/tmp-fail-workflow-job.ts <jobId> [reason]');
  }

  const jobId = Number(jobIdRaw);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    throw new Error(`Invalid jobId: ${jobIdRaw}`);
  }

  const result = await recordWorkflowJobEventResponse({
    jobId,
    eventType: 'manual-cleanup-failed',
    jobStatus: 'failed',
    lastError: {
      message: reason,
      code: 'manual_cleanup',
    },
    payload: {
      eventType: 'manual-cleanup-failed',
      reason,
    },
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
