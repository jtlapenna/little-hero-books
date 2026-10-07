import assert from 'node:assert/strict';
import { loadBundledBookConfig } from '../src/lib/books/load-book-config';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { buildW3AssemblyInput } from '../src/lib/books/w3-assembly-input';
import { buildW3PreviewPlan } from '../src/lib/books/w3-preview-plan';
import { buildW3Manifest } from '../src/lib/books/w3-manifest';
async function main() {
 const config=loadBundledBookConfig({bookId:'book-finding-our-inner-voice',version:1});
 assert.equal(config.status,'draft');const pages=config.formats.standard.interior.pageSequence;
 assert.deepEqual(pages,config.formats.amazon.interior.pageSequence);assert.equal(pages.length,32);
 assert.equal(pages.filter(p=>p.layers?.some(l=>l.kind==='pose')).length,12);
 assert.equal(pages.flatMap(p=>p.layers??[]).filter(l=>l.kind==='pose').length,13);
 assert.equal(pages[13].layers!.filter(l=>l.kind==='pose').length,2);
 assert.ok(pages[27].layers!.some(l=>l.kind==='overlay'&&l.assetSlot==='waitingChild'));
 assert.throws(()=>buildW0RunManifestFromConfig(config,{orderId:'NONTEST-DRAFT',platform:'d2c',input:{}}),/testMode/);
 for(const formatId of ['standard','amazon'])for(const pronouns of ['she/her','he/him','they/them',undefined])for(const animalGuide of ['dog','cat','owl','lion','tiger','penguin','t-rex','unicorn']){
  const orderId=`TEST-INNER-VOICE-${formatId}-${animalGuide}`;
  const w0=buildW0RunManifestFromConfig(config,{orderId,platform:formatId==='amazon'?'amazon':'d2c',formatId,characterHash:'testhash',input:{bookSpecs:{testMode:true},characterSpecs:{childName:'Alexandra & Christopher',animalGuide,hometown:'Grass Valley',pronouns}}});
  const twoB={characterHash:'testhash',order:{orderId,bookId:config.bookId},entries:Object.values(config.rendering.recipe!.poses).map(p=>({poseNumber:p.poseNumber,bgRemovedKey:p.referenceKey}))};
  const assembly=await buildW3AssemblyInput({orderId,bookId:config.bookId,formatId,testMode:true,testModePages:0},{loadManifest:async key=>key.endsWith('1-manifest.json')?w0:key.endsWith('2b-manifest.json')?twoB:null});
  const plan=buildW3PreviewPlan({...assembly});
  const objectPronoun=pronouns==='she/her'?'her':pronouns==='he/him'?'him':'them';
  assert.ok(plan.pagePreviewItems[22].pageHtml.includes(`It helped ${objectPronoun} know`));
  assert.ok(plan.pagePreviewItems[27].pageHtml.includes(`child waiting behind ${objectPronoun}`));assert.equal(plan.pagePreviewItems.length,32);assert.deepEqual(plan.pagePreviewItems.map(p=>p.pageLabel),pages.map(p=>p.label));
  for(const p of plan.pagePreviewItems){assert.ok(!p.pageHtml.includes('book-mvp-simple-adventure'));assert.ok(!/\[(Child Name|animal guide|animal clue|object pronoun)\]/i.test(p.pageHtml));}
  const manifest=buildW3Manifest({...assembly,pagePreviewImages:pages.map(p=>({pageNumber:p.index,r2Key:`${config.bookId}/orders/${orderId}/preview-images/${p.label}.png`})),coverPngR2Key:`${config.bookId}/orders/${orderId}/preview-images/cover-spread.png`});assert.equal((manifest.manifest.summary as Record<string,unknown>).readyForBook,false);
 }
 console.log('Inner Voice draft,32-page editions,poses,8guides and readiness passed');
}
main().catch(error=>{console.error(error);process.exitCode=1});
