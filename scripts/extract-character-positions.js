#!/usr/bin/env node
/**
 * Extract character positioning CSS from CHARACTER_POSITIONS.md
 * and format it for the n8n workflow
 */

const fs = require('fs');
const path = require('path');

// Read the CHARACTER_POSITIONS.md file
const mdPath = path.join(__dirname, '..', 'test-pages', 'CHARACTER_POSITIONS.md');
const mdContent = fs.readFileSync(mdPath, 'utf8');

// Parse all page positions
const pages = {};
let currentPage = null;
let inCSS = false;
let cssBuffer = '';

const lines = mdContent.split('\n');

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  // Match page headers like "## Page 01 - Twilight Walk"
  const pageMatch = line.match(/^## Page (\d+) - (.+)$/);
  if (pageMatch) {
    const pageNum = parseInt(pageMatch[1]);
    const pageName = pageMatch[2];
    currentPage = pageNum;
    pages[pageNum] = {
      name: pageName,
      positioning: {},
      lighting: {}
    };
    continue;
  }
  
  // Detect CSS block start
  if (line.trim() === '```css' && currentPage) {
    inCSS = true;
    cssBuffer = '';
    continue;
  }
  
  // Detect CSS block end
  if (line.trim() === '```' && inCSS && currentPage) {
    inCSS = false;
    // Parse the CSS buffer
    parseCSS(cssBuffer, pages[currentPage]);
    continue;
  }
  
  // Collect CSS content
  if (inCSS) {
    cssBuffer += line + '\n';
  }
}

// Parse CSS to extract positioning and lighting values
function parseCSS(css, pageData) {
  // Extract positioning values
  const rightMatch = css.match(/right:\s*(-?\d+)%/);
  const topMatch = css.match(/top:\s*(-?\d+(?:\.\d+)?)%/);
  const widthMatch = css.match(/width:\s*(\d+)px/);
  const transformMatch = css.match(/transform:\s*([^;]+);/);
  const rotateMatch = transformMatch ? transformMatch[1].match(/rotateZ\((-?\d+)deg\)/) : null;
  const scaleMatch = transformMatch ? transformMatch[1].match(/scaleX\((-?\d+)\)/) : null;
  
  if (rightMatch) pageData.positioning.right = parseInt(rightMatch[1]);
  if (topMatch) pageData.positioning.top = parseFloat(topMatch[1]);
  if (widthMatch) pageData.positioning.width = parseInt(widthMatch[1]);
  if (scaleMatch) pageData.positioning.flip = parseInt(scaleMatch[1]) === -1;
  if (rotateMatch) pageData.positioning.rotate = parseInt(rotateMatch[1]);
  
  // Extract lighting values
  const gradientMatch = css.match(/background:\s*linear-gradient\(([^)]+)\)/);
  const blendModeMatch = css.match(/mix-blend-mode:\s*([^;]+);/);
  
  if (gradientMatch) {
    pageData.lighting.gradient = gradientMatch[1].trim();
  }
  if (blendModeMatch) {
    pageData.lighting.blendMode = blendModeMatch[1].trim();
  }
}

// Generate JavaScript code for the workflow
console.log('// Character positioning data extracted from CHARACTER_POSITIONS.md');
console.log('// Copy this into the getPageLayout() function in the n8n workflow\n');
console.log('function getPageLayout(pageNumber) {');
console.log('  const layouts = {');

for (let i = 1; i <= 14; i++) {
  const page = pages[i];
  if (!page) continue;
  
  const pos = page.positioning;
  const transform = [];
  
  if (pos.flip) {
    transform.push('scaleX(-1)');
  } else {
    transform.push('scaleX(1)');
  }
  
  if (pos.rotate) {
    transform.push(`rotateZ(${pos.rotate}deg)`);
  }
  
  const transformStr = transform.length > 0 ? `transform: ${transform.join(' ')};` : '';
  
  console.log(`    ${i}: { // ${page.name}`);
  console.log(`      character: { `);
  console.log(`        position: 'right: ${pos.right}%; top: ${pos.top}%; ${transformStr}'.trim(),`);
  console.log(`        width: ${pos.width}`);
  console.log(`      }`);
  console.log(`    }${i < 14 ? ',' : ''}`);
}

console.log('  };');
console.log('  return layouts[pageNumber] || layouts[1];');
console.log('}');

console.log('\n\n// Lighting data');
console.log('// Copy this into the getLightingData() function\n');
console.log('function getLightingData(pageNumber) {');
console.log('  const lighting = {');

for (let i = 1; i <= 14; i++) {
  const page = pages[i];
  if (!page || !page.lighting.gradient) continue;
  
  console.log(`    ${i}: { // ${page.name}`);
  console.log(`      gradient: 'linear-gradient(${page.lighting.gradient})',`);
  console.log(`      blendMode: '${page.lighting.blendMode}'`);
  console.log(`    }${i < 14 ? ',' : ''}`);
}

console.log('  };');
console.log('  return lighting[pageNumber] || { gradient: \'none\', blendMode: \'none\' };');
console.log('}');

// Also output JSON for easy integration
console.log('\n\n// Raw JSON data:');
console.log(JSON.stringify(pages, null, 2));

