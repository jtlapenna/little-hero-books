/**
 * Create flow storage.
 * Uses sessionStorage to keep the multi-step D2C flow state.
 * Supports both legacy single-book and new multi-book (books[]) formats.
 */

import {
  getDefaultState,
  generateBookId,
  type CreateFlowState,
  type CreateFlowBookEntry,
} from './createFlowSchema';

const STORAGE_KEY = 'lhb:create-flow:v1';

type UnknownRecord = Record<string, unknown>;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof sessionStorage !== 'undefined';
}

function looksLikeState(value: unknown): value is CreateFlowState {
  if (!value || typeof value !== 'object') return false;
  const v = value as UnknownRecord;
  return !!v.character && typeof v.character === 'object';
}

/** Migrate legacy single-book state → books[] array. */
function migrateIfNeeded(state: CreateFlowState): CreateFlowState {
  if (state.books && Array.isArray(state.books) && state.books.length > 0) return state;

  // Legacy format: only has character/preview/book at top level, no books[]
  const entry: CreateFlowBookEntry = {
    id: generateBookId(),
    character: state.character ?? { pronouns: 'they-them' },
    preview: state.preview,
    dedication: state.book?.dedication,
  };
  return {
    ...state,
    books: [entry],
    currentBookIndex: 0,
  };
}

export function load(): CreateFlowState | null {
  if (!isBrowser()) return null;

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (!looksLikeState(parsed)) return null;

    return migrateIfNeeded(parsed as CreateFlowState);
  } catch {
    return null;
  }
}

/** Shallow merge top-level + nested objects we use in the flow. */
export function save(partial: Partial<CreateFlowState>): void {
  if (!isBrowser()) return;

  const prev = load() ?? getDefaultState();

  const next: CreateFlowState = {
    ...prev,
    ...partial,
    character: { ...prev.character, ...(partial.character ?? {}) },
    book: { ...(prev.book ?? {}), ...(partial.book ?? {}) },
    books: partial.books ?? prev.books,
    currentBookIndex: partial.currentBookIndex ?? prev.currentBookIndex,
    checkout: { ...(prev.checkout ?? {}), ...(partial.checkout ?? {}) },
    order: partial.order ?? prev.order,
    preview: partial.preview ?? prev.preview,
  };

  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

/** Update a specific book entry by index (merges character/preview/dedication). */
export function saveBook(index: number, patch: Partial<CreateFlowBookEntry>): void {
  if (!isBrowser()) return;
  const state = load() ?? getDefaultState();
  if (index < 0 || index >= state.books.length) return;

  const book = state.books[index];
  state.books[index] = {
    ...book,
    ...patch,
    character: { ...book.character, ...(patch.character ?? {}) },
    preview: patch.preview ?? book.preview,
    dedication: patch.dedication ?? book.dedication,
  };

  // Keep top-level character/preview/book in sync with current book
  if (index === state.currentBookIndex) {
    state.character = state.books[index].character;
    state.preview = state.books[index].preview;
    state.book = { dedication: state.books[index].dedication };
  }

  save(state);
}

/** Add a new empty book to the cart and switch to it. */
export function addBook(): CreateFlowBookEntry {
  const state = load() ?? getDefaultState();
  const entry: CreateFlowBookEntry = {
    id: generateBookId(),
    character: { pronouns: 'they-them' },
    preview: { status: 'none', generationCount: 0 },
  };
  state.books.push(entry);
  state.currentBookIndex = state.books.length - 1;
  // Update top-level fields to match new current book
  state.character = entry.character;
  state.preview = entry.preview;
  state.book = { dedication: '' };
  save(state);
  return entry;
}

/** Remove a book by index. Returns false if only one book remains. */
export function removeBook(index: number): boolean {
  const state = load() ?? getDefaultState();
  if (state.books.length <= 1) return false;
  state.books.splice(index, 1);
  if (state.currentBookIndex >= state.books.length) {
    state.currentBookIndex = state.books.length - 1;
  }
  // Sync top-level fields
  const current = state.books[state.currentBookIndex];
  state.character = current.character;
  state.preview = current.preview;
  state.book = { dedication: current.dedication };
  save(state);
  return true;
}

/** Switch which book is currently being edited. */
export function switchBook(index: number): void {
  const state = load() ?? getDefaultState();
  if (index < 0 || index >= state.books.length) return;
  state.currentBookIndex = index;
  const current = state.books[index];
  state.character = current.character;
  state.preview = current.preview;
  state.book = { dedication: current.dedication };
  save(state);
}

export function clear(): void {
  if (!isBrowser()) return;
  sessionStorage.removeItem(STORAGE_KEY);
}
