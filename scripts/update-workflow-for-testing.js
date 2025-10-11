#!/usr/bin/env node

/**
 * Update the 3-book-assembly workflow for 4-page testing
 * This modifies the workflow to work with your current 4 pages of assets
 */

const fs = require('fs');
const path = require('path');

// Read the current workflow
const workflowPath = 'docs/n8n-workflow-files/n8n-new/3-book-assembly.json';
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

// Update page count from 14 to 4
function updatePageCount(node, newCount) {
  if (node.parameters && node.parameters.functionCode) {
    // Update totalPagesRequired
    node.parameters.functionCode = node.parameters.functionCode.replace(
      /totalPagesRequired: 14/g,
      `totalPagesRequired: ${newCount}`
    );
    
    // Update loop counts
    node.parameters.functionCode = node.parameters.functionCode.replace(
      /for \(let i = 1; i <= 14; i\+\+\)/g,
      `for (let i = 1; i <= ${newCount}; i++)`
    );
    
    // Update story text array length
    if (node.parameters.functionCode.includes('storyLines')) {
      // Keep only first 4 story lines
      const storyLinesMatch = node.parameters.functionCode.match(/const storyLines = \[([\s\S]*?)\];/);
      if (storyLinesMatch) {
        const storyLines = storyLinesMatch[1].split('`,').slice(0, newCount);
        const newStoryLines = storyLines.join('`,') + '`';
        node.parameters.functionCode = node.parameters.functionCode.replace(
          /const storyLines = \[[\s\S]*?\];/,
          `const storyLines = [${newStoryLines}];`
        );
      }
    }
  }
}

// Update all nodes
workflow.nodes.forEach(node => {
  if (node.name === 'Get Order Ready for Assembly' ||
      node.name === 'Load Generated Characters' ||
      node.name === 'Load Background Images' ||
      node.name === 'Load Animal Companions' ||
      node.name === 'Load Footprint Assets' ||
      node.name === 'Load Story Text' ||
      node.name === 'Initialize Page Generation Loop') {
    updatePageCount(node, 4);
  }
});

// Update the workflow name to indicate it's for testing
workflow.name = '3. Book Assembly - Footprints of Wonder (4-Page Test)';

// Save the updated workflow
const testWorkflowPath = 'docs/n8n-workflow-files/n8n-new/3-book-assembly-4page-test.json';
fs.writeFileSync(testWorkflowPath, JSON.stringify(workflow, null, 2));

console.log('✅ Updated workflow for 4-page testing');
console.log(`📁 Saved to: ${testWorkflowPath}`);
console.log('\n🔧 Changes made:');
console.log('   - Updated totalPagesRequired from 14 to 4');
console.log('   - Updated all loops from 14 to 4 iterations');
console.log('   - Updated story text to only include 4 pages');
console.log('   - Updated workflow name to indicate test mode');
console.log('\n🚀 Next steps:');
console.log('1. Import the test workflow into n8n');
console.log('2. Run the testing setup scripts');
console.log('3. Test with your 4 pages of assets');
