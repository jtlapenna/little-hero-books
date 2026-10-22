import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import { downloadAndExtractCustomizationZip, CUSTOMIZATION_ZIP_LIMITS as LIMITS } from '../src/lib/zip-downloader';
import { parseAmazonCustomization } from '../src/lib/amazon-customization-parser';

export function archive(files: Array<[string, Buffer, number?]>): Buffer {
  const zip = new AdmZip(undefined, { noSort: true });
  for (const [name, bytes, method] of files) { zip.addFile(name, bytes); if (method !== undefined) zip.getEntry(name)!.header.method = method; }
  return zip.toBuffer();
}
export const amazonV3 = { 'version3.0': { customizationInfo: { surfaces: [{ areas: [{ label: "Child's First Name", text: 'Synthetic Child' }, { label: "Child's Age", optionValue: '5' }] }] } } };
export const amazonNested = { customizationData: { children: [{ children: [{ children: [{ children: [{ label: 'Child Name', inputValue: 'Synthetic Child' }] }, { label: 'Age', displayValue: '5' }] }] }] } };
function descriptorZip(input: Buffer, signed: boolean): Buffer {
  const end = input.length - 22, central = input.readUInt32LE(end + 16), descriptor = Buffer.alloc(signed ? 16 : 12);
  let cursor = 0;
  if (signed) { descriptor.writeUInt32LE(0x08074b50);cursor = 4; }
  for (const [i, field] of [16, 20, 24].entries()) descriptor.writeUInt32LE(input.readUInt32LE(central + field), cursor + i * 4);
  const output = Buffer.concat([input.subarray(0, central), descriptor, input.subarray(central)]), newCentral = central + descriptor.length, newEnd = end + descriptor.length;
  output.writeUInt16LE(output.readUInt16LE(6) | 8, 6);output.fill(0, 14, 26);
  output.writeUInt16LE(output.readUInt16LE(newCentral + 8) | 8, newCentral + 8);output.writeUInt32LE(newCentral, newEnd + 16);
  return output;
}
function mutate(input: Buffer, fn: (buffer: Buffer, central: number, end: number) => void) {
  const b = Buffer.from(input), end = b.length - 22; fn(b, b.readUInt32LE(end + 16), end); return b;
}

