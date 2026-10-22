/** Corrected local candidate graph probes, no services or credentials. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const file=new URL('./probe-candidates.json',import.meta.url),candidates=JSON.parse(fs.readFileSync(file,'utf8'));
assert.equal(candidates.canExecute,false);assert.equal(candidates.canInstall,false);assert.equal(candidates.candidates.length,4);
const v={present:true,isString:true,isFalse:true,isTrue:false};let checks=0;
for(const c of candidates.candidates){
 const nodes=c.workflow.nodes,http=nodes.filter(n=>n.type.endsWith('.httpRequest'));assert.equal(http.length,1);assert.equal(http[0].parameters.method,'GET');assert.equal(http[0].parameters.url,'https://admin.littleherolabs.com/api/internal/w4/submit-gelato-draft');assert.equal(http[0].retryOnFail,false);assert.equal(http[0].parameters.options.redirect.redirect.followRedirects,false);
 const execute=(name,input)=>vm.runInNewContext('(function(){'+nodes.find(n=>n.name===name).parameters.jsCode+'})()',{$input:{first:()=>({json:input})}},{timeout:100});
 execute('Require Empty Probe',{body:{}});assert.throws(()=>execute('Require Empty Probe',{body:{orderId:'SYNTHETIC-FOREIGN'}}));assert.throws(()=>execute('Require Empty Probe',{body:[]}));checks+=3;
 const result={contextAvailable:true,draftsEnabled:false,cloudflare:v,globalProcess:v,nodeProcess:v};
 const good=JSON.parse(JSON.stringify(execute('Verify Runtime OFF',result)));assert.deepEqual(good,[{json:{runtimeOff:true,backendCredentialAuthenticated:true,scopeCapabilityValidated:false}}]);checks++;
 for(const bad of [{...result,draftsEnabled:true},{...result,contextAvailable:false},{...result,nodeProcess:{...v,isFalse:false}},{}]){assert.throws(()=>execute('Verify Runtime OFF',bad));checks++;}
 for(const n of nodes)if(n.type.endsWith('.httpRequest')||n.type.endsWith('.webhook'))assert(JSON.stringify(n.credentials).includes('__LHL_'));
 assert.equal(c.workflow.settings.saveDataSuccessExecution,'none');assert.equal(c.workflow.settings.saveDataErrorExecution,'none');checks++;
}
console.log(JSON.stringify({checks,candidates:4,externalRequests:0,providerRequests:0,scopeCapabilityValidated:false,passed:true}));
