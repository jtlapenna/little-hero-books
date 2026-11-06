import type { BookLayerPlacement } from './book-render-contract';

export type BookCanvas = { w: number; h: number };
export type ResolvedBookPlacement = {
  left: number; top: number; width: number; height?: number;
  zIndex: number; transform: string; transformOrigin: string;
};
export type BookPlacementOverride = Partial<Pick<BookLayerPlacement, 'left' | 'top' | 'width' | 'rotateDeg' | 'zIndex'>> & {
  anchorXPercent?: number; anchorYPercent?: number;
};

export function mergeBookPlacement(base: BookLayerPlacement, override?: BookPlacementOverride | null): BookLayerPlacement {
  const defined = Object.fromEntries(Object.entries(override ?? {}).filter(([key, value]) =>
    ['left', 'top', 'width', 'rotateDeg', 'zIndex', 'anchorXPercent', 'anchorYPercent'].includes(key) && value !== undefined));
  const hasAnchor = defined.anchorXPercent !== undefined || defined.anchorYPercent !== undefined;
  if (hasAnchor && !base.layout) throw new Error('Anchor override requires an explicit v3 layout');
  const layout = base.layout && {
    ...base.layout,
    ...(defined.anchorXPercent === undefined ? {} : { anchorXPercent: defined.anchorXPercent }),
    ...(defined.anchorYPercent === undefined ? {} : { anchorYPercent: defined.anchorYPercent }),
  };
  return { ...base, ...defined, ...(layout ? { layout } : {}) };
}

/** Author measurements stay unchanged. Resolve once against the selected canvas. */
export function resolveBookPlacement(
  placement: BookLayerPlacement,
  canvas: BookCanvas,
): ResolvedBookPlacement {
  if (!(canvas.w > 0 && canvas.h > 0 && Number.isFinite(canvas.w) && Number.isFinite(canvas.h))) {
    throw new Error('Book placement requires a finite positive canvas');
  }
  const layout = placement.layout;
  const factors = bookPlacementFactors(placement, canvas);
  const convert = (value: number, factor: number) => {
    const resolved = value * factor;
    if (!Number.isFinite(resolved)) throw new Error('Book placement is not finite');
    return layout?.rounding === 'nearest' ? Math.round(resolved) : resolved;
  };
  const width = convert(placement.width, factors.x);
  const transforms = layout
    ? [
        `translate(-${layout.anchorXPercent ?? 0}%,-${layout.anchorYPercent ?? 0}%)`,
        `rotate(${placement.rotateDeg ?? 0}deg)`,
        `scale(${layout.scale ?? 1})`,
        ...(placement.flipX ? ['scaleX(-1)'] : []),
      ]
    : [
        `rotate(${placement.rotateDeg ?? 0}deg)`,
        ...(placement.flipX ? [`translateX(${width}px)`, 'scaleX(-1)'] : []),
      ];
  return {
    left: convert(placement.left, factors.x), top: convert(placement.top, factors.y), width,
    ...(placement.height === undefined ? {} : { height: convert(placement.height, factors.y) }),
    zIndex: placement.zIndex ?? 10,
    transform: transforms.join(' '),
    transformOrigin: layout ? `${layout.originXPercent ?? 0}% ${layout.originYPercent ?? 0}%` : '0 0',
  };
}

export function bookPlacementFactors(placement: Pick<BookLayerPlacement, 'layout'>, canvas: BookCanvas) {
  const layout = placement.layout;
  if (layout?.units === 'percent') return { x: canvas.w / 100, y: canvas.h / 100 };
  return {
    x: layout?.referenceCanvas ? canvas.w / layout.referenceCanvas.w : 1,
    y: layout?.referenceCanvas ? canvas.h / layout.referenceCanvas.h : 1,
  };
}

/** Invert canvas deltas, not rounded display coordinates, when editing author values. */
export function bookCanvasDeltaToAuthor(
  placement: Pick<BookLayerPlacement, 'layout'>,
  canvas: BookCanvas,
  delta: { x: number; y: number },
) {
  const factors = bookPlacementFactors(placement, canvas);
  if (![factors.x, factors.y].every(value => Number.isFinite(value) && value > 0) ||
      ![delta.x, delta.y].every(Number.isFinite)) throw new Error('Invalid book placement delta');
  return { x: delta.x / factors.x, y: delta.y / factors.y };
}

export function bookPlacementStyle(value: ResolvedBookPlacement, canvas?: BookCanvas) {
  const x = (number: number) => canvas ? `${number / canvas.w * 100}%` : `${number}px`;
  const y = (number: number) => canvas ? `${number / canvas.h * 100}%` : `${number}px`;
  const transform = canvas ? value.transform.replace(`translateX(${value.width}px)`, 'translateX(100%)') : value.transform;
  return { position: 'absolute' as const, left: x(value.left), top: y(value.top), width: x(value.width),
    ...(value.height === undefined ? {} : { height: y(value.height) }), zIndex: value.zIndex,
    transform, transformOrigin: value.transformOrigin };
}

export function bookPlacementCss(value: ResolvedBookPlacement, canvas?: BookCanvas): string {
  return Object.entries(bookPlacementStyle(value, canvas)).map(([key, item]) =>
    `${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}:${item};`).join('');
}

export function bookAuthorCanvas(placement: Pick<BookLayerPlacement, 'layout'>, canvas: BookCanvas): BookCanvas {
  const factors = bookPlacementFactors(placement, canvas);
  return { w: canvas.w / factors.x, h: canvas.h / factors.y };
}

/** Pointer motion is measured in screen pixels; editor state remains in author units. */
export function dragBookPlacement(
  placement: BookLayerPlacement,
  canvas: BookCanvas,
  screen: { width: number; height: number },
  delta: { x: number; y: number },
): { left: number; top: number } {
  if (![screen.width, screen.height].every(value => Number.isFinite(value) && value > 0)) throw new Error('Invalid book preview screen');
  const authorDelta = bookCanvasDeltaToAuthor(placement, canvas, { x: delta.x * canvas.w / screen.width, y: delta.y * canvas.h / screen.height });
  const domain = bookAuthorCanvas(placement, canvas);
  return { left: Math.min(domain.w, Math.max(0, placement.left + authorDelta.x)),
    top: Math.min(domain.h, Math.max(0, placement.top + authorDelta.y)) };
}
