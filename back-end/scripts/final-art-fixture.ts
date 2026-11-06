import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { FINAL_ART_ROLES, type FinalArtRole } from '../src/lib/books/final-art-candidate';
import { loadBundledBookConfig } from '../src/lib/books/load-book-config';

/** Synthetic pixels and recipe. Never evidence of artwork approval. */
export async function finalArtFixture(directory: string, version = 2) {
  const config = structuredClone(loadBundledBookConfig({ bookId: 'book-finding-our-inner-voice', version: 2 }));
  config.version = version;
  const recipe = config.rendering.recipe!;
  if (recipe.schema !== 'lhb.book-render@v1') throw new Error('Final art fixture requires a v1 recipe');
  const guides = ['cat', 'dog', 'owl', 'lion', 'tiger', 'penguin', 't-rex', 'unicorn'];
  config.assets.guideBackgrounds = { page_09: Object.fromEntries(guides.map(guide => [guide, `${config.bookId}/v2/backgrounds/${guide}.png`])) };
  config.assets.guideBackgroundRequiredSlots = ['page_09'];
  const original = recipe.copy['page-05'];
  const block = Array.isArray(original) ? original[0] : original;
  const defaultPlacement = { ...block.placement };
  delete defaultPlacement.zIndex;
  recipe.copy['page-05'] = [{ ...block, id: 'fixture-name', text: '[Child Name] listened.', fontSize: 80, edgeStyle: 'soft-shadow',
    placement: defaultPlacement, longName: { minChars: 15, fontSize: 52, keepNameTogether: true,
      placement: { ...defaultPlacement, zIndex: 1 } } },
  { ...block, id: 'fixture-second', text: 'Then a quiet breath.', placement: { ...block.placement, top: 300 }, edgeStyle: 'stroke' }];
  recipe.readingAreas = { 'page-05': [{ left: 50, top: 50, width: 2000, height: 600, color: '#10243c', opacity: 0.4, feather: 40 }] };
  const proposal = { schema: 'lhb.cover-candidate@v1', status: 'LOCAL_REVIEW_ONLY', covers: structuredClone(recipe.covers) };
  for (const formatId of ['standard', 'amazon']) {
    const cover = proposal.covers[formatId];
    cover.layers = cover.layers.filter(layer => layer.kind === 'pose');
    for (const [index, role] of ['cover-logo', 'cover-try-panel', ...(formatId === 'amazon' ? ['cover-barcode'] : [])].entries()) {
      cover.layers.push({ id: role, kind: 'overlay', assetSlot: role,
        placement: { left: 200, top: 1300 + index * 200, width: 800, height: 150, zIndex: 60 }, effect: 'cover-shadow' });
    }
    cover.texts = [{ id: 'fixture-cover-name', text: '[Child Name]', fontSize: 100, lineHeight: 1.2,
      placement: { left: 200, top: 400, width: 2200, zIndex: 50 }, color: '#fff4d7', align: 'center', padding: 0,
      edgeStyle: 'cover-shadow', nameFit: { thresholdChars: 15, minScale: 0.5 } }];
  }
  mkdirSync(resolve(directory, 'inputs'));
  const assets = {} as Record<FinalArtRole, string>;
  for (const [index, role] of FINAL_ART_ROLES.entries()) {
    const path = resolve(directory, 'inputs', `${role}.png`);
    await sharp({ create: { width: 12, height: 12, channels: 4, background: { r: 20 + index * 30, g: 90, b: 140, alpha: 1 } } }).png().toFile(path);
    assets[role] = path;
  }
  const configFile = resolve(directory, 'inputs', 'config.json');
  const recipeFile = resolve(directory, 'inputs', 'recipe.json');
  writeFileSync(configFile, JSON.stringify(config));
  writeFileSync(recipeFile, JSON.stringify(proposal));
  return { configFile, recipeFile, assets };
}
