import { downloadManifest } from '@/lib/r2-service';
import { normalizeW0Manifest } from './normalize-w0-manifest';
import { loadRuntimeBookConfig, type LoadRuntimeBookConfigOptions } from './runtime-book-config';
import { validateRenderSnapshot } from './book-render-recipe';
import { isHistoricalNonRecipeConfig } from './book-legacy-compatibility';
import { inspectWorkflowBookIdentity, assertWorkflowMatchesW0, assertWorkflowConfigSelection } from './workflow-book-identity';
import { reconcileFrozenW2AInput } from './w2a-frozen-input';
import type { BookConfig, BookRenderSnapshot } from './types';

type RecordValue = Record<string, unknown>;
export interface BookSnapshotFields { renderSnapshot?: BookRenderSnapshot; configVersion?: number }
export interface WorkflowBookConfigOptions {
  loadConfig?: (input: LoadRuntimeBookConfigOptions) => Promise<BookConfig>;
  loadManifest?: (key: string) => Promise<unknown | null>;
}
export async function resolveWorkflowBookConfig(input: RecordValue, selection: LoadRuntimeBookConfigOptions & { formatId?: string }, options: WorkflowBookConfigOptions = {}): Promise<{ config: BookConfig; canonicalInput?: RecordValue } & BookSnapshotFields> {
  const identity = inspectWorkflowBookIdentity(input, selection);
  selection = { ...selection, bookId: identity.bookId ?? selection.bookId,
    version: identity.version ?? selection.version, formatId: identity.formatId ?? selection.formatId };
  let snapshot: BookRenderSnapshot | undefined = identity.snapshots[0];
  let canonicalInput: RecordValue | undefined;
  const hint = identity.manifestKey;
  let manifestRead = false;
  if (hint && (options.loadManifest || !options.loadConfig)) {
    let raw: unknown;
    try {
      raw = await (options.loadManifest ?? downloadManifest)(hint);
    } catch (error) {
      if (snapshot) throw new Error('Configured order snapshot unavailable');
      const config = await (options.loadConfig ?? loadRuntimeBookConfig)(selection);
      assertWorkflowConfigSelection(config, selection);
      if (!isHistoricalNonRecipeConfig(config, selection.formatId ?? config.defaultFormatId)) {
        throw new Error(`Configured order snapshot unavailable: ${error instanceof Error ? error.message : String(error)}`);
      }
      return { config };
    }
    if (raw !== null && raw !== undefined) {
      const normalized = normalizeW0Manifest(raw, { fallbackManifestKey: hint });
      assertWorkflowMatchesW0(identity, normalized, raw, hint);
      canonicalInput = reconcileFrozenW2AInput(input, normalized);
      if ((normalized.bookId && normalized.bookId !== selection.bookId) ||
          (normalized.formatId && selection.formatId && normalized.formatId !== selection.formatId) ||
          (normalized.configVersion && selection.version && normalized.configVersion !== selection.version)) throw new Error('Render snapshot identity mismatch');
      snapshot = normalized.renderSnapshot;
      manifestRead = true;
    } else if (snapshot) {
      throw new Error('Configured order snapshot unavailable');
    }
  }
  if (snapshot !== undefined && snapshot !== null) {
    const parsed = validateRenderSnapshot(snapshot, { bookId: selection.bookId, formatId: selection.formatId, version: selection.version });
    return { config: parsed.bookConfig, renderSnapshot: parsed, configVersion: parsed.bookConfig.version, canonicalInput };
  }
  const config = await (options.loadConfig ?? loadRuntimeBookConfig)(selection);
  assertWorkflowConfigSelection(config, selection);
  if (hint && !isHistoricalNonRecipeConfig(config, selection.formatId ?? config.defaultFormatId)) {
    if (!manifestRead) throw new Error('Configured order requires its frozen W0 render snapshot');
    throw new Error('Configured W0 manifest has no render snapshot');
  }
  return { config, canonicalInput };
}
