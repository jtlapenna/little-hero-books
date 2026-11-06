export interface FlowLayout {
  paragraphs: Array<{ runs: Array<{ text: string; keepWithNext?: boolean; atomicPhrase?: true; style?: { color?: string; sizeRatio?: number; rotateDeg?: number } }> }>;
}
export const FLOW_COPY_CSS: string;
export function resolveGuideTokens(guide: string): { name: string; clue: string; clues: string };
export function renderFlowContent(flow: FlowLayout, tokens: Record<string, string>): string;
