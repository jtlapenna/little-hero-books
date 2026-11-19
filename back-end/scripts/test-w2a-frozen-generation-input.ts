import assert from 'node:assert/strict';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { loadBundledBookConfig } from '../src/lib/books/load-book-config';
import { buildW2ABaseInputResponse } from '../src/app/api/internal/w2a/build-base-input/route';
import { buildW2APoseInputResponse } from '../src/app/api/internal/w2a/build-pose-input/route';
import { readOrderPoseContext } from '../src/lib/books/order-pose-context';
import { installW2AConfigFixture } from './helpers/w2a-config-fixture';

async function main() {
  const fixture = installW2AConfigFixture();
  try {
    const config = loadBundledBookConfig({ bookId: 'book-finding-our-inner-voice', version: 2 });
    for (const formatId of ['standard', 'amazon']) {
      const orderId = `SYNTHETIC-FROZEN-GENERATION-${formatId}`;
      const characterSpecs = {
        childName: 'W'.repeat(30), animalGuide: 'cat', hairStyle: 'side part',
        hairColor: 'black', skinTone: 'medium', pronouns: 'he/him', favoriteColor: 'blue',
      };
      const manifest = buildW0RunManifestFromConfig(config, {
        orderId, platform: formatId === 'amazon' ? 'amazon' : 'd2c', formatId,
        characterHash: `synthetic-${formatId}`, input: { characterSpecs, bookSpecs: { testMode: true } },
      });
      const renderSnapshot = manifest.book.resolved.renderSnapshot;
      assert.ok(renderSnapshot, 'Canonical W0 must produce a frozen render snapshot');
      const payload = {
        orderId, bookId: config.bookId, formatId, configVersion: 2, renderSnapshot,
        characterHash: `synthetic-${formatId}`, characterSpecs, poseNumber: 1,
        publicR2Url: 'https://assets.example.test', testMode: true,
      };
      const base = await buildW2ABaseInputResponse(payload);
      let claims = 0;
      const poseOptions = {
        instrumentPoseJob: async () => {
          claims++;
          return { workflowJobId: 1, workflowJobIdempotencyKey: `synthetic:${orderId}:pose1`,
            workflowJobStatus: 'running', workflowAttemptId: 1, workflowAttempt: 1,
            workflowClaimed: true, workflowReplay: null };
        },
      };
      const pose = await buildW2APoseInputResponse(payload, poseOptions);
      for (const result of [base, pose]) {
        assert.equal(result.bookId, config.bookId);
        assert.equal(result.formatId, formatId);
        assert.equal(result.configVersion, 2);
        assert.deepEqual(result.renderSnapshot, renderSnapshot);
        assert.ok(result.uploadKey.startsWith(`${config.bookId}/order-generated-assets/`));
      }
      assert.equal(claims, 1);
      assert.equal(fixture.attempts.length, 0, 'Frozen generation must not attempt a fetch');
      for (const [invalid, expected] of [
        [{ ...payload, configVersion: 1 }, /Render snapshot identity mismatch/],
        [{ ...payload, formatId: formatId === 'standard' ? 'amazon' : 'standard' }, /Render snapshot identity mismatch/],
        [{ ...payload, bookId: 'book-mvp-simple-adventure' }, /Render snapshot identity mismatch/],
        [{ ...payload, renderSnapshot: { ...renderSnapshot, schema: 'invalid' } }, /lhb\.book-render-snapshot@v1/],
      ] as const) {
        await assert.rejects(() => buildW2ABaseInputResponse(invalid), expected);
        await assert.rejects(() => buildW2APoseInputResponse(invalid, poseOptions), expected);
      }
      assert.equal(claims, 1, 'Invalid identity or snapshot must fail before job claim');
    }
    const variantRoot = `${config.bookId}/v9/characters/references/no-blush`;
    const configured = structuredClone(config);
    configured.version = 9;
    configured.assets.poses.skinToneVariantPaths = { 'medium-dark': variantRoot, deep: variantRoot };
    for (const [tone, noBlush] of [
      ['light', false], ['medium', false], ['tan', false],
      ['medium-dark', true], ['deep', true], ['skin-brown-light', true], ['brown-deep', true], ['skin_medium_dark', true],
    ] as const) {
      const orderId = `SYNTHETIC-POSE-TONE-${tone}`;
      const characterSpecs = { childName: 'Ari', animalGuide: 'cat', skinTone: tone };
      const manifest = buildW0RunManifestFromConfig(configured, {
        orderId, platform: 'amazon', formatId: 'amazon', characterHash: 'synthetic',
        input: { characterSpecs, bookSpecs: { testMode: true } },
      });
      const snapshot = manifest.book.resolved.renderSnapshot!;
      const manual = await readOrderPoseContext({bookId: configured.bookId, orderPrefix: `${configured.bookId}/orders/${orderId}`}, async () => manifest);
      const base = await buildW2ABaseInputResponse({orderId, bookId:configured.bookId, formatId:'amazon', configVersion:9,
        renderSnapshot:snapshot, characterHash:'synthetic', characterSpecs, testMode:true});
      assert.equal(base.userPromptText.includes('Do not add circular blush'), noBlush);
      for (const {poseNumber, referenceKey} of Object.values(configured.rendering.recipe!.poses)) {
        const pose = await buildW2APoseInputResponse({orderId, bookId:configured.bookId, formatId:'amazon', configVersion:9,
          renderSnapshot:snapshot, characterHash:'synthetic', characterSpecs, poseNumber, testMode:true}, {
          instrumentPoseJob: async () => ({
            workflowJobId: 1, workflowJobIdempotencyKey: `synthetic:${orderId}:pose${poseNumber}`,
            workflowJobStatus: 'running', workflowAttemptId: 1, workflowAttempt: 1,
            workflowClaimed: true, workflowReplay: null,
          }),
        });
        const expected = noBlush ? `${variantRoot}/pose${String(poseNumber).padStart(2,'0')}.png` : referenceKey;
        assert.equal(pose.poseRefKey, expected, `${tone} pose ${poseNumber}`);
        assert.equal(manual.referenceKeys[String(poseNumber)], expected);
        assert.equal(pose.userPromptText.includes('Do not add circular blush'), noBlush);
      }
    }
    assert.equal(fixture.attempts.length, 0);
    console.log('Frozen W0 to W2A base/pose: standard and amazon pass; all tone variants match admin and W2A; identity drift rejected before claim; no fetches');
  } finally {
    fixture.restore();
  }
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
