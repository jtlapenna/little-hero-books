import assert from 'node:assert/strict';
import { successfulRun, requiredWorkflows } from './require-hosted-release-checks.mjs';
const sha = 'a'.repeat(40), path = 'check-production-build.yml';
const good = { id: 1, head_sha: sha, head_branch: 'main', event: 'push', path: `.github/workflows/${path}`, status: 'completed', conclusion: 'success' };
assert.equal(successfulRun([good], sha, path), true);
assert.equal(successfulRun([], sha, path), false);
for (const changed of [{ head_sha: 'b'.repeat(40) }, { head_branch: 'feature' }, { event: 'pull_request' }, { path: '.github/workflows/unrelated.yml' }, { status: 'in_progress' }, { conclusion: 'failure' }, { conclusion: 'skipped' }]) assert.equal(successfulRun([{ ...good, ...changed }], sha, path), false);
assert.equal(successfulRun([good, { ...good, id: 2, status: 'in_progress', conclusion: null }], sha, path), false);
console.log('Release check selection rejects missing, stale, wrong workflow/branch/event, failed and superseded runs');

assert(requiredWorkflows.includes('check-gelato-ordinary-release.yml'));
for (const path of requiredWorkflows) {
 const run={...good,path:'.github/workflows/'+path};
 assert.equal(successfulRun([run],sha,path),true);
 for (const status of [{status:'in_progress',conclusion:null},{status:'completed',conclusion:'failure'}]) assert.equal(successfulRun([{...run,...status}],sha,path),false);
}
