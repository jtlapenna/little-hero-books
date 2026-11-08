import assert from 'node:assert/strict';
import { loadBundledBookConfig } from '../src/lib/books/load-book-config';
import { resolvePreviewCanonicalsForConfig } from '../src/lib/preview-canonicals';
import { BookConfigSchema } from '../src/lib/books/types';

const config = BookConfigSchema.parse(loadBundledBookConfig({ bookId: 'book-finding-our-inner-voice', version: 1 }));
const resolve = (hairStyle: string) =>
  resolvePreviewCanonicalsForConfig({ skinTone: 'medium', clothingStyle: 'dress', hairStyle, hairColor: 'black' }, config);

// Amazon option labels use long-straight / short-straight while the chip names are straight-long / straight-short.
for (const [input, expected] of [
  ['long-straight', 'straight-long'],
  ['Long/Straight', 'straight-long'],
  ['short straight', 'straight-short'],
  ['short-straight', 'straight-short'],
  ['medium-straight', 'straight-medium'],
  ['long-curly', 'curly-long'],
  ['straight-long', 'straight-long'],
  ['curly-crop', 'curly-crop'],
  ['afro', 'afro'],
  ['not-a-style', 'side-part'],
] as const) {
  const resolved = resolve(input);
  assert.equal(resolved.hairStyleCanonical, expected, `hair style ${input}`);
  assert.ok(resolved.hairRefKey.endsWith(`/${expected}-black.jpg`), `hair chip for ${input}`);
}
console.log('Hair style aliases passed');
