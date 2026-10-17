import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { experimental_readRawConfig } from 'wrangler';
import { ACCESS_RUNTIME_CONFIG, verifyPreparedRuntimeBindings, discoveredRuntimeConfig } from './prepare-access-runtime-bindings.mjs';
import { prepareGelatoRuntimeBindingFile, GELATO_RUNTIME_FLAGS } from './prepare-gelato-runtime-bindings.mjs';
const source=await fs.readFile(new URL('../wrangler.toml',import.meta.url),'utf8');
const sha='a'.repeat(40), values={CF_ACCESS_ISSUER:'https://synthetic-binding.cloudflareaccess.com',CF_ACCESS_AUDIENCE:'b'.repeat(64),ADMIN_SITE_ORIGIN:'https://admin.littleherolabs.com',ADMIN_ALLOWED_EMAILS:'jeff@littleherolabs.com,john@littleherolabs.com',...Object.fromEntries(GELATO_RUNTIME_FLAGS.map(name=>[name,'false']))};
const env={DEPLOY_ENVIRONMENT:'production',CLOUDFLARE_PAGES_PROJECT:'little-hero-labs-admin',CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_API_TOKEN:'synthetic-cloudflare-authority',GITHUB_REF:'refs/heads/main',GITHUB_SHA:sha};
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lhl-access-bindings-')),configPath=path.join(directory,'wrangler.toml');
let fetches=0;
const settings=()=>Object.fromEntries(Object.entries(values).map(([name,value])=>[name,{type:'plain_text',value}]));
const prepare=async(s=settings(),text=source)=>{await fs.writeFile(configPath,text);return prepareGelatoRuntimeBindingFile({env,sourceSha:sha,configPath,fetchImpl:async()=>{fetches++;return Response.json({success:true,result:{name:env.CLOUDFLARE_PAGES_PROJECT,production_branch:'main',deployment_configs:{production:{env_vars:{...s,UNRELATED_SECRET:{type:'secret_text',value:'sensitive-marker-never-upload'}}}}}});}});};
const reject=async(s,text=source)=>{await assert.rejects(prepare(s,text));assert.equal(await fs.readFile(configPath,'utf8'),text);};
try{
 for(const name of ACCESS_RUNTIME_CONFIG){const missing=settings();delete missing[name];await reject(missing);const hidden=settings();hidden[name].type='secret_text';await reject(hidden);const bad=settings();bad[name].value='sensitive-marker-never-upload';await reject(bad);}
 for(const operators of ['john@littleherolabs.com','john@littleherolabs.com,jeff@littleherolabs.com,other@example.test','john@littleherolabs.com,john@littleherolabs.com']){const s=settings();s.ADMIN_ALLOWED_EMAILS.value=operators;await reject(s);}
 const start=fetches;
 for(const text of [source+'\n["e\\u006ev".production.vars]\nCF_ACCESS_AUDIENCE="shadow"\n',source+'\n[vars]\n"CF_ACCESS_AUDIENCE"="shadow"\n',source.replace('CF_ACCESS_AUDIENCE = ""','"CF_ACCESS_\\u0041UDIENCE" = ""')])await reject(settings(),text);
 assert.equal(fetches,start,'Decoded/quoted TOML overrides must fail before settings lookup');
 for(const name of ['wrangler.json','wrangler.jsonc','.wrangler/deploy/config.json']){
  const shadow=path.join(directory,name);await fs.mkdir(path.dirname(shadow),{recursive:true});await fs.writeFile(shadow,'{}');const before=fetches;await reject(settings());assert.equal(fetches,before);await fs.unlink(shadow);
 }
 await fs.writeFile(configPath,source);
 const changed = source + '\n# concurrent edit during settings fetch\n';
 await assert.rejects(prepareGelatoRuntimeBindingFile({env,sourceSha:sha,configPath,fetchImpl:async()=>{await fs.writeFile(configPath,changed);return Response.json({success:true,result:{name:env.CLOUDFLARE_PAGES_PROJECT,production_branch:'main',deployment_configs:{production:{env_vars:settings()}}}});}}));
 assert.equal(await fs.readFile(configPath,'utf8'),changed,'Preparation cannot overwrite a concurrent source edit');
 await prepare();verifyPreparedRuntimeBindings(configPath,sha);
 const selected=experimental_readRawConfig({script:path.join(directory,'synthetic.js')},{useRedirectIfAvailable:true});assert.equal(selected.configPath,configPath);for(const [name,value]of Object.entries(values))assert.equal(selected.rawConfig.vars[name],value);
 await fs.appendFile(configPath,'\n# concurrent change\n');assert.throws(()=>verifyPreparedRuntimeBindings(configPath,sha));
 await prepare();verifyPreparedRuntimeBindings(configPath,sha);
 // Build the actual Pages multipart Worker upload with runtime metadata offline.
 const functions=path.join(directory,'functions'),output=path.join(directory,'worker.bundle'),metadata=path.join(directory,'build-metadata.json');
 await fs.mkdir(functions);await fs.mkdir(path.join(directory,'.open-next/cloudflare'),{recursive:true});
 await fs.writeFile(path.join(functions,'index.js'),"export function onRequest() { return new Response('synthetic'); }");
 const cli=path.resolve('node_modules/wrangler/bin/wrangler.js');
 execFileSync(process.execPath,[cli,'pages','functions','build',functions,'--project-directory',directory,'--build-metadata-path',metadata,'--outfile',output],{cwd:directory,env:{PATH:process.env.PATH,HOME:process.env.HOME,CI:'1',PAGES_ENVIRONMENT:'production',WRANGLER_SEND_METRICS:'false'},stdio:'pipe',timeout:45000});
 const bytes=await fs.readFile(output),boundary=bytes.toString('utf8').split('\r\n')[0].slice(2);
 const form=await new Response(bytes,{headers:{'content-type':'multipart/form-data; boundary='+boundary}}).formData();
 const upload=JSON.parse(String(form.get('metadata')));for(const [name,value]of Object.entries(values))assert(upload.bindings.some(binding=>binding.name===name&&binding.type==='plain_text'&&binding.text===value),name);
 assert.equal(upload.bindings.filter(binding=>Object.hasOwn(values,binding.name)).length,Object.keys(values).length);
 const scheduler=upload.bindings.filter(binding=>binding.name==='GELATO_SCHEDULED_STATUS_ENABLED');
 assert.equal(scheduler.length,1,'Registered scheduler control must survive actual Pages packaging exactly once');
 assert.equal(scheduler[0].type,'plain_text');assert.equal(scheduler[0].text,'false','Packaging must preserve the registered scheduler OFF state');
 assert(!bytes.includes(Buffer.from('sensitive-marker-never-upload')));assert(!bytes.includes(Buffer.from('synthetic-cloudflare-authority')));
 console.log(`Actual Pages metadata:${Object.keys(values).length}exact runtime bindings including registered scheduler OFF after preparation/discovery; missing settings, decoded TOML overrides, shadow/redirect configs and changed receipt fail closed; no provider calls or secret export`);
}finally{await fs.rm(directory,{recursive:true,force:true});}
