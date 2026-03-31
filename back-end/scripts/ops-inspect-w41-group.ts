import { inspectW41ProductionGroup } from '@/lib/w41-production-preflight';

async function main() {
  const rootGroupId = process.argv[2];
  if (!rootGroupId) {
    throw new Error('usage: tsx scripts/ops-inspect-w41-group.ts <rootGroupId>');
  }

  const inspection = await inspectW41ProductionGroup(rootGroupId, {
    adminBaseUrl: 'https://admin.littleherolabs.com',
  });
  console.log(JSON.stringify(inspection, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
