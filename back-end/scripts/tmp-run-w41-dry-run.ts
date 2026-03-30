import { createClient } from '@supabase/supabase-js';

async function main() {
  const rootGroupId = process.argv[2];
  if (!rootGroupId) {
    throw new Error('usage: tsx scripts/tmp-run-w41-dry-run.ts <rootGroupId>');
  }

  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl) throw new Error('Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
  if (!supabaseKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: siblingGroup, error } = await supabase
    .from('orders')
    .select('*')
    .eq('root_order_id', rootGroupId)
    .order('id', { ascending: true });

  if (error) throw error;
  if (!siblingGroup || siblingGroup.length < 2) {
    throw new Error(`Expected sibling group for ${rootGroupId}`);
  }

  const payload = {
    rootGroupId,
    rootOrderId: rootGroupId,
    backendUrl: 'https://admin.littleherolabs.com',
    allowProductionLulu: true,
    productionDryRun: true,
    claimedAt: new Date().toISOString(),
    siblingGroup,
  };

  const response = await fetch(
    'https://thepeakbeyond.app.n8n.cloud/webhook/w4-1-sibling-aggregation-repo',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );

  const text = await response.text();
  console.log(
    JSON.stringify(
      {
        status: response.status,
        body: text,
        claimedAt: payload.claimedAt,
        rootGroupId,
        orderIds: siblingGroup.map((row) => row.order_id),
        rowIds: siblingGroup.map((row) => row.id),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
