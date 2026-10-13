import { createHash } from 'node:crypto';
import type { z } from 'zod';
import { z as schema } from 'zod';
import type { GelatoPrintConfigSchema, GelatoShipmentMethodRuleSchema } from './types';

type GelatoPrintConfig = z.infer<typeof GelatoPrintConfigSchema>;
type ShipmentRule = z.infer<typeof GelatoShipmentMethodRuleSchema>;

export interface GelatoRecipient {
  country: string;
  firstName: string;
  lastName: string;
  addressLine1: string;
  city: string;
  postCode: string;
  email: string;
  state?: string;
  addressLine2?: string;
  companyName?: string;
  phone?: string;
}

export interface GelatoPrintItem {
  itemReferenceId: string;
  productUid: string;
  pageCount: number;
  quantity: number;
  fileUrl: string;
}

export interface GelatoQuoteRequest {
  orderReferenceId: string;
  customerReferenceId: string;
  currency: string;
  allowMultipleQuotes: false;
  recipient: GelatoRecipient;
  products: Array<{
    itemReferenceId: string;
    productUid: string;
    pageCount: number;
    quantity: number;
    files: Array<{ type: 'default'; url: string }>;
  }>;
}

export interface GelatoSelectedQuote {
  quoteId: string;
  shipmentMethodUid: string;
  shipmentPolicyVersion: number;
  quotedAt: string;
  requestFingerprint: string;
  shippingTier: string;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function gelatoQuoteRequestFingerprint(request: GelatoQuoteRequest, shipmentMethodPolicy: GelatoPrintConfig['shipmentMethodPolicy'], shippingTier: string, shipmentMethodUid: string): string {
  // Bind exact file URLs. Refreshing a signed URL requires a fresh quote.
  return createHash('sha256').update(canonicalJson({ request, shipmentMethodPolicy, shippingTier, shipmentMethodUid })).digest('hex');
}

export interface GelatoShipmentMethod {
  shipmentMethodUid: string;
  type: string;
}

export interface GelatoQuoteProduct {
  itemReferenceId: string;
  productUid: string;
  quantity: number;
  pageCount?: number;
}

export interface GelatoQuote {
  id: string;
  itemReferenceIds: string[];
  shipmentMethods: GelatoShipmentMethod[];
  products: GelatoQuoteProduct[];
}

export interface GelatoQuoteResponse {
  orderReferenceId: string;
  quotes: GelatoQuote[];
}

const GelatoQuoteResponseSchema = schema.object({
  orderReferenceId: schema.string().trim().min(1),
  quotes: schema.array(schema.object({
    id: schema.string().trim().min(1),
    itemReferenceIds: schema.array(schema.string().trim().min(1)),
    shipmentMethods: schema.array(schema.object({
      shipmentMethodUid: schema.string().trim().min(1),
      type: schema.string().trim().min(1),
    }).passthrough()),
    products: schema.array(schema.object({
      itemReferenceId: schema.string().trim().min(1),
      productUid: schema.string().trim().min(1),
      quantity: schema.number().int().positive(),
      pageCount: schema.number().int().positive().optional(),
    }).passthrough()),
  }).passthrough()),
}).passthrough();

export interface GelatoDraftOrderRequest {
  orderType: 'draft';
  orderReferenceId: string;
  customerReferenceId: string;
  currency: string;
  items: Array<{
    itemReferenceId: string;
    productUid: string;
    pageCount: number;
    quantity: number;
    files: Array<{ type: 'default'; url: string }>;
  }>;
  shipmentMethodUid: string;
  shippingAddress: GelatoRecipient;
}

function assertUnique(values: string[], label: string): void {
  if (values.some((value) => !value.trim()) || new Set(values).size !== values.length) {
    throw new Error(`Invalid or duplicate Gelato ${label}`);
  }
}

function validateItems(items: GelatoPrintItem[], config: GelatoPrintConfig): void {
  if (!config.apiPageCountVerified) {
    throw new Error('Gelato API page count has not been verified for this product');
  }
  if (!items.length || items.length > 100) throw new Error('Gelato order must contain 1 to 100 items');
  assertUnique(items.map((item) => item.itemReferenceId), 'item references');
  for (const item of items) {
    if (item.productUid !== config.productUid || item.pageCount !== config.apiPageCount ||
        !Number.isSafeInteger(item.quantity) || item.quantity < 1) {
      throw new Error('Gelato item does not match frozen product configuration');
    }
    const url = new URL(item.fileUrl);
    if (url.protocol !== 'https:' || !url.hostname) throw new Error('Gelato print file must use an HTTPS URL');
  }
}

function validateDestination(recipient: GelatoRecipient, config: GelatoPrintConfig): void {
  if (!config.shipmentMethodPolicy.destinationCountries.includes(recipient.country)) {
    throw new Error('Gelato destination has no verified shipment policy');
  }
}

export function buildGelatoQuoteRequest(input: {
  orderReferenceId: string;
  customerReferenceId: string;
  currency: string;
  recipient: GelatoRecipient;
  items: GelatoPrintItem[];
  config: GelatoPrintConfig;
}): GelatoQuoteRequest {
  validateItems(input.items, input.config);
  validateDestination(input.recipient, input.config);
  if (!input.orderReferenceId.trim() || !input.customerReferenceId.trim() || !/^[A-Z]{3}$/.test(input.currency)) {
    throw new Error('Invalid Gelato quote identity or currency');
  }
  return {
    orderReferenceId: input.orderReferenceId,
    customerReferenceId: input.customerReferenceId,
    currency: input.currency,
    allowMultipleQuotes: false,
    recipient: input.recipient,
    products: input.items.map((item) => ({
      itemReferenceId: item.itemReferenceId,
      productUid: item.productUid,
      pageCount: item.pageCount,
      quantity: item.quantity,
      files: [{ type: 'default', url: item.fileUrl }],
    })),
  };
}

function expectedMethodUids(rule: ShipmentRule, methods: GelatoShipmentMethod[]): string[] {
  if (rule.kind === 'uid') {
    return methods.filter((method) => method.shipmentMethodUid === rule.uid).map((method) => method.shipmentMethodUid);
  }
  const matches = methods.filter((method) => method.type === rule.type);
  if (matches.length <= 1) return matches.map((method) => method.shipmentMethodUid);
  if (!rule.uidPriority?.length) throw new Error('Gelato shipment policy matches multiple methods without UID priority');
  return rule.uidPriority.filter((uid) => matches.some((method) => method.shipmentMethodUid === uid)).slice(0, 1);
}

export function validateGelatoQuote(input: {
  response: unknown;
  request: GelatoQuoteRequest;
  config: GelatoPrintConfig;
  shippingTier: string;
  quotedAt: string;
  now?: Date;
}): GelatoSelectedQuote {
  const response = GelatoQuoteResponseSchema.parse(input.response);
  const { request, config } = input;
  validateDestination(request.recipient, config);
  if (response.orderReferenceId !== request.orderReferenceId || !Array.isArray(response.quotes) || response.quotes.length !== 1) {
    throw new Error('Gelato must return exactly one matching quote');
  }
  const quote = response.quotes[0];
  const expectedIds = request.products.map((product) => product.itemReferenceId).sort();
  assertUnique(quote.itemReferenceIds, 'quoted item references');
  if (JSON.stringify([...quote.itemReferenceIds].sort()) !== JSON.stringify(expectedIds)) {
    throw new Error('Gelato quote item membership mismatch');
  }
  if (quote.products.length !== request.products.length) throw new Error('Gelato quote product count mismatch');
  const quotedById = new Map(quote.products.map((product) => [product.itemReferenceId, product]));
  for (const expected of request.products) {
    const actual = quotedById.get(expected.itemReferenceId);
    if (!actual || actual.productUid !== expected.productUid || actual.quantity !== expected.quantity ||
        (actual.pageCount !== undefined && actual.pageCount !== expected.pageCount)) {
      throw new Error('Gelato quote product does not match request');
    }
  }
  if (!quote.id?.trim()) throw new Error('Gelato quote ID missing');
  const rule = config.shipmentMethodPolicy.tiers[input.shippingTier];
  if (!rule) throw new Error('Gelato shipping tier has no configured policy');
  const methods = expectedMethodUids(rule, quote.shipmentMethods);
  if (methods.length !== 1) throw new Error('Gelato shipping policy did not resolve to exactly one method');

  const quotedAtMs = Date.parse(input.quotedAt);
  const nowMs = (input.now ?? new Date()).getTime();
  if (!Number.isFinite(quotedAtMs) || quotedAtMs > nowMs || nowMs - quotedAtMs > 15 * 60 * 1000) {
    throw new Error('Gelato quote expired');
  }
  return { quoteId: quote.id, shipmentMethodUid: methods[0], shipmentPolicyVersion: config.shipmentMethodPolicy.version, quotedAt: new Date(quotedAtMs).toISOString(), requestFingerprint: gelatoQuoteRequestFingerprint(request, config.shipmentMethodPolicy, input.shippingTier, methods[0]), shippingTier: input.shippingTier };
}

export function buildGelatoDraftOrderRequest(input: {
  orderReferenceId: string;
  customerReferenceId: string;
  currency: string;
  recipient: GelatoRecipient;
  items: GelatoPrintItem[];
  config: GelatoPrintConfig;
  selectedQuote: GelatoSelectedQuote;
  now?: Date;
}): GelatoDraftOrderRequest {
  validateItems(input.items, input.config);
  validateDestination(input.recipient, input.config);
  const quotedAtMs = Date.parse(input.selectedQuote.quotedAt);
  const nowMs = (input.now ?? new Date()).getTime();
  if (!input.orderReferenceId.trim() || !input.customerReferenceId.trim() || !/^[A-Z]{3}$/.test(input.currency) ||
      !input.selectedQuote.quoteId.trim() || !input.selectedQuote.shipmentMethodUid.trim() ||
      input.selectedQuote.shipmentPolicyVersion !== input.config.shipmentMethodPolicy.version ||
      !Number.isFinite(quotedAtMs) || nowMs - quotedAtMs > 15 * 60 * 1000 || quotedAtMs > nowMs) {
    throw new Error('Invalid Gelato draft submission identity or quote policy');
  }
  const currentRequest = buildGelatoQuoteRequest(input);
  if (gelatoQuoteRequestFingerprint(currentRequest, input.config.shipmentMethodPolicy, input.selectedQuote.shippingTier, input.selectedQuote.shipmentMethodUid) !== input.selectedQuote.requestFingerprint) {
    throw new Error('Gelato draft inputs differ from the validated quote request');
  }
  return {
    orderType: 'draft',
    orderReferenceId: input.orderReferenceId,
    customerReferenceId: input.customerReferenceId,
    currency: input.currency,
    items: input.items.map((item) => ({
      itemReferenceId: item.itemReferenceId,
      productUid: item.productUid,
      pageCount: item.pageCount,
      quantity: item.quantity,
      files: [{ type: 'default', url: item.fileUrl }],
    })),
    shipmentMethodUid: input.selectedQuote.shipmentMethodUid,
    shippingAddress: input.recipient,
  };
}
