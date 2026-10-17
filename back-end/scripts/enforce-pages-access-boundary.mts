import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { assertPublicRouteInventory, readAppRouteInventory } from './security-public-routes.mjs';

export const pagesRoutes = { version: 1, include: ['/*'], exclude: ['/_next/static/*', '/favicon.ico'] };
export function patchWorkerForAccessBoundary(source: string) {
  const opening = 'return runWithCloudflareRequestContext(request, env, ctx, async () => {';
  const closing = '\n        });\n    },\n};';
  if (source.includes('withBackendAccess') || source.split(opening).length !== 2 || source.split(closing).length !== 2) {
    throw new Error('Unsupported OpenNext worker structure; refusing to emit an unguarded Pages entrypoint');
  }
  return 'import { withBackendAccess } from "./access-boundary.mjs";\n' + source
    .replace(opening, 'return runWithCloudflareRequestContext(request, env, ctx, async () => withBackendAccess(request, async (guardedRequest) => { request = guardedRequest;')
    .replace(closing, '\n        }));\n    },\n};');
}
export async function emitPagesAccessBoundary(outputDirectory: string) {
  const output = resolve(outputDirectory);
  const workerPath = resolve(output, '_worker.js');
  const patched = patchWorkerForAccessBoundary(await readFile(workerPath, 'utf8'));
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  assertPublicRouteInventory(readAppRouteInventory(resolve(root, 'src/app')));
  const bundle = await build({ entryPoints: [resolve(root, 'src/lib/access-boundary.ts')], bundle: true, write: false,
    format: 'esm', platform: 'neutral', mainFields: ['browser', 'module', 'main'], external: ['node:*'], logLevel: 'silent' });
  await writeFile(resolve(output, 'access-boundary.mjs'), bundle.outputFiles[0].text);
  await writeFile(resolve(output, '_routes.json'), JSON.stringify(pagesRoutes, null, 2) + '\n');
  await writeFile(workerPath, patched);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Pages output directory required');
  await emitPagesAccessBoundary(process.argv[2]);
}
