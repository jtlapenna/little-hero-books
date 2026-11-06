import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import { BookConfigSchema, type BookConfig } from './types';
import { validateBookRenderRecipe } from './book-render-recipe';
import { reconcileAsset, sha256, type AssetStore } from './immutable-asset-upload';

export const FINAL_ART_BOOK = 'book-finding-our-inner-voice';
export const FINAL_ART_ROLES = ['cover-background', 'page-06-background', 'page-07-background',
  'cover-logo', 'cover-barcode', 'cover-try-panel'] as const;
export type FinalArtRole = typeof FINAL_ART_ROLES[number];
const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const ConfigVersion = z.number().int().min(2).max(Number.MAX_SAFE_INTEGER);
const EntrySchema = z.object({
  taskId: z.enum(FINAL_ART_ROLES), source: z.string().min(1), sha256: Hash,
  r2Key: z.string(), dimensions: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  uploadApproved: z.literal(false),
}).strict();
export const FinalArtInventorySchema = z.object({
  schema: z.literal('lhb.final-art-candidate@v2'), bookId: z.literal(FINAL_ART_BOOK),
  configVersion: ConfigVersion, status: z.literal('LOCAL_REVIEW_ONLY'), uploadApproved: z.literal(false),
  configSource: z.string().min(1), configSha256: Hash, entries: z.array(EntrySchema).length(6),
}).strict();
const ApprovalSchema = z.object({
  schema: z.literal('lhb.final-art-upload-approval@v1'), bookId: z.literal(FINAL_ART_BOOK),
  configVersion: ConfigVersion, status: z.literal('APPROVED_FOR_UPLOAD'),
  inventorySha256: Hash, configSha256: Hash, approvedBy: z.string().trim().min(1),
  approvedAt: z.iso.datetime(), reviewReference: z.string().trim().min(1),
}).strict();
export type FinalArtInventory = z.infer<typeof FinalArtInventorySchema>;
export type ValidatedFinalArt = {
  inventory: FinalArtInventory; inventorySha256: string; config: BookConfig;
  bytes: Map<FinalArtRole, Uint8Array>;
};

function inside(root: string, path: string): boolean {
  return path.startsWith(root + sep);
}
function containedFile(root: string, source: string): string {
  if (source !== relative(root, resolve(root, source)).split(sep).join('/')) throw new Error('Expected a project-relative source path');
  const path = realpathSync(resolve(root, source));
  if (!inside(root, path)) throw new Error('Asset must be inside the project');
  return path;
}
export function finalArtKey(role: FinalArtRole, hash: string, version = 2): string {
  return `${FINAL_ART_BOOK}/v${ConfigVersion.parse(version)}/review-candidates/${hash}/${role}.png`;
}
async function pngDimensions(bytes: Uint8Array): Promise<[number, number]> {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!Buffer.from(bytes.subarray(0, 8)).equals(png)) throw new Error('Expected PNG bytes');
  const image = sharp(bytes, { failOn: 'warning', limitInputPixels: 100_000_000 });
  const metadata = await image.metadata();
  if (metadata.format !== 'png' || !metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1) throw new Error('Expected one PNG image');
  await image.raw().toBuffer();
  return [metadata.width, metadata.height];
}
function checkDraft(config: BookConfig): void {
  if (config.bookId !== FINAL_ART_BOOK || !ConfigVersion.safeParse(config.version).success || config.status !== 'draft') throw new Error('Expected Inner Voice draft, version 2 or later');
  for (const formatId of ['standard', 'amazon']) validateBookRenderRecipe(config, formatId);
}
function checkBindings(config: BookConfig, entries: FinalArtInventory['entries']): void {
  const keys = new Map(entries.map(entry => [entry.taskId, entry.r2Key]));
  const backgrounds = config.assets.backgrounds;
  for (const [slot, role] of [['covers', 'cover-background'], ['coversAmazon', 'cover-background'],
    ['page_06', 'page-06-background'], ['page_07', 'page-07-background']] as const) {
    if (backgrounds[slot] !== keys.get(role)) throw new Error(`Draft asset binding mismatch: ${slot}`);
    if (config.assets.guideBackgrounds?.[slot]) throw new Error(`Final artwork would be hidden by guide backgrounds: ${slot}`);
  }
  for (const role of ['cover-logo', 'cover-barcode', 'cover-try-panel'] as const) {
    if (config.assets.overlays[role] !== keys.get(role)) throw new Error(`Draft overlay binding mismatch: ${role}`);
  }
  for (const formatId of ['standard', 'amazon']) {
    const cover = config.rendering.recipe!.covers[formatId];
    for (const page of ['06', '07']) {
      if (config.formats[formatId].interior.pageSequence.find(value => value.id === `page-${page}`)?.backgroundSlot !== `page_${page}`) {
        throw new Error(`Unexpected final artwork page slot: ${formatId}/page-${page}`);
      }
    }
    if (cover.backgroundSlot !== (formatId === 'standard' ? 'covers' : 'coversAmazon')) throw new Error('Unexpected cover background slot');
    for (const role of ['cover-logo', 'cover-try-panel', 'cover-barcode']) {
      const count = cover.layers.filter(layer => layer.kind === 'overlay' && layer.assetSlot === role).length;
      if (count !== (role === 'cover-barcode' && formatId === 'standard' ? 0 : 1)) throw new Error(`Unexpected cover layer count: ${formatId}/${role}`);
    }
  }
}

