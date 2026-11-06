import type { BookV3CopyBlock, BookV3RootStack, BookV3Stack, BookV3StackText } from './book-render-contract';
import { bookPlacementCss, resolveBookPlacement, type BookCanvas } from './book-layout-geometry';

const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
type CopyStyle = Pick<BookV3CopyBlock, 'fontSize' | 'lineHeight' | 'color' | 'align' | 'padding' | 'backgroundColor' | 'typography' | 'fit' | 'textFormat' | 'omitIfEmpty'>;

function textStyle(copy: CopyStyle): string {
  const type = copy.typography;
  return `font-size:${copy.fit?.maxFontSize ?? copy.fontSize}px;line-height:${copy.lineHeight};color:${copy.color};text-align:${copy.align};padding:${copy.padding}px;${copy.backgroundColor ? `background:${copy.backgroundColor};` : ''}letter-spacing:${type?.trackingPx ?? 0}px;text-transform:${type?.case === 'uppercase' ? 'uppercase' : 'none'};white-space:${type?.wrap === 'single-line' ? 'nowrap' : 'pre-line'};text-wrap:${type?.wrap === 'balanced' ? 'balance' : 'wrap'};overflow-wrap:${type?.wrap === 'single-line' ? 'normal' : 'break-word'};display:flex;align-items:${type?.verticalAlign === 'center' ? 'center' : type?.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start'};justify-content:${copy.align === 'center' ? 'center' : copy.align === 'right' ? 'flex-end' : 'flex-start'};`;
}
function isWidthOnlyFit(fit: CopyStyle['fit']): fit is Extract<NonNullable<CopyStyle['fit']>, { mode: 'width-only' }> {
  return Boolean(fit && 'mode' in fit && fit.mode === 'width-only');
}
function fitAttributes(copy: CopyStyle): string {
  if (isWidthOnlyFit(copy.fit)) return ' data-lhb-v3-fit-container="single-line"';
  return copy.fit ? ` data-lhb-v3-fit="single-line" data-lhb-v3-min="${copy.fit.minFontSize}" data-lhb-v3-max="${copy.fit.maxFontSize}"${copy.fit.softMinFontSize === undefined ? '' : ` data-lhb-v3-soft-min="${copy.fit.softMinFontSize}"`}` : '';
}
function widthFitAttributes(copy: CopyStyle): string {
  const fit = copy.fit;
  return isWidthOnlyFit(fit) ? ` data-lhb-v3-fit="width-only"${fit.maxFontSize === undefined ? '' : ` data-lhb-v3-max="${fit.maxFontSize}"`}${fit.softMinFontSize === undefined ? '' : ` data-lhb-v3-soft-min="${fit.softMinFontSize}"`}` : '';
}
function formatCopyText(copy: CopyStyle, text: string): string {
  if (copy.textFormat !== 'legacy-lines') return text;
  return text
    .replace(/(?:<\s*br\s*\/?\s*>|&lt;\s*br\s*\/?\s*&gt;)/gi, '\n')
    .replace(/\r\n/g, '\n')
    .split(/\n/)
    .map(segment => segment.trim().replace(/\s+([^\s]{1,12})$/u, '\u00A0$1'))
    .join('\n');
}
function content(copy: CopyStyle, text: string, block = false): string | null {
  const escapedText = escape(formatCopyText(copy, text));
  if (copy.omitIfEmpty === true && escapedText === '') return null;
  if (block) return escapedText;
  return `<span data-lhb-v3-text="true"${widthFitAttributes(copy)} style="display:inline-block;min-width:0;${copy.typography?.wrap === 'single-line' ? 'flex:none;max-width:none;' : 'width:100%;'}">${escapedText}</span>`;
}
export function renderBookV3Copy(copy: BookV3CopyBlock, interpolate: (text: string) => string, canvas: BookCanvas): string {
  const opening = `<div class="lhb-v3-copy" data-copy-block-id="${escape(copy.id)}"${fitAttributes(copy)} style="${bookPlacementCss(resolveBookPlacement(copy.placement, canvas))}${textStyle(copy)}">`;
  const inner = content(copy, interpolate(copy.text));
  return inner === null ? '' : `${opening}${inner}</div>`;
}

