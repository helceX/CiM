import { BLOG_DATE, BLOG_ORIGIN, blogPosts } from "@/content/blog";
const escapeXml = (value: string) =>
  value.replace(
    /[<>&"']/g,
    (char) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char]!,
  );
export function GET() {
  const items = blogPosts
    .map(
      (post) =>
        `<item><title>${escapeXml(post.title)}</title><link>${BLOG_ORIGIN}/blog/${post.slug}</link><guid isPermaLink="true">${BLOG_ORIGIN}/blog/${post.slug}</guid><description>${escapeXml(post.description)}</description><category>${escapeXml(post.category)}</category><pubDate>${new Date(BLOG_DATE).toUTCString()}</pubDate></item>`,
    )
    .join("");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Mediaory Blog</title><link>${BLOG_ORIGIN}/blog</link><description>Medya takibi, iletişim ölçümü ve fırsat keşfi rehberleri</description><language>tr-TR</language>${items}</channel></rss>`,
    {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}
