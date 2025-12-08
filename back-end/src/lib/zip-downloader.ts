/**
 * ZIP Downloader and Extractor
 * Downloads ZIP files from URLs and extracts JSON customization data
 */

import AdmZip from 'adm-zip';

/**
 * Download ZIP file from URL and extract JSON customization data
 * Returns the parsed JSON object or null if extraction fails
 */
export async function downloadAndExtractCustomizationZip(
  url: string
): Promise<any | null> {
  try {
    // Download ZIP file
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download ZIP: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract ZIP
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();

    // Find JSON file (should be named like {orderItemId}.json)
    const jsonEntry = entries.find(
      (entry) => entry.entryName.endsWith('.json') && !entry.isDirectory
    );

    if (!jsonEntry) {
      throw new Error('No JSON file found in ZIP');
    }

    // Read and parse JSON
    const jsonText = jsonEntry.getData().toString('utf-8');
    const jsonData = JSON.parse(jsonText);

    return jsonData;
  } catch (error: any) {
    console.error('[ZIP Downloader] Error downloading/extracting ZIP:', error.message);
    return null;
  }
}

