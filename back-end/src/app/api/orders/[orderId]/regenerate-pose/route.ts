import { NextRequest, NextResponse } from 'next/server';
import { getObject, putObject, R2_ORDERS_BUCKET, R2_PUBLIC_BUCKET } from '@/lib/r2-client';
import { buildManifestKey } from '@/lib/r2-service';

// Helper to parse JSON safely
async function readJsonSafe<T = any>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON in manifest');
  }
}

/**
 * Regenerate a pose image using Gemini Flash 2.5
 * POST /api/orders/[orderId]/regenerate-pose
 * 
 * Body (JSON):
 * - poseNumber: number (required)
 * - revisionPrompt: string (required)
 * - includeBaseCharacter?: boolean (default: false for subsequent revisions, true for first)
 * - includePoseReference?: boolean (default: false for subsequent revisions, true for first)
 * - includePreviousOption?: boolean (default: true for subsequent revisions, false for first)
 * - previousOptionR2Key?: string (required if includePreviousOption is true)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    console.log('[Regenerate Pose API] Request received');
    const { orderId } = await params;
    console.log('[Regenerate Pose API] OrderId:', orderId);

    if (!orderId) {
      console.error('[Regenerate Pose API] Missing orderId');
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
    }

    // Parse request body
    const body = await request.json();
    const {
      poseNumber,
      revisionPrompt,
      includeBaseCharacter,
      includePoseReference,
      includePreviousOption,
      previousOptionR2Key,
    } = body;

    // Validation
    if (typeof poseNumber !== 'number' || poseNumber < 0 || poseNumber > 12) {
      return NextResponse.json(
        { error: 'Invalid poseNumber: must be a number between 0 and 12' },
        { status: 400 }
      );
    }

    if (!revisionPrompt || typeof revisionPrompt !== 'string' || !revisionPrompt.trim()) {
      return NextResponse.json(
        { error: 'Missing or invalid revisionPrompt' },
        { status: 400 }
      );
    }

    // Validate image selection
    const hasBaseCharacter = includeBaseCharacter === true;
    const hasPoseReference = includePoseReference === true;
    const hasPreviousOption = includePreviousOption === true;

    if (!hasBaseCharacter && !hasPoseReference && !hasPreviousOption) {
      return NextResponse.json(
        { error: 'At least one image must be selected (includeBaseCharacter, includePoseReference, or includePreviousOption)' },
        { status: 400 }
      );
    }

    if (hasPreviousOption && !previousOptionR2Key) {
      return NextResponse.json(
        { error: 'previousOptionR2Key is required when includePreviousOption is true' },
        { status: 400 }
      );
    }

    // Format pose number for use throughout the function
    const poseNN = String(poseNumber).padStart(2, '0');
    const poseKey = `pose${poseNN}`;

    // Load manifest (2a-manifest.json)
    const manifestKey = buildManifestKey(orderId, '2a');
    console.log(`[Regenerate Pose API] Loading manifest: ${manifestKey}`);

    let manifest: any;
    try {
      const manifestRes = await getObject(R2_ORDERS_BUCKET, manifestKey);
      manifest = await readJsonSafe<any>(manifestRes);
    } catch (error: any) {
      if (error.message?.includes('404') || error.message?.includes('Not Found')) {
        return NextResponse.json(
          { error: 'Manifest not found. Workflow 2A may not have completed yet.' },
          { status: 404 }
        );
      }
      throw error;
    }

    // Rate limiting: Check revisions in the last hour (both pending and history)
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    
    // Initialize revisions tracking if not present
    if (!manifest.revisions) {
      manifest.revisions = {};
    }
    if (!manifest.revisions.history) {
      manifest.revisions.history = [];
    }
    if (!manifest.revisions.pending) {
      manifest.revisions.pending = {};
    }

    // Helper to check if revision is within last hour
    const isWithinLastHour = (rev: any) => {
      const requestedAt = new Date(rev.requestedAt || rev.completedAt || 0).getTime();
      return requestedAt > oneHourAgo;
    };

    // Count revisions for this pose in the last hour (from history)
    const poseRevisionsFromHistory = manifest.revisions.history.filter((rev: any) => {
      if (rev.poseNumber !== poseNumber) return false;
      return isWithinLastHour(rev);
    }).length;

    // Count revisions for this pose in the last hour (from pending - exclude current pose if it exists)
    const currentPendingRevision = manifest.revisions.pending[poseKey];
    const poseRevisionsFromPending = currentPendingRevision && isWithinLastHour(currentPendingRevision) ? 1 : 0;

    const poseRevisionsInLastHour = poseRevisionsFromHistory + poseRevisionsFromPending;

    // Count total revisions for this order in the last hour (from history)
    const orderRevisionsFromHistory = manifest.revisions.history.filter((rev: any) => {
      return isWithinLastHour(rev);
    }).length;

    // Count total revisions for this order in the last hour (from pending)
    const orderRevisionsFromPending = Object.values(manifest.revisions.pending).filter((rev: any) => {
      return isWithinLastHour(rev);
    }).length;

    const orderRevisionsInLastHour = orderRevisionsFromHistory + orderRevisionsFromPending;

    // Check rate limits
    const MAX_REVISIONS_PER_POSE_PER_HOUR = 5;
    const MAX_REVISIONS_PER_ORDER_PER_HOUR = 20;

    if (poseRevisionsInLastHour >= MAX_REVISIONS_PER_POSE_PER_HOUR) {
      return NextResponse.json(
        { 
          error: `Rate limit exceeded: Maximum ${MAX_REVISIONS_PER_POSE_PER_HOUR} revisions per pose per hour. Please try again later.`,
          rateLimitExceeded: true,
          retryAfter: Math.ceil((oneHourAgo + (60 * 60 * 1000) - now) / 1000), // seconds until oldest request expires
        },
        { status: 429 }
      );
    }

    if (orderRevisionsInLastHour >= MAX_REVISIONS_PER_ORDER_PER_HOUR) {
      return NextResponse.json(
        { 
          error: `Rate limit exceeded: Maximum ${MAX_REVISIONS_PER_ORDER_PER_HOUR} revisions per order per hour. Please try again later.`,
          rateLimitExceeded: true,
          retryAfter: Math.ceil((oneHourAgo + (60 * 60 * 1000) - now) / 1000), // seconds until oldest request expires
        },
        { status: 429 }
      );
    }

    if (!manifest || !manifest.entries || !Array.isArray(manifest.entries)) {
      return NextResponse.json(
        { error: 'Invalid manifest structure: missing entries array' },
        { status: 400 }
      );
    }

    // Find the entry for this pose
    const entry = manifest.entries.find((e: any) => e.poseNumber === poseNumber);
    if (!entry) {
      return NextResponse.json(
        { error: `Pose ${poseNumber} not found in manifest entries` },
        { status: 404 }
      );
    }

    // Extract character hash and pose reference key
    const characterHash = manifest.characterHash || manifest.order?.characterHash;
    if (!characterHash) {
      return NextResponse.json(
        { error: 'Character hash not found in manifest' },
        { status: 400 }
      );
    }

    // Get pose reference key (static template)
    const poseRefKey = `book-mvp-simple-adventure/characters/poses/pose${poseNN}.png`;

    // Get base character key
    const baseCharacterKey = `book-mvp-simple-adventure/order-generated-assets/characters/${characterHash}/base-character.png`;

    // Fetch images from R2 based on user selection
    const imagesToFetch: Array<{ key: string; bucket: string; type: 'base' | 'pose' | 'previous' }> = [];

    if (hasBaseCharacter) {
      imagesToFetch.push({ key: baseCharacterKey, bucket: R2_PUBLIC_BUCKET, type: 'base' });
    }

    if (hasPoseReference) {
      imagesToFetch.push({ key: poseRefKey, bucket: R2_PUBLIC_BUCKET, type: 'pose' });
    }

    if (hasPreviousOption && previousOptionR2Key) {
      imagesToFetch.push({ key: previousOptionR2Key, bucket: R2_ORDERS_BUCKET, type: 'previous' });
    }

    console.log(`[Regenerate Pose API] Fetching ${imagesToFetch.length} images from R2`);

    // Fetch all images and convert to base64
    const imageData: Array<{ type: 'base' | 'pose' | 'previous'; base64: string; mimeType: string }> = [];

    for (const img of imagesToFetch) {
      try {
        const imageRes = await getObject(img.bucket, img.key);
        const imageBuffer = await imageRes.arrayBuffer();
        const base64 = Buffer.from(imageBuffer).toString('base64');
        const mimeType = imageRes.headers.get('content-type') || 'image/png';
        imageData.push({ type: img.type, base64, mimeType });
        console.log(`[Regenerate Pose API] Fetched ${img.type} image: ${img.key.substring(0, 60)}...`);
      } catch (error: any) {
        console.error(`[Regenerate Pose API] Error fetching ${img.type} image from ${img.key}:`, error);
        return NextResponse.json(
          { error: `Failed to fetch ${img.type} image: ${error.message || 'Unknown error'}` },
          { status: 500 }
        );
      }
    }

    // Check for Gemini API key
    const geminiApiKey = process.env.GOOGLE_GEMINI_API_KEY;
    
    console.log('[Regenerate Pose API] Checking for Gemini API key:', {
      hasKey: !!geminiApiKey,
      keyLength: geminiApiKey?.length || 0,
      keyPrefix: geminiApiKey?.substring(0, 10) || 'N/A',
      allEnvKeys: Object.keys(process.env).filter(k => k.includes('GEMINI') || k.includes('GOOGLE')).join(', '),
    });
    
    if (!geminiApiKey) {
      console.error('[Regenerate Pose API] Gemini API key not found in process.env');
      return NextResponse.json(
        { error: 'Gemini API key not configured' },
        { status: 500 }
      );
    }

    // Get original prompt from entry (or construct a default)
    const originalPrompt = entry.posePromptBlock || entry.userPromptText || 
      `Generate pose ${poseNumber} for the character. Follow the pose reference exactly and match the base character's style.`;

    // Build Gemini API request body
    const systemInstruction = {
      role: 'system',
      parts: [{
        text: [
          'You are a deterministic vector-illustration renderer.',
          'OUTPUT: single 1:1 PNG on pure white (#FFFFFF). No text, watermark, gradients, textures, shadows, or noise.',
          'BASE = appearance/style ONLY. POSE = pose ONLY.',
          'Do not sample any palette or materials from POSE.',
          'HARD CONSTRAINT ORDER (highest→lowest):',
          '1) SINGLE SUBJECT (one child; exactly 2 arms/2 legs/2 shoes)',
          '2) POSE LOCK (limbs/angles/contact)',
          '3) BASE STYLE/IDENTITY LOCK (palette, line weight, facial schema)',
          '4) FRAMING & CONTACT (full body; pure white)',
        ].join('\n')
      }]
    };

    // Build parts array with text and images
    const parts: any[] = [
      { text: `${originalPrompt}\n\nRevision Request: ${revisionPrompt}` }
    ];

    // Add images based on selection (order matters: previous option first if present, then base, then pose)
    const previousOptionImg = imageData.find(img => img.type === 'previous');
    const baseImg = imageData.find(img => img.type === 'base');
    const poseImg = imageData.find(img => img.type === 'pose');

    if (previousOptionImg) {
      parts.push({ text: 'PREVIOUS OPTION (reference for revision). Apply revision to this image.' });
      parts.push({ 
        inlineData: { 
          mimeType: previousOptionImg.mimeType, 
          data: previousOptionImg.base64 
        } 
      });
    }

    if (baseImg) {
      parts.push({ text: 'BASE (appearance lock). Use style/palette from this only.' });
      parts.push({ 
        inlineData: { 
          mimeType: baseImg.mimeType, 
          data: baseImg.base64 
        } 
      });
    }

    if (poseImg) {
      parts.push({ text: 'POSE (pose lock). Use joints/contact only; ignore appearance.' });
      parts.push({ 
        inlineData: { 
          mimeType: poseImg.mimeType, 
          data: poseImg.base64 
        } 
      });
    }

    const requestBody = {
      model: 'models/gemini-2.5-flash-image',
      systemInstruction,
      contents: [{ role: 'user', parts }],
      generationConfig: {
        imageConfig: { aspectRatio: '1:1' },
        temperature: 0,
        topK: 1,
        topP: 0.6,
        candidateCount: 1,
      }
    };

    // Call Gemini API with retry logic
    console.log(`[Regenerate Pose API] Calling Gemini API for pose ${poseNumber}`);
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${geminiApiKey}`;
    
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000; // 1 second base delay
    let geminiData: any = null;
    let lastError: any = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const geminiResponse = await fetch(geminiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (!geminiResponse.ok) {
          const errorText = await geminiResponse.text();
          lastError = {
            status: geminiResponse.status,
            statusText: geminiResponse.statusText,
            body: errorText,
          };

          // Don't retry on client errors (4xx), only on server errors (5xx) or network errors
          if (geminiResponse.status >= 400 && geminiResponse.status < 500) {
            console.error(`[Regenerate Pose API] Gemini API client error (${geminiResponse.status}):`, errorText);
            return NextResponse.json(
              { 
                error: `Gemini API error: ${geminiResponse.status} ${geminiResponse.statusText}`,
                details: errorText.length > 200 ? errorText.substring(0, 200) + '...' : errorText,
              },
              { status: geminiResponse.status }
            );
          }

          // Retry on server errors
          if (attempt < MAX_RETRIES) {
            const delay = RETRY_DELAY * Math.pow(2, attempt - 1); // Exponential backoff
            console.warn(`[Regenerate Pose API] Gemini API server error (${geminiResponse.status}), retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          } else {
            // Last attempt failed
            console.error(`[Regenerate Pose API] Gemini API error after ${MAX_RETRIES} attempts (${geminiResponse.status}):`, errorText);
            return NextResponse.json(
              { 
                error: `Gemini API error after ${MAX_RETRIES} attempts: ${geminiResponse.status} ${geminiResponse.statusText}`,
                details: errorText.length > 200 ? errorText.substring(0, 200) + '...' : errorText,
                retries: MAX_RETRIES,
              },
              { status: geminiResponse.status >= 500 ? 502 : geminiResponse.status }
            );
          }
        }

        geminiData = await geminiResponse.json();
        console.log(`[Regenerate Pose API] Gemini API response received (attempt ${attempt})`);
        break; // Success, exit retry loop
      } catch (error: any) {
        lastError = error;
        
        // Network errors - retry
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_DELAY * Math.pow(2, attempt - 1); // Exponential backoff
          console.warn(`[Regenerate Pose API] Network error, retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})...`, error.message);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        } else {
          // Last attempt failed
          console.error(`[Regenerate Pose API] Network error after ${MAX_RETRIES} attempts:`, error);
          return NextResponse.json(
            { 
              error: `Network error: Failed to connect to Gemini API after ${MAX_RETRIES} attempts`,
              details: error.message,
              retries: MAX_RETRIES,
            },
            { status: 503 }
          );
        }
      }
    }

    if (!geminiData) {
      return NextResponse.json(
        { 
          error: 'Failed to get response from Gemini API',
          details: lastError?.message || 'Unknown error',
        },
        { status: 500 }
      );
    }

    // Parse response to extract image with error handling
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
        
        return NextResponse.json(
          { 
            error: 'Content was blocked by Gemini safety filters',
            details: blockedReasons,
            safetyRatings,
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { 
          error: 'No candidates returned from Gemini API',
          details: geminiData.error?.message || 'Unknown reason',
          response: geminiData,
        },
        { status: 500 }
      );
    }

    const firstCandidate = candidates[0];
    
    // Check for finish reason
    if (firstCandidate.finishReason && firstCandidate.finishReason !== 'STOP') {
      return NextResponse.json(
        { 
          error: `Generation stopped: ${firstCandidate.finishReason}`,
          finishReason: firstCandidate.finishReason,
          safetyRatings: firstCandidate.safetyRatings,
        },
        { status: 400 }
      );
    }

    const candidateParts = firstCandidate.content?.parts || [];
    const imagePart = candidateParts.find((p: any) => p.inlineData?.data);

    if (!imagePart?.inlineData?.data) {
      return NextResponse.json(
        { 
          error: 'No image data in Gemini API response',
          details: 'Response structure may have changed or image generation failed',
          candidateParts: candidateParts.length,
        },
        { status: 500 }
      );
    }

    const base64Data = imagePart.inlineData.data;
    const mimeType = imagePart.inlineData.mimeType || 'image/png';

    // Decode base64 to buffer
    const imageBuffer = Buffer.from(base64Data, 'base64');
    console.log(`[Regenerate Pose API] Extracted image from Gemini response: ${imageBuffer.length} bytes`);

    // Store temporarily in R2
    const temporaryR2Key = `book-mvp-simple-adventure/orders/${orderId}/revisions/pending/pose${poseNN}-option.png`;
    
    console.log(`[Regenerate Pose API] Storing temporary image at: ${temporaryR2Key}`);
    await putObject(R2_ORDERS_BUCKET, temporaryR2Key, imageBuffer, mimeType);
    console.log(`[Regenerate Pose API] Temporary image stored successfully`);

    // Upload to Cloudflare Images for WebP preview (optional, but improves UX)
    let cloudflareImageId: string | null = null;
    let cloudflareImageUrl: string | null = null;
    try {
      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
      const apiToken = process.env.CLOUDFLARE_IMAGES_API_TOKEN;
      const accountHash = process.env.CLOUDFLARE_IMAGES_ACCOUNT_HASH || process.env.NEXT_PUBLIC_CLOUDFLARE_IMAGES_ACCOUNT_HASH;

      if (accountId && apiToken && accountHash) {
        console.log(`[Regenerate Pose API] Uploading to Cloudflare Images for pose ${poseNumber}`);
        
        // Create FormData for multipart/form-data upload
        const cloudflareFormData = new FormData();
        const blob = new Blob([imageBuffer], { type: mimeType });
        cloudflareFormData.append('file', blob, `pose${poseNN}-option.png`);
        cloudflareFormData.append('metadata', JSON.stringify({
          orderId: orderId,
          poseNumber: poseNumber,
          type: 'revision',
          requestedAt: new Date().toISOString(),
        }));

        // Upload to Cloudflare Images API
        const cloudflareResponse = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiToken}`,
            },
            body: cloudflareFormData,
          }
        );

        if (cloudflareResponse.ok) {
          const cloudflareData = await cloudflareResponse.json();
          if (cloudflareData.success && cloudflareData.result?.id) {
            cloudflareImageId = cloudflareData.result.id;
            // Construct Cloudflare Images URL with optimized width for previews
            cloudflareImageUrl = `https://imagedelivery.net/${accountHash}/${cloudflareImageId}/preview?width=1024`;
            console.log(`[Regenerate Pose API] ✅ Successfully uploaded to Cloudflare Images: ${cloudflareImageId}`);
          } else {
            console.warn(`[Regenerate Pose API] Cloudflare Images upload succeeded but no image ID in response:`, cloudflareData);
          }
        } else {
          const errorText = await cloudflareResponse.text();
          console.warn(`[Regenerate Pose API] Cloudflare Images upload failed (${cloudflareResponse.status}): ${errorText}`);
          // Continue without Cloudflare Images - R2 upload was successful
        }
      } else {
        console.warn(`[Regenerate Pose API] Cloudflare Images credentials not configured, skipping upload`);
      }
    } catch (error: any) {
      console.error(`[Regenerate Pose API] Error uploading to Cloudflare Images:`, error);
      // Continue without Cloudflare Images - R2 upload was successful
    }

    // Generate jobId for async processing (UUID-like)
    const jobId = `${orderId}-pose${poseNN}-${Date.now()}`;

    // Update manifest with revisions.pending structure
    if (!manifest.revisions) {
      manifest.revisions = {};
    }
    if (!manifest.revisions.pending) {
      manifest.revisions.pending = {};
    }

    const requestedAt = new Date().toISOString();
    const completedAt = new Date().toISOString();
    manifest.revisions.pending[poseKey] = {
      r2Key: temporaryR2Key,
      revisionPrompt: revisionPrompt.trim(),
      requestedAt,
      jobId,
      status: 'completed', // Synchronous for now (Gemini is fast), but structure supports async
      completedAt,
      cloudflareImageId: cloudflareImageId || null,
      cloudflareImageUrl: cloudflareImageUrl || null,
      imageSelection: {
        includeBaseCharacter: hasBaseCharacter,
        includePoseReference: hasPoseReference,
        includePreviousOption: hasPreviousOption,
        previousOptionR2Key: hasPreviousOption ? previousOptionR2Key : null,
      },
    };

    // Save updated manifest back to R2
    const updatedManifestJson = JSON.stringify(manifest, null, 2);
    await putObject(
      R2_ORDERS_BUCKET,
      manifestKey,
      updatedManifestJson,
      'application/json'
    );
    console.log(`[Regenerate Pose API] Manifest updated with pending revision`);

    // Return response with preview URL (prefer Cloudflare Images if available)
    const previewUrl = cloudflareImageUrl || `/api/assets/${temporaryR2Key}`;

    return NextResponse.json({
      success: true,
      orderId,
      poseNumber,
      jobId,
      temporaryR2Key,
      previewUrl,
      cloudflareImageId: cloudflareImageId || null,
      cloudflareImageUrl: cloudflareImageUrl || null,
      imageSize: imageBuffer.length,
      mimeType,
      status: 'completed',
    });

  } catch (error: any) {
    console.error('[Regenerate Pose API] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

