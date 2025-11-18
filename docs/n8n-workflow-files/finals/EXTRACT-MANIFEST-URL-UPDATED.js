/**
 * Extract Manifest URL - Normalize webhook data structure
 * Handles both webhook body structure (first pass) and direct fields (Wait node resume)
 * FIX: Check top-level first (Wait node), then body (webhook), process ALL items
 * Handle null values properly - construct from orderId if manifestUrl is null
 * FIX: Validate manifestUrl is a proper URL, not an R2 key
 * FIX: Handle submissions array structure (retry webhook sends { submissions: [...] })
 */
const inputs = $input.all();

function extractPoseFromString(s) {
  if (!s) return null;
  const m = String(s).match(/pose[_-]?(\d{1,2})/i);
  return m ? Number(m[1]) : null;
}

function resolvePoseNumber(input) {
  // Prefer explicit fields first (top-level then body)
  let n = input?.poseNumber ?? input?.body?.poseNumber ?? null;
  if (n !== null && n !== undefined) {
    n = Number(n);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  // Soft fallback from filenames/paths if upstream forgot to set poseNumber
  const candidates = [
    input?.fileName,
    input?.imageFileName,
    input?.outputFileName,
    input?.r2Path,
    input?.publicUrl,
    input?.originalImageUrl,
    input?.body?.fileName,
    input?.body?.r2Path,
    input?.body?.publicUrl,
    input?.body?.originalImageUrl,
  ];
  for (const c of candidates) {
    const m = extractPoseFromString(c);
    if (m !== null) return m;
  }
  return null;
}

// Helper function to check if a string is a valid URL
function isValidUrl(str) {
  if (!str || typeof str !== 'string') return false;
  return str.startsWith('http://') || str.startsWith('https://');
}

// Helper function to convert R2 key to full URL
function r2KeyToUrl(r2Key, orderId) {
  if (!r2Key || typeof r2Key !== 'string') return null;
  const baseUrl = 'https://admin.littleherolabs.com/api/manifests';
  // If it's already a full path, use it directly
  if (r2Key.startsWith('book-mvp-simple-adventure/')) {
    return `${baseUrl}/${r2Key}`;
  }
  // Otherwise construct from orderId
  if (orderId) {
    return `${baseUrl}/book-mvp-simple-adventure/orders/${String(orderId)}/manifests/2a-manifest.json`;
  }
  return null;
}

return inputs.map(item => {
  const input = item.json || {};

  // Priority: top-level first (Wait node resume), then body (webhook first pass)
  let manifestUrl = (input.manifestUrl && input.manifestUrl !== '') ? input.manifestUrl : null;
  if (!manifestUrl) {
    manifestUrl = (input.originalManifestUrl && input.originalManifestUrl !== '') ? input.originalManifestUrl : null;
  }

  let orderId = (input.orderId && input.orderId !== '') ? input.orderId : null;
  if (!orderId) {
    orderId = (input.amazonOrderId && input.amazonOrderId !== '') ? input.amazonOrderId : null;
  }

  // Fallback: Extract orderId from manifestKey if available (S3 node might have stripped orderId)
  if ((!orderId || orderId === '') && input.manifestKey) {
    const manifestKeyStr = String(input.manifestKey).trim();
    if (manifestKeyStr && manifestKeyStr !== 'null' && manifestKeyStr !== 'undefined') {
      const patterns = [
        /\/orders\/([^/]+)\//,  // /orders/TEST-ORDER-006/
        /orders\/([^/]+)\//,    // orders/TEST-ORDER-006/
      ];
      for (const pattern of patterns) {
        const keyMatch = manifestKeyStr.match(pattern);
        if (keyMatch && keyMatch[1]) {
          orderId = keyMatch[1];
          console.log(`✓ Extracted orderId from manifestKey: ${orderId} (pattern matched)`);
          break;
        }
      }
      if (!orderId) {
        console.warn(`⚠️ Could not extract orderId from manifestKey: ${manifestKeyStr.substring(0, 100)}`);
      }
    }
  }

  let webhookUrl = (input.webhookUrl && input.webhookUrl !== '') ? input.webhookUrl : null;

  // If not found at top level, check body (webhook structure)
  // PRIORITY: Check submissions array first (retry webhook), then direct body fields
  if (!manifestUrl && input.body && input.body !== input) {
    // Check for submissions array (retry webhook structure)
    if (Array.isArray(input.body.submissions) && input.body.submissions.length > 0) {
      const submission = input.body.submissions[0];
      manifestUrl = (submission.manifestUrl && submission.manifestUrl !== '') ? submission.manifestUrl : null;
      if (!manifestUrl) {
        manifestUrl = (submission.originalManifestUrl && submission.originalManifestUrl !== '') ? submission.originalManifestUrl : null;
      }
      if (!orderId) {
        orderId = (submission.orderId && submission.orderId !== '') ? submission.orderId : null;
        if (!orderId) {
          orderId = (submission.amazonOrderId && submission.amazonOrderId !== '') ? submission.amazonOrderId : null;
        }
      }
      if (!webhookUrl) {
        webhookUrl = (submission.webhookUrl && submission.webhookUrl !== '') ? submission.webhookUrl : null;
      }
      // Preserve other submission fields for downstream nodes
      if (submission.statusUrl || submission.status_url) {
        input.statusUrl = submission.statusUrl || submission.status_url;
        input.status_url = submission.statusUrl || submission.status_url;
      }
      if (submission.requestId || submission.request_id) {
        input.requestId = submission.requestId || submission.request_id;
        input.request_id = submission.requestId || submission.request_id;
      }
      if (submission.characterHash) {
        input.characterHash = submission.characterHash;
      }
      if (submission.poseNumber !== undefined && submission.poseNumber !== null) {
        input.poseNumber = submission.poseNumber;
      }
      if (submission.retryCount !== undefined) {
        input.retryCount = submission.retryCount;
      }
      if (submission.maxRetries !== undefined) {
        input.maxRetries = submission.maxRetries;
      }
      if (submission.isFirstPass !== undefined) {
        input.isFirstPass = submission.isFirstPass;
      }
      console.log(`✓ Extracted from submissions array (retry webhook structure)`);
    } else {
      // Fallback: Check direct body fields (first pass webhook)
      manifestUrl = (input.body.manifestUrl && input.body.manifestUrl !== '') ? input.body.manifestUrl : null;
      if (!manifestUrl) {
        manifestUrl = (input.body.originalManifestUrl && input.body.originalManifestUrl !== '') ? input.body.originalManifestUrl : null;
      }
      if (!orderId) {
        orderId = (input.body.orderId && input.body.orderId !== '') ? input.body.orderId : null;
        if (!orderId) {
          orderId = (input.body.amazonOrderId && input.body.amazonOrderId !== '') ? input.body.amazonOrderId : null;
        }
      }
      if (!webhookUrl) {
        webhookUrl = (input.body.webhookUrl && input.body.webhookUrl !== '') ? input.body.webhookUrl : null;
      }
    }
  }

  // CRITICAL FIX: Validate manifestUrl is a proper URL, not an R2 key
  // If manifestUrl exists but is not a valid URL (starts with http:// or https://),
  // treat it as an R2 key and convert it to a full URL
  if (manifestUrl && !isValidUrl(manifestUrl)) {
    console.log(`⚠️ manifestUrl is not a valid URL (looks like R2 key): ${manifestUrl.substring(0, 100)}`);
    const convertedUrl = r2KeyToUrl(manifestUrl, orderId);
    if (convertedUrl) {
      manifestUrl = convertedUrl;
      console.log(`✓ Converted R2 key to full URL: ${manifestUrl}`);
    } else {
      console.warn(`⚠️ Could not convert R2 key to URL, will construct from orderId`);
      manifestUrl = null; // Force reconstruction from orderId
    }
  }

  // If no manifestUrl but we have orderId, construct it
  if ((!manifestUrl || manifestUrl === '') && orderId && orderId !== '') {
    const baseUrl = 'https://admin.littleherolabs.com/api/manifests';
    manifestUrl = `${baseUrl}/book-mvp-simple-adventure/orders/${String(orderId)}/manifests/2a-manifest.json`;
    console.log(`✓ Constructed manifestUrl from orderId: ${manifestUrl} (orderId was: ${orderId})`);
  }

  // Final validation
  if (!manifestUrl || manifestUrl === '') {
    const keys = input ? Object.keys(input).join(', ') : 'no input';
    const manifestUrlValue = input.manifestUrl;
    const orderIdValue = orderId;
    const manifestKeyValue = input.manifestKey || 'not present';
    console.error(`❌ Cannot resolve manifestUrl. manifestUrl=${manifestUrlValue}, orderId=${orderIdValue}, manifestKey=${manifestKeyValue}, Keys: ${keys}`);
    throw new Error(`Cannot resolve manifestUrl. manifestUrl=${manifestUrlValue}, orderId=${orderIdValue}, manifestKey=${manifestKeyValue}, Keys: ${keys}`);
  }

  // Validate final manifestUrl is a proper URL
  if (!isValidUrl(manifestUrl)) {
    console.error(`❌ Final manifestUrl is not a valid URL: ${manifestUrl}`);
    throw new Error(`Final manifestUrl is not a valid URL: ${manifestUrl}`);
  }

  // First pass vs resume
  let isFirstPass = input.isFirstPass;
  if (isFirstPass === undefined) {
    const hasWebhookUrl = !!(webhookUrl || (input.body && input.body !== input && input.body.webhookUrl));
    isFirstPass = hasWebhookUrl ? true : false; // default false if undetermined
  }

  // ZERO-SAFE pose number preservation
  const poseNumber = resolvePoseNumber(input);
  return {
    json: {
      ...input, // preserve everything coming in
      manifestUrl,
      originalManifestUrl: manifestUrl,
      orderId: orderId || input.orderId || input.amazonOrderId || null,
      webhookUrl: webhookUrl || input.webhookUrl || null,
      isFirstPass,
      statusUrl: input.statusUrl || input.status_url || null,
      status_url: input.status_url || input.statusUrl || null,
      requestId: input.requestId || input.request_id || null,
      request_id: input.request_id || input.requestId || null,
      poseNumber: (poseNumber ?? null), // <-- preserves 0; only null if truly unknown
      characterHash: input.characterHash || null
    }
  };
});

