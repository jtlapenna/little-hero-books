/**
 * API Route: Generate PDF with Approval Link
 * 
 * GET /api/orders/[orderId]/generate-approval-pdf
 * 
 * Generates a PDF that includes the book preview with an embedded approval link.
 * This PDF can be manually attached to Amazon messages while API authorization is being resolved.
 */

import { NextRequest, NextResponse } from 'next/server';
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

    // Generate HTML for approval page
    const childName = order.childName || 'your child';
    const html = generateApprovalPageHtml(approvalUrl, childName, orderId);

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

/**
 * Generate HTML page with approval link that can be converted to PDF
 */
function generateApprovalPageHtml(approvalUrl: string, childName: string, orderId: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Personalized Book Preview - ${orderId}</title>
  <style>
    /* Force browsers to preserve colors when printing */
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    
    @media print {
      body { margin: 0; padding: 0; }
      /* Ensure colors are preserved in print */
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
      /* Ensure links are preserved and visible */
      a {
        color: #ffffff !important;
        text-decoration: none !important;
      }
      a[href]:after {
        content: "" !important; /* Remove default URL printing */
      }
    }
    body {
      font-family: Arial, sans-serif;
      background: #f7f9fb;
      color: #1f2933;
      padding: 40px 20px;
      max-width: 800px;
      margin: 0 auto;
    }
    .card {
      background: #ffffff;
      border-radius: 12px;
      padding: 40px;
      box-shadow: 0 4px 12px rgba(31, 41, 51, 0.1);
      text-align: center;
    }
    h1 {
      color: #1f2933;
      font-size: 28px;
      margin-bottom: 16px;
    }
    p {
      color: #52606d;
      font-size: 16px;
      line-height: 1.6;
      margin-bottom: 24px;
    }
    .cta-button {
      display: inline-block;
      padding: 16px 32px;
      background: #f9786b !important;
      color: #ffffff !important;
      border-radius: 8px;
      text-decoration: none !important;
      font-weight: bold;
      font-size: 18px;
      margin: 24px 0;
      transition: background 0.2s;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    .cta-button:hover {
      background: #e8695c;
    }
    /* Ensure link is clickable and styled in print */
    .cta-button[href] {
      color: #ffffff !important;
      background-color: #f9786b !important;
    }
    .approval-url {
      background: #f0f4f8 !important;
      border: 1px solid #cbd5e0 !important;
      border-radius: 6px;
      padding: 12px;
      margin: 20px 0;
      word-break: break-all;
      font-family: monospace;
      font-size: 12px;
      color: #1f2933 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    .instructions {
      background: #fff8e1 !important;
      border-left: 4px solid #ffc107 !important;
      padding: 16px;
      margin: 24px 0;
      text-align: left;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    .instructions h3 {
      margin-top: 0;
      color: #f57c00 !important;
    }
    .instructions ol {
      margin: 12px 0;
      padding-left: 24px;
    }
    .instructions li {
      margin: 8px 0;
    }
    .footer {
      margin-top: 40px;
      padding-top: 24px;
      border-top: 1px solid #e2e8f0;
      font-size: 12px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Your Personalized Book Preview is Ready!</h1>
    
    <p>Hi there! Your personalized storybook for <strong>${childName}</strong> is ready for review.</p>
    
    <p>Please click the button below to view your book preview and approve it for printing:</p>
    
    <a href="${approvalUrl}" class="cta-button" target="_blank" rel="noopener noreferrer">
      Review & Approve Your Book
    </a>
    
    <div class="approval-url">
      <strong>Approval Link:</strong><br>
      ${approvalUrl}
    </div>
    
    <div class="instructions">
      <h3>What happens next?</h3>
      <ol>
        <li>Click the button above to view your book preview</li>
        <li>Review all pages to ensure everything looks perfect</li>
        <li>Click "Approve Book" when you're ready</li>
        <li>If you need any changes, click "I need a correction" and let us know</li>
      </ol>
      <p><strong>Note:</strong> If we don't hear from you within 3 days, we'll automatically approve your book and begin printing.</p>
    </div>
    
    <div class="footer">
      <p><strong>Order ID:</strong> ${orderId}</p>
      <p>Every child is the hero of their own story.<br>Little Hero Books</p>
      <p>Need help? Reply to this message or email hello@littleherobooks.com</p>
    </div>
  </div>
</body>
</html>`;
}


