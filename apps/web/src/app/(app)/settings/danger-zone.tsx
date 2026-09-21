"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, DialogContent, DialogTrigger, Field, Input } from "@cim/ui";

export function DataExportButton() {
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    setIsExporting(true);
    try {
      const response = await fetch("/api/account/export");
      if (!response.ok) return;
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "cim-account-export.json";
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Button type="button" variant="secondary" onClick={handleExport} disabled={isExporting}>
      {isExporting ? "Preparing export…" : "Export my data"}
    </Button>
  );
}

export function DeleteAccountDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleDelete() {
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.code === "SOLE_OWNER" && Array.isArray(data.organizations)) {
          setError(`${data.error} (${data.organizations.join(", ")})`);
        } else {
          setError(data.error ?? "Something went wrong. Please try again.");
        }
        return;
      }
      router.push("/login");
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
        <Button type="button" variant="danger">
          Delete my account
        </Button>
      </DialogTrigger>
      <DialogContent title="Delete your account">
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            This permanently anonymizes your name, email, and password. It can&apos;t be undone.
            Confirm your password to continue.
          </p>
          <Field id="delete-account-password" label="Password">
            <Input
              id="delete-account-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
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
            <Button type="button" variant="danger" onClick={handleDelete} disabled={isSubmitting || !password}>
              {isSubmitting ? "Deleting…" : "Delete my account"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteOrganizationDialog({ organizationName }: { organizationName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleDelete() {
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/organizations/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      router.push("/login");
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
        <Button type="button" variant="danger">
          Delete organization
        </Button>
      </DialogTrigger>
      <DialogContent title="Delete this organization">
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            This removes every member&apos;s access and stops all monitoring for{" "}
            <strong className="text-foreground">{organizationName}</strong>. It can&apos;t be undone.
            Type the organization name to confirm.
          </p>
          <Field id="delete-org-confirm" label={`Type "${organizationName}" to confirm`}>
            <Input
              id="delete-org-confirm"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
            />
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
              variant="danger"
              onClick={handleDelete}
              disabled={isSubmitting || confirmName !== organizationName}
            >
              {isSubmitting ? "Deleting…" : "Delete organization"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
