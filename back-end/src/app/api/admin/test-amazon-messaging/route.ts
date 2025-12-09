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
    diagnostics.steps.push({ 
      step: 1, 
      status: 'ok', 
      message: 'Configuration valid',
      credentialChecks: {
        clientId: config.lwaClientId ? `${config.lwaClientId.substring(0, 10)}...${config.lwaClientId.substring(config.lwaClientId.length - 10)}` : 'MISSING',
        clientSecret: config.lwaClientSecret ? 'SET (' + config.lwaClientSecret.length + ' chars)' : 'MISSING',
        refreshToken: config.lwaRefreshToken ? `${config.lwaRefreshToken.substring(0, 10)}...${config.lwaRefreshToken.substring(config.lwaRefreshToken.length - 10)}` : 'MISSING',
        refreshTokenLength: config.lwaRefreshToken?.length || 0,
        sellerId: config.sellerId || 'MISSING',
        awsAccessKeyId: config.awsAccessKeyId ? `${config.awsAccessKeyId.substring(0, 10)}...` : 'MISSING',
        awsSecretAccessKey: config.awsSecretAccessKey ? 'SET' : 'MISSING'
      }
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
        diagnostics.steps.push({ 
          step: 3, 
          status: 'error', 
          message: lwaData.error_description || lwaData.error || 'LWA token request failed',
          errorCode: lwaData.error,
          httpStatus: lwaResponse.status,
          fullResponse: lwaData,
          troubleshooting: {
            possibleCauses: [
              'App not self-authorized: Even with refresh token, app must be authorized for seller account',
              'Refresh token mismatch: Token doesn\'t match client ID/secret',
              'App status: App may be in Draft but needs explicit authorization',
              'Seller account mismatch: Refresh token for different seller account',
              'Role permissions: App missing required SP-API roles (Buyer Communication)'
            ],
            actionItems: [
              '1. Go to Seller Central → Apps & Services → Develop Apps',
              '2. Find "Little Hero Labs Production" app',
              '3. Click "Authorize app" (not just generate token)',
              '4. Select your seller account',
              '5. Verify "Buyer Communication" role is enabled',
              '6. Copy the NEW refresh token after authorization',
              '7. Update AMZ_REFRESH_TOKEN in Cloudflare Pages',
              '8. Verify AMZ_SELLER_ID matches the authorized account'
            ]
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
      
      if (response.success) {
        diagnostics.steps.push({ 
          step: 4, 
          status: 'ok', 
          message: 'All endpoints successful!',
          messageId: response.messageId
        });
      } else {
        diagnostics.steps.push({ 
          step: 4, 
          status: 'error', 
          message: response.error || 'Unknown error',
          issues: response.issues
        });
        return NextResponse.json({
          success: false,
          error: 'Amazon messaging failed',
          diagnostics
        });
      }
    } catch (error: any) {
      diagnostics.steps.push({ 
        step: 4, 
        status: 'error', 
        message: error.message,
        code: error.code,
        statusCode: error.status,
        details: error.details,
        url: error.url,
        path: error.path,
        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error))
      });
      return NextResponse.json({
        success: false,
        error: 'GET /messaging/v1/orders failed',
        diagnostics
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

