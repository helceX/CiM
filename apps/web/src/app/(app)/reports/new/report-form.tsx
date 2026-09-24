"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Checkbox, Field, Input, Select } from "@cim/ui";
import { REPORT_TEMPLATES, type ReportPeriodType, type ReportTemplateKey } from "@cim/reports/templates";
import { REPORT_SECTION_KEYS, REPORT_SECTION_LABELS, type ReportSectionKey } from "@cim/reports/sections";

type ProjectOption = { id: string; name: string };

const PERIOD_OPTIONS: { value: string; label: string }[] = [
  { value: "rolling_7d", label: "Last 7 days" },
  { value: "rolling_30d", label: "Last 30 days" },
];

export function ReportForm({ projects }: { projects: ProjectOption[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [templateKey, setTemplateKey] = useState<ReportTemplateKey>(REPORT_TEMPLATES[0]!.key);
  const [periodType, setPeriodType] = useState(REPORT_TEMPLATES[0]!.defaultPeriodType);
  const [sections, setSections] = useState<ReportSectionKey[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function selectTemplate(key: ReportTemplateKey) {
    setTemplateKey(key);
    const template = REPORT_TEMPLATES.find((t) => t.key === key);
    if (template) setPeriodType(template.defaultPeriodType);
  }

  function toggleSection(key: ReportSectionKey) {
    setSections((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );
  }

  function moveSection(index: number, direction: -1 | 1) {
    setSections((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  async function handleSave() {
    setError(null);
    if (!projectId) {
      setError("Select a project first.");
      return;
    }
    if (templateKey === "custom" && sections.length === 0) {
      setError("Choose at least one section.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: name || REPORT_TEMPLATES.find((t) => t.key === templateKey)?.name || "Report",
          templateKey,
          sections: templateKey === "custom" ? sections : undefined,
          periodType,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      router.push(`/reports/${data.reportId}`);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (projects.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Create a project first — reports are generated for a project&apos;s monitored mentions.
      </p>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-5">
      <Field id="name" label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q3 brand summary" />
      </Field>

      <Field id="project" label="Project" required>
        <Select id="project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </Select>
      </Field>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">Template</span>
        <div className="flex flex-col gap-2">
          {REPORT_TEMPLATES.map((template) => (
            <label
              key={template.key}
              className={`flex cursor-pointer items-start gap-3 rounded border px-3 py-2.5 ${
                templateKey === template.key ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <input
                type="radio"
                name="template"
                className="mt-1"
                checked={templateKey === template.key}
                onChange={() => selectTemplate(template.key)}
              />
              <span>
                <span className="block text-sm font-medium text-foreground">{template.name}</span>
                <span className="block text-sm text-muted-foreground">{template.description}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {templateKey === "custom" ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <div>
            <span className="text-sm font-medium text-foreground">Sections</span>
            <p className="text-xs text-muted-foreground">Choose sections, then reorder them below.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {REPORT_SECTION_KEYS.map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox checked={sections.includes(key)} onCheckedChange={() => toggleSection(key)} />
                {REPORT_SECTION_LABELS[key]}
              </label>
            ))}
          </div>
          {sections.length > 0 ? (
            <ol className="flex flex-col gap-1.5 border-t border-border pt-3">
              {sections.map((key, index) => (
                <li
                  key={key}
                  className="flex items-center justify-between gap-2 rounded-sm bg-secondary px-2.5 py-1.5 text-sm text-secondary-foreground"
                >
                  <span>
                    {index + 1}. {REPORT_SECTION_LABELS[key]}
                  </span>
                  <span className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => moveSection(index, -1)}
                      disabled={index === 0}
                      aria-label={`Move ${REPORT_SECTION_LABELS[key]} up`}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSection(index, 1)}
                      disabled={index === sections.length - 1}
                      aria-label={`Move ${REPORT_SECTION_LABELS[key]} down`}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      ↓
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}

      <Field id="period" label="Period">
        <Select
          id="period"
          value={periodType}
          onChange={(e) => setPeriodType(e.target.value as ReportPeriodType)}
        >
          {PERIOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="button" onClick={handleSave} disabled={isSubmitting}>
          {isSubmitting ? "Generating…" : "Generate report"}
        </Button>
      </div>
    </div>
  );
}
