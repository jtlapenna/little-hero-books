#!/usr/bin/env tsx
/**
 * Compare order status calculation between local and production
 * 
 * This script helps diagnose why orders show different statuses
 * between local and live environments.
 * 
 * Usage:
 *   npm run compare:status -- ORDER_ID
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
// Note: This script runs in Node.js context, not Next.js
// We'll use direct Supabase queries instead of Next.js-specific imports

// Load environment variables
const envPath = path.join(__dirname, '..', '.env.local');
dotenv.config({ path: envPath });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function compareOrderStatus(orderId: string) {
  console.log(`\n🔍 Analyzing order: ${orderId}\n`);
  console.log('=' .repeat(80));

  try {
    // Get raw database record
    const { data: record, error } = await supabase
      .from('orders')
      .select('*')
      .or(`orderId.eq.${orderId},amazon_order_id.eq.${orderId}`)
      .single();

    if (error || !record) {
      console.error('❌ Order not found in database:', error?.message);
      process.exit(1);
    }

    console.log('\n📊 DATABASE RECORD:');
    console.log('-'.repeat(80));
    console.log(`Order ID: ${record.orderId || record.amazon_order_id}`);
    console.log(`Status (DB field): ${record.status || 'null'}`);
    console.log(`Execution Status: ${record.execution_status || 'null'}`);
    console.log(`Workflow Step: ${record.workflow_step || 'null'}`);
    console.log(`Character Hash: ${record.character_hash || 'null'}`);
    
    console.log('\n📋 REVIEW STAGES:');
    console.log('-'.repeat(80));
    const reviewStages = record.review_stages || {};
    console.log(`preBria.status: ${reviewStages.preBria?.status || 'null/undefined'}`);
    console.log(`preBria (full):`, JSON.stringify(reviewStages.preBria || {}, null, 2));
    console.log(`postBria.status: ${reviewStages.postBria?.status || 'null/undefined'}`);
    console.log(`postPdf.status: ${reviewStages.postPdf?.status || 'null/undefined'}`);
    
    console.log('\n🚩 FLAGS:');
    console.log('-'.repeat(80));
    const flags = record.flags || {};
    console.log(`has_flags: ${record.has_flags || false}`);
    console.log(`Flags:`, JSON.stringify(flags, null, 2));

    // Diagnostic checks (matching the logic in status-display.ts)
    console.log('\n🔬 STATUS CALCULATION LOGIC:');
    console.log('-'.repeat(80));
    
    const preBriaStatus = reviewStages.preBria?.status || 'pending';
    const preBriaHasProgress = preBriaStatus !== 'pending' && 
                               preBriaStatus !== undefined && 
                               preBriaStatus !== '';
    
    // Check if we can determine hasPoses
    // In list views, r2Assets might not be loaded, so we rely on preBriaHasProgress
    const hasPoses = preBriaHasProgress; // Simplified for diagnostic - in real code, also checks r2Assets.poses
    
    const rawStatus = record.status || 'new';
    const isNewOrProcessing = rawStatus === 'new' || 
                              rawStatus === 'pending_processing' || 
                              rawStatus === 'queued_for_processing' ||
                              rawStatus === 'ai_generation_in_progress';
    
    console.log(`preBria.status: "${preBriaStatus}"`);
    console.log(`preBriaHasProgress: ${preBriaHasProgress} (status !== "pending")`);
    console.log(`hasPoses (estimated): ${hasPoses} (based on preBriaHasProgress)`);
    console.log(`Raw Status: "${rawStatus}"`);
    console.log(`Is New/Processing: ${isNewOrProcessing}`);
    
    console.log('\n🎯 EXPECTED STATUS:');
    console.log('-'.repeat(80));
    if (!hasPoses && isNewOrProcessing) {
      console.log('✅ Should show: IN_QUEUE (no images yet, order is new/processing)');
    } else if (hasPoses && preBriaStatus !== 'approved') {
      console.log('✅ Should show: REVIEW_POSES (images exist, preBria not approved)');
    } else if (preBriaStatus === 'approved' && reviewStages.postBria?.status !== 'approved') {
      console.log('✅ Should show: REVIEW_BACKGROUNDS (preBria approved, postBria not)');
    } else {
      console.log('✅ Should show: Based on other stage statuses');
    }
    
    console.log('\n💡 COMPARISON WITH LIVE SITE:');
    console.log('-'.repeat(80));
    console.log('If live shows "Review Poses" but local shows "In Queue":');
    console.log('  → Live database likely has preBria.status = "needs_review" or "in-review"');
    console.log('  → Local database likely has preBria.status = "pending" or null');
    console.log('\nIf live shows different status:');
    console.log('  → Check review_stages values in both databases');
    console.log('  → Check if code versions are different (live might be older)');

    console.log('\n');
    console.log('=' .repeat(80));
    console.log('✅ Analysis complete');
    console.log('=' .repeat(80));
    console.log('\n💡 TIP: Compare this output with the live site to see what differs.');
    console.log('   Key things to check:');
    console.log('   - review_stages.preBria.status values');
    console.log('   - r2Assets.poses data');
    console.log('   - Character hash presence');

  } catch (error: any) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Get order ID from command line
const orderId = process.argv[2];
if (!orderId) {
  console.error('❌ Please provide an order ID');
  console.error('Usage: npm run compare:status -- ORDER_ID');
  process.exit(1);
}

compareOrderStatus(orderId);

