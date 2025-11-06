/**
 * Test Script: Generate Preview Token
 * 
 * Generates a test preview token for an existing order so you can view the preview page.
 * 
 * Usage:
 *   npm run test:preview-token <orderId>
 * 
 * Example:
 *   npm run test:preview-token TEST-ORDER-001
 */

import { generatePreviewToken } from '../src/lib/preview-tokens';
import { getOrderFromSupabase } from '../src/lib/supabase-client';

async function main() {
  const orderId = process.argv[2];

  if (!orderId) {
    console.error('❌ Error: Order ID is required');
    console.log('\nUsage: npm run test:preview-token <orderId>');
    console.log('Example: npm run test:preview-token TEST-ORDER-001');
    process.exit(1);
  }

  try {
    console.log(`\n🔍 Looking up order: ${orderId}...`);
    
    // Verify order exists
    const order = await getOrderFromSupabase(orderId);
    if (!order) {
      console.error(`❌ Order not found: ${orderId}`);
      console.log('\n💡 Tip: Check your Supabase database for existing orders');
      process.exit(1);
    }

    console.log(`✅ Order found: ${order.amazon_order_id || orderId}`);
    
    // Generate token
    console.log('\n🔐 Generating preview token...');
    const token = await generatePreviewToken(orderId);
    
    console.log('\n✅ Token generated successfully!');
    console.log('\n📋 Preview Details:');
    console.log(`   Order ID: ${orderId}`);
    console.log(`   Token: ${token}`);
    console.log(`   Expires: 3 days from now`);
    console.log(`\n🌐 Preview URL:`);
    console.log(`   http://localhost:3000/approve/${token}`);
    console.log(`\n💡 To view the page:`);
    console.log(`   1. Make sure your dev server is running: npm run dev`);
    console.log(`   2. Open the URL above in your browser`);
    console.log(`   3. The page is a placeholder - PDF preview will be added later`);
    console.log('\n');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.message.includes('Missing Supabase')) {
      console.log('\n💡 Make sure you have .env.local with:');
      console.log('   SUPABASE_URL=...');
      console.log('   SUPABASE_SERVICE_ROLE_KEY=...');
    }
    process.exit(1);
  }
}

main();

