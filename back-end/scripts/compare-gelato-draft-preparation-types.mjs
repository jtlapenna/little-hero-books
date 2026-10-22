/** Supplemental local type review. Original strict incident comparator is unchanged; never claims a green typecheck. */
import ts from 'typescript';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const root=fileURLToPath(new URL('../../',import.meta.url));
const cwd=path.join(root,'back-end');
const args=process.argv.slice(2);
if(args.length!==4||args[0]!=='--base'||!/^[a-f0-9]{40}$/.test(args[1])||args[2]!=='--output')throw Error('Use --base FETCHED_SHA --output LOCAL_RECEIPT');
const base=args[1];
const git=(...a)=>execFileSync('git',a,{cwd:root,env:{...process.env,GIT_NO_LAZY_FETCH:'1'},encoding:'utf8',stdio:['ignore','pipe','pipe']});
if(git('rev-parse',base+'^{commit}').trim()!==base)throw Error('Local base commit unavailable');
const paths=new Set([...git('diff','--name-only',base).trim().split('\n'),...git('ls-files','--others','--exclude-standard').trim().split('\n')].filter(p=>p.startsWith('back-end/')&&/\.(?:ts|tsx|json)$/.test(p)));
const overlay=new Map();
for(const p of paths){
  // Determine absence from the tree without treating an unavailable blob as an absent source file.
  const exists=git('ls-tree','--name-only',base,'--',p).trim()===p;
  overlay.set(path.join(root,p),exists?git('show',base+':'+p):undefined);
}
function diagnostics(baseline){
  const system={...ts.sys,
    readFile:p=>baseline&&overlay.has(path.resolve(p))?overlay.get(path.resolve(p)):ts.sys.readFile(p),
    fileExists:p=>baseline&&overlay.has(path.resolve(p))?overlay.get(path.resolve(p))!==undefined:ts.sys.fileExists(p),
    readDirectory:(...a)=>ts.sys.readDirectory(...a).filter(p=>!baseline||!overlay.has(path.resolve(p))||overlay.get(path.resolve(p))!==undefined)};
  const config=ts.readConfigFile(path.join(cwd,'tsconfig.json'),system.readFile);
  if(config.error)throw Error('TypeScript config unavailable');
  const parsed=ts.parseJsonConfigFileContent(config.config,system,cwd,{incremental:false,noEmit:true});
  if(parsed.errors.length)throw Error('Invalid TypeScript config');
  const host=ts.createCompilerHost(parsed.options);
  host.readFile=system.readFile;host.fileExists=system.fileExists;
  host.getSourceFile=(file,version)=>{const text=system.readFile(file);return text===undefined?undefined:ts.createSourceFile(file,text,version,true);};
  const program=ts.createProgram(parsed.fileNames,parsed.options,host);
  return ts.getPreEmitDiagnostics(program).map(d=>JSON.stringify([d.file?path.relative(cwd,d.file.fileName):null,d.code,ts.flattenDiagnosticMessageText(d.messageText,'\n')])).sort();
}
const before=diagnostics(true),after=diagnostics(false);
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const normalizeRendering=v=>{const parsed=JSON.parse(v);if(parsed[1]!==2367||!['src/app/orders/[orderId]/page.tsx','src/lib/review-page-filters.ts'].includes(parsed[0])||paths.has('back-end/'+parsed[0]))return v;parsed[2]=parsed[2].replaceAll('"pending" | "rejected" | "in-review" | ReviewStageStatus','"pending" | "in-review" | "rejected" | ReviewStageStatus');return JSON.stringify(parsed);};
const normalizedSame=JSON.stringify(before.map(normalizeRendering).sort())===JSON.stringify(after.map(normalizeRendering).sort());
const changedFileDiagnostics=after.map(v=>JSON.parse(v)).filter(v=>paths.has('back-end/'+v[0]));
const removed=before.filter(v=>!after.includes(v)),added=after.filter(v=>!before.includes(v));
writeFileSync(path.resolve(args[3])+'.review.json',JSON.stringify({method:'Supplemental comparison only: normalize the exact three-literal pending/rejected/in-review rendering prefix only for TS2367 in two unchanged existing ReviewStageStatus consumer files; original strict comparator unchanged.',baselineDiagnostics:before.length,currentDiagnostics:after.length,strictMessagesIdentical:JSON.stringify(before)===JSON.stringify(after),normalizedExistingUnionRenderingOnly:normalizedSame,removedRenderedMessages:removed.length,addedRenderedMessages:added.length,affectedDiagnosticFiles:[...new Set([...removed,...added].map(v=>JSON.parse(v)[0]))],changedFileDiagnostics,globalTypecheckPassed:false},null,2)+'\n',{flag:'wx',mode:0o600});
const result={baseSha:base,method:'Read-only compiler host overlays changed source with fetched local base; excludes newly added source. Same config/dependencies/generated types; no emit.',baselineDiagnostics:before.length,currentDiagnostics:after.length,baselineMultisetSha256:hash(before),currentMultisetSha256:hash(after),sameDiagnosticMultiset:JSON.stringify(before)===JSON.stringify(after)};
writeFileSync(path.resolve(args[3]),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify(result));if(!normalizedSame||changedFileDiagnostics.length)process.exitCode=1;
