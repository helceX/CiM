import { hashToken } from "@cim/core";
import { db, findPendingInvitationByTokenHash } from "@cim/db";
import { AuthCard } from "@/components/auth-card";
import { AcceptInvitationForm } from "./accept-invitation-form";

const ROLE_LABEL: Record<string, string> = {
  organization_admin: "Organization Admin",
  communications_manager: "Communications Manager",
  analyst: "Analyst",
  viewer: "Viewer",
  report_recipient: "Report Recipient",
};

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const invitation = token
    ? await findPendingInvitationByTokenHash(db, hashToken(token))
    : undefined;

  if (!invitation) {
    return (
      <AuthCard title="Invitation not found">
        <p className="text-sm text-muted-foreground">
          This invitation link is invalid, expired, or has already been used. Ask
          whoever invited you to send a new one.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={`Join ${invitation.organizationName}`}>
      <p className="mb-4 text-sm text-muted-foreground">
        You&apos;ve been invited to join{" "}
        <strong className="text-foreground">{invitation.organizationName}</strong> on
        CiM as a{" "}
        <strong className="text-foreground">
          {ROLE_LABEL[invitation.role] ?? invitation.role}
        </strong>
        . Set up your account to accept.
      </p>
      <AcceptInvitationForm token={token!} email={invitation.email} />
    </AuthCard>
  );
}
