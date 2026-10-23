import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

async function main() {
 Object.assign(process.env,{SUPABASE_URL:'https://local-router.example.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic-router-only',CRON_SECRET:'synthetic-router-cron',N8N_ROUTER_WEBHOOK_URL:'https://router.example.test/webhook/w1-1-router',GELATO_DRAFT_SUBMISSION_ENABLED:'false',GELATO_STATUS_POLLING_ENABLED:'false',GELATO_NOTIFICATIONS_ENABLED:'false'});
 type Row=Record<string,unknown>;
 let candidates:Row[]=[], siblings:Row[]=[], slots=5, groupFailure=false, patchMarkedInFlight=false, routed:Row[]=[], queued:number[]=[], forbidden:string[]=[];
 const original=globalThis.fetch, log=console.log, warn=console.warn, error=console.error;
 console.log=console.warn=console.error=()=>undefined;
 const ready=(id:number,extra:Row={})=>({id,orderId:'LOCAL-ORDINARY-'+id,root_order_id:'LOCAL-ORDINARY-'+id,print_provider:'gelato',next_workflow:'4',execution_status:'ready_for_processing',customer_approval_required:true,customer_approval_status:'approved',current_workflow:null,started_at:null,...extra});
 const request=()=>new NextRequest('https://admin.example.test/api/cron/router',{headers:{authorization:'Bearer synthetic-router-cron'}});
 globalThis.fetch=async(input,init)=>{
  const r=new Request(input,init),u=new URL(r.url);
  if(u.origin==='https://router.example.test') { assert.equal(r.method,'POST');routed=(await r.json()).orders;return Response.json({success:true}); }
  if(u.origin!=='https://local-router.example.test') {forbidden.push(u.origin);throw Error('No external transport');}
  const table=u.pathname.split('/').pop();
  if(table==='queue_status') return Response.json({processing_count:5-slots,queued_count:0});
  if(table!=='orders'){forbidden.push(String(table));throw Error('Unexpected database operation');}
  let rows:Row[]=[];
  if(u.searchParams.get('execution_status')==='eq.ready_for_processing'&&u.searchParams.has('next_workflow')) {
   const selected=u.searchParams.get('select')!; for(const key of ['print_provider','print_submission_id','print_claim_token','gelato_status','started_at']) assert(selected.includes(key),'Actual router must select '+key);
   rows=candidates;
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
 };
 try {
  const {GET}=await import('../src/app/api/cron/router/route');
  let checks=0;
  const run=async(expected:number[])=>{routed=[];queued=[];const response=await GET(request());assert.equal(response.status,200,await response.clone().text());assert.deepEqual(routed.map(x=>x.id),expected);assert(routed.every(x=>typeof x.updated_at==='string'));assert.deepEqual(queued,expected);assert.deepEqual(forbidden,[]);checks++};
  candidates=[ready(1),ready(2,{print_provider:'lulu'})];await run([2]);
  routed=[];queued=[];patchMarkedInFlight=true;const raced=await GET(request());assert.equal(raced.status,503);assert.deepEqual(routed,[]);patchMarkedInFlight=false;checks++;
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
  console.log=log;log(JSON.stringify({passed:true,checks,liveRequests:0,customerMessages:0,scope:'Actual ordinary cron route, selected fields, OFF/duplicate/approval/full-group/capacity gates; synthetic transports only'}));
 } finally {globalThis.fetch=original;console.log=log;console.warn=warn;console.error=error;}
}
void main().catch(e=>{console.error(e);process.exitCode=1});
