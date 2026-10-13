import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { assertW4GelatoPrintInput, type W4GelatoPrintInput } from './w4-gelato-print-input';

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const POINTS_PER_MM = 72 / 25.4;
const MIN_PRINT_DPI = 300;
export const MAX_GELATO_PNG_SOURCE_BYTES = 64_000_000;
const MAX_DECODED_PNG_BYTES = 100_000_000;

type PngImage = {
  bytes: Uint8Array;
  width: number;
  height: number;
  bitDepth: number;
  colorType: 0 | 2;
  idat: Uint8Array;
};

type PageSpec = {
  label: string;
  key: string | null;
  widthMm: number;
  heightMm: number;
};

export type GelatoPrintPdfArtifact = {
  key: string;
  url: string;
  pageCount: number;
  sourceImageBytes: number;
  sourceFingerprint: string;
};

type Dependencies = {
  loadImage: (key: string) => Promise<Uint8Array>;
  putObject: (key: string, body: ReadableStream<Uint8Array>) => Promise<void>;
  headObject?: (key: string) => Promise<boolean>;
  assertOwnership?: () => Promise<void>;
};

function readUint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

const PNG_CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1) crc = PNG_CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function parsePng(bytes: Uint8Array, label: string): PngImage {
  if (bytes.byteLength > MAX_GELATO_PNG_SOURCE_BYTES) {
    throw new Error(`Gelato ${label} PNG exceeds the source image size limit`);
  }
  if (bytes.length < 33 || !PNG_SIGNATURE.every((value, index) => bytes[index] === value)) {
    throw new Error(`Gelato ${label} asset is not a PNG`);
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType: number | null = null;
  const idatChunks: Array<{ start: number; end: number }> = [];
  let offset = PNG_SIGNATURE.length;
  let sawHeader = false;
  let sawEnd = false;
  let sawIdat = false;
  let idatEnded = false;
  let sawPalette = false;

  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const typeOffset = offset + 4;
    const dataOffset = offset + 8;
    const nextOffset = dataOffset + length + 4;
    if (nextOffset > bytes.length) throw new Error(`Gelato ${label} PNG has a truncated chunk`);
    if ([0, 1, 2, 3].some((index) => {
      const value = bytes[typeOffset + index];
      return !((value >= 65 && value <= 90) || (value >= 97 && value <= 122));
    }) || (bytes[typeOffset + 2] >= 97 && bytes[typeOffset + 2] <= 122)) {
      throw new Error(`Gelato ${label} PNG has an invalid chunk type`);
    }
    const type = String.fromCharCode(bytes[typeOffset], bytes[typeOffset + 1], bytes[typeOffset + 2], bytes[typeOffset + 3]);
    const critical = bytes[typeOffset] >= 65 && bytes[typeOffset] <= 90;
    if (readUint32(bytes, dataOffset + length) !== crc32(bytes, typeOffset, dataOffset + length)) {
      throw new Error(`Gelato ${label} PNG has an invalid chunk checksum`);
    }
    if (!['IHDR', 'PLTE', 'IDAT', 'IEND'].includes(type) && critical) {
      throw new Error(`Gelato ${label} PNG uses an unsupported critical chunk`);
    }
    if (type === 'IHDR') {
      if (sawHeader || offset !== PNG_SIGNATURE.length || length !== 13) throw new Error(`Gelato ${label} PNG has an invalid header`);
      sawHeader = true;
      width = readUint32(bytes, dataOffset);
      height = readUint32(bytes, dataOffset + 4);
      bitDepth = bytes[dataOffset + 8];
      colorType = bytes[dataOffset + 9];
      if (bytes[dataOffset + 10] !== 0 || bytes[dataOffset + 11] !== 0 || bytes[dataOffset + 12] !== 0) {
        throw new Error(`Gelato ${label} PNG uses unsupported compression, filter, or interlace settings`);
      }
    } else if (type === 'IDAT') {
      if (!sawHeader || sawEnd || idatEnded) throw new Error(`Gelato ${label} PNG has invalid image data ordering`);
      sawIdat = true;
      idatChunks.push({ start: dataOffset, end: dataOffset + length });
    } else if (type === 'IEND') {
      if (length !== 0 || !sawHeader || !sawIdat || nextOffset !== bytes.length) throw new Error(`Gelato ${label} PNG has an invalid end chunk`);
      sawEnd = true;
      break;
    } else if (type === 'tRNS') {
      throw new Error(`Gelato ${label} PNG transparency is unsupported`);
    } else {
      if (sawIdat) idatEnded = true;
      if (type === 'PLTE') {
        if (colorType === 0 || sawIdat || sawPalette || length < 3 || length > 768 || length % 3 !== 0) {
          throw new Error(`Gelato ${label} PNG has an invalid palette chunk`);
        }
        sawPalette = true;
      }
    }
    offset = nextOffset;
  }

  if (!sawEnd || !width || !height || (colorType !== 0 && colorType !== 2) || bitDepth !== 8 || !idatChunks.length) {
    throw new Error(`Gelato ${label} PNG must be 8-bit grayscale or RGB without alpha`);
  }

  const idatLength = idatChunks.reduce((sum, chunk) => sum + chunk.end - chunk.start, 0);
  const idat = new Uint8Array(idatLength);
  let idatOffset = 0;
  for (const chunk of idatChunks) {
    const length = chunk.end - chunk.start;
    idat.set(bytes.subarray(chunk.start, chunk.end), idatOffset);
    idatOffset += length;
  }

  const colors = colorType === 0 ? 1 : 3;
  const rowLength = width * colors + 1;
  const decodedLength = rowLength * height;
  if (!Number.isSafeInteger(decodedLength) || decodedLength > MAX_DECODED_PNG_BYTES) {
    throw new Error(`Gelato ${label} PNG exceeds the decoded image size limit`);
  }
  let decoded: Uint8Array;
  try {
    decoded = inflateSync(idat, { maxOutputLength: decodedLength });
  } catch {
    throw new Error(`Gelato ${label} PNG image data is invalid`);
  }
  if (decoded.byteLength !== decodedLength) throw new Error(`Gelato ${label} PNG image data has an invalid decoded size`);
  for (let row = 0; row < height; row += 1) {
    if (decoded[row * rowLength] > 4) throw new Error(`Gelato ${label} PNG uses an invalid row filter`);
  }

  return { bytes, width, height, bitDepth, colorType, idat };
}

