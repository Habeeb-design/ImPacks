import type { NextConfig } from "next";

const apiOrigin = (process.env.API_PROXY_TARGET || "http://127.0.0.1:3001").replace(/\/$/, "");

const config: NextConfig = {
  transpilePackages: ["@impacks/contracts"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
};

export default config;
