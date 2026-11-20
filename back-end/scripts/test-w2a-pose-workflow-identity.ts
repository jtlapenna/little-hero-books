import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import crypto from 'node:crypto';
import { runInNewContext } from 'node:vm';
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
  workflowClaimed: true, workflowAttemptId: 7, workflowAttempt: 1,
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
async function checkRightFacingPoses() {
  const qaWorkflow = JSON.parse(readFileSync(resolve(process.cwd(), '../docs/n8n-workflow-files/finals/w2A-SW2-Pose_and_Style_QA.json'), 'utf8'));
  const upload = JSON.parse(readFileSync(resolve(process.cwd(), '../docs/n8n-workflow-files/repo-centric/workflows/w2A-SW3-Upload.repo-centric.json'), 'utf8'));
  const uploadPolicy = upload.nodes.find((node: any) => node.name === 'Route SW3 Pre-Flip Policy').parameters.conditions.conditions[0].leftValue;
  const qaNodes = new Map<string, any>(qaWorkflow.nodes.map((node: any) => [node.name, node]));
  const binary = { pose: { mimeType: 'image/png', fileName: 'pose.png' }, generated: { mimeType: 'image/png', fileName: 'output.png' } };
  async function runQa(name: string, json: any, upstream?: any) {
    return runInNewContext(`(async () => {
${qaNodes.get(name).parameters.jsCode}
})()`, {
      $json: json, $binary: binary, $input: { item: { json, pairedItem: { item: 0 } } },
      $runIndex: 0, $itemIndex: 0,
      $items: (node: string) => node === 'Pose QA — Build Request1' && upstream ? [upstream] : [],
      helpers: { getBinaryDataBuffer: async () => Buffer.alloc(120) },
      require: (module: string) => { assert.equal(module, 'crypto'); return crypto; },
      console: { log() {}, warn() {}, error() {} }, Buffer, global: {},
    });
  }
  for (const [bookId, version, pose, required] of [
    ['book-finding-our-inner-voice', 12, 5, true],
    ['book-finding-our-inner-voice', 12, 11, true],
    ['book-finding-our-inner-voice', 12, 3, false],
    ['book-finding-our-inner-voice', 11, 5, false],
    ['book-finding-our-inner-voice', 11, 11, false],
    ['book-some-other-book', 12, 11, false],
  ] as const) {
    const input = { ...fixture(pose), bookId, configVersion: version, renderSnapshot: {
      schema: 'lhb.book-render-snapshot@v1', bookConfig: { bookId, version },
    } };
    const { after } = await path(input);
    const prompt = after.requestBody.contents[0].parts[0].text;
    assert.equal(prompt.includes('RIGHT EDGE of the image'), required);
    if (required) assert.match(prompt, pose === 5 ? /pupils directed to the right/ : /feet trail to the left/);
    const builder = await runQa('Pose QA — Build Request1', after);
    assert.equal(builder.json.requiresRightFacing === true, required);
    assert.equal(builder.json.qaRequestBody.systemInstruction.parts[0].text.includes('orientation_match'), required);

    for (const orientation of [true, false, undefined, 'true']) {
      const verdict = { pose_score: 0.99, single_subject: true, extra_limbs: false, bg_white: true,
        leakage_from_pose_ref: false, cropped: false, orientation_match: orientation };
      const response = { candidates: [{ content: { parts: [{ text: JSON.stringify(verdict) }] } }] };
      const dropped = await runQa('Drop QA Payload1', response, builder);
      const restored = await runQa('Restore Binaries After QA HTTP1', required ? dropped.json : response, builder);
      const parsed = await runQa('Parse QA Verdict1', restored.json);
      const derived = await runQa('Derive QA Pass1', parsed.json);
      const combined = await runQa('Combine QA Verdicts', { ...derived.json, styleQaPass: true });
      assert.equal(combined.json.qa.combined.pass, !required || orientation === true);
      if (required && orientation !== true) assert.ok(derived.json.qa.pose.reasons.includes(
        orientation === false ? 'wrong_pose_orientation' : 'pose_orientation_unverified'));
    }
    if (required) {
      const mock = await runQa('🧪 MOCK: HTTP: Pose QA (Gemini)', builder.json);
      const dropped = await runQa('Drop QA Payload1', mock.json, builder);
      const restored = await runQa('Restore Binaries After QA HTTP1', dropped.json, builder);
      const parsed = await runQa('Parse QA Verdict1', restored.json);
      assert.equal((await runQa('Derive QA Pass1', parsed.json)).json.qa.pose.pass, true);
    }
    // Feed the upload policy the approved pose and its immutable book snapshot.
    const trigger = { ...input, poseRefKey: 'fixture/v1/reference.png' };
    const doesPreFlip = runInNewContext(uploadPolicy.slice(3, -2), {
      $json: { poseNumber: pose },
      $: () => ({ first: () => ({ json: trigger }) }),
    });
    assert.equal(doesPreFlip, pose === 3 || (pose === 11 && !required));
  }
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
  await assert.rejects(() => path(produced), /no owned attempt/i);
  const ownedProduced = { ...produced, workflowClaimed:true, workflowAttemptId:7, workflowAttempt:1 };
  const producedPath = await path(ownedProduced);
  assert.equal(producedPath.after.poseNumber, 13);
  assert.equal(producedPath.after.poseRefKey, produced.poseRefKey);
  // The previously deployed resolver clamps to 12 without consulting backend metadata.
  // This demonstrates the incompatible rollout direction; it is not a safety gate.
  const oldWorkflowClamp = (n: number) => Math.max(0, Math.min(12, Math.floor(n)));
  assert.equal(oldWorkflowClamp(produced.poseNumber), 12);
  assert.equal(produced.poseRefKey.endsWith('/custom-run.png'), true);
  // A new workflow receiving an old backend response fails before the provider path.
  await assert.rejects(() => path({ ...ownedProduced, poseIdentityContract: undefined }), /identity contract/i);
  for (const bad of [{ poseNumber: 13.5 }, { poseNumber: '13.5' }, { currentPoseNumber: 12 }, { nextPoseNumber: 12 }]) {
    await assert.rejects(() => build(bad), /pose/i);
  }
  const w0 = buildW0RunManifestFromConfig(config, { orderId: 'FIXTURE-W2A', platform: 'd2c', formatId: 'standard', characterHash: 'abcdef123456', input: { characterSpecs: { childName: 'Ada' } } });
  const jobs = new Map<number, any>();
  const attempts = new Map<number, any>();
  let headCalls = 0;
  const repository: any = {
    enqueueWorkflowJob: async (i: any) => { const job = { order_id:i.orderId,book_id:i.bookId,stage:i.stage,job_type:i.jobType,logical_key:i.logicalKey,id: jobs.size + 1, status: 'queued', idempotency_key: i.idempotencyKey, attempt_count: 0, normalized_input_snapshot: i.normalizedInputSnapshot, result_snapshot: {} }; jobs.set(job.id, job); return job; },
    getWorkflowJobById: async (id: number) => jobs.get(id),
    getWorkflowJobByIdempotencyKey: async (key: string) => [...jobs.values()].find(j => j.idempotency_key === key),
    claimWorkflowJob: async (id: number, options:any) => { const job=jobs.get(id); job.status='claimed'; if(options.reserveAttemptCount)job.attempt_count++; if(options.normalizedInputSnapshot)job.normalized_input_snapshot=options.normalizedInputSnapshot; return job; },
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
  const actualClaimedPath=await path({...frozen,...claimed});
  assert.equal(actualClaimedPath.after.poseRefKey,frozen.poseRefKey);
  assert.equal(actualClaimedPath.after.poseNumber,13);
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
  await checkRightFacingPoses();
  console.log('W2A workflow pose identity and orientation passed');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
