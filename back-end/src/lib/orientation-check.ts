import { decode } from 'fast-png';

export type OrientationCheckResult = {
  needsFlip: boolean;
  confidence: number;
  refDiff: number;
  flippedDiff: number;
};

type DecodedPng = {
  width: number;
  height: number;
  data: Uint8Array;
  channels: number;
};

type Rgb = { r: number; g: number; b: number };

// Estimate the background from image corners so the silhouette can be compared robustly.
function inferBackground(decoded: DecodedPng): Rgb {
  const { width, height, data, channels } = decoded;
  const bytesPerPixel = channels;
  const corner = (x: number, y: number) => {
    const offset = (y * width + x) * bytesPerPixel;
    const r = data[offset];
    const g = channels >= 3 ? data[offset + 1] : r;
    const b = channels >= 3 ? data[offset + 2] : r;
    return { r, g, b };
  };
  const c1 = corner(0, 0);
  const c2 = corner(width - 1, 0);
  const c3 = corner(0, height - 1);
  const c4 = corner(width - 1, height - 1);
  return {
    r: (c1.r + c2.r + c3.r + c4.r) / 4,
    g: (c1.g + c2.g + c3.g + c4.g) / 4,
    b: (c1.b + c2.b + c3.b + c4.b) / 4,
  };
}

function isForegroundAt(decoded: DecodedPng, bg: Rgb, x: number, y: number): boolean {
  const { width, data, channels } = decoded;
  const bytesPerPixel = channels;
  const offset = (y * width + x) * bytesPerPixel;
  const alpha = channels === 4 ? data[offset + 3] : channels === 2 ? data[offset + 1] : 255;
  if (alpha <= 128) return false;
  const r = data[offset];
  const g = channels >= 3 ? data[offset + 1] : r;
  const b = channels >= 3 ? data[offset + 2] : r;
  return !(Math.abs(r - bg.r) <= 10 && Math.abs(g - bg.g) <= 10 && Math.abs(b - bg.b) <= 10);
}

export function deterministicOrientationCheck(
  refBuffer: Buffer,
  genBuffer: Buffer,
): OrientationCheckResult | null {
  const ref = decode(refBuffer);
  const gen = decode(genBuffer);
  const refBg = inferBackground(ref);
  const genBg = inferBackground(gen);
  const bboxGrid = 96;

  const findBbox = (img: DecodedPng, bg: Rgb) => {
    let minX = img.width;
    let minY = img.height;
    let maxX = -1;
    let maxY = -1;

    for (let gy = 0; gy < bboxGrid; gy++) {
      const y = Math.min(img.height - 1, Math.floor(((gy + 0.5) * img.height) / bboxGrid));
      for (let gx = 0; gx < bboxGrid; gx++) {
        const x = Math.min(img.width - 1, Math.floor(((gx + 0.5) * img.width) / bboxGrid));
        if (!isForegroundAt(img, bg, x, y)) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }

    if (maxX < 0 || maxY < 0) return null;
    return { minX, minY, maxX, maxY };
  };

  const refBbox = findBbox(ref, refBg);
  const genBbox = findBbox(gen, genBg);
  if (!refBbox || !genBbox) return null;

  const grid = 64;
  let diffOriginal = 0;
  let diffFlipped = 0;

  for (let gy = 0; gy < grid; gy++) {
    const refY = Math.min(
      ref.height - 1,
      Math.floor(refBbox.minY + ((gy + 0.5) * (refBbox.maxY - refBbox.minY + 1)) / grid),
    );
    const genY = Math.min(
      gen.height - 1,
      Math.floor(genBbox.minY + ((gy + 0.5) * (genBbox.maxY - genBbox.minY + 1)) / grid),
    );

    for (let gx = 0; gx < grid; gx++) {
      const refX = Math.min(
        ref.width - 1,
        Math.floor(refBbox.minX + ((gx + 0.5) * (refBbox.maxX - refBbox.minX + 1)) / grid),
      );
      const genX = Math.min(
        gen.width - 1,
        Math.floor(genBbox.minX + ((gx + 0.5) * (genBbox.maxX - genBbox.minX + 1)) / grid),
      );
      const genXFlipped = genBbox.minX + (genBbox.maxX - genX);
      const refFg = isForegroundAt(ref, refBg, refX, refY);
      const genFg = isForegroundAt(gen, genBg, genX, genY);
      const genFgFlipped = isForegroundAt(gen, genBg, genXFlipped, genY);
      if (refFg !== genFg) diffOriginal++;
      if (refFg !== genFgFlipped) diffFlipped++;
    }
  }

  const confidence = (Math.max(diffOriginal, diffFlipped) + 1) / (Math.min(diffOriginal, diffFlipped) + 1);
  return {
    needsFlip: diffFlipped < diffOriginal,
    confidence,
    refDiff: diffOriginal,
    flippedDiff: diffFlipped,
  };
}
