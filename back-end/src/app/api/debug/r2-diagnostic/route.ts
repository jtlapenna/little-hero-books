import { NextRequest, NextResponse } from 'next/server';
import { r2Client, R2_PUBLIC_BUCKET, R2_ORDERS_BUCKET, R2_CHARACTERS_PREFIX } from '@/lib/r2-config';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getAvailableCharacterHashes, getAvailableOrderIds } from '@/lib/r2-service';

export async function GET(request: NextRequest) {
  const diagnostics: any = {
    timestamp: new Date().toISOString(),
    env: {
      hasAccountId: !!(process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID),
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID || 'MISSING',
      hasAccessKey: !!process.env.R2_ACCESS_KEY_ID,
      hasSecretKey: !!process.env.R2_SECRET_ACCESS_KEY,
      publicBucket: R2_PUBLIC_BUCKET,
      ordersBucket: R2_ORDERS_BUCKET,
      charactersPrefix: R2_CHARACTERS_PREFIX,
    },
    tests: {} as any,
  };

  // Test 1: List root of public bucket
  try {
    const cmd1 = new ListObjectsV2Command({
      Bucket: R2_PUBLIC_BUCKET,
      MaxKeys: 10,
    });
    const res1 = await r2Client.send(cmd1);
    diagnostics.tests.listPublicBucketRoot = {
      success: true,
      objectCount: res1.KeyCount || 0,
      sampleKeys: (res1.Contents || []).slice(0, 5).map(o => o.Key),
    };
  } catch (error: any) {
    diagnostics.tests.listPublicBucketRoot = {
      success: false,
      error: error?.message,
      code: error?.$metadata?.httpStatusCode,
      name: error?.name,
    };
  }

  // Test 2: List characters prefix
  try {
    const cmd2 = new ListObjectsV2Command({
      Bucket: R2_PUBLIC_BUCKET,
      Prefix: R2_CHARACTERS_PREFIX,
      Delimiter: '/',
      MaxKeys: 10,
    });
    const res2 = await r2Client.send(cmd2);
    diagnostics.tests.listCharactersPrefix = {
      success: true,
      commonPrefixes: (res2.CommonPrefixes || []).map(p => p.Prefix),
      objectCount: res2.KeyCount || 0,
      sampleKeys: (res2.Contents || []).slice(0, 5).map(o => o.Key),
    };
  } catch (error: any) {
    diagnostics.tests.listCharactersPrefix = {
      success: false,
      error: error?.message,
      code: error?.$metadata?.httpStatusCode,
      name: error?.name,
    };
  }

  // Test 3: Try getAvailableCharacterHashes
  try {
    const hashes = await getAvailableCharacterHashes();
    diagnostics.tests.getCharacterHashes = {
      success: true,
      count: hashes.length,
      hashes: hashes.slice(0, 10),
    };
  } catch (error: any) {
    diagnostics.tests.getCharacterHashes = {
      success: false,
      error: error?.message,
      code: error?.$metadata?.httpStatusCode,
      name: error?.name,
    };
  }

  // Test 4: List orders bucket
  try {
    const cmd3 = new ListObjectsV2Command({
      Bucket: R2_ORDERS_BUCKET,
      Prefix: 'book-mvp-simple-adventure/orders/',
      Delimiter: '/',
      MaxKeys: 10,
    });
    const res3 = await r2Client.send(cmd3);
    diagnostics.tests.listOrdersBucket = {
      success: true,
      commonPrefixes: (res3.CommonPrefixes || []).map(p => p.Prefix),
      objectCount: res3.KeyCount || 0,
      sampleKeys: (res3.Contents || []).slice(0, 5).map(o => o.Key),
    };
  } catch (error: any) {
    diagnostics.tests.listOrdersBucket = {
      success: false,
      error: error?.message,
      code: error?.$metadata?.httpStatusCode,
      name: error?.name,
    };
  }

  // Test 5: Try getAvailableOrderIds
  try {
    const orderIds = await getAvailableOrderIds();
    diagnostics.tests.getOrderIds = {
      success: true,
      count: orderIds.length,
      orderIds: orderIds.slice(0, 10),
    };
  } catch (error: any) {
    diagnostics.tests.getOrderIds = {
      success: false,
      error: error?.message,
      code: error?.$metadata?.httpStatusCode,
      name: error?.name,
    };
  }

  return NextResponse.json(diagnostics, { status: 200 });
}

