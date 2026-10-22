/** Bounded Amazon customization download and selected JSON extraction. Never extracts files to disk. */
import { crc32, inflateRawSync } from 'node:zlib';

export const CUSTOMIZATION_ZIP_LIMITS = {
  downloadBytes: 20 * 1024 * 1024,
  jsonBytes: 2 * 1024 * 1024,
  entries: 256,
  nameBytes: 1024,
  pathSeparators: 32,
  downloadMilliseconds: 30_000,
} as const;

const FETCH_HEADERS: HeadersInit = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/zip, application/octet-stream, */*',
};

class CustomizationZipError extends Error {}
function invalidArchive(): never { throw new CustomizationZipError('Invalid customization ZIP'); }

/**
 * Parse bounded ordinary single-disk ZIP metadata without allocating directory trees.
 * ZIP64/multi-disk and trailing-data archives are rejected. Local bit-3 size
 * placeholders are permitted; descriptor metadata and actual decoded CRC are verified.
 */
interface JsonEntry { dataOffset: number; compressedSize: number; size: number; method: number; encrypted: boolean; crc: number }
function validateArchive(buffer: Buffer): JsonEntry | undefined {
  if (buffer.length < 22 || ![0x04034b50, 0x06054b50].includes(buffer.readUInt32LE(0))) invalidArchive();
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 65535); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50 && i + 22 + buffer.readUInt16LE(i + 20) === buffer.length) { end = i; break; }
  }
  if (end < 0 || buffer.readUInt16LE(end + 4) !== 0 || buffer.readUInt16LE(end + 6) !== 0) invalidArchive();
  const count = buffer.readUInt16LE(end + 10), offset = buffer.readUInt32LE(end + 16), size = buffer.readUInt32LE(end + 12);
  if (count > CUSTOMIZATION_ZIP_LIMITS.entries) throw new CustomizationZipError('Customization ZIP has too many entries');
  if (buffer.readUInt16LE(end + 8) !== count || offset + size !== end) invalidArchive();
  let cursor = offset;
  const spans: Array<[number, number]> = [];
  let selected: JsonEntry | undefined;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || buffer.readUInt32LE(cursor) !== 0x02014b50) invalidArchive();
    const flags = buffer.readUInt16LE(cursor + 8), method = buffer.readUInt16LE(cursor + 10);
    const compressed = buffer.readUInt32LE(cursor + 20), expanded = buffer.readUInt32LE(cursor + 24), local = buffer.readUInt32LE(cursor + 42);
    const nameLength = buffer.readUInt16LE(cursor + 28), extra = buffer.readUInt16LE(cursor + 30), comment = buffer.readUInt16LE(cursor + 32);
    if (!nameLength || nameLength > CUSTOMIZATION_ZIP_LIMITS.nameBytes || cursor + 46 + nameLength + extra + comment > end) invalidArchive();
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength);
    let separators = 0;
    for (const byte of name) if (byte === 47 || byte === 92) separators++;
    if (separators > CUSTOMIZATION_ZIP_LIMITS.pathSeparators) throw new CustomizationZipError('Customization ZIP path exceeds limit');
    if ([compressed, expanded, local].includes(0xffffffff) || buffer.readUInt16LE(cursor + 34) !== 0 || local + 30 > offset) invalidArchive();
    if (buffer.readUInt32LE(local) !== 0x04034b50 || buffer.readUInt16LE(local + 6) !== flags || buffer.readUInt16LE(local + 8) !== method) invalidArchive();
    const localNameLength = buffer.readUInt16LE(local + 26), localExtra = buffer.readUInt16LE(local + 28);
    const dataOffset = local + 30 + localNameLength + localExtra;
    if (dataOffset > offset || dataOffset + compressed > offset || localNameLength !== nameLength || !buffer.subarray(local + 30, local + 30 + localNameLength).equals(name)) invalidArchive();
    const crc = buffer.readUInt32LE(cursor + 16);
    if (!(flags & 8) && (buffer.readUInt32LE(local + 14) !== crc || buffer.readUInt32LE(local + 18) !== compressed || buffer.readUInt32LE(local + 22) !== expanded)) invalidArchive();
    let dataEnd = dataOffset + compressed;
    if (flags & 8) {
      if (dataEnd + 12 > offset) invalidArchive();
      const descriptor = dataEnd + (buffer.readUInt32LE(dataEnd) === 0x08074b50 ? 4 : 0);
      if (descriptor + 12 > offset || buffer.readUInt32LE(descriptor) !== crc || buffer.readUInt32LE(descriptor + 4) !== compressed || buffer.readUInt32LE(descriptor + 8) !== expanded) invalidArchive();
      dataEnd = descriptor + 12;
    }
    spans.push([local, dataEnd]);
    if (!selected && name[name.length - 1] !== 47 && name[name.length - 1] !== 92 && name.toString('utf8').endsWith('.json')) {
      selected = { dataOffset, compressedSize: compressed, size: expanded, method, encrypted: Boolean(flags & 1), crc };
    }
    if (method === 0 && compressed !== expanded) invalidArchive();
    cursor += 46 + nameLength + extra + comment;
  }
  if (cursor !== end) invalidArchive();
  spans.sort((a, b) => a[0] - b[0]);
  if (spans.some((span, i) => i > 0 && span[0] < spans[i - 1][1])) invalidArchive();
  return selected;
}

