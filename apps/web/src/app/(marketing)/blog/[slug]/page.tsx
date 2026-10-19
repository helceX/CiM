import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BLOG_AUTHOR,
  BLOG_DATE,
  BLOG_ORIGIN,
  blogCover,
  blogJsonLd,
  blogPosts,
  getBlogPost,
  readingMinutes,
} from "@/content/blog";
import "../blog.css";

export function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const post = getBlogPost((await params).slug);
  if (!post) notFound();
  const url = `${BLOG_ORIGIN}/blog/${post.slug}`;
  return {
    title: `${post.title} | Mediaory Blog`,
    description: post.description,
    keywords: post.keywords,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      url,
      locale: "tr_TR",
      publishedTime: BLOG_DATE,
      modifiedTime: post.modifiedAt ?? BLOG_DATE,
      authors: [BLOG_AUTHOR],
      images: [
        {
          url: `${BLOG_ORIGIN}${blogCover(post)}`,
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
      images: [`${BLOG_ORIGIN}${blogCover(post)}`],
    },
  };
}
export default async function BlogArticle({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const post = getBlogPost((await params).slug);
  if (!post) notFound();
  const related = post.related.map(getBlogPost).filter((item) => item !== undefined);
  const shareUrl = encodeURIComponent(`${BLOG_ORIGIN}/blog/${post.slug}`);
  return (
    <div className="blog-shell" lang="tr">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(blogJsonLd(post)).replace(/</g, "\\u003c"),
        }}
      />
      <header className="mk-wrap blog-article-head">
        <nav aria-label="İçerik yolu" className="blog-breadcrumb">
          <Link href="/">Ana sayfa</Link>
          <span>/</span>
          <Link href="/blog">Blog</Link>
          <span>/</span>
          <span>{post.category}</span>
        </nav>
        <p className="blog-eyebrow">{post.category}</p>
        <h1>{post.title}</h1>
        <p className="blog-lead">{post.description}</p>
        <div className="blog-intro-meta">
          <span>{BLOG_AUTHOR}</span>
          <time dateTime={BLOG_DATE}>11 Ekim 2026</time>
          {post.modifiedAt ? (
            <time dateTime={post.modifiedAt}>
              Güncelleme:{" "}
              {new Intl.DateTimeFormat("tr-TR", {
                dateStyle: "long",
                timeZone: "Europe/Istanbul",
              }).format(new Date(post.modifiedAt))}
            </time>
          ) : null}
          <span>{readingMinutes(post)} dk okuma</span>
        </div>
        <Image
          className="blog-article-cover"
          src={blogCover(post)}
          alt={`${post.title} — özgün Mediaory kapak görseli`}
          width={1200}
          height={630}
          priority
          sizes="(max-width: 1200px) 100vw, 1152px"
        />
      </header>
      <div className="mk-wrap blog-reading-layout">
        <aside className="blog-toc">
          <p>BU REHBERDE</p>
          <nav aria-label="İçindekiler">
            <a href="#kisa-cevap">Kısa cevap</a>
            {post.sections.map((section, index) => (
              <a key={section.title} href={`#bolum-${index + 1}`}>
                {section.title}
              </a>
            ))}
            <a href="#kontrol-listesi">Kontrol listesi</a>
            <a href="#sik-sorulan-sorular">Sık sorulan sorular</a>
          </nav>
          <Link href="/blog" className="blog-text-link">
            ← Tüm rehberler
          </Link>
        </aside>
        <article className="blog-prose">
          <section id="kisa-cevap" className="blog-answer">
            <p className="blog-eyebrow">KISA CEVAP</p>
            <p>{post.answer}</p>
          </section>
          {post.sections.map((section, index) => (
            <section id={`bolum-${index + 1}`} key={section.title}>
              <h2>{section.title}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
          {post.download ? (
            <section aria-labelledby="download-heading">
              <h2 id="download-heading">Uygulama şablonu</h2>
              <p>{post.download.description}</p>
              <a className="mk-btn mk-btn-primary" href={post.download.href} download>
                {post.download.label}
              </a>
            </section>
          ) : null}
          <section id="kontrol-listesi" className="blog-checklist">
            <h2>Uygulama kontrol listesi</h2>
            <ul>
              {post.checklist.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
          <section className="blog-service-cta">
            <p className="blog-eyebrow">MEDIAORY İLE SONRAKİ ADIM</p>
            <h2>{post.cta.title}</h2>
            <p>{post.cta.body}</p>
            <Link
              className="mk-btn mk-btn-primary"
              prefetch={false}
              href={`/register/blog/${post.slug}`}
            >
              Mediaory hesabınızı oluşturun ↗
            </Link>
            <Link
              className="mk-btn mk-btn-primary"
              href={`${post.cta.href}?utm_source=mediaory_blog&utm_medium=internal&utm_campaign=${post.slug}`}
            >
              {post.cta.label} ↗
            </Link>
            <Link
              className="blog-text-link"
              href={`/contact?utm_source=mediaory_blog&utm_medium=internal&utm_campaign=${post.slug}`}
            >
              İhtiyacınızı birlikte değerlendirelim
            </Link>
          </section>
          <section id="sik-sorulan-sorular">
            <h2>Sık sorulan sorular</h2>
            {post.faq.map((item) => (
              <details className="blog-faq" key={item.question}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </section>
          {post.sources?.length ? (
            <section className="blog-sources">
              <h2>Kaynaklar ve ek okuma</h2>
              <p>
                Kaynak bağlantıları 11 Ekim 2026 tarihinde kontrol edildi. Güncel
                koşullar için ilgili kurumun belgeleri esas alınır.
              </p>
              <ul>
                {post.sources.map((source) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noopener noreferrer">
                      {source.title} ↗
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <div className="blog-share">
            <p>Bu rehberi ekibinizle paylaşın</p>
            <a
              href={`https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              LinkedIn ↗
            </a>
            <a
              href={`mailto:?subject=${encodeURIComponent(post.title)}&body=${shareUrl}`}
            >
              E-posta ↗
            </a>
          </div>
        </article>
      </div>
      <section className="mk-wrap blog-library">
        <div className="blog-library-title">
          <h2>Bir sonraki rehberiniz</h2>
          <Link href="/blog">Tüm yazılar ↗</Link>
        </div>
        <div className="blog-grid">
          {related.map((item) => (
            <article className="blog-card" key={item.slug}>
              <Link
                href={`/blog/${item.slug}`}
                className="blog-card-image"
                tabIndex={-1}
                aria-hidden="true"
              >
                <Image
                  src={blogCover(item)}
                  alt=""
                  width={1200}
                  height={630}
                  sizes="(max-width: 640px) 100vw, 33vw"
                />
              </Link>
              <div className="blog-card-body">
                <p className="blog-eyebrow">{item.category}</p>
                <h3>
                  <Link href={`/blog/${item.slug}`}>{item.title}</Link>
                </h3>
                <p>{item.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
