#!/usr/bin/env node
/**
 * Hair Chip Generation Script
 * 
 * Processes CSV file to generate hair chips using Gemini API
 * - Reads CSV with prompts and reference image URLs
 * - Calls Gemini API for each row
 * - Uploads to Google Drive OR saves locally
 * - Updates CSV with results
 * 
 * Usage:
 *   node scripts/generate-hair-chips-from-csv.js [options]
 * 
 * Options:
 *   --csv <path>          Path to CSV file (default: docs/new-planning/hair-chip-generation-nano-banana-format.csv)
 *   --output-dir <path>   Local directory to save images (default: assets/hair-references/generated)
 *   --drive-folder <id>    Google Drive folder ID (if provided, uploads to Drive instead of local)
 *   --api-key <key>       Gemini API key (or use GOOGLE_GEMINI_API_KEY env var)
 *   --start-row <n>       Start from row N (1-indexed, default: 2 to skip header)
 *   --end-row <n>         End at row N (default: all rows)
 *   --dry-run             Test mode - don't make API calls
 */

const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const http = require('http');

// Parse command line arguments
const args = process.argv.slice(2);
const getArg = (flag, defaultValue) => {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : defaultValue;
};
const hasFlag = (flag) => args.includes(flag);

const CSV_PATH = getArg('--csv', 'docs/new-planning/hair-chip-generation-nano-banana-format - hair-chip-generation-nano-banana-format.csv');
const OUTPUT_DIR = getArg('--output-dir', 'assets/hair-references/generated');
const DRIVE_FOLDER_ID = getArg('--drive-folder', null);
const API_KEY = getArg('--api-key', process.env.GOOGLE_GEMINI_API_KEY);
const START_ROW = parseInt(getArg('--start-row', '2'), 10);
const END_ROW = parseInt(getArg('--end-row', '999999'), 10);
const DRY_RUN = hasFlag('--dry-run');

if (!API_KEY && !DRY_RUN) {
  console.error('❌ Error: Gemini API key required');
  console.error('   Set GOOGLE_GEMINI_API_KEY environment variable or use --api-key flag');
  process.exit(1);
}

// Parse CSV (simple parser - handles quoted fields)
function parseCSV(content) {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });
    rows.push(row);
  }
  
  return { headers, rows };
}

// Download image from URL and convert to base64
async function downloadImageAsBase64(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    protocol.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download image: ${response.statusCode}`));
        return;
      }
      
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const base64 = buffer.toString('base64');
        const mimeType = response.headers['content-type'] || 'image/png';
        resolve({ data: base64, mimeType });
      });
    }).on('error', reject);
  });
}

// Build enhanced prompt that preserves texture
function buildEnhancedPrompt(basePrompt, hexCode) {
  // Extract the hex code from the original prompt if not provided
  // Try multiple patterns to find hex code in the CSV prompt
  let hex = hexCode;
  if (!hex) {
    // Try to find hex in format #XXXXXX
    const hexMatch = basePrompt.match(/#([A-F0-9]{6})/i);
    if (hexMatch) {
      hex = hexMatch[1].toUpperCase();
    }
  }
  
  if (!hex) {
    console.warn('⚠️  Warning: Could not extract hex code from prompt');
    return basePrompt;
  }
  
  // Very simple, direct prompt as requested
  const enhancedPrompt = `please change the base color of this hair chip to #${hex}.  do not change anything else about the image.  do not change the silhouette, shading, or texture, only the base color.`;
  
  return enhancedPrompt;
}

