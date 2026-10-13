import { GelatoIdSchema, GelatoProviderOrderSchema, type GelatoProviderOrder } from './gelato-provider-snapshot';
import { z } from 'zod';
import type { GelatoDraftOrderRequest, GelatoQuoteRequest } from './gelato-api-contract';

const GELATO_API_BASE = 'https://order.gelatoapis.com/v4';

const DraftResponseSchema = z.object({
  id: z.string().trim().min(1),
  orderType: z.literal('draft'),
  orderReferenceId: z.string().trim().min(1),
  connectedOrderIds: z.array(GelatoIdSchema).max(100).default([]),
  items: z.array(z.object({
    itemReferenceId: z.string().trim().min(1),
    productUid: z.string().trim().min(1),
    quantity: z.number().int().positive(),
    pageCount: z.number().int().positive().optional(),
  }).passthrough()),
}).passthrough();

export type GelatoDraftOrderResponse = z.infer<typeof DraftResponseSchema>;

export class GelatoDraftOutcomeUnknownError extends Error {
  readonly code = 'GELATO_DRAFT_OUTCOME_UNKNOWN';

  constructor(readonly acceptedRootOrderId?: string) {
    super('Gelato draft outcome is unknown; reconcile by order reference before retrying');
    this.name = 'GelatoDraftOutcomeUnknownError';
  }
}

export type GelatoClientDependencies = {
  apiKey?: string;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
};

async function postGelato<T>(path: string, body: unknown, dependencies: GelatoClientDependencies): Promise<T> {
  const apiKey = dependencies.apiKey ?? process.env.GELATO_API_KEY;
  if (!apiKey?.trim()) throw new Error('Gelato API key is not configured');
  const fetcher = dependencies.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher(`${GELATO_API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
      body: JSON.stringify(body),
      signal: dependencies.signal ? AbortSignal.any([dependencies.signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error('Gelato request failed before a response was received');
  }
  if (!response.ok) throw new Error(`Gelato request failed with HTTP ${response.status}`);
  try {
    return await response.json() as T;
  } catch {
    throw new Error('Gelato returned invalid JSON');
  }
}

export function requestGelatoQuote(
  request: GelatoQuoteRequest,
  dependencies: GelatoClientDependencies = {},
): Promise<unknown> {
  return postGelato('/orders:quote', request, dependencies);
}

export async function createGelatoDraft(
  request: GelatoDraftOrderRequest,
  dependencies: GelatoClientDependencies = {},
): Promise<GelatoDraftOrderResponse> {
  if (request.orderType !== 'draft') throw new Error('Gelato automated create accepts drafts only');
  const apiKey = dependencies.apiKey ?? process.env.GELATO_API_KEY;
  if (!apiKey?.trim()) throw new Error('Gelato API key is not configured');
  let acceptedRootOrderId: string | undefined;
  try {
    const raw = await postGelato<unknown>('/orders', request, { ...dependencies, apiKey });
    const evidence = z.object({ id: GelatoIdSchema, orderReferenceId: z.literal(request.orderReferenceId) }).safeParse(raw);
    if (evidence.success) acceptedRootOrderId = evidence.data.id;
    const response = DraftResponseSchema.parse(raw);
    if (response.orderReferenceId !== request.orderReferenceId) {
      throw new Error('Gelato draft response does not match the request');
    }
    acceptedRootOrderId = GelatoIdSchema.parse(response.id);
    if (!response.connectedOrderIds.length && response.items.length !== request.items.length) throw new Error('Gelato draft membership is incomplete');
    const returnedItems = new Map(response.items.map((item) => [item.itemReferenceId, item]));
    if (returnedItems.size !== response.items.length) throw new Error('Duplicate Gelato draft item');
    for (const actual of response.items) {
      const expected = request.items.find((item) => item.itemReferenceId === actual.itemReferenceId);
      if (!expected || actual.productUid !== expected.productUid || actual.quantity !== expected.quantity ||
          (actual.pageCount !== undefined && actual.pageCount !== expected.pageCount)) {
        throw new Error('Gelato draft item mapping does not match the request');
      }
    }
    return response;
  } catch {
    throw new GelatoDraftOutcomeUnknownError(acceptedRootOrderId);
  }
}


export async function getGelatoOrder(id: string, dependencies: GelatoClientDependencies = {}): Promise<GelatoProviderOrder> {
  const safeId = GelatoIdSchema.parse(id);
  const apiKey = dependencies.apiKey ?? process.env.GELATO_API_KEY;
  if (!apiKey?.trim()) throw new Error('Gelato API key is not configured');
  let response: Response;
  try {
    response = await (dependencies.fetcher ?? fetch)(`${GELATO_API_BASE}/orders/${encodeURIComponent(safeId)}`, {
      headers: { 'X-API-KEY': apiKey },
      signal: dependencies.signal ? AbortSignal.any([dependencies.signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
    });
  } catch { throw new Error('Gelato order lookup did not complete'); }
  if (!response.ok) throw new Error(`Gelato order lookup failed with HTTP ${response.status}`);
  return GelatoProviderOrderSchema.parse(await response.json());
}

export async function searchGelatoOrders(orderReferenceId: string, dependencies: GelatoClientDependencies = {}): Promise<string[]> {
  if (!orderReferenceId.trim()) throw new Error('Gelato reconciliation requires an order reference');
  const ids = new Set<string>();
  for (let offset = 0; offset < 2000; offset += 100) {
    const page = z.object({ orders: z.array(z.object({ id: GelatoIdSchema, orderReferenceId: z.string() })).max(100) })
      .parse(await postGelato('/orders:search', { orderReferenceId, limit: 100, offset }, dependencies));
    for (const order of page.orders) {
      if (order.orderReferenceId !== orderReferenceId) throw new Error('Gelato search returned a different reference');
      ids.add(order.id);
    }
    if (page.orders.length < 100) return [...ids].sort();
  }
  throw new Error('Gelato reconciliation search is incomplete');
}

export async function cancelGelatoOrder(id: string, dependencies: GelatoClientDependencies = {}): Promise<void> {
  const safeId = GelatoIdSchema.parse(id);
  const apiKey = dependencies.apiKey ?? process.env.GELATO_API_KEY;
  if (!apiKey?.trim()) throw new Error('Gelato API key is not configured');
  let response: Response;
  try {
    response = await (dependencies.fetcher ?? fetch)(`${GELATO_API_BASE}/orders/${encodeURIComponent(safeId)}:cancel`, {
      method: 'POST', headers: { 'X-API-KEY': apiKey },
      signal: dependencies.signal ? AbortSignal.any([dependencies.signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
    });
  } catch { throw new Error('Gelato cancellation outcome requires refresh'); }
  if (!response.ok) throw new Error(`Gelato cancellation was not confirmed (${response.status})`);
}
