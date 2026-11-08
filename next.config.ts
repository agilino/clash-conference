import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Agent SDK spawns its platform CLI binary from its own package folder;
  // bundled into a route chunk it cannot find it (AD-9).
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk"],
};

export default nextConfig;
