#!/bin/bash

# Test script for R2 privatization verification
# Tests:
# 1. Public URL access (should return 403 if buckets are private)
# 2. Signed URL API endpoint (should work with authentication)
# 3. Signed URL validity (should access R2 objects)

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BACKEND_URL="${BACKEND_URL:-https://admin.littleherolabs.com}"
PUBLIC_R2_URL="https://pub-92cec53654f84771956bc84dfea65baa.r2.dev"
TEST_KEY="book-mvp-simple-adventure/backgrounds/page01-twilight-walk.png"
TEST_BUCKET="little-hero-assets"

echo "=========================================="
echo "R2 Privatization Test Script"
echo "=========================================="
echo ""

# Check if BACKEND_API_TOKEN is set
if [ -z "$BACKEND_API_TOKEN" ]; then
    echo -e "${RED}❌ ERROR: BACKEND_API_TOKEN environment variable is not set${NC}"
    echo "Please set it: export BACKEND_API_TOKEN='your-token-here'"
    exit 1
fi

echo -e "${GREEN}✓ BACKEND_API_TOKEN is set${NC}"
echo ""

# Test 1: Public URL Access (should return 403 if private)
echo "Test 1: Testing Public URL Access"
echo "-----------------------------------"
PUBLIC_TEST_URL="${PUBLIC_R2_URL}/${TEST_KEY}"
echo "Testing: ${PUBLIC_TEST_URL}"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${PUBLIC_TEST_URL}" || echo "000")

if [ "$HTTP_CODE" = "403" ]; then
    echo -e "${GREEN}✓ PASS: Public URL returns 403 Forbidden (buckets are private)${NC}"
elif [ "$HTTP_CODE" = "200" ]; then
    echo -e "${YELLOW}⚠ WARNING: Public URL returns 200 OK (buckets may still be public)${NC}"
    echo "   Expected: 403 Forbidden if buckets are private"
elif [ "$HTTP_CODE" = "404" ]; then
    echo -e "${YELLOW}⚠ INFO: Public URL returns 404 Not Found (file may not exist)${NC}"
    echo "   This is expected if the test file doesn't exist, but check bucket privacy"
else
    echo -e "${RED}✗ FAIL: Public URL returned unexpected code: ${HTTP_CODE}${NC}"
fi
echo ""

# Test 2: Signed URL API Endpoint
echo "Test 2: Testing Signed URL API Endpoint"
echo "-----------------------------------"
API_URL="${BACKEND_URL}/api/r2/signed-url?key=${TEST_KEY}&bucket=${TEST_BUCKET}&expiresIn=3600"
echo "Testing: ${BACKEND_URL}/api/r2/signed-url"

RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer ${BACKEND_API_TOKEN}" \
    "${API_URL}" || echo "ERROR")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    SIGNED_URL=$(echo "$BODY" | grep -o '"url":"[^"]*"' | cut -d'"' -f4 || echo "")
    if [ -n "$SIGNED_URL" ]; then
        echo -e "${GREEN}✓ PASS: Signed URL API returned 200 OK${NC}"
        echo "   Signed URL generated successfully"
        echo "   URL length: ${#SIGNED_URL} characters"
    else
        echo -e "${YELLOW}⚠ WARNING: API returned 200 but couldn't parse signed URL${NC}"
        echo "   Response: ${BODY}"
    fi
elif [ "$HTTP_CODE" = "401" ]; then
    echo -e "${RED}✗ FAIL: Signed URL API returned 401 Unauthorized${NC}"
    echo "   Check BACKEND_API_TOKEN is correct"
elif [ "$HTTP_CODE" = "400" ]; then
    echo -e "${YELLOW}⚠ INFO: Signed URL API returned 400 Bad Request${NC}"
    echo "   Response: ${BODY}"
    echo "   This may be expected if the test key doesn't exist"
else
    echo -e "${RED}✗ FAIL: Signed URL API returned unexpected code: ${HTTP_CODE}${NC}"
    echo "   Response: ${BODY}"
fi
echo ""

# Test 3: Signed URL Validity (if we got one)
if [ -n "$SIGNED_URL" ] && [ "$HTTP_CODE" = "200" ]; then
    echo "Test 3: Testing Signed URL Access"
    echo "-----------------------------------"
    echo "Testing signed URL access..."
    
    SIGNED_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${SIGNED_URL}" || echo "000")
    
    if [ "$SIGNED_HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}✓ PASS: Signed URL works and returns 200 OK${NC}"
        echo "   Signed URLs are functioning correctly"
    elif [ "$SIGNED_HTTP_CODE" = "403" ]; then
        echo -e "${RED}✗ FAIL: Signed URL returns 403 Forbidden${NC}"
        echo "   Signed URL may be invalid or expired"
    elif [ "$SIGNED_HTTP_CODE" = "404" ]; then
        echo -e "${YELLOW}⚠ INFO: Signed URL returns 404 Not Found${NC}"
        echo "   The file may not exist, but signed URL format is correct"
    else
        echo -e "${YELLOW}⚠ INFO: Signed URL returned code: ${SIGNED_HTTP_CODE}${NC}"
    fi
    echo ""
fi

# Summary
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo ""
echo "Next Steps:"
echo "1. If public URLs return 403: ✓ Buckets are private (good)"
echo "2. If signed URL API works: ✓ Backend API is ready"
echo "3. If signed URLs work: ✓ Full privatization is working"
echo ""
echo "If all tests pass, R2 privatization is complete!"
echo ""




