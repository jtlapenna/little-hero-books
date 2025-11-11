/**
 * Create get_queue_status function using direct HTTP request to Supabase
 * Attempts to use PostgREST admin functions or direct SQL execution
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const sql = `DROP FUNCTION IF EXISTS get_queue_status() CASCADE;

CREATE OR REPLACE FUNCTION get_queue_status()
RETURNS TABLE (processing_count BIGINT, queued_count BIGINT) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(CASE WHEN execution_status = 'processing' THEN 1 END)::BIGINT,
    COUNT(CASE WHEN execution_status = 'ready_for_processing' THEN 1 END)::BIGINT
  FROM orders;
END;
$function$;

GRANT EXECUTE ON FUNCTION get_queue_status() TO service_role;`;

async function createFunction() {
  console.log('\n🔧 Attempting to create function via Supabase API...\n');

  // Try using Supabase's SQL execution endpoint (if it exists)
  // Note: Supabase typically doesn't expose raw SQL execution via REST API
  // But we can try the management API or use psql
  
  // Extract project ref from URL
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  
  if (!projectRef) {
    console.error('❌ Could not extract project reference from URL');
    process.exit(1);
  }

  console.log(`📡 Supabase URL: ${supabaseUrl}`);
  console.log(`🔑 Project Ref: ${projectRef}\n`);

  // Try multiple approaches
  const endpoints = [
    // Approach 1: Direct SQL execution (unlikely to work, but worth trying)
    `${supabaseUrl}/rest/v1/rpc/exec_sql`,
    // Approach 2: Management API (if available)
    `https://api.supabase.com/v1/projects/${projectRef}/sql`,
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`🔄 Trying: ${endpoint}...`);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({ 
          query: sql,
          sql: sql 
        })
      });

      const text = await response.text();
      
      if (response.ok) {
        console.log('✅ Success! Function created.');
        try {
          const json = JSON.parse(text);
          console.log(json);
        } catch {
          console.log(text);
        }
        return;
      } else {
        console.log(`❌ Failed: ${response.status} ${response.statusText}`);
        if (text) {
          console.log(`   Response: ${text.substring(0, 200)}`);
        }
      }
    } catch (error: any) {
      console.log(`❌ Error: ${error.message}`);
    }
  }

  console.log('\n📝 Supabase REST API does not support raw SQL execution.');
  console.log('💡 You need to run the SQL in Supabase Dashboard SQL Editor.\n');
  console.log('📋 SQL to execute:');
  console.log('='.repeat(60));
  console.log(sql);
  console.log('='.repeat(60));
  console.log('\n🔗 Go to: Supabase Dashboard → SQL Editor → New Query');
  console.log('   Paste the SQL above and click "Run"\n');
}

createFunction().catch(console.error);

