import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Our AGENTS.md is the project's own; next dev must not rewrite it.
  agentRules: false,
};

export default nextConfig;
