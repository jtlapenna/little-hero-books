/** Require successful trusted main-branch runs for the exact upload SHA. No tokens in output. */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
export const requiredWorkflows = ['security-secrets.yml', 'check-application-access.yml', 'check-workflow-export-secrets.yml', 'check-production-build.yml'];
export function successfulRun(runs, sha, path) {
  const eligible = runs.filter(run => run.head_sha === sha && run.head_branch === 'main' &&
    ['push', 'workflow_dispatch'].includes(run.event) && run.path === `.github/workflows/${path}`);
  eligible.sort((a, b) => b.id - a.id);
  return eligible[0]?.status === 'completed' && eligible[0]?.conclusion === 'success';
}
export async function requireReleaseChecks(env = process.env, fetchImpl = fetch) {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (env.GITHUB_REPOSITORY !== 'jtlapenna/little-hero-books' || env.GITHUB_REF !== 'refs/heads/main' ||
      !/^[a-f0-9]{40}$/.test(sha) || env.GITHUB_SHA !== sha || env.REVIEWED_SOURCE_SHA !== sha || !env.GH_TOKEN) throw new Error('Upload requires the reviewed main commit');
  const mainResponse = await fetchImpl('https://api.github.com/repos/jtlapenna/little-hero-books/git/ref/heads/main', {
    headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json' }, redirect: 'error',
  });
  if (!mainResponse.ok || (await mainResponse.json()).object?.sha !== sha) throw new Error('Main moved after review');
  for (const path of requiredWorkflows) {
    const url = `https://api.github.com/repos/jtlapenna/little-hero-books/actions/workflows/${path}/runs?head_sha=${sha}&per_page=100`;
    const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, redirect: 'error' });
    if (!response.ok) throw new Error('Hosted check lookup unavailable');
    const body = await response.json();
    if (!Array.isArray(body.workflow_runs) || !successfulRun(body.workflow_runs, sha, path)) throw new Error(`Required exact-commit check is not successful: ${path}`);
  }
  console.log('All required hosted main-commit checks succeeded');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  requireReleaseChecks().catch(() => { console.error('Production upload blocked: reviewed main SHA and all required hosted checks must match and succeed.'); process.exitCode = 1; });
}
