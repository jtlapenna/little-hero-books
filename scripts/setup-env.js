#!/usr/bin/env node

/**
 * Little Hero Books - Environment Setup Script
 * Helps configure different environments (dev, staging, prod)
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const envConfigs = {
  development: {
    NODE_ENV: 'development',
    DEBUG_MODE: 'true',
    ENABLE_TEST_MODE: 'true',
    MOCK_POD_ORDERS: 'true',
    RENDERER_BASE_URL: 'http://localhost:8787'
  },
  staging: {
    NODE_ENV: 'staging',
    DEBUG_MODE: 'true',
    ENABLE_TEST_MODE: 'false',
    MOCK_POD_ORDERS: 'false',
    RENDERER_BASE_URL: 'https://renderer-staging.littleherobooks.com'
  },
  production: {
    NODE_ENV: 'production',
    DEBUG_MODE: 'false',
    ENABLE_TEST_MODE: 'false',
    MOCK_POD_ORDERS: 'false',
    RENDERER_BASE_URL: 'https://renderer.littleherobooks.com'
  }
};

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function setupEnvironment() {
  console.log('🎯 Little Hero Books - Environment Setup\n');
  
  // Choose environment
  console.log('Available environments:');
  console.log('1. development (local testing)');
  console.log('2. staging (pre-production testing)');
  console.log('3. production (live system)');
  
  const envChoice = await question('\nChoose environment (1-3): ');
  const environments = ['development', 'staging', 'production'];
  const selectedEnv = environments[parseInt(envChoice) - 1];
  
  if (!selectedEnv) {
    console.log('❌ Invalid choice. Exiting.');
    rl.close();
    return;
  }
  
  console.log(`\n🔧 Setting up ${selectedEnv} environment...\n`);
  
  // Get basic configuration
  const config = { ...envConfigs[selectedEnv] };
  
  if (selectedEnv === 'development') {
    // Development-specific setup
    config.RENDERER_PORT = '8787';
    config.LOG_LEVEL = 'debug';
    
    console.log('📝 Development environment will use:');
    console.log('- Local file storage');
    console.log('- Mock POD orders');
    console.log('- Test mode enabled');
    console.log('- Debug logging');
    
  } else {
    // Production/Staging setup
    console.log('🔑 Please provide the following configuration:\n');
    
    // Amazon SP-API
    config.AMZ_APP_CLIENT_ID = await question('Amazon SP-API Client ID: ');
    config.AMZ_APP_CLIENT_SECRET = await question('Amazon SP-API Client Secret: ');
    config.AMZ_REFRESH_TOKEN = await question('Amazon Refresh Token: ');
    config.AMZ_SELLER_ID = await question('Amazon Seller ID: ');
    
    // POD Provider
    config.POD_PROVIDER = await question('POD Provider (lulu/onpress): ') || 'lulu';
    config.POD_API_KEY = await question('POD API Key: ');
    
    // Storage
    config.STORAGE_PROVIDER = await question('Storage Provider (cloudflare_r2/aws_s3): ') || 'cloudflare_r2';
    
    if (config.STORAGE_PROVIDER === 'cloudflare_r2') {
      config.R2_ACCESS_KEY = await question('R2 Access Key: ');
      config.R2_SECRET_KEY = await question('R2 Secret Key: ');
      config.R2_ENDPOINT = await question('R2 Endpoint: ');
    } else {
      config.AWS_ACCESS_KEY_ID = await question('AWS Access Key ID: ');
      config.AWS_SECRET_ACCESS_KEY = await question('AWS Secret Access Key: ');
      config.AWS_REGION = await question('AWS Region: ') || 'us-east-1';
    }
    
    // LLM
    config.LLM_PROVIDER = await question('LLM Provider (openai/anthropic): ') || 'openai';
    config.LLM_API_KEY = await question('LLM API Key: ');
    
    // n8n
    config.N8N_BASE_URL = await question('n8n Base URL: ');
    config.N8N_API_KEY = await question('n8n API Key: ');
  }
  
  // Generate .env file
  const envContent = Object.entries(config)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  
  fs.writeFileSync('.env', envContent);
  
  console.log('\n✅ Environment configuration saved to .env');
  console.log(`📁 Environment: ${selectedEnv}`);
  console.log('🚀 Ready to start development!\n');
  
  if (selectedEnv === 'development') {
    console.log('Next steps:');
    console.log('1. cd renderer && npm run dev');
    console.log('2. Test the renderer: curl http://localhost:8787/health');
    console.log('3. Generate a test book with the sample data\n');
  }
  
  rl.close();
}

// Run the setup
setupEnvironment().catch(console.error);