function stackStyle(stack: Pick<BookV3Stack, 'padding' | 'gap' | 'alignment' | 'frame' | 'flowMode' | 'blockTextAlign'>): string {
  const padding = stack.padding;
  const frame = stack.frame;
  const border = frame ? `${frame.color}${Math.round(frame.opacity * 255).toString(16).padStart(2, '0')}` : 'transparent';
  if (stack.flowMode === 'block') return `display:block;${stack.blockTextAlign === undefined ? '' : `text-align:${stack.blockTextAlign};`}padding:${padding ? `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px` : '0'};${frame ? `border:${frame.width}px solid ${border};border-radius:${frame.radius}px;` : ''}`;
  return `display:flex;flex-direction:column;align-items:${stack.alignment === 'start' ? 'flex-start' : stack.alignment === 'end' ? 'flex-end' : 'center'};gap:${stack.gap ?? 0}px;padding:${padding ? `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px` : '0'};${frame ? `border:${frame.width}px solid ${border};border-radius:${frame.radius}px;` : ''}`;
}
function blockPlacement(node: BookV3Stack | BookV3StackText): string {
  const box = node.blockBox;
  const width = node.width === undefined ? box?.widthMode === 'fill' ? '100%' : 'auto' : `${node.width}px`;
  const margin = box?.inlineMargin === 'auto' ? 'auto' : '0';
  return `position:${box?.position === 'relative' ? 'relative' : 'static'};width:${width};${box?.maxWidth === undefined ? '' : `max-width:${box.maxWidth}px;`}margin:${node.spacingBefore ?? 0}px ${margin} ${node.spacingAfter ?? 0}px;`;
}
function blockTextStyle(copy: BookV3StackText): string {
  return `font-size:${copy.fontSize}px;line-height:${copy.lineHeight};color:${copy.color};text-align:${copy.align};padding:${copy.padding}px;${copy.backgroundColor ? `background:${copy.backgroundColor};` : ''}letter-spacing:${copy.typography?.trackingPx ?? 0}px;text-transform:${copy.typography?.case === 'uppercase' ? 'uppercase' : 'none'};white-space:${copy.blockText?.whiteSpace === 'normal' ? 'normal' : 'pre-line'};display:block;`;
}
function renderNode(node: BookV3Stack | BookV3StackText, interpolate: (text: string) => string, parentBlock = false): string {
  if (parentBlock) {
    const placement = blockPlacement(node);
    if (node.kind === 'stack') return `<div data-lhb-v3-stack="${escape(node.id)}" style="${placement}${stackStyle(node)}">${node.children.map(child => renderNode(child, interpolate, node.flowMode === 'block')).join('')}</div>`;
    const opening = `<div class="lhb-v3-copy" data-copy-block-id="${escape(node.id)}" data-lhb-v3-text="true" style="${placement}${blockTextStyle(node)}">`;
    const inner = content(node, interpolate(node.text), true);
    return inner === null ? '' : `${opening}${inner}</div>`;
  }
  const placement = `position:relative;flex:none;width:${node.width === undefined ? '100%' : `${node.width}px`};margin:${node.spacingBefore ?? 0}px 0 ${node.spacingAfter ?? 0}px;`;
  if (node.kind === 'stack') return `<div data-lhb-v3-stack="${escape(node.id)}" style="${placement}${stackStyle(node)}">${node.children.map(child => renderNode(child, interpolate, node.flowMode === 'block')).join('')}</div>`;
  const opening = `<div class="lhb-v3-copy" data-copy-block-id="${escape(node.id)}"${fitAttributes(node)} style="${placement}${node.boxHeight === undefined ? '' : `height:${node.boxHeight}px;`}${textStyle(node)}">`;
  const inner = content(node, interpolate(node.text));
  return inner === null ? '' : `${opening}${inner}</div>`;
}
export function renderBookV3Stacks(stacks: BookV3RootStack[] | undefined, interpolate: (text: string) => string, canvas: BookCanvas): string {
  return (stacks ?? []).map(stack => `<div data-lhb-v3-stack="${escape(stack.id)}" style="${bookPlacementCss(resolveBookPlacement(stack.placement, canvas))}${stackStyle(stack)}">${stack.children.map(child => renderNode(child, interpolate, stack.flowMode === 'block')).join('')}</div>`).join('');
}

