"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogTrigger,
  Field,
  Input,
} from "@cim/ui";
import type { CustomRole } from "@cim/db";
import type { Permission } from "@cim/core";

const PERMISSION_LABELS: Record<Permission, string> = {
  "org:manage_settings": "Manage organization settings",
  "org:manage_members": "Manage members and roles",
  "org:manage_billing": "Manage billing",
  "monitoring:read": "View monitoring queries",
  "monitoring:write": "Create and edit monitoring queries",
  "mentions:read": "View mentions",
  "mentions:write": "Assign, tag, and comment on mentions",
  "alerts:read": "View alert rules",
  "alerts:write": "Create and edit alert rules",
  "reports:read": "View reports",
  "reports:write": "Create, schedule, and share reports",
  "sources:read": "View sources",
  "sources:manage": "Manage sources",
  "api_keys:manage": "Manage API keys",
  "audit_log:read": "View the audit log",
};

/**
 * docs/product/FEATURE_MATRIX.md P2 "RBAC custom roles" — ADR-005's own
 * plan for this feature: an org owner/admin defines a role as a name
 * plus a subset of the same Permission table a fixed role is defined
 * against (packages/core/src/authz.ts), then assigns members to it
 * exactly like a fixed role, in the section above.
 */
export function CustomRolesSection({ customRoles }: { customRoles: CustomRole[] }) {
  return (
    <section>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Custom roles</h2>
          <p className="text-sm text-muted-foreground">
            Define roles with exactly the permissions a member needs.
          </p>
        </div>
        <RoleFormDialog trigger={<Button type="button" size="sm">New role</Button>} />
      </div>
      {customRoles.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No custom roles yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {customRoles.map((role) => (
            <li
              key={role.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{role.name}</p>
                <p className="text-xs text-muted-foreground">
                  {role.permissions.length} permission{role.permissions.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <RoleFormDialog
                  role={role}
                  trigger={
                    <Button type="button" size="sm" variant="secondary">
                      Edit
                    </Button>
                  }
                />
                <DeleteRoleDialog roleId={role.id} name={role.name} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RoleFormDialog({
  role,
  trigger,
}: {
  role?: CustomRole;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const isEdit = Boolean(role);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(role?.name ?? "");
  const [permissions, setPermissions] = useState<Permission[]>(
    (role?.permissions as Permission[]) ?? [],
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function togglePermission(permission: Permission) {
    setPermissions((prev) =>
      prev.includes(permission) ? prev.filter((p) => p !== permission) : [...prev, permission],
    );
  }

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(
        isEdit ? `/api/organizations/roles/${role!.id}` : "/api/organizations/roles",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, permissions }),
        },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setOpen(false);
      if (!isEdit) {
        setName("");
        setPermissions([]);
      }
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={isEdit ? "Edit role" : "New custom role"}>
        <div className="mt-4 flex flex-col gap-4">
          <Field id="role-name" label="Name">
            <Input
              id="role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Crisis Responder"
            />
          </Field>
          <fieldset>
            <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Permissions
            </legend>
            <div className="mt-2 flex max-h-64 flex-col gap-2 overflow-y-auto">
              {(Object.entries(PERMISSION_LABELS) as [Permission, string][]).map(
                ([permission, label]) => (
                  <label
                    key={permission}
                    className="flex items-center gap-2 text-sm text-foreground"
                  >
                    <Checkbox
                      checked={permissions.includes(permission)}
                      onCheckedChange={() => togglePermission(permission)}
                    />
                    {label}
                  </label>
                ),
              )}
            </div>
          </fieldset>
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
              onClick={handleSubmit}
              disabled={isSubmitting || !name.trim() || permissions.length === 0}
            >
              {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Create role"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeleteRoleDialog({ roleId, name }: { roleId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleDelete() {
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/organizations/roles/${roleId}`, { method: "DELETE" });
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
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent title="Delete role">
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Delete <strong className="text-foreground">{name}</strong>? Members currently
            assigned to it must be moved to a different role first.
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
            <Button type="button" variant="danger" onClick={handleDelete} disabled={isSubmitting}>
              {isSubmitting ? "Deleting…" : "Delete role"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
