import { buildW4PrintInput, type BuildW4PrintInputResult } from '@/lib/books/w4-print-input';
import type { LoadManifestForW4, LoadOrderForW4 } from '@/lib/books/w4-print-input';
import { getBucketFromKey } from '@/lib/r2-utils';

type JsonRecord = Record<string, unknown>;
const SANDBOX_LULU_API_BASE = 'https://api.sandbox.lulu.com';

export type SignObjectUrlForW4Sibling = (
  key: string,
  bucket: string,
  expiresIn: number,
) => Promise<string>;

export interface BuildW4SiblingPrintItem extends BuildW4PrintInputResult {
  rootGroupId: string;
  siblingIndex: number;
  siblingCount: number;
  groupOrderIds: string[];
}

export interface BuildW4SiblingPrintInputResult {
  success?: true;
  rootGroupId: string;
  rootOrderId: string;
  siblingCount: number;
  orderIds: string[];
  siblings: BuildW4SiblingPrintItem[];
  CONFIG: JsonRecord;
  backendUrl: string | null;
}

export interface BuildW4SiblingSubmitItem extends BuildW4SiblingPrintItem {
  childName: string;
  interiorSignedUrl: string;
  coverSignedUrl: string;
}

export interface BuildW4SiblingSubmitInputResult {
  success?: true;
  rootGroupId: string;
  rootOrderId: string;
  siblingCount: number;
  orderIds: string[];
  siblings: BuildW4SiblingSubmitItem[];
  submitMode: 'sandbox' | 'skip';
  luluApiBase: string;
  luluPayload: JsonRecord;
  shippingAddress: JsonRecord;
  shippingLevelRequested: string | null;
  shippingLevelSent: string;
  shippingTierResolved: string;
  shippingTierResolvedReason: string;
  amazon_shipment_service_level: string | null;
  __skipLulu: boolean;
  guard: {
    reason: 'test_mode' | 'existing_job' | 'sandbox';
    details?: string;
  };
  luluJobId: string | null;
  luluStatus: string | null;
  workflowJobId: number | null;
  workflowJobIdempotencyKey: string | null;
  workflowAttemptId: number | null;
  workflowJobStatus: string | null;
  CONFIG: JsonRecord;
}

export interface BuildW4SiblingPrintInputOptions {
  loadManifest: LoadManifestForW4;
  loadOrder?: LoadOrderForW4;
  defaultBackendUrl?: string;
}

export interface BuildW4SiblingSubmitInputOptions {
  loadOrder?: LoadOrderForW4;
  signObjectUrl: SignObjectUrlForW4Sibling;
  signedUrlExpiresIn?: number;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const lowered = trimmed.toLowerCase();
  return lowered === 'null' || lowered === 'undefined' ? null : trimmed;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }
  }

  return false;
}

function toInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value);
  }

  if (typeof value !== 'string') {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickFirstNonEmpty<T>(...values: T[]): T | null {
  for (const value of values) {
    if (value === undefined || value === null) {
      continue;
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed && trimmed.toLowerCase() !== 'null' && trimmed.toLowerCase() !== 'undefined') {
        return value;
      }
      continue;
    }

    return value;
  }

  return null;
}

function cloneRecord(value: JsonRecord): JsonRecord {
  return JSON.parse(JSON.stringify(value)) as JsonRecord;
}

function deriveRootGroupId(orderId: string | null): string | null {
  const trimmed = toTrimmedString(orderId);
  if (!trimmed) {
    return null;
  }

  const itemMatch = /^(.*?)-item-\d+$/i.exec(trimmed);
  return itemMatch?.[1] ?? trimmed;
}

