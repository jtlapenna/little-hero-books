/** Isolated, insert-last copy of an approved admin test book. Never queues or generates. */
import { usesRightFacingInnerVoicePoses } from '../pose-auto-flip';
import { createHash } from 'node:crypto';
import { adminWorkflowTestAdmission, adminWorkflowTestPreparationRequested, createAdminWorkflowTestAdmission } from '../admin-workflow-test';
import { bookReviewOwnershipIssue } from '../book-review-ownership';
import { inspectBookAssemblyQueue } from '../book-assembly-queue';
import { calculateCharacterHash } from '../character-hash';
import { buildBaseCharacterAssetKey, buildGeneratedPoseAssetKey, buildBgRemovedPoseAssetKey, extractManifestKey } from '../order-paths';
import { buildW0OrderUpsertPayload } from '../w0-manifest-builder';
import { BookConfigSchema, RunManifestV3Schema, type BookConfig } from './types';
import { buildW0RunManifestFromConfig } from './build-run-manifest';
import { buildW3AssemblyInput } from './w3-assembly-input';
import { resolveFrozenPrintRouting } from './print-routing';
import { computeBookConfigChecksum } from './runtime-book-config';
import { stableBookValue } from './book-legacy-compatibility';
import { FROZEN_PRINT_FIELDS } from './print-assignment';
import { validateBookRenderRecipe } from './book-render-recipe';

type Row = Record<string, unknown>;
type Bucket = 'assets' | 'orders';
const BOOK = 'book-finding-our-inner-voice';
const MARKER = '_updated_test_book_copy';
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const json = (value: unknown) => encoder.encode(stableBookValue(value));
const digest = (value: unknown) => sha(json(value));
const record = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const text = (value: unknown): string => typeof value === 'string' ? value : '';
export class UpdatedBookConflict extends Error {}
function requireCopy(condition: unknown, message: string): asserts condition { if (!condition) throw new UpdatedBookConflict(message); }

