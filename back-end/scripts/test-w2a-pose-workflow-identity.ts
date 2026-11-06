import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildW2APoseInput } from '../src/lib/books/w2a-pose-input';
import { configuredBookFixture } from './configured-book-fixture';
import { claimAndStartW2APoseJob, attachWorkflowJobsToW2AWorkItems } from '../src/lib/workflow-jobs/w2a-pose-jobs';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { resolveW2APoseWorklistResponse } from '../src/app/api/internal/w2a/resolve-pose-worklist/route';
import { recordWorkflowJobEventResponse } from '../src/app/api/internal/workflow-jobs/log-event/route';
const workflow = JSON.parse(readFileSync(resolve(process.cwd(), '../docs/n8n-workflow-files/repo-centric/workflows/w2A-SW1-Pose_Generation.repo-centric.json'), 'utf8'));
const nodes = new Map<string, any>(workflow.nodes.map((node: any) => [node.name, node]));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function run(name: string, json: any, binary: any = {}, httpRequest?: (request: any) => Promise<any>) {
  const node = nodes.get(name);
  assert.ok(node?.parameters?.jsCode, `missing node ${name}`);
  const fn = new AsyncFunction('$json', '$binary', '$input', '$itemIndex', '$runIndex', '$items', 'console', 'Buffer', node.parameters.jsCode);
  return fn.call({ helpers: { getBinaryDataBuffer: async () => Buffer.from('image'), httpRequest } }, json, binary, { item: { pairedItem: { item: 0 } } }, 0, 0, () => [], {log() {}, error() {}}, Buffer);
}
function edge(a: string, b: string) {
  assert.ok(workflow.connections[a]?.main?.flat().some((e: any) => e.node === b), `${a} must connect to ${b}`);
}
for (const [a, b] of [
  ['Fetch Repo W2A Pose Input', 'Schema Check + Defaults1'],
  ['Schema Check + Defaults1', 'IF: Replay Ready?'],
  ['IF: Replay Ready?', 'Stamp Pose Index'],
  ['Restore Replay Fallback Context', 'Stamp Pose Index'],
  ['Stamp Pose Index', 'SW1 - Contract Assertions'],
  ['SW1 - Contract Assertions', 'Resolve Pose Ref (IMAGE P)'],
  ['Pin Keys (base & pose)', 'TESTING - Prepare Gemini (POSE)'],
]) edge(a, b);
const fixture = (n: number) => ({
  poseIdentityContract: 'configured-recipe@v1',
  renderSnapshot: { schema: 'lhb.book-render-snapshot@v1' },
  poseNumber: n, currentPoseNumber: n, poseNN: `pose${String(n).padStart(2, '0')}`,
  poseNNHyphen: `pose-${String(n).padStart(2, '0')}`,
  poseRefKey: `configured/pose${String(n).padStart(2, '0')}.png`,
  poseRefPublicUrl: `https://fixture.invalid/pose${String(n).padStart(2, '0')}.png`,
  baseCharacterKey: 'base.png', characterHash: 'abcd1234', userPromptText: 'fixture', uploadKey: 'out.png',
});
async function path(input: any) {
  let j = (await run('Schema Check + Defaults1', input)).json;
  j = (await run('Stamp Pose Index', j)).json;
  j = (await run('SW1 - Contract Assertions', j)).json;
  j = (await run('Resolve Pose Ref (IMAGE P)', j)).json;
  const before = j;
  j = (await run('TESTING - Prepare Gemini (POSE)', j, { pose: { mimeType: 'image/png' }, base: { mimeType: 'image/png' } })).json;
  return { before, after: j };
}
async function main() {
  const config = configuredBookFixture();
  const build = (extra: Record<string, unknown> = {}) => buildW2APoseInput({
    orderId: 'FIXTURE-W2A', bookId: config.bookId, characterHash: 'abcdef123456',
    poseNumber: 13, characterSpecs: { childName: 'Ada' }, ...extra,
  }, { loadConfig: async () => config });
  const produced = await build();
  assert.equal(produced.renderSnapshot, undefined);
  assert.equal(produced.poseIdentityContract, 'configured-recipe@v1');
  const producedPath = await path(produced);
  assert.equal(producedPath.after.poseNumber, 13);
  assert.equal(producedPath.after.poseRefKey, produced.poseRefKey);
  // The previously deployed resolver clamps to 12 without consulting backend metadata.
  // This demonstrates the incompatible rollout direction; it is not a safety gate.
  const oldWorkflowClamp = (n: number) => Math.max(0, Math.min(12, Math.floor(n)));
  assert.equal(oldWorkflowClamp(produced.poseNumber), 12);
  assert.equal(produced.poseRefKey.endsWith('/custom-run.png'), true);
  // A new workflow receiving an old backend response fails before the provider path.
  await assert.rejects(() => path({ ...produced, poseIdentityContract: undefined }), /identity contract/i);
  for (const bad of [{ poseNumber: 13.5 }, { poseNumber: '13.5' }, { currentPoseNumber: 12 }, { nextPoseNumber: 12 }]) {
    await assert.rejects(() => build(bad), /pose/i);
  }
  const w0 = buildW0RunManifestFromConfig(config, { orderId: 'FIXTURE-W2A', platform: 'd2c', formatId: 'standard', characterHash: 'abcdef123456', input: { characterSpecs: { childName: 'Ada' } } });
  const jobs = new Map<number, any>();
  const attempts = new Map<number, any>();
  let headCalls = 0;
  const repository: any = {
    enqueueWorkflowJob: async (i: any) => { const job = { id: jobs.size + 1, status: 'queued', idempotency_key: i.idempotencyKey, attempt_count: 0, normalized_input_snapshot: i.normalizedInputSnapshot, result_snapshot: {} }; jobs.set(job.id, job); return job; },
    getWorkflowJobById: async (id: number) => jobs.get(id),
    getWorkflowJobByIdempotencyKey: async (key: string) => [...jobs.values()].find(j => j.idempotency_key === key),
    claimWorkflowJob: async (id: number) => jobs.get(id),
    incrementWorkflowJobAttemptCount: async (id: number) => { const j = jobs.get(id); j.attempt_count++; return j; },
    createWorkflowJobAttempt: async (input: any) => {
      const attempt = { id: 7, job_id: input.jobId, attempt: input.attempt, status: input.status, worker_kind: 'n8n', lease_owner: null, started_at: '2026-01-01T00:00:00.000Z', ended_at: null, duration_ms: null, error_message: null, error_details: null, provider_request_id: null, provider_status_url: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' };
      attempts.set(attempt.id, attempt);
      return attempt;
    },
    markWorkflowJobRunning: async (id: number) => { const j = jobs.get(id); j.status = 'running'; return j; },
    appendWorkflowJobEvent: async () => null,
  };
  const key = `${config.bookId}/orders/FIXTURE-W2A/manifests/1-manifest.json`;
  const worklist = await resolveW2APoseWorklistResponse({ orderId: 'FIXTURE-W2A', bookId: config.bookId, formatId: 'standard', oneManifestUrl: key }, {
    downloadOneManifest: async () => w0,
    instrumentPoseWorkItems: p => attachWorkflowJobsToW2AWorkItems({ orderId: 'FIXTURE-W2A', bookId: config.bookId, workItems: p.poseWorklist }, repository),
  });
  const queued = worklist.poseWorklist.find(item => item.poseNumber === 13)!;
  const queuedJob = jobs.get(queued.workflowJobId!);
  assert.equal(queuedJob.normalized_input_snapshot.poseRefKey, null);
  const frozen = await buildW2APoseInput({ ...queued, characterHash: 'abcdef123456', characterSpecs: { childName: 'Ada' } }, { loadConfig: async () => { throw new Error('must use frozen config'); } });
  const claimed = await claimAndStartW2APoseJob({ ...frozen, workflowJobId: queued.workflowJobId }, {}, repository);
  assert.equal(claimed.workflowClaimed, true);
  const deps: any = { ...repository, getWorkflowJobAttemptById: async (id: number) => attempts.get(id) ?? null, finishWorkflowJobAttempt: async () => null,
    markWorkflowJobSucceeded: async (id: number, input: any) => { const j = jobs.get(id); j.status = 'succeeded'; j.result_snapshot = input.resultSnapshot; return j; } };
  await run('Log Workflow Job Complete', { ...frozen, ...claimed }, {}, async request => recordWorkflowJobEventResponse(request.body, deps));
  assert.equal(queuedJob.status, 'succeeded');
  const replay = () => claimAndStartW2APoseJob({ ...frozen, workflowJobId: queued.workflowJobId }, { replayArtifactExists: async () => { headCalls++; return true; } }, repository);
  await assert.rejects(replay, /replay is on hold/i);
  assert.equal(headCalls, 0);
  await assert.rejects(() => run('Prepare Replay Output', { ...frozen, workflowReplay: { uploadKey: frozen.uploadKey, poseRefKey: 'stale/reference.png' } }), /replay is on hold/i);
  queuedJob.result_snapshot.poseRefKey = 'stale/reference.png';
  await assert.rejects(replay, /replay is on hold/i);
  assert.equal(headCalls, 0);
  const legacyReplay = await run('Prepare Replay Output', { ...fixture(1), renderSnapshot: undefined, poseIdentityContract: 'legacy@v1', workflowReplay: { uploadKey: 'legacy/pose01.png', poseRefKey: 'legacy/ref.png' } });
  assert.equal(legacyReplay.json.poseRefKey, 'legacy/ref.png');
  for (const n of [0, 13, 99]) {
    const input = fixture(n), { before, after } = await path(input);
    assert.equal(before.poseNumber, n);
    assert.equal(after.poseNumber, n);
    assert.equal(after.currentPoseNumber, n);
    assert.equal(after.poseRefKey, input.poseRefKey);
    assert.equal(after.poseRefPublicUrl, input.poseRefPublicUrl);
    assert.equal(after.poseNN, input.poseNN);
  }
  for (const input of [
    { ...fixture(13), poseIdentityContract: undefined },
    { ...fixture(13), poseIdentityContract: 'legacy@v1' },
    { ...fixture(13), poseNumber: 13.5, currentPoseNumber: 13.5 },
    { ...fixture(13), currentPoseNumber: 12 },
    { ...fixture(13), nextPoseNumber: 12 },
    { ...fixture(13), __meta: { poseNumber: 12 } },
    { ...fixture(13), poseNN: 'pose12' },
    { ...fixture(13), poseNNHyphen: 'pose-12' },
    { ...fixture(13), poseNumber: '13' },
    { ...fixture(13), poseNumber: 100, currentPoseNumber: 100 },
  ]) await assert.rejects(() => path(input), /pose/i);
  const legacy = { ...fixture(13), renderSnapshot: undefined, poseIdentityContract: 'legacy@v1', poseNumber: 13, currentPoseNumber: 13 };
  const legacyResult = await path(legacy);
  assert.equal(legacyResult.after.poseNumber, 12);
  console.log('W2A workflow pose identity passed');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
