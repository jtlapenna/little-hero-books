#!/usr/bin/env node

/**
 * Little Hero Books - Comprehensive Test Suite
 * Tests all components before moving to Amazon integration
 */

const http = require('http');

// Test configuration
const RENDERER_URL = 'http://localhost:8787';
const TEST_RESULTS = {
  passed: 0,
  failed: 0,
  tests: []
};

// Helper function for HTTP requests
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsedBody = res.headers['content-type']?.includes('application/json') 
            ? JSON.parse(body) 
            : body;
          resolve({ status: res.statusCode, headers: res.headers, body: parsedBody });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body });
        }
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Test runner
async function runTest(testName, testFunction) {
  try {
    console.log(`\n🧪 Running: ${testName}`);
    const result = await testFunction();
    if (result.success) {
      console.log(`✅ PASSED: ${testName}`);
      TEST_RESULTS.passed++;
    } else {
      console.log(`❌ FAILED: ${testName} - ${result.reason}`);
      TEST_RESULTS.failed++;
    }
  } catch (error) {
    console.log(`💥 ERROR: ${testName} - ${error.message}`);
    TEST_RESULTS.failed++;
  }
}

// Test 1: Service Health Check
async function testServiceHealth() {
  const response = await makeRequest({
    hostname: 'localhost',
    port: 8787,
    path: '/health',
    method: 'GET'
  });
  
  if (response.status !== 200) {
    return { success: false, reason: `Health check returned status ${response.status}` };
  }
  
  const health = response.body;
  if (!health.ok || !health.service || !health.environment) {
    return { success: false, reason: 'Missing required health check fields' };
  }
  
  return { success: true };
}

// Test 2: Valid Schema Test
async function testValidSchema() {
  const validData = {
    orderId: "SCHEMA-TEST-001",
    spec: { trim: "8x10", bleed: "0.125in", pages: 16, color: "CMYK", binding: "softcover" },
    manuscript: {
      title: "Schema Validation Test",
      pages: Array.from({ length: 14 }, (_, i) => ({
        id: `p${i + 1}`,
        text: `This is page ${i + 1} of our schema validation test.`,
        illustration_prompt: `Test illustration for page ${i + 1}`
      }))
    },
    child: { name: "SchemaTest", age: 5, hair: "brown", skin: "light" },
    options: { favorite_animal: "dragon", favorite_food: "pizza", favorite_color: "purple", hometown: "Test City", dedication: "Testing schema validation!" }
  };
  
  const response = await makeRequest({
    hostname: 'localhost',
    port: 8787,
    path: '/render',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, validData);
  
  if (response.status !== 200) {
    return { success: false, reason: `Valid schema test failed with status ${response.status}` };
  }
  
  return { success: true };
}

// Test 3: Invalid Schema Test
async function testInvalidSchema() {
  const invalidData = {
    orderId: "INVALID-TEST-001",
    manuscript: { title: "Invalid Test", pages: [] }, // Too few pages
    child: { name: "Test", age: 15, hair: "invalid", skin: "invalid" } // Invalid values
  };
  
  const response = await makeRequest({
    hostname: 'localhost',
    port: 8787,
    path: '/render',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, invalidData);
  
  if (response.status === 200) {
    return { success: false, reason: 'Invalid schema was accepted when it should have been rejected' };
  }
  
  return { success: true };
}

// Test 4: Performance Test
async function testPerformance() {
  const startTime = Date.now();
  
  const perfData = {
    orderId: "PERF-TEST-001",
    spec: { trim: "8x10", bleed: "0.125in", pages: 16, color: "CMYK", binding: "softcover" },
    manuscript: {
      title: "Performance Test",
      pages: Array.from({ length: 14 }, (_, i) => ({
        id: `p${i + 1}`,
        text: `This is a performance test page ${i + 1}.`,
        illustration_prompt: `Performance test illustration for page ${i + 1}`
      }))
    },
    child: { name: "PerfTest", age: 5, hair: "blonde", skin: "light" },
    options: { favorite_animal: "cheetah", favorite_food: "energy bars", favorite_color: "yellow", hometown: "Speed City", dedication: "Performance test!" }
  };
  
  const response = await makeRequest({
    hostname: 'localhost',
    port: 8787,
    path: '/render',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, perfData);
  
  const duration = Date.now() - startTime;
  
  if (response.status !== 200) {
    return { success: false, reason: `Performance test failed with status ${response.status}` };
  }
  
  if (duration > 10000) {
    return { success: false, reason: `Performance test took too long: ${duration}ms` };
  }
  
  console.log(`   Performance: ${duration}ms`);
  return { success: true };
}

// Main test runner
async function runAllTests() {
  console.log('🚀 Little Hero Books - Comprehensive Test Suite');
  console.log('===============================================');
  
  await runTest('Service Health Check', testServiceHealth);
  await runTest('Valid Schema Validation', testValidSchema);
  await runTest('Invalid Schema Validation', testInvalidSchema);
  await runTest('Performance Test', testPerformance);
  
  console.log('\n📊 Test Results Summary');
  console.log('========================');
  console.log(`✅ Passed: ${TEST_RESULTS.passed}`);
  console.log(`❌ Failed: ${TEST_RESULTS.failed}`);
  console.log(`📈 Success Rate: ${Math.round((TEST_RESULTS.passed / (TEST_RESULTS.passed + TEST_RESULTS.failed)) * 100)}%`);
  
  if (TEST_RESULTS.failed === 0) {
    console.log('\n✅ All tests passed! Ready for Amazon integration.');
  } else {
    console.log('\n⚠️  Some tests failed. Review issues before proceeding.');
  }
  
  return TEST_RESULTS.failed === 0;
}

runAllTests().catch(console.error);
