import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@cim/db";
import { getBlogPost } from "@/content/blog";
import { requireSuperAdmin } from "@/lib/admin";
import { validBlogSource } from "@/lib/blog-attribution";

export const dynamic = "force-dynamic";
export default async function GrowthPage() {
  await requireSuperAdmin();
  // One bounded read on demand; existing registration audit rows only, no per-page writes.
  const result = await db.execute(sql`
    select case when metadata->'acquisition'->>'channel' = 'blog'
      then metadata->'acquisition'->>'slug' else null end as slug,
      count(*)::int as registrations
    from audit_logs
    where action = 'user.registered' and created_at >= now() - interval '30 days'
    group by 1 order by registrations desc limit 102
  `);
  const rows = result.rows as { slug: string | null; registrations: number }[];
  const blogRegistrations = rows.filter(row => validBlogSource(row.slug));
  const unmeasured = rows.filter(row => !validBlogSource(row.slug)).reduce((sum, row) => sum + row.registrations, 0);
  return <main className="mx-auto max-w-5xl space-y-6 p-6">
    <h1 className="text-2xl font-semibold">Blog ve kayıt dönüşümü</h1>
    <p className="text-muted-foreground">Son 30 gün. Blogdan kayıt ekranına gelen ve yeni hesap oluşturan kullanıcıların toplu sayısı. Bu sayı e-posta doğrulaması, aktif kullanım veya ücretli müşterilik anlamına gelmez.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-lg border border-border p-5"><p>Blog kaynaklı yeni kayıt</p><strong className="text-3xl">{blogRegistrations.reduce((sum, row) => sum + row.registrations, 0)}</strong></div>
      <div className="rounded-lg border border-border p-5"><p>Kaynağı ölçülmeyen diğer kayıtlar</p><strong className="text-3xl">{unmeasured}</strong></div>
    </div>
    <p className="text-sm text-muted-foreground">Ölçüm bu sürümle başladı; eski kayıtların kaynağı geriye dönük tahmin edilmez. Mevcut hesabıyla giriş yapan kullanıcı yeni kayıt olarak sayılmaz. Kaynak bilgisi olmayan veya süresi dolmuş bir geçiş diğer kayıtlara dahil edilir.</p>
    <table className="w-full text-left text-sm"><thead><tr><th className="p-3">Kaynak yazı</th><th className="p-3">Yeni kayıt</th></tr></thead><tbody>
      {blogRegistrations.map(row => <tr key={row.slug} className="border-t border-border"><td className="p-3"><Link href={row.slug === "blog-library" ? "/blog" : `/blog/${row.slug}`} className="underline">{row.slug === "blog-library" ? "Blog ana sayfası" : getBlogPost(row.slug!)?.title}</Link></td><td className="p-3">{row.registrations}</td></tr>)}
      {!blogRegistrations.length ? <tr><td className="p-3" colSpan={2}>Henüz ölçülen blog kaynaklı kayıt yok.</td></tr> : null}
    </tbody></table>
    <section className="rounded-lg border border-border p-5 space-y-3"><h2 className="font-semibold">Ziyaret ve arama raporları</h2>
      <p>Cloudflare Web Analytics’te blog görüntülenmeleri için Path starts with /blog; kayıt ekranına geçişler için Path starts with /register/blog/ filtresini kullanın. Aynı kişinin tekrar ziyaretleri mümkündür; bunlar benzersiz kişi sayısı değildir.</p>
      <p>Pazarlama raporlarında yönetim ve panel adreslerini dışlayın. Bu, ana sayfayı test eden ekibi tamamen ayırmaz. Google gösterimleri ve tıklamaları Search Console’dan izlenir.</p>
      <div className="flex flex-wrap gap-4"><a className="underline" href="https://dash.cloudflare.com" target="_blank" rel="noopener noreferrer">Cloudflare Web Analytics ↗</a><a className="underline" href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer">Google Search Console ↗</a></div>
    </section>
  </main>;
}
