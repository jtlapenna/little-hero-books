/** Local auth-only probe. No .env files, live credentials or outbound requests. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../back-end/',import.meta.url));
const requireBackend=createRequire(root+'package.json');
const {build}=requireBackend('esbuild') as typeof import('esbuild');
const {Miniflare}=requireBackend('miniflare') as typeof import('miniflare');
const bindings={SUPABASE_URL:'https://synthetic-auth.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic-only',BACKEND_API_TOKEN:'synthetic-cold-route',GELATO_API_KEY:'synthetic-only'};
const config=await fs.readFile(root+'wrangler.toml','utf8');
const date=config.match(/^compatibility_date\s*=\s*"([^"]+)"/m)?.[1];
const flags=[...(config.match(/compatibility_flags\s*=\s*\[([^\]]+)\]/)?.[1]??'').matchAll(/"([^"]+)"/g)].map(m=>m[1]);
assert(date&&flags.length);
const entry=`import {POST} from ${JSON.stringify(root+'src/app/api/internal/w4/engineering-automation/route.ts')};export default{fetch:POST};`;
const bundle=await build({
  stdin:{contents:entry,resolveDir:root,loader:'ts'},bundle:true,write:false,
  format:'esm',platform:'neutral',mainFields:['browser','module','main'],external:['node:*'],
  // Next's generic package references these paths while initializing ua-parser.
  // They are local packaging shims, not Cloudflare bindings or an auth replacement.
  define:{__dirname:JSON.stringify('/synthetic-local-only'),__filename:JSON.stringify('/synthetic-local-only/worker.js')},
  logLevel:'silent',
});
let outbound=0;
for(const sequence of [['valid','missing','wrong','valid'],['missing','valid'],['wrong','valid']]){
  const worker=new Miniflare({modules:true,script:bundle.outputFiles[0].text,
    compatibilityDate:date,compatibilityFlags:flags,bindings,
    outboundService:()=>{outbound++;throw Error('Auth-only probe forbids all outbound I/O');},
  });
  try{
    for(const kind of sequence){
      const response=await worker.dispatchFetch('https://local/engineering',{
        method:'POST',headers:{'Content-Type':'application/json',...(kind==='missing'?{}:{Authorization:'Bearer '+(kind==='valid'?bindings.BACKEND_API_TOKEN:'invalid')})},body:'{}',
      });
      // Invalid input deliberately stops before constructing an order/runtime.
      assert.equal(response.status,kind==='valid'?400:401,kind);
    }
  }finally{await worker.dispose();}
}
assert.equal(outbound,0);
console.log('PASS: actual route/auth, three fresh production-config Worker isolates, valid invalid-input400, missing/wrong401, cold/warm sequences, zero outbound I/O. Local packaging probe; not a deployed n8n credential check.');
