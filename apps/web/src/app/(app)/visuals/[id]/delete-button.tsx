"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@cim/ui";

export function DeleteVisualButton({ id }: { id: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    setError(null);
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/visuals/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      router.push("/visuals");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  }

  if (!confirming) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setConfirming(true)}>
        Delete
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-foreground">Delete this visual?</span>
      <Button type="button" variant="danger" size="sm" onClick={handleDelete} disabled={isDeleting}>
        {isDeleting ? "Deleting…" : "Yes, delete"}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