function extractCustomization(buffer: Buffer): unknown {
  const entry = validateArchive(buffer);
  if (!entry) throw new CustomizationZipError('No JSON file in customization ZIP');
  const { size, compressedSize, dataOffset, method, encrypted, crc } = entry;
  if (size <= 0 || size > CUSTOMIZATION_ZIP_LIMITS.jsonBytes) throw new CustomizationZipError('Customization JSON exceeds limit or is empty');
  if (encrypted || ![0, 8].includes(method)) invalidArchive();
  const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
  // Explicit native output ceiling, independent of attacker-supplied metadata.
  const expanded = method === 8 ? inflateRawSync(compressed, { maxOutputLength: CUSTOMIZATION_ZIP_LIMITS.jsonBytes }) : compressed;
  if (expanded.length !== size || crc32(expanded) !== crc) invalidArchive();
  try { return JSON.parse(expanded.toString('utf8')); } catch { throw new CustomizationZipError('Invalid JSON in customization ZIP'); }
}

/** Same fetch/body deadline; it cannot interrupt synchronous bounded ZIP/JSON parsing. */
export async function downloadAndExtractCustomizationZip(url: string): Promise<unknown> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined, reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let response: Response | undefined, bodyComplete = false, stage = 'download';
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(new CustomizationZipError('Customization ZIP download timed out')); controller.abort(); }, CUSTOMIZATION_ZIP_LIMITS.downloadMilliseconds);
  });
  try {
    response = await Promise.race([fetch(url, { headers: FETCH_HEADERS, signal: controller.signal }), expired]);
    if (!response.ok) throw new CustomizationZipError(`Customization ZIP download failed (HTTP ${response.status})`);
    const declared = response.headers.get('content-length');
    if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > CUSTOMIZATION_ZIP_LIMITS.downloadBytes)) throw new CustomizationZipError('Customization ZIP download exceeds limit or has invalid length');
    if (!response.body) throw new CustomizationZipError('Empty customization ZIP download');
    reader = response.body.getReader();
    let bytes = Buffer.alloc(8192), total = 0;
    for (;;) {
      const { value, done } = await Promise.race([reader.read(), expired]);
      if (done) break;
      const next = total + value.byteLength;
      if (next > CUSTOMIZATION_ZIP_LIMITS.downloadBytes) throw new CustomizationZipError('Customization ZIP download exceeds limit');
      if (next > bytes.length) {
        const grown = Buffer.alloc(Math.min(CUSTOMIZATION_ZIP_LIMITS.downloadBytes, Math.max(next, bytes.length * 2))); bytes.copy(grown, 0, 0, total); bytes = grown;
      }
      bytes.set(value, total); total = next;
    }
    bodyComplete = true;stage = 'archive';
    return extractCustomization(bytes.subarray(0, total));
  } catch (error) {
    if (error instanceof CustomizationZipError) throw error;
    throw new CustomizationZipError(stage === 'download' ? 'Customization ZIP download failed' : 'Invalid customization ZIP');
  } finally {
    clearTimeout(timer);
    if (!bodyComplete) {
      controller.abort();
      if (reader) void reader.cancel().catch(() => undefined);
      else void response?.body?.cancel().catch(() => undefined);
    }
    reader?.releaseLock();
  }
}
