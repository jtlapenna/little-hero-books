#!/usr/bin/env python3
"""Build W4.1 Sibling Aggregation workflow JSON by adding nodes and connections."""
import json

WF_PATH = "docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/w4.1-Sibling-Aggregation.json"

with open(WF_PATH) as f:
    wf = json.load(f)

# Validate & Normalize fetches manifest internally (like W4) - no separate Fetch node
VALIDATE_NORM_JS = r"""// Validate & Normalize Per Sibling — fetch 3-manifest, extract pageImageUrls, coverPdfR2Key, pdfR2Key
function isUrl(s){ return typeof s==='string'&&/^https?:\/\/i.test(s); }
function toAssetUrl(raw,assetBase){ if(!raw)return undefined; if(isUrl(raw))return raw; const s=String(raw).trim(); if(!s||!assetBase)return undefined; return (assetBase.replace(/\/$/,'')+'/'+s.replace(/^\/+/, '')); }

const root=$input.first()?.json||{};
const manifest3Key=root.manifest3Key||`book-mvp-simple-adventure/orders/${root.orderId}/manifests/3-manifest.json`;
const backendUrl='https://admin.littleherolabs.com';
const http=this.helpers.httpRequest;
let manifest={};
try{
  const r=await http({method:'GET',url:`${backendUrl}/api/manifests/${manifest3Key}`,json:true,ignoreHttpStatusErrors:true});
  manifest=(r&&typeof r==='object'&&!r.error)?r:{};
}catch(e){}
const CONFIG=root.CONFIG||{};
const orderId=root.orderId||manifest.orderId||manifest.amazonOrderId||'';
const assetBase=(CONFIG.defaults?.trimIn?.assetBase||'https://admin.littleherolabs.com/api/assets/').replace(/\/$/,'');

let pngGen=manifest.pngGeneration||{};
let pagesR2=pngGen.pages||manifest.pages||{};
let pagesCF=pngGen.pagesWithCloudflare||manifest.pagesWithCloudflare||{};
if(!pagesR2||Array.isArray(pagesR2))pagesR2={}; if(!pagesCF||Array.isArray(pagesCF))pagesCF={};

let expectedPageCount=17;
const pageKeys=Object.keys(pagesR2).filter(k=>k==='p00'||k==='p00_dedication'||/^p\d{2,}$/.test(k));
if(pageKeys.length>0)expectedPageCount=pageKeys.length;
const requiredKeys=Array.from({length:expectedPageCount},(_,i)=>'p'+String(i).padStart(2,'0'));

const hasP00=!!(pagesR2.p00||pagesR2.p00_dedication||pagesCF.p00||pagesCF.p00_dedication);
if(!hasP00)throw new Error(`W4.1: sibling ${orderId} missing p00/p00_dedication`);

let pageImageUrls=[];
for(const key of requiredKeys){
  const lookup=key==='p00'?(pagesR2.p00?'p00':'p00_dedication'):key;
  let url; const raw=pagesR2[lookup];
  if(typeof raw==='string'&&raw.trim())url=isUrl(raw)?raw:toAssetUrl(raw,assetBase);
  else if(raw&&typeof raw==='object'){ const c=raw.r2Key||raw.url||raw.path||''; url=c?isUrl(c)?c:toAssetUrl(c,assetBase):null; }
  if(!url){ const cf=pagesCF[lookup]||pagesCF[key]; url=typeof cf==='string'?cf:(cf?.cloudflareImageUrl||cf?.url); }
  if(!url)throw new Error(`W4.1: missing page ${key}`);
  pageImageUrls.push(String(url));
}
const BUST=encodeURIComponent(String(manifest.runStamp||manifest.generatedAt||orderId||Date.now()));
pageImageUrls=pageImageUrls.map(u=>u+(u.includes('?')?'&':'?')+'v='+BUST);

const pdfFilename=`interior_${orderId}.pdf`;
const pdfR2Key=`book-mvp-simple-adventure/orders/${orderId}/${pdfFilename}`;
const coverPdfR2Key=manifest.coverPdfR2Key||manifest.pdfGeneration?.coverPdf||`book-mvp-simple-adventure/orders/${orderId}/cover_${orderId}.pdf`;
const shippingAddress=manifest.shippingAddress||manifest.shipping_address||root.shipping_address||{};
const childName=(root.character_specs?.childName||manifest.character_specs?.childName||'Book').toString().trim()||'Book';

return[{json:{...root,...manifest,CONFIG,orderId,pageImageUrls,expectedPageCount,pdfFilename,pdfR2Key,coverPdfR2Key,shippingAddress,childName}}];"""

