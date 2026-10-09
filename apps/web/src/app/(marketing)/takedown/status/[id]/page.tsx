import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db, getPublicTakedownStatus } from "@cim/db";

export const dynamic = "force-dynamic";

export default async function TakedownStatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) notFound();
  const request = await getPublicTakedownStatus(db, id);
  if (!request) notFound();

  const t = await getTranslations("legal.takedown");
  const statusKey = request.status === "resolved" ? "resolved" : request.status === "rejected" ? "rejected" : "open";
  return (
    <main className="mk-section">
      <div className="mk-wrap max-w-2xl">
        <h1 className="text-2xl font-extrabold">{t("statusTitle")}</h1>
        <p className="mt-3 text-[var(--mk-muted)]">{t("requestId", { id: request.id })}</p>
        <p className="mt-2 text-sm text-white">{t("statusValue", { status: t(`status.${statusKey}`) })}</p>
        <p className="mt-2 text-sm text-[var(--mk-muted)]">{t("statusUpdated", { date: (request.resolvedAt ?? request.createdAt).toISOString() })}</p>
        <Link href="/takedown" className="mt-5 inline-block underline underline-offset-2">{t("newRequest")}</Link>
      </div>
    </main>
  );
}
