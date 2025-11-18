#!/bin/bash

# Test script for Lulu webhook endpoint in PRODUCTION
# Usage: ./test-lulu-webhook-production.sh
# Make sure to set PRODUCTION_URL environment variable or edit the URL below

PRODUCTION_URL="${PRODUCTION_URL:-https://admin.littleherolabs.com}"
WEBHOOK_URL="${PRODUCTION_URL}/api/webhooks/lulu/status"

echo "🧪 Testing Lulu Webhook Endpoint (PRODUCTION)"
echo "📍 URL: $WEBHOOK_URL"
echo ""

# Test 1: Verify endpoint is accessible
echo "🔍 Test 1: Verify endpoint is accessible"
HTTP_STATUS=$(curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{"name": "IN_PRODUCTION", "print_job_id": 99999}' \
  -w "%{http_code}" \
  -o /dev/null \
  -s)

if [ "$HTTP_STATUS" = "200" ]; then
  echo "✅ Endpoint is accessible and returns 200 OK"
else
  echo "❌ Endpoint returned HTTP $HTTP_STATUS (expected 200)"
  exit 1
fi

echo ""
echo "---"
echo ""

# Test 2: SHIPPED status with tracking info
echo "📦 Test 2: SHIPPED status with tracking info"
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
        "carrier": "UPS"
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

if [ "$HTTP_STATUS" = "200" ]; then
  echo "✅ Test 2 PASSED"
else
  echo "❌ Test 2 FAILED"
fi

echo ""
echo "---"
echo ""

# Test 3: IN_PRODUCTION status
echo "🖨️  Test 3: IN_PRODUCTION status"
RESPONSE=$(curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "IN_PRODUCTION",
    "message": "Print job is in production",
    "changed": "2025-01-15T09:00:00Z",
    "print_job_id": 99999,
    "line_item_statuses": []
  }' \
  -w "\nHTTP_STATUS:%{http_code}" \
  -s)

HTTP_STATUS=$(echo "$RESPONSE" | grep -o "HTTP_STATUS:[0-9]*" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed 's/HTTP_STATUS:[0-9]*$//')

echo "Response:"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
echo ""
echo "HTTP Status: $HTTP_STATUS"

if [ "$HTTP_STATUS" = "200" ]; then
  echo "✅ Test 3 PASSED"
else
  echo "❌ Test 3 FAILED"
fi

echo ""
echo "---"
echo ""

# Test 4: REJECTED status
echo "⚠️  Test 4: REJECTED status with error details"
RESPONSE=$(curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "REJECTED",
    "message": "File validation failed: Invalid PDF format",
    "changed": "2025-01-15T08:00:00Z",
    "print_job_id": 99999,
    "line_item_statuses": [
      {
        "name": "REJECTED",
        "messages": {
          "error_message": "Invalid PDF format. Expected PDF/A-1b compliant file.",
          "errors": [
            {
              "field": "file",
              "message": "PDF validation failed"
            }
          ]
        },
        "line_item_id": 57999
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

if [ "$HTTP_STATUS" = "200" ]; then
  echo "✅ Test 4 PASSED"
else
  echo "❌ Test 4 FAILED"
fi

echo ""
echo "✅ Production testing complete!"
echo ""
echo "📝 Next steps:"
echo "1. ✅ Endpoint is accessible and working"
echo "2. 📧 Notify Developer A with URL: $WEBHOOK_URL"
echo "3. 🔔 Developer A will subscribe to Lulu webhooks"
echo ""
echo "💡 To test with a real order:"
echo "   - Create/update an order in Supabase with lulu_job_id"
echo "   - Send webhook with matching print_job_id"
echo "   - Verify database updates in Supabase"