/** Static trusted code. Dynamic copy and configuration never enter executable source. */
export function bookV3FitScript(widthOnly = false): string {
  return String.raw`(() => {
  const html = document.documentElement;
  if (html.dataset.lhbV3RoutineInstalled === 'true') return;
  html.dataset.lhbV3RoutineInstalled = 'true';
  let complete;
  window.__lhbV3LayoutReady = new Promise(resolve => { complete = resolve; });
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
  async function run() {
    const roots = Array.from(document.querySelectorAll('[data-lhb-v3-root]'));
    let fontsReady = false;
    let timer;
    try {
      if (!document.fonts) throw new Error('Font API unavailable');
      const faces = await Promise.race([
        document.fonts.load('16px LhbConfiguredBook').then(async loaded => { await document.fonts.ready; return loaded; }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Font readiness timeout')), 5000); })
      ]);
      if (!faces.length || !faces.some(face => face.status === 'loaded')) throw new Error('Configured font unavailable');
      fontsReady = true;
    } catch (_) {
      roots.forEach(root => { root.dataset.lhbV3LayoutStatus = 'font-error'; });
    } finally { clearTimeout(timer); }
    const results = [];
    if (fontsReady) {
      await frame();
      for (let pass = 0; pass < 2; pass++) {
        roots.forEach(root => {
          let failed = false;
${widthOnly ? String.raw`          root.querySelectorAll('[data-lhb-v3-fit="width-only"]').forEach(inner => {
            const container = inner.closest('[data-lhb-v3-fit-container="single-line"]') || inner.parentElement;
            if (!container) { inner.dataset.lhbV3FitStatus = 'invalid-box'; failed = true; return; }
            const maximumRaw = inner.getAttribute('data-lhb-v3-max');
            const softRaw = inner.getAttribute('data-lhb-v3-soft-min');
            const maximum = maximumRaw === null || maximumRaw === '' ? null : Number(maximumRaw);
            const soft = softRaw === null || softRaw === '' ? null : Number(softRaw);
            let size = maximum === null ? parseFloat(getComputedStyle(inner).fontSize) || 120 : maximum;
            const valid = Number.isFinite(size) && size > 0 && size <= 512 &&
              (soft === null || Number.isFinite(soft) && soft > 0 && soft <= 512);
            if (!valid) { inner.dataset.lhbV3FitStatus = 'invalid-box'; failed = true; return; }
            const measure = () => {
              const width = container.clientWidth || container.getBoundingClientRect().width || 0;
              const scrollWidth = inner.scrollWidth;
              const valid = Number.isFinite(width) && width >= 0 && Number.isFinite(scrollWidth) && scrollWidth >= 0;
              return { valid, fits: scrollWidth <= width + 0.5 };
            };
            inner.style.display = 'inline-block';
            inner.style.whiteSpace = 'nowrap';
            inner.style.maxWidth = 'none';
            inner.style.fontSize = size + 'px';
            let state = measure();
            while (state.valid && !state.fits && size > 24) {
              size -= 1;
              inner.style.fontSize = size + 'px';
              state = measure();
            }
            if (!state.valid) { inner.dataset.lhbV3FitStatus = 'invalid-box'; failed = true; return; }
            inner.dataset.lhbV3FitApplied = String(size);
            if (soft !== null && size < soft) inner.dataset.lhbV3FitSoftMinExceeded = 'true';
            if (!state.fits) {
              inner.dataset.lhbV3FitOverflow = 'true';
              html.dataset.lhbV3FitOverflow = 'true';
            }
            const overflow = inner.dataset.lhbV3FitOverflow === 'true';
            inner.dataset.lhbV3FitStatus = overflow ? 'overflow' : inner.dataset.lhbV3FitSoftMinExceeded === 'true' ? 'soft-min-exceeded' : 'fit';
            if (overflow) failed = true;
          });
` : ''}          root.querySelectorAll('[data-lhb-v3-fit="single-line"]').forEach(box => {
            const inner = box.querySelector('[data-lhb-v3-text]');
            const style = getComputedStyle(box);
            const width = box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
            const height = box.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
            const minimum = Number(box.dataset.lhbV3Min), maximum = Number(box.dataset.lhbV3Max);
            const soft = box.dataset.lhbV3SoftMin === undefined ? null : Number(box.dataset.lhbV3SoftMin);
            let size = maximum;
            const valid = inner && width > 0 && height > 0 && Number.isFinite(minimum) && Number.isFinite(maximum) && minimum > 0 && maximum >= minimum && maximum <= 512;
            if (!valid) { box.dataset.lhbV3FitStatus = 'invalid-box'; failed = true; return; }
            const fits = () => inner.scrollWidth <= width + 0.5 && inner.offsetHeight <= height + 0.5;
            box.style.fontSize = size + 'px';
            while (!fits() && size > minimum) { size = Math.max(minimum, size - 1); box.style.fontSize = size + 'px'; }
            const fitsNow = fits();
            box.dataset.lhbV3FitApplied = String(size);
            box.dataset.lhbV3FitStatus = !fitsNow ? 'overflow' : soft !== null && size < soft ? 'soft-min-exceeded' : 'fit';
            if (!fitsNow) failed = true;
          });
          root.dataset.lhbV3LayoutStatus = failed ? 'overflow' : 'ready';
        });
        await frame();
      }
    }
    roots.forEach(root => results.push({ page: root.dataset.pageLabel, status: root.dataset.lhbV3LayoutStatus }));
    complete({ status: roots.length && results.every(result => result.status === 'ready') ? 'ready' : 'failed', roots: results });
  }
  const start = () => run().catch(() => {
    document.querySelectorAll('[data-lhb-v3-root]').forEach(root => { root.dataset.lhbV3LayoutStatus = 'error'; });
    complete({ status: 'failed', roots: [] });
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();`;
}
export const BOOK_V3_FIT_SCRIPT = bookV3FitScript();

export function bookV3FontCss(keys: string[], assetUrl: (key: string) => string): string {
  const url = (key: string) => assetUrl(key).replace(/[\u0000-\u0020'"\\<>]/g, char => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`);
  return `@font-face{font-family:LhbConfiguredBook;src:${keys.map(key => `url('${url(key)}')`).join(',')};font-display:block}.lhb-v3-copy{box-sizing:border-box;margin:0;font-weight:400;min-width:0}.lhb-v3-copy *{box-sizing:border-box}`;
}
