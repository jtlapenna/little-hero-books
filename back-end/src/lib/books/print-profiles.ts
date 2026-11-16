import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import srgb from './print-profiles/srgb.json';
import gracol from './print-profiles/gracol.json';
let cached: { srgb: Uint8Array; gracol: Uint8Array } | undefined;
/** Embed unaltered ICC bytes; compressed transport does not change either licensed profile. */
export function printColorProfiles() {
 if (!cached) {
  const load = (profile: typeof srgb, channels: string) => {
   const compressed = Buffer.from(profile.deflateBase64, 'base64');
   const original = inflateSync(compressed, { maxOutputLength: 3_000_000 });
   if (original.length !== profile.byteLength || original.readUInt32BE(0) !== original.length || original.toString('ascii', 36, 40) !== 'acsp' ||
       original.toString('ascii', 16, 20) !== channels || createHash('sha256').update(original).digest('hex') !== profile.sha256) throw Error('Print color profile integrity failure');
   return compressed;
  };
  cached = { srgb: load(srgb, 'RGB '), gracol: load(gracol, 'CMYK') };
 }
 return cached;
}
export const PRINT_PROFILE_SHA256 = { srgb: srgb.sha256, gracol: gracol.sha256 } as const;
