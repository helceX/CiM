"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Checkbox, Field, Input, Select } from "@cim/ui";

type MonitoringQueryOption = {
  id: string;
  name: string;
  projectId: string;
  trackingTarget: string;
};

const TYPE_OPTIONS: { value: string; label: string; description: string }[] = [
  {
    value: "keyword",
    label: "Keyword",
    description: "Notify on every new mention for this query.",
  },
  {
    value: "high_relevance",
    label: "High relevance",
    description:
      "Notify only when a mention matches an exact phrase (a stronger match than a loose keyword).",
  },
  {
    value: "spike",
    label: "Spike",
    description:
      "Notify when this query's hourly mention volume jumps well above its trailing 24-hour baseline.",
  },
  {
    value: "sentiment_shift",
    label: "Sentiment shift",
    description:
      "Notify when the share of negative, AI-classified mentions over the last 24 hours jumps well above the trailing week's baseline.",
  },
  {
    value: "emerging_topic",
    label: "Emerging topic",
    description:
      "Notify when an AI-detected topic in this query's mentions surges well above its trailing week's baseline.",
  },
  {
    value: "competitor",
    label: "Competitor",
    description:
      "Notify when a query tagged \"Competitor\" gets more mentions in 24 hours than your tracked company queries in the same project.",
  },
];

export function AlertRuleForm({ queries }: { queries: MonitoringQueryOption[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [queryId, setQueryId] = useState(queries[0]?.id ?? "");
  const [type, setType] = useState("keyword");
  const [channels, setChannels] = useState<string[]>(["in_app"]);
  const [cooldownMinutes, setCooldownMinutes] = useState(60);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // A "competitor" rule only means something against a query tagged that
  // way (apps/web/src/app/api/alerts/route.ts enforces the same rule
  // server-side) — narrow the picker instead of letting the user hit a
  // 400 after filling out the rest of the form.
  const selectableQueries =
    type === "competitor" ? queries.filter((q) => q.trackingTarget === "competitor") : queries;

  function selectType(value: string) {
    setType(value);
    const nextOptions = value === "competitor" ? queries.filter((q) => q.trackingTarget === "competitor") : queries;
    if (!nextOptions.some((q) => q.id === queryId)) {
      setQueryId(nextOptions[0]?.id ?? "");
    }
  }

  const selectedQuery = useMemo(
    () => selectableQueries.find((q) => q.id === queryId),
    [selectableQueries, queryId],
  );
  const selectedType = TYPE_OPTIONS.find((t) => t.value === type);

  function toggleChannel(value: string) {
    setChannels((current) =>
      current.includes(value)
        ? current.filter((c) => c !== value)
        : [...current, value],
    );
  }

  async function handleSave() {
    setError(null);
    if (!selectedQuery) {
      setError("Select a monitoring query first.");
      return;
    }
    if (channels.length === 0) {
      setError("Choose at least one delivery channel.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedQuery.projectId,
          queryId: selectedQuery.id,
          name: name || `${selectedQuery.name} alert`,
          type,
          channels,
          cooldownMinutes,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      router.push("/alerts");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (queries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Create a monitoring query first — alerts are attached to what you&apos;re
        tracking.
      </p>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-5">
      <Field id="name" label="Name">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Critical brand alerts"
        />
      </Field>

      <Field id="query" label="Monitoring query" required>
        {selectableQueries.length > 0 ? (
          <Select id="query" value={queryId} onChange={(e) => setQueryId(e.target.value)}>
            {selectableQueries.map((query) => (
              <option key={query.id} value={query.id}>
                {query.name}
              </option>
            ))}
          </Select>
        ) : (
          <p className="text-sm text-muted-foreground">
            No query is tagged &quot;Competitor&quot; yet — tag one when creating a
            monitoring query, then come back here.
          </p>
        )}
      </Field>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">Alert type</span>
        <div className="flex flex-col gap-2">
          {TYPE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-3 rounded border px-3 py-2.5 ${
                type === option.value ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <input
                type="radio"
                name="alertType"
                className="mt-1"
                checked={type === option.value}
                onChange={() => selectType(option.value)}
              />
              <span>
                <span className="block text-sm font-medium text-foreground">
                  {option.label}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">Channels</span>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <Checkbox
            checked={channels.includes("in_app")}
            onCheckedChange={() => toggleChannel("in_app")}
          />
          In-app notification
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <Checkbox
            checked={channels.includes("email")}
            onCheckedChange={() => toggleChannel("email")}
          />
          Email
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <Checkbox
            checked={channels.includes("webhook")}
            onCheckedChange={() => toggleChannel("webhook")}
          />
          Webhook
        </label>
        {channels.includes("webhook") ? (
          <p className="text-xs text-muted-foreground">
            Sent to the webhook URL configured in Settings. If none is set, webhook
            delivery is silently skipped.
          </p>
        ) : null}
      </div>

      <Field
        id="cooldown"
        label="Cooldown"
        hint="Minimum time between notifications for this rule, to avoid alert fatigue."
      >
        <Input
          id="cooldown"
          type="number"
          min={5}
          max={1440}
          value={cooldownMinutes}
          onChange={(e) => setCooldownMinutes(Number(e.target.value))}
        />
      </Field>

      {selectedType?.value === "spike" ? (
        <p className="text-xs text-muted-foreground">
          Spike alerts are checked every minute against a transparent statistical
          baseline — see the alert&apos;s trigger summary for the exact numbers behind
          each notification.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="button" onClick={handleSave} disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save alert"}
        </Button>
      </div>
    </div>
  );
}
