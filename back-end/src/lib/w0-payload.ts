import { isDeepStrictEqual } from 'node:util';
import { calculateCharacterHash } from './character-hash';
import { getPerBookOrderId, getRootOrderId } from './sibling-print-policy';

/**
 * Build W0 webhook payload for D2C orders.
 * Shape matches Amazon path (n8n W0) but omits amazon_order_id and marketplaceId.
 * See docs/D2C-planning/implementation-plan/D2C-phase-0-orders-only.md Section 6.
 */

/**
 * Build payload for n8n W0 from a D2C order record (Supabase row or mapped order).
 * Do not include amazonOrderId or marketplaceId.
 */
export function buildD2CW0Payload(order: Record<string, unknown>): Record<string, unknown> {
  const trimToString = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };
  const orderId = order.orderId ?? order.order_id ?? order.id;
  const orderDate = typeof order.purchase_date === 'string'
    ? order.purchase_date
    : (order.order_date as string) ?? new Date().toISOString();
  const customerEmail = order.customer_email as string | undefined;
  const customerName = order.customer_name as string | undefined;
  const characterSpecs = order.character_specs ?? order.characterSpecs ?? {};
  const characterHash = order.character_hash ?? order.characterHash;
  const shippingAddress = order.shipping_address ?? order.shippingAddress ?? {};
  const dedication = order.dedication_text ?? order.dedication ?? '';
  const productInfo = (order.product_info ?? order.productInfo) as Record<string, unknown> | undefined;
  const bookId = trimToString(productInfo?.bookId) ?? trimToString(productInfo?.book_id);
  const formatId = trimToString(productInfo?.formatId) ?? trimToString(productInfo?.format_id);
  const configVersion = productInfo?.configVersion;
  const pinnedVersion = bookId === 'book-finding-our-inner-voice' && typeof configVersion === 'number' &&
    Number.isSafeInteger(configVersion) && configVersion >= 1 ? configVersion : undefined;

  const bookSpecs = productInfo?.totalPages != null
    ? {
        title: productInfo.title ?? `${(characterSpecs as Record<string, unknown>).childName ?? 'Child'} and the Adventure Compass`,
        totalPages: productInfo.totalPages,
        format: productInfo.format ?? '8.5x8.5_softcover',
        bookType: productInfo.bookType ?? 'adventure',
        ...(bookId ? { bookId } : {}),
        ...(formatId ? { formatId } : {}),
        ...(pinnedVersion ? { configVersion: pinnedVersion } : {}),
      }
    : {
        title: `${(characterSpecs as Record<string, unknown>).childName ?? 'Child'} and the Adventure Compass`,
        totalPages: 16,
        format: '8.5x8.5_softcover',
        bookType: 'adventure',
        ...(bookId ? { bookId } : {}),
        ...(formatId ? { formatId } : {}),
        ...(pinnedVersion ? { configVersion: pinnedVersion } : {}),
      };

  return {
    orderId,
    id: orderId,
    orderDate,
    purchaseDate: orderDate,
    status: 'queued_for_processing',
    customerEmail: customerEmail ?? '',
    buyer: {
      email: customerEmail ?? '',
      name: customerName ?? (shippingAddress as Record<string, unknown>)?.name ?? '',
    },
    // Purpose: match Amazon payload shape for downstream workflow compatibility.
    shippingAddress,
    shipping_address: shippingAddress,
    characterSpecs,
    character_specs: characterSpecs,
    ...(bookId ? { bookId, book_id: bookId } : {}),
    ...(formatId ? { formatId, format_id: formatId } : {}),
    ...(pinnedVersion ? { configVersion: pinnedVersion } : {}),
    bookSpecs,
    book_specs: bookSpecs,
    orderDetails: {
      quantity: 1,
      shippingAddress,
    },
    dedication,
    characterHash: characterHash ?? '',
    character_hash: characterHash ?? '',
  };
}


