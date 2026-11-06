'use strict';
const Lettering = (() => {
  let data, draft, selected, preview, flowRuntime, ready = false, mode = 'text';
  let dirty = false, blocked = false, saving = false, hasSaved = false, timer, cacheKey, editVersion = 0;
  let runSelectionKey = '', runIndex = 0;
  let pending = Promise.resolve(), pointer = null, lastError = '';
  const measure = document.createElement('canvas').getContext('2d');
  const normalize = text => text.replace(/\s+/g, ' ').trim();
  const copy = value => JSON.parse(JSON.stringify(value));
  const completeFields = text => !/[\[\]]/.test(text.replace(/\[[^\[\]]+\]/g, ''));
  const signature = value => JSON.stringify(value, (key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))) : item);
  const factor = () => data.units / (data.pageSizeMm * 72 / 25.4);
  const page = n => draft.pages[n - 1];
  const block = () => page(current).blocks.find(b => b.id === selected);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const guides = ['cat','dog','owl','lion','tiger','penguin','t-rex','unicorn'];
  const flowTokens = new Set(['child name','hometown','animal guide','animal clue','animal clues','object pronoun','subject pronoun','possessive pronoun','dedication message']);
  function flowWords(flow) {
    if (!flow || Object.keys(flow).join() !== 'paragraphs' || !Array.isArray(flow.paragraphs) || !flow.paragraphs.length || flow.paragraphs.length > 100) throw Error('Flow paragraphs are invalid.');
    return flow.paragraphs.map(p => {
      if (!p || Object.keys(p).join() !== 'runs' || !Array.isArray(p.runs) || !p.runs.length || p.runs.length > 100) throw Error('Flow runs are invalid.');
      if (p.runs.some((run,index,runs)=>{if(!run?.atomicPhrase)return false;let before=index-1;while(before>=0&&typeof runs[before]?.text==='string'&&!runs[before].text.trim())before--;if(before>=0&&typeof runs[before]?.text==='string'&&/^[\s\p{P}]+$/u.test(runs[before].text.replace(/\[[^\]]+\]/g,'X'))&&runs.slice(before,index).some(item=>item?.keepWithNext!==true))return true;let after=index+1;while(after<runs.length&&typeof runs[after]?.text==='string'&&!runs[after].text.trim())after++;return after<runs.length&&typeof runs[after]?.text==='string'&&/^[\s\p{P}]+$/u.test(runs[after].text.replace(/\[[^\]]+\]/g,'X'))&&runs.slice(index,after).some(item=>item?.keepWithNext!==true)})) throw Error('Adjacent punctuation must stay with an atomic phrase.');
      return p.runs.map((run,index) => {
        if (!run || Object.keys(run).some(k=>!['text','style','keepWithNext','atomicPhrase'].includes(k)) || typeof run.text !== 'string' || !run.text || run.text.length > 8000) throw Error('Flow run is invalid.');
        if ('atomicPhrase' in run && run.atomicPhrase !== true) throw Error('Atomic phrase marker is invalid.');
        if ('keepWithNext' in run && (typeof run.keepWithNext !== 'boolean' || index === p.runs.length - 1)) throw Error('Flow grouping is invalid.');
        if (/[\r\n]/.test(run.text) || /[\[\]]/.test(run.text.replace(/\[[^\[\]]+\]/g,'')) || [...run.text.matchAll(/\[([^\[\]]+)\]/g)].some(match=>!flowTokens.has(match[1].toLowerCase()))) throw Error('Flow token is invalid.');
        if (run.atomicPhrase && (run.text.length>256 || /\p{Surrogate}/u.test(run.text) || /[\r\n\v\f\u0085\u2028\u2029]/.test(run.text) || [...run.text.matchAll(/\[([^\[\]]+)\]/g)].some(match=>!['animal guide','animal clue','animal clues'].includes(match[1].toLowerCase())))) throw Error('Atomic phrase is invalid.');
        if ('style' in run) {
          const style = run.style;
          if (!style || typeof style !== 'object' || Array.isArray(style) || Object.keys(style).some(k=>!['color','sizeRatio','rotateDeg'].includes(k))) throw Error('Flow style is invalid.');
          if ('color' in style && (typeof style.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(style.color))) throw Error('Flow color is invalid.');
          for (const [key,min,max] of [['sizeRatio',.5,2],['rotateDeg',-15,15]]) if (key in style && (typeof style[key] !== 'number' || !Number.isFinite(style[key]) || style[key]<min || style[key]>max)) throw Error('Flow style is invalid.');
          if (!run.atomicPhrase && style.rotateDeg && /[\s\[\]]/.test(run.text)) throw Error('Rotated emphasis must be one literal word.');
        }
        return [run.text, 'keepWithNext' in run, run.keepWithNext ?? null, 'atomicPhrase' in run, run.atomicPhrase ?? null];
      });
    });
  }

  function tokenValues() {
    const forms = {'she/her':['she','her','her'],'he/him':['he','him','his'],'they/them':['they','them','their']}[preview.pronouns];
    const guide = preview.animalGuide || 'owl';
    const {name:guideName,clue,clues} = flowRuntime.resolveGuideTokens(guide);
    return {'child name':preview.childName,'subject pronoun':forms[0],'object pronoun':forms[1],'possessive pronoun':forms[2], 'animal guide':guideName, 'animal clue':clue, 'animal clues':clues, hometown:preview.hometown || 'a cozy town', 'dedication message':preview.dedicationMessage || ''};
  }
  function resolveText(text) {
    const fields = tokenValues();
    return text.replace(/\[([^\]]+)\]/g, (match,key) => fields[normalize(key).toLowerCase()] ?? match);
  }

  function previewChanged() {
    preview.childName = $('previewName').value.trim() || data.previewPersonalization.childName;
    preview.pronouns = $('previewPronouns').value;
    preview.animalGuide = $('previewGuide').value;
    try { localStorage.setItem(cacheKey+'-preview', JSON.stringify(preview)); } catch {}
    draw(); controls(); updateRail();
  }

  function fresh() {
    return {schema:data.stateSchema || 'lhb.lettering-review@v1', bookId:data.bookId,
      baselineFingerprint:data.baselineFingerprint, layoutFingerprint:data.layoutFingerprint,
      revision:0, savedAt:new Date().toISOString(), pages:data.pages.map(p => ({
        page:p.page, pageId:p.pageId, reviewed:false, notes:'', blocks:copy(p.blocks)}))};
  }

  function validate(candidate) {
    for (const [key, expected] of Object.entries({schema:data.stateSchema || 'lhb.lettering-review@v1',
      bookId:data.bookId, baselineFingerprint:data.baselineFingerprint, layoutFingerprint:data.layoutFingerprint})) {
      if (candidate?.[key] !== expected) throw Error('Lettering belongs to a different book or text draft.');
    }
    if (!Number.isInteger(candidate.revision) || candidate.revision < 0 || typeof candidate.savedAt !== 'string' || candidate.savedAt.length > 40 || !Array.isArray(candidate.pages) || candidate.pages.length !== data.pages.length) throw Error('Lettering draft is incomplete.');
    const result = fresh();
    result.revision = candidate.revision;
    result.savedAt = candidate.savedAt;
    for (let i = 0; i < data.pages.length; i++) {
      const p = candidate.pages[i], base = data.pages[i], ids = new Set();
      if (!p || p.page !== base.page || p.pageId !== base.pageId || typeof p.reviewed !== 'boolean' || typeof p.notes !== 'string' || p.notes.length > 4000 || !Array.isArray(p.blocks) || p.blocks.length > 60) throw Error('Lettering page data is incomplete.');
      const v2 = result.schema === 'lhb.lettering-review@v2';
      for (const b of p.blocks) {
        if (!b || typeof b.id !== 'string' || !(v2 ? /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/ : /^[A-Za-z0-9_-]{1,64}$/).test(b.id) || ids.has(b.id) || typeof b.text !== 'string' || !b.text.trim() || b.text.length > 8000) throw Error('A text block is invalid.');
        if (!completeFields(b.text)) throw Error('Keep each bracketed personalization field in one text block.');
        ids.add(b.id);
        for (const [key, min, max] of [['left',-data.units,data.units*2],['top',-data.units,data.units*2],['width',data.units*.05,data.units],['size',8,72],['leading',8,120],['rotation',-45,45]]) {
          if (typeof b[key] !== 'number' || !Number.isFinite(b[key]) || b[key] < min || b[key] > max) throw Error('Text size or position is invalid.');
        }
        if (!['left','center','right'].includes(b.align) || typeof b.edge !== 'boolean' || typeof b.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(b.color)) throw Error('Text styling is invalid.');
      }
      if (normalize(p.blocks.map(b => b.text).join(' ')) !== normalize(base.blocks.map(b => b.text).join(' '))) throw Error('Story words changed. Only line breaks and spacing can change here.');
      const expectedFlows = Object.fromEntries(base.blocks.filter(b=>b.flow).map(b=>[b.id,flowWords(b.flow)]));
      const actualFlows = Object.fromEntries(p.blocks.filter(b=>b.flow).map(b=>[b.id,flowWords(b.flow)]));
      if (v2 && signature(expectedFlows)!==signature(actualFlows)) throw Error('Flow runs belong to another text draft.');
      if (v2 && p.blocks.some(b=>b.flow && (typeof b.height!=='number' || !Number.isFinite(b.height) || b.height<=0 || b.height>data.units*2))) throw Error('Flow height is invalid.');
      if (v2 && p.blocks.some(b=>b.flow && (typeof (b.padding===undefined?0:b.padding)!=='number' || !Number.isFinite(b.padding===undefined?0:b.padding) || (b.padding===undefined?0:b.padding)<0 || (b.padding===undefined?0:b.padding)>256))) throw Error('Flow inside margin is invalid.');
      if (v2 && p.blocks.some(b=>b.flow && 2*(b.padding===undefined?0:b.padding)>=Math.min(b.width,b.height))) throw Error('Flow inside margin leaves no text area.');
      if (v2 && p.blocks.some(b=>b.flow && b.text!==b.flow.paragraphs.map(p=>p.runs.map(r=>r.text).join('')).join('\n'))) throw Error('Flow text does not match its runs.');
      if (v2 && p.blocks.some(b=>b.flow && /<(?:\/?[a-z]|!|\?)[^>]*>/i.test(b.text))) throw Error('Flow text cannot contain markup.');
      result.pages[i] = {page:p.page,pageId:p.pageId,reviewed:p.reviewed,notes:p.notes,
        blocks:p.blocks.map(b=>({...Object.fromEntries(['id','text','left','top','width','size','leading','color','align','rotation','edge'].map(key=>[key,b[key]])), ...(v2 && b.flow ? {height:b.height,padding:b.padding??0,flow:copy(b.flow)} : {})}))};
    }
    return result;
  }

  function cache() {
    try { sessionStorage.setItem(cacheKey, JSON.stringify({draft, dirty})); }
    catch { warning('Browser storage is unavailable. Download adjustments before closing.'); }
  }

  function status() {
    if (mode !== 'text' || !ready) return;
    $('saveStatus').textContent = blocked ? 'Save conflict · download a backup' : lastError ? 'Save failed · download a backup' : dirty ? 'Saving lettering…' : hasSaved ? 'Lettering saved on this Mac' : 'Ready · approved starting layout';
  }

  function warning(message, recover = false) {
    const banner = $('errorBanner');
    banner.replaceChildren(document.createTextNode(message));
    banner.hidden = false;
    banner.dataset.lettering = 'true';
    if (recover) {
      const button = document.createElement('button');
      button.textContent = 'Load saved lettering';
      button.onclick = async () => {
        try {
          const response = await fetch('/text-state');
          if (!response.ok) throw Error('Could not load saved lettering.');
          const value = await response.json();
          const next = value ? validate(value) : fresh();
          pushHistory(); draft = next; hasSaved = !!value; blocked = dirty = false; lastError = '';
          banner.hidden = true; delete banner.dataset.lettering;
          cache(); render(); status(); announce('Saved lettering loaded. Undo can restore your browser adjustments.');
        } catch (error) { announce(error.message); }
      };
      banner.append(button);
    }
  }

  function changed(markReview = true) {
    if (markReview) page(current).reviewed = false;
    draft.savedAt = new Date().toISOString();
    editVersion++; dirty = true; lastError = '';
    cache(); status(); updateRail();
    clearTimeout(timer); timer = setTimeout(save, 450);
  }

  function save() {
    if (!ready || !dirty || blocked) return Promise.resolve();
    if (saving) return pending;
    const snapshot = copy(draft), version = editVersion;
    saving = true;
    pending = (async () => {
      try {
        const response = await fetch('/text-state', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(snapshot)});
        const result = await response.json();
        if (!response.ok) {
          if (response.status === 409) blocked = true;
          throw Error(result.error || 'Could not save lettering.');
        }
        if (!Number.isInteger(result.revision) || result.revision !== snapshot.revision + 1) throw Error('Save response was incomplete. Reload after downloading a backup.');
        draft.revision = result.revision;
        hasSaved = true;
        if (version === editVersion) dirty = false;
        lastError = '';
        if ($('errorBanner').dataset.lettering && !blocked) {
          $('errorBanner').hidden = true; delete $('errorBanner').dataset.lettering;
        }
      } catch (error) {
        lastError = error.message;
        warning(blocked ? 'A newer lettering draft is saved. Download adjustments before loading the saved version.' : error.message + ' This tab holds the unsaved copy. Download a backup before closing.', blocked);
      } finally {
        saving = false; cache(); status();
        if (dirty && !blocked && !lastError) { clearTimeout(timer); timer = setTimeout(save, 100); }
      }
    })();
    return pending;
  }

  function linesFor(b) {
    const size = b.size * factor();
    if (b.flow) return {lines:[],orphan:false,size,leading:b.leading*factor(),height:b.height};
    measure.font = `${size}px HandBook`;
    measure.fontKerning = 'none';
    const lines = [];
    let orphan = false;
    for (const explicit of resolveText(b.text).split('\n')) {
      const paragraph = [];
      let line = '';
      for (const word of explicit.trim().split(/\s+/).filter(Boolean)) {
        const next = line ? line + ' ' + word : word;
        if (line && measure.measureText(next).width > b.width) { paragraph.push(line); line = word; }
        else line = next;
      }
      paragraph.push(line);
      if (paragraph.length > 1 && paragraph.at(-1).split(/\s+/).length === 1) {
        const previous = paragraph.at(-2).split(/\s+/);
        const paired = previous.at(-1) + ' ' + paragraph.at(-1);
        if (previous.length > 2 && measure.measureText(paired).width <= b.width) {
          paragraph[paragraph.length-2] = previous.slice(0,-1).join(' ');
          paragraph[paragraph.length-1] = paired;
        }
      }
      if (paragraph.length > 1 && paragraph.some(line => line.trim().split(/\s+/).length === 1)) orphan = true;
      lines.push(...paragraph);
    }
    return {lines, orphan, size, leading:b.leading*factor(), height:size+(lines.length-1)*b.leading*factor()};
  }

  function groups(n) {
    return page(n).blocks.map(b => {
      const m = linesFor(b), active = n === current && selected === b.id, offset = b.flow ? 0 : m.size*.8;
      const soft = data.pages[n-1].contrastStyle === 'soft-shadow';
      const x = b.align === 'center' ? b.width/2 : b.align === 'right' ? b.width : 0;
      const anchor = b.align === 'center' ? 'middle' : b.align === 'right' ? 'end' : 'start';
      const content = b.flow ? `<foreignObject x="0" y="${-offset}" width="${b.width}" height="${b.height}" overflow="visible"><div xmlns="http://www.w3.org/1999/xhtml" class="lhb-copy lhb-flow lhb-editor-flow" style="width:100%;height:100%;box-sizing:border-box;padding:${b.padding??0}px;font-family:HandBook;font-size:${m.size}px;line-height:${b.leading/b.size};color:${b.color};text-align:${b.align};${b.edge && soft?'text-shadow:0 3px 7px rgba(16,36,60,.75);':b.edge?'-webkit-text-stroke:2.315px rgba(23,50,74,.6);paint-order:stroke fill;':''}">${flowRuntime.renderFlowContent(b.flow,tokenValues())}</div></foreignObject>` : `<text fill="${b.color}" font-family="HandBook" font-kerning="none" font-size="${m.size}" text-anchor="${anchor}" ${b.edge && soft ? `filter="url(#lettering-shadow-${n})"` : b.edge?'paint-order="stroke" stroke="#17324a" stroke-opacity=".6" stroke-width="2.315" stroke-linejoin="round"':''}>${m.lines.map((line,i)=>`<tspan x="${x}" y="${i*m.leading}">${escapeHTML(line)||' '}</tspan>`).join('')}</text>`;
      return `<g class="text-block${active?' selected':''}" data-text-block="${b.id}" data-text-page="${n}" role="button" tabindex="${mode==='text'?0:-1}" aria-label="Text: ${escapeHTML(normalize(resolveText(b.text)).slice(0,65))}. Arrow keys move." transform="translate(${b.left} ${b.top+offset}) rotate(${b.rotation})"><rect class="text-hit" x="-12" y="${-offset-12}" width="${b.width+24}" height="${m.height+24}"/>${content}<rect class="text-frame" x="-12" y="${-offset-12}" width="${b.width+24}" height="${m.height+24}"/><g class="text-width-handle" data-text-width="true" role="button" tabindex="-1" aria-label="Drag to change text width" transform="translate(${b.width} ${m.height/2-offset})"><rect class="width-handle-target"/><rect class="width-handle-mark"/></g></g>`;
    }).join('');
  }

  function contents(n) {
    const presentation = data.pages[n-1];
    const areas = presentation.readingAreas || (presentation.readingArea ? [presentation.readingArea] : []);
    const surfaces = areas.map((area,i) => `<rect class="reading-area" x="${area.left}" y="${area.top}" width="${area.width}" height="${area.height}" rx="${area.feather}" fill="${area.color}" opacity="${area.opacity}" filter="url(#lettering-wash-${n}-${i})" pointer-events="none"/>`).join('');
    const washes = areas.map((area,i) => `<filter id="lettering-wash-${n}-${i}" x="-50%" y="-160%" width="200%" height="420%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${area.feather}"/></filter>`).join('');
    return `<defs><filter id="lettering-shadow-${n}" x="-20%" y="-60%" width="140%" height="220%" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy="3" stdDeviation="7" flood-color="#10243c" flood-opacity=".75"/></filter>${washes}</defs>${surfaces}${groups(n)}`;
  }

  function svg(n) {
    return `<svg class="text-overlay lettering-overlay" data-lettering-page="${n}" viewBox="0 0 ${data.units} ${data.units}" aria-label="Page ${n} text blocks">${contents(n)}</svg>`;
  }

  function fitHandles() {
    document.querySelectorAll('.lettering-overlay').forEach(svg => {
      const width = svg.getBoundingClientRect().width;
      if (!width) return;
      const hit = 44*data.units/width, mark = 10*data.units/width;
      svg.querySelectorAll('.width-handle-target,.width-handle-mark').forEach(rect => {
        const size = rect.classList.contains('width-handle-target') ? hit : mark;
        for (const key of ['width','height']) rect.setAttribute(key, size);
        for (const key of ['x','y']) rect.setAttribute(key, -size/2);
      });
    });
    boundsWarning();
  }

  function boundsWarning() {
    const b = block();
    $('textOrphanWarning').hidden = !b || !linesFor(b).orphan;
    if (!b) { $('textBoundsWarning').hidden = true; return; }
    const group = document.querySelector(`[data-text-page="${current}"][data-text-block="${selected}"] ${b.flow?'.lhb-editor-flow':'text'}`);
    const art = group?.closest('.artboard');
    if (!art) return;
    const box = group.getBoundingClientRect(), frame = art.getBoundingClientRect(), inset = frame.width*.03;
    let overflow = false;
    if (b.flow) {
      const owner = group.closest('[data-text-block]'), transform = owner.getAttribute('transform');
      try {
        if (b.rotation) owner.setAttribute('transform',`translate(${b.left} ${b.top})`);
        const local = group.getBoundingClientRect();
        overflow = group.scrollHeight>group.clientHeight || group.scrollWidth>group.clientWidth || [...group.querySelectorAll('span')].flatMap(span=>[...span.getClientRects()]).some(ink=>ink.left<local.left||ink.right>local.right||ink.top<local.top||ink.bottom>local.bottom);
      } finally { owner.setAttribute('transform',transform); }
    }
    const overlap = [...art.querySelectorAll(`[data-text-page="${current}"][data-text-block]`)].some(item => {
      if (item.dataset.textBlock === selected) return false;
      const other = item.querySelector(b.flow ? 'text,.lhb-editor-flow' : '.lhb-editor-flow')?.getBoundingClientRect();
      return other && box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top;
    });
    $('textBoundsWarning').textContent = overflow ? 'Text does not fit in this group. Adjust its size, width or height.' : overlap ? 'This text region overlaps another text block. Move or resize it before review.' : 'Text is close to the edge or outside this page. Move it inward or reduce its size or width.';
    $('textBoundsWarning').hidden = !(box.left < frame.left+inset || box.top < frame.top+inset || box.right > frame.right-inset || box.bottom > frame.bottom-inset || overflow || overlap);
  }

  function draw() {
    document.querySelectorAll('.lettering-overlay').forEach(svg => svg.innerHTML = contents(Number(svg.dataset.letteringPage)));
    fitHandles();
  }

  function controls() {
    if (!ready) return;
    document.body.classList.toggle('text-mode', mode === 'text');
    $('textModeBtn').setAttribute('aria-pressed', String(mode === 'text'));
    $('figureModeBtn').setAttribute('aria-pressed', String(mode !== 'text'));
    $('textInspector').hidden = mode !== 'text';
    $('figureListSection').hidden = mode === 'text';
    $('modeHint').textContent = mode === 'text' ? 'Character positions are locked while editing text.' : 'Text is locked while editing characters.';
    $('reviewLabel').textContent = mode === 'text' ? 'Text layout reviewed' : 'Placement reviewed';
    $('resetPageBtn').textContent = mode === 'text' ? 'Reset page lettering' : 'Reset page placements';
    const blocks = page(current).blocks;
    if (!blocks.some(b => b.id === selected)) { selected = blocks[0]?.id || null; draw(); }
    $('textBlockSelect').innerHTML = blocks.map((b,i)=>`<option value="${b.id}">${i+1}. ${escapeHTML(normalize(resolveText(b.text)).slice(0,50))}</option>`).join('');
    $('textBlockSelect').value = selected || '';
    $('textBlockSelect').hidden = !blocks.length;
    $('textBlockLabel').hidden = !blocks.length;
    $('emptyText').hidden = !!blocks.length;
    $('textControls').hidden = !blocks.length;
    if (mode === 'text') {
      $('subjectControls').hidden = true;
      $('reviewedInput').checked = page(current).reviewed;
      $('notesInput').value = page(current).notes;
      $('canvasHint').textContent = blocks.length ? 'Drag text to move. Pull its right handle to change width. Arrow keys nudge.' : 'This blank page has no text blocks.';
      status();
    }
    const b = block();
    if (!b) return;
    const content = $('textContent');
    if (document.activeElement !== content || content.dataset.block !== b.id) content.value = b.text;
    content.dataset.block = b.id;
    content.disabled = !!b.flow;
    $('flowHeight').hidden = !b.flow;
    $('flowHeightLabel').hidden = !b.flow;
    if (b.flow) $('flowHeight').value = Number((b.height/data.units*100).toFixed(2));
    $('flowPadding').hidden = !b.flow; $('flowPaddingLabel').hidden = !b.flow;
    if (b.flow) { $('flowPadding').max = 256/data.units*100; $('flowPadding').value = Number(((b.padding??0)/data.units*100).toFixed(2)); }
    $('flowStyleControls').hidden = !b.flow;
    if (b.flow) {
      const key = `${current}:${b.id}`;
      if (key !== runSelectionKey) { runSelectionKey = key; runIndex = 0; }
      const runs = b.flow.paragraphs.flatMap(p=>p.runs);
      runIndex = Math.max(0, Math.min(runIndex, runs.length - 1));
      $('flowRunSelect').innerHTML = runs.map((r,i)=>`<option value="${i}">${escapeHTML(normalize(resolveText(r.text)) || 'Space')}</option>`).join('');
      $('flowRunSelect').value = String(runIndex);
      const run = runs[runIndex], style = run.style || {};
      $('flowRunSize').value = (style.sizeRatio ?? 1) * 100;
      $('flowRunRotation').value = style.rotateDeg ?? 0;
      $('flowRunRotation').disabled = !run.atomicPhrase && /[\s\[\]]/.test(run.text);
      $('flowRunColor').value = style.color || b.color;
    }
    $('textHelp').textContent = b.flow ? 'This sentence wraps as one group. Move or resize the group to adjust its layout.' : 'Enter adds a line break. Width controls automatic wrapping. Story words stay fixed. Keep personalization fields in brackets.';
    $('splitTextBtn').disabled = !!b.flow;
    for (const [id,value] of [['textSize',b.size],['textWidth',b.width/data.units*100],['textLeft',b.left/data.units*100],['textTop',b.top/data.units*100],['textLeading',b.leading],['textRotation',b.rotation]]) $(id).value = Number(value.toFixed(2));
    if (document.activeElement !== $('previewName')) $('previewName').value = preview.childName;
    $('previewPronouns').value = preview.pronouns;
    $('previewGuide').value = preview.animalGuide;
    $('textEdgeLabel').textContent = data.pages[current-1].contrastStyle === 'soft-shadow' ? 'Soft text shadow' : 'Fine contrast edge';
    $('textAlign').value = b.align; $('textColor').value = b.color; $('textEdge').checked = b.edge;
    $('joinTextBtn').disabled = !!b.flow || !!blocks[blocks.indexOf(b)+1]?.flow || blocks.indexOf(b) === blocks.length-1;
  }

  function select(n, id) {
    if (n !== current) { selected = id; choosePage(n); }
    else { selected = id; controls(); draw(); }
  }

  function canUpdate(patch) {
    const currentBlock = block();
    if (currentBlock?.flow && 2*(patch.padding ?? currentBlock.padding ?? 0) >= Math.min(patch.width ?? currentBlock.width,patch.height ?? currentBlock.height)) { announce('The inside margin must leave room for text.'); controls(); return false; }
    return true;
  }
  function update(patch, record = false) {
    if (!canUpdate(patch)) return;
    if (record) pushHistory();
    Object.assign(block(), patch); changed(); draw(); controls();
  }

  function changeMode(next) {
    mode = next;
    if (next === 'text') $('showText').checked = true;
    render();
  }

  function bind() {
    $('previewName').oninput = previewChanged;
    $('previewName').onchange = previewChanged;
    $('previewPronouns').onchange = previewChanged;
    $('previewGuide').onchange = previewChanged;
    $('flowHeight').onchange = event => {
      const value = Number(event.target.value), b = block();
      if (!b?.flow || !event.target.value.trim() || !Number.isFinite(value)) { controls(); return; }
      update({height:clamp(value,.1,200)*data.units/100}, true);
    };
    $('flowPadding').onchange = event => {
      const value = Number(event.target.value), b = block();
      if (!b?.flow || !event.target.value.trim() || !Number.isFinite(value)) { controls(); return; }
      update({padding:clamp(value*data.units/100,0,256)}, true);
    };
    $('flowRunSelect').onchange = event => { runIndex = Number(event.target.value); controls(); };
    for (const [id, key, min, max, divisor] of [['flowRunSize','sizeRatio',50,200,100],['flowRunRotation','rotateDeg',-15,15,1]]) {
      $(id).onchange = event => {
        const value = Number(event.target.value), b = block();
        if (!b?.flow || !event.target.value.trim() || !Number.isFinite(value)) { controls(); return; }
        const run = b.flow.paragraphs.flatMap(p=>p.runs)[runIndex];
        if (key === 'rotateDeg' && !run.atomicPhrase && /[\s\[\]]/.test(run.text)) { controls(); return; }
        pushHistory(); run.style = {...run.style, [key]:clamp(value,min,max)/divisor}; changed(); draw(); controls();
      };
    }
    $('flowRunColor').onchange = event => {
      const b = block(); if (!b?.flow || !/^#[0-9a-fA-F]{6}$/.test(event.target.value)) return;
      pushHistory(); const run = b.flow.paragraphs.flatMap(p=>p.runs)[runIndex];
      run.style = {...run.style, color:event.target.value}; changed(); draw(); controls();
    };
    $('flowRunReset').onclick = () => {
      const b = block(); if (!b?.flow) return;
      const run = b.flow.paragraphs.flatMap(p=>p.runs)[runIndex];
      const original = data.pages[current-1].blocks.find(item=>item.id===b.id)?.flow?.paragraphs.flatMap(p=>p.runs)[runIndex];
      if (!original) return;
      pushHistory(); if (original.style) run.style = copy(original.style); else delete run.style;
      changed(); draw(); controls();
    };
    $('textModeBtn').onclick = () => changeMode('text');
    $('figureModeBtn').onclick = () => changeMode('figures');
    $('textBlockSelect').onchange = event => select(current,event.target.value);
    $('textContent').onfocus = () => pushHistory();
    $('textContent').oninput = event => {
      if (/^delete/.test(event.inputType||'') && normalize(event.target.value)!==normalize(block().text)) {
        const caret = event.target.selectionStart, text = event.target.value;
        const spaced = text.slice(0,caret)+' '+text.slice(caret);
        if (normalize(spaced)===normalize(block().text)) { event.target.value=spaced; event.target.setSelectionRange(caret+1,caret+1); }
      }
      if (normalize(event.target.value) !== normalize(block().text) || event.target.value.length > 8000) {
        event.target.value = block().text; announce('Only line breaks and spaces can change here. Story words stay fixed.'); return;
      }
      update({text:event.target.value});
    };
    for (const [id,key,min,max,percent] of [['textSize','size',8,72,false],['textWidth','width',5,100,true],['textLeft','left',-100,200,true],['textTop','top',-100,200,true],['textLeading','leading',8,120,false],['textRotation','rotation',-45,45,false]]) {
      $(id).onchange = event => {
        const value = Number(event.target.value);
        if (!event.target.value.trim() || !Number.isFinite(value)) { controls(); return; }
        const next = clamp(value,min,max)*(percent ? data.units/100 : 1), patch = {[key]:next};
        if (key === 'size') patch.leading = clamp(block().leading/block().size*next,8,120);
        update(patch, true);
      };
    }
    for (const [id,key] of [['textAlign','align'],['textColor','color'],['textEdge','edge']]) {
      $(id).onchange = event => { pushHistory(); update({[key]:key==='edge'?event.target.checked:event.target.value}); };
    }
    document.querySelectorAll('[data-ink]').forEach(button => button.onclick = () => { pushHistory(); update({color:button.dataset.ink}); });
    $('splitTextBtn').onclick = () => {
      const b = block(), cursor = $('textContent').selectionStart;
      const left = b.text.slice(0,cursor).trimEnd(), right = b.text.slice(cursor).trimStart();
      if (!completeFields(left) || !completeFields(right)) { announce('Keep each bracketed personalization field in one text block.'); $('textContent').focus(); return; }
      if (!left || !right || (/\S/.test(b.text[cursor-1]||'') && /\S/.test(b.text[cursor]||''))) { announce('Place the cursor between words where the new block should start.'); $('textContent').focus(); return; }
      if (page(current).blocks.length >= 60) { announce('This page has reached its block limit.'); return; }
      pushHistory();
      const next = {...copy(b), id:'text-'+crypto.randomUUID().replaceAll('-',''), text:right};
      b.text = left; next.top = clamp(b.top+linesFor(b).height+b.leading*factor()*.5,-data.units,data.units*2);
      page(current).blocks.splice(page(current).blocks.indexOf(b)+1,0,next); selected = next.id;
      changed(); draw(); controls(); announce('Text split into two movable blocks. Undo is available.');
    };
    $('joinTextBtn').onclick = () => {
      const blocks = page(current).blocks, b = block(), index = blocks.indexOf(b), next = blocks[index+1];
      if (!next || b.text.length+next.text.length+1>8000) return;
      pushHistory(); b.text += '\n'+next.text; blocks.splice(index+1,1);
      changed(); draw(); controls(); announce('Blocks joined using the first block’s styling. Undo is available.');
    };
    $('spread').addEventListener('pointerdown', event => {
      const group = event.target.closest('[data-text-block]');
      if (mode !== 'text' || !group || event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      const n = Number(group.dataset.textPage), id = group.dataset.textBlock;
      const resize = !!event.target.closest('[data-text-width]');
      select(n,id);
      const svg = document.querySelector(`[data-lettering-page="${n}"]`), rect = svg.getBoundingClientRect();
      pointer = {x:event.clientX,y:event.clientY,scale:data.units/rect.width,resize,initial:copy(block()),recorded:false};
      svg.setPointerCapture(event.pointerId);
    });
    document.addEventListener('pointermove', event => {
      if (!pointer) return;
      if (!pointer.recorded && Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)<2) return;
      const dx = (event.clientX-pointer.x)*pointer.scale, dy = (event.clientY-pointer.y)*pointer.scale, b = pointer.initial;
      let patch;
      if (pointer.resize) {
        const angle = b.rotation*Math.PI/180;
        patch = {width:clamp(b.width+dx*Math.cos(angle)+dy*Math.sin(angle),data.units*.05,data.units)};
      } else patch = {left:clamp(b.left+dx,-data.units,data.units*2),top:clamp(b.top+dy,-data.units,data.units*2)};
      if (!canUpdate(patch)) return;
      if (!pointer.recorded) { pushHistory(); pointer.recorded = true; }
      update(patch);
    });
    for (const name of ['pointerup','pointercancel']) document.addEventListener(name,()=>pointer=null);
    $('spread').addEventListener('focusin', event => {
      const group = event.target.closest('[data-text-block]');
      if (mode !== 'text' || !group || (Number(group.dataset.textPage)===current && selected===group.dataset.textBlock)) return;
      const n = Number(group.dataset.textPage);
      selected = group.dataset.textBlock;
      if (n !== current) {
        choosePage(n);
        document.querySelector(`[data-text-page="${current}"][data-text-block="${selected}"]`)?.focus({preventScroll:true});
        return;
      }
      document.querySelectorAll('.text-block').forEach(el=>el.classList.toggle('selected',el===group));
      renderControls(); updateRail(); fitHandles();
    });
    $('spread').addEventListener('keydown', event => {
      const group = event.target.closest('[data-text-block]');
      if (mode !== 'text' || !group) return;
      const step = event.shiftKey ? 10 : 1, moves = {ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]};
      if (!moves[event.key]) return;
      event.preventDefault(); select(Number(group.dataset.textPage),group.dataset.textBlock); pushHistory();
      const b = block(), [dx,dy] = moves[event.key];
      update({left:clamp(b.left+dx,-data.units,data.units*2),top:clamp(b.top+dy,-data.units,data.units*2)});
      document.querySelector(`[data-text-page="${current}"][data-text-block="${selected}"]`)?.focus({preventScroll:true});
    });
    window.addEventListener('pagehide', () => {
      clearTimeout(timer);
      if (ready && dirty && !blocked && !saving) navigator.sendBeacon('/text-state',new Blob([JSON.stringify(draft)],{type:'application/json'}));
    });
  }

  async function boot(placementSeed) {
    const response = await fetch('/lettering-data.json');
    if (!response.ok) throw Error('Could not load text layouts.');
    data = await response.json();
    flowRuntime = await import('/flow-layout.mjs');
    if (data.stateSchema === 'lhb.lettering-review@v2') {
      const style = document.createElement('style'); style.textContent = flowRuntime.FLOW_COPY_CSS; document.head.append(style);
    }
    if (data.baselineFingerprint !== placementSeed.baselineFingerprint) throw Error('Text and artwork drafts do not match.');
    const font = new FontFace('HandBook',`url(/asset/${data.font})`);
    await font.load(); document.fonts.add(font);
    const saved = await fetch('/text-state');
    if (!saved.ok) throw Error('Could not read saved lettering. Download your backup before trying again.');
    const value = await saved.json();
    hasSaved = !!value;
    try { draft = validate(value || fresh()); }
    catch (error) { error.savedLetteringBackup = !!value; throw error; }
    cacheKey = 'lhb-lettering-'+data.layoutFingerprint;
    preview = {...(data.previewPersonalization || {childName:'Alexandra',pronouns:'they/them'})};
    $('previewGuide').hidden = data.stateSchema !== 'lhb.lettering-review@v2';
    document.querySelector('label[for="previewGuide"]').hidden = $('previewGuide').hidden;
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey+'-preview') || 'null');
      if (cached && typeof cached.childName === 'string' && cached.childName.trim() && cached.childName.length <= 60 && ['she/her','he/him','they/them'].includes(cached.pronouns)) {
        preview.childName = cached.childName;
        preview.pronouns = cached.pronouns;
        if (guides.includes(cached.animalGuide)) preview.animalGuide = cached.animalGuide;
      }
    } catch {}
    if (!guides.includes(preview.animalGuide)) preview.animalGuide = 'owl';
    let browser = null;
    try { browser = JSON.parse(sessionStorage.getItem(cacheKey)||localStorage.getItem(cacheKey)||'null'); } catch {}
    if (browser?.dirty) {
      try {
        const candidate = validate(browser.draft);
        if (signature(candidate.pages) !== signature(draft.pages)) {
          const revision = draft.revision;
          draft = candidate; dirty = true;
          if (candidate.revision !== revision) {
            blocked = true;
            warning('Unsaved browser lettering is shown, but another draft was saved. Download adjustments before loading the saved version.',true);
          }
        }
      } catch { warning('Browser lettering could not be loaded. The saved file is shown.'); }
    }
    selected = page(current).blocks[0]?.id || null;
    ready = true; bind(); cache();
    if (dirty && !blocked) setTimeout(save,500);
  }

  return {boot,svg,controls,fitHandles,save,validate,validateFlow:flowWords,
    deactivate:()=>{ready=false;clearTimeout(timer);},
    get mode(){return mode;}, get ready(){return ready;}, page,
    snapshot:()=>copy(draft.pages), payload:()=>({...copy(draft),fontFamily:data.fontName,previewPersonalization:copy(preview),
      coordinateSystem:{width:data.units,height:data.units,origin:'top-left',pageSizeMm:data.pageSizeMm,
        positionUnit:'canvas units',sizeUnit:'pt',leadingUnit:'pt',rotationUnit:'clockwise degrees'}}),
    restore:pages=>{ if (signature(draft.pages)!==signature(pages)) { draft.pages=copy(pages); changed(false); } },
    import:value=>{ draft.pages=copy(validate(value).pages); changed(false); },
    review:value=>{ page(current).reviewed=value; changed(false); },
    notes:value=>{ page(current).notes=value; changed(false); },
    resetPage:()=>{ pushHistory(); page(current).blocks=copy(data.pages[current-1].blocks); changed(); draw(); controls(); announce('Page lettering reset. Notes kept. Undo is available.'); },
    refresh:draw};
})();
