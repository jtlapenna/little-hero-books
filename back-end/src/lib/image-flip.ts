import { decode, encode } from 'fast-png';

export type ImageFormat = 'png' | 'webp' | 'jpeg' | 'unknown';

// Detect image format from the first bytes so we can fail clearly on unsupported inputs.
export function detectImageFormat(buf: Buffer): ImageFormat {
  if (!buf || buf.length < 12) return 'unknown';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  return 'unknown';
}

// Keep the backend flip path deterministic by only accepting PNG inputs.
export function ensurePngBuffer(buf: Buffer, label: string): Buffer {
  const fmt = detectImageFormat(buf);
  if (fmt === 'png') return buf;
  throw new Error(`UNSUPPORTED_IMAGE_FORMAT:${label}:${fmt}`);
}

// Flip PNG bytes horizontally in a runtime-safe way.
export function flipPngHorizontally(imageBuffer: Buffer): Buffer {
  const decoded = decode(imageBuffer);
  const { width, height, data, channels } = decoded;
  const bytesPerPixel = channels;
  const rowLength = width * bytesPerPixel;
  const flippedData = new Uint8Array(data.length);

  for (let y = 0; y < height; y++) {
    const rowStart = y * rowLength;
    for (let x = 0; x < width; x++) {
      const srcOff = rowStart + x * bytesPerPixel;
      const tgtOff = rowStart + (width - 1 - x) * bytesPerPixel;
      for (let c = 0; c < bytesPerPixel; c++) {
        flippedData[tgtOff + c] = data[srcOff + c];
      }
    }
  }

  return Buffer.from(
    encode({
      width,
      height,
      data: flippedData,
      depth: (decoded.depth as 8) ?? 8,
      channels,
    }),
  );
}
