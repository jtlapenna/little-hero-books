import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import { BookAssetKeySchema } from '../../src/lib/books/book-render-contract';
import { validateBookRenderRecipe } from '../../src/lib/books/book-render-recipe';
import { FINAL_ART_BOOK, FINAL_ART_ROLES, validateFinalArtCandidate } from '../../src/lib/books/final-art-candidate';
import { sha256 } from '../../src/lib/books/immutable-asset-upload';
import { BookConfigSchema, type BookConfig } from '../../src/lib/books/types';
import { ISOLATED_CONFIG_VERSIONS, IsolatedConfigVersionSchema } from './prepare-gelato-isolated-workflows';

const Hash = z.string().regex(/^[a-f0-9]{64}$/);
export const LocalProofAssetMapSchema = z.object({
  schema: z.literal('lhb.local-proof-assets@v1'),
  assets: z.record(BookAssetKeySchema, z.object({
    path: z.string().refine(isAbsolute, 'Expected an absolute local path'), sha256: Hash,
  }).strict()),
}).strict();
const UploadPlanSchema = z.object({
  schema: z.literal('lhb.inner-voice-v2-upload-plan@v1'), bookId: z.literal(FINAL_ART_BOOK),
  configVersion: z.literal(2), entries: z.array(z.object({
    taskId: z.string().min(1), source: z.string().min(1), r2Key: BookAssetKeySchema,
    sha256: Hash, uploadApproved: z.boolean(),
  }).passthrough()),
}).passthrough();
type LocalAsset = z.infer<typeof LocalProofAssetMapSchema>['assets'][string];

/** Exact file references only. Preview catalogs and generated order prefixes are separate inputs. */
export function configuredLocalAssetUses(config: BookConfig): Map<string, string[]> {
  const uses = new Map<string, string[]>();
  const add = (key: string, owner: string) => {
    BookAssetKeySchema.parse(key);
    if (!key.startsWith(config.bookId + '/')) throw new Error(`Asset outside book root: ${owner}`);
    uses.set(key, [...(uses.get(key) ?? []), owner]);
  };
  for (const kind of ['fonts', 'backgrounds', 'overlays'] as const) {
    for (const [slot, key] of Object.entries(config.assets[kind])) add(key, `assets.${kind}.${slot}`);
  }
  for (const [slot, guides] of Object.entries(config.assets.guideBackgrounds ?? {})) {
    for (const [guide, key] of Object.entries(guides)) add(key, `assets.guideBackgrounds.${slot}.${guide}`);
  }
  const recipe = config.rendering.recipe;
  if (!recipe) throw new Error('Local asset audit requires a configured render recipe');
  for (const [pose, value] of Object.entries(recipe.poses)) add(value.referenceKey, `recipe.poses.${pose}`);
  if (!Object.values(recipe.poses).some(pose => pose.poseNumber === 0)) add(`${config.assets.poses.basePath}/pose00.png`, 'implicit pose zero');
  for (const [guide, roles] of Object.entries(recipe.animals)) {
    for (const [role, key] of Object.entries(roles)) add(key, `recipe.animals.${guide}.${role}`);
  }
  return uses;
}

