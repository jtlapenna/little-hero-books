#!/usr/bin/env node

/**
 * Test script for RenderPDF.io integration
 * This script tests the RenderPDF.io API with a simple HTML page
 */

const https = require('https');

// Test HTML content (simple page)
const testHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Test Page</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 40px;
            background-color: #f0f0f0;
        }
        .page {
            background: white;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            text-align: center;
        }
        p {
            color: #666;
            line-height: 1.6;
        }
    </style>
</head>
<body>
    <div class="page">
        <h1>Little Hero Books - Test Page</h1>
        <p>This is a test page to verify RenderPDF.io integration.</p>
        <p>If you can see this PDF, the integration is working correctly!</p>
        <p>Generated at: ${new Date().toISOString()}</p>
    </div>
</body>
</html>
`;

// RenderPDF.io API configuration
const API_KEY = process.env.RENDERPDF_API_KEY;
const API_URL = 'https://renderpdf.io/api/pdfs/render-sync';

if (!API_KEY) {
    console.error('❌ Error: RENDERPDF_API_KEY environment variable is required');
    console.log('Please set your RenderPDF.io API key:');
    console.log('export RENDERPDF_API_KEY="your-api-key-here"');
    process.exit(1);
}

async function testRenderPDF() {
    console.log('🚀 Testing RenderPDF.io integration...');
    console.log('📄 HTML content length:', testHtml.length, 'characters');
    
    const requestData = JSON.stringify({
        htmlContent: testHtml,
        filename: `test-page-${Date.now()}.pdf`
    });
    
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Length': Buffer.byteLength(requestData)
        }
    };
    
    try {
        console.log('📡 Sending request to RenderPDF.io...');
        
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: options.headers,
            body: requestData
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        
        console.log('✅ Success! RenderPDF.io response:');
        console.log('📄 PDF URL:', result.fileUrl);
        console.log('📊 Response:', JSON.stringify(result, null, 2));
        
        // Test downloading the PDF
        console.log('📥 Testing PDF download...');
        const pdfResponse = await fetch(result.fileUrl);
        
        if (pdfResponse.ok) {
            const pdfBuffer = await pdfResponse.arrayBuffer();
            console.log('✅ PDF downloaded successfully!');
            console.log('📏 PDF size:', pdfBuffer.byteLength, 'bytes');
        } else {
            console.log('❌ Failed to download PDF:', pdfResponse.statusText);
        }
        
    } catch (error) {
        console.error('❌ Error testing RenderPDF.io:', error.message);
        process.exit(1);
    }
}

// Run the test
testRenderPDF();
