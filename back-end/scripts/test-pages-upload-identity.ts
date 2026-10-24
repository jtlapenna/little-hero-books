/** Offline first slice of upload identity: actual binding writer/parser/reconstruction, no providers. */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, realpath, symlink, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';

async function runtimeInputChecks() {
const { applyGelatoRuntimeBindings, GELATO_RUNTIME_FLAGS, verifyReviewedRuntimeBindingFile } = await import('./prepare-gelato-runtime-bindings.mjs');
const { applyAccessRuntimeBindings, writePreparedRuntimeConfig, verifyPreparedRuntimeBindings } = await import('./prepare-access-runtime-bindings.mjs');
const sourceSha = '1'.repeat(40);
const source = await readFile(resolve('wrangler.toml'), 'utf8');
const flagValues = (value: string) => Object.fromEntries(GELATO_RUNTIME_FLAGS.map((name: string) => [name, value]));
const access = { CF_ACCESS_ISSUER: 'https://synthetic-access.cloudflareaccess.com', CF_ACCESS_AUDIENCE: 'a'.repeat(64),
  ADMIN_SITE_ORIGIN: 'https://admin.littleherolabs.com', ADMIN_ALLOWED_EMAILS: 'jeff@littleherolabs.com,john@littleherolabs.com' };
const hash = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
let checks = 0, externalRequests = 0;
const priorFetch = globalThis.fetch;
globalThis.fetch = async () => { externalRequests++; throw Error('External transport forbidden'); };

async function fixture(flags = flagValues('false')) {
  const folder = await realpath(await mkdtemp(join(tmpdir(), 'lhl-reviewed-runtime-')));
  const configPath = join(folder, 'back-end/wrangler.toml');
  await mkdir(join(folder, 'back-end'), { recursive: true }); await writeFile(configPath, source);
  const prepared = applyAccessRuntimeBindings(applyGelatoRuntimeBindings(source, flags), access);
  writePreparedRuntimeConfig(configPath, prepared, { ...flags, ...access }, sourceSha, source);
  return { folder, configPath, receiptPath: join(folder, 'back-end/.wrangler/lhl-runtime-bindings.json'),
    verify: () => verifyReviewedRuntimeBindingFile({ configPath, sourceSha, committedConfigText: source }) };
}
async function rejects(change: (f: Awaited<ReturnType<typeof fixture>>) => Promise<void>, reason: string) {
  const f = await fixture();
  try { await change(f); await assert.rejects(f.verify, { message: 'Reviewed runtime input verification failed' }, reason); checks++; }
  finally { await rm(f.folder, { recursive: true, force: true }); }
}
async function editReceipt(f: Awaited<ReturnType<typeof fixture>>, change: (r: Record<string, unknown>) => void) {
  const r = JSON.parse(await readFile(f.receiptPath, 'utf8')); change(r); await writeFile(f.receiptPath, JSON.stringify(r));
}

try {
  for (const value of ['false', 'true']) {
    const f = await fixture(flagValues(value));
    try {
      const result = await f.verify();
      assert.equal(result.schema, 'lhl.reviewed-runtime-input@1'); assert.equal(result.sourceSha, sourceSha);
      assert.deepEqual(result.flags, flagValues(value)); assert.equal(result.configSha256, hash(await readFile(f.configPath)));
      assert.equal(result.bindingReceiptSha256, hash(await readFile(f.receiptPath)));
      assert.deepEqual(Object.keys(result).sort(), ['schema','sourceSha','flags','configSha256','bindingReceiptSha256'].sort());
      assert(!JSON.stringify(result).includes(access.CF_ACCESS_ISSUER)); assert(!JSON.stringify(result).includes(access.ADMIN_ALLOWED_EMAILS)); checks++;
    } finally { await rm(f.folder, { recursive: true, force: true }); }
  }
  await rejects(async f => {
    const changed = (await readFile(f.configPath, 'utf8')).replace('compatibility_date = "2024-11-01"', 'compatibility_date = "2025-01-01"');
    await writeFile(f.configPath, changed); await editReceipt(f, r => { r.configSha256 = hash(changed); });
    // This is the actual gap: the existing generic verifier accepts co-edited unrelated bytes.
    verifyPreparedRuntimeBindings(f.configPath, sourceSha);
  }, 'co-edited unrelated config/receipt');
  await rejects(async f => { await writeFile(f.configPath, (await readFile(f.configPath, 'utf8')) + '\n# unreviewed byte change\n'); }, 'changed config');
  await rejects(async f => { await editReceipt(f, r => { r.sourceSha = '2'.repeat(40); }); }, 'wrong source');
  await rejects(async f => { await editReceipt(f, r => { r.unexpected = 'SYNTHETIC'; }); }, 'extra receipt field');
  await rejects(async f => { await editReceipt(f, r => { (r.expected as Record<string, unknown>).UNREVIEWED = 'SYNTHETIC'; }); }, 'extra expected field');
  await rejects(async f => { await editReceipt(f, r => { delete (r.expected as Record<string, unknown>).GELATO_CANCEL_ENABLED; }); }, 'missing flag');
  await rejects(async f => { await editReceipt(f, r => { (r.expected as Record<string, unknown>).GELATO_CANCEL_ENABLED = true; }); }, 'non-string flag');
  await rejects(async f => { await editReceipt(f, r => { (r.expected as Record<string, unknown>).CF_ACCESS_ISSUER = 'https://wrong.example.test'; }); }, 'invalid access metadata');
  await rejects(async f => { await writeFile(f.receiptPath, 'not JSON SYNTHETIC'); }, 'malformed receipt');
  await rejects(async f => { await writeFile(f.receiptPath, 'SYNTHETIC'.repeat(150000)); }, 'oversized receipt');
  for (const name of ['configPath', 'receiptPath'] as const) {
    await rejects(async f => {
      const original = await readFile(f[name]); const target = join(f.folder, 'synthetic-link-target'); await writeFile(target, original);
      await rm(f[name]); await symlink(target, f[name]);
    }, name + ' symlink');
    await rejects(async f => { await link(f[name], join(f.folder, 'synthetic-hardlink')); }, name + ' hardlink');
  }
  const f = await fixture();
  try {
    for (const bad of ['', 'not-a-commit']) {
      await assert.rejects(() => verifyReviewedRuntimeBindingFile({ configPath: f.configPath, sourceSha: bad, committedConfigText: source }), { message: 'Reviewed runtime input verification failed' }); checks++;
    }
    await assert.rejects(() => verifyReviewedRuntimeBindingFile({ configPath: f.configPath, sourceSha, committedConfigText: source.replace('name = "little-hero-labs-admin"', 'name = "wrong"') }), { message: 'Reviewed runtime input verification failed' }); checks++;
  } finally { await rm(f.folder, { recursive: true, force: true }); }
  assert.equal(externalRequests, 0);
  console.log(JSON.stringify({ checks, externalRequests, syntheticFixtures: true,
    actualRuntimeWriterParserAndVerifiers: true, coeditedConfigOldVerifierAcceptsNewVerifierRejects: true,
    scope: 'Reviewed runtime configuration slice only; package/build/upload identity and deployed proof remain pending' }));
} finally { globalThis.fetch = priorFetch; }

}



