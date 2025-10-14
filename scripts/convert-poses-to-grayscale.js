#!/usr/bin/env node

/**
 * Convert pose reference images to grayscale
 * This prevents AI from copying clothing colors from pose references
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Configuration
const POSE_NUMBERS = [1, 2, 3, 4, 5];
const INPUT_DIR = path.join(__dirname, '../assets/poses');
const OUTPUT_DIR = path.join(__dirname, '../assets/poses/grayscale');

// Create output directory
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function convertToGrayscale(inputPath, outputPath) {
  try {
    await sharp(inputPath)
      .grayscale()
      .toFile(outputPath);
    console.log(`✓ Converted: ${path.basename(outputPath)}`);
  } catch (error) {
    console.error(`✗ Failed to convert ${path.basename(inputPath)}:`, error.message);
  }
}

async function main() {
  console.log('Converting pose reference images to grayscale...\n');

  for (const poseNum of POSE_NUMBERS) {
    const paddedNum = poseNum.toString().padStart(2, '0');
    const inputPath = path.join(INPUT_DIR, `pose${paddedNum}.png`);
    const outputPath = path.join(OUTPUT_DIR, `pose${paddedNum}.png`);

    if (fs.existsSync(inputPath)) {
      await convertToGrayscale(inputPath, outputPath);
    } else {
      console.log(`⚠ Skipped: pose${paddedNum}.png (file not found)`);
    }
  }

  console.log('\n✓ Done! Grayscale images saved to:', OUTPUT_DIR);
  console.log('\nNext steps:');
  console.log('1. Upload these grayscale images to R2 storage at:');
  console.log('   little-hero-assets/book-mvp-simple-adventure/characters/poses/');
  console.log('2. Remove "Convert Poses to Grayscale" node from workflow');
  console.log('3. Connect "Load Pose Reference" directly to "Prepare Gemini Requests"');
}

main().catch(console.error);




