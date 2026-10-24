/** Offline pre-dispatch input observation. Does not build, upload or attest provider execution. */
import * as fs from 'node:fs';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const PROJECT = 'little-hero-labs-admin';
const REPOSITORY = 'jtlapenna/little-hero-books';
const WORKFLOW = `${REPOSITORY}/.github/workflows/deploy-cloudflare-pages.yml@refs/heads/main`;
const CONFIG = 'back-end/wrangler.toml';
const PACKAGE = 'back-end/.open-next/cloudflare';
const MAX_FILES = 20000, MAX_FILE_BYTES = 256 * 1024 * 1024, MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
const REQUIRED = ['_worker.js', '_routes.json', 'access-boundary.mjs', 'cloudflare/init.js',
  'cloudflare/images.js', 'cloudflare/skew-protection.js', 'cloudflare/next-env.mjs',
  'middleware/handler.mjs', 'server-functions/default/handler.mjs'];
const ROUTES = { version: 1, include: ['/*'], exclude: ['/_next/static/*', '/favicon.ico'] };
const rejected = () => new Error('Pages upload input verification failed');
function need(condition: unknown): asserts condition { if (!condition) throw rejected(); }
const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const decode = (bytes: Buffer) => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
const encode = (value: unknown) => JSON.stringify(value);
function safePath(path: string) {
  need(path.length > 0 && !isAbsolute(path) && !/[\x00-\x1f\x7f\\]/.test(path));
  need(path.split('/').every(part => part !== '' && part !== '.' && part !== '..'));
  return path;
}
export function uploadContext(env: NodeJS.ProcessEnv) {
  const source = env.REVIEWED_SOURCE_SHA;
  need(typeof source === 'string' && /^[a-f0-9]{40}$/.test(source) && env.GITHUB_SHA === source && env.GITHUB_WORKFLOW_SHA === source);
  need(env.GITHUB_REPOSITORY === REPOSITORY && env.GITHUB_REF === 'refs/heads/main' &&
    env.GITHUB_WORKFLOW_REF === WORKFLOW && env.GITHUB_JOB === 'deploy' && env.GITHUB_EVENT_NAME === 'workflow_dispatch' &&
    env.DEPLOY_ENVIRONMENT === 'production' && env.CLOUDFLARE_PAGES_PROJECT === PROJECT);
  need(typeof env.GITHUB_RUN_ID === 'string' && /^[1-9][0-9]{0,19}$/.test(env.GITHUB_RUN_ID));
  need(typeof env.GITHUB_RUN_ATTEMPT === 'string' && /^[1-9][0-9]{0,5}$/.test(env.GITHUB_RUN_ATTEMPT));
  return { repository: REPOSITORY, ref: 'refs/heads/main', workflow: WORKFLOW, job: 'deploy',
    sourceSha: source, runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT };
}
export type UploadContext = ReturnType<typeof uploadContext>;
export interface TreeEntry { path: string; mode: '100644' | '100755'; blob: string }
export function parseTrackedTree(raw: Buffer): TreeEntry[] {
  need(raw.length > 0 && raw[raw.length - 1] === 0 && raw.length <= 8 * 1024 * 1024);
  const entries = decode(raw.subarray(0, raw.length - 1)).split('\0').map(row => {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(row); need(match);
    return { path: safePath(match[3]), mode: match[1] as TreeEntry['mode'], blob: match[2] };
  });
  need(entries.length <= MAX_FILES && new Set(entries.map(row => row.path)).size === entries.length);
  return entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
function git(root: string, args: string[], maxBuffer = 8 * 1024 * 1024) {
  return execFileSync('git', ['-C', root, ...args], { timeout: 20000, maxBuffer, stdio: ['ignore', 'pipe', 'pipe'],
    env: { PATH: '/usr/bin:/bin', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_OPTIONAL_LOCKS: '0',
      GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0', GIT_ALLOW_PROTOCOL: '' } });
}
function canonicalDirectory(path: string) {
  need(isAbsolute(path) && resolve(path) === path && fs.realpathSync(path) === path && fs.lstatSync(path).isDirectory());
  return path;
}
const identity = (s: fs.Stats) => `${s.dev}:${s.ino}`;
const stable = (a: fs.Stats, b: fs.Stats) => identity(a) === identity(b) && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs && a.mode === b.mode && a.nlink === b.nlink;
/** Linux /proc descriptors anchor traversal. Unsupported hosts fail closed; no pathname fallback. */
class AnchoredTree {
  readonly fd: number;
  readonly initial: fs.Stats;
  constructor(readonly root: string) {
    need(process.platform === 'linux'); canonicalDirectory(root);
    this.fd = fs.openSync(root, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    try {
      this.initial = fs.fstatSync(this.fd);
      need(this.initial.isDirectory() && identity(this.initial) === identity(fs.lstatSync(root)));
    } catch (error) { fs.closeSync(this.fd); throw error; }
  }
  at(fd: number, name = '') { return `/proc/self/fd/${fd}${name ? '/' + name : ''}`; }
  close() { fs.closeSync(this.fd); }
  checkRoot() { need(identity(fs.lstatSync(this.root)) === identity(this.initial) && fs.realpathSync(this.root) === this.root); }
  file(fd: number, name: string, capture = false) {
    const path = this.at(fd, name), listed = fs.lstatSync(path);
    need(listed.isFile() && listed.nlink === 1 && listed.size <= MAX_FILE_BYTES);
    const handle = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    try {
      const before = fs.fstatSync(handle); need(stable(before, listed));
      const hash = createHash('sha256'), blob = createHash('sha1').update(`blob ${before.size}\0`);
      const buffer = Buffer.alloc(1024 * 1024), chunks: Buffer[] = []; let bytes = 0;
      for (;;) {
        const size = fs.readSync(handle, buffer); if (!size) break;
        bytes += size; need(bytes <= before.size && bytes <= MAX_FILE_BYTES);
        const part = buffer.subarray(0, size); hash.update(part); blob.update(part);
        if (capture) { need(bytes <= 1024 * 1024); chunks.push(Buffer.from(part)); }
      }
      need(bytes === before.size && stable(before, fs.fstatSync(handle)) && stable(before, fs.lstatSync(path)));
      return { bytes, sha256: hash.digest('hex'), blob: blob.digest('hex'), executable: (before.mode & 0o100) !== 0,
        captured: capture ? Buffer.concat(chunks) : undefined };
    } finally { fs.closeSync(handle); }
  }
  directory<T>(fd: number, name: string, visit: (child: number) => T): T {
    const path = this.at(fd, name), listed = fs.lstatSync(path); need(listed.isDirectory() && !listed.isSymbolicLink());
    const child = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    try {
      need(identity(fs.fstatSync(child)) === identity(listed)); const value = visit(child);
      need(identity(fs.lstatSync(path)) === identity(listed)); return value;
    } finally { fs.closeSync(child); }
  }
  tracked(path: string) {
    const parts = safePath(path).split('/');
    const read = (fd: number, index: number): ReturnType<AnchoredTree['file']> =>
      index === parts.length - 1 ? this.file(fd, parts[index]) : this.directory(fd, parts[index], child => read(child, index + 1));
    return read(this.fd, 0);
  }
}
export function observedPackage(root: string) {
  const tree = new AnchoredTree(root); const rows: { path: string; bytes: number; sha256: string }[] = [];
  let total = 0, directories = 0, routes: Buffer | undefined, hasAssets = false;
  const walk = (fd: number, prefix: string, depth: number) => {
    need(depth <= 64 && ++directories <= MAX_FILES); const before = fs.fstatSync(fd);
    const names = fs.readdirSync(tree.at(fd)).sort();
    need(names.length <= MAX_FILES);
    for (const name of names) {
      const path = safePath(prefix + name);
      need(name !== '.git' && name !== 'node_modules' && !name.startsWith('.env'));
      const stat = fs.lstatSync(tree.at(fd, name));
      if (stat.isDirectory()) {
        if (path === 'assets') hasAssets = true;
        tree.directory(fd, name, child => walk(child, path + '/', depth + 1));
      } else {
        need(rows.length < MAX_FILES); const value = tree.file(fd, name, path === '_routes.json');
        total += value.bytes; need(total <= MAX_TOTAL_BYTES);
        rows.push({ path, bytes: value.bytes, sha256: value.sha256 }); if (path === '_routes.json') routes = value.captured;
      }
    }
    need(encode(fs.readdirSync(tree.at(fd)).sort()) === encode(names) && stable(before, fs.fstatSync(fd)));
  };
  try {
    walk(tree.fd, '', 0); tree.checkRoot();
    need(hasAssets && REQUIRED.every(name => rows.some(row => row.path === name)) && routes);
    const policy: unknown = JSON.parse(decode(routes));
    need(policy !== null && typeof policy === 'object' && !Array.isArray(policy));
    const p = policy as Record<string, unknown>;
    need(encode(Object.keys(p).sort()) === encode(['exclude', 'include', 'version']) &&
      p.version === ROUTES.version && encode(p.include) === encode(ROUTES.include) && encode(p.exclude) === encode(ROUTES.exclude));
    rows.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    return { sha256: digest(encode(rows)), files: rows.length, bytes: total };
  } finally { tree.close(); }
}
export function reviewedGitTree(root: string, sourceSha: string) {
  canonicalDirectory(root); need(/^[a-f0-9]{40}$/.test(sourceSha));
  need(decode(git(root, ['rev-parse', '--show-toplevel'])).trim() === root && decode(git(root, ['rev-parse', 'HEAD'])).trim() === sourceSha);
  need(git(root, ['ls-files', '--others', '--exclude-standard', '-z']).length === 0);
  // Index metadata catches staged additions/deletions; actual bytes/modes below catch index-hidden modifications.
  need(git(root, ['diff', '--cached', '--name-only', '--no-ext-diff', '--no-textconv', '--no-renames', sourceSha, '--']).length === 0);
  const raw = git(root, ['ls-tree', '-r', '-z', '--full-tree', sourceSha]), entries = parseTrackedTree(raw);
  const treeSha = decode(git(root, ['rev-parse', `${sourceSha}^{tree}`])).trim(); need(/^[a-f0-9]{40}$/.test(treeSha));
  need(entries.some(row => row.path === CONFIG));
  return { treeSha, entries };
}
export function observedSource(root: string, sourceSha: string) {
  const reviewed = reviewedGitTree(root, sourceSha), { treeSha, entries } = reviewed;
  const opened = new AnchoredTree(root); const rows: { path: string; mode: string; sha256: string }[] = []; let total = 0;
  try {
    for (const row of entries) {
      const value = opened.tracked(row.path); total += value.bytes; need(total <= MAX_TOTAL_BYTES);
      need(value.executable === (row.mode === '100755'));
      if (row.path !== CONFIG) need(value.blob === row.blob);
      rows.push({ path: row.path, mode: row.mode, sha256: value.sha256 });
    }
    opened.checkRoot();
    need(encode(reviewedGitTree(root, sourceSha)) === encode(reviewed));
    return { treeSha, trackedFiles: rows.length, sourceInputsSha256: digest(encode(rows)) };
  } finally { opened.close(); }
}
export async function createUploadObservation(root: string, env: NodeJS.ProcessEnv) {
  try {
    const context = uploadContext(env); canonicalDirectory(root);
    const { verifyReviewedRuntimeBindingFile } = await import('./prepare-gelato-runtime-bindings.mjs');
    const committedConfigText = decode(git(root, ['show', `${context.sourceSha}:${CONFIG}`], 1024 * 1024));
    const snapshot = async () => {
      const source = observedSource(root, context.sourceSha);
      const inputs = new AnchoredTree(root);
      try {
        const config = await verifyReviewedRuntimeBindingFile({ configPath: join(root, CONFIG), sourceSha: context.sourceSha, committedConfigText });
        need(inputs.tracked(CONFIG).sha256 === config.configSha256 &&
          inputs.tracked('back-end/.wrangler/lhl-runtime-bindings.json').sha256 === config.bindingReceiptSha256);
        inputs.checkRoot();
        return { source, config, package: observedPackage(join(root, PACKAGE)) };
      } finally { inputs.close(); }
    };
    const first = await snapshot(), second = await snapshot(); need(encode(first) === encode(second));
    need(encode(uploadContext(env)) === encode(context) && encode(observedSource(root, context.sourceSha)) === encode(first.source));
    return { schema: 'lhl.pages-upload-input@1', boundary: 'observed-before-dispatch', ...context,
      treeSha: first.source.treeSha, sourceInputsSha256: first.source.sourceInputsSha256, trackedFiles: first.source.trackedFiles,
      packageSha256: first.package.sha256, packageFiles: first.package.files, packageBytes: first.package.bytes,
      configSha256: first.config.configSha256, bindingReceiptSha256: first.config.bindingReceiptSha256, flags: first.config.flags };
  } catch { throw rejected(); }
}
/** Fixed sanitized artifact only; output is never placed in source or the upload tree. */
export function saveUploadObservation(root: string, runnerTemp: string, receipt: Awaited<ReturnType<typeof createUploadObservation>>) {
  canonicalDirectory(root); canonicalDirectory(runnerTemp);
  const rel = relative(root, runnerTemp); need(rel.startsWith('..' + '/') || rel === '..' || isAbsolute(rel));
  const file = join(runnerTemp, 'lhl-pages-upload-input.json');
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, encode(receipt) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  return file;
}
async function main() {
  try {
    need(process.argv.length === 2); const root = canonicalDirectory(resolve(process.cwd(), '..'));
    need(process.cwd() === join(root, 'back-end'));
    const receipt = await createUploadObservation(root, process.env);
    need(typeof process.env.RUNNER_TEMP === 'string'); saveUploadObservation(root, process.env.RUNNER_TEMP, receipt);
    console.log('Recorded sanitized Pages upload input observation');
  } catch { console.error('Pages upload input verification failed'); process.exitCode = 1; }
}
if (typeof require !== 'undefined' && require.main === module) void main();
