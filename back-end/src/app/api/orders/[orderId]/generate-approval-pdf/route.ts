/**
 * API Route: Generate HTML with Approval Link (for download / manual sending)
 *
 * GET /api/orders/[orderId]/generate-approval-pdf
 *
 * Returns the same approval-page HTML used in Amazon Message Center attachments.
 * Use this to download the HTML file when a message needs to be sent manually
 * (e.g. attach the file in Amazon Buyer-Seller Messaging). The response is
 * served as an HTML file (approval-{orderId}.html) with the correct approval URL.
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildApprovalPageHtml } from '@/lib/approval-page-html';
import { getActivePreviewToken } from '@/lib/preview-tokens';
import { getOrderFromSupabase } from '@/lib/supabase-client';
import { getObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;
    
    if (!orderId) {
      return NextResponse.json(
        { error: 'orderId is required' },
        { status: 400 }
      );
    }

    // Get order to verify it exists
    const order = await getOrderFromSupabase(orderId);
    if (!order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Get preview token and generate approval URL
    const previewToken = await getActivePreviewToken(orderId);
    if (!previewToken) {
      return NextResponse.json(
        { error: 'Preview token not found. Please generate a preview link first.' },
        { status: 404 }
      );
    }

    const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
    const customerSiteUrl = process.env.CUSTOMER_SITE_URL?.replace(/\/+$/, '') || 
      (isProduction ? 'https://littleherolabs.com' : 'http://localhost:4321');
    const approvalUrl = `${customerSiteUrl}/approve/${previewToken.token}`;

    // Try to fetch the book PDF from R2
    const pdfKey = `book-mvp-simple-adventure/orders/${orderId}/complete_book_${orderId}.pdf`;
    let bookPdfBuffer: Buffer | null = null;
    
    try {
      const pdfResponse = await getObject(R2_ORDERS_BUCKET, pdfKey);
      if (pdfResponse.ok) {
        const arrayBuffer = await pdfResponse.arrayBuffer();
        bookPdfBuffer = Buffer.from(arrayBuffer);
      }
    } catch (error) {
      console.warn(`[Generate Approval PDF] Book PDF not found at ${pdfKey}, creating standalone approval PDF`);
    }

    // Generate HTML for approval page (shared with Amazon message attachment)
    const childName = order.childName || 'your child';
    const html = buildApprovalPageHtml(approvalUrl, childName, orderId);

    // For now, return HTML that can be converted to PDF manually
    // In the future, we can use a PDF generation service or library
    // For Cloudflare Workers compatibility, we'll return HTML that can be printed to PDF
    
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="approval-${orderId}.html"`,
      },
    });

    // TODO: When PDF generation library is available, merge book PDF with approval page
    // For now, users can:
    // 1. Open the HTML in browser
    // 2. Print to PDF (Ctrl+P / Cmd+P)
    // 3. Or attach the HTML file directly (Amazon allows HTML attachments)

  } catch (error: any) {
    console.error('[Generate Approval PDF] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate approval PDF' },
      { status: 500 }
    );
  }
}