/** Read-only inputs, new local output. No environment loading, approval, network or asset copying. */
export async function prepareInnerVoiceLocalAssets(input: {
  root: string; configFile: string; assetMapFile: string; uploadPlanFile: string;
  sourceRoot: string; output: string; inventoryFile?: string;
}) {
  const root = realpathSync(input.root);
  const sourceRoot = realpathSync(input.sourceRoot);
  const parent = realpathSync(dirname(resolve(input.output)));
  if (parent !== root && !parent.startsWith(root + sep)) throw new Error('Output parent must be inside the project');
  const output = resolve(parent, basename(input.output));
  if (!output.startsWith(root + sep)) throw new Error('Output must be inside the project');
  const configBytes = readFileSync(input.configFile);
  const config = BookConfigSchema.parse(JSON.parse(configBytes.toString('utf8')));
  if (config.bookId !== FINAL_ART_BOOK || config.version < 2 || config.status !== 'draft') throw new Error('Expected an Inner Voice draft, version 2 or later');
  for (const format of ['standard', 'amazon']) validateBookRenderRecipe(config, format);
  const uses = configuredLocalAssetUses(config);
  const mapBytes = readFileSync(input.assetMapFile);
  const map = LocalProofAssetMapSchema.parse(JSON.parse(mapBytes.toString('utf8')));
  const planBytes = readFileSync(input.uploadPlanFile);
  const plan = UploadPlanSchema.parse(JSON.parse(planBytes.toString('utf8')));
  const assets = new Map<string, LocalAsset>(Object.entries(map.assets));
  const add = (key: string, value: LocalAsset) => {
    const existing = assets.get(key);
    if (existing && existing.sha256 !== value.sha256) throw new Error(`Conflicting local asset hashes: ${key}`);
    assets.set(key, value);
  };
  const planKeys = new Set<string>();
  const planTasks = new Set<string>();
  for (const entry of plan.entries) {
    if (planKeys.has(entry.r2Key) || planTasks.has(entry.taskId)) throw new Error('Duplicate upload-plan key or task');
    planKeys.add(entry.r2Key); planTasks.add(entry.taskId);
    if (!entry.r2Key.startsWith(`${FINAL_ART_BOOK}/v2/`)) throw new Error('Upload-plan asset outside its book/version');
    const path = realpathSync(resolve(sourceRoot, entry.source));
    if (entry.source !== relative(sourceRoot, resolve(sourceRoot, entry.source)).split(sep).join('/') || !path.startsWith(sourceRoot + sep)) {
      throw new Error('Upload-plan source must stay inside its source root');
    }
    if (sha256(readFileSync(path)) !== entry.sha256) throw new Error(`Upload-plan bytes changed: ${entry.taskId}`);
    add(entry.r2Key, { path, sha256: entry.sha256 });
  }
  let inventorySha256: string | null = null;
  if (input.inventoryFile) {
    const candidate = await validateFinalArtCandidate(root, input.inventoryFile);
    if (candidate.inventory.configSha256 !== sha256(configBytes)) throw new Error('Candidate does not match exact config bytes');
    inventorySha256 = candidate.inventorySha256;
    for (const entry of candidate.inventory.entries) add(entry.r2Key, { path: resolve(root, entry.source), sha256: entry.sha256 });
  }
  const resolved: Record<string, LocalAsset> = {};
  const missing: Array<{ key: string; uses: string[]; reason: string }> = [];
  for (const [key, owners] of [...uses].sort(([a], [b]) => a.localeCompare(b))) {
    const asset = assets.get(key);
    if (!asset || !existsSync(asset.path)) { missing.push({ key, uses: owners, reason: asset ? 'missing-file' : 'unmapped' }); continue; }
    const path = realpathSync(asset.path);
    if (sha256(readFileSync(path)) !== asset.sha256) throw new Error(`Local proof asset hash mismatch: ${key}`);
    resolved[key] = { path, sha256: asset.sha256 };
  }
  const outputMap = LocalProofAssetMapSchema.parse({ schema: 'lhb.local-proof-assets@v1', assets: resolved });
  const outputMapBytes = Buffer.from(JSON.stringify(outputMap, null, 2) + '\n');
  const report = {
    schema: 'lhb.inner-voice-local-asset-audit@v1', bookId: config.bookId, configVersion: config.version,
    status: 'LOCAL_REVIEW_ONLY', approved: false, uploadApproved: false, printReady: false,
    remoteChecked: false, liveRequests: 0, assetFilesCopied: 0,
    configSource: realpathSync(input.configFile), configSha256: sha256(configBytes),
    inputAssetMapSha256: sha256(mapBytes), uploadPlanSha256: sha256(planBytes), inventorySha256,
    localAssetMapSha256: sha256(outputMapBytes), declaredKeys: uses.size, resolvedKeys: Object.keys(resolved).length,
    localReferenceClosureComplete: missing.length === 0, missing,
    finalArtCandidateBound: inventorySha256 !== null,
    finalArtRolesAwaitingCandidate: inventorySha256 ? [] : [...FINAL_ART_ROLES],
    uploadPlan: { entries: plan.entries.length, locallyVerified: plan.entries.length,
      recordedApprovedEntries: plan.entries.filter(entry => entry.uploadApproved).length,
      unreferencedKeys: [...planKeys].filter(key => !uses.has(key)).sort() },
    isolatedProviderWorkflow: { configVersion: config.version, supportedConfigVersions: [...ISOLATED_CONFIG_VERSIONS],
      requiresExplicitVersionPacket: config.version !== 2, compatible: IsolatedConfigVersionSchema.safeParse(config.version).success, canExecute: false },
    excludedInputs: ['Preview picker catalogs/prefixes', 'Actual generated W2 outputs', 'Hosted asset presence and version eligibility'],
    limits: ['Byte hashes only; media decoding and rendered/PDF preflight remain separate',
      'Map references mutable local files; proof exporter must recheck and freeze bytes',
      'Candidate binding and upload-plan flags do not approve artwork or authorize external actions'],
    references: Object.fromEntries(uses),
  };
  mkdirSync(output, { mode: 0o700 });
  writeFileSync(resolve(output, 'local-asset-map.json'), outputMapBytes, { flag: 'wx', mode: 0o600 });
  writeFileSync(resolve(output, 'asset-audit.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return { output, report };
}
