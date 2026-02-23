import { NextRequest, NextResponse } from 'next/server';
import { decode, encode } from 'fast-png';
import { getObject, putObject } from '@/lib/r2-client';
import { extractR2Key, getBucketFromKey } from '@/lib/r2-utils';
import { recordRequest } from './stats/route';

/**
 * Build a "background color" guess from the 4 corners.
 */
function inferBackground(decoded: { width: number; height: number; data: Uint8Array; channels: number }) {
  const { width, height, data, channels } = decoded;
  const bpp = channels;
  const corner = (x: number, y: number) => {
    const i = (y * width + x) * bpp;
    const r = data[i];
    const g = channels >= 3 ? data[i + 1] : r;
    const b = channels >= 3 ? data[i + 2] : r;
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

/**
 * Foreground mask: pixel is foreground if it's opaque and not background-colored.
 */
function isForegroundAt(
  decoded: { width: number; height: number; data: Uint8Array; channels: number },
  bg: { r: number; g: number; b: number },
  x: number,
  y: number,
): boolean {
  const { width, data, channels } = decoded;
  const bpp = channels;
  const i = (y * width + x) * bpp;
  const a = channels === 4 ? data[i + 3] : channels === 2 ? data[i + 1] : 255;
  if (a <= 128) return false;
  const r = data[i];
  const g = channels >= 3 ? data[i + 1] : r;
  const b = channels >= 3 ? data[i + 2] : r;
  return !(Math.abs(r - bg.r) <= 10 && Math.abs(g - bg.g) <= 10 && Math.abs(b - bg.b) <= 10);
}

/**
 * Deterministic orientation check: compare the silhouette mask of the generated
 * image to the reference, and also compare the reference to the horizontally
 * mirrored generated silhouette. Pick the better match.
 */
function deterministicOrientationCheck(
  refBuffer: Buffer,
  genBuffer: Buffer,
): { needsFlip: boolean; confidence: number; refDiff: number; flippedDiff: number } | null {
  const ref = decode(refBuffer);
  const gen = decode(genBuffer);
  const refBg = inferBackground(ref);
  const genBg = inferBackground(gen);

  const bboxGrid = 96;
  const findBbox = (
    img: { width: number; height: number; data: Uint8Array; channels: number },
    bg: { r: number; g: number; b: number },
  ) => {
    let minX = img.width,
      minY = img.height,
      maxX = -1,
      maxY = -1;
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
    const ry = Math.min(
      ref.height - 1,
      Math.floor(refBbox.minY + ((gy + 0.5) * (refBbox.maxY - refBbox.minY + 1)) / grid),
    );
    const gy2 = Math.min(
      gen.height - 1,
      Math.floor(genBbox.minY + ((gy + 0.5) * (genBbox.maxY - genBbox.minY + 1)) / grid),
    );
    for (let gx = 0; gx < grid; gx++) {
      const rx = Math.min(
        ref.width - 1,
        Math.floor(refBbox.minX + ((gx + 0.5) * (refBbox.maxX - refBbox.minX + 1)) / grid),
      );
      const gx2 = Math.min(
        gen.width - 1,
        Math.floor(genBbox.minX + ((gx + 0.5) * (genBbox.maxX - genBbox.minX + 1)) / grid),
      );
      const gx2Flipped = genBbox.minX + (genBbox.maxX - gx2);
      const refFg = isForegroundAt(ref, refBg, rx, ry);
      const genFg = isForegroundAt(gen, genBg, gx2, gy2);
      const genFgFlipped = isForegroundAt(gen, genBg, gx2Flipped, gy2);
      if (refFg !== genFg) diffOriginal++;
      if (refFg !== genFgFlipped) diffFlipped++;
    }
  }

  const confidence = (Math.max(diffOriginal, diffFlipped) + 1) / (Math.min(diffOriginal, diffFlipped) + 1);
  return { needsFlip: diffFlipped < diffOriginal, confidence, refDiff: diffOriginal, flippedDiff: diffFlipped };
}

/**
 * Flip PNG image horizontally using fast-png (fflate-based, Workers-compatible).
 * Avoids pngjs which uses Node zlib.Inflate — incompatible with Cloudflare Workers.
 */
async function flipPngHorizontally(imageBuffer: Buffer): Promise<Buffer> {
  const decoded = decode(imageBuffer);
  const { width, height, data, channels } = decoded;
  const bytesPerPixel = channels;
  const rowLength = width * bytesPerPixel;

  console.log(`[Auto-Flip] PNG parsed: ${width}x${height}, channels: ${channels}`);

  const flippedData = new Uint8Array(data.length);
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowLength;
    for (let x = 0; x < width; x++) {
      const srcOff = rowStart + x * bytesPerPixel;
      const tgtOff = rowStart + (width - 1 - x) * bytesPerPixel;
      for (let c = 0; c < bytesPerPixel; c++) {
        flippedData[tgtOff + c] = data[srcOff + c];
      }
    }
  }

  const out = encode({
    width,
    height,
    data: flippedData,
    depth: (decoded.depth as 8) ?? 8,
    channels,
  });
  console.log(`[Auto-Flip] Image flipped: ${imageBuffer.length} bytes → ${out.length} bytes`);
  return Buffer.from(out);
}


/**
 * Auto-flip orientation webhook endpoint
 * POST /api/check-and-flip-orientation
 * 
 * Compares generated image with pose reference using Gemini API
 * Flips the image horizontally if orientations don't match
 */
export async function POST(request: NextRequest) {
  let characterHash = 'unknown';
  let poseNumber = -1;
  
  try {
    console.log('[Auto-Flip] Request received');
    
    // Parse request body
    const body = await request.json();
    const { imageUrl, poseRefUrl } = body;
    characterHash = body.characterHash || 'unknown';
    poseNumber = body.poseNumber ?? -1;
    
    // Validation
    if (!imageUrl || typeof imageUrl !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid imageUrl' },
        { status: 400 }
      );
    }
    
    if (!poseRefUrl || typeof poseRefUrl !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid poseRefUrl' },
        { status: 400 }
      );
    }
    
    if (!characterHash || typeof characterHash !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid characterHash' },
        { status: 400 }
      );
    }
    
    if (typeof poseNumber !== 'number' || poseNumber < 0) {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid poseNumber' },
        { status: 400 }
      );
    }
    
    console.log('[Auto-Flip] Request validated:', {
      characterHash,
      poseNumber,
      imageUrl: imageUrl.substring(0, 80) + '...',
      poseRefUrl: poseRefUrl.substring(0, 80) + '...',
    });
    
    // Extract R2 keys from URLs
    const imageKey = extractR2Key(imageUrl);
    const poseRefKey = extractR2Key(poseRefUrl);
    
    if (!imageKey) {
      return NextResponse.json(
        { success: false, error: `Could not extract R2 key from imageUrl: ${imageUrl}` },
        { status: 400 }
      );
    }
    
    if (!poseRefKey) {
      return NextResponse.json(
        { success: false, error: `Could not extract R2 key from poseRefUrl: ${poseRefUrl}` },
        { status: 400 }
      );
    }
    
    console.log('[Auto-Flip] Extracted R2 keys:', {
      imageKey,
      poseRefKey,
    });
    
    // Determine buckets
    const imageBucket = getBucketFromKey(imageKey);
    const poseRefBucket = getBucketFromKey(poseRefKey);
    
    console.log('[Auto-Flip] Using buckets:', {
      imageBucket,
      poseRefBucket,
    });
    
    // Download both images from R2
    console.log('[Auto-Flip] Downloading images from R2...');
    let imageResponse: Response;
    let poseRefResponse: Response;
    
    try {
      imageResponse = await getObject(imageBucket, imageKey);
      poseRefResponse = await getObject(poseRefBucket, poseRefKey);
    } catch (error: any) {
      console.error('[Auto-Flip] Error downloading images:', error);
      return NextResponse.json(
        { success: false, error: `Failed to download images: ${error.message || 'Unknown error'}` },
        { status: 500 }
      );
    }
    
    // Convert to buffers and base64
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    const poseRefBuffer = Buffer.from(await poseRefResponse.arrayBuffer());
    
    const imageBase64 = imageBuffer.toString('base64');
    const poseRefBase64 = poseRefBuffer.toString('base64');
    
    const imageMimeType = imageResponse.headers.get('content-type') || 'image/png';
    const poseRefMimeType = poseRefResponse.headers.get('content-type') || 'image/png';
    
    console.log('[Auto-Flip] Images downloaded:', {
      imageSize: imageBuffer.length,
      poseRefSize: poseRefBuffer.length,
      imageMimeType,
      poseRefMimeType,
    });
    
    // ── Step 1: Deterministic silhouette check (fast, no API call) ──
    const detResult = deterministicOrientationCheck(poseRefBuffer, imageBuffer);
    const detTag = detResult
      ? `refDiff=${detResult.refDiff}, flippedDiff=${detResult.flippedDiff}, conf=${detResult.confidence.toFixed(2)}`
      : 'inconclusive';
    console.log('[Auto-Flip] Deterministic check:', detTag, detResult ? `needsFlip=${detResult.needsFlip}` : '');

    // Pre-compute flipped image (needed by both decision paths and the actual flip)
    let flippedCandidateBuffer: Buffer | null = null;
    try {
      flippedCandidateBuffer = await flipPngHorizontally(imageBuffer);
    } catch (e: any) {
      console.warn('[Auto-Flip] Failed to precompute flipped candidate:', e?.message ?? e);
    }

    let needsFlip: boolean;
    let decisionSource: string;
    let geminiRawAnswer: string | null = null;

    // Use deterministic result if confident enough (confidence > 1.5 means the distances differ by ≥50%)
    if (detResult && detResult.confidence > 1.5) {
      needsFlip = detResult.needsFlip;
      decisionSource = `deterministic (${detTag})`;
    } else {
      // ── Step 2: Gemini fallback with interleaved image labels ──
      const geminiApiKey = process.env.GOOGLE_GEMINI_API_KEY;
      if (!geminiApiKey) {
        // No API key — trust deterministic even at low confidence, or default to no-flip
        needsFlip = detResult?.needsFlip ?? false;
        decisionSource = detResult ? `deterministic-low-conf (${detTag})` : 'default-no-flip (no Gemini key)';
        console.warn('[Auto-Flip] Gemini API key not found; using fallback:', decisionSource);
      } else {
        console.log('[Auto-Flip] Calling Gemini API (deterministic was inconclusive)...');
        const geminiModel = process.env.GOOGLE_GEMINI_MODEL || 'gemini-2.5-flash';
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;

        const flippedCandidateBase64 = flippedCandidateBuffer ? flippedCandidateBuffer.toString('base64') : null;

        // Interleave labels with images so the model knows exactly which is which
        const parts: any[] = [
          { text: 'REFERENCE pose (this is the correct facing direction):' },
          { inlineData: { mimeType: poseRefMimeType, data: poseRefBase64 } },
          { text: 'IMAGE A — the ORIGINAL generated character:' },
          { inlineData: { mimeType: imageMimeType, data: imageBase64 } },
        ];
        if (flippedCandidateBase64) {
          parts.push(
            { text: 'IMAGE B — the same character FLIPPED horizontally:' },
            { inlineData: { mimeType: imageMimeType, data: flippedCandidateBase64 } },
          );
        }
        parts.push({
          text: 'Look at the direction the character\'s body and face are turned. Which generated image faces the same direction as the REFERENCE? Answer with a single word: ORIGINAL or FLIPPED',
        });

        const geminiRequestBody = {
          contents: [{ role: 'user', parts }],
          generationConfig: { temperature: 0, topK: 1, topP: 0.6, maxOutputTokens: 80 },
        };

        try {
          const geminiResponse = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiRequestBody),
          });

          if (!geminiResponse.ok) {
            const errorText = await geminiResponse.text();
            console.error('[Auto-Flip] Gemini API error:', geminiResponse.status, errorText.substring(0, 300));
            geminiRawAnswer = `ERROR ${geminiResponse.status}: ${errorText.substring(0, 200)}`;
            // Fall back to deterministic or no-flip
            needsFlip = detResult?.needsFlip ?? false;
            decisionSource = detResult ? `deterministic-fallback (${detTag})` : 'default-no-flip (Gemini error)';
          } else {
            const geminiData = await geminiResponse.json();
            const candidates = geminiData.candidates || [];
            const rawText = (candidates[0]?.content?.parts || [])
              .filter((p: any) => p.text)
              .map((p: any) => p.text)
              .join(' ')
              .trim();
            geminiRawAnswer = rawText;
            const upper = rawText.toUpperCase();
            console.log('[Auto-Flip] Gemini raw response:', rawText);

            const wantsFlipped = upper.includes('FLIPPED');
            const wantsOriginal = upper.includes('ORIGINAL');
            const wantsDifferent = upper.includes('DIFFERENT');
            const wantsSame = upper.includes('SAME');

            if (wantsFlipped || wantsOriginal || wantsDifferent || wantsSame) {
              needsFlip = (wantsFlipped && !wantsOriginal) || (wantsDifferent && !wantsSame);
              decisionSource = `gemini (${rawText})`;
            } else {
              // Gemini gave nonsense — fall back
              needsFlip = detResult?.needsFlip ?? false;
              decisionSource = detResult ? `deterministic-fallback (${detTag})` : 'default-no-flip (Gemini unusable)';
            }
          }
        } catch (error: any) {
          console.error('[Auto-Flip] Gemini network error:', error?.message);
          needsFlip = detResult?.needsFlip ?? false;
          decisionSource = detResult ? `deterministic-fallback (${detTag})` : 'default-no-flip (Gemini unreachable)';
        }
      }
    }

    console.log(`[Auto-Flip] Decision: needsFlip=${needsFlip}, source=${decisionSource}`);

    if (!needsFlip) {
      console.log('[Auto-Flip] Orientations match, no flip needed');
      recordRequest(characterHash, poseNumber, false, true);
      return NextResponse.json({
        success: true,
        flipped: false,
        imageUrl,
        message: 'Orientations match, no flip needed',
        _debug: { decisionSource, deterministic: detTag, geminiRaw: geminiRawAnswer },
      });
    }
    
    // Flip the image using the same pattern as manual flip, but server-side
    // We'll use a simple pixel manipulation approach that works in Workers
    console.log('[Auto-Flip] Flipping image horizontally using pixel manipulation...');
    
    let flippedBuffer: Buffer;
    try {
      // Reuse candidate if we already computed it
      flippedBuffer = flippedCandidateBuffer ?? (await flipPngHorizontally(imageBuffer));
      
      console.log('[Auto-Flip] Image flipped:', {
        originalSize: imageBuffer.length,
        flippedSize: flippedBuffer.length,
      });
    } catch (error: any) {
      console.error('[Auto-Flip] Error flipping image:', error);
      recordRequest(characterHash, poseNumber, false, false);
      return NextResponse.json(
        { success: false, error: `Failed to flip image: ${error.message || 'Unknown error'}` },
        { status: 500 }
      );
    }
    
    // Upload flipped image back to R2 (overwrites original)
    console.log('[Auto-Flip] Uploading flipped image to R2...');
    try {
      await putObject(imageBucket, imageKey, flippedBuffer, imageMimeType);
      console.log('[Auto-Flip] Flipped image uploaded successfully');
    } catch (error: any) {
      console.error('[Auto-Flip] Error uploading flipped image:', error);
      recordRequest(characterHash, poseNumber, false, false);
      return NextResponse.json(
        { success: false, error: `Failed to upload flipped image: ${error.message || 'Unknown error'}` },
        { status: 500 }
      );
    }
    
    // Log the flip for debugging
    console.log('[Auto-Flip] Flipped image:', {
      characterHash,
      poseNumber,
      r2Key: imageKey,
      bucket: imageBucket,
    });
    
    recordRequest(characterHash, poseNumber, true, true);
    
    return NextResponse.json({
      success: true,
      flipped: true,
      imageUrl,
      message: 'Image was flipped and overwritten in R2',
      _debug: { decisionSource, deterministic: detTag, geminiRaw: geminiRawAnswer },
    });
    
  } catch (error: any) {
    console.error('[Auto-Flip] Unexpected error:', error);
    // Record error with available data
    recordRequest(characterHash, poseNumber, false, false);
    return NextResponse.json(
      { success: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

