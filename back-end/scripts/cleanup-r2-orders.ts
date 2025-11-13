#!/usr/bin/env tsx
/**
 * Cleanup script for R2 orders
 * 
 * This script removes orders from R2 that don't exist in Supabase.
 * It ensures the admin portal only shows orders that exist in the database.
 * 
 * Usage:
 *   # List orders in R2 that don't exist in Supabase (dry run)
 *   npm run cleanup:r2-orders -- --list-orphaned
 * 
 *   # Delete orphaned orders from R2 (REAL DELETION)
 *   npm run cleanup:r2-orders -- --delete-orphaned
 * 
 *   # Delete specific order IDs from R2
 *   npm run cleanup:r2-orders -- --delete --order-ids "ORDER-001,ORDER-002"
 * 
 *   # List all orders in R2
 *   npm run cleanup:r2-orders -- --list-all
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { getAvailableOrderIds, buildManifestKey } from '../src/lib/r2-service';
import { listObjects, deleteObject, R2_ORDERS_BUCKET } from '../src/lib/r2-client';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('   Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface OrderInfo {
  orderId: string;
  manifests: string[];
  assets: string[];
  totalSize: number;
}

async function getAllSupabaseOrderIds(): Promise<Set<string>> {
  console.log('\n📋 Fetching order IDs from Supabase...\n');
  
  const { data, error } = await supabase
    .from('orders')
    .select('"orderId", amazon_order_id')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Error fetching orders from Supabase:', error);
    process.exit(1);
  }

  const orderIds = new Set<string>();
  
  if (data) {
    data.forEach((order: any) => {
      if (order.orderId) orderIds.add(order.orderId.toLowerCase());
      if (order.amazon_order_id) orderIds.add(order.amazon_order_id.toLowerCase());
    });
  }

  console.log(`   Found ${orderIds.size} unique order ID(s) in Supabase\n`);
  return orderIds;
}

async function getAllR2OrderIds(): Promise<string[]> {
  console.log('📦 Fetching order IDs from R2...\n');
  
  try {
    const orderIds = await getAvailableOrderIds();
    console.log(`   Found ${orderIds.length} order ID(s) in R2\n`);
    return orderIds;
  } catch (error: any) {
    console.error('❌ Error fetching order IDs from R2:', error?.message || error);
    process.exit(1);
  }
}

async function listOrderAssets(orderId: string): Promise<OrderInfo> {
  const PROJECT_NS = 'book-mvp-simple-adventure';
  const prefix = `${PROJECT_NS}/orders/${orderId}/`;
  
  try {
    const res = await listObjects(R2_ORDERS_BUCKET, { prefix });
    const keys = (res.Contents || [])
      .filter(o => !!o.Key)
      .map(o => o.Key as string);
    
    const manifests = keys.filter(k => k.includes('/manifests/'));
    const assets = keys.filter(k => !k.includes('/manifests/'));
    const totalSize = (res.Contents || [])
      .reduce((sum, o) => sum + (o.Size || 0), 0);
    
    return {
      orderId,
      manifests,
      assets,
      totalSize
    };
  } catch (error: any) {
    console.error(`   ⚠️  Error listing assets for ${orderId}:`, error?.message || error);
    return {
      orderId,
      manifests: [],
      assets: [],
      totalSize: 0
    };
  }
}

async function deleteOrderFromR2(orderId: string): Promise<boolean> {
  const PROJECT_NS = 'book-mvp-simple-adventure';
  const prefix = `${PROJECT_NS}/orders/${orderId}/`;
  
  try {
    // List all objects for this order
    const res = await listObjects(R2_ORDERS_BUCKET, { prefix });
    const keys = (res.Contents || [])
      .filter(o => !!o.Key)
      .map(o => o.Key as string);
    
    if (keys.length === 0) {
      console.log(`   ⚠️  No objects found for ${orderId}`);
      return false;
    }
    
    console.log(`   Deleting ${keys.length} object(s) for ${orderId}...`);
    
    // Delete all objects
    let deleted = 0;
    let failed = 0;
    
    for (const key of keys) {
      try {
        await deleteObject(R2_ORDERS_BUCKET, key);
        deleted++;
      } catch (error: any) {
        console.error(`     ❌ Failed to delete ${key}:`, error?.message || error);
        failed++;
      }
    }
    
    console.log(`   ✅ Deleted ${deleted} object(s), ${failed} failed`);
    return failed === 0;
  } catch (error: any) {
    console.error(`   ❌ Error deleting order ${orderId}:`, error?.message || error);
    return false;
  }
}

async function listOrphanedOrders() {
  console.log('\n🔍 Finding orphaned orders (in R2 but not in Supabase)...\n');
  
  const supabaseOrderIds = await getAllSupabaseOrderIds();
  const r2OrderIds = await getAllR2OrderIds();
  
  const orphaned: string[] = [];
  const existing: string[] = [];
  
  for (const r2OrderId of r2OrderIds) {
    const normalized = r2OrderId.toLowerCase();
    if (supabaseOrderIds.has(normalized)) {
      existing.push(r2OrderId);
    } else {
      orphaned.push(r2OrderId);
    }
  }
  
  console.log(`\n   📊 Summary:\n`);
  console.log(`   Total orders in R2: ${r2OrderIds.length}`);
  console.log(`   Orders in Supabase: ${existing.length}`);
  console.log(`   Orphaned orders: ${orphaned.length}\n`);
  
  if (orphaned.length === 0) {
    console.log('   ✅ No orphaned orders found. R2 is in sync with Supabase.\n');
    return [];
  }
  
  console.log(`   ⚠️  Found ${orphaned.length} orphaned order(s):\n`);
  
  // Get details for each orphaned order
  const orphanedDetails: OrderInfo[] = [];
  for (const orderId of orphaned) {
    const info = await listOrderAssets(orderId);
    orphanedDetails.push(info);
    
    const sizeMB = (info.totalSize / 1024 / 1024).toFixed(2);
    console.log(`   - ${orderId}`);
    console.log(`     Manifests: ${info.manifests.length}, Assets: ${info.assets.length}, Size: ${sizeMB} MB`);
  }
  
  const totalSize = orphanedDetails.reduce((sum, info) => sum + info.totalSize, 0);
  const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);
  console.log(`\n   Total size of orphaned orders: ${totalSizeMB} MB\n`);
  
  return orphaned;
}

async function deleteOrphanedOrders() {
  const orphaned = await listOrphanedOrders();
  
  if (orphaned.length === 0) {
    return;
  }
  
  console.log(`\n⚠️  DELETION MODE - This will permanently delete ${orphaned.length} order(s) from R2!\n`);
  console.log('   Orders to delete:');
  orphaned.forEach(orderId => {
    console.log(`   - ${orderId}`);
  });
  console.log('\n   ⚠️  This action cannot be undone!\n');
  
  let deleted = 0;
  let failed = 0;
  
  for (const orderId of orphaned) {
    const success = await deleteOrderFromR2(orderId);
    if (success) {
      deleted++;
    } else {
      failed++;
    }
  }
  
  console.log(`\n   ✅ Deletion complete: ${deleted} deleted, ${failed} failed\n`);
}

async function deleteSpecificOrders(orderIds: string) {
  const ids = orderIds.split(',').map(id => id.trim());
  
  console.log(`\n⚠️  DELETION MODE - This will permanently delete ${ids.length} order(s) from R2!\n`);
  console.log('   Orders to delete:');
  ids.forEach(orderId => {
    console.log(`   - ${orderId}`);
  });
  console.log('\n   ⚠️  This action cannot be undone!\n');
  
  let deleted = 0;
  let failed = 0;
  
  for (const orderId of ids) {
    const success = await deleteOrderFromR2(orderId);
    if (success) {
      deleted++;
    } else {
      failed++;
    }
  }
  
  console.log(`\n   ✅ Deletion complete: ${deleted} deleted, ${failed} failed\n`);
}

async function listAllR2Orders() {
  console.log('\n📦 Listing all orders in R2...\n');
  
  const r2OrderIds = await getAllR2OrderIds();
  const supabaseOrderIds = await getAllSupabaseOrderIds();
  
  console.log(`\n   Found ${r2OrderIds.length} order(s) in R2:\n`);
  
  for (const orderId of r2OrderIds) {
    const info = await listOrderAssets(orderId);
    const sizeMB = (info.totalSize / 1024 / 1024).toFixed(2);
    const normalized = orderId.toLowerCase();
    const inSupabase = supabaseOrderIds.has(normalized) ? '✅' : '❌';
    
    console.log(`   ${inSupabase} ${orderId}`);
    console.log(`      Manifests: ${info.manifests.length}, Assets: ${info.assets.length}, Size: ${sizeMB} MB`);
  }
  
  console.log('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const listOrphaned = args.includes('--list-orphaned');
  const deleteOrphaned = args.includes('--delete-orphaned');
  const deleteMode = args.includes('--delete');
  const listAll = args.includes('--list-all');
  const orderIdsIndex = args.indexOf('--order-ids');

  if (listAll) {
    await listAllR2Orders();
  } else if (listOrphaned) {
    await listOrphanedOrders();
  } else if (deleteOrphaned) {
    await deleteOrphanedOrders();
  } else if (deleteMode) {
    const orderIds = orderIdsIndex >= 0 && args[orderIdsIndex + 1] ? args[orderIdsIndex + 1] : undefined;
    if (!orderIds) {
      console.error('❌ Must specify --order-ids when using --delete');
      process.exit(1);
    }
    await deleteSpecificOrders(orderIds);
  } else {
    console.log('Usage:');
    console.log('  npm run cleanup:r2-orders -- --list-orphaned');
    console.log('  npm run cleanup:r2-orders -- --delete-orphaned');
    console.log('  npm run cleanup:r2-orders -- --delete --order-ids "ORDER-001,ORDER-002"');
    console.log('  npm run cleanup:r2-orders -- --list-all');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

