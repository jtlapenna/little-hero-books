import { ACCESS_RUNTIME_CONFIG, assertAccessBindingSourceFormat, applyAccessRuntimeBindings, discoveredRuntimeConfig, writePreparedRuntimeConfig, verifyPreparedRuntimeBindings } from './prepare-access-runtime-bindings.mjs';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const GELATO_RUNTIME_FLAGS = Object.freeze([
  'GELATO_DRAFT_SUBMISSION_ENABLED', 'GELATO_CANCEL_ENABLED', 'GELATO_STATUS_RELAY_ENABLED',
  'GELATO_STATUS_POLLING_ENABLED', 'GELATO_NOTIFICATIONS_ENABLED',
  'GELATO_SCHEDULED_STATUS_ENABLED',
]);
class BindingPreparationError extends Error {}
const requireValue = (condition, message) => { if (!condition) throw new BindingPreparationError(message); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const projectName = 'little-hero-labs-admin';

export function applyGelatoRuntimeBindings(configText, values) {
  requireValue(typeof configText === 'string', 'Invalid Wrangler configuration');
  requireValue(/^name = "little-hero-labs-admin"$/m.test(configText), 'Wrong Wrangler project');
  requireValue(!/^[ \t]*(?:\[\[?[ \t]*)?(?:env|"env"|'env')[ \t]*[.\]=]/m.test(configText),
    'Wrangler environment overrides require explicit binding support');
  const sections = [...configText.matchAll(/^\[vars\][ \t]*\r?$/gm)];
  requireValue(sections.length === 1, 'Wrangler requires one supported vars section');
  const start = sections[0].index + sections[0][0].length;
  const next = configText.slice(start).search(/^\[/m);
  const end = next < 0 ? configText.length : start + next;
  const replacements = [];
  for (const flag of GELATO_RUNTIME_FLAGS) {
    requireValue(values[flag] === 'true' || values[flag] === 'false', 'Invalid Gelato runtime flag');
    const assignments = [...configText.matchAll(new RegExp(`^[^#\\r\\n]*\\b${flag}\\b[^=\\r\\n]*=.*$`, 'gm'))];
    requireValue(assignments.length === 1 && assignments[0].index > start && assignments[0].index < end,
      'Gelato flags require unique assignments inside vars');
    const pattern = new RegExp(`^([ \\t]*${flag}[ \\t]*=[ \\t]*)"false"([ \\t]*(?:#.*)?)(\\r?)$`, 'm');
    requireValue(pattern.test(assignments[0][0]), 'Gelato source flags must default to false');
    replacements.push({ pattern, value: values[flag] });
  }
  let prepared = configText;
  for (const { pattern, value } of replacements) prepared = prepared.replace(pattern, (_, prefix, suffix, cr) => `${prefix}"${value}"${suffix}${cr}`);
  return prepared;
}

export async function prepareGelatoRuntimeBindingFile({ env, sourceSha, configPath, fetchImpl = fetch }) {
  requireValue(env.DEPLOY_ENVIRONMENT === 'production' && env.CLOUDFLARE_PAGES_PROJECT === projectName &&
    env.GITHUB_REF === 'refs/heads/main' && /^[a-f0-9]{40}$/.test(sourceSha) && env.GITHUB_SHA === sourceSha,
  'Gelato bindings require reviewed main production deployment');
  requireValue(/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID ?? '') &&
    typeof env.CLOUDFLARE_API_TOKEN === 'string' && env.CLOUDFLARE_API_TOKEN.trim().length > 0,
  'Cloudflare deployment credentials are unavailable');
  discoveredRuntimeConfig(configPath);
  const configText = await fs.readFile(configPath, 'utf8');
  assertAccessBindingSourceFormat(configText);
  applyGelatoRuntimeBindings(configText, Object.fromEntries(GELATO_RUNTIME_FLAGS.map(flag => [flag, 'false'])));
  let body;
  try {
    const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/${projectName}`, {
      method: 'GET', headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
      redirect: 'error', signal: AbortSignal.timeout(20000),
    });
    requireValue(response.ok, 'Cloudflare runtime settings lookup failed');
    body = await response.json();
  } catch { throw new BindingPreparationError('Cloudflare runtime settings lookup failed'); }
  requireValue(record(body) && body.success === true && record(body.result) &&
    body.result.name === projectName && body.result.production_branch === 'main' &&
    record(body.result.deployment_configs) && record(body.result.deployment_configs.production) &&
    record(body.result.deployment_configs.production.env_vars), 'Invalid Cloudflare production settings');
  const settings = body.result.deployment_configs.production.env_vars;
  const values = {};
  for (const flag of GELATO_RUNTIME_FLAGS) {
    if (!Object.hasOwn(settings, flag)) { values[flag] = 'false'; continue; }
    const setting = settings[flag];
    requireValue(record(setting) && Object.hasOwn(setting, 'type') && Object.hasOwn(setting, 'value') &&
      setting.type === 'plain_text' && (setting.value === 'true' || setting.value === 'false'),
    'Invalid Gelato production flag setting');
    values[flag] = setting.value;
  }
  const access = {};
  for (const name of ACCESS_RUNTIME_CONFIG) {
    const setting = settings[name];
    requireValue(record(setting) && setting.type === 'plain_text' && typeof setting.value === 'string', 'Access runtime setting unavailable');
    access[name] = setting.value;
  }
  let prepared;
  try { prepared = applyAccessRuntimeBindings(applyGelatoRuntimeBindings(configText, values), access); }
  catch { throw new BindingPreparationError('Invalid Access runtime settings'); }
  try { writePreparedRuntimeConfig(configPath, prepared, { ...values, ...access, ADMIN_ALLOWED_EMAILS: access.ADMIN_ALLOWED_EMAILS.split(',').map(value => value.trim().toLowerCase()).sort().join(',') }, sourceSha, configText); }
  catch { throw new BindingPreparationError('Runtime binding configuration verification failed'); }
}

/** Offline input verification only. The caller must obtain committedConfigText from the reviewed Git blob. */
export async function verifyReviewedRuntimeBindingFile({ configPath, sourceSha, committedConfigText }) {
  try {
    requireValue(/^[a-f0-9]{40}$/.test(sourceSha) && typeof committedConfigText === 'string', 'Invalid reviewed source');
    const receiptPath = join(dirname(configPath), '.wrangler/lhl-runtime-bindings.json');
    const readInput = async file => {
      requireValue(await fs.realpath(file) === resolve(file), 'Invalid input path');
      const handle = await fs.open(file, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK);
      try {
        const before = await handle.stat();
        requireValue(before.isFile() && before.nlink === 1 && before.size > 0 && before.size <= 1024 * 1024, 'Invalid input file');
        const bytes = Buffer.alloc(before.size + 1);
        let length = 0;
        while (length < bytes.length) {
          const result = await handle.read(bytes, length, bytes.length - length, null);
          if (!result.bytesRead) break;
          length += result.bytesRead;
        }
        const after = await handle.stat();
        requireValue(length === before.size && before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs, 'Changed input file');
        requireValue(await fs.realpath(file) === resolve(file), 'Changed input path');
        const current = await fs.lstat(file);
        requireValue(current.dev === before.dev && current.ino === before.ino && !current.isSymbolicLink(), 'Changed input path');
        return bytes.subarray(0, length);
      } finally { await handle.close(); }
    };
    const configBytes = await readInput(configPath);
    const receiptBytes = await readInput(receiptPath);
    const receipt = JSON.parse(receiptBytes.toString('utf8'));
    const exactKeys = (value, keys) => record(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
    requireValue(exactKeys(receipt, ['sourceSha', 'configSha256', 'expected']) && receipt.sourceSha === sourceSha, 'Invalid binding receipt');
    requireValue(exactKeys(receipt.expected, [...GELATO_RUNTIME_FLAGS, ...ACCESS_RUNTIME_CONFIG]), 'Invalid binding fields');
    const flags = Object.fromEntries(GELATO_RUNTIME_FLAGS.map(name => [name, receipt.expected[name]]));
    const access = Object.fromEntries(ACCESS_RUNTIME_CONFIG.map(name => [name, receipt.expected[name]]));
    const reconstructed = applyAccessRuntimeBindings(applyGelatoRuntimeBindings(committedConfigText, flags), access);
    requireValue(Buffer.from(reconstructed, 'utf8').equals(configBytes), 'Unreviewed configuration change');
    verifyPreparedRuntimeBindings(configPath, sourceSha);
    requireValue(configBytes.equals(await readInput(configPath)) && receiptBytes.equals(await readInput(receiptPath)), 'Changed verified inputs');
    const digest = bytes => createHash('sha256').update(bytes).digest('hex');
    return { schema: 'lhl.reviewed-runtime-input@1', sourceSha,
      configSha256: digest(configBytes), bindingReceiptSha256: digest(receiptBytes), flags };
  } catch { throw new BindingPreparationError('Reviewed runtime input verification failed'); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const configPath = new URL('../wrangler.toml', import.meta.url).pathname;
    if (process.argv[2] === '--verify-reviewed-source') {
      const committedConfigText = execFileSync('git', ['show', `${sourceSha}:back-end/wrangler.toml`], {
        encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 15000, stdio: 'pipe',
        env: { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
          GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_ALLOW_PROTOCOL: '' },
      });
      await verifyReviewedRuntimeBindingFile({ configPath, sourceSha, committedConfigText });
    } else if (process.argv[2] === '--verify') verifyPreparedRuntimeBindings(configPath, sourceSha);
    else await prepareGelatoRuntimeBindingFile({ env: process.env, sourceSha, configPath });
    console.log('Verified LHL runtime bindings');
  } catch (error) {
    console.error(error instanceof BindingPreparationError ? error.message : 'Gelato runtime binding preparation failed');
    process.exitCode = 1;
  }
}
