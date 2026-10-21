import { z } from 'zod';
import type { GelatoDraftOrderRequest } from './gelato-api-contract';
import { GelatoFinancialObservationSchema, bindGelatoFinancialGraph } from './gelato-financial-observation';
import { gelatoTestSafetyReason } from './gelato-test-safety';

const optionalText = z.string().nullish().transform((value) => value ?? undefined).optional();
export const GelatoIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/);
export const GelatoProviderOrderSchema = z.object({
  id: GelatoIdSchema,
  orderReferenceId: z.string().min(1),
  customerReferenceId: z.string().min(1),
  orderType: z.enum(['draft', 'order']),
  currency: z.string().regex(/^[A-Z]{3}$/),
  fulfillmentStatus: z.string().min(1).max(80),
  updatedAt: z.string().datetime({ offset: true }),
  financialObservation: GelatoFinancialObservationSchema.optional(),
  testSafetyEvidence: z.object({ printJobsPresent: z.boolean(), fundingPresent: z.boolean() }).strict().optional(),
  connectedOrderIds: z.array(GelatoIdSchema).max(100).default([]),
  shippingAddress: z.object({ country: z.string(), firstName: z.string(), lastName: z.string(),
    addressLine1: z.string(), addressLine2: optionalText, city: z.string(), postCode: z.string(),
    state: optionalText, email: z.string(), phone: optionalText, companyName: optionalText }),
  items: z.array(z.object({ id: GelatoIdSchema, itemReferenceId: z.string().min(1), productUid: z.string().min(1),
    quantity: z.number().int().positive(), pageCount: z.number().int().positive().nullish().transform((value) => value ?? undefined),
    fulfillmentStatus: z.string().min(1).max(80),
    files: z.array(z.object({ url: z.string().url(), type: z.string().default('default') })).max(10),
    processedFileUrl: optionalText,
  })).max(100),
  shipment: z.object({ shipmentMethodUid: z.string().optional(), name: optionalText, shipmentMethodName: optionalText,
    packages: z.array(z.object({ id: GelatoIdSchema, orderItemIds: z.array(GelatoIdSchema).max(100),
      trackingCode: z.string(), trackingUrl: z.string() })).max(100),
  }).nullable().optional(),
});
export type GelatoProviderOrder = z.infer<typeof GelatoProviderOrderSchema>;

export async function loadGelatoConnectedOrders(rootIds: string[], getOrder: (id: string) => Promise<GelatoProviderOrder>) {
  const pending = [...new Set(rootIds.map((id) => GelatoIdSchema.parse(id)))];
  const loaded = new Map<string, GelatoProviderOrder>();
  while (pending.length) {
    const id = pending.shift()!;
    if (loaded.has(id)) continue;
    if (loaded.size >= 100) throw new Error('Gelato connected graph exceeds the item limit');
    const order = GelatoProviderOrderSchema.parse(await getOrder(id));
    if (order.id !== id) throw new Error('Gelato returned a different external order identity');
    loaded.set(id, order);
    for (const next of order.connectedOrderIds) if (!loaded.has(next) && !pending.includes(next)) pending.push(next);
  }
  if (!loaded.size) throw new Error('Gelato connected graph is empty');
  return [...loaded.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function normalized(value: string | undefined) { return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase(); }
export function validateGelatoConnectedOrders(orders: GelatoProviderOrder[], request: GelatoDraftOrderRequest, draftOnly = false) {
  const expected = new Map(request.items.map((item) => [item.itemReferenceId, item]));
  const seen = new Set<string>();
  const orderIds = new Set(orders.map((order) => order.id));
  if (orderIds.size !== orders.length) throw new Error('Duplicate Gelato connected order');
  for (const order of orders) {
    if (draftOnly) {
      // Legacy snapshots may lack finance; retain that absence. Fresh protected-runner
      // acceptance separately requires explicit draft finance from the raw response.
      const safetyReason = gelatoTestSafetyReason(order);
      if ((safetyReason && safetyReason !== 'test_order_state_unverified') || order.fulfillmentStatus !== 'draft' ||
          !order.items.length || order.items.some(item => !['draft', 'created'].includes(item.fulfillmentStatus)) ||
          (order.financialObservation && order.financialObservation.status !== 'draft')) {
        throw new Error('Gelato draft graph contains release, payment or production evidence');
      }
    }
    if (order.orderReferenceId !== request.orderReferenceId || order.customerReferenceId !== request.customerReferenceId ||
        order.currency !== request.currency || (order.shipment?.shipmentMethodUid !== undefined && order.shipment.shipmentMethodUid !== request.shipmentMethodUid) || (draftOnly && order.orderType !== 'draft') ||
        order.connectedOrderIds.some((id) => !orderIds.has(id))) throw new Error('Gelato connected graph request identity mismatch');
    for (const field of ['country', 'firstName', 'lastName', 'addressLine1', 'addressLine2', 'city', 'postCode', 'state', 'email', 'phone', 'companyName'] as const) {
      if (normalized(order.shippingAddress[field]) !== normalized(request.shippingAddress[field])) throw new Error('Gelato connected graph recipient mismatch');
    }
    const itemIds = new Set(order.items.map((item) => item.id));
    if (itemIds.size !== order.items.length) throw new Error('Duplicate Gelato provider item identity');
    for (const item of order.items) {
      const wanted = expected.get(item.itemReferenceId);
      if (!wanted || seen.has(item.itemReferenceId) || item.productUid !== wanted.productUid || item.quantity !== wanted.quantity ||
          (item.pageCount !== undefined && item.pageCount !== wanted.pageCount) ||
          JSON.stringify(item.files.map((file) => `${file.type}:${file.url}`).sort()) !== JSON.stringify(wanted.files.map((file) => `${file.type}:${file.url}`).sort())) {
        throw new Error('Gelato connected graph item mapping mismatch');
      }
      seen.add(item.itemReferenceId);
    }
    if (order.shipment?.packages.some((parcel) => parcel.orderItemIds.some((id) => !itemIds.has(id)))) {
      throw new Error('Gelato package references an unknown provider item');
    }
  }
  if (seen.size !== expected.size) throw new Error('Gelato connected graph membership is incomplete');
  return bindGelatoFinancialGraph(orders);
}

export async function validateGelatoConnectedOrdersWithFiles(
  orders: GelatoProviderOrder[], request: GelatoDraftOrderRequest,
  verifyFile?: (itemReferenceId: string, providerUrl: string, expectedUrl: string) => Promise<boolean>,
  draftOnly = false,
) {
  const changed: Array<{ reference: string; providerUrl: string; expectedUrl: string }> = [];
  const normalizedOrders = orders.map((order) => ({ ...order, items: order.items.map((item) => {
    const expected = request.items.find((entry) => entry.itemReferenceId === item.itemReferenceId);
    return { ...item, files: item.files.map((file) => {
      const expectedFile = expected?.files.find((entry) => entry.type === file.type);
      if (!expectedFile || expectedFile.url === file.url) return file;
      changed.push({ reference: item.itemReferenceId, providerUrl: file.url, expectedUrl: expectedFile.url });
      return { ...file, url: expectedFile.url };
    }) };
  }) }));
  // Preflight proves graph identity. No normalized result leaves this function before byte checks.
  validateGelatoConnectedOrders(normalizedOrders, request, draftOnly);
  for (const file of changed) {
    if (!verifyFile || !await verifyFile(file.reference, file.providerUrl, file.expectedUrl)) {
      throw new Error('Gelato stored file differs from its registered artifact');
    }
  }
  return validateGelatoConnectedOrders(normalizedOrders, request, draftOnly);
}
