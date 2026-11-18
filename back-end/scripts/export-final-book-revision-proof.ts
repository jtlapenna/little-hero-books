/** Offline proof through the real W0 -> W3 -> configured renderer chain. No generation or network. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { BookConfigSchema, RunManifestV3Schema } from '../src/lib/books/types';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { buildW3AssemblyInput } from '../src/lib/books/w3-assembly-input';
import { buildW3PreviewPlan } from '../src/lib/books/w3-preview-plan';
import { validateBookRenderRecipe } from '../src/lib/books/book-render-recipe';
import { LocalProofAssetMapSchema } from './helpers/inner-voice-local-assets';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
async function main() {
  const {values} = parseArgs({options:{config:{type:'string'},'asset-map':{type:'string'},'source-w0':{type:'string'},'source-2b':{type:'string'},output:{type:'string'}}});
  for (const key of ['config','asset-map','source-w0','source-2b','output'] as const) assert.ok(values[key], 'Missing --'+key);
  const config = BookConfigSchema.parse(read(values.config!));
  const source = RunManifestV3Schema.parse(read(values['source-w0']!));
  const source2b = read(values['source-2b']!) as {entries:Array<{poseNumber:number;bgRemovedKey:string}>;characterHash:string};
  const map = LocalProofAssetMapSchema.parse(read(values['asset-map']!));
  const output=resolve(values.output!); mkdirSync(output,{recursive:true,mode:0o700});mkdirSync(resolve(output,'assets'),{recursive:true});
  const files:Array<Record<string,unknown>>=[];const used=new Map<string,string>();let network=0;
  globalThis.fetch = async()=>{network++;throw Error('Offline proof attempted network');};
  const localHtml=(html:string)=>html.replace(/https?:\/\/[^/"']+\/api\/assets\/([A-Za-z0-9._/-]+)/g,(_match,key:string)=>{
    let target=used.get(key);
    if(!target){const asset=map.assets[key];assert.ok(asset,'Missing local asset '+key);const bytes=readFileSync(asset.path);assert.equal(hash(bytes),asset.sha256,key+' changed');target=`assets/${asset.sha256}${extname(asset.path)}`;const file=resolve(output,target);if(existsSync(file))assert.equal(hash(readFileSync(file)),asset.sha256,'Existing proof asset changed: '+target);else copyFileSync(asset.path,file);used.set(key,target);}
    return '../'+target;
  });
  const cases:Array<{role:string;name:string;guide:string;format:string;dedication:string;labels?:string[]}>=[];
  cases.push({role:'luca',name:'Luca',guide:'tiger',format:'amazon',dedication:'Luca, we love you!'});
  for(const [role,name] of [['wide','W'.repeat(30)],['unicode','María José']] as const){
    for(const format of ['amazon','standard'])cases.push({role:role+'-'+format,name,guide:'tiger',format,dedication:'Luca, we love you!',labels:['cover','p00','p02','p11','p19','p25','p27','p30']});
  }
  cases.push({role:'empty-dedication',name:'Luca',guide:'tiger',format:'amazon',dedication:'',labels:['p02']});
  cases.push({role:'standard-cover',name:'Luca',guide:'tiger',format:'standard',dedication:'Luca, we love you!',labels:['cover','p25']});
  for(const guide of ['cat','dog','owl','lion','penguin','unicorn','t-rex'])cases.push({role:'guide-'+guide,name:'Luca',guide,format:'amazon',dedication:'Luca, we love you!',labels:['p11','p12','p25']});
  for(const item of cases){
    validateBookRenderRecipe(config,item.format);
    const characterSpecs={...source.input.characterSpecs,childName:item.name,animalGuide:item.guide};
    const w0=buildW0RunManifestFromConfig(config,{orderId:source.order.orderId,rootOrderId:source.order.rootOrderId,amazonOrderId:source.order.amazonOrderId,
      platform:item.format==='amazon'?'amazon':'d2c',formatId:item.format,characterHash:source2b.characterHash,
      input:{characterSpecs,bookSpecs:{...source.input.bookSpecs,testMode:true},dedicationText:item.dedication}});
    const prefix=w0.artifacts.orderPrefix;
    const twoB={characterHash:source2b.characterHash,bookId:config.bookId,configVersion:config.version,
      order:{orderId:w0.order.orderId,bookId:config.bookId,formatId:item.format,configVersion:config.version},
      entries:source2b.entries.map(e=>({poseNumber:e.poseNumber,bgRemovedKey:e.bgRemovedKey}))};
    const assembly=await buildW3AssemblyInput({orderId:w0.order.orderId,bookId:config.bookId,formatId:item.format,testMode:true,testModePages:0},
      {loadManifest:async key=>key===`${prefix}/manifests/1-manifest.json`?w0:key===`${prefix}/manifests/2b-manifest.json`?twoB:null});
    const preview=buildW3PreviewPlan({...assembly,backendUrl:'https://offline.invalid'});
    assert.deepEqual(preview.pagePreviewItems.map(p=>p.pageLabel),config.formats[item.format].interior.pageSequence.map(p=>p.label));
    const pages=[{label:'cover',html:preview.coverPreviewItem.coverHTML,width:config.rendering.preview.coverPx.w,height:config.rendering.preview.coverPx.h},
      ...preview.pagePreviewItems.map(p=>({label:p.pageLabel,html:p.pageHtml,width:config.rendering.preview.interiorPx.w,height:config.rendering.preview.interiorPx.h}))];
    mkdirSync(resolve(output,item.role),{recursive:true});
    for(const page of pages.filter(p=>!item.labels||item.labels.includes(p.label))){
      if (page.label === 'p25') {
        const hero = page.html.match(/<img[^>]*data-layer-id="hero"[^>]*>/)?.[0];
        assert.ok(hero && !hero.includes('scaleX(-1)'), 'Flying page must preserve accepted pose orientation');
      }
      const html=localHtml(page.html);assert.ok(!/https?:\/\//.test(html),'Remote asset remains');
      assert.ok(!/\[(?:Child Name|animal clues|animal guide|dedication message)\]/i.test(html),'Unresolved copy');
      const body=`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;width:${page.width}px;height:${page.height}px;overflow:hidden}</style></head><body>${html}</body></html>`;
      const file=item.role+'/'+page.label+'.html';writeFileSync(resolve(output,file),body);
      const dependencies = Object.fromEntries([...body.matchAll(/\.\.\/(assets\/[A-Za-z0-9._-]+)/g)].map(match => [match[1], hash(readFileSync(resolve(output,match[1])))]));
      files.push({...item,pageLabel:page.label,width:page.width,height:page.height,file,sha256:hash(Buffer.from(body)),dependencies});
    }
  }
  assert.equal(network,0);
  writeFileSync(resolve(output,'proof-manifest.json'),JSON.stringify({schema:'lhb.final-book-revision-proof@v1',configVersion:config.version,configSha256:hash(readFileSync(values.config!)),
    networkCalls:network,generationCalls:0,normalization:'retained already-removed bytes; live normalization not invoked by this offline builder',files},null,2)+'\n');
  const links=files.map(row=>`<article><h2>${row.role} · ${row.pageLabel}</h2><iframe title="${row.role} ${row.pageLabel}" src="${row.file}" style="width:${row.width}px;height:${row.height}px;transform:scale(${600/Number(row.width)});transform-origin:top left"></iframe></article>`).join('');
  writeFileSync(resolve(output,'index.html'),`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:24px;background:#eee;font:16px system-ui}main{display:grid;grid-template-columns:repeat(2,620px);gap:20px}article{height:660px;overflow:hidden}h2{font-size:18px}iframe{border:0;background:white}</style></head><body><h1>Book revision v${config.version} · local proof</h1><main>${links}</main></body></html>`);
  console.log(JSON.stringify({htmlFiles:files.length,networkCalls:network,generationCalls:0,output}));
}
main().catch(error=>{console.error(error instanceof Error?error.message:error);process.exitCode=1});
