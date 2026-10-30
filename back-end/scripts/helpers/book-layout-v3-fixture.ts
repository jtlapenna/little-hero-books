import { configuredBookRaw } from '../configured-book-fixture';
export function rawV3() {
  const raw = configuredBookRaw();
  raw.rendering.recipe.schema = 'lhb.book-render@v3';
  for (const [id, copy] of Object.entries(raw.rendering.recipe.copy) as Array<[string, Record<string, unknown>]>) {
    Object.assign(copy, { id, lineHeight: 1.3, color: '#fff4d7', align: 'left', padding: 0 });
  }
  raw.rendering.recipe.copy['scene-a'] = [
    { ...raw.rendering.recipe.copy['scene-a'], id: 'first', text: '[child name possessive] path [hometown return].' },
    { ...raw.rendering.recipe.copy['scene-b'], id: 'second', text: '[subject pronoun] saw [animal guide].' },
  ];
  for (const guide of ['cat', 'dog', 'owl', 'lion', 'tiger', 'penguin', 't-rex', 'unicorn']) {
    raw.rendering.recipe.animals[guide] = { trail: `${raw.bookId}/overlays/${guide}-trail.png` };
  }
  for (const format of Object.values(raw.formats) as Array<{ interior: { pageSequence: Array<Record<string, any>> } }>) {
    format.interior.pageSequence[1].layers[0].placement = { left: 893, top: 1836, width: 920, rotateDeg: 20, flipX: true,
      layout: { units: 'px', referenceCanvas: { w: 2550, h: 2550 }, rounding: 'nearest', anchorXPercent: 50, anchorYPercent: 100, originXPercent: 50, originYPercent: 50 } };
    format.interior.pageSequence[1].layers.push({ id: 'trail', kind: 'animal', role: 'trail', placement: { left: 0, top: 0, width: 100,
      layout: { units: 'percent' } } });
  }
  raw.rendering.recipe.covers.standard.stacks = [{ id: 'back', placement: { left: 0, top: 200, width: 2200, layout: { units: 'px', scale: 0.8 } },
    children: [{ kind: 'text', id: 'back-text', text: 'For [child name]', fontSize: 80, lineHeight: 1.3, color: '#fff4d7', align: 'center', padding: 0 }] }];
  return raw;
}
