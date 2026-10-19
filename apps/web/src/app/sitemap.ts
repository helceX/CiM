import type { MetadataRoute } from "next";
import { BLOG_DATE, BLOG_ORIGIN, blogCover, blogPosts } from "@/content/blog";
export default function sitemap(): MetadataRoute.Sitemap {
  const pages = [
    "",
    "/features",
    "/solutions",
    "/pricing",
    "/resources",
    "/contact",
    "/security",
    "/blog",
  ];
  return [
    ...pages.map((path) => ({ url: `${BLOG_ORIGIN}${path}` })),
    ...blogPosts.map((post) => ({
      url: `${BLOG_ORIGIN}/blog/${post.slug}`,
      lastModified: post.modifiedAt ?? BLOG_DATE,
      images: [`${BLOG_ORIGIN}${blogCover(post)}`],
    })),
  ];
}
