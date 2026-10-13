import { z } from 'zod';
import { extractManifestKey } from '@/lib/order-paths';
import { validateRunManifest } from './validate-run-manifest';

export interface PrintRoutingOrder extends Record<string, unknown> {
  id: number;
  orderId: string;
  root_order_id?: string | null;
  print_provider?: string | null;
  one_manifest_url?: string | null;
}

export interface FrozenPrintRouting {
  orderDbId: number;
  orderId: string;
  rootOrderId: string;
  provider: 'lulu' | 'gelato';
  bookId: string;
  configVersion: number | null;
  formatId: string | null;
  productUid: string | null;
  innerPageCount: number | null;
  apiPageCount: number | null;
  expectedPdfPageCount: number | null;
}

export function assertCompletePrintRoutingMembership(
  requestedOrderDbIds: number[],
  members: Array<{ id: number; orderId: string }>,
): void {
  const memberIds = new Set(members.map((member) => member.id));
  if (memberIds.size !== members.length || requestedOrderDbIds.length !== members.length ||
      requestedOrderDbIds.some((id) => !memberIds.has(id))) {
    throw new Error('Print routing requires the complete sibling group');
  }
}

const LegacyW0Schema = z.object({
  schema: z.literal('lhb.run-manifest@v2.1'),
  orderId: z.string().min(1).optional(),
  amazonOrderId: z.string().min(1).nullable().optional(),
  rootOrderId: z.string().min(1).optional(),
  order: z.object({
    characterSpecs: z.record(z.string(), z.unknown()),
    bookSpecs: z.record(z.string(), z.unknown()),
    orderDetails: z.record(z.string(), z.unknown()),
  }),
});

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try { return record(JSON.parse(value)); } catch { return {}; }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

