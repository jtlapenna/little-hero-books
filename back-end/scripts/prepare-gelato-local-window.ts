/** Offline inputs only. Refuses existing output and prints no private values. */
import {readFile,mkdir,writeFile,chmod} from 'node:fs/promises';
import path from 'node:path';
import {prepareLocalWindowPackage} from './helpers/gelato-local-window-package';
import {GelatoPrintConfigSchema} from '../src/lib/books/types';
async function main(){
 const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--out')throw Error('Use --out NEW_PRIVATE_DIRECTORY');
 const root=path.resolve(__dirname,'../..');
 const inspection=JSON.parse(await readFile(path.join(root,'docs/repo-workflows-planning/gelato-live-prep-evidence-2026-10-19/pdf-inspection.json'),'utf8'));
 const configs=JSON.parse(await readFile(path.join(root,'back-end/src/lib/books/configs/book-finding-our-inner-voice/v2.json'),'utf8'));
 const config=GelatoPrintConfigSchema.parse(configs.formats.standard.print),amazon=GelatoPrintConfigSchema.parse(configs.formats.amazon.print);
 const result=prepareLocalWindowPackage(inspection,config,amazon);
 const output=path.resolve(args[1]);await mkdir(output,{mode:0o700});await chmod(output,0o700);await writeFile(path.join(output,'readiness.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({prepared:true,canExecute:false,canIssueScope:false,missing:result.missing.length,networkRequests:0}));
}
void main().catch(()=>{console.error('Local readiness preparation stopped; no hosted action attempted.');process.exitCode=1;});
