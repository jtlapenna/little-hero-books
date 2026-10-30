import { BOOK_COPY_TOKENS } from './book-render-contract';
import type { BookConfig } from './types';

/** Cross-field rules shared by loaders and frozen snapshots. No storage access. */
export function assertBookConfigSemantics(config: BookConfig): void {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(config.bookId)) {
    throw new Error('Book ID must be a safe namespace');
  }
  if (config.assets.assetRoot !== config.bookId) {
    throw new Error('Book asset root must match book ID');
  }
  const assetKey = (key: string, context: string, token?: 'orderId' | 'characterHash') => {
    const expanded = token ? key.replaceAll(`{${token}}`, 'IDENTITY') : key;
    if (!expanded.startsWith(`${config.bookId}/`) ||
        /[\\\x00-\x1f?#%{}]/.test(expanded) ||
        expanded.split('/').some(part => part === '' || part === '.' || part === '..')) {
      throw new Error(`Invalid book asset namespace: ${context}`);
    }
  };
  for (const [name, key] of Object.entries(config.assets.fonts)) assetKey(key, `font ${name}`);
  if (!config.assets.fonts.primary) throw new Error('Book requires a primary font');
  for (const [name, key] of Object.entries(config.assets.backgrounds)) assetKey(key, `background ${name}`);
  for (const [name, key] of Object.entries(config.assets.overlays)) assetKey(key, `overlay ${name}`);
  assetKey(config.assets.poses.basePath, 'pose base');
  for (const [name, key] of Object.entries(config.assets.poses.skinToneVariantPaths)) {
    assetKey(key, `pose variant ${name}`);
  }
  for (const [name, key] of Object.entries(config.assets.preview ?? {})) assetKey(key, `preview ${name}`);
  assetKey(config.assets.generated.orderPrefix, 'generated order prefix', 'orderId');
  assetKey(config.assets.generated.characterBasePrefix, 'generated character prefix', 'characterHash');
  if (!config.assets.generated.orderPrefix.includes('{orderId}') ||
      !config.assets.generated.characterBasePrefix.includes('{characterHash}')) {
    throw new Error('Generated book paths require their identity placeholders');
  }
  if (!Object.hasOwn(config.formats, config.defaultFormatId)) throw new Error('Default book format is missing');
  for (const [formatId, format] of Object.entries(config.formats)) {
    if (formatId !== format.formatId) throw new Error('Book format key does not match formatId');
    const pages = format.interior.pageSequence;
    if (format.interior.expectedPageCount !== pages.length) throw new Error('Book page count does not match sequence');
    const ids = new Set<string>();
    const labels = new Set<string>();
    pages.forEach((page, index) => {
      if (page.index !== index || ids.has(page.id) || labels.has(page.label)) {
        throw new Error('Book page indexes, IDs and labels must be unique and sequential');
      }
      ids.add(page.id);
      labels.add(page.label);
      if (page.backgroundSlot && !Object.hasOwn(config.assets.backgrounds, page.backgroundSlot)) {
        throw new Error(`Missing book background slot: ${page.backgroundSlot}`);
      }
      if (page.overlaySlot && !Object.hasOwn(config.assets.overlays, page.overlaySlot)) {
        throw new Error(`Missing book overlay slot: ${page.overlaySlot}`);
      }
    });
    // bleedIn is the full canvas size in the existing contract, not a margin.
    const epsilon = 1e-6;
    if (format.bleedIn.w + epsilon < format.trimIn.w || format.bleedIn.h + epsilon < format.trimIn.h ||
        format.cover.spreadSizeIn.w + epsilon < format.trimIn.w * 2 ||
        format.cover.spreadSizeIn.h + epsilon < format.trimIn.h) {
      throw new Error('Book canvas cannot be smaller than its trim or cover panels');
    }
    for (const id of Object.values(format.templates)) {
      if (!id.trim()) throw new Error('Book template identifier is empty');
    }
  }
  const title = config.intake?.titleTemplate;
  if (title) {
    const stripped = title.replace(/\[([^\[\]]+)\]/g, (_token, name: string) => {
      if (!BOOK_COPY_TOKENS.has(name.toLowerCase())) throw new Error(`Unknown book title token: ${name}`);
      return '';
    });
    if (/[\[\]]/.test(stripped) || /<\/?[a-z!][^>]*>/i.test(title)) {
      throw new Error('Book title template must contain plain text and supported tokens');
    }
  }
}
