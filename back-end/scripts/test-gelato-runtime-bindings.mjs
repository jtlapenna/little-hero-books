import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { unstable_readConfig } from 'wrangler';

const source = await fs.readFile(new URL('../wrangler.toml', import.meta.url), 'utf8');
assert.match(source, /^GELATO_DRAFT_SUBMISSION_ENABLED = "false"$/m, 'Wrangler must declare closed draft binding');
const { GELATO_RUNTIME_FLAGS, prepareGelatoRuntimeBindingFile } = await import('./prepare-gelato-runtime-bindings.mjs');
const sha = 'a'.repeat(40);
const env = { DEPLOY_ENVIRONMENT: 'production', CLOUDFLARE_PAGES_PROJECT: 'little-hero-labs-admin',
  CLOUDFLARE_ACCOUNT_ID: 'b'.repeat(32), CLOUDFLARE_API_TOKEN: 'synthetic-cloudflare-token',
  GITHUB_REF: 'refs/heads/main', GITHUB_SHA: sha };
const access = { CF_ACCESS_ISSUER: 'https://synthetic-binding.cloudflareaccess.com', CF_ACCESS_AUDIENCE: 'a'.repeat(64), ADMIN_SITE_ORIGIN: 'https://admin.littleherolabs.com', ADMIN_ALLOWED_EMAILS: 'jeff@littleherolabs.com,john@littleherolabs.com' };
const accessSettings = Object.fromEntries(Object.entries(access).map(([name,value])=>[name,{type:'plain_text',value}]));
const project = flags => ({ success: true, result: { name: 'little-hero-labs-admin', production_branch: 'main',
  deployment_configs: { production: { env_vars: flags && !Array.isArray(flags) ? {...accessSettings, ...flags} : flags } } } });
const values = Object.fromEntries(GELATO_RUNTIME_FLAGS.map((flag, index) => [flag, { type: 'plain_text', value: index === 0 ? 'true' : 'false' }]));
const expectedSource = Object.entries(access).reduce((text,[name,value])=>text.replace(`${name} = \"\"`,`${name} = ${JSON.stringify(value)}`),source);
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'gelato-runtime-bindings-'));
const configPath = path.join(directory, 'wrangler.toml');
let fetches = 0;
const prepare = async (body, overrides = {}, config = source, fetchImpl) => {
  await fs.writeFile(configPath, config);
  return prepareGelatoRuntimeBindingFile({ env: { ...env, ...overrides }, sourceSha: sha, configPath,
    fetchImpl: fetchImpl ?? (async (url, options) => {
      fetches++;
      assert.equal(url, `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/little-hero-labs-admin`);
      assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
      assert.equal(options.headers.Authorization, 'Bearer synthetic-cloudflare-token');
      assert.ok(options.signal instanceof AbortSignal);
      return new Response(JSON.stringify(body), { status: 200 });
    }) });
};
const reject = async (body, overrides = {}, config = source, fetchImpl) => {
  await assert.rejects(prepare(body, overrides, config, fetchImpl), error => {
    assert.ok(!error.message.includes('sensitive-value'));
    assert.ok(!error.message.includes('synthetic-cloudflare-token'));
    return true;
  });
  assert.equal(await fs.readFile(configPath, 'utf8'), config, 'Invalid preparation must leave config unchanged');
};
try {
  await prepare(project(values));
  assert.equal(await fs.readFile(configPath, 'utf8'), expectedSource.replace('GELATO_DRAFT_SUBMISSION_ENABLED = "false"', 'GELATO_DRAFT_SUBMISSION_ENABLED = "true"'));
  const consumed = unstable_readConfig({ config: configPath, env: 'production' });
  for (const flag of GELATO_RUNTIME_FLAGS) assert.equal(consumed.vars[flag], values[flag].value);
  await prepare(project({ UNRELATED_SECRET: { type: 'secret_text', value: 'sensitive-value' } }));
  assert.equal(await fs.readFile(configPath, 'utf8'), expectedSource);
  for (const flag of GELATO_RUNTIME_FLAGS) {
    const mixed = structuredClone(values); mixed[flag] = { type: 'plain_text', value: 'true' };
    await prepare(project(mixed));
    assert.match(await fs.readFile(configPath, 'utf8'), new RegExp(`^${flag} = "true"$`, 'm'));
  }
  for (const value of [true, false, 1, null, undefined, '', 'TRUE', ' true ', 'sensitive-value']) {
    await reject(project({ GELATO_DRAFT_SUBMISSION_ENABLED: { type: 'plain_text', value } }));
  }
  for (const type of ['secret_text', 'sensitive-value', undefined]) await reject(project({ GELATO_DRAFT_SUBMISSION_ENABLED: { type, value: 'true' } }));
  for (const flag of [null, [], 'sensitive-value']) await reject(project({ GELATO_DRAFT_SUBMISSION_ENABLED: flag }));
  for (const body of [null, [], {}, { success: false, errors: ['sensitive-value'] },
    { success: true, result: null }, { success: true, result: { name: 'other' } },
    project(null), project([]), { ...project({}), result: { ...project({}).result, production_branch: 'other' } }]) await reject(body);
  const start = fetches;
  for (const override of [{ GITHUB_REF: 'refs/heads/feature' }, { GITHUB_SHA: 'c'.repeat(40) },
    { DEPLOY_ENVIRONMENT: 'preview' }, { CLOUDFLARE_PAGES_PROJECT: 'other' },
    { CLOUDFLARE_ACCOUNT_ID: 'invalid' }, { CLOUDFLARE_API_TOKEN: '' }]) await reject(project(values), override);
  assert.equal(fetches, start, 'Invalid production target must fail before fetch');
  const marker = '\nUNRELATED = "preserve-this-byte-for-byte"\n';
  await prepare(project(values), {}, source + marker);
  assert.equal(await fs.readFile(configPath, 'utf8'), (expectedSource + marker).replace('GELATO_DRAFT_SUBMISSION_ENABLED = "false"', 'GELATO_DRAFT_SUBMISSION_ENABLED = "true"'));
  for (const broken of [source.replace('[vars]', '[other]'), source + '\nGELATO_DRAFT_SUBMISSION_ENABLED = "false"\n',
    source + '\n[env.production]\ncompatibility_date = "2024-11-01"\n',
    source + '\n[env.production.vars]\nUNRELATED = "example"\n',
    'env = { production = { vars = { UNRELATED = "example" } } }\n' + source,
    expectedSource.replace('GELATO_DRAFT_SUBMISSION_ENABLED = "false"', 'GELATO_DRAFT_SUBMISSION_ENABLED = "true"'),
    source + '\n[env.production.vars]\nGELATO_DRAFT_SUBMISSION_ENABLED = "false"\n',
    source + '\n[env.production.vars]\n"GELATO_DRAFT_SUBMISSION_ENABLED" = "false"\n',
    source + '\n[env.production]\nvars.GELATO_DRAFT_SUBMISSION_ENABLED = "false"\n']) await reject(project(values), {}, broken);
  for (const fetchImpl of [async () => { throw new Error('sensitive-value'); },
    async () => new Response('sensitive-value', { status: 403 }),
    async () => new Response('sensitive-value', { status: 200 })]) await reject(project(values), {}, source, fetchImpl);
  assert.ok(fetches > 0);
  console.log('Gelato runtime binding preparation checks passed');
} finally { await fs.rm(directory, { recursive: true, force: true }); }
