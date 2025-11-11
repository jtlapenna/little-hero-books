/**
 * Execute SQL directly via Supabase REST API
 * Uses the PostgREST admin endpoint if available
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

async function executeSQL() {
  const sqlFile = path.resolve(__dirname, '../../docs/n8n-workflow-files/end-to-end-testing/create-get-queue-status-function-NO-DECLARE.sql');
  const sql = fs.readFileSync(sqlFile, 'utf8');

  console.log('\n🔧 Executing SQL via Supabase...\n');
  console.log('SQL:', sql.substring(0, 200) + '...\n');

  // Supabase doesn't expose raw SQL execution via REST API for security
  // We need to use psql or the Supabase Dashboard
  // But let's try the management API endpoint
  
  try {
    // Try Supabase Management API (if available)
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: sql })
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ SQL executed successfully!');
      console.log(result);
      return;
    }
  } catch (e) {
    // Management API not available
  }

  // Fallback: Use psql if we have connection string
  console.log('📝 Management API not available. Using psql...\n');
  
  // For Supabase, we need the direct database connection string
  // This is usually in the Supabase dashboard under Settings > Database
  // Connection string format: postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
  
  console.log('💡 To execute via psql, you need the database password from Supabase Dashboard');
  console.log('   Settings > Database > Connection string > URI\n');
  
  console.log('📋 SQL to execute:');
  console.log('='.repeat(60));
  console.log(sql);
  console.log('='.repeat(60));
  console.log('\n💡 Copy the SQL above and run it in:');
  console.log('   1. Supabase Dashboard → SQL Editor');
  console.log('   2. Or via psql with connection string\n');
}

executeSQL().catch(console.error);