function extractSiblingGroup(value: unknown): JsonRecord[] | null {
  if (Array.isArray(value)) {
    const records = value.filter((entry): entry is JsonRecord => isRecord(entry));
    return records.length > 0 ? records : null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const direct = pickFirstNonEmpty(
    value.siblingGroup,
    value.siblingOrders,
    value.orders,
  );
  if (Array.isArray(direct)) {
    const records = direct.filter((entry): entry is JsonRecord => isRecord(entry));
    if (records.length > 0) {
      return records;
    }
  }

  for (const nestedKey of ['body', 'payload', 'data']) {
    const nested = extractSiblingGroup(value[nestedKey]);
    if (nested?.length) {
      return nested;
    }
  }

  return null;
}

function resolveGroupConfig(input: JsonRecord): JsonRecord {
  const directConfig = toRecord(input.CONFIG);
  const bodyConfig = toRecord(toRecord(input.body).CONFIG);
  const payloadConfig = toRecord(toRecord(input.payload).CONFIG);
  return {
    ...payloadConfig,
    ...bodyConfig,
    ...directConfig,
  };
}

function getSiblingOrderId(record: JsonRecord): string | null {
  return toTrimmedString(
    pickFirstNonEmpty(
      record.orderId,
      record.order_id,
      record.amazonOrderId,
      record.amazon_order_id,
    ),
  );
}

function siblingSortValue(orderId: string): { itemIndex: number | null; tieBreaker: string } {
  const itemMatch = /-item-(\d+)$/i.exec(orderId);
  return {
    itemIndex: itemMatch ? Number.parseInt(itemMatch[1], 10) : null,
    tieBreaker: orderId,
  };
}

function sortSiblingRecords<T extends { orderId: string }>(records: T[]): T[] {
  return [...records].sort((left, right) => {
    const leftSort = siblingSortValue(left.orderId);
    const rightSort = siblingSortValue(right.orderId);

    if (leftSort.itemIndex !== null && rightSort.itemIndex !== null && leftSort.itemIndex !== rightSort.itemIndex) {
      return leftSort.itemIndex - rightSort.itemIndex;
    }

    if (leftSort.itemIndex !== null && rightSort.itemIndex === null) {
      return -1;
    }

    if (leftSort.itemIndex === null && rightSort.itemIndex !== null) {
      return 1;
    }

    return leftSort.tieBreaker.localeCompare(rightSort.tieBreaker);
  });
}

function normalizeShippingAddress(addressLike: unknown): JsonRecord {
  const address = toRecord(addressLike);

  let street1 =
    toTrimmedString(
      pickFirstNonEmpty(
        address.street1,
        address.address_line_1,
        address.address_line1,
        address.address1,
        address.address,
        address.street,
      ),
    ) ?? '';

  street1 = street1
    .replace(/\bStreet\b/gi, 'St')
    .replace(/\bAvenue\b/gi, 'Ave')
    .replace(/\bRoad\b/gi, 'Rd')
    .replace(/\bDrive\b/gi, 'Dr')
    .replace(/\bLane\b/gi, 'Ln')
    .replace(/\bBoulevard\b/gi, 'Blvd')
    .replace(/\bCourt\b/gi, 'Ct')
    .replace(/\bCircle\b/gi, 'Cir')
    .replace(/\bPlace\b/gi, 'Pl');

  const normalized: JsonRecord = {
    name:
      toTrimmedString(
        pickFirstNonEmpty(
          address.name,
          address.recipient_name,
        ),
      ) ?? '',
    street1,
    street2:
      toTrimmedString(
        pickFirstNonEmpty(
          address.street2,
          address.address_line_2,
          address.address_line2,
          address.address2,
        ),
      ) ?? '',
    city: toTrimmedString(address.city) ?? '',
    state_code:
      toTrimmedString(
        pickFirstNonEmpty(address.state_code, address.state, address.stateCode),
      ) ?? '',
    postcode:
      toTrimmedString(
        pickFirstNonEmpty(
          address.postcode,
          address.postal_code,
          address.zip,
          address.zipcode,
        ),
      ) ?? '',
    country_code:
      toTrimmedString(
        pickFirstNonEmpty(
          address.country_code,
          address.country,
          address.countryCode,
        ),
      ) ?? 'US',
    phone_number:
      toTrimmedString(
        pickFirstNonEmpty(
          address.phone_number,
          address.phone,
          address.phoneNumber,
        ),
      ) ?? '',
    email: toTrimmedString(address.email) ?? '',
  };

  const stateCode = String(normalized.state_code || '').trim();
  if (stateCode.length > 2) {
    const stateMap: Record<string, string> = {
      oregon: 'OR',
      california: 'CA',
      texas: 'TX',
      'new york': 'NY',
      florida: 'FL',
      illinois: 'IL',
      pennsylvania: 'PA',
      ohio: 'OH',
      washington: 'WA',
    };
    normalized.state_code =
      stateMap[stateCode.toLowerCase()] ?? stateCode.slice(0, 2).toUpperCase();
  } else {
    normalized.state_code = stateCode.toUpperCase();
  }

  normalized.country_code = String(normalized.country_code || 'US')
    .trim()
    .toUpperCase()
    .slice(0, 2);

  return normalized;
}

function mapAmazonShippingToLulu(amazonShipping: string | null): string | null {
  if (!amazonShipping) {
    return null;
  }

  const shipping = amazonShipping.toUpperCase();
  if (
    shipping.includes('OVERNIGHT') ||
    shipping.includes('PRIORITY') ||
    shipping.includes('EXPRESS')
  ) {
    return 'EXPRESS';
  }

  if (
    shipping.includes('EXPEDITED') ||
    shipping.includes('2-DAY') ||
    shipping.includes('2DAY')
  ) {
    return 'EXPEDITED';
  }

  if (
    shipping.includes('STANDARD') ||
    shipping.includes('STD') ||
    shipping.includes('GROUND')
  ) {
    return 'GROUND';
  }

  return 'MAIL';
}

function mapD2CTierToLulu(d2cTier: string | null): string | null {
  if (!d2cTier) {
    return null;
  }

  const normalized = d2cTier.trim().toLowerCase();
  const map: Record<string, string> = {
    mail: 'MAIL',
    standard: 'MAIL',
    economy: 'MAIL',
    ground: 'GROUND',
    ground_home: 'GROUND',
    priority: 'PRIORITY_MAIL',
    priority_mail: 'PRIORITY_MAIL',
    expedited: 'EXPEDITED',
    express: 'EXPRESS',
    overnight: 'EXPRESS',
  };

  return map[normalized] ?? null;
}

function normalizeShippingLevel(params: {
  requestedLevel: string | null;
  amazonShipping: string | null;
  d2cTier: string | null;
}): { shippingLevel: string; reason: string } {
  const amazonMapped = mapAmazonShippingToLulu(params.amazonShipping);
  if (amazonMapped) {
    return {
      shippingLevel: amazonMapped,
      reason: 'amazon',
    };
  }

  const d2cMapped = mapD2CTierToLulu(params.d2cTier);
  if (d2cMapped) {
    return {
      shippingLevel: d2cMapped,
      reason: 'd2c_tier',
    };
  }

  if (params.d2cTier) {
    return {
      shippingLevel: 'MAIL',
      reason: 'fallback_unknown',
    };
  }

  const requested = (params.requestedLevel ?? '').trim().toUpperCase();
  if (requested === 'STANDARD') {
    return {
      shippingLevel: 'MAIL',
      reason: 'fallback_default',
    };
  }
  if (requested === 'GROUND') {
    return {
      shippingLevel: 'GROUND',
      reason: 'fallback_default',
    };
  }

  const allowed = new Set(['MAIL', 'PRIORITY_MAIL', 'GROUND', 'EXPEDITED', 'EXPRESS']);
  return {
    shippingLevel: allowed.has(requested) ? requested : 'MAIL',
    reason: 'fallback_default',
  };
}

function deriveChildName(sibling: JsonRecord): string {
  return (
    toTrimmedString(
      pickFirstNonEmpty(
        toRecord(sibling.characterSpecs).childName,
        toRecord(sibling.character_specs).childName,
      ),
    ) ?? 'Book'
  );
}

function deriveRequestedShippingLevel(sibling: JsonRecord): string | null {
  return toTrimmedString(
    pickFirstNonEmpty(
      sibling.shipping_tier,
      sibling.shippingTier,
      toRecord(sibling.CONFIG).defaults && toRecord(toRecord(sibling.CONFIG).defaults).shippingLevel,
    ),
  );
}

function deriveAmazonShippingLevel(sibling: JsonRecord): string | null {
  return toTrimmedString(
    pickFirstNonEmpty(
      sibling.ShipmentServiceLevelCategory,
      sibling.ShipServiceLevel,
      sibling.amazon_shipment_service_level,
    ),
  );
}

function withSandboxConfig(input: JsonRecord): JsonRecord {
  const currentConfig =
    Object.keys(toRecord(input.CONFIG)).length > 0
      ? toRecord(input.CONFIG)
      : toRecord(input);
  const currentLulu = toRecord(currentConfig.lulu);
  return {
    ...currentConfig,
    lulu: {
      ...currentLulu,
      apiBase: SANDBOX_LULU_API_BASE,
    },
  };
}

function toWorkflowJobId(value: unknown): number | null {
  return toInteger(value);
}

function resolveWorkflowFieldsFromSibling(sibling: JsonRecord): {
  workflowJobId: number | null;
  workflowJobIdempotencyKey: string | null;
  workflowAttemptId: number | null;
  workflowJobStatus: string | null;
} {
  return {
    workflowJobId: toWorkflowJobId(sibling.workflowJobId),
    workflowJobIdempotencyKey: toTrimmedString(sibling.workflowJobIdempotencyKey),
    workflowAttemptId: toWorkflowJobId(sibling.workflowAttemptId),
    workflowJobStatus: toTrimmedString(sibling.workflowJobStatus),
  };
}

function validateSiblingGroupSize(orderIds: string[]): void {
  if (orderIds.length < 2) {
    throw new Error(
      `W4.1 sibling print input requires at least 2 sibling orders (received ${orderIds.length})`,
    );
  }
}

function parseSiblingGroupInput(input: JsonRecord | unknown[]): {
  envelope: JsonRecord;
  siblings: JsonRecord[];
  config: JsonRecord;
  backendUrl: string | null;
  rootGroupId: string;
} {
  const envelope = Array.isArray(input) ? {} : toRecord(input);
  const siblingGroup = Array.isArray(input) ? extractSiblingGroup(input) : extractSiblingGroup(envelope);
  if (!siblingGroup?.length) {
    throw new Error('W4.1 sibling print input requires siblingGroup, siblingOrders, or orders');
  }

  const deduped = new Map<string, JsonRecord>();
  for (const rawSibling of siblingGroup) {
    const orderId = getSiblingOrderId(rawSibling);
    if (!orderId) {
      throw new Error('W4.1 sibling print input received a sibling item without orderId');
    }
    if (!deduped.has(orderId)) {
      deduped.set(orderId, cloneRecord(rawSibling));
    }
  }

  const orderIds = [...deduped.keys()];
  validateSiblingGroupSize(orderIds);

  const config = resolveGroupConfig(envelope);
  const backendUrl =
    toTrimmedString(
      pickFirstNonEmpty(
        envelope.backendUrl,
        toRecord(envelope.body).backendUrl,
        toRecord(envelope.payload).backendUrl,
      ),
    ) ?? null;

  const firstSibling = deduped.values().next().value as JsonRecord | undefined;
  const rootGroupId =
    toTrimmedString(
      pickFirstNonEmpty(
        envelope.rootGroupId,
        envelope.rootOrderId,
        envelope.root_order_id,
        firstSibling?.rootGroupId,
        firstSibling?.rootOrderId,
        firstSibling?.root_order_id,
        firstSibling?.amazonOrderId,
        firstSibling?.amazon_order_id,
        deriveRootGroupId(getSiblingOrderId(firstSibling ?? {}) ?? null),
      ),
    ) ?? '';

  if (!rootGroupId) {
    throw new Error('W4.1 sibling print input could not derive rootGroupId');
  }

  for (const sibling of deduped.values()) {
    const explicitRoot =
      toTrimmedString(
        pickFirstNonEmpty(
          sibling.rootGroupId,
          sibling.rootOrderId,
          sibling.root_order_id,
          sibling.amazonOrderId,
          sibling.amazon_order_id,
        ),
      ) ?? null;
    if (explicitRoot && explicitRoot !== rootGroupId) {
      throw new Error(
        `W4.1 sibling print input received inconsistent rootOrderId values (${rootGroupId} vs ${explicitRoot})`,
      );
    }
  }

  return {
    envelope,
    siblings: sortSiblingRecords(orderIds.map((orderId) => ({ orderId, item: deduped.get(orderId)! }))).map(
      ({ item }) => item,
    ),
    config,
    backendUrl,
    rootGroupId,
  };
}

function parseSiblingSubmitInput(input: JsonRecord | unknown[]): {
  config: JsonRecord;
  rootGroupId: string;
  rootOrderId: string;
  siblings: BuildW4SiblingPrintItem[];
  workflowJobId: number | null;
  workflowJobIdempotencyKey: string | null;
  workflowAttemptId: number | null;
  workflowJobStatus: string | null;
} {
  const envelope = Array.isArray(input) ? {} : toRecord(input);
  const nested = toRecord(envelope.body);
  const payload = toRecord(envelope.payload);
  const siblingGroup =
    (Array.isArray(input)
      ? input
      : pickFirstNonEmpty(
          envelope.siblings,
          nested.siblings,
          payload.siblings,
          envelope.items,
          nested.items,
          payload.items,
        )) ?? input;

  const siblings = extractSiblingGroup(siblingGroup);
  if (!siblings?.length) {
    throw new Error('W4.1 sibling submit input requires siblings[]');
  }

  const normalizedSiblings = siblings.map((sibling) => sibling as BuildW4SiblingPrintItem);
  const sortedSiblings = sortSiblingRecords(
    normalizedSiblings.map((sibling) => ({
      ...sibling,
      orderId: sibling.orderId,
    })),
  );

  const firstSibling = sortedSiblings[0];
  const rootGroupId =
    toTrimmedString(
      pickFirstNonEmpty(
        envelope.rootGroupId,
        nested.rootGroupId,
        payload.rootGroupId,
        firstSibling.rootGroupId,
        firstSibling.rootOrderId,
      ),
    ) ?? '';
  const rootOrderId =
    toTrimmedString(
      pickFirstNonEmpty(
        envelope.rootOrderId,
        envelope.root_order_id,
        nested.rootOrderId,
        nested.root_order_id,
        payload.rootOrderId,
        payload.root_order_id,
        firstSibling.rootOrderId,
        rootGroupId,
      ),
    ) ?? '';

  if (!rootGroupId || !rootOrderId) {
    throw new Error('W4.1 sibling submit input could not resolve rootGroupId/rootOrderId');
  }

  return {
    config: {
      ...resolveGroupConfig(envelope),
      ...toRecord(firstSibling.CONFIG),
    },
    rootGroupId,
    rootOrderId,
    siblings: sortedSiblings,
    ...resolveWorkflowFieldsFromSibling(firstSibling),
  };
}

async function buildSiblingPrintItem(
  sibling: JsonRecord,
  params: {
    envelope: JsonRecord;
    config: JsonRecord;
    backendUrl: string | null;
    rootGroupId: string;
  },
  options: BuildW4SiblingPrintInputOptions,
): Promise<BuildW4PrintInputResult> {
  const orderId = getSiblingOrderId(sibling);
  if (!orderId) {
    throw new Error('W4.1 sibling print input received a sibling item without orderId');
  }

  const mergedInput: JsonRecord = {
    ...params.envelope,
    ...sibling,
    CONFIG: params.config,
  };

  delete mergedInput.siblingGroup;
  delete mergedInput.siblingOrders;
  delete mergedInput.orders;
  delete mergedInput.siblings;

  mergedInput.orderId = orderId;
  mergedInput.rootOrderId =
    toTrimmedString(
      pickFirstNonEmpty(
        sibling.rootOrderId,
        sibling.root_order_id,
        params.rootGroupId,
      ),
    ) ?? params.rootGroupId;
  mergedInput.rootGroupId = params.rootGroupId;

  if (params.backendUrl) {
    mergedInput.backendUrl = params.backendUrl;
  }

  const manifest3Key =
    toTrimmedString(
      pickFirstNonEmpty(
        sibling.manifest3Key,
        sibling.manifest_3_key,
        sibling.manifest3Url,
        sibling.manifest_3_url,
        sibling.manifestUrl,
        sibling.three_manifest_url,
      ),
    ) ?? null;
  if (manifest3Key) {
    mergedInput.manifest3Key = manifest3Key;
  }

  return buildW4PrintInput(mergedInput, options);
}

export async function buildW4SiblingPrintInput(
  input: JsonRecord | unknown[],
  options: BuildW4SiblingPrintInputOptions,
): Promise<BuildW4SiblingPrintInputResult> {
  const parsed = parseSiblingGroupInput(input);

  const builtSiblings = await Promise.all(
    parsed.siblings.map((sibling) =>
      buildSiblingPrintItem(
        sibling,
        {
          envelope: parsed.envelope,
          config: parsed.config,
          backendUrl: parsed.backendUrl,
          rootGroupId: parsed.rootGroupId,
        },
        options,
      ),
    ),
  );

  const sortedSiblings = sortSiblingRecords(
    builtSiblings.map((sibling) => ({
      ...sibling,
      orderId: sibling.orderId,
    })),
  );

  const normalizedRootOrderId =
    toTrimmedString(sortedSiblings[0]?.rootOrderId) ?? parsed.rootGroupId;
  const orderIds = sortedSiblings.map((sibling) => sibling.orderId);
  validateSiblingGroupSize(orderIds);

  for (const sibling of sortedSiblings) {
    const candidateRoot = toTrimmedString(sibling.rootOrderId) ?? '';
    if (candidateRoot && candidateRoot !== normalizedRootOrderId) {
      throw new Error(
        `W4.1 sibling print input received inconsistent rootOrderId values (${normalizedRootOrderId} vs ${candidateRoot})`,
      );
    }
  }

  const siblingCount = sortedSiblings.length;
  const siblings: BuildW4SiblingPrintItem[] = sortedSiblings.map((sibling, index) => ({
    ...sibling,
    rootGroupId: parsed.rootGroupId,
    rootOrderId: normalizedRootOrderId,
    siblingIndex: index,
    siblingCount,
    groupOrderIds: orderIds,
  }));

  return {
    rootGroupId: parsed.rootGroupId,
    rootOrderId: normalizedRootOrderId,
    siblingCount,
    orderIds,
    siblings,
    CONFIG: parsed.config,
    backendUrl: parsed.backendUrl,
  };
}

async function getExistingLuluSubmission(
  siblings: BuildW4SiblingPrintItem[],
  loadOrder?: LoadOrderForW4,
): Promise<{ luluJobId: string; luluStatus: string | null; details: string } | null> {
  if (!loadOrder) {
    return null;
  }

  const submissions: Array<{ orderId: string; luluJobId: string; luluStatus: string | null }> = [];
  for (const sibling of siblings) {
    const loaded = await loadOrder(sibling.orderId).catch(() => null);
    const record = toRecord(loaded);
    const luluJobId = toTrimmedString(record.lulu_job_id);
    const luluStatus = toTrimmedString(record.lulu_status);
    if (!luluJobId && !luluStatus) {
      continue;
    }

    submissions.push({
      orderId: sibling.orderId,
      luluJobId: luluJobId ?? `STATUS-${luluStatus}`,
      luluStatus,
    });
  }

  if (!submissions.length) {
    return null;
  }

  return {
    luluJobId: submissions[0].luluJobId,
    luluStatus: submissions[0].luluStatus,
    details: submissions
      .map((submission) =>
        `${submission.orderId}: job=${submission.luluJobId}${submission.luluStatus ? ` status=${submission.luluStatus}` : ''}`,
      )
      .join(', '),
  };
}

export async function buildW4SiblingSubmitInput(
  input: JsonRecord | unknown[],
  options: BuildW4SiblingSubmitInputOptions,
): Promise<BuildW4SiblingSubmitInputResult> {
  const parsed = parseSiblingSubmitInput(input);
  validateSiblingGroupSize(parsed.siblings.map((sibling) => sibling.orderId));
  const CONFIG = withSandboxConfig(parsed.config);

  const signedUrlExpiresIn = options.signedUrlExpiresIn ?? 21600;
  const siblings: BuildW4SiblingSubmitItem[] = await Promise.all(
    parsed.siblings.map(async (sibling) => {
      const pdfR2Key = toTrimmedString(sibling.pdfR2Key);
      const coverPdfR2Key = toTrimmedString(sibling.coverPdfR2Key);
      if (!pdfR2Key || !coverPdfR2Key) {
        throw new Error(`W4.1 sibling submit input is missing PDF keys for ${sibling.orderId}`);
      }

      const interiorSignedUrl = await options.signObjectUrl(
        pdfR2Key,
        getBucketFromKey(pdfR2Key),
        signedUrlExpiresIn,
      );
      const coverSignedUrl = await options.signObjectUrl(
        coverPdfR2Key,
        getBucketFromKey(coverPdfR2Key),
        signedUrlExpiresIn,
      );

      return {
        ...sibling,
        childName: deriveChildName(sibling),
        interiorSignedUrl,
        coverSignedUrl,
      };
    }),
  );

  const firstSibling = siblings[0];
  const shippingAddress = normalizeShippingAddress(firstSibling.shippingAddress);
  if (!toTrimmedString(shippingAddress.phone_number)) {
    throw new Error('W4.1 sibling submit input requires shippingAddress.phone_number');
  }

  const requestedShippingLevel = deriveRequestedShippingLevel(firstSibling);
  const amazonShippingLevel = deriveAmazonShippingLevel(firstSibling);
  const normalizedShipping = normalizeShippingLevel({
    requestedLevel: requestedShippingLevel,
    amazonShipping: amazonShippingLevel,
    d2cTier:
      toTrimmedString(
        pickFirstNonEmpty(
          firstSibling.shipping_tier,
          firstSibling.shippingTier,
        ),
      ) ?? null,
  });

  const quantity =
    toInteger(
      pickFirstNonEmpty(
        toRecord(parsed.config.defaults).quantity,
        1,
      ),
    ) ?? 1;
  const defaults = toRecord(parsed.config.defaults);
  const printDefaults = toRecord(defaults.print);
  const trimDefaults = toRecord(defaults.trimIn);
  const podPackageId =
    toTrimmedString(
      pickFirstNonEmpty(
        defaults.podPackageId,
        trimDefaults.podPackageId,
      ),
    ) ?? '0850X0850FCPRESS080CW444MXX';

  const productConfig = {
    trim_size: `${toTrimmedString(trimDefaults.w) ?? '8.5'}x${toTrimmedString(trimDefaults.h) ?? '8.5'}`,
    interior_color: toTrimmedString(printDefaults.color) ?? 'premium-color',
    interior_paper: toTrimmedString(printDefaults.stock) ?? '80#-text',
    binding: toTrimmedString(printDefaults.binding) ?? 'saddle-stitch',
    cover_finish: toTrimmedString(printDefaults.coverFinish) ?? 'matte',
  };

  const luluPayload: JsonRecord = {
    external_id: `sibling-${parsed.rootGroupId}`,
    contact_email:
      toTrimmedString(firstSibling.customer?.email) ?? 'orders@littleherolabs.com',
    shipping_level: normalizedShipping.shippingLevel,
    shipping_address: shippingAddress,
    line_items: siblings.map((sibling) => ({
      external_id: sibling.orderId,
      title: sibling.title || `Little Hero Book - ${sibling.childName}`,
      quantity,
      printable_normalization: {
        interior: {
          source_url: sibling.interiorSignedUrl,
        },
        cover: {
          source_url: sibling.coverSignedUrl,
        },
        pod_package_id: podPackageId,
      },
      print_options: productConfig,
    })),
  };

  const existingSubmission = await getExistingLuluSubmission(siblings, options.loadOrder);
  if (existingSubmission) {
    return {
      rootGroupId: parsed.rootGroupId,
      rootOrderId: parsed.rootOrderId,
      siblingCount: siblings.length,
      orderIds: siblings.map((sibling) => sibling.orderId),
      siblings,
      submitMode: 'skip',
      luluApiBase: SANDBOX_LULU_API_BASE,
      luluPayload,
      shippingAddress,
      shippingLevelRequested: requestedShippingLevel,
      shippingLevelSent: normalizedShipping.shippingLevel,
      shippingTierResolved: normalizedShipping.shippingLevel,
      shippingTierResolvedReason: 'existing_job',
      amazon_shipment_service_level: amazonShippingLevel,
      __skipLulu: true,
      guard: {
        reason: 'existing_job',
        details: existingSubmission.details,
      },
      luluJobId: existingSubmission.luluJobId,
      luluStatus: existingSubmission.luluStatus ?? 'SUBMITTED',
      workflowJobId: parsed.workflowJobId,
      workflowJobIdempotencyKey: parsed.workflowJobIdempotencyKey,
      workflowAttemptId: parsed.workflowAttemptId,
      workflowJobStatus: parsed.workflowJobStatus,
      CONFIG,
    };
  }

  if (toBoolean(defaults.testMode)) {
    return {
      rootGroupId: parsed.rootGroupId,
      rootOrderId: parsed.rootOrderId,
      siblingCount: siblings.length,
      orderIds: siblings.map((sibling) => sibling.orderId),
      siblings,
      submitMode: 'skip',
      luluApiBase: SANDBOX_LULU_API_BASE,
      luluPayload,
      shippingAddress,
      shippingLevelRequested: requestedShippingLevel,
      shippingLevelSent: normalizedShipping.shippingLevel,
      shippingTierResolved: normalizedShipping.shippingLevel,
      shippingTierResolvedReason: 'test_mode',
      amazon_shipment_service_level: amazonShippingLevel,
      __skipLulu: true,
      guard: {
        reason: 'test_mode',
      },
      luluJobId: `TEST-${parsed.rootGroupId}`,
      luluStatus: 'TEST_MODE',
      workflowJobId: parsed.workflowJobId,
      workflowJobIdempotencyKey: parsed.workflowJobIdempotencyKey,
      workflowAttemptId: parsed.workflowAttemptId,
      workflowJobStatus: parsed.workflowJobStatus,
      CONFIG,
    };
  }

  return {
    rootGroupId: parsed.rootGroupId,
    rootOrderId: parsed.rootOrderId,
    siblingCount: siblings.length,
    orderIds: siblings.map((sibling) => sibling.orderId),
    siblings,
    submitMode: 'sandbox',
    luluApiBase: SANDBOX_LULU_API_BASE,
    luluPayload,
    shippingAddress,
    shippingLevelRequested: requestedShippingLevel,
    shippingLevelSent: normalizedShipping.shippingLevel,
    shippingTierResolved: normalizedShipping.shippingLevel,
    shippingTierResolvedReason: normalizedShipping.reason,
    amazon_shipment_service_level: amazonShippingLevel,
    __skipLulu: false,
    guard: {
      reason: 'sandbox',
    },
    luluJobId: null,
    luluStatus: null,
    workflowJobId: parsed.workflowJobId,
    workflowJobIdempotencyKey: parsed.workflowJobIdempotencyKey,
    workflowAttemptId: parsed.workflowAttemptId,
    workflowJobStatus: parsed.workflowJobStatus,
    CONFIG,
  };
}
