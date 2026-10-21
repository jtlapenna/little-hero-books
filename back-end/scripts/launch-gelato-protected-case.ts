/** Dormant operator command. It neither installs workflows nor creates test authority. */
import {launchProtectedCase} from './helpers/gelato-protected-launcher';
const a=process.argv.slice(2);
if(a.length!==5||!['--rehearse','--execute-approved-unpaid'].includes(a[0])||a[1]!=='--context'||a[3]!=='--approved-context-sha256'){
 console.error('Use --rehearse OR --execute-approved-unpaid --context PRIVATE_FILE --approved-context-sha256 REVIEWED_RAW_FILE_HASH');process.exitCode=1;
}else void launchProtectedCase(a[2],a[4],a[0]==='--rehearse'?'rehearse':'execute-approved-unpaid').then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('Protected launch stopped. Do not replay; inspect private journal and independently verify owned closure.');process.exitCode=1;});
