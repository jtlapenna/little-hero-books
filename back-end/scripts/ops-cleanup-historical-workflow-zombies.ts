#!/usr/bin/env tsx

import { getWorkflowOpenAlertSummary } from '@/lib/workflow-alerts';
import { runRepoWorkflowWatchdog } from '@/lib/workflow-watchdog';
import {
  applyHistoricalWorkflowZombieCleanup,
  inspectHistoricalWorkflowZombieCandidates,
  KNOWN_HISTORICAL_WORKFLOW_ZOMBIE_JOB_IDS,
} from '@/lib/workflow-zombie-cleanup';

function parseArgs(argv: string[]) {
  let apply = false;
  let actor = 'codex-historical-workflow-cleanup';
  let jobIds: number[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      return { help: true, apply, actor, jobIds };
    }
    if (arg === '--apply') {
      apply = true;
      continue;
    }
    if (arg === '--list') {
      continue;
    }
    if (arg === '--actor') {
      actor = argv[index + 1]?.trim() || actor;
      index += 1;
      continue;
    }
    if (arg === '--job-ids') {
      jobIds = (argv[index + 1] ?? '')
        .split(',')
        .map((value) => Number.parseInt(value.trim(), 10))
        .filter((value) => Number.isFinite(value) && value > 0);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { help: false, apply, actor, jobIds };
}

function printUsage() {
  console.log(
    [
      'Usage:',
      '  npm --prefix back-end run ops:cleanup-historical-workflow-zombies',
      '  npm --prefix back-end run ops:cleanup-historical-workflow-zombies -- --apply --job-ids 4,6,12 --actor your-name',
      '',
      'Defaults:',
      '  --list is implicit when --apply is omitted',
      `  known verified job ids: ${KNOWN_HISTORICAL_WORKFLOW_ZOMBIE_JOB_IDS.join(', ')}`,
    ].join('\n'),
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  if (!args.apply) {
    const inspected = await inspectHistoricalWorkflowZombieCandidates();
    const safeCount = inspected.filter((entry) => entry.safeToCleanup).length;
    const unsafeCount = inspected.length - safeCount;

    console.log(
      JSON.stringify(
        {
          mode: 'dry-run',
          historyCutoff: '2026-03-26T00:00:00.000Z',
          candidateCount: inspected.length,
          safeCount,
          unsafeCount,
          knownInitialTargetIds: [...KNOWN_HISTORICAL_WORKFLOW_ZOMBIE_JOB_IDS],
          candidates: inspected,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (args.jobIds.length === 0) {
    throw new Error('Apply mode requires explicit --job-ids');
  }

  const result = await applyHistoricalWorkflowZombieCleanup({
    jobIds: args.jobIds,
    actor: args.actor,
  });
  const watchdogSummary = await runRepoWorkflowWatchdog();
  const postCleanupAlertSummary = await getWorkflowOpenAlertSummary({
    hours: 24 * 30,
    jobIds: result.cleaned.map((entry) => entry.jobId),
  });

  console.log(
    JSON.stringify(
      {
        mode: 'apply',
        actor: args.actor,
        requestedJobIds: args.jobIds,
        inspectedCount: result.inspected.length,
        cleanedCount: result.cleaned.length,
        skippedCount: result.skipped.length,
        cleaned: result.cleaned,
        skipped: result.skipped,
        watchdogSummary,
        postCleanupOpenAlertSummary: postCleanupAlertSummary,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
