/** Disposable Unix-socket PostgreSQL for local tests. Never accepts a connection URL. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import path from 'node:path';
export const quote = (v: unknown) => "'" + String(v).replaceAll("'", "''") + "'";
export class LocalPreviewDatabase {
  readonly directory = mkdtempSync(path.join(tmpdir(), 'lhl-local-preview-'));
  readonly pg = process.env.LHL_TEST_PG_BIN || process.env.GELATO_TEST_PG_BIN || '/usr/local/opt/postgresql@17/bin';
  private running = false;
  private container: string | null = null;
  start(root: string, fullPrintSchema = false) {
    if (process.env.LHL_TEST_POSTGRES_DOCKER_IMAGE) {
      assert.equal(process.env.LHL_TEST_POSTGRES_DOCKER_IMAGE, 'postgres:17', 'Only the cached official PostgreSQL17 image is supported');
      this.container = execFileSync('docker', ['run','--rm','-d','--pull=never','--network=none','--memory=256m','--cpus=1','--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17','-c','listen_addresses=','-c','max_connections=10'], {encoding:'utf8',timeout:15000}).trim();
      assert.match(this.container, /^[a-f0-9]{64}$/);
      const end=Date.now()+15000; let ready=false;
      while(Date.now()<end) { try { const log=execFileSync('docker',['logs',this.container],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:1000}); if (!log.includes('PostgreSQL init process complete; ready for start up.')) continue; execFileSync('docker',['exec',this.container,'pg_isready','-U','postgres'],{stdio:'ignore',timeout:1000}); ready=true; break; } catch {} }
      assert(ready, 'Disposable PostgreSQL container did not become ready');
    } else {
      this.run('initdb', ['-D', path.join(this.directory,'data'), '--auth=trust', '--no-locale', '--set=shared_memory_type=mmap', '--set=dynamic_shared_memory_type=mmap', '--set=max_connections=10', '--set=shared_buffers=1MB']);
      this.run('pg_ctl', ['-D',path.join(this.directory,'data'),'-l',path.join(this.directory,'server.log'),'-o',`-k ${this.directory} -h '' -p 55468`,'-w','start']); this.running=true;
    }
    if (fullPrintSchema) {
      const setup = readFileSync(path.join(root,'back-end/scripts/test-gelato-print-submissions.sh'),'utf8').match(/<<'SQL'\n([\s\S]*?)\nSQL/);
      assert(setup, 'Existing schema setup fixture missing'); this.sql(setup[1]);
      this.sql(`ALTER TABLE public.orders
        ADD COLUMN order_id text, ADD COLUMN updated_at timestamptz,
        ADD COLUMN manifest_3_url text, ADD COLUMN customer_approval_status text,
        ADD COLUMN customer_approval_required boolean, ADD COLUMN revision_count integer DEFAULT 0,
        ADD COLUMN workflow_step text, ADD COLUMN review_stages jsonb,
        ADD COLUMN lulu_job_id text, ADD COLUMN lulu_status text,
        ADD COLUMN customer_approval_approved_at timestamptz, ADD COLUMN human_approved boolean,
        ADD COLUMN human_reviewed_at timestamptz, ADD COLUMN human_reviewer text,
        ADD COLUMN rejection_history jsonb, ADD COLUMN qa_notes text, ADD COLUMN regeneration_instructions text;
        CREATE TABLE public.preview_tokens(token text PRIMARY KEY,order_id text NOT NULL,used_at timestamptz,expires_at timestamptz NOT NULL);
        ALTER TABLE public.preview_tokens ENABLE ROW LEVEL SECURITY;`);
      for (const file of ['migration-print-provider-fields.sql','migration-gelato-engineering-notification-suppression.sql','migration-gelato-scoped-engineering-windows.sql','migration-gelato-engineering-conversions.sql','20261016203550_lhl_printer_file_authority.sql','20261017200507_gelato_scheduled_status.sql','20261017201742_gelato_financial_observations.sql']) {
        const source=readFileSync(path.join(root,'database',file),'utf8');this.sql(source);this.sql(source);
      }
    } else {
    this.sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE public.orders(id bigint PRIMARY KEY,"orderId" text UNIQUE,order_id text,root_order_id text,amazon_order_id text,
       updated_at timestamptz,manifest_3_url text,customer_approval_status text,customer_approval_required boolean,revision_count int DEFAULT 0,
       execution_status text,workflow_step text,current_workflow text,started_at timestamptz,review_stages jsonb,print_provider text,print_claim_token uuid,print_submission_id uuid,lulu_job_id text,lulu_status text,
       customer_approval_approved_at timestamptz,next_workflow text,human_approved boolean,human_reviewed_at timestamptz,human_reviewer text,
       rejection_history jsonb,qa_notes text,regeneration_instructions text);
      CREATE TABLE public.preview_tokens(token text PRIMARY KEY,order_id text NOT NULL,used_at timestamptz,expires_at timestamptz NOT NULL);
      CREATE TABLE public.print_provider_submissions(id uuid PRIMARY KEY,provider text,send_started_at timestamptz);
      CREATE TABLE public.print_provider_submission_items(submission_id uuid,child_order_id bigint REFERENCES public.orders(id));
      GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
      ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY; ALTER TABLE public.preview_tokens ENABLE ROW LEVEL SECURITY;`);
    }
    const files = readdirSync(path.join(root,'database')).filter(name=>name.endsWith('_customer_preview_actions.sql')).map(name=>path.join(root,'database',name));
    assert.equal(files.length,1); this.sql(readFileSync(files[0],'utf8')); this.sql(readFileSync(files[0],'utf8'));
  }
  private run(command: string, args: string[]) { return execFileSync(path.join(this.pg,command),args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:15000}); }
  sql(source: string): string {
    if (this.container) return execFileSync('docker',['exec','-i',this.container,'psql','-X','-q','-At','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:source,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:15000}).trim();
    return execFileSync(path.join(this.pg,'psql'),['-X','-q','-At','-h',this.directory,'-p','55468','-U',userInfo().username,'-d','postgres','-v','ON_ERROR_STOP=1'],{input:source,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:15000}).trim();
  }
  async sqlAsync(source: string): Promise<string> {
    const { execFile } = await import('node:child_process');
    if(this.container) return new Promise((resolve,reject)=>execFile('docker',['exec',this.container!,'psql','-X','-q','-At','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',source],{timeout:15000},(error,out)=>error?reject(error):resolve(out.trim())));
    return new Promise((resolve,reject) => execFile(path.join(this.pg,'psql'),['-X','-q','-At','-h',this.directory,'-p','55468','-U',userInfo().username,'-d','postgres','-v','ON_ERROR_STOP=1','-c',source],{timeout:15000},(error,out)=>error?reject(error):resolve(out.trim())));
  }
  /** Persistent local psql connection for timed integration probes; no hosted URL accepted.
   * Each connection serializes its own queries; callers may open several for real SQL races.
   */
  async openSession() {
    const {spawn}=await import('node:child_process');
    const args=['-X','-q','-At','-v','ON_ERROR_STOP=1'];
    const child=this.container
      ? spawn('docker',['exec','-i',this.container,'psql',...args,'-U','postgres','-d','postgres'],{stdio:['pipe','pipe','pipe']})
      : spawn(path.join(this.pg,'psql'),[...args,'-h',this.directory,'-p','55468','-U',userInfo().username,'-d','postgres'],{stdio:['pipe','pipe','pipe']});
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    let closed=false, queue=Promise.resolve(), activeReject:((error:Error)=>void)|undefined;
    let stderr='';child.stderr.on('data',(chunk:string)=>{stderr=(stderr+chunk.toString()).slice(-4096);});
    const failed=(error:Error)=>{closed=true;activeReject?.(error);};
    child.on('error',failed);child.on('exit',code=>failed(Error('Local psql session ended: '+code+' '+stderr)));
    const query=(source:string):Promise<string>=>{
      const run=()=>new Promise<string>((resolve,reject)=>{
        if(closed){reject(Error('Local psql session is closed'));return;}
        const marker='LHL_SQL_END_'+randomUUID().replaceAll('-',''), chunks:string[]=[];
        let timer:ReturnType<typeof setTimeout>;
        const cleanup=()=>{clearTimeout(timer);child.stdout.off('data',data);activeReject=undefined;};
        const fail=(error:Error)=>{cleanup();reject(error);};activeReject=fail;
        const data=(chunk:string)=>{
          chunks.push(chunk.toString());const output=chunks.join('');
          const lines=output.split(/\r?\n/),end=lines.indexOf(marker);if(end<0)return;
          cleanup();resolve(lines.slice(0,end).join('\n').trim());
        };
        child.stdout.on('data',data);
        timer=setTimeout(()=>{closed=true;child.kill();fail(Error('Local psql query timed out'));},15000);
        child.stdin.write(source+';\n\\echo '+marker+'\n',error=>{if(error)fail(error);});
      });
      const result=queue.then(run);queue=result.then(()=>undefined,()=>undefined);return result;
    };
    const close=async()=>{await queue;child.stdin.end();if(!closed)await new Promise<void>(resolve=>{const timer=setTimeout(()=>{child.kill();resolve();},1000);child.once('exit',()=>{clearTimeout(timer);resolve();});});};
    // Warm up process startup before a runtime deadline begins.
    assert.equal(await query('SELECT 1'),'1');
    return {query,close};
  }
  row() { return JSON.parse(this.sql('SELECT to_jsonb(o) FROM public.orders o WHERE id=1')) as Record<string,unknown>; }
  reset() {
    this.sql(`TRUNCATE public.print_provider_submission_items,public.print_provider_submissions,public.orders,public.preview_tokens;
     INSERT INTO public.orders(id,"orderId",root_order_id,updated_at,manifest_3_url,customer_approval_status,customer_approval_required,revision_count,execution_status,workflow_step,review_stages)
     VALUES(1,'LOCAL-WEB-1','LOCAL-WEB-1',now(),'book/orders/LOCAL-WEB-1/manifests/3-manifest.json','pending',true,0,'done','customer_approval','{"postPdf":{"status":"approved"}}');
     INSERT INTO public.preview_tokens(token,order_id,expires_at) VALUES('local-preview-link-A','LOCAL-WEB-1',now()+interval '1 day'),('local-preview-link-B','LOCAL-WEB-1',now()+interval '1 day');`);
  }
  close() { if(this.container) { execFileSync('docker',['rm','--force',this.container],{stdio:'pipe',timeout:15000}); this.container=null; } if(this.running) this.run('pg_ctl',['-D',path.join(this.directory,'data'),'-m','immediate','-w','stop']); this.running=false; rmSync(this.directory,{recursive:true,force:true}); }
}
