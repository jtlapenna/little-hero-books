import { NextRequest, NextResponse } from 'next/server';
import { listObjects, R2_PUBLIC_BUCKET, R2_ORDERS_BUCKET, R2_CHARACTERS_PREFIX, validateR2Config } from '@/lib/r2-client';
import { getAvailableCharacterHashes, getAvailableOrderIds } from '@/lib/r2-service';

export async function GET(request: NextRequest) {
  const configValidation = validateR2Config();
  
  const diagnostics: any = {
    timestamp: new Date().toISOString(),
    config: {
      valid: configValidation.valid,
      missing: configValidation.missing,
    },
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
    const res1 = await listObjects(R2_PUBLIC_BUCKET, { maxKeys: 10 });
    diagnostics.tests.listPublicBucketRoot = {
      success: true,
      objectCount: res1.KeyCount || 0,
      sampleKeys: (res1.Contents || []).slice(0, 5).map(o => o.Key),
    };
  } catch (error: any) {
    diagnostics.tests.listPublicBucketRoot = {
      success: false,
      error: error?.message,
      name: error?.name,
    };
  }

  // Test 2: List characters prefix
  try {
    const res2 = await listObjects(R2_PUBLIC_BUCKET, {
      prefix: R2_CHARACTERS_PREFIX,
      delimiter: '/',
      maxKeys: 10,
    });
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
      name: error?.name,
    };
  }

  // Test 4: List orders bucket
  try {
    const res3 = await listObjects(R2_ORDERS_BUCKET, {
      prefix: 'book-mvp-simple-adventure/orders/',
      delimiter: '/',
      maxKeys: 10,
    });
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
      foundTEST_ORDER_006: orderIds.includes('TEST-ORDER-006'),
    };
    
    // Test 6: Try to load manifest for TEST-ORDER-006 if it exists
    if (orderIds.includes('TEST-ORDER-006')) {
      try {
        const { downloadManifest, buildManifestKey } = await import('@/lib/r2-service');
        const manifestKey = buildManifestKey('TEST-ORDER-006', '2a');
        const manifest = await downloadManifest(manifestKey);
        diagnostics.tests.testOrderManifest = {
          success: true,
          manifestKey,
          hasOrderData: !!manifest?.order,
          orderId: manifest?.order?.orderId,
          amazonOrderId: manifest?.order?.amazonOrderId,
          childName: manifest?.order?.childName,
          characterHash: manifest?.characterHash,
          workflowStage: manifest?.workflow?.currentStage,
        };
      } catch (error: any) {
        diagnostics.tests.testOrderManifest = {
          success: false,
          error: error?.message,
        };
      }
    }
  } catch (error: any) {
    diagnostics.tests.getOrderIds = {
      success: false,
      error: error?.message,
      name: error?.name,
    };
  }

  return NextResponse.json(diagnostics, { status: 200 });
}


