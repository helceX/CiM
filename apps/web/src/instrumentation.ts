import type { Instrumentation } from "next";

/**
 * Next.js calls register() once per server start and onRequestError() for every
 * error that escapes a route/page/action. Both are no-ops unless SENTRY_DSN is
 * set. Only the route and error are reported — never the request body,
 * headers, cookies or query string.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { configureErrorReporting } = await import("@cim/core");
  configureErrorReporting({
    dsn: process.env.SENTRY_DSN,
    service: "web",
    environment: process.env.NODE_ENV,
    release: process.env.RAILWAY_GIT_COMMIT_SHA,
  });
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.SENTRY_DSN) return;
  const { captureException } = await import("@cim/core");
  await captureException(error, {
    method: request.method,
    // The matched route pattern ("/api/visuals/[id]"), not the concrete URL.
    route: context.routePath,
    routeType: context.routeType,
  });
};
