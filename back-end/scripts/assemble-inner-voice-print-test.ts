#!/usr/bin/env tsx
/** Exercise the real Gelato assembler with local rasters; never register or submit a provider order. */
import assert from 'node:assert/strict';
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { Writable } from 'node:stream';
import { resolve } from 'node:path';
import { BookConfigSchema } from '../src/lib/books/types';
import { sha256 } from '../src/lib/books/immutable-asset-upload';
import { buildGelatoPrintPdf } from '../src/lib/books/build-gelato-print-pdf';
import { assertW4GelatoPrintInput } from '../src/lib/books/w4-gelato-print-input';
import type { BuildW4PrintInputResult } from '../src/lib/books/w4-print-input';

async function main() {
  assert.ok(process.argv[2], 'Supply preparation directory');
  const dir=resolve(process.argv[2]),candidate=resolve(dir,'candidate-verified/authoring-draft.json');
  const config=BookConfigSchema.parse(JSON.parse(readFileSync(candidate,'utf8')));
  assert.equal(config.status,'draft', 'Only a local draft is accepted by this preparation tool');
  assert.ok(readFileSync(candidate).equals(readFileSync(resolve(dir,'proof/flow-config.json'))), 'Proof must use exact candidate bytes');
  const renders=JSON.parse(readFileSync(resolve(dir,'render-results.json'),'utf8'));
  assert.equal(renders.failed,0);assert.equal(renders.outsideCanvasFlags,0);
  const output=resolve(dir,'print-pdfs');mkdirSync(output,{recursive:true});
  const receipts=[];globalThis.fetch=async()=>{throw Error('Local print-file assembly forbids network');};
  for(const formatId of ['standard','amazon']) {
    const edition=config.formats[formatId], print=edition.print;
    assert.equal(print.provider,'gelato');
    const orderId=`LOCAL-PRINT-PREP-${formatId.toUpperCase()}`,prefix=`${config.bookId}/orders/${orderId}`;
    const labels=edition.interior.pageSequence.map(page=>page.label),keys=labels.map(label=>`${prefix}/preview-images/${label}.png`);
    const coverKey=`${prefix}/preview-images/cover-spread.png`;
    const base='https://local-print-prep.invalid',url=(key:string)=>base+'/api/assets/'+key;
    const input: BuildW4PrintInputResult={
      orderId,orderDbId:null,amazonOrderId:null,rootOrderId:null,characterHash:'retained-editor-review-poses',bookId:config.bookId,formatId,
      orderPrefix:prefix,orderR2BaseKey:prefix,oneManifestKey:prefix+'/manifests/1-manifest.json',oneManifestUrl:null,oneManifestSchema:null,
      manifest3Key:prefix+'/manifests/3-manifest.json',manifest3Url:base+'/3-manifest.json',manifest4Key:prefix+'/manifests/4-manifest.json',manifest4Url:base+'/4-manifest.json',backendUrl:base,
      isAmazonOrder:formatId==='amazon',expectedPageCount:32,pageLabels:labels,pagePlan:edition.interior.pageSequence,pageImageUrls:keys.map(url),pagePreviewImageKeys:keys,pagesGenerated:32,
      coverPreviewUrl:url(coverKey),coverPreviewImageKey:coverKey,coverPreviewImageUrls:[url(coverKey)],interiorPreviewImageUrls:keys.map(url),
      coverPdfFilename:'cover.pdf',coverPdfR2Key:prefix+'/cover.pdf',pdfFilename:'interior.pdf',pdfR2Key:prefix+'/interior.pdf',
      shippingAddress:{},customer:{email:null,name:null},title:'Local print preparation; no order',marketplace_id:null,hasP00:true,hasPagesWithCloudflare:false,
      shipping_tier:'standard',shippingTier:'standard',ShipmentServiceLevelCategory:null,ShipServiceLevel:null,amazon_shipment_service_level:null,
      summary:{},pages:{},pagesWithCloudflare:{},pngGeneration:{},pdfGeneration:{},bookSpecs:{},orderDetails:{},characterSpecs:{},
      providerPrintConfig:print,bookConfigVersion:config.version,generatedAt:null,runStamp:'local-print-prep-20261115',workflow:'offline-print-preparation',
    };
    const sources=new Map([...keys.map((key,i)=>[key,resolve(dir,'rasters',formatId,'cat/normal',labels[i]+'.png')] as const),[coverKey,resolve(dir,'rasters',formatId,'cat/normal/cover.png')] as const]);
    const target=resolve(output,`inner-voice-${formatId}-canonical-35-pages.pdf`);assert.ok(!existsSync(target),'Refuse to overwrite a print artifact');
    const artifact=await buildGelatoPrintPdf(assertW4GelatoPrintInput(input),base,{
      loadImage:async key=>{const source=sources.get(key);assert.ok(source,'Unknown local source key');return readFileSync(source);},
      putObject:async(_key,body)=>{await body.pipeTo(Writable.toWeb(createWriteStream(target,{flags:'wx'})) as WritableStream<Uint8Array>);},
    });
    assert.equal(artifact.pageCount,35);assert.ok(statSync(target).size<256_000_000,'File exceeds current stored-file verifier budget');
    receipts.push({formatId,file:target,sha256:sha256(readFileSync(target)),bytes:statSync(target).size,configSha256:sha256(readFileSync(candidate)),
      assemblerArtifact:artifact,syntheticOrderPrefix:true,registered:false,uploaded:false,providerCalls:0,
      poseProvenance:'Retained editor/review poses; no new W2 run',sources:[coverKey,...keys].map(key=>({key,file:sources.get(key),sha256:sha256(readFileSync(sources.get(key)!))}))});
    console.log(`${formatId}: 35 pages, ${statSync(target).size} bytes, lossless canonical assembler`,);
  }
  writeFileSync(resolve(output,'canonical-assembly-receipt.json'),JSON.stringify(receipts,null,2)+'\n',{flag:'wx'});
}
main().catch(error=>{console.error(error);process.exitCode=1;});
