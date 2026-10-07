import { BookAssetKeySchema, type BookPageLayer } from './book-render-contract';
import { BookRenderSnapshotSchema, type BookConfig, type BookPageConfig, type BookRenderSnapshot } from './types';

const TOKENS = new Set(['child name', 'hometown', 'animal guide', 'animal clue', 'animal clues', 'object pronoun', 'subject pronoun', 'possessive pronoun', 'dedication message']);
export function pagePoseNumbers(page: Pick<BookPageConfig, 'poseNumber' | 'layers'>): number[] {
  return [...new Set([...(page.poseNumber == null ? [] : [page.poseNumber]), ...(page.layers ?? []).filter(l => l.kind === 'pose').map(l => l.poseNumber)])];
}
export function coverPoseNumbers(layers: BookPageLayer[]): number[] {
  return [...new Set(layers.filter(l => l.kind === 'pose').map(l => l.poseNumber))];
}
export function requiredRecipePoses(config: BookConfig, formatId: string): number[] {
  const format = config.formats[formatId];
  if (!format) throw new Error(`Unknown configured format ${formatId}`);
  const cover = config.rendering.recipe?.covers[formatId];
  return [...new Set([...format.interior.pageSequence.flatMap(pagePoseNumbers), ...coverPoseNumbers(cover?.layers ?? [])])].filter(n => n > 0).sort((a,b) => a-b);
}
export function validateBookRenderRecipe(config: BookConfig, formatId: string): void {
  const recipe = config.rendering.recipe;
  if (!recipe) {
    if (config.formats[formatId]?.interior.pageSequence.some(p => p.layers !== undefined)) throw new Error('Page layers require a configured render recipe');
    return;
  }
  if (config.assets.assetRoot !== config.bookId) throw new Error('Configured book asset root must match book ID');
  const format = config.formats[formatId];
  const cover = recipe.covers[formatId];
  if (!format || !cover) throw new Error(`Missing configured cover/format ${formatId}`);
  const slots = new Set<number>();
  for (const pose of Object.values(recipe.poses)) {
    if (slots.has(pose.poseNumber)) throw new Error(`Duplicate pose slot ${pose.poseNumber}`);
    slots.add(pose.poseNumber);
  }
  const key = (value: string | undefined, context: string) => {
    if (!value) throw new Error(`Missing configured asset: ${context}`);
    BookAssetKeySchema.parse(value);
    if (!value.startsWith(`${config.assets.assetRoot}/`)) throw new Error(`Configured asset outside book root: ${context}`);
  };
  for (const pose of Object.values(recipe.poses)) key(pose.referenceKey, 'pose reference');
  key(config.assets.fonts.primary, 'primary font');
  if (!Object.values(recipe.poses).some(pose => pose.poseNumber === 0)) key(`${config.assets.poses.basePath}/pose00.png`, 'implicit pose zero reference');
  const checkText = (text: string) => {
    for (const token of text.match(/\[[^\]]+\]/g) ?? []) if (!TOKENS.has(token.slice(1,-1).toLowerCase())) throw new Error(`Unknown copy token ${token}`);
  };
  const checkLayers = (layers: BookPageLayer[]) => {
    const ids = new Set<string>();
    for (const layer of layers) {
      if (ids.has(layer.id)) throw new Error(`Duplicate layer ID ${layer.id}`);
      ids.add(layer.id);
      if (layer.kind === 'pose') {
        const pose = recipe.poses[layer.poseId];
        if (!pose || pose.poseNumber !== layer.poseNumber) throw new Error(`Invalid named pose ${layer.poseId}`);
      } else if (layer.kind === 'overlay') key(config.assets.overlays[layer.assetSlot], layer.assetSlot);
      else {
        for (const animal of ['cat','dog','owl','lion','tiger','penguin','t-rex','unicorn']) key(recipe.animals[animal]?.[layer.role], `${animal}/${layer.role}`);
      }
    }
  };
  const pages = format.interior.pageSequence;
  const ids = new Set<string>();
  for (const page of pages) {
    if (ids.has(page.id)) throw new Error(`Duplicate page ID ${page.id}`);
    ids.add(page.id);
    if (page.backgroundSlot) key(config.assets.backgrounds[page.backgroundSlot], page.backgroundSlot);
    else if (page.type !== 'blank' && config.status !== 'draft') throw new Error(`Missing background slot ${page.id}`);
    const copy = recipe.copy[page.id];
    if (!copy && page.type !== 'blank' && config.status !== 'draft') throw new Error(`Missing configured copy ${page.id}`);
    if (copy) checkText(copy.text);
    checkLayers(page.layers ?? []);
    if (page.poseNumber !== null && !(page.layers ?? []).some(l => l.kind === 'pose' && l.poseNumber === page.poseNumber)) throw new Error(`Primary pose missing from layers on ${page.id}`);
  }
  key(config.assets.backgrounds[cover.backgroundSlot], cover.backgroundSlot);
  checkLayers(cover.layers);
  cover.texts.forEach(t => checkText(t.text));
  for (const number of requiredRecipePoses(config, formatId)) if (!config.qa.pose.requiredPoseNumbers.includes(number)) throw new Error(`Required pose ${number} missing from QA policy`);
}
export function validateRenderSnapshot(value: unknown, identity?: { bookId?: string | null; formatId?: string | null; version?: number | null }): BookRenderSnapshot {
  const snapshot = BookRenderSnapshotSchema.parse(value);
  const config = snapshot.bookConfig;
  if (!config.rendering.recipe) throw new Error('Render snapshot has no recipe');
  if ((identity?.bookId && identity.bookId !== config.bookId) || (identity?.formatId && identity.formatId !== snapshot.formatId) || (identity?.version != null && identity.version !== config.version)) throw new Error('Render snapshot identity mismatch');
  validateBookRenderRecipe(config, snapshot.formatId);
  return snapshot;
}
export function snapshotPoseReferenceKeys(snapshot: BookRenderSnapshot): Record<string,string> {
  const config = snapshot.bookConfig;
  return Object.fromEntries(Object.values(config.rendering.recipe!.poses).map(p => [String(p.poseNumber), p.referenceKey]));
}
export function resolveRecipePoseReference(config: BookConfig, poseNumber: number): string | null {
  const recipe = config.rendering.recipe;
  if (!recipe) return null;
  const pose = Object.values(recipe.poses).find(p => p.poseNumber === poseNumber);
  if (!pose && poseNumber !== 0) throw new Error(`Pose ${poseNumber} is not in the configured recipe`);
  return pose?.referenceKey ?? `${config.assets.poses.basePath}/pose00.png`;
}
