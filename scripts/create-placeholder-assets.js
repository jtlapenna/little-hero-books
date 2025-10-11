#!/usr/bin/env node

/**
 * Create placeholder assets for testing
 * This generates simple colored rectangles for missing animal and footprint images
 */

const fs = require('fs');
const path = require('path');

// Simple function to create a basic PNG data URL (1x1 pixel)
function createSimplePNG(red, green, blue, alpha = 255) {
  // This is a minimal PNG with a single colored pixel
  // In a real implementation, you'd use a proper image library like sharp or canvas
  const width = 200;
  const height = 200;
  
  // For now, we'll create a simple text file that represents the image
  // In production, you'd generate actual PNG data
  return {
    width,
    height,
    color: `rgb(${red}, ${green}, ${blue})`,
    placeholder: true
  };
}

// Create placeholder animal images
function createAnimalPlaceholders() {
  const animals = ['dog', 'cat'];
  const outputDir = 'assets/placeholders/animals';
  
  fs.mkdirSync(outputDir, { recursive: true });
  
  animals.forEach(animal => {
    for (let i = 1; i <= 4; i++) {
      const filename = `${animal}_${i}.png`;
      const filepath = path.join(outputDir, filename);
      
      // Create a simple placeholder file
      const placeholder = createSimplePNG(
        animal === 'dog' ? 139 : 255, // Brown for dog, white for cat
        animal === 'dog' ? 69 : 192,  // Brown for dog, white for cat
        animal === 'dog' ? 19 : 203   // Brown for dog, white for cat
      );
      
      // Write a simple text file as placeholder
      fs.writeFileSync(filepath, `Placeholder ${animal} image ${i}\nColor: ${placeholder.color}\nSize: ${placeholder.width}x${placeholder.height}`);
      
      console.log(`✓ Created placeholder: ${filename}`);
    }
  });
}

// Create placeholder footprint images
function createFootprintPlaceholders() {
  const animals = ['dog', 'cat'];
  const outputDir = 'assets/placeholders/footprints';
  
  fs.mkdirSync(outputDir, { recursive: true });
  
  animals.forEach(animal => {
    const filename = `${animal}_footprints.png`;
    const filepath = path.join(outputDir, filename);
    
    const placeholder = createSimplePNG(100, 100, 100); // Gray footprints
    
    // Write a simple text file as placeholder
    fs.writeFileSync(filepath, `Placeholder ${animal} footprints\nColor: ${placeholder.color}\nSize: ${placeholder.width}x${placeholder.height}`);
    
    console.log(`✓ Created placeholder: ${filename}`);
  });
}

// Create placeholder text box overlay
function createTextBoxPlaceholder() {
  const outputDir = 'assets/placeholders/overlays/text-boxes';
  
  fs.mkdirSync(outputDir, { recursive: true });
  
  const filename = 'standard-box.png';
  const filepath = path.join(outputDir, filename);
  
  const placeholder = createSimplePNG(255, 255, 255, 200); // Semi-transparent white
  
  // Write a simple text file as placeholder
  fs.writeFileSync(filepath, `Placeholder text box overlay\nColor: ${placeholder.color}\nSize: ${placeholder.width}x${placeholder.height}`);
  
  console.log(`✓ Created placeholder: ${filename}`);
}

// Main function
function main() {
  console.log('🎨 Creating placeholder assets for testing...\n');
  
  createAnimalPlaceholders();
  createFootprintPlaceholders();
  createTextBoxPlaceholder();
  
  console.log('\n✅ Placeholder assets created!');
  console.log('\n📁 Created files:');
  console.log('   assets/placeholders/animals/ - 8 animal images (2 types × 4 pages)');
  console.log('   assets/placeholders/footprints/ - 2 footprint images');
  console.log('   assets/placeholders/overlays/text-boxes/ - 1 text box overlay');
  console.log('\n⚠️  Note: These are text placeholders. For real testing, you need actual PNG images.');
  console.log('\n🚀 Next steps:');
  console.log('1. Replace placeholder files with actual PNG images');
  console.log('2. Run: node scripts/upload-test-assets.js');
  console.log('3. Test the workflow');
}

main().catch(console.error);
