import { NextRequest, NextResponse } from 'next/server';
import { getObject, putObject } from '@/lib/r2-client';
import { extractR2Key, getBucketFromKey } from '@/lib/r2-utils';
import { PNG } from 'pngjs';
import { recordRequest } from './stats/route';

/**
 * Compute horizontal center of mass of opaque pixels, normalized to [0, 1].
 * Characters facing right tend toward >0.5; facing left toward <0.5.
 * Returns null if image has no opaque pixels.
 */
function horizontalCenterOfMass(imageBuffer: Buffer): number | null {
  const png = PNG.sync.read(imageBuffer);
  let sumX = 0;
  let opaqueCount = 0;

  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const alpha = png.data[(y * png.width + x) * 4 + 3];
      if (alpha > 128) {
        sumX += x;
        opaqueCount++;
      }
    }
  }

  if (opaqueCount === 0) return null;
  return sumX / opaqueCount / png.width;
}

/**
 * Deterministic orientation check: compare horizontal center-of-mass of the
 * generated image and the reference. If flipping the generated image brings
 * its center-of-mass closer to the reference, the image needs flipping.
 *
 * Returns { needsFlip, confidence, refCenter, genCenter } or null if inconclusive.
 * Confidence is the ratio of the larger distance to the smaller (>1 = decisive).
 */
function deterministicOrientationCheck(
  refBuffer: Buffer,
  genBuffer: Buffer,
): { needsFlip: boolean; confidence: number; refCenter: number; genCenter: number } | null {
  const refCenter = horizontalCenterOfMass(refBuffer);
  const genCenter = horizontalCenterOfMass(genBuffer);

  if (refCenter === null || genCenter === null) return null;

  const distOriginal = Math.abs(refCenter - genCenter);
  const distFlipped = Math.abs(refCenter - (1 - genCenter));

  // If both distances are very close, we can't decide deterministically
  const delta = Math.abs(distOriginal - distFlipped);
  if (delta < 0.01) return null; // inconclusive — defer to Gemini

  return {
    needsFlip: distFlipped < distOriginal,
    confidence: Math.max(distOriginal, distFlipped) / (Math.min(distOriginal, distFlipped) + 1e-6),
    refCenter,
    genCenter,
  };
}

/**
 * Flip PNG image horizontally using pngjs (pure JavaScript, works in Workers)
 * This is the same approach as manual flip, but server-side
 */
async function flipPngHorizontally(imageBuffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      // Parse PNG using pngjs
      const png = PNG.sync.read(imageBuffer);
      
      console.log(`[Auto-Flip] PNG parsed: ${png.width}x${png.height}, colorType: ${png.colorType}, alpha: ${png.alpha}`);
      
      // Determine bytes per pixel based on color type
      // PNG color types: 0=grayscale, 2=RGB, 3=indexed, 4=grayscale+alpha, 6=RGBA
      // pngjs always converts to RGBA format, so we can safely use 4 bytes per pixel
      const bytesPerPixel = 4; // pngjs always outputs RGBA
      const rowLength = png.width * bytesPerPixel;
      
      // Create new buffer for flipped image
      const flippedData = Buffer.alloc(png.data.length);
      
      // Flip each row horizontally
      for (let y = 0; y < png.height; y++) {
        const rowStart = y * rowLength;
        
        // Copy row in reverse order (flip horizontally)
        for (let x = 0; x < png.width; x++) {
          const sourcePixelStart = rowStart + (x * bytesPerPixel);
          const targetPixelStart = rowStart + ((png.width - 1 - x) * bytesPerPixel);
          
          // Copy RGBA values (pngjs always provides RGBA format)
          flippedData[targetPixelStart] = png.data[sourcePixelStart];         // R
          flippedData[targetPixelStart + 1] = png.data[sourcePixelStart + 1]; // G
          flippedData[targetPixelStart + 2] = png.data[sourcePixelStart + 2]; // B
          flippedData[targetPixelStart + 3] = png.data[sourcePixelStart + 3]; // A
        }
      }
      
      // Create new PNG with flipped data
      const flippedPng = new PNG({
        width: png.width,
        height: png.height,
        colorType: png.colorType,
        inputColorType: png.colorType,
        inputHasAlpha: png.alpha,
      });
      
      flippedPng.data = flippedData;
      
      // Pack PNG back to buffer
      const flippedBuffer = PNG.sync.write(flippedPng);
      
      console.log(`[Auto-Flip] Image flipped: ${imageBuffer.length} bytes → ${flippedBuffer.length} bytes`);
      
      resolve(flippedBuffer);
    } catch (error: any) {
      console.error('[Auto-Flip] Error flipping PNG:', error);
      reject(new Error(`Failed to flip PNG: ${error.message || 'Unknown error'}`));
    }
  });
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
      ? `refCenter=${detResult.refCenter.toFixed(3)}, genCenter=${detResult.genCenter.toFixed(3)}, conf=${detResult.confidence.toFixed(2)}`
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
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;

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

