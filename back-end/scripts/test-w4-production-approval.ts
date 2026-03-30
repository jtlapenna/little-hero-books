#!/usr/bin/env tsx

import {
  issueW4ProductionApprovalToken,
  verifyW4ProductionApprovalToken,
} from '@/lib/w4-production-approval';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function testIssueAndVerifyApprovalToken(): Promise<void> {
  process.env.W4_PRODUCTION_APPROVAL_SECRET = 'test-w4-production-approval-secret';

  const issued = issueW4ProductionApprovalToken({
    orderId: 'REAL-W4-PILOT-APPROVAL-001',
    approvedBy: 'test-suite',
    ttlMinutes: 15,
    now: new Date('2026-03-29T21:00:00.000Z'),
  });

  const verified = verifyW4ProductionApprovalToken({
    token: issued.token,
    orderId: 'REAL-W4-PILOT-APPROVAL-001',
    now: new Date('2026-03-29T21:10:00.000Z'),
  });

  assert(
    verified.ok === true &&
      verified.payload.orderId === 'REAL-W4-PILOT-APPROVAL-001' &&
      verified.payload.approvedBy === 'test-suite',
    'Expected a freshly issued W4 production approval token to verify for the same order',
  );
}

async function testApprovalTokenRejectsWrongOrder(): Promise<void> {
  process.env.W4_PRODUCTION_APPROVAL_SECRET = 'test-w4-production-approval-secret';

  const issued = issueW4ProductionApprovalToken({
    orderId: 'REAL-W4-PILOT-APPROVAL-002',
    approvedBy: 'test-suite',
    now: new Date('2026-03-29T21:00:00.000Z'),
  });

  const verified = verifyW4ProductionApprovalToken({
    token: issued.token,
    orderId: 'REAL-W4-PILOT-APPROVAL-999',
    now: new Date('2026-03-29T21:10:00.000Z'),
  });

  assert(
    verified.ok === false && verified.reason === 'order_mismatch',
    'Expected a W4 production approval token to fail closed when reused for a different order',
  );
}

async function testApprovalTokenExpires(): Promise<void> {
  process.env.W4_PRODUCTION_APPROVAL_SECRET = 'test-w4-production-approval-secret';

  const issued = issueW4ProductionApprovalToken({
    orderId: 'REAL-W4-PILOT-APPROVAL-003',
    approvedBy: 'test-suite',
    ttlMinutes: 5,
    now: new Date('2026-03-29T21:00:00.000Z'),
  });

  const verified = verifyW4ProductionApprovalToken({
    token: issued.token,
    orderId: 'REAL-W4-PILOT-APPROVAL-003',
    now: new Date('2026-03-29T21:06:00.000Z'),
  });

  assert(
    verified.ok === false && verified.reason === 'expired',
    'Expected a W4 production approval token to expire after its short-lived approval window',
  );
}

async function main(): Promise<void> {
  const originalSecret = process.env.W4_PRODUCTION_APPROVAL_SECRET;

  try {
    await testIssueAndVerifyApprovalToken();
    await testApprovalTokenRejectsWrongOrder();
    await testApprovalTokenExpires();
    console.log('W4 production approval tests passed');
  } finally {
    if (originalSecret === undefined) {
      delete process.env.W4_PRODUCTION_APPROVAL_SECRET;
    } else {
      process.env.W4_PRODUCTION_APPROVAL_SECRET = originalSecret;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