export function canonicalW0RoutingKey(order: PrintRoutingOrder): { key: string; bookId: string } {
  if (!Number.isSafeInteger(order.id) || order.id <= 0 ||
      !text(order.orderId) || /[/?#\\]|\.\./.test(order.orderId)) {
    throw new Error('Invalid canonical print order identity');
  }
  const key = extractManifestKey(order.one_manifest_url);
  const bookId = text(order.book_id) ?? text(order.project) ?? key?.split('/')[0];
  if (!bookId || /[/?#\\]|\.\./.test(bookId) ||
      key !== `${bookId}/orders/${order.orderId}/manifests/1-manifest.json`) {
    throw new Error('Print routing requires the canonical order-scoped W0 key');
  }
  return { key, bookId };
}

export function resolveFrozenPrintRouting(order: PrintRoutingOrder, input: unknown): FrozenPrintRouting {
  const { key, bookId } = canonicalW0RoutingKey(order);
  const rootOrderId = text(order.root_order_id) ?? text(order.amazon_order_id) ?? order.orderId;
  const base = { orderDbId: order.id, orderId: order.orderId, rootOrderId, bookId };
  const raw = record(input);
  let routing: FrozenPrintRouting;
  if (raw.schema === 'lhb.run-manifest@v3') {
    const manifest = validateRunManifest(input);
    const ref = manifest.book.bookConfigRef;
    if (manifest.manifestType !== 'w0' || manifest.order.orderId !== order.orderId ||
        manifest.order.rootOrderId !== rootOrderId || ref.bookId !== bookId ||
        manifest.artifacts.manifestKey !== key ||
        (manifest.order.orderDbId != null && manifest.order.orderDbId !== order.id)) {
      throw new Error('W0 manifest does not match the canonical order identity');
    }
    const print = manifest.book.resolved.print;
    if (print.provider === 'gelato' && (ref.version < 2 || bookId !== 'book-finding-our-inner-voice')) {
      throw new Error('Gelato routing requires the versioned Inner Voice config');
    }
    if (print.provider === 'gelato' && !print.apiPageCountVerified) {
      throw new Error('Gelato routing requires a verified API page count');
    }
    routing = {
      ...base, provider: print.provider, configVersion: ref.version, formatId: ref.formatId,
      productUid: print.provider === 'gelato' ? print.productUid : null,
      innerPageCount: print.provider === 'gelato' ? print.innerPageCount : manifest.book.resolved.expectedPageCount,
      apiPageCount: print.provider === 'gelato' ? print.apiPageCount : null,
      expectedPdfPageCount: print.provider === 'gelato' ? print.expectedPdfPageCount : null,
    };
  } else {
    const manifest = LegacyW0Schema.parse(input);
    if (order.print_provider !== 'lulu' || raw.book !== undefined || raw.bookConfigRef !== undefined ||
        (raw.provider !== undefined && raw.provider !== 'lulu') ||
        (manifest.orderId !== undefined && manifest.orderId !== order.orderId) ||
        (manifest.rootOrderId !== undefined && manifest.rootOrderId !== rootOrderId) ||
        (manifest.amazonOrderId != null && manifest.amazonOrderId !== order.amazon_order_id &&
         manifest.amazonOrderId !== rootOrderId)) {
      throw new Error('Legacy print routing requires a durable matching Lulu assignment');
    }
    routing = { ...base, provider: 'lulu', configVersion: null, formatId: null,
      productUid: null, innerPageCount: null, apiPageCount: null, expectedPdfPageCount: null };
  }

  const assignments = {
    print_provider: routing.provider, print_config_version: routing.configVersion,
    print_product_uid: routing.productUid, print_inner_page_count: routing.innerPageCount,
    print_api_page_count: routing.apiPageCount,
    print_expected_pdf_page_count: routing.expectedPdfPageCount,
  };
  for (const [field, expected] of Object.entries(assignments)) {
    if (order[field] != null && order[field] !== expected) {
      throw new Error(`Frozen print assignment mismatch: ${field}`);
    }
  }
  return routing;
}

export function printDestinationKey(order: PrintRoutingOrder): string {
  const address = record(order.shipping_address);
  const fields = [
    text(address.name) ?? text(address.recipient_name),
    text(address.address_line_1) ?? text(address.address_line1) ?? text(address.address1) ?? text(address.street1) ?? text(address.street) ?? text(address.address),
    text(address.address_line_2) ?? text(address.address_line2) ?? text(address.address2) ?? text(address.street2) ?? '',
    text(address.city), text(address.state_code) ?? text(address.state),
    text(address.postal_code) ?? text(address.postcode) ?? text(address.zip),
    text(address.country_code) ?? text(address.country),
  ];
  if (fields.some((value) => value === null)) throw new Error('Incomplete print destination');
  return JSON.stringify(fields.map((value) => value!.toLowerCase().replace(/\s+/g, ' ').trim()));
}

export async function resolvePrintRoutingGroup(
  orders: PrintRoutingOrder[],
  loadManifest: (key: string) => Promise<unknown>,
): Promise<FrozenPrintRouting[]> {
  if (!orders.length || new Set(orders.map((order) => order.id)).size !== orders.length ||
      new Set(orders.map((order) => order.orderId)).size !== orders.length) {
    throw new Error('Print routing requires unique orders');
  }
  const routes = await Promise.all(orders.map(async (order) => {
    const { key } = canonicalW0RoutingKey(order);
    return resolveFrozenPrintRouting(order, await loadManifest(key));
  }));
  if (routes.length > 1) {
    const [first] = routes;
    const destination = printDestinationKey(orders[0]);
    for (let index = 0; index < routes.length; index++) {
      const route = routes[index];
      for (const field of ['rootOrderId', 'provider', 'bookId', 'configVersion', 'productUid', 'innerPageCount', 'apiPageCount', 'expectedPdfPageCount'] as const) {
        if (route[field] !== first[field]) throw new Error(`Incompatible print group: ${field}`);
      }
      if (printDestinationKey(orders[index]) !== destination) throw new Error('Incompatible print group destination');
    }
  }
  return routes;
}
