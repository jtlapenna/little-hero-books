/**
 * Create flow selectors.
 * Keeps navigation logic centralized.
 */

import type { CreateFlowState } from './createFlowSchema';
import { hasRequiredVisualTraits } from './characterHash';

function hasText(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

export function isCharacterStepComplete(state: CreateFlowState): boolean {
  const c = state.character;
  if (!hasText(c.name)) return false;
  if (typeof c.age !== 'number' || Number.isNaN(c.age)) return false;
  if (!hasText(c.pronouns)) return false;
  if (!hasRequiredVisualTraits(c)) return false;
  if (!hasText(c.favoriteAnimal)) return false;
  return true;
}

/**
 * Gate access to steps.
 * Note: processing must be accessible even if storage was cleared.
 */
export function canAccessStep(
  step: 'customize' | 'review' | 'checkout' | 'processing',
  state: CreateFlowState | null
): boolean {
  if (step === 'processing') return true;
  if (!state) return false;
  if (!isCharacterStepComplete(state)) return false;
  return true;
}
