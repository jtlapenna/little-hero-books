// OpenNext config for Cloudflare Pages builds (TypeScript)
// Export a default object in the exact shape expected by the adapter
const config = {
  default: {
    override: {
      wrapper: "cloudflare-node",
      converter: "edge",
      proxyExternalRequest: "fetch",
      incrementalCache: "dummy" as const,
      tagCache: "dummy" as const,
      queue: "direct" as const,
    },
    functions: {},
  },
  edgeExternals: ["node:crypto"],
  middleware: {
    external: true,
    override: {
      wrapper: "cloudflare-edge",
      converter: "edge",
      proxyExternalRequest: "fetch",
      incrementalCache: "dummy" as const,
      tagCache: "dummy" as const,
      queue: "direct" as const,
    },
  },
};

export default config;


