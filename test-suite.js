#!/usr/bin/env node

/**
 * Little Hero Books - Comprehensive Test Suite
 * Tests all components before moving to Amazon integration
 */

const https = require('https');
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
    const isHttps = options.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const req = client.request(options, (res) => {
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
      TEST_RESULTS.tests.push({ name: testName, status: 'PASSED', details: result.details });
    } else {
      console.log(`❌ FAILED: ${testName}`);
      console.log(`   Reason: ${result.reason}`);
      TEST_RESULTS.failed++;
      TEST_RESULTS.tests.push({ name: testName, status: 'FAILED', reason: result.reason });
    }
  } catch (error) {
    console.log(`💥 ERROR: ${testName}`);
    console.log(`   Error: ${error.message}`);
    TEST_RESULTS.failed++;
    TEST_RESULTS.tests.push({ name: testName, status: 'ERROR', error: error.message });
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
  const requiredFields = ['ok', 'service', 'version', 'environment', 'debug', 'testMode'];
  const missingFields = requiredFields.filter(field => !(field in health));
  
  if (missingFields.length > 0) {
    return { success: false, reason: `Missing fields: ${missingFields.join(', ')}` };
  }
  
  return { 
    success: true, 
    details: `Service healthy - Environment: ${health.environment}, Debug: ${health.debug}, TestMode: ${health.testMode}` 
  };
}

