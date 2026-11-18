/** Actual configured W0→W3→HTML for the clarified flying scene, both formats/all guides. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {BookConfigSchema} from '../src/lib/books/types';
import {buildW0RunManifestFromConfig} from '../src/lib/books/build-run-manifest';
import {buildW3AssemblyInput} from '../src/lib/books/w3-assembly-input';
import {buildW3PreviewPlan} from '../src/lib/books/w3-preview-plan';
import {buildBgRemovedPoseAssetKey} from '../src/lib/order-paths';
async function main(){
 globalThis.fetch=async()=>{throw Error('Orientation fixture forbids network');};
 const config=BookConfigSchema.parse(JSON.parse(readFileSync(resolve('../tools/inner-voice-placement-editor/final-book-revisions-20261117/candidate-config.json'),'utf8')));
 let checked=0;
 for(const formatId of ['amazon','standard'])for(const animalGuide of ['cat','dog','owl','lion','tiger','penguin','unicorn','t-rex']){
  const orderId='SYNTHETIC-FLYING',characterHash='synthetic-flying-character';
  const w0=buildW0RunManifestFromConfig(config,{orderId,rootOrderId:orderId,platform:formatId==='amazon'?'amazon':'d2c',formatId,characterHash,input:{characterSpecs:{childName:'Luca',age:2,animalGuide,skinTone:'light',hairColor:'light-brown',hairStyle:'side-part',favoriteColor:'red'},bookSpecs:{bookId:config.bookId,formatId,testMode:true}}});
  const prefix=w0.artifacts.orderPrefix;
  const twoB={bookId:config.bookId,configVersion:config.version,characterHash,order:{orderId,bookId:config.bookId,formatId,configVersion:config.version},entries:[0,...w0.book.resolved.qaPolicy.pose.requiredPoseNumbers].map(poseNumber=>({poseNumber,bgRemovedKey:buildBgRemovedPoseAssetKey(characterHash,poseNumber,config.bookId)}))};
  const assembly=await buildW3AssemblyInput({orderId,bookId:config.bookId,formatId},{loadManifest:async key=>key===w0.artifacts.manifestKey?w0:key===prefix+'/manifests/2b-manifest.json'?twoB:null});
  const plan=buildW3PreviewPlan({...assembly,backendUrl:'https://offline.invalid'}),page=plan.pagePreviewItems.find(p=>p.pageLabel==='p25');assert.ok(page);
  const hero=page.pageHtml.match(/<img[^>]*data-layer-id="hero"[^>]*>/)?.[0];assert.ok(hero);assert(!hero.includes('scaleX(-1)'),formatId+'/'+animalGuide+' mirrors accepted flying pose');
  assert(hero.includes(buildBgRemovedPoseAssetKey(characterHash,11,config.bookId)),'Uses accepted removed pose11');
  assert(!/filter:|opacity:/.test(hero),'No renderer shading/filter override');
  assert(page.pageHtml.includes('data-layer-id="guide-flying"'),'Guide preserved');checked++;
 }
 console.log(JSON.stringify({passed:true,actualW0W3Html:true,formatGuideCases:checked,networkCalls:0,generationCalls:0}));
}
main().catch(error=>{console.error(error);process.exitCode=1});
