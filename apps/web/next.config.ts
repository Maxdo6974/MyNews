import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@flash-info/core"],
  poweredByHeader: false,
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