BUILD_PAGES_JS = r"""// Build pages_html for PDFMonkey at 8.75×8.75 in
const j=$input.first().json||{};
const pages=Array.isArray(j.pageImageUrls)?j.pageImageUrls:[];
if(!pages.length)throw new Error('No pageImageUrls');
const css=`\n  <style>\n    @page { size: 8.75in 8.75in; margin: 0; }\n    html, body { margin:0; padding:0; }\n    .page { width:8.75in; height:8.75in; page-break-after: always; }\n    .bg { width:100%; height:100%; object-fit: cover; display:block; }\n  </style>\n`;
const pagesHtml=pages.map(url=>`<section class="page"><img class="bg" src="${url}" alt="" /></section>`).join('\n');
return[{json:{...j,pages_html:`${css}\n${pagesHtml}`}}];"""

PREP_PDFM_JS = r"""const d=$input.first().json;
const tpl=d.CONFIG?.pdfMonkey?.templateId;
if(!tpl)throw new Error('Missing PDFMonkey templateId');
return[{json:{...d,document:{document_template_id:tpl,status:'pending',meta:{_filename:d.pdfFilename},payload:{pages_html:d.pages_html}}}}];"""

POLL_PDFM_JS = r"""// Reattach context + Poll PDFMonkey until ready
const httpResp=$input.first().json||{};
let ctx={}; try{ctx=($items('Build Pages HTML (8.75in)',0,$runIndex)?.[0]?.json)||{};}catch{}
if(!ctx.orderId)try{ctx=($items('Validate & Normalize Per Sibling',0,$runIndex)?.[0]?.json)||ctx;}catch{}
const doc=httpResp.document||httpResp.data||httpResp;
const docId=doc.id||doc.data?.id; if(!docId)throw new Error('PDFMonkey missing id');
const token=ctx.CONFIG?.pdfMonkey?.token; if(!token)throw new Error('Missing token');
const http=this.helpers.httpRequest; const AUTH={Authorization:`Bearer ${token}`};
let status=doc.status||'queued'; let downloadUrl=doc.download_url||null;
async function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
for(let a=0;a<40;a++){
  if(status==='success'&&downloadUrl)break;
  try{const r=await http({method:'GET',url:`https://api.pdfmonkey.io/api/v1/documents/${docId}`,json:true,headers:AUTH});
  const d=r?.document||r?.data||r; status=d?.status||status; downloadUrl=d?.download_url||d?.file_url||downloadUrl;
  if(status==='error'||status==='failure')throw new Error('PDFMonkey error: '+(d?.failure_cause||status));}
  catch(e){if(e.message.includes('PDFMonkey error'))throw e; await sleep(1500); continue;}
  await sleep(1200+Math.min(a*150,3800));
}
if(status!=='success'||!downloadUrl)throw new Error('PDF not ready');
return[{json:{...ctx,pdfMonkeyDocumentId:docId,pdfDownloadUrl:downloadUrl,pdfR2Key:ctx.pdfR2Key}}];"""

BUILD_COVER_JS = r"""// Build cover HTML for PDFMonkey
const j=$input.first().json||{};
const cfg=j.CONFIG||{};
const assetBase=(cfg.defaults?.trimIn?.assetBase||'https://admin.littleherolabs.com/api/assets/').replace(/\/+$/,'');
const orderId=j.orderId||'unknown';
const runStamp=j.runStamp||new Date().toISOString();
function isUrl(s){return typeof s==='string'&&/^https?:\/\/i.test(s);}
function toAssetUrl(p){if(!p)return undefined;if(isUrl(p))return p; return `${assetBase}/${String(p).replace(/^\/+/,'')}`;}
let coverRef=j.coverImageUrl||(Array.isArray(j.coverImageUrls)&&j.coverImageUrls[0])||j.coverPngR2Key||j.pngGeneration?.coverSpreadImage||`book-mvp-simple-adventure/orders/${orderId}/preview-images/cover-spread.png`;
const coverUrl=(toAssetUrl(coverRef)||'')+(coverRef?`?v=${encodeURIComponent(runStamp)}`:'');
if(!coverUrl)throw new Error('Missing cover image');
const css=`\n  <style>\n    @page { size: 17.25in 8.75in; margin: 0; }\n    html, body { margin:0; padding:0; }\n    .page { width:17.25in; height:8.75in; page-break-after: always; overflow:hidden; }\n    .bg { width:100%; height:100%; display:block; object-fit:cover; }\n  </style>\n`;
const html=`<section class="page"><img class="bg" src="${coverUrl}" alt="" /></section>`;
return[{json:{...j,cover_html:`${css}\n${html}`,coverPdfFilename:`cover_${orderId}.pdf`}}];"""

