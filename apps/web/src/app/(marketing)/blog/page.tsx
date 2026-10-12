import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BLOG_ORIGIN,
  blogCategories,
  blogCover,
  blogPosts,
  readingMinutes,
  BLOG_PAGE_SIZE,
  blogPageHref,
  getBlogListing,
} from "@/content/blog";
import "./blog.css";

const baseMetadata: Metadata = {
  title: "Mediaory Blog | Medya takibi, iletişim ve fırsat rehberleri",
  description:
    "Medya takibi, PR ölçümü, fırsat radarı ve girişimcilik için uygulanabilir Türkçe rehberler. Kaynaklı cevaplar, örnekler ve kontrol listeleri.",
  alternates: {
    canonical: `${BLOG_ORIGIN}/blog`,
    types: { "application/rss+xml": `${BLOG_ORIGIN}/blog/feed.xml` },
  },
  openGraph: {
    type: "website",
    title: "Mediaory Blog — Sinyali karara dönüştürün",
    url: `${BLOG_ORIGIN}/blog`,
    locale: "tr_TR",
    images: [
      { url: `${BLOG_ORIGIN}${blogCover(blogPosts[0]!)}`, width: 1200, height: 630 },
    ],
  },
};

type BlogSearchParams = { kategori?: string | string[]; sayfa?: string | string[] };
function listing(params: BlogSearchParams) {
  const result = getBlogListing(
    typeof params.kategori === "string" ? params.kategori : undefined,
    typeof params.sayfa === "string" ? params.sayfa : undefined,
  );
  if (result.page > result.pages) notFound();
  return result;
}
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<BlogSearchParams>;
}): Promise<Metadata> {
  const { category, page } = listing(await searchParams);
  const canonical = `${BLOG_ORIGIN}${blogPageHref(category, page)}`;
  return {
    ...baseMetadata,
    title: page > 1 ? `Mediaory Blog | Sayfa ${page}` : baseMetadata.title,
    alternates: { ...baseMetadata.alternates, canonical },
    openGraph: { ...baseMetadata.openGraph, url: canonical },
    ...(category ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<BlogSearchParams>;
}) {
  const { category, posts, visible, pages, page } = listing(await searchParams);
  const featured = visible[0]!;
  return (
    <div className="blog-shell" lang="tr">
      <section className="blog-intro mk-wrap">
        <p className="blog-eyebrow">MEDIAORY / BİLGİDEN AKSİYONA</p>
        <h1>
          Gündemi okuyun.
          <br />
          <span className="mk-gradient-text">Bir sonraki adımı görün.</span>
        </h1>
        <p className="blog-lead">
          Medya takibi, iletişim ölçümü ve fırsat keşfi için pratik rehberler. Daha çok
          bilgi değil, daha iyi kararlar için.
        </p>
        <div className="blog-intro-meta">
          <span>{blogPosts.length} Türkçe rehber</span>
          <span>Örnekler ve kontrol listeleri</span>
          <Link href="/blog/feed.xml" prefetch={false}>
            RSS ile takip et ↗
          </Link>
        </div>
      </section>
      <nav className="blog-categories mk-wrap" aria-label="Blog kategorileri">
        <a
          href="/blog"
          aria-current={!category ? "page" : undefined}
        >
          Tüm yazılar
        </a>
        {blogCategories.map((item) => (
          <a
            key={item}
            href={`/blog?kategori=${encodeURIComponent(item)}`}
            aria-current={category === item ? "page" : undefined}
          >
            {item}
          </a>
        ))}
      </nav>
      <section className="mk-wrap blog-featured" aria-label="Öne çıkan rehber">
        <Link
          href={`/blog/${featured.slug}`}
          prefetch={false}
          className="blog-featured-image"
        >
          <Image
            src={blogCover(featured)}
            alt={`${featured.title} — Mediaory rehber kapağı`}
            width={1200}
            height={630}
            priority
            sizes="(max-width: 800px) 100vw, 60vw"
          />
        </Link>
        <div>
          <p className="blog-eyebrow">ÖNE ÇIKAN / {featured.category}</p>
          <h2>
            <Link href={`/blog/${featured.slug}`} prefetch={false}>
              {featured.title}
            </Link>
          </h2>
          <p>{featured.description}</p>
          <Link
            className="blog-text-link"
            prefetch={false}
            href={`/blog/${featured.slug}`}
          >
            Rehberi oku <span aria-hidden="true">↗</span>
          </Link>
          <span className="blog-reading">{readingMinutes(featured)} dk okuma</span>
        </div>
      </section>
      <section id="yazilar" className="mk-wrap blog-library" aria-label="Blog yazıları">
        <div className="blog-library-title">
          <h2>{category ?? "Keşfet, ölç, harekete geç"}</h2>
          <span>
            {posts.length} yazı · {(page - 1) * BLOG_PAGE_SIZE + 1}–
            {Math.min(page * BLOG_PAGE_SIZE, posts.length)}
          </span>
        </div>
        <div className="blog-grid">
          {visible.map((post) => (
            <article key={post.slug} className="blog-card">
              <Link
                href={`/blog/${post.slug}`}
                prefetch={false}
                className="blog-card-image"
                tabIndex={-1}
                aria-hidden="true"
              >
                <Image
                  src={blogCover(post)}
                  alt=""
                  width={1200}
                  height={630}
                  sizes="(max-width: 640px) 100vw, (max-width: 1000px) 50vw, 33vw"
                />
              </Link>
              <div className="blog-card-body">
                <p className="blog-eyebrow">
                  {post.category} <span>· {readingMinutes(post)} dk</span>
                </p>
                <h3>
                  <Link href={`/blog/${post.slug}`} prefetch={false}>
                    {post.title}
                  </Link>
                </h3>
                <p>{post.description}</p>
                <Link
                  className="blog-text-link"
                  prefetch={false}
                  href={`/blog/${post.slug}`}
                >
                  Yazıyı oku <span aria-hidden="true">↗</span>
                </Link>
              </div>
            </article>
          ))}
        </div>
        {pages > 1 && (
          <nav className="blog-pagination" aria-label="Blog sayfaları">
            {page > 1 && (
              <a
                href={`${blogPageHref(category, page - 1)}#yazilar`}
              >
                ← Önceki sayfa
              </a>
            )}
            {Array.from({ length: pages }, (_, index) => index + 1).map((number) => (
              <a
                key={number}
                href={`${blogPageHref(category, number)}#yazilar`}
                aria-label={`${number}. sayfa`}
                aria-current={page === number ? "page" : undefined}
              >
                {number}
              </a>
            ))}
            {page < pages && (
              <a
                href={`${blogPageHref(category, page + 1)}#yazilar`}
              >
                Sonraki sayfa →
              </a>
            )}
          </nav>
        )}
      </section>
      <section className="mk-wrap blog-bottom-cta">
        <p className="blog-eyebrow">OKUMAKTAN UYGULAMAYA</p>
        <h2>
          Rehberiniz hazır.
          <br />
          Şimdi kendi sinyallerinizi keşfedin.
        </h2>
        <p>
          Marka ve sektör takibinizi kurun, fırsatları değerlendirme gündeminize
          taşıyın.
        </p>
        <div>
          <Link
            className="mk-btn mk-btn-primary"
            href="/register?utm_source=mediaory_blog&utm_medium=internal&utm_campaign=blog_library"
          >
            Mediaory ile başlayın
          </Link>
          <Link className="mk-btn mk-btn-ghost" href="/features">
            Özellikleri inceleyin
          </Link>
        </div>
      </section>
    </div>
  );
}
