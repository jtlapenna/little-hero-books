/** File-in/file-out only; deliberately no native API upload or activation mode. */
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import path from 'node:path';
import { prepareW1NativeQueue } from './helpers/prepare-w1-native-queue';
async function main(){
 const args=process.argv.slice(2),options=new Map<string,string>();
 for(let i=0;i<args.length;i+=2){if(!['--snapshot','--expected-sha256','--out'].includes(args[i])||!args[i+1]||options.has(args[i]))throw Error('Use --snapshot FILE --expected-sha256 HASH --out NEW_DIRECTORY');options.set(args[i],args[i+1]);}
 if(options.size!==3)throw Error('Use --snapshot FILE --expected-sha256 HASH --out NEW_DIRECTORY');
 const patch=JSON.parse(await readFile('../docs/n8n-workflow-files/repo-centric/patches/w1-gelato-native-queue.patch.json','utf8'));
 const result=prepareW1NativeQueue(JSON.parse(await readFile(options.get('--snapshot')!,'utf8')),patch,options.get('--expected-sha256')!);
 const out=path.resolve(options.get('--out')!);await mkdir(out,{mode:0o700});
 await writeFile(path.join(out,'candidate.private.json'),JSON.stringify(result.candidate,null,2)+'\n',{mode:0o600,flag:'wx'});
 const {candidate,...review}=result;await writeFile(path.join(out,'review.json'),JSON.stringify(review,null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({prepared:true,canDeploy:false,addedNodes:review.review.addedNodes.length,standaloneCredentialFilesRead:false,networkRequests:0}));
}
void main().catch(()=>{console.error('Local queue preparation failed; no deployment attempted. Inspect inputs locally.');process.exitCode=1});
