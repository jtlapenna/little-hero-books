import { NextRequest, NextResponse } from 'next/server';
import { PNG } from 'pngjs';
import { getObject, putObject, R2_ORDERS_BUCKET, R2_PUBLIC_BUCKET } from '@/lib/r2-client';
import { buildManifestKey } from '@/lib/r2-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Same-origin check (matches regenerate-2b pattern)
function requireSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
  return (
    !origin ||
    (!!siteUrl && origin.includes(siteUrl)) ||
    (!!siteUrl && !!referer && referer.includes(siteUrl)) ||
    origin?.includes('littleherolabs.com') ||
    referer?.includes('littleherolabs.com')
  );
}

/** Default eye: positions (0–1), radius as fraction of min dimension, color */
const DEFAULTS_EYES = {
  leftEye: { x: 0.4, y: 0.28 },
  rightEye: { x: 0.6, y: 0.28 },
  radius: 0.045,
  color: '#f2e2bb',
};

/** Default teeth: center (0–1), rx/ry as fraction of width/height */
const DEFAULTS_TEETH = {
  center: { x: 0.5, y: 0.42 },
  rx: 0.08,
  ry: 0.04,
  color: '#FFFFFF',
};

interface Pos {
  x: number;
  y: number;
}

interface EyesOptions {
  leftEye?: Pos;
  rightEye?: Pos;
  radius?: number;
  leftRadius?: number;
  rightRadius?: number;
  color?: string;
  useSingleEllipse?: boolean;
}

interface TeethOptions {
  center?: Pos;
  rx?: number;
  ry?: number;
  color?: string;
}

async function readJsonSafe<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Invalid JSON in manifest');
  }
}

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }

  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

type ShapeFill =
  | { type: 'circle'; cx: number; cy: number; radius: number; color: { r: number; g: number; b: number } }
  | { type: 'ellipse'; cx: number; cy: number; rx: number; ry: number; color: { r: number; g: number; b: number } };

function buildFillShapes(
  width: number,
  height: number,
  eyesOptions: EyesOptions | null,
  teethOptions: TeethOptions | null
): ShapeFill[] {
  const shapes: ShapeFill[] = [];

  if (eyesOptions) {
    const defaultRadiusNorm = eyesOptions.radius ?? DEFAULTS_EYES.radius;
    const toPx = (rNorm: number) =>
      rNorm > 1 ? rNorm : Math.min(width, height) * rNorm;
    const leftRadiusNorm = eyesOptions.leftRadius ?? defaultRadiusNorm;
    const rightRadiusNorm = eyesOptions.rightRadius ?? defaultRadiusNorm;
    const leftRadiusPx = toPx(leftRadiusNorm);
    const rightRadiusPx = toPx(rightRadiusNorm);
    const color = parseHexColor(eyesOptions.color ?? DEFAULTS_EYES.color);

    if (eyesOptions.useSingleEllipse) {
      const left = eyesOptions.leftEye ?? DEFAULTS_EYES.leftEye;
      const right = eyesOptions.rightEye ?? DEFAULTS_EYES.rightEye;
      const radiusPx = (leftRadiusPx + rightRadiusPx) / 2;
      const cx = ((left.x + right.x) / 2) * width;
      const cy = ((left.y + right.y) / 2) * height;
      const rx = Math.max(radiusPx * 2, (Math.abs((right.x - left.x) * width) / 2) + radiusPx);
      const ry = radiusPx * 1.2;
      shapes.push({ type: 'ellipse', cx, cy, rx, ry, color });
    } else {
      const left = eyesOptions.leftEye ?? DEFAULTS_EYES.leftEye;
      const right = eyesOptions.rightEye ?? DEFAULTS_EYES.rightEye;
      const x1 = left.x * width;
      const y1 = left.y * height;
      const x2 = right.x * width;
      const y2 = right.y * height;
      shapes.push({ type: 'circle', cx: x1, cy: y1, radius: leftRadiusPx, color });
      shapes.push({ type: 'circle', cx: x2, cy: y2, radius: rightRadiusPx, color });
    }
  }

  if (teethOptions) {
    const c = teethOptions.center ?? DEFAULTS_TEETH.center;
    const rx = (teethOptions.rx ?? DEFAULTS_TEETH.rx) * width;
    const ry = (teethOptions.ry ?? DEFAULTS_TEETH.ry) * height;
    const color = parseHexColor(teethOptions.color ?? DEFAULTS_TEETH.color);
    const cx = c.x * width;
    const cy = c.y * height;
    shapes.push({ type: 'ellipse', cx, cy, rx, ry, color });
  }

  return shapes;
}

function pointInShape(x: number, y: number, shape: ShapeFill): boolean {
  if (shape.type === 'circle') {
    const dx = x - shape.cx;
    const dy = y - shape.cy;
    return (dx * dx) + (dy * dy) <= shape.radius * shape.radius;
  }

  const dx = (x - shape.cx) / shape.rx;
  const dy = (y - shape.cy) / shape.ry;
  return (dx * dx) + (dy * dy) <= 1;
}

