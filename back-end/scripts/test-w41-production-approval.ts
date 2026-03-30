#!/usr/bin/env tsx

import {
  issueW41ProductionApprovalToken,
  verifyW41ProductionApprovalToken,
} from '@/lib/w41-production-approval';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function testIssueAndVerifyApprovalToken(): Promise<void> {
  process.env.W41_PRODUCTION_APPROVAL_SECRET = 'test-w41-production-approval-secret';

  const issued = issueW41ProductionApprovalToken({
    rootGroupId: 'REAL-W41-GROUP-APPROVAL-001',
    approvedBy: 'test-suite',
    ttlMinutes: 15,
    now: new Date('2026-03-30T18:00:00.000Z'),
  });

  const verified = verifyW41ProductionApprovalToken({
    token: issued.token,
    rootGroupId: 'REAL-W41-GROUP-APPROVAL-001',
    now: new Date('2026-03-30T18:10:00.000Z'),
  });

  assert(
    verified.ok === true &&
      verified.payload.rootGroupId === 'REAL-W41-GROUP-APPROVAL-001' &&
      verified.payload.approvedBy === 'test-suite',
    'Expected a freshly issued W4.1 production approval token to verify for the same root group',
  );
}

async function testApprovalTokenRejectsWrongRootGroup(): Promise<void> {
  process.env.W41_PRODUCTION_APPROVAL_SECRET = 'test-w41-production-approval-secret';

  const issued = issueW41ProductionApprovalToken({
    rootGroupId: 'REAL-W41-GROUP-APPROVAL-002',
    approvedBy: 'test-suite',
    now: new Date('2026-03-30T18:00:00.000Z'),
  });

  const verified = verifyW41ProductionApprovalToken({
    token: issued.token,
    rootGroupId: 'REAL-W41-GROUP-APPROVAL-999',
    now: new Date('2026-03-30T18:10:00.000Z'),
  });

  assert(
    verified.ok === false && verified.reason === 'root_group_mismatch',
    'Expected a W4.1 production approval token to fail closed when reused for a different root group',
  );
}

async function testApprovalTokenExpires(): Promise<void> {
  process.env.W41_PRODUCTION_APPROVAL_SECRET = 'test-w41-production-approval-secret';

  const issued = issueW41ProductionApprovalToken({
    rootGroupId: 'REAL-W41-GROUP-APPROVAL-003',
    approvedBy: 'test-suite',
    ttlMinutes: 5,
    now: new Date('2026-03-30T18:00:00.000Z'),
  });

  const verified = verifyW41ProductionApprovalToken({
    token: issued.token,
    rootGroupId: 'REAL-W41-GROUP-APPROVAL-003',
    now: new Date('2026-03-30T18:06:00.000Z'),
  });

  assert(
    verified.ok === false && verified.reason === 'expired',
    'Expected a W4.1 production approval token to expire after its short-lived approval window',
  );
}

async function main(): Promise<void> {
  const originalSecret = process.env.W41_PRODUCTION_APPROVAL_SECRET;

  try {
    await testIssueAndVerifyApprovalToken();
    await testApprovalTokenRejectsWrongRootGroup();
    await testApprovalTokenExpires();
    console.log('W4.1 production approval tests passed');
  } finally {
    if (originalSecret === undefined) {
      delete process.env.W41_PRODUCTION_APPROVAL_SECRET;
    } else {
      process.env.W41_PRODUCTION_APPROVAL_SECRET = originalSecret;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
