// Lulu SANDBOX: Get Token (Retry) — 3 attempts, exponential backoff on 429/5xx
// FIXED: Simplified token extraction to match working pattern
// FIXED: Correct form body encoding for client_credentials grant

const http = this.helpers.httpRequest;

const j = $input.first().json || {};
const basic = j.CONFIG?.lulu?.basicAuth;

if (!basic) throw new Error('Missing CONFIG.lulu.basicAuth');

const url = 'https://api.sandbox.lulu.com/auth/realms/glasstree/protocol/openid-connect/token';

async function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

let lastErr = null;
let statusCode = null;
let attempts = 0;

for (attempts = 1; attempts <= 3; attempts++){
  try {
    // Build form body manually as URL-encoded string
    const formBody = 'grant_type=client_credentials';
    
    const resp = await http({
      method: 'POST',
      url,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: basic,
      },
      body: formBody, // Send as raw string body
      json: true, // Parse response as JSON
      ignoreHttpStatusErrors: true
    });

    // When ignoreHttpStatusErrors: true and json: true, resp is usually the parsed JSON body directly
    // But it might be wrapped in a response object
    let body = resp;
    
    // Check if resp is a response object with body property
    if (resp && typeof resp === 'object' && 'body' in resp && typeof resp.body === 'object') {
      body = resp.body;
      statusCode = Number(resp.statusCode || resp.status || 200);
    } else if (resp && typeof resp === 'object' && ('statusCode' in resp || 'status' in resp)) {
      // Response object but body might be at top level
      statusCode = Number(resp.statusCode || resp.status || 200);
      body = resp.body !== undefined ? resp.body : resp;
    } else {
      // resp is likely the body directly (most common case)
      body = resp;
      statusCode = 200;
    }
    
    // Extract token using the same pattern that was working before
    const access = body?.access_token || body?.token || body?.data?.access_token;
    const expires = body?.expires_in || body?.data?.expires_in || null;
    
    // Check for error response from Lulu API
    if (body?.error || body?.error_description) {
      lastErr = new Error(`Lulu API error: ${body.error || 'unknown'} - ${body.error_description || ''}`);
      if (attempts < 3) await sleep(1000 * Math.pow(2, attempts-1));
      continue;
    }
    
    // Check status code
    if (statusCode >= 500 || statusCode === 429) {
      lastErr = new Error(`Token fetch failed (status=${statusCode})`);
      if (attempts < 3) await sleep(1000 * Math.pow(2, attempts-1));
      continue;
    }
    
    // Check if token is missing
    if (!access) {
      const debugInfo = {
        hasBody: !!body,
        bodyType: typeof body,
        bodyKeys: body && typeof body === 'object' ? Object.keys(body) : [],
        statusCode: statusCode,
        bodySample: body && typeof body === 'object' ? JSON.stringify(body).substring(0, 300) : String(body).substring(0, 300)
      };
      lastErr = new Error(`Token not found in response. Status: ${statusCode}. Body keys: ${debugInfo.bodyKeys.join(', ')}. Body sample: ${debugInfo.bodySample}`);
      if (attempts < 3) await sleep(1000 * Math.pow(2, attempts-1));
      continue;
    }
    
    // Success! Return in the same format as the working code
    const issuedAt = new Date().toISOString();
    return [{
      json: {
        ...j,
        luluAccessToken: access,
        luluTokenType: 'Bearer',
        luluTokenExpiresIn: expires,
        luluTokenIssuedAt: issuedAt,
        access_token: access, // Also include for backward compatibility
        luluTokenStatusCode: statusCode,
        retryCountToken: attempts
      }
    }];
    
  } catch (e) {
    lastErr = e;
    if (attempts < 3) await sleep(1000 * Math.pow(2, attempts-1));
  }
}

throw new Error(`Token fetch failed after retries: ${lastErr?.message||lastErr}`);
