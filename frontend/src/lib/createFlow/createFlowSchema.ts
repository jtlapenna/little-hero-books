/**
 * Create flow schema (types only).
 * Keeps frontend trait IDs aligned with backend preview-canonicals.
 */

export type ShippingTierId = 'mail' | 'ground_home' | 'priority_mail' | 'expedited' | 'express';

export interface CreateFlowCharacter {
  /** Child's name (used in copy + sent to backend as childName). */
  name?: string;
  age?: number;
  pronouns?: string;
  hometown?: string;

  /** Visual traits (must match backend canonical maps). */
  skinTone?: 'light' | 'medium' | 'tan' | 'medium-dark' | 'deep' | string;
  hairColor?:
    | 'blonde'
    | 'strawberry-blonde'
    | 'light-brown'
    | 'medium-brown'
    | 'dark-brown'
    | 'auburn'
    | 'black'
    | 'red'
    | string;
  hairStyle?:
    | 'ponytail'
    | 'pigtails'
    | 'straight-short'
    | 'straight-medium'
    | 'straight-long'
    | 'curly-short'
    | 'curly-medium'
    | 'curly-long'
    | 'afro'
    | 'pom-poms'
    | 'bun'
    | 'side-part'
    | 'buzz'
    | 'curly-crop'
    | 'curly-tight'
    | 'puffy-ponytail'
    | 'small-puffy-ponytail'
    | string;
  favoriteColor?: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'pink' | 'purple' | 'brown' | 'black' | string;
  favoriteAnimal?: 'dog' | 'cat' | 'owl' | 'lion' | 'tiger' | 'penguin' | 't-rex' | 'unicorn' | string;

  /** Optional overrides for backend. */
  clothingStyle?: string;
}

export type CreateFlowPreviewStatus = 'none' | 'checking' | 'generating' | 'ready' | 'cached' | 'out_of_date' | 'error';

export interface CreateFlowPreview {
  status: CreateFlowPreviewStatus;
  generationCount: number;
  imageUrl?: string;
  characterHash?: string;
  generatedAt?: string;
  errorMessage?: string;
}

export interface CreateFlowBook {
  dedication?: string;
}

/** One entry in the multi-book cart. */
export interface CreateFlowBookEntry {
  id: string;
  character: CreateFlowCharacter;
  preview?: CreateFlowPreview;
  dedication?: string;
}

export interface CreateFlowCheckoutShipping {
  name: string;
  phone: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  country: 'US' | string;
}

export interface CreateFlowCheckout {
  email?: string;
  shipping?: CreateFlowCheckoutShipping;
  shippingTier?: ShippingTierId;
  /** Purpose: reuse the same idempotency key on transient checkout retries. */
  idempotencyKey?: string;
  /** Purpose: bound reuse window to avoid stale keys. Unix ms timestamp. */
  idempotencyKeyCreatedAt?: number;
}

export interface CreateFlowOrder {
  orderId: string;
  displayOrderId?: string;
  stripeCheckoutUrl?: string;
}

export interface CreateFlowState {
  /** Current single-book fields (backward compat, used when books[] is empty). */
  character: CreateFlowCharacter;
  preview?: CreateFlowPreview;
  book?: CreateFlowBook;

  /** Multi-book cart (preferred over single-book fields when non-empty). */
  books: CreateFlowBookEntry[];
  currentBookIndex: number;

  checkout?: CreateFlowCheckout;
  order?: CreateFlowOrder;
}

/** Generate a simple client-side ID for a book entry. */
export function generateBookId(): string {
  return crypto.randomUUID?.() ?? `book-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Default state used when user starts the flow fresh. */
export function getDefaultState(): CreateFlowState {
  const id = generateBookId();
  return {
    character: { pronouns: 'they-them' },
    preview: { status: 'none', generationCount: 0 },
    book: { dedication: '' },
    books: [{ id, character: { pronouns: 'they-them' }, preview: { status: 'none', generationCount: 0 } }],
    currentBookIndex: 0,
    checkout: {},
  };
}

/** Helpers for working with the current book in the cart. */
export function getCurrentBook(state: CreateFlowState): CreateFlowBookEntry {
  return state.books[state.currentBookIndex] ?? state.books[0];
}

export function getBookCount(state: CreateFlowState): number {
  return state.books.length;
}