PREP_COVER_JS = r"""const d=$input.first().json;
const tpl=d.CONFIG?.pdfMonkey?.coverTemplateId||'D52F14C8-BBC3-4058-929F-195DFC707E75';
if(!tpl)throw new Error('Missing coverTemplateId');
return[{json:{...d,coverDocument:{document_template_id:tpl,status:'pending',meta:{_filename:d.coverPdfFilename},payload:{cover_html:d.cover_html}}}}];"""

POLL_COVER_JS = r"""// Poll Cover PDFMonkey until ready
const ctxIn=$input.first()?.json||{};
const src=ctxIn.coverDocument||ctxIn.document||ctxIn;
const docId=src?.id||src?.document?.id||null; if(!docId)throw new Error('Cover PDFMonkey missing id');
const token=ctxIn.CONFIG?.pdfMonkey?.token; if(!token)throw new Error('Missing token');
const http=this.helpers.httpRequest; const AUTH={Authorization:`Bearer ${token}`};
let status=src?.status||'queued'; let downloadUrl=src?.download_url||null;
async function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
for(let a=0;a<40;a++){
  if(status==='success'&&downloadUrl)break;
  try{const r=await http({method:'GET',url:`https://api.pdfmonkey.io/api/v1/documents/${docId}`,json:true,headers:AUTH});
  const d=r?.document||r?.data||r; status=d?.status||status; downloadUrl=d?.download_url||d?.file_url||downloadUrl;
  if(status==='error'||status==='failure')throw new Error('Cover PDFMonkey error');}catch(e){if(e.message.includes('error'))throw e; await sleep(1500); continue;}
  await sleep(1200+Math.min(a*150,3800));
}
if(status!=='success'||!downloadUrl)throw new Error('Cover PDF not ready');
return[{json:{...ctxIn,coverPdfDownloadUrl:downloadUrl}}];"""

