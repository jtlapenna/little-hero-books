import { headObject, R2_PUBLIC_BUCKET } from '@/lib/r2-client';
import { buildCharacterAssetPrefix } from '@/lib/order-paths';
import { supabase } from '@/lib/supabase-client';

export interface ResolvedPreviewAsset {
  imageUrl: string;
  r2Key: string;
  source: 'preview' | 'base-character';
  characterHash?: string;
}

interface PreviewOrderRow {
  character_hash?: string | null;
  created_at?: string | null;
  project?: string | null;
  book_id?: string | null;
}

function buildAssetUrl(r2Key: string): string {
  return `/api/assets/${r2Key}`;
}

async function assetExists(r2Key: string): Promise<boolean> {
  const response = await headObject(R2_PUBLIC_BUCKET, r2Key);
  return response.ok;
}

async function findOrdersByPreviewHash(
  previewHash: string,
  bookId: string,
): Promise<PreviewOrderRow[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('character_hash, created_at, project, book_id')
    .eq('preview_hash', previewHash)
    .not('character_hash', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.warn('[Preview Cache] Failed to query orders by preview_hash:', previewHash, error.message);
    return [];
  }
  return ((data ?? []) as PreviewOrderRow[]).filter((row) => {
    const rowBookId =
      typeof row.book_id === 'string' && row.book_id.trim()
        ? row.book_id.trim()
        : typeof row.project === 'string' && row.project.trim()
          ? row.project.trim()
          : null;
    return rowBookId === bookId;
  });
}

export async function resolveReusablePreviewAsset(
  previewHash: string,
  bookId: string,
): Promise<ResolvedPreviewAsset | null> {
  const previewKey = `${buildCharacterAssetPrefix(previewHash, bookId)}/preview.png`;
  if (await assetExists(previewKey)) {
    return {
      imageUrl: buildAssetUrl(previewKey),
      r2Key: previewKey,
      source: 'preview',
    };
  }

  const matchingOrders = await findOrdersByPreviewHash(previewHash, bookId);
  const seen = new Set<string>();

  for (const row of matchingOrders) {
    const characterHash = row.character_hash?.trim();
    if (!characterHash || seen.has(characterHash)) continue;
    seen.add(characterHash);

    const baseCharacterKey = `${buildCharacterAssetPrefix(characterHash, bookId)}/base-character.png`;
    if (!(await assetExists(baseCharacterKey))) continue;

    return {
      imageUrl: buildAssetUrl(baseCharacterKey),
      r2Key: baseCharacterKey,
      source: 'base-character',
      characterHash,
    };
  }

  return null;
}
