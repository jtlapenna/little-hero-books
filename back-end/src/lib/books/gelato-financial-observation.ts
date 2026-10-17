import { z } from 'zod';

const Amount = z.string().regex(/^-?(0|[1-9]\d{0,12})(\.\d{1,6})?$/);
const Currency = z.string().regex(/^[A-Z]{3}$/);
const Identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/);
const FinancialStatus = z.enum(['draft', 'pending', 'invoiced', 'to_be_invoiced', 'paid', 'canceled', 'partially_refunded', 'refunded', 'refused', 'unknown']);
const amountFields = ['productsPrice', 'productsPriceVat', 'productsPriceInclVat', 'shippingPrice', 'shippingPriceVat', 'shippingPriceInclVat',
  'packagingPrice', 'packagingPriceVat', 'packagingPriceInclVat', 'discount', 'discountVat', 'discountInclVat', 'total', 'totalVat', 'totalInclVat'] as const;
export const GelatoReceiptSchema = z.object({ id: Identifier.nullable(), orderId: Identifier.nullable().default(null), transactionType: z.enum(['purchase', 'refund', 'unknown']),
  currency: Currency.nullable(), isCalculated: z.boolean().nullable(),
  amounts: z.object(Object.fromEntries(amountFields.map(field => [field, Amount.nullable()]))),
  items: z.array(z.object({ id: Identifier.nullable(), referenceId: Identifier.nullable(), type: z.enum(['product', 'shipment', 'packaging', 'unknown']),
    currency: Currency.nullable(), quantity: Amount.nullable(), price: Amount.nullable(), vat: Amount.nullable(), priceInclVat: Amount.nullable() })).max(200).nullable(),
});
export const GelatoFinancialObservationSchema = z.object({ version: z.literal(1), status: FinancialStatus, currency: Currency,
  receipts: z.array(GelatoReceiptSchema).max(100).nullable(),
  reviewReason: z.enum(['malformed_receipts', 'receipt_currency_mismatch', 'receipt_identity_mismatch', 'unknown_financial_status']).nullable(),
  processedFiles: z.array(z.object({ providerItemId: Identifier, present: z.boolean() })).max(100),
});
export type GelatoFinancialObservation = z.infer<typeof GelatoFinancialObservationSchema>;
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function id(value: unknown) { const parsed = Identifier.safeParse(value); return parsed.success ? parsed.data : null; }
function currency(value: unknown) { const parsed = Currency.safeParse(value); return parsed.success ? parsed.data : null; }
export function gelatoDecimal(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = Amount.safeParse(String(value));
  if (!parsed.success) return null;
  const normalized = parsed.data.includes('.') ? parsed.data.replace(/0+$/, '').replace(/\.$/, '') : parsed.data;
  return normalized === '-0' ? '0' : normalized;
}
export function observeGelatoFinance(raw: unknown, expectedCurrency: string): GelatoFinancialObservation {
  const source = record(raw), status = FinancialStatus.safeParse(source.financialStatus);
  let reviewReason: GelatoFinancialObservation['reviewReason'] = status.success && status.data !== 'unknown' ? null : 'unknown_financial_status';
  let receipts: GelatoFinancialObservation['receipts'] = null;
  if (Array.isArray(source.receipts) && source.receipts.length <= 100) {
    receipts = source.receipts.map(value => {
      const r = record(value), receiptCurrency = currency(r.currency);
      if (receiptCurrency !== expectedCurrency) reviewReason = 'receipt_currency_mismatch';
      if (r.orderId != null && id(r.orderId) === null) reviewReason = 'receipt_identity_mismatch';
      const items = Array.isArray(r.items) && r.items.length <= 200 ? r.items.map(value => {
        const item = record(value), itemCurrency = currency(item.currency);
        if (itemCurrency !== expectedCurrency) reviewReason = 'receipt_currency_mismatch';
        if (item.type === 'product' && item.referenceId != null && id(item.referenceId) === null) reviewReason = 'receipt_identity_mismatch';
        return { id: id(item.id), referenceId: id(item.referenceId), type: ['product', 'shipment', 'packaging'].includes(String(item.type)) ? item.type as 'product' | 'shipment' | 'packaging' : 'unknown' as const,
          currency: itemCurrency, quantity: gelatoDecimal(item.amount), price: gelatoDecimal(item.price), vat: gelatoDecimal(item.vat), priceInclVat: gelatoDecimal(item.priceInclVat) };
      }) : null;
      if (r.items !== undefined && items === null) reviewReason = 'malformed_receipts';
      return { id: id(r.id), orderId: id(r.orderId), transactionType: r.transactionType === 'purchase' || r.transactionType === 'refund' ? r.transactionType : 'unknown' as const,
        currency: receiptCurrency, isCalculated: typeof r.isCalculated === 'boolean' ? r.isCalculated : null,
        amounts: Object.fromEntries(amountFields.map(field => [field, gelatoDecimal(r[field])])), items };
    });
  } else if (source.receipts !== undefined) reviewReason = 'malformed_receipts';
  return GelatoFinancialObservationSchema.parse({ version: 1, status: status.success ? status.data : 'unknown', currency: expectedCurrency, receipts, reviewReason,
    processedFiles: Array.isArray(source.items) ? source.items.slice(0, 100).map(value => { const item = record(value); return { providerItemId: id(item.id), present: typeof item.processedFileUrl === 'string' && item.processedFileUrl.length > 0 }; }) : [] });
}