function applyTransparencyFill(
  png: PNG,
  shapes: ShapeFill[],
  alphaThreshold = 8
): PNG {
  const output = new PNG({
    width: png.width,
    height: png.height,
    colorType: png.colorType,
    inputHasAlpha: true,
  });

  png.data.copy(output.data);

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const idx = (png.width * y + x) << 2;
      const alpha = png.data[idx + 3];

      if (alpha > alphaThreshold) {
        continue;
      }

      const shape = shapes.find((candidate) => pointInShape(x, y, candidate));
      if (!shape) {
        continue;
      }

      output.data[idx] = shape.color.r;
      output.data[idx + 1] = shape.color.g;
      output.data[idx + 2] = shape.color.b;
      output.data[idx + 3] = 255;
    }
  }

  return output;
}

/**
 * POST /api/admin/orders/[orderId]/fix-eye-transparency
 *
 * Fills transparent regions (eyes, teeth) caused by Bria BG-removal by compositing
 * a fill layer underneath the character image.
 *
 * Body (JSON):
 * - poseNumber: number (required)
 * - fixEyes?: boolean (default true if both false)
 * - fixTeeth?: boolean
 * - eyes?: EyesOptions (leftEye, rightEye, radius, color, useSingleEllipse)
 * - teeth?: TeethOptions (center, rx, ry, color)
 *
 * Defaults: eyes #f2e2bb, teeth #FFFFFF
 * Returns: { ok: true, r2Key, message }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  if (!requireSameOrigin(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', details: 'Request must be from same origin' },
      { status: 401 }
    );
  }

  const { orderId } = await params;
  if (!orderId) {
    return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
  }

  let body: {
    poseNumber?: number;
    fixEyes?: boolean;
    fixTeeth?: boolean;
    eyes?: EyesOptions;
    teeth?: TeethOptions;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const poseNumber = typeof body.poseNumber === 'number' ? body.poseNumber : null;
  if (poseNumber == null || poseNumber < 0) {
    return NextResponse.json(
      { error: 'poseNumber (number >= 0) is required' },
      { status: 400 }
    );
  }

  const fixEyes = body.fixEyes !== false;
  const fixTeeth = body.fixTeeth === true;
  if (!fixEyes && !fixTeeth) {
    return NextResponse.json(
      { error: 'At least one of fixEyes or fixTeeth must be true' },
      { status: 400 }
    );
  }

  const eyesOptions: EyesOptions | null = fixEyes ? (body.eyes ?? {}) : null;
  const teethOptions: TeethOptions | null = fixTeeth ? (body.teeth ?? {}) : null;

  try {
    // Load 2b manifest to get characterHash and bgRemovedKey
    const manifestKey = buildManifestKey(orderId, '2b');
    const manifestRes = await getObject(R2_ORDERS_BUCKET, manifestKey);
    const manifest = await readJsonSafe<{
      characterHash?: string;
      order?: { characterHash?: string };
      entries?: Array<{ poseNumber: number; bgRemovedKey?: string; bgRemovedFilename?: string }>;
    }>(manifestRes);

    const characterHash = manifest.characterHash ?? manifest.order?.characterHash;
    if (!characterHash) {
      return NextResponse.json(
        { error: 'characterHash not found in 2b manifest' },
        { status: 400 }
      );
    }

    const entry = manifest.entries?.find((e) => e.poseNumber === poseNumber);
    let r2Key = entry?.bgRemovedKey;

    if (!r2Key) {
      const poseNN = String(poseNumber).padStart(2, '0');
      r2Key = `book-mvp-simple-adventure/order-generated-assets/characters/${characterHash}/characters_${characterHash}_pose${poseNN}_nobg.png`;
    }

    // Strip retry suffix for canonical key (we overwrite the canonical file)
    const originalKey = r2Key
      .replace(/_r\d+\.png$/i, '.png')
      .replace(/_TRY\d+\.png$/i, '.png');

    const bucket = originalKey.includes('/characters/') ? R2_PUBLIC_BUCKET : R2_ORDERS_BUCKET;

    // Fetch image from R2 (try r2Key first, fallback to originalKey)
    let imageRes: Response;
    try {
      imageRes = await getObject(bucket, r2Key);
    } catch (e) {
      if (r2Key !== originalKey) {
        imageRes = await getObject(bucket, originalKey);
      } else {
        throw e;
      }
    }
    const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
    const png = PNG.sync.read(imageBuffer);
    const shapes = buildFillShapes(png.width, png.height, eyesOptions, teethOptions);
    const resultBuffer = PNG.sync.write(applyTransparencyFill(png, shapes));

    await putObject(bucket, originalKey, resultBuffer, 'image/png');

    // Update 2b manifest so entry points to canonical key (in case it had retry suffix)
    if (entry && r2Key !== originalKey) {
      entry.bgRemovedKey = originalKey;
      entry.bgRemovedFilename = `pose${String(poseNumber).padStart(2, '0')}-nobg.png`;
      const manifestKey = buildManifestKey(orderId, '2b');
      await putObject(
        R2_ORDERS_BUCKET,
        manifestKey,
        JSON.stringify(manifest, null, 2),
        'application/json'
      );
    }

    const fixed = [fixEyes && 'eyes', fixTeeth && 'teeth'].filter(Boolean).join(' + ');
    return NextResponse.json({
      ok: true,
      r2Key: originalKey,
      message: `Transparency fix (${fixed}) applied and saved to ${originalKey}`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[fix-transparency]', msg);
    return NextResponse.json(
      { error: 'Failed to fix transparency', details: msg, message: msg },
      { status: 500 }
    );
  }
}
