# Hair Chip Generation - Skool Template Usage Guide

## Understanding the CSV Format

The CSV file you have (`hair-chip-generation-nano-banana-format.csv`) is formatted for use with a **Skool template**, not for direct upload to bananabatch.com.

### CSV Structure

The CSV contains these key columns:
- **Manual Prompt**: The base prompt text
- **Final Prompt**: The complete prompt with reference images included
- **Reference Image_1**: URL to the hairstyle reference image
- **API JSON**: (Empty initially) - Will be populated with API response after processing
- **Output Image**: (Empty initially) - Will contain generated image URL
- **Drive File URL/ID**: (Empty initially) - For Google Drive storage if configured

### How Skool Templates Work

Based on the CSV format and the template file in your docs (`Nano Banana Image Generator - Skool Template - Nano Banana Image Generator.csv`), here's how it works:

1. **Skool Template Reads CSV**: The template processes each row of the CSV
2. **Makes API Calls**: Uses the "Final Prompt" column to call the Nano Banana/Gemini API
3. **Writes Results Back**: Populates the "API JSON" column with the API response
4. **Stores Images**: May upload to Google Drive or other storage (based on template configuration)

## How to Use Your CSV

### Option 1: Use with Skool Template (Recommended)

If you have access to the Skool template:

1. **Access the Skool Template**: 
   - Navigate to your Skool community/course
   - Find the "Nano Banana Image Generator" template
   - This should be a template/automation that processes CSV files

2. **Upload Your CSV**:
   - Use the template's CSV upload feature
   - Select your `hair-chip-generation-nano-banana-format.csv` file

3. **Run the Template**:
   - The template will process each row
   - Make API calls to Nano Banana/Gemini for each prompt
   - Populate the "API JSON" and "Output Image" columns

4. **Download Results**:
   - Once complete, download the updated CSV
   - Extract image URLs from the "Output Image" or "API JSON" columns

### Option 2: Direct API Integration (Alternative)

If you don't have access to the Skool template, you can:

1. **Use the Gemini API directly** with the prompts from your CSV
2. **Process each row programmatically**:
   - Read the "Final Prompt" column
   - Call Gemini API: `gemini-2.5-flash-image:generateContent`
   - Store the generated image
   - Update the CSV with results

### Option 3: Use bananabatch.com (Simplified)

If you want to use the web interface instead:

1. **Create a simplified CSV** with just a "prompt" column:
   ```csv
   prompt
   "Recolor the hair in the reference image to exactly #D1B26F..."
   "Recolor the hair in the reference image to exactly #E6A273..."
   ```

2. **Upload to bananabatch.com**:
   - Go to https://bananabatch.com/
   - Use the batch upload feature
   - Upload your simplified CSV

**Note**: This approach loses the reference image URLs, so you'd need to include them in the prompt text itself.

## Current CSV Status

✅ **Your CSV is complete and ready:**
- 136 rows (17 hairstyles × 8 colors)
- All prompts include hex codes
- Reference image URLs are correct
- Format matches Skool template requirements

## Next Steps

1. **Determine which method you'll use**:
   - Do you have access to the Skool template?
   - Do you want to use bananabatch.com web interface?
   - Do you want to build a custom script?

2. **If using Skool template**:
   - Locate the template in your Skool community
   - Upload the CSV
   - Run the automation

3. **If using bananabatch.com**:
   - Extract just the "Final Prompt" column to a new CSV with "prompt" header
   - Upload to bananabatch.com
   - Download generated images

4. **If building custom script**:
   - Use the Gemini API directly
   - Process each row from the CSV
   - Call the API with the "Final Prompt" content
   - Store results

## Reference

- **Template Example**: `docs/Nano Banana Image Generator - Skool Template - Nano Banana Image Generator.csv`
- **Your CSV**: `docs/new-planning/hair-chip-generation-nano-banana-format.csv`
- **Gemini API Docs**: https://ai.google.dev/api/generate-image

