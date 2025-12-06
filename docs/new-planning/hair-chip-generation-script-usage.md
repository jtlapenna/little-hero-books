# Hair Chip Generation Script - Usage Guide

## Overview

The `generate-hair-chips-from-csv.js` script processes your CSV file to generate hair chips using the Gemini API. It can either:
- **Save images locally** to a directory
- **Upload to Google Drive** automatically

## Prerequisites

1. **Gemini API Key**: Get from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. **Node.js**: Version 18+ required
3. **Optional - Google Drive**: If uploading to Drive, you'll need:
   - `googleapis` package: `npm install googleapis`
   - Google Cloud project with Drive API enabled
   - Service account credentials or OAuth setup

## Quick Start

### Option 1: Save Locally (Simplest)

```bash
# Set your API key
export GOOGLE_GEMINI_API_KEY="your-api-key-here"

# Run the script (saves to assets/hair-references/generated/)
node scripts/generate-hair-chips-from-csv.js
```

### Option 2: Upload to Google Drive

```bash
# Install Google APIs package
npm install googleapis

# Set up Google Drive authentication (see below)
# Then run with Drive folder ID
node scripts/generate-hair-chips-from-csv.js --drive-folder "1PbSZRRDxMyHNkmHozu8KNpwMEajhnhQ0"
```

## Command Line Options

```bash
node scripts/generate-hair-chips-from-csv.js [options]

Options:
  --csv <path>          Path to CSV file
                        (default: docs/new-planning/hair-chip-generation-nano-banana-format.csv)
  
  --output-dir <path>   Local directory to save images
                        (default: assets/hair-references/generated)
  
  --drive-folder <id>   Google Drive folder ID
                        (if provided, uploads to Drive instead of local)
  
  --api-key <key>       Gemini API key
                        (or use GOOGLE_GEMINI_API_KEY env var)
  
  --start-row <n>       Start from row N (1-indexed, default: 2 to skip header)
  
  --end-row <n>         End at row N (default: all rows)
  
  --dry-run             Test mode - don't make API calls
```

## Examples

### Test with First 5 Rows

```bash
node scripts/generate-hair-chips-from-csv.js --end-row 6 --dry-run
```

### Process Specific Range

```bash
node scripts/generate-hair-chips-from-csv.js --start-row 10 --end-row 20
```

### Custom Output Directory

```bash
node scripts/generate-hair-chips-from-csv.js --output-dir "output/hair-chips"
```

### Use Different CSV File

```bash
node scripts/generate-hair-chips-from-csv.js --csv "path/to/your.csv"
```

## Google Drive Setup

### Method 1: Service Account (Recommended for Automation)

1. **Create Service Account**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing
   - Enable "Google Drive API"
   - Create a service account
   - Download JSON credentials

2. **Share Drive Folder with Service Account**:
   - Open the Google Drive folder
   - Right-click → Share
   - Add the service account email (from JSON file)
   - Give "Editor" permissions

3. **Set Credentials**:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"
   ```

4. **Run Script**:
   ```bash
   node scripts/generate-hair-chips-from-csv.js --drive-folder "YOUR_FOLDER_ID"
   ```

### Method 2: OAuth (For Personal Use)

1. **Create OAuth Credentials**:
   - Go to Google Cloud Console
   - Create OAuth 2.0 credentials
   - Download client secret JSON

2. **First Run (Authorization)**:
   - The script will prompt you to authorize
   - Follow the URL to grant permissions
   - Copy the authorization code back

3. **Subsequent Runs**:
   - Token is saved automatically
   - No re-authorization needed

## Output

### Local Mode

Images are saved to: `assets/hair-references/generated/`

Filename format: `{hairstyle}-{hexcode}.png`
- Example: `afro-D1B26F.png` (afro hairstyle, blonde color)

### Google Drive Mode

Images are uploaded to the specified folder with the same naming convention.

### Updated CSV

The script creates a new file: `{original-filename}-completed.csv`

This includes:
- `Output Image`: URL or file path
- `Drive File URL`: Google Drive link (if using Drive)
- `Drive File ID`: Google Drive file ID (if using Drive)
- `API JSON`: Full API response with metadata

## Rate Limiting

The script includes a 1-second delay between API calls to avoid rate limiting. For 136 images, expect:
- **Time**: ~2-3 minutes (plus API processing time)
- **API Costs**: Check Gemini API pricing

## Troubleshooting

### "Gemini API key required"
- Set `GOOGLE_GEMINI_API_KEY` environment variable
- Or use `--api-key` flag

### "Failed to download image"
- Check that reference image URLs are accessible
- Verify admin API endpoint is working
- Test URL in browser first

### "googleapis package not found"
- Run: `npm install googleapis`
- Or use local mode instead (omit `--drive-folder`)

### "Permission denied" (Google Drive)
- Ensure service account has access to folder
- Check folder ID is correct
- Verify Drive API is enabled

### API Errors
- Check API key is valid
- Verify you have quota remaining
- Check API response for specific error messages

## Monitoring Progress

The script outputs progress for each row:
```
🔄 Processing row 2/136...
   📥 Downloading reference image...
   🎨 Calling Gemini API...
   💾 Saving locally...
   ✅ Saved: assets/hair-references/generated/afro-D1B26F.png
```

## Next Steps After Generation

1. **Quality Check**: Review a sample of generated images
2. **Upload to R2**: If using local mode, upload to Cloudflare R2
3. **Update Workflows**: Verify n8n workflows can access new hair chips
4. **Test**: Run a test order to verify hair colors match correctly

## Cost Estimation

- **Gemini API**: Check current pricing at [Google AI Studio](https://ai.google.dev/pricing)
- **136 images**: Multiply per-image cost by 136
- **Storage**: Google Drive or R2 storage costs (if applicable)

