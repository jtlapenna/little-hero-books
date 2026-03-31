import { buildW4PrintInput } from '@/lib/books/w4-print-input';
import { downloadManifest } from '@/lib/r2-service';
import { getOrderFromSupabase, supabase } from '@/lib/supabase-client';

async function main() {
  const orderId = process.argv[2];
  if (!orderId) {
    throw new Error('usage: tsx scripts/ops-inspect-w4-order.ts <orderId>');
  }

  const { data: row, error } = await supabase.from('orders').select('*').eq('orderId', orderId).maybeSingle();
  if (error) throw error;
  if (!row) throw new Error(`Order not found: ${orderId}`);

  const result = await buildW4PrintInput(
    row,
    {
      loadManifest: downloadManifest,
      loadOrder: getOrderFromSupabase,
      defaultBackendUrl: 'https://admin.littleherolabs.com',
    },
  );

  const manifest3 = (await downloadManifest(result.manifest3Key).catch(() => null)) as
    | Record<string, unknown>
    | null;

  console.log(
    JSON.stringify(
      {
        orderId: result.orderId,
        rootOrderId: result.rootOrderId,
        expectedPageCount: result.expectedPageCount,
        oneManifestKey: result.oneManifestKey,
        manifest3OneManifestUrl: manifest3?.oneManifestUrl ?? null,
        manifest3OneManifestKey: manifest3?.oneManifestKey ?? null,
        manifest3Key: result.manifest3Key,
        pdfR2Key: result.pdfR2Key,
        coverPdfR2Key: result.coverPdfR2Key,
        coverPreviewImageKey: result.coverPreviewImageKey,
        pagePreviewImageKeys: result.pagePreviewImageKeys,
        shippingAddress: result.shippingAddress,
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
