import { NextRequest, NextResponse } from 'next/server';
import { getAmazonMessagingConfig } from '@/lib/notifications/amazon-message-center';
import { getOrderFromSupabase } from '@/lib/supabase-client';

export const dynamic = 'force-dynamic';

/**
 * Generate Amazon Support response for TEXT-ONLY message (no document upload)
 * GET /api/admin/amazon-support-response-text?orderId=111-0060602-1283417
 * 
 * This endpoint forces text-only mode to capture messaging API call details
 * without the document upload step
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId') || '111-0060602-1283417';

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

    // Force text-only mode to skip HTML upload and capture messaging API call
    process.env.AMAZON_FORCE_TEXT_ONLY = 'true';
    
    // Make the API call to capture full request/response
    let apiCallDetails: any = null;
    
    try {
      const { sendAmazonPreviewMessage } = await import('@/lib/notifications/amazon-message-center');
      const response = await sendAmazonPreviewMessage({
        amazonOrderId,
        reminderType: 'initial',
        previewUrl: 'https://littleherolabs.com/approve/test-token',
        childName: 'Test',
        revisionsRemaining: 2
      });
      
      // Extract apiCallDetails from response (now included in response)
      if (response && (response as any).apiCallDetails) {
        apiCallDetails = (response as any).apiCallDetails;
      }
    } catch (error: any) {
      // Extract apiCallDetails from error
      if (error.apiCallDetails) {
        apiCallDetails = error.apiCallDetails;
      }
    } finally {
      delete process.env.AMAZON_FORCE_TEXT_ONLY;
    }

    // If we don't have details, return instructions
    if (!apiCallDetails) {
      return NextResponse.json({
        error: 'API call details not captured',
        instructions: [
          '1. Check Cloudflare Pages logs for: "[Amazon SP-API] Full Request/Response Details for Support"',
          '2. That log entry contains all information Amazon requested',
          '3. Copy the JSON and format as TXT files using the format below',
          '4. Or make another API call that will trigger an error to capture details'
        ],
        note: 'The full request/response details are automatically logged when API calls are made. ' +
              'Search your Cloudflare Pages logs for the log entry mentioned above.'
      }, { status: 400 });
    }

    // Format as TXT files exactly as Amazon requested
    const requestTxt = formatRequestTxt(apiCallDetails);
    const responseTxt = formatResponseTxt(apiCallDetails);

    // Check if user wants to download a specific file
    const file = searchParams.get('file'); // 'request' or 'response'

    if (file === 'request') {
      // Return request file as downloadable TXT
      return new NextResponse(requestTxt, {
        headers: {
          'Content-Type': 'text/plain',
          'Content-Disposition': `attachment; filename="amazon-request-text-${orderId}.txt"`
        }
      });
    }

    if (file === 'response') {
      // Return response file as downloadable TXT
      return new NextResponse(responseTxt, {
        headers: {
          'Content-Type': 'text/plain',
          'Content-Disposition': `attachment; filename="amazon-response-text-${orderId}.txt"`
        }
      });
    }

    // Default: Return JSON with both files and download links
    return NextResponse.json({
      // Metadata (Amazon's required fields)
      applicationId: apiCallDetails.applicationId,
      developerAccountId: apiCallDetails.developerAccountId,
      api: apiCallDetails.api,
      operation: apiCallDetails.operation,
      timestamp: apiCallDetails.timestamp,
      requestId: apiCallDetails.requestId,
      note: 'This is a TEXT-ONLY message call (no document upload). The operation should be /messaging/v1/orders/{orderId}/messages/createConfirmOrderDetails',
      
      // Download links
      downloadLinks: {
        request: `${request.url.split('?')[0]}?orderId=${orderId}&file=request`,
        response: `${request.url.split('?')[0]}?orderId=${orderId}&file=response`
      },
      
      // TXT file contents (for reference)
      requestFile: {
        filename: `amazon-request-text-${orderId}.txt`,
        content: requestTxt
      },
      responseFile: {
        filename: `amazon-response-text-${orderId}.txt`,
        content: responseTxt
      },
      
      // Instructions
      instructions: [
        'To download as TXT files:',
        `1. Request file: curl "${request.url.split('?')[0]}?orderId=${orderId}&file=request" -o amazon-request-text-${orderId}.txt`,
        `2. Response file: curl "${request.url.split('?')[0]}?orderId=${orderId}&file=response" -o amazon-response-text-${orderId}.txt`,
        'Or click the downloadLinks in a browser',
        '',
        '3. Attach both TXT files to your Amazon Support ticket',
        '4. Include the metadata fields (applicationId, developerAccountId, etc.) in your ticket'
      ]
    });

  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}

function formatRequestTxt(details: any): string {
  const req = details.request;
  let txt = '';
  
  txt += '=== AMAZON SP-API REQUEST (TEXT-ONLY MESSAGE) ===\n\n';
  txt += `Method: ${req.method}\n`;
  txt += `URL: ${req.url}\n`;
  txt += `Path: ${req.path}\n`;
  txt += `Timestamp: ${details.timestamp}\n`;
  txt += `Application ID: ${details.applicationId}\n`;
  txt += `Developer Account ID: ${details.developerAccountId}\n`;
  txt += `API: ${details.api}\n`;
  txt += `Operation: ${details.operation}\n\n`;
  
  txt += '--- Headers ---\n';
  for (const [key, value] of Object.entries(req.headers || {})) {
    // Show full headers (Amazon needs these for debugging)
    txt += `${key}: ${value}\n`;
  }
  
  txt += '\n--- Body ---\n';
  if (req.body) {
    try {
      const bodyObj = JSON.parse(req.body);
      txt += JSON.stringify(bodyObj, null, 2);
    } catch {
      txt += req.body;
    }
  } else {
    txt += '(empty)';
  }
  
  return txt;
}

function formatResponseTxt(details: any): string {
  const res = details.response;
  let txt = '';
  
  txt += '=== AMAZON SP-API RESPONSE (TEXT-ONLY MESSAGE) ===\n\n';
  txt += `Status: ${res.status}\n`;
  txt += `Status Text: ${res.statusText}\n`;
  txt += `Request ID: ${details.requestId}\n`;
  txt += `Timestamp: ${details.timestamp}\n`;
  txt += `Application ID: ${details.applicationId}\n`;
  txt += `Developer Account ID: ${details.developerAccountId}\n`;
  txt += `API: ${details.api}\n`;
  txt += `Operation: ${details.operation}\n\n`;
  
  txt += '--- Headers ---\n';
  for (const [key, value] of Object.entries(res.headers || {})) {
    txt += `${key}: ${value}\n`;
  }
  
  txt += '\n--- Body ---\n';
  if (res.body) {
    try {
      const bodyObj = JSON.parse(res.body);
      txt += JSON.stringify(bodyObj, null, 2);
    } catch {
      txt += res.body;
    }
  } else {
    txt += '(empty)';
  }
  
  return txt;
}

