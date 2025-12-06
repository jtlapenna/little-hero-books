#!/usr/bin/env node

/**
 * Check Amazon SP-API environment variables
 * Verifies all required variables are present
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from project root
config({ path: join(__dirname, '..', '.env') });

const requiredVars = {
  sandbox: {
    clientId: ['AMZ_LWA_CLIENT_ID_SANDBOX', 'AMZ_APP_CLIENT_ID_SANDBOX'],
    clientSecret: ['AMZ_LWA_CLIENT_SECRET_SANDBOX', 'AMZ_APP_CLIENT_SECRET_SANDBOX'],
    refreshToken: ['AMZ_LWA_REFRESH_TOKEN_SANDBOX', 'AMZ_APP_SANDBOX_REFRESH_TOKEN', 'AMZ_REFRESH_TOKEN'],
  },
  production: {
    clientId: ['AMZ_LWA_CLIENT_ID_PROD', 'AMZ_APP_CLIENT_ID_PROD', 'AMZ_APP_CLIENT_ID'],
    clientSecret: ['AMZ_LWA_CLIENT_SECRET_PROD', 'AMZ_APP_CLIENT_SECRET_PROD', 'AMZ_APP_CLIENT_SECRET'],
    refreshToken: ['AMZ_LWA_REFRESH_TOKEN_PROD', 'AMZ_APP_PROD_REFRESH_TOKEN', 'AMZ_REFRESH_TOKEN'],
  },
};

const optionalVars = {
  AMAZON_ENV: 'sandbox|production',
  AMAZON_SANDBOX_MODE: 'true|false',
  AMZ_MARKETPLACE_ID: 'ATVPDKIKX0DER (default)',
  AMZ_REGION: 'na (default)',
  BACKEND_API_URL: 'http://localhost:3000 (default)',
  AMAZON_MIDDLEWARE_PORT: '4000 (default)',
};

console.log('🔍 Checking Amazon SP-API Environment Variables\n');

// Check sandbox variables
console.log('📦 SANDBOX Credentials:');
let sandboxComplete = true;
for (const [key, varNames] of Object.entries(requiredVars.sandbox)) {
  const varNameArray = Array.isArray(varNames) ? varNames : [varNames];
  let value = null;
  let foundVarName = null;
  for (const varName of varNameArray) {
    if (process.env[varName]) {
      value = process.env[varName];
      foundVarName = varName;
      break;
    }
  }
  const isSet = !!value;
  const displayValue = isSet 
    ? `${value.substring(0, 20)}... (${value.length} chars) [${foundVarName}]`
    : '❌ MISSING';
  const varDisplay = varNameArray[0].padEnd(35);
  console.log(`  ${varDisplay} ${isSet ? '✅' : '❌'} ${displayValue}`);
  if (!isSet) sandboxComplete = false;
}

console.log('\n🏭 PRODUCTION Credentials:');
let prodComplete = true;
for (const [key, varNames] of Object.entries(requiredVars.production)) {
  const varNameArray = Array.isArray(varNames) ? varNames : [varNames];
  let value = null;
  let foundVarName = null;
  for (const varName of varNameArray) {
    if (process.env[varName]) {
      value = process.env[varName];
      foundVarName = varName;
      break;
    }
  }
  const isSet = !!value;
  const displayValue = isSet 
    ? `${value.substring(0, 20)}... (${value.length} chars) [${foundVarName}]`
    : '❌ MISSING';
  const varDisplay = varNameArray[0].padEnd(35);
  console.log(`  ${varDisplay} ${isSet ? '✅' : '❌'} ${displayValue}`);
  if (!isSet) prodComplete = false;
}

console.log('\n⚙️  Configuration Variables:');
for (const [varName, description] of Object.entries(optionalVars)) {
  const value = process.env[varName];
  const isSet = !!value;
  const displayValue = isSet ? value : `(default: ${description.split('(')[1]?.replace(')', '') || 'none'})`;
  console.log(`  ${varName.padEnd(35)} ${isSet ? '✅' : '⚪'} ${displayValue}`);
}

// Check for old variable names (for migration reference)
console.log('\n📋 Legacy Variables (for reference):');
const legacyVars = [
  'AMZ_APP_CLIENT_ID',
  'AMZ_APP_CLIENT_SECRET',
  'AMZ_REFRESH_TOKEN',
  'AMAZON_SP_API_CLIENT_ID',
  'AMAZON_SP_API_CLIENT_SECRET',
  'AMAZON_SP_API_REFRESH_TOKEN',
];
let hasLegacy = false;
for (const varName of legacyVars) {
  const value = process.env[varName];
  if (value) {
    console.log(`  ${varName.padEnd(35)} ⚠️  Found (consider migrating to new names)`);
    hasLegacy = true;
  }
}
if (!hasLegacy) {
  console.log('  (none found)');
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('📊 SUMMARY:');
console.log('='.repeat(60));

const amazonEnv = process.env.AMAZON_ENV || (process.env.AMAZON_SANDBOX_MODE === 'true' ? 'sandbox' : 'production');
console.log(`  Current Mode: ${amazonEnv}`);

if (sandboxComplete) {
  console.log('  ✅ Sandbox credentials: COMPLETE');
} else {
  console.log('  ❌ Sandbox credentials: INCOMPLETE');
}

if (prodComplete) {
  console.log('  ✅ Production credentials: COMPLETE');
} else {
  console.log('  ❌ Production credentials: INCOMPLETE');
}

if (amazonEnv === 'sandbox' && sandboxComplete) {
  console.log('\n  ✅ Ready to test sandbox mode!');
} else if (amazonEnv === 'production' && prodComplete) {
  console.log('\n  ✅ Ready for production mode!');
} else {
  console.log('\n  ⚠️  Missing required credentials for current mode');
}

console.log('\n💡 Next Steps:');
if (!sandboxComplete) {
  console.log('  1. Add missing sandbox credentials to .env file');
}
if (!prodComplete) {
  console.log('  2. Add missing production credentials to .env file');
}
console.log('  3. Run: cd amazon && npm start');
console.log('  4. Test: curl http://localhost:4000/health');
console.log('  5. Test sandbox: curl http://localhost:4000/test-sandbox');

