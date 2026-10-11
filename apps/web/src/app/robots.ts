import type { MetadataRoute } from "next";
import { BLOG_ORIGIN } from "@/content/blog";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin",
          "/dashboard",
          "/settings",
          "/monitoring",
          "/mentions",
          "/alerts",
          "/analytics",
          "/reports",
          "/opportunities",
          "/onboarding",
          "/login",
          "/register",
          "/forgot-password",
          "/reset-password",
        ],
      },
    ],
    sitemap: `${BLOG_ORIGIN}/sitemap.xml`,
  };
}
