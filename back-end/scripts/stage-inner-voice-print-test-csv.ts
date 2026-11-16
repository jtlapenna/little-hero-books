#!/usr/bin/env tsx
/** Stage only the synthetic customization ZIP; keep the recipient-bearing CSV private. */
import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {sha256} from '../src/lib/books/immutable-asset-upload';
import {getObject,putObject,R2_ORDERS_BUCKET,validateR2Config} from '../src/lib/r2-client';
import {getSignedUrlForObject} from '../src/lib/r2-service';
import {downloadAndExtractCustomizationZip} from '../src/lib/zip-downloader';
import {parseAmazonCustomization} from '../src/lib/amazon-customization-parser';

async function main(){
 assert.ok(process.argv[2],'Supply the preparation directory');
 const dir=resolve(process.argv[2]),output=resolve(dir,'private/amazon-print-test-ready.csv');
 assert.ok(!existsSync(output),'Refuse to overwrite a prepared CSV');
 assert.ok(validateR2Config().valid&&process.env.R2_ORDERS_BUCKET_NAME===R2_ORDERS_BUCKET,'Require an explicit valid orders bucket');
 const zip=readFileSync(resolve(dir,'private/amazon-customization.zip')),digest=sha256(zip);
 const source=readFileSync(resolve(dir,'private/amazon-print-test-template.csv'),'utf8');
 assert.equal(source.split('https://customization.print-test.invalid/amazon-customization.zip').length,2,'Expected one placeholder URL');
 const key=`print-tests/20261115/customization/${digest}/amazon-customization.zip`;
 const existing=await getObject(R2_ORDERS_BUCKET,key,{allowNotFound:true});
 let result='already-present';
 if(existing.status===404){
  const put=await putObject(R2_ORDERS_BUCKET,key,zip,'application/zip',{ifNoneMatch:'*'});
  assert.ok(put.ok||put.status===412,'Customization upload failed');result=put.status===412?'already-present':'uploaded';
 }else{assert.ok(existing.ok,'Customization lookup failed');assert.equal(sha256(new Uint8Array(await existing.arrayBuffer())),digest,'Immutable customization collision');}
 const verified=await getObject(R2_ORDERS_BUCKET,key);assert.ok(verified.ok);assert.equal(sha256(new Uint8Array(await verified.arrayBuffer())),digest);
 const expires=86400,url=await getSignedUrlForObject(key,R2_ORDERS_BUCKET,expires);
 const response=await fetch(url);assert.ok(response.ok,'Signed customization URL is not fetchable');
 assert.equal(sha256(new Uint8Array(await response.arrayBuffer())),digest);
 const parsed=parseAmazonCustomization(await downloadAndExtractCustomizationZip(url));
 assert.ok(parsed?.childName==='Alexandra'&&parsed.animalGuide==='cat','Hosted ZIP parser mismatch');
 writeFileSync(output,source.replace('https://customization.print-test.invalid/amazon-customization.zip',url),{flag:'wx',mode:0o600});
 const receipt={schema:'lhb.inner-voice-print-test-csv-stage@v1',key,zipSha256:digest,uploadResult:result,readbackMatches:true,parserMatches:true,
  csvSha256:sha256(readFileSync(output)),signedUrlExpiresAt:new Date(Date.now()+expires*1000).toISOString(),csvIsPrivate:true,recipientUploaded:false,hostedImport:false,paidOrder:false};
 writeFileSync(resolve(dir,'csv-staging-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({staged:true,readbackMatches:true,parserMatches:true,csvIsPrivate:true,recipientUploaded:false,paidOrder:false}));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'CSV staging failed');process.exitCode=1;});
