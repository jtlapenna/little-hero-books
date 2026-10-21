import type { NextConfig } from "next";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = fileURLToPath(new URL(".", import.meta.url));

const rootEnvPath = resolve(currentDir, "../.env");

if (existsSync(rootEnvPath)) {
  try {
    const content = readFileSync(rootEnvPath, "utf-8");
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) continue;

      const key = trimmed.slice(0, separatorIndex).trim();
      if (!key || key in process.env) continue;

      let value = trimmed.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }
  } catch (error) {
    console.warn(
      "[next.config.ts] Failed to load root .env file. Environment variables may be missing.",
      error
    );
  }
}

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    // Disable TypeScript checking during builds - Cloudflare Pages
    // This allows the site to deploy even with type errors
    ignoreBuildErrors: true,
  },
  // For Cloudflare Pages
  trailingSlash: false,
  distDir: '.next',
  webpack: (config, { isServer, webpack }) => {
    // Exclude native modules from bundling (they should only be loaded at runtime)
    // This prevents webpack from trying to bundle binary files like .node modules
    // Only apply to server-side builds and only for specific routes that use these modules
    if (isServer) {
      // Ignore binaries only in native dependency trees. Next also uses
      // JavaScript entrypoints named server.node, which must still resolve.
      config.plugins = config.plugins || [];
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /\.node$/,
          contextRegExp: /[\\/]node_modules[\\/](?:sharp|@img[\\/]sharp[^\\/]*|@napi-rs[\\/]canvas[^\\/]*)(?:[\\/]|$)/,
        })
      );
      
      // Make only the truly incompatible native deps external.
      // Keep `sharp` bundleable so OpenNext can include the worker-compatible build.
      // Use a function to conditionally externalize only when these modules are imported
      const originalExternals = config.externals;
      config.externals = [
        ...(Array.isArray(originalExternals) ? originalExternals : [originalExternals || {}]),
        // Externalize selected native deps without `Function` typing (lint-safe).
        (context: string, request: string, callback: (err?: Error | null, result?: string) => void) => {
          // Only externalize canvas/pdfjs, let `sharp` bundle for worker runtime.
          if (request === '@napi-rs/canvas' || request === 'pdfjs-dist' || request.startsWith('pdfjs-dist/')) {
            return callback(null, `commonjs ${request}`);
          }
          // For other modules, use the original externals logic
          if (typeof originalExternals === 'function') {
            return originalExternals(context, request, callback);
          }
          callback();
        },
      ];
    }
    
    return config;
  },
};

export default nextConfig;
