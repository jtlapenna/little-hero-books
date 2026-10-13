import { getAmazonSpApiConfig } from '@/lib/amazon-sp-api';
import { confirmAmazonShipment } from '@/lib/notifications/amazon-shipment';
import { sendD2CImmutableEmail } from '@/lib/notifications/d2c-email';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createGelatoSubmissionStore } from './gelato-submission-store';
import type { GelatoNotificationDeliveryDependencies } from './gelato-notification-delivery';

export function gelatoNotificationRuntime(signal?: AbortSignal, database?: SupabaseClient): GelatoNotificationDeliveryDependencies {
  return { store: createGelatoSubmissionStore(database, signal), enabled: process.env.GELATO_NOTIFICATIONS_ENABLED === 'true',
    ready: (payload) => payload.kind === 'amazon-shipped' ? getAmazonSpApiConfig().ok : Boolean(process.env.RESEND_API_KEY?.trim()) &&
      (process.env.D2C_EMAIL_ENABLED === 'true' || (process.env.D2C_EMAIL_ENABLED !== 'false' && process.env.NODE_ENV === 'production')),
    send: async (payload, idempotencyKey, signal) => {
      if (payload.kind !== 'amazon-shipped') return sendD2CImmutableEmail({ ...payload.email, idempotencyKey, signal });
      if (!payload.packageReferenceId) throw new Error('Exact Amazon package reference missing');
      return confirmAmazonShipment({ amazonOrderId: payload.amazonOrderId, order: { amazon_order_id: payload.amazonOrderId },
        trackingNumber: payload.trackingNumber, trackingUrl: payload.trackingUrl, carrier: payload.carrier, signal,
        exactPackage: { packageReferenceId: payload.packageReferenceId, shipDate: payload.shipDate, orderItems: payload.orderItems } });
    } };
}
