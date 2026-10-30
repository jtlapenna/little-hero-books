import type { BookV3CopyBlock, BookV3RootStack, BookV3Stack, BookV3StackText } from './book-render-contract';
import { bookPlacementCss, resolveBookPlacement, type BookCanvas } from './book-layout-geometry';

const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
type CopyStyle = Pick<BookV3CopyBlock, 'fontSize' | 'lineHeight' | 'color' | 'align' | 'padding' | 'backgroundColor' | 'typography' | 'fit'>;

function textStyle(copy: CopyStyle): string {
  const type = copy.typography;
  return `font-size:${copy.fit?.maxFontSize ?? copy.fontSize}px;line-height:${copy.lineHeight};color:${copy.color};text-align:${copy.align};padding:${copy.padding}px;${copy.backgroundColor ? `background:${copy.backgroundColor};` : ''}letter-spacing:${type?.trackingPx ?? 0}px;text-transform:${type?.case === 'uppercase' ? 'uppercase' : 'none'};white-space:${type?.wrap === 'single-line' ? 'nowrap' : 'pre-line'};text-wrap:${type?.wrap === 'balanced' ? 'balance' : 'wrap'};overflow-wrap:${type?.wrap === 'single-line' ? 'normal' : 'break-word'};display:flex;align-items:${type?.verticalAlign === 'center' ? 'center' : type?.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start'};justify-content:${copy.align === 'center' ? 'center' : copy.align === 'right' ? 'flex-end' : 'flex-start'};`;
}
function fitAttributes(copy: CopyStyle): string {
  return copy.fit ? ` data-lhb-v3-fit="single-line" data-lhb-v3-min="${copy.fit.minFontSize}" data-lhb-v3-max="${copy.fit.maxFontSize}"${copy.fit.softMinFontSize === undefined ? '' : ` data-lhb-v3-soft-min="${copy.fit.softMinFontSize}"`}` : '';
}
function content(copy: CopyStyle, text: string): string {
  return `<span data-lhb-v3-text="true" style="display:inline-block;min-width:0;${copy.typography?.wrap === 'single-line' ? 'flex:none;max-width:none;' : 'width:100%;'}">${escape(text)}</span>`;
}
export function renderBookV3Copy(copy: BookV3CopyBlock, interpolate: (text: string) => string, canvas: BookCanvas): string {
  return `<div class="lhb-v3-copy" data-copy-block-id="${escape(copy.id)}"${fitAttributes(copy)} style="${bookPlacementCss(resolveBookPlacement(copy.placement, canvas))}${textStyle(copy)}">${content(copy, interpolate(copy.text))}</div>`;
}

function stackStyle(stack: Pick<BookV3Stack, 'padding' | 'gap' | 'alignment' | 'frame'>): string {
  const padding = stack.padding;
  const frame = stack.frame;
  const border = frame ? `${frame.color}${Math.round(frame.opacity * 255).toString(16).padStart(2, '0')}` : 'transparent';
  return `display:flex;flex-direction:column;align-items:${stack.alignment === 'start' ? 'flex-start' : stack.alignment === 'end' ? 'flex-end' : 'center'};gap:${stack.gap ?? 0}px;padding:${padding ? `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px` : '0'};${frame ? `border:${frame.width}px solid ${border};border-radius:${frame.radius}px;` : ''}`;
}
function renderNode(node: BookV3Stack | BookV3StackText, interpolate: (text: string) => string): string {
  const placement = `position:relative;flex:none;width:${node.width === undefined ? '100%' : `${node.width}px`};margin:${node.spacingBefore ?? 0}px 0 ${node.spacingAfter ?? 0}px;`;
  if (node.kind === 'stack') return `<div data-lhb-v3-stack="${escape(node.id)}" style="${placement}${stackStyle(node)}">${node.children.map(child => renderNode(child, interpolate)).join('')}</div>`;
  return `<div class="lhb-v3-copy" data-copy-block-id="${escape(node.id)}"${fitAttributes(node)} style="${placement}${node.boxHeight === undefined ? '' : `height:${node.boxHeight}px;`}${textStyle(node)}">${content(node, interpolate(node.text))}</div>`;
}
export function renderBookV3Stacks(stacks: BookV3RootStack[] | undefined, interpolate: (text: string) => string, canvas: BookCanvas): string {
  return (stacks ?? []).map(stack => `<div data-lhb-v3-stack="${escape(stack.id)}" style="${bookPlacementCss(resolveBookPlacement(stack.placement, canvas))}${stackStyle(stack)}">${stack.children.map(child => renderNode(child, interpolate)).join('')}</div>`).join('');
}

/** Static trusted code. Dynamic copy and configuration never enter executable source. */
export const BOOK_V3_FIT_SCRIPT = String.raw`(() => {
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
          root.querySelectorAll('[data-lhb-v3-fit="single-line"]').forEach(box => {
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

export function bookV3FontCss(keys: string[], assetUrl: (key: string) => string): string {
  const url = (key: string) => assetUrl(key).replace(/[\u0000-\u0020'"\\<>]/g, char => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`);
  return `@font-face{font-family:LhbConfiguredBook;src:${keys.map(key => `url('${url(key)}')`).join(',')};font-display:block}.lhb-v3-copy{box-sizing:border-box;margin:0;font-weight:400;min-width:0}.lhb-v3-copy *{box-sizing:border-box}`;
}
