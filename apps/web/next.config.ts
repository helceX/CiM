import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@cim/ui", "@cim/core", "@cim/db", "@cim/config", "@cim/validation"],
};

export default nextConfig;
