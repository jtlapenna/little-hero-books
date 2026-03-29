import path from "node:path";

export type WorkflowExportSecretFinding = {
  ruleId: string;
  message: string;
  filePath: string;
  line: number;
};

type ContentRule = {
  id: string;
  message: string;
  pattern: RegExp;
};

const CONTENT_RULES: ContentRule[] = [
  {
    id: "hardcoded-basic-auth",
    message: "Found hardcoded Basic auth credentials in workflow export content.",
    pattern: /Basic [A-Za-z0-9+/=]{20,}/g,
  },
  {
    id: "hardcoded-bearer-auth",
    message: "Found a hardcoded Bearer token in workflow export content.",
    pattern: /Authorization:\s*['"]Bearer (?!REDACTED_)[A-Za-z0-9._-]{20,}['"]/g,
  },
  {
    id: "presigned-url-signature",
    message: "Found a presigned URL signature in workflow export content.",
    pattern: /X-Amz-Signature=/g,
  },
  {
    id: "aws-access-key-id",
    message: "Found an AWS access key id in workflow export content.",
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    id: "plain-client-secret",
    message: "Found a non-redacted Lulu client secret in code-node config.",
    pattern: /clientSecret:\s*'(?!REDACTED_)[^']+'/g,
  },
  {
    id: "plain-service-role",
    message: "Found a non-redacted Supabase service role key in code-node config.",
    pattern: /serviceRoleKey:\s*'(?!REDACTED_)[^']+'/g,
  },
  {
    id: "plain-access-key-id",
    message: "Found a non-redacted R2 access key id in code-node config.",
    pattern: /accessKeyId:\s*'(?!REDACTED_)[^']+'/g,
  },
  {
    id: "plain-secret-access-key",
    message: "Found a non-redacted R2 secret access key in code-node config.",
    pattern: /secretAccessKey:\s*'(?!REDACTED_)[^']+'/g,
  },
  {
    id: "plain-backend-api-token",
    message: "Found a non-redacted backend API token in code-node config.",
    pattern: /backendApiToken:\s*'(?!REDACTED_)[^']+'/g,
  },
  {
    id: "plain-renderer-token",
    message: "Found a non-redacted renderer internal token in code-node config.",
    pattern: /internalToken:\s*'(?!REDACTED_)[^']+'/g,
  },
  {
    id: "escaped-client-secret",
    message: "Found a non-redacted Lulu client secret in embedded sample JSON.",
    pattern: /\\"clientSecret\\":\s*\\"(?!REDACTED_)[^\\"]+\\"/g,
  },
  {
    id: "escaped-service-role",
    message: "Found a non-redacted Supabase service role key in embedded sample JSON.",
    pattern: /\\"serviceRoleKey\\":\s*\\"(?!REDACTED_)[^\\"]+\\"/g,
  },
  {
    id: "escaped-access-key-id",
    message: "Found a non-redacted R2 access key id in embedded sample JSON.",
    pattern: /\\"accessKeyId\\":\s*\\"(?!REDACTED_)[^\\"]+\\"/g,
  },
  {
    id: "escaped-secret-access-key",
    message: "Found a non-redacted R2 secret access key in embedded sample JSON.",
    pattern: /\\"secretAccessKey\\":\s*\\"(?!REDACTED_)[^\\"]+\\"/g,
  },
  {
    id: "escaped-backend-api-token",
    message: "Found a non-redacted backend API token in embedded sample JSON.",
    pattern: /\\"backendApiToken\\":\s*\\"(?!REDACTED_)[^\\"]+\\"/g,
  },
  {
    id: "escaped-renderer-token",
    message: "Found a non-redacted renderer internal token in embedded sample JSON.",
    pattern: /\\"internalToken\\":\s*\\"(?!REDACTED_)[^\\"]+\\"/g,
  },
];

function normalizePath(filePath: string): string {
  return filePath.replaceAll(path.sep, "/");
}

function toLineNumber(text: string, matchIndex: number): number {
  return text.slice(0, matchIndex).split("\n").length;
}

export function isWorkflowExportPath(filePath: string): boolean {
  const normalized = normalizePath(filePath);
  return normalized.includes("/docs/n8n-workflow-files/") && normalized.endsWith(".json");
}

export function isLiveBackupPath(filePath: string): boolean {
  const normalized = normalizePath(filePath);
  return /\/docs\/n8n-workflow-files\/repo-centric\/live-backups\/.+\.json$/u.test(normalized);
}

export function scanWorkflowExportText(
  filePath: string,
  text: string,
): WorkflowExportSecretFinding[] {
  const findings: WorkflowExportSecretFinding[] = [];

  if (!isWorkflowExportPath(filePath)) {
    return findings;
  }

  if (isLiveBackupPath(filePath)) {
    findings.push({
      ruleId: "tracked-live-backup",
      message: "Tracked live-backup JSON is forbidden because cloud exports often embed secrets.",
      filePath,
      line: 1,
    });
  }

  for (const rule of CONTENT_RULES) {
    const match = rule.pattern.exec(text);
    rule.pattern.lastIndex = 0;
    if (!match || match.index == null) {
      continue;
    }

    findings.push({
      ruleId: rule.id,
      message: rule.message,
      filePath,
      line: toLineNumber(text, match.index),
    });
  }

  return findings;
}
