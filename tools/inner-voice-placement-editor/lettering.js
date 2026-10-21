'use strict';
const Lettering = (() => {
  let data, draft, selected, preview, ready = false, mode = 'text';
  let dirty = false, blocked = false, saving = false, hasSaved = false, timer, cacheKey, editVersion = 0;
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

  function resolveText(text) {
    const forms = {'she/her':['she','her','her'],'he/him':['he','him','his'],'they/them':['they','them','their']}[preview.pronouns];
    const fields = {'child name':preview.childName,'subject pronoun':forms[0],'object pronoun':forms[1],'possessive pronoun':forms[2]};
    return text.replace(/\[([^\]]+)\]/g, (match,key) => fields[normalize(key).toLowerCase()] ?? match);
  }

  function previewChanged() {
    preview.childName = $('previewName').value.trim() || data.previewPersonalization.childName;
    preview.pronouns = $('previewPronouns').value;
    try { localStorage.setItem(cacheKey+'-preview', JSON.stringify(preview)); } catch {}
    draw(); controls(); updateRail();
  }

  function fresh() {
    return {schema:'lhb.lettering-review@v1', bookId:data.bookId,
      baselineFingerprint:data.baselineFingerprint, layoutFingerprint:data.layoutFingerprint,
      revision:0, savedAt:new Date().toISOString(), pages:data.pages.map(p => ({
        page:p.page, pageId:p.pageId, reviewed:false, notes:'', blocks:copy(p.blocks)}))};
  }

  function validate(candidate) {
    for (const [key, expected] of Object.entries({schema:'lhb.lettering-review@v1',
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
      for (const b of p.blocks) {
        if (!b || typeof b.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(b.id) || ids.has(b.id) || typeof b.text !== 'string' || !b.text.trim() || b.text.length > 8000) throw Error('A text block is invalid.');
        if (!completeFields(b.text)) throw Error('Keep each bracketed personalization field in one text block.');
        ids.add(b.id);
        for (const [key, min, max] of [['left',-data.units,data.units*2],['top',-data.units,data.units*2],['width',data.units*.05,data.units],['size',8,72],['leading',8,120],['rotation',-45,45]]) {
          if (typeof b[key] !== 'number' || !Number.isFinite(b[key]) || b[key] < min || b[key] > max) throw Error('Text size or position is invalid.');
        }
        if (!['left','center','right'].includes(b.align) || typeof b.edge !== 'boolean' || typeof b.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(b.color)) throw Error('Text styling is invalid.');
      }
      if (normalize(p.blocks.map(b => b.text).join(' ')) !== normalize(base.blocks.map(b => b.text).join(' '))) throw Error('Story words changed. Only line breaks and spacing can change here.');
      result.pages[i] = {page:p.page,pageId:p.pageId,reviewed:p.reviewed,notes:p.notes,
        blocks:p.blocks.map(b=>Object.fromEntries(['id','text','left','top','width','size','leading','color','align','rotation','edge'].map(key=>[key,b[key]])))};
    }
    return result;
  }

  function cache() {
    try { localStorage.setItem(cacheKey, JSON.stringify({draft, dirty})); }
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
        warning(blocked ? 'A newer lettering draft is saved. Download adjustments before loading the saved version.' : error.message + ' Your browser copy is kept. Download a backup.', blocked);
      } finally {
        saving = false; cache(); status();
        if (dirty && !blocked && !lastError) { clearTimeout(timer); timer = setTimeout(save, 100); }
      }
    })();
    return pending;
  }

  function linesFor(b) {
    const size = b.size * factor();
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
      const m = linesFor(b), active = n === current && selected === b.id, offset = m.size*.8;
      const soft = data.pages[n-1].contrastStyle === 'soft-shadow';
      const x = b.align === 'center' ? b.width/2 : b.align === 'right' ? b.width : 0;
      const anchor = b.align === 'center' ? 'middle' : b.align === 'right' ? 'end' : 'start';
      return `<g class="text-block${active?' selected':''}" data-text-block="${b.id}" data-text-page="${n}" role="button" tabindex="${mode==='text'?0:-1}" aria-label="Text: ${escapeHTML(normalize(resolveText(b.text)).slice(0,65))}. Arrow keys move." transform="translate(${b.left} ${b.top+offset}) rotate(${b.rotation})"><rect class="text-hit" x="-12" y="${-offset-12}" width="${b.width+24}" height="${m.height+24}"/><text fill="${b.color}" font-family="HandBook" font-kerning="none" font-size="${m.size}" text-anchor="${anchor}" ${b.edge && soft ? `filter="url(#lettering-shadow-${n})"` : b.edge?'paint-order="stroke" stroke="#17324a" stroke-opacity=".6" stroke-width="2.315" stroke-linejoin="round"':''}>${m.lines.map((line,i)=>`<tspan x="${x}" y="${i*m.leading}">${escapeHTML(line)||' '}</tspan>`).join('')}</text><rect class="text-frame" x="-12" y="${-offset-12}" width="${b.width+24}" height="${m.height+24}"/><g class="text-width-handle" data-text-width="true" role="button" tabindex="-1" aria-label="Drag to change text width" transform="translate(${b.width} ${m.height/2-offset})"><rect class="width-handle-target"/><rect class="width-handle-mark"/></g></g>`;
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
    const group = document.querySelector(`[data-text-page="${current}"][data-text-block="${selected}"] text`);
    const art = group?.closest('.artboard');
    if (!art) return;
    const box = group.getBoundingClientRect(), frame = art.getBoundingClientRect(), inset = frame.width*.03;
    $('textBoundsWarning').hidden = !(box.left < frame.left+inset || box.top < frame.top+inset || box.right > frame.right-inset || box.bottom > frame.bottom-inset);
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
    for (const [id,value] of [['textSize',b.size],['textWidth',b.width/data.units*100],['textLeft',b.left/data.units*100],['textTop',b.top/data.units*100],['textLeading',b.leading],['textRotation',b.rotation]]) $(id).value = Number(value.toFixed(2));
    if (document.activeElement !== $('previewName')) $('previewName').value = preview.childName;
    $('previewPronouns').value = preview.pronouns;
    $('textEdgeLabel').textContent = data.pages[current-1].contrastStyle === 'soft-shadow' ? 'Soft text shadow' : 'Fine contrast edge';
    $('textAlign').value = b.align; $('textColor').value = b.color; $('textEdge').checked = b.edge;
    $('joinTextBtn').disabled = blocks.indexOf(b) === blocks.length-1;
  }

  function select(n, id) {
    if (n !== current) { selected = id; choosePage(n); }
    else { selected = id; controls(); draw(); }
  }

  function update(patch) {
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
        pushHistory();
        const next = clamp(value,min,max)*(percent ? data.units/100 : 1), patch = {[key]:next};
        if (key === 'size') patch.leading = clamp(block().leading/block().size*next,8,120);
        update(patch);
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
      if (!pointer.recorded) {
        if (Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)<2) return;
        pushHistory(); pointer.recorded = true;
      }
      const dx = (event.clientX-pointer.x)*pointer.scale, dy = (event.clientY-pointer.y)*pointer.scale, b = pointer.initial;
      if (pointer.resize) {
        const angle = b.rotation*Math.PI/180;
        update({width:clamp(b.width+dx*Math.cos(angle)+dy*Math.sin(angle),data.units*.05,data.units)});
      } else update({left:clamp(b.left+dx,-data.units,data.units*2),top:clamp(b.top+dy,-data.units,data.units*2)});
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
    if (data.baselineFingerprint !== placementSeed.baselineFingerprint) throw Error('Text and artwork drafts do not match.');
    const font = new FontFace('HandBook',`url(/asset/${data.font})`);
    await font.load(); document.fonts.add(font);
    const saved = await fetch('/text-state');
    if (!saved.ok) throw Error('Could not read saved lettering. Download your backup before trying again.');
    const value = await saved.json();
    hasSaved = !!value;
    draft = value ? validate(value) : fresh();
    cacheKey = 'lhb-lettering-'+data.layoutFingerprint;
    preview = {...(data.previewPersonalization || {childName:'Alexandra',pronouns:'they/them'})};
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey+'-preview') || 'null');
      if (cached && typeof cached.childName === 'string' && cached.childName.trim() && cached.childName.length <= 60 && ['she/her','he/him','they/them'].includes(cached.pronouns)) preview = cached;
    } catch {}
    let browser = null;
    try { browser = JSON.parse(localStorage.getItem(cacheKey)||'null'); } catch {}
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

  return {boot,svg,controls,fitHandles,save,validate,
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
