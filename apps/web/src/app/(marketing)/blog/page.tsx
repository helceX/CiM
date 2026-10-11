import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  BLOG_ORIGIN,
  blogCategories,
  blogCover,
  blogPosts,
  readingMinutes,
} from "@/content/blog";
import "./blog.css";

export const metadata: Metadata = {
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

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ kategori?: string }>;
}) {
  const { kategori } = await searchParams;
  const category = blogCategories.includes(kategori ?? "") ? kategori : undefined;
  const posts = category
    ? blogPosts.filter((post) => post.category === category)
    : blogPosts;
  const featured = posts[0]!;
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
        <Link href="/blog" aria-current={!category ? "page" : undefined}>
          Tüm yazılar
        </Link>
        {blogCategories.map((item) => (
          <Link
            key={item}
            href={`/blog?kategori=${encodeURIComponent(item)}`}
            aria-current={category === item ? "page" : undefined}
          >
            {item}
          </Link>
        ))}
      </nav>
      <section className="mk-wrap blog-featured" aria-label="Öne çıkan rehber">
        <Link href={`/blog/${featured.slug}`} className="blog-featured-image">
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
            <Link href={`/blog/${featured.slug}`}>{featured.title}</Link>
          </h2>
          <p>{featured.description}</p>
          <Link className="blog-text-link" href={`/blog/${featured.slug}`}>
            Rehberi oku <span aria-hidden="true">↗</span>
          </Link>
          <span className="blog-reading">{readingMinutes(featured)} dk okuma</span>
        </div>
      </section>
      <section className="mk-wrap blog-library" aria-label="Blog yazıları">
        <div className="blog-library-title">
          <h2>{category ?? "Keşfet, ölç, harekete geç"}</h2>
          <span>{posts.length} yazı</span>
        </div>
        <div className="blog-grid">
          {posts.map((post) => (
            <article key={post.slug} className="blog-card">
              <Link
                href={`/blog/${post.slug}`}
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
                  <Link href={`/blog/${post.slug}`}>{post.title}</Link>
                </h3>
                <p>{post.description}</p>
                <Link className="blog-text-link" href={`/blog/${post.slug}`}>
                  Yazıyı oku <span aria-hidden="true">↗</span>
                </Link>
              </div>
            </article>
          ))}
        </div>
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