// Call Gemini API to generate image
async function callGeminiAPI(prompt, referenceImageBase64, referenceImageMime) {
  // Use enhanced prompt that preserves texture
  const enhancedPrompt = buildEnhancedPrompt(prompt);
  
  // Debug: Log the hex code being used
  const hexMatch = prompt.match(/#([A-F0-9]{6})/i);
  if (hexMatch) {
    const hex = hexMatch[1].toUpperCase();
    console.log(`   🎨 Target color: #${hex}`);
  }
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${API_KEY}`;
  
  // System instruction to explicitly tell model this is an EDITING task, not generation
  const systemInstruction = {
    role: 'system',
    parts: [{
      text: `You are an image editing tool. Your task is to EDIT the provided reference image by changing ONLY the hair color to the specified hex code.

CRITICAL REQUIREMENTS:
- This is an EDITING task, not image generation. You must preserve the exact reference image.
- Preserve the exact silhouette, shape, form, and all edges exactly as shown in the reference.
- Preserve all texture strokes, curls, patterns, and details exactly as they appear.
- Preserve all existing shading, highlights, and color variations exactly as shown.
- Do not add, remove, or modify any visual elements.
- Do not add new shadows, shading, or darkening that doesn't exist in the reference.
- Only change the hair color values to match the specified hex code.
- Keep everything else (face, background, clothing, etc.) completely unchanged.

The output must be the reference image with ONLY the hair color changed.`
    }]
  };
  
  const requestBody = {
    systemInstruction,
    contents: [{
      role: 'user',
      parts: [
        { text: enhancedPrompt },
        { text: 'REFERENCE IMAGE:' },
        {
          inlineData: {
            mimeType: referenceImageMime,
            data: referenceImageBase64
          }
        }
      ]
    }],
    generationConfig: {
      imageConfig: {
        aspectRatio: '1:1',
        imageSize: '1K'
      },
      temperature: 0.15,
      topK: 1,
      topP: 0.6,
      candidateCount: 1
    }
  };
  
  // Use Node.js https module instead of fetch for better compatibility
  const urlObj = new URL(url);
  const postData = JSON.stringify(requestBody);
  
  const response = await new Promise((resolve, reject) => {
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`Gemini API error: ${res.statusCode} - ${data}`));
        } else {
          resolve({ statusCode: res.statusCode, data });
        }
      });
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
  
  const data = JSON.parse(response.data);
  
  if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
    throw new Error('Invalid response from Gemini API');
  }
  
  const imagePart = data.candidates[0].content.parts.find(part => part.inlineData);
  if (!imagePart || !imagePart.inlineData) {
    throw new Error('No image in Gemini API response');
  }
  
  return {
    imageBase64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType,
    apiResponse: data
  };
}

// Save image locally
async function saveImageLocally(imageBase64, mimeType, filename) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const buffer = Buffer.from(imageBase64, 'base64');
  const ext = mimeType.includes('jpeg') ? 'jpg' : 'png';
  const filepath = path.join(OUTPUT_DIR, `${filename}.${ext}`);
  await fs.writeFile(filepath, buffer);
  return filepath;
}

// Ensure output directory exists (even in dry-run)
async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

// Upload to Google Drive (requires googleapis package)
async function uploadToGoogleDrive(imageBase64, mimeType, filename, folderId) {
  try {
    const { google } = require('googleapis');
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/drive.file']
    });
    const drive = google.drive({ version: 'v3', auth });
    
    const buffer = Buffer.from(imageBase64, 'base64');
    const ext = mimeType.includes('jpeg') ? 'jpg' : 'png';
    const fullFilename = `${filename}.${ext}`;
    
    const fileMetadata = {
      name: fullFilename,
      parents: folderId ? [folderId] : []
    };
    
    const media = {
      mimeType: mimeType,
      body: buffer
    };
    
    const file = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, webViewLink, webContentLink'
    });
    
    return {
      fileId: file.data.id,
      webViewLink: file.data.webViewLink,
      webContentLink: file.data.webContentLink,
      filename: fullFilename
    };
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      throw new Error('googleapis package not found. Install with: npm install googleapis');
    }
    throw error;
  }
}

// Hair color hex to name mapping (matches Customization_Source_of_Truth.md)
const HAIR_COLOR_MAP = {
  '#D1B26F': 'blonde',
  '#E6A273': 'strawberry-blonde',
  '#A4754A': 'light-brown',
  '#7B4B2A': 'medium-brown',
  '#523418': 'dark-brown',
  '#8B3F2C': 'auburn',
  '#2B2B2B': 'black',
  '#C25E2E': 'red'
};

// Extract filename from reference image URL and prompt
// Returns: {hairstyle}-{color-name}.png (e.g., "afro-blonde.png")
function extractFilename(referenceUrl, prompt) {
  // Extract hairstyle from URL
  const urlMatch = referenceUrl.match(/\/([^/]+)\.png/);
  const hairstyle = urlMatch ? urlMatch[1] : 'unknown';
  
  // Extract hex code from prompt and map to color name
  const hexMatch = prompt.match(/#([A-F0-9]{6})/i);
  const hex = hexMatch ? `#${hexMatch[1].toUpperCase()}` : null;
  const colorName = hex && HAIR_COLOR_MAP[hex] ? HAIR_COLOR_MAP[hex] : 'unknown';
  
  return `${hairstyle}-${colorName}`;
}

// Main processing function
async function processCSV() {
  console.log('📖 Reading CSV file...');
  const csvContent = await fs.readFile(CSV_PATH, 'utf-8');
  const { headers, rows } = parseCSV(csvContent);
  
  console.log(`✅ Found ${rows.length} rows`);
  console.log(`📋 Processing rows ${START_ROW} to ${Math.min(END_ROW, rows.length)}`);
  
  // Ensure output directory exists
  await ensureOutputDir();
  console.log(`📁 Output directory: ${path.resolve(OUTPUT_DIR)}`);
  
  if (DRY_RUN) {
    console.log('🧪 DRY RUN MODE - No API calls will be made');
  }
  
  const results = [];
  const processedRows = rows.slice(START_ROW - 2, END_ROW - 1); // -2 because rows array starts at index 0, START_ROW is 1-indexed
  
  for (let i = 0; i < processedRows.length; i++) {
    const row = processedRows[i];
    const rowNum = START_ROW + i;
    const finalPrompt = row['Final Prompt'] || row['Manual Prompt'];
    const referenceUrl = row['Reference Image_1'];
    
    if (!finalPrompt || !referenceUrl) {
      console.log(`⏭️  Skipping row ${rowNum}: missing prompt or reference image`);
      continue;
    }
    
    console.log(`\n🔄 Processing row ${rowNum}/${rows.length}...`);
    console.log(`   Reference: ${referenceUrl}`);
    
    // Generate filename first to check if it already exists
    const filename = extractFilename(referenceUrl, finalPrompt);
    
    // Check if file already exists (try both png and jpg extensions)
    const extensions = ['png', 'jpg', 'jpeg'];
    let existingFile = null;
    for (const ext of extensions) {
      const filepath = path.join(OUTPUT_DIR, `${filename}.${ext}`);
      try {
        await fs.access(filepath);
        existingFile = filepath;
        break;
      } catch (error) {
        // File doesn't exist with this extension, continue
      }
    }
    
    if (existingFile) {
      console.log(`   ⏭️  Skipping: File already exists: ${path.basename(existingFile)}`);
      results.push({
        rowNum,
        success: true,
        skipped: true,
        reason: 'File already exists',
        filepath: existingFile
      });
      continue;
    }
    
    try {
      // Download reference image
      console.log('   📥 Downloading reference image...');
      const { data: refBase64, mimeType: refMime } = await downloadImageAsBase64(referenceUrl);
      
      // Call Gemini API
      if (DRY_RUN) {
        console.log('   🧪 [DRY RUN] Would call Gemini API...');
        results.push({
          rowNum,
          success: true,
          skipped: true
        });
        continue;
      }
      
      console.log('   🎨 Calling Gemini API...');
      const { imageBase64, mimeType, apiResponse } = await callGeminiAPI(finalPrompt, refBase64, refMime);
      
      // Save or upload
      let result;
      if (DRIVE_FOLDER_ID) {
        console.log('   ☁️  Uploading to Google Drive...');
        result = await uploadToGoogleDrive(imageBase64, mimeType, filename, DRIVE_FOLDER_ID);
        console.log(`   ✅ Uploaded: ${result.webViewLink}`);
      } else {
        console.log('   💾 Saving locally...');
        const filepath = await saveImageLocally(imageBase64, mimeType, filename);
        console.log(`   ✅ Saved: ${filepath}`);
        result = { filepath, filename: `${filename}.${mimeType.includes('jpeg') ? 'jpg' : 'png'}` };
      }
      
      // Update row with results
      row['Output Image'] = DRIVE_FOLDER_ID ? result.webViewLink : result.filepath;
      row['Drive File URL'] = result.webViewLink || '';
      row['Drive File ID'] = result.fileId || '';
      row['API JSON'] = JSON.stringify({
        model: 'gemini-2.5-flash-image',
        success: true,
        attempts: 1,
        imageSize: imageBase64.length,
        storage: DRIVE_FOLDER_ID ? 'Google Drive' : 'Local',
        ...(DRIVE_FOLDER_ID ? {
          driveFileId: result.fileId,
          driveFileUrl: result.webViewLink
        } : {
          localPath: result.filepath
        }),
        timestamp: new Date().toISOString()
      });
      
      results.push({
        rowNum,
        success: true,
        filename: result.filename,
        ...result
      });
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`   ❌ Error processing row ${rowNum}:`, error.message);
      results.push({
        rowNum,
        success: false,
        error: error.message
      });
    }
  }
  
  // Write updated CSV
  if (!DRY_RUN) {
    console.log('\n💾 Writing updated CSV...');
    const updatedCSV = [
      headers.join(','),
      ...rows.map(row => headers.map(h => {
        const value = row[h] || '';
        // Escape quotes and wrap in quotes if contains comma or newline
        if (value.includes(',') || value.includes('\n') || value.includes('"')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(','))
    ].join('\n');
    
    const outputPath = CSV_PATH.replace('.csv', '-completed.csv');
    await fs.writeFile(outputPath, updatedCSV, 'utf-8');
    console.log(`✅ Updated CSV saved to: ${outputPath}`);
  }
  
  // Summary
  console.log('\n📊 Summary:');
  const successful = results.filter(r => r.success && !r.skipped).length;
  const failed = results.filter(r => !r.success).length;
  const skipped = results.filter(r => r.skipped).length;
  console.log(`   ✅ Successful: ${successful}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  
  if (DRIVE_FOLDER_ID) {
    console.log(`\n☁️  Images uploaded to Google Drive folder: ${DRIVE_FOLDER_ID}`);
  } else {
    console.log(`\n💾 Images saved to: ${path.resolve(OUTPUT_DIR)}`);
  }
}

// Run the script
processCSV().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

