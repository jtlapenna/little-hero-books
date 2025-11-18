#!/bin/bash
# Test script to create a fake Amazon order for testing
# This simulates what the Amazon cron route would create

BASE_URL=${1:-"https://admin.littleherolabs.com"}
BACKEND_TOKEN=${2:-"YOUR_BACKEND_API_TOKEN"}

echo "🧪 Creating test Amazon order..."
echo "URL: ${BASE_URL}/api/orders"
echo ""

# Create a test order with realistic data
ORDER_ID="TEST-$(date +%s)"

response=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/api/orders" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${BACKEND_TOKEN}" \
  -d '{
    "amazonOrderId": "'"${ORDER_ID}"'",
    "execution_status": "pending_w0",
    "OrderStatus": "Unshipped",
    "PurchaseDate": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'",
    "MarketplaceId": "ATVPDKIKX0DER",
    "BuyerInfo": {
      "BuyerEmail": "test@example.com",
      "BuyerName": "Test Customer"
    },
    "ShippingAddress": {
      "Name": "Test Customer",
      "AddressLine1": "123 Test Street",
      "City": "San Francisco",
      "StateOrRegion": "CA",
      "PostalCode": "94102",
      "CountryCode": "US",
      "Phone": "555-123-4567"
    },
    "characterSpecs": {
      "childName": "Alex",
      "age": 5,
      "skinTone": "skin-medium",
      "hairColor": "brown",
      "hairStyle": "short/straight",
      "pronouns": "they/them",
      "favoriteColor": "blue",
      "animalGuide": "dog",
      "clothingStyle": "tee-shorts",
      "hometown": "San Francisco"
    },
    "bookSpecs": {
      "title": "Alex and the Adventure Compass",
      "totalPages": 16,
      "format": "8.5x8.5_softcover",
      "bookType": "adventure"
    },
    "dedication": "To my amazing child, Alex! Love, Mom and Dad"
  }')

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

echo "HTTP Status: ${http_code}"
echo ""
echo "Response:"
echo "$body" | jq '.' 2>/dev/null || echo "$body"
echo ""

if [ "$http_code" -eq 201 ]; then
  echo "✅ Test order created successfully!"
  echo ""
  echo "Order ID: ${ORDER_ID}"
  echo ""
  echo "Next steps:"
  echo "1. Check Supabase to see the order: SELECT * FROM orders WHERE amazon_order_id = '${ORDER_ID}';"
  echo "2. Manually trigger W0 webhook or wait for it to process"
  echo "3. Check the order in the backend UI"
else
  echo "❌ Failed to create test order"
  echo ""
  echo "Common issues:"
  echo "  - 401: Check BACKEND_API_TOKEN is correct"
  echo "  - 500: Check backend logs for errors"
fi

