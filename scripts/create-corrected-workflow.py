#!/usr/bin/env python3
"""Create a corrected workflow JSON file that can be imported into n8n."""

import json
import re

# Read the backup file
with open('docs/n8n-workflow-files/n8n-new/3-book-assembly-production.json.backup', 'r') as f:
    content = f.read()

# Fix Node 4 - Replace the problematic function code
node4_fixed_code = """// Load story text for all pages with character personalization
const orderData = $input.first().json;
const childName = orderData.characterSpecs?.childName;
const hometown = orderData.characterSpecs?.hometown || 'Seattle';
if (!childName) throw new Error('Child name required');
const storyTexts = [];
for (let i = 1; i <= 14; i++) {
  storyTexts.push({
    pageNumber: i,
    text: getStoryText(i, childName, hometown),
    characterName: childName,
    hometown: hometown,
    validated: true
  });
}
function getStoryText(p, n, h) {
  const s = [
    'It was a nice night in ' + h + '. ' + n + ' went outside.',
    n + ' looked at the stars.<br>You like to explore, the voice said.',
    'There was a doorway! ' + n + ' walked through.',
    'Stars were all around! ' + n + ' felt brave.',
    n + ' noticed footprints and followed them.',
    'The path went through giant trees. ' + n + ' felt small, but not scared.',
    'Look how far you came, the voice said.',
    'Lunch was waiting! ' + n + ' ate happily.<br>You earned this, the voice said.',
    'The path became warm sand. Look down there, the voice said.<br>' + n + ' found a beautiful shell!',
    n + ' found a cave with sparkly crystals! They glowed with rainbow colors. You can find beauty everywhere, the voice said.',
    'The path went through giant flowers. The petals were SO big!<br>You make others happy, the voice said.',
    'The voice felt very close now. You are perfect just as you are, it said.<br>' + n + ' looked around. Where was the voice?',
    'Tiger appeared! It was the voice!<br>I have been with you this whole time, said Tiger.',
    'Ready to fly home? asked Tiger. They flew through the stars to ' + h + '.<br>I am always in your heart, said Tiger.'
  ];
  return s[p - 1] || 'Adventure awaits!';
}
return [{ json: {...orderData, storyTexts: storyTexts} }];"""

# Fix Node 13 - Replace hardcoded URL
node13_fixed_code = """// Update order status to completed
const orderData = $input.first().json;
const r2BaseUrl = orderData.r2BaseUrl || process.env.R2_BASE_URL || 'https://little-hero-assets.r2.cloudflarestorage.com';
const completedOrder = {
  ...orderData,
  status: 'book_assembly_completed',
  bookAssemblyCompletedAt: new Date().toISOString(),
  finalBookUrl: r2BaseUrl + '/books/' + orderData.amazonOrderId + '_final.pdf',
  totalAssemblyTime: new Date(orderData.bookAssemblyCompletedAt) - new Date(orderData.assemblyStartedAt),
  averageTimePerPage: Math.round((new Date(orderData.bookAssemblyCompletedAt) - new Date(orderData.assemblyStartedAt)) / orderData.totalPagesRequired / 1000)
};
console.log('Book assembly completed for order: ' + orderData.amazonOrderId);
return [{ json: completedOrder }];"""

# Parse the JSON manually by fixing the problematic sections
print("🔧 Fixing JSON syntax errors...")

# Find and replace Node 4 function code
# Look for the start of Node 4's functionCode
node4_start = content.find('"functionCode": "// Load story text for all pages with character personalization')
if node4_start == -1:
    print("❌ Could not find Node 4 start")
    exit(1)

# Find the end of Node 4's functionCode (look for the closing quote and brace)
node4_end = content.find('"}', node4_start)
if node4_end == -1:
    print("❌ Could not find Node 4 end")
    exit(1)

# Replace Node 4
node4_end += 2  # Include the closing quote and brace
old_node4 = content[node4_start:node4_end]
escaped_code = node4_fixed_code.replace('\n', '\\n').replace('"', '\\"')
new_node4 = f'"functionCode": "{escaped_code}"'
content = content.replace(old_node4, new_node4)
print("✅ Fixed Node 4: Load Story Text")

# Find and replace Node 13 function code
node13_start = content.find('"functionCode": "// Update order status to completed')
if node13_start == -1:
    print("❌ Could not find Node 13 start")
    exit(1)

node13_end = content.find('"}', node13_start)
if node13_end == -1:
    print("❌ Could not find Node 13 end")
    exit(1)

# Replace Node 13
node13_end += 2
old_node13 = content[node13_start:node13_end]
escaped_code13 = node13_fixed_code.replace('\n', '\\n').replace('"', '\\"')
new_node13 = f'"functionCode": "{escaped_code13}"'
content = content.replace(old_node13, new_node13)
print("✅ Fixed Node 13: Update Order Status Complete")

# Write the corrected file
with open('docs/n8n-workflow-files/n8n-new/3-book-assembly-production-fixed.json', 'w') as f:
    f.write(content)

print("\n✅ Corrected workflow saved to:")
print("   docs/n8n-workflow-files/n8n-new/3-book-assembly-production-fixed.json")
print("\n📋 This file should now import successfully into n8n!")

# Validate the JSON
try:
    with open('docs/n8n-workflow-files/n8n-new/3-book-assembly-production-fixed.json', 'r') as f:
        json.load(f)
    print("✅ JSON validation passed!")
except json.JSONDecodeError as e:
    print(f"❌ JSON validation failed: {e}")
    print("⚠️  The file may still have syntax issues")

