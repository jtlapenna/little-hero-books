import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

async function main() {
 const argv=process.argv.slice(2);assert(argv.length===0||argv.length===6||argv.length===8);
 const options=new Map<string,string>();
 for(let i=0;i<argv.length;i+=2){assert(['--source-row','--source-row-sha','--expected-w0','--mixed-source-kind'].includes(argv[i]));assert(!options.has(argv[i]));options.set(argv[i],argv[i+1]);}
 const mixedKind=options.get('--mixed-source-kind');if(mixedKind)assert(['partial','complete','progressed'].includes(mixedKind));
 const sourceOption=options.get('--source-row'), sourceRow=sourceOption?path.resolve(sourceOption):undefined, sourceSha=options.get('--source-row-sha'), expectedW0=options.get('--expected-w0');
 if(sourceRow){assert(path.isAbsolute(sourceRow)&&realpathSync(sourceRow)===sourceRow);assert(sourceRow.startsWith('/Volumes/WD_BLACK/AgentArtifacts/little-hero-books/')||sourceRow===path.resolve('scripts/fixtures/amazon-native-mixed-csv.json'));assert.match(sourceSha??'',/^[a-f0-9]{64}$/);assert(expectedW0==='0'||expectedW0==='1');}
 else assert.equal(options.size,0);

 Object.assign(process.env,{SUPABASE_URL:'https://local-router.example.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic-router-only',CRON_SECRET:'synthetic-router-cron',N8N_ROUTER_WEBHOOK_URL:'https://router.example.test/webhook/w1-1-router',N8N_W0_WEBHOOK_URL:'https://pending-w0.example.test/intake',GELATO_DRAFT_SUBMISSION_ENABLED:'false',GELATO_STATUS_POLLING_ENABLED:'false',GELATO_NOTIFICATIONS_ENABLED:'false'});
 type Row=Record<string,unknown>;
 let candidates:Row[]=[], siblings:Row[]=[], slots=5, groupFailure=false, patchMarkedInFlight=false, routed:Row[]=[], queued:number[]=[], forbidden:string[]=[];
 const original=globalThis.fetch, originalDate=globalThis.Date, log=console.log, warn=console.warn, error=console.error;
 const now='2026-01-02T05:04:05.000Z', cutoff='2026-01-01T05:04:05.000Z';
 const fixture=JSON.parse(readFileSync('scripts/fixtures/inner-voice-w0-recovery.json','utf8'));
 globalThis.Date=new Proxy(originalDate,{construct(target,args){return Reflect.construct(target,args.length?args:[now]);},get(target,key){return key==='now'?()=>originalDate.parse(now):Reflect.get(target,key,target);}});
 const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
 let pending:Row[]=[], w0:Row[]=[], pendingReads:Row[]=[], w0Failure=false, pendingChecks=0;
 const pendingObservations:Row[]=[];
 const rootReads:Row[]=[]; let rootFailure=false, refreshShipping=false, refreshProgress=false; let refreshedName='';
 let nativeDiscovery=false,nativeDiscoveryRoot='',nativeProbeCalls=0;

 let recoveryErrors:string[]=[],transportViolations:string[]=[];let mutationAttempts:Row[]=[];
 console.log=console.warn=()=>undefined;console.error=(...args:unknown[])=>{recoveryErrors.push(args.map(String).join(' '));};
 const ready=(id:number,extra:Row={})=>({id,orderId:'LOCAL-ORDINARY-'+id,root_order_id:'LOCAL-ORDINARY-'+id,print_provider:'gelato',next_workflow:'4',execution_status:'ready_for_processing',customer_approval_required:true,customer_approval_status:'approved',current_workflow:null,started_at:null,...extra});
 const request=()=>new NextRequest('https://admin.example.test/api/cron/router',{headers:{authorization:'Bearer synthetic-router-cron'}});
 globalThis.fetch=async(input,init)=>{
  try {
  const r=new Request(input,init),u=new URL(r.url);
  if(u.origin==='https://local-router.example.test'&&!['GET','HEAD'].includes(r.method))mutationAttempts.push({method:r.method,url:r.url});
  if(nativeDiscovery&&u.origin==='https://api.amazon.com') {
   assert.equal(r.method,'POST');assert.equal(u.pathname,'/auth/o2/token');nativeProbeCalls++;
   return Response.json({access_token:'synthetic-native-router-token'});
  }
  if(nativeDiscovery&&u.origin==='https://sellingpartnerapi-na.amazon.com') {
   assert.equal(r.method,'GET');assert.equal(u.pathname,'/orders/v0/orders');nativeProbeCalls++;
   return Response.json({payload:{Orders:[{AmazonOrderId:nativeDiscoveryRoot,PurchaseDate:now,MarketplaceId:'ATVPDKIKX0DER'}]}});
  }
  if(u.origin==='https://pending-w0.example.test') {
   assert.equal(r.method,'POST');assert.equal(u.pathname,'/intake');assert.equal(u.search,'');assert.equal(r.headers.get('content-type'),'application/json');
   const body=await r.text();w0.push(JSON.parse(body));pendingObservations.push({kind:'w0-wire',url:r.url,method:r.method,body,status:w0Failure?503:200});
   return Response.json(w0Failure?{error:'Synthetic W0 unavailable'}:{accepted:true},{status:w0Failure?503:200});
  }
  if(u.origin==='https://router.example.test') { assert.equal(r.method,'POST');routed=(await r.json()).orders;return Response.json({success:true}); }
  if(u.origin!=='https://local-router.example.test') {forbidden.push(u.origin);throw Error('No external transport');}
  const table=u.pathname.split('/').pop();
  if(table==='queue_status') return Response.json({processing_count:5-slots,queued_count:0});
  if(table!=='orders'){forbidden.push(String(table));throw Error('Unexpected database operation');}
  let rows:Row[]=[];
  if(u.searchParams.get('execution_status')==='eq.pending_w0'&&u.searchParams.get('one_manifest_url')==='is.null') {
   assert.equal(r.method,'GET');assert.equal(u.searchParams.get('next_workflow'),'is.null');assert.equal(u.searchParams.get('created_at'),'gte.'+cutoff);assert.equal(u.searchParams.get('limit'),'5');
   const fields=u.searchParams.get('select')!.split(',').map(key=>key.replaceAll('"',''));
   assert.deepEqual(fields,['id','orderId','amazon_order_id','platform','marketplace_id','book_specs','character_specs','shipping_address','customer_email','customer_name','purchase_date','dedication_text','product_info','character_hash','root_order_id','created_at']);
   rows=pending.filter(row=>row.execution_status==='pending_w0'&&row.next_workflow==null&&row.one_manifest_url==null&&typeof row.created_at==='string'&&originalDate.parse(row.created_at)>=originalDate.parse(cutoff)).slice(0,5);
   rows=rows.map(row=>Object.fromEntries(fields.map(key=>[key,clone(row[key]??null)])));
   pendingReads.push({url:r.url,method:r.method,rows:clone(rows)});
   if(refreshShipping){pending[0].shipping_address={...(pending[0].shipping_address as Row),name:'Fresh validated shipping'};refreshedName='Fresh validated shipping';}
   if(refreshProgress)pending[0].manifest_2a_url='synthetic-progress/2a.json';
  } else if(u.searchParams.get('execution_status')==='eq.ready_for_processing'&&u.searchParams.has('next_workflow')) {
   const selected=u.searchParams.get('select')!; for(const key of ['print_provider','print_submission_id','print_claim_token','gelato_status','started_at']) assert(selected.includes(key),'Actual router must select '+key);
   rows=candidates;
  } else if(r.method==='GET'&&['201','2'].includes(u.searchParams.get('limit')??'')&&['root_order_id','amazon_order_id','orderId','order_id'].some(key=>u.searchParams.get(key)?.startsWith('eq.'))) {
   assert.equal(u.searchParams.get('select'),'*');
   const exact=['root_order_id','amazon_order_id','orderId','order_id'].filter(key=>u.searchParams.get(key)?.startsWith('eq.'));
   rows=pending.filter(row=>exact.every(key=>String(row[key])===u.searchParams.get(key)!.slice(3))).slice(0,Number(u.searchParams.get('limit')));
   if(rootFailure)return Response.json({message:'Synthetic complete membership unavailable'},{status:503});
   rootReads.push({url:r.url,method:r.method,rows:clone(rows)});pendingObservations.push({kind:'complete-root-read',url:r.url,rows:clone(rows)});
  } else if(['root_order_id','amazon_order_id','orderId'].some(key=>u.searchParams.get(key)?.startsWith('in.'))) {
   if(groupFailure) return Response.json({message:'Synthetic group lookup unavailable'},{status:503});
   const key=['root_order_id','amazon_order_id','orderId'].find(key=>u.searchParams.get(key)?.startsWith('in.'))!;
   const roots=u.searchParams.get(key)!.slice(4,-1).split(',');
   rows=siblings.filter(row=>roots.includes(String(row[key]))&&(!u.searchParams.get('root_order_id')?.includes('is.null')||row.root_order_id==null)&&(!u.searchParams.get('amazon_order_id')?.includes('is.null')||row.amazon_order_id==null));
  }
  if(r.method==='PATCH') {
   const change=await r.json();assert.deepEqual(Object.keys(change).sort(),['queued_at','status']);
   assert.equal(u.searchParams.get('execution_status'),'eq.ready_for_processing');
   assert.equal(u.searchParams.get('started_at'),'is.null');
   assert.equal(u.searchParams.get('current_workflow'),'is.null');
   const ids=u.searchParams.get('id')?.slice(4,-1).split(',').map(Number)??[];queued.push(...ids);
   if(patchMarkedInFlight) return Response.json([]);
   const updated=ids.map(id=>[...candidates,...siblings].find(row=>row.id===id)).filter((row):row is Row=>Boolean(row)).map(row=>({...row,updated_at:new Date().toISOString()}));
   return Response.json(updated);
  }
  assert(['GET','HEAD'].includes(r.method),'Only queue writes allowed');
  return new Response(r.method==='HEAD'?null:JSON.stringify(r.headers.get('accept')?.includes('object')?rows[0]??null:rows),{headers:{'content-type':'application/json','content-range':'0-0/0'}});
  } catch(failure){transportViolations.push(String(failure));throw failure;}
 };
 try {
  const {GET}=await import('../src/app/api/cron/router/route');
  let checks=0;
  const run=async(expected:number[])=>{transportViolations=[];mutationAttempts=[];routed=[];queued=[];const response=await GET(request());assert.equal(response.status,200,await response.clone().text());assert.deepEqual(routed.map(x=>x.id),expected);assert(routed.every(x=>typeof x.updated_at==='string'));assert.deepEqual(queued,expected);assert.deepEqual(forbidden,[]);assert.deepEqual(transportViolations,[]);checks++};
  if(!sourceRow){
  candidates=[ready(1),ready(2,{print_provider:'lulu'})];await run([2]);
  transportViolations=[];mutationAttempts=[];routed=[];queued=[];patchMarkedInFlight=true;const raced=await GET(request());assert.equal(raced.status,503);assert.deepEqual(routed,[]);assert.deepEqual(transportViolations,[]);assert.equal(mutationAttempts.length,1);patchMarkedInFlight=false;checks++;
  candidates=[ready(1,{next_workflow:'4-aggregate'})];await run([]);
  candidates=[ready(1,{print_provider:null})];await run([]);
  process.env.GELATO_DRAFT_SUBMISSION_ENABLED='true';
  for(const override of [{print_submission_id:'11111111-1111-4111-8111-111111111111'},{print_claim_token:'22222222-2222-4222-8222-222222222222'},{gelato_status:'draft'},{customer_approval_status:'pending'},{customer_approval_status:'revision_requested'},{customer_approval_required:'true'}]){candidates=[ready(1,override)];await run([]);}
  candidates=[ready(1)];await run([1]);
  const pair=[ready(1,{orderId:'LOCAL-GROUP-item-1',root_order_id:'LOCAL-GROUP'}),ready(2,{orderId:'LOCAL-GROUP-item-2',root_order_id:'LOCAL-GROUP'})];
  candidates=pair;siblings=pair;slots=2;await run([1,2]);
  candidates=[pair[0]];slots=1;await run([]);
  candidates=pair;await run([]);
  slots=2;siblings=[pair[0],{...pair[1],customer_approval_status:'pending'}];await run([]);
  siblings=pair;groupFailure=true;await run([]);groupFailure=false;
  const legacy=pair.map(row=>({...row,root_order_id:null,amazon_order_id:'LOCAL-GROUP'}));
  siblings=legacy;candidates=[legacy[0]];slots=1;await run([]);
  candidates=legacy;await run([]);slots=2;await run([1,2]);
  const root=ready(3,{orderId:'LOCAL-GROUP',root_order_id:null,amazon_order_id:null});
  siblings=[root,...pair];candidates=[root,...pair];slots=2;await run([]);slots=3;await run([3,1,2]);
  candidates=[root,...pair.slice(0,1)];await run([]);
  candidates=[root];slots=1;await run([]);
  process.env.GELATO_DRAFT_SUBMISSION_ENABLED='false';candidates=pair;await run([]);
  }
  const invokePending=async(label:string,input:Row[],expected:Row[],available=5,authorized=true)=>{
   recoveryErrors=[];transportViolations=[];mutationAttempts=[];candidates=[];siblings=[];pending=clone(input);slots=available;w0=[];pendingReads=[];routed=[];queued=[];
   const before=clone(pending);
   const req=authorized?request():new NextRequest('https://admin.example.test/api/cron/router');
   const response=await GET(req),body=await response.json();
   pendingObservations.push({kind:'pending-case',label,input:before,reads:clone(pendingReads),w0:clone(w0),responseStatus:response.status,responseBody:body,errors:clone(recoveryErrors),mutationAttempts:clone(mutationAttempts),transportViolations:clone(transportViolations)});
   assert.equal(response.status,authorized?200:401,label);assert.deepEqual(pending,before.map((row,index)=>index?row:{...row,...(refreshShipping?{shipping_address:{...(row.shipping_address as Row),name:'Fresh validated shipping'}}:{}),...(refreshProgress?{manifest_2a_url:'synthetic-progress/2a.json'}:{})}),label+' persisted rows unchanged except named source interleaving');assert.deepEqual(routed,[]);assert.deepEqual(queued,[]);assert.deepEqual(forbidden,[]);assert.deepEqual(mutationAttempts,[],label+' no attempted database mutations');assert.deepEqual(transportViolations,[],label+' no swallowed transport assertion');
   assert.deepEqual(w0.map(row=>row.orderId),expected.map(row=>row.orderId),label);
   assert.equal(pendingReads.length,authorized&&available>0?1:0,label+' query eligibility');
   for(let index=0;index<expected.length;index++){
    const row=expected[index] as any,payload=w0[index] as any;
    if(mixedKind){
     const info=row.product_info,tuple=Array.isArray(info)?row.book_specs:(info.line_item.bookSelection??row.book_specs);
     assert.equal(payload.orderId,row.orderId);assert.equal(payload.id,row.orderId);assert.equal(payload.rootOrderId,row.root_order_id);assert.equal(payload.amazonOrderId,row.amazon_order_id);
     assert.equal(payload.bookId,tuple.bookId);assert.equal(payload.book_id,tuple.bookId);assert.equal(payload.configVersion,tuple.configVersion);assert.equal(payload.formatId,'amazon');assert.equal(payload.format_id,'amazon');
     assert.deepEqual(payload.bookSpecs,row.book_specs);assert.deepEqual(payload.book_specs,row.book_specs);
     assert.deepEqual(payload.characterSpecs,row.character_specs);assert.deepEqual(payload.character_specs,row.character_specs);assert.equal(payload.characterHash,row.character_hash);assert.equal(payload.character_hash,row.character_hash);
     assert.equal(payload.dedication,row.dedication_text);
     if(Array.isArray(info)){assert.equal(payload.items,undefined);assert.equal(payload.lineItem,undefined);assert.deepEqual(payload.shippingAddress,row.shipping_address);continue;}
     assert.deepEqual(payload.lineItem,info.line_item);assert.deepEqual(payload.line_item,info.line_item);assert.deepEqual(payload.items,info.line_items);
     assert.equal(payload.unitIndex,info._quantity_unit_index);assert.equal(payload.unitCount,info._quantity_unit_count);assert.equal(payload.orderDetails.quantity,1);
     const shipping=refreshShipping&&row.id===before[0].id?{...row.shipping_address,name:refreshedName}:row.shipping_address;
     assert.deepEqual(payload.shippingAddress,shipping);continue;
    }
    assert.equal(payload.id,row.orderId);assert.equal(payload.rootOrderId,row.root_order_id);assert.equal(payload.root_order_id,row.root_order_id);assert.equal(payload.amazonOrderId,row.amazon_order_id);assert.equal(payload.marketplaceId,row.marketplace_id);
    if(Array.isArray(row.product_info)){
     assert.equal(payload.bookId,undefined);assert.equal(payload.bookSpecs.totalPages,16);
     assert.equal(payload.bookSpecs.title,'A<&lex and the Adventure Compass');assert.equal(payload.bookSpecs.format,'8.5x8.5_softcover');
     assert.equal(payload.characterHash,row.character_hash);assert.deepEqual(payload.characterSpecs,row.character_specs);
     assert.deepEqual(payload.shippingAddress,row.shipping_address);assert.equal(payload.items,undefined);continue;
    }
    if(row.product_info.bookId==='book-mvp-simple-adventure'){
     assert.equal(payload.bookId,'book-mvp-simple-adventure');assert.equal(payload.characterHash,row.character_hash);assert.deepEqual(payload.characterSpecs,row.character_specs);
     assert.deepEqual(payload.items,row.product_info.line_items);assert.deepEqual(payload.lineItem,row.product_info.line_item);continue;
    }
    assert.equal(payload.bookId,'book-finding-our-inner-voice');assert.equal(payload.book_id,row.book_specs.bookId);assert.equal(payload.configVersion,row.book_specs.configVersion);assert.equal(payload.formatId,row.book_specs.formatId);assert.equal(payload.format_id,row.book_specs.formatId);
    assert.deepEqual(payload.bookSpecs,row.book_specs);assert.deepEqual(payload.book_specs,row.book_specs);assert.equal(payload.bookSpecs.channel,'amazon');assert.deepEqual(payload.characterSpecs,row.character_specs);assert.deepEqual(payload.character_specs,row.character_specs);
    assert.equal(payload.characterHash,row.character_hash);assert.equal(payload.character_hash,row.character_hash);assert.equal(payload.dedication,row.dedication_text);assert.deepEqual(payload.items,row.product_info.line_items);assert.deepEqual(payload.lineItem,row.product_info.line_item);assert.equal(payload.unitIndex,row.product_info._quantity_unit_index);assert.equal(payload.unitCount,row.product_info._quantity_unit_count);
   }
   pendingChecks++;
  };
  if(sourceRow&&mixedKind){
   assert.equal(expectedW0,'0');const raw=readFileSync(sourceRow);assert.equal(createHash('sha256').update(raw).digest('hex'),sourceSha);
   const source=JSON.parse(raw.toString('utf8')) as any[];assert(Array.isArray(source));assert.equal(new Set(source.map(row=>row.id)).size,source.length);assert.equal(new Set(source.map(row=>row.orderId)).size,source.length);
   const MVP='book-mvp-simple-adventure',IV='book-finding-our-inner-voice',ROOT='111-2222222-3333333',A='222-3333333-4444444',B='333-4444444-5555555';
   for(const row of source){assert.equal(row.platform,'amazon');assert.equal(row.customer_email,'reader@invalid.invalid');assert.equal(row.product_info.line_items.length,2);
    assert.deepEqual(row.product_info.line_items.map((item:any)=>[item.order_item_id,item.bookSelection.bookId,item.bookSelection.configVersion]).sort(),[['line-a',MVP,1],['line-b',IV,2]].sort());
    assert.equal(row.product_info.line_item.quantity,1);assert.equal(row.product_info._quantity_unit_index,1);assert.equal(row.product_info._quantity_unit_count,1);
   }
   if(mixedKind==='partial'){
    assert.equal(source.length,1);assert.equal(source[0].orderId,ROOT+'-item-line-a');assert.equal(source[0].product_info.bookId,MVP);
    await invokePending('mixed-actual-legacy-first-missing-IV',source,[]);assert.equal(pendingChecks,1);
   }else if(mixedKind==='complete'){
    assert.equal(source.length,2);assert.deepEqual(source.map(row=>row.orderId).sort(),[ROOT+'-item-line-a',ROOT+'-item-line-b'].sort());
    const legacy=source.find(row=>row.product_info.bookId===MVP),iv=source.find(row=>row.product_info.bookId===IV);assert(legacy&&iv);
    await invokePending('mixed-actual-complete',source,source);
    await invokePending('mixed-actual-complete-reversed',[...source].reverse(),[...source].reverse());
    await invokePending('mixed-legacy-first-missing-IV',[legacy],[]);
    await invokePending('mixed-IV-missing-legacy',[iv],[]);
    const ivProgressed=clone(source);ivProgressed.find(row=>row.product_info.bookId===IV)!.execution_status='ready_for_processing';ivProgressed.find(row=>row.product_info.bookId===IV)!.next_workflow='2A';
    await invokePending('mixed-named-IV-progress-interleaving',ivProgressed,[legacy]);
    const legacyProgressed=clone(source);legacyProgressed.find(row=>row.product_info.bookId===MVP)!.execution_status='ready_for_processing';legacyProgressed.find(row=>row.product_info.bookId===MVP)!.next_workflow='2A';
    await invokePending('mixed-named-legacy-progress-interleaving',legacyProgressed,[iv]);
    rootFailure=true;await invokePending('mixed-membership-query-failure',source,[]);rootFailure=false;
    const conflict=clone(source);conflict[0].product_info.line_items[1].bookSelection.configVersion=3;await invokePending('mixed-conflicting-frozen-aggregate',conflict,[]);
    refreshShipping=true;await invokePending('mixed-fresh-legacy-shipping',source,source);refreshShipping=false;assert.equal((w0.find(row=>row.bookId===MVP)!.shippingAddress as Row).name,refreshedName);
    const filling=Array.from({length:4},(_,index)=>({...clone(legacy),id:100+index,orderId:'EXCLUDED-'+index,root_order_id:'EXCLUDED-'+index,amazon_order_id:'EXCLUDED-'+index,customer_email:'reader@example.com'}));
    await invokePending('mixed-IV-outside-five-candidates',[legacy,...filling,iv],[legacy]);
    const outside=clone(source);outside.find(row=>row.product_info.bookId===IV)!.created_at='2026-01-01T00:00:00.000Z';await invokePending('mixed-IV-outside-time-window',outside,[legacy]);
    const badIVProgress=clone(source);const badIV=badIVProgress.find(row=>row.product_info.bookId===IV)!;
    badIV.execution_status='ready_for_processing';badIV.next_workflow='2A';badIV.character_hash='corrupt-progressed-IV';
    await invokePending('mixed-corrupt-progressed-IV-holds-legacy',badIVProgress,[]);
    assert(recoveryErrors.some(message=>message.includes('Invalid pending W0 original order-scoped character hash')));
    const badLegacyProgress=clone(source);const badLegacy=badLegacyProgress.find(row=>row.product_info.bookId===MVP)!;
    badLegacy.execution_status='ready_for_processing';badLegacy.next_workflow='2A';badLegacy.character_hash='corrupt-progressed-legacy';
    await invokePending('mixed-corrupt-progressed-legacy-holds-IV',badLegacyProgress,[]);
    assert(recoveryErrors.some(message=>message.includes('Invalid mixed pending W0 original hash')));
    const keys=['N8N_W0_WEBHOOK_URL','AMZ_LWA_CLIENT_ID_PROD','AMZ_LWA_CLIENT_SECRET_PROD','AMZ_APP_PROD_REFRESH_TOKEN'];
    const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
    nativeDiscovery=true;nativeDiscoveryRoot=String(source[0].root_order_id);nativeProbeCalls=0;
    try {
     delete process.env.N8N_W0_WEBHOOK_URL;process.env.AMZ_LWA_CLIENT_ID_PROD='synthetic-native-client';
     process.env.AMZ_LWA_CLIENT_SECRET_PROD='synthetic-native-secret';process.env.AMZ_APP_PROD_REFRESH_TOKEN='synthetic-native-refresh';
     await invokePending('mixed-missing-W0-native-and-generic-continue',source,[]);assert.equal(nativeProbeCalls,2);
     assert(recoveryErrors.some(message=>message.includes('W0 webhook is not configured')));
    } finally {
     nativeDiscovery=false;for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}
    }
    for(const shape of ['array','object'] as const){
     const unclassified=clone(source);
     for(const row of unclassified){
      const rawItems=clone(row.product_info.line_items).map((item:Record<string,unknown>)=>{delete item.bookSelection;return item;});
      for(const key of ['book_specs','bookSpecs','bookId','book_id','project','formatId','format_id','configVersion','config_version','version',
       'print_book_id','printBookId','print_format_id','printFormatId','print_config_version','printConfigVersion','productInfo'])delete row[key];
      row.product_info=shape==='array'?rawItems:{line_items:rawItems};
     }
     await invokePending('mixed-unclassified-'+shape+'-requires-assignment',unclassified,[]);
     assert.equal(recoveryErrors.filter(message=>message.endsWith('Unclassified Amazon intake requires authenticated operator assignment')).length,2);
    }
    for(const [alias,value,label] of [['book_id','book-2-example','unsupported-book'],['format_id','standard','wrong-format']] as const){
     const plainLegacy=clone([legacy]) as any[];
     delete plainLegacy[0].product_info.line_item.bookSelection;
     for(const item of plainLegacy[0].product_info.line_items)delete item.bookSelection;
     plainLegacy[0][alias]=value;
     await invokePending('plain-legacy-root-alias-'+label+'-held',plainLegacy,[]);
     assert.equal(recoveryErrors.filter(message=>message.endsWith('Conflicting stored Amazon book assignment')).length,1);
    }
    for(const variant of ['info-print','spec-print','product-alias'] as const){
     const plainLegacy=clone([legacy]) as any[];const row=plainLegacy[0],info=row.product_info;
     delete info.line_item.bookSelection;for(const item of info.line_items)delete item.bookSelection;
     if(variant==='info-print') {
      info.print_book_id='book-2-example';
     } else if(variant==='spec-print') {
      for(const specs of [row.book_specs,row.bookSpecs,info.book_specs,info.bookSpecs]) {
       if(specs&&typeof specs==='object')specs.print_book_id='book-2-example';
      }
     } else {
      row.productInfo={...clone(info),print_book_id:'book-2-example'};
      assert.equal(row.productInfo.print_book_id,'book-2-example','Product alias conflict fixture must exist before recovery');
     }
     await invokePending('plain-legacy-'+variant+'-authority-held',plainLegacy,[]);
     assert.equal(recoveryErrors.filter(message=>message.endsWith('Conflicting stored Amazon book assignment')).length,1);
    }
    const assertOnlyDisabledDiscoveryErrors=()=>{
     assert.equal(recoveryErrors.length,2,'Only expected disabled native discovery diagnostics are allowed');
     const native=recoveryErrors[0].match(/^\[Cron Amazon Orders\] \[([^\]]+)-amazon\] Unexpected error: \[object Object\]$/);
     const router=recoveryErrors[1].match(/^\[Cron Router\] \[([^\]]+)\] Amazon orders check failed \(\d+ms\): Amazon SP-API credentials not configured$/);
     assert(native&&router,'Pending W0 cases must preserve the exact disabled-discovery diagnostic pair');
     assert.equal(native[1],router[1],'Disabled-discovery diagnostics must share one router execution');
     const observation=pendingObservations.at(-1);assert.equal(observation?.kind,'pending-case');
     const body=observation?.responseBody as Row;assert.equal(native[1],body.executionId,'Diagnostics must belong to the actual pending-case response');
    };
    const unmarkedLegacy=(shape:'object'|'array')=>{
     const value=clone([legacy]) as any[],row=value[0],info=row.product_info;
     delete info.line_item.bookSelection;for(const item of info.line_items)delete item.bookSelection;
     if(shape==='array')row.product_info=clone(info.line_items);
     return value;
    };
    for(const shape of ['object','array'] as const){
     const clean=unmarkedLegacy(shape);await invokePending('plain-legacy-'+shape+'-clean-pending',clean,clean);assertOnlyDisabledDiscoveryErrors();
     for(const field of (shape==='object'?['workflow_step','manifest_2a_url']:['manifest_2a_url'])){
      const progressed=unmarkedLegacy(shape);progressed[0][field]=field==='workflow_step'?'2a-complete':'synthetic-progress/2a.json';
      await invokePending('plain-legacy-'+shape+'-'+field+'-preserved',progressed,[]);assertOnlyDisabledDiscoveryErrors();
     }
    }
    refreshProgress=true;
    await invokePending('plain-legacy-progress-introduced-on-refresh',unmarkedLegacy('object'),[]);assertOnlyDisabledDiscoveryErrors();
    refreshProgress=false;
    assert.equal(pendingChecks,27);
   }else{
    assert.equal(source.length,4);assert.deepEqual(source.map(row=>row.orderId).sort(),[A+'-item-line-a',A+'-item-line-b',B+'-item-line-a',B+'-item-line-b'].sort());
    const progressed=source.filter(row=>row.root_order_id===A),recovering=source.filter(row=>row.root_order_id===B);assert.equal(progressed.length,2);assert.equal(recovering.length,2);
    assert(progressed.every(row=>row.execution_status!=='pending_w0'&&typeof row.one_manifest_url==='string'));
    assert(recovering.every(row=>row.execution_status==='pending_w0'&&row.next_workflow==null&&row.one_manifest_url==null));
    await invokePending('mixed-actual-W0-upsert-A-pending-B',source,recovering);assert.equal(pendingChecks,1);
   }
   assert(rootReads.some(read=>new URL(String(read.url)).searchParams.get('limit')==='201'));
   console.log=log;log(JSON.stringify({passed:true,checks:pendingChecks,pendingChecks,pendingObservations,rootReads,sourceRow,sourceSha,expectedW0,mixedSourceKind:mixedKind,
    liveRequests:0,customerMessages:0,scope:'Existing actual generic GET pending-recovery controls over exact actual mixed CSV/W0 source bytes, named status/metadata/query interleavings. Ready queue withheld for this pending-only slice; no W1/hosted/nativeDB/provider/print acceptance.'}));return;
  }
  if(sourceRow){
   const raw=readFileSync(sourceRow);assert.equal(createHash('sha256').update(raw).digest('hex'),sourceSha);
   const input=JSON.parse(raw.toString('utf8')) as any;
   const source=Array.isArray(input)?input:[input];assert(source.length===1||source.length===2||source.length===3);
   const row=source.find((entry:any)=>entry.product_info?.bookId==='book-finding-our-inner-voice')??source[0];assert.equal(row.platform,'amazon');assert.equal(row.customer_email,'reader@invalid.invalid');
   const legacyArray=Array.isArray(row.product_info);
   if(!legacyArray){assert.equal(row.product_info.bookId,'book-finding-our-inner-voice');
   assert.equal(row.product_info.line_items[0].quantity,2);assert.equal(row.product_info._quantity_unit_index,1);
   assert.equal(row.product_info._quantity_unit_count,2);}
   if(legacyArray){
    assert.equal(row.book_specs??null,null,'This optional fixture represents an unclassified legacy array');
    await invokePending('legacy-array-requires-assignment',source,[]);
    assert(recoveryErrors.some(message=>message.endsWith('Unclassified Amazon intake requires authenticated operator assignment')));
   }
   else if(source.length===3){
    const legacy=source.find((entry:any)=>entry.product_info.bookId==='book-mvp-simple-adventure');assert(legacy);
    const iv=source.filter((entry:any)=>entry!==legacy);assert.equal(iv.length,2);
    const filling=Array.from({length:4},(_,index)=>({...clone(legacy),id:100+index,orderId:'EXCLUDED-'+index,root_order_id:'EXCLUDED-'+index,amazon_order_id:'EXCLUDED-'+index,customer_email:'reader@example.com'}));
    await invokePending('legacy-candidate-IV-outside-five',[legacy,...filling,...iv],[legacy]);
    await invokePending('legacy-candidate-incomplete-IV-outside-five',[legacy,...filling,iv[0]],[]);
   }
   else if(source.length===1){await invokePending('actual-csv-incomplete-quantity',source,expectedW0==='1'?source:[]);}
   else {
    assert.equal(expectedW0,'0');
    await invokePending('actual-csv-complete-quantity',source,source);
    await invokePending('actual-csv-missing-unit',[row],[]);
    const progressed=clone(source);progressed[1].execution_status='ready_for_processing';progressed[1].next_workflow='2A';
    await invokePending('progressed-member-counts',progressed,[row]);
    const conflict=clone(source);conflict[1].product_info.quantity=2;await invokePending('physical-product-quantity',conflict,[]);
    rootFailure=true;await invokePending('failed-complete-query',source,[]);rootFailure=false;
    refreshShipping=true;await invokePending('fresh-shipping-after-candidate',source,source);refreshShipping=false;
    assert.equal((w0[0].shippingAddress as Row).name,refreshedName);
    const outside=clone(source);outside[1].created_at='2026-01-01T00:00:00.000Z';
    await invokePending('member-outside-pending-time-window',outside,[row]);
    const filling=Array.from({length:4},(_,index)=>({...clone(row),id:100+index,orderId:'EXCLUDED-'+index,root_order_id:'EXCLUDED-'+index,amazon_order_id:'EXCLUDED-'+index,customer_email:'reader@example.com'}));
    await invokePending('member-outside-five-candidates',[row,...filling,source[1]],[row]);
    const changed=clone(source);changed[1].product_info.line_item.quantity_unit_index=1;changed[1].product_info._quantity_unit_index=1;
    await invokePending('duplicate-unit',changed,[]);
   }
   if(expectedW0==='0')assert(rootReads.some(read=>new URL(String(read.url)).searchParams.get('limit')==='201'),'Fixed consumer must read full root outside candidate window');
   console.log=log;log(JSON.stringify({passed:true,checks:pendingChecks,pendingChecks,pendingObservations,rootReads,sourceRow,sourceSha,expectedW0,
    liveRequests:0,customerMessages:0,scope:'Existing actual-router tests over unchanged actual CSV producer bytes; targeted corruptions and query interleaving. No native concurrency or phase acceptance.'}));
   return;
  }
  const rawSingle=fixture.cases.find((item:any)=>item.caseId==='iv-single').row;
  assert.equal(rawSingle.customer_email,'synthetic@example.test');
  await invokePending('frozen-synthetic-email-excluded',[rawSingle],[]);
  const groups=new Map<string,Row[]>();for(const item of fixture.cases){const group=groups.get(item.caseId)??[];group.push({...clone(item.row),customer_email:'reader@invalid.invalid'});groups.set(item.caseId,group);}
  assert.deepEqual([...groups.keys()],['iv-single','iv-quantity','iv-items']);
  for(const [label,rows] of groups)await invokePending(label,rows,rows);
  const single=groups.get('iv-single')![0], producerPair=groups.get('iv-items')!;
  for(const [label,change] of [['wrong-state',{execution_status:'ready_for_processing'}],['workflow-set',{next_workflow:'2A'}],['manifest-present',{one_manifest_url:'book-finding-our-inner-voice/orders/frozen/manifests/1-manifest.json'}],['older-than-24h',{created_at:'2026-01-01T05:04:04.999Z'}],['explicit-test-excluded',{customer_email:'reader@example.com'}]] as Array<[string,Row]>)await invokePending(label,[{...clone(single),...change}],[]);
  const boundary={...clone(single),created_at:cutoff};await invokePending('inclusive-24h-boundary',[boundary],[boundary]);
  const invalidPair=clone(producerPair);invalidPair[0].marketplace_id=null;await invokePending('invalid-same-root-member-holds-whole-root',invalidPair,[]);
  const invalidContexts:Array<[string,(row:Row)=>void]>=[
   ['stale-other-unit-hash',row=>{row.character_hash=producerPair[1].character_hash;}],
   ['changed-original-specs',row=>{(row.character_specs as Row).childName='Changed';}],
   ['missing-original-specs',row=>{delete row.character_specs;}],
   ['empty-original-specs',row=>{row.character_specs={};}],
   ['malformed-original-specs',row=>{row.character_specs=[];}],
   ['missing-original-hash',row=>{delete row.character_hash;}],
   ['empty-original-hash',row=>{row.character_hash='';}],
   ['conflicting-version-alias',row=>{(row.product_info as Row).config_version=3;}],
   ['padded-book-alias-without-tuple',row=>{row.book_specs=null;row.product_info={print_book_id:' book-finding-our-inner-voice '};}],
   ['null-nested-book-specs',row=>{(row.product_info as Row).book_specs=null;}],
   ['malformed-product-info',row=>{row.product_info=[];}],
  ];
  for(const [label,change] of invalidContexts){const bad=clone(producerPair[0]);change(bad);await invokePending(label,[bad,producerPair[1]],[]);}
  const matchingAlias=clone(single);(matchingAlias.product_info as Row).config_version=2;await invokePending('matching-version-alias',[matchingAlias],[matchingAlias]);
  const nullableRootSpecs=clone(single);nullableRootSpecs.book_specs=null;await invokePending('nullable-root-book-specs',[nullableRootSpecs],[{...single}]);
  assert.equal(invalidContexts.length,11);
  w0Failure=true;await invokePending('failed-W0-send-continues-next-row',producerPair,producerPair);w0Failure=false;
  await invokePending('missing-cron-auth',[single],[],5,false);await invokePending('at-capacity',[single],[],0);
  assert.equal(pendingChecks,27);assert.equal(checks,24);
  console.log=log;log(JSON.stringify({passed:true,checks,pendingChecks,pendingObservations,liveRequests:0,customerMessages:0,scope:'Existing actual cron GET route with frozen producer rows, projected query filtering, stored selection and per-row handoff; synthetic transports and frozen clock only. No real DB concurrency, provider or installed n8n acceptance.'}));
 } catch(failure){log(JSON.stringify({passed:false,pendingChecks,pendingObservations,pendingReads,w0,input:clone(pending),message:String(failure)}));throw failure;} finally {globalThis.fetch=original;globalThis.Date=originalDate;console.log=log;console.warn=warn;console.error=error;}
}
void main().catch(e=>{console.error(e);process.exitCode=1});
