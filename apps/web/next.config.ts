import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@cim/ui", "@cim/core", "@cim/db", "@cim/config", "@cim/validation"],
  // Docker/standalone deploys (apps/web/Dockerfile) need only the traced
  // files under .next/standalone, not the full pnpm workspace — and in a
  // monorepo the tracing root defaults to this package directory, which
  // would miss the workspace `@cim/*` packages this app imports.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default withNextIntl(nextConfig);
