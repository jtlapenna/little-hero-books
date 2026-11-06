import type { SupabaseClient } from '@supabase/supabase-js';
import { isOvernightTestOrder } from '@/lib/messaging/test-order-guard';

/**
 * Customer/buyer notices sent by the router's Lulu tracking-poll fallback after it records a
 * SHIPPED/DELIVERED status. Moved verbatim out of the cron router so the guard is testable.
 * Marked overnight test orders get no message of any kind (the status update itself is still recorded).
 */
export async function sendLuluPollShipmentNotices(params: {
  supabase: SupabaseClient;
  order: any;
  statusName: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  carrier: string | null;
  nowIso: string;
}): Promise<{ confirmed: boolean; skipped?: 'overnight_test_order' }> {
  const { supabase, order: o, nowIso } = params;
  const name = params.statusName, tn = params.trackingNumber, tu = params.trackingUrl, cr = params.carrier;
  if (isOvernightTestOrder(o)) return { confirmed: false, skipped: 'overnight_test_order' };
  let confirmed = false;

  // Confirm shipment for Amazon orders
  if ((o.platform ?? 'amazon') !== 'd2c' && o.amazon_order_id) {
    const orderId = o.amazon_order_id;
    const { data: already } = await supabase.from('notification_logs').select('id').eq('order_id', String(orderId)).eq('notification_type', 'amazon_confirm_shipment').eq('status', 'sent').maybeSingle();
    if (!already) {
      const { confirmAmazonShipment } = await import('@/lib/notifications/amazon-shipment');
      const r = await confirmAmazonShipment({ amazonOrderId: String(orderId), order: o, trackingNumber: tn, carrier: cr, trackingUrl: tu });
      await supabase.from('notification_logs').insert({ order_id: String(orderId), notification_type: 'amazon_confirm_shipment', status: r.success ? 'sent' : 'failed', recipient: String(orderId), error_message: r.error ?? null, sent_at: r.success ? nowIso : null });
      if (r.success) confirmed = true;
    }
  }

  if (name === 'SHIPPED' && (o.platform ?? 'amazon') === 'd2c' && o.customer_email?.trim()) {
    const orderIdForLog = o.orderId ?? String(o.id);
    const { sendD2CShippedEmail } = await import('@/lib/notifications/d2c-email');
    const childName = o.character_specs?.childName ?? o.character_specs?.child_name ?? undefined;
    await sendD2CShippedEmail({
      to: o.customer_email.trim(),
      childName,
      trackingUrl: tu ?? undefined,
      trackingNumber: tn ?? undefined,
      carrier: cr ?? undefined,
      orderId: String(orderIdForLog),
    });
  }
  return { confirmed };
}
