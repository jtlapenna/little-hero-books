#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  isWorkflowExportPath,
  scanWorkflowExportText,
  type WorkflowExportSecretFinding,
} from "@/lib/workflow-export-secrets";

function gitOutput(repoRoot: string, args: string[]): string[] {
  const output = execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseArgs(argv: string[]) {
  const options = {
    all: false,
    stagedOnly: false,
    fileArgs: [] as string[],
  };

  for (const arg of argv) {
    if (arg === "--all") {
      options.all = true;
      continue;
    }
    if (arg === "--staged") {
      options.stagedOnly = true;
      continue;
    }
    options.fileArgs.push(arg);
  }

  return options;
}

function collectCandidatePaths(repoRoot: string, argv: string[]): string[] {
  const options = parseArgs(argv);

  if (options.fileArgs.length > 0) {
    return [...new Set(options.fileArgs.map((filePath) => path.resolve(repoRoot, filePath)))];
  }

  if (options.all) {
    return gitOutput(repoRoot, ["ls-files", "--", "docs/n8n-workflow-files"])
      .map((filePath) => path.resolve(repoRoot, filePath))
      .filter(isWorkflowExportPath);
  }

  const changed = new Set<string>();

  for (const filePath of gitOutput(repoRoot, ["diff", "--name-only", "--cached", "--", "docs/n8n-workflow-files"])) {
    changed.add(path.resolve(repoRoot, filePath));
  }

  if (!options.stagedOnly) {
    for (const filePath of gitOutput(repoRoot, ["diff", "--name-only", "--", "docs/n8n-workflow-files"])) {
      changed.add(path.resolve(repoRoot, filePath));
    }
    for (const filePath of gitOutput(repoRoot, ["ls-files", "--others", "--exclude-standard", "--", "docs/n8n-workflow-files"])) {
      changed.add(path.resolve(repoRoot, filePath));
    }
  }

  return [...changed].filter(isWorkflowExportPath);
}

function printFindings(findings: WorkflowExportSecretFinding[]): void {
  for (const finding of findings) {
    const relativePath = path.relative(process.cwd(), finding.filePath) || finding.filePath;
    console.error(`${relativePath}:${finding.line} [${finding.ruleId}] ${finding.message}`);
  }
}

async function main(): Promise<void> {
  const repoRoot = path.resolve(process.cwd(), "..");
  const candidatePaths = collectCandidatePaths(repoRoot, process.argv.slice(2));

  if (candidatePaths.length === 0) {
    console.log("No changed workflow export files to scan.");
    return;
  }

  const findings: WorkflowExportSecretFinding[] = [];

  for (const filePath of candidatePaths) {
    if (!existsSync(filePath)) {
      continue;
    }
    const text = readFileSync(filePath, "utf8");
    findings.push(...scanWorkflowExportText(filePath, text));
  }

  if (findings.length > 0) {
    console.error("Workflow export secret scan failed.");
    printFindings(findings);
    process.exitCode = 1;
    return;
  }

  console.log(`Workflow export secret scan passed for ${candidatePaths.length} file(s).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