AGGREGATE_JS = r"""// Aggregate all siblings: presign R2 URLs, build Lulu payload with N line_items
const crypto=require('crypto');
const items=$input.all().map(i=>i.json);
if(!items.length)throw new Error('No items to aggregate');
const cfg=items[0].CONFIG||{};
const {bucket,endpointHost,region,accessKeyId,secretAccessKey}=cfg.r2||{};
if(!bucket||!endpointHost||!accessKeyId||!secretAccessKey)throw new Error('R2 config incomplete');

function presignKey(key,expires=3600){
  const now=new Date(); const amzDate=now.toISOString().replace(/[-:]/g,'').replace(/\..+/, '')+'Z';
  const date=amzDate.slice(0,8); const rgn=region||'auto'; const svc='s3';
  const objectKey=encodeURIComponent(String(key).replace(/^\/+/, '')).replace(/%2F/g,'/');
  const canonicalUri=`/${bucket}/${objectKey}`; const credentialScope=`${date}/${rgn}/${svc}/aws4_request`;
  const credential=`${accessKeyId}/${credentialScope}`; const signedHeaders='host';
  const queryParams={'X-Amz-Algorithm':'AWS4-HMAC-SHA256','X-Amz-Credential':credential,'X-Amz-Date':amzDate,'X-Amz-Expires':String(expires),'X-Amz-SignedHeaders':signedHeaders};
  const canonicalQueryString=Object.entries(queryParams).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const canonicalHeaders=`host:${endpointHost}\n`; const payloadHash='UNSIGNED-PAYLOAD';
  const canonicalRequest=['GET',canonicalUri,canonicalQueryString,canonicalHeaders,signedHeaders,payloadHash].join('\n');
  const stringToSign=['AWS4-HMAC-SHA256',amzDate,credentialScope,crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
  const kDate=crypto.createHmac('sha256',Buffer.from('AWS4'+secretAccessKey,'utf8')).update(date).digest();
  const kRegion=crypto.createHmac('sha256',kDate).update(rgn).digest();
  const kService=crypto.createHmac('sha256',kRegion).update(svc).digest();
  const kSigning=crypto.createHmac('sha256',kService).update('aws4_request').digest();
  const signature=crypto.createHmac('sha256',kSigning).update(stringToSign).digest('hex');
  return `https://${endpointHost}/${bucket}/${objectKey}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

function normAddr(addr){if(!addr||typeof addr!=='object')return null;
  return{name:addr.name||'',street1:(addr.street1||addr.address||addr.street||'').trim(),street2:addr.street2||'',city:addr.city||'',state_code:(addr.state_code||addr.state||'').toString().toUpperCase().slice(0,2),postcode:(addr.postcode||addr.zip||'').toString().trim(),country_code:(addr.country_code||addr.country||'US').toString().toUpperCase().slice(0,2),phone_number:addr.phone_number||addr.phone||''};
}

const podPackageId=cfg.defaults?.podPackageId||'0850X0850FCPRESS080CW444MXX';
const first=items[0]; const shipAddr=normAddr(first.shippingAddress||first.shipping_address);
if(!shipAddr?.phone_number)throw new Error('shipping_address.phone_number required');

const siblings=items.map(s=>{
  const interiorUrl=presignKey(s.pdfR2Key); const coverUrl=presignKey(s.coverPdfR2Key);
  const childName=(s.childName||'Book').toString().trim()||'Book';
  return{...s,interiorSignedUrl:interiorUrl,coverSignedUrl:coverUrl,childName};
});

const line_items=siblings.map(s=>({external_id:s.orderId,title:`Little Hero Book – ${s.childName}`,quantity:1,printable_normalization:{interior:{source_url:s.interiorSignedUrl},cover:{source_url:s.coverSignedUrl},pod_package_id:podPackageId}}));
// Map storefront/internal shipping labels to Lulu's accepted enum values.
function normalizeShippingLevel(raw){
  const s=String(raw||'').trim().toUpperCase();
  if(!s) return 'MAIL';
  const table={
    MAIL:'MAIL',
    STANDARD:'MAIL',
    ECONOMY:'MAIL',
    GROUND:'MAIL',
    PRIORITY:'PRIORITY',
    EXPEDITED:'EXPRESS',
    EXPRESS:'EXPRESS',
    OVERNIGHT:'EXPRESS',
    NEXT_DAY:'EXPRESS',
    NEXTDAY:'EXPRESS',
    RUSH:'EXPRESS'
  };
  return table[s] || 'MAIL';
}
const requestedShipping=first.CONFIG?.defaults?.shippingLevel;
const shippingLevel=normalizeShippingLevel(requestedShipping);
const luluPayload={external_id:`sibling-${first.rootGroupId||first.orderId}-${Date.now()}`,contact_email:first.customer?.email||'orders@littleherolabs.com',shipping_level:shippingLevel,shipping_address:shipAddr,line_items};
return[{json:{...first,siblings,luluPayload,CONFIG:cfg,shippingLevelRequested:requestedShipping||null,shippingLevelSent:shippingLevel}}];"""

LULU_TOKEN_JS = r"""// Lulu PRODUCTION: Get Token
const j=$input.first().json||{};
const basic=j.CONFIG?.lulu?.basicAuth; if(!basic)throw new Error('Missing basicAuth');
const http=this.helpers.httpRequest;
const resp=await http({method:'POST',url:'https://api.lulu.com/auth/realms/glasstree/protocol/openid-connect/token',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded',Authorization:basic},body:'grant_type=client_credentials',json:true});
const access=resp?.access_token||resp?.token; if(!access)throw new Error('Token missing');
return[{json:{...j,luluAccessToken:access}}];"""

