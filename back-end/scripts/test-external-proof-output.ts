/** Run only inside the guarded, scrubbed, network-denied focused test job. */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { resolveArtifactRoot, resolveExternalProofOutput, writeExternalProof } from './helpers/external-proof-output';

const root = resolveArtifactRoot();
const fixture = mkdtempSync(resolve(root, 'external-output-path-test-'));
try {
  mkdirSync(resolve(fixture, 'directory'));
  writeFileSync(resolve(fixture, 'file'), 'existing');
  symlinkSync(resolve(fixture, 'missing'), resolve(fixture, 'dangling'));
  symlinkSync(resolve(fixture, 'directory'), resolve(fixture, 'alias'));
  const rejected = ['relative', root, resolve(dirname(root), 'little-hero-books-sibling/output'),
    resolve(__dirname, '../../output/forbidden-external-test'), resolve(fixture, 'missing/output'),
    resolve(fixture, 'directory'), resolve(fixture, 'file'), resolve(fixture, 'dangling'), resolve(fixture, 'alias/output')];
  for (const output of rejected) assert.throws(() => resolveExternalProofOutput(output), `Accepted ${output}`);
  assert.equal(existsSync(resolve(fixture, 'missing')), false);
  assert.equal(existsSync(resolve(fixture, 'directory/output')), false);
  const binding = resolveExternalProofOutput(resolve(fixture, 'fresh'));
  assert.throws(() => writeExternalProof({ ...binding, inode: binding.inode + 1 }, () => {
    throw new Error('Wrong root reached writer');
  }), /Artifact root identity changed/);
  assert.equal(existsSync(binding.output), false);
  writeExternalProof(binding, () => writeFileSync(resolve(binding.output, 'receipt.json'), '{}', { flag: 'wx' }));
  assert.throws(() => resolveExternalProofOutput(binding.output));
  const partial = resolveExternalProofOutput(resolve(fixture, 'partial'));
  assert.throws(() => writeExternalProof(partial, () => {
    writeFileSync(resolve(partial.output, 'partial.txt'), 'partial', { flag: 'wx' });
    throw new Error('Synthetic writer failure');
  }), /Synthetic writer failure/);
  assert.equal(existsSync(resolve(partial.output, 'partial.txt')), true);
  console.log('External path rejections, fresh write and partial retention passed');
} finally {
  // Only this test owns these synthetic temporary files.
  rmSync(fixture, { recursive: true });
}
