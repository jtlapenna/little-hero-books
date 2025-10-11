#!/usr/bin/env node

/**
 * Generate mock order data for testing the 3-book-assembly workflow
 * This creates realistic order data that matches what the workflow expects
 */

const fs = require('fs');
const path = require('path');

// Generate a test character hash (16 characters)
function generateCharacterHash() {
  return Math.random().toString(36).substring(2, 18);
}

// Generate mock order data
function generateMockOrder() {
  const characterHash = generateCharacterHash();
  
  const mockOrder = {
    // Order identification
    amazonOrderId: `TEST-${Date.now()}`,
    status: 'ready_for_book_assembly',
    
    // Character specifications
    characterSpecs: {
      childName: 'Alex',
      skinTone: 'medium',
      hairColor: 'brown',
      hairStyle: 'short/straight',
      age: 5,
      pronouns: 'they/them',
      favoriteColor: 'blue',
      animalGuide: 'dog', // Use 'dog' since we have placeholder dog images
      clothingStyle: 't-shirt and shorts'
    },
    
    // Character hash for asset reuse
    characterHash: characterHash,
    characterPath: `characters/${characterHash}`,
    
    // Workflow tracking
    assemblyStartedAt: new Date().toISOString(),
    pagesGenerated: 0,
    totalPagesRequired: 4, // Only test with 4 pages for now
    assemblyProgress: 0,
    
    // Test mode flag
    testMode: true,
    testAssets: {
      backgrounds: 4,
      poses: 4,
      animals: 2
    }
  };
  
  return mockOrder;
}

// Generate the mock order
const mockOrder = generateMockOrder();

// Save to file
const outputPath = path.join(__dirname, '../test-data/mock-order.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(mockOrder, null, 2));

console.log('🎯 Generated mock order data for testing');
console.log(`📁 Saved to: ${outputPath}`);
console.log('\n📋 Order Details:');
console.log(`   Order ID: ${mockOrder.amazonOrderId}`);
console.log(`   Character: ${mockOrder.characterSpecs.childName}`);
console.log(`   Animal Guide: ${mockOrder.characterSpecs.animalGuide}`);
console.log(`   Character Hash: ${mockOrder.characterHash}`);
console.log(`   Pages to Test: ${mockOrder.totalPagesRequired}`);
console.log('\n🚀 Next steps:');
console.log('1. Run: node scripts/upload-test-assets.js');
console.log('2. Import this mock order into your n8n workflow');
console.log('3. Test the workflow with the uploaded assets');
