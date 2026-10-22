/** Offline canonical W0/W3 -> W4 preparation. No environment/key loader, persistence or service access. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {buildW0RunManifestFromConfig} from '../../../back-end/src/lib/books/build-run-manifest';
import {loadBundledBookConfig} from '../../../back-end/src/lib/books/load-book-config';
import {normalizeW0Manifest} from '../../../back-end/src/lib/books/normalize-w0-manifest';
import {buildW3Manifest} from '../../../back-end/src/lib/books/w3-manifest';
import {buildW0OrderUpsertPayload} from '../../../back-end/src/lib/w0-manifest-builder';
import {buildW4PrintInput} from '../../../back-end/src/lib/books/w4-print-input';
import {assertW4GelatoPrintInput} from '../../../back-end/src/lib/books/w4-gelato-print-input';
import {buildGelatoPrintPdf} from '../../../back-end/src/lib/books/build-gelato-print-pdf';
const sha=(v:Uint8Array)=>createHash('sha256').update(v).digest('hex');
async function main(){
 const [rasterDirectory,output]=process.argv.slice(2);assert(rasterDirectory&&output&&process.argv.length===4);
 const out=path.resolve(output);await mkdir(out,{mode:0o700});
 let external=0;globalThis.fetch=async()=>{external++;throw Error('Offline preparation forbids network');};
 const packet=JSON.parse(await readFile(path.join(__dirname,'packet.json'),'utf8'));assert.equal(packet.canExecute,false);assert.equal(packet.approval,null);
 const rasters=JSON.parse(await readFile(path.join(rasterDirectory,'rasters.json'),'utf8'));
 const config=loadBundledBookConfig({bookId:'book-finding-our-inner-voice',version:2});assert.equal(config.status,'draft');
 const rows:Record<string,unknown>[]=[],records:unknown[]=[],uploads:unknown[]=[];
 for(const c of packet.cases)for(const [i,role] of c.roles.entries()){
  const orderId=c.proposedMemberOrderIds[i],format=c.case==='website-single'?'standard':'amazon';assert.match(orderId,/^TEST-GELATO-U-48H-/);
  const input={orderId,rootOrderId:c.proposedRootOrderId,amazonOrderId:format==='amazon'?c.proposedRootOrderId:null,orderDbId:null,platform:format==='amazon'?'amazon' as const:'d2c' as const,formatId:format,customerApprovalRequired:true,characterHash:'dummy-'+role,requestedShippingTier:c.tier,runId:'offline-'+role,createdAt:packet.preparedAt,input:{characterSpecs:{childName:role},bookSpecs:{testMode:true},dedicationText:'Engineering dummy '+role}};
  const canonicalOne=buildW0RunManifestFromConfig(config,input);
  // Intentional controlled readiness fixture, as in the existing combined tests. Never publish/activate this clone.
  const fixtureConfig=structuredClone(config);fixtureConfig.status='active';
  const one=buildW0RunManifestFromConfig(fixtureConfig,{...input,input:{...input.input,bookSpecs:{testMode:false}}}),prefix=one.artifacts.orderPrefix,normalized=normalizeW0Manifest(one);
  const three=buildW3Manifest({orderId,rootOrderId:c.proposedRootOrderId,amazonOrderId:input.amazonOrderId,bookId:config.bookId,formatId:format,configVersion:2,renderSnapshot:normalized.renderSnapshot,oneManifestKey:one.artifacts.manifestKey,backendUrl:'https://admin.littleherolabs.com',orderR2BaseKey:prefix,pagePreviewImages:one.book.resolved.pagePlan.map(p=>({pageNumber:p.index,r2Key:prefix+'/preview-images/'+p.label+'.png'})),coverPngR2Key:prefix+'/preview-images/cover-spread.png'});
  const canonicalThree=buildW3Manifest({orderId,rootOrderId:c.proposedRootOrderId,amazonOrderId:input.amazonOrderId,bookId:config.bookId,formatId:format,configVersion:2,renderSnapshot:normalizeW0Manifest(canonicalOne).renderSnapshot,oneManifestKey:canonicalOne.artifacts.manifestKey,backendUrl:'https://admin.littleherolabs.com',orderR2BaseKey:prefix,pagePreviewImages:one.book.resolved.pagePlan.map(p=>({pageNumber:p.index,r2Key:prefix+'/preview-images/'+p.label+'.png'})),coverPngR2Key:prefix+'/preview-images/cover-spread.png'});
  assert.equal((canonicalThree.manifest.summary as {readyForBook:boolean}).readyForBook,false);
  assert.equal((three.manifest.summary as {readyForBook:boolean}).readyForBook,true);
  const row={...buildW0OrderUpsertPayload({normalizedInput:input,manifest:one,manifestKey:one.artifacts.manifestKey}),id:null,orderId,root_order_id:c.proposedRootOrderId,amazon_order_id:input.amazonOrderId,print_provider:'gelato',book_specs:{testMode:true},one_manifest_url:one.artifacts.manifestKey,manifest_3_url:three.manifest3Key,customer_approval_required:true,customer_approval_status:'pending',quantity:1,shipping_tier:c.tier,customer_email:'engineering@example.invalid',shipping_address:{name:'PRIVATE RECIPIENT REQUIRED',street1:'NOT A SHIPPING ADDRESS',city:'UNBOUND',state:'CA',zip:'00000',country:'US'}};rows.push(row);
  const manifests=new Map<string,unknown>([[one.artifacts.manifestKey,one],[three.manifest3Key,three.manifest]]);
  const sources=rasters.caseChildren.find((r:{role:string})=>r.role===role);assert(sources&&sources.assets.length===33);const blobs=new Map<string,Buffer>();
  for(const [j,a] of sources.assets.entries()){
   assert.match(a.filename,/^(WEB-A|AMZ-A|SIB-A|SIB-B)\/[A-Za-z0-9_-]+\.png$/);const bytes=await readFile(path.join(rasterDirectory,a.filename));assert.equal(sha(bytes),a.pngSha256);
   const key=prefix+'/preview-images/'+(j===32?'cover-spread':one.book.resolved.pageLabels[j])+'.png';blobs.set(key,bytes);uploads.push({role,source:a.filename,key,sha256:sha(bytes),bytes:bytes.length});
  }
  const canonicalManifests=new Map<string,unknown>([[one.artifacts.manifestKey,canonicalOne],[three.manifest3Key,canonicalThree.manifest]]);
  await assert.rejects(buildW4PrintInput({orderId,bookId:config.bookId},{loadManifest:async key=>{assert(canonicalManifests.has(key));return canonicalManifests.get(key)!;},loadOrder:async key=>{assert.equal(key,orderId);return row;},defaultBackendUrl:'https://admin.littleherolabs.com',expectedProvider:'gelato'}),/original W3 source is not ready/);
  const printInput=assertW4GelatoPrintInput(await buildW4PrintInput({orderId,bookId:config.bookId},{loadManifest:async key=>{assert(manifests.has(key),'No foreign manifest');return manifests.get(key)!;},loadOrder:async key=>{assert.equal(key,orderId,'No foreign order lookup');return row;},defaultBackendUrl:'https://admin.littleherolabs.com',expectedProvider:'gelato'}));
  let pdf:Buffer|undefined;
  const built=await buildGelatoPrintPdf(printInput,'https://admin.littleherolabs.com',{loadImage:async key=>{const b=blobs.get(key);assert(b,'No foreign image');return b;},putObject:async(_key,stream)=>{assert.equal(pdf,undefined);const parts:Uint8Array[]=[];const reader=stream.getReader();for(;;){const v=await reader.read();if(v.done)break;parts.push(v.value);}pdf=Buffer.concat(parts);}});
  assert(pdf);assert.equal(sha(pdf),c.pdfs[i].sha256,'Fresh identity must retain frozen PDF bytes');assert.equal(pdf.length,c.pdfs[i].bytes);await writeFile(path.join(out,role+'.pdf'),pdf,{flag:'wx',mode:0o400});
  for(const [label,key,body] of [['manifest1',one.artifacts.manifestKey,one],['manifest3',three.manifest3Key,three.manifest]] as const){const bytes=Buffer.from(JSON.stringify(body,null,2)+'\n');await writeFile(path.join(out,role+'-'+label+'.json'),bytes,{flag:'wx',mode:0o600});uploads.push({role,source:role+'-'+label+'.json',key,sha256:sha(bytes),bytes:bytes.length});}
  records.push({role,proposedOrderId:orderId,sha256:sha(pdf),bytes:pdf.length,pages:built.pageCount,provisionalArtifactKey:built.key,sourceFingerprint:built.sourceFingerprint,canonicalW0W3W4Producer:true,productionReadinessSubstituted:true,canonicalDraftReadySourceRejected:true,bundledConfigChanged:false,hostedExecution:false,approval:'pending'});
 }
 assert.equal(external,0);assert.equal(rows.length,4);assert.equal(uploads.length,140);
 await writeFile(path.join(out,'fixture-candidates.json'),JSON.stringify({canPersist:false,canExecute:false,reason:'Real DB IDs, private recipient, human approval and hosted bindings are unbound',rows,uploads,records,externalRequests:0},null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({canonicalW0W3W4Local:true,productionReadinessSubstituted:true,canonicalDraftReadySourceRejected:true,bundledConfigChanged:false,children:4,manifests:8,pngs:132,pdfs:4,frozenPdfHashesPreserved:true,externalRequests:0,canPersist:false,canExecute:false}));
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
