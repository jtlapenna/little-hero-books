import { listObjects, R2_ORDERS_BUCKET } from '@/lib/r2-client';

async function main() {
  const prefix = process.argv[2];
  if (!prefix) {
    throw new Error('usage: tsx scripts/tmp-list-r2-prefix.ts <prefix>');
  }

  const result = await listObjects(R2_ORDERS_BUCKET, { prefix, maxKeys: 500 });
  console.log(JSON.stringify(result.Contents ?? [], null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
