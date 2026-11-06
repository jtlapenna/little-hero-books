// Inspect one local W3 HTML page with a headless browser. Does not approve layout.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import net from 'node:net';

const requireFit = process.argv.includes('--require-fit');
const pagePaths = process.argv.slice(2).filter(value=>value!=='--require-fit');
if (!pagePaths.length) throw Error('Pass one or more local proof HTML files');
for (const pagePath of pagePaths) {
  const html = readFileSync(pagePath, 'utf8');
  if (/https?:\/\//i.test(html) || !html.includes('lhb-proof-status')) throw Error('Expected offline provisional proof HTML');
}
const chrome = process.env.CHROME_PATH || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/chromium','/usr/bin/google-chrome'].find(existsSync);
if (!chrome) throw Error('Headless Chrome is required');
const temp = mkdtempSync(join(tmpdir(),'lhb-proof-browser-'));
const digest = data => createHash('sha256').update(data).digest('hex');
const inspectorSha256 = digest(readFileSync(fileURLToPath(import.meta.url)));
const listener = net.createServer(); await new Promise(resolve => listener.listen(0,'127.0.0.1',resolve));
const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
async function until(fn) { for(let i=0;i<200;i++){try{const result=await fn();if(result)return result;}catch{}await sleep(100);}throw Error('Timed out waiting for headless proof'); }
const browser = spawn(chrome,['--headless','--disable-gpu','--disable-extensions','--disable-background-networking','--no-first-run','--no-default-browser-check','--allow-file-access-from-files',`--user-data-dir=${temp}`,`--remote-debugging-port=${port}`,'about:blank'],{stdio:'ignore'});
let socket;
try {
  const base=`http://127.0.0.1:${port}`;
  await until(async()=> (await fetch(`${base}/json/version`)).ok);
  const target=await (await fetch(`${base}/json/new?about:blank`,{method:'PUT'})).json();
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  let sequence=0;const pending=new Map(), remote=[];
  socket.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(msg.method==='Network.requestWillBeSent' && !/^(?:file:|data:|about:)/i.test(msg.params.request.url))remote.push(msg.params.request.url);const pair=pending.get(msg.id);if(pair){pending.delete(msg.id);msg.error?pair.reject(Error(msg.error.message)):pair.resolve(msg.result);}});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text);return result.result.value;};
  await send('Network.enable');await send('Network.setBlockedURLs',{urls:['http://*','https://*']});await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:2625,height:2625,deviceScaleFactor:1,mobile:false});
  const results=[];
  for (const pagePath of pagePaths) {
    const htmlSha256 = digest(readFileSync(pagePath));
    const url=pathToFileURL(resolve(pagePath)).href;
    await send('Page.navigate',{url});
    await until(()=>evaluate(`document.readyState === 'complete' && location.href === ${JSON.stringify(url)} && !!document.querySelector('.lhb-flow')`));
    const result=await evaluate(`(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));const flows=document.querySelectorAll('.lhb-flow');if(flows.length!==1)throw Error('Expected exactly one flow group');const flow=flows[0], rect=flow.getBoundingClientRect(), page=document.querySelector('.lhb-config-page').getBoundingClientRect(), inset=page.width*.03;const spans=[...flow.querySelectorAll('span')].flatMap(e=>[...e.getClientRects()]);const others=[...document.querySelectorAll('.lhb-copy:not(.lhb-flow)')].filter(e=>{const b=e.getBoundingClientRect();return spans.some(a=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top);}).map(e=>e.dataset.copyBlockId);const savedTransform=flow.style.transform;let spanOutsideRegion,orphanLastWord=false,orphanCheckInconclusive=false;try{flow.style.transform='none';const unrotated=flow.getBoundingClientRect();spanOutsideRegion=[...flow.querySelectorAll('span')].flatMap(e=>[...e.getClientRects()]).some(b=>b.left<unrotated.left||b.right>unrotated.right||b.top<unrotated.top||b.bottom>unrotated.bottom);for(const paragraph of flow.querySelectorAll('p')){const walker=document.createTreeWalker(paragraph,NodeFilter.SHOW_TEXT),words=[];while(walker.nextNode()){const node=walker.currentNode;for(const match of node.textContent.matchAll(/\\S+/g)){const range=document.createRange();range.setStart(node,match.index);range.setEnd(node,match.index+match[0].length);const style=getComputedStyle(node.parentElement);words.push({rects:[...range.getClientRects()],fontSize:style.fontSize,transform:style.transform});}}if(words.length>1){const lastWord=words.at(-1),previousWord=words.at(-2),last=lastWord.rects,previous=previousWord.rects,a=last.at(-1),b=previous.at(-1);const differentLine=(x,y)=>Math.abs((x.top+x.bottom-y.top-y.bottom)/2)>Math.min(x.height,y.height)*.5;const lineHeight=parseFloat(getComputedStyle(paragraph).lineHeight);if(lastWord.fontSize!==previousWord.fontSize||lastWord.transform!==previousWord.transform||(a&&b&&Number.isFinite(lineHeight)&&lineHeight<=Math.min(a.height,b.height)*.5))orphanCheckInconclusive=true;else if(a&&b&&differentLine(a,b))orphanLastWord=true;if(last.length>1&&differentLine(last.at(-1),last[0]))orphanLastWord=true;}}}finally{flow.style.transform=savedTransform;}return {fontLoaded:[...document.fonts].some(f=>f.family==='LhbConfiguredBook'&&f.status==='loaded')&&document.fonts.check('78px LhbConfiguredBook'),imageCount:document.images.length,imagesLoaded:[...document.images].every(i=>i.naturalWidth>0),flowOverflow:flow.scrollHeight>flow.clientHeight||flow.scrollWidth>flow.clientWidth,spanOutsideRegion,orphanLastWord,orphanCheckInconclusive,overlappingBlocks:others,insideThreePercentInset:rect.left>=page.left+inset&&rect.top>=page.top+inset&&rect.right<=page.right-inset&&rect.bottom<=page.bottom-inset,flowText:flow.innerText,flowBounds:{left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom},spanBounds:spans.map(b=>({left:b.left,top:b.top,right:b.right,bottom:b.bottom}))};})()`);
    assert.equal(result.fontLoaded,true,'Configured font did not load');assert.equal(result.imagesLoaded,true,'Proof images did not load');assert(result.imageCount>0);assert.deepEqual(remote,[],'Unexpected network request');
    if (digest(readFileSync(pagePath)) !== htmlSha256) throw Error('Proof HTML changed during inspection');
    results.push({file:resolve(pagePath),htmlSha256,...result});
  }
  if (process.env.LHB_PROOF_SCREENSHOT && pagePaths.length === 1) {const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(process.env.LHB_PROOF_SCREENSHOT,Buffer.from(shot.data,'base64'),{flag:'wx'});}
  console.log(JSON.stringify({inspectorSha256,results,remoteRequests:remote.length,proofStatus:'local provisional inspection, not fit approval'}));
  if (requireFit && results.some(r=>r.flowOverflow||r.spanOutsideRegion||r.orphanLastWord||r.orphanCheckInconclusive||r.overlappingBlocks.length||!r.insideThreePercentInset)) process.exitCode=2;
} finally {socket?.close();browser.kill();await sleep(200);rmSync(temp,{recursive:true,force:true});}
