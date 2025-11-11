/**
 * Create get_queue_status function in Supabase
 * Uses Supabase client to execute SQL directly
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('   Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createFunction() {
  console.log('\n🔧 Creating get_queue_status function...\n');
  console.log('='.repeat(60));

  // Read the SQL file
  const sqlFile = path.resolve(__dirname, '../../docs/n8n-workflow-files/end-to-end-testing/create-get-queue-status-function-NO-DECLARE.sql');
  const sql = fs.readFileSync(sqlFile, 'utf8');

  console.log('📄 SQL to execute:');
  console.log('-'.repeat(60));
  console.log(sql);
  console.log('-'.repeat(60));
  console.log('');

  // Execute SQL using Supabase RPC (we'll use the REST API directly)
  try {
    // Supabase doesn't have a direct SQL execution endpoint via JS client
    // We need to use the REST API with rpc or execute raw SQL
    // Actually, let's try using the PostgREST admin endpoint or direct SQL
    
    // For Supabase, we can use the REST API to execute functions
    // But for creating functions, we need to use the SQL editor or psql
    
    // Let's try using fetch to call Supabase's management API
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ sql })
    });

    if (!response.ok) {
      // Try alternative: use Supabase's SQL execution if available
      // Or we can construct a psql command
      console.log('⚠️  Direct SQL execution not available via REST API');
      console.log('📝 Using psql instead...\n');
      
      // Extract connection details from URL
      const url = new URL(supabaseUrl);
      const host = url.hostname;
      const dbName = url.pathname.split('/').pop() || 'postgres';
      
      // Construct connection string (we'll need the password from env or connection pooler)
      // Actually, Supabase uses connection pooling, so we need the direct connection string
      // Let's try a different approach - use the Supabase client's ability to execute raw SQL
      
      console.log('💡 Attempting to execute via Supabase client...\n');
      
      // Split SQL into individual statements
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      for (const statement of statements) {
        if (statement.toLowerCase().startsWith('select')) {
          // For SELECT, we can use the client
          console.log(`Executing: ${statement.substring(0, 50)}...`);
        } else {
          // For DDL, we need psql or Supabase dashboard
          console.log(`⚠️  Cannot execute DDL via client: ${statement.substring(0, 50)}...`);
        }
      }
      
      console.log('\n❌ Cannot execute DDL (CREATE FUNCTION) via Supabase JS client');
      console.log('📝 Please run the SQL in Supabase Dashboard SQL Editor');
      console.log(`   File: ${sqlFile}\n`);
      
      return;
    }

    const result = await response.json();
    console.log('✅ Function created successfully!');
    console.log(result);
    
    // Test the function
    console.log('\n🧪 Testing function...');
    const { data, error } = await supabase.rpc('get_queue_status');
    
    if (error) {
      console.log('❌ Error testing function:', error.message);
    } else {
      console.log('✅ Function works!');
      console.log(data);
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.log('\n📝 Alternative: Run SQL in Supabase Dashboard SQL Editor');
    console.log(`   File: ${sqlFile}\n`);
  }
}

createFunction().catch(console.error);

