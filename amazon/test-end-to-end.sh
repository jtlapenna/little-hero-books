#!/bin/bash

# Test end-to-end flow: Middleware → Backend
# Tests the complete order processing pipeline

MIDDLEWARE_URL="${AMAZON_MIDDLEWARE_URL:-http://localhost:4000}"
BACKEND_URL="${BACKEND_API_URL:-http://localhost:3000}"

echo "🧪 Testing End-to-End Flow: Amazon Middleware → Backend"
echo "📍 Middleware: $MIDDLEWARE_URL"
echo "📍 Backend: $BACKEND_URL"
echo ""

# Test 1: Health checks
echo "📊 Test 1: Health Checks"
echo "---"

echo "Middleware health:"
curl -s "$MIDDLEWARE_URL/health" | jq -r '.ok, .environment' 2>/dev/null || echo "❌ Middleware not running"

echo ""
echo "Backend health:"
curl -s "$BACKEND_URL/api/test" | jq -r '.status' 2>/dev/null || echo "⚠️  Backend may not be running (this is OK for endpoint testing)"

echo ""
echo "---"
echo ""

# Test 2: Test backend endpoint with mock order data
echo "📦 Test 2: Backend Endpoint (POST /api/amazon/orders)"
echo "---"

MOCK_ORDER='{
  "amazonOrderId": "TEST-ORDER-'$(date +%s)'",
  "orderId": "TEST-ORDER-'$(date +%s)'",
  "purchaseDate": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
  "orderStatus": "Unshipped",
  "marketplaceId": "ATVPDKIKX0DER",
  "buyer": {
    "email": "test@example.com",
    "name": "Test Customer"
  },
  "shippingAddress": {
    "name": "Test Customer",
    "address": "123 Test St",
    "city": "San Francisco",
    "state": "CA",
    "zip": "94102",
    "country": "US",
    "phone": "555-123-4567"
  },
  "items": [
    {
      "orderItemId": "item-001",
      "asin": "B01234567",
      "sku": "LHB-8X10-SOFTCOVER",
      "title": "Little Hero Book - Custom",
      "quantity": 1,
      "price": {
        "CurrencyCode": "USD",
        "Amount": "24.99"
      },
      "customization": {
        "Child'\''s Name": "Alex",
        "Child'\''s Age": "5",
        "Skin Tone": "skin-medium",
        "Hair Color": "brown-light",
        "Hair Style": "curly-crop",
        "Pronouns": "they/them",
        "Favorite Color": "blue",
        "Animal Guide": "dog",
        "Clothing Style": "tee-shorts",
        "Hometown": "San Francisco",
        "Dedication Message": "To my amazing child, Alex!"
      }
    }
  ],
  "customization": {
    "Child'\''s Name": "Alex",
    "Child'\''s Age": "5",
    "Skin Tone": "skin-medium",
    "Hair Color": "brown-light",
    "Hair Style": "curly-crop",
    "Pronouns": "they/them",
    "Favorite Color": "blue",
    "Animal Guide": "dog",
    "Clothing Style": "tee-shorts",
    "Hometown": "San Francisco",
    "Dedication Message": "To my amazing child, Alex!"
  }
}'

echo "Sending mock order to backend..."
RESPONSE=$(curl -s -X POST "$BACKEND_URL/api/amazon/orders" \
  -H "Content-Type: application/json" \
  -d "$MOCK_ORDER" \
  -w "\nHTTP_STATUS:%{http_code}")

HTTP_STATUS=$(echo "$RESPONSE" | grep -o "HTTP_STATUS:[0-9]*" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed 's/HTTP_STATUS:[0-9]*$//')

echo "Response:"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
echo ""
echo "HTTP Status: $HTTP_STATUS"

if [ "$HTTP_STATUS" = "201" ] || [ "$HTTP_STATUS" = "200" ]; then
  echo "✅ Test 2 PASSED - Backend endpoint working"
  ORDER_ID=$(echo "$BODY" | jq -r '.orderId' 2>/dev/null)
  echo "   Order ID: $ORDER_ID"
else
  echo "❌ Test 2 FAILED - Expected 200/201, got $HTTP_STATUS"
  echo "   This might be OK if backend is not running or Supabase is not configured"
fi

echo ""
echo "---"
echo ""

# Test 3: Idempotency test (send same order twice)
echo "🔄 Test 3: Idempotency Test"
echo "---"

echo "Sending same order again (should update, not create duplicate)..."
RESPONSE2=$(curl -s -X POST "$BACKEND_URL/api/amazon/orders" \
  -H "Content-Type: application/json" \
  -d "$MOCK_ORDER" \
  -w "\nHTTP_STATUS:%{http_code}")

HTTP_STATUS2=$(echo "$RESPONSE2" | grep -o "HTTP_STATUS:[0-9]*" | cut -d: -f2)
BODY2=$(echo "$RESPONSE2" | sed 's/HTTP_STATUS:[0-9]*$//')

IS_NEW=$(echo "$BODY2" | jq -r '.isNewOrder' 2>/dev/null)

if [ "$IS_NEW" = "false" ]; then
  echo "✅ Test 3 PASSED - Order updated (idempotent), not duplicated"
  echo "   isNewOrder: $IS_NEW"
else
  echo "⚠️  Test 3 - Order may have been created again (check isNewOrder: $IS_NEW)"
fi

echo ""
echo "---"
echo ""

# Summary
echo "📋 Summary"
echo "---"
echo "✅ Middleware: $(curl -s "$MIDDLEWARE_URL/health" | jq -r '.ok // "unknown"' 2>/dev/null)"
echo "✅ Backend Endpoint: Tested (see results above)"
echo ""
echo "💡 Next Steps:"
echo "   1. Ensure backend is running: cd back-end && npm run dev"
echo "   2. Ensure Supabase is configured in backend .env"
echo "   3. Test with real Amazon order: curl -X POST \"$MIDDLEWARE_URL/orders/ORDER-ID/process?useSandbox=true\""