// Test 2: Schema Validation - Valid Data
async function testValidSchema() {
  const validData = {
    orderId: "SCHEMA-TEST-001",
    spec: {
      trim: "8x10",
      bleed: "0.125in",
      pages: 16,
      color: "CMYK",
      binding: "softcover"
    },
    manuscript: {
      title: "Schema Validation Test",
      pages: Array.from({ length: 14 }, (_, i) => ({
        id: `p${i + 1}`,
        text: `This is page ${i + 1} of our schema validation test.`,
        illustration_prompt: `Test illustration for page ${i + 1}`
      }))
    },
    child: {
      name: "SchemaTest",
      age: 5,
      hair: "brown",
      skin: "light"
    },
    options: {
      favorite_animal: "dragon",
      favorite_food: "pizza",
      favorite_color: "purple",
      hometown: "Test City",
      dedication: "Testing schema validation!"
    }
  };
  
  const response = await makeRequest({
    hostname: 'localhost',
    port: 8787,
    path: '/render',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, validData);
  
  if (response.status !== 200) {
    return { success: false, reason: `Valid schema test failed with status ${response.status}: ${response.body.error}` };
  }
  
  const result = response.body;
  if (!result.bookPdfUrl || !result.coverPdfUrl) {
    return { success: false, reason: 'Missing PDF URLs in response' };
  }
  
  return { 
    success: true, 
    details: `Generated PDFs - Book: ${result.bookPdfUrl}, Cover: ${result.coverPdfUrl}` 
  };
}

// Test 3: Schema Validation - Invalid Data
async function testInvalidSchema() {
  const invalidData = {
    orderId: "INVALID-TEST-001",
    // Missing required fields
    manuscript: {
      title: "Invalid Test",
      pages: [] // Too few pages
    },
    child: {
      name: "Test",
      age: 15, // Invalid age
      hair: "invalid", // Invalid hair color
      skin: "invalid" // Invalid skin tone
    }
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
  
  if (!response.body.error) {
    return { success: false, reason: 'No error message returned for invalid schema' };
  }
  
  return { 
    success: true, 
    details: `Correctly rejected invalid schema with error: ${response.body.error.substring(0, 100)}...` 
  };
}

// Test 4: Edge Cases - Long Names
async function testLongNames() {
  const longNameData = {
    orderId: "LONG-NAME-TEST-001",
    spec: {
      trim: "8x10",
      bleed: "0.125in",
      pages: 16,
      color: "CMYK",
      binding: "softcover"
    },
    manuscript: {
      title: "Very Long Name Test",
      pages: Array.from({ length: 14 }, (_, i) => ({
        id: `p${i + 1}`,
        text: `This page features a child with a very long name.`,
        illustration_prompt: `Test illustration for page ${i + 1}`
      }))
    },
    child: {
      name: "ChristopherAlexanderJohnsonSmith", // 35 characters - exceeds 20 char limit
      age: 4,
      hair: "brown",
      skin: "light"
    },
    options: {
      favorite_animal: "elephant",
      favorite_food: "spaghetti",
      favorite_color: "rainbow",
      hometown: "Very Long City Name That Might Cause Issues",
      dedication: "This is a test of very long names and text that might cause layout issues in our book generation system."
    }
  };
  
  const response = await makeRequest({
    hostname: 'localhost',
    port: 8787,
    path: '/render',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, longNameData);
  
  // This should either succeed (with truncation) or fail gracefully
  if (response.status !== 200 && response.status !== 400) {
    return { success: false, reason: `Unexpected status ${response.status} for long name test` };
  }
  
  return { 
    success: true, 
    details: `Long name test handled appropriately with status ${response.status}` 
  };
}

// Test 5: Special Characters
async function testSpecialCharacters() {
  const specialCharData = {
    orderId: "SPECIAL-CHAR-TEST-001",
    spec: {
      trim: "8x10",
      bleed: "0.125in",
      pages: 16,
      color: "CMYK",
      binding: "softcover"
    },
    manuscript: {
      title: "Special Characters Test",
      pages: Array.from({ length: 14 }, (_, i) => ({
        id: `p${i + 1}`,
        text: `This page tests special characters: "quotes", <brackets>, & ampersands, and 'apostrophes'.`,
        illustration_prompt: `Test illustration with special chars for page ${i + 1}`
      }))
    },
    child: {
      name: "José-María",
      age: 6,
      hair: "brown",
      skin: "medium"
    },
    options: {
      favorite_animal: "penguin",
      favorite_food: "pizza & pasta",
      favorite_color: "blue-green",
      hometown: "São Paulo",
      dedication: "Dear José-María, you are our little hero! <3"
    }
  };
  
  const response = await makeRequest({
    hostname: 'localhost',
    port: 8787,
    path: '/render',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, specialCharData);
  
  if (response.status !== 200) {
    return { success: false, reason: `Special characters test failed with status ${response.status}` };
  }
  
  return { 
    success: true, 
    details: `Special characters handled successfully - Generated PDFs` 
  };
}

// Test 6: Performance Test
async function testPerformance() {
  const startTime = Date.now();
  
  const perfData = {
    orderId: "PERF-TEST-001",
    spec: {
      trim: "8x10",
      bleed: "0.125in",
      pages: 16,
      color: "CMYK",
      binding: "softcover"
    },
    manuscript: {
      title: "Performance Test",
      pages: Array.from({ length: 14 }, (_, i) => ({
        id: `p${i + 1}`,
        text: `This is a performance test page ${i + 1}. We want to see how fast our renderer can generate PDFs.`,
        illustration_prompt: `Performance test illustration for page ${i + 1}`
      }))
    },
    child: {
      name: "PerfTest",
      age: 5,
      hair: "blonde",
      skin: "light"
    },
    options: {
      favorite_animal: "cheetah",
      favorite_food: "energy bars",
      favorite_color: "yellow",
      hometown: "Speed City",
      dedication: "This is a performance test!"
    }
  };
  
  const response = await makeRequest({
    hostname: 'localhost',
    port: 8787,
    path: '/render',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, perfData);
  
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  if (response.status !== 200) {
    return { success: false, reason: `Performance test failed with status ${response.status}` };
  }
  
  // Should complete within 10 seconds for a single book
  if (duration > 10000) {
    return { success: false, reason: `Performance test took too long: ${duration}ms` };
  }
  
  return { 
    success: true, 
    details: `Performance test completed in ${duration}ms (under 10s limit)` 
  };
}

// Test 7: Concurrent Requests
async function testConcurrentRequests() {
  const concurrentData = {
    orderId: "CONCURRENT-TEST-001",
    spec: {
      trim: "8x10",
      bleed: "0.125in",
      pages: 16,
      color: "CMYK",
      binding: "softcover"
    },
    manuscript: {
      title: "Concurrent Test",
      pages: Array.from({ length: 14 }, (_, i) => ({
        id: `p${i + 1}`,
        text: `This is concurrent test page ${i + 1}.`,
        illustration_prompt: `Concurrent test illustration for page ${i + 1}`
      }))
    },
    child: {
      name: "Concurrent",
      age: 4,
      hair: "red",
      skin: "dark"
    },
    options: {
      favorite_animal: "tiger",
      favorite_food: "berries",
      favorite_color: "orange",
      hometown: "Concurrent City",
      dedication: "Testing concurrent requests!"
    }
  };
  
  // Send 3 concurrent requests
  const promises = Array.from({ length: 3 }, (_, i) => {
    const data = { ...concurrentData, orderId: `CONCURRENT-TEST-00${i + 1}` };
    return makeRequest({
      hostname: 'localhost',
      port: 8787,
      path: '/render',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, data);
  });
  
  const responses = await Promise.all(promises);
  const failed = responses.filter(r => r.status !== 200);
  
  if (failed.length > 0) {
    return { success: false, reason: `${failed.length} of 3 concurrent requests failed` };
  }
  
  return { 
    success: true, 
    details: `All 3 concurrent requests completed successfully` 
  };
}

// Test 8: File System Check
async function testFileSystem() {
  const fs = require('fs');
  const path = require('path');
  
  // Check if renderer/out directory exists
  const outDir = path.join(__dirname, 'renderer', 'out');
  if (!fs.existsSync(outDir)) {
    return { success: false, reason: 'Renderer output directory does not exist' };
  }
  
  // Check if templates exist
  const templatesDir = path.join(__dirname, 'renderer', 'templates');
  const requiredTemplates = ['book.html', 'cover.html'];
  
  for (const template of requiredTemplates) {
    const templatePath = path.join(templatesDir, template);
    if (!fs.existsSync(templatePath)) {
      return { success: false, reason: `Required template ${template} does not exist` };
    }
  }
  
  // Check if .env exists
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    return { success: false, reason: 'Environment file .env does not exist' };
  }
  
  return { 
    success: true, 
    details: 'All required files and directories exist' 
  };
}

// Main test runner
async function runAllTests() {
  console.log('🚀 Little Hero Books - Comprehensive Test Suite');
  console.log('===============================================');
  
  // Run all tests
  await runTest('Service Health Check', testServiceHealth);
  await runTest('Valid Schema Validation', testValidSchema);
  await runTest('Invalid Schema Validation', testInvalidSchema);
  await runTest('Long Names Handling', testLongNames);
  await runTest('Special Characters', testSpecialCharacters);
  await runTest('Performance Test', testPerformance);
  await runTest('Concurrent Requests', testConcurrentRequests);
  await runTest('File System Check', testFileSystem);
  
  // Print results
  console.log('\n📊 Test Results Summary');
  console.log('========================');
  console.log(`✅ Passed: ${TEST_RESULTS.passed}`);
  console.log(`❌ Failed: ${TEST_RESULTS.failed}`);
  console.log(`📈 Success Rate: ${Math.round((TEST_RESULTS.passed / (TEST_RESULTS.passed + TEST_RESULTS.failed)) * 100)}%`);
  
  if (TEST_RESULTS.failed > 0) {
    console.log('\n❌ Failed Tests:');
    TEST_RESULTS.tests
      .filter(t => t.status === 'FAILED' || t.status === 'ERROR')
      .forEach(t => {
        console.log(`   - ${t.name}: ${t.reason || t.error}`);
      });
  }
  
  console.log('\n🎯 Ready for Amazon Integration?');
  if (TEST_RESULTS.failed === 0) {
    console.log('✅ YES! All tests passed. Ready to proceed with Option B (Amazon SP-API).');
  } else {
    console.log('⚠️  Some tests failed. Review and fix issues before proceeding.');
  }
  
  return TEST_RESULTS.failed === 0;
}

// Run the tests
runAllTests().catch(console.error);
