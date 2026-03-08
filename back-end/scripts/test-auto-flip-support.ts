#!/usr/bin/env npx tsx
import assert from 'node:assert/strict';
import { decode, encode } from 'fast-png';
import jpeg from 'jpeg-js';
import {
  AUTO_FLIP_CONFIDENCE_THRESHOLD,
  AUTO_FLIP_SUPPORTED_POSES,
  applyPreBriaFlipMetadata,
  buildCanonicalPoseKey,
  buildPoseReferenceKey,
  canonicalizePoseKey,
  clear2BEntryForReprocessing,
  findOrCreatePoseEntry,
  isIdempotentAutoFlipReplay,
  isNotFoundError,
  parseRendererFlipResult,
} from '../src/lib/auto-flip-pose';
import { deterministicOrientationCheck } from '../src/lib/orientation-check';
import {
  PoseAutoFlipFormatError,
  shouldAutoFlipPoseUpload,
  transformPoseUploadBuffer,
} from '../src/lib/pose-auto-flip';

// Verify canonical key stripping and fallback key construction.
function testKeyHelpers() {
  assert.equal(canonicalizePoseKey('foo/pose03_r2.png'), 'foo/pose03.png');
  assert.equal(canonicalizePoseKey('foo/pose03_TRY02.png'), 'foo/pose03.png');
  assert.equal(
    buildCanonicalPoseKey('abcd1234', 11),
    'book-mvp-simple-adventure/order-generated-assets/characters/abcd1234/poses/pose11.png',
  );
  assert.equal(buildPoseReferenceKey(3), 'book-mvp-simple-adventure/characters/poses/pose03.png');
}

// Verify manifest entry creation and idempotent replay detection.
function testEntryHelpers() {
  const manifest = { entries: [] as Array<{ poseNumber?: number; lastAutoFlipRequestId?: string | null }> };
  const entry = findOrCreatePoseEntry(manifest, 3);
  entry.lastAutoFlipRequestId = 'REQ-1';

  assert.equal(entry.poseNumber, 3);
  assert.equal(manifest.entries.length, 1);
  assert.equal(isIdempotentAutoFlipReplay(entry, 'REQ-1'), true);
  assert.equal(isIdempotentAutoFlipReplay(entry, 'REQ-2'), false);
}

// Verify a successful preBria flip stamps canonical metadata.
function testPreBriaFlipMetadata() {
  const entry: Record<string, unknown> = { poseNumber: 3, replacementCount: 1 };
  applyPreBriaFlipMetadata({
    entry,
    poseNumber: 3,
    canonicalKey: 'book-mvp-simple-adventure/order-generated-assets/characters/abcd1234/poses/pose03.png',
    publicR2Url: 'https://pub.example.r2.dev',
    replacedAt: '2026-03-06T00:00:00.000Z',
    requestId: 'REQ-2',
  });

  assert.equal(entry.approvedKey, 'book-mvp-simple-adventure/order-generated-assets/characters/abcd1234/poses/pose03.png');
  assert.equal(entry.approvedFilename, 'pose03.png');
  assert.equal(entry.publicUrl, 'https://pub.example.r2.dev/book-mvp-simple-adventure/order-generated-assets/characters/abcd1234/poses/pose03.png');
  assert.equal(entry.replacementCount, 2);
  assert.equal(entry.lastAutoFlipRequestId, 'REQ-2');
  assert.equal(entry.lastAutoFlipReason, null);
}

// Verify stale 2B fields are cleared after a 2A flip.
function test2BInvalidation() {
  const entry: Record<string, unknown> = {
    bgRemovedKey: 'old-key',
    bgRemovedFilename: 'old-file',
    bgRemovedImageUrl: 'old-url',
    bgRemovedPublicUrl: 'old-public-url',
    bgRemoved: true,
    bgRemovedStatus: 'completed',
    briaStatusUrl: 'bria-url',
    briaRequestId: 'bria-id',
    briaStatus: 'done',
  };

  clear2BEntryForReprocessing(entry);

  assert.equal(entry.bgRemovedKey, undefined);
  assert.equal(entry.bgRemovedFilename, undefined);
  assert.equal(entry.bgRemovedImageUrl, undefined);
  assert.equal(entry.bgRemovedPublicUrl, undefined);
  assert.equal(entry.bgRemoved, false);
  assert.equal(entry.briaStatusUrl, undefined);
  assert.equal(entry.briaRequestId, undefined);
  assert.equal(entry.briaStatus, undefined);
}

// Verify 404-like storage errors are classified for deterministic route responses.
function testMissingSourceClassification() {
  assert.equal(isNotFoundError('R2 getObject failed: 404 Not Found'), true);
  assert.equal(isNotFoundError('R2 getObject failed: 500 Internal Error'), false);
}