async function producerChecks() {
  const { uploadContext, parseTrackedTree, reviewedGitTree, observedPackage, createUploadObservation, saveUploadObservation } = await import('./create-pages-upload-identity.js');
  const { applyGelatoRuntimeBindings, GELATO_RUNTIME_FLAGS } = await import('./prepare-gelato-runtime-bindings.mjs');
  const { applyAccessRuntimeBindings, writePreparedRuntimeConfig } = await import('./prepare-access-runtime-bindings.mjs');
  const { execFileSync } = await import('node:child_process');
  const { chmod } = await import('node:fs/promises');
  const sha = '1'.repeat(40);
  const contextEnv = (source = sha): NodeJS.ProcessEnv => ({ REVIEWED_SOURCE_SHA: source, GITHUB_SHA: source,
    GITHUB_WORKFLOW_SHA: source, GITHUB_REPOSITORY: 'jtlapenna/little-hero-books', GITHUB_REF: 'refs/heads/main',
    GITHUB_WORKFLOW_REF: 'jtlapenna/little-hero-books/.github/workflows/deploy-cloudflare-pages.yml@refs/heads/main',
    GITHUB_JOB: 'deploy', GITHUB_EVENT_NAME: 'workflow_dispatch', DEPLOY_ENVIRONMENT: 'production',
    CLOUDFLARE_PAGES_PROJECT: 'little-hero-labs-admin', GITHUB_RUN_ID: '123456', GITHUB_RUN_ATTEMPT: '1' });
  let metadataCases = 0, nativeCases = 0;
  assert.deepEqual(Object.keys(uploadContext(contextEnv())).sort(), ['repository','ref','workflow','job','sourceSha','runId','runAttempt'].sort()); metadataCases++;
  for (const [name, value] of Object.entries({ REVIEWED_SOURCE_SHA: '', GITHUB_SHA: '2'.repeat(40),
    GITHUB_WORKFLOW_SHA: '2'.repeat(40), GITHUB_REPOSITORY: 'wrong/repository', GITHUB_REF: 'refs/heads/wrong',
    GITHUB_WORKFLOW_REF: 'wrong', GITHUB_JOB: 'wrong', GITHUB_EVENT_NAME: 'push', DEPLOY_ENVIRONMENT: 'preview',
    CLOUDFLARE_PAGES_PROJECT: 'wrong', GITHUB_RUN_ID: '0', GITHUB_RUN_ATTEMPT: '01' })) {
    assert.throws(() => uploadContext({ ...contextEnv(), [name]: value }), { message: 'Pages upload input verification failed' }); metadataCases++;
  }
  const row = (path = 'valid.txt', mode = '100644') => Buffer.from(`${mode} blob ${sha}\t${path}\0`);
  assert.deepEqual(parseTrackedTree(row()), [{ path: 'valid.txt', mode: '100644', blob: sha }]); metadataCases++;
  for (const raw of [Buffer.alloc(0), row().subarray(0, -1), Buffer.concat([row(),row()]),
    row('../escape'), row('/escape'), row('folder//file'), row('a\\b'), row('a\nname'),
    row('link','120000'), row('module','160000'), Buffer.from([0xff,0])]) {
    assert.throws(() => parseTrackedTree(raw)); metadataCases++;
  }
  const git = (folder: string, args: string[]) => execFileSync('git', ['-C', folder, ...args], {
    encoding: 'utf8', env: { PATH: '/usr/bin:/bin', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'Synthetic fixture', GIT_COMMITTER_NAME: 'Synthetic fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_EMAIL: 'fixture@example.invalid', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'commit.gpgsign', GIT_CONFIG_VALUE_0: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'] });
  let portableGitCases = 0;
  async function gitMetadataFixture(change?: (folder: string) => Promise<void>) {
    const folder = await realpath(await mkdtemp(join(tmpdir(),'lhl-git-tree-fixture-')));
    try {
      await mkdir(join(folder,'back-end')); await writeFile(join(folder,'back-end/wrangler.toml'),'SYNTHETIC_CONFIG');
      await writeFile(join(folder,'tracked.txt'),'SYNTHETIC_SOURCE');
      git(folder,['init','--quiet']); git(folder,['add','.']); git(folder,['commit','--quiet','-m','Synthetic metadata fixture']);
      const source = git(folder,['rev-parse','HEAD']).trim();
      if (change) { await change(folder); assert.throws(() => reviewedGitTree(folder,source), {message:'Pages upload input verification failed'}); }
      else { assert.equal(reviewedGitTree(folder,source).entries.length,2); }
      portableGitCases++;
    } finally { await rm(folder,{recursive:true,force:true}); }
  }
  await gitMetadataFixture();
  await gitMetadataFixture(async folder => { await writeFile(join(folder,'staged.txt'),'UNREVIEWED'); git(folder,['add','staged.txt']);
    assert.equal(git(folder,['ls-files','--others','--exclude-standard']).trim(),''); });
  await gitMetadataFixture(async folder => { await writeFile(join(folder,'tracked.txt'),'ALTERED'); git(folder,['add','tracked.txt']); });
  await gitMetadataFixture(async folder => { await rm(join(folder,'tracked.txt')); git(folder,['add','-u']); });
  // Exercise the actual CLI entry/failure redaction on every host before native-only cases.
  const failedCliFolder=await realpath(await mkdtemp(join(tmpdir(),'lhl-observer-cli-invalid-')));
  try {
    await mkdir(join(failedCliFolder,'back-end'));
    const { spawnSync }=await import('node:child_process');const { pathToFileURL }=await import('node:url');
    const result=spawnSync(process.execPath,['--import',pathToFileURL(require.resolve('tsx')).href,resolve('scripts/create-pages-upload-identity.ts')],{
      cwd:join(failedCliFolder,'back-end'),env:{PATH:'/usr/bin:/bin',NODE_ENV:'test',CI:'true',WRANGLER_SEND_METRICS:'false',GITHUB_SHA:'SYNTHETIC_DO_NOT_LOG'},encoding:'utf8',timeout:60000});
    assert.equal(result.status,1);assert.equal(result.stdout,'');assert.equal(result.stderr.trim(),'Pages upload input verification failed');portableGitCases++;
  } finally { await rm(failedCliFolder,{recursive:true,force:true}); }
  if (process.platform !== 'linux') {
    const folder = await realpath(await mkdtemp(join(tmpdir(), 'lhl-unsupported-host-')));
    try { assert.throws(() => observedPackage(folder), { message: 'Pages upload input verification failed' }); }
    finally { await rm(folder, { recursive: true, force: true }); }
    console.log(JSON.stringify({ metadataCases, portableGitCases, nativeCases, nativeStatus: 'SKIPPED unsupported host; Linux descriptor contract explicitly fails closed',
      scope: 'No native source/package, actual build, upload or provider proof' }));
    return;
  }
  const source = await readFile(resolve('wrangler.toml'), 'utf8');
  async function fixture() {
    const folder = await realpath(await mkdtemp(join(tmpdir(), 'lhl-upload-identity-')));
    await mkdir(join(folder, 'back-end'), { recursive: true });
    await writeFile(join(folder, '.gitignore'), 'back-end/.open-next/\nback-end/.wrangler/\n');
    await writeFile(join(folder, 'back-end/wrangler.toml'), source); await writeFile(join(folder, 'tracked.txt'), 'SYNTHETIC_SOURCE');
    await writeFile(join(folder,'executable.sh'),'SYNTHETIC_EXECUTABLE'); await chmod(join(folder,'executable.sh'),0o755);
    git(folder, ['init','--quiet']); git(folder, ['add','.']); git(folder, ['commit','--quiet','-m','Synthetic offline fixture']);
    const sourceSha = git(folder,['rev-parse','HEAD']).trim();
    const flags = Object.fromEntries(GELATO_RUNTIME_FLAGS.map(name => [name,'false']));
    const access = { CF_ACCESS_ISSUER: 'https://synthetic-access.cloudflareaccess.com', CF_ACCESS_AUDIENCE: 'a'.repeat(64),
      ADMIN_SITE_ORIGIN: 'https://admin.littleherolabs.com', ADMIN_ALLOWED_EMAILS: 'jeff@littleherolabs.com,john@littleherolabs.com' };
    const prepared = applyAccessRuntimeBindings(applyGelatoRuntimeBindings(source,flags),access);
    writePreparedRuntimeConfig(join(folder,'back-end/wrangler.toml'),prepared,{...flags,...access},sourceSha,source);
    const packageRoot = join(folder,'back-end/.open-next/cloudflare');
    for (const name of ['_worker.js','access-boundary.mjs','cloudflare/init.js','cloudflare/images.js','cloudflare/skew-protection.js',
      'cloudflare/next-env.mjs','middleware/handler.mjs','server-functions/default/handler.mjs']) {
      await mkdir(join(packageRoot,dirname(name)),{recursive:true}); await writeFile(join(packageRoot,name),'SYNTHETIC_BUILD_INPUT');
    }
    await mkdir(join(packageRoot,'assets'),{recursive:true});
    await writeFile(join(packageRoot,'_routes.json'),JSON.stringify({version:1,include:['/*'],exclude:['/_next/static/*','/favicon.ico']}));
    return { folder, packageRoot, verify: () => createUploadObservation(folder,contextEnv(sourceSha)) };
  }
  async function reject(change: (f: Awaited<ReturnType<typeof fixture>>) => Promise<void>) {
    const f = await fixture();
    try { await change(f); await assert.rejects(f.verify,{message:'Pages upload input verification failed'}); nativeCases++; }
    finally { await rm(f.folder,{recursive:true,force:true}); }
  }
  const valid = await fixture();
  const outside = await realpath(await mkdtemp(join(tmpdir(),'lhl-upload-receipt-')));
  try {
    const a = await valid.verify(), b = await valid.verify(); assert.deepEqual(a,b); assert.equal(a.packageFiles,9);
    assert.equal(a.boundary,'observed-before-dispatch'); assert.equal(a.trackedFiles,4);
    assert(!JSON.stringify(a).includes('SYNTHETIC_BUILD_INPUT')); assert(!JSON.stringify(a).includes('cloudflareaccess.com')); nativeCases++;
    const path = saveUploadObservation(valid.folder,outside,a); assert.deepEqual(JSON.parse(await readFile(path,'utf8')),a);
    assert.throws(() => saveUploadObservation(valid.folder,outside,a)); nativeCases++;
    assert.throws(() => saveUploadObservation(valid.folder,valid.packageRoot,a)); nativeCases++;
  } finally { await rm(valid.folder,{recursive:true,force:true}); await rm(outside,{recursive:true,force:true}); }
  await reject(async f => { await writeFile(join(f.folder,'tracked.txt'),'ALTERED'); });
  await reject(async f => { git(f.folder,['update-index','--assume-unchanged','tracked.txt']); await writeFile(join(f.folder,'tracked.txt'),'ALTERED'); });
  await reject(async f => { await chmod(join(f.folder,'tracked.txt'),0o755); });
  await reject(async f => { await chmod(join(f.folder,'executable.sh'),0o645); });
  await reject(async f => { await writeFile(join(f.folder,'staged.ts'),'UNREVIEWED'); git(f.folder,['add','staged.ts']); });
  await reject(async f => { await writeFile(join(f.folder,'untracked.txt'),'UNTRACKED'); });
  await reject(async f => { await rm(join(f.packageRoot,'_worker.js')); });
  await reject(async f => { await writeFile(join(f.packageRoot,'_routes.json'),JSON.stringify({version:1,include:['/*'],exclude:['/api/*']})); });
  await reject(async f => { await symlink(join(f.folder,'tracked.txt'),join(f.packageRoot,'linked.js')); });
  await reject(async f => { await link(join(f.packageRoot,'_worker.js'),join(f.packageRoot,'hardlinked.js')); });
  await reject(async f => { await symlink(join(f.folder,'back-end'),join(f.packageRoot,'directory-link')); });
  await reject(async f => { await writeFile(join(f.packageRoot,'.env.fixture'),'SYNTHETIC'); });
  // Interpose only the local filesystem in disposable fixtures; production has no test hooks.
  const nativeFs = (await import('node:fs')).default;
  const { syncBuiltinESMExports } = await import('node:module');
  for (const mutation of ['package','source','config','receipt'] as const) {
    const f = await fixture(); let rootReads = 0, changed = false;
    const original = nativeFs.readdirSync;
    try {
      const spy = (...args: Parameters<typeof original>) => {
        const result = Reflect.apply(original,nativeFs,args) as ReturnType<typeof original>;
        if (nativeFs.realpathSync(String(args[0])) === f.packageRoot && ++rootReads === 2) {
          // This runs after the first package's last file read, before the second observation.
          if (mutation === 'package') nativeFs.writeFileSync(join(f.packageRoot,'_worker.js'),'CHANGED_BETWEEN_OBSERVATIONS');
          if (mutation === 'source') nativeFs.writeFileSync(join(f.folder,'tracked.txt'),'CHANGED_BETWEEN_OBSERVATIONS');
          const receiptPath = join(f.folder,'back-end/.wrangler/lhl-runtime-bindings.json');
          if (mutation === 'receipt') nativeFs.appendFileSync(receiptPath,' ');
          if (mutation === 'config') {
            const configPath = join(f.folder,'back-end/wrangler.toml');
            const text = nativeFs.readFileSync(configPath,'utf8').replace('GELATO_CANCEL_ENABLED = "false"','GELATO_CANCEL_ENABLED = "true"');
            const receipt = JSON.parse(nativeFs.readFileSync(receiptPath,'utf8'));receipt.expected.GELATO_CANCEL_ENABLED='true';
            receipt.configSha256=createHash('sha256').update(text).digest('hex');nativeFs.writeFileSync(configPath,text);nativeFs.writeFileSync(receiptPath,JSON.stringify(receipt));
          }
          changed = true;
        }
        return result;
      };
      nativeFs.readdirSync = spy as typeof original; syncBuiltinESMExports();
      await assert.rejects(f.verify,{message:'Pages upload input verification failed'});assert.equal(changed,true);nativeCases++;
    } finally { nativeFs.readdirSync=original;syncBuiltinESMExports();await rm(f.folder,{recursive:true,force:true}); }
  }
  const cli = await fixture(), runner = await realpath(await mkdtemp(join(tmpdir(),'lhl-observer-cli-')));
  try {
    const { pathToFileURL } = await import('node:url'); const { spawnSync } = await import('node:child_process');
    const sourceSha = git(cli.folder,['rev-parse','HEAD']).trim();
    const environment = { ...contextEnv(sourceSha), PATH:'/usr/bin:/bin',HOME:runner,TMPDIR:runner,NODE_ENV:'test',CI:'true',WRANGLER_SEND_METRICS:'false',RUNNER_TEMP:runner };
    const args=['--import',pathToFileURL(require.resolve('tsx')).href,resolve('scripts/create-pages-upload-identity.ts')];
    const first=spawnSync(process.execPath,args,{cwd:join(cli.folder,'back-end'),env:environment,encoding:'utf8',timeout:60000});
    assert.equal(first.status,0,first.stderr);assert.equal(first.stdout.trim(),'Recorded sanitized Pages upload input observation');
    const receiptPath=join(runner,'lhl-pages-upload-input.json'),receipt=await readFile(receiptPath,'utf8');
    assert.equal(JSON.parse(receipt).schema,'lhl.pages-upload-input@1');nativeCases++;
    const repeat=spawnSync(process.execPath,args,{cwd:join(cli.folder,'back-end'),env:environment,encoding:'utf8',timeout:60000});
    assert.equal(repeat.status,1);assert.equal(repeat.stderr.trim(),'Pages upload input verification failed');assert.equal(await readFile(receiptPath,'utf8'),receipt);nativeCases++;
    const bad=spawnSync(process.execPath,args,{cwd:join(cli.folder,'back-end'),env:{...environment,GITHUB_SHA:'SYNTHETIC_DO_NOT_LOG'},encoding:'utf8',timeout:60000});
    assert.equal(bad.status,1);assert.equal(bad.stderr.trim(),'Pages upload input verification failed');assert(!bad.stderr.includes('SYNTHETIC_DO_NOT_LOG'));nativeCases++;
  } finally { await rm(cli.folder,{recursive:true,force:true});await rm(runner,{recursive:true,force:true}); }

  console.log(JSON.stringify({ metadataCases,portableGitCases,nativeCases,nativeStatus:'PASS synthetic Linux descriptor/Git/package fixtures',
    scope:'No actual Next build, upload, provider execution or deployed proof' }));
}