async function main() {
  const originalFetch = globalThis.fetch, originalLog = console.log, originalWarn = console.warn, originalError = console.error;
  const logs: string[] = [], marker = 'SYNTHETIC_PRIVATE_ARCHIVE_DIAGNOSTIC_76281';
  let signal: AbortSignal | undefined, factory: () => Response | Promise<Response>, checks = 0, fetches = 0;
  const capture = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };
  console.log = capture;console.warn = capture;console.error = capture;
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);assert.equal(url, 'https://download.example.test/synthetic.zip');
    assert.match(new Headers(init?.headers).get('user-agent')!, /Mozilla/);signal = init?.signal ?? undefined;fetches++;return factory();
  };
  const run = () => downloadAndExtractCustomizationZip('https://download.example.test/synthetic.zip');
  function serve(bytes: Buffer, headers: Record<string, string> = {}) {
    let offset = 0, pulls = 0, canceled = false;
    const response = new Response(new ReadableStream<Uint8Array>({ pull(c) { pulls++;if (offset < bytes.length) c.enqueue(new Uint8Array(bytes.subarray(offset, offset += 65536)));else c.close(); }, cancel() { canceled = true; } }, { highWaterMark: 0 }), { headers });
    factory = () => response;return { pulls: () => pulls, canceled: () => canceled };
  }
  async function reject(bytes: Buffer, expected: RegExp = /customization ZIP|Customization ZIP|Customization JSON/, headers: Record<string, string> = {}) {
    serve(bytes, headers);await assert.rejects(run(), e => e instanceof Error && expected.test(e.message) && !e.message.includes(marker));assert.ok(!logs.join('\n').includes(marker));checks++;
  }
  try {
    const valid = archive([['customization.json', Buffer.from(JSON.stringify(amazonV3))]]);
    for (const fixture of [amazonV3, amazonNested]) for (const method of [0, 8]) {
      serve(archive([['customization.json', Buffer.from(JSON.stringify(fixture)), method]]));const data = await run();assert.deepEqual(data, fixture);assert.equal(parseAmazonCustomization(data)?.childName, 'Synthetic Child');checks++;
    }
    for (const signed of [false, true]) { serve(descriptorZip(valid, signed));assert.deepEqual(await run(), amazonV3);checks++; }
    const ordinary = new AdmZip(undefined, { noSort: true });ordinary.addFile('assets/', Buffer.alloc(0));ordinary.addFile('assets/mañana.json', Buffer.from(JSON.stringify(amazonV3)));ordinary.addZipComment('Ordinary archive comment');ordinary.getEntry('assets/mañana.json')!.comment = 'Ordinary entry comment';ordinary.getEntry('assets/mañana.json')!.extra = Buffer.from([0xfe, 0xca, 2, 0, 1, 2]);
    serve(ordinary.toBuffer());assert.deepEqual(await run(), amazonV3);checks++;
    const ordered = archive([['first.json', Buffer.from('{"selected":1}')], ['later.json', Buffer.from('{"selected":2}')]]), central = ordered.readUInt32LE(ordered.length - 22 + 16), firstLength = 46 + ordered.readUInt16LE(central + 28) + ordered.readUInt16LE(central + 30) + ordered.readUInt16LE(central + 32);
    const reordered = Buffer.concat([ordered.subarray(0, central), ordered.subarray(central + firstLength, ordered.length - 22), ordered.subarray(central, central + firstLength), ordered.subarray(ordered.length - 22)]);serve(reordered);assert.deepEqual(await run(), { selected: 2 });checks++;
    serve(archive([['z-first.json', Buffer.from('{"selected":1}')], ['a-later.json', Buffer.from('{"selected":2}')]]));assert.deepEqual(await run(), { selected: 1 });checks++;
    const exactJson = Buffer.from('"' + 'x'.repeat(LIMITS.jsonBytes - 2) + '"');serve(archive([['a.json', exactJson]]));assert.equal((await run() as string).length, LIMITS.jsonBytes - 2);checks++;
    await reject(archive([['a.json', Buffer.from('"' + 'x'.repeat(LIMITS.jsonBytes - 1) + '"')]]), /JSON exceeds limit/);
    const emptyFiles: Array<[string, Buffer]> = Array.from({ length: LIMITS.entries - 1 }, (_, i) => [`asset-${i}.bin`, Buffer.alloc(0)]);
    serve(archive([['a.json', Buffer.from('{}')], ...emptyFiles]));assert.deepEqual(await run(), {});checks++;
    await reject(archive([['a.json', Buffer.from('{}')], ...emptyFiles, ['last.bin', Buffer.alloc(0)]]), /too many entries/);
    serve(archive([['x/'.repeat(LIMITS.pathSeparators) + 'a.json', Buffer.from('{}')]]));assert.deepEqual(await run(), {});checks++;
    await reject(archive([['x/'.repeat(LIMITS.pathSeparators + 1) + 'a.json', Buffer.from('{}')]]), /path exceeds limit/);
    serve(archive([['x'.repeat(LIMITS.nameBytes - 5) + '.json', Buffer.from('{}')]]));assert.deepEqual(await run(), {});checks++;
    await reject(archive([['x'.repeat(LIMITS.nameBytes - 4) + '.json', Buffer.from('{}')]]));
    const base = archive([['a.json', Buffer.from('{}')], ['pad.bin', Buffer.alloc(0), 0]]), pad = LIMITS.downloadBytes - base.length;
    const exactDownload = archive([['a.json', Buffer.from('{}')], ['pad.bin', Buffer.alloc(pad), 0]]);assert.equal(exactDownload.length, LIMITS.downloadBytes);
    for (const headers of [{}, { 'content-length': '1' }, { 'content-length': String(exactDownload.length) }]) { serve(exactDownload, headers);assert.deepEqual(await run(), {});checks++; }
    for (const headers of [{}, { 'content-length': '1' }]) { const body = serve(Buffer.concat([exactDownload, Buffer.from(' ')]), headers);await assert.rejects(run(), /download exceeds limit/);assert.ok(body.canceled());assert.ok(signal?.aborted);checks++; }
    for (const declared of [String(LIMITS.downloadBytes + 1), '-1', 'invalid']) { const body = serve(valid, { 'content-length': declared });await assert.rejects(run(), /download exceeds limit or has invalid length/);assert.equal(body.pulls(), 0);assert.ok(body.canceled());checks++; }
    const bomb = archive([['a.json', Buffer.from('"' + 'x'.repeat(4 * 1024 * 1024) + '"')]]);
    for (const size of [0, 1, LIMITS.jsonBytes]) await reject(mutate(bomb, (b, c) => { b.writeUInt32LE(size, c + 24);b.writeUInt32LE(size, 22); }));
    await reject(mutate(valid, (b, c) => { b.writeUInt32LE(b.readUInt32LE(c + 24) + 1, c + 24);b.writeUInt32LE(b.readUInt32LE(22) + 1, 22); }));
    const stored = archive([['a.json', Buffer.from('{}junk'), 0]]);
    await reject(mutate(stored, (b, c) => { b.writeUInt32LE(2, c + 24);b.writeUInt32LE(2, 22); }));
    await reject(mutate(valid, (b, c) => { b.writeUInt32LE(0, c + 16);b.writeUInt32LE(0, 14); }));
    await reject(mutate(valid, (b, c) => { b.writeUInt32LE(b.length * 2, c + 20);b.writeUInt32LE(b.length * 2, 18); }));
    await reject(mutate(valid, (b, c) => { b.writeUInt32LE(c, c + 42); }));
    await reject(mutate(valid, (b, c) => { b.writeUInt16LE(b.readUInt16LE(c + 8) | 1, c + 8);b.writeUInt16LE(b.readUInt16LE(6) | 1, 6); }));
    await reject(mutate(valid, (b, c) => { b.writeUInt16LE(99, c + 10);b.writeUInt16LE(99, 8); }));
    await reject(mutate(valid, b => { b[30] ^= 1; }));
    await reject(mutate(valid, (b, _c, end) => { b.writeUInt16LE(1, end + 4); }));
    await reject(valid.subarray(0, valid.length - 2));await reject(Buffer.from(marker));
    await reject(archive([]), /No JSON/);await reject(archive([['asset.bin', Buffer.from('{}')]]), /No JSON/);
    await reject(archive([[marker + '.json', Buffer.from(marker)]]), /Invalid JSON/);
    let reads = 0, cancels = 0;
    factory = () => new Response(new ReadableStream({ pull() { reads++; }, cancel() { cancels++;return new Promise(() => {}); } }, { highWaterMark: 0 }), { status: 403, statusText: marker });
    await assert.rejects(run(), /^Error: Customization ZIP download failed \(HTTP 403\)$/);assert.equal(reads, 0);assert.equal(cancels, 1);assert.ok(signal?.aborted);checks++;
    factory = () => { throw new Error(marker); };await assert.rejects(run(), /^Error: Customization ZIP download failed$/);checks++;
    factory = () => new Response(null);await assert.rejects(run(), /Empty customization ZIP/);checks++;
    factory = () => new Response(new ReadableStream({ pull(c) { c.error(new Error(marker)); } }));await assert.rejects(run(), /^Error: Customization ZIP download failed$/);checks++;
    const originalTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((fn, ms, ...args) => originalTimeout(fn, ms === LIMITS.downloadMilliseconds ? 5 : ms, ...args)) as typeof setTimeout;
    try {
      factory = () => new Promise(() => {});const start = Date.now();await assert.rejects(run(), /download timed out/);assert.ok(Date.now() - start < 500);assert.ok(signal?.aborted);checks++;
      factory = () => new Promise((_, reject) => signal!.addEventListener('abort', () => reject(new Error(marker)), { once: true }));await assert.rejects(run(), /download timed out/);checks++;
      let canceled = false;
      factory = () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { canceled = true;return new Promise(() => {}); } }, { highWaterMark: 0 }));
      await assert.rejects(run(), /download timed out/);assert.ok(canceled);assert.ok(signal?.aborted);checks++;
    } finally { globalThis.setTimeout = originalTimeout; }
    for (const invalid of [null, 1, 'text', [], { 'version3.0': { customizationInfo: { surfaces: [{ areas: [{ label: 12 }] }] } } }]) { assert.equal(parseAmazonCustomization(invalid), null);checks++; }
    assert.ok(!logs.join('\n').includes(marker));originalLog(`Customization ZIP: ${checks} bounded synthetic cases passed; ${fetches} intercepted downloads, zero live requests`);
  } finally { globalThis.fetch = originalFetch;console.log = originalLog;console.warn = originalWarn;console.error = originalError; }
}
if (process.argv[1]?.endsWith('test-customization-zip.ts')) void main().catch(error => { console.error(error);process.exitCode = 1; });
