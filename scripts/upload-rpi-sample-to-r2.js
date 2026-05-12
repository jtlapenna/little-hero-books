#!/usr/bin/env node
/* Upload the RPI sample PDFs to the orders R2 bucket and print stable proxy URLs. */

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const backendRequire = createRequire(path.resolve(__dirname, '../back-end/package.json'));
const { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } = backendRequire('@aws-sdk/client-s3');
const { getSignedUrl } = backendRequire('@aws-sdk/s3-request-presigner');

function parseEnvFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

const env = {
  ...parseEnvFile(path.resolve(__dirname, '../.env')),
  ...parseEnvFile(path.resolve(__dirname, '../back-end/.env.local')),
  ...process.env,
};

function pick(...keys) {
  for (const key of keys) {
    const value = env[key];
    if (value && String(value).trim()) return String(value).trim();
  }
  return '';
}

const accountId = pick('R2_ACCOUNT_ID', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDEFLARE_ACCOUNT_ID');
const accessKeyId = pick('R2_ACCESS_KEY_ID', 'R2_ACCESS_ID_KEY', 'CLOUDFLARE_R2_ACCESS_KEY');
const secretAccessKey = pick('R2_SECRET_ACCESS_KEY', 'CLOUDFLARE_R2_SECRET_ACCESS_KEY');
const bucket = pick('R2_ORDERS_BUCKET_NAME', 'R2_ORDERS_BUCKET') || 'little-hero-orders';
const backendUrl = (pick('BACKEND_URL', 'NEXT_PUBLIC_BACKEND_URL') || 'https://admin.littleherolabs.com').replace(/\/+$/, '');

if (!accountId || !accessKeyId || !secretAccessKey) {
  console.error('Missing R2 credentials in environment.');
  process.exit(1);
}

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

const files = [
  {
    local: path.resolve(__dirname, '../exports/rpi-book-print/output/rpi-8x8-20p-cover.pdf'),
    key: 'book-mvp-simple-adventure/orders/RPI-SAMPLE-20260512/rpi-8x8-20p-cover.pdf',
  },
  {
    local: path.resolve(__dirname, '../exports/rpi-book-print/output/rpi-8x8-20p-guts.pdf'),
    key: 'book-mvp-simple-adventure/orders/RPI-SAMPLE-20260512/rpi-8x8-20p-guts.pdf',
  },
];

async function main() {
  const result = [];

  for (const file of files) {
    const body = fs.readFileSync(file.local);
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: file.key,
      Body: body,
      ContentType: 'application/pdf',
      CacheControl: 'public, max-age=86400',
    }));

    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: file.key }));
    const signedUrl = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: file.key }),
      { expiresIn: 60 * 60 * 24 * 7 },
    );

    result.push({
      key: file.key,
      bytes: head.ContentLength,
      proxyUrl: `${backendUrl}/api/pdf/${file.key}?proxy=true`,
      signedUrl,
    });
  }

  console.log(JSON.stringify({ bucket, files: result }, null, 2));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