SUBMIT_LULU_JS = r"""// Submit Lulu Print Job
const j=$input.first().json||{};
const token=j.luluAccessToken; const payload=j.luluPayload;
if(!token||!payload)throw new Error('Missing token or payload');
const http=this.helpers.httpRequest;
const resp=await http({method:'POST',url:'https://api.lulu.com/print-jobs/',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:payload,json:true});
const jobId=resp?.id??resp?.job_id??resp?.data?.id; const status=resp?.status??resp?.data?.status??'CREATED';
if(!jobId)throw new Error('Lulu response missing job id');
return[{json:{...j,luluJobId:String(jobId).slice(0,50),luluStatus:status}}];"""

SPLIT_JS = r"""// Split for Supabase: emit N items (one per sibling) with shared luluJobId
const j=$input.first().json||{};
const siblings=j.siblings||[];
const luluJobId=j.luluJobId; const luluStatus=j.luluStatus||'SUBMITTED';
if(!siblings.length)throw new Error('No siblings');
return siblings.map(s=>({json:{...s,luluJobId,luluStatus}}));"""

BUILD_M4_JS = r"""const j=$input.first().json||{};
const manifest={schema:'lhb.run-manifest@v2.0',stage:'4-print-fulfillment',createdAt:new Date().toISOString(),orderId:j.orderId,artifacts:{interiorPdfR2Key:j.pdfR2Key,coverPdfR2Key:j.coverPdfR2Key},lulu:{jobId:j.luluJobId,status:j.luluStatus}};
const key=`book-mvp-simple-adventure/orders/${j.orderId}/manifests/4-manifest.json`;
return[{json:{...j,manifestKey:key,_manifest:manifest}}];"""

