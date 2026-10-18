import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migration = readFileSync(path.join(root, 'database/20261018042623_lhl_private_order_boundaries.sql'), 'utf8');
const setup = readFileSync(path.join(root, 'database/migration-manifest-support.sql'), 'utf8');
const pg = process.env.LHL_TEST_PG_BIN || '/usr/local/opt/postgresql@17/bin';
const work = mkdtempSync(path.join(tmpdir(), 'lhl-private-order-test-'));
const port = '55461';
let started = false;
let checks = 0;
function run(binary: string, args: string[]) {
  const r = spawnSync(path.join(pg, binary), args, { encoding: 'utf8' });
  assert.equal(r.status, 0, `${binary} failed: ${r.stderr.slice(-1200)}`);
  return r.stdout.trim();
}
function sql(text: string, db = 'postgres', ok = true) {
  const r = spawnSync(path.join(pg, 'psql'), ['-X', '-h', work, '-p', port, '-U', process.env.USER || 'postgres', '-d', db, '-At', '-v', 'ON_ERROR_STOP=1'], { input: text, encoding: 'utf8' });
  if (ok) assert.equal(r.status, 0, r.stderr.slice(-1800));
  else assert.notEqual(r.status, 0, 'Expected failure');
  return r;
}
function check(name: string, test: boolean) { assert(test, name); checks++; }
const functions = ['upsert_from_manifest_2a', 'upsert_from_manifest_2b'].map((name, i) => {
  const definition = setup.match(new RegExp(`CREATE OR REPLACE FUNCTION ${name}\\b[\\s\\S]*?\\$\\$ LANGUAGE plpgsql SECURITY DEFINER[\\s\\S]*?;`))?.[0];
  assert(definition);
  const body = definition.match(/AS\s*\$\$([\s\S]*?)\$\$/)?.[1];
  assert(body);
  assert.equal(createHash('md5').update(body).digest('hex'), ['fde95b0b1d7b493034f8a9d492a24e35', '244d8d7a4f90fc4128fd6acd00282caa'][i]);
  return definition.replace(/\s*SET search_path = pg_catalog, public, pg_temp/, '');
}).join('\n');
const characterTable = setup.match(/CREATE TABLE IF NOT EXISTS character_generations \([\s\S]*?\n\);/)?.[0];
assert(characterTable);
const fingerprint = `SELECT jsonb_build_object('functions',(SELECT jsonb_agg(jsonb_build_object('name',p.proname,'body',md5(p.prosrc),'acl',p.proacl,'config',p.proconfig,'owner',p.proowner) ORDER BY p.proname) FROM pg_proc p WHERE p.oid IN ('public.upsert_from_manifest_2a(text,jsonb)'::regprocedure,'public.upsert_from_manifest_2b(text,jsonb)'::regprocedure)),'tableAcl',(SELECT relacl FROM pg_class WHERE oid='public.orders'::regclass),'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='orders'),'orders',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM public.orders o));`;
try {
  run('initdb', ['-D', path.join(work, 'data'), '--auth=trust', '--no-locale']);
  run('pg_ctl', ['-D', path.join(work, 'data'), '-l', path.join(work, 'server.log'), '-o', `-k ${work} -h '' -p ${port}`, '-w', 'start']); started = true;
  sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
CREATE TABLE public.orders(id integer PRIMARY KEY,character_hash text,manifest_2a_url text,manifest_2b_url text,status text,workflow_step text,next_workflow text,updated_at timestamptz);
INSERT INTO public.orders(id,status) VALUES(1,'synthetic-baseline');
${characterTable}
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.orders TO service_role; GRANT SELECT,INSERT,UPDATE,DELETE ON public.orders TO authenticated;
CREATE POLICY "Authenticated users can view orders" ON public.orders FOR SELECT TO authenticated USING(true);
CREATE POLICY "Authenticated users can modify orders" ON public.orders FOR ALL TO authenticated USING(true) WITH CHECK(true);
${functions}`);
  const before = JSON.parse(sql(fingerprint).stdout.trim());
  sql('CREATE DATABASE bad_column TEMPLATE postgres; CREATE DATABASE bad_schema TEMPLATE postgres; CREATE DATABASE bad_policy TEMPLATE postgres; CREATE DATABASE rollback_test TEMPLATE postgres;');
  sql('CREATE ROLE inherited_column_reader; GRANT inherited_column_reader TO authenticated; GRANT SELECT(id) ON public.orders TO inherited_column_reader;', 'bad_column');
  sql('GRANT CREATE ON SCHEMA public TO authenticated;', 'bad_schema');
  sql('ALTER POLICY "Authenticated users can view orders" ON public.orders USING (id > 0);', 'bad_policy');
  for (const db of ['bad_column','bad_schema','bad_policy']) {
    const baseline = sql(fingerprint, db).stdout;
    sql(migration, db, false);
    check(`${db} rejection rolls back all changes`, sql(fingerprint, db).stdout === baseline);
  }
  const injected = migration.replace(/COMMIT;\s*$/, "DO $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$; COMMIT;");
  sql(injected, 'rollback_test', false);
  check('injected postflight failure atomic rollback', JSON.stringify(JSON.parse(sql(fingerprint, 'rollback_test').stdout.trim())) === JSON.stringify(before));
  sql(migration);
  const after = JSON.parse(sql(fingerprint).stdout.trim());
  check('migration preserves every synthetic order byte', JSON.stringify(before.orders) === JSON.stringify(after.orders));
  check('function bodies and owners unchanged', before.functions.every((f: {name:string;body:string;owner:number}) => after.functions.some((g: {name:string;body:string;owner:number}) => f.name===g.name && f.body===g.body && f.owner===g.owner)));
  check('fixed function search path', after.functions.every((f: {config:string[]}) => f.config.includes('search_path=pg_catalog, public, pg_temp')));
  check('all permissive policies removed', after.policies === null);
  for (const role of ['anon','authenticated']) {
    for (const fn of ['2a','2b']) {
      const r=sql(`SET ROLE ${role}; SELECT public.upsert_from_manifest_${fn}('1','{"entries":[]}');`, 'postgres', false);
      check(`${role} denied ${fn} before mutation`, r.stderr.includes('permission denied for function'));
    }
    for (const statement of ['SELECT * FROM public.orders','UPDATE public.orders SET status=\'unauthorized\'','INSERT INTO public.orders(id) VALUES(99)','DELETE FROM public.orders']) {
      check(`${role} direct table access denied`, sql(`SET ROLE ${role}; ${statement};`,'postgres',false).stderr.includes('permission denied for table'));
    }
  }
  sql(`SET ROLE service_role; INSERT INTO public.orders(id,status) VALUES(2,'service'); SELECT * FROM public.orders; UPDATE public.orders SET status='service-updated' WHERE id=2; DELETE FROM public.orders WHERE id=2;`);
  check('service actual CRUD preserved', sql('SELECT count(*) FROM public.orders;').stdout.trim()==='1');
  sql(`SET ROLE service_role; CREATE TEMP TABLE orders(id integer,status text); INSERT INTO orders VALUES(1,'shadow');
SELECT public.upsert_from_manifest_2a('1','{"characterHash":"synthetic","entries":[{"poseNumber":1,"publicUrl":"https://synthetic.invalid/image"}]}');
SELECT public.upsert_from_manifest_2b('1','{"entries":[{"poseNumber":1,"bgRemovedImageUrl":"https://synthetic.invalid/removed"}]}');`);
  check('actual function bodies resolve public tables despite temp shadow', sql("SELECT (status='2b_review')::text FROM public.orders WHERE id=1;").stdout.trim()==='true');
  check('actual 2a/2b child writes preserved', sql("SELECT (original_image_url='https://synthetic.invalid/image' AND background_removed_url='https://synthetic.invalid/removed')::text FROM public.character_generations WHERE order_id=1 AND pose_number=1;").stdout.trim()==='true');
  sql(`SET ROLE service_role; SELECT public.upsert_from_manifest_2a('1','{"entries":[{"poseNumber":1,"publicUrl":"https://synthetic.invalid/retry"}]}');`);
  check('2a retry conflict updates one existing pose', sql("SELECT (count(*)=1 AND min(original_image_url)='https://synthetic.invalid/retry')::text FROM public.character_generations WHERE order_id=1 AND pose_number=1;").stdout.trim()==='true');
  sql(migration); check('safe replay remains restrictive', true);
  const workflowMigration = readFileSync(path.join(root,'database/20261018045135_lhl_private_workflow_tables.sql'),'utf8');
  const privateTables = ['audit_logs','character_generations','failed_orders','human_review_queue','workflow_execution_logs'];
  for (const table of privateTables) {
    if(table!=='character_generations') sql(`CREATE TABLE public.${table}(id integer PRIMARY KEY,status text); INSERT INTO public.${table} VALUES(1,'synthetic');`);
    sql(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY; GRANT ALL ON public.${table} TO service_role,authenticated;
CREATE POLICY "Authenticated users can view ${table}" ON public.${table} FOR SELECT TO authenticated USING(true);`);
  }
  const auxFingerprint = `SELECT jsonb_build_object('acl',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'acl',c.relacl,'rls',c.relrowsecurity) ORDER BY c.relname) FROM pg_class c WHERE c.oid IN (${privateTables.map(t=>`'public.${t}'::regclass`).join(',')})),'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname) FROM pg_policies p WHERE schemaname='public' AND tablename IN (${privateTables.map(t=>`'${t}'`).join(',')})));`;
  const auxRows = privateTables.map(t=>`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM public.${t} t;`).join('\n');
  const beforeRows = sql(auxRows).stdout;
  for(const db of ['aux_policy','aux_column','aux_service','aux_rls','aux_injected']) sql(`CREATE DATABASE ${db} TEMPLATE postgres;`);
  sql(`ALTER POLICY "Authenticated users can view failed_orders" ON public.failed_orders USING(id>0);`,'aux_policy');
  sql(`GRANT SELECT(id) ON public.failed_orders TO inherited_column_reader;`,'aux_column');
  sql(`REVOKE UPDATE ON public.failed_orders FROM service_role;`,'aux_service');
  sql(`ALTER TABLE public.failed_orders DISABLE ROW LEVEL SECURITY;`,'aux_rls');
  for(const db of ['aux_policy','aux_column','aux_service','aux_rls','aux_injected']) {
    const beforeAux=sql(auxFingerprint,db).stdout;
    const candidate=db==='aux_injected'?workflowMigration.replace(/COMMIT;\s*$/,"DO $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$; COMMIT;"):workflowMigration;
    sql(candidate,db,false);
    check(`${db} rejection atomically preserves all ACLs and policies`,sql(auxFingerprint,db).stdout===beforeAux);
    check(`${db} preserves every synthetic row`,sql(auxRows,db).stdout===beforeRows);
  }
  sql(workflowMigration);
  check('workflow boundary changes no synthetic row bytes',sql(auxRows).stdout===beforeRows);
  for(const table of privateTables) {
    for(const role of ['anon','authenticated']) {
      for(const statement of [`SELECT * FROM public.${table}`,`UPDATE public.${table} SET id=id`,`INSERT INTO public.${table}(id) VALUES(999)`,`DELETE FROM public.${table}`]) {
        check(`${role} ${table} operation denied`,sql(`SET ROLE ${role}; ${statement}`,'postgres',false).stderr.includes('permission denied for table'));
      }
    }
    // No actual production schema assumption: this exercises grants with the synthetic fixture.
    const insert = table==='character_generations' ? `INSERT INTO public.${table}(id,order_id,pose_number) VALUES(999,1,2)` : `INSERT INTO public.${table}(id) VALUES(999)`;
    sql(`SET ROLE service_role; SELECT * FROM public.${table}; ${insert}; UPDATE public.${table} SET id=998 WHERE id=999; DELETE FROM public.${table} WHERE id=998;`);
    check(`service actual CRUD preserved on ${table}`,true);
  }
  check('all five workflow policies removed and RLS kept',sql(`SELECT count(*)=5 AND bool_and(relrowsecurity) FROM pg_class WHERE oid IN (${privateTables.map(t=>`'public.${t}'::regclass`).join(',')});`).stdout.trim()==='t' && JSON.parse(sql(auxFingerprint).stdout).policies===null);
  sql(`SET ROLE service_role; SELECT public.upsert_from_manifest_2a('1','{"entries":[{"poseNumber":1,"publicUrl":"https://synthetic.invalid/private-workflow"}]}'); SELECT public.upsert_from_manifest_2b('1','{"entries":[{"poseNumber":1,"bgRemovedImageUrl":"https://synthetic.invalid/private-result"}]}');`);
  check('actual manifest producer still writes restricted character table',sql(`SELECT (original_image_url='https://synthetic.invalid/private-workflow' AND background_removed_url='https://synthetic.invalid/private-result')::text FROM public.character_generations WHERE order_id=1 AND pose_number=1;`).stdout.trim()==='true');
  sql(workflowMigration); check('workflow restriction safe replay',true);
  // The canonical advisor script must not reopen the five reviewed tables.
  const advisor = readFileSync(path.join(root,'database/migration-security-advisor-rls.sql'),'utf8');
  sql(`CREATE SCHEMA auth; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT current_user::text$$;`);
  for(const table of privateTables) sql(`GRANT SELECT ON public.${table} TO authenticated; CREATE POLICY "Authenticated users can view ${table}" ON public.${table} FOR SELECT TO authenticated USING(true);`);
  sql(advisor);
  check('canonical advisor closes legacy five-table access',privateTables.every(t=>sql(`SELECT NOT has_table_privilege('anon','public.${t}','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('authenticated','public.${t}','SELECT,INSERT,UPDATE,DELETE');`).stdout.trim()==='t'));
  const hardenedBlock = setup.slice(setup.indexOf('-- Internal manifest RPC definitions and ACLs must commit together.')).split('COMMIT;')[0] + 'COMMIT;';
  sql(hardenedBlock);
  check('canonical setup producer keeps both RPCs service-only', sql("SELECT bool_and(NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND has_function_privilege('service_role',p.oid,'EXECUTE') AND 'search_path=pg_catalog, public, pg_temp'=ANY(p.proconfig)) FROM pg_proc p WHERE p.oid IN ('public.upsert_from_manifest_2a(text,jsonb)'::regprocedure,'public.upsert_from_manifest_2b(text,jsonb)'::regprocedure);").stdout.trim()==='t');
  const legacy = readFileSync(path.join(root,'docs/database/fix-supabase-admin-permissions.sql'),'utf8');
  check('deprecated recipe refuses execution', sql(legacy,'postgres',false).stderr.includes('Deprecated insecure'));
  console.log(JSON.stringify({checksPassed:checks,actualOriginalFunctionBodies:true,syntheticOnly:true,providerCalls:0}));
} finally {
  if(started) run('pg_ctl',['-D',path.join(work,'data'),'-m','immediate','-w','stop']);
  rmSync(work,{recursive:true,force:true});
}
