import { getBucketFromKey } from '@/lib/r2-utils';
import type { LoadOrderForW4 } from '@/lib/books/w4-print-input';

type JsonRecord = Record<string, unknown>;

const SANDBOX_LULU_API_BASE = 'https://api.sandbox.lulu.com';
const DEFAULT_PRODUCTION_LULU_API_BASE = 'https://api.lulu.com';
const PRODUCTION_SUBMIT_ENV = 'ENABLE_LULU_PRODUCTION_SUBMIT';
const PROOF_ORDER_PATTERN = /(proof|sandbox|disposable|wfj-proof|^test(?:[-_]|$)|[-_]test(?:[-_]|$))/i;

export type SignObjectUrlForW4 = (
  key: string,
  bucket: string,
  expiresIn: number,
) => Promise<string>;

export interface BuildW4SubmitInputOptions {
  loadOrder?: LoadOrderForW4;
  signObjectUrl: SignObjectUrlForW4;
  signedUrlExpiresIn?: number;
}

export interface BuildW4SubmitInputResult extends JsonRecord {
  orderId: string;
  amazonOrderId: string | null;
  rootOrderId: string | null;
  backendUrl: string | null;
  submitMode: 'sandbox' | 'skip' | 'production';
  luluApiBase: string;
  luluPayload: JsonRecord;
  interiorSignedUrl: string;
  coverSignedUrl: string;
  shippingAddress: JsonRecord;
  shippingLevelRequested: string | null;
  shippingLevelSent: string;
  shippingTierResolved: string;
  shippingTierResolvedReason: string;
  amazon_shipment_service_level: string | null;
  __skipLulu: boolean;
  guard: {
    reason:
      | 'test_mode'
      | 'existing_job'
      | 'sandbox'
      | 'production'
      | 'production_dry_run'
      | 'production_blocked';
    details?: string;
  };
  productionGuard: {
    requested: boolean;
    allowed: boolean;
    reason:
      | 'production_not_requested'
      | 'production_ready'
      | 'env_disabled'
      | 'proof_order'
      | 'missing_order_row'
      | 'customer_approval_pending'
      | 'order_not_ready'
      | 'shipping_address_invalid'
      | 'existing_job'
      | 'test_mode';
    checkedAt: string;
    envEnabled: boolean;
    dryRun: boolean;
    missingShippingFields?: string[];
  };
  luluJobId: string | null;
  luluStatus: string | null;
  CONFIG: JsonRecord;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

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

  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return ['true', '1', 'yes', 'y', 'on'].includes(normalized);
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

