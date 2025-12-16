import { NextRequest, NextResponse } from 'next/server';
import { getAmazonMessagingConfig } from '@/lib/notifications/amazon-message-center';
import { getOrderFromSupabase } from '@/lib/supabase-client';

export const dynamic = 'force-dynamic';

/**
 * Test endpoint to diagnose Amazon Messaging API issues
 * GET /api/admin/test-amazon-messaging?orderId=111-0060602-1283417
 * Force deployment: Add comprehensive diagnostics
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId') || '111-0060602-1283417';

    const diagnostics: any = {
      timestamp: new Date().toISOString(),
      orderId,
      steps: []
    };

    // Step 1: Check configuration
    diagnostics.steps.push({ step: 1, name: 'Check Configuration' });
    // Force refresh to ensure we get latest env vars (bypass cache)
    const configResult = getAmazonMessagingConfig(true);
    if (!configResult.ok) {
      return NextResponse.json({
        success: false,
        error: 'Configuration incomplete',
        diagnostics: {
          ...diagnostics,
          configError: configResult.error,
          configIssues: configResult.issues
        }
      });
    }
    
    // Log credential previews (first/last chars only for security)
    const config = configResult.config;
    
    // Debug: Log raw client ID to verify which one is being used
    const rawClientId = process.env.AMZ_APP_CLIENT_ID || '';
    const rawClientSecret = process.env.AMZ_APP_CLIENT_SECRET || '';
    const rawRefreshToken = process.env.AMZ_REFRESH_TOKEN || '';
    
    console.log('[LWA_DEBUG] Client ID verification:', {
      rawClientId: rawClientId,
      clientIdEnd: rawClientId.slice(-8),
      expectedEnd: 'fa5f58',
      matches: rawClientId.endsWith('fa5f58'),
      configClientIdEnd: config.lwaClientId?.slice(-8),
      configMatches: config.lwaClientId?.endsWith('fa5f58')
    });
    
    const credentialChecks: any = {
      clientId: config.lwaClientId ? `${config.lwaClientId.substring(0, 10)}...${config.lwaClientId.substring(config.lwaClientId.length - 10)}` : 'MISSING',
      clientIdEnd: config.lwaClientId?.slice(-8) || 'MISSING', // Last 8 chars for verification
      clientSecret: config.lwaClientSecret ? 'SET (' + config.lwaClientSecret.length + ' chars)' : 'MISSING',
      refreshToken: config.lwaRefreshToken ? `${config.lwaRefreshToken.substring(0, 10)}...${config.lwaRefreshToken.substring(config.lwaRefreshToken.length - 10)}` : 'MISSING',
      refreshTokenLength: config.lwaRefreshToken?.length || 0,
      sellerId: config.sellerId || 'MISSING',
      awsAccessKeyId: config.awsAccessKeyId ? `${config.awsAccessKeyId.substring(0, 10)}...` : 'MISSING',
      awsSecretAccessKey: config.awsSecretAccessKey ? 'SET' : 'MISSING',
      envVarName: 'AMZ_APP_CLIENT_ID', // Show which env var is being read
      envVarValue: rawClientId ? `${rawClientId.substring(0, 20)}...${rawClientId.slice(-8)}` : 'NOT SET',
      // Client Secret preview (from raw env var)
      clientSecretPreview: {
        length: rawClientSecret?.length || 0,
        start: rawClientSecret?.slice(0, 8) || 'MISSING',
        end: rawClientSecret?.slice(-8) || 'MISSING',
        expectedStart: 'amzn1.oa', // Should start with this
        matchesStart: rawClientSecret?.startsWith('amzn1.oa2-cs.v1.') || false
      },
      // Refresh Token preview (from raw env var)
      refreshTokenPreview: {
        length: rawRefreshToken?.length || 0,
        start: rawRefreshToken?.slice(0, 16) || 'MISSING', // First 16 chars (includes "Atzr|")
        end: rawRefreshToken?.slice(-16) || 'MISSING', // Last 16 chars
        expectedStart: 'Atzr|', // Should start with this
        matchesStart: rawRefreshToken?.startsWith('Atzr|') || false
      }
    };
    
    diagnostics.steps.push({ 
      step: 1, 
      status: 'ok', 
      message: 'Configuration valid',
      credentialChecks
    });

    // Step 2: Get order
    diagnostics.steps.push({ step: 2, name: 'Get Order from Supabase' });
    const order = await getOrderFromSupabase(orderId);
    if (!order) {
      return NextResponse.json({
        success: false,
        error: 'Order not found',
        diagnostics
      });
    }
    const amazonOrderId = order.amazon_order_id || order.orderId || order.order_id || orderId;
    diagnostics.steps.push({ step: 2, status: 'ok', message: `Order found, amazonOrderId: ${amazonOrderId}` });

    // Step 3: Test LWA token generation directly
    diagnostics.steps.push({ step: 3, name: 'Test LWA Access Token Generation' });
    try {
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
      
      const lwaResponseText = await lwaResponse.text();
      let lwaData: any;
      try {
        lwaData = lwaResponseText ? JSON.parse(lwaResponseText) : {};
      } catch {
        lwaData = { raw: lwaResponseText };
      }
      
      if (!lwaResponse.ok) {
        // For unauthorized_client, provide specific verification steps
        const isUnauthorizedClient = lwaData.error === 'unauthorized_client';
        
        diagnostics.steps.push({ 
          step: 3, 
          status: 'error', 
          message: lwaData.error_description || lwaData.error || 'LWA token request failed',
          errorCode: lwaData.error,
          httpStatus: lwaResponse.status,
          fullResponse: lwaData,
          troubleshooting: {
            errorType: isUnauthorizedClient ? 'CREDENTIAL_MISMATCH' : 'OTHER',
            possibleCauses: isUnauthorizedClient ? [
              '⚠️ MOST LIKELY: Refresh token in Cloudflare doesn\'t match the one in Seller Central',
              '⚠️ Client ID in Cloudflare doesn\'t match the one in Seller Central',
              '⚠️ Client Secret in Cloudflare doesn\'t match the one in Seller Central',
              'Refresh token was regenerated but not updated in Cloudflare Pages',
              'Copy-paste error: Extra spaces, missing characters, or wrong token copied'
            ] : [
              'App not self-authorized: Even with refresh token, app must be authorized for seller account',
              'Refresh token mismatch: Token doesn\'t match client ID/secret',
              'App status: App may be in Draft but needs explicit authorization',
              'Seller account mismatch: Refresh token for different seller account',
              'Role permissions: App missing required SP-API roles (Buyer Communication)'
            ],
            actionItems: isUnauthorizedClient ? [
              '1. Go to Seller Central → Manage Authorizations',
              '2. Copy the EXACT refresh token (starts with Atzr|)',
              '3. Go to Cloudflare Pages → Settings → Environment Variables',
              '4. Find AMZ_REFRESH_TOKEN and replace with the EXACT token from step 2',
              '5. Verify AMZ_APP_CLIENT_ID matches "View LWA credentials" in Seller Central',
              '6. Verify AMZ_APP_CLIENT_SECRET matches "View LWA credentials" in Seller Central',
              '7. Make sure NO extra spaces or quotes around values',
              '8. Redeploy Cloudflare Pages after updating',
              '9. Test again with this endpoint'
            ] : [
              '1. Go to Seller Central → Apps & Services → Develop Apps',
              '2. Find "Little Hero Labs Production" app',
              '3. Click "Authorize app" (not just generate token)',
              '4. Select your seller account',
              '5. Verify "Buyer Communication" role is enabled',
              '6. Copy the NEW refresh token after authorization',
              '7. Update AMZ_REFRESH_TOKEN in Cloudflare Pages',
              '8. Verify AMZ_SELLER_ID matches the authorized account'
            ],
            verificationChecklist: isUnauthorizedClient ? [
              'Refresh token: First 10 chars match? (Atzr|IwEBI...)',
              'Refresh token: Last 10 chars match? (...AQUnxuKFrc)',
              'Refresh token: Total length is 332 characters?',
              'Client ID: Starts with "amzn1.application-oa2-client."?',
              'Client Secret: Starts with "amzn1.oa2-cs.v1."?',
              'Client Secret: Length is 80 characters?',
              'All values: No extra spaces before/after?',
              'All values: No quotes around values in Cloudflare?'
            ] : []
          }
        });
        return NextResponse.json({
          success: false,
          error: 'LWA access token generation failed',
          diagnostics
        });
      }
      
      diagnostics.steps.push({ 
        step: 3, 
        status: 'ok', 
        message: 'LWA access token obtained successfully',
        expiresIn: lwaData.expires_in,
        tokenType: lwaData.token_type
      });
    } catch (error: any) {
      diagnostics.steps.push({ step: 3, status: 'error', message: error.message, error });
      return NextResponse.json({
        success: false,
        error: 'Failed to test LWA token',
        diagnostics
      });
    }

    // Step 4: Test GET /messaging/v1/orders endpoint (this is where it likely fails)
    diagnostics.steps.push({ step: 4, name: 'Test GET /messaging/v1/orders endpoint' });
    try {
      const { sendAmazonPreviewMessage } = await import('@/lib/notifications/amazon-message-center');
      
      // This will call ensureMessageTypeAllowed which does GET /messaging/v1/orders
      const response = await sendAmazonPreviewMessage({
        amazonOrderId,
        reminderType: 'initial',
        previewUrl: 'https://littleherolabs.com/approve/test-token',
        childName: 'Test',
        revisionsRemaining: 2
      });
      
      // Log the raw response structure for debugging
      console.log('[Test Amazon Messaging] Response structure:', {
        success: response.success,
        hasDetails: !!response.details,
        hasRawResponse: !!response.details?.rawResponse,
        rawResponseKeys: response.details?.rawResponse ? Object.keys(response.details.rawResponse) : [],
        hasLinks: !!response.details?.rawResponse?._links,
        hasActions: !!response.details?.rawResponse?._links?.actions
      });
      
      if (response.success) {
        diagnostics.steps.push({ 
          step: 4, 
          status: 'ok', 
          message: 'All endpoints successful!',
          messageId: response.messageId
        });
      } else {
        // Include detailed response structure for debugging
        const rawResponse = response.details?.rawResponse || null;
        const responseStructure = {
          hasLinks: !!rawResponse?._links,
          hasActions: !!rawResponse?._links?.actions,
          actionsCount: Array.isArray(rawResponse?._links?.actions) ? rawResponse._links.actions.length : 0,
          actionsPreview: Array.isArray(rawResponse?._links?.actions) 
            ? rawResponse._links.actions.slice(0, 3).map((a: any) => ({ name: a?.name, href: a?.href?.substring(0, 50) + '...' }))
            : null,
          topLevelKeys: rawResponse ? Object.keys(rawResponse) : [],
          fullResponsePreview: rawResponse ? JSON.stringify(rawResponse).substring(0, 500) : null
        };
        
        diagnostics.steps.push({ 
          step: 4, 
          status: 'error', 
          message: response.error || 'Unknown error',
          issues: response.issues,
          availableActions: response.details?.availableActions || [],
          responseStructure
        });
        return NextResponse.json({
          success: false,
          error: 'Amazon messaging failed',
          diagnostics
        });
      }
    } catch (error: any) {
      // Extract API call details if available (for Amazon support export)
      const apiCallDetails = error.apiCallDetails || null;
      
      // Extract the actual error response body from Amazon
      // Try multiple sources: error.details (parsed), apiCallDetails.response.body (raw), or error itself
      const rawResponseBody = apiCallDetails?.response?.body || null;
      const parsedDetails = error.details || null;
      
      let parsedErrorBody = null;
      if (rawResponseBody) {
        // Try to parse raw response body
        try {
          parsedErrorBody = typeof rawResponseBody === 'string' ? JSON.parse(rawResponseBody) : rawResponseBody;
        } catch {
          parsedErrorBody = { raw: rawResponseBody.substring(0, 500) };
        }
      } else if (parsedDetails) {
        // Use already parsed details
        parsedErrorBody = parsedDetails;
      }
      
      diagnostics.steps.push({ 
        step: 4, 
        status: 'error', 
        message: error.message,
        code: error.code,
        statusCode: error.status,
        details: error.details,
        url: error.url,
        path: error.path,
        // Include the actual error response from Amazon
        amazonErrorResponse: parsedErrorBody,
        amazonErrorCodes: parsedErrorBody?.errors?.map((e: any) => e.code) || [],
        amazonErrorMessages: parsedErrorBody?.errors?.map((e: any) => e.message) || [],
        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)),
        // Include API call details for Amazon support
        apiCallDetails: apiCallDetails ? {
          applicationId: apiCallDetails.applicationId,
          developerAccountId: apiCallDetails.developerAccountId,
          api: apiCallDetails.api,
          operation: apiCallDetails.operation,
          timestamp: apiCallDetails.timestamp,
          requestId: apiCallDetails.requestId,
          hasFullRequest: !!apiCallDetails.request,
          hasFullResponse: !!apiCallDetails.response,
          responseBody: apiCallDetails.response?.body || null
        } : null
      });
      return NextResponse.json({
        success: false,
        error: 'GET /messaging/v1/orders failed',
        diagnostics,
        // Include full API call details for export
        amazonSupportInfo: apiCallDetails ? {
          applicationId: apiCallDetails.applicationId,
          developerAccountId: apiCallDetails.developerAccountId,
          api: apiCallDetails.api,
          operation: apiCallDetails.operation,
          timestamp: apiCallDetails.timestamp,
          requestId: apiCallDetails.requestId,
          note: 'Full request/response details are in server logs. Search for "[Amazon SP-API] Full Request/Response Details for Support"'
        } : null
      });
    }

    return NextResponse.json({
      success: true,
      message: 'All tests passed',
      diagnostics
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}

