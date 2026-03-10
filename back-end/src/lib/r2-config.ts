import { S3Client } from '@aws-sdk/client-s3';
import { FetchHttpHandler } from '@smithy/fetch-http-handler';

// Create a single S3-compatible client for Cloudflare R2
// Env expected:
// - CLOUDFLARE_ACCOUNT_ID (or R2_ACCOUNT_ID)
// - R2_ACCESS_KEY_ID
// - R2_SECRET_ACCESS_KEY
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID =
  process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ||
  process.env.CLOUDFLARE_R2_ACCESS_KEY ||
  process.env.R2_ACCESS_KEY_ID ||
  process.env.R2_ACCESS_ID_KEY;
const SECRET_ACCESS_KEY =
  process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ||
  process.env.CLOUDFLARE_R2_SECRET_KEY ||
  process.env.R2_SECRET_ACCESS_KEY;

// Validate required environment variables
const missingVars: string[] = [];
if (!ACCOUNT_ID) missingVars.push('CLOUDFLARE_ACCOUNT_ID or R2_ACCOUNT_ID');
if (!ACCESS_KEY_ID) {
  missingVars.push(
    'R2_ACCESS_KEY_ID (or CLOUDFLARE_R2_ACCESS_KEY_ID / CLOUDFLARE_R2_ACCESS_KEY / R2_ACCESS_ID_KEY)'
  );
}
if (!SECRET_ACCESS_KEY) {
  missingVars.push(
    'R2_SECRET_ACCESS_KEY (or CLOUDFLARE_R2_SECRET_ACCESS_KEY / CLOUDFLARE_R2_SECRET_KEY)'
  );
}

// Create R2 client - configured for Cloudflare Workers runtime
// Use FetchHttpHandler (Web Fetch API) instead of Node.js HTTP to avoid filesystem access
// This is critical for Cloudflare Workers which don't have Node.js filesystem
export const r2Client = new S3Client({
  region: 'auto',
  endpoint: ACCOUNT_ID ? `https://${ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined,
  credentials: ACCESS_KEY_ID && SECRET_ACCESS_KEY ? {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  } : undefined,
  forcePathStyle: true,
  // Use Fetch-based HTTP handler (works in Workers/Edge runtime)
  // This prevents the SDK from trying to use Node.js HTTP modules
  requestHandler: new FetchHttpHandler({
    requestTimeout: 30000,
  }),
});

// Export validation helper
export function validateR2Config(): { valid: boolean; missing: string[] } {
  return {
    valid: missingVars.length === 0,
    missing: missingVars,
  };
}

export const R2_PUBLIC_BUCKET = process.env.R2_PUBLIC_BUCKET_NAME || process.env.R2_ASSETS_BUCKET_NAME || process.env.R2_PUBLIC_BUCKET || 'little-hero-assets';
export const R2_ORDERS_BUCKET = process.env.R2_ORDERS_BUCKET_NAME || process.env.R2_ORDERS_BUCKET || 'little-hero-orders';
// Match actual R2 structure: book-mvp-simple-adventure/order-generated-assets/characters/
export const R2_CHARACTERS_PREFIX = process.env.R2_CHARACTERS_PREFIX || 'book-mvp-simple-adventure/order-generated-assets/characters/';
