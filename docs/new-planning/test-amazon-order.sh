#!/bin/bash
# Test script to create a fake Amazon order for testing.
# Uses sibling-safe per-book identity: orderId (per-book) + amazonOrderId (root/group).

BASE_URL=${1:-"https://admin.littleherolabs.com"}
ROOT_AMAZON_ORDER_ID=${2:-""}

echo "🧪 Creating test Amazon order..."
echo "URL: ${BASE_URL}/api/amazon/orders"
echo ""

# Create a canonical test order payload.
ORDER_ID="TEST-$(date +%s)"
ROOT_ID=${ROOT_AMAZON_ORDER_ID:-$ORDER_ID}

response=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/api/amazon/orders" \
  -H "Content-Type: application/json" \
  -d '{
    "amazonOrderId": "'"${ROOT_ID}"'",
    "orderId": "'"${ORDER_ID}"'",
    "orderStatus": "Unshipped",
    "purchaseDate": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'",
    "marketplaceId": "ATVPDKIKX0DER",
    "buyer": {
      "email": "test@example.com",
      "name": "Test Customer"
    },
    "shippingAddress": {
      "name": "Test Customer",
      "address": "123 Test Street",
      "city": "San Francisco",
      "state": "CA",
      "zip": "94102",
      "country": "US",
      "phone": "555-123-4567"
    },
    "customization": {
      "Child Name": "Alex",
      "Child Age": "5",
      "Pronouns": "they/them",
      "Skin Tone": "deep",
      "Hair Color": "dark-brown",
      "Hair Style": "curly-crop",
      "Favorite Color": "blue",
      "Animal Guide": "dog",
      "Clothing Style": "tee-shorts",
      "Hometown": "San Francisco",
      "Dedication Message": "To my amazing child, Alex! Love, Mom and Dad"
    },
    "items": [
      {
        "orderItemId": "ITEM-001",
        "asin": "B0TEST",
        "sku": "LHB-8.5X8.5-SOFTCOVER",
        "title": "Alex and the Adventure Compass",
        "quantity": 1,
        "price": 19.99,
        "customization": {
          "Child Name": "Alex",
          "Child Age": "5",
          "Pronouns": "they/them",
          "Skin Tone": "deep",
          "Hair Color": "dark-brown",
          "Hair Style": "curly-crop",
          "Favorite Color": "blue",
          "Animal Guide": "dog",
          "Clothing Style": "tee-shorts",
          "Hometown": "San Francisco",
          "Dedication Message": "To my amazing child, Alex! Love, Mom and Dad"
        }
      }
    ]
  }')

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

echo "HTTP Status: ${http_code}"
echo ""
echo "Response:"
echo "$body" | jq '.' 2>/dev/null || echo "$body"
echo ""

if [ "$http_code" -eq 201 ] || [ "$http_code" -eq 200 ]; then
  echo "✅ Test order created successfully!"
  echo ""
  echo "Per-book Order ID: ${ORDER_ID}"
  echo "Root Amazon Order ID: ${ROOT_ID}"
  echo ""
  echo "Next steps:"
  echo "1. Check Supabase rows:"
  echo "   SELECT * FROM orders WHERE orderId = '${ORDER_ID}' OR amazon_order_id = '${ROOT_ID}';"
  echo "2. Manually trigger W0 webhook or wait for it to process"
  echo "3. Check the order in the backend UI"
else
  echo "❌ Failed to create test order"
  echo ""
  echo "Common issues:"
  echo "  - 500: If ON CONFLICT error appears, verify deployed API includes per-book upsert fix"
  echo "  - 500: Check backend logs for errors"
fi