/** Recover the persisted per-book intake without inferring platform from compatibility IDs. */
export function buildPendingW0Payload(order: Record<string, unknown>): Record<string, unknown> {
  const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
  const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
  const platform = order.platform == null ? 'd2c' : order.platform;
  if (platform !== 'd2c' && platform !== 'amazon') throw new Error('Unsupported pending W0 platform');
  const orderId = getPerBookOrderId(order);
  if ((!text(order.orderId) && !text(order.order_id)) || !orderId || (text(order.orderId) && text(order.order_id) && text(order.orderId) !== text(order.order_id))) throw new Error('Invalid pending W0 per-book identity');
  const payload = buildD2CW0Payload(order);
  payload.orderId = orderId; payload.id = orderId;
  const rootOrderId = getRootOrderId(order);
  if (rootOrderId) { payload.rootOrderId = rootOrderId; payload.root_order_id = rootOrderId; }
  const rawInfo = order.product_info ?? order.productInfo;
  const info = object(rawInfo) ? rawInfo : {};
  const candidates = [order.book_specs, order.bookSpecs, info.book_specs, info.bookSpecs];
  for (const candidate of candidates) if (candidate != null && !object(candidate)) throw new Error('Invalid pending W0 book specs');
  const stored = candidates.filter((value): value is Record<string, unknown> => object(value) && Object.keys(value).length > 0);
  if (stored.length) {
    const specs = stored[0];
    if (stored.some(value => !isDeepStrictEqual(value, specs))) throw new Error('Conflicting pending W0 book specs');
    if (specs.channel != null && specs.channel !== platform) throw new Error('Conflicting pending W0 platform');
    for (const [key, aliases] of [['bookId', ['bookId', 'book_id']], ['formatId', ['formatId', 'format_id']], ['configVersion', ['configVersion']]] as const) {
      const value = specs[key];
      if (value == null) continue;
      if (key === 'configVersion' ? !(typeof value === 'number' && Number.isSafeInteger(value) && value >= 1) : !(typeof value === 'string' && value.length > 0 && value === value.trim())) throw new Error('Invalid pending W0 frozen selection');
      for (const alias of aliases) if (info[alias] != null && info[alias] !== value) throw new Error('Conflicting pending W0 frozen selection');
      for (const alias of aliases) payload[alias] = value;
    }
    for (const key of ['title', 'totalPages', 'format', 'bookType']) if (info[key] != null && specs[key] != null && info[key] !== specs[key]) throw new Error('Conflicting pending W0 book metadata');
    payload.bookSpecs = { ...specs }; payload.book_specs = payload.bookSpecs;
  }
  if (payload.bookId != null && payload.bookId !== 'book-mvp-simple-adventure') {
    if (!(text(payload.bookId) && text(payload.formatId) && typeof payload.configVersion === 'number' && Number.isSafeInteger(payload.configVersion) && payload.configVersion >= 1)) throw new Error('Incomplete pending W0 frozen selection');
  }
  const selectionSources = [info, ...stored];
  const selectorAliases = {
    bookId: ['bookId', 'book_id', 'project', 'print_book_id', 'printBookId'],
    formatId: ['formatId', 'format_id', 'print_format_id', 'printFormatId'],
    configVersion: ['configVersion', 'config_version', 'version', 'print_config_version', 'printConfigVersion'],
  };
  const configuredInnerVoice = payload.bookId === 'book-finding-our-inner-voice' ||
    selectionSources.some(source => selectorAliases.bookId.some(alias => typeof source[alias] === 'string' && (source[alias] as string).trim() === 'book-finding-our-inner-voice'));
  if (configuredInnerVoice) {
    if (rawInfo != null && !object(rawInfo)) throw new Error('Invalid pending W0 product info');
    for (const candidate of [order.bookSpecs, order.productInfo, info.book_specs, info.bookSpecs]) {
      if (candidate !== undefined && !object(candidate)) throw new Error('Invalid pending W0 JSON book context');
    }
    if (payload.bookId !== 'book-finding-our-inner-voice') throw new Error('Conflicting pending W0 frozen selection');
    for (const [key, aliases] of Object.entries(selectorAliases)) {
      for (const source of selectionSources) {
        for (const alias of aliases) {
          if (Object.hasOwn(source, alias) && source[alias] !== undefined && source[alias] !== payload[key]) {
            throw new Error('Conflicting pending W0 frozen selection');
          }
        }
      }
    }
    const originalSpecs = order.character_specs ?? order.characterSpecs;
    if (!object(originalSpecs) || Object.keys(originalSpecs).length === 0) throw new Error('Missing or invalid pending W0 original character specs');
    for (const key of ['character_specs', 'characterSpecs']) {
      if (Object.hasOwn(order, key) && !isDeepStrictEqual(order[key], originalSpecs)) throw new Error('Conflicting pending W0 original character specs');
    }
    const originalHash = order.character_hash ?? order.characterHash;
    if (typeof originalHash !== 'string' || originalHash !== calculateCharacterHash(originalSpecs, orderId)) {
      throw new Error('Invalid pending W0 original order-scoped character hash');
    }
    for (const key of ['character_hash', 'characterHash']) {
      if (Object.hasOwn(order, key) && order[key] !== originalHash) throw new Error('Conflicting pending W0 original character hash');
    }
  }
  if (info.line_items != null) {
    if (!Array.isArray(info.line_items)) throw new Error('Invalid pending W0 line items');
    payload.items = info.line_items;
  }
  if (info.line_item != null) {
    if (!object(info.line_item)) throw new Error('Invalid pending W0 line item');
    payload.lineItem = info.line_item; payload.line_item = info.line_item;
  }
  const unitIndex = info._quantity_unit_index, unitCount = info._quantity_unit_count;
  if (unitIndex != null || unitCount != null) {
    if (!(typeof unitIndex === 'number' && Number.isSafeInteger(unitIndex) && unitIndex >= 1 && typeof unitCount === 'number' && Number.isSafeInteger(unitCount) && unitCount >= unitIndex)) throw new Error('Invalid pending W0 quantity identity');
    payload.unitIndex = unitIndex; payload.unitCount = unitCount;
  }
  if (platform === 'amazon') {
    const marketplaceId = text(order.marketplace_id);
    if (!rootOrderId || !marketplaceId || (text(order.root_order_id) && text(order.amazon_order_id) && text(order.root_order_id) !== text(order.amazon_order_id))) throw new Error('Missing or conflicting pending W0 Amazon identity');
    payload.amazonOrderId = rootOrderId; payload.marketplaceId = marketplaceId;
  }
  return payload;
}
