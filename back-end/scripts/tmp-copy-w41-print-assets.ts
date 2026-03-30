import { r2Client, R2_ORDERS_BUCKET } from '@/lib/r2-client';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function encodeS3Key(key: string): string {
  return key.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

function buildTargetOrderId(rootGroupId: string, itemIndex: number): string {
  return `${rootGroupId}-item-${itemIndex}`;
}

async function copyObject(sourceKey: string, targetKey: string, accountId: string) {
  const url = `https://${R2_ORDERS_BUCKET}.${accountId}.r2.cloudflarestorage.com/${encodeS3Key(targetKey)}`;
  const request = new Request(url, {
    method: 'PUT',
    headers: {
      Host: `${R2_ORDERS_BUCKET}.${accountId}.r2.cloudflarestorage.com`,
      'x-amz-copy-source': `/${R2_ORDERS_BUCKET}/${encodeS3Key(sourceKey)}`,
    },
  });
  const signed = await r2Client.sign(request);
  const response = await fetch(signed);
  if (!response.ok) {
    throw new Error(
      `R2 copy failed (${response.status} ${response.statusText}) ${sourceKey} -> ${targetKey}: ${await response.text()}`,
    );
  }
}

async function main() {
  const [targetRootGroupId, sourceOrderA, sourceOrderB] = process.argv.slice(2);
  if (!targetRootGroupId || !sourceOrderA || !sourceOrderB) {
    throw new Error(
      'usage: tsx scripts/tmp-copy-w41-print-assets.ts <targetRootGroupId> <sourceOrderA> <sourceOrderB>',
    );
  }

  const accountId = requireEnv('CLOUDFLARE_ACCOUNT_ID');
  const targets = [
    {
      sourceOrderId: sourceOrderA,
      targetOrderId: buildTargetOrderId(targetRootGroupId, 1),
    },
    {
      sourceOrderId: sourceOrderB,
      targetOrderId: buildTargetOrderId(targetRootGroupId, 2),
    },
  ];

  for (const target of targets) {
    await copyObject(
      `book-mvp-simple-adventure/orders/${target.sourceOrderId}/interior_${target.sourceOrderId}.pdf`,
      `book-mvp-simple-adventure/orders/${target.targetOrderId}/interior_${target.targetOrderId}.pdf`,
      accountId,
    );
    await copyObject(
      `book-mvp-simple-adventure/orders/${target.sourceOrderId}/cover_${target.sourceOrderId}.pdf`,
      `book-mvp-simple-adventure/orders/${target.targetOrderId}/cover_${target.targetOrderId}.pdf`,
      accountId,
    );
  }

  console.log(
    JSON.stringify(
      {
        success: true,
        targetRootGroupId,
        copiedFrom: [sourceOrderA, sourceOrderB],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
