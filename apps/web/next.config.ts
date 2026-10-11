import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@impacks/contracts"],
  serverExternalPackages: ["@impacks/api", "fastify"],
};

export default config;