new_nodes = [
    {"parameters":{"respondWith":"json","responseBody":"{ \"status\": \"accepted\" }","options":{"responseCode":200}},"id":"w41-ack-005","name":"Respond to Webhook (Ack)","type":"n8n-nodes-base.respondToWebhook","typeVersion":1.4,"position":[440,-120]},
    {"parameters":{"jsCode":VALIDATE_NORM_JS},"id":"w41-norm-007","name":"Validate & Normalize Per Sibling","type":"n8n-nodes-base.code","typeVersion":2,"position":[440,120]},
    {"parameters":{"jsCode":BUILD_PAGES_JS},"id":"w41-pages-008","name":"Build Pages HTML (8.75in)","type":"n8n-nodes-base.code","typeVersion":2,"position":[660,120]},
    {"parameters":{"jsCode":PREP_PDFM_JS},"id":"w41-prep-009","name":"Prepare PDFMonkey Data","type":"n8n-nodes-base.code","typeVersion":2,"position":[880,120]},
    {"parameters":{"method":"POST","url":"https://api.pdfmonkey.io/api/v1/documents","sendHeaders":True,"headerParameters":{"parameters":[{"name":"Content-Type","value":"application/json"},{"name":"Authorization","value":"={{'Bearer '+$json.CONFIG.pdfMonkey.token}}"}]},"sendBody":True,"specifyBody":"json","jsonBody":"={{ $json.document }}","options":{"timeout":30000}},"id":"w41-pdfm-010","name":"Generate Interior PDF","type":"n8n-nodes-base.httpRequest","typeVersion":4.2,"position":[1100,120]},
    {"parameters":{"jsCode":POLL_PDFM_JS},"id":"w41-poll-011","name":"Poll PDFMonkey until ready","type":"n8n-nodes-base.code","typeVersion":2,"position":[1320,120]},
    {"parameters":{"url":"={{$json.pdfDownloadUrl}}","options":{"response":{"response":{"responseFormat":"file"}},"timeout":30000}},"id":"w41-dl-012","name":"Download Interior PDF","type":"n8n-nodes-base.httpRequest","typeVersion":4.2,"position":[1540,120]},
    {"parameters":{"operation":"upload","bucketName":"little-hero-orders","fileName":"={{ $json.pdfR2Key }}","additionalFields":{}},"id":"w41-upload-013","name":"Upload Interior PDF to R2","type":"n8n-nodes-base.s3","typeVersion":1,"position":[1760,120],"credentials":{"s3":{"id":"7tJOX9QjL1jqyEjf","name":"S3 account"}}},
    {"parameters":{"jsCode":BUILD_COVER_JS},"id":"w41-cover-014","name":"Build Cover HTML","type":"n8n-nodes-base.code","typeVersion":2,"position":[1980,120]},
    {"parameters":{"jsCode":PREP_COVER_JS},"id":"w41-coverprep-015","name":"Prepare Cover PDFMonkey Data","type":"n8n-nodes-base.code","typeVersion":2,"position":[2200,120]},
    {"parameters":{"method":"POST","url":"https://api.pdfmonkey.io/api/v1/documents","sendHeaders":True,"headerParameters":{"parameters":[{"name":"Content-Type","value":"application/json"},{"name":"Authorization","value":"={{'Bearer '+$json.CONFIG.pdfMonkey.token}}"}]},"sendBody":True,"specifyBody":"json","jsonBody":"={{ $json.coverDocument }}","options":{"timeout":30000}},"id":"w41-coverpdf-016","name":"Generate Cover PDF","type":"n8n-nodes-base.httpRequest","typeVersion":4.2,"position":[2420,120]},
    {"parameters":{"jsCode":POLL_COVER_JS},"id":"w41-coverpoll-017","name":"Poll Cover PDFMonkey until ready","type":"n8n-nodes-base.code","typeVersion":2,"position":[2640,120]},
    {"parameters":{"url":"={{$json.coverPdfDownloadUrl}}","options":{"response":{"response":{"responseFormat":"file"}},"timeout":30000}},"id":"w41-coverdl-018","name":"Download Cover PDF","type":"n8n-nodes-base.httpRequest","typeVersion":4.2,"position":[2860,120]},
    {"parameters":{"operation":"upload","bucketName":"little-hero-orders","fileName":"={{ $json.coverPdfR2Key }}","additionalFields":{}},"id":"w41-coverup-019","name":"Upload Cover PDF to R2","type":"n8n-nodes-base.s3","typeVersion":1,"position":[3080,120],"credentials":{"s3":{"id":"7tJOX9QjL1jqyEjf","name":"S3 account"}}},
    {"parameters":{"jsCode":AGGREGATE_JS},"id":"w41-agg-020","name":"Aggregate + Signed URLs + Build Lulu Payload","type":"n8n-nodes-base.code","typeVersion":2,"position":[3300,120]},
    {"parameters":{"jsCode":LULU_TOKEN_JS},"id":"w41-token-021","name":"Lulu: Get Token","type":"n8n-nodes-base.code","typeVersion":2,"position":[3520,120]},
    {"parameters":{"jsCode":SUBMIT_LULU_JS},"id":"w41-submit-022","name":"Submit Lulu Print Job","type":"n8n-nodes-base.code","typeVersion":2,"position":[3740,120]},
    {"parameters":{"jsCode":SPLIT_JS},"id":"w41-split-023","name":"Split for Supabase PATCH","type":"n8n-nodes-base.code","typeVersion":2,"position":[3960,120]},
    {"parameters":{"method":"PATCH","url":"={{$json.CONFIG.supabase.projectUrl}}/rest/v1/orders?orderId=eq.{{encodeURIComponent($json.orderId)}}","sendHeaders":True,"headerParameters":{"parameters":[{"name":"Content-Type","value":"application/json"},{"name":"apikey","value":"={{$json.CONFIG.supabase.serviceRoleKey}}"},{"name":"Authorization","value":"={{'Bearer '+$json.CONFIG.supabase.serviceRoleKey}}"}]},"sendBody":True,"specifyBody":"json","jsonBody":"={{ JSON.stringify({ lulu_job_id: $json.luluJobId, lulu_status: $json.luluStatus, print_submitted_at: new Date().toISOString(), workflow_step: 'print_fulfillment', status: 'pending_print', updated_at: new Date().toISOString() }) }}","options":{}},"id":"w41-patch-024","name":"Supabase: PATCH N rows","type":"n8n-nodes-base.httpRequest","typeVersion":4.2,"position":[4180,120]},
    {"parameters":{"jsCode":BUILD_M4_JS},"id":"w41-m4-025","name":"Build 4-Manifest JSON","type":"n8n-nodes-base.code","typeVersion":2,"position":[4400,120]},
    {"parameters":{"operation":"upload","bucketName":"little-hero-orders","fileName":"={{ $json.manifestKey }}","binaryData":False,"additionalFields":{}},"id":"w41-m4up-026","name":"Upload 4-Manifest to R2","type":"n8n-nodes-base.s3","typeVersion":1,"position":[4620,120],"credentials":{"s3":{"id":"7tJOX9QjL1jqyEjf","name":"S3 account"}}},
    {"parameters":{"method":"POST","url":"https://admin.littleherolabs.com/api/webhooks/print-submitted","sendHeaders":True,"headerParameters":{"parameters":[{"name":"Content-Type","value":"application/json"}]},"sendBody":True,"specifyBody":"json","jsonBody":"={{ JSON.stringify({ orderIds: $('Split for Supabase PATCH').all().map(i=>i.json.orderId) }) }}","options":{}},"id":"w41-notify-027","name":"Notify: Sent to Print","type":"n8n-nodes-base.httpRequest","typeVersion":4.2,"position":[4840,120]},
]