function assertResolution(image: PngImage, spec: PageSpec): void {
  const dpiX = image.width / (spec.widthMm / 25.4);
  const dpiY = image.height / (spec.heightMm / 25.4);
  if (dpiX < MIN_PRINT_DPI || dpiY < MIN_PRINT_DPI) {
    throw new Error(`Gelato ${spec.label} asset resolution is below ${MIN_PRINT_DPI} DPI`);
  }
  const sourceAspect = image.width / image.height;
  const targetAspect = spec.widthMm / spec.heightMm;
  if (Math.abs(sourceAspect / targetAspect - 1) > 0.005) {
    throw new Error(`Gelato ${spec.label} asset aspect ratio does not match its print canvas`);
  }
}

function mmToPt(value: number): number {
  return value * POINTS_PER_MM;
}

function pdfText(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export async function readGelatoPngResponse(response: Response): Promise<Uint8Array> {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_GELATO_PNG_SOURCE_BYTES) {
    throw new Error('Gelato print PNG exceeds the source image size limit');
  }
  if (!response.body) throw new Error('Gelato print PNG response has no body');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_GELATO_PNG_SOURCE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error('Gelato print PNG exceeds the source image size limit');
    }
    chunks.push(value);
  }
  return concatBytes(chunks);
}

function pngObjectBody(image: PngImage): Uint8Array {
  const colors = image.colorType === 0 ? 1 : 3;
  return concatBytes([
    pdfText(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace ${image.colorType === 0 ? '/DeviceGray' : '/DeviceRGB'} /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors ${colors} /BitsPerComponent 8 /Columns ${image.width} >> /Length ${image.idat.byteLength} >>\nstream\n`),
    image.idat,
    pdfText('\nendstream'),
  ]);
}

function pdfStream(pages: PageSpec[], loadImage: Dependencies['loadImage']): ReadableStream<Uint8Array> {
  let nextObjectId = 3;
  const objects = pages.map((page) => {
    const imageId = page.key ? nextObjectId++ : null;
    const contentId = nextObjectId++;
    const pageId = nextObjectId++;
    return { page, imageId, contentId, pageId };
  });
  const transform = new TransformStream<Uint8Array, Uint8Array>();
  const writer = transform.writable.getWriter();
  void (async () => {
      let offset = 0;
      const offsets = new Array<number>(nextObjectId).fill(0);
      const write = async (bytes: Uint8Array) => {
        await writer.write(bytes);
        offset += bytes.byteLength;
      };
      const writeObject = async (id: number, body: Uint8Array) => {
        offsets[id] = offset;
        await write(pdfText(`${id} 0 obj\n`));
        await write(body);
        await write(pdfText('\nendobj\n'));
      };

      try {
          await write(pdfText('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'));
          await writeObject(1, pdfText('<< /Type /Catalog /Pages 2 0 R >>'));
          await writeObject(2, pdfText(`<< /Type /Pages /Kids [${objects.map((entry) => `${entry.pageId} 0 R`).join(' ')}] /Count ${pages.length} >>`));

          for (const entry of objects) {
            const widthPt = mmToPt(entry.page.widthMm);
            const heightPt = mmToPt(entry.page.heightMm);
            if (entry.imageId && entry.page.key) {
              const image = parsePng(await loadImage(entry.page.key), entry.page.label);
              assertResolution(image, entry.page);
              await writeObject(entry.imageId, pngObjectBody(image));
            }

            const content = entry.imageId
              ? `q\n${widthPt.toFixed(6)} 0 0 ${heightPt.toFixed(6)} 0 0 cm\n/Im1 Do\nQ\n`
              : 'q\nQ\n';
            await writeObject(entry.contentId, concatBytes([
              pdfText(`<< /Length ${new TextEncoder().encode(content).byteLength} >>\nstream\n`),
              pdfText(content),
              pdfText('endstream'),
            ]));

            const resources = entry.imageId ? ` /Resources << /XObject << /Im1 ${entry.imageId} 0 R >> >>` : ' /Resources << >>';
            await writeObject(entry.pageId, pdfText(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt.toFixed(6)} ${heightPt.toFixed(6)}]${resources} /Contents ${entry.contentId} 0 R >>`));
          }

          const xrefOffset = offset;
          await write(pdfText(`xref\n0 ${nextObjectId}\n0000000000 65535 f \n`));
          for (let id = 1; id < nextObjectId; id += 1) {
            await write(pdfText(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`));
          }
          await write(pdfText(`trailer\n<< /Size ${nextObjectId} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`));
          await writer.close();
      } catch (error) {
        await writer.abort(error);
      }
  })();
  return transform.readable;
}

function normalizeKey(key: string, orderPrefix: string, label: string): string {
  const normalized = key.replace(/^\/+/, '');
  if (!normalized.startsWith(`${orderPrefix}/`) || normalized.includes('..') || normalized.includes('?')) {
    throw new Error(`Gelato ${label} asset key is outside the order prefix`);
  }
  return normalized;
}

function artifactFingerprint(input: W4GelatoPrintInput, imageDigests: string[]): string {
  const source = [
    input.orderPrefix,
    input.bookConfigVersion,
    input.runStamp,
    input.generatedAt,
    input.manifest3Key,
    input.coverPreviewImageKey,
    input.coverPreviewUrl,
    ...input.pagePreviewImageKeys,
    ...input.pageImageUrls,
    ...imageDigests,
  ].join('\n');
  return createHash('sha256').update(source).digest('hex').slice(0, 24);
}

export async function buildGelatoPrintPdf(
  input: W4GelatoPrintInput,
  backendUrl: string,
  dependencies: Dependencies,
): Promise<GelatoPrintPdfArtifact> {
  assertW4GelatoPrintInput(input);
  await dependencies.assertOwnership?.();
  const print = input.providerPrintConfig;
  if (input.pageImageUrls.length !== print.innerPageCount || input.pagePreviewImageKeys.length !== print.innerPageCount) {
    throw new Error('Gelato PDF assembly requires exactly one keyed raster per configured inner page');
  }
  if (input.expectedPageCount !== print.innerPageCount || input.pageLabels.length !== print.innerPageCount) {
    throw new Error('Gelato PDF assembly page plan does not match frozen inner page count');
  }

  const orderPrefix = input.orderPrefix.replace(/^\/+|\/+$/g, '');
  const coverKey = normalizeKey(input.coverPreviewImageKey, orderPrefix, 'cover');
  const pageKeys = input.pagePreviewImageKeys.map((key, index) => normalizeKey(key, orderPrefix, `page ${index + 1}`));
  const geometry = print.printGeometryMm;
  const pages: PageSpec[] = [
    { label: 'cover spread', key: coverKey, widthMm: geometry.coverCanvas.w, heightMm: geometry.coverCanvas.h },
    { label: 'blank front endpaper', key: null, widthMm: geometry.interiorCanvas.w, heightMm: geometry.interiorCanvas.h },
    ...pageKeys.map((key, index) => ({ label: input.pageLabels[index], key, widthMm: geometry.interiorCanvas.w, heightMm: geometry.interiorCanvas.h })),
    { label: 'blank back endpaper', key: null, widthMm: geometry.interiorCanvas.w, heightMm: geometry.interiorCanvas.h },
  ];
  if (pages.length !== print.expectedPdfPageCount) throw new Error('Gelato PDF page count does not match frozen expected page count');

  let sourceImageBytes = 0;
  const imageDigests: string[] = [];
  const digestByKey = new Map<string, string>();
  for (const page of pages) {
    if (!page.key) continue;
    const bytes = await dependencies.loadImage(page.key);
    const image = parsePng(bytes, page.label);
    assertResolution(image, page);
    sourceImageBytes += bytes.byteLength;
    const digest = createHash('sha256').update(bytes).digest('hex');
    imageDigests.push(`${page.key}:${digest}`);
    digestByKey.set(page.key, digest);
  }

  const fingerprint = artifactFingerprint(input, imageDigests);
  const configVersion = input.bookConfigVersion;
  if (!configVersion) throw new Error('Gelato PDF output requires a frozen book config version');
  const key = `${orderPrefix}/gelato/print/v${configVersion}/${fingerprint}.pdf`;
  const loadVerifiedImage = async (imageKey: string) => {
    const bytes = await dependencies.loadImage(imageKey);
    const actualDigest = createHash('sha256').update(bytes).digest('hex');
    if (actualDigest !== digestByKey.get(imageKey)) {
      throw new Error('Gelato print image changed during PDF assembly; retry with a fresh source snapshot');
    }
    return bytes;
  };
  await dependencies.assertOwnership?.();
  if (await dependencies.headObject?.(key)) {
    for (const imageKey of digestByKey.keys()) await loadVerifiedImage(imageKey);
  } else {
    await dependencies.putObject(key, pdfStream(pages, loadVerifiedImage));
  }

  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  const url = `${backendUrl.replace(/\/$/, '')}/api/pdf/${encodedKey}`;
  return { key, url, pageCount: pages.length, sourceImageBytes, sourceFingerprint: fingerprint };
}
