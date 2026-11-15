#!/usr/bin/env tsx
/** Independent PDF.js decoding of the actual managed PDFs, compared to original RGB page rasters. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import sharp from 'sharp';
import {sha256} from '../src/lib/books/immutable-asset-upload';
async function main(){
 assert.ok(process.argv[2],'Supply preparation directory');const dir=resolve(process.argv[2]);
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');const results=[];
 for(const edition of ['standard','amazon']){
  const file=resolve(dir,`print-pdfs/inner-voice-${edition}-managed-35-pages.pdf`);
  const doc=await pdfjs.getDocument({data:new Uint8Array(readFileSync(file)),isEvalSupported:false,useSystemFonts:false,disableFontFace:true}).promise;
  assert.equal(doc.numPages,35);let images=0;
  for(let n=1;n<=35;n++){
   const page=await doc.getPage(n),ops=await page.getOperatorList();
   const draws=ops.fnArray.map((op,i)=>({op,i})).filter(({op})=>op===pdfjs.OPS.paintImageXObject);
   const blank=n===2||n===35;assert.equal(draws.length,blank?0:1);
   if(!blank){
    const id=ops.argsArray[draws[0].i][0] as string;
    const image=await new Promise<{width:number;height:number;data:Uint8Array}>((done,reject)=>{
     const timer=setTimeout(()=>reject(Error('PDF image decode timeout')),15000);
     (id.startsWith('g_')?page.commonObjs:page.objs).get(id,(value:{width:number;height:number;data:Uint8Array})=>{clearTimeout(timer);done(value);});
    });
    const source=resolve(dir,'rasters',edition,'cat/normal',n===1?'cover.png':`p${String(n-3).padStart(2,'0')}.png`);
    const expected=await sharp(readFileSync(source)).removeAlpha().raw().toBuffer({resolveWithObject:true});
    assert.equal(image.width,expected.info.width);assert.equal(image.height,expected.info.height);
    const channels=image.data.length/(image.width*image.height);assert.ok(channels===3||channels===4);
    const rgb=Buffer.alloc(image.width*image.height*3);
    for(let p=0;p<image.width*image.height;p++){
     rgb[p*3]=image.data[p*channels];rgb[p*3+1]=image.data[p*channels+1];rgb[p*3+2]=image.data[p*channels+2];
     if(channels===4)assert.equal(image.data[p*channels+3],255);
    }
    assert.equal(sha256(rgb),sha256(expected.data),`Decoded pixels differ: ${edition} PDF page ${n}`);images++;
   }
   page.cleanup();
  }
  await doc.destroy();results.push({edition,file,sha256:sha256(readFileSync(file)),pages:35,imagesDecoded:images,rgbPixelsMatchSource:true,blankPdfPages:[2,35],decoder:'PDF.js'});
  console.log(`${edition}: all 35 PDF pages and 33 decoded RGB images verified`);
 }
 writeFileSync(resolve(dir,'print-pdfs/independent-pixel-verification.json'),JSON.stringify(results,null,2)+'\n');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
