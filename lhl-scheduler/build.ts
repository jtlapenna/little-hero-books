import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import nodeModule from 'node:module';
// Existing backend typings target Node20; this build uses the Node22 platform API.
const { stripTypeScriptTypes } = nodeModule as typeof nodeModule & {
  stripTypeScriptTypes(source: string, options: { mode: 'strip' }): string;
};
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const output = join(root, '.vercel/output');
const jobs = ['router', 'health-monitor', 'book-config-integrity'] as const;
const config = JSON.parse(await readFile(join(root, 'vercel.json'), 'utf8'));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await writeFile(join(output, 'config.json'), JSON.stringify({
  version: 3, crons: config.crons,
  routes: [{ handle: 'filesystem' }, { src: '/.*', status: 404 }],
}, null, 2));
// Explicit closure: each function contains only its entrypoint, shared relay and metadata.
for (const job of jobs) {
  const target = join(output, 'functions/api/cron', `${job}.func`);
  await mkdir(join(target, 'api/cron'), { recursive: true });
  await mkdir(join(target, 'lib'), { recursive: true });
  for (const source of [`api/cron/${job}.ts`, 'lib/relay.ts']) {
    const compiled = stripTypeScriptTypes(await readFile(join(root, source), 'utf8'), { mode: 'strip' });
    await writeFile(join(target, source.replace(/\.ts$/, '.js')), compiled);
  }
  await writeFile(join(target, 'package.json'), '{"type":"module"}\n');
  await writeFile(join(target, '.vc-config.json'), JSON.stringify({
    runtime: 'nodejs22.x', handler: `api/cron/${job}.js`, launcherType: 'Nodejs', maxDuration: 300,
    shouldAddHelpers: false, shouldAddSourcemapSupport: false,
  }, null, 2));
}
console.log('Packaged exactly three dependency-free LHL scheduler functions');
