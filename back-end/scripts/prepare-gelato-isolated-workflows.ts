/** Local-only compiler. Never reads env/key files or calls a service. */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {prepareIsolatedWorkflows} from './helpers/prepare-gelato-isolated-workflows';
async function main(){
 const args=process.argv.slice(2),opts=new Map<string,string>();
 for(let i=0;i<args.length;i+=2){if(!['--packet','--native-source','--out'].includes(args[i])||!args[i+1]||opts.has(args[i]))throw Error('Use --packet FILE --native-source FILE --out NEW_DIRECTORY');opts.set(args[i],args[i+1]);}
 if(opts.size!==3)throw Error('Local file arguments required');
 const prepared=prepareIsolatedWorkflows(JSON.parse(await readFile(opts.get('--packet')!,'utf8')),JSON.parse(await readFile(opts.get('--native-source')!,'utf8')));
 const out=path.resolve(opts.get('--out')!);await mkdir(out,{mode:0o700});
 const {workflows,...review}=prepared;
 for(const [stage,workflow]of Object.entries(workflows))await writeFile(path.join(out,stage+'.candidate.private.json'),JSON.stringify(workflow,null,2)+'\n',{mode:0o600,flag:'wx'});
 await writeFile(path.join(out,'review.json'),JSON.stringify(review,null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({prepared:true,canInstall:false,canExecute:false,workflowCount:4,networkRequests:0,credentialFilesRead:0}));
}
void main().catch(()=>{console.error('Local isolated preparation failed. No hosted action was attempted.');process.exitCode=1;});
