# Supported Next.js build prerequisite

OpenNext Cloudflare 1.20.12 rejects Next 15.5.28 after the upstream support cutoff. This stopped the unchanged backend build on book PR41 before compilation.

This checkpoint pins Next and eslint-config-next to 16.4.2. React19.1.10, next-auth4.24.15, OpenNext1.20.12 and Wrangler4.151.1 remain unchanged. Their installed peer ranges accept this combination. The lockfile changes belong to the Next/ESLint dependency graph.

Production build explicitly uses webpack to retain native-module handling. The native binary ignore now applies only within sharp, @img/sharp and @napi-rs/canvas dependency trees. The old suffix-only matcher also ignored Next16's JavaScript `react-server-dom-webpack/server.node`, breaking page collection. The removed Next ESLint option is gone; ESLint uses native flat exports. Next's required TypeScript JSX configuration and development type include are retained. Existing build-time TypeScript policy remains unchanged.

The trigger-w0 route now awaits Promise params. Its regression exercises numeric and per-book lookup through the actual route and intercepted Supabase transport, with no writes or webhook calls. The unfixed route fails this regression. Other dynamic route contexts already awaited params.

The admin login test no longer calls a removed private Next inventory API. Its existing authentication and return-path checks remain. A new CI gate compiles the actual OpenNext Pages artifact with Wrangler's local Pages compiler, then exercises the unmodified bundle in Miniflare with synthetic bindings and blocked outbound traffic. It covers login denial, navigation redirect, private API denial, actual checkout validation, escaped login routing and React page rendering. No provider or account access occurs.

Harness details matter: Pages `--outdir` emits JavaScript; `--outfile` emits multipart upload content. Miniflare's module root must match the temporary output directory. Raw loopback HTTP preserves navigation headers that Undici's fetch transport rewrites.

Local evidence: actual production Next/OpenNext/postbuild succeeds with real fonts and synthetic build settings, without environment files or support overrides. Existing identity, access, customer preview, printer/file grants, workflow callers, runtime-binding, checkout and print-worker regressions pass. Full repository secret scanning passes. Built sign-in failure view and recovery link were inspected in a hidden browser.

CI must pass on the final PR head before merge, including Linux installation/build, disposable database journeys and workflow regressions. Successful human sign-in, successful payments, provider submission, physical print and production deployment are outside this synthetic proof. Upload workflows remain manual and keep their reviewed-main checks.

Merge this prerequisite first. Refresh book PR41 against main, recheck its exact content and CI, then merge the book checkpoint. Preserve its saved lettering and live editor throughout.
