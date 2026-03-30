import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_VERSION = 'w4-production-approval-v1';
const TOKEN_SCOPE = 'single-order-w4-production-submit';
const DEFAULT_TTL_MINUTES = 30;
const MAX_TTL_MINUTES = 120;
const SECRET_ENV = 'W4_PRODUCTION_APPROVAL_SECRET';
const BACKEND_TOKEN_ENV = 'BACKEND_API_TOKEN';

export type W4ProductionApprovalSecretSource =
  | 'w4_production_approval_secret'
  | 'backend_api_token';

export type W4ProductionApprovalPayload = {
  version: typeof TOKEN_VERSION;
  scope: typeof TOKEN_SCOPE;
  orderId: string;
  approvedAt: string;
  expiresAt: string;
  approvedBy: string;
};

export type IssuedW4ProductionApproval = W4ProductionApprovalPayload & {
  token: string;
  secretSource: W4ProductionApprovalSecretSource;
  ttlMinutes: number;
};

export type VerifiedW4ProductionApproval =
  | {
      ok: true;
      payload: W4ProductionApprovalPayload;
      secretSource: W4ProductionApprovalSecretSource;
    }
  | {
      ok: false;
      reason:
        | 'missing'
        | 'secret_unavailable'
        | 'malformed'
        | 'invalid_signature'
        | 'invalid_payload'
        | 'expired'
        | 'order_mismatch';
      details?: string;
    };

function toTrimmedString(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, 'base64');
}

function resolveApprovalSecret():
  | { secret: string; source: W4ProductionApprovalSecretSource }
  | null {
  const explicit = toTrimmedString(process.env[SECRET_ENV]);
  if (explicit) {
    return { secret: explicit, source: 'w4_production_approval_secret' };
  }

  const backendToken = toTrimmedString(process.env[BACKEND_TOKEN_ENV]);
  if (backendToken) {
    return { secret: backendToken, source: 'backend_api_token' };
  }

  return null;
}

function signPayload(encodedPayload: string, secret: string): string {
  return base64UrlEncode(createHmac('sha256', secret).update(encodedPayload).digest());
}

function parsePayload(encodedPayload: string): W4ProductionApprovalPayload | null {
  try {
    const raw = base64UrlDecode(encodedPayload).toString('utf8');
    const parsed = JSON.parse(raw) as Partial<W4ProductionApprovalPayload>;
    if (
      parsed.version !== TOKEN_VERSION ||
      parsed.scope !== TOKEN_SCOPE ||
      !toTrimmedString(parsed.orderId) ||
      !toTrimmedString(parsed.approvedAt) ||
      !toTrimmedString(parsed.expiresAt) ||
      !toTrimmedString(parsed.approvedBy)
    ) {
      return null;
    }

    return {
      version: TOKEN_VERSION,
      scope: TOKEN_SCOPE,
      orderId: String(parsed.orderId).trim(),
      approvedAt: String(parsed.approvedAt).trim(),
      expiresAt: String(parsed.expiresAt).trim(),
      approvedBy: String(parsed.approvedBy).trim(),
    };
  } catch {
    return null;
  }
}

export function issueW4ProductionApprovalToken(params: {
  orderId: string;
  approvedBy: string;
  ttlMinutes?: number;
  now?: Date;
}): IssuedW4ProductionApproval {
  const secretInfo = resolveApprovalSecret();
  if (!secretInfo) {
    throw new Error(
      `W4 production approval token cannot be issued because neither ${SECRET_ENV} nor ${BACKEND_TOKEN_ENV} is configured`,
    );
  }

  const orderId = toTrimmedString(params.orderId);
  const approvedBy = toTrimmedString(params.approvedBy);
  if (!orderId || !approvedBy) {
    throw new Error('W4 production approval token requires orderId and approvedBy');
  }

  const ttlMinutes = Math.max(1, Math.min(MAX_TTL_MINUTES, Math.floor(params.ttlMinutes ?? DEFAULT_TTL_MINUTES)));
  const now = params.now ?? new Date();
  const approvedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000).toISOString();

  const payload: W4ProductionApprovalPayload = {
    version: TOKEN_VERSION,
    scope: TOKEN_SCOPE,
    orderId,
    approvedAt,
    expiresAt,
    approvedBy,
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, secretInfo.secret);

  return {
    ...payload,
    token: `${encodedPayload}.${signature}`,
    secretSource: secretInfo.source,
    ttlMinutes,
  };
}

export function verifyW4ProductionApprovalToken(params: {
  token: unknown;
  orderId: string;
  now?: Date;
}): VerifiedW4ProductionApproval {
  const token = toTrimmedString(params.token);
  if (!token) {
    return { ok: false, reason: 'missing' };
  }

  const secretInfo = resolveApprovalSecret();
  if (!secretInfo) {
    return { ok: false, reason: 'secret_unavailable' };
  }

  const [encodedPayload, signature] = token.split('.', 2);
  if (!encodedPayload || !signature) {
    return { ok: false, reason: 'malformed' };
  }

  const expectedSignature = signPayload(encodedPayload, secretInfo.secret);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return { ok: false, reason: 'invalid_signature' };
  }

  const payload = parsePayload(encodedPayload);
  if (!payload) {
    return { ok: false, reason: 'invalid_payload' };
  }

  if (payload.orderId !== params.orderId) {
    return {
      ok: false,
      reason: 'order_mismatch',
      details: `token_order=${payload.orderId} request_order=${params.orderId}`,
    };
  }

  const now = params.now ?? new Date();
  const expiresAt = new Date(payload.expiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'expired' };
  }

  return {
    ok: true,
    payload,
    secretSource: secretInfo.source,
  };
}
