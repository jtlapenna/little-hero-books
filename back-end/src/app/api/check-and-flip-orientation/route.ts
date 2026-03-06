import { NextRequest, NextResponse } from 'next/server';
import { getObject, putObject } from '@/lib/r2-client';
import { detectImageFormat, ensurePngBuffer, flipPngHorizontally, type ImageFormat } from '@/lib/image-flip';
import { deterministicOrientationCheck } from '@/lib/orientation-check';
import { extractR2Key, getBucketFromKey } from '@/lib/r2-utils';
import { recordRequest } from './stats/route';

const FORMAT_TO_MIME: Record<ImageFormat, string> = {
  png: 'image/png',
  webp: 'image/webp',
  jpeg: 'image/jpeg',
  unknown: 'application/octet-stream',
};

type GeminiRequestPart = { text: string } | { inlineData: { mimeType: string; data: string } };
type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

function signatureHex(buf: Buffer, bytes = 8): string {
  return Buffer.from(buf.slice(0, Math.max(0, bytes))).toString('hex');
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Auto-Flip] Error downloading images:', error);
      return NextResponse.json(
        { success: false, error: `Failed to download images: ${message || 'Unknown error'}` },
        { status: 500 }
      );
    }
    
    // Convert to buffers and base64
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    const poseRefBuffer = Buffer.from(await poseRefResponse.arrayBuffer());
    
    // Detect actual image formats (may differ from R2 content-type header)
    const imageFormat = detectImageFormat(imageBuffer);
    const poseRefFormat = detectImageFormat(poseRefBuffer);
    const imageMimeType = FORMAT_TO_MIME[imageFormat];
    const poseRefMimeType = FORMAT_TO_MIME[poseRefFormat];
    
    console.log('[Auto-Flip] Images downloaded:', {
      imageSize: imageBuffer.length,
      poseRefSize: poseRefBuffer.length,
      imageFormat,
      poseRefFormat,
      imageMimeType,
      poseRefMimeType,
      r2ImageContentType: imageResponse.headers.get('content-type'),
      r2PoseRefContentType: poseRefResponse.headers.get('content-type'),
    });

    // Normalize both buffers to PNG so deterministic check + flip always work.
    // If input bytes are non-PNG, skip flip gracefully so W2A does not hard-fail.
    let imagePng: Buffer;
    let poseRefPng: Buffer;
    try {
      [imagePng, poseRefPng] = await Promise.all([
        ensurePngBuffer(imageBuffer, 'generated image'),
        ensurePngBuffer(poseRefBuffer, 'pose reference'),
      ]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[Auto-Flip] Failed to normalize images to PNG:', msg);
      if (msg.startsWith('UNSUPPORTED_IMAGE_FORMAT:')) {
        recordRequest(characterHash, poseNumber, false, true);
        return NextResponse.json({
          success: true,
          flipped: false,
          skipped: true,
          message: 'Skipped auto-flip: unsupported image format.',
          _debug: {
            reason: msg,
            imageFormat,
            poseRefFormat,
            imageSignature: signatureHex(imageBuffer),
            poseRefSignature: signatureHex(poseRefBuffer),
          },
        });
      }
      recordRequest(characterHash, poseNumber, false, false);
      return NextResponse.json({ success: false, error: `Image conversion failed: ${msg}` }, { status: 500 });
    }

    // ── Step 1: Deterministic silhouette check (fast, no API call) ──
    let detResult:
      | { needsFlip: boolean; confidence: number; refDiff: number; flippedDiff: number }
      | null = null;
    try {
      detResult = deterministicOrientationCheck(poseRefPng, imagePng);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[Auto-Flip] Deterministic check failed:', msg);
    }
    const detTag = detResult
      ? `refDiff=${detResult.refDiff}, flippedDiff=${detResult.flippedDiff}, conf=${detResult.confidence.toFixed(2)}`
      : 'inconclusive';
    console.log('[Auto-Flip] Deterministic check:', detTag, detResult ? `needsFlip=${detResult.needsFlip}` : '');

    // Pre-compute flipped image (needed by both Gemini comparison and the actual flip)
    let flippedCandidateBuffer: Buffer | null = null;
    try {
      flippedCandidateBuffer = await flipPngHorizontally(imagePng);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('[Auto-Flip] Failed to precompute flipped candidate:', message);
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

        // Use normalized PNG buffers for Gemini (guaranteed valid image data)
        const poseRefPngBase64 = poseRefPng.toString('base64');
        const imagePngBase64 = imagePng.toString('base64');
        const flippedCandidateBase64 = flippedCandidateBuffer ? flippedCandidateBuffer.toString('base64') : null;

        // Interleave labels with images so the model knows exactly which is which
        const parts: GeminiRequestPart[] = [
          { text: 'REFERENCE pose (this is the correct facing direction):' },
          { inlineData: { mimeType: 'image/png', data: poseRefPngBase64 } },
          { text: 'IMAGE A — the ORIGINAL generated character:' },
          { inlineData: { mimeType: 'image/png', data: imagePngBase64 } },
        ];
        if (flippedCandidateBase64) {
          parts.push(
            { text: 'IMAGE B — the same character FLIPPED horizontally:' },
            { inlineData: { mimeType: 'image/png', data: flippedCandidateBase64 } },
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
            const geminiData = (await geminiResponse.json()) as GeminiResponse;
            const candidates = geminiData.candidates || [];
            const rawText = (candidates[0]?.content?.parts || [])
              .filter((part) => typeof part.text === 'string' && part.text.trim())
              .map((part) => part.text)
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
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          console.error('[Auto-Flip] Gemini network error:', message);
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
        _debug: { decisionSource, deterministic: detTag, geminiRaw: geminiRawAnswer, imageFormat, poseRefFormat },
      });
    }
    
    // Flip the image using the same pattern as manual flip, but server-side.
    console.log('[Auto-Flip] Flipping image horizontally...');
    
    let flippedBuffer: Buffer;
    try {
      // Reuse candidate if we already computed it (PNG-normalized)
      flippedBuffer = flippedCandidateBuffer ?? (await flipPngHorizontally(imagePng));
      
      console.log('[Auto-Flip] Image flipped:', {
        originalSize: imageBuffer.length,
        flippedSize: flippedBuffer.length,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Auto-Flip] Error flipping image:', error);
      recordRequest(characterHash, poseNumber, false, false);
      return NextResponse.json(
        { success: false, error: `Failed to flip image: ${message || 'Unknown error'}` },
        { status: 500 }
      );
    }
    
    // Upload flipped image back to R2 (overwrites original)
    console.log('[Auto-Flip] Uploading flipped image to R2...');
    try {
      await putObject(imageBucket, imageKey, flippedBuffer, 'image/png');
      console.log('[Auto-Flip] Flipped image uploaded successfully');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Auto-Flip] Error uploading flipped image:', error);
      recordRequest(characterHash, poseNumber, false, false);
      return NextResponse.json(
        { success: false, error: `Failed to upload flipped image: ${message || 'Unknown error'}` },
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
      _debug: { decisionSource, deterministic: detTag, geminiRaw: geminiRawAnswer, imageFormat, poseRefFormat },
    });
    
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Auto-Flip] Unexpected error:', error);
    // Record error with available data
    recordRequest(characterHash, poseNumber, false, false);
    return NextResponse.json(
      { success: false, error: message || 'Internal server error' },
      { status: 500 }
    );
  }
}

