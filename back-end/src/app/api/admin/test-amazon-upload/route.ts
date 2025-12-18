import { NextRequest, NextResponse } from 'next/server';
import { getAmazonMessagingConfig } from '@/lib/notifications/amazon-message-center';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * Test endpoint to directly test the upload destination endpoint
 * GET /api/admin/test-amazon-upload
 * 
 * This tests the /uploads/2020-11-01/uploadDestinations/messaging endpoint
 * without needing a valid order status
 */
export async function GET(request: NextRequest) {
  try {
    const configResult = getAmazonMessagingConfig(true);
    if (!configResult.ok) {
      return NextResponse.json({
        success: false,
        error: 'Configuration incomplete',
        issues: configResult.issues
      }, { status: 500 });
    }

    const config = configResult.config;

    // Step 1: Get LWA access token
    const lwaEndpoint = 'https://api.amazon.com/auth/o2/token';
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: config.lwaRefreshToken,
      client_id: config.lwaClientId,
      client_secret: config.lwaClientSecret
    });
    
    const lwaResponse = await fetch(lwaEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    
    if (!lwaResponse.ok) {
      const lwaData = await lwaResponse.json().catch(() => ({}));
      return NextResponse.json({
        success: false,
        error: 'Failed to get LWA access token',
        details: lwaData
      }, { status: 500 });
    }
    
    const lwaData = await lwaResponse.json();
    const accessToken = lwaData.access_token;

    // Step 2: Create test HTML content
    const testHtml = '<html><body><h1>Test Message</h1><p>This is a test HTML document for upload endpoint testing.</p></body></html>';
    const htmlBuffer = Buffer.from(testHtml, 'utf8');
    
    // Calculate MD5 hash of the content (before encryption) for contentMD5 query parameter
    const contentMD5 = createHash('md5').update(htmlBuffer).digest('base64');

    // Step 3: Test the upload destination endpoint
    const { callSellingPartnerApi } = await import('@/lib/notifications/amazon-message-center');
    
    // We need to access the internal function - let's use a workaround
    // Actually, we can't easily access callSellingPartnerApi from here since it's not exported
    // Let's make the call directly using the same pattern
    
    const host = `sellingpartnerapi-${config.spRegion}.amazon.com`;
    const path = '/uploads/2020-11-01/uploadDestinations/messaging';
    const endpoint = `https://${host}${path}`;
    const url = new URL(endpoint);
    
    // Add query parameters
    url.searchParams.append('marketplaceIds', config.marketplaceId);
    url.searchParams.append('contentMD5', contentMD5);
    url.searchParams.append('contentType', 'text/html; charset=UTF-8');

    const method = 'POST';
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substring(0, 8);

    // Headers that will be signed (for AWS SigV4)
    const headers: Record<string, string> = {
      host,
      'x-amz-date': amzDate,
      'x-amz-access-token': accessToken,
      'content-type': 'application/json'
    };

    const payloadHash = createHash('sha256').update('').digest('hex');

    const canonicalUri = url.pathname;
    const canonicalQueryString = Array.from(url.searchParams.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');

    const sortedHeaderKeys = Object.keys(headers).sort();
    const canonicalHeaders = sortedHeaderKeys
      .map((key) => `${key}:${headers[key].trim()}`)
      .join('\n');

    const signedHeaders = sortedHeaderKeys.join(';');

    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQueryString,
      `${canonicalHeaders}\n`,
      signedHeaders,
      payloadHash
    ].join('\n');

    const SERVICE = 'execute-api';
    const credentialScope = `${dateStamp}/${config.awsRegion}/${SERVICE}/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      createHash('sha256').update(canonicalRequest).digest('hex')
    ].join('\n');

    // Sign the request
    const { createHmac } = await import('crypto');
    const getSignatureKey = (key: string, dateStamp: string, regionName: string, serviceName: string) => {
      const kDate = createHmac('sha256', `AWS4${key}`).update(dateStamp).digest();
      const kRegion = createHmac('sha256', kDate).update(regionName).digest();
      const kService = createHmac('sha256', kRegion).update(serviceName).digest();
      return createHmac('sha256', kService).update('aws4_request').digest();
    };

    const signingKey = getSignatureKey(config.awsSecretAccessKey, dateStamp, config.awsRegion, SERVICE);
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${config.awsAccessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    headers.authorization = authorizationHeader;

    const requestHeaders = new Headers();
    for (const [key, value] of Object.entries(headers)) {
      requestHeaders.set(key, value);
    }
    requestHeaders.set('user-agent', 'LittleHeroBooks/1.0 (Language=TypeScript/Node.js; Platform=Cloudflare)');

    // Make the API call
    const apiResponse = await fetch(url.toString(), {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({}) // Empty body since all params are in query
    });

    const responseText = await apiResponse.text();
    let responseData: any;
    try {
      responseData = responseText ? JSON.parse(responseText) : {};
    } catch {
      responseData = { raw: responseText };
    }

    // Capture full request/response details
    const requestDetails = {
      method,
      url: url.toString(),
      path,
      headers: Object.fromEntries(requestHeaders.entries()),
      queryParams: {
        marketplaceIds: config.marketplaceId,
        contentMD5: contentMD5,
        contentType: 'text/html; charset=UTF-8'
      },
      body: null
    };

    const responseDetails = {
      status: apiResponse.status,
      statusText: apiResponse.statusText,
      headers: Object.fromEntries(apiResponse.headers.entries()),
      body: responseData
    };

    return NextResponse.json({
      success: apiResponse.ok,
      status: apiResponse.status,
      request: requestDetails,
      response: responseDetails,
      message: apiResponse.ok 
        ? 'Upload destination endpoint test successful! The endpoint is working correctly.'
        : 'Upload destination endpoint test failed. Check the response for details.'
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}

