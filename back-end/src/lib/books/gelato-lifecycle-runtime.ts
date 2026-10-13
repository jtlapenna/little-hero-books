import { getObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { createGelatoStoredFileVerifier } from './gelato-stored-file';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getOrderFromSupabase } from '@/lib/supabase-client';
import { createGelatoSubmissionStore } from './gelato-submission-store';
import type { GelatoLifecycleDependencies } from './gelato-lifecycle';
export function gelatoLifecycleRuntime(signal?: AbortSignal, database?: SupabaseClient): GelatoLifecycleDependencies {
  return { store: createGelatoSubmissionStore(database, signal), loadOrder: (id) => getOrderFromSupabase(id, signal),
    verifyStoredFile: createGelatoStoredFileVerifier({ signal, loadArtifact: (key, fileSignal) => getObject(R2_ORDERS_BUCKET, key, { signal: fileSignal, redirect: 'error', allowErrorResponse: true }) }),
    notificationFrom: process.env.D2C_EMAIL_FROM?.trim() || 'Little Hero Labs <notifications@littleherolabs.com>',
    cancelEnabled: process.env.GELATO_CANCEL_ENABLED === 'true' };
}
