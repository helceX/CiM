"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogTrigger,
  Field,
  Input,
  Select,
} from "@cim/ui";
import type { MemberRow } from "@cim/db";

const ASSIGNABLE_ROLES = [
  { value: "organization_admin", label: "Organization Admin" },
  { value: "communications_manager", label: "Communications Manager" },
  { value: "analyst", label: "Analyst" },
  { value: "viewer", label: "Viewer" },
  { value: "report_recipient", label: "Report Recipient" },
] as const;

function formatRole(role: string): string {
  const known = ASSIGNABLE_ROLES.find((r) => r.value === role);
  if (known) return known.label;
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function MembersSection({
  members,
  canManageMembers,
  currentUserId,
}: {
  members: MemberRow[];
  canManageMembers: boolean;
  currentUserId: string;
}) {
  return (
    <section>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Members</h2>
          <p className="text-sm text-muted-foreground">
            Who has access to this organization.
          </p>
        </div>
        {canManageMembers ? <InviteMemberDialog /> : null}
      </div>
      <div className="mt-3 overflow-hidden rounded-lg border border-border">
        <ul className="divide-y divide-border">
          {members.map((member) => {
            const isOwner = member.role === "organization_owner";
            const isSelf = member.userId === currentUserId;
            return (
              <li
                key={member.membershipId}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {member.firstName} {member.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">{member.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  {member.status === "invited" ? (
                    <Badge tone="warning">Invited</Badge>
                  ) : null}
                  {canManageMembers && !isOwner ? (
                    <RoleSelect membershipId={member.membershipId} role={member.role} />
                  ) : (
                    <Badge tone="neutral">{formatRole(member.role)}</Badge>
                  )}
                  {canManageMembers && !isOwner && !isSelf ? (
                    <RevokeMemberDialog
                      membershipId={member.membershipId}
                      name={`${member.firstName} ${member.lastName}`}
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function InviteMemberDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>(ASSIGNABLE_ROLES[0].value);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleInvite() {
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/organizations/members/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setOpen(false);
      setEmail("");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          Invite member
        </Button>
      </DialogTrigger>
      <DialogContent title="Invite a member">
        <div className="mt-4 flex flex-col gap-4">
          <Field id="invite-email" label="Email">
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
            />
          </Field>
          <Field id="invite-role" label="Role">
            <Select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleInvite}
              disabled={isSubmitting || !email}
            >
              {isSubmitting ? "Sending…" : "Send invite"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RoleSelect({ membershipId, role }: { membershipId: string; role: string }) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(nextRole: string) {
    setError(null);
    setIsSaving(true);
    try {
      const response = await fetch(`/api/organizations/members/${membershipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Select
        aria-label="Role"
        value={role}
        disabled={isSaving}
        onChange={(e) => handleChange(e.target.value)}
        className="h-8 text-xs"
      >
        {ASSIGNABLE_ROLES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </Select>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

function RevokeMemberDialog({
  membershipId,
  name,
}: {
  membershipId: string;
  name: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleRevoke() {
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/organizations/members/${membershipId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="danger">
          Revoke
        </Button>
      </DialogTrigger>
      <DialogContent title="Revoke access">
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{name}</strong> will immediately lose
            access to this organization, and any active session of theirs will be signed
            out.
          </p>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleRevoke}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Revoking…" : "Revoke access"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
