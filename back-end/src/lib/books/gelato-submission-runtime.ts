import { createGelatoStoredFileVerifier } from './gelato-stored-file';
import { resolveCanonicalBackendBaseUrl } from '@/lib/backend-url';
import { getOrderFromSupabase } from '@/lib/supabase-client';
import { downloadManifest } from '@/lib/r2-service';
import { getObject, headObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { buildW4PrintInput } from './w4-print-input';
import { assertW4GelatoPrintInput } from './w4-gelato-print-input';
import { gelatoSubmissionStore } from './gelato-submission-store';
import type { GelatoSubmissionDependencies } from './gelato-submission';

export function gelatoSubmissionRuntime(): GelatoSubmissionDependencies {
  const backendUrl = resolveCanonicalBackendBaseUrl();
  return {
    store: gelatoSubmissionStore, backendUrl,
    verifyStoredFile: createGelatoStoredFileVerifier({ loadArtifact: (key, signal) => getObject(R2_ORDERS_BUCKET, key, { signal, redirect: 'error', allowErrorResponse: true }) }),
    loadOrder: getOrderFromSupabase,
    loadPrintInput: async (orderId) => assertW4GelatoPrintInput(await buildW4PrintInput({ orderId }, {
      loadManifest: downloadManifest, loadOrder: getOrderFromSupabase, defaultBackendUrl: backendUrl, expectedProvider: 'gelato',
    })),
    artifactExists: async (key) => (await headObject(R2_ORDERS_BUCKET, key)).ok,
    draftsEnabled: process.env.GELATO_DRAFT_SUBMISSION_ENABLED === 'true',
    merchantEmail: process.env.GELATO_MERCHANT_CONTACT_EMAIL,
  };
}
