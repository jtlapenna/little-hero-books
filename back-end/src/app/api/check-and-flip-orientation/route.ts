import { NextRequest, NextResponse } from 'next/server';
import { getObject, putObject, R2_PUBLIC_BUCKET, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import sharp from 'sharp';

/**
 * Extract R2 key from URL
 * Handles both /api/assets/{key} and full URLs
 */
function extractR2Key(url: string): string | null {
  try {
    const urlObj = new URL(url, 'https://admin.littleherolabs.com');
    const pathname = urlObj.pathname;
    
    // Extract key from /api/assets/{key} pattern
    const match = pathname.match(/^\/api\/assets\/(.+)$/);
    if (match) {
      return match[1];
    }
    
    // If URL doesn't match pattern, return null
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
 * Auto-flip orientation webhook endpoint
 * POST /api/check-and-flip-orientation
 * 
 * Compares generated image with pose reference using Gemini API
 * Flips the image horizontally if orientations don't match
 */
export async function POST(request: NextRequest) {
  try {
    console.log('[Auto-Flip] Request received');
    
    // Parse request body
    const body = await request.json();
    const { imageUrl, poseRefUrl, characterHash, poseNumber } = body;
    
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
    
    // Call Gemini API to compare orientations
    console.log('[Auto-Flip] Calling Gemini API to compare orientations...');
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;
    
    const geminiRequestBody = {
      contents: [{
        role: 'user',
        parts: [
          {
            text: 'Are these two characters facing the same direction? Answer only: SAME or DIFFERENT'
          },
          {
            inlineData: {
              mimeType: imageMimeType,
              data: imageBase64
            }
          },
          {
            inlineData: {
              mimeType: poseRefMimeType,
              data: poseRefBase64
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0,
        topK: 1,
        topP: 0.6,
        maxOutputTokens: 10,
      }
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
    
    // Check for finish reason
    if (firstCandidate.finishReason && firstCandidate.finishReason !== 'STOP') {
      console.error('[Auto-Flip] Generation stopped:', firstCandidate.finishReason);
      return NextResponse.json(
        { success: false, error: `Generation stopped: ${firstCandidate.finishReason}` },
        { status: 400 }
      );
    }
    
    const textParts = firstCandidate.content?.parts || [];
    const textResponse = textParts
      .filter((p: any) => p.text)
      .map((p: any) => p.text)
      .join(' ')
      .trim()
      .toUpperCase();
    
    console.log('[Auto-Flip] Gemini response:', textResponse);
    
    // Check if orientations are different
    const needsFlip = textResponse.includes('DIFFERENT');
    
    if (!needsFlip) {
      console.log('[Auto-Flip] Orientations match, no flip needed');
      return NextResponse.json({
        success: true,
        flipped: false,
        imageUrl,
        message: 'Orientations match, no flip needed',
      });
    }
    
    // Flip the image horizontally using sharp
    console.log('[Auto-Flip] Flipping image horizontally...');
    let flippedBuffer: Buffer;
    try {
      flippedBuffer = await sharp(imageBuffer)
        .flop() // Horizontal flip
        .toBuffer();
      
      console.log('[Auto-Flip] Image flipped:', {
        originalSize: imageBuffer.length,
        flippedSize: flippedBuffer.length,
      });
    } catch (error: any) {
      console.error('[Auto-Flip] Error flipping image:', error);
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
    
    return NextResponse.json({
      success: true,
      flipped: true,
      imageUrl,
      message: 'Image was flipped and overwritten in R2',
    });
    
  } catch (error: any) {
    console.error('[Auto-Flip] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

