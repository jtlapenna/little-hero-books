// OpenNext config for Cloudflare Pages builds (CommonJS)
// Provide required default export with override settings to avoid CLI prompts
module.exports = {
  default: {
    override: {
      wrapper: "cloudflare-node",
      // Use Node converter so API routes are not treated as Edge
      converter: "node",
      proxyExternalRequest: "fetch",
      incrementalCache: "dummy",
      tagCache: "dummy",
      queue: "direct"
    }
  },
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

