import { createHash } from 'node:crypto';
import Stripe from 'stripe';

export const CHECKOUT_STRIPE_API_VERSION = '2023-10-16' as const;
export const CHECKOUT_STRIPE_SDK_VERSION = '14.25.0';
const TIMEOUT_MS = 15000;
type WireArgs = Parameters<Stripe.HttpClient['makeRequest']>;

export interface CheckoutProviderBinding {
  credentialKeyId: string;
  environment: 'test' | 'live';
  stripeAccount: string | null;
}

function bindingSnapshot(binding: CheckoutProviderBinding): CheckoutProviderBinding {
  return { credentialKeyId: binding.credentialKeyId, environment: binding.environment, stripeAccount: binding.stripeAccount };
}

export interface CheckoutProviderCredential extends CheckoutProviderBinding { apiKey: string }
export type CheckoutCredentialResolver = (binding: CheckoutProviderBinding) => Readonly<CheckoutProviderCredential>;

// Entries come from trusted server configuration. This does not prove hosted account ownership.
export function configuredCheckoutCredentials(entries: readonly CheckoutProviderCredential[]): CheckoutCredentialResolver {
  const saved = new Map<string, Readonly<CheckoutProviderCredential>>();
  for (const entry of entries) {
    const copy = Object.freeze({ ...entry });
    validateBinding(copy);
    validateCredential(copy);
    if (saved.has(copy.credentialKeyId)) reject('Duplicate configured provider key ID');
    saved.set(copy.credentialKeyId, copy);
  }
  return binding => {
    const entry = saved.get(binding.credentialKeyId);
    if (!entry || !sameBinding(entry, binding)) reject('Provider credential context unavailable');
    return entry;
  };
}

function validateCredential(credential: CheckoutProviderCredential) {
  const mode = /^(?:sk|rk)_(test|live)_[A-Za-z0-9_]+$/.exec(credential.apiKey)?.[1];
  if (mode !== credential.environment) reject('Provider credential environment mismatch');
}
function resolveCredential(resolver: CheckoutCredentialResolver, binding: CheckoutProviderBinding) {
  const credential = Object.freeze({ ...resolver(bindingSnapshot(binding)) });
  if (!sameBinding(credential, binding)) reject('Provider credential context changed');
  validateCredential(credential);
  return credential;
}
function credentialHash(credential: CheckoutProviderCredential) { return sha256('checkout-credential-v2:' + credential.apiKey); }

export interface CheckoutWireManifest {
  contract: 'checkout-wire-v2';
  sdkVersion: string;
  credentialSha256: string;
  binding: CheckoutProviderBinding;
  operationId: string;
  payloadJson: string;
  body: string;
  bodySha256: string;
  idempotencyKey: string;
  apiVersion: typeof CHECKOUT_STRIPE_API_VERSION;
}

function sha256(value: string) { return createHash('sha256').update(value).digest('hex'); }
function reject(message: string): never {
  const error = Object.assign(new Error(message), { code: 'LHB_CHECKOUT_TRANSPORT_HOLD' });
  throw error;
}
function header(headers: object, name: string): string | undefined {
  const entries = Object.entries(headers).filter(([key]) => key.toLowerCase() === name.toLowerCase());
  if (entries.length > 1) reject('Duplicate provider invariant header');
  const value: unknown = entries[0]?.[1];
  if (value !== undefined && typeof value !== 'string') reject('Unsupported provider invariant header');
  return value as string | undefined;
}
function sameBinding(left: CheckoutProviderBinding, right: CheckoutProviderBinding) {
  return left.credentialKeyId === right.credentialKeyId && left.environment === right.environment && left.stripeAccount === right.stripeAccount;
}
function validateBinding(binding: CheckoutProviderBinding) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(binding.credentialKeyId) || !['test', 'live'].includes(binding.environment)
    || (binding.stripeAccount !== null && !/^acct_[A-Za-z0-9]+$/.test(binding.stripeAccount))) reject('Invalid provider binding');
}
function verifyWire(args: WireArgs, expectedKey: string, credential: CheckoutProviderCredential): string {
  const [host, port, path, method, headers, body, protocol, timeout] = args;
  if (host !== 'api.stripe.com' || String(port) !== '443' || path !== '/v1/checkout/sessions'
    || method !== 'POST' || protocol !== 'https' || timeout !== TIMEOUT_MS || typeof body !== 'string') reject('Provider destination or request options changed');
  if (header(headers, 'idempotency-key') !== expectedKey || header(headers, 'stripe-version') !== CHECKOUT_STRIPE_API_VERSION
    || (header(headers, 'stripe-account') ?? null) !== credential.stripeAccount
    || header(headers, 'authorization') !== `Bearer ${credential.apiKey}`) reject('Provider identity or version changed');
  return body;
}
function assertSdkVersion() {
  if ((Stripe as unknown as { PACKAGE_VERSION?: unknown }).PACKAGE_VERSION !== CHECKOUT_STRIPE_SDK_VERSION) reject('Installed provider SDK version changed');
}
function client(apiKey: string, httpClient: Stripe.HttpClient) {
  assertSdkVersion();
  return new Stripe(apiKey, { apiVersion: CHECKOUT_STRIPE_API_VERSION, httpClient, timeout: TIMEOUT_MS, maxNetworkRetries: 0, telemetry: false });
}
function options(key: string, binding: CheckoutProviderBinding): Stripe.RequestOptions {
  return { idempotencyKey: key, ...(binding.stripeAccount ? { stripeAccount: binding.stripeAccount } : {}) };
}
function payload(json: string): Stripe.Checkout.SessionCreateParams {
  const value: unknown = JSON.parse(json);
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject('Invalid saved provider payload');
  return value as Stripe.Checkout.SessionCreateParams;
}

