import { getTranslations } from "next-intl/server";
import { hashToken } from "@cim/core";
import { db, findPendingInvitationByTokenHash } from "@cim/db";
import { AuthCard } from "@/components/auth-card";
import { AcceptInvitationForm } from "./accept-invitation-form";

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const t = await getTranslations("auth.invitation");
  const invitation = token
    ? await findPendingInvitationByTokenHash(db, hashToken(token))
    : undefined;

  if (!invitation) {
    return (
      <AuthCard title={t("notFoundTitle")}>
        <p className="text-sm text-muted-foreground">{t("notFound")}</p>
      </AuthCard>
    );
  }

  const roleKey = `roles.${invitation.role}` as Parameters<typeof t.has>[0];
  const role = t.has(roleKey) ? t(roleKey) : invitation.role;

  return (
    <AuthCard title={t("joinTitle", { organization: invitation.organizationName })}>
      <p className="mb-4 text-sm text-muted-foreground">
        {t.rich("intro", {
          organization: invitation.organizationName,
          role,
          strong: (chunks) => <strong className="text-foreground">{chunks}</strong>,
        })}
      </p>
      <AcceptInvitationForm token={token!} email={invitation.email} />
    </AuthCard>
  );
}
