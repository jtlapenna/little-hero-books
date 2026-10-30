import { extractManifestKey } from '@/lib/order-paths';
import { validateRenderSnapshot } from './book-render-recipe';
import { stableBookValue } from './book-legacy-compatibility';
import type { BookConfig, BookRenderSnapshot } from './types';
import type { NormalizedW0Manifest } from './normalize-w0-manifest';

type RecordValue = Record<string, unknown>;
type Selection = { bookId?: string | null; formatId?: string | null; version?: number | null };
function object(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
}

export function workflowBookContexts(input: RecordValue): RecordValue[] {
  const meta = object(input.__meta);
  return [input, object(input.orderContext), object(input._compatSnapshot), object(input.orderData),
    object(input.ctx), object(meta.snapshot), object(object(meta.deriveQaPass).snapshot)];
}

export function assertWorkflowConfigSelection(config: BookConfig, selection: Selection): void {
  if ((selection.bookId && selection.bookId !== config.bookId) ||
      (selection.version != null && selection.version !== config.version) ||
      (selection.formatId && !Object.hasOwn(config.formats, selection.formatId))) {
    throw new Error('Loaded book config identity mismatch');
  }
}

export interface WorkflowBookIdentity {
  bookId?: string;
  formatId?: string;
  version?: number;
  orderId?: string;
  manifestKey?: string;
  snapshots: BookRenderSnapshot[];
}

function comparableSnapshot(snapshot: BookRenderSnapshot): unknown {
  const { testOnly, ...rest } = snapshot;
  return testOnly === true ? { ...rest, testOnly: true } : rest;
}

export function assertMatchingBookSnapshots(left: BookRenderSnapshot, right: BookRenderSnapshot): void {
  if (stableBookValue(comparableSnapshot(left)) !== stableBookValue(comparableSnapshot(right))) {
    throw new Error('Conflicting workflow render snapshots');
  }
}

/** Inspect original carriers before compatibility merges can overwrite declarations. */
export function inspectWorkflowBookIdentity(input: RecordValue, selection: Selection = {}): WorkflowBookIdentity {
  const contexts = workflowBookContexts(input);
  const result: WorkflowBookIdentity = { snapshots: [] };
  const declare = (field: 'bookId' | 'formatId' | 'orderId' | 'manifestKey', value: string) => {
    const label = field === 'manifestKey' ? field : field.replace(/Id$/, '');
    if (result[field] !== undefined && result[field] !== value) throw new Error(`Conflicting workflow ${label} identity`);
    result[field] = value;
  };
  for (const context of contexts) {
    for (const [field, aliases] of [
      ['bookId', ['bookId', 'print_book_id', 'printBookId']],
      ['formatId', ['formatId', 'print_format_id', 'printFormatId']],
      ['orderId', ['orderId']],
      ['manifestKey', ['oneManifestKey', 'oneManifestUrl', 'one_manifest_url']],
    ] as const) {
      for (const alias of aliases) {
        const raw = context[alias];
        if (raw === undefined || raw === null || raw === '') continue;
        if (typeof raw !== 'string' || !raw.trim()) throw new Error(`Malformed workflow ${field} identity`);
        const value = field === 'manifestKey' ? extractManifestKey(raw) : raw.trim();
        if (!value) throw new Error('Malformed workflow manifestKey identity');
        declare(field, value);
      }
    }
    for (const field of ['configVersion', 'version', 'print_config_version', 'printConfigVersion']) {
      const raw = context[field];
      if (raw === undefined || raw === null || raw === '') continue;
      const version = typeof raw === 'string' && /^[1-9][0-9]*$/.test(raw) ? Number(raw) : raw;
      if (typeof version !== 'number' || !Number.isSafeInteger(version) || version <= 0) throw new Error('Frozen W0 manifest version identity is malformed');
      if (result.version !== undefined && result.version !== version) throw new Error('Conflicting workflow version identity');
      result.version = version;
    }
  }
  for (const [field, expected] of [['bookId', selection.bookId], ['formatId', selection.formatId], ['version', selection.version]] as const) {
    if (expected != null && result[field] !== undefined && result[field] !== expected) throw new Error('Render snapshot identity mismatch');
  }
  for (const context of contexts) {
    if (context.renderSnapshot === undefined || context.renderSnapshot === null) continue;
    const snapshot = validateRenderSnapshot(context.renderSnapshot, {
      bookId: selection.bookId ?? result.bookId, formatId: selection.formatId ?? result.formatId,
      version: selection.version ?? result.version,
    });
    if (result.snapshots.length) assertMatchingBookSnapshots(result.snapshots[0], snapshot);
    result.snapshots.push(snapshot);
  }
  return result;
}

export function assertWorkflowMatchesW0(identity: WorkflowBookIdentity, manifest: NormalizedW0Manifest, raw: unknown, key: string): void {
  if (identity.orderId && identity.orderId !== manifest.orderId) throw new Error('Frozen W0 manifest order identity does not match W2A request');
  if (manifest.renderSnapshot && !identity.orderId) throw new Error('Configured W2A request requires orderId');
  for (const [field, actual] of [['bookId', manifest.bookId], ['formatId', manifest.formatId], ['version', manifest.configVersion]] as const) {
    if (identity[field] !== undefined && (actual != null || manifest.schema === 'lhb.run-manifest@v3') && identity[field] !== actual) {
      const label = field.replace(/Id$/, '');
      throw new Error(`Frozen W0 manifest ${label} identity does not match W2A request`);
    }
  }
  const embedded = object(object(raw).artifacts).manifestKey;
  if (embedded !== undefined && embedded !== key) throw new Error('Frozen W0 manifest key does not match selected key');
  if (identity.manifestKey && identity.manifestKey !== key) throw new Error('Frozen W0 manifest key does not match selected key');
  if (identity.snapshots.length && !manifest.renderSnapshot) throw new Error('Configured W0 manifest requires its frozen render snapshot');
  if (manifest.renderSnapshot) {
    const snapshot = validateRenderSnapshot(manifest.renderSnapshot, { bookId: manifest.bookId, formatId: manifest.formatId, version: manifest.configVersion });
    for (const declared of identity.snapshots) assertMatchingBookSnapshots(declared, snapshot);
  }
}