    if (typeof value === 'string') {
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

function normalizeShippingAddress(addressLike: unknown): JsonRecord {
  const address = toRecord(addressLike);

  let street1 =
    toTrimmedString(
      pickFirstNonEmpty(
        address.street1,
        address.address,
        address.address1,
        address.address_line_1,
        address.address_line1,
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
    ...address,
    name: toTrimmedString(pickFirstNonEmpty(address.name, address.shippingName)) ?? '',
    street1: street1.trim(),
    street2:
      toTrimmedString(
        pickFirstNonEmpty(
          address.street2,
          address.address2,
          address.address_line_2,
          address.address_line2,
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
          address.postalCode,
          address.postal_code,
          address.zip,
          address.zipcode,
        ),
      ) ?? '',
    country_code:
      toTrimmedString(
        pickFirstNonEmpty(address.country_code, address.country, address.countryCode),
      ) ?? 'US',
    phone_number:
      toTrimmedString(
        pickFirstNonEmpty(address.phone_number, address.phone, address.phoneNumber),
      ) ?? '',
    email: toTrimmedString(address.email) ?? '',
  };

  if (normalized.state_code && String(normalized.state_code).length > 2) {
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
    const stateLower = String(normalized.state_code).toLowerCase();
    normalized.state_code =
      stateMap[stateLower] ??
      String(normalized.state_code).substring(0, 2).toUpperCase();
  } else if (normalized.state_code) {
    normalized.state_code = String(normalized.state_code).toUpperCase();
  }

  if (normalized.country_code) {
    normalized.country_code = String(normalized.country_code).toUpperCase().substring(0, 2);
  }

  return normalized;
}

function ensureSandboxShippingPhone(
  shippingAddress: JsonRecord,
  input: JsonRecord,
  defaults: JsonRecord,
  loadedOrder: JsonRecord,
): JsonRecord {
  const existingPhone =
    toTrimmedString(
      pickFirstNonEmpty(
        shippingAddress.phone_number,
        shippingAddress.phone,
        shippingAddress.phoneNumber,
      ),
    ) ?? null;

  if (existingPhone) {
    return shippingAddress;
  }

  const fallbackPhone =
    toTrimmedString(
      pickFirstNonEmpty(
        defaults.testPhoneNumber,
        defaults.phoneNumber,
        toRecord(input.customer).phone_number,
        toRecord(input.customer).phone,
        toRecord(input.customer).phoneNumber,
        toRecord(input.shippingAddress).phone_number,
        toRecord(input.shippingAddress).phone,
        toRecord(input.shippingAddress).phoneNumber,
        toRecord(input.shipping_address).phone_number,
        toRecord(input.shipping_address).phone,
        toRecord(input.shipping_address).phoneNumber,
        toRecord(input.orderDetails).phone_number,
        toRecord(input.orderDetails).phone,
        toRecord(input.orderDetails).phoneNumber,
        toRecord(toRecord(input.orderDetails).shippingAddress).phone_number,
        toRecord(toRecord(input.orderDetails).shippingAddress).phone,
        toRecord(toRecord(input.orderDetails).shippingAddress).phoneNumber,
        toRecord(toRecord(input.orderDetails).shipping_address).phone_number,
        toRecord(toRecord(input.orderDetails).shipping_address).phone,
        toRecord(toRecord(input.orderDetails).shipping_address).phoneNumber,
        toRecord(input.order).phone_number,
        toRecord(input.order).phone,
        toRecord(input.order).phoneNumber,
        toRecord(toRecord(input.order).shipping_address).phone_number,
        toRecord(toRecord(input.order).shipping_address).phone,
        toRecord(toRecord(input.order).shipping_address).phoneNumber,
        toRecord(loadedOrder).phone_number,
        toRecord(loadedOrder).phone,
        toRecord(loadedOrder).phoneNumber,
        toRecord(loadedOrder.shipping_address).phone_number,
        toRecord(loadedOrder.shipping_address).phone,
        toRecord(loadedOrder.shipping_address).phoneNumber,
        '555-555-5555',
      ),
    ) ?? '555-555-5555';

  return {
    ...shippingAddress,
    phone_number: fallbackPhone,
    phone: fallbackPhone,
    phoneNumber: fallbackPhone,
  };
}

function mapAmazonShippingToLulu(amazonShipping: string | null): string | null {
  if (!amazonShipping) {
    return null;
  }

  const shipping = amazonShipping.toUpperCase();
  if (shipping.includes('OVERNIGHT') || shipping.includes('PRIORITY') || shipping.includes('EXPRESS')) {
    return 'EXPRESS';
  }
  if (shipping.includes('EXPEDITED') || shipping.includes('2-DAY') || shipping.includes('2DAY')) {
    return 'EXPEDITED';
  }
  if (shipping.includes('STANDARD') || shipping.includes('STD') || shipping.includes('GROUND')) {
    return 'GROUND';
  }

  return 'MAIL';
}

function mapD2CTierToLulu(d2cTier: string | null): string | null {
  const normalized = String(d2cTier || '').trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const mapping: Record<string, string> = {
    mail: 'MAIL',
    standard: 'MAIL',
    ground_home: 'GROUND',
    ground: 'GROUND',
    priority_mail: 'PRIORITY_MAIL',
    expedited: 'EXPEDITED',
    express: 'EXPRESS',
    priority: 'PRIORITY_MAIL',
  };

  return mapping[normalized] ?? null;
}

function normalizeShippingLevel(params: {
  requestedLevel: string | null;
  amazonShipping: string | null;
  d2cTier: string | null;
}): {
  shippingLevel: string;
  reason: string;
} {
  const amazonMapped = mapAmazonShippingToLulu(params.amazonShipping);
  if (amazonMapped) {
    return { shippingLevel: amazonMapped, reason: 'amazon' };
  }

  const d2cMapped = mapD2CTierToLulu(params.d2cTier);
  if (d2cMapped) {
    return { shippingLevel: d2cMapped, reason: 'd2c_tier' };
  }
  if (params.d2cTier) {
    return { shippingLevel: 'MAIL', reason: 'fallback_unknown' };
  }

  const raw = String(params.requestedLevel || '').trim().toUpperCase();
  if (!raw || raw === 'STANDARD') {
    return { shippingLevel: 'MAIL', reason: 'fallback_default' };
  }
  if (raw === 'GROUND') {
    return { shippingLevel: 'GROUND', reason: 'fallback_default' };
  }
  if (['MAIL', 'PRIORITY_MAIL', 'GROUND', 'EXPEDITED', 'EXPRESS'].includes(raw)) {
    return { shippingLevel: raw, reason: 'fallback_default' };
  }
  return { shippingLevel: 'MAIL', reason: 'fallback_default' };
}

function deriveRequestedShippingLevel(input: JsonRecord): string | null {
  return (
    toTrimmedString(
      pickFirstNonEmpty(
        toRecord(input.luluPayload).shipping_level,
        toRecord(input.printOptions).shippingLevel,
        toRecord(toRecord(input.CONFIG).defaults).shippingLevel,
        input.shipping_tier,
        input.shippingTier,
      ),
    ) ?? null
  );
}

function deriveAmazonShippingLevel(input: JsonRecord): string | null {
  return (
    toTrimmedString(
      pickFirstNonEmpty(
        toRecord(input.order).ShipmentServiceLevelCategory,
        toRecord(input.order).ShipServiceLevel,
        input.ShipmentServiceLevelCategory,
        input.ShipServiceLevel,
        input.amazon_shipment_service_level,
      ),
    ) ?? null
  );
}

function withLuluApiBase(input: JsonRecord, apiBase: string): JsonRecord {
  const currentConfig = toRecord(input.CONFIG);
  const currentLulu = toRecord(currentConfig.lulu);
  return {
    ...currentConfig,
    lulu: {
      ...currentLulu,
      apiBase,
    },
  };
}

function isProofOrderIdentifier(value: unknown): boolean {
  const normalized = toTrimmedString(value);
  return normalized ? PROOF_ORDER_PATTERN.test(normalized) : false;
}

function isProductionSubmitEnabled(): boolean {
  return toBoolean(process.env[PRODUCTION_SUBMIT_ENV]);
}

function getProductionLuluApiBase(input: JsonRecord): string {
  const configured =
    toTrimmedString(toRecord(toRecord(input.CONFIG).lulu).apiBase) ??
    toTrimmedString(process.env.LULU_API_BASE) ??
    DEFAULT_PRODUCTION_LULU_API_BASE;

  return configured.replace(/\/+$/, '');
}

function hasExplicitProductionIntent(input: JsonRecord): boolean {
  return toBoolean(
    pickFirstNonEmpty(
      input.allowProductionLulu,
      toRecord(input.production).allowProductionLulu,
      toRecord(input.guard).allowProductionLulu,
    ),
  );
}

function isProductionDryRun(input: JsonRecord): boolean {
  return toBoolean(
    pickFirstNonEmpty(
      input.productionDryRun,
      input.validateOnly,
      toRecord(input.production).dryRun,
      toRecord(input.production).validateOnly,
    ),
  );
}

function validateProductionShippingAddress(shippingAddress: JsonRecord): string[] {
  const requiredFields: Array<[string, unknown]> = [
    ['name', shippingAddress.name],
    ['street1', pickFirstNonEmpty(shippingAddress.street1, shippingAddress.address_line_1)],
    ['city', shippingAddress.city],
    ['state_code', shippingAddress.state_code],
    ['postcode', shippingAddress.postcode],
    ['country_code', shippingAddress.country_code],
    ['phone_number', pickFirstNonEmpty(shippingAddress.phone_number, shippingAddress.phone)],
  ];

  return requiredFields
    .filter(([, value]) => !toTrimmedString(value))
    .map(([field]) => field);
}

type ProductionGuardEvaluation = {
  requested: boolean;
  allowed: boolean;
  reason: BuildW4SubmitInputResult['productionGuard']['reason'];
  checkedAt: string;
  envEnabled: boolean;
  dryRun: boolean;
  missingShippingFields?: string[];
};

function evaluateProductionGuard(params: {
  input: JsonRecord;
  loadedOrder: JsonRecord;
  shippingAddress: JsonRecord;
  existingSubmission: { luluJobId: string; luluStatus: string | null; details: string } | null;
  defaults: JsonRecord;
}): ProductionGuardEvaluation {
  const requested = hasExplicitProductionIntent(params.input);
  const dryRun = isProductionDryRun(params.input);
  const checkedAt = new Date().toISOString();
  const envEnabled = isProductionSubmitEnabled();

  if (!requested) {
    return {
      requested,
      allowed: false,
      reason: 'production_not_requested',
      checkedAt,
      envEnabled,
      dryRun,
    };
  }

  if (params.existingSubmission) {
    return {
      requested,
      allowed: false,
      reason: 'existing_job',
      checkedAt,
      envEnabled,
      dryRun,
    };
  }

  if (toBoolean(params.defaults.testMode)) {
    return {
      requested,
      allowed: false,
      reason: 'test_mode',
      checkedAt,
      envEnabled,
      dryRun,
    };
  }

  if (Object.keys(params.loadedOrder).length === 0) {
    return {
      requested,
      allowed: false,
      reason: 'missing_order_row',
      checkedAt,
      envEnabled,
      dryRun,
    };
  }

  const orderMarkers = [
    params.input.orderId,
    params.input.rootOrderId,
    params.input.amazonOrderId,
    params.input.amazon_order_id,
    params.loadedOrder.orderId,
    params.loadedOrder.root_order_id,
    params.loadedOrder.amazon_order_id,
  ];

  if (orderMarkers.some((value) => isProofOrderIdentifier(value))) {
    return {
      requested,
      allowed: false,
      reason: 'proof_order',
      checkedAt,
      envEnabled,
      dryRun,
    };
  }

  const approvalRequired = toBoolean(
    pickFirstNonEmpty(
      params.loadedOrder.customer_approval_required,
      params.input.customer_approval_required,
      params.input.customerApprovalRequired,
    ),
  );
  const approvalStatus = toTrimmedString(
    pickFirstNonEmpty(
      params.loadedOrder.customer_approval_status,
      params.input.customer_approval_status,
      params.input.customerApprovalStatus,
    ),
  );

  if (approvalRequired && approvalStatus !== 'approved') {
    return {
      requested,
      allowed: false,
      reason: 'customer_approval_pending',
      checkedAt,
      envEnabled,
      dryRun,
    };
  }

  const nextWorkflow = toTrimmedString(params.loadedOrder.next_workflow);
  const workflowStep = toTrimmedString(params.loadedOrder.workflow_step);
  const currentStatus = toTrimmedString(params.loadedOrder.status);
  const orderReadyForW4 =
    nextWorkflow === '4' ||
    workflowStep === 'print_fulfillment' ||
    currentStatus === 'pending_print';

  if (!orderReadyForW4) {
    return {
      requested,
      allowed: false,
      reason: 'order_not_ready',
      checkedAt,
      envEnabled,
      dryRun,
    };
  }

  const missingShippingFields = validateProductionShippingAddress(params.shippingAddress);
  if (missingShippingFields.length > 0) {
    return {
      requested,
      allowed: false,
      reason: 'shipping_address_invalid',
      checkedAt,
      envEnabled,
      dryRun,
      missingShippingFields,
    };
  }

  if (!envEnabled && !dryRun) {
    return {
      requested,
      allowed: false,
      reason: 'env_disabled',
      checkedAt,
      envEnabled,
      dryRun,
    };
  }

  return {
    requested,
    allowed: true,
    reason: 'production_ready',
    checkedAt,
    envEnabled,
    dryRun,
  };
}

function getExistingLuluSubmissionFromRecord(
  orderId: string,
  loaded: unknown,
): { luluJobId: string; luluStatus: string | null; details: string } | null {
  if (!loaded) {
    return null;
  }

  const record = toRecord(loaded);
  const luluJobId = toTrimmedString(record.lulu_job_id);
  const luluStatus = toTrimmedString(record.lulu_status);
  const printSubmittedAt = toTrimmedString(record.print_submitted_at);

  if (!luluJobId && !luluStatus && !printSubmittedAt) {
    return null;
  }

  return {
    luluJobId: luluJobId ?? `STATUS-${luluStatus ?? 'submitted'}`,
    luluStatus,
    details: `order=${orderId} job=${luluJobId ?? 'n/a'} status=${luluStatus ?? 'n/a'} print_submitted_at=${printSubmittedAt ?? 'n/a'}`,
  };
}

export async function buildW4SubmitInput(
  input: JsonRecord,
  options: BuildW4SubmitInputOptions,
): Promise<BuildW4SubmitInputResult> {
  const orderId =
    toTrimmedString(
      pickFirstNonEmpty(input.orderId, input.amazonOrderId, input.amazon_order_id),
    ) ?? '';
  if (!orderId) {
    throw new Error('W4 submit input requires orderId');
  }

  const pdfR2Key = toTrimmedString(input.pdfR2Key);
  const coverPdfR2Key = toTrimmedString(input.coverPdfR2Key);
  if (!pdfR2Key || !coverPdfR2Key) {
    throw new Error(`W4 submit input is missing PDF keys for ${orderId}`);
  }

  const loadedOrder = options.loadOrder
    ? await options.loadOrder(orderId).catch(() => null)
    : null;
  const loadedOrderRecord = toRecord(loadedOrder);

  const signedUrlExpiresIn = options.signedUrlExpiresIn ?? 21600;
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

  const sandboxConfig = withLuluApiBase(input, SANDBOX_LULU_API_BASE);
  const defaults = toRecord(sandboxConfig.defaults);
  const printDefaults = toRecord(defaults.print);
  const trimDefaults = toRecord(defaults.trimIn);
  const requestedShippingLevel = deriveRequestedShippingLevel(input);
  const amazonShippingLevel = deriveAmazonShippingLevel(input);
  const normalizedShipping = normalizeShippingLevel({
    requestedLevel: requestedShippingLevel,
    amazonShipping: amazonShippingLevel,
    d2cTier:
      toTrimmedString(
        pickFirstNonEmpty(input.shipping_tier, input.shippingTier),
      ) ?? null,
  });

  const normalizedShippingAddress = normalizeShippingAddress(
    pickFirstNonEmpty(
      input.shippingAddress,
      input.shipping_address,
      toRecord(input.orderDetails).shippingAddress,
      toRecord(input.orderDetails).shipping_address,
      toRecord(input.order).shippingAddress,
      toRecord(input.order).shipping_address,
      loadedOrderRecord.shipping_address,
    ),
  );

  const quantity =
    toInteger(
      pickFirstNonEmpty(defaults.quantity, 1),
    ) ?? 1;
  const podPackageId =
    toTrimmedString(
      pickFirstNonEmpty(defaults.podPackageId, trimDefaults.podPackageId),
    ) ?? '0850X0850FCPRESS080CW444MXX';

  const productConfig = {
    trim_size: `${String(trimDefaults.w ?? '8.5')}x${String(trimDefaults.h ?? '8.5')}`,
    interior_color: toTrimmedString(printDefaults.color) ?? 'premium-color',
    interior_paper: toTrimmedString(printDefaults.stock) ?? '80#-text',
    binding: toTrimmedString(printDefaults.binding) ?? 'saddle-stitch',
    cover_finish: toTrimmedString(printDefaults.coverFinish) ?? 'matte',
  };

  const luluPayload: JsonRecord = {
    external_id: `single-${orderId}`,
    contact_email:
      toTrimmedString(toRecord(input.customer).email) ?? 'orders@littleherolabs.com',
    shipping_level: normalizedShipping.shippingLevel,
    shipping_address: ensureSandboxShippingPhone(
      normalizedShippingAddress,
      input,
      defaults,
      loadedOrderRecord,
    ),
    line_items: [
      {
        external_id: orderId,
        title:
          toTrimmedString(input.title) ??
          `Little Hero Book - ${toTrimmedString(toRecord(input.customer).name) ?? 'Order'}`,
        quantity,
        printable_normalization: {
          interior: {
            source_url: interiorSignedUrl,
          },
          cover: {
            source_url: coverSignedUrl,
          },
          pod_package_id: podPackageId,
        },
        print_options: productConfig,
      },
    ],
  };

  const forceSubmit = toBoolean(input.force);
  const existingSubmission = forceSubmit
    ? null
    : getExistingLuluSubmissionFromRecord(orderId, loadedOrder);
  const productionGuard = evaluateProductionGuard({
    input,
    loadedOrder: loadedOrderRecord,
    shippingAddress: normalizedShippingAddress,
    existingSubmission,
    defaults,
  });

  if (existingSubmission) {
    return {
      ...input,
      orderId,
      amazonOrderId: toTrimmedString(input.amazonOrderId),
      rootOrderId:
        toTrimmedString(input.rootOrderId) ??
        toTrimmedString(input.amazonOrderId) ??
        orderId,
      backendUrl: toTrimmedString(input.backendUrl),
      submitMode: 'skip',
      luluApiBase: SANDBOX_LULU_API_BASE,
      interiorSignedUrl,
      coverSignedUrl,
      luluPayload,
      shippingAddress: ensureSandboxShippingPhone(
        normalizedShippingAddress,
        input,
        defaults,
        loadedOrderRecord,
      ),
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
      productionGuard,
      luluJobId: existingSubmission.luluJobId,
      luluStatus: existingSubmission.luluStatus ?? 'SUBMITTED',
      CONFIG: sandboxConfig,
    };
  }

  if (toBoolean(defaults.testMode)) {
    return {
      ...input,
      orderId,
      amazonOrderId: toTrimmedString(input.amazonOrderId),
      rootOrderId:
        toTrimmedString(input.rootOrderId) ??
        toTrimmedString(input.amazonOrderId) ??
        orderId,
      backendUrl: toTrimmedString(input.backendUrl),
      submitMode: 'skip',
      luluApiBase: SANDBOX_LULU_API_BASE,
      interiorSignedUrl,
      coverSignedUrl,
      luluPayload,
      shippingAddress: ensureSandboxShippingPhone(
        normalizedShippingAddress,
        input,
        defaults,
        loadedOrderRecord,
      ),
      shippingLevelRequested: requestedShippingLevel,
      shippingLevelSent: normalizedShipping.shippingLevel,
      shippingTierResolved: normalizedShipping.shippingLevel,
      shippingTierResolvedReason: 'test_mode',
      amazon_shipment_service_level: amazonShippingLevel,
      __skipLulu: true,
      guard: {
        reason: 'test_mode',
      },
      productionGuard,
      luluJobId: `TEST-${orderId}`,
      luluStatus: 'TEST_MODE',
      CONFIG: sandboxConfig,
    };
  }

  if (productionGuard.requested) {
    const productionApiBase = getProductionLuluApiBase(input);
    const productionConfig = withLuluApiBase(input, productionApiBase);

    if (!productionGuard.allowed) {
      return {
        ...input,
        orderId,
        amazonOrderId: toTrimmedString(input.amazonOrderId),
        rootOrderId:
          toTrimmedString(input.rootOrderId) ??
          toTrimmedString(input.amazonOrderId) ??
          orderId,
        backendUrl: toTrimmedString(input.backendUrl),
        submitMode: 'skip',
        luluApiBase: productionApiBase,
        interiorSignedUrl,
        coverSignedUrl,
        luluPayload: {
          ...luluPayload,
          shipping_address: normalizedShippingAddress,
        },
        shippingAddress: normalizedShippingAddress,
        shippingLevelRequested: requestedShippingLevel,
        shippingLevelSent: normalizedShipping.shippingLevel,
        shippingTierResolved: normalizedShipping.shippingLevel,
        shippingTierResolvedReason: productionGuard.reason,
        amazon_shipment_service_level: amazonShippingLevel,
        __skipLulu: true,
        guard: {
          reason: 'production_blocked',
          details: productionGuard.reason,
        },
        productionGuard,
        luluJobId: null,
        luluStatus: null,
        CONFIG: productionConfig,
      };
    }

    if (productionGuard.dryRun) {
      return {
        ...input,
        orderId,
        amazonOrderId: toTrimmedString(input.amazonOrderId),
        rootOrderId:
          toTrimmedString(input.rootOrderId) ??
          toTrimmedString(input.amazonOrderId) ??
          orderId,
        backendUrl: toTrimmedString(input.backendUrl),
        submitMode: 'skip',
        luluApiBase: productionApiBase,
        interiorSignedUrl,
        coverSignedUrl,
        luluPayload: {
          ...luluPayload,
          shipping_address: normalizedShippingAddress,
        },
        shippingAddress: normalizedShippingAddress,
        shippingLevelRequested: requestedShippingLevel,
        shippingLevelSent: normalizedShipping.shippingLevel,
        shippingTierResolved: normalizedShipping.shippingLevel,
        shippingTierResolvedReason: 'production_dry_run',
        amazon_shipment_service_level: amazonShippingLevel,
        __skipLulu: true,
        guard: {
          reason: 'production_dry_run',
          details: 'validated_without_submit',
        },
        productionGuard,
        luluJobId: null,
        luluStatus: 'DRY_RUN',
        CONFIG: productionConfig,
      };
    }
  }

  if (productionGuard.requested && productionGuard.allowed) {
    const productionApiBase = getProductionLuluApiBase(input);
    const productionConfig = withLuluApiBase(input, productionApiBase);

    return {
      ...input,
      orderId,
      amazonOrderId: toTrimmedString(input.amazonOrderId),
      rootOrderId:
        toTrimmedString(input.rootOrderId) ??
        toTrimmedString(input.amazonOrderId) ??
        orderId,
      backendUrl: toTrimmedString(input.backendUrl),
      submitMode: 'production',
      luluApiBase: productionApiBase,
      interiorSignedUrl,
      coverSignedUrl,
      luluPayload: {
        ...luluPayload,
        shipping_address: normalizedShippingAddress,
      },
      shippingAddress: normalizedShippingAddress,
      shippingLevelRequested: requestedShippingLevel,
      shippingLevelSent: normalizedShipping.shippingLevel,
      shippingTierResolved: normalizedShipping.shippingLevel,
      shippingTierResolvedReason: normalizedShipping.reason,
      amazon_shipment_service_level: amazonShippingLevel,
      __skipLulu: false,
      guard: {
        reason: 'production',
      },
      productionGuard,
      luluJobId: null,
      luluStatus: null,
      CONFIG: productionConfig,
    };
  }

  return {
    ...input,
    orderId,
    amazonOrderId: toTrimmedString(input.amazonOrderId),
    rootOrderId:
      toTrimmedString(input.rootOrderId) ??
      toTrimmedString(input.amazonOrderId) ??
      orderId,
    backendUrl: toTrimmedString(input.backendUrl),
    submitMode: 'sandbox',
    luluApiBase: SANDBOX_LULU_API_BASE,
    interiorSignedUrl,
    coverSignedUrl,
    luluPayload,
    shippingAddress: ensureSandboxShippingPhone(
      normalizedShippingAddress,
      input,
      defaults,
      loadedOrderRecord,
    ),
    shippingLevelRequested: requestedShippingLevel,
    shippingLevelSent: normalizedShipping.shippingLevel,
    shippingTierResolved: normalizedShipping.shippingLevel,
    shippingTierResolvedReason: normalizedShipping.reason,
    amazon_shipment_service_level: amazonShippingLevel,
    __skipLulu: false,
    guard: {
      reason: 'sandbox',
    },
    productionGuard,
    luluJobId: null,
    luluStatus: null,
    CONFIG: sandboxConfig,
  };
}
