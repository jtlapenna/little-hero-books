import { downloadManifest } from '@/lib/r2-service';
import { extractManifestKey } from '@/lib/order-paths';
import { normalizeW0Manifest } from './normalize-w0-manifest';
import { loadRuntimeBookConfig, type LoadRuntimeBookConfigOptions } from './runtime-book-config';
import { validateRenderSnapshot } from './book-render-recipe';
import type { BookConfig, BookRenderSnapshot } from './types';

type RecordValue = Record<string, unknown>;
export interface BookSnapshotFields { renderSnapshot?: BookRenderSnapshot; configVersion?: number }
export interface WorkflowBookConfigOptions {
  loadConfig?: (input: LoadRuntimeBookConfigOptions) => Promise<BookConfig>;
  loadManifest?: (key: string) => Promise<unknown | null>;
}
function object(value: unknown): RecordValue { return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}; }
export async function resolveWorkflowBookConfig(input: RecordValue, selection: LoadRuntimeBookConfigOptions & { formatId?: string }, options: WorkflowBookConfigOptions = {}): Promise<{ config: BookConfig } & BookSnapshotFields> {
  const context = object(input.orderContext);
  const compat = object(input._compatSnapshot);
  let snapshot = input.renderSnapshot ?? context.renderSnapshot ?? compat.renderSnapshot;
  const hint = [input.oneManifestKey, input.oneManifestUrl, input.one_manifest_url, context.oneManifestKey, context.oneManifestUrl, context.one_manifest_url, compat.oneManifestKey, compat.oneManifestUrl, compat.one_manifest_url].find(v => typeof v === 'string' && v.trim());
  let manifestRead = false;
  let declaredSnapshot = false;
  if (!snapshot && hint && (options.loadManifest || !options.loadConfig)) {
    const key = extractManifestKey(String(hint));
    if (key) {
      try {
        const raw = await (options.loadManifest ?? downloadManifest)(key);
        if (raw) {
          declaredSnapshot = object(object(object(raw).book).resolved).renderSnapshot !== undefined;
          const normalized = normalizeW0Manifest(raw, { fallbackManifestKey: key });
          snapshot = normalized.renderSnapshot;
          manifestRead = true;
        }
      } catch (error) {
        if (declaredSnapshot) throw error;
        const config = await (options.loadConfig ?? loadRuntimeBookConfig)(selection);
        if (config.rendering.recipe) throw new Error(`Configured order snapshot unavailable: ${error instanceof Error ? error.message : String(error)}`);
        return { config };
      }
    }
  }
  if (snapshot !== undefined && snapshot !== null) {
    const parsed = validateRenderSnapshot(snapshot, { bookId: selection.bookId, formatId: selection.formatId, version: selection.version });
    return { config: parsed.bookConfig, renderSnapshot: parsed, configVersion: parsed.bookConfig.version };
  }
  const config = await (options.loadConfig ?? loadRuntimeBookConfig)(selection);
  if (config.rendering.recipe && hint && !manifestRead) throw new Error('Configured order requires its frozen W0 render snapshot');
  if (config.rendering.recipe && hint) throw new Error('Configured W0 manifest has no render snapshot');
  return { config };
}