wf["nodes"].extend(new_nodes)
wf["connections"] = {
    "Webhook (W4.1 Intake)": {"main": [[{"node": "Config + Validate Sibling Group", "type": "main", "index": 0}]]},
    "Config + Validate Sibling Group": {"main": [[{"node": "Respond to Webhook (Ack)", "type": "main", "index": 0}, {"node": "Validate & Normalize Per Sibling", "type": "main", "index": 0}]]},
    "Respond to Webhook (Ack)": {"main": [[]]},
    "Validate & Normalize Per Sibling": {"main": [[{"node": "Build Pages HTML (8.75in)", "type": "main", "index": 0}]]},
    "Build Pages HTML (8.75in)": {"main": [[{"node": "Prepare PDFMonkey Data", "type": "main", "index": 0}]]},
    "Prepare PDFMonkey Data": {"main": [[{"node": "Generate Interior PDF", "type": "main", "index": 0}]]},
    "Generate Interior PDF": {"main": [[{"node": "Poll PDFMonkey until ready", "type": "main", "index": 0}]]},
    "Poll PDFMonkey until ready": {"main": [[{"node": "Download Interior PDF", "type": "main", "index": 0}]]},
    "Download Interior PDF": {"main": [[{"node": "Upload Interior PDF to R2", "type": "main", "index": 0}]]},
    "Upload Interior PDF to R2": {"main": [[{"node": "Build Cover HTML", "type": "main", "index": 0}]]},
    "Build Cover HTML": {"main": [[{"node": "Prepare Cover PDFMonkey Data", "type": "main", "index": 0}]]},
    "Prepare Cover PDFMonkey Data": {"main": [[{"node": "Generate Cover PDF", "type": "main", "index": 0}]]},
    "Generate Cover PDF": {"main": [[{"node": "Poll Cover PDFMonkey until ready", "type": "main", "index": 0}]]},
    "Poll Cover PDFMonkey until ready": {"main": [[{"node": "Download Cover PDF", "type": "main", "index": 0}]]},
    "Download Cover PDF": {"main": [[{"node": "Upload Cover PDF to R2", "type": "main", "index": 0}]]},
    "Upload Cover PDF to R2": {"main": [[{"node": "Aggregate + Signed URLs + Build Lulu Payload", "type": "main", "index": 0}]]},
    "Aggregate + Signed URLs + Build Lulu Payload": {"main": [[{"node": "Lulu: Get Token", "type": "main", "index": 0}]]},
    "Lulu: Get Token": {"main": [[{"node": "Submit Lulu Print Job", "type": "main", "index": 0}]]},
    "Submit Lulu Print Job": {"main": [[{"node": "Split for Supabase PATCH", "type": "main", "index": 0}]]},
    "Split for Supabase PATCH": {"main": [[{"node": "Supabase: PATCH N rows", "type": "main", "index": 0}]]},
    "Supabase: PATCH N rows": {"main": [[{"node": "Build 4-Manifest JSON", "type": "main", "index": 0}]]},
    "Build 4-Manifest JSON": {"main": [[{"node": "Upload 4-Manifest to R2", "type": "main", "index": 0}]]},
    "Upload 4-Manifest to R2": {"main": [[{"node": "Notify: Sent to Print", "type": "main", "index": 0}]]},
}

with open(WF_PATH, "w") as f:
    json.dump(wf, f, indent=2)

print("W4.1 workflow updated with", len(wf["nodes"]), "nodes")
