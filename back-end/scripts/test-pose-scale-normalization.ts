#!/usr/bin/env tsx

import {
  computePoseAnchorMetrics,
  computePoseScaleDiagnostics,
  shouldNormalizePoseScale,
} from '@/lib/pose-scale-normalization';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function approxEqual(actual: number, expected: number, tolerance = 0.000001): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

function main(): void {
  const sourceMetrics = computePoseAnchorMetrics(
    {
      top: 301,
      left: 100,
      right: 300,
      bottom: 900,
      height: 600,
      width: 201,
    },
    { width: 1000, height: 1000 },
  );

  assert(
    approxEqual(sourceMetrics.groundContactY, 0.9) &&
      approxEqual(sourceMetrics.centerlineX, 0.2) &&
      approxEqual(sourceMetrics.groundContactCenterX, 0.2) &&
      approxEqual(sourceMetrics.groundContactWidth, 0.201) &&
      approxEqual(sourceMetrics.headToFeetSpan, 0.6),
    'Expected anchor metric helper to expose normalized ground-contact, centerline, ground-contact width, and head-to-feet span values',
  );

  const diagnostics = computePoseScaleDiagnostics({
    sourceBox: {
      top: 301,
      bottom: 900,
      left: 100,
      right: 300,
      width: 201,
      height: 600,
    },
    referenceBox: {
      top: 151,
      bottom: 450,
      left: 50,
      right: 200,
      width: 151,
      height: 300,
    },
    sourceCanvas: { width: 1000, height: 1000 },
    referenceCanvas: { width: 500, height: 500 },
  });

  assert(
    approxEqual(diagnostics.scaleFactor, 1) &&
      approxEqual(diagnostics.verticalOffset, 0) &&
      approxEqual(diagnostics.horizontalOffset, 0.05) &&
      approxEqual(diagnostics.groundContactOffset, 0.05),
    'Expected diagnostics helper to preserve normalized scale and offset calculations while adding ground-contact diagnostics',
  );
  assert(
    approxEqual(diagnostics.sourceAnchorMetrics.groundContactY, 0.9) &&
      approxEqual(diagnostics.referenceAnchorMetrics.groundContactY, 0.9) &&
      approxEqual(diagnostics.referenceAnchorMetrics.centerlineX, 0.25) &&
      approxEqual(diagnostics.referenceAnchorMetrics.groundContactCenterX, 0.25) &&
      approxEqual(diagnostics.referenceAnchorMetrics.headToFeetSpan, 0.6),
    'Expected diagnostics helper to add source and reference anchor metrics without changing runtime normalization decisions',
  );
  assert(
    shouldNormalizePoseScale(diagnostics, 'default') === true,
    'Expected large anchor drift to trigger normalization in default mode',
  );

  const nearToleranceDiagnostics = computePoseScaleDiagnostics({
    sourceBox: {
      top: 216,
      bottom: 900,
      left: 104,
      right: 304,
      width: 201,
      height: 685,
    },
    referenceBox: {
      top: 200,
      bottom: 900,
      left: 100,
      right: 300,
      width: 201,
      height: 701,
    },
    sourceCanvas: { width: 1000, height: 1000 },
    referenceCanvas: { width: 1000, height: 1000 },
  });

  assert(
    shouldNormalizePoseScale(nearToleranceDiagnostics, 'default') === false,
    'Expected close-enough poses to skip normalization in default mode',
  );
  assert(
    shouldNormalizePoseScale(nearToleranceDiagnostics, 'strict') === true,
    'Expected the same close-enough poses to normalize in strict mode',
  );

  console.log('Pose scale normalization tests passed');
}

main();
