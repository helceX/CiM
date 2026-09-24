"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@cim/ui";

/**
 * docs/product/FEATURE_MATRIX.md P2 "Slack/Teams/webhook channels" —
 * one HTTPS URL per organization; an alert rule opts in via its
 * "webhook" channel (apps/web/src/app/(app)/alerts/new/alert-rule-form.tsx).
 */
export function WebhookSection({
  webhookUrl,
  hasWebhookUrl,
  canManageSettings,
}: {
  // Null for a caller without canManageSettings — the page never sends
  // the real URL to the browser for a member who can't manage it (a
  // "use client" component's props all reach the RSC payload regardless
  // of what it renders, the same reasoning ApiKeysSection's own comment
  // documents in settings/page.tsx). hasWebhookUrl carries the one bit
  // that view still needs ("Configured" vs "Not configured").
  webhookUrl: string | null;
  hasWebhookUrl: boolean;
  canManageSettings: boolean;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground">Webhook</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        An HTTPS endpoint (a Slack or Teams incoming webhook works) that alert rules
        with the &quot;Webhook&quot; channel checked will POST to.
      </p>
      <div className="mt-3">
        {canManageSettings ? (
          <WebhookForm webhookUrl={webhookUrl} />
        ) : (
          <p className="text-sm text-foreground">
            {hasWebhookUrl ? "Configured" : "Not configured"}
          </p>
        )}
      </div>
    </section>
  );
}

function WebhookForm({ webhookUrl }: { webhookUrl: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(webhookUrl ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    setIsSaving(true);
    try {
      const response = await fetch("/api/organizations/webhook", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl: value }),
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
    <div className="flex max-w-md items-end gap-2">
      <Field
        id="webhook-url"
        label="Webhook URL"
        className="flex-1"
        error={error ?? undefined}
      >
        <Input
          type="url"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://hooks.slack.com/services/..."
        />
      </Field>
      <Button type="button" onClick={handleSave} disabled={isSaving}>
        {isSaving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
