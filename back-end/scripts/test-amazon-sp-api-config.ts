#!/usr/bin/env tsx

import {
  getAmazonSpApiConfig,
  resolveAmazonSpApiEnv,
} from '@/lib/amazon-sp-api';

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const keys = [
  'AMAZON_SANDBOX_MODE',
  'AMZ_LWA_CLIENT_ID_PROD',
  'AMZ_LWA_CLIENT_SECRET_PROD',
  'AMZ_APP_PROD_REFRESH_TOKEN',
  'AMZ_LWA_CLIENT_ID_SANDBOX',
  'AMZ_LWA_CLIENT_SECRET_SANDBOX',
  'AMZ_APP_SANDBOX_REFRESH_TOKEN',
  'AMZ_APP_CLIENT_ID',
  'AMZ_APP_CLIENT_SECRET',
  'AMZ_REFRESH_TOKEN',
  'AMZ_SELLER_ID',
  'AMZ_MARKETPLACE_ID',
  'AMZ_REGION',
  'AMAZON_SP_API_CLIENT_ID',
  'AMAZON_SP_API_CLIENT_SECRET',
  'AMAZON_SP_API_REFRESH_TOKEN',
  'AMAZON_SP_API_SELLER_ID',
  'AMAZON_SP_API_MARKETPLACE_ID',
  'AMAZON_SP_API_REGION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_REGION',
] as const;

const snapshot = new Map<string, string | undefined>(
  keys.map((key) => [key, process.env[key]]),
);

function resetEnv(): void {
  for (const key of keys) {
    delete process.env[key];
  }
}

try {
  resetEnv();
  process.env.AMAZON_SANDBOX_MODE = 'false';
  process.env.AMZ_LWA_CLIENT_ID_PROD = 'prod-client-id';
  process.env.AMZ_LWA_CLIENT_SECRET_PROD = 'prod-client-secret';
  process.env.AMZ_APP_PROD_REFRESH_TOKEN = 'prod-refresh-token';
  process.env.AMZ_SELLER_ID = 'seller-id';
  process.env.AWS_ACCESS_KEY_ID = 'aws-access-key';
  process.env.AWS_SECRET_ACCESS_KEY = 'aws-secret-key';
  process.env.AMAZON_SP_API_CLIENT_ID = 'your_client_id';

  let env = resolveAmazonSpApiEnv();
  assert(env.lwaClientId === 'prod-client-id', 'Expected production LWA client id alias');
  assert(env.lwaClientSecret === 'prod-client-secret', 'Expected production LWA client secret alias');
  assert(env.lwaRefreshToken === 'prod-refresh-token', 'Expected production refresh token alias');
  assert(env.sellerId === 'seller-id', 'Expected seller id');
  assert(env.marketplaceId === undefined, 'Expected missing marketplace to use schema default');

  let result = getAmazonSpApiConfig(true);
  assert(result.ok, 'Expected production alias config to validate');
  if (result.ok) {
    assert(result.config.lwaClientId === 'prod-client-id', 'Expected validated production client id');
    assert(result.config.marketplaceId === 'ATVPDKIKX0DER', 'Expected default marketplace id');
    assert(result.config.spRegion === 'na', 'Expected default SP region');
    assert(result.config.awsRegion === 'us-east-1', 'Expected default AWS region');
  }

  resetEnv();
  process.env.AMAZON_SANDBOX_MODE = 'true';
  process.env.AMZ_LWA_CLIENT_ID_SANDBOX = 'sandbox-client-id';
  process.env.AMZ_LWA_CLIENT_SECRET_SANDBOX = 'sandbox-client-secret';
  process.env.AMZ_APP_SANDBOX_REFRESH_TOKEN = 'sandbox-refresh-token';
  process.env.AMAZON_SP_API_SELLER_ID = 'sandbox-seller-id';
  process.env.AWS_ACCESS_KEY_ID = 'aws-access-key';
  process.env.AWS_SECRET_ACCESS_KEY = 'aws-secret-key';

  env = resolveAmazonSpApiEnv();
  assert(env.lwaClientId === 'sandbox-client-id', 'Expected sandbox LWA client id alias');
  assert(env.lwaClientSecret === 'sandbox-client-secret', 'Expected sandbox LWA client secret alias');
  assert(env.lwaRefreshToken === 'sandbox-refresh-token', 'Expected sandbox refresh token alias');
  assert(env.sellerId === 'sandbox-seller-id', 'Expected fallback seller id alias');

  result = getAmazonSpApiConfig(true);
  assert(result.ok, 'Expected sandbox alias config to validate');

  resetEnv();
  process.env.AMZ_APP_CLIENT_ID = 'legacy-client-id';
  process.env.AMZ_APP_CLIENT_SECRET = 'legacy-client-secret';
  process.env.AMZ_REFRESH_TOKEN = 'legacy-refresh-token';
  process.env.AMZ_SELLER_ID = 'legacy-seller-id';
  process.env.AWS_ACCESS_KEY_ID = 'aws-access-key';
  process.env.AWS_SECRET_ACCESS_KEY = 'aws-secret-key';

  result = getAmazonSpApiConfig(true);
  assert(result.ok, 'Expected legacy AMZ_APP_* config to validate');
  if (result.ok) {
    assert(result.config.lwaClientId === 'legacy-client-id', 'Expected legacy client id');
  }

  console.log('Amazon SP-API config tests passed');
} finally {
  resetEnv();
  for (const [key, value] of snapshot) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }
}
