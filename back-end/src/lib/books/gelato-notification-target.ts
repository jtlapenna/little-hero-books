import { z } from 'zod';
export const GelatoNotificationTargetSchema = z.object({ childOrderId: z.number().int().positive(), childOrderKey: z.string(),
  platform: z.enum(['amazon', 'd2c']), customerEmail: z.string().nullable(), childName: z.string(),
  amazonOrderId: z.string().nullable(), amazonOrderItemId: z.string().nullable() });
export function gelatoObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') { try { return gelatoObject(JSON.parse(value)); } catch { return {}; } }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
export function exactGelatoAmazonItemId(row: Record<string, unknown>): string | null {
  const product = gelatoObject(row.product_info);
  const ids = [text(row.order_item_id), text(product._order_item_id), text(product.order_item_id)].filter(Boolean);
  const lines = Array.isArray(product.line_items) ? product.line_items.map(gelatoObject) : [];
  if (lines.length === 1) ids.push(text(lines[0].order_item_id));
  return ids.length && ids.every((id) => id && id === ids[0]) ? ids[0] : null;
}
export function gelatoNotificationTarget(row: Record<string, unknown>, orderKey: string) {
  const amazonOrderId = text(row.amazon_order_id ?? row.root_order_id);
  return GelatoNotificationTargetSchema.parse({ childOrderId: row.id, childOrderKey: orderKey,
    platform: row.platform === 'amazon' || /^\d{3}-\d{7}-\d{7}$/.test(amazonOrderId) ? 'amazon' : 'd2c',
    customerEmail: text(row.customer_email) || null, childName: text(gelatoObject(row.character_specs).childName),
    amazonOrderId: /^\d{3}-\d{7}-\d{7}$/.test(amazonOrderId) ? amazonOrderId : null, amazonOrderItemId: exactGelatoAmazonItemId(row) });
}
