import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Set output file tracing root to marketing directory
  // This prevents Next.js from detecting root package-lock.json
  outputFileTracingRoot: process.cwd(),
  // Static export for Cloudflare Pages compatibility
  output: 'export',
  // Output to 'dist' to match Cloudflare Pages dashboard setting
  distDir: 'dist',
  // Disable image optimization (not available in static export)
  images: {
    unoptimized: true,
  },
};

export default nextConfig;

