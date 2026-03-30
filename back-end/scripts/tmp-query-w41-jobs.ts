import { createClient } from '@supabase/supabase-js';

async function main() {
  const rootGroupId = process.argv[2];
  if (!rootGroupId) throw new Error('usage: tsx scripts/tmp-query-w41-jobs.ts <rootGroupId>');

  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!supabaseKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('workflow_jobs')
    .select('id,order_id,job_type,status,claimed_at,started_at,last_error,updated_at')
    .eq('order_id', rootGroupId)
    .eq('job_type', 'w4-sibling-aggregation')
    .order('id', { ascending: false });

  if (error) throw error;
  console.log(JSON.stringify(data, null, 2));
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error(error.stack || error.message);
  } else {
    console.error(JSON.stringify(error, null, 2));
  }
  process.exit(1);
});
