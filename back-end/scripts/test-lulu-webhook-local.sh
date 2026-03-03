#!/bin/bash

# Quick local test for Lulu webhook endpoint
# This tests the endpoint without needing a real order in the database

WEBHOOK_URL="http://localhost:3000/api/webhooks/lulu/status"

echo "🧪 Testing Lulu Webhook Endpoint (Local)"
echo "📍 URL: $WEBHOOK_URL"
echo ""

# Test 1: Basic webhook with order that doesn't exist (should return 200 anyway)
echo "📦 Test 1: SHIPPED status (order not found - should still return 200)"
RESPONSE=$(curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SHIPPED",
    "message": "Print job has been shipped",
    "changed": "2025-01-15T10:30:00Z",
    "print_job_id": 99999,
    "line_item_statuses": [
      {
        "name": "SHIPPED",
        "tracking_id": "1Z999AA10123456784",
        "tracking_urls": [
          "https://www.ups.com/track?tracknum=1Z999AA10123456784"
        ],
        "carrier": "UPS",
        "carrier_name": "UPS",
        "CARRIER_NAME": "UPS"
      }
    ]
  }' \
  -w "\nHTTP_STATUS:%{http_code}" \
  -s)

HTTP_STATUS=$(echo "$RESPONSE" | grep -o "HTTP_STATUS:[0-9]*" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed 's/HTTP_STATUS:[0-9]*$//')

echo "Response:"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
echo ""
echo "HTTP Status: $HTTP_STATUS"
echo ""

if [ "$HTTP_STATUS" = "200" ]; then
  echo "✅ Test 1 PASSED - Endpoint returns 200 OK (correct behavior)"
else
  echo "❌ Test 1 FAILED - Expected 200, got $HTTP_STATUS"
fi

echo ""
echo "---"
echo ""

# Test 2: Missing print_job_id
echo "❌ Test 2: Missing print_job_id (should still return 200)"
RESPONSE2=$(curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SHIPPED",
    "message": "Missing print_job_id"
  }' \
  -w "\nHTTP_STATUS:%{http_code}" \
  -s)

HTTP_STATUS2=$(echo "$RESPONSE2" | grep -o "HTTP_STATUS:[0-9]*" | cut -d: -f2)
BODY2=$(echo "$RESPONSE2" | sed 's/HTTP_STATUS:[0-9]*$//')

echo "Response:"
echo "$BODY2" | jq '.' 2>/dev/null || echo "$BODY2"
echo ""
echo "HTTP Status: $HTTP_STATUS2"
echo ""

if [ "$HTTP_STATUS2" = "200" ]; then
  echo "✅ Test 2 PASSED - Endpoint returns 200 OK even with missing data"
else
  echo "❌ Test 2 FAILED - Expected 200, got $HTTP_STATUS2"
fi

echo ""
echo "✅ Basic endpoint tests complete!"
echo ""
echo "📝 Next steps:"
echo "1. Check server logs above for any errors"
echo "2. To test with a real order, you need an order with lulu_job_id in the database"
echo "3. Use ngrok to expose localhost for Developer A testing"

