"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Checkbox, Field, Input } from "@cim/ui";
import { astToBooleanQuery, parseBooleanQuery, type QueryAst } from "@cim/core";

type Project = { id: string; name: string };

const SOURCE_CATEGORIES: { value: string; label: string }[] = [
  { value: "news", label: "News" },
  { value: "web", label: "Web" },
  { value: "social", label: "Social" },
  { value: "video", label: "Video" },
  { value: "podcast", label: "Podcast" },
  { value: "forums", label: "Forums" },
  { value: "comments", label: "Comments" },
];

type PreviewResult = {
  matchCount: number;
  windowDays: number;
  sample: { title: string; sourceName: string; publishedAt: string | null }[];
  warning: string | null;
};

function ChipInput({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const value = draft.trim();
    if (!value || values.includes(value)) return;
    onChange([...values, value]);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <div className="flex gap-2">
        <Input
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="secondary" onClick={add}>
          Add
        </Button>
      </div>
      {values.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {values.map((value) => (
            <li
              key={value}
              className="flex items-center gap-2 rounded-sm bg-secondary px-2.5 py-1 text-sm text-secondary-foreground"
            >
              {value}
              <button
                type="button"
                onClick={() => onChange(values.filter((v) => v !== value))}
                aria-label={`Remove ${value}`}
                className="text-muted-foreground hover:text-foreground"
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function QueryBuilderForm({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<"simple" | "advanced">("simple");
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [include, setInclude] = useState<string[]>([]);
  const [exclude, setExclude] = useState<string[]>([]);
  const [exactPhrases, setExactPhrases] = useState<string[]>([]);
  const [advancedText, setAdvancedText] = useState("");
  const [sourceCategories, setSourceCategories] = useState<string[]>(["news", "web"]);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentAst: QueryAst = useMemo(
    () => (mode === "simple" ? { include, exclude, exactPhrases } : parseBooleanQuery(advancedText)),
    [mode, include, exclude, exactPhrases, advancedText],
  );

  function switchMode(next: "simple" | "advanced") {
    if (next === "advanced") {
      setAdvancedText(astToBooleanQuery({ include, exclude, exactPhrases }));
    } else {
      const parsed = parseBooleanQuery(advancedText);
      setInclude(parsed.include);
      setExclude(parsed.exclude);
      setExactPhrases(parsed.exactPhrases);
    }
    setMode(next);
  }

  function toggleSourceCategory(value: string) {
    setSourceCategories((current) =>
      current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
    );
  }

  async function handlePreview() {
    setIsPreviewing(true);
    try {
      const response = await fetch("/api/monitoring/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currentAst),
      });
      if (response.ok) setPreview(await response.json());
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handleSave() {
    setError(null);
    if (!projectId) {
      setError("No project available — complete onboarding first.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/monitoring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: name || currentAst.include[0] || currentAst.exactPhrases[0] || "Untitled monitoring",
          include: currentAst.include,
          exclude: currentAst.exclude,
          exactPhrases: currentAst.exactPhrases,
          sourceTypes: sourceCategories,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      router.push("/monitoring");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Field id="name" label="Name" required>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Brand monitoring" />
      </Field>

      {projects.length > 1 ? (
        <Field id="project" label="Project" required>
          <select
            id="project"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="h-9 rounded border border-border bg-surface px-3 text-sm text-foreground"
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === "simple" ? "primary" : "secondary"}
            onClick={() => switchMode("simple")}
          >
            Simple
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "advanced" ? "primary" : "secondary"}
            onClick={() => switchMode("advanced")}
          >
            Advanced
          </Button>
        </div>

        {mode === "simple" ? (
          <div className="flex flex-col gap-4">
            <ChipInput label="Include" values={include} onChange={setInclude} placeholder="e.g. your brand name" />
            <ChipInput label="Exclude" values={exclude} onChange={setExclude} placeholder="e.g. job posting" />
            <ChipInput
              label="Exact phrase"
              values={exactPhrases}
              onChange={setExactPhrases}
              placeholder='e.g. "full company name"'
            />
          </div>
        ) : (
          <Field
            id="advanced"
            label="Boolean query"
            hint='Supports AND, OR, NOT, and "exact phrases".'
          >
            <textarea
              id="advanced"
              value={advancedText}
              onChange={(e) => setAdvancedText(e.target.value)}
              rows={4}
              className="w-full rounded border border-border bg-surface px-3 py-2 font-mono text-sm text-foreground"
            />
          </Field>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">Sources</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SOURCE_CATEGORIES.map((category) => (
            <label key={category.value} className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox
                checked={sourceCategories.includes(category.value)}
                onCheckedChange={() => toggleSourceCategory(category.value)}
              />
              {category.label}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Preview results</span>
          <Button type="button" size="sm" variant="secondary" onClick={handlePreview} disabled={isPreviewing}>
            {isPreviewing ? "Checking…" : "Preview"}
          </Button>
        </div>
        {preview ? (
          <div className="flex flex-col gap-2 text-sm">
            <p className="text-foreground">
              Your query matched {preview.matchCount} result{preview.matchCount === 1 ? "" : "s"} from the
              last {preview.windowDays} days.
            </p>
            {preview.warning ? <p className="text-warning">{preview.warning}</p> : null}
            {preview.sample.length > 0 ? (
              <ul className="flex flex-col gap-1 text-muted-foreground">
                {preview.sample.map((item, i) => (
                  <li key={i}>
                    {item.title} <span className="text-xs">— {item.sourceName}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            See how many recent articles this query would have matched before saving it.
          </p>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="button" onClick={handleSave} disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save monitoring"}
        </Button>
      </div>
    </div>
  );
}
