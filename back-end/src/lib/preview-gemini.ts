/**
 * Build Gemini API request for character preview (base + hair ref).
 * Minimal port of w2A "Prepare Binary (Base Gen, dual-image)" prompt structure.
 */

import type { PreviewResolved } from './preview-canonicals';

export interface BuildPreviewRequestInput {
  resolved: PreviewResolved;
  base64Base: string;
  baseMime: string;
  base64Hair: string;
  hairMime: string;
}

/**
 * Build Gemini generateContent request body for base character image (tee-shorts, no skin swatch).
 */
export function buildPreviewGeminiRequest(input: BuildPreviewRequestInput): Record<string, unknown> {
  const { resolved, base64Base, baseMime, base64Hair, hairMime } = input;
  const { favoriteColorHex, hairColorLabel, shortsHex } = resolved;

  const topColorLock = favoriteColorHex
    ? [
        `CRITICAL — T-SHIRT COLOR: ${favoriteColorHex}`,
        `The t-shirt fabric MUST be ${favoriteColorHex}.`,
        'This is the REQUIRED color for the shirt. Do not use any other color.',
        `Shorts MUST be neutral denim ${shortsHex} (never change shorts color).`,
        'Subtle book-style shading allowed within these hues only.',
      ].join('\n')
    : [
        'CRITICAL — T-SHIRT COLOR: Use a single solid color for the shirt.',
        `Shorts MUST be neutral denim ${shortsHex}.`,
        'Keep shirt color consistent across all generations.',
      ].join('\n');

  const styleRules = [
    'BOOK STYLE: flat, clean vector-like forms with soft textured shading; no outlines on clothing folds.',
    'BACKGROUND: pure white (#FFFFFF). No props, logos, or text. No transparency.',
  ].join('\n');

  const subjectLimit = 'SUBJECT LIMIT: Render exactly one child in frame. No additional people, duplicates, reflections, or background characters.';

  const clothingTypeLine = [
    'CLOTHING STYLE LOCK — T-SHIRT & SHORTS:',
    '- Short-sleeve T-shirt paired with shorts.',
    '- No skirts, dresses, pants, or jackets.',
  ].join('\n');

  const shortsRule = `SHORTS COLOR LOCK: Neutral denim ${shortsHex} (fixed). Never recolor shorts.`;

  const skinToneLine = 'SKIN-TONE LOCK: Keep skin tone identical to the base reference (no lightening/darkening; do not change undertone).';

  const hairLockShared = [
    'HAIRSTYLE LOCK:',
    '- Haircut is LOCKED to IMAGE B. Do not change cut, part side, ear visibility, or maximum length.',
    '- Motion may deflect strands slightly, but silhouette/part/length remain unchanged.',
    `- Hair color: ${hairColorLabel} (do not recolor).`,
  ].join('\n');

  const rolesLegend = [
    'IMAGE ROLES:',
    '- IMAGE A = base character style guide (bald/neutral head). Do not infer haircut from IMAGE A.',
    '- IMAGE B = hairstyle reference. Use ONLY for part location, silhouette, maximum length, and placement.',
    'Priority: if IMAGE A and IMAGE B conflict about hair, FOLLOW IMAGE B.',
  ].join('\n');

  const hairPromptBlock = [
    'HAIRSTYLE DESCRIPTION — GENERIC',
    `- Color: ${hairColorLabel}.`,
    '- Hair silhouette is a single, opaque, connected mass with clean, closed edges.',
    '- Keep face and both ears unobstructed unless the style requires otherwise.',
  ].join('\n');

  const hygiene = [
    'HAIR OUTPUT POLICY:',
    '- Hair renders as a single, opaque, connected mass; closed edges.',
    '- No halos, gaps, or semi-transparent strokes.',
  ].join('\n');

  const userTextParts = [
    topColorLock,
    styleRules,
    subjectLimit,
    clothingTypeLine,
    shortsRule,
    skinToneLine,
    hairLockShared,
    rolesLegend,
    hairPromptBlock,
    hygiene,
  ];
  const userText = userTextParts.join('\n\n');

  const systemTextParts = [
    'You are a precise illustration tool.',
    favoriteColorHex
      ? `CRITICAL: The t-shirt MUST be ${favoriteColorHex}. Shorts MUST be ${shortsHex}. These colors are non-negotiable.`
      : null,
    'CRITICAL: Preserve EXACT requested traits. Use IMAGE A only for overall style; use IMAGE B only for hair.',
    'Do not add text, logos, props, or backgrounds.',
  ].filter(Boolean) as string[];
  const systemText = systemTextParts.join('\n');

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
    { text: userText },
    { text: 'IMAGE A — BASE STYLE GUIDE (do not infer haircut).' },
    { inlineData: { mimeType: baseMime, data: base64Base } },
    { text: 'IMAGE B — HAIRSTYLE REFERENCE. Use ONLY for hair silhouette/part/length/placement. Do not copy face/skin/eyes/clothes.' },
    { inlineData: { mimeType: hairMime, data: base64Hair } },
  ];

  return {
    systemInstruction: { role: 'system', parts: [{ text: systemText }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      imageConfig: { aspectRatio: '1:1', imageSize: '2K' },
      temperature: 0.15,
    },
  };
}
