/** A deployment flag alone cannot activate another order, account, or an open-ended window. */
export function workflowTestSubmissionActivated(env: Record<string, unknown>, orderId: string, accountSha256: string | undefined, now = Date.now()): boolean {
  const until = typeof env.GELATO_WORKFLOW_TEST_SUBMISSION_EXPIRES_AT === 'string' ? Date.parse(env.GELATO_WORKFLOW_TEST_SUBMISSION_EXPIRES_AT) : NaN;
  return env.GELATO_WORKFLOW_TEST_SUBMISSION_ENABLED === 'true' && env.GELATO_WORKFLOW_TEST_SUBMISSION_ORDER_ID === orderId &&
    typeof accountSha256 === 'string' && /^[a-f0-9]{64}$/.test(accountSha256) && env.GELATO_WORKFLOW_TEST_SUBMISSION_ACCOUNT_SHA256 === accountSha256 &&
    Number.isFinite(until) && until > now && until <= now + 24 * 3600000;
}
