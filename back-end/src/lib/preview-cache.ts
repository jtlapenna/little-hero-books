import { headObject, R2_CHARACTERS_PREFIX, R2_PUBLIC_BUCKET } from '@/lib/r2-client';
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
}

function buildAssetUrl(r2Key: string): string {
  return `/api/assets/${r2Key}`;
}

async function assetExists(r2Key: string): Promise<boolean> {
  const response = await headObject(R2_PUBLIC_BUCKET, r2Key);
  return response.ok;
}

async function findOrdersByPreviewHash(previewHash: string): Promise<PreviewOrderRow[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('character_hash, created_at')
    .eq('preview_hash', previewHash)
    .not('character_hash', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.warn('[Preview Cache] Failed to query orders by preview_hash:', previewHash, error.message);
    return [];
  }

  return (data ?? []) as PreviewOrderRow[];
}

export async function resolveReusablePreviewAsset(previewHash: string): Promise<ResolvedPreviewAsset | null> {
  const previewKey = `${R2_CHARACTERS_PREFIX}${previewHash}/preview.png`;
  if (await assetExists(previewKey)) {
    return {
      imageUrl: buildAssetUrl(previewKey),
      r2Key: previewKey,
      source: 'preview',
    };
  }

  const matchingOrders = await findOrdersByPreviewHash(previewHash);
  const seen = new Set<string>();

  for (const row of matchingOrders) {
    const characterHash = row.character_hash?.trim();
    if (!characterHash || seen.has(characterHash)) continue;
    seen.add(characterHash);

    const baseCharacterKey = `${R2_CHARACTERS_PREFIX}${characterHash}/base-character.png`;
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
