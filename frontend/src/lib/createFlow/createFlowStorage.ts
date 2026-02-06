/**
 * Create flow storage.
 * Uses sessionStorage to keep the multi-step D2C flow state.
 */

import { getDefaultState, type CreateFlowState } from './createFlowSchema';

const STORAGE_KEY = 'lhb:create-flow:v1';

type UnknownRecord = Record<string, unknown>;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof sessionStorage !== 'undefined';
}

/** Best-effort runtime check to avoid hard crashes on corrupted storage. */
function looksLikeState(value: unknown): value is CreateFlowState {
  if (!value || typeof value !== 'object') return false;
  const v = value as UnknownRecord;
  return !!v.character && typeof v.character === 'object';
}

export function load(): CreateFlowState | null {
  if (!isBrowser()) return null;

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (!looksLikeState(parsed)) return null;

    return parsed;
  } catch {
    return null;
  }
}

/** Shallow merge top-level + nested objects we use in the flow. */
export function save(partial: Partial<CreateFlowState>): void {
  if (!isBrowser()) return;

  const prev = load() ?? getDefaultState();

  // Purpose: keep updates minimal while preserving previous nested state.
  const next: CreateFlowState = {
    ...prev,
    ...partial,
    character: { ...prev.character, ...(partial.character ?? {}) },
    book: { ...(prev.book ?? {}), ...(partial.book ?? {}) },
    checkout: { ...(prev.checkout ?? {}), ...(partial.checkout ?? {}) },
    order: partial.order ?? prev.order,
    preview: partial.preview ?? prev.preview,
  };

  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function clear(): void {
  if (!isBrowser()) return;
  sessionStorage.removeItem(STORAGE_KEY);
}
