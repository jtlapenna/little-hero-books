const escapeText = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const FLOW_COPY_CSS = '.lhb-copy.lhb-flow{white-space:normal}.lhb-flow-paragraph{margin:0;padding:0;white-space:pre-wrap;overflow-wrap:anywhere}';

export function resolveGuideTokens(guide) {
  const name = guide === 't-rex' ? 'T-Rex' : guide[0].toUpperCase() + guide.slice(1);
  const clue = ['owl', 'penguin'].includes(guide) ? 'a feather' : guide === 'unicorn' ? 'a tuft of colorful fur' : guide === 't-rex' ? 'a giant footprint' : 'a paw print';
  const clues = ['owl', 'penguin'].includes(guide) ? 'feathers' : guide === 'unicorn' ? 'colorful fur' : guide === 't-rex' ? 'giant footprints' : 'paw prints';
  return { name, clue, clues };
}

export function renderFlowContent(flow, tokens) {
  const renderRun = (run, grouped = false) => {
    const resolved = run.text.replace(/\[([^\]]+)\]/g, (_match, key) => {
      const value = tokens[key.toLowerCase()];
      if (value === undefined) throw new Error(`Unknown configured copy token ${key}`);
      return value;
    });
    if (grouped && /[\r\n\f]/.test(resolved)) throw new Error('Grouped flow values cannot contain line breaks');
    if (run.atomicPhrase && /\p{Surrogate}/u.test(resolved)) throw new Error('Atomic phrase values cannot contain unpaired surrogates');
    if (run.atomicPhrase && /[\r\n\v\f\u0085\u2028\u2029]/.test(resolved)) throw new Error('Atomic phrase values cannot contain line breaks');
    const style = run.style ?? {};
    const declarations = [
      ...(style.color ? [`color:${style.color};`] : []),
      ...(style.sizeRatio !== undefined ? [`font-size:${style.sizeRatio * 100}%;`] : []),
      ...(run.atomicPhrase ? ['display:inline-block;white-space:pre;overflow-wrap:normal;'] : []),
      ...(style.rotateDeg ? [`${run.atomicPhrase ? '' : 'display:inline-block;'}transform:rotate(${style.rotateDeg}deg);`] : []),
    ].join('');
    return `<span${declarations ? ` style="${declarations}"` : ''}>${escapeText(resolved)}</span>`;
  };
  return flow.paragraphs.map(paragraph => {
    if (paragraph.runs.some((run, index, runs) => {
      if (!run.atomicPhrase) return false;
      let before = index - 1;
      while (before >= 0 && !runs[before].text.trim()) before--;
      if (before >= 0 && /^[\s\p{P}]+$/u.test(runs[before].text.replace(/\[[^\]]+\]/g, 'X')) && runs.slice(before, index).some(item => item.keepWithNext !== true)) return true;
      let after = index + 1;
      while (after < runs.length && !runs[after].text.trim()) after++;
      return after < runs.length && /^[\s\p{P}]+$/u.test(runs[after].text.replace(/\[[^\]]+\]/g, 'X')) && runs.slice(index, after).some(item => item.keepWithNext !== true);
    })) throw new Error('Adjacent punctuation must stay with an atomic phrase');
    const chunks = [];
    for (let i = 0; i < paragraph.runs.length; i++) {
      const run = paragraph.runs[i];
      if (!run.keepWithNext) { chunks.push(renderRun(run)); continue; }
      let group = renderRun(run, true);
      while (paragraph.runs[i].keepWithNext) group += renderRun(paragraph.runs[++i], true);
      chunks.push(`<span style="white-space:pre;overflow-wrap:normal;">${group}</span>`);
    }
    return `<p class="lhb-flow-paragraph">${chunks.join('')}</p>`;
  }).join('');
}
