#!/usr/bin/env node

/**
 * Test Amazon SP-API Middleware
 * Tests connectivity and basic functionality
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config({ path: join(__dirname, '..', '.env') });

const MIDDLEWARE_URL = process.env.AMAZON_MIDDLEWARE_PORT 
  ? `http://localhost:${process.env.AMAZON_MIDDLEWARE_PORT}`
  : 'http://localhost:4000';

async function testHealth() {
  console.log('🏥 Testing health endpoint...');
  try {
    const response = await fetch(`${MIDDLEWARE_URL}/health`);
    const data = await response.json();
    console.log('✅ Health check passed:');
    console.log(JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    return false;
  }
}

async function testSandbox() {
  console.log('\n🧪 Testing sandbox connectivity...');
  try {
    const response = await fetch(`${MIDDLEWARE_URL}/test-sandbox`);
    const data = await response.json();
    if (data.success) {
      console.log('✅ Sandbox test passed:');
      console.log(`   Orders found: ${data.ordersFound}`);
    } else {
      console.log('❌ Sandbox test failed:');
      console.log(`   Error: ${data.error}`);
    }
    console.log(JSON.stringify(data, null, 2));
    return data.success;
  } catch (error) {
    console.error('❌ Sandbox test failed:', error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Testing Amazon SP-API Middleware\n');
  console.log(`Middleware URL: ${MIDDLEWARE_URL}\n`);

  const healthOk = await testHealth();
  if (!healthOk) {
    console.log('\n⚠️  Middleware may not be running. Start it with: cd amazon && npm start');
    process.exit(1);
  }

  // Only test sandbox if refresh token is available
  const hasSandboxToken = !!process.env.AMZ_LWA_REFRESH_TOKEN_SANDBOX;
  const hasLegacyToken = !!process.env.AMZ_REFRESH_TOKEN;
  
  if (hasSandboxToken || hasLegacyToken) {
    await testSandbox();
  } else {
    console.log('\n⚠️  Skipping sandbox test - refresh token not configured');
    console.log('   Add AMZ_LWA_REFRESH_TOKEN_SANDBOX to .env file');
  }

  console.log('\n✅ Tests complete!');
}

main().catch(console.error);

