#!/usr/bin/env tsx
/** Exercise the real CSV upload and ZIP parser with a local database/W0 adapter. No live requests. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {NextRequest} from 'next/server';
import {buildBookConfigPublishPayload} from '../src/lib/books/runtime-book-config';
import {BookConfigSchema} from '../src/lib/books/types';

type Row=Record<string,unknown>;
const object=(value:unknown):Row=>{assert.ok(value&&typeof value==='object'&&!Array.isArray(value));return value as Row;};
const hash=(data:Uint8Array|string)=>createHash('sha256').update(data).digest('hex');
async function main(){
 assert.ok(process.argv[2],'Supply the preparation output directory');
 const dir=resolve(process.argv[2]);
 const config=BookConfigSchema.parse(JSON.parse(readFileSync(resolve(dir,'candidate-verified/release-config.json'),'utf8')));
 const csv=readFileSync(resolve(dir,'private/amazon-print-test-template.csv'));
 const zip=readFileSync(resolve(dir,'private/amazon-customization.zip'));
 const expected=object(JSON.parse(readFileSync(resolve(dir,'private/character-specs.json'),'utf8')));
 const recipient=object(JSON.parse(readFileSync(resolve(dir,'private/recipient.json'),'utf8')));
 const fields=object(JSON.parse(readFileSync(resolve(dir,'private/upload-form-fields.json'),'utf8')));
 Object.assign(process.env,{SUPABASE_URL:'https://print-csv-db.example.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic-print-csv-service',BACKEND_API_TOKEN:'synthetic-print-csv-machine',N8N_W0_WEBHOOK_URL:'https://print-csv-w0.example.test/hook'});
 const tables:Record<string,Row[]>={book_configs:[buildBookConfigPublishPayload(config,{activate:true})]};
 const w0:Row[]=[];
 let zipReads=0,externalAttempts=0;
 const original=globalThis.fetch,keep={log:console.log,warn:console.warn,error:console.error,info:console.info};
 const matches=(row:Row,key:string,value:string):boolean=>{
  if(['select','limit','order','offset'].includes(key))return true;
  if(value.startsWith('eq.'))return String(row[key])===value.slice(3);
  if(value==='is.null')return row[key]==null;
  if(value.startsWith('in.'))return value.slice(3,-1).split(',').includes(String(row[key]));
  if(value.startsWith('ilike.'))return String(row[key]??'').toLowerCase().startsWith(value.slice(6).replace(/%$/,'').toLowerCase());
  throw Error('Unimplemented local database filter');
 };
 globalThis.fetch=async(input,init)=>{
  const request=input instanceof Request?input:new Request(input,init),url=new URL(request.url);
  if(url.origin==='https://customization.print-test.invalid'){zipReads++;return new Response(new Uint8Array(zip),{headers:{'content-type':'application/zip'}});}
  if(url.origin==='https://print-csv-w0.example.test'){w0.push(object(await request.json()));return Response.json({ok:true});}
  if(url.origin!=='https://print-csv-db.example.test'){externalAttempts++;throw Error('Offline CSV test blocked an external request');}
  const table=url.pathname.replace('/rest/v1/','');assert.ok(['book_configs','orders'].includes(table),'Unexpected database table');
  const rows=(tables[table]??=[]),selected=rows.filter(row=>[...url.searchParams].every(([k,v])=>matches(row,k,v)));
  const single=request.headers.get('accept')?.includes('vnd.pgrst.object');
  const response=(data:Row[],status=200)=>Response.json(single?data[0]??null:data,{status});
  if(request.method==='GET'||request.method==='HEAD')return response(selected);
  if(request.method==='PATCH'){const patch=object(await request.json());selected.forEach(row=>Object.assign(row,patch));return response(selected);}
  assert.equal(request.method,'POST');assert.equal(table,'orders');
  const body=await request.json(),items=(Array.isArray(body)?body:[body]).map(value=>({id:rows.length+1,...object(value)}));rows.push(...items);return response(items,201);
 };
 console.log=()=>{};console.warn=()=>{};console.error=()=>{};console.info=()=>{};
 try{
  const {POST}=await import('../src/app/api/admin/amazon-orders/upload-csv/route');
  const form=new FormData();form.set('file',new Blob([csv],{type:'text/csv'}),'print-test.csv');
  for(const[k,v]of Object.entries(fields))form.set(k,String(v));
  const result=await POST(new NextRequest('https://admin.example.test/api/admin/amazon-orders/upload-csv',{method:'POST',headers:{authorization:'Bearer synthetic-print-csv-machine'},body:form}));
  assert.equal(result.status,200,'Actual CSV route must accept the prepared form');
  const body=object(await result.json()),summary=object(body.summary);
  assert.equal(summary.created,1);assert.equal(summary.errors,0);assert.equal(summary.pending,0);
  assert.equal(tables.orders.length,1);assert.equal(zipReads,1);assert.equal(w0.length,1);
  const row=tables.orders[0],specs=object(row.character_specs),product=object(row.product_info),book=object(row.book_specs);
  for(const key of ['childName','age','pronouns','skinTone','hairColor','hairStyle','favoriteColor','animalGuide','hometown','dedication'])assert.equal(specs[key],expected[key],`Customization field mismatch: ${key}`);
  assert.equal(product._overnight_test,true);assert.equal(product.bookId,config.bookId);assert.equal(product.configVersion,config.version);
  assert.equal(book.configVersion,config.version);assert.equal(book.totalPages,32);
  assert.equal(row.customer_email,recipient.email);assert.equal(row.customer_name,recipient.name);
  const shipping=object(row.shipping_address);
  for(const [field,expectedField] of [['name','name'],['address','addressLine1'],['city','city'],['state','state'],['zip','postCode'],['country','country']])
   assert.equal(shipping[field],recipient[expectedField],`Shipping field mismatch: ${field}`);
  assert.equal(w0[0].bookId,config.bookId);assert.equal(object(w0[0].bookSpecs).configVersion,config.version);
  assert.equal(externalAttempts,0);
  const receipt={schema:'lhb.inner-voice-print-csv-offline@v1',csvSha256:hash(csv),zipSha256:hash(zip),configVersion:config.version,
   routeStatus:result.status,created:1,zipReads,w0AdapterCalls:1,customizationFieldsMatched:10,recipientMatches:true,messageSuppressionMarker:true,
   externalRequests:0,hostedImport:false,paidOrder:false};
  writeFileSync(resolve(dir,'csv-offline-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  keep.log('PASS real CSV upload + Amazon ZIP parser: 10 customization fields, recipient, v4 pin and message-suppression marker; one local W0 call; zero external requests');
 }finally{globalThis.fetch=original;Object.assign(console,keep);}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'CSV preparation test failed');process.exitCode=1;});
