/** Real Access-signed CSV route -> ZIP parser -> W0 producer -> canonical upsert -> queue guard. Offline only. */
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { NextRequest } from 'next/server';
import { loadBundledBookConfig } from '../src/lib/books/load-book-config';
import { buildBookConfigPublishPayload } from '../src/lib/books/runtime-book-config';
import { getCronExcludedOrderReason } from '../src/lib/cron-order-guards';
import { adminWorkflowTestAdmission } from '../src/lib/admin-workflow-test';
import { isOvernightTestOrder } from '../src/lib/messaging/test-order-guard';
type Row = Record<string, unknown>;
async function main() {
 const origin = 'https://admin.example.test', issuer = 'https://workflow-csv.cloudflareaccess.com', actor = 'operator@example.test';
 Object.assign(process.env, { SUPABASE_URL:'https://workflow-csv-db.example.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic-only',BACKEND_API_TOKEN:'synthetic-machine-token',N8N_W0_WEBHOOK_URL:'https://workflow-csv-w0.example.test/hook',CF_ACCESS_ISSUER:issuer,CF_ACCESS_AUDIENCE:'a'.repeat(64),ADMIN_ALLOWED_EMAILS:actor,ADMIN_SITE_ORIGIN:origin });
 const pair=await generateKeyPair('RS256',{extractable:true}), jwk={...await exportJWK(pair.publicKey),alg:'RS256',kid:'csv-key'};
 const token=await new SignJWT({email:actor,type:'app'}).setProtectedHeader({alg:'RS256',kid:'csv-key'}).setIssuer(issuer).setSubject('synthetic-operator').setAudience('a'.repeat(64)).setIssuedAt().setExpirationTime('10m').sign(pair.privateKey);
 const human={cookie:`CF_Authorization=${token}`,origin,'sec-fetch-site':'same-origin'};
 const config=loadBundledBookConfig({bookId:'book-finding-our-inner-voice',version:3});
 const rows:Row[]=[], w0:Row[]=[], checks:string[]=[];let writes=0,failW0=false;
 const zip=new AdmZip();zip.addFile('customization.json',Buffer.from(JSON.stringify({orderId:'TEST-CSV-NEW',orderItemId:'line-one','version3.0':{customizationInfo:{surfaces:[{areas:[
  ["Child's First Name",'Alex'],["Child's Age",'5'],['Pronouns','they/them'],['Skin Tone','medium'],['Hair Color','brown'],['Hair Style','short-straight'],['Favorite Color','blue'],['Animal Guide','cat'],['Hometown','Synthetic Town'],['Dedication Message','For Alex & friends']
 ].map(([label,text])=>({label,customizationType:'TextPrinting',text}))}]}}})));
 const csv=(id='TEST-CSV-NEW',quantity='1')=>'amazon-order-id,order-item-id,quantity-purchased,buyer-email,recipient-name,ship-address-1,ship-city,ship-state,ship-postal-code,ship-country,customized-url,sku\n'+[id,'line-one',quantity,'recipient@example.test','Test Adult','1 Test Lane','Test City','CA','00000','US','https://customization.example.test/custom.zip','LHL-INNER-VOICE-PRINT-TEST'].join(',')+'\n';
 const previous=globalThis.fetch, logs={log:console.log,error:console.error,warn:console.warn,info:console.info};
 globalThis.fetch=async(input,init)=>{
  const req=input instanceof Request?input:new Request(input,init),url=new URL(req.url);
  if(url.href===issuer+'/cdn-cgi/access/certs')return Response.json({keys:[jwk]});
  if(url.origin==='https://customization.example.test')return new Response(new Uint8Array(zip.toBuffer()));
  if(url.origin==='https://workflow-csv-w0.example.test'){w0.push(await req.json());if(failW0)throw Error('Synthetic first-trigger timeout');return Response.json({ok:true});}
  assert.equal(url.origin,process.env.SUPABASE_URL,'No external transport permitted');
  if(url.pathname==='/rest/v1/book_configs')return Response.json([buildBookConfigPublishPayload(config,{activate:true})]);
  assert.equal(url.pathname,'/rest/v1/orders');
  const selected=rows.filter(row=>[...url.searchParams].every(([key,v])=>{
    if(['select','limit','order','offset'].includes(key))return true;
    if(v.startsWith('eq.'))return String(row[key])===v.slice(3);
    if(v==='is.null')return row[key]==null;
    if(v.startsWith('in.'))return v.slice(3,-1).split(',').includes(String(row[key]));
    if(v.startsWith('ilike.'))return String(row[key]??'').toLowerCase().startsWith(v.slice(6).replace(/%$/,'').toLowerCase());
    throw Error('Unimplemented local predicate '+key);
  }));
  const answer=(data:Row[],status=200)=>Response.json(req.headers.get('accept')?.includes('vnd.pgrst.object')?data[0]??null:data,{status});
  if(req.method==='GET')return answer(selected);
  writes++;
  if(req.method==='PATCH'){const patch=await req.json();selected.forEach(row=>Object.assign(row,patch));return answer(selected);}
  assert.equal(req.method,'POST');const body=await req.json(),inserted=(Array.isArray(body)?body:[body]).map(row=>({id:rows.length+1,...row}));rows.push(...inserted);return answer(inserted,201);
 };
 Object.assign(console,{log:()=>{},error:()=>{},warn:()=>{},info:()=>{}});
 try {
  const {POST}=await import('../src/app/api/admin/amazon-orders/upload-csv/route');
  async function upload(text=csv(),headers:Record<string,string>=human,test=true,legacy=false){const f=new FormData();f.set('file',new Blob([text]),'test.csv');if(legacy){f.set('bookId','book-mvp-simple-adventure');f.set('formatId','amazon');}if(test)f.set('admin_workflow_test','true');return POST(new NextRequest(origin+'/api/admin/amazon-orders/upload-csv',{method:'POST',headers,body:f}));}
  const unauth=await upload(csv(),{authorization:'Bearer synthetic-machine-token'});assert.equal(unauth.status,403);assert.equal(writes,0);checks.push('machine cannot enroll a workflow test');
  const addColumn=(text:string,name:string,value:string)=>text.trimEnd().split('\n').map((line,index)=>line+','+(index===0?name:value)).join('\n')+'\n';
  for(const text of [
    csv().replace('LHL-INNER-VOICE-PRINT-TEST','UNKNOWN'),
    csv().replace(',sku\n','\n').replace(',LHL-INNER-VOICE-PRINT-TEST\n','\n'),
    addColumn(csv(),'asin','B000WRONG00'),
    addColumn(csv(),'SKU','LHL-INNER-VOICE-PRINT-TEST'),
    addColumn(csv(),'seller_sku','KE-3QPF-VN03'),
    addColumn(addColumn(csv(),'asin','B0G4QPLWKH'),'ASIN','B0G4QPLWKH'),
    csv()+csv('SECOND').split('\n').slice(1).join('\n').replace('LHL-INNER-VOICE-PRINT-TEST','UNKNOWN'),
  ]) {const r=await upload(text,human,false);assert.equal(r.status,400);assert.equal(writes,0);assert.equal(w0.length,0);}
  checks.push('all raw listing rows and duplicate/conflicting identifiers rejected before writes');
  for(const body of [csv('TEST-CSV-NEW','2'),csv()+csv('TEST-CSV-SECOND').split('\n').slice(1).join('\n')]){const r=await upload(body);assert.equal(r.status,400);assert.equal(writes,0);}checks.push('quantity and multi-order tests rejected before writes');
  failW0=true;const response=await upload(), result=await response.json();assert.equal(response.status,200,JSON.stringify(result));assert.equal(result.summary.created,1);assert.equal(rows.length,1);assert.equal(w0.length,1);
  assert.equal((rows[0].character_specs as Row).age,'5'); assert.equal((rows[0].character_specs as Row).dedication,'For Alex & friends'); const row=rows[0],admission=adminWorkflowTestAdmission(row);assert(admission);assert.equal(admission.createdBy,actor);assert.equal(admission.configVersion,3);assert(isOvernightTestOrder(row));assert.equal(row.execution_status,'pending_w0');assert.equal(getCronExcludedOrderReason(row),null);checks.push('real first CSV/ZIP admission remains recoverable after W0 timeout');
  const snapshot=JSON.stringify(row),before=writes;await upload();assert.equal(writes,before);assert.equal(JSON.stringify(row),snapshot);assert.equal(w0.length,1);checks.push('existing order retry preserves row and never replays W0');
  const {buildOrderIntakeManifestFromOrderRuntime,buildW0OrderUpsertPayload}=await import('../src/lib/w0-manifest-builder');
  const built=await buildOrderIntakeManifestFromOrderRuntime(row,String(row.orderId),{schemaVersion:'v3',configSource:'published',configVersion:3,bookId:config.bookId,formatId:'amazon'});
  const payload=buildW0OrderUpsertPayload({normalizedInput:{...w0[0],_raw:w0[0]},manifest:built.manifest,manifestKey:built.manifestKey});
  const {upsertOrderByPerBookId}=await import('../src/lib/supabase-client');
  const updated=await upsertOrderByPerBookId(payload);assert.equal(updated.error,null);assert.deepEqual(adminWorkflowTestAdmission(row),admission);assert(isOvernightTestOrder(row));assert.equal(getCronExcludedOrderReason(row),null);assert.equal(row.next_workflow,'2A');checks.push('W0 producer and actual upsert preserve admission, suppression and canonical queue routing');
  for(const next of ['1','2A','2B','3'])assert.equal(getCronExcludedOrderReason({...row,next_workflow:next,current_workflow:null}),null);
  for(const next of ['4','4-aggregate','unknown'])assert.equal(getCronExcludedOrderReason({...row,next_workflow:next,current_workflow:null}),'admin_workflow_test_hold');
  assert(getCronExcludedOrderReason({orderId:'TEST-PRINT-20261115-A'}));checks.push('generation stages allowed; print and legacy test remain held');
  for(const malformed of [[],null,'{bad json',42]){const saved=JSON.stringify(row),count: number=writes;await assert.rejects(()=>upsertOrderByPerBookId({orderId:row.orderId,product_info:malformed}));assert.equal(JSON.stringify(row),saved);assert.equal(writes,count);}checks.push('malformed machine replacements cannot erase server markers');
  const incoming={_admin_workflow_test:{...admission,createdBy:'attacker@example.test'}};
  const attempt=await upsertOrderByPerBookId({orderId:'NEW-MACHINE-ROW',product_info:incoming});assert.equal(attempt.error,null);assert.equal(adminWorkflowTestAdmission(rows[1]),null);assert.equal((rows[1].product_info as Row)._admin_workflow_test,undefined);checks.push('machine cannot mint admission on a new row');
  failW0=false;
  for(const [index,source] of [
    csv('AUTO-REAL').replace('LHL-INNER-VOICE-PRINT-TEST','KE-3QPF-VN03'),
    addColumn(csv('AUTO-MATCH'),'asin','B0G4QPLWKH'),
    csv('AUTO-ASIN').replace(',sku\n',',asin\n').replace('LHL-INNER-VOICE-PRINT-TEST','B0G4QPLWKH'),
    csv('AUTO-ALIAS').replace(',sku\n',',SellerSKU\n').replace('LHL-INNER-VOICE-PRINT-TEST','KE-3QPF-VN03'),
  ].entries()) {
    const r=await upload(source,human,false),body=await r.json();assert.equal(r.status,200,JSON.stringify(body));assert.equal(body.summary.created,1);assert.equal(body.summary.errors,0);
    assert.equal(body.selection.bookId,config.bookId);assert.equal(body.selection.configVersion,3);
    const created=rows[2+index];assert.equal(adminWorkflowTestAdmission(created),null);assert.equal(isOvernightTestOrder(created),false);assert.equal(w0.at(-1)?.bookId,config.bookId);
  }
  checks.push('file-only actual route identifies both SKUs, ASIN-only and alias; filename/SKU do not grant test admission');
  const frozen=rows[2];Object.assign(frozen,{print_provider:'lulu',print_book_id:'book-mvp-simple-adventure',print_format_id:'amazon',print_config_version:1});
  const savedFrozen=JSON.stringify(rows),savedWrites=writes,savedW0=w0.length;
  const retry=await upload(csv('AUTO-REAL').replace('LHL-INNER-VOICE-PRINT-TEST','KE-3QPF-VN03'),human,false);
  assert.equal((await retry.json()).summary.errors,1);assert.equal(JSON.stringify(rows),savedFrozen);assert.equal(writes,savedWrites);assert.equal(w0.length,savedW0);
  checks.push('automatic current listing cannot rewrite a frozen older edition or replay W0');
  const multiple=await upload(csv('AUTO-QUANTITY','2'),human,false),multiBody=await multiple.json();assert.equal(multiple.status,200,JSON.stringify(multiBody));assert.equal(multiBody.summary.created,2);assert.equal(multiBody.summary.errors,0);
  const legacy=await upload(csv('EXPLICIT-LEGACY').replace('LHL-INNER-VOICE-PRINT-TEST','HISTORICAL-SKU'),human,false,true),legacyBody=await legacy.json();assert.equal(legacy.status,200);assert.equal(legacyBody.summary.created,1);assert.equal(legacyBody.summary.errors,0);assert.equal(w0.at(-1)?.bookId,'book-mvp-simple-adventure');
  checks.push('ordinary automatic quantities and explicit historical API compatibility preserved');
  logs.log(JSON.stringify({passed:true,checks,hostedCalls:0,providerCreates:0,messagesSent:0}));
 } finally {globalThis.fetch=previous;Object.assign(console,logs);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
