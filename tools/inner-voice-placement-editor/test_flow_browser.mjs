import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const root = dirname(fileURLToPath(import.meta.url));
const chrome = process.env.CHROME_PATH || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(existsSync);
if (!chrome) throw new Error('A headless Chrome executable is required');
const temp = mkdtempSync(join(tmpdir(), 'lhb-editor-flow-'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, ms = 30000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    try { last = await fn(); if (last) return last; } catch {}
    await sleep(150);
  }
  throw new Error(`Timed out waiting for editor: ${String(last)}`);
}
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
let editor, browser, socket;
try {
  const candidate = join(temp, 'draft');
  const audit = process.env.LHB_EDITOR_AUDIT;
  const externalCandidate = process.env.LHB_FLOW_CANDIDATE;
  if (externalCandidate && audit) {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(candidate);
    for (const name of ['lettering-data.json', 'lettering.json']) copyFileSync(join(externalCandidate, name), join(candidate, name));
    copyFileSync(join(audit, 'editor-placements.json'), join(candidate, 'placements.json'));
  } else {
    execFileSync('python3', [join(root, 'migrate_flow_candidate.py'), '--seed', join(root, 'lettering-data.json'), '--draft', join(root, 'lettering.json'), '--output-dir', candidate]);
    copyFileSync(join(root, 'placements.json'), join(candidate, 'placements.json'));
  }
  const seedPath = join(candidate, 'lettering-data.json'), draftPath = join(candidate, 'lettering.json');
  const seed = JSON.parse(readFileSync(seedPath)), draft = JSON.parse(readFileSync(draftPath));
  seed.previewPersonalization.animalGuide = 'unicorn';
  for (const page of [seed.pages[25], draft.pages[25]]) {
    const block = page.blocks[0], run = block.flow.paragraphs[0].runs[0];
    run.text = run.text.replace(/\bOwl\b|\[animal guide\]/, '[animal guide] [animal clue]');
    run.keepWithNext = true;
    block.flow.paragraphs[0].runs[2].atomicPhrase = true;
    block.text = block.flow.paragraphs.map(p => p.runs.map(r => r.text).join('')).join('\n');
  }
  writeFileSync(seedPath, JSON.stringify(seed)); writeFileSync(draftPath, JSON.stringify(draft));
  const port = await freePort();
  const extra = audit && process.env.LHB_ASSET_ROOT ? ['--editor-seed', join(audit, 'editor-editor-data.json'), '--asset-map', join(audit, 'editor-asset-map.json'), '--asset-root', process.env.LHB_ASSET_ROOT] : [];
  editor = spawn('python3', [join(root, 'server.py'), '--port', String(port), '--state-dir', candidate, '--lettering-seed', join(candidate, 'lettering-data.json'), ...extra], { stdio: 'ignore' });
  const origin = `http://127.0.0.1:${port}`;
  await until(async () => (await fetch(origin)).ok);
  const browserPort = await freePort();
  browser = spawn(chrome, ['--headless', '--disable-gpu', '--disable-extensions', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${join(temp, 'chrome')}`, `--remote-debugging-port=${browserPort}`, 'about:blank'], { stdio: 'ignore' });
  const base = `http://127.0.0.1:${browserPort}`;
  await until(async () => (await fetch(`${base}/json/version`)).ok);
  const target = await (await fetch(`${base}/json/new?${encodeURIComponent(origin)}`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const pair = pending.get(message.id); if (!pair) return;
    pending.delete(message.id);
    if (message.error) pair.reject(new Error(message.error.message)); else pair.resolve(message.result);
  });
  function send(method, params = {}) {
    const id = ++sequence;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  }
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await until(() => evaluate("typeof Lettering !== 'undefined' && Lettering.ready"));
  await evaluate("document.querySelector('.page-link[data-page=\"26\"]').click()" );
  await until(() => evaluate("!!document.querySelector('[data-text-page=\"26\"] .lhb-editor-flow p')"));
  const initial = await evaluate("({text:document.querySelector('[data-text-page=\"26\"] .lhb-editor-flow').innerText, disabled:document.querySelector('#textContent').disabled, split:document.querySelector('#splitTextBtn').disabled, left:Lettering.page(26).blocks[0].left})");
  assert.match(initial.text, /Alexandra and Unicorn a tuft of colorful fur\s+flew\s+through the stars/);
  assert.equal(initial.disabled, true); assert.equal(initial.split, true);
  assert.equal(await evaluate("document.querySelector('#flowHeight').hidden"), false, 'Flow groups need an adjustable height');
  if (process.env.LHB_EDITOR_SCREENSHOT) {
    await send('Page.enable');
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(process.env.LHB_EDITOR_SCREENSHOT, Buffer.from(shot.data, 'base64'));
  }
  await evaluate("document.querySelector('#previewName').value='James';document.querySelector('#previewName').dispatchEvent(new Event('input',{bubbles:true}))");
  assert.match(await evaluate("document.querySelector('[data-text-page=\"26\"] .lhb-editor-flow').innerText"), /James and Unicorn a tuft of colorful fur/);
  for (const [guide, label] of [['cat','Cat'], ['dog','Dog'], ['owl','Owl'], ['lion','Lion'], ['tiger','Tiger'], ['penguin','Penguin'], ['t-rex','T-Rex'], ['unicorn','Unicorn']]) {
    await evaluate(`document.querySelector('#previewGuide').value=${JSON.stringify(guide)};document.querySelector('#previewGuide').dispatchEvent(new Event('change',{bubbles:true}))`);
    assert.match(await evaluate("document.querySelector('[data-text-page=\"26\"] .lhb-editor-flow').innerText"), new RegExp(`James and ${label} `));
  }
  await evaluate("document.querySelector('#previewGuide').value='t-rex';document.querySelector('#previewGuide').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.page-link[data-page=\"25\"]').click()");
  assert.match(await evaluate("document.querySelector('[data-text-page=\"25\"][data-text-block=\"text-25-01\"]').getAttribute('aria-label')"), /T-Rex appeared/);
  assert.match(await evaluate("document.querySelector('[data-text-page=\"25\"][data-text-block=\"text-25-04\"]').getAttribute('aria-label')"), /T-Rex smiled/);
  await evaluate("document.querySelector('.page-link[data-page=\"24\"]').click()");
  assert.match(await evaluate("document.querySelector('[data-text-page=\"24\"][data-text-block=\"text-24-02\"]').getAttribute('aria-label')"), /giant footprints/);
  await evaluate("document.querySelector('.page-link[data-page=\"26\"]').click();document.querySelector('#previewGuide').value='unicorn';document.querySelector('#previewGuide').dispatchEvent(new Event('change',{bubbles:true}))");
  if (process.env.LHB_GUIDE_SCREENSHOT) {
    await evaluate("document.querySelector('.preview-details').open=true");
    await send('Page.enable');
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(process.env.LHB_GUIDE_SCREENSHOT, Buffer.from(shot.data, 'base64'));
  }
  await evaluate("document.querySelector('#previewGuide').value='cat';document.querySelector('#previewGuide').dispatchEvent(new Event('change',{bubbles:true}))");
  assert.equal(await evaluate("(()=>{const v=Lettering.payload();v.pages[25].blocks[0].text+=' ';try{Lettering.validate(v);return false}catch{return true}})()"), true, 'Flow text must match its runs on import');
  assert.equal(await evaluate("(()=>{const v=Lettering.payload();v.pages[25].blocks[0].padding=null;try{Lettering.validate(v);return false}catch{return true}})()"), true, 'Null flow padding must be rejected');
  assert.equal(await evaluate('Lettering.page(26).blocks[0].flow.paragraphs[0].runs[0].keepWithNext'), true, 'Seed grouping reaches the editor');
  assert.equal(await evaluate('Lettering.page(26).blocks[0].flow.paragraphs[0].runs[2].atomicPhrase'), true, 'Seed phrase mode reaches the editor');
  assert.equal(await evaluate("(()=>{const v=Lettering.payload();delete v.pages[25].blocks[0].flow.paragraphs[0].runs[2].atomicPhrase;try{Lettering.validate(v);return false}catch{return true}})()"), true, 'Phrase mode is locked to the seed');
  for (const text of ['\ud800', '\udc00']) {
    assert.equal(await evaluate(`(()=>{try{Lettering.validateFlow({paragraphs:[{runs:[{text:${JSON.stringify(text)},atomicPhrase:true}]}]});return 'accepted'}catch(error){return error.message}})()`), 'Atomic phrase is invalid.', 'Flow validator rejects unpaired surrogates before seed comparison');
  }
  assert.equal(await evaluate("(()=>{try{Lettering.validateFlow({paragraphs:[{runs:[{text:'guide 😀',atomicPhrase:true}]}]});return true}catch{return false}})()"), true, 'Flow validator accepts valid astral characters');
  for (const assignment of ["delete runs[0].keepWithNext", "runs[0].keepWithNext=false", "runs[0].keepWithNext='true'", "runs[runs.length-1].keepWithNext=false"]) {
    assert.equal(await evaluate(`(()=>{const v=Lettering.payload(),runs=v.pages[25].blocks[0].flow.paragraphs[0].runs;${assignment};try{Lettering.validate(v);return false}catch{return true}})()`), true, 'Grouping must match the seed and be well formed');
  }
  const groupCheck = await evaluate(`(async()=>{const {renderFlowContent}=await import('/flow-layout.mjs'),host=document.createElement('div');host.style.cssText='width:20px;font-size:20px';host.innerHTML=renderFlowContent({paragraphs:[{runs:[{text:'[Child Name] ',keepWithNext:true},{text:'flew ',style:{color:'#abcdef',sizeRatio:1.2}},{text:'tail'}]}]},{'child name':'<img src=x>  &'});document.body.append(host);const group=host.querySelector('p > span'),runs=group.querySelectorAll('span'),first=runs[0].firstChild,last=runs[1].firstChild,range=document.createRange(),spaceAt=first.textContent.indexOf('  ');range.setStart(first,spaceAt);range.setEnd(first,spaceAt+1);const one=range.getBoundingClientRect().width;range.setEnd(first,spaceAt+2);const two=range.getBoundingClientRect().width;range.setStart(last,last.length-1);range.setEnd(last,last.length);const trailing=range.getBoundingClientRect().width;const a=runs[0].getBoundingClientRect(),b=runs[1].getBoundingClientRect(),result={text:group.textContent,images:host.querySelectorAll('img').length,whiteSpace:getComputedStyle(group).whiteSpace,oversized:group.getBoundingClientRect().width>host.getBoundingClientRect().width,sameLine:a.top<b.bottom&&b.top<a.bottom,spacesPreserved:two>one*1.5,trailingPreserved:trailing>0};host.remove();return result})()`);
  assert.deepEqual(groupCheck,{text:'<img src=x>  & flew ',images:0,whiteSpace:'pre',oversized:true,sameLine:true,spacesPreserved:true,trailingPreserved:true},'Grouped spaces remain visible and oversized groups remain unapproved');
  const phraseCheck = await evaluate(`(async()=>{const {renderFlowContent}=await import('/flow-layout.mjs'),host=document.createElement('div');host.style.cssText='width:20px;font-size:20px';host.innerHTML=renderFlowContent({paragraphs:[{runs:[{text:'Hello [Animal Guide]  friend',atomicPhrase:true,style:{rotateDeg:-5}}]}]},{'animal guide':'<img src=x> &'});document.body.append(host);const phrase=host.querySelector('p > span'),r=phrase.getBoundingClientRect(),range=document.createRange(),text=phrase.firstChild,i=text.textContent.indexOf('  ');range.setStart(text,i);range.setEnd(text,i+1);const one=range.getBoundingClientRect().width;range.setEnd(text,i+2);const two=range.getBoundingClientRect().width;const result={text:phrase.textContent,images:host.querySelectorAll('img').length,whiteSpace:getComputedStyle(phrase).whiteSpace,display:getComputedStyle(phrase).display,oversized:r.width>host.getBoundingClientRect().width,spacesPreserved:two>one*1.5};host.remove();return result})()`);
  assert.deepEqual(phraseCheck,{text:'Hello <img src=x> &  friend',images:0,whiteSpace:'pre',display:'inline-block',oversized:true,spacesPreserved:true},'Rotated phrases preserve spaces and do not shrink to fit');
  const punctuationCheck = await evaluate(`(async()=>{const {renderFlowContent}=await import('/flow-layout.mjs'),host=document.createElement('div'),flow={paragraphs:[{runs:[{text:'[Animal Guide]',atomicPhrase:true,style:{rotateDeg:-5}},{text:'.'}]}]};let rejected=false;try{renderFlowContent(flow,{'animal guide':'Unicorn'})}catch{rejected=true}flow.paragraphs[0].runs[0].keepWithNext=true;host.style.cssText='width:20px;font-size:20px';host.innerHTML=renderFlowContent(flow,{'animal guide':'Unicorn'});document.body.append(host);const group=host.querySelector('p > span'),phrase=group.children[0],punctuation=group.children[1],a=phrase.getBoundingClientRect(),b=punctuation.getBoundingClientRect(),result={rejected,sameLine:a.top<b.bottom&&b.top<a.bottom,oversized:group.getBoundingClientRect().width>host.getBoundingClientRect().width,text:group.textContent};host.remove();return result})()`);
  assert.deepEqual(punctuationCheck,{rejected:true,sameLine:true,oversized:true,text:'Unicorn.'},'Punctuation cannot wrap away from an atomic phrase');
  const punctuationChains = await evaluate(`(async()=>{const {renderFlowContent}=await import('/flow-layout.mjs'),results=[];for(const before of [false,true])for(const bound of [0,1,2]){const runs=before?[{text:'“'},{text:' '},{text:'[Animal Guide]',atomicPhrase:true}]:[{text:'[Animal Guide]',atomicPhrase:true},{text:' '},{text:'.'}];for(let i=0;i<bound;i++)runs[i].keepWithNext=true;const flow={paragraphs:[{runs}]};let valid=true;try{Lettering.validateFlow(flow)}catch{valid=false}let rendered=true;try{renderFlowContent(flow,{'animal guide':'Unicorn'})}catch{rendered=false}let sameLine=null;if(rendered){const host=document.createElement('div');host.style.cssText='width:20px;font-size:20px';host.innerHTML=renderFlowContent(flow,{'animal guide':'Unicorn'});document.body.append(host);const spans=host.querySelector('p > span').children,a=spans[0].getBoundingClientRect(),b=spans[2].getBoundingClientRect();sameLine=a.top<b.bottom&&b.top<a.bottom;host.remove()}results.push({before,bound,valid,rendered,sameLine})}return results})()`);
  assert.deepEqual(punctuationChains,[{before:false,bound:0,valid:false,rendered:false,sameLine:null},{before:false,bound:1,valid:false,rendered:false,sameLine:null},{before:false,bound:2,valid:true,rendered:true,sameLine:true},{before:true,bound:0,valid:false,rendered:false,sameLine:null},{before:true,bound:1,valid:false,rendered:false,sameLine:null},{before:true,bound:2,valid:true,rendered:true,sameLine:true}], 'Punctuation and spaces require a complete grouping chain');
  const sentenceBreak = await evaluate(`(async()=>{const {renderFlowContent}=await import('/flow-layout.mjs'),host=document.createElement('div'),flow={paragraphs:[{runs:[{text:'left. '},{text:'Then right.',atomicPhrase:true}]}]};Lettering.validateFlow(flow);host.style.cssText='width:110px;font-size:20px';host.innerHTML=renderFlowContent(flow,{});document.body.append(host);const spans=host.querySelector('p').children,a=spans[0].getBoundingClientRect(),b=spans[1].getBoundingClientRect(),result={text:host.textContent,wrapped:b.top>=a.bottom};host.remove();return result})()`);
  assert.deepEqual(sentenceBreak,{text:'left. Then right.',wrapped:true},'Separate sentences can wrap between words and atomic phrases');
  await evaluate("document.querySelector('#flowRunSelect').value='2';document.querySelector('#flowRunSelect').dispatchEvent(new Event('change',{bubbles:true}))");
  assert.equal(await evaluate("document.querySelector('#flowRunRotation').disabled"), false, 'Seed phrases permit rotation');
  await evaluate("document.querySelector('#flowRunRotation').value='4';document.querySelector('#flowRunRotation').dispatchEvent(new Event('change',{bubbles:true}))");
  assert.equal(await evaluate('Lettering.page(26).blocks[0].flow.paragraphs[0].runs[2].style.rotateDeg'), 4);
  await evaluate("document.querySelector('#flowRunReset').click()");
  assert.equal(await evaluate(`(async()=>{const {renderFlowContent}=await import('/flow-layout.mjs'),group={paragraphs:[{runs:[{text:'[Child Name]',keepWithNext:true},{text:' flew'}]}]},plain={paragraphs:[{runs:[{text:'[Child Name]'},{text:' flew'}]}]};return ['\\r','\\n','\\f'].every(separator=>{try{renderFlowContent(group,{'child name':'Ada'+separator+'Lee'});return false}catch{return renderFlowContent(plain,{'child name':'Ada'+separator+'Lee'}).includes('Ada'+separator+'Lee')}})})()`), true, 'Grouped tokens reject hard line breaks and ungrouped tokens retain them');
  await evaluate("document.querySelector('[data-text-page=\"26\"][data-text-block=\"text-26-01\"]').focus(); document.querySelector('[data-text-page=\"26\"][data-text-block=\"text-26-01\"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))");
  assert.equal(await evaluate('Lettering.page(26).blocks[0].left'), initial.left + 1);
  await evaluate("document.querySelector('#undoBtn').click()");
  assert.equal(await evaluate('Lettering.page(26).blocks[0].left'), initial.left);
  await evaluate("document.querySelector('#redoBtn').click()");
  assert.equal(await evaluate('Lettering.page(26).blocks[0].left'), initial.left + 1);
  await evaluate("document.querySelector('#flowRunSelect').value='1';document.querySelector('#flowRunSelect').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#flowRunColor').value='#123456';document.querySelector('#flowRunColor').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#flowRunSize').value='140';document.querySelector('#flowRunSize').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#flowRunRotation').value='-3';document.querySelector('#flowRunRotation').dispatchEvent(new Event('change',{bubbles:true}))");
  assert.deepEqual(await evaluate('Lettering.page(26).blocks[0].flow.paragraphs[0].runs[1].style'), {color:'#123456',sizeRatio:1.4,rotateDeg:-3});
  await evaluate("document.querySelector('#flowRunReset').click()");
  assert.notEqual(await evaluate('Lettering.page(26).blocks[0].flow.paragraphs[0].runs[1].style.color'), '#123456');
  await evaluate("document.querySelector('#undoBtn').click()");
  assert.deepEqual(await evaluate('Lettering.page(26).blocks[0].flow.paragraphs[0].runs[1].style'), {color:'#123456',sizeRatio:1.4,rotateDeg:-3});
  const heightBefore = await evaluate('Lettering.page(26).blocks[0].height');
  await evaluate("document.querySelector('#flowHeight').value='20';document.querySelector('#flowHeight').dispatchEvent(new Event('change',{bubbles:true}))");
  assert.equal(await evaluate('Lettering.page(26).blocks[0].height'), 525);
  await evaluate("document.querySelector('#undoBtn').click()");
  assert.equal(await evaluate('Lettering.page(26).blocks[0].height'), heightBefore);
  await evaluate("document.querySelector('#redoBtn').click()");
  assert.equal(await evaluate('Lettering.page(26).blocks[0].height'), 525);
  await evaluate("document.querySelector('#flowPadding').value='0.6';document.querySelector('#flowPadding').dispatchEvent(new Event('change',{bubbles:true}))");
  assert.equal(await evaluate('Lettering.page(26).blocks[0].padding'), 15.75);
  assert.equal(await evaluate('Lettering.page(26).blocks[0].flow.paragraphs[0].runs[2].atomicPhrase'), true, 'Phrase mode survives editor save and reload');
  assert.equal(await evaluate('Lettering.page(26).blocks[0].flow.paragraphs[0].runs[0].keepWithNext'), true, 'Seed grouping survives save and reload');
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-text-page=\"26\"] .lhb-editor-flow')).paddingTop"), '15.75px');
  await evaluate("document.querySelector('#flowRunColor').value='#654321';document.querySelector('#flowRunColor').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#undoBtn').click();document.querySelector('#flowHeight').value='0.1';document.querySelector('#flowHeight').dispatchEvent(new Event('change',{bubbles:true}))");
  assert.equal(await evaluate("document.querySelector('#redoBtn').disabled"), false, 'Rejected geometry must not discard redo');
  await evaluate("document.querySelector('#redoBtn').click()");
  assert.equal(await evaluate('Lettering.page(26).blocks[0].flow.paragraphs[0].runs[1].style.color'), '#654321');
  await evaluate("document.querySelector('#undoBtn').click()");
  assert.equal(await evaluate("document.querySelector('#flowHeight').validity.valid"), true);
  if (audit) {
    assert.equal(await evaluate("document.querySelector('#textBoundsWarning').hidden"), false, 'A conflicting region must show a warning');
    await evaluate("document.querySelector('#textBlockSelect').value='text-26-04';document.querySelector('#textBlockSelect').dispatchEvent(new Event('change',{bubbles:true}))");
    assert.match(await evaluate("document.querySelector('#textBoundsWarning').textContent"), /overlaps another text block/);
    assert.equal(await evaluate("document.querySelector('#textBoundsWarning').hidden"), false, 'A neighboring text block must also warn');
    await evaluate("document.querySelector('#textBlockSelect').value='text-26-01';document.querySelector('#textBlockSelect').dispatchEvent(new Event('change',{bubbles:true}))");
  }
  assert.equal(await evaluate("(()=>{const v=Lettering.payload();v.pages[25].blocks[0].flow.paragraphs[0].runs[1].style.color='url(evil)';try{Lettering.validate(v);return false}catch{return true}})()"), true);
  if (process.env.LHB_STYLE_SCREENSHOT) {
    await send('Page.enable');
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(process.env.LHB_STYLE_SCREENSHOT, Buffer.from(shot.data, 'base64'));
  }
  await until(async () => {
    const state = await (await fetch(`${origin}/text-state`)).json();
    return state.revision > 0 && state.pages[25].blocks[0].left === initial.left + 1 && state.pages[25].blocks[0].flow;
  });
  await send('Page.reload');
  await until(() => evaluate("typeof Lettering !== 'undefined' && Lettering.ready"));
  assert.equal(await evaluate('Lettering.page(26).blocks[0].left'), initial.left + 1);
  assert.deepEqual(await evaluate('Lettering.page(26).blocks[0].flow.paragraphs[0].runs[1].style'), {color:'#123456',sizeRatio:1.4,rotateDeg:-3});
  assert.equal(await evaluate('Lettering.page(26).blocks[0].height'), 525);
  assert.equal(await evaluate('Lettering.page(26).blocks[0].padding'), 15.75);
  assert.equal(await evaluate("document.querySelector('#previewGuide').value"), 'cat');
  assert.match(await evaluate("document.querySelector('[data-text-page=\"26\"] .lhb-editor-flow').innerText"), /James and Cat /);
  await evaluate("localStorage.setItem('lhb-lettering-'+Lettering.payload().layoutFingerprint+'-preview',JSON.stringify({childName:'James',pronouns:'they/them'}))");
  await send('Page.reload');
  await until(() => evaluate("typeof Lettering !== 'undefined' && Lettering.ready"));
  assert.equal(await evaluate("document.querySelector('#previewGuide').value"), 'unicorn', 'Old cache must retain the configured seed guide');
  await evaluate("document.querySelector('#textRotation').value='30';document.querySelector('#textRotation').dispatchEvent(new Event('change',{bubbles:true}))");
  assert.equal(await evaluate("(()=>{const b=Lettering.page(26).blocks[0];return document.querySelector('[data-text-page=\"26\"][data-text-block=\"text-26-01\"]').getAttribute('transform')===`translate(${b.left} ${b.top}) rotate(30)`})()"), true, 'Flow rotates about its top-left placement');
  await evaluate("document.querySelector('#flowPadding').value='0';document.querySelector('#flowPadding').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#textWidth').value='100';document.querySelector('#textWidth').dispatchEvent(new Event('change',{bubbles:true}))");
  const rotatedOverflow = await evaluate(`(()=>{const b=Lettering.page(26).blocks[0],owner=document.querySelector('[data-text-page="26"][data-text-block="text-26-01"]'), div=owner.querySelector('.lhb-editor-flow'), old=owner.getAttribute('transform');owner.setAttribute('transform','translate('+b.left+' '+b.top+')');const box=div.getBoundingClientRect(), outside=[...div.querySelectorAll('span')].flatMap(s=>[...s.getClientRects()]).some(r=>r.top<box.top||r.left<box.left||r.right>box.right||r.bottom>box.bottom), scrollFits=div.scrollHeight<=div.clientHeight&&div.scrollWidth<=div.clientWidth;owner.setAttribute('transform',old);return {outside,scrollFits};})()`);
  assert.deepEqual(rotatedOverflow,{outside:true,scrollFits:true},'Rotated fragment can escape without scroll overflow');
  assert.match(await evaluate("document.querySelector('#textBoundsWarning').textContent"), /does not fit/);
  await sleep(1000);
  // Edits made while a save is in flight must use the returned revision.
  await evaluate("window.originalFetch=window.fetch;window.fetch=async (...args)=>{if(args[0]==='/state'&&args[1]?.method==='POST')await new Promise(r=>setTimeout(r,350));return window.originalFetch(...args)};state.pages[0].notes='first';changed();save();state.pages[0].notes='second';changed()");
  await until(async () => (await (await fetch(`${origin}/state`)).json()).pages[0].notes === 'second');
  assert.equal(await evaluate('placementDirty'), false);
  await evaluate('window.fetch=window.originalFetch');
  // A different tab saving first must not silently replace this tab's work.
  const outside = await (await fetch(`${origin}/state`)).json();
  outside.pages[0].notes = 'other tab';
  assert.equal((await fetch(`${origin}/state`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(outside) })).status, 200);
  await evaluate("state.pages[0].notes='unsaved tab';changed();save()");
  await until(() => evaluate('placementBlocked'));
  assert.match(await evaluate("document.querySelector('#errorBanner').textContent"), /Another draft was saved/);
  assert.equal(await evaluate("JSON.parse(sessionStorage.getItem(cacheKey)).state.pages[0].notes"), 'unsaved tab');
  assert.equal((await (await fetch(`${origin}/state`)).json()).pages[0].notes, 'other tab');
  await send('Page.reload');
  await until(() => evaluate("typeof Lettering !== 'undefined' && Lettering.ready"));
  assert.equal(await evaluate('placementBlocked'), true);
  assert.equal(await evaluate('state.pages[0].notes'), 'unsaved tab');
  const serverCopy = await (await fetch(`${origin}/state`)).json();
  // An unsaved tab draft can have exactly the saved timestamp.
  await evaluate(`sessionStorage.setItem(cacheKey,JSON.stringify({state:${JSON.stringify({...serverCopy, pages: serverCopy.pages.map((p, i) => i ? p : {...p, notes: 'same timestamp draft'})})},dirty:true}))`);
  await send('Page.reload');
  await until(() => evaluate("typeof Lettering !== 'undefined' && Lettering.ready"));
  assert.equal(await evaluate('state.pages[0].notes'), 'same timestamp draft');
  await until(async () => (await (await fetch(`${origin}/state`)).json()).pages[0].notes === 'same timestamp draft');
  // A successful pagehide save can leave a dirty cache at the prior revision.
  await evaluate("const backup=JSON.parse(sessionStorage.getItem(cacheKey));backup.state.revision--;backup.dirty=true;sessionStorage.setItem(cacheKey,JSON.stringify(backup))");
  await send('Page.reload');
  await until(() => evaluate("typeof Lettering !== 'undefined' && Lettering.ready"));
  assert.equal(await evaluate('placementBlocked'), false);
  copyFileSync(join(root, 'lettering.json'), draftPath);
  await send('Page.reload');
  await until(() => evaluate("!!document.querySelector('#errorBanner a[download=\"saved-lettering-backup.json\"]')"));
  assert.equal(JSON.parse(readFileSync(draftPath)).schema, 'lhb.lettering-review@v1');
  copyFileSync(audit ? join(audit, 'editor-lettering-data.json') : join(root, 'lettering-data.json'), seedPath);
  copyFileSync(audit ? join(audit, 'editor-lettering.json') : join(root, 'lettering.json'), draftPath);
  const stopped = new Promise(resolve => editor.once('exit', resolve));
  editor.kill(); await stopped;
  editor = spawn('python3', [join(root, 'server.py'), '--port', String(port), '--state-dir', candidate, '--lettering-seed', seedPath, ...extra], { stdio: 'ignore' });
  await until(async () => (await fetch(origin)).ok);
  await send('Page.reload');
  await until(() => evaluate("typeof Lettering !== 'undefined' && Lettering.ready"));
  assert.equal(await evaluate("document.querySelector('#previewGuide').hidden"), true, 'Unmigrated lettering cannot preview a different guide reliably');
  const secondTarget = await (await fetch(`${base}/json/new?${encodeURIComponent(origin)}`, {method:'PUT'})).json();
  const secondSocket = new WebSocket(secondTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { secondSocket.addEventListener('open', resolve, {once:true}); secondSocket.addEventListener('error', reject, {once:true}); });
  let secondId = 0; const secondPending = new Map();
  secondSocket.addEventListener('message', event => { const msg=JSON.parse(event.data), pair=secondPending.get(msg.id); if(pair){secondPending.delete(msg.id);msg.error?pair.reject(Error(msg.error.message)):pair.resolve(msg.result);} });
  const secondSend = (method,params={}) => new Promise((resolve,reject)=>{const id=++secondId;secondPending.set(id,{resolve,reject});secondSocket.send(JSON.stringify({id,method,params}));});
  const secondEvaluate = async expression => {const result=await secondSend('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text);return result.result.value;};
  await until(() => secondEvaluate("typeof Lettering !== 'undefined' && Lettering.ready"));
  const offline = "const base=window.fetch.bind(window);window.fetch=(...args)=>args[0]==='/text-state'&&args[1]?.method==='POST'?Promise.reject(Error('offline test')):base(...args);navigator.sendBeacon=()=>true;";
  await evaluate(offline + "const a=document.querySelector('#notesInput');a.value='first tab unsaved';a.dispatchEvent(new Event('input',{bubbles:true}))");
  await secondEvaluate(offline + "const a=document.querySelector('#notesInput');a.value='second tab unsaved';a.dispatchEvent(new Event('input',{bubbles:true}))");
  const v1Key = `lhb-lettering-${JSON.parse(readFileSync(seedPath)).layoutFingerprint}`;
  assert.equal(await evaluate(`JSON.parse(sessionStorage.getItem(${JSON.stringify(v1Key)})).draft.pages[25].notes`), 'first tab unsaved');
  assert.equal(await secondEvaluate(`JSON.parse(sessionStorage.getItem(${JSON.stringify(v1Key)})).draft.pages[25].notes`), 'second tab unsaved');
  await secondSend('Page.close'); secondSocket.close();
  const unsafe = structuredClone(seed);
  unsafe.pages[25].blocks[0].flow.paragraphs[0].runs[1].style.color = 'red"><img src=x onerror=alert(1)>';
  writeFileSync(seedPath, JSON.stringify(unsafe)); rmSync(draftPath);
  const stoppedAgain = new Promise(resolve => editor.once('exit', resolve));
  editor.kill(); await stoppedAgain;
  editor = spawn('python3', [join(root, 'server.py'), '--port', String(port), '--state-dir', candidate, '--lettering-seed', seedPath, ...extra], { stdio: 'ignore' });
  await until(async () => (await fetch(origin)).ok);
  await send('Page.reload');
  await until(() => evaluate("document.querySelector('#errorBanner').textContent.includes('Flow color is invalid')"));
  assert.equal(await evaluate("document.querySelector('img[onerror]') === null"), true, 'Unsafe seed must not render markup');
  console.log('Headless editor flow preview, keyboard move, undo/redo, save and reload passed');
} finally {
  socket?.close(); browser?.kill(); editor?.kill();
  await sleep(200);
  rmSync(temp, { recursive: true, force: true });
}
