/** Loopback-only coordinator crash fixture. Never accepts a live context. */
import {readLaunchContext} from './gelato-protected-launch-context';
import {launchProtectedCase} from './gelato-protected-launcher';
const [file,digest]=process.argv.slice(2);
void readLaunchContext(file,digest).then(c=>{
 if(c.transport.kind!=='synthetic-loopback')throw Error('Local test context required');
 return launchProtectedCase(file,digest,'rehearse',event=>{process.send?.({kind:event});});
}).then(()=>process.disconnect?.()).catch(()=>{process.exitCode=1;process.disconnect?.();});
