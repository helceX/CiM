import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'",
          },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
            : []),
        ],
      },
    ];
  },
  transpilePackages: [
    "@cim/ui",
    "@cim/core",
    "@cim/db",
    "@cim/config",
    "@cim/validation",
    "@cim/ingestion",
  ],
  // Docker/standalone deploys (apps/web/Dockerfile) need only the traced
  // files under .next/standalone, not the full pnpm workspace — and in a
  // monorepo the tracing root defaults to this package directory, which
  // would miss the workspace `@cim/*` packages this app imports.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default withNextIntl(nextConfig);
