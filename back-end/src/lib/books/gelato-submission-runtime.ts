import { createHash } from 'node:crypto';
import { createGelatoStoredFileVerifier } from './gelato-stored-file';
import { resolveCanonicalBackendBaseUrl } from '@/lib/backend-url';
import { getOrderFromSupabase } from '@/lib/supabase-client';
import { downloadManifest } from '@/lib/r2-service';
import { getObject, headObject, R2_ORDERS_BUCKET } from '@/lib/r2-client';
import { buildW4PrintInput } from './w4-print-input';
import { assertW4GelatoPrintInput } from './w4-gelato-print-input';
import { gelatoSubmissionStore } from './gelato-submission-store';
import type { GelatoSubmissionDependencies } from './gelato-submission';
import { assertGelatoPrintOwnershipForOrder } from './gelato-print-ownership';
import { canonicalW0RoutingKey, type PrintRoutingOrder } from './print-routing';

type RuntimeSources = {
  loadOrder?: GelatoSubmissionDependencies['loadOrder'];
  loadManifest?: typeof downloadManifest;
};

export function gelatoSubmissionRuntime(sources: RuntimeSources = {}): GelatoSubmissionDependencies {
  const backendUrl = resolveCanonicalBackendBaseUrl();
  const loadOrder = sources.loadOrder ?? getOrderFromSupabase;
  const loadManifest = sources.loadManifest ?? downloadManifest;
  return {
    store: gelatoSubmissionStore, backendUrl,
    verifyStoredFile: createGelatoStoredFileVerifier({ loadArtifact: (key, signal) => getObject(R2_ORDERS_BUCKET, key, { signal, redirect: 'manual', allowErrorResponse: true }) }),
    loadOrder,
    loadPrintInput: async (orderId) => {
      const row = await loadOrder(orderId);
      assertGelatoPrintOwnershipForOrder(orderId, row);
      const { bookId } = canonicalW0RoutingKey(row as PrintRoutingOrder);
      return assertW4GelatoPrintInput(await buildW4PrintInput({ orderId, bookId }, {
        loadManifest, loadOrder: async (key) => key === orderId ? row : loadOrder(key),
        defaultBackendUrl: backendUrl, expectedProvider: 'gelato',
      }));
    },
    artifactExists: async (key) => (await headObject(R2_ORDERS_BUCKET, key)).ok,
    draftsEnabled: process.env.GELATO_DRAFT_SUBMISSION_ENABLED === 'true',
    engineeringDraftsAllowed: async (identity) => {
      const key = process.env.GELATO_API_KEY;
      if (!key?.trim()) return false;
      const allowed = await gelatoSubmissionStore.transition('gelato_engineering_submission_allowed', {
        p_submission_id: identity.submissionId, p_token: identity.claimToken,
        p_key_sha256: createHash('sha256').update(key).digest('hex'),
      });
      return allowed === true;
    },
    merchantEmail: process.env.GELATO_MERCHANT_CONTACT_EMAIL,
  };
}
