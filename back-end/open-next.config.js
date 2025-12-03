// OpenNext config for Cloudflare Pages builds (CommonJS)
// Provide required default export with override settings to avoid CLI prompts
module.exports = {
  default: {
    override: {
      wrapper: "cloudflare-node",
      converter: "edge",
      proxyExternalRequest: "fetch",
      incrementalCache: "dummy",
      tagCache: "dummy",
      queue: "direct"
    },
    functions: {}
  },
  edgeExternals: ["node:crypto", "fs", "fs/promises", "path", "os"],
  middleware: {
    external: true,
    override: {
      wrapper: "cloudflare-edge",
      converter: "edge",
      proxyExternalRequest: "fetch",
      incrementalCache: "dummy",
      tagCache: "dummy",
      queue: "direct"
    }
  }
};

