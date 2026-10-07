#!/usr/bin/env tsx

import {
  isLiveBackupPath,
  isWorkflowExportPath,
  scanWorkflowExportText,
} from "@/lib/workflow-export-secrets";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function testPathClassification() {
  assert(
    isWorkflowExportPath(
      "/repo/docs/n8n-workflow-files/repo-centric/workflows/w4-PRODUCTION-Print_Fulfillment.repo-centric.json",
    ),
    "workflow export path should match repo-centric workflow JSON",
  );
  assert(
    isLiveBackupPath(
      "/repo/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-27/example.json",
    ),
    "live backup path should match tracked live-backup JSON",
  );
  assert(
    !isWorkflowExportPath("/repo/back-end/src/app/page.tsx"),
    "non-workflow files should not match workflow export paths",
  );
}

function testLiveBackupFinding() {
  const findings = scanWorkflowExportText(
    "/repo/docs/n8n-workflow-files/repo-centric/live-backups/2026-03-27/example.json",
    "{\"ok\":true}",
  );

  assert(
    findings.some((finding) => finding.ruleId === "tracked-live-backup"),
    "tracked live-backup JSON should always fail the scan",
  );
}

function testPlainSecretFinding() {
  const findings = scanWorkflowExportText(
    "/repo/docs/n8n-workflow-files/repo-centric/workflows/example.json",
    "const BASE_CONFIG = { backendApiToken: 'abcdef123456', clientSecret: 'secret-value' };",
  );

  assert(
    findings.some((finding) => finding.ruleId === "plain-backend-api-token"),
    "plain backendApiToken should be detected",
  );
  assert(
    findings.some((finding) => finding.ruleId === "plain-client-secret"),
    "plain clientSecret should be detected",
  );
}

function testHardcodedBearerFinding() {
  const findings = scanWorkflowExportText(
    "/repo/docs/n8n-workflow-files/repo-centric/workflows/example.json",
    "headers: { Authorization: 'Bearer abcdefghijklmnopqrstuvwxyz123456', 'Content-Type': 'application/json' }",
  );

  assert(
    findings.some((finding) => finding.ruleId === "hardcoded-bearer-auth"),
    "hardcoded Bearer tokens in code-node headers should be detected",
  );
}

function testEscapedSecretFinding() {
  const findings = scanWorkflowExportText(
    "/repo/docs/n8n-workflow-files/repo-centric/workflows/example.json",
    String.raw`{\"serviceRoleKey\": \"abcdef1234567890\", \"secretAccessKey\": \"abcdef9876543210\"}`,
  );

  assert(
    findings.some((finding) => finding.ruleId === "escaped-service-role"),
    "escaped serviceRoleKey should be detected",
  );
  assert(
    findings.some((finding) => finding.ruleId === "escaped-secret-access-key"),
    "escaped secretAccessKey should be detected",
  );
}

function testAssignedServiceRoleFinding() {
  const findings = scanWorkflowExportText(
    "/repo/docs/n8n-workflow-files/repo-centric/workflows/example.json",
    "const supabaseServiceRoleKey = cfg.supabase?.serviceRoleKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def';",
  );

  assert(
    findings.some((finding) => finding.ruleId === "assigned-service-role"),
    "assigned Supabase service role fallback should be detected",
  );
}

function testRedactedContentPasses() {
  const findings = scanWorkflowExportText(
    "/repo/docs/n8n-workflow-files/repo-centric/workflows/example.json",
    String.raw`const BASE_CONFIG = { backendApiToken: 'REDACTED_BACKEND_API_TOKEN', clientSecret: 'REDACTED_CLIENT_SECRET' };
{\"serviceRoleKey\": \"REDACTED_SERVICE_ROLE_KEY\"}`,
  );

  assert(findings.length === 0, "redacted placeholders should not fail the scan");
}

function testPresignedUrlFinding() {
  const findings = scanWorkflowExportText(
    "/repo/docs/n8n-workflow-files/repo-centric/workflows/example.json",
    "https://example.com/file.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc123",
  );

  assert(
    findings.some((finding) => finding.ruleId === "presigned-url-signature"),
    "presigned URL signatures should be detected",
  );
}

function testProviderTokenHeaders() {
  const file = '/repo/docs/n8n-workflow-files/repo-centric/workflows/example.json';
  for (const value of ['synthetic-provider-token', '=synthetic-provider-token', "={{ $env.BRIA_API_TOKEN || 'synthetic-provider-token' }}"]) {
    const findings = scanWorkflowExportText(file, JSON.stringify({nodes:[{parameters:{headerParameters:{parameters:[{name:'API_TOKEN',value}]}}}]}));
    assert(findings.some(finding => finding.ruleId === 'provider-api-token-header'), 'Provider header literal must fail');
    assert(!JSON.stringify(findings).includes('synthetic-provider-token'), 'Finding must omit credential value');
  }
  for (const value of ['REDACTED_BRIA_API_TOKEN', '=REDACTED_BRIA_API_TOKEN', '={{ $env.BRIA_API_TOKEN }}', '={{ $vars.BRIA_API_TOKEN }}', '=']) {
    const findings = scanWorkflowExportText(file, JSON.stringify({name:'api_token',value}));
    assert(!findings.some(finding => finding.ruleId === 'provider-api-token-header'), 'Redacted/direct variable/empty header may pass');
  }
}

function main() {
  testProviderTokenHeaders();
  testPathClassification();
  testLiveBackupFinding();
  testPlainSecretFinding();
  testHardcodedBearerFinding();
  testEscapedSecretFinding();
  testAssignedServiceRoleFinding();
  testRedactedContentPasses();
  testPresignedUrlFinding();
  console.log("workflow export secret scan tests passed");
}

main();
