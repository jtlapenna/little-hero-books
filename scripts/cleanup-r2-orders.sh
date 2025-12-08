#!/bin/bash

# Clean up R2 bucket - keep only specified order
# Usage: ./cleanup-r2-orders.sh [order-id-to-keep]

set -e  # Exit on error

BUCKET="little-hero-orders"
PREFIX="book-mvp-simple-adventure/orders/"
KEEP_ORDER="${1:-111-0060602-1283417}"

echo "========================================="
echo "R2 Order Cleanup Script"
echo "========================================="
echo "Bucket: $BUCKET"
echo "Prefix: $PREFIX"
echo "Keeping order: $KEEP_ORDER"
echo ""

# Step 1: List all orders
echo "📋 Listing all orders in R2..."
if ! wrangler r2 object list "$BUCKET" --prefix "$PREFIX" > /tmp/all_orders.txt 2>&1; then
  echo "❌ Error: Failed to list R2 objects. Check your wrangler authentication."
  exit 1
fi

TOTAL_OBJECTS=$(wc -l < /tmp/all_orders.txt | tr -d ' ')
echo "Found $TOTAL_OBJECTS total objects"
echo ""

# Step 2: Find orders to delete
echo "🔍 Finding orders to delete (keeping only $KEEP_ORDER)..."
grep -v "$KEEP_ORDER" /tmp/all_orders.txt | awk '{print $1}' > /tmp/orders_to_delete.txt || true

ORDER_COUNT=$(wc -l < /tmp/orders_to_delete.txt | tr -d ' ')

if [ "$ORDER_COUNT" -eq 0 ]; then
  echo "✅ No orders to delete - only $KEEP_ORDER exists (or no orders found)"
  rm -f /tmp/all_orders.txt /tmp/orders_to_delete.txt
  exit 0
fi

echo "⚠️  Found $ORDER_COUNT objects to delete"
echo ""
echo "Objects that will be deleted:"
head -20 /tmp/orders_to_delete.txt | while read key; do
  echo "  - $key"
done
if [ "$ORDER_COUNT" -gt 20 ]; then
  echo "  ... and $((ORDER_COUNT - 20)) more"
fi
echo ""

# Step 3: Confirm deletion
read -p "⚠️  Are you sure you want to delete these $ORDER_COUNT objects? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
  echo "❌ Deletion cancelled"
  rm -f /tmp/all_orders.txt /tmp/orders_to_delete.txt
  exit 0
fi

# Step 4: Delete orders with progress
echo ""
echo "🗑️  Deleting orders (this may take a while)..."
DELETED=0
FAILED=0

while IFS= read -r object_key; do
  if [ -n "$object_key" ]; then
    if wrangler r2 object delete "$BUCKET" "$object_key" 2>/dev/null; then
      DELETED=$((DELETED + 1))
      if [ $((DELETED % 10)) -eq 0 ]; then
        echo "  Progress: $DELETED/$ORDER_COUNT deleted..."
      fi
    else
      FAILED=$((FAILED + 1))
      echo "  ⚠️  Failed to delete: $object_key"
    fi
  fi
done < /tmp/orders_to_delete.txt

echo ""
echo "========================================="
echo "✅ Cleanup complete!"
echo "  Deleted: $DELETED"
if [ $FAILED -gt 0 ]; then
  echo "  Failed: $FAILED"
fi
echo "========================================="
echo ""
echo "📋 Remaining orders:"
wrangler r2 object list "$BUCKET" --prefix "$PREFIX"

# Cleanup temp files
rm -f /tmp/all_orders.txt /tmp/orders_to_delete.txt


