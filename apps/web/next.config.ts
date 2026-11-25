import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@flash-info/core"],
  poweredByHeader: false,
};

export default nextConfig;
