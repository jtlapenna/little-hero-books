import assert from 'node:assert/strict';
import path from 'node:path';
import {LocalPreviewDatabase} from '../../scripts/testing/local-preview-database';
async function main(){const db=new LocalPreviewDatabase(),sessions:Array<Awaited<ReturnType<LocalPreviewDatabase['openSession']>>>=[];try{
 db.start(path.resolve(__dirname,'../..'));
 db.sql('CREATE TABLE public.session_probe(id int PRIMARY KEY,val int);INSERT INTO public.session_probe VALUES(1,0)');
 for(let i=0;i<3;i++)sessions.push(await db.openSession());
 assert.equal(await sessions[0].query("SELECT 'LHL_SQL_END_2'"),'LHL_SQL_END_2');
 assert.equal(await sessions[0].query("SELECT repeat('é🧒',32768)"),'é🧒'.repeat(32768));
 assert.deepEqual(await Promise.all([sessions[0].query('SELECT 11'),sessions[0].query('SELECT 22')]),['11','22']);
 const results=await Promise.all([sessions[0].query('UPDATE public.session_probe SET val=val+1 WHERE id=1 RETURNING val'),sessions[1].query('UPDATE public.session_probe SET val=val+1 WHERE id=1 RETURNING val')]);assert.deepEqual(results.sort(),['1','2']);
 const peerRole=await sessions[1].query('SELECT current_user');assert.notEqual(peerRole,'service_role');
 assert.equal(await sessions[0].query('SET ROLE service_role;SELECT current_user'),'service_role');assert.equal(await sessions[1].query('SELECT current_user'),peerRole);
 await assert.rejects(()=>sessions[2].query('SELECT missing_column FROM public.session_probe'),/Local psql session ended/);
 await assert.rejects(()=>sessions[2].query('SELECT 99'),/closed/);
 assert.equal(await sessions[1].query('SELECT 33'),'33');
 console.log(JSON.stringify({passed:true,checks:['literal marker-like result preserved','multichunk UTF-8 preserved','same session serialization','independent concurrent SQL writers','role isolated per connection','SQL error fails closed','healthy session survives peer failure'],sessions:3}));
 }finally{await Promise.all(sessions.map(s=>s.close()));db.close();}}
void main().catch(e=>{console.error(e);process.exitCode=1;});
