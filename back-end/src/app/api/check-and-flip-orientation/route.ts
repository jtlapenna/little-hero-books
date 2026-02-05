import { NextRequest, NextResponse } from 'next/server';
import { getObject, putObject, R2_PUBLIC_BUCKET, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { PNG } from 'pngjs';
import { recordRequest } from './stats/route';

/**
 * Extract R2 key from URL
 * Handles: /api/assets/{key}, and public R2 URLs (https://pub-*.r2.dev/{key})
 */
function extractR2Key(url: string): string | null {
  try {
    const urlObj = new URL(url, 'https://admin.littleherolabs.com');
    const pathname = urlObj.pathname;
    const hostname = urlObj.hostname || '';

    // /api/assets/{key} (admin proxy)
    const apiMatch = pathname.match(/^\/api\/assets\/(.+)$/);
    if (apiMatch) return apiMatch[1];

    // Public R2 URL: https://pub-*.r2.dev/{key} → key is path without leading slash
    if (hostname.endsWith('.r2.dev') && pathname.startsWith('/') && pathname.length > 1) {
      return pathname.replace(/^\/+/, '');
    }

    return null;
  } catch (error) {
    console.error('[Auto-Flip] Error parsing URL:', url, error);
    return null;
  }
}

/**
 * Determine bucket from R2 key
 */
function getBucketFromKey(key: string): string {
  // Orders bucket: book-mvp-simple-adventure/orders/...
  // Public bucket: everything else
  const isOrderAsset = key.startsWith('book-mvp-simple-adventure/orders/');
  return isOrderAsset ? R2_ORDERS_BUCKET : R2_PUBLIC_BUCKET;
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
    
    // Check for Gemini API key
    const geminiApiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!geminiApiKey) {
      console.error('[Auto-Flip] Gemini API key not found');
      return NextResponse.json(
        { success: false, error: 'Gemini API key not configured' },
        { status: 500 }
      );
    }
    
    // Build a more robust decision: compare ORIGINAL vs FLIPPED against the reference.
    // Style differences can fool "SAME/DIFFERENT", so we ask which option matches the reference direction.
    let flippedCandidateBuffer: Buffer | null = null;
    try {
      flippedCandidateBuffer = await flipPngHorizontally(imageBuffer);
    } catch (e: any) {
      console.warn('[Auto-Flip] Failed to precompute flipped candidate; falling back to SAME/DIFFERENT style check', e?.message ?? e);
    }

    const flippedCandidateBase64 = flippedCandidateBuffer ? flippedCandidateBuffer.toString('base64') : null;

    // Call Gemini API to compare orientations
    console.log('[Auto-Flip] Calling Gemini API to compare orientations...');
    // Flash Lite: simple image classification; lower cost/latency than 2.5-flash
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiApiKey}`;

    const parts: any[] = [
      {
        text: [
          'Reference is the correct pose orientation.',
          'Image A is the GENERATED image (ORIGINAL).',
          'Image B is the GENERATED image flipped horizontally (FLIPPED).',
          '',
          'Which one matches the REFERENCE facing direction?',
          'Answer ONLY: ORIGINAL or FLIPPED',
        ].join('\n'),
      },
      { inlineData: { mimeType: poseRefMimeType, data: poseRefBase64 } }, // Reference first
      { inlineData: { mimeType: imageMimeType, data: imageBase64 } }, // ORIGINAL
    ];
    if (flippedCandidateBase64) {
      parts.push({ inlineData: { mimeType: imageMimeType, data: flippedCandidateBase64 } }); // FLIPPED
    }

    const geminiRequestBody = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0,
        topK: 1,
        topP: 0.6,
        maxOutputTokens: 80,
      },
    };
    
    let geminiResponse: Response;
    try {
      geminiResponse = await fetch(geminiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(geminiRequestBody),
      });
      
      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
        console.error('[Auto-Flip] Gemini API error:', {
          status: geminiResponse.status,
          statusText: geminiResponse.statusText,
          body: errorText.substring(0, 500),
        });
        return NextResponse.json(
          { success: false, error: `Gemini API error: ${geminiResponse.status} ${geminiResponse.statusText}` },
          { status: geminiResponse.status }
        );
      }
    } catch (error: any) {
      console.error('[Auto-Flip] Network error calling Gemini API:', error);
      return NextResponse.json(
        { success: false, error: `Failed to call Gemini API: ${error.message || 'Unknown error'}` },
        { status: 500 }
      );
    }
    
    // Parse Gemini response
    const geminiData = await geminiResponse.json();
    const candidates = geminiData.candidates || [];
    
    if (candidates.length === 0) {
      // Check for safety ratings or blocked content
      const safetyRatings = geminiData.promptFeedback?.safetyRatings || [];
      const blocked = safetyRatings.some((rating: any) => rating.blocked === true);
      
      if (blocked) {
        const blockedReasons = safetyRatings
          .filter((rating: any) => rating.blocked)
          .map((rating: any) => `${rating.category}: ${rating.probability}`)
          .join(', ');
        
        console.error('[Auto-Flip] Content blocked by Gemini safety filters:', blockedReasons);
        return NextResponse.json(
          { success: false, error: 'Content was blocked by Gemini safety filters', details: blockedReasons },
          { status: 400 }
        );
      }
      
      console.error('[Auto-Flip] No candidates in Gemini response:', geminiData);
      return NextResponse.json(
        { success: false, error: 'No response from Gemini API', details: geminiData.error?.message || 'Unknown reason' },
        { status: 500 }
      );
    }
    
    const firstCandidate = candidates[0];
    const textParts = firstCandidate.content?.parts || [];
    const textResponse = textParts
      .filter((p: any) => p.text)
      .map((p: any) => p.text)
      .join(' ')
      .trim()
      .toUpperCase();

    // Fail on bad finish reason only if we don't have a usable answer (MAX_TOKENS can still contain SAME/DIFFERENT)
    const hasUsableAnswer = textResponse.includes('SAME') || textResponse.includes('DIFFERENT');
    if (firstCandidate.finishReason && firstCandidate.finishReason !== 'STOP' && !hasUsableAnswer) {
      console.error('[Auto-Flip] Generation stopped:', firstCandidate.finishReason);
      return NextResponse.json(
        { success: false, error: `Generation stopped: ${firstCandidate.finishReason}` },
        { status: 400 }
      );
    }
    if (firstCandidate.finishReason === 'MAX_TOKENS' && hasUsableAnswer) {
      console.log('[Auto-Flip] Used truncated response (MAX_TOKENS) — answer was present');
    }

    console.log('[Auto-Flip] Gemini response:', textResponse);
    
    // Decision: prefer explicit ORIGINAL/FLIPPED. Fallback: SAME/DIFFERENT (older prompt).
    const wantsFlipped = textResponse.includes('FLIPPED');
    const wantsOriginal = textResponse.includes('ORIGINAL');
    const needsFlip = wantsFlipped && !wantsOriginal;
    
    if (!needsFlip) {
      console.log('[Auto-Flip] Orientations match, no flip needed');
      recordRequest(characterHash, poseNumber, false, true);
      return NextResponse.json({
        success: true,
        flipped: false,
        imageUrl,
        message: 'Orientations match, no flip needed',
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