// Verify only the targeted poses are backend-managed.
function testSupportedPoses() {
  assert.equal(AUTO_FLIP_SUPPORTED_POSES.has(3), true);
  assert.equal(AUTO_FLIP_SUPPORTED_POSES.has(11), true);
  assert.equal(AUTO_FLIP_SUPPORTED_POSES.has(2), false);
  assert.equal(AUTO_FLIP_CONFIDENCE_THRESHOLD, 1.5);
}

function makePosePng(mirror = false): Buffer {
  const width = 32;
  const height = 32;
  const data = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
  }

  const bodyStartX = 10;
  const bodyEndX = 22;
  for (let y = 8; y < 26; y++) {
    for (let x = bodyStartX; x < bodyEndX; x++) {
      const i = (y * width + x) * 4;
      data[i] = 30;
      data[i + 1] = 30;
      data[i + 2] = 30;
      data[i + 3] = 255;
    }
  }

  const armStartX = mirror ? 20 : 4;
  const armEndX = mirror ? 28 : 12;
  for (let y = 12; y < 18; y++) {
    for (let x = armStartX; x < armEndX; x++) {
      const i = (y * width + x) * 4;
      data[i] = 30;
      data[i + 1] = 30;
      data[i + 2] = 30;
      data[i + 3] = 255;
    }
  }

  return Buffer.from(encode({ width, height, data, channels: 4, depth: 8 }));
}

// Verify the extracted deterministic helper distinguishes original vs mirrored silhouettes.
function testDeterministicOrientationCheck() {
  const reference = makePosePng(false);
  const original = makePosePng(false);
  const mirrored = makePosePng(true);

  const originalResult = deterministicOrientationCheck(reference, original);
  const mirroredResult = deterministicOrientationCheck(reference, mirrored);

  assert.ok(originalResult);
  assert.ok(mirroredResult);
  assert.equal(originalResult?.needsFlip, false);
  assert.equal(mirroredResult?.needsFlip, true);
}

// Verify renderer payload parsing used by the backend delegation path.
function testRendererFlipPayloadParser() {
  const sampleBuffer = Buffer.from('hello-image');
  const validPayload = {
    success: true,
    mimeType: 'image/png',
    flippedImageBase64: sampleBuffer.toString('base64'),
  };
  const parsedValid = parseRendererFlipResult(validPayload);
  assert.ok(parsedValid);
  assert.equal(parsedValid?.mimeType, 'image/png');
  assert.equal(parsedValid?.flippedImageBase64, sampleBuffer.toString('base64'));

  assert.equal(parseRendererFlipResult({ success: true, mimeType: 'image/png' }), null);
  assert.equal(parseRendererFlipResult({ success: false, flippedImageBase64: 'abc' }), null);
  assert.equal(parseRendererFlipResult(null), null);
}

async function testInlinePoseAutoFlipPolicy() {
  const source = makePosePng(false);
  const targeted = await transformPoseUploadBuffer({
    stage: 'preBria',
    poseNumber: 3,
    buffer: source,
  });
  const untargeted = await transformPoseUploadBuffer({
    stage: 'preBria',
    poseNumber: 2,
    buffer: source,
  });
  const postBria = await transformPoseUploadBuffer({
    stage: 'postBria',
    poseNumber: 11,
    buffer: source,
  });
  const decodedSource = decode(source);
  const jpegSource = Buffer.from(
    jpeg.encode(
      {
        data: Buffer.from(decodedSource.data),
        width: decodedSource.width,
        height: decodedSource.height,
      },
      90,
    ).data,
  );
  const targetedJpeg = await transformPoseUploadBuffer({
    stage: 'preBria',
    poseNumber: 11,
    buffer: jpegSource,
  });

  assert.equal(shouldAutoFlipPoseUpload('preBria', 3), true);
  assert.equal(shouldAutoFlipPoseUpload('preBria', 11), true);
  assert.equal(shouldAutoFlipPoseUpload('postBria', 3), false);
  assert.equal(targeted.flipped, true);
  assert.equal(targeted.format, 'png');
  assert.equal(targeted.contentType, 'image/png');
  assert.notDeepEqual(targeted.buffer, source);
  assert.equal(untargeted.flipped, false);
  assert.deepEqual(untargeted.buffer, source);
  assert.equal(postBria.flipped, false);
  assert.deepEqual(postBria.buffer, source);
  assert.equal(targetedJpeg.flipped, true);
  assert.equal(targetedJpeg.format, 'jpeg');
  assert.equal(targetedJpeg.contentType, 'image/png');

  await assert.rejects(
    () =>
      transformPoseUploadBuffer({
        stage: 'preBria',
        poseNumber: 3,
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      }),
    (error: unknown) => error instanceof PoseAutoFlipFormatError && error.format === 'unknown',
  );
}

async function main() {
  testKeyHelpers();
  testEntryHelpers();
  testPreBriaFlipMetadata();
  test2BInvalidation();
  testMissingSourceClassification();
  testSupportedPoses();
  testDeterministicOrientationCheck();
  testRendererFlipPayloadParser();
  await testInlinePoseAutoFlipPolicy();
  console.log('Auto-flip support helper checks passed.');
}

main();
