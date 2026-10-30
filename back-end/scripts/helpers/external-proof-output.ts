import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { lstatSync, mkdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, resolve, sep } from 'node:path';

export const artifactResolver = '/Users/jeff/.local/bin/agent-artifact-root';
export type ExternalProofOutput = { output: string; artifactRoot: string; device: number; inode: number };

export function resolveArtifactRoot(): string {
  const result = spawnSync(artifactResolver, ['--project', 'little-hero-books'], {
    encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message || 'Artifact resolver failed');
  const root = result.stdout.trim();
  assert.ok(root && !/[\r\n]/.test(root) && isAbsolute(root) && resolve(root) === root, 'Invalid artifact root');
  assert.equal(realpathSync(root), root, 'Artifact root must be canonical');
  assert.ok(statSync(root).isDirectory(), 'Artifact root must be a directory');
  return root;
}

export function resolveExternalProofOutput(requested: string): ExternalProofOutput {
  const artifactRoot = resolveArtifactRoot();
  assert.ok(isAbsolute(requested), 'Supply an explicit absolute external output');
  const output = resolve(requested), parent = dirname(output);
  assert.ok(output.startsWith(artifactRoot + sep), 'Output must be below approved external project root');
  assert.equal(realpathSync(parent), parent, 'Output parent must exist without symlinks');
  const rootStat = statSync(artifactRoot);
  const parentStat = statSync(parent);
  assert.ok(parentStat.isDirectory(), 'Output parent must be a directory');
  assert.equal(parentStat.dev, rootStat.dev, 'Output parent is on another filesystem');
  assert.equal(lstatSync(output, { throwIfNoEntry: false }), undefined, 'Output already exists');
  return { output, artifactRoot, device: rootStat.dev, inode: rootStat.ino };
}

export function checkExternalProofOutput(binding: ExternalProofOutput): void {
  assert.equal(resolveArtifactRoot(), binding.artifactRoot, 'Artifact root changed');
  const current = statSync(binding.artifactRoot);
  assert.equal(current.dev, binding.device, 'Artifact filesystem changed');
  assert.equal(current.ino, binding.inode, 'Artifact root identity changed');
  assert.equal(realpathSync(dirname(binding.output)), dirname(binding.output), 'Output parent changed');
  assert.equal(statSync(dirname(binding.output)).dev, binding.device, 'Output filesystem changed');
  if (lstatSync(binding.output, { throwIfNoEntry: false })) {
    assert.equal(realpathSync(binding.output), binding.output, 'Output became a symlink');
    assert.ok(lstatSync(binding.output).isDirectory(), 'Output is not a directory');
    assert.equal(statSync(binding.output).dev, binding.device, 'Output is on another filesystem');
  }
}

/** Only the fresh private leaf is created. Failed partial output is preserved. */
export function writeExternalProof(binding: ExternalProofOutput, write: () => void): void {
  checkExternalProofOutput(binding);
  mkdirSync(binding.output, { mode: 0o700 });
  write();
  checkExternalProofOutput(binding);
}
