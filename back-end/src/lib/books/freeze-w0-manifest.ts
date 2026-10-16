import { validateRunManifest } from './validate-run-manifest';
import { assertPrintAssignmentCompatible } from './print-assignment';
import { extractManifestKey } from '@/lib/order-paths';
import { buildW0OrderUpsertPayload, type BuildOrderIntakeManifestResult, type NormalizedW0WorkflowInput } from '@/lib/w0-manifest-builder';

type RecordValue = Record<string, unknown>;
export interface W0ManifestStorage {
  loadOrder(orderId: string): Promise<RecordValue | null>;
  loadManifest(key: string): Promise<unknown | null>;
  createManifest?(key: string, manifest: RecordValue): Promise<boolean>;
  persistOrder?(payload: RecordValue): Promise<{ data: RecordValue | null; error: Error | null }>;
}

function selectFrozenManifest(candidate: BuildOrderIntakeManifestResult, stored: unknown, order: RecordValue | null): BuildOrderIntakeManifestResult {
  if (stored == null) return candidate;
  const prospective = validateRunManifest(candidate.manifest);
  const raw = stored as RecordValue;
  if (raw.schema === 'lhb.run-manifest@v2.1') {
    if (order?.print_provider !== 'lulu' || prospective.book.resolved.print.provider !== 'lulu' || prospective.book.bookConfigRef.version !== 1 ||
        (raw.orderId != null && raw.orderId !== prospective.order.orderId)) {
      throw new Error('Existing legacy W0 manifest is incompatible with selected configuration');
    }
    return { ...candidate, manifest: raw, schemaVersion: 'v2.1' };
  }
  const frozen = validateRunManifest(stored);
  if (frozen.manifestType !== 'w0' || frozen.order.orderId !== prospective.order.orderId ||
      frozen.order.rootOrderId !== prospective.order.rootOrderId || frozen.artifacts.manifestKey !== candidate.manifestKey ||
      frozen.book.bookConfigRef.bookId !== prospective.book.bookConfigRef.bookId ||
      frozen.book.bookConfigRef.formatId !== prospective.book.bookConfigRef.formatId ||
      frozen.book.bookConfigRef.version !== prospective.book.bookConfigRef.version) {
    throw new Error('Existing frozen W0 manifest does not match selected order/book/version/format');
  }
  assertPrintAssignmentCompatible(
    buildW0OrderUpsertPayload({ normalizedInput: {}, manifest: frozen, manifestKey: candidate.manifestKey }),
    buildW0OrderUpsertPayload({ normalizedInput: {}, manifest: prospective, manifestKey: candidate.manifestKey }),
  );
  return { ...candidate, manifest: frozen };
}

export async function prepareFrozenW0Manifest(
  input: NormalizedW0WorkflowInput, candidate: BuildOrderIntakeManifestResult, storage: W0ManifestStorage, publish = false,
) {
  const prospective = validateRunManifest(candidate.manifest);
  const orderId = prospective.order.orderId;
  let order = await storage.loadOrder(orderId);
  const assertRow = (row: RecordValue | null) => {
    if (!row) return;
    if ((row.orderId ?? row.order_id) !== orderId ||
        (row.one_manifest_url != null && extractManifestKey(typeof row.one_manifest_url === 'string' ? row.one_manifest_url : null) !== candidate.manifestKey) ||
        (row.book_id != null && row.book_id !== candidate.bookId) ||
        (row.print_format_id != null && row.print_format_id !== candidate.formatId)) {
      throw new Error('Persisted W0 manifest identity does not match selected book/order');
    }
    assertPrintAssignmentCompatible(row, buildW0OrderUpsertPayload({ normalizedInput: input, manifest: candidate.manifest, manifestKey: candidate.manifestKey }));
  };
  assertRow(order);
  let stored = await storage.loadManifest(candidate.manifestKey);
  let selected = selectFrozenManifest(candidate, stored, order);
  let created = false;
  if (publish && stored == null) {
    if (!storage.createManifest) throw new Error('Conditional W0 publication is unavailable');
    created = await storage.createManifest(candidate.manifestKey, selected.manifest as RecordValue);
    if (!created) {
      stored = await storage.loadManifest(candidate.manifestKey);
      if (stored == null) throw new Error('Concurrent W0 publication could not be reconciled');
      selected = selectFrozenManifest(candidate, stored, order);
    }
  }
  if (publish) { order = await storage.loadOrder(orderId); assertRow(order); }
  const frozenInput: NormalizedW0WorkflowInput = { ...input };
  const frozenPrefix = selected.schemaVersion === 'v3' ? validateRunManifest(selected.manifest).artifacts.characterPrefix : null;
  const frozenHash = frozenPrefix?.split('/').filter(Boolean).at(-1) ?? (typeof order?.character_hash === 'string' ? order.character_hash : null);
  const incomingHash = input.characterHash ?? input.character_hash ?? input._raw?.characterHash ?? input._raw?.character_hash;
  if ((frozenHash || stored != null || order?.one_manifest_url) && incomingHash && frozenHash !== incomingHash) throw new Error('Frozen W0 character identity mismatch');
  if (frozenHash) frozenInput.characterHash = frozenHash;
  const orderUpsert = buildW0OrderUpsertPayload({ normalizedInput: frozenInput, manifest: selected.manifest, manifestKey: selected.manifestKey });
  if (selected.schemaVersion === 'v2.1' && order) {
    for (const key of Object.keys(orderUpsert).filter((key) => key.startsWith('print_'))) orderUpsert[key] = order[key] ?? null;
  }
  if (order?.one_manifest_url && order.execution_status !== 'pending_w0') {
    // The persisted row owns lifecycle and editable customer fields after intake.
    for (const key of Object.keys(orderUpsert)) if (!key.startsWith('print_')) {
      if (Object.hasOwn(order, key)) orderUpsert[key] = order[key];
      else delete orderUpsert[key];
    }
  }
  assertPrintAssignmentCompatible(order ?? {}, orderUpsert);
  let orderDbId: number | null = typeof order?.id === 'number' ? order.id : null;
  if (publish) {
    if (!storage.persistOrder) throw new Error('W0 order persistence is unavailable');
    const persisted = await storage.persistOrder(orderUpsert);
    if (persisted.error || !persisted.data) throw persisted.error ?? new Error('W0 order persistence was not confirmed');
    assertRow(persisted.data);
    if (extractManifestKey(typeof persisted.data.one_manifest_url === 'string' ? persisted.data.one_manifest_url : null) !== candidate.manifestKey) {
      throw new Error('Persisted canonical W0 manifest reference was not confirmed');
    }
    orderDbId = typeof persisted.data.id === 'number' ? persisted.data.id : null;
  }
  return { ...selected, orderUpsert, orderDbId, published: publish, created, reused: stored != null };
}
