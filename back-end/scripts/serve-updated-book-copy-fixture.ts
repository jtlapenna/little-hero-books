/** Local interaction harness: actual component + HTTP handler/service, synthetic storage only. */
import { createServer, request as httpRequest } from 'node:http';
import { mapSupabaseOrderToOrder } from '../src/lib/order-mapper';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { updatedTestBookFixture } from './updated-test-book-fixture';
import { updatedTestCopyResponse } from '../src/lib/books/updated-test-book-copy-http';
import { humanAdminRequestAllowed } from '../src/lib/admin-auth-policy';
import { inspectBookAssemblyQueue } from '../src/lib/book-assembly-queue';

async function main(){
 const output=resolve('../output/final-book-revisions-20261117/ui');mkdirSync(output,{recursive:true});
 const f=updatedTestBookFixture(),origin='http://127.0.0.1:8896';
 globalThis.fetch=async()=>{throw Error('Local UI fixture forbids live services');};
 const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{AppRouterContext}from'next/dist/shared/lib/app-router-context.shared-runtime';import{UpdatedTestBookCopy}from'./src/components/orders/updated-test-book-copy';
 const router={back:()=>history.back(),forward:()=>history.forward(),refresh:()=>location.reload(),push:href=>location.assign(href),replace:href=>location.replace(href),prefetch:async()=>{}};
 createRoot(document.getElementById('root')).render(<AppRouterContext.Provider value={router}><main className="mx-auto max-w-3xl p-6"><h1 className="mb-2 text-2xl font-semibold text-gray-900">Local admin interaction check</h1><p className="mb-6 text-sm text-gray-600">Synthetic test order. No production services, images, messages or printing.</p><div className="rounded bg-white p-5 shadow-sm"><h2 className="mb-4 text-lg font-semibold text-gray-900">Book &amp; Order Info</h2><UpdatedTestBookCopy orderId="${f.sourceId}"/></div></main></AppRouterContext.Provider>);`;
 await build({stdin:{contents:entry,loader:'tsx',resolveDir:process.cwd(),sourcefile:'updated-copy-ui.tsx'},outfile:resolve(output,'review.js'),bundle:true,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'}});
 const from=resolve('src/app/globals.css');const css=await postcss([tailwind()]).process(readFileSync(from,'utf8'),{from});writeFileSync(resolve(output,'review.css'),css.css);
 const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Updated book copy · local QA</title><link rel="stylesheet" href="/review.css"></head><body style="background:#f8fafc"><div id="root"></div><script src="/review.js"></script></body></html>';
 const server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url??'/',origin);
   if(url.pathname==='/review.js'||url.pathname==='/review.css'){res.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript':'text/css');res.end(readFileSync(resolve(output,url.pathname.slice(1))));return;}
   if(url.pathname===`/api/admin/orders/${f.sourceId}/updated-test-copy`){
    const bytes=[];for await(const chunk of req)bytes.push(Buffer.from(chunk));
    const request=new Request(url,{method:req.method,headers:new Headers(req.headers as Record<string,string>),...((req.method??'GET')!=='GET'?{body:Buffer.concat(bytes)}:{})});
    const response=await updatedTestCopyResponse(request,{params:Promise.resolve({orderId:f.sourceId})},{ports:f.ports,authorize:async request=>humanAdminRequestAllowed(request,origin)?{ok:true,mode:'supabase',actor:f.actor}:{ok:false,response:Response.json({error:'Forbidden'},{status:403})}});
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
   }
   const assembly=url.pathname.match(/^\/api\/orders\/([A-Za-z0-9_-]+)\/trigger-book-assembly$/);
   if(assembly&&req.method==='POST'){
    const row=f.rows.get(assembly[1]);if(!row)throw Error('Unknown target');
    const state=inspectBookAssemblyQueue(row);if(state==='queue'){row.next_workflow='3';row.execution_status='ready_for_processing';}
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({success:true,orderId:assembly[1],alreadyQueued:state==='queued'}));return;
   }
   if (process.env.LHL_FULL_ADMIN_UI === 'true') {
    const match=url.pathname.match(/^\/api\/orders\/([A-Za-z0-9_-]+)$/);
    if(match && req.method==='GET'){const row=f.rows.get(match[1]);if(!row)throw Error('Unknown synthetic order');const order=await mapSupabaseOrderToOrder(row,{includeStatus:false});
      order.totalSiblings=1;order.bookContext={bookId:f.bookId,formatId:'amazon',orderPrefix:f.bookId+'/orders/'+row.orderId,expectedPageCount:32,pageLabels:f.targetConfig.formats.amazon.interior.pageSequence.map(p=>p.label),pagePlan:f.targetConfig.formats.amazon.interior.pageSequence,pagePlanSource:'runtime-config',printTrimMm:{w:200,h:200}} as never;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(order));return;}
    if(url.pathname==='/api/admin/session'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({authenticated:true,email:f.actor,mode:'supabase'}));return;}
    if(url.pathname.startsWith('/api/manifests/')){const value=f.objects.get('orders:'+url.pathname.slice('/api/manifests/'.length));res.writeHead(value?200:404,{'Content-Type':'application/json'});res.end(value?Buffer.from(value):'{}');return;}
    if(url.pathname.startsWith('/api/')){res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Synthetic-only gateway rejects unknown API'}));return;}
    if(url.pathname!=='/'){await new Promise<void>((done,reject)=>{const upstream=httpRequest('http://127.0.0.1:3009'+url.pathname+url.search,{method:'GET',headers:{authorization:'Bearer synthetic-ui-gateway-only-token-long-value',accept:req.headers.accept??'*/*'}},reply=>{res.writeHead(reply.statusCode??502,Object.fromEntries(Object.entries(reply.headers).filter(([key])=>!['transfer-encoding'].includes(key))));reply.pipe(res);reply.on('end',done);});upstream.on('error',reject);upstream.end();});return;}
   }
   const target=url.pathname.match(/^\/orders\/([A-Za-z0-9_-]+)$/);
   if(target){const row=f.rows.get(target[1]);if(!row)throw Error('Unknown target');res.setHeader('Content-Type','text/html');res.end(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font:18px system-ui;padding:24px"><h1>Updated test book</h1><p>Dedication: ${String(row.dedication_text??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p><p>Next workflow: ${String(row.next_workflow)}</p><p>Original order retained: ${f.rows.has(f.sourceId)}</p><p>Test orders: ${f.rows.size}</p><a href="/">Return to local check</a></body></html>`);return;}
   res.setHeader('Content-Type','text/html');res.end(html);
  }catch(error){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error instanceof Error?error.message:'Fixture failure'}));}
 });
 server.listen(8896,'127.0.0.1',()=>console.log('Actual updated-copy component/handler/service at '+origin+'; synthetic data only. Assembly endpoint is a local UI shim, not a production queue test.'));
}
main().catch(error=>{console.error(error);process.exitCode=1});
