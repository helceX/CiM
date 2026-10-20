"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@cim/ui";

type Editing = { id: string; brand: string; handle: string; excluded: string[] };
export function SocialSetup({ canSetup, turkish, editing }: { canSetup: boolean; turkish: boolean; editing?: Editing }) {
  const router = useRouter();
  const [brand, setBrand] = useState(editing?.brand ?? "");
  const [handle, setHandle] = useState(editing?.handle ?? "");
  const [excluded, setExcluded] = useState(editing?.excluded.join(", ") ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const text = (tr: string, en: string) => turkish ? tr : en;

  async function setup(example = false) {
    setBusy(true); setMessage(""); setFailed(false);
    try {
      const response = await fetch("/api/social/setup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: example ? "Bluesky" : brand, handle: example ? "bsky.app" : handle, example, excluded: example ? [] : excluded.split(",").map((term) => term.trim()).filter(Boolean), ...(!example && editing ? { queryId: editing.id } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? text("Kurulum tamamlanamadı.", "Setup failed."));
      setMessage(result.active
        ? text(`Takip ve panel bildirimleri hazır. Ön kontrolde ${result.sampleCount} uygun, tekil gönderi bulundu. Sonuçlar ilk tarama veya sonraki normal kontrolün ardından görünür; yaklaşık 8 saate kadar sürebilir.`, `Monitoring and in-app alerts are ready. Preflight found ${result.sampleCount} matching, unique posts. Results appear after the first crawl or next normal check; this can take up to approximately 8 hours.`)
        : text("Kurulum zaten var, ancak izleme veya bildirim kuralı durdurulmuş. İzlemeler ve Uyarılar bölümünden kontrol edin.", "Setup already exists, but monitoring or its alert rule is paused. Review Monitoring and Alerts."));
      router.refresh();
    } catch (error) {
      setFailed(true); setMessage(error instanceof Error ? error.message : text("Bağlantı kurulamadı.", "Could not connect."));
    } finally { setBusy(false); }
  }

  return (
    <section className="rounded-lg border border-border p-4">
      <h2 className="text-sm font-semibold">{text("Etiketlense de, yalnızca adı geçse de takip edin", "Monitor tags and names mentioned in plain text")}</h2>
      {editing ? <p className="mt-2 text-sm">{text("Mevcut sosyal takibi düzenliyorsunuz. Önceki eşleşmeler korunur; yeni kurallar sonraki taramalarda uygulanır.", "You are editing an existing social monitoring. Previous matches are kept; new rules apply to future crawls.")} <Link href="/social" className="text-primary underline">{text("Yeni takip oluştur", "Create a new monitoring")}</Link></p> : null}
      <p className="mt-2 text-sm text-muted-foreground">
        {text("Bluesky'nin açık gönderilerinde marka adınızı ve @hesabınızı arayın. Yeni eşleşmeler için panel bildirimi oluşturulur; bir saatlik bekleme süresi tekrar bildirimleri sınırlar.", "Search public Bluesky posts for your brand name and @account. New matches generate in-app alerts, with a one-hour cooldown to limit repeated notifications.")}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        {text("Kapsam: son 3 günün en yeni 30 sonucu, arama başına 8 saatte bir kontrol. Yoğun aramalarda gönderiler kaçabilir; bütün ağın veya geçmişin eksiksiz taraması değildir. Instagram, X, Facebook ve LinkedIn bu ücretsiz bağlantıya dahil değildir.", "Coverage: the latest 30 results from the past 3 days, checked every 8 hours per search. Busy searches may miss posts; this is not a complete network or historical scan. Instagram, X, Facebook and LinkedIn are not included in this free connection.")}
      </p>
      {canSetup ? (
        <form className="mt-4 flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void setup(); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="social-brand">{text("Marka / kurum adı", "Brand / organization name")}</Label><Input id="social-brand" value={brand} onChange={(event) => setBrand(event.target.value)} placeholder="Lunavera Teknoloji" minLength={2} maxLength={80} required disabled={busy} /></div>
            <div><Label htmlFor="social-handle">{text("Bluesky hesabı (isteğe bağlı)", "Bluesky account (optional)")}</Label><Input id="social-handle" value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="@lunavera.bsky.social" maxLength={100} disabled={busy} /></div>
          </div>
          <div><Label htmlFor="social-excluded">{text("Hariç tutulacak ifadeler (isteğe bağlı)", "Excluded phrases (optional)")}</Label><Input id="social-excluded" value={excluded} onChange={(event) => setExcluded(event.target.value)} placeholder={text("çekiliş, kupon, ilgisiz ürün adı", "giveaway, coupon, unrelated product name")} maxLength={610} disabled={busy} /><p className="mt-1 text-xs text-muted-foreground">{text("Virgülle ayırın; en fazla 10 ifade. Bunlardan birini içeren gönderiler bildirim oluşturmaz. Yalnızca URL içinde geçen kelimeler marka bahsetmesi sayılmaz.", "Separate up to 10 phrases with commas. Posts containing any of these will not trigger alerts. Words appearing only inside URLs are not counted as brand mentions.")}</p></div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>{editing ? text("Değişiklikleri kaydet", "Save changes") : text("Takibi ve bildirimleri kur", "Set up monitoring and alerts")}</Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void setup(true)}>{text("Gerçek gönderilerle çalışma örneği kur", "Set up a working example with real posts")}</Button>
          </div>
          <p className="text-xs text-muted-foreground">{text("Çalışma örneği, Bluesky hakkında paylaşılan gerçek gönderileri toplar; kuruluşunuzun sonuçları olarak sunulmaz. Her kuruluş kendi kelimelerini ve hesabını girer; en fazla 3 sosyal izleme kurulabilir.", "The working example collects real posts about Bluesky; they are not presented as results about your organization. Each organization enters its own words and account; up to 3 social monitorings can be configured.")}</p>
          {message ? <p role={failed ? "alert" : "status"} className={`text-sm ${failed ? "text-destructive" : "text-muted-foreground"}`}>{message}</p> : null}
        </form>
      ) : <p className="mt-3 text-sm text-muted-foreground">{text("Bu kuruluşta izleme ve bildirim oluşturma yetkiniz bulunmuyor. İzleme kurallarınızı İzlemeler, bildirimlerinizi Uyarılar bölümünden yönetebilirsiniz.", "You do not have permission to create monitoring and alerts in this organization. Manage monitoring rules in Monitoring and notifications in Alerts.")}</p>}
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-primary">{text("İki eşleşme türünü örneklerle görün", "See examples of both match types")}</summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div className="rounded border border-border p-3"><p className="text-xs text-muted-foreground">{text("Temsili senaryo · gerçek gönderi değildir", "Illustrative scenario · not a real post")}</p><p className="mt-2">“@lunavera.bsky.social {text("yeni ürününüz ne zaman çıkıyor?", "when is your new product launching?") }”</p><p className="mt-2 font-medium">{text("Hesap etiketi → eşleşme → panel bildirimi", "Account tag → match → in-app notification")}</p></div>
          <div className="rounded border border-border p-3"><p className="text-xs text-muted-foreground">{text("Temsili senaryo · gerçek gönderi değildir", "Illustrative scenario · not a real post")}</p><p className="mt-2">“Lunavera Teknoloji {text("yeni enerji çözümüyle dikkatimi çekti.", "caught my attention with its new energy solution.") }”</p><p className="mt-2 font-medium">{text("Etiketsiz marka adı → eşleşme → panel bildirimi", "Untagged brand name → match → in-app notification")}</p></div>
        </div>
      </details>
    </section>
  );
}
