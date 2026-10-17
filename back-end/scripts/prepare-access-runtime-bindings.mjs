import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { experimental_readRawConfig } from 'wrangler';

export const ACCESS_RUNTIME_CONFIG = Object.freeze(['CF_ACCESS_ISSUER','CF_ACCESS_AUDIENCE','ADMIN_SITE_ORIGIN','ADMIN_ALLOWED_EMAILS']);
const expectedOperators = ['jeff@littleherolabs.com','john@littleherolabs.com'];
const fail = condition => { if (!condition) throw new Error('Invalid Access runtime configuration'); };
export function validateAccessRuntimeValues(values) {
  fail(ACCESS_RUNTIME_CONFIG.every(name => typeof values[name] === 'string'));
  fail(/^https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.cloudflareaccess\.com$/.test(values.CF_ACCESS_ISSUER));
  fail(/^[a-f0-9]{64}$/.test(values.CF_ACCESS_AUDIENCE));
  fail(values.ADMIN_SITE_ORIGIN === 'https://admin.littleherolabs.com');
  const operators = values.ADMIN_ALLOWED_EMAILS.split(',').map(value => value.trim().toLowerCase()).sort();
  fail(JSON.stringify(operators) === JSON.stringify(expectedOperators));
  return { ...values, ADMIN_ALLOWED_EMAILS: operators.join(',') };
}
export function assertAccessBindingSourceFormat(text) {
  const sections = [...text.matchAll(/^\[vars\][ \t]*\r?$/gm)]; fail(sections.length === 1);
  const start = sections[0].index + sections[0][0].length, next = text.slice(start).search(/^\[/m), end = next < 0 ? text.length : start + next;
  for (const name of ACCESS_RUNTIME_CONFIG) {
    const assignments = [...text.matchAll(new RegExp(`^[^#\\r\\n]*\\b${name}\\b[^=\\r\\n]*=.*$`, 'gm'))];
    fail(assignments.length === 1 && assignments[0].index > start && assignments[0].index < end);
    fail(new RegExp(`^[ \\t]*${name}[ \\t]*=[ \\t]*""[ \\t]*(?:#.*)?\\r?$`, 'm').test(assignments[0][0]));
  }
}
export function applyAccessRuntimeBindings(text, input) {
  assertAccessBindingSourceFormat(text);
  const values = validateAccessRuntimeValues(input);
  const sections = [...text.matchAll(/^\[vars\][ \t]*\r?$/gm)]; fail(sections.length === 1);
  const start = sections[0].index + sections[0][0].length, next = text.slice(start).search(/^\[/m), end = next < 0 ? text.length : start + next;
  let output = text;
  for (const name of ACCESS_RUNTIME_CONFIG) {
    const assignments = [...text.matchAll(new RegExp(`^[^#\\r\\n]*\\b${name}\\b[^=\\r\\n]*=.*$`, 'gm'))];
    fail(assignments.length === 1 && assignments[0].index > start && assignments[0].index < end);
    const pattern = new RegExp(`^([ \\t]*${name}[ \\t]*=[ \\t]*)""([ \\t]*(?:#.*)?)(\\r?)$`, 'm');
    fail(pattern.test(assignments[0][0]));
    output = output.replace(pattern, (_, prefix, suffix, cr) => `${prefix}${JSON.stringify(values[name])}${suffix}${cr}`);
  }
  return output;
}
/** Match Pages' actual discovery, rejecting shadow and redirected configurations. */
export function discoveredRuntimeConfig(configPath) {
  const intended = path.resolve(configPath); fail(fs.lstatSync(intended).isFile() && !fs.lstatSync(intended).isSymbolicLink());
  let directory = path.dirname(intended);
  for (;;) {
    for (const name of ['wrangler.json','wrangler.jsonc','.wrangler/deploy/config.json']) fail(!fs.existsSync(path.join(directory,name)));
    const parent = path.dirname(directory); if (parent === directory) break; directory = parent;
  }
  const discovered = experimental_readRawConfig({ script: path.join(path.dirname(intended),'__lhl_runtime_binding_guard__.js') }, { useRedirectIfAvailable: true });
  fail(!discovered.redirected && path.resolve(discovered.configPath ?? '') === intended && !Object.hasOwn(discovered.rawConfig, 'env'));
  return discovered.rawConfig;
}
export function validatePreparedRuntimeConfig(raw, expected) {
  fail(raw.name === 'little-hero-labs-admin' && raw.pages_build_output_dir === '.open-next/cloudflare' && !Object.hasOwn(raw,'env'));
  fail(raw.vars && Object.entries(expected).every(([name,value]) => raw.vars[name] === value));
  validateAccessRuntimeValues(raw.vars);
}
const digest = text => createHash('sha256').update(text).digest('hex');
export function writePreparedRuntimeConfig(configPath, text, expected, sourceSha, originalText) {
  const original = originalText; fail(typeof original === 'string' && fs.readFileSync(configPath,'utf8') === original); discoveredRuntimeConfig(configPath);
  const temporary = path.join(path.dirname(configPath), `.lhl-runtime-${randomUUID()}.toml`);
  try {
    fs.writeFileSync(temporary,text,{mode:0o600,flag:'wx'});
    const { rawConfig } = experimental_readRawConfig({config:temporary}); validatePreparedRuntimeConfig(rawConfig,expected);
    fail(fs.readFileSync(configPath,'utf8') === original); discoveredRuntimeConfig(configPath);
    fs.renameSync(temporary,configPath);
    const folder = path.join(path.dirname(configPath),'.wrangler'); fs.mkdirSync(folder,{recursive:true});
    fs.writeFileSync(path.join(folder,'lhl-runtime-bindings.json'),JSON.stringify({sourceSha,configSha256:digest(text),expected}),{mode:0o600});
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
export function verifyPreparedRuntimeBindings(configPath, sourceSha) {
  const receipt = JSON.parse(fs.readFileSync(path.join(path.dirname(configPath),'.wrangler/lhl-runtime-bindings.json'),'utf8'));
  fail(receipt.sourceSha === sourceSha && /^[a-f0-9]{40}$/.test(sourceSha) && receipt.configSha256 === digest(fs.readFileSync(configPath,'utf8')));
  validatePreparedRuntimeConfig(discoveredRuntimeConfig(configPath),receipt.expected);
}
