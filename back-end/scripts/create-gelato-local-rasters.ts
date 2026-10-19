/** Disposable visible geometry/identity PNGs for local/CI journeys. No service access or dotenv. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const sha=(value:Uint8Array)=>createHash('sha256').update(value).digest('hex');
const escape=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
async function main(){
 const [output,runId]=process.argv.slice(2);assert(output&&runId,'Usage: node --import tsx scripts/create-gelato-local-rasters.ts OUTPUT_DIR RUN_ID');
 assert.match(runId,/^[A-Za-z0-9-]{1,40}$/);await mkdir(output,{mode:0o700});
 const bytes=await readFile(path.resolve(__dirname,'../src/lib/books/configs/book-finding-our-inner-voice/v2.json'));
 const config=JSON.parse(bytes.toString()) as {bookId:string;formats:Record<string,{interior:{pageSequence:Array<{label:string}>}}>};
 const children=[];
 for(const [role,formatId]of [['WEB-A','standard'],['AMZ-A','amazon'],['SIB-A','amazon'],['SIB-B','amazon']] as const){
  await mkdir(path.join(output,role),{mode:0o700});const pages=config.formats[formatId].interior.pageSequence;assert.equal(pages.length,32);const assets=[];
  for(let index=0;index<33;index++){
   const cover=index===32,width=cover?4832:2434,height=2434,label=cover?'cover-spread':pages[index].label;
   const panel=(x:number,heading:string)=>`<g transform="translate(${x},0)"><rect x="85" y="85" width="2250" height="2264" fill="white" stroke="black" stroke-width="12"/><text x="160" y="350" font-size="100">ENGINEERING TEST</text><text x="160" y="590" font-size="100">${role}</text><text x="160" y="830" font-size="100">EDITION ${formatId.toUpperCase()}</text><text x="160" y="1070" font-size="90">${escape(heading)}</text><text x="160" y="1510" font-size="60">NOT CUSTOMER ARTWORK</text><text x="160" y="1640" font-size="60">${runId}</text><text x="160" y="1810" font-size="50">${escape(label)}</text></g>`;
   const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" font-family="DejaVu Sans,sans-serif"><rect width="100%" height="100%" fill="white"/>${panel(0,cover?'BACK COVER':`INNER ${String(index+1).padStart(2,'0')} OF 32`)}${cover?panel(2416,'FRONT COVER'):''}</svg>`;
   const png=await sharp(Buffer.from(svg)).flatten({background:'white'}).greyscale().png().toBuffer();
   const filename=role+'/'+label+'.png';await writeFile(path.join(output,filename),png,{mode:0o600});
   assets.push({filename,label:cover?'cover':label,width,height,pngSha256:sha(png)});
  }
  children.push({role,formatId,orderId:'LOCAL-CI-'+runId+'-'+role,assets});
 }
 await writeFile(path.join(output,'rasters.json'),JSON.stringify({runId,configSha256:sha(bytes),bookId:config.bookId,caseChildren:children,liveRequests:0,purpose:'Visible dummy geometry/identity fixtures only; no creative approval'},null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({children:4,sourceRasters:132,liveRequests:0,output}));
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
