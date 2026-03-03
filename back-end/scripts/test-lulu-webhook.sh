#!/bin/bash

# Test script for Lulu webhook endpoint
# Usage: ./test-lulu-webhook.sh [webhook-url]
# Example: ./test-lulu-webhook.sh http://localhost:3000/api/webhooks/lulu/status
# Example with ngrok: ./test-lulu-webhook.sh https://abc123.ngrok.io/api/webhooks/lulu/status

WEBHOOK_URL="${1:-http://localhost:3000/api/webhooks/lulu/status}"

echo "🧪 Testing Lulu Webhook Endpoint"
echo "📍 URL: $WEBHOOK_URL"
echo ""

# Test 1: SHIPPED status with tracking info
echo "📦 Test 1: SHIPPED status with tracking info"
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SHIPPED",
    "message": "Print job has been shipped",
    "changed": "2025-01-15T10:30:00Z",
    "print_job_id": 12345,
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
  -w "\n\nHTTP Status: %{http_code}\n" \
  -s | jq '.' 2>/dev/null || cat

echo ""
echo "---"
echo ""

# Test 2: IN_PRODUCTION status
echo "🖨️  Test 2: IN_PRODUCTION status"
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "IN_PRODUCTION",
    "message": "Print job is in production",
    "changed": "2025-01-15T09:00:00Z",
    "print_job_id": 12345,
    "line_item_statuses": []
  }' \
  -w "\n\nHTTP Status: %{http_code}\n" \
  -s | jq '.' 2>/dev/null || cat

echo ""
echo "---"
echo ""

# Test 3: REJECTED status with error details
echo "⚠️  Test 3: REJECTED status with error details"
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "REJECTED",
    "message": "File validation failed: Invalid PDF format",
    "changed": "2025-01-15T08:00:00Z",
    "print_job_id": 12345,
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
  -w "\n\nHTTP Status: %{http_code}\n" \
  -s | jq '.' 2>/dev/null || cat

echo ""
echo "---"
echo ""

# Test 4: Missing print_job_id (should still return 200)
echo "❌ Test 4: Missing print_job_id (should still return 200)"
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SHIPPED",
    "message": "Missing print_job_id"
  }' \
  -w "\n\nHTTP Status: %{http_code}\n" \
  -s | jq '.' 2>/dev/null || cat

echo ""
echo "✅ Testing complete!"
echo ""
echo "📝 Next steps:"
echo "1. Check server logs for webhook processing"
echo "2. Verify database updates in Supabase"
echo "3. If using ngrok, share the ngrok URL with Developer A"

