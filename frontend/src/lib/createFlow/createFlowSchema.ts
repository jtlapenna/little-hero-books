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

export interface CreateFlowCheckoutShipping {
  name: string;
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
}

export interface CreateFlowOrder {
  orderId: string;
  displayOrderId?: string;
  stripeCheckoutUrl?: string;
}

export interface CreateFlowState {
  character: CreateFlowCharacter;
  preview?: CreateFlowPreview;
  book?: CreateFlowBook;
  checkout?: CreateFlowCheckout;
  order?: CreateFlowOrder;
}

/** Default state used when user starts the flow fresh. */
export function getDefaultState(): CreateFlowState {
  return {
    character: { pronouns: 'they-them' },
    preview: { status: 'none', generationCount: 0 },
    book: { dedication: '' },
    checkout: {},
  };
}