async function builtPackageChecks() {
  assert.equal(process.platform,'linux','Actual producer/build integration requires native Linux, never a skipped pass');
  assert.equal(process.env.GITHUB_ACTIONS,'true'); assert.equal(process.env.GITHUB_JOB,'backend');
  const { execFileSync } = await import('node:child_process');
  const nativeFs=(await import('node:fs')).default;
  const { createUploadObservation } = await import('./create-pages-upload-identity.js');
  const { applyGelatoRuntimeBindings,GELATO_RUNTIME_FLAGS } = await import('./prepare-gelato-runtime-bindings.mjs');
  const { applyAccessRuntimeBindings,writePreparedRuntimeConfig } = await import('./prepare-access-runtime-bindings.mjs');
  const root=await realpath(resolve('..')),configPath=join(root,'back-end/wrangler.toml'),receiptPath=join(root,'back-end/.wrangler/lhl-runtime-bindings.json');
  const git=(args:string[])=>execFileSync('git',['-C',root,...args],{encoding:'utf8',env:{PATH:'/usr/bin:/bin',GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_OPTIONAL_LOCKS:'0',GIT_NO_LAZY_FETCH:'1'}});
  const sourceSha=git(['rev-parse','HEAD']).trim();assert.equal(sourceSha,process.env.GITHUB_SHA);
  const original=await readFile(configPath,'utf8');assert.equal(original,git(['show',`${sourceSha}:back-end/wrangler.toml`]));
  assert.equal(nativeFs.existsSync(receiptPath),false,'Do not overwrite another preparation receipt');
  const flags=Object.fromEntries(GELATO_RUNTIME_FLAGS.map(name=>[name,'false']));
  const access={CF_ACCESS_ISSUER:'https://synthetic-access.cloudflareaccess.com',CF_ACCESS_AUDIENCE:'a'.repeat(64),ADMIN_SITE_ORIGIN:'https://admin.littleherolabs.com',ADMIN_ALLOWED_EMAILS:'jeff@littleherolabs.com,john@littleherolabs.com'};
  const prepared=applyAccessRuntimeBindings(applyGelatoRuntimeBindings(original,flags),access);
  try {
    writePreparedRuntimeConfig(configPath,prepared,{...flags,...access},sourceSha,original);
    const observed=await createUploadObservation(root,{REVIEWED_SOURCE_SHA:sourceSha,GITHUB_SHA:sourceSha,GITHUB_WORKFLOW_SHA:sourceSha,
      GITHUB_REPOSITORY:'jtlapenna/little-hero-books',GITHUB_REF:'refs/heads/main',GITHUB_JOB:'deploy',GITHUB_EVENT_NAME:'workflow_dispatch',
      GITHUB_WORKFLOW_REF:'jtlapenna/little-hero-books/.github/workflows/deploy-cloudflare-pages.yml@refs/heads/main',
      DEPLOY_ENVIRONMENT:'production',CLOUDFLARE_PAGES_PROJECT:'little-hero-labs-admin',GITHUB_RUN_ID:'123456',GITHUB_RUN_ATTEMPT:'1'});
    assert(observed.packageFiles>9 && observed.packageBytes>1024*1024,'Use actual built output, never replace it with the tiny fixture');
    assert.deepEqual(observed.flags,flags);
    console.log(JSON.stringify({actualBuiltPackage:true,nativeLinux:true,syntheticContext:true,packageFiles:observed.packageFiles,packageBytes:observed.packageBytes,scope:'Same producer on actual build with synthetic job/runtime inputs; no production upload or provider attestation'}));
  } finally {
    await writeFile(configPath,original);await rm(receiptPath,{force:true});
  }
  assert.equal(await readFile(configPath,'utf8'),original);
}

async function mainChecks() {
  const args=process.argv.slice(2);assert(args.length===0 || (args.length===1 && args[0]==='--built-package'),'Unsupported test mode');
  await runtimeInputChecks();await producerChecks();if(args[0]==='--built-package')await builtPackageChecks();
}
void mainChecks().catch(error=>{console.error(error);process.exitCode=1;});