// Capture uses no delegate and cannot send. Durable admission belongs to the caller.
export async function captureCheckoutWire(args: {
  credentials: CheckoutCredentialResolver; binding: CheckoutProviderBinding; operationId: string; payloadJson: string;
}): Promise<CheckoutWireManifest> {
  assertSdkVersion();
  const binding = bindingSnapshot(args.binding), operationId = args.operationId, payloadJson = args.payloadJson;
  validateBinding(binding);
  const credential = resolveCredential(args.credentials, binding);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(operationId)) reject('Invalid checkout operation ID');
  const key = `lhb-checkout-v2:${operationId}`;
  let captured: string | undefined, count = 0;
  const capture: Stripe.HttpClient = {
    getClientName: () => 'lhb-checkout-capture-only',
    async makeRequest(...wire) {
      if (++count !== 1) reject('Capture attempted another provider request');
      captured = verifyWire(wire, key, credential);
      reject('Capture only; no provider request sent');
    },
  };
  try { await client(credential.apiKey, capture).checkout.sessions.create(payload(payloadJson), options(key, binding)); }
  catch { if (count !== 1 || captured === undefined) reject('Provider request capture did not complete'); }
  if (count !== 1 || captured === undefined) reject('Provider request capture did not complete');
  return { contract: 'checkout-wire-v2', sdkVersion: CHECKOUT_STRIPE_SDK_VERSION, credentialSha256: credentialHash(credential), binding,
    operationId, payloadJson, body: captured, bodySha256: sha256(captured), idempotencyKey: key, apiVersion: CHECKOUT_STRIPE_API_VERSION };
}

// The caller must authenticate the snapshot and commit its attempt fence first.
// This guard provides one send per instance, not durable operation ownership.
export function createSingleSendCheckoutAttempt(args: {
  credentials: CheckoutCredentialResolver; binding: CheckoutProviderBinding; manifest: CheckoutWireManifest; fetch: typeof globalThis.fetch;
}) {
  assertSdkVersion();
  validateBinding(args.binding);
  const credential = resolveCredential(args.credentials, args.binding);
  const manifest = structuredClone(args.manifest);
  if (manifest.credentialSha256 !== credentialHash(credential) || manifest.contract !== 'checkout-wire-v2' || manifest.sdkVersion !== CHECKOUT_STRIPE_SDK_VERSION
    || manifest.apiVersion !== CHECKOUT_STRIPE_API_VERSION || !sameBinding(manifest.binding, args.binding)
    || manifest.idempotencyKey !== `lhb-checkout-v2:${manifest.operationId}` || sha256(manifest.body) !== manifest.bodySha256) reject('Saved provider manifest changed');
  const binding = bindingSnapshot(args.binding);
  const apiKey = credential.apiKey, send = args.fetch;
  const checkedFetch: typeof globalThis.fetch = (url, init) => send(url, { ...init, redirect: 'error' });
  const delegate = Stripe.createFetchHttpClient(checkedFetch);
  let invocations = 0, sends = 0, started = false;
  const checked: Stripe.HttpClient = {
    getClientName: () => 'lhb-checkout-single-send',
    async makeRequest(...wire) {
      if (++invocations !== 1) reject('Provider attempt already used; reconciliation required');
      const actual = verifyWire(wire, manifest.idempotencyKey, credential);
      if (actual !== manifest.body || sha256(actual) !== manifest.bodySha256) reject('Provider wire bytes changed');
      sends++;
      return delegate.makeRequest(...wire);
    },
  };
  return {
    getCounts: () => ({ invocations, underlyingSends: sends }),
    async execute() {
      if (started) reject('Checkout attempt already started; reconciliation required');
      started = true;
      return client(apiKey, checked).checkout.sessions.create(payload(manifest.payloadJson), options(manifest.idempotencyKey, binding));
    },
  };
}
