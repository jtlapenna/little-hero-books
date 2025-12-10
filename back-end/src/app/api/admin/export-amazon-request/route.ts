import { NextRequest, NextResponse } from 'next/server';
import { getAmazonMessagingConfig } from '@/lib/notifications/amazon-message-center';
import { getOrderFromSupabase } from '@/lib/supabase-client';

export const dynamic = 'force-dynamic';

/**
 * Export Amazon API request/response details for support ticket
 * GET /api/admin/export-amazon-request?orderId=111-0060602-1283417&format=json|txt
 * 
 * Returns full request and response details in format Amazon requested:
 * - Full Request (headers + body)
 * - Full Response (headers + body)
 * - Application ID
 * - Developer account ID
 * - API and operation
 * - Timestamp
 * - Request ID
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId') || '111-0060602-1283417';
    const format = searchParams.get('format') || 'json'; // 'json' or 'txt'

    const configResult = getAmazonMessagingConfig(true);
    if (!configResult.ok) {
      return NextResponse.json({
        error: 'Configuration incomplete',
        issues: configResult.issues
      }, { status: 500 });
    }

    const config = configResult.config;
    const order = await getOrderFromSupabase(orderId);
    if (!order) {
      return NextResponse.json({
        error: 'Order not found'
      }, { status: 404 });
    }

    const amazonOrderId = order.amazon_order_id || order.orderId || order.order_id || orderId;

    // Import and call the messaging function to trigger an API call
    // This will capture the request/response details
    const { sendAmazonPreviewMessage } = await import('@/lib/notifications/amazon-message-center');
    
    let apiCallDetails: any = null;
    let error: any = null;

    try {
      const response = await sendAmazonPreviewMessage({
        amazonOrderId,
        reminderType: 'initial',
        previewUrl: 'https://littleherolabs.com/approve/test-token',
        childName: 'Test',
        revisionsRemaining: 2
      });

      // If successful, we need to extract details from the response
      // The details are attached to the response data
      if (response.success) {
        // For successful calls, we'd need to modify the code to return details
        // For now, we'll capture from error cases
      }
    } catch (err: any) {
      error = err;
      // Extract apiCallDetails from the error if available
      if (err.apiCallDetails) {
        apiCallDetails = err.apiCallDetails;
      }
    }

    // If we don't have apiCallDetails from the error, check if it's in the response
    // or we need to make a test call to capture it
    if (!apiCallDetails) {
      return NextResponse.json({
        error: 'API call details not captured',
        note: 'The API call details are only captured when an error occurs or when explicitly logged. ' +
              'Try making a request that triggers an error, or check the server logs for the full request/response details. ' +
              'The details are logged in the format Amazon requested when API calls are made.',
        suggestion: 'Check Cloudflare Pages logs or make a test call that will fail to capture the details.'
      }, { status: 400 });
    }

    if (format === 'txt') {
      // Format as TXT files as Amazon requested
      const requestTxt = formatRequestAsTxt(apiCallDetails.request);
      const responseTxt = formatResponseAsTxt(apiCallDetails.response);

      // Return both files as a JSON object with base64 encoded content
      // Or return as downloadable files
      return NextResponse.json({
        request: {
          filename: `amazon-request-${orderId}-${Date.now()}.txt`,
          content: requestTxt
        },
        response: {
          filename: `amazon-response-${orderId}-${Date.now()}.txt`,
          content: responseTxt
        },
        metadata: {
          applicationId: apiCallDetails.applicationId,
          developerAccountId: apiCallDetails.developerAccountId,
          api: apiCallDetails.api,
          operation: apiCallDetails.operation,
          timestamp: apiCallDetails.timestamp,
          requestId: apiCallDetails.requestId
        }
      });
    }

    // Return as JSON
    return NextResponse.json({
      applicationId: apiCallDetails.applicationId,
      developerAccountId: apiCallDetails.developerAccountId,
      api: apiCallDetails.api,
      operation: apiCallDetails.operation,
      timestamp: apiCallDetails.timestamp,
      requestId: apiCallDetails.requestId,
      request: apiCallDetails.request,
      response: apiCallDetails.response,
      error: error ? {
        message: error.message,
        code: error.code,
        status: error.status
      } : null
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}

function formatRequestAsTxt(request: any): string {
  let txt = '=== AMAZON SP-API REQUEST ===\n\n';
  txt += `Method: ${request.method}\n`;
  txt += `URL: ${request.url}\n`;
  txt += `Path: ${request.path}\n`;
  txt += `Timestamp: ${request.timestamp}\n`;
  txt += `Application ID: ${request.applicationId}\n`;
  txt += `Developer Account ID: ${request.developerAccountId}\n`;
  txt += `API: ${request.api}\n`;
  txt += `Operation: ${request.operation}\n\n`;
  txt += '--- Headers ---\n';
  for (const [key, value] of Object.entries(request.headers || {})) {
    // Mask sensitive tokens
    if (key.toLowerCase().includes('token') || key.toLowerCase() === 'authorization') {
      const val = String(value);
      txt += `${key}: ${val.substring(0, 30)}... (truncated for security)\n`;
    } else {
      txt += `${key}: ${value}\n`;
    }
  }
  txt += '\n--- Body ---\n';
  if (request.body) {
    try {
      const bodyObj = JSON.parse(request.body);
      txt += JSON.stringify(bodyObj, null, 2);
    } catch {
      txt += request.body;
    }
  } else {
    txt += '(empty)';
  }
  return txt;
}

function formatResponseAsTxt(response: any): string {
  let txt = '=== AMAZON SP-API RESPONSE ===\n\n';
  txt += `Status: ${response.status || 'N/A'}\n`;
  txt += `Status Text: ${response.statusText || 'N/A'}\n`;
  txt += `Request ID: ${response.requestId || 'N/A'}\n`;
  txt += `Timestamp: ${response.timestamp || 'N/A'}\n\n`;
  txt += '--- Headers ---\n';
  for (const [key, value] of Object.entries(response.headers || {})) {
    txt += `${key}: ${value}\n`;
  }
  txt += '\n--- Body ---\n';
  if (response.body) {
    try {
      const bodyObj = JSON.parse(response.body);
      txt += JSON.stringify(bodyObj, null, 2);
    } catch {
      txt += response.body;
    }
  } else {
    txt += '(empty)';
  }
  return txt;
}