export interface UpdatedBookCopyPorts {
  loadOrder(orderId: string): Promise<Row | null>;
  loadConfig(): Promise<BookConfig>;
  readObject(bucket: Bucket, key: string): Promise<Uint8Array | null>;
  createObject(bucket: Bucket, key: string, bytes: Uint8Array, contentType: string): Promise<boolean>;
  insertOrder(row: Row): Promise<void>;
  now(): Date;
}
export interface UpdatedBookCopyRequest {
  sourceOrderId: string; expectedUpdatedAt: string; configChecksum: string; dedicationText: string; actor: string;
}
export interface UpdatedBookCopyResult {
  orderId: string; orderDbId: number; configVersion: number; reused: boolean; canAssemble: boolean;
}
function eligible(row: Row, orderId: string) {
  requireCopy(row.orderId === orderId && Number.isSafeInteger(row.id) && Number(row.id) > 0, 'Exact source book identity unavailable');
  requireCopy(adminWorkflowTestAdmission(row), 'Only an admitted single-copy Inner Voice Amazon workflow test can be copied');
  requireCopy(row.root_order_id === orderId && (!row.amazon_order_id || row.amazon_order_id === orderId), 'Source must be an independent test order');
  requireCopy(!bookReviewOwnershipIssue(row) && row.execution_status === 'done', 'Finish the active workflow or resolve its hold before copying');
  requireCopy(!adminWorkflowTestPreparationRequested(row) && (!row.next_workflow || row.next_workflow === '4'), 'Print preparation or another workflow is queued');
  const reviews = record(row.review_stages);
  requireCopy(record(reviews.preBria).status === 'approved' && record(reviews.postBria).status === 'approved', 'Approve poses and background removal before copying');
}
async function requiredObject(ports: UpdatedBookCopyPorts, bucket: Bucket, key: string) {
  const bytes = await ports.readObject(bucket, key);
  requireCopy(bytes && bytes.byteLength > 0, 'Required book artifact unavailable: ' + key);
  return bytes;
}
function imageContentType(bytes: Uint8Array): string {
  if ([137,80,78,71,13,10,26,10].every((value,index) => bytes[index] === value)) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  requireCopy(false, 'Accepted image must contain PNG or JPEG bytes');
}
function parse(bytes: Uint8Array): Row { return record(JSON.parse(decoder.decode(bytes))); }
async function loadContext(orderId: string, ports: UpdatedBookCopyPorts) {
  requireCopy(/^[A-Za-z0-9_-]{1,150}$/.test(orderId), 'Invalid source book identifier');
  const row = await ports.loadOrder(orderId); requireCopy(row, 'Source book unavailable'); eligible(row, orderId);
  const prefix = `${BOOK}/orders/${orderId}`;
  requireCopy(extractManifestKey(text(row.one_manifest_url)) === `${prefix}/manifests/1-manifest.json` &&
    extractManifestKey(text(row.manifest_2a_url)) === `${prefix}/manifests/2a-manifest.json` &&
    extractManifestKey(text(row.manifest_2b_url)) === `${prefix}/manifests/2b-manifest.json`, 'Source manifest pointers must be canonical');
  const rawW0 = await requiredObject(ports, 'orders', `${prefix}/manifests/1-manifest.json`);
  const w0 = RunManifestV3Schema.parse(parse(rawW0));
  const routing = resolveFrozenPrintRouting({ ...row, id: Number(row.id), orderId }, w0);
  const assignment = buildW0OrderUpsertPayload({ normalizedInput: { orderId, characterHash: text(row.character_hash) }, manifest: w0, manifestKey: w0.artifacts.manifestKey });
  requireCopy(FROZEN_PRINT_FIELDS.every(field => row[field] === assignment[field]), 'Source frozen print assignment differs from its intake');
  requireCopy(routing.bookId === BOOK && routing.formatId === 'amazon' && w0.book.resolved.renderSnapshot, 'Source requires its frozen configured Amazon book');
  const config = BookConfigSchema.parse(await ports.loadConfig());
  requireCopy(config.bookId === BOOK && config.status === 'active' && config.version > w0.book.bookConfigRef.version, 'A newer published Inner Voice edition is required');
  validateBookRenderRecipe(config, 'amazon');
  const before = w0.book.resolved.renderSnapshot.bookConfig;
  requireCopy(!usesRightFacingInnerVoicePoses(config.bookId, config.version) || usesRightFacingInnerVoicePoses(before.bookId, before.version),
    'The new edition requires fresh poses 5 and 11. Start a new order to generate them.');
  for (const [oldValue, newValue] of [
    [before.rendering.recipe?.poses, config.rendering.recipe?.poses],
    [before.assets.poses, config.assets.poses], [before.assets.preview, config.assets.preview],
    [before.intake?.characterProfile, config.intake?.characterProfile],
    [before.qa.pose.requiredPoseNumbers, config.qa.pose.requiredPoseNumbers],
  ]) requireCopy(stableBookValue(oldValue) === stableBookValue(newValue), 'New edition changes the character generation contract; accepted images cannot be reused');
  requireCopy(text(row.character_hash) && w0.artifacts.characterPrefix?.endsWith('/' + row.character_hash), 'Frozen character identity mismatch');
  requireCopy(stableBookValue(row.character_specs) === stableBookValue(w0.input.characterSpecs), 'Source customization differs from frozen accepted character');
  return { row, w0, rawW0, prefix, config, checksum: computeBookConfigChecksum(config) };
}
export async function inspectUpdatedTestBookCopy(sourceOrderId: string, ports: UpdatedBookCopyPorts) {
  const context = await loadContext(sourceOrderId, ports);
  return { sourceOrderId, updatedAt: text(context.row.updated_at), configVersion: context.config.version,
    configChecksum: context.checksum, dedicationText: text(context.row.dedication_text) };
}
function entries(manifest: Row): Map<number, Row> {
  requireCopy(Array.isArray(manifest.entries), 'Missing accepted image entries');
  const pairs = manifest.entries.map(value => { const entry = record(value); requireCopy(Number.isSafeInteger(entry.poseNumber), 'Invalid accepted pose identity'); return [Number(entry.poseNumber), entry] as const; });
  requireCopy(new Set(pairs.map(([number]) => number)).size === pairs.length, 'Duplicate accepted pose identity');
  return new Map(pairs);
}
function sourceState(row: Row) {
  return Object.fromEntries(['id','orderId','root_order_id','amazon_order_id','updated_at','character_hash','character_specs','book_specs','review_stages','shipping_address','customer_name','customer_email'].map(key => [key, row[key] ?? null]));
}
interface Staged { bucket: Bucket; key: string; sha256: string }
async function stage(ports: UpdatedBookCopyPorts, bucket: Bucket, key: string, bytes: Uint8Array, type: string, staged: Staged[]) {
  await ports.createObject(bucket, key, bytes, type);
  requireCopy(sha(await requiredObject(ports, bucket, key)) === sha(bytes), 'An existing preparation object differs; no order was created');
  staged.push({ bucket, key, sha256: sha(bytes) });
}
function result(row: Row, version: number, reused: boolean): UpdatedBookCopyResult {
  requireCopy(Number.isSafeInteger(row.id) && Number(row.id) > 0, 'Target physical identity not confirmed');
  let canAssemble = false;
  try { canAssemble = inspectBookAssemblyQueue(row) === 'queue'; } catch { /* Existing target may be active/advanced; never reset it. */ }
  return { orderId: text(row.orderId), orderDbId: Number(row.id), configVersion: version, reused, canAssemble };
}
export async function prepareUpdatedTestBookCopy(input: UpdatedBookCopyRequest, ports: UpdatedBookCopyPorts): Promise<UpdatedBookCopyResult> {
  requireCopy(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.actor), 'An authenticated human administrator is required');
  requireCopy(typeof input.dedicationText === 'string' && input.dedicationText.length <= 200, 'Dedication must be 200 characters or fewer');
  input = { ...input, dedicationText: input.dedicationText.trim() };
  const context = await loadContext(input.sourceOrderId, ports);
  const { row: source, w0: sourceW0, config, prefix: sourcePrefix } = context;
  requireCopy(input.expectedUpdatedAt && source.updated_at === input.expectedUpdatedAt && input.configChecksum === context.checksum, 'Book or published edition changed; refresh before creating the copy');
  const sourceManifests = [context.rawW0, await requiredObject(ports, 'orders', `${sourcePrefix}/manifests/2a-manifest.json`), await requiredObject(ports, 'orders', `${sourcePrefix}/manifests/2b-manifest.json`)];
  const twoA = parse(sourceManifests[1]), twoB = parse(sourceManifests[2]);
  requireCopy(Object.keys(record(record(twoA.revisions).pending)).length === 0, 'Accept or reject the pending pose revision before copying');
  const beforeA = entries(twoA), beforeB = entries(twoB);
  const required = [...new Set([0, ...sourceW0.book.resolved.qaPolicy.pose.requiredPoseNumbers])].sort((a,b) => a-b);
  requireCopy(beforeA.size === required.length && beforeB.size === required.length, 'All accepted poses and removed images are required');
  const sourceHash = text(source.character_hash);
  for (const manifest of [twoA, twoB]) {
    requireCopy(manifest.orderId === input.sourceOrderId && manifest.bookId === BOOK && manifest.characterHash === sourceHash &&
      record(manifest.order).orderId === input.sourceOrderId && record(manifest.order).rootOrderId === input.sourceOrderId &&
      (manifest.configVersion == null || manifest.configVersion === sourceW0.book.bookConfigRef.version), 'Source image manifest identity mismatch');
  }
  const originals: Array<{ key: string; sha256: string }> = [];
  const originalKeys = [buildBaseCharacterAssetKey(sourceHash, BOOK)];
  for (const number of required) {
    const a = beforeA.get(number), b = beforeB.get(number);
    const approved = buildGeneratedPoseAssetKey(sourceHash, number, BOOK), removed = buildBgRemovedPoseAssetKey(sourceHash, number, BOOK);
    requireCopy(a?.approved === true && a.status === 'approved' && a.approvedKey === approved && !a.needsReview && !a.isFlagged &&
      b?.bgRemovedKey === removed && b.sourceApprovedKey === approved && b.briaStatus === 'completed' && !b.isFlagged && !b.needsReview &&
      (b.sourceReplacedAt ?? null) === (a.replacedAt ?? null) && Number(b.sourceReplacementCount ?? 0) === Number(a.replacementCount ?? 0),
      'Accepted/background-removed pose is incomplete or stale: ' + number);
    originalKeys.push(approved, removed);
  }
  await buildW3AssemblyInput({ orderId: input.sourceOrderId, bookId: BOOK, formatId: 'amazon' }, {
    loadManifest: async key => key === `${sourcePrefix}/manifests/1-manifest.json` ? sourceW0 : key === `${sourcePrefix}/manifests/2b-manifest.json` ? twoB : null,
  });
  for (const key of originalKeys) originals.push({ key, sha256: sha(await requiredObject(ports, 'assets', key)) });
  const fingerprint = digest({ source: sourceState(source), manifestSha256: sourceManifests.map(sha), originals,
    configChecksum: context.checksum, dedicationText: input.dedicationText });
  const orderId = `TEST-UPDATE-V${config.version}-${fingerprint.slice(0,20)}`;
  const prefix = `${BOOK}/orders/${orderId}`, receiptKey = `${prefix}/manifests/updated-copy-receipt.json`;
  const characterHash = calculateCharacterHash(sourceW0.input.characterSpecs, orderId);
  requireCopy(orderId !== input.sourceOrderId && characterHash !== sourceHash, 'Updated copy must have an isolated identity');
  const existing = async (target: Row) => {
    const marker = record(record(target.product_info)[MARKER]);
    requireCopy(target.orderId === orderId && target.root_order_id === orderId && target.amazon_order_id === orderId &&
      target.character_hash === characterHash && marker.fingerprint === fingerprint && marker.receiptKey === receiptKey,
      'Target identifier belongs to another preparation');
    const receiptBytes = await requiredObject(ports, 'orders', receiptKey), receipt = parse(receiptBytes);
    requireCopy(marker.receiptSha256 === sha(receiptBytes) && receipt.fingerprint === fingerprint, 'Target preparation receipt does not match');
    const targetW0Bytes = await requiredObject(ports, 'orders', `${prefix}/manifests/1-manifest.json`);
    const objects = receipt.objects as Staged[];
    requireCopy(Array.isArray(objects) && objects.some(object => object.key === `${prefix}/manifests/1-manifest.json` && object.sha256 === sha(targetW0Bytes)), 'Target frozen intake changed');
    const targetW0 = RunManifestV3Schema.parse(parse(targetW0Bytes));
    resolveFrozenPrintRouting({ ...target, id: Number(target.id), orderId }, targetW0);
    requireCopy(targetW0.book.bookConfigRef.version === config.version && targetW0.input.dedicationText === input.dedicationText &&
      text(target.dedication_text) === input.dedicationText && target.print_manifest_key === targetW0.artifacts.manifestKey &&
      target.print_book_id === BOOK && target.print_format_id === 'amazon', 'Existing target no longer matches this updated edition');
    const assignment = buildW0OrderUpsertPayload({ normalizedInput: { orderId, characterHash }, manifest: targetW0, manifestKey: targetW0.artifacts.manifestKey });
    requireCopy(FROZEN_PRINT_FIELDS.every(field => target[field] === assignment[field]) && adminWorkflowTestAdmission(target) &&
      stableBookValue(target.character_specs) === stableBookValue(targetW0.input.characterSpecs) &&
      target.manifest_2a_url === `${prefix}/manifests/2a-manifest.json` && target.manifest_2b_url === `${prefix}/manifests/2b-manifest.json`, 'Existing target assignment or input pointers changed');
    return result(target, config.version, true);
  };
  const found = await ports.loadOrder(orderId); if (found) return existing(found);
  const intentKey = `${prefix}/manifests/updated-copy-intent.json`;
  let intent = { schema: 'lhb.updated-test-book-intent@v1', fingerprint, orderId, createdAt: ports.now().toISOString(), actor: input.actor.toLowerCase() };
  await ports.createObject('orders', intentKey, json(intent), 'application/json');
  const storedIntent = parse(await requiredObject(ports, 'orders', intentKey));
  requireCopy(storedIntent.schema === intent.schema && storedIntent.fingerprint === fingerprint && storedIntent.orderId === orderId &&
    Number.isFinite(Date.parse(text(storedIntent.createdAt))) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(storedIntent.actor)), 'Preparation intent conflicts with this copy');
  intent = storedIntent as typeof intent;
  const staged: Staged[] = [{ bucket: 'orders', key: intentKey, sha256: sha(json(intent)) }];
  const targetKey = (key: string) => key.replace(`/characters/${sourceHash}/`, `/characters/${characterHash}/`).replace(`characters_${sourceHash}_`, `characters_${characterHash}_`);
  for (const original of originals) {
    const bytes = await requiredObject(ports, 'assets', original.key);
    requireCopy(sha(bytes) === original.sha256, 'Accepted source image changed; refresh before copying');
    const key = targetKey(original.key); requireCopy(key !== original.key && key.includes(`/characters/${characterHash}/`), 'Asset copy namespace mismatch');
    const contentType = imageContentType(bytes);
    requireCopy(!original.key.endsWith('_nobg.png') || contentType === 'image/png', 'Background-removed image must be PNG');
    await stage(ports, 'assets', key, bytes, contentType, staged);
  }
  for (const [index, name] of ['1','2a','2b'].entries()) await stage(ports, 'orders', `${prefix}/copy-source/${name}-manifest.json`, sourceManifests[index], 'application/json', staged);
  const bookSpecs = { ...sourceW0.input.bookSpecs, bookId: BOOK, configVersion: config.version, format: 'amazon', formatId: 'amazon', dedicationMessage: input.dedicationText, testMode: false };
  const shippingAddress = record(source.shipping_address);
  const orderDetails = { quantity: 1, shippingAddress };
  const w0 = buildW0RunManifestFromConfig(config, { orderId, rootOrderId: orderId, amazonOrderId: orderId, orderDbId: null,
    platform: 'amazon', formatId: 'amazon', characterHash, createdAt: intent.createdAt, runId: 'updated-copy-' + fingerprint,
    customerApprovalRequired: true, shippingAddress,
    input: { characterSpecs: sourceW0.input.characterSpecs, bookSpecs, orderDetails, dedicationText: input.dedicationText } });
  const copiedEntries = (removed: boolean) => required.map(number => {
    const original = (removed ? beforeB : beforeA).get(number)!;
    const accepted = beforeA.get(number)!;
    const entry: Row = { poseNumber: number, approved: true, status: 'approved', needsReview: false, isFlagged: false,
      approvedKey: buildGeneratedPoseAssetKey(characterHash, number, BOOK), approvedFilename: `pose${String(number).padStart(2,'0')}.png`,
      publicUrl: `/api/assets/${buildGeneratedPoseAssetKey(characterHash, number, BOOK)}`,
      reuseSource: { orderId: input.sourceOrderId, acceptedKey: accepted.approvedKey, manifestSha256: sha(sourceManifests[removed ? 2 : 1]) } };
    for (const field of ['qaScore','styleScore','qaNotes','qa','posePromptBlock','userPromptText','flipped','flippedAt','replacedAt','replacementCount']) if (original[field] !== undefined) entry[field] = structuredClone(original[field]);
    if (removed) Object.assign(entry, { bgRemovedKey: buildBgRemovedPoseAssetKey(characterHash, number, BOOK), sourceApprovedKey: entry.approvedKey,
      sourceReplacedAt: accepted.replacedAt ?? null, sourceReplacementCount: Number(accepted.replacementCount ?? 0),
      briaStatus: 'completed', bgRemovedStatus: 'completed', bgRemoved: true, processedAt: intent.createdAt });
    return entry;
  });
  const manifest = (removed: boolean) => ({ schema: 'lhb.run-manifest@v2.0', stage: removed ? '2b' : '2a', bookId: BOOK,
    configVersion: config.version, renderSnapshot: w0.book.resolved.renderSnapshot, characterHash, orderId, rootOrderId: orderId, amazonOrderId: orderId,
    generatedAt: intent.createdAt, updatedAt: intent.createdAt, runStamp: intent.createdAt,
    manifestUrl: `${prefix}/manifests/${removed ? '2b' : '2a'}-manifest.json`, originalManifestUrl: w0.artifacts.manifestKey,
    order: { orderId, rootOrderId: orderId, amazonOrderId: orderId, bookId: BOOK, formatId: 'amazon', configVersion: config.version,
      oneManifestUrl: w0.artifacts.manifestKey, childName: sourceW0.input.characterSpecs.childName, characterSpecs: sourceW0.input.characterSpecs, bookSpecs, orderDetails },
    entries: copiedEntries(removed), revisions: { history: [], pending: {} }, reviewQueue: [],
    poses: { total: required.length, approved: required.length }, summary: { complete: true, percentComplete: 100, readyForBook: true, needsHumanReview: false } });
  const targetA = manifest(false), targetB = manifest(true);
  for (const [name, value] of [['1',w0],['2a',targetA],['2b',targetB]] as const) await stage(ports, 'orders', `${prefix}/manifests/${name}-manifest.json`, json(value), 'application/json', staged);
  const load = async (key: string) => parse(await requiredObject(ports, 'orders', key));
  const assembly = await buildW3AssemblyInput({ orderId, bookId: BOOK, formatId: 'amazon' }, { loadManifest: load });
  requireCopy(text(assembly.dedicationText) === input.dedicationText && assembly.characterHash === characterHash && assembly.configVersion === config.version, 'Staged assembly lost updated inputs');
  const receipt = { schema: 'lhb.updated-test-book-receipt@v1', fingerprint, sourceOrderId: input.sourceOrderId, sourceOrderDbId: source.id,
    orderId, configVersion: config.version, configChecksum: context.checksum, createdAt: intent.createdAt, actor: intent.actor, originals, objects: staged };
  const receiptBytes = json(receipt);
  await stage(ports, 'orders', receiptKey, receiptBytes, 'application/json', []);
  for (const object of staged) requireCopy(sha(await requiredObject(ports, object.bucket, object.key)) === object.sha256, 'Staged copy changed; no order was created');
  const fresh = await loadContext(input.sourceOrderId, ports);
  requireCopy(digest(sourceState(fresh.row)) === digest(sourceState(source)) && fresh.checksum === context.checksum, 'Source book or edition changed; refresh before insertion');
  for (const [index, name] of ['1','2a','2b'].entries()) requireCopy(sha(await requiredObject(ports, 'orders', `${sourcePrefix}/manifests/${name}-manifest.json`)) === sha(sourceManifests[index]), 'Source manifest changed before insertion');
  for (const original of originals) requireCopy(sha(await requiredObject(ports, 'assets', original.key)) === original.sha256, 'Source image changed before insertion');
  const payload: Row = { ...buildW0OrderUpsertPayload({ normalizedInput: { orderId, characterHash, customerEmail: text(source.customer_email), buyer: { name: source.customer_name }, marketplaceId: text(source.marketplace_id) }, manifest: w0, manifestKey: w0.artifacts.manifestKey }),
    display_order_id: `UPD-${fingerprint.slice(0,16)}`, amazon_order_id: orderId, root_order_id: orderId,
    manifest_2a_url: `${prefix}/manifests/2a-manifest.json`, manifest_2b_url: `${prefix}/manifests/2b-manifest.json`,
    workflow_step: '2B-complete', status: 'pending_bg_removal_review', execution_status: 'done', next_workflow: null,
    current_workflow: null, started_at: null, customer_approval_required: true, customer_approval_status: 'not_requested',
    review_stages: { preBria: { status: 'approved', approvedAt: intent.createdAt, approvedBy: intent.actor, reusedFrom: input.sourceOrderId },
      postBria: { status: 'approved', approvedAt: intent.createdAt, approvedBy: intent.actor, reusedFrom: input.sourceOrderId }, postPdf: { status: 'pending' } },
    product_info: { ...orderDetails, _overnight_test: true, _created_via_csv: true, _quantity_unit_count: 1,
      _admin_workflow_test: createAdminWorkflowTestAdmission(intent.actor, config.version, new Date(intent.createdAt)),
      [MARKER]: { fingerprint, receiptKey, receiptSha256: sha(receiptBytes), sourceOrderId: input.sourceOrderId, configVersion: config.version } },
    created_at: intent.createdAt, updated_at: intent.createdAt };
  requireCopy(adminWorkflowTestAdmission(payload), 'Prepared test admission is invalid');
  requireCopy(inspectBookAssemblyQueue(payload) === 'queue', 'Prepared copy cannot enter ordinary assembly');
  try { await ports.insertOrder(payload); } catch (error) { const uncertain = await ports.loadOrder(orderId); if (uncertain) return existing(uncertain); throw error; }
  const inserted = await ports.loadOrder(orderId); requireCopy(inserted, 'New copy was not confirmed; retry safely');
  await existing(inserted);
  return result(inserted, config.version, false);
}
