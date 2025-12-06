# Hair Chip Generation - Quick Start

## ✅ What's Ready

- **CSV File**: Complete with 136 rows (17 hairstyles × 8 colors)
- **Script**: `scripts/generate-hair-chips-from-csv.js` - Ready to use
- **Reference Images**: Should be accessible via admin API

## 🚀 Quick Start (Local Mode)

```bash
# 1. Set your Gemini API key
export GOOGLE_GEMINI_API_KEY="your-api-key-here"

# 2. Run the script (saves images locally)
node scripts/generate-hair-chips-from-csv.js

# Images will be saved to: assets/hair-references/generated/
```

## ☁️ Google Drive Mode

```bash
# 1. Install Google APIs package
npm install googleapis

# 2. Set up Google Drive authentication (see full guide)
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"

# 3. Run with Drive folder ID
node scripts/generate-hair-chips-from-csv.js --drive-folder "1PbSZRRDxMyHNkmHozu8KNpwMEajhnhQ0"
```

## 📋 Test First

Before processing all 136 images, test with a few rows:

```bash
# Test mode (no API calls)
node scripts/generate-hair-chips-from-csv.js --end-row 6 --dry-run

# Test with 5 real API calls
node scripts/generate-hair-chips-from-csv.js --end-row 6
```

## 📁 Output

- **Local**: `assets/hair-references/generated/{hairstyle}-{hex}.png`
- **Drive**: Uploaded to specified folder
- **CSV**: `{original-filename}-completed.csv` with results

## ⚙️ Options

```bash
--csv <path>          CSV file path
--output-dir <path>   Local save directory
--drive-folder <id>   Google Drive folder ID
--api-key <key>       Gemini API key
--start-row <n>       Start from row N
--end-row <n>         End at row N
--dry-run             Test mode
```

## 📚 Full Documentation

See `docs/new-planning/hair-chip-generation-script-usage.md` for complete details.

