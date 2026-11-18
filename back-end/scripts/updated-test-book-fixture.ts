import assert from 'node:assert/strict';
import { encode as encodePng } from 'fast-png';
import jpeg from 'jpeg-js';
import { loadBundledBookConfig } from '../src/lib/books/load-book-config';
import { buildW0RunManifestFromConfig } from '../src/lib/books/build-run-manifest';
import { buildW0OrderUpsertPayload } from '../src/lib/w0-manifest-builder';
import { calculateCharacterHash } from '../src/lib/character-hash';
import { createAdminWorkflowTestAdmission } from '../src/lib/admin-workflow-test';
import { buildBaseCharacterAssetKey, buildGeneratedPoseAssetKey, buildBgRemovedPoseAssetKey } from '../src/lib/order-paths';
import type { UpdatedBookCopyPorts } from '../src/lib/books/updated-test-book-copy';

type Row = Record<string, unknown>;
export function updatedTestBookFixture() {
  const sourceId='TEST-COPY-SOURCE', bookId='book-finding-our-inner-voice', actor='operator@example.test';
  const date='2026-11-18T00:00:00.000Z';
  const config=structuredClone(loadBundledBookConfig({bookId,version:3}));config.status='active';config.version=4;
  const specs={childName:'Luca',age:2,pronouns:'he-him',animalGuide:'tiger',hometown:'Grass Valley',skinTone:'light',hairStyle:'side-part',hairColor:'light-brown',favoriteColor:'red'};
  const hash=calculateCharacterHash(specs,sourceId),prefix=`${bookId}/orders/${sourceId}`;
  const w0=buildW0RunManifestFromConfig(config,{orderId:sourceId,rootOrderId:sourceId,amazonOrderId:sourceId,orderDbId:1,platform:'amazon',formatId:'amazon',characterHash:hash,createdAt:date,runId:'fixture',input:{characterSpecs:specs,dedicationText:'Original dedication',bookSpecs:{bookId,formatId:'amazon',configVersion:4},orderDetails:{quantity:1,shippingAddress:{name:'Fixture Recipient',address_line_1:'1 Test St',city:'Example',state_code:'CA',postal_code:'90001',country_code:'US'}}}});
  const originals=new Map<string,Uint8Array>();const objects=new Map<string,Uint8Array>();
  const seed=(bucket:string,key:string,value:unknown)=>objects.set(bucket+':'+key,typeof value==='string'?new TextEncoder().encode(value):new TextEncoder().encode(JSON.stringify(value)));
  const poseNumbers=[...new Set([0,...w0.book.resolved.qaPolicy.pose.requiredPoseNumbers])].sort((a,b)=>a-b);
  const twoA={schema:'lhb.run-manifest@v2.0',bookId,characterHash:hash,orderId:sourceId,rootOrderId:sourceId,amazonOrderId:sourceId,
    order:{orderId:sourceId,rootOrderId:sourceId,amazonOrderId:sourceId},revisions:{pending:{},history:[{poseNumber:8,source:'accepted clean replacement'}]},entries:poseNumbers.map(n=>({poseNumber:n,status:'approved',approved:true,approvedKey:buildGeneratedPoseAssetKey(hash,n,bookId),needsReview:false,
      replacementCount:n===8?1:0,replacedAt:n===8?date:null,flipped:[3,11].includes(n),flippedAt:[3,11].includes(n)?date:null,qaScore:1,styleScore:1}))};
  const twoB={...twoA,entries:twoA.entries.map(e=>({...e,bgRemovedKey:buildBgRemovedPoseAssetKey(hash,e.poseNumber,bookId),sourceApprovedKey:e.approvedKey,sourceReplacedAt:e.replacedAt,sourceReplacementCount:e.replacementCount,briaStatus:'completed',bgRemoved:true,bgRemovedStatus:'completed',isFlagged:false}))};
  seed('orders',prefix+'/manifests/1-manifest.json',w0);seed('orders',prefix+'/manifests/2a-manifest.json',twoA);seed('orders',prefix+'/manifests/2b-manifest.json',twoB);
  const contentTypes=new Map<string,string>();
  for(const [index,key] of [buildBaseCharacterAssetKey(hash,bookId),...twoA.entries.map(e=>e.approvedKey),...twoB.entries.map(e=>e.bgRemovedKey)].entries()){
    const data=new Uint8Array([index*7,100,180,255]);
    const isJpeg=index<14;
    objects.set('assets:'+key,isJpeg?new Uint8Array(jpeg.encode({width:1,height:1,data:Buffer.from(data)},90).data):encodePng({width:1,height:1,data,channels:4,depth:8}));
  }
  for(const [key,value]of objects)originals.set(key,value.slice());
  const source:Row={...buildW0OrderUpsertPayload({normalizedInput:{orderId:sourceId,characterHash:hash,customerEmail:'recipient@example.test'},manifest:w0,manifestKey:w0.artifacts.manifestKey}),id:1,
    manifest_2a_url:prefix+'/manifests/2a-manifest.json',manifest_2b_url:prefix+'/manifests/2b-manifest.json',manifest_3_url:prefix+'/manifests/3-manifest.json',
    status:'pending_assembly_review',execution_status:'done',workflow_step:'book_assembly_completed',next_workflow:'4',current_workflow:null,started_at:null,updated_at:date,
    review_stages:{preBria:{status:'approved'},postBria:{status:'approved'},postPdf:{status:'pending'}},
    product_info:{_overnight_test:true,_created_via_csv:true,_quantity_unit_count:1,_admin_workflow_test:createAdminWorkflowTestAdmission(actor,4,new Date(date))}};
  const rows=new Map<string,Row>([[sourceId,source]]);const targetConfig=structuredClone(config);targetConfig.version=5;
  let writes=0, clock=0, failAfter=-1, failBeforeInsert=false, failReadback=false;
  let afterWrite:((key:string)=>void)|undefined;
  const trip=(key:string)=>{afterWrite?.(key);if(writes++===failAfter)throw Error('SYNTHETIC_INTERRUPTION');};
  const ports:UpdatedBookCopyPorts={
    loadOrder:async id=>{if(failReadback&&id!==sourceId&&rows.has(id)){failReadback=false;throw Error('SYNTHETIC_READBACK_FAILURE');}return rows.has(id)?structuredClone(rows.get(id)!):null;},
    loadConfig:async()=>structuredClone(targetConfig),
    readObject:async(bucket,key)=>objects.get(bucket+':'+key)?.slice()??null,
    createObject:async(bucket,key,bytes,contentType)=>{assert(!key.startsWith(prefix+'/'),'Never write original order');assert(!key.includes('/characters/'+hash+'/'),'Never write original character');const name=bucket+':'+key;if(objects.has(name))return false;objects.set(name,bytes.slice());contentTypes.set(name,contentType);trip(name);return true;},
    insertOrder:async row=>{assert(!Object.hasOwn(row,'quantity'),'orders has no quantity column; use product_info');if(failBeforeInsert)throw Error('SYNTHETIC_BEFORE_INSERT');const id=String(row.orderId);if(rows.has(id))throw Error('DUPLICATE');rows.set(id,{...structuredClone(row),id:2});trip('INSERT');},
    now:()=>new Date(Date.parse(date)+(clock++)*1000),
  };
  return{sourceId,bookId,actor,date,hash,prefix,w0,twoA,twoB,source,rows,objects,originals,contentTypes,targetConfig,ports,
    get writes(){return writes;},set failAfter(value:number){failAfter=value;},set failBeforeInsert(value:boolean){failBeforeInsert=value;},set failReadback(value:boolean){failReadback=value;},set afterWrite(value:((key:string)=>void)|undefined){afterWrite=value;}};
}
