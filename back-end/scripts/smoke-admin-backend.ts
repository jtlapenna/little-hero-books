#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js';

type CheckoutResponse = {
  order_id: string;
  display_order_id: string;
  stripe_checkout_session_url: string;
};

type SyntheticOrder = {
  label: string;
  email: string;
  idempotencyKey: string;
  orderId: string;
  displayOrderId: string;
};

const ADMIN_BASE_URL = (process.env.ADMIN_BASE_URL?.trim() || 'https://admin.littleherolabs.com').replace(/\/+$/, '');
const CUSTOMER_SITE_URL = (process.env.CUSTOMER_SITE_URL?.trim() || 'https://littleherolabs.com').replace(/\/+$/, '');
const SUPABASE_URL = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY?.trim();

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestWithRetry(
  url: string,
  init: RequestInit,
  attempts = 5,
): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (response.status >= 500 && attempt < attempts) {
        lastError = new Error(`HTTP ${response.status}`);
        await sleep(2_000 * attempt);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await sleep(2_000 * attempt);
        continue;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function createSyntheticOrder(label: string, email: string): Promise<SyntheticOrder> {
  const idempotencyKey = `cloudflare-admin-smoke-${label}-${crypto.randomUUID()}`;
  const payload = {
    customer_email: email,
    customer_name: 'Codex Smoke',
    shipping_address: {
      name: 'Codex Smoke',
      phone_number: '4155550101',
      address_line1: '1 Smoke Test Way',
      address_line2: '',
      city: 'San Francisco',
      state: 'CA',
      postal_code: '94103',
      country: 'US',
    },
    shipping_tier: 'mail',
    character_specs: {
      name: 'Ava',
      age: 5,
      pronouns: 'she-her',
      skinTone: 'tan',
      hairStyle: 'bun',
      hairColor: 'brown',
      favoriteColor: 'pink',
    },
    dedication: `Smoke test ${label}`,
    product_info: {
      bookId: 'book-mvp-simple-adventure',
      formatId: 'standard',
    },
  };

  const response = await requestWithRetry(`${ADMIN_BASE_URL}/api/checkout/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: CUSTOMER_SITE_URL,
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(payload),
  });

  const raw = await response.text();
  assert(response.status === 201, `[${label}] checkout create failed: ${response.status} ${raw}`);
  const data = JSON.parse(raw) as CheckoutResponse;

  assert(data.order_id, `[${label}] checkout create missing order_id`);
  assert(data.display_order_id, `[${label}] checkout create missing display_order_id`);
  assert(
    typeof data.stripe_checkout_session_url === 'string' && data.stripe_checkout_session_url.startsWith('https://'),
    `[${label}] checkout create missing Stripe session URL`,
  );

  return {
    label,
    email,
    idempotencyKey,
    orderId: data.order_id,
    displayOrderId: data.display_order_id,
  };
}

async function expectStatusOk(pathname: string, label: string): Promise<void> {
  const response = await requestWithRetry(`${ADMIN_BASE_URL}${pathname}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Origin: CUSTOMER_SITE_URL,
    },
  });

  const raw = await response.text();
  assert(response.ok, `[${label}] status lookup failed: ${response.status} ${raw}`);
}

async function cleanupSyntheticOrders(orders: SyntheticOrder[]): Promise<void> {
  const supabase = createClient(
    requireEnv(SUPABASE_URL, 'SUPABASE_URL'),
    requireEnv(SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const rootOrderIds = orders.map((order) => order.orderId);
  const idempotencyKeys = orders.map((order) => order.idempotencyKey);

  const deleteOrders = await supabase
    .from('orders')
    .delete()
    .in('root_order_id', rootOrderIds);
  if (deleteOrders.error) {
    throw deleteOrders.error;
  }

  const deleteIdempotency = await supabase
    .from('idempotency_keys')
    .delete()
    .in('key', idempotencyKeys);
  if (deleteIdempotency.error) {
    throw deleteIdempotency.error;
  }
}

async function main(): Promise<void> {
  const createdOrders: SyntheticOrder[] = [];

  try {
    const optionsResponse = await requestWithRetry(`${ADMIN_BASE_URL}/api/checkout/create`, {
      method: 'OPTIONS',
      headers: {
        Origin: CUSTOMER_SITE_URL,
        'Access-Control-Request-Method': 'POST',
      },
    });
    assert(
      optionsResponse.status === 204 || optionsResponse.status === 200,
      `OPTIONS /api/checkout/create failed: ${optionsResponse.status}`,
    );

    const plainOrder = await createSyntheticOrder(
      'plain',
      `codex.smoke.plain.${Date.now()}@example.com`,
    );
    createdOrders.push(plainOrder);

    const plusOrder = await createSyntheticOrder(
      'plus',
      `codex.smoke+alias.${Date.now()}@example.com`,
    );
    createdOrders.push(plusOrder);

    await expectStatusOk(`/api/preview/${encodeURIComponent(plainOrder.displayOrderId)}/status`, 'display-id without email');
    await expectStatusOk(`/api/preview/${encodeURIComponent(plainOrder.orderId)}/status`, 'uuid without email');
    await expectStatusOk(
      `/api/preview/${encodeURIComponent(plainOrder.displayOrderId)}/status?email=${encodeURIComponent(plainOrder.email)}`,
      'display-id with plain email',
    );
    await expectStatusOk(
      `/api/preview/${encodeURIComponent(plainOrder.orderId)}/status?email=${encodeURIComponent(plainOrder.email)}`,
      'uuid with plain email',
    );
    await expectStatusOk(
      `/api/preview/${encodeURIComponent(plusOrder.displayOrderId)}/status?email=${encodeURIComponent(plusOrder.email)}`,
      'display-id with plus email',
    );
    await expectStatusOk(
      `/api/preview/${encodeURIComponent(plusOrder.orderId)}/status?email=${encodeURIComponent(plusOrder.email)}`,
      'uuid with plus email',
    );

    console.log('PASS smoke-admin-backend');
  } finally {
    if (createdOrders.length > 0) {
      await cleanupSyntheticOrders(createdOrders);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
