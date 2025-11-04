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
};

export default nextConfig;

