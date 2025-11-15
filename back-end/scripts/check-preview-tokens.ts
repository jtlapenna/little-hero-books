#!/usr/bin/env tsx
/**
 * Check existing preview tokens in the database
 * Shows active, expired, and used tokens with their URLs
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
const envPath = path.join(__dirname, '..', '.env.local');
dotenv.config({ path: envPath });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('Required: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkTokens() {
  console.log('🔍 Checking preview tokens in database...\n');

  try {
    const { data: tokens, error } = await supabase
      .from('preview_tokens')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('❌ Error fetching tokens:', error);
      process.exit(1);
    }

    if (!tokens || tokens.length === 0) {
      console.log('⚠️  No tokens found in database');
      console.log('\n💡 To create a token, run:');
      console.log('   npm run test:preview-token <orderId>');
      return;
    }

    console.log(`✅ Found ${tokens.length} tokens\n`);
    console.log('═'.repeat(80));
    console.log('PREVIEW TOKENS');
    console.log('═'.repeat(80));
    console.log('');

    let activeCount = 0;
    let expiredCount = 0;
    let usedCount = 0;

    tokens.forEach((token, i) => {
      const isExpired = new Date(token.expires_at) < new Date();
      const isUsed = !!token.used_at;
      let status = '';
      
      if (isUsed) {
        status = '🔒 USED';
        usedCount++;
      } else if (isExpired) {
        status = '⏰ EXPIRED';
        expiredCount++;
      } else {
        status = '✅ ACTIVE';
        activeCount++;
      }

      console.log(`${i + 1}. ${status}`);
      console.log(`   Order ID: ${token.order_id}`);
      console.log(`   Token: ${token.token}`);
      console.log(`   Created: ${new Date(token.created_at).toLocaleString()}`);
      console.log(`   Expires: ${new Date(token.expires_at).toLocaleString()}`);
      if (token.used_at) {
        console.log(`   Used At: ${new Date(token.used_at).toLocaleString()}`);
      }
      console.log(`   Frontend URL: http://localhost:4555/approve/${token.token}`);
      console.log('');
    });

    console.log('─'.repeat(80));
    console.log('SUMMARY:');
    console.log(`   Active: ${activeCount}`);
    console.log(`   Expired: ${expiredCount}`);
    console.log(`   Used: ${usedCount}`);
    console.log(`   Total: ${tokens.length}`);
    console.log('─'.repeat(80));

  } catch (error: any) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

checkTokens();

