import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export type SafeFinding = { file: string; line: number; rule: string };
export function scanRepository(repo: string, binary: string): { findings: SafeFinding[]; scanned: number; skipped: number } {
  const root = path.resolve(repo);
  const scratch = mkdtempSync(path.join(tmpdir(), 'lhl-secret-scan-'));
  const snapshot = path.join(scratch, 'tracked');
  const report = path.join(scratch, 'redacted.json');
  mkdirSync(snapshot);
  try {
    const paths = [...new Set(execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
      { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean))];
    const fingerprints: unknown = JSON.parse(readFileSync(path.join(root,
      'scripts/security/compromised-credential-fingerprints.json'), 'utf8'));
    if (!Array.isArray(fingerprints) || fingerprints.some(value => typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)))
      throw new Error('Compromised-credential fingerprint inventory is invalid');
    const denied = new Set(fingerprints as string[]);
    const findings: SafeFinding[] = [];
    let scanned = 0, skipped = 0;
    for (const file of paths) {
      const source = path.join(root, file);
      if (!existsSync(source)) continue;
      const info = lstatSync(source);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 30 * 1024 * 1024) { skipped++; continue; }
      if (/(^|\/)\.env(?:$|\.)/.test(file) && !/\.example$/.test(file))
        findings.push({ file, line: 1, rule: 'tracked-private-env-file' });
      if (/^docs\/n8n-workflow-files\/repo-centric\/live-backups\/.+\.json$/.test(file))
        findings.push({ file, line: 1, rule: 'tracked-live-workflow-backup' });
      const bytes = readFileSync(source);
      if (bytes.subarray(0, 8192).includes(0)) { skipped++; continue; }
      const textForFingerprints = bytes.toString('utf8');
      for (const match of textForFingerprints.matchAll(/[A-Za-z0-9_./+=-]{12,}/g)) {
        // Preserve the exact token and also check sentence punctuation around it.
        const candidates = [match[0], match[0].replace(/^\.+|\.+$/g, '')];
        if (candidates.some(value => denied.has(createHash('sha256').update(value).digest('hex')))) findings.push({ file,
          line: textForFingerprints.slice(0, match.index).split('\n').length, rule: 'known-compromised-credential' });
      }
      if (/\.[cm]?[jt]sx?$/.test(file)) {
        const text = bytes.toString('utf8');
        const publicCredential = /(?:process\.)?env\.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/g;
        for (const match of text.matchAll(publicCredential)) findings.push({ file,
          line: text.slice(0, match.index).split('\n').length, rule: 'public-privileged-supabase-key' });
      }
      const target = path.join(snapshot, file);
      mkdirSync(path.dirname(target), { recursive: true });
      copyFileSync(source, target);
      scanned++;
    }
    const result = spawnSync(binary, ['dir', snapshot, '--config', path.join(root, '.gitleaks.toml'),
      '--ignore-gitleaks-allow', '--gitleaks-ignore-path', path.join(scratch, 'no-ignore'),
      '--redact=100', '--no-banner', '--no-color', '--log-level=error', '--report-format=json', '--report-path', report],
      { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    if (result.error || result.status === null || ![0, 1].includes(result.status) || !existsSync(report) || /\bERR\b|fatal:|deadline exceeded/i.test(result.stderr || ''))
      throw new Error('Secret scanner did not complete; no pass was recorded');
    // Do not echo scanner output, Match, Secret, or source-line snippets.
    const rows: Array<{ File: string; StartLine: number; RuleID: string }> = JSON.parse(readFileSync(report, 'utf8'));
    if (result.status === 1 && rows.length === 0) throw new Error('Secret scanner failed without a finding report');
    for (const row of rows) findings.push({ file: path.relative(snapshot, row.File), line: row.StartLine, rule: row.RuleID });
    return { findings, scanned, skipped };
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    const value = (name: string, fallback: string) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
    const result = scanRepository(value('--repo', process.cwd()), value('--gitleaks', process.env.GITLEAKS_BIN || 'gitleaks'));
    for (const finding of result.findings) console.error(`${finding.file}:${finding.line} [${finding.rule}]`);
    console.log(`Repository secret scan: ${result.scanned} text files, ${result.skipped} binary/large/symlink paths skipped, ${result.findings.length} findings`);
    if (result.findings.length) process.exitCode = 1;
  } catch {
    console.error('Repository secret scan could not complete; fix scanner/configuration access and retry');
    process.exitCode = 2;
  }
}
