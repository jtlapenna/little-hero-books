export const EYEBROW_PROMPT_GUARDRAIL = [
  'EYEBROW LOCK:',
  '- The child must have two visible natural eyebrows in every rendering.',
  '- Eyebrows must sit above the eyes, match the child hair color or a natural slightly darker tone, and remain visible even with bangs, lighting, or small facial scale.',
  '- Do not omit, erase, fade, cover, or merge eyebrows into the hair, skin, or eye shading.',
].join('\n');

export const EYEBROW_SYSTEM_INSTRUCTION =
  'CRITICAL: Include two visible natural eyebrows above the eyes. Do not omit, fade, cover, or merge eyebrows into hair, skin, or eye shading.';
