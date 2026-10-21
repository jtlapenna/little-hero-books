/** Private local file contract. Reading/validating a packet grants no hosted authority. */
import {z} from 'zod';
import {lstat,open,realpath} from 'node:fs/promises';
import path from 'node:path';
import {ProtectedRunnerBinding,sha256} from './gelato-protected-runner-adapter';
import {definitionSha256} from './prepare-w1-native-queue';
const hash=z.string().regex(/^[a-f0-9]{64}$/);
export const LaunchContext=z.object({
 schema:z.literal('lhl.protected-launch@1'),
 binding:ProtectedRunnerBinding,bindingSha256:hash,
 approval:z.object({packetSha256:hash,workflowSha256:hash,sourceSha:z.string().regex(/^[a-f0-9]{40}$/),maximumSpendCents:z.literal(0),draftOnly:z.literal(true),customerMessages:z.literal(false)}).strict(),
 credentials:z.object({backend:z.string().min(16),scope:z.string().min(43),intake:z.string().min(16),n8n:z.string().min(16),database:z.string().min(16),cloudflare:z.string().min(16),gelato:z.string().min(16)}).strict(),
 journalRoot:z.string().min(1),
 transport:z.discriminatedUnion('kind',[
  z.object({kind:z.literal('https')}).strict(),
  z.object({kind:z.literal('synthetic-loopback'),origin:z.string().regex(/^http:\/\/127\.0\.0\.1:\d{1,5}$/)}).strict(),
 ]),
}).strict().superRefine((c,issue)=>{
 const hashes=Object.fromEntries(Object.entries(c.binding.workflowBindings).map(([k,w])=>[k,w.definitionSha256]));
 if(definitionSha256(c.binding)!==c.bindingSha256||definitionSha256(c.binding.packet)!==c.approval.packetSha256||definitionSha256(hashes)!==c.approval.workflowSha256||c.binding.packet.sourceSha!==c.approval.sourceSha)issue.addIssue({code:'custom',message:'Approval/binding identity differs'});
 if(c.transport.kind==='synthetic-loopback'&&(c.binding.n8nOrigin!=='https://diagnostic.example.test'||!Object.values(c.credentials).every(v=>v.startsWith('SYNTHETIC-'))))issue.addIssue({code:'custom',message:'Loopback requires synthetic identity and authorities'});
 if(c.transport.kind==='https'&&(!c.binding.n8nOrigin.endsWith('.app.n8n.cloud')||Object.values(c.credentials).some(v=>v.startsWith('SYNTHETIC-'))))issue.addIssue({code:'custom',message:'Hosted launch requires explicit n8n cloud origin and private authorities'});
});
export type Launch=z.infer<typeof LaunchContext>;
export async function privateDirectory(raw:string){
 const directory=path.resolve(raw),s=await lstat(directory);
 if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o777)!==0o700||s.uid!==process.getuid?.()||await realpath(directory)!==directory)throw Error('Private owned canonical 0700 directory required');
 return directory;
}
export async function readLaunchContext(file:string,approvedRawSha256:string){
 if(!/^[a-f0-9]{64}$/.test(approvedRawSha256))throw Error('Exact reviewed private-file digest required');
 const resolved=path.resolve(file);await privateDirectory(path.dirname(resolved));
 const s=await lstat(resolved);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||(s.mode&0o777)!==0o600||s.uid!==process.getuid?.()||s.size>100_000)throw Error('Private owned 0600 file required');
 const fd=await open(resolved,'r');let bytes:Buffer;
 try{const opened=await fd.stat();if(opened.ino!==s.ino||opened.dev!==s.dev)throw Error('Private file changed');bytes=await fd.readFile();}finally{await fd.close();}
 if(bytes.length>100_000||sha256(bytes)!==approvedRawSha256)throw Error('Private launch file is not reviewed');
 const c=LaunchContext.parse(JSON.parse(bytes.toString()));await privateDirectory(c.journalRoot);return c;
}