// The Get-order contract uses provider order/item IDs for receipt ownership.
// A connected root may report another root's receipt: bind it to that exact
// validated root rather than treating the receipt as an aggregate allocation.
export function bindGelatoFinancialGraph<T extends { id: string; items: { id: string }[]; financialObservation?: GelatoFinancialObservation }>(orders: T[]): T[] {
  return orders.map(order => {
    const financial = order.financialObservation;
    if (!financial) return order;
    const mismatch = financial.receipts?.some(receipt => {
      const owner = receipt.orderId ? orders.find(root => root.id === receipt.orderId) : order;
      return !owner || receipt.items?.some(item => item.type === 'product' && item.referenceId !== null && !owner.items.some(owned => owned.id === item.referenceId));
    });
    return mismatch ? { ...order, financialObservation: { ...financial, reviewReason: 'receipt_identity_mismatch' } } : order;
  });
}

export const GelatoMonetaryQuoteSchema = z.object({ version: z.literal(1), quoteId: z.string(), quotedAt: z.string(), requestFingerprint: z.string(),
  currency: Currency, selectedShipmentMethodUid: z.string(),
  products: z.array(z.object({ itemReferenceId: z.string(), productUid: z.string(), quantity: z.number().int().positive(),
    price: Amount.nullable(), currency: Currency.nullable() })).min(1).max(100),
  shippingOptions: z.array(z.object({ shipmentMethodUid: z.string(), name: z.string().max(200).nullable(), type: z.string().max(80).nullable(),
    price: Amount.nullable(), initialPrice: Amount.nullable(), currency: Currency.nullable(),
    minDeliveryDate: z.string().max(40).nullable(), maxDeliveryDate: z.string().max(40).nullable(), numberOfParcels: z.number().int().nonnegative().nullable() })).max(100),
});
export type GelatoMonetaryQuote = z.infer<typeof GelatoMonetaryQuoteSchema>;
export function observeGelatoMonetaryQuote(raw: unknown, selection: { quoteId: string; quotedAt: string; requestFingerprint: string; shipmentMethodUid: string }, expectedCurrency: string) {
  const source = record(raw), quotes = Array.isArray(source.quotes) ? source.quotes : [];
  const quote = record(quotes.find(value => record(value).id === selection.quoteId));
  const checkedCurrency = (value: unknown, price: unknown) => {
    const result = currency(value); if (gelatoDecimal(price) !== null && result !== expectedCurrency) throw Error('Gelato quote monetary currency is unresolved'); return result;
  };
  const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max ? value : null;
  return GelatoMonetaryQuoteSchema.parse({ version: 1, quoteId: selection.quoteId, quotedAt: selection.quotedAt, requestFingerprint: selection.requestFingerprint,
    currency: expectedCurrency, selectedShipmentMethodUid: selection.shipmentMethodUid,
    products: (Array.isArray(quote.products) ? quote.products : []).map(value => { const p = record(value); return { itemReferenceId: p.itemReferenceId, productUid: p.productUid,
      quantity: p.quantity, price: gelatoDecimal(p.price), currency: checkedCurrency(p.currency, p.price) }; }),
    shippingOptions: (Array.isArray(quote.shipmentMethods) ? quote.shipmentMethods : []).map(value => { const s = record(value); return { shipmentMethodUid: s.shipmentMethodUid,
      name: text(s.name, 200), type: text(s.type, 80), price: gelatoDecimal(s.price), initialPrice: gelatoDecimal(s.initialPrice), currency: checkedCurrency(s.currency, s.price ?? s.initialPrice),
      minDeliveryDate: text(s.minDeliveryDate, 40), maxDeliveryDate: text(s.maxDeliveryDate, 40), numberOfParcels: Number.isSafeInteger(s.numberOfParcels) ? s.numberOfParcels : null }; }),
  });
}
