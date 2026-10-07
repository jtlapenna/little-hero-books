const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),ops=path.join(__dirname,'ops-apply-configured-book-workflows.cjs');
const targets=[['HduzTWm0ekmrvwrn','w2A-Orchestrator.repo-centric.json'],['4fxha79xAEaYEBYb','w2B-sw1-single-pose.repo-centric.json'],['D4rQ0zJG8JlKhZqq','w3-Book-Assembly.repo-centric.json']];
async function run(mode){
 const dir=fs.mkdtempSync(os.tmpdir()+'/lhl-rollout-check-'),workflows=new Map(targets.map(([id,file])=>{const repo=JSON.parse(fs.readFileSync(path.join(root,'docs/n8n-workflow-files/repo-centric/workflows',file)));const nodes=repo.nodes.map(n=>({...n,credentials:{httpHeaderAuth:{id:'fixture-auth',name:'fixture credential'}}}));for(const n of nodes)if(n.parameters.jsCode)n.parameters.jsCode+='\n// Existing version';else if(n.name==='Normalize Pose Scale')n.parameters.jsonBody='old-body';return[id,{id,name:repo.name,nodes,connections:repo.connections,settings:{executionOrder:'v1'},staticData:null,active:true,versionId:'before-'+id,activeVersionId:mode==='unpublished'?'unpublished':'before-'+id}]}));
 const before=structuredClone([...workflows]),writes=[];let sequence=0,failed=false;const reads=new Map();
 const server=http.createServer(async(req,res)=>{const u=new URL(req.url,'http://fixture'),id=u.pathname.split('/')[4],w=workflows.get(id);res.setHeader('Content-Type','application/json');if(req.headers['x-n8n-api-key']!=='fixture-token'||!w){res.writeHead(401);res.end('{}');return}if(req.method==='GET'){
 const count=(reads.get(id)||0)+1;reads.set(id,count);
 if(mode==='deactivated'&&id==='HduzTWm0ekmrvwrn'&&count===2){w.active=false;w.activeVersionId=null;}
 }let body='';for await(const chunk of req)body+=chunk;const input=body?JSON.parse(body):{};if(req.method==='PUT'){writes.push(id);if(['failure','concurrent'].includes(mode)&&id==='D4rQ0zJG8JlKhZqq'&&!failed){failed=true;if(mode==='concurrent'){const first=workflows.get('HduzTWm0ekmrvwrn');first.nodes[0].credentials={httpHeaderAuth:{id:'operator-auth',name:'operator change'}};first.versionId='operator-version';first.activeVersionId='operator-version';}res.writeHead(500);res.end('{}');return}Object.assign(w,input,{versionId:'after-'+(++sequence)});}if(req.method==='POST'&&u.pathname.endsWith('/activate')){w.active=true;w.activeVersionId=w.versionId;}res.end(JSON.stringify(w));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;fs.writeFileSync(dir+'/env',`N8N_API_URL=http://127.0.0.1:${port}\nN8N_API_KEY=fixture-token\n`);
 let output='';const child=spawn(process.execPath,[ops,'--env-file',dir+'/env','--backup-dir',dir+'/backup',...(mode==='plan'?[]:['--apply'])],{env:{...process.env,N8N_API_URL:`http://127.0.0.1:${port}`,N8N_API_KEY:'fixture-token'}});child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);const code=await new Promise(r=>child.on('exit',r));await new Promise(r=>server.close(r));
 assert.ok(!output.includes('fixture-token'));
 if(mode==='success'){
  assert.equal(code,0,output);assert.equal(writes.length,3);
  for(const [id,old]of before){const now=workflows.get(id);assert.deepEqual(now.connections,old.connections);assert.deepEqual(now.settings,old.settings);assert.deepEqual(now.nodes.map(n=>n.credentials),old.nodes.map(n=>n.credentials));assert.equal(now.activeVersionId,now.versionId)}
 }else if(mode==='failure'){
  assert.notEqual(code,0);assert.ok(output.includes('recovered and verified'));
  for(const [id,old]of before){const now=workflows.get(id);assert.deepEqual(now.nodes,old.nodes);assert.deepEqual(now.settings,old.settings);assert.deepEqual(now.connections,old.connections);assert.equal(now.activeVersionId,now.versionId)}
 }else if(mode==='concurrent'){
  assert.notEqual(code,0);assert.ok(output.includes('Recovery needs inspection'));assert.equal(workflows.get('HduzTWm0ekmrvwrn').nodes[0].credentials.httpHeaderAuth.id,'operator-auth');
 }else if(mode==='deactivated'){
  assert.notEqual(code,0);assert.equal(writes.length,0);assert.equal(workflows.get('HduzTWm0ekmrvwrn').active,false);
 }else{assert.equal(writes.length,0);assert.equal(code,mode==='plan'?0:1)}
 console.log(mode,'actual rollout path passed');fs.rmSync(dir,{recursive:true,force:true});
}
(async()=>{for(const mode of ['plan','success','failure','unpublished','concurrent','deactivated'])await run(mode)})().catch(e=>{console.error(e.message);process.exitCode=1});
