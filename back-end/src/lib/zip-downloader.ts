/**
 * ZIP Downloader and Extractor
 * Downloads ZIP files from URLs and extracts JSON customization data
 */

import AdmZip from 'adm-zip';

/** Browser-like headers to avoid 403 from Amazon CDN (zme-caps.amazon.com) */
const FETCH_HEADERS: HeadersInit = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/zip, application/octet-stream, */*',
};

/**
 * Download ZIP file from URL and extract JSON customization data
 * Returns the parsed JSON object or null if extraction fails
 * @throws Error with descriptive message on failure (for caller to report)
 */
export async function downloadAndExtractCustomizationZip(
  url: string
): Promise<any | null> {
  // Download ZIP (browser-like headers to avoid 403 from Amazon CDN)
  const response = await fetch(url, { headers: FETCH_HEADERS });
  if (!response.ok) {
    const bodyPreview = await response.text().then((t) => t.substring(0, 300)).catch(() => '');
    const msg = `Download failed: ${response.status} ${response.statusText}` + (bodyPreview ? ` — ${bodyPreview}` : '');
    console.error('[ZIP Downloader]', msg);
    throw new Error(msg);
  }

  const contentType = response.headers.get('content-type') ?? '';
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length < 4) {
    throw new Error(`Response too small (${buffer.length} bytes), likely not a ZIP. Content-Type: ${contentType}`);
  }

  // ZIP magic bytes: PK\x03\x04 or PK\x05\x06 (empty zip)
  const isZip = (buffer[0] === 0x50 && buffer[1] === 0x4b);
  if (!isZip) {
    const preview = buffer.toString('utf-8', 0, 200).replace(/[^\x20-\x7e]/g, '.');
    throw new Error(`Response is not a ZIP file (got ${contentType}, ${buffer.length} bytes). Preview: ${preview}`);
  }

  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  const jsonEntry = entries.find(
    (entry) => entry.entryName.endsWith('.json') && !entry.isDirectory
  );

  if (!jsonEntry) {
    const names = entries.map((e) => e.entryName).join(', ') || '(empty)';
    throw new Error(`No JSON file in ZIP. Entries: ${names}`);
  }

  const jsonText = jsonEntry.getData().toString('utf-8');
  let jsonData: unknown;
  try {
    jsonData = JSON.parse(jsonText);
  } catch (parseErr) {
    throw new Error(`Invalid JSON in ZIP entry ${jsonEntry.entryName}: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
  }

  return jsonData;
}

