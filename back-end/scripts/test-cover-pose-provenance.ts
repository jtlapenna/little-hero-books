import assert from 'node:assert/strict';
import { configuredBookFixture } from './configured-book-fixture';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { buildW3AssemblyInput } from '../src/lib/books/w3-assembly-input';
import { buildW3PreviewPlan } from '../src/lib/books/w3-preview-plan';
import { resolveW2APoseWorklistResponse } from '../src/app/api/internal/w2a/resolve-pose-worklist/route';
import { buildW2APoseInput } from '../src/lib/books/w2a-pose-input';
import { buildW2BPoseInput } from '../src/lib/books/w2b-pose-input';
import { buildBgRemovedPoseAssetKey, buildGeneratedPoseAssetKey } from '../src/lib/order-paths';

async function main() {
  const config = configuredBookFixture();
  for (const format of ['standard', 'amazon']) {
    const cover = config.rendering.recipe!.covers[format].layers[0];
    assert.equal(cover.kind, 'pose');
    if (cover.kind !== 'pose') throw new Error('Expected pose');
    cover.poseId = 'custom-breath';
    cover.poseNumber = 17;
  }
  const wrongCases: Array<() => Promise<unknown>> = [];
  for (const formatId of ['standard', 'amazon']) for (const child of ['a', 'b', 'c', 'd']) {
    const orderId = `COVER-${formatId}-${child}`;
    const characterHash = `child-${child}`;
    const specs = { childName: `Child ${child}`, animalGuide: 'owl' };
    const w0 = buildW0RunManifestFromConfig(config, { orderId, platform: 'd2c', formatId, characterHash, input: { characterSpecs: specs } });
    const worklist = await resolveW2APoseWorklistResponse({ orderId, bookId: config.bookId, formatId,
      oneManifestUrl: `${config.bookId}/orders/${orderId}/manifests/1-manifest.json` },
      { downloadOneManifest: async () => w0, instrumentPoseWorkItems: async response => response.poseWorklist });
    assert.equal(worklist.poseWorklist.filter(item => item.poseNumber === 17).length, 1);
    const poseInput = await buildW2APoseInput({ ...worklist.poseWorklist.find(item => item.poseNumber === 17)!, characterHash, characterSpecs: specs },
      { loadConfig: async () => { throw new Error('Unexpected config reload'); } });
    assert.equal(poseInput.poseRefKey, config.rendering.recipe!.poses['custom-breath'].referenceKey);
    const bgInput = buildW2BPoseInput({ orderId, bookId: config.bookId, characterHash, poseNumber: 17,
      approvedKey: poseInput.uploadKey, backendUrl: 'https://offline.invalid', testMode: true });
    assert.equal(bgInput.bgRemovedKey, buildBgRemovedPoseAssetKey(characterHash, 17, config.bookId));
    const manifest = { characterHash, order: { orderId, bookId: config.bookId }, entries: [13, 17, 18].map(poseNumber => ({
      poseNumber, bgRemovedKey: poseNumber === 17 ? bgInput.bgRemovedKey : buildBgRemovedPoseAssetKey(characterHash, poseNumber, config.bookId),
    })) };
    Object.assign(manifest.entries.find(entry => entry.poseNumber === 17)!, { sourceApprovedKey: poseInput.uploadKey });
    const run = (twoB: typeof manifest) => buildW3AssemblyInput({ orderId, bookId: config.bookId, formatId }, {
      loadManifest: async key => key.endsWith('1-manifest.json') ? w0 : key.endsWith('2b-manifest.json') ? twoB : null,
    });
    const result = await run(manifest);
    const noFrozenHash = buildW0RunManifestFromConfig(config, { orderId, platform: 'd2c', formatId, input: { characterSpecs: specs } });
    let hashlessNormalization = false;
    await assert.rejects(() => buildW3AssemblyInput({ orderId, bookId: config.bookId, formatId }, {
      loadManifest: async key => key.endsWith('1-manifest.json') ? noFrozenHash : key.endsWith('2b-manifest.json') ? manifest : null,
      normalizePoseScale: async () => { hashlessNormalization = true; throw new Error('Unexpected normalization'); },
    }), /frozen.*character|character.*frozen/i);
    assert.equal(hashlessNormalization, false);
    assert.equal(result.renderSnapshot?.bookConfig.rendering.recipe?.covers[formatId].layers[0].kind, 'pose');
    const preview = buildW3PreviewPlan({ ...result, characterSpecs: specs, backendUrl: 'https://offline.invalid' });
    assert.ok(preview.coverPreviewItem.coverHTML.includes(buildBgRemovedPoseAssetKey(characterHash, 17, config.bookId)));
    const withoutCover = structuredClone(manifest);
    withoutCover.entries = withoutCover.entries.filter(entry => entry.poseNumber !== 17);
    let missingNormalization = false;
    await assert.rejects(() => buildW3AssemblyInput({ orderId, bookId: config.bookId, formatId }, {
      loadManifest: async key => key.endsWith('1-manifest.json') ? w0 : key.endsWith('2b-manifest.json') ? withoutCover : null,
      normalizePoseScale: async () => { missingNormalization = true; throw new Error('Unexpected normalization'); },
    }), /required pose 17.*missing/i);
    assert.equal(missingNormalization, false, 'Reject missing cover pose before normalization');
    const wrong = structuredClone(manifest);
    wrong.entries.find(entry => entry.poseNumber === 17)!.bgRemovedKey = buildBgRemovedPoseAssetKey('wrong-child', 17, config.bookId);
    wrongCases.push(() => run(wrong));
    let normalized = false;
    await assert.rejects(() => buildW3AssemblyInput({ orderId, bookId: config.bookId, formatId }, {
      loadManifest: async key => key.endsWith('1-manifest.json') ? w0 : key.endsWith('2b-manifest.json') ? wrong : null,
      normalizePoseScale: async () => { normalized = true; throw new Error('Unexpected normalization'); },
    }), /character identity/i);
    assert.equal(normalized, false, 'Reject conflicting child before normalization');
    const wrongPose = structuredClone(manifest);
    wrongPose.entries.find(entry => entry.poseNumber === 17)!.bgRemovedKey = buildBgRemovedPoseAssetKey(characterHash, 13, config.bookId);
    await assert.rejects(() => run(wrongPose), /pose identity/i);
    const conflictingMetadata = structuredClone(manifest);
    conflictingMetadata.characterHash = 'wrong-child';
    await assert.rejects(() => run(conflictingMetadata), /character identity/i);
    const conflictingEntry = structuredClone(manifest);
    Object.assign(conflictingEntry.entries.find(entry => entry.poseNumber === 17)!, { characterHash: 'wrong-child' });
    let normalizationAttempted = false;
    await assert.rejects(() => buildW3AssemblyInput({ orderId, bookId: config.bookId, formatId }, {
      loadManifest: async key => key.endsWith('1-manifest.json') ? w0 : key.endsWith('2b-manifest.json') ? conflictingEntry : null,
      normalizePoseScale: async () => { normalizationAttempted = true; throw new Error('Unexpected normalization'); },
    }), /character identity/i);
    assert.equal(normalizationAttempted, false, 'Reject conflicting entry identity before normalization');
    for (const field of ['approvedKey', 'sourceApprovedKey']) {
      const mismatched = structuredClone(manifest);
      Object.assign(mismatched.entries.find(entry => entry.poseNumber === 17)!, {
        [field]: buildGeneratedPoseAssetKey(characterHash, 13, config.bookId),
      });
      await assert.rejects(() => run(mismatched), /pose identity/i, `${field} must match pose number`);
      const retry = structuredClone(manifest);
      Object.assign(retry.entries.find(entry => entry.poseNumber === 17)!, {
        [field]: buildGeneratedPoseAssetKey(characterHash, 17, config.bookId).replace('.png', '_r2.png'),
      });
      await run(retry);
    }
    const unusual = structuredClone(manifest);
    unusual.entries.find(entry => entry.poseNumber === 17)!.bgRemovedKey = 'legacy/unverified-artwork.png';
    let unknownNormalization = false;
    await assert.rejects(() => buildW3AssemblyInput({ orderId, bookId: config.bookId, formatId }, {
      loadManifest: async key => key.endsWith('1-manifest.json') ? w0 : key.endsWith('2b-manifest.json') ? unusual : null,
      normalizePoseScale: async () => { unknownNormalization = true; throw new Error('Unexpected normalization'); },
    }), /unverified|canonical|identity/i);
    assert.equal(unknownNormalization, false, 'Reject later unverified asset before normalizing earlier assets');
    const duplicate = structuredClone(manifest);
    duplicate.entries.push(structuredClone(duplicate.entries[1]));
    let duplicateNormalization = false;
    await assert.rejects(() => buildW3AssemblyInput({ orderId, bookId: config.bookId, formatId }, {
      loadManifest: async key => key.endsWith('1-manifest.json') ? w0 : key.endsWith('2b-manifest.json') ? duplicate : null,
      normalizePoseScale: async () => { duplicateNormalization = true; throw new Error('Unexpected normalization'); },
    }), /duplicate/i);
    assert.equal(duplicateNormalization, false);
  }
  for (const wrong of wrongCases) await assert.rejects(wrong, /character|identity|provenance/i, 'Wrong child pose must not be used for the cover');
  console.log('Cover pose provenance checks passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
