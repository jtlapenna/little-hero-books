import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {loadBundledBookConfig} from '../src/lib/books/load-book-config';
import {resolvePreviewCanonicalsForConfig} from '../src/lib/preview-canonicals';
import {BookConfigSchema} from '../src/lib/books/types';
const folder=process.argv[2];
if(!folder)throw new Error('Pass the packaged asset directory');
const config=loadBundledBookConfig({bookId:'book-finding-our-inner-voice',version:1});
const inventory=JSON.parse(readFileSync(path.join(folder,'asset-inventory.json'),'utf8')) as {splits:Array<{pixelIdenticalRejoin:boolean;rectangles:number[][]}>;assets:Array<{key:string;sha256:string;width?:number;height?:number}>};
const assets=new Map(inventory.assets.map(a=>[a.key,a]));
for(const asset of inventory.assets){assert.ok(asset.key.startsWith(`${config.bookId}/v1/`));assert.equal(createHash('sha256').update(readFileSync(path.join(folder,asset.key))).digest('hex'),asset.sha256)}
const recipe=config.rendering.recipe!;
const keys=[...Object.values(config.assets.backgrounds),...Object.values(config.assets.fonts),...Object.values(config.assets.overlays),...Object.values(recipe.poses).map(p=>p.referenceKey),...Object.values(recipe.animals).flatMap(Object.values)];
for(const key of keys)assert.ok(assets.has(key),`Missing referenced asset ${key}`);
for(const page of config.formats.standard.interior.pageSequence){const a=assets.get(config.assets.backgrounds[page.backgroundSlot!])!;assert.deepEqual([a.width,a.height],[2048,2048]);}
assert.equal(inventory.splits.length,5);assert.ok(inventory.splits.every(s=>s.pixelIdenticalRejoin));
for(const skinTone of ['light','medium','tan','medium-dark','deep'])for(const clothingStyle of ['t-shirt+shorts','dress'])for(const hairStyle of ['side-part','curly-short','afro','small-puffy-ponytail'])for(const hairColor of ['black','blonde','auburn','medium-brown']){
 const refs=resolvePreviewCanonicalsForConfig({skinTone,clothingStyle,hairStyle,hairColor},BookConfigSchema.parse(config));assert.ok(assets.has(refs.baseRefKey),refs.baseRefKey);assert.ok(refs.hairRefKey&&assets.has(refs.hairRefKey),refs.hairRefKey??'hair');
}
console.log('Packaged hashes,2K backgrounds,split provenance and customization bindings passed');
