#!/bin/bash
# Test script for Amazon Orders Cron Route
# Usage: ./test-amazon-cron.sh [CRON_SECRET]

CRON_SECRET=${1:-"YOUR_CRON_SECRET_HERE"}
BASE_URL=${2:-"https://admin.littleherolabs.com"}

echo "🧪 Testing Amazon Orders Cron Route"
echo "===================================="
echo "URL: ${BASE_URL}/api/cron/amazon-orders"
echo ""

response=$(curl -s -w "\n%{http_code}" -X GET "${BASE_URL}/api/cron/amazon-orders" \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json")

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

echo "HTTP Status: ${http_code}"
echo ""
echo "Response:"
echo "$body" | jq '.' 2>/dev/null || echo "$body"
echo ""

if [ "$http_code" -eq 200 ]; then
  echo "✅ Test passed! Cron route responded successfully."
  echo ""
  echo "Check the response for:"
  echo "  - 'skipped: true, reason: no_orders' (OK if sandbox has no orders)"
  echo "  - 'ordersFound' and 'ordersProcessed' counts"
  echo "  - Any errors in the 'errors' array"
else
  echo "❌ Test failed with HTTP ${http_code}"
  echo ""
  echo "Common issues:"
  echo "  - 401: Check CRON_SECRET is correct"
  echo "  - 500: Check environment variables are set in Vercel"
  echo "  - Check Vercel function logs for details"
fi