/** Copy supplied art into a new local draft. Approval remains a separate decision. */
export async function prepareFinalArtCandidate(input: {
  root: string; output: string; configFile: string; recipeFile: string; assets: Record<FinalArtRole, string>;
}): Promise<string> {
  const root = realpathSync(input.root);
  const requestedOutput = resolve(input.output);
  // Require an existing parent so symlink containment is checked before any write.
  const parent = realpathSync(dirname(requestedOutput));
  if (parent !== root && !inside(root, parent)) throw new Error('Output parent must be inside the project');
  const output = resolve(parent, basename(requestedOutput));
  if (!inside(root, output)) throw new Error('Output must be inside the project');
  const config = BookConfigSchema.parse(JSON.parse(readFileSync(input.configFile, 'utf8')));
  checkDraft(config);
  const proposal = JSON.parse(readFileSync(input.recipeFile, 'utf8'));
  if (proposal.schema !== 'lhb.cover-candidate@v1' || proposal.status !== 'LOCAL_REVIEW_ONLY' ||
    Object.keys(proposal.covers ?? {}).sort().join(',') !== 'amazon,standard') throw new Error('Expected local cover recipe for both editions');
  config.rendering.recipe!.covers = proposal.covers;
  const entries: FinalArtInventory['entries'] = [];
  const bytes = new Map<FinalArtRole, Uint8Array>();
  for (const role of FINAL_ART_ROLES) {
    const data = readFileSync(input.assets[role]);
    const dimensions = await pngDimensions(data);
    const digest = sha256(data);
    entries.push({ taskId: role, source: relative(root, resolve(output, 'assets', `${role}.png`)).split(sep).join('/'),
      sha256: digest, r2Key: finalArtKey(role, digest, config.version), dimensions, uploadApproved: false });
    bytes.set(role, data);
  }
  const keys = Object.fromEntries(entries.map(entry => [entry.taskId, entry.r2Key]));
  Object.assign(config.assets.backgrounds, { covers: keys['cover-background'], coversAmazon: keys['cover-background'],
    page_06: keys['page-06-background'], page_07: keys['page-07-background'] });
  for (const role of ['cover-logo', 'cover-barcode', 'cover-try-panel']) config.assets.overlays[role] = keys[role];
  const parsed = BookConfigSchema.parse(config);
  checkDraft(parsed);
  checkBindings(parsed, entries);
  const configBytes = Buffer.from(JSON.stringify(parsed, null, 2) + '\n');
  const inventory = FinalArtInventorySchema.parse({ schema: 'lhb.final-art-candidate@v2', bookId: FINAL_ART_BOOK,
    configVersion: config.version, status: 'LOCAL_REVIEW_ONLY', uploadApproved: false,
    configSource: relative(root, resolve(output, 'authoring-draft.json')).split(sep).join('/'),
    configSha256: sha256(configBytes), entries });
  mkdirSync(output); // Exclusive creation. Existing files and directories must survive.
  mkdirSync(resolve(output, 'assets'));
  for (const entry of entries) writeFileSync(resolve(root, entry.source), bytes.get(entry.taskId)!, { flag: 'wx', mode: 0o600 });
  writeFileSync(resolve(output, 'authoring-draft.json'), configBytes, { flag: 'wx', mode: 0o600 });
  const inventoryFile = resolve(output, 'asset-inventory.json');
  writeFileSync(inventoryFile, JSON.stringify(inventory, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return inventoryFile;
}

export async function validateFinalArtCandidate(rootPath: string, inventoryFile: string): Promise<ValidatedFinalArt> {
  const root = realpathSync(rootPath);
  const file = realpathSync(inventoryFile);
  if (!inside(root, file)) throw new Error('Inventory must be inside the project');
  const raw = readFileSync(file);
  const inventory = FinalArtInventorySchema.parse(JSON.parse(raw.toString('utf8')));
  if (new Set(inventory.entries.map(entry => entry.taskId)).size !== 6 || new Set(inventory.entries.map(entry => entry.r2Key)).size !== 6) throw new Error('Expected six distinct art roles and keys');
  const directory = dirname(file);
  const configFile = containedFile(root, inventory.configSource);
  if (configFile !== resolve(directory, 'authoring-draft.json')) throw new Error('Draft must be beside inventory');
  const configBytes = readFileSync(configFile);
  if (sha256(configBytes) !== inventory.configSha256) throw new Error('Draft bytes changed');
  const config = BookConfigSchema.parse(JSON.parse(configBytes.toString('utf8')));
  checkDraft(config);
  if (config.version !== inventory.configVersion) throw new Error('Inventory and draft versions differ');
  checkBindings(config, inventory.entries);
  const bytes = new Map<FinalArtRole, Uint8Array>();
  for (const entry of inventory.entries) {
    if (entry.r2Key !== finalArtKey(entry.taskId, entry.sha256, inventory.configVersion)) throw new Error(`Unsafe candidate asset key: ${entry.taskId}`);
    const path = containedFile(root, entry.source);
    if (path !== resolve(directory, 'assets', `${entry.taskId}.png`)) throw new Error('Assets must belong to this candidate');
    const data = readFileSync(path);
    if (sha256(data) !== entry.sha256) throw new Error(`Asset bytes changed: ${entry.taskId}`);
    const dimensions = await pngDimensions(data);
    if (dimensions.some((value, index) => value !== entry.dimensions[index])) throw new Error(`PNG dimensions changed: ${entry.taskId}`);
    bytes.set(entry.taskId, data);
  }
  return { inventory, inventorySha256: sha256(raw), config, bytes };
}

/** Validate all local inputs and approval before accessing a store. */
export async function reconcileFinalArtCandidate(input: {
  root: string; inventoryFile: string; approvalFile: string; write: boolean; store: () => Promise<AssetStore>;
}): Promise<Record<string, string>> {
  const candidate = await validateFinalArtCandidate(input.root, input.inventoryFile);
  const approval = ApprovalSchema.parse(JSON.parse(readFileSync(input.approvalFile, 'utf8')));
  if (approval.configVersion !== candidate.inventory.configVersion || approval.inventorySha256 !== candidate.inventorySha256 || approval.configSha256 !== candidate.inventory.configSha256) throw new Error('Approval does not match version, inventory and draft bytes');
  const store = await input.store();
  const results: Record<string, string> = {};
  const approved = candidate.inventory.entries.map(entry => ({ ...entry, uploadApproved: true }));
  for (const entry of approved) results[entry.taskId] = await reconcileAsset(store, entry, candidate.bytes.get(entry.taskId)!, FINAL_ART_BOOK, candidate.inventory.configVersion, false);
  if (input.write) for (const entry of approved) results[entry.taskId] = await reconcileAsset(store, entry, candidate.bytes.get(entry.taskId)!, FINAL_ART_BOOK, candidate.inventory.configVersion, true);
  return results;
}
