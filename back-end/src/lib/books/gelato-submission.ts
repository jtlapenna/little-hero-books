import { assertGelatoCustomerApproval } from './gelato-print-admission';
import { createPrinterFileUrl, newPrinterFileWindow, PrinterFileWindowSchema, PRINTER_FILE_SEND_MARGIN_SECONDS, verifyPrinterFileUrl, type PrinterFileWindow } from '../printer-file-grants';
import { GelatoNotificationTargetSchema, gelatoNotificationTarget } from './gelato-notification-target';
import { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';
import { GelatoPrintConfigSchema } from './types';
import { buildGelatoDraftOrderRequest, buildGelatoQuoteRequest, validateGelatoQuote, type GelatoDraftOrderRequest, type GelatoSelectedQuote } from './gelato-api-contract';
import { createGelatoDraft, getGelatoOrder, requestGelatoQuote, GelatoDraftOutcomeUnknownError } from './gelato-api-client';
import { loadGelatoConnectedOrders, validateGelatoConnectedOrdersWithFiles, type GelatoProviderOrder } from './gelato-provider-snapshot';
import type { GelatoStoredFileVerifier } from './gelato-stored-file';
import type { GelatoSubmissionContext, GelatoSubmissionStore } from './gelato-submission-store';
import type { W4GelatoPrintInput } from './w4-gelato-print-input';
import { GelatoMonetaryQuoteSchema, observeGelatoMonetaryQuote } from './gelato-financial-observation';

const ItemSchema = z.object({ itemReferenceId: z.string().min(1), productUid: z.string().min(1), pageCount: z.number().int().positive(),
  quantity: z.number().int().positive(), files: z.array(z.object({ type: z.literal('default'), url: z.string().url() })).length(1) });
const RecipientSchema = z.object({ firstName: z.string().min(1).max(25), lastName: z.string().max(25), country: z.string().regex(/^[A-Z]{2}$/),
  addressLine1: z.string().min(1).max(35), addressLine2: z.string().max(35).optional(), city: z.string().min(1).max(30),
  postCode: z.string().min(1).max(15), state: z.string().min(1).max(35), email: z.string().email(), phone: z.string().max(25).optional(), companyName: z.string().max(60).optional() });
export const GelatoSavedSnapshotSchema = z.object({
  request: z.object({ orderType: z.literal('draft'), orderReferenceId: z.string().min(1), customerReferenceId: z.string().min(1),
    currency: z.string().regex(/^[A-Z]{3}$/), items: z.array(ItemSchema).min(1).max(100), shipmentMethodUid: z.string().min(1), shippingAddress: RecipientSchema }),
  notificationTargets: z.array(GelatoNotificationTargetSchema).min(1).max(100).optional(),
  config: GelatoPrintConfigSchema, shippingTier: z.string().min(1), printerFiles: PrinterFileWindowSchema.optional(), monetaryQuote: GelatoMonetaryQuoteSchema.optional(),
});
export type GelatoSavedSnapshot = z.infer<typeof GelatoSavedSnapshotSchema>;
export type GelatoSubmissionIdentity = { submissionId: string; claimToken: string; executionId: string; mode: 'single' | 'siblings' };
export interface GelatoSubmissionDependencies {
  store: GelatoSubmissionStore;
  verifyStoredFile?: GelatoStoredFileVerifier;
  loadPrintInput(orderId: string): Promise<W4GelatoPrintInput>;
  loadOrder(orderId: string): Promise<Record<string, unknown> | null>;
  artifactExists(key: string): Promise<boolean>;
  backendUrl: string;
  quote?: typeof requestGelatoQuote;
  create?: typeof createGelatoDraft;
  get?: (id: string) => Promise<GelatoProviderOrder>;
  now?: () => Date;
  draftsEnabled: boolean;
  engineeringDraftsAllowed?: (identity: GelatoSubmissionIdentity) => Promise<boolean>;
  merchantEmail?: string;
}
function string(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }
function object(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') return object(JSON.parse(value));
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function assertIdentity(context: GelatoSubmissionContext, identity: GelatoSubmissionIdentity, now: Date, claimed = true) {
  const { submission: s, members } = context;
  if (s.id !== identity.submissionId || s.claim_token !== identity.claimToken || (claimed && (s.request_state !== 'claimed' || Date.parse(s.lease_expires_at) <= now.getTime())) ||
      (identity.mode === 'single' ? members.length !== 1 : members.length < 2)) throw new Error('Gelato submission claim or membership is stale');
}
export function gelatoRecipientFromOrder(row: Record<string, unknown>, merchantEmail?: string) {
  const address = object(row.shipping_address);
  const name = string(address.name ?? address.recipient_name ?? row.customer_name).split(/\s+/);
  const pick = (...values: unknown[]) => values.map(string).find(Boolean);
  return RecipientSchema.parse({ firstName: name[0], lastName: name.slice(1).join(' '), country: pick(address.country_code, address.country),
    addressLine1: pick(address.address_line_1, address.address_line1, address.address1, address.street1, address.street, address.address),
    addressLine2: pick(address.address_line_2, address.address_line2, address.address2, address.street2),
    city: address.city, state: pick(address.state_code, address.state), postCode: pick(address.postcode, address.postal_code, address.zip),
    email: pick(row.customer_email, address.email, merchantEmail), phone: pick(address.phone_number, address.phone) });
}
async function buildRequest(context: GelatoSubmissionContext, identity: GelatoSubmissionIdentity, dependencies: GelatoSubmissionDependencies, printerFiles: PrinterFileWindow) {
  assertIdentity(context, identity, (dependencies.now ?? (() => new Date()))());
  const inputs = [];
  for (const member of context.members) {
    if (member.artifact_claim_token !== identity.claimToken || !member.artifact_key || !member.artifact_fingerprint) throw new Error('Gelato current PDF receipt is missing');
    const input = await dependencies.loadPrintInput(member.child_order_key);
    const row = await dependencies.loadOrder(member.child_order_key);
    if (!row || input.orderDbId !== member.child_order_id || row.id !== member.child_order_id || row.print_provider !== 'gelato' ||
        row.print_submission_id !== identity.submissionId || row.print_claim_token !== identity.claimToken || input.rootOrderId !== context.submission.root_order_id ||
        member.artifact_key !== `${input.orderPrefix}/gelato/print/v${input.bookConfigVersion}/${member.artifact_fingerprint}.pdf` ||
        member.pdf_page_count !== input.providerPrintConfig.expectedPdfPageCount || !(await dependencies.artifactExists(member.artifact_key))) {
      throw new Error('Gelato quote input differs from canonical order and PDF receipt');
    }
    assertGelatoCustomerApproval(row);
    const quantity = z.number().int().positive().parse(row.quantity ?? object(row.product_info).quantity ?? 1);
    const tier = string(row.shipping_tier).toLowerCase();
    if (!tier) throw new Error('Gelato saved shipping tier is missing');
    inputs.push({ input, member, row, quantity, recipient: gelatoRecipientFromOrder(row, dependencies.merchantEmail), tier });
  }
  const first = inputs[0];
  if (inputs.some((entry) => JSON.stringify(entry.recipient) !== JSON.stringify(first.recipient) || entry.tier !== first.tier ||
      JSON.stringify(entry.input.providerPrintConfig) !== JSON.stringify(first.input.providerPrintConfig))) throw new Error('Gelato sibling quote inputs are incompatible');
  const fileUrls = await Promise.all(inputs.map(entry => createPrinterFileUrl({ key: entry.member.artifact_key!, submissionId: identity.submissionId,
    itemReferenceId: entry.member.item_reference_id, orderDbId: entry.member.child_order_id, configVersion: Number(entry.input.bookConfigVersion), inputFingerprint: entry.member.artifact_fingerprint! }, printerFiles, dependencies.backendUrl)));
  const request = buildGelatoQuoteRequest({ orderReferenceId: context.submission.order_reference_id, customerReferenceId: context.submission.root_order_id,
    currency: 'USD', recipient: first.recipient, config: first.input.providerPrintConfig,
    items: inputs.map((entry, index) => ({ itemReferenceId: entry.member.item_reference_id, productUid: entry.input.providerPrintConfig.productUid,
      pageCount: entry.input.providerPrintConfig.apiPageCount, quantity: entry.quantity,
      fileUrl: fileUrls[index] })) });
  return { request, config: first.input.providerPrintConfig, shippingTier: first.tier, notificationTargets: inputs.map((entry) => gelatoNotificationTarget(entry.row, entry.member.child_order_key)) };
}
export async function assertPrinterSendAuthority(items: Array<{ files: Array<{ url: string }> }>, now: Date) {
  for (const item of items) {
    const value = item.files[0]?.url;
    let key: string;
    try { key = new URL(value).pathname.slice('/api/pdf/'.length); } catch { throw new Error('Gelato printer authority requires a fresh quote'); }
    if (item.files.length !== 1 || !await verifyPrinterFileUrl(value, key, { now, minimumRemainingSeconds: PRINTER_FILE_SEND_MARGIN_SECONDS })) {
      throw new Error('Gelato printer authority requires a fresh quote');
    }
  }
}
function parameters(identity: GelatoSubmissionIdentity) { return { p_submission_id: identity.submissionId, p_token: identity.claimToken }; }
export async function quoteGelatoSubmission(identity: GelatoSubmissionIdentity, dependencies: GelatoSubmissionDependencies) {
  const context = await dependencies.store.load(identity.submissionId);
  const printerFiles = newPrinterFileWindow((dependencies.now ?? (() => new Date()))());
  const input = await buildRequest(context, identity, dependencies, printerFiles);
  const quotedAt = (dependencies.now ?? (() => new Date()))();
  await assertPrinterSendAuthority(input.request.products, (dependencies.now ?? (() => new Date()))());
  const rawQuote = await (dependencies.quote ?? requestGelatoQuote)(input.request);
  const selected = validateGelatoQuote({ response: rawQuote, request: input.request,
    config: input.config, shippingTier: input.shippingTier, quotedAt: quotedAt.toISOString(), now: (dependencies.now ?? (() => new Date()))() });
  const request = buildGelatoDraftOrderRequest({ ...input.request, items: input.request.products.map((item) => ({ ...item, fileUrl: item.files[0].url })),
    recipient: input.request.recipient, config: input.config, selectedQuote: selected, now: (dependencies.now ?? (() => new Date()))() });
  const monetaryQuote = observeGelatoMonetaryQuote(rawQuote, selected, input.request.currency);
  const snapshot = GelatoSavedSnapshotSchema.parse({ request, config: input.config, shippingTier: input.shippingTier, printerFiles, notificationTargets: input.notificationTargets, monetaryQuote });
  await dependencies.store.transition('record_gelato_quote_snapshot', { ...parameters(identity), p_quote_id: selected.quoteId,
    p_shipment_method_uid: selected.shipmentMethodUid, p_policy_version: selected.shipmentPolicyVersion, p_quoted_at: selected.quotedAt,
    p_item_reference_ids: request.items.map((item) => item.itemReferenceId), p_request_fingerprint: selected.requestFingerprint, p_snapshot: snapshot });
  return { submissionId: identity.submissionId, quoteId: selected.quoteId, shipmentMethodUid: selected.shipmentMethodUid, quotedAt: selected.quotedAt };
}
export async function submitGelatoDraft(identity: GelatoSubmissionIdentity, dependencies: GelatoSubmissionDependencies) {
  if (!dependencies.draftsEnabled && !(await dependencies.engineeringDraftsAllowed?.(identity))) throw new Error('Gelato draft submission is disabled');
  const context = await dependencies.store.load(identity.submissionId);
  assertIdentity(context, identity, (dependencies.now ?? (() => new Date()))(), false);
  if (context.submission.request_state === 'submitted') return { submissionId: identity.submissionId, outcome: 'draft', reused: true };
  const s = context.submission;
  const snapshot = GelatoSavedSnapshotSchema.parse(s.quote_snapshot);
  if (!snapshot.printerFiles) throw new Error('Gelato printer authority requires a fresh quote');
  const input = await buildRequest(context, identity, dependencies, snapshot.printerFiles);
  const selection: GelatoSelectedQuote = { quoteId: s.quote_id ?? '', shipmentMethodUid: s.shipment_method_uid ?? '',
    shipmentPolicyVersion: s.shipment_policy_version ?? 0, quotedAt: s.quoted_at ?? '', requestFingerprint: s.quote_request_fingerprint ?? '', shippingTier: snapshot.shippingTier };
  const request: GelatoDraftOrderRequest = buildGelatoDraftOrderRequest({ ...input.request, items: input.request.products.map((item) => ({ ...item, fileUrl: item.files[0].url })),
    recipient: input.request.recipient, config: input.config, selectedQuote: selection, now: (dependencies.now ?? (() => new Date()))() });
  const validatedRequest = GelatoSavedSnapshotSchema.shape.request.parse(request);
  // Optional undefined fields disappear when the quote is stored as JSON.
  if (!isDeepStrictEqual(JSON.parse(JSON.stringify(validatedRequest)), JSON.parse(JSON.stringify(snapshot.request)))) {
    throw new Error('Gelato draft differs from its saved quote snapshot');
  }
  let begun = false;
  try {
    await dependencies.store.transition('begin_gelato_print_submission', { ...parameters(identity), p_execution_id: identity.executionId, p_request_fingerprint: selection.requestFingerprint });
    begun = true;
    await dependencies.store.transition('authorize_gelato_print_send', { ...parameters(identity), p_execution_id: identity.executionId, p_request_fingerprint: selection.requestFingerprint });
    await assertPrinterSendAuthority(request.items, (dependencies.now ?? (() => new Date()))());
    const accepted = await (dependencies.create ?? createGelatoDraft)(request);
    await dependencies.store.transition('record_gelato_accepted_root', { ...parameters(identity), p_execution_id: identity.executionId, p_root_id: accepted.id });
    const graph = await validateGelatoConnectedOrdersWithFiles(await loadGelatoConnectedOrders([accepted.id], dependencies.get ?? getGelatoOrder), request, (reference, url, expected) => { const members = context.members.filter((member) => member.item_reference_id === reference); if (members.length !== 1 || !dependencies.verifyStoredFile) return Promise.resolve(false); return dependencies.verifyStoredFile(members[0], url, expected); }, true);
    const result = await dependencies.store.transition('persist_gelato_draft_result', { ...parameters(identity), p_execution_id: identity.executionId, p_orders: graph });
    return { submissionId: identity.submissionId, outcome: 'draft', providerOrderIds: graph.map((order) => order.id), result, reused: false };
  } catch (error) {
    if (error instanceof GelatoDraftOutcomeUnknownError && error.acceptedRootOrderId) {
      await dependencies.store.transition('record_gelato_accepted_root', { ...parameters(identity), p_execution_id: identity.executionId, p_root_id: error.acceptedRootOrderId }).catch(() => undefined);
    }
    if (begun) await dependencies.store.transition('fence_gelato_print_submission', parameters(identity)).catch(() => undefined);
    throw new Error('Gelato draft did not complete; inspect the submission before retrying');
  }
}
