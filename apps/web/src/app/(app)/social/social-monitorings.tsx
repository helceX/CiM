"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button } from "@cim/ui";

type Monitoring = { queryId: string; queryName: string; queryStatus: string; canConfigure: boolean; sources: { id: string; term: string; status: string; checkedAt: string | null }[] };

export function SocialMonitorings({ items, canEdit, turkish }: { items: Monitoring[]; canEdit: boolean; turkish: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const text = (tr: string, en: string) => turkish ? tr : en;
  async function toggle(item: Monitoring) {
    setBusy(item.queryId); setError("");
    try {
      const response = await fetch(`/api/social/${item.queryId}/state`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: item.queryStatus === "active" ? "paused" : "active" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? text("İşlem tamamlanamadı.", "Could not update monitoring."));
      router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : text("Bağlantı kurulamadı.", "Connection failed.")); }
    finally { setBusy(null); }
  }
  return <section className="rounded-lg border border-border p-4" aria-label={text("Takiplerim ve kaynak durumu", "My monitorings and source health")}>
    <h2 className="text-sm font-semibold">{text("Takiplerim ve kaynak durumu", "My monitorings and source health")}</h2>
    <p className="mt-1 text-xs text-muted-foreground">{text("Kontrol zamanı, kaynağa en son bakılan zamandır; yeni gönderi bulunduğu anlamına gelmez. Durdurulan takip bildirim üretmez. Başka bir kuruluş aynı kaynağı kullanıyorsa ortak tarama sürebilir.", "The check time is the last source check, not proof of a new post. Paused monitorings do not generate alerts. Shared collection may continue if another organization needs the same search.")}</p>
    {error ? <p role="alert" className="mt-2 text-sm text-destructive">{error}</p> : null}
    <ul className="mt-3 flex flex-col gap-4">{items.map((item) => <li key={item.queryId} className="rounded border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Link href={`/social?query=${item.queryId}`} className="text-sm text-primary">{item.queryName}</Link><Badge tone={item.queryStatus === "active" ? "success" : "neutral"}>{item.queryStatus === "active" ? text("Aktif", "Active") : text("Durduruldu", "Paused")}</Badge></div>
      {canEdit && item.canConfigure ? <div className="flex items-center gap-3"><Link href={`/social?query=${item.queryId}&edit=1`} className="text-xs text-primary underline">{text("Düzenle", "Edit")}</Link><Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void toggle(item)} aria-label={`${item.queryStatus === "active" ? text("Takibi durdur", "Pause monitoring") : text("Takibi başlat", "Resume monitoring")}: ${item.queryName}`}>{item.queryStatus === "active" ? text("Durdur", "Pause") : text("Başlat", "Resume")}</Button></div> : null}</div>
      {item.sources.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">{text("Bu ifadeler için Bluesky arama kaynağı kurulmamış. Sosyal takip formuyla bağlantıyı hazırlayın.", "No Bluesky search source is configured for these terms. Use the social setup form to prepare the connection.")}</p> : <ul className="mt-2 flex flex-col gap-1">{item.sources.map((source) => <li key={source.id} className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{source.term}</span> · {source.status === "healthy" ? text("Kaynak yanıt verdi", "Source responded") : source.status === "unavailable" ? text("Kaynak durdurulmuş", "Source disabled") : source.status === "error" || source.status === "blocked" ? text("Kaynak hatası / erişim sorunu", "Source error / access issue") : text("Kontrol bekleniyor", "Awaiting check")} · {text("Son kontrol", "Last check")}: {source.checkedAt ? new Date(source.checkedAt).toLocaleString(turkish ? "tr-TR" : "en-GB", { timeZone: "Europe/Istanbul" }) : text("İlk tarama bekleniyor", "Awaiting first crawl")}</li>)}</ul>}
    </li>)}</ul>
  </section>;
}
