import { getObject, putObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { getOrderFromSupabase, upsertOrderByPerBookId } from '@/lib/supabase-client';
import type { W0ManifestStorage } from './freeze-w0-manifest';

export const w0ManifestStorage: W0ManifestStorage = {
  loadOrder: getOrderFromSupabase,
  loadManifest: async (key) => {
    const response = await getObject(R2_ORDERS_BUCKET, key, { allowNotFound: true });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Canonical W0 manifest read failed (${response.status})`);
    return response.json();
  },
  createManifest: async (key, manifest) => {
    const response = await putObject(R2_ORDERS_BUCKET, key, JSON.stringify(manifest), 'application/json', { ifNoneMatch: '*' });
    return response.ok;
  },
  persistOrder: (payload) => upsertOrderByPerBookId(payload, { preserveFrozenIntake: true }),
};
